// Unified storage — Supabase when available, localStorage fallback

import { isSupabaseConfigured, saveStorybook, getUserStorybooks, deleteStorybook as sbDelete, getStorybookByShareCode, createShareLink } from "./supabase";

interface StoredBook {
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

// Save a storybook
export async function saveBook(userId: string, book: Omit<StoredBook, 'id' | 'createdAt'>): Promise<StoredBook> {
  if (isSupabaseConfigured()) {
    const result = await saveStorybook({
      userId,
      title: book.title,
      author: book.author,
      genre: book.genre,
      ageRange: book.ageRange,
      description: book.description || '',
      pageCount: book.pageCount,
      isPublic: book.isPublic,
      ssyncData: book.ssyncData,
    });
    return {
      id: result.id,
      title: result.title,
      author: result.author,
      genre: result.genre,
      ageRange: result.age_range,
      pageCount: result.page_count,
      description: result.description,
      thumbnail: book.thumbnail,
      createdAt: result.created_at,
      isPublic: result.is_public,
      ssyncData: result.ssync_data,
    };
  }
  
  // localStorage fallback
  const id = crypto.randomUUID();
  const entry: StoredBook = { ...book, id, createdAt: new Date().toISOString() };
  const existing = JSON.parse(localStorage.getItem('ssync-library') || '[]');
  existing.unshift(entry);
  localStorage.setItem('ssync-library', JSON.stringify(existing));
  return entry;
}

// Get user's storybooks
export async function getBooks(userId: string): Promise<StoredBook[]> {
  if (isSupabaseConfigured()) {
    const results = await getUserStorybooks(userId);
    return results.map((r: any) => ({
      id: r.id,
      title: r.title,
      author: r.author,
      genre: r.genre,
      ageRange: r.age_range,
      pageCount: r.page_count,
      description: r.description,
      thumbnail: r.cover_image_url,
      createdAt: r.created_at,
      isPublic: r.is_public,
      ssyncData: r.ssync_data,
    }));
  }
  
  return JSON.parse(localStorage.getItem('ssync-library') || '[]');
}

// Delete a storybook
export async function deleteBook(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    await sbDelete(id);
    return;
  }
  const existing = JSON.parse(localStorage.getItem('ssync-library') || '[]');
  localStorage.setItem('ssync-library', JSON.stringify(existing.filter((b: any) => b.id !== id)));
}

// Get shared storybook by code
export async function getSharedBook(code: string): Promise<StoredBook | null> {
  if (isSupabaseConfigured()) {
    const result = await getStorybookByShareCode(code);
    if (!result) return null;
    return {
      id: result.id,
      title: result.title,
      author: result.author,
      genre: result.genre,
      ageRange: result.age_range,
      pageCount: result.page_count,
      description: result.description,
      thumbnail: result.cover_image_url,
      createdAt: result.created_at,
      isPublic: result.is_public,
      ssyncData: result.ssync_data,
    };
  }
  return null;
}

// Create share link
export async function shareBook(storybookId: string): Promise<string> {
  if (isSupabaseConfigured()) {
    const link = await createShareLink(storybookId);
    return link.share_code;
  }
  return storybookId; // fallback: use the ID as share code
}

// Check if using cloud storage
export function isCloudEnabled(): boolean {
  return isSupabaseConfigured();
}
