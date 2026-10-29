// "Evening out each voice" — loudness levelling for published narration (T17).
//
// A child whispers one page and shouts the next; the listener turns the phone
// up for the first and is blasted by the second. Before a recording becomes
// AAC (or the WAV fallback) it is measured and brought to one target
// loudness, and a gentle limiter keeps the boosted peaks from clipping.
//
//   activeRmsDb   RMS over 50 ms windows, ignoring windows under −50 dBFS
//                 (the gaps between words are not the voice)
//   levelGainDb   the gain to −20 dBFS, clamped to [−12, +18] dB, and none
//                 at all within ±0.5 dB of the target or for silence
//   applyGainAndLimit
//                 the gain, then a soft knee from −6 dBFS that never passes
//                 −1 dBFS; below the knee the gain is exactly linear
//   levelPcm      all three, re-measured so the result sits on the target
//   levelWav      16-bit PCM mono WAV levelled in place: same header, same
//                 rate, same length; anything else is the decoder's job
//
// Pure: Float32Array and Uint8Array in, the same out. No DOM, no Web Audio,
// no dependencies, so it runs in Node tests and in the browser alike, and a
// child's voice never has to leave the device to be levelled.

/** Where every voice lands: active-speech RMS, dBFS. */
export const LEVEL_TARGET_DBFS = -20;
/** The most a loud take is turned down, dB. */
export const LEVEL_MIN_GAIN_DB = -12;
/**
 * The most a quiet take is turned up, dB. T17 proposed +15, but a whisper
 * that peaks at −26 dBFS measures about −37 dBFS of active speech (speech
 * peaks sit 11–12 dB over its RMS), so +15 would leave it 2 dB short of the
 * target. +18 reaches a whisper down to −38 dBFS, and the −50 dBFS gate
 * still keeps a near-silent room from being boosted at all.
 */
export const LEVEL_MAX_GAIN_DB = 18;
/** A take this close to the target is left exactly as recorded, dB. */
export const LEVEL_DEADBAND_DB = 0.5;
/** Where the limiter starts to bend, dBFS. */
export const LEVEL_KNEE_DBFS = -6;
/** What no sample ever passes, dBFS. */
export const LEVEL_CEILING_DBFS = -1;
/** Windows quieter than this are pauses, not speech, dBFS. */
export const LEVEL_GATE_DBFS = -50;
/** Measuring window, seconds. */
export const LEVEL_WINDOW_S = 0.05;

export type LevelOutcome = "applied" | "unchanged";

export interface LevelledPcm {
  /** The levelled samples, or the very array passed in when unchanged. */
  pcm: Float32Array;
  /** The gain applied, dB; 0 when unchanged. */
  gainDb: number;
  outcome: LevelOutcome;
}

export interface LevelledWav {
  /** The levelled file, or the very bytes passed in when unchanged. */
  bytes: Uint8Array;
  gainDb: number;
  outcome: LevelOutcome;
}

const KNEE = 10 ** (LEVEL_KNEE_DBFS / 20);
const CEILING = 10 ** (LEVEL_CEILING_DBFS / 20);
const KNEE_SPAN = CEILING - KNEE;
/** The hard stop, a hair under the ceiling so float32 rounding cannot push past it. */
const CEILING_F32 = Math.fround(CEILING * (1 - 1e-6));
/** Re-measure passes in levelPcm, and how close counts as on target, dB. */
const SETTLE_PASSES = 4;
const SETTLE_DB = 0.1;

export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

function clampGain(db: number): number {
  return Math.min(LEVEL_MAX_GAIN_DB, Math.max(LEVEL_MIN_GAIN_DB, db));
}

/**
 * RMS of the voice in dBFS: 50 ms windows, any window under −50 dBFS left out
 * (pauses and room tone), the rest pooled sample by sample. `-Infinity` when
 * nothing reaches the gate — an all-silent take.
 */
export function activeRmsDb(pcm: Float32Array, rate: number): number {
  const size = Math.max(1, Math.round(rate * LEVEL_WINDOW_S));
  const gate = 10 ** (LEVEL_GATE_DBFS / 10); // mean square at the gate
  let energy = 0;
  let count = 0;
  for (let start = 0; start < pcm.length; start += size) {
    const end = Math.min(pcm.length, start + size);
    let sum = 0;
    for (let i = start; i < end; i++) {
      const x = pcm[i];
      if (Number.isFinite(x)) sum += x * x;
    }
    if (sum / (end - start) >= gate) {
      energy += sum;
      count += end - start;
    }
  }
  if (count === 0 || energy === 0) return -Infinity;
  return 10 * Math.log10(energy / count);
}

/**
 * The gain that brings a voice measured at `rmsDb` to −20 dBFS, clamped to
 * [−12, +18] dB. 0 — leave it as recorded — within ±0.5 dB of the target and
 * for silence.
 */
export function levelGainDb(rmsDb: number): number {
  if (!Number.isFinite(rmsDb)) return 0;
  const gain = clampGain(LEVEL_TARGET_DBFS - rmsDb);
  return Math.abs(gain) < LEVEL_DEADBAND_DB ? 0 : gain;
}

/**
 * The gain, then a soft-knee limiter: a sample under −6 dBFS after the gain is
 * exactly `x · gain`; above it the curve bends (a tanh, slope 1 at the knee)
 * towards −1 dBFS and never reaches past it. Returns new samples.
 */
export function applyGainAndLimit(pcm: Float32Array, gainDb: number): Float32Array {
  const g = dbToGain(gainDb);
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    const x = pcm[i];
    const y = Number.isFinite(x) ? x * g : 0;
    const a = Math.abs(y);
    if (a <= KNEE) {
      out[i] = y;
    } else {
      const bent = KNEE + KNEE_SPAN * Math.tanh((a - KNEE) / KNEE_SPAN);
      out[i] = Math.sign(y) * Math.min(bent, CEILING_F32);
    }
  }
  return out;
}

/**
 * Level one mono take. The gain comes from `activeRmsDb`; the output is then
 * re-measured and the gain nudged (within the clamp) until it sits within
 * 0.1 dB of the target, because the limiter shaves a little off a peaky voice
 * and a boost lifts some once-quiet windows over the gate. That is also why a
 * second pass over a levelled take finds nothing to do.
 */
export function levelPcm(pcm: Float32Array, rate: number): LevelledPcm {
  const measured = activeRmsDb(pcm, rate);
  let gainDb = levelGainDb(measured);
  if (gainDb === 0) return { pcm, gainDb: 0, outcome: "unchanged" };

  let out = applyGainAndLimit(pcm, gainDb);
  for (let pass = 0; pass < SETTLE_PASSES; pass++) {
    const miss = LEVEL_TARGET_DBFS - activeRmsDb(out, rate);
    if (!Number.isFinite(miss) || Math.abs(miss) < SETTLE_DB) break;
    const next = clampGain(gainDb + miss);
    if (next === gainDb) break; // at the clamp: as close as it is allowed to get
    gainDb = next;
    out = applyGainAndLimit(pcm, gainDb);
  }
  return { pcm: out, gainDb, outcome: "applied" };
}

/* ------------------------------------------------------------------- WAV */

interface Pcm16Mono {
  sampleRate: number;
  /** Byte offset of the first sample. */
  dataStart: number;
  /** Whole samples in the data chunk. */
  samples: number;
}

function ascii(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

/** The data chunk of a 16-bit PCM mono WAV, or null for any other layout. */
function findPcm16Mono(bytes: Uint8Array): Pcm16Mono | null {
  if (bytes.length < 12 || ascii(bytes, 0) !== "RIFF" || ascii(bytes, 8) !== "WAVE") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format = -1;
  let channels = 0;
  let bits = 0;
  let sampleRate = 0;
  let data: { start: number; length: number } | null = null;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const id = ascii(bytes, at);
    const length = view.getUint32(at + 4, true);
    if (id === "fmt " && at + 24 <= bytes.length) {
      format = view.getUint16(at + 8, true);
      channels = view.getUint16(at + 10, true);
      sampleRate = view.getUint32(at + 12, true);
      bits = view.getUint16(at + 22, true);
    } else if (id === "data") {
      data = { start: at + 8, length: Math.min(length, bytes.length - at - 8) };
      break;
    }
    at += 8 + length + (length & 1);
  }
  if (format !== 1 || channels !== 1 || bits !== 16 || sampleRate <= 0 || !data) return null;
  return { sampleRate, dataStart: data.start, samples: Math.floor(data.length / 2) };
}

/**
 * Level a 16-bit PCM mono WAV in place: the same header, sample rate and
 * length, only the samples changed. When the take is already on the target
 * (or silent) the very bytes passed in come back. Null for any other layout —
 * stereo, 24-bit, float, not a WAV — which the decoder has to handle.
 */
export function levelWav(bytes: Uint8Array): LevelledWav | null {
  const wav = findPcm16Mono(bytes);
  if (!wav) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pcm = new Float32Array(wav.samples);
  for (let i = 0; i < wav.samples; i++) pcm[i] = view.getInt16(wav.dataStart + i * 2, true) / 32768;

  const levelled = levelPcm(pcm, wav.sampleRate);
  if (levelled.outcome === "unchanged") return { bytes, gainDb: 0, outcome: "unchanged" };

  const out = bytes.slice();
  const outView = new DataView(out.buffer, out.byteOffset, out.byteLength);
  for (let i = 0; i < wav.samples; i++) {
    const s = Math.round(levelled.pcm[i] * 32768);
    outView.setInt16(wav.dataStart + i * 2, Math.max(-32768, Math.min(32767, s)), true);
  }
  return { bytes: out, gainDb: levelled.gainDb, outcome: "applied" };
}
