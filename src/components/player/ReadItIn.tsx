"use client";

/**
 * ReadItIn — the "Read it in…" panel of the Read Room (T22a, s07 right panel).
 *
 * The wedge, on the shelf: any tape, the house tape included, can be made to
 * read itself in your voices and the feeling you choose. The panel is about
 * one target (read-it-in.ts): the selected shelf tape, or the house tape when
 * the shelf is empty or the house row's "Read it in…" asked for it.
 *
 *   header   the target's resume page (T21) or else its first pictured page,
 *            372×110 (fluid width), radius 12, with a paper "PAGE N" tab;
 *            decorative, since the heading names the tape. No words over the
 *            art. A sent tape (no pictures on this device) has none.
 *   heading  "Read it in…", the mono "<TITLE> · <AUTHOR>", and who read it
 *            ("A computer read you this one. Now read it in yours.")
 *   feeling  "WHAT SHOULD IT FEEL LIKE?" over the eight kit MoodTapeChips, one
 *            radio group; the target's first-page mood preselected (Wonder
 *            when it has none). A new target starts from its own mood.
 *   door     "Make our own copy" (gold, lucide Mic) → T15's
 *            `/studio?open=<house | code | id>&mood=<Mood>`. Everything after
 *            that is T15's: its replace dialog, its re-voice rules, the mood.
 *
 * The panel fetches nothing: the house tape's facts are read at build time
 * from /public (a static JSON import, as the landing reads them) and a shelf
 * tape's from the shelf. Its one picture is lazy: beside the shelves (≥ 1024
 * px) it is in the first screen and loads at once; on a phone, where the panel
 * stands below the fold, it waits until the panel comes near. Choosing a
 * feeling is local state. Nothing animates here under reduced motion.
 *
 * T22b adds "WHOSE VOICE?" above the feeling.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mic } from "lucide-react";
import houseTape from "../../../public/demo/brave-little-star.ssync.json";
import type { MoodName } from "@/lib/audio/moods";
import type { SsyncManifest } from "@/lib/storysync/manifest";
import { normalizeTapeManifest } from "@/lib/storysync/tape-source";
import { BigButton } from "@/components/studio-kit/kit";
import { MoodTapeChipGroup } from "@/components/studio-kit/MoodTapeChip";
import {
  creatorUrl,
  defaultMood,
  headerPicture,
  houseTarget,
  readYouLine,
  targetKey,
  targetLine,
  type ReadItInTarget,
} from "./read-it-in";
import "./read-it-in.css";

/**
 * The house tape exactly as the Read Room's demo door opens it (the same
 * permissive reader, so its resume key is the same), resolved at build time:
 * no runtime request.
 */
export const HOUSE_TAPE: SsyncManifest = normalizeTapeManifest(houseTape) ?? (houseTape as unknown as SsyncManifest);

/** The panel's target when it is about the house tape. */
export const HOUSE_READ_IT_IN = houseTarget(HOUSE_TAPE);

export interface ReadItInProps {
  target: ReadItInTarget;
  /** The page this tape was left at (T21), for the header picture. */
  resumePage?: number | null;
  /** The panel (the Read Room scrolls it into view). */
  panelRef?: React.Ref<HTMLElement>;
  /** The heading (the Read Room moves focus here). */
  headingRef?: React.Ref<HTMLHeadingElement>;
}

export function ReadItIn({ target, resumePage, panelRef, headingRef }: ReadItInProps) {
  const router = useRouter();
  const id = React.useId();
  const headingId = `${id}-heading`;
  const targetId = `${id}-target`;
  const feelId = `${id}-feel`;

  const key = targetKey(target);
  /** The feeling chosen, for the target it was chosen for. */
  const [choice, setChoice] = React.useState<{ key: string; mood: MoodName } | null>(null);
  const mood = choice?.key === key ? choice.mood : defaultMood(target);
  const picture = headerPicture(target, resumePage);

  const choose = React.useCallback((next: MoodName) => setChoice({ key, mood: next }), [key]);
  const makeCopy = React.useCallback(() => router.push(creatorUrl(target, mood)), [router, target, mood]);

  return (
    <aside ref={panelRef} data-panel="read-it-in" aria-labelledby={headingId} className="rr-aside rin-panel">
      {picture ? (
        <div data-rin="art" className="rin-art" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- the tape's own picture (a data: URL or this app's /demo/ file); next/image is not used for story art (CLAUDE.md §3) */}
          <img
            key={picture.url}
            className="rin-art-img"
            src={picture.url}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
          />
          <span data-rin="tab" className="rin-art-tab">
            PAGE {picture.page}
          </span>
        </div>
      ) : null}

      <h2 id={headingId} ref={headingRef} tabIndex={-1} aria-describedby={targetId} className="rin-heading sk-focus">
        Read it in…
      </h2>
      <p id={targetId} data-rin="target" className="rin-target">
        {targetLine(target)}
      </p>
      <p data-rin="line" className="rin-line">
        {readYouLine(target)}
      </p>

      <p id={feelId} data-rin="feel-label" className="rin-label">
        What should it feel like?
      </p>
      <MoodTapeChipGroup value={mood} onChange={choose} labelledBy={feelId} className="rin-moods" />

      <BigButton
        variant="gold"
        icon={<Mic strokeWidth={2.2} />}
        label="Make our own copy"
        onClick={makeCopy}
        className="rin-make"
      />
    </aside>
  );
}

export default ReadItIn;
