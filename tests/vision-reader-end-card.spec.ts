/**
 * T12 · the end card prints the J-card liner notes and links to /protocol
 * (docs/vision/tickets/T12-end-card-jcard-liner-notes.md).
 *
 * Reference: s06 phone 1 (iPhone 390×844) — Grandma's end card for Mia's tape:
 * the tape label with a tilted sticker of the last drawing, the J-card
 * (PICTURES · WORDS · VOICE · MUSIC · OWNER · CONSENT, a label-yellow spine, a
 * tape-red stripe) ending in "What's inside this tape? →", Read it again and
 * Make your own story side by side, the QR row "PASS IT ON · POINT A PHONE AT
 * THIS" and "Nobody is counting plays. This page has no trackers."
 *
 * Seam: /read?story=<code> on a device-library tape (T00's Twinkle, seeded
 * with `seedDeviceLibrary`), walked to the end card with ArrowRight as the
 * shipped end-card tests do. Expected strings are literals here.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { seedDeviceLibrary } from "./fixtures/helpers";
import { TWINKLE } from "./fixtures/tapes";
import {
  libraryRow,
  NO_CONSENT_CODE,
  seedReaderTapes,
  TWO_VOICE_CONSENT_CODE,
  t12Rows,
} from "./fixtures/reader-tapes";

const TWINKLE_ROWS: Array<[string, string]> = [
  ["PICTURES", "5 pictures"],
  ["WORDS", "35 words on 5 pages"],
  ["VOICE", "Mia"],
  ["MUSIC", "Wonder"],
  ["OWNER", "© 2026 Mia, age 4 — with Mom · personal use"],
  ["CONSENT", "given by a parent or guardian · Oct 19, 2026 · written into this tape"],
];

const PRIVACY_LINE = "Nobody is counting plays. This page has no trackers.";
const LINK_NAME = /^What’s inside this tape\?$/;

/** Pass the cover gate and ArrowRight to the end card. */
async function walkToEnd(page: Page, url: string): Promise<Locator> {
  await page.goto(url);
  const root = page.locator(".pl-root");
  await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
  await page.getByRole("button", { name: /Tap to Begin/ }).click();
  await expect(root).toHaveAttribute("data-view", "page");
  for (let i = 0; i < 12; i++) {
    if ((await root.getAttribute("data-view")) === "end") break;
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(320);
  }
  await expect(root).toHaveAttribute("data-view", "end");
  const end = page.locator('[data-pl="end"]');
  await expect(end).toBeVisible();
  // measure the card as it is set, not mid font swap (the fallback mono is wider)
  await page.evaluate(() => document.fonts.ready.then(() => true));
  return end;
}

/** Seed Twinkle under a fresh 128-bit code and walk to its end card. */
async function twinkleEnd(page: Page): Promise<{ end: Locator; shareCode: string }> {
  const shareCode = randomBytes(16).toString("hex");
  await seedDeviceLibrary(page, "twinkle", { shareCode });
  const end = await walkToEnd(page, `/read?story=${shareCode}`);
  return { end, shareCode };
}

/** WCAG contrast of a computed `rgb()/rgba()` colour laid over tape paper (#FFFDF6). */
function contrastOnPaper(color: string): number {
  const [r, g, b, a = 1] = (color.match(/[\d.]+/g) ?? []).map(Number);
  const paper = [255, 253, 246];
  const mixed = [r, g, b].map((c, i) => c * a + paper[i] * (1 - a));
  const lum = (rgb: number[]) => {
    const [R, G, B] = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  };
  const [hi, lo] = [lum(paper), lum(mixed)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

async function top(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("not rendered");
  return box.y;
}

/**
 * The J-card's height beyond its rows: the card's box minus what the body
 * prints (the <dl>, the footer row with its margin, the body's padding). Only
 * the 3px top and bottom borders should be left — the spine's text never
 * sizes the card (s06: the rows fill the J-card).
 */
async function jcardSlack(jcard: Locator): Promise<{ card: number; rows: number; slack: number }> {
  return jcard.evaluate((el) => {
    const body = el.querySelector(".sk-jcard-body") as HTMLElement;
    const dl = body.querySelector("dl") as HTMLElement;
    const foot = body.querySelector(".sk-jcard-foot") as HTMLElement | null;
    const px = (v: string) => parseFloat(v) || 0;
    const bcs = getComputedStyle(body);
    const footH = foot
      ? foot.getBoundingClientRect().height + px(getComputedStyle(foot).marginTop) + px(getComputedStyle(foot).marginBottom)
      : 0;
    const rows = dl.getBoundingClientRect().height + footH + px(bcs.paddingTop) + px(bcs.paddingBottom);
    const card = el.getBoundingClientRect().height;
    return { card, rows, slack: card - rows };
  });
}

/**
 * An element's text as the browser broke it into lines: each line's
 * characters in order, whitespace collapsed and trimmed. Read from the
 * characters' own boxes, so it is the layout, not the markup.
 */
async function renderedLines(el: Locator): Promise<string[]> {
  return el.evaluate((root) => {
    const lines: Array<{ top: number; bottom: number; text: string }> = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      for (let i = 0; i < text.length; i++) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rect = range.getClientRects()[0];
        if (!rect || rect.height === 0) continue;
        const mid = (rect.top + rect.bottom) / 2;
        let line = lines.find((l) => mid >= l.top && mid <= l.bottom);
        if (!line) {
          line = { top: rect.top, bottom: rect.bottom, text: "" };
          lines.push(line);
        }
        line.text += text[i];
      }
    }
    return lines
      .sort((a, b) => a.top - b.top)
      .map((l) => l.text.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  });
}

/** Any label character (title, author, meta) whose box runs under the sticker. */
async function labelTextUnderSticker(end: Locator): Promise<string> {
  return end.evaluate((root) => {
    const sticker = root.querySelector('[data-pl="end-sticker"]')?.getBoundingClientRect();
    const field = root.querySelector(".sk-tape-field");
    if (!sticker || !field) return "";
    let under = "";
    const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      for (let i = 0; i < text.length; i++) {
        if (/\s/.test(text[i])) continue;
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        const overlaps =
          r.right > sticker.left + 0.5 &&
          r.left < sticker.right - 0.5 &&
          r.bottom > sticker.top + 0.5 &&
          r.top < sticker.bottom - 0.5;
        if (overlaps) under += text[i];
      }
    }
    return under;
  });
}

/** The spine's printed line stays inside the spine (it is cut, never overflows). */
async function spineFits(jcard: Locator): Promise<boolean> {
  return jcard.locator('[data-jcard="spine"]').evaluate((el) => {
    const spine = el.getBoundingClientRect();
    const line = (el.firstElementChild as HTMLElement).getBoundingClientRect();
    return line.top >= spine.top - 0.5 && line.bottom <= spine.bottom + 0.5 && line.height > 0;
  });
}

/* ─────────────────────────────────────────────── the J-card, Twinkle */

test.describe("T12 · end card · Twinkle's liner notes", () => {
  test("label + sticker, J-card rows verbatim, link, actions, QR row, Close, privacy line — in that order", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 390, height: 844 });
    const { end } = await twinkleEnd(page);

    await expect(page.getByRole("dialog", { name: "The end" })).toBeVisible();

    // the J-card: keys and values, verbatim, in order
    const jcard = end.getByRole("group", { name: "Liner notes" });
    await expect(jcard).toBeVisible();
    await expect(jcard).toHaveAttribute("data-sk", "jcard");
    expect(await jcard.locator("dt").allInnerTexts()).toEqual(TWINKLE_ROWS.map(([k]) => k));
    expect((await jcard.locator("dd").allInnerTexts()).map((t) => t.trim())).toEqual(TWINKLE_ROWS.map(([, v]) => v));

    // MUSIC is an inline mood tag with its lucide icon (decorative)
    const mood = jcard.locator('[data-mood="Wonder"]');
    await expect(mood).toBeVisible();
    await expect(mood.locator("svg")).toHaveAttribute("aria-hidden", "true");

    // VOICE prints the narrator's name in 600, as s06 does
    await expect(jcard.locator('[data-row="VOICE"] dd b')).toHaveText("Mia");

    // CONSENT carries the small tape-red ring glyph, decorative
    const ring = jcard.locator('[data-jcard="stamp"]');
    await expect(ring).toHaveCount(1);
    await expect(ring).toHaveAttribute("aria-hidden", "true");
    expect(await ring.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe("rgb(227, 69, 47)");

    // Register B: paper, 3px ink border, radius 10, 6px tape-red bottom stripe, label-yellow spine
    const card = await jcard.evaluate((el) => {
      const cs = getComputedStyle(el);
      const after = getComputedStyle(el, "::after");
      return {
        bg: cs.backgroundColor,
        border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
        radius: cs.borderTopLeftRadius,
        stripe: `${after.height} ${after.backgroundColor}`,
      };
    });
    expect(card).toEqual({
      bg: "rgb(255, 253, 246)",
      border: "3px solid rgb(30, 26, 22)",
      radius: "10px",
      stripe: "6px rgb(227, 69, 47)",
    });

    // keys: mono 9.5px uppercase, quiet ink that still reads at AA (4.5:1) on paper
    const key = await jcard.locator("dt").first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return { size: cs.fontSize, family: cs.fontFamily, color: cs.color };
    });
    expect(key.size).toBe("9.5px");
    expect(key.family).toMatch(/plex|mono/i);
    expect(contrastOnPaper(key.color)).toBeGreaterThanOrEqual(4.5);

    // the spine prints the title from a data attribute: no DOM text, hidden from AT
    const spine = jcard.locator('[data-jcard="spine"]');
    await expect(spine).toHaveAttribute("aria-hidden", "true");
    const spineInfo = await spine.evaluate((el) => {
      const cs = getComputedStyle(el);
      const line = el.firstElementChild as HTMLElement;
      return {
        text: el.textContent,
        content: `${getComputedStyle(line, "::before").content}+${getComputedStyle(line, "::after").content}`,
        bg: cs.backgroundColor,
        width: el.getBoundingClientRect().width,
        mode: getComputedStyle(line).writingMode,
        fits: line.getBoundingClientRect().height <= el.getBoundingClientRect().height,
      };
    });
    expect(spineInfo.text).toBe("");
    expect(spineInfo.content).toBe(`"${TWINKLE.title}"+" · SIDE A"`);
    expect(spineInfo.bg).toBe("rgb(255, 201, 60)");
    expect(spineInfo.width).toBeCloseTo(24, 0);
    expect(spineInfo.mode).toBe("vertical-rl");
    expect(spineInfo.fits, "the spine's line stays on the spine").toBe(true);

    // the rows size the J-card, not the spine's title (only the 3px borders are left over)
    const sized = await jcardSlack(jcard);
    expect(sized.slack, `J-card ${sized.card}px for ${sized.rows}px of rows`).toBeLessThanOrEqual(8);

    // the title is DOM text exactly once on the end card: the label
    await expect(end.getByText(TWINKLE.title)).toHaveCount(1);
    await expect(end.locator('[data-sk="tape"]')).toContainText(TWINKLE.title);

    // the link is the J-card's last row
    const link = end.getByRole("link", { name: LINK_NAME });
    await expect(link).toHaveAttribute("href", "/protocol");
    expect(await link.evaluate((el) => !!el.closest('[data-sk="jcard"]'))).toBe(true);
    await expect(link.locator("svg")).toHaveAttribute("aria-hidden", "true");

    // the sticker: 52px, tilted 6°, on the label's right edge, decorative
    const sticker = end.locator('[data-pl="end-sticker"]');
    await expect(sticker).toHaveAttribute("aria-hidden", "true");
    const st = await sticker.evaluate((el) => {
      const tape = el.parentElement?.querySelector('[data-sk="tape"]')?.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return {
        w: (el as HTMLElement).offsetWidth,
        h: (el as HTMLElement).offsetHeight,
        deg: (Math.atan2(m.b, m.a) * 180) / Math.PI,
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        tape: tape ? { right: tape.right, top: tape.top, bottom: tape.bottom } : null,
        img: (el.querySelector("img") as HTMLImageElement | null)?.naturalWidth ?? 0,
      };
    });
    expect(st.w).toBe(52);
    expect(st.h).toBe(52);
    expect(st.deg).toBeCloseTo(6, 1);
    expect(st.tape).not.toBeNull();
    expect(Math.abs(st.cx - st.tape!.right)).toBeLessThan(30);
    expect(st.cy).toBeGreaterThan(st.tape!.top);
    expect(st.cy).toBeLessThan(st.tape!.bottom);
    expect(st.img, "the sticker shows the last picture").toBeGreaterThan(0);

    // actions: Read it again + Make your own story; the one filled gold action
    const again = end.getByRole("button", { name: "Read it again" });
    const make = end.getByRole("button", { name: "Make your own story" });
    await expect(again).toBeVisible();
    await expect(make).toBeVisible();
    const gold = end.locator('[data-sk="big"][data-variant="gold"]');
    await expect(gold).toHaveCount(1);
    await expect(gold).toHaveText("Make your own story");
    // side by side at 390
    expect(Math.abs((await top(again)) - (await top(make)))).toBeLessThan(2);

    // nothing that belongs to other tickets or is an Idea
    await expect(end.getByText(/Send a thank-you back/i)).toHaveCount(0);
    await expect(end.getByText(/Keep it on this phone/i)).toHaveCount(0);
    await expect(end.getByText("Idea", { exact: true })).toHaveCount(0);
    await expect(end.getByText("Next", { exact: true })).toHaveCount(0);

    // the QR row: heading + the exact share URL
    const qrRow = end.locator('[data-pl="qr-card"]');
    await expect(qrRow.locator('[data-pl="qr"]')).toBeVisible({ timeout: 10000 });
    expect((await qrRow.locator(".pl-qr-title").innerText()).trim()).toBe("PASS IT ON · POINT A PHONE AT THIS");
    // s06 `.s06-qrrow__t`: mono 11px on one line at 390
    const heading = await qrRow.locator(".pl-qr-title").evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        size: cs.fontSize,
        oneLine: el.getBoundingClientRect().height <= parseFloat(cs.lineHeight) + 1,
        fits: el.scrollWidth <= el.clientWidth,
      };
    });
    expect(heading).toEqual({ size: "11px", oneLine: true, fits: true });
    expect((await qrRow.locator(".pl-qr-url").innerText()).trim()).toBe(page.url());

    // Close, then the privacy line in mono
    const close = end.getByRole("button", { name: "Close" });
    await expect(close).toBeVisible();
    const privacy = end.getByText(PRIVACY_LINE, { exact: true });
    await expect(privacy).toHaveCount(1);
    expect(await privacy.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/plex|mono/i);

    // the order, top to bottom
    const order = [
      await top(end.locator('[data-sk="tape"]')),
      await top(jcard),
      await top(again),
      await top(qrRow),
      await top(close),
      await top(privacy),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(order.length);
  });

  test("two voices: one CONSENT line per record, each led by the voice's name", async ({ page }) => {
    test.setTimeout(60000);
    await seedReaderTapes(page, t12Rows());
    const end = await walkToEnd(page, `/read?story=${TWO_VOICE_CONSENT_CODE}`);
    const consent = end.locator('[data-sk="jcard"] [data-row="CONSENT"] dd');
    expect((await consent.locator("[data-line]").allInnerTexts()).map((t) => t.trim())).toEqual([
      "Ada, age 5: given by a parent or guardian · Oct 20, 2026 · written into this tape",
      "Grandpa Joe: given by the speaker, for their own voice · Oct 21, 2026 · written into this tape",
    ]);
  });

  test("a tape with no pictures: no sticker, no PICTURES row", async ({ page }) => {
    test.setTimeout(60000);
    const code = "a12c12c12c12c12c12c12c12c12c12c1";
    await seedReaderTapes(page, [
      libraryRow(
        {
          version: "2.0",
          metadata: { title: "Words Only", author: "Reader fixture" },
          settings: { autoPlay: false, pageTurnSound: false },
          pages: [
            { id: 1, layout: "text-only", text: { content: "Nothing to see here." } },
            { id: 2, layout: "text-only", text: { content: "Only words, all the way." } },
          ],
        },
        code,
      ),
    ]);
    const end = await walkToEnd(page, `/read?story=${code}`);
    await expect(end.locator('[data-pl="end-sticker"]')).toHaveCount(0);
    expect(await end.locator('[data-sk="jcard"] dt').allInnerTexts()).toEqual(["WORDS", "VOICE", "MUSIC"]);
    expect((await end.locator('[data-sk="jcard"] dd').allInnerTexts()).map((t) => t.trim())).toEqual([
      "9 words on 2 pages",
      "Read by the browser voice",
      "No music — a quiet tape",
    ]);
  });

  test("the house tape: browser voice, three mood tags, no OWNER or CONSENT, no QR", async ({ page }) => {
    test.setTimeout(90000);
    const end = await walkToEnd(page, "/read?demo=1");
    const jcard = end.locator('[data-sk="jcard"]');
    expect(await jcard.locator("dt").allInnerTexts()).toEqual(["PICTURES", "WORDS", "VOICE", "MUSIC"]);
    expect((await jcard.locator("dd").allInnerTexts()).map((t) => t.trim().replace(/\s+/g, " "))).toEqual([
      "7 pictures",
      "184 words on 8 pages",
      "Read by the browser voice",
      "Wonder · Adventure · Calm",
    ]);
    await expect(jcard.locator("[data-mood]")).toHaveCount(3);
    await expect(end.locator('[data-pl="qr"]')).toHaveCount(0);
    await expect(end.getByText("The Brave Little Star")).toHaveCount(1);

    // four short rows: the card is as tall as they are, not as the spine's title
    const sized = await jcardSlack(jcard);
    expect(sized.slack, `J-card ${sized.card}px for ${sized.rows}px of rows`).toBeLessThanOrEqual(8);
    expect(await spineFits(jcard), "the spine's line stays on the spine").toBe(true);
  });

  test("a long title never sizes the J-card: the rows do, and the spine cuts it", async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 390, height: 844 });
    // a child's title is user content: this one is 77 characters, far longer than any spine
    const title = "The Little Paper Boat That Sailed Down the Garden Hose All the Way to the Sea";
    expect(title.length).toBeGreaterThanOrEqual(70);
    const code = "a12c12c12c12c12c12c12c12c12c12c2";
    await seedReaderTapes(page, [
      libraryRow(
        {
          version: "2.0",
          metadata: { title, author: "Reader fixture" },
          settings: { autoPlay: false, pageTurnSound: false },
          pages: [
            { id: 1, layout: "text-only", text: { content: "A boat of folded paper." } },
            { id: 2, layout: "text-only", text: { content: "It sailed, and sailed, and sailed." } },
          ],
        },
        code,
      ),
    ]);
    const end = await walkToEnd(page, `/read?story=${code}`);
    const jcard = end.locator('[data-sk="jcard"]');
    await expect(jcard).toBeVisible();

    const sized = await jcardSlack(jcard);
    expect(sized.slack, `J-card ${sized.card}px for ${sized.rows}px of rows`).toBeLessThanOrEqual(8);
    expect(await spineFits(jcard), "the spine's line stays on the spine").toBe(true);

    // the spine still carries the whole title for its generated text; DOM text stays the label's alone
    expect(
      await jcard
        .locator('[data-jcard="spine"] > span')
        .evaluate((el) => getComputedStyle(el, "::before").content),
    ).toBe(`"${title}"`);
    await expect(end.getByText(title)).toHaveCount(1);

    // and the actions stay on the first screen, right under the card
    await end.evaluate((el) => el.scrollTo(0, 0));
    const again = await end.getByRole("button", { name: "Read it again" }).boundingBox();
    expect(again).not.toBeNull();
    expect(again!.y + again!.height).toBeLessThanOrEqual(844);
  });
});

/* ─────────────────────────────── line breaks, the unnamed voice, replay (round 2) */

/** A pictured tape with no author line: its meta sits level with the sticker. */
const NO_AUTHOR_CODE = "a12c12c12c12c12c12c12c12c12c12c3";
const noAuthorRow = () =>
  libraryRow(
    {
      version: "2.0",
      metadata: { title: "Puddles" },
      settings: { autoPlay: false, pageTurnSound: false },
      pages: [
        { id: 1, illustration: { url: "/demo/images/page3.jpg" }, text: { content: "Splash, said the boots." } },
        { id: 2, illustration: { url: "/demo/images/page4.jpg" }, text: { content: "Splash, said the rain." } },
      ],
    },
    NO_AUTHOR_CODE,
  );

test.describe("T12 · end card · line breaks", () => {
  for (const width of [320, 360, 390]) {
    test(`${width} px: the label's meta keeps its runtime with its pages, and no label text runs under the sticker`, async ({
      page,
    }) => {
      test.setTimeout(90000);
      await page.setViewportSize({ width, height: 760 });
      const { end } = await twinkleEnd(page);
      await end.evaluate((el) => el.scrollTo(0, 0));

      const meta = await renderedLines(end.locator(".sk-tape-meta"));
      expect(meta.join(" ")).toMatch(/^SIDE A COMPLETE · 5 PAGES · ~\d+:\d{2}$/);
      for (const line of meta) expect(line, `meta lines ${JSON.stringify(meta)}`).not.toMatch(/·$/);
      expect(meta.some((line) => /PAGES · ~\d+:\d{2}$/.test(line)), `meta lines ${JSON.stringify(meta)}`).toBe(true);
      // from 360 the meta sits under the sticker's band, so it takes the label's full width: one line
      if (width >= 360) expect(meta).toHaveLength(1);

      expect(await labelTextUnderSticker(end), "label text under the sticker").toBe("");
    });

    test(`${width} px: a label with no author line still keeps its meta clear of the sticker`, async ({ page }) => {
      test.setTimeout(60000);
      await page.setViewportSize({ width, height: 760 });
      await seedReaderTapes(page, [noAuthorRow()]);
      const end = await walkToEnd(page, `/read?story=${NO_AUTHOR_CODE}`);
      await end.evaluate((el) => el.scrollTo(0, 0));
      await expect(end.locator(".sk-tape-author")).toHaveCount(0);
      await expect(end.locator('[data-pl="end-sticker"]')).toHaveCount(1);

      const meta = await renderedLines(end.locator(".sk-tape-meta"));
      expect(meta.join(" ")).toMatch(/^SIDE A COMPLETE · 2 PAGES · ~\d+:\d{2}$/);
      for (const line of meta) expect(line, `meta lines ${JSON.stringify(meta)}`).not.toMatch(/·$/);
      expect(await labelTextUnderSticker(end), "label text under the sticker").toBe("");
    });
  }

  for (const width of [320, 390]) {
    test(`${width} px: on the house tape a MUSIC separator always travels with the mood after it`, async ({ page }) => {
      test.setTimeout(90000);
      await page.setViewportSize({ width, height: 760 });
      const end = await walkToEnd(page, "/read?demo=1");
      const music = end.locator('[data-sk="jcard"] [data-row="MUSIC"] dd');
      const lines = await renderedLines(music);
      expect(lines.join(" ")).toBe("Wonder · Adventure · Calm");
      for (const line of lines) expect(line, `MUSIC lines ${JSON.stringify(lines)}`).not.toMatch(/·$/);
    });
  }

  test("four rows: the house tape's short spine sets at 0.12em so more of its title survives; Twinkle's six keep 0.16em", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 390, height: 844 });
    const spacing = (end: Locator) =>
      end.locator('[data-jcard="spine"] > span').evaluate((el) => getComputedStyle(el).letterSpacing);

    const house = await walkToEnd(page, "/read?demo=1");
    await expect(house.locator('[data-sk="jcard"] dt')).toHaveCount(4);
    expect(await spacing(house)).toBe("1.14px"); // 0.12em of 9.5px
    expect(await spineFits(house.locator('[data-sk="jcard"]')), "the spine's line stays on the spine").toBe(true);

    const { end: twinkle } = await twinkleEnd(page);
    await expect(twinkle.locator('[data-sk="jcard"] dt')).toHaveCount(6);
    expect(await spacing(twinkle)).toBe("1.52px"); // 0.16em of 9.5px
  });
});

test.describe("T12 · end card · an unnamed voice, and replay", () => {
  test("a recorded voice with no name is not printed bold as if it were one", async ({ page }) => {
    test.setTimeout(60000);
    await seedReaderTapes(page, t12Rows());
    const end = await walkToEnd(page, `/read?story=${NO_CONSENT_CODE}`);
    const voice = end.locator('[data-sk="jcard"] [data-row="VOICE"] dd');
    await expect(voice).toHaveText("A recorded voice");
    await expect(voice.locator("b")).toHaveCount(0);
    expect(await voice.evaluate((el) => getComputedStyle(el).fontWeight)).toBe("400");
    const consent = end.locator('[data-sk="jcard"] [data-row="CONSENT"] dd');
    await expect(consent).toHaveText("No consent record in this tape");
    await expect(consent.locator("[data-line]")).toHaveCount(0);
  });

  test("Read it again puts focus on the stage, not the page body: Space pauses, the arrows turn", async ({ page }) => {
    test.setTimeout(90000);
    const { end } = await twinkleEnd(page);
    await end.getByRole("button", { name: "Read it again" }).focus();
    await page.keyboard.press("Enter");

    const root = page.locator(".pl-root");
    await expect(root).toHaveAttribute("data-view", "page");
    await expect(root).toHaveAttribute("data-page", "1");
    await expect(page.locator(".pl-stage")).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);

    // the keyboard keeps its tape meanings from there
    await page.keyboard.press(" ");
    await expect(page.locator('.pl-transport button[aria-label="Play"]')).toHaveCount(1);
    const before = Number(await root.getAttribute("data-page"));
    await page.keyboard.press("ArrowRight");
    await expect(root).toHaveAttribute("data-page", String(before + 1));
  });
});

/* ──────────────────────────────────────────── "What's inside this tape?" */

test.describe("T12 · end card · What's inside this tape? → /protocol", () => {
  test("a click opens the protocol page", async ({ page }) => {
    test.setTimeout(90000);
    const { end } = await twinkleEnd(page);
    await end.getByRole("link", { name: LINK_NAME }).click();
    await expect(page).toHaveURL(/\/protocol$/);
    await expect(page.getByRole("heading", { level: 1, name: "One file holds the whole storybook." })).toBeVisible({
      timeout: 20000,
    });
  });

  test("Enter on the focused link opens it too", async ({ page }) => {
    test.setTimeout(90000);
    const { end } = await twinkleEnd(page);
    await end.getByRole("link", { name: LINK_NAME }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/protocol$/);
    await expect(page.getByRole("heading", { level: 1, name: "One file holds the whole storybook." })).toBeVisible({
      timeout: 20000,
    });
  });
});

/* ───────────────────────────────────────────────────────── keyboard */

test.describe("T12 · end card · keyboard", () => {
  test("Tab: the link, Read it again, Make your own story, Close — each with the kit ring; Escape still exits", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await twinkleEnd(page);

    const seen: Array<{ name: string; outline: string; inEnd: boolean }> = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      seen.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          const cs = el ? getComputedStyle(el) : null;
          return {
            name: (el?.getAttribute("aria-label") || el?.textContent || "").trim(),
            outline: cs ? `${cs.outlineWidth} ${cs.outlineStyle}` : "",
            inEnd: !!el?.closest('[data-pl="end"]'),
          };
        }),
      );
    }
    expect(seen.map((s) => s.name)).toEqual([
      "What’s inside this tape?",
      "Read it again",
      "Make your own story",
      "Close",
    ]);
    for (const s of seen) {
      expect(s.inEnd, `${s.name} is on the end card`).toBe(true);
      expect(s.outline, `${s.name} shows the kit focus ring`).toBe("3px solid");
    }
    // focus stays on the card: the next Tab comes back round to the link
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe("What’s inside this tape?");
    // The link sits on paper (#FFFDF6): gold would be ~2.1:1, under WCAG
    // 1.4.11's 3:1, so its ring is inked (Register B), the way the kit inks
    // the ring on its gold button.
    expect(
      await page.evaluate(() => getComputedStyle(document.activeElement as HTMLElement).outlineColor),
      "the link's ring is ink on paper",
    ).toBe("rgb(30, 26, 22)");

    // Escape still leaves the tape (a shared link goes home)
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/localhost:3000\/$/);
  });
});

/* ───────────────────────────────────────────────────────── phones */

for (const viewport of [
  { width: 390, height: 844 },
  { width: 375, height: 812 },
]) {
  test(`T12 · end card · ${viewport.width}×${viewport.height}: all of it reachable by scrolling, no side scroll`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    const { end } = await twinkleEnd(page);
    await expect(end.locator('[data-pl="qr"]')).toBeVisible({ timeout: 10000 });

    const sides = await end.evaluate((el) => ({
      end: el.scrollWidth - el.clientWidth,
      doc: document.documentElement.scrollWidth - window.innerWidth,
    }));
    expect(sides.end, "the end card scrolls sideways").toBeLessThanOrEqual(0);
    expect(sides.doc, "the page scrolls sideways").toBeLessThanOrEqual(0);

    // at the top: the label is in view
    await end.evaluate((el) => el.scrollTo(0, 0));
    const label = await end.locator('[data-sk="tape"]').boundingBox();
    expect(label!.y).toBeGreaterThanOrEqual(0);

    // scrolled to the bottom: the last line is in view
    await end.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.waitForTimeout(100);
    const last = await end.getByText(PRIVACY_LINE, { exact: true }).boundingBox();
    expect(last).not.toBeNull();
    expect(last!.y).toBeGreaterThanOrEqual(0);
    expect(last!.y + last!.height).toBeLessThanOrEqual(viewport.height);
    expect(last!.x).toBeGreaterThanOrEqual(0);
    expect(last!.x + last!.width).toBeLessThanOrEqual(viewport.width);
  });
}

test("T12 · end card · the action pair stacks below 360 px", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 340, height: 720 });
  const { end } = await twinkleEnd(page);
  const again = await end.getByRole("button", { name: "Read it again" }).boundingBox();
  const make = await end.getByRole("button", { name: "Make your own story" }).boundingBox();
  expect(make!.y).toBeGreaterThanOrEqual(again!.y + again!.height);
  const side = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(side).toBeLessThanOrEqual(0);

  // where 11px would not fit, the QR heading sets at 10.5px and may balance onto two lines — never wider than its row
  await expect(end.locator('[data-pl="qr"]')).toBeVisible({ timeout: 10000 });
  const heading = await end.locator(".pl-qr-title").evaluate((el) => ({
    size: getComputedStyle(el).fontSize,
    fits: el.scrollWidth <= el.clientWidth,
  }));
  expect(heading).toEqual({ size: "10.5px", fits: true });
});

/* ───────────────────────────────────────────────────── reduced motion */

test.describe("T12 · end card · motion", () => {
  test("it rises in by default, and appears without the rise under reduced motion", async ({ page }) => {
    test.setTimeout(120000);
    const { end } = await twinkleEnd(page);
    expect(await end.locator(".pl-end-inner").evaluate((el) => getComputedStyle(el).animationName)).toBe("pl-rise");

    const still = await page.context().newPage();
    await still.emulateMedia({ reducedMotion: "reduce" });
    const shareCode = randomBytes(16).toString("hex");
    await seedDeviceLibrary(still, "twinkle", { shareCode });
    const stillEnd = await walkToEnd(still, `/read?story=${shareCode}`);
    expect(await stillEnd.locator(".pl-end-inner").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    await still.close();
  });
});

/* ─────────────────────────────────────────── nothing fetched, counted, stored */

test("T12 · end card · nothing new is fetched, counted or stored", async ({ page }) => {
  test.setTimeout(90000);
  const shareCode = randomBytes(16).toString("hex");
  await seedDeviceLibrary(page, "twinkle", { shareCode });
  await page.goto(`/read?story=${shareCode}`);
  const root = page.locator(".pl-root");
  await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
  await page.getByRole("button", { name: /Tap to Begin/ }).click();
  // to the last page, one short of the end card
  for (let i = 0; i < TWINKLE.pages.length - 1; i++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(320);
  }
  await expect(root).toHaveAttribute("data-page", String(TWINKLE.pages.length));
  await expect(root).toHaveAttribute("data-view", "page");

  const snapshot = () =>
    page.evaluate(() => ({
      local: Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])),
      session: Object.fromEntries(Object.keys(sessionStorage).map((k) => [k, sessionStorage.getItem(k)])),
      cookie: document.cookie,
    }));
  const before = await snapshot();
  const requests: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    // the dev server's own hot-reload traffic is not the page fetching anything
    if (/\/_next\/|__nextjs|webpack-hmr|turbopack/.test(url)) return;
    requests.push(url);
  });

  await page.keyboard.press("ArrowRight");
  await expect(root).toHaveAttribute("data-view", "end");
  await expect(page.locator('[data-pl="qr"]')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1500);

  expect(requests, `the end card fetched: ${requests.join(", ")}`).toEqual([]);
  expect(await snapshot()).toEqual(before);
});
