"use client";

/**
 * Studio state model.
 *
 * The SSYNC manifest is the single source of truth (design-direction §7): the
 * Stage renders from the same `SsyncManifest` the Player consumes. Everything
 * that is *not* protocol — draft codec bookkeeping, mix levels, chosen mood —
 * lives beside it in StudioState and never leaks into a published manifest.
 */

import type { MoodConfig } from "@/lib/audio/engine";
import type { SsyncManifest, SsyncPage } from "@/lib/storysync/manifest";

/* ------------------------------------------------------------------ moods */

export interface StudioMood extends MoodConfig {
  emoji: string;
  blurb: string;
  /** Tailwind classes for the mood pill (chrome register). */
  pill: string;
}

/**
 * Story music beds. Frequencies are the proven pad pairs from the classic
 * creator — two near-unison sines through a 400 Hz lowpass, so the beat
 * frequency does the breathing. Copy is ours.
 */
export const STUDIO_MOODS = {
  Wonder: {
    emoji: "🌟",
    blurb: "Twinkly, a little magic in the air",
    freq1: 220,
    freq2: 220.5,
    gainMult: 1.0,
    pill: "border-amber-400/45 bg-amber-500/15 text-amber-200",
  },
  Adventure: {
    emoji: "🧭",
    blurb: "Bold, off we go",
    freq1: 330,
    freq2: 331,
    gainMult: 1.7,
    pill: "border-orange-400/45 bg-orange-500/15 text-orange-200",
  },
  Calm: {
    emoji: "🌙",
    blurb: "Soft and sleepy, for bedtime",
    freq1: 110,
    freq2: 110.3,
    gainMult: 0.5,
    pill: "border-sky-400/45 bg-sky-500/15 text-sky-200",
  },
  Joy: {
    emoji: "☀️",
    blurb: "Bright and skipping",
    freq1: 440,
    freq2: 441,
    gainMult: 1.3,
    pill: "border-yellow-400/45 bg-yellow-500/15 text-yellow-200",
  },
  Hush: {
    emoji: "🌫️",
    blurb: "Quiet and curious",
    freq1: 155,
    freq2: 156,
    gainMult: 1.0,
    pill: "border-violet-400/45 bg-violet-500/15 text-violet-200",
  },
  Rain: {
    emoji: "🌧️",
    blurb: "Wistful, grey-sky feelings",
    freq1: 185,
    freq2: 185.5,
    gainMult: 0.8,
    pill: "border-slate-400/45 bg-slate-500/15 text-slate-200",
  },
} as const satisfies Record<string, StudioMood>;

export type MoodName = keyof typeof STUDIO_MOODS;
export const MOOD_NAMES = Object.keys(STUDIO_MOODS) as MoodName[];

/* ------------------------------------------------------------------ state */

/** Draft-only bookkeeping for a recording that has not been published yet. */
export interface RecordingMeta {
  /** Whatever MediaRecorder negotiated — Opus/WebM on Chrome, AAC/MP4 on Safari. */
  mimeType: string;
  /** Wall-clock seconds. */
  duration: number;
}

export interface PublishRecord {
  id: string;
  shareCode: string | null;
  cloud: boolean;
  at: string;
}

export interface StudioState {
  manifest: SsyncManifest;
  /** page id → draft recording meta. */
  recordings: Record<string, RecordingMeta>;
  mood: MoodName;
  musicOn: boolean;
  /** 0..1, pre-duck. */
  musicVolume: number;
  narrationVolume: number;
  published: PublishRecord | null;
}

export const DEFAULT_TITLE = "My Story";
export const DEFAULT_AUTO_PAUSE_S = 2;

/* ---------------------------------------------------------------- factories */

export function blankPage(id: number): SsyncPage {
  return {
    id,
    layout: "image-top",
    illustration: { alt: "" },
    text: { content: "", wordHighlight: true },
    timing: { autoPause: `${DEFAULT_AUTO_PAUSE_S}s` },
  };
}

export function blankManifest(): SsyncManifest {
  return {
    version: "2.0",
    metadata: {
      title: DEFAULT_TITLE,
      author: "",
      language: "en",
      created: new Date().toISOString(),
    },
    settings: {
      autoPlay: true,
      pageTransition: "fade",
      readAlongHighlight: true,
      pageTurnSound: true,
      accessibility: { timingMultiplier: 1 },
    },
    pages: [blankPage(1)],
  };
}

export function blankState(): StudioState {
  return {
    manifest: blankManifest(),
    recordings: {},
    mood: "Wonder",
    musicOn: true,
    musicVolume: 0.3,
    narrationVolume: 0.85,
    published: null,
  };
}

/* ----------------------------------------------------------------- helpers */

export function nextPageId(manifest: SsyncManifest): number {
  return manifest.pages.reduce((max, p) => Math.max(max, p.id), 0) + 1;
}

export function updatePage(
  manifest: SsyncManifest,
  id: number,
  fn: (page: SsyncPage) => SsyncPage,
): SsyncManifest {
  return { ...manifest, pages: manifest.pages.map((p) => (p.id === id ? fn(p) : p)) };
}

export function pageHasContent(page: SsyncPage): boolean {
  return Boolean(page.illustration?.url || page.text?.content?.trim() || page.text?.audioUrl);
}

export function storyHasContent(state: StudioState): boolean {
  const { manifest } = state;
  if (manifest.metadata.title.trim() && manifest.metadata.title !== DEFAULT_TITLE) return true;
  if (manifest.metadata.author?.trim()) return true;
  return manifest.pages.some(pageHasContent);
}

/** "2.5s" → 2.5. Tolerates plain numbers and junk. */
export function parseSeconds(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseFloat(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

export function autoPauseOf(page: SsyncPage): number {
  return parseSeconds(page.timing?.autoPause, DEFAULT_AUTO_PAUSE_S);
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const WORDS_PER_MINUTE = 145;

/** Recorded seconds where we have them, a reading estimate where we don't. */
export function estimateStorySeconds(state: StudioState): number {
  return state.manifest.pages.reduce((total, page) => {
    const meta = state.recordings[String(page.id)];
    if (meta?.duration) return total + meta.duration;
    const words = page.text?.content?.trim().split(/\s+/).filter(Boolean).length ?? 0;
    return total + (words / WORDS_PER_MINUTE) * 60 + autoPauseOf(page);
  }, 0);
}

export type PublishCodec = "aac" | "wav";

export interface CodecBadge {
  label: string;
  tone: "published" | "draft" | "none";
  hint: string;
}

/**
 * What the inspector shows per page. Draft Opus is *expected* — it is what
 * Chrome records — and it is normalized at publish, never shipped.
 */
export function codecBadge(
  audioUrl: string | undefined,
  audioCodec: PublishCodec | undefined,
  meta: RecordingMeta | undefined,
): CodecBadge {
  if (!audioUrl) {
    return { label: "no voice", tone: "none", hint: "This page reads with the browser voice." };
  }
  if (audioCodec === "aac") {
    return { label: "AAC · M4A", tone: "published", hint: "Publish-compliant. Plays everywhere." };
  }
  if (audioCodec === "wav") {
    return { label: "WAV", tone: "published", hint: "Permitted fallback when AAC encoding is unavailable." };
  }
  const mime = (meta?.mimeType || "").toLowerCase();
  if (mime.includes("mp4") || mime.includes("aac")) {
    return { label: "draft · AAC", tone: "draft", hint: "Safari recorded AAC — publish is a passthrough." };
  }
  if (mime.includes("webm") || mime.includes("opus")) {
    return { label: "draft · Opus", tone: "draft", hint: "Draft only. Normalized to AAC/M4A when you finish." };
  }
  return { label: "draft", tone: "draft", hint: "Normalized to AAC/M4A when you finish." };
}

/** Big JSON with data URLs inlined is unreadable — show the shape, not the bytes. */
export function readableManifestJson(manifest: SsyncManifest): string {
  const shorten = (url: string | undefined): string | undefined => {
    if (!url) return url;
    if (!url.startsWith("data:")) return url;
    const head = url.slice(0, url.indexOf(",") + 1) || "data:,";
    const kb = Math.round((url.length * 0.75) / 1024);
    return `${head}…${kb} KB`;
  };
  const clone: SsyncManifest = JSON.parse(JSON.stringify(manifest));
  clone.metadata.coverImage = shorten(clone.metadata.coverImage);
  for (const page of clone.pages) {
    if (page.illustration?.url) page.illustration.url = shorten(page.illustration.url);
    if (page.text?.audioUrl) page.text.audioUrl = shorten(page.text.audioUrl);
  }
  return JSON.stringify(clone, null, 2);
}

export function approxBytes(manifest: SsyncManifest): number {
  return JSON.stringify(manifest).length;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
