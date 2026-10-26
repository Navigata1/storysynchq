"use client";

/**
 * MoodTapeChip — one of the eight moods as a little tape label (brief
 * design_system LOCAL (5): "paper label, 2px ink border, radius 8, a 5px band
 * of the mood color across its top, sprite icon + Fraunces 700 14px name +
 * 11px ink-2 blurb + a 6-dot music-box contour in the mood color at the
 * right; selected = label-yellow field and a 3px ink border"). s07's "Read it
 * in…" panel is its first consumer (T22a); T24b shows a resolved mood with the
 * same icon set (`MOOD_ICON`).
 *
 *   MoodTapeChip       one chip: a native radio (visually hidden, covering the
 *                      chip) inside its label. Accessible name "<Name>, <blurb>";
 *                      the printed name and blurb are decoration for it.
 *   MoodTapeChipGroup  the eight chips as one radio group, in `MOOD_NAMES`
 *                      order, 2 columns × 4 rows (gap 8; one column below
 *                      360 px). Native radios: one tab stop, the arrow keys
 *                      move the check.
 *
 * Names and blurbs come from the shared mood module (src/lib/audio/moods.ts)
 * verbatim, colours from the T05a tokens (`--mood-*`). Motion (the field
 * warming to label-yellow) lives in mood-tape-chip.css with its reduced-motion
 * state: none.
 */

import * as React from "react";
import { Cloud, CloudRain, Compass, Eye, Leaf, Moon, Star, Sun, type LucideIcon } from "lucide-react";
import { MOOD_NAMES, MOODS, type MoodName } from "@/lib/audio/moods";
import "./mood-tape-chip.css";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** The mood icon set (the reference sprite's, as lucide-react). */
export const MOOD_ICON: Record<MoodName, LucideIcon> = {
  Wonder: Star,
  Adventure: Compass,
  Calm: Moon,
  Joy: Sun,
  Hush: Cloud,
  Rain: CloudRain,
  Suspense: Eye,
  Melancholy: Leaf,
};

/**
 * Each mood's music-box contour: six dots, their drop in px from the top of a
 * 15px row (0 = highest note). The reference's shapes (s07 `.s7-contour`):
 * Calm settles downward, Joy skips, Suspense holds and then leaps.
 */
export const MOOD_CONTOUR: Record<MoodName, readonly number[]> = {
  Wonder: [9, 6, 8, 3, 5, 0],
  Adventure: [10, 3, 8, 0, 6, 1],
  Calm: [2, 4, 5, 7, 8, 10],
  Joy: [7, 1, 7, 1, 4, 0],
  Hush: [7, 8, 6, 9, 8, 10],
  Rain: [1, 4, 3, 6, 5, 9],
  Suspense: [9, 10, 9, 10, 8, 0],
  Melancholy: [0, 3, 2, 5, 7, 10],
};

/** The chip's accessible name: "<Name>, <blurb>". */
export function moodChipName(mood: MoodName): string {
  return `${mood}, ${MOODS[mood].blurb}`;
}

/** Inline custom properties without fighting the CSSProperties type. */
function vars(values: Record<string, string | number>): React.CSSProperties {
  return values as unknown as React.CSSProperties;
}

/* ----------------------------------------------------------- MoodTapeChip */

export interface MoodTapeChipProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "type" | "value" | "checked" | "onChange" | "onSelect" | "name"
  > {
  mood: MoodName;
  checked: boolean;
  /** The radio group's name (one per group). */
  name: string;
  onSelect: (mood: MoodName) => void;
  /** On the chip (the label), not the input. */
  className?: string;
}

export function MoodTapeChip({ mood, checked, name, onSelect, className, ...rest }: MoodTapeChipProps) {
  const Icon = MOOD_ICON[mood];
  return (
    <label
      data-sk="mood-chip"
      data-mood={mood}
      className={cx("sk-mood-chip", checked && "is-on", className)}
      style={vars({ "--sk-mood": `var(--mood-${mood.toLowerCase()})` })}
    >
      <input
        {...rest}
        type="radio"
        className="sk-mood-chip-input"
        name={name}
        value={mood}
        checked={checked}
        onChange={() => onSelect(mood)}
        aria-label={moodChipName(mood)}
      />
      <span data-sk="mood-band" className="sk-mood-chip-band" aria-hidden="true" />
      <span className="sk-mood-chip-top" aria-hidden="true">
        <Icon className="sk-mood-chip-icon" strokeWidth={2.3} focusable="false" />
        <span className="sk-mood-chip-name">{mood}</span>
        <span className="sk-mood-chip-contour">
          {MOOD_CONTOUR[mood].map((y, i) => (
            <i key={i} className="sk-mood-chip-dot" style={vars({ "--x": i, "--y": y })} />
          ))}
        </span>
      </span>
      <span className="sk-mood-chip-blurb" aria-hidden="true">
        {MOODS[mood].blurb}
      </span>
    </label>
  );
}

/* ------------------------------------------------------ MoodTapeChipGroup */

export interface MoodTapeChipGroupProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  value: MoodName;
  onChange: (mood: MoodName) => void;
  /** The id of the visible label that names the group (or pass `aria-label`). */
  labelledBy?: string;
}

export function MoodTapeChipGroup({ value, onChange, labelledBy, className, ...rest }: MoodTapeChipGroupProps) {
  const name = React.useId();
  return (
    <div
      {...rest}
      role="radiogroup"
      aria-labelledby={labelledBy}
      data-sk="mood-chips"
      className={cx("sk-mood-chips", className)}
    >
      {MOOD_NAMES.map((mood) => (
        <MoodTapeChip key={mood} mood={mood} name={name} checked={mood === value} onSelect={onChange} />
      ))}
    </div>
  );
}
