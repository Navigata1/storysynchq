"use client";

/**
 * The studio's tape deck.
 *
 * Everything audible in the studio goes through the shipped engine modules —
 * `DualBusAudioEngine` for playback + ducking, `NarrationRecorder` for the
 * mic. Nothing here re-implements them; this hook is the transport logic that
 * drives them and mirrors what the Player does, so the Stage sounds exactly
 * like the receiving room (design-direction §7). The bed plays the active
 * page's own mood (T24a, ./page-moods `effectiveMood`), and a page turn into
 * another mood crosses over with the engine's default crossfade, as a page
 * without its own `music.duration` does in the Player.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DualBusAudioEngine } from "@/lib/audio/engine";
import {
  NarrationRecorder,
  blobToDataUrl,
  pickRecordingMime,
  type MicPermissionError,
} from "@/lib/audio/recorder";
import type { MoodName } from "@/lib/audio/moods";
import { StudioCues } from "./cues";
import { effectiveMood } from "./page-moods";
import { autoPauseOf, type StudioState } from "./types";

export interface UseStudioAudioArgs {
  stateRef: { current: StudioState };
  activeIndexRef: { current: number };
  onSelectPage: (index: number) => void;
  onRecorded: (pageId: number, dataUrl: string, mimeType: string, duration: number) => void;
  /**
   * Which story is on the Stage: the Studio bumps it whenever the story is
   * replaced (Magic, an opened tape, a reply, Delete everything). A take
   * started on one story is never filed onto the next one's page of the same
   * id — it is dropped, and `onTakeDropped` says so.
   */
  storyGenerationRef?: { current: number };
  /**
   * "stopped": a take finished after its story was replaced. "starting": the
   * story changed (or the page went) while the microphone was still starting,
   * so the take was cancelled before a word was kept.
   */
  onTakeDropped?: (when: "starting" | "stopped") => void;
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
  /**
   * The mime type the recorder negotiated for the take now running (null when
   * none runs, or when the browser chose its own default). Read, never
   * assumed: the Voice card's codec line reports exactly this.
   */
  takeMime: string | null;
  /**
   * True from the moment a take is asked for (before the microphone
   * permission resolves) until it stops: anything that would change the page
   * under a take reads this, not `recording`, which turns true only once the
   * microphone is open.
   */
  takeLiveRef: { current: boolean };
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

/**
 * Read-only view of the Creator's bed for tests and the console, the same
 * trick as the Player's `__ssyncPlayer`: getters only, no story data, no
 * writes, nothing that leaves the device (PRIVACY.md §3).
 */
interface StudioHook {
  musicPlaying: () => boolean;
  moodName: () => MoodName | null;
  /** Seconds of the bed's last mood-to-mood crossfade; null before the first. */
  crossfadeSeconds: () => number | null;
}

type StudioHookWindow = Window & { __ssyncStudio?: StudioHook };

export function useStudioAudio({
  stateRef,
  activeIndexRef,
  onSelectPage,
  onRecorded,
  storyGenerationRef,
  onTakeDropped,
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
  /** The story generation a take started on (see `storyGenerationRef`). */
  const recordGenerationRef = useRef<number | null>(null);
  /** A take asked for, the microphone not yet open. */
  const startingRef = useRef(false);
  /** A take starting or running (see `takeLiveRef` above). */
  const takeLiveRef = useRef(false);
  const levelListeners = useRef(new Set<(level: number) => void>());

  const [playing, setPlaying] = useState(false);
  const [narrating, setNarrating] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingPageId, setRecordingPageId] = useState<number | null>(null);
  const [takeMime, setTakeMime] = useState<string | null>(null);
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

  /** Push the active page's mood + volumes + on/off into the engine from current state. */
  const syncMix = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const state = stateRef.current;
    engine.setNarrationVolume(state.narrationVolume);
    engine.setMusicVolume(state.musicVolume);
    const wanted = state.musicOn && musicActiveRef.current;
    // The shared mood vocabulary, by name — the same value that gets written to
    // this page's `page.music` and the same one the Player resolves. A bed
    // already playing crosses into it (the engine's default crossfade; the
    // same mood is no change at all).
    const page = state.manifest.pages[activeIndexRef.current];
    if (wanted) engine.startMusic(effectiveMood(state, page?.id));
    else if (engine.musicPlaying) engine.stopMusic();
  }, [activeIndexRef, stateRef]);

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
      // The page on the Stage now plays its own mood under its words.
      syncMix();

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
    [cancelSpeech, clearAdvance, getEngine, setDucking, speakPage, stateRef, stop, syncMix],
  );

  playIndexRef.current = playIndex;

  const play = useCallback(
    async (fromIndex?: number) => {
      // The microphone is open: the page's old voice, the browser voice or
      // the bed would land in the take. Every caller (Play, Listen, Space)
      // comes through here, so this is the one guard that covers them all.
      if (recorderRef.current?.isRecording) return;
      const index = fromIndex ?? activeIndexRef.current;
      await unlock();
      playingRef.current = true;
      setPlaying(true);
      musicActiveRef.current = true;
      // Turn to the page first, so the bed starts in that page's own mood
      // (T24a) rather than crossing over from the page that was showing.
      if (fromIndex !== undefined && fromIndex !== activeIndexRef.current) onSelectPage(fromIndex);
      syncMix();
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
      const generation = recordGenerationRef.current;
      try {
        const result = await recorder.stop();
        cues.recordStop();
        const dataUrl = await blobToDataUrl(result.blob);
        const exists = stateRef.current.manifest.pages.some((p) => p.id === pageId);
        // A story replaced mid-take has its own page 1, 2, 3…: the take was
        // told for the old one and is dropped, never filed on a stranger.
        const sameStory = !storyGenerationRef || generation === storyGenerationRef.current;
        if (pageId !== null && exists && sameStory) {
          onRecorded(pageId, dataUrl, result.mimeType, result.duration);
        } else if (pageId !== null && !sameStory) {
          onTakeDropped?.("stopped");
        }
      } catch {
        setMicError("unknown");
      } finally {
        recordPageIdRef.current = null;
        recordGenerationRef.current = null;
        takeLiveRef.current = false;
        setTakeMime(null);
        setRecording(false);
        setRecordingPageId(null);
        setRecordSeconds(0);
      }
      return;
    }
    // A second tap while the microphone is still starting is the same take.
    if (startingRef.current) return;

    // The page and the story the take belongs to are read at the TAP, before
    // the (possibly long) microphone permission wait, and checked after it.
    startingRef.current = true;
    takeLiveRef.current = true;
    const page = stateRef.current.manifest.pages[activeIndexRef.current];
    const generation = storyGenerationRef?.current ?? null;
    stop();
    try {
      await unlock();
      await recorder.start();
      const stillThere =
        page !== undefined && stateRef.current.manifest.pages.some((p) => p.id === page.id);
      const sameStory = !storyGenerationRef || generation === storyGenerationRef.current;
      if (!stillThere || !sameStory) {
        recorder.cancel();
        takeLiveRef.current = false;
        onTakeDropped?.("starting");
        return;
      }
      recordPageIdRef.current = page.id;
      recordGenerationRef.current = generation;
      setTakeMime(pickRecordingMime() ?? null);
      recStartRef.current = performance.now();
      setRecordSeconds(0);
      setMicError(null);
      setRecording(true);
      setRecordingPageId(page.id);
      void cues.unlock();
      cues.recordStart();
    } catch (err) {
      const code: MicPermissionError =
        err === "denied" || err === "unavailable" || err === "unknown"
          ? (err as MicPermissionError)
          : "unknown";
      recordPageIdRef.current = null;
      recordGenerationRef.current = null;
      takeLiveRef.current = false;
      setTakeMime(null);
      setMicError(code);
      setRecording(false);
      setRecordingPageId(null);
    } finally {
      startingRef.current = false;
    }
  }, [activeIndexRef, cues, onRecorded, onTakeDropped, stateRef, stop, storyGenerationRef, unlock]);

  const cancelRecording = useCallback(() => {
    recorderRef.current?.cancel();
    recordPageIdRef.current = null;
    recordGenerationRef.current = null;
    // A take still starting is caught by the story check after the permission.
    takeLiveRef.current = startingRef.current;
    setTakeMime(null);
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

  /* ------------------------------------------------ read-only engine view */

  useEffect(() => {
    const w = window as StudioHookWindow;
    w.__ssyncStudio = {
      musicPlaying: () => engineRef.current?.musicPlaying ?? false,
      moodName: () => engineRef.current?.moodName ?? null,
      crossfadeSeconds: () => engineRef.current?.lastCrossfadeSeconds ?? null,
    };
    return () => {
      delete w.__ssyncStudio;
    };
  }, []);

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
    takeMime,
    takeLiveRef,
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
