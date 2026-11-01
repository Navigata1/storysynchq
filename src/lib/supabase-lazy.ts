/**
 * The cloud client, loaded only when a cloud call is actually made (mission P4, C7).
 *
 * `@supabase/supabase-js` is about 55 KB of JavaScript (gzip). The Player a share link opens
 * and the Studio both import the cloud layer, yet most visits never need the client: a share
 * link resolves over plain requests (`share-lookup.ts`), and the shelf asks for a signed-in
 * grown-up's library only when a sign-in is stored on this device. So nothing here imports the
 * client up front: whether the cloud is configured is read from the public env vars, as
 * `supabase.ts` reads them, and the client module is fetched on first use and kept. A fetch
 * that fails (offline, a deploy replaced the chunk) is not kept, so the next call tries again.
 *
 * `/classic` keeps importing `./supabase` directly (CLAUDE.md keeps it untouched).
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** The same answer as `supabase.ts`'s `isSupabaseConfigured`, without loading the client. */
export const isSupabaseConfigured = (): boolean => Boolean(URL_ && ANON_KEY);

type SupabaseModule = typeof import("./supabase");
let loading: Promise<SupabaseModule> | null = null;

/** The cloud module, fetched on first call and shared after; a failed fetch is retried next call. */
export function loadSupabase(): Promise<SupabaseModule> {
  loading ??= import("./supabase").catch((err: unknown) => {
    loading = null;
    throw err;
  });
  return loading;
}

/** The cloud project's public URL and anon key (both ship in the page), or `null` without a cloud. */
export function cloudProject(): { url: string; anonKey: string } | null {
  return isSupabaseConfigured() ? { url: URL_, anonKey: ANON_KEY } : null;
}

/**
 * Whether supabase-js has a sign-in stored on this device: its default storage key is
 * `sb-<project ref>-auth-token` in localStorage (the ref is the URL's first label). With none
 * stored the client could only answer "nobody", so it need not be loaded to say so.
 */
function hasStoredSession(): boolean {
  try {
    const ref = new URL(URL_).hostname.split(".")[0];
    return window.localStorage.getItem(`sb-${ref}-auth-token`) !== null;
  } catch {
    // No storage, or a URL this cannot read: ask the client rather than guess.
    return true;
  }
}

export async function getUser() {
  if (!isSupabaseConfigured() || !hasStoredSession()) return null;
  return (await loadSupabase()).getUser();
}

export async function signIn(email: string, password: string) {
  return (await loadSupabase()).signIn(email, password);
}

export async function signUp(email: string, password: string, name: string) {
  return (await loadSupabase()).signUp(email, password, name);
}
