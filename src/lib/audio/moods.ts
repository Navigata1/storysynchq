// The mood vocabulary — one canonical list for the whole product.
//
// `page.music` in an SSYNC manifest is a free string ("Mood name or track ID",
// public/protocol/v2.schema.json). Studio writes one of the eight names below;
// hand-written and imported manifests write whatever they like. This module is
// the single place that turns any of that into (a) a name the product agrees on
// and (b) a musical specification the generative bed can actually play.
//
//   resolveMood(value) → MoodName | null      null means SILENCE, never a bed
//   MOODS[name]        → MoodSpec             scale, tempo, pad, arpeggio, hiss
//
// Compatibility: `MoodSpec` also carries the legacy `MoodConfig` fields
// (freq1/freq2/gainMult) that `DualBusAudioEngine` has always taken, so every
// existing caller keeps compiling and keeps its mix level.

/* ─────────────────────────────────────────────────────────── vocabulary */

export type MoodName =
  | "Wonder"
  | "Adventure"
  | "Calm"
  | "Joy"
  | "Hush"
  | "Rain"
  | "Suspense"
  | "Melancholy";

export const MOOD_NAMES: readonly MoodName[] = [
  "Wonder",
  "Adventure",
  "Calm",
  "Joy",
  "Hush",
  "Rain",
  "Suspense",
  "Melancholy",
] as const;

/* ───────────────────────────────────────────────────────────── the spec */

/**
 * The legacy engine mood shape — two near-unison oscillator frequencies and a
 * level multiplier. Kept exactly as it was so `StudioMood extends MoodConfig`
 * and every `startMusic(MOOD_CONFIGS[x])` call site still type-checks.
 * `name` is the new, unambiguous way to say which mood is meant.
 */
export interface MoodConfig {
  freq1: number;
  freq2: number;
  gainMult: number;
  /** Canonical mood name when the caller knows it. New code should set it. */
  name?: MoodName;
}

/** The soft pad underneath — filtered, detuned, breathing on a slow LFO. */
export interface PadSpec {
  type: OscillatorType;
  /** ± detune of the two pad voices, in cents. */
  detuneCents: number;
  /** Lowpass corner, Hz — the pad is felt, not heard. */
  filterHz: number;
  /** Breathing rate, Hz (well under 1 — this is a swell, not a tremolo). */
  lfoHz: number;
  /** LFO depth as a fraction of the pad's gain. */
  lfoDepth: number;
  /** Linear peak gain of the pad layer. */
  gain: number;
  /** Gain of an added fifth above the root (0 = none). */
  fifth: number;
}

/** The music box / celesta line on top — the part a child hums back. */
export interface ArpSpec {
  type: OscillatorType;
  /**
   * One 4/4 bar of eighth-note velocities; 0 is a rest. The rhythm is fixed
   * (so the bed is loopable and the note count is provable); the *pitches* are
   * where the gentle randomness lives.
   */
  pattern: readonly number[];
  /** Linear peak gain of a note at velocity 1. */
  gain: number;
  /** Seconds for a note to decay away. */
  decay: number;
  /** Octaves above `root` the music box sits in. */
  octaves: readonly number[];
  /** ± humanising detune, cents. */
  jitterCents: number;
  /** ± humanising timing slop, seconds. */
  jitterS: number;
}

export interface MoodSpec extends MoodConfig {
  name: MoodName;
  /** Child-facing description; the Studio may show its own copy instead. */
  blurb: string;
  /** Tonic of the pad, Hz. */
  root: number;
  scaleName: string;
  /** Semitone offsets from the tonic, ascending, within one octave. */
  scale: readonly number[];
  /** Beats per minute. `pattern` steps are eighth notes: 30 / tempo seconds. */
  tempo: number;
  pad: PadSpec;
  arp: ArpSpec;
  /** Soft filtered-noise "tape hiss" bed at −40 dB. */
  hiss: boolean;
}

/* ────────────────────────────────────────────────────────────── the beds */

export const MOODS: Record<MoodName, MoodSpec> = {
  Wonder: {
    name: "Wonder",
    blurb: "Twinkly, a little magic in the air",
    root: 220, // A3
    scaleName: "A major pentatonic",
    scale: [0, 2, 4, 7, 9],
    tempo: 76,
    pad: { type: "triangle", detuneCents: 7, filterHz: 520, lfoHz: 0.07, lfoDepth: 0.35, gain: 0.085, fifth: 0.45 },
    arp: {
      type: "triangle",
      pattern: [1, 0, 0.72, 0.85, 0, 0.75, 0, 0.62],
      gain: 0.15,
      decay: 2.4,
      octaves: [2, 3],
      jitterCents: 6,
      jitterS: 0.012,
    },
    hiss: true,
    freq1: 220,
    freq2: 220.5,
    gainMult: 1.0,
  },
  Adventure: {
    name: "Adventure",
    blurb: "Bold, off we go",
    root: 164.81, // E3 (the legacy drone sat an octave up at 330)
    scaleName: "E major hexatonic",
    scale: [0, 2, 4, 7, 9, 11],
    tempo: 104,
    pad: { type: "sawtooth", detuneCents: 9, filterHz: 340, lfoHz: 0.11, lfoDepth: 0.3, gain: 0.07, fifth: 0.5 },
    arp: {
      type: "triangle",
      pattern: [1, 0, 0.8, 0, 0.9, 0.7, 0, 0.75],
      gain: 0.14,
      decay: 1.6,
      octaves: [2, 3],
      jitterCents: 5,
      jitterS: 0.01,
    },
    hiss: false,
    freq1: 330,
    freq2: 331,
    gainMult: 1.7,
  },
  Calm: {
    name: "Calm",
    blurb: "Soft and sleepy, for bedtime",
    root: 110, // A2
    scaleName: "A sus pentatonic (no third)",
    scale: [0, 2, 5, 7, 9],
    tempo: 62,
    pad: { type: "triangle", detuneCents: 5, filterHz: 420, lfoHz: 0.05, lfoDepth: 0.4, gain: 0.09, fifth: 0.55 },
    arp: {
      type: "sine",
      pattern: [0.9, 0, 0.6, 0.7, 0, 0.65, 0, 0.55],
      gain: 0.13,
      decay: 3.2,
      octaves: [3, 4],
      jitterCents: 4,
      jitterS: 0.014,
    },
    hiss: true,
    freq1: 110,
    freq2: 110.3,
    gainMult: 0.5,
  },
  Joy: {
    name: "Joy",
    blurb: "Bright and skipping",
    root: 220, // A3 (the legacy drone sat an octave up at 440)
    scaleName: "A major pentatonic",
    scale: [0, 2, 4, 7, 9],
    tempo: 116,
    pad: { type: "triangle", detuneCents: 8, filterHz: 620, lfoHz: 0.13, lfoDepth: 0.25, gain: 0.075, fifth: 0.4 },
    arp: {
      type: "triangle",
      pattern: [1, 0, 0.8, 0.75, 0, 0.85, 0.7, 0],
      gain: 0.15,
      decay: 1.4,
      octaves: [2, 3],
      jitterCents: 6,
      jitterS: 0.009,
    },
    hiss: false,
    freq1: 440,
    freq2: 441,
    gainMult: 1.3,
  },
  Hush: {
    name: "Hush",
    blurb: "Quiet and curious — almost a whisper",
    root: 146.83, // D3
    scaleName: "D open fourths/fifths",
    scale: [0, 2, 7, 9],
    tempo: 66,
    pad: { type: "sine", detuneCents: 4, filterHz: 380, lfoHz: 0.04, lfoDepth: 0.45, gain: 0.075, fifth: 0.35 },
    arp: {
      type: "sine",
      pattern: [0.8, 0, 0.5, 0.6, 0, 0.55, 0, 0.5],
      gain: 0.11,
      decay: 2.8,
      octaves: [3, 4],
      jitterCents: 4,
      jitterS: 0.016,
    },
    hiss: true,
    freq1: 146.83,
    freq2: 147.1,
    gainMult: 0.45,
  },
  Rain: {
    name: "Rain",
    blurb: "Grey-sky weather, warm indoors",
    root: 130.81, // C3
    scaleName: "C minor pentatonic",
    scale: [0, 3, 5, 7, 10],
    tempo: 72,
    pad: { type: "triangle", detuneCents: 6, filterHz: 300, lfoHz: 0.06, lfoDepth: 0.4, gain: 0.085, fifth: 0.5 },
    arp: {
      type: "sine",
      pattern: [0.7, 0, 0.6, 0, 0.65, 0.5, 0, 0.55],
      gain: 0.12,
      decay: 2.6,
      octaves: [3, 4],
      jitterCents: 7,
      jitterS: 0.018,
    },
    hiss: true,
    freq1: 130.81,
    freq2: 131.2,
    gainMult: 0.6,
  },
  Suspense: {
    name: "Suspense",
    blurb: "Something is about to happen",
    root: 155, // ≈ E♭3, the legacy suspense drone
    scaleName: "E♭ minor with a flat sixth",
    scale: [0, 2, 3, 7, 8],
    tempo: 64,
    pad: { type: "sawtooth", detuneCents: 11, filterHz: 260, lfoHz: 0.09, lfoDepth: 0.5, gain: 0.08, fifth: 0.3 },
    arp: {
      type: "triangle",
      pattern: [0.7, 0, 0.45, 0.6, 0, 0.55, 0.5, 0],
      gain: 0.11,
      decay: 2.2,
      octaves: [2, 3],
      jitterCents: 9,
      jitterS: 0.02,
    },
    hiss: true,
    freq1: 155,
    freq2: 156,
    gainMult: 1.0,
  },
  Melancholy: {
    name: "Melancholy",
    blurb: "Wistful, a little bit of missing someone",
    root: 185, // F#3
    scaleName: "F♯ minor pentatonic with a flat sixth",
    scale: [0, 3, 5, 8, 10],
    tempo: 68,
    pad: { type: "triangle", detuneCents: 6, filterHz: 330, lfoHz: 0.05, lfoDepth: 0.4, gain: 0.085, fifth: 0.45 },
    arp: {
      type: "sine",
      pattern: [0.75, 0, 0.55, 0, 0.6, 0.5, 0, 0.55],
      gain: 0.12,
      decay: 3.0,
      octaves: [2, 3],
      jitterCents: 5,
      jitterS: 0.015,
    },
    hiss: true,
    freq1: 185,
    freq2: 185.5,
    gainMult: 0.8,
  },
};

/* ─────────────────────────────────────────────────────────── resolution */

/**
 * Everything a manifest might plausibly say, mapped onto a bed. Keys are
 * normalised (lower case, no punctuation). The Player's old table, the
 * Studio's names and the plan's required synonyms are all in here.
 */
const SYNONYMS: Record<string, MoodName> = {
  // Wonder
  magic: "Wonder",
  magical: "Wonder",
  enchanted: "Wonder",
  dream: "Wonder",
  dreamy: "Wonder",
  star: "Wonder",
  starry: "Wonder",
  twinkle: "Wonder",
  sparkle: "Wonder",
  curious: "Wonder",
  whimsy: "Wonder",
  whimsical: "Wonder",
  imagination: "Wonder",
  mystical: "Wonder",
  // Adventure
  courage: "Adventure",
  courageous: "Adventure",
  brave: "Adventure",
  bold: "Adventure",
  hero: "Adventure",
  heroic: "Adventure",
  epic: "Adventure",
  action: "Adventure",
  quest: "Adventure",
  journey: "Adventure",
  explore: "Adventure",
  exciting: "Adventure",
  chase: "Adventure",
  march: "Adventure",
  // Calm
  peace: "Calm",
  peaceful: "Calm",
  gentle: "Calm",
  serene: "Calm",
  soft: "Calm",
  still: "Calm",
  sleep: "Calm",
  sleepy: "Calm",
  bedtime: "Calm",
  night: "Calm",
  ocean: "Calm",
  restful: "Calm",
  // Joy
  happy: "Joy",
  bright: "Joy",
  cheerful: "Joy",
  cheery: "Joy",
  sunny: "Joy",
  playful: "Joy",
  fun: "Joy",
  celebration: "Joy",
  party: "Joy",
  silly: "Joy",
  dance: "Joy",
  skip: "Joy",
  // Hush
  quiet: "Hush",
  lullaby: "Hush",
  whisper: "Hush",
  whispered: "Hush",
  hushed: "Hush",
  tiptoe: "Hush",
  secret: "Hush",
  library: "Hush",
  murmur: "Hush",
  // Rain
  storm: "Rain",
  stormy: "Rain",
  rainy: "Rain",
  drizzle: "Rain",
  shower: "Rain",
  thunder: "Rain",
  grey: "Rain",
  gray: "Rain",
  umbrella: "Rain",
  puddle: "Rain",
  weather: "Rain",
  // Suspense
  scary: "Suspense",
  tense: "Suspense",
  mystery: "Suspense",
  mysterious: "Suspense",
  dark: "Suspense",
  spooky: "Suspense",
  creepy: "Suspense",
  danger: "Suspense",
  dangerous: "Suspense",
  eerie: "Suspense",
  shadow: "Suspense",
  ominous: "Suspense",
  thrill: "Suspense",
  // Melancholy
  sad: "Melancholy",
  wistful: "Melancholy",
  reflective: "Melancholy",
  blue: "Melancholy",
  lonely: "Melancholy",
  longing: "Melancholy",
  tender: "Melancholy",
  bittersweet: "Melancholy",
  goodbye: "Melancholy",
  missing: "Melancholy",
  autumn: "Melancholy",
};

const BY_LOWER_NAME: Record<string, MoodName> = MOOD_NAMES.reduce<Record<string, MoodName>>(
  (acc, name) => {
    acc[name.toLowerCase()] = name;
    return acc;
  },
  {},
);

/** Lower case, punctuation → spaces, collapsed whitespace. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isMoodName(value: unknown): value is MoodName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MOODS, value);
}

/**
 * The one function everything else asks.
 *
 *   undefined | null | ""      → null   (silence — do NOT start a bed)
 *   a mood name, any casing    → that mood
 *   a known synonym            → its mood
 *   a phrase containing one    → that mood ("a bit scary" → Suspense)
 *   anything else non-empty    → Wonder (the house default; never silence)
 *
 * "Empty" is judged after normalisation: a value with no letters or digits
 * at all ("!!", "🎵") is treated as empty and resolves to silence, not Wonder.
 */
export function resolveMood(value: string | null | undefined): MoodName | null {
  if (typeof value !== "string") return null;
  const key = normalise(value);
  if (!key) return null;

  const direct = BY_LOWER_NAME[key] ?? SYNONYMS[key];
  if (direct) return direct;

  // A phrase: take the most specific word that matches. "Specific" = longest,
  // so "soft lullaby music" is a lullaby (Hush) rather than merely soft (Calm),
  // and ties go to the first one written.
  let found: MoodName | null = null;
  let foundLength = 0;
  for (const token of key.split(" ")) {
    const hit = BY_LOWER_NAME[token] ?? SYNONYMS[token];
    if (hit && token.length > foundLength) {
      found = hit;
      foundLength = token.length;
    }
  }
  return found ?? "Wonder";
}

/** `resolveMood`, but never silent — for callers that already decided to play. */
export function moodSpec(value: string | null | undefined): MoodSpec {
  return MOODS[resolveMood(value) ?? "Wonder"];
}

/**
 * Bridge for callers still passing the legacy `{freq1, freq2, gainMult}` pad
 * config (the classic reader, and the Player/Studio tables until they move to
 * this module). Matches on `name` when present, otherwise on the drone
 * frequency the product has always used for that mood.
 *
 * Known ambiguity: `src/components/studio/types.ts` currently gives its `Hush`
 * the old Suspense frequencies (155/156) and its `Rain` the old Melancholy ones
 * (185/185.5), so those two legacy configs resolve to Suspense/Melancholy until
 * WP-S switches the Studio table over to `name`. Wrong bed, never a crash.
 */
export function specForConfig(input: MoodConfig | MoodName | string): MoodSpec {
  if (typeof input === "string") return moodSpec(input);
  if (isMoodName(input.name)) return MOODS[input.name];

  const freq = typeof input.freq1 === "number" && Number.isFinite(input.freq1) ? input.freq1 : NaN;
  let best: MoodSpec = MOODS.Wonder;
  if (Number.isFinite(freq)) {
    let bestDelta = Infinity;
    for (const name of MOOD_NAMES) {
      const spec = MOODS[name];
      const delta = Math.abs(spec.freq1 - freq);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = spec;
      }
    }
  }
  // Legacy callers own their mix level; keep whatever they asked for.
  return typeof input.gainMult === "number" && input.gainMult !== best.gainMult
    ? { ...best, gainMult: input.gainMult }
    : best;
}

/**
 * How many arpeggio notes a mood schedules in `seconds` — the rhythm is fixed,
 * so this is exact, and the melody bar ("≥ 8 onsets in 8 s") is provable
 * without rendering anything.
 */
export function expectedOnsets(spec: MoodSpec, seconds: number): number {
  const stepDur = 30 / spec.tempo; // an eighth note
  const steps = Math.max(0, Math.ceil(seconds / stepDur));
  let count = 0;
  for (let i = 0; i < steps; i++) {
    if (spec.arp.pattern[i % spec.arp.pattern.length] > 0) count++;
  }
  return count;
}
