/**
 * Resume store — the storage half of where you stopped (T21). ./resume.ts is
 * the pure half (the envelope, the keys, record / clear); this file is the one
 * place that reads and writes `ssync-resume`, and the one answer to "every key
 * a tape's place could be under", so that deleting a story forgets its place
 * wherever the deletion happens: the shelf's pull-out, "Take it off this
 * shelf", and the Studio's "Pull the tape out — delete everything" (HANDOFF
 * §2 and §7: delete removes every copy; PRIVACY.md "What is stored where").
 *
 *   readResume()                the places this device keeps
 *   writeResume(store)          keep them; none left removes the key
 *   forgetPlaces(keys)          forget each key's place; the places as they
 *                               now stand
 *   placeKeysOfTape(manifest, { id?, shareCode? })
 *                               every key one library row's place could be
 *                               under, from any door: the link in the tape,
 *                               the code it was shared under, `code:<id>`, and
 *                               its created + title as stored and as played
 *   placeKeysOfStories(ids)     the same for this device's library rows `ids`
 *                               (read them before they are deleted); an id
 *                               with no row here is still `code:<id>`
 *
 * SSR-safe: with no window (the server, Node) there are no places and nothing
 * is written, and every storage call is in try/catch (private windows, blocked
 * storage). Nothing is fetched or sent. Relative imports only.
 */

import type { SsyncManifest } from "../../lib/storysync/manifest";
import { normalizeTapeManifest } from "../../lib/storysync/tape-source";
import {
  clearTape,
  codeKey,
  RESUME_KEY,
  sanitizeResume,
  serializeResume,
  tapeKey,
  titleKey,
  type ResumeStore,
} from "./resume";
import { parseLibrary, SHELF_LIBRARY_KEY } from "./shelf";

/** This browser's storage, or null (the server, or storage that throws). */
function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The places this device keeps (never throws; no storage reads as none). */
export function readResume(): ResumeStore {
  try {
    return sanitizeResume(storage()?.getItem(RESUME_KEY) ?? null);
  } catch {
    return sanitizeResume(null);
  }
}

/** Keep the places; none left leaves nothing behind. */
export function writeResume(store: ResumeStore): void {
  const local = storage();
  if (!local) return;
  try {
    if (Object.keys(store.tapes).length === 0) local.removeItem(RESUME_KEY);
    else local.setItem(RESUME_KEY, serializeResume(store));
  } catch {
    /* no storage: the place is simply not kept */
  }
}

/** Forget the place under each key; the places as they now stand. */
export function forgetPlaces(keys: ReadonlyArray<string | null | undefined>): ResumeStore {
  const store = readResume();
  const next = keys.reduce<ResumeStore>((acc, key) => clearTape(acc, key ?? null), store);
  if (next !== store) writeResume(next);
  return next;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Every key a library row's place could be under, whichever door it was read
 * through: a link (`code:` from the link in the tape, or the code it was shared
 * under, or an old link that named the library id), the shelf (the same), a
 * file or a tape with no link (`t:<created>|<title>`, as stored and as the
 * Player opens it, which names an untitled tape "Untitled Story").
 */
export function placeKeysOfTape(
  manifest: unknown,
  { id, shareCode }: { id?: string | null; shareCode?: string | null },
): string[] {
  const keys = new Set<string>();
  const add = (key: string | null) => {
    if (key) keys.add(key);
  };
  const stored = record(manifest) ? (manifest as SsyncManifest) : null;
  const played = normalizeTapeManifest(manifest);
  const code = text(shareCode);
  for (const tape of [played, stored]) {
    if (!tape) continue;
    add(tapeKey(tape, code || null));
    add(titleKey(tape));
  }
  if (text(id)) add(codeKey(text(id)));
  if (code) add(codeKey(code));
  return [...keys];
}

/**
 * Every key this device's library rows `ids` could be remembered under. Call
 * it before the rows are deleted. A cloud copy is not read here: its id still
 * gives `code:<id>`, and the caller adds the keys of the tape it holds.
 */
export function placeKeysOfStories(ids: readonly string[]): string[] {
  let rows: unknown[] = [];
  try {
    rows = parseLibrary(storage()?.getItem(SHELF_LIBRARY_KEY) ?? null);
  } catch {
    rows = [];
  }
  const keys = new Set<string>();
  for (const id of ids) {
    const row = rows.map(record).find((r) => r && text(r.id) === id);
    const found = row ? placeKeysOfTape(row.ssyncData, { id, shareCode: text(row.shareCode) }) : [codeKey(id)];
    for (const key of found) keys.add(key);
  }
  return [...keys];
}
