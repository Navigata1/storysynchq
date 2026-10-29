"use client";

/**
 * FILMSTRIP — the pages as a strip of tape (s03 "Filmstrip as tape").
 *
 * The frames ride a tape-brown ribbon (the kit TapeRibbon) running behind them
 * at mid-height. A told page carries a red Mic badge; the page being told
 * carries a static red dot. The last tile snaps the next drawing: it adds a
 * page and opens the camera. On the right, the controls that move or pull the
 * selected page; while the mic is live they give way to one locked "move"
 * pill. On a phone (< 768px) they rest folded into one 44px "move" key
 * (aria-expanded) that opens them, so the housing never covers the strip. Under the frames runs the mood lane, one segment per page in that
 * page's mood colour, with the current page's mood named at its right end
 * ("WONDER · GENTLE MUSIC ADDED FOR YOU").
 *
 * The ribbon, the frames and the lane share one scrolling track, so on a phone
 * they move together; the move controls and the lane's label stay pinned at
 * the strip's right end. Layout lives in filmstrip.css.
 */

import * as React from "react";
import { Camera, ChevronLeft, ChevronRight, Lock, Mic, Pen, Star, Trash2, type LucideIcon } from "lucide-react";
import type { MoodName } from "@/lib/audio/moods";
import type { SsyncPage } from "@/lib/storysync/manifest";
import { TapeRibbon } from "@/components/studio-kit/TapeRibbon";
import { MOOD_ICON } from "@/components/studio-kit/MoodTapeChip";
import "./filmstrip.css";

const LOCKED_TITLE = "Finish the recording first";
const SNAP_LABEL = "Snap the next drawing";

export interface FilmstripProps {
  pages: SsyncPage[];
  activeIndex: number;
  /**
   * The page's mood, one entry per page (`null`: no music on that page). The
   * lane draws one segment per page and names the current page's mood; when
   * no page has music there is no lane.
   */
  moods: (MoodName | null)[];
  /**
   * The tape does not move while the mic is live: a page change mid-take
   * would file the recording against the wrong page.
   */
  locked?: boolean;
  onSelect: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDelete: (index: number) => void;
  /** "Snap the next drawing": add a page and open the camera for it. */
  onSnapNext: () => void;
}

const moodToken = (mood: MoodName) => `var(--mood-${mood.toLowerCase()})`;

/** A glide along the tape, or a cut under reduced motion (browser only). */
const glide = (): ScrollBehavior =>
  (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false) ? "auto" : "smooth";

/** Is the tile wholly inside the strip's scrollport less its scroll-padding (clear of the move controls)? */
function insidePaddedScrollport(strip: HTMLElement, tile: HTMLElement): boolean {
  const cs = getComputedStyle(strip);
  const port = strip.getBoundingClientRect();
  const start = port.left + strip.clientLeft + (parseFloat(cs.getPropertyValue("scroll-padding-inline-start")) || 0);
  const end = port.left + strip.clientLeft + strip.clientWidth - (parseFloat(cs.getPropertyValue("scroll-padding-inline-end")) || 0);
  const r = tile.getBoundingClientRect();
  return r.left >= start - 0.5 && r.right <= end + 0.5;
}

/** Keyboard (or keyboard-like) focus; a browser without :focus-visible counts every focus. */
function focusVisible(el: HTMLElement): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

function StripButton({
  label,
  Icon,
  onClick,
  disabled,
}: {
  label: string;
  Icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="sk-focus flex h-11 w-11 items-center justify-center rounded-[11px] text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={2} />
    </button>
  );
}

export function Filmstrip({
  pages,
  activeIndex,
  moods,
  locked = false,
  onSelect,
  onMove,
  onDelete,
  onSnapNext,
}: FilmstripProps) {
  const stripRef = React.useRef<HTMLDivElement | null>(null);
  /**
   * The phone's folded move controls are open (below 768px; ignored above),
   * held as the id of the page they were opened for: they fold again when
   * another page is selected (a move keeps the same page selected, so they
   * stay open for the next nudge).
   */
  const activeId = pages[activeIndex]?.id ?? null;
  const [movesOpenFor, setMovesOpenFor] = React.useState<SsyncPage["id"] | null>(null);
  const movesOpen = movesOpenFor !== null && movesOpenFor === activeId;
  const setMovesOpen = React.useCallback(
    (open: boolean | ((was: boolean) => boolean)) =>
      setMovesOpenFor((was) => {
        const next = typeof open === "function" ? open(was !== null && was === activeId) : open;
        return next ? activeId : null;
      }),
    [activeId],
  );
  const movesToggleRef = React.useRef<HTMLButtonElement | null>(null);
  const housingRef = React.useRef<HTMLDivElement | null>(null);
  const housingId = React.useId();

  // A fold that closes under the keyboard (another page selected, or this
  // one deleted) hands focus back to its key, never to <body>.
  const wasOpen = React.useRef(false);
  React.useLayoutEffect(() => {
    if (wasOpen.current && !movesOpen) {
      const housing = housingRef.current;
      const active = document.activeElement;
      const toggle = movesToggleRef.current;
      if (housing && active instanceof Node && housing.contains(active) && toggle?.getClientRects().length) {
        toggle.focus({ preventScroll: true });
      }
    }
    wasOpen.current = movesOpen;
  }, [movesOpen]);

  // Open, the fold closes on a tap anywhere else (pointerdown outside its key
  // and its keys).
  React.useEffect(() => {
    if (!movesOpen) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (movesToggleRef.current?.contains(target) || housingRef.current?.contains(target)) return;
      setMovesOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [movesOpen, setMovesOpen]);

  /**
   * ...and when focus moves on past it (Tab out of the keys, or back before
   * "move"). Only a focus that lands somewhere else counts: a tap that
   * focuses nothing is the pointerdown's to judge.
   */
  const closeMovesOnLeave = (event: React.FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget as Node | null;
    if (!movesOpen || !next) return;
    if (movesToggleRef.current?.contains(next) || housingRef.current?.contains(next)) return;
    setMovesOpen(false);
  };

  // Keep the selected frame in view when the transport turns the page
  // (a glide, or a cut under reduced motion).
  React.useEffect(() => {
    const strip = stripRef.current;
    const child = strip?.querySelector<HTMLElement>(`[data-page-index="${activeIndex}"]`);
    child?.scrollIntoView({ block: "nearest", inline: "center", behavior: glide() });
  }, [activeIndex]);

  // Keep a tile that Tab reaches clear of the pinned move controls. The
  // browser's own focus scroll skips any tile already inside the scroller and
  // ignores scroll-padding when it checks, so a tile can land under the
  // controls. One frame later (after that scroll), a keyboard-focused tile
  // that is not inside the padded scrollport is centred in it, like a page the
  // Transport turns to: scrollIntoView honours the padding, and a centred tile
  // is its own snap position, so proximity snapping cannot pull a neighbour in
  // instead. A tap or click is left to the selection scroll above. Focus
  // bubbles in React, so one handler covers every frame and the Snap tile.
  const clearFrame = React.useRef(0);
  React.useEffect(() => () => cancelAnimationFrame(clearFrame.current), []);
  const keepClear = (event: React.FocusEvent<HTMLDivElement>) => {
    const tile = (event.target as HTMLElement).closest<HTMLElement>(".studio-thumb, .studio-snap");
    if (!tile) return;
    cancelAnimationFrame(clearFrame.current);
    clearFrame.current = requestAnimationFrame(() => {
      const strip = stripRef.current;
      if (!strip || document.activeElement !== tile || !focusVisible(tile)) return;
      if (insidePaddedScrollport(strip, tile)) return;
      tile.scrollIntoView({ block: "nearest", inline: "center", behavior: glide() });
    });
  };

  const laneMoods = pages.map((_, index) => moods[index] ?? null);
  const hasLane = laneMoods.some((mood) => mood !== null);
  const currentMood = laneMoods[activeIndex] ?? null;
  /** The lane names the mood with its own icon (MoodTapeChip's set), like the Stage. */
  const LaneIcon = currentMood ? (MOOD_ICON[currentMood] ?? Star) : Star;

  return (
    <section aria-label="Pages" className="studio-film">
      <div ref={stripRef} className="studio-strip" data-studio="film-scroll" onFocus={keepClear}>
        <div className="studio-film-track">
          <div className="studio-film-row">
            <TapeRibbon variant="band" thickness={10} className="studio-film-ribbon" />

            {pages.map((page, index) => {
              const current = index === activeIndex;
              const narrated = Boolean(page.text?.audioUrl);
              const image = page.illustration?.url;
              return (
                <button
                  key={page.id}
                  type="button"
                  data-page-index={index}
                  aria-current={current ? "true" : undefined}
                  aria-label={`Page ${index + 1}${narrated ? ", has voice" : ""}${current ? ", selected" : ""}`}
                  onClick={() => onSelect(index)}
                  disabled={locked && !current}
                  title={locked && !current ? LOCKED_TITLE : undefined}
                  className={`studio-thumb sk-focus${current ? " is-current" : ""}${current && locked ? " is-live" : ""}`}
                >
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="" className="studio-thumb-img" />
                  ) : (
                    <span className="studio-thumb-blank" aria-hidden="true">
                      <Pen className="studio-thumb-blank-icon" strokeWidth={2} />
                    </span>
                  )}
                  <span aria-hidden="true" className="studio-thumb-num">
                    {index + 1}
                  </span>
                  {narrated ? (
                    <span aria-hidden="true" data-studio="frame-voice" className="studio-thumb-voice">
                      <Mic strokeWidth={2.25} />
                    </span>
                  ) : null}
                  {current && locked ? (
                    <i aria-hidden="true" data-studio="frame-live" className="studio-thumb-live" />
                  ) : null}
                </button>
              );
            })}

            <button
              type="button"
              onClick={onSnapNext}
              disabled={locked}
              title={locked ? LOCKED_TITLE : undefined}
              className="studio-snap sk-focus"
            >
              <Camera aria-hidden="true" className="studio-snap-icon" strokeWidth={2} />
              <span>{SNAP_LABEL}</span>
            </button>

            <div className="studio-film-moves" data-studio="film-moves">
              {locked ? (
                <button type="button" disabled title={LOCKED_TITLE} className="studio-move-locked">
                  <Lock aria-hidden="true" className="h-[13px] w-[13px] flex-none" strokeWidth={2} />
                  move
                </button>
              ) : (
                <>
                  {/* A phone's strip is narrow: the keys rest folded behind "move". */}
                  <button
                    ref={movesToggleRef}
                    type="button"
                    aria-label="Move or delete this page"
                    title="Move or delete this page"
                    aria-expanded={movesOpen}
                    aria-controls={housingId}
                    data-studio="film-moves-toggle"
                    onClick={() => setMovesOpen((open) => !open)}
                    onBlur={closeMovesOnLeave}
                    className="studio-move-toggle sk-focus"
                  >
                    move
                  </button>
                  <div
                    ref={housingRef}
                    id={housingId}
                    className="studio-move-housing"
                    onBlur={closeMovesOnLeave}
                    data-open={movesOpen ? "true" : "false"}
                    onKeyDown={(event) => {
                      if (event.key !== "Escape" || !movesOpen) return;
                      // Folded again, focus back on its key (a wide strip has no fold: nothing to do).
                      const toggle = movesToggleRef.current;
                      if (!toggle || toggle.getClientRects().length === 0) return;
                      event.stopPropagation();
                      setMovesOpen(false);
                      toggle.focus();
                    }}
                  >
                    <StripButton
                      label="Move this page earlier"
                      Icon={ChevronLeft}
                      onClick={() => onMove(activeIndex, -1)}
                      disabled={activeIndex <= 0}
                    />
                    <StripButton
                      label="Move this page later"
                      Icon={ChevronRight}
                      onClick={() => onMove(activeIndex, 1)}
                      disabled={activeIndex >= pages.length - 1}
                    />
                    <StripButton
                      label="Delete this page"
                      Icon={Trash2}
                      onClick={() => onDelete(activeIndex)}
                      disabled={pages.length <= 1}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {hasLane ? (
            <div data-studio="mood-lane" className="studio-lane">
              {laneMoods.map((mood, index) => (
                <i
                  key={pages[index].id}
                  aria-hidden="true"
                  data-studio="mood-segment"
                  data-mood={mood ?? "none"}
                  className="studio-lane-seg"
                  style={mood ? ({ "--lane-mood": moodToken(mood) } as React.CSSProperties) : undefined}
                />
              ))}
              <i aria-hidden="true" className="studio-lane-rest" />
              {currentMood ? (
                <span
                  data-studio="mood-lane-label"
                  className="studio-lane-label"
                  style={{ "--lane-mood": moodToken(currentMood) } as React.CSSProperties}
                >
                  <LaneIcon aria-hidden="true" className="studio-lane-icon" strokeWidth={2} />
                  {`${currentMood} · gentle music added for you`}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default Filmstrip;
