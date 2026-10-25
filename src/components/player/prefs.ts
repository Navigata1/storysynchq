/**
 * Reader preferences: how a page reads for this viewer, and what is stored.
 *
 * Each preference resolves field by field: the viewer's explicit choice wins,
 * else the tape's author default (`settings.accessibility`), else the product
 * default (docs/format-spec.md §4). The author can set two defaults:
 * `highContrast` (contrast) and `dyslexiaFont` (easier-to-read text).
 * `timingMultiplier` keeps its shipped job: it scales every pause, and the
 * viewer's "Pause between pages" multiplies on top (see `pauseMultiplier`).
 *
 * Only the viewer's explicit choices are stored, on this device only, under
 * `ssync-reader-prefs`, in a sparse shape with a version marker (`v`). Readers
 * before this module wrote a full object on every mount, so a legacy object
 * counts as a choice only where a value differs from the product default.
 *
 * Pure: no React, no DOM, no `@/` aliases. The Player imports it, and
 * `tests/vision-reader-prefs.spec.ts` imports the same module in Node.
 */

export type Speed = "slow" | "normal" | "fast";

export interface ReaderPrefs {
  speed: Speed;
  /** The viewer's multiplier on every between-page pause. */
  timing: number;
  /** Multiplier on story text size. */
  fontScale: number;
  /** Easier-to-read text (sans-serif, wider spacing): `.pl-root.is-dys`. */
  dyslexia: boolean;
  /** High contrast: `.pl-root.is-hc`. */
  contrast: boolean;
}

export type PrefKey = keyof ReaderPrefs;

/** What the viewer has explicitly chosen; an absent field is untouched. */
export type ViewerChoices = Partial<ReaderPrefs>;

/** What a tape asks for in `settings.accessibility`. */
export type AuthorDefaults = Partial<Pick<ReaderPrefs, "contrast" | "dyslexia">>;

/** Where a resolved value came from. "author" is the storyteller's default. */
export type PrefSource = "viewer" | "author" | "default";

export interface ResolvedPrefs {
  prefs: ReaderPrefs;
  source: Record<PrefKey, PrefSource>;
}

/** The sparse stored shape: the version marker plus explicit choices only. */
export type StoredPrefs = ViewerChoices & { v: typeof PREFS_VERSION };

/** The device key (unchanged since the first reader). */
export const PREFS_KEY = "ssync-reader-prefs";
/** Version marker of the sparse stored shape. Legacy objects have no `v`. */
export const PREFS_VERSION = 2;

export const DEFAULT_PREFS: Readonly<ReaderPrefs> = Object.freeze({
  speed: "normal",
  timing: 1,
  fontScale: 1,
  dyslexia: false,
  contrast: false,
});

/** Speed → pause multiplier and browser-voice rate (unchanged). */
export const SPEED_PAUSE: Readonly<Record<Speed, number>> = Object.freeze({ slow: 1.5, normal: 1, fast: 0.6 });
export const SPEED_RATE: Readonly<Record<Speed, number>> = Object.freeze({ slow: 0.7, normal: 0.85, fast: 1.1 });

const KEYS: readonly PrefKey[] = ["speed", "timing", "fontScale", "dyslexia", "contrast"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * The tape's author defaults from `settings.accessibility`. Only `true` asks
 * for anything: `false` is the schema default, so it is the same as absent.
 */
export function authorDefaults(accessibility: unknown): AuthorDefaults {
  if (!isRecord(accessibility)) return {};
  const out: AuthorDefaults = {};
  if (accessibility.highContrast === true) out.contrast = true;
  if (accessibility.dyslexiaFont === true) out.dyslexia = true;
  return out;
}

/** `target[key] = value`, typed per key. */
function assign<K extends PrefKey>(target: Partial<ReaderPrefs>, key: K, value: ReaderPrefs[K]): void {
  target[key] = value;
}

/** Effective preferences: viewer → author → product default, field by field. */
export function resolve(author: AuthorDefaults, viewer: ViewerChoices): ResolvedPrefs {
  const fromAuthor: ViewerChoices = author;
  const prefs: ReaderPrefs = { ...DEFAULT_PREFS };
  const source = {} as Record<PrefKey, PrefSource>;
  for (const key of KEYS) {
    const chosen = viewer[key];
    const asked = fromAuthor[key];
    if (chosen !== undefined) {
      assign(prefs, key, chosen);
      source[key] = "viewer";
    } else if (asked !== undefined) {
      assign(prefs, key, asked);
      source[key] = "author";
    } else {
      source[key] = "default";
    }
  }
  return { prefs, source };
}

/** Valid, clamped values from any object; unknown or invalid fields are dropped. */
function readFields(r: Record<string, unknown>): ViewerChoices {
  const out: ViewerChoices = {};
  if (r.speed === "slow" || r.speed === "normal" || r.speed === "fast") out.speed = r.speed;
  if (typeof r.timing === "number" && Number.isFinite(r.timing)) {
    out.timing = Math.min(3, Math.max(0.5, r.timing));
  }
  if (typeof r.fontScale === "number" && Number.isFinite(r.fontScale)) {
    out.fontScale = Math.min(2, Math.max(0.8, r.fontScale));
  }
  if (typeof r.dyslexia === "boolean") out.dyslexia = r.dyslexia;
  if (typeof r.contrast === "boolean") out.contrast = r.contrast;
  return out;
}

/**
 * The viewer's explicit choices from what is stored: the raw string from
 * localStorage or an already-parsed value. Garbage is no choices.
 */
export function sanitize(stored: unknown): ViewerChoices {
  let raw = stored;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!isRecord(raw)) return {};

  if (raw.v === undefined) {
    // Legacy full object: a value is a choice only where it differs from the default.
    const legacy = readFields(raw);
    const out: ViewerChoices = {};
    for (const key of KEYS) {
      const value = legacy[key];
      if (value !== undefined && value !== DEFAULT_PREFS[key]) assign(out, key, value);
    }
    return out;
  }
  if (typeof raw.v !== "number" || raw.v < PREFS_VERSION) return {};
  return readFields(raw);
}

/** The sparse shape to store: the version marker and only the touched fields. */
export function toStored(choices: ViewerChoices): StoredPrefs {
  return { v: PREFS_VERSION, ...readFields({ ...choices }) };
}

/**
 * Every between-page pause is multiplied by this: the tape's
 * `timingMultiplier` (a positive number, else 1) × the viewer's pause choice ×
 * the reading speed's pause.
 */
export function pauseMultiplier(timingMultiplier: unknown, prefs: ReaderPrefs): number {
  const author =
    typeof timingMultiplier === "number" && Number.isFinite(timingMultiplier) && timingMultiplier > 0
      ? timingMultiplier
      : 1;
  return author * prefs.timing * SPEED_PAUSE[prefs.speed];
}
