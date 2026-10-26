// T19 · READ THIS: a teleprompter card while recording.
//
// Reference: s06 phone 2 (docs/vision/reference/renders/s06.png, brief
// screens[5]) — Grandma mid-take on "Goodnight, Mia": her window photo in the
// tape-red listening ring, and under it a paper card, "READ THIS" in mono
// tape-red over her own words in Fraunces 600, then the round Stop. s03 sets
// the realism: words do not light during a take (that would need on-device
// speech alignment), so the card is a teleprompter, never a read-along.
//
//   card     · while a take records with Voice open, above Stop: the page's
//              words verbatim on paper, a labelled note, never focusable
//   look     · paper, 3 px ink border, radius 14, padding 14; label mono
//              10.5 px tape-red; words Fraunces 600, 22 px (fluid to 28 on a
//              wide sheet), line-height 1.35, ink
//   still    · no highlight, one colour, nothing moves or changes in the take
//   absent   · not recording, or recording a page with no words
//   fit      · 390×844 and 375×812: card and Stop on screen, apart; long words
//              scroll inside a card ≤ 40 % of the screen; 1180×820, 1280×720,
//              1024×768: the room still fits during the take, the card in the
//              docked Voice card above Stop; 900×800: the floating card; a
//              short laptop (docked, under 700 px tall) has no room for it
//   stage    · Stage = Player: the words box keeps its value through the take
//   motion   · reduced motion: the card just appears
//
// The family content is illustrative and lives in tests/fixtures only.

import { test, expect, type Locator, type Page } from "@playwright/test";
import { restoreDraft, seedStudioDraft } from "./fixtures/helpers";
import { stubMicrophone } from "./fixtures/mic";
import { GOODNIGHT_MIA } from "./fixtures/tapes";

/* ------------------------------------------------------------------ facts */

/** Grandma's words for page 1, verbatim from the reference. */
const WORDS = GOODNIGHT_MIA.pages[0].text;
/** Far more words than a page should hold: enough to make any card scroll. */
const LONG_WORDS = Array.from({ length: 6 }, () => WORDS).join(" ");

type Size = { width: number; height: number };
const PHONE_390: Size = { width: 390, height: 844 };
const PHONE_375: Size = { width: 375, height: 812 };
const TABLET: Size = { width: 1180, height: 820 };
const LAPTOP: Size = { width: 1280, height: 720 };
const IPAD_LANDSCAPE: Size = { width: 1024, height: 768 };
const BETWEEN: Size = { width: 900, height: 800 };
/** A phone-width sheet that is wide: the words grow to 28 px. */
const WIDE_SHEET: Size = { width: 760, height: 1000 };

/** --ss-paper, --ss-ink, --ss-red. */
const PAPER = "rgb(255, 253, 246)";
const INK = "rgb(30, 26, 22)";
const RED = "rgb(227, 69, 47)";

const SEL = {
  card: '[data-studio="read-this"]',
  label: '[data-studio="read-this-label"]',
  dot: '[data-studio="read-this-dot"]',
  words: '[data-studio="read-this-words"]',
  toolCard: '[data-studio="tool-card"]',
  record: '[data-studio="voice-record"]',
  textarea: "#studio-page-text",
  stageText: '[data-studio="stage-text"]',
  zone: '[data-studio="stage-zone"]',
  photo: '[data-studio="stage-photo"]',
  pill: '[data-studio="listening-pill"]',
  pages: 'section[aria-label="Pages"]',
  transport: 'section[aria-label="Transport"]',
} as const;

/* ---------------------------------------------------------------- helpers */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

const toBox = (r: DOMRect): Box => ({
  x: r.x,
  y: r.y,
  width: r.width,
  height: r.height,
  right: r.right,
  bottom: r.bottom,
});

async function box(locator: Locator): Promise<Box> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  });
}

function intersects(a: Box, b: Box): boolean {
  return a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;
}

function inside(inner: Box, outer: Box, slack = 0.5): boolean {
  return (
    inner.x >= outer.x - slack &&
    inner.y >= outer.y - slack &&
    inner.right <= outer.right + slack &&
    inner.bottom <= outer.bottom + slack
  );
}

const card = (page: Page) => page.locator(SEL.card);
const stopButton = (page: Page) => page.getByRole("button", { name: /^Stop —/ });
const recButton = (page: Page) => page.locator('[data-sk="transport"][data-kind="rec"]');
const voiceTool = (page: Page) =>
  page.locator('nav[aria-label="Story tools"]').getByRole("button", { name: "Voice", exact: true });

/** Wait for every finite animation to land and fonts to load, so boxes are measured at rest. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const finite = document
      .getAnimations()
      .filter((a) => Number.isFinite(a.effect?.getComputedTiming().iterations ?? Infinity));
    await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

interface OpenOptions {
  viewport?: Size;
  reducedMotion?: boolean;
}

/** Goodnight, Mia restored from this device's draft: a picture and words, no voice yet. */
async function openGoodnightMia(page: Page, opts: OpenOptions = {}): Promise<void> {
  if (opts.viewport) await page.setViewportSize(opts.viewport);
  if (opts.reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await stubMicrophone(page);
  await seedStudioDraft(page, "goodnight-mia", { narration: false });
  await page.goto("/studio");
  await restoreDraft(page);
  const photo = page.locator(SEL.photo);
  await expect(photo).toBeVisible();
  await expect
    .poll(() => photo.evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))
    .toBe(true);
  await expect(page.locator(SEL.textarea)).toHaveValue(WORDS);
  await settle(page);
}

/** Replace the page's words in the Stage's own box (the way a grown-up types them). */
async function typeWords(page: Page, words: string): Promise<void> {
  await page.locator(SEL.textarea).fill(words);
  await expect(page.locator(SEL.textarea)).toHaveValue(words);
}

/** Start a take from the Transport's REC (it opens the Voice card too). */
async function startTake(page: Page): Promise<void> {
  await recButton(page).click();
  await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);
  await expect(page.locator(SEL.toolCard)).toBeVisible();
}

async function stopTake(page: Page): Promise<void> {
  await stopButton(page).click();
  await expect(page.locator(".studio[data-recording='true']")).toHaveCount(0, { timeout: 10000 });
}

/** The card, the Stop button, the Voice card and the viewport, read in one frame. */
async function readTake(page: Page) {
  return page.evaluate(
    ([cardSel, stopSel, toolSel, wordsSel]) => {
      const rect = (sel: string) => {
        const el = document.querySelector(sel);
        return el ? el.getBoundingClientRect().toJSON() : null;
      };
      const words = document.querySelector(wordsSel) as HTMLElement | null;
      return {
        card: rect(cardSel) as DOMRect | null,
        stop: rect(stopSel) as DOMRect | null,
        tool: rect(toolSel) as DOMRect | null,
        words: words ? { scrollHeight: words.scrollHeight, clientHeight: words.clientHeight } : null,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        doc: {
          scrollHeight: document.documentElement.scrollHeight,
          scrollWidth: document.documentElement.scrollWidth,
        },
      };
    },
    [SEL.card, SEL.record, SEL.toolCard, SEL.words] as const,
  );
}

/** Card and Stop both fully on screen, inside the Voice card, apart, the card above. */
async function expectCardAboveStop(page: Page, where: string): Promise<void> {
  await settle(page);
  const t = await readTake(page);
  expect(t.card, `${where}: the card`).not.toBeNull();
  expect(t.stop, `${where}: Stop`).not.toBeNull();
  const c = toBox(t.card as DOMRect);
  const s = toBox(t.stop as DOMRect);
  const tool = toBox(t.tool as DOMRect);
  const screen: Box = { x: 0, y: 0, width: t.viewport.width, height: t.viewport.height, right: t.viewport.width, bottom: t.viewport.height };
  expect(inside(c, screen), `${where}: the card is fully on screen ${JSON.stringify(c)}`).toBe(true);
  expect(inside(s, screen), `${where}: Stop is fully on screen ${JSON.stringify(s)}`).toBe(true);
  expect(intersects(c, s), `${where}: the card and Stop do not overlap`).toBe(false);
  expect(c.bottom, `${where}: the card sits above Stop`).toBeLessThanOrEqual(s.y + 0.5);
  expect(inside(c, tool), `${where}: the card lives in the Voice card`).toBe(true);
  expect(inside(s, tool), `${where}: Stop lives in the Voice card`).toBe(true);
}

/** Nothing in the card is a Tab stop: no control, no positive tabindex, no keyboard scroller. */
async function expectNotFocusable(page: Page): Promise<void> {
  await expect(card(page).locator("a, button, input, textarea, select, [contenteditable]")).toHaveCount(0);
  const stops = await card(page).evaluate((el) =>
    [el, ...Array.from(el.querySelectorAll<HTMLElement>("*"))]
      .filter((n) => (n as HTMLElement).tabIndex >= 0)
      .map((n) => `${n.tagName}.${n.className}`),
  );
  expect(stops, "the card has no Tab stop").toEqual([]);
}

/** Tab goes from Close Voice straight to Stop: the card takes no stop of its own. */
async function expectTabSkipsCard(page: Page, where: string): Promise<void> {
  await page.getByRole("button", { name: "Close Voice" }).focus();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => document.activeElement?.getAttribute("data-studio")),
    `${where}: Tab from Close Voice lands on Stop`,
  ).toBe("voice-record");
}

/** T13a's room fit: no page scroll; photo, Pages strip and Transport inside the viewport. */
async function expectRoomFits(page: Page, where: string): Promise<void> {
  await settle(page);
  const doc = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
  }));
  expect(doc.scrollHeight, `${where}: the page scrolls`).toBeLessThanOrEqual(doc.innerHeight);
  expect(doc.scrollWidth, `${where}: the page scrolls sideways`).toBeLessThanOrEqual(doc.innerWidth);
  for (const [name, selector] of [
    ["the Stage photo", SEL.photo],
    ["the Pages strip", SEL.pages],
    ["the Transport", SEL.transport],
  ] as const) {
    const b = await box(page.locator(selector));
    expect(b.x, `${where}: ${name} left edge`).toBeGreaterThanOrEqual(-0.5);
    expect(b.y, `${where}: ${name} top edge`).toBeGreaterThanOrEqual(-0.5);
    expect(b.right, `${where}: ${name} right edge`).toBeLessThanOrEqual(doc.innerWidth + 0.5);
    expect(b.bottom, `${where}: ${name} bottom edge`).toBeLessThanOrEqual(doc.innerHeight + 0.5);
  }
}

/* ==================================================================== card */

test.describe("T19 · READ THIS while the tape is listening", () => {
  test("a take shows the page's own words under READ THIS, above Stop, in the Voice card", async ({ page }) => {
    await openGoodnightMia(page);

    // Voice open but not recording: no card.
    await voiceTool(page).click();
    await expect(page.locator(SEL.toolCard)).toBeVisible();
    await expect(card(page)).toHaveCount(0);

    await startTake(page);
    await expect(card(page)).toBeVisible();
    // The page's words, verbatim: the same string the page's text.content holds.
    expect(await page.locator(SEL.words).evaluate((el) => el.textContent)).toBe(WORDS);
    await expect(card(page).locator(SEL.label)).toHaveText("READ THIS");
    await expect(card(page).locator(SEL.dot)).toHaveCount(1);

    // A labelled note, inside the Voice card, never focusable.
    const note = page.getByRole("note", { name: "Read this" });
    await expect(note).toHaveCount(1);
    expect(await note.getAttribute("data-studio")).toBe("read-this");
    await expect(page.locator(SEL.toolCard).locator(SEL.card)).toHaveCount(1);
    await expectNotFocusable(page);

    // Above Stop, and Stop is still the only "Stop —" button.
    await expect(stopButton(page)).toHaveCount(1);
    await expectCardAboveStop(page, "project viewport");

    await expectTabSkipsCard(page, "project viewport");
    await stopTake(page);

    // Long words make the card scroll; a scroller still takes no Tab stop.
    await typeWords(page, LONG_WORDS);
    await startTake(page);
    await expect(card(page)).toBeVisible();
    await expectNotFocusable(page);
    await expectTabSkipsCard(page, "project viewport, long words");
    await stopTake(page);
  });

  test("paper, ink and type: the reference's teleprompter card", async ({ page }) => {
    await openGoodnightMia(page);
    await startTake(page);
    await expect(card(page)).toBeVisible();
    await settle(page);
    const look = await card(page).evaluate((el) => {
      const cs = getComputedStyle(el);
      const label = el.querySelector('[data-studio="read-this-label"]') as HTMLElement;
      const dot = el.querySelector('[data-studio="read-this-dot"]') as HTMLElement;
      const words = el.querySelector('[data-studio="read-this-words"]') as HTMLElement;
      const ls = getComputedStyle(label);
      const ds = getComputedStyle(dot);
      const ws = getComputedStyle(words);
      return {
        card: {
          background: cs.backgroundColor,
          borders: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth],
          borderStyle: cs.borderTopStyle,
          borderColors: [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor],
          radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius],
          padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft],
          width: el.getBoundingClientRect().width,
        },
        label: {
          color: ls.color,
          size: parseFloat(ls.fontSize),
          family: ls.fontFamily.toLowerCase(),
          transform: ls.textTransform,
        },
        dot: { background: ds.backgroundColor, width: dot.getBoundingClientRect().width },
        words: {
          color: ws.color,
          weight: Number(ws.fontWeight),
          family: ws.fontFamily.toLowerCase(),
          size: parseFloat(ws.fontSize),
          lineHeight: parseFloat(ws.lineHeight),
          whiteSpace: ws.whiteSpace,
        },
      };
    });

    expect(look.card.background, "Register B paper").toBe(PAPER);
    expect(look.card.borders, "a 3 px border").toEqual(["3px", "3px", "3px", "3px"]);
    expect(look.card.borderStyle).toBe("solid");
    expect(look.card.borderColors, "ink").toEqual([INK, INK, INK, INK]);
    expect(look.card.radius, "radius 14").toEqual(["14px", "14px", "14px", "14px"]);
    expect(look.card.padding, "padding 14").toEqual(["14px", "14px", "14px", "14px"]);

    expect(look.label.color, "tape-red label").toBe(RED);
    expect(look.label.size).toBeCloseTo(10.5, 1);
    expect(look.label.family, "the label is mono").toMatch(/plex|mono/);
    expect(look.label.transform).toBe("uppercase");
    expect(look.dot.background, "a small tape-red dot").toBe(RED);
    expect(look.dot.width).toBeGreaterThanOrEqual(5);
    expect(look.dot.width).toBeLessThanOrEqual(9);

    expect(look.words.color, "ink words").toBe(INK);
    expect(look.words.weight).toBe(600);
    expect(look.words.family).toContain("fraunces");
    expect(look.words.size).toBeGreaterThanOrEqual(22);
    expect(look.words.size).toBeLessThanOrEqual(28);
    // A card no wider than a 480 px panel's sets the words at exactly 22 px.
    if (look.card.width <= 448) expect(look.words.size).toBeCloseTo(22, 1);
    expect(look.words.lineHeight / look.words.size).toBeGreaterThanOrEqual(1.33);
    expect(look.words.lineHeight / look.words.size).toBeLessThanOrEqual(1.37);
    expect(look.words.whiteSpace, "whitespace kept as typed").toBe("pre-wrap");
    await stopTake(page);
  });

  test("no highlight and nothing moves: one ink colour, the same words all through the take", async ({ page }) => {
    await openGoodnightMia(page);
    await startTake(page);
    await expect(card(page)).toBeVisible();
    await settle(page);

    const words = page.locator(SEL.words);
    const colours = await words.evaluate((el) =>
      [el, ...Array.from(el.querySelectorAll("*"))].map((n) => getComputedStyle(n).color),
    );
    expect(new Set(colours), "one text colour, no highlight").toEqual(new Set([INK]));
    await expect(card(page).locator(".is-now, .is-past, mark, [data-word], [aria-current]")).toHaveCount(0);

    const before = await card(page).evaluate((el) => el.outerHTML);
    // Let the take run: the Stop label's clock moves on, the card does not.
    await expect(stopButton(page)).toHaveText(/^Stop — 0:0[3-9]$/, { timeout: 10000 });
    expect(await card(page).evaluate((el) => el.outerHTML), "the card did not change").toBe(before);
    const running = await card(page).evaluate(
      (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length,
    );
    expect(running, "nothing in the card animates during the take").toBe(0);
    await stopTake(page);
  });

  test("the words keep their paragraphs, exactly as typed", async ({ page }) => {
    await openGoodnightMia(page);
    const typed = "Goodnight, my brave little star.\n\nLove, Grandma.";
    await typeWords(page, typed);
    await startTake(page);
    await expect(card(page)).toBeVisible();
    expect(await page.locator(SEL.words).evaluate((el) => el.textContent)).toBe(typed);
    await settle(page);
    // Three line boxes at least: the first paragraph, the blank line, the second.
    const lines = await page.locator(SEL.words).evaluate((el) => {
      const cs = getComputedStyle(el);
      return el.scrollHeight / parseFloat(cs.lineHeight);
    });
    expect(lines).toBeGreaterThanOrEqual(2.9);
    await stopTake(page);
  });

  test("the Stage is unchanged during the take (Stage = Player); Stop takes the card away", async ({ page }) => {
    await openGoodnightMia(page);
    await startTake(page);
    await expect(card(page)).toBeVisible();
    await expect(page.locator(SEL.textarea)).toHaveValue(WORDS);
    // The Stage's own words do not light either.
    await expect(
      page.locator(SEL.stageText).locator("mark, .is-now, .is-past, .is-current, [data-word], [aria-current]"),
    ).toHaveCount(0);

    await stopTake(page);
    await expect(card(page)).toHaveCount(0);
    await expect(page.locator(SEL.textarea)).toHaveValue(WORDS);
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(0);
  });

  test("a page with no words: the take shows no card, no placeholder", async ({ page }) => {
    await openGoodnightMia(page);
    for (const blank of ["", "   \n  "]) {
      await typeWords(page, blank);
      await startTake(page);
      await expect(stopButton(page)).toBeVisible();
      await expect(card(page), `words ${JSON.stringify(blank)}: no card`).toHaveCount(0);
      await expect(page.locator(SEL.toolCard).getByText(/read this/i)).toHaveCount(0);
      await stopTake(page);
    }
  });

  test("reduced motion: the card just appears (animationName none)", async ({ page }) => {
    await openGoodnightMia(page, { reducedMotion: true });
    await startTake(page);
    await expect(card(page)).toBeVisible();
    expect(await card(page).evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    expect(await card(page).evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
    await stopTake(page);
  });

  test("with motion the card fades in once, and then holds still", async ({ page }) => {
    await openGoodnightMia(page);
    await startTake(page);
    await expect(card(page)).toBeVisible();
    const name = await card(page).evaluate((el) => getComputedStyle(el).animationName);
    expect(name).not.toBe("none");
    const iterations = await card(page).evaluate((el) =>
      el.getAnimations().map((a) => a.effect?.getComputedTiming().iterations),
    );
    for (const n of iterations) expect(n).toBe(1);
    await stopTake(page);
  });
});

/* ===================================================================== fit */

test.describe("T19 · READ THIS fits the room", () => {
  for (const viewport of [PHONE_390, PHONE_375]) {
    const where = `${viewport.width}×${viewport.height}`;
    test(`${where}: the card and Stop are both on screen and apart; long words scroll inside the card`, async ({ page }) => {
      await openGoodnightMia(page, { viewport });
      await startTake(page);
      await expect(card(page)).toBeVisible();
      await expectCardAboveStop(page, where);
      let t = await readTake(page);
      expect(t.doc.scrollWidth, `${where}: no sideways scroll`).toBeLessThanOrEqual(viewport.width);
      expect(t.words?.scrollHeight, `${where}: Grandma's words fit without scrolling`).toBeLessThanOrEqual(
        (t.words?.clientHeight ?? 0) + 1,
      );
      await stopTake(page);

      // Far too many words: the card scrolls inside itself, ≤ 40 % of the screen tall.
      await typeWords(page, LONG_WORDS);
      await startTake(page);
      await expect(card(page)).toBeVisible();
      await expectCardAboveStop(page, `${where} long words`);
      t = await readTake(page);
      expect((t.card as DOMRect).height, `${where}: the card is at most 40 % of the screen`).toBeLessThanOrEqual(
        0.4 * viewport.height + 1,
      );
      expect(t.words?.scrollHeight ?? 0, `${where}: the words scroll inside the card`).toBeGreaterThan(
        (t.words?.clientHeight ?? 0) + 1,
      );
      await stopTake(page);
    });
  }

  test("a wide sheet (760 px) sets the words larger, up to 28 px", async ({ page }) => {
    await openGoodnightMia(page, { viewport: WIDE_SHEET });
    await startTake(page);
    await expect(card(page)).toBeVisible();
    await settle(page);
    const size = await page.locator(SEL.words).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThan(26);
    expect(size).toBeLessThanOrEqual(28);
    await expectCardAboveStop(page, "760×1000");
    await stopTake(page);
  });

  test("1180×820: in the docked Voice card above Stop, all the words in view, clear of the photo; the room fits", async ({ page }) => {
    await openGoodnightMia(page, { viewport: TABLET });
    await startTake(page);
    await expect(card(page)).toBeVisible();
    await expectCardAboveStop(page, "1180×820");
    const t = await readTake(page);
    expect(t.words?.scrollHeight, "1180×820: every word in view, no scrolling").toBeLessThanOrEqual(
      (t.words?.clientHeight ?? 0) + 1,
    );
    const photo = await box(page.locator(SEL.photo));
    expect(intersects(toBox(t.card as DOMRect), photo), "the card never covers the Stage photo").toBe(false);
    expect(t.doc.scrollHeight).toBeLessThanOrEqual(t.viewport.height);
    await expectRoomFits(page, "1180×820 mid-take");
    await stopTake(page);
  });

  for (const viewport of [LAPTOP, IPAD_LANDSCAPE]) {
    const where = `${viewport.width}×${viewport.height}`;
    test(`${where}: the room still fits during a take with the card showing, even with long words`, async ({ page }) => {
      await openGoodnightMia(page, { viewport });
      await startTake(page);
      await expect(card(page)).toBeVisible();
      await expectCardAboveStop(page, where);
      await expectRoomFits(page, `${where} mid-take`);
      await stopTake(page);

      await typeWords(page, LONG_WORDS);
      await startTake(page);
      await expect(card(page)).toBeVisible();
      await expectCardAboveStop(page, `${where} long words`);
      await expectRoomFits(page, `${where} mid-take, long words`);
      const t = await readTake(page);
      expect(t.words?.scrollHeight ?? 0, `${where}: the card scrolls inside itself`).toBeGreaterThan(
        (t.words?.clientHeight ?? 0) + 1,
      );
      // The Voice card itself never scrolls: the privacy footnote stays at its foot.
      const scrolls = await page.locator(SEL.toolCard).evaluate((el) => el.scrollHeight - el.clientHeight);
      expect(scrolls, `${where}: the Voice card does not scroll`).toBeLessThanOrEqual(1);
      await stopTake(page);
    });
  }

  test("a short laptop (1366×650, 1366×600): no card in the docked column; the Stage beside it keeps the words", async ({ page }) => {
    await openGoodnightMia(page, { viewport: { width: 1366, height: 650 } });
    await startTake(page);
    for (const viewport of [{ width: 1366, height: 650 }, { width: 1366, height: 600 }]) {
      const where = `${viewport.width}×${viewport.height}`;
      await page.setViewportSize(viewport);
      await settle(page);
      await expect(card(page), `${where}: no room for the card`).toBeHidden();
      await expect(page.locator(SEL.textarea)).toBeVisible();
      await expect(page.locator(SEL.textarea)).toHaveValue(WORDS);
      const tool = await box(page.locator(SEL.toolCard));
      const stop = await box(page.locator(SEL.record));
      expect(inside(stop, tool), `${where}: Stop in the Voice card`).toBe(true);
      const scrolls = await page.locator(SEL.toolCard).evaluate((el) => el.scrollHeight - el.clientHeight);
      expect(scrolls, `${where}: the Voice card does not scroll`).toBeLessThanOrEqual(1);
    }
    // Tall enough again (1366×768): the card comes back above Stop.
    await page.setViewportSize({ width: 1366, height: 768 });
    await expect(card(page)).toBeVisible();
    await expectCardAboveStop(page, "1366×768");
    await stopTake(page);
  });

  test("900×800: the floating Voice card holds the card above Stop, both on screen", async ({ page }) => {
    await openGoodnightMia(page, { viewport: BETWEEN });
    await startTake(page);
    await expect(card(page)).toBeVisible();
    await expectCardAboveStop(page, "900×800");
    const t = await readTake(page);
    expect(t.words?.scrollHeight, "900×800: every word in view").toBeLessThanOrEqual((t.words?.clientHeight ?? 0) + 1);
    await expectRoomFits(page, "900×800 mid-take");
    await stopTake(page);
  });
});
