/**
 * Voice consent, as the Creator writes it into `signature.voiceConsent[]`
 * (docs/format-spec.md §7.1): one record per recorded voice, dated with the
 * calendar day the grown-up gave it.
 *
 * Pure: no DOM, no storage, no clock of its own. The grown-up gate lists
 * `recordedVoices` (one consent row each); the publish assembly writes
 * `consentRecords(voices, "parent/guardian", consentDate(now))`.
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

/** One record per voice, in voice order, all granted by `grantedBy` on `date`. */
export function consentRecords(
  voices: readonly string[],
  grantedBy: string,
  date: string,
): VoiceConsentRecord[] {
  return voices.map((voice) => ({ voice, grantedBy, date }));
}
