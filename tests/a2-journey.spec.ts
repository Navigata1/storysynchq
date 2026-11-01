/**
 * C1's own judge (archipelago-2 mission, S1b K48): the whole Child Journey in one flow.
 *
 *   an empty Studio → a picture for each page through the camera-first file input →
 *   a voice take recorded on every page → music added with no one asking → Finish my
 *   story → the parental gate (arithmetic + consent) → publish → the share link →
 *   the published tape opened in the Player and played through to its end card
 *   with no key pressed, the narration heard on every page.
 *
 * Fake media only: drawings are made on a canvas, and the microphone is a stand-in
 * that records the way Chrome does (audio/webm;codecs=opus) but hands back a short real
 * tone, so publish must run the real normalization (decode, then AAC or the WAV
 * fallback) and the Player must really decode what was published. A break at any seam
 * (a take not carried into the publish of input-added pictures, a mood not written, a
 * gate skipped, a link that does not open, a page that never advances) fails here.
 */

import { expect, test, type Page } from "@playwright/test";

const PAGES = 3;
const LIBRARY_KEY = "ssync-library";

/** A real one-second 440 Hz tone, as WAV bytes (base64). */
function toneBase64(): string {
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

/** A Chrome-like microphone: negotiates Opus/WebM, delivers a real tone. */
async function chromeLikeMicrophone(page: Page): Promise<void> {
  await page.addInitScript((tone: string) => {
    const bytes = Uint8Array.from(atob(tone), (c) => c.charCodeAt(0));
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
          this.ondataavailable?.({ data: new Blob([bytes], { type: this.mimeType }) });
          this.onstop?.();
        }, 150);
      }
    }
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = ChromeLikeRecorder;
  }, toneBase64());
}

/** A drawing made on a canvas, as PNG bytes; each page gets its own colour. */
async function drawing(page: Page, n: number): Promise<Buffer> {
  const b64 = await page.evaluate((hue) => {
    const canvas = Object.assign(document.createElement("canvas"), { width: 1200, height: 900 });
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fbf7ec";
    ctx.fillRect(0, 0, 1200, 900);
    ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
    ctx.beginPath();
    ctx.arc(600, 450, 300, 0, Math.PI * 2);
    ctx.fill();
    return canvas.toDataURL("image/png").split(",")[1];
  }, n * 110);
  return Buffer.from(b64, "base64");
}

interface PublishedPage {
  illustration?: { url?: string };
  text?: { audioUrl?: string; audioCodec?: string };
  music?: string;
}

test.describe("child journey", () => {
  test("photos in, a take per page, music, gate, publish, play through", async ({ page }) => {
    test.setTimeout(150000);
    await chromeLikeMicrophone(page);
    await page.goto("/studio");

    for (let n = 1; n <= PAGES; n++) {
      // the first page takes its picture from the empty Stage; each next one is snapped
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
      // desktop: the Transport's "Stop recording"; a phone: the Voice sheet's "Stop — m:ss"
      await page.getByRole("button", { name: /^Stop( recording$| —)/ }).locator("visible=true").first().click();
      await expect(page.locator(".studio[data-recording='true']")).toHaveCount(0, { timeout: 10000 });
      // on a phone the Voice sheet stays up over the filmstrip until it is closed
      const closeVoice = page.getByRole("button", { name: "Close Voice" });
      if (await closeVoice.isVisible()) await closeVoice.click();
      await expect(page.getByRole("button", { name: new RegExp(`^Page ${n}, has voice`) })).toBeVisible({ timeout: 10000 });
    }
    await expect(page.getByRole("button", { name: /^Page \d+, has voice/ })).toHaveCount(PAGES);

    // the parental gate stands before publish: arithmetic, then consent for the child's voice
    await page.getByRole("button", { name: "Finish my story" }).click();
    const question = page.locator('label[for="studio-gate-answer"]');
    await expect(question).toContainText(/\d+\s*[×x*]\s*\d+/, { timeout: 10000 });
    const [, a, b] = (await question.innerText()).match(/(\d+)\s*[×x*]\s*(\d+)/)!;
    await page.locator("#studio-gate-answer").fill(String(Number(a) * Number(b)));
    const consent = page.locator("#studio-gate-consent");
    await expect(consent).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
    await consent.check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Your tape is ready" })).toBeVisible({ timeout: 60000 });

    // what was published: every input-added picture, every take normalized, music on every page
    const shareUrl = await page.locator('[data-studio="share-url"]').inputValue();
    expect(shareUrl).toMatch(/\/read\?story=[0-9a-f]{32}$/);
    const published = await page.evaluate((key) => {
      const lib = JSON.parse(localStorage.getItem(key) ?? "[]");
      return lib.map((e: { shareCode: string; ssyncData: { pages: unknown[] } }) => ({ code: e.shareCode, pages: e.ssyncData.pages }));
    }, LIBRARY_KEY);
    expect(published).toHaveLength(1);
    expect(published[0].code).toBe(shareUrl.split("story=")[1]);
    const pages = published[0].pages as PublishedPage[];
    expect(pages).toHaveLength(PAGES);
    for (const [i, p] of pages.entries()) {
      expect(p.illustration?.url, `page ${i + 1} keeps its picture`).toBeTruthy();
      expect(p.text?.audioUrl, `page ${i + 1} keeps its take`).toBeTruthy();
      expect(["aac", "wav"], `page ${i + 1} narration is AAC or WAV, never Opus/WebM`).toContain(p.text?.audioCodec);
      expect(p.text?.audioUrl ?? "").not.toMatch(/^data:audio\/webm/);
      expect(p.music, `page ${i + 1} has music nobody had to add`).toBeTruthy();
    }

    // every published take decodes to the recorded second of sound (S1b K55)
    const durations = await page.evaluate(async (urls: string[]) => {
      const ctx = new OfflineAudioContext(1, 16000, 16000);
      const out: number[] = [];
      for (const url of urls) {
        const bytes = await (await fetch(url)).arrayBuffer();
        out.push((await ctx.decodeAudioData(bytes)).duration);
      }
      return out;
    }, pages.map((p) => p.text?.audioUrl ?? ""));
    for (const [i, d] of durations.entries()) expect(d, `page ${i + 1} narration decodes to ~1 s`).toBeGreaterThan(0.8);

    // the grandparent moment: open the link and let the tape play itself through
    await page.goto(shareUrl);
    const root = page.locator(".pl-root");
    await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
    await page.evaluate(() => {
      // a take counts only when it plays to its end without a media error (S1b K55): the
      // Player turns the page on an error too, so reaching the end card alone proves nothing
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
    const heard = await page.evaluate(() => (window as unknown as { __heard: string[] }).__heard.length);
    expect(heard, "every page's narration played to its end with no media error").toBeGreaterThanOrEqual(PAGES);
  });
});
