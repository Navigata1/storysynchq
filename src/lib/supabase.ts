import { createClient } from "@supabase/supabase-js";

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

export async function getPublicStorybooks(genre?: string, search?: string) {
  if (!supabase) return [];
  let query = supabase
    .from("storybooks")
    .select("id, title, author, genre, age_range, page_count, description, cover_image_url, view_count, created_at")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(50);
  if (genre && genre !== "All") query = query.eq("genre", genre);
  if (search) query = query.ilike("title", `%${search}%`);
  const { data } = await query;
  return data || [];
}

export async function getStorybookByShareCode(code: string) {
  if (!supabase) return null;
  const { data: link } = await supabase
    .from("shared_links")
    .select("storybook_id")
    .eq("share_code", code)
    .single();
  if (!link) return null;
  const { data } = await supabase
    .from("storybooks")
    .select("*")
    .eq("id", link.storybook_id)
    .single();
  return data;
}

export async function createShareLink(storybookId: string) {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase
    .from("shared_links")
    .insert({ storybook_id: storybookId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Storage ──

export async function uploadMedia(file: Blob, path: string) {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.storage.from("storybook-media").upload(path, file);
  if (error) throw error;
  const { data: urlData } = supabase.storage.from("storybook-media").getPublicUrl(path);
  return urlData.publicUrl;
}
