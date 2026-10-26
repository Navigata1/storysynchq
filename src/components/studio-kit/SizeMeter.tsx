/**
 * SizeMeter — how much of the format's size budget a tape takes (s05 layout_spec
 * "the size meter (mono label over a 480x12 tape-brown ribbon filled 13% in five
 * segments, ink for pictures and amber for voices)" + LOCAL (3): size meters are
 * a length of tape-brown ribbon).
 *
 * Markup: the root (`[data-sk="size-meter"]`) is the `role="meter"`, named
 * "Tape size", with `aria-valuemin` 0, `aria-valuemax` the budget,
 * `aria-valuenow` the tape's bytes and `aria-valuetext` "<x.y> MB OF 15 MB"
 * (+ " · over the 15 MB budget"). Inside:
 *   - a mono row: the label (`[data-sk="size-meter-label"]`, the same words,
 *     tape-red over budget) and the legend (`[data-sk="size-meter-legend"]`,
 *     "PICTURES" ink swatch, "VOICES" amber swatch);
 *   - the track (`[data-sk="size-meter-track"]`), a kit TapeRibbon band up to
 *     480px wide, and on it the fill (`[data-sk="size-meter-fill"]`): the tape's
 *     share of the budget, in `segments` equal parts (one per page), each split
 *     ink | amber in the tape's own picture | voice proportion.
 *
 * Over budget is shown, never blocked: the fill stops at the end of the track
 * and the label turns tape-red. `aria-valuenow` is clamped to the budget there
 * (a meter's value may not pass its maximum); the value text keeps the truth.
 *
 * Static under every motion preference. Tailwind utilities on the SSYNC tokens.
 */

import * as React from "react";
import { TapeRibbon } from "./TapeRibbon";
import {
  TAPE_BUDGET_BYTES,
  formatTapeSize,
  isOverBudget,
  tapeSizeValueText,
} from "@/lib/storysync/tape-size";

export interface SizeMeterProps {
  /** Decoded bytes of every picture (tape-size's `tapeBytes`). */
  pictureBytes: number;
  /** Decoded bytes of every recording. */
  voiceBytes: number;
  /** The budget. Default `TAPE_BUDGET_BYTES` (15 MB). */
  budgetBytes?: number;
  /** Equal parts the fill is drawn in, e.g. one per page. Default 1. */
  segments?: number;
  /** Accessible name. Default "Tape size". */
  label?: string;
  className?: string;
}

function bytes(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export function SizeMeter({
  pictureBytes,
  voiceBytes,
  budgetBytes = TAPE_BUDGET_BYTES,
  segments = 1,
  label = "Tape size",
  className,
}: SizeMeterProps) {
  const pictures = bytes(pictureBytes);
  const voices = bytes(voiceBytes);
  const total = pictures + voices;
  const budget = Math.max(1, bytes(budgetBytes));
  const over = isOverBudget(total, budget);
  const share = Math.min(1, total / budget);
  const pictureShare = total > 0 ? pictures / total : 1;
  const parts = Math.max(1, Math.min(48, Math.floor(segments) || 1));
  const text = formatTapeSize(total, budget);

  return (
    <div
      data-sk="size-meter"
      data-over={over ? "true" : "false"}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={budget}
      aria-valuenow={Math.min(total, budget)}
      aria-valuetext={tapeSizeValueText(total, budget)}
      className={className}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 font-ss-mono text-[12px]/none font-medium tracking-[0.14em] text-ss-fg-3">
        <span data-sk="size-meter-label" className={over ? "text-ss-red" : undefined}>
          {text}
        </span>
        <span
          data-sk="size-meter-legend"
          aria-hidden="true"
          className="inline-flex items-center gap-2 tracking-[0.12em] uppercase"
        >
          <i className="size-3 flex-none rounded-[3px] border-2 border-ss-paper bg-ss-ink" />
          Pictures
          <i className="ml-3 size-3 flex-none rounded-[3px] bg-ss-gold" />
          Voices
        </span>
      </div>
      <div data-sk="size-meter-track" className="relative mt-[9px] h-[14px] w-full max-w-[480px]">
        <TapeRibbon thickness={14} className="absolute inset-0" />
        {total > 0 ? (
          <span
            data-sk="size-meter-fill"
            className="absolute top-[2px] bottom-[2px] left-[2px] flex overflow-hidden rounded-[1px] shadow-[0_0_0_1px_rgba(255,253,246,0.55)]"
            style={{ width: `max(3px, calc((100% - 4px) * ${share.toFixed(4)}))` }}
          >
            {Array.from({ length: parts }, (_, i) => (
              <span key={i} className="flex flex-1 border-l border-ss-paper/45 first:border-l-0">
                <i className="bg-ss-ink" style={{ flex: `0 0 ${(pictureShare * 100).toFixed(2)}%` }} />
                <b className="flex-1 bg-ss-gold-2" />
              </span>
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default SizeMeter;
