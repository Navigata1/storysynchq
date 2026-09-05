"use client";

/**
 * ReadRoom — the /read entry surface (docs/design-direction.md §4).
 *
 * Four ways a story reaches a listener, in resolution order:
 *   ?story=<shareCode>  → the cloud copy, then this device's own library
 *   ?demo=1             → straight onto the demo tape's cover gate (the
 *                         landing's "Press play" lands here)
 *   a .storysync file   → unpacked on this device, never uploaded
 *   the demo tape       → /demo/brave-little-star.ssync.json
 *
 * Everything here is Register B on a dark stage: the room is a shelf, and the
 * things on it are cassettes. Once one is chosen, the Player takes the screen.
 *
 * useSearchParams() means this component must render under a <Suspense>
 * boundary — src/app/read/page.tsx provides it.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSharedBook } from "@/lib/cloud-storage";
import { loadStorysyncToStory } from "@/lib/storysync/container";
import type { SsyncManifest, SsyncPage } from "@/lib/storysync/manifest";
import { BigButton, GlassPanel, Reel, TapeLabel, TAPE } from "@/components/studio-kit/kit";
import { Player } from "./Player";
import "./player.css";

const DEMO_URL = "/demo/brave-little-star.ssync.json";
/** The localStorage library `@/lib/cloud-storage` writes when there is no cloud. */
const DEVICE_LIBRARY_KEY = "ssync-library";
/** A blank tape — the one you record yourself. */
const BLANK_LABEL = "#FFFDF6";
/** Kraft/manila — the tape someone handed you on a file. */
const KRAFT_LABEL = "#DFD2B8";

type Origin = "share" | "demo" | "file";

type RoomState =
  | { kind: "chooser" }
  | { kind: "loading"; what: string }
  | { kind: "missing"; code: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; manifest: SsyncManifest; origin: Origin };

/**
 * Permissive read of anything claiming to be a story: SSYNC v1 documents, v2
 * manifests, and cloud rows written by older builds all have to play. Unknown
 * fields ride along untouched; only the pieces the Player depends on are
 * repaired.
 */
function normalizeManifest(raw: unknown): SsyncManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;

  const rawPages = Array.isArray(src.pages) ? src.pages : [];
  const pages: SsyncPage[] = rawPages
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p, i) => ({
      ...(p as unknown as SsyncPage),
      id: typeof p.id === "number" ? p.id : i + 1,
    }));
  if (pages.length === 0) return null;

  const rawMeta =
    src.metadata && typeof src.metadata === "object"
      ? (src.metadata as Record<string, unknown>)
      : {};
  const title =
    typeof rawMeta.title === "string" && rawMeta.title.trim() ? rawMeta.title : "Untitled Story";

  return {
    ...src,
    version: typeof src.version === "string" ? src.version : "1.0",
    metadata: { ...rawMeta, title },
    pages,
  } as unknown as SsyncManifest;
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="m-0 text-[10px] tracking-[0.32em] text-white/40 uppercase"
      style={{ fontFamily: "var(--font-plex-mono), monospace" }}
    >
      {children}
    </p>
  );
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
  order: 1 | 2 | 3;
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

/**
 * A story saved on this device (the localStorage library used whenever Supabase
 * is not configured) opened by its own link, on the same device. Nothing is
 * fetched and nothing is uploaded — this is the offline half of `?story=`.
 */
function deviceCopy(code: string): SsyncManifest | null {
  try {
    const raw = window.localStorage.getItem(DEVICE_LIBRARY_KEY);
    if (!raw) return null;
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows)) return null;
    const hit = rows.find((row) => {
      if (!row || typeof row !== "object") return false;
      const r = row as { id?: unknown; shareCode?: unknown };
      return r.id === code || r.shareCode === code;
    }) as { ssyncData?: unknown } | undefined;
    return hit ? normalizeManifest(hit.ssyncData) : null;
  } catch {
    return null;
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
    const land = (manifest: SsyncManifest | null) => {
      if (cancelled) return;
      const found = manifest ?? deviceCopy(code);
      if (!found) setState({ kind: "missing", code });
      else setState({ kind: "ready", manifest: found, origin: "share" });
    };
    getSharedBook(code)
      .then((book) => land(book ? normalizeManifest(book.ssyncData) : null))
      .catch(() => land(null));
    return () => {
      cancelled = true;
    };
  }, [code]);

  /* ── the demo tape ────────────────────────────────────────────────────── */
  const openDemo = React.useCallback(async () => {
    setState({ kind: "loading", what: "Threading the demo tape" });
    try {
      const response = await fetch(DEMO_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const manifest = normalizeManifest(await response.json());
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

  if (state.kind === "ready") {
    return (
      <Player
        key={state.origin + (code ?? "")}
        manifest={state.manifest}
        onExit={exitPlayer}
        onMakeYourOwn={makeYourOwn}
        shareUrl={state.origin === "share" ? shareUrl : undefined}
      />
    );
  }

  return (
    <div className="pl-room">
      <div className="pl-room-light" aria-hidden="true" />
      <div className="pl-room-inner">
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
        {state.kind === "chooser" || state.kind === "error" ? (
          <>
            <div className="flex flex-col gap-3">
              <h1
                className="m-0 text-[clamp(2rem,7vw,3.25rem)] leading-[1.05] font-black tracking-[-0.02em] text-white"
                style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
              >
                Pick a tape.
              </h1>
              <p className="m-0 max-w-[46ch] text-[16px] leading-relaxed text-white/55">
                Press begin and the story reads itself — a voice, a melody underneath, and
                pages that turn when they are ready.
              </p>
            </div>

            {state.kind === "error" ? (
              <div
                role="alert"
                className="rounded-xl border px-4 py-3 text-[14px]"
                style={{
                  borderColor: "rgba(227,69,47,0.45)",
                  backgroundColor: "rgba(227,69,47,0.12)",
                  color: "#FFD9D2",
                }}
              >
                {state.message}
              </div>
            ) : null}

            <div className="flex flex-col gap-4">
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

              <Choice order={3} onClick={makeYourOwn} ariaLabel="Make your own story in the studio">
                <TapeLabel
                  title="Make your own"
                  meta={<>☆ BLANK TAPE · YOUR VOICE · YOUR PICTURES</>}
                  accent={BLANK_LABEL}
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

            <p
              className="m-0 text-[10px] leading-[1.7] tracking-[0.2em] text-white/30 uppercase"
              style={{ fontFamily: "var(--font-plex-mono), monospace" }}
            >
              A tape you open here is read on this device only. No accounts, no trackers,
              nothing sent anywhere.
            </p>

            <div
              aria-hidden="true"
              className="h-[6px] w-full rounded-full"
              style={{ backgroundColor: TAPE.red, opacity: 0.5 }}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

export default ReadRoom;
