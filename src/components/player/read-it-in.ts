/**
 * Read it in… — what the panel says about a tape, and where its door goes
 * (T22a, s07 right panel: "A computer read you this one. Now read it in
 * yours.", "WHAT SHOULD IT FEEL LIKE?", "Make our own copy").
 *
 * A target is the tape the panel is about:
 *   house  the house tape ("The Brave Little Star", from /public)
 *   shelf  one of your tapes (this device's library or, signed in, the cloud's)
 *   sent   a tape sent to you: only its link reference is on this device
 *          (sent-to-you.ts), never its pages
 *
 *   houseTarget / shelfTarget / sentTarget   build a target
 *   targetKey(target)        one key per target ("house", "shelf:<id>", "sent:<code>")
 *   targetLine(target)       "<title> · <author>" (upper case by CSS), the band's line
 *   readYouLine(target)      "A computer read you this one. Now read it in yours." when
 *                            no page carries a recorded voice (the house tape), else
 *                            "<narrator> read you this one. …" (`metadata.narrator`,
 *                            else "Someone"); a sent tape's reference decides by its
 *                            narrator alone
 *   defaultMood(target)      the first page's mood through T10's music plan, else Wonder
 *                            (a tape with no music; a sent tape, whose pages are not here)
 *   headerPicture(target, resumePage?)
 *                            the resume page's picture (T21), else the first pictured
 *                            page, with its 1-based page number; null for a sent tape
 *                            or a tape with no picture
 *   creatorUrl(target, mood) T15's entry: `/studio?open=house&mood=<Mood>` for the house
 *                            tape, `?open=<share code>` for a tape with a code (yours or
 *                            sent), `?open=<library id>` for a device tape without one
 *
 * Pure: nothing here reads storage, fetches or counts anything. Relative
 * imports only, so the Node-side tests import it directly.
 */

import type { MoodName } from "../../lib/audio/moods";
import type { SsyncManifest } from "../../lib/storysync/manifest";
import { pageMood } from "./music-plan";
import { bandLine, UNTITLED, type ShelfEntry } from "./shelf";
import type { SentTape } from "./sent-to-you";

/** T15's `?open=` value for the house tape (src/components/studio/open-tape.ts `HOUSE_TAPE_QUERY`). */
export const HOUSE_OPEN = "house";

/** The Creator's own default mood, and the panel's when a tape names none. */
export const DEFAULT_MOOD: MoodName = "Wonder";

/** The line for a tape nobody recorded: the browser voice read it. */
export const COMPUTER_LINE = "A computer read you this one. Now read it in yours.";

/** Who read it, when a tape carries a voice but names nobody. */
export const SOMEONE = "Someone";

export interface HouseTarget {
  kind: "house";
  manifest: SsyncManifest;
  title: string;
  author: string;
}

export interface ShelfTarget {
  kind: "shelf";
  /** The library row's id. */
  id: string;
  /** Its unlisted share code, when it was given one. */
  code?: string;
  manifest: SsyncManifest;
  title: string;
  author: string;
}

export interface SentTarget {
  kind: "sent";
  /** The link code the reference keeps. */
  code: string;
  title: string;
  author: string;
  narrator?: string;
}

export type ReadItInTarget = HouseTarget | ShelfTarget | SentTarget;

/** Where the panel's header picture comes from: a page's picture and its 1-based number. */
export interface HeaderPicture {
  url: string;
  page: number;
}

/* ------------------------------------------------------------- helpers */

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pagesOf(manifest: SsyncManifest): unknown[] {
  return Array.isArray(manifest.pages) ? manifest.pages : [];
}

/** A page's picture URL, or "". */
function pictureOf(page: unknown): string {
  return text(record(record(page)?.illustration)?.url);
}

/** Does any page carry a recorded voice (`text.audioUrl`)? */
function hasRecordedVoice(manifest: SsyncManifest): boolean {
  return pagesOf(manifest).some((page) => text(record(record(page)?.text)?.audioUrl) !== "");
}

/** "<who> read you this one. Now read it in yours." */
function readBy(who: string): string {
  return `${who} read you this one. Now read it in yours.`;
}

/* -------------------------------------------------------------- targets */

/** The house tape, from its manifest. */
export function houseTarget(manifest: SsyncManifest): HouseTarget {
  const meta = record(manifest.metadata);
  return { kind: "house", manifest, title: text(meta?.title) || UNTITLED, author: text(meta?.author) };
}

/** One of your tapes, as the shelf knows it (its label facts and its code, if any). */
export function shelfTarget(entry: Pick<ShelfEntry, "id" | "shareCode" | "manifest" | "label">): ShelfTarget {
  const target: ShelfTarget = {
    kind: "shelf",
    id: entry.id,
    manifest: entry.manifest,
    title: entry.label.title,
    author: entry.label.author,
  };
  const code = text(entry.shareCode);
  if (code) target.code = code;
  return target;
}

/** A tape sent to you, as its reference knows it. */
export function sentTarget(tape: Pick<SentTape, "code" | "title" | "author" | "narrator">): SentTarget {
  const target: SentTarget = { kind: "sent", code: tape.code, title: tape.title, author: tape.author };
  const narrator = text(tape.narrator);
  if (narrator) target.narrator = narrator;
  return target;
}

/** One key per target: the mood chosen for one tape never carries to another. */
export function targetKey(target: ReadItInTarget): string {
  if (target.kind === "house") return HOUSE_OPEN;
  if (target.kind === "shelf") return `shelf:${target.id}`;
  return `sent:${target.code}`;
}

/* ---------------------------------------------------------------- lines */

/** "<title> · <author>", or the title alone (upper case by CSS). */
export function targetLine(target: ReadItInTarget): string {
  return bandLine(target);
}

/** Who read this tape to you, and the invitation to read it in yours. */
export function readYouLine(target: ReadItInTarget): string {
  if (target.kind === "sent") return target.narrator ? readBy(target.narrator) : COMPUTER_LINE;
  if (!hasRecordedVoice(target.manifest)) return COMPUTER_LINE;
  return readBy(text(record(target.manifest.metadata)?.narrator) || SOMEONE);
}

/* ----------------------------------------------------------------- mood */

/** The feeling preselected for a target: its first page's mood, else Wonder. */
export function defaultMood(target: ReadItInTarget): MoodName {
  if (target.kind === "sent") return DEFAULT_MOOD;
  const first = pagesOf(target.manifest)[0] as Parameters<typeof pageMood>[1];
  return pageMood(target.manifest, first) ?? DEFAULT_MOOD;
}

/* -------------------------------------------------------------- picture */

/**
 * The panel's header: the page you stopped at (when it has a picture), else
 * the tape's first pictured page. A sent tape keeps no pictures on this
 * device, and a tape without any has no header.
 */
export function headerPicture(target: ReadItInTarget, resumePage?: number | null): HeaderPicture | null {
  if (target.kind === "sent") return null;
  const pages = pagesOf(target.manifest);
  if (resumePage && Number.isInteger(resumePage) && resumePage >= 1) {
    const url = pictureOf(pages[resumePage - 1]);
    if (url) return { url, page: resumePage };
  }
  for (const [index, page] of pages.entries()) {
    const url = pictureOf(page);
    if (url) return { url, page: index + 1 };
  }
  return null;
}

/* ----------------------------------------------------------------- door */

/** T15's entry for this target, in this mood. */
export function creatorUrl(target: ReadItInTarget, mood: MoodName): string {
  const open =
    target.kind === "house" ? HOUSE_OPEN : target.kind === "sent" ? target.code : target.code ?? target.id;
  return `/studio?open=${encodeURIComponent(open)}&mood=${encodeURIComponent(mood)}`;
}
