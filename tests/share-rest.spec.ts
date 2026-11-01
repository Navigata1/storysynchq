// P4 · A share link resolves over plain PostgREST requests, without supabase-js (P4-R2-01).
//
// `restShareClient` (src/lib/share-lookup.ts) is what a production share link resolves through:
// the by-code RPC, then, before migration 003, the two exact-match selects. It must answer the
// way supabase-js does, so the lookup and `resolveShareCode`'s error mapping read it the same.
//
// All Node-side: `fetch` is replaced by a recorder that answers like PostgREST, so these pin
//   1. the RPC request: URL, method, headers (the anon key, never a sign-in) and body
//   2. 404 PGRST202 (003 not applied) falls back to the exact selects, by code then by id
//   3. a PostgREST error keeps its code and HTTP status, so 401 is an "auth" CloudError and a
//      non-JSON error body still fails as itself
//   4. a network failure (a TypeError from fetch) is a "network" CloudError
//   5. two rows for one code or id are refused (PGRST116), never one picked

import { test, expect } from "@playwright/test";
import { CloudError, resolveShareCode } from "../src/lib/cloud-storage";
import { getStorybookByShareCode, restShareClient } from "../src/lib/share-lookup";

const URL_ = "https://a2-test.supabase.co";
const ANON = "a2-test-anon-key";
const CODE = "0123456789abcdef0123456789abcdef";
const STORY_ID = "0b7f6c3e-2a1d-4e59-8c70-9f4e3d2b1a60";

const ROW = {
  id: STORY_ID,
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

interface Call {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Answer = { status: number; body: string } | Error;
const json = (status: number, body: unknown): Answer => ({ status, body: JSON.stringify(body) });

/** Replace `fetch` for one test: each request is recorded and answered by `answer`. */
function fakeFetch(answer: (call: Call) => Answer) {
  const calls: Call[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const call: Call = {
      url: new URL(String(input)),
      method: init?.method ?? "GET",
      headers: { ...(init?.headers as Record<string, string>) },
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const a = answer(call);
    if (a instanceof Error) throw a;
    return new Response(a.body, { status: a.status });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = real) };
}

const client = () => restShareClient(URL_, ANON);
const isRpc = (c: Call) => c.url.pathname === "/rest/v1/rpc/storybook_by_share_code";

test.describe("share link · restShareClient answers like supabase-js", () => {
  test("the by-code RPC: one POST, the anon key, the code as its body", async () => {
    const f = fakeFetch(() => json(200, [ROW]));
    try {
      const row = await getStorybookByShareCode(CODE, client());
      expect(row).toEqual(ROW);
      expect(f.calls).toHaveLength(1);
      const [call] = f.calls;
      expect(call.url.origin + call.url.pathname).toBe(`${URL_}/rest/v1/rpc/storybook_by_share_code`);
      expect(call.method).toBe("POST");
      expect(call.headers).toEqual({
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        "Content-Type": "application/json",
      });
      expect(call.body).toEqual({ code: CODE });
    } finally {
      f.restore();
    }
  });

  test("no row for the code is null, with no second request", async () => {
    const f = fakeFetch(() => json(200, []));
    try {
      expect(await getStorybookByShareCode(CODE, client())).toBeNull();
      expect(f.calls).toHaveLength(1);
    } finally {
      f.restore();
    }
  });

  test("404 PGRST202 (migration 003 not applied) falls back to the exact selects", async () => {
    const f = fakeFetch((c) => {
      if (isRpc(c)) return json(404, { code: "PGRST202", message: "Could not find the function" });
      if (c.url.pathname === "/rest/v1/shared_links") return json(200, [{ storybook_id: STORY_ID }]);
      if (c.url.pathname === "/rest/v1/storybooks") return json(200, [ROW]);
      return json(500, {});
    });
    try {
      expect(await getStorybookByShareCode(CODE, client())).toEqual(ROW);
      expect(f.calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
        "POST /rest/v1/rpc/storybook_by_share_code",
        "GET /rest/v1/shared_links",
        "GET /rest/v1/storybooks",
      ]);
      const [, link, story] = f.calls;
      // one exact code, then the one story it names: never a list
      expect(Object.fromEntries(link.url.searchParams)).toEqual({ select: "storybook_id", share_code: `eq.${CODE}` });
      expect(story.url.searchParams.get("id")).toBe(`eq.${STORY_ID}`);
      expect(story.url.searchParams.get("select")).toBe(
        "id,title,author,genre,age_range,page_count,description,cover_image_url,created_at,ssync_data",
      );
      for (const c of f.calls) expect(c.headers.Authorization).toBe(`Bearer ${ANON}`);
    } finally {
      f.restore();
    }
  });

  test("a code with no link before 003 is null, and the stories table is not asked", async () => {
    const f = fakeFetch((c) =>
      isRpc(c) ? json(404, { code: "PGRST202", message: "no function" }) : json(200, []),
    );
    try {
      expect(await getStorybookByShareCode(CODE, client())).toBeNull();
      expect(f.calls.map((c) => c.url.pathname)).toEqual([
        "/rest/v1/rpc/storybook_by_share_code",
        "/rest/v1/shared_links",
      ]);
    } finally {
      f.restore();
    }
  });

  test("two rows for one code are refused (PGRST116), never one picked", async () => {
    const f = fakeFetch((c) =>
      isRpc(c)
        ? json(404, { code: "PGRST202", message: "no function" })
        : json(200, [{ storybook_id: STORY_ID }, { storybook_id: "another" }]),
    );
    try {
      const err = await getStorybookByShareCode(CODE, client()).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toMatchObject({ code: "PGRST116" });
      expect(f.calls).toHaveLength(2);
    } finally {
      f.restore();
    }
  });
});

test.describe("share link · resolveShareCode names what went wrong", () => {
  test("401 is an auth CloudError (the code and status survive the REST client)", async () => {
    const f = fakeFetch(() => json(401, { code: "PGRST301", message: "JWT expired" }));
    try {
      const err = await resolveShareCode(CODE, client()).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(CloudError);
      expect((err as CloudError).kind).toBe("auth");
      expect(f.calls).toHaveLength(1);
    } finally {
      f.restore();
    }
  });

  test("an RPC failure other than 'no such function' does not fall back", async () => {
    const f = fakeFetch(() => json(500, { code: "XX000", message: "internal error" }));
    try {
      const err = await resolveShareCode(CODE, client()).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(CloudError);
      expect(f.calls).toHaveLength(1);
    } finally {
      f.restore();
    }
  });

  test("a non-JSON error body still fails, carrying the HTTP status", async () => {
    const f = fakeFetch(() => ({ status: 503, body: "<html>Service Unavailable</html>" }));
    try {
      const raw = await client().rpc("storybook_by_share_code", { code: CODE });
      expect(raw.data).toBeNull();
      expect(raw.error).toMatchObject({ status: 503 });
      const err = await resolveShareCode(CODE, client()).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(CloudError);
    } finally {
      f.restore();
    }
  });

  test("a network failure (fetch throws TypeError) is a network CloudError", async () => {
    const f = fakeFetch(() => new TypeError("Failed to fetch"));
    try {
      const err = await resolveShareCode(CODE, client()).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(CloudError);
      expect((err as CloudError).kind).toBe("network");
    } finally {
      f.restore();
    }
  });

  test("a found row opens as a published book", async () => {
    const f = fakeFetch(() => json(200, [ROW]));
    try {
      const book = await resolveShareCode(CODE, client());
      expect(book?.id).toBe(STORY_ID);
      expect(book?.title).toBe(ROW.title);
      expect(book?.ssyncData).toEqual(ROW.ssync_data);
    } finally {
      f.restore();
    }
  });
});
