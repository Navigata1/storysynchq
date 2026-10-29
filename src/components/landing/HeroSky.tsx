/**
 * HeroSky — the landing's one light (reference s01, "One light").
 *
 * The house tape's page-1 illustration hangs faintly behind the hero, masked
 * down to its swirl, with a brighter copy masked to its single star, and one
 * gold glow on the same point. That point is the deck's play key: "the brand's
 * gold and the story's light are the same point."
 *
 * Positioning is pure CSS (hero-sky.css). The layer is a 0×0 anchor placed on
 * the play key's centre from the custom properties the tape stage shares with
 * the key (`--ls-key-size`, `--ls-key-lift`); the picture is then offset so
 * its star — at `--ls-star-x` × `--ls-star-y` of the image box — lands on the
 * anchor. No measuring, no layout script, nothing that can drift on resize.
 *
 * Decorative and inert: `aria-hidden`, `pointer-events: none`, no motion of
 * its own. The picture is the demo's own page 1 (same origin, from the demo
 * manifest the landing already imports), never a new asset.
 */

import * as React from "react";
import "./hero-sky.css";

export interface HeroSkyProps {
  /** The house tape's page-1 illustration URL, read from its manifest. */
  src: string;
}

export function HeroSky({ src }: HeroSkyProps) {
  const art: React.CSSProperties = { backgroundImage: `url("${src}")` };
  return (
    <div className="ls-sky" data-ls="sky" aria-hidden="true">
      <span className="ls-sky-art" data-ls="sky-art" style={art} />
      <span className="ls-sky-core" data-ls="sky-core" style={art} />
      <span className="ls-sky-glow" data-ls="key-glow" />
    </div>
  );
}
