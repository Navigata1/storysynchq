"use client";

/**
 * DeckChip — the tape deck in the corner of the room: three sounds at once
 * (brief design_system (7); s02 expanded, s05 compact).
 *
 * A glass pill (radius 18) with two 18–20 px kit Reels in a little window and
 * a mono page counter. From 768 px wide it expands to three mono rows, each
 * after a decorative micro-glyph:
 *
 *   ▮▯▮ VOICE  · …   a 9-bar mini waveform — gold while a voice speaks, dim
 *                    otherwise; static bars, never a loop
 *   •·↓ MELODY · …   three note dots and a small down arrow (the duck)
 *   ○   CHIME  · …   a hollow ring
 *
 * Below 768 px it is the s05 pill: reels, counter, and — when the tape names
 * its narrator — a hairline, the lucide Mic and the name. No rows.
 *
 * `idle` is the room's chrome having idled out. The rows fold away with the
 * chrome (the reels and the counter never hide); the narrator group does the
 * opposite — it opens when the chrome idles, so a listener always has "whose
 * voice" in view without the two ever saying it twice. Reduced motion: the
 * reels rest on their 18° frame (kit.css) and the folds snap.
 *
 * The chip is a `role="group"` named "Now playing": the rows carry what no
 * other element states (the mood, the time to the turn). It is not a live
 * region — the countdown is never announced second by second.
 *
 * Tape packs (T09b): each reel sits on a tape-brown pack disc — the tape wound
 * on that side, "the left pack big early in a tape, the right pack big late".
 * The consumer hands in the diameters (`packs`, from the Player's
 * ./tape-position for the reel sizes in DECK_REEL_PX) and draws the discs'
 * look and ease (the Player's deck.css); here they only take their place under
 * the reels, decorative like the reels themselves.
 *
 * Hooks kept from T03 (the Player's deck): the consumer's `className` (the
 * Player passes `pl-deck`), `countClassName` (`pl-deck-read`), and
 * `data-pl="deck-voice" | "deck-rule" | "deck-mic" | "deck-narrator"`; T09b
 * adds `data-pl="pack-left" | "pack-right"`.
 * Nothing here counts, stores or sends anything: it draws what it is handed.
 */

import * as React from "react";
import { Mic } from "lucide-react";
import { Reel } from "./kit";
import "./deck-chip.css";

export interface DeckChipRows {
  /** "VOICE · …" */
  voice: string;
  /** "MELODY · …" */
  melody: string;
  /** "CHIME · …" */
  chime: string;
}

/**
 * The reels' diameters in px (./deck-chip.css): the phone pill's, and the
 * expanded chip's from 768 px wide. Pack sizes are worked out for these.
 */
export const DECK_REEL_PX = { pill: 18, expanded: 20 } as const;

/** Diameters, in px, of the tape wound under the left and the right reel. */
export interface DeckPackSizes {
  left: number;
  right: number;
}

/** Pack diameters for each chip size (the reels differ: DECK_REEL_PX). */
export interface DeckPacks {
  pill: DeckPackSizes;
  expanded: DeckPackSizes;
}

export interface DeckChipProps {
  /** 1-based page on screen. */
  page: number;
  /** Pages on the tape. */
  total: number;
  /** The tape is rolling: the reels turn. */
  spinning?: boolean;
  /** A voice is speaking: the waveform glyph is lit. */
  speaking?: boolean;
  /** The three rows, shown from 768 px wide. Omit for a pill with no rows. */
  rows?: DeckChipRows | null;
  /** `metadata.narrator` — the name after the mic. */
  narrator?: string;
  /** The room's chrome has idled out: rows fold, the narrator opens. */
  idle?: boolean;
  /** Tape-pack discs under the reels. Omit for bare reels. */
  packs?: DeckPacks | null;
  /** Extra classes on the root (the Player passes `pl-deck`). */
  className?: string;
  /** Extra classes on the counter (the Player passes `pl-deck-read`). */
  countClassName?: string;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const pad = (n: number) => String(Math.max(0, n)).padStart(2, "0");

/** The 9-bar waveform: heights from the reference, centred on a 12-unit line. */
const WAVE = [4, 8, 12, 6, 10, 4, 8, 5, 2];

function Glyph({ kind, speaking }: { kind: "wave" | "notes" | "ring"; speaking?: boolean }) {
  return (
    <svg
      className={cx("sk-deck-glyph", `sk-deck-glyph--${kind}`)}
      data-sk="deck-glyph"
      data-glyph={kind}
      data-speaking={kind === "wave" ? (speaking ? "true" : "false") : undefined}
      viewBox="0 0 26 12"
      width={26}
      height={12}
      aria-hidden="true"
      focusable="false"
    >
      {kind === "wave" ? (
        WAVE.map((h, i) => <rect key={i} x={i * 3} y={(12 - h) / 2} width={2} height={h} rx={1} />)
      ) : kind === "notes" ? (
        <>
          <circle cx={2.5} cy={8} r={2.2} />
          <circle cx={8.5} cy={3.5} r={2.2} />
          <circle cx={14.5} cy={6} r={2.2} />
          <path d="M22 1.5v8M19 6.8l3 3 3-3" />
        </>
      ) : (
        <>
          <circle className="sk-deck-ring" cx={6} cy={6} r={4.6} fill="none" />
          <circle className="sk-deck-ring-dot" cx={6} cy={6} r={1.4} />
        </>
      )}
    </svg>
  );
}

/**
 * One side's tape pack: a disc centred on its reel's hub (it shares the
 * reel's position class), sized for the pill and for the expanded chip.
 */
function Pack({ side, pill, expanded }: { side: "left" | "right"; pill: number; expanded: number }) {
  return (
    <span
      className={cx("sk-deck-pack", side === "left" ? "sk-deck-reel--a" : "sk-deck-reel--b")}
      data-pl={side === "left" ? "pack-left" : "pack-right"}
      style={
        {
          "--sk-pack-pill": `${pill.toFixed(2)}px`,
          "--sk-pack-expanded": `${expanded.toFixed(2)}px`,
        } as React.CSSProperties
      }
    />
  );
}

/** "VOICE · <name>" → <b>VOICE</b> · <name> — the key quieter than its value. */
function Row({ name, text, speaking }: { name: "voice" | "melody" | "chime"; text: string; speaking?: boolean }) {
  const cut = text.indexOf(" · ");
  const key = cut >= 0 ? text.slice(0, cut) : text;
  const value = cut >= 0 ? text.slice(cut) : "";
  return (
    <span className="sk-deck-row" data-sk="deck-row" data-row={name}>
      <Glyph kind={name === "voice" ? "wave" : name === "melody" ? "notes" : "ring"} speaking={speaking} />
      <span className="sk-deck-row-text">
        <b>{key}</b>
        {value}
      </span>
    </span>
  );
}

export function DeckChip({
  page,
  total,
  spinning = false,
  speaking = false,
  rows,
  narrator,
  idle = false,
  packs,
  className,
  countClassName,
}: DeckChipProps) {
  const name = narrator?.trim();
  return (
    <div
      className={cx("sk-deck", className)}
      data-sk="deck-chip"
      data-idle={idle ? "true" : "false"}
      data-live={spinning ? "true" : "false"}
      role="group"
      aria-label="Now playing"
    >
      <span className="sk-deck-left">
        <span className="sk-deck-win" aria-hidden="true">
          {packs ? (
            <>
              <Pack side="left" pill={packs.pill.left} expanded={packs.expanded.left} />
              <Pack side="right" pill={packs.pill.right} expanded={packs.expanded.right} />
            </>
          ) : null}
          <Reel spinning={spinning} size={20} className="sk-deck-reel sk-deck-reel--a" />
          <Reel spinning={spinning} size={20} className="sk-deck-reel sk-deck-reel--b" />
        </span>
        <span className={cx("sk-deck-count", countClassName)} data-sk="deck-count">
          {pad(page)} / {pad(total)}
        </span>
      </span>

      {/* Whose voice (s05): a hairline, the mic, the narrator's name. */}
      {name ? (
        <span className="sk-deck-voice" data-pl="deck-voice">
          <span className="sk-deck-hair" data-pl="deck-rule" />
          <span className="sk-deck-who">
            <Mic data-pl="deck-mic" size={12} strokeWidth={2} aria-hidden="true" className="sk-deck-mic" />
            <span className="sk-deck-name" data-pl="deck-narrator">
              {name}
            </span>
          </span>
        </span>
      ) : null}

      {rows ? (
        <span className="sk-deck-rows-wrap" data-sk="deck-rows">
          <span className="sk-deck-rule" aria-hidden="true" />
          <span className="sk-deck-rows">
            <Row name="voice" text={rows.voice} speaking={speaking} />
            <Row name="melody" text={rows.melody} />
            <Row name="chime" text={rows.chime} />
          </span>
        </span>
      ) : null}
    </div>
  );
}

export default DeckChip;
