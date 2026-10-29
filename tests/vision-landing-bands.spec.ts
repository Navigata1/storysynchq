/**
 * T07 · "Remember the magic?" band + "Three surfaces · one file" row + the
 * company line + the s01 top nav
 * (docs/vision/tickets/T07-magic-band-surfaces-company-line.md, reference s01).
 *
 * Seam: Playwright E2E on `/`. Every string below is typed here, verbatim from
 * the reference (never imported from the components), and every expectation is
 * read off the running page — DOM order, computed style, focus, bounding boxes —
 * so the test can fail.
 *
 *   1. The magic band: kicker, h2, quote, wedge — verbatim, in order — after the
 *      two doors (#ls-doors) with only the tape-stripe seam between.
 *   2. The surfaces block: label + exactly three rows (28 px glass circle with a
 *      decorative lucide icon, name in weight 600); text, not links.
 *   3. The footer: the privacy line and the company line, verbatim; the footer
 *      links unchanged.
 *   4. The nav at 1280: wordmark → "/", four links with exact names and hrefs,
 *      reachable by Tab in order with the kit focus ring.
 *  4b. From 640 px up (incl. 844×390 and 1366×600) the row holds on one line
 *      with ≥ 12 px to spare and never lies over the hero kicker.
 *   5. The nav at 390×844: only the wordmark and "Menu"; Enter opens, Escape
 *      closes and refocuses the button, Space opens, an outside click closes.
 *   6. Reduced motion: the bands are visible without any scroll trigger; nothing
 *      new animates; one h1.
 */

import { expect, test, type Page } from "@playwright/test";

/* ------------------------------------------------------------ the copy */

const MAGIC = {
  kicker: "READ ALONG. LISTEN. FEEL.",
  heading: "Remember the magic?",
  quote:
    "Library books with cassette tapes. Reading along while the narrator guided you page by page. Background music that made every story feel alive.",
  wedge: "Now any storybook can read itself — in the voice and mood you choose.",
};

const SURFACES_LABEL = "THREE SURFACES · ONE FILE";
const SURFACES = [
  {
    name: "StorySync Reader",
    line: "StorySync Reader — plays any tape in any browser. No app, no account.",
    icon: "lucide-headphones",
  },
  {
    name: "StorySync Creator",
    line: "StorySync Creator — pictures, voices, a little music and timing, made together.",
    icon: "lucide-mic",
  },
  {
    name: "SSYNC Protocol",
    line: "SSYNC Protocol — the open file between them. Like PDF, for storybooks.",
    icon: "lucide-package",
  },
];

const PRIVACY_LINE =
  "Nothing leaves this device until a grown-up taps through the gate. No trackers, ever.";
const COMPANY_LINE = "A product of Island Development Crew LLC · Part of the SyncHQ Suite";

const PRIVACY_URL = "https://github.com/Navigata1/storysynchq/blob/main/PRIVACY.md";

const NAV_LINKS = [
  { name: "StorySync Reader", href: "/read" },
  { name: "StorySync Creator", href: "/studio" },
  { name: "The SSYNC Protocol", href: "/protocol" },
  { name: "Privacy", href: PRIVACY_URL },
];

const FOOTER_LINKS = [
  { name: "Protocol", href: "/protocol" },
  { name: "Privacy", href: PRIVACY_URL },
  { name: "GitHub", href: "https://github.com/Navigata1/storysynchq" },
  { name: "Classic site", href: "/classic" },
];

/** Reference colours (docs/vision/reference/foundation.css). */
const GOLD = "rgb(245, 158, 11)";
const LABEL_YELLOW = "rgb(255, 201, 60)";
const TAPE_RED = "rgb(227, 69, 47)";

async function open(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await expect(page.locator(".ls-hero")).toHaveCount(1);
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
}

/** The focused element, described: data-ls hook, else its accessible-ish name. */
async function focused(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { tag: "body", name: "", href: "", outline: "none", width: 0 };
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      name: (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim(),
      href: el.getAttribute("href") ?? "",
      outline: cs.outlineStyle,
      width: Number.parseFloat(cs.outlineWidth),
    };
  });
}

/* ------------------------------------------------------ 1 · the band */

test.describe("T07 · Remember the magic?", () => {
  test("1 · the band's four strings, verbatim and in order, right after the two doors", async ({
    page,
  }) => {
    await open(page, { width: 1280, height: 720 });

    const band = page.locator('[data-ls="magic"]');
    await expect(band).toHaveCount(1);

    // In order: the band's own children are exactly the four lines.
    const children = await band.evaluate((el) =>
      [...el.children].map((c) => ({
        tag: c.tagName.toLowerCase(),
        text: (c.textContent ?? "").replace(/\s+/g, " ").trim(),
      })),
    );
    expect(children.map((c) => c.text)).toEqual([
      MAGIC.kicker,
      MAGIC.heading,
      MAGIC.quote,
      MAGIC.wedge,
    ]);
    // …and the heading is an h2 (the page keeps its single h1).
    await expect(page.getByRole("heading", { level: 2, name: MAGIC.heading, exact: true })).toHaveCount(1);
    expect(children[1].tag).toBe("h2");

    // Type and colour, per line.
    const look = await band.evaluate((el) => {
      const [kicker, h2, quote, wedge] = [...el.children] as HTMLElement[];
      const cs = (n: Element) => getComputedStyle(n);
      // the rule may sit on the quote or on its own paragraph
      const ruled = [quote, ...quote.querySelectorAll<HTMLElement>("*")].find(
        (n) => Number.parseFloat(cs(n).borderLeftWidth) >= 1 && cs(n).borderLeftStyle !== "none",
      );
      return {
        kicker: { family: cs(kicker).fontFamily.toLowerCase(), color: cs(kicker).color },
        h2: {
          family: cs(h2).fontFamily.toLowerCase(),
          style: cs(h2).fontStyle,
          weight: Number(cs(h2).fontWeight),
        },
        rule: ruled ? { width: Number.parseFloat(cs(ruled).borderLeftWidth) } : null,
        wedge: { color: cs(wedge).color },
      };
    });
    expect(look.kicker.family, "the kicker is mono").toMatch(/plex|mono/);
    expect(look.kicker.color, "the kicker is gold").toBe(GOLD);
    expect(look.h2.family, "the heading is Fraunces").toContain("fraunces");
    expect(look.h2.style, "the heading is italic").toBe("italic");
    expect(look.h2.weight).toBeGreaterThanOrEqual(600);
    expect(look.rule, "the quote carries a left rule").not.toBeNull();
    expect(look.wedge.color, "the wedge line is label-yellow").toBe(LABEL_YELLOW);

    // Placement: #ls-doors → seam → magic → surfaces, nothing else between.
    const order = await page.evaluate(() => {
      const doors = document.getElementById("ls-doors");
      const seam = document.querySelector<HTMLElement>('[data-ls="seam"]');
      const magic = document.querySelector('[data-ls="magic"]');
      const surfaces = document.querySelector('[data-ls="surfaces"]');
      if (!doors || !seam || !magic || !surfaces) return null;
      const follows = (a: Node, b: Node) =>
        !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) && !a.contains(b);
      // any section or heading that starts after the doors and before the seam
      const between = [...document.querySelectorAll("section, h2, h3, [data-ls]")]
        .filter((n) => !doors.contains(n) && n !== doors && follows(doors, n) && follows(n, seam))
        .filter((n) => !n.contains(seam))
        .map((n) => `${n.tagName}:${(n.textContent ?? "").slice(0, 24)}`);
      // between the band and the surfaces block: no other heading or section
      const gap = [...document.querySelectorAll("section, h2, h3")]
        .filter((n) => follows(magic, n) && follows(n, surfaces) && !n.contains(surfaces))
        .map((n) => `${n.tagName}:${(n.textContent ?? "").slice(0, 24)}`);
      const cs = getComputedStyle(seam);
      return {
        seamAfterDoors: follows(doors, seam),
        magicAfterSeam: follows(seam, magic),
        surfacesAfterMagic: follows(magic, surfaces),
        between,
        gap,
        seamHidden: seam.getAttribute("aria-hidden"),
        seamBg: cs.backgroundImage,
        seamH: seam.getBoundingClientRect().height,
        seamW: seam.getBoundingClientRect().width,
        // the next h2 after the band is the shipped "How the magic works"
        nextH2: (() => {
          const all = [...document.querySelectorAll("h2")];
          const i = all.findIndex((h) => magic.contains(h));
          return all[i + 1]?.textContent?.trim() ?? "";
        })(),
      };
    });
    expect(order, "the doors, the seam, the band and the surfaces block must all render").not.toBeNull();
    expect(order!.seamAfterDoors, "the seam follows the two doors").toBe(true);
    expect(order!.between, "nothing sits between the doors and the seam").toEqual([]);
    expect(order!.magicAfterSeam, "the band follows the seam").toBe(true);
    expect(order!.surfacesAfterMagic, "the surfaces block follows the band").toBe(true);
    expect(order!.gap, "nothing sits between the band and the surfaces block").toEqual([]);
    expect(order!.nextH2).toBe("How the magic works");

    // The seam is decoration: aria-hidden, a thin stripe with red and yellow segments.
    expect(order!.seamHidden).toBe("true");
    expect(order!.seamBg).toContain(TAPE_RED);
    expect(order!.seamBg).toContain(LABEL_YELLOW);
    expect(order!.seamH).toBeGreaterThanOrEqual(3);
    expect(order!.seamH).toBeLessThanOrEqual(10);
    expect(order!.seamW).toBeGreaterThan(200);
  });
});

/* -------------------------------------------------- 2 · three surfaces */

test.describe("T07 · Three surfaces · one file", () => {
  test("2 · the label and exactly three rows with the exact lines; no links inside", async ({
    page,
  }) => {
    await open(page, { width: 1280, height: 720 });

    const block = page.locator('[data-ls="surfaces"]');
    await expect(block).toHaveCount(1);
    await block.scrollIntoViewIfNeeded();

    const read = await block.evaluate((el) => {
      const rows = [...el.querySelectorAll<HTMLElement>('[data-ls="surface"]')];
      const label = el.querySelector<HTMLElement>('[data-ls="surfaces-label"]');
      return {
        label: label
          ? {
              text: (label.textContent ?? "").replace(/\s+/g, " ").trim(),
              family: getComputedStyle(label).fontFamily.toLowerCase(),
            }
          : null,
        links: el.querySelectorAll("a").length,
        rows: rows.map((row) => {
          const svg = row.querySelector("svg");
          const circle = svg?.parentElement ?? null;
          const strong = row.querySelector("strong, b");
          const box = circle?.getBoundingClientRect();
          return {
            text: (row.textContent ?? "").replace(/\s+/g, " ").trim(),
            svgClass: svg?.getAttribute("class") ?? "",
            svgHidden: svg?.closest('[aria-hidden="true"]') !== null,
            circle: box
              ? {
                  w: box.width,
                  h: box.height,
                  radius: getComputedStyle(circle!).borderTopLeftRadius,
                  border: Number.parseFloat(getComputedStyle(circle!).borderTopWidth),
                }
              : null,
            name: strong ? (strong.textContent ?? "").trim() : "",
            weight: strong ? Number(getComputedStyle(strong).fontWeight) : 0,
          };
        }),
      };
    });

    expect(read.label, "the block carries its mono label").not.toBeNull();
    expect(read.label!.text).toBe(SURFACES_LABEL);
    expect(read.label!.family).toMatch(/plex|mono/);

    expect(read.rows.map((r) => r.text)).toEqual(SURFACES.map((s) => s.line));
    read.rows.forEach((row, i) => {
      const want = SURFACES[i];
      expect(row.name, `row ${i + 1} names its surface`).toBe(want.name);
      expect(row.weight, `${want.name} is set in 600`).toBe(600);
      expect(row.svgClass, `${want.name} carries the ${want.icon} icon`).toContain(want.icon);
      expect(row.svgHidden, `${want.name}'s icon is decorative`).toBe(true);
      expect(row.circle, `${want.name}'s icon sits in a circle`).not.toBeNull();
      expect(Math.round(row.circle!.w)).toBe(28);
      expect(Math.round(row.circle!.h)).toBe(28);
      expect(row.circle!.radius).toMatch(/50%|14px|999|9999/);
      expect(row.circle!.border).toBeGreaterThanOrEqual(1);
    });

    // The rows are text, not links.
    expect(read.links).toBe(0);
    await expect(block.getByRole("link")).toHaveCount(0);
  });
});

/* ---------------------------------------------------------- 3 · footer */

test.describe("T07 · the footer signs the page", () => {
  test("3 · privacy line kept, company line added (mono, muted), footer links unchanged", async ({
    page,
  }) => {
    await open(page, { width: 1280, height: 720 });
    const footer = page.locator("footer");
    await expect(footer).toHaveCount(1);
    await footer.scrollIntoViewIfNeeded();

    const lines = await footer.evaluate((el) =>
      [...el.querySelectorAll("p")].map((p) => ({
        text: (p.textContent ?? "").replace(/\s+/g, " ").trim(),
        family: getComputedStyle(p).fontFamily.toLowerCase(),
        color: getComputedStyle(p).color,
      })),
    );
    const texts = lines.map((l) => l.text);
    expect(texts).toContain(PRIVACY_LINE);
    expect(texts).toContain(COMPANY_LINE);
    // the company line comes after the privacy line
    expect(texts.indexOf(COMPANY_LINE)).toBeGreaterThan(texts.indexOf(PRIVACY_LINE));

    const company = lines.find((l) => l.text === COMPANY_LINE)!;
    expect(company.family, "the company line is mono").toMatch(/plex|mono/);
    expect(company.color, "the company line is muted, not white").not.toBe("rgb(255, 255, 255)");

    // Footer links: the same four, same order, same targets.
    const nav = footer.getByRole("navigation", { name: "Footer" });
    const links = nav.getByRole("link");
    await expect(links).toHaveCount(FOOTER_LINKS.length);
    for (const [i, want] of FOOTER_LINKS.entries()) {
      await expect(links.nth(i)).toHaveAccessibleName(want.name);
      await expect(links.nth(i)).toHaveAttribute("href", want.href);
    }
  });
});

/* ------------------------------------------------------ 4 · nav, desktop */

test.describe("T07 · the s01 top nav", () => {
  test("4 · at 1280: wordmark → /, four links with exact names and hrefs, Tab order and focus ring", async ({
    page,
  }) => {
    await open(page, { width: 1280, height: 720 });

    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav).toHaveCount(1);
    await expect(nav).toBeVisible();

    // It sits at the top of the hero.
    const where = await nav.evaluate((el) => ({
      inHero: !!el.closest(".ls-hero"),
      top: el.getBoundingClientRect().top,
      bottom: el.getBoundingClientRect().bottom,
      kickerTop: document.querySelector('[data-ls="hero-kicker"]')?.getBoundingClientRect().top ?? -1,
    }));
    expect(where.inHero, "the nav lives in the hero").toBe(true);
    expect(where.top).toBeLessThanOrEqual(8);
    expect(where.bottom, "the nav row ends above the hero kicker").toBeLessThanOrEqual(where.kickerTop + 1);

    const links = nav.getByRole("link");
    await expect(links).toHaveCount(1 + NAV_LINKS.length);

    // The wordmark: Fraunces 700, the cassette icon, home.
    const mark = links.first();
    await expect(mark).toHaveAccessibleName("StorySyncHQ");
    await expect(mark).toHaveAttribute("href", "/");
    const markLook = await mark.evaluate((el) => {
      const text = [...el.querySelectorAll<HTMLElement>("*")].find(
        (n) => n.children.length === 0 && (n.textContent ?? "").trim() === "StorySyncHQ",
      ) ?? (el as HTMLElement);
      const img = el.querySelector("img");
      return {
        family: getComputedStyle(text).fontFamily.toLowerCase(),
        weight: Number(getComputedStyle(text).fontWeight),
        icon: img ? { src: img.getAttribute("src") ?? "", alt: img.getAttribute("alt") } : null,
      };
    });
    expect(markLook.family).toContain("fraunces");
    expect(markLook.weight).toBe(700);
    expect(markLook.icon, "the wordmark carries the cassette icon").not.toBeNull();
    expect(markLook.icon!.src).toMatch(/icon/);
    expect(markLook.icon!.alt, "the icon is decorative; the word names the link").toBe("");

    for (const [i, want] of NAV_LINKS.entries()) {
      const link = links.nth(i + 1);
      await expect(link).toHaveAccessibleName(want.name);
      await expect(link).toHaveAttribute("href", want.href);
      await expect(link).toBeVisible();
    }

    // No menu button on the desktop row.
    await expect(nav.getByRole("button", { name: "Menu" })).toBeHidden();

    // Tab from the top: the wordmark then the four links, in order, each ringed.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const expected = [{ name: "StorySyncHQ", href: "/" }, ...NAV_LINKS];
    for (const want of expected) {
      await page.keyboard.press("Tab");
      const f = await focused(page);
      expect(f.tag).toBe("a");
      expect(f.name).toBe(want.name);
      expect(f.href).toBe(want.href);
      expect(f.outline, `${want.name} shows the focus ring`).not.toBe("none");
      expect(f.width).toBeGreaterThanOrEqual(2);
    }
    // …and Press play is still the next stop after the nav.
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.ls ?? ""),
    ).toBe("press-play");

    // Every nav link and the button carry the kit focus class.
    const kit = await nav.evaluate((el) =>
      [...el.querySelectorAll("a, button")].every((n) => n.classList.contains("sk-focus")),
    );
    expect(kit, "every nav control uses the kit focus ring (sk-focus)").toBe(true);
  });

  test("4b · from 640 px up the row holds with room to spare and clears the hero kicker, short screens too", async ({
    page,
  }) => {
    // 640 is the tightest width the row must hold (below it the Menu takes over);
    // 844×390 is a landscape phone and 1366×600 a short laptop window, where the
    // hero's top padding is thinnest.
    const sizes = [
      { width: 640, height: 720 },
      { width: 700, height: 720 },
      { width: 768, height: 1024 },
      { width: 844, height: 390 },
      { width: 1080, height: 675 },
      { width: 1366, height: 600 },
      { width: 1440, height: 900 },
    ];
    await open(page, sizes[0]);

    for (const size of sizes) {
      await page.setViewportSize(size);
      // Read every box in one frame, and only once two frames agree.
      const read = () =>
        page.evaluate(
          () =>
            new Promise<string>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  const nav = document.querySelector<HTMLElement>('nav[aria-label="Main"]')!;
                  const mark = nav.querySelector<HTMLElement>('a[href="/"]')!;
                  const list = nav.querySelector<HTMLElement>("ul")!;
                  const kicker = document.querySelector<HTMLElement>('[data-ls="hero-kicker"]')!;
                  const shown = [...nav.querySelectorAll<HTMLElement>("a, button")].filter(
                    (n) => n.getBoundingClientRect().width > 0,
                  );
                  // where each control's words actually end, not its padded box
                  const text = shown.map((n) => {
                    const range = document.createRange();
                    range.selectNodeContents(n);
                    const r = range.getBoundingClientRect();
                    return { name: (n.textContent ?? "").trim(), left: r.left, right: r.right, top: r.top };
                  });
                  const m = mark.getBoundingClientRect();
                  const l = list.getBoundingClientRect();
                  resolve(
                    JSON.stringify({
                      innerW: window.innerWidth,
                      names: text.map((t) => t.name),
                      text,
                      // free room in the row: the space between the wordmark and
                      // the links beyond the flex gap (an overfull row squeezes
                      // the list against the wordmark, so this reads 0)
                      free: l.left - m.right - Number.parseFloat(getComputedStyle(nav).columnGap),
                      navBottom: nav.getBoundingClientRect().bottom,
                      kickerTop: kicker.getBoundingClientRect().top,
                      docW: document.documentElement.scrollWidth,
                    }),
                  );
                }),
              ),
            ),
        );
      let last = "";
      await expect.poll(async () => {
        const now = await read();
        const same = now === last;
        last = now;
        return same;
      }).toBe(true);
      const r = JSON.parse(last) as {
        innerW: number;
        names: string[];
        text: { name: string; left: number; right: number; top: number }[];
        free: number;
        navBottom: number;
        kickerTop: number;
        docW: number;
      };
      const at = `${size.width}×${size.height}`;

      expect(r.names, `${at}: the wordmark and the four links, no Menu`).toEqual([
        "StorySyncHQ",
        ...NAV_LINKS.map((l) => l.name),
      ]);
      // One row.
      for (const t of r.text) expect(Math.abs(t.top - r.text[1].top), `${at}: ${t.name} on the row`).toBeLessThanOrEqual(6);
      // Room to spare, never a few px of luck.
      expect(r.free, `${at}: free room in the row`).toBeGreaterThanOrEqual(12);
      for (let i = 1; i < r.text.length; i += 1) {
        expect(
          r.text[i].left - r.text[i - 1].right,
          `${at}: space between ${r.text[i - 1].name} and ${r.text[i].name}`,
        ).toBeGreaterThanOrEqual(12);
      }
      expect(r.innerW - r.text[r.text.length - 1].right, `${at}: Privacy ends inside the page`).toBeGreaterThanOrEqual(12);
      expect(r.docW, `${at}: no sideways scroll`).toBeLessThanOrEqual(r.innerW);
      // The bar never lies over the hero kicker (s01: bar y0–52, kicker y58).
      expect(r.navBottom, `${at}: the nav clears the hero kicker`).toBeLessThanOrEqual(r.kickerTop);
    }
  });

  /* ------------------------------------------------------ 5 · nav, phone */

  test("5 · at 390×844: wordmark + Menu only; Enter opens, Escape closes and refocuses, outside click closes", async ({
    page,
  }) => {
    await open(page, { width: 390, height: 844 });

    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav).toBeVisible();
    const menu = nav.getByRole("button", { name: "Menu" });
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    const controls = await menu.getAttribute("aria-controls");
    expect(controls, "the menu button names the list it controls").toBeTruthy();
    const list = page.locator(`[id="${controls}"]`);
    await expect(list).toHaveCount(1);

    // The hero shows only the wordmark and the menu button.
    const visibleControls = await nav.evaluate((el) =>
      [...el.querySelectorAll<HTMLElement>("a, button")]
        .filter((n) => {
          const r = n.getBoundingClientRect();
          const cs = getComputedStyle(n);
          return r.width > 0 && r.height > 0 && cs.visibility !== "hidden";
        })
        .map((n) => (n.getAttribute("aria-label") ?? n.textContent ?? "").replace(/\s+/g, " ").trim()),
    );
    expect(visibleControls).toEqual(["StorySyncHQ", "Menu"]);
    for (const want of NAV_LINKS) {
      const link = nav.getByRole("link", { name: want.name, exact: true, includeHidden: true });
      await expect(link).toHaveCount(1);
      await expect(link).toBeHidden();
    }

    // Tap targets ≥ 44 px tall.
    for (const target of [nav.getByRole("link", { name: "StorySyncHQ" }), menu]) {
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    // Keyboard: Tab to the wordmark, then the button — ringed.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Tab");
    expect((await focused(page)).name).toBe("StorySyncHQ");
    await page.keyboard.press("Tab");
    let f = await focused(page);
    expect(f.tag).toBe("button");
    expect(f.name).toBe("Menu");
    expect(f.outline).not.toBe("none");
    expect(f.width).toBeGreaterThanOrEqual(2);

    // Enter opens: the four links appear, named and targeted, ≥ 44 px each.
    await page.keyboard.press("Enter");
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(list).toBeVisible();
    const menuLinks = list.getByRole("link");
    await expect(menuLinks).toHaveCount(NAV_LINKS.length);
    for (const [i, want] of NAV_LINKS.entries()) {
      await expect(menuLinks.nth(i)).toHaveAccessibleName(want.name);
      await expect(menuLinks.nth(i)).toHaveAttribute("href", want.href);
      await expect(menuLinks.nth(i)).toBeVisible();
      const box = await menuLinks.nth(i).boundingBox();
      expect(box!.height, `${want.name} is a 44 px tap target`).toBeGreaterThanOrEqual(44);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    await page.screenshot({ path: test.info().outputPath("t07-menu-open-390.png") });

    // Tab walks into the links in order, each ringed.
    for (const want of NAV_LINKS) {
      await page.keyboard.press("Tab");
      f = await focused(page);
      expect(f.name).toBe(want.name);
      expect(f.outline).not.toBe("none");
    }

    // Escape (from inside the menu) closes it and returns focus to the button.
    await page.keyboard.press("Escape");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(list).toBeHidden();
    f = await focused(page);
    expect(f.tag).toBe("button");
    expect(f.name).toBe("Menu");

    // Space opens it too…
    await page.keyboard.press("Space");
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(list).toBeVisible();

    // …and a click outside the nav closes it.
    await page.mouse.click(195, 600);
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(list).toBeHidden();
    expect(new URL(page.url()).pathname, "the outside click did not navigate").toBe("/");

    // A pointer tap on the button opens it; tapping it again closes it.
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
  });
});

/* -------------------------------------------------- 6 · reduced motion */

test.describe("T07 · calm, and one h1", () => {
  test("6 · reduced motion: the bands are visible without scrolling; nothing new animates; one h1", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, { width: 1280, height: 720 });
    expect(
      await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
      "reduced motion must be emulated for this probe to mean anything",
    ).toBe(true);

    // No scrolling at all: read the band where it sits, below the fold.
    const state = await page.evaluate(() => {
      const nodes = ['[data-ls="seam"]', '[data-ls="magic"]', '[data-ls="surfaces"]']
        .map((s) => document.querySelector<HTMLElement>(s))
        .filter((n): n is HTMLElement => !!n);
      const opacityChain = (el: HTMLElement) => {
        let o = 1;
        for (let n: HTMLElement | null = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
        return o;
      };
      return {
        found: nodes.length,
        belowFold: nodes.every((n) => n.getBoundingClientRect().top > window.innerHeight),
        opacity: nodes.map(opacityChain),
        transforms: nodes.map((n) => {
          const out: string[] = [];
          for (let p: HTMLElement | null = n; p && p !== document.body; p = p.parentElement) {
            const t = getComputedStyle(p).transform;
            if (t !== "none") out.push(t);
          }
          return out;
        }),
        scrollY: window.scrollY,
      };
    });
    expect(state.found).toBe(3);
    expect(state.belowFold, "the probe reads the bands before any scroll could reveal them").toBe(true);
    expect(state.scrollY).toBe(0);
    expect(state.opacity, "every band is fully visible immediately").toEqual([1, 1, 1]);
    expect(state.transforms, "no reveal offset is waiting to run").toEqual([[], [], []]);

    // One h1 on the page; the new heading is an h2.
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 2, name: MAGIC.heading, exact: true })).toHaveCount(1);
  });

  test("6b · with motion allowed nothing in the new sections loops or animates", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await open(page, { width: 1280, height: 720 });
    await page.locator('[data-ls="surfaces"]').scrollIntoViewIfNeeded();
    // let the one-shot Reveal finish
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.querySelector<HTMLElement>('[data-ls="magic"]');
          let o = 1;
          for (let n: HTMLElement | null = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
          return o;
        }),
      )
      .toBe(1);

    const animated = await page.evaluate(() => {
      const roots = ['nav[aria-label="Main"]', '[data-ls="seam"]', '[data-ls="magic"]', '[data-ls="surfaces"]']
        .map((s) => document.querySelector(s))
        .filter((n): n is Element => !!n);
      const hits: string[] = [];
      for (const root of roots) {
        for (const n of [root, ...root.querySelectorAll("*")]) {
          const cs = getComputedStyle(n);
          if (cs.animationName !== "none") hits.push(`${n.tagName}.${n.getAttribute("class")}: ${cs.animationName}`);
        }
      }
      const running = document
        .getAnimations()
        .filter((a) => {
          const t = (a.effect as KeyframeEffect | null)?.target;
          return !!t && roots.some((r) => r.contains(t));
        })
        .map((a) => `${(a as CSSAnimation).animationName ?? "transition"}`);
      return { hits, running, count: roots.length };
    });
    expect(animated.count).toBe(4);
    expect(animated.hits, "no keyframe animation in the nav, seam, band or surfaces").toEqual([]);
    expect(animated.running, "nothing is still moving in the new sections").toEqual([]);
  });
});

