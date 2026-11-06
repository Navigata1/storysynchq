/**
 * C3b and C4's judge (archipelago-2 P1): production's cloud library, end to end.
 *
 *   anon listing refused  — with the anon key every browser ships, nobody can list the three
 *                           tables that hold a child's data (C3b, migration 003). A probe story,
 *                           published and linked by the test account, is in each table; its
 *                           owner sees it, the anonymous visitor sees nothing, and its code
 *                           still opens it through the one door 003 leaves (the by-code function).
 *   cloud link            — a tape published from the Studio, signed in on the publish card,
 *                           opens from its link in a fresh browser context with no account
 *                           (C4); and the one-tap delete revokes that link everywhere.
 *
 * This touches production, so it runs only under ops/mission/gates/cloud_e2e.sh, which the
 * operator authorises: A2_CLOUD_E2E=1, production's NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_ANON_KEY (baked into the build it serves), and a grown-up account kept
 * for this gate alone (A2_CLOUD_EMAIL, A2_CLOUD_PASSWORD). playwright.config.ts does not
 * collect it otherwise. Everything the run writes is deleted again: by the tests themselves,
 * and by the cleanup after them, which removes every story the account made during the run.
 * The required test keys are fixed by ops/mission/judges/required-P1-cloud.json.
 */

import { randomBytes } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { restoreDraft, seedStudioDraft } from "./fixtures/helpers";
import { GOODNIGHT_MIA } from "./fixtures/tapes";

const URL_ = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const EMAIL = process.env.A2_CLOUD_EMAIL ?? "";
const PASSWORD = process.env.A2_CLOUD_PASSWORD ?? "";

/** Rows this worker may have written start no earlier than this (a margin for clock skew). */
const SINCE = new Date(Date.now() - 10 * 60 * 1000).toISOString();

interface Reply {
  status: number;
  body: unknown;
}

interface Session {
  token: string;
  userId: string;
}

/** One PostgREST call as `token` (the anon key, or a signed-in user's access token). */
async function rest(path: string, token: string, init: RequestInit = {}): Promise<Reply> {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

/** The rows a call returned; fails on anything but a 2xx carrying a list. */
function rows(reply: Reply, what: string): Record<string, unknown>[] {
  expect(reply.status, `${what}: ${JSON.stringify(reply.body).slice(0, 200)}`).toBeLessThan(300);
  expect(Array.isArray(reply.body), `${what} answers a list`).toBe(true);
  return reply.body as Record<string, unknown>[];
}

/**
 * What the anonymous visitor gets from a select: an empty list (row-level security left
 * nothing visible) or a refusal (no grant). Either is "refused". A row is never acceptable,
 * and any other failure (a missing table, a server error) fails the test rather than pass it.
 */
async function anonSelect(path: string): Promise<Record<string, unknown>[]> {
  const reply = await rest(path, ANON);
  const code = (reply.body as { code?: string } | null)?.code;
  if (reply.status === 401 || reply.status === 403 || code === "42501") return [];
  return rows(reply, `anon GET ${path}`);
}

/** Sign the gate's grown-up account in over Supabase Auth's REST endpoint. */
async function signIn(): Promise<Session> {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; user?: { id?: string } };
  expect(res.status, "the gate's test account signs in (A2_CLOUD_EMAIL, A2_CLOUD_PASSWORD)").toBe(200);
  expect(body.access_token && body.user?.id, "sign-in returns a session").toBeTruthy();
  return { token: body.access_token!, userId: body.user!.id! };
}

/** Insert one row as the owner and return it. */
async function insert(table: string, row: object, owner: Session): Promise<Record<string, unknown>> {
  const reply = await rest(table, owner.token, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  const out = rows(reply, `owner INSERT ${table}`);
  expect(out, `one ${table} row written`).toHaveLength(1);
  return out[0];
}

let owner: Session;
const probe = { storybookId: "", code: "", title: "" };

test.beforeAll(async () => {
  for (const [name, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: URL_,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
    A2_CLOUD_EMAIL: EMAIL,
    A2_CLOUD_PASSWORD: PASSWORD,
  })) {
    expect(value, `${name} is set for the cloud run`).not.toBe("");
  }
  owner = await signIn();

  // The probe: a published (public) story, its link and one media row, written the way the
  // app writes them, so each table holds a row 001's broad read policies would have listed.
  probe.title = `a2-cloud probe ${randomBytes(4).toString("hex")}`;
  probe.code = randomBytes(16).toString("hex");
  const story = await insert(
    "storybooks",
    {
      user_id: owner.userId,
      title: probe.title,
      page_count: 0,
      is_public: true,
      ssync_data: { version: "2.0", metadata: { title: probe.title, language: "en" }, pages: [] },
    },
    owner,
  );
  probe.storybookId = String(story.id);
  await insert("shared_links", { storybook_id: probe.storybookId, share_code: probe.code }, owner);
  await insert(
    "page_media",
    { storybook_id: probe.storybookId, page_id: 1, media_type: "illustration", file_url: "a2-cloud-probe" },
    owner,
  );
});

test.afterAll(async () => {
  if (!owner) return;
  // Everything this account made during the run goes; its links and media follow by cascade.
  const reply = await rest(
    `storybooks?user_id=eq.${owner.userId}&created_at=gte.${encodeURIComponent(SINCE)}`,
    owner.token,
    { method: "DELETE" },
  );
  expect(reply.status, "the run's stories are deleted again").toBeLessThan(300);
});

test.describe("anon listing refused", () => {
  test("storybooks", async () => {
    const mine = rows(await rest(`storybooks?select=id&id=eq.${probe.storybookId}`, owner.token), "owner");
    expect(mine, "the owner sees the published probe story, so it is there to be listed").toHaveLength(1);

    expect(await anonSelect("storybooks?select=id,title&limit=100"), "anon lists no storybook").toEqual([]);
    expect(
      await anonSelect(`storybooks?select=id&is_public=eq.true&limit=100`),
      "anon lists no published storybook",
    ).toEqual([]);
    expect(
      await anonSelect(`storybooks?select=id,ssync_data&id=eq.${probe.storybookId}`),
      "anon cannot read the probe story by its id",
    ).toEqual([]);
  });

  test("shared_links", async () => {
    const mine = rows(
      await rest(`shared_links?select=share_code&storybook_id=eq.${probe.storybookId}`, owner.token),
      "owner",
    );
    expect(mine.map((r) => r.share_code), "the owner sees the probe's link").toEqual([probe.code]);

    expect(await anonSelect("shared_links?select=share_code&limit=100"), "anon lists no share code").toEqual([]);
    expect(
      await anonSelect(`shared_links?select=share_code&storybook_id=eq.${probe.storybookId}`),
      "anon cannot read a story's code by its id",
    ).toEqual([]);
    expect(
      await anonSelect(`shared_links?select=storybook_id&share_code=eq.${probe.code}`),
      "even holding the code, the table itself stays closed",
    ).toEqual([]);

    // The one door 003 leaves: the by-code function opens exactly the coded story, with the
    // Reader's columns and no owner.
    const opened = rows(
      await rest("rpc/storybook_by_share_code", ANON, { method: "POST", body: JSON.stringify({ code: probe.code }) }),
      "anon storybook_by_share_code",
    );
    expect(opened.map((r) => r.id), "the code opens its story").toEqual([probe.storybookId]);
    expect(opened[0], "the owner never travels with a shared story").not.toHaveProperty("user_id");
    const prefix = rows(
      await rest("rpc/storybook_by_share_code", ANON, {
        method: "POST",
        body: JSON.stringify({ code: probe.code.slice(0, 16) }),
      }),
      "anon storybook_by_share_code (prefix)",
    );
    expect(prefix, "a prefix of the code opens nothing").toEqual([]);
  });

  test("page_media", async () => {
    const mine = rows(await rest(`page_media?select=id&storybook_id=eq.${probe.storybookId}`, owner.token), "owner");
    expect(mine, "the owner sees the probe's media row").toHaveLength(1);

    expect(await anonSelect("page_media?select=id,file_url&limit=100"), "anon lists no media").toEqual([]);
    expect(
      await anonSelect(`page_media?select=id&storybook_id=eq.${probe.storybookId}`),
      "anon cannot read a published story's media",
    ).toEqual([]);
  });
});

interface Published {
  shareUrl: string;
  storybookId: string;
}

/**
 * Publish Goodnight, Mia from the Studio as a grown-up would with the cloud configured and
 * nobody signed in: the gate, the honest "saved on this device, no link yet" card, then
 * sign in on the card and make the private link. Returns the link and the cloud row it names.
 */
async function publishToCloud(page: Page): Promise<Published> {
  await seedStudioDraft(page, "goodnight-mia");
  await page.goto("/studio");
  await restoreDraft(page);
  await page.getByRole("button", { name: "Finish my story" }).click();
  await expect(page.getByRole("dialog", { name: "A grown-up moment" })).toBeVisible({ timeout: 15000 });
  const question = page.locator('label[for="studio-gate-answer"]');
  await expect(question).toContainText(/\d+\s*[×x*]\s*\d+/);
  const [, a, b] = (await question.innerText()).match(/(\d+)\s*[×x*]\s*(\d+)/)!;
  await page.locator("#studio-gate-answer").fill(String(Number(a) * Number(b)));
  await page.locator("#studio-gate-author").fill(GOODNIGHT_MIA.byline);
  await page.locator("#studio-gate-consent").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your tape is ready" })).toBeVisible({ timeout: 60000 });

  const card = page.locator('[data-studio="publish-overlay"]');
  await expect(card.getByText(/Nobody is signed in, so there is no link yet/)).toBeVisible();
  await card.locator("#pub-auth-email").fill(EMAIL);
  await card.locator("#pub-auth-password").fill(PASSWORD);
  await card.getByRole("button", { name: /Sign in and get my link/ }).click();
  await card.getByRole("button", { name: /Make my private link/ }).click({ timeout: 20000 });

  const shareInput = card.locator('[data-studio="share-url"]');
  await expect(shareInput).toBeVisible({ timeout: 30000 });
  const shareUrl = await shareInput.inputValue();
  expect(shareUrl).toMatch(/\/read\?story=[0-9a-f]{32}$/);
  const code = shareUrl.split("story=")[1];

  // The link names a row in production's cloud library, owned by the account that signed in.
  const link = rows(await rest(`shared_links?select=storybook_id&share_code=eq.${code}`, owner.token), "owner");
  expect(link, "the link is in the cloud library, not only on this device").toHaveLength(1);
  return { shareUrl, storybookId: String(link[0].storybook_id) };
}

/** Open a link in a new browser context: no storage, no session, no account. */
async function openFresh(browser: Browser, url: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const bearers = new Set<string>();
  page.on("request", (req) => {
    if (req.url().startsWith(URL_)) bearers.add(req.headers()["authorization"] ?? "");
  });
  await page.goto(url);
  return { context, page, bearers };
}

test.describe("cloud link", () => {
  test.setTimeout(150000);

  test("a published link opens in a fresh context with no account", async ({ page, browser }) => {
    const published = await publishToCloud(page);

    const fresh = await openFresh(browser, published.shareUrl);
    try {
      const root = fresh.page.locator(".pl-root");
      await expect(root, "the tape opens on its cover").toHaveAttribute("data-view", "cover", { timeout: 30000 });
      await expect(root).toContainText(GOODNIGHT_MIA.title);
      const stored = await fresh.page.evaluate(() =>
        Object.keys(localStorage).filter((k) => k === "ssync-library" || /^sb-.*-auth-token$/.test(k)),
      );
      expect(stored, "the visitor has no library and no session").toEqual([]);
      expect(
        [...fresh.bearers].filter((b) => b !== ""),
        "every cloud call went as the anonymous visitor, never as a signed-in user",
      ).toEqual([`Bearer ${ANON}`]);

      await fresh.page.getByRole("button", { name: /Tap to Begin/ }).click();
      await expect(root).toHaveAttribute("data-view", "page");
      const picture = root.locator('img[alt="Picture for page 1"]').locator("visible=true").first();
      await expect(picture).toBeVisible();
      await expect
        .poll(() => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), {
          message: "the page's picture came with the tape",
          timeout: 15000,
        })
        .toBe(true);
    } finally {
      await fresh.context.close();
    }
  });

  test("deleting the story revokes the link", async ({ page, browser }) => {
    const published = await publishToCloud(page);

    // One tap, armed by a second: the Studio's "Pull the tape out — delete everything".
    const card = page.locator('[data-studio="publish-overlay"]');
    await card.getByRole("button", { name: /Pull the tape out — delete everything/ }).click();
    await page.getByRole("button", { name: /Tap again to delete everything/ }).click();
    await expect(page.locator('[data-studio="publish-overlay"]')).toHaveCount(0, { timeout: 30000 });

    await expect
      .poll(
        async () =>
          rows(await rest(`storybooks?select=id&id=eq.${published.storybookId}`, owner.token), "owner").length,
        { message: "the cloud row is gone", timeout: 20000 },
      )
      .toBe(0);

    const fresh = await openFresh(browser, published.shareUrl);
    try {
      await expect(fresh.page.getByText("We couldn't find that tape")).toBeVisible({ timeout: 30000 });
      await expect(fresh.page.locator(".pl-root")).toHaveCount(0);
    } finally {
      await fresh.context.close();
    }
  });
});
