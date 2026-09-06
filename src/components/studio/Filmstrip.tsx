"use client";

/**
 * FILMSTRIP — the pages as a length of tape.
 * Tap a frame to work on it; the cluster on the right moves or pulls the
 * selected frame. A 🎙 badge means that page already has a voice on it.
 */

import * as React from "react";
import type { SsyncPage } from "@/lib/storysync/manifest";

export interface FilmstripProps {
  pages: SsyncPage[];
  activeIndex: number;
  /**
   * The tape does not move while the mic is live: a page change mid-take
   * would file the recording against the wrong page.
   */
  locked?: boolean;
  onSelect: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDelete: (index: number) => void;
  onAdd: () => void;
}

function StripButton({
  label,
  glyph,
  onClick,
  disabled,
}: {
  label: string;
  glyph: string;
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
      className="sk-focus flex h-11 w-11 items-center justify-center rounded-xl border border-white/12 bg-white/5 text-lg text-white/80 transition-colors hover:border-white/25 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}

export function Filmstrip({
  pages,
  activeIndex,
  locked = false,
  onSelect,
  onMove,
  onDelete,
  onAdd,
}: FilmstripProps) {
  const stripRef = React.useRef<HTMLDivElement | null>(null);

  // Keep the selected frame in view when the transport turns the page.
  React.useEffect(() => {
    const strip = stripRef.current;
    const child = strip?.querySelector<HTMLElement>(`[data-page-index="${activeIndex}"]`);
    child?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [activeIndex]);

  return (
    <section
      aria-label="Pages"
      className="flex items-center gap-3 border-t border-white/8 bg-black/25 px-3 py-2 backdrop-blur-xl"
    >
      <div ref={stripRef} className="studio-strip min-w-0 flex-1">
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
              title={locked && !current ? "Finish the recording first" : undefined}
              className={`studio-thumb sk-focus ${current ? "is-current" : ""}`}
            >
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="studio-thumb-img" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xl text-white/25" aria-hidden="true">
                  ✎
                </span>
              )}
              <span
                aria-hidden="true"
                className="absolute top-0 left-0 rounded-br-lg bg-black/70 px-1.5 py-0.5 text-[10px] text-white/80"
                style={{ fontFamily: "var(--font-plex-mono), monospace" }}
              >
                {index + 1}
              </span>
              {narrated ? (
                <span
                  aria-hidden="true"
                  className="absolute right-1 bottom-1 rounded-full bg-[#E3452F] px-1.5 py-[1px] text-[10px] leading-none text-white"
                >
                  🎙
                </span>
              ) : null}
            </button>
          );
        })}

        <button
          type="button"
          onClick={onAdd}
          disabled={locked}
          aria-label="Add a new page"
          title={locked ? "Finish the recording first" : "Add a new page"}
          className="studio-thumb sk-focus flex items-center justify-center border-dashed text-2xl text-amber-300/80 hover:border-amber-400/60 hover:text-amber-200"
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>

      <div className="flex flex-none items-center gap-1.5">
        <StripButton
          label="Move this page earlier"
          glyph="◀"
          onClick={() => onMove(activeIndex, -1)}
          disabled={locked || activeIndex <= 0}
        />
        <StripButton
          label="Move this page later"
          glyph="▶"
          onClick={() => onMove(activeIndex, 1)}
          disabled={locked || activeIndex >= pages.length - 1}
        />
        <StripButton
          label="Delete this page"
          glyph="🗑"
          onClick={() => onDelete(activeIndex)}
          disabled={locked || pages.length <= 1}
        />
      </div>
    </section>
  );
}

export default Filmstrip;
