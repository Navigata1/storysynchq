/**
 * T23a · /protocol: the exploded packet figure (s08 FIG. 1).
 *
 * One real page of a tape taken apart into its seven layers, as seven printed
 * plates: 01 Metadata at the bottom up to 07 Signature at the top.
 *
 * Seam 1 (Node): `packetPlates(manifest, pageIndex, { assetPath, voiceSeconds })`
 * — the pure module that decides what each plate prints — against the house
 * tape (re-read from public/ here) and Mia's Twinkle fixture (the reference's
 * own page), plus the container's exported asset-naming rule.
 *
 * Seam 2 (E2E): /protocol renders the figure — caption, plate order (DOM and
 * visual), the skew at ≥ 768 px and its absence below, no motion, nothing
 * fetched, and the shipped structure untouched.
 */

import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { packetPlates, type PacketPlate, type PlateManifest } from "../src/components/protocol/plates";
import { PACKET_LAYERS } from "../src/components/protocol/layers";
import {
  buildStorysyncFromStory,
  bytesToDataUrl,
  loadStorysyncToStory,
  mimeForAssetPath,
  packedAssetPath,
  unpackStorysync,
} from "../src/lib/storysync/container";
import type { SsyncManifest } from "../src/lib/storysync/manifest";
import { MOODS } from "../src/lib/audio/moods";
import { DUCK_DEPTH_DB } from "../src/lib/audio/engine";
import { loadTape, TWINKLE } from "./fixtures/tapes";

const REPO = path.join(__dirname, "..");
const HOUSE_JSON = path.join(REPO, "public", "demo", "brave-little-star.ssync.json");

/** Fresh copy every time: tests below mutate their manifests. */
function houseTape(): PlateManifest & SsyncManifest {
  return JSON.parse(fs.readFileSync(HOUSE_JSON, "utf8")) as PlateManifest & SsyncManifest;
}

/** Page 3, as the reference explodes it. */
const PAGE_3 = 2;

const LAYERS = ["Metadata", "Visual", "Text", "Voice", "Sound", "Behavior", "Signature"];
const PATHS = [
  "metadata",
  "pages[].illustration",
  "pages[].text.content",
  "pages[].text.audioUrl",
  "pages[].music",
  "settings · pages[].timing",
  "signature",
];

/**
 * Where the download writes a page's file: the container's own naming rule
 * applied to the MIME type the file is served as (the download fetches the
 * picture, reads it into a data URL, and `buildStorysyncFromStory` names it).
 */
function packedLikeTheDownload(url: string, asset: { pageId: number; kind: "picture" | "voice" }): string {
  if (url.startsWith("assets/")) return url;
  const base = asset.kind === "picture" ? `page-${asset.pageId}` : `narration-${asset.pageId}`;
  return packedAssetPath(url.startsWith("data:") ? url : mimeForAssetPath(url), base);
}

/** The house tape packed for real, exactly as /protocol's download does it. */
function packHouseTapeForReal(): SsyncManifest {
  const story = houseTape();
  for (const page of story.pages) {
    const url = page.illustration?.url;
    if (!url) continue;
    const file = path.join(REPO, "public", url.replace(/^\//, ""));
    page.illustration!.url = bytesToDataUrl(new Uint8Array(fs.readFileSync(file)), mimeForAssetPath(file));
  }
  return unpackStorysync(buildStorysyncFromStory(story)).manifest;
}

function values(plates: PacketPlate[]): string[] {
  return plates.map((p) => p.value);
}

/* ================================================================ Node seam */

test.describe("T23a · packet plates (Node)", () => {
  test("house tape page 3 → seven plates in layer order, verbatim", () => {
    const tape = houseTape();
    const page = tape.pages[PAGE_3];
    const plates = packetPlates(tape, PAGE_3, { assetPath: packedLikeTheDownload });

    expect(plates.map((p) => p.n)).toEqual(["01", "02", "03", "04", "05", "06", "07"]);
    expect(plates.map((p) => p.layer)).toEqual(LAYERS);
    expect(plates.map((p) => p.path)).toEqual(PATHS);
    // The figure and the legend name the same seven, in the same order.
    expect(plates.map((p) => p.layer)).toEqual(PACKET_LAYERS.map((l) => l.name));
    expect(plates.map((p) => p.path)).toEqual(PACKET_LAYERS.map((l) => l.key));

    const [meta, visual, text, voice, sound, behavior, signature] = plates;

    expect(meta.value).toBe("The Brave Little Star · by Island Development Crew · en");
    expect(meta.value).toBe(`${tape.metadata.title} · by ${tape.metadata.author} · ${tape.metadata.language}`);
    expect(meta.empty).toBe(false);

    expect(visual.value).toBe("assets/page-3.jpg · The little star among bigger, sleepy stars");
    expect(visual.value).toBe(`assets/page-3.jpg · ${page.illustration!.alt}`);
    expect(visual.empty).toBe(false);

    expect(text.value).toBe(page.text!.content);
    expect(text.empty).toBe(false);

    expect(voice.value).toBe("none on this page — the browser voice reads it");
    expect(voice.empty).toBe(true);

    expect(sound.value).toBe("Wonder · A major pentatonic · 76 BPM · ducks 12 dB");
    expect(sound.value).toBe(
      `Wonder · ${MOODS.Wonder.scaleName} · ${MOODS.Wonder.tempo} BPM · ducks ${Math.round(DUCK_DEPTH_DB)} dB`,
    );
    expect(sound.empty).toBe(false);

    expect(behavior.value).toBe("autoPause 4s × 1.0 · chime on · words light up");
    expect(behavior.value.startsWith(`autoPause ${page.timing!.autoPause} `)).toBe(true);
    expect(behavior.empty).toBe(false);

    expect(signature.value).toBe("nothing signed on this tape yet");
    expect(signature.empty).toBe(true);
  });

  test("the legacy v1 signature.qrCode is never read", () => {
    const tape = houseTape();
    const qr = (tape.signature as unknown as { qrCode?: { data?: string } }).qrCode;
    expect(qr?.data, "the house tape still carries its v1 qrCode").toBeTruthy();

    for (let i = 0; i < tape.pages.length; i++) {
      for (const plate of packetPlates(tape, i, { assetPath: packedLikeTheDownload })) {
        expect(plate.value).not.toContain("qrCode");
        expect(plate.value).not.toContain(qr!.data!);
        expect(plate.value).not.toContain("storysynchq.com");
      }
    }
  });

  test("Twinkle page 3 with 6.4 s of voice → the reference's plates", () => {
    const { manifest } = loadTape("twinkle");
    const plates = packetPlates(manifest, PAGE_3, { voiceSeconds: TWINKLE.pages[PAGE_3].clipSeconds });
    const [meta, visual, text, voice, sound, behavior, signature] = plates;

    expect(meta.value).toBe("Twinkle Came to My Window · by Mia, age 4 — with Mom · en");
    expect(visual.value).toBe("assets/page-3.jpg · Picture for page 3");
    expect(text.value).toBe("I was scared of the dark. Twinkle came to my window.");
    expect(voice.value).toBe("assets/narration-3.wav · wav · 6.4 s");
    expect(voice.empty).toBe(false);
    expect(sound.value.startsWith("Wonder · A major pentatonic · 76 BPM")).toBe(true);
    expect(behavior.value.startsWith("autoPause 2s × 1.0 · ")).toBe(true);
    expect(signature.value).toBe(
      "© 2026 Mia, age 4 — with Mom · personal use · consent: parent/guardian · 2026-10-19",
    );
    expect(signature.empty).toBe(false);
    expect(plates.filter((p) => p.empty)).toEqual([]);
  });

  test("seconds are printed only when given; one consent clause per record", () => {
    const { manifest } = loadTape("twinkle");
    expect(packetPlates(manifest, PAGE_3)[3].value).toBe("assets/narration-3.wav · wav");

    const two = structuredClone(manifest);
    two.signature!.voiceConsent!.push({ voice: "Grandma Rose", grantedBy: "self", date: "2026-10-20" });
    expect(packetPlates(two, PAGE_3)[6].value).toBe(
      "© 2026 Mia, age 4 — with Mom · personal use · consent: parent/guardian · 2026-10-19 · consent: self · 2026-10-20",
    );
  });

  test("no music → an empty Sound plate; chime off; words stay still", () => {
    const tape = houseTape();
    tape.pages[PAGE_3].music = undefined;
    tape.settings = { ...tape.settings, pageTurnSound: false, readAlongHighlight: false };
    const plates = packetPlates(tape, PAGE_3);

    expect(plates[4].value).toBe("no music on this page — silence, on purpose");
    expect(plates[4].empty).toBe(true);
    expect(plates[5].value).toBe("autoPause 4s × 1.0 · chime off · words stay still");

    tape.settings.accessibility = { timingMultiplier: 1.5 };
    expect(packetPlates(tape, PAGE_3)[5].value).toBe("autoPause 4s × 1.5 · chime off · words stay still");
  });

  test("missing metadata parts are omitted, not printed as blanks", () => {
    const tape = houseTape();
    tape.metadata = { title: "Only a Title" };
    expect(packetPlates(tape, PAGE_3)[0].value).toBe("Only a Title");
    tape.metadata = { title: "Title", language: "fr" };
    expect(packetPlates(tape, PAGE_3)[0].value).toBe("Title · fr");
  });

  test("the container names a JPEG and a WAV data URL the way it packs them", () => {
    const jpeg = "data:image/jpeg;base64,/9j/4AAQ";
    const wav = "data:audio/wav;base64,UklGRiYAAAA=";
    expect(packedAssetPath(jpeg, "page-3")).toBe("assets/page-3.jpg");
    expect(packedAssetPath(wav, "narration-3")).toBe("assets/narration-3.wav");
    // Safari's header carries parameters; the name reads only the type.
    expect(packedAssetPath("data:audio/mp4;codecs=mp4a.40.2;base64,AAAA", "narration-3")).toBe(
      "assets/narration-3.m4a",
    );
    // A bare MIME type names the same file (how /protocol resolves a served picture).
    expect(packedAssetPath("image/jpeg", "page-3")).toBe("assets/page-3.jpg");
    expect(packedAssetPath("application/x-unknown", "page-3")).toBe("assets/page-3.bin");
  });

  test("packing Twinkle with buildStorysyncFromStory still round-trips", () => {
    const tape = loadTape("twinkle");
    const repacked = unpackStorysync(buildStorysyncFromStory(tape.story));
    expect(repacked.manifest).toEqual(tape.manifest);
    const original = unpackStorysync(tape.bytes);
    expect([...repacked.assets.keys()].sort()).toEqual([...original.assets.keys()].sort());
    for (const [p, bytes] of original.assets) {
      expect(Buffer.from(repacked.assets.get(p)!).equals(Buffer.from(bytes)), p).toBe(true);
    }
    expect(loadStorysyncToStory(buildStorysyncFromStory(tape.story))).toEqual(tape.story);
  });

  test("the house tape packed for real puts page 3's picture where the plate says", () => {
    const packed = packHouseTapeForReal();
    expect(packed.pages[PAGE_3].illustration?.url).toBe("assets/page-3.jpg");
    expect(packetPlates(packed, PAGE_3)[1].value).toBe(
      packetPlates(houseTape(), PAGE_3, { assetPath: packedLikeTheDownload })[1].value,
    );
  });
});

/* ================================================================= E2E seam */

const FIG = 'figure[data-protocol="fig-packet"]';
const PLATES = '[data-sk="packet-exploded"] > li';

async function openFigure(page: Page) {
  await page.goto("/protocol");
  const figure = page.locator(FIG);
  await figure.scrollIntoViewIfNeeded();
  await expect(figure).toBeVisible();
  return figure;
}

/** tan(-18°): the c term of a computed skewX(-18deg) matrix. */
const SKEW_C = Math.tan((-18 * Math.PI) / 180);

function parseMatrix(transform: string): number[] | null {
  const m = /^matrix\(([^)]+)\)$/.exec(transform.trim());
  return m ? m[1].split(",").map((n) => Number.parseFloat(n)) : null;
}

test.describe("T23a · /protocol FIG. 1 (E2E)", () => {
  test("the figure: caption, seven plates in layer order, 07 on top, the draft tag", async ({ page }) => {
    const figure = await openFigure(page);

    // A section named by a visually hidden h2.
    const section = page.locator("section", { has: page.locator(FIG) });
    const labelledBy = await section.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const h2 = page.locator(`h2#${labelledBy}`);
    await expect(h2).toHaveText("Taken apart");
    const clipped = await h2.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width <= 1 && r.height <= 1;
    });
    expect(clipped, "the h2 is visually hidden").toBe(true);

    // It comes right after the hero.
    const order = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll("main > section"));
      return sections.map((s) => s.getAttribute("aria-labelledby"));
    });
    expect(order[0]).toBe("pr-title");
    expect(order[1]).toBe(labelledBy);

    const caption = figure.locator("figcaption");
    expect(await caption.evaluate((el) => (el as HTMLElement).innerText.trim())).toBe(
      "FIG. 1 — PAGE 3 OF THE BRAVE LITTLE STAR, TAKEN APART",
    );
    // The title comes from the manifest; the capitals come from CSS.
    expect(await caption.textContent()).toContain(houseTape().metadata.title);
    await expect(caption).toHaveCSS("text-transform", "uppercase");

    await expect(
      figure.getByText(
        "A reader that understands only layers 1–3 still shows the story; each layer above adds a sense.",
        { exact: true },
      ),
    ).toBeVisible();

    const plates = page.locator(PLATES);
    await expect(plates).toHaveCount(7);
    const names = await plates.locator('[data-plate="name"]').allTextContents();
    expect(names.map((n) => n.trim())).toEqual(LAYERS);
    const paths = await plates.locator('[data-plate="path"]').allTextContents();
    expect(paths.map((p) => p.trim())).toEqual(PATHS);

    // Drawn bottom-to-top: 01 lowest, each one above the last, 07 on top.
    const tops = await plates.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i], `plate ${i + 1} sits above plate ${i}`).toBeLessThan(tops[i - 1]);
    }
    expect(Math.max(...tops)).toBe(tops[0]);

    await expect(plates.nth(6)).toContainText("V2.1 · DRAFT");

    // The plate names are not headings: the legend's h3s stay unique.
    await expect(figure.locator("h1, h2, h3, h4, h5, h6")).toHaveCount(0);
  });

  test("each plate prints the house tape's page 3, the picture where the download puts it", async ({ page }) => {
    const figure = await openFigure(page);
    const plates = figure.locator(PLATES);
    const printed = await plates.locator('[data-plate="value"]').allTextContents();

    const expected = values(packetPlates(houseTape(), PAGE_3, { assetPath: packedLikeTheDownload }));
    expect(printed).toEqual(expected);
    // …and the Visual plate's path is the one the real pack writes.
    expect(printed[1]).toBe(packetPlates(packHouseTapeForReal(), PAGE_3)[1].value);

    // Empty plates say so in ink-3 italic.
    for (const i of [3, 6]) {
      const value = plates.nth(i).locator('[data-plate="value"]');
      await expect(value).toHaveCSS("font-style", "italic");
      await expect(value).toHaveCSS("color", "rgb(139, 128, 115)");
    }
    await expect(plates.nth(0).locator('[data-plate="value"]')).not.toHaveCSS("color", "rgb(139, 128, 115)");

    // 02's thumbnail is the same-origin page picture, decorative.
    const thumb = plates.nth(1).locator("img");
    await expect(thumb).toHaveCount(1);
    await expect(thumb).toHaveAttribute("alt", "");
    expect(await thumb.getAttribute("src")).toBe(houseTape().pages[PAGE_3].illustration!.url);
    await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

    // 03 keeps the whole sentence in the DOM, however it is clamped.
    expect(printed[2]).toBe(houseTape().pages[PAGE_3].text!.content);

    // Fills come from the layer tokens; 07 wears the tape-red stroke.
    const fills = await plates.evaluateAll((els) =>
      els.map((el) => {
        const back = el.querySelector<HTMLElement>('[data-plate="backing"]')!;
        const cs = getComputedStyle(back);
        return { bg: cs.backgroundColor, border: cs.borderTopWidth, color: cs.borderTopColor };
      }),
    );
    const tokens = await page.evaluate((layers) => {
      const probe = document.createElement("div");
      document.body.appendChild(probe);
      const out = layers.map((l) => {
        probe.style.backgroundColor = `var(--ss-layer-${l.toLowerCase()})`;
        return getComputedStyle(probe).backgroundColor;
      });
      probe.remove();
      return out;
    }, LAYERS);
    expect(fills.map((f) => f.bg)).toEqual(tokens);
    for (const f of fills.slice(0, 6)) {
      expect(f.border).toBe("2px");
      expect(f.color).toBe("rgb(30, 26, 22)");
    }
    // 3.5 px, as the engine paints it: borders snap to whole device pixels (3px at DPR 1).
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    expect(fills[6].border).toBe(`${Math.floor(3.5 * dpr) / dpr}px`);
    expect(Number.parseFloat(fills[6].border)).toBeGreaterThan(2);
    expect(fills[6].color).toBe("rgb(227, 69, 47)");
    await expect(plates.nth(6).locator('[data-plate="tag"]')).toHaveCSS("color", "rgb(180, 48, 31)");
  });

  test("≥ 768 px the plates are skewed parallelograms, each 14 px right of the one below", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const figure = await openFigure(page);
    const plates = figure.locator(PLATES);

    const geo = await plates.evaluateAll((els) =>
      els.map((el) => {
        const back = el.querySelector<HTMLElement>('[data-plate="backing"]')!;
        const r = el.getBoundingClientRect();
        return { transform: getComputedStyle(back).transform, left: r.left, top: r.top, bottom: r.bottom };
      }),
    );
    for (const g of geo) {
      const m = parseMatrix(g.transform);
      expect(m, `backing transform ${g.transform}`).not.toBeNull();
      expect(m![0]).toBeCloseTo(1, 4);
      expect(m![1]).toBeCloseTo(0, 4);
      expect(m![2]).toBeCloseTo(SKEW_C, 4);
      expect(m![3]).toBeCloseTo(1, 4);
    }
    for (let i = 1; i < geo.length; i++) {
      expect(geo[i].left - geo[i - 1].left, `plate ${i + 1} shifts right`).toBeCloseTo(14, 0);
      expect(geo[i - 1].top - geo[i].bottom, `the gap under plate ${i + 1}`).toBeCloseTo(10, 0);
    }

    // The contents stay upright.
    const upright = await plates.evaluateAll((els) =>
      els.every((el) => {
        let node = el.querySelector<HTMLElement>('[data-plate="name"]');
        while (node && node !== el) {
          const t = getComputedStyle(node).transform;
          if (t !== "none" && !/^matrix\(1, 0, 0, 1,/.test(t)) return false;
          node = node.parentElement;
        }
        return true;
      }),
    );
    expect(upright).toBe(true);
  });

  test("below 768 px the plates lie flat, full width, unshifted, still 07 on top", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const figure = await openFigure(page);
    const plates = figure.locator(PLATES);

    const geo = await plates.evaluateAll((els) =>
      els.map((el) => {
        const back = el.querySelector<HTMLElement>('[data-plate="backing"]')!;
        const r = el.getBoundingClientRect();
        const b = back.getBoundingClientRect();
        return { transform: getComputedStyle(back).transform, left: r.left, right: Math.max(r.right, b.right), top: r.top };
      }),
    );
    for (const g of geo) {
      expect(g.transform).toBe("none");
      expect(g.right).toBeLessThanOrEqual(375);
      expect(g.left).toBeCloseTo(geo[0].left, 0);
    }
    for (let i = 1; i < geo.length; i++) expect(geo[i].top).toBeLessThan(geo[i - 1].top);

    const ol = await figure.locator('[data-sk="packet-exploded"]').boundingBox();
    const li = await plates.first().boundingBox();
    expect(Math.abs(li!.width - ol!.width), "full width").toBeLessThanOrEqual(1);

    const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scroll).toBeLessThanOrEqual(375);
  });

  for (const motion of ["no-preference", "reduce"] as const) {
    test(`the figure is static (${motion} motion) and the shipped structure holds`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: motion });
      const requests: string[] = [];
      page.on("request", (req) => requests.push(req.url()));
      const figure = await openFigure(page);
      await page.mouse.move(400, 400);

      const motionLeft = await figure.evaluate((root) =>
        [root, ...Array.from(root.querySelectorAll("*"))]
          .map((el) => {
            const cs = getComputedStyle(el);
            const moving =
              cs.animationName !== "none" ||
              cs.transitionDuration.split(",").some((d) => Number.parseFloat(d) > 0);
            return moving ? `${el.tagName}.${el.getAttribute("class")}: ${cs.animationName} / ${cs.transitionDuration}` : "";
          })
          .filter(Boolean),
      );
      expect(motionLeft).toEqual([]);

      // Nothing fetched for it: the manifest is a static import.
      expect(requests.filter((u) => u.includes(".ssync.json"))).toEqual([]);
      const origin = new URL(page.url()).origin;
      const pictures = requests.filter((u) => /\.(jpe?g|png|webp)(\?|$)/i.test(u));
      for (const u of pictures) expect(new URL(u).origin).toBe(origin);

      // Shipped structure untouched.
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      for (const name of LAYERS) {
        await expect(page.getByRole("heading", { level: 3, name, exact: true })).toHaveCount(1);
      }
      await expect(page.getByRole("heading", { level: 3, name: "Visual", exact: true })).toBeVisible();
      await expect(page.locator("[data-protocol-layer]")).toHaveCount(7);
      const svgLayerTexts = await page.evaluate((layers) =>
        Array.from(document.querySelectorAll("svg text"))
          .filter((t) => layers.includes((t.textContent ?? "").trim()))
          .every((t) => t.closest("svg.pr-packet-svg") !== null),
      LAYERS);
      expect(svgLayerTexts).toBe(true);
      await expect(figure.locator("a")).toHaveCount(0);
      await expect(page.locator('a[href*="docs/format-spec.md"]')).toHaveCount(2);
      await expect(page.locator('a[href="/protocol/v1.schema.json"]')).toHaveCount(1);
      await expect(page.locator('a[href="/protocol/v2.schema.json"]')).toHaveCount(1);
    });
  }

  test("assistive tech reads the plates in layer order, with their values", async ({ page }) => {
    const figure = await openFigure(page);
    const list = figure.getByRole("list");
    await expect(list).toHaveCount(1);
    const items = list.getByRole("listitem");
    await expect(items).toHaveCount(7);
    const first = (await items.first().textContent()) ?? "";
    expect(first.indexOf("Metadata")).toBeGreaterThanOrEqual(0);
    expect(first).toContain("The Brave Little Star");
    // Nothing in the figure takes focus: it is print.
    const focusable = await figure.evaluate(
      (root) => root.querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])').length,
    );
    expect(focusable).toBe(0);
  });
});
