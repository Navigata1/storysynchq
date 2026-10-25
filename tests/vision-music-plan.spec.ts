/**
 * T10 · the music plan (Node-side, no browser).
 *
 * `src/components/player/music-plan.ts` answers, for any page of any manifest,
 * which mood the page plays (or silence) and how many seconds the bed takes to
 * cross into it. The Player asks it; so will the end card (T12) and the
 * Creator's per-page moods (T24). Pure module, relative imports only.
 *
 * Reference: s02 figure B "PAGE 3 → 4 · THE TURN" — Wonder → a crossfade wedge
 * → Adventure. The house tape's own manifest asks for 2 s into page 4 and 3 s
 * into page 6; a plain string page is entered in the 1.6 s default.
 */

import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_CROSSFADE_S,
  MAX_CROSSFADE_S,
  MIN_CROSSFADE_S,
  musicPlan,
  pageCrossfadeSeconds,
  pageMood,
  pageMusic,
  parseCrossfadeSeconds,
} from "../src/components/player/music-plan";
import { DUCK_DEPTH_DB } from "../src/lib/audio/engine";
import { resolveMood, type MoodName } from "../src/lib/audio/moods";
import type { SsyncManifest, SsyncPage } from "../src/lib/storysync/manifest";
import { PER_PAGE_MOOD_PLAN, PER_PAGE_MOOD_TAPE, QUIET_MIDDLE_TAPE } from "./fixtures/reader-tapes";

const HOUSE_TAPE = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "public", "demo", "brave-little-star.ssync.json"), "utf8"),
) as SsyncManifest;

/**
 * The Player's private mood logic as it stood before T10 (Player.tsx
 * `moodTokens` + `pageMood`), frozen here as the oracle: the music plan must
 * give the same answer for every page.
 */
function legacyPageMood(manifest: SsyncManifest, page: SsyncPage | undefined): MoodName | null {
  const raw = page?.music;
  const tokens: string[] = [];
  if (typeof raw === "string") {
    if (raw.trim()) tokens.push(raw);
  } else if (raw && typeof raw === "object") {
    const crossfade = (raw as { crossfade?: unknown }).crossfade;
    if (typeof crossfade === "string" && crossfade.trim()) tokens.push(crossfade);
  }
  if (tokens.length === 0) return null;
  const tracks = (manifest as { music?: { tracks?: Array<{ id?: string; mood?: string; prompt?: string }> } }).music
    ?.tracks;
  if (Array.isArray(tracks)) {
    for (const id of [...tokens]) {
      const track = tracks.find((t) => t?.id === id);
      if (track?.mood) tokens.push(track.mood);
      if (track?.prompt) tokens.push(track.prompt);
    }
  }
  for (const token of tokens) {
    const mood = resolveMood(token);
    if (mood) return mood;
  }
  return null;
}

function story(pages: Array<Partial<SsyncPage>>, extra: Record<string, unknown> = {}): SsyncManifest {
  return {
    version: "2.0",
    metadata: { title: "Plan fixture" },
    pages: pages.map((p, i) => ({ id: i + 1, ...p })),
    ...extra,
  } as SsyncManifest;
}

/* ─────────────────────────────────────────────────────── the house tape */

test.describe("T10 · music plan · the house tape", () => {
  test("mood per page: wonder ×3, adventure ×2, peaceful → Calm ×3", () => {
    expect(HOUSE_TAPE.pages).toHaveLength(8);
    const moods = HOUSE_TAPE.pages.map((p) => pageMood(HOUSE_TAPE, p));
    expect(moods).toEqual(["Wonder", "Wonder", "Wonder", "Adventure", "Adventure", "Calm", "Calm", "Calm"]);
  });

  test("crossfade seconds per page: the manifest's own 2 s and 3 s, 1.6 s elsewhere", () => {
    const seconds = HOUSE_TAPE.pages.map((p) => pageCrossfadeSeconds(p));
    expect(seconds).toEqual([1.6, 1.6, 1.6, 2, 1.6, 3, 1.6, 1.6]);
  });

  test("musicPlan(manifest) is the same answer, page by page", () => {
    const plan = musicPlan(HOUSE_TAPE);
    expect(plan).toHaveLength(8);
    HOUSE_TAPE.pages.forEach((p, i) => {
      expect(plan[i]).toEqual({ mood: pageMood(HOUSE_TAPE, p), crossfadeSeconds: pageCrossfadeSeconds(p) });
      expect(pageMusic(HOUSE_TAPE, p)).toEqual(plan[i]);
    });
  });
});

/* ───────────────────────────────────────────── the parse / clamp table */

test.describe("T10 · music plan · crossfade seconds", () => {
  test("the default is the bed's own 1.6 s, clamped to 0.05–10 s", () => {
    expect(DEFAULT_CROSSFADE_S).toBe(1.6);
    expect(MIN_CROSSFADE_S).toBe(0.05);
    expect(MAX_CROSSFADE_S).toBe(10);
  });

  const table: Array<[string, SsyncPage["music"] | undefined, number]> = [
    ['{ crossfade: "adventure", duration: "2s" }', { crossfade: "adventure", duration: "2s" }, 2],
    ['duration "3s"', { crossfade: "calm", duration: "3s" }, 3],
    ['duration "450ms"', { crossfade: "calm", duration: "450ms" }, 0.45],
    ['duration "1.2s"', { crossfade: "calm", duration: "1.2s" }, 1.2],
    ['duration " 2.5 s " (spaces)', { crossfade: "calm", duration: " 2.5 s " }, 2.5],
    ['duration "2S" (case)', { crossfade: "calm", duration: "2S" }, 2],
    ['a string page ("wonder")', "wonder", 1.6],
    ["no duration", { crossfade: "adventure" }, 1.6],
    ['unparseable "soon"', { crossfade: "adventure", duration: "soon" }, 1.6],
    ['empty ""', { crossfade: "adventure", duration: "" }, 1.6],
    ['negative "-2s"', { crossfade: "adventure", duration: "-2s" }, 1.6],
    ['trailing junk "2s please"', { crossfade: "adventure", duration: "2s please" }, 1.6],
    ['clamped high "20s"', { crossfade: "adventure", duration: "20s" }, 10],
    ['clamped low "10ms"', { crossfade: "adventure", duration: "10ms" }, 0.05],
    ['clamped low "0s"', { crossfade: "adventure", duration: "0s" }, 0.05],
    ["no music at all", undefined, 1.6],
  ];
  for (const [label, music, expected] of table) {
    test(`${label} → ${expected}`, () => {
      const page = { id: 1, ...(music === undefined ? {} : { music }) } as SsyncPage;
      expect(pageCrossfadeSeconds(page)).toBe(expected);
    });
  }

  test("parseCrossfadeSeconds ignores anything that is not a duration string", () => {
    expect(parseCrossfadeSeconds(2)).toBe(DEFAULT_CROSSFADE_S);
    expect(parseCrossfadeSeconds(null)).toBe(DEFAULT_CROSSFADE_S);
    expect(parseCrossfadeSeconds(undefined)).toBe(DEFAULT_CROSSFADE_S);
    expect(parseCrossfadeSeconds({ duration: "2s" })).toBe(DEFAULT_CROSSFADE_S);
    expect(parseCrossfadeSeconds("Infinitys")).toBe(DEFAULT_CROSSFADE_S);
    expect(parseCrossfadeSeconds("2")).toBe(2); // a bare number is seconds, as `parseDuration` reads it
    expect(pageCrossfadeSeconds(undefined)).toBe(DEFAULT_CROSSFADE_S);
  });
});

/* ──────────────────────────────────────────────────── moods, every shape */

test.describe("T10 · music plan · which mood", () => {
  test("v1 track ids resolve through music.tracks (mood first, then prompt)", () => {
    const v1 = story(
      [
        { music: "t-rain" },
        { music: "t-lullaby" },
        { music: { crossfade: "t-rain", duration: "2.5s" } },
        { music: "t-unknown-id" },
      ],
      {
        version: "1.0",
        music: {
          tracks: [
            { id: "t-rain", mood: "rain", prompt: "bright adventure strings" },
            { id: "t-lullaby", prompt: "a gentle lullaby on a music box" },
          ],
        },
      },
    );
    expect(v1.pages.map((p) => pageMood(v1, p))).toEqual(["Rain", "Hush", "Rain", "Wonder"]);
    expect(pageCrossfadeSeconds(v1.pages[2])).toBe(2.5);
  });

  test("a page that names no music is silence", () => {
    const quiet = story(
      [{}, { music: "" }, { music: "   " }, { music: { duration: "2s" } }, { music: { crossfade: "" } }, { music: "!!" }],
      { music: { tracks: [{ id: "wonder", mood: "wonder" }] } },
    );
    expect(quiet.pages.map((p) => pageMood(quiet, p))).toEqual([null, null, null, null, null, null]);
    expect(pageMood(quiet, undefined)).toBeNull();
    expect(pageMusic(quiet, quiet.pages[3])).toEqual({ mood: null, crossfadeSeconds: 2 });
  });

  test("same answers as the Player's pre-T10 logic, across every shape", () => {
    const corpus: SsyncManifest[] = [
      HOUSE_TAPE,
      PER_PAGE_MOOD_TAPE,
      QUIET_MIDDLE_TAPE,
      story([
        { music: "Hush" },
        { music: "a bit scary" },
        { music: "soft lullaby music" },
        { music: "soon" },
        { music: { crossfade: "Rain", duration: "4s" } },
        { music: { crossfade: "melancholy" } },
        { music: { duration: "1s" } },
        {},
        { music: "" },
        { music: "🎵" },
        { music: 42 as unknown as string },
        { music: null as unknown as string },
      ]),
      story([{ music: "a" }, { music: "b" }, { music: "c" }], {
        music: { tracks: [{ id: "a", mood: "joy" }, { id: "b", prompt: "spooky shadows" }, null, { id: "c" }] },
      }),
      story([{ music: "x" }], { music: { tracks: "not-an-array" } }),
    ];
    for (const m of corpus) {
      for (const p of m.pages) expect(pageMood(m, p), JSON.stringify(p.music)).toBe(legacyPageMood(m, p));
    }
  });
});

/* ───────────────────────────────────────────────── the fixture tapes */

test.describe("T10 · music plan · the reader fixtures", () => {
  test("the per-page-mood tape plays Wonder → Hush (4 s) → Rain → Wonder", () => {
    const plan = musicPlan(PER_PAGE_MOOD_TAPE);
    expect(plan.map((p) => p.mood)).toEqual([...PER_PAGE_MOOD_PLAN.moods]);
    expect(plan.map((p) => p.crossfadeSeconds)).toEqual([...PER_PAGE_MOOD_PLAN.crossfades]);
  });

  test("the quiet-middle tape has a silent page between two moods", () => {
    expect(musicPlan(QUIET_MIDDLE_TAPE).map((p) => p.mood)).toEqual(["Calm", null, "Joy"]);
  });
});

/* ──────────────────────────────────────────────────────── the duck depth */

test("T10 · the engine exports its duck depth in dB, derived from the duck factor (≈ 12.04)", () => {
  expect(DUCK_DEPTH_DB).toBeCloseTo(-20 * Math.log10(0.25), 10);
  expect(DUCK_DEPTH_DB).toBeCloseTo(12.04, 2);
  expect(Math.round(DUCK_DEPTH_DB)).toBe(12);
});
