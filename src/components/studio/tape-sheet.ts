/**
 * The tape sheet — "What goes into your tape", in plain words (s04, T14).
 *
 * Beside the grown-up gate stands a printed sheet: the seven layers of THIS
 * draft, one line each, saying exactly what Continue will write. This module
 * is its only source. It maps the draft (manifest, story mood, music on/off,
 * the byline as it is being typed, the re-voice record) to seven rows, so the
 * sheet can never say one thing while the publish writes another:
 *
 *   Metadata  "<title> · by <byline> · <language>"   (re-voiced: "· read by <reader>")
 *   Visual    "5 pictures · about 110 KB each"        (+ the page pictures, in order)
 *   Text      "the words on 5 pages, kept as text — never baked into the pictures"
 *   Voice     "5 recordings · become AAC/M4A when you tap Continue (WAV if …)"
 *   Sound     "Wonder, a music box that dips under every word"
 *             (pages with their own mood, T24a: "… · Hush on page 3")
 *   Behavior  "2-second pauses · the turn-the-page chime · words light up"
 *   Signature "© 2026 <credit> · personal use"
 *
 * The reference's wording is kept wherever it has some; where it names the
 * reel's cast (whose drawings, who typed the words) the sheet prints only what
 * the app knows. `layerPresence` answers which of the seven layers a manifest
 * carries (the publish card's layer chips reuse it).
 *
 * Pure: no React, no DOM, no clock of its own, relative imports only.
 */

import type { SsyncManifest } from "../../lib/storysync/manifest";
import type { PacketLayer } from "../studio-kit/PacketBands";
import { DEFAULT_PAUSE_MS, parseDuration } from "../../lib/storysync/tape-meta";
import { dataUrlBytes } from "../../lib/storysync/tape-size";

/** The seven layers, in packet order. */
export const SHEET_LAYERS: readonly PacketLayer[] = [
  "Metadata",
  "Visual",
  "Text",
  "Voice",
  "Sound",
  "Behavior",
  "Signature",
];

/** What the Studio knows about the draft before the gate opens. */
export interface TapeSheetSource {
  manifest: Pick<SsyncManifest, "metadata" | "settings" | "pages">;
  /** The story's mood: every page without its own plays it. */
  mood: string;
  /** Pages with a mood of their own (T24a): page id → mood. Absent means none. */
  pageMoods?: Readonly<Record<string, string>>;
  musicOn: boolean;
  /** Set on a tape opened to be re-voiced (T15): its original author keeps the credit. */
  remix?: { author: string } | null;
  /** The title a blank title publishes as. */
  defaultTitle?: string;
}

/** …and what the gate adds as the grown-up answers it. */
export interface TapeSheetInput extends TapeSheetSource {
  /** "story by" (or, re-voiced, "read by") as typed. */
  byline: string;
  /** The year the ownership line is dated with — the gate's own clock. */
  year: number;
}

export interface TapeSheetRow {
  layer: PacketLayer;
  /** The plain-words line the sheet prints. */
  value: string;
  /** Visual only: every page picture, in page order. */
  pictures?: string[];
  /** Sound only: the mood under the words, or null when the music is off. */
  mood?: string | null;
}

export const SHEET_RIGHTS = "personal use";
const SEP = " · ";
const DEFAULT_TITLE = "My Story";

/** "en" → "English", via the platform's own language names; the code itself when unknown. */
export function languageName(code: string | undefined): string {
  const tag = (code ?? "").trim();
  if (!tag) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/** Mean picture size as the sheet says it: to the nearest 10 KB, or the nearest KB under 5 KB. */
export function aboutKb(bytes: number): number {
  const kb = bytes / 1024;
  if (kb < 5) return Math.max(1, Math.round(kb));
  return Math.round(kb / 10) * 10;
}

/** 2 → "2", 1.5 → "1.5", 0.45 → "0.45". */
function seconds(n: number): string {
  return String(Number(n.toFixed(2)));
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Whose credit the ownership line and "by" carry: the byline, or a re-voiced tape's own author. */
export function sheetCredit(input: Pick<TapeSheetInput, "manifest" | "remix" | "byline">): string {
  if (input.remix) return input.manifest.metadata.author?.trim() || input.remix.author.trim();
  return input.byline.trim();
}

/** The ownership line exactly as the publish writes `signature.ownership`. */
export function sheetOwnership(credit: string, year: number): string {
  return credit ? `© ${year} ${credit}` : `© ${year}`;
}

function metadataLine(input: TapeSheetInput): string {
  const { manifest } = input;
  const title = manifest.metadata.title.trim() || input.defaultTitle || DEFAULT_TITLE;
  const parts = [title];
  const credit = sheetCredit(input);
  if (credit) parts.push(`by ${credit}`);
  const reader = input.remix ? input.byline.trim() : "";
  if (reader) parts.push(`read by ${reader}`);
  const language = languageName(manifest.metadata.language);
  if (language) parts.push(language);
  return parts.join(SEP);
}

function visualLine(pictures: readonly string[]): string {
  if (pictures.length === 0) return "No pictures — words only";
  const count = plural(pictures.length, "picture", "pictures");
  const sizes = pictures.map(dataUrlBytes).filter((b) => b > 0);
  if (sizes.length === 0) return count;
  const kb = aboutKb(sizes.reduce((sum, b) => sum + b, 0) / sizes.length);
  return `${count}${SEP}about ${kb} KB${pictures.length === 1 ? "" : " each"}`;
}

function textLine(pages: TapeSheetInput["manifest"]["pages"]): string {
  const worded = pages.filter((p) => p.text?.content?.trim()).length;
  if (worded === 0) return "No words — pictures and voice only";
  return `the words on ${plural(worded, "page", "pages")}, kept as text — never baked into the pictures`;
}

function voiceLine(pages: TapeSheetInput["manifest"]["pages"]): string {
  const recorded = pages.filter((p) => p.text?.audioUrl);
  if (recorded.length === 0) return "No recorded voice · read aloud by the browser voice";
  const count = plural(recorded.length, "recording", "recordings");
  // A page an earlier publish already normalized passes straight through.
  const codecs = new Set(recorded.map((p) => p.text?.audioCodec));
  if (!codecs.has(undefined)) {
    const done = [codecs.has("aac") ? "AAC/M4A" : "", codecs.has("wav") ? "WAV" : ""].filter(Boolean);
    return `${count}${SEP}already ${done.join(" and ")}`;
  }
  const become = recorded.length === 1 ? "becomes" : "become";
  return `${count}${SEP}${become} AAC/M4A when you tap Continue (WAV if this browser can't make AAC)`;
}

/** Page numbers as runs: [2, 3, 8] → "2–3, 8". */
function pageRuns(numbers: number[]): string {
  const runs: string[] = [];
  for (let i = 0; i < numbers.length; i++) {
    let j = i;
    while (j + 1 < numbers.length && numbers[j + 1] === numbers[j] + 1) j++;
    runs.push(j > i ? `${numbers[i]}–${numbers[j]}` : `${numbers[i]}`);
    i = j;
  }
  return runs.join(", ");
}

function soundLine(input: TapeSheetInput): string {
  if (!input.musicOn) return "No music · silence under the words";
  const line = `${input.mood}, a music box that dips under every word`;
  // Pages with their own mood (T24a) publish it, so the sheet names them:
  // each mood with its pages, in the order they first play.
  const own = new Map<string, number[]>();
  input.manifest.pages.forEach((page, index) => {
    const mood = input.pageMoods?.[String(page.id)];
    if (mood && mood !== input.mood) own.set(mood, [...(own.get(mood) ?? []), index + 1]);
  });
  const clauses = [...own].map(
    ([mood, pages]) => `${mood} on ${pages.length === 1 ? "page" : "pages"} ${pageRuns(pages)}`,
  );
  return [line, ...clauses].join(SEP);
}

function behaviorLine(manifest: TapeSheetInput["manifest"]): string {
  // A page without its own pause holds as long as the Player will hold it.
  const fallbackMs = parseDuration(manifest.settings?.accessibility?.pauseBetweenPages, DEFAULT_PAUSE_MS);
  const pauses = manifest.pages.map((p) => parseDuration(p.timing?.autoPause, fallbackMs) / 1000);
  const parts: string[] = [];
  if (pauses.length > 0) {
    const min = Math.min(...pauses);
    const max = Math.max(...pauses);
    if (max <= 0) parts.push("no pauses between pages");
    else if (min === max) parts.push(`${seconds(min)}-second pauses`);
    else parts.push(`pauses of ${seconds(min)}–${seconds(max)} seconds`);
  }
  if (manifest.settings?.pageTurnSound !== false) parts.push("the turn-the-page chime");
  if (manifest.settings?.readAlongHighlight !== false) parts.push("words light up");
  return parts.join(SEP) || "pages turn by hand";
}

/** The seven rows of the sheet, in packet order, for this draft as it stands. */
export function tapeSheet(input: TapeSheetInput): TapeSheetRow[] {
  const { manifest } = input;
  const pictures = manifest.pages
    .map((p) => p.illustration?.url)
    .filter((url): url is string => Boolean(url));
  return [
    { layer: "Metadata", value: metadataLine(input) },
    { layer: "Visual", value: visualLine(pictures), pictures },
    { layer: "Text", value: textLine(manifest.pages) },
    { layer: "Voice", value: voiceLine(manifest.pages) },
    { layer: "Sound", value: soundLine(input), mood: input.musicOn ? input.mood : null },
    { layer: "Behavior", value: behaviorLine(manifest) },
    {
      layer: "Signature",
      value: `${sheetOwnership(sheetCredit(input), input.year)}${SEP}${SHEET_RIGHTS}`,
    },
  ];
}

/** Which of the seven layers a manifest carries. */
export type LayerPresence = Record<PacketLayer, boolean>;

export function layerPresence(manifest: SsyncManifest): LayerPresence {
  const { pages, metadata, settings, signature } = manifest;
  return {
    Metadata: Boolean(metadata?.title?.trim()),
    Visual: Boolean(metadata?.coverImage) || pages.some((p) => p.illustration?.url),
    Text: pages.some((p) => p.text?.content?.trim()),
    Voice: pages.some((p) => p.text?.audioUrl),
    Sound: pages.some((p) => p.music),
    Behavior: Boolean(settings) || pages.some((p) => p.timing),
    Signature: Boolean(
      signature && (signature.ownership || signature.rights || signature.voiceConsent?.length),
    ),
  };
}

/* ------------------------------------------------------------- the stamp */

export type StampGrantor = "parent/guardian" | "self";

/**
 * The stamp's second line before its date: "PARENT/GUARDIAN" or "SELF" when
 * every voice was granted the same way, "<n> VOICES" when they differ.
 */
export function stampGrantorLine(grantors: readonly StampGrantor[]): string {
  const kinds = new Set(grantors);
  if (kinds.size > 1) return `${grantors.length} VOICES`;
  return kinds.has("self") ? "SELF" : "PARENT/GUARDIAN";
}
