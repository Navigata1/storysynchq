import { defineConfig } from '@playwright/test';
import fs from 'fs';

// Remote CI/agent environments pre-install Chromium outside Playwright's
// registry; use it when present so tests run without `playwright install`.
const preinstalledChromium = '/opt/pw-browsers/chromium';
const launchOptions = fs.existsSync(preinstalledChromium)
  ? { executablePath: preinstalledChromium }
  : undefined;

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  // CI: a stray test.only fails the run, and one retry absorbs runner jitter in
  // the timing-sensitive audio suites (a test that needs it is reported as flaky).
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
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
  ],
});
