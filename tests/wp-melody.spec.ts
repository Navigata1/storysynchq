// WP-M · The Melody — proof for docs/10x-plan.md §3 WP-M.
//
// (a) node side: the mood vocabulary and resolveMood()
// (b) browser side: the SHIPPED MusicBed (reached through the dev hook that
//     src/lib/audio/music.ts installs on window) rendered through an
//     OfflineAudioContext — 8 s of every mood must be audible music, not a
//     drone and not silence: ≥ 8 scheduled note onsets, ≥ 8 onsets detectable
//     in the rendered samples, and peak < 1.0 (0 dBFS).

import { test, expect } from "@playwright/test";
import {
  MOODS,
  MOOD_NAMES,
  expectedOnsets,
  isMoodName,
  resolveMood,
  specForConfig,
  type MoodName,
} from "../src/lib/audio/moods";

/* ───────────────────────────────────────────────── (a) node-side: moods */

test.describe("WP-M (a) mood vocabulary", () => {
  test("the protocol vocabulary is exactly the eight canonical moods", () => {
    expect([...MOOD_NAMES]).toEqual([
      "Wonder",
      "Adventure",
      "Calm",
      "Joy",
      "Hush",
      "Rain",
      "Suspense",
      "Melancholy",
    ]);
    expect(Object.keys(MOODS).sort()).toEqual([...MOOD_NAMES].sort());
  });

  test("every canonical name resolves to itself, whatever the casing", () => {
    for (const name of MOOD_NAMES) {
      expect(resolveMood(name)).toBe(name);
      expect(resolveMood(name.toLowerCase())).toBe(name);
      expect(resolveMood(name.toUpperCase())).toBe(name);
      expect(resolveMood(`  ${name}  `)).toBe(name);
    }
  });

  test("every Studio mood (page.music as written today) resolves", () => {
    // The eight names src/components/studio writes into page.music.
    const studioValues = ["Wonder", "Adventure", "Calm", "Joy", "Hush", "Rain", "Suspense", "Melancholy"];
    for (const value of studioValues) expect(isMoodName(resolveMood(value))).toBe(true);
  });

  test("legacy and synonym vocabulary maps onto a bed", () => {
    const cases: Record<string, MoodName> = {
      // required by the plan
      peaceful: "Calm",
      scary: "Suspense",
      tense: "Suspense",
      sad: "Melancholy",
      happy: "Joy",
      quiet: "Hush",
      lullaby: "Hush",
      storm: "Rain",
      hush: "Hush",
      // the classic reader's old table
      magic: "Wonder",
      dreamy: "Wonder",
      courage: "Adventure",
      brave: "Adventure",
      mysterious: "Suspense",
      cheerful: "Joy",
      wistful: "Melancholy",
      bedtime: "Calm",
    };
    for (const [input, expected] of Object.entries(cases)) {
      expect(resolveMood(input), `resolveMood(${JSON.stringify(input)})`).toBe(expected);
    }
  });

  test("a phrase containing a known word still finds its bed", () => {
    expect(resolveMood("a bit scary")).toBe("Suspense");
    expect(resolveMood("soft lullaby music")).toBe("Hush");
    expect(resolveMood("mood: adventure")).toBe("Adventure");
  });

  test("no music means silence, not a default bed", () => {
    expect(resolveMood(undefined)).toBeNull();
    expect(resolveMood(null)).toBeNull();
    expect(resolveMood("")).toBeNull();
    expect(resolveMood("   ")).toBeNull();
    expect(resolveMood("!!")).toBeNull();
  });

  test("an unknown non-empty mood falls back to Wonder", () => {
    expect(resolveMood("bananas")).toBe("Wonder");
    expect(resolveMood("track-17")).toBe("Wonder");
    expect(resolveMood("xyzzy")).toBe("Wonder");
  });

  test("legacy MoodConfig objects still resolve to a bed and keep their level", () => {
    // The pad pairs shipped in the classic reader / Player / Studio tables.
    expect(specForConfig({ freq1: 220, freq2: 220.5, gainMult: 1.0 }).name).toBe("Wonder");
    expect(specForConfig({ freq1: 330, freq2: 331, gainMult: 1.7 }).name).toBe("Adventure");
    expect(specForConfig({ freq1: 110, freq2: 110.3, gainMult: 0.5 }).name).toBe("Calm");
    expect(specForConfig({ freq1: 440, freq2: 441, gainMult: 1.3 }).name).toBe("Joy");
    expect(specForConfig({ freq1: 155, freq2: 156, gainMult: 1.0 }).name).toBe("Suspense");
    expect(specForConfig({ freq1: 185, freq2: 185.5, gainMult: 0.8 }).name).toBe("Melancholy");
    // An explicit name always wins over the frequency guess.
    expect(specForConfig({ freq1: 155, freq2: 156, gainMult: 1, name: "Hush" }).name).toBe("Hush");
    // A caller's own level multiplier survives the mapping.
    expect(specForConfig({ freq1: 220, freq2: 220.5, gainMult: 0.25 }).gainMult).toBe(0.25);
  });

  test("every mood is a real melody: a scale, a tempo, and ≥ 8 notes in 8 s", () => {
    for (const name of MOOD_NAMES) {
      const spec = MOODS[name];
      expect(spec.scale.length, `${name} scale`).toBeGreaterThanOrEqual(4);
      expect(spec.scale[0]).toBe(0);
      expect(spec.tempo).toBeGreaterThan(40);
      expect(spec.tempo).toBeLessThan(140);
      expect(spec.arp.pattern.some((v) => v > 0), `${name} has notes`).toBe(true);
      expect(expectedOnsets(spec, 8), `${name} onsets in 8s`).toBeGreaterThanOrEqual(8);
      // Quiet: a single note and the whole pad both stay well under unity.
      expect(spec.arp.gain).toBeLessThan(0.25);
      expect(spec.pad.gain).toBeLessThan(0.15);
      // Loopable: the pattern is a whole 4/4 bar of eighth notes.
      expect(spec.arp.pattern.length).toBe(8);
      // Legacy engine fields kept for MoodConfig consumers.
      expect(typeof spec.freq1).toBe("number");
      expect(typeof spec.freq2).toBe("number");
      expect(typeof spec.gainMult).toBe("number");
    }
  });
});

/* ─────────────────────────────────── (b) browser: render every mood */

interface BedLike {
  start(mood: string): void;
  setMood(mood: string, crossfadeSeconds?: number): void;
  stop(fade?: number): void;
  dispose(): void;
  scheduleAhead(until: number): void;
  readonly onsetCount: number;
  readonly moodName: string | null;
  readonly paused: boolean;
}

interface MusicHook {
  MusicBed: new (
    ctx: BaseAudioContext,
    destination: AudioNode,
    options?: { seed?: number; offline?: boolean; hiss?: boolean },
  ) => BedLike;
  MOODS: Record<string, { name: string }>;
}

type HookWindow = Window & { __ssyncMusic?: MusicHook };

interface Rendered {
  name: string;
  peak: number;
  rms: number;
  scheduledOnsets: number;
  bufferOnsets: number;
  checksum: number;
  moodName: string | null;
}

/** Loads a route that has the audio engine in its bundle and waits for the hook. */
async function openWithMusic(page: import("@playwright/test").Page): Promise<void> {
  for (const route of ["/read", "/studio"]) {
    await page.goto(route);
    try {
      await page.waitForFunction(() => Boolean((window as HookWindow).__ssyncMusic), null, {
        timeout: 15000,
      });
      return;
    } catch {
      /* try the next route */
    }
  }
  throw new Error("window.__ssyncMusic (the shipped MusicBed) was not reachable on /read or /studio");
}

test.describe("WP-M (b) the bed renders as music", () => {
  test("8 s of every mood: audible, ≥ 8 note onsets, peak < 0 dBFS", async ({ page }) => {
    test.setTimeout(120000);
    await openWithMusic(page);

    const results = (await page.evaluate(async (moodNames: string[]) => {
      const hook = (window as HookWindow).__ssyncMusic;
      if (!hook) throw new Error("music hook missing");

      const analyse = (data: Float32Array, sampleRate: number) => {
        let peak = 0;
        let energy = 0;
        let checksum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = data[i];
          const a = Math.abs(v);
          if (a > peak) peak = a;
          energy += v * v;
          checksum = (checksum + Math.round(v * 1e6)) | 0;
        }
        // Onsets from the samples themselves. The signal is differenced first
        // (a +6 dB/oct high-pass) so the low, slow pad stops masking the music
        // box; then a 5 ms RMS envelope, and every sharp rise is a note.
        const win = Math.floor(sampleRate * 0.005);
        const env: number[] = [];
        for (let i = 1; i + win <= data.length; i += win) {
          let s = 0;
          for (let j = i; j < i + win; j++) {
            const d = data[j] - data[j - 1];
            s += d * d;
          }
          env.push(Math.sqrt(s / win));
        }
        let bufferOnsets = 0;
        let last = -99;
        for (let i = 1; i < env.length; i++) {
          // 30 ms refractory: notes are never closer than 250 ms.
          if (env[i] > env[i - 1] * 1.5 + 0.0005 && i - last >= 6) {
            bufferOnsets++;
            last = i;
          }
        }
        return { peak, rms: Math.sqrt(energy / data.length), bufferOnsets, checksum };
      };

      const out: Rendered[] = [];
      for (const name of moodNames) {
        const sampleRate = 44100;
        const seconds = 8;
        const ctx = new OfflineAudioContext(1, sampleRate * seconds, sampleRate);
        const bus = ctx.createGain();
        bus.gain.value = 1; // no attenuation: the bed's own output is measured
        bus.connect(ctx.destination);

        const bed = new hook.MusicBed(ctx, bus, { offline: true, seed: 20260905 });
        bed.start(name);
        bed.scheduleAhead(seconds);
        const scheduledOnsets = bed.onsetCount;
        const moodName = bed.moodName;
        const buffer = await ctx.startRendering();
        const stats = analyse(buffer.getChannelData(0), sampleRate);
        bed.dispose();

        out.push({ name, scheduledOnsets, moodName, ...stats });
      }
      return out;
    }, [...MOOD_NAMES])) as Rendered[];

    expect(results.length).toBe(MOOD_NAMES.length);
    for (const r of results) {
      expect(r.moodName, `${r.name} plays its own mood`).toBe(r.name);
      // Not silence.
      expect(r.rms, `${r.name} rms`).toBeGreaterThan(0.002);
      expect(r.peak, `${r.name} peak`).toBeGreaterThan(0.02);
      // Under 0 dBFS — the bed never clips the music bus.
      expect(r.peak, `${r.name} peak < 1`).toBeLessThan(1);
      // A melody, not a drone.
      expect(r.scheduledOnsets, `${r.name} scheduled onsets`).toBeGreaterThanOrEqual(8);
      expect(r.bufferOnsets, `${r.name} onsets heard in the render`).toBeGreaterThanOrEqual(8);
    }
    test.info().annotations.push({ type: "render", description: JSON.stringify(results) });
  });

  test("the seed is deterministic and the seedless bed still differs by mood", async ({ page }) => {
    await openWithMusic(page);

    const { sameSeed, otherSeed, otherMood } = await page.evaluate(async () => {
      const hook = (window as HookWindow).__ssyncMusic;
      if (!hook) throw new Error("music hook missing");

      const render = async (mood: string, seed: number) => {
        const sampleRate = 22050;
        const ctx = new OfflineAudioContext(1, sampleRate * 6, sampleRate);
        const bus = ctx.createGain();
        bus.connect(ctx.destination);
        const bed = new hook.MusicBed(ctx, bus, { offline: true, seed });
        bed.start(mood);
        bed.scheduleAhead(6);
        const data = (await ctx.startRendering()).getChannelData(0);
        bed.dispose();
        return data;
      };

      /** Biggest sample-for-sample difference between two renders. */
      const maxDiff = (a: Float32Array, b: Float32Array) => {
        let max = 0;
        for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]));
        return max;
      };

      const a = await render("Wonder", 42);
      const b = await render("Wonder", 42);
      const c = await render("Wonder", 43);
      const d = await render("Rain", 42);
      return { sameSeed: maxDiff(a, b), otherSeed: maxDiff(a, c), otherMood: maxDiff(a, d) };
    });

    // Same seed, same notes: renders differ only by float32 rounding in the
    // browser's mixer (measured ≈ 2e-7), never by a note.
    expect(sameSeed, "same seed renders the same melody").toBeLessThan(1e-4);
    expect(otherSeed, "a different seed renders a different melody").toBeGreaterThan(0.02);
    expect(otherMood, "a different mood renders a different bed").toBeGreaterThan(0.02);
  });

  test("moods crossfade without silence or clipping", async ({ page }) => {
    await openWithMusic(page);

    const result = await page.evaluate(async () => {
      const hook = (window as HookWindow).__ssyncMusic;
      if (!hook) throw new Error("music hook missing");
      const sampleRate = 44100;
      const ctx = new OfflineAudioContext(1, sampleRate * 8, sampleRate);
      const bus = ctx.createGain();
      bus.connect(ctx.destination);
      const bed = new hook.MusicBed(ctx, bus, { offline: true, seed: 7 });
      bed.start("Wonder");
      bed.scheduleAhead(4);
      bed.setMood("Rain", 1.2);
      const switched = bed.moodName;
      bed.scheduleAhead(8);
      const onsets = bed.onsetCount;
      const data = (await ctx.startRendering()).getChannelData(0);
      bed.dispose();

      const half = Math.floor(data.length / 2);
      const rms = (from: number, to: number) => {
        let s = 0;
        for (let i = from; i < to; i++) s += data[i] * data[i];
        return Math.sqrt(s / (to - from));
      };
      let peak = 0;
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
      return { switched, onsets, first: rms(0, half), second: rms(half, data.length), peak };
    });

    expect(result.switched).toBe("Rain");
    expect(result.first, "first mood audible").toBeGreaterThan(0.002);
    expect(result.second, "second mood audible after the crossfade").toBeGreaterThan(0.002);
    expect(result.peak, "crossfade never clips").toBeLessThan(1);
    expect(result.onsets).toBeGreaterThanOrEqual(8);
  });

  test("the bed pauses when the tab is hidden and resumes when it returns", async ({ page }) => {
    await openWithMusic(page);

    const result = await page.evaluate(async () => {
      const hook = (window as HookWindow).__ssyncMusic;
      if (!hook) throw new Error("music hook missing");
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      const bus = ctx.createGain();
      bus.connect(ctx.destination);
      const bed = new hook.MusicBed(ctx, bus);
      bed.start("Calm");
      const playing = bed.paused === false;

      const setHidden = (hidden: boolean) => {
        Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
        Object.defineProperty(document, "visibilityState", {
          value: hidden ? "hidden" : "visible",
          configurable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      };

      setHidden(true);
      const pausedWhenHidden = bed.paused;
      setHidden(false);
      const resumedWhenVisible = bed.paused === false;
      bed.dispose();
      await ctx.close();
      return { playing, pausedWhenHidden, resumedWhenVisible };
    });

    expect(result.playing).toBe(true);
    expect(result.pausedWhenHidden, "hidden tab pauses the scheduler").toBe(true);
    expect(result.resumedWhenVisible, "visible tab resumes it").toBe(true);
  });
});
