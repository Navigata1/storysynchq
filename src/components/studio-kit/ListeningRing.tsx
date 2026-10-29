"use client";

/**
 * ListeningRing — "the tape is listening" (brief design_system: recording =
 * the live record button plus a tape-red listening ring).
 *
 * Wraps the thing being told — the Stage photo — exactly. While `active` it
 * draws the s03 ring: a 3px tape-red inset line and a soft red inner glow
 * (`inset 0 0 0 3px #E3452F, inset 0 0 80px rgba(227,69,47,.35)`), a faint red
 * halo outside, and an optional pill at its bottom centre ("Listening… 0:05")
 * with a static live dot. Nothing pulses: the Creator does not loop.
 *
 * The ring is declared on the wrapper (`[data-sk="listening-ring"]`,
 * `data-active`) and painted over the child by a pseudo-element that inherits
 * it, so an opaque photo never hides its own ring.
 *
 * Reduced motion: the ring appears and leaves with no transition.
 */

import * as React from "react";
import "./listening-ring.css";

export interface ListeningRingProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The tape is listening. */
  active: boolean;
  /**
   * Shown at the bottom centre while active, after a static live dot — e.g.
   * "Listening… 0:05". Omit for a ring with no pill.
   */
  label?: React.ReactNode;
  /** Extra attributes for the pill (tests, ids). */
  labelProps?: React.HTMLAttributes<HTMLSpanElement> & Record<`data-${string}`, string>;
  children?: React.ReactNode;
}

export function ListeningRing({
  active,
  label,
  labelProps,
  className,
  children,
  ...rest
}: ListeningRingProps) {
  return (
    <div
      {...rest}
      data-sk="listening-ring"
      data-active={active ? "true" : "false"}
      className={className ? `sk-listening-ring ${className}` : "sk-listening-ring"}
    >
      {children}
      {active && label ? (
        <span {...labelProps} className="sk-listening-pill">
          <i className="sk-listening-dot" data-studio="live-dot" aria-hidden="true" />
          {label}
        </span>
      ) : null}
    </div>
  );
}

export default ListeningRing;
