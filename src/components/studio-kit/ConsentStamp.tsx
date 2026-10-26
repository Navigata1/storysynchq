/**
 * ConsentStamp — voice consent, inked (brief design_system: "consent stamps"
 * are Register B; s04's stamp on the Signature band).
 *
 * A tape-red rubber stamp: a 3.5px outer frame and a 1.5px inner rule, two
 * lines of Plex Mono ("VOICE CONSENT · GRANTED" / "PARENT/GUARDIAN · OCT 19
 * 2026"), tilted −4°, with a speckled ink mask so it reads as pressed, not
 * printed. Lay it over the band it certifies.
 *
 * `inked` is the whole state (`[data-sk="consent-stamp"]`, `data-inked`):
 *   - false → nothing shows; the face is hidden from sight and from the
 *     accessibility tree alike;
 *   - true  → the stamp presses once (420 ms, ease-out, never loops), and its
 *     polite live region says so once. Un-inking clears it silently.
 *
 * Reduced motion: no press — the stamp is simply there.
 */

import * as React from "react";
import "./consent-stamp.css";

export interface ConsentStampProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** Every consent the stamp stands for has been given. */
  inked: boolean;
  /** The two inked lines, e.g. ["VOICE CONSENT · GRANTED", "PARENT/GUARDIAN · OCT 19 2026"]. */
  lines: readonly [string, string];
  /**
   * What the live region says once when the stamp inks — a sentence, not the
   * stamp's capitals. Default: the two lines.
   */
  announcement?: string;
}

export function ConsentStamp({ inked, lines, announcement, className, ...rest }: ConsentStampProps) {
  return (
    <div
      {...rest}
      data-sk="consent-stamp"
      data-inked={inked ? "true" : "false"}
      className={className ? `sk-consent-stamp ${className}` : "sk-consent-stamp"}
    >
      <span className="sk-consent-stamp-face" aria-hidden="true">
        <span className="sk-consent-stamp-in">
          <span data-line="1" className="sk-consent-stamp-a">
            {lines[0]}
          </span>
          <span data-line="2" className="sk-consent-stamp-b">
            {lines[1]}
          </span>
        </span>
      </span>
      {/* Always in the tree, so its one change is heard. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {inked ? (announcement ?? `${lines[0]}. ${lines[1]}.`) : ""}
      </span>
    </div>
  );
}

export default ConsentStamp;
