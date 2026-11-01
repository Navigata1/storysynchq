"use client";

/**
 * EndCard — side A complete (s06 phone 1, T12).
 *
 * What a listener holds when the tape runs out, top to bottom:
 *   1. the tape label ("SIDE A COMPLETE · N PAGES · ~m:ss") with a small
 *      sticker of the last picture stuck to its right edge, tilted 6°;
 *   2. the J-card liner notes (./liner-notes → the kit JCard): what is on the
 *      tape, whose voice, the music, who owns it, and the consent that travels
 *      inside the file — ending in "What's inside this tape? →" (/protocol);
 *   3. on a tape someone sent (a link or a file, never the house tape), the
 *      gold "Send a thank-you back" and its line (T18): one page recorded
 *      back, as its own little tape; then Read it again · Make your own story
 *      (the loop: receive → create), Make your own story in gold outline
 *      whenever the reply is the filled gold action;
 *   4. the QR of the exact share URL, when the tape was opened from a link;
 *   5. Close, and the line a parent most needs: nobody is counting plays.
 *
 * It is a dialog over the room: focus moves onto it when it opens and Tab
 * stays on it; Escape still leaves (the Player's own key handler).
 *
 * Nothing leaves the device: the QR is drawn locally, the sticker is the
 * tape's own picture, the /protocol link is not prefetched, nothing is
 * counted or stored.
 */

import * as React from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowRight, Mic, Repeat, Star, X } from "lucide-react";
import type { MoodName } from "@/lib/audio/moods";
import { MOOD_ICON } from "@/components/studio-kit/mood-icons";
import type { SsyncManifest } from "@/lib/storysync/manifest";
import { replyLine } from "@/lib/storysync/reply";
import { BigButton, TapeLabel } from "@/components/studio-kit/kit";
import { JCard, type JCardRow } from "@/components/studio-kit/JCard";
import {
  BROWSER_VOICE,
  linerNotes,
  UNNAMED_RECORDED_VOICE,
  type LinerKey,
  type LinerRow,
} from "./liner-notes";
import "./end-card.css";

/** The J-card's keys as read aloud; the card prints them in uppercase mono. */
const KEY_LABEL: Record<LinerKey, string> = {
  PICTURES: "Pictures",
  WORDS: "Words",
  VOICE: "Voice",
  MUSIC: "Music",
  "MADE IN": "Made in",
  OWNER: "Owner",
  CONSENT: "Consent",
};

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** VOICE values that describe the voice rather than name a person: never bold. */
const UNNAMED_VOICES: ReadonlySet<string> = new Set([BROWSER_VOICE, UNNAMED_RECORDED_VOICE]);

/**
 * The share URL set the way the reference sets it (s06 `.s06-qrrow__u`): the
 * host never split mid-name, "read?story=" never stranded, and the code (32
 * hex for a minted link) whole on a line of its own (`.pl-qr-code`, nowrap) —
 * never a three-character orphan. Break opportunities only: <wbr> adds no
 * characters, so the text is still the exact URL.
 */
function urlWithBreaks(url: string): React.ReactNode {
  const cut = url.indexOf("/", url.indexOf("//") + 2);
  if (cut < 0 || cut === url.length - 1) return url;
  const head = url.slice(0, cut + 1);
  const rest = url.slice(cut + 1);
  const code = /^(.*?[?&]story=)([^&#]+)$/.exec(rest);
  if (!code) {
    return (
      <>
        {head}
        <wbr />
        {rest}
      </>
    );
  }
  return (
    <>
      {head}
      <wbr />
      {code[1]}
      <wbr />
      <span className="pl-qr-code" data-pl="qr-code">
        {code[2]}
      </span>
    </>
  );
}

/** The last page that carries a picture — the sticker on the label. */
function lastPicture(manifest: SsyncManifest): string | undefined {
  for (let i = manifest.pages.length - 1; i >= 0; i--) {
    const url = manifest.pages[i]?.illustration?.url?.trim();
    if (url) return url;
  }
  return undefined;
}

/** A mood tag: the mood's lucide icon and its name on the mood's colour. */
function MoodTag({ mood }: { mood: MoodName }) {
  const Icon = MOOD_ICON[mood];
  return (
    <span
      className="pl-end-mood"
      data-mood={mood}
      style={{ "--pl-end-mood": `var(--mood-${mood.toLowerCase()})` } as React.CSSProperties}
    >
      <Icon aria-hidden="true" focusable="false" strokeWidth={2.2} />
      {mood}
    </span>
  );
}

/** A row's value as printed: mood tags for MUSIC, one line per record for CONSENT. */
function rowValue(row: LinerRow): React.ReactNode {
  if (row.key === "MUSIC" && row.moods && row.moods.length > 0) {
    /* each separator is held to the mood after it (a nowrap pair), so a
       wrapped line starts with "·" but never ends with one */
    return row.moods.map((mood, i) =>
      i === 0 ? (
        <MoodTag key={mood} mood={mood} />
      ) : (
        <React.Fragment key={mood}>
          {" "}
          <span className="pl-end-moodpair">
            <span className="pl-end-sep">·</span> <MoodTag mood={mood} />
          </span>
        </React.Fragment>
      ),
    );
  }
  if (row.key === "CONSENT" && row.lines && row.lines.length > 0) {
    /* printed from the record's fields (./liner-notes), never by re-reading
       the text; the date and "written into this tape" never break inside
       (the reference's non-breaking spaces), the granted-by wording may wrap */
    return row.lines.map((line, i) => (
      <span key={i} className="pl-end-line" data-line="">
        {line.voice ? `${line.voice}: ` : null}
        {line.granted}
        {line.date ? (
          <>
            {" · "}
            <span className="pl-end-keep">{line.date}</span>
          </>
        ) : null}
        {" · "}
        <span className="pl-end-keep">{line.tail}</span>
      </span>
    ));
  }
  if (row.key === "VOICE" && !UNNAMED_VOICES.has(row.value)) return <b>{row.value}</b>;
  return row.value;
}

export interface EndCardProps {
  /** The tape that just finished. */
  manifest: SsyncManifest;
  /** The label's runtime, "m:ss" (the Player's estimate). */
  runtime: string;
  /** The link this tape lives at, when it was opened from one: drawn as a QR. */
  shareUrl?: string;
  /** Back to page 1. */
  onReplay: () => void;
  /** The loop that justifies the protocol: receive → create. */
  onMakeYourOwn?: () => void;
  /**
   * "Send a thank-you back" (T18): record one page in reply. Passed for a
   * tape someone sent (a link or a file), never for the house tape; without
   * it the card is T12's.
   */
  onReply?: () => void;
  /** Whom the reply goes back to, for its line ("…back to <name> as…"). */
  replyName?: string;
  /** Leave the story. */
  onExit?: () => void;
}

export function EndCard({
  manifest,
  runtime,
  shareUrl,
  onReplay,
  onMakeYourOwn,
  onReply,
  replyName,
  onExit,
}: EndCardProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const replyNoteId = React.useId();
  const [qr, setQr] = React.useState<{ url: string; src: string } | null>(null);

  const title = manifest.metadata?.title || "Untitled Story";
  const author = manifest.metadata?.author;
  const total = manifest.pages.length;
  const sticker = React.useMemo(() => lastPicture(manifest), [manifest]);
  const rows = React.useMemo<JCardRow[]>(
    () =>
      linerNotes(manifest).map((row) => ({
        id: row.key,
        label: KEY_LABEL[row.key],
        value: rowValue(row),
        stamped: row.key === "CONSENT",
      })),
    [manifest],
  );

  /* the QR that carries the tape to a phone — drawn here, on this device */
  React.useEffect(() => {
    if (!shareUrl) return;
    let cancelled = false;
    QRCode.toDataURL(shareUrl, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: "M",
      color: { dark: "#1E1A16", light: "#FFFDF6" },
    })
      .then((src) => {
        if (!cancelled) setQr({ url: shareUrl, src });
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  /* a dialog takes focus when it opens (the card itself, not its first control) */
  React.useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  /* …and keeps it: Tab and Shift+Tab go round the card's own controls */
  const keepFocus = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const root = rootRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.getClientRects().length > 0,
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === root)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  const qrSrc = qr && shareUrl && qr.url === shareUrl ? qr.src : null;

  return (
    <div
      ref={rootRef}
      className="pl-end"
      data-pl="end"
      role="dialog"
      aria-modal="true"
      aria-label="The end"
      tabIndex={-1}
      onKeyDown={keepFocus}
    >
      <div className="pl-end-inner">
        {/* the cassette case: label + sticker, and the J-card inside it */}
        <div className="pl-end-case">
          <div
            className="pl-end-label"
            data-sticker={sticker ? "true" : undefined}
            data-author={author ? "true" : undefined}
          >
            <TapeLabel
              title={title}
              author={author}
              meta={
                /* two unbreakable groups: on a narrow phone the line breaks
                   after "COMPLETE", so the runtime stays with its pages */
                <>
                  <span className="pl-end-meta-group">SIDE A COMPLETE</span>{" "}
                  <span className="pl-end-meta-group">
                    · {total} {total === 1 ? "PAGE" : "PAGES"} · ~{runtime}
                  </span>
                </>
              }
            />
            {sticker ? (
              <span className="pl-end-sticker" data-pl="end-sticker" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sticker} alt="" draggable={false} />
              </span>
            ) : null}
          </div>

          <JCard
            label="Liner notes"
            spine={title}
            spineTail=" · SIDE A"
            rows={rows}
            footer={
              <Link href="/protocol" prefetch={false} className="sk-focus" data-pl="end-protocol">
                What’s inside this tape?
                <ArrowRight aria-hidden="true" focusable="false" strokeWidth={2.4} />
              </Link>
            }
          />
        </div>

        {/* what to do next */}
        <div className="pl-end-next">
          {onReply ? (
            <div className="pl-end-reply" data-pl="end-reply">
              <BigButton
                icon={<Mic aria-hidden="true" focusable="false" strokeWidth={2.2} />}
                label="Send a thank-you back"
                variant="gold"
                onClick={onReply}
                aria-describedby={replyNoteId}
                className="pl-end-send"
              />
              <p id={replyNoteId} className="pl-end-sendnote">
                {replyLine(replyName)}
              </p>
            </div>
          ) : null}

          <div className="pl-end-pair">
            <BigButton
              icon={<Repeat aria-hidden="true" focusable="false" strokeWidth={2.2} />}
              label="Read it again"
              variant="ghost"
              onClick={onReplay}
              className="pl-end-again"
            />
            {onMakeYourOwn ? (
              /* the reply, when there is one, is the one filled gold action:
                 this steps down to the reference's gold outline */
              <BigButton
                icon={<Star aria-hidden="true" focusable="false" strokeWidth={2.2} />}
                label="Make your own story"
                variant={onReply ? "ghost" : "gold"}
                onClick={onMakeYourOwn}
                className={onReply ? "pl-end-make pl-end-make--outline" : "pl-end-make"}
              />
            ) : null}
          </div>

          {qrSrc && shareUrl ? (
            <div className="pl-qr" data-pl="qr-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrSrc}
                data-pl="qr"
                alt={`QR code linking to this story at ${shareUrl}`}
                width={88}
                height={88}
              />
              <div className="pl-qr-copy">
                <p className="pl-qr-title">
                  <b>PASS IT ON</b> · POINT A PHONE AT THIS
                </p>
                <p className="pl-qr-url">{urlWithBreaks(shareUrl)}</p>
              </div>
            </div>
          ) : null}

          {onExit ? (
            <button type="button" className="pl-chip sk-focus mx-auto" onClick={onExit}>
              <X size={15} strokeWidth={2} aria-hidden="true" className="flex-none" />
              Close
            </button>
          ) : null}

          <p className="pl-end-privacy">Nobody is counting plays. This page has no trackers.</p>
        </div>
      </div>
    </div>
  );
}

export default EndCard;
