// T13b · The tape: the filmstrip as a strip of tape, with voice badges, the
// page being told, "Snap the next drawing", the locked move pill and the mood
// lane underneath ("WONDER · GENTLE MUSIC ADDED FOR YOU").
//
// Reference: s03 "Snap. Tell. Hear it." (docs/vision/reference/renders/s03.png,
// brief screens[2]) — the Twinkle draft on a 1180×820 tablet, page 3 mid-take.
//
//   ribbon  · one kit TapeRibbon (band) behind the frames at mid-height
//   frames  · 112×84 at ≥ 1024 (84×62 below), names kept, lucide badges
//   live    · a static red dot at the top-right of the page being told
//   snap    · "Snap the next drawing" adds a page and opens the camera
//   move    · three named controls; mid-take one locked "move" pill
//   lane    · one mood segment per page under its frame, the label at the end
//   phone   · the strip scrolls inside itself; the page never scrolls sideways
//   motion  · reduced motion: no transition, no transform on frames
//
// The family content is illustrative and lives in tests/fixtures only.

import path from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { restoreDraft, seedStudioDraft } from "./fixtures/helpers";
import { stubMicrophone } from "./fixtures/mic";

/* ------------------------------------------------------------------ facts */

type Size = { width: number; height: number };
const TABLET: Size = { width: 1180, height: 820 };
const NARROW: Size = { width: 900, height: 800 };
const PHONE: Size = { width: 375, height: 812 };
const SHORT_LAPTOP: Size = { width: 1366, height: 650 };

const GOLD = "rgb(245, 158, 11)";
const WONDER = "rgb(245, 181, 68)"; // --mood-wonder #f5b544
const CALM = "rgb(93, 180, 232)"; // --mood-calm #5db4e8
/** Anything that reads as an emoji or a pictograph glyph standing in for an icon. */
const PICTOGRAPH = /[\u{1F000}-\u{1FAFF}☀-➿⌀-⏿■-◿⬀-⯿✎\u{FE0F}]/u;

const LOCKED = "Finish the recording first";
const SNAP = "Snap the next drawing";
const MOVES = ["Move this page earlier", "Move this page later", "Delete this page"] as const;
const MOVE_ICON: Record<(typeof MOVES)[number], string> = {
  "Move this page earlier": "lucide-chevron-left",
  "Move this page later": "lucide-chevron-right",
  "Delete this page": "lucide-trash-2",
};

const SEL = {
  pages: 'section[aria-label="Pages"]',
  scroller: '[data-studio="film-scroll"]',
  ribbon: '[data-sk="tape-ribbon"]',
  live: '[data-studio="frame-live"]',
  lane: '[data-studio="mood-lane"]',
  segment: '[data-studio="mood-segment"]',
  laneLabel: '[data-studio="mood-lane-label"]',
  moves: '[data-studio="film-moves"]',
  card: '[data-studio="tool-card"]',
} as const;

/* ---------------------------------------------------------------- helpers */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
  cx: number;
  cy: number;
}

async function box(locator: Locator): Promise<Box> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      right: r.right,
      bottom: r.bottom,
      cx: r.x + r.width / 2,
      cy: r.y + r.height / 2,
    };
  });
}

const strip = (page: Page) => page.locator(SEL.pages);
/** Every page frame, in order (the Snap tile is not a page). */
const frames = (page: Page) => strip(page).getByRole("button", { name: /^Page \d/ });
const frame = (page: Page, n: number) => strip(page).getByRole("button", { name: new RegExp(`^Page ${n}\\b`) });
const snap = (page: Page) => strip(page).getByRole("button", { name: SNAP, exact: true });
const recButton = (page: Page) => page.locator('[data-sk="transport"][data-kind="rec"]');

/** Wait for every finite animation to land, so boxes are measured at rest. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((a) => Number.isFinite(a.effect?.getComputedTiming().iterations ?? Infinity));
    await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

interface OpenOptions {
  viewport?: Size;
  pageNumber?: number;
  reducedMotion?: boolean;
}

/** Twinkle restored from this device's draft, page 3 (by default) selected. */
async function openTwinkle(page: Page, opts: OpenOptions = {}): Promise<void> {
  const { viewport = TABLET, pageNumber = 3, reducedMotion = false } = opts;
  await page.setViewportSize(viewport);
  if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await stubMicrophone(page);
  await seedStudioDraft(page, "twinkle");
  await page.goto("/studio");
  await restoreDraft(page);
  await expect(frames(page)).toHaveCount(5);
  if (pageNumber !== 1) {
    await frame(page, pageNumber).click();
    await expect(strip(page).getByRole("button", { name: new RegExp(`^Page ${pageNumber}\\b.*selected`) })).toHaveCount(1);
  }
  await settle(page);
}

async function startTake(page: Page): Promise<void> {
  await recButton(page).click();
  await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);
}

async function stopTake(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Stop —/ }).click();
  await expect(page.locator(".studio[data-recording='true']")).toHaveCount(0, { timeout: 10000 });
}

/** The Music tool's card, opened from the rail. */
async function openMusic(page: Page): Promise<Locator> {
  await page.locator('nav[aria-label="Story tools"]').getByRole("button", { name: "Music", exact: true }).click();
  const card = page.locator(SEL.card);
  await expect(card).toBeVisible();
  return card;
}

/* ================================================================== ribbon */

test.describe("T13b · the tape ribbon", () => {
  test("one kit TapeRibbon (band), aria-hidden, spanning the strip at the frames' mid-height", async ({ page }) => {
    await openTwinkle(page);
    const ribbon = strip(page).locator(SEL.ribbon);
    await expect(ribbon).toHaveCount(1);
    await expect(ribbon).toHaveAttribute("aria-hidden", "true");
    await expect(ribbon).toHaveAttribute("data-variant", "band");

    const r = await box(ribbon);
    const scroller = await box(strip(page).locator(SEL.scroller));
    const first = await box(frames(page).first());
    const tile = await box(snap(page));
    expect(r.x, "the ribbon starts at the strip's left edge").toBeLessThanOrEqual(scroller.x + 0.5);
    expect(r.right, "the ribbon runs to the strip's right edge").toBeGreaterThanOrEqual(scroller.right - 0.5);
    expect(r.x).toBeLessThan(first.x);
    expect(r.right).toBeGreaterThan(tile.right);
    expect(r.height, "a band, not a line").toBeGreaterThanOrEqual(8);
    expect(r.height).toBeLessThanOrEqual(14);

    for (let n = 1; n <= 5; n++) {
      const f = await box(frame(page, n));
      expect(Math.abs(r.cy - f.cy), `ribbon centre vs frame ${n} centre`).toBeLessThanOrEqual(6);
    }
    expect(await ribbon.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("linear-gradient");
  });

  test("painted behind the frames: a frame's centre hits the frame, the gap between two frames hits the ribbon", async ({ page }) => {
    await openTwinkle(page);
    const r = await box(strip(page).locator(SEL.ribbon));
    for (let n = 1; n <= 5; n++) {
      const f = await box(frame(page, n));
      const hit = await page.evaluate(
        ([x, y, name]) => {
          const el = document.elementFromPoint(x, y);
          return el?.closest("button")?.getAttribute("aria-label")?.startsWith(name) ?? false;
        },
        [f.cx, f.cy, `Page ${n}`] as const,
      );
      expect(hit, `frame ${n} is on top of the ribbon`).toBe(true);
    }
    const one = await box(frame(page, 1));
    const two = await box(frame(page, 2));
    expect(two.x - one.right, "a visible gap between frames").toBeGreaterThanOrEqual(6);
    const between = await page.evaluate(
      ([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('[data-sk="tape-ribbon"]')),
      [(one.right + two.x) / 2, r.cy] as const,
    );
    expect(between, "between frames the ribbon shows").toBe(true);
  });

  test("the strip keeps its horizontal scroll and snap, with no sprocket rows", async ({ page }) => {
    await openTwinkle(page);
    const scroller = strip(page).locator(SEL.scroller);
    const css = await scroller.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { overflowX: cs.overflowX, snap: cs.scrollSnapType };
    });
    expect(css.overflowX).toBe("auto");
    expect(css.snap).toMatch(/^x\b/);
    for (const f of await frames(page).all()) {
      expect(await f.evaluate((el) => getComputedStyle(el).scrollSnapAlign)).toBe("center");
    }
    // sprocket-free: no repeating stripe on the strip or its pseudo-elements
    const sprockets = await strip(page).evaluate((section) =>
      [section, ...Array.from(section.querySelectorAll("*"))].some((el) =>
        ["::before", "::after"].some((p) => getComputedStyle(el, p).backgroundImage.includes("repeating-linear-gradient")),
      ),
    );
    expect(sprockets).toBe(false);
  });
});

/* ================================================================== frames */

test.describe("T13b · frames", () => {
  test("1180: five 112×84 frames and the Snap tile; names kept; told pages carry a lucide Mic badge", async ({ page }) => {
    await openTwinkle(page, { pageNumber: 1 });
    await expect(frames(page)).toHaveCount(5);
    await expect(snap(page)).toHaveCount(1);
    await expect(frames(page).nth(0)).toHaveAccessibleName("Page 1, has voice, selected");
    for (let n = 2; n <= 5; n++) await expect(frames(page).nth(n - 1)).toHaveAccessibleName(`Page ${n}, has voice`);

    for (const f of await frames(page).all()) {
      const b = await box(f);
      expect(Math.round(b.width), "frame width").toBe(112);
      expect(Math.round(b.height), "frame height").toBe(84);
      const badge = f.locator('[data-studio="frame-voice"]');
      await expect(badge).toHaveCount(1);
      await expect(badge.locator("svg.lucide-mic")).toHaveCount(1);
      expect(await badge.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(227, 69, 47)");
      expect(await f.innerText()).not.toMatch(PICTOGRAPH);
    }
    const tile = await box(snap(page));
    expect(Math.round(tile.width)).toBe(112);
    expect(Math.round(tile.height)).toBe(84);

    // the selected frame keeps the gold border
    expect(await frames(page).nth(0).evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(GOLD);
    expect(await frames(page).nth(1).evaluate((el) => getComputedStyle(el).borderTopColor)).not.toBe(GOLD);
  });

  test("below 1024 frames keep today's 84×62", async ({ page }) => {
    await openTwinkle(page, { viewport: NARROW });
    for (const f of await frames(page).all()) {
      const b = await box(f);
      expect(Math.round(b.width)).toBe(84);
      expect(Math.round(b.height)).toBe(62);
    }
  });

  // A short laptop keeps today's frames too: under 700 px of height the docked
  // Voice card needs every pixel (vision-studio-room "a short laptop").
  for (const viewport of [SHORT_LAPTOP, { width: 1280, height: 720 }, { width: 1024, height: 768 }] as Size[]) {
    const big = viewport.height >= 700;
    test(`${viewport.width}×${viewport.height}: frames are ${big ? "112×84" : "84×62"}`, async ({ page }) => {
      await openTwinkle(page, { viewport });
      const b = await box(frames(page).first());
      expect(Math.round(b.width)).toBe(big ? 112 : 84);
      expect(Math.round(b.height)).toBe(big ? 84 : 62);
      const r = await box(strip(page).locator(SEL.ribbon));
      expect(Math.abs(r.cy - b.cy), "the ribbon still runs at mid-height").toBeLessThanOrEqual(6);
    });
  }

  test("a page with no picture shows a lucide Pen, not ✎", async ({ page }) => {
    await openTwinkle(page);
    const chooser = page.waitForEvent("filechooser");
    await snap(page).click();
    await chooser; // cancelled: the blank page stays
    const blank = frame(page, 6);
    await expect(blank).toHaveAccessibleName("Page 6, selected");
    await expect(blank.locator("svg.lucide-pen")).toHaveCount(1);
    await expect(blank.locator("img")).toHaveCount(0);
    expect(await blank.innerText()).not.toMatch(PICTOGRAPH);
  });
});

/* ============================================================ live + lock */

test.describe("T13b · the page being told", () => {
  test("mid-take: a static red dot at the current frame's top-right; gone after Stop", async ({ page }) => {
    await openTwinkle(page);
    await expect(strip(page).locator(SEL.live)).toHaveCount(0);
    await startTake(page);

    const current = frame(page, 3);
    const dot = current.locator(SEL.live);
    await expect(dot).toHaveCount(1);
    await expect(strip(page).locator(SEL.live)).toHaveCount(1);
    const d = await box(dot);
    const f = await box(current);
    expect(d.cx, "right half").toBeGreaterThan(f.cx);
    expect(d.cy, "top half").toBeLessThan(f.cy);
    expect(d.x).toBeGreaterThanOrEqual(f.x);
    expect(d.right).toBeLessThanOrEqual(f.right);
    expect(d.y).toBeGreaterThanOrEqual(f.y);
    const look = await dot.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        animation: cs.animationName,
        bg: cs.backgroundColor,
        infinite: el.getAnimations().some((a) => a.effect?.getComputedTiming().iterations === Infinity),
      };
    });
    expect(look).toEqual({ animation: "none", bg: "rgb(227, 69, 47)", infinite: false });

    // the frames' names and the disabled-while-recording rule are kept
    await expect(current).toHaveAccessibleName("Page 3, has voice, selected");
    await expect(current).toBeEnabled();
    for (const n of [1, 2, 4, 5]) {
      await expect(frame(page, n)).toBeDisabled();
      await expect(frame(page, n)).toHaveAttribute("title", LOCKED);
    }

    await stopTake(page);
    await expect(strip(page).locator(SEL.live)).toHaveCount(0);
    for (const n of [1, 2, 4, 5]) await expect(frame(page, n)).toBeEnabled();
  });

  test("move controls: three named lucide controls; mid-take one disabled 'move' pill with a Lock", async ({ page }) => {
    await openTwinkle(page);
    for (const name of MOVES) {
      const control = strip(page).getByRole("button", { name, exact: true });
      await expect(control).toHaveCount(1);
      await expect(control.locator(`svg.${MOVE_ICON[name]}`)).toHaveCount(1);
      expect(await control.innerText()).not.toMatch(PICTOGRAPH);
    }

    await startTake(page);
    for (const name of MOVES) await expect(strip(page).getByRole("button", { name, exact: true })).toHaveCount(0);
    const pill = strip(page).getByRole("button", { name: "move", exact: true });
    await expect(pill).toHaveCount(1);
    await expect(pill).toBeDisabled();
    await expect(pill).toHaveAttribute("title", LOCKED);
    await expect(pill.locator("svg.lucide-lock")).toHaveCount(1);
    expect((await pill.innerText()).trim()).toBe("move");
    // it sits on the ribbon at the right of the strip
    const p = await box(pill);
    const r = await box(strip(page).locator(SEL.ribbon));
    const tile = await box(snap(page));
    expect(Math.abs(p.cy - r.cy)).toBeLessThanOrEqual(6);
    expect(p.x).toBeGreaterThan(tile.right);

    // the Snap tile is locked too
    await expect(snap(page)).toBeDisabled();
    await expect(snap(page)).toHaveAttribute("title", LOCKED);

    await stopTake(page);
    await expect(pill).toHaveCount(0);
    for (const name of MOVES) await expect(strip(page).getByRole("button", { name, exact: true })).toHaveCount(1);
    await expect(snap(page)).toBeEnabled();
  });
});

/* ==================================================================== snap */

test.describe("T13b · Snap the next drawing", () => {
  test("a lucide Camera and the words; a click adds page 6, selects it and opens the camera", async ({ page }) => {
    await openTwinkle(page);
    const tile = snap(page);
    await expect(tile).toHaveAccessibleName(SNAP);
    await expect(tile.locator("svg.lucide-camera")).toHaveCount(1);
    expect((await tile.innerText()).replace(/\s+/g, " ").trim()).toBe(SNAP);

    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), tile.click()]);
    expect(await chooser.element().getAttribute("accept")).toBe("image/*");
    expect(await chooser.element().getAttribute("capture")).toBe("environment");
    await expect(frames(page)).toHaveCount(6);
    await expect(strip(page).getByRole("button", { name: "Page 6, selected", exact: true })).toHaveCount(1);

    // a picture taken lands on the new page
    await chooser.setFiles(path.join(__dirname, "fixtures", "twinkle", "page-1.jpg"));
    await expect(frame(page, 6).locator("img")).toHaveCount(1, { timeout: 10000 });
    await expect(frame(page, 6).locator("svg.lucide-pen")).toHaveCount(0);
  });

  test("keyboard: Enter on the focused tile adds a page and opens the camera", async ({ page }) => {
    await openTwinkle(page);
    await snap(page).focus();
    // ask for the chooser first and make one round trip to the page before the
    // key: pressed straight after focus(), Enter added the page but the chooser
    // went unobserved in ~half of mobile runs (the mouse path above already
    // makes its own round trips before it clicks)
    const chooserPromise = page.waitForEvent("filechooser");
    await page.evaluate(() => document.activeElement?.textContent);
    await page.keyboard.press("Enter");
    const chooser = await chooserPromise;
    expect(await chooser.element().getAttribute("accept")).toBe("image/*");
    await expect(strip(page).getByRole("button", { name: "Page 6, selected", exact: true })).toHaveCount(1);
  });
});

/* ==================================================================== lane */

test.describe("T13b · the mood lane", () => {
  test("Wonder: one 8 px segment per page under its frame, the label at the right end", async ({ page }) => {
    await openTwinkle(page);
    const lane = strip(page).locator(SEL.lane);
    await expect(lane).toHaveCount(1);
    const segments = lane.locator(SEL.segment);
    await expect(segments).toHaveCount(5);

    const lastFrame = await box(frame(page, 5));
    for (let n = 1; n <= 5; n++) {
      const s = await box(segments.nth(n - 1));
      const f = await box(frame(page, n));
      expect(Math.round(s.height), `segment ${n} height`).toBe(8);
      expect(Math.abs(s.x - f.x), `segment ${n} left under frame ${n}`).toBeLessThanOrEqual(1);
      expect(Math.abs(s.right - f.right), `segment ${n} right under frame ${n}`).toBeLessThanOrEqual(1);
      expect(s.y, `segment ${n} under its frame`).toBeGreaterThanOrEqual(f.bottom);
      expect(s.y - f.bottom, `segment ${n} close under its frame`).toBeLessThanOrEqual(16);
      expect(await segments.nth(n - 1).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(WONDER);
      await expect(segments.nth(n - 1)).toHaveAttribute("data-mood", "Wonder");
    }

    const label = lane.locator(SEL.laneLabel);
    expect(await label.innerText()).toBe("WONDER · GENTLE MUSIC ADDED FOR YOU");
    expect(await label.textContent()).toBe("Wonder · gentle music added for you");
    await expect(label.locator("svg.lucide-star")).toHaveCount(1);
    const l = await box(label);
    const scroller = await box(strip(page).locator(SEL.scroller));
    expect(l.x, "the label comes after the pages").toBeGreaterThan(lastFrame.right);
    expect(scroller.right - l.right, "the label sits at the right end").toBeLessThanOrEqual(24);
    expect(Math.abs(l.cy - (await box(segments.first())).cy), "the label sits on the lane").toBeLessThanOrEqual(4);
    const type = await label.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { size: cs.fontSize, transform: cs.textTransform, color: cs.color, font: cs.fontFamily };
    });
    expect(type.size).toBe("11px");
    expect(type.transform).toBe("uppercase");
    expect(type.color).toBe(WONDER);
    expect(type.font.toLowerCase()).toMatch(/plex|mono/);
  });

  test("Music → Calm turns every segment Calm; music off removes the lane; on brings it back", async ({ page }) => {
    await openTwinkle(page);
    const card = await openMusic(page);
    await card.getByRole("radio", { name: /^Calm\b/ }).click();

    const lane = strip(page).locator(SEL.lane);
    const segments = lane.locator(SEL.segment);
    await expect(segments).toHaveCount(5);
    for (const s of await segments.all()) {
      await expect(s).toHaveAttribute("data-mood", "Calm");
      expect(await s.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(CALM);
      expect(await s.getAttribute("style")).toContain("--mood-calm");
    }
    expect(await lane.locator(SEL.laneLabel).innerText()).toBe("CALM · GENTLE MUSIC ADDED FOR YOU");
    // M6: the label's icon is the mood's own (a moon for Calm), as on the Stage.
    await expect(lane.locator(SEL.laneLabel).locator("svg.lucide-moon")).toHaveCount(1);

    const toggle = card.getByRole("switch", { name: "Play music behind the story" });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(strip(page).locator(SEL.lane)).toHaveCount(0);
    await expect(strip(page).locator(SEL.segment)).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(strip(page).locator(SEL.segment)).toHaveCount(5);
    expect(await strip(page).locator(SEL.laneLabel).innerText()).toBe("CALM · GENTLE MUSIC ADDED FOR YOU");
  });

  test("a new page gets the story's mood in the lane too", async ({ page }) => {
    await openTwinkle(page);
    const chooser = page.waitForEvent("filechooser");
    await snap(page).click();
    await chooser;
    const segments = strip(page).locator(SEL.segment);
    await expect(segments).toHaveCount(6);
    const s = await box(segments.nth(5));
    const f = await box(frame(page, 6));
    expect(Math.abs(s.x - f.x)).toBeLessThanOrEqual(1);
    expect(await segments.nth(5).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(WONDER);
  });
});

/* =================================================================== phone */

test.describe("T13b · phone", () => {
  test("375×812: the strip scrolls inside itself, ribbon and lane with it; the page never scrolls sideways", async ({ page }) => {
    await openTwinkle(page, { viewport: PHONE, pageNumber: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(PHONE.width);

    const scroller = strip(page).locator(SEL.scroller);
    const overflow = await scroller.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(overflow.scrollWidth, "the strip scrolls inside itself").toBeGreaterThan(overflow.clientWidth);

    const ribbon = strip(page).locator(SEL.ribbon);
    const lane = strip(page).locator(SEL.lane);
    expect(await scroller.evaluate((el) => Boolean(el.querySelector('[data-sk="tape-ribbon"]')))).toBe(true);
    expect(await scroller.evaluate((el) => Boolean(el.querySelector('[data-studio="mood-lane"]')))).toBe(true);

    await scroller.evaluate((el) => el.scrollTo({ left: 0, behavior: "instant" as ScrollBehavior }));
    await settle(page);
    const before = { frame: await box(frame(page, 1)), ribbon: await box(ribbon), segment: await box(lane.locator(SEL.segment).first()) };
    await scroller.evaluate((el) => el.scrollTo({ left: 60, behavior: "instant" as ScrollBehavior }));
    await settle(page);
    const scrolled = await scroller.evaluate((el) => el.scrollLeft);
    expect(scrolled).toBeGreaterThan(20);
    const after = { frame: await box(frame(page, 1)), ribbon: await box(ribbon), segment: await box(lane.locator(SEL.segment).first()) };
    const moved = before.frame.x - after.frame.x;
    expect(moved).toBeGreaterThan(20);
    expect(Math.abs(before.ribbon.x - after.ribbon.x - moved), "the ribbon scrolls with the frames").toBeLessThanOrEqual(1);
    expect(Math.abs(before.segment.x - after.segment.x - moved), "the lane scrolls with the frames").toBeLessThanOrEqual(1);

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(PHONE.width);
  });

  test("375×812: the move controls stay in reach and the Snap tile reads in full", async ({ page }) => {
    await openTwinkle(page, { viewport: PHONE });
    // M6: on a phone they rest folded behind one "move" key; opened, each is a 44px target.
    await strip(page).getByRole("button", { name: "Move or delete this page" }).click();
    for (const name of MOVES) {
      const b = await box(strip(page).getByRole("button", { name, exact: true }));
      expect(b.right, `${name} on screen`).toBeLessThanOrEqual(PHONE.width);
      expect(b.width, `${name} a 44 px target`).toBeGreaterThanOrEqual(44);
      expect(b.height, `${name} a 44 px target`).toBeGreaterThanOrEqual(44);
    }
    const tile = snap(page);
    const fits = await tile.evaluate((el) => {
      const text = el.querySelector("span:not([aria-hidden])") as HTMLElement | null;
      return text ? text.scrollWidth <= text.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1 : false;
    });
    expect(fits, "the Snap words fit their tile").toBe(true);
  });
});

test.describe("M6 · a phone's strip: the move controls rest folded", () => {
  test("375×812: at rest one 44px 'move' key, clear of the selected frame; opened, three 44px keys; Escape folds", async ({
    page,
  }) => {
    for (const pageNumber of [1, 3, 5]) {
      await openTwinkle(page, { viewport: PHONE, pageNumber });
      const toggle = strip(page).getByRole("button", { name: "Move or delete this page" });
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      for (const name of MOVES) await expect(strip(page).getByRole("button", { name, exact: true })).toHaveCount(0);
      await settle(page);
      const rest = await page.evaluate(() => {
        const r = (el: Element) => el.getBoundingClientRect().toJSON() as DOMRect;
        const moves = document.querySelector('[data-studio="film-moves"]')!;
        const current = document.querySelector('[data-page-index][aria-current="true"]')!;
        const film = document.querySelector('[data-studio="film-scroll"]')!;
        return { moves: r(moves), current: r(current), film: r(film), overflow: document.documentElement.scrollWidth - window.innerWidth };
      });
      expect(rest.moves.width, "the folded housing is small").toBeLessThanOrEqual(56);
      expect(rest.moves.height).toBeGreaterThanOrEqual(44);
      expect(rest.moves.width / rest.film.width, "it covers little of the strip").toBeLessThan(0.2);
      expect(rest.current.right, `page ${pageNumber}: the selected frame is clear of it`).toBeLessThanOrEqual(rest.moves.left + 0.5);
      expect(rest.overflow).toBeLessThanOrEqual(0);
    }

    const toggle = strip(page).getByRole("button", { name: "Move or delete this page" });
    await toggle.focus();
    await expect(toggle).toHaveText("move");
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    for (const name of MOVES) {
      const b = await box(strip(page).getByRole("button", { name, exact: true }));
      expect(b.width, `${name} a 44 px target`).toBeGreaterThanOrEqual(44);
      expect(b.height, `${name} a 44 px target`).toBeGreaterThanOrEqual(44);
      expect(b.right, `${name} on screen`).toBeLessThanOrEqual(PHONE.width);
    }
    // Tab goes from the key into what it opened, in the order drawn.
    await page.keyboard.press("Tab");
    await expect(strip(page).getByRole("button", { name: "Move this page earlier", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test("from 768px there is no fold: the three keys show and no 'move' key", async ({ page }) => {
    await openTwinkle(page, { viewport: { width: 768, height: 1024 } });
    await expect(strip(page).getByRole("button", { name: "Move or delete this page" })).toHaveCount(0);
    for (const name of MOVES) await expect(strip(page).getByRole("button", { name, exact: true })).toBeVisible();
  });
});

/* ================================================================ keyboard */

/** Wait until the strip has stopped scrolling (a smooth scroll is not an Animation). */
async function settleScroll(page: Page): Promise<void> {
  await page.evaluate(async (sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return;
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    let last = el.scrollLeft;
    let still = 0;
    for (let i = 0; i < 240 && still < 8; i++) {
      await nextFrame();
      if (el.scrollLeft === last) still += 1;
      else {
        still = 0;
        last = el.scrollLeft;
      }
    }
  }, SEL.scroller);
  await settle(page);
}

interface TileView {
  name: string;
  left: number;
  right: number;
  /** how far the focus ring reaches outside the tile (outline offset + width) */
  ring: number;
  movesLeft: number;
  scrollerLeft: number;
  /** elementFromPoint 4px inside the tile's right / left edge lands in the tile */
  rightHit: boolean;
  leftHit: boolean;
}

/** Where the focused tile sits against the pinned move controls. */
async function focusedTile(page: Page): Promise<TileView> {
  return page.evaluate(
    ({ moves, scroller }) => {
      const el = document.activeElement as HTMLElement;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const cy = r.y + r.height / 2;
      const inside = (x: number) => {
        const hit = document.elementFromPoint(x, cy);
        return Boolean(hit && (hit === el || el.contains(hit)));
      };
      return {
        name: el.getAttribute("aria-label") ?? (el.textContent ?? "").replace(/\s+/g, " ").trim(),
        left: r.left,
        right: r.right,
        ring: (parseFloat(cs.outlineOffset) || 0) + (parseFloat(cs.outlineWidth) || 0),
        movesLeft: document.querySelector(moves)!.getBoundingClientRect().left,
        scrollerLeft: document.querySelector(scroller)!.getBoundingClientRect().left,
        rightHit: inside(r.right - 4),
        leftHit: inside(r.left + 4),
      };
    },
    { moves: SEL.moves, scroller: SEL.scroller },
  );
}

test.describe("T13b · keyboard: Tab never leaves a tile under the move controls", () => {
  const IPAD: Size = { width: 1024, height: 768 };
  const cases: { viewport: Size; pages: number; reducedMotion?: boolean }[] = [
    { viewport: PHONE, pages: 5 },
    { viewport: PHONE, pages: 5, reducedMotion: true },
    { viewport: IPAD, pages: 5 },
    // a tape longer than the window: Tab has to scroll it
    { viewport: IPAD, pages: 8 },
    { viewport: TABLET, pages: 5 },
  ];
  for (const { viewport, pages: count, reducedMotion = false } of cases) {
    const title = `${viewport.width}×${viewport.height}, ${count} pages${reducedMotion ? ", reduced motion" : ""}`;
    test(`${title}: Tab from page 1 along every page to the Snap tile and Shift+Tab back keeps each one in full view`, async ({ page }) => {
      await openTwinkle(page, { viewport, pageNumber: 1, reducedMotion });
      for (let n = 6; n <= count; n++) {
        const chooser = page.waitForEvent("filechooser");
        await snap(page).click();
        await chooser; // cancelled: a blank page
        await expect(frames(page)).toHaveCount(n);
      }
      await frame(page, 1).focus();
      await settleScroll(page);

      const expected: string[] = [];
      for (let n = 2; n <= count; n++) {
        expected.push(`Page ${n}${n <= 5 ? ", has voice" : ""}${n === count && count > 5 ? ", selected" : ""}`);
      }
      expected.push(SNAP);
      const back = [...expected].reverse().slice(1);
      back.push(`Page 1, has voice${count > 5 ? "" : ", selected"}`);
      const steps = [
        ...expected.map((name) => ({ key: "Tab", name })),
        ...back.map((name) => ({ key: "Shift+Tab", name })),
      ];
      for (const { key, name } of steps) {
        await page.keyboard.press(key);
        await settleScroll(page);
        const t = await focusedTile(page);
        expect(t.name, `${key} walks the tape in order`).toBe(name);
        expect(t.right, `${key} → ${name}: clear of the move controls`).toBeLessThanOrEqual(t.movesLeft);
        expect(t.right + t.ring, `${key} → ${name}: its focus ring clear of the move controls`).toBeLessThanOrEqual(t.movesLeft + 0.5);
        expect(t.ring, "a keyboard focus ring shows").toBeGreaterThan(0);
        expect(t.left - t.ring, `${key} → ${name}: its focus ring inside the strip`).toBeGreaterThanOrEqual(t.scrollerLeft - 0.5);
        expect(t.rightHit, `${key} → ${name}: its right edge is what is under the pointer`).toBe(true);
        expect(t.leftHit, `${key} → ${name}: its left edge is what is under the pointer`).toBe(true);
      }
    });
  }

  test("1024×768 on load: the Snap tile is clear of the move controls without scrolling", async ({ page }) => {
    await openTwinkle(page, { viewport: { width: 1024, height: 768 }, pageNumber: 1 });
    await settleScroll(page);
    for (const f of await frames(page).all()) {
      const b = await box(f);
      expect([Math.round(b.width), Math.round(b.height)], "the s03 frame size is kept").toEqual([112, 84]);
    }
    const tile = await box(snap(page));
    const moves = await box(strip(page).locator(SEL.moves));
    expect(Math.round(tile.height), "the Snap tile is as tall as a frame").toBe(84);
    expect(tile.right, "the child's next action reads in full").toBeLessThanOrEqual(moves.x);
    expect(await snap(page).evaluate((el) => el.scrollHeight <= el.clientHeight + 1), "its words fit the tile").toBe(true);
    expect(await strip(page).locator(SEL.scroller).evaluate((el) => el.scrollLeft)).toBe(0);
  });
});

/* ========================================================== reduced motion */

test.describe("T13b · reduced motion", () => {
  test("frames have no transition and no transform; the live dot is static", async ({ page }) => {
    await openTwinkle(page, { reducedMotion: true });
    const second = frame(page, 2);
    await second.hover();
    const look = await second.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { transform: cs.transform, durations: cs.transitionDuration.split(",").map((d) => parseFloat(d)) };
    });
    expect(look.transform).toBe("none");
    for (const d of look.durations) expect(d).toBeLessThanOrEqual(0.001);

    await startTake(page);
    const dot = frame(page, 3).locator(SEL.live);
    await expect(dot).toHaveCount(1);
    expect(await dot.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    await stopTake(page);
  });
});
