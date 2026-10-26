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
 *   voice    (T22b) "WHOSE VOICE?" over a row of kit VoiceCassettes, one radio
 *            group named "Whose voice?": "Browser voice" (checked by default),
 *            up to four names this device knows (known-voices.ts: narrators
 *            on the shelf, consent voices of your own tapes, most recent
 *            first) and "Someone new", which reveals a field (also "Whose
 *            voice?", at most 40 characters) and takes focus there. The
 *            cassette of whoever reads the target today carries READING NOW:
 *            the browser voice for a tape nobody recorded, else its narrator.
 *   feeling  "WHAT SHOULD IT FEEL LIKE?" over the eight kit MoodTapeChips, one
 *            radio group; the target's first-page mood preselected (Wonder
 *            when it has none). A new target starts from its own mood.
 *   door     "Make our own copy" (gold, lucide Mic) → T15's
 *            `/studio?open=<house | code | id>&mood=<Mood>`, with the chosen
 *            name (not the browser voice) as `#voice=<name>`. Everything
 *            after that is T15's: its replace dialog, its re-voice rules, the
 *            mood; the Creator prefills its "read by" with the name.
 *
 * The panel fetches nothing: the house tape's facts are read at build time
 * from /public (a static JSON import, as the landing reads them) and a shelf
 * tape's from the shelf. Its one picture is lazy: beside the shelves (≥ 1024
 * px) it is in the first screen and loads at once; on a phone, where the panel
 * stands below the fold, it waits until the panel comes near. Choosing a
 * voice and a feeling is local state; the names come from the shelf the Read
 * Room already read, and the chosen one travels in the URL fragment, which no
 * request carries. Under reduced motion nothing animates here (the READING
 * NOW reels stand on their static frame).
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
import { VoiceCassette } from "@/components/studio-kit/VoiceCassette";
import {
  creatorUrl,
  defaultMood,
  headerPicture,
  houseTarget,
  readerOf,
  readYouLine,
  targetKey,
  targetLine,
  type ReadItInTarget,
} from "./read-it-in";
import {
  BROWSER_VOICE,
  knownVoices,
  sameVoice,
  SOMEONE_NEW,
  VOICE_NAME_MAX,
  voiceName,
  voiceRow,
  type VoiceSource,
} from "./known-voices";
import "./read-it-in.css";

/**
 * The house tape exactly as the Read Room's demo door opens it (the same
 * permissive reader, so its resume key is the same), resolved at build time:
 * no runtime request.
 */
export const HOUSE_TAPE: SsyncManifest = normalizeTapeManifest(houseTape) ?? (houseTape as unknown as SsyncManifest);

/** The panel's target when it is about the house tape. */
export const HOUSE_READ_IT_IN = houseTarget(HOUSE_TAPE);

/** The voice chosen: the browser voice, a known name ("name:<name>"), or one typed here. */
type VoiceChoice = "browser" | "new" | `name:${string}`;

const nameChoice = (name: string): VoiceChoice => `name:${name}`;

export interface ReadItInProps {
  target: ReadItInTarget;
  /**
   * The tapes on this device's shelf (own and sent), as the Read Room read
   * them: where the names on the voice row come from. Nothing is read here.
   */
  shelf?: readonly VoiceSource[];
  /** The page this tape was left at (T21), for the header picture. */
  resumePage?: number | null;
  /** The panel (the Read Room scrolls it into view). */
  panelRef?: React.Ref<HTMLElement>;
  /** The heading (the Read Room moves focus here). */
  headingRef?: React.Ref<HTMLHeadingElement>;
}

const NO_SHELF: readonly VoiceSource[] = [];

export function ReadItIn({ target, shelf = NO_SHELF, resumePage, panelRef, headingRef }: ReadItInProps) {
  const router = useRouter();
  const id = React.useId();
  const headingId = `${id}-heading`;
  const targetId = `${id}-target`;
  const voiceId = `${id}-voice`;
  const feelId = `${id}-feel`;

  const key = targetKey(target);
  /** The feeling chosen, for the target it was chosen for. */
  const [choice, setChoice] = React.useState<{ key: string; mood: MoodName } | null>(null);
  const mood = choice?.key === key ? choice.mood : defaultMood(target);
  const picture = headerPicture(target, resumePage);

  /* ── whose voice (T22b) ─────────────────────────────────────────────── */
  const reader = readerOf(target);
  const readerName = reader.kind === "voice" ? reader.name : null;
  const names = React.useMemo(() => voiceRow(knownVoices(shelf), readerName), [shelf, readerName]);
  const [voicePick, setVoicePick] = React.useState<VoiceChoice>("browser");
  /** "Someone new", as typed. */
  const [typed, setTyped] = React.useState("");
  /** A name that left the row (its tape left the shelf) falls back to the browser voice. */
  const voice: VoiceChoice =
    voicePick === "browser" || voicePick === "new" || names.some((name) => nameChoice(name) === voicePick)
      ? voicePick
      : "browser";
  const fieldRef = React.useRef<HTMLInputElement | null>(null);
  /** Choosing "Someone new" moves focus to its field once it is there. */
  const focusField = React.useRef(false);
  React.useEffect(() => {
    if (voice !== "new" || !focusField.current) return;
    focusField.current = false;
    fieldRef.current?.focus();
  }, [voice]);
  const pickVoice = React.useCallback((next: string) => {
    if (next === "new") focusField.current = true;
    setVoicePick(next as VoiceChoice);
  }, []);
  /** The name the copy is read by, or none (the browser voice; an empty field). */
  const chosenName = voice === "browser" ? undefined : voice === "new" ? voiceName(typed) : voice.slice("name:".length);

  const choose = React.useCallback((next: MoodName) => setChoice({ key, mood: next }), [key]);
  const makeCopy = React.useCallback(
    () => router.push(creatorUrl(target, mood, chosenName)),
    [router, target, mood, chosenName],
  );

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

      <p id={voiceId} data-rin="voice-label" className="rin-label">
        Whose voice?
      </p>
      <div role="radiogroup" aria-labelledby={voiceId} data-rin="voices" className="rin-voices">
        <VoiceCassette
          kind="browser"
          name={`${id}-voices`}
          label={BROWSER_VOICE}
          value="browser"
          checked={voice === "browser"}
          readingNow={reader.kind === "browser"}
          onSelect={pickVoice}
        />
        {names.map((name) => (
          <VoiceCassette
            key={name}
            name={`${id}-voices`}
            label={name}
            value={nameChoice(name)}
            checked={voice === nameChoice(name)}
            readingNow={sameVoice(name, readerName)}
            onSelect={pickVoice}
          />
        ))}
        <VoiceCassette
          kind="new"
          name={`${id}-voices`}
          label={SOMEONE_NEW}
          value="new"
          checked={voice === "new"}
          onSelect={pickVoice}
        />
      </div>
      {voice === "new" ? (
        <input
          ref={fieldRef}
          type="text"
          data-rin="voice-field"
          aria-labelledby={voiceId}
          className="rin-voice-field"
          value={typed}
          maxLength={VOICE_NAME_MAX}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="done"
          placeholder="Their name"
          onChange={(event) => setTyped(event.target.value)}
        />
      ) : null}

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
