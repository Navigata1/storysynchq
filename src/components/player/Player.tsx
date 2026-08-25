"use client";

/**
 * Player — the cassette-book reader (docs/design-direction.md §6).
 *
 * A story arrives as an SsyncManifest and is played back full-bleed: cover gate
 * → page after page of picture + serif text, narrated by the recorded voice on
 * the manifest (or browser TTS with a word-level read-along), over a music bed
 * that ducks -12 dB underneath — all on the proven DualBusAudioEngine.
 *
 * Three rules this file exists to honour:
 *   1. The tap on "Tap to Begin" is the iOS audio unlock. Nothing plays before.
 *   2. The manifest is the source of truth. v1 documents play; unknown fields
 *      are ignored; missing pieces degrade instead of throwing.
 *   3. Nothing leaves the device. No network, no analytics, no trackers.
 */

import * as React from "react";
import type { SsyncManifest, SsyncPage } from "@/lib/storysync/manifest";
import { DualBusAudioEngine, type MoodConfig } from "@/lib/audio/engine";
import { BigButton, GlassPanel, Reel, TapeLabel, TransportButton } from "@/components/studio-kit/kit";
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

/** Music beds, as proven in the classic reader. Frequencies feed the engine's
 *  music bus; the engine handles ducking and the -12 dB ramps. */
const MOODS = {
  Wonder: { freq1: 220, freq2: 220.5, gainMult: 1.0 },
  Adventure: { freq1: 330, freq2: 331, gainMult: 1.7 },
  Calm: { freq1: 110, freq2: 110.3, gainMult: 0.5 },
  Suspense: { freq1: 155, freq2: 156, gainMult: 1.0 },
  Joy: { freq1: 440, freq2: 441, gainMult: 1.3 },
  Melancholy: { freq1: 185, freq2: 185.5, gainMult: 0.8 },
} satisfies Record<string, MoodConfig>;

type MoodName = keyof typeof MOODS;

/** Manifests name their music freely ("wonder", "courage", "lullaby"). Map the
 *  vocabulary onto a bed rather than refusing to play a bed at all. */
const MOOD_WORDS: Record<string, MoodName> = {
  wonder: "Wonder",
  magic: "Wonder",
  magical: "Wonder",
  dream: "Wonder",
  dreamy: "Wonder",
  star: "Wonder",
  adventure: "Adventure",
  courage: "Adventure",
  brave: "Adventure",
  hero: "Adventure",
  epic: "Adventure",
  action: "Adventure",
  calm: "Calm",
  peace: "Calm",
  peaceful: "Calm",
  lullaby: "Calm",
  gentle: "Calm",
  sleep: "Calm",
  night: "Calm",
  quiet: "Calm",
  suspense: "Suspense",
  mystery: "Suspense",
  mysterious: "Suspense",
  tense: "Suspense",
  dark: "Suspense",
  joy: "Joy",
  joyful: "Joy",
  happy: "Joy",
  bright: "Joy",
  cheerful: "Joy",
  sunny: "Joy",
  melancholy: "Melancholy",
  sad: "Melancholy",
  wistful: "Melancholy",
  rain: "Melancholy",
  reflective: "Melancholy",
};

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

/** "3s" / "450ms" / undefined → milliseconds. */
function parseDuration(value: string | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return fallbackMs;
  return value.includes("ms") ? n : n * 1000;
}

interface Word {
  text: string;
  start: number;
}

/** Words with their character offsets, so TTS boundary events map exactly
 *  instead of drifting on double spaces and line breaks. */
function splitWords(text: string): Word[] {
  const out: Word[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push({ text: m[0], start: m.index });
  return out;
}

interface LooseTrack {
  id?: string;
  mood?: string;
  prompt?: string;
}

/** SSYNC v1 carries a top-level music track list; v2 pages name a track id. */
function moodTokens(manifest: SsyncManifest, page: SsyncPage | undefined): string[] {
  const id = typeof page?.music === "string" ? page.music : undefined;
  const tokens: string[] = [];
  if (id) tokens.push(id);
  const tracks = (manifest as { music?: { tracks?: LooseTrack[] } }).music?.tracks;
  if (id && Array.isArray(tracks)) {
    const track = tracks.find((t) => t?.id === id);
    if (track?.mood) tokens.push(track.mood);
    if (track?.prompt) tokens.push(track.prompt);
  }
  const genre = manifest.metadata?.genre;
  if (genre) tokens.push(genre);
  return tokens;
}

function resolveMood(manifest: SsyncManifest, page: SsyncPage | undefined): MoodName {
  const tokens = moodTokens(manifest, page);
  for (const token of tokens) {
    const direct = MOOD_WORDS[token.trim().toLowerCase()];
    if (direct) return direct;
  }
  for (const token of tokens) {
    const lower = token.toLowerCase();
    for (const word of Object.keys(MOOD_WORDS)) {
      if (lower.includes(word)) return MOOD_WORDS[word];
    }
  }
  return "Wonder";
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Rough runtime for the cover label: read at ~2.5 words/second plus pauses. */
function estimateSeconds(manifest: SsyncManifest): number {
  let total = 0;
  for (const page of manifest.pages) {
    const content = page.text?.content?.trim();
    const words = content ? content.split(/\s+/).length : 0;
    total += words / 2.5 + parseDuration(page.timing?.autoPause, 3000) / 1000;
  }
  return Math.max(20, total);
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

/** The page-turn cue: a 50 ms band-passed noise burst — paper, not a chime.
 *  Runs on a context opened inside the "Tap to Begin" gesture. */
function playTurnCue(ctx: AudioContext | null): void {
  if (!ctx || ctx.state === "closed") return;
  try {
    const size = Math.floor(ctx.sampleRate * 0.05);
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 820;
    filter.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.075, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    source.stop(ctx.currentTime + 0.06);
  } catch {
    /* the cue is decoration — never let it break a page turn */
  }
}

function openAudioContext(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}

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
      style={{ fontSize: `calc(clamp(1.05rem, 2.5vw, 1.6rem) * ${scale})` }}
    >
      {words.map((word, i) => (
        <span
          key={`${i}-${word.start}`}
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
}

export function Player({ manifest, onExit, onMakeYourOwn }: PlayerProps) {
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
  const [prefs, setPrefs] = React.useState<Prefs>(DEFAULT_PREFS);
  const [reduced, setReduced] = React.useState(false);

  const engineRef = React.useRef<DualBusAudioEngine | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const cueCtxRef = React.useRef<AudioContext | null>(null);
  const autoTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const uiTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const turnTimersRef = React.useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const loadedKeyRef = React.useRef<string>("");
  const attachedRef = React.useRef(false);
  const goToRef = React.useRef<(dir: "next" | "prev") => void>(() => {});
  const timingRef = React.useRef(1);
  const moodRef = React.useRef<MoodName>("Wonder");
  const reducedRef = React.useRef(false);

  const page: SsyncPage | undefined = pages[index];
  const mood = resolveMood(manifest, page);
  const highlightOn = manifest.settings?.readAlongHighlight !== false;
  const autoPlay = manifest.settings?.autoPlay !== false;
  const cueOn = manifest.settings?.pageTurnSound !== false;
  const baseTiming = manifest.settings?.accessibility?.timingMultiplier ?? 1;
  const defaultPauseMs = parseDuration(manifest.settings?.accessibility?.pauseBetweenPages, 3000);
  const timingMult = baseTiming * prefs.timing * SPEED_PAUSE[prefs.speed];
  const ttsRate = SPEED_RATE[prefs.speed];
  const runtime = React.useMemo(() => formatClock(estimateSeconds(manifest)), [manifest]);

  /* keep the refs the timers read in sync (declared first — effects run in
     source order, so everything below sees fresh values) */
  React.useEffect(() => {
    timingRef.current = timingMult;
  }, [timingMult]);
  React.useEffect(() => {
    moodRef.current = mood;
  }, [mood]);
  React.useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  const getEngine = React.useCallback((): DualBusAudioEngine => {
    if (!engineRef.current) engineRef.current = new DualBusAudioEngine();
    return engineRef.current;
  }, []);

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

  /* ── the tap that unlocks everything (iOS rule, non-negotiable) ──────── */
  const begin = React.useCallback(() => {
    const engine = getEngine();
    void engine.unlock();
    const el = audioRef.current;
    if (el && !attachedRef.current) {
      engine.attachNarrationElement(el);
      attachedRef.current = true;
    }
    if (!cueCtxRef.current) cueCtxRef.current = openAudioContext();
    setStarted(true);
    setShowUi(true);
  }, [getEngine]);

  /* ── music bed: starts with the story, follows the page's mood ───────── */
  React.useEffect(() => {
    if (!started) return;
    const engine = engineRef.current;
    if (!engine) return;
    if (musicOn) {
      engine.setMusicVolume(MUSIC_VOLUME);
      engine.startMusic(MOODS[moodRef.current]);
    } else {
      engine.stopMusic();
    }
  }, [started, musicOn]);

  React.useEffect(() => {
    if (!started || !musicOn) return;
    engineRef.current?.setMood(MOODS[mood]);
  }, [mood, started, musicOn]);

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

  const goTo = React.useCallback(
    (dir: "next" | "prev") => {
      const next = Math.min(total - 1, Math.max(0, index + (dir === "next" ? 1 : -1)));
      if (next === index) return;

      stopNarration();
      void engineRef.current?.unlock(); // a gesture is a good moment to re-arm iOS
      if (cueOn) playTurnCue(cueCtxRef.current);
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
    [index, total, cueOn, stopNarration],
  );

  React.useEffect(() => {
    goToRef.current = goTo;
  }, [goTo]);

  const replay = React.useCallback(() => {
    stopNarration();
    setEnded(false);
    setPaused(false);
    setIndex(0);
    setTurn({ phase: "idle", dir: "next" });
    setShowUi(true);
  }, [stopNarration]);

  const togglePlay = React.useCallback(() => {
    void engineRef.current?.unlock();
    setEnded(false);
    setShowUi(true);
    setPaused((p) => !p);
  }, []);

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
      if (!started) return;

      const target = event.target as HTMLElement | null;
      const inControl = !!target?.closest?.("button, a, input, select, textarea, [role='switch']");
      if (inControl && (event.key === " " || event.key.startsWith("Arrow"))) return;

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
  }, [started, sheetOpen, goTo, togglePlay, onExit]);

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
  const image = page?.illustration?.url;
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
      onMouseMove={wake}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
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
                <div className={cx("pl-text", !image && "flex-1")}>
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

        {/* tap zones — labelled buttons, not mystery hotspots */}
        <button
          type="button"
          className="pl-zone pl-zone--prev"
          aria-label="Previous page"
          onClick={() => goTo("prev")}
          disabled={index === 0}
        />
        <button
          type="button"
          className="pl-zone pl-zone--next"
          aria-label="Next page"
          onClick={() => goTo("next")}
          disabled={index >= total - 1}
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
          aria-pressed={musicOn}
          onClick={() => {
            void engineRef.current?.unlock();
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
        <GlassPanel className="pl-transport rounded-full">
          <TransportButton kind="prev" onClick={() => goTo("prev")} disabled={index === 0} />
          <TransportButton
            kind={paused ? "play" : "pause"}
            active={!paused && narrating}
            onClick={togglePlay}
          />
          <TransportButton
            kind="next"
            onClick={() => goTo("next")}
            disabled={index >= total - 1}
          />
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
        <div className="pl-cover" style={{ backgroundColor: "#0a0e1a" }}>
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
        <div className="pl-end">
          <div className="pl-end-inner">
            <TapeLabel
              title="The End"
              meta={
                <>
                  {title}
                  {author ? ` · BY ${author.toUpperCase()}` : ""} · SIDE A COMPLETE
                </>
              }
            />
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
