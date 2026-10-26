"use client";

/**
 * /protocol — the SSYNC format's home in the product (docs/10x-plan.md gap G9).
 *
 * Register A page (calm studio chrome, docs/design-direction.md §2) carrying
 * Register B artifacts: the exploded page and the packet diagram printed on
 * tape paper, and the container layout as a printed sheet. The hero hands over
 * the demo as a real .storysync (built on this device); beside FIG. 1 the codec
 * rule, the validator talking and a player you can copy (s08).
 * "Like PDF" is only credible if the spec is a page a developer can read — so
 * everything normative here is the same text as docs/format-spec.md, and every
 * claim links to the schema that enforces it.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GlassPanel } from "@/components/studio-kit/kit";
import { PacketExploded, type ExplodedPlate } from "@/components/studio-kit/PacketExploded";
import { mimeForAssetPath, packedAssetPath } from "@/lib/storysync/container";
import type { SsyncManifest } from "@/lib/storysync/manifest";
import { pageMood } from "@/components/player/music-plan";
import houseTape from "../../../public/demo/brave-little-star.ssync.json";
import { PACKET_LAYERS } from "./layers";
import { packetPlates, type PlateAssetKind, type PlateManifest } from "./plates";
import { PacketDiagram } from "./PacketDiagram";
import { DownloadDemo } from "./DownloadDemo";
import { ProtocolCards } from "./ProtocolCards";
import "./protocol.css";

const V1_SCHEMA = "/protocol/v1.schema.json";
const V2_SCHEMA = "/protocol/v2.schema.json";
const SPEC_URL = "https://github.com/Navigata1/storysynchq/blob/main/docs/format-spec.md";
const GITHUB_URL = "https://github.com/Navigata1/storysynchq";
const PRIVACY_URL = "https://github.com/Navigata1/storysynchq/blob/main/PRIVACY.md";

function Arrow() {
  return (
    <svg className="pr-arrow" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path
        d="M4 12h14.2M13 6.4 18.8 12 13 17.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const FACTS: Array<{ k: string; v: string }> = [
  { k: "Container", v: "ZIP · manifest.json + assets/" },
  { k: "Manifest", v: "UTF-8 JSON · schema v2.0" },
  { k: "Narration", v: "AAC-LC in M4A (WAV fallback)" },
  { k: "Runtime", v: "Plain web · no server required" },
];

/**
 * An example archive, not the demo download: it shows a voice in each permitted
 * codec (the download of the house tape holds only its manifest and pictures —
 * the browser voice reads it), so its root is a generic name, never the
 * download's own filename.
 */
const CONTAINER_TREE = `my-story.storysync
├── manifest.json            REQUIRED · SSYNC v2 manifest (UTF-8 JSON)
└── assets/                  all bundled media, flat
    ├── cover.jpg
    ├── page-1.jpg
    ├── narration-1.m4a      AAC-LC · 48 kHz mono · ~96 kbps
    ├── page-2.jpg
    └── narration-2.wav      the only permitted fallback`;

const PAGE_EXAMPLE = `{
  "id": 3,
  "illustration": { "url": "assets/page-3.jpg", "alt": "A drawing of a red boat" },
  "text": {
    "content": "The little boat sailed on.",
    "audioUrl": "assets/narration-3.m4a",
    "audioCodec": "aac"
  },
  "music": "Calm",
  "timing": { "autoPause": "3s" }
}`;

/* ------------------------------------------------- FIG. 1, taken apart */

/**
 * The house tape, read at build time (a static JSON import, as the landing
 * does): the figure needs no request. Its third page is the one exploded.
 */
const HOUSE_TAPE: PlateManifest = houseTape;
const FIG_PAGE_INDEX = 2;
const FIG_PAGE = HOUSE_TAPE.pages[FIG_PAGE_INDEX];

/**
 * Where "Download the demo as .storysync" puts a file: the download fetches
 * the same-origin file, reads it as a data URL of its served type and lets
 * `buildStorysyncFromStory` name it (`base` + that type's extension) — so the
 * figure and the validator card ask the container's own naming rule, with the
 * type that file is served as.
 */
function packedPath(url: string, base: string): string {
  if (url.startsWith("assets/")) return url;
  return packedAssetPath(url.startsWith("data:") ? url : mimeForAssetPath(url), base);
}

/** A page's picture or voice, named as the container names it. */
function packedLikeTheDownload(url: string, asset: { pageId: number; kind: PlateAssetKind }): string {
  return packedPath(url, asset.kind === "picture" ? `page-${asset.pageId}` : `narration-${asset.pageId}`);
}

const FIG_PLATES: ExplodedPlate[] = packetPlates(HOUSE_TAPE, FIG_PAGE_INDEX, {
  assetPath: packedLikeTheDownload,
});

/**
 * The house tape as the download packs it (T23a's naming): version 2.0, every
 * file (cover, pictures, any voice) at the path the container writes. The
 * validator card reads this; nothing is fetched.
 */
const PACKED_HOUSE_TAPE: SsyncManifest = (() => {
  const tape = JSON.parse(JSON.stringify(houseTape)) as SsyncManifest;
  tape.version = "2.0";
  if (tape.metadata.coverImage) tape.metadata.coverImage = packedPath(tape.metadata.coverImage, "cover");
  for (const page of tape.pages) {
    if (page.illustration?.url) {
      page.illustration.url = packedLikeTheDownload(page.illustration.url, { pageId: page.id, kind: "picture" });
    }
    if (page.text?.audioUrl) {
      page.text.audioUrl = packedLikeTheDownload(page.text.audioUrl, { pageId: page.id, kind: "voice" });
    }
  }
  return tape;
})();

const FIG_ART = {
  title: HOUSE_TAPE.metadata.title,
  picture: FIG_PAGE.illustration?.url,
  mood: pageMood(HOUSE_TAPE, FIG_PAGE),
};

const LADDER: Array<{ source: string; action: string }> = [
  { source: "AAC/MP4 — Safari, iOS", action: "Passes through. Already compliant." },
  {
    source: "Opus/WebM — Chrome, Android, with a WebCodecs AAC encoder",
    action: "Decoded and re-encoded to AAC-LC, 48 kHz mono, ~96 kbps, in M4A.",
  },
  {
    source: "Opus/WebM — no AAC encoder available (Firefox today)",
    action: "Decoded to 16-bit PCM WAV, 16 kHz mono. Bigger, but it plays everywhere.",
  },
];

/** The app icon (public/icons): the same cassette the landing nav and the favicon carry. */
const ICON_SRC = "/icons/icon-96x96.png";

/**
 * Keyboard focus never hides under the sticky bar (WCAG 2.2 SC 2.4.11).
 * `scroll-padding-top` (protocol.css) covers the scrolls the browser makes, but
 * Chrome does not scroll a focused element that is already inside the viewport
 * — even when it sits wholly under the bar — and it ignores scroll-padding when
 * it checks. So one frame after keyboard focus, a stop whose top is under the
 * bar is scrolled to sit just below it. Instant: a jump, never an animation.
 */
function useFocusClearOfBar(rootRef: React.RefObject<HTMLDivElement | null>) {
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const onFocusIn = (event: FocusEvent) => {
      const el = event.target;
      const bar = root.querySelector(".pr-bar");
      if (!(el instanceof HTMLElement) || !bar || bar.contains(el)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (document.activeElement !== el || !el.matches(":focus-visible")) return;
        const clear = bar.getBoundingClientRect().bottom + 12;
        const top = el.getBoundingClientRect().top;
        if (top < clear) window.scrollBy({ top: top - clear, behavior: "auto" });
      });
    };
    root.addEventListener("focusin", onFocusIn);
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("focusin", onFocusIn);
    };
  }, [rootRef]);
}

export function ProtocolPage() {
  const rootRef = React.useRef<HTMLDivElement>(null);
  useFocusClearOfBar(rootRef);

  return (
    <div ref={rootRef} className="pr-root sk-font-ui">
      <header className="pr-bar">
        <div className="pr-wrap pr-bar-inner">
          {/* s08: "← StorySyncHQ" with the tape glyph; the arrow and the icon are decoration */}
          <Link className="pr-back sk-font-meta sk-focus" href="/">
            <ArrowLeft className="pr-back-arrow" aria-hidden="true" focusable="false" />
            {/* eslint-disable-next-line @next/next/no-img-element -- an 18 px app icon; no optimisation pipeline yet (CLAUDE.md §3) */}
            <img className="pr-back-icon" src={ICON_SRC} alt="" width={18} height={18} decoding="async" />
            StorySyncHQ
          </Link>
          <nav className="pr-bar-nav" aria-label="Product">
            <Link className="pr-bar-link sk-focus" href="/read">
              Play a story
            </Link>
            <i className="pr-bar-dot" aria-hidden="true" />
            <Link className="pr-bar-link sk-focus" href="/studio">
              Make a story
            </Link>
          </nav>
        </div>
      </header>

      <main className="pr-main">
        {/* ------------------------------------------------------------ hero */}
        <section className="pr-hero" aria-labelledby="pr-title">
          <div className="pr-wrap">
            {/* ≥ 1024 px the download takes the hero's right side, beside the
                kicker and the h1 (s08); below, it follows the lede. */}
            <div className="pr-hero-head">
              <p className="pr-eyebrow sk-font-meta">The SSYNC protocol · version 2.0</p>
              <h1 id="pr-title" className="pr-h1 sk-font-tape">
                One file holds the whole storybook.
              </h1>
              <p className="pr-lede">
                SSYNC is to storybooks what PDF is to documents: pictures, words, voices, music and
                timing in one open file. Deliberately not video. The player is plain web — nobody
                needs our servers, or our app, to hear a story.
              </p>
              <DownloadDemo compact />
            </div>

            <ul className="pr-facts">
              {FACTS.map((fact) => (
                <li key={fact.k} className="pr-fact">
                  <span className="pr-fact-k sk-font-meta">{fact.k}</span>
                  <span className="pr-fact-v">{fact.v}</span>
                </li>
              ))}
            </ul>

            <div className="pr-links">
              <a className="pr-link sk-font-meta sk-focus" href={V2_SCHEMA} target="_blank" rel="noreferrer">
                v2 JSON schema
                <Arrow />
              </a>
              <a className="pr-link sk-font-meta sk-focus" href={V1_SCHEMA} target="_blank" rel="noreferrer">
                v1 JSON schema
                <Arrow />
              </a>
              <a className="pr-link sk-font-meta sk-focus" href={SPEC_URL} target="_blank" rel="noreferrer">
                Full specification
                <Arrow />
              </a>
            </div>
          </div>
        </section>

        {/* ------------------------------------------- FIG. 1, taken apart */}
        <section className="pr-figs" aria-labelledby="pr-figs-h">
          <div className="pr-wrap">
            <h2 id="pr-figs-h" className="sr-only">
              Taken apart
            </h2>
            <div className="pr-fig-grid">
              <figure className="pr-fig" data-protocol="fig-packet">
                <figcaption className="pr-fig-cap sk-font-meta">
                  Fig. 1 — page {FIG_PAGE_INDEX + 1} of {HOUSE_TAPE.metadata.title}, taken apart
                </figcaption>
                <PacketExploded className="pr-fig-stack" plates={FIG_PLATES} art={FIG_ART} />
                <p className="pr-fig-note">
                  A reader that understands only layers 1–3 still shows the story; each layer above
                  adds a sense.
                </p>
              </figure>
              <ProtocolCards className="pr-fig-cards" packedTape={PACKED_HOUSE_TAPE} />
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- the packet */}
        <section className="pr-section" aria-labelledby="pr-packet-h">
          <div className="pr-wrap">
            <p className="pr-eyebrow sk-font-meta">Anatomy</p>
            <h2 id="pr-packet-h" className="pr-h2 sk-font-tape">
              Seven layers in one packet
            </h2>
            <p className="pr-lede">
              A story is not a blob of media. It is seven layers stacked in one manifest, each
              one optional except the first — so a reader can implement as far up the stack as
              it likes and still play every SSYNC file it meets.
            </p>

            <PacketDiagram />

            <ol className="pr-legend">
              {PACKET_LAYERS.map((layer, i) => (
                <li key={layer.name} className="pr-legend-item">
                  <GlassPanel className="pr-legend-card">
                    <p className="pr-legend-index sk-font-meta">
                      {String(i + 1).padStart(2, "0")}
                      {layer.draft ? " · v2.1 draft" : ""}
                    </p>
                    <h3 className="pr-h3 sk-font-tape">{layer.name}</h3>
                    <p className="pr-legend-key sk-font-meta">{layer.key}</p>
                    <p className="pr-copy">{layer.detail}</p>
                  </GlassPanel>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------- the container */}
        <section className="pr-section" aria-labelledby="pr-container-h">
          <div className="pr-wrap">
            <p className="pr-eyebrow sk-font-meta">The container</p>
            <h2 id="pr-container-h" className="pr-h2 sk-font-tape">
              A ZIP you can open with anything
            </h2>

            <div className="pr-two">
              <div>
                <figure className="pr-sheet">
                  {/* focusable: a horizontally scrollable region must be
                      keyboard-reachable (it scrolls itself, never the page) */}
                  <pre
                    className="pr-tree sk-font-meta sk-focus"
                    role="group"
                    tabIndex={0}
                    aria-label="The .storysync archive layout (scrolls sideways on narrow screens)"
                  >
                    {CONTAINER_TREE}
                  </pre>
                  <figcaption className="pr-sheet-cap sk-font-meta">
                    Fig. 3 — the archive layout (an example)
                  </figcaption>
                </figure>
              </div>

              <div>
                <ul className="pr-rules">
                  <li>
                    <code className="sk-font-meta">manifest.json</code> MUST sit at the archive
                    root and validate against the v2 schema.
                  </li>
                  <li>
                    Every <code className="sk-font-meta">assets/…</code> path the manifest
                    references MUST exist. A reader MUST reject dangling references.
                  </li>
                  <li>
                    Assets SHOULD be stored uncompressed (deflate level 0) — media is already
                    compressed, so recompression costs time for nothing.
                  </li>
                  <li>
                    Unknown files and unknown manifest fields MUST be ignored, never fatal.
                    Forward compatibility is the whole point of a format.
                  </li>
                  <li>
                    Reference budget: an 8-page story with ~5 minutes of narration fits in
                    about 15 MB.
                  </li>
                </ul>

                <p className="pr-note sk-font-meta">One page of that manifest:</p>
                <pre
                  className="pr-code sk-font-meta sk-focus"
                  role="group"
                  tabIndex={0}
                  aria-label="One page of an SSYNC manifest (scrolls sideways on narrow screens)"
                >
                  {PAGE_EXAMPLE}
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------- the codec rule */}
        <section className="pr-section" aria-labelledby="pr-codec-h">
          <div className="pr-wrap">
            <p className="pr-eyebrow sk-font-meta">Normative</p>
            <h2 id="pr-codec-h" className="pr-h2 sk-font-tape">
              The published-audio codec rule
            </h2>
            <p className="pr-lede">
              MediaRecorder disagrees with itself across browsers: Safari records AAC/MP4,
              Chrome and Android record Opus/WebM — and iOS Safari cannot reliably play
              Opus/WebM. Left alone, a tape recorded on an Android phone is silent on an
              iPhone: exactly the cross-device moment this format exists to deliver.
            </p>

            <div className="pr-rule" role="note" aria-labelledby="pr-rule-h">
              <p id="pr-rule-h" className="pr-rule-h sk-font-meta">
                In a published .storysync
              </p>
              <ol className="pr-rule-list">
                <li>
                  Narration <strong>MUST</strong> be AAC-LC in an MP4/M4A container
                  (<code className="sk-font-meta">audioCodec: &quot;aac&quot;</code>). Reference
                  target: mono, 48 kHz, ~96 kbps.
                </li>
                <li>
                  Where AAC cannot be encoded, narration <strong>MAY</strong> fall back to 16-bit
                  PCM WAV, 16 kHz mono (<code className="sk-font-meta">audioCodec: &quot;wav&quot;</code>).
                  That is the <em>only</em> permitted fallback.
                </li>
                <li>
                  Narration <strong>MUST NOT</strong> be Opus, WebM or Ogg. Those are valid only
                  in editor drafts that never leave the authoring device.
                </li>
              </ol>
            </div>

            <p className="pr-note sk-font-meta">
              Normalization happens at publish time, in the browser — a child&rsquo;s voice is
              never sent to a server just to be transcoded:
            </p>

            <div className="pr-table-scroll">
              <table className="pr-table">
                <caption className="sr-only">
                  How each recording format is normalized when a story is published
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="sk-font-meta">
                      Recorded as
                    </th>
                    <th scope="col" className="sk-font-meta">
                      At publish
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {LADDER.map((row) => (
                    <tr key={row.source}>
                      <th scope="row">{row.source}</th>
                      <td>{row.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------- consent + privacy */}
        <section className="pr-section" aria-labelledby="pr-privacy-h">
          <div className="pr-wrap">
            <p className="pr-eyebrow sk-font-meta">Normative for the reference reader</p>
            <h2 id="pr-privacy-h" className="pr-h2 sk-font-tape">
              A child&rsquo;s voice is part of the format&rsquo;s job
            </h2>
            <p className="pr-lede">
              The flagship user is four years old and recording over their own drawings. So the
              rules are in the spec, not only in a policy page: publishing is gated behind a
              parental gate, deleting a story deletes all of it — manifest, images, narration,
              share code — and the player ships zero third-party trackers. The Signature layer
              exists so the consent record travels inside the tape rather than in somebody&rsquo;s
              database.
            </p>
            <div className="pr-links">
              <a className="pr-link sk-font-meta sk-focus" href={PRIVACY_URL} target="_blank" rel="noreferrer">
                The COPPA posture
                <Arrow />
              </a>
              <a className="pr-link sk-font-meta sk-focus" href={GITHUB_URL} target="_blank" rel="noreferrer">
                Reference implementation
                <Arrow />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="pr-footer">
        <div className="pr-wrap pr-footer-inner">
          <p className="pr-footer-note sk-font-meta">
            SSYNC v2.0 · the spec, the schema and the reader are all open. Write your own player
            — the format outlives the app.
          </p>
          <nav className="pr-footer-links sk-font-meta" aria-label="Footer">
            <Link className="pr-footer-link sk-focus" href="/">
              Home
            </Link>
            <a className="pr-footer-link sk-focus" href={SPEC_URL} target="_blank" rel="noreferrer">
              Specification
            </a>
            <a className="pr-footer-link sk-focus" href={GITHUB_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
