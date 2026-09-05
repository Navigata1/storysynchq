// Unified storage — Supabase when it is configured, localStorage otherwise.
//
// Two rules make the share loop work, and both live here:
//
//  1. **Typed failures.** A save can fail because nobody is signed in, because
//     row-level security refused the write, because the network is gone, or
//     because the device is out of room. Those are four different sentences to
//     a parent and only one of them is "storage is full". Every throw from this
//     module is a `CloudError` carrying a `kind`, so callers never have to
//     guess (docs/10x-plan.md gap G1).
//
//  2. **One row per story.** Publishing the same story twice UPDATES the row it
//     wrote the first time instead of orphaning a copy a later "delete
//     everything" would miss — a COPPA requirement, not a tidiness one
//     (PRIVACY.md rule 2).
//
// The localStorage fallback is a real implementation, not a stub: it mints
// unguessable share codes and resolves them, so `/read?story=<code>` opens the
// tape on the device that made it even with no cloud configured at all.

import {
  isSupabaseConfigured,
  supabase,
  saveStorybook,
  getUserStorybooks,
  deleteStorybook as sbDelete,
  getStorybookByShareCode,
  createShareLink,
  getSession,
} from "./supabase";

export const LIBRARY_KEY = "ssync-library";

export interface StoredBook {
  id: string;
  title: string;
  author: string;
  genre: string;
  ageRange: string;
  pageCount: number;
  description: string;
  thumbnail: string | null;
  createdAt: string;
  isPublic: boolean;
  ssyncData: object;
  shareCode?: string;
}

export type BookInput = Omit<StoredBook, "id" | "createdAt">;

/* --------------------------------------------------------------- errors */

/**
 * Why a storage call failed, in the only terms the UI needs:
 *   auth        — Supabase is configured but nobody is signed in
 *   permission  — signed in, but the row policy refused (RLS)
 *   quota       — the device has no room left (localStorage)
 *   network     — the request never got an answer
 *   notFound    — the id or share code does not exist
 *   unknown     — anything else; show the message, do not invent a cause
 */
export type CloudErrorKind =
  | "auth"
  | "permission"
  | "quota"
  | "network"
  | "notFound"
  | "unknown";

export class CloudError extends Error {
  readonly kind: CloudErrorKind;
  readonly detail?: string;

  constructor(kind: CloudErrorKind, message: string, detail?: string) {
    super(message);
    this.name = "CloudError";
    this.kind = kind;
    this.detail = detail;
  }
}

export function isCloudError(err: unknown): err is CloudError {
  return err instanceof CloudError;
}

/** Never guess: an unrecognised failure is "unknown", not "storage is full". */
export function cloudErrorKind(err: unknown): CloudErrorKind {
  return isCloudError(err) ? err.kind : "unknown";
}

function quotaError(err: unknown): boolean {
  const name = err instanceof DOMException ? err.name : "";
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

/** Map a Supabase/Postgrest rejection onto a kind we can speak about. */
function fromSupabase(err: unknown, what: string): CloudError {
  const e = (err ?? {}) as { code?: string; status?: number; message?: string; name?: string };
  const message = typeof e.message === "string" ? e.message : "";
  const code = typeof e.code === "string" ? e.code : "";
  const status = typeof e.status === "number" ? e.status : 0;

  if (code === "42501" || /row-level security|permission denied|not authorized/i.test(message)) {
    return new CloudError("permission", `${what}: the cloud library refused this write.`, message);
  }
  if (status === 401 || status === 403 || /jwt|not authenticated|invalid token/i.test(message)) {
    return new CloudError("auth", `${what}: nobody is signed in.`, message);
  }
  if (code === "PGRST116" || status === 404) {
    return new CloudError("notFound", `${what}: nothing there.`, message);
  }
  if (e.name === "TypeError" || /fetch|network|failed to fetch/i.test(message)) {
    return new CloudError("network", `${what}: could not reach the cloud library.`, message);
  }
  return new CloudError("unknown", message || `${what}: that did not work.`, message);
}

/* ---------------------------------------------------------- local library */

interface LocalEntry extends StoredBook {
  shareCode?: string;
}

function readLibrary(): LocalEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(LIBRARY_KEY) || "[]");
    return Array.isArray(parsed) ? (parsed as LocalEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLibrary(entries: LocalEntry[], what: string): void {
  if (typeof window === "undefined") {
    throw new CloudError("unknown", `${what}: no browser storage here.`);
  }
  try {
    window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries));
  } catch (err) {
    if (quotaError(err)) {
      throw new CloudError(
        "quota",
        `${what}: this device is out of room. Download the .storysync file to keep the tape.`,
      );
    }
    throw new CloudError("unknown", `${what}: this browser would not save it.`);
  }
}

/** Unguessable, unlisted (PRIVACY.md rule 4) — 128 bits of randomness. */
function mintShareCode(): string {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`;
  }
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `local-${mintShareCode()}`;
  }
}

/* ------------------------------------------------------------- row shape */

interface StorybookRow {
  id: string;
  title: string;
  author: string;
  genre: string;
  age_range: string;
  page_count: number;
  description: string;
  cover_image_url?: string | null;
  created_at: string;
  is_public: boolean;
  ssync_data: object;
}

function fromRow(row: StorybookRow, thumbnail: string | null = null): StoredBook {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    genre: row.genre,
    ageRange: row.age_range,
    pageCount: row.page_count,
    description: row.description,
    thumbnail: row.cover_image_url ?? thumbnail,
    createdAt: row.created_at,
    isPublic: row.is_public,
    ssyncData: row.ssync_data,
  };
}

/* ------------------------------------------------------------------ save */

/**
 * Save a story. Pass `existingId` (or a book already carrying an id) to UPDATE
 * that story instead of creating a second copy — re-publishing a tape must
 * never leave an orphan behind.
 */
export async function saveBook(
  userId: string,
  book: BookInput,
  existingId?: string | null,
): Promise<StoredBook> {
  if (existingId) return updateBook(existingId, userId, book);

  if (isSupabaseConfigured()) {
    const session = await getSession().catch(() => null);
    if (!session) {
      throw new CloudError(
        "auth",
        "The cloud library needs a signed-in grown-up before it will keep a copy.",
      );
    }
    try {
      const result = await saveStorybook({
        userId,
        title: book.title,
        author: book.author,
        genre: book.genre,
        ageRange: book.ageRange,
        description: book.description || "",
        pageCount: book.pageCount,
        isPublic: book.isPublic,
        ssyncData: book.ssyncData,
      });
      return fromRow(result as StorybookRow, book.thumbnail);
    } catch (err) {
      throw fromSupabase(err, "Saving your tape");
    }
  }

  const entry: LocalEntry = { ...book, id: newId(), createdAt: new Date().toISOString() };
  const library = readLibrary();
  library.unshift(entry);
  writeLibrary(library, "Saving your tape");
  return entry;
}

/**
 * Save to this device on purpose, whatever the cloud is doing.
 *
 * The honest path when Supabase is configured but nobody is signed in: the
 * story is kept, the parent is told the truth, and they can sign in (or just
 * download the tape) instead of being handed a lie about storage being full.
 * Upserts by id like `saveBook`, so re-publishing still leaves one copy.
 */
export function saveLocalBook(book: BookInput, existingId?: string | null): StoredBook {
  const library = readLibrary();
  const index = existingId ? library.findIndex((b) => b.id === existingId) : -1;
  const previous = index >= 0 ? library[index] : undefined;
  const entry: LocalEntry = {
    ...book,
    id: previous?.id ?? existingId ?? newId(),
    createdAt: previous?.createdAt ?? new Date().toISOString(),
    shareCode: previous?.shareCode,
  };
  if (index >= 0) library[index] = entry;
  else library.unshift(entry);
  writeLibrary(library, "Saving your tape");
  return entry;
}

/** The update half of the upsert — exported because re-publish is a real verb. */
export async function updateBook(
  id: string,
  userId: string,
  book: BookInput,
): Promise<StoredBook> {
  if (isSupabaseConfigured()) {
    const session = await getSession().catch(() => null);
    if (!session) {
      throw new CloudError(
        "auth",
        "The cloud library needs a signed-in grown-up before it will keep a copy.",
      );
    }
    if (!supabase) throw new CloudError("unknown", "The cloud library is not available.");
    const { data, error } = await supabase
      .from("storybooks")
      .update({
        title: book.title,
        author: book.author,
        genre: book.genre,
        age_range: book.ageRange,
        description: book.description || "",
        page_count: book.pageCount,
        is_public: book.isPublic,
        ssync_data: book.ssyncData,
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) throw fromSupabase(error, "Updating your tape");
    if (!data) throw new CloudError("notFound", "That tape is no longer in the cloud library.");
    return fromRow(data as StorybookRow, book.thumbnail);
  }

  const library = readLibrary();
  const index = library.findIndex((b) => b.id === id);
  const previous = index >= 0 ? library[index] : undefined;
  const entry: LocalEntry = {
    ...book,
    id,
    createdAt: previous?.createdAt ?? new Date().toISOString(),
    shareCode: previous?.shareCode,
  };
  if (index >= 0) library[index] = entry;
  else library.unshift(entry);
  writeLibrary(library, "Updating your tape");
  return entry;
}

/* ------------------------------------------------------------------ read */

export async function getBooks(userId: string): Promise<StoredBook[]> {
  if (isSupabaseConfigured()) {
    const results = (await getUserStorybooks(userId)) as StorybookRow[];
    return results.map((r) => fromRow(r));
  }
  return readLibrary();
}

/**
 * Resolve a share code. The cloud path reads `shared_links`; the local path
 * matches the code minted by `shareBook` (and accepts a raw story id, because
 * older builds handed the id out as the code).
 */
export async function getSharedBook(code: string): Promise<StoredBook | null> {
  if (!code) return null;
  if (isSupabaseConfigured()) {
    const result = (await getStorybookByShareCode(code)) as StorybookRow | null;
    return result ? fromRow(result) : null;
  }
  const library = readLibrary();
  return library.find((b) => b.shareCode === code) ?? library.find((b) => b.id === code) ?? null;
}

/* ----------------------------------------------------------------- share */

/** Mint (or reuse) the unlisted code that `/read?story=<code>` resolves. */
export async function shareBook(storybookId: string): Promise<string> {
  if (isSupabaseConfigured()) {
    try {
      const link = (await createShareLink(storybookId)) as { share_code: string };
      return link.share_code;
    } catch (err) {
      throw fromSupabase(err, "Making the link");
    }
  }

  const library = readLibrary();
  const index = library.findIndex((b) => b.id === storybookId);
  if (index < 0) throw new CloudError("notFound", "That tape is not on this device any more.");
  const existing = library[index].shareCode;
  if (existing) return existing;
  const code = mintShareCode();
  library[index] = { ...library[index], shareCode: code };
  writeLibrary(library, "Making the link");
  return code;
}

/* ---------------------------------------------------------------- delete */

/**
 * One tap wipes the story everywhere it was kept: the row (or local entry),
 * its pictures and narration inside `ssync_data`, and the share code that
 * pointed at it. There is no archive (PRIVACY.md rule 2).
 */
export async function deleteBook(id: string): Promise<void> {
  // Always sweep the on-device copy first, cloud or not: a tape the cloud
  // refused was kept here, and a leftover copy of a child's voice is not okay.
  const library = readLibrary();
  if (library.some((b) => b.id === id)) {
    writeLibrary(
      library.filter((b) => b.id !== id),
      "Deleting the tape",
    );
  }

  if (isSupabaseConfigured()) {
    if (supabase) {
      // Revoke the link first so a half-failed delete can never leave a live
      // code pointing at a child's voice.
      await supabase
        .from("shared_links")
        .delete()
        .eq("storybook_id", id)
        .then(undefined, () => undefined);
    }
    try {
      await sbDelete(id);
    } catch (err) {
      throw fromSupabase(err, "Deleting the tape");
    }
  }
}

/** Remove several copies (a story published more than once by an old build). */
export async function deleteBooks(ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    try {
      await deleteBook(id);
    } catch {
      /* one gone copy must never block the next */
    }
  }
}

export function isCloudEnabled(): boolean {
  return isSupabaseConfigured();
}
