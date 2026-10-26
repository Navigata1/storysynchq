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

/* ======================================= T08 · the desktop two-page spread */

/** An SVG picture as a data URL; its width/height attributes are its natural size. */
function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * A 4:3 picture (800×600 natural): a kite over a hill. Landscape on purpose,
 * so a spread that crops or stretches it to a square shows.
 */
export const WIDE_ART = svgDataUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">` +
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#27406b"/><stop offset="1" stop-color="#7d9cc4"/></linearGradient></defs>` +
    `<rect width="800" height="600" fill="url(#sky)"/>` +
    `<path d="M0 470 Q220 360 430 440 T800 410 V600 H0 Z" fill="#3d6b4a"/>` +
    `<path d="M560 120 L620 190 L560 260 L500 190 Z" fill="#f5b544" stroke="#1e1a16" stroke-width="6"/>` +
    `<path d="M560 260 C540 330 600 380 560 450" fill="none" stroke="#fffdf6" stroke-width="4"/>` +
    `<rect x="4" y="4" width="792" height="592" fill="none" stroke="#e3452f" stroke-width="8"/>` +
    `</svg>`,
);

/** A pure white picture (512×512): the worst art a sheer text page can sit beside. */
export const WHITE_ART = svgDataUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">` +
    `<rect width="512" height="512" fill="#ffffff"/></svg>`,
);

/** Share code of the 4:3-picture tape. */
export const WIDE_ART_CODE = "a08a08a08a08a08a08a08a08a08a08a0";

/**
 * Two pages with a landscape (4:3) picture and words, in two layouts. No
 * voice, no music: nothing turns a page but the test.
 */
export const wideArtTape: SsyncManifest = {
  version: "2.0",
  metadata: { title: "The Kite Over the Hill", author: "Reader fixture", genre: "children", ageRange: "3-8" },
  settings: { autoPlay: false, pageTurnSound: false, readAlongHighlight: true },
  pages: [
    {
      id: 1,
      layout: "illustration-top",
      illustration: { url: WIDE_ART, alt: "A yellow kite over a green hill" },
      text: { content: "The kite pulled and pulled until the whole hill seemed to lean after it." },
    },
    {
      id: 2,
      layout: "illustration-full",
      illustration: { url: WIDE_ART, alt: "The kite, higher now" },
      text: { content: "Then the wind let go, and the kite came down to rest on the grass." },
    },
  ],
};

/** Share code of the white-picture tape. */
export const WHITE_ART_CODE = "a08b08b08b08b08b08b08b08b08b08b0";

/** Two "full" pages whose picture is pure white, the second with music. */
export const whiteArtTape: SsyncManifest = {
  version: "2.0",
  metadata: { title: "A Page of Snow", author: "Reader fixture", genre: "children", ageRange: "3-8" },
  settings: { autoPlay: false, pageTurnSound: false, readAlongHighlight: true },
  pages: [
    {
      id: 1,
      layout: "illustration-full",
      illustration: { url: WHITE_ART, alt: "A white page" },
      text: { content: "Snow fell all night, and in the morning the garden was a clean white page." },
    },
    {
      id: 2,
      layout: "full",
      illustration: { url: WHITE_ART, alt: "Still white" },
      text: { content: "Nobody had written on it yet." },
      music: "Hush",
    },
  ],
};

/** Both T08 tapes as library rows. */
export function t08Rows(): ReaderLibraryRow[] {
  return [libraryRow(wideArtTape, WIDE_ART_CODE), libraryRow(whiteArtTape, WHITE_ART_CODE)];
}

/* ===================================== T09a · the deck chip's three sounds */

/*
 * Tapes for the CHIME row and the text page's foot line. Each page carries a
 * picture and words (so the desktop spread has a text page to put the foot
 * line on) and a one-second silent clip, so the hold before an automatic turn
 * starts about 1.7 s after Tap to Begin (the 700 ms beat + the clip).
 */

/** Share code of the countdown tape. */
export const COUNTDOWN_CODE = "a09a09a09a09a09a09a09a09a09a09a0";

/**
 * autoPlay on, the cue on, a one-second clip, then a four-second hold: the
 * chip counts "next turn in 0:04 … 0:01" and the page turns by itself.
 */
export const countdownTape: SsyncManifest = {
  version: "2.0",
  metadata: { title: "The Kettle Counts to Four", author: "Reader fixture", genre: "children", ageRange: "3-8" },
  settings: { autoPlay: true, pageTurnSound: true, readAlongHighlight: true },
  signature: { voiceConsent: [FIXTURE_CONSENT] },
  pages: [
    { ...voicedPage(1, "The kettle sang one short note.", "Calm", 1), timing: { autoPause: "4s" } },
    { ...voicedPage(2, "Then it waited for the tea.", "Calm", 1), timing: { autoPause: "4s" } },
    { ...voicedPage(3, "And the tea was ready.", "Calm", 1), timing: { autoPause: "4s" } },
  ],
};

/** Share code of the no-cue tape. */
export const NO_CUE_CODE = "a09b09b09b09b09b09b09b09b09b09b0";

/** autoPlay on, `pageTurnSound: false`: the pages turn by themselves, silently. */
export const noCueTape: SsyncManifest = {
  version: "2.0",
  metadata: { title: "The Quiet Turn", author: "Reader fixture", genre: "children", ageRange: "3-8" },
  settings: { autoPlay: true, pageTurnSound: false, readAlongHighlight: true },
  signature: { voiceConsent: [FIXTURE_CONSENT] },
  pages: [
    { ...voicedPage(1, "The owl turned the page without a sound.", "Hush", 1), timing: { autoPause: "3s" } },
    { ...voicedPage(2, "Nobody woke up.", "Hush", 1), timing: { autoPause: "3s" } },
  ],
};

/** Share code of the manual tape. */
export const MANUAL_CODE = "a09c09c09c09c09c09c09c09c09c09c0";

/** `autoPlay: false`: nothing turns a page but the listener. */
export const manualTape: SsyncManifest = {
  version: "2.0",
  metadata: { title: "Turn It Yourself", author: "Reader fixture", genre: "children", ageRange: "3-8" },
  settings: { autoPlay: false, pageTurnSound: true, readAlongHighlight: true },
  signature: { voiceConsent: [FIXTURE_CONSENT] },
  pages: [
    voicedPage(1, "This page waits for you.", "Joy", 1),
    voicedPage(2, "And so does this one.", "Joy", 1),
  ],
};

/** The three T09a tapes as library rows. */
export function t09aRows(): ReaderLibraryRow[] {
  return [
    libraryRow(countdownTape, COUNTDOWN_CODE),
    libraryRow(noCueTape, NO_CUE_CODE),
    libraryRow(manualTape, MANUAL_CODE),
  ];
}

/* ================================================ T09b · tape-pack progress */

/*
 * A tape for the strip of tape filling up while a recorded voice plays. Page 1
 * carries a six-second (silent) clip under its words, so the strip and the
 * right pack can be sampled about 1 s and about 4 s into the clip; page 2 is a
 * picture with no words and no voice, so its beat passes and the tape stands
 * at its end. autoPlay is off: nothing turns a page but the test.
 */

/** Share code of the six-second-clip tape. */
export const LONG_CLIP_CODE = "a09d09d09d09d09d09d09d09d09d09d0";

/** Length of page 1's clip, seconds. */
export const LONG_CLIP_SECONDS = 6;

/** autoPlay off; a 6 s recorded voice on page 1, a wordless picture on page 2. */
export const longClipTape: SsyncManifest = {
  version: "2.0",
  metadata: { title: "The Slow Tide", author: "Reader fixture", genre: "children", ageRange: "3-8" },
  settings: { autoPlay: false, pageTurnSound: true, readAlongHighlight: true },
  signature: { voiceConsent: [FIXTURE_CONSENT] },
  pages: [
    voicedPage(1, "The tide went out slowly, one small wave at a time.", "Calm", LONG_CLIP_SECONDS),
    {
      id: 2,
      layout: "illustration-top",
      illustration: { url: "/demo/images/page2.jpg", alt: "Picture 2" },
      music: "Calm",
    },
  ],
};

/** The T09b tape as a library row. */
export function t09bRows(): ReaderLibraryRow[] {
  return [libraryRow(longClipTape, LONG_CLIP_CODE)];
}

/* ============================================ T12 · the end card's liner notes */

/*
 * Tapes for the J-card's VOICE and CONSENT rows (src/components/player/
 * liner-notes.ts). Twinkle (T00) is the one-voice, parent-consented tape; these
 * add the two shapes it cannot show. autoPlay is off: nothing turns a page but
 * the test.
 */

/** Share code of the two-voice consent tape. */
export const TWO_VOICE_CONSENT_CODE = "a12a12a12a12a12a12a12a12a12a12a1";

/**
 * Two recorded voices and one consent record each: a child's, given by a
 * parent or guardian, and a grown-up's own, given by the speaker ("self").
 * The J-card prints one CONSENT line per record, each led by the voice's name.
 */
export const twoVoiceConsentTape: SsyncManifest = {
  version: "2.0",
  metadata: {
    title: "The Two of Us",
    author: "Ada, age 5 — with Grandpa Joe",
    narrator: "Ada",
    genre: "children",
    ageRange: "3-8",
  },
  settings: { autoPlay: false, pageTurnSound: true, readAlongHighlight: true },
  signature: {
    ownership: "© 2026 Ada and Grandpa Joe",
    rights: "personal use",
    voiceConsent: [
      { voice: "Ada, age 5", grantedBy: "parent/guardian", date: "2026-10-20" },
      { voice: "Grandpa Joe", grantedBy: "self", date: "2026-10-21" },
    ],
  },
  pages: [
    creditedTo(voicedPage(1, "I read the first page.", "Joy", 1), "Ada, age 5"),
    creditedTo(voicedPage(2, "And I read the second one.", "Calm", 1), "Grandpa Joe"),
  ],
};

/** The page with its recorded voice credited to `voice` (`text.voice`). */
function creditedTo(page: SsyncPage, voice: string): SsyncPage {
  return page.text ? { ...page, text: { ...page.text, voice } } : page;
}

/** Share code of the recorded tape that carries no consent record. */
export const NO_CONSENT_CODE = "a12b12b12b12b12b12b12b12b12b12b1";

/**
 * A recorded voice and no Signature at all — an older or hand-made tape. The
 * J-card says so ("No consent record in this tape") instead of inventing one,
 * and with no narrator named, VOICE reads "A recorded voice".
 */
export const recordedNoConsentTape: SsyncManifest = {
  version: "2.0",
  metadata: { title: "A Voice in the Hall", author: "Reader fixture", genre: "children", ageRange: "3-8" },
  settings: { autoPlay: false, pageTurnSound: true, readAlongHighlight: true },
  pages: [voicedPage(1, "Somebody hummed in the hall.", undefined, 1)],
};

/** Both T12 tapes as library rows. */
export function t12Rows(): ReaderLibraryRow[] {
  return [
    libraryRow(twoVoiceConsentTape, TWO_VOICE_CONSENT_CODE),
    libraryRow(recordedNoConsentTape, NO_CONSENT_CODE),
  ];
}
