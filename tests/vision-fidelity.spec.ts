/**
 * T25 · The fidelity sweep (HANDOFF §9 M6, §11.3).
 *
 * Drives every reference surface into its reference STATE with the fixtures
 * and saves one screenshot per state at the reference viewport, named
 * `s0X-<surface>-<WxH>[-variant].png`. Where the shots go is set by
 * VISION_EVIDENCE (tests/fixtures/evidence.ts): `1` for docs/vision/evidence/,
 * a folder for anywhere else, unset for the test's own output folder, so an
 * ordinary run never touches a tracked file.
 *
 * Each test first proves the state was reached (its key elements visible, no
 * sideways page scroll, no console error and no page error) and only then
 * shoots, so a broken surface fails instead of leaving a misleading picture.
 *
 *   s01  /           landing hero, 1080×675 · 390×844 · 1080×675 reduced motion
 *   s02  /read       house tape page 2, mid-sentence, deck chip up · 1120×700 · 375×812
 *   s03  /studio     Simple mode, Twinkle page 3, Voice open; a take listening · 1180×820 · 375×812
 *   s04  gate        the grown-up moment and the seven-layer sheet; the stamp inked · 1180×820
 *   s05  publish     the printed tape card · 1180×820 · 375×812; the link's cover on a phone · 390×844
 *   s06  end card    the J-card liner notes · 390×844; the reply Creator and READ THIS · 390×844
 *   s07  /read       the shelf: Grandma's tape NEW and sent, Twinkle lifted with "You stopped at
 *                    page 3."; "Read it in…" for the house tape, Hush, the browser voice reading now · 1140×712
 *   s08  /protocol   hero, FIG. 1 and the three cards · 1140×712 · 375×812
 *   s09  /studio     Advanced, house tape page 3 in its own Hush; TYPE A FEELING "a quiet lullaby for
 *                    bedtime" → Hush · 1290×900
 *   s10  /read?story the link opens with no account · 390×844
 *
 * Every N item of s07 (T20a/b, T21, T22a/b) and s09 (T24a/b) is reached
 * through the app itself, never faked. Idea and Phase 3 items (search, genre
 * pills, the catalog, Premium, made voices, the desktop window, Cast, the
 * timeline, the SFX lane) are not built, and the tests say so.
 *
 * The family content (Mia, Twinkle, Grandma Rose) is illustrative and lives in
 * tests/fixtures only.
 */

import { test, expect, type Locator, type Page } from "@playwright/test";
import { evidenceShot } from "./fixtures/evidence";
import { watchSends } from "./fixtures/sends";
import { restoreDraft, seedDeviceLibrary, seedStudioDraft, LIBRARY_KEY } from "./fixtures/helpers";
import { stubMicrophone } from "./fixtures/mic";
import { pictureLessTape, resumeAt, seedShelf, sentRow, shelfRow } from "./fixtures/shelf-seed";
import { FIXTURE_PATHS, GOODNIGHT_MIA, TWINKLE, loadTape } from "./fixtures/tapes";
import { runtimeLabel } from "../src/lib/storysync/tape-meta";

/* ------------------------------------------------------------------ facts */

type Size = { width: number; height: number };
const LAPTOP_S01: Size = { width: 1080, height: 675 };
const LAPTOP_S02: Size = { width: 1120, height: 700 };
const TABLET: Size = { width: 1180, height: 820 };
const LAPTOP_SHELF: Size = { width: 1140, height: 712 };
const WINDOW_S09: Size = { width: 1290, height: 900 };
const IPHONE: Size = { width: 390, height: 844 };
const PHONE_375: Size = { width: 375, height: 812 };

const tag = (s: Size) => `${s.width}x${s.height}`;

/** House tape page 2 (public/demo/brave-little-star.ssync.json), as s02 prints it. */
const HOUSE_PAGE_2 =
  "Every night, she watched the world below. She saw children sleeping, parents reading stories, and cats prowling on rooftops.";
/** s02 lights "cats": every word before it said, the rest still to come. */
const NOW_WORD = "cats";

/** 6:09:58 pm on Oct 19: the grown-up says yes 7:48 after the Studio opened (s04, s05). */
const GATE_MOMENT = new Date("2026-10-19T18:09:58");

/** s07: Tuesday's breakfast; Grandma's reply arrived the evening before. */
const SHELF_NOW = "2026-10-21T07:30:00.000Z";
const SHELF_PREVIOUS_VISIT = "2026-10-20T07:00:00.000Z";
const GRANDMA_ADDED = "2026-10-20T19:31:00.000Z";
const GRANDMA_CODE = "60d01a6060d01a6060d01a6060d01a60";
const TWINKLE_CODE = "7b20a7b20a7b20a7b20a7b20a7b20a71";
const BATH_CODE = "7b20b7b20b7b20b7b20b7b20b7b20b71";
/** s07: Twinkle was left at page 3 last night (T21's place, this device only). */
const TWINKLE_STOPPED = "2026-10-20T19:12:00.000Z";
/**
 * The unlisted code a seeded Twinkle link resolves (s06, s10): fixed, so the
 * end card's QR and link print the same in every run. Shaped like a minted
 * code (32 lowercase hex); each test has its own browser context.
 */
const LINK_CODE = "f1de11f1de11f1de11f1de11f1de11f1";

/* ---------------------------------------------------------------- guards */

/** Console errors and uncaught page errors seen since the page opened. */
function watchErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return () => [...errors];
}

/** The page never scrolls sideways at this viewport. */
async function expectNoSideScroll(page: Page, where: string): Promise<void> {
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    vw: window.innerWidth,
  }));
  expect(overflow.doc, `${where}: no horizontal page scroll`).toBeLessThanOrEqual(overflow.vw);
  expect(overflow.body, `${where}: no horizontal body scroll`).toBeLessThanOrEqual(overflow.vw);
}

/** The state is real: no sideways scroll, no console or page error. */
async function expectClean(page: Page, errors: () => string[], where: string): Promise<void> {
  await expectNoSideScroll(page, where);
  expect(errors(), `${where}: console and page errors`).toEqual([]);
}

/** Viewport and media for one state. The app is dark-only; the media say so explicitly. */
async function prepare(page: Page, size: Size, reducedMotion = false): Promise<void> {
  await page.setViewportSize(size);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: reducedMotion ? "reduce" : "no-preference" });
}

/** Fonts in, finite animations landed: boxes and text measured at rest. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const finite = document
      .getAnimations()
      .filter((a) => Number.isFinite(a.effect?.getComputedTiming().iterations ?? Infinity));
    await Promise.race([
      Promise.all(finite.map((a) => a.finished.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

/** The element's box lies inside the viewport. */
async function expectInView(page: Page, locator: Locator, name: string): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, `${name} is rendered`).not.toBeNull();
  const vp = page.viewportSize()!;
  expect(box!.x, `${name} inside the viewport (left)`).toBeGreaterThanOrEqual(-0.5);
  expect(box!.y, `${name} inside the viewport (top)`).toBeGreaterThanOrEqual(-0.5);
  expect(box!.x + box!.width, `${name} inside the viewport (right)`).toBeLessThanOrEqual(vp.width + 0.5);
  expect(box!.y + box!.height, `${name} inside the viewport (bottom)`).toBeLessThanOrEqual(vp.height + 0.5);
}

/* ------------------------------------------------------------- reader */

/** A browser voice that speaks on demand: `__boundary(i)` lights a word, `__endUtterance()` ends the line. */
async function stubSpeech(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__utt = null;
    class FakeUtterance {
      text: string;
      rate = 1;
      pitch = 1;
      onboundary: ((e: { name: string; charIndex: number }) => void) | null = null;
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
          w.__utt = u;
          u.onstart?.();
        },
        cancel() {},
        getVoices() {
          return [];
        },
      },
    });
    w.__boundary = (charIndex: number) => {
      const u = w.__utt as FakeUtterance | null;
      u?.onboundary?.({ name: "word", charIndex });
    };
  });
}

/** Pass the cover gate. */
async function tapToBegin(page: Page): Promise<void> {
  const root = page.locator(".pl-root");
  await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
  await page.getByRole("button", { name: /Tap to Begin/ }).click();
  await expect(root).toHaveAttribute("data-view", "page", { timeout: 10000 });
}

/** A listener's hand moves: the chrome wakes (it idles out after ~4 s). */
async function wake(page: Page): Promise<void> {
  const vp = page.viewportSize()!;
  await page.mouse.move(vp.width / 2, vp.height / 2);
  await page.mouse.move(vp.width / 2 + 7, vp.height / 2 + 5);
  await expect(page.locator(".pl-chrome--top")).not.toHaveClass(/is-hidden/);
}

/** The house tape on page 2, its voice mid-sentence on "cats", the chrome up. */
async function houseTapePage2(page: Page): Promise<void> {
  await stubSpeech(page);
  await page.goto("/read?demo=1");
  await tapToBegin(page);
  const root = page.locator(".pl-root");
  await page.keyboard.press("ArrowRight");
  await expect(root).toHaveAttribute("data-page", "2");
  await expect(page.locator(".pl-page")).not.toHaveClass(/is-(out|in)\b/, { timeout: 5000 });
  await page.waitForFunction(
    (t) => ((window as unknown as { __utt: { text: string } | null }).__utt?.text ?? "").includes(t),
    "Every night",
    { timeout: 10000 },
  );
  await expect(root).toHaveAttribute("data-music", "on", { timeout: 10000 });
  const words = [...HOUSE_PAGE_2.matchAll(/\S+/g)];
  const at = words.findIndex((m) => m[0] === NOW_WORD);
  await page.evaluate(
    (i) => (window as unknown as { __boundary: (n: number) => void }).__boundary(i),
    words[at].index ?? 0,
  );
  await expect(page.locator('[data-pl="word"].is-now')).toHaveText(NOW_WORD);
  await expect(page.locator('[data-pl="word"].is-past')).toHaveCount(at);
  await page.waitForFunction(() => {
    const img = document.querySelector<HTMLImageElement>(".pl-page .pl-picture img, [data-pl='art'] img");
    return !img || (img.complete && img.naturalWidth > 0);
  }, null, { timeout: 20000 });
  await wake(page);
}

/** Walk a tape opened from its link to the end card; the card's rise has landed. */
async function walkToEnd(page: Page): Promise<Locator> {
  await tapToBegin(page);
  const root = page.locator(".pl-root");
  for (let i = 0; i < 12; i++) {
    if ((await root.getAttribute("data-view")) === "end") break;
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(320);
  }
  await expect(root).toHaveAttribute("data-view", "end");
  const end = page.locator('[data-pl="end"]');
  await expect(end).toBeVisible();
  await settle(page);
  return end;
}

/* ------------------------------------------------------------- studio */

const rail = (page: Page) => page.locator('nav[aria-label="Story tools"]');
const recButton = (page: Page) => page.locator('[data-sk="transport"][data-kind="rec"]');

async function photoReady(page: Page): Promise<void> {
  const photo = page.locator('[data-studio="stage-photo"]');
  await expect(photo).toBeVisible();
  await expect
    .poll(() => photo.evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))
    .toBe(true);
}

/** Turn to page `n` with the Transport's next key, as a hand would (from page 1). */
async function goToPage(page: Page, n: number): Promise<void> {
  const transport = page.locator('section[aria-label="Transport"]');
  for (let k = 2; k <= n; k++) {
    await page.locator('[data-sk="transport"][data-kind="next"]').click();
    await expect(transport).toContainText(`pg ${k}/`);
  }
  await expect(page.getByRole("button", { name: new RegExp(`^Page ${n}\\b.*selected`) })).toHaveCount(1);
  await page.mouse.move(1, 1);
}

/** Twinkle restored from this device's draft, page 3 on the Stage. */
async function openTwinkleStudio(page: Page): Promise<void> {
  await stubMicrophone(page);
  await seedStudioDraft(page, "twinkle");
  await page.goto("/studio");
  await restoreDraft(page);
  await goToPage(page, 3);
  await photoReady(page);
}

/** Seed Twinkle, open the Studio, Finish my story: the gate is up, its question answered. */
async function openGate(page: Page): Promise<Locator> {
  await page.clock.setFixedTime(GATE_MOMENT);
  await seedStudioDraft(page, "twinkle");
  await page.goto("/studio");
  await restoreDraft(page);
  await page.getByRole("button", { name: "Finish my story" }).click();
  const dialog = page.getByRole("dialog", { name: "A grown-up moment" });
  await expect(dialog).toBeVisible({ timeout: 15000 });
  const question = page.locator('label[for="studio-gate-answer"]');
  await expect(question).toContainText(/\d+\s*×\s*\d+/);
  const [, a, b] = (await question.innerText()).match(/(\d+)\s*×\s*(\d+)/)!;
  await page.locator("#studio-gate-answer").fill(String(Number(a) * Number(b)));
  await page.locator("#studio-gate-author").fill(TWINKLE.byline);
  return dialog;
}

/** Through the gate as Mom, consent ticked: the printed tape card. Returns the share code. */
async function publishTwinkle(page: Page): Promise<string> {
  await openGate(page);
  await page.locator("#studio-gate-consent").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your tape is ready" })).toBeVisible({ timeout: 30000 });
  await settle(page);
  const rows = await page.evaluate(
    (key) => JSON.parse(window.localStorage.getItem(key) || "[]") as Array<{ shareCode?: string }>,
    LIBRARY_KEY,
  );
  expect(rows, "one publish, one tape").toHaveLength(1);
  expect(rows[0].shareCode).toMatch(/^[0-9a-f]{32}$/);
  return rows[0].shareCode!;
}

/* ====================================================================== */

test.describe("T25 · vision fidelity sweep", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "fidelity shots set their own viewports; one project is enough");
  });

  /* ---------------------------------------------------------- s01 landing */

  test("s01 · landing: the tape poised in the deck, the one light behind the play key", async ({ page }) => {
    test.setTimeout(90000);
    const errors = watchErrors(page);
    for (const [size, reduced] of [
      [LAPTOP_S01, false],
      [IPHONE, false],
      [LAPTOP_S01, true],
    ] as const) {
      await prepare(page, size, reduced);
      await page.goto("/");
      const where = `s01 ${tag(size)}${reduced ? " reduced" : ""}`;
      const cassette = page.locator('[data-ls="tape-slide"] [data-sk="cassette"]');
      await expect(cassette).toHaveCount(1);
      await expect(cassette.locator(".sk-tape-title")).toHaveText("The Brave Little Star");
      await expect(cassette.locator(".sk-tape-meta")).toHaveText("SIDE A · PRESS PLAY");
      await expect(page.locator('[data-ls="hero-kicker"]')).toHaveText(/THE LIBRARY CASSETTE · REBUILT FOR THE WEB/i);
      await expect(page.locator(".ls-hero-line")).toHaveText("Press play on the stories you make together.");
      await settle(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expectInView(page, page.locator(".ls-hero-line"), `${where}: headline`);
      await expectInView(page, page.locator('[data-ls="press-play"]'), `${where}: Press play`);
      await expectInView(page, page.locator('[data-ls="play-key"]'), `${where}: the deck's play key`);
      if (reduced) {
        // the tape is simply already in: nothing spins
        const spinning = await page.evaluate(
          () => document.getAnimations().filter((a) => a.playState === "running").length,
        );
        expect(spinning, `${where}: nothing runs under reduced motion`).toBe(0);
      }
      await expectClean(page, errors, where);
      await evidenceShot(page, `s01-landing-${tag(size)}${reduced ? "-reduced" : ""}.png`);
    }
  });

  /* ----------------------------------------------------------- s02 reader */

  for (const size of [LAPTOP_S02, PHONE_375]) {
    test(`s02 · reader ${tag(size)}: house tape page 2, "${NOW_WORD}" lit, the deck chip's three sounds`, async ({
      page,
    }) => {
      test.setTimeout(90000);
      const errors = watchErrors(page);
      await prepare(page, size);
      await houseTapePage2(page);
      const where = `s02 ${tag(size)}`;

      const chip = page.getByRole("group", { name: "Now playing" });
      await expect(chip).toBeVisible();
      await expect(chip.locator(".pl-deck-read")).toHaveText("02 / 08");
      if (size === LAPTOP_S02) {
        // the expanded chip and the open-book spread (≥ 1024 px, landscape)
        for (const row of ["voice", "melody", "chime"]) {
          await expect(chip.locator(`[data-sk="deck-row"][data-row="${row}"]`)).toBeVisible();
        }
        await expect(chip.locator('[data-row="voice"]')).toHaveText("VOICE · Storyteller (browser voice)", {
          useInnerText: true,
        });
        await expect(chip.locator('[data-row="melody"]')).toHaveText("MELODY · Wonder, 12 dB under the voice", {
          useInnerText: true,
        });
        await expect(page.locator('[data-pl="spread"]')).toBeVisible();
        await expect(page.locator('[data-pl="art"] img')).toBeVisible();
        await expectInView(page, page.locator('[data-pl="text"]'), `${where}: the right page`);
      }
      await expect(page.locator('[data-pl="word"].is-now')).toBeVisible();
      await expectInView(page, chip, `${where}: deck chip`);
      await expectClean(page, errors, where);
      await wake(page);
      await evidenceShot(page, `s02-reader-${tag(size)}.png`);
    });
  }

  /* ----------------------------------------------------------- s03 studio */

  test("s03 · studio 1180x820: Simple mode, Twinkle page 3, Voice open; then a take listening", async ({ page }) => {
    test.setTimeout(90000);
    const errors = watchErrors(page);
    await prepare(page, TABLET);
    await openTwinkleStudio(page);
    const where = "s03 1180x820";

    const mode = page.locator('[data-sk="mode"] [role="switch"]');
    await expect(mode).toHaveAttribute("aria-checked", "false");
    await rail(page).getByRole("button", { name: "Voice", exact: true }).click();
    await expect(rail(page).getByRole("button", { name: "Voice", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-studio="tool-card"]')).toBeVisible();
    await expect(page.locator("#studio-page-text")).toHaveValue(TWINKLE.pages[2].text);
    await expect(page.locator('[data-studio="stage-status-music"]')).toHaveText("Wonder · music on");
    await expect(page.locator('[data-studio="title"]')).toBeVisible();
    await settle(page);
    for (const part of ['[data-studio="stage-photo"]', 'section[aria-label="Pages"]', 'section[aria-label="Transport"]']) {
      await expectInView(page, page.locator(part), `${where}: ${part}`);
    }
    await expectClean(page, errors, where);
    await evidenceShot(page, "s03-studio-1180x820.png");

    // mid-take at 0:05: the tape-red listening ring, the pill, the recording chip
    await recButton(page).click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);
    await expect(page.locator('[data-sk="listening-ring"]')).toHaveAttribute("data-active", "true");
    await expect(page.locator('[data-studio="stage-rec-chip"]')).toHaveText("recording");
    await expect(page.getByRole("button", { name: "Finish my story" })).toBeDisabled();
    await expect(page.locator('[data-studio="listening-pill"]')).toHaveText("Listening… 0:05", { timeout: 10000 });
    await expectClean(page, errors, `${where} recording`);
    await evidenceShot(page, "s03-studio-1180x820-recording.png");
    await page.getByRole("button", { name: /^Stop —/ }).click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(0, { timeout: 10000 });
    expect(errors(), `${where}: after the take`).toEqual([]);
  });

  test("s03 · studio 375x812: the phone column, Twinkle page 3", async ({ page }) => {
    test.setTimeout(60000);
    const errors = watchErrors(page);
    await prepare(page, PHONE_375);
    await openTwinkleStudio(page);
    await expect(page.locator("#studio-page-text")).toHaveValue(TWINKLE.pages[2].text);
    await expect(page.getByRole("button", { name: "Finish my story" })).toBeVisible();
    await settle(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectInView(page, page.locator('[data-studio="stage-photo"]'), "s03 375x812: the photo");
    await expectClean(page, errors, "s03 375x812");
    await evidenceShot(page, "s03-studio-375x812.png");
  });

  /* -------------------------------------------------------------- s04 gate */

  test("s04 · gate 1180x820: the grown-up moment beside the seven-layer sheet; the stamp inked", async ({ page }) => {
    test.setTimeout(90000);
    const errors = watchErrors(page);
    await prepare(page, TABLET);
    const dialog = await openGate(page);
    const where = "s04 1180x820";

    await expect(dialog.getByRole("heading", { name: "A grown-up moment" })).toBeVisible();
    const sheet = page.getByRole("region", { name: "What goes into your tape" });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('[data-sk="packet-band"]')).toHaveCount(7);
    await expect(sheet.locator('[data-sk="packet-band"][data-layer="Metadata"] [data-band="value"]')).toContainText(
      `${TWINKLE.title} · by ${TWINKLE.byline}`,
    );
    await expect(dialog.getByRole("checkbox", { name: /I am this child's parent or guardian/ })).not.toBeChecked();
    await expect(page.locator('[data-sk="consent-stamp"]')).toHaveAttribute("data-inked", "false");
    await settle(page);
    await expectInView(page, dialog.getByRole("button", { name: "Continue" }), `${where}: Continue`);
    await expectClean(page, errors, where);
    await evidenceShot(page, "s04-gate-1180x820.png");

    // the consent box ticked: the stamp inks onto the Signature band
    await page.locator("#studio-gate-consent").check();
    const stamp = page.locator('[data-sk="consent-stamp"]');
    await expect(stamp).toHaveAttribute("data-inked", "true");
    expect((await stamp.locator("[data-line]").allInnerTexts()).map((t) => t.trim())).toEqual([
      "VOICE CONSENT · GRANTED",
      "PARENT/GUARDIAN · OCT 19 2026",
    ]);
    await expect(dialog.getByText("Your child's voice never goes anywhere without you.")).toBeVisible();
    await settle(page);
    await expectClean(page, errors, `${where} stamped`);
    await evidenceShot(page, "s04-gate-1180x820-stamped.png");
  });

  /* ----------------------------------------------------------- s05 publish */

  for (const size of [TABLET, PHONE_375]) {
    test(`s05 · publish ${tag(size)}: the printed tape, MADE IN 7:48, the private link`, async ({ page }) => {
      test.setTimeout(120000);
      const errors = watchErrors(page);
      await prepare(page, size);
      // the tablet has the Web Share sheet behind "Share the link…" (s05); headless Chromium has none
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "share", { configurable: true, value: async () => undefined });
      });
      const code = await publishTwinkle(page);
      const where = `s05 publish ${tag(size)}`;

      const card = page.locator('[data-studio="publish-card"]');
      await expect(card).toBeVisible();
      await expect(page.locator('[data-sk="print-slot"]')).toBeVisible();
      await expect(page.locator('[data-studio="publish-overlay"] [data-sk="tape"]').first()).toContainText(TWINKLE.title);
      await expect(page.locator('[data-studio="label-inset"]')).toBeVisible();
      await expect(page.locator('[data-sk="layer-chips"]')).toContainText("consent written");
      await expect(page.locator('[data-studio="made-in"]')).toHaveText("Made in 7:48");
      await expect(page.locator('[data-sk="size-meter"]')).toContainText(/MB OF 15 MB/i);
      await expect(page.locator('[data-studio="share-url"]')).toHaveValue(new RegExp(`/read\\?story=${code}$`));
      await expect(page.locator('[data-studio="share-qr"]')).toBeVisible();
      await expect(page.getByRole("button", { name: "Share the link…" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Pull the tape out — delete everything", exact: true })).toBeVisible();
      if (size === TABLET) {
        await expectInView(page, page.locator('[data-studio="publish-left"]'), `${where}: left column`);
        await expectInView(page, page.locator('[data-studio="publish-right"]'), `${where}: right column`);
      }
      await expectClean(page, errors, where);
      await evidenceShot(page, `s05-publish-${tag(size)}.png`);
    });
  }

  test("s05 · reader 390x844: the published Twinkle link opens on its cover, VOICE: MIA; then page 3", async ({
    page,
  }) => {
    test.setTimeout(150000);
    const errors = watchErrors(page);
    await prepare(page, TABLET);
    const code = await publishTwinkle(page);

    await prepare(page, IPHONE);
    await page.goto(`/read?story=${code}`);
    const where = "s05 reader 390x844";
    const cover = page.locator('[data-pl="cover"] [data-sk="tape"]');
    await expect(cover).toContainText(TWINKLE.title, { timeout: 20000 });
    await expect(cover.locator(".sk-tape-meta")).toHaveText(/^SIDE A · 5 PAGES · ~\d+:\d{2} · VOICE: Mia$/);
    await expect(page.getByRole("button", { name: /Tap to Begin/ })).toBeVisible();
    await settle(page);
    await expectInView(page, page.getByRole("button", { name: /Tap to Begin/ }), `${where}: Tap to Begin`);
    await expectClean(page, errors, where);
    await evidenceShot(page, "s05-reader-390x844.png");

    // 6:15 pm: Grandma is on page 3 at Largest, Mia's voice on "window.", the
    // chrome idled out — nothing on top but the pill with the mic and "Mia"
    await tapToBegin(page);
    await page.getByRole("button", { name: "Reading options" }).click();
    const sheet = page.getByRole("dialog", { name: "Reading options" });
    await sheet.getByRole("radiogroup", { name: "Text size" }).getByRole("radio", { name: "Largest" }).click();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    const root = page.locator(".pl-root");
    await expect(root).toHaveAttribute("data-page", "3");
    await expect(page.locator(".pl-page")).not.toHaveClass(/is-(out|in)\b/, { timeout: 5000 });
    const chip = page.getByRole("group", { name: "Now playing" });
    await expect(chip.locator(".pl-deck-read")).toHaveText("03 / 05");
    await expect(page.locator(".pl-page")).toContainText("I was scared of the dark.");
    await page.mouse.move(1, 1);
    await expect(page.locator(".pl-chrome--top")).toHaveClass(/is-hidden/, { timeout: 15000 });
    await expect(page.locator(".pl-word.is-now")).toHaveText(/window/, { timeout: 20000 });
    await expect(chip).toContainText("Mia");
    await expect(chip.locator('[data-pl="deck-mic"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const fontPx = await page
      .locator('[data-pl="prose"]')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontPx, `${where}: Largest text`).toBeGreaterThanOrEqual(26);
    await expectClean(page, errors, `${where} page 3`);
    await evidenceShot(page, "s05-reader-390x844-page3.png");
    await expect(root).toHaveAttribute("data-page", "3");
  });

  /* ----------------------------------------------------------- s06 end card */

  test("s06 · end card 390x844: the tape label and the J-card liner notes", async ({ page }) => {
    test.setTimeout(90000);
    const errors = watchErrors(page);
    await prepare(page, IPHONE);
    const shareCode = LINK_CODE;
    await seedDeviceLibrary(page, "twinkle", { shareCode });
    await page.goto(`/read?story=${shareCode}`);
    const end = await walkToEnd(page);
    const where = "s06 end card 390x844";

    const jcard = end.getByRole("group", { name: "Liner notes" });
    await expect(jcard).toBeVisible();
    expect(await jcard.locator("dt").allInnerTexts()).toEqual(["PICTURES", "WORDS", "VOICE", "MUSIC", "OWNER", "CONSENT"]);
    await expect(jcard.locator('[data-row="CONSENT"] dd')).toHaveText(
      "given by a parent or guardian · Oct 19, 2026 · written into this tape",
    );
    await expect(end.getByRole("link", { name: /^What’s inside this tape\?$/ })).toBeVisible();
    await expect(end.getByRole("button", { name: "Send a thank-you back" })).toBeVisible();
    await expect(end.getByRole("button", { name: "Read it again" })).toBeVisible();
    await expect(end.getByRole("button", { name: "Make your own story" })).toBeVisible();
    await expect(end.getByText("Nobody is counting plays. This page has no trackers.")).toBeVisible();
    await expectInView(page, jcard, `${where}: the J-card`);
    await expectClean(page, errors, where);
    await evidenceShot(page, "s06-endcard-390x844.png");
  });

  test("s06 · reply 390x844: the Creator opened as a one-page reply; READ THIS while it listens", async ({ page }) => {
    test.setTimeout(120000);
    const errors = watchErrors(page);
    await prepare(page, IPHONE);
    await stubMicrophone(page);
    const shareCode = LINK_CODE;
    await seedDeviceLibrary(page, "twinkle", { shareCode });
    await page.goto(`/read?story=${shareCode}`);
    const end = await walkToEnd(page);
    await end.getByRole("button", { name: "Send a thank-you back" }).click();
    const where = "s06 reply 390x844";

    const chip = page.locator('[data-studio="reply-to"]');
    await expect(chip).toBeVisible({ timeout: 30000 });
    await expect(chip).toHaveText(`Reply to · ${TWINKLE.title}`);
    await expect(page.locator("[data-page-index]")).toHaveCount(1);
    await expect(page.locator("#studio-title")).toHaveValue("Thank you, Mia");

    // Grandma's window photo and her words, as she would add them
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles(FIXTURE_PATHS["goodnight-mia"].pictures[0]);
    await expect(page.locator("[data-page-index] img")).toHaveCount(1, { timeout: 15000 });
    await page.locator("#studio-page-text").fill(GOODNIGHT_MIA.pages[0].text);
    await page.locator("#studio-page-text").blur();
    await photoReady(page);
    await settle(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectInView(page, chip, `${where}: the Reply to chip`);
    await expectClean(page, errors, where);
    await evidenceShot(page, "s06-reply-390x844.png");

    // mid-take: READ THIS shows her words in large type
    await recButton(page).click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);
    const card = page.locator('[data-studio="read-this"]');
    await expect(card).toBeVisible();
    await expect(card.locator('[data-studio="read-this-label"]')).toHaveText("READ THIS");
    await expect(card.locator('[data-studio="read-this-words"]')).toHaveText(GOODNIGHT_MIA.pages[0].text);
    await expect(page.getByRole("button", { name: "Stop — 0:05" })).toBeVisible({ timeout: 10000 });
    await expectInView(page, card, `${where}: READ THIS`);
    await expectClean(page, errors, `${where} recording`);
    await evidenceShot(page, "s06-reply-390x844-readthis.png");
    await page.getByRole("button", { name: /^Stop —/ }).click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(0, { timeout: 10000 });
  });

  /* ------------------------------------------------------------- s07 shelf */

  test("s07 · shelf 1140x712: Grandma's tape sent and NEW, Twinkle lifted where it stopped, Read it in… the house tape in Hush", async ({
    page,
  }) => {
    test.setTimeout(90000);
    const errors = watchErrors(page);
    await page.clock.setFixedTime(SHELF_NOW);
    const goodnight = loadTape("goodnight-mia").story;
    await seedShelf(page, {
      library: [
        shelfRow(loadTape("twinkle").story, TWINKLE_CODE, "2026-10-19T18:10:00.000Z"),
        shelfRow(pictureLessTape("Bath Time Song", ""), BATH_CODE, "2026-10-12T18:00:00.000Z"),
      ],
      sent: [sentRow(GOODNIGHT_MIA, GRANDMA_CODE, runtimeLabel(goodnight), GRANDMA_ADDED)],
      previousVisit: SHELF_PREVIOUS_VISIT,
      resume: { [`code:${TWINKLE_CODE}`]: resumeAt(3, TWINKLE.pages.length, TWINKLE_STOPPED) },
    });
    await prepare(page, LAPTOP_SHELF);
    await page.goto("/read");
    const where = "s07 1140x712";
    const face = (code: string) => page.locator(`[data-sk="shelf-tape"][data-tape-id="${code}"]`);
    const band = page.locator('[data-shelf="band"]');
    const panel = page.locator('[data-panel="read-it-in"]');

    await expect(page.getByRole("heading", { level: 1, name: "Pick a tape." })).toBeVisible({ timeout: 20000 });
    await expect(page.locator('[data-sk="shelf-tape"]')).toHaveCount(3);
    await expect(page.locator('[data-sk="shelf-blank"]')).toHaveCount(1);
    // the room is hydrated once it has written this visit's time
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("ssync-shelf-visit")), { timeout: 20000 })
      .toBe(SHELF_NOW);

    // T21: the tape stopped in most recently is selected on arrival, lifted, its place in the band
    await expect(face(TWINKLE_CODE)).toHaveAttribute("aria-checked", "true");
    await expect
      .poll(() => face(TWINKLE_CODE).evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42))
      .toBe(-10);
    await expect(band.locator(".rr-band-line")).toHaveText(`${TWINKLE.title} · ${TWINKLE.byline}`);
    await expect(band.getByText("You stopped at page 3.", { exact: true })).toBeVisible();
    await expect(band.getByRole("button", { name: "Pick up where you left off" })).toBeVisible();
    await expect(band.getByRole("button", { name: "Start again" })).toBeVisible();
    await expect(band.getByRole("button", { name: "Play this tape" })).toHaveCount(0);

    // T20b: Grandma's reply, sent and stamped NEW
    const grandma = face(GRANDMA_CODE);
    await expect(grandma).toHaveAttribute("data-sent", "true");
    await expect(grandma.locator('[data-stamp="new"]')).toBeVisible();
    await expect(page.locator('[data-shelf="yours"]')).toContainText(/SENT TO YOU/i);
    await expect(face(BATH_CODE)).toBeVisible();

    // T22a/b: "Read it in…" for the house tape, as s07 draws it — Hush, the browser voice reading now
    await page.locator('[data-shelf="house"]').getByRole("button", { name: "Read it in…" }).click();
    await expect(panel.getByRole("heading", { level: 2, name: "Read it in…" })).toBeFocused();
    await expect(panel.locator('[data-rin="line"]')).toHaveText("A computer read you this one. Now read it in yours.");
    const voices = panel.getByRole("radiogroup", { name: "Whose voice?" });
    expect(
      await voices.getByRole("radio").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? "")),
    ).toEqual(["Browser voice, reading now", "Grandma Rose", "Mia", "Someone new"]);
    await expect(voices.getByRole("radio", { name: "Browser voice, reading now", exact: true })).toBeChecked();
    const feel = panel.getByRole("radiogroup", { name: "What should it feel like?" });
    await expect(feel.locator('[data-sk="mood-chip"]')).toHaveCount(8);
    await feel.getByRole("radio", { name: /^Hush, / }).check();
    await expect(feel.locator('[data-sk="mood-chip"][data-mood="Hush"]')).toHaveClass(/is-on/);
    // the shelf's choice is untouched by the panel's target
    await expect(face(TWINKLE_CODE)).toHaveAttribute("aria-checked", "true");
    await expect(band.getByText("You stopped at page 3.", { exact: true })).toBeVisible();

    // at rest: no hover, no focus ring, the header picture in
    await page.mouse.move(1, 1);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect
      .poll(() =>
        panel.locator('[data-rin="art"] img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      )
      .toBe(true);
    await settle(page);
    for (const code of [GRANDMA_CODE, TWINKLE_CODE, BATH_CODE]) await expectInView(page, face(code), `${where}: ${code}`);
    await expectInView(page, page.locator('[data-sk="shelf-blank"]'), `${where}: the blank tape`);
    await expectInView(page, band.locator('[data-shelf="resume"]'), `${where}: the resume line`);
    await expectInView(page, band.getByRole("button", { name: "Pick up where you left off" }), `${where}: Pick up`);
    await expectInView(page, panel.locator('[data-rin="art"]'), `${where}: the panel's header picture`);
    await expectInView(page, voices, `${where}: WHOSE VOICE?`);
    await expectInView(page, feel.locator('[data-sk="mood-chip"][data-mood="Hush"]'), `${where}: Hush`);
    // Idea / Phase 3 stay unbuilt: no search, genre pills, Premium, made voice
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await expect(page.getByText(/PREMIUM|Faith-Based|MADE VOICE|PHASE 3/i)).toHaveCount(0);
    await expectClean(page, errors, where);
    await evidenceShot(page, "s07-shelf-1140x712.png");
  });

  /* ---------------------------------------------------------- s08 protocol */

  for (const size of [LAPTOP_SHELF, PHONE_375]) {
    test(`s08 · protocol ${tag(size)}: hero, FIG. 1 taken apart, the three cards`, async ({ page }) => {
      test.setTimeout(60000);
      const errors = watchErrors(page);
      await prepare(page, size);
      await page.goto("/protocol");
      const where = `s08 ${tag(size)}`;

      await expect(page.getByRole("heading", { level: 1, name: "One file holds the whole storybook." })).toBeVisible();
      const fig = page.locator('figure[data-protocol="fig-packet"]');
      await expect(fig).toBeVisible();
      await expect(fig.locator('[data-sk="packet-exploded"] > li')).toHaveCount(7);
      for (const card of ["codec-card", "validator", "player-snippet"]) {
        await expect(page.locator(`[data-protocol="${card}"]`)).toBeVisible();
      }
      await settle(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expectInView(page, page.locator("section.pr-hero h1"), `${where}: H1`);
      await expectClean(page, errors, where);
      await evidenceShot(page, `s08-protocol-${tag(size)}.png`);

      // FIG. 1 brought up under the sticky bar, the cards beside (laptop) or after it (phone)
      await fig.evaluate((el) => {
        const top = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, Math.max(0, top - 64));
      });
      await settle(page);
      if (size === LAPTOP_SHELF) {
        const geo = await page.evaluate(() => {
          const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().toJSON() as DOMRect;
          return { fig: r('figure[data-protocol="fig-packet"]'), cards: r('[data-protocol="cards"]') };
        });
        expect(geo.cards.left, `${where}: the cards stand beside FIG. 1`).toBeGreaterThan(geo.fig.right);
      }
      await expectClean(page, errors, `${where} FIG. 1`);
      await evidenceShot(page, `s08-protocol-${tag(size)}-fig.png`);
    });
  }

  /* ---------------------------------------------------------- s09 advanced */

  test("s09 · advanced 1290x900: the house tape on page 3 in its own Hush; TYPE A FEELING resolves to Hush", async ({
    page,
  }) => {
    test.setTimeout(90000);
    const errors = watchErrors(page);
    await prepare(page, WINDOW_S09);
    await page.goto("/studio?open=house");
    await expect(page.locator("#studio-title")).toHaveValue("The Brave Little Star", { timeout: 30000 });
    await expect(page.locator("[data-page-index]")).toHaveCount(8, { timeout: 30000 });
    const where = "s09 1290x900";

    const mode = page.locator('[data-sk="mode"] [role="switch"]');
    await mode.click();
    await expect(mode).toHaveAttribute("aria-checked", "true");
    const inspector = page.locator('[aria-label="Inspector"]');
    await expect(inspector.first()).toBeVisible();
    await expect(page.locator("#insp-autopause")).toBeVisible();
    await goToPage(page, 3);
    await photoReady(page);

    // T24a: page 3 gets its own mood; the story stays Wonder
    await expect(page.locator('label[for="insp-page-mood"]')).toHaveText("mood · page 3");
    await page.locator("#insp-page-mood").selectOption("Hush");
    await expect(page.locator("#insp-page-mood")).toHaveValue("Hush");
    await expect(page.locator('[data-studio="mood-reach"]')).toHaveText("whole story · page 3 has its own mood");
    await expect(page.locator("#insp-mood")).toHaveValue("Wonder");
    await expect(page.locator('[data-studio="stage-status-music"]')).toHaveText("Hush · music on");

    // T24b: the words resolve to a mood pill, not yet applied
    const feeling = page.locator("#insp-feeling");
    await expect(page.locator('label[for="insp-feeling"]')).toHaveText("TYPE A FEELING", { useInnerText: true });
    await feeling.fill("a quiet lullaby for bedtime");
    const pill = page.locator('[data-studio="feeling-result"]');
    await expect(pill).toHaveText("Hush");
    await expect(pill).toHaveAttribute("data-mood", "Hush");
    await expect(page.locator('[data-studio="feeling-note"]')).toHaveText("");

    // frame the Inspector as s09 does: MIX up, the MOOD row and the feeling row in view
    await inspector.first().evaluate((aside) => {
      const mix = Array.from(aside.querySelectorAll("section")).find((s) => s.querySelector("h3")?.textContent === "Mix");
      if (mix) aside.scrollTop = Math.max(0, mix.offsetTop - 64);
    });
    await page.mouse.move(1, 1);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page);
    await expectInView(page, page.locator('[data-studio="stage-photo"]'), `${where}: the Stage`);
    await expectInView(page, page.locator("#insp-page-mood"), `${where}: mood · page 3`);
    await expectInView(page, feeling, `${where}: TYPE A FEELING`);
    await expectInView(page, pill, `${where}: the Hush pill`);
    // Phase 3 stays unbuilt: no desktop window, Cast, timeline lanes or SFX lane
    await expect(page.getByText(/^CAST$|Professional timeline|^SFX$|Tauri/)).toHaveCount(0);
    await expectClean(page, errors, where);
    await evidenceShot(page, "s09-advanced-1290x900.png");
  });

  /* ------------------------------------------------------- s10 read-from-qr */

  test("s10 · read-from-qr 390x844: /read?story=<code> opens the tape with no account", async ({ page, baseURL }) => {
    test.setTimeout(60000);
    const errors = watchErrors(page);
    const origin = new URL(baseURL!).origin;
    const foreign = watchSends(page, { types: "all", foreignTo: origin });
    await prepare(page, IPHONE);
    const shareCode = LINK_CODE;
    await seedDeviceLibrary(page, "twinkle", { shareCode });
    await page.goto(`/read?story=${shareCode}`);
    const where = "s10 390x844";

    const cover = page.locator('[data-pl="cover"] [data-sk="tape"]');
    await expect(cover).toContainText(TWINKLE.title, { timeout: 20000 });
    await expect(page.getByRole("button", { name: /Tap to Begin/ })).toBeVisible();
    // no account: nothing asks anyone to sign in or sign up
    await expect(page.getByText(/sign in|log in|sign up|create an account/i)).toHaveCount(0);
    await expect(page.locator('input[type="password"], input[type="email"]')).toHaveCount(0);
    expect(foreign.urls(), `${where}: nothing fetched from anywhere else`).toEqual([]);
    await settle(page);
    await expectClean(page, errors, where);
    await evidenceShot(page, "s10-read-from-qr-390x844.png");
  });
});
