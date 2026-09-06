// SSYNC v2 manifest — types + validation for the .storysync container.
// The JSON schema twin lives at public/protocol/v2.schema.json; the prose
// spec at docs/format-spec.md. This module is the runtime source of truth.

export interface SsyncIllustration {
  url?: string;
  alt?: string;
  animation?: string;
  animationDuration?: string;
}

export interface SsyncPageText {
  content: string;
  voice?: string;
  /** Narration audio: `assets/...` path inside a container, or data:/https: URL. */
  audioUrl?: string;
  /** Codec of published narration: "aac" (preferred) or "wav" (fallback). */
  audioCodec?: "aac" | "wav";
  wordHighlight?: boolean;
  animation?: string;
  fontSize?: string;
}

export interface SsyncPage {
  id: number;
  layout?: string;
  illustration?: SsyncIllustration;
  text?: SsyncPageText;
  music?: string | { crossfade?: string; duration?: string };
  timing?: { autoPause?: string; readingSpeed?: string; minDuration?: string };
}

/**
 * Signature layer (SSYNC v2.1 draft — additive, optional).
 * Ownership, remix ancestry, and consent travel WITH the story so they survive
 * outside the app. Voice consent is sacred: a published story that contains a
 * recorded human voice SHOULD carry a consent record.
 */
export interface SsyncSignature {
  /** Canonical share URL for this published story, if any. */
  shareUrl?: string;
  /** Ownership statement, e.g. "© 2026 The Isaac Family". */
  ownership?: string;
  /** Share URL or id of the story this one was remixed from. */
  remixOf?: string;
  /** Consent records for recorded/cloned voices in this story. */
  voiceConsent?: Array<{
    /** Whose voice, e.g. "narrator", "Mom". */
    voice: string;
    /** Who consented, e.g. "parent/guardian". */
    grantedBy: string;
    /** ISO date of consent. */
    date?: string;
  }>;
  /** Rights/license note for bundled media, e.g. "personal use". */
  rights?: string;
}

export interface SsyncManifest {
  version: string;
  metadata: {
    title: string;
    author?: string;
    narrator?: string;
    genre?: string;
    ageRange?: string;
    language?: string;
    created?: string;
    description?: string;
    coverImage?: string;
  };
  /** SSYNC v2.1 signature layer (optional, ignored by v2.0 readers). */
  signature?: SsyncSignature;
  settings?: {
    autoPlay?: boolean;
    pageTransition?: string;
    readAlongHighlight?: boolean;
    orientation?: string;
    pageTurnSound?: boolean;
    accessibility?: { timingMultiplier?: number; pauseBetweenPages?: string };
  };
  pages: SsyncPage[];
}

export const SSYNC_VERSION = "2.0";
export const MANIFEST_FILENAME = "manifest.json";
export const ASSETS_DIR = "assets/";

/** Codecs allowed for narration in a *published* story. Opus/WebM never is. */
const PUBLISHED_AUDIO_EXT = /\.(m4a|mp4|wav)$/i;
const FORBIDDEN_AUDIO = /\.(webm|ogg|opus)$/i;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateManifest(obj: unknown): ValidationResult {
  const errors: string[] = [];
  const m = obj as Partial<SsyncManifest> | null;

  if (!m || typeof m !== "object") return { ok: false, errors: ["manifest is not an object"] };
  if (typeof m.version !== "string" || !["1.0", "2.0"].includes(m.version)) {
    errors.push(`version must be "1.0" or "2.0", got ${JSON.stringify(m.version)}`);
  }
  if (!m.metadata || typeof m.metadata !== "object" || typeof m.metadata.title !== "string" || !m.metadata.title.trim()) {
    errors.push("metadata.title is required");
  }
  if (!Array.isArray(m.pages) || m.pages.length === 0) {
    errors.push("pages must be a non-empty array");
  } else {
    m.pages.forEach((p, i) => {
      if (!p || typeof p !== "object") {
        errors.push(`pages[${i}] is not an object`);
        return;
      }
      if (typeof p.id !== "number") errors.push(`pages[${i}].id must be a number`);
      const audio = p.text?.audioUrl;
      if (audio && audio.startsWith(ASSETS_DIR)) {
        if (FORBIDDEN_AUDIO.test(audio)) {
          errors.push(
            `pages[${i}].text.audioUrl "${audio}" uses a draft-only codec — published narration must be AAC/M4A (or WAV fallback)`
          );
        } else if (!PUBLISHED_AUDIO_EXT.test(audio)) {
          errors.push(`pages[${i}].text.audioUrl "${audio}" must end in .m4a, .mp4, or .wav`);
        }
      }
    });
  }
  return { ok: errors.length === 0, errors };
}

/** Referenced in-container asset paths (for pack/unpack integrity checks). */
export function referencedAssets(manifest: SsyncManifest): string[] {
  const refs = new Set<string>();
  const add = (u?: string) => {
    if (u && u.startsWith(ASSETS_DIR)) refs.add(u);
  };
  add(manifest.metadata.coverImage);
  for (const p of manifest.pages) {
    add(p.illustration?.url);
    add(p.text?.audioUrl);
  }
  return [...refs];
}
