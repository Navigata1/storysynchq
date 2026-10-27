// Studio polish (M6 review notes, non-blocking): each note pinned here.
//
//   1. delete    · after "Tap again to delete everything" focus lands on the
//                  Photo tool (never <body>) and "Everything deleted." is
//                  written to the live region only once the room is live again
//   2. folds     · at 375 the bar's "More" panel and the strip's "move" fold
//                  close when focus moves on past them or a tap lands
//                  elsewhere; the fold also closes when another page is
//                  selected (a move keeps the same page, and the fold, open)
//   3. motion    · under reduced motion the "More" panel opens without a fade
//   4. inspector · at 1180 and 1290 Advanced, "TIMING MULTIPLIER" keeps 8 px
//                  clear of its slider
//   6. cloud     · the ready card as the cloud library's link (the dev-only
//                  window.__ssyncTestCloud seam): a PNG QR, "Share the link…"
//                  and the unlisted note
//
// (Note 5, fixture names in src comments, is pinned in fixtures-vision.spec.ts.)
// The family content is illustrative and lives in tests/fixtures only.

import { test, expect, type Page } from "@playwright/test";
import { restoreDraft, seedStudioDraft } from "./fixtures/helpers";

const PHONE = { width: 375, height: 812 };
const READY = "Your tape is ready";

/** Restore the Twinkle draft into the Studio at this width. */
async function openStudio(page: Page, viewport?: { width: number; height: number }, narration = false) {
  if (viewport) await page.setViewportSize(viewport);
  await seedStudioDraft(page, "twinkle", { narration });
  await page.goto("/studio");
  await restoreDraft(page);
}

/** Through the gate (no voice, so no consent) to the ready card. */
async function publish(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Finish my story" }).click();
  const question = page.locator('label[for="studio-gate-answer"]');
  await expect(question).toContainText(/\d+\s*×\s*\d+/, { timeout: 15000 });
  const [, a, b] = (await question.innerText()).match(/(\d+)\s*×\s*(\d+)/)!;
  await page.locator("#studio-gate-answer").fill(String(Number(a) * Number(b)));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: READY })).toBeVisible({ timeout: 30000 });
}

/* ------------------------------------------------------------- 1 · delete */

test.describe("polish 1 · delete everything hands focus and words back to the room", () => {
  test.setTimeout(90000);

  test("focus on the Photo tool; 'Everything deleted.' written once the room is live", async ({ page }, testInfo) => {
    await openStudio(page, testInfo.project.name === "mobile" ? PHONE : undefined);
    await publish(page);

    // Every write to the live region, and whether the room was inert then.
    await page.evaluate(() => {
      const region = document.querySelector('[data-studio="announcement"]')!;
      const log: Array<{ text: string; inert: boolean }> = [];
      (window as unknown as { __announcements: typeof log }).__announcements = log;
      new MutationObserver(() => {
        log.push({ text: region.textContent ?? "", inert: Boolean(region.closest("[inert]")) });
      }).observe(region, { childList: true, characterData: true, subtree: true });
    });

    await page.getByRole("button", { name: "Pull the tape out — delete everything", exact: true }).click();
    await page.getByRole("button", { name: /Tap again to delete everything/ }).click();
    await expect(page.getByRole("heading", { name: READY })).toHaveCount(0);

    const photo = page.locator('[data-studio-tool="photo"]');
    await expect(photo, "focus starts over on the Photo tool").toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
    await expect(page.locator('[data-studio="announcement"]')).toHaveText("Everything deleted.");

    const writes = await page.evaluate(
      () => (window as unknown as { __announcements: Array<{ text: string; inert: boolean }> }).__announcements,
    );
    const said = writes.filter((w) => w.text === "Everything deleted.");
    expect(said.length, "the words are written").toBeGreaterThan(0);
    for (const w of said) expect(w.inert, "never written inside an inert room").toBe(false);
  });
});

/* -------------------------------------------------------------- 2 · folds */

test.describe("polish 2 · at 375 the phone's folds close when you move on", () => {
  test.beforeEach(async ({ page }) => {
    await openStudio(page, PHONE);
  });

  test("the bar's More panel: Tab out to Finish, Shift+Tab out to the title, a tap elsewhere", async ({ page }) => {
    const more = page.locator('[data-studio="bar-more"]');
    const panel = page.locator("#studio-bar-more");
    const finish = page.getByRole("button", { name: "Finish my story" });

    // Tab on through the panel and out to Finish.
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();
    await more.focus();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => {
        const a = document.activeElement;
        return Boolean(a && (a.closest('[data-studio="bar-more"]') || a.closest("#studio-bar-more")));
      });
      if (!inside) break;
      await expect(more, "still open while focus is in the panel").toHaveAttribute("aria-expanded", "true");
    }
    await expect(finish).toBeFocused();
    await expect(more, "closed once focus reaches Finish").toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();

    // Shift+Tab back past More, to the title.
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await more.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#studio-title")).toBeFocused();
    await expect(more).toHaveAttribute("aria-expanded", "false");

    // A tap on the Stage.
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await page.locator('[data-studio="stage"]').click({ position: { x: 20, y: 20 } });
    await expect(more).toHaveAttribute("aria-expanded", "false");
  });

  test("the strip's move fold: Tab out, a tap elsewhere, another page selected; a move keeps it open", async ({
    page,
  }) => {
    const toggle = page.locator('[data-studio="film-moves-toggle"]');
    const later = page.getByRole("button", { name: "Move this page later" });
    const del = page.getByRole("button", { name: "Delete this page", exact: true });

    // Tab on through the keys and out of the strip.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(later).toBeVisible();
    await del.focus();
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => document.activeElement?.closest('[data-studio="film-moves"]') ?? null),
      "focus has moved on past the fold",
    ).toBeNull();
    await expect(toggle, "closed once focus leaves the keys").toHaveAttribute("aria-expanded", "false");
    await expect(later).toBeHidden();

    // Shift+Tab back before "move".
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    // A tap on the Stage.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.locator('[data-studio="stage"]').click({ position: { x: 20, y: 20 } });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    // A move keeps the same page selected: the fold stays open for the next nudge.
    await toggle.click();
    await later.click();
    await expect(page.locator('[data-studio="transport"]')).toContainText("pg 2/");
    await expect(toggle, "a move keeps the fold open").toHaveAttribute("aria-expanded", "true");

    // Another page selected (the room's arrow key, no tap, no focus change): it folds.
    await page.evaluate(() =>
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
    );
    await expect(page.locator('[data-studio="transport"]')).toContainText("pg 3/");
    await expect(toggle, "another page selected: folded").toHaveAttribute("aria-expanded", "false");
    await expect(later).toBeHidden();
  });
});

/* ------------------------------------------------------------- 3 · motion */

test("polish 3 · reduced motion: the More panel opens without its fade", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStudio(page, PHONE);
  await page.locator('[data-studio="bar-more"]').click();
  const panel = page.locator("#studio-bar-more");
  await expect(panel).toBeVisible();
  const running = await panel.evaluate(
    (el) => el.getAnimations().filter((a) => a.playState === "running").map((a) => (a as CSSAnimation).animationName),
  );
  expect(running, "no animation runs on the opened panel").toEqual([]);
});

/* ---------------------------------------------------------- 4 · inspector */

test.describe("polish 4 · the docked inspector's slider names keep clear of their tracks", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the docked inspector is a desktop column");
  });

  for (const viewport of [
    { width: 1180, height: 820 },
    { width: 1290, height: 900 },
  ]) {
    test(`${viewport.width}: TIMING MULTIPLIER ends 8+ px before its slider`, async ({ page }) => {
      await openStudio(page, viewport);
      await page.locator('[data-sk="mode"] [role="switch"]').click();
      await expect(page.locator("#insp-multiplier")).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const gaps = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLLabelElement>('[data-studio="insp-slider"] label')).map((label) => {
          // The drawn text, not the grid cell (a nowrap name can overflow its column).
          const range = document.createRange();
          range.selectNodeContents(label);
          const text = range.getBoundingClientRect();
          const slider = document.getElementById(label.htmlFor)!.getBoundingClientRect();
          return { id: label.htmlFor, name: label.textContent, gap: slider.left - text.right };
        }),
      );
      expect(gaps.map((g) => g.id)).toContain("insp-multiplier");
      for (const g of gaps) expect(g.gap, `${g.name}: name right + 8 <= slider left`).toBeGreaterThanOrEqual(8);
    });
  }
});

/* -------------------------------------------------------------- 6 · cloud */

test.describe("polish 6 · the ready card as the cloud library's link", () => {
  test.setTimeout(90000);

  test("a PNG QR, 'Share the link…' and the unlisted note", async ({ page }, testInfo) => {
    // The __ssyncTestCloud seam is compiled out of production builds (CI runs
    // `next start`), so this check runs only against `next dev`.
    test.skip(!!process.env.CI, "the cloud seam exists only in development builds");
    await page.addInitScript(() => {
      (window as Window & { __ssyncTestCloud?: boolean }).__ssyncTestCloud = true;
      Object.defineProperty(navigator, "share", { configurable: true, value: async () => undefined });
    });
    await openStudio(page, testInfo.project.name === "mobile" ? PHONE : undefined);
    await publish(page);

    const card = page.locator('[data-studio="publish-card"]');
    await expect(card.locator('[data-studio="share-url"]')).toBeVisible();
    const qr = card.locator('img[data-studio="share-qr"]');
    await expect(qr).toBeVisible({ timeout: 10000 });
    expect(await qr.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    await expect(card.getByText("point a phone camera here")).toBeVisible();
    await expect(card.getByRole("button", { name: "Share the link…" })).toBeVisible();
    await expect(
      card.getByText(
        "Unlisted and unguessable. Only someone holding this link can open the story — deleting the story revokes it.",
      ),
    ).toBeVisible();
    await expect(card.getByText(/with no cloud library configured/)).toHaveCount(0);
  });
});
