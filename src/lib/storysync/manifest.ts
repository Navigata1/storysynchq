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
  /**
   * Consent records for recorded/cloned voices in this story: one record per
   * recorded voice (docs/format-spec.md §7.1).
   */
  voiceConsent?: Array<{
    /** Whose voice, as credited on the tape, e.g. "Ada, age 4 — with Dad". */
    voice: string;
    /**
     * Who consented. Conventionally `"parent/guardian"` (a child's voice) or
     * `"self"` (an adult's own voice); free text is allowed.
     */
    grantedBy: string;
    /**
     * Calendar date of consent, `YYYY-MM-DD`: the consenting device's local
     * date. Older tapes carry a full ISO timestamp; readers accept it and
     * {@link validateManifest} warns.
     */
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

/** Consent dates: a calendar date is what v2.1 asks for; older tapes wrote timestamps. */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/;
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ValidationResult {
  /** `errors.length === 0`. Warnings never make it false. */
  ok: boolean;
  /** Spec violations: the tape must not be packed, opened or published. */
  errors: string[];
  /** Drift from the v2.1 draft that still opens and plays. Never blocks. */
  warnings: string[];
}

export function validateManifest(obj: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const m = obj as Partial<SsyncManifest> | null;

  if (!m || typeof m !== "object") return { ok: false, errors: ["manifest is not an object"], warnings };
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
  warnings.push(...consentWarnings(m));
  return { ok: errors.length === 0, errors, warnings };
}

/** Signature-layer consent checks (v2.1 draft, docs/format-spec.md §7.1). Warnings only. */
function consentWarnings(m: Partial<SsyncManifest>): string[] {
  const warnings: string[] = [];
  const consent = m.signature?.voiceConsent;
  const records = Array.isArray(consent) ? consent : [];

  records.forEach((record, i) => {
    const date: unknown = record?.date;
    if (date === undefined) return;
    if (typeof date === "string" && ISO_TIMESTAMP.test(date)) {
      warnings.push(`signature.voiceConsent[${i}].date is a full timestamp; the v2.1 draft asks for a date`);
    } else if (typeof date !== "string" || !CALENDAR_DATE.test(date)) {
      warnings.push(`signature.voiceConsent[${i}].date "${String(date)}" is not a calendar date (YYYY-MM-DD)`);
    }
  });

  const hasRecordedVoice = Array.isArray(m.pages) && m.pages.some((p) => Boolean(p?.text?.audioUrl));
  if (hasRecordedVoice && records.length === 0) {
    warnings.push(
      "a recorded voice is on this tape but signature.voiceConsent is empty; the v2.1 draft says it SHOULD carry one"
    );
  }
  return warnings;
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
