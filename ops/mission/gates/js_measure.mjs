// Measures first-load JavaScript per route on a running production server (C7).
// For each route: a fresh browser context loads the page and sums the gzip size (zlib level
// 9, the size a CDN serves) of every same-origin script requested up to the page's load
// event. Prefetches Next.js starts after load for linked routes are not first-load JS and
// are not counted. Prints one JSON object: {route: {gzipBytes, rawBytes, scripts, top}}.
// Usage: node ops/mission/gates/js_measure.mjs [baseUrl]   (default http://localhost:3000)
import { chromium } from "playwright";
import { gzipSync } from "node:zlib";
import { existsSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
export const ROUTES = ["/", "/read", "/studio", "/protocol"];

const exe = "/opt/pw-browsers/chromium";
const browser = await chromium.launch(existsSync(exe) ? { executablePath: exe } : {});
const out = {};
for (const route of ROUTES) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  let loaded = false;
  const requested = [];
  page.on("request", (req) => {
    if (!loaded && req.resourceType() === "script" && req.url().startsWith(BASE)) requested.push(req);
  });
  page.on("load", () => {
    loaded = true;
  });
  await page.goto(BASE + route, { waitUntil: "load" });
  await page.waitForLoadState("networkidle");
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
