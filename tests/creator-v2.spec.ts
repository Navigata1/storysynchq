// E2E for the v2 creator flow: narration recording UI, parental gate before
// save (COPPA), one-tap full deletion, and the reader's Tap-to-Begin gate.

import { test, expect, Page } from "@playwright/test";

async function startStory(page: Page, title: string) {
  await page.goto("/classic");
  await page.getByRole("button", { name: /Create Your Story/i }).click();
  await page.getByPlaceholder("The Brave Little Star").fill(title);
  await page.getByRole("button", { name: /Next Step/i }).click();
}

test.describe("Creator v2", () => {
  test("step 2 offers per-page narration recording", async ({ page }) => {
    await startStory(page, "Narration Test");
    await expect(page.getByRole("button", { name: /Record narration for this page/i })).toBeVisible();
  });

  test("saving is blocked by the parental gate until the challenge is solved", async ({ page }) => {
    await startStory(page, "Gate Test");
    await page.locator("textarea").first().fill("Once upon a time.");
    await page.getByRole("button", { name: /Next Step/i }).click();

    await page.getByRole("button", { name: /Save to Library/i }).click();

    // Gate appears — nothing saved yet.
    await expect(page.getByText("Grown-ups only")).toBeVisible();
    await expect(page.getByText(/Story saved/i)).not.toBeVisible();

    // A wrong answer keeps the gate up.
    const challenge = await page.getByText(/\d+ × \d+ = \?/).textContent();
    const [, a, b] = challenge!.match(/(\d+) × (\d+)/)!;
    await page.locator('input[type="number"]').fill(String(Number(a) * Number(b) + 1));
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Grown-ups only")).toBeVisible();

    // The right answer passes and the save goes through.
    await page.locator('input[type="number"]').fill(String(Number(a) * Number(b)));
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/Story saved/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("delete removes the story, recordings, and draft in one tap", async ({ page }) => {
    await startStory(page, "Delete Me");
    await page.locator("textarea").first().fill("Short lived.");
    await page.getByRole("button", { name: /Next Step/i }).click();

    await page.getByRole("button", { name: /Delete this story/i }).click();
    await expect(page.getByText("Delete everything?")).toBeVisible();
    await page.getByRole("button", { name: "Delete all" }).click();

    await expect(page.getByText(/all recordings deleted/i)).toBeVisible();
    // Back at step 1, fully reset.
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
    await expect(page.getByPlaceholder("The Brave Little Star")).toHaveValue("");
    const draft = await page.evaluate(() => localStorage.getItem("ssync-autosave-draft"));
    expect(draft).toBeNull();
  });

  test("landing offers opening a .storysync file", async ({ page }) => {
    await page.goto("/classic");
    await expect(page.getByRole("button", { name: /Open \.storysync file/i })).toBeVisible();
  });

  test("reader splash gates playback behind Tap to Begin", async ({ page }) => {
    await page.goto("/classic");
    await page.getByRole("button", { name: /Read Demo Storybook/i }).click();
    const begin = page.getByText("Tap to Begin");
    await expect(begin).toBeVisible();
    // Still gated after a wait — no auto-dismiss without the unlock gesture.
    await page.waitForTimeout(2600);
    await expect(begin).toBeVisible();
    await begin.click();
    await expect(begin).not.toBeVisible();
  });
});
