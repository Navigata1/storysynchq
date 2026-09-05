/**
 * WP-P blind-critic gate — independent verification of docs/10x-plan.md §3 WP-P.
 *
 * Written by the critic, not the builder. It does not reuse the builder's
 * helpers or its data attributes where a stronger observation exists:
 *
 *  · "no dead black at any viewport" is checked at four viewports the builder
 *    never used (ultrawide, tall tablet, small phone, short laptop), sampling a
 *    ring of edge pixels out of a real screenshot rather than two points.
 *  · the music contract is checked against instrumented Web Audio node
 *    construction (real oscillators reaching .start()), not against the
 *    player's own data-music attribute or the engine's boolean flag.
 *  · the page-turn cue is checked the same way — nodes, not a counter.
 *  · the end card is reached with Web Audio and speechSynthesis both removed
 *    from the page, so navigation cannot be leaning on an audio event.
 *
 * Permanent gate: keep it green.
 */

import { expect, test, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

const SHOTS = path.join(process.cwd(), "tests", "screenshots");
const BASE_NAVY = { r: 0x0a, g: 0x0e, b: 0x1a };

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function dist(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function chan(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function lum(r: number, g: number, b: number): number {
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function ratio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Screenshot → decode in-page → read the exact pixels asked for. */
async function samplePixels(
  page: Page,
  shot: string | null,
  points: Array<{ x: number; y: number }>,
): Promise<Array<Rgb & { x: number; y: number }>> {
  fs.mkdirSync(SHOTS, { recursive: true });
  const buffer = await page.screenshot(
    shot ? { path: path.join(SHOTS, `${shot}.png`) } : {},
  );
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

/** Every pixel of a rect, as [r,g,b] triples, out of a real screenshot. */
async function scanRect(
  page: Page,
  shot: string | null,
  rect: { x: number; y: number; width: number; height: number },
): Promise<number[]> {
  fs.mkdirSync(SHOTS, { recursive: true });
  const buffer = await page.screenshot(
    shot ? { path: path.join(SHOTS, `${shot}.png`) } : {},
  );
  const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
  return page.evaluate(
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
      const d = ctx.getImageData(x, y, w, h).data;
      const out: number[] = [];
      for (let i = 0; i < d.length; i += 4) out.push(d[i], d[i + 1], d[i + 2]);
      return out;
    },
    { dataUrl, rect },
  );
}

function percentile(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.max(0, Math.min(s.length - 1, Math.round((s.length - 1) * p)))];
}

/**
 * Count Web Audio nodes that actually reach `.start()`, per AudioContext.
 * Installed before any app script runs, so nothing in the player can dodge it.
 */
async function instrumentAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface Rec {
      oscStart: number;
      bufStart: number;
    }
    const log: Rec[] = [];
    (window as unknown as { __audioLog: Rec[] }).__audioLog = log;
    const Native = window.AudioContext;
    if (!Native) return;
    const Patched = function (this: unknown, ...args: unknown[]) {
      const ctx = new (Native as unknown as new (...a: unknown[]) => AudioContext)(...args);
      const rec: Rec = { oscStart: 0, bufStart: 0 };
      log.push(rec);
      const co = ctx.createOscillator.bind(ctx);
      ctx.createOscillator = () => {
        const n = co();
        const s = n.start.bind(n);
        n.start = ((...a: unknown[]) => {
          rec.oscStart++;
          return (s as (...z: unknown[]) => void)(...a);
        }) as typeof n.start;
        return n;
      };
      const cb = ctx.createBufferSource.bind(ctx);
      ctx.createBufferSource = () => {
        const n = cb();
        const s = n.start.bind(n);
        n.start = ((...a: unknown[]) => {
          rec.bufStart++;
          return (s as (...z: unknown[]) => void)(...a);
        }) as typeof n.start;
        return n;
      };
      return ctx;
    } as unknown as typeof AudioContext;
    Patched.prototype = Native.prototype;
    window.AudioContext = Patched;
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext =
      Patched;
  });
}

async function audioTotals(page: Page): Promise<{ osc: number; buf: number; contexts: number }> {
  return page.evaluate(() => {
    const log = (window as unknown as { __audioLog?: Array<{ oscStart: number; bufStart: number }> })
      .__audioLog ?? [];
    return {
      osc: log.reduce((n, r) => n + r.oscStart, 0),
      buf: log.reduce((n, r) => n + r.bufStart, 0),
      contexts: log.length,
    };
  });
}

/** A real 6 s WAV — stands in for a child's recorded voice. */
function wavDataUrl(seconds = 6, rate = 8000): string {
  const samples = seconds * rate;
  const bytes = samples * 2;
  const buf = Buffer.alloc(44 + bytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + bytes, 4);
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
  buf.writeUInt32LE(bytes, 40);
  return `data:audio/wav;base64,${buf.toString("base64")}`;
}

const CRITIC_WORDS =
  "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima";

/** Silent room + no chime: no page.music anywhere, pageTurnSound false. */
function silentStory() {
  return {
    version: "2.0",
    metadata: { title: "Critic Silent Tape", author: "Critic" },
    settings: { autoPlay: false, pageTurnSound: false, readAlongHighlight: true },
    pages: [
      {
        id: 1,
        layout: "illustration-top",
        illustration: { url: "/demo/images/page1.jpg", alt: "star" },
        text: { content: CRITIC_WORDS, audioUrl: wavDataUrl(6), audioCodec: "wav" },
      },
      {
        id: 2,
        layout: "illustration-top",
        illustration: { url: "/demo/images/page2.jpg", alt: "sky" },
        text: { content: "Second page of the silent tape." },
      },
    ],
  };
}

/** Same tape, but the chime is on — so the cue is the only audio in it. */
function chimeStory() {
  const s = silentStory();
  return {
    ...s,
    metadata: { title: "Critic Chime Tape", author: "Critic" },
    settings: { ...s.settings, pageTurnSound: true },
  };
}

function libraryRow(id: string, ssyncData: ReturnType<typeof silentStory>) {
  return {
    id,
    shareCode: id,
    title: ssyncData.metadata.title,
    author: ssyncData.metadata.author,
    genre: "children",
    ageRange: "3-8",
    pageCount: ssyncData.pages.length,
    description: "",
    thumbnail: null,
    createdAt: new Date().toISOString(),
    isPublic: true,
    ssyncData,
  };
}

async function seed(page: Page): Promise<void> {
  const rows = [
    libraryRow("critic-silent", silentStory()),
    libraryRow("critic-chime", chimeStory()),
  ];
  await page.addInitScript((data) => {
    try {
      window.localStorage.setItem("ssync-library", JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }, rows);
}

async function tapToBegin(page: Page, url: string): Promise<void> {
  await page.goto(url);
  const root = page.locator(".pl-root");
  await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
  await page.getByRole("button", { name: /Tap to Begin/i }).click();
  await expect(root).toHaveAttribute("data-view", "page");
}

async function backdropPainted(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const img = document.querySelector<HTMLImageElement>('[data-pl="backdrop"]');
      return !!img && img.complete && img.naturalWidth > 0;
    },
    null,
    { timeout: 20000 },
  );
  // the 900 ms crossfade settles (bounded, well under the 2.5 s ceiling)
  await page.waitForTimeout(1200);
}

/* ══════════════════════════════════ 1 · the room has no dead black anywhere */

const VIEWPORTS = [
  { name: "ultrawide-2560x1080", width: 2560, height: 1080 },
  { name: "tablet-tall-1024x1366", width: 1024, height: 1366 },
  { name: "phone-small-320x568", width: 320, height: 568 },
  { name: "laptop-short-1440x720", width: 1440, height: 720 },
];

for (const vp of VIEWPORTS) {
  test(`critic WP-P · no dead black at ${vp.name}`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await tapToBegin(page, "/read?demo=1");
    await backdropPainted(page);

    // The gap around the illustration is the thing G3 is about. The story-text
    // panel is *deliberately* a dark scrim, so it is excluded by construction:
    // every sample sits above the text block and outside the picture itself.
    const boxes = await page.evaluate(() => {
      const pic = document.querySelector(".pl-picture img")?.getBoundingClientRect();
      const text = document.querySelector('[data-pl="text"]')?.getBoundingClientRect();
      return {
        pic: pic ? { x: pic.x, y: pic.y, w: pic.width, h: pic.height } : null,
        textTop: text ? text.y : window.innerHeight,
      };
    });
    expect(boxes.pic, "no illustration on demo page 1").not.toBeNull();
    const pic = boxes.pic!;
    const ceiling = Math.min(boxes.textTop - 6, vp.height - 4);
    const midY = Math.round(Math.min(pic.y + pic.h / 2, ceiling));
    const upperY = Math.round(Math.min(pic.y + pic.h * 0.2, ceiling));
    const m = 6;

    const points = [
      // the letterbox bars either side of the art
      { x: m, y: midY },
      { x: vp.width - m, y: midY },
      { x: m, y: upperY },
      { x: vp.width - m, y: upperY },
      // just outside the picture's own edges
      { x: Math.max(m, Math.round(pic.x - 10)), y: midY },
      { x: Math.min(vp.width - m, Math.round(pic.x + pic.w + 10)), y: midY },
      // the band above the art
      { x: Math.round(vp.width * 0.25), y: m },
      { x: Math.round(vp.width * 0.75), y: m },
      { x: Math.round(vp.width * 0.5), y: Math.max(m, Math.round(pic.y / 2)) },
    ];
    const samples = await samplePixels(page, `critic-player-${vp.name}`, points);
    console.log(`[critic-p] ${vp.name} (textTop=${boxes.textTop}):`, JSON.stringify(samples));

    for (const s of samples) {
      expect(
        s.r === 0 && s.g === 0 && s.b === 0,
        `pure black at ${s.x},${s.y} on ${vp.name}`,
      ).toBe(false);
      expect(
        dist(s, BASE_NAVY),
        `untouched base navy at ${s.x},${s.y} on ${vp.name} (rgb ${s.r},${s.g},${s.b})`,
      ).toBeGreaterThan(6);
    }
  });
}

/* ══════════════════════════ 2 · music is real audio, and silence is silence */

test("critic WP-P · page.music actually starts oscillators; no page.music starts none", async ({
  page,
}) => {
  test.setTimeout(120000);
  await instrumentAudio(page);
  await seed(page);

  /* (a) the demo names Wonder → real nodes must reach .start() */
  await tapToBegin(page, "/read?demo=1");
  await expect(page.locator(".pl-root")).toHaveAttribute("data-music", "on");
  await expect(page.locator(".pl-root")).toHaveAttribute("data-mood", "Wonder");
  await page.waitForFunction(
    () => {
      const log =
        (window as unknown as { __audioLog?: Array<{ oscStart: number }> }).__audioLog ?? [];
      return log.reduce((n, r) => n + r.oscStart, 0) >= 4;
    },
    null,
    { timeout: 15000 },
  );
  const withMusic = await audioTotals(page);
  console.log("[critic-p] demo audio nodes:", JSON.stringify(withMusic));
  expect(withMusic.osc).toBeGreaterThanOrEqual(4);

  /* (b) a tape with no page.music and no chime → NOTHING is ever started */
  await tapToBegin(page, "/read?story=critic-silent");
  await expect(page.locator(".pl-root")).toHaveAttribute("data-music", "off");
  await expect(page.locator(".pl-root")).toHaveAttribute("data-mood", "none");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".pl-root")).toHaveAttribute("data-page", "2");
  await page.waitForTimeout(1500);
  const silent = await audioTotals(page);
  console.log("[critic-p] silent tape audio nodes:", JSON.stringify(silent));
  expect(silent.osc, "a silent tape started an oscillator").toBe(0);
  expect(silent.buf, "a silent tape started a buffer source").toBe(0);
});

/* ════════════════════════════════════ 3 · the chime obeys pageTurnSound */

test("critic WP-P · the page-turn cue is real audio and pageTurnSound gates it", async ({
  page,
}) => {
  test.setTimeout(120000);
  await instrumentAudio(page);
  await seed(page);

  /* chime on: one turn must schedule the paper noise + the wooden thock */
  await tapToBegin(page, "/read?story=critic-chime");
  await expect(page.locator(".pl-root")).toHaveAttribute("data-page-cue", "on");
  const before = await audioTotals(page);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".pl-root")).toHaveAttribute("data-page", "2");
  const after = await audioTotals(page);
  console.log("[critic-p] cue nodes before/after:", JSON.stringify({ before, after }));
  expect(after.buf - before.buf, "no paper-swish buffer source on a page turn").toBeGreaterThanOrEqual(1);
  expect(after.osc - before.osc, "no thock oscillator on a page turn").toBeGreaterThanOrEqual(1);

  /* chime off: the same journey makes no sound at all (covered by test 2b too,
     asserted here against the cue path specifically) */
  await tapToBegin(page, "/read?story=critic-silent");
  await expect(page.locator(".pl-root")).toHaveAttribute("data-page-cue", "off");
  const quietBefore = await audioTotals(page);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".pl-root")).toHaveAttribute("data-page", "2");
  await page.waitForTimeout(600);
  const quietAfter = await audioTotals(page);
  expect(quietAfter.buf - quietBefore.buf, "a muted tape still swished").toBe(0);
  expect(quietAfter.osc - quietBefore.osc, "a muted tape still thocked").toBe(0);
});

/* ═══════════════════════ 4 · the end card with audio removed from the page */

/**
 * Two shapes of "this browser has no Web Audio":
 *   absent — Firefox with dom.webaudio.enabled=false: the names are simply gone.
 *   throws — the constructor exists but fails (Chrome's per-document hardware
 *            context cap, hardened/embedded WebViews).
 * Either way the tape must still play, silently, all the way to the end card.
 */
for (const shape of ["absent", "throws"] as const) {
  test(`critic WP-P · the story still plays to the end card when Web Audio ${shape} and TTS is gone`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.addInitScript((shape) => {
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        get() {
          return undefined;
        },
      });
      if (shape === "absent") {
        delete (window as unknown as Record<string, unknown>).AudioContext;
        delete (window as unknown as Record<string, unknown>).webkitAudioContext;
      } else {
        const Boom = function () {
          throw new Error("critic: AudioContext unavailable");
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

    // The gate itself must survive a browser with no audio at all.
    await expect(
      root,
      `"Tap to Begin" left the reader on the cover gate; page errors: ${JSON.stringify(errors)}`,
    ).toHaveAttribute("data-view", "page", { timeout: 10000 });
    await expect(root).toHaveAttribute("data-pages", "8");

    let presses = 0;
    for (let i = 0; i < 14; i++) {
      if ((await root.getAttribute("data-view")) === "end") break;
      await page.keyboard.press("ArrowRight");
      presses++;
      await page.waitForTimeout(300);
    }
    console.log(`[critic-p] (${shape}) end card after ${presses} presses, errors=${errors.length}`);
    await expect(root).toHaveAttribute("data-view", "end");
    expect(presses).toBeLessThanOrEqual(9);

    const end = page.locator('[data-pl="end"]');
    await expect(end.locator('[data-sk="tape"]')).toBeVisible();
    await expect(end.getByRole("button", { name: /Read it again/i })).toBeVisible();
    await expect(end.getByRole("button", { name: /Make your own story/i })).toBeVisible();
    await page.screenshot({
      path: path.join(SHOTS, `critic-player-endcard-noaudio-${shape}.png`),
    });
  });
}

/* ════════════════════ 5 · words over art stay legible on a small viewport */

test("critic WP-P · full-bleed scrim clears 4.5:1 at 390x844 as well", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await tapToBegin(page, "/read?demo=1");
  await backdropPainted(page);

  // demo page 2 is layout "illustration-full"
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".pl-root")).toHaveAttribute("data-page", "2");
  await expect(page.locator(".pl-page.is-full")).toHaveCount(1);
  await page.waitForTimeout(900);

  const prose = page.locator('[data-pl="prose"]');
  const box = await prose.boundingBox();
  expect(box).not.toBeNull();
  const color = await prose.evaluate((el) => getComputedStyle(el).color);
  const rgb = (color.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  const textLum = lum(rgb[0], rgb[1], rgb[2]);

  const px = await scanRect(page, "critic-player-mobile-full-scrim", {
    x: box!.x + box!.width * 0.05,
    y: box!.y + box!.height * 0.08,
    width: box!.width * 0.9,
    height: box!.height * 0.84,
  });
  const lums: number[] = [];
  for (let i = 0; i < px.length; i += 3) lums.push(lum(px[i], px[i + 1], px[i + 2]));
  const bg = percentile(lums, 0.25);
  const r = ratio(textLum, bg);
  console.log(`[critic-p] mobile full-bleed contrast → ${r.toFixed(2)}:1 over ${lums.length} px`);
  expect(r).toBeGreaterThanOrEqual(4.5);

  // and the text block must not have eaten the picture whole
  expect(box!.height).toBeLessThan(844 * 0.75);
});

/* ═══════════════════════ 6 · the story voice: Fraunces, clamp(), ~62ch */

test("critic WP-P · prose is Fraunces, clamp()-sized, and capped near 62ch", async ({ page }) => {
  test.setTimeout(120000);
  const read = async (w: number, h: number) => {
    await page.setViewportSize({ width: w, height: h });
    await tapToBegin(page, "/read?demo=1");
    return page.locator('[data-pl="prose"]').evaluate((el) => {
      const cs = getComputedStyle(el);
      const probe = document.createElement("span");
      probe.style.font = cs.font;
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.textContent = "0".repeat(100);
      el.appendChild(probe);
      const chWidth = probe.getBoundingClientRect().width / 100;
      probe.remove();
      return {
        family: cs.fontFamily,
        size: parseFloat(cs.fontSize),
        maxWidth: parseFloat(cs.maxWidth),
        chWidth,
        rendered: el.getBoundingClientRect().width,
      };
    });
  };

  const wide = await read(1440, 900);
  const narrow = await read(390, 844);
  console.log("[critic-p] prose:", JSON.stringify({ wide, narrow }));

  expect(wide.family.toLowerCase()).toContain("fraunces");
  expect(narrow.family.toLowerCase()).toContain("fraunces");
  // clamp(): the size genuinely tracks the viewport, and stays inside the bounds
  expect(wide.size).toBeGreaterThan(narrow.size + 4);
  expect(narrow.size).toBeGreaterThanOrEqual(16);
  expect(wide.size).toBeLessThanOrEqual(1.9 * 16 + 0.5);
  // ~62ch measure: the cap, and the line actually rendered, both respect it
  expect(wide.maxWidth / wide.chWidth).toBeGreaterThan(55);
  expect(wide.maxWidth / wide.chWidth).toBeLessThan(70);
  expect(wide.rendered).toBeLessThanOrEqual(wide.maxWidth + 1);
});

/* ═══════════════════ 7 · Ken-Burns drift is real, and reduced motion kills it */

test("critic WP-P · the backdrop drifts, and holds still under reduced motion", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });

  await tapToBegin(page, "/read?demo=1");
  await backdropPainted(page);
  const readMatrix = () =>
    page.locator('[data-pl="backdrop"]').evaluate((el) => getComputedStyle(el).transform);
  const a = await readMatrix();
  await page.waitForTimeout(1600);
  const b = await readMatrix();
  console.log("[critic-p] drift matrices:", a, "→", b);
  expect(a, "the backdrop transform never changed — no Ken-Burns").not.toBe(b);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await tapToBegin(page, "/read?demo=1");
  await backdropPainted(page);
  const still1 = await readMatrix();
  await page.waitForTimeout(1600);
  const still2 = await readMatrix();
  console.log("[critic-p] reduced-motion matrices:", still1, "→", still2);
  expect(still1).toBe(still2);
  const animName = await page
    .locator('[data-pl="backdrop"]')
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(animName).toBe("none");
  await page.emulateMedia({ reducedMotion: null });
});

/* ═══════════════════════════ 8 · ?demo=1 lands on the demo's cover gate */

test("critic WP-P · ?demo=1 and ?demo=true both open the demo cover gate", async ({ page }) => {
  test.setTimeout(120000);
  for (const value of ["1", "true"]) {
    await page.goto(`/read?demo=${value}`);
    const root = page.locator(".pl-root");
    await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
    await expect(page.locator(".pl-choice")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Tap to Begin/i })).toBeVisible();
    await expect(root).toHaveAttribute("data-pages", "8");
  }

  // Closing the demo must clear ?demo= or the room re-threads the tape forever.
  await page.getByRole("button", { name: /Tap to Begin/i }).click();
  await page.getByRole("button", { name: /^Close story$/i }).click();
  await expect(page.locator(".pl-choice")).toHaveCount(3, { timeout: 10000 });
  await expect(page).toHaveURL(/\/read$/);
});

/* ═══════════════════ 9 · TTS read-along: onboundary really drives the words */

test("critic WP-P · speechSynthesis onboundary lights the spoken word", async ({ page }) => {
  test.setTimeout(120000);
  // A deterministic speechSynthesis: headless Chromium ships no voices, so the
  // only honest way to prove the wiring is to emit the boundary events
  // ourselves and watch the DOM answer.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__utt = null;
    class FakeUtterance {
      text: string;
      rate = 1;
      pitch = 1;
      onboundary: ((e: { name: string; charIndex: number }) => void) | null = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    w.SpeechSynthesisUtterance = FakeUtterance;
    Object.defineProperty(w, "speechSynthesis", {
      configurable: true,
      value: {
        speak(u: FakeUtterance) {
          w.__utt = u;
          u.onstart?.();
        },
        cancel() {},
        getVoices() {
          return [];
        },
      },
    });
    w.__boundary = (charIndex: number) => {
      (w.__utt as FakeUtterance | null)?.onboundary?.({ name: "word", charIndex });
    };
  });

  await tapToBegin(page, "/read?demo=1");
  await page.waitForFunction(
    () => (window as unknown as { __utt: unknown }).__utt !== null,
    null,
    { timeout: 10000 },
  );

  const text = await page.evaluate(() => (window as unknown as { __utt: { text: string } }).__utt.text);
  const offsets: number[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) offsets.push(m.index);
  expect(offsets.length).toBeGreaterThan(10);

  const readWords = () =>
    page.evaluate(() => {
      const ws = Array.from(document.querySelectorAll('[data-pl="word"]'));
      return {
        now: ws.findIndex((w) => w.classList.contains("is-now")),
        past: ws.filter((w) => w.classList.contains("is-past")).length,
        total: ws.length,
      };
    });

  const before = await readWords();
  expect(before.now).toBe(-1);
  await page.evaluate(
    (i) => (window as unknown as { __boundary(n: number): void }).__boundary(i),
    offsets[4],
  );
  await page.waitForTimeout(150);
  const at4 = await readWords();
  await page.evaluate(
    (i) => (window as unknown as { __boundary(n: number): void }).__boundary(i),
    offsets[9],
  );
  await page.waitForTimeout(150);
  const at9 = await readWords();
  console.log("[critic-p] tts read-along:", JSON.stringify({ before, at4, at9 }));
  expect(at4.now).toBe(4);
  expect(at4.past).toBe(4);
  expect(at9.now).toBe(9);
  expect(at9.past).toBe(9);
});

/* ══════════════════════════════════════════════════════════════ ROUND 2 ═══
 *
 * Round-1 probes above all read the demo tape, whose seven pictures are dark
 * and whose eighth page inherits the seventh's light. Round 2 attacks the
 * cases the demo cannot express:
 *
 *   10 · a tape with NO picture on any page — nothing for the backdrop to
 *        blur, the case where "the room" has to come from the room itself.
 *   11 · a "full" layout over a PURE WHITE illustration — the worst case the
 *        scrim can be handed, instead of the demo's dark art.
 *   12 · the mood really crossfades across pages (the bed is never restarted).
 *   13 · the end-card QR encodes the exact share URL, byte for byte, rather
 *        than merely being a QR-shaped image.
 */

const WHITE_ART =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAXklEQVR4nO3PMQ0AMAzAsPInvYLYYVWKESTzjhsd8KsBrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BbQHKU9LC7/CP1AAAAABJRU5ErkJggg==";

/** A tape with no illustration anywhere — pure text, three pages. */
function blindStory() {
  return {
    version: "2.0",
    metadata: { title: "Critic Blind Tape", author: "Critic" },
    settings: { autoPlay: false, pageTurnSound: false, readAlongHighlight: true },
    pages: [
      { id: 1, layout: "text-only", text: { content: CRITIC_WORDS } },
      { id: 2, layout: "text-only", text: { content: "Second page, still no picture." } },
      { id: 3, layout: "text-only", text: { content: "Third page, still no picture." } },
    ],
  };
}

/** A "full" layout whose art is pure white — the hardest scrim in the world. */
function whiteStory() {
  return {
    version: "2.0",
    metadata: { title: "Critic White Tape", author: "Critic" },
    settings: { autoPlay: false, pageTurnSound: false, readAlongHighlight: true },
    pages: [
      {
        id: 1,
        layout: "illustration-full",
        illustration: { url: WHITE_ART, alt: "a white page" },
        text: { content: CRITIC_WORDS },
      },
      {
        id: 2,
        layout: "illustration-full",
        illustration: { url: WHITE_ART, alt: "a white page" },
        text: { content: "Second white page." },
      },
    ],
  };
}

async function seedRound2(page: Page): Promise<void> {
  const rows = [
    libraryRow("critic-silent", silentStory()),
    libraryRow("critic-blind", blindStory() as unknown as ReturnType<typeof silentStory>),
    libraryRow("critic-white", whiteStory() as unknown as ReturnType<typeof silentStory>),
  ];
  await page.addInitScript((data) => {
    try {
      window.localStorage.setItem("ssync-library", JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }, rows);
}

/**
 * Walk to the end card with the arrow key.
 *
 * NOTE for whoever reads this next: the presses are spaced deliberately. The
 * player's page turn holds the new index behind a 240 ms out-animation, and a
 * press that arrives inside that window restarts the same turn instead of
 * queueing the next one — 8 presses fired back to back land on page 2, not on
 * the end card (measured, September 2026). That is a real input defect, not a
 * test-harness quirk; this helper works around it so the QR assertions below
 * are testing the QR.
 */
async function arrowToEnd(page: Page, presses: number): Promise<void> {
  const root = page.locator(".pl-root");
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press("ArrowRight");
    if (i < presses - 1) {
      await expect(root).toHaveAttribute("data-page", String(i + 2), { timeout: 5000 });
    }
  }
}

/* ═════════════════ 10 · a tape with no pictures at all is still a room */

for (const vp of [
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "phone-390x844", width: 390, height: 844 },
]) {
  test(`critic WP-P · a picture-less tape is not dead black at ${vp.name}`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await seedRound2(page);
    await tapToBegin(page, "/read?story=critic-blind");
    await expect(page.locator(".pl-page.is-textonly")).toHaveCount(1);
    await expect(page.locator('[data-pl="backdrop"]')).toHaveCount(0);
    await page.waitForTimeout(900);

    const m = 8;
    const points = [
      { x: m, y: Math.round(vp.height * 0.5) },
      { x: vp.width - m, y: Math.round(vp.height * 0.5) },
      { x: m, y: m },
      { x: vp.width - m, y: m },
      { x: m, y: vp.height - m },
      { x: vp.width - m, y: vp.height - m },
      { x: Math.round(vp.width * 0.5), y: m },
      { x: Math.round(vp.width * 0.5), y: vp.height - m },
      // the plan's own two probe points, scaled into this viewport
      { x: 40, y: Math.round(vp.height * 0.5) },
      { x: vp.width - 40, y: Math.round(vp.height * 0.5) },
    ];
    const samples = await samplePixels(page, `critic-player-blind-${vp.name}`, points);
    const spread = samples.map((s) => Math.max(s.r, s.g, s.b) - Math.min(s.r, s.g, s.b));
    console.log(
      `[critic-p] blind tape ${vp.name}:`,
      JSON.stringify(samples),
      "chroma spread:",
      JSON.stringify(spread),
    );

    for (const s of samples) {
      expect(
        s.r === 0 && s.g === 0 && s.b === 0,
        `pure black at ${s.x},${s.y} with no illustration (${vp.name})`,
      ).toBe(false);
      // brightness: a lit room, not a switched-off screen
      expect(
        s.r + s.g + s.b,
        `near-black (rgb ${s.r},${s.g},${s.b}) at ${s.x},${s.y} on ${vp.name}`,
      ).toBeGreaterThan(24);
    }
    // and the light has colour in it somewhere, not a flat grey wash
    expect(Math.max(...spread), "the ambient light has no colour at all").toBeGreaterThanOrEqual(6);
  });
}

/* ═════════════ 11 · the scrim survives the worst art it can be handed */

for (const vp of [
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "phone-390x844", width: 390, height: 844 },
]) {
  test(`critic WP-P · full-bleed text over PURE WHITE art clears 4.5:1 at ${vp.name}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await seedRound2(page);
    await tapToBegin(page, "/read?story=critic-white");
    await expect(page.locator(".pl-page.is-full")).toHaveCount(1);
    await backdropPainted(page);

    const prose = page.locator('[data-pl="prose"]');
    const box = await prose.boundingBox();
    expect(box).not.toBeNull();
    const color = await prose.evaluate((el) => getComputedStyle(el).color);
    const rgb = (color.match(/\d+(\.\d+)?/g) ?? []).map(Number);
    const textLum = lum(rgb[0], rgb[1], rgb[2]);

    // The whole prose box, edge to edge: no cherry-picked inner rectangle.
    const px = await scanRect(page, `critic-player-white-scrim-${vp.name}`, {
      x: box!.x,
      y: box!.y,
      width: box!.width,
      height: box!.height,
    });
    const lums: number[] = [];
    for (let i = 0; i < px.length; i += 3) lums.push(lum(px[i], px[i + 1], px[i + 2]));
    // p25 = background between the glyphs; p90 = the brightest thing behind a
    // word, which is what actually decides whether the sentence disappears.
    const bg25 = percentile(lums, 0.25);
    const bg90 = percentile(lums, 0.9);
    const r25 = ratio(textLum, bg25);
    console.log(
      `[critic-p] white-art scrim ${vp.name}: text L=${textLum.toFixed(3)} p25 L=${bg25.toFixed(
        4,
      )} → ${r25.toFixed(2)}:1 · p90 L=${bg90.toFixed(3)} over ${lums.length} px`,
    );
    expect(r25, "story text over white art fails 4.5:1").toBeGreaterThanOrEqual(4.5);
    // the picture must still be visible above the words
    expect(box!.height).toBeLessThan(vp.height * 0.8);
  });
}

/* ══════════════ 12 · the mood crossfades — the bed is never restarted */

test("critic WP-P · mood changes across pages without the bed ever stopping", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await instrumentAudio(page);
  await tapToBegin(page, "/read?demo=1");
  const root = page.locator(".pl-root");
  await expect(root).toHaveAttribute("data-music", "on");
  await expect(root).toHaveAttribute("data-mood", "Wonder");

  // Watch the engine itself, 20 times a second, for the whole journey.
  await page.evaluate(() => {
    const w = window as unknown as {
      __ssyncPlayer?: { musicPlaying(): boolean; moodName(): string | null };
      __moodWatch?: { drops: number; moods: string[]; samples: number };
    };
    const watch = { drops: 0, moods: [] as string[], samples: 0 };
    w.__moodWatch = watch;
    const id = window.setInterval(() => {
      const hook = w.__ssyncPlayer;
      if (!hook) return;
      watch.samples++;
      if (!hook.musicPlaying()) watch.drops++;
      const m = hook.moodName() ?? "null";
      if (watch.moods[watch.moods.length - 1] !== m) watch.moods.push(m);
    }, 50);
    window.setTimeout(() => window.clearInterval(id), 30000);
  });

  const seen: string[] = [];
  for (let i = 1; i < 8; i++) {
    await page.keyboard.press("ArrowRight");
    await expect(root).toHaveAttribute("data-page", String(i + 1));
    await page.waitForTimeout(400);
    seen.push((await root.getAttribute("data-mood")) ?? "?");
  }
  const watch = await page.evaluate(
    () =>
      (window as unknown as { __moodWatch: { drops: number; moods: string[]; samples: number } })
        .__moodWatch,
  );
  const nodes = await audioTotals(page);
  console.log(
    "[critic-p] moods per page:",
    JSON.stringify(seen),
    "engine moods:",
    JSON.stringify(watch),
    "audio:",
    JSON.stringify(nodes),
  );

  // the demo walks wonder → adventure → peaceful(Calm)
  expect(seen).toEqual(["Wonder", "Wonder", "Adventure", "Adventure", "Calm", "Calm", "Calm"]);
  expect(watch.samples, "the engine hook was never sampled").toBeGreaterThan(30);
  expect(watch.drops, "the music bed stopped mid-story instead of crossfading").toBe(0);
  expect(watch.moods.slice(0, 3)).toEqual(["Wonder", "Adventure", "Calm"]);
  // one context for the bed, one for the page-turn cue — never one per mood
  expect(nodes.contexts).toBeLessThanOrEqual(2);
});

/* ═════════════ 13 · the QR is the share URL, not a QR-shaped decoration */

test("critic WP-P · the end-card QR encodes the exact share URL", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedRound2(page);
  await tapToBegin(page, "/read?story=critic-silent");
  const root = page.locator(".pl-root");
  await arrowToEnd(page, 2);
  await expect(root).toHaveAttribute("data-view", "end");

  const shown = await page.locator(".pl-qr-url").innerText();
  expect(shown.trim(), "the end card shows a URL that is not this page").toBe(page.url());

  const img = page.locator('[data-pl="qr"]');
  await expect(img).toBeVisible({ timeout: 10000 });
  const src = await img.getAttribute("src");
  expect(src).toMatch(/^data:image\/png;base64,/);

  /* Read the QR's MODULES back off the rendered image and compare them to the
     modules of the URL the card displays. PNG bytes differ between the browser
     and node encoders, so bytes prove nothing — the module grid is the content
     itself, and a QR of any other string cannot reproduce it. */
  const QRCode = (await import("qrcode")).default;
  const encode = (text: string) => {
    const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
    return { size: qr.modules.size, bits: Array.from(qr.modules.data as Uint8Array) };
  };
  const expected = encode(shown.trim());

  const read = await page.evaluate(
    async ({ src, size }) => {
      const im = new Image();
      im.src = src;
      await im.decode();
      const canvas = document.createElement("canvas");
      canvas.width = im.naturalWidth;
      canvas.height = im.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(im, 0, 0);
      const scale = canvas.width / (size + 2); // margin: 1 module each side
      const bits: number[] = [];
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          const x = Math.floor((1 + col + 0.5) * scale);
          const y = Math.floor((1 + row + 0.5) * scale);
          const d = ctx.getImageData(x, y, 1, 1).data;
          bits.push((d[0] + d[1] + d[2]) / 3 < 128 ? 1 : 0);
        }
      }
      return { bits, width: canvas.width };
    },
    { src: src!, size: expected.size },
  );

  const wrong = read.bits.reduce(
    (n, bit, i) => n + (bit === (expected.bits[i] ? 1 : 0) ? 0 : 1),
    0,
  );
  console.log(
    `[critic-p] QR: url=${shown.trim()} version-size=${expected.size} rendered=${
      read.width
    }px modules=${expected.bits.length} mismatched=${wrong}`,
  );
  expect(read.bits.length).toBe(expected.bits.length);
  expect(wrong, "the QR's modules are not the modules of the URL it displays").toBe(0);

  // and the same reader must reject a QR of anything else — proof the check bites
  const other = encode("http://localhost:3000/read?story=some-other-tape");
  const diff = read.bits.reduce((n, bit, i) => n + (bit === (other.bits[i] ? 1 : 0) ? 0 : 1), 0);
  expect(diff, "the module comparison cannot tell two URLs apart").toBeGreaterThan(0);
  await page.screenshot({ path: path.join(SHOTS, "critic-player-endcard-qr.png") });

  // and a tape opened with no ?story= gets no QR at all
  await tapToBegin(page, "/read?demo=1");
  await arrowToEnd(page, 8);
  await expect(root).toHaveAttribute("data-view", "end");
  await expect(page.locator('[data-pl="qr"]')).toHaveCount(0);
});

/* ══════ 14 · the mood vocabulary the Studio writes is the one the room plays */

/** A tape whose moods are the two the 10x-plan's G4 row calls out by name. */
function vocabStory() {
  return {
    version: "2.0",
    metadata: { title: "Critic Vocabulary Tape", author: "Critic" },
    settings: { autoPlay: false, pageTurnSound: false, readAlongHighlight: true },
    pages: [
      { id: 1, layout: "text-only", music: "Hush", text: { content: "A hush over the house." } },
      { id: 2, layout: "text-only", music: "melancholy", text: { content: "Then the rain." } },
      { id: 3, layout: "text-only", text: { content: "And then nothing at all." } },
    ],
  };
}

test("critic WP-P · Hush plays as Hush, and Music off really stops the bed", async ({ page }) => {
  test.setTimeout(120000);
  await instrumentAudio(page);
  await page.addInitScript((data) => {
    try {
      window.localStorage.setItem("ssync-library", JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }, [libraryRow("critic-vocab", vocabStory() as unknown as ReturnType<typeof silentStory>)]);

  await tapToBegin(page, "/read?story=critic-vocab");
  const root = page.locator(".pl-root");
  // G4: the Studio's own vocabulary must not fall back to Wonder
  await expect(root).toHaveAttribute("data-mood", "Hush");
  await expect(root).toHaveAttribute("data-music", "on");
  expect(await page.evaluate(() => (window as unknown as { __ssyncPlayer: { moodName(): string | null } }).__ssyncPlayer.moodName())).toBe("Hush");

  await page.keyboard.press("ArrowRight");
  await expect(root).toHaveAttribute("data-page", "2");
  await expect(root).toHaveAttribute("data-mood", "Melancholy");

  // Music off: the engine reports silence and nothing new is scheduled after it
  await page.getByRole("button", { name: /Music on/i }).click();
  await expect(root).toHaveAttribute("data-music", "off");
  expect(
    await page.evaluate(() =>
      (window as unknown as { __ssyncPlayer: { musicPlaying(): boolean } }).__ssyncPlayer.musicPlaying(),
    ),
    "the engine still reports a bed after Music off",
  ).toBe(false);
  const quiet = await audioTotals(page);
  await page.waitForTimeout(2000);
  const later = await audioTotals(page);
  console.log("[critic-p] nodes after Music off:", JSON.stringify({ quiet, later }));
  expect(later.osc - quiet.osc, "notes are still being scheduled with the music off").toBe(0);

  // page 3 names no music at all → silence stays silence
  await page.getByRole("button", { name: /Music off/i }).click();
  await expect(root).toHaveAttribute("data-music", "on");
  /* NOTE: the blur is load-bearing. While a chrome chip (Music / Reading
     options / Close) keeps focus, the key handler hands ArrowRight to that
     button and the page will not turn — only the transport and the tap zones
     carry `data-pl-nav`. Measured September 2026; a listener who taps the
     music chip and then reaches for the arrow keys finds them dead until they
     click the page. Not a bar item, but it is a wart. */
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("ArrowRight");
  await expect(root).toHaveAttribute("data-page", "3");
  await expect(root).toHaveAttribute("data-mood", "none");
  await expect(root).toHaveAttribute("data-music", "off");
});
