/**
 * Whose voice is on the tape — `metadata.narrator`, derived at publish.
 *
 * No screen asks "whose voice?" yet, so the narrator is the lead name of the
 * "story by" line the grown-up types in the gate: "Ada, age 4 — with Dad"
 * names "Ada". A tape with no recorded voice is read by the browser voice and
 * must never claim a person's name, so it gets no narrator at all.
 *
 * Pure: no DOM, no storage. The Creator's publish assembly calls
 * `resolveNarrator` and sets or deletes `metadata.narrator` with the result;
 * the Player prints "VOICE: <narrator>" on the cover and the name in the deck
 * chip only when it is present.
 */

/** Longest narrator name written into a tape, in characters. */
export const NARRATOR_MAX_CHARS = 40;

/**
 * Where a story-by line stops naming its lead voice: a comma, a dash with
 * spaces round it (em, en or hyphen), " with ", or an opening bracket. An em
 * or en dash is never part of a name, so it ends the name even without spaces;
 * a bare hyphen is ("Mary-Kate").
 */
const LEAD_NAME_END = /,|\s-\s|[—–]|\swith\s|\(/i;

/**
 * The lead name of a "story by" line, or `undefined` when it names nobody.
 *
 *   "Ada, age 4 — with Dad" → "Ada"
 *   "Bo (5) with Mum"       → "Bo"
 *   "  Mom "                → "Mom"
 *   ""                      → undefined
 *
 * Whitespace is tidied to single spaces and the result is capped at
 * NARRATOR_MAX_CHARS characters (code points, so an emoji is never halved).
 */
export function narratorFromByline(byline: string | null | undefined): string | undefined {
  if (!byline) return undefined;
  const tidy = byline.replace(/\s+/g, " ");
  const cut = tidy.search(LEAD_NAME_END);
  const lead = (cut === -1 ? tidy : tidy.slice(0, cut)).trim();
  const capped = Array.from(lead).slice(0, NARRATOR_MAX_CHARS).join("").trimEnd();
  return capped || undefined;
}

export interface ResolveNarratorInput {
  /** The gate's "story by", as typed. */
  byline?: string | null;
  /** The draft's `metadata.narrator`, if it already carried one. */
  existing?: string | null;
  /** Any published page carries `text.audioUrl`. */
  hasRecordedVoice: boolean;
}

/**
 * The narrator a publish writes: none without a recorded voice; otherwise the
 * byline's lead name, then the narrator the draft already carried.
 */
export function resolveNarrator({
  byline,
  existing,
  hasRecordedVoice,
}: ResolveNarratorInput): string | undefined {
  if (!hasRecordedVoice) return undefined;
  return narratorFromByline(byline) ?? (existing?.trim() || undefined);
}
