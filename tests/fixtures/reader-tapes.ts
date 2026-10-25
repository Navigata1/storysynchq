/**
 * Synthetic Reader tapes for the M2 tickets, and the one seeder that puts them
 * on this device.
 *
 *   silentWavDataUrl(seconds)  — a real, silent WAV of known length
 *   libraryRow(story, code)    — one `ssync-library` row, the shape the app saves
 *   seedReaderTapes(page, rows)— writes `ssync-library` ONCE per tab, in an init
 *                                script, before the app's own code runs
 *
 * Rows are opened with `/read?story=<shareCode>` (the Read Room's offline,
 * same-device path). A test that needs T00's Twinkle beside these tapes adds a
 * `libraryRow(loadTape("twinkle").story, …)` to the same `seedReaderTapes` call
 * instead of calling two seeders.
 *
 * Every tape here is original test content made for one check. None of it is
 * product content: nothing in this file may be imported from src/ or public/.
 * Later M2 tickets append their tapes below, in chain order.
 *
 * Pure Node apart from the Playwright `Page` type.
 */

import type { Page } from "@playwright/test";
import type { SsyncManifest, SsyncPage } from "../../src/lib/storysync/manifest";

/** The device library key (src/lib/cloud-storage.ts). */
export const READER_LIBRARY_KEY = "ssync-library";

/* ------------------------------------------------------------------ audio */

/** A real WAV of known length — the stand-in for a recorded voice. 16-bit PCM, mono. */
export function silentWavDataUrl(seconds = 6, rate = 8000): string {
  const samples = Math.round(seconds * rate);
  const dataBytes = samples * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);
  return `data:audio/wav;base64,${buf.toString("base64")}`;
}

/* ---------------------------------------------------------------- library */

/** One row of this device's library, as `src/lib/cloud-storage.ts` writes it. */
export interface ReaderLibraryRow {
  id: string;
  shareCode: string;
  title: string;
  author: string;
  genre: string;
  ageRange: string;
  pageCount: number;
  description: string;
  thumbnail: string | null;
  createdAt: string;
  isPublic: boolean;
  ssyncData: SsyncManifest;
}

/**
 * A library row for `story`, opened at `/read?story=<shareCode>`.
 * Share codes here are 32 lowercase hex characters, the shape a minted code has.
 */
export function libraryRow(
  story: SsyncManifest,
  shareCode: string,
  extra: Partial<Omit<ReaderLibraryRow, "ssyncData" | "shareCode">> = {},
): ReaderLibraryRow {
  return {
    id: shareCode,
    shareCode,
    title: story.metadata.title,
    author: story.metadata.author ?? "",
    genre: story.metadata.genre ?? "children",
    ageRange: story.metadata.ageRange ?? "3-8",
    pageCount: story.pages.length,
    description: story.metadata.description ?? "",
    thumbnail: null,
    createdAt: new Date().toISOString(),
    isPublic: true,
    ...extra,
    ssyncData: story,
  };
}

/**
 * Write `rows` as this device's whole `ssync-library`, once per tab: the init
 * script runs before the app's code on every document, but a session marker
 * keeps a reload from bringing back what the app has since saved or deleted.
 */
export async function seedReaderTapes(page: Page, rows: readonly ReaderLibraryRow[]): Promise<void> {
  await page.addInitScript(
    ({ key, marker, json }) => {
      try {
        if (window.sessionStorage.getItem(marker)) return;
        window.localStorage.setItem(key, json);
        window.sessionStorage.setItem(marker, "1");
      } catch {
        /* opaque origins (about:blank) have no storage; the next document seeds */
      }
    },
    {
      key: READER_LIBRARY_KEY,
      marker: `ssync-reader-tapes-seeded:${READER_LIBRARY_KEY}`,
      json: JSON.stringify(rows),
    },
  );
}

/* --------------------------------------------------------- page builders */

function voicedPage(
  id: number,
  content: string,
  music: SsyncPage["music"] | undefined,
  clipSeconds = 2,
): SsyncPage {
  const page: SsyncPage = {
    id,
    layout: "illustration-top",
    illustration: { url: `/demo/images/page${((id - 1) % 7) + 1}.jpg`, alt: `Picture ${id}` },
    text: { content, audioUrl: silentWavDataUrl(clipSeconds), audioCodec: "wav" },
  };
  if (music !== undefined) page.music = music;
  return page;
}

/** The fixture clips are generated silence; the tapes still carry a consent record (format-spec §7.1). */
const FIXTURE_CONSENT = { voice: "Reader fixture (a silent clip)", grantedBy: "self", date: "2026-10-25" };

/* ===================================================== T10 · per-page moods */

/** Share code of the per-page-mood tape (`/read?story=<code>`). */
export const PER_PAGE_MOOD_CODE = "a10a10a10a10a10a10a10a10a10a10a1";

/**
 * Four pages, four moods as the Creator will write them (T24): a plain mood,
 * a `{ crossfade, duration }` object, then two plain moods. Entering page 2
 * takes 4 s; pages 3 and 4 name no duration, so 1.6 s.
 * Recorded (silent) voices and autoPlay off: nothing turns a page but the test.
 */
export const PER_PAGE_MOOD_TAPE: SsyncManifest = {
  version: "2.0",
  metadata: { title: "Four Kinds of Weather", author: "Reader fixture", genre: "children", ageRange: "3-8" },
  settings: { autoPlay: false, pageTurnSound: true, readAlongHighlight: true },
  signature: { voiceConsent: [FIXTURE_CONSENT] },
  pages: [
    voicedPage(1, "The morning was bright and full of questions.", "Wonder"),
    voicedPage(2, "Then everything went soft and very still.", { crossfade: "Hush", duration: "4s" }),
    voicedPage(3, "Rain tapped a small song on the window.", "Rain"),
    voicedPage(4, "And the bright morning came back to play.", "Wonder"),
  ],
};

/** What each page of PER_PAGE_MOOD_TAPE must play, and how it is entered. */
export const PER_PAGE_MOOD_PLAN = {
  moods: ["Wonder", "Hush", "Rain", "Wonder"],
  crossfades: [1.6, 4, 1.6, 1.6],
} as const;

/** Share code of the music-then-silence tape. */
export const QUIET_MIDDLE_CODE = "a10b10b10b10b10b10b10b10b10b10b1";

/**
 * Music, then a page that names no music (silence: the bed stops), then music
 * again from silence.
 */
export const QUIET_MIDDLE_TAPE: SsyncManifest = {
  version: "2.0",
  metadata: { title: "The Quiet Middle", author: "Reader fixture", genre: "children", ageRange: "3-8" },
  settings: { autoPlay: false, pageTurnSound: true, readAlongHighlight: true },
  signature: { voiceConsent: [FIXTURE_CONSENT] },
  pages: [
    voicedPage(1, "The kettle hummed in the kitchen.", "Calm"),
    voicedPage(2, "Then nobody made a sound at all.", undefined),
    voicedPage(3, "Until the whole house laughed.", { crossfade: "Joy", duration: "2s" }),
  ],
};

/** Both T10 tapes as library rows. */
export function t10Rows(): ReaderLibraryRow[] {
  return [libraryRow(PER_PAGE_MOOD_TAPE, PER_PAGE_MOOD_CODE), libraryRow(QUIET_MIDDLE_TAPE, QUIET_MIDDLE_CODE)];
}

/* ======================================= T11 · author-default accessibility */

/*
 * Tapes whose storyteller asked for an accessibility default in
 * `settings.accessibility` (format-spec §4). A viewer with no stored choice
 * opens them that way; a viewer's own choice still wins. autoPlay is off on the
 * first three so nothing turns a page but the test.
 */

/** Share code of the high-contrast tape. */
export const AUTHOR_HIGH_CONTRAST_CODE = "a11a11a11a11a11a11a11a11a11a11a1";

/**
 * The storyteller asks for high contrast. Six-second clips, so a screenshot
 * catches the read-along sweep mid-sentence.
 */
export const authorHighContrastTape: SsyncManifest = {
  version: "2.0",
  metadata: { title: "A Lamp in the Window", author: "Reader fixture", genre: "children", ageRange: "3-8" },
  settings: {
    autoPlay: false,
    pageTurnSound: true,
    readAlongHighlight: true,
    accessibility: { highContrast: true, timingMultiplier: 1, pauseBetweenPages: "3s" },
  },
  signature: { voiceConsent: [FIXTURE_CONSENT] },
  pages: [
    voicedPage(1, "The lamp kept watch all night, and the moths came by to say hello.", "Calm", 6),
    voicedPage(2, "In the morning the lamp went to sleep, and the sun said hello instead.", "Wonder", 6),
  ],
};

/** Share code of the easier-to-read tape. */
export const AUTHOR_EASIER_READ_CODE = "a11b11b11b11b11b11b11b11b11b11b1";

/** The storyteller asks for the easier-to-read font (`dyslexiaFont`). */
export const authorEasierReadTape: SsyncManifest = {
  version: "2.0",
  metadata: { title: "Letters on the Fence", author: "Reader fixture", genre: "children", ageRange: "3-8" },
  settings: {
    autoPlay: false,
    pageTurnSound: true,
    readAlongHighlight: true,
    accessibility: { dyslexiaFont: true },
  },
  signature: { voiceConsent: [FIXTURE_CONSENT] },
  pages: [
    voicedPage(1, "Somebody painted big round letters on the garden fence.", "Joy"),
    voicedPage(2, "The snail read every one of them, very slowly, all the way home.", "Calm"),
  ],
};

/** Share code of the tape that asks for both. */
export const AUTHOR_BOTH_CODE = "a11c11c11c11c11c11c11c11c11c11c1";

/**
 * A *different* tape that also asks for high contrast, and for the
 * easier-to-read font: a viewer who turned high contrast off elsewhere keeps it
 * off here, and still gets this storyteller's font (field by field).
 */
export const authorBothTape: SsyncManifest = {
  version: "2.0",
  metadata: { title: "Two Lanterns", author: "Reader fixture", genre: "children", ageRange: "3-8" },
  settings: {
    autoPlay: false,
    pageTurnSound: true,
    readAlongHighlight: true,
    accessibility: { highContrast: true, dyslexiaFont: true },
  },
  signature: { voiceConsent: [FIXTURE_CONSENT] },
  pages: [
    voicedPage(1, "Two lanterns walked down the hill to find the river.", "Hush"),
    voicedPage(2, "The river was already shining, so they sat down and shone too.", "Calm"),
  ],
};

/** Share code of the slow-pause tape. */
export const AUTHOR_SLOW_PAUSE_CODE = "a11d11d11d11d11d11d11d11d11d11d1";

/**
 * `timingMultiplier: 3` on a one-second `autoPause` after a one-second clip:
 * the page turns about 3 s after the voice ends, not 1 s. autoPlay is on.
 */
export const authorSlowPauseTape: SsyncManifest = {
  version: "2.0",
  metadata: { title: "The Patient Clock", author: "Reader fixture", genre: "children", ageRange: "3-8" },
  settings: {
    autoPlay: true,
    pageTurnSound: true,
    readAlongHighlight: true,
    accessibility: { timingMultiplier: 3 },
  },
  signature: { voiceConsent: [FIXTURE_CONSENT] },
  pages: [
    { ...voicedPage(1, "The clock waited.", "Calm", 1), timing: { autoPause: "1s" } },
    { ...voicedPage(2, "And waited, and then it chimed.", "Calm", 1), timing: { autoPause: "1s" } },
  ],
};

/** The four T11 tapes as library rows. */
export function t11Rows(): ReaderLibraryRow[] {
  return [
    libraryRow(authorHighContrastTape, AUTHOR_HIGH_CONTRAST_CODE),
    libraryRow(authorEasierReadTape, AUTHOR_EASIER_READ_CODE),
    libraryRow(authorBothTape, AUTHOR_BOTH_CODE),
    libraryRow(authorSlowPauseTape, AUTHOR_SLOW_PAUSE_CODE),
  ];
}
