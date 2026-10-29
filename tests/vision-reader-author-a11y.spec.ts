/**
 * T11 · the Reader honours a storyteller's accessibility defaults
 * (`settings.accessibility`), and the viewer's own choices still win (E2E).
 *
 * Reference: s02 figure C "ONE PAGE, THREE WAYS" — Default · Easier to read ·
 * High contrast, "saved on this device only"; s08 plate 06 Behavior — the
 * author-default renderings, "viewer preferences still win" (HANDOFF §4).
 *
 * Asserted on `.pl-root` classes (`is-hc`, `is-dys`), the Reading options
 * sheet's switches, and the `ssync-reader-prefs` entry in localStorage — the
 * only place a viewer's choice lives (this device only, nothing sent).
 */

import { expect, test, type Page } from "@playwright/test";
import {
  AUTHOR_BOTH_CODE,
  AUTHOR_EASIER_READ_CODE,
  AUTHOR_HIGH_CONTRAST_CODE,
  AUTHOR_SLOW_PAUSE_CODE,
  seedReaderTapes,
  t11Rows,
} from "./fixtures/reader-tapes";

const PREFS_KEY = "ssync-reader-prefs";
const STORYTELLER = "Set by the storyteller";
const FOOTER = "Saved on this device only";

/** Open a tape at its cover. */
async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.locator(".pl-root")).toHaveAttribute("data-view", "cover", { timeout: 20000 });
}

/** Pass the cover gate (the iOS unlock). */
async function begin(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Tap to Begin/i }).click();
  await expect(page.locator(".pl-root")).toHaveAttribute("data-view", "page");
}

/** The raw `ssync-reader-prefs` value; null when nothing was written. */
async function stored(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), PREFS_KEY);
}

async function openSheet(page: Page) {
  await page.getByRole("button", { name: "Reading options" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Reading options" });
  await expect(sheet).toBeVisible();
  return sheet;
}

function contrastSwitch(page: Page) {
  return page.getByRole("dialog", { name: "Reading options" }).getByRole("switch", { name: /High contrast/ });
}

function easierSwitch(page: Page) {
  return page.getByRole("dialog", { name: "Reading options" }).getByRole("switch", { name: /Easier-to-read text/ });
}

const HC = /(^|\s)is-hc(\s|$)/;
const DYS = /(^|\s)is-dys(\s|$)/;

test.describe("T11 · a storyteller's high contrast, and the viewer's choice", () => {
  test("opens in high contrast with nothing stored; turning it off is the viewer's choice, everywhere", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await seedReaderTapes(page, t11Rows());
    await open(page, `/read?story=${AUTHOR_HIGH_CONTRAST_CODE}`);
    const root = page.locator(".pl-root");

    // The tape asks for high contrast and this viewer has chosen nothing.
    await expect(root).toHaveClass(HC);
    await expect(root).not.toHaveClass(DYS);
    await begin(page);
    await expect(root).toHaveClass(HC);
    // s02 figure C "High contrast": pure white, semibold, on pure black.
    const hcText = await page
      .locator('[data-pl="prose"]')
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return { color: cs.color, weight: cs.fontWeight, ground: getComputedStyle(el.closest(".pl-root")!).backgroundColor };
      });
    expect(hcText).toEqual({ color: "rgb(255, 255, 255)", weight: "600", ground: "rgb(0, 0, 0)" });
    expect(await stored(page), "opening the Reader must write nothing").toBeNull();

    // Reading options: the switch reflects the tape, and says so.
    const sheet = await openSheet(page);
    await expect(contrastSwitch(page)).toHaveAttribute("aria-checked", "true");
    await expect(contrastSwitch(page)).toContainText(STORYTELLER);
    await expect(easierSwitch(page)).toHaveAttribute("aria-checked", "false");
    await expect(easierSwitch(page)).not.toContainText(STORYTELLER);
    await expect(sheet.getByText(FOOTER, { exact: true })).toBeVisible();
    expect(await stored(page), "opening the sheet must write nothing").toBeNull();

    // Off: now it is the viewer's explicit choice, and the only thing stored.
    await contrastSwitch(page).click();
    await expect(contrastSwitch(page)).toHaveAttribute("aria-checked", "false");
    await expect(contrastSwitch(page)).not.toContainText(STORYTELLER);
    await expect(root).not.toHaveClass(HC);
    expect(JSON.parse((await stored(page)) ?? "null")).toEqual({ v: 2, contrast: false });

    // A reload of the same tape keeps the viewer's choice.
    await page.reload();
    await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
    await expect(root).not.toHaveClass(HC);
    await begin(page);
    await expect(root).not.toHaveClass(HC);
    await openSheet(page);
    await expect(contrastSwitch(page)).toHaveAttribute("aria-checked", "false");
    await expect(contrastSwitch(page)).not.toContainText(STORYTELLER);

    // A different tape that asks for high contrast (and the easier font):
    // the viewer's contrast choice wins; the font still comes from the tape.
    await open(page, `/read?story=${AUTHOR_BOTH_CODE}`);
    await expect(root).toHaveClass(DYS);
    await expect(root).not.toHaveClass(HC);
    await begin(page);
    await expect(root).not.toHaveClass(HC);
    await openSheet(page);
    await expect(contrastSwitch(page)).toHaveAttribute("aria-checked", "false");
    await expect(contrastSwitch(page)).not.toContainText(STORYTELLER);
    await expect(easierSwitch(page)).toHaveAttribute("aria-checked", "true");
    await expect(easierSwitch(page)).toContainText(STORYTELLER);
    expect(JSON.parse((await stored(page)) ?? "null")).toEqual({ v: 2, contrast: false });
  });

  test("the keyboard reaches the switch, and Space makes the choice (reduced motion)", async ({ page }) => {
    test.setTimeout(60000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seedReaderTapes(page, t11Rows());
    await open(page, `/read?story=${AUTHOR_HIGH_CONTRAST_CODE}`);
    const root = page.locator(".pl-root");
    await begin(page);
    await expect(root).toHaveClass(HC);

    const chip = page.getByRole("button", { name: "Reading options" }).first();
    await chip.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Reading options" })).toBeVisible();

    // Tab forward until the High contrast switch has focus.
    for (let i = 0; i < 30; i++) {
      const name = await page.evaluate(() => document.activeElement?.textContent ?? "");
      if (/High contrast/.test(name)) break;
      await page.keyboard.press("Tab");
    }
    await expect(contrastSwitch(page)).toBeFocused();
    await page.keyboard.press("Space");
    await expect(contrastSwitch(page)).toHaveAttribute("aria-checked", "false");
    await expect(root).not.toHaveClass(HC);
    // Space belonged to the switch, not to the page turn.
    await expect(root).toHaveAttribute("data-page", "1");
    expect(JSON.parse((await stored(page)) ?? "null")).toEqual({ v: 2, contrast: false });

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Reading options" })).toHaveCount(0);
  });
});

test.describe("T11 · a storyteller's easier-to-read font", () => {
  test("opens with the easier font (not Fraunces), and says where it came from", async ({ page }) => {
    test.setTimeout(60000);
    await seedReaderTapes(page, t11Rows());
    await open(page, `/read?story=${AUTHOR_EASIER_READ_CODE}`);
    const root = page.locator(".pl-root");
    await expect(root).toHaveClass(DYS);
    await expect(root).not.toHaveClass(HC);
    await begin(page);
    await expect(root).toHaveClass(DYS);

    const prose = page.locator('[data-pl="prose"]').first();
    await expect(prose).toBeVisible();
    const family = await prose.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family.toLowerCase()).not.toContain("fraunces");
    expect(family.toLowerCase()).toContain("geist");
    expect(await stored(page)).toBeNull();

    await openSheet(page);
    await expect(easierSwitch(page)).toHaveAttribute("aria-checked", "true");
    await expect(easierSwitch(page)).toContainText(STORYTELLER);
    await expect(contrastSwitch(page)).toHaveAttribute("aria-checked", "false");
    await expect(contrastSwitch(page)).not.toContainText(STORYTELLER);
    expect(await stored(page)).toBeNull();
  });
});

test.describe("T11 · a tape without settings.accessibility behaves exactly as before", () => {
  test("the house tape: neither skin, no hint, the footer, nothing stored", async ({ page }) => {
    test.setTimeout(60000);
    await open(page, "/read?demo=1");
    const root = page.locator(".pl-root");
    await expect(root).not.toHaveClass(HC);
    await expect(root).not.toHaveClass(DYS);
    await expect(page.locator(".pl-cover")).toContainText("~1:47");
    await begin(page);
    await expect(root).not.toHaveClass(HC);
    await expect(root).not.toHaveClass(DYS);
    const family = await page.locator('[data-pl="prose"]').first().evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family.toLowerCase()).toContain("fraunces");

    const sheet = await openSheet(page);
    await expect(contrastSwitch(page)).toHaveAttribute("aria-checked", "false");
    await expect(easierSwitch(page)).toHaveAttribute("aria-checked", "false");
    await expect(sheet.getByText(STORYTELLER)).toHaveCount(0);
    await expect(sheet.getByText(FOOTER, { exact: true })).toBeVisible();
    expect(await stored(page)).toBeNull();

    // A viewer's own choice on a plain tape is stored sparse, nothing else.
    await sheet.getByRole("radio", { name: "Large", exact: true }).click();
    expect(JSON.parse((await stored(page)) ?? "null")).toEqual({ v: 2, fontScale: 1.25 });
  });
});

test.describe("T11 · what readers before T11 stored", () => {
  test("a legacy object is a choice only where it differs from the defaults, and is not rewritten", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await seedReaderTapes(page, t11Rows());
    const legacyOff = JSON.stringify({ speed: "normal", timing: 1, fontScale: 1, dyslexia: false, contrast: false });
    await page.addInitScript(
      ({ key, value }) => {
        if (!window.sessionStorage.getItem("t11-legacy")) {
          window.localStorage.setItem(key, value);
          window.sessionStorage.setItem("t11-legacy", "1");
        }
      },
      { key: PREFS_KEY, value: legacyOff },
    );

    // Every pre-T11 reader wrote this on mount: `contrast: false` was never a choice.
    await open(page, `/read?story=${AUTHOR_HIGH_CONTRAST_CODE}`);
    const root = page.locator(".pl-root");
    await begin(page);
    await expect(root).toHaveClass(HC);
    await openSheet(page);
    await expect(contrastSwitch(page)).toContainText(STORYTELLER);
    expect(await stored(page), "the legacy entry is left as it was").toBe(legacyOff);

    // A stored legacy `contrast: true` stays the viewer's choice on a plain tape.
    await page.evaluate(
      ({ key }) =>
        window.localStorage.setItem(
          key,
          JSON.stringify({ speed: "normal", timing: 1, fontScale: 1, dyslexia: false, contrast: true }),
        ),
      { key: PREFS_KEY },
    );
    await open(page, "/read?demo=1");
    await expect(root).toHaveClass(HC);
    await begin(page);
    await openSheet(page);
    await expect(contrastSwitch(page)).toHaveAttribute("aria-checked", "true");
    await expect(contrastSwitch(page)).not.toContainText(STORYTELLER);
  });
});

test.describe("T11 · every pause still respects timingMultiplier", () => {
  test("timingMultiplier 3 holds a 1 s autoPause for about 3 s", async ({ page }) => {
    test.setTimeout(60000);
    await seedReaderTapes(page, t11Rows());
    await open(page, `/read?story=${AUTHOR_SLOW_PAUSE_CODE}`);
    // Arm the stopwatch before the voice can start (it waits 700 ms after the tap).
    await page.evaluate(() => {
      const w = window as unknown as { __t11Hold?: Promise<number> };
      w.__t11Hold = new Promise<number>((done) => {
        const el = document.querySelector("audio");
        const root = document.querySelector(".pl-root");
        if (!el || !root) return done(-1);
        el.addEventListener(
          "ended",
          () => {
            const t0 = performance.now();
            const watch = new MutationObserver(() => {
              if (root.getAttribute("data-page") === "2") {
                watch.disconnect();
                done(performance.now() - t0);
              }
            });
            watch.observe(root, { attributes: true, attributeFilter: ["data-page"] });
          },
          { once: true },
        );
      });
    });
    await begin(page);
    const held = await page.evaluate(() => (window as unknown as { __t11Hold: Promise<number> }).__t11Hold);
    console.log(`[T11] hold after the voice with timingMultiplier 3 × autoPause 1s: ${Math.round(held)} ms`);
    // 1 s × 3 = 3 s (+ the 240 ms turn-out); without the multiplier it would be ~1 s.
    expect(held).toBeGreaterThan(2600);
    expect(held).toBeLessThan(5000);
  });
});
