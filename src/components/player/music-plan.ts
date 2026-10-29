/**
 * Music plan — which mood a page plays, and how long the bed takes to cross
 * into it.
 *
 * Deliberately dependency-free (no React, no `@/` aliases, no DOM): the Player
 * imports it, and `tests/vision-music-plan.spec.ts` imports the same module
 * directly in Node. The end card (T12) and the Creator's per-page moods (T24)
 * ask it too, so the whole product hears one answer.
 *
 * The mood comes from `page.music` through the shared vocabulary
 * (src/lib/audio/moods.ts):
 *   - SSYNC v2: a mood string, `music: "Wonder"`;
 *   - SSYNC v1: a track id into the top-level `music.tracks` table
 *     (`music: "peaceful"` → that track's mood, then its prompt);
 *   - either: `music: { crossfade: "adventure", duration: "2s" }`;
 *   - nothing (or nothing nameable): null — SILENCE, never a default bed.
 *
 * The crossfade belongs to the page being ENTERED, in either direction: its own
 * `music.duration` when that is a duration string ("2s", "450ms"), else the
 * bed's 1.6 s default, clamped to 0.05–10 s (format-spec §4: players MAY clamp).
 */

import { resolveMood, type MoodName } from "../../lib/audio/moods";
import { DEFAULT_CROSSFADE_S, MIN_CROSSFADE_S } from "../../lib/audio/music";

export { DEFAULT_CROSSFADE_S, MIN_CROSSFADE_S };

/** The longest crossfade a page may ask for, seconds. Longer reads as a stall. */
export const MAX_CROSSFADE_S = 10;

/** Structural shape of the only page field the plan reads. */
export interface MusicPlanPage {
  music?: unknown;
}

/** Structural shape of the only manifest fields the plan reads. */
export interface MusicPlanManifest {
  /** v1 only: `{ tracks: [{ id, mood?, prompt? }] }`. */
  music?: unknown;
  pages?: readonly MusicPlanPage[];
}

/** One page of the plan. */
export interface PageMusic {
  /** The mood to play, or null for silence. */
  mood: MoodName | null;
  /** Seconds to cross into this page's mood when a bed is already playing. */
  crossfadeSeconds: number;
}

interface LooseTrack {
  id?: unknown;
  mood?: unknown;
  prompt?: unknown;
}

/** "2s", "1.2 s", "450ms", "2" (seconds) — non-negative, nothing else on the line. */
const DURATION = /^(\d+(?:\.\d+)?|\.\d+)\s*(ms|s)?$/i;

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/**
 * Every string this page offers as a name for its music, most specific first.
 * An empty list means the page asked for no music at all.
 */
function moodTokens(manifest: MusicPlanManifest, page: MusicPlanPage | undefined): string[] {
  const raw = page?.music;
  const tokens: string[] = [];
  if (typeof raw === "string") {
    if (raw.trim()) tokens.push(raw);
  } else if (raw && typeof raw === "object") {
    const crossfade = (raw as { crossfade?: unknown }).crossfade;
    if (typeof crossfade === "string" && crossfade.trim()) tokens.push(crossfade);
  }
  if (tokens.length === 0) return [];

  const tracks = (manifest.music as { tracks?: unknown } | null | undefined)?.tracks;
  if (Array.isArray(tracks)) {
    for (const id of [...tokens]) {
      const track = (tracks as Array<LooseTrack | null | undefined>).find((t) => t?.id === id);
      if (typeof track?.mood === "string" && track.mood) tokens.push(track.mood);
      if (typeof track?.prompt === "string" && track.prompt) tokens.push(track.prompt);
    }
  }
  return tokens;
}

/**
 * The page's mood, or null for silence.
 *
 * One vocabulary for the whole product (src/lib/audio/moods.ts): the Studio
 * writes it, the Player plays it, and neither invents a bed the other does not
 * know.
 */
export function pageMood(manifest: MusicPlanManifest, page: MusicPlanPage | undefined): MoodName | null {
  for (const token of moodTokens(manifest, page)) {
    const mood = resolveMood(token);
    if (mood) return mood;
  }
  return null;
}

/**
 * A `music.duration` value → crossfade seconds. Anything that is not a
 * non-negative duration string ("soon", "", "-2s", a number) is the default;
 * a duration is clamped to 0.05–10 s.
 */
export function parseCrossfadeSeconds(value: unknown): number {
  if (typeof value !== "string") return DEFAULT_CROSSFADE_S;
  const match = DURATION.exec(value.trim());
  if (!match) return DEFAULT_CROSSFADE_S;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return DEFAULT_CROSSFADE_S;
  const seconds = match[2]?.toLowerCase() === "ms" ? n / 1000 : n;
  return clamp(seconds, MIN_CROSSFADE_S, MAX_CROSSFADE_S);
}

/** Seconds to cross into this page's mood: its own `music.duration`, else 1.6 s. */
export function pageCrossfadeSeconds(page: MusicPlanPage | undefined): number {
  const raw = page?.music;
  if (!raw || typeof raw !== "object") return DEFAULT_CROSSFADE_S;
  return parseCrossfadeSeconds((raw as { duration?: unknown }).duration);
}

/** The page's mood and the crossfade into it. */
export function pageMusic(manifest: MusicPlanManifest, page: MusicPlanPage | undefined): PageMusic {
  return { mood: pageMood(manifest, page), crossfadeSeconds: pageCrossfadeSeconds(page) };
}

/** The whole tape, page by page, in page order. */
export function musicPlan(manifest: MusicPlanManifest): PageMusic[] {
  return (manifest.pages ?? []).map((page) => pageMusic(manifest, page));
}
