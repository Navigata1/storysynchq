// T13a · The room fits the tablet: three friendly tools and Magic set apart,
// the Stage borrows the Player's ambient light, and a tape-red listening ring
// while the tape is listening.
//
// Reference: s03 "Snap. Tell. Hear it." (docs/vision/reference/renders/s03.png,
// brief screens[2]) — Simple mode on a 1180×820 tablet, page 3 of Twinkle on
// the Stage, Voice open, mid-take at 0:05.
//
//   fit      · 1180×820, 1280×720, 1024×768: no page scroll, the photo, the
//              Pages strip and the Transport inside the viewport, with and
//              without the Voice card; 375×812 keeps the phone column
//   rail     · Photo, Voice, Music, a separator, then a quieter Magic
//   light    · the Stage's backdrop is the page's own picture, blurred; a
//              page with no picture keeps the last picture's light
//   ring     · the photo's ListeningRing, the "Listening…" pill, the
//              "recording" chip; the words stay still during a take
//   card     · the tool card docks between the rail and the Stage at ≥ 1024
//   copy     · the Voice card's lock row, footnote and mic-off recovery
//   top bar  · Exit, the centred title, Finish "after this take"
//   honesty  · no Idea items; nothing loops but reels; reduced motion
//
// The family content is illustrative and lives in tests/fixtures only.

import { test, expect, type Locator, type Page } from "@playwright/test";
import { restoreDraft, seedStudioDraft, studioDraftState } from "./fixtures/helpers";
import { stubMicrophone } from "./fixtures/mic";
import { TWINKLE } from "./fixtures/tapes";

/* ------------------------------------------------------------------ facts */

const DRAFT = studioDraftState("twinkle");
/** Page n's picture, exactly as the draft manifest holds it (data URLs). */
const PAGE_URL = (n: number) => DRAFT.manifest.pages[n - 1].illustration?.url ?? "";

type Size = { width: number; height: number };
const TABLET: Size = { width: 1180, height: 820 };
const FIT_VIEWPORTS: Size[] = [TABLET, { width: 1280, height: 720 }, { width: 1024, height: 768 }];
const PHONE: Size = { width: 375, height: 812 };
const BETWEEN: Size = { width: 900, height: 800 };

const RED = "rgb(227, 69, 47)";
const GOLD = "rgb(245, 158, 11)";
/** --ss-fg-3, the muted foreground. */
const MUTED = "rgb(141, 150, 173)";
/** Anything that reads as an emoji or a pictograph glyph standing in for an icon. */
const PICTOGRAPH = /[\u{1F000}-\u{1FAFF}☀-➿⌀-⏿■-◿⬀-⯿\u{FE0F}]/u;

const TOOLS = ["Photo", "Voice", "Music", "Magic"] as const;
const TOOL_ICON: Record<(typeof TOOLS)[number], string> = {
  Photo: "lucide-camera",
  Voice: "lucide-mic",
  Music: "lucide-music",
  Magic: "lucide-sparkles",
};

const LOCK_ROW = "Pages stay put while you record.";
const FOOTNOTE = "Recordings live only in this browser until a grown-up taps Finish my story.";
const MIC_OFF = {
  subtitle: "We could not start listening",
  headline: "The microphone is switched off",
  body: "A grown-up needs to allow the microphone for this site — look for the lock or microphone icon next to the web address, choose Allow, then tap Try again.",
};

const SEL = {
  rail: 'nav[aria-label="Story tools"]',
  stage: ".studio-area-stage",
  monitor: '[data-studio="stage"]',
  zone: '[data-studio="stage-zone"]',
  photo: '[data-studio="stage-photo"]',
  backdrop: '[data-studio="stage-backdrop"]',
  ring: '[data-sk="listening-ring"]',
  pill: '[data-studio="listening-pill"]',
  chip: '[data-studio="stage-rec-chip"]',
  head: '[data-studio="stage-head"]',
  text: '[data-studio="stage-text"]',
  status: '[data-studio="stage-status"]',
  pages: 'section[aria-label="Pages"]',
  transport: 'section[aria-label="Transport"]',
  card: '[data-studio="tool-card"]',
  title: '[data-studio="title"]',
  finishNote: '[data-studio="finish-note"]',
} as const;

/* ---------------------------------------------------------------- helpers */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

async function box(locator: Locator): Promise<Box> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  });
}

function intersects(a: Box, b: Box): boolean {
  return a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;
}

const rail = (page: Page) => page.locator(SEL.rail);
const tool = (page: Page, name: (typeof TOOLS)[number]) =>
  rail(page).getByRole("button", { name, exact: true });
const recButton = (page: Page) => page.locator('[data-sk="transport"][data-kind="rec"]');
const frame = (page: Page, n: number) => page.getByRole("button", { name: new RegExp(`^Page ${n}\\b`) });
/** The strip's add control — "Add a new page" today, "Snap the next drawing" after T13b. */
const addPage = (page: Page) =>
  page.getByRole("button", { name: /^(Add a new page|Snap the next drawing)$/ });

/** Wait for every finite animation to land, so boxes are measured at rest. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((a) => Number.isFinite(a.effect?.getComputedTiming().iterations ?? Infinity));
    await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function photoReady(page: Page): Promise<void> {
  const photo = page.locator(SEL.photo);
  await expect(photo).toBeVisible();
  await expect
    .poll(() => photo.evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))
    .toBe(true);
}

async function goToPage(page: Page, n: number): Promise<void> {
  await frame(page, n).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Page ${n}\\b.*selected`) })).toHaveCount(1);
  await expect(page.locator(SEL.transport)).toContainText(`pg ${n}/`);
}

interface OpenOptions {
  viewport?: Size;
  mic?: "ok" | "deny";
  pageNumber?: number;
  reducedMotion?: boolean;
}

/** Twinkle restored from this device's draft, page 3 (by default) on the Stage. */
async function openTwinkle(page: Page, opts: OpenOptions = {}): Promise<void> {
  const { viewport, mic = "ok", pageNumber = 3, reducedMotion = false } = opts;
  if (viewport) await page.setViewportSize(viewport);
  if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await stubMicrophone(page, { deny: mic === "deny" });
  await seedStudioDraft(page, "twinkle");
  await page.goto("/studio");
  await restoreDraft(page);
  if (pageNumber !== 1) await goToPage(page, pageNumber);
  await photoReady(page);
  await settle(page);
}

/** Start a take from the Transport's REC (it opens the Voice card too). */
async function startTake(page: Page): Promise<void> {
  await recButton(page).click();
  await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);
}

async function stopTake(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Stop —/ }).click();
  await expect(page.locator(".studio[data-recording='true']")).toHaveCount(0, { timeout: 10000 });
}

async function expectRoomFits(page: Page, where: string): Promise<void> {
  await settle(page);
  const doc = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
  }));
  expect(doc.scrollHeight, `${where}: the page scrolls`).toBeLessThanOrEqual(doc.innerHeight);
  expect(doc.scrollWidth, `${where}: the page scrolls sideways`).toBeLessThanOrEqual(doc.innerWidth);

  for (const [name, selector] of [
    ["the Stage photo", SEL.photo],
    ["the Pages strip", SEL.pages],
    ["the Transport", SEL.transport],
  ] as const) {
    const b = await box(page.locator(selector));
    expect(b.x, `${where}: ${name} left edge`).toBeGreaterThanOrEqual(-0.5);
    expect(b.y, `${where}: ${name} top edge`).toBeGreaterThanOrEqual(-0.5);
    expect(b.right, `${where}: ${name} right edge`).toBeLessThanOrEqual(doc.innerWidth + 0.5);
    expect(b.bottom, `${where}: ${name} bottom edge`).toBeLessThanOrEqual(doc.innerHeight + 0.5);
  }

  // The photo is a photo: centred in its zone, never touching it, never taller.
  const zone = await box(page.locator(SEL.zone));
  const photo = await box(page.locator(SEL.photo));
  expect(photo.x - zone.x, `${where}: photo margin left`).toBeGreaterThanOrEqual(7.5);
  expect(zone.right - photo.right, `${where}: photo margin right`).toBeGreaterThanOrEqual(7.5);
  expect(photo.y - zone.y, `${where}: photo margin top`).toBeGreaterThanOrEqual(7.5);
  expect(zone.bottom - photo.bottom, `${where}: photo margin bottom`).toBeGreaterThanOrEqual(7.5);
  expect(photo.height, `${where}: photo taller than its zone`).toBeLessThanOrEqual(zone.height);
  expect(Math.abs(photo.x + photo.width / 2 - (zone.x + zone.width / 2)), `${where}: photo centred across`).toBeLessThanOrEqual(1.5);
  expect(Math.abs(photo.y + photo.height / 2 - (zone.y + zone.height / 2)), `${where}: photo centred down`).toBeLessThanOrEqual(1.5);
  expect(photo.width, `${where}: the photo is a real picture, not a sliver`).toBeGreaterThan(160);
}

/** Infinite animations in the app's own DOM (the framework's dev overlay lives in a shadow root and is not the app). */
async function infiniteAnimations(page: Page) {
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().iterations === Infinity)
      .map((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target ?? null;
        return {
          name: (a as CSSAnimation).animationName ?? a.id ?? "",
          inApp: Boolean(target && document.contains(target)),
          inReel: Boolean(target?.closest('[data-sk="reel"]')),
          where: target ? `${target.tagName.toLowerCase()}.${target.getAttribute("class") ?? ""}` : "",
        };
      })
      .filter((a) => a.inApp),
  );
}

/* ===================================================================== fit */

test.describe("T13a · the room fits the tablet", () => {
  for (const viewport of FIT_VIEWPORTS) {
    const where = `${viewport.width}×${viewport.height}`;
    test(`${where}: page 3 fits with no tool open and with Voice open`, async ({ page }) => {
      await openTwinkle(page, { viewport });
      await expectRoomFits(page, where);

      await tool(page, "Voice").click();
      await expect(page.locator(SEL.card)).toBeVisible();
      await expectRoomFits(page, `${where} + Voice`);
    });
  }

  test("375×812: the stage-first column and the bottom toolbar stay, with no sideways scroll", async ({ page }) => {
    await openTwinkle(page, { viewport: PHONE });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(PHONE.width);

    const photo = await box(page.locator(SEL.photo));
    const pages = await box(page.locator(SEL.pages));
    const nav = await box(rail(page));
    const transport = await box(page.locator(SEL.transport));
    expect(photo.bottom, "the Stage comes first").toBeLessThanOrEqual(pages.y + 0.5);
    expect(pages.bottom, "the strip sits above the toolbar").toBeLessThanOrEqual(nav.y + 0.5);
    expect(nav.bottom, "the toolbar sits above the transport").toBeLessThanOrEqual(transport.y + 0.5);
    for (const name of TOOLS) {
      const b = await box(tool(page, name));
      expect(b.y, `${name} in the toolbar`).toBeGreaterThanOrEqual(nav.y - 0.5);
      expect(b.bottom, `${name} in the toolbar`).toBeLessThanOrEqual(nav.bottom + 0.5);
      expect(b.right, `${name} on screen`).toBeLessThanOrEqual(PHONE.width + 0.5);
    }
  });

  test("375: the transport readout stays on one line; mid-take the live ring clears its name", async ({ page }) => {
    await openTwinkle(page, { viewport: PHONE });
    const readout = page.locator(`${SEL.transport} > :last-child`);
    // M6: a voice length the transport does not know reads "—", not a made-up
    // "0:00"; page 3's is known (the take measured 6.4 s), so it reads 0:06.
    await expect(readout).toContainText("0:00 / 0:06");
    for (const line of await readout.locator(":scope > *").all()) {
      const { height, lineHeight } = await line.evaluate((el) => ({
        height: el.getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(el).lineHeight),
      }));
      expect(height, `"${await line.innerText()}" on one line`).toBeLessThanOrEqual(lineHeight * 1.2);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(PHONE.width);

    await startTake(page);
    const card = page.locator(SEL.card);
    const ring = await box(card.locator('[data-studio="voice-live-ring"]'));
    const label = await box(card.locator('[data-studio="voice-record"] > span').last());
    expect(label.x - ring.right, "the live ring clears its name").toBeGreaterThanOrEqual(8);
    await stopTake(page);
  });

  test("a landscape photo never shows a square frame first: the frame waits unseen until it knows the shape", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET });
    await addPage(page).click();
    await expect(page.getByRole("button", { name: /^Page 6\b.*selected/ })).toHaveCount(1);

    // A 1600×1000 drawing, made on a canvas.
    const base64 = await page.evaluate(() => {
      const canvas = Object.assign(document.createElement("canvas"), { width: 1600, height: 1000 });
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fbf7ec";
      ctx.fillRect(0, 0, 1600, 1000);
      ctx.fillStyle = "#3b6fd8";
      ctx.fillRect(200, 200, 1200, 600);
      return canvas.toDataURL("image/png").split(",")[1];
    });

    // Every DOM change in the picture zone is sampled before the browser can
    // paint it (a MutationObserver runs before the picture's load event).
    await page.evaluate(() => {
      const zone = document.querySelector('[data-studio="stage-zone"]')!;
      const samples: { opacity: number; ratio: number }[] = [];
      (window as unknown as { __frames: typeof samples }).__frames = samples;
      new MutationObserver(() => {
        const ring = zone.querySelector('[data-sk="listening-ring"]');
        if (!ring?.querySelector('[data-studio="stage-photo"]')) return;
        const r = ring.getBoundingClientRect();
        samples.push({ opacity: Number(getComputedStyle(ring).opacity), ratio: r.width / r.height });
      }).observe(zone, { subtree: true, childList: true, attributes: true });
    });
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: "landscape.png",
      mimeType: "image/png",
      buffer: Buffer.from(base64, "base64"),
    });
    await photoReady(page);
    await settle(page);

    const ring = await box(page.locator(SEL.zone).locator(SEL.ring));
    expect(ring.width / ring.height, "the frame hugs the landscape photo").toBeCloseTo(1.6, 1);
    const frames = await page.evaluate(() => (window as unknown as { __frames: { opacity: number; ratio: number }[] }).__frames);
    expect(frames.length, "the zone changed while the photo arrived").toBeGreaterThan(0);
    const seenSquare = frames.filter((f) => f.opacity > 0 && Math.abs(f.ratio - 1.6) > 0.05);
    expect(seenSquare, "no frame of the wrong shape was ever visible").toEqual([]);
    await expect(page.locator(SEL.zone).locator(SEL.ring)).toHaveCSS("opacity", "1");
  });

  test("the photo is a photo: radius 10, a drop shadow; a blank page keeps Add a picture, with a Camera", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET });
    const look = await page.locator(SEL.photo).evaluate((el) => {
      const cs = getComputedStyle(el);
      return { radius: cs.borderRadius, shadow: cs.boxShadow };
    });
    expect(look.radius).toBe("10px");
    expect(look.shadow).not.toBe("none");
    expect(look.shadow).toMatch(/rgba\(0, 0, 0/);
    expect(await page.locator(SEL.photo).getAttribute("src")).toBe(PAGE_URL(3));

    await addPage(page).click();
    await expect(page.getByRole("button", { name: /^Page 6\b.*selected/ })).toHaveCount(1);
    const add = page.locator(SEL.monitor).getByRole("button", { name: /Add a picture/ });
    await expect(add).toBeVisible();
    await expect(add.locator("svg.lucide-camera")).toHaveCount(1);
    expect(await add.innerText()).not.toMatch(PICTOGRAPH);
    const chooser = page.waitForEvent("filechooser");
    await add.click();
    const picker = await chooser;
    expect(await picker.element().getAttribute("accept")).toBe("image/*");
    expect(await picker.element().getAttribute("capture")).toBe("environment");
  });
});

/* ==================================================================== rail */

test.describe("T13a · rail: three friendly tools, Magic apart", () => {
  test("names, order, lucide icons, no emoji, and a separator before Magic", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET });
    const buttons = rail(page).getByRole("button");
    await expect(buttons).toHaveCount(4);
    expect(await buttons.allTextContents()).toEqual([...TOOLS]);
    for (const name of TOOLS) {
      const b = tool(page, name);
      await expect(b, `${name}: one button with exactly this name`).toHaveCount(1);
      await expect(b.locator(`svg.${TOOL_ICON[name]}`), `${name}: lucide icon`).toHaveCount(1);
      expect((await b.textContent())?.trim(), `${name}: text is the label alone`).toBe(name);
    }
    expect(await rail(page).innerText()).not.toMatch(PICTOGRAPH);

    const separator = rail(page).getByRole("separator");
    await expect(separator).toHaveCount(1);
    const order = await rail(page).evaluate((nav) =>
      Array.from(nav.querySelectorAll('button, [role="separator"]')).map((el) =>
        el.getAttribute("role") === "separator" ? "|" : (el.textContent ?? "").trim(),
      ),
    );
    expect(order).toEqual(["Photo", "Voice", "Music", "|", "Magic"]);
  });

  test("≥ 768: tools 88+ tall at radius 22; Magic ≤ 72, a 12 px muted label, set 16+ below Music", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET });
    for (const name of ["Photo", "Voice", "Music"] as const) {
      const b = tool(page, name);
      expect((await box(b)).height, `${name} height`).toBeGreaterThanOrEqual(88);
      expect(await b.evaluate((el) => getComputedStyle(el).borderRadius), `${name} radius`).toBe("22px");
    }
    const magic = tool(page, "Magic");
    const music = await box(tool(page, "Music"));
    const magicBox = await box(magic);
    expect(magicBox.height).toBeLessThanOrEqual(72);
    expect(magicBox.y - music.bottom, "Magic sits apart").toBeGreaterThanOrEqual(16);
    const separator = await box(rail(page).getByRole("separator"));
    expect(separator.y).toBeGreaterThanOrEqual(music.bottom);
    expect(separator.bottom).toBeLessThanOrEqual(magicBox.y);

    const label = await magic.locator(".sk-big-label").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { size: cs.fontSize, color: cs.color };
    });
    expect(label).toEqual({ size: "12px", color: MUTED });
  });

  test("the active tool is pressed and gold; Voice turns it on", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET });
    for (const name of TOOLS) await expect(tool(page, name)).toHaveAttribute("aria-pressed", "false");
    await tool(page, "Voice").click();
    await expect(tool(page, "Voice")).toHaveAttribute("aria-pressed", "true");
    const fill = await tool(page, "Voice").evaluate((el) => {
      const cs = getComputedStyle(el);
      return `${cs.backgroundColor} ${cs.backgroundImage}`;
    });
    expect(fill).toContain(GOLD);
    for (const name of ["Photo", "Music", "Magic"] as const) {
      await expect(tool(page, name)).toHaveAttribute("aria-pressed", "false");
    }
  });

  test("375: all four stay in the bottom toolbar, Magic narrower than Photo", async ({ page }) => {
    await openTwinkle(page, { viewport: PHONE });
    const nav = await box(rail(page));
    const photo = await box(tool(page, "Photo"));
    const magic = await box(tool(page, "Magic"));
    expect(magic.width).toBeLessThan(photo.width);
    for (const name of TOOLS) {
      const b = await box(tool(page, name));
      await expect(tool(page, name)).toBeVisible();
      expect(b.y).toBeGreaterThanOrEqual(nav.y - 0.5);
      expect(b.bottom).toBeLessThanOrEqual(nav.bottom + 0.5);
    }
  });
});

/* ========================================================== ambient light */

test.describe("T13a · the Stage borrows the Player's light", () => {
  test("one source: backdrop = photo = the manifest's page URL, blurred 36 px at half brightness, still", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET });
    const backdrop = page.locator(`${SEL.backdrop} img`);
    await expect(backdrop).toHaveCount(1);
    const photoSrc = await page.locator(SEL.photo).getAttribute("src");
    expect(photoSrc).toBe(PAGE_URL(3));
    expect(await backdrop.getAttribute("src")).toBe(photoSrc);

    const look = await backdrop.evaluate((el) => {
      const cs = getComputedStyle(el);
      const layer = el.closest('[data-studio="stage-backdrop"]')!;
      return {
        filter: cs.filter,
        animation: cs.animationName,
        layerAnimation: getComputedStyle(layer).animationName,
        infinite: el.getAnimations().length + layer.getAnimations().length,
      };
    });
    expect(look.filter).toContain("blur(36px)");
    expect(look.filter).toContain("brightness(0.5)");
    expect(look.animation, "no Ken Burns: nothing loops in the Creator").toBe("none");
    expect(look.layerAnimation).toBe("none");
    expect(look.infinite).toBe(0);

    // The backdrop lights the picture zone: it covers it.
    const zone = await box(page.locator(SEL.zone));
    const layer = await box(page.locator(SEL.backdrop));
    expect(layer.x).toBeLessThanOrEqual(zone.x + 0.5);
    expect(layer.y).toBeLessThanOrEqual(zone.y + 0.5);
    expect(layer.right).toBeGreaterThanOrEqual(zone.right - 0.5);
    expect(layer.bottom).toBeGreaterThanOrEqual(zone.bottom - 0.5);
  });

  test("a page with no picture keeps the last picture's light (the Player's rule)", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET, pageNumber: 5 });
    const backdrop = page.locator(`${SEL.backdrop} img`);
    await expect(backdrop).toHaveAttribute("src", PAGE_URL(5));

    await addPage(page).click();
    await expect(page.getByRole("button", { name: /^Page 6\b.*selected/ })).toHaveCount(1);
    await expect(page.locator(SEL.photo)).toHaveCount(0);
    await expect(backdrop).toHaveAttribute("src", PAGE_URL(5));
  });

  test("Delete everything takes the light too: the next story starts in the navy room", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize(TABLET);
    await seedStudioDraft(page, "twinkle", { narration: false });
    await page.goto("/studio");
    await restoreDraft(page);
    await goToPage(page, 5);
    await expect(page.locator(`${SEL.backdrop} img`)).toHaveAttribute("src", PAGE_URL(5));

    await page.getByRole("button", { name: "Finish my story" }).click();
    const question = page.locator('label[for="studio-gate-answer"]');
    await expect(question).toContainText(/\d+\s*[×x*]\s*\d+/, { timeout: 10000 });
    const [, a, b] = (await question.innerText()).match(/(\d+)\s*[×x*]\s*(\d+)/)!;
    await page.locator("#studio-gate-answer").fill(String(Number(a) * Number(b)));
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Your tape is ready" })).toBeVisible({ timeout: 20000 });

    await page.getByRole("button", { name: "Pull the tape out — delete everything", exact: true }).click();
    await page.getByRole("button", { name: /Tap again to delete everything/ }).click();
    await expect(page.getByRole("button", { name: "Finish my story" })).toBeVisible();
    await expect(page.locator(SEL.monitor).getByRole("button", { name: /Add a picture/ })).toBeVisible();
    await expect(page.locator(`${SEL.backdrop} img`), "no picture of the deleted story stays on screen").toHaveCount(0);
  });

  test("with no picture anywhere the backdrop is the navy room gradient", async ({ page }) => {
    await page.setViewportSize(TABLET);
    await page.goto("/studio");
    await expect(page.locator(SEL.backdrop)).toHaveCount(1);
    await expect(page.locator(`${SEL.backdrop} img`)).toHaveCount(0);
    const bg = await page.locator(SEL.backdrop).evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bg).toContain("gradient");
  });
});

/* ========================================================== listening ring */

test.describe("T13a · the listening ring", () => {
  test("REC lights the ring, the pill and the chip; the words stay still; Stop puts them out", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET });
    const ring = page.locator(SEL.ring);
    await expect(ring).toHaveCount(1);
    await expect(ring).toHaveAttribute("data-active", "false");
    // The photo is inside the ring, which wraps it exactly.
    await expect(ring.locator(SEL.photo)).toHaveCount(1);
    const words = await page.locator("#studio-page-text").inputValue();
    expect(words).toBe(TWINKLE.pages[2].text);

    await startTake(page);
    await expect(ring).toHaveAttribute("data-active", "true");
    await settle(page); // the ring eases in (300 ms)
    const shadow = await ring.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toContain(RED);
    expect(shadow).toContain(`${RED} 0px 0px 0px 3px inset`);
    expect(shadow).toContain("rgba(227, 69, 47, 0.35) 0px 0px 80px 0px inset");

    // "Listening… 0:0N" at the photo's bottom centre, with a static live dot.
    const pill = page.locator(SEL.pill);
    await expect(pill).toHaveText(/^Listening… 0:0\d$/);
    await expect(pill).toHaveText(/^Listening… 0:0[2-9]$/, { timeout: 8000 });
    const photo = await box(page.locator(SEL.photo));
    const pillBox = await box(pill);
    expect(Math.abs(pillBox.x + pillBox.width / 2 - (photo.x + photo.width / 2))).toBeLessThanOrEqual(1.5);
    expect(Math.abs(pillBox.y + pillBox.height / 2 - photo.bottom)).toBeLessThanOrEqual(pillBox.height);
    const dot = pill.locator('[data-studio="live-dot"]');
    await expect(dot).toHaveCount(1);
    expect(await dot.evaluate((el) => [getComputedStyle(el).animationName, el.getAnimations().length])).toEqual([
      "none",
      0,
    ]);

    // A red "recording" chip, centred in the Stage header.
    const chip = page.locator(SEL.chip);
    await expect(chip).toHaveText("recording");
    const head = await box(page.locator(SEL.head));
    const chipBox = await box(chip);
    expect(Math.abs(chipBox.x + chipBox.width / 2 - (head.x + head.width / 2))).toBeLessThanOrEqual(2);
    expect(await chip.evaluate((el) => getComputedStyle(el).color)).not.toBe("rgb(255, 255, 255)");

    // The whole-zone red tint is gone: nothing that covers the picture zone is red.
    const zoneCover = await page.locator(SEL.zone).evaluate((zone) => {
      const z = zone.getBoundingClientRect();
      const ring = zone.querySelector('[data-sk="listening-ring"]');
      const offenders: string[] = [];
      for (const el of [zone, ...Array.from(zone.querySelectorAll("*"))]) {
        if (ring && (el === ring || ring.contains(el))) continue;
        const r = el.getBoundingClientRect();
        const cover = Math.max(0, Math.min(r.right, z.right) - Math.max(r.left, z.left)) *
          Math.max(0, Math.min(r.bottom, z.bottom) - Math.max(r.top, z.top));
        if (cover < 0.6 * z.width * z.height) continue;
        const cs = getComputedStyle(el);
        const paint = `${cs.boxShadow} ${cs.backgroundColor} ${cs.backgroundImage}`;
        if (paint.includes("227, 69, 47")) offenders.push(`${el.tagName}.${el.className}`);
      }
      return offenders;
    });
    expect(zoneCover, "no whole-zone red tint").toEqual([]);
    // The ring wraps the photo, not the zone: the light shows around it.
    const ringBox = await box(ring);
    const zone = await box(page.locator(SEL.zone));
    expect(ringBox.width).toBeLessThan(zone.width - 15);

    // Words stay still during a take: same text, no read-along highlight.
    expect(await page.locator("#studio-page-text").inputValue()).toBe(words);
    const highlighted = await page
      .locator(SEL.text)
      .evaluate((el) => el.querySelectorAll("mark, .is-current, .pl-word, [data-word], [aria-current]").length);
    expect(highlighted).toBe(0);

    await stopTake(page);
    await expect(ring).toHaveAttribute("data-active", "false");
    await expect(pill).toHaveCount(0);
    await expect(chip).toHaveCount(0);
  });

  test("status row: mono 10.5 px, lowercase; recording · m:ss; Wonder · music on; music off", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET });
    const status = page.locator(SEL.status);
    const left = status.locator('[data-studio="stage-status-state"]');
    const right = status.locator('[data-studio="stage-status-music"]');
    await expect(left).toHaveText("voice ready");
    await expect(right).toHaveText("Wonder · music on");
    await expect(right.locator("svg.lucide-star")).toHaveCount(1);
    const type = await status.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { size: cs.fontSize, transform: cs.textTransform, family: cs.fontFamily };
    });
    expect(type.size).toBe("10.5px");
    expect(type.transform).toBe("none");
    expect(type.family.toLowerCase()).toMatch(/plex|mono/);

    // The header's voice chip is a lucide Mic and the word "voice".
    const voiceChip = page.locator('[data-studio="stage-voice-chip"]');
    await expect(voiceChip).toHaveText("voice");
    await expect(voiceChip.locator("svg.lucide-mic")).toHaveCount(1);

    await startTake(page);
    await expect(left).toHaveText(/^recording · 0:0\d$/);
    await stopTake(page);
    await expect(left).toHaveText("voice ready");

    await tool(page, "Music").click();
    await page.getByRole("switch", { name: "Play music behind the story" }).click();
    await expect(right).toHaveText("music off");
    await expect(right.locator("svg.lucide-star")).toHaveCount(0);

    // M6 (s09): the icon is the mood's own, as MoodTapeChip draws it — a moon for Calm.
    await page.getByRole("switch", { name: "Play music behind the story" }).click();
    await page.locator('[data-studio="tool-card"]').getByRole("radio", { name: /^Calm\b/ }).click();
    await expect(right).toHaveText("Calm · music on");
    await expect(right.locator("svg.lucide-moon")).toHaveCount(1);
    await expect(right.locator("svg.lucide-star")).toHaveCount(0);
  });
});

/* ============================================================ s09 inspector */

test.describe("M6 · s09 the Advanced inspector", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the docked inspector is a desktop column");
  });

  for (const viewport of [{ width: 1290, height: 900 }, TABLET]) {
    test(`${viewport.width}×${viewport.height}: the inspector runs the full height beside the Stage, strip and transport`, async ({
      page,
    }) => {
      await openTwinkle(page, { viewport });
      const mode = page.locator('[data-sk="mode"] [role="switch"]');
      await mode.click();
      await expect(page.locator("#insp-autopause")).toBeVisible();
      await settle(page);
      const g = await page.evaluate(() => {
        const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().toJSON() as DOMRect;
        return {
          insp: r('[aria-label="Inspector"]'),
          bar: r(".studio-topbar"),
          film: r('[data-studio="film-scroll"]'),
          transport: r('[data-studio="transport"]'),
          readout: r('[data-studio="transport-readout"]'),
          stage: r('[data-studio="stage"]'),
          vh: window.innerHeight,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      expect(Math.abs(g.insp.top - g.bar.bottom), "from the top bar").toBeLessThanOrEqual(1);
      expect(Math.abs(g.insp.bottom - g.vh), "to the foot of the room").toBeLessThanOrEqual(1);
      for (const [name, b] of [["strip", g.film], ["transport", g.transport], ["Stage", g.stage]] as const) {
        expect(b.right, `the ${name} keeps left of the inspector`).toBeLessThanOrEqual(g.insp.left + 0.5);
      }
      expect(g.readout.right, "the readout stays inside the transport").toBeLessThanOrEqual(g.transport.right + 0.5);
      expect(g.overflow).toBeLessThanOrEqual(0);
    });
  }

  test("1290×900: s09's density, legible headings and notes, and the music bed as a switch", async ({ page }) => {
    await openTwinkle(page, { viewport: { width: 1290, height: 900 } });
    await page.locator('[data-sk="mode"] [role="switch"]').click();
    const insp = page.locator('[aria-label="Inspector"]');
    await expect(insp).toBeVisible();
    await settle(page);

    // a slider is one row: its name, the range, the reading
    const row = await page.evaluate(() => {
      const range = document.querySelector("#insp-autopause")!.getBoundingClientRect();
      const name = document.querySelector('label[for="insp-autopause"]')!.getBoundingClientRect();
      return { range: range.top + range.height / 2, name: name.top + name.height / 2, nameRight: name.right, rangeLeft: range.left };
    });
    expect(Math.abs(row.range - row.name), "name and range on one row").toBeLessThanOrEqual(4);
    expect(row.nameRight).toBeLessThanOrEqual(row.rangeLeft);
    await expect(page.locator("#insp-autopause")).toHaveAccessibleName("auto pause");
    await expect(page.locator("#insp-autopause")).toHaveAttribute("aria-valuetext", /s$/);
    // controls 36px docked
    for (const sel of ["#insp-page-mood", "#insp-mood", "#insp-feeling"]) {
      const h = (await page.locator(sel).boundingBox())!.height;
      expect(h, `${sel} is 36px docked`).toBeGreaterThanOrEqual(32);
      expect(h).toBeLessThanOrEqual(37);
    }

    // AA: headings, labels and notes in --ss-fg-3 (#8d96ad), not white at 35–45 %
    const FG3 = "rgb(141, 150, 173)";
    const colours = await insp.evaluate((aside) => {
      const pick = (el: Element | null) => (el ? getComputedStyle(el).color : "missing");
      return {
        heading: pick(aside.querySelector("h3")),
        label: pick(aside.querySelector('label[for="insp-autopause"]')),
        feeling: pick(aside.querySelector('label[for="insp-feeling"]')),
        level: pick(aside.querySelector("#insp-level-voices-note")),
        multiplier: pick(Array.from(aside.querySelectorAll("p")).find((p) => p.textContent?.startsWith("Accessibility control")) ?? null),
      };
    });
    expect(colours).toEqual({ heading: FG3, label: FG3, feeling: FG3, level: FG3, multiplier: FG3 });

    // the music bed: T17's switch
    const bed = page.getByRole("switch", { name: "Music bed" });
    await expect(bed).toBeChecked();
    await bed.focus();
    await page.keyboard.press("Space");
    await expect(bed).not.toBeChecked();
    await expect(page.locator('[data-studio="stage-status-music"]')).toHaveText("music off");
    await page.keyboard.press("Space");
    await expect(bed).toBeChecked();
  });
});

/* ============================================================ docked card */

test.describe("T13a · the tool card docks beside the Stage", () => {
  test("1180×820: Voice is a column between the rail and the Stage, 300–340 wide; Close Voice closes it", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET });
    await tool(page, "Voice").click();
    const card = page.locator(SEL.card);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("aria-label", "Voice");
    await settle(page);
    const cardBox = await box(card);
    const photo = await box(page.locator(SEL.photo));
    const nav = await box(rail(page));
    expect(intersects(cardBox, photo), "the card never covers the photo").toBe(false);
    expect(cardBox.x).toBeGreaterThanOrEqual(nav.right - 0.5);
    expect(cardBox.width).toBeGreaterThanOrEqual(300);
    expect(cardBox.width).toBeLessThanOrEqual(340);
    expect(cardBox.right, "the Stage is to the card's right").toBeLessThanOrEqual(
      (await box(page.locator(SEL.monitor))).x + 0.5,
    );

    await page.getByRole("button", { name: "Close Voice" }).click();
    await expect(card).toHaveCount(0);
  });

  test("keyboard: Tab goes rail → the docked card → the Stage, the order the eye reads (WCAG 2.4.3)", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET });
    // Advanced on, as reviewed: the inspector column must not change the order.
    const mode = page.locator('[data-sk="mode"] [role="switch"]');
    await mode.click();
    await expect(mode).toHaveAttribute("aria-checked", "true");
    await tool(page, "Voice").click();
    const card = page.locator(SEL.card);
    await expect(card).toBeVisible();
    await settle(page);

    await tool(page, "Voice").focus();
    for (const next of ["Music", "Magic"] as const) {
      await page.keyboard.press("Tab");
      await expect(tool(page, next), `Tab reaches ${next}`).toBeFocused();
    }
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      const text = document.getElementById("studio-page-text");
      return {
        inCard: Boolean(el?.closest('[data-studio="tool-card"]')),
        name: el?.getAttribute("aria-label") ?? el?.textContent?.trim() ?? "",
        beforeStageText: Boolean(
          el && text && el.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      };
    });
    expect(focused, "after Magic, Tab lands in the card it opened, not on the story text").toEqual({
      inCard: true,
      name: "Close Voice",
      beforeStageText: true,
    });

    // Out of the card's far end, focus goes on into the Stage, then back the same way.
    const stops: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => {
        const el = document.activeElement;
        if (el?.closest('[data-studio="tool-card"]')) return "card";
        if (el?.closest(".studio-area-stage")) return el.id || "stage";
        return el?.tagName.toLowerCase() ?? "none";
      });
      stops.push(where);
      if (where !== "card") break;
    }
    expect(stops.at(-1), `after the card comes the Stage (${stops.join(" → ")})`).toBe("studio-page-text");
    await page.keyboard.press("Shift+Tab");
    expect(
      await page.evaluate(() => Boolean(document.activeElement?.closest('[data-studio="tool-card"]'))),
      "Shift+Tab from the Stage goes back into the card",
    ).toBe(true);
  });

  test("1180×820, mid-take: the take stands at the card's foot as s03 sets it, the lock row just over the footnote", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET });
    await startTake(page);
    const card = page.locator(SEL.card);
    await settle(page);
    const c = await box(card);
    const lock = await box(card.locator('[data-studio="voice-lock"]'));
    const foot = await box(card.getByText(FOOTNOTE, { exact: true }));
    const disc = await box(card.locator(".studio-voice-disc"));
    // s03 (a 520 px card): the lock row ends 13 px over the footnote's rule; the disc's centre sits 56 % down.
    expect(foot.y - lock.bottom, "the lock row sits just over the footnote").toBeLessThanOrEqual(36);
    expect(foot.y - lock.bottom).toBeGreaterThanOrEqual(0);
    expect((disc.y + disc.height / 2 - c.y) / c.height, "the disc stands in the card's lower half").toBeGreaterThan(0.5);
    await stopTake(page);
  });

  test("a short laptop (1366×650, 1366×600): the footnote never leaves the card; only the card's body scrolls", async ({ page }) => {
    const SHORT_OK: Size = { width: 1366, height: 650 };
    const SHORT: Size = { width: 1366, height: 600 };
    await openTwinkle(page, { viewport: SHORT_OK });
    await tool(page, "Voice").click();
    const card = page.locator(SEL.card);
    const footnote = card.getByText(FOOTNOTE, { exact: true });
    const body = card.locator(".studio-voice-body");
    const scrolls = (l: Locator) => l.evaluate((el) => el.scrollHeight - el.clientHeight);

    for (const viewport of [SHORT_OK, SHORT]) {
      const where = `${viewport.width}×${viewport.height}`;
      await page.setViewportSize(viewport);
      await settle(page);
      expect(await scrolls(card), `${where}: the card itself never scrolls`).toBeLessThanOrEqual(1);
      const c = await box(card);
      const f = await box(footnote);
      expect(f.bottom, `${where}: the privacy footnote is inside the card`).toBeLessThanOrEqual(c.bottom + 0.5);
      expect(f.bottom, `${where}: …and on screen`).toBeLessThanOrEqual(viewport.height);
      const rec = await box(card.getByRole("button", { name: "Record it again" }));
      expect(rec.y, `${where}: the record button is in view`).toBeGreaterThanOrEqual(c.y);
      expect(rec.bottom, `${where}: the record button is in view`).toBeLessThanOrEqual(f.y);
    }

    // 650: everything fits, nothing scrolls.
    await page.setViewportSize(SHORT_OK);
    await settle(page);
    expect(await scrolls(body), "1366×650: the body fits").toBeLessThanOrEqual(1);
    const del = card.getByRole("button", { name: "Delete" });
    expect((await box(del)).bottom, "1366×650: Delete above the footnote").toBeLessThanOrEqual((await box(footnote)).y + 0.5);

    // 600: the body scrolls, and Delete scrolls into view above the footnote.
    await page.setViewportSize(SHORT);
    await settle(page);
    expect(await scrolls(body), "1366×600: the body is what scrolls").toBeGreaterThan(0);
    await del.scrollIntoViewIfNeeded();
    const d = await box(del);
    const b = await box(body);
    expect(d.bottom, "1366×600: Delete scrolls into view").toBeLessThanOrEqual(b.bottom + 0.5);
    expect(d.y).toBeGreaterThanOrEqual(b.y - 0.5);

    // Mid-take the body stops clipping and the live ring clears the lock row.
    await startTake(page);
    await settle(page);
    expect(await body.evaluate((el) => getComputedStyle(el).overflowY), "1366×600 mid-take: no clip").toBe("visible");
    const ring = await box(card.locator('[data-studio="voice-live-ring"]'));
    const lock = await box(card.locator('[data-studio="voice-lock"]'));
    const label = await box(card.locator('[data-studio="voice-record"] > span').last());
    expect(lock.y, "the live ring clears the lock row").toBeGreaterThanOrEqual(ring.bottom);
    expect(label.x - ring.right, "the live ring clears its name").toBeGreaterThanOrEqual(8);
    expect((await box(footnote)).bottom).toBeLessThanOrEqual((await box(card)).bottom + 0.5);
    await stopTake(page);
  });

  test("768–1023 keeps the floating card; below 768 the bottom sheet above the transport", async ({ page }) => {
    await openTwinkle(page, { viewport: BETWEEN });
    await tool(page, "Voice").click();
    const card = page.locator(SEL.card);
    await expect(card).toBeVisible();
    await settle(page);
    expect(await card.evaluate((el) => getComputedStyle(el).position)).toBe("absolute");
    const stage = await box(page.locator(SEL.stage));
    const cardBox = await box(card);
    expect(cardBox.x).toBeGreaterThanOrEqual(stage.x - 0.5);
    expect(cardBox.right).toBeLessThanOrEqual(stage.right + 0.5);
    expect(cardBox.bottom).toBeLessThanOrEqual(stage.bottom + 0.5);
    // The card comes before <main> in the DOM (focus order); it still paints above the Stage.
    const onTop = (b: Box) =>
      page.evaluate(
        ([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('[data-studio="tool-card"]')),
        [b.x + b.width / 2, b.y + b.height / 2],
      );
    expect(await onTop(cardBox), "the floating card paints above the Stage").toBe(true);

    await page.setViewportSize(PHONE);
    await settle(page);
    expect(await card.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
    const transport = await box(page.locator(SEL.transport));
    expect((await box(card)).bottom).toBeLessThanOrEqual(transport.y + 1);
    expect(await onTop(await box(card)), "the sheet paints above the Stage").toBe(true);
    await page.getByRole("button", { name: "Close Voice" }).click();
    await expect(card).toHaveCount(0);
  });
});

/* =================================================================== copy */

test.describe("T13a · the Voice card's words", () => {
  test("lock row, footnote, and the record button's three names", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET });
    await tool(page, "Voice").click();
    const card = page.locator(SEL.card);
    const lock = card.locator('[data-studio="voice-lock"]');
    await expect(lock).toBeVisible();
    await expect(lock).toHaveText(LOCK_ROW);
    const icon = lock.locator("svg.lucide-lock");
    await expect(icon).toHaveCount(1);
    expect(Math.round((await box(icon)).width)).toBe(14);
    await expect(card.getByText(FOOTNOTE, { exact: true })).toBeVisible();

    // Page 3 already has Mia's voice.
    await expect(card.getByRole("button", { name: "Record it again" })).toBeVisible();
    await startTake(page);
    await expect(card.getByRole("button", { name: /^Stop — 0:0\d$/ })).toBeVisible();
    await expect(card.getByText("Listening… tap again when you are done")).toBeVisible();
    await stopTake(page);

    // A new page has no voice yet.
    await addPage(page).click();
    await expect(page.getByRole("button", { name: /^Page 6\b.*selected/ })).toHaveCount(1);
    await expect(card.getByRole("button", { name: "Start recording" })).toBeVisible();
    await expect(card.getByText("Tap the red button and tell this page")).toBeVisible();
    expect(await card.innerText()).not.toMatch(PICTOGRAPH);
  });

  test("the microphone is switched off: verbatim recovery, Try again (Mic) and Keep writing instead (Pen)", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET, mic: "deny" });
    await recButton(page).click();
    const card = page.locator(SEL.card);
    await expect(card).toBeVisible();
    await expect(card.getByText(MIC_OFF.subtitle, { exact: true })).toBeVisible();
    await expect(card.getByText(MIC_OFF.headline, { exact: true })).toBeVisible();
    await expect(card.getByText(MIC_OFF.body, { exact: true })).toBeVisible();
    const retry = card.getByRole("button", { name: "Try again" });
    const write = card.getByRole("button", { name: "Keep writing instead" });
    await expect(retry).toBeVisible();
    await expect(write).toBeVisible();
    await expect(retry.locator("svg.lucide-mic")).toHaveCount(1);
    await expect(write.locator("svg.lucide-pen")).toHaveCount(1);
    expect(await card.innerText()).not.toMatch(PICTOGRAPH);
    await write.click();
    await expect(card).toHaveCount(0);
  });
});

/* ================================================================ top bar */

test.describe("T13a · top bar", () => {
  test("Exit with an arrow, the title centred in Fraunces with a faint pen", async ({ page }) => {
    for (const viewport of [TABLET, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport);
      if (viewport === TABLET) await openTwinkle(page, { viewport });
      const exit = page.getByRole("link", { name: "Leave the studio" });
      await expect(exit).toBeVisible();
      await expect(exit.locator("svg.lucide-arrow-left")).toHaveCount(1);
      await expect(exit).toHaveText("Exit");

      const title = page.locator(SEL.title);
      await expect(title.locator("#studio-title")).toHaveValue(TWINKLE.title);
      await expect(title.locator("svg.lucide-pen")).toHaveCount(1);
      const header = await box(page.locator("header"));
      const t = await box(title);
      expect(
        Math.abs(t.x + t.width / 2 - (header.x + header.width / 2)),
        `${viewport.width}: title centred`,
      ).toBeLessThanOrEqual(2);
      const font = await title.locator("#studio-title").evaluate((el) => getComputedStyle(el).fontFamily);
      expect(font.toLowerCase()).toContain("fraunces");
      // The whole title is readable, not clipped by its box.
      const clip = await title
        .locator("#studio-title")
        .evaluate((el) => (el as HTMLInputElement).scrollWidth - (el as HTMLInputElement).clientWidth);
      expect(clip).toBeLessThanOrEqual(1);
    }
  });

  test("768–1023: a long title ends in an ellipsis and its pen keeps 12+ px clear of SIMPLE; a size fallback", async ({ page }) => {
    await openTwinkle(page, { viewport: { width: 768, height: 1024 } });
    const input = page.locator("#studio-title");
    expect(Number(await input.getAttribute("size")), "sized where field-sizing is not supported").toBeGreaterThanOrEqual(
      TWINKLE.title.length,
    );
    for (const viewport of [
      { width: 768, height: 1024 },
      { width: 900, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      await settle(page);
      const where = `${viewport.width}×${viewport.height}`;
      expect(await input.evaluate((el) => getComputedStyle(el).textOverflow), `${where}: ellipsis`).toBe("ellipsis");
      const pen = await box(page.locator(SEL.title).locator("svg.lucide-pen"));
      const mode = await box(page.locator('[data-sk="mode"]'));
      expect(mode.x - pen.right, `${where}: the pen keeps clear of SIMPLE`).toBeGreaterThanOrEqual(12);
      expect(pen.y, `${where}: the title stays on the bar's one row`).toBeLessThan(mode.bottom);
    }
  });

  test("while recording Finish is disabled with \"after this take\" under it; both go when the take stops", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET });
    const finish = page.getByRole("button", { name: "Finish my story" });
    const note = page.locator(SEL.finishNote);
    await expect(finish).toBeEnabled();
    await expect(note).toHaveCount(0);

    await startTake(page);
    await expect(finish).toBeDisabled();
    await expect(note).toBeVisible();
    await expect(note).toHaveText("after this take");
    expect(await note.evaluate((el) => (el as HTMLElement).innerText)).toBe("AFTER THIS TAKE");
    expect(await note.evaluate((el) => getComputedStyle(el).fontFamily.toLowerCase())).toMatch(/plex|mono/);
    const f = await box(finish);
    const n = await box(note);
    expect(n.y, "the note sits under Finish").toBeGreaterThanOrEqual(f.bottom - 1);
    expect(Math.abs(n.x + n.width / 2 - (f.x + f.width / 2))).toBeLessThanOrEqual(4);
    expect(n.bottom, "inside the top bar").toBeLessThanOrEqual((await box(page.locator("header"))).bottom + 0.5);

    await stopTake(page);
    await expect(note).toHaveCount(0);
    await expect(finish).toBeEnabled();
  });
});

/* =============================================================== honesty */

test.describe("T13a · honesty and motion", () => {
  test("no Idea items: no mascot, no Hear it, no Idea or Next, idle and recording", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET });
    await tool(page, "Voice").click();
    const check = async (when: string) => {
      await expect(page.getByText("Hear it"), `${when}: Hear it`).toHaveCount(0);
      await expect(page.getByText(/^Idea$/), `${when}: Idea`).toHaveCount(0);
      await expect(page.getByText(/^Next$/), `${when}: Next`).toHaveCount(0);
      await expect(page.locator('img[src*="icon.png"]'), `${when}: mascot`).toHaveCount(0);
    };
    await check("idle");
    await startTake(page);
    await check("recording");
    await stopTake(page);
  });

  test("nothing loops but reels during a take", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET });
    await startTake(page);
    await expect(page.locator(SEL.pill)).toHaveText(/0:0[1-9]$/, { timeout: 8000 });
    const loops = await infiniteAnimations(page);
    expect(loops.length, "the reels turn during a take").toBeGreaterThan(0);
    expect(loops.filter((a) => !a.inReel), "only reels loop").toEqual([]);
    await stopTake(page);
  });

  test("reduced motion: no reel spins, the ring has no transition, the docked card does not animate", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET, reducedMotion: true });
    await tool(page, "Voice").click();
    const card = page.locator(SEL.card);
    await expect(card).toBeVisible();
    expect(await card.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");

    await startTake(page);
    const ring = page.locator(SEL.ring);
    await expect(ring).toHaveAttribute("data-active", "true");
    const transitions = await ring.evaluate((el) => getComputedStyle(el).transitionDuration.split(",").map((s) => s.trim()));
    for (const d of transitions) expect(d).toBe("0s");

    const reels = await page.locator('[data-sk="reel"] svg').evaluateAll((els) =>
      els.map((el) => ({
        name: getComputedStyle(el).animationName,
        running: el.getAnimations().filter((a) => a.playState === "running").length,
      })),
    );
    expect(reels.length).toBeGreaterThan(0);
    for (const r of reels) expect(r).toEqual({ name: "none", running: 0 });
    expect(await infiniteAnimations(page)).toEqual([]);
    await stopTake(page);
  });
});

/* ======================================================== M6 · s03 chrome */
//
// The s03 critic panel (M6, group E): the Transport while a take records
// (only REC is live, and it is the stop square in the armed ring), the deck
// the reference draws (inset panel, reels in a capsule, one mono readout
// line), honest and legible readout text, the title's 22 px, the waiting
// Finish, and the Stage's cream words.

const transport = (page: Page) => page.locator(SEL.transport);
const readout = (page: Page) => page.locator('[data-studio="transport-readout"]');

/** Parse a computed `rgb()/rgba()` colour (computed colours are stable across minifiers). */
function rgba(css: string): [number, number, number, number] {
  const n = css.match(/[\d.]+/g)?.map(Number) ?? [];
  return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1];
}

/**
 * Read a style once it stops moving: polls until two readings a frame apart
 * agree, so an eased colour is never caught mid-transition.
 */
async function steady<T>(locator: Locator, read: (el: Element) => T): Promise<T> {
  let value: T | undefined;
  await expect
    .poll(
      async () => {
        const a = JSON.stringify(await locator.evaluate(read));
        await locator.page().evaluate(
          () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        value = await locator.evaluate(read);
        return a === JSON.stringify(value);
      },
      { timeout: 3000, intervals: [50, 100, 100, 200] },
    )
    .toBe(true);
  return value as T;
}

/**
 * WCAG contrast of an element's text against what is actually under it: the
 * element's and every ancestor's background colour, composited over the room
 * (the gradients in the room are ignored; they are faint and the margin is
 * wide).
 */
async function contrastOf(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    const parse = (css: string) => {
      const n = css.match(/[\d.]+/g)?.map(Number) ?? [];
      return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n.length > 3 ? n[3] : 1] as [number, number, number, number];
    };
    const layers: [number, number, number, number][] = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 1) break;
    }
    let bg: [number, number, number] = [255, 255, 255];
    for (const [r, g, b, a] of layers.reverse()) {
      bg = [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a)];
    }
    const fgc = parse(getComputedStyle(el).color);
    const fg: [number, number, number] = [
      fgc[0] * fgc[3] + bg[0] * (1 - fgc[3]),
      fgc[1] * fgc[3] + bg[1] * (1 - fgc[3]),
      fgc[2] * fgc[3] + bg[2] * (1 - fgc[3]),
    ];
    const lum = ([r, g, b]: [number, number, number]) => {
      const ch = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  });
}

test.describe("M6 · s03 transport during a take", () => {
  test("only REC is live mid-take: Play is disabled and a forced press plays nothing into the open mic", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET });
    const play = page.getByRole("button", { name: "Play the story" });
    await expect(play).toBeEnabled();
    await startTake(page);
    await expect(play).toBeDisabled();
    await expect(transport(page).locator('[data-kind="prev"]')).toBeDisabled();
    await expect(transport(page).locator('[data-kind="next"]')).toBeDisabled();
    await play.click({ force: true });
    await page.waitForTimeout(400);
    await expect(page.locator(".studio[data-recording='true']"), "the take goes on").toHaveCount(1);
    await expect(page.getByRole("button", { name: "Stop playing" })).toHaveCount(0);
    const sounding = await page.evaluate(() =>
      Array.from(document.querySelectorAll("audio")).filter((a) => !a.paused).length,
    );
    expect(sounding, "no <audio> plays during the take").toBe(0);
    await stopTake(page);
    await expect(play).toBeEnabled();
  });

  test("REC wears the stop square in its armed ring mid-take; one name per state, no aria-pressed; Enter starts and stops", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET });
    const idle = page.getByRole("button", { name: "Record my voice on this page" });
    await expect(idle).toHaveAttribute("data-kind", "rec");
    await expect(idle.locator("svg circle")).toHaveCount(1);
    expect(await idle.getAttribute("aria-pressed"), "idle REC is not a pressed toggle").toBeNull();

    // keyboard: the same key, focused, starts and stops the take
    await idle.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);
    const stop = page.getByRole("button", { name: "Stop recording" });
    await expect(stop).toHaveAttribute("data-kind", "stop");
    await expect(stop.locator("svg rect")).toHaveCount(1);
    await expect(stop.locator("svg circle")).toHaveCount(0);
    expect(await stop.getAttribute("aria-pressed"), "the name changes; aria-pressed does not ride along").toBeNull();
    // The kit eases the key's border and colour over ~240 ms: read the ring at
    // rest (transitions landed, then two readings a frame apart that agree).
    await settle(page);
    const ring = await steady(stop, (el) => {
      const cs = getComputedStyle(el);
      return {
        width: parseFloat(cs.borderTopWidth),
        color: cs.borderTopColor,
        shadow: cs.boxShadow,
        anim: cs.animationName,
        fill: getComputedStyle(el.querySelector("svg") as Element).fill,
      };
    });
    expect(ring.width, "the armed ring").toBeGreaterThanOrEqual(2.5);
    const [r, g, b] = rgba(ring.color);
    expect(r > 200 && g < 100 && b < 80, `the ring is tape-red (${ring.color})`).toBe(true);
    expect(ring.shadow).not.toBe("none");
    expect(ring.anim, "a still ring: nothing loops in the Studio").toBe("none");
    // the stop square is red too
    const glyph = rgba(ring.fill);
    expect(glyph[0] > 200 && glyph[1] < 110, "a red stop square").toBe(true);

    await stop.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByRole("button", { name: "Record my voice on this page" })).toHaveAttribute("data-kind", "rec");
  });
});

test.describe("M6 · s03 the transport is a deck", () => {
  test("1180×820: inset on the strip's column, rounded; reels in a capsule; one readout line, `0:0n · pg 3/5` tape-red mid-take", async ({ page }) => {
    for (const viewport of [TABLET, { width: 1024, height: 768 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport);
      if (viewport === TABLET) await openTwinkle(page, { viewport });
      await settle(page);
      const where = `${viewport.width}×${viewport.height}`;
      const m = await page.evaluate(([t, p]) => {
        const tr = document.querySelector(t) as HTMLElement;
        const pg = document.querySelector(p) as HTMLElement;
        const a = tr.getBoundingClientRect();
        const b = pg.getBoundingClientRect();
        const ps = getComputedStyle(pg);
        const ts = getComputedStyle(tr);
        return {
          t: { left: a.left, right: a.right, bottom: a.bottom },
          strip: { left: b.left + parseFloat(ps.paddingLeft), right: b.right - parseFloat(ps.paddingRight) },
          radius: parseFloat(ts.borderTopLeftRadius),
          pad: [ts.paddingTop, ts.paddingRight, ts.paddingBottom, ts.paddingLeft].map(parseFloat),
          fill: ts.backgroundColor,
          border: [ts.borderTopWidth, ts.borderBottomWidth, ts.borderLeftWidth].map(parseFloat),
          borderColor: ts.borderLeftColor,
          vh: window.innerHeight,
        };
      }, [SEL.transport, SEL.pages] as const);
      // the deck's own padding and glass-dark fill — no phone-bar utility pins
      // them (utilities beat the layered studio.css rules)
      expect(m.pad, `${where}: the deck's padding`).toEqual([11, 22, 11, 22]);
      const fill = rgba(m.fill);
      expect(
        Math.abs(fill[0] - 8) <= 1 && Math.abs(fill[1] - 11) <= 1 && Math.abs(fill[2] - 21) <= 1 && Math.abs(fill[3] - 0.62) <= 0.01,
        `${where}: glass-dark fill (${m.fill})`,
      ).toBe(true);
      expect(m.border, `${where}: a hairline all round`).toEqual([1, 1, 1]);
      const line = rgba(m.borderColor);
      expect(line[0] === 255 && Math.abs(line[3] - 0.1) <= 0.01, `${where}: --ss-line (${m.borderColor})`).toBe(true);
      expect(Math.abs(m.t.left - m.strip.left), `${where}: left edge on the strip's column`).toBeLessThanOrEqual(2);
      expect(Math.abs(m.t.right - m.strip.right), `${where}: right edge on the strip's column`).toBeLessThanOrEqual(2);
      expect(m.radius, `${where}: a rounded deck`).toBeGreaterThanOrEqual(16);
      expect(m.vh - m.t.bottom, `${where}: off the foot`).toBeGreaterThanOrEqual(8);

      const deck = transport(page).locator('[data-studio="transport-deck"]');
      await expect(deck.locator('[data-sk="reel"]')).toHaveCount(2);
      const cap = await deck.evaluate((el) => ({ radius: parseFloat(getComputedStyle(el).borderTopLeftRadius), h: el.getBoundingClientRect().height, bg: getComputedStyle(el).backgroundColor }));
      expect(cap.radius, `${where}: the reels sit in a capsule`).toBeGreaterThanOrEqual(cap.h / 2 - 1);
      expect(rgba(cap.bg)[3], `${where}: a dark capsule`).toBe(1);
    }
    // A short laptop: the deck slims to 8 px top and bottom (both edges, not
    // just the foot) and keeps its 22 px sides; the room still fits whole.
    for (const viewport of [{ width: 1366, height: 650 }, { width: 1366, height: 600 }]) {
      await page.setViewportSize(viewport);
      await settle(page);
      const pad = await transport(page).evaluate((el) => {
        const ts = getComputedStyle(el);
        return [ts.paddingTop, ts.paddingRight, ts.paddingBottom, ts.paddingLeft].map(parseFloat);
      });
      const where2 = `${viewport.width}×${viewport.height}`;
      expect(pad, `${where2}: the slim deck`).toEqual([8, 22, 8, 22]);
      // nothing scrolls, the deck is whole on screen, and its band (deck plus
      // the 6 px under it) is no taller than the 85 px full-bleed bar it
      // replaced, so the Stage loses nothing to it
      const fit = await page.evaluate(([t]) => {
        const tr = (document.querySelector(t) as HTMLElement).getBoundingClientRect();
        const area = (document.querySelector(t) as HTMLElement).parentElement!.getBoundingClientRect();
        return {
          sh: document.documentElement.scrollHeight,
          sw: document.documentElement.scrollWidth,
          vh: window.innerHeight,
          vw: window.innerWidth,
          bottom: tr.bottom,
          band: area.bottom - tr.top,
        };
      }, [SEL.transport] as const);
      expect(fit.sh, `${where2}: the page scrolls`).toBeLessThanOrEqual(fit.vh);
      expect(fit.sw, `${where2}: the page scrolls sideways`).toBeLessThanOrEqual(fit.vw);
      expect(fit.bottom, `${where2}: the deck is on screen`).toBeLessThanOrEqual(fit.vh + 0.5);
      expect(fit.band, `${where2}: the deck's band`).toBeLessThanOrEqual(85.5);
    }
    await page.setViewportSize(TABLET);
    await settle(page);
    const lines = async () =>
      readout(page).evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        // one line box: every fragment's middle within 4 px of the first's (a
        // fallback glyph such as the dash may sit a hair higher or lower)
        const mids = Array.from(range.getClientRects())
          .filter((r) => r.width > 0)
          .map((r) => r.top + r.height / 2);
        return 1 + mids.filter((m) => Math.abs(m - mids[0]) > 4).length;
      });
    await page.evaluate(() => document.fonts.ready);
    expect(await lines(), "idle: one readout line").toBe(1);
    expect(await readout(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBe(13);

    await startTake(page);
    await expect(readout(page)).toHaveText(/^● 0:0\d · pg 3\/5$/i);
    await expect(readout(page)).toHaveText(/0:0[2-9] · pg 3\/5/i, { timeout: 8000 });
    expect(await lines(), "mid-take: one readout line").toBe(1);
    const red = rgba(await readout(page).evaluate((el) => getComputedStyle(el).color));
    expect(red[0] > 240 && red[1] < 120 && red[2] < 100, "tape-red while recording").toBe(true);
    await stopTake(page);
  });

  test("375×812: no sideways scroll; the readout keeps 12+ px clear of the keys", async ({ page }) => {
    await openTwinkle(page, { viewport: PHONE });
    for (const when of ["idle", "recording"] as const) {
      if (when === "recording") await startTake(page);
      await settle(page);
      const m = await page.evaluate(([t]) => {
        const tr = document.querySelector(t) as HTMLElement;
        const out = tr.querySelector('[data-studio="transport-readout"]') as HTMLElement;
        const keys = Array.from(tr.querySelectorAll('[data-sk="transport"]')).map((k) => k.getBoundingClientRect());
        const range = document.createRange();
        range.selectNodeContents(out);
        const text = Array.from(range.getClientRects()).filter((r) => r.width > 0);
        return {
          sw: document.documentElement.scrollWidth,
          keysRight: Math.max(...keys.map((k) => k.right)),
          textLeft: Math.min(...text.map((r) => r.left)),
          textRight: Math.max(...text.map((r) => r.right)),
          vw: window.innerWidth,
        };
      }, [SEL.transport] as const);
      expect(m.sw, `${when}: no sideways scroll`).toBeLessThanOrEqual(PHONE.width);
      expect(m.textLeft - m.keysRight, `${when}: readout clear of the last key`).toBeGreaterThanOrEqual(12);
      expect(m.textRight, `${when}: readout on screen`).toBeLessThanOrEqual(m.vw);
    }
    await stopTake(page);
  });

  test("honest readout: a length nobody knows is a dash, never `/ 0:00`", async ({ page }) => {
    // page 1 of a fresh studio has no voice at all
    await page.setViewportSize(TABLET);
    await page.goto("/studio");
    await expect(readout(page)).toContainText("pg 1/");
    await expect(readout(page)).not.toContainText("/ 0:00");
    await expect(readout(page)).toContainText("0:00 / —");
    // Twinkle page 3 has a voice: never `/ 0:00`, never a dash — its own
    // length, 0:06 (the Studio passes the page's measured duration).
    await openTwinkle(page, { viewport: TABLET });
    await expect(readout(page)).not.toContainText("/ 0:00");
    await expect(readout(page)).toHaveText(/^0:00 \/ 0:06 · pg 3\/5$/);
  });

  for (const viewport of [TABLET, PHONE]) {
  test(`${viewport.width}×${viewport.height}: the readout passes WCAG AA (4.5:1) on its bar, idle and mid-take`, async ({ page }) => {
    {
      await openTwinkle(page, { viewport });
      const where = `${viewport.width}×${viewport.height}`;
      for (const part of ["transport-time", "transport-page"]) {
        const c = await contrastOf(transport(page).locator(`[data-studio="${part}"]`));
        expect(c, `${where} idle: ${part} ${c.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
      await startTake(page);
      for (const part of ["transport-time", "transport-page"]) {
        const c = await contrastOf(transport(page).locator(`[data-studio="${part}"]`));
        expect(c, `${where} recording: ${part} ${c.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
      await stopTake(page);
    }
  });
  }
});

test.describe("M6 · the Voice card's footnote is legible", () => {
  for (const viewport of [TABLET, PHONE]) {
    test(`${viewport.width}×${viewport.height}: the privacy footnote passes WCAG AA (4.5:1), idle and mid-take`, async ({ page }) => {
      await openTwinkle(page, { viewport });
      const where = `${viewport.width}×${viewport.height}`;
      await tool(page, "Voice").click();
      const footnote = page.locator(SEL.card).getByText(FOOTNOTE, { exact: true });
      await expect(footnote).toBeVisible();
      await settle(page);
      const idle = await contrastOf(footnote);
      expect(idle, `${where} idle: ${idle.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      await startTake(page);
      await expect(footnote).toBeVisible();
      await settle(page);
      const live = await contrastOf(footnote);
      expect(live, `${where} recording: ${live.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      await stopTake(page);
    });
  }
});

test.describe("M6 · s03 top bar and Stage words", () => {
  test("the title is Fraunces 22 px from 1180 (1180×820, 1280×720); the pen keeps 12+ px clear of SIMPLE at 1180 and 1024", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET });
    for (const viewport of [TABLET, { width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(viewport);
      await settle(page);
      await page.evaluate(() => document.fonts.ready);
      const where = `${viewport.width}×${viewport.height}`;
      const input = page.locator("#studio-title");
      const size = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      if (viewport.width >= 1180) {
        expect(size, `${where}: 22 px`).toBe(22);
        expect(await input.evaluate((el) => getComputedStyle(el).fontWeight)).toBe("700");
      }
      const pen = await box(page.locator(SEL.title).locator("svg.lucide-pen"));
      const mode = await box(page.locator('[data-sk="mode"]'));
      expect(mode.x - pen.right, `${where}: the pen keeps clear of SIMPLE`).toBeGreaterThanOrEqual(12);
      const clip = await input.evaluate((el) => (el as HTMLInputElement).scrollWidth - (el as HTMLInputElement).clientWidth);
      if (viewport.width >= 1180) expect(clip, `${where}: the whole title shows`).toBeLessThanOrEqual(1);
    }
  });

  test("mid-take Finish waits as s03's tinted-gold outline, not a dimmed gold block", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET });
    await startTake(page);
    const finish = page.getByRole("button", { name: "Finish my story" });
    await expect(finish).toBeDisabled();
    await settle(page); // the kit eases colours over 220 ms: read them at rest
    const s = await finish.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { opacity: cs.opacity, bg: cs.backgroundColor, image: cs.backgroundImage, color: cs.color, border: cs.borderTopColor };
    });
    expect(s.opacity).toBe("1");
    expect(s.image).toBe("none");
    const bg = rgba(s.bg);
    expect(bg[3], `a tinted fill (${s.bg})`).toBeLessThanOrEqual(0.2);
    expect(bg[3]).toBeGreaterThan(0);
    const text = rgba(s.color);
    expect(text[0] > 230 && text[1] > 150 && text[2] < 120, `gold words (${s.color})`).toBe(true);
    expect(text[3]).toBeLessThan(1);
    const border = rgba(s.border);
    expect(border[0] > 230 && border[3] > 0 && border[3] < 0.6, `a gold hairline (${s.border})`).toBe(true);
    await stopTake(page);
  });

  test("the Stage's words are the reference cream, balanced, in a measure no wider than 640 px", async ({ page }) => {
    await openTwinkle(page, { viewport: TABLET });
    const words = page.locator("#studio-page-text");
    const s = await words.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.color, wrap: cs.getPropertyValue("text-wrap-style") || cs.getPropertyValue("text-wrap"), width: el.getBoundingClientRect().width };
    });
    expect(s.color).toBe("rgb(243, 230, 200)");
    expect(s.wrap).toContain("balance");
    expect(s.width).toBeLessThanOrEqual(640.5);
    await expectRoomFits(page, "1180×820 words");
  });
});
