"use client";

/**
 * Finishing a story: the tape being printed, then the printed tape.
 * Register B lives here — this is the artifact, not the room.
 *
 * The published card is the end of the whole product loop, so it has to be
 * honest about three different endings (docs/10x-plan.md gap G1 and G7):
 *
 *   a link exists      → the link, a QR a phone camera can read, the system
 *                        share sheet where there is one, and the .storysync file
 *   saved on device    → say exactly that, and hand over the file
 *   cloud needs a login → offer the sign-in, never the words "storage is full"
 *
 * Plus the one line that makes a parent smile: "Made in 6:41".
 *
 * The printed tape (s05, T16): the label comes out of a print slot with the
 * child's first page on it; under it the seven layer chips and "consent
 * written"; then one landscape card in two columns —
 *
 *   left   "Your tape is ready" · MADE IN · the finished steps · the size
 *          meter · Download · Back · "Pull the tape out — delete everything"
 *   right  PRIVATE LINK · the URL and Copy · the paper QR · Share · the note
 *
 * From 1024px the two columns stand side by side and fit a 1180×820 tablet
 * without scrolling. Below that it is one column that shares before it
 * deletes: heading, steps, the right column, then the meter and the buttons.
 * The DOM follows that order at each width (not CSS `order`), so the Tab order
 * is always the order the eye reads. Layout lives in ./publish-card.css.
 */

import * as React from "react";
import QRCode from "qrcode";
import { Check, Copy, Download, Lock, ScanLine, Share, Timer, Undo2, X } from "lucide-react";
import { BigButton, GlassPanel, Reel, TapeLabel } from "@/components/studio-kit/kit";
import { LayerChips } from "@/components/studio-kit/LayerChips";
import type { PacketLayer } from "@/components/studio-kit/PacketBands";
import { PrintSlot, PullTapeIcon } from "@/components/studio-kit/PrintSlot";
import { SizeMeter } from "@/components/studio-kit/SizeMeter";
import "./publish-card.css";

export type PublishStepState = "pending" | "active" | "done" | "error";

export interface PublishStep {
  id: string;
  label: string;
  state: PublishStepState;
  detail?: string;
}

export type AuthMode = "in" | "up";

/** One of the seven packet layers (docs/format-spec.md §7). */
export type LayerName = PacketLayer;

export interface PublishCardProps {
  phase: "publishing" | "published";
  steps: PublishStep[];
  title: string;
  author: string;
  pageCount: number;
  durationLabel: string;
  /** Wall-clock time from the first edit to Finish, e.g. "6:41". */
  madeInLabel: string;
  codecLabel: string;
  shareUrl: string | null;
  cloud: boolean;
  note: string | null;
  error: string | null;
  /** Page 1's picture as published, printed on the label. None when page 1 has none. */
  firstPicture?: { src: string; alt: string } | null;
  /** Which of the seven layers the published tape carries (tape-sheet's `layerPresence`). */
  layers: Record<LayerName, boolean>;
  /** The published tape carries a voice-consent record. */
  consentWritten: boolean;
  /** The published tape's decoded asset bytes (tape-size's `tapeBytes`). */
  size: { pictureBytes: number; voiceBytes: number; totalBytes: number };
  /** Cloud is configured but the save could not make a link without a login. */
  authOffer: boolean;
  authBusy: boolean;
  authError: string | null;
  /** Signed in during this card — one tap away from a link. */
  authReady: boolean;
  onAuth: (mode: AuthMode, email: string, password: string, name: string) => void;
  onMakeLink: () => void;
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

const META_FONT = { fontFamily: "var(--font-plex-mono), monospace" } as const;

/* ------------------------------------------------------- two columns or one */

/** The card's breakpoint, as one media query (publish-card.css follows `data-layout`). */
const TWO_COLUMNS_QUERY = "(min-width: 1024px)";

function subscribeColumns(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(TWO_COLUMNS_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function twoColumnsNow(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(TWO_COLUMNS_QUERY).matches;
}

/** Client-only: the card only ever opens after a tap, so the server answer never shows. */
function useTwoColumns(): boolean {
  return React.useSyncExternalStore(subscribeColumns, twoColumnsNow, () => false);
}

/* ------------------------------------------------------------------- auth */

function AuthPanel({
  busy,
  error,
  ready,
  onAuth,
  onMakeLink,
}: {
  busy: boolean;
  error: string | null;
  ready: boolean;
  onAuth: (mode: AuthMode, email: string, password: string, name: string) => void;
  onMakeLink: () => void;
}) {
  const [mode, setMode] = React.useState<AuthMode>("in");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");

  if (ready) {
    return (
      <div className="mt-3 rounded-2xl border border-emerald-400/35 bg-emerald-500/10 p-3">
        <p className="text-sm leading-relaxed text-white/80">
          Signed in. Make the private link now and the tape moves to your library.
        </p>
        <BigButton
          icon="🔗"
          label="Make my private link"
          variant="gold"
          onClick={onMakeLink}
          disabled={busy}
          className="mt-3 w-full justify-center"
        />
      </div>
    );
  }

  return (
    <form
      className="mt-3 rounded-2xl border border-white/12 bg-white/[0.04] p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!email.trim() || !password) return;
        onAuth(mode, email.trim(), password, name.trim());
      }}
    >
      <div role="radiogroup" aria-label="Sign in or create an account" className="grid grid-cols-2 gap-2">
        {(["in", "up"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`sk-focus min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors ${
              mode === m
                ? "border-amber-400/60 bg-amber-500/15 text-amber-100"
                : "border-white/12 bg-white/5 text-white/65 hover:bg-white/10"
            }`}
          >
            {m === "in" ? "Sign in" : "Create an account"}
          </button>
        ))}
      </div>

      {mode === "up" ? (
        <>
          <label htmlFor="pub-auth-name" className="mt-3 block text-[11px] tracking-[0.18em] text-white/45 uppercase" style={META_FONT}>
            your name
          </label>
          <input
            id="pub-auth-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="sk-focus mt-1 h-12 w-full rounded-xl border border-white/12 bg-black/40 px-3 text-sm text-white"
          />
        </>
      ) : null}

      <label htmlFor="pub-auth-email" className="mt-3 block text-[11px] tracking-[0.18em] text-white/45 uppercase" style={META_FONT}>
        email
      </label>
      <input
        id="pub-auth-email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="sk-focus mt-1 h-12 w-full rounded-xl border border-white/12 bg-black/40 px-3 text-sm text-white"
      />

      <label htmlFor="pub-auth-password" className="mt-3 block text-[11px] tracking-[0.18em] text-white/45 uppercase" style={META_FONT}>
        password
      </label>
      <input
        id="pub-auth-password"
        type="password"
        autoComplete={mode === "in" ? "current-password" : "new-password"}
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="sk-focus mt-1 h-12 w-full rounded-xl border border-white/12 bg-black/40 px-3 text-sm text-white"
      />

      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-[#E3452F]/40 bg-[#E3452F]/10 p-3 text-sm text-white/85">
          {error}
        </p>
      ) : null}

      <BigButton
        icon="→"
        label={busy ? "One moment…" : mode === "in" ? "Sign in and get my link" : "Create account and get my link"}
        variant="gold"
        type="submit"
        disabled={busy || !email.trim() || !password}
        className="mt-3 w-full justify-center"
      />
      <p className="mt-2 text-xs leading-relaxed text-white/40">
        An account is an adult thing — it only exists so a link can live somewhere. The story is
        already safe on this device either way.
      </p>
    </form>
  );
}

/* ------------------------------------------------------- the finished steps */

/** The ready card's step list (s05 `.t-steps`): mono 13px, a gold check dot per finished step. */
function FinishedSteps({ steps }: { steps: PublishStep[] }) {
  return (
    <ol data-studio="publish-steps" className="mt-3.5 flex flex-col gap-1">
      {steps.map((step) => (
        <li
          key={step.id}
          data-state={step.state}
          className="flex min-h-7 items-center gap-3 font-ss-mono text-[13px]/[1.3] text-ss-fg-2"
        >
          {step.state === "done" ? (
            <span
              aria-hidden="true"
              className="grid size-[18px] flex-none place-items-center rounded-full bg-ss-gold text-ss-ink shadow-[0_0_10px_rgba(245,158,11,0.45)]"
            >
              <Check className="size-3" strokeWidth={3} />
            </span>
          ) : step.state === "error" ? (
            <span
              aria-hidden="true"
              className="grid size-[18px] flex-none place-items-center rounded-full bg-ss-red text-ss-paper"
            >
              <X className="size-3" strokeWidth={3} />
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="size-[18px] flex-none rounded-full border-[1.5px] border-dashed border-white/30"
            />
          )}
          <span className={step.state === "error" ? "text-[#ff8a76]" : undefined}>
            {step.label}
            {step.detail ? ` · ${step.detail}` : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------- card */

export function PublishCard({
  phase,
  steps,
  title,
  author,
  pageCount,
  durationLabel,
  madeInLabel,
  codecLabel,
  shareUrl,
  cloud,
  note,
  error,
  firstPicture,
  layers,
  consentWritten,
  size,
  authOffer,
  authBusy,
  authError,
  authReady,
  onAuth,
  onMakeLink,
  onDownload,
  onDeleteEverything,
  onBack,
  onRetry,
}: PublishCardProps) {
  const [copied, setCopied] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [qr, setQr] = React.useState<string | null>(null);
  const [canShare, setCanShare] = React.useState(false);
  const twoColumns = useTwoColumns();
  /** The printed tape's column (label, chips, card). */
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  /** The card control that last had focus (`data-pc-focus`), kept across the breakpoint. */
  const lastFocusRef = React.useRef<string | null>(null);

  // Crossing 1024px (an iPad rotating) moves the meter and the buttons to
  // their other place in the tree. If one of them had focus, give it back.
  React.useLayoutEffect(() => {
    const key = lastFocusRef.current;
    const card = cardRef.current;
    if (!key || !card) return;
    // Only when focus was lost with the moved control; never pull it from elsewhere.
    const active = document.activeElement;
    if (active && active !== document.body) return;
    card.querySelector<HTMLElement>(`[data-pc-focus="${key}"]`)?.focus();
  }, [twoColumns]);

  React.useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    if (!shareUrl) {
      setQr(null);
      return;
    }
    // High error correction: this gets pointed at across a kitchen table.
    QRCode.toDataURL(shareUrl, { errorCorrectionLevel: "H", margin: 1, width: 320 })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

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

  const share = async () => {
    if (!shareUrl) return;
    try {
      await navigator.share({
        title,
        text: `${title}${author ? ` — by ${author}` : ""}`,
        url: shareUrl,
      });
    } catch {
      /* the sheet was dismissed; nothing to recover */
    }
  };

  if (phase === "publishing") {
    return (
      <div
        data-studio="publish-overlay"
        className="studio-fade fixed inset-0 z-[60] overflow-y-auto bg-[#070a12]/94 p-4 backdrop-blur-md"
      >
        <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center py-6">
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

            <ol className="mt-5 space-y-2.5" style={META_FONT}>
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
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------- the printed tape */

  // Nothing could be kept (the device is full, the cloud refused): the steps
  // and the note say so, and the card never claims "Saved on this device".
  const saveFailed = steps.some((s) => s.id === "save" && s.state === "error");

  const leftTop = (
    <>
      <div className="flex min-h-[34px] flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="text-[22px]/[1.1] font-semibold tracking-[-0.015em] text-white sm:text-[26px]">
          Your tape is ready
        </h2>
        <p
          data-studio="made-in"
          className="inline-flex items-center gap-[7px] font-ss-mono text-[12.5px]/none font-medium tracking-[0.16em] text-ss-gold-2 uppercase"
        >
          <Timer aria-hidden="true" className="size-3.5 flex-none" strokeWidth={2} />
          Made in {madeInLabel}
        </p>
      </div>
      <FinishedSteps steps={steps} />
    </>
  );

  const leftFoot = (
    <>
      <SizeMeter
        className="pc-meter"
        pictureBytes={size.pictureBytes}
        voiceBytes={size.voiceBytes}
        segments={pageCount}
      />
      <BigButton
        icon={<Download className="size-[18px]" strokeWidth={2.2} />}
        label="Download the .storysync file"
        data-pc-focus="download"
        variant="gold"
        onClick={onDownload}
        className="pc-download min-h-14 w-full justify-center text-[16px]"
      />
      <BigButton
        icon={<Undo2 className="size-[17px]" strokeWidth={2.2} />}
        label="Back to the studio"
        data-pc-focus="back"
        variant="ghost"
        onClick={onBack}
        className="mt-2.5 min-h-12 w-full justify-center text-[15px]"
      />
      <BigButton
        icon={<PullTapeIcon className="h-[26px] w-[30px]" />}
        label={confirmDelete ? "Tap again to delete everything" : "Pull the tape out — delete everything"}
        data-pc-focus="pull"
        variant={confirmDelete ? "red" : "ghost"}
        onClick={() => {
          if (confirmDelete) onDeleteEverything();
          else setConfirmDelete(true);
        }}
        className={`mt-[18px] min-h-[60px] w-full justify-center text-[15px] ${
          confirmDelete
            ? ""
            : "border-[1.5px] border-[rgba(227,69,47,0.72)] bg-[rgba(227,69,47,0.07)] text-[#ffb9ad] hover:border-[rgba(227,69,47,0.9)] hover:bg-[rgba(227,69,47,0.12)]"
        }`}
      />
      <p className="mt-3 text-[13px]/[1.45] text-pretty text-ss-fg-3">
        Delete removes the pictures, the recordings, the saved copy and the link. Nothing is kept in
        an archive.
      </p>
    </>
  );

  const right = (
    <div data-studio="publish-right" className="pc-col">
      {shareUrl ? (
        <>
          <p
            data-studio="link-label"
            className="flex min-h-[34px] items-center gap-2 font-ss-mono text-[12.5px]/none font-medium tracking-[0.16em] text-ss-fg-3 uppercase"
          >
            <Lock aria-hidden="true" className="size-3.5 flex-none text-ss-gold-2" strokeWidth={2} />
            private link
          </p>
          <div className="mt-3.5 flex h-14 items-center gap-2 rounded-[14px] border border-white/14 bg-black/40 py-0 pr-2 pl-1.5 shadow-[inset_0_2px_6px_rgba(0,0,0,0.4)]">
            <input
              readOnly
              value={shareUrl}
              aria-label="Share link"
              data-studio="share-url"
              onFocus={(e) => e.currentTarget.select()}
              className="sk-focus h-10 min-w-0 flex-1 rounded-[10px] bg-transparent px-2 font-ss-mono text-[13px] text-ss-fg-2"
            />
            <button
              type="button"
              onClick={copy}
              className="sk-focus inline-flex h-[38px] flex-none items-center gap-[7px] rounded-[10px] border-[1.5px] border-[rgba(245,158,11,0.75)] bg-[rgba(245,158,11,0.08)] px-2.5 text-sm font-semibold text-ss-gold-2 transition-colors hover:bg-[rgba(245,158,11,0.16)]"
            >
              {copied ? (
                <Check aria-hidden="true" className="size-[15px]" strokeWidth={2.4} />
              ) : (
                <Copy aria-hidden="true" className="size-[15px]" strokeWidth={2} />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="pc-qr mt-5 flex flex-col items-center gap-4 rounded-[18px] border-2 border-ss-ink bg-ss-paper p-4 text-ss-ink shadow-[0_24px_40px_-24px_rgba(0,0,0,0.8)] sm:flex-row sm:gap-[22px] sm:p-5">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr}
                data-studio="share-qr"
                alt={`QR code that opens ${title}`}
                width={160}
                height={160}
                className="size-[160px] flex-none rounded-lg"
              />
            ) : (
              <div className="size-[160px] flex-none rounded-lg bg-black/5" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p
                data-studio="qr-label"
                className="flex items-center gap-2 font-ss-mono text-[12px]/[1.2] font-medium tracking-[0.16em] text-ss-ink-2 uppercase"
              >
                <ScanLine aria-hidden="true" className="size-[15px] flex-none" strokeWidth={2} />
                point a phone camera here
              </p>
              <p className="mt-2.5 text-[16px]/[1.45] text-pretty text-ss-ink-2">
                Grandparents do not need the app, an account, or the file — the camera app opens the
                story in any browser.
              </p>
            </div>
          </div>

          {canShare ? (
            <BigButton
              icon={<Share className="size-[18px]" strokeWidth={2.2} />}
              label="Share the link…"
              variant="violet"
              onClick={() => void share()}
              className="pc-share min-h-[60px] w-full justify-center text-[16px]"
            />
          ) : null}

          <p className="mt-3 text-[13px]/[1.45] text-pretty text-ss-fg-3">
            {cloud
              ? "Unlisted and unguessable. Only someone holding this link can open the story — deleting the story revokes it."
              : "Unlisted and unguessable — and with no cloud library configured it opens the tape on this device. To send the story further, hand someone the .storysync file."}
          </p>
        </>
      ) : (
        <div>
          {saveFailed ? null : (
            <p className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm leading-relaxed text-white/70">
              {authOffer
                ? "Saved on this device. Nobody is signed in, so there is no link yet — download the tape, or sign in and one will be made."
                : "Saved on this device. There is no cloud library configured, so download the .storysync file to keep the tape or hand it to someone."}
            </p>
          )}
          {authOffer ? (
            <AuthPanel
              busy={authBusy}
              error={authError}
              ready={authReady}
              onAuth={onAuth}
              onMakeLink={onMakeLink}
            />
          ) : null}
        </div>
      )}

      {note ? (
        <p role="status" className="mt-3 rounded-xl border border-amber-400/35 bg-amber-500/10 p-3 text-sm text-amber-100">
          {note}
        </p>
      ) : null}
    </div>
  );

  return (
    <div
      data-studio="publish-overlay"
      className="studio-fade fixed inset-0 z-[60] overflow-y-auto bg-[#070a12]/94 p-4 backdrop-blur-md"
    >
      <div ref={cardRef} className="pc-ready">
        <div className="pc-print">
          <PrintSlot />
          <TapeLabel
            className="studio-printing pc-label"
            title={title}
            author={author || undefined}
            inset={
              firstPicture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={firstPicture.src}
                  alt={firstPicture.alt}
                  data-studio="label-inset"
                  width={72}
                  height={72}
                  className="block size-[72px] rounded-[6px] border-2 border-ss-ink bg-ss-crayon-paper object-cover p-[3px] shadow-[2px_3px_0_rgba(30,26,22,0.12)]"
                />
              ) : undefined
            }
            meta={
              <>
                <span className="block">
                  SIDE A · {pageCount} {pageCount === 1 ? "PAGE" : "PAGES"} · {durationLabel} · {codecLabel}
                </span>
                <span className="pc-meta-2 block">
                  SSYNC 2.0 ·{" "}
                  {shareUrl ? (cloud ? "SHARED UNLISTED" : "LINKED ON THIS DEVICE") : "ON THIS DEVICE"}
                </span>
              </>
            }
          />
        </div>

        <LayerChips className="pc-chips" presence={layers} consentWritten={consentWritten} />

        <GlassPanel
          data-studio="publish-card"
          onFocus={(e: React.FocusEvent<HTMLDivElement>) => {
            lastFocusRef.current = (e.target as HTMLElement).dataset.pcFocus ?? null;
          }}
          data-layout={twoColumns ? "wide" : "narrow"}
          className="studio-rise pc-card rounded-[22px] border-white/12 bg-[#0b1020]/95"
        >
          <div data-studio="publish-left" className="pc-col">
            {leftTop}
            {twoColumns ? leftFoot : null}
          </div>
          {right}
          {twoColumns ? null : (
            <div data-studio="publish-left-foot" className="pc-col">
              {leftFoot}
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}

export default PublishCard;
