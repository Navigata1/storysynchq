// WP-S — Studio hardening + the share loop that works.
//
// The bar (docs/10x-plan.md §3 WP-S) proved in a browser, against the
// localStorage fallback (NEXT_PUBLIC_SUPABASE_* is unset in this environment,
// which is exactly the honest offline path a critic can reproduce):
//
//   · publish → share code → /read?story=<code> opens the tape
//   · re-publish leaves exactly one library entry
//   · delete-all leaves zero entries and revokes the code
//   · consent is recorded in the manifest when narration exists
//   · Space on a focused "Finish my story" activates it, never playback
//   · a take started on page 1 lands on page 1 after switching pages
//   · music off deletes page.music; music on writes the shared mood name
//   · QR, "Made in m:ss", page-turn/record cues, "450ms" parsing, the
//     autosave warning at phone width, cover image not duplicated

import { test, expect, type Page } from "@playwright/test";

const DRAFT_KEY = "ssync-studio-draft";
const LIBRARY_KEY = "ssync-library";
const STORY_TITLE = "Nina and the Night Bus";

/* ------------------------------------------------------------------ fixtures */

/** A real (tiny) WAV — publish treats it as already-compliant narration. */
function wavDataUrl(): string {
  const sampleRate = 8000;
  const samples = 400;
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
    bytes.writeInt16LE(Math.round(6000 * Math.sin((2 * Math.PI * 440 * i) / sampleRate)), 44 + i * 2);
  }
  return `data:audio/wav;base64,${bytes.toString("base64")}`;
}

interface SeedOptions {
  narration?: boolean;
  musicOn?: boolean;
  /** How long ago the story was started — drives "Made in m:ss". */
  startedAgoS?: number;
  autoPause?: string;
  /** Give both pages the same picture, to prove the cover is not duplicated. */
  picture?: string;
  /** What the recorder claims the take is — Chrome says Opus/WebM. */
  draftMime?: string;
}

function draftEnvelope(options: SeedOptions = {}): string {
  const {
    narration = true,
    musicOn = true,
    startedAgoS = 92,
    autoPause = "2s",
    picture,
    draftMime = "audio/wav",
  } = options;
  const created = new Date().toISOString();
  return JSON.stringify({
    v: 1,
    savedAt: created,
    state: {
      manifest: {
        version: "2.0",
        metadata: { title: STORY_TITLE, author: "", language: "en", created },
        settings: {
          autoPlay: true,
          pageTransition: "fade",
          readAlongHighlight: true,
          pageTurnSound: true,
          accessibility: { timingMultiplier: 1 },
        },
        pages: [
          {
            id: 1,
            layout: "image-top",
            illustration: picture ? { url: picture, alt: "A bus at night" } : { alt: "" },
            text: {
              content: "The night bus stopped outside Nina's window.",
              wordHighlight: true,
              ...(narration ? { audioUrl: wavDataUrl() } : {}),
            },
            timing: { autoPause },
          },
          {
            id: 2,
            layout: "image-top",
            illustration: picture ? { url: picture, alt: "A bus at night" } : { alt: "" },
            text: { content: "Nobody was driving it, so Nina did.", wordHighlight: true },
            timing: { autoPause: "2s" },
          },
        ],
      },
      recordings: narration ? { "1": { mimeType: draftMime, duration: 3.4 } } : {},
      mood: "Hush",
      musicOn,
      musicVolume: 0.3,
      narrationVolume: 0.85,
      published: null,
      publishedIds: [],
      startedAt: new Date(Date.now() - startedAgoS * 1000).toISOString(),
    },
  });
}

async function seedDraft(page: Page, options: SeedOptions = {}): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* the test asserts on what the app does, not on storage */
      }
    },
    [DRAFT_KEY, draftEnvelope(options)] as [string, string],
  );
}

/** Count every synthesized node, so a "cue" cannot be claimed without sound. */
async function countAudioNodes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __audioNodes: number; AudioContext?: typeof AudioContext };
    w.__audioNodes = 0;
    const proto = w.AudioContext?.prototype as unknown as Record<string, unknown> | undefined;
    if (!proto) return;
    for (const method of ["createOscillator", "createBufferSource"]) {
      const original = proto[method] as (...args: unknown[]) => unknown;
      proto[method] = function patched(this: unknown, ...args: unknown[]) {
        w.__audioNodes += 1;
        return original.apply(this, args);
      };
    }
  });
}

/** A deterministic microphone: no fake device flags, no permission prompts. */
async function stubMicrophone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
      },
    });
    class FakeMediaRecorder {
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
        // Asynchronous, like the real thing: the take is only filed once the
        // blob arrives, which is precisely when a page could have changed.
        window.setTimeout(() => {
          this.ondataavailable?.({
            data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: this.mimeType }),
          });
          this.onstop?.();
        }, 150);
      }
    }
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeMediaRecorder;
  });
}

/* -------------------------------------------------------------------- flow */

async function openSeededStudio(page: Page): Promise<void> {
  await page.goto("/studio");
  await page.getByRole("button", { name: "Keep working on it" }).click({ timeout: 15000 });
  await expect(page.locator('[data-sk="transport"]').first()).toBeVisible();
}

async function passGate(page: Page, expectConsent: boolean): Promise<void> {
  const question = page.locator('label[for="studio-gate-answer"]');
  await expect(question).toBeVisible({ timeout: 10000 });
  // The challenge is minted after mount; wait for the digits, not the "…".
  await expect(question).toContainText(/\d+\s*[×x*]\s*\d+/);
  const text = await question.innerText();
  const match = text.match(/(\d+)\s*[×x*]\s*(\d+)/);
  expect(match, `gate question should be arithmetic, got "${text}"`).not.toBeNull();
  const answer = Number(match![1]) * Number(match![2]);

  await page.locator("#studio-gate-answer").fill(String(answer));

  const consent = page.locator("#studio-gate-consent");
  if (expectConsent) {
    await expect(consent).toBeVisible();
    // Consent is not optional when a child's voice is in the tape.
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
    await consent.check();
  } else {
    await expect(consent).toHaveCount(0);
  }

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your tape is ready" })).toBeVisible({
    timeout: 20000,
  });
}

interface LibraryEntry {
  id: string;
  isPublic: boolean;
  shareCode?: string;
  ssyncData: {
    metadata: { title: string; coverImage?: string };
    signature?: {
      shareUrl?: string;
      ownership?: string;
      voiceConsent?: Array<{ voice: string; grantedBy: string; date?: string }>;
    };
    pages: Array<{ music?: string; text?: { audioUrl?: string; audioCodec?: string } }>;
  };
}

async function readLibrary(page: Page): Promise<LibraryEntry[]> {
  return page.evaluate((key) => {
    try {
      return JSON.parse(window.localStorage.getItem(key) || "[]") as LibraryEntry[];
    } catch {
      return [] as LibraryEntry[];
    }
  }, LIBRARY_KEY);
}

/* ------------------------------------------------------------------- tests */

test.describe("WP-S · the share loop", () => {
  test("publish mints an unlisted link that /read?story= actually opens", async ({ page }) => {
    await seedDraft(page);
    await openSeededStudio(page);

    await page.getByRole("button", { name: "Finish my story" }).click();
    await passGate(page, true);

    /* the card: link, QR, made-in */
    const shareInput = page.locator('[data-studio="share-url"]');
    await expect(shareInput).toBeVisible();
    const shareUrl = await shareInput.inputValue();
    expect(shareUrl).toMatch(/\/read\?story=[0-9a-f]{16,}$/);

    const qr = page.locator('[data-studio="share-qr"]');
    await expect(qr).toBeVisible();
    expect(await qr.getAttribute("src")).toMatch(/^data:image\/png;base64,/);

    await expect(page.locator('[data-studio="made-in"]')).toHaveText(/Made in \d+:[0-5]\d/);
    expect(await page.locator('[data-studio="made-in"]').innerText()).not.toMatch(/0:00/);

    /* the stored tape: public-by-link, consent recorded, mood written */
    const library = await readLibrary(page);
    expect(library).toHaveLength(1);
    const entry = library[0];
    expect(entry.isPublic).toBe(true);
    expect(entry.shareCode).toBe(shareUrl.split("story=")[1]);

    const consent = entry.ssyncData.signature?.voiceConsent;
    expect(consent).toHaveLength(1);
    expect(consent![0].grantedBy).toBe("parent/guardian");
    expect(consent![0].date).toBeTruthy();
    expect(entry.ssyncData.signature?.ownership).toBeTruthy();
    expect(entry.ssyncData.signature?.shareUrl).toBe(shareUrl);
    expect(entry.ssyncData.pages[0].music).toBe("Hush");
    expect(entry.ssyncData.pages[0].text?.audioCodec).toBe("wav");

    /* the grandparent moment */
    await page.goto(shareUrl);
    await expect(page.getByText("We couldn't find that tape")).toHaveCount(0);
    await expect(page.getByText(STORY_TITLE).first()).toBeVisible({ timeout: 15000 });
  });

  test("re-publishing updates the same tape; delete-all leaves nothing", async ({ page }) => {
    await seedDraft(page);
    await openSeededStudio(page);

    await page.getByRole("button", { name: "Finish my story" }).click();
    await passGate(page, true);
    const first = await readLibrary(page);
    expect(first).toHaveLength(1);
    const firstId = first[0].id;
    const firstCode = first[0].shareCode;

    /* back into the studio and finish again */
    await page.getByRole("button", { name: "Back to the studio" }).click();
    await page.getByRole("button", { name: "Finish my story" }).click();
    await passGate(page, true);

    const second = await readLibrary(page);
    expect(second, "a re-publish must not orphan a second copy").toHaveLength(1);
    expect(second[0].id).toBe(firstId);
    expect(second[0].shareCode).toBe(firstCode);

    /* one tap wipes it everywhere */
    const deleteButton = page.getByRole("button", { name: /Delete everything/ });
    await deleteButton.click();
    await page.getByRole("button", { name: /Tap again to delete everything/ }).click();
    await expect(page.getByRole("button", { name: "Finish my story" })).toBeVisible();

    expect(await readLibrary(page)).toHaveLength(0);

    await page.goto(`/read?story=${firstCode}`);
    await expect(page.getByText("We couldn't find that tape")).toBeVisible({ timeout: 15000 });
  });

  test("the share sheet and the .storysync download both carry the finished tape", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: unknown) => {
          (window as unknown as { __shared?: unknown }).__shared = data;
        },
      });
    });
    await seedDraft(page, { narration: false });
    await openSeededStudio(page);

    await page.getByRole("button", { name: "Finish my story" }).click();
    await passGate(page, false);

    const shareUrl = await page.locator('[data-studio="share-url"]').inputValue();
    await page.getByRole("button", { name: "Share the link…" }).click();
    const shared = await page.evaluate(
      () => (window as unknown as { __shared?: { url?: string; title?: string } }).__shared,
    );
    expect(shared?.url).toBe(shareUrl);
    expect(shared?.title).toBe(STORY_TITLE);

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download the .storysync file" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.storysync$/);
  });

  test("a device that is out of room says so — and never blames it on anything else", async ({
    page,
  }) => {
    await seedDraft(page, { narration: false });
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function patched(key: string, value: string) {
        if (key === "ssync-library") throw new DOMException("no room", "QuotaExceededError");
        return original.call(this, key, value);
      };
    });
    await openSeededStudio(page);

    await page.getByRole("button", { name: "Finish my story" }).click();
    await passGate(page, false);

    await expect(page.getByText(/out of room/i)).toBeVisible();
    // The tape is never lost: the file is still there to take away.
    await expect(page.getByRole("button", { name: "Download the .storysync file" })).toBeVisible();
    expect(await readLibrary(page)).toHaveLength(0);
  });

  test("narration normalized once is never decoded again on a re-publish", async ({ page }) => {
    // Count every decode: transcode.ts builds an OfflineAudioContext to probe
    // and to render, so a second pass over compliant audio is impossible to hide.
    await page.addInitScript(() => {
      const w = window as unknown as {
        __decodes: number;
        OfflineAudioContext: typeof OfflineAudioContext;
      };
      w.__decodes = 0;
      const Original = w.OfflineAudioContext;
      const Patched = function (this: unknown, ...args: unknown[]) {
        w.__decodes += 1;
        return new (Original as unknown as new (...a: unknown[]) => object)(...args);
      } as unknown as typeof OfflineAudioContext;
      Patched.prototype = Original.prototype;
      w.OfflineAudioContext = Patched;
    });
    // The draft claims a draft codec (what Chrome records) over WAV bytes, so
    // the first publish really does transcode.
    await seedDraft(page, { narration: true, draftMime: "audio/webm;codecs=opus" });
    await openSeededStudio(page);

    await page.getByRole("button", { name: "Finish my story" }).click();
    await passGate(page, true);
    const first = await page.evaluate(() => (window as unknown as { __decodes: number }).__decodes);
    expect(first, "the first publish must actually normalize the take").toBeGreaterThan(0);

    await page.getByRole("button", { name: "Back to the studio" }).click();
    await page.getByRole("button", { name: "Finish my story" }).click();
    await passGate(page, true);
    const second = await page.evaluate(() => (window as unknown as { __decodes: number }).__decodes);
    expect(second, "already-normalized narration must pass straight through").toBe(first);

    const library = await readLibrary(page);
    expect(library[0].ssyncData.pages[0].text?.audioCodec).toBeTruthy();
  });

  test("music off deletes page.music from the published tape", async ({ page }) => {
    await seedDraft(page, { musicOn: false, narration: false });
    await openSeededStudio(page);

    await page.getByRole("button", { name: "Finish my story" }).click();
    await passGate(page, false);

    const library = await readLibrary(page);
    expect(library).toHaveLength(1);
    for (const storyPage of library[0].ssyncData.pages) {
      expect(Object.prototype.hasOwnProperty.call(storyPage, "music")).toBe(false);
    }
  });

  test("a repeated first illustration is not copied into metadata.coverImage", async ({ page }) => {
    const picture =
      "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";
    await seedDraft(page, { narration: false, picture });
    await openSeededStudio(page);

    await page.getByRole("button", { name: "Finish my story" }).click();
    await passGate(page, false);

    const library = await readLibrary(page);
    expect(library[0].ssyncData.metadata.coverImage).toBeUndefined();
  });
});

test.describe("WP-S · child-flow correctness", () => {
  test("Space on a focused Finish my story presses it and never starts playback", async ({
    page,
  }) => {
    await seedDraft(page, { narration: false });
    await openSeededStudio(page);

    const finish = page.getByRole("button", { name: "Finish my story" });
    await finish.focus();
    await page.keyboard.press(" ");

    // The button did its job…
    await expect(page.getByRole("dialog", { name: "A grown-up moment" })).toBeVisible();
    // …and playback was not hijacked behind the dialog.
    await expect(page.locator('[data-sk="transport"][data-kind="pause"]')).toHaveCount(0);
  });

  test("a take started on page 1 lands on page 1, and the tape is locked while recording", async ({
    page,
  }) => {
    await countAudioNodes(page);
    await stubMicrophone(page);
    await seedDraft(page, { narration: false });
    await openSeededStudio(page);

    const rec = page.locator('[data-sk="transport"][data-kind="rec"]');
    const next = page.locator('[data-sk="transport"][data-kind="next"]');
    const strip = page.getByRole("button", { name: /^Page \d/ });

    const beforeCue = await page.evaluate(
      () => (window as unknown as { __audioNodes: number }).__audioNodes,
    );
    await rec.click();
    // Record start is confirmed by ear, not just by a red dot.
    await expect
      .poll(
        () => page.evaluate(() => (window as unknown as { __audioNodes: number }).__audioNodes),
        { timeout: 5000 },
      )
      .toBeGreaterThan(beforeCue);
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);

    // Nav is locked: the take belongs to the page it was started on.
    await expect(next).toBeDisabled();
    await expect(strip.nth(1)).toBeDisabled();

    // Stop from the Voice panel's big red button — the control a child aims
    // at, and the one on top of the transport on a phone.
    await page.getByRole("button", { name: /^Stop —/ }).click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(0, { timeout: 10000 });

    // Page 1 got the voice…
    await expect(page.getByRole("button", { name: /^Page 1, has voice/ })).toBeVisible();
    // …and switching pages afterwards does not move it.
    await page.getByRole("button", { name: "Close Voice" }).click();
    await page.getByRole("button", { name: /^Page 2/ }).click();
    await expect(page.getByRole("button", { name: /^Page 1, has voice/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Page 2, has voice/ })).toHaveCount(0);
  });

  test("turning the page makes a sound", async ({ page }) => {
    await countAudioNodes(page);
    await seedDraft(page, { narration: false });
    await openSeededStudio(page);

    const before = await page.evaluate(() => (window as unknown as { __audioNodes: number }).__audioNodes);
    await page.locator('[data-sk="transport"][data-kind="next"]').click();
    await expect
      .poll(
        () => page.evaluate(() => (window as unknown as { __audioNodes: number }).__audioNodes),
        { timeout: 5000 },
      )
      .toBeGreaterThan(before);
  });

  test('a "450ms" pause is parsed as 0.45s, not 450 seconds', async ({ page }) => {
    await seedDraft(page, { narration: false, autoPause: "450ms" });
    await openSeededStudio(page);

    await page.locator('[data-sk="mode"]').first().click();
    const label = page.locator('label[for="insp-autopause"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText(/0\.[45]s/);
    await expect(label).not.toContainText("450");
  });

  test("an autosave failure is visible at phone width", async ({ page }) => {
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function patched(key: string, value: string) {
        if (key === "ssync-studio-draft") {
          throw new DOMException("no room", "QuotaExceededError");
        }
        return original.call(this, key, value);
      };
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/studio");

    await page.locator("#studio-title").fill("A story that will not fit");
    const note = page.locator('[data-studio="draft-note"]');
    await expect(note).toBeVisible({ timeout: 10000 });
    await expect(note).toContainText(/autosave/i);
  });
});
