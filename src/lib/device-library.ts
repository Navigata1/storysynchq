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

/** What pulling a tape out did, for the Read Room to say exactly that. */
export type PullOutcome =
  /** every copy this device could reach is gone */
  | { kind: "gone" }
  /** gone from this device; the cloud half could not be done, so a cloud copy may remain */
  | { kind: "cloud-unreached"; why: string }
  /** nothing was removed */
  | { kind: "kept"; why: string };

const reason = (err: unknown) => (err instanceof Error && err.message ? err.message : "Try again.");

/**
 * Pull tape `id` out (one-tap deletion, PRIVACY.md): this device's copy first, from code already
 * here, so a child's voice leaves this device even offline (P4-R3-01); then, when a cloud is
 * configured, `cloud` removes its link and its cloud row. `forgetHere` (its draft, its reading
 * places) runs once a copy is really gone: after a device sweep, or a cloud delete. A cloud-only
 * tape whose cloud cannot be reached keeps both (P6-R1-02).
 */
export async function pullTapeOut(
  id: string,
  steps: { forgetHere: () => void; cloud?: () => Promise<void> },
): Promise<PullOutcome> {
  let swept: boolean;
  try {
    swept = sweepDeviceCopy(id);
  } catch (err) {
    return { kind: "kept", why: reason(err) };
  }
  if (steps.cloud) {
    try {
      await steps.cloud();
    } catch (err) {
      if (!swept) return { kind: "kept", why: reason(err) };
      steps.forgetHere();
      return { kind: "cloud-unreached", why: reason(err) };
    }
  }
  steps.forgetHere();
  return { kind: "gone" };
}
