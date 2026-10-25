/**
 * T05b · Tape stock aligned — TapeLabel and Reel match the reference, and the
 * landing hero's cassette is the kit `Cassette`
 * (docs/vision/tickets/T05b-tape-stock-aligned.md).
 *
 * Reference: foundation.css `.ss-tape`, `.ss-cassette`, `.ss-reel` and the
 * `#i-reel` symbol; s01 (hero cassette), s05 (printing label, phone cover),
 * s06/s07 (labels on the end card and the shelf). The brief's "Tape stock":
 *   · 3px ink border, radius 12, a 10px tape-red stripe over a 3px ink rule;
 *   · a label-yellow band, mono 600 11px at 0.2em, two filled ink holes at the
 *     left and "STORYSYNC" at the right;
 *   · a ruled paper field (27/28px lines at rgba(30,26,22,.07)), a Fraunces
 *     800 title (28px from 640px up, never under 20px), an italic 500 16px
 *     author in --ss-ink-2 prefixed "by ", and a mono 500 11px meta at 0.15em,
 *     uppercase, full ink, no rule and no opacity;
 *   · a reel at rest sits on the reference's static 18° frame.
 *
 * Seam: the computed styles of the real labels where they render — the Read
 * Room chooser, the Twinkle cover (T00 openTapeInReadRoom), the end card, the
 * publish card (T00 seedStudioDraft → Finish → gate), the landing teaser,
 * /protocol's demo download — and the hero cassette on `/`. No dev route.
 *
 * Expected values are literals here, never imported from the source, so the
 * test can fail.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { openTapeInReadRoom, restoreDraft, seedStudioDraft } from "./fixtures/helpers";
import { TWINKLE } from "./fixtures/tapes";

const INK = "rgb(30, 26, 22)";
const INK_2 = "rgb(90, 81, 72)";
const RED = "rgb(227, 69, 47)";
const LABEL_YELLOW = "rgb(255, 201, 60)";

/** cos/sin of 18°: the reference's static reel frame, `rotate(18deg)`. */
const COS_18 = Math.cos((18 * Math.PI) / 180);
const SIN_18 = Math.sin((18 * Math.PI) / 180);

const PHONE = { width: 375, height: 812 } as const;

/* ------------------------------------------------------------- reading */

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

interface TapeReading {
  border: { width: string; style: string; color: string; radiusBottom: string };
  box: Box;
  stripe: { height: string; bg: string; ruleWidth: string; ruleColor: string } | null;
  band: {
    bg: string;
    ruleWidth: string;
    text: string;
    family: string;
    weight: string;
    size: string;
    spacing: number;
    transform: string;
    opacity: string;
    color: string;
    holes: Array<{ bg: string; width: number; height: number; radius: string; right: number }>;
    markLeft: number;
    bandLeft: number;
    bandRight: number;
    markRight: number;
  } | null;
  field: { bgImage: string } | null;
  title: {
    weight: string;
    family: string;
    size: number;
    scrollWidth: number;
    clientWidth: number;
    box: Box;
  } | null;
  author: {
    style: string;
    weight: string;
    size: string;
    color: string;
    family: string;
    text: string;
  } | null;
  meta: {
    size: string;
    weight: string;
    spacing: number;
    transform: string;
    opacity: string;
    ruleStyle: string;
    color: string;
    family: string;
  } | null;
  /** The first family of next/font's Fraunces and IBM Plex Mono variables. */
  fraunces: string;
  plex: string;
}

/** Everything the brief fixes about one `[data-sk="tape"]`, read off the live element. */
async function readTape(tape: Locator): Promise<TapeReading> {
  return tape.evaluate((el) => {
    const first = (v: string) => v.split(",")[0].trim().replace(/^["']|["']$/g, "");
    const root = getComputedStyle(document.documentElement);
    const box = (n: Element) => {
      const r = n.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const cs = getComputedStyle(el);
    const stripeEl = el.querySelector(".sk-tape-stripe");
    const bandEl = el.querySelector(".sk-tape-band");
    const markEl = el.querySelector(".sk-tape-mark");
    const fieldEl = el.querySelector(".sk-tape-field");
    const titleEl = el.querySelector<HTMLElement>(".sk-tape-title");
    const authorEl = el.querySelector(".sk-tape-author");
    const metaEl = el.querySelector(".sk-tape-meta");

    const stripe = stripeEl
      ? (() => {
          const s = getComputedStyle(stripeEl);
          return {
            height: s.height,
            bg: s.backgroundColor,
            ruleWidth: s.borderBottomWidth,
            ruleColor: s.borderBottomColor,
          };
        })()
      : null;

    const band =
      bandEl && markEl
        ? (() => {
            const b = getComputedStyle(bandEl);
            const m = getComputedStyle(markEl);
            const holes = [...bandEl.querySelectorAll(".sk-tape-hole")].map((h) => {
              const hs = getComputedStyle(h);
              const r = h.getBoundingClientRect();
              return {
                bg: hs.backgroundColor,
                width: r.width,
                height: r.height,
                radius: hs.borderTopLeftRadius,
                right: r.right,
              };
            });
            const br = bandEl.getBoundingClientRect();
            const mr = markEl.getBoundingClientRect();
            return {
              bg: b.backgroundColor,
              ruleWidth: b.borderBottomWidth,
              text: bandEl.textContent ?? "",
              family: m.fontFamily,
              weight: m.fontWeight,
              size: m.fontSize,
              spacing: Number.parseFloat(m.letterSpacing),
              transform: m.textTransform,
              opacity: m.opacity,
              color: m.color,
              holes,
              markLeft: mr.left,
              markRight: mr.right,
              bandLeft: br.left,
              bandRight: br.right,
            };
          })()
        : null;

    const title = titleEl
      ? (() => {
          const t = getComputedStyle(titleEl);
          return {
            weight: t.fontWeight,
            family: t.fontFamily,
            size: Number.parseFloat(t.fontSize),
            scrollWidth: titleEl.scrollWidth,
            clientWidth: titleEl.clientWidth,
            box: box(titleEl),
          };
        })()
      : null;

    const author = authorEl
      ? (() => {
          const a = getComputedStyle(authorEl);
          return {
            style: a.fontStyle,
            weight: a.fontWeight,
            size: a.fontSize,
            color: a.color,
            family: a.fontFamily,
            text: (authorEl.textContent ?? "").trim(),
          };
        })()
      : null;

    const meta = metaEl
      ? (() => {
          const m = getComputedStyle(metaEl);
          return {
            size: m.fontSize,
            weight: m.fontWeight,
            spacing: Number.parseFloat(m.letterSpacing),
            transform: m.textTransform,
            opacity: m.opacity,
            ruleStyle: m.borderTopStyle,
            color: m.color,
            family: m.fontFamily,
          };
        })()
      : null;

    return {
      border: {
        width: cs.borderTopWidth,
        style: cs.borderTopStyle,
        color: cs.borderTopColor,
        radiusBottom: cs.borderBottomLeftRadius,
      },
      box: box(el),
      stripe,
      band,
      field: fieldEl ? { bgImage: getComputedStyle(fieldEl).backgroundImage } : null,
      title,
      author,
      meta,
      fraunces: first(root.getPropertyValue("--font-fraunces")),
      plex: first(root.getPropertyValue("--font-plex-mono")),
    };
  });
}

/**
 * Check 1 of the ticket, plus the rest of the brief's label: the same rules
 * for every consumer. `viewportWidth` picks the title size rule (28px from
 * 640px up, a clamp no lower than 20px below). `author` is false for a label
 * that carries none (the Read Room's file and blank tapes).
 */
function expectAlignedTape(
  r: TapeReading,
  where: string,
  { viewportWidth, author = true }: { viewportWidth: number; author?: boolean },
) {
  // outer card: 3px solid ink, radius 12 (the bottom corners — the Player
  // cover squares off its top under the shell on purpose)
  expect(r.border.width, `${where}: border width`).toBe("3px");
  expect(r.border.style, `${where}: border style`).toBe("solid");
  expect(r.border.color, `${where}: border colour`).toBe(INK);
  expect(r.border.radiusBottom, `${where}: radius`).toBe("12px");

  // stripe: 10px tape-red over a 3px ink rule
  expect(r.stripe, `${where}: stripe`).not.toBeNull();
  expect(r.stripe!.height, `${where}: stripe height`).toBe("10px");
  expect(r.stripe!.bg, `${where}: stripe colour`).toBe(RED);
  expect(r.stripe!.ruleWidth, `${where}: stripe rule`).toBe("3px");
  expect(r.stripe!.ruleColor, `${where}: stripe rule colour`).toBe(INK);

  // band: mono 600 11px at 0.2em, uppercase, full ink; "STORYSYNC" at the
  // right, two filled 10px ink holes at the left
  expect(r.band, `${where}: band`).not.toBeNull();
  const band = r.band!;
  expect(band.bg, `${where}: band colour`).not.toBe("rgba(0, 0, 0, 0)");
  expect(band.ruleWidth, `${where}: band rule`).toBe("3px");
  expect(band.text, `${where}: band text`).toMatch(/storysync/i);
  expect(band.family, `${where}: band family`).toContain(r.plex);
  expect(band.weight, `${where}: band weight`).toBe("600");
  expect(band.size, `${where}: band size`).toBe("11px");
  expect(band.spacing, `${where}: band tracking (0.2em of 11px)`).toBeCloseTo(2.2, 1);
  expect(band.transform, `${where}: band case`).toBe("uppercase");
  expect(band.opacity, `${where}: band text opacity`).toBe("1");
  expect(band.color, `${where}: band text colour`).toBe(INK);
  expect(band.holes, `${where}: two holes`).toHaveLength(2);
  for (const hole of band.holes) {
    expect(hole.bg, `${where}: a hole is filled ink`).toBe(INK);
    expect(hole.width, `${where}: hole width`).toBeCloseTo(10, 0);
    expect(hole.height, `${where}: hole height`).toBeCloseTo(10, 0);
    expect(hole.radius, `${where}: a hole is round`).not.toBe("0px");
    expect(hole.right, `${where}: holes sit left of the mark`).toBeLessThan(band.markLeft);
  }
  const bandMid = (band.bandLeft + band.bandRight) / 2;
  expect(band.markLeft, `${where}: "STORYSYNC" sits at the right`).toBeGreaterThan(bandMid);

  // field: ruled paper, 27/28px lines at rgba(30,26,22,.07)
  expect(r.field, `${where}: field`).not.toBeNull();
  expect(r.field!.bgImage, `${where}: ruled field`).toContain("repeating-linear-gradient");
  expect(r.field!.bgImage, `${where}: rule colour`).toContain("rgba(30, 26, 22, 0.07)");
  expect(r.field!.bgImage, `${where}: rule pitch`).toMatch(/27px.*28px/);

  // title: Fraunces 800, 28px from 640px up, a clamp no lower than 20px below
  expect(r.title, `${where}: title`).not.toBeNull();
  const title = r.title!;
  expect(r.fraunces, "next/font Fraunces variable").not.toBe("");
  expect(title.family, `${where}: title family`).toContain(r.fraunces);
  expect(title.weight, `${where}: title weight`).toBe("800");
  if (viewportWidth >= 640) {
    expect(title.size, `${where}: title size at ${viewportWidth}px`).toBe(28);
  } else {
    expect(title.size, `${where}: title size at ${viewportWidth}px`).toBeGreaterThanOrEqual(20);
    expect(title.size, `${where}: title size at ${viewportWidth}px`).toBeLessThanOrEqual(28);
  }
  // the title wraps inside the card instead of running out of it
  expect(title.scrollWidth, `${where}: title overflows its box`).toBeLessThanOrEqual(
    title.clientWidth + 1,
  );
  expect(title.box.right, `${where}: title inside the card`).toBeLessThanOrEqual(r.box.right);

  // author: Fraunces italic 500 16px, --ss-ink-2, "by …"
  if (author) {
    expect(r.author, `${where}: author`).not.toBeNull();
    const a = r.author!;
    expect(a.style, `${where}: author style`).toBe("italic");
    expect(a.weight, `${where}: author weight`).toBe("500");
    expect(a.size, `${where}: author size`).toBe("16px");
    expect(a.color, `${where}: author colour`).toBe(INK_2);
    expect(a.family, `${where}: author family`).toContain(r.fraunces);
    expect(a.text, `${where}: author prefix`).toMatch(/^by /);
  }

  // meta: mono 500 11px at 0.15em, uppercase, full ink, no rule, no opacity
  expect(r.meta, `${where}: meta`).not.toBeNull();
  const meta = r.meta!;
  expect(meta.family, `${where}: meta family`).toContain(r.plex);
  expect(meta.size, `${where}: meta size`).toBe("11px");
  expect(meta.weight, `${where}: meta weight`).toBe("500");
  expect(meta.spacing, `${where}: meta tracking (0.15em of 11px)`).toBeCloseTo(1.65, 1);
  expect(meta.transform, `${where}: meta case`).toBe("uppercase");
  expect(meta.opacity, `${where}: meta opacity`).toBe("1");
  expect(meta.ruleStyle, `${where}: meta top rule`).toBe("none");
  expect(meta.color, `${where}: meta colour`).toBe(INK);
}

function viewportWidth(page: Page): number {
  return page.viewportSize()?.width ?? 1280;
}

/**
 * No horizontal page scroll, and every label on the page sits inside the
 * viewport. `pageScroll: false` checks the labels only — for the publish card,
 * whose Studio underneath already scrolls sideways at 375px for a reason that
 * is not a label (the Transport row; see docs/vision/evidence/tickets/T05b.md).
 */
async function expectNoSideScroll(
  page: Page,
  where: string,
  { pageScroll = true }: { pageScroll?: boolean } = {},
) {
  const r = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
    tapes: [...document.querySelectorAll('[data-sk="tape"]')].map((t) => {
      const b = t.getBoundingClientRect();
      return { left: Math.round(b.left), right: Math.round(b.right) };
    }),
  }));
  if (pageScroll) {
    expect(r.scroll, `${where}: page scrolls sideways`).toBeLessThanOrEqual(r.inner);
  }
  expect(r.tapes.length, `${where}: a label to check`).toBeGreaterThan(0);
  for (const t of r.tapes) {
    expect(t.left, `${where}: a label starts off screen`).toBeGreaterThanOrEqual(0);
    expect(t.right, `${where}: a label runs off screen`).toBeLessThanOrEqual(r.inner);
  }
}

/* ---------------------------------------------------------- publish flow */

/**
 * The Studio publish: Finish → the grown-up gate (the a×b answer read from its
 * label, "story by", every consent box the gate shows) → "Your tape is ready".
 */
async function publishTwinkle(page: Page): Promise<void> {
  await seedStudioDraft(page, "twinkle");
  await page.goto("/studio");
  await restoreDraft(page);
  await page.getByRole("button", { name: "Finish my story" }).click();

  const question = page.locator('label[for="studio-gate-answer"]');
  await expect(question).toBeVisible({ timeout: 10000 });
  const match = (await question.innerText()).match(/(\d+)\s*[×x*]\s*(\d+)/);
  expect(match, "the gate asks an a×b question").not.toBeNull();
  await page.locator("#studio-gate-answer").fill(String(Number(match![1]) * Number(match![2])));
  await page.locator("#studio-gate-author").fill(TWINKLE.byline);

  const gate = page.getByRole("dialog").filter({ has: page.locator("#studio-gate-answer") });
  const boxes = gate.locator('input[type="checkbox"]');
  for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your tape is ready" })).toBeVisible({
    timeout: 30000,
  });
}

/* ------------------------------------------------------------- the label */

test.describe("tape stock · TapeLabel matches the reference", () => {
  test("1 · /read chooser: the demo tape's label", async ({ page }) => {
    await page.goto("/read");
    const tape = page.locator('[data-sk="tape"]').first();
    await expect(tape).toContainText("The Brave Little Star");
    expectAlignedTape(await readTape(tape), "/read chooser", {
      viewportWidth: viewportWidth(page),
    });
  });

  test("1b · /read chooser: the file and blank tapes keep their accent bands, aligned", async ({
    page,
  }) => {
    await page.goto("/read");
    const tapes = page.locator('[data-sk="tape"]');
    await expect(tapes).toHaveCount(3);
    const bands: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await readTape(tapes.nth(i));
      expectAlignedTape(r, `/read chooser #${i + 1}`, {
        viewportWidth: viewportWidth(page),
        author: i === 0,
      });
      bands.push(r.band!.bg);
    }
    // the demo tape carries the label yellow; the other two keep their accents
    expect(bands[0]).toBe(LABEL_YELLOW);
    expect(new Set(bands).size, "accent bands stay distinct").toBe(3);
  });

  test("2 · the Twinkle cover at 375×812: aligned, and no sideways scroll", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openTapeInReadRoom(page, "twinkle");
    const tape = page.locator('[data-pl="cover"] [data-sk="tape"]');
    await expect(tape).toContainText(TWINKLE.title);
    expectAlignedTape(await readTape(tape), "Twinkle cover", { viewportWidth: PHONE.width });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      PHONE.width,
    );
  });

  test("5 · the publish card's printing label", async ({ page }) => {
    test.setTimeout(90000);
    await publishTwinkle(page);
    const tape = page.locator(".studio-printing[data-sk='tape']");
    await expect(tape).toBeVisible();
    await expect(tape).toContainText(TWINKLE.title);
    expectAlignedTape(await readTape(tape), "publish card", {
      viewportWidth: viewportWidth(page),
    });
  });
});

/* ------------------------------------------------- every consumer, phone */

test.describe("tape stock · every TapeLabel consumer at 375×812", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
  });

  test("/read: the three choices", async ({ page }) => {
    await page.goto("/read");
    const tapes = page.locator('[data-sk="tape"]');
    await expect(tapes).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      expectAlignedTape(await readTape(tapes.nth(i)), `/read #${i + 1}`, {
        viewportWidth: PHONE.width,
        author: i === 0,
      });
    }
    await expectNoSideScroll(page, "/read");
  });

  test("the Twinkle end card", async ({ page }) => {
    test.setTimeout(90000);
    await openTapeInReadRoom(page, "twinkle");
    await page.getByRole("button", { name: /Tap to Begin/ }).click();
    const root = page.locator(".pl-root");
    await expect(root).toHaveAttribute("data-view", "page");
    for (let i = 0; i < 12; i++) {
      if ((await root.getAttribute("data-view")) === "end") break;
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(320);
    }
    await expect(root).toHaveAttribute("data-view", "end");
    const tape = page.locator('[data-pl="end"] [data-sk="tape"]');
    await expect(tape).toBeVisible();
    expectAlignedTape(await readTape(tape), "end card", { viewportWidth: PHONE.width });
    await expectNoSideScroll(page, "end card");
  });

  test("the publish card", async ({ page }) => {
    test.setTimeout(90000);
    await publishTwinkle(page);
    const tape = page.locator(".studio-printing[data-sk='tape']");
    await expect(tape).toBeVisible();
    expectAlignedTape(await readTape(tape), "publish card", { viewportWidth: PHONE.width });
    await expectNoSideScroll(page, "publish card", { pageScroll: false });
  });

  test("/: the protocol teaser", async ({ page }) => {
    await page.goto("/");
    const tape = page.locator('.ls-protocol-tape [data-sk="tape"]');
    await tape.scrollIntoViewIfNeeded();
    await expect(tape).toContainText("The Brave Little Star");
    expectAlignedTape(await readTape(tape), "landing teaser", { viewportWidth: PHONE.width });
    await expectNoSideScroll(page, "/");
  });

  test("/protocol: the demo download label", async ({ page }) => {
    await page.goto("/protocol");
    const tape = page.locator('.pr-take-tape [data-sk="tape"]');
    await tape.scrollIntoViewIfNeeded();
    await expect(tape).toContainText("The Brave Little Star");
    expectAlignedTape(await readTape(tape), "/protocol download", { viewportWidth: PHONE.width });
    await expectNoSideScroll(page, "/protocol");
  });
});

/* ---------------------------------------------------- the hero cassette */

const HERO_CASSETTE = '[data-ls="tape-slide"] [data-sk="cassette"]';

test.describe("tape stock · the hero is the kit Cassette", () => {
  test("3 · / renders <Cassette className='ls-cassette'> in the tape slide", async ({ page }) => {
    await page.goto("/");
    const cassette = page.locator(HERO_CASSETTE);
    await expect(cassette).toHaveCount(1);
    await expect(cassette).toHaveClass(/(^|\s)ls-cassette(\s|$)/);
    // decorative: the hero's accessible name stays on its button
    await expect(cassette).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator('[data-ls="press-play"]')).toHaveAccessibleName(/press play/i);

    await expect(cassette.locator('[data-sk="reel"]')).toHaveCount(2);
    await expect(cassette.locator(".sk-cassette-screw")).toHaveCount(4);
    await expect(cassette.locator(".sk-cassette-window")).toHaveCount(1);
    await expect(cassette.locator(".sk-cassette-window .sk-cassette-ribbon")).toHaveCount(1);
    await expect(cassette.locator(".sk-cassette-window [data-sk='reel']")).toHaveCount(2);
    await expect(cassette.locator(".sk-cassette-foot")).toHaveCount(1);

    // the label: stripe, band with holes and STORYSYNC, title and meta —
    // still today's hero text until T06
    const label = cassette.locator(".sk-cassette-label");
    await expect(label).toHaveCount(1);
    await expect(label.locator(".sk-tape-stripe")).toHaveCount(1);
    await expect(label.locator(".sk-tape-band")).toContainText(/storysync/i);
    await expect(label.locator(".sk-tape-band .sk-tape-hole")).toHaveCount(2);
    await expect(label.locator(".sk-tape-title")).toHaveText("StorySyncHQ");
    await expect(label.locator(".sk-tape-meta")).toHaveText("SIDE A · PRESS PLAY");

    // the hand-built markup is gone
    await expect(page.locator(".ls-screw, .ls-cassette-window, .ls-cassette-foot, .ls-cassette-label")).toHaveCount(0);

    // the .ss-cassette look
    const look = await cassette.evaluate((node) => {
      const el = node as HTMLElement;
      const cs = getComputedStyle(el);
      const label = el.querySelector<HTMLElement>(".sk-cassette-label")!;
      const pad = Number.parseFloat(cs.paddingTop) + Number.parseFloat(cs.paddingBottom);
      const ls = getComputedStyle(label);
      const foot = el.querySelector(".sk-cassette-foot");
      return {
        radius: cs.borderTopLeftRadius,
        bg: cs.backgroundImage,
        foot: foot ? getComputedStyle(foot).backgroundImage : "",
        aspect: el.offsetWidth / el.offsetHeight,
        labelShare: label.offsetHeight / (el.clientHeight - pad),
        labelBorder: ls.borderTopWidth,
        labelColor: ls.borderTopColor,
        labelRadius: ls.borderTopLeftRadius,
      };
    });
    expect(look.radius).toBe("20px");
    expect(look.bg).toMatch(/^linear-gradient\(165deg/);
    // --ss-shell-hi → --ss-shell → --ss-shell-2
    expect(look.bg).toContain("rgb(74, 68, 62)");
    expect(look.bg).toContain("rgb(59, 55, 51)");
    expect(look.bg).toContain("rgb(44, 41, 38)");
    // the foot: --ss-foot-1 → --ss-foot-2
    expect(look.foot).toContain("rgb(46, 42, 39)");
    expect(look.foot).toContain("rgb(36, 33, 31)");
    expect(look.aspect).toBeCloseTo(1.6, 1);
    expect(look.labelShare).toBeCloseTo(0.74, 1);
    expect(look.labelBorder).toBe("3px");
    expect(look.labelColor).toBe(INK);
    expect(look.labelRadius).toBe("10px");

    // the reference ink reel (#i-reel): ink rim on a paper face, a dashed
    // inner circle, six round-capped spokes, a solid hub
    const reel = await cassette
      .locator("[data-sk='reel'] svg")
      .first()
      .evaluate((svg) => {
        const style = (sel: string) => {
          const el = svg.querySelector(sel);
          return el ? getComputedStyle(el) : null;
        };
        const rim = style(".sk-reel-rim");
        const dash = style(".sk-reel-dash");
        const spoke = style(".sk-reel-spoke");
        const hub = style(".sk-reel-hub");
        return {
          rimR: svg.querySelector(".sk-reel-rim")?.getAttribute("r"),
          rim: rim && { fill: rim.fill, stroke: rim.stroke, width: rim.strokeWidth },
          dashR: svg.querySelector(".sk-reel-dash")?.getAttribute("r"),
          dash: dash && { fill: dash.fill, array: dash.strokeDasharray, width: dash.strokeWidth },
          spokes: svg.querySelectorAll(".sk-reel-spoke").length,
          spoke: spoke && { cap: spoke.strokeLinecap, width: spoke.strokeWidth },
          hubR: svg.querySelector(".sk-reel-hub")?.getAttribute("r"),
          hub: hub && { fill: hub.fill },
        };
      });
    expect(reel.rimR).toBe("46");
    expect(reel.rim).toEqual({ fill: "rgb(255, 253, 246)", stroke: INK, width: "4px" });
    expect(reel.dashR).toBe("31");
    expect(reel.dash).toEqual({ fill: "none", array: "5px, 5px", width: "2.4px" });
    expect(reel.spokes).toBe(6);
    expect(reel.spoke).toEqual({ cap: "round", width: "5px" });
    expect(reel.hubR).toBe("9");
    expect(reel.hub).toEqual({ fill: INK });
  });

  test("4 · / under reduced motion: every reel rests on the 18° frame, no animation", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator(HERO_CASSETTE)).toHaveCount(1);
    const reels = await page.evaluate(() =>
      [...document.querySelectorAll('[data-sk="reel"] svg')].map((svg) => {
        const cs = getComputedStyle(svg);
        const m = new DOMMatrixReadOnly(cs.transform === "none" ? undefined : cs.transform);
        return { name: cs.animationName, a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f };
      }),
    );
    expect(reels.length, "the hero and the door carry reels").toBeGreaterThanOrEqual(4);
    for (const r of reels) {
      expect(r.name).toBe("none");
      expect(r.a).toBeCloseTo(COS_18, 3);
      expect(r.b).toBeCloseTo(SIN_18, 3);
      expect(r.c).toBeCloseTo(-SIN_18, 3);
      expect(r.d).toBeCloseTo(COS_18, 3);
      expect(r.e).toBeCloseTo(0, 3);
      expect(r.f).toBeCloseTo(0, 3);
    }
  });

  test("4b · a reel that is not spinning rests on the 18° frame too, not 0°", async ({ page }) => {
    await page.goto("/");
    // the door reels never spin until pointed at
    const door = page.locator('.ls-door-reels [data-sk="reel"]').first();
    await expect(door).toHaveAttribute("data-spinning", "false");
    const m = await door.locator("svg").evaluate((svg) => {
      const t = getComputedStyle(svg).transform;
      const mm = new DOMMatrixReadOnly(t === "none" ? undefined : t);
      return { a: mm.a, b: mm.b };
    });
    expect(m.a).toBeCloseTo(COS_18, 3);
    expect(m.b).toBeCloseTo(SIN_18, 3);
  });

  test("the hero cassette sits inside the phone at 375×812", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/");
    const box = await page.locator(HERO_CASSETTE).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
    expect(box!.height).toBeGreaterThan(120);
    await expectNoSideScroll(page, "/ hero");
  });
});

/* ------------------------------------------------- colours are tokens */

function readSource(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

test.describe("tape stock · every colour is an SSYNC token (node)", () => {
  test("cassette.css: no colour literal; the shell, foot and ribbon tokens", () => {
    const css = readSource("src/components/studio-kit/cassette.css");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i);
    for (const token of [
      "--ss-shell-hi",
      "--ss-shell",
      "--ss-shell-2",
      "--ss-foot-1",
      "--ss-foot-2",
      "--ss-tape-brown",
      "--ss-ink",
      "--ss-paper",
    ]) {
      expect(css, token).toContain(`var(${token})`);
    }
    // every tint starts from a token (mixed with transparent or another token)
    const mixes = [...css.matchAll(/color-mix\(in srgb,\s*([^\s,]+)/g)];
    expect(mixes.length, "the shell and window tints").toBeGreaterThan(0);
    for (const mix of mixes) expect(mix[1], mix[0]).toMatch(/^var\(--ss-[a-z0-9-]+\)$/);
  });

  test("kit.css: the .sk-tape* and .sk-reel* rules carry no hex literal", () => {
    const css = readSource("src/components/studio-kit/kit.css");
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selector]) =>
      /\.sk-(tape|reel)/.test(selector),
    );
    expect(rules.length, "tape and reel rules found").toBeGreaterThanOrEqual(12);
    for (const [, selector, body] of rules) {
      expect(body, selector.trim()).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      // the one literal tint is the ruled-paper line the brief fixes: ink at 7%
      for (const literal of body.matchAll(/\brgba?\([^)]*\)/g)) {
        expect(literal[0], selector.trim()).toBe("rgba(30, 26, 22, 0.07)");
      }
    }
  });
});
