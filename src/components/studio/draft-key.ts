/**
 * Where the Studio keeps its one autosaved draft, and how to wipe it. Its own module so the
 * Read Room can wipe a pulled-out tape's draft (one-tap deletion, PRIVACY.md) without loading
 * the Studio's state types (mission P4, C7). `draft.ts` re-exports both.
 */

export const DRAFT_KEY = "ssync-studio-draft";

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nothing we can do; the in-memory story is already gone */
  }
}
