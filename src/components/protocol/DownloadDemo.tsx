"use client";

/**
 * "Take the tape" — packs the demo story into a real `.storysync` container in
 * the browser and hands it to the visitor.
 *
 * The demo ships as an SSYNC v1 document (`/demo/brave-little-star.ssync.json`)
 * whose illustrations are ordinary same-origin URLs. A v2 container has to be
 * self-contained, so every referenced image is fetched, turned into a data URL,
 * and then extracted into `assets/` by `buildStorysyncFromStory` — the exact
 * code path the Studio uses when a child publishes their own tape.
 *
 * Nothing is uploaded: fetch → blob → data URL → ZIP → download, all local.
 */

import * as React from "react";
import Link from "next/link";
import { buildStorysyncFromStory } from "@/lib/storysync/container";
import type { SsyncManifest } from "@/lib/storysync/manifest";
import { BigButton, Reel, TapeLabel } from "@/components/studio-kit/kit";

const DEMO_URL = "/demo/brave-little-star.ssync.json";

type Status =
  | { kind: "idle" }
  | { kind: "packing" }
  | { kind: "done"; filename: string; bytes: number; assets: number }
  | { kind: "error"; message: string };

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "story";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A same-origin asset, read into a data URL without touching a server of ours. */
async function toDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error(`could not read ${url}`));
    reader.readAsDataURL(blob);
  });
}

/** Anything already inline (or already an in-container path) is left alone. */
function needsInlining(url: string | undefined): url is string {
  return !!url && !url.startsWith("data:") && !url.startsWith("assets/");
}

export function DownloadDemo() {
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });
  const busy = status.kind === "packing";
  const urlsRef = React.useRef<string[]>([]);

  React.useEffect(
    () => () => {
      for (const url of urlsRef.current) URL.revokeObjectURL(url);
      urlsRef.current = [];
    },
    [],
  );

  const download = React.useCallback(async () => {
    if (busy) return;
    setStatus({ kind: "packing" });
    try {
      const response = await fetch(DEMO_URL);
      if (!response.ok) throw new Error(`the demo manifest → HTTP ${response.status}`);
      const story = (await response.json()) as SsyncManifest;

      // v1 document → v2 container: bundle the media, keep the story identical.
      story.version = "2.0";
      if (needsInlining(story.metadata.coverImage)) {
        story.metadata.coverImage = await toDataUrl(story.metadata.coverImage);
      }
      await Promise.all(
        story.pages.map(async (page) => {
          if (page.illustration && needsInlining(page.illustration.url)) {
            page.illustration.url = await toDataUrl(page.illustration.url);
          }
          if (page.text && needsInlining(page.text.audioUrl)) {
            page.text.audioUrl = await toDataUrl(page.text.audioUrl);
          }
        }),
      );

      const packed = buildStorysyncFromStory(story);
      const assets = story.pages.filter((p) => p.illustration?.url).length;
      // Copy out of the view so the Blob owns a plain ArrayBuffer.
      const buffer = packed.buffer.slice(
        packed.byteOffset,
        packed.byteOffset + packed.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([buffer], { type: "application/zip" });
      const filename = `${slugify(story.metadata.title)}.storysync`;

      const objectUrl = URL.createObjectURL(blob);
      urlsRef.current.push(objectUrl);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
        urlsRef.current = urlsRef.current.filter((u) => u !== objectUrl);
      }, 10000);

      setStatus({ kind: "done", filename, bytes: blob.size, assets });
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error
            ? `The tape could not be packed: ${error.message}`
            : "The tape could not be packed.",
      });
    }
  }, [busy]);

  return (
    <div className="pr-take">
      <div className="pr-take-tape">
        <TapeLabel
          title="The Brave Little Star"
          author="Island Development Crew"
          meta="SIDE A · 8 PAGES · SSYNC v2.0"
        />
        <div className="pr-take-reels" aria-hidden="true">
          <Reel spinning={busy} size={30} />
          <Reel spinning={busy} size={30} />
        </div>
      </div>

      <div className="pr-take-body">
        <h3 className="pr-h3 sk-font-tape">Take the tape apart</h3>
        <p className="pr-copy">
          This packs the demo story into a real container in your browser — the manifest, plus
          every illustration bundled into <code className="sk-font-meta">assets/</code>. Rename
          it to <code className="sk-font-meta">.zip</code> and read the whole thing; drop it back
          on <Link className="pr-inline-link sk-focus" href="/read">the reader</Link> and it plays.
        </p>

        <BigButton
          data-protocol="download-demo"
          label={busy ? "Packing the tape…" : "Download the demo as .storysync"}
          variant="gold"
          icon="⬇"
          disabled={busy}
          aria-busy={busy}
          onClick={() => {
            void download();
          }}
        />

        <p className="pr-take-status sk-font-meta" role="status" data-protocol="download-status">
          {status.kind === "packing" ? "Bundling assets and zipping…" : null}
          {status.kind === "done"
            ? `${status.filename} · ${formatBytes(status.bytes)} · ${status.assets} bundled assets`
            : null}
          {status.kind === "error" ? status.message : null}
          {status.kind === "idle" ? "Nothing is uploaded — the ZIP is built on this device." : null}
        </p>
      </div>
    </div>
  );
}
