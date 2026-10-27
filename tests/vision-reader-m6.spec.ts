/**
 * M6 · fix wave B — the reader, the deck chip and the end card against s02,
 * s05 and s06 (the critic panel's confirmed findings, each pinned here).
 *
 *   1. Keyboard focus never lands on invisible chrome: focus wakes it, and
 *      the idle timer never hides chrome a keyboard is standing on.
 *   2. The tap zones are not a second "Previous page" / "Next page" tab stop.
 *   3. Read-along ink: said words cream #F3E6C8; the now word label gold with
 *      a two-layer halo and a gold underline (a solid one in high contrast).
 *   4. Not-yet-spoken words clear 4.5:1 on a phone (18-19 px prose).
 *   5. The phone scrim's blur fades in with the gradient: no hard seam.
 *   6. A square picture on a portrait phone fits its width instead of a crop
 *      that halves the protagonist.
 *   7. The spread transport is the reference's 200 × 48 pill with 44 px keys;
 *      the Music on chip is gold-tinted; the paper key has no hard ring.
 *   8. The cover gate shows only the blurred first drawing: no ghosted chrome,
 *      words or transport; Tap to Begin carries the stroked sparkles icon.
 *   9. The end card: the share code on one unbroken line; the room's dim at
 *      the reference's .5 with the privacy line still ≥ 4.5:1.
 *
 * Pixels are decoded out of real screenshots in-page (as wp-player does);
 * colours are parsed to numbers, never compared as raw CSS strings.
 */

import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { seedDeviceLibrary } from "./fixtures/helpers";

/* ─────────────────────────────────────────────────────────────── helpers */

const HOUSE_PAGE_2 =
  "Every night, she watched the world below. She saw children sleeping, parents reading stories, and cats prowling on rooftops.";

type Rgba = [number, number, number, number];

/** "rgb(1, 2, 3)" / "rgba(1, 2, 3, 0.5)" / "color(srgb …)" → numbers 0-255 (+ alpha 0-1). */
function parseColor(css: string): Rgba {
  const srgb = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/.exec(css);
  if (srgb) {
    return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, srgb[4] ? Number(srgb[4]) : 1];
  }
  const n = (css.match(/-?[\d.]+/g) ?? []).map(Number);
  return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n.length > 3 ? n[3] : 1];
}

/** Split a computed shadow list into its layers (commas inside rgb() do not split). */
function shadowLayers(css: string): string[] {
  if (!css || css === "none") return [];
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of css) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** The lengths of a shadow layer, colour removed: [x, y, blur, spread]. */
function shadowLengths(layer: string): number[] {
  return layer
    .replace(/(rgba?|color)\([^)]*\)/g, "")
    .replace("inset", "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((v) => parseFloat(v));
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
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * p)))];
}

/** Every pixel (r, g, b) of a set of rectangles, decoded out of one screenshot. */
async function pixels(
  page: Page,
  rects: Array<{ x: number; y: number; width: number; height: number }>,
): Promise<Array<Array<[number, number, number]>>> {
  const buffer = await page.screenshot();
  const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
  return page.evaluate(
    async ({ dataUrl, rects }) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      return rects.map((rect) => {
        const x = Math.max(0, Math.round(rect.x));
        const y = Math.max(0, Math.round(rect.y));
        const w = Math.max(1, Math.min(canvas.width - x, Math.round(rect.width)));
        const h = Math.max(1, Math.min(canvas.height - y, Math.round(rect.height)));
        const d = ctx.getImageData(x, y, w, h).data;
        const out: Array<[number, number, number]> = [];
        for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2]]);
        return out;
      });
    },
    { dataUrl, rects },
  );
}

/** A browser voice that speaks on demand and never ends by itself: `__boundary(i)` lights a word. */
async function stubSpeech(page: Page): Promise<void> {
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
      const u = w.__utt as FakeUtterance | null;
      u?.onboundary?.({ name: "word", charIndex });
    };
  });
}

async function tapToBegin(page: Page): Promise<void> {
  const root = page.locator(".pl-root");
  await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
  await page.getByRole("button", { name: /Tap to Begin/ }).click();
  await expect(root).toHaveAttribute("data-view", "page", { timeout: 10000 });
}

/** House tape page 2 with the voice on `word` (stubbed speech), the picture painted. */
async function housePage2(page: Page, word = "cats"): Promise<void> {
  await stubSpeech(page);
  await page.goto("/read?demo=1");
  await tapToBegin(page);
  const root = page.locator(".pl-root");
  await page.keyboard.press("ArrowRight");
  await expect(root).toHaveAttribute("data-page", "2");
  await expect(page.locator(".pl-page")).not.toHaveClass(/is-(out|in)\b/, { timeout: 5000 });
  await page.waitForFunction(
    () => ((window as unknown as { __utt: { text: string } | null }).__utt?.text ?? "").includes("Every night"),
    null,
    { timeout: 10000 },
  );
  const words = [...HOUSE_PAGE_2.matchAll(/\S+/g)];
  const at = words.findIndex((m) => m[0] === word);
  await page.evaluate(
    (i) => (window as unknown as { __boundary: (n: number) => void }).__boundary(i),
    words[at].index ?? 0,
  );
  await expect(page.locator('[data-pl="word"].is-now')).toHaveText(word);
  await page.waitForFunction(() => {
    const img = document.querySelector<HTMLImageElement>(".pl-page .pl-picture img");
    return !img || (img.complete && img.naturalWidth > 0);
  }, null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready.then(() => true));
}

/** The opacity a viewer actually sees: the product up the ancestor chain. */
async function effectiveOpacity(page: Page): Promise<number> {
  return page.evaluate(async () => {
    // a fade still pending (not yet started on a busy frame) reads as its start:
    // let every running ease up the chain land first
    const chain: Element[] = [];
    for (let e: Element | null = document.activeElement; e; e = e.parentElement) chain.push(e);
    const eases = chain.flatMap((e) => e.getAnimations());
    await Promise.race([
      Promise.all(eases.map((a) => a.finished.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    let el: Element | null = document.activeElement;
    let o = 1;
    while (el) {
      const cs = getComputedStyle(el);
      o *= Number(cs.opacity);
      if (cs.visibility === "hidden") o = 0;
      el = el.parentElement;
    }
    return o;
  });
}

/** Two agreeing snapshots ≥ 120 ms apart (the chrome fades over 320 ms). */
async function settledOpacity(page: Page): Promise<number> {
  let last = -1;
  for (let i = 0; i < 30; i++) {
    const now = await effectiveOpacity(page);
    if (Math.abs(now - last) < 0.001) return now;
    last = now;
    await page.waitForTimeout(120);
  }
  return last;
}

async function activeName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return "";
    return (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
  });
}

/* ───────────────────────────────────── 1 · 2 · keyboard and the idle chrome */

test.describe("M6 · B · the keyboard never lands on invisible chrome", () => {
  for (const vp of [
    { width: 1120, height: 700 },
    { width: 375, height: 812 },
  ]) {
    test(`${vp.width}×${vp.height} · Tab onto an idled-out chip wakes the chrome, and it stays while focused`, async ({
      page,
    }) => {
      test.setTimeout(60000);
      await page.setViewportSize(vp);
      await stubSpeech(page);
      await page.goto("/read?demo=1");
      await tapToBegin(page);
      const top = page.locator(".pl-chrome--top");
      await expect(top).toHaveClass(/is-hidden/, { timeout: 8000 });

      let found = false;
      for (let i = 0; i < 20 && !found; i++) {
        await page.keyboard.press("Tab");
        found = (await activeName(page)) === "Music on";
      }
      expect(found, "Tab reaches the Music on chip").toBe(true);
      expect(await settledOpacity(page), "the focused chip is seen").toBe(1);
      await expect(top).not.toHaveClass(/is-hidden/);

      // the idle timer does not take the chrome out from under the keyboard
      await page.waitForTimeout(4500);
      expect(await activeName(page)).toBe("Music on");
      expect(await settledOpacity(page), "still seen 4.5 s later").toBe(1);
      await expect(top).not.toHaveClass(/is-hidden/);

      // the next stops (Reading options, Close) are seen too
      for (const name of ["Reading options", "Close story"]) {
        await page.keyboard.press("Tab");
        expect(await activeName(page)).toBe(name);
        expect(await settledOpacity(page), `${name} is seen`).toBe(1);
      }
    });
  }

  test("a pointer that clicked a chip does not pin the chrome: it still idles out", async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1120, height: 700 });
    await stubSpeech(page);
    await page.goto("/read?demo=1");
    await tapToBegin(page);
    const music = page.getByRole("button", { name: /^Music (on|off)$/ });
    await music.click();
    await music.click();
    await expect(page.locator(".pl-chrome--top")).toHaveClass(/is-hidden/, { timeout: 8000 });
  });

  for (const vp of [
    { width: 1120, height: 700 },
    { width: 375, height: 812 },
  ]) {
    test(`${vp.width}×${vp.height} · one "Previous page" and one "Next page" tab stop (the transport's)`, async ({
      page,
    }) => {
      test.setTimeout(60000);
      await page.setViewportSize(vp);
      await stubSpeech(page);
      await page.goto("/read?demo=1");
      await tapToBegin(page);
      await page.keyboard.press("ArrowRight");
      await expect(page.locator(".pl-root")).toHaveAttribute("data-page", "2");

      const names: string[] = [];
      for (let i = 0; i < 24; i++) {
        await page.keyboard.press("Tab");
        const name = await activeName(page);
        if (names.length > 0 && name === names[0]) break; // wrapped round
        names.push(name);
      }
      console.log(`[m6-b] tab stops ${vp.width}: ${JSON.stringify(names)}`);
      expect(names.filter((n) => n === "Previous page")).toHaveLength(1);
      expect(names.filter((n) => n === "Next page")).toHaveLength(1);
      // the zones are still a hand's edge targets, out of the tab order and the a11y tree
      for (const zone of await page.locator(".pl-zone").all()) {
        await expect(zone).toHaveAttribute("tabindex", "-1");
        await expect(zone).toHaveAttribute("aria-hidden", "true");
      }
    });
  }
});

/* ───────────────────────────────────────────────── 3 · the read-along ink */

test.describe("M6 · B · read-along ink (s02)", () => {
  test("1120×700 · said cream, now label gold with a two-layer halo and a gold underline; HC keeps a solid underline", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1120, height: 700 });
    await housePage2(page, "cats");
    const readOnce = () =>
      page.evaluate(async () => {
        // the words' 220 ms eases have landed (a pending transition reads as its start)
        const eases = [...document.querySelectorAll('[data-pl="word"]')].flatMap((w) => w.getAnimations());
        await Promise.race([
          Promise.all(eases.map((a) => a.finished.catch(() => undefined))),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
        const past = document.querySelector('[data-pl="word"].is-past')!;
        const now = document.querySelector('[data-pl="word"].is-now')!;
        const label = getComputedStyle(document.documentElement).getPropertyValue("--ss-label").trim();
        const probe = document.createElement("span");
        probe.style.color = label;
        document.body.appendChild(probe);
        const labelRgb = getComputedStyle(probe).color;
        probe.remove();
        return {
          past: getComputedStyle(past).color,
          now: getComputedStyle(now).color,
          nowShadow: getComputedStyle(now).textShadow,
          nowBox: getComputedStyle(now).boxShadow,
          label: labelRgb,
        };
      });
    /* the 220 ms ease lands: two agreeing snapshots, 150 ms apart */
    const read = async () => {
      let last = "";
      for (let i = 0; i < 40; i++) {
        const now = await readOnce();
        const key = JSON.stringify(now);
        if (key === last) return now;
        last = key;
        await page.waitForTimeout(150);
      }
      throw new Error(`read-along ink never settled: ${last}`);
    };
    const ink = await read();
    console.log("[m6-b] ink:", JSON.stringify(ink));
    const past = parseColor(ink.past);
    const now = parseColor(ink.now);
    const label = parseColor(ink.label);
    [243, 230, 200].forEach((v, i) => expect(Math.abs(past[i] - v), `said channel ${i}`).toBeLessThanOrEqual(3));
    [255, 201, 60].forEach((v, i) => expect(Math.abs(now[i] - v), `now channel ${i}`).toBeLessThanOrEqual(3));
    label.slice(0, 3).forEach((v, i) => expect(Math.abs(now[i] - v), `now is --ss-label (${i})`).toBeLessThanOrEqual(3));
    expect(shadowLayers(ink.nowShadow), "a two-layer halo").toHaveLength(2);
    const underline = shadowLayers(ink.nowBox);
    expect(underline, "an underline").toHaveLength(1);
    expect(underline[0]).toContain("inset");
    const [ux, uy] = shadowLengths(underline[0]);
    expect(ux).toBe(0);
    expect(uy, "drawn at the foot of the word").toBeLessThan(0);

    // high contrast: said pure white, the now word keeps a solid underline, no glow
    await page.getByRole("button", { name: "Reading options" }).click();
    await page.getByRole("switch", { name: /High contrast/ }).click();
    await page.keyboard.press("Escape");
    await expect(page.locator(".pl-root")).toHaveClass(/\bis-hc\b/);
    const hc = await read();
    const hcPast = parseColor(hc.past);
    [255, 255, 255].forEach((v, i) => expect(Math.abs(hcPast[i] - v)).toBeLessThanOrEqual(1));
    expect(shadowLayers(hc.nowShadow)).toHaveLength(0);
    const hcLine = shadowLayers(hc.nowBox);
    expect(hcLine).toHaveLength(1);
    expect(hcLine[0]).toContain("inset");
    const lineColor = /(rgba?|color)\([^)]*\)/.exec(hcLine[0])?.[0] ?? "";
    console.log("[m6-b] hc ink:", JSON.stringify(hc));
    expect(parseColor(lineColor)[3], "a solid underline").toBeGreaterThanOrEqual(0.99);
  });
});

/* ──────────────────────────────── 4 · words not yet spoken, legible on a phone */

test.describe("M6 · B · not-yet-spoken words clear 4.5:1 on a phone", () => {
  for (const vp of [
    { width: 375, height: 812 },
    { width: 390, height: 844 },
  ]) {
    test(`${vp.width}×${vp.height} · house tape page 2 mid-sentence: the dim words measure ≥ 4.5:1 (p25)`, async ({
      page,
    }) => {
      test.setTimeout(60000);
      await page.setViewportSize(vp);
      await housePage2(page, "children");
      await page.waitForTimeout(1200); // backdrop crossfade and colour ease land
      const future = page.locator('[data-pl="word"].is-future');
      expect(await future.count()).toBeGreaterThan(5);
      const info = await page.evaluate(() => {
        const els = [...document.querySelectorAll<HTMLElement>('[data-pl="word"].is-future')];
        return {
          color: getComputedStyle(els[0]).color,
          size: parseFloat(getComputedStyle(els[0]).fontSize),
          rects: els.flatMap((el) =>
            [...el.getClientRects()].map((r) => ({ x: r.x, y: r.y + 2, width: r.width, height: r.height - 4 })),
          ),
        };
      });
      expect(info.size, "phone prose is not large text").toBeLessThan(24);
      // the background behind the dim words: the glyphs made transparent for one frame
      await page.addStyleTag({ content: '[data-pl="word"].is-future{color:transparent!important;transition:none!important}' });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const bg = (await pixels(page, info.rects)).flat();
      const [r, g, b, a] = parseColor(info.color);
      const ratios = bg.map(([br, bgc, bb]) => {
        const glyph = lum(r * a + br * (1 - a), g * a + bgc * (1 - a), b * a + bb * (1 - a));
        return ratio(glyph, lum(br, bgc, bb));
      });
      const p25 = percentile(ratios, 0.25);
      console.log(`[m6-b] future words ${vp.width}: ${info.color} p25 ${p25.toFixed(2)}:1 over ${ratios.length} px`);
      expect(p25).toBeGreaterThanOrEqual(4.5);
    });
  }
});

/* ───────────────────────────────── 5 · 6 · the phone full-bleed page */

test.describe("M6 · B · the phone full-bleed page", () => {
  test("768×1024 · the scrim's blur fades in with the gradient: no hard seam, no sharp side strips", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 768, height: 1024 });
    await housePage2(page, "cats");
    await expect(page.locator(".pl-page.is-full")).toHaveCount(1);
    await expect(page.locator(".pl-page.is-portrait-fit")).toHaveCount(0);
    await page.waitForTimeout(1200);
    const text = page.locator('[data-pl="text"]');
    const layer = await text.evaluate((el) => {
      const cs = getComputedStyle(el, "::before");
      const own = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        blur: cs.backdropFilter || (cs as unknown as Record<string, string>).webkitBackdropFilter || "",
        mask: cs.maskImage || (cs as unknown as Record<string, string>).webkitMaskImage || "none",
        ownBlur: own.backdropFilter || "none",
        top: r.top,
        width: window.innerWidth,
      };
    });
    expect(layer.blur).toContain("blur");
    expect(layer.mask).not.toBe("none");
    expect(layer.ownBlur, "the box itself does not blur from its hard top edge").toBe("none");

    // the art's sharpness, row by row through the top of the scrim: it falls
    // away over many rows, never in one step
    const band = 140;
    const [rows] = await pixels(page, [{ x: 0, y: layer.top - 20, width: layer.width, height: band }]);
    const w = Math.round(layer.width);
    const sharp: number[] = [];
    for (let y = 0; y < band; y++) {
      let sum = 0;
      for (let x = 24; x < w - 25; x++) {
        const p = rows[y * w + x];
        const q = rows[y * w + x + 1];
        sum += Math.abs(lum(...p) - lum(...q));
      }
      sharp.push(sum / (w - 49));
    }
    const peak = Math.max(...sharp.slice(0, 30));
    const steps = sharp.slice(1).map((s, i) => sharp[i] - s);
    const worst = Math.max(...steps);
    console.log(`[m6-b] scrim sharpness peak ${peak.toFixed(4)}, worst one-row drop ${worst.toFixed(4)}`);
    expect(worst, "no single-row seam").toBeLessThan(peak * 0.35);

    // the edge strips: the outer 8 px are as soft as the band inside them
    const [edges] = await pixels(page, [{ x: 0, y: layer.top + 160, width: layer.width, height: 40 }]);
    const edgeSharp = (x0: number, x1: number) => {
      let sum = 0;
      let n = 0;
      for (let y = 0; y < 40; y++) {
        for (let x = x0; x < x1; x++) {
          sum += Math.abs(lum(...edges[y * w + x]) - lum(...edges[y * w + x + 1]));
          n++;
        }
      }
      return sum / n;
    };
    const inner = edgeSharp(40, w - 41);
    const left = edgeSharp(0, 8);
    const right = edgeSharp(w - 9, w - 1);
    console.log(`[m6-b] scrim edges: left ${left.toFixed(4)} inner ${inner.toFixed(4)} right ${right.toFixed(4)}`);
    expect(left).toBeLessThanOrEqual(inner * 2 + 0.002);
    expect(right).toBeLessThanOrEqual(inner * 2 + 0.002);
  });

  test("375×812 · a square picture fits the width from the top instead of halving the star", async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 375, height: 812 });
    await housePage2(page, "cats");
    await expect(page.locator(".pl-page.is-full.is-portrait-fit")).toHaveCount(1);
    const fit = await page.locator(".pl-page.is-full .pl-picture img").evaluate((img) => {
      const el = img as HTMLImageElement;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      // the drawn picture's box inside the element (object-fit: contain, top)
      const scale = Math.min(r.width / el.naturalWidth, r.height / el.naturalHeight);
      const drawnW = el.naturalWidth * scale;
      const drawnX = r.x + (r.width - drawnW) / 2;
      return { fit: cs.objectFit, drawnX, drawnW, vw: window.innerWidth, top: r.y };
    });
    expect(fit.fit).toBe("contain");
    expect(fit.drawnX).toBeGreaterThanOrEqual(-0.5);
    expect(fit.drawnX + fit.drawnW).toBeLessThanOrEqual(fit.vw + 0.5);
    expect(fit.drawnW / fit.vw, "the whole width of the picture shows").toBeGreaterThanOrEqual(0.95);
  });

  test("1024×1366 · a portrait tablet keeps the full-bleed cover (the crop is mild)", async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1024, height: 1366 });
    await housePage2(page, "cats");
    await expect(page.locator(".pl-page.is-full")).toHaveCount(1);
    await expect(page.locator(".pl-page.is-portrait-fit")).toHaveCount(0);
    expect(
      await page.locator(".pl-page.is-full .pl-picture img").evaluate((el) => getComputedStyle(el).objectFit),
    ).toBe("cover");
  });
});

/* ──────────────────────────────────────── 7 · the spread's transport and chip */

test.describe("M6 · B · the spread transport and the Music on chip (s02)", () => {
  test("1120×700 · a 200 × 48 pill; every key a 44 px target; Music on tinted gold; no hard ring on the paper key", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1120, height: 700 });
    await housePage2(page, "cats");
    await page.mouse.move(560, 300);
    await expect(page.locator(".pl-chrome--bottom")).not.toHaveClass(/is-hidden/);
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const pill = document.querySelector(".pl-transport")!.getBoundingClientRect();
      const keys = [...document.querySelectorAll<HTMLElement>(".pl-transport .sk-transport")].map((btn) => {
        const r = btn.getBoundingClientRect();
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        const hits = [
          [cx - 21, cy],
          [cx + 21, cy],
          [cx, cy - 21],
          [cx, cy + 21],
        ].map(([x, y]) => document.elementFromPoint(x, y)?.closest("button") === btn);
        return { label: btn.getAttribute("aria-label"), w: r.width, hits, shadow: getComputedStyle(btn).boxShadow, active: btn.classList.contains("is-active") };
      });
      const music = [...document.querySelectorAll<HTMLElement>(".pl-chip")].find(
        (b) => b.getAttribute("aria-label") === "Music on",
      )!;
      return { pill: { w: pill.width, h: pill.height }, keys, musicBg: getComputedStyle(music).backgroundColor };
    });
    console.log("[m6-b] transport:", JSON.stringify(m));
    expect(Math.abs(m.pill.w - 200)).toBeLessThanOrEqual(2);
    expect(Math.abs(m.pill.h - 48)).toBeLessThanOrEqual(2);
    expect(m.keys).toHaveLength(3);
    for (const key of m.keys) {
      expect(key.hits, `${key.label}: a 44 px target`).toEqual([true, true, true, true]);
    }
    // the reference's discs: 32 · 40 · 32
    expect(m.keys.map((k) => Math.round(k.w))).toEqual([32, 40, 32]);

    const [r, , b, a] = parseColor(m.musicBg);
    expect(r, "gold-tinted, not navy").toBeGreaterThan(b);
    expect(a).toBeGreaterThanOrEqual(0.12);

    const active = m.keys.find((k) => k.active);
    expect(active, "the paper key is lit while the voice speaks").toBeTruthy();
    for (const layer of shadowLayers(active!.shadow)) {
      const [x, y, blur, spread] = shadowLengths(layer);
      const ring = x === 0 && y === 0 && (blur ?? 0) === 0 && (spread ?? 0) > 0;
      expect(ring, `no hard ring layer: ${layer}`).toBe(false);
    }
  });
});

/* ──────────────────────────────────────────────────── 8 · the cover gate */

test.describe("M6 · B · the cover gate (s05)", () => {
  test("390×844 · only the blurred first drawing glows through: no ghosted chrome, words or transport; stroked sparkles", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 390, height: 844 });
    const code = randomBytes(16).toString("hex");
    await seedDeviceLibrary(page, "twinkle", { shareCode: code });
    await page.goto(`/read?story=${code}`);
    const root = page.locator(".pl-root");
    await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });

    for (const sel of [".pl-chrome--top", ".pl-chrome--bottom", ".pl-deck", '.pl-page [data-pl="text"]', ".pl-progress"]) {
      await expect(page.locator(sel).first(), `${sel} under the gate`).toBeHidden();
    }
    await expect(page.getByRole("button", { name: "Reading options" })).toBeHidden();
    // M6 wave B (deliberate change): the blur ≥ 20px now lives on the gate's
    // own copy of the first drawing ([data-pl="cover-room"]), blurred once,
    // instead of a backdrop-filter re-blurring the room's already-blurred copy.
    const blur = await page
      .locator('[data-pl="cover-room"] img')
      .evaluate((el) => getComputedStyle(el).filter);
    const px = Number(/blur\(([\d.]+)px\)/.exec(blur)?.[1] ?? 0);
    expect(px, `gate drawing blur ${blur}`).toBeGreaterThanOrEqual(20);

    const begin = page.getByRole("button", { name: /Tap to Begin/ });
    await expect(begin.locator("svg.lucide-sparkles")).toHaveCount(1);
    expect(await begin.textContent()).not.toContain("✨");

    // keyboard: Tab from the top reaches the gate's own button, never a hidden chrome control
    let reached = false;
    for (let i = 0; i < 8 && !reached; i++) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return !!el?.closest(".pl-chrome, .pl-deck, .pl-zone, .pl-progress, .pl-page");
      });
      expect(where, "focus never lands under the gate").toBe(false);
      reached = (await activeName(page)) === "Tap to Begin";
    }
    expect(reached, "Tab reaches Tap to Begin").toBe(true);
    await page.keyboard.press("Enter");
    await expect(root).toHaveAttribute("data-view", "page", { timeout: 10000 });
    await expect(page.locator(".pl-chrome--top")).toBeVisible();
    await expect(page.getByRole("group", { name: "Now playing" })).toBeVisible();
  });
});

/* ───────────────────────────────────────────────────────── 9 · the end card */

async function twinkleEnd(page: Page): Promise<string> {
  const code = randomBytes(16).toString("hex");
  await seedDeviceLibrary(page, "twinkle", { shareCode: code });
  await page.goto(`/read?story=${code}`);
  await tapToBegin(page);
  const root = page.locator(".pl-root");
  for (let i = 0; i < 12; i++) {
    if ((await root.getAttribute("data-view")) === "end") break;
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(320);
  }
  await expect(root).toHaveAttribute("data-view", "end");
  await expect(page.locator('[data-pl="qr"]')).toBeVisible({ timeout: 10000 });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  return code;
}

test.describe("M6 · B · the end card (s06)", () => {
  for (const vp of [
    { width: 390, height: 844 },
    { width: 375, height: 812 },
  ]) {
    test(`${vp.width}×${vp.height} · the share code sits whole on one line, ≥ 12 px clear of the row's edge`, async ({
      page,
    }) => {
      test.setTimeout(60000);
      await page.setViewportSize(vp);
      await twinkleEnd(page);
      const url = page.locator(".pl-qr-url");
      expect((await url.innerText()).trim()).toBe(page.url());
      expect(await url.textContent()).toBe(page.url());
      const g = await page.evaluate(() => {
        const code = document.querySelector('[data-pl="qr-code"]')!;
        const copy = document.querySelector(".pl-qr-url")!;
        const cr = copy.getBoundingClientRect();
        const cs = getComputedStyle(copy);
        const rects = [...code.getClientRects()];
        return {
          lines: rects.length,
          right: Math.max(...rects.map((r) => r.right)),
          inner: cr.right - parseFloat(cs.paddingRight),
          text: code.textContent,
        };
      });
      console.log(`[m6-b] qr code ${vp.width}:`, JSON.stringify(g));
      expect(g.text).toMatch(/^[0-9a-f]{32}$/);
      expect(g.lines).toBe(1);
      expect(g.right).toBeLessThanOrEqual(g.inner - 12);
    });
  }

  test("390×844 · the room's dim is the reference's .5, and the privacy line still clears 4.5:1", async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 390, height: 844 });
    await twinkleEnd(page);
    const end = page.locator('[data-pl="end"]');
    const alpha = parseColor(await end.evaluate((el) => getComputedStyle(el).backgroundColor))[3];
    expect(Math.abs(alpha - 0.5)).toBeLessThanOrEqual(0.02);
    await page.waitForTimeout(800); // the rise lands
    const privacy = page.locator(".pl-end-privacy");
    await privacy.scrollIntoViewIfNeeded();
    const info = await privacy.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { color: getComputedStyle(el).color, x: r.x, y: r.y, width: r.width, height: r.height };
    });
    await page.addStyleTag({ content: ".pl-end-privacy{color:transparent!important}" });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const [bg] = await pixels(page, [info]);
    const [r, g, b] = parseColor(info.color);
    const text = lum(r, g, b);
    const worst = percentile(
      bg.map(([br, bgc, bb]) => ratio(text, lum(br, bgc, bb))),
      0.05,
    );
    console.log(`[m6-b] privacy line ${info.color}: p5 ${worst.toFixed(2)}:1`);
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });
});

/* ─────────────────────── wave B · the portrait-fit band reads as the page */

test.describe("M6 wave B · s02 phone portrait-fit: under the picture's foot, the page's colours, not fog", () => {
  for (const vp of [
    { width: 375, height: 812 },
    { width: 390, height: 844 },
  ]) {
    test(`${vp.width}×${vp.height} · the band below the faded foot carries the drawing (texture and hue), decoration only`, async ({
      page,
    }) => {
      test.setTimeout(60000);
      await page.setViewportSize(vp);
      await housePage2(page, "cats");
      await expect(page.locator(".pl-page.is-full.is-portrait-fit")).toHaveCount(1);
      await page.waitForTimeout(1200); // the page-in and the room's crossfade land

      const geo = await page.evaluate(() => {
        const img = document.querySelector<HTMLImageElement>(".pl-page.is-full .pl-picture img")!;
        const r = img.getBoundingClientRect();
        const scale = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
        return { foot: r.top + img.naturalHeight * scale, w: window.innerWidth };
      });
      const [pic, band] = await pixels(page, [
        { x: 0, y: geo.foot - 96, width: geo.w, height: 28 }, // the picture's last unfaded rows
        { x: 0, y: geo.foot + 8, width: geo.w, height: 72 }, // the band under its foot
      ]);
      const w = Math.round(geo.w);
      // texture: how much the band varies from column to column (a fog is flat)
      const rows = band.length / w;
      const cols: number[] = [];
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let y = 0; y < rows; y++) sum += lum(...band[y * w + x]);
        cols.push(sum / rows);
      }
      const mean = cols.reduce((a, b) => a + b, 0) / cols.length;
      const sd = Math.sqrt(cols.reduce((a, b) => a + (b - mean) ** 2, 0) / cols.length);
      // hue: the band's blue-over-red cast against the picture's own
      const cast = (px: Array<[number, number, number]>) =>
        px.reduce((a, [r, , b]) => a + (b - r), 0) / px.length;
      const drift = Math.abs(cast(band) - cast(pic));
      console.log(`[m6-wb] ${vp.width} band column sd ${sd.toFixed(4)}, hue drift ${drift.toFixed(1)}`);
      // was a flat blue-grey haze: sd ≈ 0.021 (relative luminance), drift ≈ 24;
      // with the drawing carried on: sd ≈ 0.051, drift ≈ 6-8
      expect(sd, "the band carries the drawing's variation").toBeGreaterThanOrEqual(0.035);
      expect(drift, "the band keeps the drawing's hue").toBeLessThanOrEqual(15);

      // decoration only: hidden from assistive tech, gone in high contrast
      const foot = page.locator('[data-pl="picture-foot"]');
      await expect(foot).toHaveAttribute("aria-hidden", "true");
      await expect(foot).toHaveAttribute("alt", "");
      await page.mouse.move(vp.width / 2, vp.height / 3); // wake the idled chrome
      await page.getByRole("button", { name: "Reading options" }).click();
      await page.getByRole("switch", { name: /High contrast/ }).click();
      await page.keyboard.press("Escape");
      await expect(page.locator(".pl-root")).toHaveClass(/\bis-hc\b/);
      await expect(foot).toBeHidden();
    });
  }

  test("768×1024 · no foot where the picture is not fitted", async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 768, height: 1024 });
    await housePage2(page, "cats");
    await expect(page.locator(".pl-page.is-portrait-fit")).toHaveCount(0);
    await expect(page.locator('[data-pl="picture-foot"]')).toHaveCount(0);
  });
});

/* ───────────── wave B · the awake transport never covers the last prose line */

const HOUSE_PAGES = (
  JSON.parse(readFileSync(join(__dirname, "..", "public", "demo", "brave-little-star.ssync.json"), "utf8")) as {
    pages: unknown[];
  }
).pages.length;

test.describe("M6 wave B · s02 small phones: the awake transport clears the words", () => {
  for (const vp of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 414, height: 736 },
    { width: 375, height: 812 },
  ]) {
    test(`${vp.width}×${vp.height} · every page of the house tape: the last line ends ≥ 8px above the transport`, async ({
      page,
    }) => {
      test.setTimeout(90000);
      await page.setViewportSize(vp);
      await stubSpeech(page);
      await page.goto("/read?demo=1");
      await tapToBegin(page);
      await page.evaluate(() => document.fonts.ready.then(() => true));
      const root = page.locator(".pl-root");
      const total = HOUSE_PAGES;
      for (let n = 1; n <= total; n++) {
        if (n > 1) await page.keyboard.press("ArrowRight");
        await expect(root).toHaveAttribute("data-page", String(n));
        await expect(page.locator(".pl-page")).not.toHaveClass(/is-(out|in)\b/, { timeout: 5000 });
        // wake the chrome (a pointer move), then read in one frame; a text
        // region that scrolls is read at its end, where its last line rests
        await page.mouse.move(vp.width / 2 + n, vp.height / 3);
        await expect(page.locator(".pl-chrome--bottom")).not.toHaveClass(/is-hidden/);
        const r = await page.evaluate(() => {
          const text = document.querySelector<HTMLElement>('.pl-page [data-pl="text"]');
          const prose = text?.querySelector(".pl-prose");
          if (!text || !prose) return null;
          text.scrollTop = text.scrollHeight;
          const range = document.createRange();
          range.selectNodeContents(prose);
          const last = Math.max(...[...range.getClientRects()].map((q) => q.bottom));
          const transport = document.querySelector(".pl-transport")!.getBoundingClientRect();
          return { last, transportTop: transport.top };
        });
        if (!r) continue; // a picture-only page
        expect(r.last, `page ${n}: last line ${r.last} vs transport ${r.transportTop}`).toBeLessThanOrEqual(
          r.transportTop - 8,
        );
      }
    });
  }
});

/* ──────────────── wave B · the cover gate: the drawing blurred once, not mud */

test.describe("M6 wave B · s05 the cover gate is the first drawing, blurred once and dimmed", () => {
  test("390×844 · one blur (≈22px), brightness ≈ .5, no stacked backdrop blur; the foot not crushed; the note at AA", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 390, height: 844 });
    const code = randomBytes(16).toString("hex");
    await seedDeviceLibrary(page, "twinkle", { shareCode: code });
    await page.goto(`/read?story=${code}`);
    await expect(page.locator(".pl-root")).toHaveAttribute("data-view", "cover", { timeout: 20000 });
    const art = page.locator('[data-pl="cover-room"] img');
    await expect(art).toHaveCount(1);
    await expect(page.locator('[data-pl="cover-room"]')).toHaveAttribute("aria-hidden", "true");
    await art.evaluate((el) => (el as HTMLImageElement).decode().catch(() => undefined));
    await page.waitForTimeout(900); // the gate's own entrance lands

    const f = await page.evaluate(() => {
      const img = document.querySelector('[data-pl="cover-room"] img')!;
      const cover = document.querySelector(".pl-cover")!;
      const filter = getComputedStyle(img).filter;
      const num = (re: RegExp) => Number(re.exec(filter)?.[1] ?? NaN);
      const cs = getComputedStyle(cover);
      const backdrop = cs.backdropFilter || (cs as unknown as Record<string, string>).webkitBackdropFilter || "none";
      return { blur: num(/blur\(([\d.]+)px\)/), brightness: num(/brightness\(([\d.]+)\)/), backdrop };
    });
    // s05's .g-bg: blur(22px) brightness(0.5)
    expect(f.blur).toBeGreaterThanOrEqual(20);
    expect(f.blur).toBeLessThanOrEqual(28);
    expect(f.brightness).toBeGreaterThanOrEqual(0.4);
    expect(f.brightness).toBeLessThanOrEqual(0.6);
    expect(f.backdrop.includes("blur"), `no second blur stacked on the room: ${f.backdrop}`).toBe(false);

    // pixels: the gate's top and foot strips (clear of the cassette and the
    // button). Was 50 → 23 (8-bit mean): a crushed, muddy foot. s05 keeps its
    // foot at ~.8 of its top.
    const [top, foot] = await pixels(page, [
      { x: 0, y: 0, width: 390, height: 40 },
      { x: 60, y: 800, width: 330, height: 40 },
    ]);
    const mean = (px: Array<[number, number, number]>) => px.reduce((a, [r, g, b]) => a + (r + g + b) / 3, 0) / px.length;
    const ratioFootTop = mean(foot) / mean(top);
    console.log(`[m6-wb] gate top ${mean(top).toFixed(1)} foot ${mean(foot).toFixed(1)}`);
    expect(ratioFootTop, "the foot of the gate is not crushed to black").toBeGreaterThanOrEqual(0.55);
    expect(mean(top), "dimmed, not bright").toBeLessThanOrEqual(110);

    // the note under the button reads at AA on the light behind it
    const note = page.locator(".pl-cover-note");
    const box = (await note.boundingBox())!;
    const color = parseColor(await note.evaluate((el) => getComputedStyle(el).color));
    const [behind] = await pixels(page, [{ x: box.x, y: box.y + box.height + 4, width: box.width, height: 8 }]);
    const bg = behind.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map((v) => v / behind.length);
    const ink = [0, 1, 2].map((i) => color[i] * color[3] + bg[i] * (1 - color[3]));
    const cr = ratio(lum(ink[0], ink[1], ink[2]), lum(bg[0], bg[1], bg[2]));
    expect(cr, `note contrast ${cr.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
  });

  test("high contrast: the gate drops the drawing and keeps its plain dim", async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 390, height: 844 });
    const code = randomBytes(16).toString("hex");
    await seedDeviceLibrary(page, "twinkle", { shareCode: code });
    // the viewer's stored choice (prefs.ts: ssync-reader-prefs, v2)
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("ssync-reader-prefs", JSON.stringify({ v: 2, contrast: true }));
      } catch {}
    });
    await page.goto(`/read?story=${code}`);
    const root = page.locator(".pl-root");
    await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
    await expect(root).toHaveClass(/\bis-hc\b/);
    await expect(page.locator('[data-pl="cover-room"]')).toBeHidden();
    const bgImage = await page.locator(".pl-cover").evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bgImage).toContain("gradient");
  });
});
