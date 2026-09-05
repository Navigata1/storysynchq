/**
 * CRITIC probe for WP-L — the landing's "insert the tape" and /protocol
 * (docs/10x-plan.md §3 WP-L, gaps G8 and G9).
 *
 * Written blind by the WP-L critic: it re-derives every bar item from the
 * running app rather than trusting the builder's own spec. Deliberate
 * differences from tests/wp-landing.spec.ts:
 *   · reduced motion is proven from the CSS cascade (force the inserting
 *     state and read animation-name) instead of a wall-clock race, so the
 *     gate cannot flake on a slow machine;
 *   · the seven layer names are read out of the raw <text> nodes of the SVG,
 *     not off a data attribute the builder controls;
 *   · the packed container is checked for *residual* http(s)/data URLs — the
 *     "inline the images" half of the bar, which a passing ZIP alone does not
 *     prove;
 *   · both /protocol and the hero are checked for horizontal overflow at the
 *     project viewport (375px on mobile).
 *
 * Screenshots for a human: tests/screenshots/critic-landing-*.png
 */

import { expect, test, type Page } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import { unzipSync, strFromU8 } from "fflate";

const SHOTS = path.join(process.cwd(), "tests", "screenshots");

/** docs/design-direction.md §9.4 — hard-coded here so the test can fail. */
const SEVEN_LAYERS = ["Metadata", "Visual", "Text", "Voice", "Sound", "Behavior", "Signature"];

/** The bar: the cassette-into-deck animation must not exceed this. */
const INSERT_BUDGET_MS = 900;

function shot(page: Page, name: string, fullPage = false) {
  fs.mkdirSync(SHOTS, { recursive: true });
  return page.screenshot({
    path: path.join(SHOTS, `${name}-${test.info().project.name}.png`),
    fullPage,
  });
}

/**
 * `next dev` compiles /read on first request; that cost is the toolchain, not
 * the product (the route is prerendered in `next build`). Ask for it over HTTP
 * once so the click below measures the product.
 */
async function warmRead(page: Page) {
  const res = await page.request.get("/read?demo=1");
  expect(res.ok(), "/read?demo=1 must serve").toBeTruthy();
}

/** Computed animation on the travelling tape, with the state forced on. */
async function insertAnimation(page: Page) {
  return page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('[data-ls="tape-stage"]');
    const slide = document.querySelector<HTMLElement>('[data-ls="tape-slide"]');
    if (!stage || !slide) return null;
    const before = stage.getAttribute("data-inserting");
    stage.setAttribute("data-inserting", "true");
    const cs = getComputedStyle(slide);
    const read = {
      name: cs.animationName,
      durationMs: Number.parseFloat(cs.animationDuration) * 1000,
      delayMs: Number.parseFloat(cs.animationDelay) * 1000,
      fill: cs.animationFillMode,
    };
    stage.setAttribute("data-inserting", before ?? "false");
    return read;
  });
}

test.describe("CRITIC · WP-L hero: press play inserts the tape", () => {
  test("press play → /read?demo=1 with the cover gate inside 3s", async ({ page }) => {
    await warmRead(page);
    await page.goto("/");

    const press = page.locator('[data-ls="press-play"]');
    await expect(press).toBeVisible();
    await expect(press).toHaveAccessibleName(/press play/i);
    await shot(page, "critic-landing-hero");

    const t0 = Date.now();
    await press.click();
    await page.waitForURL(/\/read\?demo=1/, { timeout: 4000 });
    const gate = page.getByRole("button", { name: "Tap to Begin" });
    await expect(gate).toBeVisible({ timeout: 4000 });
    const elapsed = Date.now() - t0;

    await shot(page, "critic-landing-gate");
    expect(elapsed, `press play → "Tap to Begin" took ${elapsed}ms (bar: ≤ 3000ms)`).toBeLessThanOrEqual(3000);

    // The animation must actually have played before the route change — a
    // straight-to-router push would be a different (worse) product.
    expect(elapsed, `route change came ${elapsed}ms after the click; the tape should travel first`).toBeGreaterThan(300);
  });

  test("the cassette animation is within the 900ms budget and really travels", async ({ page }) => {
    await warmRead(page);
    await page.goto("/");

    const anim = await insertAnimation(page);
    expect(anim, "the hero must expose a tape-stage and a travelling tape").not.toBeNull();
    expect(anim!.name, "the inserting state must run a keyframe animation").not.toBe("none");
    const total = anim!.durationMs + Math.max(0, anim!.delayMs);
    expect(total, `insert animation runs ${total}ms (bar: ≤ ${INSERT_BUDGET_MS}ms)`).toBeLessThanOrEqual(INSERT_BUDGET_MS);
    expect(anim!.fill, "the tape must stay inserted through the route change").toBe("forwards");

    // Now watch it move for real: sample the live matrix twice.
    const slide = page.locator('[data-ls="tape-slide"]');
    await expect(slide).toHaveCSS("transform", "none");
    await page.locator('[data-ls="press-play"]').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('[data-ls="tape-stage"]')).toHaveAttribute("data-inserting", "true");

    const readY = () =>
      page.evaluate(() => {
        const el = document.querySelector<HTMLElement>('[data-ls="tape-slide"]');
        if (!el) return Number.NaN;
        const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        return m.m42;
      });

    const first = await readY();
    await page.waitForTimeout(220);
    const second = await readY();
    await shot(page, "critic-landing-midflight");
    expect(second, `the tape must travel down into the deck (y went ${first} → ${second})`).toBeGreaterThan(first);
    expect(second, "the tape should be well into the deck by ~500ms").toBeGreaterThan(8);

    await page.waitForURL(/\/read\?demo=1/, { timeout: 4000 });
  });

  test("prefers-reduced-motion: the CSS cannot animate, and the route still opens", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await warmRead(page);
    await page.goto("/");

    expect(
      await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
      "reduced motion must be emulated for this probe to mean anything",
    ).toBeTruthy();

    // Force the inserting state: under reduce there must be no animation at all.
    const anim = await insertAnimation(page);
    expect(anim).not.toBeNull();
    expect(anim!.name, "under reduced motion the tape must not animate").toBe("none");

    const t0 = Date.now();
    await page.locator('[data-ls="press-play"]').click();
    await page.waitForURL(/\/read\?demo=1/, { timeout: 4000 });
    await expect(page.getByRole("button", { name: "Tap to Begin" })).toBeVisible({ timeout: 4000 });
    const elapsed = Date.now() - t0;
    // "Instant" = the 760ms travel is not waited out. Generous bound so the
    // gate measures the product decision, not the dev server's mood.
    expect(elapsed, `reduced motion took ${elapsed}ms to the gate`).toBeLessThan(2500);
  });

  test("the secondary 'or scroll' affordance survives and opens the doors", async ({ page }) => {
    await page.goto("/");
    const orScroll = page.locator('[data-ls="or-scroll"]');
    await expect(orScroll).toBeVisible();
    await expect(orScroll).toHaveText(/scroll/i);
    await orScroll.click();
    await expect(page.locator("#ls-doors")).toBeInViewport({ timeout: 3000 });
    expect(new URL(page.url()).pathname, "the doors are on the landing, not a route change").toBe("/");
  });

  test("the landing points at /protocol from the protocol section and the footer", async ({ page }) => {
    await page.goto("/");
    const inFooter = page.locator('footer a[href="/protocol"]');
    await expect(inFooter).toHaveCount(1);
    const outsideFooter = page.locator('a[href="/protocol"]:not(footer a)');
    await expect(outsideFooter).toHaveCount(1);
    await outsideFooter.first().click();
    await page.waitForURL(/\/protocol$/, { timeout: 4000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test.describe("CRITIC · WP-L /protocol", () => {
  test("draws all seven layers as real inline-SVG text", async ({ page }) => {
    await page.goto("/protocol");

    const svg = page.locator("svg.pr-packet-svg");
    await expect(svg).toBeVisible();
    expect(await svg.evaluate((el) => el.namespaceURI)).toBe("http://www.w3.org/2000/svg");

    // Read every text node the SVG paints — no builder-owned hook involved.
    const texts = await svg.evaluate((el) =>
      Array.from(el.querySelectorAll("text")).map((t) => (t.textContent ?? "").trim()),
    );
    for (const name of SEVEN_LAYERS) {
      expect(texts, `layer "${name}" must be painted in the packet diagram`).toContain(name);
    }
    // …and in the order the protocol names them.
    const order = texts.filter((t) => SEVEN_LAYERS.includes(t));
    expect(order).toEqual(SEVEN_LAYERS);

    // The legend under the diagram must explain the same seven.
    for (const name of SEVEN_LAYERS) {
      await expect(page.getByRole("heading", { level: 3, name, exact: true })).toBeVisible();
    }

    await page.locator("figure.pr-packet").scrollIntoViewIfNeeded();
    await shot(page, "critic-landing-packet");
    await shot(page, "critic-landing-protocol-full", true);
  });

  test("carries the codec rule, the container layout and working spec links", async ({ page }) => {
    await page.goto("/protocol");

    await expect(page.getByRole("heading", { name: /codec rule/i })).toBeVisible();
    const rule = page.locator(".pr-rule");
    await expect(rule).toContainText("MUST");
    await expect(rule).toContainText("MUST NOT");
    await expect(rule).toContainText(/aac/i);

    const tree = page.locator(".pr-tree");
    await expect(tree).toContainText("manifest.json");
    await expect(tree).toContainText("assets/");

    for (const href of ["/protocol/v1.schema.json", "/protocol/v2.schema.json"]) {
      await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
      const res = await page.request.get(href);
      expect(res.ok(), `${href} must resolve`).toBeTruthy();
      const body = JSON.parse(await res.text()) as Record<string, unknown>;
      expect(Object.keys(body).length, `${href} must be a real schema document`).toBeGreaterThan(0);
    }
    await expect(
      page.locator('a[href*="docs/format-spec.md"]').first(),
      "the full specification must be one click away",
    ).toBeVisible();

    await page.locator(".pr-rule").scrollIntoViewIfNeeded();
    await shot(page, "critic-landing-codec");
  });

  test("the download button emits a .storysync whose assets are bundled, not linked", async ({
    page,
  }, testInfo) => {
    await page.goto("/protocol");
    const button = page.locator('[data-protocol="download-demo"]');
    await expect(button).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 25000 }),
      button.click(),
    ]);

    const suggested = download.suggestedFilename();
    expect(suggested.endsWith(".storysync"), `suggested filename was "${suggested}"`).toBeTruthy();

    const file = testInfo.outputPath(suggested);
    await download.saveAs(file);
    const bytes = new Uint8Array(fs.readFileSync(file));
    expect(Array.from(bytes.slice(0, 4)), "must be a ZIP").toEqual([0x50, 0x4b, 0x03, 0x04]);

    const entries = unzipSync(bytes);
    const manifestText = strFromU8(entries["manifest.json"]);
    const manifest = JSON.parse(manifestText) as {
      version: string;
      pages: Array<{ id: number; illustration?: { url?: string } }>;
    };
    expect(manifest.version, "the container must declare v2").toBe("2.0");

    // The inlining half of the bar: no *media* reference may still point out of
    // the container — neither at the origin it was fetched from nor at a fat
    // data: URL left in the JSON. (signature.qrCode.data is a share link, not
    // media, and legitimately stays a URL.)
    expect(manifestText, "images must be bundled, not linked back to the site").not.toContain(
      "/demo/images/",
    );
    expect(manifestText, "data: URLs must be extracted into assets/").not.toContain("data:image");
    const mediaUrls = JSON.stringify(manifest.pages);
    expect(mediaUrls).not.toMatch(/"(url|audioUrl)"\s*:\s*"(https?:|data:)/);

    let illustrated = 0;
    for (const p of manifest.pages) {
      const url = p.illustration?.url;
      if (!url) continue;
      illustrated += 1;
      expect(url.startsWith("assets/"), `page ${p.id} → ${url}`).toBeTruthy();
      const asset = entries[url];
      expect(asset, `${url} must be inside the container`).toBeTruthy();
      // Real image bytes: JPEG (FF D8 FF) or PNG (89 P N G).
      const magic = Array.from(asset.slice(0, 3));
      const jpeg = magic[0] === 0xff && magic[1] === 0xd8 && magic[2] === 0xff;
      const png = magic[0] === 0x89 && magic[1] === 0x50 && magic[2] === 0x4e;
      expect(jpeg || png, `${url} should be a decodable image`).toBeTruthy();
      expect(asset.length, `${url} should not be a stub`).toBeGreaterThan(2048);
    }
    expect(illustrated, "the demo tape must carry illustrations").toBeGreaterThanOrEqual(5);

    await expect(page.locator('[data-protocol="download-status"]')).toContainText(".storysync");
    await page.locator(".pr-take").scrollIntoViewIfNeeded();
    await shot(page, "critic-landing-download");
  });

  test("no horizontal overflow at the project viewport (landing hero and /protocol)", async ({
    page,
  }) => {
    for (const route of ["/", "/protocol"]) {
      await page.goto(route);
      const overflow = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
      }));
      expect(
        overflow.scrollW,
        `${route} overflows sideways: scrollWidth ${overflow.scrollW} vs viewport ${overflow.innerW}`,
      ).toBeLessThanOrEqual(overflow.innerW + 2);
    }
  });
});

/* ===========================================================================
   Round-2 falsification probes — the failure modes a passing round-1 gate
   would not have caught: coming back from the Read Room, a double press, a
   second download, and a clean console on both routes.
   ========================================================================= */

test.describe("CRITIC · WP-L round 2: try to break it", () => {
  test("back from the Read Room restores the tape, and press play works twice", async ({
    page,
  }) => {
    await warmRead(page);
    await page.goto("/");
    await page.locator('[data-ls="press-play"]').click();
    await page.waitForURL(/\/read\?demo=1/, { timeout: 4000 });
    await expect(page.getByRole("button", { name: "Tap to Begin" })).toBeVisible({ timeout: 4000 });

    await page.goBack();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 4000 });
    await page.evaluate(() => window.scrollTo(0, 0));

    const stage = page.locator('[data-ls="tape-stage"]');
    await expect(stage, "the deck must be idle again after back").toHaveAttribute(
      "data-inserting",
      "false",
    );

    // The cassette must be on screen again — not left swallowed and invisible
    // by an animation-fill-mode: forwards that survived the route change.
    const restored = await page.evaluate(() => {
      const slide = document.querySelector<HTMLElement>('[data-ls="tape-slide"]');
      const cassette = document.querySelector<HTMLElement>(".ls-cassette");
      if (!slide || !cassette) return null;
      const m = new DOMMatrixReadOnly(getComputedStyle(slide).transform);
      const box = cassette.getBoundingClientRect();
      return {
        y: m.m42,
        opacity: Number(getComputedStyle(slide).opacity),
        height: box.height,
        onScreen: box.bottom > 0 && box.top < window.innerHeight,
      };
    });
    expect(restored, "the hero must still have its tape after back").not.toBeNull();
    expect(Math.abs(restored!.y), `tape still displaced by ${restored!.y}px`).toBeLessThan(4);
    expect(restored!.opacity, "the tape must be opaque again").toBeGreaterThan(0.9);
    expect(restored!.height, "the tape must have real size").toBeGreaterThan(120);
    expect(restored!.onScreen, "the tape must be back in the hero viewport").toBeTruthy();

    // …and the whole moment must be repeatable.
    await page.locator('[data-ls="press-play"]').click();
    await page.waitForURL(/\/read\?demo=1/, { timeout: 4000 });
    await expect(page.getByRole("button", { name: "Tap to Begin" })).toBeVisible({ timeout: 4000 });
  });

  test("a double press threads one tape, not two", async ({ page }) => {
    await warmRead(page);
    await page.goto("/");

    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    const press = page.locator('[data-ls="press-play"]');
    await press.click();
    await press.click({ force: true }); // the impatient four-year-old
    await page.waitForURL(/\/read\?demo=1/, { timeout: 4000 });
    await expect(page.getByRole("button", { name: "Tap to Begin" })).toBeVisible({ timeout: 4000 });

    // One entry in history: back must land on the landing, not on /read again.
    await page.goBack();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 4000 });
    expect(errors, `page errors during the double press: ${errors.join(" | ")}`).toEqual([]);
  });

  test("the demo can be packed twice in a row", async ({ page }) => {
    await page.goto("/protocol");
    const button = page.locator('[data-protocol="download-demo"]');

    for (const attempt of [1, 2]) {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 25000 }),
        button.click(),
      ]);
      expect(
        download.suggestedFilename().endsWith(".storysync"),
        `attempt ${attempt} suggested "${download.suggestedFilename()}"`,
      ).toBeTruthy();
      await expect(button, `attempt ${attempt} left the button disabled`).toBeEnabled({
        timeout: 10000,
      });
    }
  });

  test("neither route logs a console error or throws", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(`pageerror: ${e}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") problems.push(`console.error: ${msg.text()}`);
    });

    for (const route of ["/", "/protocol"]) {
      await page.goto(route);
      await expect(page.locator("main, .ls-root, .pr-root").first()).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(page.locator("footer").first()).toBeVisible();
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

  test("the packed tape really plays: download it, drop it on the reader", async ({ page }) => {
    await page.goto("/protocol");
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 25000 }),
      page.locator('[data-protocol="download-demo"]').click(),
    ]);
    // Deliberately an ASCII path: Chromium silently attaches nothing when a
    // file is handed to an <input type=file> from a path containing the "·"
    // in this suite's test names.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ssync-critic-"));
    const file = path.join(dir, "roundtrip.storysync");
    await download.saveAs(file);
    expect(fs.statSync(file).size, "the packed tape must have bytes").toBeGreaterThan(1024);

    // The claim on the page is "drop it back on the reader and it plays".
    // Take it literally: the Read Room unpacks this container locally.
    await page.goto("/read");
    const input = page.locator('input[type="file"]');
    await expect(input).toHaveCount(1);
    // Retry until React has hydrated and owns the change handler (no long
    // sleeps). Each attempt uses a distinct copy: React suppresses a change
    // event when the input's value string has not changed.
    let attempt = 0;
    await expect(async () => {
      attempt += 1;
      const copy = path.join(dir, `roundtrip-${attempt}.storysync`);
      fs.copyFileSync(file, copy);
      await input.setInputFiles(copy);
      await expect(input).toHaveCount(0, { timeout: 2000 });
    }).toPass({ timeout: 20000 });

    // It is a playing tape, not just a parsed file: the illustration and the
    // first page's words are on screen.
    await expect(page.getByRole("img", { name: /tiny star shining brighter/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Once", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/01\s*\/\s*08/)).toBeVisible();
    await shot(page, "critic-landing-roundtrip");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("/protocol is one document: a single h1, a main landmark, named links", async ({ page }) => {
    await page.goto("/protocol");
    await shot(page, "critic-landing-protocol-hero");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);

    const unnamed = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a")).filter(
        (a) => !(a.getAttribute("aria-label") ?? a.textContent ?? "").trim(),
      ).length,
    );
    expect(unnamed, "every link on the protocol page must have an accessible name").toBe(0);
  });
});
