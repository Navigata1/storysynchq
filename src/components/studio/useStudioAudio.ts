"use client";

/**
 * The studio's tape deck.
 *
 * Everything audible in the studio goes through the shipped engine modules —
 * `DualBusAudioEngine` for playback + ducking, `NarrationRecorder` for the
 * mic. Nothing here re-implements them; this hook is the transport logic that
 * drives them and mirrors what the Player does, so the Stage sounds exactly
 * like the receiving room (design-direction §7).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DualBusAudioEngine } from "@/lib/audio/engine";
import { NarrationRecorder, blobToDataUrl, type MicPermissionError } from "@/lib/audio/recorder";
import { StudioCues } from "./cues";
import { autoPauseOf, type StudioState } from "./types";

export interface UseStudioAudioArgs {
  stateRef: { current: StudioState };
  activeIndexRef: { current: number };
  onSelectPage: (index: number) => void;
  onRecorded: (pageId: number, dataUrl: string, mimeType: string, duration: number) => void;
}

export interface StudioAudio {
  audioRef: { current: HTMLAudioElement | null };
  playing: boolean;
  narrating: boolean;
  recording: boolean;
  /** Seconds into the current narration clip. */
  position: number;
  /** Duration of the current narration clip (0 when the browser voice is reading). */
  clipDuration: number;
  recordSeconds: number;
  /**
   * 0..1 activity level for the VU meter, delivered by subscription rather than
   * as state: at 15 fps a `level` prop would re-render the whole studio (and
   * re-serialize a multi-megabyte manifest) fifteen times a second. Only the
   * meter itself listens. Returns an unsubscribe function.
   */
  subscribeLevel: (listener: (level: number) => void) => () => void;
  /** The page id a take is being recorded onto, captured at record START. */
  recordingPageId: number | null;
  micError: MicPermissionError | null;
  clearMicError: () => void;
  unlock: () => Promise<void>;
  play: (fromIndex?: number) => Promise<void>;
  stop: () => void;
  toggleRecord: () => Promise<void>;
  cancelRecording: () => void;
  /** Music bed follows playback, and the Music tool panel while it is open. */
  setMusicActive: (active: boolean) => void;
  syncMix: () => void;
  /** Short synthesized confirmations (page turn, record start/stop). */
  cues: StudioCues;
}

const LEVEL_FPS_MS = 66;

export function useStudioAudio({
  stateRef,
  activeIndexRef,
  onSelectPage,
  onRecorded,
}: UseStudioAudioArgs): StudioAudio {
  const engineRef = useRef<DualBusAudioEngine | null>(null);
  const recorderRef = useRef<NarrationRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const attachedRef = useRef(false);
  const advanceRef = useRef<number | null>(null);
  const playingRef = useRef(false);
  const musicActiveRef = useRef(false);
  const recStartRef = useRef(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const lastSrcRef = useRef<string | null>(null);
  /** The page a take belongs to — read at START, never at stop. */
  const recordPageIdRef = useRef<number | null>(null);
  const levelListeners = useRef(new Set<(level: number) => void>());

  const [playing, setPlaying] = useState(false);
  const [narrating, setNarrating] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingPageId, setRecordingPageId] = useState<number | null>(null);
  const [position, setPosition] = useState(0);
  const [clipDuration, setClipDuration] = useState(0);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [micError, setMicError] = useState<MicPermissionError | null>(null);

  const cues = useMemo(() => new StudioCues(), []);

  const emitLevel = useCallback((value: number) => {
    for (const listener of levelListeners.current) listener(value);
  }, []);

  const subscribeLevel = useCallback((listener: (level: number) => void) => {
    levelListeners.current.add(listener);
    return () => {
      levelListeners.current.delete(listener);
    };
  }, []);

  /* ------------------------------------------------------------- engine */

  const getEngine = useCallback((): DualBusAudioEngine => {
    if (!engineRef.current) engineRef.current = new DualBusAudioEngine();
    return engineRef.current;
  }, []);

  const unlock = useCallback(async () => {
    try {
      await getEngine().unlock();
    } catch {
      /* retried on the next gesture */
    }
  }, [getEngine]);

  /** Push mood + volumes + on/off into the engine from current state. */
  const syncMix = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const state = stateRef.current;
    engine.setNarrationVolume(state.narrationVolume);
    engine.setMusicVolume(state.musicVolume);
    const wanted = state.musicOn && musicActiveRef.current;
    // The shared mood vocabulary, by name — the same value that gets written to
    // `page.music` and the same one the Player resolves.
    if (wanted) engine.startMusic(state.mood);
    else if (engine.musicPlaying) engine.stopMusic();
  }, [stateRef]);

  const setMusicActive = useCallback(
    (active: boolean) => {
      musicActiveRef.current = active;
      if (active) getEngine();
      syncMix();
    },
    [getEngine, syncMix],
  );

  const setDucking = useCallback(
    (active: boolean) => {
      setNarrating(active);
      engineRef.current?.setNarrating(active);
    },
    [],
  );

  /* ---------------------------------------------------------- transport */

  const clearAdvance = useCallback(() => {
    if (advanceRef.current !== null) {
      window.clearTimeout(advanceRef.current);
      advanceRef.current = null;
    }
  }, []);

  const cancelSpeech = useCallback(() => {
    utteranceRef.current = null;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* not supported */
    }
  }, []);

  const stop = useCallback(() => {
    playingRef.current = false;
    clearAdvance();
    cancelSpeech();
    const el = audioRef.current;
    if (el) {
      try {
        el.pause();
      } catch {
        /* ignore */
      }
    }
    setDucking(false);
    setPlaying(false);
    setPosition(0);
    musicActiveRef.current = false;
    syncMix();
  }, [cancelSpeech, clearAdvance, setDucking, syncMix]);

  /** Runs at the end of a page: hold the timing pause, then turn the page. */
  const finishPage = useCallback(
    (index: number) => {
      setDucking(false);
      if (!playingRef.current) return;
      const state = stateRef.current;
      const page = state.manifest.pages[index];
      const multiplier = state.manifest.settings?.accessibility?.timingMultiplier ?? 1;
      const pause = page ? autoPauseOf(page) * (multiplier || 1) : 0;
      clearAdvance();
      advanceRef.current = window.setTimeout(() => {
        advanceRef.current = null;
        if (!playingRef.current) return;
        const next = index + 1;
        if (next >= stateRef.current.manifest.pages.length) {
          stop();
          return;
        }
        onSelectPage(next);
        void playIndexRef.current?.(next);
      }, Math.max(0, pause * 1000));
    },
    [clearAdvance, onSelectPage, setDucking, stateRef, stop],
  );

  // Indirection so playIndex can recurse through finishPage without a cycle.
  const playIndexRef = useRef<((index: number) => Promise<void>) | null>(null);

  const speakPage = useCallback(
    (index: number, text: string) => {
      // A failed <audio>.play() fires BOTH a rejected promise and an `error`
      // event, and the error handler has already scheduled the auto-advance.
      // Left alone, that stale timer turns the page out from under the browser
      // voice we are about to start. Kill it first, every time.
      clearAdvance();
      const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
      if (!synth || typeof SpeechSynthesisUtterance === "undefined" || !text.trim()) {
        finishPage(index);
        return;
      }
      try {
        synth.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.92;
        utterance.pitch = 1.05;
        utterance.onend = () => {
          if (utteranceRef.current !== utterance) return;
          utteranceRef.current = null;
          finishPage(index);
        };
        utterance.onerror = () => {
          if (utteranceRef.current !== utterance) return;
          utteranceRef.current = null;
          finishPage(index);
        };
        utteranceRef.current = utterance;
        setDucking(true);
        setClipDuration(0);
        synth.speak(utterance);
      } catch {
        finishPage(index);
      }
    },
    [clearAdvance, finishPage, setDucking],
  );

  const playIndex = useCallback(
    async (index: number) => {
      const state = stateRef.current;
      const page = state.manifest.pages[index];
      if (!page) {
        stop();
        return;
      }
      clearAdvance();
      cancelSpeech();

      const audioUrl = page.text?.audioUrl;
      const el = audioRef.current;
      if (audioUrl && el) {
        if (!attachedRef.current) {
          getEngine().attachNarrationElement(el);
          attachedRef.current = true;
        }
        try {
          if (lastSrcRef.current !== audioUrl) {
            el.src = audioUrl;
            lastSrcRef.current = audioUrl;
          }
          el.currentTime = 0;
          setDucking(true);
          await el.play();
          return;
        } catch {
          setDucking(false);
          // Fall through to the browser voice so the page is never silent.
        }
      }
      speakPage(index, page.text?.content ?? "");
    },
    [cancelSpeech, clearAdvance, getEngine, setDucking, speakPage, stateRef, stop],
  );

  playIndexRef.current = playIndex;

  const play = useCallback(
    async (fromIndex?: number) => {
      const index = fromIndex ?? activeIndexRef.current;
      await unlock();
      playingRef.current = true;
      setPlaying(true);
      musicActiveRef.current = true;
      syncMix();
      if (fromIndex !== undefined && fromIndex !== activeIndexRef.current) onSelectPage(fromIndex);
      await playIndex(index);
    },
    [activeIndexRef, onSelectPage, playIndex, syncMix, unlock],
  );

  /* --------------------------------------------------- <audio> listeners */

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    let ticking = 0;
    const onTime = () => {
      const now = performance.now();
      if (now - ticking < 200) return;
      ticking = now;
      setPosition(el.currentTime);
    };
    const onMeta = () => setClipDuration(Number.isFinite(el.duration) ? el.duration : 0);
    const onEnded = () => {
      setPosition(0);
      finishPage(activeIndexRef.current);
    };
    const onError = () => {
      setDucking(false);
      finishPage(activeIndexRef.current);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
    };
  }, [activeIndexRef, finishPage, setDucking]);

  /* ------------------------------------------------------------ recorder */

  const toggleRecord = useCallback(async () => {
    const recorder = recorderRef.current ?? (recorderRef.current = new NarrationRecorder());
    if (recorder.isRecording) {
      // The take belongs to the page that was on the Stage when the child
      // started talking. Reading the active page at STOP attributed a take to
      // whatever page happened to be selected by then.
      const pageId = recordPageIdRef.current;
      try {
        const result = await recorder.stop();
        cues.recordStop();
        const dataUrl = await blobToDataUrl(result.blob);
        const exists = stateRef.current.manifest.pages.some((p) => p.id === pageId);
        if (pageId !== null && exists) {
          onRecorded(pageId, dataUrl, result.mimeType, result.duration);
        }
      } catch {
        setMicError("unknown");
      } finally {
        recordPageIdRef.current = null;
        setRecording(false);
        setRecordingPageId(null);
        setRecordSeconds(0);
      }
      return;
    }

    stop();
    await unlock();
    const page = stateRef.current.manifest.pages[activeIndexRef.current];
    try {
      await recorder.start();
      recordPageIdRef.current = page?.id ?? null;
      recStartRef.current = performance.now();
      setRecordSeconds(0);
      setMicError(null);
      setRecording(true);
      setRecordingPageId(page?.id ?? null);
      void cues.unlock();
      cues.recordStart();
    } catch (err) {
      const code: MicPermissionError =
        err === "denied" || err === "unavailable" || err === "unknown"
          ? (err as MicPermissionError)
          : "unknown";
      recordPageIdRef.current = null;
      setMicError(code);
      setRecording(false);
      setRecordingPageId(null);
    }
  }, [activeIndexRef, cues, onRecorded, stateRef, stop, unlock]);

  const cancelRecording = useCallback(() => {
    recorderRef.current?.cancel();
    recordPageIdRef.current = null;
    setRecording(false);
    setRecordingPageId(null);
    setRecordSeconds(0);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      setRecordSeconds((performance.now() - recStartRef.current) / 1000);
    }, 200);
    return () => window.clearInterval(id);
  }, [recording]);

  /* --------------------------------------------------------- level meter */

  useEffect(() => {
    const active = recording || narrating;
    if (!active) {
      emitLevel(0);
      return;
    }
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      emitLevel(recording ? 0.62 : 0.5);
      return;
    }
    let raf = 0;
    let last = 0;
    const base = recording ? 0.6 : 0.46;
    const tick = (t: number) => {
      raf = window.requestAnimationFrame(tick);
      if (t - last < LEVEL_FPS_MS) return;
      last = t;
      // Activity envelope, not a calibrated meter — the engine exposes no
      // analyser tap and we will not open a second mic stream to fake one.
      const wobble =
        0.5 + 0.32 * Math.sin(t / 190) + 0.18 * Math.sin(t / 71) + 0.1 * Math.sin(t / 37);
      emitLevel(Math.max(0, Math.min(1, base * wobble + base * 0.35)));
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [emitLevel, narrating, recording]);

  /* ------------------------------------------------------------- cleanup */

  useEffect(() => {
    return () => {
      if (advanceRef.current !== null) window.clearTimeout(advanceRef.current);
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
      recorderRef.current?.cancel();
      engineRef.current?.dispose();
      engineRef.current = null;
      cues.dispose();
    };
  }, [cues]);

  return {
    audioRef,
    playing,
    narrating,
    recording,
    recordingPageId,
    position,
    clipDuration,
    recordSeconds,
    subscribeLevel,
    micError,
    clearMicError: () => setMicError(null),
    unlock,
    play,
    stop,
    toggleRecord,
    cancelRecording,
    setMusicActive,
    syncMix,
    cues,
  };
}
