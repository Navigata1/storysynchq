// T24a · Advanced: per-page moods. The Inspector's MOOD row gains "mood · page N"
// beside the whole-story select; each page publishes its own mood and plays it,
// in the Creator and in the Reader.
//
// Reference: s09 (docs/vision/reference/renders/s09.png, brief screens[8]) — the
// Inspector's MIX section draws MOOD "Hush · D open fourths/fifths · 66 BPM" with
// the line "whole story · per-page moods next"; HANDOFF §4 marks per-page moods
// in the Creator as Next. Doctrine: Stage = Player.
//
//   Node · the pure page-moods module (src/components/studio/page-moods.ts),
//          including sourcePageMoods on the house tape's JSON and on Twinkle
//   E2E  · /studio Advanced with the Twinkle draft: the page select, the line,
//          the Stage status row, the mood lane; publish and library read-back;
//          the published link in the Reader; Simple mode's Music card; delete
//          and move; /studio?open=house (and &mood=); the Creator's preview bed
//
// The family content is illustrative and lives in tests/fixtures only.

import fs from "node:fs";
import path from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  effectiveMood,
  moodsForLane,
  prunePageMoods,
  publishedMusic,
  renumberPageMoods,
  sanitizePageMoods,
  sourcePageMoods,
  type PageMoodsState,
} from "../src/components/studio/page-moods";
import { tapeSheet, type TapeSheetInput } from "../src/components/studio/tape-sheet";
import { MOODS, MOOD_NAMES, type MoodName } from "../src/lib/audio/moods";
import type { SsyncManifest } from "../src/lib/storysync/manifest";
import { DRAFT_KEY, LIBRARY_KEY, restoreDraft, seedStudioDraft } from "./fixtures/helpers";
import { REPO_ROOT, TWINKLE, loadTape } from "./fixtures/tapes";

/* ------------------------------------------------------------------ facts */

const HOUSE: SsyncManifest = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "public", "demo", "brave-little-star.ssync.json"), "utf8"),
);
const HOUSE_TITLE = "The Brave Little Star";

const HUSH = "rgb(169, 139, 245)"; // --mood-hush #a98bf5
const WONDER = "rgb(245, 181, 68)"; // --mood-wonder #f5b544

const READY = "Your tape is ready";
const BACK = "Back to the studio";

/** The shipped readout format, "<Name> · <scale> · <tempo> BPM". */
const readout = (name: MoodName) => `${name} · ${MOODS[name].scaleName} · ${MOODS[name].tempo} BPM`;
const sameAs = (name: MoodName) => `Same as the story (${name})`;

const SEL = {
  pageMood: "#insp-page-mood",
  storyMood: "#insp-mood",
  pageMoodLabel: 'label[for="insp-page-mood"]',
  reach: '[data-studio="mood-reach"]',
  status: '[data-studio="stage-status-music"]',
  segment: '[data-studio="mood-segment"]',
  laneLabel: '[data-studio="mood-lane-label"]',
  musicNote: '[data-studio="music-page-moods"]',
} as const;

/* ===================================================================== Node */

function state(over: Partial<PageMoodsState> = {}): PageMoodsState {
  return {
    mood: "Wonder",
    musicOn: true,
    pageMoods: {},
    manifest: { pages: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    ...over,
  };
}

test.describe("T24a · page moods (pure)", () => {
  test("effectiveMood / publishedMusic: the override, else the story mood; nothing with music off", () => {
    const plain = state();
    expect([1, 2, 3].map((id) => effectiveMood(plain, id))).toEqual(["Wonder", "Wonder", "Wonder"]);
    expect([1, 2, 3].map((id) => publishedMusic(plain, id))).toEqual(["Wonder", "Wonder", "Wonder"]);

    const hush = state({ pageMoods: { "3": "Hush" } });
    expect(effectiveMood(hush, 3)).toBe("Hush");
    expect(effectiveMood(hush, "3")).toBe("Hush");
    expect(effectiveMood(hush, 2)).toBe("Wonder");
    expect(effectiveMood(hush, undefined)).toBe("Wonder");
    expect([1, 2, 3].map((id) => publishedMusic(hush, id))).toEqual(["Wonder", "Wonder", "Hush"]);

    const off = state({ musicOn: false, pageMoods: { "3": "Hush" } });
    expect(effectiveMood(off, 3), "the page keeps its mood while the music is off").toBe("Hush");
    expect([1, 2, 3].map((id) => publishedMusic(off, id))).toEqual([undefined, undefined, undefined]);

    // A state written before T24a has no pageMoods at all.
    const older = state({ pageMoods: undefined });
    expect(effectiveMood(older, 3)).toBe("Wonder");
  });

  test("renumberPageMoods follows the pages to 1…n; prunePageMoods drops a deleted id", () => {
    expect(renumberPageMoods({ "7": "Hush" }, ["3", "7"])).toEqual({ "2": "Hush" });
    expect(renumberPageMoods({ "7": "Hush", "3": "Calm" }, [3, 7])).toEqual({ "1": "Calm", "2": "Hush" });
    expect(renumberPageMoods({ "9": "Hush" }, ["3", "7"]), "a page that is gone takes its mood with it").toEqual({});
    expect(renumberPageMoods({}, ["1"])).toEqual({});

    const moods: Record<string, MoodName> = { "2": "Rain", "3": "Hush" };
    const before = JSON.stringify(moods);
    expect(prunePageMoods(moods, [1, 2])).toEqual({ "2": "Rain" });
    expect(prunePageMoods(moods, ["1", "3"])).toEqual({ "3": "Hush" });
    expect(JSON.stringify(moods), "pure: the input is never mutated").toBe(before);
  });

  test("moodsForLane: one entry per page, null with music off", () => {
    const hush = state({ pageMoods: { "3": "Hush" } });
    expect(moodsForLane(hush)).toEqual(["Wonder", "Wonder", "Hush"]);
    expect(moodsForLane(state({ musicOn: false, pageMoods: { "3": "Hush" } }))).toEqual([null, null, null]);
    const five = state({ manifest: { pages: [1, 2, 3, 4, 5].map((id) => ({ id })) } });
    expect(moodsForLane(five)).toHaveLength(5);
  });

  test("sanitizePageMoods keeps only known pages and real mood names", () => {
    expect(sanitizePageMoods({ "1": "Hush", "2": "Banana", "9": "Calm", "3": 4 }, [1, 2, 3])).toEqual({ "1": "Hush" });
    expect(sanitizePageMoods(undefined, [1])).toEqual({});
    expect(sanitizePageMoods(null, [1])).toEqual({});
    expect(sanitizePageMoods(["Hush"], [0, 1])).toEqual({});
    expect(sanitizePageMoods("Hush", [1])).toEqual({});
  });

  test("sourcePageMoods: the house tape's arc through the music plan; Twinkle (all Wonder) has none", () => {
    // Page 4 is { crossfade: "adventure" }, page 6 { crossfade: "peaceful" }; "peaceful" is Calm.
    expect(sourcePageMoods(HOUSE, "Wonder")).toEqual({
      "4": "Adventure",
      "5": "Adventure",
      "6": "Calm",
      "7": "Calm",
      "8": "Calm",
    });
    expect(sourcePageMoods(loadTape("twinkle").manifest, "Wonder")).toEqual({});
    // Only pages whose mood differs from the story mood.
    expect(sourcePageMoods(HOUSE, "Calm")).toEqual({
      "1": "Wonder",
      "2": "Wonder",
      "3": "Wonder",
      "4": "Adventure",
      "5": "Adventure",
    });
    // A page with no music is not an override (it plays the story mood in the Creator).
    const quiet = { pages: [{ music: "Hush" }, {}, { music: "Rain" }] };
    expect(sourcePageMoods(quiet, "Hush")).toEqual({ "3": "Rain" });
  });

  test("the gate's sheet names every page's own mood (T14's Sound band tells the truth)", () => {
    const sound = (over: Partial<TapeSheetInput>) =>
      tapeSheet({
        manifest: { metadata: { title: "A tape" }, pages: [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id })) },
        mood: "Wonder",
        musicOn: true,
        byline: "",
        year: 2026,
        ...over,
      }).find((row) => row.layer === "Sound")!;
    const plain = "Wonder, a music box that dips under every word";
    // One mood on every page: T14's line, verbatim from s04.
    expect(sound({}).value).toBe(plain);
    expect(sound({ pageMoods: {} }).value).toBe(plain);
    // An override equal to the story mood changes nothing on the tape, so nothing on the sheet.
    expect(sound({ pageMoods: { "2": "Wonder" } }).value).toBe(plain);
    // Each other mood with its pages, in the order they first play; runs read "4–5".
    expect(sound({ pageMoods: { "3": "Hush" } }).value).toBe(`${plain} · Hush on page 3`);
    expect(sound({ pageMoods: sourcePageMoods(HOUSE, "Wonder") }).value).toBe(
      `${plain} · Adventure on pages 4–5 · Calm on pages 6–8`,
    );
    expect(sound({ pageMoods: { "8": "Rain", "2": "Rain", "5": "Calm", "3": "Rain" } }).value).toBe(
      `${plain} · Rain on pages 2–3, 8 · Calm on page 5`,
    );
    // An override for a page that is not in the story is not on the tape either.
    expect(sound({ pageMoods: { "42": "Hush" } }).value).toBe(plain);
    // The star keeps the story mood; music off is still silence, whatever the pages say.
    expect(sound({ pageMoods: { "3": "Hush" } }).mood).toBe("Wonder");
    expect(sound({ musicOn: false, pageMoods: { "3": "Hush" } }).value).toBe("No music · silence under the words");
  });
});

/* ====================================================================== E2E */

const frames = (page: Page): Locator => page.locator("[data-page-index]");

interface LibraryRow {
  shareCode?: string;
  ssyncData: SsyncManifest;
}

async function readLibrary(page: Page): Promise<LibraryRow[]> {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || "[]"), LIBRARY_KEY);
}

/** The autosaved draft's state, once it holds what `check` expects. */
async function draftPageMoods(page: Page): Promise<Record<string, string> | undefined> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    return (JSON.parse(raw) as { state: { pageMoods?: Record<string, string> } }).state.pageMoods;
  }, DRAFT_KEY);
}

async function draftPageMusic(page: Page): Promise<unknown[]> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    return (JSON.parse(raw) as { state: { manifest: { pages: Array<{ music?: unknown }> } } }).state.manifest.pages.map(
      (p) => p.music,
    );
  }, DRAFT_KEY);
}

async function openTwinkle(page: Page): Promise<void> {
  await seedStudioDraft(page, "twinkle");
  await page.goto("/studio");
  await restoreDraft(page);
  await expect(frames(page)).toHaveCount(5);
}

async function setAdvanced(page: Page, on: boolean): Promise<void> {
  const mode = page.locator('[data-sk="mode"] [role="switch"]');
  if ((await mode.getAttribute("aria-checked")) !== String(on)) {
    // A phone (< 640px) keeps Simple/Advanced behind the bar's "More" key (M6, s06 phone 2).
    if (!(await mode.isVisible())) await page.locator('[data-studio="bar-more"]').click();
    await mode.click();
  }
  await expect(mode).toHaveAttribute("aria-checked", String(on));
  if (on) await expect(page.locator("#insp-autopause")).toBeVisible();
  else await expect(page.locator("#insp-autopause")).toHaveCount(0);
}

async function selectPage(page: Page, n: number): Promise<void> {
  await frames(page).nth(n - 1).click();
  await expect(frames(page).nth(n - 1)).toHaveAttribute("aria-current", "true");
}

async function setPageMood(page: Page, n: number, mood: MoodName | ""): Promise<void> {
  await selectPage(page, n);
  await page.locator(SEL.pageMood).selectOption(mood);
  await expect(page.locator(SEL.pageMood)).toHaveValue(mood);
}

async function laneColours(page: Page): Promise<string[]> {
  return page.locator(SEL.segment).evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
}

async function laneMoods(page: Page): Promise<string[]> {
  return page.locator(SEL.segment).evaluateAll((els) => els.map((el) => el.getAttribute("data-mood") ?? ""));
}

function musicCard(page: Page) {
  return page.getByRole("navigation", { name: "Story tools" }).getByRole("button", { name: /Music/ });
}

/**
 * "Finish my story" → the gate: answer a×b, type the byline, tick every voice, Continue.
 * With `sound`, the sheet's Sound band must read it first (the sheet tells the truth).
 */
async function publish(page: Page, sound?: string): Promise<string[]> {
  await page.getByRole("button", { name: "Finish my story" }).click();
  const dialog = page.getByRole("dialog", { name: "A grown-up moment" });
  await expect(dialog).toBeVisible({ timeout: 15000 });
  if (sound !== undefined) {
    await expect(
      page.locator('[data-studio="tape-sheet"] [data-sk="packet-band"][data-layer="Sound"] [data-band="value"]'),
    ).toHaveText(sound);
  }
  const question = page.locator('label[for="studio-gate-answer"]');
  await expect(question).toContainText(/\d+\s*[×x*]\s*\d+/);
  const match = (await question.innerText()).match(/(\d+)\s*[×x*]\s*(\d+)/);
  expect(match, "the gate asks an a×b question").not.toBeNull();
  await page.locator("#studio-gate-answer").fill(String(Number(match![1]) * Number(match![2])));
  await page.locator("#studio-gate-author").fill(TWINKLE.byline);
  for (const box of await dialog.locator('input[type="checkbox"]').all()) await box.check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: READY })).toBeVisible({ timeout: 60000 });
  const rows = await readLibrary(page);
  expect(rows).toHaveLength(1);
  return rows[0].ssyncData.pages.map((p) => String(p.music ?? "∅"));
}

async function backToStudio(page: Page): Promise<void> {
  await page.getByRole("button", { name: BACK }).click();
  await expect(page.getByRole("heading", { name: READY })).toHaveCount(0);
}

type StudioHookWindow = Window & {
  __ssyncStudio?: { musicPlaying(): boolean; moodName(): string | null; crossfadeSeconds(): number | null };
};

test.describe("T24a · the Inspector's MOOD row, the Stage and the lane", () => {
  test.setTimeout(90000);
  // The ticket's E2E seam is the desktop Studio: on a phone the Inspector is a
  // sheet over the strip, so the phone path has its own test below.
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop seam (the Inspector beside the strip)");
  });

  test("page 3 → Hush: the page select, the line, the Stage status row and the lane", async ({ page }) => {
    await openTwinkle(page);
    await setAdvanced(page, true);
    await selectPage(page, 3);

    const select = page.locator(SEL.pageMood);
    const reach = page.locator(SEL.reach);
    await expect(page.locator(SEL.pageMoodLabel)).toHaveText("mood · page 3");
    await expect(select).toHaveValue("");
    expect(await select.locator("option").allTextContents()).toEqual([
      sameAs("Wonder"),
      ...MOOD_NAMES.map(readout),
    ]);
    // The whole-story select is unchanged: its label and its eight readouts.
    await expect(page.locator('label[for="insp-mood"]')).toHaveText("mood");
    await expect(page.locator(SEL.storyMood)).toHaveValue("Wonder");
    expect(await page.locator(SEL.storyMood).locator("option").allTextContents()).toEqual(MOOD_NAMES.map(readout));
    await expect(reach).toHaveText("whole story · every page");

    await select.selectOption("Hush");
    await expect(reach).toHaveText("whole story · page 3 has its own mood");
    const type = await reach.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { size: cs.fontSize, family: cs.fontFamily };
    });
    expect(type.size).toBe("10.5px");
    expect(type.family.toLowerCase()).toContain("mono");
    await expect(page.locator(SEL.storyMood), "the story mood stays Wonder").toHaveValue("Wonder");

    // Stage = Player: the Stage names the active page's mood; the lane draws it.
    await expect(page.locator(SEL.status)).toHaveText("Hush · music on");
    expect(await laneMoods(page)).toEqual(["Wonder", "Wonder", "Hush", "Wonder", "Wonder"]);
    const colours = await laneColours(page);
    expect(colours[2]).toBe(HUSH);
    for (const i of [0, 1, 3, 4]) expect(colours[i]).toBe(WONDER);
    await expect(page.locator(SEL.laneLabel)).toHaveText("Hush · gentle music added for you");

    // Page 2 follows the story.
    await selectPage(page, 2);
    await expect(page.locator(SEL.pageMoodLabel)).toHaveText("mood · page 2");
    await expect(select).toHaveValue("");
    await expect(reach).toHaveText("whole story · every page");
    await expect(page.locator(SEL.status)).toHaveText("Wonder · music on");
    await expect(page.locator(SEL.laneLabel)).toHaveText("Wonder · gentle music added for you");

    // The whole-story select moves every page that follows the story, not page 3.
    await page.locator(SEL.storyMood).selectOption("Calm");
    expect(await laneMoods(page)).toEqual(["Calm", "Calm", "Hush", "Calm", "Calm"]);
    await page.locator(SEL.storyMood).selectOption("Wonder");

    // Draft-only: the override lives in pageMoods, never in the draft's page.music.
    await expect.poll(() => draftPageMoods(page)).toEqual({ "3": "Hush" });
    expect(await draftPageMusic(page)).toEqual([undefined, undefined, undefined, undefined, undefined]);

    // "Same as the story" removes it.
    await setPageMood(page, 3, "");
    await expect(reach).toHaveText("whole story · every page");
    await expect(page.locator(SEL.status)).toHaveText("Wonder · music on");
    await expect.poll(() => draftPageMoods(page)).toEqual({});
  });

  test("keyboard: page mood → whole-story mood → T17's switch, in that order", async ({ page }) => {
    await openTwinkle(page);
    await setAdvanced(page, true);
    await page.locator(SEL.pageMood).focus();
    await expect(page.locator(SEL.pageMood)).toHaveClass(/sk-focus/);
    await page.keyboard.press("Tab");
    await expect(page.locator(SEL.storyMood)).toBeFocused();
    // T24b's "Type a feeling" field sits between them (s09); empty, its buttons are disabled.
    await page.keyboard.press("Tab");
    await expect(page.locator("#insp-feeling")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#insp-level-voices")).toBeFocused();
  });

  test("a restored draft keeps its overrides and drops stray entries", async ({ page }) => {
    await seedStudioDraft(page, "twinkle");
    // An older or hand-edited draft: one real override, one unknown page, one non-mood.
    await page.addInitScript((key) => {
      const raw = window.localStorage.getItem(key);
      if (!raw || window.sessionStorage.getItem("t24a-stray")) return;
      const envelope = JSON.parse(raw);
      envelope.state.pageMoods = { "2": "Rain", "42": "Hush", "4": "Banana" };
      window.localStorage.setItem(key, JSON.stringify(envelope));
      window.sessionStorage.setItem("t24a-stray", "1");
    }, DRAFT_KEY);
    await page.goto("/studio");
    await restoreDraft(page);
    await setAdvanced(page, true);
    await selectPage(page, 2);
    await expect(page.locator(SEL.pageMood)).toHaveValue("Rain");
    await selectPage(page, 4);
    await expect(page.locator(SEL.pageMood)).toHaveValue("");
    expect(await laneMoods(page)).toEqual(["Wonder", "Rain", "Wonder", "Wonder", "Wonder"]);
  });
});

test.describe("T24a · publish and play each page's mood", () => {
  test.setTimeout(150000);
  // The ticket's E2E seam is the desktop Studio: on a phone the Inspector is a
  // sheet over the strip, so the phone path has its own test below.
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop seam (the Inspector beside the strip)");
  });

  test("page 3 Hush publishes Hush on page 3 only, twice; the Reader plays it", async ({ page }) => {
    await openTwinkle(page);
    await setAdvanced(page, true);
    await setPageMood(page, 3, "Hush");

    const sheetSound = "Wonder, a music box that dips under every word · Hush on page 3";
    expect(await publish(page, sheetSound)).toEqual(["Wonder", "Wonder", "Hush", "Wonder", "Wonder"]);
    await backToStudio(page);
    expect(await publish(page, sheetSound), "a second publish writes the same moods").toEqual([
      "Wonder",
      "Wonder",
      "Hush",
      "Wonder",
      "Wonder",
    ]);

    const code = (await readLibrary(page))[0].shareCode;
    expect(code).toBeTruthy();
    await page.goto(`/read?story=${code}`);
    const root = page.locator(".pl-root");
    await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
    await page.getByRole("button", { name: /Tap to Begin/i }).click();
    await expect(root).toHaveAttribute("data-view", "page");
    await expect(root).toHaveAttribute("data-mood", "Wonder");
    const engineMood = () =>
      page.evaluate(
        () => (window as unknown as { __ssyncPlayer?: { moodName(): string | null } }).__ssyncPlayer?.moodName() ?? null,
      );
    await expect.poll(engineMood).toBe("Wonder");
    await page.keyboard.press("ArrowRight");
    await expect(root).toHaveAttribute("data-page", "2");
    await page.keyboard.press("ArrowRight");
    await expect(root).toHaveAttribute("data-page", "3");
    await expect(root).toHaveAttribute("data-mood", "Hush");
    await expect.poll(engineMood).toBe("Hush");
    await page.keyboard.press("ArrowLeft");
    await expect(root).toHaveAttribute("data-page", "2");
    await expect(root).toHaveAttribute("data-mood", "Wonder");
    await expect.poll(engineMood).toBe("Wonder");
  });

  test("Simple mode's Music card names the overrides, and choosing there sets every page", async ({ page }) => {
    await openTwinkle(page);
    await setAdvanced(page, true);
    await setPageMood(page, 3, "Hush");
    await setAdvanced(page, false);

    await musicCard(page).click();
    const line = page.locator(SEL.musicNote);
    await expect(line).toHaveText("1 page has its own mood — choosing here sets every page.");
    await musicCard(page).click();

    await setAdvanced(page, true);
    await setPageMood(page, 4, "Rain");
    await setAdvanced(page, false);
    await musicCard(page).click();
    await expect(line).toHaveText("2 pages have their own mood — choosing here sets every page.");

    await page.getByRole("radio", { name: /Calm/ }).click();
    await expect(page.getByRole("radio", { name: /Calm/ })).toHaveAttribute("aria-checked", "true");
    await expect(line).toHaveCount(0);
    expect(await laneMoods(page)).toEqual(["Calm", "Calm", "Calm", "Calm", "Calm"]);
    await expect.poll(() => draftPageMoods(page)).toEqual({});
    await musicCard(page).click();

    expect(await publish(page, "Calm, a music box that dips under every word")).toEqual([
      "Calm",
      "Calm",
      "Calm",
      "Calm",
      "Calm",
    ]);
  });

  test("deleting a page drops its override; moving a page keeps it", async ({ page }) => {
    await openTwinkle(page);
    await setAdvanced(page, true);

    // Move page 3 earlier: its Hush goes with it.
    await setPageMood(page, 3, "Hush");
    await page.getByRole("button", { name: "Move this page earlier" }).click();
    await expect(frames(page).nth(1)).toHaveAttribute("aria-current", "true");
    await expect(page.locator(SEL.pageMoodLabel)).toHaveText("mood · page 2");
    await expect(page.locator(SEL.pageMood)).toHaveValue("Hush");
    expect(await laneMoods(page)).toEqual(["Wonder", "Hush", "Wonder", "Wonder", "Wonder"]);
    await expect(page.locator("#studio-page-text")).toHaveValue(TWINKLE.pages[2].text);

    // Publish renumbers the pages, and the overrides with them: twice, the same.
    expect(await publish(page, "Wonder, a music box that dips under every word · Hush on page 2")).toEqual([
      "Wonder",
      "Hush",
      "Wonder",
      "Wonder",
      "Wonder",
    ]);
    await backToStudio(page);
    await expect.poll(() => draftPageMoods(page)).toEqual({ "2": "Hush" });
    expect(await publish(page)).toEqual(["Wonder", "Hush", "Wonder", "Wonder", "Wonder"]);
    await backToStudio(page);

    // Delete that page: no override remains.
    await selectPage(page, 2);
    await page.getByRole("button", { name: "Delete this page" }).click();
    await expect(frames(page)).toHaveCount(4);
    expect(await laneMoods(page)).toEqual(["Wonder", "Wonder", "Wonder", "Wonder"]);
    await expect.poll(() => draftPageMoods(page)).toEqual({});
    expect(await publish(page)).toEqual(["Wonder", "Wonder", "Wonder", "Wonder"]);
  });
});

test.describe("T24a · a re-voiced tape keeps its arc", () => {
  test.setTimeout(90000);
  // The ticket's E2E seam is the desktop Studio: on a phone the Inspector is a
  // sheet over the strip, so the phone path has its own test below.
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop seam (the Inspector beside the strip)");
  });

  async function expectHouseOpened(page: Page): Promise<void> {
    await expect(frames(page)).toHaveCount(8, { timeout: 30000 });
    await expect(page.locator("#studio-title")).toHaveValue(HOUSE_TITLE);
  }

  test("?open=house: pages 4–5 Adventure and 6–8 Calm over a Wonder story", async ({ page }) => {
    await page.goto("/studio?open=house");
    await expectHouseOpened(page);
    expect(await laneMoods(page)).toEqual([
      "Wonder",
      "Wonder",
      "Wonder",
      "Adventure",
      "Adventure",
      "Calm",
      "Calm",
      "Calm",
    ]);
    await setAdvanced(page, true);
    await expect(page.locator(SEL.storyMood)).toHaveValue("Wonder");
    await selectPage(page, 6);
    await expect(page.locator(SEL.pageMood)).toHaveValue("Calm");
    await expect(page.locator(SEL.reach)).toHaveText("whole story · page 6 has its own mood");
    await expect(page.locator(SEL.status)).toHaveText("Calm · music on");
    await selectPage(page, 4);
    await expect(page.locator(SEL.pageMood)).toHaveValue("Adventure");
    await selectPage(page, 1);
    await expect(page.locator(SEL.pageMood)).toHaveValue("");
    await expect(page.locator(SEL.pageMood).locator("option").first()).toHaveText(sameAs("Wonder"));
  });

  test("?open=house&mood=Hush: one mood on every page", async ({ page }) => {
    await page.goto("/studio?open=house&mood=Hush");
    await expectHouseOpened(page);
    expect(await laneMoods(page)).toEqual(Array.from({ length: 8 }, () => "Hush"));
    await setAdvanced(page, true);
    for (const n of [1, 4, 6, 8]) {
      await selectPage(page, n);
      await expect(page.locator(SEL.pageMood)).toHaveValue("");
      await expect(page.locator(SEL.pageMood).locator("option:checked")).toHaveText(sameAs("Hush"));
    }
  });
});

test.describe("T24a · the Creator's preview bed plays the page's own mood", () => {
  test.setTimeout(90000);
  // The ticket's E2E seam is the desktop Studio: on a phone the Inspector is a
  // sheet over the strip, so the phone path has its own test below.
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop seam (the Inspector beside the strip)");
  });

  test("playback from page 2 (Wonder) turns to page 3 (Hush) and the bed crossfades by default", async ({ page }) => {
    await openTwinkle(page);
    await setAdvanced(page, true);
    await setPageMood(page, 3, "Hush");
    await selectPage(page, 2);
    const hook = () =>
      page.evaluate(() => {
        const h = (window as StudioHookWindow).__ssyncStudio;
        return h ? { playing: h.musicPlaying(), mood: h.moodName(), crossfade: h.crossfadeSeconds() } : null;
      });

    await page.getByRole("button", { name: "Play the story" }).click();
    await expect.poll(hook).toEqual({ playing: true, mood: "Wonder", crossfade: null });
    // Page 2's clip (4.4 s) and pause (2 s), then the tape turns itself.
    await expect(frames(page).nth(2)).toHaveAttribute("aria-current", "true", { timeout: 20000 });
    await expect.poll(hook).toEqual({ playing: true, mood: "Hush", crossfade: 1.6 });
    await page.getByRole("button", { name: "Stop playing" }).click();
  });
});

test.describe("T24a · every width: the page's own mood through the Inspector, then the Music card", () => {
  test.setTimeout(90000);

  test("page 3 → Hush in the Inspector; the Music card says so and choosing there sets every page", async ({ page }) => {
    await openTwinkle(page);
    // Page 3 first (on a phone the Inspector is a sheet over the strip).
    await selectPage(page, 3);
    await setAdvanced(page, true);
    await expect(page.locator(SEL.pageMoodLabel)).toHaveText("mood · page 3");
    await page.locator(SEL.pageMood).selectOption("Hush");
    await expect(page.locator(SEL.reach)).toHaveText("whole story · page 3 has its own mood");
    await page.getByRole("button", { name: "Close inspector" }).click();
    await expect(page.locator("#insp-autopause")).toHaveCount(0);

    await expect(page.locator(SEL.status)).toHaveText("Hush · music on");
    expect(await laneMoods(page)).toEqual(["Wonder", "Wonder", "Hush", "Wonder", "Wonder"]);

    await musicCard(page).click();
    const line = page.locator(SEL.musicNote);
    await expect(line).toHaveText("1 page has its own mood — choosing here sets every page.");
    await expect(line).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Music mood" })).toHaveAttribute(
      "aria-describedby",
      "studio-music-page-moods",
    );
    // The page never scrolls sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

    // Keyboard: the radios are buttons; Enter on Calm sets every page.
    await page.getByRole("radio", { name: /Calm/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("radio", { name: /Calm/ })).toHaveAttribute("aria-checked", "true");
    await expect(line).toHaveCount(0);
    expect(await laneMoods(page)).toEqual(["Calm", "Calm", "Calm", "Calm", "Calm"]);
    await expect(page.locator(SEL.status)).toHaveText("Calm · music on");
    await expect.poll(() => draftPageMoods(page)).toEqual({});
  });
});
