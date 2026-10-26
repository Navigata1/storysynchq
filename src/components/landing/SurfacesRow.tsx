/**
 * SurfacesRow — "THREE SURFACES · ONE FILE" (reference s01, the phone column):
 * the whole system named in one block, right after the magic band.
 *
 * Three rows, each a 28 px glass circle holding a decorative lucide icon and one
 * line with the surface's name in weight 600 (docs/design-direction.md §9.3
 * naming). The rows are text, not links — the top nav carries the links.
 * Static: nothing here moves. Styles live in landing-bands.css.
 */

import { Headphones, Mic, Package, type LucideIcon } from "lucide-react";

interface Surface {
  Icon: LucideIcon;
  name: string;
  line: string;
}

const SURFACES: readonly Surface[] = [
  {
    Icon: Headphones,
    name: "StorySync Reader",
    line: "plays any tape in any browser. No app, no account.",
  },
  {
    Icon: Mic,
    name: "StorySync Creator",
    line: "pictures, voices, a little music and timing, made together.",
  },
  {
    Icon: Package,
    name: "SSYNC Protocol",
    line: "the open file between them. Like PDF, for storybooks.",
  },
];

const LABEL_ID = "ls-surfaces-label";

export function SurfacesRow() {
  return (
    <div className="ls-surfaces" data-ls="surfaces">
      <p id={LABEL_ID} className="ls-surfaces-label sk-font-meta" data-ls="surfaces-label">
        THREE SURFACES · ONE FILE
      </p>
      <ul className="ls-surfaces-list" aria-labelledby={LABEL_ID}>
        {SURFACES.map(({ Icon, name, line }) => (
          <li key={name} className="ls-surface" data-ls="surface">
            <span className="ls-surface-dot" aria-hidden="true">
              <Icon className="ls-surface-icon" aria-hidden="true" />
            </span>
            <p className="ls-surface-line">
              <strong className="ls-surface-name">{name}</strong> — {line}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SurfacesRow;
