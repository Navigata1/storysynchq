"use client";

/**
 * Presentation for the shared mood vocabulary.
 *
 * The names, blurbs and musical specs belong to `@/lib/audio/moods` — that is
 * the protocol vocabulary the Player resolves. All that lives here is what a
 * mood *looks like* in the studio: an emoji a four-year-old can aim at, and the
 * chrome-register pill colours.
 */

import { MOODS, MOOD_NAMES, type MoodName } from "@/lib/audio/moods";

export interface MoodChrome {
  emoji: string;
  /** Tailwind classes for the mood pill (Register A chrome). */
  pill: string;
}

export const MOOD_CHROME: Record<MoodName, MoodChrome> = {
  Wonder: { emoji: "🌟", pill: "border-amber-400/45 bg-amber-500/15 text-amber-200" },
  Adventure: { emoji: "🧭", pill: "border-orange-400/45 bg-orange-500/15 text-orange-200" },
  Calm: { emoji: "🌙", pill: "border-sky-400/45 bg-sky-500/15 text-sky-200" },
  Joy: { emoji: "☀️", pill: "border-yellow-400/45 bg-yellow-500/15 text-yellow-200" },
  Hush: { emoji: "🌫️", pill: "border-violet-400/45 bg-violet-500/15 text-violet-200" },
  Rain: { emoji: "🌧️", pill: "border-slate-400/45 bg-slate-500/15 text-slate-200" },
  Suspense: { emoji: "🫢", pill: "border-indigo-400/45 bg-indigo-500/15 text-indigo-200" },
  Melancholy: { emoji: "🍂", pill: "border-rose-400/45 bg-rose-500/15 text-rose-200" },
};

/** Child-facing description, straight from the shared spec. */
export function moodBlurb(name: MoodName): string {
  return MOODS[name].blurb;
}

/** Engineer-facing one-liner for the inspector: what the bed actually plays. */
export function moodReadout(name: MoodName): string {
  const spec = MOODS[name];
  return `${spec.scaleName} · ${spec.tempo} BPM`;
}

export { MOOD_NAMES };
export type { MoodName };
