/**
 * T01 — the landing's protocol teaser tells the truth about the house tape
 * (docs/vision/tickets/T01-landing-teaser-truth.md; brief screens[0].realism).
 *
 * The house tape "The Brave Little Star" has no recorded narration — the
 * browser voice reads it — and runs ~1:47 (184 words at 2.5 words/s + 33 s of
 * pauses). The teaser used to print a hand-typed "4:32 · AAC/M4A". Now the
 * label is derived from the demo manifest in /public, so it cannot drift.
 *
 *   · E2E (desktop + mobile): the teaser's TapeLabel reads exactly
 *     `SIDE A · 8 PAGES · ~1:47 · READ-ALONG`, with the title and author the
 *     manifest carries; "4:32" is nowhere on the page; the teaser never claims
 *     AAC/M4A while the protocol rule sentence stays; the manifest is a static
 *     import (no runtime request for it); the Player cover agrees (~1:47).
 *   · Node: the tape-meta module pins runtime arithmetic and the narration
 *     kind for recorded tapes (AAC, WAV, mixed) and `ms` pauses — the landing
 *     can only ever show the house tape, so E2E cannot vary it.
 *
 * Expected strings are hard-coded here (not imported from the source) so the
 * test can fail.
 */

import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  estimateRuntimeSeconds,
  narrationKind,
  tapeMetaLine,
  runtimeLabel,
  estimateSeconds as tapeMetaEstimateSeconds,
  parseDuration as tapeMetaParseDuration,
  formatClock as tapeMetaFormatClock,
} from "../src/lib/storysync/tape-meta";
import { estimateSeconds, formatClock, parseDuration } from "../src/components/player/timing";
import type { SsyncManifest, SsyncPage } from "../src/lib/storysync/manifest";

const HOUSE_LABEL = "SIDE A · 8 PAGES · ~1:47 · READ-ALONG";
const HOUSE_TITLE = "The Brave Little Star";
const HOUSE_AUTHOR = "Island Development Crew";

const DEMO_PATH = path.join(process.cwd(), "public", "demo", "brave-little-star.ssync.json");

function readDemo(): SsyncManifest {
  return JSON.parse(fs.readFileSync(DEMO_PATH, "utf8")) as SsyncManifest;
}

/* ------------------------------------------------------------------ E2E */

test.describe("landing protocol teaser (E2E)", () => {
  test("the teaser label is derived from the demo manifest: ~1:47 · READ-ALONG", async ({ page }) => {
    await page.goto("/");
    const teaser = page.locator(".ls-protocol-tape");
    await teaser.scrollIntoViewIfNeeded();
    const tape = teaser.locator('[data-sk="tape"]');
    await expect(tape).toHaveCount(1);

    await expect(tape).toContainText(HOUSE_LABEL);
    await expect(tape).toContainText(HOUSE_TITLE);
    await expect(tape).toContainText(HOUSE_AUTHOR);

    // Exact, field by field (text content; the label CSS uppercases the meta).
    await expect(tape.locator(".sk-tape-title")).toHaveText(HOUSE_TITLE);
    await expect(tape.locator(".sk-tape-author")).toHaveText(`by ${HOUSE_AUTHOR}`);
    await expect(tape.locator(".sk-tape-meta")).toHaveText(HOUSE_LABEL);
  });

  test("4:32 is nowhere, and the teaser never claims AAC/M4A for the house tape", async ({ page }) => {
    await page.goto("/");
    const teaser = page.locator(".ls-protocol-tape");
    await teaser.scrollIntoViewIfNeeded();
    await expect(teaser.locator('[data-sk="tape"]')).toContainText("READ-ALONG");

    await expect(page.locator("body")).not.toContainText("4:32");
    await expect(teaser).not.toContainText("AAC/M4A");

    // The protocol rule is not a claim about this tape — it stays.
    await expect(page.locator(".ls-section--protocol")).toContainText(
      "Published narration is always AAC/M4A",
    );
  });

  test("the demo manifest is a build-time import: no runtime request for it", async ({ page }) => {
    const manifestRequests: string[] = [];
    page.on("request", (req) => {
      if (/brave-little-star\.ssync\.json/.test(req.url())) manifestRequests.push(req.url());
    });
    await page.goto("/");
    const teaser = page.locator(".ls-protocol-tape");
    await teaser.scrollIntoViewIfNeeded();
    await expect(teaser.locator(".sk-tape-meta")).toHaveText(HOUSE_LABEL);
    await page.waitForLoadState("networkidle");
    expect(manifestRequests, "the landing fetched the demo manifest at runtime").toEqual([]);
  });

  test("the Player cover still prints SIDE A · 8 PAGES · ~1:47 for the demo", async ({ page }) => {
    await page.goto("/read?demo=1");
    const cover = page.locator('[data-pl="cover"] [data-sk="tape"]');
    await expect(cover).toContainText("SIDE A · 8 PAGES · ~1:47");
    await expect(cover).not.toContainText("4:32");
  });
});

/* ----------------------------------------------------------------- Node */

/** A recorded page: `codec` undefined means the manifest declares none. */
function recorded(id: number, words: string, codec: "aac" | "wav" | undefined, url: string, autoPause = "2s"): SsyncPage {
  return {
    id,
    text: { content: words, audioUrl: url, ...(codec ? { audioCodec: codec } : {}) },
    timing: { autoPause },
  };
}

function tape(pages: SsyncPage[]): SsyncManifest {
  return { version: "2.0", metadata: { title: "Fixture" }, pages };
}

test.describe("tape-meta (Node)", () => {
  test("the house tape: 106.6 s → ~1:47, READ-ALONG, exact label", () => {
    const demo = readDemo();
    expect(demo.pages).toHaveLength(8);
    expect(estimateRuntimeSeconds(demo.pages)).toBeCloseTo(106.6, 5);
    expect(narrationKind(demo.pages)).toBe("READ-ALONG");
    expect(runtimeLabel(demo)).toBe("~1:47");
    expect(tapeMetaLine(demo)).toBe(HOUSE_LABEL);
  });

  test("runtime: words ÷ 2.5 + Σ autoPause, 3 s default, ms honoured", () => {
    // 10 words → 4 s, plus 2 s explicit pause.
    expect(estimateRuntimeSeconds([{ text: { content: "one two three four five six seven eight nine ten" }, timing: { autoPause: "2s" } }])).toBeCloseTo(6, 5);
    // No timing → the 3 s default pause; no text → 0 words.
    expect(estimateRuntimeSeconds([{}])).toBeCloseTo(3, 5);
    expect(estimateRuntimeSeconds([{ text: { content: "   " } }])).toBeCloseTo(3, 5);
    // "450ms" adds 0.45 s, not 450 s.
    const withMs = estimateRuntimeSeconds([{ text: { content: "hi there" }, timing: { autoPause: "450ms" } }]);
    expect(withMs).toBeCloseTo(0.8 + 0.45, 5);
    expect(withMs).toBeLessThan(2);
    // The label agrees: 1.25 s → ~0:01.
    expect(tapeMetaLine(tape([{ id: 1, text: { content: "hi there" }, timing: { autoPause: "450ms" } }]))).toBe(
      "SIDE A · 1 PAGE · ~0:01 · READ-ALONG",
    );
  });

  test("a manifest-level pauseBetweenPages is the default pause (as in the Player)", () => {
    const m: SsyncManifest = {
      version: "2.0",
      metadata: { title: "Slow" },
      settings: { accessibility: { pauseBetweenPages: "10s" } },
      pages: [{ id: 1, text: { content: "one two three four five" } }, { id: 2, timing: { autoPause: "1s" } }],
    };
    // 5 words → 2 s, page 1 takes the 10 s default, page 2 its own 1 s.
    expect(tapeMetaLine(m)).toBe("SIDE A · 2 PAGES · ~0:13 · READ-ALONG");
  });

  test("narration kind: AAC/M4A only when every recorded page is aac", () => {
    const both = [
      recorded(1, "a b c d e", "aac", "assets/narration-1.m4a"),
      recorded(2, "f g h i j", "aac", "assets/narration-2.m4a"),
    ];
    expect(narrationKind(both)).toBe("AAC/M4A");
    // 10 words → 4 s + 2 × 2 s = 8 s.
    expect(tapeMetaLine(tape(both))).toBe("SIDE A · 2 PAGES · ~0:08 · AAC/M4A");

    // A read-along page beside recorded aac pages does not change the kind.
    const partly: SsyncPage[] = [...both, { id: 3, text: { content: "The end." } }];
    expect(narrationKind(partly)).toBe("AAC/M4A");
  });

  test("narration kind: any wav page makes the tape WAV (mixed aac + wav included)", () => {
    const oneWav = [
      recorded(1, "a b c d e", "wav", "assets/narration-1.wav"),
      recorded(2, "f g h i j", "wav", "assets/narration-2.wav"),
    ];
    expect(narrationKind(oneWav)).toBe("WAV");
    expect(tapeMetaLine(tape(oneWav))).toBe("SIDE A · 2 PAGES · ~0:08 · WAV");

    const mixed = [
      recorded(1, "a b c d e", "aac", "assets/narration-1.m4a"),
      recorded(2, "f g h i j", "wav", "assets/narration-2.wav"),
    ];
    expect(narrationKind(mixed)).toBe("WAV");
    expect(tapeMetaLine(tape(mixed))).toBe("SIDE A · 2 PAGES · ~0:08 · WAV");
  });

  test("narration kind: an undeclared codec is read off the URL, never assumed", () => {
    expect(narrationKind([recorded(1, "a", undefined, "assets/narration-1.m4a")])).toBe("AAC/M4A");
    expect(narrationKind([recorded(1, "a", undefined, "data:audio/mp4;base64,AAAA")])).toBe("AAC/M4A");
    expect(narrationKind([recorded(1, "a", undefined, "assets/narration-1.wav")])).toBe("WAV");
    expect(narrationKind([recorded(1, "a", undefined, "data:audio/wav;base64,AAAA")])).toBe("WAV");
    // A draft codec or an unknown one is recorded, but never labelled AAC/M4A.
    expect(narrationKind([recorded(1, "a", undefined, "data:audio/webm;codecs=opus;base64,AAAA")])).toBe("RECORDED");
    expect(
      narrationKind([
        recorded(1, "a", "aac", "assets/narration-1.m4a"),
        recorded(2, "b", undefined, "https://example.invalid/voice"),
      ]),
    ).toBe("RECORDED");
  });

  test("the Player's timing helpers are re-exports of tape-meta (one source)", () => {
    expect(estimateSeconds).toBe(tapeMetaEstimateSeconds);
    expect(parseDuration).toBe(tapeMetaParseDuration);
    expect(formatClock).toBe(tapeMetaFormatClock);
    // Player behaviour unchanged: 3 s / 450 ms / fallback, m:ss, the 20 s cover floor.
    expect(parseDuration("3s", 1000)).toBe(3000);
    expect(parseDuration("450ms", 1000)).toBe(450);
    expect(parseDuration(undefined, 1234)).toBe(1234);
    expect(formatClock(106.6)).toBe("1:47");
    expect(formatClock(-4)).toBe("0:00");
    expect(estimateSeconds([{ text: { content: "The end." } }])).toBe(20);
    expect(estimateSeconds(readDemo().pages)).toBeCloseTo(106.6, 5);
  });
});
