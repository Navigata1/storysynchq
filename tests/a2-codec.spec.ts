/**
 * The published-codec rule against Chromium's MP4 (mission P5, C2b; CLAUDE.md section 2).
 *
 * Chromium (126+) accepts "audio/mp4" in MediaRecorder and records Opus inside MP4
 * ("audio/mp4;codecs=opus"). A recorder that preferred a bare "audio/mp4", and a publish that
 * called every MP4 AAC, would publish Opus labelled as AAC, which Safari cannot be relied on to
 * play: the rule says Opus is never valid in a published story. The fixture
 * tests/fixtures/chromium-opus-in-mp4.m4a is such a recording, made by headless Chromium's fake
 * microphone (its test tone; nothing copyrighted).
 *
 *   1. Node-side: the recorder asks for AAC by name, then WebM, and a bare MP4 last; an MP4 is
 *      AAC only when neither its type nor its sample description says Opus.
 *   2. In the Studio: a take recorded as Chromium records MP4 is published as AAC or WAV, its
 *      bytes carry no Opus, and it still decodes to the sound that was recorded.
 */

import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { pickRecordingMime } from "../src/lib/audio/recorder";
import { isPublishCompliant, recordedAsAac } from "../src/lib/audio/transcode";
import { REPO_ROOT } from "./fixtures/tapes";
import { DRAFT_KEY, restoreDraft, studioDraftState } from "./fixtures/helpers";

const OPUS_IN_MP4 = fs.readFileSync(path.join(REPO_ROOT, "tests", "fixtures", "chromium-opus-in-mp4.m4a"));
/** Real AAC-LC in MP4 (ffmpeg's encoder), what Safari's recorder hands back (tests/fixtures/README.md). */
const AAC_TONE = fs.readFileSync(path.join(REPO_ROOT, "tests", "fixtures", "aac-tone.m4a"));

/** The start of an AAC/MP4 file as Safari writes one: ftyp, then a moov whose sample entry is mp4a/esds. */
function aacMp4Head(): Uint8Array {
  const box = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(8 + body.length, 0);
    head.write(type, 4, "latin1");
    return Buffer.concat([head, body]);
  };
  const esds = box("esds", Buffer.alloc(24));
  const mp4a = box("mp4a", Buffer.concat([Buffer.alloc(28), esds]));
  const stsd = box("stsd", Buffer.concat([Buffer.alloc(8), mp4a]));
  return new Uint8Array(Buffer.concat([box("ftyp", Buffer.from("M4A \0\0\0\0isomM4A ", "latin1")), box("moov", stsd)]));
}

/** `MediaRecorder.isTypeSupported` as an engine answers it, for pickRecordingMime in Node. */
function withRecorder(supported: string[], run: () => void) {
  const g = globalThis as unknown as { MediaRecorder?: unknown };
  const before = g.MediaRecorder;
  g.MediaRecorder = { isTypeSupported: (t: string) => supported.includes(t) };
  try {
    run();
  } finally {
    g.MediaRecorder = before;
  }
}

test.describe("codec rule · what the recorder asks for and what publish calls AAC", () => {
  test("the recorder asks for AAC by name before WebM, and a bare MP4 only last", () => {
    // Safari: records AAC in MP4, and says so for the explicit codec
    withRecorder(["audio/mp4", "audio/mp4;codecs=mp4a.40.2"], () =>
      expect(pickRecordingMime()).toBe("audio/mp4;codecs=mp4a.40.2"),
    );
    // Chromium without AAC: says yes to a bare MP4 (it would be Opus), so WebM is taken
    withRecorder(["audio/mp4", "audio/mp4;codecs=opus", "audio/webm;codecs=opus", "audio/webm"], () =>
      expect(pickRecordingMime()).toBe("audio/webm;codecs=opus"),
    );
    // an engine that records MP4 and nothing else still records
    withRecorder(["audio/mp4"], () => expect(pickRecordingMime()).toBe("audio/mp4"));
  });

  test("Chromium's Opus-in-MP4 is not AAC, whatever it is labelled", async () => {
    const blob = new Blob([OPUS_IN_MP4]);
    expect(await recordedAsAac(blob, "audio/mp4;codecs=opus")).toBe(false);
    // labelled as a bare MP4, its sample description still gives it away
    expect(await recordedAsAac(blob, "audio/mp4")).toBe(false);
    expect(await recordedAsAac(new Blob([OPUS_IN_MP4], { type: "audio/mp4" }))).toBe(false);
  });

  test("an AAC/MP4 recording is AAC, and so is a bare MP4 that shows no other codec", async () => {
    expect(await recordedAsAac(new Blob([AAC_TONE]), "audio/mp4")).toBe(true);
    expect(await recordedAsAac(new Blob([AAC_TONE]), "audio/mp4;codecs=mp4a.40.2")).toBe(true);
    expect(await recordedAsAac(new Blob([aacMp4Head() as Uint8Array<ArrayBuffer>]), "audio/mp4")).toBe(true);
    expect(await recordedAsAac(new Blob([aacMp4Head() as Uint8Array<ArrayBuffer>]), "audio/mp4;codecs=mp4a.40.2")).toBe(true);
    expect(await recordedAsAac(new Blob([new Uint8Array([0, 0, 0, 0])]), "audio/mp4")).toBe(true);
    // not MP4 at all
    expect(await recordedAsAac(new Blob([new Uint8Array([0, 0, 0, 0])]), "audio/webm;codecs=opus")).toBe(false);
    expect(await recordedAsAac(new Blob([new Uint8Array([0, 0, 0, 0])]), "audio/wav")).toBe(false);
  });

  test("a type naming Opus is never publish-compliant, MP4 or not", () => {
    expect(isPublishCompliant("audio/mp4;codecs=opus")).toBe(false);
    expect(isPublishCompliant("audio/webm;codecs=opus")).toBe(false);
    expect(isPublishCompliant("audio/ogg")).toBe(false);
    expect(isPublishCompliant("audio/mp4")).toBe(true);
    expect(isPublishCompliant("audio/mp4;codecs=mp4a.40.2")).toBe(true);
    expect(isPublishCompliant("audio/wav")).toBe(true);
  });
});

/**
 * A microphone that records the way Chromium does when only MP4 is offered: it says yes to
 * "audio/mp4" (and to its Opus form), no to WebM, and hands back the real Opus-in-MP4 fixture
 * labelled "audio/mp4;codecs=opus", the type Chromium's recorder reports.
 */
async function chromiumMp4Microphone(page: Page): Promise<void> {
  await page.addInitScript((b64: string) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
    });
    class ChromiumMp4Recorder {
      static isTypeSupported(type: string) {
        return type === "audio/mp4" || type === "audio/mp4;codecs=opus";
      }
      state = "inactive";
      mimeType = "audio/mp4;codecs=opus";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
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
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = ChromiumMp4Recorder;
  }, OPUS_IN_MP4.toString("base64"));
}

async function drawing(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const canvas = Object.assign(document.createElement("canvas"), { width: 800, height: 600 });
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fbf7ec";
    ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = "#3b82f6";
    ctx.fillRect(200, 150, 400, 300);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(b64, "base64");
}

test.describe("codec rule · a take recorded as Chromium's MP4 is published without Opus", () => {
  test("Opus-in-MP4 goes through the draft ladder: AAC or WAV out, no Opus in the bytes, still decodes", async ({ page }) => {
    test.setTimeout(120000);
    await chromiumMp4Microphone(page);
    await page.goto("/studio");

    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: "drawing.png",
      mimeType: "image/png",
      buffer: await drawing(page),
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

    const take = await page.evaluate(() => {
      const lib = JSON.parse(localStorage.getItem("ssync-library") ?? "[]");
      const text = lib[0]?.ssyncData?.pages?.[0]?.text ?? {};
      return { url: String(text.audioUrl ?? ""), codec: String(text.audioCodec ?? "") };
    });
    expect(["aac", "wav"]).toContain(take.codec);
    expect(take.url).toMatch(/^data:audio\/(mp4|wav)[;,]/);
    const found = await page.evaluate(async (url: string) => {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      const text = Array.from(bytes.slice(0, 64 * 1024), (c) => String.fromCharCode(c)).join("");
      const ctx = new OfflineAudioContext(1, 16000, 16000);
      const duration = (await ctx.decodeAudioData(bytes.slice().buffer)).duration;
      return { opus: text.includes("Opus") || text.includes("dOps"), duration };
    }, take.url);
    expect(found.opus, "the published take carries no Opus").toBe(false);
    // the fixture is about 0.58 s of tone
    expect(found.duration).toBeGreaterThan(0.4);
  });
});

/**
 * P6-R1-01: before the codec check, Chromium's Opus-in-MP4 was published labelled "aac". A
 * republish passes a labelled take straight through, so that label must not be trusted
 * blindly: the Studio re-checks the bytes of every take labelled AAC.
 */
test.describe("codec rule · a take an older publish mislabelled AAC is re-checked on republish", () => {
  test("Opus bytes labelled aac are normalized, not passed through", async ({ page }) => {
    test.setTimeout(120000);
    const state = studioDraftState("twinkle", { published: true });
    const opus = `data:audio/mp4;base64,${OPUS_IN_MP4.toString("base64")}`;
    for (const p of state.manifest.pages) {
      p.text = { ...(p.text ?? { content: "" }), audioUrl: opus, audioCodec: "aac" };
      // already levelled, so levelling alone would not send it through the ladder
      state.recordings[String(p.id)] = { mimeType: "audio/mp4", duration: 0.6, levelled: true };
    }
    await page.addInitScript(
      ({ key, json }) => {
        try {
          if (window.sessionStorage.getItem("a2-codec-seeded")) return;
          const draft = JSON.parse(json);
          draft.startedAt = new Date(Date.now() - 600000).toISOString();
          window.localStorage.setItem(key, JSON.stringify({ v: 1, savedAt: new Date().toISOString(), state: draft }));
          window.sessionStorage.setItem("a2-codec-seeded", "1");
        } catch {
          /* about:blank has no storage */
        }
      },
      { key: DRAFT_KEY, json: JSON.stringify(state) },
    );
    await page.goto("/studio");
    await restoreDraft(page);

    await page.getByRole("button", { name: "Finish my story" }).click();
    const question = page.locator('label[for="studio-gate-answer"]');
    await expect(question).toContainText(/\d+\s*[×x*]\s*\d+/, { timeout: 10000 });
    const [, a, b] = (await question.innerText()).match(/(\d+)\s*[×x*]\s*(\d+)/)!;
    await page.locator("#studio-gate-answer").fill(String(Number(a) * Number(b)));
    await page.locator("#studio-gate-consent").check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Your tape is ready" })).toBeVisible({ timeout: 90000 });

    const takes = await page.evaluate(() => {
      const lib = JSON.parse(localStorage.getItem("ssync-library") ?? "[]");
      const pages = lib[lib.length - 1]?.ssyncData?.pages ?? [];
      return pages.map((p: { text?: { audioUrl?: string; audioCodec?: string } }) => ({
        url: String(p.text?.audioUrl ?? ""),
        codec: String(p.text?.audioCodec ?? ""),
      }));
    });
    expect(takes.length).toBeGreaterThan(0);
    for (const [i, take] of takes.entries()) {
      expect(["aac", "wav"], `page ${i + 1}`).toContain(take.codec);
      const opusInside = await page.evaluate(async (url: string) => {
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        const text = Array.from(bytes.slice(0, 64 * 1024), (c) => String.fromCharCode(c)).join("");
        return text.includes("Opus") || text.includes("dOps");
      }, take.url);
      expect(opusInside, `page ${i + 1}: no Opus carried on by the republish`).toBe(false);
    }
  });
});
