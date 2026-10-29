// Dedicated config for regenerating the vision fixtures — never part of the
// main suite (its default testMatch does not pick up generate-fixtures.ts).
//
//   npx playwright test --config tests/fixtures/generate.config.ts

import { defineConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Use the pre-installed Chromium when present, as playwright.config.ts does.
const preinstalledChromium = "/opt/pw-browsers/chromium";
const launchOptions = fs.existsSync(preinstalledChromium)
  ? { executablePath: preinstalledChromium }
  : undefined;

export default defineConfig({
  testDir: __dirname,
  testMatch: "generate-fixtures.ts",
  outputDir: path.join(__dirname, "..", "..", "test-results", "fixtures-generate"),
  timeout: 120000,
  workers: 1,
  fullyParallel: false,
  reporter: "line",
  use: {
    viewport: { width: 600, height: 600 },
    deviceScaleFactor: 1,
    launchOptions,
  },
});
