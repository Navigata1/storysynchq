// Measures first-load JavaScript per route on a running production server (C7).
//
// For each route a fresh browser context opens the page and waits until it is ready (the
// network settles; on a Player route, the tape's cover is on screen too), then sums the gzip
// size (zlib level 9, what a CDN serves) of every same-origin script the page requested to get
// there, lazy chunks it loads on mount included (P4-R1-01, P4-R1-04). Next.js's route prefetch
// for links on the page (requests carrying `next-router-prefetch`) is aborted: it fetches other
// routes' code, which is not this page's first load; and the browser has no IntersectionObserver,
// which is what starts that prefetch for links on screen (in this app it otherwise only plays the
// landing's reveal animations, which then show at once). A share link is measured as a grandparent
// opens one: the cloud it asks (js_budget.py builds with a placeholder project, CLOUD below) is
// answered with the house tape. Prints one JSON object:
// {route: {gzipBytes, rawBytes, scripts, top}}.
//
// Usage: node ops/mission/gates/js_measure.mjs [baseUrl]   (default http://localhost:3000)
import { chromium } from "playwright";
import { gzipSync } from "node:zlib";
import { existsSync, readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
/** The placeholder cloud project js_budget.py builds with (no real project is ever asked). */
const CLOUD = "https://a2-placeholder.supabase.co";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, OPTIONS" };
const SHARE_CODE = "a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2";
const HOUSE_TAPE = JSON.parse(readFileSync(new URL("../../../public/demo/brave-little-star.ssync.json", import.meta.url), "utf8"));
/** What migration 003's by-code function returns for SHARE_CODE: the house tape, as shared. */
const SHARED_ROW = {
  id: "00000000-0000-4000-8000-0000000000a2",
  title: HOUSE_TAPE.metadata?.title ?? "",
  author: HOUSE_TAPE.metadata?.author ?? "",
  genre: "",
  age_range: "",
  page_count: HOUSE_TAPE.pages?.length ?? 0,
  description: "",
  cover_image_url: null,
  created_at: "2026-11-01T00:00:00.000Z",
  ssync_data: HOUSE_TAPE,
};
const ROUTES = [
  { route: "/" },
  { route: "/read" },
  // the Player, as a share link or the landing's "Press play" opens it: the demo tape's cover
  { route: "/read?demo=1", ready: '.pl-root[data-view="cover"]' },
  // the Player a share link opens, its tape fetched from the cloud by its code
  { route: `/read?story=${SHARE_CODE}`, ready: '.pl-root[data-view="cover"]' },
  { route: "/studio" },
  { route: "/protocol" },
];

const exe = "/opt/pw-browsers/chromium";
const browser = await chromium.launch(existsSync(exe) ? { executablePath: exe } : {});
const out = {};
for (const { route, ready } of ROUTES) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    delete window.IntersectionObserver;
  });
  await page.route("**/*", (r) => {
    const url = r.request().url();
    if (url.startsWith(`${CLOUD}/rest/v1/rpc/storybook_by_share_code`)) {
      return r.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify([SHARED_ROW]) });
    }
    if (url.startsWith(CLOUD)) return r.fulfill({ status: 404, headers: CORS, contentType: "application/json", body: "{}" });
    return r.request().headers()["next-router-prefetch"] ? r.abort() : r.continue();
  });
  const requested = [];
  page.on("request", (req) => {
    if (req.resourceType() === "script" && req.url().startsWith(BASE)) requested.push(req);
  });
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  if (ready) await page.locator(ready).waitFor({ timeout: 30000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  const files = [];
  for (const req of requested) {
    const res = await req.response();
    if (!res) continue;
    try {
      const body = await res.body();
      files.push({ url: new URL(res.url()).pathname, raw: body.length, gzip: gzipSync(body, { level: 9 }).length });
    } catch {
      /* a redirect has no body */
    }
  }
  out[route] = {
    gzipBytes: files.reduce((n, f) => n + f.gzip, 0),
    rawBytes: files.reduce((n, f) => n + f.raw, 0),
    scripts: files.length,
    top: files.sort((a, b) => b.gzip - a.gzip).slice(0, 5).map((f) => `${f.url.split("/").pop()} ${Math.round(f.gzip / 1024)}k`),
  };
  await context.close();
}
await browser.close();
console.log(JSON.stringify(out));
