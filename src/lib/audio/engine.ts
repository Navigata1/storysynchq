// Dual-bus Web Audio engine — the cassette-book sound.
//
// Two buses into one AudioContext:
//   narration bus — recorded voice (HTMLAudioElement via MediaElementSource)
//   music bus     — background bed (oscillator pad now, file tracks later)
// While narration plays, the music bed ducks ~-12 dB with smooth gain ramps,
// exactly like the library cassette tapes did.
//
// iOS Safari suspends AudioContexts created outside a user gesture; call
// unlock() from a tap handler ("Tap to Begin") before expecting sound.

const DUCK_FACTOR = 0.25; // ≈ -12 dB
const RAMP_S = 0.6;

export interface MoodConfig {
  freq1: number;
  freq2: number;
  gainMult: number;
}

export class DualBusAudioEngine {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private narrationGain: GainNode | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
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

  /** Starts the ambient pad on the music bus. */
  startMusic(mood: MoodConfig): void {
    const ctx = this.ensureContext();
    if (this.musicOn) {
      this.setMood(mood);
      return;
    }
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;

    this.osc1 = ctx.createOscillator();
    this.osc1.type = "sine";
    this.osc1.frequency.value = mood.freq1;
    this.osc2 = ctx.createOscillator();
    this.osc2.type = "sine";
    this.osc2.frequency.value = mood.freq2;

    this.osc1.connect(filter);
    this.osc2.connect(filter);
    filter.connect(this.musicGain!);
    this.osc1.start();
    this.osc2.start();
    this.musicOn = true;
    this.currentMoodMult = mood.gainMult;
    this.applyMusicGain();
  }

  private currentMoodMult = 1;

  setMood(mood: MoodConfig): void {
    if (!this.ctx || !this.osc1 || !this.osc2) return;
    const now = this.ctx.currentTime;
    try {
      this.osc1.frequency.linearRampToValueAtTime(mood.freq1, now + 1);
      this.osc2.frequency.linearRampToValueAtTime(mood.freq2, now + 1);
    } catch {
      /* ignore */
    }
    this.currentMoodMult = mood.gainMult;
    this.applyMusicGain();
  }

  stopMusic(): void {
    if (!this.musicOn || !this.ctx || !this.musicGain) return;
    const osc1 = this.osc1;
    const osc2 = this.osc2;
    this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    setTimeout(() => {
      try {
        osc1?.stop();
      } catch {}
      try {
        osc2?.stop();
      } catch {}
    }, 1200);
    this.osc1 = null;
    this.osc2 = null;
    this.musicOn = false;
  }

  /** Full teardown — safe to call on unmount. */
  dispose(): void {
    try {
      this.osc1?.stop();
    } catch {}
    try {
      this.osc2?.stop();
    } catch {}
    this.osc1 = null;
    this.osc2 = null;
    this.musicOn = false;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.musicGain = null;
    this.narrationGain = null;
    this.mediaSources = new WeakMap();
  }

  private applyMusicGain(): void {
    if (!this.ctx || !this.musicGain) return;
    const base = 0.03 * this.currentMoodMult * this.musicVolume;
    const target = this.musicOn ? base * (this.ducked ? DUCK_FACTOR : 1) : 0;
    this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, RAMP_S / 3);
  }
}
