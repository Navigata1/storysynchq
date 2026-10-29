/**
 * Liner notes — the card inside the cassette case (s06, T12).
 *
 * Reads a manifest and returns the rows the end card's J-card prints, in this
 * order: PICTURES · WORDS · VOICE · MUSIC · MADE IN · OWNER · CONSENT. Every
 * value comes from what the tape itself carries; a row with nothing to say is
 * left out, and nothing is invented — not a credit, not a device, not a
 * number of plays.
 *
 *   PICTURES  "<n> pictures" ("1 picture") — pages with a picture
 *   WORDS     "<w> words on <p> pages" — the words, and the pages that carry them
 *   VOICE     a recorded page → `metadata.narrator`, else "A recorded voice";
 *             no recording → "Read by the browser voice" (never a person's name)
 *   MUSIC     the distinct moods in page order, via the music plan the Player
 *             plays ("Wonder · Adventure · Calm"); none → "No music — a quiet tape"
 *   MADE IN   reserved: printed only when a tape carries a making time. No field
 *             in the format does today (M2-PRD OQ 3), so the row never appears.
 *   OWNER     `signature.ownership` + " · " + `signature.rights`
 *   CONSENT   one line per `signature.voiceConsent` record — "given by a parent
 *             or guardian · Oct 19, 2026 · written into this tape"; led by the
 *             voice's name when there are several (also as fields, `lines`);
 *             a recorded tape with no record says "No consent record in this tape"
 *
 * Consent dates are calendar dates (`YYYY-MM-DD`, format-spec §7.1) and are
 * printed from their own year, month and day — never through the machine's
 * clock, so "2026-01-01" reads "Jan 1, 2026" in Los Angeles too. A legacy ISO
 * timestamp prints its date part.
 *
 * Deliberately dependency-free (no React, no `@/` aliases, no DOM): the end
 * card imports it, and `tests/vision-liner-notes.spec.ts` imports the same
 * module directly in Node.
 */

import type { MoodName } from "../../lib/audio/moods";
import { musicPlan } from "./music-plan";

/** The J-card's keys, in print order. */
export const LINER_KEYS = ["PICTURES", "WORDS", "VOICE", "MUSIC", "MADE IN", "OWNER", "CONSENT"] as const;

export type LinerKey = (typeof LINER_KEYS)[number];

/**
 * One CONSENT line as fields, so a renderer never re-parses the text:
 * `voice` leads the line only when the tape holds several records; `date` is
 * the printed date, absent when the record has none.
 */
export interface ConsentLine {
  voice?: string;
  /** "given by a parent or guardian", "given by the speaker, for their own voice", … */
  granted: string;
  date?: string;
  /** Always "written into this tape". */
  tail: string;
}

/** One printed row of the J-card. */
export interface LinerRow {
  key: LinerKey;
  /** The value as text. A row of several lines (CONSENT) joins them with "\n". */
  value: string;
  /** MUSIC only: the moods themselves, in page order (empty for a quiet tape). */
  moods?: MoodName[];
  /**
   * CONSENT only, when the tape holds records: one entry per record, the same
   * lines `value` prints. Absent for "No consent record in this tape".
   */
  lines?: ConsentLine[];
}

/** Structural shape of the only page fields the liner notes read. */
export interface LinerPage {
  illustration?: { url?: string } | null;
  text?: { content?: string; audioUrl?: string } | null;
  music?: unknown;
}

/** One consent record, as loosely as a hand-made tape may write it. */
export interface LinerConsent {
  voice?: string;
  grantedBy?: string;
  date?: string;
}

/** Structural shape of the only manifest fields the liner notes read. */
export interface LinerManifest {
  metadata?: { narrator?: string } | null;
  /** v1 only: the track table the music plan resolves page ids through. */
  music?: unknown;
  pages: readonly LinerPage[];
  signature?: {
    ownership?: string;
    rights?: string;
    voiceConsent?: ReadonlyArray<LinerConsent | null | undefined>;
  } | null;
}

/** What the end of every CONSENT line says: the record is in the file. */
export const CONSENT_TAIL = "written into this tape";
export const NO_CONSENT_RECORD = "No consent record in this tape";
export const BROWSER_VOICE = "Read by the browser voice";
export const UNNAMED_RECORDED_VOICE = "A recorded voice";
export const QUIET_TAPE = "No music — a quiet tape";

const SEP = " · ";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A calendar date at the start of the string: "2026-10-19", or the date part of a timestamp. */
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function wordCount(page: LinerPage): number {
  const content = trimmed(page.text?.content);
  return content ? content.split(/\s+/).length : 0;
}

/**
 * A consent date as printed on the J-card: "2026-10-19" → "Oct 19, 2026".
 * The year, month and day are read from the string itself (checked as a real
 * day of the UTC calendar), so the machine's timezone can never move it. A
 * legacy timestamp prints its date part; anything that is not a calendar date
 * is printed as the tape wrote it (trimmed).
 */
export function formatConsentDate(value: string | null | undefined): string {
  const raw = trimmed(value);
  const match = CALENDAR_DATE.exec(raw);
  if (!match) return raw;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return raw;
  return `${MONTHS[utc.getUTCMonth()]} ${utc.getUTCDate()}, ${utc.getUTCFullYear()}`;
}

/**
 * Who gave consent, in words a grandparent reads: the two conventional values
 * (format-spec §7.1) in plain English, matched loosely ("Parent / Guardian",
 * "SELF"); any other value printed verbatim after "given by".
 */
export function grantedByWords(grantedBy: string | null | undefined): string {
  const raw = trimmed(grantedBy);
  const key = raw.toLowerCase().replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ");
  if (key === "parent/guardian") return "given by a parent or guardian";
  if (key === "self") return "given by the speaker, for their own voice";
  return raw ? `given by ${raw}` : "given";
}

/** One CONSENT record as fields; the voice leads the line only when asked. */
function consentLine(record: LinerConsent, withVoice: boolean): ConsentLine {
  const voice = withVoice ? trimmed(record.voice) : "";
  const date = formatConsentDate(record.date);
  return {
    ...(voice ? { voice } : {}),
    granted: grantedByWords(record.grantedBy),
    ...(date ? { date } : {}),
    tail: CONSENT_TAIL,
  };
}

/** A CONSENT line as printed: "[<voice>: ]<granted> · <date> · written into this tape". */
export function consentLineText(line: ConsentLine): string {
  const body = [line.granted, line.date, line.tail].filter(Boolean).join(SEP);
  return line.voice ? `${line.voice}: ${body}` : body;
}

/**
 * The J-card's rows for this tape, in print order, leaving out every row the
 * tape has nothing for. Pure; never throws on a partial manifest.
 */
export function linerNotes(manifest: LinerManifest): LinerRow[] {
  const pages = Array.isArray(manifest.pages) ? manifest.pages : [];
  const rows: LinerRow[] = [];

  /* PICTURES */
  const pictures = pages.filter((page) => trimmed(page?.illustration?.url) !== "").length;
  if (pictures > 0) rows.push({ key: "PICTURES", value: plural(pictures, "picture", "pictures") });

  /* WORDS */
  const counts = pages.map((page) => (page ? wordCount(page) : 0));
  const words = counts.reduce((sum, n) => sum + n, 0);
  const pagesWithWords = counts.filter((n) => n > 0).length;
  if (words > 0) {
    rows.push({
      key: "WORDS",
      value: `${plural(words, "word", "words")} on ${plural(pagesWithWords, "page", "pages")}`,
    });
  }

  /* VOICE — a tape with nothing to read and no recording has no voice at all */
  const recorded = pages.some((page) => trimmed(page?.text?.audioUrl) !== "");
  if (recorded) {
    rows.push({ key: "VOICE", value: trimmed(manifest.metadata?.narrator) || UNNAMED_RECORDED_VOICE });
  } else if (words > 0) {
    rows.push({ key: "VOICE", value: BROWSER_VOICE });
  }

  /* MUSIC — the same answer the Player plays (./music-plan) */
  const moods: MoodName[] = [];
  for (const { mood } of musicPlan({ music: manifest.music, pages })) {
    if (mood && !moods.includes(mood)) moods.push(mood);
  }
  rows.push({ key: "MUSIC", value: moods.length ? moods.join(SEP) : QUIET_TAPE, moods });

  /* MADE IN — no tape carries a making time yet (M2-PRD OQ 3): never printed */

  /* OWNER */
  const signature = manifest.signature ?? undefined;
  const owner = [trimmed(signature?.ownership), trimmed(signature?.rights)].filter(Boolean).join(SEP);
  if (owner) rows.push({ key: "OWNER", value: owner });

  /* CONSENT */
  const listed = signature?.voiceConsent;
  const records = (Array.isArray(listed) ? (listed as ReadonlyArray<LinerConsent | null | undefined>) : []).filter(
    (record): record is LinerConsent => !!record && typeof record === "object",
  );
  if (records.length > 0) {
    // with several records each line is led by its voice's name
    const lines = records.map((record) => consentLine(record, records.length > 1));
    rows.push({ key: "CONSENT", value: lines.map(consentLineText).join("\n"), lines });
  } else if (recorded) {
    rows.push({ key: "CONSENT", value: NO_CONSENT_RECORD });
  }

  return rows;
}
