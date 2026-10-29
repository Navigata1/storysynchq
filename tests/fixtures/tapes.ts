/**
 * The Vision Reel's two family tapes, as test fixtures: the facts, the files,
 * and a loader.
 *
 *   "Twinkle Came to My Window" — Mia's five crayon pages in her voice (s03–s06)
 *   "Goodnight, Mia"            — Grandma's one-page answer (s06)
 *
 * ILLUSTRATIVE ONLY. The family, the drawings, the words and the timestamps
 * belong to the reference reel (docs/vision/HANDOFF.md §1, §12). They live in
 * tests/ so tests can drive the app into the reference states, and nowhere
 * else: tests/fixtures-vision.spec.ts fails if any of it reaches src/ or
 * public/.
 *
 * Pure Node — imports only src/lib/storysync/* and node: modules, so any spec
 * (Node-side or E2E) can use it. The files themselves are made by
 * generate-fixtures.ts; see README.md in this folder.
 */

import fs from "node:fs";
import path from "node:path";
import { loadStorysyncToStory, unpackStorysync } from "../../src/lib/storysync/container";
import type { SsyncManifest, SsyncSignature } from "../../src/lib/storysync/manifest";

export type TapeName = "twinkle" | "goodnight-mia";
export const TAPE_NAMES: readonly TapeName[] = ["twinkle", "goodnight-mia"];

/* ------------------------------------------------------------------ facts */

export interface PageFact {
  id: number;
  /** The page's words, verbatim from the reference. */
  text: string;
  /** Length of the narration clip, seconds. */
  clipSeconds: number;
  /**
   * Peak level of the clip, dBFS. Deliberately unequal across Mia's pages so
   * voice levelling (T17) has something to even out.
   */
  peakDbfs: number;
  /** What the Creator writes as `illustration.alt` for a photographed page. */
  alt: string;
}

export interface PictureFact {
  width: number;
  height: number;
  /** Reference source the picture is rasterized from (repo-relative). */
  source: string;
  /** `<symbol>` ids in that source, one per page. */
  symbols: string[];
  /** The symbols' own viewBox size (user units). */
  symbolViewBox: { width: number; height: number };
  /** Crayon paper drawn as a photo: an 8 px paper margin on #FBF7EC. */
  paper?: { color: string; marginPx: number };
}

export interface TapeFacts {
  name: TapeName;
  title: string;
  /** `metadata.author` — what the grown-up typed in "story by". */
  byline: string;
  /** `metadata.narrator` — who is speaking on the tape. */
  narrator: string;
  language: string;
  /** `metadata.created` — when the Creator was opened for this tape. */
  created: string;
  /** Mood on every page (`page.music`). */
  mood: string;
  /** `timing.autoPause` on every page (the Creator's default). */
  autoPause: string;
  pages: PageFact[];
  /** Sum of the clips, seconds. */
  totalSeconds: number;
  /** The Signature layer exactly as published. No `shareUrl`. */
  signature: SsyncSignature;
  picture: PictureFact;
}

/** Narration clip format: 16-bit PCM, mono, 16 kHz (32 000 bytes a second). */
export const CLIP_FORMAT = {
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  bytesPerSecond: 32000,
  /** A voiced tone at this fundamental, with harmonics … */
  fundamentalHz: 180,
  /** … amplitude-modulated at about this syllable rate … */
  syllableHz: 4,
  /** … with a fade in and out this long. */
  fadeMs: 80,
} as const;

/** JPEG budget per picture. */
export const PICTURE_MAX_BYTES = 120 * 1024;

const TWINKLE_BYLINE = "Mia, age 4 — with Mom";

export const TWINKLE: TapeFacts = {
  name: "twinkle",
  title: "Twinkle Came to My Window",
  byline: TWINKLE_BYLINE,
  narrator: "Mia",
  language: "en",
  created: "2026-10-19T18:02:10Z",
  mood: "Wonder",
  autoPause: "2s",
  pages: [
    { id: 1, text: "This is Twinkle. She is a little star.", clipSeconds: 5.1, peakDbfs: -9, alt: "Picture for page 1" },
    { id: 2, text: "Twinkle looked down at all the houses.", clipSeconds: 4.4, peakDbfs: -20, alt: "Picture for page 2" },
    { id: 3, text: "I was scared of the dark. Twinkle came to my window.", clipSeconds: 6.4, peakDbfs: -14, alt: "Picture for page 3" },
    { id: 4, text: "We flew over the moon!", clipSeconds: 3.8, peakDbfs: -26, alt: "Picture for page 4" },
    { id: 5, text: "Goodnight, Twinkle. Goodnight, Grandma!", clipSeconds: 4.3, peakDbfs: -12, alt: "Picture for page 5" },
  ],
  totalSeconds: 24.0,
  signature: {
    ownership: `© 2026 ${TWINKLE_BYLINE}`,
    rights: "personal use",
    voiceConsent: [{ voice: TWINKLE_BYLINE, grantedBy: "parent/guardian", date: "2026-10-19" }],
  },
  picture: {
    width: 600,
    height: 600,
    source: "docs/vision/reference/screens/s03.html",
    symbols: ["s03-d1", "s03-d2", "s03-d3", "s03-d4", "s03-d5"],
    symbolViewBox: { width: 300, height: 300 },
    paper: { color: "#FBF7EC", marginPx: 8 },
  },
};

export const GOODNIGHT_MIA: TapeFacts = {
  name: "goodnight-mia",
  title: "Goodnight, Mia",
  byline: "Grandma Rose",
  narrator: "Grandma Rose",
  language: "en",
  // Grandma answers at 6:31 pm the same evening (brief: timeline).
  created: "2026-10-19T18:31:00Z",
  // Made with the Creator's defaults: Wonder, music on, 2 s pauses.
  mood: "Wonder",
  autoPause: "2s",
  pages: [
    {
      id: 1,
      text: "Goodnight, my brave little star. I'll look for Twinkle at my window tonight. Love, Grandma.",
      clipSeconds: 7.6,
      // Not stated by the reference; chosen inside the range of Mia's clips.
      peakDbfs: -15,
      alt: "Picture for page 1",
    },
  ],
  totalSeconds: 7.6,
  signature: {
    ownership: "© 2026 Grandma Rose",
    rights: "personal use",
    // Adult self-consent (s06): the grown-up speaking is the voice on the tape.
    voiceConsent: [{ voice: "Grandma Rose", grantedBy: "self", date: "2026-10-19" }],
  },
  picture: {
    width: 600,
    height: 480,
    source: "docs/vision/reference/screens/s06.html",
    symbols: ["s06-win"],
    symbolViewBox: { width: 300, height: 240 },
  },
};

export const TAPES: Record<TapeName, TapeFacts> = {
  twinkle: TWINKLE,
  "goodnight-mia": GOODNIGHT_MIA,
};

/**
 * The share code the reference prints for Mia's tape. Illustrative: the app
 * mints its own unguessable codes. Tests that need a code should mint one.
 */
export const REFERENCE_SHARE_CODE = "3f9c2a7be41d0c58";

/* ------------------------------------------------------------------ files */

export const FIXTURES_DIR = path.resolve(__dirname);
export const REPO_ROOT = path.resolve(FIXTURES_DIR, "..", "..");

export interface TapeFiles {
  /** The packed `.storysync` container. */
  tape: string;
  /** Loose pictures, page order (`<name>/page-N.jpg`). */
  pictures: string[];
  /** Loose narration clips, page order (`<name>/narration-N.wav`). */
  clips: string[];
  /** Reference HTML the pictures are rasterized from. */
  source: string;
}

function filesFor(facts: TapeFacts): TapeFiles {
  const dir = path.join(FIXTURES_DIR, facts.name);
  return {
    tape: path.join(FIXTURES_DIR, `${facts.name}.storysync`),
    pictures: facts.pages.map((p) => path.join(dir, `page-${p.id}.jpg`)),
    clips: facts.pages.map((p) => path.join(dir, `narration-${p.id}.wav`)),
    source: path.join(REPO_ROOT, facts.picture.source),
  };
}

/** Absolute paths to every fixture file. */
export const FIXTURE_PATHS: Record<TapeName, TapeFiles> = {
  twinkle: filesFor(TWINKLE),
  "goodnight-mia": filesFor(GOODNIGHT_MIA),
};

/** Container-relative asset paths, as the manifest references them. */
export function assetPaths(pageId: number): { picture: string; clip: string } {
  return { picture: `assets/page-${pageId}.jpg`, clip: `assets/narration-${pageId}.wav` };
}

/* ----------------------------------------------------------------- loader */

export interface LoadedTape {
  /** The `.storysync` file's bytes. */
  bytes: Uint8Array;
  /** The manifest as packed (container-relative `assets/…` paths). */
  manifest: SsyncManifest;
  /** The app's story shape: every asset inlined as a data URL. */
  story: SsyncManifest;
}

/** Read a fixture tape through the app's own container code. */
export function loadTape(name: TapeName): LoadedTape {
  const bytes = new Uint8Array(fs.readFileSync(FIXTURE_PATHS[name].tape));
  return {
    bytes,
    manifest: unpackStorysync(bytes).manifest,
    story: loadStorysyncToStory(bytes),
  };
}
