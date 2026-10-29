/**
 * tape-position — where the tape is (s02, s05; T09b).
 *
 * "NOT VIDEO — A still page in a room lit by its own colors. Sound carries the
 * motion: no scrubber, no timecode, only a strip of tape filling up." A
 * cassette shows its place the way a cassette does: the left pack big early in
 * a tape, the right pack big late, and a strip of tape along the bottom of the
 * room filling up one page-segment at a time.
 *
 * Pure. (page index, page count, in-page fraction 0–1) → the story position
 *
 *   p = (index + fraction) / count
 *
 * → the two pack diameters for a reel of a given size
 *
 *   left  = big − (big − small) · p        big   = reel × PACK_FULL
 *   right = small + (big − small) · p      small = reel × PACK_EMPTY
 *
 * → and the strip's fill, p (each page's segment holding its own share). The
 * in-page fraction comes from what the Player already knows about the voice:
 * the recorded clip's clock (`clipFraction`), or the browser voice's lit word
 * (`speechFraction`); 1 once the voice (or a wordless page's beat) is done.
 *
 * Every input is clamped: a negative or NaN index is page 1, an index past
 * the end is the last page, the fraction stays inside its page, and a tape of
 * no pages stands at p = 0. Nothing is counted, timed or stored here.
 */

/** A side with almost no tape on it: the hub and the leader, a whisker wider than its reel. */
export const PACK_EMPTY = 1.05;
/**
 * A full side. With PACK_EMPTY it keeps both packs inside the chip: the
 * expanded chip's 20 px reels make a 31 px pack in a 34 px window, and the
 * phone pill's 18 px reels never touch across their 24–26 px spacing.
 */
export const PACK_FULL = 1.55;

/** Diameters, in px, of the tape wound on each side. */
export interface TapePacks {
  left: number;
  right: number;
}

export interface TapePosition extends TapePacks {
  /** Story position, 0–1. */
  p: number;
  /** How much of the strip is filled, 0–1 (the same p). */
  fill: number;
}

function unit(n: number): number {
  if (!Number.isFinite(n)) return n === Number.POSITIVE_INFINITY ? 1 : 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** A page count: a whole number of pages, or none. */
function pageCount(count: number): number {
  return Number.isFinite(count) && count >= 1 ? Math.floor(count) : 0;
}

/** p = (index + fraction) / count, with every input clamped; count 0 → 0. */
export function storyPosition(index: number, count: number, fraction: number): number {
  const n = pageCount(count);
  if (n === 0) return 0;
  const i = Number.isFinite(index) ? Math.min(n - 1, Math.max(0, Math.floor(index))) : index > 0 ? n - 1 : 0;
  return unit((i + unit(fraction)) / n);
}

/** The tape on each side for a reel `reelPx` wide: the left pack empties as p rises, the right fills. */
export function packDiameters(p: number, reelPx: number): TapePacks {
  if (!Number.isFinite(reelPx) || reelPx <= 0) return { left: 0, right: 0 };
  const big = reelPx * PACK_FULL;
  const small = reelPx * PACK_EMPTY;
  const at = unit(p);
  return { left: big - (big - small) * at, right: small + (big - small) * at };
}

/** Segment `i`'s own fill (0–1) when the strip of `count` segments stands at p. */
export function segmentFill(p: number, count: number, i: number): number {
  const n = pageCount(count);
  if (n === 0 || !Number.isInteger(i) || i < 0 || i >= n) return 0;
  return unit(unit(p) * n - i);
}

/** The whole reading: p, the strip's fill, and the packs for a reel `reelPx` wide. */
export function tapePosition(index: number, count: number, fraction: number, reelPx: number): TapePosition {
  const p = storyPosition(index, count, fraction);
  return { p, fill: p, ...packDiameters(p, reelPx) };
}

/** A recorded voice: how far through its clip, from the element's clock. Unknown length → 0. */
export function clipFraction(currentTime: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(currentTime)) return 0;
  return unit(currentTime / duration);
}

/** The browser voice: (lit word + 1) / word count. Nothing lit yet, or no words → 0. */
export function speechFraction(word: number, words: number): number {
  if (!Number.isFinite(word) || !Number.isFinite(words) || words <= 0) return 0;
  return unit((Math.floor(word) + 1) / words);
}
