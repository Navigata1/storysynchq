/**
 * PrintSlot and PullTapeIcon — the printer a finished tape comes out of, and
 * the cassette whose tape is being pulled out (brief design_system LOCAL (12):
 * "a 14px dark slot (#05070d, inset shadow) with the TapeLabel's top edge
 * tucked under it; the delete is a ghost button with a tape-red outline whose
 * icon is a small cassette with a tape-brown loop spilling out").
 *
 * PrintSlot is the slot alone (`[data-sk="print-slot"]`): 14px tall, radius 7,
 * up to 640px wide, drawn over whatever follows it (z-index 2). The consumer
 * tucks its label's top edge under it — a negative top margin of half the slot
 * — and runs its own print-in. Decorative: aria-hidden, never focusable.
 *
 * PullTapeIcon (`[data-sk="pull-tape-icon"]`) is s05's 30×26 glyph: a cassette
 * outline in `currentColor` with its window and reels, and a loop of tape in
 * tape-brown spilling from its foot. Decorative: pair it with a labelled
 * control. Nothing here moves under any motion preference.
 *
 * Tailwind utilities on the SSYNC tokens only; no custom CSS.
 */

import * as React from "react";

export interface PrintSlotProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  className?: string;
}

export function PrintSlot({ className, ...rest }: PrintSlotProps) {
  return (
    <div
      {...rest}
      data-sk="print-slot"
      aria-hidden="true"
      className={[
        "relative z-[2] h-[14px] w-full max-w-[640px] flex-none rounded-[7px] bg-ss-slot",
        "shadow-[inset_0_4px_6px_rgba(0,0,0,0.95),inset_0_-1px_0_rgba(255,255,255,0.07),0_1px_0_rgba(255,255,255,0.1),0_0_0_1px_rgba(0,0,0,0.5)]",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    />
  );
}

export interface PullTapeIconProps {
  className?: string;
}

/** s05's delete glyph: a cassette with a tape-brown loop spilling out. */
export function PullTapeIcon({ className }: PullTapeIconProps) {
  return (
    <svg
      data-sk="pull-tape-icon"
      viewBox="0 0 30 26"
      width="30"
      height="26"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect x="2" y="1.5" width="26" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="8" y="5.5" width="14" height="6" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="11" cy="8.5" r="1.6" fill="currentColor" />
      <circle cx="19" cy="8.5" r="1.6" fill="currentColor" />
      <path
        d="M9 17.5 L10.5 14.5 H19.5 L21 17.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* the loop: tape-brown, out of the cassette's foot */}
      <path
        d="M13.5 15.5 C13 21 7 24.5 6.5 21.2 C6 18 12.5 19 15.5 21.5 C18 23.6 21.5 24.8 24 22"
        fill="none"
        stroke="#a8703f"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default PrintSlot;
