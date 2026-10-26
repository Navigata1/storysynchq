// T09a · The expanded deck chip: three sounds and the narrator's name (E2E).
//
// Reference: s02 (laptop 1120×700) — the chip at top-left reads
//   VOICE · Storyteller (browser voice)
//   MELODY · Wonder, 12 dB under the voice
//   CHIME · next turn in 0:03
// and the right page ends with "next page in 3 s · turn cue ready".
// s05 (iPhone 390×844) — the chip is a pill: reels, "03 / 05", a hairline, the
// mic and "Mia".
//
// speechSynthesis is stubbed (as tests/critic-player.spec.ts does) so the
// browser voice speaks on demand: `__endUtterance()` finishes the line.

import { randomBytes } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { seedDeviceLibrary } from "./fixtures/helpers";
import {
  COUNTDOWN_CODE,
  MANUAL_CODE,
  NO_CUE_CODE,
  seedReaderTapes,
  t09aRows,
} from "./fixtures/reader-tapes";

const ROOT = ".pl-root";
const ROW = '[data-sk="deck-row"]';
const FOOT = '[data-pl="turn-foot"]';

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

function row(page: Page, name: "voice" | "melody" | "chime"): Locator {
  return chip(page).locator(`${ROW}[data-row="${name}"]`);
}

async function waitForSpeech(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __utt: unknown }).__utt !== null, null, {
    timeout: 10000,
  });
}

/** Keep the chrome up: a pointer move wakes it, as a listener's hand would. */
async function wake(page: Page): Promise<void> {
  const vp = page.viewportSize() ?? { width: 1280, height: 720 };
  await page.mouse.move(vp.width / 2, vp.height / 2);
  await page.mouse.move(vp.width / 2 + 7, vp.height / 2 + 5);
}

test.describe("T09a · the deck chip (desktop)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test("house tape · a 'Now playing' group: two reels, '01 / 08', and the three sounds in mono rows", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await stubSpeech(page);
    await begin(page, "/read?demo=1");
    await waitForSpeech(page);
    await expect(page.locator(ROOT)).toHaveAttribute("data-music", "on", { timeout: 10000 });

    const deck = chip(page);
    await expect(deck).toHaveCount(1);
    await expect(deck).toHaveClass(/\bpl-deck\b/);
    await expect(deck).not.toHaveAttribute("aria-hidden", "true");
    await expect(deck.locator('[data-sk="reel"]')).toHaveCount(2);
    await expect(deck.locator(".pl-deck-read")).toHaveText("01 / 08");

    await expect(page.locator(ROW)).toHaveCount(3);
    await expect(row(page, "voice")).toHaveText("VOICE · Storyteller (browser voice)", { useInnerText: true });
    await expect(row(page, "melody")).toHaveText("MELODY · Wonder, 12 dB under the voice", {
      useInnerText: true,
    });
    await expect(row(page, "chime")).toHaveText("CHIME · after the voice", { useInnerText: true });
    for (const name of ["voice", "melody", "chime"] as const) await expect(row(page, name)).toBeVisible();

    // top-left glass, radius 18, mono rows
    const look = await deck.evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const rowEl = el.querySelector('[data-sk="deck-row"]');
      return {
        x: r.x,
        y: r.y,
        radius: cs.borderTopLeftRadius,
        blur: cs.backdropFilter || (cs as unknown as Record<string, string>).webkitBackdropFilter,
        rowFont: rowEl ? getComputedStyle(rowEl).fontFamily.toLowerCase() : "",
      };
    });
    expect(look.x).toBeLessThan(40);
    expect(look.y).toBeLessThan(40);
    expect(look.radius).toBe("18px");
    expect(look.blur).toContain("blur(");
    expect(look.rowFont).toMatch(/plex mono|mono/);

    // decorative micro-glyphs: a 9-bar waveform, three note dots + an arrow, a hollow ring
    const glyphs = deck.locator('[data-sk="deck-glyph"]');
    await expect(glyphs).toHaveCount(3);
    for (let i = 0; i < 3; i++) await expect(glyphs.nth(i)).toHaveAttribute("aria-hidden", "true");
    const wave = deck.locator('[data-sk="deck-glyph"][data-glyph="wave"]');
    await expect(wave.locator("rect")).toHaveCount(9);
    await expect(deck.locator('[data-glyph="notes"] circle')).toHaveCount(3);
    await expect(deck.locator('[data-glyph="notes"] path')).toHaveCount(1);
    await expect(deck.locator('[data-glyph="ring"] circle').first()).toHaveAttribute("fill", "none");

    // gold while the browser voice speaks — static bars, never a loop
    await expect(wave).toHaveAttribute("data-speaking", "true");
    await expect
      .poll(() => wave.evaluate((el) => getComputedStyle(el.querySelector("rect")!).fill))
      .toBe("rgb(245, 181, 68)");
    // static bars: no keyframe animation and nothing that repeats (the colour
    // change itself is a one-shot ease)
    const lit = await wave.evaluate((el) => ({
      loops: el
        .getAnimations({ subtree: true })
        .filter(
          (a) =>
            a.constructor.name === "CSSAnimation" || a.effect?.getComputedTiming().iterations === Infinity,
        ).length,
      animationName: getComputedStyle(el.querySelector("rect")!).animationName,
    }));
    expect(lit.loops).toBe(0);
    expect(lit.animationName).toBe("none");

    // the voice finishes: the bars go dim and the chime counts down to the turn
    await page.evaluate(() => (window as unknown as { __endUtterance(): void }).__endUtterance());
    await expect(wave).toHaveAttribute("data-speaking", "false");
    await expect
      .poll(() => wave.evaluate((el) => getComputedStyle(el.querySelector("rect")!).fill))
      .not.toBe("rgb(245, 181, 68)");
    await expect(row(page, "chime")).toHaveText(/^CHIME · next turn in 0:0[1-3]$/, { useInnerText: true });

    // the chip never claims a page of its own (fable-pass reads [data-page] with .first())
    await expect(deck.locator("[data-page]")).toHaveCount(0);
  });

  test("Music off · the melody row says so, and comes back with the music", async ({ page }) => {
    test.setTimeout(60000);
    await stubSpeech(page);
    await begin(page, "/read?demo=1");
    await expect(page.locator(ROOT)).toHaveAttribute("data-music", "on", { timeout: 10000 });
    await expect(row(page, "melody")).toHaveText("MELODY · Wonder, 12 dB under the voice", {
      useInnerText: true,
    });

    await page.getByRole("button", { name: "Music on" }).click();
    await expect(page.locator(ROOT)).toHaveAttribute("data-music", "off");
    await expect(row(page, "melody")).toHaveText("MELODY · off", { useInnerText: true });

    await page.getByRole("button", { name: "Music off" }).click();
    await expect(page.locator(ROOT)).toHaveAttribute("data-music", "on");
    await expect(row(page, "melody")).toHaveText("MELODY · Wonder, 12 dB under the voice", {
      useInnerText: true,
    });
  });

  test("Twinkle · a recorded voice is the narrator: VOICE · Mia", async ({ page }) => {
    test.setTimeout(60000);
    const shareCode = randomBytes(16).toString("hex");
    await seedDeviceLibrary(page, "twinkle", { shareCode });
    await begin(page, `/read?story=${shareCode}`);
    await expect(row(page, "voice")).toHaveText("VOICE · Mia", { useInnerText: true });
    await expect(row(page, "voice")).toBeVisible();
    await expect(row(page, "melody")).toHaveText(/^MELODY · Wonder(, 12 dB under the voice)?$/, {
      useInnerText: true,
    });
    await expect(chip(page).locator(".pl-deck-read")).toHaveText("01 / 05");
    // T03's mic is still the only mic on the chip
    await expect(chip(page).locator('[data-pl="deck-mic"]')).toHaveCount(1);
  });

  test("countdown tape · after the voice, 'next turn in 0:04' counts down once a second and the page turns itself", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await seedReaderTapes(page, t09aRows());
    // Record every distinct CHIME row and foot line, with the page and the time,
    // from before Tap to Begin: a one-second state is never left to a poll.
    await page.addInitScript(() => {
      type Seen = { text: string; page: string; t: number };
      const w = window as unknown as { __chimes: Seen[]; __feet: Seen[] };
      w.__chimes = [];
      w.__feet = [];
      const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
      const note = (list: Seen[], text: string) => {
        const pageNo = document.querySelector(".pl-root")?.getAttribute("data-page") ?? "";
        const last = list[list.length - 1];
        if (text && (!last || last.text !== text || last.page !== pageNo)) {
          list.push({ text, page: pageNo, t: performance.now() });
        }
      };
      const read = () => {
        note(w.__chimes, clean(document.querySelector('[data-sk="deck-row"][data-row="chime"]')?.textContent));
        note(w.__feet, clean(document.querySelector('[data-pl="turn-line"]')?.textContent));
      };
      new MutationObserver(read).observe(document, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
    });
    await begin(page, `/read?story=${COUNTDOWN_CODE}`);
    const root = page.locator(ROOT);
    await expect(root).toHaveAttribute("data-page", "1");

    // before the hold: the foot line names the page's whole hold, the ring is empty
    const foot = page.locator(FOOT);
    await expect(foot).toHaveCount(1);
    await expect(foot).toHaveText("next page in 4 s · turn cue ready", { useInnerText: true });
    expect(Number(await page.locator('[data-pl="turn-ring"]').getAttribute("data-share"))).toBe(0);

    // during the hold the ring holds the elapsed share
    await expect(row(page, "chime")).toHaveText(/^CHIME · next turn in 0:0[1-3]$/, {
      timeout: 8000,
      useInnerText: true,
    });
    const during = Number(await page.locator('[data-pl="turn-ring"]').getAttribute("data-share"));
    expect(during).toBeGreaterThan(0);
    expect(during).toBeLessThanOrEqual(1);

    // the page turns itself, and the new page starts its own hold from the top
    await expect(root).toHaveAttribute("data-page", "2", { timeout: 8000 });
    await expect(foot).toHaveText("next page in 4 s · turn cue ready", { useInnerText: true });

    type Seen = { text: string; page: string; t: number };
    const seen = await page.evaluate(() => {
      const w = window as unknown as { __chimes: Seen[]; __feet: Seen[] };
      return { chimes: w.__chimes, feet: w.__feet };
    });
    console.log("[t09a] chime row on page 1:", JSON.stringify(seen.chimes.filter((s) => s.page === "1")));
    const chimes = seen.chimes.filter((s) => s.page === "1").map((s) => s.text);
    const countdown = chimes.filter((t) => t.startsWith("CHIME · next turn in"));
    expect(chimes[0]).toBe("CHIME · after the voice");
    expect(countdown).toEqual([
      "CHIME · next turn in 0:04",
      "CHIME · next turn in 0:03",
      "CHIME · next turn in 0:02",
      "CHIME · next turn in 0:01",
    ]);
    // once a second, not faster: each step about 1 s after the last
    const steps = seen.chimes.filter((s) => s.page === "1" && s.text.startsWith("CHIME · next turn in"));
    for (let i = 1; i < steps.length; i++) {
      const gap = steps[i].t - steps[i - 1].t;
      expect(gap, `step ${i} came ${gap.toFixed(0)} ms after the last`).toBeGreaterThan(800);
      expect(gap, `step ${i} came ${gap.toFixed(0)} ms after the last`).toBeLessThan(1300);
    }
    const feet = seen.feet.filter((s) => s.page === "1").map((s) => s.text);
    expect(feet).toEqual([
      "next page in 4 s · turn cue ready",
      "next page in 3 s · turn cue ready",
      "next page in 2 s · turn cue ready",
      "next page in 1 s · turn cue ready",
    ]);
  });

  test("countdown tape · pausing stops the clock: 'CHIME · paused', the foot line back to the whole hold", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await seedReaderTapes(page, t09aRows());
    await begin(page, `/read?story=${COUNTDOWN_CODE}`);
    const chime = row(page, "chime");
    await expect(chime).toHaveText(/^CHIME · next turn in 0:0[1-4]$/, { timeout: 8000, useInnerText: true });
    await page.keyboard.press(" ");
    await expect(chime).toHaveText("CHIME · paused", { useInnerText: true });
    await expect(page.locator(FOOT)).toHaveText("next page in 4 s · turn cue ready", { useInnerText: true });
    await page.waitForTimeout(4500);
    await expect(page.locator(ROOT)).toHaveAttribute("data-page", "1");
  });

  test("no-cue tape · 'CHIME · off' and 'turn cue off'", async ({ page }) => {
    test.setTimeout(60000);
    await seedReaderTapes(page, t09aRows());
    await begin(page, `/read?story=${NO_CUE_CODE}`);
    await expect(row(page, "chime")).toHaveText("CHIME · off", { useInnerText: true });
    await expect(page.locator(FOOT)).toHaveText(/^next page in [1-3] s · turn cue off$/, { useInnerText: true });
  });

  test("manual tape · 'CHIME · when you turn the page' and no foot line", async ({ page }) => {
    test.setTimeout(60000);
    await seedReaderTapes(page, t09aRows());
    await begin(page, `/read?story=${MANUAL_CODE}`);
    await expect(row(page, "chime")).toHaveText("CHIME · when you turn the page", { useInnerText: true });
    await expect(page.locator('[data-pl="spread"]')).toHaveCount(1);
    await page.waitForTimeout(2500); // past the clip: still no foot line, still page 1
    await expect(page.locator(FOOT)).toHaveCount(0);
    await expect(page.locator(ROOT)).toHaveAttribute("data-page", "1");
  });

  test("idle · the rows fade with the chrome after 4.2 s; reels and counter stay; a pointer move brings them back", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await stubSpeech(page);
    await begin(page, "/read?demo=1");
    await expect(row(page, "voice")).toBeVisible();

    await expect(page.locator(".pl-chrome--top")).toHaveClass(/is-hidden/, { timeout: 8000 });
    // the rows fold to nothing (width and opacity) — still in the group for a screen reader
    const rows = chip(page).locator('[data-sk="deck-rows"]');
    await expect(rows).toBeHidden();
    await expect.poll(() => rows.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
    await expect(page.getByRole("group", { name: "Now playing" })).toContainText("CHIME ·");
    await expect(chip(page)).toBeVisible();
    await expect(chip(page).locator(".pl-deck-read")).toBeVisible();
    await expect(chip(page).locator(".pl-deck-read")).toHaveText("01 / 08");
    await expect(chip(page).locator('[data-sk="reel"]').first()).toBeVisible();

    await wake(page);
    await expect(page.locator(".pl-chrome--top")).not.toHaveClass(/is-hidden/);
    await expect(rows).toBeVisible();
    await expect.poll(() => rows.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    for (const name of ["voice", "melody", "chime"] as const) await expect(row(page, name)).toBeVisible();
  });

  test("a11y · the countdown is not a live region; the polite page announcement is unchanged; nothing is stored", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await seedReaderTapes(page, t09aRows());
    await page.goto(`/read?story=${COUNTDOWN_CODE}`);
    await expect(page.locator(ROOT)).toHaveAttribute("data-view", "cover", { timeout: 20000 });
    const storageBefore = await page.evaluate(() => Object.keys(window.localStorage).sort());
    await page.getByRole("button", { name: /Tap to Begin/ }).click();
    await expect(row(page, "chime")).toHaveText(/^CHIME · next turn in 0:0[1-4]$/, {
      timeout: 8000,
      useInnerText: true,
    });

    const live = await page.evaluate(() => {
      const chipEl = document.querySelector(".pl-deck")!;
      const foot = document.querySelector('[data-pl="turn-foot"]')!;
      const inLive = (el: Element) => !!el.closest("[aria-live], [role='status'], [role='timer'], [role='alert']");
      const liveInside = (el: Element) =>
        el.querySelectorAll("[aria-live], [role='status'], [role='timer'], [role='alert']").length;
      return {
        chipLive: inLive(chipEl) || liveInside(chipEl) > 0,
        footLive: inLive(foot) || liveInside(foot) > 0,
        polite: Array.from(document.querySelectorAll('[aria-live="polite"]')).map((el) => el.textContent),
      };
    });
    expect(live.chipLive).toBe(false);
    expect(live.footLive).toBe(false);
    expect(live.polite).toContain("Page 1 of 3");

    // the chip reads the manifest and the live state; it writes nothing
    const storageAfter = await page.evaluate(() => Object.keys(window.localStorage).sort());
    expect(storageAfter).toEqual(storageBefore);
  });

  test("reduced motion · the reels do not spin and the turn ring jumps without easing", async ({ page }) => {
    test.setTimeout(60000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seedReaderTapes(page, t09aRows());
    await begin(page, `/read?story=${COUNTDOWN_CODE}`);
    await expect(row(page, "chime")).toHaveText(/^CHIME · next turn in 0:0[1-4]$/, {
      timeout: 8000,
      useInnerText: true,
    });
    const motion = await page.evaluate(() => {
      const reels = Array.from(document.querySelectorAll(".pl-deck .sk-reel-svg")).map(
        (el) => getComputedStyle(el).animationName,
      );
      const arc = document.querySelector('[data-pl="turn-arc"]')!;
      const cs = getComputedStyle(arc);
      return {
        reels,
        arcAnimation: cs.animationName,
        arcTransition: cs.transitionDuration.split(",").every((d) => parseFloat(d) === 0),
        arcAnimations: arc.getAnimations().length,
      };
    });
    expect(motion.reels).toEqual(["none", "none"]);
    expect(motion.arcAnimation).toBe("none");
    expect(motion.arcTransition).toBe(true);
    expect(motion.arcAnimations).toBe(0);
  });

  test("full motion · the turn ring fills smoothly across the hold", async ({ page }) => {
    test.setTimeout(60000);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await seedReaderTapes(page, t09aRows());
    await begin(page, `/read?story=${COUNTDOWN_CODE}`);
    await expect(row(page, "chime")).toHaveText(/^CHIME · next turn in 0:0[1-4]$/, {
      timeout: 8000,
      useInnerText: true,
    });
    const arc = await page.locator('[data-pl="turn-arc"]').evaluate((el) => ({
      animation: getComputedStyle(el).animationName,
      running: el.getAnimations().length,
    }));
    expect(arc.animation).not.toBe("none");
    expect(arc.running).toBe(1);
  });
});

test.describe("T09a · the compact pill (phone)", () => {
  test("Twinkle at 390×844 · reels, '0n / 05', a hairline, the mic and 'Mia' — no rows", async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 390, height: 844 });
    const shareCode = randomBytes(16).toString("hex");
    await seedDeviceLibrary(page, "twinkle", { shareCode });
    await begin(page, `/read?story=${shareCode}`);

    const deck = chip(page);
    await expect(deck).toBeVisible();
    await expect(deck.locator('[data-sk="reel"]')).toHaveCount(2);
    await expect(deck.locator(".pl-deck-read")).toHaveText(/^0\d \/ 05$/);
    // no rows on a phone: not drawn, not announced
    for (const name of ["voice", "melody", "chime"] as const) await expect(row(page, name)).toBeHidden();
    const rowsWrap = deck.locator('[data-sk="deck-rows"]');
    expect(await rowsWrap.evaluate((el) => getComputedStyle(el).display)).toBe("none");
    const tree = await deck.ariaSnapshot();
    expect(tree).toMatch(/group "Now playing"/);
    expect(tree).not.toMatch(/VOICE|MELODY|CHIME/);

    // once the chrome idles out the pill says whose voice it is (s05)
    await expect(page.locator(".pl-chrome--top")).toHaveClass(/is-hidden/, { timeout: 10000 });
    await expect
      .poll(() => deck.locator('[data-pl="deck-voice"]').evaluate((el) => getComputedStyle(el).opacity))
      .toBe("1");
    await expect(deck.locator('[data-pl="deck-rule"]')).toBeVisible();
    await expect(deck.locator('[data-pl="deck-mic"]')).toBeVisible();
    await expect(deck.locator('[data-pl="deck-narrator"]')).toHaveText("Mia");
    await expect(deck.locator('[data-pl="deck-narrator"]')).toBeVisible();
    const box = await deck.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(44);
    for (const name of ["voice", "melody", "chime"] as const) await expect(row(page, name)).toBeHidden();
  });

  test("countdown tape at 390×844 · no foot line on a phone", async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 390, height: 844 });
    await seedReaderTapes(page, t09aRows());
    await begin(page, `/read?story=${COUNTDOWN_CODE}`);
    await page.waitForTimeout(2500);
    await expect(page.locator(FOOT)).toHaveCount(0);
  });
});
