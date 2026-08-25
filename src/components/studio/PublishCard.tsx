"use client";

/**
 * Finishing a story: the tape being printed, then the printed tape.
 * Register B lives here — this is the artifact, not the room.
 */

import * as React from "react";
import { BigButton, GlassPanel, Reel, TapeLabel } from "@/components/studio-kit/kit";

export type PublishStepState = "pending" | "active" | "done" | "error";

export interface PublishStep {
  id: string;
  label: string;
  state: PublishStepState;
  detail?: string;
}

export interface PublishCardProps {
  phase: "publishing" | "published";
  steps: PublishStep[];
  title: string;
  author: string;
  pageCount: number;
  durationLabel: string;
  codecLabel: string;
  shareUrl: string | null;
  cloud: boolean;
  note: string | null;
  error: string | null;
  onDownload: () => void;
  onDeleteEverything: () => void;
  onBack: () => void;
  onRetry: () => void;
}

const STEP_GLYPH: Record<PublishStepState, string> = {
  pending: "○",
  active: "◐",
  done: "●",
  error: "✕",
};

export function PublishCard({
  phase,
  steps,
  title,
  author,
  pageCount,
  durationLabel,
  codecLabel,
  shareUrl,
  cloud,
  note,
  error,
  onDownload,
  onDeleteEverything,
  onBack,
  onRetry,
}: PublishCardProps) {
  const [copied, setCopied] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="studio-fade fixed inset-0 z-[60] overflow-y-auto bg-[#070a12]/94 p-4 backdrop-blur-md">
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center py-6">
        {phase === "publishing" ? (
          <GlassPanel
            role="dialog"
            aria-modal="true"
            aria-label="Finishing your story"
            aria-busy={!error}
            className="studio-rise border-white/12 bg-[#0b1020]/95 p-6"
          >
            <div className="flex items-center gap-4">
              <Reel spinning={!error} size={48} />
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {error ? "That did not finish" : "Printing your tape…"}
                </h2>
                <p className="text-sm text-white/50">
                  {error ? "Nothing was lost — your story is still here." : "Hold on a moment."}
                </p>
              </div>
            </div>

            <ol className="mt-5 space-y-2.5" style={{ fontFamily: "var(--font-plex-mono), monospace" }}>
              {steps.map((step) => (
                <li key={step.id} className="flex items-start gap-3 text-sm">
                  <span
                    aria-hidden="true"
                    className={
                      step.state === "done"
                        ? "text-amber-400"
                        : step.state === "active"
                          ? "text-amber-200"
                          : step.state === "error"
                            ? "text-[#ff6a52]"
                            : "text-white/25"
                    }
                  >
                    {STEP_GLYPH[step.state]}
                  </span>
                  <span className={step.state === "pending" ? "text-white/35" : "text-white/80"}>
                    {step.label}
                    {step.detail ? <span className="text-white/40"> · {step.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ol>

            {!error ? <div className="studio-busy mt-5 h-[3px] w-full rounded-full bg-white/8" /> : null}

            {error ? (
              <>
                <p role="alert" className="mt-4 rounded-xl border border-[#E3452F]/40 bg-[#E3452F]/10 p-3 text-sm text-white/80">
                  {error}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <BigButton icon="↩" label="Back" variant="ghost" onClick={onBack} className="w-full justify-center" />
                  <BigButton icon="↻" label="Try again" variant="gold" onClick={onRetry} className="w-full justify-center" />
                </div>
              </>
            ) : null}
          </GlassPanel>
        ) : (
          <div>
            <TapeLabel
              className="studio-printing"
              title={title}
              author={author || undefined}
              meta={
                <>
                  SIDE A · {pageCount} {pageCount === 1 ? "PAGE" : "PAGES"} · {durationLabel} ·{" "}
                  {codecLabel}
                  <br />
                  SSYNC 2.0 · {cloud ? "SHARED UNLISTED" : "ON THIS DEVICE"}
                </>
              }
            />

            <GlassPanel className="studio-rise mt-4 border-white/12 bg-[#0b1020]/95 p-5">
              <h2 className="text-lg font-semibold text-white">Your tape is ready</h2>

              {shareUrl ? (
                <div className="mt-3">
                  <p
                    className="text-[11px] tracking-[0.18em] text-white/40 uppercase"
                    style={{ fontFamily: "var(--font-plex-mono), monospace" }}
                  >
                    private link
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      readOnly
                      value={shareUrl}
                      aria-label="Share link"
                      onFocus={(e) => e.currentTarget.select()}
                      className="sk-focus h-12 min-w-0 flex-1 rounded-xl border border-white/12 bg-black/50 px-3 text-sm text-white/85"
                      style={{ fontFamily: "var(--font-plex-mono), monospace" }}
                    />
                    <button
                      type="button"
                      onClick={copy}
                      className="sk-focus h-12 flex-none rounded-xl border border-amber-400/50 bg-amber-500/15 px-4 text-sm font-semibold text-amber-100 hover:bg-amber-500/25"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-white/40">
                    Unlisted and unguessable. Only someone holding this link can open the story —
                    deleting the story revokes it.
                  </p>
                </div>
              ) : (
                <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm leading-relaxed text-white/60">
                  Saved on this device. There is no cloud library configured, so download the
                  <span style={{ fontFamily: "var(--font-plex-mono), monospace" }}> .storysync </span>
                  file to keep the tape or hand it to someone.
                </p>
              )}

              {note ? (
                <p className="mt-3 rounded-xl border border-amber-400/35 bg-amber-500/10 p-3 text-sm text-amber-100">
                  {note}
                </p>
              ) : null}

              <div className="mt-4 grid gap-2">
                <BigButton
                  icon="⬇"
                  label="Download the .storysync file"
                  variant="gold"
                  onClick={onDownload}
                  className="w-full justify-center"
                />
                <BigButton
                  icon="↩"
                  label="Back to the studio"
                  variant="ghost"
                  onClick={onBack}
                  className="w-full justify-center"
                />
                <BigButton
                  icon="🗑"
                  label={confirmDelete ? "Tap again to delete everything" : "Delete everything"}
                  variant={confirmDelete ? "red" : "ghost"}
                  onClick={() => {
                    if (confirmDelete) onDeleteEverything();
                    else setConfirmDelete(true);
                  }}
                  className="w-full justify-center"
                />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-white/35">
                Delete removes the pictures, the recordings, the saved copy and the link. Nothing
                is kept in an archive.
              </p>
            </GlassPanel>
          </div>
        )}
      </div>
    </div>
  );
}

export default PublishCard;
