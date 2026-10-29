/**
 * M6 wave B · Studio recording safety and the phone take sheet (s03, s06).
 *
 * While a take records, nothing may change the page under it or play into the
 * open microphone:
 *   rail     · Photo and Magic wait (aria-disabled, data-waiting, a title that
 *              says why), stay in the Tab order, and open nothing by tap,
 *              Enter or a forced click
 *   camera   · neither the rail's Photo nor the Stage's "Add a picture" opens
 *              a file chooser mid-take
 *   Magic    · a story being written when a take starts never replaces the
 *              story the take belongs to
 *   playback · Space (focus on the page), Play and Listen play nothing: no
 *              <audio>, no browser voice, no music bed
 *   codec    · one mono line under Stop: what the recorder negotiated during a
 *              take, what the page's voice is after it — never assumed
 *   phone    · mid-take the Voice sheet leaves the picture being read whole
 *              (ring and pill too), drops the title and subtitle that only
 *              repeat the pill, keeps Close and the privacy footnote, is
 *              opaque, and is the only Stop (the transport steps out, inert)
 *
 * Illustrative fixture content only (tests/fixtures).
 */

import { expect, test, type Locator, type Page } from "@playwright/test";
import { restoreDraft, seedStudioDraft } from "./fixtures/helpers";
import { stubMicrophone } from "./fixtures/mic";
import { evidenceShot } from "./fixtures/evidence";
import { TWINKLE } from "./fixtures/tapes";

type Size = { width: number; height: number };
const TABLET: Size = { width: 1180, height: 820 };
const PHONE: Size = { width: 375, height: 812 };
const PHONE_390: Size = { width: 390, height: 844 };
const BETWEEN: Size = { width: 900, height: 800 };

const WAIT_HINT = "Finish the recording first";
const MAGIC_SET_ASIDE =
  "Your recording comes first: the new story was not made. Your idea is still in Magic for after the take.";
const FOOTNOTE = "Recordings live only in this browser until a grown-up taps Finish my story.";

const SEL = {
  rail: 'nav[aria-label="Story tools"]',
  card: '[data-studio="tool-card"]',
  transport: 'section[aria-label="Transport"]',
  transportArea: ".studio-area-transport",
  photo: '[data-studio="stage-photo"]',
  pill: '[data-studio="listening-pill"]',
  ring: '[data-sk="listening-ring"]',
  readThis: '[data-studio="read-this"]',
  readWords: '[data-studio="read-this-words"]',
  codec: '[data-studio="codec-line"]',
  recording: ".studio[data-recording='true']",
} as const;

/* ---------------------------------------------------------------- helpers */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

async function box(locator: Locator): Promise<Box> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  });
}

const rail = (page: Page) => page.locator(SEL.rail);
const railTool = (page: Page, name: "Photo" | "Voice" | "Music" | "Magic") =>
  rail(page).getByRole("button", { name, exact: true });
const recKey = (page: Page) => page.locator('[data-sk="transport"][data-kind="rec"]');

async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const finite = document
      .getAnimations()
      .filter((a) => Number.isFinite(a.effect?.getComputedTiming().iterations ?? Infinity));
    await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function photoReady(page: Page): Promise<void> {
  const photo = page.locator(SEL.photo);
  await expect(photo).toBeVisible();
  await expect
    .poll(() =>
      photo.evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0),
    )
    .toBe(true);
}

/** Twinkle restored from this device's draft, page `n` on the Stage. */
async function openTwinkle(page: Page, viewport: Size, n = 3, reducedMotion = false): Promise<void> {
  await page.setViewportSize(viewport);
  if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await stubMicrophone(page);
  await seedStudioDraft(page, "twinkle");
  await page.goto("/studio");
  await restoreDraft(page);
  if (n !== 1) {
    await page.getByRole("button", { name: new RegExp(`^Page ${n}\\b`) }).click();
    await expect(page.getByRole("button", { name: new RegExp(`^Page ${n}\\b.*selected`) })).toHaveCount(1);
  }
  await photoReady(page);
  await settle(page);
}

/** A fresh studio (no draft): page 1, no picture, no voice. */
async function openFresh(page: Page, viewport: Size): Promise<void> {
  await page.setViewportSize(viewport);
  await stubMicrophone(page);
  await page.goto("/studio");
  await expect(page.locator('[data-studio="transport-readout"]')).toContainText("pg 1/1");
}

async function startTake(page: Page): Promise<void> {
  await recKey(page).click();
  await expect(page.locator(SEL.recording)).toHaveCount(1);
}

async function stopTake(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Stop —/ }).click();
  await expect(page.locator(SEL.recording)).toHaveCount(0, { timeout: 10000 });
}

/** Anything sounding: an unpaused <audio>, the browser voice, the music bed. */
async function sounding(page: Page) {
  return page.evaluate(() => ({
    audio: Array.from(document.querySelectorAll("audio")).filter((a) => !a.paused).length,
    speech: Boolean(window.speechSynthesis?.speaking || window.speechSynthesis?.pending),
    bed: Boolean((window as unknown as { __ssyncStudio?: { musicPlaying: () => boolean } }).__ssyncStudio?.musicPlaying()),
  }));
}

/** A file chooser opened within `ms` (the waiter is registered before the action). */
async function fileChooserAfter(page: Page, action: () => Promise<void>, ms = 1500): Promise<boolean> {
  const chooser = page.waitForEvent("filechooser", { timeout: ms }).then(
    () => true,
    () => false,
  );
  await action();
  return chooser;
}

/* ================================================================= rail */

test.describe("M6b · mid-take, Photo and Magic wait", () => {
  for (const viewport of [TABLET, PHONE]) {
    test(`${viewport.width}×${viewport.height}: aria-disabled, data-waiting, the reason; in the Tab order; Enter and clicks open nothing`, async ({ page }) => {
      await openTwinkle(page, viewport);
      // idle: nothing waits
      for (const name of ["Photo", "Magic"] as const) {
        await expect(railTool(page, name)).not.toHaveAttribute("aria-disabled", "true");
        await expect(railTool(page, name)).not.toHaveAttribute("data-waiting", "true");
      }

      await startTake(page);
      for (const name of ["Photo", "Magic"] as const) {
        const key = railTool(page, name);
        await expect(key, `${name} waits`).toHaveAttribute("aria-disabled", "true");
        await expect(key).toHaveAttribute("data-waiting", "true");
        await expect(key).toHaveAttribute("title", WAIT_HINT);
        // still a real, focusable key: not `disabled`, not out of the Tab order
        expect(await key.evaluate((el) => (el as HTMLButtonElement).disabled), `${name} is not \`disabled\``).toBe(false);
        expect(await key.evaluate((el) => (el as HTMLElement).tabIndex)).toBeGreaterThanOrEqual(0);
      }
      // the friendly tools that cannot change the page do not wait
      for (const name of ["Voice", "Music"] as const) {
        await expect(railTool(page, name)).not.toHaveAttribute("aria-disabled", "true");
      }
      await expect(rail(page).locator('[aria-live="polite"]')).toContainText(
        "Photo and Magic wait until the recording is finished.",
      );

      // Tab reaches Magic from Music (the order is unchanged mid-take)
      await railTool(page, "Music").focus();
      await page.keyboard.press("Tab");
      await expect(railTool(page, "Magic")).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog", { name: "Magic" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Make my story" })).toHaveCount(0);

      // Photo by keyboard and by pointer: no camera
      await railTool(page, "Photo").focus();
      expect(await fileChooserAfter(page, () => page.keyboard.press("Enter")), "Enter on Photo opens no camera").toBe(false);
      // a click delivered to the key itself (on a phone the take sheet covers
      // the toolbar, so a real tap could never land there)
      expect(
        await fileChooserAfter(page, () => railTool(page, "Photo").dispatchEvent("click")),
        "a click on Photo opens no camera",
      ).toBe(false);
      await railTool(page, "Magic").dispatchEvent("click");
      await expect(page.getByRole("button", { name: "Make my story" })).toHaveCount(0);

      // the take is untouched by all of it
      await expect(page.locator(SEL.recording)).toHaveCount(1);
      await stopTake(page);
      for (const name of ["Photo", "Magic"] as const) {
        await expect(railTool(page, name)).not.toHaveAttribute("aria-disabled", "true");
      }
      // and once it is finished, Photo opens the camera again
      if (viewport === PHONE) await page.getByRole("button", { name: "Close Voice" }).click();
      expect(await fileChooserAfter(page, () => railTool(page, "Photo").click())).toBe(true);
    });
  }

  test("the Stage's 'Add a picture' waits mid-take: disabled, says why, opens no camera", async ({ page }) => {
    await openFresh(page, TABLET);
    const add = page.locator('[data-studio="stage-add-picture"]');
    await expect(add).toBeEnabled();
    await startTake(page);
    await expect(add).toBeDisabled();
    await expect(add).toContainText(WAIT_HINT);
    await expect(add).toHaveAttribute("title", WAIT_HINT);
    expect(await fileChooserAfter(page, () => add.click({ force: true })), "no camera mid-take").toBe(false);
    await stopTake(page);
    await expect(add).toBeEnabled();
    await expect(add).toContainText("Take a photo of your drawing");
    expect(await fileChooserAfter(page, () => add.click())).toBe(true);
  });
});

/* ================================================================ magic */

test.describe("M6b · Magic never replaces the story a take belongs to", () => {
  test("1180×820: a story still being written when the take starts is set aside; page 1 keeps its words, its title and the new voice", async ({ page }) => {
    // Magic routes each picture through fetch(data:…); slow those down so the
    // take can start while the story is still being written.
    await page.addInitScript(() => {
      const real = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.startsWith("data:image/")) await new Promise((resolve) => setTimeout(resolve, 400));
        return real(input, init);
      };
    });
    await openFresh(page, TABLET);
    const words = "Our cat sat on the rug and sang.";
    await page.locator("#studio-page-text").fill(words);
    await page.locator("#studio-title").fill("Our Cat");

    await railTool(page, "Magic").click();
    await page.locator("#studio-magic-prompt").fill("A dragon who loves pancakes");
    await page.getByRole("button", { name: "Make my story" }).click();
    await page.getByRole("button", { name: "Yes, replace my pages" }).click();
    await expect(page.getByRole("button", { name: "Writing…" })).toBeVisible();

    // the take starts while Magic is still writing
    await startTake(page);
    // Magic finishes writing and sets its story aside, saying why
    await expect(page.locator('[data-studio="announcement"]')).toHaveText(MAGIC_SET_ASIDE, { timeout: 15000 });
    await expect(page.locator(SEL.recording), "the take goes on").toHaveCount(1);
    await expect(page.locator("#studio-title")).toHaveValue("Our Cat");
    await expect(page.locator("#studio-page-text")).toHaveValue(words);
    await expect(page.getByRole("button", { name: /^Page \d/ })).toHaveCount(1);

    await stopTake(page);
    await expect(page.getByRole("button", { name: /^Page 1, has voice/ })).toBeVisible();
    await expect(page.locator("#studio-page-text")).toHaveValue(words);
    await expect(page.locator("#studio-title")).toHaveValue("Our Cat");
    // the idea is kept for after the take
    await railTool(page, "Magic").click();
    await expect(page.locator("#studio-magic-prompt")).toHaveValue("A dragon who loves pancakes");
  });

  test("1180×820: Record tapped while Magic writes and the microphone permission is still pending (4 s) — the take keeps its story and its page", async ({ page }) => {
    await page.setViewportSize(TABLET);
    await page.addInitScript(() => {
      const real = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.startsWith("data:image/")) await new Promise((resolve) => setTimeout(resolve, 300));
        return real(input, init);
      };
    });
    await stubMicrophone(page);
    // the grown-up takes 4 s to answer the permission prompt
    await page.addInitScript(() => {
      const devices = navigator.mediaDevices;
      const ask = devices.getUserMedia.bind(devices);
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async (constraints: MediaStreamConstraints) => {
            await new Promise((resolve) => setTimeout(resolve, 4000));
            return ask(constraints);
          },
        },
      });
    });
    await page.goto("/studio");
    await expect(page.locator('[data-studio="transport-readout"]')).toContainText("pg 1/1");
    const words = "Our cat sat on the rug.";
    await page.locator("#studio-page-text").fill(words);
    await railTool(page, "Magic").click();
    await page.locator("#studio-magic-prompt").fill("A dragon who loves pancakes");
    await page.getByRole("button", { name: "Make my story" }).click();
    await page.getByRole("button", { name: "Yes, replace my pages" }).click();
    await expect(page.getByRole("button", { name: "Writing…" })).toBeVisible();
    await recKey(page).click();

    // Magic lands while the permission is pending: it is set aside
    await expect(page.locator('[data-studio="announcement"]')).toHaveText(MAGIC_SET_ASIDE, { timeout: 15000 });
    await expect(page.getByRole("button", { name: /^Page \d/ })).toHaveCount(1);
    await expect(page.locator("#studio-page-text")).toHaveValue(words);
    // then the microphone opens on the same story
    await expect(page.locator(SEL.recording)).toHaveCount(1, { timeout: 10000 });
    await stopTake(page);
    await expect(page.getByRole("button", { name: /^Page \d/ })).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^Page 1, has voice/ })).toBeVisible();
    await expect(page.locator("#studio-page-text")).toHaveValue(words);
  });

  test("a take starts only with the Voice card: an open Magic card gives way and cannot come back until Stop", async ({ page }) => {
    await openFresh(page, TABLET);
    await railTool(page, "Magic").click();
    await page.locator("#studio-magic-prompt").fill("A turtle and the big waves");
    await expect(page.getByRole("button", { name: "Make my story" })).toBeEnabled();
    await startTake(page);
    await expect(page.getByRole("dialog", { name: "Magic" })).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Voice" })).toBeVisible();
    await railTool(page, "Magic").dispatchEvent("click");
    await expect(page.getByRole("dialog", { name: "Magic" })).toHaveCount(0);
    await stopTake(page);
    await railTool(page, "Magic").click();
    await expect(page.getByRole("dialog", { name: "Magic" })).toBeVisible();
  });
});

/* ============================================================= playback */

test.describe("M6b · nothing plays into the open microphone", () => {
  for (const viewport of [TABLET, PHONE]) {
    test(`${viewport.width}×${viewport.height}: Space with focus on the page plays nothing mid-take; idle it still plays`, async ({ page }) => {
      await openTwinkle(page, viewport);
      await startTake(page);
      // focus off every control: the page body owns Space
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press(" ");
      await page.waitForTimeout(500);
      expect(await sounding(page), "Space mid-take").toEqual({ audio: 0, speech: false, bed: false });
      await expect(page.locator(SEL.recording), "the take goes on").toHaveCount(1);
      await expect(page.getByRole("button", { name: "Stop playing" })).toHaveCount(0);
      await expect(page.locator('[data-studio="announcement"]')).toHaveText(
        "Finish the recording before playing the story.",
      );
      await stopTake(page);

      // idle, Space still plays the page (the shortcut is not simply gone)
      await page.getByRole("button", { name: "Close Voice" }).click();
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press(" ");
      await expect(page.getByRole("button", { name: "Stop playing" })).toBeVisible();
      await page.keyboard.press(" ");
      await expect(page.getByRole("button", { name: "Play the story" })).toBeVisible();
    });
  }

  test("Listen is gone mid-take, and a forced Play plays nothing", async ({ page }) => {
    await openTwinkle(page, TABLET);
    await railTool(page, "Voice").click();
    const card = page.locator(SEL.card);
    await expect(card.getByRole("button", { name: "Listen" })).toBeVisible();
    await startTake(page);
    await expect(card.getByRole("button", { name: "Listen" })).toHaveCount(0);
    await page.getByRole("button", { name: "Play the story" }).click({ force: true });
    await page.waitForTimeout(400);
    expect(await sounding(page)).toEqual({ audio: 0, speech: false, bed: false });
    await stopTake(page);
  });
});

/* ================================================================ codec */

test.describe("M6b · the codec line under Stop", () => {
  test("AAC negotiated: `draft · AAC — Finish is a passthrough` during the take and after it; mono 10.5 px, muted", async ({ page }) => {
    await openFresh(page, BETWEEN);
    await railTool(page, "Voice").click();
    const card = page.locator(SEL.card);
    await expect(card.locator(SEL.codec), "no voice yet, no line").toHaveCount(0);
    await startTake(page);
    const line = card.locator(SEL.codec);
    await expect(line).toHaveText("draft · AAC — Finish is a passthrough");
    const look = await line.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { size: parseFloat(cs.fontSize), mono: cs.fontFamily.toLowerCase(), upper: cs.textTransform };
    });
    expect(look.size).toBeCloseTo(10.5, 1);
    expect(look.mono).toMatch(/mono/);
    expect(look.upper).toBe("uppercase");
    // under Stop
    const stop = await box(card.getByRole("button", { name: /^Stop —/ }));
    expect((await box(line)).y).toBeGreaterThanOrEqual(stop.bottom - 1);
    expect(await line.innerText(), "never names a browser").not.toMatch(/safari|chrome/i);
    await stopTake(page);
    await expect(line).toHaveText("draft · AAC — Finish is a passthrough");
  });

  test("Opus negotiated: the line reports Opus and that Finish converts it to AAC — what was negotiated, never assumed", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await stubMicrophone(page);
    await page.addInitScript(() => {
      const MR = (window as unknown as { MediaRecorder: { isTypeSupported: (t: string) => boolean } }).MediaRecorder;
      MR.isTypeSupported = (type: string) => type === "audio/webm;codecs=opus";
    });
    await page.goto("/studio");
    await railTool(page, "Voice").click();
    await startTake(page);
    const line = page.locator(SEL.card).locator(SEL.codec);
    await expect(line).toHaveText("draft · Opus — Finish converts it to AAC");
    await stopTake(page);
    await expect(line).toHaveText("draft · Opus — Finish converts it to AAC");
  });

  test("docked (1180×820) the column's take keeps s03's measure: no codec line there", async ({ page }) => {
    await openFresh(page, TABLET);
    await railTool(page, "Voice").click();
    await startTake(page);
    await expect(page.locator(SEL.card).locator(SEL.codec)).toBeHidden();
    await stopTake(page);
  });
});

/* ======================================================== the phone take */

async function phoneTake(page: Page, viewport: Size, where: string) {
  const card = page.locator(SEL.card);
  await settle(page);
  const m = await page.evaluate(
    ([sel]) => {
      const r = (s: string) => {
        const el = document.querySelector(s);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
      };
      return {
        photo: r(sel.photo),
        pill: r(sel.pill),
        ring: r(sel.ring),
        sheet: r(sel.card),
        sw: document.documentElement.scrollWidth,
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
    },
    [SEL] as const,
  );
  expect(m.sw, `${where}: no sideways scroll`).toBeLessThanOrEqual(viewport.width);
  const sheetTop = m.sheet!.y;
  expect(m.photo!.y, `${where}: the photo is on screen`).toBeGreaterThanOrEqual(0);
  expect(m.photo!.bottom, `${where}: the whole photo sits above the sheet`).toBeLessThanOrEqual(sheetTop);
  expect(m.pill!.bottom, `${where}: the Listening pill sits above the sheet`).toBeLessThanOrEqual(sheetTop);
  expect(m.photo!.width, `${where}: still a real picture`).toBeGreaterThan(110);
  await expect(page.locator(SEL.pill)).toBeVisible();

  // the sheet: no repeated title or subtitle on screen, still named "Voice"
  await expect(page.getByRole("dialog", { name: "Voice" })).toBeVisible();
  for (const part of ['[data-studio="tool-card-subtitle"]', `${SEL.card} h2`]) {
    const b = await box(page.locator(part));
    expect(b.width * b.height, `${where}: ${part} is out of sight`).toBeLessThanOrEqual(1);
  }
  await expect(page.locator('[data-studio="tool-card-subtitle"]')).toHaveText(
    "Listening… tap again when you are done",
  );
  // Close stays, a 40px key in the card's corner, clear of the words
  const close = card.getByRole("button", { name: "Close Voice" });
  await expect(close).toBeVisible();
  const c = await box(close);
  expect(c.width).toBeGreaterThanOrEqual(40);
  expect(c.right, `${where}: Close on screen`).toBeLessThanOrEqual(m.vw);
  const words = await box(card.locator(SEL.readWords));
  expect(c.bottom, `${where}: Close clear of the words`).toBeLessThanOrEqual(words.y + 0.5);
  // the privacy footnote stays, legible on an opaque sheet
  await expect(card.getByText(FOOTNOTE, { exact: true })).toBeVisible();
  const alpha = await card.evaluate((el) => {
    const n = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [];
    return n.length > 3 ? n[3] : 1;
  });
  expect(alpha, `${where}: an opaque sheet`).toBeGreaterThanOrEqual(0.96);

  // one Stop: the transport steps out and cannot be reached
  await expect(page.getByRole("button", { name: /^Stop/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Stop recording" })).toHaveCount(0);
  const area = page.locator(SEL.transportArea);
  expect(await area.evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  await expect(page.locator(SEL.transport)).toBeHidden();
  expect(m.sheet!.bottom, `${where}: the sheet takes the transport's band`).toBeGreaterThanOrEqual(m.vh - 1);
}

test.describe("M6b · the phone take sheet (s06 phone 2)", () => {
  for (const viewport of [PHONE, PHONE_390]) {
    test(`${viewport.width}×${viewport.height}: mid-take the picture stays whole above the sheet; one Stop; Close and the footnote stay`, async ({ page }) => {
      await openTwinkle(page, viewport);
      const where = `${viewport.width}×${viewport.height}`;

      // before the take: T13a's sheet copy, the transport in place
      await railTool(page, "Voice").click();
      const card = page.locator(SEL.card);
      await expect(card.getByRole("heading", { name: "Voice" })).toBeVisible();
      await expect(card.getByText("Tap the red button and tell this page")).toBeVisible();
      await expect(page.locator(SEL.transport)).toBeVisible();

      await startTake(page);
      await expect(card.locator(SEL.readThis)).toBeVisible();
      await phoneTake(page, viewport, where);
      if (viewport.width === PHONE_390.width) await evidenceShot(page, "M6b-phone-take-390x844.png");

      // keyboard: Tab from Close goes to Stop, never behind the sheet
      await card.getByRole("button", { name: "Close Voice" }).focus();
      await page.keyboard.press("Tab");
      await expect(card.getByRole("button", { name: /^Stop —/ })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator(SEL.recording)).toHaveCount(0, { timeout: 10000 });

      // after the take: the copy and the transport are back
      await expect(card.getByRole("heading", { name: "Voice" })).toBeVisible();
      await expect(card.getByRole("button", { name: "Record it again" })).toBeVisible();
      await expect(page.locator(SEL.transport)).toBeVisible();
      expect(await page.locator(SEL.transportArea).evaluate((el) => (el as HTMLElement).inert)).toBe(false);
      await expect(page.getByRole("button", { name: "Record my voice on this page" })).toBeVisible();
    });
  }

  test("375×812: long words — the picture gives way, whole, above a taller sheet", async ({ page }) => {
    await openTwinkle(page, PHONE);
    await page
      .locator("#studio-page-text")
      .fill(
        `${TWINKLE.pages[2].text} Then we flew past the clouds and the trees, over the river, ` +
          "and all the way home again, and I was not scared any more.",
      );
    await railTool(page, "Voice").click();
    await startTake(page);
    await phoneTake(page, PHONE, "375 long words");
    await stopTake(page);
  });

  test("375×812 reduced motion: the same sheet, nothing animates in", async ({ page }) => {
    await openTwinkle(page, PHONE, 3, true);
    await railTool(page, "Voice").click();
    await startTake(page);
    const anims = await page.locator(SEL.card).evaluate((el) =>
      el.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length,
    );
    expect(anims).toBe(0);
    await phoneTake(page, PHONE, "375 reduced");
    await stopTake(page);
  });

  for (const viewport of [PHONE, PHONE_390]) {
    test(`${viewport.width}×${viewport.height} keyboard: Enter on REC moves focus to the sheet's Stop; Close mid-take hands it to the transport's Stop`, async ({ page }) => {
      await openTwinkle(page, viewport);
      await recKey(page).focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(SEL.recording)).toHaveCount(1);
      const sheetStop = page.locator(SEL.card).getByRole("button", { name: /^Stop —/ });
      await expect(sheetStop, "focus never drops to the page").toBeFocused();
      await page.locator(SEL.card).getByRole("button", { name: "Close Voice" }).click();
      const transportStop = page.getByRole("button", { name: "Stop recording" });
      await expect(transportStop).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator(SEL.recording)).toHaveCount(0, { timeout: 10000 });
    });
  }

  test("the transport recedes only with the sheet open: close the sheet mid-take and its Stop is back", async ({ page }) => {
    await openTwinkle(page, PHONE);
    await startTake(page);
    await page.locator(SEL.card).getByRole("button", { name: "Close Voice" }).click();
    await expect(page.locator(SEL.transport)).toBeVisible();
    const stop = page.getByRole("button", { name: "Stop recording" });
    await expect(stop).toBeVisible();
    await stop.click();
    await expect(page.locator(SEL.recording)).toHaveCount(0, { timeout: 10000 });
  });

  test("1180×820 is unchanged mid-take: the docked card keeps its title and subtitle; the transport stays live", async ({ page }) => {
    await openTwinkle(page, TABLET);
    await startTake(page);
    const card = page.locator(SEL.card);
    await expect(card.getByRole("heading", { name: "Voice" })).toBeVisible();
    await expect(card.getByText("Listening… tap again when you are done")).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
    expect(await page.locator(SEL.transportArea).evaluate((el) => (el as HTMLElement).inert)).toBe(false);
    await stopTake(page);
  });
});
