"use client";

/**
 * TRANSPORT — ⏮ ● REC ▶ ⏭, reels spinning while the tape moves.
 * Record is tap-to-start / tap-to-stop: a 4-year-old cannot hold a button
 * steady while performing, and hold-to-record loses the take on a slip.
 */

import * as React from "react";
import { Reel, TransportButton } from "@/components/studio-kit/kit";
import { formatClock } from "./types";

export interface TransportProps {
  playing: boolean;
  recording: boolean;
  voiceArmed: boolean;
  pageNumber: number;
  pageCount: number;
  position: number;
  clipDuration: number;
  recordSeconds: number;
  onPrev: () => void;
  onNext: () => void;
  onPlayPause: () => void;
  onRecord: () => void;
}

export function Transport({
  playing,
  recording,
  voiceArmed,
  pageNumber,
  pageCount,
  position,
  clipDuration,
  recordSeconds,
  onPrev,
  onNext,
  onPlayPause,
  onRecord,
}: TransportProps) {
  const readout = recording
    ? `● ${formatClock(recordSeconds)}`
    : `${formatClock(position)} / ${formatClock(clipDuration)}`;

  return (
    <section
      aria-label="Transport"
      className="flex items-center justify-between gap-3 border-t border-white/8 bg-black/45 px-3 py-3 backdrop-blur-xl"
      style={
        {
          "--sk-transport-size": "60px",
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
        } as React.CSSProperties
      }
    >
      <div className="hidden w-[132px] flex-none items-center gap-3 sm:flex">
        <Reel spinning={playing || recording} size={34} />
        <Reel spinning={playing || recording} size={34} />
      </div>

      <div className="flex flex-1 items-center justify-center gap-3 sm:gap-5">
        <TransportButton kind="prev" onClick={onPrev} disabled={pageNumber <= 1} />
        <TransportButton
          kind="rec"
          active={recording}
          onClick={onRecord}
          aria-label={recording ? "Stop recording" : "Record my voice on this page"}
          className={voiceArmed && !recording ? "ring-2 ring-[#E3452F]/70 ring-offset-2 ring-offset-[#0a0e1a]" : undefined}
        />
        <TransportButton
          kind={playing ? "pause" : "play"}
          active={playing}
          onClick={onPlayPause}
          aria-label={playing ? "Stop playing" : "Play the story"}
          className="scale-[1.15]"
        />
        <TransportButton kind="next" onClick={onNext} disabled={pageNumber >= pageCount} />
      </div>

      <div
        className="w-[86px] flex-none text-right text-[11px] leading-tight tracking-[0.16em] text-white/45 uppercase sm:w-[132px]"
        style={{ fontFamily: "var(--font-plex-mono), monospace" }}
      >
        <div className={recording ? "text-[#ff6a52]" : undefined}>{readout}</div>
        <div className="text-white/30">
          pg {pageNumber}/{pageCount}
        </div>
      </div>
    </section>
  );
}

export default Transport;
