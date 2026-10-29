// T02b · Share links cannot be enumerated: a tape is looked up by its code only.
//
// Reference: s05 (callout "THE LINK, HONESTLY") and s07 ("Unlisted means
// unlisted — a family's tapes are reachable only by their link — never listed,
// searched or counted"). Migration 001 let anyone holding the anon key list
// every share code and every published story; migration 003 closes that, and
// the app reads a shared tape through the by-code function it adds.
//
// All Node-side (no browser, no live cloud). CI has no Supabase, so the cloud
// path is driven through `resolveShareCode` with a stubbed client:
//   1. it calls rpc('storybook_by_share_code', { code }) and nothing else
//   2. "function not found" (PGRST202 / 42883: 003 not applied yet) falls back
//      to the exact-match two-step select, so production keeps working
//   3. any other RPC error is reported as a CloudError, with no fallback
//   4. an empty or non-hex code never reaches the network
//   5. migration 003: the SECURITY DEFINER function, its grants, the three
//      broad read policies dropped, every owner policy kept, no data change
//   6. src/ reads shared_links and storybooks only by code, by id or as the
//      owner — never as a list

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { CloudError, resolveShareCode } from "../src/lib/cloud-storage";
import type { ShareLookupClient } from "../src/lib/supabase";
import { REPO_ROOT } from "./fixtures/tapes";

const MIGRATION_003 = path.join(REPO_ROOT, "supabase", "migrations", "003_share_lookup_by_code.sql");
const MIGRATION_001 = path.join(REPO_ROOT, "supabase", "migrations", "001_initial_schema.sql");
const SRC_DIR = path.join(REPO_ROOT, "src");
const SUPABASE = path.join(SRC_DIR, "lib", "supabase.ts");

/** A 128-bit code of this test's own (never the reel's cast code). */
const CODE_128 = "5e0c7a91d2b84f36a1c09e7d3b6f2a48";
/** A 64-bit code, shaped like every cloud link made before T02. */
const CODE_64 = "c41e9a07b3d2f856";

/** What the by-code function hands back: the Reader's columns, no owner or counter. */
const SHARED_ROW = {
  id: "0b7f6c3e-2a1d-4e59-8c70-9f4e3d2b1a60",
  title: "The Lighthouse Cat",
  author: "Test Family",
  genre: "children",
  age_range: "all ages",
  page_count: 1,
  description: "",
  cover_image_url: null,
  created_at: "2026-10-26T09:00:00.000Z",
  ssync_data: {
    version: "2.0",
    metadata: { title: "The Lighthouse Cat" },
    pages: [{ id: 1, text: "A cat kept the light." }],
  },
};

interface Reply {
  data: unknown;
  error: { code?: string; message?: string; status?: number; name?: string } | null;
}

interface Call {
  op: "rpc" | "from" | "select" | "eq" | "maybeSingle" | "single";
  args: unknown[];
}

/**
 * A Supabase client that answers from a script and writes down every call. A
 * call it was not given an answer for fails the test loudly.
 */
function stubClient(replies: { rpc?: Reply; shared_links?: Reply; storybooks?: Reply }) {
  const calls: Call[] = [];
  const answer = (key: keyof typeof replies): Promise<Reply> => {
    const reply = replies[key];
    if (!reply) throw new Error(`unexpected ${key} call`);
    return Promise.resolve(reply);
  };
  const client = {
    rpc(fn: string, args: unknown) {
      calls.push({ op: "rpc", args: [fn, args] });
      return answer("rpc");
    },
    from(table: string) {
      calls.push({ op: "from", args: [table] });
      const key = table as "shared_links" | "storybooks";
      const chain = {
        select(columns: string) {
          calls.push({ op: "select", args: [table, columns] });
          return chain;
        },
        eq(column: string, value: unknown) {
          calls.push({ op: "eq", args: [table, column, value] });
          return chain;
        },
        maybeSingle() {
          calls.push({ op: "maybeSingle", args: [table] });
          return answer(key);
        },
        single() {
          calls.push({ op: "single", args: [table] });
          return answer(key);
        },
      };
      return chain;
    },
  };
  return { client: client as unknown as ShareLookupClient, calls };
}

const fromCalls = (calls: Call[]) => calls.filter((c) => c.op === "from").map((c) => c.args[0]);

/* ------------------------------------------------------------- 1 · by code */

test.describe("share lookup · the resolver asks for one code", () => {
  test("it calls rpc('storybook_by_share_code', { code }) and reads nothing else", async () => {
    const { client, calls } = stubClient({ rpc: { data: [SHARED_ROW], error: null } });

    const book = await resolveShareCode(CODE_128, client);

    expect(calls[0]).toEqual({ op: "rpc", args: ["storybook_by_share_code", { code: CODE_128 }] });
    expect(calls).toHaveLength(1);
    expect(book).not.toBeNull();
    expect(book!.title).toBe(SHARED_ROW.title);
    expect(book!.ssyncData).toEqual(SHARED_ROW.ssync_data);
    expect(book!.id).toBe(SHARED_ROW.id);
  });

  test("a code no link has resolves to nothing, without a second look", async () => {
    const { client, calls } = stubClient({ rpc: { data: [], error: null } });
    expect(await resolveShareCode(CODE_128, client)).toBeNull();
    expect(calls.map((c) => c.op)).toEqual(["rpc"]);
  });

  test("a 64-bit code from before T02 still goes to the cloud (no length check)", async () => {
    const { client, calls } = stubClient({ rpc: { data: [SHARED_ROW], error: null } });
    const book = await resolveShareCode(CODE_64, client);
    expect(calls[0].args).toEqual(["storybook_by_share_code", { code: CODE_64 }]);
    expect(book?.title).toBe(SHARED_ROW.title);
  });
});

/* ------------------------------------------- 2 · until migration 003 lands */

test.describe("share lookup · before migration 003 is applied", () => {
  for (const notFound of [
    {
      code: "PGRST202",
      message:
        "Could not find the function public.storybook_by_share_code(code) in the schema cache",
      status: 404,
    },
    { code: "42883", message: "function public.storybook_by_share_code(text) does not exist" },
  ]) {
    test(`"function not found" (${notFound.code}) falls back to the exact-match select`, async () => {
      const { client, calls } = stubClient({
        rpc: { data: null, error: notFound },
        shared_links: { data: { storybook_id: SHARED_ROW.id }, error: null },
        storybooks: { data: SHARED_ROW, error: null },
      });

      const book = await resolveShareCode(CODE_128, client);

      expect(calls[0].op).toBe("rpc");
      expect(fromCalls(calls)).toEqual(["shared_links", "storybooks"]);
      // The link is found by its exact code …
      expect(calls).toContainEqual({ op: "eq", args: ["shared_links", "share_code", CODE_128] });
      // … and the story by the id that one link names. Nothing is listed.
      expect(calls).toContainEqual({ op: "eq", args: ["storybooks", "id", SHARED_ROW.id] });
      const eqs = calls.filter((c) => c.op === "eq");
      expect(eqs).toHaveLength(2);
      expect(book?.title).toBe(SHARED_ROW.title);
      expect(book?.ssyncData).toEqual(SHARED_ROW.ssync_data);
    });
  }

  test("the fallback finds no link: nothing, and the stories are never asked", async () => {
    const { client, calls } = stubClient({
      rpc: { data: null, error: { code: "PGRST202", message: "Could not find the function", status: 404 } },
      shared_links: { data: null, error: null },
    });
    expect(await resolveShareCode(CODE_128, client)).toBeNull();
    expect(fromCalls(calls)).toEqual(["shared_links"]);
  });

  test("the fallback's own failure is reported, not swallowed", async () => {
    const { client } = stubClient({
      rpc: { data: null, error: { code: "PGRST202", message: "Could not find the function", status: 404 } },
      shared_links: { data: null, error: { message: "TypeError: Failed to fetch", name: "TypeError" } },
    });
    const failure = await resolveShareCode(CODE_128, client).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(CloudError);
    expect((failure as CloudError).kind).toBe("network");
  });
});

/* ----------------------------------------- 3 · other errors: no fallback */

test.describe("share lookup · any other RPC error is the cloud's answer", () => {
  for (const [kind, error] of [
    ["permission", { code: "42501", message: "permission denied for function storybook_by_share_code" }],
    ["network", { message: "TypeError: Failed to fetch", name: "TypeError" }],
    ["auth", { code: "PGRST301", message: "JWT expired", status: 401 }],
    ["unknown", { code: "XX000", message: "internal error" }],
  ] as const) {
    test(`a ${kind} error is reported as a CloudError and the select is never tried`, async () => {
      const { client, calls } = stubClient({ rpc: { data: null, error } });
      const failure = await resolveShareCode(CODE_128, client).catch((err: unknown) => err);
      expect(failure).toBeInstanceOf(CloudError);
      expect((failure as CloudError).kind).toBe(kind);
      expect(calls.map((c) => c.op)).toEqual(["rpc"]);
    });
  }
});

/* ------------------------------------------------- 4 · no network for junk */

test.describe("share lookup · a code that cannot be one never leaves the device", () => {
  for (const code of [
    "",
    " ",
    "not-a-code",
    "3F9C2A7BE41D0C58", // codes are minted lowercase; an exact match can never hit
    `${CODE_64} `,
    "0b7f6c3e-2a1d-4e59-8c70-9f4e3d2b1a60", // a story id is not a link
    "g".repeat(32),
    "*",
    "%",
    "c41e9a07,share_code.neq.x",
    "c41e9a07') or true --",
  ]) {
    test(`${JSON.stringify(code)} resolves to nothing with no call at all`, async () => {
      const { client, calls } = stubClient({});
      expect(await resolveShareCode(code, client)).toBeNull();
      expect(calls).toEqual([]);
    });
  }
});

/* ------------------------------------------------------- 5 · migration 003 */

/** The SQL with comments stripped, so assertions read statements only. */
function statements(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

test.describe("share lookup · migration 003", () => {
  test("adds the by-code function: SECURITY DEFINER, STABLE, search_path pinned, exact match", () => {
    expect(fs.existsSync(MIGRATION_003), "supabase/migrations/003_share_lookup_by_code.sql").toBe(true);
    const sql = statements(fs.readFileSync(MIGRATION_003, "utf8"));

    const fn = sql.match(
      /CREATE OR REPLACE FUNCTION public\.storybook_by_share_code\(\s*code text\s*\)([\s\S]*?)\$\$([\s\S]*?)\$\$/i,
    );
    expect(fn, "CREATE OR REPLACE FUNCTION public.storybook_by_share_code(code text) … AS $$ … $$").not.toBeNull();
    const [, head, body] = fn!;

    expect(head).toMatch(/\bSECURITY DEFINER\b/i);
    expect(head).toMatch(/\bSTABLE\b/i);
    expect(head).toMatch(/\bSET search_path = public\b/i);
    // NULL in, nothing out.
    expect(head).toMatch(/\bSTRICT\b/i);

    // Only the Reader's columns: no owner, no visibility flags, no counters.
    const returns = head.match(/RETURNS TABLE\s*\(([\s\S]*?)\)\s*\n/i);
    expect(returns, "RETURNS TABLE (…)").not.toBeNull();
    const columns = returns![1]
      .split(",")
      .map((c) => c.trim().split(/\s+/)[0])
      .filter(Boolean);
    expect(columns).toContain("ssync_data");
    for (const hidden of ["user_id", "is_public", "is_premium", "view_count", "views", "updated_at"]) {
      expect(columns, `the function must not return ${hidden}`).not.toContain(hidden);
    }

    // One code, exactly: an equality on share_code, never a pattern or a prefix.
    expect(body).toMatch(/\bshare_code\s*=\s*storybook_by_share_code\.code\b/i);
    expect(body).not.toMatch(/\b(LIKE|ILIKE|SIMILAR TO)\b|~|starts_with|left\(|substr/i);
    // A published story only: the link opens what the owner published, as today.
    expect(body).toMatch(/\bis_public\b/i);
  });

  test("lets anon and authenticated call it", () => {
    const sql = statements(fs.readFileSync(MIGRATION_003, "utf8"));
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.storybook_by_share_code\(text\) TO anon,\s*authenticated;/i,
    );
  });

  test("drops the three broad read policies and keeps every owner policy", () => {
    const sql = statements(fs.readFileSync(MIGRATION_003, "utf8"));
    const drops = [...sql.matchAll(/\bDROP\s+(\w+)\b[^;]*;/gi)].map((m) => m[0].replace(/\s+/g, " "));
    expect(drops.sort()).toEqual(
      [
        'DROP POLICY IF EXISTS "Anyone reads public storybooks" ON public.storybooks;',
        'DROP POLICY IF EXISTS "Anyone reads shared links" ON public.shared_links;',
        'DROP POLICY IF EXISTS "Public media readable" ON public.page_media;',
      ].sort(),
    );

    // Every owner policy 001 created is still there: none is dropped or altered.
    const owner = [...fs.readFileSync(MIGRATION_001, "utf8").matchAll(/CREATE POLICY "(Users [^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(owner).toEqual(
      expect.arrayContaining([
        "Users manage own storybooks",
        "Users manage own media",
        "Users manage own links",
      ]),
    );
    for (const name of owner) expect(sql).not.toContain(`"${name}"`);
    expect(sql).not.toMatch(/\bALTER\s+POLICY\b/i);
    expect(sql).not.toMatch(/\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i);
  });

  test("changes no data and no table; the header says who applies it and what it changes", () => {
    const raw = fs.readFileSync(MIGRATION_003, "utf8");
    // Not one word that could write, rewrite, remove or empty a row — in the
    // statements or in the comments.
    for (const word of ["UPDATE", "DELETE", "TRUNCATE", "INSERT"]) {
      expect(raw, `003 must not contain ${word}`).not.toMatch(new RegExp(`\\b${word}\\b`, "i"));
    }
    expect(raw).not.toMatch(/\bDROP\s+(TABLE|SCHEMA|FUNCTION|COLUMN)\b/i);
    expect(raw).not.toMatch(/\bALTER\s+TABLE\b/i);

    const header = raw
      .split("\n")
      .filter((line) => line.startsWith("--"))
      .join("\n");
    expect(header).toContain("Jon");
    expect(header).toMatch(/production/i);
    expect(header).toContain("storybook_by_share_code");
    expect(header).toContain("Anyone reads shared links");
    expect(header).toContain("Anyone reads public storybooks");
    // The app works before and after: it says so.
    expect(header).toMatch(/PGRST202/);
  });
});

/* ---------------------------------------------- 6 · nothing in src/ lists */

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx?|jsx?|mjs|cjs)$/.test(entry.name) ? [full] : [];
  });
}

/** Every query chain on `table` in src/: from `.from("table")` to the end of its statement. */
function chainsOn(table: string): Array<{ file: string; chain: string }> {
  const opener = new RegExp(`\\.from\\(\\s*["'\`]${table}["'\`]\\s*\\)`, "g");
  return sourceFiles(SRC_DIR).flatMap((file) => {
    const text = fs.readFileSync(file, "utf8");
    return [...text.matchAll(opener)].map((m) => {
      const start = m.index!;
      const end = text.indexOf(";", start);
      return {
        file: path.relative(REPO_ROOT, file),
        chain: text.slice(start, end < 0 ? undefined : end).replace(/\s+/g, " "),
      };
    });
  });
}

/** A read: it selects, and it is not the RETURNING half of a write. */
const isRead = (chain: string) => /\.select\(/.test(chain) && !/\.(insert|update|upsert|delete)\(/.test(chain);

test.describe("share lookup · nothing in src/ lists links or stories", () => {
  test("shared_links is read only by one exact code", () => {
    const reads = chainsOn("shared_links").filter((c) => isRead(c.chain));
    // Not vacuous: the pre-003 fallback is the one read there is.
    expect(reads.length, "the legacy by-code select").toBeGreaterThan(0);
    for (const { file, chain } of reads) {
      expect(chain, `${file}: a shared_links read must name one code`).toMatch(
        /\.eq\(\s*["']share_code["']\s*,\s*code\s*\)/,
      );
      expect(chain, `${file}: one row, never a list`).toMatch(/\.(maybeSingle|single)\(\)/);
    }
  });

  test("storybooks is read only as the owner's own rows or the one story a link names", () => {
    const reads = chainsOn("storybooks").filter((c) => isRead(c.chain));
    expect(reads.length).toBeGreaterThan(0);
    for (const { file, chain } of reads) {
      const owner = /\.eq\(\s*["']user_id["']/.test(chain);
      const oneStory = /\.eq\(\s*["']id["']/.test(chain) && /\.(maybeSingle|single)\(\)/.test(chain);
      expect(owner || oneStory, `${file}: ${chain}`).toBe(true);
      expect(chain, `${file}: never filtered to "every public story"`).not.toMatch(/is_public/);
    }
  });

  test("the shared read goes through the by-code function first", () => {
    const source = fs.readFileSync(SUPABASE, "utf8");
    expect(source).toMatch(/\.rpc\(\s*["']storybook_by_share_code["']\s*,\s*\{\s*code\s*\}\s*\)/);
    // No other RPC, and no other way in.
    const rpcs = [...source.matchAll(/\.rpc\(\s*["']([^"']+)["']/g)].map((m) => m[1]);
    expect(rpcs).toEqual(["storybook_by_share_code"]);
  });
});
