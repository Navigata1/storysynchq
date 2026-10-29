/**
 * M6 · /protocol (s08) — the fidelity sweep's fixes, pinned.
 *
 *   1. Figures are numbered once each, in order (FIG. 1 the plates, Fig. 2
 *      the seven-layer diagram, Fig. 3 the archive), and only FIG. 1 — drawn
 *      01 at the bottom — says "each layer above".
 *   2. Keyboard focus is never hidden under the sticky bar (WCAG 2.2 SC
 *      2.4.11), forwards, backwards, and when the next stop already sits
 *      under the bar inside the viewport.
 *   3. The sticky bar is s08's: solid navy, 48 px, a 12 px mono back link with
 *      the tape glyph, 13 px sentence-case links with a dot between them.
 *   4. The pencil notes on empty plates read at AA (≥ 4.5:1) on their fill.
 *   5. ≥ 1140 px FIG. 1 is the reference's width; each plate readout breaks
 *      only at its designed split, and plates keep an even height.
 *   6. The archive tree is an example, not the real download's filename.
 *   7. The footer creed is a centred mono line at AA.
 *   8. The codec card never parts a number from its unit.
 *
 * Colours are compared as WCAG ratios computed in the page, never as raw CSS
 * strings; boxes are read in one frame after fonts are ready.
 */

import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const HOUSE_JSON = path.join(
  __dirname,
  "..",
  "public",
  "demo",
  "brave-little-star.ssync.json",
);
const HOUSE_TITLE = (
  JSON.parse(fs.readFileSync(HOUSE_JSON, "utf8")) as {
    metadata: { title: string };
  }
).metadata.title;

/** The download's own filename rule (DownloadDemo's slugify). */
function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "story"
  );
}

declare global {
  interface Window {
    __pr: {
      rgba(color: string): [number, number, number, number];
      ratio(fg: string, bg: [number, number, number]): number;
      composite(el: Element): [number, number, number];
      lines(el: Element): number;
    };
  }
}

/** In-page helpers: colour parsing through a canvas, WCAG ratio, compositing, line boxes. */
async function installHelpers(page: Page) {
  await page.addInitScript(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const rgba = (color: string): [number, number, number, number] => {
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (c: number) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const over = (top: number[], under: number[]) => {
      const a = top[3];
      return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a));
    };
    window.__pr = {
      rgba,
      ratio(fg, bg) {
        const c = rgba(fg);
        const f = over(c, bg);
        const [hi, lo] = [lum(f), lum(bg)].sort((a, b) => b - a);
        return (hi + 0.05) / (lo + 0.05);
      },
      /** The colour behind `el`: its own and its ancestors' background colours, laid over white. */
      composite(el) {
        const chain: Element[] = [];
        for (let n: Element | null = el; n; n = n.parentElement) chain.push(n);
        let out = [255, 255, 255];
        for (const n of chain.reverse())
          out = over(rgba(getComputedStyle(n).backgroundColor), out);
        return out as [number, number, number];
      },
      /** How many line boxes the element's text occupies. */
      lines(el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = Array.from(range.getClientRects()).filter(
          (r) => r.width > 2 && r.height > 2,
        ); // not the 1 px visually hidden " · "
        const tops: number[] = [];
        for (const r of rects.sort((a, b) => a.top - b.top)) {
          const mid = r.top + r.height / 2;
          if (!tops.some((t) => Math.abs(t - mid) < r.height / 2))
            tops.push(mid);
        }
        return tops.length;
      },
    };
  });
}

async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await installHelpers(page);
  await page.goto("/protocol");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Two frames, then the same read twice: the layout has settled when both agree. */
async function settled<T>(page: Page, read: () => T | Promise<T>): Promise<T> {
  let previous = "";
  for (let i = 0; i < 20; i += 1) {
    const value = await page.evaluate(async (src) => {
      await new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      );
      return (0, eval)(`(${src})`)();
    }, read.toString());
    const key = JSON.stringify(value);
    if (key === previous) return value as T;
    previous = key;
  }
  throw new Error("the /protocol layout did not settle");
}

/* ------------------------------------------------------------ 1 · figures */

test.describe("M6 · /protocol figures", () => {
  test("figures are numbered once each, in order; only FIG. 1 says 'each layer above'", async ({
    page,
  }) => {
    await open(page, 1140, 712);
    const caps = await page.evaluate(() =>
      Array.from(document.querySelectorAll("figcaption")).map((c) => ({
        text: (c.textContent ?? "").replace(/\s+/g, " ").trim(),
        inFig1: Boolean(c.closest('figure[data-protocol="fig-packet"]')),
        nearFig1: Boolean(
          c.closest('figure[data-protocol="fig-packet"]')?.contains(c),
        ),
      })),
    );
    const numbers = caps.map((c) =>
      Number(/^Fig\.\s*(\d+)/i.exec(c.text)?.[1] ?? NaN),
    );
    expect(numbers, caps.map((c) => c.text).join(" | ")).toEqual([1, 2, 3]);

    // Only FIG. 1 (drawn 01 at the bottom) may say "above"; its note sits in that figure.
    const above = await page.evaluate(() =>
      Array.from(document.querySelectorAll("figure"))
        .filter((f) => /each layer above/i.test(f.textContent ?? ""))
        .map((f) => f.getAttribute("data-protocol") ?? f.className),
    );
    expect(above).toEqual(["fig-packet"]);

    // Fig. 2 is the seven-layer diagram, in manifest order.
    await expect(page.locator("figure.pr-packet > figcaption")).toHaveText(
      "Fig. 2 — the seven layers, in manifest order. Each block is one JSON key; a reader may stop after layer 3 and still show the story.",
    );
  });

  test("Fig. 3's archive tree is an example, not the house tape's download", async ({
    page,
  }) => {
    await open(page, 375, 812);
    const tree = (await page.locator(".pr-tree").textContent()) ?? "";
    expect(tree).toContain("manifest.json");
    expect(tree).not.toContain(slug(HOUSE_TITLE));
    expect(tree).toContain("my-story.storysync");
    const cap = (
      await page.locator(".pr-sheet figcaption").textContent()
    )?.trim();
    expect(cap).toBe("Fig. 3 — the archive layout (an example)");
  });
});

/* ------------------------------------------------- 2 · focus, never hidden */

interface FocusRead {
  name: string;
  inBar: boolean;
  top: number;
  bottom: number;
  barBottom: number;
  vh: number;
}

async function readFocus(page: Page): Promise<FocusRead> {
  return page.evaluate(async () => {
    // the page's own correction runs one frame after focus
    await new Promise((done) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
    );
    const el = document.activeElement as HTMLElement;
    const bar = document.querySelector(".pr-bar")!;
    const r = el.getBoundingClientRect();
    return {
      name: `${el.tagName}.${el.className} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}"`,
      inBar: bar.contains(el),
      top: r.top,
      bottom: r.bottom,
      barBottom: bar.getBoundingClientRect().bottom,
      vh: window.innerHeight,
    };
  });
}

function expectUnobscured(f: FocusRead, where: string) {
  if (f.inBar) return;
  const room = f.vh - f.barBottom;
  if (f.bottom - f.top <= room) {
    expect(
      f.top,
      `${where}: ${f.name} starts under the sticky bar`,
    ).toBeGreaterThanOrEqual(f.barBottom - 0.5);
    expect(
      f.bottom,
      `${where}: ${f.name} runs off the viewport`,
    ).toBeLessThanOrEqual(f.vh + 1);
  } else {
    // taller than the room under the bar: its top is in view, under the bar
    const seen = Math.min(f.bottom, f.vh) - Math.max(f.top, f.barBottom);
    expect(seen, `${where}: ${f.name} is hidden`).toBeGreaterThanOrEqual(44);
    expect(
      f.top,
      `${where}: ${f.name} starts under the sticky bar`,
    ).toBeGreaterThanOrEqual(f.barBottom - 0.5);
  }
}

test.describe("M6 · /protocol focus is never under the sticky bar", () => {
  for (const [w, h] of [
    [375, 812],
    [1140, 712],
  ] as const) {
    test(`${w}×${h}: Tab forwards and Shift+Tab backwards, every stop in view`, async ({
      page,
    }) => {
      test.setTimeout(90000);
      await open(page, w, h);
      const stops = await page.evaluate(
        () =>
          Array.from(
            document.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.getClientRects().length > 0).length,
      );
      expect(stops).toBeGreaterThan(10);

      // forwards from the top
      await page.locator("body").focus();
      const forward: string[] = [];
      for (let i = 0; i < stops + 4; i += 1) {
        await page.keyboard.press("Tab");
        const f = await readFocus(page);
        if (f.name.startsWith("BODY")) break;
        forward.push(f.name);
        expectUnobscured(f, `${w} Tab #${i + 1}`);
      }
      expect(forward.length).toBeGreaterThan(10);

      // backwards from the footer's last link
      await page.locator(".pr-footer a").last().focus();
      let sawDownload = false;
      for (let i = 0; i < stops + 4; i += 1) {
        await page.keyboard.press("Shift+Tab");
        const f = await readFocus(page);
        if (f.name.startsWith("BODY") || f.inBar) break;
        if (f.name.includes("Download the demo")) sawDownload = true;
        expectUnobscured(f, `${w} Shift+Tab #${i + 1}`);
      }
      expect(sawDownload, "Shift+Tab reached the download").toBe(true);
    });

    test(`${w}×${h}: a stop already inside the viewport but under the bar is brought out`, async ({
      page,
    }) => {
      await open(page, w, h);
      const button = page.getByRole("button", { name: /Download the demo/ });
      // Park the download a few px below the top: inside the viewport, under the bar.
      await button.evaluate((el) => {
        const top = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, top - 4);
      });
      // Focus the stop after it, then step back onto it with the keyboard.
      await page.evaluate(() => {
        const all = Array.from(
          document.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        const i = all.findIndex((el) =>
          el.matches('[data-protocol="download-demo"]'),
        );
        all[i + 1].focus({ preventScroll: true });
      });
      await page.keyboard.press("Shift+Tab");
      const f = await readFocus(page);
      expect(f.name).toContain("Download the demo");
      expectUnobscured(f, `${w} under-the-bar`);
    });
  }

  test("the table's scroll region at 375 is not hidden under the bar either", async ({
    page,
  }) => {
    await open(page, 375, 812);
    const region = page.locator(".pr-table-scroll");
    const scrolls = await region.evaluate(
      (el) => el.scrollWidth > el.clientWidth,
    );
    expect(scrolls, "the table scrolls sideways at 375").toBe(true);
    // Focus the stop after it (the COPPA link), park the region just under the
    // top edge, then reach it backwards with the keyboard.
    await page.evaluate(() => {
      document
        .querySelector<HTMLElement>('main a[href*="PRIVACY.md"]')!
        .focus({ preventScroll: true });
      const el = document.querySelector(".pr-table-scroll")!;
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 6);
    });
    await page.keyboard.press("Shift+Tab");
    const f = await readFocus(page);
    expect(f.name).toContain("pr-table-scroll");
    expectUnobscured(f, "375 table");
  });
});

/* -------------------------------------------------------- 3 · the bar */

test.describe("M6 · /protocol sticky bar (s08)", () => {
  test("solid navy, 48 px, mono back link with the tape glyph, sentence-case links", async ({
    page,
  }) => {
    await open(page, 1140, 712);
    const bar = await settled(page, () => {
      const bar = document.querySelector(".pr-bar")!;
      const cs = getComputedStyle(bar);
      const meta = document.querySelector(".pr-eyebrow")!;
      const back = document.querySelector<HTMLElement>(".pr-back")!;
      const links = Array.from(
        document.querySelectorAll<HTMLElement>(".pr-bar-nav a"),
      );
      const ui = document.querySelector(".pr-lede")!;
      return {
        h: bar.getBoundingClientRect().height,
        blur: cs.backdropFilter,
        alpha: window.__pr.rgba(cs.backgroundColor)[3],
        bg: window.__pr.rgba(cs.backgroundColor).slice(0, 3),
        borderBottom: Number.parseFloat(cs.borderBottomWidth),
        back: {
          size: getComputedStyle(back).fontSize,
          font:
            getComputedStyle(back).fontFamily ===
            getComputedStyle(meta).fontFamily,
          transform: getComputedStyle(back).textTransform,
          h: back.getBoundingClientRect().height,
          img: back.querySelectorAll("img").length,
          imgAlt: back.querySelector("img")?.getAttribute("alt"),
        },
        links: links.map((a) => ({
          text: a.textContent?.trim(),
          size: getComputedStyle(a).fontSize,
          sans:
            getComputedStyle(a).fontFamily === getComputedStyle(ui).fontFamily,
          transform: getComputedStyle(a).textTransform,
          spacing: getComputedStyle(a).letterSpacing,
          h: a.getBoundingClientRect().height,
        })),
        dot: Array.from(bar.querySelectorAll('[aria-hidden="true"]')).some(
          (n) =>
            n.closest(".pr-bar-nav") && n.getBoundingClientRect().width > 0,
        ),
      };
    });
    expect(Math.abs(bar.h - 48), `bar height ${bar.h}`).toBeLessThanOrEqual(2);
    expect(bar.blur).toBe("none");
    expect(bar.alpha).toBe(1);
    expect(bar.bg).toEqual([10, 14, 26]);
    expect(bar.borderBottom).toBeGreaterThanOrEqual(1);
    expect(bar.back).toMatchObject({
      size: "12px",
      font: true,
      transform: "none",
      img: 1,
      imgAlt: "",
    });
    expect(bar.back.h).toBeGreaterThanOrEqual(44);
    expect(bar.links.map((l) => l.text)).toEqual([
      "Play a story",
      "Make a story",
    ]);
    for (const l of bar.links) {
      expect(l).toMatchObject({ size: "13px", sans: true, transform: "none" });
      expect(l.spacing === "normal" || Number.parseFloat(l.spacing) === 0).toBe(
        true,
      );
      expect(l.h).toBeGreaterThanOrEqual(44);
    }
    expect(
      bar.dot,
      "a dot between the two links, hidden from assistive tech",
    ).toBe(true);
    await expect(
      page.getByRole("link", { name: "Play a story" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "StorySyncHQ" })).toBeVisible();
  });

  for (const w of [375, 390, 768]) {
    test(`${w}: the bar stays one line, 48 px, with room to spare`, async ({
      page,
    }) => {
      await open(page, w, 812);
      const geo = await settled(page, () => {
        const bar = document.querySelector(".pr-bar")!;
        const inner = document.querySelector(".pr-bar-inner")!;
        const back = document.querySelector(".pr-back")!;
        const nav = document.querySelector(".pr-bar-nav")!;
        const items = [back, ...Array.from(nav.querySelectorAll("a"))];
        const rects = items.map((el) => el.getBoundingClientRect());
        const cs = getComputedStyle(inner);
        const contentW =
          inner.getBoundingClientRect().width -
          Number.parseFloat(cs.paddingLeft) -
          Number.parseFloat(cs.paddingRight);
        // the two groups at their own widths, and the gap the row keeps between them
        const used =
          back.getBoundingClientRect().width +
          nav.getBoundingClientRect().width +
          Number.parseFloat(cs.columnGap);
        return {
          h: bar.getBoundingClientRect().height,
          tops: rects.map((r) => Math.round(r.top)),
          slack: contentW - used,
          scroll: document.documentElement.scrollWidth,
        };
      });
      expect(Math.abs(geo.h - 48)).toBeLessThanOrEqual(2);
      expect(new Set(geo.tops).size, "one line").toBe(1);
      expect(geo.scroll).toBeLessThanOrEqual(w);
      // one-line layouts keep >= 12 px of slack (CI's font metrics differ)
      expect(geo.slack, "slack on the bar's line").toBeGreaterThanOrEqual(12);
    });
  }
});

/* -------------------------------------------- 4 · pencil notes at AA */

test.describe("M6 · /protocol FIG. 1 plates", () => {
  for (const w of [375, 1140]) {
    test(`${w}: the empty plates' pencil notes read at AA on their fill`, async ({
      page,
    }) => {
      await open(page, w, 812);
      const notes = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".sk-px-file--empty")).map(
          (el) => {
            const backing = el
              .closest("li")!
              .querySelector('[data-plate="backing"]')!;
            const bg = window.__pr.composite(backing);
            const cs = getComputedStyle(el);
            return {
              text: el.textContent,
              italic: cs.fontStyle,
              ratio: window.__pr.ratio(cs.color, bg),
            };
          },
        ),
      );
      expect(
        notes.length,
        "the house tape's page 3 has empty Voice and Signature plates",
      ).toBeGreaterThanOrEqual(2);
      for (const n of notes) {
        expect(n.italic).toBe("italic");
        expect(n.ratio, `"${n.text}" contrast`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  for (const [w, h] of [
    [1140, 712],
    [768, 1024],
  ] as const) {
    test(`${w}: FIG. 1 is at least 600 px; readouts break only at their designed split`, async ({
      page,
    }) => {
      await open(page, w, h);
      await page
        .locator('figure[data-protocol="fig-packet"]')
        .scrollIntoViewIfNeeded();
      const geo = await settled(page, () => {
        const fig = document.querySelector(
          'figure[data-protocol="fig-packet"]',
        )!;
        const plates = Array.from(
          fig.querySelectorAll('[data-sk="packet-exploded"] > li'),
        );
        return {
          fig: fig.getBoundingClientRect().width,
          heights: plates.map((li) =>
            Math.round(li.getBoundingClientRect().height),
          ),
          lines: Array.from(fig.querySelectorAll(".sk-px-line")).map((l) => [
            l.textContent,
            window.__pr.lines(l),
          ]),
          // every readout but the Visual plate's (its alt text may take a
          // second tail line, pinned in the test below)
          files: Array.from(fig.querySelectorAll(".sk-px-file"))
            .filter((f) => !f.closest('[data-layer="Visual"]'))
            .map((f) => [f.textContent, window.__pr.lines(f)]),
          tails: Array.from(fig.querySelectorAll(".sk-px-tail")).map((t) => [
            t.textContent,
            window.__pr.lines(t),
          ]),
          overflow: plates
            .map((li) => li.querySelector<HTMLElement>(".sk-px-in")!)
            .filter((el) => el.scrollWidth > el.clientWidth + 0.5)
            .map((el) => el.textContent),
        };
      });
      // 1140: beside the 428 px cards, as the brief's x32–660; 768: alone, full width
      expect(geo.fig, "FIG. 1's width").toBeGreaterThanOrEqual(600);
      for (const [text, n] of geo.lines)
        expect(n, `"${text}" stays one line`).toBe(1);
      for (const [text, n] of geo.files)
        expect(n, `"${text}" in at most two lines`).toBeLessThanOrEqual(2);
      for (const [text, n] of geo.tails)
        expect(n, `"${text}" tail in at most two lines`).toBeLessThanOrEqual(2);
      for (const h of geo.heights) {
        expect(h).toBeGreaterThanOrEqual(45);
        expect(h).toBeLessThanOrEqual(55);
      }
      expect(geo.overflow, "nothing spills out of a plate").toEqual([]);
    });
  }
});

/* --------------------------- 5b · no readout is cut short by an ellipsis */

test.describe("M6 · /protocol FIG. 1 readouts are whole", () => {
  for (const [w, h] of [
    [1140, 712],
    [1280, 720],
    [768, 1024],
  ] as const) {
    test(`${w}: the Visual plate's alt text is shown in full, inside its plate`, async ({
      page,
    }) => {
      await open(page, w, h);
      await page
        .locator('figure[data-protocol="fig-packet"]')
        .scrollIntoViewIfNeeded();
      const geo = await settled(page, () => {
        const fig = document.querySelector(
          'figure[data-protocol="fig-packet"]',
        )!;
        return Array.from(fig.querySelectorAll<HTMLElement>(".sk-px-tail")).map(
          (t) => {
            const li = t.closest("li")!;
            const back = li
              .querySelector('[data-plate="backing"]')!
              .getBoundingClientRect();
            // where the tail's own glyphs land, line by line
            const range = document.createRange();
            range.selectNodeContents(t);
            const rects = Array.from(range.getClientRects()).filter(
              (r) => r.width > 2 && r.height > 2,
            );
            const cs = getComputedStyle(t);
            const clipped = (el: HTMLElement | null): string[] => {
              const out: string[] = [];
              for (let n = el; n && n !== li; n = n.parentElement) {
                const s = getComputedStyle(n);
                if (s.textOverflow === "ellipsis" && s.overflowX !== "visible")
                  out.push(`ellipsis on .${n.className}`);
                if (n.scrollWidth > n.clientWidth + 0.5 && s.overflowX !== "visible")
                  out.push(`.${n.className} cuts ${n.scrollWidth - n.clientWidth}px`);
              }
              return out;
            };
            return {
              layer: li.dataset.layer,
              text: t.textContent,
              textOverflow: cs.textOverflow,
              clipped: clipped(t),
              right: Math.max(...rects.map((r) => r.right)),
              bottom: Math.max(...rects.map((r) => r.bottom)),
              plateRight: back.right,
              plateBottom: back.bottom,
            };
          },
        );
      });
      const visual = geo.find((t) => t.layer === "Visual");
      expect(visual, "the Visual plate prints its alt text").toBeTruthy();
      expect(visual!.text).toBe("The little star among bigger, sleepy stars");
      for (const t of geo) {
        expect(t.textOverflow, `"${t.text}" ends in no ellipsis`).not.toBe(
          "ellipsis",
        );
        expect(t.clipped, `"${t.text}" is not cut by any box`).toEqual([]);
        expect(t.right, `"${t.text}" ends inside its plate`).toBeLessThanOrEqual(
          t.plateRight,
        );
        expect(
          t.bottom,
          `"${t.text}" sits inside its plate`,
        ).toBeLessThanOrEqual(t.plateBottom);
      }
    });
  }
});

/* ------------------------------------------------------- 7 · the footer */

test.describe("M6 · /protocol footer creed", () => {
  for (const w of [375, 1140]) {
    test(`${w}: a centred mono creed at AA, its links still 44 px`, async ({
      page,
    }) => {
      await open(page, w, 812);
      const foot = await page.evaluate(() => {
        const note = document.querySelector(".pr-footer-note")!;
        const meta = document.querySelector(".sk-font-meta")!;
        const cs = getComputedStyle(note);
        const footer = document
          .querySelector(".pr-footer")!
          .getBoundingClientRect();
        const r = note.getBoundingClientRect();
        return {
          align: cs.textAlign,
          mono: cs.fontFamily === getComputedStyle(meta).fontFamily,
          ratio: window.__pr.ratio(cs.color, window.__pr.composite(note)),
          centre: Math.abs(
            (r.left + r.right) / 2 - (footer.left + footer.right) / 2,
          ),
          links: Array.from(
            document.querySelectorAll<HTMLElement>(".pr-footer a"),
          ).map((a) => a.getBoundingClientRect().height),
        };
      });
      expect(foot.align).toBe("center");
      expect(foot.mono).toBe(true);
      expect(foot.ratio).toBeGreaterThanOrEqual(4.5);
      expect(
        foot.centre,
        "the creed is centred on the page",
      ).toBeLessThanOrEqual(2);
      expect(foot.links).toHaveLength(3);
      for (const h of foot.links) expect(h).toBeGreaterThanOrEqual(44);
    });
  }
});

/* ---------------------------------------------- 8 · numbers keep units */

test.describe("M6 · /protocol codec card", () => {
  for (const w of [375, 1140]) {
    test(`${w}: no number is parted from its unit`, async ({ page }) => {
      await open(page, w, 812);
      const pairs = await page.evaluate(() => {
        const out: Array<{ pair: string; same: boolean }> = [];
        for (const dd of Array.from(
          document.querySelectorAll('[data-protocol="codec-card"] dd'),
        )) {
          const node = dd.firstChild!;
          const text = node.textContent!;
          for (const m of text.matchAll(/(\d+)[\s ](kHz|kbps)/g)) {
            const rectOf = (start: number, end: number) => {
              const range = document.createRange();
              range.setStart(node, start);
              range.setEnd(node, end);
              return range.getClientRects()[0];
            };
            const num = rectOf(m.index!, m.index! + m[1].length);
            const unit = rectOf(
              m.index! + m[0].length - m[2].length,
              m.index! + m[0].length,
            );
            out.push({ pair: m[0], same: Math.abs(num.top - unit.top) < 2 });
          }
        }
        return out;
      });
      expect(pairs.map((p) => p.pair.replace(/ /g, " "))).toEqual([
        "48 kHz",
        "96 kbps",
        "16 kHz",
      ]);
      for (const p of pairs) expect(p.same, `${p.pair} on one line`).toBe(true);
      const may = (await page
        .locator('[data-protocol="codec-card"] dd')
        .nth(1)
        .textContent())!.replace(/ /g, " ");
      expect(may).toContain("16 kHz");
    });
  }
});

/* ------------------------------ 9 · a wrapped bar still clears anchor jumps */

test.describe("M6 wave B · /protocol scroll-padding follows the bar's real height", () => {
  for (const [w, h] of [
    [320, 568],
    [375, 812],
    [1140, 712],
  ] as const) {
    test(`${w}×${h}: scroll-padding-top ≥ bar + 12; an anchor jump and scrollIntoView land below the bar`, async ({
      page,
    }) => {
      await open(page, w, h);
      // the page measures its bar once hydrated (a CSS fallback stands in before)
      await expect
        .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--pr-bar-h")))
        .not.toBe("");
      const pad = await settled(page, () => ({
        bar: document.querySelector(".pr-bar")!.getBoundingClientRect().height,
        pad: Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop),
      }));
      // at 320 the bar wraps to two lines (~89 px); the padding was a fixed 60
      expect(pad.pad, JSON.stringify(pad)).toBeGreaterThanOrEqual(pad.bar + 12 - 1);
      expect(pad.pad, "no needless gap above the target").toBeLessThanOrEqual(pad.bar + 12 + 1);

      for (const id of ["pr-codec-h", "pr-privacy-h", "pr-container-h"]) {
        // the browser's own anchor scroll
        await page.evaluate((target) => {
          window.scrollTo(0, 0);
          location.hash = `#${target}`;
        }, id);
        const viaHash = await settled(page, () => {
          const bar = document.querySelector(".pr-bar")!.getBoundingClientRect().bottom;
          const target = document.getElementById(location.hash.slice(1))!.getBoundingClientRect().top;
          return { bar, target };
        });
        expect(viaHash.target, `${id} via #hash ${JSON.stringify(viaHash)}`).toBeGreaterThanOrEqual(viaHash.bar);

        // and a script's scrollIntoView
        await page.evaluate((target) => {
          window.scrollTo(0, 0);
          document.getElementById(target)!.scrollIntoView({ block: "start" });
        }, id);
        const viaScript = await settled(page, () => {
          const bar = document.querySelector(".pr-bar")!.getBoundingClientRect().bottom;
          // the hash still names the same target
          const target = document.getElementById(location.hash.slice(1))!.getBoundingClientRect().top;
          return { bar, target };
        });
        expect(viaScript.target, `${id} via scrollIntoView ${JSON.stringify(viaScript)}`).toBeGreaterThanOrEqual(
          viaScript.bar,
        );
      }
    });
  }
});
