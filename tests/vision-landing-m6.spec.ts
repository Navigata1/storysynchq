/**
 * M6 · s01 fixes from the critic panel (landing, group A).
 *
 * Seam: Playwright E2E on `/`. Every expectation is a literal here or read off
 * the running page (boxes, computed styles, text), never imported from the
 * component, so each test can fail.
 *
 *   1. The doors peek in at the fold (brief screens[0].layout_spec: "At the
 *      fold (y640-675) the tops of the two doors peek in"): at 1080×675,
 *      1280×720 and 390×844 Press play is inside the viewport and the first
 *      door card starts below it, with at least 12px of its stripe showing.
 *      The peeking card is revealed at rest (opacity 1), with and without
 *      reduced motion. The doors section keeps its accessible name, and the
 *      section head that pushed the cards down is no longer drawn.
 *   2. Press play is the reference gold pill (.ss-btn: radius 999px): radius
 *      ≥ height / 2 − 1. The kit BigButton keeps its 16px default elsewhere.
 *   3. The Play door body is the brief's copy, verbatim.
 *   4. The footer privacy promise meets WCAG AA (≥ 4.5:1).
 *   5. The how-it-works share chip shows the real share-link shape
 *      (/read?story=<128-bit code>, truncated), never a short /s/ code, and
 *      fits its chip at 375 and 390.
 *   6. On phones the hero kicker breaks only after the "·": "REBUILT FOR THE
 *      WEB" stays on one line.
 *   7. The visible headline is the page's one h1 (and still names the brand).
 *   8. The how-it-works eyebrow carries no invented number.
 *   9. The hero cassette has s01's tape pack behind the LEFT reel only, in a
 *      smoked-brown window.
 */

import { expect, test, type Page } from "@playwright/test";

const PRESS = '[data-ls="press-play"]';
const FIRST_CARD = ".ls-doors-grid > *:first-child";
const HEADLINE = "Press play on the stories you make together.";
const PLAY_COPY =
  "Open a tape someone made for you: a shared link, a .storysync file, or our demo tape.";

async function open(page: Page, viewport?: { width: number; height: number }) {
  if (viewport) await page.setViewportSize(viewport);
  await page.goto("/");
  await expect(page.locator(PRESS)).toHaveCount(1);
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
}

/** Wait for the first door card's one-shot reveal to land (opacity 1, no drop). */
async function doorsRevealed(page: Page) {
  await expect
    .poll(
      () =>
        page.locator(FIRST_CARD).evaluate((el) => {
          const cs = getComputedStyle(el);
          return Number(cs.opacity) === 1 && cs.transform === "none";
        }),
      { timeout: 4000 },
    )
    .toBe(true);
}

/** Press play and the first door card, read in ONE frame. */
function foldBoxes(page: Page) {
  return page.evaluate(() => {
    const press = document.querySelector('[data-ls="press-play"]')!.getBoundingClientRect();
    const cell = document.querySelector<HTMLElement>(".ls-doors-grid > *:first-child")!;
    const card = cell.getBoundingClientRect();
    const make = document.querySelector<HTMLElement>(".ls-door--make")!.getBoundingClientRect();
    return {
      innerHeight: window.innerHeight,
      pressBottom: press.bottom,
      cardTop: card.top,
      makeTop: make.top,
      wide: window.innerWidth >= 768,
    };
  });
}

/* ------------------------------------------------------------ 1 · the fold */

test.describe("M6 s01 · the doors peek in at the fold", () => {
  for (const viewport of [
    { width: 1080, height: 675 },
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    for (const reduced of [false, true]) {
      test(`1 · ${viewport.width}×${viewport.height}${reduced ? " reduced motion" : ""}: Press play in, the door card tops peek, revealed`, async ({
        page,
      }) => {
        if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
        await open(page, viewport);

        // the peeking card is shown at rest, not stuck at opacity 0 (and the
        // one-shot reveal has landed before its box is read)
        await doorsRevealed(page);

        // two agreeing snapshots: the layout has settled
        let box = await foldBoxes(page);
        await expect
          .poll(async () => {
            const next = await foldBoxes(page);
            const same = Math.abs(next.cardTop - box.cardTop) < 0.5 && Math.abs(next.pressBottom - box.pressBottom) < 0.5;
            box = next;
            return same;
          })
          .toBe(true);

        expect(box.pressBottom, `Press play bottom ${box.pressBottom}`).toBeLessThanOrEqual(box.innerHeight);
        expect(box.cardTop, `card top ${box.cardTop} below Press play ${box.pressBottom}`).toBeGreaterThan(
          box.pressBottom,
        );
        expect(box.cardTop, `card top ${box.cardTop}: at least 12px peeks in`).toBeLessThanOrEqual(
          box.innerHeight - 12,
        );
        if (box.wide) {
          // side by side: the glass card's top peeks in too
          expect(box.makeTop).toBeLessThanOrEqual(box.innerHeight - 12);
        }

      });
    }
  }

  test("1b · the doors section keeps its accessible name; no visible head above the cards", async ({ page }) => {
    await open(page, { width: 1080, height: 675 });
    const region = page.getByRole("region", { name: /someone makes it/i });
    await expect(region).toHaveCount(1);
    await expect(region).toHaveAttribute("id", "ls-doors");
    await expect(page.getByText("Two doors · one loop", { exact: true })).toHaveCount(0);

    // nothing visible sits between the section's top and the cards
    await doorsRevealed(page);
    const gap = await page.evaluate(() => {
      const sec = document.getElementById("ls-doors")!.getBoundingClientRect();
      const card = document.querySelector(".ls-doors-grid > *:first-child")!.getBoundingClientRect();
      return card.top - sec.top;
    });
    expect(gap, `section top → card top ${gap}px`).toBeLessThanOrEqual(16);
  });
});

/* -------------------------------------------------------- 2 · the gold pill */

test.describe("M6 s01 · Press play is the gold pill", () => {
  test("2 · radius ≥ half the height; still 84px tall; pressed state intact", async ({ page }) => {
    await open(page, { width: 1080, height: 675 });
    const r = await page.locator(PRESS).evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        h: rect.height,
        radius: parseFloat(cs.borderTopLeftRadius),
        radiusBR: parseFloat(cs.borderBottomRightRadius),
      };
    });
    expect(r.h).toBeGreaterThanOrEqual(83);
    expect(r.radius, `radius ${r.radius} for height ${r.h}`).toBeGreaterThanOrEqual(r.h / 2 - 1);
    expect(r.radiusBR).toBeGreaterThanOrEqual(r.h / 2 - 1);
    await expect(page.locator(PRESS)).toHaveAttribute("data-shape", "pill");
    await expect(page.locator(PRESS)).toHaveAttribute("aria-busy", "false");
  });

  test("2b · the kit default stays the 16px BigButton (the pill is opt-in)", async ({ page }) => {
    await open(page, { width: 1080, height: 675 });
    // Render a default BigButton's class set next to the pill and compare.
    const radii = await page.evaluate(() => {
      const press = document.querySelector<HTMLElement>('[data-ls="press-play"]')!;
      const plain = press.cloneNode(true) as HTMLElement;
      plain.removeAttribute("data-shape");
      plain.removeAttribute("data-ls");
      press.parentElement!.appendChild(plain);
      const out = {
        plain: parseFloat(getComputedStyle(plain).borderTopLeftRadius),
        pill: parseFloat(getComputedStyle(press).borderTopLeftRadius),
      };
      plain.remove();
      return out;
    });
    expect(radii.plain).toBe(16);
    expect(radii.pill).toBeGreaterThan(40);
  });
});

/* ------------------------------------------------------- 3 · Play door copy */

test("M6 s01 · 3 · the Play door body is the brief's copy, verbatim", async ({ page }) => {
  await open(page);
  const copy = page.locator(".ls-door--play .ls-door-copy");
  await expect(copy).toHaveText(PLAY_COPY);
  await expect(copy.locator("code")).toHaveText(".storysync");
});

/* --------------------------------------------------- 4 · footer AA contrast */

test("M6 s01 · 4 · the footer privacy promise meets WCAG AA (≥ 4.5:1)", async ({ page }) => {
  await open(page);
  const ratio = await page.evaluate(() => {
    const parse = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const over = (
      top: { r: number; g: number; b: number; a: number },
      under: { r: number; g: number; b: number },
    ) => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
    });
    const lum = (c: { r: number; g: number; b: number }) => {
      const ch = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
    };
    const note = document.querySelector<HTMLElement>(".ls-footer-note")!;
    const footer = document.querySelector<HTMLElement>(".ls-footer")!;
    const room = { r: 10, g: 14, b: 26 }; // #0a0e1a
    const fbg = parse(getComputedStyle(footer).backgroundColor)!;
    const bg = over(fbg, room);
    const fg = over(parse(getComputedStyle(note).color)!, bg);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  });
  expect(ratio, `footer note contrast ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
});

/* ------------------------------------------------------- 5 · the share chip */

test.describe("M6 s01 · the share chip shows the real share-link shape", () => {
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
  ]) {
    test(`5 · ${viewport.width}: /read?story=<code…code>, no /s/ route, fits its chip`, async ({ page }) => {
      await open(page, viewport);
      const chip = page.locator(".ls-vig--share .ls-chip");
      await chip.scrollIntoViewIfNeeded();
      const text = ((await chip.textContent()) ?? "").trim();
      expect(text).toMatch(/\/read\?story=[0-9a-f]{4}…[0-9a-f]{4}$/);
      expect(text).not.toContain("/s/");
      const fit = await chip.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const card = el.closest(".ls-beat")!.getBoundingClientRect();
        return { sw: el.scrollWidth, cw: el.clientWidth, left: r.left, right: r.right, cardL: card.left, cardR: card.right };
      });
      expect(fit.sw, `chip scrollWidth ${fit.sw} > clientWidth ${fit.cw}`).toBeLessThanOrEqual(fit.cw);
      expect(fit.left).toBeGreaterThanOrEqual(fit.cardL);
      expect(fit.right).toBeLessThanOrEqual(fit.cardR);
    });
  }
});

/* ------------------------------------------------- 6 · the phone kicker wrap */

test.describe("M6 s01 · the hero kicker breaks only after the ·", () => {
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 320, height: 640 },
  ]) {
    test(`6 · ${viewport.width}: 'REBUILT FOR THE WEB' stays on one line`, async ({ page }) => {
      await open(page, viewport);
      const kicker = page.locator('[data-ls="hero-kicker"]');
      await expect(kicker).toHaveText(/The library cassette · rebuilt for the web/i);
      const r = await kicker.evaluate((el) => {
        // the client rect of each word, via a Range over its text node
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const tops: Record<string, number> = {};
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const text = n.textContent ?? "";
          for (const word of ["library", "cassette", "rebuilt", "web"]) {
            const i = text.toLowerCase().indexOf(word);
            if (i < 0) continue;
            const range = document.createRange();
            range.setStart(n, i);
            range.setEnd(n, i + word.length);
            tops[word] = range.getClientRects()[0]!.top;
          }
        }
        return { tops, sw: el.scrollWidth, cw: el.clientWidth };
      });
      expect(Math.abs(r.tops.web - r.tops.rebuilt), JSON.stringify(r.tops)).toBeLessThan(2);
      expect(Math.abs(r.tops.cassette - r.tops.library), JSON.stringify(r.tops)).toBeLessThan(2);
      expect(r.sw).toBeLessThanOrEqual(r.cw);
    });
  }
});

/* ------------------------------------------------------- 7 · the visible h1 */

test("M6 s01 · 7 · the visible headline is the one h1, and still names the brand", async ({ page }) => {
  await open(page);
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toHaveCount(1);
  await expect(h1).toContainText(HEADLINE);
  await expect(h1).toHaveAccessibleName(/StorySyncHQ/);
  await expect(h1).toBeVisible();
  // the visible line is the h1 itself, not a paragraph beside it
  await expect(page.locator("h1.ls-hero-line")).toHaveCount(1);
  await expect(page.locator("p.ls-hero-line")).toHaveCount(0);
});

/* ------------------------------------------------- 8 · no invented numbers */

test("M6 s01 · 8 · the how-it-works eyebrow carries no invented number", async ({ page }) => {
  await open(page);
  const eyebrow = page.locator('section[aria-labelledby="ls-how-title"] .ls-eyebrow');
  await expect(eyebrow).toHaveText("Three steps · one tape");
  await expect(eyebrow).not.toHaveText(/minute/i);
});

/* ---------------------------------------------- 9 · the tape pack, s01 hero */

test("M6 s01 · 9 · the hero cassette: a tape pack behind the left reel only, a smoked-brown window", async ({
  page,
}) => {
  await open(page, { width: 1080, height: 675 });
  const r = await page.evaluate(() => {
    const win = document.querySelector<HTMLElement>(".ls-hero .ls-cassette .sk-cassette-window")!;
    const reels = [...win.querySelectorAll<HTMLElement>(":scope > .sk-reel")];
    const pack = (el: HTMLElement) => {
      const cs = getComputedStyle(el, "::before");
      return { content: cs.content, image: cs.backgroundImage, w: parseFloat(cs.width) };
    };
    const rgb = [...getComputedStyle(win).backgroundImage.matchAll(/rgba?\(([^)]+)\)/g)].map((m) =>
      m[1].split(/[\s,/]+/).filter(Boolean).map(Number),
    );
    return {
      count: reels.length,
      left: pack(reels[0]!),
      right: pack(reels[1]!),
      // the reel's layout box (the svg spins, so its rotated rect would be wider)
      reelW: reels[0]!.offsetWidth,
      stops: rgb,
    };
  });
  expect(r.count).toBe(2);
  expect(r.left.image).toContain("radial-gradient");
  expect(r.left.w / r.reelW, `pack ${r.left.w} vs reel ${r.reelW}`).toBeGreaterThanOrEqual(1.3);
  expect(r.right.image.includes("radial-gradient") && r.right.content !== "none").toBe(false);
  // smoked brown, not near-black: some stop is warm (red well above blue) and lit
  const warm = r.stops.filter(([red, , blue]) => red - blue >= 20 && red >= 60);
  expect(warm.length, JSON.stringify(r.stops)).toBeGreaterThan(0);
});
