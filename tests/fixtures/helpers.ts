/**
 * Page helpers that load the fixture tapes through the app's own doors:
 *
 *   openTapeInReadRoom  — the Read Room's ".storysync file" input
 *   seedStudioDraft     — the Studio's local draft (autosave envelope v1)
 *   restoreDraft        — "Keep working on it" in the Studio's restore prompt
 *   seedDeviceLibrary   — this device's library, resolved by /read?story=<code>
 *
 * Seeds are written by an init script before the app's own code runs, ONCE
 * per tab: a reload after the seed keeps whatever the app has saved (or
 * deleted) since, the way a real device would.
 *
 * Illustrative content only — see ./tapes.ts and ./README.md.
 */

import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import type { SsyncManifest, SsyncPage } from "../../src/lib/storysync/manifest";
import type { StudioState } from "../../src/components/studio/types";
import { loadTape, TAPES, type TapeName } from "./tapes";

/** The Studio's autosave key (src/components/studio/draft.ts). */
export const DRAFT_KEY = "ssync-studio-draft";
/** The device library key (src/lib/cloud-storage.ts). */
export const LIBRARY_KEY = "ssync-library";

/** 7:48 — Studio opened 6:02:10 pm, the grown-up said yes at 6:09:58 pm. */
export const DEFAULT_STARTED_AGO_S = 468;

/* --------------------------------------------------------------- Read Room */

/**
 * Visit /read and hand the tape to the "Open a tape from this device" input.
 * Resolves when the cover's "Tap to Begin" is visible.
 */
export async function openTapeInReadRoom(page: Page, name: TapeName): Promise<void> {
  const buffer = Buffer.from(loadTape(name).bytes);
  await page.goto("/read");
  const input = page.locator('input[type="file"][accept*=".storysync"]');
  const begin = page.getByRole("button", { name: /Tap to Begin/ });
  await expect(input).toHaveCount(1);

  // A file handed over before React hydrates is never seen by the change
  // handler, so retry until the cover appears. Each attempt carries a new file
  // name: React ignores a change whose input value string did not change.
  let attempt = 0;
  await expect(async () => {
    attempt += 1;
    if ((await input.count()) > 0) {
      await input.setInputFiles({
        name: `${name}-${attempt}.storysync`,
        mimeType: "application/zip",
        buffer,
      });
    }
    await expect(begin).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30000 });
}

/* ------------------------------------------------------------------ Studio */

export interface SeedDraftOptions {
  /** How long ago the tape was started — drives "Made in m:ss". Default 468 (7:48). */
  startedAgoS?: number;
  /** "story by" as already typed. Default "" so the gate's field stays the user's input. */
  byline?: string;
  /** Per-page `text.voice` overrides, page id → voice name (multi-voice consent). */
  voices?: Record<number, string>;
  /** Recorded voice on every page (default true). False gives a picture-and-words draft. */
  narration?: boolean;
  /**
   * Pages already normalized by an earlier publish (default false). When
   * false, pages carry no `audioCodec`, as a fresh draft would.
   */
  published?: boolean;
}

/**
 * The Studio state a tape's maker would have on this device just before
 * publishing: pictures and voices as data URLs, draft recording meta, the
 * Creator's defaults (Wonder, music on). Nothing publish writes is present —
 * no signature, no `metadata.narrator`, no `page.music`. `startedAt` is filled
 * in by the page (so it follows the page's clock); see seedStudioDraft.
 */
export function studioDraftState(name: TapeName, opts: SeedDraftOptions = {}): StudioState {
  const { byline = "", voices = {}, narration = true, published = false } = opts;
  const facts = TAPES[name];
  const { story } = loadTape(name);

  const pages: SsyncPage[] = story.pages.map((p) => {
    const text: NonNullable<SsyncPage["text"]> = {
      content: p.text?.content ?? "",
      wordHighlight: true,
    };
    if (narration && p.text?.audioUrl) {
      text.audioUrl = p.text.audioUrl;
      if (published && p.text.audioCodec) text.audioCodec = p.text.audioCodec;
    }
    const voice = voices[p.id];
    if (voice) text.voice = voice;
    return {
      id: p.id,
      layout: "image-top",
      illustration: { url: p.illustration?.url, alt: p.illustration?.alt ?? "" },
      text,
      timing: { autoPause: facts.autoPause },
    };
  });

  const manifest: SsyncManifest = {
    version: "2.0",
    metadata: {
      title: facts.title,
      author: byline,
      language: facts.language,
      created: facts.created,
    },
    settings: {
      autoPlay: true,
      pageTransition: "fade",
      readAlongHighlight: true,
      pageTurnSound: true,
      accessibility: { timingMultiplier: 1 },
    },
    pages,
  };

  const recordings: StudioState["recordings"] = {};
  if (narration) {
    for (const p of facts.pages) {
      recordings[String(p.id)] = { mimeType: "audio/wav", duration: p.clipSeconds };
    }
  }

  return {
    manifest,
    recordings,
    mood: "Wonder",
    musicOn: true,
    musicVolume: 0.3,
    narrationVolume: 0.85,
    published: null,
    publishedIds: [],
    startedAt: "",
  };
}

/** Write the Studio's draft envelope (v1) for this tape before the app loads. */
export async function seedStudioDraft(
  page: Page,
  name: TapeName,
  opts: SeedDraftOptions = {},
): Promise<void> {
  const state = studioDraftState(name, opts);
  const startedAgoS = opts.startedAgoS ?? DEFAULT_STARTED_AGO_S;
  await page.addInitScript(
    ({ key, marker, stateJson, startedAgoS: ago }) => {
      try {
        if (window.sessionStorage.getItem(marker)) return;
        const now = Date.now();
        const draftState = JSON.parse(stateJson) as { startedAt: string };
        draftState.startedAt = new Date(now - ago * 1000).toISOString();
        const envelope = { v: 1, savedAt: new Date(now).toISOString(), state: draftState };
        window.localStorage.setItem(key, JSON.stringify(envelope));
        window.sessionStorage.setItem(marker, "1");
      } catch {
        /* opaque origins (about:blank) have no storage; the next document seeds */
      }
    },
    {
      key: DRAFT_KEY,
      marker: `ssync-fixture-seeded:${DRAFT_KEY}:${name}`,
      stateJson: JSON.stringify(state),
      startedAgoS,
    },
  );
}

/** Answer the Studio's restore prompt with "Keep working on it". */
export async function restoreDraft(page: Page): Promise<void> {
  const keep = page.getByRole("button", { name: /Keep working on it/ });
  await expect(keep).toBeVisible({ timeout: 20000 });
  await keep.click();
  await expect(keep).toBeHidden();
}

/* ---------------------------------------------------------- device library */

export interface SeedLibraryOptions {
  /** The unlisted code `/read?story=<code>` resolves. */
  shareCode: string;
  /** When the tape landed on this device. Default: now (at seed time). */
  createdAt?: string;
}

/** A device-library row, shaped like the one the Creator's publish writes. */
export interface DeviceLibraryEntry {
  id: string;
  shareCode: string;
  title: string;
  author: string;
  genre: string;
  ageRange: string;
  pageCount: number;
  description: string;
  thumbnail: null;
  createdAt: string;
  isPublic: boolean;
  ssyncData: SsyncManifest;
}

/**
 * Put one published tape in this device's library (`ssync-library`), the way
 * a publish with no cloud leaves it. Rows already there are kept; a row with
 * the same share code is replaced. Returns the row written.
 */
export async function seedDeviceLibrary(
  page: Page,
  name: TapeName,
  { shareCode, createdAt }: SeedLibraryOptions,
): Promise<DeviceLibraryEntry> {
  const { story } = loadTape(name);
  const entry: DeviceLibraryEntry = {
    id: randomUUID(),
    shareCode,
    title: story.metadata.title,
    author: story.metadata.author ?? "",
    genre: story.metadata.genre ?? "children",
    ageRange: story.metadata.ageRange ?? "4-8",
    pageCount: story.pages.length,
    description: story.metadata.description ?? "",
    thumbnail: null,
    createdAt: createdAt ?? new Date().toISOString(),
    isPublic: true,
    ssyncData: story,
  };
  await page.addInitScript(
    ({ key, marker, entryJson }) => {
      try {
        if (window.sessionStorage.getItem(marker)) return;
        const row = JSON.parse(entryJson) as { shareCode: string };
        let rows: unknown[] = [];
        try {
          const parsed: unknown = JSON.parse(window.localStorage.getItem(key) || "[]");
          if (Array.isArray(parsed)) rows = parsed;
        } catch {
          rows = [];
        }
        const kept = rows.filter(
          (r) => !(r && typeof r === "object" && (r as { shareCode?: unknown }).shareCode === row.shareCode),
        );
        window.localStorage.setItem(key, JSON.stringify([row, ...kept]));
        window.sessionStorage.setItem(marker, "1");
      } catch {
        /* opaque origins (about:blank) have no storage; the next document seeds */
      }
    },
    {
      key: LIBRARY_KEY,
      marker: `ssync-fixture-seeded:${LIBRARY_KEY}:${shareCode}`,
      entryJson: JSON.stringify(entry),
    },
  );
  return entry;
}
