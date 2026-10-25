/**
 * Tape meta — the facts printed on a tape's label, derived from its manifest.
 *
 * One source for a story's runtime arithmetic and its narration kind, so no
 * surface ever hand-types a label that can drift from the tape (the landing
 * once printed "4:32 · AAC/M4A" for a read-along tape that runs ~1:47).
 * The Player's timing helpers re-export from here.
 *
 * Pure and dependency-free: no React, no DOM, no `@/` aliases — Node-side
 * tests import it directly.
 */

/** Read-along pace for the estimate: words per second. */
export const WORDS_PER_SECOND = 2.5;

/** A page without its own `timing.autoPause` holds this long, in ms. */
export const DEFAULT_PAUSE_MS = 3000;

/** "3s" / "450ms" / undefined → milliseconds. */
export function parseDuration(value: string | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return fallbackMs;
  return value.includes("ms") ? n : n * 1000;
}

/** Seconds → "m:ss" (rounded to the nearest second, never negative). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Structural shape of the only page fields the label needs. */
export interface TimedPage {
  text?: { content?: string; audioUrl?: string; audioCodec?: string } | undefined;
  timing?: { autoPause?: string } | undefined;
}

/** Structural shape of the only manifest fields the label needs. */
export interface TimedManifest {
  pages: readonly TimedPage[];
  settings?: { accessibility?: { pauseBetweenPages?: string } } | undefined;
}

function wordCount(page: TimedPage): number {
  const content = page.text?.content?.trim();
  return content ? content.split(/\s+/).length : 0;
}

/**
 * Runtime of a read-along, in seconds: every page's words at
 * {@link WORDS_PER_SECOND} plus its `autoPause` (default 3 s; "450ms" is
 * 0.45 s). No floor — this is the honest estimate.
 */
export function estimateRuntimeSeconds(
  pages: readonly TimedPage[],
  defaultPauseMs = DEFAULT_PAUSE_MS,
): number {
  let total = 0;
  for (const page of pages) {
    total += wordCount(page) / WORDS_PER_SECOND + parseDuration(page.timing?.autoPause, defaultPauseMs) / 1000;
  }
  return total;
}

/** The Player cover's estimate: {@link estimateRuntimeSeconds}, floored at 20 s. */
export function estimateSeconds(pages: readonly TimedPage[], defaultPauseMs = DEFAULT_PAUSE_MS): number {
  return Math.max(20, estimateRuntimeSeconds(pages, defaultPauseMs));
}

/**
 * What carries the words on this tape:
 *   - READ-ALONG — no page has recorded narration (the browser voice reads it)
 *   - AAC/M4A    — every recorded page is AAC
 *   - WAV        — any recorded page is WAV (the permitted fallback)
 *   - RECORDED   — a recorded page whose codec is neither declared nor readable
 *                  off its URL; never labelled AAC/M4A on a guess
 */
export type NarrationKind = "READ-ALONG" | "AAC/M4A" | "WAV" | "RECORDED";

type Codec = "aac" | "wav" | "unknown";

/** Declared `audioCodec` first; otherwise the URL's extension or data: mime. */
function codecOf(text: NonNullable<TimedPage["text"]>): Codec {
  if (text.audioCodec === "aac" || text.audioCodec === "wav") return text.audioCodec;
  const url = (text.audioUrl ?? "").toLowerCase();
  if (url.startsWith("data:")) {
    const mime = url.slice("data:".length).split(/[;,]/)[0];
    if (/^audio\/(mp4|m4a|x-m4a|aac)$/.test(mime)) return "aac";
    if (/^audio\/(wav|wave|x-wav|vnd\.wave)$/.test(mime)) return "wav";
    return "unknown";
  }
  const pathOnly = url.split(/[?#]/)[0];
  if (/\.(m4a|mp4|aac)$/.test(pathOnly)) return "aac";
  if (/\.wav$/.test(pathOnly)) return "wav";
  return "unknown";
}

export function narrationKind(pages: readonly TimedPage[]): NarrationKind {
  const codecs = new Set<Codec>();
  for (const page of pages) {
    if (page.text?.audioUrl) codecs.add(codecOf(page.text));
  }
  if (codecs.size === 0) return "READ-ALONG";
  if (codecs.has("unknown")) return "RECORDED";
  if (codecs.has("wav")) return "WAV";
  return "AAC/M4A";
}

/** "~m:ss" for a manifest, honouring its `pauseBetweenPages` default as the Player does. */
export function runtimeLabel(manifest: TimedManifest): string {
  const defaultPauseMs = parseDuration(manifest.settings?.accessibility?.pauseBetweenPages, DEFAULT_PAUSE_MS);
  return `~${formatClock(estimateRuntimeSeconds(manifest.pages, defaultPauseMs))}`;
}

/** The label's mono line: `SIDE A · <n> PAGE(S) · ~<m:ss> · <kind>`. */
export function tapeMetaLine(manifest: TimedManifest): string {
  const n = manifest.pages.length;
  return `SIDE A · ${n} ${n === 1 ? "PAGE" : "PAGES"} · ${runtimeLabel(manifest)} · ${narrationKind(manifest.pages)}`;
}
