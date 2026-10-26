/**
 * Reply: "Send a thank-you back" (T18, s06).
 *
 * The end card turns a listener into a maker: a grandparent who just heard a
 * child's tape records one page back. A reply is a new tape, not a derivative
 * of the one it answers, so it keeps none of the answered tape's pictures,
 * words or voices. What it carries over is a handful of strings, the seed:
 *
 *   name       whom to thank: the answered tape's `metadata.narrator`, else the
 *              lead name of its `metadata.author` (T03's rule), else none
 *   title      the reply's first title: "Thank you, <name>", or "Thank you"
 *   chipTitle  the answered tape's title, for the Creator's "Reply to · …" chip
 *              (draft-only: never written into the reply's manifest)
 *   replyTo    the answered tape's `signature.shareUrl`, else the link it was
 *              opened from, else nothing (nothing is invented)
 *
 * The seed travels from the Read Room to the Creator as a one-shot
 * `sessionStorage` entry (`REPLY_SEED_KEY`), written right before the
 * navigation to `/studio?reply=1` and removed by the Creator as it reads it.
 * No network, no story data, nothing in the browser history but the flag.
 *
 * Pure: no DOM, no storage. Relative imports only, so Node-side tests import
 * it directly.
 */

import type { SsyncManifest } from "./manifest";
import { narratorFromByline } from "./narrator";

/** What a reply starts from. Strings only. */
export interface ReplySeed {
  /** Whom the reply thanks; absent when the answered tape names nobody. */
  name?: string;
  /** The reply's first title. */
  title: string;
  /** The answered tape's title (the chip's "Reply to · <chipTitle>"). */
  chipTitle: string;
  /** `signature.replyTo` for the reply; absent when there is no link to write. */
  replyTo?: string;
}

/** The one-shot `sessionStorage` key the seed travels under. */
export const REPLY_SEED_KEY = "ssync-reply-seed";

/** The Creator's query flag: `/studio?reply=1`. */
export const REPLY_QUERY = "reply";

/** The answered tape's title when it has none. */
const UNTITLED = "Untitled Story";

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * The seed for a reply to `answered`.
 *
 * @param answered  the tape that just finished
 * @param openedFrom the link it was opened from, when it came from one
 *                   (`<origin>/read?story=<code>`); a file or the house tape
 *                   has none
 */
export function replySeed(answered: SsyncManifest, openedFrom?: string): ReplySeed {
  const metadata = answered.metadata ?? { title: "" };
  const name = text(metadata.narrator) ?? narratorFromByline(text(metadata.author));
  const replyTo = text(answered.signature?.shareUrl) ?? text(openedFrom);
  const chipTitle = text(metadata.title) ?? UNTITLED;
  const seed: ReplySeed = name
    ? { name, title: `Thank you, ${name}`, chipTitle }
    : { title: "Thank you", chipTitle };
  if (replyTo) seed.replyTo = replyTo;
  return seed;
}

/** The end card's line under "Send a thank-you back". */
export function replyLine(name?: string): string {
  const who = text(name);
  return who
    ? `Record one page in your voice. It goes back to ${who} as its own little tape.`
    : "Record one page in your voice. It goes back as its own little tape.";
}

/** The seed as it is written to `sessionStorage`: its four strings, nothing else. */
export function serializeReplySeed(seed: ReplySeed): string {
  const out: ReplySeed = { title: seed.title, chipTitle: seed.chipTitle };
  if (text(seed.name)) out.name = seed.name;
  if (text(seed.replyTo)) out.replyTo = seed.replyTo;
  return JSON.stringify(out);
}

/**
 * A seed read back from `sessionStorage`, or null when the entry is missing or
 * is not a seed. Only the four known keys are taken, and only as non-empty
 * strings; `title` and `chipTitle` are required.
 */
export function parseReplySeed(raw: string | null | undefined): ReplySeed | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const title = text(record.title);
  const chipTitle = text(record.chipTitle);
  if (!title || !chipTitle) return null;
  const seed: ReplySeed = { title, chipTitle };
  const name = text(record.name);
  const replyTo = text(record.replyTo);
  if (name) seed.name = name;
  if (replyTo) seed.replyTo = replyTo;
  return seed;
}
