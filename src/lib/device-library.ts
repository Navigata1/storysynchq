/**
 * This device's tape library (localStorage `ssync-library`), the part one-tap deletion needs.
 * Its own module so the Read Room sweeps a pulled-out tape off this device before, and
 * whether or not, it can fetch the cloud library code (mission P5, P4-R3-01): a child's voice
 * must leave this device even offline (PRIVACY.md rule 2). `cloud-storage.ts` uses it too.
 */

export const LIBRARY_KEY = "ssync-library";

/** Thrown when this browser refuses to write the swept library back. */
export class DeviceSweepError extends Error {
  constructor() {
    super("This browser would not let the tape be removed from this device.");
    this.name = "DeviceSweepError";
  }
}

/**
 * Remove every row with this id from this device's library. Returns whether any row was
 * there. An unreadable library has no rows to remove; a refused write throws.
 */
export function sweepDeviceCopy(id: string): boolean {
  if (typeof window === "undefined") return false;
  let rows: unknown;
  try {
    rows = JSON.parse(window.localStorage.getItem(LIBRARY_KEY) || "[]");
  } catch {
    return false;
  }
  if (!Array.isArray(rows)) return false;
  const isIt = (row: unknown) => typeof row === "object" && row !== null && (row as { id?: unknown }).id === id;
  if (!rows.some(isIt)) return false;
  try {
    window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(rows.filter((row) => !isIt(row))));
  } catch {
    throw new DeviceSweepError();
  }
  return true;
}
