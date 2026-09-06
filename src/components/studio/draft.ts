"use client";

/**
 * Draft autosave — localStorage only, never the network.
 *
 * PRIVACY.md rule 5: "Drafts are local. Autosaved drafts (including any
 * recorded narration) live in the browser's localStorage only, and the draft
 * is wiped by the story-deletion action."
 *
 * Images and voice recordings are data URLs, so a busy story can exceed the
 * ~5 MB quota. We report that honestly instead of failing silently — the tape
 * itself is always downloadable.
 */

import type { StudioState } from "./types";
import { blankState, pageHasContent } from "./types";

export const DRAFT_KEY = "ssync-studio-draft";
const DRAFT_VERSION = 1;

interface DraftEnvelope {
  v: number;
  savedAt: string;
  state: StudioState;
}

export type SaveOutcome = "ok" | "quota" | "unavailable";

export function loadDraft(): { state: StudioState; savedAt: string } | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DraftEnvelope;
    if (!parsed || parsed.v !== DRAFT_VERSION || !parsed.state?.manifest?.pages?.length) return null;
    const fallback = blankState();
    // Merge over a fresh state so a draft written by an older build can't
    // leave a required field undefined.
    const state: StudioState = {
      ...fallback,
      ...parsed.state,
      manifest: { ...fallback.manifest, ...parsed.state.manifest },
      recordings: parsed.state.recordings ?? {},
    };
    return { state, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

/** True when nothing a child made is in the state — no pictures, words, voice. */
export function isBlankState(state: StudioState): boolean {
  const defaultTitle = blankState().manifest.metadata.title;
  const title = (state.manifest.metadata.title ?? "").trim();
  return (
    Object.keys(state.recordings ?? {}).length === 0 &&
    !state.manifest.pages.some(pageHasContent) &&
    (title === "" || title === defaultTitle)
  );
}

export function saveDraft(state: StudioState): SaveOutcome {
  if (typeof window === "undefined") return "unavailable";
  // A blank story (e.g. right after "delete everything") clears the key rather
  // than resurrecting an empty envelope — the key is truly absent after a delete.
  if (isBlankState(state)) {
    clearDraft();
    return "ok";
  }
  const envelope: DraftEnvelope = { v: DRAFT_VERSION, savedAt: new Date().toISOString(), state };
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(envelope));
    return "ok";
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return "quota";
    return "unavailable";
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nothing we can do; the in-memory story is already gone */
  }
}
