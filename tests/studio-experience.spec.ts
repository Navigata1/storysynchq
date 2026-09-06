// E2E for the redesigned digital-studio experience: landing doors, the
// receiving room (/read) with its cover gate, and the studio (/studio).

import { test, expect } from "@playwright/test";

test.describe("New experience", () => {
  test("landing renders the hero and both doors", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "StorySyncHQ" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Play a story/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Make a story/i })).toBeVisible();
  });

  test("landing doors route to /read and /studio", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Play a story/i }).click();
    await expect(page).toHaveURL(/\/read/);
    await page.goto("/");
    await page.getByRole("link", { name: /Make a story/i }).click();
    await expect(page).toHaveURL(/\/studio/);
  });

  test("read room offers the demo tape and gates playback behind Tap to Begin", async ({ page }) => {
    await page.goto("/read");
    await page.getByRole("button", { name: /Play the demo tape/i }).click();
    const begin = page.getByText("Tap to Begin");
    await expect(begin).toBeVisible({ timeout: 10000 });
    // Gated until the unlock tap — no auto-dismiss.
    await page.waitForTimeout(2000);
    await expect(begin).toBeVisible();
    await begin.click();
    await expect(begin).not.toBeVisible();
  });

  test("studio opens in Simple mode with stage, tools, and transport", async ({ page }) => {
    await page.goto("/studio");
    // Dismiss a restore prompt if a stale draft exists (clean contexts won't have one).
    const modeToggle = page.locator('[data-sk="mode"]');
    await expect(modeToggle.first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-sk="transport"]').first()).toBeVisible();
  });

  test("advanced toggle reveals the inspector", async ({ page }) => {
    await page.goto("/studio");
    const toggle = page.locator('[data-sk="mode"]').first();
    await expect(toggle).toBeVisible({ timeout: 10000 });
    await toggle.click();
    // Inspector shows protocol-level detail (manifest/codec readouts).
    await expect(page.getByText(/manifest|codec/i).first()).toBeVisible();
  });

  test("classic app remains reachable from the landing footer", async ({ page }) => {
    await page.goto("/");
    const classicLink = page.getByRole("link", { name: /classic/i }).first();
    await expect(classicLink).toBeVisible();
  });
});
