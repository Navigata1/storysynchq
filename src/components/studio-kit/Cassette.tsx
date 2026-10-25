/**
 * Cassette — a whole tape: shell, label, reel window and foot (Register B).
 *
 * The reference `.ss-cassette` (docs/vision/reference/foundation.css; s01's
 * hero tape): a 165° shell gradient `--ss-shell-hi → --ss-shell →
 * --ss-shell-2`, radius 20, aspect 1.6, four screws; a TapeLabel filling 74%
 * of the shell (stripe, band with holes and "STORYSYNC", title, meta); a dark
 * window ringed in ink with the tape-brown ribbon and two kit Reels; a foot.
 *
 * Decorative: the root is `aria-hidden`, so whatever the cassette stands for
 * must be named by the control it sits in (the landing hero names it on its
 * "Press play" button). The reels turn only while `spinning` and rest on the
 * reference's 18° frame otherwise; reduced motion stops them (kit.css).
 *
 * Sizing: the shell is 380px wide (the reference `--cw`) unless `width` or a
 * consumer class says otherwise, never wider than its container; everything
 * inside scales with that width (cassette.css uses container units).
 */

import * as React from "react";
import { Reel, TapeLabel } from "./kit";
import "./cassette.css";

export interface CassetteProps {
  /** The label title — the story's name. */
  title: string;
  /** The mono label line, e.g. "SIDE A · PRESS PLAY". */
  meta: React.ReactNode;
  /** Printed under the title, prefixed "by ". */
  author?: string;
  /** Turn the reels (audio is moving). Default false: they rest at 18°. */
  spinning?: boolean;
  /** Shell width: px as a number, or any CSS length. Default 380px. */
  width?: number | string;
  /** Passed through to the root, e.g. a page's positioning class. */
  className?: string;
  /** Extra decoration drawn inside the shell, over the label (e.g. a sticker). */
  children?: React.ReactNode;
}

const SCREWS = ["tl", "tr", "bl", "br"] as const;

/** Reels are 22% of the window, which is 58% of the shell: in container units of the content box. */
const REEL_SIZE = "var(--sk-cassette-reel)";

export function Cassette({
  title,
  meta,
  author,
  spinning = false,
  width,
  className,
  children,
}: CassetteProps) {
  return (
    <div
      data-sk="cassette"
      aria-hidden="true"
      className={["sk-cassette", className].filter(Boolean).join(" ")}
      style={width === undefined ? undefined : { width }}
    >
      {SCREWS.map((corner) => (
        <span key={corner} className={`sk-cassette-screw sk-cassette-screw--${corner}`} />
      ))}

      <TapeLabel className="sk-cassette-label" title={title} author={author} meta={meta} />

      <div className="sk-cassette-window">
        <span className="sk-cassette-ribbon" />
        <Reel spinning={spinning} size={REEL_SIZE} />
        <Reel spinning={spinning} size={REEL_SIZE} />
      </div>

      <span className="sk-cassette-foot" />
      {children}
    </div>
  );
}
