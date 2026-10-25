/**
 * Re-voice: any tape → a Creator draft you can read in your own voice.
 *
 * The wedge (docs/vision/HANDOFF.md §2): "Make any storybook read itself in
 * the voice and mood you choose." Opening a tape in the Creator keeps what the
 * story IS — its pictures, its words, its pauses, its mood — and leaves behind
 * whatever belongs to the people who made it:
 *
 *   kept     title, author, language, genre, ageRange, description; settings;
 *            each page's illustration (url, alt, other fields), text.content,
 *            text.wordHighlight (and other text fields), timing, layout, and
 *            any page field this module does not know
 *   removed  metadata.narrator, metadata.coverImage, the whole signature
 *            (consent, ownership, rights, shareUrl, qrCode — consent never
 *            travels to a tape it was not given for); each page's
 *            text.audioUrl, text.audioCodec, text.voice and music; every
 *            other top-level field (a v1 tape's `voices` and `music` tables
 *            describe the source's voices and beds, which a re-voice replaces)
 *   set      version "2.0", metadata.created = now, pages renumbered 1…n
 *
 * Another family's recorded voice is never carried over: a page you record
 * plays your voice, and every page you have not recorded keeps the browser
 * voice, by the Player's existing rule.
 *
 * Pure: no DOM, no storage, no network, and the source is never mutated.
 * Imports types and `resolveMood` only (relative paths, so Node-side tests
 * import it directly).
 */

import type { SsyncManifest, SsyncPage } from "./manifest";
import { resolveMood, type MoodName } from "../audio/moods";

/**
 * Where a re-voiced tape came from. Draft-only Studio state: the publish
 * writes `of` into `signature.remixOf` and `author` into the ownership line,
 * and never writes the record itself into a manifest.
 */
export interface RemixRecord {
  /**
   * The source's `signature.shareUrl`, else the absolute app URL it was loaded
   * from (the house tape), else `"<title>" by <author>`.
   */
  of: string;
  /** The source's title. */
  title: string;
  /** The source's author ("" when it named none). The re-voiced tape keeps it. */
  author: string;
}

export interface RevoicedTape {
  /** The Creator draft manifest. */
  manifest: SsyncManifest;
  /** The story mood: the first page with music, through `resolveMood`; else Wonder. */
  mood: MoodName;
  /** Whether any source page had music. */
  musicOn: boolean;
  remix: RemixRecord;
}

export interface RevoiceOptions {
  /** The absolute URL the tape was loaded from, when it came from a URL (the house tape). */
  sourceRef?: string;
  /** "Now" for `metadata.created`. Default: the current time. */
  now?: Date;
}

/** Metadata fields a re-voiced tape keeps, in this order. */
const KEPT_METADATA = ["author", "genre", "ageRange", "language", "description"] as const;

const DEFAULT_MOOD: MoodName = "Wonder";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** A deep copy that cannot share a single object with the source. */
function copy<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function hasMusic(page: SsyncPage): boolean {
  const music = page.music as unknown;
  return music !== undefined && music !== null && music !== "";
}

/** `page.music` is a mood string or a crossfade object (`{ crossfade, duration }`). */
function musicMood(page: SsyncPage): MoodName | null {
  const music = page.music as unknown;
  if (typeof music === "string") return resolveMood(music);
  if (music && typeof music === "object") {
    const crossfade = (music as { crossfade?: unknown }).crossfade;
    return typeof crossfade === "string" ? resolveMood(crossfade) : null;
  }
  return null;
}

function revoicePage(source: SsyncPage, index: number): SsyncPage {
  const page = copy(source) as SsyncPage & Record<string, unknown>;
  delete page.music;
  if (page.text && typeof page.text === "object") {
    const text = page.text as NonNullable<SsyncPage["text"]> & Record<string, unknown>;
    delete text.audioUrl;
    delete text.audioCodec;
    delete text.voice;
    if (typeof text.content !== "string") text.content = "";
  }
  page.id = index + 1;
  return page;
}

export function revoiceManifest(source: SsyncManifest, options: RevoiceOptions = {}): RevoicedTape {
  const now = options.now ?? new Date();
  const sourceMeta = (source.metadata ?? {}) as SsyncManifest["metadata"] & Record<string, unknown>;
  const title = typeof sourceMeta.title === "string" ? sourceMeta.title : "";

  const metadata: SsyncManifest["metadata"] = { title };
  for (const key of KEPT_METADATA) {
    const value = sourceMeta[key];
    if (typeof value === "string") metadata[key] = value;
  }
  metadata.created = now.toISOString();

  const sourcePages = Array.isArray(source.pages) ? source.pages : [];
  const manifest: SsyncManifest = {
    version: "2.0",
    metadata,
    pages: sourcePages.map(revoicePage),
  };
  if (source.settings !== undefined) manifest.settings = copy(source.settings);

  const firstWithMusic = sourcePages.find(hasMusic);
  const mood = (firstWithMusic && musicMood(firstWithMusic)) || DEFAULT_MOOD;
  const musicOn = sourcePages.some(hasMusic);

  const author = typeof sourceMeta.author === "string" ? sourceMeta.author.trim() : "";
  const shareUrl = source.signature?.shareUrl;
  const of = nonEmpty(shareUrl)
    ? shareUrl.trim()
    : nonEmpty(options.sourceRef)
      ? options.sourceRef.trim()
      : author
        ? `"${title}" by ${author}`
        : `"${title}"`;

  return { manifest, mood, musicOn, remix: { of, title, author } };
}
