"use client";

/**
 * The seven-layer SSYNC packet, drawn as inline SVG (no image request, no
 * canvas, scales to any viewport, and every label is real selectable text).
 *
 * Register B: it is printed on tape paper with ink rules — a spec sheet pinned
 * up in the studio, not another glass panel.
 */

import * as React from "react";
import { PACKET_LAYERS } from "./layers";

/* Geometry — one band per layer, a numbered spine down the left. */
const VIEW_W = 760;
const BAND_X = 64;
const BAND_W = VIEW_W - BAND_X - 8;
const BAND_H = 64;
const BAND_GAP = 8;
const FIRST_Y = 76;
const STEP = BAND_H + BAND_GAP;
const VIEW_H = FIRST_Y + PACKET_LAYERS.length * STEP + 28;

const INK = "#1E1A16";
const PAPER = "#FFFDF6";

export function PacketDiagram() {
  const lastBandBottom = FIRST_Y + PACKET_LAYERS.length * STEP - BAND_GAP;

  return (
    <figure className="pr-packet">
      {/* focusable: a horizontally scrollable region must be keyboard-reachable */}
      <div
        className="pr-packet-scroll sk-focus"
        role="group"
        tabIndex={0}
        aria-label="The SSYNC seven-layer packet diagram (scrolls sideways on narrow screens)"
      >
        <svg
          className="pr-packet-svg"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-labelledby="pr-packet-title pr-packet-desc"
          focusable="false"
        >
          <title id="pr-packet-title">The SSYNC seven-layer packet</title>
          <desc id="pr-packet-desc">
            A stack of seven labelled bands, numbered one to seven: Metadata, Visual, Text,
            Voice, Sound, Behavior and Signature. Each band names the manifest block that
            carries that layer. The list below the diagram describes every layer in full.
          </desc>

          {/* the spine the layers are threaded onto */}
          <line
            x1="30"
            y1="58"
            x2="30"
            y2={lastBandBottom - 8}
            stroke={INK}
            strokeWidth="2"
            strokeDasharray="4 6"
            opacity="0.45"
          />

          {/* header bar */}
          <rect x={BAND_X} y="8" width={BAND_W} height="44" rx="8" fill={INK} />
          <text
            className="sk-font-meta"
            x={BAND_X + 20}
            y="36"
            fill={PAPER}
            fontSize="12"
            letterSpacing="3.2"
          >
            ONE FILE · SEVEN LAYERS
          </text>
          <text
            className="sk-font-tape"
            x={BAND_X + BAND_W - 20}
            y="37"
            fill="#FFC93C"
            fontSize="19"
            fontWeight="700"
            textAnchor="end"
          >
            .storysync
          </text>

          {PACKET_LAYERS.map((layer, i) => {
            const y = FIRST_Y + i * STEP;
            const n = String(i + 1).padStart(2, "0");
            return (
              <g key={layer.name}>
                {/* numbered chip on the spine */}
                <rect
                  x="8"
                  y={y + 16}
                  width="44"
                  height="32"
                  rx="7"
                  fill={PAPER}
                  stroke={INK}
                  strokeWidth="2.5"
                />
                <text
                  className="sk-font-meta"
                  x="30"
                  y={y + 37}
                  fill={INK}
                  fontSize="13"
                  textAnchor="middle"
                >
                  {n}
                </text>

                {/* the layer band */}
                <rect
                  x={BAND_X}
                  y={y}
                  width={BAND_W}
                  height={BAND_H}
                  rx="8"
                  fill={layer.fill}
                  stroke={layer.stroke}
                  strokeWidth={layer.draft ? "3.5" : "2.5"}
                />
                <text
                  className="sk-font-tape"
                  data-protocol-layer={layer.name}
                  x={BAND_X + 20}
                  y={y + 29}
                  fill={INK}
                  fontSize="21"
                  fontWeight="700"
                >
                  {layer.name}
                </text>
                <text
                  className="sk-font-meta"
                  x={BAND_X + 20}
                  y={y + 50}
                  fill={INK}
                  fillOpacity="0.7"
                  fontSize="11.5"
                >
                  {layer.gist}
                </text>
                <text
                  className="sk-font-meta"
                  x={BAND_X + BAND_W - 20}
                  y={y + 29}
                  fill={INK}
                  fillOpacity="0.82"
                  fontSize="12.5"
                  textAnchor="end"
                >
                  {layer.key}
                </text>
                {layer.draft ? (
                  <text
                    className="sk-font-meta"
                    x={BAND_X + BAND_W - 20}
                    y={y + 50}
                    fill="#B4301F"
                    fontSize="10.5"
                    letterSpacing="1.6"
                    textAnchor="end"
                  >
                    V2.1 · DRAFT
                  </text>
                ) : null}
              </g>
            );
          })}

          <text
            className="sk-font-meta"
            x={BAND_X}
            y={VIEW_H - 8}
            fill={INK}
            fillOpacity="0.55"
            fontSize="10.5"
          >
            Every layer is one JSON block in manifest.json. Unknown fields are ignored, never
            fatal.
          </text>
        </svg>
      </div>
      <figcaption className="pr-packet-cap sk-font-meta">
        Fig. 1 — the SSYNC packet. A reader that understands only layers 1–3 still shows the
        story; each layer above adds a sense.
      </figcaption>
    </figure>
  );
}
