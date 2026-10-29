/**
 * Sent to you — tapes opened from someone else's link, kept on this device's
 * shelf as references (T20b, s07 row A: "SENT TO YOU", the "NEW" stamp).
 *
 * What stays is the link, not the tape: a reference is the share code plus the
 * facts its face prints (title, maker, narrator, page count, the "~m:ss"
 * runtime) and when it arrived. Never pictures, words, voices or any URL but
 * the code, so the maker's one-tap delete still removes every copy: once the
 * tape is gone, its link here resolves to nothing.
 *
 *   SENT_KEY                        `ssync-sent-to-you`, one localStorage key
 *                                   holding `{ v: 1, tapes: SentTape[] }`
 *   SHELF_VISIT_KEY                 `ssync-shelf-visit`, the last look at the
 *                                   shelf (one ISO time), read once per visit
 *   sentFacts(code, manifest)       what a reference keeps of an opened tape
 *   rememberSent(list, entry, now)  add or refresh (dedupe by code; the first
 *                                   `addedAt` stays), capped at 30
 *   forgetSent(list, code)          "Take it off this shelf"
 *   sanitizeSent(raw)               the stored value → clean references only
 *   serializeSent(list)             the stored value
 *   ownKeys(rows)                   library rows → their ids and share codes
 *   libraryIdOf(code, manifest, rows)  the library row that is this tape
 *   isOwnTape({ id, code }, …)      yours (never remembered as sent)?
 *   isNewSince(tape, previous)      arrived after the previous visit?
 *   orderSent(list, previous)       NEW first, then newest first
 *   sentMeta(tape)                  "FROM <AUTHOR> · N PAGE(S) · ~m:ss"
 *
 * Pure: nothing here reads storage, fetches, sends or counts anything.
 * Relative imports only, so the Node-side tests import it directly.
 */

import type { SsyncManifest } from "../../lib/storysync/manifest";
import { labelFacts } from "./shelf";

/** The one localStorage key the list lives under. */
export const SENT_KEY = "ssync-sent-to-you";

/** The previous look at the shelf: one ISO time, rewritten on each visit to /read. */
export const SHELF_VISIT_KEY = "ssync-shelf-visit";

/** The envelope's version. Any other version reads as an empty list. */
export const SENT_VERSION = 1;

/** At most this many references; the oldest arrival goes first. */
export const SENT_CAP = 30;

/** A tape sent to you, as this device remembers it. Nothing else is kept. */
export interface SentTape {
  /** The unlisted share code: 16–64 lowercase hex (16 before T02, 32 since). */
  code: string;
  title: string;
  /** `metadata.author` ("story by"); "" when the tape names nobody. */
  author: string;
  /** `metadata.narrator`, when the tape names one. */
  narrator?: string;
  /** Page count. */
  pages: number;
  /** "~m:ss" from the shared runtime arithmetic. */
  runtime: string;
  /** ISO time the tape first reached this shelf. */
  addedAt: string;
}

/** A reference before it has arrived: everything but `addedAt`. */
export type SentFacts = Omit<SentTape, "addedAt">;

export interface SentEnvelope {
  v: typeof SENT_VERSION;
  tapes: SentTape[];
}

const FIELDS: ReadonlySet<string> = new Set(["code", "title", "author", "narrator", "pages", "runtime", "addedAt"]);
const CODE = /^[0-9a-f]{16,64}$/;
const RUNTIME = /^~\d+:[0-5]\d$/;

/* ------------------------------------------------------------- helpers */

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function time(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(t) ? t : Number.NaN;
}

function isoOf(now: Date | number | string): string | null {
  const t = now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Newest arrival first; ties keep their order. */
function newestFirst(list: readonly SentTape[]): SentTape[] {
  return list
    .map((tape, order) => ({ tape, order }))
    .sort((a, b) => time(b.tape.addedAt) - time(a.tape.addedAt) || a.order - b.order)
    .map(({ tape }) => tape);
}

/** Keep the newest `SENT_CAP` arrivals. */
function capped(list: readonly SentTape[]): SentTape[] {
  return newestFirst(list).slice(0, SENT_CAP);
}

/**
 * One stored entry → a clean reference, or null. An entry with any field a
 * reference does not keep (a picture, words, a URL) is dropped whole, not
 * trimmed: it was not written by this module.
 */
function cleanEntry(value: unknown): SentTape | null {
  const r = record(value);
  if (!r) return null;
  if (Object.keys(r).some((key) => !FIELDS.has(key))) return null;
  const code = typeof r.code === "string" ? r.code : "";
  const title = text(r.title);
  const pages = r.pages;
  const runtime = typeof r.runtime === "string" ? r.runtime : "";
  const addedAt = typeof r.addedAt === "string" ? r.addedAt : "";
  if (!CODE.test(code) || !title) return null;
  if (typeof r.author !== "string") return null;
  if (r.narrator !== undefined && typeof r.narrator !== "string") return null;
  if (typeof pages !== "number" || !Number.isInteger(pages) || pages < 1) return null;
  if (!RUNTIME.test(runtime) || !Number.isFinite(time(addedAt))) return null;
  const tape: SentTape = { code, title, author: text(r.author), pages, runtime, addedAt };
  const narrator = text(r.narrator);
  if (narrator) tape.narrator = narrator;
  return tape;
}

/* ------------------------------------------------------------ the list */

/**
 * What a reference keeps of a tape opened by `code`: its label facts, from the
 * tape itself (`labelFacts`, the shelf's own reading), and nothing else.
 */
export function sentFacts(code: string, manifest: SsyncManifest): SentFacts {
  const label = labelFacts(manifest);
  const facts: SentFacts = {
    code,
    title: label.title,
    author: label.author,
    pages: Array.isArray(manifest.pages) ? manifest.pages.length : 0,
    runtime: label.runtime,
  };
  const narrator = text(record(manifest.metadata)?.narrator);
  if (narrator) facts.narrator = narrator;
  return facts;
}

/**
 * Remember a tape opened from someone else's link. Deduped by code: a code
 * already on the list keeps its `addedAt` (when it first arrived) and takes the
 * fresh label facts; a new code arrives `now`. Capped at {@link SENT_CAP},
 * dropping the oldest arrival. An entry that is not a valid reference changes
 * nothing. Returns a new list, newest arrival first.
 */
export function rememberSent(
  list: readonly SentTape[],
  entry: SentFacts | SentTape,
  now: Date | number | string,
): SentTape[] {
  const at = isoOf(now);
  const known = list.find((tape) => tape.code === entry.code);
  const fresh = cleanEntry({
    code: entry.code,
    title: entry.title,
    author: entry.author,
    ...(entry.narrator !== undefined ? { narrator: entry.narrator } : {}),
    pages: entry.pages,
    runtime: entry.runtime,
    addedAt: known?.addedAt ?? at ?? "",
  });
  if (!fresh) return [...list];
  const rest = list.filter((tape) => tape.code !== fresh.code);
  return capped(known ? list.map((tape) => (tape.code === fresh.code ? fresh : tape)) : [fresh, ...rest]);
}

/** "Take it off this shelf": the list without that code. */
export function forgetSent(list: readonly SentTape[], code: string): SentTape[] {
  return list.filter((tape) => tape.code !== code);
}

/**
 * The stored value (the JSON string, or its parsed envelope `{ v: 1, tapes }`)
 * → clean references, newest arrival first. Malformed entries, entries with
 * unknown fields and codes that are not 16–64 lowercase hex are dropped; a
 * repeated code keeps its first entry; at most {@link SENT_CAP}. Anything else
 * (bad JSON, another version) is an empty list. Never throws.
 */
export function sanitizeSent(raw: unknown): SentTape[] {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  const envelope = record(value);
  const entries = Array.isArray(value) ? value : envelope?.v === SENT_VERSION && Array.isArray(envelope.tapes) ? envelope.tapes : [];
  const seen = new Set<string>();
  const clean: SentTape[] = [];
  for (const entry of entries) {
    const tape = cleanEntry(entry);
    if (!tape || seen.has(tape.code)) continue;
    seen.add(tape.code);
    clean.push(tape);
  }
  return capped(clean);
}

/** The value written under {@link SENT_KEY}. */
export function serializeSent(list: readonly SentTape[]): string {
  const envelope: SentEnvelope = { v: SENT_VERSION, tapes: sanitizeSent({ v: SENT_VERSION, tapes: list }) };
  return JSON.stringify(envelope);
}

/* -------------------------------------------------------- yours or sent */

/**
 * A tape's identity when only its manifest is at hand: when the Creator was
 * opened for it (`metadata.created`, to the millisecond), its title, its page
 * count and its Signature layer. "" when the tape has no `created`.
 */
function identity(manifest: unknown): string {
  const m = record(manifest);
  const meta = record(m?.metadata);
  const created = text(meta?.created);
  if (!m || !created) return "";
  const pages = Array.isArray(m.pages) ? m.pages.length : 0;
  return JSON.stringify([created, text(meta?.title) || "Untitled Story", pages, m.signature ?? null]);
}

/**
 * The id of the library row that IS the tape opened by `code`, if one of
 * `rows` is: a row whose id or share code is the code, or (a signed-in cloud
 * row carries no code) a row whose tape has the same identity — created time,
 * title, page count and Signature. undefined when none is.
 */
export function libraryIdOf(code: string, manifest: unknown, rows: readonly unknown[]): string | undefined {
  const key = identity(manifest);
  for (const row of rows) {
    const r = record(row);
    const id = text(r?.id);
    if (!r || !id) continue;
    if (code && (id === code || text(r.shareCode) === code)) return id;
    if (key && identity(r.ssyncData) === key) return id;
  }
  return undefined;
}

/** Library rows (this device's, the signed-in cloud's) → their ids and share codes. */
export function ownKeys(rows: readonly unknown[]): { ids: string[]; codes: string[] } {
  const ids: string[] = [];
  const codes: string[] = [];
  for (const row of rows) {
    const r = record(row);
    const id = text(r?.id);
    const code = text(r?.shareCode);
    if (id && !ids.includes(id)) ids.push(id);
    if (code && !codes.includes(code)) codes.push(code);
  }
  return { ids, codes };
}

/**
 * Is this tape yours? True when its id is one of your library's ids, or its
 * code is one of your library's codes (or an id: older builds handed the id
 * out as the code, and the device lookup still accepts it). Yours is never
 * remembered as sent.
 */
export function isOwnTape(
  tape: { id?: string | null; code?: string | null },
  ownIds: Iterable<string>,
  ownCodes: Iterable<string>,
): boolean {
  const ids = new Set(ownIds);
  const codes = new Set(ownCodes);
  const id = tape.id ?? "";
  const code = tape.code ?? "";
  return (id !== "" && ids.has(id)) || (code !== "" && (codes.has(code) || ids.has(code)));
}

/* ----------------------------------------------------------------- NEW */

/** NEW: it arrived strictly after the previous visit. No previous visit: never NEW. */
export function isNewSince(tape: Pick<SentTape, "addedAt">, previousVisit: string | null | undefined): boolean {
  const before = time(previousVisit);
  const added = time(tape.addedAt);
  return Number.isFinite(before) && Number.isFinite(added) && added > before;
}

/** The shelf's order for sent tapes: NEW ones first, then newest arrival first. */
export function orderSent(list: readonly SentTape[], previousVisit: string | null | undefined): SentTape[] {
  const ordered = newestFirst(list);
  return [
    ...ordered.filter((tape) => isNewSince(tape, previousVisit)),
    ...ordered.filter((tape) => !isNewSince(tape, previousVisit)),
  ];
}

/* --------------------------------------------------------------- label */

/** The face's meta, in its two lines: "FROM <AUTHOR>" (when there is one) and "N PAGE(S) · ~m:ss". */
export function sentMetaLines(tape: Pick<SentTape, "author" | "pages" | "runtime">): string[] {
  const size = `${tape.pages} ${tape.pages === 1 ? "PAGE" : "PAGES"} · ${tape.runtime}`;
  const author = tape.author.trim();
  return author ? [`FROM ${author.toUpperCase()}`, size] : [size];
}

/** "FROM <AUTHOR> · N PAGE(S) · ~m:ss" (upper case; no "FROM …" without a maker). */
export function sentMeta(tape: Pick<SentTape, "author" | "pages" | "runtime">): string {
  return sentMetaLines(tape).join(" · ");
}
