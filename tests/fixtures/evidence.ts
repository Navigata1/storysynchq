/**
 * Fidelity evidence shots (T25, HANDOFF §11): where a reference-state
 * screenshot lands, and how it is taken.
 *
 *   VISION_EVIDENCE=1        → docs/vision/evidence/<name>  (the hand-back packet)
 *   VISION_EVIDENCE=<dir>    → <dir>/<name>, created if missing (relative to the cwd)
 *   unset                    → the test's own output folder (test-results/…), so an
 *                              ordinary run never touches a tracked file
 *
 * The reference screens are still frames, so a shot does NOT freeze animations
 * (`animations: "disabled"` would jump the print-in, the stamp and the lift to
 * their ends and hide a broken one): it waits for the fonts and for every
 * finite animation and transition to land, then shoots. Endless loops (the
 * reels) are left running and caught mid-turn, as the reference draws them.
 */

import fs from "node:fs";
import path from "node:path";
import { test, type Page, type PageScreenshotOptions } from "@playwright/test";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PACKET_DIR = path.join(REPO_ROOT, "docs", "vision", "evidence");

/** The folder shots go to when VISION_EVIDENCE is set; null when it is not. */
export function evidenceDir(): string | null {
  const value = process.env.VISION_EVIDENCE?.trim();
  if (!value) return null;
  if (value === "1") return PACKET_DIR;
  return path.resolve(process.cwd(), value);
}

/**
 * `next dev` paints its own badge (the "N" dev-tools button) over the app's
 * bottom-left corner. It is not the product, so a shot hides it; a production
 * build (`next start`, CI) never draws it.
 */
const DEV_CHROME = "nextjs-portal { display: none !important; }";

/** Longest a shot waits for finite animations to land before it shoots anyway. */
const SETTLE_CAP_MS = 3000;

/** Fonts loaded, finite animations and transitions finished, two frames painted. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async (cap) => {
    await document.fonts.ready;
    const finite = document
      .getAnimations()
      .filter((a) => Number.isFinite(a.effect?.getComputedTiming().iterations ?? Infinity));
    const pictures = Array.from(document.images)
      .filter((img) => img.loading !== "lazy" && (!img.complete || img.naturalWidth === 0))
      .map((img) => img.decode().catch(() => undefined));
    await Promise.race([
      Promise.all([...finite.map((a) => a.finished.catch(() => undefined)), ...pictures]),
      new Promise((resolve) => setTimeout(resolve, cap)),
    ]);
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, SETTLE_CAP_MS);
}

/**
 * Settle the page and save a screenshot named `name` (e.g.
 * `s05-publish-1180x820.png`) to the evidence destination. `opts` passes
 * through to `page.screenshot` (its `path` is ours). Returns the file written.
 */
export async function evidenceShot(
  page: Page,
  name: string,
  opts: Omit<PageScreenshotOptions, "path"> = {},
): Promise<string> {
  const dir = evidenceDir();
  let file: string;
  if (dir) {
    fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, name);
  } else {
    file = test.info().outputPath(name);
  }
  await settle(page);
  await page.screenshot({ ...opts, style: `${DEV_CHROME}\n${opts.style ?? ""}`, path: file });
  return file;
}
