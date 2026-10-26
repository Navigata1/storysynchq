"use client";

/**
 * Shelf + ShelfTape — tapes standing on a ledge (brief design_system LOCAL (8):
 * "an 8px shell ledge with a 1px top highlight and a soft shadow; shelf tapes
 * stand on it (150x110 faces: paper label with stripe and band, a small reel
 * window, mono meta); the selected tape is lifted 10px over a gold glow; a
 * pulled-out tape is tilted 8 degrees, raised 30px, with a tape-brown loop
 * spilling below it"). s07's Read Room is its first consumer (T20a).
 *
 * Shelf (`[data-sk="shelf"]`) is the scroller and the ledge: a horizontal row
 * that scrolls inside itself when the tapes overflow (never the page), named
 * by `label` and reachable with Tab. Whatever it holds stands on one ledge.
 *
 * ShelfTape is one face, a real <button> the consumer gives its semantics
 * (the Read Room makes shelf tapes radios and the blank tape a plain button):
 *   - `variant="tape"` (`[data-sk="shelf-tape"]`): the shell, the paper label
 *     (tape-red stripe, label-yellow band with two ink holes, ruled field with
 *     a 32px picture inset, Fraunces 800 title clipped at two lines, mono meta),
 *     the dark reel window with two kit Reels at rest, two screws.
 *       `selected`  lifted 10px over a gold glow (300ms --ss-ease; still
 *                   under reduced motion)
 *       `pulling`   tilts 8deg and rises 30px over 420ms, the kit TapeRibbon
 *                   loop spilling below, an empty dashed slot left behind
 *       `leaving`   fades off the shelf (the consumer removes it after)
 *       `stamp`     a slot at the face's top-right for a stamp
 *       `newStamp`  T20b's tape-red "NEW" in that slot (`data-stamp="new"`):
 *                   2px tape-red border and ink on paper, mono 600, −6°
 *       `ledgeLabel` a mono label under the ledge, below this tape (T20b's
 *                   "SENT TO YOU"); `ledgeLabelId` lets the face be
 *                   described by it
 *   - `variant="blank"`: "Make your own" — paper, a 2px dashed ink border,
 *     lucide Plus on a label-yellow disc, mono "BLANK TAPE · YOUR VOICE · YOUR
 *     PICTURES". Never selected.
 *
 * The title is clipped on the face; pass the full title as the accessible name
 * (`aria-label`) and point `aria-describedby` at `metaId` for the meta.
 * Colours are the T05a tokens; motion lives in shelf.css with its
 * reduced-motion state.
 */

import * as React from "react";
import { Plus } from "lucide-react";
import { Reel } from "./kit";
import { TapeRibbon } from "./TapeRibbon";
import "./shelf.css";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ Shelf */

export interface ShelfProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** The scroller's accessible name, e.g. "Your tapes shelf". */
  label: string;
  children?: React.ReactNode;
}

export function Shelf({ label, children, className, ...rest }: ShelfProps) {
  return (
    <div
      {...rest}
      data-sk="shelf"
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cx("sk-shelf sk-focus", className)}
    >
      <div className="sk-shelf-track">
        {children}
        <span className="sk-shelf-ledge" aria-hidden="true" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- ShelfTape */

/**
 * The loop of tape that spills from a pulled-out face, in the face's slot
 * (150 wide; the SVG starts 70px down the slot, behind the tilted face's
 * foot). It leaves the window, hangs past the ledge, curls once to the left
 * and climbs back in; its lowest point is 24px under the ledge.
 */
const LOOP_VIEWBOX = "0 0 150 116";
const LOOP_PATH =
  "M60 2 C58 24 58 44 52 56 C46 68 30 72 24 62 C18 52 28 42 40 48 C52 54 62 66 74 62 C86 58 84 30 82 2";

export interface ShelfTapeProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  /** "tape": a face on the shelf. "blank": the "Make your own" tape. */
  variant?: "tape" | "blank";
  /** The tape's title (clipped at two lines on the face). */
  title?: string;
  /** The mono meta, upper case by CSS. */
  meta?: React.ReactNode;
  /** Id for the meta element, so the button can be described by it. */
  metaId?: string;
  /** The first pictured page, drawn as the 32px inset. Absent: no inset. */
  inset?: string;
  /** Lifted 10px over a gold glow. */
  selected?: boolean;
  /** Tilting up out of its slot, the ribbon spilling. */
  pulling?: boolean;
  /** Fading off the shelf at the end of a pull-out. */
  leaving?: boolean;
  /** Drawn at the face's top-right (a stamp). */
  stamp?: React.ReactNode;
  /** The tape-red "NEW" stamp in the stamp slot (wins over `stamp`). */
  newStamp?: boolean;
  /** A mono label under the ledge, below this tape (upper case by CSS). */
  ledgeLabel?: React.ReactNode;
  /** Id for the ledge label, so the face can be described by it. */
  ledgeLabelId?: string;
  /** `data-tape-id` on the face. */
  tapeId?: string;
}

export const ShelfTape = React.forwardRef<HTMLButtonElement, ShelfTapeProps>(function ShelfTape(
  {
    variant = "tape",
    title,
    meta,
    metaId,
    inset,
    selected = false,
    pulling = false,
    leaving = false,
    stamp,
    newStamp = false,
    ledgeLabel,
    ledgeLabelId,
    tapeId,
    className,
    type = "button",
    children,
    ...rest
  },
  ref,
) {
  if (variant === "blank") {
    return (
      <div className="sk-shelf-slot sk-shelf-slot--blank">
        <button
          ref={ref}
          {...rest}
          type={type}
          data-sk="shelf-blank"
          className={cx("sk-shelf-face sk-shelf-face--blank sk-focus", className)}
        >
          <span className="sk-shelf-plus" aria-hidden="true">
            <Plus strokeWidth={2.6} />
          </span>
          <span className="sk-shelf-blank-title">{title ?? "Make your own"}</span>
          <span className="sk-shelf-blank-meta">
            <span>BLANK TAPE ·</span> <span>YOUR VOICE ·</span> <span>YOUR PICTURES</span>
          </span>
          {children}
        </button>
      </div>
    );
  }

  return (
    <div
      className="sk-shelf-slot"
      data-selected={selected ? "true" : "false"}
      data-pulling={pulling ? "true" : "false"}
      data-leaving={leaving ? "true" : "false"}
    >
      <span className="sk-shelf-glow" aria-hidden="true" />
      {pulling ? <span className="sk-shelf-hole" aria-hidden="true" /> : null}
      {pulling ? (
        <TapeRibbon variant="loop" d={LOOP_PATH} viewBox={LOOP_VIEWBOX} className="sk-shelf-loop" />
      ) : null}
      <button
        ref={ref}
        {...rest}
        type={type}
        data-sk="shelf-tape"
        data-tape-id={tapeId}
        className={cx("sk-shelf-face sk-focus", className)}
      >
        <span className="sk-shelf-label">
          <span className="sk-shelf-stripe" aria-hidden="true" />
          <span className="sk-shelf-band" aria-hidden="true">
            <span className="sk-shelf-hole-ink" />
            <span className="sk-shelf-hole-ink" />
          </span>
          <span className="sk-shelf-field">
            <span className="sk-shelf-row">
              {inset ? (
                // eslint-disable-next-line @next/next/no-img-element -- a 32px data: URL from the tape itself; next/image is not used for story art (CLAUDE.md §3)
                <img className="sk-shelf-inset" src={inset} alt="" width={32} height={32} decoding="async" />
              ) : null}
              <span className="sk-shelf-title">{title}</span>
            </span>
            {meta ? (
              <span className="sk-shelf-meta" id={metaId}>
                {meta}
              </span>
            ) : null}
          </span>
        </span>
        <span className="sk-shelf-window" aria-hidden="true">
          <Reel size={9} />
          <Reel size={9} />
        </span>
        <span className="sk-shelf-screw sk-shelf-screw--l" aria-hidden="true" />
        <span className="sk-shelf-screw sk-shelf-screw--r" aria-hidden="true" />
        {newStamp ? (
          <span className="sk-shelf-stamp">
            <span className="sk-shelf-new" data-stamp="new">
              NEW
            </span>
          </span>
        ) : stamp ? (
          <span className="sk-shelf-stamp">{stamp}</span>
        ) : null}
        {children}
      </button>
      {ledgeLabel ? (
        <span className="sk-shelf-ledge-label" data-sk="shelf-ledge-label" id={ledgeLabelId}>
          {ledgeLabel}
        </span>
      ) : null}
    </div>
  );
});

export default Shelf;
