import { createClient } from "@supabase/supabase-js";
import { shareLinkRow } from "./share-code";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export const isSupabaseConfigured = () => !!supabase;

// ── Auth ──

export async function signUp(email: string, password: string, name: string) {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export function onAuthStateChange(callback: (event: string, session: unknown) => void) {
  if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } };
  return supabase.auth.onAuthStateChange(callback);
}

// ── Profile ──

export async function getProfile(userId: string) {
  if (!supabase) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
  return data;
}

export async function updateProfile(userId: string, updates: { name?: string; avatar_url?: string }) {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.from("profiles").update(updates).eq("id", userId).select().single();
  if (error) throw error;
  return data;
}

// ── Storybooks ──

export async function saveStorybook(storybook: {
  userId: string;
  title: string;
  author: string;
  genre: string;
  ageRange: string;
  description: string;
  pageCount: number;
  isPublic: boolean;
  ssyncData: object;
}) {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.from("storybooks").insert({
    user_id: storybook.userId,
    title: storybook.title,
    author: storybook.author,
    genre: storybook.genre,
    age_range: storybook.ageRange,
    description: storybook.description,
    page_count: storybook.pageCount,
    is_public: storybook.isPublic,
    ssync_data: storybook.ssyncData,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function getUserStorybooks(userId: string) {
  if (!supabase) return [];
  const { data } = await supabase
    .from("storybooks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data || [];
}

export async function deleteStorybook(id: string) {
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.from("storybooks").delete().eq("id", id);
  if (error) throw error;
}

// ── A shared story, by its code ──
//
// The app never lists other people's stories; it reaches a shared one by its
// code and by nothing else (PRIVACY.md rule 4). Exact match, no length check:
// 64-bit codes made before codes were 128-bit keep resolving until their story
// is deleted.

/** The calls a share-code lookup makes — the live client, or a stub in Node tests. */
export type ShareLookupClient = Pick<NonNullable<typeof supabase>, "rpc" | "from">;

/**
 * What a share link opens: the columns the Reader needs and nothing more — no
 * owner, no flags, no counters. Migration 003's `storybook_by_share_code`
 * returns exactly these.
 */
export interface SharedStorybookRow {
  id: string;
  title: string;
  author: string;
  genre: string;
  age_range: string;
  page_count: number;
  description: string;
  cover_image_url: string | null;
  created_at: string;
  ssync_data: object;
}

const SHARED_STORYBOOK_COLUMNS =
  "id,title,author,genre,age_range,page_count,description,cover_image_url,created_at,ssync_data";

/**
 * "There is no such function": PostgREST's schema cache has no
 * `storybook_by_share_code` (PGRST202), or Postgres itself says so (42883).
 * Read as one thing only: migration 003 is not applied yet.
 */
function isFunctionNotFound(error: { code?: string } | null): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

/**
 * The one story a share code names, or `null`. Asks migration 003's by-code
 * function first. Until Jon applies 003 the function is not there, and only
 * then does this fall back to the exact-match two-step select the app used
 * before. Any other failure is thrown, untouched, for the caller to name.
 */
export async function getStorybookByShareCode(
  code: string,
  client: ShareLookupClient | null = supabase,
): Promise<SharedStorybookRow | null> {
  if (!client) return null;
  const { data, error } = await client.rpc("storybook_by_share_code", { code });
  if (error) {
    if (!isFunctionNotFound(error)) throw error;
    return storybookByShareCodeBefore003(client, code);
  }
  const row: unknown = Array.isArray(data) ? data[0] : data;
  return (row as SharedStorybookRow | undefined) ?? null;
}

/**
 * Pre-003 only: the link by its exact code, then the one story it names. It
 * leans on 001's broad read policies, which 003 drops along with any need for
 * this path.
 */
async function storybookByShareCodeBefore003(
  client: ShareLookupClient,
  code: string,
): Promise<SharedStorybookRow | null> {
  const { data: link, error: linkError } = await client
    .from("shared_links")
    .select("storybook_id")
    .eq("share_code", code)
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link) return null;
  const { data, error } = await client
    .from("storybooks")
    .select(SHARED_STORYBOOK_COLUMNS)
    .eq("id", (link as { storybook_id: string }).storybook_id)
    .maybeSingle();
  if (error) throw error;
  return (data as SharedStorybookRow | null) ?? null;
}

/**
 * Insert a share link carrying an explicit 128-bit code (`shareLinkRow`), so
 * the link is 32 hex whatever the column default is (migration 001's is 64-bit).
 */
export async function createShareLink(storybookId: string) {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase
    .from("shared_links")
    .insert(shareLinkRow(storybookId))
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Storage ──

export async function uploadMedia(file: Blob, path: string) {
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.storage.from("storybook-media").upload(path, file);
  if (error) throw error;
  const { data: urlData } = supabase.storage.from("storybook-media").getPublicUrl(path);
  return urlData.publicUrl;
}
