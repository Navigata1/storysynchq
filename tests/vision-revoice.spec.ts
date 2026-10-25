// T15 · The Creator opens a tape to re-voice it; recorded voices replace the
// browser voice page by page.
//
// Reference: s07 "Read it in…" promises to open any tape, the house tape
// included, in the Creator "to re-voice it in your own voices and a chosen
// mood"; HANDOFF §2's wedge is "Google cannot read this in your voice."
//
//   Node · the pure re-voice rules (src/lib/storysync/revoice.ts), pinned
//          against the Twinkle fixture and the house tape's JSON
//   E2E  · /studio?open=house, the "Open a tape" file input, /studio?open=<code>,
//          the replace confirmation, a bad file, ?mood=, and a re-voiced
//          publish read back from this device's library
//
// The family content is illustrative and lives in tests/fixtures only.

import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { revoiceManifest } from "../src/lib/storysync/revoice";
import { unpackStorysync } from "../src/lib/storysync/container";
import type { SsyncManifest } from "../src/lib/storysync/manifest";
import { DRAFT_KEY, LIBRARY_KEY, restoreDraft, seedDeviceLibrary, seedStudioDraft } from "./fixtures/helpers";
import { FIXTURE_PATHS, GOODNIGHT_MIA, REPO_ROOT, TWINKLE, loadTape } from "./fixtures/tapes";
import { stubMicrophone } from "./fixtures/mic";

/* ------------------------------------------------------------------ facts */

const HOUSE_URL_PATH = "/demo/brave-little-star.ssync.json";
const HOUSE_FILE = path.join(REPO_ROOT, "public", HOUSE_URL_PATH);
const HOUSE: SsyncManifest = JSON.parse(fs.readFileSync(HOUSE_FILE, "utf8"));
const HOUSE_TITLE = "The Brave Little Star";
const HOUSE_AUTHOR = "Island Development Crew";

const REPLACE_BODY =
  "The story on the Stage will be replaced. It is only kept on this device, so download it first if you want to keep it.";
const BAD_FILE = "That file could not be opened as a .storysync tape.";
const NOT_FOUND = "We couldn't find that tape";

/** Every string anywhere inside a JSON value, with its path. */
function strings(value: unknown, at = "$"): Array<{ at: string; value: string }> {
  if (typeof value === "string") return [{ at, value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${at}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => strings(v, `${at}.${k}`));
  }
  return [];
}

/* ===================================================================== Node */

test.describe("re-voice rules (pure)", () => {
  const NOW = new Date("2026-10-25T09:41:00.000Z");

  test("Twinkle: no voice, no music, no signature; words, pictures and timing kept", () => {
    const source = loadTape("twinkle").manifest;
    const before = JSON.stringify(source);
    const { manifest, mood, musicOn, remix } = revoiceManifest(source, { now: NOW });

    expect(JSON.stringify(source), "the source manifest is not mutated").toBe(before);
    expect(manifest.version).toBe("2.0");
    expect(manifest.metadata.created).toBe(NOW.toISOString());
    expect(manifest.metadata.title).toBe(TWINKLE.title);
    expect(manifest.metadata.author).toBe("Mia, age 4 — with Mom");
    expect(manifest.metadata.language).toBe("en");
    expect("narrator" in manifest.metadata).toBe(false);
    expect("coverImage" in manifest.metadata).toBe(false);
    expect("signature" in manifest).toBe(false);
    expect(manifest.settings).toEqual(source.settings);

    expect(manifest.pages.map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
    expect(manifest.pages.map((p) => p.text?.content)).toEqual(TWINKLE.pages.map((p) => p.text));
    for (const [i, p] of manifest.pages.entries()) {
      expect(p.text && "audioUrl" in p.text, `page ${i + 1} audioUrl`).toBe(false);
      expect(p.text && "audioCodec" in p.text, `page ${i + 1} audioCodec`).toBe(false);
      expect(p.text && "voice" in p.text, `page ${i + 1} voice`).toBe(false);
      expect("music" in p, `page ${i + 1} music`).toBe(false);
      expect(p.text?.wordHighlight).toBe(true);
      expect(p.illustration).toEqual(source.pages[i].illustration);
      expect(p.timing).toEqual({ autoPause: "2s" });
      expect(p.layout).toBe("image-top");
    }

    expect(mood).toBe("Wonder");
    expect(musicOn).toBe(true);
    // The fixture has no shareUrl and no app URL was given.
    expect(remix).toEqual({
      of: '"Twinkle Came to My Window" by Mia, age 4 — with Mom',
      title: TWINKLE.title,
      author: "Mia, age 4 — with Mom",
    });
  });

  test("the house tape: 8 pages renumbered, no voice names, Wonder, no signature, remix of its app URL", () => {
    const sourceRef = "http://x/demo/brave-little-star.ssync.json";
    const { manifest, mood, musicOn, remix } = revoiceManifest(HOUSE, { sourceRef, now: NOW });

    expect(manifest.pages).toHaveLength(8);
    expect(manifest.pages.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(manifest.pages.every((p) => !p.text || !("voice" in p.text))).toBe(true);
    expect(manifest.pages.every((p) => !("music" in p))).toBe(true);
    expect(mood).toBe("Wonder"); // page 1 says "wonder"
    expect(musicOn).toBe(true);
    expect("signature" in manifest).toBe(false);
    expect(remix).toEqual({ of: sourceRef, title: HOUSE_TITLE, author: HOUSE_AUTHOR });

    // Kept: the words and their read-along, the pictures' other fields, the
    // timing, the layout, the settings and the metadata the ticket names.
    expect(manifest.pages.map((p) => p.text?.content)).toEqual(HOUSE.pages.map((p) => p.text?.content));
    expect(manifest.pages[0].illustration).toEqual(HOUSE.pages[0].illustration);
    expect(manifest.pages[0].text).toEqual({
      content: HOUSE.pages[0].text?.content,
      wordHighlight: true,
      animation: "words-fade-in",
      animationDelay: "1s",
    });
    expect(manifest.pages[6].timing).toEqual(HOUSE.pages[6].timing);
    expect(manifest.pages[0].layout).toBe(HOUSE.pages[0].layout);
    expect(manifest.settings).toEqual(HOUSE.settings);
    expect(manifest.metadata).toEqual({
      title: HOUSE_TITLE,
      author: HOUSE_AUTHOR,
      genre: "children",
      ageRange: "3-8",
      language: "en",
      description: HOUSE.metadata.description,
      created: NOW.toISOString(),
    });
    // The legacy QR (a Phase 3 domain) goes with the rest of the signature.
    expect(JSON.stringify(manifest)).not.toContain("storysynchq.com");
  });

  test("edge cases: a shareUrl wins, ids are renumbered, unknown page fields ride along, music objects resolve", () => {
    const source = {
      version: "1.0",
      metadata: { title: "Two Pages", author: "Somebody", narrator: "Somebody", coverImage: "data:," },
      signature: {
        shareUrl: "https://example.test/read?story=abc",
        ownership: "© 2025 Somebody",
        voiceConsent: [{ voice: "Somebody", grantedBy: "self", date: "2025-01-01" }],
        remixOf: "elsewhere",
      },
      pages: [
        {
          id: 5,
          sparkle: { level: 3 },
          text: { content: "One.", voice: "Somebody", audioUrl: "data:audio/mp4;base64,AA==", audioCodec: "aac" },
          music: { crossfade: "adventure", duration: "2s" },
        },
        { id: 9, text: { content: "Two." }, music: "calm" },
      ],
    } as unknown as SsyncManifest;

    const { manifest, mood, musicOn, remix } = revoiceManifest(source, {
      sourceRef: "http://ignored.test/tape.json",
      now: NOW,
    });
    expect(remix.of).toBe("https://example.test/read?story=abc");
    expect(manifest.pages.map((p) => p.id)).toEqual([1, 2]);
    expect((manifest.pages[0] as unknown as { sparkle: unknown }).sparkle).toEqual({ level: 3 });
    expect(manifest.pages[0].text).toEqual({ content: "One." });
    expect(mood).toBe("Adventure");
    expect(musicOn).toBe(true);
    expect("signature" in manifest).toBe(false);

    const quiet = revoiceManifest({ version: "2.0", metadata: { title: "Quiet" }, pages: [{ id: 1 }] }, { now: NOW });
    expect(quiet.mood).toBe("Wonder");
    expect(quiet.musicOn).toBe(false);
    expect(quiet.remix).toEqual({ of: '"Quiet"', title: "Quiet", author: "" });
  });
});

/* ====================================================================== E2E */

const frames = (page: Page): Locator => page.locator("[data-page-index]");

async function frameNames(page: Page): Promise<string[]> {
  return frames(page).evaluateAll((els) =>
    els.map((el) => (el.getAttribute("aria-label") ?? "").replace(/, selected$/, "")),
  );
}

async function readLibrary(page: Page): Promise<Array<{ shareCode?: string; ssyncData: SsyncManifest }>> {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || "[]"), LIBRARY_KEY);
}

/** Hand a file to the Studio's "Open a tape" control, through the real button. */
async function openTapeFile(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  const button = page.getByRole("button", { name: "Open a tape" });
  await expect(button).toBeVisible();
  // A click before React hydrates opens no chooser; retry until one opens.
  await expect(async () => {
    const chooser = page.waitForEvent("filechooser", { timeout: 2000 });
    await button.click();
    await (await chooser).setFiles(file);
  }).toPass({ timeout: 20000 });
}

/** "Finish my story" → the gate: answer a×b, type the byline, tick every voice, Continue. */
async function passGate(page: Page, byline: string): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "A grown-up moment" });
  await expect(dialog).toBeVisible({ timeout: 15000 });
  const question = page.locator('label[for="studio-gate-answer"]');
  await expect(question).toContainText(/\d+\s*[×x*]\s*\d+/);
  const match = (await question.innerText()).match(/(\d+)\s*[×x*]\s*(\d+)/);
  expect(match, "the gate asks an a×b question").not.toBeNull();
  await page.locator("#studio-gate-answer").fill(String(Number(match![1]) * Number(match![2])));
  await page.locator("#studio-gate-author").fill(byline);
  for (const box of await dialog.locator('input[type="checkbox"]').all()) await box.check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your tape is ready" })).toBeVisible({ timeout: 30000 });
}

/** Wait for the house tape to land on the Stage. */
async function expectHouseOpened(page: Page): Promise<void> {
  await expect(frames(page)).toHaveCount(8, { timeout: 30000 });
  await expect(page.locator("#studio-title")).toHaveValue(HOUSE_TITLE);
}

test.describe("the Creator opens a tape", () => {
  test.setTimeout(90000);

  test("?open=house opens The Brave Little Star on page 1, every picture inlined", async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));

    await page.goto("/studio?open=house");
    await expectHouseOpened(page);

    expect(await frameNames(page)).toEqual(Array.from({ length: 8 }, (_, i) => `Page ${i + 1}`));
    await expect(frames(page).first()).toHaveAttribute("aria-current", "true");
    await expect(page.locator("#studio-page-text")).toHaveValue(HOUSE.pages[0].text!.content);

    const sources = await page.locator("[data-page-index] img").evaluateAll((imgs) =>
      imgs.map((img) => img.getAttribute("src") ?? ""),
    );
    expect(sources).toHaveLength(7); // page 8 of the house tape has no picture
    for (const src of sources) expect(src.startsWith("data:image/jpeg")).toBe(true);

    await expect(page.locator("p[aria-live='polite']").filter({ hasText: "Opened" })).toHaveText(
      "Opened The Brave Little Star, 8 pages. Record your voice on any page.",
    );
    expect(new URL(page.url()).searchParams.has("open")).toBe(false);

    // The draft is self-contained: no picture still points at /demo/.
    await expect
      .poll(() => page.evaluate((key) => window.localStorage.getItem(key), DRAFT_KEY), { timeout: 10000 })
      .not.toBeNull();
    const draft = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)!), DRAFT_KEY);
    expect(JSON.stringify(draft.state.manifest)).not.toContain("/demo/");
    expect(draft.state.recordings).toEqual({});
    expect(draft.state.published).toBeNull();
    expect(draft.state.remix).toEqual({ of: `${origin}${HOUSE_URL_PATH}`, title: HOUSE_TITLE, author: HOUSE_AUTHOR });

    // COPPA: nothing but this app's own pages, code and /demo/ files.
    const foreign = requests.filter((url) => new URL(url).origin !== origin && !url.startsWith("data:"));
    expect(foreign).toEqual([]);
    const fetchedDemo = requests.filter((url) => new URL(url).pathname.startsWith("/demo/"));
    expect(fetchedDemo.length).toBeGreaterThanOrEqual(8); // the JSON and seven pictures
  });

  test("re-voice: record page 1, publish as the reader; page 2 keeps the browser voice", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(150000);
    const origin = new URL(baseURL!).origin;
    await stubMicrophone(page);
    await page.addInitScript(() => {
      // Which words the browser voice was asked to read.
      const w = window as unknown as Record<string, unknown>;
      const spoken: string[] = [];
      w.__spoken = spoken;
      class FakeUtterance {
        text: string;
        rate = 1;
        pitch = 1;
        onboundary: unknown = null;
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      }
      w.SpeechSynthesisUtterance = FakeUtterance;
      Object.defineProperty(w, "speechSynthesis", {
        configurable: true,
        value: {
          speak(u: FakeUtterance) {
            spoken.push(u.text);
            u.onstart?.();
          },
          cancel() {},
          getVoices() {
            return [];
          },
        },
      });
    });

    await page.goto("/studio?open=house");
    await expectHouseOpened(page);

    await page.locator('[data-sk="transport"][data-kind="rec"]').click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);
    await page.getByRole("button", { name: /^Stop —/ }).click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByRole("button", { name: /^Page 1, has voice/ })).toBeVisible();
    expect((await frameNames(page)).filter((name) => name.includes("has voice"))).toEqual(["Page 1, has voice"]);

    const close = page.getByRole("button", { name: "Close Voice" });
    if (await close.isVisible()) await close.click();
    await page.getByRole("button", { name: "Finish my story" }).click();

    // The byline on a re-voiced tape names the reader, not the author.
    const byline = page.locator('label[for="studio-gate-author"]');
    await expect(byline).toHaveText("read by (optional)");
    expect(await byline.innerText()).toBe("READ BY (OPTIONAL)");
    await expect(page.locator("#studio-gate-author")).toHaveValue("");
    await passGate(page, "Grandpa Joe");

    const library = await readLibrary(page);
    expect(library).toHaveLength(1);
    const tape = library[0].ssyncData;
    expect(tape.metadata.author).toBe(HOUSE_AUTHOR);
    expect(tape.metadata.narrator).toBe("Grandpa Joe");
    expect(tape.signature?.voiceConsent).toHaveLength(1);
    expect(tape.signature?.voiceConsent?.[0].voice).toBe("Grandpa Joe");
    expect(tape.signature?.voiceConsent?.[0].grantedBy).toBe("parent/guardian");
    expect(tape.signature?.remixOf).toBe(`${origin}${HOUSE_URL_PATH}`);
    expect(tape.signature?.ownership).toMatch(/^© \d{4} Island Development Crew$/);
    expect(tape.signature?.rights).toBe("personal use");
    expect(tape.pages[0].text?.audioUrl).toBeTruthy();
    expect(tape.pages[0].text?.audioCodec).toBe("aac");
    for (const p of tape.pages.slice(1)) {
      expect(p.text?.audioUrl, `page ${p.id} has no recorded voice`).toBeUndefined();
      expect(p.text?.audioCodec).toBeUndefined();
    }
    const json = JSON.stringify(tape);
    expect(json).not.toContain("/demo/images/");
    expect(json).not.toContain("storysynchq.com");

    // The downloaded .storysync is self-contained.
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download the .storysync file" }).click();
    const file = await (await download).path();
    const { manifest } = unpackStorysync(new Uint8Array(fs.readFileSync(file!)));
    const all = strings(manifest);
    expect(all.filter((s) => s.value.includes("storysynchq.com"))).toEqual([]);
    expect(all.filter((s) => s.value.includes("/demo/images/"))).toEqual([]);
    // The one /demo/ string is the provenance link, never an asset.
    expect(all.filter((s) => s.value.includes("/demo/"))).toEqual([
      { at: "$.signature.remixOf", value: `${origin}${HOUSE_URL_PATH}` },
    ]);
    expect(manifest.pages[0].text?.audioUrl).toMatch(/^assets\/narration-1\.m4a$/);
    expect(manifest.pages.slice(0, 7).every((p) => /^assets\/page-\d\.jpg$/.test(p.illustration?.url ?? ""))).toBe(
      true,
    );

    // Read it back: page 1 is the recorded voice, page 2 the browser voice.
    const code = library[0].shareCode;
    expect(code).toBeTruthy();
    await page.goto(`/read?story=${code}`);
    const root = page.locator(".pl-root");
    await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
    await page.getByRole("button", { name: /Tap to Begin/i }).click();
    await expect(root).toHaveAttribute("data-view", "page");
    await expect(root).toHaveAttribute("data-page", "1");
    await page.keyboard.press("ArrowRight");
    await expect(root).toHaveAttribute("data-page", "2");
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken), { timeout: 10000 })
      .toContain(HOUSE.pages[1].text!.content);
    const spoken = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
    expect(spoken, "page 1 is read by the recorded voice, never the browser").not.toContain(
      HOUSE.pages[0].text!.content,
    );
  });

  test("a normal tape publishes as before: story by, no remixOf", async ({ page }) => {
    await seedStudioDraft(page, "twinkle");
    await page.goto("/studio");
    await restoreDraft(page);
    await page.getByRole("button", { name: "Finish my story" }).click();
    const byline = page.locator('label[for="studio-gate-author"]');
    await expect(byline).toHaveText("story by (optional)");
    await passGate(page, TWINKLE.byline);
    const [row] = await readLibrary(page);
    expect(row.ssyncData.metadata.author).toBe(TWINKLE.byline);
    expect(row.ssyncData.signature?.ownership).toBe(`© ${new Date().getFullYear()} ${TWINKLE.byline}`);
    expect(row.ssyncData.signature && "remixOf" in row.ssyncData.signature).toBe(false);
  });

  test("Magic over an opened tape makes a new story: story by, the byline is the author, no remixOf", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.goto("/studio?open=house");
    await expectHouseOpened(page);

    // Magic replaces every page, so the tape on the Stage is a new story now.
    await page.getByRole("navigation", { name: "Story tools" }).getByRole("button", { name: /Magic/ }).click();
    await page.locator("#studio-magic-prompt").fill("A dragon who loves pancakes");
    await page.getByRole("button", { name: "Make my story" }).click();
    const replace = page.getByRole("button", { name: "Yes, replace my pages" });
    if (await replace.isVisible()) await replace.click();
    await expect(frames(page)).toHaveCount(5, { timeout: 30000 });
    await expect(page.locator("#studio-title")).not.toHaveValue(HOUSE_TITLE);
    const title = await page.locator("#studio-title").inputValue();

    // The opened tape's record and credit went with its pages.
    await expect
      .poll(
        () =>
          page.evaluate(
            (key) => JSON.parse(window.localStorage.getItem(key) || "null")?.state?.manifest?.metadata?.title ?? null,
            DRAFT_KEY,
          ),
        { timeout: 10000 },
      )
      .toBe(title);
    const draft = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)!), DRAFT_KEY);
    expect(draft.state.remix ?? null).toBeNull();
    expect(JSON.stringify(draft.state.manifest.metadata)).not.toContain(HOUSE_AUTHOR);

    await page.getByRole("button", { name: "Finish my story" }).click();
    const byline = page.locator('label[for="studio-gate-author"]');
    await expect(byline).toHaveText("story by (optional)");
    await expect(page.locator("#studio-gate-author")).toHaveValue("");
    await passGate(page, TWINKLE.byline);

    const library = await readLibrary(page);
    expect(library).toHaveLength(1);
    const tape = library[0].ssyncData;
    expect(tape.metadata.title).toBe(title);
    expect(tape.metadata.author).toBe(TWINKLE.byline);
    expect(tape.signature?.ownership).toBe(`© ${new Date().getFullYear()} ${TWINKLE.byline}`);
    expect(tape.signature && "remixOf" in tape.signature).toBe(false);
    // Nothing of the house tape's credit or blurb is claimed by the new story.
    expect(tape.metadata.description).toBeUndefined();
    expect(JSON.stringify(tape)).not.toContain(HOUSE_AUTHOR);
  });

  test('"Open a tape" opens a .storysync on this device, voices left behind, nothing on the network', async ({
    page,
    baseURL,
  }) => {
    const origin = new URL(baseURL!).origin;
    await page.goto("/studio");
    const button = page.getByRole("button", { name: "Open a tape" });
    await expect(button).toBeVisible();

    // Right after Exit, with the reference icon and a hidden .storysync input.
    const order = await page.locator("header").evaluate((header) =>
      Array.from(header.children).map((el) => el.getAttribute("aria-label") ?? el.id ?? ""),
    );
    expect(order.indexOf("Open a tape")).toBe(order.indexOf("Leave the studio") + 1);
    await expect(button.locator("svg.lucide-folder-open")).toHaveCount(1);
    const input = page.locator('[data-studio="open-tape-input"]');
    await expect(input).toHaveAttribute("type", "file");
    await expect(input).toHaveAttribute("accept", ".storysync,.zip");

    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await openTapeFile(page, FIXTURE_PATHS.twinkle.tape);

    await expect(frames(page)).toHaveCount(5, { timeout: 20000 });
    expect(await frameNames(page)).toEqual(["Page 1", "Page 2", "Page 3", "Page 4", "Page 5"]);
    await expect(page.locator("#studio-title")).toHaveValue(TWINKLE.title);
    await frames(page).nth(2).click();
    await expect(page.locator("#studio-page-text")).toHaveValue(
      "I was scared of the dark. Twinkle came to my window.",
    );

    const offDevice = requests.filter((url) => {
      if (url.startsWith("data:") || url.startsWith("blob:")) return false;
      const u = new URL(url);
      return !(u.origin === origin && u.pathname.startsWith("/_next/"));
    });
    expect(offDevice, "opening a file is read on this device only").toEqual([]);
  });

  test("?open=<code> resolves through this device's library, as /read?story= does", async ({ page }) => {
    const code = randomBytes(16).toString("hex");
    await seedDeviceLibrary(page, "goodnight-mia", { shareCode: code });
    await page.goto(`/studio?open=${code}`);
    await expect(page.locator("#studio-title")).toHaveValue(GOODNIGHT_MIA.title, { timeout: 30000 });
    expect(await frameNames(page)).toEqual(["Page 1"]);
    await expect(page.locator("#studio-page-text")).toHaveValue(GOODNIGHT_MIA.pages[0].text);
    expect(new URL(page.url()).searchParams.has("open")).toBe(false);
  });

  test("?open=<unknown code> says so and leaves the Studio as it was", async ({ page }) => {
    await page.goto("/studio?open=ffffffffffffffffffffffffffffffff");
    await expect(page.getByRole("status").filter({ hasText: NOT_FOUND })).toBeVisible({ timeout: 20000 });
    expect(await frameNames(page)).toEqual(["Page 1"]);
    await expect(page.locator("#studio-title")).toHaveValue("My Story");
    await expect(page.locator("#studio-page-text")).toHaveValue("");
    expect(new URL(page.url()).searchParams.has("open")).toBe(false);
  });

  test("?open=<unknown code> with a saved draft: the draft is untouched and offered back", async ({ page }) => {
    await seedStudioDraft(page, "twinkle");
    await page.goto("/studio?open=ffffffffffffffffffffffffffffffff");
    const before = await page.evaluate((key) => window.localStorage.getItem(key), DRAFT_KEY);
    await expect(page.getByRole("status").filter({ hasText: NOT_FOUND })).toBeVisible({ timeout: 20000 });
    await restoreDraft(page);
    await expect(page.locator("#studio-title")).toHaveValue(TWINKLE.title);
    await expect(frames(page)).toHaveCount(5);
    await page.waitForTimeout(1500); // past the autosave debounce
    expect(await page.evaluate((key) => window.localStorage.getItem(key), DRAFT_KEY)).toBe(before);
  });

  test("a file that is not a .storysync is refused honestly, and nothing changes", async ({ page }) => {
    await seedStudioDraft(page, "twinkle");
    await page.goto("/studio");
    await restoreDraft(page);
    await expect(frames(page)).toHaveCount(5);

    await openTapeFile(page, {
      name: "broken.storysync",
      mimeType: "application/zip",
      buffer: Buffer.from("not-a-zip!"),
    });
    await expect(page.getByRole("status").filter({ hasText: BAD_FILE })).toHaveText(new RegExp(`^${BAD_FILE.replace(/\./g, "\\.")}`));
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(frames(page)).toHaveCount(5);
    await expect(page.locator("#studio-title")).toHaveValue(TWINKLE.title);
  });

  test("the open note floats over the Stage: the chrome stays still, one live region, cleared by Dismiss or the next edit", async ({
    page,
  }) => {
    await seedStudioDraft(page, "twinkle");
    await page.goto("/studio");
    await restoreDraft(page);
    await expect(frames(page)).toHaveCount(5);

    // One live region, mounted (and empty) before any message, so the first
    // message is announced as a change and not missed with the mount.
    const region = page.locator('[data-studio="open-note"] [role="status"]');
    await expect(region).toHaveCount(1);
    await expect(region).toHaveText("");
    await region.evaluate((el) => el.setAttribute("data-t15-mark", "mounted-before"));

    const box = async () =>
      page.evaluate(() => ({
        header: Math.round(document.querySelector("header")!.getBoundingClientRect().height),
        stage: Math.round(document.querySelector(".studio-area-stage")!.getBoundingClientRect().top),
        text: Math.round(document.querySelector("#studio-page-text")!.getBoundingClientRect().top),
      }));
    const before = await box();

    const broken = { name: "broken.storysync", mimeType: "application/zip", buffer: Buffer.from("not-a-zip!") };
    await openTapeFile(page, broken);
    await expect(region).toHaveText(BAD_FILE);
    await expect(region).toHaveAttribute("data-t15-mark", "mounted-before");
    expect(await box(), "the note never pushes the Stage down").toEqual(before);

    // Dismiss names what it dismisses, and leaves the region in place.
    await page.getByRole("button", { name: "Dismiss this message" }).click();
    await expect(region).toHaveText("");
    await expect(region).toHaveAttribute("data-t15-mark", "mounted-before");

    // The next edit clears a failure too.
    await openTapeFile(page, broken);
    await expect(region).toHaveText(BAD_FILE);
    await page.locator("#studio-page-text").fill("A new line.");
    await expect(region).toHaveText("");
    await expect(page.getByRole("button", { name: "Dismiss this message" })).toHaveCount(0);
  });

  test("?open=house&mood=Calm opens with the Calm bed, and the URL is cleaned", async ({ page }) => {
    await page.goto("/studio?open=house&mood=Calm");
    await expectHouseOpened(page);
    expect(new URL(page.url()).searchParams.has("mood")).toBe(false);
    await page.getByRole("navigation", { name: "Story tools" }).getByRole("button", { name: /Music/ }).click();
    await expect(page.getByRole("radio", { name: /Calm/ })).toHaveAttribute("aria-checked", "true");
  });

  test("?mood=<not a mood> is ignored: the tape's own mood stands", async ({ page }) => {
    await page.goto("/studio?open=house&mood=banana");
    await expectHouseOpened(page);
    await page.getByRole("navigation", { name: "Story tools" }).getByRole("button", { name: /Music/ }).click();
    await expect(page.getByRole("radio", { name: /Wonder/ })).toHaveAttribute("aria-checked", "true");
  });
});

test.describe("never lose a story by accident", () => {
  test.setTimeout(90000);

  test("?open= with a saved draft asks once; Keep my story restores it, byte for byte", async ({ page }) => {
    await seedStudioDraft(page, "twinkle");
    await page.goto("/studio?open=house");
    const before = await page.evaluate((key) => window.localStorage.getItem(key), DRAFT_KEY);
    expect(before).not.toBeNull();

    const dialog = page.getByRole("dialog", { name: `Open ${HOUSE_TITLE}?` });
    await expect(dialog).toBeVisible({ timeout: 30000 });
    await expect(dialog).toContainText(REPLACE_BODY);
    await expect(page.getByText("Pick up where you left off?")).toHaveCount(0);
    // Focus is inside the dialog.
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await dialog.getByRole("button", { name: "Keep my story" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("#studio-title")).toHaveValue(TWINKLE.title);
    await expect(frames(page)).toHaveCount(5);
    await expect(page.getByText("Pick up where you left off?")).toHaveCount(0);
    await page.waitForTimeout(1500); // past the autosave debounce
    expect(await page.evaluate((key) => window.localStorage.getItem(key), DRAFT_KEY)).toBe(before);
  });

  test("?open= with a saved draft: Open it replaces the story", async ({ page }) => {
    await seedStudioDraft(page, "twinkle");
    await page.goto("/studio?open=house");
    const dialog = page.getByRole("dialog", { name: `Open ${HOUSE_TITLE}?` });
    await expect(dialog).toBeVisible({ timeout: 30000 });
    await dialog.getByRole("button", { name: "Open it" }).click();
    await expectHouseOpened(page);
    expect(await frameNames(page)).toEqual(Array.from({ length: 8 }, (_, i) => `Page ${i + 1}`));
  });

  test("Escape is Keep my story; with reduced motion the dialog does not animate", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seedStudioDraft(page, "twinkle");
    await page.goto("/studio?open=house");
    const dialog = page.getByRole("dialog", { name: `Open ${HOUSE_TITLE}?` });
    await expect(dialog).toBeVisible({ timeout: 30000 });
    const animations = await dialog.evaluate((el) => [
      getComputedStyle(el).animationName,
      getComputedStyle(el.parentElement!).animationName,
    ]);
    expect(animations).toEqual(["none", "none"]);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.locator("#studio-title")).toHaveValue(TWINKLE.title);
    await expect(frames(page)).toHaveCount(5);
  });

  test("in session, by keyboard: a file opened over a story asks first, and focus returns to the opener", async ({
    page,
  }) => {
    // Playwright turns on file-chooser interception without waiting when the
    // first "filechooser" listener is added. Added just before the key press,
    // it can lose that race and miss the chooser, so it is turned on up front.
    page.on("filechooser", () => {});
    await seedStudioDraft(page, "twinkle");
    await page.goto("/studio");
    await restoreDraft(page);
    await expect(frames(page)).toHaveCount(5);

    // Keyboard only: focus "Open a tape" and press Enter for the file chooser.
    const opener = page.getByRole("button", { name: "Open a tape" });
    await opener.focus();
    await expect(opener).toBeFocused();
    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("Enter");
    await (await chooser).setFiles(FIXTURE_PATHS["goodnight-mia"].tape);
    const dialog = page.getByRole("dialog", { name: `Open ${GOODNIGHT_MIA.title}?` });
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await expect(dialog).toContainText(REPLACE_BODY);
    // Nothing is replaced yet.
    await expect(page.locator("#studio-title")).toHaveValue(TWINKLE.title);
    await expect(frames(page)).toHaveCount(5);
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    // Focus starts on the safe answer, and Tab stays inside the dialog.
    await expect(dialog.getByRole("button", { name: "Keep my story" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Open it" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Keep my story" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Open it" })).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(page.locator("#studio-title")).toHaveValue(GOODNIGHT_MIA.title);
    expect(await frameNames(page)).toEqual(["Page 1"]);
    await expect(page.getByRole("button", { name: "Open a tape" })).toBeFocused();
  });

  test("behind the dialog nothing moves: a backdrop click keeps focus inside, and arrow keys do not turn pages", async ({
    page,
  }) => {
    await seedStudioDraft(page, "twinkle");
    await page.goto("/studio");
    await restoreDraft(page);
    await expect(frames(page)).toHaveCount(5);
    await expect(frames(page).first()).toHaveAttribute("aria-current", "true");

    await openTapeFile(page, FIXTURE_PATHS["goodnight-mia"].tape);
    const dialog = page.getByRole("dialog", { name: `Open ${GOODNIGHT_MIA.title}?` });
    await expect(dialog).toBeVisible({ timeout: 20000 });

    // The backdrop is not a way out of the question, and it keeps focus.
    await page.mouse.click(6, 6);
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    // Even with focus dropped to the page, the Stage behind an open question stays put.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await dialog.getByRole("button", { name: "Keep my story" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("#studio-title")).toHaveValue(TWINKLE.title);
    await expect(frames(page).first()).toHaveAttribute("aria-current", "true");
  });

  test("?open= with no gesture: focus goes back to where it was before the question", async ({ page }) => {
    await seedStudioDraft(page, "twinkle");
    // Hold the house tape while the parent puts focus somewhere.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(`**${HOUSE_URL_PATH}`, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto("/studio?open=house");
    const title = page.locator("#studio-title");
    await expect(title).toBeVisible();
    await title.focus();
    await expect(title).toBeFocused();
    release();

    const dialog = page.getByRole("dialog", { name: `Open ${HOUSE_TITLE}?` });
    await expect(dialog).toBeVisible({ timeout: 30000 });
    await expect(dialog.getByRole("button", { name: "Keep my story" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(title).toHaveValue(TWINKLE.title);
    await expect(title).toBeFocused();
  });
});
