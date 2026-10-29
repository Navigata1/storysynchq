/**
 * Regenerates every vision fixture file from its sources:
 *
 *   pictures  ← the reference SVG symbols (#s03-d1…#s03-d5 in s03.html,
 *               #s06-win in s06.html), rasterized in the bundled Chromium
 *   clips     ← synthesized here: a voiced 180 Hz tone with harmonics,
 *               amplitude-modulated at a syllable rate, faded in and out
 *   tapes     ← packed with the app's own packStorysync (no ZIP code here)
 *
 *   npx playwright test --config tests/fixtures/generate.config.ts
 *
 * Not part of the main suite: the main config's testMatch (*.spec / *.test)
 * never picks this file up. No dependency beyond what the repo already has.
 */

import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { packStorysync, unpackStorysync } from "../../src/lib/storysync/container";
import type { SsyncManifest } from "../../src/lib/storysync/manifest";
import {
  CLIP_FORMAT,
  FIXTURE_PATHS,
  PICTURE_MAX_BYTES,
  TAPE_NAMES,
  TAPES,
  assetPaths,
  type TapeFacts,
  type TapeName,
} from "./tapes";

/** JPEG quality for every picture. */
const JPEG_QUALITY = 85;

/* ---------------------------------------------------------------- pictures */

/** The hidden `<svg class="…"><defs>…</defs></svg>` block a reference screen draws from. */
function referenceDefs(sourceFile: string, symbols: string[]): string {
  const html = fs.readFileSync(sourceFile, "utf8");
  const start = html.search(/<svg class="s0?\d-defs"/);
  const end = html.indexOf("</defs></svg>", start);
  if (start < 0 || end < 0) throw new Error(`${sourceFile}: no defs block`);
  const defs = html.slice(start, end + "</defs></svg>".length);
  for (const id of symbols) {
    if (!defs.includes(`<symbol id="${id}"`)) throw new Error(`${sourceFile}: #${id} not in defs`);
  }
  return defs;
}

/**
 * One picture as an SVG document. A drawing is shot "as a photo" (brief,
 * s03 Stage): the sheet on crayon paper with an 8 px paper margin under the
 * Stage's faint warm vignette. Grandma's window is already a photo, full bleed.
 */
function pictureSvg(facts: TapeFacts, symbol: string): string {
  const { width: W, height: H, paper } = facts.picture;
  const { width: vbW, height: vbH } = facts.picture.symbolViewBox;
  if (!paper) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <svg width="${W}" height="${H}" viewBox="0 0 ${vbW} ${vbH}" preserveAspectRatio="xMidYMid slice"><use href="#${symbol}"/></svg>
</svg>`;
  }
  const m = paper.marginPx;
  // The Stage photo's ::after vignette (s03.html .s3-photo__paper::after):
  // radial-gradient(75% 75% at 42% 38%, rgba(255,232,190,.06), rgba(120,74,30,.16) 100%)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="fx-vignette" cx=".42" cy=".38" r=".75">
      <stop offset="0" stop-color="#FFE8BE" stop-opacity=".06"/>
      <stop offset="1" stop-color="#784A1E" stop-opacity=".16"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${paper.color}"/>
  <svg x="${m}" y="${m}" width="${W - 2 * m}" height="${H - 2 * m}" viewBox="0 0 ${vbW} ${vbH}"><use href="#${symbol}"/></svg>
  <rect width="${W}" height="${H}" fill="url(#fx-vignette)"/>
</svg>`;
}

async function rasterize(page: Page, facts: TapeFacts, symbol: string, defs: string): Promise<Buffer> {
  const { width, height } = facts.picture;
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>
      html, body { margin: 0; padding: 0; background: #000; overflow: hidden; }
      svg { display: block; }
    </style></head><body>${defs}${pictureSvg(facts, symbol)}</body></html>`,
  );
  return page.screenshot({
    type: "jpeg",
    quality: JPEG_QUALITY,
    clip: { x: 0, y: 0, width, height },
  });
}

/* ------------------------------------------------------------------ clips */

/**
 * A speech-like clip: a voiced tone at the fundamental with formant-shaped
 * harmonics, amplitude-modulated at the syllable rate (each syllable with its
 * own stress), raised-cosine fades at both ends, normalized to the peak level.
 */
function synthesizeClip(seconds: number, peakDbfs: number): Buffer {
  const { sampleRate, fundamentalHz, syllableHz, fadeMs } = CLIP_FORMAT;
  const n = Math.round(seconds * sampleRate);
  const fade = Math.round((fadeMs / 1000) * sampleRate);
  const harmonics: { f: number; a: number; phase: number }[] = [];
  for (let k = 1; k * fundamentalHz < sampleRate / 2 - 1000; k++) {
    const f = k * fundamentalHz;
    // A soft vowel: lifts near the first two formants of an open vowel.
    const formant = 1 + 1.5 * Math.exp(-(((f - 540) / 220) ** 2)) + 0.8 * Math.exp(-(((f - 1620) / 300) ** 2));
    harmonics.push({ f, a: formant / k, phase: k * 0.9 });
  }

  const x = new Float64Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let voiced = 0;
    for (const h of harmonics) voiced += h.a * Math.sin(2 * Math.PI * h.f * t + h.phase);
    const syllable = Math.floor(t * syllableHz);
    const stress = 0.7 + (0.3 * ((syllable * 7) % 5)) / 4;
    let gain = stress * Math.sin(Math.PI * syllableHz * t) ** 2;
    if (i < fade) gain *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
    if (i >= n - fade) gain *= 0.5 - 0.5 * Math.cos((Math.PI * (n - 1 - i)) / fade);
    x[i] = voiced * gain;
    peak = Math.max(peak, Math.abs(x[i]));
  }

  const target = Math.min(32767, 10 ** (peakDbfs / 20) * 32768);
  const scale = target / peak;
  const dataBytes = n * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(CLIP_FORMAT.channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(CLIP_FORMAT.bytesPerSecond, 28);
  wav.writeUInt16LE(2, 32); // block align
  wav.writeUInt16LE(CLIP_FORMAT.bitsPerSample, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(x[i] * scale), 44 + i * 2);
  return wav;
}

/* ------------------------------------------------------------------ tapes */

/** The published manifest, as the Creator would write it for this tape. */
function manifestFor(facts: TapeFacts): SsyncManifest {
  return {
    version: "2.0",
    metadata: {
      title: facts.title,
      author: facts.byline,
      narrator: facts.narrator,
      language: facts.language,
      created: facts.created,
    },
    settings: {
      autoPlay: true,
      pageTransition: "fade",
      readAlongHighlight: true,
      pageTurnSound: true,
      accessibility: { timingMultiplier: 1 },
    },
    pages: facts.pages.map((p) => ({
      id: p.id,
      layout: "image-top",
      illustration: { url: assetPaths(p.id).picture, alt: p.alt },
      text: {
        content: p.text,
        wordHighlight: true,
        audioUrl: assetPaths(p.id).clip,
        audioCodec: "wav" as const,
      },
      music: facts.mood,
      timing: { autoPause: facts.autoPause },
    })),
    signature: JSON.parse(JSON.stringify(facts.signature)),
  };
}

/**
 * packStorysync stamps every ZIP entry with "now" (fflate's default mtime).
 * Pin that clock to the tape's own `created` time, in UTC, so a regeneration
 * reproduces the same bytes.
 */
function packReproducibly(manifest: SsyncManifest, assets: Map<string, Uint8Array>, at: string): Uint8Array {
  const realNow = Date.now;
  const realTz = process.env.TZ;
  process.env.TZ = "UTC";
  Date.now = () => Date.parse(at);
  try {
    return packStorysync(manifest, assets);
  } finally {
    Date.now = realNow;
    if (realTz === undefined) delete process.env.TZ;
    else process.env.TZ = realTz;
  }
}

/* -------------------------------------------------------------- generate */

test("regenerate every vision fixture file", async ({ page }) => {
  for (const name of TAPE_NAMES as TapeName[]) {
    const facts = TAPES[name];
    const files = FIXTURE_PATHS[name];
    fs.mkdirSync(path.dirname(files.pictures[0]), { recursive: true });

    await test.step(`${name}: pictures from ${facts.picture.source}`, async () => {
      const defs = referenceDefs(files.source, facts.picture.symbols);
      for (const [i, symbol] of facts.picture.symbols.entries()) {
        const jpeg = await rasterize(page, facts, symbol, defs);
        expect(jpeg.length, `${symbol} → ${jpeg.length} bytes`).toBeLessThanOrEqual(PICTURE_MAX_BYTES);
        fs.writeFileSync(files.pictures[i], jpeg);
      }
    });

    await test.step(`${name}: narration clips`, async () => {
      facts.pages.forEach((p, i) => fs.writeFileSync(files.clips[i], synthesizeClip(p.clipSeconds, p.peakDbfs)));
    });

    await test.step(`${name}: pack ${path.basename(files.tape)}`, async () => {
      const assets = new Map<string, Uint8Array>();
      facts.pages.forEach((p, i) => {
        assets.set(assetPaths(p.id).picture, new Uint8Array(fs.readFileSync(files.pictures[i])));
        assets.set(assetPaths(p.id).clip, new Uint8Array(fs.readFileSync(files.clips[i])));
      });
      const bytes = packReproducibly(manifestFor(facts), assets, facts.created);
      // What was written is what the app reads back.
      expect(unpackStorysync(bytes).manifest).toEqual(manifestFor(facts));
      fs.writeFileSync(files.tape, bytes);
    });
  }
});
