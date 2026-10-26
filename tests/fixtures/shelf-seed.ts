/**
 * Shelf seeds for the Read Room's "YOUR TAPES" (T20a; T20b and T21 extend it).
 *
 *   seedShelf(page, { library, draft? })  writes this device's `ssync-library`
 *                                         and, optionally, the Studio's saved
 *                                         draft — ONCE per browser context
 *   shelfRow(story, code, createdAt)      one library row with a fixed save time
 *   pictureLessTape(title, author?)       a synthetic tape with words and no picture
 *   publishedDraft(id, code)              the Creator's draft of a tape that was
 *                                         published as library row `id`
 *
 * "Once per browser context": the init script runs before the app on every
 * document of every page in the context, and a marker key in localStorage
 * (shared by the whole origin) stops it from writing again, so a pull-out stays
 * pulled out across later navigations, reloads and new tabs.
 *
 * Illustrative content only (tests/fixtures/README.md). Nothing here may be
 * imported from src/ or public/.
 */

import type { Page } from "@playwright/test";
import type { SsyncManifest } from "../../src/lib/storysync/manifest";
import type { StudioState } from "../../src/components/studio/types";
import { libraryRow, READER_LIBRARY_KEY, type ReaderLibraryRow } from "./reader-tapes";
import { DRAFT_KEY, studioDraftState } from "./helpers";

/** The marker that makes a seed run once per browser context. */
export const SHELF_SEED_MARKER = "ssync-test-shelf-seeded";

export interface ShelfSeed {
  /** This device's whole library, as rows (`libraryRow` / `shelfRow`). */
  library: readonly ReaderLibraryRow[];
  /** The Studio's saved state; written as the draft envelope (v1). */
  draft?: StudioState;
}

/** Write the shelf's storage before the app's code runs, once per browser context. */
export async function seedShelf(page: Page, { library, draft }: ShelfSeed): Promise<void> {
  await page.context().addInitScript(
    ({ marker, libraryKey, libraryJson, draftKey, draftJson }) => {
      try {
        if (window.localStorage.getItem(marker)) return;
        window.localStorage.setItem(libraryKey, libraryJson);
        if (draftJson) {
          const envelope = { v: 1, savedAt: new Date().toISOString(), state: JSON.parse(draftJson) };
          window.localStorage.setItem(draftKey, JSON.stringify(envelope));
        }
        window.localStorage.setItem(marker, "1");
      } catch {
        /* opaque origins (about:blank) have no storage; the next document seeds */
      }
    },
    {
      marker: SHELF_SEED_MARKER,
      libraryKey: READER_LIBRARY_KEY,
      libraryJson: JSON.stringify(library),
      draftKey: DRAFT_KEY,
      draftJson: draft ? JSON.stringify(draft) : "",
    },
  );
}

/** A library row with a fixed save time, so the shelf order is the test's. */
export function shelfRow(story: SsyncManifest, shareCode: string, createdAt: string): ReaderLibraryRow {
  return libraryRow(story, shareCode, { createdAt });
}

/** A synthetic tape: words on two pages, no picture, no voice (read along). */
export function pictureLessTape(title: string, author = "Shelf fixture"): SsyncManifest {
  return {
    version: "2.0",
    metadata: { title, author, genre: "children", ageRange: "3-8" },
    settings: { autoPlay: false, pageTurnSound: true, readAlongHighlight: true },
    pages: [
      { id: 1, layout: "full", text: { content: "Bubbles climbed the bath like a little ladder." } },
      { id: 2, layout: "full", text: { content: "Then the duck sang, and everybody joined in." } },
    ],
  };
}

/**
 * The Creator's saved draft for Twinkle as it stands after publishing it as
 * library row `id` (code `shareCode`): `published.id` and `publishedIds` name
 * that row. Pass a different `id` for a draft of another story.
 */
export function publishedDraft(id: string, shareCode: string): StudioState {
  const state = studioDraftState("twinkle", { byline: "Mia, age 4 — with Mom", published: true });
  return {
    ...state,
    published: { id, shareCode, cloud: false, at: "2026-10-19T18:10:00.000Z" },
    publishedIds: [id],
    startedAt: "2026-10-19T18:02:10.000Z",
  };
}
