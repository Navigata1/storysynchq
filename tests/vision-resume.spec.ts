/**
 * T21 · Resume: the last page per tape, on this device only (s07 band, brief
 * screens[6]: "You stopped at page 5." · "Pick up where you left off" ·
 * "Start again").
 *
 *   Node  the pure resume module (src/components/player/resume.ts): the tape
 *         key, record / clear / resume point, the 50-tape cap, sanitize.
 *   E2E   with the clock pinned: a link's round trip (record → the cover's
 *         offer → page 3), Tap to Begin still page 1, the shelf band's resume
 *         variant and default selection, the end card / pull-out / take-off
 *         clearing the place, the house tape's `t:` key, and the keyboard.
 *
 * The place is the only listening fact the Reader keeps (HANDOFF §7): one page
 * number per tape, in this browser. Twinkle and Goodnight, Mia are T00's
 * illustrative fixtures; Bath Time Song is synthetic.
 */

import fs from "node:fs";
import path from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  clearTape,
  codeKey,
  latestResumed,
  recordPage,
  RESUME_CAP,
  RESUME_KEY,
  resumePoint,
  sanitizeResume,
  serializeResume,
  tapeKey,
  type ResumeStore,
} from "../src/components/player/resume";
import {
  forgetPlaces,
  placeKeysOfStories,
  placeKeysOfTape,
  readResume,
  writeResume,
} from "../src/components/player/resume-store";
import type { SsyncManifest } from "../src/lib/storysync/manifest";
import { runtimeLabel } from "../src/lib/storysync/tape-meta";
import { GOODNIGHT_MIA, loadTape, TWINKLE } from "./fixtures/tapes";
import { restoreDraft } from "./fixtures/helpers";
import { pictureLessTape, publishedDraft, resumeAt, seedShelf, sentRow, shelfRow } from "./fixtures/shelf-seed";

/** Codes the shape a minted code has (32 lowercase hex). */
const TWINKLE_CODE = "7c21a7c21a7c21a7c21a7c21a7c21a71";
const BATH_CODE = "7c21b7c21b7c21b7c21b7c21b7c21b71";
const GRANDMA_CODE = "60d02160d02160d02160d02160d02160";

/** Last night's bedtime (the place was left), and now. */
const LAST_NIGHT = "2026-10-20T19:12:00.000Z";
const NOW = "2026-10-21T19:40:00.000Z";

const TWINKLE_KEY = `code:${TWINKLE_CODE}`;
const STOPPED = (n: number) => `You stopped at page ${n}.`;
const PICK_UP = "Pick up where you left off";
const START_AGAIN = "Start again";

/** Words the Reader never prints about listening (HANDOFF §7). */
const NO_HISTORY = /\b(heard|listened|listens|plays|played|times|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i;

const twinkleStory = () => loadTape("twinkle").story;
const houseTape = (): SsyncManifest =>
  JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "public", "demo", "brave-little-star.ssync.json"), "utf8"));

/** Twinkle (saved first) and Bath Time Song (saved later: T20a would select it first). */
function library() {
  return [
    shelfRow(twinkleStory(), TWINKLE_CODE, "2026-10-19T18:10:00.000Z"),
    shelfRow(pictureLessTape("Bath Time Song", ""), BATH_CODE, "2026-10-20T08:00:00.000Z"),
  ];
}

const root = (page: Page) => page.locator(".pl-root");
const cover = (page: Page) => page.locator('[data-pl="cover"]');
const faces = (page: Page) => page.locator('[data-sk="shelf-tape"]');
const face = (page: Page, id: string) => page.locator(`[data-sk="shelf-tape"][data-tape-id="${id}"]`);
const band = (page: Page) => page.locator('[data-shelf="band"]');
const progress = (page: Page) => page.getByRole("progressbar", { name: "Story progress" });

async function readStore(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), RESUME_KEY);
}

async function places(page: Page): Promise<ResumeStore["tapes"]> {
  return sanitizeResume(await readStore(page)).tapes;
}

async function openShelf(page: Page) {
  await page.goto("/read");
  await expect(faces(page).first()).toBeVisible({ timeout: 20000 });
}

/** The cover gate of a tape opened by its link (or ?demo=1). */
async function openCover(page: Page, url: string) {
  await page.goto(url);
  await expect(root(page)).toHaveAttribute("data-view", "cover", { timeout: 20000 });
}

/** Turn to `page` (1-based) with the arrow key, one settled page at a time. */
async function arrowTo(page: Page, target: number) {
  let at = Number(await root(page).getAttribute("data-page"));
  while (at < target) {
    await page.keyboard.press("ArrowRight");
    at += 1;
    await expect(root(page)).toHaveAttribute("data-page", String(at));
  }
}

/** The kit focus ring on a keyboard-focused control, as computed values. */
async function focusRing(target: Locator) {
  return target.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      focused: document.activeElement === el,
      visible: el.matches(":focus-visible"),
      style: cs.outlineStyle,
      width: parseFloat(cs.outlineWidth),
    };
  });
}

/* ================================================================= Node */

test.describe("T21 · the resume store (Node)", () => {
  const manifest = (over: Partial<SsyncManifest> = {}): SsyncManifest => ({
    version: "2.0",
    metadata: { title: "Twinkle Came to My Window", created: "2026-10-19T18:02:10Z" },
    pages: [1, 2, 3, 4, 5].map((id) => ({ id, text: { content: `Page ${id}.` } })),
    ...over,
  });
  const empty = (): ResumeStore => ({ v: 1, tapes: {} });

  test("tapeKey: the link in the tape, else the opened code, else created + title", () => {
    const linked = manifest({
      signature: { shareUrl: `https://storysynchq.vercel.app/read?story=${TWINKLE_CODE}` },
    });
    expect(tapeKey(linked)).toBe(`code:${TWINKLE_CODE}`);
    expect(tapeKey(linked, BATH_CODE), "the tape's own link wins over the door's code").toBe(`code:${TWINKLE_CODE}`);
    expect(tapeKey(manifest(), BATH_CODE)).toBe(`code:${BATH_CODE}`);
    expect(codeKey(BATH_CODE)).toBe(`code:${BATH_CODE}`);
    expect(tapeKey(manifest({ signature: { shareUrl: "https://storysynchq.vercel.app/read" } }), BATH_CODE)).toBe(
      `code:${BATH_CODE}`,
    );
    expect(tapeKey(manifest())).toBe("t:2026-10-19T18:02:10Z|Twinkle Came to My Window");
    const house = houseTape();
    expect(tapeKey(house)).toBe(`t:${house.metadata.created}|${house.metadata.title}`);
    expect(tapeKey(manifest({ metadata: { title: "" } })), "nothing to know it by: no key").toBeNull();
  });

  test("recordPage: page 2 onward only, 1-based, with the total and the time", () => {
    const at = new Date(NOW);
    const store = empty();
    expect(recordPage(store, TWINKLE_KEY, 0, 5, at), "page 1 is not a place").toBe(store);
    expect(recordPage(store, TWINKLE_KEY, 5, 5, at), "past the last page").toBe(store);
    expect(recordPage(store, TWINKLE_KEY, -1, 5, at)).toBe(store);
    expect(recordPage(store, TWINKLE_KEY, 1.5, 5, at)).toBe(store);

    const next = recordPage(store, TWINKLE_KEY, 2, 5, at);
    expect(next).not.toBe(store);
    expect(store.tapes, "the store passed in is left as it was").toEqual({});
    expect(next).toEqual({ v: 1, tapes: { [TWINKLE_KEY]: { page: 3, of: 5, at: NOW } } });
    expect(recordPage(next, TWINKLE_KEY, 4, 5, Date.parse(NOW)).tapes[TWINKLE_KEY]).toEqual({ page: 5, of: 5, at: NOW });
  });

  test("resumePoint: the page, or null when the tape changed or was never stopped", () => {
    const store = recordPage(empty(), TWINKLE_KEY, 2, 5, NOW);
    expect(resumePoint(store, TWINKLE_KEY, 5)).toEqual({ page: 3 });
    expect(resumePoint(store, TWINKLE_KEY, 6), "a page was added: the place is stale").toBeNull();
    expect(resumePoint(store, `code:${BATH_CODE}`, 5)).toBeNull();
    expect(resumePoint(store, null, 5)).toBeNull();
  });

  test("clearTape removes only that tape", () => {
    let store = recordPage(empty(), TWINKLE_KEY, 2, 5, NOW);
    store = recordPage(store, `code:${BATH_CODE}`, 1, 2, NOW);
    const cleared = clearTape(store, TWINKLE_KEY);
    expect(Object.keys(cleared.tapes)).toEqual([`code:${BATH_CODE}`]);
    expect(clearTape(cleared, TWINKLE_KEY), "nothing to clear: the same store").toBe(cleared);
  });

  test("a cap of 50 tapes: the least recently stopped goes first", () => {
    const hex = (n: number) => n.toString(16).padStart(32, "0");
    let store = empty();
    for (let i = 0; i < RESUME_CAP; i++) {
      store = recordPage(store, codeKey(hex(i + 1)), 1, 4, new Date(Date.UTC(2026, 9, 1, 0, i)));
    }
    expect(RESUME_CAP).toBe(50);
    expect(Object.keys(store.tapes)).toHaveLength(50);
    // stopping again in the oldest tape makes it recent; the second-oldest then goes
    store = recordPage(store, codeKey(hex(1)), 2, 4, new Date(Date.UTC(2026, 9, 2)));
    store = recordPage(store, codeKey(hex(99)), 1, 4, new Date(Date.UTC(2026, 9, 3)));
    expect(Object.keys(store.tapes)).toHaveLength(50);
    expect(store.tapes[codeKey(hex(1))]?.page).toBe(3);
    expect(store.tapes[codeKey(hex(2))], "the least recent went").toBeUndefined();
    expect(store.tapes[codeKey(hex(99))]?.page).toBe(2);
  });

  test("sanitizeResume ignores junk and keeps only clean places", () => {
    for (const junk of [null, undefined, "", "{not json", "[]", '{"v":2,"tapes":{}}', '{"v":1,"tapes":[]}', "42"]) {
      expect(sanitizeResume(junk), String(junk)).toEqual({ v: 1, tapes: {} });
    }
    const raw = JSON.stringify({
      v: 1,
      tapes: {
        [TWINKLE_KEY]: { page: 3, of: 5, at: NOW },
        "code:a": { page: "3", of: 5, at: NOW },
        "code:b": { page: Number.NaN, of: 5, at: NOW },
        "code:c": { page: 1, of: 5, at: NOW },
        "code:d": { page: 6, of: 5, at: NOW },
        "code:e": { page: 2.5, of: 5, at: NOW },
        "code:f": { page: 2, of: 5, at: "not a time" },
        "code:g": { page: 2, of: 5, at: NOW, heard: true },
        "": { page: 2, of: 5, at: NOW },
        "code:h": "page 2",
      },
    });
    expect(sanitizeResume(raw)).toEqual({ v: 1, tapes: { [TWINKLE_KEY]: { page: 3, of: 5, at: NOW } } });
    expect(sanitizeResume(JSON.parse(raw)), "an already-parsed value too").toEqual(sanitizeResume(raw));
    const store = recordPage(empty(), TWINKLE_KEY, 2, 5, NOW);
    expect(sanitizeResume(serializeResume(store))).toEqual(store);
  });

  test("latestResumed: the tape stopped most recently, among the ones still valid", () => {
    let store = recordPage(empty(), TWINKLE_KEY, 2, 5, LAST_NIGHT);
    store = recordPage(store, `code:${BATH_CODE}`, 1, 2, "2026-10-19T08:00:00.000Z");
    store = recordPage(store, `code:${GRANDMA_CODE}`, 1, 3, NOW);
    const shelf = [
      { key: `code:${BATH_CODE}`, total: 2 },
      { key: TWINKLE_KEY, total: 5 },
      { key: `code:${GRANDMA_CODE}`, total: 1 },
    ];
    expect(latestResumed(store, shelf), "Grandma's place is stale (her tape changed)").toBe(TWINKLE_KEY);
    expect(latestResumed(empty(), shelf)).toBeNull();
  });

  test("placeKeysOfTape: every key a library row's place could be under, from any door", () => {
    const linked = manifest({
      signature: { shareUrl: `https://storysynchq.vercel.app/read?story=${TWINKLE_CODE}` },
    });
    // the link in the tape, the code it was shared under, its library id, and
    // its created + title (a door with no link: a file saved before it had one)
    expect([...placeKeysOfTape(linked, { id: "lib-twinkle-1", shareCode: BATH_CODE })].sort()).toEqual(
      [
        `code:${TWINKLE_CODE}`,
        `code:${BATH_CODE}`,
        "code:lib-twinkle-1",
        "t:2026-10-19T18:02:10Z|Twinkle Came to My Window",
      ].sort(),
    );
    // a tape that was never shared is known by its created + title alone
    expect(placeKeysOfTape(manifest(), { id: "lib-twinkle-1" }).sort()).toEqual(
      ["code:lib-twinkle-1", "t:2026-10-19T18:02:10Z|Twinkle Came to My Window"].sort(),
    );
    // an untitled tape: as stored, and as the Player names it ("Untitled Story")
    const untitled = manifest({ metadata: { title: "", created: "2026-10-19T18:02:10Z" } });
    expect(placeKeysOfTape(untitled, {}).sort()).toEqual(
      ["t:2026-10-19T18:02:10Z|", "t:2026-10-19T18:02:10Z|Untitled Story"].sort(),
    );
    // a row whose tape is junk is still known by its id and code
    expect(placeKeysOfTape(null, { id: "lib-x", shareCode: BATH_CODE }).sort()).toEqual(
      ["code:lib-x", `code:${BATH_CODE}`].sort(),
    );
  });

  test("the storage half is SSR-safe: no window reads as no places, and nothing throws", () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined");
    expect(readResume()).toEqual({ v: 1, tapes: {} });
    expect(() => writeResume(recordPage(empty(), TWINKLE_KEY, 2, 5, NOW))).not.toThrow();
    expect(forgetPlaces([TWINKLE_KEY, null])).toEqual({ v: 1, tapes: {} });
    expect(placeKeysOfStories(["lib-x"]), "no library here: the id alone").toEqual(["code:lib-x"]);
  });
});

test.describe("T21 · PRIVACY.md (Node)", () => {
  test('"What is stored where" gains the place row, appended after T20b\'s', () => {
    const doc = fs.readFileSync(path.resolve(__dirname, "..", "PRIVACY.md"), "utf8");
    const rows = doc.split("\n").filter((line) => line.startsWith("|"));
    const place =
      "| Where you stopped in each tape (a page number) | this browser's localStorage | as you read | finishing the tape, pulling it out or deleting the story, taking it off the shelf, or clearing browser data |";
    expect(rows).toContain(place);
    expect(rows.indexOf(place), "append-only: after the shelf-visit row").toBeGreaterThan(
      rows.findIndex((line) => line.startsWith("| When you last looked at the shelf")),
    );
  });
});

/* ================================================================== E2E */

test.describe("T21 · resume on /read", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW);
  });

  test("a link: nothing before Tap to Begin; page 3 remembered; the cover offers it; it opens on page 3", async ({
    page,
  }) => {
    await seedShelf(page, { library: library() });
    await openCover(page, `/read?story=${TWINKLE_CODE}`);
    const storedKeys = () => page.evaluate(() => Object.keys(window.localStorage).sort());
    const before = await storedKeys();

    // a first visit: today's cover, exactly
    await expect(cover(page).locator('[data-pl="resume"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: PICK_UP })).toHaveCount(0);
    await page.waitForTimeout(400);
    expect(await readStore(page), "nothing is recorded before Tap to Begin").toBeNull();

    // from here on, reading sends nothing anywhere
    const asked: string[] = [];
    page.on("request", (req) => {
      const type = req.resourceType();
      if (type !== "fetch" && type !== "xhr" && type !== "ping" && type !== "beacon") return;
      const url = new URL(req.url());
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/__nextjs")) return;
      asked.push(req.url());
    });

    await page.getByRole("button", { name: /Tap to Begin/i }).click();
    await expect(root(page)).toHaveAttribute("data-view", "page");
    await arrowTo(page, 3);
    await expect.poll(() => places(page)).toEqual({ [TWINKLE_KEY]: { page: 3, of: 5, at: NOW } });
    // one key, one envelope, nothing else about the listening
    expect(JSON.parse((await readStore(page)) ?? "null")).toEqual({
      v: 1,
      tapes: { [TWINKLE_KEY]: { page: 3, of: 5, at: NOW } },
    });
    expect(await storedKeys(), "reading adds one key: the place").toEqual([...before, RESUME_KEY].sort());
    expect(asked, "nothing is sent").toEqual([]);

    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/story=/, { timeout: 20000 });

    await openCover(page, `/read?story=${TWINKLE_CODE}`);
    const row = cover(page).locator('[data-pl="resume"]');
    await expect(row).toContainText(STOPPED(3));
    await expect(row.getByRole("button", { name: PICK_UP })).toBeVisible();
    expect(await cover(page).innerText()).not.toMatch(NO_HISTORY);
    // the gold Tap to Begin is unchanged and comes first; the ghost sits under it
    const boxes = await cover(page).evaluate((el) => {
      const gold = [...el.querySelectorAll("button")].find((b) => /Tap to Begin/.test(b.textContent ?? ""));
      const ghost = el.querySelector('[data-pl="resume"] button');
      return {
        gold: gold?.getAttribute("data-variant"),
        ghost: ghost?.getAttribute("data-variant"),
        below: !!gold && !!ghost && ghost.getBoundingClientRect().top >= gold.getBoundingClientRect().bottom,
      };
    });
    expect(boxes).toEqual({ gold: "gold", ghost: "ghost", below: true });

    await row.getByRole("button", { name: PICK_UP }).click();
    await expect(root(page)).toHaveAttribute("data-view", "page");
    await expect(root(page)).toHaveAttribute("data-page", "3");
    await expect(progress(page)).toHaveAttribute("aria-valuetext", "Page 3 of 5");
  });

  test("a link with a place: Tap to Begin still starts at page 1", async ({ page }) => {
    await seedShelf(page, { library: library(), resume: { [TWINKLE_KEY]: resumeAt(3, 5, LAST_NIGHT) } });
    await openCover(page, `/read?story=${TWINKLE_CODE}`);
    await expect(cover(page).locator('[data-pl="resume"]')).toContainText(STOPPED(3));

    await page.getByRole("button", { name: /Tap to Begin/i }).click();
    await expect(root(page)).toHaveAttribute("data-view", "page");
    await expect(root(page)).toHaveAttribute("data-page", "1");
    await expect(progress(page)).toHaveAttribute("aria-valuetext", "Page 1 of 5");
    expect(await places(page), "page 1 is not a place: the old one stays").toEqual({
      [TWINKLE_KEY]: { page: 3, of: 5, at: LAST_NIGHT },
    });
  });

  test("a place from an older version of the tape is not offered", async ({ page }) => {
    await seedShelf(page, { library: library(), resume: { [TWINKLE_KEY]: resumeAt(3, 7, LAST_NIGHT) } });
    await openCover(page, `/read?story=${TWINKLE_CODE}`);
    await expect(page.getByRole("button", { name: /Tap to Begin/i })).toBeVisible();
    await expect(cover(page).locator('[data-pl="resume"]')).toHaveCount(0);
  });

  test("the shelf: the tape with the latest place is selected; its band offers it; Start again is page 1", async ({
    page,
  }) => {
    await seedShelf(page, { library: library(), resume: { [TWINKLE_KEY]: resumeAt(3, 5, LAST_NIGHT) } });
    await openShelf(page);

    // Bath Time Song is newer (T20a's default), but Twinkle has the place
    await expect(face(page, TWINKLE_CODE)).toHaveAttribute("aria-checked", "true");
    await expect(face(page, BATH_CODE)).toHaveAttribute("aria-checked", "false");
    await expect(band(page).locator(".rr-band-line")).toHaveText(`${TWINKLE.title} · ${TWINKLE.byline}`);
    const line = band(page).getByText(STOPPED(3), { exact: true });
    await expect(line).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const type = await line.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { family: cs.fontFamily.toLowerCase(), weight: cs.fontWeight, size: cs.fontSize };
    });
    expect(type.family).toContain("fraunces");
    expect(type).toMatchObject({ weight: "700", size: "22px" });
    const pickUp = band(page).getByRole("button", { name: PICK_UP });
    const again = band(page).getByRole("button", { name: START_AGAIN });
    await expect(pickUp).toHaveAttribute("data-variant", "gold");
    await expect(again).toHaveAttribute("data-variant", "ghost");
    await expect(band(page).getByRole("button", { name: "Play this tape" })).toHaveCount(0);
    await expect(band(page).getByRole("button", { name: "Pull the tape out" }), "the pull-out stays").toBeVisible();
    expect(await band(page).innerText()).not.toMatch(NO_HISTORY);

    // Pick up where you left off: the cover (no offer: the shelf chose), Tap to Begin → page 3
    await pickUp.click();
    await expect(root(page)).toHaveAttribute("data-view", "cover", { timeout: 20000 });
    await expect(cover(page).locator('[data-pl="resume"]')).toHaveCount(0);
    await page.getByRole("button", { name: /Tap to Begin/i }).click();
    await expect(root(page)).toHaveAttribute("data-page", "3");
    await expect(progress(page)).toHaveAttribute("aria-valuetext", "Page 3 of 5");
    await page.keyboard.press("Escape");
    await expect(band(page)).toBeVisible({ timeout: 20000 });

    // Start again: the cover, Tap to Begin → page 1
    await expect(band(page).getByText(STOPPED(3), { exact: true })).toBeVisible();
    await band(page).getByRole("button", { name: START_AGAIN }).click();
    await expect(root(page)).toHaveAttribute("data-view", "cover", { timeout: 20000 });
    await expect(cover(page).locator('[data-pl="resume"]')).toHaveCount(0);
    await page.getByRole("button", { name: /Tap to Begin/i }).click();
    await expect(root(page)).toHaveAttribute("data-page", "1");
    await expect(progress(page)).toHaveAttribute("aria-valuetext", "Page 1 of 5");
  });

  test("Start again: once the tape has begun again, the old place is forgotten", async ({ page }) => {
    await seedShelf(page, { library: library(), resume: { [TWINKLE_KEY]: resumeAt(3, 5, LAST_NIGHT) } });
    await openShelf(page);
    await band(page).getByRole("button", { name: START_AGAIN }).click();
    await expect(root(page)).toHaveAttribute("data-view", "cover", { timeout: 20000 });
    await page.waitForTimeout(300);
    expect(await places(page), "choosing is not beginning: the place stays on the cover").toEqual({
      [TWINKLE_KEY]: { page: 3, of: 5, at: LAST_NIGHT },
    });

    await page.getByRole("button", { name: /Tap to Begin/i }).click();
    await expect(root(page)).toHaveAttribute("data-page", "1");
    await expect.poll(() => readStore(page), "begun again: the old place goes").toBeNull();
    // from here it is an ordinary reading: page 2 is a place, and going back
    // to page 1 keeps it (page 1 is never a place)
    await arrowTo(page, 2);
    await expect.poll(() => places(page)).toEqual({ [TWINKLE_KEY]: { page: 2, of: 5, at: NOW } });
    await page.keyboard.press("ArrowLeft");
    await expect(root(page)).toHaveAttribute("data-page", "1");
    await page.waitForTimeout(300);
    expect(await places(page)).toEqual({ [TWINKLE_KEY]: { page: 2, of: 5, at: NOW } });

    await page.keyboard.press("Escape");
    await expect(band(page)).toBeVisible({ timeout: 20000 });
    await expect(band(page).getByText(STOPPED(2), { exact: true })).toBeVisible();
  });

  test("Start again and close on page 1: the band does not offer the old place", async ({ page }) => {
    await seedShelf(page, { library: library(), resume: { [TWINKLE_KEY]: resumeAt(3, 5, LAST_NIGHT) } });
    await openShelf(page);
    await band(page).getByRole("button", { name: START_AGAIN }).click();
    await page.getByRole("button", { name: /Tap to Begin/i }).click();
    await expect(root(page)).toHaveAttribute("data-page", "1");
    await page.keyboard.press("Escape");
    await expect(band(page)).toBeVisible({ timeout: 20000 });
    await expect(face(page, TWINKLE_CODE)).toHaveAttribute("aria-checked", "true");
    await expect(band(page).getByRole("button", { name: "Play this tape" })).toBeVisible();
    await expect(band(page).getByText(/You stopped at page/)).toHaveCount(0);
    expect(await readStore(page)).toBeNull();
  });

  test("a short phone (320×568): the cover with the offer fits one screen, with room to spare", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await seedShelf(page, { library: library(), resume: { [TWINKLE_KEY]: resumeAt(3, 5, LAST_NIGHT) } });
    await openCover(page, `/read?story=${TWINKLE_CODE}`);
    await expect(cover(page).locator('[data-pl="resume"]')).toContainText(STOPPED(3));
    await page.evaluate(() => document.fonts.ready);
    // two snapshots that agree: the cover's entrance has settled
    // the cover centres its column: the slack is the room the column leaves
    // inside the cover's padding (shared above and below it)
    const measure = () =>
      cover(page).evaluate((el) => {
        const cs = getComputedStyle(el);
        const column = el.querySelector(".pl-cover-note")?.parentElement as HTMLElement;
        const room = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        return {
          scrolls: el.scrollHeight > el.clientHeight,
          spare: Math.round(room - column.getBoundingClientRect().height),
        };
      });
    let last = "";
    await expect
      .poll(async () => {
        const now = JSON.stringify(await measure());
        const same = now === last;
        last = now;
        return same;
      })
      .toBe(true);
    const fit = await measure();
    expect(fit.scrolls, "the whole gate in one screen").toBe(false);
    expect(fit.spare, "real slack under the note").toBeGreaterThanOrEqual(12);
    // the offer keeps a comfortable target
    const target = await cover(page).getByRole("button", { name: PICK_UP }).boundingBox();
    expect(target?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test("on a phone, a resumed tape far along the shelf is brought into sight; the page never scrolls", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const newer = ["Bath Time Song", "Rain Boots", "The Blue Kite", "Pancake Day"].map((title, i) =>
      shelfRow(pictureLessTape(title, ""), `7c21${i}`.padEnd(32, String(i)), `2026-10-2${i}T08:00:00.000Z`),
    );
    await seedShelf(page, {
      library: [...newer, shelfRow(twinkleStory(), TWINKLE_CODE, "2026-10-01T18:10:00.000Z")],
      resume: { [TWINKLE_KEY]: resumeAt(3, 5, LAST_NIGHT) },
    });
    await openShelf(page);
    const twinkle = face(page, TWINKLE_CODE);
    await expect(twinkle).toHaveAttribute("aria-checked", "true");
    await expect(band(page).getByText(STOPPED(3), { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        twinkle.evaluate((el) => {
          const scroller = el.closest('[data-sk="shelf"]') as HTMLElement;
          const f = el.getBoundingClientRect();
          const s = scroller.getBoundingClientRect();
          return f.left >= s.left - 1 && f.right <= s.right + 1 && window.scrollX === 0;
        }),
      )
      .toBe(true);
  });

  test("the end card clears the place; the band is T20a's again", async ({ page }) => {
    await seedShelf(page, { library: library(), resume: { [TWINKLE_KEY]: resumeAt(3, 5, LAST_NIGHT) } });
    await openShelf(page);
    await band(page).getByRole("button", { name: PICK_UP }).click();
    await page.getByRole("button", { name: /Tap to Begin/i }).click();
    await expect(root(page)).toHaveAttribute("data-page", "3");
    await arrowTo(page, 5);
    await expect.poll(() => places(page)).toEqual({ [TWINKLE_KEY]: { page: 5, of: 5, at: NOW } });
    await page.keyboard.press("ArrowRight");
    await expect(root(page)).toHaveAttribute("data-view", "end");
    await expect.poll(() => readStore(page), "finishing the tape leaves nothing behind").toBeNull();

    await page.keyboard.press("Escape");
    await expect(band(page)).toBeVisible({ timeout: 20000 });
    await expect(band(page).getByRole("button", { name: "Play this tape" })).toBeVisible();
    await expect(band(page).getByText(/You stopped at page/)).toHaveCount(0);
    await expect(band(page).getByRole("button", { name: PICK_UP })).toHaveCount(0);
  });

  test("pulling the tape out clears its place", async ({ page }) => {
    await seedShelf(page, {
      library: library(),
      resume: {
        [TWINKLE_KEY]: resumeAt(3, 5, LAST_NIGHT),
        [`t:${TWINKLE.created}|${TWINKLE.title}`]: resumeAt(2, 5, LAST_NIGHT),
        [`code:${BATH_CODE}`]: resumeAt(2, 2, "2026-10-19T08:00:00.000Z"),
      },
    });
    await openShelf(page);
    await expect(face(page, TWINKLE_CODE)).toHaveAttribute("aria-checked", "true");
    const pull = band(page).getByRole("button", { name: "Pull the tape out" });
    await pull.click();
    await band(page).getByRole("button", { name: "Tap again to delete everything" }).click();
    await expect(page.locator('[data-shelf="status"]')).toContainText("Pulled out.");
    await expect
      .poll(() => places(page), "every key Twinkle was known by goes; Bath Time Song's stays")
      .toEqual({ [`code:${BATH_CODE}`]: { page: 2, of: 2, at: "2026-10-19T08:00:00.000Z" } });
    // the next tape is selected, with its own place
    await expect(face(page, BATH_CODE)).toHaveAttribute("aria-checked", "true", { timeout: 5000 });
    await expect(band(page).getByText(STOPPED(2), { exact: true })).toBeVisible();
  });

  test("taking a sent tape off this shelf clears its place", async ({ page }) => {
    const goodnight = loadTape("goodnight-mia").story;
    const grandma = sentRow(GOODNIGHT_MIA, GRANDMA_CODE, runtimeLabel(goodnight), LAST_NIGHT);
    await seedShelf(page, {
      library: library(),
      sent: [{ ...grandma, pages: 3 }],
      resume: { [`code:${GRANDMA_CODE}`]: resumeAt(2, 3, NOW) },
    });
    await openShelf(page);
    await expect(face(page, GRANDMA_CODE)).toHaveAttribute("aria-checked", "true");
    await expect(band(page).getByText(STOPPED(2), { exact: true })).toBeVisible();
    await expect(band(page).getByRole("button", { name: PICK_UP })).toBeVisible();
    await band(page).getByRole("button", { name: "Take it off this shelf" }).click();
    await expect(page.locator('[data-shelf="status"]')).toContainText("Taken off this shelf.");
    await expect.poll(() => readStore(page)).toBeNull();
  });

  test("the house tape remembers its place under its t: key and offers it on its cover", async ({ page }) => {
    const key = `t:${houseTape().metadata.created}|${houseTape().metadata.title}`;
    await openCover(page, "/read?demo=1");
    await expect(cover(page).locator('[data-pl="resume"]')).toHaveCount(0);
    await page.getByRole("button", { name: /Tap to Begin/i }).click();
    await expect(root(page)).toHaveAttribute("data-view", "page");
    await arrowTo(page, 2);
    await expect.poll(() => places(page)).toEqual({ [key]: { page: 2, of: houseTape().pages.length, at: NOW } });

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { level: 1, name: "Pick a tape." })).toBeVisible({ timeout: 20000 });
    await openCover(page, "/read?demo=1");
    await expect(cover(page).locator('[data-pl="resume"]')).toContainText(STOPPED(2));
    await cover(page).getByRole("button", { name: PICK_UP }).click();
    await expect(root(page)).toHaveAttribute("data-page", "2");
    await expect(progress(page)).toHaveAttribute(
      "aria-valuetext",
      `Page 2 of ${houseTape().pages.length}`,
    );
  });

  test("keyboard: cover and band buttons in visual order with the kit ring; ← → turn after resuming", async ({
    page,
  }) => {
    await seedShelf(page, { library: library(), resume: { [TWINKLE_KEY]: resumeAt(3, 5, LAST_NIGHT) } });

    // the band, after the ledge (the selected face, then the blank tape):
    // Pick up where you left off → Start again → Pull the tape out
    await openShelf(page);
    await face(page, TWINKLE_CODE).focus();
    await page.keyboard.press("Tab");
    await expect(page.locator(".pl-choice-3")).toBeFocused();
    await page.keyboard.press("Tab");
    const pickUp = band(page).getByRole("button", { name: PICK_UP });
    await expect(pickUp).toBeFocused();
    expect(await focusRing(pickUp)).toMatchObject({ focused: true, visible: true, style: "solid" });
    expect((await focusRing(pickUp)).width).toBeGreaterThanOrEqual(2);
    await page.keyboard.press("Tab");
    const again = band(page).getByRole("button", { name: START_AGAIN });
    await expect(again).toBeFocused();
    expect(await focusRing(again)).toMatchObject({ focused: true, visible: true, style: "solid" });
    // in visual order: the gold, then the ghost — left to right on one row, or
    // (phones, where the band's buttons stack) top to bottom
    const order = await band(page).evaluate((el) => {
      const [a, b] = [...el.querySelectorAll(".rr-band-actions > button")].map((x) => x.getBoundingClientRect());
      return (Math.abs(a.top - b.top) < 2 && b.left >= a.right) || b.top >= a.bottom;
    });
    expect(order).toBe(true);
    await page.keyboard.press("Tab");
    await expect(band(page).getByRole("button", { name: "Pull the tape out" })).toBeFocused();

    // the cover of the link: Tap to Begin → Pick up where you left off
    await openCover(page, `/read?story=${TWINKLE_CODE}`);
    const tap = page.getByRole("button", { name: /Tap to Begin/i });
    await tap.focus();
    await page.keyboard.press("Tab");
    const offer = cover(page).getByRole("button", { name: PICK_UP });
    await expect(offer).toBeFocused();
    expect(await focusRing(offer)).toMatchObject({ focused: true, visible: true, style: "solid" });
    expect((await focusRing(offer)).width).toBeGreaterThanOrEqual(2);

    // Enter is the unlock gesture; the arrows still turn
    await page.keyboard.press("Enter");
    await expect(root(page)).toHaveAttribute("data-page", "3");
    await page.keyboard.press("ArrowRight");
    await expect(root(page)).toHaveAttribute("data-page", "4");
    await page.keyboard.press("ArrowLeft");
    await expect(root(page)).toHaveAttribute("data-page", "3");
  });

  test("reduced motion: the offer is there and works, with nothing moving", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seedShelf(page, { library: library(), resume: { [TWINKLE_KEY]: resumeAt(3, 5, LAST_NIGHT) } });
    await openCover(page, `/read?story=${TWINKLE_CODE}`);
    const row = cover(page).locator('[data-pl="resume"]');
    await expect(row).toContainText(STOPPED(3));
    const moving = await row.evaluate((el) =>
      [el, ...el.querySelectorAll("*")].filter((n) => getComputedStyle(n).animationName !== "none").length,
    );
    expect(moving).toBe(0);
    await row.getByRole("button", { name: PICK_UP }).click();
    await expect(root(page)).toHaveAttribute("data-page", "3");
  });
});

/* ======================================================= Studio (COPPA) */

test.describe("T21 · deleting the story in the Studio", () => {
  /** A device library id, unlike its share code (a row keeps both). */
  const LIBRARY_ID = "5a1d7c21-0000-4c0d-9e0a-7c21a7c21a71";

  test("Delete everything forgets every place the tape was kept under", async ({ page }) => {
    test.setTimeout(120000);
    const titleKey = `t:${TWINKLE.created}|${TWINKLE.title}`;
    const seeded = {
      [TWINKLE_KEY]: resumeAt(3, 5, LAST_NIGHT), // the link, the shelf
      [titleKey]: resumeAt(2, 5, LAST_NIGHT), // a file of it from before it had a link
      [codeKey(LIBRARY_ID)]: resumeAt(4, 5, LAST_NIGHT), // an old link that named the id
    };
    await seedShelf(page, {
      library: [{ ...shelfRow(twinkleStory(), TWINKLE_CODE, "2026-10-19T18:10:00.000Z"), id: LIBRARY_ID }],
      draft: publishedDraft(LIBRARY_ID, TWINKLE_CODE),
      resume: seeded,
    });

    // the Creator opens the tape it published, and publishes it again
    await page.goto("/studio");
    await restoreDraft(page);
    await page.getByRole("button", { name: "Finish my story" }).click();
    const question = page.locator('label[for="studio-gate-answer"]');
    await expect(question).toContainText(/\d+\s*[×x*]\s*\d+/, { timeout: 10000 });
    const [, a, b] = (await question.innerText()).match(/(\d+)\s*[×x*]\s*(\d+)/)!;
    await page.locator("#studio-gate-answer").fill(String(Number(a) * Number(b)));
    // a child's voice is on this tape: the grown-up's consent goes in the file
    await page.locator("#studio-gate-consent").check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Your tape is ready" })).toBeVisible({ timeout: 60000 });
    const rows = await page.evaluate(() => JSON.parse(window.localStorage.getItem("ssync-library") ?? "[]"));
    expect(rows.map((r: { id: string; shareCode: string }) => [r.id, r.shareCode])).toEqual([
      [LIBRARY_ID, TWINKLE_CODE],
    ]);
    expect(Object.keys(await places(page)).sort(), "publishing leaves the places alone").toEqual(
      Object.keys(seeded).sort(),
    );

    // one tap (and its confirmation) removes every copy, and every place
    await page.getByRole("button", { name: "Pull the tape out — delete everything", exact: true }).click();
    await page.getByRole("button", { name: /Tap again to delete everything/ }).click();
    await expect(page.getByRole("button", { name: "Finish my story" })).toBeVisible({ timeout: 20000 });
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("ssync-library")))
      .toBe("[]");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("ssync-resume")), "no place of the deleted story")
      .toBeNull();
  });
});
