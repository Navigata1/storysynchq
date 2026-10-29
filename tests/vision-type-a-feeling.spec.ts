// T24b · Advanced: "Type a feeling". A parent types their own words in the
// Inspector's Mix section, the shared resolver (`resolveMood`) answers with one
// of the eight moods, and two buttons apply it to this page or to every page.
//
// Reference: s09 (docs/vision/reference/renders/s09.png, brief screens[8]) — the
// Inspector's MIX section draws "TYPE A FEELING", the input "a quiet lullaby for
// bedtime", an arrow and the Hush pill in --mood-hush. HANDOFF §4: the
// "'Type a feeling' field that runs resolveMood ('a quiet lullaby for bedtime'
// → Hush)".
//
//   Node · explainMood(value) → { mood, matched } against resolveMood and an
//          independent oracle (the vocabulary read from moods.ts itself)
//   E2E  · /studio Advanced with the Twinkle draft: the pill, Enter for this
//          page, "Use for every page", the house-default line, empty input,
//          the typed words never stored or sent, keyboard order and focus ring,
//          Simple mode unchanged; every width (the phone's Inspector sheet)
//   Fidelity · the house tape at 1290×900, page 3, "a quiet lullaby for
//          bedtime" → Hush (docs/vision/evidence/T24b-1290.png with
//          VISION_EVIDENCE=1)
//
// The family content is illustrative and lives in tests/fixtures only.

import fs from "node:fs";
import path from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { MOOD_NAMES, explainMood, resolveMood, type MoodName } from "../src/lib/audio/moods";
import type { SsyncManifest } from "../src/lib/storysync/manifest";
import { evidenceShot } from "./fixtures/evidence";
import { DRAFT_KEY, LIBRARY_KEY, restoreDraft, seedStudioDraft } from "./fixtures/helpers";
import { REPO_ROOT, TWINKLE } from "./fixtures/tapes";

/* ------------------------------------------------------------------ facts */

const LULLABY = "a quiet lullaby for bedtime";
const SCARY = "a bit scary";
const HOUSE_DEFAULT = "No feeling word we know — Wonder is the house default.";

const HUSH = "rgb(169, 139, 245)"; // --mood-hush #a98bf5
const WONDER = "rgb(245, 181, 68)"; // --mood-wonder #f5b544
const SUSPENSE = "rgb(123, 127, 232)"; // --mood-suspense #7b7fe8

const READY = "Your tape is ready";

const SEL = {
  input: "#insp-feeling",
  label: 'label[for="insp-feeling"]',
  pill: '[data-studio="feeling-result"]',
  note: '[data-studio="feeling-note"]',
  forPage: '[data-studio="feeling-page"]',
  forEvery: '[data-studio="feeling-every"]',
  arrow: '[data-studio="feeling-arrow"]',
  pageMood: "#insp-page-mood",
  storyMood: "#insp-mood",
  reach: '[data-studio="mood-reach"]',
  announcement: '[data-studio="announcement"]',
  segment: '[data-studio="mood-segment"]',
} as const;

/* ===================================================================== Node */

/**
 * The vocabulary as moods.ts writes it: the eight names and every synonym in
 * its SYNONYMS table, read from the source so the test cannot drift from it
 * (the table is private to the module).
 */
function readSynonyms(): Record<string, MoodName> {
  const source = fs.readFileSync(path.join(REPO_ROOT, "src", "lib", "audio", "moods.ts"), "utf8");
  const block = source.match(/const SYNONYMS[^=]*=\s*\{([\s\S]*?)\n\};/);
  expect(block, "moods.ts keeps its SYNONYMS table").not.toBeNull();
  const table: Record<string, MoodName> = {};
  for (const [, word, mood] of block![1].matchAll(/^\s*([a-z0-9]+):\s*"([A-Za-z]+)",?\s*$/gm)) {
    expect(MOOD_NAMES, `${word} → ${mood} is a real mood`).toContain(mood);
    table[word] = mood as MoodName;
  }
  return table;
}

const SYNONYMS = readSynonyms();
const VOCABULARY = new Map<string, MoodName>([
  ...MOOD_NAMES.map((name) => [name.toLowerCase(), name] as [string, MoodName]),
  ...(Object.entries(SYNONYMS) as [string, MoodName][]),
]);

/**
 * What explainMood must answer, worked out independently: words are runs of
 * a–z / 0–9 after lower-casing; the longest known word decides (ties go to the
 * first written); no known word → the house default Wonder with nothing
 * matched; no letter or digit at all (or not a string) → silence.
 */
function oracle(value: unknown): { mood: MoodName | null; matched: string | null } {
  if (typeof value !== "string") return { mood: null, matched: null };
  const words = value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) return { mood: null, matched: null };
  let best: string | null = null;
  for (const word of words) {
    if (VOCABULARY.has(word) && (best === null || word.length > best.length)) best = word;
  }
  return best ? { mood: VOCABULARY.get(best)!, matched: best } : { mood: "Wonder", matched: null };
}

/** True when the input has a letter or digit but no known word, or is empty: exactly when `matched` is null. */
function expectNoMatch(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const words = value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.length === 0 || !words.some((w) => VOCABULARY.has(w));
}

test.describe("T24b · explainMood (pure)", () => {
  test("the ticket's five examples", () => {
    expect(explainMood(LULLABY)).toEqual({ mood: "Hush", matched: "lullaby" });
    expect(explainMood(SCARY)).toEqual({ mood: "Suspense", matched: "scary" });
    expect(explainMood("Calm")).toEqual({ mood: "Calm", matched: "calm" });
    expect(explainMood("xyzzy")).toEqual({ mood: "Wonder", matched: null });
    expect(explainMood("")).toEqual({ mood: null, matched: null });
    expect(explainMood("!!")).toEqual({ mood: null, matched: null });
  });

  test("mood always equals resolveMood; matched is null exactly when nothing known decided it", () => {
    expect(Object.keys(SYNONYMS).length, "the SYNONYMS table was read").toBeGreaterThan(80);

    const phrases: unknown[] = [
      LULLABY,
      SCARY,
      "Calm",
      "xyzzy",
      "",
      "!!",
      // every mood name in three casings, and padded
      ...MOOD_NAMES.flatMap((name) => [name, name.toLowerCase(), name.toUpperCase(), `  ${name}!\n`]),
      // every synonym alone, shouted, and inside a sentence of unknown words
      ...Object.keys(SYNONYMS).flatMap((word) => [word, word.toUpperCase(), `it was ${word} at the end`]),
      // longest wins, ties go to the first written
      "soft lullaby music",
      "a sad but happy goodbye",
      "bedtime lullaby",
      "lullaby bedtime",
      "calm-ish, a little stormy",
      // junk
      "xyzzy plugh",
      "the cat sat on the mat",
      "   ",
      "\t\n",
      "---",
      "🎵🎶",
      "12345",
      "!!!wonder!!!",
      "naïve café",
      "a".repeat(80),
      // Object.prototype's names are not feelings
      "constructor",
      "a constructor of joy",
      "__proto__",
      "toString",
      "valueOf",
      "hasOwnProperty",
      "isPrototypeOf",
      // non-strings
      null,
      undefined,
      42,
      0,
      true,
      NaN,
      {},
      [],
      ["Hush"],
      { toString: () => "Hush" },
    ];

    for (const value of phrases) {
      const label = typeof value === "string" ? JSON.stringify(value) : String(value);
      const explained = explainMood(value as string);
      expect(explained.mood, `${label}: mood === resolveMood`).toBe(resolveMood(value as string));
      expect(explained, `${label}: the oracle`).toEqual(oracle(value));
      expect(explained.matched === null, `${label}: matched is null exactly when nothing known decided it`).toBe(
        expectNoMatch(value),
      );
      if (explained.matched !== null) {
        expect(VOCABULARY.get(explained.matched), `${label}: matched is a mood name or a synonym`).toBe(explained.mood);
      }
    }
  });

  test("each synonym alone and inside a sentence is the word that decided it", () => {
    for (const [word, mood] of Object.entries(SYNONYMS)) {
      expect(explainMood(word), word).toEqual({ mood, matched: word });
      expect(explainMood(`It was ${word.toUpperCase()} at the end.`), word).toEqual({ mood, matched: word });
    }
    for (const name of MOOD_NAMES) {
      expect(explainMood(name.toUpperCase())).toEqual({ mood: name, matched: name.toLowerCase() });
    }
  });

  test("Object.prototype's names resolve like any unknown word, never to a function", () => {
    for (const word of ["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"]) {
      expect(resolveMood(word), word).toBe("Wonder");
      expect(explainMood(word), word).toEqual({ mood: "Wonder", matched: null });
    }
    expect(resolveMood("a constructor of joy")).toBe("Joy");
    expect(explainMood("a constructor of joy")).toEqual({ mood: "Joy", matched: "joy" });
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

/** The autosaved draft, raw, with every data: URL (pictures, voices) blanked out. */
async function draftText(page: Page): Promise<string> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key) ?? "", DRAFT_KEY);
  return raw.replace(/data:[^"]*/g, "data:");
}

async function draftPageMoods(page: Page): Promise<Record<string, string> | undefined> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    return (JSON.parse(raw) as { state: { pageMoods?: Record<string, string> } }).state.pageMoods;
  }, DRAFT_KEY);
}

async function draftMood(page: Page): Promise<string | undefined> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { state: { mood?: string } }).state.mood : undefined;
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

async function laneMoods(page: Page): Promise<string[]> {
  return page.locator(SEL.segment).evaluateAll((els) => els.map((el) => el.getAttribute("data-mood") ?? ""));
}

/** The pill's computed look, read in one frame. */
async function pillLook(page: Page) {
  return page.locator(SEL.pill).evaluate((el) => {
    const cs = getComputedStyle(el);
    const icon = el.querySelector("svg");
    return {
      text: (el.textContent ?? "").trim(),
      mood: el.getAttribute("data-mood"),
      live: el.getAttribute("aria-live"),
      border: cs.borderTopColor,
      borderStyle: cs.borderTopStyle,
      background: cs.backgroundColor,
      icon: icon ? { hidden: icon.getAttribute("aria-hidden"), lucide: icon.getAttribute("class") ?? "" } : null,
      tabIndex: (el as HTMLElement).tabIndex,
    };
  });
}

/**
 * A computed colour as [r, g, b, a] (0–255, 0–1), whichever way the browser
 * serialises it: "rgb(…)", "rgba(…)" or a colour-mix()'s "color(srgb r g b / a)".
 */
function channels(colour: string): [number, number, number, number] {
  const n = (colour.match(/-?[\d.]+(?:e-?\d+)?/g) ?? []).map(Number);
  const scale = colour.trim().startsWith("color(") ? 255 : 1;
  return [n[0] * scale, n[1] * scale, n[2] * scale, n.length > 3 ? n[3] : 1];
}

/** `actual` is `rgb` at `alpha`, within rounding. */
function expectFill(actual: string, rgb: string, alpha: number, what: string): void {
  const [r, g, b, a] = channels(actual);
  const [er, eg, eb] = channels(rgb);
  expect(Math.abs(r - er), `${what}: red (${actual})`).toBeLessThanOrEqual(1);
  expect(Math.abs(g - eg), `${what}: green (${actual})`).toBeLessThanOrEqual(1);
  expect(Math.abs(b - eb), `${what}: blue (${actual})`).toBeLessThanOrEqual(1);
  expect(Math.abs(a - alpha), `${what}: alpha (${actual})`).toBeLessThanOrEqual(0.01);
}

/**
 * "Finish my story" → the gate: answer a×b, type the byline, tick every voice,
 * Continue. Returns each published page's `music`.
 */
async function publish(page: Page): Promise<string[]> {
  await page.getByRole("button", { name: "Finish my story" }).click();
  const dialog = page.getByRole("dialog", { name: "A grown-up moment" });
  await expect(dialog).toBeVisible({ timeout: 15000 });
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

/** Every request the page makes whose URL or body carries one of `words`. */
function watchWords(page: Page, words: readonly string[]): () => string[] {
  const hits: string[] = [];
  page.on("request", (request) => {
    const body = request.postData() ?? "";
    const url = request.url();
    for (const word of words) {
      if (url.toLowerCase().includes(word) || body.toLowerCase().includes(word)) hits.push(`${word} → ${url}`);
    }
  });
  return () => hits;
}

test.describe("T24b · the TYPE A FEELING row (desktop seam)", () => {
  test.setTimeout(90000);
  // The ticket's E2E seam is the desktop Studio, the Inspector beside the
  // strip; the phone's Inspector sheet has its own every-width test below.
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop seam (the Inspector beside the strip)");
  });

  test("page 3: \"a quiet lullaby for bedtime\" → Hush; Enter makes page 3 Hush", async ({ page }) => {
    await openTwinkle(page);
    await setAdvanced(page, true);
    await selectPage(page, 3);

    // The label, its type, the input's attributes.
    const label = page.locator(SEL.label);
    await expect(label).toHaveText("TYPE A FEELING", { useInnerText: true });
    const labelType = await label.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { size: cs.fontSize, family: cs.fontFamily.toLowerCase() };
    });
    expect(labelType.size).toBe("10.5px");
    expect(labelType.family).toContain("mono");
    const input = page.locator(SEL.input);
    await expect(input).toHaveAttribute("placeholder", LULLABY);
    await expect(input).toHaveAttribute("maxlength", "80");
    await expect(input).toHaveAttribute("autocomplete", "off");
    await expect(input).toHaveAttribute("type", "text");
    await expect(input).toHaveValue("");
    // In Mix, after the MOOD row (and before T17's switch).
    const order = await page.evaluate(() => {
      const ids = ["insp-page-mood", "insp-mood", "insp-feeling", "insp-level-voices"];
      const els = ids.map((id) => document.getElementById(id)!);
      return els.slice(1).map((el, i) => Boolean(els[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    expect(order, "page mood → story mood → feeling → the switch, in the DOM").toEqual([true, true, true]);
    const mix = page.locator("section", { has: page.getByRole("heading", { name: "Mix" }) });
    await expect(mix.locator(SEL.input)).toHaveCount(1);

    // No status chip in the row.
    const row = page.locator('[data-studio="feeling-row"]');
    await expect(row.locator(".sk-chip, .ss-chip, [data-sk='chip']")).toHaveCount(0);
    await expect(row).not.toContainText(/\b(Next|Idea|Phase 3)\b/);

    // Typing: the pill answers (debounced), in Hush's colour, with Hush's icon.
    await input.pressSequentially(LULLABY, { delay: 15 });
    const pill = page.locator(SEL.pill);
    await expect(pill).toHaveText("Hush");
    await expect(pill).toBeVisible();
    await expect(page.locator(SEL.arrow)).toBeVisible();
    const look = await pillLook(page);
    expect(look.mood).toBe("Hush");
    expect(look.live).toBe("polite");
    expect(look.border).toBe(HUSH);
    expect(look.borderStyle).toBe("solid");
    expectFill(look.background, HUSH, 0.2, "a 20% fill of the mood colour");
    expect(look.icon?.hidden).toBe("true");
    expect(look.icon?.lucide, "the kit's mood icon for Hush (lucide Cloud)").toMatch(/lucide-cloud\b/);
    expect(look.tabIndex, "the pill is not focusable").toBe(-1);
    await expect(page.locator(SEL.note), "a word was understood: no house-default line").toHaveText("");

    // Both actions name what they do.
    await expect(page.locator(SEL.forPage)).toHaveText("Use for page 3");
    await expect(page.locator(SEL.forEvery)).toHaveText("Use for every page");
    await expect(page.locator(SEL.forPage)).toBeEnabled();
    await expect(page.locator(SEL.forEvery)).toBeEnabled();

    // Enter in the input does what "Use for page 3" does.
    await expect(page.locator(SEL.pageMood)).toHaveValue("");
    await input.press("Enter");
    await expect(page.locator(SEL.pageMood)).toHaveValue("Hush");
    await expect(page.locator(SEL.storyMood), "the story keeps its mood").toHaveValue("Wonder");
    await expect(page.locator(SEL.reach)).toHaveText("whole story · page 3 has its own mood");
    await expect(page.locator(SEL.announcement)).toHaveText("Page 3 is Hush now.");
    await expect(page.locator(SEL.announcement)).toHaveAttribute("aria-live", "polite");
    expect(await laneMoods(page)).toEqual(["Wonder", "Wonder", "Hush", "Wonder", "Wonder"]);
    await expect.poll(() => draftPageMoods(page)).toEqual({ "3": "Hush" });
    // The words stay in the field after applying (the parent may use them again).
    await expect(input).toHaveValue(LULLABY);

    // The button does the same on another page, and names that page.
    await selectPage(page, 5);
    await expect(page.locator(SEL.forPage)).toHaveText("Use for page 5");
    await page.locator(SEL.forPage).click();
    await expect(page.locator(SEL.pageMood)).toHaveValue("Hush");
    await expect(page.locator(SEL.announcement)).toHaveText("Page 5 is Hush now.");
    await expect.poll(() => draftPageMoods(page)).toEqual({ "3": "Hush", "5": "Hush" });
  });

  test("\"xyzzy\" → Wonder, and the line says it is the house default", async ({ page }) => {
    await openTwinkle(page);
    await setAdvanced(page, true);
    await selectPage(page, 3);

    await page.locator(SEL.input).fill("xyzzy");
    await expect(page.locator(SEL.pill)).toHaveText("Wonder");
    const note = page.locator(SEL.note);
    await expect(note).toHaveText(HOUSE_DEFAULT);
    await expect(note).toBeVisible();
    const look = await pillLook(page);
    expect(look.border).toBe(WONDER);
    expect(look.icon?.lucide, "the kit's mood icon for Wonder (lucide Star)").toMatch(/lucide-star\b/);
    const noteType = await note.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { size: cs.fontSize, live: el.getAttribute("aria-live") };
    });
    expect(noteType.size).toBe("11.5px");
    expect(noteType.live).toBe("polite");
    // The input names the line for a screen reader.
    await expect(page.locator(SEL.input)).toHaveAttribute("aria-describedby", /insp-feeling-note/);

    // A word it knows takes the line away.
    await page.locator(SEL.input).fill("xyzzy storm");
    await expect(page.locator(SEL.pill)).toHaveText("Rain");
    await expect(note).toHaveText("");

    // The default is still a mood the parent may apply, honestly labelled.
    await page.locator(SEL.input).fill("xyzzy");
    await expect(note).toHaveText(HOUSE_DEFAULT);
    await page.locator(SEL.forPage).click();
    await expect(page.locator(SEL.pageMood)).toHaveValue("Wonder");
    await expect(page.locator(SEL.announcement)).toHaveText("Page 3 is Wonder now.");
  });

  test("\"a bit scary\" → \"Use for every page\": the story is Suspense, no page keeps its own; Finish publishes it", async ({
    page,
  }) => {
    test.setTimeout(150000);
    await openTwinkle(page);
    await setAdvanced(page, true);
    // Page 3 has its own mood first, so "every page" has an override to clear.
    await selectPage(page, 3);
    await page.locator(SEL.input).fill(LULLABY);
    await page.locator(SEL.input).press("Enter");
    await expect(page.locator(SEL.pageMood)).toHaveValue("Hush");

    await page.locator(SEL.input).fill(SCARY);
    await expect(page.locator(SEL.pill)).toHaveText("Suspense");
    expect((await pillLook(page)).border).toBe(SUSPENSE);
    await page.locator(SEL.forEvery).click();
    await expect(page.locator(SEL.storyMood)).toHaveValue("Suspense");
    await expect(page.locator(SEL.pageMood), "no page override").toHaveValue("");
    await expect(page.locator(SEL.pageMood).locator("option").first()).toHaveText("Same as the story (Suspense)");
    await expect(page.locator(SEL.reach)).toHaveText("whole story · every page");
    await expect(page.locator(SEL.announcement)).toHaveText("Every page is Suspense now.");
    expect(await laneMoods(page)).toEqual(["Suspense", "Suspense", "Suspense", "Suspense", "Suspense"]);
    await expect.poll(() => draftPageMoods(page)).toEqual({});
    await expect.poll(() => draftMood(page)).toBe("Suspense");

    expect(await publish(page)).toEqual(["Suspense", "Suspense", "Suspense", "Suspense", "Suspense"]);
    // Only the resolved name went into the tape: never the words.
    const tape = JSON.stringify((await readLibrary(page))[0].ssyncData).toLowerCase();
    expect(tape).not.toContain("scary");
    expect(tape).not.toContain("lullaby");
  });

  test("the typed words are never stored or sent; only the mood name is applied", async ({ page }) => {
    const sent = watchWords(page, ["lullaby", "scary"]);
    await openTwinkle(page);
    expect(await draftText(page), "the draft starts without the words").not.toMatch(/lullaby|scary/i);
    await setAdvanced(page, true);
    await selectPage(page, 3);

    await page.locator(SEL.input).fill(LULLABY);
    await expect(page.locator(SEL.pill)).toHaveText("Hush");
    await page.locator(SEL.input).press("Enter");
    await expect.poll(() => draftPageMoods(page)).toEqual({ "3": "Hush" });
    await page.locator(SEL.input).fill(SCARY);
    await expect(page.locator(SEL.pill)).toHaveText("Suspense");
    await page.locator(SEL.forEvery).click();
    await expect.poll(() => draftMood(page)).toBe("Suspense");
    // Give a debounced autosave every chance to have written the field's words.
    await page.locator("#studio-title").focus();
    await page.waitForTimeout(1500);

    const draft = await draftText(page);
    expect(draft).toContain('"mood":"Suspense"');
    expect(draft, "the draft never holds the typed words").not.toMatch(/lullaby|scary/i);
    const storage = await page.evaluate(() => {
      const all: string[] = [];
      for (const store of [window.localStorage, window.sessionStorage]) {
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i)!;
          all.push(`${key}=${(store.getItem(key) ?? "").replace(/data:[^"]*/g, "data:")}`);
        }
      }
      return all.join("\n");
    });
    expect(storage, "no storage on this device holds the typed words").not.toMatch(/lullaby|scary/i);
    expect(sent(), "nothing the page sends carries the typed words").toEqual([]);
  });

  test("empty input: no pill, both actions disabled (also for punctuation only)", async ({ page }) => {
    await openTwinkle(page);
    await setAdvanced(page, true);
    const pill = page.locator(SEL.pill);
    await expect(page.locator(SEL.input)).toHaveValue("");
    await expect(pill).toBeHidden();
    await expect(pill).toHaveText("");
    await expect(page.locator(SEL.arrow)).toBeHidden();
    await expect(page.locator(SEL.note)).toHaveText("");
    await expect(page.locator(SEL.forPage)).toBeDisabled();
    await expect(page.locator(SEL.forEvery)).toBeDisabled();

    // Enter on an empty field changes nothing.
    await page.locator(SEL.input).press("Enter");
    await expect(page.locator(SEL.pageMood)).toHaveValue("");
    await expect(page.locator(SEL.announcement)).not.toContainText("now.");

    await page.locator(SEL.input).fill("!!");
    await page.waitForTimeout(400);
    await expect(pill).toBeHidden();
    await expect(page.locator(SEL.forPage)).toBeDisabled();
    await expect(page.locator(SEL.forEvery)).toBeDisabled();

    // A word, then cleared again: the pill goes with it.
    await page.locator(SEL.input).fill("calm");
    await expect(pill).toHaveText("Calm");
    await page.locator(SEL.input).fill("");
    await expect(pill).toBeHidden();
    await expect(page.locator(SEL.forPage)).toBeDisabled();
  });

  test("keyboard: the input, then \"Use for page N\", then \"Use for every page\", each with the kit focus ring", async ({
    page,
  }) => {
    await openTwinkle(page);
    await setAdvanced(page, true);
    await selectPage(page, 3);

    // From the whole-story select, Tab reaches the input.
    await page.locator(SEL.storyMood).focus();
    await page.keyboard.press("Tab");
    await expect(page.locator(SEL.input)).toBeFocused();
    await page.keyboard.type("lullaby");
    await expect(page.locator(SEL.pill)).toHaveText("Hush");

    const ring = (locator: Locator) =>
      locator.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { cls: el.className, style: cs.outlineStyle, width: cs.outlineWidth };
      });
    expect(await ring(page.locator(SEL.input))).toMatchObject({ style: "solid", width: "3px" });

    // The pill is passed over: the next stop is "Use for page 3", then "Use for every page".
    await page.keyboard.press("Tab");
    await expect(page.locator(SEL.forPage)).toBeFocused();
    const pageRing = await ring(page.locator(SEL.forPage));
    expect(pageRing.cls).toContain("sk-focus");
    expect(pageRing).toMatchObject({ style: "solid", width: "3px" });
    await page.keyboard.press("Tab");
    await expect(page.locator(SEL.forEvery)).toBeFocused();
    const everyRing = await ring(page.locator(SEL.forEvery));
    expect(everyRing.cls).toContain("sk-focus");
    expect(everyRing).toMatchObject({ style: "solid", width: "3px" });
    // Then T17's switch.
    await page.keyboard.press("Tab");
    await expect(page.locator("#insp-level-voices")).toBeFocused();

    // Space on the focused button applies to every page.
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator(SEL.forEvery)).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.locator(SEL.storyMood)).toHaveValue("Hush");
    await expect(page.locator(SEL.announcement)).toHaveText("Every page is Hush now.");
    // Typing a space in the field never starts playback (the field owns its keys).
    await page.locator(SEL.input).focus();
    await page.keyboard.press("Space");
    await expect(page.locator(SEL.input)).toHaveValue("lullaby ");
    await expect(page.locator('[data-sk="transport"][data-kind="pause"]')).toHaveCount(0);
  });

  test("Simple mode is unchanged: no field until Advanced, and none after it closes", async ({ page }) => {
    await openTwinkle(page);
    await expect(page.locator(SEL.input)).toHaveCount(0);
    await expect(page.getByText(/type a feeling/i)).toHaveCount(0);
    await setAdvanced(page, true);
    await expect(page.locator(SEL.input)).toBeVisible();
    await page.locator(SEL.input).fill(LULLABY);
    await expect(page.locator(SEL.pill)).toHaveText("Hush");
    await setAdvanced(page, false);
    await expect(page.locator(SEL.input)).toHaveCount(0);
    // The Music card (Simple) knows nothing of it.
    await page.getByRole("navigation", { name: "Story tools" }).getByRole("button", { name: /Music/ }).click();
    await expect(page.getByText(/type a feeling/i)).toHaveCount(0);
    // Back in Advanced the field starts empty: the words were never kept.
    await setAdvanced(page, true);
    await expect(page.locator(SEL.input)).toHaveValue("");
    await expect(page.locator(SEL.pill)).toBeHidden();
  });
});

test.describe("T24b · every width: the field in the Inspector (the phone's sheet)", () => {
  test.setTimeout(90000);

  test("page 3 → Hush through the field; the row fits, the page never scrolls sideways", async ({ page }, testInfo) => {
    await openTwinkle(page);
    // Page 3 first (on a phone the Inspector is a sheet over the strip).
    await selectPage(page, 3);
    await setAdvanced(page, true);
    const input = page.locator(SEL.input);
    await input.scrollIntoViewIfNeeded();
    await input.fill(LULLABY);
    await expect(page.locator(SEL.pill)).toHaveText("Hush");
    await expect(page.locator(SEL.forPage)).toHaveText("Use for page 3");

    await page.evaluate(() => document.fonts.ready);
    const geo = await page.evaluate(() => {
      const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().toJSON() as DOMRect;
      return {
        row: r('[data-studio="feeling-row"]'),
        input: r("#insp-feeling"),
        pill: r('[data-studio="feeling-result"]'),
        forPage: r('[data-studio="feeling-page"]'),
        forEvery: r('[data-studio="feeling-every"]'),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        pageLines: (() => {
          const el = document.querySelector('[data-studio="feeling-every"]')!;
          return el.scrollWidth - el.clientWidth;
        })(),
      };
    });
    expect(geo.overflow, "no sideways scroll").toBeLessThanOrEqual(0);
    // Input, arrow and pill on one line inside the row.
    expect(Math.abs(geo.input.top + geo.input.height / 2 - (geo.pill.top + geo.pill.height / 2))).toBeLessThanOrEqual(2);
    expect(geo.pill.right).toBeLessThanOrEqual(geo.row.right + 0.5);
    expect(geo.input.width, "the input keeps room to type").toBeGreaterThanOrEqual(140);
    // The two actions side by side, inside the row, their words never clipped.
    expect(Math.abs(geo.forPage.top - geo.forEvery.top)).toBeLessThanOrEqual(1);
    expect(geo.forEvery.right).toBeLessThanOrEqual(geo.row.right + 0.5);
    // 44px on a sheet (touch); docked from 1180px (s09's density, M6) the column's controls are 36px.
    const docked = (page.viewportSize()?.width ?? 0) >= 1180;
    expect(geo.forPage.height).toBeGreaterThanOrEqual(docked ? 36 : 44);
    expect(geo.pageLines).toBeLessThanOrEqual(0);
    if (testInfo.project.name === "mobile") {
      await page.locator('[data-studio="feeling-row"]').scrollIntoViewIfNeeded();
      await evidenceShot(page, "T24b-375.png");
    }

    await input.press("Enter");
    await expect(page.locator(SEL.pageMood)).toHaveValue("Hush");
    await expect(page.locator(SEL.announcement)).toHaveText("Page 3 is Hush now.");
    expect(await laneMoods(page)).toEqual(["Wonder", "Wonder", "Hush", "Wonder", "Wonder"]);
  });
});

/* ================================================================ fidelity */

test.describe("T24b · fidelity (s09)", () => {
  test.setTimeout(90000);
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "s09 is a 1290×900 desktop window");
  });

  test("1290×900: the house tape, Advanced, page 3, \"a quiet lullaby for bedtime\" → Hush", async ({ page }) => {
    await page.setViewportSize({ width: 1290, height: 900 });
    await page.goto("/studio?open=house");
    await expect(page.locator("#studio-title")).toHaveValue("The Brave Little Star", { timeout: 30000 });
    await setAdvanced(page, true);
    await selectPage(page, 3);
    const input = page.locator(SEL.input);
    await input.fill(LULLABY);
    await expect(page.locator(SEL.pill)).toHaveText("Hush");
    await expect(page.locator(SEL.note)).toHaveText("");
    // Bring Mix up the way s09 frames it: the timing note above, MIX, the feeling row, the meter.
    await page.locator('[aria-label="Inspector"]').evaluate((aside) => {
      const mix = Array.from(aside.querySelectorAll("section")).find((s) => s.querySelector("h3")?.textContent === "Mix");
      if (mix) aside.scrollTop = Math.max(0, mix.offsetTop - 64);
    });
    await input.focus();
    await page.locator('[data-studio="stage-photo"]').waitFor({ state: "visible" }).catch(() => undefined);
    const geo = await page.evaluate(() => {
      const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().toJSON() as DOMRect;
      return { input: r("#insp-feeling"), pill: r('[data-studio="feeling-result"]'), vh: window.innerHeight };
    });
    expect(geo.input.bottom, "the field is in view").toBeLessThanOrEqual(geo.vh);
    expect(geo.pill.left, "the pill sits right of the input").toBeGreaterThan(geo.input.right);
    await evidenceShot(page, "T24b-1290.png");

    // The honest default, in the same frame.
    await input.fill("xyzzy");
    await expect(page.locator(SEL.pill)).toHaveText("Wonder");
    await expect(page.locator(SEL.note)).toHaveText(HOUSE_DEFAULT);
    await evidenceShot(page, "T24b-default-1290.png");
  });
});
