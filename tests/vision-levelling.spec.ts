// T17 · "Evening out each voice": loudness levelling before AAC.
//
// Reference: s05's step list carries "Evening out each voice · planned" under a
// violet "Next" (brief screens[4]); s09's Inspector carries a clean-up switch at
// the end of Mix (brief screens[8]). HANDOFF §9: "loudness levelling (gain to a
// target RMS + gentle limiting) before AAC; a step in the publish list; toggle
// in Inspector". Built, the step is real and first, and the switch is on.
//
//   1. node  · the pure module: target, clamp, silence, the limiter, identity
//   2. node  · levelWav on the quietest Twinkle clip: header kept, −20 ± 1, idempotent
//   3. e2e   · Twinkle published: "Evening out each voice · 5/5" first and done;
//              five clips within −20 ± 1 dBFS, spread ≤ 2 dB, peaks ≤ −1 dBFS,
//              durations and the 16 kHz rate kept; the publishing dialog
//              lists the step first while it counts
//   4. e2e   · levelled once: a re-publish writes the same five clips; a new
//              take levels only its page; a tape published with levelling
//              off is levelled when it is published with it on
//   5. e2e   · off: the Inspector switch (Tab, Space, reduced motion) survives
//              a reload; the step reads "off"; the clips are the draft's
//   6. e2e   · skipped: a take that cannot be levelled (an AAC take with no AAC
//              encoder, a WAV that will not decode) is published as recorded
//   7. node  · /classic still calls normalizeNarration(blob, rec.mimeType)
//
// The family content is illustrative and lives in tests/fixtures only.

import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";
import {
  LEVEL_CEILING_DBFS,
  LEVEL_KNEE_DBFS,
  LEVEL_MAX_GAIN_DB,
  LEVEL_MIN_GAIN_DB,
  LEVEL_TARGET_DBFS,
  activeRmsDb,
  applyGainAndLimit,
  dbToGain,
  levelGainDb,
  levelPcm,
  levelWav,
} from "../src/lib/audio/level";
import { normalizeNarration } from "../src/lib/audio/transcode";
import { validateManifest, type SsyncManifest } from "../src/lib/storysync/manifest";
import { LIBRARY_KEY, restoreDraft, seedStudioDraft, studioDraftState } from "./fixtures/helpers";
import { stubMicrophone } from "./fixtures/mic";
import { FIXTURE_PATHS, REPO_ROOT, TWINKLE } from "./fixtures/tapes";

/* ------------------------------------------------------------ reference copy */

const STEP = "Evening out each voice";
const READY = "Your tape is ready";
const NOTE = "Brings every recording to the same loudness before it becomes AAC. Nothing leaves this device to do it.";

const TABLET = { width: 1180, height: 820 };
/** 6:09:58 pm on Oct 19: the grown-up says yes 7:48 after the Studio opened. */
const MOMENT = new Date("2026-10-19T18:09:58");
const CEILING = 10 ** (LEVEL_CEILING_DBFS / 20);

const SEL = {
  card: '[data-studio="publish-card"]',
  steps: '[data-studio="publish-steps"]',
  overlay: '[data-studio="publish-overlay"]',
} as const;

/* ---------------------------------------------------------- signal makers */

function sine(seconds: number, rate: number, hz: number, rmsDb: number): Float32Array {
  const amp = Math.SQRT2 * 10 ** (rmsDb / 20);
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / rate);
  return out;
}

function square(seconds: number, rate: number, hz: number, amp: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * rate));
  const period = rate / hz;
  for (let i = 0; i < out.length; i++) out[i] = i % period < period / 2 ? amp : -amp;
  return out;
}

function peakOf(pcm: Float32Array): number {
  let peak = 0;
  for (const x of pcm) peak = Math.max(peak, Math.abs(x));
  return peak;
}

/* ------------------------------------------------- an independent WAV reader */

interface Wav {
  format: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataBytes: number;
  pcm: Float32Array;
}

/** Walks the RIFF chunks itself, so the test never measures with the code under test's parser. */
function readWav(bytes: Uint8Array): Wav {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
  expect(buf.toString("ascii", 8, 12)).toBe("WAVE");
  let off = 12;
  let fmt: Omit<Wav, "pcm" | "dataBytes"> | null = null;
  let data: { start: number; length: number } | null = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const len = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      fmt = {
        format: buf.readUInt16LE(off + 8),
        channels: buf.readUInt16LE(off + 10),
        sampleRate: buf.readUInt32LE(off + 12),
        bitsPerSample: buf.readUInt16LE(off + 22),
      };
    } else if (id === "data") {
      data = { start: off + 8, length: Math.min(len, buf.length - off - 8) };
    }
    off += 8 + len + (len & 1);
  }
  expect(fmt, "a fmt chunk").not.toBeNull();
  expect(data, "a data chunk").not.toBeNull();
  const n = Math.floor(data!.length / 2);
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) pcm[i] = buf.readInt16LE(data!.start + i * 2) / 32768;
  return { ...fmt!, dataBytes: data!.length, pcm };
}

/** Whole-clip RMS in dBFS: every sample, no windows, no gate. */
function wholeRmsDb(pcm: Float32Array): number {
  let sum = 0;
  for (const x of pcm) sum += x * x;
  return 10 * Math.log10(sum / pcm.length);
}

function dataUrlBytes(url: string | undefined): Uint8Array {
  expect(url, "a data URL").toMatch(/^data:[^,]*;base64,/);
  return new Uint8Array(Buffer.from(url!.slice(url!.indexOf(",") + 1), "base64"));
}

const db = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : String(x));

/* ---------------------------------------------------------------- helpers */

interface LibraryRow {
  shareCode?: string;
  ssyncData: SsyncManifest;
}

async function readLibrary(page: Page): Promise<LibraryRow[]> {
  return page.evaluate((key) => {
    try {
      return JSON.parse(window.localStorage.getItem(key) || "[]") as LibraryRow[];
    } catch {
      return [] as LibraryRow[];
    }
  }, LIBRARY_KEY);
}

async function openTwinkle(page: Page): Promise<void> {
  await page.clock.setFixedTime(MOMENT);
  await seedStudioDraft(page, "twinkle");
  await page.goto("/studio");
  await restoreDraft(page);
}

/** Finish → pass the gate as Mom, with consent → the ready card. */
async function finish(page: Page): Promise<void> {
  await passGate(page);
  await expect(page.getByRole("heading", { name: READY })).toBeVisible({ timeout: 60000 });
}

/** Finish → pass the gate as Mom, with consent; the publish starts. */
async function passGate(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Finish my story" }).click();
  const dialog = page.getByRole("dialog", { name: "A grown-up moment" });
  await expect(dialog).toBeVisible({ timeout: 15000 });
  const question = page.locator('label[for="studio-gate-answer"]');
  await expect(question).toContainText(/\d+\s*×\s*\d+/);
  const [, a, b] = (await question.innerText()).match(/(\d+)\s*×\s*(\d+)/)!;
  await page.locator("#studio-gate-answer").fill(String(Number(a) * Number(b)));
  await page.locator("#studio-gate-author").fill(TWINKLE.byline);
  await page.locator("#studio-gate-consent").check();
  await page.getByRole("button", { name: "Continue" }).click();
}

/** The ready card's steps, as read: "label · detail". */
async function stepTexts(page: Page): Promise<string[]> {
  const items = page.locator(SEL.card).locator(SEL.steps).locator("li");
  return (await items.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
}

/** Let the print-in, the rise and the fade finish before a screenshot. */
async function settle(page: Page): Promise<void> {
  await page.locator(SEL.overlay).evaluate(
    (el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined))),
    undefined,
    { timeout: 10000 },
  );
}

/** One take on the page in view, from the Transport's REC (the stubbed mic gives a 4-byte `audio/mp4`). */
async function recordTake(page: Page): Promise<void> {
  await page.locator('[data-sk="transport"][data-kind="rec"]').click();
  await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);
  await page.getByRole("button", { name: /^Stop —/ }).click();
  await expect(page.locator(".studio[data-recording='true']")).toHaveCount(0, { timeout: 10000 });
  await expect(page.getByText(/Voice recorded on page 1/)).toHaveCount(1);
}

async function closeInspector(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Close inspector" }).click();
  await expect(page.locator("#insp-autopause")).toHaveCount(0);
}

async function openAdvanced(page: Page): Promise<void> {
  const mode = page.locator('[data-sk="mode"] [role="switch"]');
  await mode.click();
  await expect(mode).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#insp-autopause")).toBeVisible();
}

/** The draft's own clips (the bytes the seed wrote), page order. */
function seededClips(): string[] {
  return studioDraftState("twinkle").manifest.pages.map((p) => p.text?.audioUrl ?? "");
}

/* ======================================================================== */

test.describe("T17 · the levelling module (node)", () => {
  const RATE = 16000;

  test("1a · a −30 dBFS RMS sine comes up 10 dB to −20", () => {
    const pcm = sine(1, RATE, 220, -30);
    expect(activeRmsDb(pcm, RATE)).toBeCloseTo(-30, 1);
    const out = levelPcm(pcm, RATE);
    expect(out.outcome).toBe("applied");
    expect(Math.abs(out.gainDb - 10)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(activeRmsDb(out.pcm, RATE) - LEVEL_TARGET_DBFS)).toBeLessThanOrEqual(0.2);
    expect(out.pcm.length).toBe(pcm.length);
  });

  test("1b · the gain is clamped to the module's range", () => {
    expect(LEVEL_TARGET_DBFS).toBe(-20);
    expect(LEVEL_MIN_GAIN_DB).toBe(-12);
    // −60 dBFS RMS wants +40 dB: the clamp holds it at the maximum boost.
    expect(levelGainDb(-60)).toBe(LEVEL_MAX_GAIN_DB);
    expect(levelGainDb(0)).toBe(LEVEL_MIN_GAIN_DB);
    expect(levelGainDb(-26)).toBeCloseTo(6, 6);
    // Inside ±0.5 dB the voice is already at the target: no gain at all.
    expect(levelGainDb(-20.4)).toBe(0);
    expect(levelGainDb(-19.6)).toBe(0);
    expect(levelGainDb(-Infinity)).toBe(0);

    // A signal under the activity gate (−50 dBFS) is silence to the meter,
    // so a steady −60 dBFS hum is left alone rather than boosted.
    const hum = sine(1, RATE, 220, -60);
    expect(activeRmsDb(hum, RATE)).toBe(-Infinity);
    expect(levelPcm(hum, RATE).outcome).toBe("unchanged");

    // A quiet voice past the boost range comes up by exactly the maximum.
    const quiet = sine(1, RATE, 220, -40);
    const out = levelPcm(quiet, RATE);
    expect(out.outcome).toBe("applied");
    expect(out.gainDb).toBe(LEVEL_MAX_GAIN_DB);
    expect(activeRmsDb(out.pcm, RATE)).toBeCloseTo(-40 + LEVEL_MAX_GAIN_DB, 1);
  });

  test("1c · an all-zero buffer is unchanged, sample for sample", () => {
    const zeros = new Float32Array(RATE);
    expect(activeRmsDb(zeros, RATE)).toBe(-Infinity);
    expect(activeRmsDb(new Float32Array(0), RATE)).toBe(-Infinity);
    const out = levelPcm(zeros, RATE);
    expect(out.outcome).toBe("unchanged");
    expect(out.gainDb).toBe(0);
    expect(Array.from(out.pcm)).toEqual(Array.from(zeros));
  });

  test("1d · a 0 dBFS square never passes the −1 dBFS ceiling, whatever the gain", () => {
    const loud = square(1, RATE, 200, 1);
    const out = levelPcm(loud, RATE);
    expect(peakOf(out.pcm)).toBeLessThanOrEqual(CEILING);
    expect(out.pcm.every((x) => Math.abs(x) <= 1)).toBe(true);

    // Driven straight into the limiter with the most boost there is.
    const driven = applyGainAndLimit(loud, LEVEL_MAX_GAIN_DB);
    expect(peakOf(driven)).toBeLessThanOrEqual(CEILING);
    expect(peakOf(driven)).toBeGreaterThan(10 ** (LEVEL_KNEE_DBFS / 20));
  });

  test("1e · below the −6 dBFS knee the gain is exactly linear; above it, soft and under the ceiling", () => {
    const ramp = new Float32Array(2001);
    for (let i = 0; i < ramp.length; i++) ramp[i] = -1 + i / 1000;
    const gainDb = 6;
    const g = dbToGain(gainDb);
    const out = applyGainAndLimit(ramp, gainDb);
    const knee = 10 ** (LEVEL_KNEE_DBFS / 20);
    let linear = 0;
    for (let i = 0; i < ramp.length; i++) {
      const y = ramp[i] * g;
      if (Math.abs(y) <= knee) {
        expect(out[i], `sample ${i} below the knee`).toBe(Math.fround(y));
        linear += 1;
      } else {
        expect(Math.abs(out[i])).toBeLessThanOrEqual(CEILING);
        expect(Math.abs(out[i])).toBeGreaterThan(knee);
        expect(Math.sign(out[i])).toBe(Math.sign(y));
      }
    }
    expect(linear, "the ramp crosses the knee").toBeGreaterThan(0);
    expect(linear).toBeLessThan(ramp.length);
    // Monotonic: louder in, never quieter out.
    for (let i = 1001; i < ramp.length; i++) expect(out[i]).toBeGreaterThanOrEqual(out[i - 1]);
  });

  test("1f · a voice already at −20 dBFS is unchanged, sample for sample", () => {
    const pcm = sine(1, RATE, 220, -20);
    const out = levelPcm(pcm, RATE);
    expect(out.outcome).toBe("unchanged");
    expect(out.gainDb).toBe(0);
    expect(out.pcm).toBe(pcm);
  });

  test("1g · the module is pure: no DOM, no Web Audio, no imports", () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, "src/lib/audio/level.ts"), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\b(window|document|navigator|globalThis)\s*\.|\b(Offline)?AudioContext\b/);
  });
});

test.describe("T17 · levelWav on the quietest Twinkle clip (node)", () => {
  test("2 · header and length kept, −20 ± 1 dBFS, and a second pass is the identity", () => {
    const clip = new Uint8Array(fs.readFileSync(FIXTURE_PATHS.twinkle.clips[3]));
    const before = readWav(clip);
    expect(before.sampleRate).toBe(16000);
    expect(activeRmsDb(before.pcm, 16000)).toBeLessThan(-30);

    const once = levelWav(clip);
    expect(once, "16-bit PCM mono is levelled in place").not.toBeNull();
    expect(once!.outcome).toBe("applied");
    expect(once!.bytes.length).toBe(clip.length);
    // The 44-byte header is byte-for-byte the original's.
    expect(Array.from(once!.bytes.subarray(0, 44))).toEqual(Array.from(clip.subarray(0, 44)));
    const after = readWav(once!.bytes);
    expect(after.format).toBe(1);
    expect(after.channels).toBe(1);
    expect(after.sampleRate).toBe(16000);
    expect(after.bitsPerSample).toBe(16);
    expect(after.dataBytes).toBe(before.dataBytes);
    expect(Math.abs(activeRmsDb(after.pcm, 16000) - LEVEL_TARGET_DBFS)).toBeLessThanOrEqual(1);
    expect(peakOf(after.pcm)).toBeLessThanOrEqual(CEILING);

    const twice = levelWav(once!.bytes);
    expect(twice!.outcome).toBe("unchanged");
    expect(twice!.gainDb).toBe(0);
    expect(twice!.bytes).toBe(once!.bytes);
    expect(Buffer.compare(Buffer.from(twice!.bytes), Buffer.from(once!.bytes))).toBe(0);
  });

  test("2b · other WAV layouts are left to the decode path", () => {
    const clip = new Uint8Array(fs.readFileSync(FIXTURE_PATHS.twinkle.clips[0]));
    const stereo = clip.slice();
    new DataView(stereo.buffer).setUint16(22, 2, true);
    expect(levelWav(stereo)).toBeNull();
    const float = clip.slice();
    new DataView(float.buffer).setUint16(20, 3, true);
    expect(levelWav(float)).toBeNull();
    const deep = clip.slice();
    new DataView(deep.buffer).setUint16(34, 24, true);
    expect(levelWav(deep)).toBeNull();
    expect(levelWav(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBeNull();
  });
});

test.describe("T17 · /classic is not levelled (node)", () => {
  test("7 · the classic shell calls normalizeNarration with two arguments; the option is optional", () => {
    const classic = fs.readFileSync(path.join(REPO_ROOT, "src/app/classic/page.tsx"), "utf8");
    const calls = classic.match(/normalizeNarration\(([^)]*)\)/g) ?? [];
    expect(calls).toEqual(["normalizeNarration(blob, rec.mimeType)"]);
    // (blob, mimeType?, options?) — the third parameter exists and nobody here passes it.
    expect(normalizeNarration.length).toBe(3);
  });
});

/* ======================================================================== */

test.describe("T17 · evening out each voice (studio)", () => {
  test.setTimeout(180000);

  test("3 · Twinkle published: the step is first and done, and the five voices are even", async ({ page }) => {
    await page.setViewportSize(TABLET);
    await openTwinkle(page);
    await finish(page);

    const texts = await stepTexts(page);
    expect(texts[0]).toBe(`${STEP} · 5/5`);
    expect(texts.slice(1)).toEqual([
      "Converting voices to AAC · 5/5",
      "Assembling the SSYNC manifest · 5 pages",
      "Saving your tape · this device",
    ]);
    const steps = page.locator(SEL.card).locator(SEL.steps).locator("li");
    await expect(steps.first()).toHaveAttribute("data-state", "done");
    await expect(steps.first().locator("svg.lucide-check")).toHaveCount(1);

    await settle(page);
    await page.screenshot({ path: "docs/vision/evidence/T17-steps.png", animations: "disabled" });

    const rows = await readLibrary(page);
    expect(rows).toHaveLength(1);
    const manifest = rows[0].ssyncData;
    expect(validateManifest(manifest).ok).toBe(true);
    expect(manifest.pages).toHaveLength(5);

    const seeded = seededClips();
    const lines: string[] = [
      "T17 · Twinkle's five clips before and after \"Evening out each voice\"",
      `Target ${LEVEL_TARGET_DBFS} dBFS active RMS (50 ms windows, gate −50 dBFS); gain clamp [${LEVEL_MIN_GAIN_DB}, +${LEVEL_MAX_GAIN_DB}] dB; knee ${LEVEL_KNEE_DBFS} dBFS, ceiling ${LEVEL_CEILING_DBFS} dBFS.`,
      "Measured by tests/vision-levelling.spec.ts test 3 from the seeded draft and the published library tape.",
      "",
      "clip | before: peak  active  whole | after: peak  active  whole | seconds before → after | codec",
    ];
    const actives: number[] = [];
    const wholes: number[] = [];
    for (const [i, p] of manifest.pages.entries()) {
      const fact = TWINKLE.pages[i];
      const codec = p.text?.audioCodec;
      expect(codec === "wav" || codec === "aac", `page ${i + 1} codec`).toBe(true);
      const url = p.text?.audioUrl;
      if (codec === "aac") {
        // Where an AAC encoder exists the clip is AAC/M4A, never Opus/WebM.
        expect(url).toMatch(/^data:audio\/mp4;base64,/);
        continue;
      }
      expect(url).toMatch(/^data:audio\/wav;base64,/);
      const before = readWav(dataUrlBytes(seeded[i]));
      const after = readWav(dataUrlBytes(url));
      expect(after.sampleRate).toBe(16000);
      expect(after.channels).toBe(1);
      expect(after.bitsPerSample).toBe(16);
      const seconds = after.pcm.length / after.sampleRate;
      expect(Math.abs(seconds - fact.clipSeconds), `page ${i + 1} duration`).toBeLessThanOrEqual(0.01);
      const active = activeRmsDb(after.pcm, after.sampleRate);
      const whole = wholeRmsDb(after.pcm);
      const peak = peakOf(after.pcm);
      expect(Math.abs(active - LEVEL_TARGET_DBFS), `page ${i + 1} active RMS ${db(active)}`).toBeLessThanOrEqual(1);
      expect(peak, `page ${i + 1} peak`).toBeLessThanOrEqual(CEILING);
      actives.push(active);
      wholes.push(whole);
      lines.push(
        `${i + 1}    | ${db(20 * Math.log10(peakOf(before.pcm)))}  ${db(activeRmsDb(before.pcm, 16000))}  ${db(wholeRmsDb(before.pcm))}` +
          ` | ${db(20 * Math.log10(peak))}  ${db(active)}  ${db(whole)}` +
          ` | ${(before.pcm.length / 16000).toFixed(3)} → ${seconds.toFixed(3)} | ${codec}`,
      );
    }
    if (wholes.length) {
      const spread = Math.max(...wholes) - Math.min(...wholes);
      expect(spread, "loudest to quietest, whole-clip RMS").toBeLessThanOrEqual(2);
      expect(Math.max(...actives) - Math.min(...actives)).toBeLessThanOrEqual(2);
      const beforeWholes = seeded.map((u) => wholeRmsDb(readWav(dataUrlBytes(u)).pcm));
      lines.push(
        "",
        `Spread (whole-clip RMS, loudest − quietest): before ${db(Math.max(...beforeWholes) - Math.min(...beforeWholes))} dB, after ${db(spread)} dB.`,
      );
      fs.writeFileSync("docs/vision/evidence/T17-levels.txt", `${lines.join("\n")}\n`);
    }
  });

  test("3b · the publishing dialog lists the step first, counting as it goes", async ({ page }) => {
    // Hold each voice's data URL back a little, so the dialog can be read mid-pass.
    await page.addInitScript(() => {
      const read = FileReader.prototype.readAsDataURL;
      FileReader.prototype.readAsDataURL = function (this: FileReader, blob: Blob) {
        if (blob.type.startsWith("audio/")) window.setTimeout(() => read.call(this, blob), 400);
        else read.call(this, blob);
      };
    });
    await page.setViewportSize(TABLET);
    await openTwinkle(page);
    await passGate(page);

    const dialog = page.getByRole("dialog", { name: "Finishing your story" });
    await expect(dialog).toBeVisible({ timeout: 15000 });
    const items = dialog.locator("ol > li");
    await expect(items).toHaveCount(4);
    // Each item is a status glyph, then "label · detail".
    await expect(items.first()).toContainText(new RegExp(`${STEP} · [1-4]/5$`), { timeout: 15000 });
    await expect(items.nth(1)).toContainText("Converting voices to AAC");
    await page.screenshot({ path: "docs/vision/evidence/T17-publishing.png", animations: "disabled" });

    await expect(page.getByRole("heading", { name: READY })).toBeVisible({ timeout: 60000 });
    expect((await stepTexts(page))[0]).toBe(`${STEP} · 5/5`);
  });

  test("4 · levelled once: a re-publish without new takes writes the same five clips", async ({ page }) => {
    await openTwinkle(page);
    await finish(page);
    const first = (await readLibrary(page))[0].ssyncData.pages.map((p) => p.text?.audioUrl);
    expect(first.every((u) => typeof u === "string" && u.startsWith("data:"))).toBe(true);
    // The levelled clips are not the draft's any more.
    expect(first).not.toEqual(seededClips());

    await page.getByRole("button", { name: "Back to the studio" }).click();
    await finish(page);
    expect((await stepTexts(page))[0]).toBe(`${STEP} · 5/5`);
    const rows = await readLibrary(page);
    expect(rows, "a re-publish updates the same tape").toHaveLength(1);
    const second = rows[0].ssyncData.pages.map((p) => p.text?.audioUrl);
    expect(second).toEqual(first);
  });

  test("4b · a new take on one page levels only that page", async ({ page }) => {
    await stubMicrophone(page);
    await openTwinkle(page);
    await finish(page);
    const first = (await readLibrary(page))[0].ssyncData.pages.map((p) => p.text?.audioUrl);

    await page.getByRole("button", { name: "Back to the studio" }).click();
    await recordTake(page);
    await finish(page);
    // The four levelled clips count as even; the new take could not be levelled here.
    expect((await stepTexts(page))[0]).toBe(`${STEP} · 4/5 · 1 left as recorded`);
    const second = (await readLibrary(page))[0].ssyncData.pages.map((p) => p.text?.audioUrl);
    expect(Array.from(dataUrlBytes(second[0]))).toEqual([1, 2, 3, 4]);
    expect(second.slice(1), "pages 2–5 pass straight through").toEqual(first.slice(1));
  });

  test("4c · a tape published with levelling off is levelled when it is published with it on", async ({ page }) => {
    await openTwinkle(page);
    await openAdvanced(page);
    await page.locator("#insp-level-voices").uncheck();
    // On a phone the Inspector is a sheet over the top bar: close it to reach Finish.
    await closeInspector(page);
    await finish(page);
    expect((await stepTexts(page))[0]).toBe(`${STEP} · off`);
    const off = (await readLibrary(page))[0].ssyncData.pages.map((p) => p.text?.audioUrl);
    expect(off).toEqual(seededClips());

    await page.getByRole("button", { name: "Back to the studio" }).click();
    await openAdvanced(page);
    await expect(page.locator("#insp-level-voices")).not.toBeChecked();
    await page.locator("#insp-level-voices").check();
    await closeInspector(page);
    await finish(page);
    expect((await stepTexts(page))[0]).toBe(`${STEP} · 5/5`);
    const on = (await readLibrary(page))[0].ssyncData.pages;
    for (const [i, p] of on.entries()) {
      // Levelled as what it already was: a WAV, in place, the same length.
      expect(p.text?.audioCodec).toBe("wav");
      const bytes = dataUrlBytes(p.text?.audioUrl);
      expect(bytes.length).toBe(dataUrlBytes(off[i]).length);
      const after = readWav(bytes);
      expect(Math.abs(activeRmsDb(after.pcm, after.sampleRate) - LEVEL_TARGET_DBFS)).toBeLessThanOrEqual(1);
    }
  });

  test("5 · off: the switch survives a reload, the step reads \"off\", the clips are the draft's", async ({ page }) => {
    await page.setViewportSize(TABLET);
    await openTwinkle(page);
    await openAdvanced(page);

    const toggle = page.locator("#insp-level-voices");
    await expect(toggle).toBeChecked();
    await expect(toggle).toHaveAttribute("role", "switch");
    await expect(page.getByText(NOTE, { exact: true })).toBeVisible();
    const label = page.locator('label[for="insp-level-voices"]');
    await expect(label).toHaveText(STEP);
    await expect(page.getByText("Voice clean-up (level, rumble)")).toHaveCount(0);
    expect(await page.getByText(NOTE, { exact: true }).evaluate((el) => getComputedStyle(el).fontSize)).toBe("12px");
    // At the end of Mix: after the activity meter, before Page details.
    const mix = page.locator("section", { has: page.getByRole("heading", { name: "Mix" }) });
    await expect(mix.locator("#insp-level-voices")).toHaveCount(1);
    await toggle.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "docs/vision/evidence/T17-inspector.png", animations: "disabled" });

    // Keyboard: the switch is the next stop after the mood, and Space toggles it.
    await page.locator("#insp-mood").focus();
    await page.keyboard.press("Tab");
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Space");
    await expect(toggle).not.toBeChecked();
    await expect(page.getByRole("switch", { name: STEP })).not.toBeChecked();

    // Autosave, then a reload and "Keep working on it".
    await expect
      .poll(() =>
        page.evaluate(() => {
          const raw = window.localStorage.getItem("ssync-studio-draft");
          return raw ? (JSON.parse(raw) as { state: { levelVoices?: boolean } }).state.levelVoices : undefined;
        }),
      )
      .toBe(false);
    await page.reload();
    await restoreDraft(page);
    await openAdvanced(page);
    await expect(page.locator("#insp-level-voices")).not.toBeChecked();
    await closeInspector(page);

    await finish(page);
    expect((await stepTexts(page))[0]).toBe(`${STEP} · off`);
    await expect(page.locator(SEL.card).locator(SEL.steps).locator("li").first()).toHaveAttribute("data-state", "done");
    const manifest = (await readLibrary(page))[0].ssyncData;
    expect(validateManifest(manifest).ok).toBe(true);
    // Draft-only: the setting never reaches the published tape.
    expect(JSON.stringify(manifest)).not.toContain("levelVoices");
    const seeded = seededClips();
    for (const [i, p] of manifest.pages.entries()) {
      expect(p.text?.audioCodec).toBe("wav");
      expect(
        Buffer.compare(Buffer.from(dataUrlBytes(p.text?.audioUrl)), Buffer.from(dataUrlBytes(seeded[i]))),
        `page ${i + 1} is the draft's clip, byte for byte`,
      ).toBe(0);
    }
  });

  test("5b · reduced motion: the switch flips without sliding", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openTwinkle(page);
    await openAdvanced(page);
    const toggle = page.locator("#insp-level-voices");
    const motion = () =>
      toggle.evaluate((el) => [getComputedStyle(el).transitionProperty, getComputedStyle(el, "::before").transitionProperty]);
    expect(await motion()).toEqual(["none", "none"]);
    await page.locator('label[for="insp-level-voices"]').click();
    await expect(toggle).not.toBeChecked();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    expect((await motion()).every((p) => p !== "none")).toBe(true);
  });

  test("6b · a WAV that will not decode is published exactly as recorded, and the publish finishes", async ({ page }) => {
    // Page 1's clip claims WAV but is only the four bytes "RIFF": levelWav cannot
    // read it and the decoder cannot either.
    const broken = "data:audio/wav;base64,UklGRg==";
    await page.clock.setFixedTime(MOMENT);
    await seedStudioDraft(page, "twinkle");
    // Registered after the seed, so it runs after the seed has written the draft.
    await page.addInitScript(
      ({ key, url }) => {
        try {
          if (window.sessionStorage.getItem("t17-broken-wav")) return;
          const envelope = JSON.parse(window.localStorage.getItem(key) || "null") as {
            state: { manifest: { pages: Array<{ text?: { audioUrl?: string } }> } };
          } | null;
          if (!envelope) return;
          envelope.state.manifest.pages[0].text!.audioUrl = url;
          window.localStorage.setItem(key, JSON.stringify(envelope));
          window.sessionStorage.setItem("t17-broken-wav", "1");
        } catch {
          /* opaque origins have no storage */
        }
      },
      { key: "ssync-studio-draft", url: broken },
    );
    await page.goto("/studio");
    await restoreDraft(page);
    await finish(page);
    expect((await stepTexts(page))[0]).toBe(`${STEP} · 4/5 · 1 left as recorded`);
    const manifest = (await readLibrary(page))[0].ssyncData;
    expect(validateManifest(manifest).ok).toBe(true);
    expect(manifest.pages[0].text?.audioCodec).toBe("wav");
    expect(manifest.pages[0].text?.audioUrl).toBe(broken);
  });

  test("6 · skipped: a take that cannot be levelled is published exactly as recorded", async ({ page }) => {
    await stubMicrophone(page);
    await openTwinkle(page);
    await recordTake(page);

    await finish(page);
    const first = (await stepTexts(page))[0];
    expect(first).toContain("left as recorded");
    expect(first).toBe(`${STEP} · 4/5 · 1 left as recorded`);
    await expect(page.locator(SEL.card).locator(SEL.steps).locator("li").first()).toHaveAttribute("data-state", "done");

    const manifest = (await readLibrary(page))[0].ssyncData;
    expect(validateManifest(manifest).ok).toBe(true);
    const take = manifest.pages[0].text;
    expect(take?.audioCodec).toBe("aac");
    expect(take?.audioUrl).toMatch(/^data:audio\/mp4;base64,/);
    expect(Array.from(dataUrlBytes(take?.audioUrl))).toEqual([1, 2, 3, 4]);
    // The four Twinkle clips beside it are levelled as before.
    for (const p of manifest.pages.slice(1)) {
      const after = readWav(dataUrlBytes(p.text?.audioUrl));
      expect(Math.abs(activeRmsDb(after.pcm, after.sampleRate) - LEVEL_TARGET_DBFS)).toBeLessThanOrEqual(1);
    }
  });
});
