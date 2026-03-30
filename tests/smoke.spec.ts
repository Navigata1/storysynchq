import { test, expect } from '@playwright/test';

test.describe('Phase 1: Reader Polish', () => {
  test('landing page loads with hero and CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'StorySyncHQ' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Read Demo Storybook/i })).toBeVisible();
    await expect(page.getByText('The Immersive Storybook Protocol')).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/landing-hero.png', fullPage: false });
  });

  test('landing page sections render', async ({ page }) => {
    await page.goto('/');
    // Scroll to protocol section
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(500);
    await expect(page.getByRole('heading', { name: 'Remember the magic?' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Narrate' })).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/landing-features.png', fullPage: false });
  });

  test('demo storybook opens and renders first page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Read Demo Storybook/i }).click();
    await page.waitForTimeout(1500);
    // Reader should be open — check for story title
    await expect(page.getByText('The Brave Little Star')).toBeVisible();
    // Check first page illustration loaded
    const img = page.locator('img[alt]').first();
    await expect(img).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/reader-page1.png' });
  });

  test('reader navigation works', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Read Demo Storybook/i }).click();
    await page.waitForTimeout(1500);
    // Navigate to page 2
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(700);
    await expect(page.getByText('2 / 8')).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/reader-page2.png' });
    // Navigate back
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(700);
    await expect(page.getByText('1 / 8')).toBeVisible();
  });

  test('voice mode toggle and record button visible', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Read Demo Storybook/i }).click();
    await page.waitForTimeout(1500);
    // Click to show controls
    await page.click('body');
    await page.waitForTimeout(300);
    // Voice mode button should be visible
    await expect(page.getByRole('button', { name: /AI Voice/i })).toBeVisible();
    // Mic button should be visible
    await expect(page.getByRole('button', { name: '🎤' })).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/reader-controls.png' });
  });

  test('recording panel opens', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Read Demo Storybook/i }).click();
    await page.waitForTimeout(1500);
    await page.click('body');
    await page.waitForTimeout(300);
    // Open record panel
    await page.getByRole('button', { name: '🎤' }).click();
    await page.waitForTimeout(300);
    await expect(page.getByText(/Record Page/i)).toBeVisible();
    await expect(page.getByText(/Start Recording/i)).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/reader-record-panel.png' });
  });

  test('exit reader returns to landing', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Read Demo Storybook/i }).click();
    await page.waitForTimeout(1500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    await expect(page.getByRole('heading', { name: 'StorySyncHQ' })).toBeVisible();
  });

  test('progress bar advances with pages', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Read Demo Storybook/i }).click();
    await page.waitForTimeout(1500);
    // Navigate through several pages
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(800);
    }
    // Show controls to see page counter
    await page.click('body');
    await page.waitForTimeout(300);
    await expect(page.getByText('5 / 8')).toBeVisible({ timeout: 3000 });
    await page.screenshot({ path: 'tests/screenshots/reader-page5.png' });
  });
});
