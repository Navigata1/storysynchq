/**
 * A shared story, by its code, without the cloud client (mission P4, C7).
 *
 * The app never lists other people's stories; it reaches a shared one by its
 * code and by nothing else (PRIVACY.md rule 4). Exact match, no length check:
 * 64-bit codes made before codes were 128-bit keep resolving until their story
 * is deleted.
 *
 * A share link is what a grandparent opens, so it must not wait on
 * `@supabase/supabase-js` (about 55 KB gzip) to resolve one code. The lookup
 * is two PostgREST calls at most; `restShareClient` makes them with `fetch`,
 * as the anonymous visitor the client would be for them anyway (the by-code
 * function and, before migration 003, the read policies decide what that
 * visitor may see). `supabase.ts` re-exports these for its callers.
 */

/** A PostgREST rejection, as the client reports it (`fromSupabase` reads these fields). */
export interface LookupError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
}

/** What one PostgREST call answers. */
export interface LookupReply {
  data: unknown;
  error: LookupError | null;
}

/**
 * The calls a share-code lookup makes: the live supabase-js client, the
 * REST shim below (`restShareClient`), or a stub in Node tests.
 */
export interface ShareLookupClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<LookupReply>;
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): { maybeSingle(): PromiseLike<LookupReply> };
    };
  };
}

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
  client: ShareLookupClient | null,
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
 * A share lookup over plain `fetch`, as the anon key (no sign-in rides along:
 * a share link is opened as a visitor). It answers the way supabase-js does —
 * `{ data, error }`, the error carrying PostgREST's `code` and the HTTP status
 * — and lets a network failure throw (a `TypeError`), which the caller names.
 */
export function restShareClient(url: string, anonKey: string): ShareLookupClient {
  const base = `${url.replace(/\/+$/, "")}/rest/v1`;
  const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

  async function reply(res: Response): Promise<LookupReply> {
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (res.ok) return { data: body, error: null };
    const e = (body ?? {}) as LookupError;
    return {
      data: null,
      error: {
        code: typeof e.code === "string" ? e.code : undefined,
        message: typeof e.message === "string" ? e.message : res.statusText,
        details: typeof e.details === "string" ? e.details : undefined,
        hint: typeof e.hint === "string" ? e.hint : undefined,
        status: res.status,
      },
    };
  }

  return {
    async rpc(fn, args) {
      const res = await fetch(`${base}/rpc/${encodeURIComponent(fn)}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      return reply(res);
    },
    from(table) {
      return {
        select(columns) {
          return {
            eq(column, value) {
              return {
                async maybeSingle() {
                  const query = new URLSearchParams({ select: columns, [column]: `eq.${value}` });
                  const res = await fetch(`${base}/${encodeURIComponent(table)}?${query}`, { headers });
                  const r = await reply(res);
                  if (r.error) return r;
                  const rows = Array.isArray(r.data) ? r.data : [];
                  if (rows.length > 1) {
                    return {
                      data: null,
                      error: { code: "PGRST116", message: "More than one row matched", status: 406 },
                    };
                  }
                  return { data: rows[0] ?? null, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}
