/**
 * C5's judge (archipelago-2 mission, phase P2): no route scrolls sideways and no control is
 * clipped or overlapped at 320-1440 px wide and on landscape phones; in landscape the Stage
 * photo stays visible (idea.lock C5; judges/required-P2.json needs 35 passing on desktop).
 *
 * For every screen state below, at every listed size:
 *   - document scrollWidth must not exceed innerWidth (no sideways scroll);
 *   - every visible interactive control must lie inside the viewport horizontally, and at its
 *     centre the topmost element must be the control itself or inside it (nothing overlaps it);
 *   - on the Studio with a photo, in landscape, at rest and mid-take (the Voice sheet open),
 *     at least 120 px of the Stage photo's height is on screen and uncovered: sampled down its
 *     middle, the photo (or its frame) is the topmost element there (P2 review P2-R1-01).
 * A control is "visible" when it has a box, is not visibility:hidden or opacity:0, and is not
 * inside an inert or aria-hidden subtree; a disabled control is locked, not judged; while a
 * dialog is open only the controls inside it are judged. Off-screen parts of a horizontally scrolling strip
 * (the Filmstrip) are judged by their scroll container, not the viewport, and content that has
 * scrolled under fixed or sticky chrome is not "overlapped" while scrolling can still uncover
 * it: under top chrome when the page can scroll up, under bottom chrome when it can scroll
 * down (P2-R1-02).
 */

import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { restoreDraft, seedDeviceLibrary, seedStudioDraft } from "./fixtures/helpers";
import { stubMicrophone } from "./fixtures/mic";

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

type Screen = { name: string; open: (page: Page) => Promise<void>; photo?: boolean; stop?: boolean; words?: boolean };

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
  {
    name: "studio (recording a take)",
    photo: true,
    open: async (page) => {
      await stubMicrophone(page);
      await seedStudioDraft(page, "twinkle", { narration: false });
      await page.goto("/studio");
      await restoreDraft(page);
      await expect(page.locator('[data-studio="stage-photo"]')).toBeVisible({ timeout: 15000 });
      await page.getByRole("button", { name: "Record my voice on this page" }).click();
      await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);
      await page.waitForTimeout(500); // the sheet rises as it opens; judge where it lands
    },
  },
  {
    name: "studio (recording, Voice card closed)",
    photo: true,
    stop: true,
    words: true,
    open: async (page) => {
      await stubMicrophone(page);
      await seedStudioDraft(page, "twinkle", { narration: false });
      await page.goto("/studio");
      await restoreDraft(page);
      await expect(page.locator('[data-studio="stage-photo"]')).toBeVisible({ timeout: 15000 });
      await page.getByRole("button", { name: "Record my voice on this page" }).click();
      await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);
      await page.waitForTimeout(500);
      // the state is the card closed, never silently the card open (P2-R3-03)
      const close = page.getByRole("button", { name: "Close Voice" });
      await expect(close).toBeVisible();
      await close.click();
      await expect(page.locator('[data-studio="tool-card"]')).toHaveCount(0);
      await expect(page.locator(".studio[data-recording='true']"), "closing the card does not end the take").toHaveCount(1);
      await page.waitForTimeout(300);
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
    // an open dialog (the Voice sheet mid-take) is on top by design: judge the controls in it
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]')).filter((d) => {
      const r = d.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !hidden(d);
    });
    for (const el of Array.from(document.querySelectorAll(SEL))) {
      if (el.closest("nextjs-portal")) continue; // the dev overlay, absent in production
      if (dialogs.length && !dialogs.some((d) => d.contains(el))) continue;
      if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") continue; // locked, not laid out to be used
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
      // the Filmstrip's sticky handle covers a thumbnail only until the strip scrolls the way
      // that clears it: a handle on the strip's left needs scrollLeft > 0, on its right room
      // still to scroll (P2-R2-03)
      if (hit && strip && strip.contains(hit) && pinned(hit)) {
        const s = strip.getBoundingClientRect();
        const h = hit.getBoundingClientRect();
        const onLeft = h.left + h.width / 2 < s.left + s.width / 2;
        if (onLeft ? strip.scrollLeft > 0 : strip.scrollLeft < strip.scrollWidth - strip.clientWidth - 1) continue;
        // the strip cannot scroll the way that clears it: a real overlap, never passed on to
        // the page-level chrome rule below (P2-R3-01)
        problems.push({ what: `covered at its centre by the strip's pinned "${describe(hit)}", which no scroll clears`, label });
        continue;
      }
      if (hit && pinned(hit) && !pinned(el)) {
        const chrome = hit.getBoundingClientRect();
        const maxY = document.documentElement.scrollHeight - vh;
        const underTop = chrome.top + chrome.height / 2 < vh / 2;
        if (underTop ? window.scrollY > 0 : window.scrollY < maxY - 1) continue;
      }
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
        if (screen.stop) {
          // mid-take there is always a Stop on screen, uncovered (P2-R2-01)
          const stops = await page.evaluate(() =>
            Array.from(document.querySelectorAll("button")).filter((b) => {
              const name = (b.getAttribute("aria-label") || b.innerText || "").trim();
              if (!/^Stop/.test(name)) return false;
              const r = b.getBoundingClientRect();
              if (r.width < 1 || r.height < 1 || r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight) return false;
              const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              return !!hit && (hit === b || b.contains(hit));
            }).length,
          );
          expect(stops, `${screen.name} at ${size.name}: a Stop on screen and uncovered`).toBeGreaterThan(0);
        }
        if (screen.words) {
          // mid-take, card closed: the page's words are on screen, whole line visible and
          // uncovered (P2-R3-02, P3-R1-01)
          const words = page.locator('[data-studio="stage-text"] textarea');
          await expect(words, `${screen.name} at ${size.name}: the page's words are shown`).toBeVisible();
          expect((await words.inputValue()).trim().length, "the words are the page's").toBeGreaterThan(0);
          const top = await words.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 12));
            return r.height >= 16 && r.top >= 0 && r.bottom <= innerHeight + 0.5 && !!hit && (hit === el || el.contains(hit));
          });
          expect(top, `${screen.name} at ${size.name}: the words are on screen and uncovered`).toBe(true);
        }
        if (screen.photo && size.width > size.height) {
          const seen = await page.locator('[data-studio="stage-photo"]').evaluate((photo) => {
            const r = photo.getBoundingClientRect();
            const frame = photo.closest('[data-sk="listening-ring"]') ?? photo;
            const x = r.left + r.width / 2;
            let rows = 0;
            for (let y = Math.max(0, Math.ceil(r.top)); y < Math.min(window.innerHeight, r.bottom); y += 1) {
              const hit = document.elementFromPoint(x, y);
              if (hit && (hit === photo || frame.contains(hit))) rows += 1;
            }
            return rows;
          });
          expect(seen, `${screen.name} at ${size.name}: px of the Stage photo on screen and uncovered`).toBeGreaterThanOrEqual(120);
        }
      });
    }
  });
}
