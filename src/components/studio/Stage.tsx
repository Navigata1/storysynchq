"use client";

/**
 * THE STAGE — the preview monitor.
 *
 * It renders the current page from the manifest the way the Player receives
 * it: picture above, story text in serif below. The only studio-side addition
 * is that the text is editable in place, so what you type is literally what a
 * listener will read. Nothing else is added to the render — if the Stage and
 * the Player ever disagree, that is a protocol bug (design-direction §7).
 */

import * as React from "react";
import { Reel } from "@/components/studio-kit/kit";
import type { SsyncPage } from "@/lib/storysync/manifest";
import { formatClock } from "./types";

export interface StageProps {
  page: SsyncPage | undefined;
  pageNumber: number;
  pageCount: number;
  playing: boolean;
  narrating: boolean;
  recording: boolean;
  recordSeconds: number;
  position: number;
  clipDuration: number;
  photoBusy: boolean;
  onTextChange: (text: string) => void;
  onPickPhoto: () => void;
}

export function Stage({
  page,
  pageNumber,
  pageCount,
  playing,
  narrating,
  recording,
  recordSeconds,
  position,
  clipDuration,
  photoBusy,
  onTextChange,
  onPickPhoto,
}: StageProps) {
  const image = page?.illustration?.url;
  const text = page?.text?.content ?? "";
  const hasNarration = Boolean(page?.text?.audioUrl);
  const progress = clipDuration > 0 ? Math.min(1, position / clipDuration) : 0;

  return (
    <div className="studio-monitor h-full">
      {/* monitor header — mono readouts, nothing that competes with the page */}
      <div className="flex items-center justify-between gap-3 border-b border-white/8 bg-black/40 px-3 py-2">
        <span
          className="text-[10px] tracking-[0.22em] text-white/45 uppercase"
          style={{ fontFamily: "var(--font-plex-mono), monospace" }}
        >
          Page {pageNumber} / {pageCount}
        </span>
        <div className="flex items-center gap-3">
          {hasNarration ? (
            <span
              className="rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-[3px] text-[10px] tracking-[0.14em] text-amber-200 uppercase"
              style={{ fontFamily: "var(--font-plex-mono), monospace" }}
            >
              🎙 voice
            </span>
          ) : null}
          <span className="flex items-center gap-2 opacity-80">
            <Reel spinning={playing || recording} size={22} />
            <Reel spinning={playing || recording} size={22} />
          </span>
        </div>
      </div>

      <div key={page?.id ?? "empty"} className="studio-monitor-page">
        {/* ---------------------------------------------------------- picture */}
        <div className="relative flex min-h-0 flex-[1_1_58%] items-center justify-center overflow-hidden bg-black">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={page?.illustration?.alt || `Picture for page ${pageNumber}`}
              className="h-full w-full object-contain"
            />
          ) : (
            <button
              type="button"
              onClick={onPickPhoto}
              disabled={photoBusy}
              className="sk-focus m-4 flex min-h-[128px] w-[calc(100%-2rem)] flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/18 bg-white/[0.03] p-6 text-center transition-colors hover:border-amber-400/50 hover:bg-amber-500/[0.06] disabled:cursor-wait"
            >
              <span aria-hidden="true" className="text-5xl">
                {photoBusy ? "⏳" : "📷"}
              </span>
              <span className="text-base font-semibold text-white/85">
                {photoBusy ? "Getting your picture ready…" : "Add a picture"}
              </span>
              <span className="text-sm text-white/45">Take a photo of your drawing</span>
            </button>
          )}

          {recording ? (
            <div
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end gap-2 pb-6"
              style={{ boxShadow: "inset 0 0 0 3px #E3452F, inset 0 0 90px rgba(227,69,47,0.35)" }}
            >
              <span className="rounded-full bg-[#E3452F] px-4 py-2 text-sm font-semibold text-white shadow-lg">
                ● Listening… {formatClock(recordSeconds)}
              </span>
            </div>
          ) : null}
        </div>

        {/* ------------------------------------------------------- story text */}
        <div className="flex min-h-0 flex-[0_1_auto] flex-col gap-2 bg-gradient-to-b from-[#0b0d14] to-[#080a10] px-5 py-4 sm:px-8 sm:py-6">
          <label className="sr-only" htmlFor="studio-page-text">
            Story text for page {pageNumber}
          </label>
          <textarea
            id="studio-page-text"
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            rows={3}
            placeholder="Once upon a time…"
            spellCheck
            className="studio-story-text studio-story-input studio-scroll max-h-[26vh] min-h-[4.4rem] overflow-y-auto rounded-lg focus-visible:outline-3 focus-visible:outline-amber-500 focus-visible:outline-offset-4"
          />
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/8">
            <div
              className="studio-progress-bar h-full"
              style={{ width: `${Math.round(progress * 100)}%` }}
              aria-hidden="true"
            />
          </div>
          <div
            className="flex items-center justify-between text-[10px] tracking-[0.18em] text-white/35 uppercase"
            style={{ fontFamily: "var(--font-plex-mono), monospace" }}
          >
            <span>
              {narrating ? "▶ narrating" : recording ? "● recording" : hasNarration ? "voice ready" : "browser voice"}
            </span>
            <span>
              {formatClock(position)} / {formatClock(clipDuration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Stage;
