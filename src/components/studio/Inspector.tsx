"use client";

/**
 * INSPECTOR — Advanced mode only.
 *
 * Everything an engineer wants and a 4-year-old must never see: per-page
 * timing, the mix, the activity meter, and the manifest itself with the codec
 * rule surfaced. Nothing in here is required to finish a story.
 */

import * as React from "react";
import { VUMeter } from "@/components/studio-kit/kit";
import type { SsyncManifest, SsyncPage } from "@/lib/storysync/manifest";
import { MOOD_NAMES, moodReadout } from "./moods-ui";
import {
  approxBytes,
  autoPauseOf,
  codecBadge,
  formatBytes,
  readableManifestJson,
  type MoodName,
  type RecordingMeta,
} from "./types";

export interface InspectorProps {
  manifest: SsyncManifest;
  page: SsyncPage | undefined;
  pageNumber: number;
  recordings: Record<string, RecordingMeta>;
  mood: MoodName;
  musicOn: boolean;
  musicVolume: number;
  narrationVolume: number;
  /**
   * The meter subscribes itself instead of taking a `level` prop: a value
   * arriving 15 times a second through the tree would re-render the whole
   * studio (and re-measure a multi-megabyte manifest) at the same rate.
   */
  subscribeLevel: (listener: (level: number) => void) => () => void;
  onAutoPause: (seconds: number) => void;
  onApplyPauseToAll: () => void;
  onTimingMultiplier: (value: number) => void;
  onAlt: (alt: string) => void;
  onAuthor: (author: string) => void;
  onMood: (mood: MoodName) => void;
  onMusicToggle: (on: boolean) => void;
  onMusicVolume: (v: number) => void;
  onNarrationVolume: (v: number) => void;
  onClose: () => void;
}

const META_FONT = { fontFamily: "var(--font-plex-mono), monospace" } as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-white/8 px-4 py-4">
      <h3 className="mb-3 text-[11px] tracking-[0.22em] text-white/40 uppercase" style={META_FONT}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Slider({
  id,
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-3">
      <label
        htmlFor={id}
        className="flex items-center justify-between text-[11px] tracking-[0.16em] text-white/45 uppercase"
        style={META_FONT}
      >
        <span>{label}</span>
        <span className="text-amber-300/80">{display}</span>
      </label>
      <input
        id={id}
        className="studio-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/**
 * The only thing in the studio that re-renders at frame rate. It owns its own
 * state and subscribes to the engine's activity envelope, so nothing above it
 * in the tree is touched while a child is talking.
 */
function ActivityMeter({
  subscribeLevel,
}: {
  subscribeLevel: (listener: (level: number) => void) => () => void;
}) {
  const [level, setLevel] = React.useState(0);
  React.useEffect(() => subscribeLevel(setLevel), [subscribeLevel]);
  return (
    <div className="mt-4">
      <div
        className="mb-1 flex items-center justify-between text-[11px] tracking-[0.16em] text-white/45 uppercase"
        style={META_FONT}
      >
        <span>activity</span>
        <span>{Math.round(level * 100)}%</span>
      </div>
      <VUMeter level={level} label="Narration and recording activity" />
      <p className="mt-1.5 text-xs leading-relaxed text-white/35">
        Activity envelope, not a calibrated meter: the engine exposes no analyser tap and the
        studio will not open a second microphone stream to fake one.
      </p>
    </div>
  );
}

const BADGE_TONE: Record<string, string> = {
  published: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  draft: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  none: "border-white/12 bg-white/5 text-white/40",
};

export function Inspector(props: InspectorProps) {
  const {
    manifest,
    page,
    pageNumber,
    recordings,
    mood,
    musicOn,
    musicVolume,
    narrationVolume,
    subscribeLevel,
    onAutoPause,
    onApplyPauseToAll,
    onTimingMultiplier,
    onAlt,
    onAuthor,
    onMood,
    onMusicToggle,
    onMusicVolume,
    onNarrationVolume,
    onClose,
  } = props;

  const [showJson, setShowJson] = React.useState(false);
  const multiplier = manifest.settings?.accessibility?.timingMultiplier ?? 1;
  const pause = page ? autoPauseOf(page) : 0;

  return (
    <aside
      aria-label="Inspector"
      className="studio-inspector studio-scroll border-t border-white/10 bg-[#080c17]/95 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-white/90">Inspector</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="studio-inspector-close sk-focus flex h-11 w-11 items-center justify-center rounded-xl border border-white/12 bg-white/5 text-white/70 hover:bg-white/10"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      {/* ------------------------------------------------------------ timing */}
      <Section title={`Timing · page ${pageNumber}`}>
        <Slider
          id="insp-autopause"
          label="auto pause"
          value={pause}
          display={`${pause.toFixed(1)}s`}
          min={0}
          max={6}
          step={0.5}
          onChange={onAutoPause}
        />
        <button
          type="button"
          onClick={onApplyPauseToAll}
          className="sk-focus min-h-11 w-full rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white/75 hover:bg-white/10"
        >
          Apply {pause.toFixed(1)}s to every page
        </button>
        <div className="mt-3">
          <Slider
            id="insp-multiplier"
            label="timing multiplier"
            value={multiplier}
            display={`${multiplier.toFixed(2)}×`}
            min={0.5}
            max={2}
            step={0.05}
            onChange={onTimingMultiplier}
          />
          <p className="text-xs leading-relaxed text-white/40">
            Accessibility control the Player honours — stretches every pause for readers who need
            longer.
          </p>
        </div>
      </Section>

      {/* --------------------------------------------------------------- mix */}
      <Section title="Mix">
        <Slider
          id="insp-narration"
          label="narration bus"
          value={narrationVolume}
          display={`${Math.round(narrationVolume * 100)}%`}
          min={0}
          max={1}
          step={0.05}
          onChange={onNarrationVolume}
        />
        <Slider
          id="insp-music"
          label="music bed"
          value={musicVolume}
          display={`${Math.round(musicVolume * 100)}%`}
          min={0}
          max={1}
          step={0.05}
          onChange={onMusicVolume}
        />
        <div className="mb-3 flex items-center justify-between gap-3">
          <label htmlFor="insp-music-on" className="text-sm text-white/75">
            Music bed
          </label>
          <input
            id="insp-music-on"
            type="checkbox"
            checked={musicOn}
            onChange={(e) => onMusicToggle(e.target.checked)}
            className="sk-focus h-6 w-6 accent-amber-500"
          />
        </div>
        <label htmlFor="insp-mood" className="block text-[11px] tracking-[0.16em] text-white/45 uppercase" style={META_FONT}>
          mood
        </label>
        <select
          id="insp-mood"
          value={mood}
          onChange={(e) => onMood(e.target.value as MoodName)}
          className="sk-focus mt-1 h-11 w-full rounded-xl border border-white/12 bg-black/40 px-3 text-sm text-white"
        >
          {MOOD_NAMES.map((name) => (
            <option key={name} value={name} className="bg-[#0b1020]">
              {name} · {moodReadout(name)}
            </option>
          ))}
        </select>

        <ActivityMeter subscribeLevel={subscribeLevel} />
      </Section>

      {/* ------------------------------------------------------------- page */}
      <Section title="Page details">
        <label htmlFor="insp-alt" className="block text-[11px] tracking-[0.16em] text-white/45 uppercase" style={META_FONT}>
          picture description
        </label>
        <input
          id="insp-alt"
          type="text"
          value={page?.illustration?.alt ?? ""}
          onChange={(e) => onAlt(e.target.value)}
          placeholder="A turtle on a green wave"
          className="sk-focus mt-1 h-11 w-full rounded-xl border border-white/12 bg-black/40 px-3 text-sm text-white placeholder:text-white/25"
        />
        <label
          htmlFor="insp-author"
          className="mt-3 block text-[11px] tracking-[0.16em] text-white/45 uppercase"
          style={META_FONT}
        >
          story by
        </label>
        <input
          id="insp-author"
          type="text"
          value={manifest.metadata.author ?? ""}
          onChange={(e) => onAuthor(e.target.value)}
          placeholder="Ada, age 4"
          className="sk-focus mt-1 h-11 w-full rounded-xl border border-white/12 bg-black/40 px-3 text-sm text-white placeholder:text-white/25"
        />
      </Section>

      {/* --------------------------------------------------------- manifest */}
      <Section title="Manifest · SSYNC 2.0">
        <ul className="mb-3 space-y-1.5">
          {manifest.pages.map((p, i) => {
            const badge = codecBadge(p.text?.audioUrl, p.text?.audioCodec, recordings[String(p.id)]);
            return (
              <li key={p.id} className="flex items-center justify-between gap-2 text-xs text-white/60">
                <span style={META_FONT}>page {i + 1}</span>
                <span
                  title={badge.hint}
                  className={`rounded-full border px-2 py-[3px] text-[10px] tracking-[0.12em] uppercase ${BADGE_TONE[badge.tone]}`}
                  style={META_FONT}
                >
                  {badge.label}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs leading-relaxed text-white/50">
          Published narration is always AAC/M4A, with WAV as the only permitted fallback. Draft
          Opus/WebM is normalized when you tap Finish my story and never ships inside a
          <span style={META_FONT}> .storysync</span> file.
        </p>

        <button
          type="button"
          onClick={() => setShowJson((v) => !v)}
          aria-expanded={showJson}
          className="sk-focus mt-3 min-h-11 w-full rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white/75 hover:bg-white/10"
        >
          {showJson ? "Hide" : "Show"} manifest JSON · {formatBytes(approxBytes(manifest))}
        </button>
        {showJson ? (
          <pre
            className="studio-scroll mt-2 max-h-72 overflow-auto rounded-xl border border-white/10 bg-black/60 p-3 text-[11px] leading-relaxed text-white/70"
            style={META_FONT}
          >
            {readableManifestJson(manifest)}
          </pre>
        ) : null}
      </Section>
    </aside>
  );
}

export default Inspector;
