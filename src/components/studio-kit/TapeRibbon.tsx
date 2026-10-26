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
 * The curved variant (an SVG path for the pulled-out loop) is added by its
 * first consumer, per the kit convention in kit.tsx.
 *
 * Nothing moves: the ribbon is static under every motion preference.
 */

import * as React from "react";
import "./tape-ribbon.css";

export interface TapeRibbonProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** "band": a straight run of tape. */
  variant?: "band";
  /** Thickness in px (brief: 12-14; the s03 filmstrip spine is 10). Default 12. */
  thickness?: number;
}

export function TapeRibbon({ variant = "band", thickness, className, style, ...rest }: TapeRibbonProps) {
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
