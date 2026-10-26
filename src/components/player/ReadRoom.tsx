"use client";

/**
 * ReadRoom — the /read entry surface (docs/design-direction.md §4).
 *
 * Five ways a story reaches a listener, in resolution order:
 *   ?story=<shareCode>  → the cloud copy, then this device's own library
 *   ?demo=1             → straight onto the demo tape's cover gate (the
 *                         landing's "Press play" lands here)
 *   your tapes          → the shelf (T20a): this device's library and, when a
 *                         grown-up is signed in, their cloud library
 *   a .storysync file   → unpacked on this device, never uploaded
 *   the demo tape       → /demo/brave-little-star.ssync.json
 *
 * Everything here is Register B on a dark stage: the room is a shelf, and the
 * things on it are cassettes (s07). "YOUR TAPES" stands every tape this family
 * keeps on one ledge (kit Shelf/ShelfTape), the blank "Make your own" tape
 * last; selecting a tape lifts it and shows its band ("Play this tape", "Pull
 * the tape out"). Pulling a tape out is the shipped delete (`deleteBook`: the
 * device copy, the cloud row and its link) plus the Studio draft when the
 * draft is that tape. "THE HOUSE TAPE" keeps the demo and the file door. Once
 * a tape is chosen, the Player takes the screen.
 *
 * The shelf is read after mount (the first paint is the chooser without
 * tapes) and again whenever the room comes back to the chooser. Nothing is
 * fetched for it except, when signed in, the grown-up's own cloud library.
 *
 * At ≥ 1024 px the chooser is a two-column room: `.rr-columns` turns into
 * shelves (≈ 60 %) + a right column as soon as it holds an `.rr-aside` (the
 * "Read it in…" panel, T22a). Until then the shelves span the room.
 *
 * A tape someone sent (a link or a file, never the house tape and never one
 * of your own shelf tapes) ends with "Send a thank-you back" (T18): the reply
 * seed (src/lib/storysync/reply.ts) is handed to the Creator as a one-shot
 * sessionStorage entry, and the room moves to /studio?reply=1.
 *
 * useSearchParams() means this component must render under a <Suspense>
 * boundary — src/app/read/page.tsx provides it.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Play } from "lucide-react";
import { loadStorysyncToStory } from "@/lib/storysync/container";
import type { SsyncManifest } from "@/lib/storysync/manifest";
import { HOUSE_TAPE_URL, loadTapeByCode, normalizeTapeManifest } from "@/lib/storysync/tape-source";
import { REPLY_QUERY, REPLY_SEED_KEY, replySeed, serializeReplySeed } from "@/lib/storysync/reply";
import { deleteBook, getBooks, isCloudEnabled } from "@/lib/cloud-storage";
import { getUser } from "@/lib/supabase";
import { clearDraft, DRAFT_KEY } from "@/components/studio/draft";
import { BigButton, GlassPanel, Reel, TapeLabel, TAPE } from "@/components/studio-kit/kit";
import { Shelf, ShelfTape } from "@/components/studio-kit/Shelf";
import { PullTapeIcon } from "@/components/studio-kit/PrintSlot";
import { Player } from "./Player";
import {
  bandLine,
  draftBelongsTo,
  mergeShelf,
  nextAfter,
  parseLibrary,
  SHELF_LIBRARY_KEY,
  type ShelfEntry,
} from "./shelf";
import "./player.css";
import "./read-room.css";

/** Kraft/manila — the tape someone handed you on a file. */
const KRAFT_LABEL = "#DFD2B8";

/** The pull-out: tilt and rise, a held beat, then the tape fades off the shelf. */
const PULL_MS = 420;
const PULL_HOLD_MS = 260;
const PULL_LEAVE_MS = 220;

type Origin = "share" | "demo" | "file" | "shelf";

type RoomState =
  | { kind: "chooser" }
  | { kind: "loading"; what: string }
  | { kind: "missing"; code: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; manifest: SsyncManifest; origin: Origin; shelfId?: string; tapeUrl?: string };

type ShelfStatus = { kind: "none" } | { kind: "pulled"; n: number } | { kind: "kept"; message: string };

function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="rr-kicker m-0">{children}</p>;
}

function Choice({
  onClick,
  disabled,
  order,
  children,
  ariaLabel,
}: {
  onClick: () => void;
  disabled?: boolean;
  order: 1 | 2;
  children: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`pl-choice pl-choice-${order}`}
    >
      {children}
    </button>
  );
}

/** This device's library and, with a signed-in grown-up, their cloud library. */
async function readShelf(): Promise<ShelfEntry[]> {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SHELF_LIBRARY_KEY);
  } catch {
    raw = null;
  }
  let cloud: unknown[] = [];
  if (isCloudEnabled()) {
    try {
      const user = await getUser();
      if (user) cloud = await getBooks(user.id);
    } catch {
      cloud = [];
    }
  }
  return mergeShelf(parseLibrary(raw), cloud);
}

/** Wipe the Studio's saved draft when it is this tape; any other draft stays. */
function forgetDraftOf(id: string): void {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (raw && draftBelongsTo(JSON.parse(raw), id)) clearDraft();
  } catch {
    /* an unreadable draft is not this tape's */
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function ReadRoom() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get("story");
  const demoParam = params.get("demo");
  const wantsDemo = demoParam === "1" || demoParam === "true";

  const [state, setState] = React.useState<RoomState>({ kind: "chooser" });
  const [shareUrl, setShareUrl] = React.useState<string | undefined>(undefined);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  /* ── the shelf ─────────────────────────────────────────────────────────── */
  const [shelf, setShelf] = React.useState<ShelfEntry[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  /** "Pull the tape out" pressed once, for this tape: the next press deletes. */
  const [armedId, setArmedId] = React.useState<string | null>(null);
  const [pulling, setPulling] = React.useState<{ id: string; leaving: boolean } | null>(null);
  const [status, setStatus] = React.useState<ShelfStatus>({ kind: "none" });
  const faceRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const timers = React.useRef<number[]>([]);
  /** The shelf as last rendered, for the pull-out's "who is next". */
  const shelfRef = React.useRef<ShelfEntry[]>([]);
  React.useEffect(() => {
    shelfRef.current = shelf;
  }, [shelf]);

  const inChooser = state.kind === "chooser" || state.kind === "error";
  const selected = shelf.find((entry) => entry.id === selectedId) ?? null;
  const armed = selected !== null && armedId === selected.id;

  /* ── the link this tape lives at (SSR-safe: read after mount) ─────────── */
  React.useEffect(() => {
    if (!code) {
      setShareUrl(undefined);
      return;
    }
    try {
      setShareUrl(window.location.href);
    } catch {
      setShareUrl(undefined);
    }
  }, [code]);

  /* ── ?story=<shareCode> ───────────────────────────────────────────────── */
  React.useEffect(() => {
    if (!code) return;
    let cancelled = false;
    setState({ kind: "loading", what: "Finding that tape" });
    // One resolver for "what tape does this code mean" (the Creator's
    // ?open=<code> asks the same one): the cloud first, then this device.
    void loadTapeByCode(code).then((found) => {
      if (cancelled) return;
      if (!found) setState({ kind: "missing", code });
      else setState({ kind: "ready", manifest: found, origin: "share" });
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  /* ── your tapes: read after mount, and again each time the room returns ── */
  React.useEffect(() => {
    if (!inChooser || code || wantsDemo) return;
    let cancelled = false;
    void readShelf().then((entries) => {
      if (cancelled) return;
      // a pull-out's line belongs to the visit it happened in
      setStatus({ kind: "none" });
      setShelf(entries);
      setSelectedId((current) =>
        current && entries.some((entry) => entry.id === current) ? current : (entries[0]?.id ?? null),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [inChooser, code, wantsDemo]);

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
    };
  }, []);

  /* Escape disarms the pull-out. */
  React.useEffect(() => {
    if (!armed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setArmedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armed]);

  const select = React.useCallback((id: string) => {
    setSelectedId(id);
    setArmedId(null);
  }, []);

  /** ← → (and ↑ ↓, Home, End) move the selection; the focus follows it. */
  const onTapeKey = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, id: string) => {
      const ids = shelf.map((entry) => entry.id).filter((x) => x !== pulling?.id);
      const at = ids.indexOf(id);
      if (at < 0 || ids.length === 0) return;
      let next: string | undefined;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = ids[(at + 1) % ids.length];
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = ids[(at - 1 + ids.length) % ids.length];
      else if (event.key === "Home") next = ids[0];
      else if (event.key === "End") next = ids[ids.length - 1];
      if (!next) return;
      event.preventDefault();
      select(next);
      faceRefs.current.get(next)?.focus();
    },
    [shelf, pulling, select],
  );

  /* ── pull the tape out: every copy, the link, and its draft ───────────── */
  const pullOut = React.useCallback(
    async (entry: ShelfEntry) => {
      const reduce = prefersReducedMotion();
      setArmedId(null);
      if (!reduce) setPulling({ id: entry.id, leaving: false });
      try {
        await deleteBook(entry.id);
      } catch (error) {
        setPulling(null);
        setStatus({
          kind: "kept",
          message:
            error instanceof Error && error.message
              ? `That tape is still on the shelf. ${error.message}`
              : "That tape is still on the shelf. Try again.",
        });
        void readShelf().then(setShelf);
        return;
      }
      forgetDraftOf(entry.id);
      setStatus((current) => ({ kind: "pulled", n: current.kind === "pulled" ? current.n + 1 : 1 }));

      const leave = () => {
        const ids = shelfRef.current.map((x) => x.id);
        setSelectedId((sel) => (sel === entry.id ? nextAfter(ids, entry.id) : sel));
        setShelf((current) => current.filter((x) => x.id !== entry.id));
        setPulling((current) => (current?.id === entry.id ? null : current));
      };
      if (reduce) {
        leave();
        return;
      }
      timers.current.push(
        window.setTimeout(() => setPulling({ id: entry.id, leaving: true }), PULL_MS + PULL_HOLD_MS),
        window.setTimeout(leave, PULL_MS + PULL_HOLD_MS + PULL_LEAVE_MS),
      );
    },
    [],
  );

  const onPull = React.useCallback(() => {
    if (!selected || pulling?.id === selected.id) return;
    if (armed) void pullOut(selected);
    else setArmedId(selected.id);
  }, [selected, pulling, armed, pullOut]);

  const playSelected = React.useCallback(() => {
    if (!selected || pulling?.id === selected.id) return;
    const manifest = normalizeTapeManifest(selected.manifest) ?? selected.manifest;
    setArmedId(null);
    setState({
      kind: "ready",
      manifest,
      origin: "shelf",
      shelfId: selected.id,
      tapeUrl: selected.label.shareUrl,
    });
  }, [selected, pulling]);

  /* ── the demo tape ────────────────────────────────────────────────────── */
  const openDemo = React.useCallback(async () => {
    setState({ kind: "loading", what: "Threading the demo tape" });
    try {
      const response = await fetch(HOUSE_TAPE_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const manifest = normalizeTapeManifest(await response.json());
      if (!manifest) throw new Error("no pages");
      setState({ kind: "ready", manifest, origin: "demo" });
    } catch {
      setState({
        kind: "error",
        message: "The demo tape would not load. Check the connection and try again.",
      });
    }
  }, []);

  /* ── a .storysync container from this device ──────────────────────────── */
  const openFile = React.useCallback(async (file: File) => {
    setState({ kind: "loading", what: "Unwinding the tape" });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setState({ kind: "ready", manifest: loadStorysyncToStory(bytes), origin: "file" });
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "That file could not be opened as a .storysync tape.",
      });
    }
  }, []);

  /* ── ?demo=1 — the landing's "Press play" lands on the cover gate ─────── */
  const openedDemoFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (code || !wantsDemo) return;
    if (openedDemoFor.current === demoParam) return;
    openedDemoFor.current = demoParam;
    void openDemo();
  }, [code, wantsDemo, demoParam, openDemo]);

  const exitPlayer = React.useCallback(() => {
    if (code) {
      router.push("/");
      return;
    }
    // Leaving the demo has to clear ?demo=1, or the room re-threads the tape.
    if (wantsDemo) router.replace("/read");
    setState({ kind: "chooser" });
  }, [code, wantsDemo, router]);

  const makeYourOwn = React.useCallback(() => router.push("/studio"), [router]);

  /* ── "Send a thank-you back" — a tape someone sent: a link or a file ──── */
  const answered =
    state.kind === "ready" && (state.origin === "share" || state.origin === "file") ? state : null;
  const replyName = React.useMemo(
    () => (answered ? replySeed(answered.manifest).name : undefined),
    [answered],
  );
  const sendReply = React.useCallback(() => {
    if (!answered) return;
    // The link this tape was opened from, in the form a publish writes it.
    const link =
      answered.origin === "share" && code
        ? `${window.location.origin}/read?story=${encodeURIComponent(code)}`
        : undefined;
    try {
      window.sessionStorage.setItem(REPLY_SEED_KEY, serializeReplySeed(replySeed(answered.manifest, link)));
    } catch {
      /* no session storage: the Creator opens as it always does */
    }
    router.push(`/studio?${REPLY_QUERY}=1`);
  }, [answered, code, router]);

  if (state.kind === "ready") {
    return (
      <Player
        key={`${state.origin}:${code ?? state.shelfId ?? ""}`}
        manifest={state.manifest}
        onExit={exitPlayer}
        onMakeYourOwn={makeYourOwn}
        onReply={answered ? sendReply : undefined}
        replyName={replyName}
        shareUrl={state.origin === "share" ? shareUrl : state.origin === "shelf" ? state.tapeUrl : undefined}
      />
    );
  }

  return (
    <div className="pl-room">
      <div className="pl-room-light" aria-hidden="true" />
      <div className={inChooser ? "pl-room-inner rr-inner" : "pl-room-inner"}>
        <div className="flex items-center justify-between gap-4">
          <Kicker>StorySync Reader</Kicker>
          <Link href="/" className="pl-chip sk-focus">
            ← Home
          </Link>
        </div>

        {/* ────────────────────────────────────────────────────── loading */}
        {state.kind === "loading" ? (
          <GlassPanel className="flex flex-col items-center gap-5 px-6 py-14 text-center">
            <span className="pl-loading-reels" aria-hidden="true">
              <Reel spinning size={34} />
              <Reel spinning size={34} />
            </span>
            <p
              className="m-0 text-[11px] tracking-[0.26em] text-white/55 uppercase"
              style={{ fontFamily: "var(--font-plex-mono), monospace" }}
              role="status"
            >
              {state.what}…
            </p>
          </GlassPanel>
        ) : null}

        {/* ────────────────────────────────────────── share code not found */}
        {state.kind === "missing" ? (
          <div className="flex flex-col gap-5">
            <TapeLabel
              title="We couldn't find that tape"
              meta={<>NO STORY AT CODE · {state.code.slice(0, 12).toUpperCase()}</>}
              accent={KRAFT_LABEL}
            />
            <GlassPanel className="px-5 py-5">
              <p className="m-0 text-[15px] leading-relaxed text-white/70">
                The link may be incomplete, or the person who made this story may have
                deleted it — one tap wipes a story everywhere, on purpose. Ask them for a
                fresh link, or start with one of these.
              </p>
            </GlassPanel>
            <div className="flex flex-col gap-3 sm:flex-row">
              <BigButton
                icon="▶"
                label="Play the demo tape"
                variant="gold"
                onClick={openDemo}
                className="flex-1 justify-center"
              />
              <BigButton
                icon="☆"
                label="Make your own story"
                variant="ghost"
                onClick={makeYourOwn}
                className="flex-1 justify-center"
              />
            </div>
          </div>
        ) : null}

        {/* ─────────────────────────────────────────────────────── chooser */}
        {inChooser ? (
          <>
            <h1 className="rr-title m-0">Pick a tape.</h1>

            {state.kind === "error" ? (
              <div
                role="alert"
                className="mt-5 rounded-xl border px-4 py-3 text-[14px]"
                style={{
                  borderColor: "rgba(227,69,47,0.45)",
                  backgroundColor: "rgba(227,69,47,0.12)",
                  color: "#FFD9D2",
                }}
              >
                {state.message}
              </div>
            ) : null}

            <div className="rr-columns">
              <div className="rr-main">
                {/* ────────────────────────────────────────── YOUR TAPES */}
                <section data-shelf="yours" aria-labelledby="rr-yours-label" className="rr-section">
                  <h2 id="rr-yours-label" className="rr-label">
                    Your tapes
                  </h2>
                  <p className="rr-note">
                    <Lock aria-hidden="true" focusable="false" strokeWidth={2} />
                    Unlisted. Only people you send a link to can open them.
                  </p>

                  <Shelf label="Your tapes shelf" className="rr-shelf">
                    {shelf.length > 0 ? (
                      <div role="radiogroup" aria-label="Your tapes" className="rr-shelf-group">
                        {shelf.map((entry) => {
                          const isSelected = entry.id === selectedId;
                          const metaId = `rr-meta-${entry.id}`;
                          return (
                            <ShelfTape
                              key={entry.id}
                              ref={(el) => {
                                if (el) faceRefs.current.set(entry.id, el);
                                else faceRefs.current.delete(entry.id);
                              }}
                              tapeId={entry.id}
                              role="radio"
                              aria-checked={isSelected}
                              aria-label={entry.label.title}
                              aria-describedby={metaId}
                              tabIndex={isSelected ? 0 : -1}
                              title={entry.label.title}
                              metaId={metaId}
                              meta={
                                <>
                                  {entry.label.author ? (
                                    <>
                                      <span className="sk-shelf-meta-line">{entry.label.author}</span>
                                      <span className="sk-shelf-meta-sep"> · </span>
                                    </>
                                  ) : null}
                                  <span className="sk-shelf-meta-line">{entry.label.runtime}</span>
                                </>
                              }
                              inset={entry.label.inset}
                              selected={isSelected}
                              pulling={pulling?.id === entry.id}
                              leaving={pulling?.id === entry.id && pulling.leaving}
                              onClick={() => select(entry.id)}
                              onKeyDown={(event) => onTapeKey(event, entry.id)}
                            />
                          );
                        })}
                      </div>
                    ) : null}
                    <ShelfTape
                      variant="blank"
                      title="Make your own"
                      onClick={makeYourOwn}
                      aria-label="Make your own story in the studio"
                      className="pl-choice pl-choice-3"
                    />
                  </Shelf>

                  <p role="status" data-shelf="status" className="rr-status">
                    {status.kind === "pulled" ? (
                      <span key={status.n} className="rr-status-line">
                        <PullTapeIcon className="rr-status-icon" />
                        <span>
                          <b>Pulled out.</b> Pictures, voices, the saved copy and the link are gone.
                        </span>
                      </span>
                    ) : status.kind === "kept" ? (
                      <span className="rr-status-line">{status.message}</span>
                    ) : null}
                  </p>

                  {selected ? (
                    <div data-shelf="band" className="rr-band">
                      <p className="rr-band-line">{bandLine(selected.label)}</p>
                      <div className="rr-band-actions">
                        <BigButton
                          variant="gold"
                          icon={<Play className="size-[16px]" strokeWidth={2.4} fill="currentColor" />}
                          label="Play this tape"
                          onClick={playSelected}
                          className="rr-band-btn"
                        />
                        <BigButton
                          variant={armed ? "red" : "ghost"}
                          icon={<PullTapeIcon className="h-[21px] w-[24px]" />}
                          label={armed ? "Tap again to delete everything" : "Pull the tape out"}
                          onClick={onPull}
                          className={armed ? "rr-band-btn" : "rr-band-btn rr-pull"}
                        />
                      </div>
                    </div>
                  ) : null}
                </section>

                {/* ────────────────────────────────────── THE HOUSE TAPE */}
                <section data-shelf="house" aria-labelledby="rr-house-label" className="rr-section">
                  <h2 id="rr-house-label" className="rr-label">
                    The house tape
                  </h2>
                  <div className="rr-house-doors">
                    <Choice order={1} onClick={openDemo} ariaLabel="Play the demo tape, The Brave Little Star">
                      <TapeLabel
                        title="The Brave Little Star"
                        author="Island Development Crew"
                        meta={<>▶ DEMO TAPE · SIDE A · READ ALONG</>}
                      />
                    </Choice>

                    <Choice
                      order={2}
                      onClick={() => fileInputRef.current?.click()}
                      ariaLabel="Open a .storysync file from this device"
                    >
                      <TapeLabel
                        title="Open a tape from this device"
                        meta={<>⏏ .STORYSYNC FILE · NOTHING IS UPLOADED</>}
                        accent={KRAFT_LABEL}
                      />
                    </Choice>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".storysync,.zip"
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void openFile(file);
                    }}
                  />

                  <p className="rr-foot m-0">
                    A tape you open here is read on this device only. No accounts, no trackers,
                    nothing sent anywhere.
                  </p>
                </section>
              </div>
            </div>

            <div
              aria-hidden="true"
              className="mt-8 h-[6px] w-full rounded-full"
              style={{ backgroundColor: TAPE.red, opacity: 0.5 }}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

export default ReadRoom;
