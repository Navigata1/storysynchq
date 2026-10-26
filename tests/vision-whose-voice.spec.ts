/**
 * T22b · "Read it in…": whose voice (s07 right panel, brief screens[6]).
 *
 *   Node  the pure known-voices rule (src/components/player/known-voices.ts):
 *         every narrator on the shelf (own and sent) and every consent voice of
 *         your own tapes (T03's lead name), most recent first, case-insensitive
 *         dedupe, at most four; who reads a target today; the door's `voice`.
 *   E2E   /read: the "WHOSE VOICE?" row of kit VoiceCassettes ("Browser voice",
 *         the names this device knows, "Someone new"), READING NOW, the arrows,
 *         the "Someone new" field; the chosen name rides into the Creator, which
 *         shows "Reading as <name>", prefills the gate's "read by" and publishes
 *         it as the narrator and the consent voice (T15, T03, T04b); the cover
 *         says VOICE: <name>; the name survives autosave and goes with "Start a
 *         new story", "delete everything" and another tape; reduced motion; the
 *         fidelity capture (1140×712).
 *
 * Twinkle and "Goodnight, Mia" are T00's illustrative fixtures (tests only).
 */

import { test, expect, type Locator, type Page } from "@playwright/test";
import type { SsyncManifest } from "../src/lib/storysync/manifest";
import { mergeShelf } from "../src/components/player/shelf";
import { creatorUrl, houseTarget, readerOf, sentTarget, shelfTarget } from "../src/components/player/read-it-in";
import {
  BROWSER_VOICE,
  KNOWN_VOICES_MAX,
  knownVoices,
  SOMEONE_NEW,
  voiceFromHash,
  voiceName,
  voiceRow,
  type VoiceSource,
} from "../src/components/player/known-voices";
import { loadTape, TWINKLE, GOODNIGHT_MIA, FIXTURE_PATHS } from "./fixtures/tapes";
import { seedShelf, sentRow, shelfRow } from "./fixtures/shelf-seed";
import type { ReaderLibraryRow } from "./fixtures/reader-tapes";
import { DRAFT_KEY, LIBRARY_KEY } from "./fixtures/helpers";
import { stubMicrophone } from "./fixtures/mic";
import { evidenceShot } from "./fixtures/evidence";
import fs from "node:fs";
import path from "node:path";

const HOUSE: SsyncManifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "public", "demo", "brave-little-star.ssync.json"), "utf8"),
);
const HOUSE_TITLE = "The Brave Little Star";
const HOUSE_AUTHOR = "Island Development Crew";

/** Codes the shape a minted code has (32 lowercase hex). */
const TWINKLE_CODE = "7b22a7b22a7b22a7b22a7b22a7b22a71";
const GRANDMA_CODE = "7b22b7b22b7b22b7b22b7b22b7b22b71";

/** Twinkle was made at 18:10; Grandma's answer reached this shelf later, at 18:40. */
const TWINKLE_SAVED = "2026-10-19T18:10:00.000Z";
const GRANDMA_ARRIVED = "2026-10-19T18:40:00.000Z";

const twinkleStory = () => loadTape("twinkle").story;
const twinkleRow = () => shelfRow(twinkleStory(), TWINKLE_CODE, TWINKLE_SAVED);
const grandmaRef = () => sentRow(GOODNIGHT_MIA, GRANDMA_CODE, "~0:08", GRANDMA_ARRIVED);

/** The Voice card's own line when no name rides along (T13a/T19, unchanged). */
const VOICE_DEFAULT_SUBTITLE = "Tap the red button and tell this page";

/* ---------------------------------------------------------------- locators */

const panel = (page: Page) => page.locator('[data-panel="read-it-in"]');
const voices = (page: Page) => panel(page).getByRole("radiogroup", { name: "Whose voice?" });
const voiceRadios = (page: Page) => voices(page).getByRole("radio");
const voiceRadio = (page: Page, name: string) => voices(page).getByRole("radio", { name, exact: true });
const cassettes = (page: Page) => voices(page).locator('[data-sk="voice-cassette"]');
const newField = (page: Page) => panel(page).getByRole("textbox", { name: "Whose voice?" });
const moodRadio = (page: Page, mood: string) => panel(page).getByRole("radio", { name: new RegExp(`^${mood}, `) });
const makeCopy = (page: Page) => panel(page).getByRole("button", { name: "Make our own copy" });
const house = (page: Page) => page.locator('[data-shelf="house"]');
const face = (page: Page, id: string) => page.locator(`[data-sk="shelf-tape"][data-tape-id="${id}"]`);
const frames = (page: Page): Locator => page.locator("[data-page-index]");
const voiceCard = (page: Page) => page.getByRole("dialog", { name: "Voice" });

/** /read, hydrated (the room writes this visit's time after mount). */
async function openRoom(page: Page): Promise<void> {
  await page.goto("/read");
  await expect(panel(page)).toBeVisible({ timeout: 20000 });
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("ssync-shelf-visit")), { timeout: 20000 })
    .not.toBeNull();
}

/** Every voice radio's accessible name, in row order. */
async function rowNames(page: Page): Promise<string[]> {
  return voiceRadios(page).evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).getAttribute("aria-label") ?? ""),
  );
}

/** The house tape is on the Stage: 8 frames, its title. */
async function expectHouseOpened(page: Page): Promise<void> {
  await expect(frames(page)).toHaveCount(8, { timeout: 30000 });
  await expect(page.locator("#studio-title")).toHaveValue(HOUSE_TITLE);
}

/** Open the Creator's Voice card from the rail. */
async function openVoiceCard(page: Page): Promise<void> {
  await page.getByRole("navigation", { name: "Story tools" }).getByRole("button", { name: /Voice/ }).click();
  await expect(voiceCard(page)).toBeVisible();
}

/** The Voice card's subtitle (the line under its title). */
const voiceSubtitle = (page: Page) => voiceCard(page).locator("h2 + p");

async function readLibrary(page: Page): Promise<Array<ReaderLibraryRow>> {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || "[]"), LIBRARY_KEY);
}

async function readDraftState(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw).state as Record<string, unknown>) : null;
  }, DRAFT_KEY);
}

/** /read → "Someone new" → type `name` → Hush → "Make our own copy" → the house tape on the Stage. */
async function houseCopyAs(page: Page, name: string): Promise<void> {
  await openRoom(page);
  await voiceRadio(page, SOMEONE_NEW).check();
  await expect(newField(page)).toBeFocused();
  await newField(page).fill(name);
  await moodRadio(page, "Hush").check();
  await makeCopy(page).click();
  await expect(page).toHaveURL(/\/studio/, { timeout: 20000 });
  await expectHouseOpened(page);
}

/* ==================================================================== Node */

test.describe("T22b · known voices (Node)", () => {
  const [twinkle] = mergeShelf([twinkleRow()]);
  const own = (entry = twinkle): VoiceSource => ({ kind: "own", entry });
  const sent = (narrator: string | undefined, addedAt: string): VoiceSource => ({
    kind: "sent",
    tape: { addedAt, ...(narrator ? { narrator } : {}) },
  });
  /** An own tape with a given narrator, consent voices and save time. */
  const ownTape = (createdAt: string, narrator?: string, consent: string[] = []): VoiceSource => {
    const manifest: SsyncManifest = {
      version: "2.0",
      metadata: { title: "T", author: "", ...(narrator ? { narrator } : {}) },
      pages: [{ id: 1, text: { content: "x" } }],
      ...(consent.length
        ? { signature: { voiceConsent: consent.map((voice) => ({ voice, grantedBy: "self", date: "2026-10-19" })) } }
        : {}),
    } as SsyncManifest;
    return { kind: "own", entry: { createdAt, manifest } };
  };

  test("Twinkle (own: narrator Mia, consent 'Mia, age 4 — with Mom') + Goodnight, Mia sent later → Grandma Rose, Mia", () => {
    expect(twinkle.manifest.metadata.narrator).toBe("Mia");
    expect(twinkle.manifest.signature?.voiceConsent?.[0].voice).toBe(TWINKLE.byline);
    expect(twinkle.createdAt).toBe(TWINKLE_SAVED);
    const grandma = sent(GOODNIGHT_MIA.narrator, GRANDMA_ARRIVED);
    expect(knownVoices([grandma, own()])).toEqual(["Grandma Rose", "Mia"]);
    // the time decides, not the shelf's order
    expect(knownVoices([own(), grandma])).toEqual(["Grandma Rose", "Mia"]);
    // sent earlier than Twinkle was made: Mia first
    expect(knownVoices([sent("Grandma Rose", "2026-10-19T18:00:00.000Z"), own()])).toEqual(["Mia", "Grandma Rose"]);
  });

  test("duplicates that differ only in case collapse to the most recent spelling; at most four", () => {
    expect(
      knownVoices([
        ownTape("2026-10-19T10:00:00.000Z", "Mia"),
        sent("MIA", "2026-10-20T10:00:00.000Z"),
        ownTape("2026-10-18T10:00:00.000Z", "mia", ["mia"]),
      ]),
    ).toEqual(["MIA"]);

    expect(KNOWN_VOICES_MAX).toBe(4);
    const six = ["Ana", "Bo", "Cy", "Di", "Ed", "Flo"].map((name, i) =>
      sent(name, `2026-10-2${i}T10:00:00.000Z`),
    );
    expect(knownVoices(six)).toEqual(["Flo", "Ed", "Di", "Cy"]);
  });

  test("consent voices of your own tapes by their lead name; the unnamed 'narrator' and blanks never count", () => {
    expect(
      knownVoices([ownTape("2026-10-19T10:00:00.000Z", undefined, ["Grandpa Joe (with Ada)", "narrator", "  ", "Bo, 5"])]),
    ).toEqual(["Grandpa Joe", "Bo"]);
    // a sent reference without a narrator names nobody
    expect(knownVoices([sent(undefined, GRANDMA_ARRIVED)])).toEqual([]);
    expect(knownVoices([])).toEqual([]);
  });

  test("who reads a target today: the browser voice, the narrator, or a voice nobody named", () => {
    const [entry] = mergeShelf([twinkleRow()]);
    expect(readerOf(houseTarget(HOUSE))).toEqual({ kind: "browser" });
    expect(readerOf(shelfTarget(entry))).toEqual({ kind: "voice", name: "Mia" });
    expect(readerOf(sentTarget(grandmaRef()))).toEqual({ kind: "voice", name: "Grandma Rose" });
    const { narrator: _drop, ...noNarrator } = grandmaRef();
    void _drop;
    expect(readerOf(sentTarget(noNarrator))).toEqual({ kind: "browser" });
    const nameless = twinkleStory();
    delete (nameless.metadata as { narrator?: string }).narrator;
    const [unnamed] = mergeShelf([shelfRow(nameless, TWINKLE_CODE, TWINKLE_SAVED)]);
    expect(readerOf(shelfTarget(unnamed))).toEqual({ kind: "unnamed" });
  });

  test("the row always holds today's reader: added first when the four known names leave it out", () => {
    expect(voiceRow(["Grandma Rose", "Mia"], null)).toEqual(["Grandma Rose", "Mia"]);
    expect(voiceRow(["Grandma Rose", "Mia"], "mia")).toEqual(["Grandma Rose", "Mia"]);
    expect(voiceRow(["Ana", "Bo", "Cy", "Di"], "Zed")).toEqual(["Zed", "Ana", "Bo", "Cy"]);
  });

  test("a name: trimmed, single spaces, at most 40 characters; the door carries it in the fragment, never the query", () => {
    expect(voiceName("  Grandma   Rose ")).toBe("Grandma Rose");
    expect(voiceName("")).toBeUndefined();
    expect(voiceName("   ")).toBeUndefined();
    expect(voiceName(42)).toBeUndefined();
    expect(voiceName("x".repeat(60))).toBe("x".repeat(40));

    const target = houseTarget(HOUSE);
    expect(creatorUrl(target, "Hush")).toBe("/studio?open=house&mood=Hush");
    expect(creatorUrl(target, "Hush", "Mom")).toBe("/studio?open=house&mood=Hush#voice=Mom");
    expect(creatorUrl(target, "Calm", "Grandma Rose")).toBe("/studio?open=house&mood=Calm#voice=Grandma%20Rose");
    // whatever the name, nothing of it reaches the query (the part a request carries)
    const url = new URL(creatorUrl(target, "Calm", "Mia & Bo?#"), "http://x");
    expect([...url.searchParams.keys()]).toEqual(["open", "mood"]);
    expect(voiceFromHash(url.hash)).toBe("Mia & Bo?#");
    expect(voiceFromHash("")).toBeUndefined();
    expect(voiceFromHash("#other=1")).toBeUndefined();
    expect(BROWSER_VOICE).toBe("Browser voice");
  });
});

/* ===================================================================== E2E */

test.describe("T22b · whose voice on /read", () => {
  test("the row: Browser voice, the names this device knows, Someone new; READING NOW follows the target", async ({
    page,
  }) => {
    await seedShelf(page, { library: [twinkleRow()], sent: [grandmaRef()] });
    await openRoom(page);
    await expect(face(page, TWINKLE_CODE)).toBeVisible();

    // between the line and "WHAT SHOULD IT FEEL LIKE?"
    const order = await panel(page).evaluate((el) =>
      [...el.querySelectorAll("[data-rin]")].map((n) => n.getAttribute("data-rin")),
    );
    expect(order.indexOf("voice-label")).toBeGreaterThan(order.indexOf("line"));
    expect(order.indexOf("voice-label")).toBeLessThan(order.indexOf("feel-label"));
    await expect(panel(page).locator('[data-rin="voice-label"]')).toHaveText("Whose voice?");
    expect(await panel(page).locator('[data-rin="voice-label"]').innerText()).toBe("WHOSE VOICE?");
    const label = await panel(page)
      .locator('[data-rin="voice-label"]')
      .evaluate((el) => ({ font: getComputedStyle(el).fontFamily, size: getComputedStyle(el).fontSize }));
    expect(label.size).toBe("10.5px");
    expect(label.font).toMatch(/mono/i);

    // the house tape targeted: the browser voice reads it today
    await house(page).getByRole("button", { name: "Read it in…" }).click();
    await expect(cassettes(page)).toHaveCount(4);
    expect(await rowNames(page)).toEqual(["Browser voice, reading now", "Grandma Rose", "Mia", SOMEONE_NEW]);
    await expect(voiceRadio(page, "Browser voice, reading now")).toBeChecked();
    // the hand-lettered names, in order
    await expect(cassettes(page).locator('[data-sk="voice-name"]')).toHaveText([
      "Browser voice",
      "Grandma Rose",
      "Mia",
      SOMEONE_NEW,
    ]);
    // one READING NOW, under the first cassette
    await expect(voices(page).getByText("READING NOW", { exact: true })).toHaveCount(1);
    await expect(cassettes(page).nth(0).getByText("READING NOW", { exact: true })).toBeVisible();
    await expect(cassettes(page).nth(0)).toHaveAttribute("data-reading", "true");
    await expect(cassettes(page).nth(0).locator('[data-sk="reel"]')).toHaveCount(2);
    for (const reel of await cassettes(page).nth(0).locator('[data-sk="reel"]').all()) {
      await expect(reel).toHaveAttribute("data-spinning", "true");
    }
    await expect(cassettes(page).nth(2).locator('[data-sk="reel"][data-spinning="true"]')).toHaveCount(0);
    // names carry the tape-red record dot; the browser voice does not; Someone new carries a plus
    await expect(cassettes(page).nth(0).locator('[data-sk="voice-rec"]')).toHaveCount(0);
    await expect(cassettes(page).nth(1).locator('[data-sk="voice-rec"]')).toHaveCount(1);
    await expect(cassettes(page).nth(2).locator('[data-sk="voice-rec"]')).toHaveCount(1);
    await expect(cassettes(page).nth(3).locator('[data-sk="voice-new"]')).toHaveCount(1);
    // no locked "MADE VOICE · PHASE 3" cassette
    await expect(panel(page)).not.toContainText(/PHASE 3/i);

    // the cassette face: 68×60, a paper label over a dark window, a tape-red dot
    await page.evaluate(() => document.fonts.ready);
    const anatomy = await cassettes(page)
      .nth(2)
      .evaluate((el) => {
        const shell = el.querySelector<HTMLElement>('[data-sk="voice-shell"]')!.getBoundingClientRect();
        const name = getComputedStyle(el.querySelector('[data-sk="voice-name"]')!);
        const paper = getComputedStyle(el.querySelector('[data-sk="voice-label"]')!);
        const dashed = getComputedStyle(el.querySelector('[data-sk="voice-label"]')!, "::before");
        const dot = getComputedStyle(el.querySelector('[data-sk="voice-rec"]')!);
        return {
          w: Math.round(shell.width),
          h: Math.round(shell.height),
          fontStyle: name.fontStyle,
          fontFamily: name.fontFamily,
          paper: paper.backgroundColor,
          dashed: dashed.borderBottomStyle,
          dot: dot.backgroundColor,
        };
      });
    expect(anatomy).toMatchObject({ w: 68, h: 60, fontStyle: "italic", paper: "rgb(255, 253, 246)", dashed: "dashed" });
    expect(anatomy.fontFamily).toMatch(/fraunces/i);
    expect(anatomy.dot).toBe("rgb(227, 69, 47)");

    // Twinkle targeted: Mia's cassette reads now
    await face(page, TWINKLE_CODE).click();
    await expect(face(page, TWINKLE_CODE)).toHaveAttribute("aria-checked", "true");
    expect(await rowNames(page)).toEqual(["Browser voice", "Grandma Rose", "Mia, reading now", SOMEONE_NEW]);
    await expect(cassettes(page).nth(2).getByText("READING NOW", { exact: true })).toBeVisible();
    await expect(cassettes(page).nth(0).getByText("READING NOW", { exact: true })).toHaveCount(0);
    // the browser voice stays checked by default
    await expect(voiceRadio(page, "Browser voice")).toBeChecked();

    // Grandma's sent tape targeted: her cassette
    await face(page, GRANDMA_CODE).click();
    expect(await rowNames(page)).toEqual(["Browser voice", "Grandma Rose, reading now", "Mia", SOMEONE_NEW]);
  });

  test("keyboard: ← → move between cassettes, each with a visible focus ring; Someone new moves focus to its field", async ({
    page,
  }) => {
    await seedShelf(page, { library: [twinkleRow()], sent: [grandmaRef()] });
    await openRoom(page);
    await house(page).getByRole("button", { name: "Read it in…" }).click();
    await expect(newField(page)).toHaveCount(0);

    // Tab into the group lands on the checked cassette
    await voiceRadio(page, "Browser voice, reading now").focus();
    await page.keyboard.press("ArrowRight");
    await expect(voiceRadio(page, "Grandma Rose")).toBeFocused();
    await expect(voiceRadio(page, "Grandma Rose")).toBeChecked();
    const ring = await cassettes(page)
      .nth(1)
      .locator('[data-sk="voice-shell"]')
      .evaluate((el) => ({ style: getComputedStyle(el).outlineStyle, width: getComputedStyle(el).outlineWidth }));
    expect(ring.style).toBe("solid");
    expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2);
    await page.keyboard.press("ArrowRight");
    await expect(voiceRadio(page, "Mia")).toBeChecked();
    await page.keyboard.press("ArrowLeft");
    await expect(voiceRadio(page, "Grandma Rose")).toBeChecked();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    // Someone new: its field appears and takes focus
    await expect(voiceRadio(page, SOMEONE_NEW)).toBeChecked();
    await expect(newField(page)).toBeFocused();
    await expect(newField(page)).toHaveAttribute("maxlength", "40");
    // back to the group with Shift+Tab, and on with the arrows
    await page.keyboard.press("Shift+Tab");
    await expect(voiceRadio(page, SOMEONE_NEW)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(voiceRadio(page, "Browser voice, reading now")).toBeChecked();
    await expect(newField(page)).toHaveCount(0);
  });

  test("a known name rides into the Creator: Mia → 'Reading as Mia'; the browser voice carries nothing", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await seedShelf(page, { library: [twinkleRow()] });
    await openRoom(page);
    await house(page).getByRole("button", { name: "Read it in…" }).click();
    await voiceRadio(page, "Mia").check();
    await makeCopy(page).click();
    await expect(page).toHaveURL(/\/studio/, { timeout: 20000 });
    await expectHouseOpened(page);
    await expect.poll(() => page.url()).not.toContain("voice");
    await openVoiceCard(page);
    await expect(voiceSubtitle(page)).toHaveText("Reading as Mia");
    // autosaved (so the next copy asks before it replaces this one)
    await expect.poll(async () => (await readDraftState(page))?.voiceName, { timeout: 10000 }).toBe("Mia");

    // the browser voice: no name rides along, and the Creator is exactly T15's
    await page.goto("/read");
    await expect(panel(page)).toBeVisible({ timeout: 20000 });
    await house(page).getByRole("button", { name: "Read it in…" }).click();
    await expect(voiceRadio(page, "Browser voice, reading now")).toBeChecked();
    const pushed = page.waitForRequest((req) => new URL(req.url()).pathname === "/studio", { timeout: 20000 });
    await makeCopy(page).click();
    expect((await pushed).url()).not.toContain("voice");
    await expect(page.getByRole("dialog", { name: `Open ${HOUSE_TITLE}?` })).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: "Open it" }).click();
    await expectHouseOpened(page);
    await openVoiceCard(page);
    await expect(voiceSubtitle(page)).toHaveText(VOICE_DEFAULT_SUBTITLE);
  });
});

test.describe.serial("T22b · the chosen name reads the copy", () => {
  /** The library row test 3 publishes, for test 4 to open by its link. */
  let published: ReaderLibraryRow | null = null;

  test("house tape, Someone new 'Mom', Hush → the Creator reads as Mom → the gate's read by is Mom → narrator and consent Mom", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(150000);
    const origin = new URL(baseURL!).origin;
    await stubMicrophone(page);
    /** Every request from the press on: the name is never in any of them. */
    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));

    await houseCopyAs(page, "Mom");
    // T15's query effect took `voice` off the address with the rest
    await expect.poll(() => page.url()).toBe(`${origin}/studio`);

    await openVoiceCard(page);
    await expect(voiceSubtitle(page)).toHaveText("Reading as Mom");
    // record page 1: while the take runs the card says so; after, the name again
    await page.locator('[data-sk="transport"][data-kind="rec"]').click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);
    await expect(voiceSubtitle(page)).toHaveText("Listening… tap again when you are done");
    await page.getByRole("button", { name: /^Stop —/ }).click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByRole("button", { name: /^Page 1, has voice/ })).toBeVisible();
    await expect(voiceSubtitle(page)).toHaveText("Reading as Mom");

    await page.getByRole("button", { name: "Close Voice" }).click();
    await page.getByRole("button", { name: "Finish my story" }).click();
    const gate = page.getByRole("dialog", { name: "A grown-up moment" });
    await expect(gate).toBeVisible({ timeout: 15000 });
    await expect(page.locator('label[for="studio-gate-author"]')).toHaveText("read by (optional)");
    await expect(page.locator("#studio-gate-author")).toHaveValue("Mom");

    // pass the gate as the byline stands
    const question = page.locator('label[for="studio-gate-answer"]');
    const match = (await question.innerText()).match(/(\d+)\s*[×x*]\s*(\d+)/);
    expect(match).not.toBeNull();
    await page.locator("#studio-gate-answer").fill(String(Number(match![1]) * Number(match![2])));
    for (const box of await gate.locator('input[type="checkbox"]').all()) await box.check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Your tape is ready" })).toBeVisible({ timeout: 30000 });

    const library = await readLibrary(page);
    expect(library).toHaveLength(1);
    const tape = library[0].ssyncData;
    expect(tape.metadata.author).toBe(HOUSE_AUTHOR);
    expect(tape.metadata.narrator).toBe("Mom");
    expect(tape.signature?.voiceConsent).toHaveLength(1);
    expect(tape.signature?.voiceConsent?.[0].voice).toBe("Mom");
    published = library[0];

    // the name never left this device: no request carried it
    expect(requests.filter((url) => /\bMom\b|voice=/.test(decodeURIComponent(url)))).toEqual([]);

    // "delete everything" takes the name with the tape
    await page.getByRole("button", { name: "Pull the tape out — delete everything" }).click();
    await page.getByRole("button", { name: "Tap again to delete everything" }).click();
    await expect(page.getByRole("heading", { name: "Your tape is ready" })).toHaveCount(0, { timeout: 10000 });
    await openVoiceCard(page);
    await expect(voiceSubtitle(page)).toHaveText(VOICE_DEFAULT_SUBTITLE);
    await page.waitForTimeout(1200); // past the autosave debounce
    expect(await readDraftState(page)).toBeNull();
  });

  test("that tape opened by its link: the cover says VOICE: Mom", async ({ page }) => {
    test.skip(!published, "needs the tape the previous test published");
    await seedShelf(page, { library: [published!] });
    await page.goto(`/read?story=${published!.shareCode}`);
    const meta = page.locator('[data-pl="cover"] [data-sk="tape"] .sk-tape-meta');
    await expect(meta).toHaveText(/VOICE: Mom/i, { timeout: 20000 });
    expect(await meta.innerText()).toMatch(/VOICE: MOM$/);
  });
});

test.describe("T22b · the name in the draft", () => {
  test("the name survives autosave and restore; Start a new story clears it", async ({ page }) => {
    test.setTimeout(120000);
    await houseCopyAs(page, "Grandpa Joe");
    await openVoiceCard(page);
    await expect(voiceSubtitle(page)).toHaveText("Reading as Grandpa Joe");
    // autosaved beside the manifest, never in it
    await expect.poll(async () => (await readDraftState(page))?.voiceName, { timeout: 10000 }).toBe("Grandpa Joe");
    const draft = await readDraftState(page);
    expect(JSON.stringify(draft!.manifest)).not.toContain("Grandpa Joe");

    await page.reload();
    await page.getByRole("button", { name: "Keep working on it" }).click();
    await expectHouseOpened(page);
    await openVoiceCard(page);
    await expect(voiceSubtitle(page)).toHaveText("Reading as Grandpa Joe");

    await page.reload();
    await page.getByRole("button", { name: "Start a new story" }).click();
    await openVoiceCard(page);
    await expect(voiceSubtitle(page)).toHaveText(VOICE_DEFAULT_SUBTITLE);
  });

  test("opening another tape clears it", async ({ page }) => {
    test.setTimeout(120000);
    await houseCopyAs(page, "Grandpa Joe");
    await openVoiceCard(page);
    await expect(voiceSubtitle(page)).toHaveText("Reading as Grandpa Joe");
    await page.getByRole("button", { name: "Close Voice" }).click();

    const button = page.getByRole("button", { name: "Open a tape" });
    const chooser = page.waitForEvent("filechooser");
    await button.click();
    await (await chooser).setFiles(FIXTURE_PATHS.twinkle.tape);
    const dialog = page.getByRole("dialog", { name: `Open ${TWINKLE.title}?` });
    await expect(dialog).toBeVisible({ timeout: 30000 });
    await dialog.getByRole("button", { name: "Open it" }).click();
    await expect(frames(page)).toHaveCount(5, { timeout: 30000 });
    await openVoiceCard(page);
    await expect(voiceSubtitle(page)).toHaveText(VOICE_DEFAULT_SUBTITLE);
    // once the autosave has written Twinkle, the name is gone from the draft too
    const title = async () =>
      ((await readDraftState(page))?.manifest as SsyncManifest | undefined)?.metadata.title ?? null;
    await expect.poll(title, { timeout: 10000 }).toBe(TWINKLE.title);
    expect((await readDraftState(page))?.voiceName).toBeUndefined();
  });

  test("a draft without a name: the gate's read by starts empty, as T15 left it", async ({ page }) => {
    test.setTimeout(120000);
    await stubMicrophone(page);
    await page.goto("/studio?open=house");
    await expectHouseOpened(page);
    await openVoiceCard(page);
    await expect(voiceSubtitle(page)).toHaveText(VOICE_DEFAULT_SUBTITLE);
    await page.locator('[data-sk="transport"][data-kind="rec"]').click();
    await page.getByRole("button", { name: /^Stop —/ }).click();
    await expect(page.getByRole("button", { name: /^Page 1, has voice/ })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Close Voice" }).click();
    await page.getByRole("button", { name: "Finish my story" }).click();
    await expect(page.locator('label[for="studio-gate-author"]')).toHaveText("read by (optional)", { timeout: 15000 });
    await expect(page.locator("#studio-gate-author")).toHaveValue("");
  });
});

test.describe("T22b · reduced motion", () => {
  test("the READING NOW cassette's reels stand still: animationName none; with motion they turn", async ({ page }) => {
    await openRoom(page);
    const reels = () =>
      voices(page)
        .locator('[data-sk="voice-cassette"][data-reading="true"] [data-sk="reel"] svg')
        .evaluateAll((svgs) =>
          svgs.map((svg) => ({ name: getComputedStyle(svg).animationName, state: getComputedStyle(svg).animationPlayState })),
        );
    expect(await reels()).toEqual([
      { name: "sk-reel-spin", state: "running" },
      { name: "sk-reel-spin", state: "running" },
    ]);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await openRoom(page);
    const still = await reels();
    expect(still).toHaveLength(2);
    for (const reel of still) expect(reel.name).toBe("none");
    // and nothing else in the row moves either
    const durations = await voices(page).evaluate((el) =>
      [...el.querySelectorAll<HTMLElement>("*")].flatMap((n) => {
        const cs = getComputedStyle(n);
        return [...cs.transitionDuration.split(","), ...cs.animationDuration.split(",")].map((d) => d.trim());
      }),
    );
    expect(durations.every((d) => d === "0s")).toBe(true);
  });
});

/* ================================================================ fidelity */

test.describe("T22b · fidelity capture (s07 WHOSE VOICE row)", () => {
  test("1140×712: Twinkle + Goodnight, Mia sent, the house tape targeted, the browser voice reading now", async ({
    page,
  }) => {
    await seedShelf(page, { library: [twinkleRow()], sent: [grandmaRef()] });
    await page.setViewportSize({ width: 1140, height: 712 });
    await openRoom(page);
    await house(page).getByRole("button", { name: "Read it in…" }).click();
    await expect(voiceRadio(page, "Browser voice, reading now")).toBeChecked();
    await page.mouse.move(1, 1);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect
      .poll(() =>
        panel(page)
          .locator('[data-rin="art"] img')
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      )
      .toBe(true);
    // the row sits inside the first screen, every cassette whole
    await page.evaluate(() => document.fonts.ready);
    const row = await voices(page).evaluate((el) => {
      const boxes = [...el.querySelectorAll('[data-sk="voice-shell"]')].map((s) => s.getBoundingClientRect());
      return { top: Math.min(...boxes.map((b) => b.top)), bottom: Math.max(...boxes.map((b) => b.bottom)), n: boxes.length };
    });
    expect(row.n).toBe(4);
    expect(row.bottom).toBeLessThanOrEqual(712);
    await evidenceShot(page, "T22b-1140.png");
  });
});
