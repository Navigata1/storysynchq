/**
 * C2b's judge (archipelago-2 mission, P5; S1 critic K12, K14): the AAC publish path, on a
 * browser that really has a WebCodecs AAC encoder. Collected only under A2_AAC=1, which
 * ops/mission/gates/aac_publish.sh sets after proving the encoder exists (mp4a.40.2), so
 * no test here skips: on a browser without one the gate exits 77 and nothing runs.
 *
 *   1. Chrome's path: the microphone records Opus/WebM (a real tone behind the label), and
 *      publish must transcode every take to AAC (never the WAV fallback, the encoder is
 *      here), pack it as audio/mp4, and the Player must play each take to its end.
 *   2. Safari's path (CLAUDE.md section 6): the recorder negotiates audio/mp4 and hands
 *      back real AAC/MP4 bytes (tests/fixtures/aac-tone.m4a, a 1 s 440 Hz tone made with
 *      ffmpeg's AAC encoder), and the published take must still be AAC that plays.
 *
 * Both run the whole Studio journey: picture, take, the parental gate, publish, the link.
 */

import fs from "fs";
import path from "path";
import { expect, test, type Page } from "@playwright/test";

const PAGES = 2;
const LIBRARY_KEY = "ssync-library";
const AAC_TONE = path.join(__dirname, "fixtures", "aac-tone.m4a");

/** A real one-second 440 Hz tone, as 16-bit mono WAV bytes (base64). */
function wavToneBase64(): string {
  const sampleRate = 16000;
  const samples = sampleRate;
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + samples * 2, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    bytes.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / sampleRate)), 44 + i * 2);
  }
  return bytes.toString("base64");
}

/**
 * A stand-in microphone whose recorder supports only `types` and delivers `audio` (base64)
 * labelled with the negotiated type, the way that browser's MediaRecorder would.
 */
async function fakeMicrophone(page: Page, types: string[], audio: string): Promise<void> {
  await page.addInitScript(
    ({ types, audio }: { types: string[]; audio: string }) => {
      const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
      });
      class FakeRecorder {
        static isTypeSupported(type: string) {
          return types.includes(type);
        }
        state = "inactive";
        mimeType: string;
        ondataavailable: ((event: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;
        constructor(_stream: unknown, options?: { mimeType?: string }) {
          this.mimeType = options?.mimeType ?? types[0];
        }
        start() {
          this.state = "recording";
        }
        stop() {
          this.state = "inactive";
          window.setTimeout(() => {
            this.ondataavailable?.({ data: new Blob([bytes], { type: this.mimeType }) });
            this.onstop?.();
          }, 150);
        }
      }
      (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
    },
    { types, audio },
  );
}

/** A drawing made on a canvas, as PNG bytes; each page gets its own colour. */
async function drawing(page: Page, n: number): Promise<Buffer> {
  const b64 = await page.evaluate((hue) => {
    const canvas = Object.assign(document.createElement("canvas"), { width: 800, height: 600 });
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fbf7ec";
    ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
    ctx.beginPath();
    ctx.arc(400, 300, 200, 0, Math.PI * 2);
    ctx.fill();
    return canvas.toDataURL("image/png").split(",")[1];
  }, n * 110);
  return Buffer.from(b64, "base64");
}

interface PublishedPage {
  text?: { audioUrl?: string; audioCodec?: string };
}

/** Pictures and a take on every page, the gate, publish; returns the link and its pages. */
async function recordAndPublish(page: Page): Promise<{ shareUrl: string; pages: PublishedPage[] }> {
  await page.goto("/studio");
  for (let n = 1; n <= PAGES; n++) {
    const file = { name: `drawing-${n}.png`, mimeType: "image/png", buffer: await drawing(page, n) };
    if (n === 1) {
      await page.locator('input[type="file"][accept="image/*"]').setInputFiles(file);
    } else {
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Snap the next drawing" }).click();
      await (await chooser).setFiles(file);
    }
    await expect(page.locator('[data-studio="stage-photo"]')).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Record my voice on this page" }).click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: /^Stop( recording$| —)/ }).locator("visible=true").first().click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(0, { timeout: 10000 });
    const closeVoice = page.getByRole("button", { name: "Close Voice" });
    if (await closeVoice.isVisible()) await closeVoice.click();
    await expect(page.getByRole("button", { name: new RegExp(`^Page ${n}, has voice`) })).toBeVisible({ timeout: 10000 });
  }

  await page.getByRole("button", { name: "Finish my story" }).click();
  const question = page.locator('label[for="studio-gate-answer"]');
  await expect(question).toContainText(/\d+\s*[×x*]\s*\d+/, { timeout: 10000 });
  const [, a, b] = (await question.innerText()).match(/(\d+)\s*[×x*]\s*(\d+)/)!;
  await page.locator("#studio-gate-answer").fill(String(Number(a) * Number(b)));
  await page.locator("#studio-gate-consent").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your tape is ready" })).toBeVisible({ timeout: 60000 });

  const shareUrl = await page.locator('[data-studio="share-url"]').inputValue();
  expect(shareUrl).toMatch(/\/read\?story=[0-9a-f]{32}$/);
  const published = await page.evaluate((key) => {
    const lib = JSON.parse(localStorage.getItem(key) ?? "[]");
    return lib.map((e: { ssyncData: { pages: unknown[] } }) => e.ssyncData.pages);
  }, LIBRARY_KEY);
  expect(published).toHaveLength(1);
  return { shareUrl, pages: published[0] as PublishedPage[] };
}

/** Every take is AAC in an MP4 container, and decodes to the recorded second of sound. */
async function expectAacTakes(page: Page, pages: PublishedPage[]): Promise<void> {
  expect(pages).toHaveLength(PAGES);
  for (const [i, p] of pages.entries()) {
    expect(p.text?.audioCodec, `page ${i + 1} narration is AAC (the encoder is here: no WAV fallback)`).toBe("aac");
    expect(p.text?.audioUrl ?? "", `page ${i + 1} narration is packed as audio/mp4`).toMatch(/^data:audio\/mp4[;,]/);
  }
  const takes = await page.evaluate(async (urls: string[]) => {
    const ctx = new OfflineAudioContext(1, 48000, 48000);
    const out: Array<{ ftyp: boolean; duration: number }> = [];
    for (const url of urls) {
      const bytes = await (await fetch(url)).arrayBuffer();
      const head = new TextDecoder().decode(new Uint8Array(bytes, 4, 4));
      out.push({ ftyp: head === "ftyp", duration: (await ctx.decodeAudioData(bytes)).duration });
    }
    return out;
  }, pages.map((p) => p.text?.audioUrl ?? ""));
  for (const [i, t] of takes.entries()) {
    expect(t.ftyp, `page ${i + 1} narration starts with an MP4 ftyp box`).toBe(true);
    expect(t.duration, `page ${i + 1} narration decodes to ~1 s`).toBeGreaterThan(0.8);
  }
}

/** Open the link and let the tape play itself through; every take plays to its end. */
async function expectPlaysThrough(page: Page, shareUrl: string): Promise<void> {
  await page.goto(shareUrl);
  const root = page.locator(".pl-root");
  await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
  await page.evaluate(() => {
    // a take counts only when it ends with no media error: the Player turns the page on an
    // error too, so reaching the end card alone proves nothing (S1b K55)
    const heard: string[] = [];
    (window as unknown as { __heard: string[] }).__heard = heard;
    const watched = new WeakSet<HTMLMediaElement>();
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!watched.has(this)) {
        watched.add(this);
        this.addEventListener("ended", () => {
          if (this.error === null && this.duration > 0.5) heard.push(this.currentSrc.slice(0, 40));
        });
      }
      return play.apply(this);
    };
  });
  await page.getByRole("button", { name: /Tap to Begin/ }).click();
  await expect(root).toHaveAttribute("data-view", "page");
  await expect(root, "the tape turns its own pages to the end").toHaveAttribute("data-view", "end", { timeout: 90000 });
  const heard = await page.evaluate(() => (window as unknown as { __heard: string[] }).__heard);
  expect(heard.length, "every page's narration played to its end with no media error").toBeGreaterThanOrEqual(PAGES);
  for (const src of heard) expect(src, "what played is the published AAC").toMatch(/^data:audio\/mp4/);
}

test.describe("a2-aac · the AAC publish path (C2b)", () => {
  test("Chrome's Opus/WebM takes are published as AAC/M4A and play through", async ({ page }) => {
    test.setTimeout(150000);
    await fakeMicrophone(page, ["audio/webm;codecs=opus", "audio/webm"], wavToneBase64());
    const { shareUrl, pages } = await recordAndPublish(page);
    await expectAacTakes(page, pages);
    await expectPlaysThrough(page, shareUrl);
  });

  test("Safari's AAC/MP4 takes stay AAC/M4A when published and play through", async ({ page }) => {
    test.setTimeout(150000);
    await fakeMicrophone(page, ["audio/mp4"], fs.readFileSync(AAC_TONE).toString("base64"));
    const { shareUrl, pages } = await recordAndPublish(page);
    await expectAacTakes(page, pages);
    await expectPlaysThrough(page, shareUrl);
  });
});
