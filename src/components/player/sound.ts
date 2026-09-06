/**
 * Player sound design — the "turn the page" cue.
 *
 * One of the three cassette-book memories in CLAUDE.md §9 is the chime that
 * told you to turn the page. This is its synthesized descendant: a short paper
 * swish plus a soft wooden thock, ≤ 300 ms, made on the fly so nothing is
 * downloaded and nothing is licensed.
 *
 * It runs on its own AudioContext (opened inside the "Tap to Begin" gesture),
 * never on the engine's music bus — a cue must never duck the melody or get
 * ducked by the voice.
 */

/** Total cue length, seconds. The bar is ≤ 300 ms. */
export const CUE_LENGTH_S = 0.26;

export function openCueContext(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}

/**
 * Plays the page-turn cue. Returns true when a cue was actually scheduled, so
 * the Player can report how many cues it has fired (`data-cues-fired`).
 *
 * Callers gate on `settings.pageTurnSound` before calling — a manifest that
 * asks for silence gets silence.
 */
export function playPageTurnCue(ctx: AudioContext | null): boolean {
  if (!ctx || ctx.state === "closed") return false;
  try {
    const now = ctx.currentTime;

    /* 1 — paper: a band-passed noise swish, the filter falling as the sheet
           settles. 180 ms, the part your ear actually reads as "a page". */
    const noiseS = 0.18;
    const size = Math.max(1, Math.floor(ctx.sampleRate * noiseS));
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) {
      const t = i / size;
      // Two crossing envelopes: a quick rustle in, a longer settle out.
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.6) * (0.35 + 0.65 * Math.min(1, t * 9));
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.9;
    band.frequency.setValueAtTime(1500, now);
    band.frequency.exponentialRampToValueAtTime(520, now + noiseS);

    const paperGain = ctx.createGain();
    paperGain.gain.setValueAtTime(0.0001, now);
    paperGain.gain.exponentialRampToValueAtTime(0.09, now + 0.02);
    paperGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseS);

    source.connect(band);
    band.connect(paperGain);
    paperGain.connect(ctx.destination);
    source.start(now);
    source.stop(now + noiseS + 0.01);

    /* 2 — the deck: a soft low thock as the page lands. */
    const thock = ctx.createOscillator();
    thock.type = "sine";
    thock.frequency.setValueAtTime(196, now + 0.055);
    thock.frequency.exponentialRampToValueAtTime(118, now + 0.16);

    const thockGain = ctx.createGain();
    thockGain.gain.setValueAtTime(0.0001, now + 0.055);
    thockGain.gain.exponentialRampToValueAtTime(0.05, now + 0.075);
    thockGain.gain.exponentialRampToValueAtTime(0.0001, now + CUE_LENGTH_S);

    thock.connect(thockGain);
    thockGain.connect(ctx.destination);
    thock.start(now + 0.055);
    thock.stop(now + CUE_LENGTH_S + 0.01);

    return true;
  } catch {
    /* the cue is decoration — never let it break a page turn */
    return false;
  }
}
