// Narration recorder — MediaRecorder with negotiated mime type.
//
// Safari records AAC in MP4; Chrome/Android records Opus in WebM. Passing a
// hardcoded mimeType Safari doesn't support makes the constructor throw, which
// is why recording must negotiate. Whatever codec we get here is a DRAFT codec
// only — published narration is normalized to AAC/M4A (see transcode.ts and
// docs/format-spec.md).

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  /** Seconds, measured wall-clock from start() to stop(). */
  duration: number;
}

const MIME_PREFERENCE = [
  "audio/mp4", // Safari — already AAC, publish becomes a passthrough
  "audio/webm;codecs=opus", // Chromium / Firefox
  "audio/webm",
];

export function pickRecordingMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_PREFERENCE.find((m) => MediaRecorder.isTypeSupported(m));
}

export type MicPermissionError = "denied" | "unavailable" | "unknown";

export class NarrationRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;

  get isRecording(): boolean {
    return this.recorder?.state === "recording";
  }

  /**
   * Requests the mic and starts recording. Throws a MicPermissionError string
   * so callers can show a recovery UI instead of a dead button.
   */
  async start(): Promise<void> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") throw "denied" satisfies MicPermissionError;
      if (name === "NotFoundError" || name === "NotReadableError") throw "unavailable" satisfies MicPermissionError;
      throw "unknown" satisfies MicPermissionError;
    }

    const mimeType = pickRecordingMime();
    this.stream = stream;
    this.recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
    this.startedAt = performance.now();
  }

  /** Stops recording, releases the mic, and resolves with the captured audio. */
  stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      const recorder = this.recorder;
      if (!recorder || recorder.state === "inactive") {
        reject(new Error("Not recording"));
        return;
      }
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || this.chunks[0]?.type || "audio/webm";
        const blob = new Blob(this.chunks, { type: mimeType });
        const duration = (performance.now() - this.startedAt) / 1000;
        this.releaseStream();
        this.recorder = null;
        resolve({ blob, mimeType, duration });
      };
      recorder.stop();
    });
  }

  /** Aborts without keeping the audio (e.g. user backs out mid-recording). */
  cancel(): void {
    try {
      if (this.recorder && this.recorder.state !== "inactive") {
        this.recorder.onstop = null;
        this.recorder.stop();
      }
    } catch {
      /* already stopped */
    }
    this.releaseStream();
    this.recorder = null;
    this.chunks = [];
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

/** Blob → data URL, for persisting recordings inside story data. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}
