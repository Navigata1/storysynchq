// T18 · "Send a thank-you back": the end card turns a listener into a maker.
//
// Reference: s06 phone 1 (the end card: a gold "Send a thank-you back" under
// the J-card, the line "Record one page in your voice. It goes back to Mia as
// her own little tape.", Read it again beside a gold-outline "Make your own
// story") and s06 phone 2 (Grandma's one-page Creator with a violet
// "Reply to · Twinkle Came to My Window" chip under the top bar). HANDOFF §5:
// `signature.replyTo` names the tape a reply answers, distinct from `remixOf`.
//
//   Node · the pure reply seed (src/lib/storysync/reply.ts), pinned against
//          the Twinkle and Goodnight, Mia fixtures
//   E2E  · /read?story=<code> → end card → /studio?reply=1 → publish, read back
//          from this device's library; the house tape has no reply; a file
//          without a shareUrl invents no replyTo; a saved draft is asked
//          about first; /studio?reply=1 with no seed is the plain Creator
//
// The family content is illustrative and lives in tests/fixtures only.

import { randomBytes } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  REPLY_SEED_KEY,
  parseReplySeed,
  replyLine,
  replySeed,
  serializeReplySeed,
} from "../src/lib/storysync/reply";
import type { SsyncManifest } from "../src/lib/storysync/manifest";
import {
  DRAFT_KEY,
  LIBRARY_KEY,
  openTapeInReadRoom,
  seedDeviceLibrary,
  seedStudioDraft,
} from "./fixtures/helpers";
import { FIXTURE_PATHS, GOODNIGHT_MIA, TWINKLE, loadTape } from "./fixtures/tapes";
import { stubMicrophone } from "./fixtures/mic";
import { watchSends } from "./fixtures/sends";

/* ------------------------------------------------------------------ facts */

const SEND = "Send a thank-you back";
const LINE_MIA = "Record one page in your voice. It goes back to Mia as its own little tape.";
const LINE_NOBODY = "Record one page in your voice. It goes back as its own little tape.";
const CHIP = `Reply to · ${TWINKLE.title}`;
const QUESTION = `Reply to ${TWINKLE.title}?`;
const REPLACE_BODY =
  "The story on the Stage will be replaced. It is only kept on this device, so download it first if you want to keep it.";
const MINE = "Mine — I'm the grown-up speaking";
const LINK_NAME = "What’s inside this tape?";

/* ===================================================================== Node */

test.describe("T18 · the reply seed (pure)", () => {
  test("Twinkle opened from a link: Mia, 'Thank you, Mia', its title, the link", () => {
    const twinkle = loadTape("twinkle").manifest;
    const link = "http://localhost:3000/read?story=0123456789abcdef0123456789abcdef";
    expect(replySeed(twinkle, link)).toEqual({
      name: "Mia",
      title: "Thank you, Mia",
      chipTitle: "Twinkle Came to My Window",
      replyTo: link,
    });
  });

  test("Goodnight, Mia: the narrator is the name, 'Grandma Rose'", () => {
    const seed = replySeed(loadTape("goodnight-mia").manifest, "http://x/read?story=ab");
    expect(seed.name).toBe("Grandma Rose");
    expect(seed.title).toBe("Thank you, Grandma Rose");
    expect(seed.chipTitle).toBe(GOODNIGHT_MIA.title);
  });

  test("no narrator: the lead name of the author; neither: 'Thank you' and no name", () => {
    const base: SsyncManifest = { version: "2.0", metadata: { title: "Ada's Kite" }, pages: [{ id: 1 }] };
    const byAuthor = replySeed({ ...base, metadata: { ...base.metadata, author: "Ada, age 5 — with Dad" } });
    expect(byAuthor.name).toBe("Ada");
    expect(byAuthor.title).toBe("Thank you, Ada");

    const nobody = replySeed({ ...base, metadata: { ...base.metadata, author: "  ", narrator: " " } });
    expect(nobody).toEqual({ title: "Thank you", chipTitle: "Ada's Kite" });
    expect(nobody.name).toBeUndefined();
    expect("name" in nobody).toBe(false);
  });

  test("the tape's own shareUrl wins over the link it was opened from; no URL anywhere → no replyTo", () => {
    const base: SsyncManifest = {
      version: "2.0",
      metadata: { title: "Ada's Kite", narrator: "Ada" },
      signature: { shareUrl: "https://storysynchq.vercel.app/read?story=feedfacefeedfacefeedfacefeedface" },
      pages: [{ id: 1 }],
    };
    expect(replySeed(base, "http://localhost:3000/read?story=00").replyTo).toBe(base.signature!.shareUrl);

    const fileOnly = replySeed(loadTape("twinkle").manifest);
    expect(fileOnly.replyTo).toBeUndefined();
    expect("replyTo" in fileOnly).toBe(false);
    expect(fileOnly.title).toBe("Thank you, Mia");
  });

  test("the line names the name, or nobody; the seed travels as strings only", () => {
    expect(replyLine("Mia")).toBe(LINE_MIA);
    expect(replyLine(undefined)).toBe(LINE_NOBODY);

    const seed = replySeed(loadTape("twinkle").manifest, "http://x/read?story=ab");
    const raw = serializeReplySeed(seed);
    expect(JSON.parse(raw)).toEqual(seed);
    expect(parseReplySeed(raw)).toEqual(seed);
    expect(REPLY_SEED_KEY).toBe("ssync-reply-seed");

    // anything else is not a seed: never trusted, never half-used
    expect(parseReplySeed(null)).toBeNull();
    expect(parseReplySeed("not json")).toBeNull();
    expect(parseReplySeed(JSON.stringify({ title: 3, chipTitle: "x" }))).toBeNull();
    expect(parseReplySeed(JSON.stringify({ title: "Thank you" }))).toBeNull();
    // unknown keys are dropped, a non-string optional is dropped
    expect(
      parseReplySeed(JSON.stringify({ title: "Thank you", chipTitle: "Kite", replyTo: 7, pages: [1], name: "" })),
    ).toEqual({ title: "Thank you", chipTitle: "Kite" });
  });
});

/* ====================================================================== E2E */

const frames = (page: Page): Locator => page.locator("[data-page-index]");

interface LibraryRow {
  shareCode?: string;
  createdAt?: string;
  ssyncData: SsyncManifest;
}

async function readLibrary(page: Page): Promise<LibraryRow[]> {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || "[]"), LIBRARY_KEY);
}

async function storedDraft(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), DRAFT_KEY);
}

/** Pass the cover gate and ArrowRight to the end card. */
async function walkToEnd(page: Page, url?: string): Promise<Locator> {
  if (url) await page.goto(url);
  const root = page.locator(".pl-root");
  await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
  await page.getByRole("button", { name: /Tap to Begin/ }).click();
  await expect(root).toHaveAttribute("data-view", "page");
  for (let i = 0; i < 12; i++) {
    if ((await root.getAttribute("data-view")) === "end") break;
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(320);
  }
  await expect(root).toHaveAttribute("data-view", "end");
  const end = page.locator('[data-pl="end"]');
  await expect(end).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => true));
  // the card's rise has landed (finite animations only), so boxes hold still
  await end.evaluate((el) =>
    Promise.all(
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  return end;
}

/** Seed Twinkle under a fresh 128-bit code; returns the code and the link it lives at. */
async function seedTwinkle(page: Page, baseURL: string | undefined): Promise<{ code: string; link: string }> {
  const code = randomBytes(16).toString("hex");
  await seedDeviceLibrary(page, "twinkle", { shareCode: code });
  return { code, link: `${new URL(baseURL!).origin}/read?story=${code}` };
}

/** The reply's chip, once the Creator has opened on it. */
function chip(page: Page): Locator {
  return page.locator('[data-studio="reply-to"]');
}

async function expectReplyCreator(page: Page): Promise<void> {
  await expect(chip(page)).toBeVisible({ timeout: 30000 });
  await expect(chip(page)).toHaveText(CHIP);
  await expect(frames(page)).toHaveCount(1);
  await expect(page.locator("#studio-title")).toHaveValue("Thank you, Mia");
}

/** "Finish my story" → the gate: the sum, "Mine", the byline, consent, Continue. */
/**
 * Pass the gate as the grown-up and choose "Mine". With `unanswered`, first
 * check that a reply's gate opens with no answer to "Whose voice is on this
 * tape?" (M6: a reply may be a grandparent's own voice or a child's, so neither
 * is presumed), no consent sentence to tick, and Continue waiting.
 */
async function publishAsGrownUp(page: Page, byline: string, opts: { unanswered?: boolean } = {}): Promise<void> {
  const close = page.getByRole("button", { name: "Close Voice" });
  if (await close.isVisible()) await close.click();
  await page.getByRole("button", { name: "Finish my story" }).click();
  const dialog = page.getByRole("dialog", { name: "A grown-up moment" });
  await expect(dialog).toBeVisible({ timeout: 15000 });
  const question = page.locator('label[for="studio-gate-answer"]');
  await expect(question).toContainText(/\d+\s*×\s*\d+/);
  const [, a, b] = (await question.innerText()).match(/(\d+)\s*×\s*(\d+)/)!;
  await page.locator("#studio-gate-answer").fill(String(Number(a) * Number(b)));
  await page.locator("#studio-gate-author").fill(byline);
  const mine = dialog.getByRole("radio", { name: MINE });
  if (opts.unanswered) {
    const childs = dialog.getByRole("radio", { name: "A child's — I'm their parent or guardian" });
    await expect(mine).not.toBeChecked();
    await expect(childs).not.toBeChecked();
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);
    await expect(dialog.getByText("I am this child's parent or guardian", { exact: false })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Continue" })).toBeDisabled();
    // No half-empty consent box: no "This consent…" pointing at nothing and no
    // 07 badge — one line says what comes first, and why Continue waits.
    await expect(dialog.getByText(/This consent is written into the tape/)).toHaveCount(0);
    const prompt = dialog.locator('[data-studio="consent-prompt"]');
    await expect(prompt).toHaveText("Choose whose voice it is first.");
    await expect(prompt).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Continue" })).toHaveAccessibleDescription(
      "Choose whose voice it is first.",
    );
    await mine.check();
    await expect(prompt).toHaveCount(0);
    await expect(dialog.getByText(/This consent is written into the tape/)).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: "This is my own voice, and I'm happy to share it." })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Continue" }), "chosen, not yet ticked").toBeDisabled();
  }
  if ((await mine.count()) > 0) await mine.check();
  for (const box of await dialog.locator('input[type="checkbox"]').all()) await box.check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your tape is ready" })).toBeVisible({ timeout: 30000 });
}

/** The library row the reply wrote (the only one titled "Thank you, Mia"). */
async function replyRow(page: Page): Promise<SsyncManifest> {
  const rows = (await readLibrary(page)).filter((r) => r.ssyncData?.metadata?.title === "Thank you, Mia");
  expect(rows, "one reply in the library").toHaveLength(1);
  return rows[0].ssyncData;
}

test.describe("T18 · the end card offers a thank-you", () => {
  test.setTimeout(90000);

  test("a linked tape: the gold reply, its line, then Read it again and a gold-outline Make your own story", async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { code } = await seedTwinkle(page, baseURL);
    const end = await walkToEnd(page, `/read?story=${code}`);

    const send = end.getByRole("button", { name: SEND });
    await expect(send).toBeVisible();
    await expect(send.locator("svg.lucide-mic")).toHaveCount(1);
    const line = end.getByText(LINE_MIA, { exact: true });
    await expect(line).toBeVisible();
    expect(await line.evaluate((el) => getComputedStyle(el).fontSize)).toBe("12.5px");

    // the reply is the one filled gold action now
    const gold = end.locator('[data-sk="big"][data-variant="gold"]');
    await expect(gold).toHaveCount(1);
    await expect(gold).toHaveText(SEND);

    // Read it again (ghost, Repeat) · Make your own story (gold outline, Star)
    const again = end.getByRole("button", { name: "Read it again" });
    const make = end.getByRole("button", { name: "Make your own story" });
    await expect(again).toHaveAttribute("data-variant", "ghost");
    await expect(again.locator("svg.lucide-repeat")).toHaveCount(1);
    await expect(make.locator("svg.lucide-star")).toHaveCount(1);
    const outline = await make.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        image: cs.backgroundImage,
        bg: cs.backgroundColor,
        border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
        color: cs.color,
      };
    });
    expect(outline.image, "no gold fill").toBe("none");
    // a gold outline over the room: at most the reference's faint 8% gold wash
    const bgAlpha = Number((outline.bg.match(/rgba?\(([^)]+)\)/)?.[1].split(",")[3] ?? "1").trim());
    expect(outline.bg === "rgba(0, 0, 0, 0)" || bgAlpha <= 0.1, `background ${outline.bg}`).toBe(true);
    // s06 `.s06-goldline`: 1.5px (a 1x screen draws it on one device pixel)
    expect(outline.border).toMatch(/^1(\.5)?px solid rgba\(245, 158, 11, 0\.75\)$/);
    expect(outline.color).toBe("rgb(251, 191, 74)");

    // after the J-card's last row, before the pair; the pair side by side
    // (every box read in one frame)
    const boxes = await end.evaluate((el) => {
      const box = (sel: string) => {
        const r = el.querySelector(sel)!.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      };
      return {
        jcard: box('[role="group"][aria-label="Liner notes"]'),
        send: box(".pl-end-send"),
        line: box(".pl-end-sendnote"),
        again: box(".pl-end-again"),
        make: box(".pl-end-make"),
      };
    });
    expect(boxes.send.height, "a large target").toBeGreaterThanOrEqual(56);
    expect(boxes.send.top).toBeGreaterThanOrEqual(boxes.jcard.bottom);
    expect(boxes.line.top).toBeGreaterThanOrEqual(boxes.send.bottom);
    expect(boxes.again.top).toBeGreaterThanOrEqual(boxes.line.bottom);
    expect(Math.abs(boxes.again.top - boxes.make.top)).toBeLessThan(2);
    // full width: as wide as the J-card
    expect(Math.abs(boxes.send.width - boxes.jcard.width)).toBeLessThan(2);

    // the T12 card is otherwise the same: no Idea, no Next, one title
    await expect(end.getByText("Idea", { exact: true })).toHaveCount(0);
    await expect(end.getByText("Next", { exact: true })).toHaveCount(0);
    await expect(end.getByText(TWINKLE.title)).toHaveCount(1);
  });

  test("keyboard: link → Send a thank-you back → Read it again → Make your own story → Close, each with the ring", async ({
    page,
    baseURL,
  }) => {
    const { code } = await seedTwinkle(page, baseURL);
    await walkToEnd(page, `/read?story=${code}`);
    const seen: Array<{ name: string; outline: string; inEnd: boolean }> = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      seen.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          const cs = el ? getComputedStyle(el) : null;
          return {
            name: (el?.getAttribute("aria-label") || el?.textContent || "").trim(),
            outline: cs ? `${cs.outlineWidth} ${cs.outlineStyle}` : "",
            inEnd: !!el?.closest('[data-pl="end"]'),
          };
        }),
      );
    }
    expect(seen.map((s) => s.name)).toEqual([LINK_NAME, SEND, "Read it again", "Make your own story", "Close"]);
    for (const s of seen) {
      expect(s.inEnd, `${s.name} is on the end card`).toBe(true);
      expect(s.outline, `${s.name} shows the kit focus ring`).toBe("3px solid");
    }
  });

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 390, height: 844 },
  ]) {
    test(`${viewport.width}×${viewport.height}: the card scrolls inside itself, no side scroll, a ≥ 56 px reply`, async ({
      page,
      baseURL,
    }) => {
      await page.setViewportSize(viewport);
      const { code } = await seedTwinkle(page, baseURL);
      const end = await walkToEnd(page, `/read?story=${code}`);
      await expect(end.locator('[data-pl="qr"]')).toBeVisible({ timeout: 10000 });
      const sides = await end.evaluate((el) => ({
        end: el.scrollWidth - el.clientWidth,
        doc: document.documentElement.scrollWidth - window.innerWidth,
        page: document.documentElement.scrollHeight - window.innerHeight,
      }));
      expect(sides.end, "the end card scrolls sideways").toBeLessThanOrEqual(0);
      expect(sides.doc, "the page scrolls sideways").toBeLessThanOrEqual(0);
      expect(sides.page, "the page itself never scrolls: the card does").toBeLessThanOrEqual(0);

      const send = end.getByRole("button", { name: SEND });
      const box = (await send.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(56);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);

      // scrolled to its foot inside itself, the card's last line is in view
      await end.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await page.waitForTimeout(100);
      const last = (await end.getByText("Nobody is counting plays. This page has no trackers.").boundingBox())!;
      expect(last.y).toBeGreaterThanOrEqual(0);
      expect(last.y + last.height).toBeLessThanOrEqual(viewport.height);
    });
  }

  test("the house tape: no reply and no line; the end card is exactly T12's", async ({ page }) => {
    const end = await walkToEnd(page, "/read?demo=1");
    await expect(page.getByRole("button", { name: SEND })).toHaveCount(0);
    await expect(end.getByText(/Record one page in your voice/)).toHaveCount(0);
    const gold = end.locator('[data-sk="big"][data-variant="gold"]');
    await expect(gold).toHaveCount(1);
    await expect(gold).toHaveText("Make your own story");
  });
});

test.describe("T18 · the reply opens in the Creator", () => {
  test.setTimeout(120000);

  test("click: one blank page, 'Thank you, Mia', the chip; the seed is gone, the flag cleaned; it survives a reload", async ({
    page,
    baseURL,
  }) => {
    const origin = new URL(baseURL!).origin;
    const { code, link } = await seedTwinkle(page, baseURL);
    const end = await walkToEnd(page, `/read?story=${code}`);

    const foreign = watchSends(page, { types: "all", foreignTo: origin });
    const before = await page.evaluate(() => Object.keys(window.localStorage).sort());

    // Hold the Creator's route for a moment, so the room can be heard falling silent first.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/studio(\?|$)/, async (route) => {
      await held;
      await route.continue();
    });
    const musicPlaying = () =>
      page.evaluate(() => {
        const w = window as unknown as { __ssyncPlayer?: { musicPlaying: () => boolean } };
        return w.__ssyncPlayer ? w.__ssyncPlayer.musicPlaying() : "unmounted";
      });
    // the end card still has the bed under it…
    await expect.poll(musicPlaying, { timeout: 10000 }).toBe(true);
    await end.getByRole("button", { name: SEND }).click();
    // …and the reply silences it, before the Creator arrives
    await expect.poll(musicPlaying).toBe(false);
    await expect(page.locator(".pl-root")).toHaveAttribute("data-music", "off");
    release();
    await page.unroute(/\/studio(\?|$)/);

    await expectReplyCreator(page);
    await expect(page).toHaveURL(/\/studio$/);
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), REPLY_SEED_KEY)).toBeNull();

    // the chip: violet, a Heart, directly under the top bar
    await expect(chip(page).locator("svg.lucide-heart")).toHaveCount(1);
    const place = await page.evaluate(() => ({
      bar: document.querySelector(".studio-topbar")!.getBoundingClientRect().bottom,
      chip: document.querySelector('[data-studio="reply-to"]')!.getBoundingClientRect().top,
    }));
    expect(place.chip).toBeGreaterThanOrEqual(place.bar - 0.5);
    expect(place.chip - place.bar).toBeLessThanOrEqual(12);
    expect(await chip(page).evaluate((el) => getComputedStyle(el).borderTopColor)).toBe("rgba(124, 107, 255, 0.5)");

    // the page is blank: no picture, no words, no voice
    await expect(frames(page).locator("img")).toHaveCount(0);
    await expect(page.locator("#studio-page-text")).toHaveValue("");
    expect((await frames(page).first().getAttribute("aria-label")) ?? "").not.toContain("has voice");

    // the draft: music on, the default mood, replyTo in the manifest, the chip title beside it
    await expect.poll(() => storedDraft(page), { timeout: 10000 }).not.toBeNull();
    const draft = JSON.parse((await storedDraft(page))!);
    expect(draft.state.musicOn).toBe(true);
    expect(draft.state.mood).toBe("Wonder");
    expect(draft.state.manifest.pages).toHaveLength(1);
    expect(draft.state.manifest.signature).toEqual({ replyTo: link });
    // M6: whom it goes back to rides with the chip, for the publish card's "Send it back to Mia".
    expect(draft.state.reply).toEqual({ title: TWINKLE.title, name: "Mia" });
    expect(JSON.stringify(draft.state.manifest)).not.toContain(TWINKLE.title);
    expect(draft.state.remix ?? null).toBeNull();

    // nothing fetched from anywhere else; nothing stored but the draft
    expect(foreign.urls()).toEqual([]);
    const after = await page.evaluate(() => Object.keys(window.localStorage).sort());
    expect(after.filter((k) => !before.includes(k))).toEqual([DRAFT_KEY]);

    // a reload: the restore prompt, then the chip again
    await page.reload();
    const keep = page.getByRole("button", { name: /Keep working on it/ });
    await expect(keep).toBeVisible({ timeout: 20000 });
    await keep.click();
    await expectReplyCreator(page);

    // "Start a new story" clears it
    await page.reload();
    await page.getByRole("button", { name: "Start a new story" }).click();
    await expect(page.locator("#studio-title")).toHaveValue("My Story");
    await expect(chip(page)).toHaveCount(0);
  });

  test("publish: photo, words, one take, 'Mine' → one page, replyTo = the Twinkle link, consent by self", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(150000);
    await stubMicrophone(page);
    const { code, link } = await seedTwinkle(page, baseURL);
    const end = await walkToEnd(page, `/read?story=${code}`);
    await end.getByRole("button", { name: SEND }).focus();
    await page.keyboard.press("Enter");
    await expectReplyCreator(page);
    // M6: a keyboard starts at the reply's first step, the Photo tool — not at <body>,
    // and never the title field (which would raise a phone's keyboard).
    await expect(page.locator('nav[aria-label="Story tools"]').getByRole("button", { name: "Photo" })).toBeFocused();

    await page.locator('input[type="file"][accept="image/*"]').setInputFiles(FIXTURE_PATHS["goodnight-mia"].pictures[0]);
    await expect(frames(page).locator("img")).toHaveCount(1, { timeout: 15000 });
    await page.locator("#studio-page-text").fill(GOODNIGHT_MIA.pages[0].text);

    await page.locator('[data-sk="transport"][data-kind="rec"]').click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);
    await page.getByRole("button", { name: /^Stop —/ }).click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByRole("button", { name: /^Page 1, has voice/ })).toBeVisible();

    await publishAsGrownUp(page, "Grandma Rose", { unanswered: true });
    // The card keeps the end card's promise ("It goes back to Mia").
    await expect(page.locator('[data-studio="reply-back"]')).toContainText("Send it back to Mia");
    const tape = await replyRow(page);
    expect(tape.pages).toHaveLength(1);
    expect(tape.pages[0].text?.audioCodec).toBe("aac");
    expect(tape.signature?.replyTo).toBe(link);
    expect(tape.signature).not.toHaveProperty("remixOf");
    expect(tape.signature?.voiceConsent).toHaveLength(1);
    expect(tape.signature?.voiceConsent?.[0].grantedBy).toBe("self");
    expect(tape.signature?.voiceConsent?.[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // the chip is draft-only: never in the published tape
    expect(JSON.stringify(tape)).not.toContain(TWINKLE.title);
    expect(tape).not.toHaveProperty("reply");
  });

  test("a tape opened from a file with no shareUrl: the chip still shows, and the reply has no replyTo", async ({
    page,
  }) => {
    await stubMicrophone(page);
    await openTapeInReadRoom(page, "twinkle");
    const end = await walkToEnd(page);
    await expect(end.getByText(LINE_MIA, { exact: true })).toBeVisible();
    await end.getByRole("button", { name: SEND }).click();
    await expectReplyCreator(page);

    await expect.poll(() => storedDraft(page), { timeout: 10000 }).not.toBeNull();
    const draft = JSON.parse((await storedDraft(page))!);
    expect(draft.state.manifest).not.toHaveProperty("signature");

    await page.locator("#studio-page-text").fill("Thank you for the story.");
    // M6: no link to reply to is still a reply: with a voice on it, the gate presumes
    // no grantor (the Studio passes initialGrantor={null}; there is no replyTo to detect).
    await page.locator('[data-sk="transport"][data-kind="rec"]').click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);
    await page.getByRole("button", { name: /^Stop —/ }).click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(0, { timeout: 10000 });
    await publishAsGrownUp(page, "Grandma Rose", { unanswered: true });
    await expect(page.locator('[data-studio="reply-back"]')).toHaveText(
      "Send it back to Mia — download the .storysync file and hand it over.",
    );
    const tape = await replyRow(page);
    expect(tape.signature ?? {}).not.toHaveProperty("replyTo");
    expect(tape.signature ?? {}).not.toHaveProperty("remixOf");

    // "delete everything" takes the reply, its draft and its chip with it
    await page.getByRole("button", { name: /Pull the tape out — delete everything/ }).click();
    await page.getByRole("button", { name: /Tap again to delete everything/ }).click();
    await expect(page.getByRole("button", { name: "Finish my story" })).toBeVisible();
    await expect(chip(page)).toHaveCount(0);
    await expect(page.locator("#studio-title")).toHaveValue("My Story");
    expect((await readLibrary(page)).filter((r) => r.ssyncData?.metadata?.title === "Thank you, Mia")).toEqual([]);
    await expect.poll(() => storedDraft(page), { timeout: 10000 }).toBeNull();
  });

  test("a saved story is asked about first: 'Keep my story' leaves it byte for byte, 'Start the reply' replaces it", async ({
    page,
    baseURL,
  }) => {
    await seedStudioDraft(page, "goodnight-mia");
    const { code } = await seedTwinkle(page, baseURL);
    let end = await walkToEnd(page, `/read?story=${code}`);
    const saved = await storedDraft(page);
    expect(saved).not.toBeNull();

    await end.getByRole("button", { name: SEND }).click();
    const dialog = page.getByRole("dialog", { name: QUESTION });
    await expect(dialog).toBeVisible({ timeout: 30000 });
    await expect(dialog).toContainText(REPLACE_BODY);
    await expect(page.getByRole("heading", { name: "Pick up where you left off?" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Keep my story" })).toBeFocused();

    await dialog.getByRole("button", { name: "Keep my story" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("#studio-title")).toHaveValue(GOODNIGHT_MIA.title);
    await expect(chip(page)).toHaveCount(0);
    await page.waitForTimeout(1500); // past the autosave debounce
    expect(await storedDraft(page)).toBe(saved);
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), REPLY_SEED_KEY)).toBeNull();

    // again, and this time start the reply (by keyboard)
    end = await walkToEnd(page, `/read?story=${code}`);
    await end.getByRole("button", { name: SEND }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: QUESTION })).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: "Start the reply" }).click();
    await expectReplyCreator(page);
  });

  test("/studio?reply=1 with nothing handed over is the Creator as it always opens", async ({ page }) => {
    await page.goto("/studio?reply=1");
    await expect(page.locator("#studio-title")).toHaveValue("My Story", { timeout: 20000 });
    await expect(frames(page)).toHaveCount(1);
    await page.waitForTimeout(500);
    await expect(chip(page)).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/studio$/);
  });
});

/* ====================================================================== M6 */

test.describe("M6 · the reply on a phone (s06 phone 2)", () => {
  test.setTimeout(150000);
  const PHONE = { width: 390, height: 844 };

  async function replyOnPhone(page: Page, baseURL: string | undefined): Promise<void> {
    await page.setViewportSize(PHONE);
    await stubMicrophone(page);
    const { code } = await seedTwinkle(page, baseURL);
    const end = await walkToEnd(page, `/read?story=${code}`);
    await end.getByRole("button", { name: SEND }).click();
    await expectReplyCreator(page);
    await page.evaluate(() => document.fonts.ready);
  }

  test("390: one quiet row — a labelled Exit, the centred Fraunces title, a compact gold Finish; the rest behind More", async ({
    page,
    baseURL,
  }) => {
    await replyOnPhone(page, baseURL);
    const finish = page.getByRole("button", { name: "Finish my story" });
    const more = page.getByRole("button", { name: "More" });
    const exit = page.getByRole("link", { name: "Leave the studio" });
    await expect(exit).toHaveText("Exit");
    await expect(finish).toHaveText("Finish", { useInnerText: true });
    await expect(more).toHaveAttribute("aria-expanded", "false");
    // Behind More until asked for: no switch, no "Open a tape" on the bar.
    await expect(page.getByRole("switch", { name: "Advanced mode" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open a tape" })).toHaveCount(0);

    const g = await page.evaluate(() => {
      const r = (el: Element | null) => el!.getBoundingClientRect().toJSON() as DOMRect;
      const title = document.querySelector("#studio-title")!;
      return {
        bar: r(document.querySelector(".studio-topbar")),
        exit: r(document.querySelector('a[aria-label="Leave the studio"]')),
        title: r(title),
        more: r(document.querySelector('[data-studio="bar-more"]')),
        finish: r(document.querySelector('button[aria-label="Finish my story"]')),
        chip: r(document.querySelector('[data-studio="reply-to"]')),
        titleFont: getComputedStyle(title).fontFamily.toLowerCase(),
        titleSize: getComputedStyle(title).fontSize,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    expect(g.bar.height, "one row, about 50px").toBeLessThanOrEqual(56);
    for (const [name, b] of [["Exit", g.exit], ["title", g.title], ["More", g.more], ["Finish", g.finish]] as const) {
      expect(b.top, `${name} on the one row`).toBeGreaterThanOrEqual(g.bar.top - 0.5);
      expect(b.bottom, `${name} on the one row`).toBeLessThanOrEqual(g.bar.bottom + 0.5);
    }
    expect(g.exit.right).toBeLessThanOrEqual(g.title.left);
    expect(g.title.right).toBeLessThanOrEqual(g.more.left);
    expect(g.more.right).toBeLessThanOrEqual(g.finish.left);
    expect(g.finish.right).toBeLessThanOrEqual(PHONE.width);
    expect(g.finish.height, "a compact Finish").toBeLessThanOrEqual(40);
    expect(g.finish.height).toBeGreaterThanOrEqual(32);
    expect(g.more.height, "More is a 44px target").toBeGreaterThanOrEqual(44);
    expect(g.titleFont).toContain("fraunces");
    expect(g.titleSize).toBe("17px");
    expect(g.chip.top - g.bar.bottom, "the chip right under the bar").toBeLessThanOrEqual(12);
    expect(g.overflow, "no sideways scroll").toBeLessThanOrEqual(0);

    // More opens a small panel: Simple/Advanced and Open a tape, keyboard first.
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(more).toHaveAttribute("aria-expanded", "true");
    const toggle = page.getByRole("switch", { name: "Advanced mode" });
    await expect(toggle).toBeVisible();
    await expect(page.getByRole("button", { name: "Open a tape" })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(toggle).toBeFocused();
    const ring = await toggle.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(ring).toBe("solid");
    await page.keyboard.press("Escape");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(more).toBeFocused();
    // Choosing Advanced closes the panel and gives focus back to More.
    await more.click();
    await toggle.click();
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#insp-autopause")).toBeVisible();
    await expect(more).toBeFocused();
    await page.getByRole("button", { name: "Close inspector" }).click();

    // Mid-take Finish waits, and says why to a screen reader (the note is not drawn on a phone).
    await page.locator('[data-sk="transport"][data-kind="rec"]').click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);
    await expect(finish).toBeDisabled();
    await expect(finish).toHaveAccessibleDescription("after this take");
    const bar = await page.locator(".studio-topbar").boundingBox();
    expect(bar!.height, "still one row mid-take").toBeLessThanOrEqual(56);
    await page.getByRole("button", { name: /^Stop —/ }).click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(0, { timeout: 10000 });
    await expect(finish).toBeEnabled();
  });

  test("390: the reply's gate holds its height when the first answer to 'whose voice' is chosen", async ({
    page,
    baseURL,
  }) => {
    await replyOnPhone(page, baseURL);
    await page.locator("#studio-page-text").fill("Thank you for the story.");
    await page.locator('[data-sk="transport"][data-kind="rec"]').click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);
    await page.getByRole("button", { name: /^Stop —/ }).click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(0, { timeout: 10000 });
    const close = page.getByRole("button", { name: "Close Voice" });
    if (await close.isVisible()) await close.click();
    await page.getByRole("button", { name: "Finish my story" }).click();
    const dialog = page.getByRole("dialog", { name: "A grown-up moment" });
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await page.locator("#studio-gate-author").fill("Grandma Rose");
    const measure = () =>
      page.evaluate(() => ({
        gate: document.querySelector('[data-studio="gate"]')!.getBoundingClientRect().height,
        sheet: document.querySelector('[data-studio="tape-sheet"]')!.getBoundingClientRect().top,
      }));
    await page.waitForTimeout(400);
    const before = await measure();
    await dialog.getByRole("radio", { name: MINE }).check();
    await expect(dialog.getByRole("checkbox", { name: "This is my own voice, and I'm happy to share it." })).toBeVisible();
    const after = await measure();
    expect(Math.abs(after.gate - before.gate), "the gate does not jump").toBeLessThanOrEqual(12);
    expect(Math.abs(after.sheet - before.sheet), "the sheet below stays put").toBeLessThanOrEqual(12);
  });
});
