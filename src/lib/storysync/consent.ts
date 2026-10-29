/**
 * Voice consent, as the Creator writes it into `signature.voiceConsent[]`
 * (docs/format-spec.md §7.1): one record per recorded voice, dated with the
 * calendar day the grown-up gave it.
 *
 * Pure: no DOM, no storage, no clock of its own. The grown-up gate lists
 * `recordedVoices` (one consent row each, each asking whose voice it is); the
 * publish assembly writes `consentRecordsFor(choices, consentDate(now))`, one
 * record per voice with that voice's own `grantedBy`. The gate's stamp prints
 * the same date as `stampDate(...)`.
 */

import type { SsyncPage, SsyncSignature } from "./manifest";

/** One `signature.voiceConsent[]` record, always dated. */
export type VoiceConsentRecord = NonNullable<SsyncSignature["voiceConsent"]>[number] & {
  date: string;
};

/** Who a recorded page is credited to when neither the page nor "story by" names anyone. */
export const UNNAMED_VOICE = "narrator";

/**
 * The distinct voices recorded on these pages, in page order.
 *
 * Only pages that carry `text.audioUrl` count. A page's voice is its own
 * `text.voice`, else the "story by" line, else "narrator" (each trimmed), so a
 * tape recorded by one person with no per-page credit has exactly one voice:
 * the byline.
 */
export function recordedVoices(
  pages: readonly Pick<SsyncPage, "text">[],
  byline: string | null | undefined,
): string[] {
  const fallback = (byline ?? "").trim() || UNNAMED_VOICE;
  const voices: string[] = [];
  for (const page of pages) {
    if (!page.text?.audioUrl) continue;
    const voice = page.text.voice?.trim() || fallback;
    if (!voices.includes(voice)) voices.push(voice);
  }
  return voices;
}

/**
 * The local calendar date of `date` as `YYYY-MM-DD` — the day on the
 * consenting device's own calendar. Never `toISOString()`: at 11:30 pm in
 * Los Angeles that would already say tomorrow.
 */
export function consentDate(date: Date): string {
  const yyyy = String(date.getFullYear()).padStart(4, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Who gave a voice's consent (`voiceConsent[].grantedBy`): a parent or
 * guardian for a child's voice, or the grown-up herself for her own (s06,
 * "Mine — I'm the grown-up speaking"). The schema takes any string; the
 * Creator writes only these two.
 */
export type ConsentGrantor = "parent/guardian" | "self";

/** One voice and who consented to it, as the grown-up gate answers. */
export interface ConsentChoice {
  voice: string;
  grantedBy: ConsentGrantor;
}

/** One record per choice, in order, each with its own grantor, all dated `date`. */
export function consentRecordsFor(
  choices: readonly ConsentChoice[],
  date: string,
): VoiceConsentRecord[] {
  return choices.map(({ voice, grantedBy }) => ({ voice, grantedBy, date }));
}

const STAMP_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * A consent date as the stamp inks it: `stampDate("2026-10-19")` → "OCT 19 2026".
 * Anything that is not a `YYYY-MM-DD` calendar date is returned as it is.
 */
export function stampDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const month = STAMP_MONTHS[Number(m[2]) - 1];
  if (!month) return date;
  return `${month} ${Number(m[3])} ${m[1]}`;
}
