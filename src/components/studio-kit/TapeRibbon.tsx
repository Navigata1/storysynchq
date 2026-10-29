"use client";

/**
 * TapeRibbon — a length of tape-brown cassette tape (brief design_system,
 * LOCAL (3): "a 12-14px tape-brown band with a 1px rgba(255,255,255,.12) top
 * highlight; curves are SVG paths (stroke 12, round caps)").
 *
 * variant="band" is the straight run: the filmstrip spine the frames ride on
 * (s03 draws it 10px thick), and later the size meters. It is decorative
 * (aria-hidden) and paints wherever its consumer places it; the consumer sets
 * its position and, if it differs from 12px, its `thickness`.
 *
 * variant="loop" is the curve (added by its first consumer, the shelf's
 * pull-out, T20a): an SVG path `d` in the consumer's `viewBox`, stroked in the
 * tape-brown gradient at `thickness` (default 12) with round caps, plus the
 * 1px highlight. Both paths carry `pathLength="1"`, so a consumer can draw the
 * tape out with `stroke-dasharray: 1; stroke-dashoffset: 1 → 0`.
 *
 * Nothing moves here: the ribbon is static under every motion preference; any
 * motion is the consumer's, with its own reduced-motion state.
 */

import * as React from "react";
import "./tape-ribbon.css";

interface BandProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** "band": a straight run of tape. */
  variant?: "band";
  /** Thickness in px (brief: 12-14; the s03 filmstrip spine is 10). Default 12. */
  thickness?: number;
}

interface LoopProps extends Omit<React.SVGAttributes<SVGSVGElement>, "children" | "d"> {
  /** "loop": a curve of tape drawn as an SVG path. */
  variant: "loop";
  /** The path, in `viewBox` user units. */
  d: string;
  /** The SVG viewBox the path is drawn in. */
  viewBox: string;
  /** Stroke width in user units (brief: stroke 12). Default 12. */
  thickness?: number;
}

export type TapeRibbonProps = BandProps | LoopProps;

function LoopRibbon({ variant, d, viewBox, thickness = 12, className, ...rest }: LoopProps) {
  const gradient = `sk-ribbon-${React.useId().replace(/:/g, "")}`;
  return (
    <svg
      {...rest}
      data-sk="tape-ribbon"
      data-variant={variant}
      aria-hidden="true"
      focusable="false"
      viewBox={viewBox}
      className={className ? `sk-tape-ribbon sk-tape-ribbon--loop ${className}` : "sk-tape-ribbon sk-tape-ribbon--loop"}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--ss-tape-brown-1)" }} />
          <stop offset="1" style={{ stopColor: "var(--ss-tape-brown-2)" }} />
        </linearGradient>
      </defs>
      <path
        d={d}
        pathLength={1}
        fill="none"
        stroke={`url(#${gradient})`}
        strokeWidth={thickness}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={d}
        pathLength={1}
        fill="none"
        stroke="rgba(255, 255, 255, 0.12)"
        strokeWidth={1}
        strokeLinecap="round"
        transform={`translate(0 ${-(thickness / 2 - 1)})`}
      />
    </svg>
  );
}

export function TapeRibbon(props: TapeRibbonProps) {
  if (props.variant === "loop") return <LoopRibbon {...props} />;
  const { variant = "band", thickness, className, style, ...rest } = props;
  return (
    <span
      {...rest}
      data-sk="tape-ribbon"
      data-variant={variant}
      aria-hidden="true"
      className={className ? `sk-tape-ribbon sk-tape-ribbon--${variant} ${className}` : `sk-tape-ribbon sk-tape-ribbon--${variant}`}
      style={
        thickness === undefined
          ? style
          : ({ ...style, "--sk-ribbon-h": `${thickness}px` } as React.CSSProperties)
      }
    />
  );
}

export default TapeRibbon;
