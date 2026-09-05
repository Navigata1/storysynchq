"use client";

/**
 * SOUND DESIGN — the small noises the room makes.
 *
 * Three of them, and they exist because of one line in the origin story: the
 * "turn the page" chime. A cue is a *confirmation*, never a performance —
 * under 300 ms, quiet enough to sit beside a child's voice, and synthesized so
 * nothing is fetched and nothing is licensed.
 *
 *   pageTurn()    a short filtered-noise sweep with a soft wooden click
 *   recordStart() two rising blips — "go on then"
 *   recordStop()  one falling blip — "got it"
 *
 * These run on their own tiny AudioContext rather than the story engine's, so
 * a cue can never touch the narration/music buses, their ducking or their
 * gain ramps. It is created lazily on the first cue (always inside a user
 * gesture, so iOS is happy) and closed on dispose.
 */

const MASTER = 0.16;

export class StudioCues {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private broken = false;

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  /** Resume the cue context from a user gesture. Safe to call repeatedly. */
  async unlock(): Promise<void> {
    const ctx = this.context();
    if (ctx && ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* retried on the next gesture */
      }
    }
  }

  private context(): AudioContext | null {
    if (this.broken || typeof window === "undefined") return null;
    if (!this.ctx) {
      try {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) {
          this.broken = true;
          return null;
        }
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = MASTER;
        this.master.connect(this.ctx.destination);
      } catch {
        this.broken = true;
        return null;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** One plucked sine with an exponential tail. */
  private blip(from: number, to: number, at: number, dur: number, gain: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), at + dur);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(env);
    env.connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  /**
   * The page itself: a band-passed noise sweep (paper moving past paper) with
   * a low wooden click under it (the tape deck's own mechanism).
   */
  pageTurn(): void {
    if (!this.enabled) return;
    const ctx = this.context();
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime + 0.001;
    const dur = 0.24;

    const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      // Noise that fades in and out — the swish, not a burst.
      const t = i / frames;
      const shape = Math.sin(Math.PI * t) ** 2;
      data[i] = (Math.random() * 2 - 1) * shape;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.9;
    band.frequency.setValueAtTime(900, now);
    band.frequency.exponentialRampToValueAtTime(2600, now + dur);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.5, now + 0.05);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    source.connect(band);
    band.connect(env);
    env.connect(master);
    source.start(now);
    source.stop(now + dur + 0.02);

    this.blip(320, 190, now + 0.02, 0.09, 0.22);
  }

  /** Two rising blips: the tape is rolling. */
  recordStart(): void {
    if (!this.enabled) return;
    const ctx = this.context();
    if (!ctx) return;
    const now = ctx.currentTime + 0.001;
    this.blip(660, 660, now, 0.075, 0.5);
    this.blip(988, 988, now + 0.1, 0.1, 0.5);
  }

  /** One falling blip: it is saved. */
  recordStop(): void {
    if (!this.enabled) return;
    const ctx = this.context();
    if (!ctx) return;
    const now = ctx.currentTime + 0.001;
    this.blip(784, 523, now, 0.16, 0.45);
  }

  dispose(): void {
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    ctx?.close().catch(() => {});
  }
}
