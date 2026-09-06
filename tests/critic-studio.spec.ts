// CRITIC PROBE — WP-S (studio hardening + the share loop).
//
// Written blind by the reviewing critic, not by the builder. Everything here is
// an attempt to FALSIFY a bar item from docs/10x-plan.md §3 WP-S, seeded and
// asserted independently of tests/wp-studio.spec.ts:
//
//   · the published tape really is reachable by its own link, and the link is
//     unguessable and marked public-by-link
//   · re-publishing an EDITED story updates the same row (the builder's own
//     test re-publishes an unchanged story, which a broken update path could
//     still survive)
//   · delete-everything kills the row AND the code
//   · consent cannot be submitted past — including with the Enter key
//   · a page that already carries `music` is stripped when music is off, and
//     overwritten with the studio mood when it is on (a "don't add" fix would
//     pass a blank fixture and fail here)
//   · the tape is locked while the mic is live against the KEYBOARD, not only
//     against the disabled buttons
//   · cues actually schedule audio (AudioScheduledSourceNode.start is called)
//   · "Made in m:ss" is computed, not decorative
//   · the downloaded .storysync carries the signature layer and a compliant codec
//
// No fixed sleeps; every wait is an assertion with a timeout.

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { MOOD_NAMES } from "../src/lib/audio/moods";

const DRAFT_KEY = "ssync-studio-draft";
const LIBRARY_KEY = "ssync-library";
const TITLE = "Bo and the Blue Moon";

/* --------------------------------------------------------------- fixtures */

/** A real 8 kHz WAV — publish must treat it as already-compliant narration. */
function wavDataUrl(): string {
  const rate = 8000;
  const n = 320;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(5000 * Math.sin((2 * Math.PI * 330 * i) / rate)), 44 + i * 2);
  }
  return `data:audio/wav;base64,${buf.toString("base64")}`;
}

interface Seed {
  narration?: boolean;
  musicOn?: boolean;
  /** Mood the studio is set to. */
  mood?: string;
  /** A mood ALREADY on the pages of the draft — the thing publish must overwrite. */
  pageMusic?: string;
  startedAgoS?: number;
}

function draft(seed: Seed = {}): string {
  const {
    narration = true,
    musicOn = true,
    mood = "Calm",
    pageMusic = "Rain",
    startedAgoS = 92,
  } = seed;
  const created = new Date().toISOString();
  const page = (id: number, text: string, voice: boolean) => ({
    id,
    layout: "image-top",
    illustration: { alt: "" },
    music: pageMusic,
    text: { content: text, wordHighlight: true, ...(voice ? { audioUrl: wavDataUrl() } : {}) },
    timing: { autoPause: "2s" },
  });
  return JSON.stringify({
    v: 1,
    savedAt: created,
    state: {
      manifest: {
        version: "2.0",
        metadata: { title: TITLE, author: "", language: "en", created },
        settings: {
          autoPlay: true,
          pageTransition: "fade",
          readAlongHighlight: true,
          pageTurnSound: true,
          accessibility: { timingMultiplier: 1 },
        },
        pages: [
          page(1, "Bo could not sleep, so the moon came down.", narration),
          page(2, "They walked to the end of the garden together.", false),
        ],
      },
      recordings: narration ? { "1": { mimeType: "audio/wav", duration: 2.6 } } : {},
      mood,
      musicOn,
      musicVolume: 0.3,
      narrationVolume: 0.85,
      published: null,
      publishedIds: [],
      startedAt: new Date(Date.now() - startedAgoS * 1000).toISOString(),
    },
  });
}

async function seed(page: Page, options: Seed = {}): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* the assertions are about the app, not about storage */
      }
    },
    [DRAFT_KEY, draft(options)] as [string, string],
  );
}

/** Count real scheduled sound: every AudioScheduledSourceNode.start() call. */
async function countStarts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __starts: number };
    w.__starts = 0;
    const protos = [
      (window as unknown as { AudioScheduledSourceNode?: { prototype: object } })
        .AudioScheduledSourceNode?.prototype,
      (window as unknown as { OscillatorNode?: { prototype: object } }).OscillatorNode?.prototype,
      (window as unknown as { AudioBufferSourceNode?: { prototype: object } }).AudioBufferSourceNode
        ?.prototype,
    ].filter(Boolean) as Array<Record<string, unknown>>;
    for (const proto of protos) {
      if (!Object.prototype.hasOwnProperty.call(proto, "start")) continue;
      const original = proto.start as (...args: unknown[]) => unknown;
      proto.start = function patched(this: unknown, ...args: unknown[]) {
        w.__starts += 1;
        return original.apply(this, args);
      };
    }
  });
}

const starts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __starts: number }).__starts);

/** A microphone that always works, so the probe is about the studio's logic. */
async function fakeMic(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
    });
    class FakeRecorder {
      static isTypeSupported(type: string) {
        return type === "audio/mp4";
      }
      state = "inactive";
      mimeType: string;
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor(_stream: unknown, options?: { mimeType?: string }) {
        this.mimeType = options?.mimeType ?? "audio/mp4";
      }
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        window.setTimeout(() => {
          this.ondataavailable?.({ data: new Blob([new Uint8Array([9, 9])], { type: this.mimeType }) });
          this.onstop?.();
        }, 120);
      }
    }
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
  });
}

interface Entry {
  id: string;
  title: string;
  isPublic: boolean;
  shareCode?: string;
  ssyncData: {
    metadata: { title: string };
    signature?: {
      shareUrl?: string;
      ownership?: string;
      voiceConsent?: Array<{ voice: string; grantedBy: string; date?: string }>;
    };
    pages: Array<{ music?: string; text?: { audioUrl?: string; audioCodec?: string } }>;
  };
}

const library = (page: Page): Promise<Entry[]> =>
  page.evaluate((key) => {
    try {
      return JSON.parse(window.localStorage.getItem(key) || "[]") as Entry[];
    } catch {
      return [] as Entry[];
    }
  }, LIBRARY_KEY);

async function openStudio(page: Page): Promise<void> {
  await page.goto("/studio");
  await page.getByRole("button", { name: "Keep working on it" }).click({ timeout: 20000 });
  await expect(page.getByRole("button", { name: "Finish my story" })).toBeVisible();
}

/** Solve the arithmetic gate. Returns the dialog locator for further probing. */
async function answerGate(page: Page): Promise<void> {
  const question = page.locator('label[for="studio-gate-answer"]');
  await expect(question).toBeVisible({ timeout: 15000 });
  await expect(question).toContainText(/\d+\s*[×x*]\s*\d+/);
  const text = await question.innerText();
  const m = text.match(/(\d+)\s*[×x*]\s*(\d+)/);
  expect(m, `expected arithmetic, got "${text}"`).not.toBeNull();
  await page.locator("#studio-gate-answer").fill(String(Number(m![1]) * Number(m![2])));
}

async function finish(page: Page, consent: boolean): Promise<void> {
  await page.getByRole("button", { name: "Finish my story" }).click();
  await answerGate(page);
  if (consent) await page.locator("#studio-gate-consent").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your tape is ready" })).toBeVisible({
    timeout: 25000,
  });
}

/* ------------------------------------------------------------------ probes */

test.describe("CRITIC · WP-S share loop", () => {
  test("the link is unguessable, public-by-link, and opens the tape", async ({ page }) => {
    test.setTimeout(90000);
    await seed(page);
    await openStudio(page);
    await finish(page, true);

    const url = await page.locator('[data-studio="share-url"]').inputValue();
    const code = url.split("story=")[1];
    // 128 bits of hex — a code a stranger cannot type their way into.
    expect(code).toMatch(/^[0-9a-f]{32}$/);

    const entries = await library(page);
    expect(entries).toHaveLength(1);
    expect(entries[0].isPublic, "unlisted-by-URL still needs is_public").toBe(true);
    expect(entries[0].shareCode).toBe(code);
    expect(entries[0].ssyncData.signature?.shareUrl).toBe(url);

    // "Made in m:ss" is computed from the draft's own start time (92 s ago),
    // not a decoration: it must land in a believable window.
    const made = await page.locator('[data-studio="made-in"]').innerText();
    const clock = made.match(/(\d+):([0-5]\d)/);
    expect(clock, `expected a clock in "${made}"`).not.toBeNull();
    const seconds = Number(clock![1]) * 60 + Number(clock![2]);
    expect(seconds).toBeGreaterThanOrEqual(90);
    expect(seconds).toBeLessThan(400);

    // The QR is a real raster of the link, big enough to point a camera at.
    const qr = page.locator('[data-studio="share-qr"]');
    await expect(qr).toBeVisible();
    const src = await qr.getAttribute("src");
    expect(src).toMatch(/^data:image\/png;base64,/);
    expect((src ?? "").length).toBeGreaterThan(1200);
    const box = await qr.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(120);

    // The Register-B tape label prints in over 900 ms; disable animations so the
    // capture is the finished card, then prove the label really is there.
    await expect(page.getByText(/SIDE A · 2 PAGES/)).toBeVisible();
    await page.screenshot({
      path: "tests/screenshots/critic-studio-publish-desktop.png",
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('[data-studio="share-qr"]')).toBeVisible();
    await page.screenshot({
      path: "tests/screenshots/critic-studio-publish-mobile.png",
      animations: "disabled",
    });

    // The grandparent moment, from the link alone.
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(url);
    await expect(page.getByText("We couldn't find that tape")).toHaveCount(0);
    await expect(page.getByText(TITLE).first()).toBeVisible({ timeout: 20000 });
  });

  test("an EDITED re-publish updates the same tape, and delete-all revokes it", async ({ page }) => {
    test.setTimeout(120000);
    await seed(page);
    await openStudio(page);
    await finish(page, true);

    const first = await library(page);
    expect(first).toHaveLength(1);
    const { id, shareCode } = first[0];

    // Change the story between publishes: an update path that silently no-ops
    // would keep one row but ship stale content, and that must fail here.
    await page.getByRole("button", { name: "Back to the studio" }).click();
    await page.locator("#studio-title").fill("Bo and the Blue Moon, Again");
    await finish(page, true);

    const second = await library(page);
    expect(second, "re-publish must not orphan a copy").toHaveLength(1);
    expect(second[0].id).toBe(id);
    expect(second[0].shareCode).toBe(shareCode);
    expect(second[0].ssyncData.metadata.title).toBe("Bo and the Blue Moon, Again");
    expect(second[0].title).toBe("Bo and the Blue Moon, Again");

    await page.getByRole("button", { name: /^Delete everything$/ }).click();
    await page.getByRole("button", { name: /Tap again to delete everything/ }).click();
    await expect(page.getByRole("button", { name: "Finish my story" })).toBeVisible();
    expect(await library(page)).toHaveLength(0);

    await page.goto(`/read?story=${shareCode}`);
    await expect(page.getByText("We couldn't find that tape")).toBeVisible({ timeout: 20000 });
  });

  test("consent cannot be pressed past — Enter included", async ({ page }) => {
    test.setTimeout(90000);
    await seed(page, { narration: true });
    await openStudio(page);

    await page.getByRole("button", { name: "Finish my story" }).click();
    await answerGate(page);

    const dialog = page.getByRole("dialog", { name: "A grown-up moment" });
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
    // Submitting the form with Enter bypasses a disabled button in the DOM.
    await page.locator("#studio-gate-answer").press("Enter");
    await expect(dialog, "the gate must not pass without consent").toBeVisible();
    expect(await library(page)).toHaveLength(0);

    await page.locator("#studio-gate-consent").check();
    await page.locator("#studio-gate-answer").press("Enter");
    await expect(page.getByRole("heading", { name: "Your tape is ready" })).toBeVisible({
      timeout: 25000,
    });

    const entry = (await library(page))[0];
    const consent = entry.ssyncData.signature?.voiceConsent;
    expect(consent).toHaveLength(1);
    expect(consent![0].grantedBy).toBe("parent/guardian");
    expect(Number.isFinite(Date.parse(consent![0].date ?? ""))).toBe(true);
    expect(entry.ssyncData.signature?.ownership).toMatch(/©/);
  });

  test("music off strips an existing page.music; music on writes the shared mood", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90000);
    // Both drafts already carry music:"Rain" on every page.
    await seed(page, { narration: false, musicOn: false });
    await openStudio(page);
    await finish(page, false);

    for (const p of (await library(page))[0].ssyncData.pages) {
      expect(Object.prototype.hasOwnProperty.call(p, "music"), "music off must delete page.music").toBe(
        false,
      );
    }
    const firstQr = await page.locator('[data-studio="share-qr"]').getAttribute("src");

    // Same story, music on, studio mood "Calm" — the studio's choice wins over
    // whatever the draft's pages said, and it must be a shared-vocabulary name.
    // A fresh context, not a second tab: two studio tabs share one draft key and
    // would overwrite each other's autosave.
    const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
    const second = await context.newPage();
    await seed(second, { narration: false, musicOn: true, mood: "Calm" });
    await openStudio(second);
    await finish(second, false);
    for (const p of (await library(second))[0].ssyncData.pages) {
      expect(p.music).toBe("Calm");
      expect(MOOD_NAMES).toContain(p.music!);
    }

    // Two tapes, two links, two different QR rasters: the code is generated
    // from the share URL, it is not a decorative fixed image.
    const secondQr = await second.locator('[data-studio="share-qr"]').getAttribute("src");
    expect(secondQr).toMatch(/^data:image\/png;base64,/);
    expect(secondQr).not.toBe(firstQr);
    await context.close();
  });

  test("the .storysync file carries the signature layer and a compliant codec", async ({ page }) => {
    test.setTimeout(90000);
    await seed(page);
    await openStudio(page);
    await finish(page, true);

    const shareUrl = await page.locator('[data-studio="share-url"]').inputValue();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download the .storysync file" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.storysync$/);

    const path = await file.path();
    const zip = unzipSync(new Uint8Array(readFileSync(path)));
    expect(Object.keys(zip)).toContain("manifest.json");
    const manifest = JSON.parse(strFromU8(zip["manifest.json"])) as {
      signature?: { voiceConsent?: unknown[]; ownership?: string; shareUrl?: string };
      pages: Array<{ text?: { audioUrl?: string; audioCodec?: string } }>;
    };
    expect(manifest.signature?.voiceConsent).toHaveLength(1);
    expect(manifest.signature?.ownership).toBeTruthy();
    expect(manifest.signature?.shareUrl).toBe(shareUrl);

    const audio = manifest.pages[0].text?.audioUrl ?? "";
    expect(audio).toMatch(/^assets\/narration-1\.(m4a|wav)$/);
    expect(Object.keys(zip)).toContain(audio);
    expect(zip[audio].byteLength).toBeGreaterThan(64);
    // The published codec rule: AAC/M4A, WAV only as the permitted fallback.
    expect(["aac", "wav"]).toContain(manifest.pages[0].text?.audioCodec);
  });
});

test.describe("CRITIC · WP-S child-flow", () => {
  test("the keyboard cannot turn the page while the mic is live", async ({ page }) => {
    test.setTimeout(90000);
    await countStarts(page);
    await fakeMic(page);
    await seed(page, { narration: false });
    await openStudio(page);

    const readout = page.locator("section[aria-label='Transport']");
    await expect(readout).toContainText("pg 1/2");

    const before = await starts(page);
    await page.locator('[data-sk="transport"][data-kind="rec"]').click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);
    // A cue is a sound, not a CSS class: something must have been scheduled.
    await expect.poll(() => starts(page), { timeout: 5000 }).toBeGreaterThan(before);

    // Blur the button so the global handler is the thing under test, then try
    // every way a page could move.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(readout, "the tape must not move mid-take").toContainText("pg 1/2");

    const beforeStop = await starts(page);
    await page.getByRole("button", { name: /^Stop —/ }).click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(0, { timeout: 15000 });
    // Stopping has its own cue — "got it" — not just the start of the take.
    await expect.poll(() => starts(page), { timeout: 5000 }).toBeGreaterThan(beforeStop);

    // The take is filed against the page it was started on.
    await expect(page.getByRole("button", { name: /^Page 1, has voice/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Page 2, has voice/ })).toHaveCount(0);
  });

  test("the meter does not re-serialize the manifest while the mic is live", async ({ page }) => {
    test.setTimeout(60000);
    // G5: the inspector used to JSON.stringify a multi-megabyte manifest on
    // every meter frame. Count every large serialization the page performs.
    await page.addInitScript(() => {
      const w = window as unknown as { __big: number };
      w.__big = 0;
      const original = JSON.stringify;
      JSON.stringify = function patched(this: unknown, ...args: unknown[]) {
        const out = (original as (...a: unknown[]) => unknown).apply(JSON, args);
        if (typeof out === "string" && out.length > 1200) w.__big += 1;
        return out;
      } as typeof JSON.stringify;
    });
    await fakeMic(page);
    await seed(page, { narration: true });
    await openStudio(page);

    // Advanced mode mounts the inspector, the meter and the manifest readouts.
    await page.locator('[data-sk="mode"]').first().click();
    await expect(page.locator("#insp-autopause")).toBeVisible();

    const big = () => page.evaluate(() => (window as unknown as { __big: number }).__big);
    await page.locator('[data-sk="transport"][data-kind="rec"]').click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);
    const before = await big();
    // Let the meter and the seconds readout run for ~2 s of real frames.
    await expect(page.locator("section[aria-label='Transport']")).toContainText(/● 0:0[2-9]/, {
      timeout: 8000,
    });
    expect(await big(), "the manifest must not be re-serialized per frame").toBeLessThanOrEqual(
      before + 3,
    );
    await page.getByRole("button", { name: /^Stop —/ }).click();
  });

  test("turning the page schedules a real cue", async ({ page }) => {
    await countStarts(page);
    await seed(page, { narration: false });
    await openStudio(page);

    const before = await starts(page);
    await page.locator('[data-sk="transport"][data-kind="next"]').click();
    await expect(page.locator("section[aria-label='Transport']")).toContainText("pg 2/2");
    await expect.poll(() => starts(page), { timeout: 5000 }).toBeGreaterThan(before);
  });

  test("Space on the finish button presses it instead of starting playback", async ({ page }) => {
    await seed(page, { narration: false });
    await openStudio(page);

    const finishButton = page.getByRole("button", { name: "Finish my story" });
    await finishButton.focus();
    await page.keyboard.press(" ");
    await expect(page.getByRole("dialog", { name: "A grown-up moment" })).toBeVisible();
    await expect(page.locator('[data-sk="transport"][data-kind="pause"]')).toHaveCount(0);
  });
});
