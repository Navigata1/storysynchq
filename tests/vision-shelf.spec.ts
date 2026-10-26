/**
 * T20a · The shelf: your tapes as cassettes on a ledge (s07, brief screens[6]).
 *
 *   Node  the pure shelf model (src/components/player/shelf.ts): merge, order,
 *         label facts, draft ownership.
 *   E2E   /read with seeded library rows: faces on the ledge, the blank tape
 *         last, the radio group, the lift, the band, the pull-out delete, the
 *         house row, the layout at every width.
 *
 * The cloud half of the shelf (a signed-in grown-up's library) is covered by
 * the pure merge only: CI builds without Supabase (M4-PRD, Testing Decisions).
 * Twinkle is T00's illustrative fixture; the other tapes are synthetic.
 */

import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  bandLine,
  draftBelongsTo,
  labelFacts,
  mergeShelf,
  nextAfter,
  parseLibrary,
} from "../src/components/player/shelf";
import { runtimeLabel } from "../src/lib/storysync/tape-meta";
import { loadTape, TWINKLE, GOODNIGHT_MIA } from "./fixtures/tapes";
import { DRAFT_KEY, LIBRARY_KEY } from "./fixtures/helpers";
import { pictureLessTape, publishedDraft, seedShelf, shelfRow } from "./fixtures/shelf-seed";

const NOTE = "Unlisted. Only people you send a link to can open them.";
const PULLED = "Pulled out. Pictures, voices, the saved copy and the link are gone.";

/** Codes the shape a minted code has (32 lowercase hex). */
const TWINKLE_CODE = "7a20a7a20a7a20a7a20a7a20a7a20a71";
const BATH_CODE = "7a20b7a20b7a20b7a20b7a20b7a20b71";
const GOODNIGHT_CODE = "7a20c7a20c7a20c7a20c7a20c7a20c71";

const twinkleStory = () => loadTape("twinkle").story;
const bathTime = () => pictureLessTape("Bath Time Song");

/** Twinkle (newest) and a picture-less tape. */
function twoTapes() {
  return [
    shelfRow(twinkleStory(), TWINKLE_CODE, "2026-10-21T07:00:00.000Z"),
    shelfRow(bathTime(), BATH_CODE, "2026-10-12T18:00:00.000Z"),
  ];
}

const yours = (page: Page) => page.locator('[data-shelf="yours"]');
const faces = (page: Page) => page.locator('[data-sk="shelf-tape"]');
const face = (page: Page, id: string) => page.locator(`[data-sk="shelf-tape"][data-tape-id="${id}"]`);
const band = (page: Page) => page.locator('[data-shelf="band"]');

/** The face's translateY from its computed matrix, once two reads 120 ms apart agree. */
async function settledLift(target: Locator): Promise<number> {
  const read = () =>
    target.evaluate((el) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return Math.round(m.m42 * 10) / 10;
    });
  let last = Number.NaN;
  await expect
    .poll(
      async () => {
        const a = await read();
        await new Promise((r) => setTimeout(r, 120));
        const b = await read();
        last = b;
        return a === b;
      },
      { timeout: 5000 },
    )
    .toBe(true);
  return last;
}

async function readLibrary(page: Page): Promise<Array<{ id: string; shareCode?: string }>> {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || "[]"), LIBRARY_KEY);
}

async function openShelf(page: Page) {
  await page.goto("/read");
  // The shelf is read after mount: wait for the first face.
  await expect(faces(page).first()).toBeVisible({ timeout: 20000 });
}

/* ================================================================= Node */

test.describe("T20a · shelf model (Node)", () => {
  const story = (title: string) => ({
    version: "2.0",
    metadata: { title },
    pages: [{ id: 1, text: { content: "A page." } }],
  });

  test("merge: device + cloud, once per id, newest first, the cloud copy wins", () => {
    const device = [
      { id: "a", createdAt: "2026-10-19T08:00:00.000Z", ssyncData: story("A") },
      { id: "b", createdAt: "2026-10-21T08:00:00.000Z", ssyncData: story("B on this device"), shareCode: "bbbb" },
    ];
    const cloud = [
      { id: "b", createdAt: "2026-10-21T08:00:00.000Z", ssyncData: story("B in the cloud") },
      { id: "c", createdAt: "2026-10-20T08:00:00.000Z", ssyncData: story("C") },
    ];
    const shelf = mergeShelf(device, cloud);
    expect(shelf.map((e) => e.id)).toEqual(["b", "c", "a"]);
    expect(shelf[0].source).toBe("cloud");
    expect(shelf[0].label.title).toBe("B in the cloud");
    expect(shelf[0].shareCode, "a device code rides along with the cloud copy").toBe("bbbb");
    expect(shelf[2].source).toBe("device");
  });

  test("merge: rows with no id or no playable pages stay off the shelf; bad JSON is an empty shelf", () => {
    const shelf = mergeShelf([
      { id: "", ssyncData: story("No id") },
      { id: "x", ssyncData: { metadata: { title: "No pages" }, pages: [] } },
      null,
      "junk",
      { id: "ok", createdAt: "2026-10-01T00:00:00.000Z", ssyncData: story("Fine") },
    ]);
    expect(shelf.map((e) => e.id)).toEqual(["ok"]);
    expect(parseLibrary("{not json")).toEqual([]);
    expect(parseLibrary('{"rows":1}')).toEqual([]);
    expect(parseLibrary(null)).toEqual([]);
  });

  test("label facts: Twinkle's title, meta, runtime and page-1 inset; none for a picture-less tape", () => {
    const twinkle = twinkleStory();
    const facts = labelFacts(twinkle);
    const runtime = runtimeLabel(twinkle);
    expect(runtime).toMatch(/^~\d+:\d{2}$/);
    expect(facts.title).toBe(TWINKLE.title);
    expect(facts.author).toBe(TWINKLE.byline);
    expect(facts.runtime).toBe(runtime);
    expect(facts.meta).toBe(`Mia, age 4 — with Mom · ${runtime}`);
    expect(facts.inset).toBe(twinkle.pages[0].illustration?.url);
    expect(facts.inset).toMatch(/^data:image\//);
    expect(bandLine(facts)).toBe(`${TWINKLE.title} · ${TWINKLE.byline}`);

    const plain = labelFacts(pictureLessTape("Bath Time Song", ""));
    expect(plain.inset).toBeUndefined();
    expect(plain.meta, "no author: the runtime alone").toBe(plain.runtime);
    expect(bandLine(plain)).toBe("Bath Time Song");
  });

  test("draftBelongsTo: published.id or publishedIds, nothing else", () => {
    const envelope = (state: unknown) => ({ v: 1, savedAt: "2026-10-20T00:00:00.000Z", state });
    expect(draftBelongsTo(envelope({ published: { id: "t1" }, publishedIds: [] }), "t1")).toBe(true);
    expect(draftBelongsTo(envelope({ published: null, publishedIds: ["old", "t1"] }), "t1")).toBe(true);
    expect(draftBelongsTo({ published: { id: "t1" }, publishedIds: [] }, "t1"), "a bare state").toBe(true);
    expect(draftBelongsTo(envelope({ published: { id: "t2" }, publishedIds: ["t2"] }), "t1")).toBe(false);
    expect(draftBelongsTo(envelope({ published: null, publishedIds: [] }), "t1")).toBe(false);
    expect(draftBelongsTo(null, "t1")).toBe(false);
    expect(draftBelongsTo(envelope({ published: { id: "t1" } }), "")).toBe(false);
  });

  test("nextAfter: the next tape, else the one before, else nobody", () => {
    expect(nextAfter(["a", "b", "c"], "a")).toBe("b");
    expect(nextAfter(["a", "b", "c"], "b")).toBe("c");
    expect(nextAfter(["a", "b", "c"], "c")).toBe("b");
    expect(nextAfter(["a"], "a")).toBeNull();
  });
});

/* ================================================================== E2E */

test.describe("T20a · the shelf on /read", () => {
  test("faces on the ledge, the blank tape last, the note, the radio group, the lift", async ({ page }) => {
    await seedShelf(page, { library: twoTapes() });
    await openShelf(page);

    await expect(page.getByText("StorySync Reader")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Pick a tape." })).toBeVisible();
    const section = yours(page);
    await expect(section.getByText("Your tapes", { exact: true })).toBeVisible();
    await expect(section.getByText(NOTE, { exact: true })).toBeVisible();
    const note = await section.getByText(NOTE, { exact: true }).evaluate((el) => ({
      size: getComputedStyle(el).fontSize,
      lock: !!el.querySelector('svg[aria-hidden="true"]'),
    }));
    expect(note.size).toBe("12px");
    expect(note.lock, "the decorative Lock").toBe(true);

    // two faces, in shelf order, then the blank tape on the same ledge
    await expect(faces(page)).toHaveCount(2);
    const order = await section.evaluate((root) =>
      [...root.querySelectorAll('[data-sk="shelf-tape"], .pl-choice-3')].map(
        (el) => el.getAttribute("data-tape-id") ?? "blank",
      ),
    );
    expect(order).toEqual([TWINKLE_CODE, BATH_CODE, "blank"]);
    const blank = section.locator(".pl-choice.pl-choice-3");
    await expect(blank).toHaveAccessibleName("Make your own story in the studio");
    await expect(blank).not.toHaveAttribute("role", "radio");
    await expect(blank).toContainText("Make your own");
    await expect(blank).toContainText("BLANK TAPE · YOUR VOICE · YOUR PICTURES");

    // the faces carry the tape's own facts
    const twinkle = face(page, TWINKLE_CODE);
    await expect(twinkle).toHaveAccessibleName(TWINKLE.title);
    await expect(twinkle).toContainText(`Mia, age 4 — with Mom · ${runtimeLabel(twinkleStory())}`);
    await expect(twinkle.locator("img")).toHaveCount(1);
    await expect(face(page, BATH_CODE).locator("img"), "no picture, no inset").toHaveCount(0);
    await expect(twinkle.locator('[data-sk="reel"]')).toHaveCount(2);

    // the register, read off the live face in one frame (T05a tokens)
    await page.evaluate(() => document.fonts.ready);
    const reg = await twinkle.evaluate((el) => {
      const cs = (sel: string) => {
        const n = el.querySelector(sel) ?? el.parentElement?.querySelector(sel);
        return n ? getComputedStyle(n) : null;
      };
      const root = getComputedStyle(document.documentElement);
      const first = (v: string) => v.split(",")[0].trim().replace(/^["']|["']$/g, "");
      const label = cs(".sk-shelf-label");
      const stripe = cs(".sk-shelf-stripe");
      const bandEl = cs(".sk-shelf-band");
      const title = cs(".sk-shelf-title");
      const meta = cs(".sk-shelf-meta");
      const inset = cs(".sk-shelf-inset");
      const ledgeEl = document.querySelector(".sk-shelf-ledge");
      const ledge = ledgeEl ? getComputedStyle(ledgeEl) : null;
      const box = el.getBoundingClientRect();
      const ledgeBox = ledgeEl?.getBoundingClientRect();
      return {
        paper: label?.backgroundColor,
        labelBorder: `${label?.borderTopWidth} ${label?.borderTopStyle} ${label?.borderTopColor}`,
        stripe: stripe?.backgroundColor,
        band: bandEl?.backgroundColor,
        holes: el.querySelectorAll(".sk-shelf-hole-ink").length,
        titleWeight: title?.fontWeight,
        titleFamily: title?.fontFamily ?? "",
        titleClamp: title?.webkitLineClamp,
        metaSize: meta?.fontSize,
        metaCase: meta?.textTransform,
        metaFamily: meta?.fontFamily ?? "",
        insetSize: inset ? `${inset.width}×${inset.height}` : "",
        insetBorder: `${inset?.borderTopWidth} ${inset?.borderTopColor}`,
        ledgeHeight: ledge?.height,
        ledgeShadow: ledge?.boxShadow ?? "",
        // the face stands on the ledge (lifted 10px while selected)
        standsOn: ledgeBox ? Math.round(ledgeBox.top - box.bottom) : null,
        fraunces: first(root.getPropertyValue("--font-fraunces")),
        plex: first(root.getPropertyValue("--font-plex-mono")),
      };
    });
    expect(reg.paper).toBe("rgb(255, 253, 246)");
    // 1.5px: Chromium snaps a border to whole device pixels, so read it as 1–1.5px
    const [labelWidth, ...labelRest] = reg.labelBorder.split(" ");
    expect(parseFloat(labelWidth)).toBeGreaterThanOrEqual(1);
    expect(parseFloat(labelWidth)).toBeLessThanOrEqual(1.5);
    expect(labelRest.join(" ")).toBe("solid rgb(30, 26, 22)");
    expect(reg.stripe).toBe("rgb(227, 69, 47)");
    expect(reg.band).toBe("rgb(255, 201, 60)");
    expect(reg.holes).toBe(2);
    expect(reg.titleWeight).toBe("800");
    expect(reg.titleFamily).toContain(reg.fraunces);
    expect(reg.titleClamp).toBe("2");
    expect(reg.metaSize).toBe("9.5px");
    expect(reg.metaCase).toBe("uppercase");
    expect(reg.metaFamily).toContain(reg.plex);
    expect(reg.insetSize).toBe("32px×32px");
    expect(reg.insetBorder).toBe("2px rgb(30, 26, 22)");
    expect(reg.ledgeHeight).toBe("8px");
    expect(reg.ledgeShadow).toContain("inset");
    expect(reg.standsOn).not.toBeNull();
    expect(Math.abs((reg.standsOn ?? 99) - 10), "the lifted face sits 10px over the ledge").toBeLessThanOrEqual(1);
    // the gold glow is under the selected tape only
    await expect
      .poll(async () =>
        (
          await page
            .locator(".sk-shelf-slot")
            .evaluateAll((slots) =>
              slots
                .filter((s) => s.querySelector(".sk-shelf-glow"))
                .map((s) => `${s.getAttribute("data-selected")}:${getComputedStyle(s.querySelector(".sk-shelf-glow")!).opacity}`),
            )
        ).join(" "),
      )
      .toBe("true:1 false:0");

    // a radio group named "Your tapes"; the first tape selected on arrival
    const group = page.getByRole("radiogroup", { name: "Your tapes" });
    await expect(group.getByRole("radio")).toHaveCount(2);
    await expect(twinkle).toHaveAttribute("role", "radio");
    await expect(twinkle).toHaveAttribute("aria-checked", "true");
    await expect(twinkle).toHaveAttribute("tabindex", "0");
    await expect(face(page, BATH_CODE)).toHaveAttribute("aria-checked", "false");
    await expect(face(page, BATH_CODE)).toHaveAttribute("tabindex", "-1");
    expect(await settledLift(twinkle), "the selected tape is lifted 10px").toBe(-10);
    expect(await settledLift(face(page, BATH_CODE))).toBe(0);
    const ease = await twinkle.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { duration: cs.transitionDuration, property: cs.transitionProperty };
    });
    expect(ease.duration.split(",").map((d) => d.trim())).toContain("0.3s");

    // the band names the selected tape
    await expect(band(page)).toContainText(`${TWINKLE.title} · ${TWINKLE.byline}`);

    // ← / → move the selection; selecting never opens a tape
    await twinkle.focus();
    await page.keyboard.press("ArrowRight");
    await expect(face(page, BATH_CODE)).toHaveAttribute("aria-checked", "true");
    await expect(face(page, BATH_CODE)).toBeFocused();
    await expect(twinkle).toHaveAttribute("aria-checked", "false");
    await expect(band(page)).toContainText("Bath Time Song · Shelf fixture");
    await page.keyboard.press("ArrowLeft");
    await expect(twinkle).toHaveAttribute("aria-checked", "true");
    await face(page, BATH_CODE).click();
    await expect(face(page, BATH_CODE)).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await expect(page.locator(".pl-root"), "selecting is not opening").toHaveCount(0);
    await expect(page).toHaveURL(/\/read$/);
  });

  test("reduced motion: the selected face is lifted with no transition", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seedShelf(page, { library: twoTapes() });
    await openShelf(page);
    const twinkle = face(page, TWINKLE_CODE);
    await expect(twinkle).toHaveAttribute("aria-checked", "true");
    const t = await twinkle.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { duration: cs.transitionDuration, y: new DOMMatrixReadOnly(cs.transform).m42 };
    });
    expect(t.duration.split(",").every((d) => d.trim() === "0s")).toBe(true);
    expect(t.y).toBe(-10);
  });

  test("an empty library keeps the three shipped doors; the demo opens its cover", async ({ page }) => {
    await page.goto("/read");
    await expect(page.locator(".pl-choice")).toHaveCount(3);
    await expect(faces(page)).toHaveCount(0);
    await expect(page.getByRole("radiogroup", { name: "Your tapes" })).toHaveCount(0);
    await expect(band(page)).toHaveCount(0);
    await expect(page.locator('input[type="file"]')).toHaveCount(1);
    const house = page.locator('[data-shelf="house"]');
    await expect(house.getByText("The house tape", { exact: true })).toBeVisible();
    await expect(house.locator(".pl-choice-1")).toHaveAccessibleName("Play the demo tape, The Brave Little Star");
    await expect(house.locator(".pl-choice-1 [data-sk='tape']")).toContainText("The Brave Little Star");
    await expect(house.locator(".pl-choice-2")).toHaveAccessibleName("Open a .storysync file from this device");
    await expect(yours(page).locator(".pl-choice-3")).toBeVisible();
    await page.getByRole("button", { name: /Play the demo tape/i }).click();
    await expect(page.getByRole("button", { name: /Tap to Begin/i })).toBeVisible({ timeout: 20000 });
  });

  test("Play this tape opens the cover gate for that tape; Close returns to the shelf", async ({ page }) => {
    await seedShelf(page, { library: twoTapes() });
    await openShelf(page);
    await expect(band(page).getByRole("button", { name: "Play this tape" })).toBeVisible();
    await band(page).getByRole("button", { name: "Play this tape" }).click();
    const cover = page.locator('[data-pl="cover"]');
    await expect(cover).toBeVisible({ timeout: 20000 });
    await expect(cover.locator('[data-sk="tape"]')).toContainText(TWINKLE.title);
    await expect(page.locator('input[type="file"]'), "the file door is gone once a tape opens").toHaveCount(0);

    // the cover gate covers the room's chrome: begin, then Close
    await page.getByRole("button", { name: /Tap to Begin/i }).click();
    await page.getByRole("button", { name: "Close story" }).click();
    await expect(faces(page)).toHaveCount(2, { timeout: 10000 });
    await expect(face(page, TWINKLE_CODE)).toHaveAttribute("aria-checked", "true");
    await expect(page).toHaveURL(/\/read$/);

    // the second tape, and Escape this time: the same way back
    await face(page, BATH_CODE).click();
    await band(page).getByRole("button", { name: "Play this tape" }).click();
    await expect(cover.locator('[data-sk="tape"]')).toContainText("Bath Time Song", { timeout: 20000 });
    await page.keyboard.press("Escape");
    await expect(face(page, BATH_CODE)).toHaveAttribute("aria-checked", "true", { timeout: 10000 });
  });

  test("pull the tape out: arm, delete everything, the line; its draft goes too", async ({ page }) => {
    await seedShelf(page, {
      library: twoTapes(),
      draft: publishedDraft(TWINKLE_CODE, TWINKLE_CODE),
    });
    await openShelf(page);
    await expect(face(page, TWINKLE_CODE)).toHaveAttribute("aria-checked", "true");

    const pull = band(page).getByRole("button", { name: "Pull the tape out" });
    await expect(pull.locator('[data-sk="pull-tape-icon"]')).toHaveCount(1);
    await pull.click();
    const confirm = band(page).getByRole("button", { name: "Tap again to delete everything" });
    await expect(confirm).toBeVisible();
    await expect(confirm).toHaveAttribute("data-variant", "red");
    expect(await readLibrary(page), "arming deletes nothing").toHaveLength(2);
    await confirm.click();

    const status = page.getByRole("status").filter({ hasText: "Pulled out." });
    await expect(status).toHaveText(PULLED, { timeout: 5000 });
    await expect(face(page, TWINKLE_CODE)).toHaveCount(0, { timeout: 5000 });
    await expect(face(page, BATH_CODE), "the next tape is selected").toHaveAttribute("aria-checked", "true");
    await expect(band(page).getByRole("button", { name: "Pull the tape out" })).toBeVisible();

    const rows = await readLibrary(page);
    expect(rows.map((r) => r.id)).toEqual([BATH_CODE]);
    expect(await page.evaluate((k) => window.localStorage.getItem(k), DRAFT_KEY), "its Studio draft").toBeNull();

    await page.goto(`/read?story=${TWINKLE_CODE}`);
    await expect(page.getByText("We couldn't find that tape")).toBeVisible({ timeout: 20000 });
    await page.goto("/read");
    await expect(faces(page)).toHaveCount(1, { timeout: 20000 });
  });

  test("pulling a tape out leaves a draft of another story alone", async ({ page }) => {
    await seedShelf(page, {
      library: twoTapes(),
      draft: publishedDraft("some-other-story", "0123456789abcdef0123456789abcdef"),
    });
    await openShelf(page);
    await band(page).getByRole("button", { name: "Pull the tape out" }).click();
    await band(page).getByRole("button", { name: "Tap again to delete everything" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Pulled out." })).toHaveText(PULLED);
    await expect(face(page, TWINKLE_CODE)).toHaveCount(0, { timeout: 5000 });
    const draft = await page.evaluate((k) => window.localStorage.getItem(k), DRAFT_KEY);
    expect(draft, "a draft for a different story survives").not.toBeNull();
    expect(JSON.parse(draft ?? "{}").state.published.id).toBe("some-other-story");
  });

  test("Escape or a new selection disarms; nothing is deleted", async ({ page }) => {
    await seedShelf(page, { library: twoTapes() });
    await openShelf(page);
    const pull = band(page).getByRole("button", { name: "Pull the tape out" });
    await pull.click();
    await expect(band(page).getByRole("button", { name: "Tap again to delete everything" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(band(page).getByRole("button", { name: "Pull the tape out" })).toBeVisible();
    await expect(band(page).getByRole("button", { name: "Tap again to delete everything" })).toHaveCount(0);

    await band(page).getByRole("button", { name: "Pull the tape out" }).click();
    await face(page, BATH_CODE).click();
    await expect(band(page).getByRole("button", { name: "Pull the tape out" })).toBeVisible();
    await face(page, TWINKLE_CODE).click();
    await expect(band(page).getByRole("button", { name: "Pull the tape out" }), "still disarmed").toBeVisible();

    expect(await readLibrary(page)).toHaveLength(2);
    await expect(faces(page)).toHaveCount(2);
    await expect(page.getByRole("status").filter({ hasText: "Pulled out." })).toHaveCount(0);
  });

  test("no sideways page scroll at any width; the shelf scrolls inside itself", async ({ page }) => {
    const story = twinkleStory();
    const library = [
      shelfRow(story, TWINKLE_CODE, "2026-10-21T07:00:00.000Z"),
      shelfRow(loadTape("goodnight-mia").story, GOODNIGHT_CODE, "2026-10-20T07:00:00.000Z"),
      shelfRow(bathTime(), BATH_CODE, "2026-10-12T18:00:00.000Z"),
      shelfRow(pictureLessTape("The Long Way to the Very Bottom of the Garden"), "7a20d7a20d7a20d7a20d7a20d7a20d71", "2026-10-11T18:00:00.000Z"),
      shelfRow(pictureLessTape("Five"), "7a20e7a20e7a20e7a20e7a20e7a20e71", "2026-10-10T18:00:00.000Z"),
    ];
    await seedShelf(page, { library });
    await openShelf(page);
    await expect(faces(page)).toHaveCount(5);
    await expect(face(page, GOODNIGHT_CODE)).toHaveAccessibleName(GOODNIGHT_MIA.title);
    // a long title stops at two lines on the face; the accessible name keeps it whole
    const long = face(page, "7a20d7a20d7a20d7a20d7a20d7a20d71");
    await expect(long).toHaveAccessibleName("The Long Way to the Very Bottom of the Garden");
    await page.evaluate(() => document.fonts.ready);
    const clamp = await long.locator(".sk-shelf-title").evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        lines: (el.getBoundingClientRect().height - parseFloat(cs.paddingTop)) / parseFloat(cs.lineHeight),
        clipped: el.scrollHeight > el.clientHeight,
      };
    });
    expect(clamp.lines).toBeLessThanOrEqual(2.05);
    expect(clamp.clipped, "the rest of the title is clipped (ellipsis)").toBe(true);

    const scroller = page.locator('[data-sk="shelf"]');
    await expect(scroller).toHaveAttribute("aria-label", "Your tapes shelf");
    await expect(scroller).toHaveAttribute("tabindex", "0");
    expect(await scroller.evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto");
    await scroller.focus();
    await expect(scroller).toBeFocused();

    // One frame's reading: the document's width and the face's box together.
    const measure = () =>
      page.evaluate((id) => {
        const el = document.querySelector(`[data-sk="shelf-tape"][data-tape-id="${id}"]`);
        const r = el?.getBoundingClientRect();
        return {
          doc: document.documentElement.scrollWidth,
          view: document.documentElement.clientWidth,
          w: r ? Math.round(r.width) : 0,
          h: r ? Math.round(r.height) : 0,
        };
      }, TWINKLE_CODE);

    for (const width of [320, 375, 390, 768, 1024, 1140, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(() => document.fonts.ready);
      // wait until two readings 150 ms apart agree (never right after a resize)
      let m = await measure();
      await expect
        .poll(async () => {
          const a = await measure();
          await new Promise((r) => setTimeout(r, 150));
          m = await measure();
          return JSON.stringify(a) === JSON.stringify(m);
        })
        .toBe(true);
      expect(m.view, `the viewport is ${width}px`).toBeLessThanOrEqual(width);
      expect(m.doc, `no sideways scroll at ${width}px`).toBeLessThanOrEqual(m.view);
      // each face keeps its full size (150 × 110 from 768 px, ≥ 128 px wide below)
      const box = { w: m.w, h: m.h };
      if (width >= 768) expect(box).toEqual({ w: 150, h: 110 });
      else expect(box.w).toBeGreaterThanOrEqual(128);
    }
    // at 375 the five tapes do not fit: the shelf itself scrolls
    await page.setViewportSize({ width: 375, height: 800 });
    const overflow = await scroller.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(overflow.sw).toBeGreaterThan(overflow.cw);
  });

  test("reduced motion: the pull-out removes the face at once, no animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seedShelf(page, { library: twoTapes() });
    await openShelf(page);
    // Record any animation that runs on a shelf face from here on.
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { __shelfAnimations: string[] }).__shelfAnimations = seen;
      document.addEventListener(
        "animationstart",
        (event) => {
          const el = event.target as Element;
          if (el.closest('[data-sk="shelf-tape"]')) seen.push(event.animationName);
        },
        true,
      );
    });
    await band(page).getByRole("button", { name: "Pull the tape out" }).click();
    await band(page).getByRole("button", { name: "Tap again to delete everything" }).click();
    await expect(face(page, TWINKLE_CODE)).toHaveCount(0, { timeout: 1000 });
    await expect(page.getByRole("status").filter({ hasText: "Pulled out." })).toHaveText(PULLED);
    const names = await page.evaluate(
      () => (window as unknown as { __shelfAnimations: string[] }).__shelfAnimations,
    );
    expect(names.filter((n) => n !== "none")).toEqual([]);
    const still = await faces(page).evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));
    expect(still.every((n) => n === "none")).toBe(true);
  });

  test("nothing is fetched for the shelf", async ({ page }) => {
    const asked: string[] = [];
    page.on("request", (req) => {
      const type = req.resourceType();
      if (type !== "fetch" && type !== "xhr") return;
      const url = new URL(req.url());
      if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/__nextjs")) return;
      // Next's own route prefetch (production prefetches a visible <Link href="/">
      // as ?_rsc=…): page payload for a link, not anything the shelf asks for
      if (url.searchParams.has("_rsc")) return;
      asked.push(req.url());
    });
    await seedShelf(page, { library: twoTapes() });
    await openShelf(page);
    await face(page, BATH_CODE).click();
    await page.waitForTimeout(500);
    expect(asked).toEqual([]);
  });
});

/* ============================================================ fidelity */

test.describe("T20a · fidelity captures (s07)", () => {
  /** s07's shelf: Goodnight, Mia; Twinkle (selected); Bath Time Song; the blank tape. */
  function referenceShelf() {
    return [
      shelfRow(loadTape("goodnight-mia").story, GOODNIGHT_CODE, "2026-10-20T07:00:00.000Z"),
      shelfRow(twinkleStory(), TWINKLE_CODE, "2026-10-19T18:10:00.000Z"),
      shelfRow(pictureLessTape("Bath Time Song", ""), BATH_CODE, "2026-10-12T18:00:00.000Z"),
    ];
  }

  async function settle(page: Page) {
    await page.evaluate(() => document.fonts.ready);
    await expect(face(page, TWINKLE_CODE)).toHaveAttribute("aria-checked", "true");
    expect(await settledLift(face(page, TWINKLE_CODE))).toBe(-10);
  }

  test("1140×712 and 375×812: Twinkle selected on the shelf", async ({ page }) => {
    await seedShelf(page, { library: referenceShelf() });
    await page.setViewportSize({ width: 1140, height: 712 });
    await openShelf(page);
    await face(page, TWINKLE_CODE).click();
    await page.mouse.move(1, 1);
    await settle(page);
    await page.screenshot({ path: "docs/vision/evidence/T20a-1140.png" });

    await page.setViewportSize({ width: 375, height: 812 });
    await settle(page);
    await page.screenshot({ path: "docs/vision/evidence/T20a-375.png" });
  });

  test("1140×712: Bath Time Song mid pull-out (the clock paused)", async ({ page }) => {
    await page.clock.install();
    await seedShelf(page, { library: referenceShelf() });
    await page.setViewportSize({ width: 1140, height: 712 });
    await openShelf(page);
    await face(page, TWINKLE_CODE).click();
    await face(page, BATH_CODE).click();
    await band(page).getByRole("button", { name: "Pull the tape out" }).click();
    await page.mouse.move(1, 1);
    // Hold the room's timers: the tape stays out of its slot, the ribbon spilled.
    await page.clock.pauseAt(Date.now() + 60_000);
    await band(page).getByRole("button", { name: "Tap again to delete everything" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Pulled out." })).toHaveText(PULLED);
    await expect(face(page, BATH_CODE)).toHaveCount(1);
    await page.waitForTimeout(900); // real time: the CSS motion runs to its end pose
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "docs/vision/evidence/T20a-pullout-1140.png" });
  });
});
