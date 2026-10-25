"use client";

/**
 * "Open <title>?" — the one question asked before an opened tape replaces the
 * story on the Stage (T15). A child's work is only kept on this device, so it
 * is never replaced without a grown-up saying so.
 *
 *   Keep my story  closes the dialog; the story (and its saved draft) stays
 *                  exactly as it was. Escape does the same.
 *   Open it        replaces the story with the opened tape.
 *
 * Focus moves to "Keep my story", the safe answer, stays inside the dialog
 * while it is open (a click on the backdrop or the panel keeps it there), and
 * goes back to where it was when the dialog appeared: the opener after a click
 * or a key, or wherever the parent was when a link opened the tape. With
 * nowhere to go back to, `returnFocusTo` stands in.
 */

import * as React from "react";
import { FolderOpen } from "lucide-react";
import { BigButton, GlassPanel } from "@/components/studio-kit/kit";

export interface OpenTapeDialogProps {
  /** The opened tape's title. */
  title: string;
  onKeep: () => void;
  onOpen: () => void;
  /**
   * Where focus goes back to when nothing was focused as the dialog appeared
   * (a `?open=` link at boot): the "Open a tape" control.
   */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
}

export function OpenTapeDialog({ title, onKeep, onOpen, returnFocusTo }: OpenTapeDialogProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const active = document.activeElement;
    const before = active instanceof HTMLElement && active !== document.body ? active : null;
    const fallback = returnFocusTo?.current ?? null;
    rootRef.current?.querySelector<HTMLElement>('[data-studio="open-tape-keep"]')?.focus();
    return () => {
      if (before?.isConnected) before.focus();
      if (!before || document.activeElement !== before) fallback?.focus();
    };
  }, [returnFocusTo]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onKeep();
      return;
    }
    if (event.key !== "Tab") return;
    const root = rootRef.current;
    const focusable = Array.from(root?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
    if (focusable.length === 0) return;
    // From the panel itself (focused by a click on its text) Tab goes to the
    // first button and Shift+Tab to the last, never out of the dialog.
    const index = focusable.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && index <= 0) {
      event.preventDefault();
      focusable[focusable.length - 1].focus();
    } else if (!event.shiftKey && (index === -1 || index === focusable.length - 1)) {
      event.preventDefault();
      focusable[0].focus();
    }
  };

  // A click on the backdrop is not an answer, and must not drop focus to the
  // page behind an aria-modal dialog.
  const onBackdropMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) event.preventDefault();
  };

  return (
    <div
      ref={rootRef}
      className="studio-fade fixed inset-0 z-[80] flex items-center justify-center bg-black/72 p-4 backdrop-blur-sm"
      role="presentation"
      onKeyDown={onKeyDown}
      onMouseDown={onBackdropMouseDown}
    >
      <GlassPanel
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-open-title"
        aria-describedby="studio-open-body"
        data-studio="open-tape-dialog"
        // A click on the panel's words lands focus here, inside the dialog.
        tabIndex={-1}
        className="studio-rise w-full max-w-sm border-white/14 bg-[#0b1020]/95 p-5 outline-none"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 text-amber-300"
          >
            <FolderOpen className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <h2 id="studio-open-title" className="text-lg leading-snug font-semibold text-white">
            Open {title}?
          </h2>
        </div>
        <p id="studio-open-body" className="mt-2 text-sm leading-relaxed text-white/60">
          The story on the Stage will be replaced. It is only kept on this device, so download it
          first if you want to keep it.
        </p>
        <div className="mt-4 grid gap-2">
          <BigButton
            data-studio="open-tape-keep"
            icon="↩"
            label="Keep my story"
            variant="gold"
            className="w-full justify-center"
            onClick={onKeep}
          />
          <BigButton
            icon={<FolderOpen className="h-[18px] w-[18px]" strokeWidth={1.8} />}
            label="Open it"
            variant="ghost"
            className="w-full justify-center"
            onClick={onOpen}
          />
        </div>
      </GlassPanel>
    </div>
  );
}

export default OpenTapeDialog;
