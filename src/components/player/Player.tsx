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
 * An open book on a wide screen (s02, T08): at ≥ 1024 px wide and landscape
 * (./useSpread) a page with a picture and words is a two-page spread — the
 * picture on the left page at its own aspect, the words on a sheer right page
 * under a "PAGE n · MOOD" kicker (./spread.css). Phones and portrait tablets
 * keep the full-bleed / stacked page.
 *
 * Where the tape is (s02/s05, T09b): the deck chip's reels sit on tape packs
 * (left big early, right big late) and a strip of tape fills along the floor,
 * one segment per page — both from ./tape-position, fed by how far the voice
 * is through the page on screen. No scrubber, no timecode.
 *
 * Side A complete (s06, T12): the end card is ./EndCard — the label with a
 * sticker of the last picture, the J-card liner notes (./liner-notes) ending
 * in "What's inside this tape? →", the loop back into making ("Send a
 * thank-you back" on a tape someone sent, T18), and the QR of the share link
 * when there is one.
 *
 * Where you stopped (s07, T21): the Read Room may hand in a start page (the
 * shelf chose it: "Pick up where you left off" / "Start again") or a place to
 * offer (a link, the demo, a file): then the cover prints "You stopped at page
 * N." with a ghost "Pick up where you left off" under Tap to Begin — that tap
 * is the same audio unlock and opens on page N; Tap to Begin stays page 1.
 * Once begun, each settled page and the end card are reported through
 * `onPage` (the Read Room keeps the place; this file stores nothing).
 *
 * Rules this file exists to honour:
 *   1. The tap on "Tap to Begin" is the iOS audio unlock. Nothing plays before.
 *   2. The manifest is the source of truth. v1 documents play; unknown fields
 *      are ignored; missing pieces degrade instead of throwing.
 *   3. `page.music` decides the melody through ./music-plan (and the shared
 *      @/lib/audio/moods vocabulary) — and when a page names no music, the
 *      room is SILENT. Never a default bed. A page's own `music.duration` is
 *      the crossfade into it.
 *   4. Nothing leaves the device. No network, no analytics, no trackers.
 */

import * as React from "react";
import { Lock, Music, Settings, Sparkles, X } from "lucide-react";
import type { SsyncManifest, SsyncPage } from "@/lib/storysync/manifest";
import { DUCK_DEPTH_DB, DualBusAudioEngine } from "@/lib/audio/engine";
import type { MoodName } from "@/lib/audio/moods";
import { BigButton, GlassPanel, Reel, TapeLabel, TransportButton } from "@/components/studio-kit/kit";
import { DECK_REEL_PX, DeckChip } from "@/components/studio-kit/DeckChip";
import { estimateSeconds, formatClock, parseDuration, splitWords, wordIndexAtTime } from "./timing";
import { openCueContext, playPageTurnCue } from "./sound";
import { pageCrossfadeSeconds, pageMood } from "./music-plan";
import { deckStatus } from "./deck-status";
import { clipFraction, packDiameters, segmentFill, speechFraction, storyPosition } from "./tape-position";
import {
  PREFS_KEY,
  SPEED_RATE,
  authorDefaults,
  pauseMultiplier,
  resolve,
  sanitize,
  toStored,
  type Speed,
  type ViewerChoices,
} from "./prefs";
import { useSpread } from "./useSpread";
import { EndCard } from "./EndCard";
import "./player.css";
import "./spread.css";
import "./deck.css";
import "./resume.css";

/* ────────────────────────────────────────────────────────────── constants */

/** Beat of silence before a page starts speaking — also dodges Chrome's
 *  cancel()-then-speak() race, which silently drops the utterance. */
const START_DELAY_MS = 700;
const RESUME_DELAY_MS = 120;
const TURN_OUT_MS = 240;
const TURN_IN_MS = 460;
const UI_IDLE_MS = 4200;
/** The shortest hold before an automatic turn, whatever the tape asks. */
const MIN_HOLD_MS = 300;
const MUSIC_VOLUME = 0.35;
/** The keys, as the room prints them (s02). Every one of them does what it says. */
const KEY_HINT = "← → turn · space pause · P music · esc close";

/* ────────────────────────────────────────────────────────────────── utils */

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* Whether this browser has a voice to read with (the deck's VOICE row). It
   never appears or leaves mid-visit, so the store has nothing to subscribe
   to; the server assumes it, and the client corrects it before the cover
   gate opens. */
const noSubscribe = () => () => {};
const speechOnDevice = () => typeof window !== "undefined" && !!window.speechSynthesis;
const speechOnServer = () => true;

/* The viewport's shape (width / height), for the phone full-bleed fit below.
   0 on the server: no fit is decided before the client knows its screen. */
const subscribeResize = (onChange: () => void) => {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
};
const viewportAspect = () => (window.innerHeight > 0 ? window.innerWidth / window.innerHeight : 0);
const viewportAspectOnServer = () => 0;

/**
 * A full-bleed picture covers the screen until the crop gets extreme: once
 * the screen is narrower than 0.7 of the picture's own shape (a square
 * drawing on a portrait phone shows less than half its width; a portrait
 * tablet, 0.75, keeps its mild crop), the picture fits the width from the top
 * instead, over the room's blurred light, and the words sit under it. A
 * per-page focal point would be a format change.
 */
const PORTRAIT_FIT_BELOW = 0.7;

/** Chrome a keyboard is standing on: the idle timer never hides it. */
function keyboardInChrome(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el || !el.closest?.(".pl-chrome, .pl-deck")) return false;
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

/** A page's hold before the automatic turn: its own `autoPause` (else the
 *  tape's default pause) × the timing multiplier, never under MIN_HOLD_MS. */
function pageHoldMs(page: SsyncPage | undefined, defaultPauseMs: number, multiplier: number): number {
  return Math.max(MIN_HOLD_MS, parseDuration(page?.timing?.autoPause, defaultPauseMs) * multiplier);
}

/**
 * Read-only view of the live engine for tests and console diagnostics — the
 * same trick `src/lib/audio/music.ts` already uses. Getters only: no story
 * data, no writes, nothing that leaves the device (PRIVACY.md §3).
 */
interface PlayerHook {
  musicPlaying: () => boolean;
  moodName: () => MoodName | null;
  /** Seconds of the bed's last mood-to-mood crossfade; null before the first. */
  crossfadeSeconds: () => number | null;
  narrationDuration: () => number | null;
  narrationTime: () => number | null;
}

type HookWindow = Window & { __ssyncPlayer?: PlayerHook };

/* ─────────────────────────────────────────────────────────── small pieces */

function StoryText({
  content,
  highlight,
  scale,
  book = false,
}: {
  content: string;
  highlight: number;
  scale: number;
  /** On a book page the size follows the page (--pl-spread-h), not the viewport width. */
  book?: boolean;
}) {
  const words = React.useMemo(() => splitWords(content), [content]);
  const size = book
    ? "clamp(1.25rem, var(--pl-spread-h) * 0.0464, 1.8rem)"
    : "clamp(1.1rem, 0.92rem + 1.05vw, 1.9rem)";
  return (
    <p className="pl-prose" data-pl="prose" style={{ fontSize: `calc(${size} * ${scale})` }}>
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
  fromStoryteller = false,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  /** The value is the tape's own default (`settings.accessibility`). */
  fromStoryteller?: boolean;
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
        {fromStoryteller ? (
          <span data-pl="storyteller-default" className="mt-0.5 block text-[12px] font-medium text-[#fbbf4a]">
            Set by the storyteller
          </span>
        ) : null}
      </span>
      <span className="pl-switch-track" aria-hidden="true">
        <span className="pl-switch-knob" />
      </span>
    </button>
  );
}

/**
 * The turn ring at the foot of the text page (s02): a 24px track and a gold
 * arc for the elapsed share of the hold before an automatic turn — no arc at
 * all while the voice speaks or before the hold. With motion the arc fills in one smooth pass across
 * the hold (a CSS animation started where the hold stands when the ring
 * mounts; keyed per hold by the caller). Under reduced motion the animation
 * is off and the inline share — stepped by the Player's 1 s tick — shows, so
 * the arc jumps without easing (./deck.css).
 */
function TurnRing({
  share,
  running,
  holdMs,
  elapsedMs,
}: {
  share: number;
  running: boolean;
  holdMs: number;
  elapsedMs: number;
}) {
  // Fixed at mount: a delay that moved with each tick would jump the animation.
  const [delayMs] = React.useState(() => -Math.max(0, elapsedMs));
  return (
    <svg
      className="pl-turn-ring"
      data-pl="turn-ring"
      data-share={share.toFixed(3)}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="pl-turn-track" cx="12" cy="12" r="10" />
      {running ? (
        <circle
          className={cx("pl-turn-arc", running && "is-running")}
          data-pl="turn-arc"
          cx="12"
          cy="12"
          r="10"
          pathLength={1}
          transform="rotate(-90 12 12)"
          style={
            {
              strokeDashoffset: 1 - share,
              "--pl-hold-ms": `${Math.round(holdMs)}ms`,
              "--pl-hold-delay": `${Math.round(delayMs)}ms`,
            } as React.CSSProperties
          }
        />
      ) : null}
    </svg>
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
   * "Send a thank-you back" on the end card (T18): the Read Room passes it
   * for a tape someone sent, never for the house tape. The Player silences
   * the room (narration and music) before handing over.
   */
  onReply?: () => void;
  /** Whom a reply goes back to, for the end card's line. */
  replyName?: string;
  /**
   * The link this story lives at, when it has one (`/read?story=…`). Drawn as
   * a QR on the end card so the tape can jump from a laptop to a grandparent's
   * phone without anyone typing a code.
   */
  shareUrl?: string;
  /**
   * The page (1-based) Tap to Begin opens on, when the shelf chose it (T21:
   * "Pick up where you left off" → N, "Start again" → 1). Default page 1.
   */
  startPage?: number;
  /**
   * A remembered place (1-based) to offer on the cover when nobody chose a
   * start page (a link, the demo, a file): "You stopped at page N." and
   * "Pick up where you left off". Ignored outside page 2…last.
   */
  resumePage?: number;
  /**
   * Each settled page once the tape has begun (0-based `index` of `total`),
   * and the end card (`ended: true`). Never called on the cover.
   */
  onPage?: (place: PlayerPlace) => void;
}

/** Where the tape is, as the Player reports it (T21). */
export interface PlayerPlace {
  index: number;
  total: number;
  ended: boolean;
}

/** A 1-based page as a 0-based index inside the tape, or null. */
function pageIndex(page: number | undefined, total: number, min: number): number | null {
  if (typeof page !== "number" || !Number.isInteger(page) || page < min || page > total) return null;
  return page - 1;
}

export function Player({
  manifest,
  onExit,
  onMakeYourOwn,
  onReply,
  replyName,
  shareUrl,
  startPage,
  resumePage,
  onPage,
}: PlayerProps) {
  const pages = manifest.pages;
  const total = pages.length;
  /* T21: where Tap to Begin opens (the shelf's choice), and the place the
     cover offers when nobody chose (page 2 onward). Fixed for this mount. */
  const [startIndex] = React.useState(() => pageIndex(startPage, total, 1) ?? 0);
  const [offerIndex] = React.useState(() => (startPage === undefined ? pageIndex(resumePage, total, 2) : null));

  const [started, setStarted] = React.useState(false);
  const [index, setIndex] = React.useState(startIndex);
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
  /** Only what this viewer explicitly chose; the tape and the product fill the rest. */
  const [choices, setChoices] = React.useState<ViewerChoices>({});
  const [reduced, setReduced] = React.useState(false);
  const [cuesFired, setCuesFired] = React.useState(0);
  /** Backdrop crossfade: the picture coming in, and the one fading out. */
  const [bg, setBg] = React.useState<{ cur?: string; prev?: string; n: number }>({ n: 0 });
  /** Wide + landscape: pages open as a two-page spread (client-only; SSR is stacked). */
  const wide = useSpread();
  /** Natural width / height of each picture, by URL — the left page takes its shape. */
  const [artRatio, setArtRatio] = React.useState<Record<string, number>>({});
  /** The hold before an automatic turn: set when the voice finishes, cleared
   *  when the page turns or the tape pauses. The deck counts it down. */
  const [hold, setHold] = React.useState<{ page: number; until: number; totalMs: number } | null>(null);
  /** The clock the countdown reads — moved once a second, only while a hold runs. */
  const [clock, setClock] = React.useState(0);
  /** How far the voice is through a page, 0–1 (./tape-position): the clip's
   *  clock, the lit word, 1 once the voice or a wordless page's beat is done.
   *  It belongs to its page — a value for any other page reads as 0. */
  const [inPage, setInPage] = React.useState<{ page: number; f: number }>({ page: startIndex, f: 0 });
  const speechAvailable = React.useSyncExternalStore(noSubscribe, speechOnDevice, speechOnServer);
  const aspect = React.useSyncExternalStore(subscribeResize, viewportAspect, viewportAspectOnServer);

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
  const targetRef = React.useRef(startIndex);
  const timingRef = React.useRef(1);
  /* Where a browser voice is on its page: the word it last reached. A pause
     cancels the utterance (speechSynthesis.pause() is not dependable — see
     the narration effect), so play picks the page up again from this word
     instead of re-reading it from the top. Cleared whenever a page is entered
     and when its voice finishes. */
  const ttsPlaceRef = React.useRef<{ page: number; word: number } | null>(null);
  const reducedRef = React.useRef(false);
  const choicesRef = React.useRef<ViewerChoices>({});

  const page: SsyncPage | undefined = pages[index];
  /* page.music → the mood (or silence) and the crossfade into it (./music-plan) */
  const mood = React.useMemo(() => pageMood(manifest, page), [manifest, page]);
  const crossfadeS = React.useMemo(() => pageCrossfadeSeconds(page), [page]);
  const highlightOn = manifest.settings?.readAlongHighlight !== false;
  const autoPlay = manifest.settings?.autoPlay !== false;
  const cueOn = manifest.settings?.pageTurnSound !== false;
  const accessibility = manifest.settings?.accessibility;
  /* viewer's choice → the storyteller's default → the product default (./prefs) */
  const asked = React.useMemo(() => authorDefaults(accessibility), [accessibility]);
  const { prefs, source } = React.useMemo(() => resolve(asked, choices), [asked, choices]);
  const defaultPauseMs = parseDuration(accessibility?.pauseBetweenPages, 3000);
  const timingMult = pauseMultiplier(accessibility?.timingMultiplier, prefs);
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

  /* ── reading preferences live on the device only (COPPA: no trackers).
     Only the viewer's explicit choices are stored, and only when they make
     one: opening a tape writes nothing. ─────────────────────────────── */
  React.useEffect(() => {
    try {
      const stored = sanitize(window.localStorage.getItem(PREFS_KEY));
      choicesRef.current = stored;
      setChoices(stored);
    } catch {
      /* private mode / blocked storage: no choices, the tape's defaults apply */
    }
  }, []);
  const choose = React.useCallback((patch: ViewerChoices) => {
    const next = { ...choicesRef.current, ...patch };
    choicesRef.current = next;
    setChoices(next);
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(toStored(next)));
    } catch {
      /* quota / private mode: the choice holds for this visit */
    }
  }, []);

  /* ── read-only engine view for tests and the console ────────────────── */
  React.useEffect(() => {
    const w = window as HookWindow;
    w.__ssyncPlayer = {
      musicPlaying: () => engineRef.current?.musicPlaying ?? false,
      moodName: () => engineRef.current?.moodName ?? null,
      crossfadeSeconds: () => engineRef.current?.lastCrossfadeSeconds ?? null,
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

  /** A page comes on screen at its own beginning: the tape's place in it is 0. */
  const enterPage = React.useCallback((next: number) => {
    ttsPlaceRef.current = null;
    setIndex(next);
    setInPage({ page: next, f: 0 });
  }, []);

  /* ── the tap that unlocks everything (iOS rule, non-negotiable) ──────── */
  const begin = React.useCallback(
    (at?: number) => {
      // Every audio step below is optional. The setState calls at the end are
      // not: this tap opens the story, with sound or without it.
      unlockAudio();
      const el = audioRef.current;
      if (el && !attachedRef.current) {
        if (withEngine((engine) => engine.attachNarrationElement(el))) attachedRef.current = true;
      }
      if (!cueCtxRef.current) cueCtxRef.current = openCueContext();
      // "Pick up where you left off" (T21): the same tap, on the page left
      if (typeof at === "number" && at !== targetRef.current) {
        targetRef.current = at;
        enterPage(at);
      }
      setStarted(true);
      setShowUi(true);
    },
    [unlockAudio, withEngine, enterPage],
  );

  /* ── where the tape is, for the Read Room's resume (T21): each settled
     page once begun, then the end card. Nothing before Tap to Begin. ──── */
  const onPageRef = React.useRef(onPage);
  React.useEffect(() => {
    onPageRef.current = onPage;
  }, [onPage]);
  React.useEffect(() => {
    if (!started) return;
    onPageRef.current?.({ index, total, ended });
  }, [started, index, total, ended]);

  /* ── music bed: page.music decides, and "no music" means silence ─────── */
  React.useEffect(() => {
    if (!started) {
      setMusicLive(false);
      return;
    }
    withEngine((engine) => {
      if (musicOn && mood) {
        engine.setMusicVolume(MUSIC_VOLUME);
        // startMusic() crossfades when a bed is already running (engine.ts),
        // at the pace the page being entered asks for (its music.duration).
        engine.startMusic(mood, crossfadeS);
      } else if (engine.musicPlaying) {
        engine.stopMusic();
      }
    });
    // `data-music` is read back off the engine's own getter, never from the
    // UI's intent — so the attribute cannot claim a bed the room isn't playing.
    setMusicLive(engineRef.current?.musicPlaying === true);
  }, [started, musicOn, mood, crossfadeS, withEngine]);

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
        enterPage(next);
        setTurn({ phase: "idle", dir });
        return;
      }
      setTurn({ phase: "out", dir });
      turnTimersRef.current.push(
        setTimeout(() => {
          enterPage(next);
          setTurn({ phase: "in", dir });
        }, TURN_OUT_MS),
        setTimeout(
          () => setTurn((t) => (t.phase === "in" ? { phase: "idle", dir: t.dir } : t)),
          TURN_OUT_MS + TURN_IN_MS,
        ),
      );
    },
    [total, fireCue, stopNarration, unlockAudio, enterPage],
  );

  React.useEffect(() => {
    goToRef.current = goTo;
  }, [goTo]);
  React.useEffect(() => {
    targetRef.current = index;
  }, [index]);

  /* "Read it again" unmounts the end card that held focus; the stage takes
     it once page 1 is back, so the keyboard keeps its place and its tape
     meanings (Space pauses, the arrows turn) instead of falling to <body>. */
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const focusStageRef = React.useRef(false);
  const replay = React.useCallback(() => {
    stopNarration();
    setEnded(false);
    setPaused(false);
    enterPage(0);
    setTurn({ phase: "idle", dir: "next" });
    setShowUi(true);
    focusStageRef.current = true;
  }, [stopNarration, enterPage]);
  React.useEffect(() => {
    if (ended || !focusStageRef.current) return;
    focusStageRef.current = false;
    stageRef.current?.focus({ preventScroll: true });
  }, [ended]);

  /* "Send a thank-you back": the room falls silent, then the Creator opens. */
  const reply = React.useMemo(
    () =>
      onReply
        ? () => {
            stopNarration();
            const engine = engineRef.current;
            if (engine?.musicPlaying) engine.stopMusic();
            setMusicLive(false);
            onReply();
          }
        : undefined,
    [onReply, stopNarration],
  );

  const togglePlay = React.useCallback(() => {
    unlockAudio();
    setEnded(false);
    setShowUi(true);
    setPaused((p) => !p);
  }, [unlockAudio]);

  const toggleMusic = React.useCallback(() => {
    unlockAudio();
    setMusicOn((m) => !m);
    setShowUi(true);
  }, [unlockAudio]);

  /** A picture told us its shape: the left page of the spread follows it. */
  const noteArt = React.useCallback((img: HTMLImageElement | null) => {
    if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return;
    const url = img.getAttribute("src") ?? "";
    const ratio = img.naturalWidth / img.naturalHeight;
    setArtRatio((r) => (r[url] === ratio ? r : { ...r, [url]: ratio }));
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
      setHold(null);
    };

    /** Narration finished → hold for the page's pause, then turn the page. */
    const finish = () => {
      if (cancelled) return;
      ttsPlaceRef.current = null;
      setNarrating(false);
      setHighlight(-1);
      engine?.setNarrating(false);
      // the voice (or a wordless page's beat) is done: the tape is at the page's end
      setInPage({ page: index, f: 1 });
      if (!autoPlay) return;
      const holdMs = pageHoldMs(current, defaultPauseMs, timingRef.current);
      clearAuto();
      // The deck reads this deadline; the timer below is still the one that turns.
      const now = Date.now();
      setClock(now);
      setHold({ page: index, until: now + holdMs, totalMs: holdMs });
      autoTimerRef.current = setTimeout(() => {
        if (cancelled) return;
        if (index >= total - 1) setEnded(true);
        else goToRef.current("next");
      }, holdMs);
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

    /* 2 — browser TTS with a word-level read-along

       Pause cancels the utterance and play speaks the page again FROM THE
       WORD IT HAD REACHED (ttsPlaceRef), not from its first word, so the
       strip and the lit word never step back. speechSynthesis.pause() and
       resume() are not used: they are widely reported not to pause on Chrome
       for Android (the line speaks on, or is dropped), Chrome's network
       voices can go silent for good after a long pause with no end event,
       and a resume that stalls cannot be told apart from a quiet voice — so
       a fallback could not know when to step in. cancel() + speak() behaves
       the same in every browser.
       A voice that sends no word boundaries never moves the cursor, so it
       still starts the page over. */
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (content && synth) {
      const words = splitWords(content);
      const place = ttsPlaceRef.current;
      const from = place && place.page === index && place.word > 0 && place.word < words.length ? place.word : 0;
      const resuming = from > 0;
      /** Where the spoken text starts in `content`: the boundaries are relative to it. */
      const offset = resuming ? words[from].start : 0;
      const utterance = new SpeechSynthesisUtterance(resuming ? content.slice(offset) : content);
      utterance.rate = ttsRate;
      utterance.pitch = 1.05;
      let cursor = from;
      // Each spoken word moves the tape; with the read-along on, it also lights.
      utterance.onboundary = (event) => {
        if (cancelled) return;
        if (event.name && event.name !== "word") return;
        const at = offset + (event.charIndex ?? 0);
        while (cursor + 1 < words.length && words[cursor + 1].start <= at) cursor++;
        ttsPlaceRef.current = { page: index, word: cursor };
        setInPage({ page: index, f: speechFraction(cursor, words.length) });
        if (highlightOn) setHighlight(cursor);
      };
      utterance.onstart = () => {
        if (cancelled) return;
        setNarrating(true);
        engine?.setNarrating(true);
      };
      utterance.onend = finish;
      utterance.onerror = finish;

      const startTimer = setTimeout(
        () => {
          if (cancelled) return;
          synth.cancel();
          synth.speak(utterance);
        },
        resuming ? RESUME_DELAY_MS : START_DELAY_MS,
      );
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

  /* While the tape is paused, the word a browser voice stopped on stays lit,
     as a recorded voice's does (the narration effect's cleanup cleared it). */
  React.useEffect(() => {
    if (!paused || !highlightOn) return;
    const place = ttsPlaceRef.current;
    if (place && place.page === index) setHighlight(place.word);
  }, [paused, highlightOn, index]);

  /* ── the countdown's clock: one tick a second, only while a hold runs ───
     Each tick lands just after a whole second of the hold has gone, so the
     deck reads 0:04 → 0:03 → 0:02 → 0:01 and the turn itself ends the last
     second. Nothing else moves the clock. */
  React.useEffect(() => {
    if (!hold) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const left = hold.until - Date.now();
      if (left <= 1000) return;
      timer = setTimeout(
        () => {
          setClock(Date.now());
          schedule();
        },
        (left % 1000 || 1000) + 15,
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [hold]);

  /* ── where a RECORDED voice is in its clip (the tape's place in the page) ─
     The element's own clock, sampled on its timeupdate (a few times a second
     — the strip and the packs ease between samples). Only this page's clip
     counts: while the element still holds another page's (a turn made while
     paused), the page stays at its start. */
  React.useEffect(() => {
    const el = audioRef.current;
    const audioUrl = pages[index]?.text?.audioUrl;
    if (!el || !audioUrl) return;
    const key = `${index}:${audioUrl}`;
    const sample = () => {
      if (loadedKeyRef.current !== key) return;
      const f = clipFraction(el.currentTime, el.duration);
      setInPage((prev) => (prev.page === index && Math.abs(prev.f - f) < 0.002 ? prev : { page: index, f }));
    };
    const events = ["timeupdate", "seeked", "durationchange", "ended"] as const;
    events.forEach((name) => el.addEventListener(name, sample));
    return () => events.forEach((name) => el.removeEventListener(name, sample));
  }, [index, pages]);

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

  /* ── auto-hiding chrome ─────────────────────────────────────────────────
     A pointer, a touch or focus arriving anywhere in the room wakes it (Tab
     onto a hidden chip shows the chip — WCAG 2.4.7), and the idle timer never
     hides chrome a keyboard is standing on: it looks again a beat later. */
  const wake = React.useCallback(() => setShowUi(true), []);

  React.useEffect(() => {
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    if (!started || ended || sheetOpen || paused || !showUi) return;
    const idle = () => {
      if (keyboardInChrome()) {
        uiTimerRef.current = setTimeout(idle, UI_IDLE_MS);
        return;
      }
      setShowUi(false);
    };
    uiTimerRef.current = setTimeout(idle, UI_IDLE_MS);
    return () => {
      if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    };
    // `index` is deliberate: a page turn restarts the idle countdown.
  }, [showUi, started, ended, sheetOpen, paused, index]);

  /* ── keyboard: ← → turn · space pause · P music · esc close ────────────── */
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

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo("next");
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo("prev");
      } else if (event.key === " ") {
        // the hint says "space pause" (s02), so Space is the tape's pause key
        event.preventDefault();
        togglePlay();
      } else if (event.key === "p" || event.key === "P") {
        toggleMusic();
      } else {
        return;
      }
      setShowUi(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, ended, sheetOpen, goTo, togglePlay, toggleMusic, onExit]);

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
  /* The open book (s02): wide + landscape, and not a title/cover page. A page
     with a picture AND words is a spread; a page with only one of them is a
     single centred page. Every layout name ("illustration-top",
     "illustration-full", "full") opens the same way — the book has no
     full-bleed. */
  const book = wide && !isTitlePage;
  const isSpread = book && !!image && !!content;
  const isSingle = book && !isSpread && (!!image || !!content);
  const ratio = image ? artRatio[image] : undefined;
  const full = !book && isFullBleed && !!image;
  /* a phone's full-bleed page: fit the picture's width once the crop gets extreme */
  const portraitFit = full && !!ratio && aspect > 0 && aspect < PORTRAIT_FIT_BELOW * ratio;
  const kicker = `PAGE ${index + 1}${mood ? ` · ${mood.toUpperCase()}` : ""}`;

  /* The deck's three sounds (./deck-status): read off the manifest and the
     room's live state — the hold the narration effect scheduled, the engine's
     own word on the bed, the duck depth it exports. Nothing counted, nothing
     stored. A hold belongs to its page: a stale one never leaks onto the next. */
  const holdNow = hold && hold.page === index && !paused && !ended ? hold : null;
  const holdTotalS = (holdNow ? holdNow.totalMs : pageHoldMs(page, defaultPauseMs, timingMult)) / 1000;
  const status = deckStatus(
    page,
    manifest,
    {
      narrating,
      paused,
      musicOn,
      musicLive,
      audioOk,
      speechAvailable,
      holdRemainingS: holdNow ? Math.max(0, holdNow.until - clock) / 1000 : null,
      holdTotalS,
      lastPage: index >= total - 1,
    },
    DUCK_DEPTH_DB,
  );

  /* Where the tape is (./tape-position): the page on screen plus how far its
     voice has got; the end card is the end of the tape. */
  const tapeP = storyPosition(index, total, ended ? 1 : inPage.page === index ? inPage.f : 0);
  const packs = {
    pill: packDiameters(tapeP, DECK_REEL_PX.pill),
    expanded: packDiameters(tapeP, DECK_REEL_PX.expanded),
  };

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
      data-layout={wide ? "spread" : "stacked"}
      onMouseMove={wake}
      onFocus={wake}
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
      <div ref={stageRef} className="pl-stage outline-none" tabIndex={-1}>
        <div
          key={index}
          className={cx(
            "pl-page",
            isSpread && "is-spread",
            isSingle && "is-single",
            full && "is-full",
            portraitFit && "is-portrait-fit",
            !image && "is-textonly",
            turn.phase !== "idle" && `is-${turn.phase}`,
            `is-${turn.dir}`,
          )}
          style={(book || full) && ratio ? ({ "--pl-art-ratio": ratio } as React.CSSProperties) : undefined}
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
          ) : book ? (
            /* the open book: art on the left page, words on the sheer right page */
            <div className="pl-book" data-pl={isSpread ? "spread" : "book"}>
              {image ? (
                <div className="pl-picture" data-pl="art">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={noteArt}
                    src={image}
                    alt={page?.illustration?.alt || `Picture for page ${index + 1}`}
                    onLoad={(event) => noteArt(event.currentTarget)}
                  />
                </div>
              ) : null}
              {content ? (
                <div className="pl-text" data-pl="text">
                  <p className="pl-kicker" data-pl="kicker">
                    {mood ? (
                      <span
                        className="pl-kicker-dot"
                        aria-hidden="true"
                        style={{ "--pl-mood": `var(--mood-${mood.toLowerCase()})` } as React.CSSProperties}
                      />
                    ) : null}
                    {kicker}
                  </p>
                  <StoryText
                    content={content}
                    highlight={highlightOn ? highlight : -1}
                    scale={textScale}
                    book
                  />
                  {/* s02: the hold before the automatic turn, at the page's foot.
                      Not a live region — it is never announced each second. */}
                  {status.foot ? (
                    <div className="pl-turn-foot" data-pl="turn-foot">
                      <TurnRing
                        key={holdNow ? holdNow.until : "rest"}
                        share={status.holdShare}
                        running={!!holdNow}
                        holdMs={holdTotalS * 1000}
                        elapsedMs={holdNow ? clock - (holdNow.until - holdNow.totalMs) : 0}
                      />
                      <span data-pl="turn-line">{status.foot}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <>
              {/* A phone in portrait fits the picture to its width (s02): below
                  its faded foot the drawing's own colours carry on (a soft
                  mirrored wash of its lower edge) down into the scrim, instead
                  of the room's grey haze. Decoration only; painted before (so
                  under) the picture, outside it so the picture keeps one img. */}
              {image && portraitFit ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="pl-picture-foot" src={image} alt="" aria-hidden="true" data-pl="picture-foot" />
              ) : null}
              {image ? (
                <div className="pl-picture">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={noteArt}
                    src={image}
                    alt={page?.illustration?.alt || `Picture for page ${index + 1}`}
                    onLoad={(event) => noteArt(event.currentTarget)}
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

        {/* tap zones — big edge targets for a hand. Out of the tab order and
            hidden from assistive tech: the transport (on every layout) and the
            arrow keys are the keyboard and screen-reader path, so nobody tabs
            through "Previous page" twice. `data-pl-nav` keeps the arrow keys
            alive after one is tapped (see the key handler). */}
        <button
          type="button"
          data-pl-nav=""
          className="pl-zone pl-zone--prev"
          aria-label="Previous page"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => goTo("prev")}
          disabled={index === 0}
        />
        <button
          type="button"
          data-pl-nav=""
          className="pl-zone pl-zone--next"
          aria-hidden="true"
          tabIndex={-1}
          aria-label={index >= total - 1 ? "Finish the story" : "Next page"}
          onClick={() => goTo("next")}
        />
      </div>

      {/* ─────────────────────────────────────────────────── the tape deck */}
      {/* Three sounds at once (s02): VOICE · MELODY · CHIME rows from 768 px,
          the s05 pill (reels, counter, | mic, narrator) below it. The rows
          fold with the chrome; the reels and the counter never hide; the
          narrator's name opens when the chrome idles out. */}
      <DeckChip
        className="pl-deck"
        countClassName="pl-deck-read"
        page={index + 1}
        total={total}
        spinning={narrating}
        speaking={status.speaking}
        rows={{ voice: status.voice, melody: status.melody, chime: status.chime }}
        narrator={narrator}
        idle={chromeHidden}
        packs={packs}
      />

      {/* ───────────────────────────────────────────────────── top chrome */}
      <div className={cx("pl-chrome pl-chrome--top", chromeHidden && "is-hidden")}>
        <button
          type="button"
          className={cx("pl-chip sk-focus", musicOn && "is-on")}
          /* The label is hidden below `sm`, so the button needs a name of its
             own — a chip with only an icon has none. */
          aria-label={musicOn ? "Music on" : "Music off"}
          aria-pressed={musicOn}
          onClick={toggleMusic}
        >
          <Music size={15} strokeWidth={2} aria-hidden="true" className="flex-none" />
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
          <Settings size={15} strokeWidth={2} aria-hidden="true" className="flex-none" />
          <span className="hidden sm:inline">Reading options</span>
        </button>
        {onExit ? (
          <button type="button" className="pl-chip sk-focus" onClick={onExit} aria-label="Close story">
            <X size={15} strokeWidth={2} aria-hidden="true" className="flex-none" />
            <span className="hidden sm:inline">Close</span>
          </button>
        ) : null}
      </div>

      {/* ───────────────────────────── the keys, on a screen that has them */}
      {wide ? (
        <p className={cx("pl-chrome pl-keys", chromeHidden && "is-hidden")} data-pl="keys">
          {KEY_HINT}
        </p>
      ) : null}

      {/* ─────────────────────────────────────────── the strip of tape */}
      {/* "No scrubber, no timecode, only a strip of tape filling up" (s02):
          one segment per page, each holding its page's share of p. A
          progressbar, never a slider; it stays when the chrome idles out. */}
      <div
        className="pl-progress"
        role="progressbar"
        aria-label="Story progress"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={index + 1}
        aria-valuetext={`Page ${index + 1} of ${total}`}
        data-pl="strip"
        style={{ "--pl-tape-n": Math.max(1, total) } as React.CSSProperties}
      >
        {pages.map((_, i) => (
          <span
            key={i}
            className="pl-progress-seg"
            data-pl="strip-seg"
            data-state={i < index ? "done" : i === index ? "now" : "ahead"}
          >
            <span
              className="pl-progress-fill"
              data-pl="strip-fill"
              style={{ transform: `scaleX(${segmentFill(tapeP, total, i)})` }}
            />
          </span>
        ))}
        <span className="pl-progress-glow" aria-hidden="true" style={{ width: `${tapeP * 100}%` }} />
      </div>

      {/* ────────────────────────────────────────────────── bottom chrome */}
      <div className={cx("pl-chrome pl-chrome--bottom", chromeHidden && "is-hidden")}>
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
                onChange={(speed) => choose({ speed })}
                options={[
                  { value: "slow", label: "Slow" },
                  { value: "normal", label: "Normal" },
                  { value: "fast", label: "Fast" },
                ]}
              />

              <Segmented<string>
                label="Pause between pages"
                value={String(prefs.timing)}
                onChange={(value) => choose({ timing: Number(value) })}
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
                onChange={(value) => choose({ fontScale: Number(value) })}
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
                fromStoryteller={source.dyslexia === "author"}
                onChange={(dyslexia) => choose({ dyslexia })}
              />
              <SwitchRow
                label="High contrast"
                hint="Pure black behind pure white text"
                checked={prefs.contrast}
                fromStoryteller={source.contrast === "author"}
                onChange={(contrast) => choose({ contrast })}
              />

              <p
                data-pl="prefs-local"
                className="flex items-center justify-center gap-2 pt-1 text-[11px] tracking-[0.08em] text-white/45"
                style={{ fontFamily: "var(--font-plex-mono), ui-monospace, monospace" }}
              >
                <Lock size={12} strokeWidth={2} aria-hidden="true" className="flex-none" />
                Saved on this device only
              </p>
            </div>
          </GlassPanel>
        </>
      ) : null}

      {/* ──────────────────────────────────────────────────── cover gate */}
      {/* s05: the gate's light is the first drawing itself, blurred once and
          dimmed (the reference's blur 22 · brightness .5 · dim .3 → .62),
          drawn opaque over the room rather than re-blurring the room's own
          already-blurred, vignetted copy of it */}
      {!started && bg.cur ? (
        <div className="pl-cover-room" data-pl="cover-room" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bg.cur} alt="" />
        </div>
      ) : null}
      {!started ? (
        <div className={cx("pl-cover", bg.cur && "has-art")} data-pl="cover">
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
              icon={<Sparkles aria-hidden="true" focusable="false" strokeWidth={2.2} className="size-6" />}
              label="Tap to Begin"
              variant="gold"
              onClick={() => begin()}
              className="w-full justify-center text-xl"
              style={{ "--sk-big-h": "88px" } as React.CSSProperties}
            />
            {/* T21: the place this tape was left, offered (never chosen for you) */}
            {offerIndex !== null ? (
              <div className="pl-resume" data-pl="resume">
                <p className="pl-resume-line">You stopped at page {offerIndex + 1}.</p>
                <BigButton
                  label="Pick up where you left off"
                  variant="ghost"
                  onClick={() => begin(offerIndex)}
                  className="pl-resume-btn w-full justify-center"
                />
              </div>
            ) : null}
            <p className="pl-cover-note">Best with the lights low and the sound up</p>
          </div>
        </div>
      ) : null}

      {/* ────────────────────────────────────────────────────── end card */}
      {ended ? (
        <EndCard
          manifest={manifest}
          runtime={runtime}
          shareUrl={shareUrl}
          onReplay={replay}
          onMakeYourOwn={onMakeYourOwn}
          onReply={reply}
          replyName={replyName}
          onExit={onExit}
        />
      ) : null}
    </div>
  );
}

export default Player;
