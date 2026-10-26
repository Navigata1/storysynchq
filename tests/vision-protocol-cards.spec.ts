/**
 * T23b · /protocol: the codec rule as MUST / MAY / MUST NOT, a validator block
 * in the real `validateManifest` language, "Write your own player", and the
 * download in the hero (s08's right column and hero).
 *
 * Seam 1 (Node): `validationReport(manifest, assetPaths?)` — the pure module
 * that turns the validator's verdict into PASS / WARN / FAIL lines — against
 * the house tape packed for real (pictures read from public/demo/images,
 * packed with the repo's container), Mia's Twinkle fixture, hand-edited
 * copies and a missing asset; and the "Write your own player" snippet,
 * executed against the packed house tape.
 *
 * Seam 2 (E2E): /protocol — the hero lede and download, the three cards
 * (verbatim copy, tag colours, the console, the snippet block), their place
 * beside FIG. 1, the download still packing on this device, nothing fetched
 * or counted, keyboard and reduced-motion paths.
 */

import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { addedLines, validationReport } from "../src/lib/storysync/report";
import { PLAYER_SNIPPET, snippetTokens } from "../src/components/protocol/snippet";
import {
  buildStorysyncFromStory,
  bytesToDataUrl,
  mimeForAssetPath,
  unpackStorysync,
} from "../src/lib/storysync/container";
import { validateManifest, type SsyncManifest } from "../src/lib/storysync/manifest";
import { loadTape } from "./fixtures/tapes";
import { watchSends } from "./fixtures/sends";

const REPO = path.join(__dirname, "..");
const HOUSE_JSON = path.join(REPO, "public", "demo", "brave-little-star.ssync.json");

/** Fresh copy every time: tests below mutate their manifests. */
function houseTape(): SsyncManifest {
  return JSON.parse(fs.readFileSync(HOUSE_JSON, "utf8")) as SsyncManifest;
}

/**
 * The house tape packed for real, as /protocol's download packs it: every
 * picture read from public/demo/images into a JPEG data URL, then
 * `buildStorysyncFromStory`.
 */
function packHouseTapeForReal(): Uint8Array {
  const story = houseTape();
  for (const page of story.pages) {
    const url = page.illustration?.url;
    if (!url) continue;
    const file = path.join(REPO, "public", url.replace(/^\//, ""));
    page.illustration!.url = bytesToDataUrl(new Uint8Array(fs.readFileSync(file)), mimeForAssetPath(file));
  }
  return buildStorysyncFromStory(story);
}

/** T04a's sentence for a timestamp consent date, verbatim. */
const TIMESTAMP_WARNING =
  "signature.voiceConsent[0].date is a full timestamp; the v2.1 draft asks for a date";
/** The validator's own sentence for a .webm narration on page 3, verbatim today. */
const WEBM_ERROR =
  'pages[2].text.audioUrl "assets/narration-3.webm" uses a draft-only codec — published narration must be AAC/M4A (or WAV fallback)';
const ASSETS_PASS = "every assets/ path in the manifest exists";
const HAND_EDITED = "a hand-edited copy: ";

/** The reference's snippet, exactly as s08 prints it. */
const REFERENCE_SNIPPET = [
  "import { unzipSync, strFromU8 } from 'fflate';",
  "const files = unzipSync(tape);",
  "const m = JSON.parse(strFromU8(files['manifest.json']));",
  "for (const page of m.pages) {",
  "  draw(files[page.illustration.url], page.text.content);",
  "}",
].join("\n");

type DrawCall = { picture: unknown; text: unknown };

/**
 * Runs a snippet the way a developer would after `npm i fflate`: the import
 * line is replaced by the real fflate functions, injected, and `tape` and
 * `draw` are what the snippet expects to be given.
 */
function runSnippet(snippet: string, tape: Uint8Array): DrawCall[] {
  const [importLine, ...body] = snippet.split("\n");
  expect(importLine).toBe("import { unzipSync, strFromU8 } from 'fflate';");
  const calls: DrawCall[] = [];
  const draw = (picture: unknown, text: unknown) => calls.push({ picture, text });
  const run = new Function("unzipSync", "strFromU8", "tape", "draw", body.join("\n")) as (
    ...args: unknown[]
  ) => void;
  run(unzipSync, strFromU8, tape, draw);
  return calls;
}

function isJpeg(bytes: unknown): boolean {
  return (
    bytes instanceof Uint8Array && bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  );
}

/* ================================================================ Node seam */

test.describe("T23b · validationReport (Node)", () => {
  test("the house tape packed for real → exactly the two PASS lines", () => {
    const { manifest, assets } = unpackStorysync(packHouseTapeForReal());
    const report = validationReport(manifest, [...assets.keys()]);
    expect(report).toEqual([
      { level: "PASS", text: "version 2.0 · metadata.title · 8 pages" },
      { level: "PASS", text: ASSETS_PASS },
    ]);
  });

  test("Twinkle passes; a timestamp date warns, a .webm fails, a missing picture fails — in the validator's words", () => {
    const { bytes, manifest } = loadTape("twinkle");
    const paths = [...unpackStorysync(bytes).assets.keys()];
    expect(validationReport(manifest, paths)).toEqual([
      { level: "PASS", text: "version 2.0 · metadata.title · 5 pages" },
      { level: "PASS", text: ASSETS_PASS },
    ]);

    // A hand-edited copy: the consent date as a full timestamp.
    const stamped = structuredClone(manifest);
    stamped.signature!.voiceConsent![0].date = "2026-10-19T18:20:00Z";
    const warned = validationReport(stamped, paths);
    expect(warned).toEqual([
      { level: "PASS", text: "version 2.0 · metadata.title · 5 pages" },
      { level: "PASS", text: ASSETS_PASS },
      { level: "WARN", text: TIMESTAMP_WARNING },
    ]);
    expect(warned[2].text).toBe(validateManifest(stamped).warnings[0]);

    // A hand-edited copy: page 3's narration as Opus/WebM.
    const webm = structuredClone(manifest);
    webm.pages[2].text!.audioUrl = "assets/narration-3.webm";
    const failed = validationReport(webm);
    expect(failed).toEqual([
      { level: "PASS", text: "version 2.0 · metadata.title · 5 pages" },
      { level: "FAIL", text: WEBM_ERROR },
    ]);
    expect(failed[1].text).toBe(validateManifest(webm).errors[0]);

    // The container lost a picture the manifest names.
    const missing = paths.filter((p) => p !== "assets/page-2.jpg");
    expect(missing.length).toBe(paths.length - 1);
    expect(validationReport(manifest, missing)).toEqual([
      { level: "PASS", text: "version 2.0 · metadata.title · 5 pages" },
      { level: "FAIL", text: "missing from the container: assets/page-2.jpg" },
    ]);
  });

  test("every warning and error is passed through verbatim, warnings before errors", () => {
    const { manifest } = loadTape("twinkle");
    const both = structuredClone(manifest);
    both.signature!.voiceConsent![0].date = "2026-10-19T18:20:00Z";
    both.pages[2].text!.audioUrl = "assets/narration-3.webm";
    both.pages[3].text!.audioUrl = "assets/narration-4.ogg";
    const verdict = validateManifest(both);
    expect(verdict.errors.length).toBe(2);

    const report = validationReport(both);
    expect(report.filter((l) => l.level === "WARN").map((l) => l.text)).toEqual(verdict.warnings);
    expect(report.filter((l) => l.level === "FAIL").map((l) => l.text)).toEqual(verdict.errors);
    expect(report.map((l) => l.level)).toEqual(["PASS", "WARN", "FAIL", "FAIL"]);
  });

  test("a copy's news: the lines its report adds to the original's, nothing the original already says", () => {
    const { manifest } = loadTape("twinkle");
    // An original that already warns on its own…
    const original = structuredClone(manifest);
    original.signature!.voiceConsent![0].date = "2026-10-19T18:20:00Z";
    const own = validationReport(original);
    expect(own).toEqual([
      { level: "PASS", text: "version 2.0 · metadata.title · 5 pages" },
      { level: "WARN", text: TIMESTAMP_WARNING },
    ]);
    // …and a hand-edited copy of it that also fails: only the FAIL is the copy's.
    const copy = structuredClone(original);
    copy.pages[2].text!.audioUrl = "assets/narration-3.webm";
    expect(validationReport(copy).map((l) => l.level)).toEqual(["PASS", "WARN", "FAIL"]);
    expect(addedLines(own, validationReport(copy))).toEqual([{ level: "FAIL", text: WEBM_ERROR }]);

    // The same words at another level are another line; order is the copy's.
    expect(addedLines([{ level: "WARN", text: "x" }], [{ level: "FAIL", text: "x" }])).toEqual([
      { level: "FAIL", text: "x" },
    ]);
    expect(addedLines([], validationReport(copy))).toEqual(validationReport(copy));
  });

  test("the first PASS line holds only when version, title and pages pass", () => {
    const base = (): SsyncManifest => ({ version: "2.0", metadata: { title: "A Tape" }, pages: [{ id: 1 }] });
    // one page reads as one page
    expect(validationReport(base())).toEqual([
      { level: "PASS", text: "version 2.0 · metadata.title · 1 page" },
    ]);
    // a v1 document passes as v1
    expect(validationReport({ ...base(), version: "1.0" })[0].text).toBe("version 1.0 · metadata.title · 1 page");

    const broken: Array<[string, unknown]> = [
      ["a future version", { ...base(), version: "3.0" }],
      ["no title", { ...base(), metadata: { title: "  " } }],
      ["no pages", { ...base(), pages: [] }],
      ["not a manifest", null],
    ];
    for (const [why, manifest] of broken) {
      const report = validationReport(manifest, []);
      expect(report.filter((l) => l.level === "PASS"), why).toEqual([]);
      expect(report.map((l) => l.text), why).toEqual(validateManifest(manifest).errors);
    }

    // A broken page is the page's own FAIL; the head still passes.
    const badPage = validationReport({ ...base(), pages: [{ id: "one" }] });
    expect(badPage).toEqual([
      { level: "PASS", text: "version 2.0 · metadata.title · 1 page" },
      { level: "FAIL", text: "pages[0].id must be a number" },
    ]);
  });

  test("the asset check names every missing path, in manifest order", () => {
    const tape: SsyncManifest = {
      version: "2.0",
      metadata: { title: "Three", coverImage: "assets/cover.jpg" },
      pages: [
        { id: 1, illustration: { url: "assets/page-1.jpg" }, text: { content: "a", audioUrl: "assets/narration-1.m4a" } },
        { id: 2, illustration: { url: "assets/page-2.jpg" } },
      ],
    };
    expect(validationReport(tape, ["assets/page-1.jpg"])[1]).toEqual({
      level: "FAIL",
      text: "missing from the container: assets/cover.jpg, assets/narration-1.m4a, assets/page-2.jpg",
    });
    // No list given → no asset line at all.
    expect(validationReport(tape).some((l) => l.text.startsWith("missing") || l.text === ASSETS_PASS)).toBe(false);
  });
});

test.describe("T23b · Write your own player (Node)", () => {
  test("the snippet draws every page of the packed house tape, in order, with its picture bytes", () => {
    const tape = packHouseTapeForReal();
    const { manifest } = unpackStorysync(tape);
    expect(manifest.pages.length).toBe(8);

    const calls = runSnippet(PLAYER_SNIPPET, tape);
    expect(calls.length).toBe(8);
    expect(calls.map((c) => c.text)).toEqual(manifest.pages.map((p) => p.text?.content));

    let pictured = 0;
    manifest.pages.forEach((page, i) => {
      if (page.illustration?.url) {
        pictured += 1;
        expect(isJpeg(calls[i].picture), `page ${page.id} gets JPEG bytes`).toBe(true);
      } else {
        expect(calls[i].picture, `page ${page.id} has no picture`).toBeUndefined();
      }
    });
    expect(pictured).toBe(7);
  });

  test("it is the reference's snippet, made safe for the optional layers", () => {
    // The reference's line throws on a page with no picture — the house tape's
    // last page ("The End ⭐") has none, and the spec makes pictures and words
    // optional (only metadata.title is required).
    expect(() => runSnippet(REFERENCE_SNIPPET, packHouseTapeForReal())).toThrow(TypeError);
    expect(PLAYER_SNIPPET).toBe(
      REFERENCE_SNIPPET.replace("page.illustration.url", "page.illustration?.url").replace(
        "page.text.content",
        "page.text?.content",
      ),
    );

    // A valid tape whose page has neither picture nor words still plays.
    const bare: SsyncManifest = { version: "2.0", metadata: { title: "Bare" }, pages: [{ id: 1 }] };
    expect(validateManifest(bare).ok).toBe(true);
    expect(runSnippet(PLAYER_SNIPPET, buildStorysyncFromStory(bare))).toEqual([
      { picture: undefined, text: undefined },
    ]);
  });

  test("the coloured tokens spell the constant exactly", () => {
    const tokens = snippetTokens(PLAYER_SNIPPET);
    expect(tokens.map((t) => t.text).join("")).toBe(PLAYER_SNIPPET);
    const of = (kind: string) => tokens.filter((t) => t.kind === kind).map((t) => t.text);
    expect(of("keyword")).toEqual(["import", "from", "const", "const", "for", "const", "of"]);
    expect(of("string")).toEqual(["'fflate'", "'manifest.json'"]);
    expect(of("call")).toEqual(["unzipSync", "parse", "strFromU8", "draw"]);
  });
});

/* ================================================================= E2E seam */

const LEDE =
  "SSYNC is to storybooks what PDF is to documents: pictures, words, voices, music and timing in one open file. Deliberately not video. The player is plain web — nobody needs our servers, or our app, to hear a story.";
const IDLE = "Nothing is uploaded — the ZIP is built on this device.";

const CODEC_ROWS = [
  { tag: "MUST", text: "Narration is AAC-LC in M4A, mono, 48 kHz, about 96 kbps.", color: "rgb(245, 158, 11)" },
  { tag: "MAY", text: "Fall back to 16-bit WAV, 16 kHz mono. The only fallback.", color: "rgb(205, 211, 226)" },
  { tag: "MUST NOT", text: "Opus, WebM or Ogg. Drafts only, never a published tape.", color: "rgb(227, 69, 47)" },
];

/** What the console prints, computed here from the validator itself. */
function expectedConsole(): Array<{ tag: string; text: string; color: string }> {
  const webm = houseTape();
  webm.version = "2.0";
  webm.pages[2].text!.audioUrl = "assets/narration-3.webm";
  const failure = validateManifest(webm).errors[0];
  expect(failure).toBe(WEBM_ERROR);
  return [
    { tag: "PASS", text: "version 2.0 · metadata.title · 8 pages", color: "rgb(63, 182, 139)" },
    { tag: "PASS", text: ASSETS_PASS, color: "rgb(63, 182, 139)" },
    { tag: "WARN", text: HAND_EDITED + TIMESTAMP_WARNING, color: "rgb(255, 201, 60)" },
    { tag: "FAIL", text: HAND_EDITED + failure, color: "rgb(227, 69, 47)" },
  ];
}

const CARDS = '[data-protocol="cards"]';
const CODEC = '[data-protocol="codec-card"]';
const CONSOLE = '[data-protocol="validator"]';
const PLAYER = '[data-protocol="player-snippet"]';

async function openProtocol(page: Page) {
  await page.goto("/protocol");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

test.describe("T23b · /protocol hero (E2E)", () => {
  test("the lede is the reference's, one paragraph; the download sits in the hero, once", async ({ page }) => {
    await openProtocol(page);
    const hero = page.locator("section.pr-hero");
    const ledes = hero.locator("p.pr-lede");
    await expect(ledes).toHaveCount(1);
    expect(await ledes.evaluate((el) => (el as HTMLElement).innerText.trim())).toBe(LEDE);

    await expect(page.locator('[data-protocol="download-demo"]')).toHaveCount(1);
    await expect(hero.locator('[data-protocol="download-demo"]')).toHaveCount(1);
    await expect(hero.locator('[data-protocol="download-demo"]')).toHaveAccessibleName(
      "Download the demo as .storysync",
    );
    await expect(page.locator('[data-protocol="download-status"]')).toHaveCount(1);
    await expect(page.locator(".pr-take")).toHaveCount(1);
    await expect(hero.locator(".pr-take")).toHaveCount(1);
    await expect(page.locator('[data-protocol="download-status"]')).toHaveText(IDLE);
    // The lucide Download glyph, decorative; the "⬇" character is gone.
    const button = hero.locator('[data-protocol="download-demo"]');
    await expect(button.locator("svg.lucide-download")).toHaveCount(1);
    expect(await button.textContent()).not.toContain("⬇");

    // The bottom "Hold one in your hand" section is gone.
    await expect(page.getByText("Hold one in your hand")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "The demo tape, as a file" })).toHaveCount(0);

    // The facts strip and the spec / schema links are unchanged.
    await expect(hero.locator(".pr-fact")).toHaveCount(4);
    await expect(page.locator('a[href*="docs/format-spec.md"]')).toHaveCount(2);
    await expect(page.locator('a[href="/protocol/v1.schema.json"]')).toHaveCount(1);
    await expect(page.locator('a[href="/protocol/v2.schema.json"]')).toHaveCount(1);
  });

  test("≥ 1024 px the download is the hero's right side, beside the kicker and h1", async ({ page }) => {
    await page.setViewportSize({ width: 1140, height: 712 });
    await openProtocol(page);
    const geo = await page.evaluate(() => {
      const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().toJSON() as DOMRect;
      return {
        button: box('[data-protocol="download-demo"]'),
        status: box('[data-protocol="download-status"]'),
        kicker: box(".pr-hero .pr-eyebrow"),
        h1: box(".pr-hero h1"),
        lede: box(".pr-hero .pr-lede"),
        facts: box(".pr-hero .pr-facts"),
      };
    });
    // s08: the gold button at the top right, its note under it, right-aligned…
    expect(geo.button.left, "right of the h1's column").toBeGreaterThanOrEqual(geo.h1.right);
    expect(Math.abs(geo.button.right - geo.facts.right), "flush with the facts' right edge").toBeLessThanOrEqual(2);
    expect(geo.button.top, "level with the kicker and h1").toBeLessThan(geo.h1.bottom);
    expect(geo.button.top).toBeLessThanOrEqual(geo.kicker.bottom);
    expect(geo.status.top, "the status line under the button").toBeGreaterThanOrEqual(geo.button.bottom);
    expect(Math.abs(geo.status.right - geo.button.right), "status right-aligned").toBeLessThanOrEqual(2);
    // …and the lede runs under both, then the facts.
    expect(geo.lede.top).toBeGreaterThanOrEqual(geo.status.bottom);
    expect(geo.lede.top).toBeGreaterThanOrEqual(geo.h1.bottom);
    expect(geo.facts.top).toBeGreaterThanOrEqual(geo.lede.bottom);
  });

  test("below 1024 px the download follows the lede, before the facts", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openProtocol(page);
    const geo = await page.evaluate(() => {
      const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().toJSON() as DOMRect;
      return {
        button: box('[data-protocol="download-demo"]'),
        status: box('[data-protocol="download-status"]'),
        lede: box(".pr-hero .pr-lede"),
        facts: box(".pr-hero .pr-facts"),
      };
    });
    expect(geo.button.top).toBeGreaterThanOrEqual(geo.lede.bottom);
    expect(Math.abs(geo.button.left - geo.lede.left)).toBeLessThanOrEqual(0.5);
    expect(geo.button.right).toBeLessThanOrEqual(375 - 12);
    expect(geo.button.height, "a 44 px target").toBeGreaterThanOrEqual(44);
    expect(geo.status.bottom).toBeLessThanOrEqual(geo.facts.top);
  });

  test("the download still packs on this device, from the hero, by mouse and by keyboard", async ({ page }) => {
    const requests = watchSends(page, { types: "all" });
    await openProtocol(page);
    const button = page.locator('section.pr-hero [data-protocol="download-demo"]');

    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 25000 }), button.click()]);
    expect(download.suggestedFilename()).toBe("the-brave-little-star.storysync");
    await expect(page.locator('[data-protocol="download-status"]')).toContainText(".storysync");

    await button.focus();
    const [again] = await Promise.all([
      page.waitForEvent("download", { timeout: 25000 }),
      page.keyboard.press("Enter"),
    ]);
    expect(again.suggestedFilename().endsWith(".storysync")).toBe(true);

    // Nothing leaves the device: every request is a same-origin GET.
    const origin = new URL(page.url()).origin;
    for (const r of requests.sent()) {
      expect(r.method, r.url).toBe("GET");
      expect(new URL(r.url).origin, r.url).toBe(origin);
    }
  });
});

test.describe("T23b · /protocol cards (E2E)", () => {
  test("the codec rule card: three rows verbatim, tag colours, and no new heading", async ({ page }) => {
    await openProtocol(page);
    const card = page.locator(CODEC);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();

    const title = card.getByText("The codec rule", { exact: true });
    await expect(title).toBeVisible();
    expect(await title.evaluate((el) => /^H[1-6]$/.test(el.tagName) || el.getAttribute("role") === "heading")).toBe(
      false,
    );
    await expect(page.getByRole("heading", { name: /codec rule/i })).toHaveCount(1);
    await expect(card.locator("svg.lucide-headphones")).toHaveCount(1);

    const rows = await card.locator("dl > div").evaluateAll((els) =>
      els.map((el) => {
        const dt = el.querySelector("dt")!;
        const cs = getComputedStyle(dt);
        return {
          tag: dt.textContent?.trim(),
          // U+00A0 keeps a number with its unit; the copy is the reference's
          text: el.querySelector("dd")!.textContent?.replace(/\u00a0/g, " ").trim(),
          color: cs.color,
          size: cs.fontSize,
          mono: cs.fontFamily.toLowerCase().includes("plex") || cs.fontFamily.toLowerCase().includes("mono"),
          ddSize: getComputedStyle(el.querySelector("dd")!).fontSize,
        };
      }),
    );
    expect(rows.map(({ tag, text, color }) => ({ tag, text, color }))).toEqual(CODEC_ROWS);
    for (const r of rows) {
      expect(r.size).toBe("11px");
      expect(r.mono).toBe(true);
      expect(r.ddSize).toBe("13px");
    }

    // The shipped rule box below keeps its words.
    const rule = page.locator(".pr-rule");
    await expect(rule).toContainText("MUST NOT");
    await expect(rule).toContainText(/aac/i);
  });

  test("the validator: four lines in order, the validator's own words, tag colours", async ({ page }) => {
    await openProtocol(page);
    const card = page.locator(CONSOLE);
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByRole("heading", { level: 3, name: "Validator", exact: true })).toBeVisible();
    await expect(card.locator("svg.lucide-circle-check")).toHaveCount(1);
    await expect(card).toHaveCSS("background-color", "rgb(5, 7, 13)");

    const list = card.locator("ul");
    await expect(list).toHaveCount(1);
    const lines = await list.locator("> li").evaluateAll((els) =>
      els.map((el) => {
        const tag = el.querySelector('[data-log="tag"]')!;
        const text = el.querySelector('[data-log="text"]')!;
        return {
          tag: tag.textContent?.trim(),
          text: text.textContent?.trim(),
          color: getComputedStyle(tag).color,
          size: getComputedStyle(text).fontSize,
          wraps: getComputedStyle(text).whiteSpace,
        };
      }),
    );
    expect(lines.map(({ tag, text, color }) => ({ tag, text, color }))).toEqual(expectedConsole());
    for (const l of lines) {
      expect(l.size).toBe("11.5px");
      expect(l.wraps).toBe("normal");
    }

    // A list, not a scroll region: nothing clipped, nothing to focus.
    const region = await list.evaluate((el) => ({
      overflowY: getComputedStyle(el).overflowY,
      overflowX: getComputedStyle(el).overflowX,
      clipped: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
      tabindex: el.getAttribute("tabindex"),
      role: el.getAttribute("role"),
    }));
    expect(region).toEqual({ overflowY: "visible", overflowX: "visible", clipped: false, tabindex: null, role: null });
  });

  test("Write your own player: the constant, in a focusable named block of its own", async ({ page }) => {
    await openProtocol(page);
    const card = page.locator(PLAYER);
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByRole("heading", { level: 3, name: "Write your own player", exact: true })).toBeVisible();
    // s08's `</>` glyph: lucide CodeXml (lucide Code draws `<>`).
    await expect(card.locator("svg.lucide-code-xml")).toHaveCount(1);

    const block = card.locator("pre.pr-snippet");
    await expect(block).toHaveCount(1);
    await expect(card.locator(".pr-code")).toHaveCount(0);
    await expect(page.locator(".pr-code")).toHaveCount(1);
    await expect(page.locator(".pr-tree")).toHaveCount(1);
    expect(await block.textContent()).toBe(PLAYER_SNIPPET);

    // Token colours come from the tokens.
    const colours = await block.evaluate((pre) => {
      const probe = (v: string) => {
        const p = document.createElement("span");
        p.style.color = `var(${v})`;
        pre.appendChild(p);
        const c = getComputedStyle(p).color;
        p.remove();
        return c;
      };
      const first = (kind: string) => getComputedStyle(pre.querySelector(`[data-token="${kind}"]`)!).color;
      return {
        keyword: [first("keyword"), probe("--ss-violet-2")],
        string: [first("string"), probe("--ss-gold-2")],
        call: [first("call"), probe("--ss-ok")],
      };
    });
    for (const [kind, [got, token]] of Object.entries(colours)) expect(got, kind).toBe(token);
  });

  test("at 375 px the snippet scrolls itself, keyboard-reachably; the console wraps", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openProtocol(page);
    const block = page.locator(`${PLAYER} pre.pr-snippet`);
    await block.scrollIntoViewIfNeeded();
    const own = await block.evaluate((node) => {
      const r = node.getBoundingClientRect();
      return {
        right: r.right,
        overflowX: getComputedStyle(node).overflowX,
        scrollW: node.scrollWidth,
        clientW: node.clientWidth,
        tabIndex: (node as HTMLElement).tabIndex,
        label: node.getAttribute("aria-label") ?? "",
      };
    });
    expect(own.right).toBeLessThanOrEqual(376);
    expect(own.overflowX).toBe("auto");
    expect(own.scrollW, "the long line scrolls inside the block").toBeGreaterThan(own.clientW);
    expect(own.tabIndex).toBe(0);
    expect(own.label).not.toBe("");

    // Keyboard: focus lands on it and the arrow keys scroll it.
    await block.focus();
    await expect(block).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => block.evaluate((n) => n.scrollLeft)).toBeGreaterThan(0);

    // The console's long lines wrap inside the card.
    const fit = await page.locator(CONSOLE).evaluate((card) => {
      const c = card.getBoundingClientRect();
      return Array.from(card.querySelectorAll("li")).every((li) => li.getBoundingClientRect().right <= c.right + 0.5);
    });
    expect(fit).toBe(true);

    const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scroll).toBeLessThanOrEqual(375);
  });

  test("≥ 1088 px the three cards stack in the right column, beside FIG. 1", async ({ page }) => {
    await page.setViewportSize({ width: 1140, height: 712 });
    await openProtocol(page);
    const geo = await page.evaluate(() => {
      const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().toJSON() as DOMRect;
      return {
        fig: box('figure[data-protocol="fig-packet"]'),
        cards: box('[data-protocol="cards"]'),
        codec: box('[data-protocol="codec-card"]'),
        console: box('[data-protocol="validator"]'),
        player: box('[data-protocol="player-snippet"]'),
      };
    });
    expect(geo.cards.left).toBeGreaterThan(geo.fig.right);
    expect(Math.abs(geo.cards.top - geo.fig.top), "level with the figure").toBeLessThanOrEqual(4);
    expect(geo.cards.width).toBeGreaterThanOrEqual(420);
    expect(geo.cards.width).toBeLessThanOrEqual(448);
    for (const card of [geo.codec, geo.console, geo.player]) {
      expect(Math.abs(card.left - geo.cards.left)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(card.width - geo.cards.width)).toBeLessThanOrEqual(0.5);
    }
    expect(geo.console.top).toBeGreaterThan(geo.codec.bottom);
    expect(geo.player.top).toBeGreaterThan(geo.console.bottom);
  });

  test("below 1088 px the cards follow the figure in one column", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await openProtocol(page);
    const geo = await page.evaluate(() => {
      const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().toJSON() as DOMRect;
      return { fig: box('figure[data-protocol="fig-packet"]'), cards: box('[data-protocol="cards"]') };
    });
    expect(geo.cards.top).toBeGreaterThanOrEqual(geo.fig.bottom);
    expect(Math.abs(geo.cards.left - geo.fig.left)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(geo.cards.width - geo.fig.width)).toBeLessThanOrEqual(0.5);
    // Reading order matches: the cards come after the figure in the DOM.
    const after = await page.evaluate(() => {
      const fig = document.querySelector('figure[data-protocol="fig-packet"]')!;
      const cards = document.querySelector('[data-protocol="cards"]')!;
      return Boolean(fig.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(after).toBe(true);
  });

  /**
   * FIG. 1 (T23a's printed plates) needs its full 556 px: squeezed beside the
   * 428 px cards it shrank to 492 px at 1024 and its plates broke mid-word
   * ("browse r", "page-/3.jpg"). So the cards column starts at 68rem (1088 px),
   * where .pr-wrap reaches its max width. Boxes are read in one frame, once two
   * frames agree; `broken` lists every plate word split over two lines.
   */
  async function figureBesideCards(page: Page) {
    let previous = "";
    for (let i = 0; i < 20; i += 1) {
      const geo = await page.evaluate(async () => {
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        const box = (el: Element) => el.getBoundingClientRect().toJSON() as DOMRect;
        const fig = document.querySelector('figure[data-protocol="fig-packet"]')!;
        const plates = fig.querySelector('[data-sk="packet-exploded"]')!;
        const broken: string[] = [];
        const walker = document.createTreeWalker(plates, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          for (const word of node.textContent!.matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(node, word.index!);
            range.setEnd(node, word.index! + word[0].length);
            const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0);
            if (rects.length < 2) continue;
            const tops = rects.map((r) => r.top);
            const lineHeight = Math.min(...rects.map((r) => r.height));
            if (Math.max(...tops) - Math.min(...tops) > lineHeight / 2) broken.push(word[0]);
          }
        }
        return { fig: box(fig), cards: box(document.querySelector('[data-protocol="cards"]')!), broken };
      });
      const key = JSON.stringify(geo);
      if (key === previous) return geo;
      previous = key;
    }
    throw new Error("the /protocol layout did not settle");
  }

  test("at 1024 × 768 (iPad landscape) FIG. 1 keeps its width and the cards follow it", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openProtocol(page);
    const geo = await figureBesideCards(page);
    expect(geo.cards.top, "the cards come after the figure").toBeGreaterThanOrEqual(geo.fig.bottom);
    expect(geo.fig.width, "FIG. 1 is not squeezed").toBeGreaterThan(540);
    expect(geo.broken, "no plate breaks a word").toEqual([]);
  });

  test("at 1088 × 800 (68rem) the cards sit beside FIG. 1, which keeps ≥ 550 px", async ({ page }) => {
    await page.setViewportSize({ width: 1088, height: 800 });
    await openProtocol(page);
    const geo = await figureBesideCards(page);
    expect(geo.cards.left, "side by side").toBeGreaterThan(geo.fig.right);
    expect(Math.abs(geo.cards.top - geo.fig.top), "level with the figure").toBeLessThanOrEqual(4);
    expect(geo.cards.width).toBeGreaterThanOrEqual(420);
    expect(geo.cards.width).toBeLessThanOrEqual(448);
    expect(geo.fig.width, "FIG. 1 keeps its plates' width").toBeGreaterThanOrEqual(550);
    expect(geo.broken, "no plate breaks a word").toEqual([]);
  });

  for (const motion of ["no-preference", "reduce"] as const) {
    test(`nothing fetched, nothing moving on its own (${motion} motion)`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: motion });
      const requests: string[] = [];
      page.on("request", (r) => requests.push(r.url()));
      await openProtocol(page);
      await page.locator(CARDS).scrollIntoViewIfNeeded();

      // The validator runs at render, on the static import: no manifest request.
      expect(requests.filter((u) => u.includes(".ssync.json") || u.includes(".storysync"))).toEqual([]);

      const moving = await page.locator(CARDS).evaluate((root) =>
        [root, ...Array.from(root.querySelectorAll("*"))]
          .filter((el) => {
            const cs = getComputedStyle(el);
            return cs.animationName !== "none" && cs.animationPlayState === "running";
          })
          .map((el) => el.tagName),
      );
      expect(moving).toEqual([]);

      if (motion === "reduce") {
        const button = page.locator('[data-protocol="download-demo"]');
        await button.hover();
        const cs = await button.evaluate((el) => ({
          transition: getComputedStyle(el).transitionDuration,
          transform: getComputedStyle(el).transform,
        }));
        expect(cs.transition.split(",").every((d) => Number.parseFloat(d) === 0)).toBe(true);
        expect(cs.transform).toBe("none");
      }
    });
  }
});
