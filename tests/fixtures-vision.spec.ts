// T00 · The Vision Reel's family tapes as test fixtures.
//
// Node-side: the fixture files are what the facts module says they are, made
// by the repo's own container code — and none of the illustrative cast ever
// reaches the product (src/, public/).
// E2E: the page helpers load the tapes through the app's own doors.
//
// Regenerate the files with
//   npx playwright test --config tests/fixtures/generate.config.ts

import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { unpackStorysync } from "../src/lib/storysync/container";
import { validateManifest } from "../src/lib/storysync/manifest";
import {
  CLIP_FORMAT,
  FIXTURE_PATHS,
  GOODNIGHT_MIA,
  PICTURE_MAX_BYTES,
  REPO_ROOT,
  TAPE_NAMES,
  TAPES,
  TWINKLE,
  assetPaths,
  loadTape,
} from "./fixtures/tapes";
import {
  DRAFT_KEY,
  openTapeInReadRoom,
  restoreDraft,
  seedDeviceLibrary,
  seedStudioDraft,
  studioDraftState,
} from "./fixtures/helpers";

/* ------------------------------------------------------------ file readers */

interface Wav {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  dataBytes: number;
  samples: Int16Array;
}

function readWav(file: string): Wav {
  const buf = fs.readFileSync(file);
  expect(buf.toString("ascii", 0, 4), `${file}: RIFF`).toBe("RIFF");
  expect(buf.toString("ascii", 8, 12), `${file}: WAVE`).toBe("WAVE");
  let offset = 12;
  let fmt: Omit<Wav, "dataBytes" | "samples"> | null = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        byteRate: buf.readUInt32LE(body + 8),
        blockAlign: buf.readUInt16LE(body + 12),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === "data") {
      if (!fmt) throw new Error(`${file}: data before fmt`);
      const samples = new Int16Array(size / 2);
      for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16LE(body + i * 2);
      return { ...fmt, dataBytes: size, samples };
    }
    offset = body + size + (size % 2);
  }
  throw new Error(`${file}: no data chunk`);
}

const dbfs = (peak: number) => 20 * Math.log10(peak / 32768);

/** Count syllable-rate bumps: local maxima of a 20 ms RMS envelope. */
function syllablesPerSecond(samples: Int16Array, rate: number): number {
  const win = Math.round(rate * 0.02);
  const env: number[] = [];
  for (let i = 0; i + win <= samples.length; i += win) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += samples[j] * samples[j];
    env.push(Math.sqrt(sum / win));
  }
  const top = Math.max(...env);
  let bumps = 0;
  for (let i = 1; i < env.length - 1; i++) {
    if (env[i] > env[i - 1] && env[i] >= env[i + 1] && env[i] > top * 0.3) bumps++;
  }
  return bumps / (samples.length / rate);
}

/** Fundamental from the autocorrelation peak of a voiced 50 ms window. */
function fundamentalHz(samples: Int16Array, rate: number): number {
  // The loudest 50 ms window sits in the middle of a syllable.
  const win = Math.round(rate * 0.05);
  let best = 0;
  let at = 0;
  for (let i = 0; i + win <= samples.length; i += win / 2) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += Math.abs(samples[j]);
    if (sum > best) {
      best = sum;
      at = i;
    }
  }
  const minLag = Math.floor(rate / 400);
  const maxLag = Math.ceil(rate / 80);
  let bestLag = minLag;
  let bestR = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let r = 0;
    for (let j = at; j + lag < at + win; j++) r += samples[j] * samples[j + lag];
    if (r > bestR) {
      bestR = r;
      bestLag = lag;
    }
  }
  return rate / bestLag;
}

/** Baseline JPEG: SOI, then the SOF0 frame header's height × width. */
function jpegSof0(file: string): { width: number; height: number } | null {
  const b = fs.readFileSync(file);
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2;
      continue;
    }
    const len = b.readUInt16BE(i + 2);
    if (marker === 0xc0) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    if (marker === 0xda) return null; // scan started without a SOF0
    i += 2 + len;
  }
  return null;
}

/* ------------------------------------------------------------- the facts */

test.describe("vision fixtures · facts", () => {
  test("the facts module states the reference tapes verbatim", () => {
    expect(TWINKLE.title).toBe("Twinkle Came to My Window");
    expect(TWINKLE.byline).toBe("Mia, age 4 — with Mom");
    expect(TWINKLE.narrator).toBe("Mia");
    expect(TWINKLE.created).toBe("2026-10-19T18:02:10Z");
    expect(TWINKLE.pages.map((p) => p.text)).toEqual([
      "This is Twinkle. She is a little star.",
      "Twinkle looked down at all the houses.",
      "I was scared of the dark. Twinkle came to my window.",
      "We flew over the moon!",
      "Goodnight, Twinkle. Goodnight, Grandma!",
    ]);
    expect(TWINKLE.pages.map((p) => p.clipSeconds)).toEqual([5.1, 4.4, 6.4, 3.8, 4.3]);
    expect(TWINKLE.pages.map((p) => p.peakDbfs)).toEqual([-9, -20, -14, -26, -12]);
    const total = TWINKLE.pages.reduce((s, p) => s + p.clipSeconds, 0);
    expect(total).toBeCloseTo(24.0, 6);
    expect(TWINKLE.totalSeconds).toBe(24.0);
    expect(TWINKLE.mood).toBe("Wonder");
    expect(TWINKLE.autoPause).toBe("2s");
    expect(TWINKLE.signature).toEqual({
      ownership: "© 2026 Mia, age 4 — with Mom",
      rights: "personal use",
      voiceConsent: [{ voice: "Mia, age 4 — with Mom", grantedBy: "parent/guardian", date: "2026-10-19" }],
    });

    expect(GOODNIGHT_MIA.title).toBe("Goodnight, Mia");
    expect(GOODNIGHT_MIA.byline).toBe("Grandma Rose");
    expect(GOODNIGHT_MIA.narrator).toBe("Grandma Rose");
    expect(GOODNIGHT_MIA.pages.map((p) => p.text)).toEqual([
      "Goodnight, my brave little star. I'll look for Twinkle at my window tonight. Love, Grandma.",
    ]);
    expect(GOODNIGHT_MIA.pages.map((p) => p.clipSeconds)).toEqual([7.6]);
    expect(GOODNIGHT_MIA.signature.voiceConsent).toEqual([
      { voice: "Grandma Rose", grantedBy: "self", date: "2026-10-19" },
    ]);

    // Every path is absolute and inside tests/fixtures/.
    for (const name of TAPE_NAMES) {
      const files = FIXTURE_PATHS[name];
      for (const p of [files.tape, ...files.pictures, ...files.clips]) {
        expect(path.isAbsolute(p)).toBe(true);
        expect(p.startsWith(path.join(REPO_ROOT, "tests", "fixtures") + path.sep)).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------------------ the files */

test.describe("vision fixtures · files (node)", () => {
  for (const name of TAPE_NAMES) {
    const facts = TAPES[name];
    const files = FIXTURE_PATHS[name];

    test(`${name}.storysync unpacks, validates, and carries the facts exactly`, () => {
      const bytes = new Uint8Array(fs.readFileSync(files.tape));
      const { manifest, assets } = unpackStorysync(bytes);
      expect(validateManifest(manifest).errors).toEqual([]);
      expect(manifest.version).toBe("2.0");
      expect(manifest.metadata).toEqual({
        title: facts.title,
        author: facts.byline,
        narrator: facts.narrator,
        language: facts.language,
        created: facts.created,
      });

      expect(manifest.pages.map((p) => p.id)).toEqual(facts.pages.map((p) => p.id));
      for (const [i, page] of manifest.pages.entries()) {
        const fact = facts.pages[i];
        const want = assetPaths(fact.id);
        expect(page.text?.content).toBe(fact.text);
        expect(page.illustration?.url).toBe(want.picture);
        expect(page.text?.audioUrl).toBe(want.clip);
        expect(page.text?.audioCodec).toBe("wav");
        expect(page.music).toBe(facts.mood);
        expect(page.timing?.autoPause).toBe(facts.autoPause);
      }

      expect(manifest.signature).toEqual(facts.signature);
      expect(manifest.signature?.shareUrl).toBeUndefined();

      // The container holds exactly the loose fixture files, byte for byte.
      const expected = new Map<string, string>();
      facts.pages.forEach((p, i) => {
        expected.set(assetPaths(p.id).picture, files.pictures[i]);
        expected.set(assetPaths(p.id).clip, files.clips[i]);
      });
      expect([...assets.keys()].sort()).toEqual([...expected.keys()].sort());
      for (const [asset, file] of expected) {
        expect(Buffer.compare(Buffer.from(assets.get(asset)!), fs.readFileSync(file)), asset).toBe(0);
      }

      // loadTape gives the app's data-URL story shape.
      const loaded = loadTape(name);
      expect(loaded.manifest).toEqual(manifest);
      for (const page of loaded.story.pages) {
        expect(page.illustration?.url?.startsWith("data:image/jpeg;base64,")).toBe(true);
        expect(page.text?.audioUrl?.startsWith("data:audio/wav;base64,")).toBe(true);
      }
    });

    test(`${name} narration: 16 kHz mono 16-bit PCM at the documented lengths and peaks`, () => {
      facts.pages.forEach((fact, i) => {
        const wav = readWav(files.clips[i]);
        const label = path.basename(files.clips[i]);
        expect(wav.audioFormat, label).toBe(1);
        expect(wav.channels, label).toBe(CLIP_FORMAT.channels);
        expect(wav.sampleRate, label).toBe(CLIP_FORMAT.sampleRate);
        expect(wav.bitsPerSample, label).toBe(CLIP_FORMAT.bitsPerSample);
        expect(wav.byteRate, label).toBe(CLIP_FORMAT.bytesPerSecond);
        expect(wav.blockAlign, label).toBe(2);

        const seconds = wav.dataBytes / CLIP_FORMAT.bytesPerSecond;
        expect(Math.abs(seconds - fact.clipSeconds), `${label} length ${seconds}s`).toBeLessThanOrEqual(0.01);

        let peak = 0;
        for (const s of wav.samples) peak = Math.max(peak, Math.abs(s));
        const measured = dbfs(peak);
        expect(Math.abs(measured - fact.peakDbfs), `${label} peak ${measured.toFixed(2)} dBFS`).toBeLessThanOrEqual(1);

        // Speech-like: a voiced ~180 Hz tone, ~4 syllables a second, faded in and out.
        expect(Math.abs(fundamentalHz(wav.samples, wav.sampleRate) - CLIP_FORMAT.fundamentalHz), label).toBeLessThan(6);
        const rate = syllablesPerSecond(wav.samples, wav.sampleRate);
        expect(rate, `${label} syllables/s`).toBeGreaterThan(CLIP_FORMAT.syllableHz - 1);
        expect(rate, `${label} syllables/s`).toBeLessThan(CLIP_FORMAT.syllableHz + 1);
        expect(Math.abs(wav.samples[0]), label).toBeLessThan(peak * 0.02);
        expect(Math.abs(wav.samples[wav.samples.length - 1]), label).toBeLessThan(peak * 0.02);
      });
      const total = facts.pages.reduce((s, _p, i) => s + readWav(files.clips[i]).dataBytes, 0);
      expect(Math.abs(total / CLIP_FORMAT.bytesPerSecond - facts.totalSeconds)).toBeLessThanOrEqual(0.01);
    });

    test(`${name} pictures: baseline JPEG ${facts.picture.width}×${facts.picture.height}, within budget`, () => {
      for (const file of files.pictures) {
        const label = path.basename(file);
        const bytes = fs.readFileSync(file);
        expect(bytes[0], label).toBe(0xff);
        expect(bytes[1], label).toBe(0xd8);
        expect(jpegSof0(file), label).toEqual({ width: facts.picture.width, height: facts.picture.height });
        expect(bytes.length, `${label} is ${bytes.length} bytes`).toBeLessThanOrEqual(PICTURE_MAX_BYTES);
      }
    });
  }

  test("guard: the illustrative cast never reaches src/ or public/", () => {
    const banned = [
      "Twinkle Came to My Window",
      "Goodnight, Mia",
      "Rivera",
      "Grandma Rose",
      "Mia, age 4",
      "Maple Street",
      "Okafor",
      "3f9c2a7be41d0c58",
      "9a41c07e3d5b2f16",
    ];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile()) {
          const text = fs.readFileSync(full).toString("utf8");
          for (const s of banned) if (text.includes(s)) hits.push(`${path.relative(REPO_ROOT, full)}: "${s}"`);
        }
      }
    };
    let scanned = 0;
    for (const root of ["src", "public"]) {
      const dir = path.join(REPO_ROOT, root);
      expect(fs.existsSync(dir), root).toBe(true);
      walk(dir);
      scanned++;
    }
    expect(scanned).toBe(2);
    expect(hits, `illustrative content in the product:\n${hits.join("\n")}`).toEqual([]);
  });
});

/* ------------------------------------------------------ helpers, in Node */

test.describe("vision fixtures · draft seed contract (node)", () => {
  test("a seeded draft is a fresh Creator draft, shaped by its options", () => {
    const fresh = studioDraftState("twinkle");
    expect(fresh.manifest.metadata.title).toBe(TWINKLE.title);
    expect(fresh.manifest.metadata.author).toBe("");
    expect("narrator" in fresh.manifest.metadata).toBe(false);
    expect(fresh.manifest.signature).toBeUndefined();
    expect(fresh.mood).toBe("Wonder");
    expect(fresh.musicOn).toBe(true);
    expect(fresh.published).toBeNull();
    expect(fresh.recordings).toEqual(
      Object.fromEntries(TWINKLE.pages.map((p) => [String(p.id), { mimeType: "audio/wav", duration: p.clipSeconds }])),
    );
    for (const page of fresh.manifest.pages) {
      expect(page.illustration?.url?.startsWith("data:image/jpeg;base64,")).toBe(true);
      expect(page.text?.audioUrl?.startsWith("data:audio/wav;base64,")).toBe(true);
      expect(page.text?.audioCodec).toBeUndefined();
      expect(page.music).toBeUndefined();
      expect(page.timing?.autoPause).toBe("2s");
    }

    const published = studioDraftState("twinkle", { published: true, byline: "Someone" });
    expect(published.manifest.metadata.author).toBe("Someone");
    expect(published.manifest.pages.every((p) => p.text?.audioCodec === "wav")).toBe(true);

    const quiet = studioDraftState("twinkle", { narration: false });
    expect(quiet.recordings).toEqual({});
    expect(quiet.manifest.pages.some((p) => p.text?.audioUrl)).toBe(false);
    expect(quiet.manifest.pages.map((p) => p.text?.content)).toEqual(TWINKLE.pages.map((p) => p.text));

    const voiced = studioDraftState("twinkle", { voices: { 2: "Mom", 4: "Dad" } });
    expect(voiced.manifest.pages.map((p) => p.text?.voice)).toEqual([undefined, "Mom", undefined, "Dad", undefined]);
  });
});

/* ------------------------------------------------------- helpers, in-app */

test.describe("vision fixtures · helpers drive the app", () => {
  test("openTapeInReadRoom threads Twinkle onto the cover", async ({ page }) => {
    await openTapeInReadRoom(page, "twinkle");
    const label = page.locator('[data-pl="cover"] [data-sk="tape"]');
    await expect(label).toContainText("Twinkle Came to My Window");
    await expect(label).toContainText("SIDE A · 5 PAGES");
  });

  test("seedStudioDraft + restoreDraft opens the Studio on five voiced pages", async ({ page }) => {
    await seedStudioDraft(page, "twinkle");
    await page.goto("/studio");
    await restoreDraft(page);
    const frames = page.getByRole("region", { name: "Pages" }).getByRole("button", { name: /^Page \d/ });
    await expect(frames).toHaveCount(5);
    await expect(frames.nth(0)).toHaveAccessibleName("Page 1, has voice, selected");
    for (let n = 2; n <= 5; n++) {
      await expect(frames.nth(n - 1)).toHaveAccessibleName(`Page ${n}, has voice`);
    }
  });

  test("a seed lands once per tab: a reload keeps what the app did since", async ({ page }) => {
    await seedStudioDraft(page, "twinkle", { startedAgoS: 60 });
    await page.goto("/studio");
    const started = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.startedAt, DRAFT_KEY);
    expect(Date.now() - Date.parse(started)).toBeGreaterThanOrEqual(60_000);
    expect(Date.now() - Date.parse(started)).toBeLessThan(120_000);
    // "Start a new story" clears the draft; the seed must not bring it back.
    await page.getByRole("button", { name: /Start a new story/ }).click();
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY)).toBeNull();
    await page.reload();
    await expect(page.getByRole("region", { name: "Pages" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Keep working on it/ })).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY)).toBeNull();
  });

  test("seedDeviceLibrary + ?story= opens Goodnight, Mia", async ({ page }) => {
    const shareCode = randomBytes(16).toString("hex");
    await seedDeviceLibrary(page, "goodnight-mia", { shareCode });
    await page.goto(`/read?story=${shareCode}`);
    const label = page.locator('[data-pl="cover"] [data-sk="tape"]');
    await expect(label).toContainText("Goodnight, Mia", { timeout: 20000 });
    await expect(page.getByRole("button", { name: /Tap to Begin/ })).toBeVisible();
  });

  test("the drawings are crayon on paper with an 8 px paper margin", async ({ page }) => {
    const paper = TWINKLE.picture.paper!;
    const files = FIXTURE_PATHS.twinkle.pictures.map((f) => fs.readFileSync(f).toString("base64"));
    const report = await page.evaluate(
      async ({ images, margin }) => {
        const out: { margin: number[][]; inked: number }[] = [];
        for (const b64 of images) {
          const blob = await (await fetch(`data:image/jpeg;base64,${b64}`)).blob();
          const bmp = await createImageBitmap(blob);
          const canvas = new OffscreenCanvas(bmp.width, bmp.height);
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(bmp, 0, 0);
          const { data, width, height } = ctx.getImageData(0, 0, bmp.width, bmp.height);
          const px = (x: number, y: number) => {
            const i = (y * width + x) * 4;
            return [data[i], data[i + 1], data[i + 2]];
          };
          // Samples inside the margin, all four edges.
          const m: number[][] = [];
          const inset = Math.floor(margin / 2);
          for (let t = 0; t < width; t += 37) {
            m.push(px(t, inset), px(t, height - 1 - inset));
          }
          for (let t = 0; t < height; t += 37) {
            m.push(px(inset, t), px(width - 1 - inset, t));
          }
          // Strongly coloured (crayon) pixels inside the drawing.
          let inked = 0;
          for (let y = margin; y < height - margin; y += 3) {
            for (let x = margin; x < width - margin; x += 3) {
              const [r, g, b] = px(x, y);
              if (Math.max(r, g, b) - Math.min(r, g, b) > 80) inked++;
            }
          }
          out.push({ margin: m, inked });
        }
        return out;
      },
      { images: files, margin: paper.marginPx },
    );
    expect(report).toHaveLength(5);
    for (const [i, pic] of report.entries()) {
      for (const [r, g, b] of pic.margin) {
        // Warm crayon paper (#FBF7EC under a faint warm vignette), never ink.
        expect(r, `page-${i + 1} margin`).toBeGreaterThanOrEqual(220);
        expect(r, `page-${i + 1} margin`).toBeGreaterThanOrEqual(g - 3);
        expect(g, `page-${i + 1} margin`).toBeGreaterThanOrEqual(b - 3);
        expect(r - b, `page-${i + 1} margin`).toBeLessThan(45);
      }
      expect(pic.inked, `page-${i + 1} has crayon on it`).toBeGreaterThan(500);
    }
  });
});
