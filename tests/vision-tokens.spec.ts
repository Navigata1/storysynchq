/**
 * T05a — the reference foundation tokens live in the app, once
 * (docs/vision/tickets/T05a-foundation-tokens.md; HANDOFF §6 step 1;
 * brief `design_system` TOKENS + TYPE; docs/vision/reference/foundation.css).
 *
 *   · Node: the typed mirror `src/components/studio-kit/tokens.ts` names every
 *     token the ticket lists, with the values foundation.css `.ss-screen` and
 *     the brief give (read from the reference file itself, so a mirror typo
 *     fails). MOOD_COLOR is keyed by the shared MOOD_NAMES. LAYER_FILL feeds
 *     the protocol's packet layers. globals.css carries the Tailwind 4
 *     `@theme inline` wiring. kit.css draws from the tokens instead of
 *     literals and uses the one easing family in its transitions.
 *   · E2E (desktop + mobile): on `/`, `/read`, `/studio`, `/protocol` every
 *     computed `:root` custom property equals the mirror (the drift check);
 *     BigButton transitions on `--ss-ease`; an italic 800 Fraunces face and
 *     Plex Mono 600 are self-hosted; the tape label renders exactly as before;
 *     `/classic`'s body background is untouched.
 *
 * Expected names and the ticket's literal values are hard-coded here (not
 * imported from the source) so the test can fail.
 */

import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  LAYER_FILL,
  LOCAL,
  MOOD_COLOR,
  REGISTER_A,
  REGISTER_B,
  SS_EASE,
  SS_FONT,
  STUDIO,
  TAPE,
} from "../src/components/studio-kit/tokens";
import { MOOD_NAMES } from "../src/lib/audio/moods";
import { PACKET_LAYERS } from "../src/components/protocol/layers";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const ROUTES = ["/", "/read", "/studio", "/protocol"] as const;

/* ------------------------------------------------------------ name helpers */

/** camelCase mirror key → kebab token suffix: navy2 → navy-2, tapeBrown1 → tape-brown-1. */
function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/(\d+)/g, "-$1");
}
const ssVar = (key: string) => `--ss-${kebab(key)}`;

/** Every mirrored token as [custom property, value]. */
function mirrorTokens(): Array<[string, string]> {
  return [
    ...Object.entries(REGISTER_A).map(([k, v]) => [ssVar(k), v] as [string, string]),
    ...Object.entries(REGISTER_B).map(([k, v]) => [ssVar(k), v] as [string, string]),
    ...Object.entries(LOCAL).map(([k, v]) => [ssVar(k), v] as [string, string]),
    ...Object.entries(MOOD_COLOR).map(
      ([k, v]) => [`--mood-${k.toLowerCase()}`, v] as [string, string],
    ),
    ...Object.entries(LAYER_FILL).map(
      ([k, v]) => [`--ss-layer-${k.toLowerCase()}`, v] as [string, string],
    ),
    ["--ss-ease", SS_EASE],
  ];
}

/** The `.ss-screen { … }` custom properties of the reference foundation. */
function foundationTokens(): Record<string, string> {
  const css = read("docs/vision/reference/foundation.css");
  const block = css.match(/\.ss-screen\s*\{([\s\S]*?)\n\}/);
  if (!block) throw new Error("foundation.css: no .ss-screen block");
  const out: Record<string, string> = {};
  for (const m of block[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

/** The body of every `@theme inline { … }` block in a stylesheet. */
function themeInline(css: string): string {
  return [...css.matchAll(/@theme\s+inline\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
}

/* ------------------------------------------------------- expected (ticket) */

const REGISTER_A_NAMES = [
  "--ss-navy", "--ss-navy-2", "--ss-navy-3", "--ss-navy-4",
  "--ss-line", "--ss-line-2", "--ss-glass", "--ss-glass-2",
  "--ss-fg", "--ss-fg-2", "--ss-fg-3", "--ss-fg-4",
  "--ss-gold", "--ss-gold-2", "--ss-violet", "--ss-violet-2", "--ss-ok",
];
const REGISTER_B_NAMES = [
  "--ss-paper", "--ss-paper-2", "--ss-paper-3",
  "--ss-ink", "--ss-ink-2", "--ss-ink-3",
  "--ss-label", "--ss-red", "--ss-shell", "--ss-shell-2",
];
const LOCAL_EXPECTED: Record<string, string> = {
  "--ss-kraft": "#DFD2B8",
  "--ss-tape-brown": "linear-gradient(180deg, #5b3a24, #3d2616)",
  "--ss-tape-brown-1": "#5b3a24",
  "--ss-tape-brown-2": "#3d2616",
  "--ss-crayon-paper": "#FBF7EC",
  "--ss-red-ink": "#B4301F",
  "--ss-shell-hi": "#4a443e",
  "--ss-foot-1": "#2e2a27",
  "--ss-foot-2": "#24211f",
  "--ss-slot": "#05070d",
};
/** brief design_system: "Moods, fixed color + sprite icon". */
const BRIEF_MOODS: Record<string, string> = {
  Wonder: "#f5b544",
  Adventure: "#f28c38",
  Calm: "#5db4e8",
  Joy: "#f7d348",
  Hush: "#a98bf5",
  Rain: "#8c9bb0",
  Suspense: "#7b7fe8",
  Melancholy: "#e58fa6",
};
/** brief design_system: "Packet layer fills" — also the protocol diagram's existing fills. */
const LAYERS_EXPECTED: Array<[string, string]> = [
  ["Metadata", "#EFE9DC"],
  ["Visual", "#E4E0FA"],
  ["Text", "#FBF3DF"],
  ["Voice", "#FADFDA"],
  ["Sound", "#FBEBD2"],
  ["Behavior", "#E6E9EE"],
  ["Signature", "#FFE9A8"],
];
const EASE = "cubic-bezier(0.22, 0.8, 0.24, 1)";
const TYPE_EXPECTED = {
  display: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
  ui: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  mono: "var(--font-plex-mono), ui-monospace, Menlo, monospace",
};

/** Hex the kit used to repeat as literals; each now has a token. */
const TOKENISED_HEX: Record<string, string> = {
  ink: "#1e1a16",
  paper: "#fffdf6",
  label: "#ffc93c",
  red: "#e3452f",
  gold: "#f59e0b",
  violet: "#7c6bff",
  navy: "#0a0e1a",
};

/* ---------------------------------------------------------------- browser */

async function computedRoot(page: Page, names: string[]): Promise<Record<string, string>> {
  return page.evaluate((list) => {
    const cs = getComputedStyle(document.documentElement);
    const out: Record<string, string> = {};
    for (const n of list) out[n] = cs.getPropertyValue(n).trim().toLowerCase();
    return out;
  }, names);
}

interface Resolved {
  name: string;
  /** `getComputedStyle(:root).getPropertyValue(name).trim().toLowerCase()` */
  raw: string;
  /** What the token renders as: a probe styled with `var(name)`. */
  viaToken: string;
  /** What the mirror renders as: the same probe styled with the mirror value. */
  viaMirror: string;
}

/**
 * The drift check. Next's CSS pipeline (Lightning CSS) re-serialises values
 * on the way to the browser — `rgba(255, 255, 255, 0.1)` arrives as
 * `#ffffff1a`, `#ffffff` as `#fff`, `cubic-bezier(0.22, …)` as `.22` — so the
 * raw custom-property string is not a stable thing to compare. What must not
 * drift is the value each token resolves to: a probe element styled with
 * `var(--token)` must compute exactly as the same probe styled with the
 * mirror's literal (colour → `color`, gradient → `background-image`, easing →
 * `transition-timing-function`). Any changed digit fails; so does a missing
 * token (empty `raw`).
 */
async function resolveTokens(page: Page, tokens: Array<[string, string]>): Promise<Resolved[]> {
  return page.evaluate((list) => {
    const root = getComputedStyle(document.documentElement);
    const probe = document.createElement("i");
    probe.setAttribute("aria-hidden", "true");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    const prop = (name: string, value: string) =>
      name === "--ss-ease"
        ? "transition-timing-function"
        : value.includes("gradient(")
          ? "background-image"
          : "color";
    const render = (property: string, value: string) => {
      probe.style.removeProperty(property);
      probe.style.setProperty(property, value);
      return getComputedStyle(probe).getPropertyValue(property);
    };
    const out = list.map(([name, value]) => {
      const property = prop(name, value);
      return {
        name,
        raw: root.getPropertyValue(name).trim().toLowerCase(),
        viaToken: render(property, `var(${name})`),
        viaMirror: render(property, value),
      };
    });
    probe.remove();
    return out;
  }, tokens);
}

/* =================================================================== Node */

test.describe("T05a · tokens mirror (Node)", () => {
  test("mirror names every ticket token, with the reference values", () => {
    const ref = foundationTokens();

    const aNames = Object.keys(REGISTER_A).map(ssVar);
    expect([...aNames].sort()).toEqual([...REGISTER_A_NAMES].sort());
    for (const [k, v] of Object.entries(REGISTER_A)) {
      expect(v.toLowerCase(), `REGISTER_A.${k} vs foundation ${ssVar(k)}`).toBe(
        ref[ssVar(k)]?.toLowerCase(),
      );
    }

    const bNames = Object.keys(REGISTER_B).map(ssVar);
    expect([...bNames].sort()).toEqual([...REGISTER_B_NAMES].sort());
    for (const [k, v] of Object.entries(REGISTER_B)) {
      expect(v.toLowerCase(), `REGISTER_B.${k} vs foundation ${ssVar(k)}`).toBe(
        ref[ssVar(k)]?.toLowerCase(),
      );
    }

    const local = Object.fromEntries(Object.entries(LOCAL).map(([k, v]) => [ssVar(k), v]));
    expect(local).toEqual(LOCAL_EXPECTED);

    expect(SS_EASE).toBe(EASE);
    expect(ref["--ss-ease"]).toBe(EASE);
    expect(SS_FONT).toEqual(TYPE_EXPECTED);
  });

  test("MOOD_COLOR is keyed by MOOD_NAMES and carries the brief's eight colours", () => {
    expect(Object.keys(MOOD_COLOR)).toEqual([...MOOD_NAMES]);
    expect(MOOD_COLOR).toEqual(BRIEF_MOODS);
    const ref = foundationTokens();
    for (const name of MOOD_NAMES) {
      expect(ref[`--mood-${name.toLowerCase()}`]).toBe(MOOD_COLOR[name].toLowerCase());
    }
  });

  test("LAYER_FILL feeds the protocol's seven packet layers, values unchanged", () => {
    expect(Object.entries(LAYER_FILL)).toEqual(LAYERS_EXPECTED);
    expect(PACKET_LAYERS.map((l) => [l.name, l.fill])).toEqual(LAYERS_EXPECTED);
    for (const layer of PACKET_LAYERS) {
      expect(layer.fill).toBe(LAYER_FILL[layer.name as keyof typeof LAYER_FILL]);
    }
    const src = read("src/components/protocol/layers.ts");
    expect(src).toMatch(/LAYER_FILL/);
    expect(src).not.toMatch(/fill:\s*"#/);
  });

  test("kit TAPE / STUDIO re-export the mirror with the same keys and values", () => {
    expect(TAPE).toEqual({
      paper: "#FFFDF6",
      ink: "#1E1A16",
      label: "#FFC93C",
      red: "#E3452F",
      shell: "#3B3733",
    });
    expect(STUDIO).toEqual({ bg: "#0a0e1a", gold: "#F59E0B", violet: "#7C6BFF" });
    expect(TAPE.paper).toBe(REGISTER_B.paper);
    expect(STUDIO.bg).toBe(REGISTER_A.navy);

    const kit = read("src/components/studio-kit/kit.tsx");
    expect(kit).toMatch(/export\s*\{[^}]*\bTAPE\b[^}]*\}\s*from\s*"\.\/tokens"/);
    expect(kit).toMatch(/export\s*\{[^}]*\bSTUDIO\b[^}]*\}\s*from\s*"\.\/tokens"/);
    expect(kit).not.toMatch(/export const (TAPE|STUDIO)\b/);
    // the kit layout convention is written down where builders read it
    expect(kit).toMatch(/studio-kit\/<Name>\.tsx/);
    expect(read("CLAUDE.md")).toMatch(/studio-kit\/<Name>\.tsx/);
  });

  test("globals.css: :root tokens + Tailwind 4 @theme inline wiring", () => {
    const css = read("src/app/globals.css");
    const theme = themeInline(css);
    for (const decl of [
      "--color-ss-navy: var(--ss-navy)",
      "--color-ss-ink: var(--ss-ink)",
      "--color-mood-wonder: var(--mood-wonder)",
      "--color-ss-layer-signature: var(--ss-layer-signature)",
      "--ease-ss: var(--ss-ease)",
      "--font-ss-display: var(--ss-display)",
      "--font-ss-ui: var(--ss-ui)",
      "--font-ss-mono: var(--ss-mono)",
    ]) {
      expect(theme, decl).toContain(`${decl};`);
    }
    // every colour token gets a utility namespace
    for (const [name] of mirrorTokens()) {
      if (name === "--ss-ease" || name === "--ss-tape-brown") continue;
      const util = `--color-${name.slice(2)}`; // --ss-navy → --color-ss-navy, --mood-joy → --color-mood-joy
      expect(theme, util).toContain(`${util}: var(${name});`);
    }
    // body background is not this ticket's to change
    expect(css).toMatch(/--background:\s*#0f1419;/);
  });

  test("kit.css draws from tokens and transitions on the one easing family", () => {
    const css = read("src/components/studio-kit/kit.css");
    for (const [name, hex] of Object.entries(TOKENISED_HEX)) {
      expect(css.toLowerCase(), `kit.css still repeats ${name} ${hex}`).not.toContain(hex);
    }
    const transitions = [...css.matchAll(/transition(?:-timing-function)?\s*:([^;]+);/g)].map(
      (m) => m[1],
    );
    expect(transitions.length).toBeGreaterThan(0);
    for (const t of transitions) expect(t).not.toMatch(/ease-out|cubic-bezier/);
    expect(css).toContain("var(--ss-ease)");
  });
});

/* ==================================================================== E2E */

test.describe("T05a · tokens in the browser", () => {
  for (const route of ROUTES) {
    test(`${route}: every :root token equals the mirror`, async ({ page }) => {
      await page.goto(route);
      const tokens = mirrorTokens();
      const resolved = await resolveTokens(page, tokens);
      expect(resolved).toHaveLength(tokens.length);
      for (const t of resolved) {
        expect(t.raw, `${t.name} is not defined on :root`).not.toBe("");
        expect(t.viaToken, t.name).toBe(t.viaMirror);
      }
      // the probe is not vacuous: two different tokens resolve differently
      const byName = Object.fromEntries(resolved.map((t) => [t.name, t.viaToken]));
      expect(byName["--ss-navy"]).toBe("rgb(10, 14, 26)");
      expect(byName["--ss-line"]).toBe("rgba(255, 255, 255, 0.1)");
      expect(byName["--ss-ease"]).toBe(EASE);
      // values that survive the CSS pipeline verbatim still match the raw string
      for (const t of resolved) {
        if (/^#[0-9a-f]{6}$/.test(t.raw)) {
          const mirror = tokens.find(([n]) => n === t.name)![1].toLowerCase();
          if (/^#[0-9a-f]{6}$/.test(mirror)) expect(t.raw, t.name).toBe(mirror);
        }
      }

      // type tokens resolve through next/font's self-hosted families on :root
      const fonts = await computedRoot(page, [
        "--font-fraunces",
        "--font-geist-sans",
        "--font-plex-mono",
        "--ss-display",
        "--ss-ui",
        "--ss-mono",
      ]);
      expect(fonts["--font-fraunces"]).not.toBe("");
      expect(fonts["--font-geist-sans"]).not.toBe("");
      expect(fonts["--font-plex-mono"]).not.toBe("");
      // the production CSS minifier drops the space after each comma in a
      // font stack, so compare stacks with comma spacing normalised
      const stack = (s: string) => s.replace(/\s*,\s*/g, ",");
      const resolve = (s: string) =>
        stack(
          s
            .replace("var(--font-fraunces)", fonts["--font-fraunces"])
            .replace("var(--font-geist-sans)", fonts["--font-geist-sans"])
            .replace("var(--font-plex-mono)", fonts["--font-plex-mono"])
            .toLowerCase(),
        );
      expect(stack(fonts["--ss-display"])).toBe(resolve(SS_FONT.display));
      expect(stack(fonts["--ss-ui"])).toBe(resolve(SS_FONT.ui));
      expect(stack(fonts["--ss-mono"])).toBe(resolve(SS_FONT.mono));
    });
  }

  test("/studio: BigButton transitions on --ss-ease, durations unchanged", async ({ page }) => {
    await page.goto("/studio");
    const big = page.locator('[data-sk="big"]').first();
    await expect(big).toBeAttached();
    const t = await big.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { fn: cs.transitionTimingFunction, dur: cs.transitionDuration };
    });
    expect(t.fn).toContain(EASE);
    expect(t.fn).not.toContain("ease-out");
    expect(t.dur).toBe("0.16s, 0.24s, 0.24s, 0.24s, 0.2s");
  });

  test("/: italic 800 Fraunces and Plex Mono 600 are self-hosted", async ({ page }) => {
    const thirdParty: string[] = [];
    page.on("request", (r) => {
      const host = new URL(r.url()).hostname;
      if (host !== "localhost" && host !== "127.0.0.1") thirdParty.push(r.url());
    });
    await page.goto("/");
    const r = await page.evaluate(async () => {
      await document.fonts.ready;
      const cs = getComputedStyle(document.documentElement);
      const first = (v: string) => v.split(",")[0].trim();
      // next/font's self-hosted family names, as :root sees them
      const fraunces = first(cs.getPropertyValue("--font-fraunces"));
      const plex = first(cs.getPropertyValue("--font-plex-mono"));
      if (!fraunces || !plex) return { fraunces, italic: [], upright: [], mono: [], check: false };
      const shape = (faces: FontFace[]) =>
        faces.map((f) => ({ family: f.family, style: f.style, weight: f.weight }));
      const italic = shape(await document.fonts.load(`italic 800 20px ${fraunces}`));
      const upright = shape(await document.fonts.load(`800 20px ${fraunces}`));
      const mono = shape(await document.fonts.load(`600 12px ${plex}`));
      return {
        fraunces,
        italic,
        upright,
        mono,
        check: document.fonts.check(`italic 800 20px ${fraunces}`),
      };
    });
    expect(r.fraunces).not.toBe("");
    const covers = (weight: string, w: number) => {
      const [lo, hi = lo] = weight.split(/\s+/).map(Number);
      return lo <= w && w <= hi;
    };
    // an italic face, on the variable wght axis (weight omitted → 100–900)
    const italic = r.italic.find((f) => f.style === "italic");
    expect(italic, JSON.stringify(r.italic)).toBeTruthy();
    expect(covers(italic!.weight, 800), italic!.weight).toBe(true);
    expect(covers(italic!.weight, 100) && covers(italic!.weight, 900), italic!.weight).toBe(true);
    const upright = r.upright.find((f) => f.style === "normal");
    expect(upright && covers(upright.weight, 800), JSON.stringify(r.upright)).toBe(true);
    expect(r.check).toBe(true);
    expect(r.mono.some((f) => covers(f.weight, 600)), JSON.stringify(r.mono)).toBe(true);
    expect(thirdParty).toEqual([]);
  });

  for (const route of ["/", "/read"] as const) {
    test(`${route}: tape label renders unchanged (guard)`, async ({ page }) => {
      await page.goto(route);
      const tape = page.locator('[data-sk="tape"]').first();
      await expect(tape).toBeAttached();
      const s = await tape.evaluate((el) => {
        const cs = getComputedStyle(el);
        const stripe = el.querySelector(".sk-tape-stripe");
        const band = el.querySelector(".sk-tape-band");
        return {
          border: cs.borderTopColor,
          paper: cs.backgroundColor,
          ink: cs.color,
          stripe: stripe ? getComputedStyle(stripe).backgroundColor : null,
          band: band ? getComputedStyle(band).backgroundColor : null,
        };
      });
      expect(s.border).toBe("rgb(30, 26, 22)");
      expect(s.stripe).toBe("rgb(227, 69, 47)");
      expect(s.paper).toBe("rgb(255, 253, 246)");
      expect(s.ink).toBe("rgb(30, 26, 22)");
    });
  }

  test("/protocol: packet bands keep their seven fills", async ({ page }) => {
    await page.goto("/protocol");
    const fills = await page.evaluate(() =>
      [...document.querySelectorAll("text[data-protocol-layer]")].map((t) => [
        t.getAttribute("data-protocol-layer"),
        t.previousElementSibling?.getAttribute("fill") ?? null,
      ]),
    );
    expect(fills.slice(0, 7)).toEqual(LAYERS_EXPECTED);
  });

  test("/classic: body background untouched, tokens additive", async ({ page }) => {
    await page.goto("/classic");
    const s = await page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      return {
        bg: cs.backgroundColor,
        img: cs.backgroundImage,
        navy: getComputedStyle(document.documentElement).getPropertyValue("--ss-navy").trim(),
      };
    });
    expect(s.bg).toBe("rgb(15, 20, 25)");
    expect(s.img).toContain("radial-gradient(1200px 800px at 18% 10%, rgba(99, 102, 241, 0.15)");
    expect(s.img).toContain("radial-gradient(900px 600px at 82% 90%, rgba(16, 185, 129, 0.1)");
    expect(s.navy.toLowerCase()).toBe("#0a0e1a");
  });
});
