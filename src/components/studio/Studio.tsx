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
import Link from "next/link";
import { BigButton, GlassPanel, ModeToggle, Reel } from "@/components/studio-kit/kit";
import { blobToDataUrl, dataUrlToBlob } from "@/lib/audio/recorder";
import { normalizeNarration } from "@/lib/audio/transcode";
import { processImageSafe } from "@/lib/images";
import { validateManifest, type SsyncManifest, type SsyncPage } from "@/lib/storysync/manifest";
import { buildStorysyncFromStory } from "@/lib/storysync/container";
import { generateStory } from "@/lib/story-engine";
import { generateIllustration } from "@/app/page-improvements";
import { deleteBook, isCloudEnabled, saveBook, shareBook } from "@/lib/cloud-storage";
import { getUser } from "@/lib/supabase";

import Stage from "./Stage";
import ToolRail, { type StudioTool } from "./ToolRail";
import Filmstrip from "./Filmstrip";
import Transport from "./Transport";
import Inspector from "./Inspector";
import ParentGate from "./ParentGate";
import PublishCard, { type PublishStep } from "./PublishCard";
import { MagicPanel, MusicPanel, VoicePanel, type MagicLook } from "./ToolPanels";
import { useStudioAudio } from "./useStudioAudio";
import { clearDraft, loadDraft, saveDraft } from "./draft";
import {
  DEFAULT_AUTO_PAUSE_S,
  DEFAULT_TITLE,
  blankPage,
  blankState,
  estimateStorySeconds,
  formatClock,
  nextPageId,
  storyHasContent,
  updatePage,
  type MoodName,
  type RecordingMeta,
  type StudioState,
} from "./types";
import "./studio.css";

type Phase = "edit" | "gate" | "publishing" | "published";
type Boot = "loading" | "asking" | "ready";

const AUTOSAVE_MS = 900;
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
  { id: "voices", label: "Converting voices to AAC", state: "pending" },
  { id: "assemble", label: "Assembling the SSYNC manifest", state: "pending" },
  { id: "save", label: "Saving your tape", state: "pending" },
];

export default function Studio() {
  const [state, setState] = React.useState<StudioState>(() => blankState());
  const [activeIndex, setActiveIndexState] = React.useState(0);
  const [advanced, setAdvanced] = React.useState(false);
  const [tool, setTool] = React.useState<StudioTool | null>(null);
  const [phase, setPhase] = React.useState<Phase>("edit");
  const [boot, setBoot] = React.useState<Boot>("loading");
  const [restore, setRestore] = React.useState<{ state: StudioState; savedAt: string } | null>(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [magicBusy, setMagicBusy] = React.useState(false);
  const [draftNote, setDraftNote] = React.useState<string | null>(null);
  const [steps, setSteps] = React.useState<PublishStep[]>(STEP_TEMPLATE);
  const [publishError, setPublishError] = React.useState<string | null>(null);
  const [publishNote, setPublishNote] = React.useState<string | null>(null);
  const [shareUrl, setShareUrl] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const stateRef = React.useRef(state);
  stateRef.current = state;
  const activeIndexRef = React.useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const publishedRef = React.useRef<SsyncManifest | null>(null);
  const authorRef = React.useRef("");

  const pages = state.manifest.pages;
  const page: SsyncPage | undefined = pages[activeIndex];
  const pageCount = pages.length;

  const setActive = React.useCallback((index: number) => {
    activeIndexRef.current = index;
    setActiveIndexState(index);
  }, []);

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
              audioCodec: undefined,
            },
          })),
        };
      });
      setAnnouncement(`Voice recorded, ${Math.round(duration)} seconds.`);
    },
    [],
  );

  const audio = useStudioAudio({
    stateRef,
    activeIndexRef,
    onSelectPage: setActive,
    onRecorded: handleRecorded,
  });
  const { setMusicActive, syncMix, stop: stopAudio, play, toggleRecord, clearMicError } = audio;

  /* --------------------------------------------------------- draft restore */

  React.useEffect(() => {
    const found = loadDraft();
    if (found && storyHasContent(found.state)) {
      setRestore(found);
      setBoot("asking");
    } else {
      setBoot("ready");
    }
  }, []);

  React.useEffect(() => {
    if (boot !== "ready") return;
    const id = window.setTimeout(() => {
      const outcome = saveDraft(stateRef.current);
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

  React.useEffect(() => {
    syncMix();
  }, [state.mood, state.musicOn, state.musicVolume, state.narrationVolume, syncMix]);

  /* --------------------------------------------------------------- editing */

  const patchPage = React.useCallback(
    (id: number, fn: (p: SsyncPage) => SsyncPage) => {
      setState((prev) => ({ ...prev, manifest: updatePage(prev.manifest, id, fn) }));
    },
    [],
  );

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

  const addPage = () => {
    setState((prev) => {
      const id = nextPageId(prev.manifest);
      return { ...prev, manifest: { ...prev.manifest, pages: [...prev.manifest.pages, blankPage(id)] } };
    });
    setActive(pages.length);
    setAnnouncement(`Page ${pages.length + 1} added.`);
  };

  const movePage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= pages.length) return;
    setState((prev) => {
      const next = [...prev.manifest.pages];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return { ...prev, manifest: { ...prev.manifest, pages: next } };
    });
    setActive(target);
    setAnnouncement(`Page moved to position ${target + 1}.`);
  };

  const deletePage = (index: number) => {
    if (pages.length <= 1) return;
    stopAudio();
    const victim = pages[index];
    setState((prev) => {
      const recordings = { ...prev.recordings };
      delete recordings[String(victim.id)];
      return {
        ...prev,
        recordings,
        manifest: { ...prev.manifest, pages: prev.manifest.pages.filter((_, i) => i !== index) },
      };
    });
    setActive(Math.max(0, Math.min(index, pages.length - 2)));
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
          text: { ...(p.text ?? { content: "" }), content: p.text?.content ?? "", audioUrl: undefined, audioCodec: undefined },
        })),
      };
    });
    setAnnouncement("Recording deleted.");
  };

  /* ----------------------------------------------------------------- photo */

  const pickPhoto = () => {
    clearMicError();
    fileInputRef.current?.click();
  };

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

  /* ----------------------------------------------------------------- magic */

  const runMagic = async (prompt: string, pageCountWanted: number, look: MagicLook) => {
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
      setState((prev) => ({
        ...prev,
        recordings: {},
        manifest: {
          ...prev.manifest,
          metadata: { ...prev.manifest.metadata, title: story.title },
          pages: built,
        },
      }));
      setActive(0);
      setTool(null);
      setAnnouncement(`Made a ${built.length} page story called ${story.title}.`);
    } finally {
      setMagicBusy(false);
    }
  };

  /* --------------------------------------------------------------- publish */

  const markStep = (id: string, next: Partial<PublishStep>) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...next } : s)));

  const runPublish = React.useCallback(async (author: string) => {
    stopAudio();
    authorRef.current = author;
    setPhase("publishing");
    setPublishError(null);
    setPublishNote(null);
    setSteps(STEP_TEMPLATE.map((s) => ({ ...s })));

    const base = stateRef.current;
    const source = author
      ? { ...base.manifest, metadata: { ...base.manifest.metadata, author } }
      : base.manifest;

    try {
      /* 1 — narration codec normalization (the load-bearing publish rule) */
      markStep("voices", { state: "active" });
      const total = source.pages.filter((p) => p.text?.audioUrl?.startsWith("data:")).length;
      let done = 0;
      const nextRecordings: Record<string, RecordingMeta> = {};
      const publishedPages: SsyncPage[] = [];

      for (const [index, original] of source.pages.entries()) {
        const next: SsyncPage = JSON.parse(JSON.stringify(original));
        const newId = index + 1;
        const meta = base.recordings[String(original.id)];
        next.id = newId;
        if (meta) nextRecordings[String(newId)] = meta;

        // Carry the music choice in the protocol itself: `page.music` present
        // = play this mood's bed, absent = silence. Without this the bed would
        // not survive the trip to the Player.
        if (base.musicOn) next.music = base.mood;
        else delete next.music;

        const url = next.text?.audioUrl;
        if (next.text && url && url.startsWith("data:")) {
          const blob = await dataUrlToBlob(url);
          const normalized = await normalizeNarration(blob, meta?.mimeType || blob.type);
          // Force the clean container mime: a recorder blob carries
          // "audio/mp4;codecs=…", and the container's data-URL parser (and the
          // asset extension map) only understand the bare type.
          const clean =
            normalized.blob.type === normalized.mimeType
              ? normalized.blob
              : new Blob([normalized.blob], { type: normalized.mimeType });
          next.text.audioUrl = await blobToDataUrl(clean);
          next.text.audioCodec = normalized.codec;
          done += 1;
          markStep("voices", { detail: `${done}/${total}` });
        }
        publishedPages.push(next);
      }
      markStep("voices", { state: "done", detail: total ? `${done}/${total}` : "no recordings" });

      /* 2 — assemble the manifest */
      markStep("assemble", { state: "active" });
      const cover = publishedPages.find((p) => p.illustration?.url)?.illustration?.url;
      const manifest: SsyncManifest = {
        ...source,
        version: "2.0",
        metadata: {
          ...source.metadata,
          title: source.metadata.title.trim() || DEFAULT_TITLE,
          created: source.metadata.created || new Date().toISOString(),
          coverImage: cover,
        },
        pages: publishedPages,
      };
      const validation = validateManifest(manifest);
      if (!validation.ok) throw new Error(validation.errors.join("; "));
      publishedRef.current = manifest;
      markStep("assemble", { state: "done", detail: `${publishedPages.length} pages` });

      /* 3 — save (localStorage or the cloud library), then the share link */
      markStep("save", { state: "active" });
      const cloud = isCloudEnabled();
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
      try {
        const saved = await saveBook(userId, {
          title: manifest.metadata.title,
          author: manifest.metadata.author ?? "",
          genre: manifest.metadata.genre ?? "children",
          ageRange: manifest.metadata.ageRange ?? "4-8",
          pageCount: manifest.pages.length,
          description: manifest.metadata.description ?? "",
          thumbnail: null,
          isPublic: false,
          ssyncData: manifest as unknown as object,
        });
        savedId = saved.id;
        if (cloud) {
          try {
            code = await shareBook(saved.id);
          } catch {
            code = null;
          }
        }
      } catch {
        setPublishNote(
          "Could not keep a copy on this device — storage is full. Download the .storysync file to keep your tape.",
        );
      }

      setShareUrl(code ? `${window.location.origin}/read?story=${encodeURIComponent(code)}` : null);
      markStep("save", { state: "done", detail: cloud ? "cloud library" : "this device" });

      setState((prev) => ({
        ...prev,
        manifest,
        recordings: nextRecordings,
        published: savedId
          ? { id: savedId, shareCode: code, cloud, at: new Date().toISOString() }
          : prev.published,
      }));
      setPhase("published");
    } catch (err) {
      setSteps((prev) => prev.map((s) => (s.state === "active" ? { ...s, state: "error" } : s)));
      setPublishError(err instanceof Error ? err.message : "Something went wrong while finishing.");
    }
  }, [stopAudio]);

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
    const published = stateRef.current.published;
    if (published) {
      try {
        await deleteBook(published.id);
      } catch {
        /* already gone */
      }
    }
    clearDraft();
    publishedRef.current = null;
    setShareUrl(null);
    setPublishNote(null);
    setState(blankState());
    setActive(0);
    setTool(null);
    setPhase("edit");
    setAnnouncement("Everything deleted.");
  };

  /* ------------------------------------------------------------- keyboard */

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (phase !== "edit") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;

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
        if (audio.playing) stopAudio();
        else void play();
      } else if (event.key === "Escape") {
        setTool(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [audio.playing, phase, play, setActive, stopAudio]);

  /* ----------------------------------------------------------------- derived */

  const currentMeta = page ? state.recordings[String(page.id)] : undefined;
  const hasVoice = Boolean(page?.text?.audioUrl);
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

  /* -------------------------------------------------------------- render */

  return (
    <div className="studio">
      {/* ------------------------------------------------------------ top bar */}
      <header
        className="studio-area-top flex flex-wrap items-center gap-2 border-b border-white/8 bg-black/35 px-3 py-2 backdrop-blur-xl"
        style={{ "--sk-big-h": "48px" } as React.CSSProperties}
      >
        <Link
          href="/"
          aria-label="Leave the studio"
          className="sk-focus flex h-11 items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-3 text-sm text-white/75 hover:bg-white/10"
        >
          <span aria-hidden="true">⏏</span>
          <span className="hidden sm:inline">Exit</span>
        </Link>

        <label className="sr-only" htmlFor="studio-title">
          Story title
        </label>
        <input
          id="studio-title"
          value={state.manifest.metadata.title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={DEFAULT_TITLE}
          className="studio-title-input sk-focus h-11 min-w-[8rem] flex-1 px-2 text-lg font-semibold text-white"
          style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
        />

        {draftNote ? (
          <span
            className="hidden text-[10px] tracking-[0.14em] text-amber-300/70 uppercase lg:inline"
            style={{ fontFamily: "var(--font-plex-mono), monospace" }}
          >
            {draftNote}
          </span>
        ) : null}

        <div className="flex items-center gap-2">
          <ModeToggle advanced={advanced} onChange={setAdvanced} />
          <BigButton
            icon={<span className="text-[#E3452F]">●</span>}
            label="Finish my story"
            variant="gold"
            disabled={!canFinish}
            onClick={() => {
              stopAudio();
              setTool(null);
              setPhase("gate");
            }}
            className="rounded-xl px-4 text-[15px]"
          />
        </div>
      </header>

      {/* ------------------------------------------------------------ rail */}
      <div className="studio-area-rail">
        <ToolRail
          active={tool}
          photoBusy={photoBusy}
          narrated={hasVoice}
          musicOn={state.musicOn}
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

      {/* ------------------------------------------------------------ stage */}
      <main className="studio-area-stage p-3 sm:p-4">
        <Stage
          page={page}
          pageNumber={activeIndex + 1}
          pageCount={pageCount}
          playing={audio.playing}
          narrating={audio.narrating}
          recording={audio.recording}
          recordSeconds={audio.recordSeconds}
          position={audio.position}
          clipDuration={audio.clipDuration}
          photoBusy={photoBusy}
          onTextChange={setText}
          onPickPhoto={pickPhoto}
        />

        {tool === "voice" ? (
          <VoicePanel
            recording={audio.recording}
            hasVoice={hasVoice}
            voiceSeconds={currentMeta?.duration ?? audio.clipDuration}
            recordSeconds={audio.recordSeconds}
            playing={audio.playing}
            micError={audio.micError}
            onToggleRecord={() => void toggleRecord()}
            onListen={() => (audio.playing ? stopAudio() : void play(activeIndex))}
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
            onMood={(mood: MoodName) => setState((prev) => ({ ...prev, mood }))}
            onToggle={(on) => setState((prev) => ({ ...prev, musicOn: on }))}
            onVolume={(v) => setState((prev) => ({ ...prev, musicVolume: v }))}
            onClose={() => setTool(null)}
          />
        ) : null}

        {tool === "magic" ? (
          <MagicPanel
            busy={magicBusy}
            willReplace={pages.some((p) => p.text?.content?.trim() || p.illustration?.url)}
            onGenerate={(prompt, count, look) => void runMagic(prompt, count, look)}
            onClose={() => setTool(null)}
          />
        ) : null}
      </main>

      {/* -------------------------------------------------------- inspector */}
      {advanced ? (
        <Inspector
          manifest={state.manifest}
          page={page}
          pageNumber={activeIndex + 1}
          recordings={state.recordings}
          mood={state.mood}
          musicOn={state.musicOn}
          musicVolume={state.musicVolume}
          narrationVolume={state.narrationVolume}
          level={audio.level}
          onAutoPause={setAutoPause}
          onApplyPauseToAll={applyPauseToAll}
          onTimingMultiplier={setTimingMultiplier}
          onAlt={setAlt}
          onAuthor={setAuthor}
          onMood={(mood) => setState((prev) => ({ ...prev, mood }))}
          onMusicToggle={(on) => setState((prev) => ({ ...prev, musicOn: on }))}
          onMusicVolume={(v) => setState((prev) => ({ ...prev, musicVolume: v }))}
          onNarrationVolume={(v) => setState((prev) => ({ ...prev, narrationVolume: v }))}
          onClose={() => setAdvanced(false)}
        />
      ) : null}

      {/* -------------------------------------------------------- filmstrip */}
      <div className="studio-area-film">
        <Filmstrip
          pages={pages}
          activeIndex={activeIndex}
          onSelect={(index) => {
            stopAudio();
            setActive(index);
          }}
          onMove={movePage}
          onDelete={deletePage}
          onAdd={addPage}
        />
      </div>

      {/* -------------------------------------------------------- transport */}
      <div className="studio-area-transport">
        <Transport
          playing={audio.playing}
          recording={audio.recording}
          voiceArmed={tool === "voice"}
          pageNumber={activeIndex + 1}
          pageCount={pageCount}
          position={audio.position}
          clipDuration={audio.clipDuration}
          recordSeconds={audio.recordSeconds}
          onPrev={() => {
            stopAudio();
            setActive(Math.max(0, activeIndex - 1));
          }}
          onNext={() => {
            stopAudio();
            setActive(Math.min(pageCount - 1, activeIndex + 1));
          }}
          onPlayPause={() => (audio.playing ? stopAudio() : void play(activeIndex))}
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
      <audio ref={audio.audioRef} preload="auto" className="hidden" />
      <p aria-live="polite" className="sr-only">
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
                onClick={() => {
                  setState(restore.state);
                  setActive(0);
                  setRestore(null);
                  setBoot("ready");
                }}
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

      {phase === "gate" ? (
        <ParentGate
          defaultAuthor={state.manifest.metadata.author ?? ""}
          onCancel={() => setPhase("edit")}
          onPass={(author) => {
            setAuthor(author);
            void runPublish(author);
          }}
        />
      ) : null}

      {phase === "publishing" || phase === "published" ? (
        <PublishCard
          phase={phase === "publishing" ? "publishing" : "published"}
          steps={steps}
          title={(publishedRef.current ?? state.manifest).metadata.title}
          author={(publishedRef.current ?? state.manifest).metadata.author ?? ""}
          pageCount={(publishedRef.current ?? state.manifest).pages.length}
          durationLabel={formatClock(estimateStorySeconds(state))}
          codecLabel={codecLabel}
          shareUrl={shareUrl}
          cloud={Boolean(state.published?.cloud)}
          note={publishNote}
          error={publishError}
          onDownload={downloadTape}
          onDeleteEverything={() => void deleteEverything()}
          onBack={() => setPhase("edit")}
          onRetry={() => void runPublish(authorRef.current)}
        />
      ) : null}
    </div>
  );
}
