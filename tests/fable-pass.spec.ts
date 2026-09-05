// Regression gates from the Fable 5.1 final pass — pins the defects the blind
// critics surfaced as non-blocking so they can never come back.

import { test, expect } from "@playwright/test";

async function beginDemo(page: import("@playwright/test").Page) {
  await page.goto("/read?demo=1");
  const begin = page.getByRole("button", { name: /Tap to Begin/i });
  await begin.waitFor({ timeout: 15000 });
  await begin.click();
  await expect(page.locator("[data-page]").first()).toBeVisible({ timeout: 10000 });
}

test.describe("Fable pass · player", () => {
  test("mashing next never freezes — 8 rapid presses reach the end card", async ({ page }) => {
    await beginDemo(page);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(40); // well inside the 240ms turn animation
    }
    await expect(page.getByRole("button", { name: /Make your own/i })).toBeVisible({ timeout: 8000 });
  });

  test("arrow keys keep working while a top-chrome chip holds focus", async ({ page }) => {
    await beginDemo(page);
    const music = page.getByRole("button", { name: /music/i }).first();
    await music.focus();
    await expect(music).toBeFocused();
    const before = await page.locator("[data-page]").first().getAttribute("data-page");
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => page.locator("[data-page]").first().getAttribute("data-page"), { timeout: 5000 })
      .not.toBe(before);
  });
});

test.describe("Fable pass · studio", () => {
  test("a blank story never leaves an autosave envelope behind", async ({ page }) => {
    await page.goto("/studio");
    await expect(page.locator('[data-sk="mode"]').first()).toBeVisible({ timeout: 10000 });
    // Autosave debounces at ~900ms; wait past it, then the key must be absent.
    await page.waitForTimeout(2200);
    const draft = await page.evaluate(() => localStorage.getItem("ssync-studio-draft"));
    expect(draft).toBeNull();
  });
});
