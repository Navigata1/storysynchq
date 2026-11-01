/**
 * The cloud client, loaded only when a cloud call is actually made (mission P4, C7).
 *
 * `@supabase/supabase-js` is about 55 KB of JavaScript (gzip). The Player a share link opens
 * and the Studio both import the cloud layer, yet most visits never touch the cloud (a tape on
 * this device, or no cloud configured). So nothing here imports the client up front: whether
 * the cloud is configured is read from the public env vars, as `supabase.ts` reads them, and
 * the client module is fetched on first use and kept.
 *
 * `/classic` keeps importing `./supabase` directly (CLAUDE.md keeps it untouched).
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** The same answer as `supabase.ts`'s `isSupabaseConfigured`, without loading the client. */
export const isSupabaseConfigured = (): boolean => Boolean(URL && ANON_KEY);

type SupabaseModule = typeof import("./supabase");
let loading: Promise<SupabaseModule> | null = null;

/** The cloud module, fetched on first call and shared after. */
export function loadSupabase(): Promise<SupabaseModule> {
  loading ??= import("./supabase");
  return loading;
}

export async function getUser() {
  if (!isSupabaseConfigured()) return null;
  return (await loadSupabase()).getUser();
}

export async function signIn(email: string, password: string) {
  return (await loadSupabase()).signIn(email, password);
}

export async function signUp(email: string, password: string, name: string) {
  return (await loadSupabase()).signUp(email, password, name);
}
