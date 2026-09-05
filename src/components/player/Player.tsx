"use client";

/**
 * Player — the cassette-book reader (docs/design-direction.md §6).
 *
 * A story arrives as an SsyncManifest and is played back full-bleed: cover gate
 * → page after page of picture + serif text, narrated by the recorded voice on
 * the manifest (or browser TTS with a word-level read-along), over a generative
 * music bed that ducks -12 dB underneath — all on the proven
 * DualBusAudioEngine.
 *
 * The room, not a rectangle (10x-plan G3): the page illustration is blurred and
 * scaled behind the composition with a vignette over it, so a 4:3 drawing on a
 * 21:9 monitor sits in warm light instead of dead black, and the light drifts
 * (Ken-Burns) unless the reader asked for reduced motion.
 *
 * Rules this file exists to honour:
 *   1. The tap on "Tap to Begin" is the iOS audio unlock. Nothing plays before.
 *   2. The manifest is the source of truth. v1 documents play; unknown fields
 *      are ignored; missing pieces degrade instead of throwing.
 *   3. `page.music` decides the melody through @/lib/audio/moods — and when a
 *      page names no music, the room is SILENT. Never a default bed.
 *   4. Nothing leaves the device. No network, no analytics, no trackers.
 */

import * as React from "react";
import QRCode from "qrcode";
import type { SsyncManifest, SsyncPage } from "@/lib/storysync/manifest";
import { DualBusAudioEngine } from "@/lib/audio/engine";
import { resolveMood, type MoodName } from "@/lib/audio/moods";
import { BigButton, GlassPanel, Reel, TapeLabel, TransportButton } from "@/components/studio-kit/kit";
import { estimateSeconds, formatClock, parseDuration, splitWords, wordIndexAtTime } from "./timing";
import { openCueContext, playPageTurnCue } from "./sound";
import "./player.css";

/* ────────────────────────────────────────────────────────────── constants */

/** Beat of silence before a page starts speaking — also dodges Chrome's
 *  cancel()-then-speak() race, which silently drops the utterance. */
const START_DELAY_MS = 700;
const RESUME_DELAY_MS = 120;
const TURN_OUT_MS = 240;
const TURN_IN_MS = 460;
const UI_IDLE_MS = 4200;
const MUSIC_VOLUME = 0.35;
const PREFS_KEY = "ssync-reader-prefs";

type Speed = "slow" | "normal" | "fast";

interface Prefs {
  speed: Speed;
  /** Multiplier on every between-page pause. */
  timing: number;
  /** Multiplier on story text size. */
  fontScale: number;
  dyslexia: boolean;
  contrast: boolean;
}

const DEFAULT_PREFS: Prefs = {
  speed: "normal",
  timing: 1,
  fontScale: 1,
  dyslexia: false,
  contrast: false,
};

const SPEED_PAUSE: Record<Speed, number> = { slow: 1.5, normal: 1, fast: 0.6 };
const SPEED_RATE: Record<Speed, number> = { slow: 0.7, normal: 0.85, fast: 1.1 };

/* ────────────────────────────────────────────────────────────────── utils */

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

interface LooseTrack {
  id?: string;
  mood?: string;
  prompt?: string;
}

/**
 * Every string this page offers as a name for its music, most specific first.
 *
 * SSYNC v2 pages carry `music: "Wonder"`; v1 pages carry a *track id* into a
 * top-level `music.tracks` table (`music: "peaceful"` → that track's mood or
 * prompt); a page may also carry `music: { crossfade: "adventure" }`.
 * An empty list means the page asked for no music at all.
 */
function moodTokens(manifest: SsyncManifest, page: SsyncPage | undefined): string[] {
  const raw = page?.music;
  const tokens: string[] = [];
  if (typeof raw === "string") {
    if (raw.trim()) tokens.push(raw);
  } else if (raw && typeof raw === "object") {
    const crossfade = (raw as { crossfade?: unknown }).crossfade;
    if (typeof crossfade === "string" && crossfade.trim()) tokens.push(crossfade);
  }
  if (tokens.length === 0) return [];

  const tracks = (manifest as { music?: { tracks?: LooseTrack[] } }).music?.tracks;
  if (Array.isArray(tracks)) {
    for (const id of [...tokens]) {
      const track = tracks.find((t) => t?.id === id);
      if (track?.mood) tokens.push(track.mood);
      if (track?.prompt) tokens.push(track.prompt);
    }
  }
  return tokens;
}

/**
 * The page's mood, or null for silence.
 *
 * One vocabulary for the whole product (@/lib/audio/moods): the Studio writes
 * it, the Player plays it, and neither invents a bed the other does not know.
 */
function pageMood(manifest: SsyncManifest, page: SsyncPage | undefined): MoodName | null {
  for (const token of moodTokens(manifest, page)) {
    const mood = resolveMood(token);
    if (mood) return mood;
  }
  return null;
}

function sanitizePrefs(raw: unknown): Partial<Prefs> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<Prefs> = {};
  if (r.speed === "slow" || r.speed === "normal" || r.speed === "fast") out.speed = r.speed;
  if (typeof r.timing === "number" && Number.isFinite(r.timing)) {
    out.timing = Math.min(3, Math.max(0.5, r.timing));
  }
  if (typeof r.fontScale === "number" && Number.isFinite(r.fontScale)) {
    out.fontScale = Math.min(2, Math.max(0.8, r.fontScale));
  }
  if (typeof r.dyslexia === "boolean") out.dyslexia = r.dyslexia;
  if (typeof r.contrast === "boolean") out.contrast = r.contrast;
  return out;
}

/**
 * Read-only view of the live engine for tests and console diagnostics — the
 * same trick `src/lib/audio/music.ts` already uses. Getters only: no story
 * data, no writes, nothing that leaves the device (PRIVACY.md §3).
 */
interface PlayerHook {
  musicPlaying: () => boolean;
  moodName: () => MoodName | null;
  narrationDuration: () => number | null;
  narrationTime: () => number | null;
}

type HookWindow = Window & { __ssyncPlayer?: PlayerHook };

/* ─────────────────────────────────────────────────────────── small pieces */

function StoryText({
  content,
  highlight,
  scale,
}: {
  content: string;
  highlight: number;
  scale: number;
}) {
  const words = React.useMemo(() => splitWords(content), [content]);
  return (
    <p
      className="pl-prose"
      data-pl="prose"
      style={{ fontSize: `calc(clamp(1.1rem, 0.92rem + 1.05vw, 1.9rem) * ${scale})` }}
    >
      {words.map((word, i) => (
        <span
          key={`${i}-${word.start}`}
          data-pl="word"
          className={cx(
            "pl-word",
            highlight >= 0 && i < highlight && "is-past",
            highlight >= 0 && i === highlight && "is-now",
            highlight >= 0 && i > highlight && "is-future",
          )}
        >
          {word.text}{" "}
        </span>
      ))}
    </p>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <div className="pl-sheet-label mb-2">{label}</div>
      <div className="pl-seg" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            onClick={() => onChange(option.value)}
            className="pl-seg-btn sk-focus"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="pl-switch sk-focus"
    >
      <span>
        <span className="block font-semibold">{label}</span>
        {hint ? <span className="block text-[12px] text-white/45">{hint}</span> : null}
      </span>
      <span className="pl-switch-track" aria-hidden="true">
        <span className="pl-switch-knob" />
      </span>
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────── Player */

export interface PlayerProps {
  manifest: SsyncManifest;
  /** Leave the story (Escape, ⏏). Omit to hide the exit control. */
  onExit?: () => void;
  /** The loop that justifies the protocol: receive → create. */
  onMakeYourOwn?: () => void;
  /**
   * The link this story lives at, when it has one (`/read?story=…`). Drawn as
   * a QR on the end card so the tape can jump from a laptop to a grandparent's
   * phone without anyone typing a code.
   */
  shareUrl?: string;
}

export function Player({ manifest, onExit, onMakeYourOwn, shareUrl }: PlayerProps) {
  const pages = manifest.pages;
  const total = pages.length;

  const [started, setStarted] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  const [turn, setTurn] = React.useState<{ phase: "idle" | "out" | "in"; dir: "next" | "prev" }>({
    phase: "idle",
    dir: "next",
  });
  const [paused, setPaused] = React.useState(false);
  const [narrating, setNarrating] = React.useState(false);
  const [highlight, setHighlight] = React.useState(-1);
  const [ended, setEnded] = React.useState(false);
  const [showUi, setShowUi] = React.useState(true);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [musicOn, setMusicOn] = React.useState(true);
  /** What the ENGINE is actually doing — not what the UI intends. */
  const [musicLive, setMusicLive] = React.useState(false);
  /** False once this browser has proved it has no working Web Audio. */
  const [audioOk, setAudioOk] = React.useState(true);
  const [prefs, setPrefs] = React.useState<Prefs>(DEFAULT_PREFS);
  const [reduced, setReduced] = React.useState(false);
  const [cuesFired, setCuesFired] = React.useState(0);
  const [qr, setQr] = React.useState<string | null>(null);
  /** Backdrop crossfade: the picture coming in, and the one fading out. */
  const [bg, setBg] = React.useState<{ cur?: string; prev?: string; n: number }>({ n: 0 });

  const engineRef = React.useRef<DualBusAudioEngine | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const cueCtxRef = React.useRef<AudioContext | null>(null);
  const autoTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const uiTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const turnTimersRef = React.useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const loadedKeyRef = React.useRef<string>("");
  const attachedRef = React.useRef(false);
  const audioOkRef = React.useRef(true);
  const goToRef = React.useRef<(dir: "next" | "prev") => void>(() => {});
  /* The page a turn is heading for. Rapid presses inside the turn animation
     advance from HERE, not from the stale rendered index — a child mashing
     "next" (or anyone holding →) must never see the page freeze. */
  const targetRef = React.useRef(0);
  const timingRef = React.useRef(1);
  const reducedRef = React.useRef(false);

  const page: SsyncPage | undefined = pages[index];
  const mood = React.useMemo(() => pageMood(manifest, page), [manifest, page]);
  const highlightOn = manifest.settings?.readAlongHighlight !== false;
  const autoPlay = manifest.settings?.autoPlay !== false;
  const cueOn = manifest.settings?.pageTurnSound !== false;
  const baseTiming = manifest.settings?.accessibility?.timingMultiplier ?? 1;
  const defaultPauseMs = parseDuration(manifest.settings?.accessibility?.pauseBetweenPages, 3000);
  const timingMult = baseTiming * prefs.timing * SPEED_PAUSE[prefs.speed];
  const ttsRate = SPEED_RATE[prefs.speed];
  const runtime = React.useMemo(
    () => formatClock(estimateSeconds(manifest.pages, defaultPauseMs)),
    [manifest, defaultPauseMs],
  );

  /* keep the refs the timers read in sync (declared first — effects run in
     source order, so everything below sees fresh values) */
  React.useEffect(() => {
    timingRef.current = timingMult;
  }, [timingMult]);
  React.useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  const getEngine = React.useCallback((): DualBusAudioEngine => {
    if (!engineRef.current) engineRef.current = new DualBusAudioEngine();
    return engineRef.current;
  }, []);

  /**
   * Sound is the magic of this product; it is never the gate to the story.
   *
   * Some browsers have no working Web Audio at all — Firefox with
   * `dom.webaudio.enabled=false`, hardened WebViews, or any document that has
   * hit Chrome's per-document hardware-context cap. `new AudioContext()` then
   * throws, and every engine call that lazily builds the context throws with
   * it (`DualBusAudioEngine.ensureContext`). If that reached a click handler or
   * a React effect the reader would be stranded on the cover gate forever —
   * which is exactly the failure rule 2 of this file forbids. So every engine
   * call goes through here: it is attempted once, and the first failure latches
   * the room into "silent tape" mode. The pages still turn, the words still
   * light, the story still ends on its end card.
   */
  const markAudioDown = React.useCallback(() => {
    if (!audioOkRef.current) return;
    audioOkRef.current = false;
    setAudioOk(false);
  }, []);

  /** Runs `fn` against the engine. Returns false when audio is unavailable. */
  const withEngine = React.useCallback(
    (fn: (engine: DualBusAudioEngine) => void): boolean => {
      if (!audioOkRef.current) return false;
      try {
        fn(getEngine());
        return true;
      } catch {
        markAudioDown();
        return false;
      }
    },
    [getEngine, markAudioDown],
  );

  /**
   * The iOS unlock, re-armed on every gesture. `unlock()` is async, so a
   * missing AudioContext surfaces as a rejected promise rather than a throw —
   * both are caught here, because an unhandled rejection is still a broken
   * page as far as a listener (and a critic) is concerned.
   */
  const unlockAudio = React.useCallback(() => {
    if (!audioOkRef.current) return;
    try {
      getEngine()
        .unlock()
        .catch(() => markAudioDown());
    } catch {
      markAudioDown();
    }
  }, [getEngine, markAudioDown]);

  /* ── reduced motion ─────────────────────────────────────────────────── */
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /* ── reading preferences live on the device only (COPPA: no trackers) ── */
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (raw) setPrefs((p) => ({ ...p, ...sanitizePrefs(JSON.parse(raw)) }));
    } catch {
      /* private mode / quota — defaults are fine */
    }
  }, []);
  React.useEffect(() => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  /* ── read-only engine view for tests and the console ────────────────── */
  React.useEffect(() => {
    const w = window as HookWindow;
    w.__ssyncPlayer = {
      musicPlaying: () => engineRef.current?.musicPlaying ?? false,
      moodName: () => engineRef.current?.moodName ?? null,
      narrationDuration: () => {
        const d = audioRef.current?.duration;
        return typeof d === "number" && Number.isFinite(d) ? d : null;
      },
      narrationTime: () => audioRef.current?.currentTime ?? null,
    };
    return () => {
      delete w.__ssyncPlayer;
    };
  }, []);

  /* ── teardown ───────────────────────────────────────────────────────── */
  React.useEffect(() => {
    const el = audioRef.current; // captured at mount: the element never swaps
    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
      turnTimersRef.current.forEach((t) => clearTimeout(t));
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
      if (el) {
        el.pause();
        el.onplay = null;
        el.onended = null;
        el.onerror = null;
      }
      cueCtxRef.current?.close().catch(() => {});
      cueCtxRef.current = null;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  /* ── the ambient backdrop follows the picture, and outlives it ───────── */
  const image = page?.illustration?.url;
  React.useEffect(() => {
    // A text-only page keeps the last picture's light rather than falling into
    // dead black — the room does not empty just because a page has no art.
    if (!image) return;
    setBg((b) => (b.cur === image ? b : { cur: image, prev: b.cur, n: b.n + 1 }));
  }, [image]);

  /* ── the tap that unlocks everything (iOS rule, non-negotiable) ──────── */
  const begin = React.useCallback(() => {
    // Every audio step below is optional. The two setState calls at the end are
    // not: this tap opens the story, with sound or without it.
    unlockAudio();
    const el = audioRef.current;
    if (el && !attachedRef.current) {
      if (withEngine((engine) => engine.attachNarrationElement(el))) attachedRef.current = true;
    }
    if (!cueCtxRef.current) cueCtxRef.current = openCueContext();
    setStarted(true);
    setShowUi(true);
  }, [unlockAudio, withEngine]);

  /* ── music bed: page.music decides, and "no music" means silence ─────── */
  React.useEffect(() => {
    if (!started) {
      setMusicLive(false);
      return;
    }
    withEngine((engine) => {
      if (musicOn && mood) {
        engine.setMusicVolume(MUSIC_VOLUME);
        // startMusic() crossfades when a bed is already running (engine.ts).
        engine.startMusic(mood);
      } else if (engine.musicPlaying) {
        engine.stopMusic();
      }
    });
    // `data-music` is read back off the engine's own getter, never from the
    // UI's intent — so the attribute cannot claim a bed the room isn't playing.
    setMusicLive(engineRef.current?.musicPlaying === true);
  }, [started, musicOn, mood, withEngine]);

  /* ── navigation ─────────────────────────────────────────────────────── */
  const stopNarration = React.useCallback(() => {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = undefined;
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    const el = audioRef.current;
    if (el) el.pause();
    setNarrating(false);
    setHighlight(-1);
    engineRef.current?.setNarrating(false);
  }, []);

  const fireCue = React.useCallback(() => {
    if (!cueOn) return;
    if (playPageTurnCue(cueCtxRef.current)) setCuesFired((n) => n + 1);
  }, [cueOn]);

  const goTo = React.useCallback(
    (dir: "next" | "prev") => {
      // The last page turns into the end card — never into nothing. This is the
      // one path that must not depend on narration ever firing an event.
      const cur = targetRef.current;
      if (dir === "next" && cur >= total - 1) {
        stopNarration();
        fireCue();
        setEnded(true);
        setShowUi(true);
        return;
      }

      const next = Math.min(total - 1, Math.max(0, cur + (dir === "next" ? 1 : -1)));
      if (next === cur) return;
      targetRef.current = next;

      stopNarration();
      unlockAudio(); // a gesture is a good moment to re-arm iOS
      fireCue();
      setEnded(false);
      setShowUi(true);

      turnTimersRef.current.forEach((t) => clearTimeout(t));
      turnTimersRef.current = [];

      if (reducedRef.current) {
        setIndex(next);
        setTurn({ phase: "idle", dir });
        return;
      }
      setTurn({ phase: "out", dir });
      turnTimersRef.current.push(
        setTimeout(() => {
          setIndex(next);
          setTurn({ phase: "in", dir });
        }, TURN_OUT_MS),
        setTimeout(
          () => setTurn((t) => (t.phase === "in" ? { phase: "idle", dir: t.dir } : t)),
          TURN_OUT_MS + TURN_IN_MS,
        ),
      );
    },
    [total, fireCue, stopNarration, unlockAudio],
  );

  React.useEffect(() => {
    goToRef.current = goTo;
  }, [goTo]);
  React.useEffect(() => {
    targetRef.current = index;
  }, [index]);

  const replay = React.useCallback(() => {
    stopNarration();
    setEnded(false);
    setPaused(false);
    setIndex(0);
    setTurn({ phase: "idle", dir: "next" });
    setShowUi(true);
  }, [stopNarration]);

  const togglePlay = React.useCallback(() => {
    unlockAudio();
    setEnded(false);
    setShowUi(true);
    setPaused((p) => !p);
  }, [unlockAudio]);

  /* ── narration: recorded voice first, TTS second, silence last ───────── */
  React.useEffect(() => {
    if (!started || paused || ended) return;
    const current = pages[index];
    if (!current) return;

    const engine = engineRef.current;
    const el = audioRef.current;
    let cancelled = false;

    const clearAuto = () => {
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = undefined;
      }
    };

    /** Narration finished → hold for the page's pause, then turn the page. */
    const finish = () => {
      if (cancelled) return;
      setNarrating(false);
      setHighlight(-1);
      engine?.setNarrating(false);
      if (!autoPlay) return;
      const hold = parseDuration(current.timing?.autoPause, defaultPauseMs) * timingRef.current;
      clearAuto();
      autoTimerRef.current = setTimeout(
        () => {
          if (cancelled) return;
          if (index >= total - 1) setEnded(true);
          else goToRef.current("next");
        },
        Math.max(300, hold),
      );
    };

    const audioUrl = current.text?.audioUrl;
    const content = current.text?.content?.trim();

    /* 1 — the voice someone actually recorded, through the narration bus */
    if (audioUrl && el) {
      const key = `${index}:${audioUrl}`;
      const resuming = loadedKeyRef.current === key && el.currentTime > 0;
      if (!resuming) {
        loadedKeyRef.current = key;
        el.src = audioUrl;
        try {
          el.currentTime = 0;
        } catch {
          /* not seekable yet — fine, it starts at 0 anyway */
        }
      }
      el.onplay = () => {
        if (cancelled) return;
        setNarrating(true);
        engine?.setNarrating(true);
      };
      el.onended = finish;
      el.onerror = () => finish(); // a broken asset must not strand the reader
      const startTimer = setTimeout(
        () => {
          if (!cancelled) el.play().catch(() => finish());
        },
        resuming ? RESUME_DELAY_MS : START_DELAY_MS,
      );
      return () => {
        cancelled = true;
        clearTimeout(startTimer);
        clearAuto();
        el.onplay = null;
        el.onended = null;
        el.onerror = null;
        el.pause();
        setNarrating(false);
        engine?.setNarrating(false);
      };
    }

    /* 2 — browser TTS with a word-level read-along */
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (content && synth) {
      const words = splitWords(content);
      const utterance = new SpeechSynthesisUtterance(content);
      utterance.rate = ttsRate;
      utterance.pitch = 1.05;
      let cursor = 0;
      if (highlightOn) {
        utterance.onboundary = (event) => {
          if (cancelled) return;
          if (event.name && event.name !== "word") return;
          const at = event.charIndex ?? 0;
          while (cursor + 1 < words.length && words[cursor + 1].start <= at) cursor++;
          setHighlight(cursor);
        };
      }
      utterance.onstart = () => {
        if (cancelled) return;
        setNarrating(true);
        engine?.setNarrating(true);
      };
      utterance.onend = finish;
      utterance.onerror = finish;

      const startTimer = setTimeout(() => {
        if (cancelled) return;
        synth.cancel();
        synth.speak(utterance);
      }, START_DELAY_MS);
      return () => {
        cancelled = true;
        clearTimeout(startTimer);
        clearAuto();
        try {
          synth.cancel();
        } catch {
          /* ignore */
        }
        setNarrating(false);
        setHighlight(-1);
        engine?.setNarrating(false);
      };
    }

    /* 3 — a wordless page still gets its beat before turning */
    const holdTimer = setTimeout(finish, START_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(holdTimer);
      clearAuto();
    };
  }, [
    started,
    paused,
    ended,
    index,
    pages,
    total,
    autoPlay,
    defaultPauseMs,
    ttsRate,
    highlightOn,
  ]);

  /* ── read-along for a RECORDED voice ─────────────────────────────────
     A recorded clip carries no word boundaries, so words light on a linear
     sweep across `audio.duration` (see ./timing). Reading the element on rAF
     keeps the highlight smooth and — unlike a timer — it stays honest when the
     listener seeks, pauses, or the clip stalls. */
  React.useEffect(() => {
    if (!started || ended || !highlightOn) return;
    const el = audioRef.current;
    const current = pages[index];
    const audioUrl = current?.text?.audioUrl;
    const content = current?.text?.content?.trim();
    if (!el || !audioUrl || !content) return;
    const count = splitWords(content).length;
    if (count === 0) return;

    /* The loop follows the CLIP, not React's idea of it: frames are only
       scheduled while the element is genuinely rolling, so a paused, stalled
       or finished voice costs nothing on a device a child is holding. Seeks
       and timeupdates still re-sample, so the lit word is right the instant a
       listener scrubs. */
    let raf = 0;
    const sample = () => {
      const at = wordIndexAtTime(el.currentTime, el.duration, count);
      setHighlight((prev) => (prev === at ? prev : at));
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const tick = () => {
      sample();
      raf = requestAnimationFrame(tick);
    };
    const run = () => {
      if (raf || el.paused || el.ended) return;
      raf = requestAnimationFrame(tick);
    };
    const rest = () => {
      stop();
      sample(); // the last word heard stays lit
    };

    el.addEventListener("play", run);
    el.addEventListener("playing", run);
    el.addEventListener("seeked", sample);
    el.addEventListener("timeupdate", sample);
    el.addEventListener("pause", rest);
    el.addEventListener("ended", rest);
    el.addEventListener("waiting", stop);
    el.addEventListener("stalled", stop);
    sample();
    run();

    return () => {
      stop();
      el.removeEventListener("play", run);
      el.removeEventListener("playing", run);
      el.removeEventListener("seeked", sample);
      el.removeEventListener("timeupdate", sample);
      el.removeEventListener("pause", rest);
      el.removeEventListener("ended", rest);
      el.removeEventListener("waiting", stop);
      el.removeEventListener("stalled", stop);
    };
  }, [started, ended, index, pages, highlightOn]);

  /* ── the QR that carries the tape to a phone ────────────────────────── */
  React.useEffect(() => {
    if (!ended || !shareUrl) {
      setQr(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(shareUrl, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: "M",
      color: { dark: "#1E1A16", light: "#FFFDF6" },
    })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ended, shareUrl]);

  /* ── auto-hiding chrome ─────────────────────────────────────────────── */
  const wake = React.useCallback(() => setShowUi(true), []);

  React.useEffect(() => {
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    if (!started || ended || sheetOpen || paused || !showUi) return;
    uiTimerRef.current = setTimeout(() => setShowUi(false), UI_IDLE_MS);
    return () => {
      if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    };
    // `index` is deliberate: a page turn restarts the idle countdown.
  }, [showUi, started, ended, sheetOpen, paused, index]);

  /* ── keyboard: ← → space escape p ────────────────────────────────────── */
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (sheetOpen) setSheetOpen(false);
        else onExit?.();
        return;
      }
      if (!started || ended) return;

      /* Space and the arrows belong to whatever control has focus — except
         when that control is one of the player's OWN page-turn affordances
         (tap zones, transport). A listener who taps ⏭ once and then reaches
         for the arrow keys must not find the keyboard dead. Space still
         belongs to the button under it, always: a focused button's Space is
         "press me", never "turn the page". */
      const target = event.target as HTMLElement | null;
      const control = target?.closest?.(
        "button, a, input, select, textarea, [role='switch'], [role='radio']",
      ) as HTMLElement | null;
      const ownNav = !!control?.closest?.("[data-pl-nav]");
      const isArrow = event.key.startsWith("Arrow");
      /* Space always belongs to the focused control. Arrows belong to it only
         when it genuinely consumes them (text fields, selects, sliders, radio
         groups); a focused chip like "Music on" must not deaden the keyboard. */
      const eatsArrows =
        !!control &&
        !ownNav &&
        !!control.matches?.(
          "input, textarea, select, [role='slider'], [role='radio'], [contenteditable='true']",
        );
      if (control && event.key === " ") return;
      if (isArrow && eatsArrows) return;

      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        goTo("next");
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo("prev");
      } else if (event.key === "p" || event.key === "P") {
        togglePlay();
      } else {
        return;
      }
      setShowUi(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, ended, sheetOpen, goTo, togglePlay, onExit]);

  /* ── swipe ──────────────────────────────────────────────────────────── */
  const touchX = React.useRef<number | null>(null);
  const onTouchStart = React.useCallback((event: React.TouchEvent) => {
    touchX.current = event.touches[0]?.clientX ?? null;
    setShowUi(true);
  }, []);
  const onTouchEnd = React.useCallback(
    (event: React.TouchEvent) => {
      const start = touchX.current;
      touchX.current = null;
      if (start === null) return;
      const delta = (event.changedTouches[0]?.clientX ?? start) - start;
      if (Math.abs(delta) < 56) return;
      goTo(delta < 0 ? "next" : "prev");
    },
    [goTo],
  );

  /* ────────────────────────────────────────────────────────── rendering */

  const layout = (page?.layout ?? "").toLowerCase();
  const isTitlePage = layout.includes("title") || layout.includes("cover");
  const isFullBleed = layout.includes("full");
  const content = page?.text?.content?.trim() ?? "";
  const sizeMult =
    page?.text?.fontSize === "xl" ? 1.32 : page?.text?.fontSize === "large" ? 1.14 : 1;
  const textScale = sizeMult * prefs.fontScale;
  const title = manifest.metadata?.title || "Untitled Story";
  const author = manifest.metadata?.author;
  const narrator = manifest.metadata?.narrator;
  const chromeHidden = !showUi && started && !ended;

  return (
    <div
      className={cx(
        "pl-root",
        prefs.dyslexia && "is-dys",
        prefs.contrast && "is-hc",
        chromeHidden && !sheetOpen && "is-idle-ui",
      )}
      /* Honest, read-only state — the same things the tests assert and the
         same things a listener can hear. No identifiers, nothing stored. */
      data-music={musicLive ? "on" : "off"}
      data-audio={audioOk ? "ok" : "unavailable"}
      data-mood={mood ?? "none"}
      data-page-cue={cueOn ? "on" : "off"}
      data-cues-fired={cuesFired}
      data-page={index + 1}
      data-pages={total}
      data-view={!started ? "cover" : ended ? "end" : "page"}
      onMouseMove={wake}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ─────────────────────────────────────────────── the room's light */}
      <div className="pl-ambient" aria-hidden="true" />
      {bg.prev ? (
        <div key={`bg-out-${bg.n}`} className="pl-backdrop is-out" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bg.prev} alt="" data-pl="backdrop-prev" />
        </div>
      ) : null}
      {bg.cur ? (
        <div key={`bg-in-${bg.n}`} className="pl-backdrop is-in" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bg.cur} alt="" data-pl="backdrop" />
        </div>
      ) : null}
      <div className="pl-vignette" aria-hidden="true" />
      <div className="pl-room-light" aria-hidden="true" />

      {/* the narration bus lives on this one element for the whole session —
          a media element can only ever be claimed by one source node */}
      <audio ref={audioRef} preload="auto" crossOrigin="anonymous" className="sr-only" />

      <p className="sr-only" aria-live="polite">
        {started && !ended ? `Page ${index + 1} of ${total}` : ""}
      </p>

      {/* ───────────────────────────────────────────────────────── stage */}
      <div className="pl-stage">
        <div
          key={index}
          className={cx(
            "pl-page",
            isFullBleed && image && "is-full",
            !image && "is-textonly",
            turn.phase !== "idle" && `is-${turn.phase}`,
            `is-${turn.dir}`,
          )}
        >
          {isTitlePage ? (
            <div className="pl-title-page">
              {image ? (
                <div className="pl-picture w-full flex-[1_1_50%]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image} alt={page?.illustration?.alt || ""} />
                </div>
              ) : null}
              <h1 className="pl-title">{content || title}</h1>
              {author ? (
                <p
                  className="text-sm tracking-[0.24em] text-white/45 uppercase"
                  style={{ fontFamily: "var(--font-plex-mono), monospace" }}
                >
                  by {author}
                </p>
              ) : null}
            </div>
          ) : (
            <>
              {image ? (
                <div className="pl-picture">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image}
                    alt={page?.illustration?.alt || `Picture for page ${index + 1}`}
                  />
                </div>
              ) : null}
              {content ? (
                <div className={cx("pl-text", !image && "flex-1")} data-pl="text">
                  <StoryText
                    content={content}
                    highlight={highlightOn ? highlight : -1}
                    scale={textScale}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* tap zones — labelled buttons, not mystery hotspots. `data-pl-nav`
            keeps the arrow keys alive after one is tapped (see the key handler). */}
        <button
          type="button"
          data-pl-nav=""
          className="pl-zone pl-zone--prev"
          aria-label="Previous page"
          onClick={() => goTo("prev")}
          disabled={index === 0}
        />
        <button
          type="button"
          data-pl-nav=""
          className="pl-zone pl-zone--next"
          aria-label={index >= total - 1 ? "Finish the story" : "Next page"}
          onClick={() => goTo("next")}
        />
      </div>

      {/* ─────────────────────────────────────────────────── the tape deck */}
      <div className={cx("pl-deck", narrating && "is-live")} aria-hidden="true">
        <Reel spinning={narrating} size={18} />
        <Reel spinning={narrating} size={18} />
        <span className="pl-deck-read">
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </div>

      {/* ───────────────────────────────────────────────────── top chrome */}
      <div className={cx("pl-chrome pl-chrome--top", chromeHidden && "is-hidden")}>
        <button
          type="button"
          className={cx("pl-chip sk-focus", musicOn && "is-on")}
          /* The label is hidden below `sm`, so the button needs a name of its
             own — a chip with only a ♪ glyph has none. */
          aria-label={musicOn ? "Music on" : "Music off"}
          aria-pressed={musicOn}
          onClick={() => {
            unlockAudio();
            setMusicOn((m) => !m);
            setShowUi(true);
          }}
        >
          <span className="pl-chip-glyph" aria-hidden="true">
            ♪
          </span>
          <span className="hidden sm:inline">{musicOn ? "Music on" : "Music off"}</span>
        </button>
        <button
          type="button"
          className={cx("pl-chip sk-focus", sheetOpen && "is-on")}
          aria-label="Reading options"
          aria-expanded={sheetOpen}
          onClick={() => {
            setSheetOpen((s) => !s);
            setShowUi(true);
          }}
        >
          <span className="pl-chip-glyph" aria-hidden="true">
            ⚙
          </span>
          <span className="hidden sm:inline">Reading options</span>
        </button>
        {onExit ? (
          <button type="button" className="pl-chip sk-focus" onClick={onExit} aria-label="Close story">
            <span className="pl-chip-glyph" aria-hidden="true">
              ⏏
            </span>
            <span className="hidden sm:inline">Close</span>
          </button>
        ) : null}
      </div>

      {/* ────────────────────────────────────────────────── bottom chrome */}
      <div className={cx("pl-chrome pl-chrome--bottom", chromeHidden && "is-hidden")}>
        <div
          className="pl-progress"
          role="progressbar"
          aria-label="Story progress"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={index + 1}
          aria-valuetext={`Page ${index + 1} of ${total}`}
        >
          <div
            className="pl-progress-fill"
            style={{ transform: `scaleX(${total > 0 ? (index + 1) / total : 0})` }}
          />
        </div>
        <GlassPanel className="pl-transport rounded-full" data-pl-nav="">
          <TransportButton kind="prev" onClick={() => goTo("prev")} disabled={index === 0} />
          <TransportButton
            kind={paused ? "play" : "pause"}
            active={!paused && narrating}
            onClick={togglePlay}
          />
          <TransportButton kind="next" onClick={() => goTo("next")} />
        </GlassPanel>
      </div>

      {/* ────────────────────────────────────────────── accessibility sheet */}
      {sheetOpen ? (
        <>
          <div
            className="pl-sheet-scrim"
            role="presentation"
            onClick={() => setSheetOpen(false)}
          />
          <GlassPanel
            className="pl-sheet rounded-t-[22px] rounded-b-none"
            role="dialog"
            aria-label="Reading options"
          >
            <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <h2
                  className="text-lg font-semibold text-white"
                  style={{ fontFamily: "var(--font-geist-sans), sans-serif" }}
                >
                  Reading options
                </h2>
                <button
                  type="button"
                  className="pl-chip sk-focus"
                  onClick={() => setSheetOpen(false)}
                >
                  Done
                </button>
              </div>

              <Segmented<Speed>
                label="Reading speed"
                value={prefs.speed}
                onChange={(speed) => setPrefs((p) => ({ ...p, speed }))}
                options={[
                  { value: "slow", label: "Slow" },
                  { value: "normal", label: "Normal" },
                  { value: "fast", label: "Fast" },
                ]}
              />

              <Segmented<string>
                label="Pause between pages"
                value={String(prefs.timing)}
                onChange={(value) => setPrefs((p) => ({ ...p, timing: Number(value) }))}
                options={[
                  { value: "0.5", label: "Short" },
                  { value: "1", label: "Normal" },
                  { value: "1.5", label: "Long" },
                  { value: "2", label: "Longest" },
                ]}
              />

              <Segmented<string>
                label="Text size"
                value={String(prefs.fontScale)}
                onChange={(value) => setPrefs((p) => ({ ...p, fontScale: Number(value) }))}
                options={[
                  { value: "0.9", label: "Small" },
                  { value: "1", label: "Normal" },
                  { value: "1.25", label: "Large" },
                  { value: "1.5", label: "Largest" },
                ]}
              />

              <SwitchRow
                label="Easier-to-read text"
                hint="Sans-serif, wider letter and word spacing"
                checked={prefs.dyslexia}
                onChange={(dyslexia) => setPrefs((p) => ({ ...p, dyslexia }))}
              />
              <SwitchRow
                label="High contrast"
                hint="Pure black behind pure white text"
                checked={prefs.contrast}
                onChange={(contrast) => setPrefs((p) => ({ ...p, contrast }))}
              />
            </div>
          </GlassPanel>
        </>
      ) : null}

      {/* ──────────────────────────────────────────────────── cover gate */}
      {!started ? (
        <div className="pl-cover" data-pl="cover">
          <div className="pl-cover-inner">
            <div>
              <div className="pl-shell">
                <Reel size={46} />
                <span className="pl-shell-window" aria-hidden="true" />
                <Reel size={46} />
              </div>
              <TapeLabel
                title={title}
                author={author}
                meta={
                  <>
                    SIDE A · {total} {total === 1 ? "PAGE" : "PAGES"} · ~{runtime}
                    {narrator ? ` · VOICE: ${narrator}` : ""}
                  </>
                }
                className="rounded-t-none"
              />
            </div>
            <BigButton
              icon="✨"
              label="Tap to Begin"
              variant="gold"
              onClick={begin}
              className="w-full justify-center text-xl"
              style={{ "--sk-big-h": "88px" } as React.CSSProperties}
            />
            <p className="pl-cover-note">Best with the lights low and the sound up</p>
          </div>
        </div>
      ) : null}

      {/* ────────────────────────────────────────────────────── end card */}
      {ended ? (
        <div className="pl-end" data-pl="end" role="dialog" aria-label="The end">
          <div className="pl-end-inner">
            <TapeLabel
              title={title}
              author={author}
              meta={
                <>
                  SIDE A COMPLETE · {total} {total === 1 ? "PAGE" : "PAGES"} · ~{runtime}
                </>
              }
            />
            {qr && shareUrl ? (
              <div className="pl-qr" data-pl="qr-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qr}
                  data-pl="qr"
                  alt={`QR code linking to this story at ${shareUrl}`}
                  width={132}
                  height={132}
                />
                <div className="pl-qr-copy">
                  <p className="pl-qr-title">Point a phone at this</p>
                  <p className="pl-qr-url">{shareUrl}</p>
                </div>
              </div>
            ) : null}
            <BigButton
              icon="⟲"
              label="Read it again"
              variant="ghost"
              onClick={replay}
              className="w-full justify-center"
            />
            {onMakeYourOwn ? (
              <BigButton
                icon="☆"
                label="Make your own story"
                variant="gold"
                onClick={onMakeYourOwn}
                className="w-full justify-center"
              />
            ) : null}
            {onExit ? (
              <button type="button" className="pl-chip sk-focus mx-auto" onClick={onExit}>
                <span className="pl-chip-glyph" aria-hidden="true">
                  ⏏
                </span>
                Close
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Player;
