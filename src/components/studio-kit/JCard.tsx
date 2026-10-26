/**
 * JCard — the card inside a cassette case (brief design_system LOCAL (10)):
 * "paper insert, 3px ink border, radius 10, a 24px label-yellow spine at the
 * left with vertical mono 9.5px text; rows of mono 9.5px uppercase keys (ink
 * at 55%) + Geist 12.5px values separated by hairlines; a 6px tape-red stripe
 * along the bottom edge." Register B: it is printed, not glassy.
 *
 * First consumer: the Player's end card (T12, s06), which prints the tape's
 * liner notes on it. The card is a labelled group holding a <dl>:
 *
 *   - `spine` (+ `spineTail`) is drawn by generated content from data
 *     attributes and hidden from assistive tech, so the text on the spine (a
 *     title, usually) is never DOM text twice on a page that already prints it
 *     on a label; a long spine is cut with an ellipsis, the tail never is;
 *   - each row is a <dt>/<dd> pair; `stamped` adds the small tape-red ring
 *     glyph (decorative) under the row's key, as the s06 CONSENT row has;
 *   - `footer` is the card's last row, under a hairline (s06: the
 *     "What's inside this tape? →" link, styled here as the reference's
 *     mono link row).
 *
 * Static under every motion preference: nothing on a J-card moves. No hooks,
 * no handlers: it renders the same on the server and in a client tree.
 *
 * The rows size the card; the spine only stretches to their height (its line
 * is laid out of flow), so a title of any length never makes the card taller.
 */

import * as React from "react";
import { Check } from "lucide-react";
import "./jcard.css";

/**
 * A spine line (spine + tail) longer than this many characters is set a
 * little tighter (0.16em instead of the reference's 0.2em), so more of a long
 * title survives before the ellipsis. The s06 reference spine is 25
 * characters and keeps the reference spacing.
 */
const SPINE_TIGHT_AFTER = 26;
/**
 * A card with fewer rows than this is short, so its spine is short too: a
 * long line there sets tighter still (0.12em), for a few more letters.
 */
const SHORT_CARD_ROWS = 5;

export interface JCardRow {
  /** Stable id, written as `data-row` (e.g. "PICTURES"). */
  id: string;
  /** The key as read aloud ("Pictures"); printed in uppercase mono. */
  label: string;
  /** The value: text, or inline pieces such as a mood tag. */
  value: React.ReactNode;
  /** Ink the small tape-red ring glyph on this row (decorative). */
  stamped?: boolean;
}

export interface JCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** The card's accessible name, e.g. "Liner notes". */
  label: string;
  /**
   * Printed up the spine (a title, usually). Drawn from a data attribute by
   * generated content — never DOM text — and cut with an ellipsis when long.
   */
  spine: string;
  /** Printed after `spine` and never cut, e.g. " · SIDE A". */
  spineTail?: string;
  /** The key/value rows, in print order. */
  rows: readonly JCardRow[];
  /** The card's last row, under a hairline — e.g. a link. */
  footer?: React.ReactNode;
}

export function JCard({ label, spine, spineTail, rows, footer, className, ...rest }: JCardProps) {
  const tail = spineTail ?? "";
  const long = spine.length + tail.length > SPINE_TIGHT_AFTER;
  const fit = long ? (rows.length < SHORT_CARD_ROWS ? "tighter" : "tight") : undefined;
  return (
    <div
      {...rest}
      role="group"
      aria-label={label}
      data-sk="jcard"
      className={className ? `sk-jcard ${className}` : "sk-jcard"}
    >
      <div className="sk-jcard-spine" data-jcard="spine" aria-hidden="true">
        <span
          className="sk-jcard-spine-text"
          data-spine={spine}
          data-spine-tail={tail}
          data-spine-fit={fit}
        />
      </div>
      <div className="sk-jcard-body">
        <dl className="sk-jcard-rows">
          {rows.map((row) => (
            <div
              key={row.id}
              className="sk-jcard-row"
              data-row={row.id}
              data-stamped={row.stamped ? "true" : undefined}
            >
              <dt className="sk-jcard-key">
                {row.label}
                {row.stamped ? (
                  <span className="sk-jcard-stamp" data-jcard="stamp" aria-hidden="true">
                    <Check strokeWidth={3} aria-hidden="true" focusable="false" />
                  </span>
                ) : null}
              </dt>
              <dd className="sk-jcard-value">{row.value}</dd>
            </div>
          ))}
        </dl>
        {footer ? <div className="sk-jcard-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export default JCard;
