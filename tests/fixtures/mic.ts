/**
 * A deterministic microphone for the Creator's E2E tests.
 *
 *   stubMicrophone(page)                 — a take is a 4-byte `audio/mp4` blob
 *   stubMicrophone(page, { deny: true }) — the grown-up said no to the mic
 *
 * Copied from the prior art in tests/wp-studio.spec.ts (which keeps its own
 * copy). The recorder negotiates `audio/mp4`, as Safari does, so a publish
 * takes the AAC passthrough and needs no encoder in headless Chromium.
 *
 * Installed by an init script, so call it before the page's first `goto`.
 */

import type { Page } from "@playwright/test";

export interface StubMicrophoneOptions {
  /**
   * `getUserMedia` rejects with a `NotAllowedError`, the way a browser does
   * when microphone permission is refused. The recorder reports "denied".
   */
  deny?: boolean;
}

export async function stubMicrophone(page: Page, options: StubMicrophoneOptions = {}): Promise<void> {
  await page.addInitScript(({ deny }) => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          if (deny) throw new DOMException("Permission denied", "NotAllowedError");
          return { getTracks: () => [{ stop() {} }] };
        },
      },
    });
    class FakeMediaRecorder {
      static isTypeSupported(type: string) {
        return type === "audio/mp4";
      }
      state = "inactive";
      mimeType: string;
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor(_stream: unknown, options?: { mimeType?: string }) {
        this.mimeType = options?.mimeType ?? "audio/mp4";
      }
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        // Asynchronous, like the real thing: the take is only filed once the
        // blob arrives, which is precisely when a page could have changed.
        window.setTimeout(() => {
          this.ondataavailable?.({
            data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: this.mimeType }),
          });
          this.onstop?.();
        }, 150);
      }
    }
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeMediaRecorder;
  }, { deny: options.deny === true });
}
