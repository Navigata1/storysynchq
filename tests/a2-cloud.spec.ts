/**
 * C3b and C4's judge (mission P1): production's cloud, end to end.
 *
 * Collected only under ops/mission/gates/cloud_e2e.sh. That gate runs it only when the
 * operator has set A2_CLOUD_E2E=1 and production's public Supabase URL and anon key, and it
 * runs against a production build of HEAD. The spec also needs a grown-up test account the
 * operator made for it, A2_CLOUD_EMAIL and A2_CLOUD_PASSWORD, which are never printed.
 * Without that account every test fails rather than pass on nothing. It writes one test tape
 * to production and deletes it again, whatever else fails.
 *
 *   setup  sign in as the test account and publish one tape the way the app does: a public
 *          storybook row, its 128-bit share link (shareLinkRow) and one page_media row
 *   C3b    as the anonymous visitor, with only the shipped anon key, listing storybooks,
 *          shared_links or page_media returns nothing, not even that public tape: a story is
 *          reached by its code alone (PRIVACY.md rule 4; migration 003)
 *   C4     the link opens the tape in a fresh browser context with no account; once the tape
 *          is deleted, the same link opens nothing
 *
 * Test titles are the exact keys judges/required-P1-cloud.json requires.
 */

import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { shareLinkRow } from "../src/lib/share-code";
import { REPO_ROOT } from "./fixtures/tapes";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const EMAIL = process.env.A2_CLOUD_EMAIL ?? "";
const PASSWORD = process.env.A2_CLOUD_PASSWORD ?? "";
const HOUSE_TAPE = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "public", "demo", "brave-little-star.ssync.json"), "utf8"),
);
const TITLE = `A2 cloud check ${new Date().toISOString()}`;

test.describe.configure({ mode: "serial" });

let owner: SupabaseClient;
let storyId = "";
let code = "";

test.beforeAll(async () => {
  expect(URL_ && ANON, "production's public Supabase URL and anon key").toBeTruthy();
  expect(EMAIL && PASSWORD, "the operator's test account (A2_CLOUD_EMAIL, A2_CLOUD_PASSWORD)").toBeTruthy();
  owner = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: auth, error: authError } = await owner.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  expect(authError, "the test account signs in").toBeNull();
  const userId = auth.user!.id;

  const { data: story, error } = await owner
    .from("storybooks")
    .insert({
      user_id: userId,
      title: TITLE,
      author: "A2 mission",
      description: "",
      page_count: HOUSE_TAPE.pages.length,
      is_public: true,
      ssync_data: { ...HOUSE_TAPE, metadata: { ...HOUSE_TAPE.metadata, title: TITLE } },
    })
    .select("id")
    .single();
  expect(error, "the owner can publish a tape").toBeNull();
  storyId = (story as { id: string }).id;

  const link = shareLinkRow(storyId);
  const { error: linkError } = await owner.from("shared_links").insert(link);
  expect(linkError, "the owner can mint its link").toBeNull();
  code = link.share_code;

  const { error: mediaError } = await owner
    .from("page_media")
    .insert({ storybook_id: storyId, page_id: 1, media_type: "illustration", file_url: "assets/a2-check.png" });
  expect(mediaError, "the owner can record its media row").toBeNull();
});

test.afterAll(async () => {
  // never leave the test tape behind, whatever failed (page_media goes with it, ON DELETE CASCADE)
  if (owner && storyId) {
    await owner.from("shared_links").delete().eq("storybook_id", storyId);
    await owner.from("storybooks").delete().eq("id", storyId);
  }
  await owner?.auth.signOut();
});

/** What the anonymous visitor gets when it asks PostgREST for every row of `table`. */
async function anonList(table: string): Promise<{ status: number; rows: unknown[] }> {
  const res = await fetch(`${URL_.replace(/\/+$/, "")}/rest/v1/${table}?select=*`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  const body: unknown = await res.json().catch(() => null);
  return { status: res.status, rows: Array.isArray(body) ? body : [] };
}

test.describe("anon listing refused", () => {
  test("storybooks", async () => {
    const { status, rows } = await anonList("storybooks");
    expect([200, 401, 403]).toContain(status);
    expect(rows, "no story is listed to the anonymous visitor, not even a public one").toEqual([]);
  });

  test("shared_links", async () => {
    const { status, rows } = await anonList("shared_links");
    expect([200, 401, 403]).toContain(status);
    expect(rows, "no share code is listed").toEqual([]);
    expect(JSON.stringify(rows)).not.toContain(code);
  });

  test("page_media", async () => {
    const { status, rows } = await anonList("page_media");
    expect([200, 401, 403]).toContain(status);
    expect(rows, "no child's media row is listed").toEqual([]);
  });
});

test.describe("cloud link", () => {
  test("a published link opens in a fresh context with no account", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`/read?story=${code}`);
    await expect(page.locator(".pl-root")).toHaveAttribute("data-view", "cover", { timeout: 30000 });
    await expect(page.getByText(TITLE).first()).toBeVisible();
    await context.close();
  });

  test("a deleted tape's link opens nothing", async ({ browser }) => {
    await owner.from("shared_links").delete().eq("storybook_id", storyId);
    const { error } = await owner.from("storybooks").delete().eq("id", storyId);
    expect(error, "the owner can delete the tape").toBeNull();
    storyId = "";
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`/read?story=${code}`);
    await expect(page.getByText("We couldn't find that tape")).toBeVisible({ timeout: 30000 });
    await context.close();
  });
});
