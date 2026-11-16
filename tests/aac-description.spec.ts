/**
 * The AAC a Safari-engine encoder writes must be a file that plays (mission P5, C2b).
 *
 * On 2026-11-09 the AAC gate ran on a Mac for the first time and failed in WebKit: publish
 * wrote AAC in MP4 that no browser could decode. WebKit's AudioEncoder hands back its decoder
 * description as a whole MPEG-4 ES_Descriptor, where Chromium's (and the WebCodecs registry)
 * give the bare AudioSpecificConfig; mp4-muxer wraps whatever it is given in an `esds` box, so
 * WebKit's ended up nested inside a second descriptor. Measured on WebKit 26.0 (2026-11-16):
 * the 39 bytes below, which hold the 2-byte config 0x11 0x88 (AAC-LC, 48 kHz, mono).
 *
 *   1. Node-side: `aacSpecificConfig` returns the bare config from either shape, and null for
 *      anything that is neither.
 *   2. In the Studio, with an encoder standing in for WebKit's (real AAC frames from
 *      tests/fixtures/aac-tone.m4a, WebKit's own description bytes): the published take is
 *      AAC whose `esds` holds the config once, and it decodes to the sound.
 *   3. An encoder whose output cannot be decoded at all never reaches a published tape as AAC:
 *      the take falls back to WAV and still plays.
 *
 * Headless Chromium on Linux has no AAC encoder, so 2 and 3 replace `AudioEncoder`; the real
 * WebKit run is the P5 gate (ops/mission/gates/aac_publish.sh), which needs a Mac.
 */

import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { aacSpecificConfig } from "../src/lib/audio/transcode";
import { REPO_ROOT } from "./fixtures/tapes";

const hexBytes = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
const toHex = (bytes: Uint8Array | null) => (bytes ? Buffer.from(bytes).toString("hex") : null);

/** What WebKit 26.0's AudioEncoder gave as `decoderConfig.description` for mp4a.40.2, 48 kHz mono. */
const WEBKIT_DESCRIPTION = "038080802200000004808080144014001800000000000000000005808080021188068080800102";
/** The same descriptor with one-byte lengths, as other writers emit it. */
const SHORT_FORM_DESCRIPTION = "031900000004114015000000000177000001770005021188060102";
const ASC = "1188";

const AAC_TONE = fs.readFileSync(path.join(REPO_ROOT, "tests", "fixtures", "aac-tone.m4a"));

test.describe("AAC description · the config an esds box needs, from either encoder", () => {
  test("a bare AudioSpecificConfig (Chromium) is returned as it is", () => {
    expect(toHex(aacSpecificConfig(hexBytes(ASC)))).toBe(ASC);
    expect(toHex(aacSpecificConfig(hexBytes(ASC).buffer))).toBe(ASC);
    // ffmpeg's longer form (with the sync extension) is a config too
    expect(toHex(aacSpecificConfig(hexBytes("118856e500")))).toBe("118856e500");
  });

  test("an ES_Descriptor (WebKit) gives up the config inside it", () => {
    expect(toHex(aacSpecificConfig(hexBytes(WEBKIT_DESCRIPTION)))).toBe(ASC);
    expect(toHex(aacSpecificConfig(hexBytes(WEBKIT_DESCRIPTION).buffer))).toBe(ASC);
    expect(toHex(aacSpecificConfig(hexBytes(SHORT_FORM_DESCRIPTION)))).toBe(ASC);
    // a view into a larger buffer reads only its own bytes
    const padded = hexBytes(`ffff${WEBKIT_DESCRIPTION}ffff`);
    expect(toHex(aacSpecificConfig(padded.subarray(2, padded.length - 2)))).toBe(ASC);
  });

  test("nothing usable is null, never a guess", () => {
    expect(aacSpecificConfig(undefined)).toBeNull();
    expect(aacSpecificConfig(null)).toBeNull();
    expect(aacSpecificConfig(new Uint8Array(0))).toBeNull();
    expect(aacSpecificConfig(hexBytes("11"))).toBeNull();
    // a descriptor cut off before its config, and one with no decoder-specific info
    expect(aacSpecificConfig(hexBytes(WEBKIT_DESCRIPTION.slice(0, 40)))).toBeNull();
    expect(aacSpecificConfig(hexBytes("0310000000040d401500000000017700000177"))).toBeNull();
    // object type 0 is not a config
    expect(aacSpecificConfig(hexBytes("0188"))).toBeNull();
  });
});

/** The raw AAC frames of an MP4 with one audio track and 32-bit chunk offsets (the fixture). */
function aacFrames(file: Buffer): string[] {
  const find = (start: number, end: number, names: string[]): number => {
    for (let o = start; o + 8 <= end; ) {
      const size = file.readUInt32BE(o);
      if (file.toString("latin1", o + 4, o + 8) === names[0]) {
        return names.length === 1 ? o + 8 : find(o + 8, o + size, names.slice(1));
      }
      o += size;
    }
    throw new Error(`no ${names[0]} box`);
  };
  const stbl = ["moov", "trak", "mdia", "minf", "stbl"];
  const stsz = find(0, file.length, [...stbl, "stsz"]);
  const stco = find(0, file.length, [...stbl, "stco"]);
  const stsc = find(0, file.length, [...stbl, "stsc"]);
  const sizes = Array.from({ length: file.readUInt32BE(stsz + 8) }, (_, i) => file.readUInt32BE(stsz + 12 + i * 4));
  const offsets = Array.from({ length: file.readUInt32BE(stco + 4) }, (_, i) => file.readUInt32BE(stco + 8 + i * 4));
  const runs = Array.from({ length: file.readUInt32BE(stsc + 4) }, (_, i) => ({
    first: file.readUInt32BE(stsc + 8 + i * 12),
    perChunk: file.readUInt32BE(stsc + 12 + i * 12),
  }));
  const frames: string[] = [];
  offsets.forEach((offset, chunk) => {
    const perChunk = runs.filter((r) => chunk + 1 >= r.first).pop()!.perChunk;
    for (let k = 0; k < perChunk && frames.length < sizes.length; k++) {
      const size = sizes[frames.length];
      frames.push(file.subarray(offset, offset + size).toString("base64"));
      offset += size;
    }
  });
  return frames;
}

/** A real one-second 440 Hz tone, as 16-bit mono WAV bytes (base64). */
function wavToneBase64(): string {
  const sampleRate = 16000;
  const bytes = Buffer.alloc(44 + sampleRate * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + sampleRate * 2, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(sampleRate * 2, 40);
  for (let i = 0; i < sampleRate; i++) {
    bytes.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / sampleRate)), 44 + i * 2);
  }
  return bytes.toString("base64");
}

/**
 * A Chrome-like microphone (Opus/WebM by name, a real tone behind it) so publish must encode,
 * and an `AudioEncoder` that answers as WebKit's does: it supports mp4a.40.2, and on flush
 * hands back `frames` at 1024 samples each with `description` on the first chunk.
 */
async function webkitLikeEncoder(page: Page, frames: string[], description: string): Promise<void> {
  await page.addInitScript(
    ({ tone, frames, description }: { tone: string; frames: string[]; description: string }) => {
      const bytesOf = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const toneBytes = bytesOf(tone);
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
      });
      class ChromeLikeRecorder {
        static isTypeSupported(type: string) {
          return type === "audio/webm;codecs=opus" || type === "audio/webm";
        }
        state = "inactive";
        mimeType: string;
        ondataavailable: ((event: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;
        constructor(_stream: unknown, options?: { mimeType?: string }) {
          this.mimeType = options?.mimeType ?? "audio/webm;codecs=opus";
        }
        start() {
          this.state = "recording";
        }
        stop() {
          this.state = "inactive";
          window.setTimeout(() => {
            this.ondataavailable?.({ data: new Blob([toneBytes], { type: this.mimeType }) });
            this.onstop?.();
          }, 150);
        }
      }
      (window as unknown as { MediaRecorder: unknown }).MediaRecorder = ChromeLikeRecorder;

      const descriptionBytes = Uint8Array.from(description.match(/../g) ?? [], (h) => parseInt(h, 16));
      const frameMicros = (1024 * 1_000_000) / 48000;
      class WebKitLikeEncoder {
        static async isConfigSupported(config: AudioEncoderConfig) {
          return { supported: config.codec === "mp4a.40.2", config };
        }
        private init: AudioEncoderInit;
        constructor(init: AudioEncoderInit) {
          this.init = init;
        }
        configure() {}
        encode() {}
        async flush() {
          frames.forEach((frame, i) => {
            const chunk = new EncodedAudioChunk({
              type: "key",
              timestamp: Math.round(i * frameMicros),
              duration: Math.round(frameMicros),
              data: bytesOf(frame),
            });
            this.init.output(
              chunk,
              i === 0
                ? {
                    decoderConfig: {
                      codec: "mp4a.40.2",
                      sampleRate: 48000,
                      numberOfChannels: 1,
                      description: descriptionBytes.buffer,
                    },
                  }
                : {},
            );
          });
        }
        close() {}
      }
      (window as unknown as { AudioEncoder: unknown }).AudioEncoder = WebKitLikeEncoder;
    },
    { tone: wavToneBase64(), frames, description },
  );
}

/** One picture, one take, the parental gate, publish; returns the published take. */
async function publishOneTake(page: Page): Promise<{ url: string; codec: string }> {
  await page.goto("/studio");
  const picture = await page.evaluate(() => {
    const canvas = Object.assign(document.createElement("canvas"), { width: 800, height: 600 });
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fbf7ec";
    ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(200, 150, 400, 300);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: "drawing.png",
    mimeType: "image/png",
    buffer: Buffer.from(picture, "base64"),
  });
  await expect(page.locator('[data-studio="stage-photo"]')).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Record my voice on this page" }).click();
  await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /^Stop( recording$| —)/ }).locator("visible=true").first().click();
  await expect(page.locator(".studio[data-recording='true']")).toHaveCount(0, { timeout: 10000 });
  const closeVoice = page.getByRole("button", { name: "Close Voice" });
  if (await closeVoice.isVisible()) await closeVoice.click();
  await expect(page.getByRole("button", { name: /^Page 1, has voice/ })).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: "Finish my story" }).click();
  const question = page.locator('label[for="studio-gate-answer"]');
  await expect(question).toContainText(/\d+\s*[×x*]\s*\d+/, { timeout: 10000 });
  const [, a, b] = (await question.innerText()).match(/(\d+)\s*[×x*]\s*(\d+)/)!;
  await page.locator("#studio-gate-answer").fill(String(Number(a) * Number(b)));
  await page.locator("#studio-gate-consent").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your tape is ready" })).toBeVisible({ timeout: 60000 });

  return page.evaluate(() => {
    const lib = JSON.parse(localStorage.getItem("ssync-library") ?? "[]");
    const text = lib[0]?.ssyncData?.pages?.[0]?.text ?? {};
    return { url: String(text.audioUrl ?? ""), codec: String(text.audioCodec ?? "") };
  });
}

/** What the published bytes are: how long they decode to, and how many descriptors `esds` holds. */
async function inspect(page: Page, url: string): Promise<{ duration: number; esDescriptors: number; hex: string }> {
  return page.evaluate(async (dataUrl: string) => {
    const bytes = new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
    const hex = Array.from(bytes.slice(0, 4096), (b) => b.toString(16).padStart(2, "0")).join("");
    // the ES_Descriptor header both encoders' files use: tag 3 with a four-byte length
    const esDescriptors = hex.split("03808080").length - 1;
    let duration = 0;
    try {
      const ctx = new OfflineAudioContext(1, 48000, 48000);
      duration = (await ctx.decodeAudioData(bytes.slice().buffer)).duration;
    } catch {
      duration = -1;
    }
    return { duration, esDescriptors, hex };
  }, url);
}

test.describe("AAC description · a WebKit-style encoder publishes AAC that plays", () => {
  test("the ES_Descriptor is unwrapped: the take is AAC, its esds holds one config, it decodes", async ({ page }) => {
    test.setTimeout(120000);
    await webkitLikeEncoder(page, aacFrames(AAC_TONE), WEBKIT_DESCRIPTION);
    const take = await publishOneTake(page);
    expect(take.codec, "the encoder is here, so the take is AAC").toBe("aac");
    expect(take.url).toMatch(/^data:audio\/mp4[;,]/);
    const found = await inspect(page, take.url);
    expect(found.duration, "the published AAC decodes to the second of sound").toBeGreaterThan(0.8);
    expect(found.esDescriptors, "one ES_Descriptor in esds, not one nested in another").toBe(1);
    expect(found.hex, "esds carries the bare config from WebKit's descriptor").toContain(`0580808002${ASC}`);
  });

  test("AAC that will not decode is never published: the take falls back to WAV", async ({ page }) => {
    test.setTimeout(120000);
    // frames of noise under a correct description: a well-formed MP4 with nothing playable in it
    const noise = Array.from({ length: 48 }, (_, i) => Buffer.alloc(64, (i * 37 + 11) & 0xff).toString("base64"));
    await webkitLikeEncoder(page, noise, WEBKIT_DESCRIPTION);
    const take = await publishOneTake(page);
    expect(take.codec, "undecodable AAC is not published as AAC").toBe("wav");
    expect(take.url).toMatch(/^data:audio\/wav[;,]/);
    const found = await inspect(page, take.url);
    expect(found.duration, "the WAV holds the recorded second").toBeGreaterThan(0.8);
  });
});
