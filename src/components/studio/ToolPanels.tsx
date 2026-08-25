"use client";

/**
 * The three tool panels that need more than a file picker: Voice, Music and
 * Magic. Each is a bottom sheet on a phone and a card beside the rail on a
 * desktop (studio.css `.studio-toolpanel`).
 */

import * as React from "react";
import { BigButton, GlassPanel } from "@/components/studio-kit/kit";
import type { MicPermissionError } from "@/lib/audio/recorder";
import { MOOD_NAMES, STUDIO_MOODS, formatClock, type MoodName } from "./types";

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
      className="studio-toolpanel studio-scroll border-white/12 bg-[#0b1020]/92 p-4 shadow-2xl"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-white/50">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="sk-focus flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-white/12 bg-white/5 text-white/70 hover:bg-white/10"
        >
          <span aria-hidden="true">✕</span>
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
    body: "A grown-up needs to allow the microphone for this site — look for the 🔒 or 🎙 icon next to the web address, choose Allow, then tap Try again.",
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

export interface VoicePanelProps {
  recording: boolean;
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
          <p className="text-base font-semibold text-white">{help.title}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/70">{help.body}</p>
        </div>
        <div className="mt-3 grid gap-2">
          <BigButton icon="🎙" label="Try again" variant="gold" onClick={onRetry} className="w-full" />
          <BigButton icon="✎" label="Keep writing instead" variant="ghost" onClick={onClose} className="w-full" />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-white/40">
          Your voice stays on this device until a grown-up finishes the story.
        </p>
      </PanelShell>
    );
  }

  return (
    <PanelShell
      title="Voice"
      subtitle={recording ? "Listening… tap again when you are done" : "Tap the red button and tell this page"}
      onClose={onClose}
    >
      <BigButton
        icon={recording ? "■" : "●"}
        label={recording ? `Stop — ${formatClock(recordSeconds)}` : hasVoice ? "Record it again" : "Start recording"}
        variant="red"
        onClick={onToggleRecord}
        className="w-full justify-center text-center"
        style={{ "--sk-big-h": "92px" } as React.CSSProperties}
      />

      {hasVoice && !recording ? (
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
          <p
            className="text-[11px] tracking-[0.18em] text-white/45 uppercase"
            style={{ fontFamily: "var(--font-plex-mono), monospace" }}
          >
            your voice · {formatClock(voiceSeconds)}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <BigButton
              icon={playing ? "■" : "▶"}
              label={playing ? "Stop" : "Listen"}
              variant="gold"
              onClick={onListen}
              className="w-full justify-center"
            />
            <BigButton
              icon="🗑"
              label="Delete"
              variant="ghost"
              onClick={onDelete}
              className="w-full justify-center"
            />
          </div>
        </div>
      ) : null}

      <p className="mt-3 text-xs leading-relaxed text-white/40">
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
          const config = STUDIO_MOODS[name];
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
                <span aria-hidden="true">{config.emoji}</span>
                {name}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-white/50">{config.blurb}</span>
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
