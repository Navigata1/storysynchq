/**
 * The shelf — "your tapes" as the Read Room stands them on a ledge (T20a, s07).
 *
 * Pure: the rows come in (this device's `ssync-library`, and the signed-in
 * grown-up's cloud library when there is one), shelf entries come out.
 *
 *   parseLibrary(raw)          the device library's JSON → rows (never throws)
 *   mergeShelf(device, cloud)  one entry per tape id, newest first; a tape kept
 *                              in both places is the cloud copy
 *   labelFacts(manifest, row)  what its face prints: title, author, the
 *                              "~m:ss" runtime (T01's tape-meta), the meta
 *                              line, the first pictured page, its share URL
 *   bandLine(facts)            the band's "<TITLE> · <AUTHOR>" (upper case by CSS)
 *   draftBelongsTo(draft, id)  is the Studio's saved draft this tape? (a
 *                              pull-out removes that draft too)
 *   nextAfter(ids, id)         who is selected once a tape leaves the shelf
 *
 * Nothing here reads storage, fetches or counts anything. Relative imports
 * only, so the Node-side tests import it directly.
 */

import { runtimeLabel } from "../../lib/storysync/tape-meta";
import type { SsyncManifest } from "../../lib/storysync/manifest";

/** This device's library (src/lib/cloud-storage.ts `LIBRARY_KEY`). */
export const SHELF_LIBRARY_KEY = "ssync-library";

/** A face's title when the tape names none (the Player's own fallback). */
export const UNTITLED = "Untitled Story";

/** What a face prints, all of it derived from the tape itself. */
export interface ShelfLabelFacts {
  /** The full title (the face clips it at two lines; the accessible name keeps it whole). */
  title: string;
  /** `metadata.author` ("story by"), "" when the tape names nobody. */
  author: string;
  /** "~m:ss" from the shared runtime arithmetic. */
  runtime: string;
  /** "<author> · ~m:ss", or just "~m:ss" with no author (upper case by CSS). */
  meta: string;
  /** The first pictured page's picture, for the 32 px inset. Absent: no inset. */
  inset?: string;
  /** `signature.shareUrl`, when the tape carries its own link (the end card's QR). */
  shareUrl?: string;
}

/** One tape on the shelf. */
export interface ShelfEntry {
  id: string;
  /** The unlisted code a device row was given, when it has one. */
  shareCode?: string;
  /** ISO time the tape was saved (sort key); "" when unknown. */
  createdAt: string;
  /** Where this copy came from. A tape in both places is the cloud copy. */
  source: "device" | "cloud";
  manifest: SsyncManifest;
  label: ShelfLabelFacts;
}

/* ------------------------------------------------------------- helpers */

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** A manifest the Player can open: an object with at least one page. */
function playable(value: unknown): SsyncManifest | null {
  const m = record(value);
  if (!m || !Array.isArray(m.pages) || m.pages.length === 0) return null;
  return m as unknown as SsyncManifest;
}

function time(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/* --------------------------------------------------------------- parse */

/** The device library's stored JSON as a list of rows; anything else is an empty shelf. */
export function parseLibrary(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/* --------------------------------------------------------------- label */

/** The first page that carries a picture: its URL, or undefined. */
export function insetUrl(manifest: SsyncManifest): string | undefined {
  for (const page of manifest.pages ?? []) {
    const url = text(record(record(page)?.illustration)?.url);
    if (url) return url;
  }
  return undefined;
}

/**
 * What a tape's face prints. The manifest speaks first; the library row's own
 * columns (title, author) fill a gap only when the manifest leaves one.
 */
export function labelFacts(manifest: SsyncManifest, row?: unknown): ShelfLabelFacts {
  const r = record(row);
  const meta = record(manifest.metadata);
  const title = text(meta?.title) || text(r?.title) || UNTITLED;
  const author = text(meta?.author) || text(r?.author);
  const runtime = runtimeLabel(manifest);
  const facts: ShelfLabelFacts = {
    title,
    author,
    runtime,
    meta: author ? `${author} · ${runtime}` : runtime,
  };
  const inset = insetUrl(manifest);
  if (inset) facts.inset = inset;
  const shareUrl = text(record(manifest.signature)?.shareUrl);
  if (shareUrl) facts.shareUrl = shareUrl;
  return facts;
}

/** The band's line for the selected tape: "<title> · <author>", or the title alone. */
export function bandLine(facts: Pick<ShelfLabelFacts, "title" | "author">): string {
  return facts.author ? `${facts.title} · ${facts.author}` : facts.title;
}

/* --------------------------------------------------------------- merge */

function entryFrom(row: unknown, source: ShelfEntry["source"]): ShelfEntry | null {
  const r = record(row);
  if (!r) return null;
  const id = text(r.id);
  const manifest = playable(r.ssyncData);
  if (!id || !manifest) return null;
  const createdAt = text(r.createdAt) || text(record(manifest.metadata)?.created);
  const entry: ShelfEntry = { id, createdAt, source, manifest, label: labelFacts(manifest, r) };
  const shareCode = text(r.shareCode);
  if (shareCode) entry.shareCode = shareCode;
  return entry;
}

/**
 * Every tape this family keeps, once each, newest first. Rows without an id or
 * without a playable manifest stay off the shelf. When a tape is both on this
 * device and in the cloud library, the cloud copy is the one shown (it is the
 * one a link opens); a device-only share code rides along when the cloud row
 * has none.
 */
export function mergeShelf(device: readonly unknown[], cloud: readonly unknown[] = []): ShelfEntry[] {
  const byId = new Map<string, ShelfEntry>();
  for (const row of device) {
    const entry = entryFrom(row, "device");
    if (entry && !byId.has(entry.id)) byId.set(entry.id, entry);
  }
  for (const row of cloud) {
    const entry = entryFrom(row, "cloud");
    if (!entry) continue;
    const local = byId.get(entry.id);
    if (local?.shareCode && !entry.shareCode) entry.shareCode = local.shareCode;
    byId.set(entry.id, entry);
  }
  return [...byId.values()]
    .map((entry, order) => ({ entry, order }))
    .sort((a, b) => time(b.entry.createdAt) - time(a.entry.createdAt) || a.order - b.order)
    .map(({ entry }) => entry);
}

/* --------------------------------------------------------------- draft */

/**
 * True when the Studio's saved draft (the stored envelope `{ v, savedAt, state }`
 * or a bare state) is this tape: its `published.id` is the id, or the id is one
 * of its `publishedIds`. A draft for any other story is never this tape.
 */
export function draftBelongsTo(draft: unknown, id: string): boolean {
  if (!id) return false;
  const outer = record(draft);
  const state = record(outer?.state) ?? outer;
  if (!state) return false;
  if (text(record(state.published)?.id) === id) return true;
  const ids = state.publishedIds;
  return Array.isArray(ids) && ids.some((x) => x === id);
}

/* ----------------------------------------------------------- selection */

/**
 * Who is selected once `removed` leaves a shelf of `ids` (in shelf order): the
 * tape after it, else the one before it, else nobody.
 */
export function nextAfter(ids: readonly string[], removed: string): string | null {
  const at = ids.indexOf(removed);
  const rest = ids.filter((x) => x !== removed);
  if (rest.length === 0) return null;
  if (at < 0) return rest[0];
  return rest[Math.min(at, rest.length - 1)];
}
