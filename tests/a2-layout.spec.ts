/**
 * C5's judge (archipelago-2 mission, phase P2): no route scrolls sideways and no control is
 * clipped or overlapped at 320-1440 px wide and on landscape phones; in landscape the Stage
 * photo stays visible (idea.lock C5; judges/required-P2.json needs 35 passing on desktop).
 *
 * For every screen state below, at every listed size:
 *   - document scrollWidth must not exceed innerWidth (no sideways scroll);
 *   - every visible interactive control must lie inside the viewport horizontally, and at its
 *     centre the topmost element must be the control itself or inside it (nothing overlaps it);
 *   - on the Studio with a photo, in landscape, the Stage photo is at least 120 px tall.
 * A control is "visible" when it has a box, is not visibility:hidden or opacity:0, and is not
 * inside an inert or aria-hidden subtree. Off-screen parts of a horizontally scrolling strip
 * (the Filmstrip) are judged by their scroll container, not the viewport, and content that has
 * scrolled under fixed or sticky chrome (a header) is not "overlapped": scrolling reaches it.
 */

import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { restoreDraft, seedDeviceLibrary, seedStudioDraft } from "./fixtures/helpers";

const SIZES = [
  { name: "320", width: 320, height: 640 },
  { name: "375", width: 375, height: 812 },
  { name: "414", width: 414, height: 896 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1280", width: 1280, height: 720 },
  { name: "1440", width: 1440, height: 900 },
  { name: "landscape 844x390", width: 844, height: 390 },
  { name: "landscape 667x375", width: 667, height: 375 },
] as const;

type Screen = { name: string; open: (page: Page) => Promise<void>; photo?: boolean };

const settle = async (page: Page) => {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForTimeout(400);
};

const SCREENS: Screen[] = [
  { name: "landing", open: async (page) => void (await page.goto("/")) },
  { name: "read room", open: async (page) => void (await page.goto("/read")) },
  {
    name: "player",
    open: async (page) => {
      const code = randomBytes(16).toString("hex");
      await seedDeviceLibrary(page, "twinkle", { shareCode: code });
      await page.goto(`/read?story=${code}`);
      const root = page.locator(".pl-root");
      await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
      await page.getByRole("button", { name: /Tap to Begin/ }).click();
      await expect(root).toHaveAttribute("data-view", "page");
    },
  },
  { name: "studio (empty)", open: async (page) => void (await page.goto("/studio")) },
  {
    name: "studio (a tape with photos)",
    photo: true,
    open: async (page) => {
      await seedStudioDraft(page, "twinkle", { narration: false });
      await page.goto("/studio");
      await restoreDraft(page);
      await expect(page.locator('[data-studio="stage-photo"]')).toBeVisible({ timeout: 15000 });
    },
  },
  { name: "protocol", open: async (page) => void (await page.goto("/protocol")) },
];

interface Problem {
  what: string;
  label: string;
}

async function layoutProblems(page: Page): Promise<{ scrollWidth: number; innerWidth: number; problems: Problem[] }> {
  return page.evaluate(() => {
    const problems: { what: string; label: string }[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const SEL = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="slider"], [role="tab"], [role="link"], [tabindex]:not([tabindex="-1"])';
    const describe = (el: Element) =>
      (el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.getAttribute("title") || el.tagName)
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 50);
    const hidden = (el: Element): boolean => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        if (n.hasAttribute("inert") || n.getAttribute("aria-hidden") === "true") return true;
        const cs = getComputedStyle(n);
        if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return true;
      }
      return false;
    };
    const pinned = (el: Element): boolean => {
      for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
        const pos = getComputedStyle(n).position;
        if (pos === "fixed" || pos === "sticky") return true;
      }
      return false;
    };
    const scroller = (el: Element): Element | null => {
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const ox = getComputedStyle(n).overflowX;
        if ((ox === "auto" || ox === "scroll") && n.scrollWidth > n.clientWidth) return n;
      }
      return null;
    };
    const clipRect = (el: Element): DOMRect | null => {
      // an ancestor with overflow hidden or clip whose box cuts the control
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.overflowX === "hidden" || cs.overflowX === "clip" || cs.overflow === "hidden") return n.getBoundingClientRect();
      }
      return null;
    };
    for (const el of Array.from(document.querySelectorAll(SEL))) {
      if (el.closest("nextjs-portal")) continue; // the dev overlay, absent in production
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || hidden(el)) continue;
      // screen-reader-only controls (1x1 clipped) and skip links are not laid-out controls
      const cs = getComputedStyle(el);
      if (cs.clip === "rect(0px, 0px, 0px, 0px)" || cs.clipPath === "inset(50%)") continue;
      if (r.width <= 2 && r.height <= 2) continue;
      const label = describe(el);
      const strip = scroller(el);
      if (strip) {
        const s = strip.getBoundingClientRect();
        if (r.left >= s.right || r.right <= s.left) continue; // scrolled out of its strip, by design
      } else if (r.left < -0.5 || r.right > vw + 0.5) {
        problems.push({ what: `off-screen sideways (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`, label });
        continue;
      }
      const clip = clipRect(el);
      if (clip && !strip && (r.left < clip.left - 0.5 || r.right > clip.right + 0.5)) {
        problems.push({ what: `clipped by an ancestor (${Math.round(r.left)}..${Math.round(r.right)} in ${Math.round(clip.left)}..${Math.round(clip.right)})`, label });
        continue;
      }
      // overlap: the topmost element at the visible part's centre must be this control or inside it
      const top = Math.max(r.top, 0);
      const bottom = Math.min(r.bottom, vh);
      if (bottom - top < 1) continue; // below the fold: reachable by scrolling, judged when scrolled there
      const left = Math.max(r.left, strip ? strip.getBoundingClientRect().left : 0);
      const right = Math.min(r.right, strip ? strip.getBoundingClientRect().right : vw);
      const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
      if (hit?.closest("nextjs-portal")) continue; // the dev overlay, absent in production
      // content scrolled under fixed or sticky chrome (a header) is reachable by scrolling on
      if (hit && pinned(hit) && !pinned(el)) continue;
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
        const by = describe(hit) || hit.tagName;
        problems.push({ what: `covered at its centre by <${hit.tagName.toLowerCase()}> "${by}"`, label });
      }
    }
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth: vw, problems };
  });
}

/** Judge the page at each scroll position a reader reaches, top to bottom. */
async function judge(page: Page, where: string) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = await page.evaluate(() => window.innerHeight);
  const all: string[] = [];
  for (let y = 0; y < height; y += Math.max(200, vh - 80)) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);
    const { scrollWidth, innerWidth, problems } = await layoutProblems(page);
    expect(scrollWidth, `${where}: the page scrolls sideways (${scrollWidth} > ${innerWidth})`).toBeLessThanOrEqual(innerWidth);
    for (const p of problems) all.push(`@${y}px "${p.label}": ${p.what}`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  expect([...new Set(all)], `${where}: controls clipped, off-screen or overlapped`).toEqual([]);
}

for (const screen of SCREENS) {
  test.describe(`layout › ${screen.name}`, () => {
    for (const size of SIZES) {
      test(`${size.name}: no sideways scroll, no control clipped or overlapped`, async ({ page }) => {
        test.setTimeout(60000);
        await page.setViewportSize({ width: size.width, height: size.height });
        await screen.open(page);
        await settle(page);
        await judge(page, `${screen.name} at ${size.name}`);
        if (screen.photo && size.width > size.height) {
          const box = await page.locator('[data-studio="stage-photo"]').boundingBox();
          expect(box, "the Stage photo is laid out").not.toBeNull();
          expect(box!.height, `${size.name}: the landscape Stage photo is at least 120 px tall`).toBeGreaterThanOrEqual(120);
        }
      });
    }
  });
}
