"use client";

/**
 * THE STAGE — the preview monitor.
 *
 * It renders the current page from the manifest the way the Player receives
 * it: picture above, story text in serif below, lit by the picture's own light
 * (the Player's ambient backdrop — blurred, still; a page with no picture keeps
 * the last picture's light). The only studio-side addition is that the text is
 * editable in place, so what you type is literally what a listener will read.
 * If the Stage and the Player ever disagree, that is a protocol bug
 * (design-direction §7).
 *
 * While the tape is listening the photo wears the tape-red ListeningRing with
 * "Listening… m:ss" at its foot, and the words stay still: lighting words live
 * would need on-device speech alignment, which isn't built (s03).
 */

import * as React from "react";
import { Camera, Hourglass, Mic, Play, Star } from "lucide-react";
import { MOOD_ICON } from "@/components/studio-kit/MoodTapeChip";
import { Reel } from "@/components/studio-kit/kit";
import { ListeningRing } from "@/components/studio-kit/ListeningRing";
import type { SsyncPage } from "@/lib/storysync/manifest";
import type { MoodName } from "./moods-ui";
import { formatClock } from "./types";
import "./stage.css";

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
  /** The story's music: named on the status row ("Wonder · music on"). */
  mood: MoodName;
  musicOn: boolean;
  /**
   * Which story is on the Stage. The remembered light belongs to one story:
   * a new, opened or deleted story never shows the last one's picture.
   */
  storyKey?: string;
  onTextChange: (text: string) => void;
  onPickPhoto: () => void;
}

const MONO = "font-ss-mono";

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
  mood,
  musicOn,
  storyKey = "",
  onTextChange,
  onPickPhoto,
}: StageProps) {
  const image = page?.illustration?.url;
  const text = page?.text?.content ?? "";
  const hasNarration = Boolean(page?.text?.audioUrl);
  const progress = clipDuration > 0 ? Math.min(1, position / clipDuration) : 0;
  const take = formatClock(recordSeconds);

  // The light outlives the picture: a page with no picture keeps the last
  // picture's light, the Player's rule. One source — the page prop. A
  // different story starts with its own light (or the navy room).
  const [light, setLight] = React.useState<{ story: string; url: string | undefined }>({
    story: storyKey,
    url: image,
  });
  if (light.story !== storyKey || (image && image !== light.url)) {
    setLight({ story: storyKey, url: image });
  }
  const backdrop = image ?? (light.story === storyKey ? light.url : undefined);

  // The photo's own shape, so the frame (and its ring) hug the picture. Until
  // the picture has told us its shape the frame waits unseen (stage.css
  // `[data-shape="pending"]`), so a landscape photo never flashes square first.
  /** The status row's mood icon: the mood's own (MoodTapeChip's set), Star if unknown. */
  const MoodIcon = MOOD_ICON[mood] ?? Star;
  const [shape, setShape] = React.useState<{ url: string; ratio: number } | null>(null);
  const shapeKnown = Boolean(image && shape && shape.url === image);
  const ratio = shapeKnown && shape ? shape.ratio : 1;

  const state = recording
    ? `recording · ${take}`
    : narrating
      ? "narrating"
      : hasNarration
        ? "voice ready"
        : "browser voice";

  return (
    <div
      data-studio="stage"
      data-recording={recording ? "true" : "false"}
      className="studio-monitor h-full"
    >
      {/* monitor header — mono readouts, nothing that competes with the page */}
      <div
        data-studio="stage-head"
        className="relative z-[2] flex h-9 flex-none items-center justify-between gap-3 border-b border-white/6 bg-black/40 px-3.5"
      >
        <span className={`${MONO} text-[11px] tracking-[0.14em] text-ss-fg-3 uppercase`}>
          Page {pageNumber} / {pageCount}
        </span>
        {recording ? (
          <span
            data-studio="stage-rec-chip"
            className="absolute top-1/2 left-1/2 inline-flex h-6 -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-[#E3452F]/55 bg-[#E3452F]/16 px-2.5 text-[12px] leading-none font-medium whitespace-nowrap text-[#ffb3a6]"
          >
            <i
              aria-hidden="true"
              className="size-[7px] flex-none rounded-full bg-ss-red shadow-[0_0_0_3px_rgba(227,69,47,0.25)]"
            />
            recording
          </span>
        ) : null}
        <div className="flex items-center gap-3">
          {hasNarration && !recording ? (
            <span
              data-studio="stage-voice-chip"
              className={`${MONO} inline-flex items-center gap-1.5 rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-[3px] text-[10px] tracking-[0.14em] text-amber-200 uppercase`}
            >
              <Mic aria-hidden="true" className="size-3 flex-none" strokeWidth={2.2} />
              voice
            </span>
          ) : null}
          <span className="flex items-center gap-2 opacity-80">
            <Reel spinning={playing || recording} size={22} />
            <Reel spinning={playing || recording} size={22} />
          </span>
        </div>
      </div>

      <div className="stage-body">
        {/* the light in the room: this page's picture (or the last one), blurred */}
        <div data-studio="stage-backdrop" className="stage-backdrop" aria-hidden="true">
          {backdrop ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={backdrop} alt="" />
          ) : null}
        </div>

        <div key={page?.id ?? "empty"} className="studio-monitor-page">
          {/* ---------------------------------------------------- picture */}
          <div data-studio="stage-zone" className="stage-zone">
            {image ? (
              <ListeningRing
                active={recording}
                label={`Listening… ${take}`}
                labelProps={{ "data-studio": "listening-pill" }}
                className="stage-frame"
                data-shape={shapeKnown ? "known" : "pending"}
                style={{ "--stage-ar": String(ratio) } as React.CSSProperties}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  data-studio="stage-photo"
                  src={image}
                  alt={page?.illustration?.alt || `Picture for page ${pageNumber}`}
                  className="stage-photo"
                  onLoad={(event) => {
                    const { naturalWidth: w, naturalHeight: h } = event.currentTarget;
                    setShape({ url: image, ratio: w > 0 && h > 0 ? w / h : 1 });
                  }}
                  // A picture that cannot load still shows its frame (and its alt).
                  onError={() => setShape({ url: image, ratio: 1 })}
                />
              </ListeningRing>
            ) : (
              <ListeningRing
                active={recording}
                label={`Listening… ${take}`}
                labelProps={{ "data-studio": "listening-pill" }}
                className="stage-frame stage-frame--blank"
              >
                {/* Mid-take the camera waits (it can take the microphone, and a
                    new picture would change the page being told): the key
                    stays where it is, dimmed, and says why. */}
                <button
                  type="button"
                  onClick={onPickPhoto}
                  disabled={photoBusy || recording}
                  data-studio="stage-add-picture"
                  title={recording ? "Finish the recording first" : undefined}
                  className={`sk-focus flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/18 bg-white/[0.03] p-6 text-center transition-colors duration-300 ease-out motion-reduce:transition-none ${
                    recording
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer hover:border-amber-400/50 hover:bg-amber-500/[0.06] disabled:cursor-wait"
                  }`}
                >
                  {photoBusy ? (
                    <Hourglass aria-hidden="true" className="size-11 text-white/70" strokeWidth={1.6} />
                  ) : (
                    <Camera aria-hidden="true" className="size-11 text-ss-gold-2" strokeWidth={1.6} />
                  )}
                  <span className="text-base font-semibold text-white/85">
                    {photoBusy ? "Getting your picture ready…" : "Add a picture"}
                  </span>
                  <span className="text-sm text-white/45">
                    {recording ? "Finish the recording first" : "Take a photo of your drawing"}
                  </span>
                </button>
              </ListeningRing>
            )}
          </div>

          {/* ------------------------------------------------- story text */}
          <div
            data-studio="stage-text"
            className="relative flex min-h-0 flex-[0_1_auto] flex-col gap-2 px-5 pt-3 pb-3 sm:px-8"
          >
            <label className="sr-only" htmlFor="studio-page-text">
              Story text for page {pageNumber}
            </label>
            <textarea
              id="studio-page-text"
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              rows={2}
              placeholder="Once upon a time…"
              spellCheck
              className="studio-story-text studio-story-input studio-scroll max-h-[22vh] min-h-[3.2rem] overflow-y-auto rounded-lg text-center focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-amber-500"
            />
            <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-white/8">
              <div
                className="studio-progress-bar h-full"
                style={{ width: `${Math.round(progress * 100)}%` }}
                aria-hidden="true"
              />
            </div>
            <div
              data-studio="stage-status"
              className={`${MONO} flex items-center justify-between gap-3 text-[10.5px] leading-none tracking-[0.1em] text-ss-fg-3 normal-case`}
            >
              <span data-studio="stage-status-state" className="inline-flex items-center gap-[7px]">
                {recording ? (
                  <i aria-hidden="true" className="size-1.5 flex-none rounded-full bg-ss-red" />
                ) : narrating ? (
                  <Play aria-hidden="true" className="size-3 flex-none" />
                ) : null}
                {state}
              </span>
              <span data-studio="stage-status-music" className="inline-flex items-center gap-[7px]">
                {musicOn ? (
                  // The mood's own icon (the reference sprite's): a moon for Calm, a cloud for Hush.
                  <MoodIcon
                    aria-hidden="true"
                    data-mood-icon={mood}
                    className="size-3 flex-none"
                    style={{ color: `var(--mood-${mood.toLowerCase()})` }}
                  />
                ) : null}
                {musicOn ? `${mood} · music on` : "music off"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Stage;
