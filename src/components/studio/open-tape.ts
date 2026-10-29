"use client";

/**
 * The tape opener — how a tape reaches the Creator to be re-voiced (T15).
 *
 *   openTapeFile(file)   a .storysync from this device, unpacked here by the
 *                        container loader; nothing is fetched or uploaded
 *   openHouseTape()      "The Brave Little Star" from this app's /public
 *   openTapeByCode(code) the tape a share code names, resolved exactly as
 *                        /read?story=<code> resolves it (tape-source)
 *
 * Each one hands the source to `revoiceManifest`, which leaves every recorded
 * voice, voice name and signature behind, and then inlines each picture
 * through the shipped image pipeline (EXIF-safe, ≤ 2048 px, JPEG data URL).
 * The draft that comes out is self-contained: no picture still points
 * anywhere. Pictures are only ever fetched from this app's own `/demo/`, and
 * never for a file.
 *
 * The tape keeps its mood arc (T24a): before the source is re-voiced (which
 * leaves every page's music behind), each page's mood is read off it through
 * T10's music plan, and the pages whose mood differs from the story's become
 * the draft's per-page moods. A `?mood=` from the shelf still means one mood
 * on every page (`openedMoods`).
 *
 * The query side (`?open=` and `?mood=`) is read once, after mount, from
 * `window.location`, so /studio stays a static route.
 */

import { resolveMood, type MoodName } from "@/lib/audio/moods";
import { processImageSafe } from "@/lib/images";
import { dataUrlToBytes, loadStorysyncToStory } from "@/lib/storysync/container";
import type { SsyncManifest, SsyncPage } from "@/lib/storysync/manifest";
import { revoiceManifest, type RevoiceOptions, type RevoicedTape } from "@/lib/storysync/revoice";
import {
  HOUSE_TAPE_URL,
  loadTapeByCode,
  normalizeTapeManifest,
} from "@/lib/storysync/tape-source";
import { sourcePageMoods, type PageMoods } from "./page-moods";

export type { RevoicedTape } from "@/lib/storysync/revoice";

/** A re-voiced tape and the mood arc it came with (T24a). */
export interface OpenedTape extends RevoicedTape {
  /** Re-voiced page id → that page's own mood, where it differs from `mood`. */
  pageMoods: PageMoods;
}

/** What the Studio says when a tape will not open — the Read Room's own sentences. */
export const OPEN_TAPE_COPY = {
  badFile: "That file could not be opened as a .storysync tape.",
  notFound: "We couldn't find that tape",
  houseUnavailable: "The demo tape would not load. Check the connection and try again.",
} as const;

export type TapeOpenFailure = keyof typeof OPEN_TAPE_COPY;

export class TapeOpenError extends Error {
  constructor(public readonly reason: TapeOpenFailure) {
    super(OPEN_TAPE_COPY[reason]);
    this.name = "TapeOpenError";
  }
}

/** The value of `?open=` that means the house tape. */
export const HOUSE_TAPE_QUERY = "house";

/* ------------------------------------------------------------------ re-voice */

/**
 * `revoiceManifest`, keeping the arc: each source page's mood is read from the
 * source first, since the re-voiced pages carry no music. `revoice.ts` is
 * unchanged; its story mood is the arc's baseline.
 */
function revoiceKeepingMoods(source: SsyncManifest, options?: RevoiceOptions): OpenedTape {
  const tape = revoiceManifest(source, options);
  return { ...tape, pageMoods: tape.musicOn ? sourcePageMoods(source, tape.mood) : {} };
}

/**
 * The opened tape's music as the draft takes it. A mood chosen on the link
 * (`?mood=`, T22a) plays on every page, music on, and drops the arc;
 * otherwise the tape's own story mood, music and per-page moods.
 */
export function openedMoods(
  tape: OpenedTape,
  mood: MoodName | null,
): { mood: MoodName; musicOn: boolean; pageMoods: PageMoods } {
  return mood
    ? { mood, musicOn: true, pageMoods: {} }
    : { mood: tape.mood, musicOn: tape.musicOn, pageMoods: { ...tape.pageMoods } };
}

/* ---------------------------------------------------------------- pictures */

/** Where pictures may come from: only this app's own /demo/ files, and only when allowed. */
function appDemoUrl(url: string): string | null {
  try {
    const resolved = new URL(url, window.location.origin);
    if (resolved.origin !== window.location.origin) return null;
    return resolved.pathname.startsWith("/demo/") ? resolved.href : null;
  } catch {
    return null;
  }
}

async function pictureBlob(url: string, fetchFromApp: boolean): Promise<Blob | null> {
  if (url.startsWith("data:image/")) {
    // Decoded in memory: a data URL is never handed to fetch().
    const { bytes, mime } = dataUrlToBytes(url);
    return new Blob([new Uint8Array(bytes)], { type: mime });
  }
  const own = fetchFromApp ? appDemoUrl(url) : null;
  if (!own) return null;
  const response = await fetch(own);
  if (!response.ok) return null;
  const blob = await response.blob();
  return blob.type.startsWith("image/") ? blob : null;
}

/**
 * Every picture through the image pipeline. A picture that cannot be read
 * here — a remote URL, an asset the container lacked, a /demo/ file that is
 * missing — is left out (its alt text stays), never left pointing elsewhere.
 */
async function inlinePictures(tape: OpenedTape, fetchFromApp: boolean): Promise<OpenedTape> {
  const pages = await Promise.all(
    tape.manifest.pages.map(async (page): Promise<SsyncPage> => {
      const url = page.illustration?.url;
      if (!page.illustration || !url) return page;
      let inlined: string | undefined;
      try {
        const blob = await pictureBlob(url, fetchFromApp);
        inlined = blob ? (await processImageSafe(blob)).dataUrl : undefined;
      } catch {
        inlined = undefined;
      }
      const illustration = { ...page.illustration };
      if (inlined) illustration.url = inlined;
      else delete illustration.url;
      return { ...page, illustration };
    }),
  );
  const manifest: SsyncManifest = { ...tape.manifest, pages };
  return { ...tape, manifest };
}

/* ------------------------------------------------------------------ openers */

/** A .storysync file from this device. Throws `TapeOpenError("badFile")`. */
export async function openTapeFile(file: Blob): Promise<OpenedTape> {
  let story: SsyncManifest;
  try {
    story = loadStorysyncToStory(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new TapeOpenError("badFile");
  }
  return inlinePictures(revoiceKeepingMoods(story), false);
}

/** The house tape. Fetches only this app's own /demo/ files. */
export async function openHouseTape(): Promise<OpenedTape> {
  let source: SsyncManifest | null = null;
  try {
    const response = await fetch(HOUSE_TAPE_URL);
    if (response.ok) source = normalizeTapeManifest(await response.json());
  } catch {
    source = null;
  }
  if (!source) throw new TapeOpenError("houseUnavailable");
  const sourceRef = new URL(HOUSE_TAPE_URL, window.location.origin).href;
  return inlinePictures(revoiceKeepingMoods(source, { sourceRef }), true);
}

/** The tape a share code names: the cloud first, then this device. */
export async function openTapeByCode(code: string): Promise<OpenedTape> {
  const source = await loadTapeByCode(code);
  if (!source) throw new TapeOpenError("notFound");
  // Where it was loaded from, when the tape does not carry its own link.
  const sourceRef = `${window.location.origin}/read?story=${encodeURIComponent(code)}`;
  return inlinePictures(revoiceKeepingMoods(source, { sourceRef }), true);
}

/** `?open=house` or `?open=<code>`. */
export function openTapeFromQuery(open: string): Promise<OpenedTape> {
  return open === HOUSE_TAPE_QUERY ? openHouseTape() : openTapeByCode(open);
}

/** What the Studio says while it works, in the Read Room's words: a file, or a `?open=` value. */
export function openingLabel(source: { file: true } | { open: string }): string {
  if ("file" in source) return "Unwinding the tape…";
  return source.open === HOUSE_TAPE_QUERY ? "Threading the demo tape…" : "Finding that tape…";
}

/* -------------------------------------------------------------------- query */

/**
 * `?mood=` through `resolveMood`. `resolveMood` answers every non-empty string
 * (a word it does not know becomes the house default), so a query is taken
 * only when it names one of the eight moods, in any casing. Anything else is
 * ignored and the tape keeps its own mood.
 */
export function moodFromQuery(value: string | null | undefined): MoodName | null {
  if (!value) return null;
  const mood = resolveMood(value);
  return mood && mood.toLowerCase() === value.trim().toLowerCase() ? mood : null;
}

export interface OpenTapeQuery {
  /** `?open=`: "house" or a share code; null when absent. */
  open: string | null;
  /** `?mood=`, when it names a mood. */
  mood: MoodName | null;
}

/**
 * Read `?open=` and `?mood=` once, then take them off the address bar with
 * `history.replaceState`, so a refresh does not open the tape again. Call
 * after mount: it reads `window.location`.
 */
export function takeOpenTapeQuery(): OpenTapeQuery {
  const url = new URL(window.location.href);
  const open = url.searchParams.get("open")?.trim() || null;
  const mood = moodFromQuery(url.searchParams.get("mood"));
  if (url.searchParams.has("open") || url.searchParams.has("mood")) {
    url.searchParams.delete("open");
    url.searchParams.delete("mood");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return { open, mood };
}
