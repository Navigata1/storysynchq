/**
 * T10 · the Reader honours each page's own crossfade and plays each page's own
 * mood (E2E, desktop + mobile projects).
 *
 * Reference: s02 figure B "PAGE 3 → 4 · THE TURN" — the melody changes under
 * the page through a crossfade wedge. The house tape's manifest asks for 2 s
 * into page 4 and 3 s into page 6; before T10 both played in 1.6 s.
 *
 * Everything is read off the live engine through the read-only
 * `window.__ssyncPlayer` hook (getters only), never through private state.
 */

import { expect, test, type Page } from "@playwright/test";
import {
  PER_PAGE_MOOD_CODE,
  PER_PAGE_MOOD_PLAN,
  QUIET_MIDDLE_CODE,
  seedReaderTapes,
  t10Rows,
} from "./fixtures/reader-tapes";

interface PlayerHook {
  musicPlaying(): boolean;
  moodName(): string | null;
  crossfadeSeconds?: () => number | null;
}
type HookWindow = Window & {
  __ssyncPlayer?: PlayerHook;
  __t10Watch?: { drops: number; samples: number; id: number };
};

/** Open a tape and pass the cover gate (the iOS unlock). */
async function begin(page: Page, url: string): Promise<void> {
  await page.goto(url);
  const root = page.locator(".pl-root");
  await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
  await page.getByRole("button", { name: /Tap to Begin/i }).click();
  await expect(root).toHaveAttribute("data-view", "page");
}

async function bedPlaying(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as HookWindow).__ssyncPlayer?.musicPlaying() === true, null, {
    timeout: 10000,
  });
}

/** `crossfadeSeconds()` off the hook; `"missing"` when the getter does not exist. */
async function crossfade(page: Page): Promise<number | null | "missing"> {
  return page.evaluate(() => {
    const hook = (window as HookWindow).__ssyncPlayer;
    if (!hook || typeof hook.crossfadeSeconds !== "function") return "missing" as const;
    return hook.crossfadeSeconds();
  });
}

async function engineMood(page: Page): Promise<string | null> {
  return page.evaluate(() => (window as HookWindow).__ssyncPlayer?.moodName() ?? null);
}

/** Turn one page with the keyboard and wait for the room to land on `to`. */
async function turn(page: Page, key: "ArrowRight" | "ArrowLeft", to: number): Promise<void> {
  await page.keyboard.press(key);
  await expect(page.locator(".pl-root")).toHaveAttribute("data-page", String(to));
}

/* ─────────────────────────────────────────────────────── the house tape */

test.describe("T10 · the house tape enters each page at its own pace", () => {
  for (const reduced of [false, true]) {
    test(`3 → 4 is 2 s, 5 → 6 is 3 s, back 6 → 5 is 1.6 s${reduced ? " (reduced motion)" : ""}`, async ({ page }) => {
      test.setTimeout(90000);
      if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
      await begin(page, "/read?demo=1");
      const root = page.locator(".pl-root");
      await expect(root).toHaveAttribute("data-mood", "Wonder");
      await bedPlaying(page);
      // Nothing has crossfaded yet: the bed started from silence.
      expect(await crossfade(page)).toBeNull();

      await turn(page, "ArrowRight", 2);
      await turn(page, "ArrowRight", 3);
      expect(await crossfade(page), "Wonder → Wonder is not a crossfade").toBeNull();

      await turn(page, "ArrowRight", 4);
      await expect(root).toHaveAttribute("data-mood", "Adventure");
      await expect.poll(() => crossfade(page)).toBe(2);
      expect(await engineMood(page)).toBe("Adventure");

      await turn(page, "ArrowRight", 5);
      await turn(page, "ArrowRight", 6);
      await expect(root).toHaveAttribute("data-mood", "Calm");
      await expect.poll(() => crossfade(page)).toBe(3);
      expect(await engineMood(page)).toBe("Calm");

      // The duration belongs to the page being ENTERED: page 5 is a plain string.
      await turn(page, "ArrowLeft", 5);
      await expect(root).toHaveAttribute("data-mood", "Adventure");
      await expect.poll(() => crossfade(page)).toBe(1.6);
      expect(await engineMood(page)).toBe("Adventure");
      await expect(root).toHaveAttribute("data-music", "on");
    });
  }
});

/* ──────────────────────────────────────────── a tape with per-page moods */

test.describe("T10 · every page plays its own mood", () => {
  test("Wonder → Hush (4 s) → Rain → Wonder, and the bed never stops", async ({ page }) => {
    test.setTimeout(90000);
    await seedReaderTapes(page, t10Rows());
    await begin(page, `/read?story=${PER_PAGE_MOOD_CODE}`);
    const root = page.locator(".pl-root");
    await expect(root).toHaveAttribute("data-mood", PER_PAGE_MOOD_PLAN.moods[0]);
    await bedPlaying(page);
    expect(await engineMood(page)).toBe(PER_PAGE_MOOD_PLAN.moods[0]);
    expect(await crossfade(page)).toBeNull();

    // Watch the engine 20 times a second across every turn.
    await page.evaluate(() => {
      const w = window as HookWindow;
      const watch = { drops: 0, samples: 0, id: 0 };
      watch.id = window.setInterval(() => {
        const hook = w.__ssyncPlayer;
        if (!hook) return;
        watch.samples++;
        if (!hook.musicPlaying()) watch.drops++;
      }, 50);
      w.__t10Watch = watch;
    });

    const seen: Array<{ dom: string | null; engine: string | null; seconds: number | null | "missing" }> = [];
    for (let i = 1; i < PER_PAGE_MOOD_PLAN.moods.length; i++) {
      await turn(page, "ArrowRight", i + 1);
      const mood = PER_PAGE_MOOD_PLAN.moods[i];
      await expect(root).toHaveAttribute("data-mood", mood);
      await expect.poll(() => engineMood(page)).toBe(mood);
      await expect.poll(() => crossfade(page)).toBe(PER_PAGE_MOOD_PLAN.crossfades[i]);
      seen.push({ dom: await root.getAttribute("data-mood"), engine: await engineMood(page), seconds: await crossfade(page) });
      await page.waitForTimeout(400);
    }

    const watch = await page.evaluate(() => {
      const w = window as HookWindow;
      window.clearInterval(w.__t10Watch!.id);
      return { drops: w.__t10Watch!.drops, samples: w.__t10Watch!.samples };
    });
    console.log("[T10] per-page moods:", JSON.stringify(seen), "watch:", JSON.stringify(watch));

    expect(seen.map((s) => s.dom)).toEqual(PER_PAGE_MOOD_PLAN.moods.slice(1));
    expect(seen.map((s) => s.engine)).toEqual(PER_PAGE_MOOD_PLAN.moods.slice(1));
    expect(seen.map((s) => s.seconds)).toEqual(PER_PAGE_MOOD_PLAN.crossfades.slice(1));
    expect(watch.samples, "the engine hook was never sampled").toBeGreaterThan(20);
    expect(watch.drops, "the bed stopped between pages instead of crossfading").toBe(0);
    await expect(root).toHaveAttribute("data-music", "on");
  });

  test("a page that names no music is silence, and Music off still stops the bed", async ({ page }) => {
    test.setTimeout(90000);
    await seedReaderTapes(page, t10Rows());
    await begin(page, `/read?story=${QUIET_MIDDLE_CODE}`);
    const root = page.locator(".pl-root");
    await expect(root).toHaveAttribute("data-mood", "Calm");
    await bedPlaying(page);

    // Page 2 names no music: the bed stops, the room says so.
    await turn(page, "ArrowRight", 2);
    await expect(root).toHaveAttribute("data-mood", "none");
    await expect(root).toHaveAttribute("data-music", "off");
    await page.waitForFunction(() => (window as HookWindow).__ssyncPlayer?.musicPlaying() === false, null, {
      timeout: 10000,
    });

    // Page 3 starts the bed again from silence (a fade-in, not a crossfade).
    await turn(page, "ArrowRight", 3);
    await expect(root).toHaveAttribute("data-mood", "Joy");
    await bedPlaying(page);
    expect(await engineMood(page)).toBe("Joy");
    expect(await crossfade(page)).toBeNull();

    // Music off is honoured.
    await page.getByRole("button", { name: /Music on/i }).click();
    await expect(root).toHaveAttribute("data-music", "off");
    await page.waitForFunction(() => (window as HookWindow).__ssyncPlayer?.musicPlaying() === false, null, {
      timeout: 10000,
    });
    // ...and back on, from the keyboard: the chip is a real button.
    await page.getByRole("button", { name: /Music off/i }).focus();
    await page.keyboard.press("Enter");
    await expect(root).toHaveAttribute("data-music", "on");
    await bedPlaying(page);
    expect(await engineMood(page)).toBe("Joy");
  });
});

/* ─────────────────────────────────────── the bed's own record of a fade */

interface BedLike {
  start(mood: string): void;
  setMood(mood: string, crossfade?: number): void;
  stop(fade?: number): void;
  dispose(): void;
  readonly lastCrossfadeSeconds?: number | null;
}
type MusicWindow = Window & {
  __ssyncMusic?: {
    MusicBed: new (ctx: BaseAudioContext, destination: AudioNode, options?: { offline?: boolean }) => BedLike;
  };
};

test("T10 · the shipped MusicBed records its last crossfade; no argument is still 1.6 s", async ({ page }) => {
  await page.goto("/read");
  await page.waitForFunction(() => Boolean((window as MusicWindow).__ssyncMusic), null, { timeout: 20000 });
  const log = await page.evaluate(() => {
    const { MusicBed } = (window as MusicWindow).__ssyncMusic!;
    const ctx = new OfflineAudioContext(1, 44100 * 2, 44100);
    const bed = new MusicBed(ctx, ctx.destination, { offline: true });
    const read = () => (bed.lastCrossfadeSeconds === undefined ? "missing" : bed.lastCrossfadeSeconds);
    const out: Array<number | null | string> = [read()];
    bed.start("Wonder");
    out.push(read()); // a start from silence is not a crossfade
    bed.setMood("Adventure");
    out.push(read()); // no argument: today's default
    bed.setMood("Calm", 3);
    out.push(read());
    bed.setMood("Calm", 7);
    out.push(read()); // same mood: no crossfade happens, the record stands
    bed.setMood("Joy", 0.01);
    out.push(read()); // the bed's own 50 ms floor
    bed.setMood("Rain", Number.NaN);
    out.push(read()); // nonsense falls back to the default
    bed.dispose();
    return out;
  });
  expect(log).toEqual([null, null, 1.6, 3, 3, 0.05, 1.6]);
});
