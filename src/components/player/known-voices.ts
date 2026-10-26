/**
 * Known voices — whose voices this device already knows (T22b, s07 right
 * panel: "WHOSE VOICE?", "Browser voice", "READING NOW").
 *
 * The "Read it in…" panel offers the family the readers it has met on this
 * shelf, so a copy can be credited to the right one before the Creator opens:
 *
 *   knownVoices(sources)   the names, most recent first, at most four:
 *                            · every `metadata.narrator` on the shelf (your own
 *                              tapes and the references of tapes sent to you)
 *                            · every `signature.voiceConsent[].voice` of your own
 *                              tapes, reduced to its lead name by T03's
 *                              `narratorFromByline` ("Mia, age 4 — with Mom" → "Mia")
 *                          A tape's time is when it was saved (own) or reached
 *                          this shelf (sent). Names that differ only in case are
 *                          one voice (the most recent spelling stays). The consent
 *                          fallback "narrator" (a voice nobody named) is no name.
 *   voiceRow(known, reader) the names the row shows: the known ones, with the
 *                          target's own reader added first when the four leave
 *                          it out (its cassette carries READING NOW)
 *   voiceName(raw)         a name as the Creator takes it: trimmed, single
 *                          spaces, at most 40 characters; undefined when empty
 *   voiceFromHash(hash)    the name a door URL carries in its fragment
 *                          (`#voice=<name>`, see read-it-in.ts `creatorUrl`)
 *
 * The names come from this device's shelf only and go nowhere: the door keeps
 * the chosen one in the URL fragment, which no request carries, and the
 * Creator reads it after mount and cleans it off. It reaches a manifest only
 * through the byline rules that already exist (T03 narrator, T04b consent).
 *
 * Pure: nothing here reads storage, fetches or counts anything. Relative
 * imports only, so the Node-side tests import it directly.
 */

import type { SsyncManifest } from "../../lib/storysync/manifest";
import { UNNAMED_VOICE } from "../../lib/storysync/consent";
import { NARRATOR_MAX_CHARS, narratorFromByline } from "../../lib/storysync/narrator";
import type { ShelfEntry } from "./shelf";
import type { SentTape } from "./sent-to-you";

/** The first cassette: the browser's own voice (Web Speech). */
export const BROWSER_VOICE = "Browser voice";

/** The last cassette: a name typed here. */
export const SOMEONE_NEW = "Someone new";

/** Under the cassette that reads the target today (upper case, as the reference prints it). */
export const READING_NOW = "READING NOW";

/** At most this many names this device knows. */
export const KNOWN_VOICES_MAX = 4;

/** The longest name a copy carries: T03's narrator cap. */
export const VOICE_NAME_MAX = NARRATOR_MAX_CHARS;

/** The fragment key a door URL carries the name under. */
export const VOICE_PARAM = "voice";

/** One tape on this device's shelf, as far as voices go (the Read Room's shelf items fit). */
export type VoiceSource =
  | { kind: "own"; entry: Pick<ShelfEntry, "createdAt" | "manifest"> }
  | { kind: "sent"; tape: Pick<SentTape, "addedAt" | "narrator"> };

/* ------------------------------------------------------------- helpers */

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function time(iso: string | undefined): number {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? t : 0;
}

/** One voice, whatever its casing. */
function voiceKey(name: string): string {
  return name.toLocaleLowerCase();
}

/* ---------------------------------------------------------------- names */

/** A name as the Creator takes it: trimmed, single spaces, ≤ 40 characters (code points). */
export function voiceName(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const tidy = raw.replace(/\s+/g, " ").trim();
  const capped = Array.from(tidy).slice(0, VOICE_NAME_MAX).join("").trimEnd();
  return capped || undefined;
}

/** The names one tape knows: its narrator, then (your own tapes) its consent voices' lead names. */
function namesOf(source: VoiceSource): string[] {
  if (source.kind === "sent") {
    const name = voiceName(source.tape.narrator);
    return name ? [name] : [];
  }
  const manifest: SsyncManifest = source.entry.manifest;
  const names: Array<string | undefined> = [voiceName(record(manifest.metadata)?.narrator)];
  const consent = record(manifest.signature)?.voiceConsent;
  if (Array.isArray(consent)) {
    for (const item of consent) {
      const voice = record(item)?.voice;
      if (typeof voice !== "string" || voiceKey(voice.trim()) === voiceKey(UNNAMED_VOICE)) continue;
      names.push(voiceName(narratorFromByline(voice)));
    }
  }
  return names.filter((name): name is string => Boolean(name));
}

/** When a tape reached this shelf: saved (own) or arrived (sent). */
function timeOf(source: VoiceSource): number {
  return source.kind === "sent" ? time(source.tape.addedAt) : time(source.entry.createdAt);
}

/** The names this device knows, most recent first, deduped case-insensitively, at most `max`. */
export function knownVoices(sources: readonly VoiceSource[], max = KNOWN_VOICES_MAX): string[] {
  const ordered = sources
    .map((source, order) => ({ source, order, at: timeOf(source) }))
    .sort((a, b) => b.at - a.at || a.order - b.order);
  const seen = new Set<string>();
  const names: string[] = [];
  for (const { source } of ordered) {
    for (const name of namesOf(source)) {
      const key = voiceKey(name);
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names.slice(0, Math.max(0, max));
}

/**
 * The names the row shows. Today's reader of the target (a narrator's name,
 * or null for the browser voice / a voice nobody named) is always among them,
 * so its cassette can say READING NOW: added first when the known names leave
 * it out, keeping at most `max`.
 */
export function voiceRow(known: readonly string[], reader: string | null, max = KNOWN_VOICES_MAX): string[] {
  const names = known.slice(0, Math.max(0, max));
  const name = voiceName(reader);
  if (!name || names.some((known) => voiceKey(known) === voiceKey(name))) return names;
  return [name, ...names].slice(0, Math.max(1, max));
}

/** Is this the same voice as that one (whatever the casing)? */
export function sameVoice(a: string | null | undefined, b: string | null | undefined): boolean {
  return typeof a === "string" && typeof b === "string" && voiceKey(a.trim()) === voiceKey(b.trim());
}

/** The name a door URL's fragment carries (`#voice=<name>`), or undefined. */
export function voiceFromHash(hash: string | null | undefined): string | undefined {
  if (!hash) return undefined;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return voiceName(params.get(VOICE_PARAM));
}
