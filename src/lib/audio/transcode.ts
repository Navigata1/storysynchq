// Publish-time narration normalization — the codec-matrix fix.
//
// Safari records AAC/MP4; Chrome/Android records Opus/WebM, which iOS Safari
// can't reliably play — silently breaking the share-with-grandma moment. The
// SSYNC v2 rule (docs/format-spec.md): published narration is AAC/M4A, with
// WAV as the only permitted fallback; Opus/WebM is never valid in a published
// story.
//
// Normalization ladder, all client-side (a child's voice never transits a
// server just to be transcoded):
//   1. Already AAC/MP4 (Safari recordings) → passthrough
//   2. WebCodecs AudioEncoder supports AAC (Chromium) → decode + re-encode,
//      mux to M4A with mp4-muxer
//   3. Otherwise → decode + write 16 kHz mono WAV (universal, larger)

import { Muxer, ArrayBufferTarget } from "mp4-muxer";

export interface NormalizedNarration {
  blob: Blob;
  mimeType: "audio/mp4" | "audio/wav";
  codec: "aac" | "wav";
  ext: "m4a" | "wav";
  wasTranscoded: boolean;
}

const AAC_SAMPLE_RATE = 48000;
const AAC_BITRATE = 96_000;
const WAV_SAMPLE_RATE = 16000;

export function isPublishCompliant(mimeType: string): boolean {
  const m = mimeType.toLowerCase();
  return m.includes("mp4") || m.includes("aac") || m.includes("m4a") || m.includes("wav");
}

async function aacEncoderSupported(): Promise<boolean> {
  if (typeof AudioEncoder === "undefined") return false;
  try {
    const { supported } = await AudioEncoder.isConfigSupported({
      codec: "mp4a.40.2",
      sampleRate: AAC_SAMPLE_RATE,
      numberOfChannels: 1,
      bitrate: AAC_BITRATE,
    });
    return supported === true;
  } catch {
    return false;
  }
}

/** Decode any browser-playable audio blob to mono PCM at the given rate. */
async function decodeToMono(blob: Blob, sampleRate: number): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  // Decode at native rate first; an OfflineAudioContext render then resamples.
  const probeCtx = new OfflineAudioContext(1, 1, sampleRate);
  const decoded = await probeCtx.decodeAudioData(arrayBuffer);
  const frames = Math.max(1, Math.ceil(decoded.duration * sampleRate));
  const renderCtx = new OfflineAudioContext(1, frames, sampleRate);
  const src = renderCtx.createBufferSource();
  src.buffer = decoded;
  src.connect(renderCtx.destination);
  src.start();
  const rendered = await renderCtx.startRendering();
  return rendered.getChannelData(0).slice();
}

async function encodeAacM4a(pcm: Float32Array): Promise<Blob> {
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    audio: { codec: "aac", sampleRate: AAC_SAMPLE_RATE, numberOfChannels: 1 },
    fastStart: "in-memory",
  });

  let encoderError: Error | null = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => {
      encoderError = e instanceof Error ? e : new Error(String(e));
    },
  });
  encoder.configure({
    codec: "mp4a.40.2",
    sampleRate: AAC_SAMPLE_RATE,
    numberOfChannels: 1,
    bitrate: AAC_BITRATE,
  });

  // Feed in ~1s slices with microsecond timestamps.
  const sliceFrames = AAC_SAMPLE_RATE;
  for (let offset = 0; offset < pcm.length; offset += sliceFrames) {
    const slice = pcm.subarray(offset, Math.min(offset + sliceFrames, pcm.length));
    const data = new AudioData({
      format: "f32-planar",
      sampleRate: AAC_SAMPLE_RATE,
      numberOfFrames: slice.length,
      numberOfChannels: 1,
      timestamp: Math.round((offset / AAC_SAMPLE_RATE) * 1_000_000),
      data: slice.slice().buffer as ArrayBuffer,
    });
    encoder.encode(data);
    data.close();
  }
  await encoder.flush();
  encoder.close();
  if (encoderError) throw encoderError;
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: "audio/mp4" });
}

function encodeWav(pcm: Float32Array, sampleRate: number): Blob {
  const dataSize = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Normalizes one narration recording for publishing. Returns the original
 * blob untouched when it is already compliant (Safari's AAC/MP4 recordings).
 */
export async function normalizeNarration(blob: Blob, mimeType?: string): Promise<NormalizedNarration> {
  const type = (mimeType || blob.type || "").toLowerCase();

  if (type.includes("mp4") || type.includes("aac") || type.includes("m4a")) {
    return { blob, mimeType: "audio/mp4", codec: "aac", ext: "m4a", wasTranscoded: false };
  }
  if (type.includes("wav")) {
    return { blob, mimeType: "audio/wav", codec: "wav", ext: "wav", wasTranscoded: false };
  }

  if (await aacEncoderSupported()) {
    try {
      const pcm = await decodeToMono(blob, AAC_SAMPLE_RATE);
      const m4a = await encodeAacM4a(pcm);
      return { blob: m4a, mimeType: "audio/mp4", codec: "aac", ext: "m4a", wasTranscoded: true };
    } catch {
      // fall through to WAV
    }
  }

  const pcm = await decodeToMono(blob, WAV_SAMPLE_RATE);
  const wav = encodeWav(pcm, WAV_SAMPLE_RATE);
  return { blob: wav, mimeType: "audio/wav", codec: "wav", ext: "wav", wasTranscoded: true };
}
