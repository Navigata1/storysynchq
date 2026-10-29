/**
 * Packet plates — one page of a tape taken apart into its seven layers
 * (/protocol FIG. 1, s08 "the exploded real page").
 *
 *   packetPlates(manifest, pageIndex, { assetPath, voiceSeconds })
 *     → seven `{ n, layer, path, value, empty }`, 01 Metadata … 07 Signature
 *
 * Each plate names its manifest field and prints what THIS tape carries there,
 * nothing more: a layer the tape does not use says so in plain words and is
 * marked `empty`, because "which layers are optional" is the lesson. The
 * legacy v1 `signature.qrCode` is never read.
 *
 * Pure and dependency-free (relative imports only, no React, no DOM): the
 * /protocol page renders it through the kit's `PacketExploded`, and
 * tests/vision-protocol-packet.spec.ts imports the same module in Node.
 * Moods come from the Player's music plan (one answer for the whole product),
 * the bed's scale and tempo from `MOODS`, the duck depth from the engine.
 */

import type { SsyncManifest, SsyncPage, SsyncSignature } from "../../lib/storysync/manifest";
import { MOODS } from "../../lib/audio/moods";
import { DUCK_DEPTH_DB } from "../../lib/audio/engine";
import { pageMood } from "../player/music-plan";

export type PlateLayer = "Metadata" | "Visual" | "Text" | "Voice" | "Sound" | "Behavior" | "Signature";

export interface PacketPlate {
  /** "01" … "07", packet order. */
  n: string;
  layer: PlateLayer;
  /** Where the layer lives in the manifest, as the legend names it. */
  path: string;
  /** What this page carries there, in one line. */
  value: string;
  /** The tape does not use this layer on this page; `value` says so. */
  empty: boolean;
}

/**
 * The manifest fields the plates read. Structural, so a JSON import of a v1
 * tape fits as it is: `signature` is read field by field (a v1 tape carries a
 * `qrCode` there that no plate prints) and `music` is v1's track table, which
 * the music plan resolves.
 */
export interface PlateManifest {
  metadata: SsyncManifest["metadata"];
  settings?: SsyncManifest["settings"];
  pages: readonly SsyncPage[];
  signature?: unknown;
  music?: unknown;
}

export type PlateAssetKind = "picture" | "voice";

export interface PlateOptions {
  /**
   * The path a page's file has inside the packed `.storysync`. Default: the
   * URL as the manifest writes it (right for a tape that is already packed).
   */
  assetPath?: (url: string, asset: { pageId: number; kind: PlateAssetKind }) => string;
  /** Length of this page's recording, when known: the Voice plate adds it. */
  voiceSeconds?: number;
}

export const NO_PICTURE = "no picture on this page";
export const NO_WORDS = "no words on this page";
export const NO_VOICE = "none on this page — the browser voice reads it";
export const NO_MUSIC = "no music on this page — silence, on purpose";
export const NOTHING_SIGNED = "nothing signed on this tape yet";

/** The Player's hold when neither the page nor the tape names one. */
const DEFAULT_PAUSE = "3s";

const SEP = " · ";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function line(parts: readonly string[]): string {
  return parts.filter(Boolean).join(SEP);
}

/** The codec a manifest declares, else the one its packed file name implies. */
function codecOf(page: SsyncPage, packedPath: string): string {
  const declared = text(page.text?.audioCodec);
  if (declared) return declared;
  if (/\.(m4a|mp4)$/i.test(packedPath)) return "aac";
  if (/\.wav$/i.test(packedPath)) return "wav";
  return "";
}

/** "<ownership> · <rights> · consent: <grantedBy> · <date>" (one clause per record), or "". */
function signatureLine(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const signature = raw as SsyncSignature;
  const parts = [text(signature.ownership), text(signature.rights)];
  if (Array.isArray(signature.voiceConsent)) {
    for (const record of signature.voiceConsent) {
      const grantedBy = text(record?.grantedBy);
      if (!grantedBy) continue;
      parts.push(`consent: ${grantedBy}`, text(record?.date));
    }
  }
  return line(parts);
}

function plate(n: number, layer: PlateLayer, path: string, value: string, empty = false): PacketPlate {
  return { n: String(n).padStart(2, "0"), layer, path, value, empty };
}

/**
 * Page `pageIndex` of `manifest` as seven plates, in packet order.
 * Throws a RangeError for a page the tape does not have.
 */
export function packetPlates(
  manifest: PlateManifest,
  pageIndex: number,
  options: PlateOptions = {},
): PacketPlate[] {
  const page = manifest.pages[pageIndex];
  if (!page) throw new RangeError(`the tape has no page at index ${pageIndex}`);
  const resolve = options.assetPath ?? ((url: string) => url);
  const { metadata, settings } = manifest;

  // 01 · who made it, what it is called, what language it speaks
  const author = text(metadata.author);
  const meta = line([text(metadata.title), author ? `by ${author}` : "", text(metadata.language)]);

  // 02 · the picture, where it is packed, and its alt text
  const pictureUrl = text(page.illustration?.url);
  const picture = line([
    pictureUrl ? resolve(pictureUrl, { pageId: page.id, kind: "picture" }) : "",
    text(page.illustration?.alt),
  ]);

  // 03 · the words, verbatim
  const words = page.text?.content ?? "";

  // 04 · the recorded voice, or the browser voice reading it
  const voiceUrl = text(page.text?.audioUrl);
  let voice = NO_VOICE;
  if (voiceUrl) {
    const packed = resolve(voiceUrl, { pageId: page.id, kind: "voice" });
    const seconds =
      typeof options.voiceSeconds === "number" && Number.isFinite(options.voiceSeconds) && options.voiceSeconds > 0
        ? `${options.voiceSeconds.toFixed(1)} s`
        : "";
    voice = line([packed, codecOf(page, packed), seconds]);
  }

  // 05 · the bed under the voice, as the Player will play it
  const mood = pageMood(manifest, page);
  const sound = mood
    ? line([
        mood,
        MOODS[mood].scaleName,
        `${MOODS[mood].tempo} BPM`,
        `ducks ${Math.round(DUCK_DEPTH_DB)} dB`,
      ])
    : NO_MUSIC;

  // 06 · how the story moves
  const pause =
    text(page.timing?.autoPause) || text(settings?.accessibility?.pauseBetweenPages) || DEFAULT_PAUSE;
  const multiplier = settings?.accessibility?.timingMultiplier;
  const times = typeof multiplier === "number" && Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  const behavior = line([
    `autoPause ${pause} × ${times.toFixed(1)}`,
    `chime ${settings?.pageTurnSound === false ? "off" : "on"}`,
    settings?.readAlongHighlight === false ? "words stay still" : "words light up",
  ]);

  // 07 · ownership, rights and consent, travelling inside the tape
  const signed = signatureLine(manifest.signature);

  return [
    plate(1, "Metadata", "metadata", meta),
    plate(2, "Visual", "pages[].illustration", picture || NO_PICTURE, !picture),
    plate(3, "Text", "pages[].text.content", words.trim() ? words : NO_WORDS, !words.trim()),
    plate(4, "Voice", "pages[].text.audioUrl", voice, !voiceUrl),
    plate(5, "Sound", "pages[].music", sound, !mood),
    plate(6, "Behavior", "settings · pages[].timing", behavior),
    plate(7, "Signature", "signature", signed || NOTHING_SIGNED, !signed),
  ];
}
