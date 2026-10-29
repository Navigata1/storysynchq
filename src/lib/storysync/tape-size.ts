/**
 * Tape size — how many bytes a tape's pictures and voices really are.
 *
 * A draft carries its assets as data URLs; the `.storysync` container holds
 * them decoded (src/lib/storysync/container.ts). So the size that matters is
 * the decoded payload, not the base64 string: about three quarters of it.
 *
 * Pure: no DOM, no storage, no `@/` aliases — Node-side tests import it.
 * The gate's sheet prints "about N KB each" from it (T14); the publish card's
 * size meter adds the format budget (T16).
 */

/** The fields of a manifest whose data URLs become container assets. */
export interface SizedManifest {
  metadata?: { coverImage?: string } | undefined;
  pages: readonly {
    illustration?: { url?: string } | undefined;
    text?: { audioUrl?: string } | undefined;
  }[];
}

export interface TapeBytes {
  /** Every data-URL picture: each page's illustration, plus the cover. */
  pictureBytes: number;
  /** Every data-URL recording. */
  voiceBytes: number;
  totalBytes: number;
}

/**
 * The decoded byte length of a data URL's payload; 0 for anything that is not
 * a data URL (a remote picture is not carried in the file).
 *
 *   "data:image/jpeg;base64,/9j/4AAQ" → 9 · "data:,hi%20there" → 8
 */
export function dataUrlBytes(url: string | null | undefined): number {
  if (!url || !url.startsWith("data:")) return 0;
  const comma = url.indexOf(",");
  if (comma < 0) return 0;
  const header = url.slice(5, comma);
  const payload = url.slice(comma + 1);
  if (/;base64$/i.test(header)) {
    const clean = payload.replace(/\s+/g, "");
    if (!clean) return 0;
    const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
  }
  try {
    return new TextEncoder().encode(decodeURIComponent(payload)).length;
  } catch {
    return new TextEncoder().encode(payload).length;
  }
}

/** The decoded bytes this manifest's assets will take inside the container. */
export function tapeBytes(manifest: SizedManifest): TapeBytes {
  let pictureBytes = dataUrlBytes(manifest.metadata?.coverImage);
  let voiceBytes = 0;
  for (const page of manifest.pages) {
    pictureBytes += dataUrlBytes(page.illustration?.url);
    voiceBytes += dataUrlBytes(page.text?.audioUrl);
  }
  return { pictureBytes, voiceBytes, totalBytes: pictureBytes + voiceBytes };
}

/* ------------------------------------------------------------- the budget */

const MB = 1_048_576;

/**
 * The format's size budget for one tape: "≤ 15 MB" (docs/format-spec.md §5),
 * read as 15 × 1,048,576 bytes. A tape over it is shown in tape-red on the
 * publish card's size meter — shown, never blocked.
 */
export const TAPE_BUDGET_BYTES = 15 * MB;

/** 15 MB → "15"; 7.5 MB → "7.5". */
function budgetMegabytes(bytes: number): string {
  const mb = bytes / MB;
  return Number.isInteger(mb) ? String(mb) : mb.toFixed(1);
}

/**
 * The size meter's label, as s05 prints it: "2.0 MB OF 15 MB".
 * The tape is always to one decimal place; the budget is whole when it is.
 *
 *   formatTapeSize(2_097_152) → "2.0 MB OF 15 MB"
 */
export function formatTapeSize(totalBytes: number, budgetBytes: number = TAPE_BUDGET_BYTES): string {
  const total = Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : 0;
  return `${(total / MB).toFixed(1)} MB OF ${budgetMegabytes(budgetBytes)} MB`;
}

/** True when a tape is past the budget (exactly at it is still inside). */
export function isOverBudget(totalBytes: number, budgetBytes: number = TAPE_BUDGET_BYTES): boolean {
  return totalBytes > budgetBytes;
}

/**
 * What the meter says to a screen reader: the label, plus
 * " · over the 15 MB budget" when the tape is past it.
 */
export function tapeSizeValueText(totalBytes: number, budgetBytes: number = TAPE_BUDGET_BYTES): string {
  const label = formatTapeSize(totalBytes, budgetBytes);
  return isOverBudget(totalBytes, budgetBytes)
    ? `${label} · over the ${budgetMegabytes(budgetBytes)} MB budget`
    : label;
}
