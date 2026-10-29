/**
 * Resume — where you stopped in each tape, on this device only (T21, s07:
 * "You stopped at page 5." · "Pick up where you left off" · "Start again").
 *
 * The place is the only listening fact the Reader keeps (HANDOFF §7): one page
 * number per tape, the page count it was stopped in, and when. No history, no
 * "heard", no counts, nothing sent. Finishing the tape, pulling it out or
 * taking it off the shelf forgets it.
 *
 *   RESUME_KEY                  `ssync-resume`, one localStorage key holding
 *                               `{ v: 1, tapes: Record<key, { page, of, at }> }`
 *   tapeKey(manifest, opened?)  the tape's key: `code:<share code>` from its
 *                               own `signature.shareUrl` (`?story=`), else from
 *                               the code it was opened by, else
 *                               `t:<metadata.created>|<metadata.title>`
 *   codeKey(code)               `code:<code>` (a tape known only by its link)
 *   titleKey(manifest)          `t:<metadata.created>|<metadata.title>` (the
 *                               key of a tape opened with no link)
 *   recordPage(store, key, index, total, now)
 *                               remember 1-based `page = index + 1` of `total`,
 *                               page 2 onward only; capped at 50 tapes, the
 *                               least recently stopped dropped first
 *   clearTape(store, key)       forget one tape's place
 *   resumePoint(store, key, total)
 *                               `{ page }`, or null (none, or the tape changed:
 *                               its page count is not the one stopped in)
 *   latestResumed(store, tapes) the key stopped in most recently, among tapes
 *                               whose place is still valid
 *   sanitizeResume(raw)         the stored value → clean places only
 *   serializeResume(store)      the stored value
 *
 * Pure: nothing here reads storage, fetches, sends or counts anything. Every
 * function returns a new store when it changes something and the same store
 * when it does not. Relative imports only, so the Node-side tests import it.
 * The storage half (read, write, forget every key a deleted tape could be
 * under) is ./resume-store.ts.
 */

import type { SsyncManifest } from "../../lib/storysync/manifest";

/** The one localStorage key the places live under. */
export const RESUME_KEY = "ssync-resume";

/** The envelope's version. Any other version reads as no places at all. */
export const RESUME_VERSION = 1;

/** At most this many tapes; the least recently stopped goes first. */
export const RESUME_CAP = 50;

/** A title longer than this is cut in a `t:` key (the key stays a key). */
const TITLE_MAX = 200;
/** A key longer than this was not written here. */
const KEY_MAX = 512;
/** A link code: the share code (or library id) a `?story=` names. */
const CODE = /^[A-Za-z0-9_-]{1,128}$/;
const FIELDS: ReadonlySet<string> = new Set(["page", "of", "at"]);

/** Where one tape was left: 1-based page `page` of `of` pages, at ISO time `at`. */
export interface ResumeEntry {
  page: number;
  of: number;
  at: string;
}

export interface ResumeStore {
  v: typeof RESUME_VERSION;
  tapes: Record<string, ResumeEntry>;
}

/* ------------------------------------------------------------- helpers */

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function time(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Number.NaN;
}

function isoOf(now: Date | number | string): string | null {
  const t = now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function wholePage(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function emptyStore(): ResumeStore {
  return { v: RESUME_VERSION, tapes: {} };
}

/** A clean place: page 2 onward, inside its tape, at a real time. */
function cleanEntry(value: unknown): ResumeEntry | null {
  const r = record(value);
  if (!r || Object.keys(r).some((key) => !FIELDS.has(key))) return null;
  const { page, of, at } = r;
  if (!wholePage(page) || !wholePage(of) || page < 2 || page > of) return null;
  if (typeof at !== "string" || !Number.isFinite(time(at))) return null;
  return { page, of, at };
}

/** Keep the `RESUME_CAP` most recently stopped tapes. */
function capped(tapes: Record<string, ResumeEntry>): Record<string, ResumeEntry> {
  const keys = Object.keys(tapes);
  if (keys.length <= RESUME_CAP) return tapes;
  const kept = keys
    .map((key, order) => ({ key, order, at: time(tapes[key].at) }))
    .sort((a, b) => b.at - a.at || a.order - b.order)
    .slice(0, RESUME_CAP);
  const out: Record<string, ResumeEntry> = {};
  for (const { key } of kept) out[key] = tapes[key];
  return out;
}

/* ----------------------------------------------------------------- key */

/** `code:<code>` for a tape known by its link. */
export function codeKey(code: string): string {
  return `code:${code}`;
}

/** The `?story=` value of a share URL, when it names one. */
function storyCode(url: string): string | null {
  const match = /[?&]story=([^&#]*)/.exec(url);
  if (!match) return null;
  let code: string;
  try {
    code = decodeURIComponent(match[1]).trim();
  } catch {
    return null;
  }
  return CODE.test(code) ? code : null;
}

/**
 * The key a tape's place is kept under, the same from every door: the share
 * code in the tape's own `signature.shareUrl`, else the code it was opened by
 * (a link's `?story=`, a shelf tape's library share code), else its created
 * time and title. Null when the tape names none of them.
 */
export function tapeKey(manifest: SsyncManifest, openedCode?: string | null): string | null {
  const own = storyCode(text(record(manifest.signature)?.shareUrl));
  if (own) return codeKey(own);
  const opened = text(openedCode);
  if (opened && CODE.test(opened)) return codeKey(opened);
  return titleKey(manifest);
}

/**
 * `t:<metadata.created>|<metadata.title>`: the key `tapeKey` falls back to for
 * a tape with no link. A tape that has one since may still have a place under
 * it (a file saved before it was shared), so forgetting a tape clears it too.
 * Null when the tape names neither.
 */
export function titleKey(manifest: SsyncManifest): string | null {
  const meta = record(manifest.metadata);
  const created = text(meta?.created);
  const title = text(meta?.title).slice(0, TITLE_MAX);
  if (!created && !title) return null;
  return `t:${created}|${title}`;
}

/* ------------------------------------------------------- record / clear */

/**
 * Remember that the tape under `key` is on 0-based page `index` of `total`.
 * Page 1 is not a place (opening a tape starts there anyway), and an index
 * outside the tape is ignored: both return the same store.
 */
export function recordPage(
  store: ResumeStore,
  key: string | null,
  index: number,
  total: number,
  now: Date | number | string,
): ResumeStore {
  if (!key || key.length > KEY_MAX) return store;
  if (!wholePage(index) || !wholePage(total) || index < 1 || index >= total) return store;
  const at = isoOf(now);
  if (!at) return store;
  const entry: ResumeEntry = { page: index + 1, of: total, at };
  const rest = { ...store.tapes };
  delete rest[key];
  return { v: RESUME_VERSION, tapes: capped({ ...rest, [key]: entry }) };
}

/** Forget one tape's place (the same store when there was none). */
export function clearTape(store: ResumeStore, key: string | null): ResumeStore {
  if (!key || !Object.prototype.hasOwnProperty.call(store.tapes, key)) return store;
  const rest = { ...store.tapes };
  delete rest[key];
  return { v: RESUME_VERSION, tapes: rest };
}

/* -------------------------------------------------------------- lookup */

/**
 * Where to pick the tape up: `{ page }` (1-based), or null when it was never
 * stopped in or its page count changed since (the tape is not the one left).
 */
export function resumePoint(store: ResumeStore, key: string | null, total: number): { page: number } | null {
  if (!key || !Object.prototype.hasOwnProperty.call(store.tapes, key)) return null;
  const entry = store.tapes[key];
  if (!entry || entry.of !== total || entry.page < 2 || entry.page > total) return null;
  return { page: entry.page };
}

/** Of these tapes, the key stopped in most recently (with a valid place), or null. */
export function latestResumed(
  store: ResumeStore,
  tapes: ReadonlyArray<{ key: string | null; total: number }>,
): string | null {
  let best: { key: string; at: number } | null = null;
  for (const { key, total } of tapes) {
    if (!key || !resumePoint(store, key, total)) continue;
    const at = time(store.tapes[key].at);
    if (!best || at > best.at) best = { key, at };
  }
  return best?.key ?? null;
}

/* ------------------------------------------------------------- storage */

/** The stored value (a JSON string or already parsed) → clean places only. */
export function sanitizeResume(raw: unknown): ResumeStore {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return emptyStore();
    }
  }
  const envelope = record(value);
  const tapes = record(envelope?.tapes);
  if (!envelope || envelope.v !== RESUME_VERSION || !tapes) return emptyStore();
  const out: Record<string, ResumeEntry> = {};
  for (const [key, entry] of Object.entries(tapes)) {
    if (!key || key.length > KEY_MAX) continue;
    const clean = cleanEntry(entry);
    if (clean) out[key] = clean;
  }
  return { v: RESUME_VERSION, tapes: capped(out) };
}

/** The value written under `RESUME_KEY`. */
export function serializeResume(store: ResumeStore): string {
  return JSON.stringify({ v: RESUME_VERSION, tapes: store.tapes });
}
