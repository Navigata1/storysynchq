/**
 * WP-P — "The Player becomes the room" (docs/10x-plan.md §3, gaps G3/G4/G6).
 *
 * Every bar item is checked against the running app, not against the source:
 * pixels are sampled out of real screenshots by decoding the PNG on a canvas
 * inside the page, contrast is computed from those pixels, and the audio claims
 * are read off the live DualBusAudioEngine through the read-only
 * `window.__ssyncPlayer` view. Screenshots the critic can open are written to
 * tests/screenshots/wp-player-*.png.
 */

import { expect, test, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { splitWords, wordIndexAtTime } from "../src/components/player/timing";
import { CUE_LENGTH_S } from "../src/components/player/sound";

/* ─────────────────────────────────────────────────────────────── helpers */

const SHOTS = path.join(process.cwd(), "tests", "screenshots");

/** The base room colour. A sample equal to this means "nothing reached here". */
const BASE_NAVY = { r: 0x0a, g: 0x0e, b: 0x1a };

interface Sample {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
}

function distance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function channel(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: number, b: number): number {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/** Screenshot the viewport, save it for the critic, and decode it in-page. */
async function shootAndSample(
  page: Page,
  name: string,
  points: Array<{ x: number; y: number }>,
): Promise<Sample[]> {
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, `${name}.png`);
  const buffer = await page.screenshot({ path: file });
  const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
  return page.evaluate(
    async ({ dataUrl, points }) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(img, 0, 0);
      return points.map((p) => {
        const x = Math.max(0, Math.min(canvas.width - 1, Math.round(p.x)));
        const y = Math.max(0, Math.min(canvas.height - 1, Math.round(p.y)));
        const d = ctx.getImageData(x, y, 1, 1).data;
        return { x: p.x, y: p.y, r: d[0], g: d[1], b: d[2] };
      });
    },
    { dataUrl, points },
  );
}

/** Every pixel of a rectangle out of a saved screenshot, as luminances. */
async function shootAndScanRect(
  page: Page,
  name: string,
  rect: { x: number; y: number; width: number; height: number },
): Promise<number[]> {
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, `${name}.png`);
  const buffer = await page.screenshot({ path: file });
  const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
  const pixels = await page.evaluate(
    async ({ dataUrl, rect }) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(img, 0, 0);
      const x = Math.max(0, Math.round(rect.x));
      const y = Math.max(0, Math.round(rect.y));
      const w = Math.max(1, Math.min(canvas.width - x, Math.round(rect.width)));
      const h = Math.max(1, Math.min(canvas.height - y, Math.round(rect.height)));
      const data = ctx.getImageData(x, y, w, h).data;
      const out: number[] = [];
      for (let i = 0; i < data.length; i += 4) out.push(data[i], data[i + 1], data[i + 2]);
      return out;
    },
    { dataUrl, rect },
  );
  const lums: number[] = [];
  for (let i = 0; i < pixels.length; i += 3) {
    lums.push(luminance(pixels[i], pixels[i + 1], pixels[i + 2]));
  }
  return lums;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const at = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * p)));
  return sorted[at];
}

/** A real WAV of known length — the stand-in for a child's recorded voice. */
function silentWavDataUrl(seconds = 6, rate = 8000): string {
  const samples = seconds * rate;
  const dataBytes = samples * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);
  return `data:audio/wav;base64,${buf.toString("base64")}`;
}

const VOICE_WORDS = "One two three four five six seven eight nine ten eleven twelve";

/** Stories seeded into this device's library, reachable at /read?story=<id>. */
function seededLibrary() {
  const wav = silentWavDataUrl(6);
  const page1 = (extra: Record<string, unknown> = {}) => ({
    id: 1,
    layout: "illustration-top",
    illustration: { url: "/demo/images/page1.jpg", alt: "A small star" },
    text: { content: VOICE_WORDS, audioUrl: wav, audioCodec: "wav" },
    ...extra,
  });
  const plain = (id: number, content: string) => ({
    id,
    layout: "illustration-top",
    illustration: { url: "/demo/images/page2.jpg", alt: "The sky" },
    text: { content },
  });

  const voice = {
    version: "2.0",
    metadata: { title: "A Tape With A Voice", author: "WP-P Fixture", narrator: "Mum" },
    // No `music` on any page — the room must stay SILENT.
    settings: { autoPlay: false, pageTurnSound: true, readAlongHighlight: true },
    pages: [page1(), plain(2, "The second page."), plain(3, "The third page.")],
  };

  const quiet = {
    ...voice,
    metadata: { title: "A Tape With No Chime", author: "WP-P Fixture" },
    settings: { autoPlay: false, pageTurnSound: false, readAlongHighlight: true },
  };

  return [
    {
      id: "wp-player-voice",
      shareCode: "wp-player-voice",
      title: voice.metadata.title,
      author: voice.metadata.author,
      genre: "children",
      ageRange: "3-8",
      pageCount: 3,
      description: "",
      thumbnail: null,
      createdAt: new Date().toISOString(),
      isPublic: true,
      ssyncData: voice,
    },
    {
      id: "wp-player-quiet",
      shareCode: "wp-player-quiet",
      title: quiet.metadata.title,
      author: quiet.metadata.author,
      genre: "children",
      ageRange: "3-8",
      pageCount: 3,
      description: "",
      thumbnail: null,
      createdAt: new Date().toISOString(),
      isPublic: true,
      ssyncData: quiet,
    },
  ];
}

async function seedLibrary(page: Page): Promise<void> {
  const rows = seededLibrary();
  await page.addInitScript((data) => {
    try {
      window.localStorage.setItem("ssync-library", JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }, rows);
}

/** Open a tape and pass the cover gate (the iOS unlock). */
async function begin(page: Page, url: string): Promise<void> {
  await page.goto(url);
  const root = page.locator(".pl-root");
  await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
  await page.getByRole("button", { name: /Tap to Begin/i }).click();
  await expect(root).toHaveAttribute("data-view", "page");
}

/** Wait for the ambient backdrop picture to actually be painted. */
async function backdropReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const img = document.querySelector<HTMLImageElement>('[data-pl="backdrop"]');
    return !!img && img.complete && img.naturalWidth > 0;
  }, null, { timeout: 20000 });
  await page.waitForTimeout(1100); // the 900 ms crossfade settles
}

/** ArrowRight until the end card appears (never waits on an audio event). */
async function arrowToEnd(page: Page, maxPresses = 20): Promise<number> {
  const root = page.locator(".pl-root");
  for (let i = 0; i < maxPresses; i++) {
    if ((await root.getAttribute("data-view")) === "end") return i;
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(320);
  }
  return maxPresses;
}

/* ─────────────────────────────────────────── (1) the read-along arithmetic */

test.describe("WP-P · read-along word timing", () => {
  test("recorded narration lights words on a linear sweep of the clip", async () => {
    const words = splitWords(VOICE_WORDS);
    expect(words).toHaveLength(12);

    // Nothing lit before the voice starts, or while the duration is unknown.
    expect(wordIndexAtTime(0, 6, 12)).toBe(-1);
    expect(wordIndexAtTime(1, NaN, 12)).toBe(-1);
    expect(wordIndexAtTime(1, Infinity, 12)).toBe(-1);
    expect(wordIndexAtTime(1, 0, 12)).toBe(-1);
    expect(wordIndexAtTime(1, 6, 0)).toBe(-1);

    // Word k lights at k * duration / count, and never leaves the range.
    for (let k = 0; k < 12; k++) {
      const t = (k * 6) / 12 + 0.01;
      expect(wordIndexAtTime(t, 6, 12)).toBe(k);
    }
    expect(wordIndexAtTime(5.99, 6, 12)).toBe(11);
    expect(wordIndexAtTime(99, 6, 12)).toBe(11);
  });
});

/* ─────────────────────────────────────────────── (2) the room, in pixels */

test.describe("WP-P · the player is a room, not a rectangle", () => {
  test("1440x900: the backdrop reaches both edges (no dead black)", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await begin(page, "/read?demo=1");
    await backdropReady(page);

    const filter = await page
      .locator('[data-pl="backdrop"]')
      .evaluate((el) => getComputedStyle(el).filter);
    expect(filter).toContain("blur(");

    const points = [
      { x: 40, y: 450 },
      { x: 1400, y: 450 },
      { x: 40, y: 120 },
      { x: 1400, y: 120 },
      { x: 720, y: 60 },
    ];
    const samples = await shootAndSample(page, "wp-player-desktop-page1", points);
    console.log("[wp-p] 1440x900 page 1 samples:", JSON.stringify(samples));

    for (const s of samples) {
      const isBlack = s.r === 0 && s.g === 0 && s.b === 0;
      expect(isBlack, `pure black at ${s.x},${s.y}`).toBe(false);
      // Stronger than "not black": the room's light actually reached here,
      // instead of the untouched #0a0e1a page background.
      expect(
        distance(s, BASE_NAVY),
        `only base navy at ${s.x},${s.y} (rgb ${s.r},${s.g},${s.b})`,
      ).toBeGreaterThan(10);
    }
  });

  test("390x844: the backdrop reaches both edges (no dead black)", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 390, height: 844 });
    await begin(page, "/read?demo=1");
    await backdropReady(page);

    const points = [
      { x: 20, y: 450 },
      { x: 370, y: 450 },
      { x: 20, y: 120 },
      { x: 370, y: 120 },
    ];
    const samples = await shootAndSample(page, "wp-player-mobile-page1", points);
    console.log("[wp-p] 390x844 page 1 samples:", JSON.stringify(samples));
    for (const s of samples) {
      expect(s.r === 0 && s.g === 0 && s.b === 0, `pure black at ${s.x},${s.y}`).toBe(false);
      expect(
        distance(s, BASE_NAVY),
        `only base navy at ${s.x},${s.y} (rgb ${s.r},${s.g},${s.b})`,
      ).toBeGreaterThan(10);
    }
  });

  test("a text-only page keeps the last picture's light", async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await begin(page, "/read?demo=1");
    await backdropReady(page);

    const root = page.locator(".pl-root");
    // The demo's page 8 is text-only ("The End ⭐").
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(320);
    }
    await expect(root).toHaveAttribute("data-page", "8");
    await expect(page.locator(".pl-page.is-textonly")).toHaveCount(1);
    await page.waitForTimeout(500);

    const samples = await shootAndSample(page, "wp-player-desktop-textonly", [
      { x: 40, y: 450 },
      { x: 1400, y: 450 },
      { x: 720, y: 80 },
    ]);
    console.log("[wp-p] text-only page samples:", JSON.stringify(samples));
    for (const s of samples) {
      expect(s.r === 0 && s.g === 0 && s.b === 0, `pure black at ${s.x},${s.y}`).toBe(false);
      expect(distance(s, BASE_NAVY), `only base navy at ${s.x},${s.y}`).toBeGreaterThan(10);
    }
  });

  test("Ken-Burns drift runs, and stops dead under prefers-reduced-motion", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await begin(page, "/read?demo=1");
    await backdropReady(page);
    const moving = await page
      .locator('[data-pl="backdrop"]')
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(moving).toContain("pl-kenburns");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await begin(page, "/read?demo=1");
    await backdropReady(page);
    const still = await page
      .locator('[data-pl="backdrop"]')
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(still).toBe("none");
  });
});

/** Contrast of the story text against whatever is actually behind it. */
async function proseContrast(page: Page, shot: string): Promise<number> {
  const prose = page.locator('[data-pl="prose"]');
  const box = await prose.boundingBox();
  expect(box).not.toBeNull();
  const color = await prose.evaluate((el) => getComputedStyle(el).color);
  const rgb = color.match(/\d+(\.\d+)?/g)!.map(Number);
  const textLum = luminance(rgb[0], rgb[1], rgb[2]);

  const lums = await shootAndScanRect(page, shot, {
    x: box!.x + box!.width * 0.05,
    y: box!.y + box!.height * 0.08,
    width: box!.width * 0.9,
    height: box!.height * 0.84,
  });
  // Glyph pixels are the bright ones; the lower quartile is the background the
  // reader's eye actually has to separate the words from.
  const backgroundLum = percentile(lums, 0.25);
  const ratio = contrastRatio(textLum, backgroundLum);
  console.log(
    `[wp-p] ${shot}: text L=${textLum.toFixed(3)} bg(p25) L=${backgroundLum.toFixed(3)} → ${ratio.toFixed(2)}:1 over ${lums.length} px`,
  );
  return ratio;
}

/* ──────────────────────────────────── (3) legibility on a "full" layout */

test.describe("WP-P · words over art stay legible", () => {
  test("the full-bleed scrim clears 4.5:1 behind the story text", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await begin(page, "/read?demo=1");
    await backdropReady(page);

    // Demo page 2 is layout "illustration-full".
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".pl-root")).toHaveAttribute("data-page", "2");
    await expect(page.locator(".pl-page.is-full")).toHaveCount(1);
    await page.waitForFunction(() => {
      const img = document.querySelector<HTMLImageElement>(".pl-page.is-full .pl-picture img");
      return !!img && img.complete && img.naturalWidth > 0;
    }, null, { timeout: 20000 });
    await page.waitForTimeout(700);

    const scrim = await page
      .locator('[data-pl="text"]')
      .evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(scrim).toContain("linear-gradient");

    const ratio = await proseContrast(page, "wp-player-desktop-full-scrim");
    expect(ratio, `contrast behind the prose was ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  test("the ordinary text panel clears 4.5:1 too, at 1440 and at 390", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await begin(page, "/read?demo=1");
    await backdropReady(page);
    const wide = await proseContrast(page, "wp-player-desktop-panel-contrast");
    expect(wide).toBeGreaterThanOrEqual(4.5);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    const narrow = await proseContrast(page, "wp-player-mobile-panel-contrast");
    expect(narrow).toBeGreaterThanOrEqual(4.5);
  });
});

/* ───────────────────────────────────────────────────── (4) the typography */

test.describe("WP-P · the story voice", () => {
  test("Fraunces, clamp()-sized to the viewport, ~62ch measure", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await begin(page, "/read?demo=1");

    const readProse = () =>
      page.locator('[data-pl="prose"]').evaluate((el) => {
        const cs = getComputedStyle(el);
        const probe = document.createElement("span");
        probe.textContent = "0";
        probe.style.position = "absolute";
        probe.style.visibility = "hidden";
        probe.style.whiteSpace = "pre";
        probe.style.fontFamily = cs.fontFamily;
        probe.style.fontSize = cs.fontSize;
        probe.style.fontWeight = cs.fontWeight;
        probe.style.letterSpacing = cs.letterSpacing;
        document.body.appendChild(probe);
        const ch = probe.getBoundingClientRect().width;
        probe.remove();
        return {
          fontFamily: cs.fontFamily,
          fontSize: parseFloat(cs.fontSize),
          maxWidth: parseFloat(cs.maxWidth),
          ch,
          rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
          vw: window.innerWidth,
        };
      });

    const wide = await readProse();
    console.log("[wp-p] prose @1440:", JSON.stringify(wide));
    expect(wide.fontFamily).toMatch(/Fraunces/i);
    // clamp(1.1rem, 0.92rem + 1.05vw, 1.9rem)
    const expected = (m: { rem: number; vw: number }) =>
      Math.min(1.9 * m.rem, Math.max(1.1 * m.rem, 0.92 * m.rem + 0.0105 * m.vw));
    expect(wide.fontSize).toBeCloseTo(expected(wide), 0);
    expect(wide.maxWidth / wide.ch).toBeGreaterThan(60);
    expect(wide.maxWidth / wide.ch).toBeLessThan(64);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const narrow = await readProse();
    console.log("[wp-p] prose @390:", JSON.stringify(narrow));
    expect(narrow.fontSize).toBeCloseTo(expected(narrow), 0);
    expect(narrow.fontSize).toBeLessThan(wide.fontSize - 4);
    expect(narrow.maxWidth / narrow.ch).toBeGreaterThan(60);
  });
});

/* ─────────────────────────────────────────────────────────── (5) the music */

test.describe("WP-P · the music contract", () => {
  test("page.music drives the shared moods module and crossfades per page", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await begin(page, "/read?demo=1");

    const root = page.locator(".pl-root");
    await expect(root).toHaveAttribute("data-music", "on");
    await expect(root).toHaveAttribute("data-mood", "Wonder");

    // The live engine, not a data attribute: the bed is really running.
    await page.waitForFunction(
      () => (window as unknown as { __ssyncPlayer?: { musicPlaying(): boolean } }).__ssyncPlayer?.musicPlaying() === true,
      null,
      { timeout: 10000 },
    );
    const startingMood = await page.evaluate(
      () => (window as unknown as { __ssyncPlayer?: { moodName(): string | null } }).__ssyncPlayer?.moodName() ?? null,
    );
    expect(startingMood).toBe("Wonder");

    // Demo page 4 crossfades to the "adventure" track; page 5 stays on it.
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(320);
    }
    await expect(root).toHaveAttribute("data-page", "5");
    await expect(root).toHaveAttribute("data-mood", "Adventure");
    const crossfaded = await page.evaluate(
      () => (window as unknown as { __ssyncPlayer?: { moodName(): string | null } }).__ssyncPlayer?.moodName() ?? null,
    );
    expect(crossfaded).toBe("Adventure");

    // Music off is honoured: the bed stops, and the room reports it.
    await page.getByRole("button", { name: /Music on/i }).click();
    await expect(root).toHaveAttribute("data-music", "off");
    await page.waitForFunction(
      () => (window as unknown as { __ssyncPlayer?: { musicPlaying(): boolean } }).__ssyncPlayer?.musicPlaying() === false,
      null,
      { timeout: 10000 },
    );
  });

  test("a story with no page.music is silent — no bed is ever started", async ({ page }) => {
    test.setTimeout(90000);
    await seedLibrary(page);
    await begin(page, "/read?story=wp-player-voice");

    const root = page.locator(".pl-root");
    await expect(root).toHaveAttribute("data-mood", "none");
    await expect(root).toHaveAttribute("data-music", "off");
    await page.waitForTimeout(1200);
    const playing = await page.evaluate(
      () => (window as unknown as { __ssyncPlayer?: { musicPlaying(): boolean } }).__ssyncPlayer?.musicPlaying() ?? null,
    );
    expect(playing).toBe(false);
  });
});

/* ──────────────────────────────────────────────────── (6) the page-turn cue */

test.describe("WP-P · the turn-the-page cue", () => {
  test("fires on every turn, and never when settings.pageTurnSound is false", async ({ page }) => {
    test.setTimeout(90000);
    await seedLibrary(page);

    // The cue is a page turn, not a jingle: the bar is <= 300 ms.
    expect(CUE_LENGTH_S).toBeLessThanOrEqual(0.3);

    await begin(page, "/read?story=wp-player-voice");
    const root = page.locator(".pl-root");
    await expect(root).toHaveAttribute("data-page-cue", "on");
    await expect(root).toHaveAttribute("data-cues-fired", "0");
    await page.keyboard.press("ArrowRight");
    await expect(root).toHaveAttribute("data-cues-fired", "1");
    await page.waitForTimeout(320);
    await page.keyboard.press("ArrowRight");
    await expect(root).toHaveAttribute("data-cues-fired", "2");

    await begin(page, "/read?story=wp-player-quiet");
    const quiet = page.locator(".pl-root");
    await expect(quiet).toHaveAttribute("data-page-cue", "off");
    await quiet.press("ArrowRight");
    await page.waitForTimeout(320);
    await quiet.press("ArrowRight");
    await page.waitForTimeout(320);
    await expect(quiet).toHaveAttribute("data-page", "3");
    await expect(quiet).toHaveAttribute("data-cues-fired", "0");
  });
});

/* ─────────────────────────────────── (7) read-along on a recorded voice */

test.describe("WP-P · the recorded voice lights the words", () => {
  test("the highlight tracks audio.currentTime linearly across the clip", async ({ page }) => {
    test.setTimeout(90000);
    await seedLibrary(page);
    await begin(page, "/read?story=wp-player-voice");

    // Metadata loaded → the clip's duration is known.
    await page.waitForFunction(() => {
      const el = document.querySelector("audio");
      return !!el && Number.isFinite(el.duration) && el.duration > 1;
    }, null, { timeout: 20000 });

    const duration = await page.evaluate(() => document.querySelector("audio")!.duration);
    expect(duration).toBeGreaterThan(5);

    const probe = async (fraction: number) => {
      await page.evaluate((f) => {
        const el = document.querySelector("audio")!;
        el.pause();
        el.currentTime = el.duration * f;
      }, fraction);
      await page.waitForTimeout(180);
      return page.evaluate(() => {
        const words = Array.from(document.querySelectorAll('[data-pl="word"]'));
        return {
          count: words.length,
          now: words.findIndex((w) => w.classList.contains("is-now")),
          past: words.filter((w) => w.classList.contains("is-past")).length,
        };
      });
    };

    const early = await probe(0.1);
    console.log("[wp-p] read-along probes:", JSON.stringify(early));
    expect(early.count).toBe(12);
    expect(early.now).toBe(1);
    expect(early.past).toBe(1);

    const middle = await probe(0.52);
    console.log("[wp-p] read-along @52%:", JSON.stringify(middle));
    expect(Math.abs(middle.now - 6)).toBeLessThanOrEqual(1);
    expect(middle.past).toBe(middle.now);

    const late = await probe(0.95);
    console.log("[wp-p] read-along @95%:", JSON.stringify(late));
    expect(late.now).toBe(11);

    await page.screenshot({ path: path.join(SHOTS, "wp-player-readalong.png") });
  });
});

/* ─────────────────────────────────────────────────────────── (8) the end */

test.describe("WP-P · the end card", () => {
  test("ArrowRight through the 8-page demo reaches it without any audio", async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1440, height: 900 });
    // No speech, no music needed: navigation must never wait on an audio event.
    await begin(page, "/read?demo=1");

    const presses = await arrowToEnd(page);
    console.log(`[wp-p] end card reached after ${presses} ArrowRight presses`);
    expect(presses).toBeLessThanOrEqual(9);
    const root = page.locator(".pl-root");
    await expect(root).toHaveAttribute("data-view", "end");

    const end = page.locator('[data-pl="end"]');
    await expect(end).toBeVisible();
    await expect(end.locator('[data-sk="tape"]')).toBeVisible();
    await expect(end.getByText("The Brave Little Star")).toBeVisible();
    await expect(end.getByRole("button", { name: /Read it again/i })).toBeVisible();
    await expect(end.getByRole("button", { name: /Make your own story/i })).toBeVisible();
    // No ?story= → nothing to encode, so no QR is drawn.
    await expect(end.locator('[data-pl="qr"]')).toHaveCount(0);

    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, "wp-player-endcard-demo.png") });

    // Replay puts the tape back to page 1.
    await end.getByRole("button", { name: /Read it again/i }).click();
    await expect(root).toHaveAttribute("data-view", "page");
    await expect(root).toHaveAttribute("data-page", "1");
  });

  test("with ?story= present the end card carries a QR of the share URL", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedLibrary(page);
    await begin(page, "/read?story=wp-player-voice");

    await arrowToEnd(page);
    const end = page.locator('[data-pl="end"]');
    await expect(end).toBeVisible();

    const qr = end.locator('[data-pl="qr"]');
    await expect(qr).toBeVisible({ timeout: 10000 });
    const src = await qr.getAttribute("src");
    expect(src).toMatch(/^data:image\/png;base64,/);
    expect((src ?? "").length).toBeGreaterThan(500);
    const alt = await qr.getAttribute("alt");
    expect(alt).toContain("story=wp-player-voice");
    const size = await qr.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    expect(size.w).toBeGreaterThan(80);
    expect(size.h).toBeGreaterThan(80);

    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, "wp-player-endcard-qr.png") });
  });
});

/* ───────────────────────────────── (9) ?demo=1 opens the tape's cover gate */

test.describe("WP-P · ?demo=1", () => {
  test("lands straight on the demo cover gate, no chooser in the way", async ({ page }) => {
    test.setTimeout(60000);
    const started = Date.now();
    await page.goto("/read?demo=1");
    const root = page.locator(".pl-root");
    await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
    await expect(page.getByRole("button", { name: /Tap to Begin/i })).toBeVisible();
    await expect(page.getByText("The Brave Little Star").first()).toBeVisible();
    expect(Date.now() - started).toBeLessThan(20000);
    // The chooser's three tape choices are gone — this is the tape itself.
    await expect(page.locator(".pl-choice")).toHaveCount(0);
  });
});

/* ───────────────── (10) a browser with no Web Audio still plays the tape */

/**
 * Two realistic shapes of "this browser has no working Web Audio":
 *
 *   absent — the names are simply gone (Firefox with `dom.webaudio.enabled`
 *            set to false, some locked-down embedded browsers).
 *   throws — the constructor exists but fails: Chrome's per-document hardware
 *            context cap, hardened WebViews, a machine with no audio device.
 *
 * Either way the story is the product, not the sound: the cover gate must open,
 * all eight demo pages must turn, and the end card must arrive — silently, with
 * no uncaught error and no unhandled rejection anywhere on the page.
 */
for (const shape of ["absent", "throws"] as const) {
  test.describe(`WP-P · no Web Audio (${shape})`, () => {
    test("the cover gate opens and ArrowRight still reaches the end card", async ({ page }) => {
      test.setTimeout(120000);
      await page.setViewportSize({ width: 1440, height: 900 });

      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));

      await page.addInitScript((shape) => {
        // TTS gone too: navigation must not depend on any audio event at all.
        Object.defineProperty(window, "speechSynthesis", {
          configurable: true,
          get() {
            return undefined;
          },
        });
        // An unhandled rejection is a broken page as far as a listener cares.
        window.addEventListener("unhandledrejection", (event) => {
          (window as unknown as { __rejections: string[] }).__rejections.push(
            String(event.reason),
          );
        });
        (window as unknown as { __rejections: string[] }).__rejections = [];
        if (shape === "absent") {
          delete (window as unknown as Record<string, unknown>).AudioContext;
          delete (window as unknown as Record<string, unknown>).webkitAudioContext;
        } else {
          const Boom = function () {
            throw new Error("wp-p: AudioContext unavailable");
          } as unknown as typeof AudioContext;
          window.AudioContext = Boom;
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext =
            Boom;
        }
      }, shape);

      await page.goto("/read?demo=1");
      const root = page.locator(".pl-root");
      await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });

      await page.getByRole("button", { name: /Tap to Begin/i }).click();

      // THE blocker from round 1: the tap must open the story, not throw.
      await expect(
        root,
        `"Tap to Begin" left the reader on the cover gate; pageerrors: ${JSON.stringify(errors)}`,
      ).toHaveAttribute("data-view", "page", { timeout: 10000 });
      await expect(root).toHaveAttribute("data-pages", "8");
      await expect(root).toHaveAttribute("data-audio", "unavailable");

      // Demo page 1 asks for music and the ♪ chip is on — but the engine is
      // not playing anything, so the attribute (read off the engine's own
      // getter) must say so. Intent-derived state would have claimed "on".
      await expect(root).toHaveAttribute("data-mood", "Wonder");
      await expect(root).toHaveAttribute("data-music", "off");
      expect(
        await page.evaluate(
          () =>
            (window as unknown as { __ssyncPlayer?: { musicPlaying(): boolean } }).__ssyncPlayer?.musicPlaying() ??
            null,
        ),
      ).toBe(false);

      const presses = await arrowToEnd(page);
      console.log(`[wp-p] (${shape}) end card after ${presses} presses, errors=${errors.length}`);
      expect(presses).toBeLessThanOrEqual(9);
      await expect(root).toHaveAttribute("data-view", "end");

      const end = page.locator('[data-pl="end"]');
      await expect(end.locator('[data-sk="tape"]')).toBeVisible();
      await expect(end.getByRole("button", { name: /Read it again/i })).toBeVisible();
      await expect(end.getByRole("button", { name: /Make your own story/i })).toBeVisible();

      const rejections = await page.evaluate(
        () => (window as unknown as { __rejections?: string[] }).__rejections ?? [],
      );
      expect(errors, `uncaught page errors: ${JSON.stringify(errors)}`).toEqual([]);
      expect(rejections, `unhandled rejections: ${JSON.stringify(rejections)}`).toEqual([]);

      fs.mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(SHOTS, `wp-player-noaudio-${shape}-end.png`) });
    });
  });
}

/* ─────────── (11) the arrow keys survive a tap on the player's own controls */

test.describe("WP-P · the keyboard never dies", () => {
  test("arrows keep turning pages after the ⏭ button and a tap zone are used", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await begin(page, "/read?demo=1");
    const root = page.locator(".pl-root");

    // 1 — the transport's ⏭ takes focus, as any clicked button does…
    await page.locator('[data-sk="transport"][data-kind="next"]').click();
    await expect(root).toHaveAttribute("data-page", "2");
    const focused = await page.evaluate(() => document.activeElement?.className ?? "");
    expect(focused).toContain("sk-transport");

    // …and the arrow keys must still work from there.
    await page.keyboard.press("ArrowRight");
    await expect(root).toHaveAttribute("data-page", "3");
    await page.keyboard.press("ArrowLeft");
    await expect(root).toHaveAttribute("data-page", "2");

    // 2 — same after a tap zone, the other way a listener turns a page.
    await page.locator(".pl-zone--next").click();
    await expect(root).toHaveAttribute("data-page", "3");
    await page.keyboard.press("ArrowRight");
    await expect(root).toHaveAttribute("data-page", "4");

    // 3 — but Space on a focused control still belongs to that control: the
    // reading-options sheet opens instead of the page turning (G5 rule).
    const options = page.getByRole("button", { name: /Reading options/i });
    await options.focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("dialog", { name: /Reading options/i })).toBeVisible();
    await expect(root).toHaveAttribute("data-page", "4");
    await page.keyboard.press("Escape");
  });
});

/* ─────────── (12) the read-along loop sleeps when the voice does */

test.describe("WP-P · the read-along loop is not a spinner", () => {
  test("no frames are scheduled while the recorded voice is paused", async ({ page }) => {
    test.setTimeout(90000);
    await page.addInitScript(() => {
      const w = window as unknown as { __rafCalls: number };
      w.__rafCalls = 0;
      const original = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb: FrameRequestCallback) => {
        w.__rafCalls++;
        return original(cb);
      };
    });
    await seedLibrary(page);
    await begin(page, "/read?story=wp-player-voice");

    // Wait for the clip to actually roll — the loop should be alive here.
    await page.waitForFunction(() => {
      const el = document.querySelector("audio");
      return !!el && !el.paused && el.currentTime > 0;
    }, null, { timeout: 20000 });

    const playingStart = await page.evaluate(() => (window as unknown as { __rafCalls: number }).__rafCalls);
    await page.waitForTimeout(700);
    const playingEnd = await page.evaluate(() => (window as unknown as { __rafCalls: number }).__rafCalls);
    const whilePlaying = playingEnd - playingStart;

    // Now pause the clip. The sweep has nothing to follow: frames must stop.
    await page.evaluate(() => document.querySelector("audio")!.pause());
    await page.waitForTimeout(200); // let the in-flight frame drain
    const pausedStart = await page.evaluate(() => (window as unknown as { __rafCalls: number }).__rafCalls);
    await page.waitForTimeout(900);
    const pausedEnd = await page.evaluate(() => (window as unknown as { __rafCalls: number }).__rafCalls);
    const whilePaused = pausedEnd - pausedStart;

    console.log("[wp-p] rAF frames playing/paused:", JSON.stringify({ whilePlaying, whilePaused }));
    // Headless Chromium throttles rAF hard (~11 fps on an uncomposited page),
    // so the bar is the contrast, not the frame rate: frames while rolling,
    // none at all while paused.
    expect(whilePlaying, "the loop never ran while the voice was rolling").toBeGreaterThanOrEqual(4);
    expect(whilePaused, "the loop kept spinning after the voice paused").toBeLessThanOrEqual(2);
    expect(whilePaused).toBeLessThan(whilePlaying);

    // …and the last word heard is still lit, so the page does not go blank.
    const lit = await page.evaluate(
      () => document.querySelectorAll('[data-pl="word"].is-now').length,
    );
    expect(lit).toBe(1);
  });
});
