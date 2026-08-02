// .storysync container — a ZIP (fflate) holding manifest.json + assets/.
//
// Layout:
//   manifest.json          — SSYNC v2 manifest (validated on pack AND unpack)
//   assets/page-3.jpg      — illustrations
//   assets/narration-3.m4a — published narration (AAC/M4A, or .wav fallback)
//
// pack/unpack are pure byte transforms (no DOM), so they run in node tests.
// The *FromStory helpers convert between the app's data-URL story shape and
// container-relative asset paths.

import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import {
  ASSETS_DIR,
  MANIFEST_FILENAME,
  SsyncManifest,
  referencedAssets,
  validateManifest,
} from "./manifest";

export interface StorysyncArchive {
  manifest: SsyncManifest;
  /** Filename (with assets/ prefix) → bytes. */
  assets: Map<string, Uint8Array>;
}

export class StorysyncError extends Error {
  constructor(message: string, public readonly details: string[] = []) {
    super(details.length ? `${message}: ${details.join("; ")}` : message);
    this.name = "StorysyncError";
  }
}

export function packStorysync(manifest: SsyncManifest, assets: Map<string, Uint8Array>): Uint8Array {
  const validation = validateManifest(manifest);
  if (!validation.ok) throw new StorysyncError("Invalid manifest", validation.errors);

  const missing = referencedAssets(manifest).filter((p) => !assets.has(p));
  if (missing.length) throw new StorysyncError("Manifest references missing assets", missing);

  const files: Record<string, Uint8Array> = {
    [MANIFEST_FILENAME]: strToU8(JSON.stringify(manifest, null, 2)),
  };
  for (const [path, bytes] of assets) {
    if (!path.startsWith(ASSETS_DIR)) throw new StorysyncError(`Asset path must start with ${ASSETS_DIR}`, [path]);
    files[path] = bytes;
  }
  // Media is already compressed; level 0 for assets keeps packing instant.
  return zipSync(files, { level: 0 });
}

export function unpackStorysync(bytes: Uint8Array): StorysyncArchive {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new StorysyncError("Not a valid .storysync file (unreadable ZIP)");
  }
  const manifestBytes = entries[MANIFEST_FILENAME];
  if (!manifestBytes) throw new StorysyncError("Missing manifest.json");

  let manifest: SsyncManifest;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes));
  } catch {
    throw new StorysyncError("manifest.json is not valid JSON");
  }
  const validation = validateManifest(manifest);
  if (!validation.ok) throw new StorysyncError("Invalid manifest", validation.errors);

  const assets = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(entries)) {
    if (path.startsWith(ASSETS_DIR) && !path.endsWith("/")) assets.set(path, data);
  }
  const missing = referencedAssets(manifest).filter((p) => !assets.has(p));
  if (missing.length) throw new StorysyncError("Container is missing referenced assets", missing);

  return { manifest, assets };
}

/* ── data URL ↔ bytes (node-safe: atob/btoa are global in Node ≥16) ── */

export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match) throw new StorysyncError("Not a data URL");
  const mime = match[1] || "application/octet-stream";
  if (match[2]) {
    const bin = atob(match[3]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, mime };
  }
  return { bytes: strToU8(decodeURIComponent(match[3])), mime };
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  wav: "audio/wav",
};

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
};

export function mimeForAssetPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return EXT_TO_MIME[ext] || "application/octet-stream";
}

/**
 * App story (data-URL images/audio) → packed container. Extracts every data
 * URL into assets/ and rewrites references to container-relative paths.
 */
export function buildStorysyncFromStory(story: SsyncManifest): Uint8Array {
  const assets = new Map<string, Uint8Array>();
  const manifest: SsyncManifest = JSON.parse(JSON.stringify(story));
  manifest.version = "2.0";

  const extract = (url: string | undefined, baseName: string): string | undefined => {
    if (!url || !url.startsWith("data:")) return url;
    const { bytes, mime } = dataUrlToBytes(url);
    const ext = MIME_TO_EXT[mime] || "bin";
    const path = `${ASSETS_DIR}${baseName}.${ext}`;
    assets.set(path, bytes);
    return path;
  };

  manifest.metadata.coverImage = extract(manifest.metadata.coverImage, "cover");
  for (const page of manifest.pages) {
    if (page.illustration?.url) {
      page.illustration.url = extract(page.illustration.url, `page-${page.id}`);
    }
    if (page.text?.audioUrl) {
      page.text.audioUrl = extract(page.text.audioUrl, `narration-${page.id}`);
    }
  }
  return packStorysync(manifest, assets);
}

/**
 * Packed container → app story shape: every assets/ reference inlined back to
 * a data URL the reader can use directly.
 */
export function loadStorysyncToStory(bytes: Uint8Array): SsyncManifest {
  const { manifest, assets } = unpackStorysync(bytes);

  const inline = (url: string | undefined): string | undefined => {
    if (!url || !url.startsWith(ASSETS_DIR)) return url;
    const data = assets.get(url);
    if (!data) return undefined;
    return bytesToDataUrl(data, mimeForAssetPath(url));
  };

  manifest.metadata.coverImage = inline(manifest.metadata.coverImage);
  for (const page of manifest.pages) {
    if (page.illustration?.url) page.illustration.url = inline(page.illustration.url);
    if (page.text?.audioUrl) page.text.audioUrl = inline(page.text.audioUrl);
  }
  return manifest;
}
