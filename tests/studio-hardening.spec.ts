// Studio hardening (REPORT §6 "Known bugs and limits"): each fix pinned at
// the seam a person meets it.
//
//   1. label     · a save that failed never prints "ON THIS DEVICE" (T16)
//   2. link      · the share step's own sentence reaches the card (T02)
//   3. 320       · the Studio never scrolls sideways at 320px (T13a/T05b)
//   4. bar       · the top bar is one row from 640 to 767px (T15/T13a)
//   6. bed       · a filmstrip page pick with the Music card open keeps the bed (T24a)
//   8. repeat    · the same feeling applied twice is announced twice (T24b)
//   9. midnight  · the consent record's date is the stamp's date (T14)
//  10. replace   · the replace dialog promises no draft download (T15)
//
// The family content is illustrative and lives in tests/fixtures only.

import { test, expect, type Page } from "@playwright/test";
import { restoreDraft, seedStudioDraft } from "./fixtures/helpers";

const READY = "Your tape is ready";
const LIBRARY_KEY = "ssync-library";

type StudioHookWindow = Window & {
  __ssyncStudio?: { musicPlaying(): boolean; moodName(): string | null };
};

async function openStudio(page: Page, opts: Parameters<typeof seedStudioDraft>[2] = {}): Promise<void> {
  await seedStudioDraft(page, "twinkle", opts);
  await page.goto("/studio");
  await restoreDraft(page);
}

async function openGate(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Finish my story" }).click();
  const question = page.locator('label[for="studio-gate-answer"]');
  await expect(question).toContainText(/\d+\s*×\s*\d+/, { timeout: 15000 });
  const [, a, b] = (await question.innerText()).match(/(\d+)\s*×\s*(\d+)/)!;
  await page.locator("#studio-gate-answer").fill(String(Number(a) * Number(b)));
}

/**
 * Library writes fail from the `failFrom`-th one on (1-based), as a browser
 * that will not store them does. Set before the page loads; counting starts
 * when the test says so (`window.__libraryWrites = 0`).
 */
async function failLibraryWrites(page: Page, failFrom: number, quota: boolean): Promise<void> {
  await page.addInitScript(
    ({ key, from, asQuota }) => {
      const w = window as unknown as { __libraryWrites?: number };
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
        if (k === key && typeof w.__libraryWrites === "number") {
          w.__libraryWrites += 1;
          if (w.__libraryWrites >= from) {
            throw asQuota
              ? new DOMException("The quota has been exceeded.", "QuotaExceededError")
              : new Error("blocked by the test");
          }
        }
        return original.call(this, k, v);
      };
    },
    { key: LIBRARY_KEY, from: failFrom, asQuota: quota },
  );
}

/* --------------------------------------------------------------- 1 · label */

test.describe("hardening 1 · the printed label claims only the save that happened", () => {
  test.setTimeout(90000);

  test("a failed save prints NOT SAVED, never ON THIS DEVICE", async ({ page }) => {
    await failLibraryWrites(page, 1, true);
    await openStudio(page, { narration: false });
    await page.evaluate(() => ((window as unknown as { __libraryWrites: number }).__libraryWrites = 0));
    await openGate(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: READY })).toBeVisible({ timeout: 30000 });

    const meta = page.locator(".pc-meta-2");
    await expect(meta).toContainText("NOT SAVED");
    await expect(meta).not.toContainText("ON THIS DEVICE");
    await expect(page.getByText("Saved on this device", { exact: false })).toHaveCount(0);
  });

  test("a save on this device without a link still prints ON THIS DEVICE", async ({ page }) => {
    await failLibraryWrites(page, 2, false);
    await openStudio(page, { narration: false });
    await page.evaluate(() => ((window as unknown as { __libraryWrites: number }).__libraryWrites = 0));
    await openGate(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: READY })).toBeVisible({ timeout: 30000 });
    await expect(page.locator(".pc-meta-2")).toContainText("ON THIS DEVICE");
    await expect(page.locator(".pc-meta-2")).not.toContainText("NOT SAVED");
  });
});

/* ---------------------------------------------------------------- 2 · link */

test.describe("hardening 2 · the share step's own sentence reaches the card", () => {
  test.setTimeout(90000);

  test("saved, no link: the card says why, in shareBook's words", async ({ page }) => {
    // Write 1 is the save; write 2 is the share code, which the browser refuses.
    await failLibraryWrites(page, 2, false);
    await openStudio(page, { narration: false });
    await page.evaluate(() => ((window as unknown as { __libraryWrites: number }).__libraryWrites = 0));
    await openGate(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: READY })).toBeVisible({ timeout: 30000 });

    const card = page.locator('[data-studio="publish-card"]');
    await expect(card).toContainText(
      "Saved on this device, but no link was made. Making the link: this browser would not save it.",
    );
    await expect(card).not.toContainText("There is no cloud library configured");
  });

  test("no sentence to show: the general no-link copy stays", async ({ page }) => {
    await openStudio(page, { narration: false });
    // A link made normally on this device: the general copy is not shown at all,
    // and nothing says a link failed.
    await openGate(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: READY })).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-studio="publish-card"]')).not.toContainText("no link was made");
  });
});

/* ----------------------------------------------------------------- 3 · 320 */

test.describe("hardening 3 · 320px: no sideways scroll", () => {
  test.setTimeout(60000);
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "a phone width");
  });

  test("the page is no wider than the screen, the transport's keys inside it", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openStudio(page);
    const widths = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      view: window.innerWidth,
    }));
    expect(widths.doc, "the document does not scroll sideways").toBeLessThanOrEqual(widths.view);
    expect(widths.body).toBeLessThanOrEqual(widths.view);
    const right = await page
      .locator('[data-studio="transport"] button')
      .evaluateAll((els) => Math.max(...els.map((el) => el.getBoundingClientRect().right)));
    expect(right, "every transport key is on screen").toBeLessThanOrEqual(320);
  });
});

/* ----------------------------------------------------------------- 4 · bar */

test.describe("hardening 4 · the top bar is one row from 640 to 767px", () => {
  test.setTimeout(90000);
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "a width sweep, once");
  });

  test("Exit, Open a tape, the title, Simple and Finish share one row", async ({ page }) => {
    await page.setViewportSize({ width: 767, height: 900 });
    await openStudio(page);
    for (const width of [640, 660, 680, 700, 720, 740, 767]) {
      await page.setViewportSize({ width, height: 900 });
      const rows = await page.evaluate(() => {
        const bar = document.querySelector("header.studio-topbar")!;
        const pick = (el: Element | null) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return r.width > 0 ? Math.round(r.top + r.height / 2) : null;
        };
        return {
          exit: pick(bar.querySelector('a[aria-label="Leave the studio"]')),
          open: pick(bar.querySelector('[data-studio="open-tape"]')),
          title: pick(bar.querySelector('[data-studio="title"]')),
          mode: pick(bar.querySelector('[data-sk="mode"]')),
          finish: pick(bar.querySelector('button[aria-label="Finish my story"]')),
          height: Math.round(bar.getBoundingClientRect().height),
          scroll: document.documentElement.scrollWidth,
        };
      });
      const centres = [rows.exit, rows.open, rows.title, rows.mode, rows.finish];
      for (const c of centres) expect(c, `${width}px: every key is drawn`).not.toBeNull();
      const spread = Math.max(...(centres as number[])) - Math.min(...(centres as number[]));
      expect(spread, `${width}px: one row (centres ${centres.join(", ")})`).toBeLessThanOrEqual(4);
      expect(rows.height, `${width}px: the bar is one row tall`).toBeLessThan(80);
      expect(rows.scroll, `${width}px: no sideways scroll`).toBeLessThanOrEqual(width);
    }
  });
});

/* ----------------------------------------------------------------- 6 · bed */

test.describe("hardening 6 · picking a page with the Music card open keeps the bed", () => {
  test.setTimeout(60000);
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the strip beside the card");
  });

  test("the bed plays on, into the picked page's mood", async ({ page }) => {
    await openStudio(page);
    const hook = () =>
      page.evaluate(() => {
        const h = (window as StudioHookWindow).__ssyncStudio;
        return h ? { playing: h.musicPlaying(), mood: h.moodName() } : null;
      });
    await page.locator('[data-studio-tool="music"]').click();
    await expect.poll(hook).toEqual({ playing: true, mood: "Wonder" });

    const frames = page.locator("[data-page-index]");
    await frames.nth(2).click();
    await expect(frames.nth(2)).toHaveAttribute("aria-current", "true");
    await page.waitForTimeout(300);
    await expect.poll(hook).toEqual({ playing: true, mood: "Wonder" });

    // The transport's page keys keep it too.
    await page.getByRole("button", { name: /next page/i }).click();
    await expect(frames.nth(3)).toHaveAttribute("aria-current", "true");
    await page.waitForTimeout(300);
    await expect.poll(hook).toEqual({ playing: true, mood: "Wonder" });

    // Closing the card still stops it.
    await page.locator('[data-studio-tool="music"]').click();
    await expect.poll(hook).toMatchObject({ playing: false });
  });
});

/* -------------------------------------------------------------- 8 · repeat */

test.describe("hardening 8 · the same feeling twice is announced twice", () => {
  test.setTimeout(60000);
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the docked Inspector");
  });

  test("the live region empties, then says it again", async ({ page }) => {
    await openStudio(page);
    const mode = page.locator('[data-sk="mode"] [role="switch"]');
    await mode.click();
    await expect(mode).toHaveAttribute("aria-checked", "true");
    await page.locator("[data-page-index]").nth(2).click();

    await page.evaluate(() => {
      const region = document.querySelector('[data-studio="announcement"]')!;
      const log: string[] = [];
      (window as unknown as { __said: string[] }).__said = log;
      new MutationObserver(() => log.push(region.textContent ?? "")).observe(region, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });

    await page.locator("#insp-feeling").fill("hush");
    const forPage = page.locator('[data-studio="feeling-page"]');
    await expect(forPage).toBeEnabled();
    await forPage.click();
    await expect(page.locator('[data-studio="announcement"]')).toHaveText("Page 3 is Hush now.");
    await forPage.click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __said: string[] }).__said.filter((t) => t === "Page 3 is Hush now.").length),
      )
      .toBe(2);
    const said = await page.evaluate(() => (window as unknown as { __said: string[] }).__said);
    const second = said.lastIndexOf("Page 3 is Hush now.");
    expect(said.slice(0, second), "emptied between the two").toContain("");
    await expect(page.locator('[data-studio="announcement"]')).toHaveText("Page 3 is Hush now.");

    // "Use for every page" twice, the same.
    const forEvery = page.locator('[data-studio="feeling-every"]');
    await forEvery.click();
    await expect(page.locator('[data-studio="announcement"]')).toHaveText("Every page is Hush now.");
    await forEvery.click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __said: string[] }).__said.filter((t) => t === "Every page is Hush now.").length),
      )
      .toBe(2);
  });
});

/* ------------------------------------------------------------ 9 · midnight */

test.describe("hardening 9 · the consent record's date is the stamp's date", () => {
  test.setTimeout(90000);

  test("a gate left open across local midnight writes the day it stamped", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-19T23:59:50"));
    await openStudio(page, { narration: true });
    await openGate(page);
    await page.locator("#studio-gate-author").fill("Mia");
    await page.locator("#studio-gate-consent").check();
    const stamp = page.locator('[data-sk="consent-stamp"]');
    await expect(stamp).toHaveAttribute("data-inked", "true");
    await expect(stamp.locator("[data-line]").nth(1)).toContainText("OCT 19 2026");

    // Midnight passes while the grown-up reads the sheet.
    await page.clock.setFixedTime(new Date("2026-10-20T00:00:10"));
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: READY })).toBeVisible({ timeout: 30000 });

    const consent = await page.evaluate((key) => {
      const rows = JSON.parse(window.localStorage.getItem(key) || "[]") as Array<{
        ssyncData: { signature?: { voiceConsent?: Array<{ date: string }> } };
      }>;
      return rows[0]?.ssyncData.signature?.voiceConsent ?? [];
    }, LIBRARY_KEY);
    expect(consent.length).toBeGreaterThan(0);
    for (const record of consent) expect(record.date, "the stamp's day").toBe("2026-10-19");
  });
});

/* ------------------------------------------------------------- 10 · replace */

test.describe("hardening 10 · the replace dialog promises nothing that is not there", () => {
  test.setTimeout(60000);

  test("no 'download it first': there is no draft download", async ({ page }) => {
    // Opening the house tape over a saved draft asks first.
    await seedStudioDraft(page, "twinkle");
    await page.goto("/studio?open=house");
    const dialog = page.locator('[data-studio="open-tape-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await expect(dialog).not.toContainText("download");
    await expect(dialog).toContainText("finish it first if you want to keep it");
  });
});
