/**
 * T06 · The hero tape carries the demo title; page 1's star sits behind the
 * deck's play key; under reduced motion the tape is simply already in
 * (docs/vision/tickets/T06-hero-tape-title-one-light.md, reference s01).
 *
 * Seam: Playwright E2E on `/` (and `/read?demo=1` for the route). Everything
 * is read off the running page — label text, bounding boxes, computed styles —
 * and every expectation is either a literal here or read from the demo JSON in
 * Node, never imported from the component, so the test can fail.
 *
 *   1. The cassette label: title = `metadata.title` of the demo manifest (read
 *      from disk), meta "SIDE A · PRESS PLAY", band "STORYSYNC", kicker
 *      "THE LIBRARY CASSETTE · REBUILT FOR THE WEB". No component hard-codes
 *      the demo title (Node scan of src/components).
 *   2. One light: the sky's star point (64.1% × 46.2% of the image box) lands
 *      within 6 px of the play key's centre at 1080×675, 1280×720, 1440×900
 *      and 390×844; exactly one gold radial glow in the hero, on the key.
 *   3. The fold at 1080×675: headline, subline and Press play inside the
 *      viewport; the doors section's top edge above y = 675.
 *   4. Insertion depth: poised (55–75 % of the tape visible) at rest, seated
 *      (≤ 40 %) under reduced motion, reels still, button unpressed.
 *   5. The play key is decorative: aria-hidden, never focused by Tab, never
 *      clickable.
 *   6. The sky is aria-hidden and never scrolls the page sideways.
 */

import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const DEMO_PATH = path.join(process.cwd(), "public", "demo", "brave-little-star.ssync.json");

interface DemoJson {
  metadata: { title: string };
  pages: Array<{ illustration?: { url?: string } }>;
}

function readDemo(): DemoJson {
  return JSON.parse(fs.readFileSync(DEMO_PATH, "utf8")) as DemoJson;
}

const HERO = ".ls-hero";
const CASSETTE = '[data-ls="tape-slide"] [data-sk="cassette"]';
const KEY = '[data-ls="play-key"]';
const SKY = '[data-ls="sky"]';
const SKY_ART = '[data-ls="sky-art"]';
const PRESS = '[data-ls="press-play"]';

/** Where page 1's single bright star sits inside its (square) image. */
const STAR_X = 0.641;
const STAR_Y = 0.462;
const STAR_TOLERANCE_PX = 6;

const HEADLINE = "Press play on the stories you make together.";
const SUBLINE =
  "Photos of their drawings. Their voice on every page. A little music underneath. One link that plays anywhere.";
const KICKER = "THE LIBRARY CASSETTE · REBUILT FOR THE WEB";

async function openHero(page: Page, viewport?: { width: number; height: number }) {
  if (viewport) await page.setViewportSize(viewport);
  await page.goto("/");
  await expect(page.locator(CASSETTE)).toHaveCount(1);
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
}

/** Share of the cassette's height that shows above the deck mouth (the well's clip). */
async function visibleShare(page: Page) {
  return page.evaluate(() => {
    const cassette = document.querySelector<HTMLElement>('[data-ls="tape-slide"] [data-sk="cassette"]');
    const well = cassette?.closest<HTMLElement>(".ls-tape-well");
    if (!cassette || !well) return Number.NaN;
    const c = cassette.getBoundingClientRect();
    const w = well.getBoundingClientRect();
    const shown = Math.max(0, Math.min(c.bottom, w.bottom) - Math.max(c.top, w.top));
    return shown / c.height;
  });
}

/** Distance between the sky's star point and the play key's centre, in px. */
async function starToKey(page: Page) {
  return page.evaluate(
    ({ sx, sy, art, key }) => {
      const a = document.querySelector(art)?.getBoundingClientRect();
      const k = document.querySelector(key)?.getBoundingClientRect();
      if (!a || !k) return null;
      const star = { x: a.x + sx * a.width, y: a.y + sy * a.height };
      const centre = { x: k.x + k.width / 2, y: k.y + k.height / 2 };
      return {
        dx: star.x - centre.x,
        dy: star.y - centre.y,
        distance: Math.hypot(star.x - centre.x, star.y - centre.y),
        key: { w: k.width, h: k.height, cx: centre.x, cy: centre.y },
      };
    },
    { sx: STAR_X, sy: STAR_Y, art: SKY_ART, key: KEY },
  );
}

/* ------------------------------------------------------------ 1 · label */

test.describe("T06 · the hero tape carries the demo's title", () => {
  test("1 · label title is the demo manifest's metadata.title; meta, band and kicker verbatim", async ({
    page,
  }) => {
    const demo = readDemo();
    expect(demo.metadata.title.length).toBeGreaterThan(0);
    await openHero(page);

    const label = page.locator(`${CASSETTE} .sk-cassette-label`);
    await expect(label.locator(".sk-tape-title")).toHaveText(demo.metadata.title);
    await expect(label.locator(".sk-tape-meta")).toHaveText("SIDE A · PRESS PLAY");
    // the kit TapeLabel band still reads STORYSYNC
    await expect(label.locator(".sk-tape-band")).toHaveText(/^\s*STORYSYNC\s*$/i);
    expect(await label.locator(".sk-tape-band").evaluate((el) => (el as HTMLElement).innerText.trim())).toBe(
      "STORYSYNC",
    );

    // the kicker above the deck: visually uppercase, source text unchanged
    const kicker = page.locator(`${HERO} [data-ls="hero-kicker"]`);
    await expect(kicker).toHaveCount(1);
    const k = await kicker.evaluate((el) => ({
      shown: (el as HTMLElement).innerText.trim(),
      transform: getComputedStyle(el).textTransform,
      aboveDeck:
        el.getBoundingClientRect().bottom <=
        (document.querySelector('[data-ls="deck"]')?.getBoundingClientRect().top ?? -1),
    }));
    expect(k.shown).toBe(KICKER);
    expect(k.transform).toBe("uppercase");
    expect(k.aboveDeck, "the kicker sits above the deck").toBe(true);
  });

  test("1b · the hero's components never type the demo title (it comes from the manifest import)", () => {
    const title = readDemo().metadata.title;
    // the hero is built from the landing components and the kit's Cassette
    const roots = ["landing", "studio-kit"].map((dir) => path.join(process.cwd(), "src", "components", dir));
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|css)$/.test(entry.name) && fs.readFileSync(full, "utf8").includes(title)) {
          offenders.push(path.relative(process.cwd(), full));
        }
      }
    };
    for (const root of roots) walk(root);
    expect(offenders, `"${title}" typed into a hero component`).toEqual([]);
    // and the landing reads it from the demo manifest it imports
    const landing = fs.readFileSync(path.join(process.cwd(), "src/components/landing/Landing.tsx"), "utf8");
    expect(landing).toMatch(/import\s+\w+\s+from\s+["'][./]*public\/demo\/brave-little-star\.ssync\.json["']/);
  });
});

/* ------------------------------------------------------- 2 · one light */

test.describe("T06 · one light: page 1's star behind the play key", () => {
  for (const viewport of [
    { width: 1080, height: 675 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`2 · star point within ${STAR_TOLERANCE_PX}px of the key centre at ${viewport.width}×${viewport.height}`, async ({
      page,
    }) => {
      await openHero(page, viewport);
      await expect(page.locator(SKY)).toHaveCount(1);
      await expect(page.locator(KEY)).toHaveCount(1);
      const r = await starToKey(page);
      expect(r, "the sky image box and the play key must both render").not.toBeNull();
      expect(
        r!.distance,
        `star point is off the key by (${r!.dx.toFixed(1)}, ${r!.dy.toFixed(1)}) px`,
      ).toBeLessThanOrEqual(STAR_TOLERANCE_PX);
      // the key is on screen, in the hero's first view
      expect(r!.key.cy).toBeGreaterThan(0);
      expect(r!.key.cy).toBeLessThan(viewport.height);
    });
  }

  test("2b · the sky is the demo's page-1 illustration, faint, masked, with a brighter star core", async ({
    page,
  }) => {
    const pageOne = readDemo().pages[0]?.illustration?.url;
    expect(pageOne, "the demo's page 1 has an illustration").toBeTruthy();
    await openHero(page, { width: 1080, height: 675 });

    const sky = page.locator(SKY);
    await expect(sky).toHaveAttribute("aria-hidden", "true");
    const layers = await sky.evaluate((el) =>
      [...el.querySelectorAll<HTMLElement>("*")].map((node) => {
        const cs = getComputedStyle(node);
        return {
          ls: node.dataset.ls ?? "",
          bg: cs.backgroundImage,
          mask: cs.maskImage || cs.webkitMaskImage,
          opacity: Number(cs.opacity),
        };
      }),
    );
    const art = layers.find((l) => l.ls === "sky-art");
    expect(art, "a sky image box").toBeTruthy();
    expect(art!.bg).toContain(pageOne!);
    expect(art!.mask, "masked to its swirl").toContain("radial-gradient");
    expect(art!.opacity).toBeGreaterThanOrEqual(0.12);
    expect(art!.opacity).toBeLessThanOrEqual(0.2);
    // the star core: the same picture, brighter, masked to the star alone
    const core = layers.find((l) => l.ls === "sky-core");
    expect(core, "a star core").toBeTruthy();
    expect(core!.bg).toContain(pageOne!);
    expect(core!.mask).toContain("radial-gradient");
    expect(core!.opacity).toBeGreaterThan(art!.opacity);

    // nothing in the sky can be hit
    expect(await sky.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  });

  test("2c · exactly one gold glow in the hero, centred on the play key; the old hero glow is gone", async ({
    page,
  }) => {
    await openHero(page, { width: 1080, height: 675 });
    await expect(page.locator(".ls-hero-glow")).toHaveCount(0);

    const glows = await page.evaluate(() => {
      const hero = document.querySelector(".ls-hero");
      if (!hero) return [];
      return [hero, ...hero.querySelectorAll<HTMLElement>("*")]
        .filter((node) => {
          const bg = getComputedStyle(node).backgroundImage;
          return bg.includes("radial-gradient") && bg.includes("rgba(245, 158, 11");
        })
        .map((node) => {
          const r = node.getBoundingClientRect();
          return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, cls: node.className };
        });
    });
    expect(glows, JSON.stringify(glows)).toHaveLength(1);
    const key = await page.locator(KEY).boundingBox();
    expect(key).not.toBeNull();
    const dx = glows[0].cx - (key!.x + key!.width / 2);
    const dy = glows[0].cy - (key!.y + key!.height / 2);
    expect(Math.hypot(dx, dy), `glow centre off the key by (${dx}, ${dy})`).toBeLessThanOrEqual(
      STAR_TOLERANCE_PX,
    );
  });

  test("2d · the deck has a round ~30px gold-rimmed play key; the readout keeps its states", async ({
    page,
  }) => {
    await openHero(page, { width: 1080, height: 675 });
    const key = page.locator(KEY);
    await expect(key, "the deck has a play key").toHaveCount(1);
    const k = await key.evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        w: r.width,
        h: r.height,
        radius: cs.borderTopLeftRadius,
        shadow: cs.boxShadow,
        glyph: el.querySelectorAll("svg").length,
        inDeck: !!el.closest('[data-ls="deck"]'),
      };
    });
    expect(k.inDeck).toBe(true);
    expect(k.w).toBeGreaterThanOrEqual(28);
    expect(k.w).toBeLessThanOrEqual(34);
    expect(Math.abs(k.w - k.h)).toBeLessThanOrEqual(0.5);
    expect(k.radius === "50%" || Number.parseFloat(k.radius) >= k.w / 2).toBe(true);
    // the gold rim: --ss-gold-2 (#FBBF4A) inset ring
    expect(k.shadow).toContain("rgb(251, 191, 74)");
    expect(k.glyph).toBe(1);

    await expect(page.locator('[data-ls="deck"] .ls-deck-readout')).toHaveText("DECK · READY");
  });
});

/* ------------------------------------------------------------- 3 · fold */

test.describe("T06 · the fold at 1080×675", () => {
  test("3 · headline, subline and Press play are inside the viewport; the doors peek in", async ({
    page,
  }) => {
    await openHero(page, { width: 1080, height: 675 });
    const read = (sel: string) =>
      page.locator(sel).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, text: (el as HTMLElement).innerText.trim() };
      });

    const headline = await read(".ls-hero-line");
    const sub = await read(".ls-hero-sub");
    const press = await read(PRESS);
    expect(headline.text).toBe(HEADLINE);
    expect(sub.text.replace(/\s+/g, " ")).toBe(SUBLINE);
    for (const [name, box] of [
      ["headline", headline],
      ["subline", sub],
      ["Press play", press],
    ] as const) {
      expect(box.top, `${name} top`).toBeGreaterThanOrEqual(0);
      expect(box.bottom, `${name} bottom ${box.bottom}`).toBeLessThanOrEqual(675);
      expect(box.left, `${name} left`).toBeGreaterThanOrEqual(0);
      expect(box.right, `${name} right`).toBeLessThanOrEqual(1080);
    }
    const doorsTop = await page.locator("#ls-doors").evaluate((el) => el.getBoundingClientRect().top);
    expect(doorsTop, `the doors section starts at y=${doorsTop}`).toBeLessThan(675);
  });

  test("3b · exactly one visible primary gold action in the hero: Press play", async ({ page }) => {
    await openHero(page, { width: 1080, height: 675 });
    const golds = page.locator(`${HERO} .sk-big--gold`);
    await expect(golds).toHaveCount(1);
    await expect(golds.first()).toBeVisible();
    await expect(golds.first()).toHaveAccessibleName(/press play/i);
  });
});

/* ------------------------------------------------------------ 4 · depth */

test.describe("T06 · insertion depth", () => {
  test("4 · at rest the tape is poised in the mouth: 55–75% of it shows, the slide is untransformed", async ({
    page,
  }) => {
    await openHero(page, { width: 1080, height: 675 });
    const share = await visibleShare(page);
    expect(share, `visible share ${share}`).toBeGreaterThanOrEqual(0.55);
    expect(share).toBeLessThanOrEqual(0.75);
    // the poised depth is an offset on the well, never a transform on the slide
    await expect(page.locator('[data-ls="tape-slide"]')).toHaveCSS("transform", "none");
    // ≈340px wide at 1080
    const width = await page.locator(CASSETTE).evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThanOrEqual(320);
    expect(width).toBeLessThanOrEqual(360);
  });

  test("4b · press play: ls-insert ≤ 900ms ease-out forwards, the readout lights, the route opens", async ({
    page,
  }) => {
    await page.request.get("/read?demo=1");
    await openHero(page, { width: 1080, height: 675 });
    await page.locator(PRESS).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('[data-ls="tape-stage"]')).toHaveAttribute("data-inserting", "true");
    const anim = await page.locator('[data-ls="tape-slide"]').evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        name: cs.animationName,
        duration: Number.parseFloat(cs.animationDuration),
        fill: cs.animationFillMode,
        ease: cs.animationTimingFunction,
      };
    });
    expect(anim.name).toBe("ls-insert");
    expect(anim.duration).toBeLessThanOrEqual(0.9);
    expect(anim.duration).toBeGreaterThan(0.5);
    expect(anim.fill).toBe("forwards");
    expect(anim.ease).toMatch(/cubic-bezier|ease-out/);
    await expect(page.locator('[data-ls="deck"] .ls-deck-readout')).toHaveText("▶ PLAY · SIDE A");
    await page.waitForURL(/\/read\?demo=1/, { timeout: 5000 });
    await expect(page.getByRole("button", { name: "Tap to Begin" })).toBeVisible({ timeout: 5000 });
  });

  test("4c · reduced motion: the tape is already in (≤ 40% shows), reels still, button unpressed", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openHero(page, { width: 1080, height: 675 });
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);

    const share = await visibleShare(page);
    expect(share, `seated share ${share}`).toBeLessThanOrEqual(0.4);
    expect(share, "the label band still shows above the mouth").toBeGreaterThan(0.12);

    const reels = await page.evaluate(() =>
      [...document.querySelectorAll(".ls-hero [data-sk='reel'] svg")].map(
        (svg) => getComputedStyle(svg).animationName,
      ),
    );
    expect(reels.length).toBeGreaterThanOrEqual(2);
    for (const name of reels) expect(name).toBe("none");

    // the cassette itself holds still too
    expect(await page.locator(CASSETTE).evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    await expect(page.locator(PRESS)).toHaveCSS("transform", "none");
    await expect(page.locator(PRESS)).toHaveAttribute("aria-busy", "false");

    // even a forced inserting state animates nothing
    const forced = await page.evaluate(() => {
      const stage = document.querySelector('[data-ls="tape-stage"]');
      const slide = document.querySelector('[data-ls="tape-slide"]');
      if (!stage || !slide) return null;
      stage.setAttribute("data-inserting", "true");
      const name = getComputedStyle(slide).animationName;
      stage.setAttribute("data-inserting", "false");
      return name;
    });
    expect(forced).toBe("none");

    // the star still sits behind the key in the seated layout
    const r = await starToKey(page);
    expect(r!.distance).toBeLessThanOrEqual(STAR_TOLERANCE_PX);
  });

  test("4d · reduced motion: Press play reaches the cover gate without ever inserting", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.request.get("/read?demo=1");
    await openHero(page);
    await page.evaluate(() => {
      sessionStorage.removeItem("t06-inserted");
      const stage = document.querySelector('[data-ls="tape-stage"]');
      if (!stage) throw new Error("no tape stage");
      new MutationObserver(() => {
        if (stage.getAttribute("data-inserting") === "true") sessionStorage.setItem("t06-inserted", "yes");
      }).observe(stage, { attributes: true, attributeFilter: ["data-inserting"] });
    });
    await page.locator(PRESS).click();
    await page.waitForURL(/\/read\?demo=1/, { timeout: 5000 });
    await expect(page.getByRole("button", { name: "Tap to Begin" })).toBeVisible({ timeout: 5000 });
    expect(await page.evaluate(() => sessionStorage.getItem("t06-inserted"))).toBeNull();
  });
});

/* -------------------------------------------------------------- 5 · key */

test.describe("T06 · the play key is decoration", () => {
  test("5 · aria-hidden, never focused by Tab, never clickable", async ({ page }) => {
    await openHero(page, { width: 1080, height: 675 });
    const key = page.locator(KEY);
    await expect(key, "the deck has a play key").toHaveCount(1);
    const k = await key.evaluate((el) => ({
      hidden: !!el.closest('[aria-hidden="true"]'),
      ownHidden: el.getAttribute("aria-hidden"),
      tabIndex: (el as HTMLElement).tabIndex,
      pointer: getComputedStyle(el).pointerEvents,
      tag: el.tagName.toLowerCase(),
    }));
    expect(k.hidden).toBe(true);
    expect(k.ownHidden).toBe("true");
    expect(k.tabIndex).toBe(-1);
    expect(k.pointer).toBe("none");
    expect(["button", "a", "input"]).not.toContain(k.tag);

    // Tab from the top through the hero and past it: never on the key or the deck
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const visited: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return "body";
        if (el.closest('[data-ls="play-key"], [data-ls="deck"], [data-ls="sky"]')) return "DECORATION";
        return el.dataset.ls ?? el.tagName.toLowerCase();
      });
      visited.push(where);
    }
    expect(visited, visited.join(" → ")).not.toContain("DECORATION");
    expect(visited, "Press play is still in the tab order").toContain("press-play");
  });
});

/* -------------------------------------------------------------- 6 · sky */

test.describe("T06 · the sky never scrolls the page sideways", () => {
  test("6 · aria-hidden, and no horizontal overflow from 320 to 1440", async ({ page }) => {
    // nine full page loads on a shared dev server: give the sweep room
    test.setTimeout(120_000);
    for (const width of [320, 375, 390, 414, 768, 900, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page.locator(SKY)).toHaveAttribute("aria-hidden", "true");
      await page.waitForLoadState("networkidle");
      const m = await page.evaluate(() => {
        window.scrollTo(10_000, 0);
        const r = {
          scrollW: document.documentElement.scrollWidth,
          bodyW: document.body.scrollWidth,
          innerW: window.innerWidth,
          scrollX: window.scrollX,
        };
        window.scrollTo(0, 0);
        return r;
      });
      expect(m.scrollW, `at ${width}px scrollWidth ${m.scrollW}`).toBeLessThanOrEqual(m.innerW + 2);
      expect(m.bodyW, `at ${width}px body ${m.bodyW}`).toBeLessThanOrEqual(m.innerW + 2);
      expect(m.scrollX, `at ${width}px dragged ${m.scrollX}px`).toBeLessThanOrEqual(1);
    }
  });
});
