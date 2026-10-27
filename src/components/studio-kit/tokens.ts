/**
 * studio-kit tokens — the typed mirror of the SSYNC foundation tokens.
 *
 * The source of truth is CSS: `:root` in `src/app/globals.css` defines every
 * token as a custom property (`--ss-*`, `--mood-*`, `--ss-layer-*`), ported
 * from the Vision Reel's `docs/vision/reference/foundation.css` (`.ss-screen`)
 * and the brief's `design_system` TOKENS + TYPE. Tailwind 4 `@theme inline`
 * turns them into utilities (`bg-ss-navy`, `text-ss-ink`, `bg-mood-wonder`,
 * `ease-ss`, `font-ss-display` …). Style with those or with `var(--ss-*)`.
 *
 * Reach for this file only where CSS cannot: an SVG `fill` attribute, a canvas,
 * a computed inline style, a test. `tests/vision-tokens.spec.ts` compares every
 * value here with the computed `:root` property on `/`, `/read`, `/studio` and
 * `/protocol`, so the mirror and the CSS cannot drift. Change both together.
 *
 * Key → custom property: camelCase, a digit run starts its own segment
 *   REGISTER_A.navy2 → --ss-navy-2 · LOCAL.tapeBrown1 → --ss-tape-brown-1
 *   MOOD_COLOR.Wonder → --mood-wonder · LAYER_FILL.Signature → --ss-layer-signature
 *
 * Hex case follows the brief (upper case where it writes upper case), so the
 * re-exported `TAPE` / `STUDIO` and the protocol's layer fills keep their exact
 * strings. Pure data, no "use client": safe in server and client components.
 */

import type { MoodName } from "@/lib/audio/moods";

/** Register A — studio chrome, the room: navy, glass, gold/violet, ok. */
export const REGISTER_A = {
  navy: "#0a0e1a",
  navy2: "#0f1426",
  navy3: "#161d33",
  navy4: "#1f2742",
  line: "rgba(255, 255, 255, 0.1)",
  line2: "rgba(255, 255, 255, 0.16)",
  glass: "rgba(255, 255, 255, 0.05)",
  glass2: "rgba(255, 255, 255, 0.08)",
  fg: "#ffffff",
  fg2: "#cdd3e2",
  fg3: "#8d96ad",
  fg4: "#5d6680",
  /** The single primary action and the active state. */
  gold: "#F59E0B",
  gold2: "#fbbf4a",
  /** Secondary actions and "Next". */
  violet: "#7C6BFF",
  violet2: "#a59bff",
  ok: "#3fb68b",
} as const;

/** Register B — tape stock: anything that IS a story. */
export const REGISTER_B = {
  paper: "#FFFDF6",
  paper2: "#f5eedc",
  paper3: "#e9dfc6",
  ink: "#1E1A16",
  ink2: "#5a5148",
  ink3: "#8b8073",
  label: "#FFC93C",
  red: "#E3452F",
  shell: "#3B3733",
  shell2: "#2c2926",
} as const;

/** The brief's LOCAL additions and the cassette / print-slot tones foundation.css uses as literals. */
export const LOCAL = {
  kraft: "#DFD2B8",
  /** The tape ribbon (filmstrip spine, passport route, size meters). A gradient, not a colour. */
  tapeBrown: "linear-gradient(180deg, #5b3a24, #3d2616)",
  tapeBrown1: "#5b3a24",
  tapeBrown2: "#3d2616",
  crayonPaper: "#FBF7EC",
  /** The Signature layer's "V2.1 · DRAFT" tag ink. */
  redInk: "#B4301F",
  shellHi: "#4a443e",
  foot1: "#2e2a27",
  foot2: "#24211f",
  slot: "#05070d",
} as const;

/**
 * A story's words where they sit on the dark Stage, in the Studio and the
 * Player (`--ss-cream`, the reference's `.ss-story` #F3E6C8). Its own group:
 * it is not one of the brief's LOCAL additions.
 */
export const STORY = {
  cream: "#F3E6C8",
} as const;

/** The eight canonical moods' fixed colours (brief design_system; moods.ts names). */
export const MOOD_COLOR: Record<MoodName, string> = {
  Wonder: "#f5b544",
  Adventure: "#f28c38",
  Calm: "#5db4e8",
  Joy: "#f7d348",
  Hush: "#a98bf5",
  Rain: "#8c9bb0",
  Suspense: "#7b7fe8",
  Melancholy: "#e58fa6",
};

export type PacketLayerName =
  | "Metadata"
  | "Visual"
  | "Text"
  | "Voice"
  | "Sound"
  | "Behavior"
  | "Signature";

/** The seven packet-layer fills, in packet order (Signature takes a tape-red stroke). */
export const LAYER_FILL: Record<PacketLayerName, string> = {
  Metadata: "#EFE9DC",
  Visual: "#E4E0FA",
  Text: "#FBF3DF",
  Voice: "#FADFDA",
  Sound: "#FBEBD2",
  Behavior: "#E6E9EE",
  Signature: "#FFE9A8",
};

/** One easing family, everywhere (`--ss-ease`, Tailwind `ease-ss`). */
export const SS_EASE = "cubic-bezier(0.22, 0.8, 0.24, 1)";

/**
 * Type stacks (`--ss-display` / `--ss-ui` / `--ss-mono`). The `--font-*`
 * variables are next/font's self-hosted families, set on <html> by the root layout.
 */
export const SS_FONT = {
  /** Fraunces: anything that is a story or a title. */
  display: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
  /** Geist: the studio chrome. */
  ui: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  /** IBM Plex Mono: kickers, meta, readouts, codes. */
  mono: "var(--font-plex-mono), ui-monospace, Menlo, monospace",
} as const;

/* ---------------------------------------------- kit conveniences (kit.tsx) */

/** Register B — tape stock palette (re-exported by kit.tsx). */
export const TAPE = {
  paper: REGISTER_B.paper,
  ink: REGISTER_B.ink,
  label: REGISTER_B.label,
  red: REGISTER_B.red,
  shell: REGISTER_B.shell,
} as const;

/** Register A — studio chrome palette (re-exported by kit.tsx). */
export const STUDIO = {
  bg: REGISTER_A.navy,
  gold: REGISTER_A.gold,
  violet: REGISTER_A.violet,
} as const;
