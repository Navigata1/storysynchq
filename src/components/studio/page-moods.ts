/**
 * Per-page moods (T24a) — which mood each page of a Creator draft plays.
 *
 * The Creator keeps one story `mood` and, in Advanced, lets any page have its
 * own: `pageMoods`, page id → mood, draft-only. A page with no entry follows
 * the story. Overrides never live in the draft's `page.music`, so the Studio's
 * choice still wins over stale page data exactly as before; `page.music` is
 * written only at publish, from `publishedMusic`.
 *
 * Pure: no React, no DOM, no storage. Relative imports only, so
 * `tests/vision-page-moods.spec.ts` imports this module directly in Node. The
 * source side reads T10's music plan, the same answer the Player plays.
 */

import { MOOD_NAMES, type MoodName } from "../../lib/audio/moods";
import { musicPlan, type MusicPlanManifest } from "../player/music-plan";

/** page id (as a string) → that page's own mood. */
export type PageMoods = Record<string, MoodName>;

type PageId = number | string;

/** The only Studio state these helpers read (a `StudioState` fits). */
export interface PageMoodsState {
  mood: MoodName;
  musicOn: boolean;
  /** Absent in a state written before T24a: every page follows the story. */
  pageMoods?: PageMoods;
  manifest: { pages: ReadonlyArray<{ id: PageId }> };
}

const KNOWN: ReadonlySet<string> = new Set(MOOD_NAMES);

function isMood(value: unknown): value is MoodName {
  return typeof value === "string" && KNOWN.has(value);
}

/** The page's own mood when it has one, else the story's. */
export function effectiveMood(state: PageMoodsState, pageId: PageId | undefined): MoodName {
  if (pageId === undefined) return state.mood;
  return state.pageMoods?.[String(pageId)] ?? state.mood;
}

/** What publish writes as the page's `music`: its mood when music is on, nothing when off. */
export function publishedMusic(state: PageMoodsState, pageId: PageId): MoodName | undefined {
  return state.musicOn ? effectiveMood(state, pageId) : undefined;
}

/**
 * Re-key the overrides when publish renumbers the pages to 1…n:
 * `oldIdsInOrder[i]` becomes page `i + 1`. An override for a page that is not
 * in the list goes with it.
 */
export function renumberPageMoods(pageMoods: PageMoods, oldIdsInOrder: readonly PageId[]): PageMoods {
  const next: PageMoods = {};
  oldIdsInOrder.forEach((oldId, index) => {
    const mood = pageMoods[String(oldId)];
    if (mood) next[String(index + 1)] = mood;
  });
  return next;
}

/** Only the overrides whose page is still in the story. */
export function prunePageMoods(pageMoods: PageMoods, pageIds: readonly PageId[]): PageMoods {
  const next: PageMoods = {};
  for (const id of pageIds) {
    const mood = pageMoods[String(id)];
    if (mood) next[String(id)] = mood;
  }
  return next;
}

/**
 * A stored value as overrides: an object whose keys are page ids in the story
 * and whose values are mood names. Anything else is dropped.
 */
export function sanitizePageMoods(value: unknown, pageIds: readonly PageId[]): PageMoods {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const stored = value as Record<string, unknown>;
  const next: PageMoods = {};
  for (const id of pageIds) {
    const mood = stored[String(id)];
    if (isMood(mood)) next[String(id)] = mood;
  }
  return next;
}

/** The mood lane, one entry per page in page order; `null` everywhere when the music is off. */
export function moodsForLane(state: PageMoodsState): (MoodName | null)[] {
  return state.manifest.pages.map((page) => (state.musicOn ? effectiveMood(state, page.id) : null));
}

/**
 * A source tape's per-page moods, read through T10's music plan (v1 track ids
 * and `{ crossfade }` objects included), keyed by the re-voiced page ids 1…n.
 * Only pages whose mood differs from the story mood are overrides; a page
 * with no music is not one.
 */
export function sourcePageMoods(source: MusicPlanManifest, storyMood: MoodName): PageMoods {
  const next: PageMoods = {};
  musicPlan(source).forEach(({ mood }, index) => {
    if (mood && mood !== storyMood) next[String(index + 1)] = mood;
  });
  return next;
}
