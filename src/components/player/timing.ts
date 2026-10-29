/**
 * Player timing — the pure arithmetic behind the read-along.
 *
 * Deliberately dependency-free (no React, no `@/` aliases, no DOM): the Player
 * imports it, and `tests/wp-player.spec.ts` imports the same module directly to
 * check the word-timing law without a browser.
 */

export interface Word {
  text: string;
  /** Character offset in the source string — TTS `onboundary` maps onto this. */
  start: number;
}

/** Words with their character offsets, so TTS boundary events map exactly
 *  instead of drifting on double spaces and line breaks. */
export function splitWords(text: string): Word[] {
  const out: Word[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push({ text: m[0], start: m.index });
  return out;
}

/**
 * Read-along for a *recorded* voice.
 *
 * A recorded clip carries no word boundaries, so the honest approximation is a
 * linear sweep: word k lights at `k * duration / wordCount`. It is never wrong
 * by more than a phrase, it costs nothing, and it makes the child's own voice
 * light up the words the way TTS already does.
 *
 * Returns -1 for "nothing lit yet" — before the clip starts, and whenever the
 * duration is still unknown (metadata not loaded, or a stream of unknown
 * length). Never throws, never returns an out-of-range index.
 */
export function wordIndexAtTime(
  currentTime: number,
  duration: number,
  wordCount: number,
): number {
  if (!Number.isFinite(duration) || duration <= 0) return -1;
  if (!Number.isFinite(wordCount) || wordCount <= 0) return -1;
  if (!Number.isFinite(currentTime) || currentTime <= 0) return -1;
  const raw = Math.floor((currentTime / duration) * wordCount);
  if (raw < 0) return 0;
  return raw > wordCount - 1 ? wordCount - 1 : raw;
}

/* Runtime arithmetic lives in the storysync library (one source for every
   label that prints a runtime); the Player keeps importing it from here. */
export { estimateSeconds, formatClock, parseDuration } from "../../lib/storysync/tape-meta";
export type { TimedPage } from "../../lib/storysync/tape-meta";
