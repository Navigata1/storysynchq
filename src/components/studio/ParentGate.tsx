"use client";

/**
 * The parental gate. PRIVACY.md rule 1: nothing leaves the device without a
 * parent, and the check has to be something a pre-reader cannot tap through —
 * so it is arithmetic, not a "are you an adult?" button. Asked per session,
 * never remembered forever.
 */

import * as React from "react";
import { BigButton, GlassPanel } from "@/components/studio-kit/kit";

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
   * src/lib/storysync/consent.ts), worked out from "story by" as it is typed —
   * the Studio recomputes them from `onAuthorChange`. Voice consent is sacred
   * (design-direction §9.4): the grown-up says so here, once per voice, and
   * each one is written into `manifest.signature.voiceConsent[]` so it travels
   * with the tape instead of living in our database. No voices, no consent row.
   */
  voices: string[];
  /** "story by" as it is typed, so the voice list can follow it. */
  onAuthorChange?: (author: string) => void;
  /** Called only when every voice is ticked; `consentedVoices` is that list. */
  onPass: (author: string, consentedVoices: string[]) => void;
  onCancel: () => void;
}

interface Challenge {
  a: number;
  b: number;
}

function makeChallenge(): Challenge {
  const a = 3 + Math.floor(Math.random() * 7); // 3..9
  const b = 4 + Math.floor(Math.random() * 6); // 4..9
  return { a, b };
}

/**
 * Typing "story by" renames the voice it credits, in place: the same
 * recordings under a new name, so the ticks stand. Any other change — the
 * byline folding into another voice, or splitting back out of one — changes
 * which recordings a row stands for, so every tick is cleared and the
 * grown-up is asked again.
 */
function renamedInPlace(before: readonly string[], after: readonly string[]): boolean {
  if (before.length !== after.length) return false;
  return before.filter((voice, i) => voice !== after[i]).length <= 1;
}

export function ParentGate({
  defaultAuthor,
  bylineLabel = "story by",
  voices,
  onAuthorChange,
  onPass,
  onCancel,
}: ParentGateProps) {
  const [challenge, setChallenge] = React.useState<Challenge | null>(null);
  const [answer, setAnswer] = React.useState("");
  const [author, setAuthor] = React.useState(defaultAuthor);
  /** One tick per row, by position in `voices`. */
  const [ticked, setTicked] = React.useState<boolean[]>(() => voices.map(() => false));
  const [askedFor, setAskedFor] = React.useState<string[]>(voices);
  const [wrong, setWrong] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  // The voice list follows "story by" as it is typed. Adjusting state while
  // rendering (not in an effect) keeps the ticks and the rows in step.
  if (askedFor.join("\n") !== voices.join("\n")) {
    setAskedFor(voices);
    setTicked(renamedInPlace(askedFor, voices) ? ticked : voices.map(() => false));
  }

  const everyVoiceConsented = voices.every((_, i) => ticked[i] === true);
  const tick = (index: number, on: boolean) =>
    setTicked((prev) => voices.map((_, i) => (i === index ? on : prev[i] === true)));

  React.useEffect(() => {
    setChallenge(makeChallenge());
    inputRef.current?.focus();
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
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
      onPass(author.trim(), [...voices]);
      return;
    }
    setWrong(true);
    setAnswer("");
    setChallenge(makeChallenge());
    inputRef.current?.focus();
    window.setTimeout(() => setWrong(false), 500);
  };

  return (
    <div
      className="studio-fade fixed inset-0 z-[70] flex items-end justify-center bg-black/72 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
    >
      {/* A row per voice makes the panel taller; on a short phone it scrolls
          inside itself instead of losing its question off the top. */}
      <GlassPanel
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-gate-title"
        className={`studio-rise max-h-full w-full max-w-md overflow-y-auto overscroll-contain border-white/14 bg-[#0b1020]/95 p-5 ${wrong ? "studio-shake" : ""}`}
      >
        <h2 id="studio-gate-title" className="text-xl font-semibold text-white">
          A grown-up moment
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-white/65">
          Finishing the story saves it and can make a private link to share. A child&apos;s voice
          is personal information, so a grown-up answers this first. Nothing has left this device
          yet.
        </p>

        <form onSubmit={submit} className="mt-4">
          <label htmlFor="studio-gate-answer" className="block text-sm text-white/80">
            What is{" "}
            <span className="text-lg font-semibold text-amber-300">
              {challenge ? `${challenge.a} × ${challenge.b}` : "…"}
            </span>
            ?
          </label>
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
            className="sk-focus mt-2 h-14 w-full rounded-xl border border-white/15 bg-black/50 px-4 text-lg text-white"
          />
          {wrong ? (
            <p id="studio-gate-error" role="alert" className="mt-2 text-sm text-[#ff8a76]">
              Not quite — here is a new one.
            </p>
          ) : null}

          <label
            htmlFor="studio-gate-author"
            className="mt-4 block text-[11px] tracking-[0.18em] text-white/45 uppercase"
            style={{ fontFamily: "var(--font-plex-mono), monospace" }}
          >
            {bylineLabel} (optional)
          </label>
          <input
            id="studio-gate-author"
            type="text"
            value={author}
            onChange={(e) => {
              setAuthor(e.target.value);
              onAuthorChange?.(e.target.value);
            }}
            placeholder="Ada, age 4"
            className="sk-focus mt-1 h-12 w-full rounded-xl border border-white/12 bg-black/40 px-3 text-sm text-white placeholder:text-white/25"
          />

          {voices.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/[0.07] p-2">
              {voices.map((voice, i) => {
                // One voice keeps the reference control (and its id) exactly;
                // several each carry their name over the same sentence.
                const several = voices.length > 1;
                const id = several ? `studio-gate-consent-${i + 1}` : "studio-gate-consent";
                return (
                  /* The whole row is the target — a checkbox alone is too small. */
                  <label
                    key={i}
                    htmlFor={id}
                    data-studio="consent-row"
                    className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl p-2 ${
                      i > 0 ? "mt-1 border-t border-amber-400/15 pt-3" : ""
                    }`}
                  >
                    <input
                      id={id}
                      type="checkbox"
                      checked={ticked[i] === true}
                      onChange={(e) => tick(i, e.target.checked)}
                      className="sk-focus h-7 w-7 flex-none accent-amber-500"
                    />
                    <span className="min-w-0">
                      {several ? (
                        <>
                          <span
                            data-studio="consent-voice"
                            className="block text-[11px] tracking-[0.12em] break-words text-amber-300/90"
                            style={{ fontFamily: "var(--font-plex-mono), monospace" }}
                          >
                            {voice}
                          </span>{" "}
                        </>
                      ) : null}
                      <span className="block text-sm leading-relaxed text-white/80">
                        I am this child&apos;s parent or guardian and I consent to sharing this
                        recording.
                      </span>
                    </span>
                  </label>
                );
              })}
              <p className="px-2 pb-1 text-xs leading-relaxed text-white/40">
                This consent is written into the tape itself, so it travels with the story
                wherever the file goes.
              </p>
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <BigButton
              icon="↩"
              label="Not now"
              variant="ghost"
              type="button"
              onClick={onCancel}
              className="w-full justify-center"
            />
            <BigButton
              icon="✓"
              label="Continue"
              variant="gold"
              type="submit"
              disabled={!challenge || !answer.trim() || !everyVoiceConsented}
              className="w-full justify-center"
            />
          </div>
        </form>

        <p className="mt-4 text-xs leading-relaxed text-white/35">
          No trackers, no analytics. Share links are unlisted and random, and deleting the story
          removes the link, the pictures and the recordings.
        </p>
      </GlassPanel>
    </div>
  );
}

export default ParentGate;
