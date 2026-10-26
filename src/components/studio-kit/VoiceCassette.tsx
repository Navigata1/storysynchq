"use client";

/**
 * VoiceCassette — a blank voice cassette (brief design_system LOCAL (6): "a
 * 68x60 cassette face (shell, paper label, dark window with two small reels),
 * the name hand-lettered in Fraunces italic over a dashed ink line, a tape-red
 * record dot; 'reading now' = reels rotated with a faint blur"). s07's "Read it
 * in…" panel is its first consumer (T22b: "WHOSE VOICE?"). The brief's locked
 * state ("MADE VOICE · PHASE 3") is a Phase 3 promise and is not built.
 *
 *   kind="voice"    a name (the default): the tape-red record dot at the
 *                   label's right, the dashed line stopping short of it
 *   kind="browser"  the browser's own voice: no record dot (nobody recorded it)
 *   kind="new"      "Someone new": a lucide Plus where the dot would be
 *   readingNow      this voice reads the tape today: the reels turn slowly
 *                   with a faint blur, and the mono caption (default "READING
 *                   NOW") stands under the cassette. Static under reduced motion
 *                   (the kit Reel rests on its 18° frame).
 *   checked         the label-yellow ring and glow around the shell
 *
 * One cassette is a native radio (visually hidden, over the whole cassette)
 * inside its label, so a group of them is one tab stop and the arrows move the
 * check. Its accessible name is the name, plus ", reading now" when it reads
 * today ("Browser voice, reading now", "Mia", "Someone new"); everything drawn
 * is decoration for it. Focus is the kit's gold ring around the shell. Motion
 * and its reduced state live in voice-cassette.css.
 */

import * as React from "react";
import { Plus } from "lucide-react";
import { Reel } from "./kit";
import "./voice-cassette.css";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export type VoiceCassetteKind = "voice" | "browser" | "new";

/** The caption under a cassette that reads the tape today (the reference's own words). */
export const VOICE_READING_NOW = "READING NOW";

/** A cassette's accessible name: "<name>", or "<name>, reading now". */
export function voiceCassetteName(label: string, readingNow = false): string {
  return readingNow ? `${label}, reading now` : label;
}

export interface VoiceCassetteProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "type" | "value" | "checked" | "onChange" | "onSelect" | "name" | "children"
  > {
  /** The name, hand-lettered on the label (two lines at most). */
  label: string;
  /** The radio's value (unique in its group). */
  value: string;
  /** The radio group's name (one per group). */
  name: string;
  checked: boolean;
  onSelect: (value: string) => void;
  kind?: VoiceCassetteKind;
  readingNow?: boolean;
  /** The caption under a cassette that reads today. */
  readingNowLabel?: string;
  /** On the cassette (the label), not the input. */
  className?: string;
}

export function VoiceCassette({
  label,
  value,
  name,
  checked,
  onSelect,
  kind = "voice",
  readingNow = false,
  readingNowLabel = VOICE_READING_NOW,
  className,
  ...rest
}: VoiceCassetteProps) {
  return (
    <label
      data-sk="voice-cassette"
      data-kind={kind}
      data-reading={readingNow ? "true" : "false"}
      className={cx("sk-voice", checked && "is-on", readingNow && "is-reading", className)}
    >
      <input
        {...rest}
        type="radio"
        className="sk-voice-input"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        aria-label={voiceCassetteName(label, readingNow)}
      />
      <span data-sk="voice-shell" className="sk-voice-shell" aria-hidden="true">
        <span data-sk="voice-label" className={cx("sk-voice-label", kind !== "browser" && "sk-voice-label--mark")}>
          <span data-sk="voice-name" className="sk-voice-name">
            {label}
          </span>
          {kind === "voice" ? <span data-sk="voice-rec" className="sk-voice-rec" /> : null}
          {kind === "new" ? (
            <span data-sk="voice-new" className="sk-voice-plus">
              <Plus strokeWidth={3} focusable="false" />
            </span>
          ) : null}
        </span>
        <span className="sk-voice-window">
          <Reel size={9} spinning={readingNow} />
          <Reel size={9} spinning={readingNow} />
        </span>
        <i className="sk-voice-foot" />
      </span>
      {readingNow ? (
        <span data-sk="voice-caption" className="sk-voice-cap" aria-hidden="true">
          {readingNowLabel}
        </span>
      ) : null}
    </label>
  );
}

export default VoiceCassette;
