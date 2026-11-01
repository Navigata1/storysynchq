import { defineConfig } from '@playwright/test';
import fs from 'fs';

// Remote CI/agent environments pre-install Chromium outside Playwright's
// registry; use it when present so tests run without `playwright install`.
const preinstalledChromium = '/opt/pw-browsers/chromium';
// The headless shell (CI) hints glyphs fully and rounds each advance to a whole
// pixel: 11px Plex Mono set 7px a glyph instead of 6.6, so tight layouts that
// fit in a real browser overflowed on the runner. Unhinted keeps fractional
// advances, as desktop and phone browsers set them.
const launchOptions = {
  args: ['--font-render-hinting=none'],
  ...(fs.existsSync(preinstalledChromium) ? { executablePath: preinstalledChromium } : {}),
};

// archipelago-2 mission judges that need access the default run lacks (S1b K45): the cloud
// spec runs only when the operator authorises production (A2_CLOUD_E2E=1, cloud_e2e.sh), the
// AAC spec only under aac_publish.sh (A2_AAC=1), which first proves an AAC encoder exists.
// Elsewhere they are not collected, so the full suite carries no unregistered skip.
const testIgnore = [
  ...(process.env.A2_CLOUD_E2E === '1' ? [] : ['**/a2-cloud.spec.ts']),
  ...(process.env.A2_AAC === '1' ? [] : ['**/a2-aac.spec.ts']),
];

export default defineConfig({
  testDir: './tests',
  testIgnore,
  timeout: 30000,
  // CI: a stray test.only fails the run, and one retry absorbs runner jitter in
  // the timing-sensitive audio suites (a test that needs it is reported as flaky).
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // CI also emits the `github` reporter so each failing test surfaces as a
  // check-run annotation (file:line + message) without opening the job log.
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'on',
    viewport: { width: 1280, height: 720 },
    launchOptions,
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
    timeout: 30000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 }, launchOptions } },
    { name: 'mobile', use: { viewport: { width: 375, height: 812 }, launchOptions } },
    // Safari's engine, for the C8 gate only (webkit_player.sh sets A2_WEBKIT=1); never in the
    // default run or CI, which have no WebKit installed (S1b K45).
    ...(process.env.A2_WEBKIT === '1'
      ? [{ name: 'webkit', use: { browserName: 'webkit' as const, viewport: { width: 1280, height: 720 } } }]
      : []),
  ],
});
