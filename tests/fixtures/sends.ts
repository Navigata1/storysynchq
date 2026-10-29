/**
 * No-network checks: what a page sends while a test watches.
 *
 *   const sends = watchSends(page);            // fetch, xhr, ping, beacon
 *   … drive the page …
 *   expect(sends.urls(), "nothing is sent").toEqual([]);
 *
 * Recorded: every request of the watched resource types (`types`, default
 * fetch / xhr / ping / beacon; `"all"` for every type). Never recorded, because
 * none of it is the page sending anything:
 *
 *   - non-http(s) URLs (data:, blob:, …): read on this device
 *   - same-origin `/_next/…` and `/__nextjs…`: the framework's own code, dev
 *     tooling and hot reload
 *   - same-origin `?_rsc=…`: Next's route prefetch. `next start` (CI) prefetches
 *     every visible <Link> as `?_rsc=…`; `next dev` (local) does not, so a check
 *     that counts it is green locally and red in CI
 *
 * "Same origin" is the app's origin: `opts.origin`, else the project's
 * `baseURL`, else the page's current URL. `foreignTo: origin` records only
 * requests to any other origin ("nothing fetched from anywhere else");
 * `ignore` drops whatever else a spec's own check leaves out.
 */

import { test, type Page, type Request } from "@playwright/test";

/** The resource types a page uses to send something on its own. */
export const SEND_TYPES = ["fetch", "xhr", "ping", "beacon"] as const;

export interface WatchSendsOptions {
  /** Resource types recorded (`request.resourceType()`); `"all"` records every type. Default SEND_TYPES. */
  types?: readonly string[] | "all";
  /** The app's origin, for the same-origin ignores. Default: the project's baseURL, else the page's URL. */
  origin?: string;
  /** Record only requests whose origin is not this one. */
  foreignTo?: string;
  /** A spec's own extra filter: return true to leave the request out. */
  ignore?: (url: URL, request: Request) => boolean;
}

/** One recorded request. */
export interface Sent {
  url: string;
  method: string;
  type: string;
}

export interface SendWatch {
  /** The recorded URLs, in order. */
  urls(): string[];
  /** The recorded requests (URL, method, resource type), in order. */
  sent(): Sent[];
  /** Stop recording; what was recorded stays readable. */
  stop(): void;
}

/** The project's baseURL origin, read once while the test is running (null if none). */
function baseOrigin(): string | null {
  const base = test.info().project.use.baseURL;
  return base ? new URL(base).origin : null;
}

/** The origin of the page's current URL, when it is an http(s) page. */
function pageOrigin(page: Page): string | null {
  try {
    const current = new URL(page.url());
    return current.protocol === "http:" || current.protocol === "https:" ? current.origin : null;
  } catch {
    return null;
  }
}

/** Start recording what `page` sends (see the header for what counts). */
export function watchSends(page: Page, opts: WatchSendsOptions = {}): SendWatch {
  const types = opts.types ?? SEND_TYPES;
  const foreignTo = opts.foreignTo ? new URL(opts.foreignTo).origin : null;
  // Fixed when the watch starts; the page's URL is the fallback, read per request.
  const fixed = foreignTo ?? (opts.origin ? new URL(opts.origin).origin : baseOrigin());
  const recorded: Sent[] = [];

  const onRequest = (request: Request) => {
    const type = request.resourceType();
    if (types !== "all" && !types.includes(type)) return;
    let url: URL;
    try {
      url = new URL(request.url());
    } catch {
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    const origin = fixed ?? pageOrigin(page);
    if (url.origin === origin) {
      if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/__nextjs")) return;
      if (url.searchParams.has("_rsc")) return;
    }
    if (foreignTo && url.origin === foreignTo) return;
    if (opts.ignore?.(url, request)) return;
    recorded.push({ url: request.url(), method: request.method(), type });
  };

  page.on("request", onRequest);
  return {
    urls: () => recorded.map((r) => r.url),
    sent: () => recorded.slice(),
    stop: () => {
      page.off("request", onRequest);
    },
  };
}
