"use client";

/**
 * The three tool panels that need more than a file picker: Voice, Music and
 * Magic. Each is a bottom sheet on a phone, a card floating over the Stage on
 * a small tablet, and from 1024px a column docked between the rail and the
 * Stage, so it never covers the page it is talking about (studio.css
 * `.studio-toolpanel`).
 */

import * as React from "react";
import { Lock, Mic, MicOff, Pen, Play, Square, Trash2, X } from "lucide-react";
import { BigButton, GlassPanel } from "@/components/studio-kit/kit";
import type { MicPermissionError } from "@/lib/audio/recorder";
import { MOOD_CHROME, MOOD_NAMES, moodBlurb, type MoodName } from "./moods-ui";
import { formatClock } from "./types";
import "./read-this.css";

/* ---------------------------------------------------------------- shell */

function PanelShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <GlassPanel
      role="dialog"
      aria-label={title}
      data-studio="tool-card"
      // The card's own navy must beat GlassPanel's default bg-white/5 (it never
      // did, so the sheet read as clear glass over the toolbar): hence the "!".
      className="studio-toolpanel studio-scroll flex flex-col border-white/12 bg-[#0b1020]/92! p-4 shadow-2xl lg:rounded-[20px] lg:bg-[#080b15]/80! lg:p-5"
    >
      {/* The close key sits beside the title, so the subtitle has the full width. */}
      <div className="relative mb-3 flex-none">
        <h2 className="flex min-h-8 items-center pr-12 text-base font-semibold text-white lg:text-xl lg:tracking-[-0.01em]">
          {title}
        </h2>
        {subtitle ? <p className="mt-1 text-sm text-white/50 lg:text-ss-fg-2">{subtitle}</p> : null}
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="sk-focus absolute -top-1 right-0 flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-white/5 text-white/70 hover:bg-white/10"
        >
          <X aria-hidden="true" className="size-[18px]" strokeWidth={2} />
        </button>
      </div>
      {children}
    </GlassPanel>
  );
}

/* ----------------------------------------------------------------- voice */

const MIC_HELP: Record<MicPermissionError, { title: string; body: string }> = {
  denied: {
    title: "The microphone is switched off",
    body: "A grown-up needs to allow the microphone for this site — look for the lock or microphone icon next to the web address, choose Allow, then tap Try again.",
  },
  unavailable: {
    title: "No microphone found",
    body: "Nothing is listening on this device. Plug in a microphone or headset, or try on a phone or tablet, then tap Try again.",
  },
  unknown: {
    title: "Something got in the way",
    body: "The microphone did not start. Another app may be using it. Close other recording apps and tap Try again.",
  },
};

/**
 * READ THIS (s06 phone 2): a teleprompter for whoever is reading the page
 * aloud. On a phone the Voice sheet covers the Stage's words the moment a take
 * starts, so the words come with it, on paper, above Stop. It is not a
 * read-along: no word lights or moves during a take (s03 — that would need
 * on-device speech alignment), so the card is the words and nothing else.
 * Memoised on the words alone: the take's ticking clock never touches it.
 */
const ReadThis = React.memo(function ReadThis({ words }: { words: string }) {
  return (
    <div role="note" aria-label="Read this" data-studio="read-this" className="read-this">
      {/* The note's name already says it; the printed label is for the eye. */}
      <p data-studio="read-this-label" className="read-this-label" aria-hidden="true">
        <span data-studio="read-this-dot" className="read-this-dot" />
        READ THIS
      </p>
      {/* Long words scroll here. A browser would put a scroller with nothing
          focusable inside into the Tab order on its own; -1 keeps Tab going
          from Close Voice straight to Stop. The same words stay in the
          Stage's own box, which the keyboard reaches. */}
      <p data-studio="read-this-words" className="read-this-words" tabIndex={-1}>
        {words}
      </p>
    </div>
  );
});

export interface VoicePanelProps {
  recording: boolean;
  /**
   * The active page's words, exactly as its `text.content` holds them. While a
   * take records they stand on a paper READ THIS card above Stop (T19).
   */
  pageWords: string;
  hasVoice: boolean;
  voiceSeconds: number;
  recordSeconds: number;
  playing: boolean;
  micError: MicPermissionError | null;
  onToggleRecord: () => void;
  onListen: () => void;
  onDelete: () => void;
  onRetry: () => void;
  onClose: () => void;
}

export function VoicePanel({
  recording,
  pageWords,
  hasVoice,
  voiceSeconds,
  recordSeconds,
  playing,
  micError,
  onToggleRecord,
  onListen,
  onDelete,
  onRetry,
  onClose,
}: VoicePanelProps) {
  if (micError) {
    const help = MIC_HELP[micError];
    return (
      <PanelShell title="Voice" subtitle="We could not start listening" onClose={onClose}>
        <div className="rounded-2xl border border-[#E3452F]/40 bg-[#E3452F]/10 p-4">
          <p className="flex items-center gap-3 text-base leading-snug font-semibold text-white">
            <span
              aria-hidden="true"
              className="grid size-9 flex-none place-items-center rounded-full border border-[#E3452F]/50 bg-[#E3452F]/14 text-[#ff9a86]"
            >
              <MicOff className="size-[18px]" strokeWidth={2} />
            </span>
            {help.title}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/70">{help.body}</p>
        </div>
        <div className="mt-3 grid gap-2">
          <BigButton
            icon={<Mic className="size-5" strokeWidth={2.2} />}
            label="Try again"
            variant="gold"
            onClick={onRetry}
            className="w-full"
          />
          <BigButton
            icon={<Pen className="size-5" strokeWidth={2} />}
            label="Keep writing instead"
            variant="ghost"
            onClick={onClose}
            className="w-full"
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-white/40">
          Your voice stays on this device until a grown-up finishes the story.
        </p>
      </PanelShell>
    );
  }

  /** A page with no words has nothing to read: no card, no placeholder. */
  const reading = recording && pageWords.trim() !== "";
  const label = recording
    ? `Stop — ${formatClock(recordSeconds)}`
    : hasVoice
      ? "Record it again"
      : "Start recording";

  return (
    <PanelShell
      title="Voice"
      subtitle={recording ? "Listening… tap again when you are done" : "Tap the red button and tell this page"}
      onClose={onClose}
    >
      {/* The take and "your voice" share one body. Docked, the body is the part
          that scrolls on a short screen, so the privacy footnote under it
          stays in sight (studio.css `.studio-voice-body`). */}
      <div className="studio-voice-body studio-scroll" data-reading={reading ? "true" : undefined}>
        {reading ? <ReadThis words={pageWords} /> : null}

        {/* The big red button: tap to start, tap to stop. A frozen frame of the
            live ring, never a pulse — nothing loops in the Creator. */}
        <div className="studio-voice-take">
          <button
            type="button"
            onClick={onToggleRecord}
            data-studio="voice-record"
            data-live={recording ? "true" : "false"}
            className="studio-voice-record sk-focus group flex items-center gap-4 rounded-3xl"
          >
            <span
              aria-hidden="true"
              className="studio-voice-disc relative grid flex-none place-items-center rounded-full border-[3px] border-white/16 bg-[#1a1f33] shadow-[0_14px_34px_-14px_rgba(227,69,47,0.6)] transition-transform duration-200 ease-out group-hover:scale-[1.03] group-active:scale-[0.98] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            >
              {recording ? (
                <span
                  data-studio="voice-live-ring"
                  className="absolute -inset-3.5 rounded-full border-[3px] border-[#E3452F]/70 shadow-[0_0_0_12px_rgba(227,69,47,0.12),0_0_70px_14px_rgba(227,69,47,0.32)] lg:-inset-4"
                />
              ) : null}
              <span
                className={`bg-[radial-gradient(circle_at_35%_30%,#ff7a62,#E3452F_60%,#b02c1b)] shadow-[inset_0_2px_0_rgba(255,255,255,0.25)] ${
                  recording ? "size-[42%] rounded-[22%]" : "size-[58%] rounded-full"
                }`}
              />
            </span>
            <span className="text-lg leading-none font-semibold text-white tabular-nums">{label}</span>
          </button>

          <p
            data-studio="voice-lock"
            className="flex items-center justify-center gap-2 text-[13px] leading-snug text-ss-fg-3"
          >
            <Lock aria-hidden="true" className="size-3.5 flex-none" strokeWidth={2} />
            Pages stay put while you record.
          </p>
        </div>

        {hasVoice && !recording ? (
          <div className="studio-voice-yours mt-2 flex-none rounded-2xl border border-white/10 bg-white/5 p-2.5">
            <p className="font-ss-mono text-[11px] tracking-[0.18em] text-white/45 uppercase">
              your voice · {formatClock(voiceSeconds)}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <BigButton
                icon={
                  playing ? (
                    <Square className="size-5" fill="currentColor" strokeWidth={0} />
                  ) : (
                    <Play className="size-5" fill="currentColor" strokeWidth={0} />
                  )
                }
                label={playing ? "Stop" : "Listen"}
                variant="gold"
                onClick={onListen}
                className="w-full justify-center"
              />
              <BigButton
                icon={<Trash2 className="size-5" strokeWidth={2} />}
                label="Delete"
                variant="ghost"
                onClick={onDelete}
                className="w-full justify-center"
              />
            </div>
          </div>
        ) : null}
      </div>

      <p className="mt-2.5 flex-none border-t border-white/10 pt-2.5 text-center text-xs leading-relaxed text-[#6f7891]">
        Recordings live only in this browser until a grown-up taps Finish my story.
      </p>
    </PanelShell>
  );
}

/* ----------------------------------------------------------------- music */

export interface MusicPanelProps {
  mood: MoodName;
  musicOn: boolean;
  musicVolume: number;
  onMood: (mood: MoodName) => void;
  onToggle: (on: boolean) => void;
  onVolume: (v: number) => void;
  onClose: () => void;
}

export function MusicPanel({
  mood,
  musicOn,
  musicVolume,
  onMood,
  onToggle,
  onVolume,
  onClose,
}: MusicPanelProps) {
  return (
    <PanelShell title="Music" subtitle="The feeling under your story" onClose={onClose}>
      <div role="radiogroup" aria-label="Music mood" className="grid grid-cols-2 gap-2">
        {MOOD_NAMES.map((name) => {
          const chrome = MOOD_CHROME[name];
          const selected = name === mood;
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onMood(name)}
              className={`sk-focus min-h-[64px] rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                selected
                  ? "border-amber-400/70 bg-amber-500/15 shadow-[0_0_0_1px_rgba(245,158,11,0.35)]"
                  : "border-white/12 bg-white/5 hover:bg-white/10"
              }`}
            >
              <span className="flex items-center gap-2 text-[15px] font-semibold text-white">
                <span aria-hidden="true">{chrome.emoji}</span>
                {name}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-white/50">
                {moodBlurb(name)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
        <span className="text-sm font-medium text-white/85">Play music behind the story</span>
        <button
          type="button"
          role="switch"
          aria-checked={musicOn}
          aria-label="Play music behind the story"
          onClick={() => onToggle(!musicOn)}
          className={`sk-focus relative h-8 w-14 flex-none rounded-full border transition-colors ${
            musicOn ? "border-amber-400/60 bg-amber-500/30" : "border-white/15 bg-black/50"
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-[left] duration-300 ${
              musicOn ? "left-7" : "left-1"
            }`}
          />
        </button>
      </div>

      <div className="mt-3">
        <label
          htmlFor="studio-music-volume"
          className="flex items-center justify-between text-[11px] tracking-[0.18em] text-white/45 uppercase"
          style={{ fontFamily: "var(--font-plex-mono), monospace" }}
        >
          <span>music level</span>
          <span>{Math.round(musicVolume * 100)}%</span>
        </label>
        <input
          id="studio-music-volume"
          className="studio-range mt-1"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={musicVolume}
          onChange={(e) => onVolume(Number(e.target.value))}
        />
        <p className="text-xs leading-relaxed text-white/40">
          The music always ducks about 12 dB under a voice, the way the library tapes did.
        </p>
      </div>
    </PanelShell>
  );
}

/* ----------------------------------------------------------------- magic */

export const MAGIC_LOOKS = [
  { id: "storybook", label: "Storybook" },
  { id: "watercolor", label: "Watercolor" },
  { id: "night", label: "Night" },
] as const;

export type MagicLook = (typeof MAGIC_LOOKS)[number]["id"];

export interface MagicPanelProps {
  busy: boolean;
  willReplace: boolean;
  onGenerate: (prompt: string, pages: number, look: MagicLook) => void;
  onClose: () => void;
}

export function MagicPanel({ busy, willReplace, onGenerate, onClose }: MagicPanelProps) {
  const [prompt, setPrompt] = React.useState("");
  const [pages, setPages] = React.useState(5);
  const [look, setLook] = React.useState<MagicLook>("storybook");
  const [confirming, setConfirming] = React.useState(false);

  const submit = () => {
    if (!prompt.trim() || busy) return;
    if (willReplace && !confirming) {
      setConfirming(true);
      return;
    }
    onGenerate(prompt.trim(), pages, look);
  };

  return (
    <PanelShell title="Magic" subtitle="Tell me an idea, get a whole story" onClose={onClose}>
      <label htmlFor="studio-magic-prompt" className="sr-only">
        Story idea
      </label>
      <textarea
        id="studio-magic-prompt"
        value={prompt}
        onChange={(e) => {
          setPrompt(e.target.value);
          setConfirming(false);
        }}
        rows={3}
        placeholder="A brave little turtle who is scared of the big waves…"
        className="studio-scroll w-full rounded-xl border border-white/12 bg-black/40 p-3 text-[15px] text-white placeholder:text-white/30 focus-visible:border-amber-400/60 focus-visible:outline-none"
      />

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="studio-magic-pages"
            className="block text-[11px] tracking-[0.18em] text-white/45 uppercase"
            style={{ fontFamily: "var(--font-plex-mono), monospace" }}
          >
            pages
          </label>
          <select
            id="studio-magic-pages"
            value={pages}
            onChange={(e) => setPages(Number(e.target.value))}
            className="sk-focus mt-1 h-11 w-full rounded-xl border border-white/12 bg-black/40 px-3 text-sm text-white"
          >
            {[3, 5, 7].map((n) => (
              <option key={n} value={n} className="bg-[#0b1020]">
                {n} pages
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="studio-magic-look"
            className="block text-[11px] tracking-[0.18em] text-white/45 uppercase"
            style={{ fontFamily: "var(--font-plex-mono), monospace" }}
          >
            look
          </label>
          <select
            id="studio-magic-look"
            value={look}
            onChange={(e) => setLook(e.target.value as MagicLook)}
            className="sk-focus mt-1 h-11 w-full rounded-xl border border-white/12 bg-black/40 px-3 text-sm text-white"
          >
            {MAGIC_LOOKS.map((l) => (
              <option key={l.id} value={l.id} className="bg-[#0b1020]">
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {confirming ? (
        <p className="mt-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          This replaces the pages you already have. Tap again to go ahead.
        </p>
      ) : null}

      <BigButton
        icon="✨"
        label={busy ? "Writing…" : confirming ? "Yes, replace my pages" : "Make my story"}
        variant={confirming ? "red" : "violet"}
        disabled={busy || !prompt.trim()}
        onClick={submit}
        className="mt-3 w-full justify-center"
      />

      <p className="mt-3 text-xs leading-relaxed text-white/40">
        Words and pictures are made right here in the browser — nothing is sent anywhere. Record
        your own voice over them next.
      </p>
    </PanelShell>
  );
}
