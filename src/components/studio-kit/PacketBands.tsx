/**
 * PacketBands — the seven layers of a tape as printed bands (brief
 * design_system LOCAL (11) "Packet bands and plates"; s04's sheet).
 *
 * Register B: each band is filled with its layer's packet colour
 * (`--ss-layer-<name>`), drawn with a 2px ink border at radius 8, and
 * numbered by a 22px ink chip sitting on a dashed ink spine. Signature —
 * the v2.1 draft layer — wears a 3.5px tape-red stroke and the tag
 * "V2.1 · DRAFT" in red ink.
 *
 * Markup: an ordered list (`[data-sk="packet-bands"]`); per layer a row
 * holding the number chip (`[data-sk="packet-num"]`, aria-hidden — the list
 * already counts) and the band (`[data-sk="packet-band"]`, `data-layer`), with
 * the layer's name (`[data-band="name"]`), an optional `aside` at the right of
 * the name row, the plain-words value (`[data-band="value"]`) and an optional
 * `overlay` laid over the band (the Signature band's consent stamp).
 *
 * Print, not chrome: nothing here takes focus, and nothing moves.
 */

import * as React from "react";
import "./packet-bands.css";

/** The seven layers of a `.storysync` tape, in packet order (docs/format-spec.md §7). */
export type PacketLayer =
  | "Metadata"
  | "Visual"
  | "Text"
  | "Voice"
  | "Sound"
  | "Behavior"
  | "Signature";

export interface PacketBand {
  layer: PacketLayer;
  /** The plain-words line under the layer's name. */
  value: React.ReactNode;
  /** At the right of the name row: thumbnails, a glyph, a mood star. */
  aside?: React.ReactNode;
  /** Laid over the band itself, e.g. the Signature band's consent stamp. */
  overlay?: React.ReactNode;
}

export interface PacketBandsProps extends Omit<React.HTMLAttributes<HTMLOListElement>, "children"> {
  bands: readonly PacketBand[];
  /** The Signature band's tag. Default "V2.1 · DRAFT"; null prints none. */
  signatureTag?: string | null;
}

export function PacketBands({
  bands,
  signatureTag = "V2.1 · DRAFT",
  className,
  ...rest
}: PacketBandsProps) {
  return (
    <ol
      {...rest}
      data-sk="packet-bands"
      className={className ? `sk-packet ${className}` : "sk-packet"}
    >
      {bands.map((band, index) => {
        const signature = band.layer === "Signature";
        const fill = { "--sk-band-fill": `var(--ss-layer-${band.layer.toLowerCase()})` } as React.CSSProperties;
        return (
          <li
            key={band.layer}
            className={signature ? "sk-packet-row sk-packet-row--sig" : "sk-packet-row"}
          >
            <span data-sk="packet-num" className="sk-packet-num" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div
              data-sk="packet-band"
              data-layer={band.layer}
              className={[
                "sk-packet-band",
                signature ? "sk-packet-band--sig" : "",
                band.overlay ? "sk-packet-band--overlaid" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={fill}
            >
              <div className="sk-packet-head">
                <span data-band="name" className="sk-packet-name">
                  {band.layer}
                </span>
                <span className="sr-only">: </span>
                {signature && signatureTag ? (
                  <span data-sk="packet-tag" className="sk-packet-tag">
                    {signatureTag}
                  </span>
                ) : null}
                {band.aside ? <span className="sk-packet-aside">{band.aside}</span> : null}
              </div>
              <p data-band="value" className="sk-packet-value">
                {band.value}
              </p>
              {band.overlay ?? null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default PacketBands;
