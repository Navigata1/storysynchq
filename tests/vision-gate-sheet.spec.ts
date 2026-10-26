// T14 · The grown-up moment shows what goes into the tape.
//
// Reference: s04 — beside the shipped gate stands a printed sheet, "ONE FILE ·
// SEVEN LAYERS" / ".storysync" / "What goes into your tape", seven numbered
// bands describing THIS story; ticking consent inks "VOICE CONSENT · GRANTED /
// PARENT/GUARDIAN · OCT 19 2026" onto the Signature band; under the consent row
// the promise "Your child's voice never goes anywhere without you."
// Self-consent from s06's "Her grown-up moment" figure: "Whose voice is on this
// tape?" → "Mine — I'm the grown-up speaking" → "This is my own voice, and I'm
// happy to share it." → a record granted by self.
//
// E2E on /studio through the gate to the saved tape (`ssync-library`), the
// Twinkle draft seeded by T00, the clock pinned to Oct 19 2026, 6:09:58 pm.
//
//   1. layout   · two objects side by side at 1180×820, one column at 375×812
//   2. copy     · every gate string, verbatim
//   3. sheet    · header, title, seven bands with this draft's values, live byline
//   4. truth    · the published manifest agrees with the sheet as it stood
//   5. stamp    · inks with every tick, un-inks, presses once, still under reduced motion
//   6. self     · "Mine" → its sentence, its trust line, "SELF", a record granted by self
//   7. voices   · one group per voice, mixed grantors → "2 VOICES", records in order
//   8. no voice · no radios, no box, no trust line, no stamp; the Voice band says so
//   9. keyboard · the Tab order, arrows inside a group, Escape saves nothing

import { test, expect, type Locator, type Page } from "@playwright/test";
import { validateManifest, type SsyncManifest } from "../src/lib/storysync/manifest";
import { LIBRARY_KEY, restoreDraft, seedStudioDraft, studioDraftState } from "./fixtures/helpers";
import { TWINKLE } from "./fixtures/tapes";
import { consentRecordsFor, stampDate } from "../src/lib/storysync/consent";
import { dataUrlBytes, tapeBytes } from "../src/lib/storysync/tape-size";
import { layerPresence, stampGrantorLine, tapeSheet } from "../src/components/studio/tape-sheet";

/* ------------------------------------------------------------ reference copy */

const GATE_TITLE = "A grown-up moment";
const KICKER = "BEFORE ANYTHING LEAVES THIS DEVICE";
const GATE_BODY =
  "Finishing the story saves it and can make a private link to share. A child's voice is personal information, so a grown-up answers this first. Nothing has left this device yet.";
const CHILD_SENTENCE =
  "I am this child's parent or guardian and I consent to sharing this recording.";
const SELF_SENTENCE = "This is my own voice, and I'm happy to share it.";
const SUBLINE =
  "This consent is written into the tape itself, so it travels with the story wherever the file goes.";
const GATE_FOOT =
  "No trackers, no analytics. Share links are unlisted and random, and deleting the story removes the link, the pictures and the recordings.";
const TRUST_CHILD = "Your child's voice never goes anywhere without you.";
const TRUST_SELF = "Your voice never goes anywhere without you.";
const WHOSE = "Whose voice is on this tape?";
const MINE = "Mine — I'm the grown-up speaking";
const CHILDS = "A child's — I'm their parent or guardian";

const SHEET_TITLE = "What goes into your tape";
const LAYERS = ["Metadata", "Visual", "Text", "Voice", "Sound", "Behavior", "Signature"];
/** The packet fills (brief design_system; `--ss-layer-*`), as computed colours. */
const FILLS = [
  "rgb(239, 233, 220)",
  "rgb(228, 224, 250)",
  "rgb(251, 243, 223)",
  "rgb(250, 223, 218)",
  "rgb(251, 235, 210)",
  "rgb(230, 233, 238)",
  "rgb(255, 233, 168)",
];
const TAPE_RED = "rgb(227, 69, 47)";
const INK = "rgb(30, 26, 22)";
const LABEL_YELLOW = "rgb(255, 201, 60)";

/** 6:09:58 pm on Oct 19, on this machine's own calendar. */
const MOMENT = new Date("2026-10-19T18:09:58");
const DATE = "2026-10-19";
const STAMP_DATE = "OCT 19 2026";
const TABLET = { width: 1180, height: 820 };
const PHONE = { width: 375, height: 812 };

/* ------------------------------------------------------------------- helpers */

interface LibraryRow {
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

/** Seed the draft, open the Studio, keep it, and open the gate. Returns the dialog. */
async function openGate(
  page: Page,
  opts: Parameters<typeof seedStudioDraft>[2] = {},
): Promise<Locator> {
  await page.clock.setFixedTime(MOMENT);
  await seedStudioDraft(page, "twinkle", opts);
  await page.goto("/studio");
  await restoreDraft(page);
  await page.getByRole("button", { name: "Finish my story" }).click();
  const dialog = page.getByRole("dialog", { name: GATE_TITLE });
  await expect(dialog).toBeVisible({ timeout: 15000 });
  await expect(page.locator('label[for="studio-gate-answer"]')).toContainText(/\d+\s*×\s*\d+/);
  return dialog;
}

async function answer(page: Page): Promise<void> {
  const text = await page.locator('label[for="studio-gate-answer"]').innerText();
  const [, a, b] = text.match(/(\d+)\s*×\s*(\d+)/)!;
  await page.locator("#studio-gate-answer").fill(String(Number(a) * Number(b)));
}

/** Let the dialog's rise (and anything else) settle before measuring. */
async function settle(locator: Locator): Promise<void> {
  await locator.evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined))),
  );
}

function sheetOf(page: Page): Locator {
  return page.getByRole("region", { name: SHEET_TITLE });
}

function band(page: Page, layer: string): Locator {
  return sheetOf(page).locator(`[data-sk="packet-band"][data-layer="${layer}"]`);
}

async function bandValue(page: Page, layer: string): Promise<string> {
  return (await band(page, layer).locator('[data-band="value"]').innerText()).replace(/\s+/g, " ").trim();
}

async function stampLines(page: Page): Promise<string[]> {
  const lines = await page.locator('[data-sk="consent-stamp"] [data-line]').allInnerTexts();
  return lines.map((t) => t.trim());
}

async function continueAndRead(page: Page): Promise<SsyncManifest> {
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your tape is ready" })).toBeVisible({ timeout: 30000 });
  const rows = await readLibrary(page);
  expect(rows, "one publish, one tape").toHaveLength(1);
  return rows[0].ssyncData;
}

/** Decoded bytes of a base64 data URL. */
function decodedBytes(url: string): number {
  return Buffer.from(url.slice(url.indexOf(",") + 1), "base64").length;
}

/** The seeded Twinkle pictures, and "about N KB each" as the sheet should print it. */
const PICTURES = studioDraftState("twinkle").manifest.pages.map((p) => p.illustration!.url!);
const MEAN_KB = Math.round(
  PICTURES.reduce((sum, url) => sum + decodedBytes(url), 0) / PICTURES.length / 1024 / 10,
) * 10;

type Box = { x: number; y: number; width: number; height: number };
async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  expect(b).not.toBeNull();
  return b!;
}

/* ======================================================================== */

test.describe("T14 · the grown-up moment and what goes into the tape", () => {
  test.setTimeout(90000);

  /* ------------------------------------------------------------- 1 · layout */

  test("1 · two objects: side by side at 1180×820, no scroll; one column at 375×812", async ({ page }) => {
    await page.setViewportSize(TABLET);
    const dialog = await openGate(page);
    await settle(dialog);

    const gate = dialog.locator('[data-studio="gate"]');
    const sheet = sheetOf(page);
    await expect(gate).toBeVisible();
    await expect(sheet).toBeVisible();
    // The sheet is a section named by its own title.
    expect(await sheet.evaluate((el) => el.tagName)).toBe("SECTION");
    await expect(sheet).toHaveAttribute("aria-labelledby", /.+/);

    const g = await box(gate);
    const s = await box(sheet);
    expect(g.width, "the gate is at most 520 wide").toBeLessThanOrEqual(520.5);
    expect(s.width, "the sheet is at most 480 wide").toBeLessThanOrEqual(480.5);
    expect(g.width).toBeGreaterThan(440);
    expect(s.width).toBeGreaterThan(400);
    const gap = s.x - (g.x + g.width);
    expect(gap, "side by side, 28 ± 4 apart").toBeGreaterThanOrEqual(24);
    expect(gap).toBeLessThanOrEqual(32);
    expect(Math.abs(g.y - s.y), "tops aligned").toBeLessThanOrEqual(2);
    // Centred as a pair.
    expect(Math.abs(g.x - (TABLET.width - (s.x + s.width)))).toBeLessThanOrEqual(2);
    for (const [name, b] of [["gate", g], ["sheet", s]] as const) {
      expect(b.x, `${name} inside the viewport`).toBeGreaterThanOrEqual(0);
      expect(b.y, `${name} inside the viewport`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, `${name} inside the viewport`).toBeLessThanOrEqual(TABLET.width);
      expect(b.y + b.height, `${name} inside the viewport`).toBeLessThanOrEqual(TABLET.height);
    }
    const overlay = page.locator('[data-studio="gate-overlay"]');
    const [scrollH, clientH] = await overlay.evaluate((el) => [el.scrollHeight, el.clientHeight]);
    expect(scrollH, "the overlay needs no scroll at 1180×820").toBeLessThanOrEqual(clientH);

    // Register B: paper, a 3px ink border, radius 14.
    const look = await sheet.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { border: cs.borderTopWidth, color: cs.borderTopColor, radius: cs.borderTopLeftRadius };
    });
    expect(look).toEqual({ border: "3px", color: INK, radius: "14px" });

    /* the phone: the sheet follows the gate in one scrolling column */
    await page.setViewportSize(PHONE);
    await settle(dialog);
    const g2 = await box(gate);
    const s2 = await box(sheet);
    expect(s2.y, "the sheet follows the gate").toBeGreaterThanOrEqual(g2.y + g2.height);
    const widths = await page.evaluate(() => {
      const o = document.querySelector('[data-studio="gate-overlay"]')!;
      return [document.documentElement.scrollWidth, o.scrollWidth];
    });
    expect(widths[0]).toBeLessThanOrEqual(PHONE.width);
    expect(widths[1]).toBeLessThanOrEqual(PHONE.width);
    // The column scrolls inside the overlay, down to the sheet's footer.
    await sheet.locator('[data-studio="sheet-foot"]').scrollIntoViewIfNeeded();
    await expect(sheet.locator('[data-studio="sheet-foot"]')).toBeInViewport();
  });

  /* --------------------------------------------------------------- 2 · copy */

  test("2 · the gate's copy, verbatim from s04; a wrong answer rotates; no live tick", async ({ page }) => {
    const dialog = await openGate(page);
    const gate = dialog.locator('[data-studio="gate"]');

    const kicker = gate.locator('[data-studio="gate-kicker"]');
    expect((await kicker.innerText()).trim()).toBe(KICKER);
    await expect(kicker.locator("svg.lucide-lock")).toHaveCount(1);
    await expect(gate.getByRole("heading", { name: GATE_TITLE })).toBeVisible();
    await expect(gate.getByText(GATE_BODY, { exact: true })).toBeVisible();

    const question = page.locator('label[for="studio-gate-answer"]');
    expect((await question.innerText()).trim()).toMatch(/^What is \d+ × \d+\?$/);
    const numbers = question.locator('[data-studio="gate-numbers"]');
    expect(await numbers.evaluate((el) => getComputedStyle(el).fontSize)).toBe("20px");
    expect(await numbers.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(251, 191, 74)");

    const byline = dialog.locator('label[for="studio-gate-author"]');
    await expect(byline).toHaveText("story by (optional)");
    await expect(byline).toHaveCSS("text-transform", "uppercase");

    await expect(dialog.getByRole("checkbox", { name: CHILD_SENTENCE })).toHaveCount(1);
    await expect(page.locator("#studio-gate-consent")).toHaveCount(1);
    await expect(gate.getByText(SUBLINE, { exact: true })).toBeVisible();
    const notNow = gate.getByRole("button", { name: "Not now" });
    const go = gate.getByRole("button", { name: "Continue" });
    await expect(notNow.locator("svg.lucide-undo-2")).toHaveCount(1);
    await expect(go.locator("svg.lucide-check")).toHaveCount(1);
    await expect(gate.getByText(GATE_FOOT, { exact: true })).toBeVisible();

    /* no live ✓ for a right answer before Continue */
    await answer(page);
    await expect(page.locator("#studio-gate-answer").locator("xpath=..").locator("svg")).toHaveCount(0);
    await expect(gate.locator('[data-studio="gate-answer-ok"]')).toHaveCount(0);

    /* a wrong answer still rotates the question */
    const before = (await question.innerText()).trim();
    await page.locator("#studio-gate-answer").fill("1");
    await page.locator("#studio-gate-consent").check();
    await go.click();
    await expect(dialog.getByRole("alert")).toHaveText("Not quite — here is a new one.");
    await expect(page.locator("#studio-gate-answer")).toHaveValue("");
    await expect(question).not.toHaveText(before);
    await expect(dialog).toBeVisible();
    expect(await readLibrary(page)).toHaveLength(0);
  });

  /* -------------------------------------------------------------- 3 · sheet */

  test("3 · the sheet: header, title, seven bands for this draft, live byline", async ({ page }) => {
    const dialog = await openGate(page);
    await page.locator("#studio-gate-author").fill(TWINKLE.byline);
    const sheet = sheetOf(page);

    /* header bar · title · footer */
    const bar = sheet.locator('[data-studio="sheet-bar"]');
    expect((await bar.boundingBox())!.height).toBeCloseTo(44, 0);
    expect(await bar.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(INK);
    const kick = bar.locator('[data-studio="sheet-kicker"]');
    expect((await kick.innerText()).trim()).toBe("ONE FILE · SEVEN LAYERS");
    expect((await kick.evaluate((el) => getComputedStyle(el).fontFamily)).toLowerCase()).toMatch(/plex|mono/);
    const mark = bar.locator('[data-studio="sheet-mark"]');
    await expect(mark).toHaveText(".storysync");
    expect((await mark.evaluate((el) => getComputedStyle(el).fontFamily)).toLowerCase()).toContain("fraunces");
    expect(await mark.evaluate((el) => getComputedStyle(el).color)).toBe(LABEL_YELLOW);

    const title = sheet.getByRole("heading", { name: SHEET_TITLE });
    await expect(title).toBeVisible();
    const t = await title.evaluate((el) => ({ w: getComputedStyle(el).fontWeight, f: getComputedStyle(el).fontFamily }));
    expect(t.w).toBe("800");
    expect(t.f.toLowerCase()).toContain("fraunces");

    const foot = sheet.locator('[data-studio="sheet-foot"]');
    await expect(foot).toHaveText("Nothing has left this device yet.");
    await expect(foot.locator("svg.lucide-lock")).toHaveCount(1);

    /* seven bands, in order, numbered, in the packet fills */
    const bands = sheet.locator('[data-sk="packet-band"]');
    await expect(bands).toHaveCount(7);
    await expect(bands.locator('[data-band="name"]')).toHaveText(LAYERS);
    await expect(sheet.locator('[data-sk="packet-num"]')).toHaveText(["01", "02", "03", "04", "05", "06", "07"]);
    const fills = await bands.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
    expect(fills).toEqual(FILLS);

    /* Signature: the tape-red stroke and the draft tag */
    const sig = band(page, "Signature");
    expect(await sig.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(TAPE_RED);
    await expect(sig.locator('[data-sk="packet-tag"]')).toHaveText("V2.1 · DRAFT");

    /* the values describe THIS draft */
    expect(await bandValue(page, "Metadata")).toBe(`${TWINKLE.title} · by ${TWINKLE.byline} · English`);
    expect(await bandValue(page, "Visual")).toBe(`5 pictures · about ${MEAN_KB} KB each`);
    const thumbs = band(page, "Visual").locator('[data-band="thumbs"] img');
    await expect(thumbs).toHaveCount(5);
    const srcs = await thumbs.evaluateAll((els) => els.map((el) => el.getAttribute("src")));
    expect(srcs).toEqual(PICTURES);
    expect((await thumbs.first().boundingBox())!.width).toBeCloseTo(26, 0);
    await expect(band(page, "Visual").locator('[data-band="more"]')).toHaveCount(0);
    expect(await bandValue(page, "Text")).toBe(
      "the words on 5 pages, kept as text — never baked into the pictures",
    );
    expect(await bandValue(page, "Voice")).toBe(
      "5 recordings · become AAC/M4A when you tap Continue (WAV if this browser can't make AAC)",
    );
    await expect(band(page, "Voice").locator("svg.lucide-audio-waveform")).toHaveCount(1);
    expect(await bandValue(page, "Sound")).toBe("Wonder, a music box that dips under every word");
    await expect(band(page, "Sound").locator("svg.lucide-star")).toHaveCount(1);
    expect(await bandValue(page, "Behavior")).toBe(
      "2-second pauses · the turn-the-page chime · words light up",
    );
    expect(await bandValue(page, "Signature")).toBe(`© 2026 ${TWINKLE.byline} · personal use`);

    /* the byline is live */
    await page.locator("#studio-gate-author").fill("Ada");
    await expect.poll(() => bandValue(page, "Metadata")).toBe(`${TWINKLE.title} · by Ada · English`);
    await expect.poll(() => bandValue(page, "Signature")).toBe("© 2026 Ada · personal use");
    await page.locator("#studio-gate-author").fill("");
    await expect.poll(() => bandValue(page, "Metadata")).toBe(`${TWINKLE.title} · English`);
    await expect.poll(() => bandValue(page, "Signature")).toBe("© 2026 · personal use");

    /* the sheet is print: nothing in it takes focus */
    const focusables = await sheet.evaluate(
      (el) =>
        el.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])').length,
    );
    expect(focusables).toBe(0);
    await expect(dialog).toBeVisible();
  });

  /* -------------------------------------------------------------- 4 · truth */

  test("4 · the sheet tells the truth: the published manifest agrees with it", async ({ page }) => {
    await openGate(page);
    await answer(page);
    await page.locator("#studio-gate-author").fill(TWINKLE.byline);
    await page.locator("#studio-gate-consent").check();

    const sheet: Record<string, string> = {};
    for (const layer of LAYERS) sheet[layer] = await bandValue(page, layer);

    const tape = await continueAndRead(page);

    const mood = sheet.Sound.split(",")[0];
    expect(mood).toBe("Wonder");
    for (const p of tape.pages) expect(p.music, `page ${p.id} music`).toBe(mood);

    const seconds = Number(sheet.Behavior.match(/^([\d.]+)-second pauses/)![1]);
    for (const p of tape.pages) expect(p.timing?.autoPause, `page ${p.id} pause`).toBe(`${seconds}s`);

    expect(`${tape.signature?.ownership} · ${tape.signature?.rights}`).toBe(sheet.Signature);

    const recordings = Number(sheet.Voice.match(/^(\d+) recordings?/)![1]);
    expect(tape.pages.filter((p) => p.text?.audioUrl).length).toBe(recordings);

    const [title, by] = sheet.Metadata.split(" · ");
    expect(tape.metadata.title).toBe(title);
    expect(`by ${tape.metadata.author}`).toBe(by);

    expect(validateManifest(tape).warnings).toEqual([]);
  });

  test("4 · a byline cleared in the gate publishes no author, as the sheet says", async ({ page }) => {
    // The draft already carries a byline; the grown-up clears it.
    await openGate(page, { byline: TWINKLE.byline, narration: false });
    await expect(page.locator("#studio-gate-author")).toHaveValue(TWINKLE.byline);
    await answer(page);
    await page.locator("#studio-gate-author").fill("");
    const metadata = await bandValue(page, "Metadata");
    const signature = await bandValue(page, "Signature");
    expect(metadata).toBe(`${TWINKLE.title} · English`);
    expect(signature).toBe("© 2026 · personal use");

    const tape = await continueAndRead(page);
    expect(tape.metadata.author ?? "").toBe("");
    expect(`${tape.signature?.ownership} · ${tape.signature?.rights}`).toBe(signature);
  });

  test("4 · a re-voiced house tape: by its author, read by the reader, varied pauses, +2 pictures", async ({
    page,
  }) => {
    await page.clock.setFixedTime(MOMENT);
    await page.goto("/studio?open=house");
    await expect(page.locator("#studio-title")).toHaveValue("The Brave Little Star", { timeout: 30000 });
    await page.getByRole("button", { name: "Finish my story" }).click();
    const dialog = page.getByRole("dialog", { name: GATE_TITLE });
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(page.locator('label[for="studio-gate-author"]')).toHaveText("read by (optional)");
    await expect(page.locator('label[for="studio-gate-answer"]')).toContainText(/\d+\s*×\s*\d+/);
    await answer(page);

    const author = "Island Development Crew";
    expect(await bandValue(page, "Metadata")).toBe(`The Brave Little Star · by ${author} · English`);
    await page.locator("#studio-gate-author").fill("Grandpa Joe");
    await expect
      .poll(() => bandValue(page, "Metadata"))
      .toBe(`The Brave Little Star · by ${author} · read by Grandpa Joe · English`);
    // The original author keeps the credit (T15).
    expect(await bandValue(page, "Signature")).toBe(`© 2026 ${author} · personal use`);
    expect(await bandValue(page, "Visual")).toMatch(/^7 pictures · about \d+ KB each$/);
    await expect(band(page, "Visual").locator('[data-band="thumbs"] img')).toHaveCount(5);
    await expect(band(page, "Visual").locator('[data-band="more"]')).toHaveText("+2");
    expect(await bandValue(page, "Voice")).toBe("No recorded voice · read aloud by the browser voice");
    const behavior = await bandValue(page, "Behavior");
    expect(behavior).toBe("pauses of 3–6 seconds · the turn-the-page chime · words light up");
    const sound = await bandValue(page, "Sound");

    const tape = await continueAndRead(page);
    expect(tape.metadata.author).toBe(author);
    expect(`${tape.signature?.ownership} · ${tape.signature?.rights}`).toBe(`© 2026 ${author} · personal use`);
    const pauses = tape.pages.map((p) => Number.parseFloat(p.timing?.autoPause ?? "3"));
    expect(`pauses of ${Math.min(...pauses)}–${Math.max(...pauses)} seconds`).toBe(behavior.split(" · ")[0]);
    for (const p of tape.pages) expect(p.music).toBe(sound.split(",")[0]);
    expect(tape.pages.filter((p) => p.illustration?.url).length).toBe(7);
  });

  /* -------------------------------------------------------------- 5 · stamp */

  test("5 · the stamp inks with the tick, un-inks without it, and presses once", async ({ page }) => {
    await openGate(page);
    await page.locator("#studio-gate-author").fill(TWINKLE.byline);
    const stamp = page.locator('[data-sk="consent-stamp"]');
    await expect(stamp).toHaveCount(1);
    await expect(stamp).toHaveAttribute("data-inked", "false");
    await expect(stamp.locator("[data-line]").first()).toBeHidden();

    /* it sits over the Signature band's right half */
    const sig = await box(band(page, "Signature"));

    await page.locator("#studio-gate-consent").check();
    await expect(stamp).toHaveAttribute("data-inked", "true");
    expect(await stampLines(page)).toEqual(["VOICE CONSENT · GRANTED", `PARENT/GUARDIAN · ${STAMP_DATE}`]);
    const motion = await stamp.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { name: cs.animationName, count: cs.animationIterationCount, duration: cs.animationDuration };
    });
    expect(motion.name).not.toBe("none");
    expect(motion.count, "it presses once and never loops").toBe("1");
    expect(motion.duration).toBe("0.42s");
    await settle(stamp);
    const st = await box(stamp);
    expect(st.x + st.width / 2, "over the band's right half").toBeGreaterThan(sig.x + sig.width / 2);
    expect(st.y).toBeGreaterThanOrEqual(sig.y - 8);
    expect(st.y + st.height).toBeLessThanOrEqual(sig.y + sig.height + 8);
    expect(st.x + st.width).toBeLessThanOrEqual(sig.x + sig.width + 8);
    const red = await stamp.locator("[data-line]").first().evaluate((el) => getComputedStyle(el).color);
    expect(red).toBe(TAPE_RED);
    /* announced once, politely */
    const live = stamp.locator('[aria-live="polite"]');
    await expect(live).toHaveCount(1);
    await expect(live).toHaveText(/voice consent granted/i);

    await page.locator("#studio-gate-consent").uncheck();
    await expect(stamp).toHaveAttribute("data-inked", "false");
    await expect(stamp.locator("[data-line]").first()).toBeHidden();
  });

  test("5 · under reduced motion the stamp is simply there", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openGate(page);
    await page.locator("#studio-gate-consent").check();
    const stamp = page.locator('[data-sk="consent-stamp"]');
    await expect(stamp).toHaveAttribute("data-inked", "true");
    expect(await stamp.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    await expect(stamp.locator("[data-line]").first()).toBeVisible();
  });

  /* --------------------------------------------------------------- 6 · self */

  test("6 · a grown-up's own voice: 'Mine', her sentence, her trust line, SELF, granted by self", async ({ page }) => {
    const dialog = await openGate(page);
    await answer(page);

    const group = dialog.getByRole("radiogroup", { name: WHOSE });
    await expect(group).toBeVisible();
    await expect(group.getByRole("radio")).toHaveCount(2);
    await expect(group.getByRole("radio", { name: MINE })).not.toBeChecked();
    await expect(group.getByRole("radio", { name: CHILDS })).toBeChecked();

    const trust = dialog.locator('[data-studio="gate-trust"]');
    await expect(trust).toHaveText(TRUST_CHILD);
    const look = await trust.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { family: cs.fontFamily.toLowerCase(), style: cs.fontStyle, color: cs.color };
    });
    expect(look.family).toContain("fraunces");
    expect(look.style).toBe("italic");
    expect(look.color).toBe(LABEL_YELLOW);

    await group.getByRole("radio", { name: MINE }).check();
    await expect(dialog.getByRole("checkbox", { name: SELF_SENTENCE })).toHaveCount(1);
    await expect(dialog.getByText(CHILD_SENTENCE, { exact: true })).toHaveCount(0);
    await expect(page.locator('label[for="studio-gate-consent"]')).toHaveText(SELF_SENTENCE);
    await expect(trust).toHaveText(TRUST_SELF);

    await page.locator("#studio-gate-author").fill("Grandma Rose");
    await page.locator("#studio-gate-consent").check();
    await expect(page.locator('[data-sk="consent-stamp"]')).toHaveAttribute("data-inked", "true");
    expect(await stampLines(page)).toEqual(["VOICE CONSENT · GRANTED", `SELF · ${STAMP_DATE}`]);

    const tape = await continueAndRead(page);
    expect(tape.signature?.voiceConsent).toEqual([{ voice: "Grandma Rose", grantedBy: "self", date: DATE }]);
    expect(validateManifest(tape).warnings).toEqual([]);
  });

  /* ------------------------------------------------------------- 7 · voices */

  test("7 · two voices: a group each, mixed grantors stamp '2 VOICES', records in order", async ({ page }) => {
    const dialog = await openGate(page, { voices: { 1: "Mom", 2: "Mom" } });
    await answer(page);
    await page.locator("#studio-gate-author").fill(TWINKLE.byline);

    await expect(dialog.getByRole("radiogroup")).toHaveCount(2);
    const mom = dialog.getByRole("radiogroup", { name: 'Whose voice is "Mom"?' });
    const mia = dialog.getByRole("radiogroup", { name: `Whose voice is "${TWINKLE.byline}"?` });
    await expect(mom).toBeVisible();
    await expect(mia).toBeVisible();
    await expect(mom.getByRole("radio", { name: CHILDS })).toBeChecked();
    await expect(mia.getByRole("radio", { name: CHILDS })).toBeChecked();

    /* Tab moves between groups; the arrows move inside one */
    await page.locator("#studio-gate-author").focus();
    await page.keyboard.press("Tab");
    await expect(mom.getByRole("radio", { name: CHILDS })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(mom.getByRole("radio", { name: MINE })).toBeFocused();
    await expect(mom.getByRole("radio", { name: MINE })).toBeChecked();
    await expect(mia.getByRole("radio", { name: CHILDS })).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(page.locator("#studio-gate-consent-1")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(mia.getByRole("radio", { name: CHILDS })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#studio-gate-consent-2")).toBeFocused();

    const boxes = dialog.locator('input[type="checkbox"]');
    await expect(boxes.nth(0)).toHaveAccessibleName(`Mom ${SELF_SENTENCE}`);
    await expect(boxes.nth(1)).toHaveAccessibleName(`${TWINKLE.byline} ${CHILD_SENTENCE}`);
    // One child's voice is still on the tape.
    await expect(dialog.locator('[data-studio="gate-trust"]')).toHaveText(TRUST_CHILD);

    const stamp = page.locator('[data-sk="consent-stamp"]');
    await boxes.nth(0).check();
    await expect(stamp).toHaveAttribute("data-inked", "false");
    await boxes.nth(1).check();
    await expect(stamp).toHaveAttribute("data-inked", "true");
    expect(await stampLines(page)).toEqual(["VOICE CONSENT · GRANTED", `2 VOICES · ${STAMP_DATE}`]);

    const tape = await continueAndRead(page);
    expect(tape.signature?.voiceConsent).toEqual([
      { voice: "Mom", grantedBy: "self", date: DATE },
      { voice: TWINKLE.byline, grantedBy: "parent/guardian", date: DATE },
    ]);
    expect(validateManifest(tape).warnings).toEqual([]);
  });

  /* ----------------------------------------------------------- 8 · no voice */

  test("8 · no recorded voice: nothing to consent to, and the sheet says so", async ({ page }) => {
    const dialog = await openGate(page, { narration: false });
    await answer(page);
    await expect(dialog.getByRole("radio")).toHaveCount(0);
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);
    await expect(dialog.locator('[data-studio="gate-trust"]')).toHaveCount(0);
    await expect(dialog.getByText(TRUST_CHILD)).toHaveCount(0);
    await expect(page.locator('[data-sk="consent-stamp"]')).toHaveCount(0);
    expect(await bandValue(page, "Voice")).toBe("No recorded voice · read aloud by the browser voice");
    await expect(sheetOf(page).locator('[data-sk="packet-band"]')).toHaveCount(7);

    const tape = await continueAndRead(page);
    expect(tape.pages.some((p) => p.text?.audioUrl)).toBe(false);
    expect(tape.signature && "voiceConsent" in tape.signature).toBe(false);
  });

  /* ----------------------------------------------------------- 9 · keyboard */

  test("9 · keyboard: answer → byline → whose voice → consent → Not now → Continue; Escape saves nothing", async ({
    page,
  }) => {
    const dialog = await openGate(page);
    await expect(page.locator("#studio-gate-answer")).toBeFocused();
    await answer(page);
    await page.locator("#studio-gate-consent").check();

    await page.locator("#studio-gate-answer").focus();
    const order: Locator[] = [
      page.locator("#studio-gate-author"),
      dialog.getByRole("radio", { name: CHILDS }),
      page.locator("#studio-gate-consent"),
      dialog.getByRole("button", { name: "Not now" }),
      dialog.getByRole("button", { name: "Continue" }),
    ];
    for (const next of order) {
      await page.keyboard.press("Tab");
      await expect(next).toBeFocused();
    }
    // Shift+Tab walks it back.
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Not now" })).toBeFocused();

    /* the arrows choose inside the group */
    await dialog.getByRole("radio", { name: CHILDS }).focus();
    await page.keyboard.press("ArrowUp");
    await expect(dialog.getByRole("radio", { name: MINE })).toBeChecked();
    await expect(page.locator('label[for="studio-gate-consent"]')).toHaveText(SELF_SENTENCE);
    await page.keyboard.press("ArrowDown");
    await expect(dialog.getByRole("radio", { name: CHILDS })).toBeChecked();
    await expect(page.locator('label[for="studio-gate-consent"]')).toHaveText(CHILD_SENTENCE);

    /* Escape cancels: back in the Studio, nothing saved */
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Finish my story" })).toBeVisible();
    expect(await readLibrary(page)).toHaveLength(0);
  });
});

/* ======================================================= the modules (node) */

test.describe("T14 · tape sheet, consent and tape size (node)", () => {
  // A tiny data URL with a known payload: "data:image/jpeg;base64," + 4 chars → 3 bytes.
  const pic = (bytes: number) => `data:image/jpeg;base64,${Buffer.alloc(bytes, 7).toString("base64")}`;
  const page = (id: number, over: Partial<SsyncManifest["pages"][number]> = {}) => ({
    id,
    illustration: { url: pic(100 * 1024) },
    text: { content: `Words ${id}`, audioUrl: "data:audio/wav;base64,UklGRg==" },
    timing: { autoPause: "2s" },
    ...over,
  });
  const source = (pages: SsyncManifest["pages"], settings: SsyncManifest["settings"] = {}) => ({
    manifest: { metadata: { title: "A Tape", language: "en" }, settings, pages },
    mood: "Calm",
    musicOn: true,
    byline: "Ada",
    year: 2026,
  });
  const value = (rows: ReturnType<typeof tapeSheet>, layer: string) => rows.find((r) => r.layer === layer)!.value;

  test("seven rows in packet order, and their variants", () => {
    const five = tapeSheet(source([1, 2, 3, 4, 5].map((id) => page(id))));
    expect(five.map((r) => r.layer)).toEqual(LAYERS);
    expect(value(five, "Metadata")).toBe("A Tape · by Ada · English");
    expect(value(five, "Visual")).toBe("5 pictures · about 100 KB each");
    expect(five.find((r) => r.layer === "Visual")!.pictures).toHaveLength(5);
    expect(value(five, "Text")).toBe("the words on 5 pages, kept as text — never baked into the pictures");
    expect(value(five, "Voice")).toBe(
      "5 recordings · become AAC/M4A when you tap Continue (WAV if this browser can't make AAC)",
    );
    expect(value(five, "Sound")).toBe("Calm, a music box that dips under every word");
    expect(value(five, "Behavior")).toBe("2-second pauses · the turn-the-page chime · words light up");
    expect(value(five, "Signature")).toBe("© 2026 Ada · personal use");

    const one = tapeSheet(source([page(1)]));
    expect(value(one, "Visual")).toBe("1 picture · about 100 KB");
    expect(value(one, "Text")).toBe("the words on 1 page, kept as text — never baked into the pictures");
    expect(value(one, "Voice")).toBe(
      "1 recording · becomes AAC/M4A when you tap Continue (WAV if this browser can't make AAC)",
    );

    const bare = tapeSheet({
      ...source([page(1, { illustration: {}, text: { content: "" }, timing: { autoPause: "3s" } })]),
      byline: "",
      musicOn: false,
    });
    expect(value(bare, "Metadata")).toBe("A Tape · English");
    expect(value(bare, "Visual")).toBe("No pictures — words only");
    expect(value(bare, "Text")).toBe("No words — pictures and voice only");
    expect(value(bare, "Voice")).toBe("No recorded voice · read aloud by the browser voice");
    expect(value(bare, "Sound")).toBe("No music · silence under the words");
    expect(bare.find((r) => r.layer === "Sound")!.mood).toBeNull();
    expect(value(bare, "Signature")).toBe("© 2026 · personal use");

    const aac = (id: number) => page(id, { text: { content: "w", audioUrl: "data:audio/mp4;base64,AAAA", audioCodec: "aac" } });
    const wav = (id: number) => page(id, { text: { content: "w", audioUrl: "data:audio/wav;base64,AAAA", audioCodec: "wav" } });
    expect(value(tapeSheet(source([aac(1), aac(2)])), "Voice")).toBe("2 recordings · already AAC/M4A");
    expect(value(tapeSheet(source([wav(1)])), "Voice")).toBe("1 recording · already WAV");
    expect(value(tapeSheet(source([aac(1), wav(2)])), "Voice")).toBe("2 recordings · already AAC/M4A and WAV");
    // One fresh take among published ones still becomes AAC at Continue.
    expect(value(tapeSheet(source([aac(1), page(2)])), "Voice")).toMatch(/^2 recordings · become AAC\/M4A/);

    const varied = tapeSheet(
      source([page(1, { timing: { autoPause: "2s" } }), page(2, { timing: { autoPause: "4s" } })], {
        pageTurnSound: false,
        readAlongHighlight: false,
      }),
    );
    expect(value(varied, "Behavior")).toBe("pauses of 2–4 seconds");
    expect(
      value(tapeSheet(source([page(1)], { readAlongHighlight: false })), "Behavior"),
    ).toBe("2-second pauses · the turn-the-page chime");

    // Re-voiced: the original author keeps "by" and the ownership; the byline reads.
    const revoiced = tapeSheet({
      ...source([page(1)]),
      manifest: { metadata: { title: "Old Tape", author: "The Crew", language: "fr" }, settings: {}, pages: [page(1)] },
      remix: { author: "The Crew" },
      byline: "Grandpa Joe",
    });
    expect(value(revoiced, "Metadata")).toBe("Old Tape · by The Crew · read by Grandpa Joe · French");
    expect(value(revoiced, "Signature")).toBe("© 2026 The Crew · personal use");
  });

  test("layerPresence: which of the seven layers a manifest carries", () => {
    const bare: SsyncManifest = { version: "2.0", metadata: { title: "T" }, pages: [{ id: 1 }] };
    expect(layerPresence(bare)).toEqual({
      Metadata: true,
      Visual: false,
      Text: false,
      Voice: false,
      Sound: false,
      Behavior: false,
      Signature: false,
    });
    const full: SsyncManifest = {
      version: "2.0",
      metadata: { title: "T" },
      settings: { pageTurnSound: true },
      signature: { ownership: "© 2026", rights: "personal use" },
      pages: [page(1, { music: "Wonder" })],
    };
    expect(Object.values(layerPresence(full)).every(Boolean)).toBe(true);
  });

  test("consent: records with each voice's own grantor; the stamp's date and second line", () => {
    expect(
      consentRecordsFor(
        [
          { voice: "Mom", grantedBy: "self" },
          { voice: "Ada", grantedBy: "parent/guardian" },
        ],
        "2026-10-19",
      ),
    ).toEqual([
      { voice: "Mom", grantedBy: "self", date: "2026-10-19" },
      { voice: "Ada", grantedBy: "parent/guardian", date: "2026-10-19" },
    ]);
    expect(stampDate("2026-10-19")).toBe("OCT 19 2026");
    expect(stampDate("2026-01-05")).toBe("JAN 5 2026");
    expect(stampDate("not a date")).toBe("not a date");
    expect(stampGrantorLine(["parent/guardian"])).toBe("PARENT/GUARDIAN");
    expect(stampGrantorLine(["self", "self"])).toBe("SELF");
    expect(stampGrantorLine(["self", "parent/guardian"])).toBe("2 VOICES");
  });

  test("tape size: decoded bytes of every data-URL picture and voice", () => {
    expect(dataUrlBytes(pic(10))).toBe(10);
    expect(dataUrlBytes(pic(11))).toBe(11);
    expect(dataUrlBytes("data:,hi%20there")).toBe(8);
    expect(dataUrlBytes("https://example.com/a.jpg")).toBe(0);
    expect(dataUrlBytes(undefined)).toBe(0);
    const bytes = tapeBytes({
      metadata: { coverImage: pic(5) },
      pages: [
        { illustration: { url: pic(100) }, text: { audioUrl: pic(40) } },
        { illustration: { url: "/demo/x.jpg" } },
      ],
    });
    expect(bytes).toEqual({ pictureBytes: 105, voiceBytes: 40, totalBytes: 145 });
    // The Twinkle pictures, as the E2E sheet test reads them.
    const mean = PICTURES.reduce((s, url) => s + dataUrlBytes(url), 0) / PICTURES.length;
    expect(Math.round(mean / 1024 / 10) * 10).toBe(MEAN_KB);
  });
});
