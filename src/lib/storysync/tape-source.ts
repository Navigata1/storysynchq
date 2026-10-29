/**
 * Tape source — the one answer to "what tape does this mean?".
 *
 * The Read Room (`/read?story=<code>`) and the Creator (`/studio?open=<code>`)
 * resolve a share code the same way, through this module:
 *
 *   loadTapeByCode(code)   the cloud by share code first, then this device's
 *                          own library (the offline half of a share link)
 *   normalizeTapeManifest  the permissive reader: SSYNC v1 documents, v2
 *                          manifests and cloud rows written by older builds
 *   deviceTapeByCode       this device's library, by share code or id
 *   HOUSE_TAPE_URL         the house tape, "The Brave Little Star"
 *
 * Moved unchanged from src/components/player/ReadRoom.tsx (T15). Nothing here
 * uploads anything; a code is only ever looked up.
 */

import { getSharedBook } from "../cloud-storage";
import type { SsyncManifest, SsyncPage } from "./manifest";

/** The house tape, served from this app's own /public. */
export const HOUSE_TAPE_URL = "/demo/brave-little-star.ssync.json";

/** The localStorage library `@/lib/cloud-storage` writes when there is no cloud. */
const DEVICE_LIBRARY_KEY = "ssync-library";

/**
 * Permissive read of anything claiming to be a story: SSYNC v1 documents, v2
 * manifests, and cloud rows written by older builds all have to play. Unknown
 * fields ride along untouched; only the pieces the Player depends on are
 * repaired.
 */
export function normalizeTapeManifest(raw: unknown): SsyncManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;

  const rawPages = Array.isArray(src.pages) ? src.pages : [];
  const pages: SsyncPage[] = rawPages
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p, i) => ({
      ...(p as unknown as SsyncPage),
      id: typeof p.id === "number" ? p.id : i + 1,
    }));
  if (pages.length === 0) return null;

  const rawMeta =
    src.metadata && typeof src.metadata === "object"
      ? (src.metadata as Record<string, unknown>)
      : {};
  const title =
    typeof rawMeta.title === "string" && rawMeta.title.trim() ? rawMeta.title : "Untitled Story";

  return {
    ...src,
    version: typeof src.version === "string" ? src.version : "1.0",
    metadata: { ...rawMeta, title },
    pages,
  } as unknown as SsyncManifest;
}

/**
 * A story saved on this device (the localStorage library used whenever Supabase
 * is not configured) opened by its own link, on the same device. Nothing is
 * fetched and nothing is uploaded — this is the offline half of `?story=`.
 */
export function deviceTapeByCode(code: string): SsyncManifest | null {
  try {
    const raw = window.localStorage.getItem(DEVICE_LIBRARY_KEY);
    if (!raw) return null;
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows)) return null;
    const hit = rows.find((row) => {
      if (!row || typeof row !== "object") return false;
      const r = row as { id?: unknown; shareCode?: unknown };
      return r.id === code || r.shareCode === code;
    }) as { ssyncData?: unknown } | undefined;
    return hit ? normalizeTapeManifest(hit.ssyncData) : null;
  } catch {
    return null;
  }
}

/**
 * The tape a share code names: the cloud copy first, then this device's own
 * library. `null` when neither has it (a mistyped link, or a story its maker
 * deleted). A cloud that cannot be reached counts as "not there", and the
 * device library is still asked.
 */
export async function loadTapeByCode(code: string): Promise<SsyncManifest | null> {
  let cloud: SsyncManifest | null = null;
  try {
    const book = await getSharedBook(code);
    cloud = book ? normalizeTapeManifest(book.ssyncData) : null;
  } catch {
    cloud = null;
  }
  return cloud ?? deviceTapeByCode(code);
}
