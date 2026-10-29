"use client";

/**
 * THE DIGITAL STUDIO — the create room (docs/design-direction.md §5).
 *
 * Top bar · tool rail · THE STAGE · inspector (Advanced) · filmstrip · transport.
 * Simple mode is the default and is the whole 4-year-old journey: 📷 → ● REC →
 * ▶ → next page. Advanced adds the inspector and nothing else moves.
 *
 * The manifest is the source of truth; the engine modules under src/lib do all
 * the audio, image and container work. This file is wiring and layout.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowLeft, Circle, FolderOpen, Heart, MoreHorizontal, Pen } from "lucide-react";
import { BigButton, GlassPanel, ModeToggle, Reel } from "@/components/studio-kit/kit";
import { blobToDataUrl, dataUrlToBlob } from "@/lib/audio/recorder";
import { normalizeNarration } from "@/lib/audio/transcode";
import { processImageSafe } from "@/lib/images";
import {
  validateManifest,
  type SsyncManifest,
  type SsyncPage,
  type SsyncSignature,
} from "@/lib/storysync/manifest";
import { buildStorysyncFromStory } from "@/lib/storysync/container";
import {
  consentDate,
  consentRecordsFor,
  recordedVoices,
  type ConsentChoice,
} from "@/lib/storysync/consent";
import { resolveNarrator } from "@/lib/storysync/narrator";
import { REPLY_QUERY, REPLY_SEED_KEY, parseReplySeed, type ReplySeed } from "@/lib/storysync/reply";
import { generateStory } from "@/lib/story-engine";
import { generateIllustration } from "@/app/page-improvements";
import {
  cloudErrorKind,
  deleteBooks,
  isCloudEnabled,
  saveBook,
  saveLocalBook,
  shareBook,
  type BookInput,
} from "@/lib/cloud-storage";
import { getUser, signIn, signUp } from "@/lib/supabase";
import { forgetPlaces, placeKeysOfStories, placeKeysOfTape } from "@/components/player/resume-store";
import { VOICE_PARAM, voiceFromHash, voiceName } from "@/components/player/known-voices";

import Stage from "./Stage";
import ToolRail, { type StudioTool } from "./ToolRail";
import Filmstrip from "./Filmstrip";
import Transport from "./Transport";
import Inspector from "./Inspector";
import ParentGate from "./ParentGate";
import OpenTapeDialog from "./OpenTapeDialog";
import {
  HOUSE_TAPE_QUERY,
  OPEN_TAPE_COPY,
  TapeOpenError,
  openTapeFile,
  openTapeFromQuery,
  openedMoods,
  openingLabel,
  takeOpenTapeQuery,
  type OpenedTape,
  type TapeOpenFailure,
} from "./open-tape";
import { effectiveMood, moodsForLane, prunePageMoods, publishedMusic, renumberPageMoods } from "./page-moods";
import PublishCard, { type AuthMode, type PublishCardProps, type PublishStep } from "./PublishCard";
import { layerPresence } from "./tape-sheet";
import { tapeBytes } from "@/lib/storysync/tape-size";
import { MagicPanel, MusicPanel, VoicePanel, codecLine, type MagicLook } from "./ToolPanels";
import { useStudioAudio } from "./useStudioAudio";
import type { StudioCues } from "./cues";
import { clearDraft, loadDraft, saveDraft } from "./draft";
import {
  DEFAULT_AUTO_PAUSE_S,
  DEFAULT_TITLE,
  blankManifest,
  blankPage,
  blankState,
  codecBadge,
  estimateStorySeconds,
  formatClock,
  nextPageId,
  pickCoverImage,
  storyHasContent,
  updatePage,
  VOICES_TO_AAC,
  voicesStepText,
  type MoodName,
  type RecordingMeta,
  type StudioState,
} from "./types";
import "./studio.css";
import "./reply-chip.css";

type Phase = "edit" | "gate" | "publishing" | "published";
type Boot = "loading" | "asking" | "ready";

/** A draft found in this browser at boot, as `loadDraft` returns it. */
type SavedDraft = { state: StudioState; savedAt: string };

/** An opened tape waiting on "Open <title>?" before it replaces the story. */
interface PendingOpen {
  tape: OpenedTape;
  /** `?mood=`, when the link chose one. */
  mood: MoodName | null;
  /** Whose voice the shelf chose for this copy (T22b), when it chose one. */
  voice: string | null;
  /**
   * The saved draft the restore prompt would have offered (`?open=` at boot).
   * "Keep my story" restores it exactly as "Keep working on it" would.
   */
  saved: SavedDraft | null;
}

/** A thank-you waiting on "Reply to <title>?" before it replaces a saved story (T18). */
interface PendingReply {
  seed: ReplySeed;
  /** The saved draft the restore prompt would have offered; "Keep my story" restores it. */
  saved: SavedDraft;
}

/**
 * `/studio?reply=1`: the reply seed the Read Room handed over (T18), or null.
 * The flag is cleaned off the URL and the one-shot sessionStorage entry is
 * removed as it is read (a seed left behind by a navigation that never
 * arrived goes too), so a refresh or a pasted link opens the plain Creator.
 */
function takeReplySeed(): ReplySeed | null {
  const url = new URL(window.location.href);
  const flagged = url.searchParams.get(REPLY_QUERY) === "1";
  if (url.searchParams.has(REPLY_QUERY)) {
    url.searchParams.delete(REPLY_QUERY);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(REPLY_SEED_KEY);
    if (raw !== null) window.sessionStorage.removeItem(REPLY_SEED_KEY);
  } catch {
    raw = null;
  }
  return flagged ? parseReplySeed(raw) : null;
}

/**
 * Whose voice the Read Room chose for this copy (T22b): `#voice=<name>` on
 * T22a's door, read once after mount with T15's query and cleaned off the
 * address the same way. The door keeps the name in the fragment, so no
 * request ever carried it; a hand-typed `?voice=` is read and cleaned too.
 */
function takeVoiceName(): string | null {
  const url = new URL(window.location.href);
  const fromHash = voiceFromHash(url.hash);
  const fromQuery = voiceName(url.searchParams.get(VOICE_PARAM));
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  if (hash.has(VOICE_PARAM) || url.searchParams.has(VOICE_PARAM)) {
    hash.delete(VOICE_PARAM);
    url.searchParams.delete(VOICE_PARAM);
    const rest = hash.toString();
    window.history.replaceState(null, "", `${url.pathname}${url.search}${rest ? `#${rest}` : ""}`);
  }
  return fromHash ?? fromQuery ?? null;
}

/** The line about opening a tape: working on it, or why it did not open. */
interface OpenNote {
  tone: "busy" | "error";
  text: string;
  /**
   * A failure stands until it is dismissed or the story next changes: it is
   * shown while the state is still this one.
   */
  during?: StudioState;
}

const AUTOSAVE_MS = 900;

/** Below 768px the room is a phone's: the tool card is a bottom sheet. */
const PHONE_QUERY = "(max-width: 767.98px)";

/** A media query, read after mount (false on the server and the first paint). */
function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia?.(query);
      list?.addEventListener("change", onChange);
      return () => list?.removeEventListener("change", onChange);
    },
    [query],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
}
const noSubscribe = () => () => {};
const UID_KEY = "ssync-studio-uid";

function localUserId(): string {
  try {
    const existing = window.localStorage.getItem(UID_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(UID_KEY, fresh);
    return fresh;
  } catch {
    return "local";
  }
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "my-story";
}

const STEP_TEMPLATE: PublishStep[] = [
  // First because it happens first: each voice is evened out on its way to AAC (T17).
  { id: "level", label: "Evening out each voice", state: "pending" },
  { id: "voices", label: VOICES_TO_AAC, state: "pending" },
  { id: "assemble", label: "Assembling the SSYNC manifest", state: "pending" },
  { id: "save", label: "Saving your tape", state: "pending" },
];

/** What the printed tape's card shows about the tape (T16): all of it read from the published manifest. */
type PrintedTape = Pick<PublishCardProps, "firstPicture" | "layers" | "consentWritten" | "size">;

const NOT_PRINTED: PrintedTape = {
  firstPicture: null,
  layers: {
    Metadata: false,
    Visual: false,
    Text: false,
    Voice: false,
    Sound: false,
    Behavior: false,
    Signature: false,
  },
  consentWritten: false,
  size: { pictureBytes: 0, voiceBytes: 0, totalBytes: 0 },
};

/** Page 1's picture for the label, the seven layers, the consent record and the bytes. */
function printedTape(manifest: SsyncManifest): PrintedTape {
  const first = manifest.pages[0]?.illustration;
  return {
    firstPicture: first?.url ? { src: first.url, alt: first.alt ?? "" } : null,
    layers: layerPresence(manifest),
    consentWritten: Boolean(manifest.signature?.voiceConsent?.length),
    size: tapeBytes(manifest),
  };
}

/** Wall-clock minutes:seconds from the first edit to now. */
function madeIn(startedAt: string): string {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return "0:00";
  return formatClock(Math.max(0, (Date.now() - start) / 1000));
}


/** Sign-in failures are read by a parent at bedtime, not a developer. */
function humanizeAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const m = raw.toLowerCase();
  if (!m) return "That did not work. Check the email and password and try again.";
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("load failed"))
    return "We couldn't reach the sign-in service. Check the connection and try again.";
  if (m.includes("invalid login") || m.includes("invalid credentials") || m.includes("invalid_grant"))
    return "That email and password don't match. Try again, or make an account.";
  if (m.includes("already registered") || m.includes("already exists") || m.includes("already been registered"))
    return "That email already has an account — sign in instead.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Too many tries in a row — wait a minute and try again.";
  if (m.includes("password") && (m.includes("6") || m.includes("short") || m.includes("weak")))
    return "Passwords need at least 6 characters.";
  if (m.includes("email") && (m.includes("invalid") || m.includes("valid")))
    return "That doesn't look like an email address — check it and try again.";
  if (m.includes("confirm")) return "Confirm the email we sent you first, then sign in.";
  return "That did not work. Check the email and password and try again.";
}

/**
 * Test seam for the ready card's cloud presentation (the QR, the share sheet,
 * the unlisted note), which no test environment has a cloud library to reach:
 * `window.__ssyncTestCloud = true` shows the card as the cloud library's link.
 * It changes what the card shows, never where the tape is saved, and a
 * production build compiles it away (NODE_ENV is inlined): there it is always
 * `undefined`.
 */
function testCloudOverride(): boolean | undefined {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return undefined;
  const value = (window as Window & { __ssyncTestCloud?: unknown }).__ssyncTestCloud;
  return typeof value === "boolean" ? value : undefined;
}

export default function Studio() {
  const [state, setState] = React.useState<StudioState>(() => blankState());
  const [activeIndex, setActiveIndexState] = React.useState(0);
  const [advanced, setAdvanced] = React.useState(false);
  const [tool, setTool] = React.useState<StudioTool | null>(null);
  const [phase, setPhase] = React.useState<Phase>("edit");
  const [boot, setBoot] = React.useState<Boot>("loading");
  const [restore, setRestore] = React.useState<SavedDraft | null>(null);
  const [pendingOpen, setPendingOpen] = React.useState<PendingOpen | null>(null);
  const [pendingReply, setPendingReply] = React.useState<PendingReply | null>(null);
  const [openNote, setOpenNote] = React.useState<OpenNote | null>(null);
  const [opening, setOpening] = React.useState(false);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [magicBusy, setMagicBusy] = React.useState(false);
  /** Magic's idea, kept here so a take that sets Magic aside never loses it. */
  const [magicPrompt, setMagicPrompt] = React.useState("");
  const [draftNote, setDraftNote] = React.useState<string | null>(null);
  const [steps, setSteps] = React.useState<PublishStep[]>(STEP_TEMPLATE);
  const [publishError, setPublishError] = React.useState<string | null>(null);
  const [publishNote, setPublishNote] = React.useState<string | null>(null);
  /** Why the saved tape got no link, in `shareBook`'s own words; null when it did not say. */
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [shareUrl, setShareUrl] = React.useState<string | null>(null);
  const [madeInLabel, setMadeInLabel] = React.useState("0:00");
  const [announcement, setAnnouncement] = React.useState("");
  const reannounceFrame = React.useRef<number | null>(null);
  /**
   * Words a parent may trigger twice in a row ("Page 3 is Hush now." after
   * applying the same feeling again). An unchanged live region is not news to
   * a screen reader, so the region is emptied and the words written a frame
   * later — the same clear-then-write "Everything deleted." uses.
   */
  const reannounce = React.useCallback((text: string) => {
    if (reannounceFrame.current !== null) window.cancelAnimationFrame(reannounceFrame.current);
    setAnnouncement("");
    reannounceFrame.current = window.requestAnimationFrame(() => {
      reannounceFrame.current = null;
      setAnnouncement(text);
    });
  }, []);
  React.useEffect(
    () => () => {
      if (reannounceFrame.current !== null) window.cancelAnimationFrame(reannounceFrame.current);
    },
    [],
  );

  /* The honest unauthenticated path: cloud configured, nobody signed in. */
  const [authOffer, setAuthOffer] = React.useState(false);
  const [authBusy, setAuthBusy] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [authReady, setAuthReady] = React.useState(false);

  const stateRef = React.useRef(state);
  stateRef.current = state;
  const activeIndexRef = React.useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  /** The room: everything behind the publish card (inert while it is open). */
  const roomRef = React.useRef<HTMLDivElement | null>(null);
  /** "Finish my story"'s holder: the publish card hands focus back to it. */
  const finishRef = React.useRef<HTMLButtonElement | null>(null);
  /** The phone bar's "More" key, and whether its little panel is open. */
  const moreRef = React.useRef<HTMLButtonElement | null>(null);
  const [barMenu, setBarMenu] = React.useState(false);
  /**
   * Where focus goes back to after the "Open <title>?" question: the bar's
   * "Open a tape", or on a phone (where it waits in a closed panel) "More".
   */
  const tapeOpenerRef = React.useMemo<React.RefObject<HTMLElement | null>>(
    () => ({
      get current(): HTMLElement | null {
        const bar = openButtonRef.current;
        return bar && bar.getClientRects().length > 0 ? bar : moreRef.current;
      },
    }),
    [],
  );
  /** document.body exists (after mount): the publish card is portalled there. */
  const portalReady = React.useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const tapeInputRef = React.useRef<HTMLInputElement | null>(null);
  const openButtonRef = React.useRef<HTMLButtonElement | null>(null);
  /**
   * The state the stored draft already holds. Autosave writes only when the
   * state has changed since, so a story kept or restored as it was stays in
   * localStorage byte for byte.
   */
  const savedStateRef = React.useRef<StudioState | null>(null);
  /**
   * "read by" as last typed on a re-voiced tape (its author is never
   * overwritten); null until the gate is passed for this story, when the gate
   * starts from the voice the shelf chose (T22b), else empty.
   */
  const readerRef = React.useRef<string | null>(null);
  const publishedRef = React.useRef<SsyncManifest | null>(null);
  const authorRef = React.useRef("");
  /** Each voice and who consented to it — a retry publishes with the same consent. */
  const consentRef = React.useRef<ConsentChoice[]>([]);
  /** The gate's clock when it passed: the consent stamp's date, kept for "Try again". */
  const stampedAtRef = React.useRef<Date | null>(null);
  /** "story by" as it is being typed in the gate; the gate's voice list follows it. */
  const [gateAuthor, setGateAuthor] = React.useState("");
  const cuesRef = React.useRef<StudioCues | null>(null);
  const recordingRef = React.useRef(false);
  /**
   * Which story is on the Stage, bumped whenever the whole story is replaced.
   * A take that started on one story is never filed onto another's page.
   */
  const storyGenerationRef = React.useRef(0);
  /** The engine's "a take is asked for or running" flag (set once the hook exists). */
  const takeLiveSource = React.useRef<{ current: boolean } | null>(null);
  /**
   * A take is starting (the microphone permission may still be pending) or
   * running. Everything that would change the page under a take asks this,
   * not `recording`, which turns true only once the microphone is open.
   */
  const takeLive = React.useCallback(
    () => recordingRef.current || Boolean(takeLiveSource.current?.current),
    [],
  );
  /** A phone (< 768px): the Voice sheet covers the foot of the room there. */
  const phone = useMediaQuery(PHONE_QUERY);

  const pages = state.manifest.pages;
  const page: SsyncPage | undefined = pages[activeIndex];
  const pageCount = pages.length;

  /* ------------------------------------------------------------- recording */

  const handleRecorded = React.useCallback(
    (pageId: number, dataUrl: string, mimeType: string, duration: number) => {
      setState((prev) => {
        const meta: RecordingMeta = { mimeType, duration };
        return {
          ...prev,
          recordings: { ...prev.recordings, [String(pageId)]: meta },
          manifest: updatePage(prev.manifest, pageId, (p) => ({
            ...p,
            text: {
              ...(p.text ?? { content: "" }),
              content: p.text?.content ?? "",
              audioUrl: dataUrl,
              // A fresh take is a draft codec again, whatever the last publish left.
              audioCodec: undefined,
            },
          })),
        };
      });
      const index = stateRef.current.manifest.pages.findIndex((p) => p.id === pageId);
      setAnnouncement(
        `Voice recorded on page ${index >= 0 ? index + 1 : "?"}, ${Math.round(duration)} seconds.`,
      );
    },
    [],
  );

  /**
   * Page changes go through here so every one of them makes the same sound and
   * obeys the same lock. Turning the page mid-take would file the recording
   * against the wrong page, so while the mic is live the tape does not move.
   */
  const setActive = React.useCallback((index: number, options?: { silent?: boolean }) => {
    if (takeLive()) {
      setAnnouncement("Finish the recording before turning the page.");
      return;
    }
    const clamped = Math.max(0, Math.min(index, stateRef.current.manifest.pages.length - 1));
    const changed = clamped !== activeIndexRef.current;
    activeIndexRef.current = clamped;
    setActiveIndexState(clamped);
    if (changed && !options?.silent) cuesRef.current?.pageTurn();
  }, [takeLive]);

  const dropTake = React.useCallback((when: "starting" | "stopped") => {
    setAnnouncement(
      when === "starting"
        ? "The story changed while the microphone was starting, so nothing was recorded."
        : "That recording was for the story before this one, so it was not kept.",
    );
  }, []);

  const audio = useStudioAudio({
    stateRef,
    activeIndexRef,
    onSelectPage: setActive,
    onRecorded: handleRecorded,
    storyGenerationRef,
    onTakeDropped: dropTake,
  });
  const {
    setMusicActive,
    syncMix,
    stop: stopAudio,
    play,
    toggleRecord,
    cancelRecording,
    clearMicError,
    recording,
  } = audio;
  cuesRef.current = audio.cues;
  recordingRef.current = recording;
  takeLiveSource.current = audio.takeLiveRef;

  /* --------------------------------------------------------- draft restore */

  /** "Keep working on it": the saved draft, exactly as it was stored. */
  const keepSavedDraft = React.useCallback((saved: SavedDraft) => {
    savedStateRef.current = saved.state;
    // Restoring is not an edit: a failure note about a tape stays up.
    setOpenNote((note) => (note?.tone === "error" ? { ...note, during: saved.state } : note));
    setState(saved.state);
    activeIndexRef.current = 0;
    setActiveIndexState(0);
    setRestore(null);
    setBoot("ready");
  }, []);

  /* ------------------------------------------------------------ open a tape */

  /**
   * A new story replaces the one on the Stage cleanly (an opened tape, a
   * reply): nothing published, no question left open, page 1 on the Stage.
   */
  const replaceStory = React.useCallback(
    (next: StudioState, announcement: string) => {
      // A take running under the old story is cancelled, never filed on the
      // new one: the announcement says it was not kept. (A take still
      // starting is dropped by the engine, which says so itself.)
      const discarded = recordingRef.current;
      stopAudio();
      // Never a microphone left open under a story that is gone.
      cancelRecording();
      storyGenerationRef.current += 1;
      setState(next);
      publishedRef.current = null;
      authorRef.current = "";
      consentRef.current = [];
      stampedAtRef.current = null;
      readerRef.current = null;
      setShareUrl(null);
      setPublishNote(null);
      setAuthOffer(false);
      setAuthReady(false);
      activeIndexRef.current = 0;
      setActiveIndexState(0);
      setTool(null);
      setPhase("edit");
      setPendingOpen(null);
      setPendingReply(null);
      setRestore(null);
      setBoot("ready");
      setAnnouncement(
        discarded ? `${announcement} The recording in progress was stopped and not kept.` : announcement,
      );
    },
    [cancelRecording, stopAudio],
  );

  /**
   * An opened tape replaces the story cleanly: its re-voiced manifest, no
   * recordings, nothing published, a fresh clock, where it came from, and
   * whose voice the shelf chose for it (T22b), when it chose one.
   */
  const applyOpenedTape = React.useCallback(
    (tape: OpenedTape, mood: MoodName | null, voice: string | null = null) => {
      const fresh = blankState();
      const n = tape.manifest.pages.length;
      const name = voiceName(voice);
      replaceStory(
        {
          ...fresh,
          manifest: tape.manifest,
          // A mood chosen on the link plays on every page; otherwise the
          // tape's own, with its per-page moods (T24a).
          ...openedMoods(tape, mood),
          remix: tape.remix,
          ...(name ? { voiceName: name } : {}),
        },
        `Opened ${tape.manifest.metadata.title}, ${n} ${n === 1 ? "page" : "pages"}. Record your voice on any page.`,
      );
    },
    [replaceStory],
  );

  /**
   * A thank-you (T18): one blank page, the seed's title, the Creator's
   * default music, `signature.replyTo` when there is a link to answer, and
   * the chip's title beside the manifest (never in it).
   */
  const applyReply = React.useCallback(
    (seed: ReplySeed) => {
      const fresh = blankState();
      replaceStory(
        {
          ...fresh,
          manifest: {
            ...fresh.manifest,
            metadata: { ...fresh.manifest.metadata, title: seed.title },
            ...(seed.replyTo ? { signature: { replyTo: seed.replyTo } } : {}),
          },
          reply: { title: seed.chipTitle, ...(seed.name ? { name: seed.name } : {}) },
        },
        `Reply to ${seed.chipTitle}: one page for your picture, your words and your voice.`,
      );
      // The reply's first step is its picture: a keyboard starts there, not at
      // the top of the document. Never the title field, which would raise a
      // phone's keyboard over the page.
      window.requestAnimationFrame(() => {
        roomRef.current
          ?.querySelector<HTMLElement>('[data-studio-tool="photo"]')
          ?.focus({ preventScroll: true });
      });
    },
    [replaceStory],
  );

  /** Never lose a story by accident: a story on the Stage (or saved) is asked about first. */
  const offerTape = React.useCallback(
    (offer: PendingOpen) => {
      if (offer.saved || storyHasContent(stateRef.current)) setPendingOpen(offer);
      else applyOpenedTape(offer.tape, offer.mood, offer.voice);
    },
    [applyOpenedTape],
  );

  const openTape = React.useCallback(
    async (
      load: () => Promise<OpenedTape>,
      label: string,
      fallback: TapeOpenFailure,
      options: { mood?: MoodName | null; voice?: string | null; saved?: SavedDraft | null } = {},
    ) => {
      setOpening(true);
      setOpenNote({ tone: "busy", text: label });
      try {
        const tape = await load();
        setOpenNote(null);
        offerTape({ tape, mood: options.mood ?? null, voice: options.voice ?? null, saved: options.saved ?? null });
      } catch (err) {
        // Nothing was replaced. A saved draft is offered back the usual way.
        setOpenNote({
          tone: "error",
          text: err instanceof TapeOpenError ? err.message : OPEN_TAPE_COPY[fallback],
          during: stateRef.current,
        });
        if (options.saved) setRestore(options.saved);
      } finally {
        setOpening(false);
      }
    },
    [offerTape],
  );

  /* ------------------------------------------------------------------ boot */

  // Boot: the saved draft, and `?open=` / `?mood=` (and T22b's `#voice=`) —
  // read after mount from window.location (the route stays static) and then
  // cleaned off the URL, so a refresh does not open the tape again. With a
  // saved draft, "Open <title>?" takes the place of the restore prompt: one
  // question, not two.
  const bootedRef = React.useRef(false);
  React.useEffect(() => {
    // Once per mount: the query is taken off the URL the first time it is read.
    if (bootedRef.current) return;
    bootedRef.current = true;
    const found = loadDraft();
    const saved = found && storyHasContent(found.state) ? found : null;
    const query = takeOpenTapeQuery();
    // The voice rides with the tape it was chosen for; alone it means nothing.
    const voice = takeVoiceName();
    const reply = takeReplySeed();
    if (query.open) {
      const open = query.open;
      setBoot(saved ? "asking" : "ready");
      void openTape(
        () => openTapeFromQuery(open),
        openingLabel({ open }),
        open === HOUSE_TAPE_QUERY ? "houseUnavailable" : "notFound",
        { mood: query.mood, voice, saved },
      );
    } else if (reply) {
      // A saved story is asked about first, in place of the restore prompt.
      if (saved) {
        setPendingReply({ seed: reply, saved });
        setBoot("asking");
      } else {
        applyReply(reply);
      }
    } else if (saved) {
      setRestore(saved);
      setBoot("asking");
    } else {
      setBoot("ready");
    }
  }, [openTape, applyReply]);

  React.useEffect(() => {
    if (boot !== "ready") return;
    // Nothing changed since the draft was written or restored: leave it be.
    if (state === savedStateRef.current) return;
    const id = window.setTimeout(() => {
      const outcome = saveDraft(stateRef.current);
      if (outcome === "ok") savedStateRef.current = stateRef.current;
      setDraftNote(
        outcome === "quota"
          ? "Draft too big to autosave — finish the story to keep it."
          : outcome === "unavailable"
            ? "Autosave unavailable in this browser."
            : null,
      );
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(id);
  }, [state, boot]);

  /* ------------------------------------------------------------ audio sync */

  React.useEffect(() => {
    setMusicActive(tool === "music" || audio.playing);
  }, [tool, audio.playing, setMusicActive]);

  // The bed plays the active page's own mood (T24a): a page turn or a
  // per-page mood changes it, with the engine's default crossfade.
  React.useEffect(() => {
    syncMix();
  }, [
    activeIndex,
    state.mood,
    state.pageMoods,
    state.musicOn,
    state.musicVolume,
    state.narrationVolume,
    syncMix,
  ]);

  /* --------------------------------------------------------------- editing */

  const patchPage = React.useCallback((id: number, fn: (p: SsyncPage) => SsyncPage) => {
    setState((prev) => ({ ...prev, manifest: updatePage(prev.manifest, id, fn) }));
  }, []);

  const setTitle = (title: string) =>
    setState((prev) => ({
      ...prev,
      manifest: { ...prev.manifest, metadata: { ...prev.manifest.metadata, title } },
    }));

  const setAuthor = (author: string) =>
    setState((prev) => ({
      ...prev,
      manifest: { ...prev.manifest, metadata: { ...prev.manifest.metadata, author } },
    }));

  const setText = (content: string) => {
    if (!page) return;
    patchPage(page.id, (p) => ({ ...p, text: { ...(p.text ?? {}), content } }));
  };

  const setAlt = (alt: string) => {
    if (!page) return;
    patchPage(page.id, (p) => ({ ...p, illustration: { ...(p.illustration ?? {}), alt } }));
  };

  const setAutoPause = (seconds: number) => {
    if (!page) return;
    patchPage(page.id, (p) => ({ ...p, timing: { ...(p.timing ?? {}), autoPause: `${seconds}s` } }));
  };

  /**
   * "mood · page N" (T24a): the active page gets a mood of its own, or (null,
   * "Same as the story") follows the story again. Draft-only until publish.
   */
  const setPageMood = (mood: MoodName | null) => {
    if (!page) return;
    const id = String(page.id);
    setState((prev) => {
      const pageMoods = { ...(prev.pageMoods ?? {}) };
      if (mood) pageMoods[id] = mood;
      else delete pageMoods[id];
      return { ...prev, pageMoods };
    });
  };

  /**
   * "Type a feeling" (T24b). Only the resolved mood name arrives here — the
   * words stay in the Inspector's field — and both say what changed.
   * "Use for page N" goes through T24a's page mood; "Use for every page" is
   * the Music card's choice: the story mood, and no page keeps its own.
   */
  const applyFeelingToPage = (mood: MoodName) => {
    if (!page) return;
    setPageMood(mood);
    reannounce(`Page ${activeIndex + 1} is ${mood} now.`);
  };

  const applyFeelingToEveryPage = (mood: MoodName) => {
    setState((prev) => ({ ...prev, mood, pageMoods: {} }));
    reannounce(`Every page is ${mood} now.`);
  };

  const applyPauseToAll = () => {
    if (!page) return;
    const value = page.timing?.autoPause ?? `${DEFAULT_AUTO_PAUSE_S}s`;
    setState((prev) => ({
      ...prev,
      manifest: {
        ...prev.manifest,
        pages: prev.manifest.pages.map((p) => ({ ...p, timing: { ...(p.timing ?? {}), autoPause: value } })),
      },
    }));
  };

  const setTimingMultiplier = (value: number) =>
    setState((prev) => ({
      ...prev,
      manifest: {
        ...prev.manifest,
        settings: {
          ...(prev.manifest.settings ?? {}),
          accessibility: { ...(prev.manifest.settings?.accessibility ?? {}), timingMultiplier: value },
        },
      },
    }));

  /** Adds a blank page and selects it; refuses (false) mid-take. */
  const addPage = (): boolean => {
    if (takeLive()) {
      setAnnouncement("Finish the recording before adding a page.");
      return false;
    }
    setState((prev) => {
      const id = nextPageId(prev.manifest);
      return { ...prev, manifest: { ...prev.manifest, pages: [...prev.manifest.pages, blankPage(id)] } };
    });
    activeIndexRef.current = pages.length;
    setActiveIndexState(pages.length);
    cuesRef.current?.pageTurn();
    setAnnouncement(`Page ${pages.length + 1} added.`);
    return true;
  };

  const movePage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (takeLive() || target < 0 || target >= pages.length) return;
    setState((prev) => {
      const next = [...prev.manifest.pages];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return { ...prev, manifest: { ...prev.manifest, pages: next } };
    });
    activeIndexRef.current = target;
    setActiveIndexState(target);
    setAnnouncement(`Page moved to position ${target + 1}.`);
  };

  const deletePage = (index: number) => {
    if (takeLive() || pages.length <= 1) return;
    stopAudio();
    const victim = pages[index];
    setState((prev) => {
      const recordings = { ...prev.recordings };
      delete recordings[String(victim.id)];
      const kept = prev.manifest.pages.filter((_, i) => i !== index);
      return {
        ...prev,
        recordings,
        // A deleted page's own mood goes with it (T24a).
        pageMoods: prunePageMoods(prev.pageMoods ?? {}, kept.map((p) => p.id)),
        manifest: { ...prev.manifest, pages: kept },
      };
    });
    const next = Math.max(0, Math.min(index, pages.length - 2));
    activeIndexRef.current = next;
    setActiveIndexState(next);
    setAnnouncement("Page deleted.");
  };

  const deleteRecording = () => {
    if (!page) return;
    stopAudio();
    setState((prev) => {
      const recordings = { ...prev.recordings };
      delete recordings[String(page.id)];
      return {
        ...prev,
        recordings,
        manifest: updatePage(prev.manifest, page.id, (p) => ({
          ...p,
          text: {
            ...(p.text ?? { content: "" }),
            content: p.text?.content ?? "",
            audioUrl: undefined,
            audioCodec: undefined,
          },
        })),
      };
    });
    setAnnouncement("Recording deleted.");
  };

  /* ----------------------------------------------------------------- photo */

  /**
   * The camera can take the microphone, and a new picture would change the
   * page under the take: mid-take the picture waits, and says why.
   */
  const pickPhoto = () => {
    if (takeLive()) {
      setAnnouncement("Finish the recording before adding a picture.");
      return;
    }
    clearMicError();
    fileInputRef.current?.click();
  };

  /**
   * Play, Listen and Space all come here. Mid-take nothing plays: the page's
   * old voice, the browser voice or the bed would land in the open mic.
   */
  const playOrStop = (fromIndex?: number) => {
    if (takeLive()) {
      setAnnouncement("Finish the recording before playing the story.");
      return;
    }
    if (audio.playing) stopAudio();
    else void play(fromIndex);
  };

  /** The strip's last tile: a new page, then the camera, in one tap (s03). */
  const snapNextDrawing = () => {
    if (!addPage()) return;
    pickPhoto();
  };

  /**
   * The mood lane, one entry per page: each page's own mood, else the
   * story's (T24a), or none with music off.
   */
  const laneMoods = React.useMemo(
    () => moodsForLane({ manifest: { pages }, mood: state.mood, musicOn: state.musicOn, pageMoods: state.pageMoods }),
    [pages, state.musicOn, state.mood, state.pageMoods],
  );

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !page) return;
    setPhotoBusy(true);
    try {
      const processed = await processImageSafe(file);
      patchPage(page.id, (p) => ({
        ...p,
        illustration: {
          ...(p.illustration ?? {}),
          url: processed.dataUrl,
          alt: p.illustration?.alt || `Picture for page ${activeIndexRef.current + 1}`,
        },
      }));
      setAnnouncement("Picture added.");
    } catch {
      setAnnouncement("That picture could not be opened. Try another one.");
    } finally {
      setPhotoBusy(false);
    }
  };

  /* ------------------------------------------------- open a tape (a file) */

  const pickTape = () => {
    if (takeLive()) {
      setAnnouncement("Finish the recording before opening a tape.");
      return;
    }
    if (opening) return;
    clearMicError();
    tapeInputRef.current?.click();
  };

  /** Read and unpacked on this device by the container loader. Nothing is uploaded. */
  const onTapeFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void openTape(() => openTapeFile(file), openingLabel({ file: true }), "badFile");
  };

  /* ----------------------------------------------------------------- magic */

  const MAGIC_WAITS = "Finish the recording before making a new story.";
  const MAGIC_SET_ASIDE =
    "Your recording comes first: the new story was not made. Your idea is still in Magic for after the take.";

  const runMagic = async (prompt: string, pageCountWanted: number, look: MagicLook) => {
    // A new story mid-take would replace the page the take is being told on.
    if (takeLive()) {
      setAnnouncement(MAGIC_WAITS);
      return;
    }
    setMagicBusy(true);
    stopAudio();
    try {
      const story = generateStory(prompt, { pages: pageCountWanted, ageRange: "4-8" });
      const built: SsyncPage[] = [];
      for (const [index, storyPage] of story.pages.entries()) {
        let url: string | undefined;
        try {
          const raw = generateIllustration(storyPage.text, look);
          if (raw) {
            // Route the canvas art through the shipped image pipeline so it is
            // JPEG at a sane size like every other picture in a story.
            const processed = await processImageSafe(await dataUrlToBlob(raw));
            url = processed.dataUrl;
          }
        } catch {
          url = undefined;
        }
        built.push({
          id: index + 1,
          layout: "image-top",
          illustration: { url, alt: `Illustration for page ${index + 1}` },
          text: { content: storyPage.text, wordHighlight: true },
          timing: { autoPause: `${DEFAULT_AUTO_PAUSE_S}s` },
        });
        // let the "Writing…" label paint between pages
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      // A take asked for while the pages were being written keeps its story
      // (even while the microphone permission is still pending); the idea
      // stays in the Magic card for after the take.
      if (takeLive()) {
        setAnnouncement(MAGIC_SET_ASIDE);
        return;
      }
      setMagicPrompt("");
      storyGenerationRef.current += 1;
      setState((prev) => ({
        ...prev,
        recordings: {},
        // New pages 1…n are not the pages any per-page mood was chosen for.
        pageMoods: {},
        // Magic replaces every page, so an opened tape is a new story now: it is
        // no longer a re-voice of anything, and the opened tape's credit and
        // blurb are not this story's. The byline becomes the author again, and
        // the voice chosen for the copy (T22b) goes with the copy.
        remix: null,
        voiceName: undefined,
        manifest: {
          ...prev.manifest,
          metadata: prev.remix
            ? { ...blankManifest().metadata, title: story.title }
            : { ...prev.manifest.metadata, title: story.title },
          pages: built,
        },
      }));
      activeIndexRef.current = 0;
      setActiveIndexState(0);
      setTool(null);
      setAnnouncement(`Made a ${built.length} page story called ${story.title}.`);
    } finally {
      setMagicBusy(false);
    }
  };

  /* --------------------------------------------------------------- publish */

  const markStep = React.useCallback(
    (id: string, next: Partial<PublishStep>) =>
      setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...next } : s))),
    [],
  );

  const bookInput = React.useCallback(
    (manifest: SsyncManifest): BookInput => ({
      title: manifest.metadata.title,
      author: manifest.metadata.author ?? "",
      genre: manifest.metadata.genre ?? "children",
      ageRange: manifest.metadata.ageRange ?? "4-8",
      pageCount: manifest.pages.length,
      description: manifest.metadata.description ?? "",
      thumbnail: null,
      // Unlisted-by-URL. Since migration 003 there is no public read policy:
      // a link is opened only through the by-code lookup function
      // (`storybook_by_share_code`), which checks `is_public`, so a story that is not public can never be opened
      // by the person holding the link — which is the entire point of
      // publishing (see PRIVACY.md, "public").
      isPublic: true,
      ssyncData: manifest as unknown as object,
    }),
    [],
  );

  /**
   * Save + link. Re-publishing UPDATES the story it wrote last time (one row,
   * one link, one thing to delete), and every failure is reported as what it
   * actually was.
   */
  const persist = React.useCallback(
    async (manifest: SsyncManifest) => {
      const cloud = isCloudEnabled();
      // Re-publish updates the copy it made last time — but only in the same
      // place. A tape kept on the device because nobody was signed in has no
      // row to update once they do sign in; that becomes a first save, and the
      // device copy stays in `publishedIds` so delete-all still reaches it.
      const previous = stateRef.current.published;
      const existingId = previous && previous.cloud === cloud ? previous.id : null;

      let userId = "local";
      if (cloud) {
        try {
          const user = await getUser();
          userId = user?.id ?? localUserId();
        } catch {
          userId = localUserId();
        }
      } else {
        userId = localUserId();
      }

      let savedId: string | null = null;
      let code: string | null = null;
      let usedCloud = cloud;

      try {
        const saved = await saveBook(userId, bookInput(manifest), existingId);
        savedId = saved.id;
      } catch (err) {
        const kind = cloudErrorKind(err);
        if (cloud && (kind === "auth" || kind === "permission")) {
          // Honest fallback: keep the tape here and say so. Never "storage full".
          usedCloud = false;
          setAuthOffer(true);
          setPublishNote(null); // the card explains the no-link state; one voice, not two
          try {
            savedId = saveLocalBook(bookInput(manifest), existingId).id;
          } catch (localErr) {
            setPublishNote(
              cloudErrorKind(localErr) === "quota"
                ? "This device is out of room, so no copy was kept. Download the .storysync file to keep your tape."
                : "No copy could be kept here. Download the .storysync file to keep your tape.",
            );
          }
        } else if (kind === "quota") {
          setPublishNote(
            "This device is out of room, so no copy was kept. Download the .storysync file to keep your tape.",
          );
        } else if (kind === "network") {
          setPublishNote(
            "The cloud library could not be reached, so no link was made. Download the .storysync file, or try again later.",
          );
        } else {
          setPublishNote(
            err instanceof Error && err.message
              ? `Your tape could not be saved: ${err.message}`
              : "Your tape could not be saved. Download the .storysync file to keep it.",
          );
        }
      }

      setLinkError(null);
      if (savedId && usedCloud === cloud) {
        try {
          code = await shareBook(savedId);
        } catch (err) {
          code = null;
          // The share step says why in a sentence of its own; the card shows
          // it instead of its general no-link copy.
          setLinkError(err instanceof Error && err.message.trim() ? err.message.trim() : null);
        }
      }

      const url = code ? `${window.location.origin}/read?story=${encodeURIComponent(code)}` : null;

      // The signature layer carries the link with the tape, so a downloaded
      // .storysync knows where it came from.
      let finalManifest = manifest;
      if (url) {
        finalManifest = { ...manifest, signature: { ...(manifest.signature ?? {}), shareUrl: url } };
        publishedRef.current = finalManifest;
        if (savedId) {
          try {
            await (usedCloud
              ? saveBook(userId, bookInput(finalManifest), savedId)
              : Promise.resolve(saveLocalBook(bookInput(finalManifest), savedId)));
          } catch {
            /* the copy without the URL is already saved; not worth failing over */
          }
        }
        setAuthOffer(false);
      }

      setShareUrl(url);
      markStep("save", {
        state: savedId ? "done" : "error",
        detail: savedId ? (usedCloud ? "cloud library" : "this device") : "not saved",
      });

      setState((prev) => ({
        ...prev,
        manifest: finalManifest,
        published: savedId
          ? { id: savedId, shareCode: code, cloud: usedCloud, at: new Date().toISOString() }
          : prev.published,
        publishedIds: savedId
          ? Array.from(new Set([...prev.publishedIds, savedId]))
          : prev.publishedIds,
      }));

      return { savedId, url };
    },
    [bookInput, markStep],
  );

  const runPublish = React.useCallback(
    async (author: string, consents: ConsentChoice[], stampedAt?: Date) => {
      stopAudio();
      authorRef.current = author;
      consentRef.current = consents;
      stampedAtRef.current = stampedAt ?? null;
      setPhase("publishing");
      setPublishError(null);
      setPublishNote(null);
      setAuthOffer(false);
      setAuthError(null);
      setAuthReady(false);
      setSteps(STEP_TEMPLATE.map((s) => ({ ...s })));
      setMadeInLabel(madeIn(stateRef.current.startedAt));

      const base = stateRef.current;
      // A re-voiced tape keeps its author; the gate's byline is the reader,
      // who becomes the narrator and the consent voice. Otherwise the byline
      // IS the author — cleared included — exactly as the gate's sheet said.
      const remix = base.remix ?? null;
      const source = !remix
        ? { ...base.manifest, metadata: { ...base.manifest.metadata, author } }
        : base.manifest;

      try {
        /*
         * 1 — evening out each voice, then the narration codec normalization
         * (the load-bearing publish rule), one pass per recording: a take is
         * levelled on its way to AAC, never decoded twice.
         */
        const levelOn = base.levelVoices !== false;
        markStep("level", { state: "active" });
        markStep("voices", { state: "active" });
        const total = source.pages.filter((p) => p.text?.audioUrl?.startsWith("data:")).length;
        let done = 0;
        /** Takes brought to the target loudness or found there, now or by an earlier publish. */
        let even = 0;
        /** Takes left exactly as recorded (no AAC encoder for an AAC take, or not decodable). */
        let leftAsRecorded = 0;
        /** What each take was published as: the step says what really happened. */
        let asAac = 0;
        let asWav = 0;
        const voicesStep = (): Partial<PublishStep> => {
          const codec = voicesStepText(done, total, asAac, asWav);
          return { label: codec.label, detail: codec.detail };
        };
        const levelDetail = () =>
          !levelOn
            ? "off"
            : total === 0
              ? "no recordings"
              : `${even}/${total}${leftAsRecorded ? ` · ${leftAsRecorded} left as recorded` : ""}`;
        const nextRecordings: Record<string, RecordingMeta> = {};
        const publishedPages: SsyncPage[] = [];

        for (const [index, original] of source.pages.entries()) {
          const next: SsyncPage = JSON.parse(JSON.stringify(original));
          const newId = index + 1;
          const meta = base.recordings[String(original.id)];
          next.id = newId;
          if (meta) nextRecordings[String(newId)] = meta;

          // Carry the music choice in the protocol itself: `page.music` present
          // = play this mood's bed, absent = SILENCE. The Player reads exactly
          // this, so music-off in the studio is music-off on the tape. Each
          // page carries its own mood (T24a), else the story's.
          const music = publishedMusic(base, original.id);
          if (music) next.music = music;
          else delete next.music;

          const url = next.text?.audioUrl;
          if (next.text && url && url.startsWith("data:")) {
            // A take is levelled once: a levelled clip passes straight through.
            const needsLevel = levelOn && !meta?.levelled;
            if (original.text?.audioCodec && !needsLevel) {
              // Already normalized by an earlier publish — decoding and
              // re-encoding it would only lose quality and time.
              if (levelOn) even += 1;
              if (original.text?.audioCodec === "aac") asAac += 1;
              else asWav += 1;
              done += 1;
              markStep("level", { detail: levelDetail() });
              markStep("voices", voicesStep());
            } else {
              const blob = await dataUrlToBlob(url);
              // A clip published with levelling off is already AAC or WAV; it
              // is levelled now as what it is (a WAV in place, an AAC only
              // where it can be re-encoded as AAC).
              const published = original.text?.audioCodec;
              const mime = published
                ? published === "aac"
                  ? "audio/mp4"
                  : "audio/wav"
                : meta?.mimeType || blob.type;
              const normalized = await normalizeNarration(blob, mime, levelOn ? { level: true } : undefined);
              const levelling = normalized.levelling;
              if (levelling?.outcome === "skipped") leftAsRecorded += 1;
              else if (levelling) even += 1;
              // Force the clean container mime: a recorder blob carries
              // "audio/mp4;codecs=…", and the container's data-URL parser (and the
              // asset extension map) only understand the bare type.
              const clean =
                normalized.blob.type === normalized.mimeType
                  ? normalized.blob
                  : new Blob([normalized.blob], { type: normalized.mimeType });
              next.text.audioUrl = await blobToDataUrl(clean);
              next.text.audioCodec = normalized.codec;
              if (normalized.codec === "aac") asAac += 1;
              else asWav += 1;
              // Keep the draft meta in step with what is now on the page, so a
              // second publish sees AAC/WAV and passes it straight through.
              nextRecordings[String(newId)] = {
                mimeType: normalized.mimeType,
                duration: meta?.duration ?? 0,
                levelled: levelling ? levelling.outcome !== "skipped" : meta?.levelled === true,
              };
              done += 1;
              markStep("level", { detail: levelDetail() });
              markStep("voices", voicesStep());
            }
          }
          publishedPages.push(next);
        }
        // Levelling never fails a publish: a take it could not touch is
        // published as recorded, and the step says how many.
        markStep("level", { state: "done", detail: levelDetail() });
        markStep("voices", { state: "done", ...(total ? voicesStep() : { detail: "no recordings" }) });

        /* 2 — assemble the manifest, signature layer included */
        markStep("assemble", { state: "active" });
        // One consent record per recorded voice, each with its own grantor
        // (a parent or guardian, or "self"), dated with the grown-up's own
        // calendar day (docs/format-spec.md §7.1). The gate asks for every
        // voice; a voice without consent never leaves the device.
        const voices = recordedVoices(publishedPages, author);
        const choices: ConsentChoice[] = voices.map((voice) => {
          const choice = consents.find((c) => c.voice === voice);
          if (!choice) throw new Error("Every recorded voice needs a grown-up's consent first.");
          return choice;
        });
        const hasVoiceInStory = voices.length > 0;
        // One captured moment: the gate's own clock, the one its stamp and
        // sheet were drawn from, so the record's date is the stamp's date.
        const now = stampedAt ?? new Date();
        const credit = remix ? source.metadata.author?.trim() || remix.author : author;
        const signature: SsyncSignature = {
          ...(source.signature ?? {}),
          ownership: credit ? `© ${now.getFullYear()} ${credit}` : `© ${now.getFullYear()}`,
          rights: "personal use",
        };
        // Where a re-voiced tape came from travels with it.
        if (remix) signature.remixOf = remix.of;
        if (hasVoiceInStory) {
          signature.voiceConsent = consentRecordsFor(choices, consentDate(now));
        } else {
          // No recorded voice, no consent record — not even one left from an
          // earlier publish of this draft.
          delete signature.voiceConsent;
        }

        // Whose voice it is ("VOICE: <narrator>"): the lead name of "story by",
        // and never a person's name on a tape the browser voice reads.
        const narrator = resolveNarrator({
          byline: author,
          existing: source.metadata.narrator,
          hasRecordedVoice: hasVoiceInStory,
        });

        const manifest: SsyncManifest = {
          ...source,
          version: "2.0",
          metadata: {
            ...source.metadata,
            title: source.metadata.title.trim() || DEFAULT_TITLE,
            created: source.metadata.created || now.toISOString(),
            // Only when it is not simply page 1 again — a cover that duplicates
            // the first illustration doubles the size of every copy.
            coverImage: pickCoverImage(publishedPages),
            narrator,
          },
          signature,
          pages: publishedPages,
        };
        if (!narrator) delete manifest.metadata.narrator;
        const validation = validateManifest(manifest);
        if (!validation.ok) throw new Error(validation.errors.join("; "));
        publishedRef.current = manifest;
        markStep("assemble", { state: "done", detail: `${publishedPages.length} pages` });

        /* 3 — save (cloud library or this device), then the share link */
        markStep("save", { state: "active" });
        // The pages are renumbered 1…n: the recordings and the per-page moods
        // follow them, so a second publish writes the same tape.
        setState((prev) => ({
          ...prev,
          recordings: nextRecordings,
          pageMoods: renumberPageMoods(
            prev.pageMoods ?? {},
            source.pages.map((p) => p.id),
          ),
        }));
        await persist(manifest);
        setPhase("published");
      } catch (err) {
        setSteps((prev) => prev.map((s) => (s.state === "active" ? { ...s, state: "error" } : s)));
        setPublishError(err instanceof Error ? err.message : "Something went wrong while finishing.");
      }
    },
    [markStep, persist, stopAudio],
  );

  /* ------------------------------------------------------- auth (honest path) */

  const handleAuth = React.useCallback(
    async (mode: AuthMode, email: string, password: string, name: string) => {
      setAuthBusy(true);
      setAuthError(null);
      try {
        if (mode === "in") await signIn(email, password);
        else await signUp(email, password, name || "");
        const user = await getUser().catch(() => null);
        if (!user) {
          setAuthError(
            "Account made. Confirm the email we sent, then come back and sign in to get a link.",
          );
          return;
        }
        setAuthReady(true);
      } catch (err) {
        setAuthError(humanizeAuthError(err));
      } finally {
        setAuthBusy(false);
      }
    },
    [],
  );

  const makeLink = React.useCallback(async () => {
    const manifest = publishedRef.current;
    if (!manifest) return;
    setAuthBusy(true);
    setPublishNote(null);
    try {
      const result = await persist(manifest);
      if (!result.url) {
        setPublishNote("Still no link — the cloud library would not take this tape.");
      } else {
        setAuthReady(false);
      }
    } finally {
      setAuthBusy(false);
    }
  }, [persist]);

  const downloadTape = () => {
    const manifest = publishedRef.current ?? stateRef.current.manifest;
    try {
      const bytes = buildStorysyncFromStory(manifest);
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([buffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${slugify(manifest.metadata.title)}.storysync`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      setPublishNote(
        err instanceof Error ? `The file could not be packed: ${err.message}` : "The file could not be packed.",
      );
    }
  };

  const deleteEverything = async () => {
    stopAudio();
    const { manifest, published, publishedIds } = stateRef.current;
    const ids = Array.from(new Set([...(published ? [published.id] : []), ...publishedIds]));
    // Where anyone stopped in this tape on this device (T21) goes with it:
    // every key a copy could be remembered under, read before the rows go.
    forgetPlaces([
      ...placeKeysOfStories(ids),
      ...placeKeysOfTape(publishedRef.current ?? manifest, { shareCode: published?.shareCode }),
      ...placeKeysOfTape(manifest, {}),
    ]);
    await deleteBooks(ids);
    clearDraft();
    cancelRecording();
    storyGenerationRef.current += 1;
    publishedRef.current = null;
    setShareUrl(null);
    setPublishNote(null);
    setAuthOffer(false);
    setAuthReady(false);
    setState(blankState());
    activeIndexRef.current = 0;
    setActiveIndexState(0);
    setTool(null);
    setPhase("edit");
    // The live region sits in the room, which is inert until this render
    // lands: the words are written a frame later, once it is live again, so a
    // screen reader hears them. Focus starts over where a story starts — the
    // Photo tool — never on <body> (the blank story's Finish is disabled).
    setAnnouncement("");
    window.requestAnimationFrame(() => {
      roomRef.current
        ?.querySelector<HTMLElement>('[data-studio-tool="photo"]')
        ?.focus({ preventScroll: true });
      setAnnouncement("Everything deleted.");
    });
  };

  /* The phone bar's "More" panel closes on Escape, or on a tap anywhere else. */
  /**
   * ...and when focus moves on past it (Tab to Finish or the Photo tool), so
   * an open panel never sits over the top of the Stage. Only a focus that
   * lands somewhere else counts: a tap that focuses nothing (Safari does not
   * focus a tapped button) is the pointerdown's to judge, below.
   */
  const closeBarMenuOnLeave = (event: React.FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget as Node | null;
    if (!barMenu || !next) return;
    if (moreRef.current?.contains(next)) return;
    if (document.getElementById("studio-bar-more")?.contains(next)) return;
    setBarMenu(false);
  };
  React.useEffect(() => {
    if (!barMenu) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (moreRef.current?.contains(target)) return;
      if (document.getElementById("studio-bar-more")?.contains(target)) return;
      setBarMenu(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setBarMenu(false);
      if (document.activeElement === document.body || document.activeElement === moreRef.current) {
        moreRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [barMenu]);

  /* ------------------------------------------------------------- keyboard */

  const playOrStopRef = React.useRef(playOrStop);
  playOrStopRef.current = playOrStop;

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (phase !== "edit") return;
      // Behind an open question (aria-modal) the Stage does not move, even
      // when focus has dropped to the page.
      if (pendingOpen || pendingReply || restore) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      // A focused control owns its own keys. Space on "Finish my story" must
      // press the button, not start playback behind the dialog it opens.
      if (target?.closest?.("button, a, input, select, textarea, [role=switch], [role=radio]")) {
        return;
      }

      if (event.key === "ArrowLeft" && activeIndexRef.current > 0) {
        event.preventDefault();
        stopAudio();
        setActive(activeIndexRef.current - 1);
      } else if (
        event.key === "ArrowRight" &&
        activeIndexRef.current < stateRef.current.manifest.pages.length - 1
      ) {
        event.preventDefault();
        stopAudio();
        setActive(activeIndexRef.current + 1);
      } else if (event.key === " ") {
        event.preventDefault();
        playOrStopRef.current();
      } else if (event.key === "Escape") {
        setTool(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingOpen, pendingReply, phase, restore, setActive, stopAudio]);

  /* ----------------------------------------------------------------- derived */

  const currentMeta = page ? state.recordings[String(page.id)] : undefined;
  /**
   * The page's real voice length for the readout: the playing clip's own
   * length while it plays, else what the take measured (a 6.4 s take reads
   * 0:06), else unknown (a dash). Never the last clip of another page.
   */
  const pageDuration =
    (audio.playing && audio.clipDuration > 0 ? audio.clipDuration : 0) ||
    (page?.text?.audioUrl ? (currentMeta?.duration ?? 0) : 0);
  /**
   * The Voice card's codec line: during a take what the recorder negotiated;
   * after it, what this page's voice is (draft or published).
   */
  const voiceCodec = recording
    ? audio.takeMime !== null
      ? codecLine(codecBadge("take", undefined, { mimeType: audio.takeMime, duration: 0 }))
      : null
    : page?.text?.audioUrl
      ? codecLine(codecBadge(page.text.audioUrl, page.text.audioCodec, currentMeta))
      : null;
  /**
   * A phone mid-take with the Voice sheet open: the sheet's Stop is the only
   * Stop, so the transport underneath recedes and takes no focus or tap.
   */
  const transportAside = phone && recording && tool === "voice";

  /*
   * The take sheet never covers the picture being read: the Stage's picture
   * zone takes exactly the room above the sheet's top (studio.css "the take
   * sheet"; the Stage's words under the sheet give way, READ THIS carries
   * them), so the photo shrinks or grows but stays whole, in its ring, with
   * its pill.
   */
  React.useEffect(() => {
    const room = roomRef.current;
    if (!transportAside || !room) return;
    const sheet = room.querySelector<HTMLElement>('[data-studio="tool-card"]');
    const zone = room.querySelector<HTMLElement>('[data-studio="stage-zone"]');
    const monitor = room.querySelector<HTMLElement>('[data-studio="stage"]');
    if (!sheet || !zone || !monitor) return;
    const fit = () => {
      // Down to the sheet's top, never past the Stage's own foot.
      const floor = Math.min(sheet.getBoundingClientRect().top, monitor.getBoundingClientRect().bottom);
      const cap = floor - zone.getBoundingClientRect().top - 12;
      room.style.setProperty("--studio-zone-cap", `${Math.max(120, Math.floor(cap))}px`);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(sheet);
    // the sheet rises 20px as it opens: measure again where it lands
    sheet.addEventListener("animationend", fit);
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      sheet.removeEventListener("animationend", fit);
      window.removeEventListener("resize", fit);
      room.style.removeProperty("--studio-zone-cap");
    };
  }, [transportAside]);

  /*
   * Focus follows the one live Stop. When the transport steps out under the
   * take sheet while it holds focus (REC by keyboard), focus moves to the
   * sheet's Stop instead of dropping to the page; when the sheet is closed
   * mid-take (its Close key unmounts with it), it goes to the transport's
   * Stop, which is back.
   */
  const transportAreaRef = React.useRef<HTMLDivElement | null>(null);
  const wasAsideRef = React.useRef(false);
  React.useLayoutEffect(() => {
    const was = wasAsideRef.current;
    wasAsideRef.current = transportAside;
    const room = roomRef.current;
    const area = transportAreaRef.current;
    if (!room || !area || was === transportAside) return;
    const active = document.activeElement;
    const lost = !active || active === document.body || !room.contains(active);
    if (transportAside) {
      if (lost || area.contains(active)) {
        room.querySelector<HTMLElement>('[data-studio="tool-card"] [data-studio="voice-record"]')?.focus();
      }
    } else if (recordingRef.current && lost) {
      area.querySelector<HTMLElement>('[data-sk="transport"][data-kind="stop"]')?.focus();
    }
  }, [transportAside]);
  /** The active page's mood: its own, else the story's (T24a). The Stage names it. */
  const pageMood = effectiveMood(state, page?.id);
  /** How many pages have their own mood; the Music card says so before it sets every page. */
  const ownMoodPages = Object.keys(prunePageMoods(state.pageMoods ?? {}, pages.map((p) => p.id))).length;
  /** The open note on show: a failure goes with the next change to the story. */
  const note = openNote && (openNote.tone === "busy" || openNote.during === state) ? openNote : null;
  /**
   * What the gate's byline starts as: "story by" is the author; "read by" is
   * the reader last typed, else the voice the shelf chose (T22b), else empty.
   */
  const gateDefault = state.remix
    ? (readerRef.current ?? state.voiceName ?? "")
    : (state.manifest.metadata.author ?? "");
  /** The draft the gate's sheet describes ("What goes into your tape"). */
  const gateSheet = React.useMemo(
    () => ({
      manifest: state.manifest,
      mood: state.mood,
      // Pages with their own mood publish it (T24a), so the Sound band names them.
      pageMoods: state.pageMoods,
      musicOn: state.musicOn,
      remix: state.remix ?? null,
      defaultTitle: DEFAULT_TITLE,
    }),
    [state.manifest, state.mood, state.pageMoods, state.musicOn, state.remix],
  );
  const hasVoice = Boolean(page?.text?.audioUrl);
  /** The publish card is up: the room behind it is inert. */
  const cardOpen = phase === "publishing" || phase === "published";
  const canFinish = storyHasContent(state);
  const codecLabel = React.useMemo(() => {
    const codecs = new Set(
      (publishedRef.current ?? state.manifest).pages
        .map((p) => p.text?.audioCodec)
        .filter((c): c is "aac" | "wav" => Boolean(c)),
    );
    if (codecs.size === 0) return "READ-ALONG";
    if (codecs.size === 1) return codecs.has("aac") ? "AAC/M4A" : "WAV";
    return "AAC + WAV";
  }, [state.manifest]);

  /**
   * The printed tape's facts (T16), read off the manifest that was published.
   * `publishedRef` is set before the phase turns "published", and every later
   * change to it (a link made after sign-in) also lands in `state.manifest`.
   */
  const printed = React.useMemo(
    () => (phase === "published" ? printedTape(publishedRef.current ?? state.manifest) : NOT_PRINTED),
    [phase, state.manifest],
  );

  /* -------------------------------------------------------------- render */

  return (
    <div
      ref={roomRef}
      className="studio"
      data-recording={recording ? "true" : "false"}
      data-take-sheet={transportAside ? "true" : undefined}
      data-advanced={advanced ? "true" : undefined}
      // The publish card is a modal: the room behind it takes no focus, no
      // tap and is not read (the card is rendered outside it, below).
      inert={cardOpen}
    >
      {/* ------------------------------------------------------------ top bar */}
      {/* The top row of the room: the bar, and under it, on a reply, its chip. */}
      <div className="studio-area-top min-w-0">
        <header
          className={`studio-topbar relative flex flex-wrap items-center gap-2 border-b border-white/8 bg-[#060912]/55 px-3 py-2 backdrop-blur-xl max-sm:py-[3px] md:min-h-[68px] md:flex-nowrap ${
            draftNote ? "" : "max-sm:flex-nowrap"
          }`}
          style={{ "--sk-big-h": "48px" } as React.CSSProperties}
        >
          <Link
            href="/"
            aria-label="Leave the studio"
            className="sk-focus flex h-11 flex-none items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white/75 hover:bg-white/10"
          >
            <ArrowLeft aria-hidden="true" className="h-[18px] w-[18px] flex-none" strokeWidth={2} />
            {/* Labelled at every width (s06 phone 2 prints "Exit"). */}
            <span>Exit</span>
          </Link>

          {/* Any tape, the house tape included, opens here to be re-voiced.
              On a phone it waits in "More" (below), so the bar stays one row. */}
          <button
            ref={openButtonRef}
            type="button"
            onClick={pickTape}
            aria-label="Open a tape"
            aria-busy={opening || undefined}
            data-studio="open-tape"
            className="sk-focus flex h-11 items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white/75 hover:bg-white/10 max-sm:hidden"
          >
            <FolderOpen aria-hidden="true" className="h-[18px] w-[18px] flex-none" strokeWidth={1.8} />
            <span className="hidden sm:inline">Open a tape</span>
          </button>

          <label className="sr-only" htmlFor="studio-title">
            Story title
          </label>
          {/* The title, centred on the bar (from 1180px), with a faint pen. From
              768px the bar stays one row and the title is what gives way (its
              ellipsis): the row has ~10px to spare at 768, so a font that renders
              a hair wider must not push SIMPLE and Finish onto a second row. */}
          <div data-studio="title" className="studio-title md:min-w-0">
            <input
              id="studio-title"
              value={state.manifest.metadata.title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={DEFAULT_TITLE}
              // Sizes the input where `field-sizing: content` is not supported.
              size={Math.max(12, (state.manifest.metadata.title || DEFAULT_TITLE).length)}
              className="studio-title-input sk-focus h-11 min-w-0 px-2 font-ss-display text-[17px] font-semibold tracking-[-0.01em] text-white sm:text-lg min-[1180px]:text-[22px] min-[1180px]:font-bold"
            />
            <Pen aria-hidden="true" className="size-4 flex-none text-ss-fg-4" strokeWidth={2} />
          </div>

          <div className="ml-auto flex flex-none items-center gap-2 max-sm:ml-0 max-sm:gap-1.5">
            {/* A phone's bar is one quiet row (s06 phone 2): Simple/Advanced and
                "Open a tape" wait behind one compact key. From 640px the panel
                is not a panel at all: its contents sit on the bar as before. */}
            <button
              ref={moreRef}
              type="button"
              aria-label="More"
              title="More: Simple or Advanced, open a tape"
              aria-expanded={barMenu}
              aria-controls="studio-bar-more"
              data-studio="bar-more"
              onClick={() => setBarMenu((open) => !open)}
              onBlur={closeBarMenuOnLeave}
              className="sk-focus grid size-11 flex-none place-items-center rounded-xl border border-white/12 bg-white/5 text-white/75 hover:bg-white/10 aria-expanded:border-amber-400/50 aria-expanded:bg-white/10 sm:hidden"
            >
              <MoreHorizontal aria-hidden="true" className="size-5" strokeWidth={2} />
            </button>
            <div
              id="studio-bar-more"
              data-studio="bar-more-panel"
              data-open={barMenu ? "true" : "false"}
              className="studio-bar-more"
              onBlur={closeBarMenuOnLeave}
              onKeyDown={(event) => {
                if (event.key !== "Escape" || !barMenu) return;
                event.stopPropagation();
                setBarMenu(false);
                moreRef.current?.focus();
              }}
            >
              <ModeToggle
                advanced={advanced}
                onChange={(next) => {
                  setAdvanced(next);
                  // On a phone the choice is made: the panel closes, focus back on More.
                  if (barMenu) {
                    setBarMenu(false);
                    moreRef.current?.focus();
                  }
                }}
              />
              {/* The phone's own "Open a tape" (the bar's is hidden there). */}
              <button
                type="button"
                onClick={() => {
                  setBarMenu(false);
                  moreRef.current?.focus();
                  pickTape();
                }}
                aria-busy={opening || undefined}
                data-studio="open-tape-more"
                className="sk-focus flex h-11 w-full items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white/80 hover:bg-white/10 sm:hidden"
              >
                <FolderOpen aria-hidden="true" className="h-[18px] w-[18px] flex-none" strokeWidth={1.8} />
                Open a tape
              </button>
            </div>
            {/* While the mic is live the story cannot be finished: it waits
                "after this take". On a phone the key is a compact "Finish" (its
                name is still "Finish my story") and the note is read, not drawn. */}
            <div className="studio-finish" data-recording={recording ? "true" : "false"}>
              <button
                ref={finishRef}
                type="button"
                data-sk="big"
                data-variant="gold"
                aria-label="Finish my story"
                aria-describedby={recording ? "studio-finish-note" : undefined}
                disabled={!canFinish || recording}
                onClick={() => {
                  stopAudio();
                  setTool(null);
                  setBarMenu(false);
                  setGateAuthor(gateDefault);
                  setPhase("gate");
                }}
                className="sk-big sk-focus sk-font-ui sk-big--gold rounded-xl px-4 text-[15px] max-sm:min-h-9 max-sm:gap-1.5 max-sm:px-3 max-sm:py-0 max-sm:text-[14px] max-sm:shadow-none md:min-h-10 md:py-2"
              >
                <span className="sk-big-icon" aria-hidden="true">
                  <Circle className="size-4 text-[#E3452F]" fill="currentColor" strokeWidth={0} />
                </span>
                <span className="sk-big-label">
                  Finish<span className="max-sm:hidden"> my story</span>
                </span>
              </button>
              {recording ? (
                <span id="studio-finish-note" data-studio="finish-note" className="studio-finish-note font-ss-mono">
                  after this take
                </span>
              ) : null}
            </div>
          </div>

          {/* An autosave that is failing is news at every width — a parent on a
              phone is exactly who needs to hear it (G5). */}
          {draftNote ? (
            <p
              role="status"
              data-studio="draft-note"
              className="order-last w-full text-[11px] leading-snug tracking-[0.12em] text-amber-300/80 uppercase"
              style={{ fontFamily: "var(--font-plex-mono), monospace" }}
            >
              {draftNote}
            </p>
          ) : null}
        </header>

        {/* A thank-you says what it answers, right under the bar, at every width
            (s06 phone 2). Draft-only: the title is never in the manifest. */}
        {state.reply ? (
          <div className="studio-reply" data-studio="reply-row">
            <p className="studio-reply-chip" data-studio="reply-to">
              <Heart aria-hidden="true" focusable="false" strokeWidth={2.2} />
              <span className="studio-reply-text">Reply to · {state.reply.title}</span>
            </p>
          </div>
        ) : null}
      </div>

      {/* ------------------------------------------------------------ rail */}
      <div className="studio-area-rail">
        <ToolRail
          active={tool}
          photoBusy={photoBusy}
          narrated={hasVoice}
          musicOn={state.musicOn}
          recording={recording}
          onSelect={(next) => {
            if (next === "photo") {
              setTool(null);
              pickPhoto();
              return;
            }
            setTool((prev) => (prev === next ? null : next));
          }}
        />
      </div>

      {/* ------------------------------------------------------- tool card */}
      {/* A column between the rail and the Stage from 1024px; a card floating
          over the Stage below that; a bottom sheet on a phone. It comes right
          after the rail in the DOM, so Tab goes from the tool that opened it
          into the card and then on to the Stage, the order the eye reads
          (WCAG 2.4.3). Grid areas place it; z-index 47 keeps a floating card
          or a sheet above <main>, which follows it. */}
      <div className="studio-area-tool">
        {tool === "voice" ? (
          <VoicePanel
            recording={recording}
            pageWords={page?.text?.content ?? ""}
            readingAs={state.voiceName}
            hasVoice={hasVoice}
            voiceSeconds={currentMeta?.duration ?? audio.clipDuration}
            recordSeconds={audio.recordSeconds}
            codec={voiceCodec}
            playing={audio.playing}
            micError={audio.micError}
            onToggleRecord={() => void toggleRecord()}
            onListen={() => playOrStop(activeIndex)}
            onDelete={deleteRecording}
            onRetry={() => {
              clearMicError();
              void toggleRecord();
            }}
            onClose={() => setTool(null)}
          />
        ) : null}

        {tool === "music" ? (
          <MusicPanel
            mood={state.mood}
            musicOn={state.musicOn}
            musicVolume={state.musicVolume}
            ownMoodPages={ownMoodPages}
            // The Music card sets every page: the story mood, and no page keeps its own (T24a).
            onMood={(mood: MoodName) => setState((prev) => ({ ...prev, mood, pageMoods: {} }))}
            onToggle={(on) => setState((prev) => ({ ...prev, musicOn: on }))}
            onVolume={(v) => setState((prev) => ({ ...prev, musicVolume: v }))}
            onClose={() => setTool(null)}
          />
        ) : null}

        {tool === "magic" ? (
          <MagicPanel
            busy={magicBusy}
            recording={recording}
            prompt={magicPrompt}
            onPromptChange={setMagicPrompt}
            willReplace={pages.some((p) => p.text?.content?.trim() || p.illustration?.url)}
            onGenerate={(prompt, count, look) => void runMagic(prompt, count, look)}
            onClose={() => setTool(null)}
          />
        ) : null}
      </div>

      {/* ------------------------------------------------------------ stage */}
      <main className="studio-area-stage p-3 sm:p-4">
        {/* Opening a tape: working on it, or why it did not open. It floats
            over the Stage's top edge so the chrome never moves, and its live
            region is always mounted so the first message is announced. */}
        <div
          data-studio="open-note"
          data-tone={note?.tone ?? "none"}
          className={`pointer-events-none absolute inset-x-3 top-3 z-[45] mx-auto max-w-lg transition-opacity duration-300 ease-out motion-reduce:transition-none sm:inset-x-4 sm:top-4 ${
            note ? "opacity-100" : "opacity-0"
          }`}
        >
          <div
            className={`flex items-center gap-3 rounded-xl border px-3 py-2 shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl ${
              note ? "pointer-events-auto" : ""
            } ${
              note?.tone === "error"
                ? "border-[#E3452F]/55 bg-[#2a100c]/92 text-[#FFD9D2]"
                : "border-white/12 bg-[#0b1020]/92 text-white/65"
            }`}
          >
            <p
              role="status"
              className={`m-0 min-w-0 flex-1 ${
                note?.tone === "error" ? "text-[14px] leading-snug" : "text-[11px] tracking-[0.2em] uppercase"
              }`}
              style={note?.tone === "error" ? undefined : { fontFamily: "var(--font-plex-mono), monospace" }}
            >
              {note?.text ?? ""}
            </p>
            {note?.tone === "error" ? (
              <button
                type="button"
                onClick={() => setOpenNote(null)}
                aria-label="Dismiss this message"
                className="sk-focus flex h-9 w-9 flex-none items-center justify-center rounded-lg text-lg text-white/60 hover:bg-white/10"
              >
                <span aria-hidden="true">×</span>
              </button>
            ) : null}
          </div>
        </div>

        <Stage
          page={page}
          pageNumber={activeIndex + 1}
          pageCount={pageCount}
          playing={audio.playing}
          narrating={audio.narrating}
          recording={recording}
          recordSeconds={audio.recordSeconds}
          position={audio.position}
          clipDuration={pageDuration}
          photoBusy={photoBusy}
          mood={pageMood}
          musicOn={state.musicOn}
          storyKey={state.startedAt}
          onTextChange={setText}
          onPickPhoto={pickPhoto}
        />
      </main>

      {/* -------------------------------------------------------- inspector */}
      {advanced ? (
        <Inspector
          manifest={state.manifest}
          page={page}
          pageNumber={activeIndex + 1}
          recordings={state.recordings}
          mood={state.mood}
          pageMood={page ? (state.pageMoods?.[String(page.id)] ?? null) : null}
          musicOn={state.musicOn}
          musicVolume={state.musicVolume}
          narrationVolume={state.narrationVolume}
          levelVoices={state.levelVoices !== false}
          subscribeLevel={audio.subscribeLevel}
          onAutoPause={setAutoPause}
          onApplyPauseToAll={applyPauseToAll}
          onTimingMultiplier={setTimingMultiplier}
          onAlt={setAlt}
          onAuthor={setAuthor}
          onMood={(mood) => setState((prev) => ({ ...prev, mood }))}
          onPageMood={setPageMood}
          onFeelingForPage={applyFeelingToPage}
          onFeelingForEveryPage={applyFeelingToEveryPage}
          onMusicToggle={(on) => setState((prev) => ({ ...prev, musicOn: on }))}
          onMusicVolume={(v) => setState((prev) => ({ ...prev, musicVolume: v }))}
          onNarrationVolume={(v) => setState((prev) => ({ ...prev, narrationVolume: v }))}
          onLevelVoices={(on) => setState((prev) => ({ ...prev, levelVoices: on }))}
          onClose={() => setAdvanced(false)}
        />
      ) : null}

      {/* -------------------------------------------------------- filmstrip */}
      <div className="studio-area-film">
        <Filmstrip
          pages={pages}
          activeIndex={activeIndex}
          moods={laneMoods}
          locked={recording}
          onSelect={(index) => {
            // With the Music card open the bed keeps playing (it follows the
            // card) and moves into the new page's mood.
            stopAudio({ keepBed: tool === "music" });
            setActive(index);
          }}
          onMove={movePage}
          onDelete={deletePage}
          onSnapNext={snapNextDrawing}
        />
      </div>

      {/* -------------------------------------------------------- transport */}
      <div
        ref={transportAreaRef}
        className="studio-area-transport"
        data-aside={transportAside ? "true" : undefined}
        inert={transportAside}
      >
        <Transport
          playing={audio.playing}
          recording={recording}
          voiceArmed={tool === "voice"}
          pageNumber={activeIndex + 1}
          pageCount={pageCount}
          position={audio.position}
          clipDuration={pageDuration}
          recordSeconds={audio.recordSeconds}
          onPrev={() => {
            stopAudio({ keepBed: tool === "music" });
            setActive(activeIndex - 1);
          }}
          onNext={() => {
            stopAudio({ keepBed: tool === "music" });
            setActive(activeIndex + 1);
          }}
          onPlayPause={() => playOrStop(activeIndex)}
          onRecord={() => {
            setTool("voice");
            void toggleRecord();
          }}
        />
      </div>

      {/* --------------------------------------------------------- overlays */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void onFile(e)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={tapeInputRef}
        type="file"
        accept=".storysync,.zip"
        data-studio="open-tape-input"
        onChange={onTapeFile}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      <audio ref={audio.audioRef} preload="auto" className="hidden" />
      <p aria-live="polite" data-studio="announcement" className="sr-only">
        {announcement}
      </p>

      {restore ? (
        <div className="studio-fade fixed inset-0 z-[80] flex items-center justify-center bg-black/72 p-4 backdrop-blur-sm">
          <GlassPanel
            role="dialog"
            aria-modal="true"
            aria-labelledby="studio-restore-title"
            className="studio-rise w-full max-w-sm border-white/14 bg-[#0b1020]/95 p-5"
          >
            <div className="flex items-center gap-3">
              <Reel size={40} />
              <h2 id="studio-restore-title" className="text-lg font-semibold text-white">
                Pick up where you left off?
              </h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              There is a story saved in this browser
              {restore.savedAt ? ` from ${new Date(restore.savedAt).toLocaleString()}` : ""}:{" "}
              <span className="text-white/85">{restore.state.manifest.metadata.title}</span>,{" "}
              {restore.state.manifest.pages.length}{" "}
              {restore.state.manifest.pages.length === 1 ? "page" : "pages"}.
            </p>
            <div className="mt-4 grid gap-2">
              <BigButton
                icon="↻"
                label="Keep working on it"
                variant="gold"
                className="w-full justify-center"
                onClick={() => keepSavedDraft(restore)}
              />
              <BigButton
                icon="✎"
                label="Start a new story"
                variant="ghost"
                className="w-full justify-center"
                onClick={() => {
                  clearDraft();
                  setRestore(null);
                  setBoot("ready");
                }}
              />
            </div>
          </GlassPanel>
        </div>
      ) : null}

      {pendingOpen ? (
        <OpenTapeDialog
          title={pendingOpen.tape.manifest.metadata.title}
          returnFocusTo={tapeOpenerRef}
          onKeep={() => {
            const { saved } = pendingOpen;
            setPendingOpen(null);
            if (saved) keepSavedDraft(saved);
          }}
          onOpen={() => applyOpenedTape(pendingOpen.tape, pendingOpen.mood, pendingOpen.voice)}
        />
      ) : null}

      {pendingReply ? (
        <OpenTapeDialog
          title={pendingReply.seed.chipTitle}
          heading={`Reply to ${pendingReply.seed.chipTitle}?`}
          confirmLabel="Start the reply"
          returnFocusTo={tapeOpenerRef}
          onKeep={() => {
            setPendingReply(null);
            keepSavedDraft(pendingReply.saved);
          }}
          onOpen={() => applyReply(pendingReply.seed)}
        />
      ) : null}

      {phase === "gate" ? (
        <ParentGate
          defaultAuthor={gateDefault}
          // A thank-you can be a grown-up's own voice or a child's: no answer
          // is chosen for the grown-up, with or without a link to reply to.
          initialGrantor={state.reply ? null : undefined}
          bylineLabel={state.remix ? "read by" : "story by"}
          voices={recordedVoices(state.manifest.pages, gateAuthor)}
          sheet={gateSheet}
          onAuthorChange={setGateAuthor}
          onCancel={() => setPhase("edit")}
          onPass={(author, consents, stampedAt) => {
            // A re-voiced tape keeps its author: the byline is the reader.
            if (state.remix) readerRef.current = author;
            else setAuthor(author);
            void runPublish(author, consents, stampedAt);
          }}
        />
      ) : null}

      {/* The publish card lives outside the room (portalled to <body>), so
          the room can be inert behind it while the card stays live. */}
      {cardOpen && portalReady
        ? createPortal(
            <div className="studio-modal-host">
              <PublishCard
                {...printed}
                phase={phase === "publishing" ? "publishing" : "published"}
                steps={steps}
                title={(publishedRef.current ?? state.manifest).metadata.title}
                author={(publishedRef.current ?? state.manifest).metadata.author ?? ""}
                pageCount={(publishedRef.current ?? state.manifest).pages.length}
                durationLabel={formatClock(estimateStorySeconds(state))}
                madeInLabel={madeInLabel}
                codecLabel={codecLabel}
                shareUrl={shareUrl}
                // Whether the link is the cloud library's; a device-only link gets no QR or share sheet.
                cloud={testCloudOverride() ?? (state.published ? state.published.cloud : isCloudEnabled())}
                reply={state.reply ? { name: state.reply.name } : null}
                returnFocusTo={finishRef}
                note={publishNote}
                linkError={linkError}
                error={publishError}
                authOffer={authOffer}
                authBusy={authBusy}
                authError={authError}
                authReady={authReady}
                onAuth={(mode, email, password, name) => void handleAuth(mode, email, password, name)}
                onMakeLink={() => void makeLink()}
                onDownload={downloadTape}
                onDeleteEverything={() => void deleteEverything()}
                onBack={() => setPhase("edit")}
                onRetry={() => void runPublish(authorRef.current, consentRef.current, stampedAtRef.current ?? undefined)}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
