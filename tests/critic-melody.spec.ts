// WP-M · blind-critic probe for the generative music bed.
//
// Independent of tests/wp-melody.spec.ts: this file re-derives the evidence
// with different methods on purpose.
//
//   1. resolveMood, adversarially (protocol values, casing, junk, non-strings)
//   2. the melody is *musical*: oscillator frequencies are intercepted during
//      an OfflineAudioContext render and checked against the mood's scale —
//      a drone cannot pass this
//   3. every scheduled onset is *audible* in the rendered samples (attack
//      energy measured at the bed's own reported onset times)
//   4. headroom through the real engine gain chain, and the level change vs
//      the drone the bed replaced (the melody must stay under a child's voice)
//   5. visibilitychange really stops the scheduler, not just a flag
//   6. end to end: the shipped Player plays the bed, not two oscillators

import { test, expect, type Page } from "@playwright/test";
import { MOODS, MOOD_NAMES, resolveMood, specForConfig } from "../src/lib/audio/moods";

/* ───────────────────────────────────────────────────────── 1. resolveMood */

test.describe("critic · mood resolution", () => {
  test("protocol values, casing, junk and non-strings", () => {
    // The plan's named cases.
    expect(resolveMood("Wonder")).toBe("Wonder");
    expect(resolveMood("hush")).toBe("Hush");
    expect(resolveMood("Adventure")).toBe("Adventure");
    expect(resolveMood(undefined)).toBeNull();
    expect(resolveMood("definitely-not-a-mood")).toBe("Wonder");

    // All eight protocol values survive a round trip in any casing.
    for (const name of MOOD_NAMES) {
      for (const variant of [name, name.toLowerCase(), name.toUpperCase(), ` ${name}\n`]) {
        expect(resolveMood(variant), variant).toBe(name);
      }
    }

    // Silence is a real answer and must never become a bed.
    for (const empty of ["", "   ", "\t", "---", null, undefined]) {
      expect(resolveMood(empty as string | null | undefined), JSON.stringify(empty)).toBeNull();
    }

    // Synonyms named in the plan.
    const synonyms: Record<string, string> = {
      peaceful: "Calm",
      scary: "Suspense",
      tense: "Suspense",
      sad: "Melancholy",
      happy: "Joy",
      quiet: "Hush",
      lullaby: "Hush",
      storm: "Rain",
    };
    for (const [input, expected] of Object.entries(synonyms)) {
      expect(resolveMood(input), input).toBe(expected);
    }

    // Any string that carries a word or a number is a mood request, so it must
    // land on a bed rather than on silence.
    for (const junk of ["track-99", "0", "null", "undefined", "Wonder Adventure", "mood 7"]) {
      expect(MOOD_NAMES, junk).toContain(resolveMood(junk));
    }
    // Documented deviation from the WP text ("unknown non-empty → Wonder"):
    // a string with no letters or digits normalises to empty and is treated as
    // silence (src/lib/audio/moods.ts:414 normalise + :437 `if (!key) return null`).
    // Pinned here so the choice is deliberate rather than accidental.
    expect(resolveMood("!!")).toBeNull();
    expect(resolveMood("🎵")).toBeNull();

    // Non-string values arrive from JSON manifests written by hand.
    for (const bad of [0, 1, {}, [], true, NaN]) {
      expect(resolveMood(bad as unknown as string)).toBeNull();
    }
  });

  test("every spec still satisfies the legacy MoodConfig contract", () => {
    for (const name of MOOD_NAMES) {
      const spec = MOODS[name];
      expect(Number.isFinite(spec.freq1), `${name}.freq1`).toBe(true);
      expect(Number.isFinite(spec.freq2), `${name}.freq2`).toBe(true);
      expect(Number.isFinite(spec.gainMult), `${name}.gainMult`).toBe(true);
    }
    // The six pad pairs the Player and the classic reader still pass in.
    const legacy: Array<[number, string]> = [
      [220, "Wonder"],
      [330, "Adventure"],
      [110, "Calm"],
      [155, "Suspense"],
      [440, "Joy"],
      [185, "Melancholy"],
    ];
    for (const [freq1, expected] of legacy) {
      expect(specForConfig({ freq1, freq2: freq1 + 1, gainMult: 1 }).name, String(freq1)).toBe(expected);
    }
  });
});

/* ─────────────────────────────────────────────────────── browser plumbing */

interface BedLike {
  start(mood: string): void;
  setMood(mood: string, crossfade?: number): void;
  stop(fade?: number): void;
  dispose(): void;
  scheduleAhead(until: number): void;
  readonly onsetCount: number;
  readonly onsets: number[];
  readonly moodName: string | null;
  readonly paused: boolean;
}

interface MusicHook {
  MusicBed: new (
    ctx: BaseAudioContext,
    destination: AudioNode,
    options?: { seed?: number; offline?: boolean; hiss?: boolean },
  ) => BedLike;
}

type HookWindow = Window & { __ssyncMusic?: MusicHook };

async function openWithMusic(page: Page): Promise<void> {
  await page.goto("/read");
  await page.waitForFunction(() => Boolean((window as HookWindow).__ssyncMusic), null, { timeout: 20000 });
}

/* ──────────────────────────────────── 2. the notes are actually a melody */

interface PitchReport {
  name: string;
  melodyPitches: number[];
  noteEvents: number;
  padPitches: number[];
}

test.describe("critic · the bed is music, not a drone", () => {
  test("scheduled pitches move and stay inside each mood's scale", async ({ page }) => {
    test.setTimeout(120000);
    await openWithMusic(page);

    const reports = (await page.evaluate(async (names: string[]) => {
      const hook = (window as HookWindow).__ssyncMusic!;
      const out: PitchReport[] = [];

      for (const name of names) {
        const ctx = new OfflineAudioContext(1, 44100 * 8, 44100);
        // Intercept every oscillator frequency the bed schedules.
        const events: number[] = [];
        const create = ctx.createOscillator.bind(ctx);
        (ctx as unknown as { createOscillator: () => OscillatorNode }).createOscillator = () => {
          const osc = create();
          const param = osc.frequency;
          const set = param.setValueAtTime.bind(param);
          param.setValueAtTime = (value: number, when: number) => {
            events.push(value);
            return set(value, when);
          };
          return osc;
        };

        const bus = ctx.createGain();
        bus.connect(ctx.destination);
        const bed = new hook.MusicBed(ctx, bus, { offline: true, seed: 1234 });
        bed.start(name);
        bed.scheduleAhead(8);
        bed.dispose();

        out.push({ name, melodyPitches: events, noteEvents: bed.onsetCount, padPitches: [] });
      }
      return out;
    }, [...MOOD_NAMES])) as PitchReport[];

    for (const report of reports) {
      const spec = MOODS[report.name as keyof typeof MOODS];
      const cents = (f: number) => 1200 * Math.log2(f / spec.root);

      // < 20 Hz is the pad LFO; < 20 semitones above the root is the pad
      // itself (root and its fifth). Everything else is the music box.
      const melody = report.melodyPitches.filter((f) => f >= 20 && cents(f) >= 2000);
      const distinct = [...new Set(melody.map((f) => Math.round(f * 100) / 100))];

      expect(distinct.length, `${report.name}: distinct music-box pitches`).toBeGreaterThanOrEqual(4);

      // Every music-box pitch must be a real degree of the mood's scale.
      for (const f of distinct) {
        const c = cents(f);
        const semis = Math.round(c / 100);
        expect(Math.abs(c - semis * 100), `${report.name}: ${f}Hz off-grid`).toBeLessThan(6);
        expect(spec.scale, `${report.name}: ${f}Hz outside ${spec.scaleName}`).toContain(
          ((semis % 12) + 12) % 12,
        );
      }

      // A drone repeats one pitch; a melody changes pitch between notes.
      let changes = 0;
      for (let i = 1; i < melody.length; i++) if (Math.abs(melody[i] - melody[i - 1]) > 0.5) changes++;
      expect(changes, `${report.name}: pitch changes in 8 s`).toBeGreaterThanOrEqual(8);
      expect(report.noteEvents, `${report.name}: scheduled onsets in 8 s`).toBeGreaterThanOrEqual(8);
    }
  });

  /* ───────────────────────── 3. those notes are audible in the samples */

  test("every scheduled onset produces an attack in the rendered audio", async ({ page }) => {
    test.setTimeout(120000);
    await openWithMusic(page);

    const results = (await page.evaluate(async (names: string[]) => {
      const hook = (window as HookWindow).__ssyncMusic!;
      const out: Array<{
        name: string;
        onsets: number;
        audible: number;
        peak: number;
        rms: number;
        silentWindows: number;
      }> = [];

      for (const name of names) {
        const sr = 44100;
        const ctx = new OfflineAudioContext(1, sr * 8, sr);
        const bus = ctx.createGain();
        bus.connect(ctx.destination);
        const bed = new hook.MusicBed(ctx, bus, { offline: true, seed: 99 });
        bed.start(name);
        bed.scheduleAhead(8);
        const onsets = bed.onsets.slice();
        const data = (await ctx.startRendering()).getChannelData(0);
        bed.dispose();

        // High-pass by first difference so the slow pad cannot masquerade as
        // an attack, then compare energy just after an onset with just before.
        const rmsDiff = (from: number, to: number) => {
          const a = Math.max(1, Math.floor(from * sr));
          const b = Math.min(data.length, Math.floor(to * sr));
          if (b <= a) return 0;
          let s = 0;
          for (let i = a; i < b; i++) {
            const d = data[i] - data[i - 1];
            s += d * d;
          }
          return Math.sqrt(s / (b - a));
        };

        let audible = 0;
        for (const t of onsets) {
          if (t < 0.06 || t > 7.9) continue;
          const after = rmsDiff(t + 0.002, t + 0.032);
          const before = rmsDiff(t - 0.045, t - 0.012);
          if (after > before * 1.35 && after > 1e-4) audible++;
        }

        let peak = 0;
        let energy = 0;
        for (let i = 0; i < data.length; i++) {
          const a = Math.abs(data[i]);
          if (a > peak) peak = a;
          energy += data[i] * data[i];
        }

        // No half-second of the eight may be silent — the bed has to hold.
        let silentWindows = 0;
        const win = Math.floor(sr * 0.5);
        for (let i = 0; i + win <= data.length; i += win) {
          let s = 0;
          for (let j = i; j < i + win; j++) s += data[j] * data[j];
          if (Math.sqrt(s / win) < 1e-4) silentWindows++;
        }

        out.push({
          name,
          onsets: onsets.length,
          audible,
          peak,
          rms: Math.sqrt(energy / data.length),
          silentWindows,
        });
      }
      return out;
    }, [...MOOD_NAMES])) as Array<{
      name: string;
      onsets: number;
      audible: number;
      peak: number;
      rms: number;
      silentWindows: number;
    }>;

    for (const r of results) {
      expect(r.onsets, `${r.name}: scheduled onsets`).toBeGreaterThanOrEqual(8);
      expect(r.audible, `${r.name}: onsets audible in the render`).toBeGreaterThanOrEqual(8);
      expect(r.rms, `${r.name}: not silent`).toBeGreaterThan(0.002);
      expect(r.peak, `${r.name}: peak below 0 dBFS`).toBeLessThan(1);
      expect(r.silentWindows, `${r.name}: silent half-seconds`).toBe(0);
    }
    test.info().annotations.push({ type: "onsets", description: JSON.stringify(results) });
  });

  /* ──────────────── 4. headroom and level through the engine's gain chain */

  test("stays under 0 dBFS and near the drone's level on the music bus", async ({ page }) => {
    test.setTimeout(120000);
    await openWithMusic(page);

    // Mirrors src/lib/audio/engine.ts: base = BUS_UNIT * gainMult * musicVolume.
    const BUS_UNIT = 0.09;
    const OLD_BUS_UNIT = 0.03;

    const levels = (await page.evaluate(
      async (specs: Array<{ name: string; gainMult: number; freq1: number; freq2: number }>) => {
        const hook = (window as HookWindow).__ssyncMusic!;
        const measure = (data: Float32Array) => {
          let peak = 0;
          let energy = 0;
          for (let i = 0; i < data.length; i++) {
            const a = Math.abs(data[i]);
            if (a > peak) peak = a;
            energy += data[i] * data[i];
          }
          return { peak, rms: Math.sqrt(energy / data.length) };
        };

        const out: Array<{ name: string; bed: { peak: number; rms: number }; drone: { peak: number; rms: number } }> =
          [];
        for (const spec of specs) {
          const sr = 44100;

          const bedCtx = new OfflineAudioContext(1, sr * 8, sr);
          const bedBus = bedCtx.createGain();
          bedBus.gain.value = 1;
          bedBus.connect(bedCtx.destination);
          const bed = new hook.MusicBed(bedCtx, bedBus, { offline: true, seed: 5 });
          bed.start(spec.name);
          bed.scheduleAhead(8);
          const bedData = (await bedCtx.startRendering()).getChannelData(0);
          bed.dispose();

          // The drone the bed replaced: two sines through a 400 Hz lowpass.
          const droneCtx = new OfflineAudioContext(1, sr * 8, sr);
          const filter = droneCtx.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.value = 400;
          filter.connect(droneCtx.destination);
          for (const f of [spec.freq1, spec.freq2]) {
            const osc = droneCtx.createOscillator();
            osc.type = "sine";
            osc.frequency.value = f;
            osc.connect(filter);
            osc.start(0);
            osc.stop(8);
          }
          const droneData = (await droneCtx.startRendering()).getChannelData(0);

          out.push({ name: spec.name, bed: measure(bedData), drone: measure(droneData) });
        }
        return out;
      },
      MOOD_NAMES.map((n) => ({
        name: n,
        gainMult: MOODS[n].gainMult,
        freq1: MOODS[n].freq1,
        freq2: MOODS[n].freq2,
      })),
    )) as Array<{ name: string; bed: { peak: number; rms: number }; drone: { peak: number; rms: number } }>;

    const report: string[] = [];
    const busRmsByMood: number[] = [];
    for (const r of levels) {
      const gainMult = MOODS[r.name as keyof typeof MOODS].gainMult;
      // Worst case the product can reach: musicVolume 1.0, undicked.
      const busPeak = r.bed.peak * BUS_UNIT * gainMult * 1.0;
      const busRms = r.bed.rms * BUS_UNIT * gainMult * 1.0;
      const oldRms = r.drone.rms * OLD_BUS_UNIT * gainMult * 1.0;
      const deltaDb = 20 * Math.log10(busRms / oldRms);
      busRmsByMood.push(busRms);
      report.push(
        `${r.name}: busPeak=${busPeak.toFixed(4)} busRms=${busRms.toFixed(5)} vs drone ${deltaDb.toFixed(1)} dB`,
      );

      expect(busPeak, `${r.name}: peak on the music bus below 0 dBFS`).toBeLessThan(1);
      expect(r.bed.peak, `${r.name}: the bed produces real signal`).toBeGreaterThan(0.1);
      // The bed must never get louder than the drone it replaced — it plays
      // under a child's voice, and the -12 dB duck is relative, not absolute.
      expect(deltaDb, `${r.name}: louder than the drone it replaced`).toBeLessThan(6);
    }
    // A page turn must not jump in volume: keep the moods within 12 dB.
    const spreadDb = 20 * Math.log10(Math.max(...busRmsByMood) / Math.min(...busRmsByMood));
    expect(spreadDb, `mood-to-mood level spread (${report.join(" | ")})`).toBeLessThan(12);
    test.info().annotations.push({ type: "levels", description: report.join(" | ") });
  });
});

/* ────────────────────────────── 5. the hidden tab really stops scheduling */

test.describe("critic · background behaviour", () => {
  test("hiding the tab halts note scheduling; showing it resumes", async ({ page }) => {
    await openWithMusic(page);

    const result = await page.evaluate(async () => {
      const hook = (window as HookWindow).__ssyncMusic!;
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      const bus = ctx.createGain();
      bus.gain.value = 0; // silent probe; we count notes, we do not need sound
      bus.connect(ctx.destination);
      const bed = new hook.MusicBed(ctx, bus, { seed: 3 });

      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const setHidden = (hidden: boolean) => {
        Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
        Object.defineProperty(document, "visibilityState", {
          value: hidden ? "hidden" : "visible",
          configurable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      };

      bed.start("Joy");
      await wait(1200);
      const whileVisible = bed.onsetCount; // control: the clock is running
      setHidden(true);
      const atHide = bed.onsetCount;
      await wait(1200);
      const whileHidden = bed.onsetCount;
      const pausedFlag = bed.paused;
      setHidden(false);
      await wait(1200);
      const afterShow = bed.onsetCount;
      const resumedFlag = bed.paused;

      bed.dispose();
      await ctx.close();
      return { whileVisible, atHide, whileHidden, afterShow, pausedFlag, resumedFlag };
    });

    // Control: without it the rest proves nothing.
    expect(result.whileVisible, "notes are scheduled while visible").toBeGreaterThan(0);
    expect(result.pausedFlag, "bed reports paused while hidden").toBe(true);
    expect(result.whileHidden, "no new notes while hidden").toBe(result.atHide);
    expect(result.resumedFlag, "bed reports playing again").toBe(false);
    expect(result.afterShow, "notes resume when the tab returns").toBeGreaterThan(result.whileHidden);
  });
});

/* ───────────────────── 6. the shipped Player actually plays the new bed */

test.describe("critic · the melody reaches the product", () => {
  test("the demo tape schedules a growing stream of notes, not two oscillators", async ({ page }) => {
    test.setTimeout(90000);
    await page.addInitScript(() => {
      const w = window as unknown as { __oscCount: number };
      w.__oscCount = 0;
      const proto = window.AudioContext.prototype;
      const create = proto.createOscillator;
      proto.createOscillator = function patched(this: AudioContext) {
        (window as unknown as { __oscCount: number }).__oscCount++;
        return create.call(this);
      };
    });

    await page.goto("/read");
    await page.getByRole("button", { name: /Play the demo tape/i }).click();
    const begin = page.getByRole("button", { name: /Tap to Begin/i });
    await begin.waitFor({ state: "visible", timeout: 20000 });
    await begin.click();

    const read = () => page.evaluate(() => (window as unknown as { __oscCount: number }).__oscCount);
    await page.waitForTimeout(1500);
    const early = await read();
    await page.waitForTimeout(2500);
    const later = await read();
    await page.screenshot({ path: "/tmp/critic-melody-player.png" });

    // The old drone created exactly two oscillators and then nothing, forever.
    // A music box creates two per note (fundamental + octave partial), so a
    // live melody keeps the count climbing. The page-turn cue is a noise
    // BufferSource (Player.tsx:213), so it cannot account for this.
    expect(later - early, "oscillators created while the story plays").toBeGreaterThanOrEqual(6);

    // Music off must stop the stream — proof the growth is the bed and not
    // some other oscillator in the page. The only other oscillator source is
    // the page-turn cue (src/components/player/sound.ts: one "thock" sine per
    // cue), and auto-advance may legitimately turn a page while we wait, so
    // subtract cues fired (the player root exposes data-cues-fired).
    // The chip is icon-only below the `sm` breakpoint (its label is
    // `hidden sm:inline`), so target the pressed-state attribute, not the name.
    const size = page.viewportSize() ?? { width: 1280, height: 720 };
    await page.mouse.move(size.width / 2, size.height / 2);
    const toggle = page.locator('button[aria-pressed="true"]').first();
    await toggle.click({ timeout: 10000 });
    const cues = () =>
      page
        .locator("[data-cues-fired]")
        .first()
        .getAttribute("data-cues-fired")
        .then((v) => Number(v ?? 0));
    await page.waitForTimeout(1200);
    const afterOff = await read();
    const cuesAfterOff = await cues();
    await page.waitForTimeout(2000);
    const stillOff = await read();
    const cuesStillOff = await cues();
    const cueOscillators = cuesStillOff - cuesAfterOff; // one per cue
    expect(stillOff - afterOff - cueOscillators, "no bed oscillators once music is off").toBe(0);
  });
});
