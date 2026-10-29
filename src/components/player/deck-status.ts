/**
 * deck-status — what the deck chip says about the three sounds (s02, T09a).
 *
 * "THREE SOUNDS, AT ONCE — The narrator on the voice bus; the Wonder melody, a
 * music box over a soft pad, ducked about 12 dB beneath it; and a
 * paper-and-wood chime, under 300 ms, on its own channel when the page turns."
 *
 * Pure: (page, manifest, live flags, the engine's duck depth) → the three row
 * strings, the text page's foot line and the turn ring's share. It reads only
 * what it is handed — the manifest and the room's live state — so nothing is
 * counted and nothing is stored (PRIVACY.md §3).
 *
 *   VOICE   the recorded voice's narrator (or "Recorded voice"), else the
 *           browser voice, else words only, else no words.
 *   MELODY  the page's mood and how far the engine ducks it, or why there is
 *           no melody (no sound on this device · off · none on this page).
 *   CHIME   off · when you turn the page · paused · last page · after the
 *           voice · next turn in m:ss (⌈remaining⌉, during the hold).
 *   foot    "turns N s after the voice · turn cue ready|off" until the hold
 *           starts on a voiced page, then "next page in N s · …" counting
 *           down; on the last page "the end N s after the voice" / "the end
 *           in N s" (null when the tape does not turn its own pages).
 */

import { pageMood, type MusicPlanManifest } from "./music-plan";

/** The page fields the deck reads. */
export interface DeckPage {
  text?: { content?: string; audioUrl?: string };
  music?: unknown;
}

/** The manifest fields the deck reads. */
export interface DeckManifest extends MusicPlanManifest {
  metadata?: { narrator?: string };
  settings?: { autoPlay?: boolean; pageTurnSound?: boolean };
}

/** The room's live state, as the Player knows it. */
export interface DeckFlags {
  /** A voice is speaking right now. */
  narrating: boolean;
  /** The listener paused the tape. */
  paused: boolean;
  /** The listener's Music on/off choice. */
  musicOn: boolean;
  /** The engine's own word: a bed is playing. */
  musicLive: boolean;
  /** False once this device has proved it has no working Web Audio. */
  audioOk: boolean;
  /** This browser has speechSynthesis (the browser voice). */
  speechAvailable: boolean;
  /** Seconds left before the automatic turn; null when no hold is running. */
  holdRemainingS: number | null;
  /** The page's whole hold (its pause before the turn), seconds. */
  holdTotalS: number;
  /** The tape's last page: its hold ends on the end card, with no turn and no chime. */
  lastPage?: boolean;
}

export interface DeckStatus {
  voice: string;
  melody: string;
  chime: string;
  /** The text page's foot line, or null when the tape does not turn its own pages. */
  foot: string | null;
  /** Elapsed share of the hold, 0–1: empty while the voice speaks and before the hold. */
  holdShare: number;
  /** A voice is speaking and the tape is not paused (the waveform glyph is lit). */
  speaking: boolean;
}

/** ⌈seconds⌉ as m:ss — 4.2 → "0:05", 3 → "0:03", 0.4 → "0:01", 61 → "1:01". */
export function formatCountdown(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 0;
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function wholeSeconds(seconds: number): number {
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 0;
}

export function deckStatus(
  page: DeckPage | undefined,
  manifest: DeckManifest,
  flags: DeckFlags,
  duckDepthDb: number,
): DeckStatus {
  const recorded = !!page?.text?.audioUrl;
  const words = !!page?.text?.content?.trim();
  const narrator = manifest.metadata?.narrator?.trim();
  const autoPlay = manifest.settings?.autoPlay !== false;
  const cueOn = manifest.settings?.pageTurnSound !== false;
  const mood = pageMood(manifest, page);
  /** A voice will speak on this page, so the turn waits for it. */
  const voiced = recorded || (words && flags.speechAvailable);
  const holding = flags.holdRemainingS !== null;
  const remaining = holding ? Math.max(0, flags.holdRemainingS as number) : flags.holdTotalS;

  /* VOICE — whose voice is on this page */
  const voice = recorded
    ? `VOICE · ${narrator || "Recorded voice"}`
    : !words
      ? "VOICE · No words on this page"
      : flags.speechAvailable
        ? "VOICE · Storyteller (browser voice)"
        : "VOICE · Words only";

  /* MELODY — the bed, and how far under the voice it sits */
  const melody = !flags.audioOk
    ? "MELODY · no sound on this device"
    : !flags.musicOn
      ? "MELODY · off"
      : !mood
        ? "MELODY · none on this page"
        : flags.musicLive
          ? `MELODY · ${mood}, ${Math.round(duckDepthDb)} dB under the voice`
          : `MELODY · ${mood}`;

  /* CHIME — when the page-turn cue will sound */
  const chime = !cueOn
    ? "CHIME · off"
    : !autoPlay
      ? "CHIME · when you turn the page"
      : flags.paused
        ? "CHIME · paused"
        : flags.lastPage
          ? "CHIME · last page"
          : flags.narrating || (!holding && voiced)
            ? "CHIME · after the voice"
            : `CHIME · next turn in ${formatCountdown(remaining)}`;

  /* the foot of the text page — the hold, in whole seconds. Until the hold
     starts on a page with a voice, the wait runs from the voice's last word,
     so the foot says that rather than a countdown that is not running yet
     (the same branch as the CHIME row's "after the voice"). */
  const n = wholeSeconds(remaining);
  const afterVoice = flags.narrating || (!holding && voiced);
  const cue = `turn cue ${cueOn ? "ready" : "off"}`;
  const foot = !autoPlay
    ? null
    : flags.lastPage
      ? afterVoice
        ? `the end ${n} s after the voice`
        : `the end in ${n} s`
      : afterVoice
        ? `turns ${n} s after the voice · ${cue}`
        : `next page in ${n} s · ${cue}`;

  const total = flags.holdTotalS;
  const holdShare =
    holding && !flags.narrating && total > 0 ? Math.min(1, Math.max(0, (total - remaining) / total)) : 0;

  return { voice, melody, chime, foot, holdShare, speaking: flags.narrating && !flags.paused };
}
