"use client";

/**
 * TRANSPORT — ⏮ ● REC ▶ ⏭, reels spinning while the tape moves.
 * Record is tap-to-start / tap-to-stop: a 4-year-old cannot hold a button
 * steady while performing, and hold-to-record loses the take on a slip.
 * While the mic is live only REC stays live, and it shows the stop square
 * (s03 `.s3-rec56`): ⏮ and ⏭ are dead because the take belongs to the page it
 * was started on, and ▶ is dead because playing the page's old voice, the
 * speech or the music bed would land in the open microphone.
 *
 * s03 sets it as a deck: the two reels in a dark capsule at the left, the
 * keys centred, and one mono line at the right — `0:05 · pg 3/5`, tape-red
 * while recording. On a phone the line folds in two (time over page) so the
 * keys keep their room (studio.css, "transport").
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
  /** The page's voice length in seconds; 0 when it is not known (no voice yet). */
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
  // A length we do not know is a dash, never a made-up "0:00".
  const total = clipDuration > 0 ? formatClock(clipDuration) : "—";
  const time = recording
    ? `● ${formatClock(recordSeconds)}`
    : `${formatClock(position)} / ${total}`;

  return (
    <section
      aria-label="Transport"
      data-studio="transport"
      data-recording={recording ? "true" : "false"}
      // Padding, fill, border and blur live in studio.css ("transport"): a
      // utility here would beat the layered rules and pin the phone bar's
      // values on the ≥ 1024px inset deck too.
      className="studio-transport flex items-center justify-between gap-3"
      style={{ "--sk-transport-size": "60px" } as React.CSSProperties}
    >
      <div className="studio-transport-side hidden flex-none items-center sm:flex">
        <span data-studio="transport-deck" className="studio-transport-deck">
          <Reel spinning={playing || recording} size={34} />
          <Reel spinning={playing || recording} size={34} />
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center gap-3 sm:gap-5">
        <TransportButton kind="prev" onClick={onPrev} disabled={recording || pageNumber <= 1} />
        {/* One key, two faces: the round dot to start, the stop square in the
            armed ring while the mic is live. The name says which; no
            aria-pressed on top of a changing name. */}
        <TransportButton
          kind={recording ? "stop" : "rec"}
          onClick={onRecord}
          aria-label={recording ? "Stop recording" : "Record my voice on this page"}
          className={`studio-transport-rec${
            voiceArmed && !recording ? " ring-2 ring-[#E3452F]/70 ring-offset-2 ring-offset-[#0a0e1a]" : ""
          }`}
        />
        <TransportButton
          kind={playing ? "pause" : "play"}
          active={playing}
          disabled={recording}
          onClick={onPlayPause}
          aria-label={playing ? "Stop playing" : "Play the story"}
          className="scale-[1.15]"
        />
        <TransportButton
          kind="next"
          onClick={onNext}
          disabled={recording || pageNumber >= pageCount}
        />
      </div>

      <div
        data-studio="transport-readout"
        className="studio-transport-side studio-transport-readout flex-none"
      >
        <span data-studio="transport-time">{time}</span>
        <span className="studio-transport-sep" aria-hidden="true">
          {" · "}
        </span>
        <span data-studio="transport-page">
          pg {pageNumber}/{pageCount}
        </span>
      </div>
    </section>
  );
}

export default Transport;
