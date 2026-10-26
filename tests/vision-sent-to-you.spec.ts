/**
 * T20b · Sent to you (device-local link references) + the NEW stamp (s07 row A,
 * brief screens[6]).
 *
 *   Node  the pure Sent-to-you module (src/components/player/sent-to-you.ts):
 *         remember / forget / cap / sanitize / own-or-sent / NEW / order /
 *         the label facts a reference keeps.
 *   E2E   /read with `ssync-sent-to-you` and `ssync-shelf-visit` seeded by
 *         tests/fixtures/shelf-seed.ts and the clock pinned: the sent face, its
 *         NEW stamp and SENT TO YOU label, the next visit, the band's "Play this
 *         tape" (by link) and "Take it off this shelf", the missing state's
 *         extra button, and a device-library hit that is never remembered.
 *
 * "Opened from someone else's link" cannot be driven end to end in CI: with no
 * Supabase every link that resolves is a device-library hit, i.e. yours. It is
 * covered by the pure `isOwnTape` decision plus test 7 (a device-library hit is
 * not remembered), and by a manual check on a Supabase-configured preview.
 *
 * Goodnight, Mia and Twinkle are T00's illustrative fixtures; Bath Time Song is
 * synthetic.
 */

import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import {
  forgetSent,
  isNewSince,
  isOwnTape,
  libraryIdOf,
  orderSent,
  ownKeys,
  rememberSent,
  sanitizeSent,
  SENT_CAP,
  SENT_KEY,
  sentFacts,
  sentMeta,
  SHELF_VISIT_KEY,
  type SentTape,
} from "../src/components/player/sent-to-you";
import { runtimeLabel } from "../src/lib/storysync/tape-meta";
import { GOODNIGHT_MIA, loadTape, TWINKLE } from "./fixtures/tapes";
import { pictureLessTape, seedShelf, sentRow, shelfRow } from "./fixtures/shelf-seed";

/** Codes the shape a minted code has (32 lowercase hex). */
const GRANDMA_CODE = "60d01a6060d01a6060d01a6060d01a60";
const TWINKLE_CODE = "7b20a7b20a7b20a7b20a7b20a7b20a71";
const BATH_CODE = "7b20b7b20b7b20b7b20b7b20b7b20b71";

/** Tuesday's previous look at the shelf; Grandma's link opened that evening; now is the next breakfast. */
const PREVIOUS_VISIT = "2026-10-20T07:00:00.000Z";
const GRANDMA_ADDED = "2026-10-20T19:31:00.000Z";
const NOW = "2026-10-21T07:30:00.000Z";

const TAKEN_OFF = "Taken off this shelf. Only the person who made it can delete the tape itself.";

const goodnightStory = () => loadTape("goodnight-mia").story;
const twinkleStory = () => loadTape("twinkle").story;
const grandmaRuntime = () => runtimeLabel(goodnightStory());

/** Grandma's reply as this device remembers it: the link code and label facts only. */
function grandmaSent(addedAt = GRANDMA_ADDED): SentTape {
  return sentRow(GOODNIGHT_MIA, GRANDMA_CODE, runtimeLabel(goodnightStory()), addedAt);
}

function library() {
  return [
    shelfRow(twinkleStory(), TWINKLE_CODE, "2026-10-19T18:10:00.000Z"),
    shelfRow(pictureLessTape("Bath Time Song", ""), BATH_CODE, "2026-10-12T18:00:00.000Z"),
  ];
}

const faces = (page: Page) => page.locator('[data-sk="shelf-tape"]');
const face = (page: Page, id: string) => page.locator(`[data-sk="shelf-tape"][data-tape-id="${id}"]`);
const sentFaces = (page: Page) => page.locator('[data-sk="shelf-tape"][data-sent="true"]');
const band = (page: Page) => page.locator('[data-shelf="band"]');

async function readSentKey(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), SENT_KEY);
}

async function sentCodes(page: Page): Promise<string[]> {
  const raw = await readSentKey(page);
  return sanitizeSent(raw).map((t) => t.code);
}

async function openShelf(page: Page) {
  await page.goto("/read");
  await expect(faces(page).first()).toBeVisible({ timeout: 20000 });
}

/* ================================================================= Node */

test.describe("T20b · the Sent-to-you list (Node)", () => {
  const facts = (code: string, title = "A tape") => ({
    code,
    title,
    author: "Grandma Rose",
    narrator: "Grandma Rose",
    pages: 1,
    runtime: "~0:08",
  });
  const hex = (n: number) => n.toString(16).padStart(32, "0");

  test("rememberSent: dedupe by code, the first addedAt stays, label facts refresh", () => {
    let list: SentTape[] = [];
    list = rememberSent(list, facts(GRANDMA_CODE, "Goodnight"), "2026-10-20T19:31:00.000Z");
    expect(list).toEqual([{ ...facts(GRANDMA_CODE, "Goodnight"), addedAt: "2026-10-20T19:31:00.000Z" }]);

    list = rememberSent(list, facts(TWINKLE_CODE, "Other"), new Date("2026-10-20T20:00:00.000Z"));
    list = rememberSent(list, { ...facts(GRANDMA_CODE, "Goodnight, Mia"), pages: 2 }, Date.parse("2026-10-22T08:00:00.000Z"));
    expect(list).toHaveLength(2);
    const grandma = list.find((t) => t.code === GRANDMA_CODE);
    expect(grandma?.addedAt, "an existing code keeps when it first arrived").toBe("2026-10-20T19:31:00.000Z");
    expect(grandma?.title, "…and refreshes its label").toBe("Goodnight, Mia");
    expect(grandma?.pages).toBe(2);

    // an entry that is not a reference (a bad code) changes nothing
    expect(rememberSent(list, facts("NOT-A-CODE"), NOW)).toEqual(list);
  });

  test("rememberSent: capped at 30, the 31st drops the oldest", () => {
    let list: SentTape[] = [];
    for (let i = 0; i < SENT_CAP; i++) {
      list = rememberSent(list, facts(hex(i + 1)), new Date(Date.UTC(2026, 9, 1, 0, i)));
    }
    expect(SENT_CAP).toBe(30);
    expect(list).toHaveLength(30);
    list = rememberSent(list, facts(hex(99)), new Date(Date.UTC(2026, 9, 2)));
    expect(list).toHaveLength(30);
    expect(list.some((t) => t.code === hex(1)), "the oldest went").toBe(false);
    expect(list.some((t) => t.code === hex(2))).toBe(true);
    expect(list.some((t) => t.code === hex(99))).toBe(true);
  });

  test("forgetSent removes only that code", () => {
    const list = [
      { ...facts(GRANDMA_CODE), addedAt: GRANDMA_ADDED },
      { ...facts(TWINKLE_CODE), addedAt: GRANDMA_ADDED },
    ];
    expect(forgetSent(list, GRANDMA_CODE).map((t) => t.code)).toEqual([TWINKLE_CODE]);
    expect(forgetSent(list, BATH_CODE)).toEqual(list);
    expect(list, "the list given is not changed").toHaveLength(2);
  });

  test("sanitizeSent drops malformed entries, unknown fields and anything but 16–64 lowercase hex", () => {
    const good = { ...facts(GRANDMA_CODE, "Goodnight, Mia"), addedAt: GRANDMA_ADDED };
    const short = { ...facts("3f9c2a7be41d0c58", "Old 16-hex link"), addedAt: GRANDMA_ADDED };
    const envelope = {
      v: 1,
      tapes: [
        good,
        short,
        { ...good, code: "3F9C2A7BE41D0C583F9C2A7BE41D0C58" }, // upper case
        { ...good, code: "local-1234567890abcdef" }, // not hex
        { ...good, code: "abc123" }, // too short
        { ...good, code: "a".repeat(65) }, // too long
        { ...good, code: hex(5), title: "" }, // no title
        { code: hex(6), author: "", pages: 1, runtime: "~0:08", addedAt: GRANDMA_ADDED }, // missing title
        { ...good, code: hex(7), inset: "data:image/jpeg;base64,AAAA" }, // a picture
        { ...good, code: hex(8), words: ["Goodnight"] }, // words
        { ...good, code: hex(9), pages: 0 },
        { ...good, code: hex(10), addedAt: "yesterday" },
        { ...good, code: hex(11), url: "https://example.test/read?story=x" },
        null,
        "junk",
        { ...good }, // a duplicate code: the first stays
      ],
    };
    const clean = sanitizeSent(envelope);
    expect(clean.map((t) => t.code)).toEqual([GRANDMA_CODE, "3f9c2a7be41d0c58"]);
    expect(Object.keys(clean[0]).sort()).toEqual(["addedAt", "author", "code", "narrator", "pages", "runtime", "title"]);
    // the stored JSON string is read the same way; anything else is an empty list
    expect(sanitizeSent(JSON.stringify(envelope)).map((t) => t.code)).toEqual([GRANDMA_CODE, "3f9c2a7be41d0c58"]);
    expect(sanitizeSent("{not json")).toEqual([]);
    expect(sanitizeSent(null)).toEqual([]);
    expect(sanitizeSent({ v: 2, tapes: [good] }), "an unknown version").toEqual([]);
    expect(sanitizeSent({ ...envelope, extra: 1 }).length, "the envelope's own extra keys are ignored").toBe(2);
    // the narrator is optional
    const { narrator: _narrator, ...noNarrator } = good;
    void _narrator;
    expect(sanitizeSent({ v: 1, tapes: [noNarrator] })[0]).toEqual(noNarrator);
  });

  test("isOwnTape: true by id or by code; ownKeys reads library rows", () => {
    const rows = [
      { id: "local-abc", shareCode: TWINKLE_CODE, ssyncData: {} },
      { id: "cloud-row-1", ssyncData: {} },
      null,
      { shareCode: "" },
    ];
    const own = ownKeys(rows);
    expect(own.ids).toEqual(["local-abc", "cloud-row-1"]);
    expect(own.codes).toEqual([TWINKLE_CODE]);
    expect(isOwnTape({ id: "cloud-row-1", code: GRANDMA_CODE }, own.ids, own.codes), "by id").toBe(true);
    expect(isOwnTape({ code: TWINKLE_CODE }, own.ids, own.codes), "by code").toBe(true);
    expect(isOwnTape({ code: "local-abc" }, own.ids, own.codes), "an id handed out as the code").toBe(true);
    expect(isOwnTape({ code: GRANDMA_CODE }, own.ids, own.codes)).toBe(false);
    expect(isOwnTape({ id: "", code: "" }, own.ids, own.codes)).toBe(false);
    expect(isOwnTape({ code: GRANDMA_CODE }, [], [])).toBe(false);
  });

  test("libraryIdOf: the row that is this tape, by code, by id, or (a cloud row has no code) by identity", () => {
    const story = goodnightStory();
    const deviceRow = { id: "local-1", shareCode: TWINKLE_CODE, ssyncData: twinkleStory() };
    const cloudRow = { id: "cloud-9", ssyncData: JSON.parse(JSON.stringify(story)) };
    expect(libraryIdOf(TWINKLE_CODE, twinkleStory(), [deviceRow]), "by share code").toBe("local-1");
    expect(libraryIdOf("local-1", twinkleStory(), [deviceRow]), "an id used as the code").toBe("local-1");
    expect(libraryIdOf(GRANDMA_CODE, story, [deviceRow, cloudRow]), "the same tape in your cloud library").toBe("cloud-9");
    // another tape with the same title but another creation time is not this one
    const other = { ...story, metadata: { ...story.metadata, created: "2026-10-25T08:00:00.000Z" } };
    expect(libraryIdOf(GRANDMA_CODE, other, [deviceRow, cloudRow])).toBeUndefined();
    // a copy re-signed by someone else is not this one either
    const copy = { ...story, signature: { ...story.signature, ownership: "© 2026 Somebody else" } };
    expect(libraryIdOf(GRANDMA_CODE, copy, [cloudRow])).toBeUndefined();
    // a tape without a creation time is only ever matched by code or id
    const bare = { ...story, metadata: { ...story.metadata, created: undefined } };
    expect(libraryIdOf(GRANDMA_CODE, bare, [{ id: "x", ssyncData: bare }])).toBeUndefined();
    expect(libraryIdOf(GRANDMA_CODE, story, [])).toBeUndefined();
  });

  test("isNewSince: strictly after the previous visit; no previous visit is never NEW", () => {
    const tape = { ...facts(GRANDMA_CODE), addedAt: GRANDMA_ADDED };
    expect(isNewSince(tape, PREVIOUS_VISIT)).toBe(true);
    expect(isNewSince(tape, GRANDMA_ADDED), "the same moment is not after").toBe(false);
    expect(isNewSince(tape, NOW)).toBe(false);
    expect(isNewSince(tape, null)).toBe(false);
    expect(isNewSince(tape, undefined)).toBe(false);
    expect(isNewSince(tape, "not a time")).toBe(false);
  });

  test("orderSent: NEW first, then newest addedAt first", () => {
    const a = { ...facts(hex(1), "old, seen"), addedAt: "2026-10-18T10:00:00.000Z" };
    const b = { ...facts(hex(2), "new"), addedAt: "2026-10-20T08:00:00.000Z" };
    const c = { ...facts(hex(3), "newer"), addedAt: "2026-10-20T19:31:00.000Z" };
    const d = { ...facts(hex(4), "seen"), addedAt: "2026-10-19T10:00:00.000Z" };
    expect(orderSent([a, b, d, c], PREVIOUS_VISIT).map((t) => t.title)).toEqual(["newer", "new", "seen", "old, seen"]);
    expect(orderSent([a, c, d], null).map((t) => t.title), "no previous visit: newest first").toEqual(["newer", "seen", "old, seen"]);
  });

  test("sentFacts keeps the link code and label facts only; sentMeta prints FROM … · N PAGE(S) · ~m:ss", () => {
    const story = goodnightStory();
    const kept = sentFacts(GRANDMA_CODE, story);
    expect(kept).toEqual({
      code: GRANDMA_CODE,
      title: GOODNIGHT_MIA.title,
      author: GOODNIGHT_MIA.byline,
      narrator: GOODNIGHT_MIA.narrator,
      pages: GOODNIGHT_MIA.pages.length,
      runtime: runtimeLabel(story),
    });
    expect(JSON.stringify(kept), "no picture, words or voice").not.toMatch(/data:|Goodnight, my brave|audio/);

    const tape = { ...kept, addedAt: GRANDMA_ADDED };
    expect(sentMeta(tape)).toBe(`FROM GRANDMA ROSE · 1 PAGE · ${runtimeLabel(story)}`);
    expect(sentMeta({ ...tape, pages: 5, runtime: "~0:24" })).toBe("FROM GRANDMA ROSE · 5 PAGES · ~0:24");
    expect(sentMeta({ ...tape, author: "" }), "no maker: the FROM part is left out").toBe(
      `1 PAGE · ${runtimeLabel(story)}`,
    );
    const twinkle = sentFacts(TWINKLE_CODE, twinkleStory());
    expect(twinkle.author).toBe(TWINKLE.byline);
    expect(twinkle.pages).toBe(5);
  });
});

test.describe("T20b · PRIVACY.md (Node)", () => {
  test('"What is stored where" lists both rows, appended after the shipped ones', () => {
    const doc = fs.readFileSync(path.resolve(__dirname, "..", "PRIVACY.md"), "utf8");
    const rows = doc.split("\n").filter((line) => line.startsWith("|"));
    const sent =
      "| Tapes sent to you: link code, title, maker, narrator, page count, length — never pictures, words or voices | this browser's localStorage | when you open someone else's link | 'Take it off this shelf', or clearing browser data |";
    const visit =
      "| When you last looked at the shelf (one timestamp) | this browser's localStorage | each visit to /read | clearing browser data |";
    expect(rows).toContain(sent);
    expect(rows).toContain(visit);
    expect(rows.indexOf(visit)).toBeGreaterThan(rows.indexOf(sent));
    expect(rows.indexOf(sent), "after the account row (append-only)").toBeGreaterThan(
      rows.findIndex((line) => line.startsWith("| Account email")),
    );
  });
});

/* ================================================================== E2E */

test.describe("T20b · Sent to you and NEW on /read", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW);
  });

  test("the sent tape stands first: NEW stamp, FROM meta, SENT TO YOU; your own tapes have neither", async ({ page }) => {
    await seedShelf(page, { library: library(), sent: [grandmaSent()], previousVisit: PREVIOUS_VISIT });
    await openShelf(page);

    await expect(faces(page)).toHaveCount(3);
    const order = await page
      .locator('[data-shelf="yours"]')
      .evaluate((root) => [...root.querySelectorAll('[data-sk="shelf-tape"]')].map((el) => el.getAttribute("data-tape-id")));
    expect(order).toEqual([GRANDMA_CODE, TWINKLE_CODE, BATH_CODE]);

    const grandma = face(page, GRANDMA_CODE);
    await expect(grandma).toHaveAttribute("data-sent", "true");
    await expect(grandma).toHaveAttribute("role", "radio");
    await expect(grandma).toHaveAccessibleName(`${GOODNIGHT_MIA.title}, new`);
    await expect(grandma.locator('[data-stamp="new"]')).toHaveText("NEW");
    await expect(grandma.locator(".sk-shelf-meta")).toHaveText(`FROM GRANDMA ROSE · 1 PAGE · ${grandmaRuntime()}`);
    await expect(grandma, "the meta describes the face").toHaveAccessibleDescription(
      new RegExp(`FROM GRANDMA ROSE · 1 PAGE · ${grandmaRuntime()}.*SENT TO YOU`, "i"),
    );
    await expect(grandma.locator("img"), "a reference keeps no picture").toHaveCount(0);
    const slot = grandma.locator("xpath=..");
    await expect(slot.locator('[data-sk="shelf-ledge-label"]')).toHaveText("SENT TO YOU", { useInnerText: true });

    // the register, read in one frame: the stamp and the label under the ledge
    await page.evaluate(() => document.fonts.ready);
    const reg = await grandma.evaluate((el) => {
      const stamp = el.querySelector('[data-stamp="new"]') as HTMLElement;
      const label = el.parentElement?.querySelector('[data-sk="shelf-ledge-label"]') as HTMLElement;
      const ledge = document.querySelector(".sk-shelf-ledge") as HTMLElement;
      const cs = getComputedStyle(stamp);
      const m = new DOMMatrixReadOnly(cs.transform);
      const root = getComputedStyle(document.documentElement);
      const first = (v: string) => v.split(",")[0].trim().replace(/^["']|["']$/g, "");
      const f = el.getBoundingClientRect();
      const s = stamp.getBoundingClientRect();
      const l = label.getBoundingClientRect();
      const g = ledge.getBoundingClientRect();
      return {
        border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
        color: cs.color,
        weight: cs.fontWeight,
        family: cs.fontFamily,
        plex: first(root.getPropertyValue("--font-plex-mono")),
        angle: Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI),
        // at the face's top-right: over its top edge, flush with its right side
        stampTopOverFace: f.top - s.top,
        stampRightGap: f.right - s.right,
        stampLeftOfMiddle: s.left - (f.left + f.width / 2),
        labelUnderLedge: l.top - g.bottom,
        labelLeft: l.left - f.left,
        labelFamily: getComputedStyle(label).fontFamily,
        labelCase: getComputedStyle(label).textTransform,
      };
    });
    expect(reg.border).toBe("2px solid rgb(227, 69, 47)");
    expect(reg.color).toBe("rgb(227, 69, 47)");
    expect(reg.weight).toBe("600");
    expect(reg.family).toContain(reg.plex);
    expect(reg.angle).toBe(-6);
    expect(reg.stampTopOverFace).toBeGreaterThan(0);
    expect(Math.abs(reg.stampRightGap)).toBeLessThanOrEqual(8);
    expect(reg.stampLeftOfMiddle).toBeGreaterThan(0);
    expect(reg.labelUnderLedge).toBeGreaterThanOrEqual(0);
    expect(Math.abs(reg.labelLeft)).toBeLessThanOrEqual(8);
    expect(reg.labelFamily).toContain(reg.plex);
    expect(reg.labelCase).toBe("uppercase");

    // your own tapes: no stamp, no SENT TO YOU, no data-sent
    for (const code of [TWINKLE_CODE, BATH_CODE]) {
      const own = face(page, code);
      await expect(own).not.toHaveAttribute("data-sent", "true");
      await expect(own.locator('[data-stamp="new"]')).toHaveCount(0);
      await expect(own.locator("xpath=..").locator('[data-sk="shelf-ledge-label"]')).toHaveCount(0);
    }
    await expect(face(page, TWINKLE_CODE)).toHaveAccessibleName(TWINKLE.title);
    await expect(page.locator('[data-sk="shelf-ledge-label"]')).toHaveCount(1);

    // one radio group: the arrows walk from the sent tape onto your own
    await expect(page.getByRole("radiogroup", { name: "Your tapes" }).getByRole("radio")).toHaveCount(3);
    await expect(grandma).toHaveAttribute("aria-checked", "true");
    await expect(band(page)).toContainText(`${GOODNIGHT_MIA.title} · ${GOODNIGHT_MIA.byline}`);
    await grandma.focus();
    await page.keyboard.press("ArrowRight");
    await expect(face(page, TWINKLE_CODE)).toBeFocused();
    await expect(face(page, TWINKLE_CODE)).toHaveAttribute("aria-checked", "true");
    await expect(band(page).getByRole("button", { name: "Pull the tape out" }), "your own tape keeps its pull-out").toBeVisible();
    await expect(band(page).getByRole("button", { name: "Take it off this shelf" })).toHaveCount(0);

    // the visit was written: now is this visit
    expect(await page.evaluate((k) => window.localStorage.getItem(k), SHELF_VISIT_KEY)).toBe(NOW);
  });

  test("the next visit: the NEW stamp is gone, the tape stays sent", async ({ page }) => {
    await seedShelf(page, { library: library(), sent: [grandmaSent()], previousVisit: PREVIOUS_VISIT });
    await openShelf(page);
    await expect(face(page, GRANDMA_CODE).locator('[data-stamp="new"]')).toHaveCount(1);

    await page.reload();
    await expect(faces(page)).toHaveCount(3, { timeout: 20000 });
    const grandma = face(page, GRANDMA_CODE);
    await expect(grandma).toHaveAttribute("data-sent", "true");
    await expect(grandma).toHaveAccessibleName(GOODNIGHT_MIA.title);
    await expect(page.locator('[data-stamp="new"]')).toHaveCount(0);
    await expect(grandma.locator("xpath=..").locator('[data-sk="shelf-ledge-label"]')).toHaveText("SENT TO YOU", {
      useInnerText: true,
    });
  });

  test("no previous visit: a sent tape is not NEW", async ({ page }) => {
    await seedShelf(page, { library: library(), sent: [grandmaSent()] });
    await openShelf(page);
    await expect(face(page, GRANDMA_CODE)).toHaveAttribute("data-sent", "true");
    await expect(page.locator('[data-stamp="new"]')).toHaveCount(0);
  });

  test("Play this tape opens it by its link; a dead link offers to take it off the shelf", async ({ page }) => {
    await seedShelf(page, { library: library(), sent: [grandmaSent()], previousVisit: PREVIOUS_VISIT });
    await openShelf(page);
    await face(page, GRANDMA_CODE).click();
    await expect(band(page).getByRole("button", { name: "Pull the tape out" }), "a sent tape is not yours to delete").toHaveCount(0);
    await band(page).getByRole("button", { name: "Play this tape" }).click();

    await expect(page).toHaveURL(new RegExp(`/read\\?story=${GRANDMA_CODE}$`));
    // CI has no cloud: the link resolves to nothing, as it would once Grandma deleted it
    await expect(page.getByText("We couldn't find that tape")).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("button", { name: /Play the demo tape/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Make your own story/ })).toBeVisible();
    expect(await sentCodes(page), "never a second entry").toEqual([GRANDMA_CODE]);

    await page.getByRole("button", { name: "Take it off this shelf" }).click();
    await expect(page).toHaveURL(/\/read$/);
    await expect(page.getByRole("heading", { level: 1, name: "Pick a tape." })).toBeVisible();
    await expect(faces(page)).toHaveCount(2, { timeout: 20000 });
    await expect(sentFaces(page)).toHaveCount(0);
    expect(await sentCodes(page)).toEqual([]);
  });

  test("Take it off this shelf forgets the reference at once, with the line", async ({ page }) => {
    await seedShelf(page, { library: library(), sent: [grandmaSent()], previousVisit: PREVIOUS_VISIT });
    await openShelf(page);
    await expect(face(page, GRANDMA_CODE)).toHaveAttribute("aria-checked", "true");
    const takeOff = band(page).getByRole("button", { name: "Take it off this shelf" });
    await expect(takeOff).toHaveAttribute("data-variant", "ghost");
    await takeOff.click();

    await expect(page.getByRole("status").filter({ hasText: "Taken off this shelf." })).toHaveText(TAKEN_OFF);
    await expect(face(page, GRANDMA_CODE)).toHaveCount(0);
    expect(await sentCodes(page)).toEqual([]);
    expect(await readSentKey(page), "the last reference gone: the key is gone too").toBeNull();
    // your own tapes are untouched; the next tape is selected and focused
    await expect(faces(page)).toHaveCount(2);
    await expect(face(page, TWINKLE_CODE)).toHaveAttribute("aria-checked", "true");
    await expect(face(page, TWINKLE_CODE)).toBeFocused();
    const rows = await page.evaluate(() => JSON.parse(window.localStorage.getItem("ssync-library") || "[]").length);
    expect(rows).toBe(2);

    await page.reload();
    await expect(faces(page)).toHaveCount(2, { timeout: 20000 });
    await expect(sentFaces(page)).toHaveCount(0);
  });

  test("two sent tapes: the NEW one first; taking one off keeps the other", async ({ page }) => {
    const OTHER_CODE = "60d01b6060d01b6060d01b6060d01b60";
    const older = { ...grandmaSent("2026-10-18T09:00:00.000Z"), code: OTHER_CODE, title: "Pancake Day", pages: 3 };
    await seedShelf(page, { library: library(), sent: [older, grandmaSent()], previousVisit: PREVIOUS_VISIT });
    await openShelf(page);
    const order = await sentFaces(page).evaluateAll((els) => els.map((el) => el.getAttribute("data-tape-id")));
    expect(order, "NEW first").toEqual([GRANDMA_CODE, OTHER_CODE]);
    await expect(face(page, OTHER_CODE).locator('[data-stamp="new"]'), "seen before the last visit").toHaveCount(0);
    await expect(face(page, OTHER_CODE)).toHaveAccessibleName("Pancake Day");
    await expect(face(page, OTHER_CODE).locator(".sk-shelf-meta")).toHaveText("FROM GRANDMA ROSE · 3 PAGES · " + grandmaRuntime());

    await band(page).getByRole("button", { name: "Take it off this shelf" }).click();
    await expect(face(page, GRANDMA_CODE)).toHaveCount(0);
    await expect(face(page, OTHER_CODE)).toHaveAttribute("aria-checked", "true");
    await expect(face(page, OTHER_CODE)).toBeFocused();
    expect(await sentCodes(page)).toEqual([OTHER_CODE]);
    const stored = JSON.parse((await readSentKey(page)) ?? "{}");
    expect(stored.v).toBe(1);
    expect(Object.keys(stored.tapes[0]).sort()).toEqual(["addedAt", "author", "code", "narrator", "pages", "runtime", "title"]);
  });

  test("a remembered code opened by URL that resolves to nothing: the missing state and the button", async ({ page }) => {
    await seedShelf(page, { library: library(), sent: [grandmaSent()], previousVisit: PREVIOUS_VISIT });
    await page.goto(`/read?story=${GRANDMA_CODE}`);
    await expect(page.getByText("We couldn't find that tape")).toBeVisible({ timeout: 20000 });
    const takeOff = page.getByRole("button", { name: "Take it off this shelf" });
    await expect(takeOff).toHaveAttribute("data-variant", "ghost");
    await takeOff.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/read$/);
    await expect(faces(page)).toHaveCount(2, { timeout: 20000 });
    expect(await sentCodes(page)).toEqual([]);
  });

  test("a code this device never remembered: the missing state has no take-off button", async ({ page }) => {
    await seedShelf(page, { library: library(), sent: [grandmaSent()] });
    await page.goto("/read?story=0123456789abcdef0123456789abcdef");
    await expect(page.getByText("We couldn't find that tape")).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("button", { name: /Play the demo tape/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Take it off this shelf" })).toHaveCount(0);
    expect(await sentCodes(page), "nothing is remembered for a dead link").toEqual([GRANDMA_CODE]);
  });

  test("a device-library hit is yours: never remembered as sent", async ({ page }) => {
    await seedShelf(page, { library: library() });
    await page.goto(`/read?story=${TWINKLE_CODE}`);
    await expect(page.locator('[data-pl="cover"] [data-sk="tape"]')).toContainText(TWINKLE.title, { timeout: 20000 });
    await page.getByRole("button", { name: /Tap to Begin/i }).click();
    await page.getByRole("button", { name: "Close story" }).click();
    await expect(page).not.toHaveURL(/story=/, { timeout: 20000 });
    expect(await sentCodes(page)).toEqual([]);
    expect(await readSentKey(page)).toBeNull();
    await page.goto("/read");
    await expect(faces(page)).toHaveCount(2, { timeout: 20000 });
    await expect(sentFaces(page)).toHaveCount(0);
  });

  test("nothing is sent anywhere for Sent to you or NEW", async ({ page }) => {
    const asked: string[] = [];
    page.on("request", (req) => {
      const type = req.resourceType();
      if (type !== "fetch" && type !== "xhr" && type !== "ping" && type !== "beacon") return;
      const url = new URL(req.url());
      if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/__nextjs")) return;
      asked.push(req.url());
    });
    await seedShelf(page, { library: library(), sent: [grandmaSent()], previousVisit: PREVIOUS_VISIT });
    await openShelf(page);
    await expect(face(page, GRANDMA_CODE).locator('[data-stamp="new"]')).toHaveCount(1);
    await band(page).getByRole("button", { name: "Take it off this shelf" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Taken off this shelf." })).toHaveText(TAKEN_OFF);
    await page.waitForTimeout(500);
    expect(asked).toEqual([]);
  });
});

/* ============================================================ fidelity */

test.describe("T20b · fidelity capture (s07 row A)", () => {
  test("1140×712: Goodnight, Mia sent and NEW, Twinkle selected", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "one capture, at the reference viewport");
    await page.clock.setFixedTime(NOW);
    await seedShelf(page, { library: library(), sent: [grandmaSent()], previousVisit: PREVIOUS_VISIT });
    await page.setViewportSize({ width: 1140, height: 712 });
    await openShelf(page);
    await face(page, TWINKLE_CODE).click();
    await page.mouse.move(1, 1);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => undefined))));
    await expect(face(page, TWINKLE_CODE)).toHaveAttribute("aria-checked", "true");
    await expect(face(page, GRANDMA_CODE).locator('[data-stamp="new"]')).toBeVisible();
    // the lift's 300ms ease has run its course
    await expect
      .poll(() => face(page, TWINKLE_CODE).evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42))
      .toBe(-10);
    await page.screenshot({ path: "docs/vision/evidence/T20b-1140.png" });
  });

  test("the sent tape's band (1140×712 and 375×812) and a dead remembered link (375×812)", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "captures at fixed viewports");
    await page.clock.setFixedTime(NOW);
    await seedShelf(page, { library: library(), sent: [grandmaSent()], previousVisit: PREVIOUS_VISIT });
    await page.setViewportSize({ width: 1140, height: 712 });
    await openShelf(page);
    await expect(face(page, GRANDMA_CODE)).toHaveAttribute("aria-checked", "true");
    await page.mouse.move(1, 1);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => undefined))));
    await expect
      .poll(() => face(page, GRANDMA_CODE).evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42))
      .toBe(-10);
    await page.screenshot({ path: "docs/vision/evidence/T20b-band-1140.png" });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => document.fonts.ready);
    await expect(band(page).getByRole("button", { name: "Take it off this shelf" })).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: "docs/vision/evidence/T20b-375.png" });

    await page.goto(`/read?story=${GRANDMA_CODE}`);
    await expect(page.getByRole("button", { name: "Take it off this shelf" })).toBeVisible({ timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: "docs/vision/evidence/T20b-missing-375.png" });
  });
});
