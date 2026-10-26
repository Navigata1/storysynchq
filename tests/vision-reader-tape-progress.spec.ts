// T09b · Tape-pack progress on the reels + a strip of tape filling up (E2E).
//
// Reference: s02 (laptop 1120×700) — the deck chip's two 20 px reels each sit
// on "a tape-brown pack disc (left pack 18px wide, right 9px: early in the
// tape)", and "a 3px tape strip across the full width … with 8 ticks (segment
// 1 gold, segment 2 at 70%)". s05 (iPhone 390×844) — "two 18px reels on
// tape-pack discs (left pack bigger)" and "a 3px gold tape strip … with 5 ticks
// (segments 1-2 full, 3 at 80%)". The callout: "NOT VIDEO … no scrubber, no
// timecode, only a strip of tape filling up."
//
// The tape's place is p = (page index + in-page fraction) / page count
// (src/components/player/tape-position.ts). The packs are measured by their
// bounding boxes; the strip's fill is the sum of the segments' fills over the
// sum of the segments' lengths (the tape itself — the phone's gaps between
// segments are not tape).
//
// speechSynthesis is stubbed (as tests/vision-reader-deck-chip.spec.ts does):
// `__boundary(charIndex)` lights a word, `__endUtterance()` ends the line.

import { randomBytes } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { seedDeviceLibrary } from "./fixtures/helpers";
import { LONG_CLIP_CODE, LONG_CLIP_SECONDS, seedReaderTapes, t09bRows } from "./fixtures/reader-tapes";

const ROOT = ".pl-root";
const PACK_LEFT = '[data-pl="pack-left"]';
const PACK_RIGHT = '[data-pl="pack-right"]';
const SEG = '[data-pl="strip-seg"]';
const FILL = '[data-pl="strip-fill"]';

/** House tape, page 2 (public/demo/brave-little-star.ssync.json). */
const HOUSE_PAGE_2 =
  "Every night, she watched the world below. She saw children sleeping, parents reading stories, and cats prowling on rooftops.";

/** A browser voice that speaks when asked and stops when the test says so. */
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
    w.__endUtterance = () => {
      const u = w.__utt as FakeUtterance | null;
      w.__utt = null;
      u?.onend?.();
    };
  });
}

async function begin(page: Page, url: string): Promise<void> {
  await page.goto(url);
  const root = page.locator(ROOT);
  await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
  await page.getByRole("button", { name: /Tap to Begin/ }).click();
  await expect(root).toHaveAttribute("data-view", "page", { timeout: 10000 });
}

function chip(page: Page): Locator {
  return page.getByRole("group", { name: "Now playing" });
}

function strip(page: Page): Locator {
  return page.getByRole("progressbar", { name: "Story progress" });
}

/** Wait until the stubbed voice is speaking `text` (the utterance of the page on screen). */
async function waitForUtterance(page: Page, text: string): Promise<void> {
  await page.waitForFunction(
    (t) => ((window as unknown as { __utt: { text: string } | null }).__utt?.text ?? "").includes(t),
    text,
    { timeout: 10000 },
  );
}

/** Light word `word` (0-based) of `content`, as the browser voice's boundary event would. */
async function lightWord(page: Page, content: string, word: number): Promise<void> {
  const starts = [...content.matchAll(/\S+/g)].map((m) => m.index ?? 0);
  await page.evaluate((at) => (window as unknown as { __boundary: (n: number) => void }).__boundary(at), starts[word]);
}

interface Packs {
  left: number;
  right: number;
  leftH: number;
  rightH: number;
}

async function packs(page: Page): Promise<Packs> {
  return page.evaluate(
    ([l, r]) => {
      const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      const a = box(l);
      const b = box(r);
      return { left: a.width, right: b.width, leftH: a.height, rightH: b.height };
    },
    [PACK_LEFT, PACK_RIGHT],
  );
}

interface StripRead {
  /** Filled tape over the whole tape, 0–1. */
  share: number;
  /** Each segment's own fill, 0–1. */
  segs: number[];
  box: { x: number; y: number; w: number; h: number };
}

async function readStrip(page: Page): Promise<StripRead> {
  return page.evaluate(
    ([segSel, fillSel]) => {
      const bar = document.querySelector('[role="progressbar"]')!;
      const r = bar.getBoundingClientRect();
      let tape = 0;
      let filled = 0;
      const segs: number[] = [];
      for (const seg of Array.from(bar.querySelectorAll(segSel))) {
        const sw = seg.getBoundingClientRect().width;
        const fill = seg.querySelector(fillSel);
        const fw = fill ? fill.getBoundingClientRect().width : 0;
        tape += sw;
        filled += fw;
        segs.push(sw > 0 ? fw / sw : 0);
      }
      return { share: tape > 0 ? filled / tape : 0, segs, box: { x: r.x, y: r.y, w: r.width, h: r.height } };
    },
    [SEG, FILL],
  );
}

/** The strip's fill settles on `p` (±2 % of its length) once its ease-out has run. */
async function expectFill(page: Page, p: number, label: string): Promise<void> {
  await expect
    .poll(async () => Math.abs((await readStrip(page)).share - p), { message: `${label}: fill ≈ ${p}`, timeout: 4000 })
    .toBeLessThanOrEqual(0.02);
}

/** Every listed transition duration of `sel`, in seconds. */
async function durations(page: Page, sel: string): Promise<number[]> {
  return page.evaluate(
    (s) =>
      getComputedStyle(document.querySelector(s)!)
        .transitionDuration.split(",")
        .map((d) => parseFloat(d) * (d.trim().endsWith("ms") ? 0.001 : 1)),
    sel,
  );
}

/* ─────────────────────────────────────────── the house tape at 1120 × 700 */

test.describe("T09b · tape-pack progress (desktop, s02)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1120, height: 700 });
  });

  test("house tape page 1 · the reels sit on tape packs, left big; the strip is 8 segments, empty, and only a progressbar", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await stubSpeech(page);
    await begin(page, "/read?demo=1");
    await waitForUtterance(page, "Once upon a time");

    // two pack discs, decorative, one under each reel of the chip
    const deck = chip(page);
    await expect(deck.locator(PACK_LEFT)).toHaveCount(1);
    await expect(deck.locator(PACK_RIGHT)).toHaveCount(1);
    await expect(deck.locator(PACK_LEFT)).toBeVisible();
    await expect(deck.locator(PACK_RIGHT)).toBeVisible();
    for (const sel of [PACK_LEFT, PACK_RIGHT]) {
      expect(await deck.locator(sel).evaluate((el) => !!el.closest('[aria-hidden="true"]'))).toBe(true);
    }
    const tree = await deck.ariaSnapshot();
    expect(tree).not.toMatch(/pack/i);

    // the start of the tape: the left pack is full, the right one nearly empty
    const p0 = await packs(page);
    console.log("[t09b] house page 1 packs:", JSON.stringify(p0));
    expect(p0.left).toBeGreaterThan(p0.right + 4);
    expect(Math.abs(p0.left - p0.leftH)).toBeLessThanOrEqual(0.5); // a disc, not an ellipse
    // a pack sits under its reel: centred on the reel, and larger than it
    const centred = await deck.evaluate((el) => {
      const reels = Array.from(el.querySelectorAll('[data-sk="reel"]')).map((r) => r.getBoundingClientRect());
      const pk = ['[data-pl="pack-left"]', '[data-pl="pack-right"]'].map((s) =>
        el.querySelector(s)!.getBoundingClientRect(),
      );
      return pk.map((p, i) => ({
        dx: Math.abs(p.x + p.width / 2 - (reels[i].x + reels[i].width / 2)),
        dy: Math.abs(p.y + p.height / 2 - (reels[i].y + reels[i].height / 2)),
        bigger: p.width >= reels[i].width,
      }));
    });
    for (const c of centred) {
      expect(c.dx).toBeLessThanOrEqual(1);
      expect(c.dy).toBeLessThanOrEqual(1);
      expect(c.bigger).toBe(true);
    }

    // the strip: the same progressbar contract, one segment per page, nothing filled yet
    const bar = strip(page);
    await expect(bar).toHaveCount(1);
    await expect(bar).toHaveAttribute("aria-valuemin", "1");
    await expect(bar).toHaveAttribute("aria-valuemax", "8");
    await expect(bar).toHaveAttribute("aria-valuenow", "1");
    await expect(bar).toHaveAttribute("aria-valuetext", "Page 1 of 8");
    await expect(bar.locator(SEG)).toHaveCount(8);
    await expectFill(page, 0, "page 1 before a word");

    // no timecode, no handle, not draggable, not focusable as a slider
    await expect(bar).toHaveText("");
    await expect(bar).not.toHaveAttribute("tabindex", /.*/);
    await expect(bar).not.toHaveAttribute("draggable", "true");
    expect(await bar.evaluate((el) => (el as HTMLElement).tabIndex)).toBe(-1);
    await expect(page.getByRole("slider")).toHaveCount(0);
    await expect(page.locator('input[type="range"]')).toHaveCount(0);
    await expect(bar.locator("[tabindex], button, input, [draggable='true']")).toHaveCount(0);

    // s02: full width along the bottom edge of the room
    const s = await readStrip(page);
    expect(s.box.x).toBeLessThanOrEqual(0.5);
    expect(s.box.w).toBeGreaterThanOrEqual(1119);
    expect(s.box.h).toBeCloseTo(3, 0);
    expect(s.box.y + s.box.h).toBeGreaterThanOrEqual(699);
  });

  test("house tape · → ×7: the left pack never grows; the fill follows the lit word; at the end of page 8 the right pack is the big one", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await stubSpeech(page);
    await begin(page, "/read?demo=1");
    await waitForUtterance(page, "Once upon a time");
    const root = page.locator(ROOT);

    let lastLeft = (await packs(page)).left;
    let lastRight = (await packs(page)).right;
    const seen: Array<{ page: number; left: number; right: number }> = [];
    const sample = async (n: number) => {
      const now = await packs(page);
      seen.push({ page: n, left: now.left, right: now.right });
      expect(now.left, `page ${n}: the left pack grew`).toBeLessThanOrEqual(lastLeft + 0.01);
      expect(now.right, `page ${n}: the right pack shrank`).toBeGreaterThanOrEqual(lastRight - 0.01);
      lastLeft = now.left;
      lastRight = now.right;
    };

    for (let n = 2; n <= 8; n++) {
      await page.keyboard.press("ArrowRight");
      await sample(n);
      await expect(root).toHaveAttribute("data-page", String(n), { timeout: 5000 });
      // sampled again across the turn and the packs' ease-out
      for (let k = 0; k < 4; k++) {
        await page.waitForTimeout(160);
        await sample(n);
      }
      // a new page starts at its own beginning: p = (n − 1) / 8
      await expectFill(page, (n - 1) / 8, `page ${n} at its start`);

      if (n === 2) {
        // the browser voice lights "cats" (word 16 of 19): p = (1 + 16/19) / 8
        await waitForUtterance(page, "Every night");
        const words = HOUSE_PAGE_2.split(/\s+/);
        const cats = words.indexOf("cats");
        expect(cats).toBe(15);
        await lightWord(page, HOUSE_PAGE_2, cats);
        await expectFill(page, (1 + (cats + 1) / words.length) / 8, "page 2 at 'cats'");
        await expect(strip(page)).toHaveAttribute("aria-valuetext", "Page 2 of 8");
        // s02's "segment 1 gold, segment 2 at 70%": page 2's own segment holds its share
        await expect
          .poll(async () => Math.abs((await readStrip(page)).segs[1] - (cats + 1) / words.length), {
            timeout: 4000,
          })
          .toBeLessThanOrEqual(0.02);
        const segs = (await readStrip(page)).segs;
        expect(segs[0]).toBeGreaterThan(0.98);
        for (const f of segs.slice(2)) expect(f).toBeLessThan(0.02);
        await sample(n);
      }
    }
    console.log("[t09b] packs while turning forward:", JSON.stringify(seen.filter((_, i) => i % 5 === 0)));

    // page 8, after its voice: the tape has run to the right
    await waitForUtterance(page, "The End");
    await expect(strip(page)).toHaveAttribute("aria-valuenow", "8");
    await page.evaluate(() => (window as unknown as { __endUtterance: () => void }).__endUtterance());
    await expectFill(page, 1, "page 8 after its voice");
    await expect.poll(async () => (await packs(page)).right - (await packs(page)).left).toBeGreaterThan(4);
  });

  test("a 6 s recorded clip · the strip and the right pack grow while it plays (≈1 s vs ≈4 s); a wordless page fills once its beat has passed", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await seedReaderTapes(page, t09bRows());
    await begin(page, `/read?story=${LONG_CLIP_CODE}`);
    await expect(strip(page).locator(SEG)).toHaveCount(2);

    const clock = () =>
      page.evaluate(
        () =>
          (window as unknown as { __ssyncPlayer?: { narrationTime: () => number | null } }).__ssyncPlayer?.narrationTime() ??
          0,
      );
    await expect.poll(clock, { timeout: 10000 }).toBeGreaterThanOrEqual(1);
    const atOne = { fill: (await readStrip(page)).share, right: (await packs(page)).right, t: await clock() };
    await expect.poll(clock, { timeout: 10000 }).toBeGreaterThanOrEqual(4);
    const atFour = { fill: (await readStrip(page)).share, right: (await packs(page)).right, t: await clock() };
    console.log("[t09b] 6 s clip:", JSON.stringify({ atOne, atFour }));
    expect(atOne.t).toBeLessThan(2);
    expect(atFour.t).toBeLessThan(LONG_CLIP_SECONDS);
    expect(atFour.fill).toBeGreaterThan(atOne.fill);
    expect(atFour.right).toBeGreaterThan(atOne.right);
    // honest, not decorative: about 4/6 of page 1 of 2 (the ease-out may trail by ≤ 0.6 s)
    expect(atFour.fill).toBeGreaterThan((3.2 / LONG_CLIP_SECONDS) / 2);
    expect(atFour.fill).toBeLessThanOrEqual((LONG_CLIP_SECONDS / LONG_CLIP_SECONDS) / 2 + 0.02);

    // after the voice: page 1's segment is full
    await expectFill(page, 0.5, "page 1 after its voice");

    // page 2 has no words: once its beat has passed the tape is at its end
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(ROOT)).toHaveAttribute("data-page", "2");
    await expectFill(page, 1, "the wordless page 2 after its beat");
    await expect.poll(async () => (await packs(page)).right - (await packs(page)).left).toBeGreaterThan(4);
  });

  test("motion · the packs and the fill ease out over ~600 ms", async ({ page }) => {
    test.setTimeout(60000);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await stubSpeech(page);
    await begin(page, "/read?demo=1");
    for (const sel of [PACK_LEFT, PACK_RIGHT, FILL]) {
      const d = await durations(page, sel);
      expect(Math.max(...d), `${sel} transition`).toBeGreaterThanOrEqual(0.5);
      expect(Math.max(...d), `${sel} transition`).toBeLessThanOrEqual(0.7);
      const easing = await page.locator(sel).first().evaluate((el) => getComputedStyle(el).transitionTimingFunction);
      expect(easing, `${sel} easing`).not.toMatch(/linear|ease-in(?!-out)/);
    }
  });

  test("reduced motion · the packs and the fill change without a transition", async ({ page }) => {
    test.setTimeout(60000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await stubSpeech(page);
    await begin(page, "/read?demo=1");
    await waitForUtterance(page, "Once upon a time");
    for (const sel of [PACK_LEFT, PACK_RIGHT, FILL]) {
      for (const d of await durations(page, sel)) expect(d, `${sel} transition-duration`).toBe(0);
    }
    // and the new size is there at once
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(ROOT)).toHaveAttribute("data-page", "2");
    expect(Math.abs((await readStrip(page)).share - 1 / 8)).toBeLessThanOrEqual(0.02);
  });
});

/* ───────────────────────────────────────────── Grandma's iPhone, 390 × 844 */

test.describe("T09b · tape-pack progress (phone, s05)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("Twinkle · the pill's reels sit on packs; 5 segments across the full width above the home indicator, there while the chrome idles", async ({
    page,
  }) => {
    test.setTimeout(60000);
    const shareCode = randomBytes(16).toString("hex");
    await seedDeviceLibrary(page, "twinkle", { shareCode });
    await begin(page, `/read?story=${shareCode}`);

    const deck = chip(page);
    await expect(deck.locator(PACK_LEFT)).toBeVisible();
    await expect(deck.locator(PACK_RIGHT)).toBeVisible();
    const p0 = await packs(page);
    expect(p0.left).toBeGreaterThan(p0.right);
    // the pill keeps its s05 height with the packs inside it
    expect((await deck.boundingBox())!.height).toBeLessThanOrEqual(44);

    const bar = strip(page);
    await expect(bar).toHaveAttribute("aria-valuemax", "5");
    await expect(bar).toHaveAttribute("aria-valuetext", "Page 1 of 5");
    await expect(bar.locator(SEG)).toHaveCount(5);
    const s = await readStrip(page);
    console.log("[t09b] phone strip:", JSON.stringify(s.box));
    expect(s.box.x).toBeLessThanOrEqual(16.5);
    expect(s.box.x + s.box.w).toBeGreaterThanOrEqual(390 - 16.5);
    expect(s.box.h).toBeCloseTo(3, 0);
    // above the home indicator: off the very bottom edge, but still the bottom of the room
    expect(s.box.y + s.box.h).toBeLessThanOrEqual(844 - 16);
    expect(s.box.y).toBeGreaterThanOrEqual(844 - 40);

    // the transport, when it shows, stands clear above the strip
    const transport = await page.locator(".pl-transport").boundingBox();
    expect(transport!.y + transport!.height).toBeLessThanOrEqual(s.box.y - 4);

    // the chrome idles out; the strip stays, like the reels
    await expect(page.locator(".pl-chrome--top")).toHaveClass(/is-hidden/, { timeout: 10000 });
    await expect(bar).toBeVisible();
    const seen = await bar.evaluate((el) => {
      let o = 1;
      for (let n: Element | null = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      return o;
    });
    expect(seen).toBe(1);
  });

  test("Twinkle page 3 near the end of its clip · segments 1–2 full, 3 mostly full, 4–5 empty", async ({ page }) => {
    test.setTimeout(60000);
    const shareCode = randomBytes(16).toString("hex");
    await seedDeviceLibrary(page, "twinkle", { shareCode });
    await begin(page, `/read?story=${shareCode}`);
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(ROOT)).toHaveAttribute("data-page", "2");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(ROOT)).toHaveAttribute("data-page", "3");
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __ssyncPlayer?: { narrationTime: () => number | null } }).__ssyncPlayer?.narrationTime() ??
              0,
          ),
        { timeout: 15000 },
      )
      .toBeGreaterThanOrEqual(5.2);
    await page.waitForTimeout(650); // the ease-out catches up
    const segs = (await readStrip(page)).segs;
    console.log("[t09b] Twinkle page 3 segments:", JSON.stringify(segs));
    expect(segs[0]).toBeGreaterThan(0.98);
    expect(segs[1]).toBeGreaterThan(0.98);
    expect(segs[2]).toBeGreaterThan(0.6);
    expect(segs[3]).toBeLessThan(0.02);
    expect(segs[4]).toBeLessThan(0.02);
    await expect(strip(page)).toHaveAttribute("aria-valuetext", "Page 3 of 5");
  });
});
