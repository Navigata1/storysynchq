// T03 · Whose voice is this? `metadata.narrator` from "story by", and
// "VOICE: <narrator>" on the cover and in the deck chip when present.
//
// Reference: s05 — Grandma's iPhone shows Mia's cover with
// `SIDE A · 5 PAGES · ~0:24 · VOICE: MIA`, and once the tape plays the deck chip
// carries "a hairline + i-mic 12px and the narrator's name".
//
// Node: the derivation rule (narratorFromByline / resolveNarrator) pinned.
// E2E: /studio → Finish → the grown-up gate → the saved tape and the
// downloaded .storysync carry the narrator; /read?story= shows it on the cover
// and in the deck chip. A tape read by the browser voice never names a person.

import { test, expect, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { unpackStorysync } from "../src/lib/storysync/container";
import type { SsyncManifest } from "../src/lib/storysync/manifest";
import { narratorFromByline, resolveNarrator } from "../src/lib/storysync/narrator";
import {
  DRAFT_KEY,
  LIBRARY_KEY,
  restoreDraft,
  seedDeviceLibrary,
  seedStudioDraft,
} from "./fixtures/helpers";
import { TWINKLE } from "./fixtures/tapes";

/* ------------------------------------------------------------- the rule */

test.describe("narrator · the derivation rule (node)", () => {
  test("narratorFromByline takes the lead name of a story-by line", () => {
    const cases: Array<[string | undefined | null, string | undefined]> = [
      // the ticket's table
      [TWINKLE.byline, "Mia"],
      ["Grandma Rose", "Grandma Rose"],
      ["  Mom ", "Mom"],
      ["Bo (5) with Dad", "Bo"],
      ["", undefined],
      // each separator on its own
      ["Ada, age 4", "Ada"],
      ["Ada — with Dad", "Ada"],
      ["Ada – with Dad", "Ada"],
      ["Ada - with Dad", "Ada"],
      ["Ada with Dad", "Ada"],
      ["Ada(4)", "Ada"],
      // the first separator wins, wherever it is
      ["Ada with Dad, age 4", "Ada"],
      ["Ada (4), with Dad", "Ada"],
      // a hyphen inside a name is part of the name; a bare dash is not
      ["Mary-Kate", "Mary-Kate"],
      ["Ada—with Dad", "Ada"],
      ["Ada–with Dad", "Ada"],
      // " with " in any case
      ["Ada WITH Dad", "Ada"],
      // whitespace is tidied, never kept as a name
      ["Ada   Lovelace", "Ada Lovelace"],
      ["   ", undefined],
      [", age 4 — with Mom", undefined],
      ["(5) with Dad", undefined],
      [undefined, undefined],
      [null, undefined],
    ];
    for (const [byline, want] of cases) {
      expect(narratorFromByline(byline), JSON.stringify(byline)).toBe(want);
    }
  });

  test("narratorFromByline keeps at most 40 characters", () => {
    const long = "Bartholomew Maximilian Fitzgerald-Worthington the Third";
    const name = narratorFromByline(long);
    expect(name).toBe(long.slice(0, 40).trimEnd());
    expect(Array.from(name ?? "").length).toBeLessThanOrEqual(40);
    // A cut that lands on a space never leaves a trailing space.
    expect(narratorFromByline(`${"a".repeat(39)} bcd`)).toBe("a".repeat(39));
    // Characters, not UTF-16 units: an emoji is never split in half.
    const emoji = narratorFromByline(`${"x".repeat(39)}🌟🌟`);
    expect(emoji).toBe(`${"x".repeat(39)}🌟`);
  });

  test("resolveNarrator names a person only when a recorded voice is on the tape", () => {
    // No recorded voice: never a name — not from the byline, not left over.
    expect(
      resolveNarrator({ byline: TWINKLE.byline, existing: "Mia", hasRecordedVoice: false }),
    ).toBeUndefined();
    expect(resolveNarrator({ byline: "Grandma Rose", hasRecordedVoice: false })).toBeUndefined();

    // A recorded voice: the byline's lead name wins…
    expect(resolveNarrator({ byline: TWINKLE.byline, hasRecordedVoice: true })).toBe("Mia");
    // …over a narrator the draft already carried (re-publish is not sticky)…
    expect(
      resolveNarrator({ byline: "Grandma Rose", existing: "Mia", hasRecordedVoice: true }),
    ).toBe("Grandma Rose");
    // …and the existing narrator stands when the byline names nobody.
    expect(resolveNarrator({ byline: "", existing: "  Mia ", hasRecordedVoice: true })).toBe("Mia");
    expect(resolveNarrator({ byline: undefined, existing: "Mia", hasRecordedVoice: true })).toBe(
      "Mia",
    );
    expect(resolveNarrator({ byline: "", existing: "   ", hasRecordedVoice: true })).toBeUndefined();
    expect(resolveNarrator({ byline: "", hasRecordedVoice: true })).toBeUndefined();
  });
});

/* ------------------------------------------------------------- the flow */

interface LibraryRow {
  id: string;
  shareCode?: string;
  ssyncData: SsyncManifest;
}

async function readLibrary(page: Page): Promise<LibraryRow[]> {
  return page.evaluate((key) => {
    try {
      return JSON.parse(window.localStorage.getItem(key) || "[]") as LibraryRow[];
    } catch {
      return [] as LibraryRow[];
    }
  }, LIBRARY_KEY);
}

async function openStudio(page: Page): Promise<void> {
  await page.goto("/studio");
  await restoreDraft(page);
  await expect(page.getByRole("button", { name: "Finish my story" })).toBeVisible();
}

/**
 * Finish → the grown-up gate (the a×b answer read from its label, "story by",
 * consent when a voice is on the tape) → "Your tape is ready". Returns the
 * share link the card prints.
 */
async function finishWithStoryBy(
  page: Page,
  storyBy: string,
  { voice }: { voice: boolean },
): Promise<string> {
  await page.getByRole("button", { name: "Finish my story" }).click();

  const question = page.locator('label[for="studio-gate-answer"]');
  await expect(question).toBeVisible({ timeout: 10000 });
  await expect(question).toContainText(/\d+\s*[×x*]\s*\d+/);
  const match = (await question.innerText()).match(/(\d+)\s*[×x*]\s*(\d+)/);
  expect(match, "the gate asks an a×b question").not.toBeNull();
  await page.locator("#studio-gate-answer").fill(String(Number(match![1]) * Number(match![2])));

  await page.locator("#studio-gate-author").fill(storyBy);

  const consent = page.locator("#studio-gate-consent");
  if (voice) await consent.check();
  else await expect(consent).toHaveCount(0);

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your tape is ready" })).toBeVisible({
    timeout: 30000,
  });
  const shareUrl = await page.locator('[data-studio="share-url"]').inputValue();
  expect(shareUrl).toMatch(/\/read\?story=[0-9a-f]{16,}$/);
  return shareUrl;
}

async function onlyTape(page: Page): Promise<SsyncManifest> {
  const library = await readLibrary(page);
  expect(library, "one publish, one tape in the device library").toHaveLength(1);
  return library[0].ssyncData;
}

const COVER_TAPE = '[data-pl="cover"] [data-sk="tape"]';
const COVER_META = `${COVER_TAPE} .sk-tape-meta`;
const DECK = ".pl-deck";
/** The mic — the reels and (T09a) the rows' micro-glyphs are inline SVG too,
 *  so the mic is found by its own hook, never by counting `svg`. */
const DECK_MIC = `${DECK} [data-pl="deck-mic"]`;
/** Every icon on the chip that is neither a reel nor a row's micro-glyph: only the mic may be one. */
const DECK_ICON_SVG = `${DECK} svg:not(.sk-reel-svg):not([data-sk="deck-glyph"])`;

const DECK_VOICE = `${DECK} [data-pl="deck-voice"]`;
const TOP_CHROME = ".pl-chrome--top";

async function tapToBegin(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Tap to Begin/ }).click();
  await expect(page.locator(DECK)).toBeVisible({ timeout: 15000 });
}

/** Clear air between the deck pill and the first top-chrome chip while the chrome is up. */
const CHROME_CLEARANCE_PX = 4;

/**
 * The whole deck pill as drawn — its right edge, not just the voice group's —
 * against the left edge of the first top-chrome button. An opacity-0 group
 * that keeps its layout box still stretches the pill, so only the pill's own
 * box can say whether it runs under the chrome.
 */
async function deckDrawn(page: Page): Promise<{
  deckRight: number;
  chromeLeft: number;
  /** The top chrome is showing (not idled out). */
  chromeUp: boolean;
  /** The pill ends at least CHROME_CLEARANCE_PX before the first chip. */
  clear: boolean;
  voiceOpacity: string;
}> {
  return page.evaluate(
    ({ deckSel, chromeSel, voiceSel, gap }) => {
      const deck = document.querySelector(deckSel);
      const chrome = document.querySelector(chromeSel);
      const button = chrome?.querySelector("button");
      const voice = document.querySelector(voiceSel);
      const deckRight = deck ? Math.round(deck.getBoundingClientRect().right * 10) / 10 : NaN;
      const chromeLeft = button ? Math.round(button.getBoundingClientRect().left * 10) / 10 : NaN;
      return {
        deckRight,
        chromeLeft,
        chromeUp: Boolean(chrome && !chrome.classList.contains("is-hidden")),
        clear: deckRight <= chromeLeft - gap,
        voiceOpacity: voice ? getComputedStyle(voice).opacity : "missing",
      };
    },
    { deckSel: DECK, chromeSel: TOP_CHROME, voiceSel: DECK_VOICE, gap: CHROME_CLEARANCE_PX },
  );
}

test.describe("narrator · publish → the link (e2e)", () => {
  test.setTimeout(90000);

  test("publishing Twinkle with story by 'Mia, age 4 — with Mom' writes narrator 'Mia' into the saved tape and the .storysync", async ({
    page,
  }) => {
    await seedStudioDraft(page, "twinkle");
    await openStudio(page);
    await finishWithStoryBy(page, TWINKLE.byline, { voice: true });

    const tape = await onlyTape(page);
    expect(tape.metadata.narrator).toBe("Mia");
    expect(tape.metadata.author).toBe(TWINKLE.byline);

    /* the downloaded file says the same thing */
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download the .storysync file" }).click();
    const file = await (await download).path();
    const { manifest } = unpackStorysync(new Uint8Array(fs.readFileSync(file)));
    expect(manifest.metadata.narrator).toBe("Mia");
  });

  test("the link's cover says VOICE: Mia, and the playing deck chip carries a mic and the name", async ({
    page,
  }) => {
    await seedStudioDraft(page, "twinkle");
    await openStudio(page);
    const shareUrl = await finishWithStoryBy(page, TWINKLE.byline, { voice: true });

    await page.goto(shareUrl);
    const tape = page.locator(COVER_TAPE);
    await expect(tape).toContainText("Twinkle Came to My Window", { timeout: 15000 });
    await expect(tape).toContainText("VOICE: Mia");
    const meta = page.locator(COVER_META);
    // The runtime figure is not asserted here (M0-PRD Notes).
    await expect(meta).toHaveText(/^SIDE A · 5 PAGES · ~\d+:\d{2} · VOICE: Mia$/);
    expect(await meta.evaluate((el) => getComputedStyle(el).textTransform)).toBe("uppercase");
    await expect(meta).toHaveText(/VOICE: MIA$/, { useInnerText: true });

    await tapToBegin(page);
    const deck = page.locator(DECK);
    // The cover meta states the voice; since T09a the chip is a "Now playing"
    // group too, because its rows carry what nothing else states (the mood,
    // the time to the turn).
    await expect(deck).not.toHaveAttribute("aria-hidden", "true");
    await expect(page.getByRole("group", { name: "Now playing" })).toHaveCount(1);
    await expect(deck).toContainText("Mia");
    await expect(deck.locator(".pl-deck-read")).toHaveText(/^0\d \/ 05$/);
    await expect(page.locator(DECK_MIC)).toHaveCount(1);
    await expect(page.locator(DECK_ICON_SVG)).toHaveCount(1);
    const mic = await page.locator(DECK_MIC).boundingBox();
    expect(mic?.width).toBeCloseTo(12, 0);
    expect(mic?.height).toBeCloseTo(12, 0);

    // reels · counter · hairline · mic · name — in that order.
    const order = await deck.evaluate((el) => {
      const counter = el.querySelector(".pl-deck-read");
      const rule = el.querySelector('[data-pl="deck-rule"]');
      const micEl = el.querySelector('[data-pl="deck-mic"]');
      const name = el.querySelector('[data-pl="deck-narrator"]');
      if (!counter || !rule || !micEl || !name) return null;
      const follows = (a: Element, b: Element) =>
        Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return {
        ruleAfterCounter: follows(counter, rule),
        micAfterRule: follows(rule, micEl),
        name: name.textContent,
        ruleWidth: rule.getBoundingClientRect().width,
      };
    });
    expect(order).toEqual({ ruleAfterCounter: true, micAfterRule: true, name: "Mia", ruleWidth: 1 });

    // Once the controls idle out, the room says whose voice it is — on every screen.
    await expect(page.locator(TOP_CHROME)).toHaveClass(/is-hidden/, { timeout: 10000 });
    await expect.poll(async () => (await deckDrawn(page)).voiceOpacity).toBe("1");
    await expect(page.locator('[data-pl="deck-narrator"]')).toBeVisible();
  });

  test("a draft with no recorded voice publishes no narrator, even with story by filled in", async ({
    page,
  }) => {
    await seedStudioDraft(page, "twinkle", { narration: false });
    // A narrator left in the draft from earlier must not survive a voiceless publish.
    await page.addInitScript(
      ({ key, marker }) => {
        try {
          if (window.sessionStorage.getItem(marker)) return;
          const raw = window.localStorage.getItem(key);
          if (!raw) return;
          const envelope = JSON.parse(raw) as { state: { manifest: { metadata: Record<string, unknown> } } };
          envelope.state.manifest.metadata.narrator = "Mia";
          window.localStorage.setItem(key, JSON.stringify(envelope));
          window.sessionStorage.setItem(marker, "1");
        } catch {
          /* opaque origins have no storage */
        }
      },
      { key: DRAFT_KEY, marker: "t03-stale-narrator" },
    );
    await openStudio(page);
    const shareUrl = await finishWithStoryBy(page, TWINKLE.byline, { voice: false });

    const tape = await onlyTape(page);
    expect(tape.pages.some((p) => p.text?.audioUrl)).toBe(false);
    expect(Object.keys(tape.metadata)).not.toContain("narrator");

    await page.goto(shareUrl);
    const cover = page.locator(COVER_TAPE);
    await expect(cover).toContainText("Twinkle Came to My Window", { timeout: 15000 });
    await expect(cover).not.toContainText("VOICE:");
    await tapToBegin(page);
    await expect(page.locator(DECK_MIC)).toHaveCount(0);
    await expect(page.locator(DECK)).not.toContainText("Mia");
  });

  test("re-publishing with story by 'Grandma Rose' writes 'Grandma Rose' — the old narrator is not sticky", async ({
    page,
  }) => {
    await seedStudioDraft(page, "twinkle");
    await openStudio(page);
    await finishWithStoryBy(page, TWINKLE.byline, { voice: true });
    expect((await onlyTape(page)).metadata.narrator).toBe("Mia");

    await page.getByRole("button", { name: "Back to the studio" }).click();
    const shareUrl = await finishWithStoryBy(page, "Grandma Rose", { voice: true });
    const tape = await onlyTape(page);
    expect(tape.metadata.narrator).toBe("Grandma Rose");

    await page.goto(shareUrl);
    await expect(page.locator(COVER_META)).toHaveText(/VOICE: Grandma Rose$/, { timeout: 15000 });
  });
});

test.describe("narrator · the deck chip under the top chrome (e2e)", () => {
  // Small phones: 320×568 is a critic-player gate viewport; 375×812 is the
  // phone where the pill's border used to touch the Music chip.
  const viewports = [
    { width: 320, height: 568 },
    { width: 375, height: 812 },
  ];
  for (const viewport of viewports) {
    for (const reduced of [true, false]) {
      const motion = reduced ? "reduced motion" : "full motion";
      test(`${viewport.width}×${viewport.height}, ${motion}: the deck pill never runs under the top chrome, and the name returns when it idles`, async ({
        page,
      }) => {
        test.setTimeout(45000);
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
        const shareCode = randomBytes(16).toString("hex");
        await seedDeviceLibrary(page, "twinkle", { shareCode });
        await page.goto(`/read?story=${shareCode}`);
        await expect(page.locator(COVER_META)).toHaveText(/VOICE: Mia$/, { timeout: 15000 });
        await tapToBegin(page);

        const voice = page.locator(DECK_VOICE);
        await expect(voice).toHaveCount(1);
        const transition = await voice.evaluate((el) => getComputedStyle(el).transitionProperty);
        if (reduced) expect(transition, "reduced motion: no fade, no slide").toBe("none");
        else expect(transition, "full motion: the group eases").not.toBe("none");

        /** Under reduced motion the class flip is the whole change: measure once. */
        const expectDeck = async (want: (d: Awaited<ReturnType<typeof deckDrawn>>) => boolean) => {
          if (reduced) {
            const d = await deckDrawn(page);
            expect(want(d), JSON.stringify(d)).toBe(true);
          } else {
            await expect
              .poll(async () => {
                const d = await deckDrawn(page);
                return want(d) ? "ok" : JSON.stringify(d);
              })
              .toBe("ok");
          }
        };

        // Controls up (right after Tap to Begin): the pill keeps clear of the chips.
        await expect(page.locator(TOP_CHROME)).not.toHaveClass(/is-hidden/);
        await expectDeck((d) => d.chromeUp && d.clear);
        const upRight = (await deckDrawn(page)).deckRight;

        // Controls idle out: the name is there, in full view, and the pill grew to hold it.
        await expect(page.locator(TOP_CHROME)).toHaveClass(/is-hidden/, { timeout: 10000 });
        await expectDeck((d) => !d.chromeUp && d.voiceOpacity === "1" && d.deckRight > upRight + 20);
        await expect(page.locator('[data-pl="deck-narrator"]')).toBeVisible();
        await expect(page.locator('[data-pl="deck-narrator"]')).toHaveText("Mia");

        // The controls come back (a pointer move): the pill shrinks out of their way again.
        await page.mouse.move(viewport.width / 2, viewport.height - 40);
        await page.mouse.move(viewport.width / 2 - 30, viewport.height - 60);
        await expect(page.locator(TOP_CHROME)).not.toHaveClass(/is-hidden/);
        await expectDeck((d) => d.chromeUp && d.clear);
      });
    }
  }
});

test.describe("narrator · the house tape names nobody (e2e)", () => {
  test("/read?demo=1: no VOICE on the cover, no mic and no name in the deck chip", async ({ page }) => {
    await page.goto("/read?demo=1");
    const cover = page.locator(COVER_TAPE);
    await expect(cover).toBeVisible({ timeout: 15000 });
    await expect(cover).not.toContainText("VOICE:");

    await tapToBegin(page);
    const deck = page.locator(DECK);
    await expect(page.locator(DECK_MIC)).toHaveCount(0);
    await expect(page.locator(DECK_ICON_SVG)).toHaveCount(0);
    await expect(deck.locator('[data-pl="deck-rule"]')).toHaveCount(0);
    // The page counter and no name: no narrator group at all (since T09a the
    // chip also carries the three sound rows, so its whole text is no longer
    // just the counter).
    await expect(deck.locator(".pl-deck-read")).toHaveText(/^\s*01\s*\/\s*08\s*$/);
    await expect(deck.locator('[data-pl="deck-voice"]')).toHaveCount(0);
    await expect(deck.locator('[data-pl="deck-narrator"]')).toHaveCount(0);
  });
});
