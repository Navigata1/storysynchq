"use client";

/**
 * Studio state model.
 *
 * The SSYNC manifest is the single source of truth (design-direction §7): the
 * Stage renders from the same `SsyncManifest` the Player consumes. Everything
 * that is *not* protocol — draft codec bookkeeping, mix levels, chosen mood —
 * lives beside it in StudioState and never leaks into a published manifest.
 */

import type { MoodName } from "@/lib/audio/moods";
import type { SsyncManifest, SsyncPage } from "@/lib/storysync/manifest";

/* ------------------------------------------------------------------ moods */

/**
 * The mood vocabulary is NOT the Studio's to invent. `@/lib/audio/moods` owns
 * it — the same eight names the Player resolves and the same specs the
 * generative bed plays — so a mood chosen here is the mood a listener hears
 * (docs/10x-plan.md gap G4). The Studio only adds presentation (emoji, pill
 * colours) in ./moods-ui.
 */
export { MOOD_NAMES } from "@/lib/audio/moods";
export type { MoodName } from "@/lib/audio/moods";

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
  /**
   * Every story id this tape has ever been saved under, so "delete everything"
   * can reach copies an older build orphaned. Current builds upsert, so this
   * normally holds exactly one id.
   */
  publishedIds: string[];
  /** When this tape was started, on this device. Feeds "Made in m:ss". */
  startedAt: string;
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
    publishedIds: [],
    startedAt: new Date().toISOString(),
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

/** Does any page carry a recorded human voice? Consent hangs off this. */
export function storyHasNarration(manifest: SsyncManifest): boolean {
  return manifest.pages.some((p) => Boolean(p.text?.audioUrl));
}

/**
 * The cover for a published manifest — or nothing.
 *
 * `metadata.coverImage` used to be set to the first illustration found, which
 * on the common story is page 1's photo: a second multi-megabyte copy of the
 * same data URL in every save, every draft and every .storysync file. A cover
 * is only worth carrying when it is not already page 1.
 */
export function pickCoverImage(pages: SsyncPage[]): string | undefined {
  const first = pages[0]?.illustration?.url;
  const found = pages.find((p) => p.illustration?.url)?.illustration?.url;
  if (!found || found === first) return undefined;
  return found;
}

export function storyHasContent(state: StudioState): boolean {
  const { manifest } = state;
  if (manifest.metadata.title.trim() && manifest.metadata.title !== DEFAULT_TITLE) return true;
  if (manifest.metadata.author?.trim()) return true;
  return manifest.pages.some(pageHasContent);
}

/**
 * Duration strings from the protocol → seconds.
 *
 *   "2.5s" → 2.5 · "450ms" → 0.45 · "2" → 2 · junk → fallback
 *
 * The `ms` case is the one that matters: a manifest that asks for a 450 **ms**
 * pause used to hold the page for seven and a half minutes.
 */
export function parseSeconds(value: string | undefined, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return fallback;
  const n = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return fallback;
  if (/\d\s*ms\b/.test(raw) || raw.endsWith("ms")) return n / 1000;
  if (/\d\s*min\b/.test(raw) || raw.endsWith("m")) return n * 60;
  return n;
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

/**
 * Serialized size of the manifest, memoized per manifest object.
 *
 * A story with photos and voice is several megabytes of data URLs; the
 * inspector used to `JSON.stringify` the whole thing on every render, which at
 * 15 meter frames a second is tens of MB of garbage per second. Manifests are
 * replaced immutably, so a WeakMap keyed on the object is exact: a new object
 * means a new measurement, an unchanged one is free.
 */
const BYTE_CACHE = new WeakMap<SsyncManifest, number>();

export function approxBytes(manifest: SsyncManifest): number {
  const cached = BYTE_CACHE.get(manifest);
  if (cached !== undefined) return cached;
  const size = JSON.stringify(manifest).length;
  BYTE_CACHE.set(manifest, size);
  return size;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
