// ARCHIPELAGO P2 — Playwright evidence defaults (dogfood-readiness v2 lanes C/D)
// Drop into a project as playwright.config.ts (or merge).
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  retries: 1,
  use: {
    trace: 'on-first-retry',          // Lane D: replayable proof
    video: 'retain-on-failure',       // Lane D
    screenshot: 'only-on-failure',    // journeys take explicit full-page shots (Lane C)
  },
  expect: {
    // Lane C: baseline updates are a decision, not an accident.
    // Update ONLY via: npx playwright test --update-snapshots  (log it in the evidence bundle)
    toHaveScreenshot: { maxDiffPixelRatio: 0.001 },
  },
  reporter: [['list'], ['json', { outputFile: 'ops/mission/evidence/runtime/pw-report.json' }]],
});
