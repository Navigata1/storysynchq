/**
 * LayerChips — the seven layers a printed tape carries, as a row of small
 * printed chips (s05 layout_spec "Layer chips": seven chips in the packet
 * fills, a 1.5px ink border at radius 6, mono names; the Signature chip
 * label-yellow with a tape-red stroke; then a mono gold note).
 *
 * Markup: a wrapper (`[data-sk="layer-chips"]`) holding
 *   - `ul[aria-label="Layers in this tape"]` with exactly seven `li`, in packet
 *     order, each with `data-layer` and `data-present` ("true" | "false");
 *     a lit chip wears its layer's fill, a hollow one a dashed white rule and
 *     no fill, and says "not in this tape" to a screen reader;
 *   - when `consentWritten`, the note `[data-sk="layer-chips-note"]`:
 *     lucide `ArrowLeft` + "consent written".
 *
 * Print, not chrome: nothing here takes focus, and nothing moves.
 * Tailwind utilities on the SSYNC tokens only; no custom CSS.
 */

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import type { PacketLayer } from "./PacketBands";

/** The seven layers, in packet order (docs/format-spec.md §7). */
export const LAYER_ORDER: readonly PacketLayer[] = [
  "Metadata",
  "Visual",
  "Text",
  "Voice",
  "Sound",
  "Behavior",
  "Signature",
];

/** Lit fills, one Tailwind utility per layer (`--ss-layer-*`). */
const FILL: Record<PacketLayer, string> = {
  Metadata: "bg-ss-layer-metadata",
  Visual: "bg-ss-layer-visual",
  Text: "bg-ss-layer-text",
  Voice: "bg-ss-layer-voice",
  Sound: "bg-ss-layer-sound",
  Behavior: "bg-ss-layer-behavior",
  Signature: "bg-ss-label",
};

export interface LayerChipsProps {
  /** Which layers the tape carries (tape-sheet's `layerPresence`). */
  presence: Readonly<Record<PacketLayer, boolean>>;
  /** The tape carries a voice-consent record: show "← consent written". */
  consentWritten?: boolean;
  className?: string;
}

const CHIP =
  "grid h-[26px] w-20 place-items-center rounded-[6px] font-ss-mono text-[12px]/none tracking-[0.01em]";

export function LayerChips({ presence, consentWritten = false, className }: LayerChipsProps) {
  return (
    <div
      data-sk="layer-chips"
      className={[
        "flex flex-wrap items-center justify-center gap-x-2 gap-y-2",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      {/* role="list": Safari drops list semantics from an unstyled list */}
      <ul role="list" aria-label="Layers in this tape" className="flex flex-wrap justify-center gap-1.5">
        {LAYER_ORDER.map((layer) => {
          const present = Boolean(presence[layer]);
          const signature = layer === "Signature";
          const look = present
            ? signature
              ? `${FILL[layer]} border-2 border-ss-red font-semibold text-ss-ink shadow-[0_6px_14px_-8px_rgba(0,0,0,0.8)]`
              : `${FILL[layer]} border-[1.5px] border-ss-ink font-medium text-ss-ink shadow-[0_6px_14px_-8px_rgba(0,0,0,0.8)]`
            : "border-[1.5px] border-dashed border-white/30 bg-transparent font-medium text-ss-fg-3";
          return (
            <li
              key={layer}
              data-layer={layer}
              data-present={present ? "true" : "false"}
              className={`${CHIP} ${look}`}
            >
              <span>
                {layer}
                {present ? null : <span className="sr-only"> — not in this tape</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {consentWritten ? (
        <p
          data-sk="layer-chips-note"
          className="inline-flex items-center gap-1.5 font-ss-mono text-[13px]/none font-medium tracking-[0.1em] text-ss-gold-2"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5 flex-none" strokeWidth={2} />
          consent written
        </p>
      ) : null}
    </div>
  );
}

export default LayerChips;
