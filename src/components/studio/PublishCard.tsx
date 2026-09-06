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
 */

import * as React from "react";
import QRCode from "qrcode";
import { BigButton, GlassPanel, Reel, TapeLabel } from "@/components/studio-kit/kit";

export type PublishStepState = "pending" | "active" | "done" | "error";

export interface PublishStep {
  id: string;
  label: string;
  state: PublishStepState;
  detail?: string;
}

export type AuthMode = "in" | "up";

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
                  SSYNC 2.0 ·{" "}
                  {shareUrl
                    ? cloud
                      ? "SHARED UNLISTED"
                      : "LINKED ON THIS DEVICE"
                    : "ON THIS DEVICE"}
                </>
              }
            />

            <GlassPanel className="studio-rise mt-4 border-white/12 bg-[#0b1020]/95 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold text-white">Your tape is ready</h2>
                <p
                  data-studio="made-in"
                  className="text-[11px] tracking-[0.18em] text-amber-300/80 uppercase"
                  style={META_FONT}
                >
                  Made in {madeInLabel}
                </p>
              </div>

              {shareUrl ? (
                <div className="mt-3">
                  <p className="text-[11px] tracking-[0.18em] text-white/40 uppercase" style={META_FONT}>
                    private link
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      readOnly
                      value={shareUrl}
                      aria-label="Share link"
                      data-studio="share-url"
                      onFocus={(e) => e.currentTarget.select()}
                      className="sk-focus h-12 min-w-0 flex-1 rounded-xl border border-white/12 bg-black/50 px-3 text-sm text-white/85"
                      style={META_FONT}
                    />
                    <button
                      type="button"
                      onClick={copy}
                      className="sk-focus h-12 flex-none rounded-xl border border-amber-400/50 bg-amber-500/15 px-4 text-sm font-semibold text-amber-100 hover:bg-amber-500/25"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>

                  <div className="mt-3 flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-[#FFFDF6] p-4 sm:flex-row sm:items-center">
                    {qr ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={qr}
                        data-studio="share-qr"
                        alt={`QR code that opens ${title}`}
                        width={140}
                        height={140}
                        className="h-[140px] w-[140px] flex-none rounded-lg"
                      />
                    ) : (
                      <div className="h-[140px] w-[140px] flex-none rounded-lg bg-black/5" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <p
                        className="text-[11px] tracking-[0.18em] text-[#1E1A16]/60 uppercase"
                        style={META_FONT}
                      >
                        point a phone camera here
                      </p>
                      <p className="mt-1 text-[15px] leading-relaxed text-[#1E1A16]/85">
                        Grandparents do not need the app, an account, or the file — the camera app
                        opens the story in any browser.
                      </p>
                    </div>
                  </div>

                  {canShare ? (
                    <BigButton
                      icon="↗"
                      label="Share the link…"
                      variant="violet"
                      onClick={() => void share()}
                      className="mt-3 w-full justify-center"
                    />
                  ) : null}

                  <p className="mt-2 text-xs leading-relaxed text-white/40">
                    {cloud
                      ? "Unlisted and unguessable. Only someone holding this link can open the story — deleting the story revokes it."
                      : "Unlisted and unguessable — and with no cloud library configured it opens the tape on this device. To send the story further, hand someone the .storysync file."}
                  </p>
                </div>
              ) : (
                <div className="mt-3">
                  <p className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm leading-relaxed text-white/70">
                    {authOffer
                      ? "Saved on this device. Nobody is signed in, so there is no link yet — download the tape, or sign in and one will be made."
                      : "Saved on this device. There is no cloud library configured, so download the .storysync file to keep the tape or hand it to someone."}
                  </p>
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
