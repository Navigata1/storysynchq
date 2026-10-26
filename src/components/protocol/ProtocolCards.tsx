/**
 * The three cards beside FIG. 1 on /protocol (s08's right column):
 *
 *   1. The codec rule — MUST / MAY / MUST NOT, verbatim from the reference.
 *   2. Validator — a console of PASS / WARN / FAIL lines computed at render by
 *      the real `validateManifest` (through `validationReport`): the house tape
 *      as the download packs it, then two labelled hand-edited copies of it.
 *   3. Write your own player — the fflate snippet a Node test executes.
 *
 * Register A (studio chrome): a glass card, a console, a panel. Static: no
 * fetch, no motion. The codec card's title is not a heading — the page keeps
 * one heading for the codec rule, the normative section further down.
 */

import * as React from "react";
import { CircleCheck, CodeXml, Headphones } from "lucide-react";
import { GlassPanel } from "@/components/studio-kit/kit";
import { referencedAssets, type SsyncManifest } from "@/lib/storysync/manifest";
import { addedLines, validationReport, type ReportLine } from "@/lib/storysync/report";
import { PLAYER_SNIPPET, snippetTokens } from "./snippet";

const CODEC_RULE: Array<{ tag: string; tone: "must" | "may" | "mustnot"; text: string }> = [
  { tag: "MUST", tone: "must", text: "Narration is AAC-LC in M4A, mono, 48 kHz, about 96 kbps." },
  { tag: "MAY", tone: "may", text: "Fall back to 16-bit WAV, 16 kHz mono. The only fallback." },
  { tag: "MUST NOT", tone: "mustnot", text: "Opus, WebM or Ogg. Drafts only, never a published tape." },
];

const HAND_EDITED = "a hand-edited copy: ";

/**
 * What the console prints, in order: the tape's own report (it passes), the
 * WARN from a copy whose consent date is a full timestamp, and the FAIL from a
 * copy whose page-3 narration is Opus/WebM — each in the validator's words,
 * after the label that says it is a copy. A copy shows only what its hand edit
 * added: a line the tape itself already earns is never repeated as the copy's.
 */
export function validatorConsole(packed: SsyncManifest): ReportLine[] {
  // The download writes every file the manifest names, at those paths.
  const own = validationReport(packed, referencedAssets(packed));

  const stamped = structuredClone(packed);
  stamped.signature = {
    ...stamped.signature,
    voiceConsent: [{ voice: "Narrator", grantedBy: "self", date: "2026-10-19T18:20:00Z" }],
  };

  const webm = structuredClone(packed);
  const page3 = webm.pages[2];
  page3.text = { content: page3.text?.content ?? "", ...page3.text, audioUrl: "assets/narration-3.webm" };

  const copied = (lines: ReportLine[], level: ReportLine["level"]) =>
    addedLines(own, lines)
      .filter((l) => l.level === level)
      .map((l) => ({ level, text: HAND_EDITED + l.text }));

  return [...own, ...copied(validationReport(stamped), "WARN"), ...copied(validationReport(webm), "FAIL")];
}

/**
 * The validator quotes paths; the console sets them apart in colour, keeping
 * the quotes. A plain span: it is a path, not emphasis.
 */
function LogText({ text }: { text: string }) {
  const parts = text.split(/("[^"]*")/);
  return (
    <span className="pr-log-text" data-log="text">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="pr-log-quote">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </span>
  );
}

export interface ProtocolCardsProps {
  /** The house tape as the download packs it: v2.0, files at their `assets/` paths. */
  packedTape: SsyncManifest;
  className?: string;
}

export function ProtocolCards({ packedTape, className }: ProtocolCardsProps) {
  const lines = validatorConsole(packedTape);
  const tokens = snippetTokens(PLAYER_SNIPPET);

  return (
    <div className={className ? `pr-cards ${className}` : "pr-cards"} data-protocol="cards">
      {/* 1 · the codec rule */}
      <GlassPanel
        className="pr-codec"
        data-protocol="codec-card"
        role="group"
        aria-labelledby="pr-codec-card-h"
      >
        <p className="pr-card-h">
          <span id="pr-codec-card-h">The codec rule</span>
          <Headphones className="pr-card-i" aria-hidden="true" focusable="false" />
        </p>
        <dl className="pr-codec-rows">
          {CODEC_RULE.map((row) => (
            <div key={row.tag} className="pr-codec-row">
              <dt className={`pr-codec-tag pr-codec-tag--${row.tone} sk-font-meta`}>{row.tag}</dt>
              <dd className="pr-codec-text">{row.text}</dd>
            </div>
          ))}
        </dl>
      </GlassPanel>

      {/* 2 · the validator */}
      <div className="pr-console" data-protocol="validator">
        <h3 className="pr-console-bar">
          <CircleCheck className="pr-card-i" aria-hidden="true" focusable="false" />
          Validator
        </h3>
        <ul className="pr-log sk-font-meta">
          {lines.map((line, i) => (
            <li key={i} className="pr-log-line" data-level={line.level}>
              <b className={`pr-log-tag pr-log-tag--${line.level.toLowerCase()}`} data-log="tag">
                {line.level}
              </b>{" "}
              <LogText text={line.text} />
            </li>
          ))}
        </ul>
      </div>

      {/* 3 · write your own player */}
      <div className="pr-player" data-protocol="player-snippet">
        <h3 className="pr-card-h">
          <span>Write your own player</span>
          <CodeXml className="pr-card-i" aria-hidden="true" focusable="false" />
        </h3>
        {/* focusable: a horizontally scrollable region must be keyboard-reachable */}
        <pre
          className="pr-snippet sk-font-meta sk-focus"
          role="group"
          tabIndex={0}
          aria-label="A whole SSYNC player in six lines of JavaScript, using fflate (scrolls sideways on narrow screens)"
        >
          {tokens.map((token, i) =>
            token.kind === "plain" ? (
              <React.Fragment key={i}>{token.text}</React.Fragment>
            ) : (
              <span key={i} data-token={token.kind}>
                {token.text}
              </span>
            ),
          )}
        </pre>
      </div>
    </div>
  );
}
