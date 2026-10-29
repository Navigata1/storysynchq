/**
 * T11 · reader preferences (Node-side, no browser).
 *
 * `src/components/player/prefs.ts` decides how a page reads for this viewer,
 * field by field: the viewer's explicit choice → else the tape's author default
 * (`settings.accessibility`) → else the product default. Only explicit choices
 * are ever stored, on this device, under `ssync-reader-prefs`.
 *
 * Reference: s02 figure C "ONE PAGE, THREE WAYS" (Default · Easier to read ·
 * High contrast · "saved on this device only") and s08 plate 06 Behavior
 * (author-default renderings; "viewer preferences still win", HANDOFF §4).
 * Pure module, relative imports only.
 */

import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_PREFS,
  PREFS_KEY,
  PREFS_VERSION,
  SPEED_PAUSE,
  authorDefaults,
  pauseMultiplier,
  resolve,
  sanitize,
  toStored,
  type ReaderPrefs,
  type ViewerChoices,
} from "../src/components/player/prefs";
import type { SsyncManifest } from "../src/lib/storysync/manifest";
import {
  authorEasierReadTape,
  authorHighContrastTape,
  authorBothTape,
  authorSlowPauseTape,
} from "./fixtures/reader-tapes";

const HOUSE_TAPE = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "public", "demo", "brave-little-star.ssync.json"), "utf8"),
) as SsyncManifest;

/** The product defaults as they shipped before T11 (Player.tsx `DEFAULT_PREFS`). */
const SHIPPED_DEFAULTS: ReaderPrefs = { speed: "normal", timing: 1, fontScale: 1, dyslexia: false, contrast: false };

test.describe("T11 · reader prefs: the constants did not move", () => {
  test("same key, same product defaults, a version marker for the sparse shape", () => {
    expect(PREFS_KEY).toBe("ssync-reader-prefs");
    expect(DEFAULT_PREFS).toEqual(SHIPPED_DEFAULTS);
    expect(PREFS_VERSION).toBe(2);
  });
});

test.describe("T11 · author defaults come from settings.accessibility", () => {
  test("highContrast → contrast, dyslexiaFont → easier-to-read", () => {
    expect(authorDefaults({ highContrast: true })).toEqual({ contrast: true });
    expect(authorDefaults({ dyslexiaFont: true })).toEqual({ dyslexia: true });
    expect(authorDefaults({ highContrast: true, dyslexiaFont: true, timingMultiplier: 2 })).toEqual({
      contrast: true,
      dyslexia: true,
    });
  });

  test("absent, false or non-boolean asks for nothing (false is the schema default)", () => {
    expect(authorDefaults(undefined)).toEqual({});
    expect(authorDefaults(null)).toEqual({});
    expect(authorDefaults("high")).toEqual({});
    expect(authorDefaults({})).toEqual({});
    expect(authorDefaults({ highContrast: false, dyslexiaFont: false })).toEqual({});
    expect(authorDefaults({ highContrast: "true", dyslexiaFont: 1 })).toEqual({});
  });

  test("the fixtures and the house tape say what they mean", () => {
    expect(authorDefaults(authorHighContrastTape.settings?.accessibility)).toEqual({ contrast: true });
    expect(authorDefaults(authorEasierReadTape.settings?.accessibility)).toEqual({ dyslexia: true });
    expect(authorDefaults(authorBothTape.settings?.accessibility)).toEqual({ contrast: true, dyslexia: true });
    expect(authorDefaults(HOUSE_TAPE.settings?.accessibility)).toEqual({});
  });
});

test.describe("T11 · resolution: viewer → author → product default, field by field", () => {
  const table: Array<{
    name: string;
    author: ReturnType<typeof authorDefaults>;
    viewer: ViewerChoices;
    contrast: boolean;
    dyslexia: boolean;
    from: { contrast: string; dyslexia: string };
  }> = [
    { name: "no author, no viewer", author: {}, viewer: {}, contrast: false, dyslexia: false, from: { contrast: "default", dyslexia: "default" } },
    { name: "author contrast", author: { contrast: true }, viewer: {}, contrast: true, dyslexia: false, from: { contrast: "author", dyslexia: "default" } },
    { name: "author contrast on + viewer off", author: { contrast: true }, viewer: { contrast: false }, contrast: false, dyslexia: false, from: { contrast: "viewer", dyslexia: "default" } },
    { name: "viewer contrast on, no author", author: {}, viewer: { contrast: true }, contrast: true, dyslexia: false, from: { contrast: "viewer", dyslexia: "default" } },
    { name: "author dyslexia", author: { dyslexia: true }, viewer: {}, contrast: false, dyslexia: true, from: { contrast: "default", dyslexia: "author" } },
    { name: "author dyslexia on + viewer off", author: { dyslexia: true }, viewer: { dyslexia: false }, contrast: false, dyslexia: false, from: { contrast: "default", dyslexia: "viewer" } },
    { name: "viewer dyslexia on, no author", author: {}, viewer: { dyslexia: true }, contrast: false, dyslexia: true, from: { contrast: "default", dyslexia: "viewer" } },
    { name: "both from the author, viewer turns one off", author: { contrast: true, dyslexia: true }, viewer: { contrast: false }, contrast: false, dyslexia: true, from: { contrast: "viewer", dyslexia: "author" } },
  ];

  for (const row of table) {
    test(row.name, () => {
      const { prefs, source } = resolve(row.author, row.viewer);
      expect(prefs.contrast).toBe(row.contrast);
      expect(prefs.dyslexia).toBe(row.dyslexia);
      expect(source.contrast).toBe(row.from.contrast);
      expect(source.dyslexia).toBe(row.from.dyslexia);
    });
  }

  test("speed, pause and text size are viewer-or-default only", () => {
    const none = resolve({ contrast: true }, {});
    expect(none.prefs).toEqual({ ...SHIPPED_DEFAULTS, contrast: true });
    expect(none.source).toEqual({ speed: "default", timing: "default", fontScale: "default", dyslexia: "default", contrast: "author" });

    const chosen = resolve({}, { speed: "slow", timing: 1.5, fontScale: 1.25 });
    expect(chosen.prefs).toEqual({ ...SHIPPED_DEFAULTS, speed: "slow", timing: 1.5, fontScale: 1.25 });
    expect(chosen.source.speed).toBe("viewer");
    expect(chosen.source.timing).toBe("viewer");
    expect(chosen.source.fontScale).toBe("viewer");
  });

  test("resolve never mutates its inputs", () => {
    const author = Object.freeze({ contrast: true });
    const viewer = Object.freeze({ dyslexia: true });
    expect(() => resolve(author, viewer)).not.toThrow();
    expect(DEFAULT_PREFS).toEqual(SHIPPED_DEFAULTS);
  });
});

test.describe("T11 · stored viewer choices: sparse, versioned, legacy-aware", () => {
  test("a legacy full object is explicit only where it differs from the product defaults", () => {
    expect(sanitize({ speed: "normal", timing: 1, fontScale: 1, dyslexia: false, contrast: true })).toEqual({
      contrast: true,
    });
    // What every reader before T11 wrote on mount: nothing in it was a choice.
    expect(sanitize({ speed: "normal", timing: 1, fontScale: 1, dyslexia: false, contrast: false })).toEqual({});
    expect(sanitize({ speed: "slow", timing: 2, fontScale: 1.5, dyslexia: true, contrast: false })).toEqual({
      speed: "slow",
      timing: 2,
      fontScale: 1.5,
      dyslexia: true,
    });
  });

  test("the stored JSON string reads the same as the parsed object", () => {
    const legacy = JSON.stringify({ speed: "normal", timing: 1, fontScale: 1, dyslexia: false, contrast: true });
    expect(sanitize(legacy)).toEqual({ contrast: true });
    expect(sanitize(JSON.stringify({ v: 2, contrast: false }))).toEqual({ contrast: false });
  });

  test("the sparse shape keeps every valid field, default-equal values included", () => {
    expect(sanitize({ v: 2, contrast: false })).toEqual({ contrast: false });
    expect(sanitize({ v: 2, speed: "normal", dyslexia: true })).toEqual({ speed: "normal", dyslexia: true });
    expect(sanitize({ v: 2 })).toEqual({});
  });

  test("garbage is no choices", () => {
    for (const raw of [null, undefined, "", "{", "null", "42", 42, true, [], ["contrast"], "[]", { v: "two", contrast: true }]) {
      expect(sanitize(raw), JSON.stringify(raw)).toEqual({});
    }
    expect(sanitize({ v: 2, speed: "warp", timing: "slow", fontScale: Number.NaN, dyslexia: "yes", contrast: 1 })).toEqual({});
  });

  test("out-of-range numbers clamp as they always did", () => {
    expect(sanitize({ v: 2, timing: 9, fontScale: 0.1 })).toEqual({ timing: 3, fontScale: 0.8 });
    expect(sanitize({ v: 2, timing: 0.1, fontScale: 9 })).toEqual({ timing: 0.5, fontScale: 2 });
  });

  test("toStored writes the version marker and only what was touched", () => {
    expect(toStored({})).toEqual({ v: 2 });
    expect(toStored({ contrast: false })).toEqual({ v: 2, contrast: false });
    const stored = toStored({ contrast: false, speed: undefined } as ViewerChoices);
    expect(Object.keys(stored).sort()).toEqual(["contrast", "v"]);
  });

  test("toStored round-trips through sanitize (object and JSON)", () => {
    const cases: ViewerChoices[] = [
      {},
      { contrast: false },
      { dyslexia: true },
      { speed: "fast", timing: 0.5, fontScale: 1.25 },
      { speed: "normal", timing: 1, fontScale: 1, dyslexia: false, contrast: false },
    ];
    for (const choices of cases) {
      expect(sanitize(toStored(choices))).toEqual(choices);
      expect(sanitize(JSON.stringify(toStored(choices)))).toEqual(choices);
    }
  });
});

test.describe("T11 · every pause still respects timingMultiplier", () => {
  test("house tape: 1.0 × the viewer's pause × the speed's pause (shipped arithmetic)", () => {
    const house = HOUSE_TAPE.settings?.accessibility?.timingMultiplier;
    expect(house).toBe(1);
    expect(pauseMultiplier(house, DEFAULT_PREFS)).toBe(1);
    expect(pauseMultiplier(house, { ...DEFAULT_PREFS, timing: 1.5 })).toBe(1.5);
    expect(pauseMultiplier(house, { ...DEFAULT_PREFS, speed: "slow" })).toBe(SPEED_PAUSE.slow);
  });

  test("the author's multiplier scales, the viewer's choice multiplies on top", () => {
    expect(pauseMultiplier(2, DEFAULT_PREFS)).toBe(2);
    expect(pauseMultiplier(2, { ...DEFAULT_PREFS, timing: 1.5, speed: "slow" })).toBeCloseTo(2 * 1.5 * 1.5, 10);
    expect(pauseMultiplier(authorSlowPauseTape.settings?.accessibility?.timingMultiplier, DEFAULT_PREFS)).toBe(3);
  });

  test("a missing or broken multiplier is 1", () => {
    for (const raw of [undefined, null, "2", Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      expect(pauseMultiplier(raw, DEFAULT_PREFS), String(raw)).toBe(1);
    }
  });
});
