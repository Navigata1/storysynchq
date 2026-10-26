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
