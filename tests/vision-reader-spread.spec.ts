/**
 * T08 · The desktop two-page spread (s02, brief screens[1]).
 *
 * At ≥ 1024 px wide AND landscape, a page with a picture and words opens as a
 * book: the picture on the left page (art-dominant, ~560/1000 of the spread),
 * the words on a sheer right page under a mono "PAGE n · MOOD" kicker. Below
 * the breakpoint the shipped phone/tablet layouts stay exactly as they are.
 *
 * Everything is measured on the running app at explicit viewports: bounding
 * boxes for the geometry, computed styles for the type, and pixels decoded out
 * of real screenshots for contrast (the same method as wp-player/critic-player).
 */

import { expect, test, type Page } from "@playwright/test";
import { PREFS_KEY } from "../src/components/player/prefs";
import { splitWords } from "../src/components/player/timing";
import { WHITE_ART_CODE, WIDE_ART_CODE, seedReaderTapes, t08Rows } from "./fixtures/reader-tapes";
import { evidencePath } from "./fixtures/evidence";

const KEY_HINT = "← → turn · space pause · P music · esc close";
/** House tape page 2, as the reference prints it (s02). */
const PAGE_2_WORDS =
  "Every night, she watched the world below. She saw children sleeping, parents reading stories, and cats prowling on rooftops.";

/* ─────────────────────────────────────────────────────────────── helpers */

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Open a tape, pass the cover gate, and (optionally) turn to page `n`. */
async function open(page: Page, url: string, n = 1): Promise<void> {
  await page.goto(url);
  const root = page.locator(".pl-root");
  await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
  await page.getByRole("button", { name: /Tap to Begin/i }).click();
  await expect(root).toHaveAttribute("data-view", "page");
  for (let i = 1; i < n; i++) {
    await page.keyboard.press("ArrowRight");
    await expect(root).toHaveAttribute("data-page", String(i + 1));
  }
  // the turn has settled and the picture (if any) is painted
  await expect(page.locator(".pl-page")).not.toHaveClass(/is-(out|in)\b/, { timeout: 5000 });
  await page.waitForFunction(() => {
    const img = document.querySelector<HTMLImageElement>(".pl-page .pl-picture img");
    return !img || (img.complete && img.naturalWidth > 0);
  }, null, { timeout: 20000 });
}

/** Bounding boxes of everything the spread must sit among. */
async function layout(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const img = document.querySelector<HTMLImageElement>('[data-pl="art"] img');
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      spread: box(document.querySelector('[data-pl="spread"]')),
      art: box(document.querySelector('[data-pl="art"]')),
      img: box(img),
      imgFit: img ? getComputedStyle(img).objectFit : null,
      natural: img ? { w: img.naturalWidth, h: img.naturalHeight } : null,
      text: box(document.querySelector('[data-pl="text"]')),
      deck: box(document.querySelector(".pl-deck")),
      chips: Array.from(document.querySelectorAll(".pl-chrome--top button")).map((b) => box(b)!),
      transport: box(document.querySelector(".pl-transport")),
    };
  });
}

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The geometry rules every spread viewport shares (s02: 560/1000, centred, clear of the chrome). */
async function expectBookGeometry(page: Page, label: string): Promise<void> {
  const g = await layout(page);
  console.log(`[t08] ${label}:`, JSON.stringify(g));
  expect(g.spread, `${label}: no [data-pl="spread"]`).not.toBeNull();
  expect(g.art, `${label}: no [data-pl="art"]`).not.toBeNull();
  expect(g.text, `${label}: no [data-pl="text"]`).not.toBeNull();
  const spread = g.spread!;
  const art = g.art!;
  const text = g.text!;
  const img = g.img!;

  // art on the left, words on the right, touching at the spine
  expect(art.x + art.w, `${label}: art is not left of the text`).toBeLessThanOrEqual(text.x + 2);
  expect(Math.abs(text.x - (art.x + art.w)), `${label}: gap at the spine`).toBeLessThanOrEqual(2);
  expect(Math.abs(text.y - art.y), `${label}: pages not top-aligned`).toBeLessThanOrEqual(2);
  expect(Math.abs(text.h - art.h), `${label}: the text page is not the art's height`).toBeLessThanOrEqual(2);

  // art-dominant: the reference's 560 of 1000
  const share = art.w / spread.w;
  expect(share, `${label}: art share ${share.toFixed(3)}`).toBeGreaterThanOrEqual(0.54);
  expect(share, `${label}: art share ${share.toFixed(3)}`).toBeLessThanOrEqual(0.58);

  // a square picture renders square, uncropped, unstretched
  expect(g.natural!.w).toBe(g.natural!.h);
  expect(Math.abs(img.w - img.h), `${label}: square art is ${img.w}×${img.h}`).toBeLessThanOrEqual(2);
  expect(g.imgFit).toBe("contain");

  // centred, and big: the page is the point of the room
  const centre = spread.x + spread.w / 2;
  expect(Math.abs(centre - g.vw / 2), `${label}: spread off-centre`).toBeLessThanOrEqual(4);
  expect(spread.h, `${label}: spread is ${spread.h}px of ${g.vh}`).toBeGreaterThanOrEqual(0.75 * g.vh);
  expect(spread.x, `${label}: spread runs off the left edge`).toBeGreaterThanOrEqual(0);
  expect(spread.x + spread.w, `${label}: spread runs off the right edge`).toBeLessThanOrEqual(g.vw);

  // never under the chrome
  expect(intersects(spread, g.deck!), `${label}: spread under the deck chip`).toBe(false);
  for (const chip of g.chips) {
    expect(intersects(spread, chip), `${label}: spread under a top chip`).toBe(false);
  }
  expect(intersects(spread, g.transport!), `${label}: spread under the transport pill`).toBe(false);
}

/* ─────────────────────────────────────── 1 · the open book at 1120 × 700 */

test.describe("T08 · the open book (desktop)", () => {
  test("1120×700 · house tape page 2 is a spread: art left, sheer text right, PAGE 2 · WONDER", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1120, height: 700 });
    await open(page, "/read?demo=1", 2);

    await expect(page.locator(".pl-page.is-spread")).toHaveCount(1);
    await expect(page.locator(".pl-page.is-full")).toHaveCount(0);
    const text = page.locator('[data-pl="text"]');
    await expect(text.locator('[data-pl="prose"]')).toHaveCount(1);
    await expect(text.locator('[data-pl="kicker"]')).toHaveText("PAGE 2 · WONDER");
    await expect(text.locator('[data-pl="prose"]')).toContainText(PAGE_2_WORDS);

    // the kicker is the mono 11px line of the reference
    const kicker = await text.locator('[data-pl="kicker"]').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { family: cs.fontFamily, size: parseFloat(cs.fontSize) };
    });
    expect(kicker.family.toLowerCase()).toMatch(/plex mono|mono/);
    expect(kicker.size).toBeCloseTo(11, 0);

    // the right page is sheer Register A: translucent dark fill, blur, 1px line, radius 14
    const sheer = await text.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        image: cs.backgroundImage,
        filter: cs.backdropFilter || (cs as unknown as Record<string, string>).webkitBackdropFilter,
        border: cs.borderTopWidth,
        radius: cs.borderTopRightRadius,
      };
    });
    expect(sheer.image).toMatch(/rgba\(10, 14, 26, 0\.\d+\)/);
    expect(sheer.filter).toContain("blur(");
    expect(sheer.border).toBe("1px");
    expect(sheer.radius).toBe("14px");

    await expectBookGeometry(page, "1120x700 page 2");
    await page.screenshot({ path: evidencePath("vision-reader-spread-1120x700.png", { dir: "tests/screenshots" }) });
  });

  for (const vp of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 2560, height: 1080 },
  ]) {
    test(`${vp.width}×${vp.height} · the same book rules hold, centred and capped`, async ({ page }) => {
      test.setTimeout(90000);
      await page.setViewportSize(vp);
      await open(page, "/read?demo=1", 2);
      await expect(page.locator(".pl-page.is-spread")).toHaveCount(1);
      await expect(page.locator(".pl-page.is-full")).toHaveCount(0);
      await expectBookGeometry(page, `${vp.width}x${vp.height} page 2`);
      // a sensible maximum: the book never sprawls across an ultrawide, and
      // it keeps the reference's 60px of room either side
      const spread = (await layout(page)).spread!;
      expect(spread.h).toBeLessThanOrEqual(900);
      expect(spread.x).toBeGreaterThanOrEqual(58);
      expect(spread.x + spread.w).toBeLessThanOrEqual(vp.width - 58);
    });
  }

  test("every picture-and-words layout opens as a spread (illustration-top, illustration-full, full)", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await seedReaderTapes(page, t08Rows());
    // house tape page 1 is illustration-top
    await open(page, "/read?demo=1");
    await expect(page.locator(".pl-page.is-spread")).toHaveCount(1);
    await expect(page.locator('[data-pl="kicker"]')).toHaveText("PAGE 1 · WONDER");
    // the white tape: page 1 illustration-full with no music, page 2 "full" with Hush
    await open(page, `/read?story=${WHITE_ART_CODE}`);
    await expect(page.locator(".pl-page.is-spread")).toHaveCount(1);
    await expect(page.locator('[data-pl="kicker"]')).toHaveText("PAGE 1");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".pl-root")).toHaveAttribute("data-page", "2");
    await expect(page.locator(".pl-page.is-spread")).toHaveCount(1);
    await expect(page.locator(".pl-page.is-full")).toHaveCount(0);
    await expect(page.locator('[data-pl="kicker"]')).toHaveText("PAGE 2 · HUSH");
  });
});

/* ─────────────────────────────── 2 · below the breakpoint nothing changes */

test.describe("T08 · phones and portrait tablets keep the shipped layouts", () => {
  for (const vp of [
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 1024, height: 1366 },
  ]) {
    test(`${vp.width}×${vp.height} · page 2 is full-bleed with the measured scrim, no spread`, async ({
      page,
    }) => {
      test.setTimeout(90000);
      await page.setViewportSize(vp);
      await open(page, "/read?demo=1", 2);
      await expect(page.locator(".pl-page.is-full")).toHaveCount(1);
      await expect(page.locator(".is-spread")).toHaveCount(0);
      await expect(page.locator('[data-pl="spread"]')).toHaveCount(0);
      await expect(page.locator('[data-pl="kicker"]')).toHaveCount(0);
      await expect(page.locator('[data-pl="keys"]')).toHaveCount(0);
      const scrim = await page
        .locator('[data-pl="text"]')
        .evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(scrim).toContain("linear-gradient");
    });
  }
});

/* ───────────────────────────────────────── 3 · the words on the right page */

test.describe("T08 · the story voice on a book page", () => {
  test("1120×700 · Fraunces at 24–28 px, a 28–40 ch measure, read-along unchanged", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1120, height: 700 });
    await open(page, "/read?demo=1", 2);
    const prose = await page.locator('[data-pl="prose"]').evaluate((el) => {
      const cs = getComputedStyle(el);
      const probe = document.createElement("span");
      probe.style.font = cs.font;
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.whiteSpace = "pre";
      probe.textContent = "0".repeat(100);
      el.appendChild(probe);
      const ch = probe.getBoundingClientRect().width / 100;
      probe.remove();
      return {
        family: cs.fontFamily,
        size: parseFloat(cs.fontSize),
        maxWidth: parseFloat(cs.maxWidth),
        rendered: el.getBoundingClientRect().width,
        ch,
        words: el.querySelectorAll('[data-pl="word"].pl-word').length,
      };
    });
    console.log("[t08] prose @1120x700:", JSON.stringify(prose));
    expect(prose.family.toLowerCase()).toContain("fraunces");
    expect(prose.size).toBeGreaterThanOrEqual(24);
    expect(prose.size).toBeLessThanOrEqual(28);
    expect(prose.maxWidth / prose.ch).toBeGreaterThanOrEqual(28);
    expect(prose.maxWidth / prose.ch).toBeLessThanOrEqual(40);
    expect(prose.rendered).toBeLessThanOrEqual(prose.maxWidth + 1);
    // the read-along spans are the shipped ones, one per word
    expect(prose.words).toBe(splitWords(PAGE_2_WORDS).length);
  });

  test("“Largest” text scrolls inside the text page; nothing spills out of it", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1120, height: 700 });
    await page.addInitScript(
      ({ key }) => {
        try {
          window.localStorage.setItem(key, JSON.stringify({ v: 2, fontScale: 1.5 }));
        } catch {
          /* ignore */
        }
      },
      { key: PREFS_KEY },
    );
    await open(page, "/read?demo=1", 2);
    await expect(page.locator(".pl-page.is-spread")).toHaveCount(1);

    const text = page.locator('[data-pl="text"]');
    const before = await text.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        overflowY: cs.overflowY,
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
        size: parseFloat(getComputedStyle(el.querySelector('[data-pl="prose"]')!).fontSize),
      };
    });
    console.log("[t08] largest:", JSON.stringify(before));
    expect(before.size).toBeGreaterThan(34);
    expect(["auto", "scroll"]).toContain(before.overflowY);
    expect(before.scrollH, "Largest text should overflow and scroll").toBeGreaterThan(before.clientH);

    // the page itself never grows past the picture
    const g = await layout(page);
    expect(Math.abs(g.text!.h - g.art!.h)).toBeLessThanOrEqual(2);

    // scrolled to the end, the last word sits inside the text page
    await text.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await page.waitForTimeout(150);
    const fits = await text.evaluate((el) => {
      const page = el.getBoundingClientRect();
      const words = el.querySelectorAll('[data-pl="word"]');
      const last = words[words.length - 1].getBoundingClientRect();
      return last.bottom <= page.bottom + 1 && last.top >= page.top - 1;
    });
    expect(fits).toBe(true);
  });
});

/* ─────────────────────────────────────── 4 · the words stay legible (pixels) */

function chan(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function lum(r: number, g: number, b: number): number {
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/** p25 contrast of the prose colour against the pixels behind the whole prose box. */
async function proseContrast(page: Page, shot: string): Promise<number> {
  const prose = page.locator('[data-pl="prose"]');
  const box = (await prose.boundingBox())!;
  const color = await prose.evaluate((el) => getComputedStyle(el).color);
  const rgb = (color.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  const textL = lum(rgb[0], rgb[1], rgb[2]);
  const buffer = await page.screenshot({ path: evidencePath(`${shot}.png`, { dir: "tests/screenshots" }) });
  const px = await page.evaluate(
    async ({ dataUrl, rect }) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const x = Math.max(0, Math.round(rect.x));
      const y = Math.max(0, Math.round(rect.y));
      const w = Math.max(1, Math.min(canvas.width - x, Math.round(rect.width)));
      const h = Math.max(1, Math.min(canvas.height - y, Math.round(rect.height)));
      return Array.from(ctx.getImageData(x, y, w, h).data);
    },
    { dataUrl: `data:image/png;base64,${buffer.toString("base64")}`, rect: box },
  );
  const lums: number[] = [];
  for (let i = 0; i < px.length; i += 4) lums.push(lum(px[i], px[i + 1], px[i + 2]));
  lums.sort((a, b) => a - b);
  const bg = lums[Math.round((lums.length - 1) * 0.25)];
  const ratio = (Math.max(textL, bg) + 0.05) / (Math.min(textL, bg) + 0.05);
  console.log(`[t08] ${shot}: text L=${textL.toFixed(3)} bg(p25) L=${bg.toFixed(4)} → ${ratio.toFixed(2)}:1`);
  return ratio;
}

test.describe("T08 · the sheer page clears 4.5:1", () => {
  test("1440×900 · house tape page 2", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "/read?demo=1", 2);
    await expect(page.locator(".pl-page.is-spread")).toHaveCount(1);
    await page.waitForTimeout(1200); // the backdrop crossfade settles
    expect(await proseContrast(page, "vision-reader-spread-contrast-house")).toBeGreaterThanOrEqual(4.5);
  });

  test("1440×900 · pure white art", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedReaderTapes(page, t08Rows());
    await open(page, `/read?story=${WHITE_ART_CODE}`);
    await expect(page.locator(".pl-page.is-spread")).toHaveCount(1);
    await page.waitForTimeout(1200);
    expect(await proseContrast(page, "vision-reader-spread-contrast-white")).toBeGreaterThanOrEqual(4.5);
  });
});

/* ──────────────────────────────────────────── 5 · art is never cropped */

test("T08 · a 4:3 picture keeps its natural aspect on the left page", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await seedReaderTapes(page, t08Rows());
  for (const n of [1, 2]) {
    await open(page, `/read?story=${WIDE_ART_CODE}`, n);
    await expect(page.locator(".pl-page.is-spread")).toHaveCount(1);
    // the art's box settles to the picture once its natural size is known
    await expect
      .poll(async () => {
        const g = await layout(page);
        return Math.abs(g.img!.w / g.img!.h - 4 / 3) / (4 / 3);
      })
      .toBeLessThanOrEqual(0.01);
    const g = await layout(page);
    console.log(`[t08] 4:3 page ${n}:`, JSON.stringify({ img: g.img, art: g.art, text: g.text }));
    expect(g.natural).toEqual({ w: 800, h: 600 });
    expect(g.imgFit).toBe("contain");
    // the left page IS the picture: no letterbox bars inside it
    expect(Math.abs(g.art!.w - g.img!.w)).toBeLessThanOrEqual(2);
    expect(Math.abs(g.art!.h - g.img!.h)).toBeLessThanOrEqual(2);
    expect(Math.abs(g.text!.h - g.art!.h)).toBeLessThanOrEqual(2);
    expect(Math.abs(g.text!.x - (g.art!.x + g.art!.w))).toBeLessThanOrEqual(2);
    const centre = g.spread!.x + g.spread!.w / 2;
    expect(Math.abs(centre - g.vw / 2)).toBeLessThanOrEqual(4);
  }
});

/* ───────────────── 6 · a text-only page, the chips and the keyboard hint */

test.describe("T08 · one page alone, the chips, the keys", () => {
  test("1280×720 · page 8 (text only) is one centred text page", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, "/read?demo=1", 8);
    await expect(page.locator(".pl-page.is-textonly")).toHaveCount(1);
    await expect(page.locator(".pl-page.is-spread")).toHaveCount(0);
    await expect(page.locator('[data-pl="art"]')).toHaveCount(0);
    await expect(page.locator('[data-pl="prose"]')).toContainText("The End");
    const g = await layout(page);
    console.log("[t08] text-only page:", JSON.stringify(g.text));
    const text = g.text!;
    expect(Math.abs(text.x + text.w / 2 - g.vw / 2), "text page off-centre").toBeLessThanOrEqual(4);
    expect(text.w).toBeLessThan(0.6 * g.vw);
    expect(text.h).toBeGreaterThanOrEqual(0.6 * g.vh);
    expect(intersects(text, g.transport!)).toBe(false);
    for (const chip of g.chips) expect(intersects(text, chip)).toBe(false);
  });

  test("the top chips: lucide icons, unchanged names, visible labels at ≥ 640 px", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, "/read?demo=1");
    const top = page.locator(".pl-chrome--top");
    await expect(top).not.toContainText(/[♪⚙⏏]/);
    const music = top.getByRole("button", { name: "Music on" });
    const options = top.getByRole("button", { name: "Reading options" });
    const close = top.getByRole("button", { name: "Close story" });
    await expect(music.locator("svg.lucide-music")).toHaveCount(1);
    await expect(options.locator("svg.lucide-settings")).toHaveCount(1);
    await expect(close.locator("svg.lucide-x")).toHaveCount(1);
    for (const icon of [music, options, close]) {
      await expect(icon.locator("svg")).toHaveAttribute("aria-hidden", "true");
    }
    await expect(music).toHaveText("Music on");
    await expect(options).toHaveText("Reading options");
    await expect(close).toHaveText("Close");
    await music.click();
    await expect(top.getByRole("button", { name: "Music off" })).toHaveText("Music off");
  });

  test("the keyboard hint: bottom-left in spread mode, hides with the chrome, absent on phones", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1280, height: 720 });
    // autoPlay off: nothing but this test turns a page (a turn wakes the chrome)
    await seedReaderTapes(page, t08Rows());
    await open(page, `/read?story=${WHITE_ART_CODE}`);
    const keys = page.locator('[data-pl="keys"]');
    await expect(keys).toHaveText(KEY_HINT);
    const hint = await keys.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { x: r.x, bottom: r.bottom, family: cs.fontFamily, size: parseFloat(cs.fontSize) };
    });
    expect(hint.x).toBeLessThan(64);
    expect(hint.bottom).toBeGreaterThan(720 - 64);
    expect(hint.family.toLowerCase()).toMatch(/mono/);
    expect(hint.size).toBeCloseTo(11, 0);
    const g = await layout(page);
    const keysBox = (await keys.boundingBox())!;
    expect(intersects({ x: keysBox.x, y: keysBox.y, w: keysBox.width, h: keysBox.height }, g.spread!)).toBe(false);

    // idles out with the rest of the chrome …
    await expect(page.locator(".pl-chrome--top")).toHaveClass(/is-hidden/, { timeout: 10000 });
    await expect(keys).toHaveClass(/is-hidden/);
    await expect.poll(() => keys.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
    // … and comes back with it
    await page.mouse.move(400, 300);
    await page.mouse.move(420, 320);
    await expect(keys).not.toHaveClass(/is-hidden/);

    // a phone has no keyboard hint
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".is-spread")).toHaveCount(0);
    await expect(keys).toHaveCount(0);
  });

  test("the hint is true: space pauses, P turns the music off and on, arrows turn", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, "/read?demo=1");
    const root = page.locator(".pl-root");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    await page.keyboard.press("Space");
    await expect(page.locator('[data-sk="transport"][data-kind="play"]')).toHaveCount(1);
    await expect(root).toHaveAttribute("data-page", "1");
    await page.keyboard.press("Space");
    await expect(page.locator('[data-sk="transport"][data-kind="pause"]')).toHaveCount(1);

    await expect(page.getByRole("button", { name: "Music on" })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("p");
    await expect(page.getByRole("button", { name: "Music off" })).toHaveAttribute("aria-pressed", "false");
    await expect(root).toHaveAttribute("data-music", "off");
    await page.keyboard.press("P");
    await expect(page.getByRole("button", { name: "Music on" })).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("ArrowRight");
    await expect(root).toHaveAttribute("data-page", "2");
    await page.keyboard.press("ArrowLeft");
    await expect(root).toHaveAttribute("data-page", "1");
  });
});

/* ──────────────────────────────────────── 7 · the turn, and a clean console */

test.describe("T08 · the turn and the console", () => {
  test("the shipped turn moves the whole spread; reduced motion makes it instant", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, "/read?demo=1");
    await page.keyboard.press("ArrowRight");
    const turning = page.locator(".pl-page.is-out, .pl-page.is-in");
    await expect(turning).toHaveCount(1);
    const anim = await turning.evaluate((el) => ({
      name: getComputedStyle(el).animationName,
      holdsSpread: !!el.querySelector('[data-pl="spread"]'),
    }));
    expect(anim.name).toMatch(/pl-turn-(out|in)-next/);
    expect(anim.holdsSpread).toBe(true);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "/read?demo=1");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".pl-root")).toHaveAttribute("data-page", "2");
    await expect(page.locator(".pl-page.is-out, .pl-page.is-in")).toHaveCount(0);
    expect(await page.locator(".pl-page").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    await expect(page.locator(".pl-page.is-spread")).toHaveCount(1);
  });

  test("/read?demo=1 · no hydration warning and no console error through a turn", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1120, height: 700 });
    const problems: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (msg.type() === "error") problems.push(`error: ${text}`);
      else if (msg.type() === "warning" && /hydrat|did not match|server rendered/i.test(text)) {
        problems.push(`warning: ${text}`);
      }
    });
    page.on("pageerror", (e) => problems.push(`pageerror: ${String(e)}`));
    await open(page, "/read?demo=1", 2);
    await expect(page.locator(".pl-page.is-spread")).toHaveCount(1);
    await page.waitForTimeout(800);
    expect(problems, JSON.stringify(problems)).toEqual([]);
  });
});
