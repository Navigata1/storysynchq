// Dual-bus Web Audio engine — the cassette-book sound.
//
// Two buses into one AudioContext:
//   narration bus — recorded voice (HTMLAudioElement via MediaElementSource)
//   music bus     — the generative music bed (src/lib/audio/music.ts)
// While narration plays, the music bed ducks ~-12 dB with smooth gain ramps,
// exactly like the library cassette tapes did.
//
// iOS Safari suspends AudioContexts created outside a user gesture; call
// unlock() from a tap handler ("Tap to Begin") before expecting sound.
//
// The music bus used to carry two detuned sine oscillators — a drone. It now
// carries a `MusicBed`: pad + music-box arpeggio + optional tape hiss, driven
// by the mood vocabulary in ./moods. The public API is unchanged
// (startMusic/setMood/stopMusic still take the old `MoodConfig`), and so are
// ducking, the ramps and the unlock rule.

import { MusicBed, type MoodInput } from "./music";
import { specForConfig, type MoodName } from "./moods";

const DUCK_FACTOR = 0.25; // ≈ -12 dB
const RAMP_S = 0.6;

/**
 * Music-bus level per unit of `gainMult` at full musicVolume.
 *
 * The old source was two full-scale oscillators (peak ≈ 2.0) into 0.03; the
 * MusicBed's own peak is ≈ 0.4, so this constant is scaled to keep the bed at
 * the same perceived level — and therefore the same distance under narration.
 * The duck factor and ramp times below are untouched.
 */
const BUS_UNIT = 0.09;

export type { MoodConfig, MoodName } from "./moods";
export type { MoodInput } from "./music";

export class DualBusAudioEngine {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private narrationGain: GainNode | null = null;
  private bed: MusicBed | null = null;
  private mediaSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  private musicVolume = 0.3; // 0..1, pre-duck
  private narrationVolume = 0.8;
  private ducked = false;
  private musicOn = false;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.narrationGain = this.ctx.createGain();
      this.narrationGain.gain.value = this.narrationVolume;
      this.narrationGain.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** Call from a user gesture — resumes a suspended context (iOS unlock). */
  async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* will retry on next gesture */
      }
    }
  }

  /**
   * Routes an <audio> element through the narration bus so ducking applies.
   * A media element can only ever have one source node — cached per element.
   */
  attachNarrationElement(el: HTMLMediaElement): void {
    const ctx = this.ensureContext();
    if (this.mediaSources.has(el)) return;
    try {
      const src = ctx.createMediaElementSource(el);
      src.connect(this.narrationGain!);
      this.mediaSources.set(el, src);
    } catch {
      // Element already claimed by another context — el plays direct, no ducking.
    }
  }

  /** Duck the music bed under narration (with ramps), and restore after. */
  setNarrating(active: boolean): void {
    if (this.ducked === active) return;
    this.ducked = active;
    this.applyMusicGain();
  }

  setNarrationVolume(v: number): void {
    this.narrationVolume = Math.min(1, Math.max(0, v));
    if (this.ctx && this.narrationGain) {
      this.narrationGain.gain.setTargetAtTime(this.narrationVolume, this.ctx.currentTime, 0.1);
    }
  }

  setMusicVolume(v: number): void {
    this.musicVolume = Math.min(1, Math.max(0, v));
    this.applyMusicGain();
  }

  get musicPlaying(): boolean {
    return this.musicOn;
  }

  /** The mood the bed is currently playing, or null when it is silent. */
  get moodName(): MoodName | null {
    return this.musicOn ? this.bed?.moodName ?? null : null;
  }

  /**
   * Starts the music bed on the music bus.
   *
   * Accepts a canonical mood name, any manifest mood string, or the legacy
   * `{freq1, freq2, gainMult}` config (which is matched back to a mood — see
   * `specForConfig`, and keeps its own level multiplier).
   */
  startMusic(mood: MoodInput): void {
    const ctx = this.ensureContext();
    if (this.musicOn) {
      this.setMood(mood);
      return;
    }
    const spec = specForConfig(mood);
    if (!this.bed) this.bed = new MusicBed(ctx, this.musicGain!);
    this.bed.start(spec.name);
    this.musicOn = true;
    this.currentMoodMult = spec.gainMult;
    this.applyMusicGain();
  }

  private currentMoodMult = 1;

  /** Crossfade the bed to another mood (page turns). */
  setMood(mood: MoodInput): void {
    const spec = specForConfig(mood);
    this.currentMoodMult = spec.gainMult;
    if (this.musicOn) this.bed?.setMood(spec.name);
    this.applyMusicGain();
  }

  stopMusic(): void {
    if (!this.musicOn || !this.ctx || !this.musicGain) return;
    this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    this.bed?.stop(1.0);
    this.musicOn = false;
  }

  /** Full teardown — safe to call on unmount. */
  dispose(): void {
    this.bed?.dispose();
    this.bed = null;
    this.musicOn = false;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.musicGain = null;
    this.narrationGain = null;
    this.mediaSources = new WeakMap();
  }

  private applyMusicGain(): void {
    if (!this.ctx || !this.musicGain) return;
    const base = BUS_UNIT * this.currentMoodMult * this.musicVolume;
    const target = this.musicOn ? base * (this.ducked ? DUCK_FACTOR : 1) : 0;
    this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, RAMP_S / 3);
  }
}
