// The validator, as a report a person reads: ordered PASS / WARN / FAIL lines.
//
// `validateManifest` (./manifest) is the judge; this module only lays its
// verdict out as lines — the /protocol console prints them. It never rewrites
// a validator sentence: every warning and error appears verbatim. A caller may
// prefix a line (e.g. "a hand-edited copy: ") but the words after it are the
// validator's own. Pure: no DOM, no I/O, relative imports only.

import { referencedAssets, validateManifest, type SsyncManifest } from "./manifest";

export type ReportLevel = "PASS" | "WARN" | "FAIL";

export interface ReportLine {
  level: ReportLevel;
  text: string;
}

/**
 * Do the head checks pass — version, `metadata.title`, a non-empty `pages`?
 * Asked of the validator itself, on the manifest's head alone (each page
 * stood in by a bare valid one), so the rule lives in one place.
 */
function headPasses(m: Partial<SsyncManifest> | null): m is SsyncManifest {
  if (!m || typeof m !== "object") return false;
  const pages = Array.isArray(m.pages) ? m.pages.map((_, i) => ({ id: i })) : m.pages;
  return validateManifest({ version: m.version, metadata: m.metadata, pages }).ok;
}

/**
 * The manifest's verdict as ordered lines:
 *
 * 1. PASS "version <v> · metadata.title · <n> pages" when the head passes;
 * 2. with `assetPaths` (the container's files), PASS "every assets/ path in
 *    the manifest exists", or FAIL "missing from the container: <paths>";
 * 3. each `validateManifest` warning, verbatim, as WARN;
 * 4. each `validateManifest` error, verbatim, as FAIL.
 */
export function validationReport(manifest: unknown, assetPaths?: readonly string[]): ReportLine[] {
  const { errors, warnings } = validateManifest(manifest);
  const m = manifest as Partial<SsyncManifest> | null;
  const lines: ReportLine[] = [];

  if (headPasses(m)) {
    const n = m.pages.length;
    lines.push({ level: "PASS", text: `version ${m.version} · metadata.title · ${n} ${n === 1 ? "page" : "pages"}` });

    if (assetPaths) {
      // A page that is not an object is the validator's own FAIL below.
      const readable = { ...m, pages: m.pages.filter((p) => p !== null && typeof p === "object") };
      const inContainer = new Set(assetPaths);
      const missing = referencedAssets(readable).filter((p) => !inContainer.has(p));
      lines.push(
        missing.length
          ? { level: "FAIL", text: `missing from the container: ${missing.join(", ")}` }
          : { level: "PASS", text: "every assets/ path in the manifest exists" },
      );
    }
  }

  for (const text of warnings) lines.push({ level: "WARN", text });
  for (const text of errors) lines.push({ level: "FAIL", text });
  return lines;
}

/**
 * The lines `after` says that `before` does not (same level and same words),
 * in `after`'s order: what a hand edit added to a tape's verdict. A copy's
 * report repeats everything the original already earns; this keeps its news.
 */
export function addedLines(before: readonly ReportLine[], after: readonly ReportLine[]): ReportLine[] {
  const said = new Set(before.map((l) => `${l.level} ${l.text}`));
  return after.filter((l) => !said.has(`${l.level} ${l.text}`));
}
