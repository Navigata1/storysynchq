"use client";

/**
 * The parental gate — "A grown-up moment" (s04). PRIVACY.md rule 1: nothing
 * leaves the device without a parent, and the check has to be something a
 * pre-reader cannot tap through — so it is arithmetic, not a "are you an
 * adult?" button. Asked per session, never remembered forever.
 *
 * Two objects stand side by side (one column under 1024px):
 *   - the gate (Register A): the a×b question, the byline, for each recorded
 *     voice whose voice it is and the grown-up's consent, the trust line;
 *   - the sheet (Register B): "What goes into your tape" — the seven layers
 *     of THIS draft in plain words (./tape-sheet), with a consent stamp that
 *     inks onto the Signature band once every voice is consented to.
 *
 * Voice consent is sacred (design-direction §9.4): the grown-up says so here,
 * once per voice, and each answer is written into
 * `manifest.signature.voiceConsent[]` with its own `grantedBy` — a parent or
 * guardian for a child's voice, "self" for a grown-up's own (s06) — so it
 * travels with the tape instead of living in our database.
 */

import * as React from "react";
import {
  AudioWaveform,
  Check,
  Cloud,
  CloudRain,
  Compass,
  Eye,
  Leaf,
  Lock,
  Moon,
  Pen,
  Star,
  Sun,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { BigButton } from "@/components/studio-kit/kit";
import { PacketBands, type PacketBand } from "@/components/studio-kit/PacketBands";
import { ConsentStamp } from "@/components/studio-kit/ConsentStamp";
import {
  consentDate,
  stampDate,
  type ConsentChoice,
  type ConsentGrantor,
} from "@/lib/storysync/consent";
import { stampGrantorLine, tapeSheet, type TapeSheetRow, type TapeSheetSource } from "./tape-sheet";
import "./parent-gate.css";

/** What the byline field credits: the story's maker, or the voice re-reading someone else's tape. */
export type BylineLabel = "story by" | "read by";

export interface ParentGateProps {
  defaultAuthor: string;
  /**
   * "story by" (default) for a story made here. "read by" on a tape opened to
   * be re-voiced (T15): the original author keeps the credit, and the byline
   * names the reader — the narrator and the consent voice.
   */
  bylineLabel?: BylineLabel;
  /**
   * The recorded voices on this tape, in order (`recordedVoices` in
   * src/lib/storysync/consent.ts), worked out from the byline as it is typed —
   * the Studio recomputes them from `onAuthorChange`. One consent row each; no
   * voices, no consent row (and no stamp).
   */
  voices: string[];
  /** The draft the sheet describes; the gate adds the byline and its own clock. */
  sheet: TapeSheetSource;
  /** The byline as it is typed, so the voice list can follow it. */
  onAuthorChange?: (author: string) => void;
  /**
   * Called only when the answer is right and every voice is ticked; `consents`
   * is one entry per voice, in voice order, with who consented to it.
   */
  onPass: (author: string, consents: ConsentChoice[]) => void;
  onCancel: () => void;
}

interface Challenge {
  a: number;
  b: number;
}

/** A fresh a×b question — never the one just missed. */
function makeChallenge(previous?: Challenge | null): Challenge {
  for (;;) {
    const a = 3 + Math.floor(Math.random() * 7); // 3..9
    const b = 4 + Math.floor(Math.random() * 6); // 4..9
    if (!previous || previous.a !== a || previous.b !== b) return { a, b };
  }
}

/** One recorded voice's answers: whose voice it is, and whether the grown-up ticked. */
interface VoiceRow {
  grantedBy: ConsentGrantor;
  ticked: boolean;
}

/** A child's voice, unticked: the s04 gate as it opens. */
const FRESH_ROW: VoiceRow = { grantedBy: "parent/guardian", ticked: false };

/** The consent sentence for each answer to "Whose voice is on this tape?" (s04, s06). */
const SENTENCE: Record<ConsentGrantor, string> = {
  "parent/guardian": "I am this child's parent or guardian and I consent to sharing this recording.",
  self: "This is my own voice, and I'm happy to share it.",
};

const WHOSE_OPTIONS: { value: ConsentGrantor; label: string }[] = [
  { value: "self", label: "Mine — I'm the grown-up speaking" },
  { value: "parent/guardian", label: "A child's — I'm their parent or guardian" },
];

const SUBLINE =
  "This consent is written into the tape itself, so it travels with the story wherever the file goes.";

/** Each mood's icon (brief design_system: the sprite's Lucide symbols). */
const MOOD_ICON: Record<string, LucideIcon> = {
  Wonder: Star,
  Adventure: Compass,
  Calm: Moon,
  Joy: Sun,
  Hush: Cloud,
  Rain: CloudRain,
  Suspense: Eye,
  Melancholy: Leaf,
};

/**
 * Typing the byline renames the voice it credits, in place: the same
 * recordings under a new name, so the answers stand. Any other change — the
 * byline folding into another voice, or splitting back out of one — changes
 * which recordings a row stands for, so every answer is cleared and the
 * grown-up is asked again.
 */
function renamedInPlace(before: readonly string[], after: readonly string[]): boolean {
  if (before.length !== after.length) return false;
  return before.filter((voice, i) => voice !== after[i]).length <= 1;
}

/** "Oct 19, 2026" style, for the stamp's spoken announcement. */
function spokenDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function ParentGate({
  defaultAuthor,
  bylineLabel = "story by",
  voices,
  sheet,
  onAuthorChange,
  onPass,
  onCancel,
}: ParentGateProps) {
  const [challenge, setChallenge] = React.useState<Challenge | null>(null);
  const [answer, setAnswer] = React.useState("");
  const [author, setAuthor] = React.useState(defaultAuthor);
  /** One row per voice, by position in `voices`. */
  const [rows, setRows] = React.useState<VoiceRow[]>(() => voices.map(() => FRESH_ROW));
  const [askedFor, setAskedFor] = React.useState<string[]>(voices);
  const [wrong, setWrong] = React.useState(false);
  /** The gate's own clock: the stamp's date is the date the record will carry. */
  const [today] = React.useState(() => new Date());
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const formRef = React.useRef<HTMLFormElement | null>(null);

  // The voice list follows the byline as it is typed. Adjusting state while
  // rendering (not in an effect) keeps the answers and the rows in step.
  if (askedFor.join("\n") !== voices.join("\n")) {
    setAskedFor(voices);
    setRows(renamedInPlace(askedFor, voices) ? rows : voices.map(() => FRESH_ROW));
  }

  const rowAt = (i: number): VoiceRow => rows[i] ?? FRESH_ROW;
  const everyVoiceConsented = voices.every((_, i) => rowAt(i).ticked);
  const grantors = voices.map((_, i) => rowAt(i).grantedBy);
  const allMine = voices.length > 0 && grantors.every((g) => g === "self");

  /** Rewrite one voice's row; the others stay as they are. */
  const updateRow = (index: number, next: (row: VoiceRow) => VoiceRow) =>
    setRows((prev) =>
      voices.map((_, i) => (i === index ? next(prev[i] ?? FRESH_ROW) : (prev[i] ?? FRESH_ROW))),
    );
  const tick = (index: number, on: boolean) => updateRow(index, (row) => ({ ...row, ticked: on }));
  /** A new answer to "whose voice" is a new sentence: its tick is asked for again. */
  const choose = (index: number, grantedBy: ConsentGrantor) =>
    updateRow(index, (row) => (row.grantedBy === grantedBy ? row : { grantedBy, ticked: false }));

  React.useEffect(() => {
    setChallenge(makeChallenge());
    inputRef.current?.focus();
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      // Focus stays inside the moment: Continue (or Not now) wraps to the answer.
      const root = dialogRef.current;
      const first = inputRef.current;
      const buttons = formRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
      const last = buttons && buttons.length > 0 ? buttons[buttons.length - 1] : null;
      if (!root || !first || !last) return;
      const active = document.activeElement;
      if (!root.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    // Enter in a field submits the form even while Continue is disabled.
    if (!everyVoiceConsented) return;
    if (Number(answer.trim()) === challenge.a * challenge.b) {
      onPass(
        author.trim(),
        voices.map((voice, i) => ({ voice, grantedBy: rowAt(i).grantedBy })),
      );
      return;
    }
    setWrong(true);
    setAnswer("");
    setChallenge(makeChallenge(challenge));
    inputRef.current?.focus();
    window.setTimeout(() => setWrong(false), 500);
  };

  /* ------------------------------------------------------------- the sheet */

  const sheetRows = React.useMemo(
    () => tapeSheet({ ...sheet, byline: author, year: today.getFullYear() }),
    [sheet, author, today],
  );
  const date = consentDate(today);
  const stampLines: [string, string] = [
    "VOICE CONSENT · GRANTED",
    `${stampGrantorLine(grantors)} · ${stampDate(date)}`,
  ];
  const stampWho =
    new Set(grantors).size > 1
      ? `for ${voices.length} voices`
      : allMine
        ? "by the grown-up speaking"
        : "by a parent or guardian";
  const stamp =
    voices.length > 0 ? (
      <ConsentStamp
        inked={everyVoiceConsented}
        lines={stampLines}
        announcement={`Stamped on the tape: voice consent granted ${stampWho}, ${spokenDate(today)}.`}
        className="absolute right-3 bottom-2.5 max-[480px]:right-2 max-[480px]:[--sk-stamp-a:12.5px] max-[480px]:[--sk-stamp-b:10.5px]"
      />
    ) : null;

  /* ------------------------------------------------------------- the gate */

  const single = voices.length === 1;

  return (
    <div
      data-studio="gate-overlay"
      role="presentation"
      className="studio-fade fixed inset-0 z-[70] flex overflow-y-auto overscroll-contain bg-black/72 backdrop-blur-sm"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-gate-title"
        className="gate-pair studio-rise"
      >
        {/* ---------------------------------------------- the gate (Register A) */}
        <div
          data-studio="gate"
          className={`gate-panel flex flex-col rounded-3xl border border-white/14 bg-[rgba(11,16,32,0.95)] p-5 shadow-[0_50px_90px_-30px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-7 ${
            wrong ? "studio-shake" : ""
          }`}
        >
          <p
            data-studio="gate-kicker"
            className="flex items-center gap-2 font-ss-mono text-[11px]/[1.2] font-medium tracking-[0.12em] text-ss-gold uppercase sm:text-xs/[1.2] sm:tracking-[0.18em]"
          >
            <Lock aria-hidden="true" className="size-3.5 flex-none" strokeWidth={2.4} />
            Before anything leaves this device
          </p>
          <h2
            id="studio-gate-title"
            className="mt-3 text-[26px]/[1.15] font-semibold tracking-[-0.015em] text-white sm:text-[28px]"
          >
            A grown-up moment
          </h2>
          <p className="mt-2.5 text-[14.5px]/[1.5] text-ss-fg-2">
            Finishing the story saves it and can make a private link to share. A child&apos;s voice
            is personal information, so a grown-up answers this first. Nothing has left this device
            yet.
          </p>

          <form ref={formRef} onSubmit={submit} className="mt-5 flex flex-1 flex-col">
            <label htmlFor="studio-gate-answer" className="block text-[15px]/7 font-medium text-white">
              What is{" "}
              <span
                data-studio="gate-numbers"
                className="text-[20px]/7 font-semibold tracking-[0.02em] text-ss-gold-2"
              >
                {challenge ? `${challenge.a} × ${challenge.b}` : "…"}
              </span>
              ?
            </label>
            {/* No live tick on a right answer: a pre-reader could type numbers until it turned green. */}
            <div data-studio="gate-answer-field" className="mt-2">
              <input
                id="studio-gate-answer"
                ref={inputRef}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                aria-invalid={wrong}
                aria-describedby={wrong ? "studio-gate-error" : undefined}
                className="sk-focus h-14 w-full rounded-[14px] border border-white/15 bg-black/50 px-5 text-2xl font-semibold tracking-[0.02em] text-white"
              />
            </div>
            {wrong ? (
              <p id="studio-gate-error" role="alert" className="mt-2 text-sm text-[#ff8a76]">
                Not quite — here is a new one.
              </p>
            ) : null}

            <label
              htmlFor="studio-gate-author"
              className="mt-4 block font-ss-mono text-[11px]/[1.2] font-medium tracking-[0.16em] text-ss-fg-3 uppercase"
            >
              {bylineLabel} (optional)
            </label>
            <div className="relative mt-2">
              <input
                id="studio-gate-author"
                type="text"
                value={author}
                onChange={(e) => {
                  setAuthor(e.target.value);
                  onAuthorChange?.(e.target.value);
                }}
                placeholder="Ada, age 4"
                className="sk-focus h-12 w-full rounded-xl border border-white/12 bg-black/50 pr-11 pl-4 text-[15.5px] text-white placeholder:text-white/25"
              />
              <Pen
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-ss-fg-4"
                strokeWidth={2}
              />
            </div>

            {single ? (
              <WhoseVoice index={0} label="Whose voice is on this tape?" value={rowAt(0).grantedBy} onChoose={choose} />
            ) : null}

            {voices.length > 0 ? (
              <div
                className={`rounded-[18px] border border-amber-400/30 bg-amber-500/[0.08] ${
                  single ? "mt-3 p-3 pl-3" : "mt-4 p-2"
                }`}
              >
                {voices.map((voice, i) => {
                  // One voice keeps the reference control (and its id) exactly;
                  // several each carry their name over their own sentence.
                  const id = single ? "studio-gate-consent" : `studio-gate-consent-${i + 1}`;
                  const row = rowAt(i);
                  return (
                    <div
                      key={i}
                      className={!single && i > 0 ? "mt-2 border-t border-amber-400/15 pt-3" : ""}
                    >
                      {!single ? (
                        <WhoseVoice
                          index={i}
                          label={`Whose voice is "${voice}"?`}
                          value={row.grantedBy}
                          onChoose={choose}
                          compact
                        />
                      ) : null}
                      {/* The whole row is the target — a checkbox alone is too small. */}
                      <label
                        htmlFor={id}
                        data-studio="consent-row"
                        className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl ${
                          single ? "" : "mt-2 p-1"
                        }`}
                      >
                        <span className="relative mt-px grid size-7 flex-none place-items-center">
                          <input
                            id={id}
                            type="checkbox"
                            checked={row.ticked}
                            onChange={(e) => tick(i, e.target.checked)}
                            className="peer sk-focus size-7 cursor-pointer appearance-none rounded-lg border-2 border-amber-400/60 bg-black/30 checked:border-transparent checked:bg-linear-to-b checked:from-ss-gold-2 checked:to-ss-gold checked:shadow-[0_0_0_4px_rgba(245,158,11,0.2),0_0_18px_rgba(245,158,11,0.45)]"
                          />
                          <Check
                            aria-hidden="true"
                            className="pointer-events-none absolute size-[18px] text-ss-ink opacity-0 peer-checked:opacity-100"
                            strokeWidth={3.2}
                          />
                        </span>
                        <span className="min-w-0 pt-0.5">
                          {!single ? (
                            <>
                              <span
                                data-studio="consent-voice"
                                className="block font-ss-mono text-[11px] tracking-[0.12em] break-words text-amber-300/90"
                              >
                                {voice}
                              </span>{" "}
                            </>
                          ) : null}
                          <span className="block text-[14.5px]/[1.45] font-medium text-white/85">
                            {SENTENCE[row.grantedBy]}
                          </span>
                        </span>
                      </label>
                    </div>
                  );
                })}
                <div className={`mt-1.5 flex items-end gap-3 ${single ? "pl-10" : "px-2 pb-1"}`}>
                  <p className="min-w-0 flex-1 text-xs/[1.45] text-ss-fg-3">{SUBLINE}</p>
                  {/* The row's twin on the sheet: layer 07, the Signature. */}
                  <span
                    aria-hidden="true"
                    className="mb-px grid size-[22px] flex-none place-items-center rounded-full bg-ss-ink font-ss-mono text-[11px]/none font-semibold tracking-[0.02em] text-ss-paper shadow-[0_0_0_2px_var(--ss-red),0_0_10px_rgba(227,69,47,0.45)]"
                  >
                    07
                  </span>
                </div>
              </div>
            ) : null}

            {voices.length > 0 ? (
              <p
                data-studio="gate-trust"
                className="mt-4 font-ss-display text-[18px]/[1.3] font-medium text-ss-label italic"
              >
                {allMine
                  ? "Your voice never goes anywhere without you."
                  : "Your child's voice never goes anywhere without you."}
              </p>
            ) : null}

            <div
              className="mt-auto grid grid-cols-2 gap-3 pt-5"
              style={{ "--sk-big-h": "56px" } as React.CSSProperties}
            >
              <BigButton
                icon={<Undo2 className="size-[18px]" strokeWidth={2.2} />}
                label="Not now"
                variant="ghost"
                type="button"
                onClick={onCancel}
                className="w-full justify-center rounded-2xl py-2 text-[16.5px]"
              />
              <BigButton
                icon={<Check className="size-[18px]" strokeWidth={2.6} />}
                label="Continue"
                variant="gold"
                type="submit"
                disabled={!challenge || !answer.trim() || !everyVoiceConsented}
                className="w-full justify-center rounded-2xl py-2 text-[16.5px]"
              />
            </div>
          </form>

          <p className="mt-3.5 text-xs/[1.5] text-ss-fg-4">
            No trackers, no analytics. Share links are unlisted and random, and deleting the story
            removes the link, the pictures and the recordings.
          </p>
        </div>

        {/* --------------------------------------------- the sheet (Register B) */}
        <TapeSheet rows={sheetRows} recorded={voices.length > 0} stamp={stamp} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------- whose voice is it */

interface WhoseVoiceProps {
  index: number;
  label: string;
  value: ConsentGrantor;
  onChoose: (index: number, grantedBy: ConsentGrantor) => void;
  /** Inside a several-voice consent box: a quieter label. */
  compact?: boolean;
}

/**
 * "Whose voice is on this tape?" (s06) — two native radios, so the arrows move
 * inside the group and Tab moves between groups. The child option is the
 * default: the s04 gate is unchanged until a grown-up says it is her own voice.
 */
function WhoseVoice({ index, label, value, onChoose, compact = false }: WhoseVoiceProps) {
  const labelId = `studio-gate-whose-${index + 1}`;
  return (
    <div className={compact ? "px-1 pt-1" : "mt-4"}>
      <p
        id={labelId}
        className={
          compact
            ? "text-[12.5px]/[1.35] font-medium break-words text-ss-fg-2"
            : "text-[14px]/[1.35] font-medium text-ss-fg-2"
        }
      >
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="mt-2 grid grid-cols-2 gap-2">
        {WHOSE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border-[1.5px] border-white/12 bg-white/[0.03] px-3 py-2 text-[13px]/[1.25] font-medium text-ss-fg-3 has-checked:border-amber-400/70 has-checked:bg-amber-500/10 has-checked:text-white has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-ss-gold"
          >
            <input
              type="radio"
              name={`studio-gate-whose-${index + 1}`}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChoose(index, option.value)}
              className="size-[18px] flex-none cursor-pointer appearance-none rounded-full border-2 border-white/30 outline-none checked:border-ss-gold checked:shadow-[inset_0_0_0_3px_var(--ss-navy-2),inset_0_0_0_9px_var(--ss-gold)]"
            />
            <span className="min-w-0">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- the sheet */

interface TapeSheetProps {
  rows: TapeSheetRow[];
  /** A recorded voice is on the tape (the Voice band's glyph). */
  recorded: boolean;
  /** The consent stamp, laid over the Signature band; null with no recorded voice. */
  stamp: React.ReactNode;
}

const MAX_THUMBS = 5;

/**
 * "What goes into your tape" — a printed sheet (Register B), not chrome:
 * nothing in it takes focus. The values are ./tape-sheet's, so they always
 * describe this draft as Continue will write it.
 */
function TapeSheet({ rows, recorded, stamp }: TapeSheetProps) {
  const bands: PacketBand[] = rows.map((row) => {
    const band: PacketBand = { layer: row.layer, value: row.value };
    if (row.layer === "Visual" && row.pictures && row.pictures.length > 0) {
      const shown = row.pictures.slice(0, MAX_THUMBS);
      const more = row.pictures.length - shown.length;
      band.aside = (
        <span data-band="thumbs" aria-hidden="true" className="flex items-center gap-[5px]">
          {shown.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt=""
              className="block size-[26px] flex-none rounded border-[1.5px] border-ss-ink bg-ss-crayon-paper object-cover"
            />
          ))}
          {more > 0 ? (
            <span data-band="more" className="font-ss-mono text-[11px] font-semibold text-ss-ink-2">
              +{more}
            </span>
          ) : null}
        </span>
      );
    }
    if (row.layer === "Voice" && recorded) {
      band.aside = <AudioWaveform aria-hidden="true" className="size-5 text-ss-ink" strokeWidth={2} />;
    }
    if (row.layer === "Sound" && row.mood) {
      const Icon = MOOD_ICON[row.mood] ?? Star;
      band.aside = (
        <Icon
          aria-hidden="true"
          className="size-5 text-ss-ink"
          strokeWidth={1.6}
          fill={`var(--mood-${row.mood.toLowerCase()}, var(--mood-wonder))`}
        />
      );
    }
    if (row.layer === "Signature" && stamp) band.overlay = stamp;
    return band;
  });

  return (
    <section
      aria-labelledby="studio-sheet-title"
      data-studio="tape-sheet"
      className="gate-sheet relative flex flex-col overflow-hidden rounded-[14px] border-3 border-ss-ink bg-[radial-gradient(420px_300px_at_0%_0%,rgba(255,255,255,0.7),transparent_70%),linear-gradient(180deg,#fffdf6_0%,#fbf5e6_100%)] text-ss-ink shadow-[0_50px_90px_-30px_rgba(0,0,0,0.85),0_0_60px_-10px_rgba(255,201,60,0.12)]"
    >
      <div
        data-studio="sheet-bar"
        className="flex h-11 flex-none items-center justify-between gap-3 bg-ss-ink px-[17px] text-ss-paper"
      >
        <span
          data-studio="sheet-kicker"
          className="font-ss-mono text-[11px]/none font-medium tracking-[0.18em] uppercase"
        >
          One file · seven layers
        </span>
        <span
          data-studio="sheet-mark"
          className="font-ss-display text-lg/none font-bold tracking-[-0.005em] text-ss-label"
        >
          .storysync
        </span>
      </div>
      <h3
        id="studio-sheet-title"
        className="px-[17px] pt-3.5 font-ss-display text-[24px]/[1.1] font-extrabold tracking-[-0.015em] sm:text-[26px]"
      >
        What goes into your tape
      </h3>
      <div className="pt-3 pr-[17px] pl-5">
        <PacketBands bands={bands} />
      </div>
      <p
        data-studio="sheet-foot"
        className="mt-auto flex items-center justify-center gap-2 px-4 pt-4 pb-3 font-ss-mono text-[11px]/none font-medium tracking-[0.14em] text-ss-ink-3 uppercase"
      >
        <Lock aria-hidden="true" className="size-[13px] flex-none" strokeWidth={2} />
        Nothing has left this device yet.
      </p>
    </section>
  );
}

export default ParentGate;
