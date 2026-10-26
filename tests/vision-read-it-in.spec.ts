/**
 * T22a · "Read it in…": what should it feel like (s07 right panel, brief screens[6]).
 *
 *   Node  the pure helper (src/components/player/read-it-in.ts): the target →
 *         Creator URL rule, the "read you this one" line, the default mood, the
 *         header picture, the line naming the target.
 *   E2E   /read: the panel for the house tape (empty shelf), for a shelf tape
 *         and for a tape sent to you; the eight mood tape chips as one radio
 *         group; "Make our own copy" into T15's `/studio?open=…&mood=…`; the
 *         panel fetches nothing; the "Read it in…" doors in the band and the
 *         house row; the layout at every width; reduced motion; the fidelity
 *         captures (1140×712, 375×812).
 *
 * Twinkle and "Goodnight, Mia" are T00's illustrative fixtures (tests only).
 */

import fs from "node:fs";
import path from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { MOOD_NAMES, MOODS, type MoodName } from "../src/lib/audio/moods";
import { MOOD_COLOR } from "../src/components/studio-kit/tokens";
import type { SsyncManifest } from "../src/lib/storysync/manifest";
import { mergeShelf } from "../src/components/player/shelf";
import {
  COMPUTER_LINE,
  creatorUrl,
  defaultMood,
  headerPicture,
  houseTarget,
  readYouLine,
  sentTarget,
  shelfTarget,
  targetKey,
  targetLine,
} from "../src/components/player/read-it-in";
import { loadTape, TWINKLE, GOODNIGHT_MIA } from "./fixtures/tapes";
import { pictureLessTape, resumeAt, seedShelf, sentRow, shelfRow } from "./fixtures/shelf-seed";
import { evidenceShot } from "./fixtures/evidence";
import { watchSends } from "./fixtures/sends";

/** The house tape exactly as /public serves it. */
const HOUSE: SsyncManifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "public", "demo", "brave-little-star.ssync.json"), "utf8"),
);
const HOUSE_TITLE = "The Brave Little Star";
const HOUSE_AUTHOR = "Island Development Crew";
/** Every picture the house tape names: its own static files in /public. */
const HOUSE_PICTURES = new Set(
  HOUSE.pages.map((p) => p.illustration?.url).filter((u): u is string => !!u),
);

/** A code the shape a minted code has (32 lowercase hex). */
const TWINKLE_CODE = "7a22a7a22a7a22a7a22a7a22a7a22a71";
const GRANDMA_CODE = "7a22b7a22b7a22b7a22b7a22b7a22b71";
const BATH_CODE = "7a22c7a22c7a22c7a22c7a22c7a22c71";
const TWINKLE_KEY = `code:${TWINKLE_CODE}`;

const twinkleStory = () => loadTape("twinkle").story;
const twinkleRow = () => shelfRow(twinkleStory(), TWINKLE_CODE, "2026-10-21T07:00:00.000Z");

const MIA_LINE = "Mia read you this one. Now read it in yours.";
const GRANDMA_LINE = "Grandma Rose read you this one. Now read it in yours.";

/* ---------------------------------------------------------------- locators */

const panel = (page: Page) => page.locator('[data-panel="read-it-in"]');
const heading = (page: Page) => panel(page).getByRole("heading", { level: 2, name: "Read it in…" });
const feel = (page: Page) => panel(page).getByRole("radiogroup", { name: "What should it feel like?" });
const moodRadio = (page: Page, mood: MoodName) =>
  feel(page).getByRole("radio", { name: `${mood}, ${MOODS[mood].blurb}`, exact: true });
const chip = (page: Page, mood: MoodName) => feel(page).locator(`[data-sk="mood-chip"][data-mood="${mood}"]`);
const makeCopy = (page: Page) => panel(page).getByRole("button", { name: "Make our own copy" });
const band = (page: Page) => page.locator('[data-shelf="band"]');
const house = (page: Page) => page.locator('[data-shelf="house"]');
const face = (page: Page, id: string) => page.locator(`[data-sk="shelf-tape"][data-tape-id="${id}"]`);
const frames = (page: Page): Locator => page.locator("[data-page-index]");

/** "#f5b544" → "rgb(245, 181, 68)", the way getComputedStyle reports it. */
function rgb(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

/**
 * /read, hydrated: the room writes this visit's time after mount, so once it
 * is there a click lands on React, not on bare HTML.
 */
async function openRoom(page: Page): Promise<void> {
  await page.goto("/read");
  await expect(panel(page)).toBeVisible({ timeout: 20000 });
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("ssync-shelf-visit")), { timeout: 20000 })
    .not.toBeNull();
}

/** The checked mood's name, read off the radio group. */
async function checkedMood(page: Page): Promise<string | null> {
  return feel(page).evaluate((group) => {
    const on = [...group.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((r) => r.checked);
    return on?.closest("[data-mood]")?.getAttribute("data-mood") ?? null;
  });
}

/** Open the Creator's Music tool (its mood radios). */
async function openMusicTool(page: Page): Promise<void> {
  await page.getByRole("navigation", { name: "Story tools" }).getByRole("button", { name: /Music/ }).click();
}

/* ==================================================================== Node */

test.describe("T22a · the Read it in… helper (Node)", () => {
  test("target → Creator URL: the house tape, a shelf tape's code, a device tape's id, a sent tape's code", () => {
    expect(creatorUrl(houseTarget(HOUSE), "Hush")).toBe("/studio?open=house&mood=Hush");

    const [coded] = mergeShelf([twinkleRow()]);
    expect(coded.shareCode).toBe(TWINKLE_CODE);
    expect(creatorUrl(shelfTarget(coded), "Calm")).toBe(`/studio?open=${TWINKLE_CODE}&mood=Calm`);

    // a tape saved on this device that was never given a link: its library id
    const [local] = mergeShelf([{ ...twinkleRow(), id: "local-1a2b3c", shareCode: "" }]);
    expect(local.shareCode).toBeUndefined();
    expect(creatorUrl(shelfTarget(local), "Wonder")).toBe("/studio?open=local-1a2b3c&mood=Wonder");

    const sent = sentTarget(sentRow(GOODNIGHT_MIA, GRANDMA_CODE, "~0:08", "2026-10-19T18:40:00.000Z"));
    expect(creatorUrl(sent, "Rain")).toBe(`/studio?open=${GRANDMA_CODE}&mood=Rain`);

    // every mood rides as its own name
    for (const mood of MOOD_NAMES) expect(creatorUrl(houseTarget(HOUSE), mood)).toBe(`/studio?open=house&mood=${mood}`);
  });

  test("who read it: the computer for the house tape, the narrator for a voiced tape, else Someone", () => {
    expect(COMPUTER_LINE).toBe("A computer read you this one. Now read it in yours.");
    expect(readYouLine(houseTarget(HOUSE))).toBe(COMPUTER_LINE);

    const [twinkle] = mergeShelf([twinkleRow()]);
    expect(readYouLine(shelfTarget(twinkle))).toBe(MIA_LINE);

    // voiced, but nobody named on the tape
    const nameless = twinkleStory();
    delete (nameless.metadata as { narrator?: string }).narrator;
    const [unnamed] = mergeShelf([shelfRow(nameless, TWINKLE_CODE, "2026-10-21T07:00:00.000Z")]);
    expect(readYouLine(shelfTarget(unnamed))).toBe("Someone read you this one. Now read it in yours.");

    // words only, no voice on any page: the computer read it
    const [quiet] = mergeShelf([shelfRow(pictureLessTape("Bath Time Song"), BATH_CODE, "2026-10-12T18:00:00.000Z")]);
    expect(readYouLine(shelfTarget(quiet))).toBe(COMPUTER_LINE);

    // a sent tape's pages are not on this device: its reference's narrator decides
    expect(readYouLine(sentTarget(sentRow(GOODNIGHT_MIA, GRANDMA_CODE, "~0:08", "2026-10-19T18:40:00.000Z")))).toBe(
      GRANDMA_LINE,
    );
    expect(readYouLine(sentTarget({ code: GRANDMA_CODE, title: "A tape", author: "" }))).toBe(COMPUTER_LINE);
  });

  test("the preselected mood: the first page's mood through the music plan, else Wonder", () => {
    expect(defaultMood(houseTarget(HOUSE))).toBe("Wonder");
    const [twinkle] = mergeShelf([twinkleRow()]);
    expect(defaultMood(shelfTarget(twinkle))).toBe("Wonder");

    const calm = { ...twinkleStory() };
    calm.pages = calm.pages.map((p, i) => ({ ...p, music: i === 0 ? "Calm" : "Joy" }));
    const [calmEntry] = mergeShelf([shelfRow(calm, TWINKLE_CODE, "2026-10-21T07:00:00.000Z")]);
    expect(defaultMood(shelfTarget(calmEntry))).toBe("Calm");

    const [quiet] = mergeShelf([shelfRow(pictureLessTape("Bath Time Song"), BATH_CODE, "2026-10-12T18:00:00.000Z")]);
    expect(defaultMood(shelfTarget(quiet)), "no music: Wonder").toBe("Wonder");
    expect(defaultMood(sentTarget({ code: GRANDMA_CODE, title: "A tape", author: "" })), "sent: Wonder").toBe("Wonder");
  });

  test("the header picture: the resume page, else the first pictured page; none for a sent or picture-less tape", () => {
    const home = houseTarget(HOUSE);
    expect(headerPicture(home)).toEqual({ url: "/demo/images/page1.jpg", page: 1 });
    expect(headerPicture(home, 6)).toEqual({ url: "/demo/images/page6.jpg", page: 6 });
    // page 8 of the house tape has no picture: the first pictured page stands in
    expect(headerPicture(home, 8)).toEqual({ url: "/demo/images/page1.jpg", page: 1 });
    expect(headerPicture(home, 99)).toEqual({ url: "/demo/images/page1.jpg", page: 1 });

    const story = twinkleStory();
    const [twinkle] = mergeShelf([twinkleRow()]);
    expect(headerPicture(shelfTarget(twinkle))).toEqual({ url: story.pages[0].illustration?.url, page: 1 });
    expect(headerPicture(shelfTarget(twinkle), 3)).toEqual({ url: story.pages[2].illustration?.url, page: 3 });

    const [quiet] = mergeShelf([shelfRow(pictureLessTape("Bath Time Song"), BATH_CODE, "2026-10-12T18:00:00.000Z")]);
    expect(headerPicture(shelfTarget(quiet))).toBeNull();
    expect(headerPicture(sentTarget({ code: GRANDMA_CODE, title: "A tape", author: "" }), 1)).toBeNull();
  });

  test("the line naming the target, and one key per target", () => {
    expect(targetLine(houseTarget(HOUSE))).toBe(`${HOUSE_TITLE} · ${HOUSE_AUTHOR}`);
    const [twinkle] = mergeShelf([twinkleRow()]);
    expect(targetLine(shelfTarget(twinkle))).toBe(`${TWINKLE.title} · ${TWINKLE.byline}`);
    expect(targetLine(sentTarget({ code: GRANDMA_CODE, title: "A tape", author: "" }))).toBe("A tape");
    const keys = [
      targetKey(houseTarget(HOUSE)),
      targetKey(shelfTarget(twinkle)),
      targetKey(sentTarget({ code: GRANDMA_CODE, title: "A tape", author: "" })),
    ];
    expect(new Set(keys).size).toBe(3);
  });
});

/* ===================================================================== E2E */

test.describe("T22a · the panel on /read", () => {
  test("empty shelf: the panel reads the house tape; eight mood chips, Wonder checked; arrows move the check", async ({
    page,
  }) => {
    await openRoom(page);

    // the shipped doors are untouched
    await expect(page.locator(".pl-choice")).toHaveCount(3);
    await expect(page.getByRole("button", { name: /Play the demo tape/i })).toHaveCount(1);

    // the target, named
    await expect(heading(page)).toBeVisible();
    await expect(panel(page).locator('[data-rin="target"]')).toHaveText(`${HOUSE_TITLE} · ${HOUSE_AUTHOR}`);
    await expect(panel(page).locator('[data-rin="line"]')).toHaveText(COMPUTER_LINE);

    // the header: the house tape's first page, decorative, with its PAGE tab
    const art = panel(page).locator('[data-rin="art"] img');
    await expect(art).toHaveCount(1);
    await expect(art).toHaveAttribute("alt", "");
    await expect(art).toHaveAttribute("src", "/demo/images/page1.jpg");
    // lazy: beside the shelves it is in the first screen and loads; on a phone it waits for the panel
    await expect(art).toHaveAttribute("loading", "lazy");
    await expect(panel(page).locator('[data-rin="tab"]')).toHaveText("PAGE 1");

    // eight radios, in MOOD_NAMES order, named "<Name>, <blurb>"
    const radios = feel(page).getByRole("radio");
    await expect(radios).toHaveCount(8);
    const names = await feel(page).locator('[data-sk="mood-chip"]').evaluateAll((els) =>
      els.map((el) => ({
        mood: el.getAttribute("data-mood"),
        name: el.querySelector(".sk-mood-chip-name")?.textContent ?? "",
        blurb: el.querySelector(".sk-mood-chip-blurb")?.textContent ?? "",
      })),
    );
    expect(names.map((n) => n.mood)).toEqual([...MOOD_NAMES]);
    for (const [i, mood] of MOOD_NAMES.entries()) {
      expect(names[i].name).toBe(mood);
      expect(names[i].blurb, `${mood}'s blurb, verbatim`).toBe(MOODS[mood].blurb);
      await expect(radios.nth(i)).toHaveAccessibleName(`${mood}, ${MOODS[mood].blurb}`);
    }
    await expect(moodRadio(page, "Wonder")).toBeChecked();
    expect(await checkedMood(page)).toBe("Wonder");

    // the chips' register, read in one frame
    await page.evaluate(() => document.fonts.ready);
    const looks = await feel(page).evaluate((group) => {
      const root = getComputedStyle(document.documentElement);
      const fraunces = root.getPropertyValue("--font-fraunces").split(",")[0].trim().replace(/^["']|["']$/g, "");
      return [...group.querySelectorAll<HTMLElement>('[data-sk="mood-chip"]')].map((el) => {
        const cs = getComputedStyle(el);
        const bandEl = el.querySelector<HTMLElement>('[data-sk="mood-band"]')!;
        const bandCs = getComputedStyle(bandEl);
        const name = getComputedStyle(el.querySelector(".sk-mood-chip-name")!);
        const blurb = getComputedStyle(el.querySelector(".sk-mood-chip-blurb")!);
        const box = el.getBoundingClientRect();
        const bandBox = bandEl.getBoundingClientRect();
        const dots = [...el.querySelectorAll<HTMLElement>(".sk-mood-chip-dot")].map(
          (d) => getComputedStyle(d).backgroundColor,
        );
        return {
          mood: el.getAttribute("data-mood"),
          checked: el.querySelector<HTMLInputElement>("input")!.checked,
          border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
          radius: cs.borderTopLeftRadius,
          paper: cs.backgroundColor,
          band: { height: bandCs.height, color: bandCs.backgroundColor, atTop: Math.round(bandBox.top - box.top) },
          nameWeight: name.fontWeight,
          nameSize: name.fontSize,
          nameFamily: name.fontFamily.includes(fraunces),
          blurbSize: blurb.fontSize,
          blurbColor: blurb.color,
          dots,
          icon: !!el.querySelector("svg.sk-mood-chip-icon"),
          height: Math.round(box.height),
        };
      });
    });
    for (const look of looks) {
      const mood = look.mood as MoodName;
      const colour = rgb(MOOD_COLOR[mood]);
      expect(look.band, `${mood}: a 5px band of its colour across the top`).toEqual({
        height: "5px",
        color: colour,
        atTop: look.checked ? 3 : 2,
      });
      expect(look.radius).toBe("8px");
      expect(look.nameWeight).toBe("700");
      expect(look.nameSize).toBe("14px");
      expect(look.nameFamily, `${mood}: the name is Fraunces`).toBe(true);
      expect(look.blurbSize).toBe("11px");
      expect(look.dots, `${mood}: a six-dot contour in its colour`).toEqual(Array(6).fill(colour));
      expect(look.icon).toBe(true);
      expect(look.height).toBeGreaterThanOrEqual(48);
      if (look.checked) {
        expect(look.border).toBe("3px solid rgb(30, 26, 22)");
        expect(look.paper, "selected: the label-yellow field").toBe("rgb(255, 201, 60)");
      } else {
        expect(look.border).toBe("2px solid rgb(30, 26, 22)");
        expect(look.paper).toBe("rgb(255, 253, 246)");
        expect(look.blurbColor, "the blurb in ink-2").toBe("rgb(90, 81, 72)");
      }
    }

    // the keyboard: one tab stop, the arrows move the check
    await moodRadio(page, "Wonder").focus();
    await page.keyboard.press("ArrowDown");
    await expect(moodRadio(page, "Adventure")).toBeChecked();
    await expect(moodRadio(page, "Adventure")).toBeFocused();
    // the kit's one focus ring, around the chip
    const ring = await chip(page, "Adventure").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), colour: cs.outlineColor };
    });
    expect(ring.style).toBe("solid");
    expect(ring.width).toBeGreaterThanOrEqual(2);
    expect(ring.colour).toBe("rgb(245, 158, 11)");
    await page.keyboard.press("ArrowRight");
    await expect(moodRadio(page, "Calm")).toBeChecked();
    await page.keyboard.press("ArrowUp");
    await expect(moodRadio(page, "Adventure")).toBeChecked();
    await expect(moodRadio(page, "Wonder")).not.toBeChecked();
    // the checked chip takes the selected look
    await expect(chip(page, "Adventure")).toHaveClass(/is-on/);
    await expect(chip(page, "Wonder")).not.toHaveClass(/is-on/);
  });

  test("the panel's own box: glass, radius 20, padding 16 (s07's 12 from 1024px); the heading and lines in their faces", async ({ page }) => {
    await openRoom(page);
    await page.evaluate(() => document.fonts.ready);
    const box = await panel(page).evaluate((el) => {
      const cs = getComputedStyle(el);
      const h = getComputedStyle(el.querySelector("h2")!);
      const line = getComputedStyle(el.querySelector('[data-rin="line"]')!);
      const label = getComputedStyle(el.querySelector('[data-rin="feel-label"]')!);
      const target = getComputedStyle(el.querySelector('[data-rin="target"]')!);
      const art = el.querySelector<HTMLElement>('[data-rin="art"]');
      const img = el.querySelector<HTMLImageElement>('[data-rin="art"] img');
      const root = getComputedStyle(document.documentElement);
      const first = (v: string) => v.split(",")[0].trim().replace(/^["']|["']$/g, "");
      return {
        radius: cs.borderTopLeftRadius,
        padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft],
        border: cs.borderTopWidth,
        blur: cs.backdropFilter,
        h: { weight: h.fontWeight, size: h.fontSize, geist: h.fontFamily.includes(first(root.getPropertyValue("--font-geist-sans"))) },
        line: {
          weight: line.fontWeight,
          size: line.fontSize,
          colour: line.color,
          fraunces: line.fontFamily.includes(first(root.getPropertyValue("--font-fraunces"))),
        },
        label: {
          size: label.fontSize,
          upper: label.textTransform,
          plex: label.fontFamily.includes(first(root.getPropertyValue("--font-plex-mono"))),
        },
        target: { upper: target.textTransform, plex: target.fontFamily.includes(first(root.getPropertyValue("--font-plex-mono"))) },
        art: art ? { h: Math.round(art.getBoundingClientRect().height), radius: getComputedStyle(art).borderTopLeftRadius } : null,
        fit: img ? getComputedStyle(img).objectFit : null,
      };
    });
    expect(box.radius).toBe("20px");
    // phones and tablets: 16; from 1024px s07.html's own .s7-panel padding, 12
    // (changed with the s07 fold fix: the 440px panel fits a 712px laptop screen)
    const pad = (page.viewportSize()?.width ?? 0) >= 1024 ? "12px" : "16px";
    expect(box.padding).toEqual([pad, pad, pad, pad]);
    expect(box.border).toBe("1px");
    expect(box.blur).toContain("blur");
    expect(box.h).toEqual({ weight: "600", size: "17px", geist: true });
    expect(box.line).toEqual({ weight: "500", size: "16px", colour: "rgb(205, 211, 226)", fraunces: true });
    expect(box.label).toEqual({ size: "10.5px", upper: "uppercase", plex: true });
    expect(box.target).toEqual({ upper: "uppercase", plex: true });
    expect(box.art).toEqual({ h: 110, radius: "12px" });
    expect(box.fit).toBe("cover");
    await expect(makeCopy(page)).toHaveAttribute("data-variant", "gold");
    await expect(makeCopy(page).locator("svg")).toHaveCount(1);
  });

  test("Twinkle selected: Mia read it, her first page heads the panel, Wonder checked", async ({ page }) => {
    await seedShelf(page, { library: [twinkleRow()] });
    await openRoom(page);
    await expect(face(page, TWINKLE_CODE)).toHaveAttribute("aria-checked", "true");
    await expect(panel(page).locator('[data-rin="target"]')).toHaveText(`${TWINKLE.title} · ${TWINKLE.byline}`);
    await expect(panel(page).locator('[data-rin="line"]')).toHaveText(MIA_LINE);
    await expect(panel(page).locator('[data-rin="art"] img')).toHaveAttribute(
      "src",
      twinkleStory().pages[0].illustration!.url!,
    );
    await expect(panel(page).locator('[data-rin="tab"]')).toHaveText("PAGE 1");
    await expect(moodRadio(page, "Wonder")).toBeChecked();
  });

  test("where you stopped heads the panel: Twinkle at page 3", async ({ page }) => {
    await seedShelf(page, { library: [twinkleRow()], resume: { [TWINKLE_KEY]: resumeAt(3, 5, "2026-10-21T19:00:00.000Z") } });
    await openRoom(page);
    await expect(band(page).getByText("You stopped at page 3.", { exact: true })).toBeVisible();
    await expect(panel(page).locator('[data-rin="art"] img')).toHaveAttribute(
      "src",
      twinkleStory().pages[2].illustration!.url!,
    );
    await expect(panel(page).locator('[data-rin="tab"]')).toHaveText("PAGE 3");
  });

  test("the doors: the house row targets the house tape, the band the selected tape; a new target resets the feeling", async ({
    page,
  }) => {
    await seedShelf(page, {
      library: [twinkleRow(), shelfRow(pictureLessTape("Bath Time Song", ""), BATH_CODE, "2026-10-12T18:00:00.000Z")],
    });
    await openRoom(page);
    await expect(face(page, TWINKLE_CODE)).toHaveAttribute("aria-checked", "true");
    await expect(panel(page).locator('[data-rin="line"]')).toHaveText(MIA_LINE);
    await moodRadio(page, "Calm").check();
    await expect(moodRadio(page, "Calm")).toBeChecked();

    // the house row's door: a separate ghost control, the demo door untouched
    const houseDoor = house(page).getByRole("button", { name: "Read it in…" });
    await expect(houseDoor).toHaveAttribute("data-variant", "ghost");
    await expect(houseDoor).not.toHaveClass(/pl-choice/);
    // one name, two doors: each is described by the tape it is about
    await expect(houseDoor).toHaveAccessibleDescription(`${HOUSE_TITLE} · ${HOUSE_AUTHOR}`);
    await expect(band(page).getByRole("button", { name: "Read it in…" })).toHaveAccessibleDescription(
      `${TWINKLE.title} · ${TWINKLE.byline}`,
    );
    await houseDoor.click();
    await expect(panel(page).locator('[data-rin="target"]')).toHaveText(`${HOUSE_TITLE} · ${HOUSE_AUTHOR}`);
    await expect(panel(page).locator('[data-rin="line"]')).toHaveText(COMPUTER_LINE);
    await expect(moodRadio(page, "Wonder"), "a new target starts from its own mood").toBeChecked();
    await expect(heading(page)).toBeFocused();
    await expect(face(page, TWINKLE_CODE), "the shelf's selection stays").toHaveAttribute("aria-checked", "true");

    // the band's door: back to the selected tape
    const bandDoor = band(page).getByRole("button", { name: "Read it in…" });
    await expect(bandDoor).toHaveAttribute("data-variant", "ghost");
    await bandDoor.click();
    await expect(panel(page).locator('[data-rin="target"]')).toHaveText(`${TWINKLE.title} · ${TWINKLE.byline}`);
    await expect(heading(page)).toBeFocused();

    // choosing another tape on the shelf moves the panel with it
    await face(page, BATH_CODE).click();
    await expect(panel(page).locator('[data-rin="target"]')).toHaveText("Bath Time Song");
    await expect(bandDoor, "the band's door follows the selection").toHaveAccessibleDescription("Bath Time Song");
    await expect(panel(page).locator('[data-rin="line"]')).toHaveText(COMPUTER_LINE);
    await expect(panel(page).locator('[data-rin="art"]'), "no picture, no header").toHaveCount(0);

    // keyboard order in the band is unchanged before the new door: … Pull the tape out, then Read it in…
    await face(page, TWINKLE_CODE).click();
    const pull = band(page).getByRole("button", { name: "Pull the tape out" });
    await pull.focus();
    await page.keyboard.press("Tab");
    await expect(bandDoor).toBeFocused();
  });

  test("a tape sent to you: its narrator's line, no stored picture, Wonder", async ({ page }) => {
    await seedShelf(page, {
      library: [],
      sent: [sentRow(GOODNIGHT_MIA, GRANDMA_CODE, "~0:08", "2026-10-19T18:40:00.000Z")],
    });
    await openRoom(page);
    await expect(face(page, GRANDMA_CODE)).toHaveAttribute("aria-checked", "true");
    await expect(panel(page).locator('[data-rin="target"]')).toHaveText(`${GOODNIGHT_MIA.title} · ${GOODNIGHT_MIA.byline}`);
    await expect(panel(page).locator('[data-rin="line"]')).toHaveText(GRANDMA_LINE);
    await expect(band(page).getByRole("button", { name: "Read it in…" })).toHaveAccessibleDescription(
      `${GOODNIGHT_MIA.title} · ${GOODNIGHT_MIA.byline}`,
    );
    await expect(panel(page).locator('[data-rin="art"]')).toHaveCount(0);
    await expect(panel(page).locator("img")).toHaveCount(0);
    await expect(moodRadio(page, "Wonder")).toBeChecked();
  });

  test("house tape, Hush → Make our own copy → the Creator opens it in Hush, no voice on any page", async ({ page }) => {
    test.setTimeout(90000);
    await openRoom(page);
    await moodRadio(page, "Hush").check();
    await expect(chip(page, "Hush")).toHaveClass(/is-on/);
    await makeCopy(page).click();
    await expect(page).toHaveURL(/\/studio/, { timeout: 20000 });
    await expect(frames(page)).toHaveCount(8, { timeout: 30000 });
    await expect(page.locator("#studio-title")).toHaveValue(HOUSE_TITLE);
    const names = await frames(page).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
    expect(names.filter((n) => n.includes("has voice"))).toEqual([]);
    // T15 cleans the query once it has read it
    await expect.poll(() => new URL(page.url()).search).toBe("");
    await openMusicTool(page);
    await expect(page.getByRole("radio", { name: /Hush/ })).toHaveAttribute("aria-checked", "true");
  });

  test("Twinkle (a shelf tape with a code), Calm → Make our own copy → its five pages in Calm", async ({ page }) => {
    test.setTimeout(90000);
    await seedShelf(page, { library: [twinkleRow()] });
    await openRoom(page);
    await expect(face(page, TWINKLE_CODE)).toHaveAttribute("aria-checked", "true");
    await moodRadio(page, "Calm").check();
    await makeCopy(page).click();
    await expect(page).toHaveURL(/\/studio/, { timeout: 20000 });
    await expect(frames(page)).toHaveCount(5, { timeout: 30000 });
    await expect(page.locator("#studio-title")).toHaveValue(TWINKLE.title);
    const names = await frames(page).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
    expect(names.filter((n) => n.includes("has voice")), "another family's voices never come along").toEqual([]);
    await openMusicTool(page);
    await expect(page.getByRole("radio", { name: /Calm/ })).toHaveAttribute("aria-checked", "true");
  });

  test("nothing is fetched until Make our own copy: only same-origin /_next/ assets and the house tape's own pictures", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(90000);
    const origin = new URL(baseURL!).origin;
    const lines = (sends: ReturnType<typeof watchSends>) => sends.sent().map((r) => `${r.type} ${r.method} ${r.url}`);
    /** While /read loads: any data request (fetch / XHR) the room or the panel makes. */
    const loading = watchSends(page, { origin, types: ["fetch", "xhr"] });
    await seedShelf(page, { library: [twinkleRow()] });
    await openRoom(page);
    await expect(face(page, TWINKLE_CODE)).toHaveAttribute("aria-checked", "true");
    await page.waitForLoadState("load");
    loading.stop();
    expect(lines(loading), "loading the room fetches nothing for the panel").toEqual([]);

    /** From the loaded room to the press: any request at all, but Next's own assets and the house pictures. */
    const asked = watchSends(page, {
      origin,
      types: "all",
      // the header picture of the house tape: this app's own static file, named by the house manifest
      ignore: (url, req) => url.origin === origin && req.resourceType() === "image" && HOUSE_PICTURES.has(url.pathname),
    });
    await moodRadio(page, "Calm").check();
    await moodRadio(page, "Joy").focus();
    await page.keyboard.press("ArrowDown");
    await house(page).getByRole("button", { name: "Read it in…" }).click();
    await expect(panel(page).locator('[data-rin="art"] img')).toHaveAttribute("src", "/demo/images/page1.jpg");
    await moodRadio(page, "Hush").check();
    await band(page).getByRole("button", { name: "Read it in…" }).click();
    await house(page).getByRole("button", { name: "Read it in…" }).click();
    await moodRadio(page, "Rain").check();
    await page.waitForTimeout(500);
    expect(lines(asked), "the panel fetched nothing").toEqual([]);

    // the only network activity after the press is T15's entry: the house tape's JSON
    asked.stop();
    const houseJson = page.waitForRequest((req) => new URL(req.url()).pathname === "/demo/brave-little-star.ssync.json", {
      timeout: 30000,
    });
    await makeCopy(page).click();
    const req = await houseJson;
    expect(new URL(req.url()).origin).toBe(origin);
    await expect(frames(page)).toHaveCount(8, { timeout: 30000 });
  });

  test("layout: the right column at ≥ 1024 px, under the shelves below; one chip column below 360 px; never sideways", async ({
    page,
  }) => {
    await seedShelf(page, { library: [twinkleRow()] });
    await openRoom(page);
    await expect(face(page, TWINKLE_CODE)).toHaveAttribute("aria-checked", "true");

    const measure = () =>
      page.evaluate(() => {
        const p = document.querySelector('[data-panel="read-it-in"]')!.getBoundingClientRect();
        const main = document.querySelector(".rr-main")!.getBoundingClientRect();
        const houseRow = document.querySelector('[data-shelf="house"]')!.getBoundingClientRect();
        const demo = document.querySelector('[data-shelf="house"] .pl-choice-1')!.getBoundingClientRect();
        const houseDoor = document.querySelector('[data-shelf="house"] .rin-door')!.getBoundingClientRect();
        const foot = document.querySelector('[data-shelf="house"] .rr-foot')!.getBoundingClientRect();
        const chips = [...document.querySelectorAll('[data-panel="read-it-in"] [data-sk="mood-chip"]')].map((el) => {
          const r = el.getBoundingClientRect();
          return {
            left: Math.round(r.left),
            top: Math.round(r.top),
            right: Math.round(r.right),
            bottom: Math.round(r.bottom),
            height: r.height,
          };
        });
        return {
          doc: document.documentElement.scrollWidth,
          view: document.documentElement.clientWidth,
          panel: { left: Math.round(p.left), top: Math.round(p.top + window.scrollY), right: Math.round(p.right) },
          main: { right: Math.round(main.right), top: Math.round(main.top + window.scrollY) },
          houseBottom: Math.round(houseRow.bottom + window.scrollY),
          demo: { left: Math.round(demo.left), right: Math.round(demo.right), bottom: Math.round(demo.bottom) },
          houseDoor: {
            left: Math.round(houseDoor.left),
            right: Math.round(houseDoor.right),
            top: Math.round(houseDoor.top),
            bottom: Math.round(houseDoor.bottom),
          },
          footTop: Math.round(foot.top),
          chips,
        };
      });

    for (const width of [320, 375, 390, 768, 1024, 1140, 1280, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(() => document.fonts.ready);
      let m = await measure();
      await expect
        .poll(async () => {
          const a = await measure();
          await new Promise((r) => setTimeout(r, 150));
          m = await measure();
          return JSON.stringify(a) === JSON.stringify(m);
        })
        .toBe(true);
      expect(m.doc, `no sideways scroll at ${width}px`).toBeLessThanOrEqual(m.view);
      // the house row's door: under the demo tape card, its width, with air above the footnote
      expect(m.houseDoor.top, `${width}: the house door sits under the demo card`).toBeGreaterThanOrEqual(m.demo.bottom);
      expect(m.houseDoor.left, `${width}: the house door lines up with the demo card`).toBe(m.demo.left);
      if (width >= 768) expect(Math.abs(m.houseDoor.right - m.demo.right), `${width}: the demo card's width`).toBeLessThanOrEqual(1);
      expect(m.footTop - m.houseDoor.bottom, `${width}: air above the footnote`).toBeGreaterThanOrEqual(8);
      expect(m.panel.right, `the panel stays inside ${width}px`).toBeLessThanOrEqual(m.view);
      if (width >= 1024) {
        expect(m.panel.left, `${width}: the right column`).toBeGreaterThanOrEqual(m.main.right);
        expect(Math.abs(m.panel.top - m.main.top), `${width}: level with the shelves`).toBeLessThanOrEqual(2);
      } else {
        expect(m.panel.top, `${width}: under the shelves`).toBeGreaterThanOrEqual(m.houseBottom);
      }
      const lefts = new Set(m.chips.map((c) => c.left));
      // 2 columns × 4 rows; one column below 360 px
      expect(lefts.size, `${width}: chip columns`).toBe(width < 360 ? 1 : 2);
      expect(new Set(m.chips.map((c) => c.top)).size, `${width}: chip rows`).toBe(width < 360 ? 8 : 4);
      for (const c of m.chips) {
        expect(c.right).toBeLessThanOrEqual(m.panel.right);
        // a chip whose blurb wraps (the brief's 182px chips below 1280) grows; it never shrinks under 48
        expect(c.height, `${width}: a chip is at least 48px tall`).toBeGreaterThanOrEqual(48);
      }
      if (width >= 360) {
        // the rows stay level: both chips of a row share its top and its bottom
        for (let i = 0; i < m.chips.length; i += 2) {
          expect(m.chips[i + 1].top, `${width}: row ${i / 2 + 1} level at the top`).toBe(m.chips[i].top);
          expect(m.chips[i + 1].bottom, `${width}: row ${i / 2 + 1} level at the bottom`).toBe(m.chips[i].bottom);
        }
      }
    }

    // from 1280 the panel is wider (472px) and every blurb holds one line, with room to spare
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(() => document.fonts.ready);
      await expect
        .poll(() =>
          feel(page).evaluate((group) =>
            [...group.querySelectorAll<HTMLElement>(".sk-mood-chip-blurb")].every((b) => {
              const lh = parseFloat(getComputedStyle(b).lineHeight);
              return b.getBoundingClientRect().height <= lh * 1.05 && b.scrollWidth <= b.clientWidth;
            }),
          ),
        )
        .toBe(true);
      const slack = await feel(page).evaluate((group) =>
        Math.min(
          ...[...group.querySelectorAll<HTMLElement>('[data-sk="mood-chip"]')].map((chipEl) => {
            const blurb = chipEl.querySelector<HTMLElement>(".sk-mood-chip-blurb")!;
            const range = document.createRange();
            range.selectNodeContents(blurb);
            const text = range.getBoundingClientRect().width;
            return blurb.getBoundingClientRect().width - text;
          }),
        ),
      );
      expect(slack, `${width}: the longest blurb has ≥ 12px to spare`).toBeGreaterThanOrEqual(12);
    }
  });

  test("1140×712 with s07's shelf (Grandma's sent tape, Twinkle, Bath Time Song): every tape and the blank tape stand whole, at 1280 and 1440 too", async ({
    page,
  }) => {
    // the T20b seed: the shelf the reference draws beside this panel
    await seedShelf(page, {
      library: [twinkleRow(), shelfRow(pictureLessTape("Bath Time Song", ""), BATH_CODE, "2026-10-12T18:00:00.000Z")],
      sent: [sentRow(GOODNIGHT_MIA, GRANDMA_CODE, "~0:08", "2026-10-19T18:40:00.000Z")],
    });
    await page.setViewportSize({ width: 1140, height: 712 });
    await openRoom(page);
    await expect(page.locator('[data-sk="shelf-tape"]')).toHaveCount(3);
    await expect(page.locator('[data-sk="shelf-blank"]')).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);

    /** The scroller's client box and every face on it, in one frame. */
    const measure = () =>
      page.evaluate(() => {
        const shelf = document.querySelector<HTMLElement>('[data-sk="shelf"]')!;
        const box = shelf.getBoundingClientRect();
        const left = box.left + shelf.clientLeft;
        const right = left + shelf.clientWidth;
        const faces = [...shelf.querySelectorAll<HTMLElement>('[data-sk="shelf-tape"], [data-sk="shelf-blank"]')].map(
          (el) => {
            const r = el.getBoundingClientRect();
            return {
              face: el.getAttribute("data-tape-id") ?? el.getAttribute("data-sk"),
              left: Math.round(r.left - left),
              right: Math.round(right - r.right),
            };
          },
        );
        const panelBox = document.querySelector('[data-panel="read-it-in"]')!.getBoundingClientRect();
        return {
          scrollWidth: shelf.scrollWidth,
          clientWidth: shelf.clientWidth,
          scrollLeft: shelf.scrollLeft,
          shelfRight: Math.round(box.right),
          panelLeft: Math.round(panelBox.left),
          panelWidth: Math.round(panelBox.width),
          faces,
        };
      });

    // 1140: s07's own 440px panel (s07.html .s7-panel x676–1116; it was the
    // brief's 404px, which wrapped the line and two blurbs and pushed "Make our
    // own copy" under the fold); from 1280 the 472px one
    for (const [width, panelWidth] of [
      [1140, 440],
      [1280, 472],
      [1440, 472],
    ] as const) {
      await page.setViewportSize({ width, height: 712 });
      await page.evaluate(() => document.fonts.ready);
      let m = await measure();
      await expect
        .poll(async () => {
          const a = await measure();
          await new Promise((r) => setTimeout(r, 150));
          m = await measure();
          return JSON.stringify(a) === JSON.stringify(m);
        })
        .toBe(true);

      expect(m.panelWidth, `${width}: the panel's width`).toBe(panelWidth);
      expect(m.faces.map((f) => f.face)).toEqual([GRANDMA_CODE, TWINKLE_CODE, BATH_CODE, "shelf-blank"]);
      expect(m.scrollWidth, `${width}: the shelf does not scroll sideways`).toBeLessThanOrEqual(m.clientWidth);
      expect(m.scrollLeft).toBe(0);
      for (const f of m.faces) {
        expect(f.left, `${width}: ${f.face} starts ≥ 12px inside the shelf`).toBeGreaterThanOrEqual(12);
        expect(f.right, `${width}: ${f.face} ends ≥ 12px inside the shelf`).toBeGreaterThanOrEqual(12);
      }
      expect(m.panelLeft, `${width}: the panel stands beside the shelf, not over it`).toBeGreaterThanOrEqual(m.shelfRight);
    }
  });

  test("s07 at 1140×712 (and 1024/1280 × 712): the whole panel, Make our own copy included, fits the first screen", async ({
    page,
  }) => {
    // s07's room: Grandma's sent tape, Twinkle stopped at page 3, Bath Time Song;
    // the panel reads the house tape in Hush (the fidelity capture's state)
    await seedShelf(page, {
      library: [twinkleRow(), shelfRow(pictureLessTape("Bath Time Song", ""), BATH_CODE, "2026-10-12T18:00:00.000Z")],
      sent: [sentRow(GOODNIGHT_MIA, GRANDMA_CODE, "~0:08", "2026-10-19T18:40:00.000Z")],
      resume: { [TWINKLE_KEY]: resumeAt(3, twinkleStory().pages.length, "2026-10-20T19:12:00.000Z") },
    });
    await page.setViewportSize({ width: 1140, height: 712 });
    await openRoom(page);
    await expect(band(page).getByText("You stopped at page 3.", { exact: true })).toBeVisible();
    await house(page).getByRole("button", { name: "Read it in…" }).click();
    await expect(heading(page)).toBeFocused();
    await moodRadio(page, "Hush").check();

    /** Every box this test reads, in one frame. */
    const measure = () =>
      page.evaluate(() => {
        const box = (el: Element | null) => {
          const r = el!.getBoundingClientRect();
          return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) };
        };
        const oneLine = (el: HTMLElement) => {
          const lh = parseFloat(getComputedStyle(el).lineHeight);
          return el.getBoundingClientRect().height <= lh * 1.05 && el.scrollWidth <= el.clientWidth;
        };
        const panelEl = document.querySelector('[data-panel="read-it-in"]')!;
        const make = [...panelEl.querySelectorAll("button")].find((b) => b.textContent?.includes("Make our own copy"))!;
        return {
          view: window.innerHeight,
          panel: box(panelEl),
          make: { ...box(make), height: Math.round(make.getBoundingClientRect().height) },
          yours: box(document.getElementById("rr-yours-label")),
          line: oneLine(panelEl.querySelector<HTMLElement>('[data-rin="line"]')!),
          blurbs: [...panelEl.querySelectorAll<HTMLElement>(".sk-mood-chip-blurb")].map(oneLine),
        };
      });

    for (const width of [1024, 1140, 1280]) {
      await page.setViewportSize({ width, height: 712 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(() => document.fonts.ready);
      let m = await measure();
      await expect
        .poll(async () => {
          const a = await measure();
          await new Promise((r) => setTimeout(r, 150));
          m = await measure();
          return JSON.stringify(a) === JSON.stringify(m);
        })
        .toBe(true);
      // s07: YOUR TAPES at y90, the panel from y92, its gold pill ending near y683
      expect(m.yours.top, `${width}: YOUR TAPES sits near the top (s07 y90)`).toBeLessThanOrEqual(104);
      expect(m.panel.top, `${width}: the panel starts near s07's y92`).toBeLessThanOrEqual(100);
      expect(m.make.bottom, `${width}: Make our own copy ends ≥ 12px above the fold`).toBeLessThanOrEqual(m.view - 12);
      expect(m.panel.bottom, `${width}: the whole panel is on the first screen`).toBeLessThanOrEqual(m.view);
      expect(m.make.height, `${width}: s07's 42px pill`).toBeGreaterThanOrEqual(42);
      expect(m.line, `${width}: "…Now read it in yours." holds one line`).toBe(true);
      expect(m.blurbs, `${width}: every mood blurb holds one line`).toEqual(Array(8).fill(true));
    }

    // a phone keeps the 44px touch target
    await page.setViewportSize({ width: 375, height: 812 });
    await expect.poll(async () => (await measure()).make.height).toBeGreaterThanOrEqual(44);
  });

  test("375×812: the band's Read it in… scrolls the panel into view and focuses its heading", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await seedShelf(page, { library: [twinkleRow()] });
    await openRoom(page);
    await expect(face(page, TWINKLE_CODE)).toHaveAttribute("aria-checked", "true");
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await panel(page).evaluate((el) => el.getBoundingClientRect().top), "the panel starts below the fold").toBeGreaterThan(812);

    await band(page).getByRole("button", { name: "Read it in…" }).click();
    await expect(heading(page)).toBeFocused();
    // the whole panel comes into sight (it is shorter than the phone's screen)
    expect(await panel(page).evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(812);
    await expect(panel(page)).toBeInViewport({ ratio: 1, timeout: 5000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

    // the house row's door does the same, for the house tape
    await page.evaluate(() => window.scrollTo(0, 0));
    await house(page).getByRole("button", { name: "Read it in…" }).click();
    await expect(heading(page)).toBeFocused();
    await expect(panel(page).locator('[data-rin="line"]')).toHaveText(COMPUTER_LINE);
    await expect(panel(page)).toBeInViewport({ ratio: 1, timeout: 5000 });
  });

  test("reduced motion: nothing in the panel animates; the door jumps, it does not glide", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 375, height: 812 });
    await seedShelf(page, { library: [twinkleRow()] });
    await openRoom(page);
    await expect(face(page, TWINKLE_CODE)).toHaveAttribute("aria-checked", "true");
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { __rinMotion: string[] }).__rinMotion = seen;
      const panelEl = document.querySelector('[data-panel="read-it-in"]')!;
      for (const type of ["animationstart", "transitionrun"]) {
        panelEl.addEventListener(type, (event) => seen.push(`${type}:${(event as TransitionEvent).propertyName ?? ""}`), true);
      }
    });
    await moodRadio(page, "Hush").check();
    await moodRadio(page, "Hush").press("ArrowDown");
    await expect(moodRadio(page, "Rain")).toBeChecked();
    await band(page).getByRole("button", { name: "Read it in…" }).click();
    await expect(heading(page)).toBeFocused();
    // instant: in place on the next frame
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const placed = await panel(page).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), view: window.innerHeight };
    });
    expect(placed.top).toBeGreaterThanOrEqual(0);
    expect(placed.bottom).toBeLessThanOrEqual(placed.view);
    await page.waitForTimeout(300);
    const seen = await page.evaluate(() => (window as unknown as { __rinMotion: string[] }).__rinMotion);
    expect(seen).toEqual([]);
    const durations = await panel(page).evaluate((el) =>
      [...el.querySelectorAll<HTMLElement>("*")].flatMap((n) => {
        const cs = getComputedStyle(n);
        return [...cs.transitionDuration.split(","), ...cs.animationDuration.split(",")].map((d) => d.trim());
      }),
    );
    expect(durations.every((d) => d === "0s")).toBe(true);
  });
});

/* ================================================================ fidelity */

test.describe("T22a · fidelity captures (s07 right panel)", () => {
  test("1140×712: empty shelf, the house tape, Hush; then 375×812", async ({ page }) => {
    await page.setViewportSize({ width: 1140, height: 712 });
    await openRoom(page);
    await moodRadio(page, "Hush").check();
    await expect(chip(page, "Hush")).toHaveClass(/is-on/);
    await page.mouse.move(1, 1);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(panel(page)).toBeInViewport();
    // the header picture is lazy (in view here, so it loads): wait for it before the shot
    await expect
      .poll(() => panel(page).locator('[data-rin="art"] img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true);
    await evidenceShot(page, "T22a-1140.png");

    await page.setViewportSize({ width: 375, height: 812 });
    await house(page).getByRole("button", { name: "Read it in…" }).click();
    await expect(heading(page)).toBeFocused();
    await expect(panel(page)).toBeInViewport({ ratio: 1, timeout: 5000 });
    await expect
      .poll(() => panel(page).locator('[data-rin="art"] img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await evidenceShot(page, "T22a-375.png");
  });
});
