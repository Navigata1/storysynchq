// T04b · Consent per recorded voice, dated YYYY-MM-DD, written by the Creator.
//
// Reference: s04 — Jess answers 7 × 6 and ticks "I am this child's parent or
// guardian and I consent to sharing this recording." The callout says what the
// tick does: it "writes signature.voiceConsent into manifest.json: voice 'Mia,
// age 4 — with Mom', granted by parent/guardian, dated."
//
// E2E on /studio through the grown-up gate to the saved tape (this device's
// library, `ssync-library`), with the clock pinned:
//   1. one recorded voice  → one row, the reference copy, one dated record
//   2. late evening (LA)   → the record carries the LOCAL calendar date
//   3. two recorded voices → one row per voice, Continue (and Enter) only when
//                            every voice is ticked, one record per voice
//   4. no recorded voice   → no row, no voiceConsent key, ownership as today
//   5. every saved tape    → validateManifest(...).warnings is []

import { test, expect, type Locator, type Page } from "@playwright/test";
import { validateManifest, type SsyncManifest } from "../src/lib/storysync/manifest";
import { LIBRARY_KEY, restoreDraft, seedStudioDraft } from "./fixtures/helpers";
import { TWINKLE } from "./fixtures/tapes";

/* -------------------------------------------------------- reference copy (s04) */

const CONSENT_SENTENCE =
  "I am this child's parent or guardian and I consent to sharing this recording.";
const CONSENT_SUBLINE =
  "This consent is written into the tape itself, so it travels with the story wherever the file goes.";
const GATE_TITLE = "A grown-up moment";
const GATE_BODY =
  "Finishing the story saves it and can make a private link to share. A child's voice is personal information, so a grown-up answers this first. Nothing has left this device yet.";
const GATE_FOOT =
  "No trackers, no analytics. Share links are unlisted and random, and deleting the story removes the link, the pictures and the recordings.";

/** 6:09:58 pm on Oct 19 — the moment the grown-up said yes in the reel. */
const REFERENCE_MOMENT = "2026-10-19T18:09:58Z";
const REFERENCE_DATE = "2026-10-19";

/* --------------------------------------------------------------------- helpers */

interface LibraryRow {
  id: string;
  ssyncData: SsyncManifest;
}

async function readLibrary(page: Page): Promise<LibraryRow[]> {
  return page.evaluate((key) => {
    try {
      return JSON.parse(window.localStorage.getItem(key) || "[]") as LibraryRow[];
    } catch {
      return [] as LibraryRow[];
    }
  }, LIBRARY_KEY);
}

async function openStudio(page: Page): Promise<void> {
  await page.goto("/studio");
  await restoreDraft(page);
  await expect(page.getByRole("button", { name: "Finish my story" })).toBeVisible();
}

/** "Finish my story" → the gate; answers its a×b question. Returns the dialog. */
async function openAndAnswerGate(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Finish my story" }).click();
  const dialog = page.getByRole("dialog", { name: GATE_TITLE });
  await expect(dialog).toBeVisible({ timeout: 15000 });

  const question = page.locator('label[for="studio-gate-answer"]');
  await expect(question).toContainText(/\d+\s*[×x*]\s*\d+/);
  const match = (await question.innerText()).match(/(\d+)\s*[×x*]\s*(\d+)/);
  expect(match, "the gate asks an a×b question").not.toBeNull();
  await page.locator("#studio-gate-answer").fill(String(Number(match![1]) * Number(match![2])));
  return dialog;
}

async function continueAndWait(page: Page): Promise<SsyncManifest> {
  await page.getByRole("button", { name: "Continue" }).click();
  return continueAndWaitForReady(page);
}

/** The gate has been passed: wait for the card, then read the one saved tape. */
async function continueAndWaitForReady(page: Page): Promise<SsyncManifest> {
  await expect(page.getByRole("heading", { name: "Your tape is ready" })).toBeVisible({
    timeout: 30000,
  });
  const library = await readLibrary(page);
  expect(library, "one publish, one tape in the device library").toHaveLength(1);
  return library[0].ssyncData;
}

/** Rule 5: whatever the case, the saved tape is clean under the v2.1 draft. */
function expectCleanTape(tape: SsyncManifest): void {
  const result = validateManifest(tape);
  expect(result.errors).toEqual([]);
  expect(result.warnings).toEqual([]);
}

/* ------------------------------------------------------------------------ 1 · 3 · 4 */

test.describe("consent · one record per recorded voice", () => {
  test.setTimeout(90000);
  test.use({ timezoneId: "UTC" });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(REFERENCE_MOMENT);
  });

  test("one recorded voice: the reference row, and one record dated 2026-10-19", async ({
    page,
  }) => {
    await seedStudioDraft(page, "twinkle");
    await openStudio(page);
    const dialog = await openAndAnswerGate(page);

    /* the gate's copy, verbatim from s04 */
    await expect(dialog.getByRole("heading", { name: GATE_TITLE })).toBeVisible();
    await expect(dialog).toContainText(GATE_BODY);
    await expect(dialog).toContainText(GATE_FOOT);
    const storyByLabel = dialog.locator('label[for="studio-gate-author"]');
    await expect(storyByLabel).toHaveText("story by (optional)");
    await expect(storyByLabel).toHaveCSS("text-transform", "uppercase");
    await expect(dialog.getByRole("button", { name: "Not now" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Continue" })).toBeVisible();

    /* exactly one consent row: the reference control, the reference sentence */
    const boxes = dialog.locator('input[type="checkbox"]');
    await expect(boxes).toHaveCount(1);
    await expect(boxes.first()).toHaveAttribute("id", "studio-gate-consent");
    const row = dialog.locator('label[for="studio-gate-consent"]');
    await expect(row).toHaveText(CONSENT_SENTENCE);
    await expect(dialog.getByRole("checkbox", { name: CONSENT_SENTENCE })).toHaveCount(1);
    // One voice needs no name over it — the row reads exactly as s04 draws it.
    await expect(dialog.locator('[data-studio="consent-voice"]')).toHaveCount(0);

    /* the promise sits beneath the row */
    const subline = dialog.getByText(CONSENT_SUBLINE, { exact: true });
    await expect(subline).toBeVisible();
    const rowBox = (await row.boundingBox())!;
    const subBox = (await subline.boundingBox())!;
    expect(subBox.y).toBeGreaterThanOrEqual(rowBox.y + rowBox.height - 1);

    await page.locator("#studio-gate-author").fill(TWINKLE.byline);
    await expect(dialog.getByRole("button", { name: "Continue" })).toBeDisabled();
    await page.locator("#studio-gate-consent").check();

    const tape = await continueAndWait(page);
    expect(tape.signature?.voiceConsent).toEqual([
      { voice: TWINKLE.byline, grantedBy: "parent/guardian", date: REFERENCE_DATE },
    ]);
    expect(tape.signature?.ownership).toBe(`© 2026 ${TWINKLE.byline}`);
    expect(tape.signature?.rights).toBe("personal use");
    expectCleanTape(tape);
  });

  test("one recorded voice: ticking before typing 'story by' keeps the tick, and the record takes the final name", async ({
    page,
  }) => {
    await seedStudioDraft(page, "twinkle");
    await openStudio(page);
    const dialog = await openAndAnswerGate(page);

    const consent = page.locator("#studio-gate-consent");
    await consent.check();
    await page.locator("#studio-gate-author").fill(TWINKLE.byline);
    await expect(consent).toBeChecked();
    await expect(dialog.getByRole("button", { name: "Continue" })).toBeEnabled();

    const tape = await continueAndWait(page);
    expect(tape.signature?.voiceConsent).toEqual([
      { voice: TWINKLE.byline, grantedBy: "parent/guardian", date: REFERENCE_DATE },
    ]);
    expectCleanTape(tape);
  });

  test("two recorded voices: one row each, Continue and Enter wait for both, two records in order", async ({
    page,
  }) => {
    await seedStudioDraft(page, "twinkle", { voices: { 1: "Mom", 2: "Mom" } });
    await openStudio(page);
    const dialog = await openAndAnswerGate(page);
    await page.locator("#studio-gate-author").fill(TWINKLE.byline);

    const boxes = dialog.locator('input[type="checkbox"]');
    await expect(boxes).toHaveCount(2);
    await expect(boxes.nth(0)).toHaveAccessibleName(`Mom ${CONSENT_SENTENCE}`);
    await expect(boxes.nth(1)).toHaveAccessibleName(`${TWINKLE.byline} ${CONSENT_SENTENCE}`);

    /* each row: the voice as a mono label, above the reference sentence */
    const rows = dialog.locator('[data-studio="consent-row"]');
    await expect(rows).toHaveCount(2);
    const names = dialog.locator('[data-studio="consent-voice"]');
    await expect(names).toHaveText(["Mom", TWINKLE.byline]);
    for (let i = 0; i < 2; i += 1) {
      const name = names.nth(i);
      const sentence = rows.nth(i).getByText(CONSENT_SENTENCE, { exact: true });
      await expect(sentence).toBeVisible();
      expect(await name.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/mono/i);
      const nameBox = (await name.boundingBox())!;
      const sentenceBox = (await sentence.boundingBox())!;
      expect(nameBox.y + nameBox.height).toBeLessThanOrEqual(sentenceBox.y + 1);
    }
    // The promise is said once, beneath the last row.
    await expect(dialog.getByText(CONSENT_SUBLINE, { exact: true })).toHaveCount(1);

    /* one tick is not consent for the tape */
    const go = dialog.getByRole("button", { name: "Continue" });
    await boxes.nth(0).check();
    await expect(go).toBeDisabled();
    // Submitting the form with Enter bypasses a disabled button in the DOM.
    await page.locator("#studio-gate-answer").press("Enter");
    await expect(dialog, "the gate must not pass with one voice unconsented").toBeVisible();
    expect(await readLibrary(page)).toHaveLength(0);

    await boxes.nth(1).check();
    await expect(go).toBeEnabled();
    const tape = await continueAndWait(page);
    expect(tape.signature?.voiceConsent).toEqual([
      { voice: "Mom", grantedBy: "parent/guardian", date: REFERENCE_DATE },
      { voice: TWINKLE.byline, grantedBy: "parent/guardian", date: REFERENCE_DATE },
    ]);
    expectCleanTape(tape);
  });

  test("two recorded voices by keyboard alone: Tab to each row, Space to tick, Enter to continue", async ({
    page,
  }) => {
    await seedStudioDraft(page, "twinkle", { voices: { 1: "Mom", 2: "Mom" } });
    await openStudio(page);
    const dialog = await openAndAnswerGate(page);
    const author = page.locator("#studio-gate-author");
    await author.fill(TWINKLE.byline);
    await author.focus();

    await page.keyboard.press("Tab");
    await expect(page.locator("#studio-gate-consent-1")).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.locator("#studio-gate-consent-1")).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(page.locator("#studio-gate-consent-2")).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.locator("#studio-gate-consent-2")).toBeChecked();
    await expect(dialog.getByRole("button", { name: "Continue" })).toBeEnabled();

    await page.locator("#studio-gate-answer").press("Enter");
    const tape = await continueAndWaitForReady(page);
    expect(tape.signature?.voiceConsent?.map((r) => r.voice)).toEqual(["Mom", TWINKLE.byline]);
    expectCleanTape(tape);
  });

  test("two recorded voices: when 'story by' folds them into one voice, the grown-up is asked again", async ({
    page,
  }) => {
    await seedStudioDraft(page, "twinkle", { voices: { 1: "Mom", 2: "Mom" } });
    await openStudio(page);
    const dialog = await openAndAnswerGate(page);
    const author = page.locator("#studio-gate-author");
    await author.fill(TWINKLE.byline);

    const boxes = dialog.locator('input[type="checkbox"]');
    await boxes.nth(0).check();
    await boxes.nth(1).check();

    /* renaming the "story by" voice keeps both ticks: same recordings, new credit */
    await author.fill("Mia");
    await expect(dialog.locator('[data-studio="consent-voice"]')).toHaveText(["Mom", "Mia"]);
    await expect(boxes.nth(0)).toBeChecked();
    await expect(boxes.nth(1)).toBeChecked();

    /* "Mom" now credits every page — a voice she has not consented to as a whole */
    await author.fill("Mom");
    await expect(boxes).toHaveCount(1);
    await expect(boxes.first()).toHaveAttribute("id", "studio-gate-consent");
    await expect(boxes.first()).not.toBeChecked();
    await expect(dialog.getByRole("button", { name: "Continue" })).toBeDisabled();

    await boxes.first().check();
    const tape = await continueAndWait(page);
    expect(tape.signature?.voiceConsent).toEqual([
      { voice: "Mom", grantedBy: "parent/guardian", date: REFERENCE_DATE },
    ]);
    expectCleanTape(tape);
  });

  test("no recorded voice: no consent row, no voiceConsent key, ownership and rights as today", async ({
    page,
  }) => {
    await seedStudioDraft(page, "twinkle", { narration: false });
    await openStudio(page);
    const dialog = await openAndAnswerGate(page);

    await expect(dialog.locator('input[type="checkbox"]')).toHaveCount(0);
    await expect(dialog.getByText(CONSENT_SUBLINE)).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Continue" })).toBeEnabled();

    const tape = await continueAndWait(page);
    expect(tape.pages.some((p) => p.text?.audioUrl)).toBe(false);
    expect(tape.signature).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(tape.signature, "voiceConsent")).toBe(false);
    expect(tape.signature?.ownership).toMatch(/^© \d{4}/);
    expect(tape.signature?.ownership).toBe("© 2026");
    expect(tape.signature?.rights).toBe("personal use");
    expectCleanTape(tape);
  });
});

/* ------------------------------------------------------------------------------ 2 */

test.describe("consent · the date is the grown-up's calendar day", () => {
  test.setTimeout(90000);
  test.use({ timezoneId: "America/Los_Angeles" });

  test("11:30 pm in Los Angeles on Oct 19 is still 2026-10-19, though UTC says Oct 20", async ({
    page,
  }) => {
    await page.clock.setFixedTime("2026-10-19T23:30:00-07:00");
    await seedStudioDraft(page, "twinkle");
    await openStudio(page);

    // The case only means something if UTC has already turned the page.
    const utcDay = await page.evaluate(() => new Date().toISOString().slice(0, 10));
    expect(utcDay).toBe("2026-10-20");

    await openAndAnswerGate(page);
    await page.locator("#studio-gate-author").fill(TWINKLE.byline);
    await page.locator("#studio-gate-consent").check();

    const tape = await continueAndWait(page);
    expect(tape.signature?.voiceConsent).toEqual([
      { voice: TWINKLE.byline, grantedBy: "parent/guardian", date: REFERENCE_DATE },
    ]);
    expectCleanTape(tape);
  });
});
