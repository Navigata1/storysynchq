"use client";

/**
 * INSPECTOR — Advanced mode only.
 *
 * Everything an engineer wants and a 4-year-old must never see: per-page
 * timing, the mix, the activity meter, and the manifest itself with the codec
 * rule surfaced. Nothing in here is required to finish a story.
 */

import * as React from "react";
import { ArrowRight } from "lucide-react";
import { VUMeter } from "@/components/studio-kit/kit";
import { MOOD_ICON } from "@/components/studio-kit/MoodTapeChip";
import { explainMood, type MoodExplanation } from "@/lib/audio/moods";
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
import "./feeling.css";

export interface InspectorProps {
  manifest: SsyncManifest;
  page: SsyncPage | undefined;
  pageNumber: number;
  recordings: Record<string, RecordingMeta>;
  /** The story mood: the whole-story select. */
  mood: MoodName;
  /** The active page's own mood (T24a), or null when it follows the story. */
  pageMood: MoodName | null;
  musicOn: boolean;
  musicVolume: number;
  narrationVolume: number;
  /** "Evening out each voice" at publish (T17). Draft-only, on by default. */
  levelVoices: boolean;
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
  /** A mood of its own for the active page, or null: "Same as the story". */
  onPageMood: (mood: MoodName | null) => void;
  /** "Type a feeling" → "Use for page N" (T24b): only the resolved mood name, never the words. */
  onFeelingForPage: (mood: MoodName) => void;
  /** "Type a feeling" → "Use for every page" (T24b): the story mood, every override cleared. */
  onFeelingForEveryPage: (mood: MoodName) => void;
  onMusicToggle: (on: boolean) => void;
  onMusicVolume: (v: number) => void;
  onNarrationVolume: (v: number) => void;
  onLevelVoices: (on: boolean) => void;
  onClose: () => void;
}

const META_FONT = { fontFamily: "var(--font-plex-mono), monospace" } as const;

/*
 * Contrast: every heading, label and note is --ss-fg-3 (#8d96ad, ≈ 6:1 on the
 * inspector's #080c17), never white at 35-45 % (≈ 3.7:1, under AA at 11 px).
 * Density: from 1180px (the docked column, s09) the controls are 36px and a
 * slider is one row; on a phone or tablet's sheet every target stays 44px.
 */
const LABEL = "text-[11px] tracking-[0.16em] text-ss-fg-3 uppercase";
const NOTE = "text-xs leading-relaxed text-ss-fg-3";
const CONTROL_H = "h-11 min-[1180px]:h-9";
const BUTTON_H = "min-h-11 min-[1180px]:min-h-9";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="studio-insp-section border-b border-white/8 px-4 py-4 min-[1180px]:py-3">
      <h3 className="mb-3 text-[11px] tracking-[0.22em] text-ss-fg-3 uppercase min-[1180px]:mb-2.5" style={META_FONT}>
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
  // The name over the slider with its reading at the right (a sheet), or
  // name · slider · reading on one row (the docked column, s09 `.s9-sl`).
  return (
    <div className="studio-insp-slider mb-3" data-studio="insp-slider">
      <label htmlFor={id} className={`studio-insp-slider-name ${LABEL}`} style={META_FONT}>
        {label}
      </label>
      <span aria-hidden="true" className="studio-insp-slider-value text-[11px] text-amber-300/80" style={META_FONT}>
        {display}
      </span>
      <input
        id={id}
        className="studio-range studio-insp-slider-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={display}
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
      <div className={`mb-1 flex items-center justify-between ${LABEL}`} style={META_FONT}>
        <span>activity</span>
        <span>{Math.round(level * 100)}%</span>
      </div>
      <VUMeter level={level} label="Narration and recording activity" />
      <p className={`mt-1.5 ${NOTE}`}>
        Activity envelope, not a calibrated meter: the engine exposes no analyser tap and the
        studio will not open a second microphone stream to fake one.
      </p>
    </div>
  );
}

/** T17's switch: a native checkbox with the switch role, s09's 34×20 track and 14px knob. */
const SWITCH =
  "sk-focus relative h-5 w-[34px] flex-none cursor-pointer appearance-none rounded-full bg-white/14 transition-colors duration-300 ease-out before:absolute before:top-[3px] before:left-[3px] before:size-[14px] before:rounded-full before:bg-white before:shadow-[0_2px_6px_rgba(0,0,0,0.35)] before:transition-transform before:duration-300 before:ease-out checked:bg-ss-gold checked:before:translate-x-[14px] motion-reduce:transition-none motion-reduce:before:transition-none";

/**
 * A labelled switch row (T17's pattern): a native checkbox with the switch
 * role, so Space toggles it and a screen reader says "switch, on"; the whole
 * label row is the target (44px on a sheet, 36px docked).
 */
function SwitchRow({
  id,
  label,
  on,
  onChange,
  describedBy,
  labelClassName = "text-[12px] leading-none text-ss-fg-3",
}: {
  id: string;
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
  describedBy?: string;
  labelClassName?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className={`flex ${BUTTON_H} flex-1 cursor-pointer items-center ${labelClassName}`}>
        {label}
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={describedBy}
        className={SWITCH}
      />
    </div>
  );
}

/**
 * s09's clean-up row, built: "Evening out each voice" and its switch, at the
 * end of Mix. Named after the publish step, not s09's "Voice clean-up (level,
 * rumble)": no rumble filter is built (M3-PRD OQ 4).
 */
function LevelVoicesSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div data-studio="level-voices" className="mt-1">
      <SwitchRow
        id="insp-level-voices"
        label="Evening out each voice"
        on={on}
        onChange={onChange}
        describedBy="insp-level-voices-note"
      />
      <p id="insp-level-voices-note" className="text-[12px] leading-[1.45] text-ss-fg-3">
        Brings every recording to the same loudness before it becomes AAC. Nothing leaves this
        device to do it.
      </p>
    </div>
  );
}

/** Each mood as the shipped readout reads it: "Hush · D open fourths/fifths · 66 BPM". */
function MoodOptions() {
  return (
    <>
      {MOOD_NAMES.map((name) => (
        <option key={name} value={name} className="bg-[#0b1020]">
          {`${name} · ${moodReadout(name)}`}
        </option>
      ))}
    </>
  );
}

/**
 * MOOD (T24a): this page's mood, then the whole story's. "mood · page N"
 * offers "Same as the story (<Mood>)" and the eight moods; the shipped
 * whole-story select keeps its label, and a mono line beside it says whether
 * it reaches every page or one page has its own (s09: "whole story · …").
 * The page select comes first so the whole-story select is still the stop
 * right before T17's switch.
 */
function MoodRow({
  pageNumber,
  mood,
  pageMood,
  onMood,
  onPageMood,
}: {
  pageNumber: number;
  mood: MoodName;
  pageMood: MoodName | null;
  onMood: (mood: MoodName) => void;
  onPageMood: (mood: MoodName | null) => void;
}) {
  const reach = pageMood ? `whole story · page ${pageNumber} has its own mood` : "whole story · every page";
  return (
    <div data-studio="mood-row">
      <label htmlFor="insp-page-mood" className={`block ${LABEL}`} style={META_FONT}>
        {`mood · page ${pageNumber}`}
      </label>
      <select
        id="insp-page-mood"
        value={pageMood ?? ""}
        onChange={(e) => onPageMood(e.target.value ? (e.target.value as MoodName) : null)}
        className={`sk-focus mt-1 ${CONTROL_H} w-full rounded-xl border border-white/12 bg-black/40 px-3 text-sm text-white`}
      >
        <option value="" className="bg-[#0b1020]">
          {`Same as the story (${mood})`}
        </option>
        <MoodOptions />
      </select>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <label htmlFor="insp-mood" className={`block flex-none ${LABEL}`} style={META_FONT}>
          mood
        </label>
        <span
          id="insp-mood-reach"
          data-studio="mood-reach"
          className="min-w-0 text-right text-[10.5px] leading-tight text-ss-fg-3"
          style={META_FONT}
        >
          {reach}
        </span>
      </div>
      <select
        id="insp-mood"
        value={mood}
        onChange={(e) => onMood(e.target.value as MoodName)}
        aria-describedby="insp-mood-reach"
        className={`sk-focus mt-1 ${CONTROL_H} w-full rounded-xl border border-white/12 bg-black/40 px-3 text-sm text-white`}
      >
        <MoodOptions />
      </select>
    </div>
  );
}

/** How long the pill waits for the typing to pause before it answers (≤ 200 ms). */
const FEELING_DEBOUNCE_MS = 150;
const NO_FEELING: MoodExplanation = { mood: null, matched: null };

/**
 * TYPE A FEELING (T24b, s09): the parent's own words through the shared
 * resolver. The pill answers as they type (debounced, a polite live region
 * that stays mounted so it speaks from the first word); when no word was
 * understood, a line says Wonder is the house default rather than pretending.
 * "Use for page N" (or Enter) and "Use for every page" apply the resolved
 * mood name only: the words live in this field's own state and nowhere else,
 * so they are never in the draft, the manifest or anything sent (no
 * autocomplete history, and spellcheck off so no spelling service reads them).
 */
function FeelingRow({
  pageNumber,
  onForPage,
  onForEveryPage,
}: {
  pageNumber: number;
  onForPage: (mood: MoodName) => void;
  onForEveryPage: (mood: MoodName) => void;
}) {
  const [words, setWords] = React.useState("");
  const [shown, setShown] = React.useState<MoodExplanation>(NO_FEELING);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setShown(explainMood(words)), FEELING_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [words]);

  // The actions read the words as they are now, so Enter straight after
  // typing applies what was typed, not what the pill last showed.
  const current = explainMood(words).mood;
  const Icon = shown.mood ? MOOD_ICON[shown.mood] : null;
  const guessed = shown.mood !== null && shown.matched === null;

  return (
    <div data-studio="feeling-row" className="mt-3">
      <label htmlFor="insp-feeling" className="feeling-label">
        Type a feeling
      </label>
      <div className="feeling-line">
        <input
          id="insp-feeling"
          type="text"
          value={words}
          maxLength={80}
          autoComplete="off"
          spellCheck={false}
          placeholder="a quiet lullaby for bedtime"
          aria-describedby="insp-feeling-note"
          onChange={(e) => setWords(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            if (current) onForPage(current);
          }}
          className="feeling-input sk-focus"
        />
        {shown.mood ? (
          <ArrowRight data-studio="feeling-arrow" aria-hidden="true" className="feeling-arrow" />
        ) : null}
        <span
          data-studio="feeling-result"
          data-mood={shown.mood ?? undefined}
          aria-live="polite"
          className="feeling-pill"
          style={
            shown.mood
              ? ({ "--c": `var(--mood-${shown.mood.toLowerCase()})` } as React.CSSProperties)
              : undefined
          }
        >
          {Icon && shown.mood ? (
            <>
              <Icon aria-hidden="true" />
              {shown.mood}
            </>
          ) : null}
        </span>
      </div>
      <p id="insp-feeling-note" data-studio="feeling-note" aria-live="polite" className="feeling-note">
        {guessed ? "No feeling word we know — Wonder is the house default." : ""}
      </p>
      <div className="feeling-actions">
        <button
          type="button"
          data-studio="feeling-page"
          disabled={!current}
          onClick={() => current && onForPage(current)}
          className={`sk-focus ${BUTTON_H} rounded-xl border border-white/12 bg-white/5 px-2 text-[13px] text-white/75 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/5`}
        >
          {`Use for page ${pageNumber}`}
        </button>
        <button
          type="button"
          data-studio="feeling-every"
          disabled={!current}
          onClick={() => current && onForEveryPage(current)}
          className={`sk-focus ${BUTTON_H} rounded-xl border border-white/12 bg-white/5 px-2 text-[13px] text-white/75 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/5`}
        >
          Use for every page
        </button>
      </div>
    </div>
  );
}

const BADGE_TONE: Record<string, string> = {
  published: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  draft: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  none: "border-white/12 bg-white/5 text-ss-fg-3",
};

export function Inspector(props: InspectorProps) {
  const {
    manifest,
    page,
    pageNumber,
    recordings,
    mood,
    pageMood,
    musicOn,
    musicVolume,
    narrationVolume,
    levelVoices,
    subscribeLevel,
    onAutoPause,
    onApplyPauseToAll,
    onTimingMultiplier,
    onAlt,
    onAuthor,
    onMood,
    onPageMood,
    onFeelingForPage,
    onFeelingForEveryPage,
    onMusicToggle,
    onMusicVolume,
    onNarrationVolume,
    onLevelVoices,
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
          className={`sk-focus ${BUTTON_H} w-full rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white/75 hover:bg-white/10`}
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
          <p className={NOTE}>
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
        {/* s09 draws the bed's on/off as a switch, T17's pattern. */}
        <div data-studio="music-bed" className="mb-2">
          <SwitchRow
            id="insp-music-on"
            label="Music bed"
            on={musicOn}
            onChange={onMusicToggle}
            labelClassName="text-[12.5px] leading-none text-ss-fg-2"
          />
        </div>
        <MoodRow
          pageNumber={pageNumber}
          mood={mood}
          pageMood={pageMood}
          onMood={onMood}
          onPageMood={onPageMood}
        />
        <FeelingRow
          pageNumber={pageNumber}
          onForPage={onFeelingForPage}
          onForEveryPage={onFeelingForEveryPage}
        />

        <ActivityMeter subscribeLevel={subscribeLevel} />
        <LevelVoicesSwitch on={levelVoices} onChange={onLevelVoices} />
      </Section>

      {/* ------------------------------------------------------------- page */}
      <Section title="Page details">
        <label htmlFor="insp-alt" className={`block ${LABEL}`} style={META_FONT}>
          picture description
        </label>
        <input
          id="insp-alt"
          type="text"
          value={page?.illustration?.alt ?? ""}
          onChange={(e) => onAlt(e.target.value)}
          placeholder="A turtle on a green wave"
          className={`sk-focus mt-1 ${CONTROL_H} w-full rounded-xl border border-white/12 bg-black/40 px-3 text-sm text-white placeholder:text-white/25`}
        />
        <label htmlFor="insp-author" className={`mt-3 block ${LABEL}`} style={META_FONT}>
          story by
        </label>
        <input
          id="insp-author"
          type="text"
          value={manifest.metadata.author ?? ""}
          onChange={(e) => onAuthor(e.target.value)}
          placeholder="Ada, age 4"
          className={`sk-focus mt-1 ${CONTROL_H} w-full rounded-xl border border-white/12 bg-black/40 px-3 text-sm text-white placeholder:text-white/25`}
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
          className={`sk-focus mt-3 ${BUTTON_H} w-full rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white/75 hover:bg-white/10`}
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
