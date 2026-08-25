"use client";

/**
 * The parental gate. PRIVACY.md rule 1: nothing leaves the device without a
 * parent, and the check has to be something a pre-reader cannot tap through —
 * so it is arithmetic, not a "are you an adult?" button. Asked per session,
 * never remembered forever.
 */

import * as React from "react";
import { BigButton, GlassPanel } from "@/components/studio-kit/kit";

export interface ParentGateProps {
  defaultAuthor: string;
  onPass: (author: string) => void;
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

export function ParentGate({ defaultAuthor, onPass, onCancel }: ParentGateProps) {
  const [challenge, setChallenge] = React.useState<Challenge | null>(null);
  const [answer, setAnswer] = React.useState("");
  const [author, setAuthor] = React.useState(defaultAuthor);
  const [wrong, setWrong] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

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
    if (Number(answer.trim()) === challenge.a * challenge.b) {
      onPass(author.trim());
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
      <GlassPanel
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-gate-title"
        className={`studio-rise w-full max-w-md border-white/14 bg-[#0b1020]/95 p-5 ${wrong ? "studio-shake" : ""}`}
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
            story by (optional)
          </label>
          <input
            id="studio-gate-author"
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Ada, age 4"
            className="sk-focus mt-1 h-12 w-full rounded-xl border border-white/12 bg-black/40 px-3 text-sm text-white placeholder:text-white/25"
          />

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
              disabled={!challenge || !answer.trim()}
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
