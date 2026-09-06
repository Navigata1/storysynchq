// The melody under the voice.
//
// "It had a nice little melody behind it" is one of the three cassette-book
// memories this whole product exists to recreate (CLAUDE.md §9). A sine drone
// is not a melody. This is a small generative music box:
//
//   pad        two detuned oscillators + a fifth, lowpassed, breathing on a
//              slow LFO — felt rather than heard
//   arpeggio   scheduled music-box notes, exponential decay, pitches taken by
//              a seeded random walk over the mood's scale, rhythm fixed per bar
//   hiss       optional filtered noise at −40 dB, the warmth of tape
//
// Timing uses look-ahead scheduling (Chris Wilson's "A Tale of Two Clocks"): a
// ~100 ms `setTimeout` loop that schedules notes ~300 ms ahead on the audio
// clock, so nothing drifts and nothing is quantised to timer jitter. In a
// background tab timers are throttled to once a second and the bed would
// stutter, so it pauses on `visibilitychange` and picks the pulse back up when
// the tab returns.
//
// The class takes any `BaseAudioContext`, which means an `OfflineAudioContext`
// renders it deterministically for tests: construct with `{ offline: true }`,
// call `scheduleAhead(seconds)`, render.

import { MOODS, MOOD_NAMES, resolveMood, specForConfig, type MoodConfig, type MoodName, type MoodSpec } from "./moods";

/* ──────────────────────────────────────────────────────────── constants */

/** Scheduler wake-up interval, ms. */
const LOOKAHEAD_MS = 100;
/** How far ahead of the audio clock notes are scheduled, seconds. */
const SCHEDULE_AHEAD_S = 0.3;
/** Default mood-to-mood crossfade, seconds. */
const CROSSFADE_S = 1.6;
/** Pad fade-in so a bed never clicks on, seconds. */
const PAD_FADE_IN_S = 2.5;
/** Tape hiss level: −40 dB. */
const HISS_GAIN = 0.01;
/** Softens the music box's top end so triangles never bite. */
const ARP_TONE_HZ = 5200;
/** Gain automation cannot ramp to a true zero exponentially. */
const NEAR_ZERO = 0.0001;

export type MoodInput = MoodName | MoodConfig | string;

export interface MusicBedOptions {
  /** Fix the melody's random walk. Same seed + same mood = same notes. */
  seed?: number;
  /** Tests/offline rendering: no timers, no visibility hooks — you drive `scheduleAhead()`. */
  offline?: boolean;
  /** Override the mood's tape-hiss setting. */
  hiss?: boolean;
}

/* ────────────────────────────────────────────────────────────── helpers */

/** mulberry32 — tiny, fast, deterministic. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function stopSource(node: AudioScheduledSourceNode, at?: number): void {
  try {
    if (typeof at === "number") node.stop(at);
    else node.stop();
  } catch {
    /* never started, or already stopped */
  }
}

function disconnect(node: AudioNode): void {
  try {
    node.disconnect();
  } catch {
    /* already gone */
  }
}

/* ─────────────────────────────────────────────────────────────── voices */

/** One mood, playing. A crossfade briefly has two of these alive. */
interface Voice {
  spec: MoodSpec;
  /** Crossfade gain for this mood. */
  gain: GainNode;
  /** Music-box notes land here (a gentle lowpass). */
  arpBus: BiquadFilterNode;
  /** Everything that has to be stopped when the voice retires. */
  sources: AudioScheduledSourceNode[];
  rand: () => number;
  /** Next eighth-note step index. */
  step: number;
  /** Audio-clock time of that step. */
  nextTime: number;
  /** Index into the mood's scale × octave grid. */
  degree: number;
  /** Scheduled note start times, audio clock. */
  onsets: number[];
  /** A retiring voice fades out and schedules nothing more. */
  retiring: boolean;
}

/* ───────────────────────────────────────────────────────────── the bed */

export class MusicBed {
  private readonly ctx: BaseAudioContext;
  private readonly master: GainNode;
  private readonly opts: MusicBedOptions;
  private voices: Voice[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private visibilityBound = false;
  private pausedFlag = false;
  private disposed = false;
  private onsetTotal = 0;

  /**
   * @param ctx         the engine's AudioContext (or an OfflineAudioContext)
   * @param destination the music bus — the engine passes its music GainNode,
   *                    which owns level and the −12 dB duck under narration
   */
  constructor(ctx: BaseAudioContext, destination: AudioNode, options: MusicBedOptions = {}) {
    this.ctx = ctx;
    this.opts = options;
    this.master = ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(destination);
  }

  /* ------------------------------------------------------------- state */

  get playing(): boolean {
    return this.voices.some((v) => !v.retiring);
  }

  get moodName(): MoodName | null {
    const live = this.voices.find((v) => !v.retiring);
    return live ? live.spec.name : null;
  }

  /** Notes scheduled since the bed started — the melody, counted. */
  get onsetCount(): number {
    return this.onsetTotal;
  }

  /** Scheduled note times (audio clock) for the current mood. */
  get onsets(): number[] {
    const live = this.voices.find((v) => !v.retiring);
    return live ? live.onsets.slice() : [];
  }

  get paused(): boolean {
    return this.pausedFlag;
  }

  /* ---------------------------------------------------------- lifecycle */

  /** Start (or switch to) a mood. Safe to call repeatedly. */
  start(mood: MoodInput): void {
    if (this.disposed) return;
    if (this.playing) {
      this.setMood(mood);
      return;
    }
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setValueAtTime(1, this.ctx.currentTime);
    this.pausedFlag = false;
    this.addVoice(specForConfig(mood), this.ctx.currentTime, 1);
    this.bindVisibility();
    this.startTimer();
  }

  /** Crossfade to another mood, keeping the pulse — page turns use this. */
  setMood(mood: MoodInput, crossfadeSeconds: number = CROSSFADE_S): void {
    if (this.disposed) return;
    const spec = specForConfig(mood);
    const live = this.voices.find((v) => !v.retiring);
    if (!live) {
      this.start(spec.name);
      return;
    }
    if (live.spec.name === spec.name) return;

    // Start the new mood on the retiring one's next step so the music box
    // never loses the beat across a page turn.
    const at = Math.max(this.ctx.currentTime, live.nextTime);
    const cf = Math.max(0.05, crossfadeSeconds);
    this.retireVoice(live, at, cf);
    this.addVoice(spec, at, 0, cf);
  }

  /** Fade the bed out. The instance stays usable — `start()` brings it back. */
  stop(fadeSeconds = 0.9): void {
    if (this.disposed) return;
    const at = this.ctx.currentTime;
    for (const voice of this.voices) this.retireVoice(voice, at, fadeSeconds);
    this.voices = [];
    this.stopTimer();
  }

  /** Full teardown — safe on unmount, safe twice. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopTimer();
    this.unbindVisibility();
    for (const voice of this.voices) {
      for (const source of voice.sources) stopSource(source);
      disconnect(voice.arpBus);
      disconnect(voice.gain);
    }
    this.voices = [];
    disconnect(this.master);
  }

  /* ---------------------------------------------------------- scheduler */

  /**
   * Schedule every note that starts before `until` (audio-clock seconds).
   * The online loop calls this with `currentTime + 0.3`; an offline render
   * calls it once with the full duration.
   */
  scheduleAhead(until: number): void {
    if (this.disposed) return;
    for (const voice of this.voices) {
      if (voice.retiring) continue;
      let guard = 0;
      while (voice.nextTime < until && guard++ < 4096) {
        this.scheduleStep(voice);
      }
    }
  }

  private tick = (): void => {
    this.timer = null;
    if (this.disposed || this.pausedFlag) return;
    this.scheduleAhead(this.ctx.currentTime + SCHEDULE_AHEAD_S);
    this.startTimer();
  };

  private startTimer(): void {
    if (this.opts.offline || this.disposed || this.pausedFlag) return;
    if (this.timer !== null) return;
    // setTimeout, not setInterval: the audio clock owns the timing, this loop
    // only has to wake up often enough to keep the look-ahead window full.
    this.timer = setTimeout(this.tick, LOOKAHEAD_MS);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleStep(voice: Voice): void {
    const { spec } = voice;
    const stepDur = 30 / spec.tempo; // eighth note
    const index = voice.step % spec.arp.pattern.length;
    const velocity = spec.arp.pattern[index];
    const time = voice.nextTime;

    if (velocity > 0) {
      const scale = spec.scale;
      const span = scale.length * spec.arp.octaves.length;
      if (index === 0) {
        // Bar-aligned: land on a chord tone so the loop always resolves.
        voice.degree = voice.rand() < 0.6 ? 0 : Math.min(span - 1, 2);
      } else {
        const walk = [-2, -1, -1, 0, 1, 1, 2];
        const move = walk[Math.floor(voice.rand() * walk.length) % walk.length];
        voice.degree = clamp(voice.degree + move, 0, span - 1);
      }
      const octave = spec.arp.octaves[Math.floor(voice.degree / scale.length)];
      const semitones = scale[voice.degree % scale.length] + 12 * octave;
      const freq = spec.root * Math.pow(2, semitones / 12);
      const jitter = (voice.rand() * 2 - 1) * spec.arp.jitterS;
      const at = Math.max(this.ctx.currentTime, time + jitter);
      this.scheduleNote(voice, freq, at, velocity);
      voice.onsets.push(at);
      this.onsetTotal++;
    }

    voice.step++;
    voice.nextTime = time + stepDur;
  }

  /** One music-box note: a bright attack and a long exponential tail. */
  private scheduleNote(voice: Voice, freq: number, at: number, velocity: number): void {
    const ctx = this.ctx;
    const { arp } = voice.spec;
    const peak = arp.gain * velocity;
    const decay = arp.decay;

    const env = ctx.createGain();
    env.gain.setValueAtTime(NEAR_ZERO, at);
    env.gain.exponentialRampToValueAtTime(peak, at + 0.006);
    env.gain.exponentialRampToValueAtTime(NEAR_ZERO, at + decay);
    env.gain.setValueAtTime(0, at + decay);
    env.connect(voice.arpBus);

    const osc = ctx.createOscillator();
    osc.type = arp.type;
    osc.frequency.setValueAtTime(freq, at);
    osc.detune.setValueAtTime((voice.rand() * 2 - 1) * arp.jitterCents, at);
    osc.connect(env);
    osc.start(at);
    osc.stop(at + decay + 0.02);

    // A quiet octave partial is what makes it read as "music box" and not "beep".
    const bell = ctx.createGain();
    bell.gain.setValueAtTime(0.22, at);
    bell.connect(env);
    const partial = ctx.createOscillator();
    partial.type = "sine";
    partial.frequency.setValueAtTime(freq * 2, at);
    partial.connect(bell);
    partial.start(at);
    partial.stop(at + decay * 0.5 + 0.02);

    // Online, unhook a finished note so nothing accumulates. Offline the whole
    // graph is thrown away after the render, and mutating it mid-render would
    // make the output depend on event-loop timing — i.e. not deterministic.
    if (!this.opts.offline) {
      osc.onended = () => {
        disconnect(osc);
        disconnect(env);
      };
      partial.onended = () => {
        disconnect(partial);
        disconnect(bell);
      };
    }
  }

  /* ------------------------------------------------------------- voices */

  private addVoice(spec: MoodSpec, at: number, startGain: number, fadeIn = 0): Voice {
    const ctx = this.ctx;
    const seed =
      (this.opts.seed !== undefined ? this.opts.seed >>> 0 : hashString(spec.name)) ^ hashString(spec.name);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(startGain, at);
    if (fadeIn > 0) gain.gain.linearRampToValueAtTime(1, at + fadeIn);
    gain.connect(this.master);

    const arpBus = ctx.createBiquadFilter();
    arpBus.type = "lowpass";
    arpBus.frequency.setValueAtTime(ARP_TONE_HZ, at);
    arpBus.Q.setValueAtTime(0.5, at);
    arpBus.connect(gain);

    const sources: AudioScheduledSourceNode[] = [];
    const rand = mulberry32(seed);

    /* ---- pad: two detuned voices + a fifth, lowpassed, slowly breathing */
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.setValueAtTime(spec.pad.filterHz, at);
    padFilter.Q.setValueAtTime(0.7, at);

    const padGain = ctx.createGain();
    padGain.gain.setValueAtTime(NEAR_ZERO, at);
    padGain.gain.linearRampToValueAtTime(spec.pad.gain, at + PAD_FADE_IN_S);
    padFilter.connect(padGain);
    padGain.connect(gain);

    for (const cents of [-spec.pad.detuneCents, spec.pad.detuneCents]) {
      const osc = ctx.createOscillator();
      osc.type = spec.pad.type;
      osc.frequency.setValueAtTime(spec.root, at);
      osc.detune.setValueAtTime(cents, at);
      osc.connect(padFilter);
      osc.start(at);
      sources.push(osc);
    }
    if (spec.pad.fifth > 0) {
      const fifth = ctx.createOscillator();
      fifth.type = spec.pad.type;
      fifth.frequency.setValueAtTime(spec.root * 1.5, at);
      fifth.detune.setValueAtTime(spec.pad.detuneCents * 0.5, at);
      const fifthGain = ctx.createGain();
      fifthGain.gain.setValueAtTime(spec.pad.fifth, at);
      fifth.connect(fifthGain);
      fifthGain.connect(padFilter);
      fifth.start(at);
      sources.push(fifth);
    }

    // Breathing: an audio-rate LFO added on top of the pad's gain automation.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(spec.pad.lfoHz, at);
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.setValueAtTime(spec.pad.gain * spec.pad.lfoDepth, at);
    lfo.connect(lfoDepth);
    lfoDepth.connect(padGain.gain);
    lfo.start(at);
    sources.push(lfo);

    /* ---- tape hiss */
    const wantsHiss = this.opts.hiss ?? spec.hiss;
    if (wantsHiss) {
      const seconds = 2;
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = rand() * 2 - 1;

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const low = ctx.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.setValueAtTime(2400, at);
      const high = ctx.createBiquadFilter();
      high.type = "highpass";
      high.frequency.setValueAtTime(500, at);
      const hissGain = ctx.createGain();
      hissGain.gain.setValueAtTime(HISS_GAIN, at);

      noise.connect(high);
      high.connect(low);
      low.connect(hissGain);
      hissGain.connect(gain);
      noise.start(at);
      sources.push(noise);
    }

    const voice: Voice = {
      spec,
      gain,
      arpBus,
      sources,
      rand,
      step: 0,
      nextTime: at,
      degree: 0,
      onsets: [],
      retiring: false,
    };
    this.voices.push(voice);
    return voice;
  }

  private retireVoice(voice: Voice, at: number, fade: number): void {
    voice.retiring = true;
    const end = at + Math.max(0.05, fade);
    try {
      voice.gain.gain.cancelScheduledValues(at);
      voice.gain.gain.setValueAtTime(Math.max(NEAR_ZERO, voice.gain.gain.value), at);
      voice.gain.gain.linearRampToValueAtTime(0, end);
    } catch {
      /* automation raced a dispose */
    }
    // Stopping on the audio clock (not a timer) keeps offline renders correct.
    for (const source of voice.sources) stopSource(source, end + 0.05);
    // The voice stays in the list while it fades (the scheduler skips retiring
    // voices); online it is unhooked once its sources have actually stopped.
    if (!this.opts.offline) {
      setTimeout(
        () => {
          this.voices = this.voices.filter((v) => v !== voice);
          disconnect(voice.arpBus);
          disconnect(voice.gain);
        },
        (Math.max(0.05, fade) + 0.2) * 1000,
      );
    }
  }

  /* -------------------------------------------------------- visibility */

  private onVisibility = (): void => {
    if (typeof document === "undefined") return;
    if (document.hidden) this.pauseForHidden();
    else this.resumeFromHidden();
  };

  private bindVisibility(): void {
    if (this.opts.offline || this.visibilityBound || typeof document === "undefined") return;
    document.addEventListener("visibilitychange", this.onVisibility);
    this.visibilityBound = true;
  }

  private unbindVisibility(): void {
    if (!this.visibilityBound || typeof document === "undefined") return;
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.visibilityBound = false;
  }

  /** Background tabs throttle timers to ~1 Hz, which would starve the
   *  look-ahead window and stutter. Duck out and stop scheduling instead. */
  private pauseForHidden(): void {
    if (this.pausedFlag || !this.playing) return;
    this.pausedFlag = true;
    this.stopTimer();
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 0.35);
  }

  private resumeFromHidden(): void {
    if (!this.pausedFlag) return;
    this.pausedFlag = false;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(1, now + 0.5);
    // Pick the pulse up from now rather than dumping every missed note.
    for (const voice of this.voices) {
      if (!voice.retiring && voice.nextTime < now) {
        voice.nextTime = now + 0.05;
        voice.step = 0;
      }
    }
    this.startTimer();
  }
}

/* ─────────────────────────────────────────────────────── test/dev hook */

// Lets a Playwright test render the *shipped* MusicBed through an
// OfflineAudioContext instead of a copy of it. Two property assignments on an
// object that is already in the bundle — harmless in production, no network,
// no storage, nothing user-visible (PRIVACY.md: the player ships no telemetry).
if (typeof window !== "undefined") {
  (window as unknown as { __ssyncMusic?: unknown }).__ssyncMusic = {
    MusicBed,
    MOODS,
    MOOD_NAMES,
    resolveMood,
  };
}
