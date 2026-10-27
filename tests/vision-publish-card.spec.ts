// T16 · The printed tape, landscape.
//
// Reference: s05 "One link, Grandma's iPhone" (brief screens[4]), the tablet
// half: at 6:11 Mia's tape comes out of the print slot with her drawing 1 on
// its label, seven layer chips and "consent written" under it, and a
// two-column card — left: "Your tape is ready", "MADE IN 7:48", the finished
// steps, the size meter "2.0 MB OF 15 MB", Download, Back and "Pull the tape
// out — delete everything"; right: "PRIVATE LINK", the URL and Copy, the paper
// QR, "Share the link…" and the unlisted note.
//
// E2E on /studio through the gate to the published card, the Twinkle draft
// seeded by T00 (by "Mia, age 4 — with Mom", with consent, "MADE IN 7:48" on a
// pinned clock), the library read back from localStorage["ssync-library"]:
//
//   1. layout   · two columns that fit 1180×820; one column at 375×812, sharing before deleting
//   2. slot     · the label tucked under the kit PrintSlot; page 1's picture inset; the print-in
//   3. chips    · seven layers lit from the published manifest; "consent written"; a no-voice tape
//   4. steps    · the finished steps, with the publishing phase's details
//   5. meter    · the decoded bytes of the library tape, "<x.y> MB OF 15 MB"
//   6. delete   · "Pull the tape out — delete everything", two taps, every copy gone
//   7. copy     · the right column verbatim; Share where Web Share exists and the link is the
//                 cloud library's (M6: a device-only link gets no QR and no share sheet)
//   8. honesty  · no "Next", no "planned"
//   9. node     · tapeBytes against the packed container; the budget and its formatter
//  10. M6       · a real modal (named, focused, trapped, Escape); the delete disarms; Copy is
//                 announced and fails honestly; the link without its scheme, the code whole;
//                 the QR sticker; phrases that never split at 375
//
// The family content is illustrative and lives in tests/fixtures only.

import { test, expect, type Locator, type Page } from "@playwright/test";
import type { SsyncManifest } from "../src/lib/storysync/manifest";
import { buildStorysyncFromStory, unpackStorysync } from "../src/lib/storysync/container";
import {
  TAPE_BUDGET_BYTES,
  formatTapeSize,
  tapeBytes,
  tapeSizeValueText,
} from "../src/lib/storysync/tape-size";
import { LIBRARY_KEY, DRAFT_KEY, restoreDraft, seedStudioDraft } from "./fixtures/helpers";
import { VOICES_TO_AAC, voicesStepText } from "../src/components/studio/types";
import { TWINKLE, loadTape } from "./fixtures/tapes";
import { evidencePath } from "./fixtures/evidence";

/* ------------------------------------------------------------ reference copy */

const READY = "Your tape is ready";
const LAYERS = ["Metadata", "Visual", "Text", "Voice", "Sound", "Behavior", "Signature"];
/**
 * The finished steps (T17 adds the real step, first because it happens first:
 * "planned · Next" in s05). The voices step says what really happened (M6):
 * the reference's "Converting voices to AAC · 5/5" when every take became
 * AAC; where this browser has no AAC encoder and the takes fell back to WAV
 * (the one permitted fallback), "Converting voices · 5/5 · WAV", agreeing
 * with the label's codec.
 */
function expectedSteps(codecs: Array<string | undefined>): string[] {
  const aac = codecs.filter((c) => c === "aac").length;
  const wav = codecs.filter((c) => c === "wav").length;
  const n = codecs.length;
  const voices =
    wav === 0
      ? `Converting voices to AAC · ${n}/${n}`
      : aac === 0
        ? `Converting voices · ${n}/${n} · WAV`
        : `Converting voices · ${n}/${n} · ${aac} AAC · ${wav} WAV`;
  return [
    "Evening out each voice · 5/5",
    voices,
    "Assembling the SSYNC manifest · 5 pages",
    "Saving your tape · this device",
  ];
}
const DOWNLOAD = "Download the .storysync file";
const BACK = "Back to the studio";
const PULL = "Pull the tape out — delete everything";
const AGAIN = "Tap again to delete everything";
const FINE =
  "Delete removes the pictures, the recordings, the saved copy and the link. Nothing is kept in an archive.";
const QR_LINE =
  "Grandparents do not need the app, an account, or the file — the camera app opens the story in any browser.";
/** M6: with no cloud library the QR's sentence says where the link really opens. */
const DEVICE_QR_LINE = "This code opens the tape on this device only. Another phone needs the .storysync file.";
/** The QR's kicker when there is a cloud link (s05). */
const QR_KICKER = "point a phone camera here";
const SHARE = "Share the link…";
/** No cloud library is configured in this environment: today's device-mode sentence. */
const DEVICE_NOTE =
  "Unlisted and unguessable — and with no cloud library configured it opens the tape on this device. To send the story further, hand someone the .storysync file.";

const INK = "rgb(30, 26, 22)";
const TABLET = { width: 1180, height: 820 };
const PHONE = { width: 375, height: 812 };
/** 6:09:58 pm on Oct 19: the grown-up says yes 7:48 after the Studio opened. */
const MOMENT = new Date("2026-10-19T18:09:58");

const SEL = {
  overlay: '[data-studio="publish-overlay"]',
  card: '[data-studio="publish-card"]',
  left: '[data-studio="publish-left"]',
  right: '[data-studio="publish-right"]',
  steps: '[data-studio="publish-steps"]',
  slot: '[data-sk="print-slot"]',
  label: '[data-sk="tape"]',
  inset: '[data-studio="label-inset"]',
  chips: '[data-sk="layer-chips"]',
  meter: '[data-sk="size-meter"]',
} as const;

/* ------------------------------------------------------------------- helpers */

interface LibraryRow {
  shareCode?: string;
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

/** Stub the Web Share API, so "Share the link…" has somewhere to go. */
async function stubShare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => undefined,
    });
  });
}

/** Take page 1's picture off the seeded draft (runs after the T00 seed, once per tab). */
async function dropFirstPicture(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    try {
      if (window.sessionStorage.getItem("t16-no-first-picture")) return;
      const envelope = JSON.parse(window.localStorage.getItem(key) || "null") as {
        state: { manifest: { pages: Array<{ illustration?: { url?: string; alt?: string } }> } };
      } | null;
      if (!envelope) return;
      delete envelope.state.manifest.pages[0].illustration;
      window.localStorage.setItem(key, JSON.stringify(envelope));
      window.sessionStorage.setItem("t16-no-first-picture", "1");
    } catch {
      /* opaque origins have no storage */
    }
  }, DRAFT_KEY);
}

interface PublishOptions {
  narration?: boolean;
  share?: boolean;
  firstPicture?: boolean;
}

/**
 * Seed Twinkle, open the Studio, pass the gate as Mom ("Mia, age 4 — with Mom",
 * consent ticked when there is a voice) and wait for the ready card. Returns
 * the one tape in the library.
 */
async function publish(page: Page, opts: PublishOptions = {}): Promise<LibraryRow> {
  const { narration = true, share = false, firstPicture = true } = opts;
  await page.clock.setFixedTime(MOMENT);
  if (share) await stubShare(page);
  await seedStudioDraft(page, "twinkle", { narration });
  if (!firstPicture) await dropFirstPicture(page);
  await page.goto("/studio");
  await restoreDraft(page);
  await page.getByRole("button", { name: "Finish my story" }).click();
  const dialog = page.getByRole("dialog", { name: "A grown-up moment" });
  await expect(dialog).toBeVisible({ timeout: 15000 });
  const question = page.locator('label[for="studio-gate-answer"]');
  await expect(question).toContainText(/\d+\s*×\s*\d+/);
  const [, a, b] = (await question.innerText()).match(/(\d+)\s*×\s*(\d+)/)!;
  await page.locator("#studio-gate-answer").fill(String(Number(a) * Number(b)));
  await page.locator("#studio-gate-author").fill(TWINKLE.byline);
  if (narration) await page.locator("#studio-gate-consent").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: READY })).toBeVisible({ timeout: 30000 });
  await settle(page.locator(SEL.overlay));
  const rows = await readLibrary(page);
  expect(rows, "one publish, one tape").toHaveLength(1);
  return rows[0];
}

/** Let the print-in, the rise and the fade finish before measuring. */
async function settle(locator: Locator): Promise<void> {
  await locator.evaluate(
    (el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined))),
    undefined,
    { timeout: 10000 },
  );
}

type Box = { x: number; y: number; width: number; height: number };
async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  expect(b).not.toBeNull();
  return b!;
}

function inside(b: Box, viewport: { width: number; height: number }, name: string): void {
  expect(b.x, `${name} inside the viewport (left)`).toBeGreaterThanOrEqual(0);
  expect(b.y, `${name} inside the viewport (top)`).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width, `${name} inside the viewport (right)`).toBeLessThanOrEqual(viewport.width);
  expect(b.y + b.height, `${name} inside the viewport (bottom)`).toBeLessThanOrEqual(viewport.height);
}

/** Decoded bytes of a base64 data URL; 0 for anything else. */
function decodedBytes(url: string | undefined): number {
  if (!url || !url.startsWith("data:")) return 0;
  return Buffer.from(url.slice(url.indexOf(",") + 1), "base64").length;
}

/* ======================================================================== */

test.describe("T16 · the printed tape, landscape", () => {
  test.setTimeout(120000);

  /* ------------------------------------------------------------- 1 · layout */

  test("1 · two columns that fit 1180×820; one column at 375×812, sharing before deleting", async ({
    page,
  }) => {
    await page.setViewportSize(TABLET);
    await publish(page);

    const left = await box(page.locator(SEL.left));
    const right = await box(page.locator(SEL.right));
    expect(right.x, "the right column stands beside the left, 24px clear").toBeGreaterThanOrEqual(
      left.x + left.width + 24,
    );
    expect(Math.abs(right.y - left.y), "the columns share a top").toBeLessThanOrEqual(2);

    inside(await box(page.locator(SEL.slot)), TABLET, "print slot");
    inside(await box(page.locator(SEL.label)), TABLET, "tape label");
    inside(await box(page.locator(SEL.chips)), TABLET, "layer chips");
    inside(await box(page.locator(SEL.card)), TABLET, "card");
    const [scrollH, clientH] = await page
      .locator(SEL.overlay)
      .evaluate((el) => [el.scrollHeight, el.clientHeight]);
    expect(scrollH, "the published state needs no scroll at 1180×820").toBeLessThanOrEqual(clientH);

    /* still two columns at 1024 */
    await page.setViewportSize({ width: 1024, height: 768 });
    const l2 = await box(page.locator(SEL.left));
    const r2 = await box(page.locator(SEL.right));
    expect(r2.x).toBeGreaterThanOrEqual(l2.x + l2.width + 24);

    /* the phone: one column, the link before the delete */
    await page.setViewportSize(PHONE);
    await settle(page.locator(SEL.overlay));
    const card = page.locator(SEL.card);
    const order: Array<[string, Locator]> = [
      ["heading", card.getByRole("heading", { name: READY })],
      ["steps", card.locator(SEL.steps)],
      ["share-url", card.locator('[data-studio="share-url"]')],
      ["meter", card.getByRole("meter")],
      ["Download", card.getByRole("button", { name: DOWNLOAD })],
      ["Back", card.getByRole("button", { name: BACK })],
      ["delete", card.getByRole("button", { name: PULL, exact: true })],
    ];
    // read the column once it has stopped moving: after the resize the card can
    // still be settling, and boxes read one by one across that would disagree
    // (a box can also be briefly absent while the card re-renders: keep reading)
    const snapshot = () => Promise.all(order.map(([, locator]) => locator.boundingBox()));
    let boxes = await snapshot();
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(100);
      const next = await snapshot();
      const still = !next.includes(null) && JSON.stringify(next) === JSON.stringify(boxes);
      boxes = next;
      if (still) break;
    }
    let previous = -Infinity;
    for (const [i, [name]] of order.entries()) {
      const b = boxes[i];
      expect(b, `${name} is on the card`).not.toBeNull();
      if (!b) continue;
      expect(b.y, `${name} comes next, further down`).toBeGreaterThan(previous);
      expect(b.x, `${name} stays inside a phone`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, `${name} stays inside a phone`).toBeLessThanOrEqual(PHONE.width);
      previous = b.y;
    }
    const widths = await page.evaluate((sel) => {
      const o = document.querySelector(sel)!;
      return [document.documentElement.scrollWidth, o.scrollWidth];
    }, SEL.overlay);
    expect(widths[0]).toBeLessThanOrEqual(PHONE.width);
    expect(widths[1]).toBeLessThanOrEqual(PHONE.width);
  });

  test("1b · keyboard: the Tab order is the order the eye reads, at each width", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await publish(page, { share: true });
    const card = page.locator(SEL.card);
    const url = card.locator('[data-studio="share-url"]');
    const copy = card.getByRole("button", { name: "Copy", exact: true });
    const download = card.getByRole("button", { name: DOWNLOAD });
    const back = card.getByRole("button", { name: BACK });
    const pull = card.getByRole("button", { name: PULL, exact: true });
    // M6: a device-only link (no cloud library here) has no share sheet, even
    // where Web Share exists: no other phone can open it.
    await expect(card.getByRole("button", { name: SHARE })).toHaveCount(0);
    // One column: the link first (it comes first on screen), then the file and the delete.
    // Two columns: down the left column, then down the right.
    const orders: Array<[{ width: number; height: number }, Locator[]]> = [
      [PHONE, [url, copy, download, back, pull]],
      [TABLET, [download, back, pull, url, copy]],
    ];
    for (const [viewport, expected] of orders) {
      await page.setViewportSize(viewport);
      await expect(card).toHaveAttribute("data-layout", viewport === PHONE ? "narrow" : "wide");
      await expected[0].focus();
      for (const next of expected.slice(1)) {
        await page.keyboard.press("Tab");
        await expect(next, `Tab reaches it at ${viewport.width}px`).toBeFocused();
      }
      // And it is drawn in that order: down the page, or down the left column and then the right.
      const boxes: Box[] = [];
      for (const locator of expected) boxes.push(await box(locator));
      if (viewport === PHONE) {
        for (let i = 1; i < boxes.length; i += 1) expect(boxes[i].y).toBeGreaterThanOrEqual(boxes[i - 1].y);
      } else {
        expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
        expect(boxes[2].y).toBeGreaterThan(boxes[1].y);
        expect(boxes[3].x, "the link column is to the right").toBeGreaterThan(boxes[0].x + boxes[0].width);
      }
    }
    // Every control the card adds shows the kit's one focus ring.
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const cs = getComputedStyle(el);
      return { style: cs.outlineStyle, width: cs.outlineWidth };
    });
    expect(ring).toEqual({ style: "solid", width: "3px" });

    // Turning the tablet (crossing 1024px) moves the buttons; the focused one keeps focus.
    await pull.focus();
    await page.setViewportSize(PHONE);
    await expect(card).toHaveAttribute("data-layout", "narrow");
    await expect(pull, "focus survives the move to one column").toBeFocused();
    await page.setViewportSize(TABLET);
    await expect(card).toHaveAttribute("data-layout", "wide");
    await expect(pull, "and back to two").toBeFocused();
  });

  /* --------------------------------------------------------------- 2 · slot */

  test("2 · printed out of a slot, page 1's picture on the label, the print-in", async ({ page }) => {
    await page.setViewportSize(TABLET);
    const tape = await publish(page);

    const slot = await box(page.locator(SEL.slot));
    const label = await box(page.locator(SEL.label));
    expect(slot.y, "the slot sits above the label").toBeLessThan(label.y);
    expect(label.y, "the label's top edge is tucked under the slot").toBeLessThan(slot.y + slot.height);
    expect(slot.width, "the slot is wider than the label").toBeGreaterThan(label.width);
    const slotLook = await page.locator(SEL.slot).evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, h: cs.height, z: Number(cs.zIndex) };
    });
    expect(slotLook.bg).toBe("rgb(5, 7, 13)");
    expect(slotLook.h).toBe("14px");
    const labelZ = await page.locator(SEL.label).evaluate((el) => Number(getComputedStyle(el).zIndex) || 0);
    expect(slotLook.z, "the slot is drawn over the label's edge").toBeGreaterThan(labelZ);

    const inset = page.locator(SEL.inset);
    await expect(inset).toHaveCount(1);
    const first = tape.ssyncData.pages[0].illustration!;
    expect(await inset.getAttribute("src")).toBe(first.url);
    expect(await inset.getAttribute("alt")).toBe(first.alt);
    const insetBox = await box(inset);
    expect(Math.round(insetBox.width)).toBe(72);
    expect(Math.round(insetBox.height)).toBe(72);
    const insetLook = await inset.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { w: cs.borderTopWidth, style: cs.borderTopStyle, color: cs.borderTopColor, r: cs.borderTopLeftRadius };
    });
    expect(insetLook).toEqual({ w: "2px", style: "solid", color: INK, r: "6px" });

    /* the meta lines keep their content */
    const labelEl = page.locator(SEL.label);
    await expect(labelEl.getByText(/^SIDE A · 5 PAGES · \d+:\d\d · (AAC\/M4A|WAV|AAC \+ WAV)$/)).toBeVisible();
    await expect(labelEl.getByText("SSYNC 2.0 · LINKED ON THIS DEVICE", { exact: true })).toBeVisible();
    await expect(labelEl.getByText(TWINKLE.title, { exact: true })).toBeVisible();
    await expect(labelEl.getByText(`by ${TWINKLE.byline}`, { exact: true })).toBeVisible();

    /* the print-in runs, top edge first */
    expect(await labelEl.evaluate((el) => getComputedStyle(el).animationName)).toBe("studio-print");
  });

  test("2b · reduced motion: the label is simply there", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(TABLET);
    await publish(page);
    const label = page.locator(SEL.label);
    expect(await label.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    expect(await label.evaluate((el) => getComputedStyle(el).clipPath)).toBe("none");
  });

  test("2c · no picture on page 1, no inset — and the label is the plain label", async ({ page }) => {
    await page.setViewportSize(TABLET);
    const tape = await publish(page, { firstPicture: false });
    expect(tape.ssyncData.pages[0].illustration?.url).toBeFalsy();
    await expect(page.locator(SEL.inset)).toHaveCount(0);
    // Without an inset the field holds the title, author and meta directly.
    const fieldChildren = await page
      .locator(`${SEL.label} .sk-tape-field`)
      .evaluate((el) => Array.from(el.children).map((c) => c.className));
    expect(fieldChildren).toEqual(["sk-tape-title sk-font-tape", "sk-tape-author sk-font-tape", "sk-tape-meta sk-font-meta"]);
  });

  /* -------------------------------------------------------------- 3 · chips */

  test("3 · seven layer chips, lit from the published tape, and \"consent written\"", async ({ page }) => {
    await page.setViewportSize(TABLET);
    await publish(page);

    const list = page.getByRole("list", { name: "Layers in this tape" });
    await expect(list).toHaveCount(1);
    expect(await list.evaluate((el) => el.tagName)).toBe("UL");
    const items = list.locator("li");
    await expect(items).toHaveCount(7);
    expect(await items.evaluateAll((els) => els.map((el) => el.getAttribute("data-layer")))).toEqual(LAYERS);
    expect(await items.evaluateAll((els) => els.map((el) => el.getAttribute("data-present")))).toEqual(
      LAYERS.map(() => "true"),
    );
    for (const [i, name] of LAYERS.entries()) {
      await expect(items.nth(i)).toContainText(name);
    }
    // Lit = the layer's packet fill with an ink rule; Signature = label-yellow, a tape-red stroke.
    const voice = await items.nth(3).evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, border: cs.borderTopColor };
    });
    expect(voice).toEqual({ bg: "rgb(250, 223, 218)", border: INK });
    const signature = await items.nth(6).evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, border: cs.borderTopColor };
    });
    expect(signature).toEqual({ bg: "rgb(255, 201, 60)", border: "rgb(227, 69, 47)" });

    const note = page.locator(SEL.chips).locator('[data-sk="layer-chips-note"]');
    await expect(note).toBeVisible();
    await expect(note).toHaveText("consent written");
    await expect(note.locator("svg.lucide-arrow-left")).toHaveCount(1);
    const chipsBox = await box(page.locator(SEL.chips));
    const labelBox = await box(page.locator(SEL.label));
    const cardBox = await box(page.locator(SEL.card));
    expect(chipsBox.y, "the chips sit under the label").toBeGreaterThan(labelBox.y + labelBox.height);
    expect(cardBox.y, "and over the card").toBeGreaterThan(chipsBox.y + chipsBox.height);
  });

  test("3b · a tape with no recorded voice: Voice is hollow and no consent note", async ({ page }) => {
    await page.setViewportSize(TABLET);
    const tape = await publish(page, { narration: false });
    expect(tape.ssyncData.signature?.voiceConsent).toBeUndefined();
    const items = page.getByRole("list", { name: "Layers in this tape" }).locator("li");
    await expect(items).toHaveCount(7);
    const voice = items.nth(3);
    await expect(voice).toHaveAttribute("data-layer", "Voice");
    await expect(voice).toHaveAttribute("data-present", "false");
    // A hollow chip says so to a screen reader too.
    await expect(voice).toContainText("not in this tape");
    const look = await voice.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(look, "hollow: no fill").toBe("rgba(0, 0, 0, 0)");
    await expect(page.locator('[data-sk="layer-chips-note"]')).toHaveCount(0);
    await expect(page.getByText("consent written")).toHaveCount(0);

    await page.screenshot({ path: evidencePath("T16-no-voice.png"), animations: "disabled" });
  });

  /* -------------------------------------------------------------- 4 · steps */

  test("4 · the ready card carries the finished steps and their details", async ({ page }) => {
    await page.setViewportSize(TABLET);
    const tape = await publish(page);
    const steps = page.locator(SEL.card).locator(SEL.steps);
    const items = steps.locator("li");
    await expect(items).toHaveCount(4);
    const codecs = tape.ssyncData.pages.map((p) => p.text?.audioCodec);
    expect((await items.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim())).toEqual(expectedSteps(codecs));
    expect(await items.evaluateAll((els) => els.map((el) => el.getAttribute("data-state")))).toEqual([
      "done",
      "done",
      "done",
      "done",
    ]);
    await expect(items.locator("svg.lucide-check")).toHaveCount(4);
    expect(await items.first().evaluate((el) => getComputedStyle(el).fontSize)).toBe("13px");

    /* the left column's own pieces */
    const left = page.locator(SEL.left);
    const made = left.locator('[data-studio="made-in"]');
    await expect(made).toHaveText("Made in 7:48");
    await expect(made).toHaveCSS("text-transform", "uppercase");
    await expect(made.locator("svg.lucide-timer")).toHaveCount(1);
    await expect(left.getByRole("heading", { name: READY })).toBeVisible();
    await expect(left.getByRole("button", { name: DOWNLOAD }).locator("svg.lucide-download")).toHaveCount(1);
    await expect(left.getByRole("button", { name: BACK }).locator("svg.lucide-undo-2")).toHaveCount(1);
    await expect(left.getByText(FINE, { exact: true })).toBeVisible();
    const download = await box(left.getByRole("button", { name: DOWNLOAD }));
    const leftBox = await box(left);
    expect(Math.round(download.width), "Download runs the column's full width").toBe(Math.round(leftBox.width));
  });

  /* -------------------------------------------------------------- 5 · meter */

  test("5 · the size meter reads the tape's decoded bytes against the 15 MB budget", async ({ page }) => {
    await page.setViewportSize(TABLET);
    const tape = await publish(page);
    const manifest = tape.ssyncData;
    let pictures = decodedBytes(manifest.metadata.coverImage);
    let voices = 0;
    for (const p of manifest.pages) {
      pictures += decodedBytes(p.illustration?.url);
      voices += decodedBytes(p.text?.audioUrl);
    }
    const total = pictures + voices;
    expect(total).toBeGreaterThan(0);
    const text = `${(total / 1048576).toFixed(1)} MB OF 15 MB`;

    const meter = page.locator(SEL.card).getByRole("meter");
    await expect(meter).toHaveCount(1);
    await expect(meter).toHaveAttribute("aria-valuetext", text);
    await expect(meter).toHaveAttribute("aria-valuenow", String(total));
    await expect(meter).toHaveAttribute("aria-valuemin", "0");
    await expect(meter).toHaveAttribute("aria-valuemax", String(15 * 1048576));
    await expect(meter).toHaveAccessibleName(/size/i);

    const root = page.locator(SEL.meter);
    await expect(root.locator('[data-sk="size-meter-label"]')).toHaveText(text);
    const legend = (await root.locator('[data-sk="size-meter-legend"]').innerText()).replace(/\s+/g, " ").trim();
    expect(legend).toBe("PICTURES VOICES");
    // Not over budget: the label is not tape-red.
    expect(await root.locator('[data-sk="size-meter-label"]').evaluate((el) => getComputedStyle(el).color)).not.toBe(
      "rgb(227, 69, 47)",
    );
    // The fill is the tape's share of the budget, pictures ink and voices amber.
    const fill = await box(root.locator('[data-sk="size-meter-fill"]'));
    const track = await box(root.locator('[data-sk="size-meter-track"]'));
    expect(fill.width / track.width).toBeGreaterThan(0);
    expect(fill.width / track.width).toBeLessThan(Math.max(0.05, (total / (15 * 1048576)) * 1.5));
  });

  /* ------------------------------------------------------------- 6 · delete */

  test("6 · pull the tape out: two taps delete every copy, the draft and the link", async ({ page }) => {
    await page.setViewportSize(TABLET);
    const tape = await publish(page);
    const code = tape.shareCode!;
    expect(code).toMatch(/^[0-9a-f]{32}$/);

    const pull = page.getByRole("button", { name: PULL, exact: true });
    await expect(pull).toHaveCount(1);
    await expect(pull.locator('[data-sk="pull-tape-icon"]')).toHaveCount(1);
    // A ghost button with a tape-red outline.
    const look = await pull.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { variant: el.getAttribute("data-variant"), border: cs.borderTopColor };
    });
    expect(look.variant).toBe("ghost");
    expect(look.border).toMatch(/^rgba?\(227, 69, 47/);

    await pull.click();
    const again = page.getByRole("button", { name: AGAIN });
    await expect(again).toBeVisible();
    await expect(again).toHaveAttribute("data-variant", "red");
    expect(await readLibrary(page), "the first tap deletes nothing").toHaveLength(1);
    await again.click();
    await expect(page.getByRole("button", { name: "Finish my story" })).toBeVisible();
    expect(await readLibrary(page)).toEqual([]);
    expect(await page.evaluate((key) => window.localStorage.getItem(key), DRAFT_KEY)).toBeNull();

    await page.goto(`/read?story=${code}`);
    await expect(page.getByText("We couldn't find that tape")).toBeVisible({ timeout: 20000 });
  });

  /* --------------------------------------------------------------- 7 · copy */

  test("7 · the right column, verbatim", async ({ page }) => {
    await page.setViewportSize(TABLET);
    await publish(page, { share: true });
    const right = page.locator(SEL.right);

    const kicker = right.locator('[data-studio="link-label"]');
    await expect(kicker).toHaveText("private link");
    expect((await kicker.innerText()).trim()).toBe("PRIVATE LINK");
    await expect(kicker.locator("svg.lucide-lock")).toHaveCount(1);

    const url = right.locator('[data-studio="share-url"]');
    expect(await url.inputValue()).toMatch(/\/read\?story=[0-9a-f]{32}$/);
    expect(await url.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/plex|mono/i);
    const copy = right.getByRole("button", { name: "Copy", exact: true });
    await expect(copy.locator("svg.lucide-copy")).toHaveCount(1);
    expect(await copy.evaluate((el) => getComputedStyle(el).borderTopColor)).toMatch(/^rgba?\(245, 158, 11/);

    // M6 (honesty, s05 "The link, honestly"): this environment has no cloud
    // library, so the link opens on this device only. A QR and a share sheet
    // would send it to another phone, which cannot open it: neither is
    // offered (Web Share is stubbed here, so the share sheet could show). The
    // device note says where the link opens; the .storysync file is how the
    // story travels.
    await expect(right.locator('[data-studio="share-qr"]')).toHaveCount(0);
    await expect(right.locator('[data-studio="qr-frame"]')).toHaveCount(0);
    await expect(right.locator('[data-studio="qr-label"]')).toHaveCount(0);
    await expect(right.getByText(new RegExp(QR_KICKER, "i"))).toHaveCount(0);
    await expect(right.getByText(QR_LINE, { exact: true })).toHaveCount(0);
    await expect(right.getByText(DEVICE_QR_LINE, { exact: true })).toHaveCount(0);
    await expect(right.getByText(/opens the story in any browser/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: SHARE })).toHaveCount(0);
    await expect(right.getByText(DEVICE_NOTE, { exact: true })).toBeVisible();
    const noteBox = await box(right.getByText(DEVICE_NOTE, { exact: true }));
    expect(noteBox.y, "the device note sits under the link").toBeGreaterThan((await box(url)).y);
    await expect(page.getByRole("button", { name: DOWNLOAD })).toBeVisible();

    await page.screenshot({ path: evidencePath("T16.png"), animations: "disabled" });
  });

  test("7b · no Web Share, no Share button", async ({ page }) => {
    await page.addInitScript(() => {
      // Headless Chromium may or may not have it; make sure it does not.
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    });
    await page.setViewportSize(TABLET);
    await publish(page);
    await expect(page.getByRole("button", { name: SHARE })).toHaveCount(0);
    await expect(page.locator(SEL.right).locator('[data-studio="share-url"]')).toBeVisible();
  });

  test("7c · nothing could be kept: the right column says only what happened", async ({ page }) => {
    // This device's library refuses the write, as a full localStorage does.
    await page.addInitScript((key) => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === key) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
        return setItem.call(this, k, v);
      };
    }, LIBRARY_KEY);
    await page.setViewportSize(TABLET);
    await page.clock.setFixedTime(MOMENT);
    await seedStudioDraft(page, "twinkle", { narration: false });
    await page.goto("/studio");
    await restoreDraft(page);
    await page.getByRole("button", { name: "Finish my story" }).click();
    const question = page.locator('label[for="studio-gate-answer"]');
    await expect(question).toContainText(/\d+\s*×\s*\d+/, { timeout: 15000 });
    const [, a, b] = (await question.innerText()).match(/(\d+)\s*×\s*(\d+)/)!;
    await page.locator("#studio-gate-answer").fill(String(Number(a) * Number(b)));
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: READY })).toBeVisible({ timeout: 30000 });

    const right = page.locator(SEL.right);
    await expect(right.locator('[data-studio="share-url"]')).toHaveCount(0);
    await expect(right.getByRole("status")).toHaveText(
      "This device is out of room, so no copy was kept. Download the .storysync file to keep your tape.",
    );
    // Never "Saved on this device" when nothing was saved.
    await expect(page.getByText(/Saved on this device/)).toHaveCount(0);
    // The save step is the last of four since T17 put "Evening out each voice" first.
    const save = page.locator(SEL.steps).locator("li").nth(3);
    await expect(save).toHaveAttribute("data-state", "error");
    await expect(save).toHaveText("Saving your tape · not saved");
    await expect(save.locator("svg.lucide-x")).toHaveCount(1);
    // The file is still there to keep.
    await expect(page.getByRole("button", { name: DOWNLOAD })).toBeVisible();
  });

  /* ------------------------------------------------------------ 8 · honesty */

  test("8 · honesty: no Next chip, no planned step", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await publish(page, { share: true });
    const card = page.locator(SEL.overlay);
    await expect(card.getByText(/^Next$/)).toHaveCount(0);
    await expect(card.getByText(/planned/)).toHaveCount(0);
    await card.evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({ path: evidencePath("T16-375.png"), animations: "disabled", fullPage: false });
    // The column scrolls inside the overlay; the link, then the meter, the file and the delete.
    const middle = page.getByText(DEVICE_NOTE, { exact: true });
    await middle.scrollIntoViewIfNeeded();
    await expect(middle).toBeInViewport();
    await page.screenshot({ path: evidencePath("T16-375-link.png"), animations: "disabled" });
    const pull = page.getByRole("button", { name: PULL, exact: true });
    await card.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(pull).toBeInViewport();
    await expect(page.getByText(FINE, { exact: true })).toBeInViewport();
    await page.screenshot({ path: evidencePath("T16-375-end.png"), animations: "disabled" });
  });

  /* ----------------------------------------------------------- 10 · M6 craft */

  for (const viewport of [TABLET, PHONE]) {
    test(`10 · the ready card is a modal at ${viewport.width}: named, focused, Tab stays in, Escape leaves`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await publish(page, { share: true });
      const dialog = page.getByRole("dialog", { name: READY });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      const inside = () =>
        page.evaluate(
          (sel) => document.activeElement?.closest(sel) !== null && document.activeElement !== document.body,
          SEL.overlay,
        );
      // Focus moved in with the card: its heading.
      await expect(page.getByRole("heading", { name: READY })).toBeFocused();
      for (let i = 0; i < 14; i += 1) {
        await page.keyboard.press("Tab");
        expect(await inside(), `Tab ${i + 1} stays in the card`).toBe(true);
      }
      for (let i = 0; i < 8; i += 1) {
        await page.keyboard.press("Shift+Tab");
        expect(await inside(), `Shift+Tab ${i + 1} stays in the card`).toBe(true);
      }
      // Opaque: nothing of the Studio shows through.
      const alpha = await page.locator(SEL.overlay).evaluate((el) => {
        const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)!.map(Number);
        return m.length > 3 ? m[3] : 1;
      });
      expect(alpha).toBe(1);

      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Finish my story" })).toBeFocused();
      expect(await readLibrary(page), "leaving deletes nothing").toHaveLength(1);
    });
  }

  test("10 · the delete disarms: Escape, moving on, or five seconds; the armed state is announced", async ({
    page,
  }) => {
    await page.setViewportSize(TABLET);
    await publish(page);
    const pull = page.getByRole("button", { name: PULL, exact: true });
    const status = page.locator(SEL.card).getByRole("status").filter({ hasText: "Press again" });

    /* Escape */
    await pull.click();
    await expect(page.getByRole("button", { name: AGAIN })).toBeVisible();
    await expect(status).toHaveText("Press again to delete everything");
    await page.keyboard.press("Escape");
    await expect(pull).toBeVisible();
    await expect(status).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: READY }), "the first Escape only disarms").toBeVisible();

    /* moving on to another control */
    await pull.click();
    await expect(page.getByRole("button", { name: AGAIN })).toBeVisible();
    await page.getByRole("button", { name: DOWNLOAD }).focus();
    await expect(pull).toBeVisible();

    /* five seconds */
    await pull.click();
    await expect(page.getByRole("button", { name: AGAIN })).toBeVisible();
    await expect(pull).toBeVisible({ timeout: 7000 });
    expect(await readLibrary(page), "nothing was deleted").toHaveLength(1);
  });

  test("10 · Copy says so: 'Link copied' is announced; a refused clipboard selects the link and says how", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __clip: string[]; __refuse: boolean };
      w.__clip = [];
      w.__refuse = false;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            if (w.__refuse) throw new DOMException("Denied", "NotAllowedError");
            w.__clip.push(text);
          },
        },
      });
    });
    await page.setViewportSize(TABLET);
    await publish(page);
    const card = page.locator(SEL.card);
    const copy = card.getByRole("button", { name: "Copy", exact: true });
    await copy.click();
    await expect(card.getByRole("status").filter({ hasText: "Link copied" })).toHaveText("Link copied");
    const clip = await page.evaluate(() => (window as unknown as { __clip: string[] }).__clip);
    expect(clip).toHaveLength(1);
    expect(clip[0]).toMatch(/^https?:\/\/.+\/read\?story=[0-9a-f]{32}$/);

    await page.evaluate(() => ((window as unknown as { __refuse: boolean }).__refuse = true));
    await expect(card.getByRole("button", { name: "Copy", exact: true })).toBeVisible({ timeout: 5000 });
    await card.getByRole("button", { name: "Copy", exact: true }).click();
    const field = card.locator('[data-studio="share-url"]');
    await expect(card.locator('[data-studio="copy-hint"]')).toContainText("Press and hold to copy");
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute("aria-describedby", "pc-copy-hint");
    // Focused, the field shows the whole URL, selected.
    const selected = await field.evaluate((el: HTMLInputElement) => el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0));
    expect(selected).toBe(await field.inputValue());
  });

  for (const viewport of [TABLET, PHONE]) {
    test(`10 · the link as s05 prints it at ${viewport.width}: no scheme, the code bold and whole`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const tape = await publish(page);
      await page.evaluate(() => document.fonts.ready);
      await settle(page.locator(SEL.overlay));
      const display = page.locator('[data-studio="share-url-display"]');
      await expect(display).toBeVisible();
      const text = (await display.innerText()).replace(/\s+/g, "");
      expect(text.startsWith("http"), "no scheme").toBe(false);
      expect(text.endsWith(`/read?story=${tape.shareCode}`)).toBe(true);
      const code = display.locator('[data-studio="share-code"]');
      await expect(code).toHaveText(tape.shareCode!);
      expect(await code.evaluate((el) => el.tagName)).toBe("B");
      const look = await code.evaluate((el) => Number(getComputedStyle(el).fontWeight));
      expect(look).toBeGreaterThanOrEqual(600);
      // The code is drawn whole, inside the field (one frame).
      const fit = await page.evaluate(() => {
        const field = document.querySelector('[data-studio="share-url"]')!.getBoundingClientRect();
        const c = document.querySelector('[data-studio="share-code"]')!;
        const rects = Array.from(c.getClientRects());
        return {
          field: { left: field.left, right: field.right, top: field.top, bottom: field.bottom },
          left: Math.min(...rects.map((r) => r.left)),
          right: Math.max(...rects.map((r) => r.right)),
          top: Math.min(...rects.map((r) => r.top)),
          bottom: Math.max(...rects.map((r) => r.bottom)),
          clipped: c.scrollWidth > c.clientWidth + 1,
          lines: new Set(rects.map((r) => Math.round(r.top))).size,
        };
      });
      // One line beside the host on a tablet; a 32-hex device code may take two on a phone.
      expect(fit.lines).toBeLessThanOrEqual(viewport === TABLET ? 1 : 2);
      expect(fit.right).toBeLessThanOrEqual(fit.field.right + 1);
      expect(fit.left).toBeGreaterThanOrEqual(fit.field.left - 1);
      expect(fit.top).toBeGreaterThanOrEqual(fit.field.top - 1);
      expect(fit.bottom).toBeLessThanOrEqual(fit.field.bottom + 1);
      expect(fit.clipped).toBe(false);
      // The field itself still holds the full https URL.
      expect(await page.locator('[data-studio="share-url"]').inputValue()).toMatch(/^https?:\/\//);
    });
  }

  test("10 · under forced colours the printed link steps aside and the field shows the URL", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.setViewportSize(TABLET);
    await publish(page);
    // Forced colours paint the field's text whatever its colour, so the
    // printed copy over it would double up: it is hidden, the field reads alone.
    await expect(page.locator('[data-studio="share-url-display"]')).toBeHidden();
    const field = page.locator('[data-studio="share-url"]');
    await expect(field).toBeVisible();
    expect(await field.inputValue()).toMatch(/^https?:\/\/.+\/read\?story=[0-9a-f]+$/);
  });

  test("10 · the QR is a printed sticker: paper, a 2px ink rule, radius 10", async ({ page }) => {
    await page.setViewportSize(TABLET);
    await publish(page);
    // The QR belongs to the cloud library's link only (M6); in device mode
    // there is none to measure (see "M6 · device mode" below).
    const meta = await page.locator(SEL.overlay).locator(SEL.label).first().innerText();
    test.skip(!/SHARED UNLISTED/.test(meta), "no cloud library here: a device-only link has no QR");
    const frame = page.locator('[data-studio="share-qr"]').locator("xpath=..");
    const look = await frame.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { w: cs.borderTopWidth, color: cs.borderTopColor, r: cs.borderTopLeftRadius };
    });
    expect(look).toEqual({ w: "2px", color: INK, r: "10px" });
    const b = await box(frame);
    expect(b.width).toBeGreaterThanOrEqual(150);
    expect(b.width).toBeLessThanOrEqual(172);
  });

  test("10 · at 375 the label's meta and the steps never split a phrase", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await publish(page);
    await page.evaluate(() => document.fonts.ready);
    await settle(page.locator(SEL.overlay));
    const rects = await page.evaluate(() => {
      const details = Array.from(document.querySelectorAll('[data-studio="publish-steps"] [data-studio="step-detail"]'));
      const groups = Array.from(document.querySelectorAll('[data-sk="tape"] .pc-meta-2 span, [data-sk="tape"] .sk-tape-meta > span > span'));
      // Lines, not rects: a glyph from a fallback font ("·") is its own rect on the same line.
      const lines = (el: Element) => new Set(Array.from(el.getClientRects()).map((r) => Math.round(r.top))).size;
      return {
        details: details.map((el) => [el.textContent, lines(el)]),
        groups: groups.map((el) => [el.textContent, lines(el)]),
      };
    });
    expect(rects.details.length).toBe(4);
    for (const [text, n] of rects.details) expect(n, `"${text}" on one line`).toBe(1);
    expect(rects.groups.map(([t]) => t)).toContain("LINKED ON THIS DEVICE");
    for (const [text, n] of rects.groups) expect(n, `"${text}" on one line`).toBe(1);
  });
});

/* ======================================================================== */

test.describe("M6 · the ready card tells the truth about the link and the codec", () => {
  test.setTimeout(120000);

  for (const viewport of [TABLET, PHONE]) {
    test(`device mode at ${viewport.width}: no QR and no share sheet for a link only this device opens; the file is the way`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      // Web Share exists here, so only the device-mode rule can keep the sheet away.
      await publish(page, { share: true });
      const right = page.locator(SEL.right);
      await expect(page.locator(SEL.overlay).locator(SEL.label).first()).toContainText("LINKED ON THIS DEVICE");
      await expect(right.locator('[data-studio="share-url"]')).toHaveValue(/\/read\?story=[0-9a-f]{32}$/);
      await expect(right.getByRole("button", { name: "Copy", exact: true })).toBeVisible();
      await expect(right.getByText(DEVICE_NOTE, { exact: true })).toBeVisible();
      await expect(page.locator('[data-studio="share-qr"], [data-studio="qr-frame"], [data-studio="qr-label"]')).toHaveCount(0);
      await expect(page.getByRole("img", { name: /QR code/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: SHARE })).toHaveCount(0);
      await expect(page.getByText(/point a phone camera|any browser/i)).toHaveCount(0);
      await expect(page.getByRole("button", { name: DOWNLOAD })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, "no sideways scroll").toBeLessThanOrEqual(0);
    });
  }

  test("no AAC encoder: the voices step says WAV, as the label does, and never claims AAC", async ({ page }) => {
    // A browser without a WebCodecs AAC encoder (Firefox, many Linux builds).
    await page.addInitScript(() => {
      delete (window as unknown as { AudioEncoder?: unknown }).AudioEncoder;
    });
    await page.setViewportSize(TABLET);
    const tape = await publish(page);
    expect(tape.ssyncData.pages.map((p) => p.text?.audioCodec)).toEqual(["wav", "wav", "wav", "wav", "wav"]);
    const items = page.locator(SEL.card).locator(SEL.steps).locator("li");
    await expect(items.nth(1)).toHaveText("Converting voices · 5/5 · WAV");
    await expect(page.locator(SEL.card).locator(SEL.steps)).not.toContainText("to AAC");
    await expect(page.locator(SEL.overlay).locator(SEL.label).first()).toContainText("WAV");
  });

  test("the voices step, worded from what each take became (node)", () => {
    // Every take AAC: the reference's words, verbatim.
    expect(voicesStepText(5, 5, 5, 0)).toEqual({ label: "Converting voices to AAC", detail: "5/5" });
    expect(voicesStepText(2, 5, 2, 0)).toEqual({ label: "Converting voices to AAC", detail: "2/5" });
    // Any fallback: no AAC claim, and the detail names what was written.
    expect(voicesStepText(5, 5, 0, 5)).toEqual({ label: "Converting voices", detail: "5/5 · WAV" });
    expect(voicesStepText(5, 5, 3, 2)).toEqual({ label: "Converting voices", detail: "5/5 · 3 AAC · 2 WAV" });
    expect(VOICES_TO_AAC).toBe("Converting voices to AAC");
  });

  test("the room behind the card is inert while it is open, and live again after", async ({ page }) => {
    await page.setViewportSize(TABLET);
    await publish(page);
    const state = () =>
      page.evaluate(() => {
        const room = document.querySelector(".studio") as HTMLElement & { inert: boolean };
        const overlay = document.querySelector('[data-studio="publish-overlay"]');
        return { inert: room.inert, cardInRoom: overlay ? room.contains(overlay) : null };
      });
    expect(await state()).toEqual({ inert: true, cardInRoom: false });
    // Nothing in the room takes focus, even when asked directly.
    await page.locator("#studio-title").evaluate((el: HTMLElement) => el.focus());
    await expect(page.locator("#studio-title")).not.toBeFocused();
    await page.getByRole("button", { name: BACK }).click();
    await expect(page.getByRole("dialog", { name: READY })).toHaveCount(0);
    expect(await state()).toEqual({ inert: false, cardInRoom: null });
    await expect(page.getByRole("button", { name: "Finish my story" })).toBeFocused();
  });
});

/* ======================================================================== */

test.describe("T16 · tape size and the budget (node)", () => {
  test("tapeBytes equals the packed container's asset bytes, split pictures / voices", () => {
    const { story } = loadTape("twinkle");
    const sizes = tapeBytes(story);
    const { assets } = unpackStorysync(buildStorysyncFromStory(story));
    let pictures = 0;
    let voices = 0;
    for (const [name, bytes] of assets) {
      if (/^assets\/(page-|cover)/.test(name)) pictures += bytes.byteLength;
      else if (name.startsWith("assets/narration-")) voices += bytes.byteLength;
      else throw new Error(`unexpected asset ${name}`);
    }
    expect(sizes).toEqual({ pictureBytes: pictures, voiceBytes: voices, totalBytes: pictures + voices });
    expect(pictures).toBeGreaterThan(0);
    expect(voices).toBeGreaterThan(0);
  });

  test("the 15 MB budget and its formatter", () => {
    expect(TAPE_BUDGET_BYTES).toBe(15 * 1_048_576);
    expect(formatTapeSize(2_097_152)).toBe("2.0 MB OF 15 MB");
    expect(formatTapeSize(0)).toBe("0.0 MB OF 15 MB");
    expect(formatTapeSize(1_153_434)).toBe("1.1 MB OF 15 MB");
    expect(formatTapeSize(TAPE_BUDGET_BYTES)).toBe("15.0 MB OF 15 MB");
    expect(formatTapeSize(3 * 1_048_576, 5 * 1_048_576)).toBe("3.0 MB OF 5 MB");
    expect(tapeSizeValueText(2_097_152)).toBe("2.0 MB OF 15 MB");
    expect(tapeSizeValueText(TAPE_BUDGET_BYTES)).toBe("15.0 MB OF 15 MB");
    expect(tapeSizeValueText(16 * 1_048_576)).toBe("16.0 MB OF 15 MB · over the 15 MB budget");
  });
});
