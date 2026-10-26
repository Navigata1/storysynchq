"use client";

/**
 * Landing — the immersive cassette-memory front door (docs/design-direction.md §4).
 *
 * Six beats, one scroll:
 *   1. HERO      the memory  — the s01 top nav, then a Register-B cassette in
 *                              the deep-navy room
 *   2. DOORS     the truth   — ▶ PLAY A STORY (/read)  ●  MAKE A STORY (/studio)
 *   3. MAGIC     the why     — tape-stripe seam, "Remember the magic?", and the
 *                              three surfaces · one file (T07)
 *   4. HOW       the craft   — snap · record · share, CSS-only vignettes
 *   5. PROTOCOL  the promise — .storysync, like PDF for story experiences
 *   6. FOOTER    quiet exits — privacy, source, classic site; the company line
 *
 * No audio here. Nothing leaves the device. Every animation gates on
 * prefers-reduced-motion; reveals are IntersectionObserver-driven and skipped
 * entirely when reduced motion is requested.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BigButton, GlassPanel, Reel, TapeLabel } from "@/components/studio-kit/kit";
import { Cassette } from "@/components/studio-kit/Cassette";
import { tapeMetaLine } from "@/lib/storysync/tape-meta";
import houseTape from "../../../public/demo/brave-little-star.ssync.json";
import "./landing.css";
import "./landing-bands.css";
import { HeroSky } from "./HeroSky";
import { LandingNav } from "./LandingNav";
import { MagicBand, MAGIC_TITLE_ID } from "./MagicBand";
import { SurfacesRow } from "./SurfacesRow";

/* --------------------------------------------------------------- constants */

const GITHUB_URL = "https://github.com/Navigata1/storysynchq";
const PRIVACY_URL = "https://github.com/Navigata1/storysynchq/blob/main/PRIVACY.md";
const SCHEMA_URL = "/protocol/v2.schema.json";
const PROTOCOL_HREF = "/protocol";
const DOORS_ID = "ls-doors";
/** The doors reveal while still below the fold, so their peeking tops show at rest. */
const DOORS_REVEAL_MARGIN = "0px 0px 96px 0px";

/**
 * "Press play" plays the demo tape: the Read Room opens `?demo=1` straight on
 * the demo cover gate ("Tap to Begin"), which is where the iOS audio unlock —
 * and the whole cassette feeling — begins.
 */
const DEMO_HREF = "/read?demo=1";

/**
 * The house tape's label facts, read from the demo manifest in /public — never
 * hand-typed, so the landing cannot drift from the tape. A static JSON import:
 * resolved at build time, no runtime request.
 */
const HOUSE_TAPE = {
  title: houseTape.metadata.title,
  author: houseTape.metadata.author,
  meta: tapeMetaLine(houseTape),
  /** Page 1's picture: its single bright star is the hero's one light. */
  sky: houseTape.pages[0]?.illustration?.url,
} as const;

/**
 * Cassette-into-deck travel before the route change, in ms.
 * The bar (docs/10x-plan.md §3 WP-L) is ≤ 900 ms; under
 * prefers-reduced-motion the tape does not travel at all and the push is
 * immediate. Keep this value and the CSS animation duration in step.
 */
const INSERT_MS = 760;

/* ------------------------------------------------------------------- utils */

/** Inline CSS custom properties without fighting the CSSProperties type. */
function styleVars(vars: Record<string, string | number>): React.CSSProperties {
  return vars as unknown as React.CSSProperties;
}

/** Effect/handler-only — never called during render. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* --------------------------------------------------------------- starfield */

interface Star {
  x: number;
  y: number;
  size: number;
  peak: number;
  delay: number;
  dur: number;
}

/** Deterministic PRNG so server and client render identical stars. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STARS: Star[] = (() => {
  const rnd = mulberry32(0x57a1c);
  const out: Star[] = [];
  for (let i = 0; i < 72; i += 1) {
    out.push({
      x: Number((rnd() * 100).toFixed(3)),
      y: Number((rnd() * 100).toFixed(3)),
      size: Number((0.9 + rnd() * 1.8).toFixed(2)),
      peak: Number((0.22 + rnd() * 0.6).toFixed(2)),
      delay: Number((rnd() * 7).toFixed(2)),
      dur: Number((3.2 + rnd() * 5).toFixed(2)),
    });
  }
  return out;
})();

function Starfield() {
  return (
    <div className="ls-stars" aria-hidden="true">
      {STARS.map((star, i) => (
        <span
          key={i}
          className="ls-star"
          style={styleVars({
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            "--ls-star-peak": star.peak,
            animationDelay: `${star.delay}s`,
            animationDuration: `${star.dur}s`,
          })}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ reveal */

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Stagger, in ms. */
  delay?: number;
  /**
   * IntersectionObserver rootMargin. The default trims the bottom 10% so a
   * section reveals once it is properly on screen; content that must show at
   * the fold (the doors peeking in, s01) widens it instead, so the hidden
   * state's 24px drop cannot hold it below the viewport edge.
   */
  rootMargin?: string;
}

/**
 * Scroll-driven reveal. Under prefers-reduced-motion (or without
 * IntersectionObserver) the content is shown immediately and the CSS
 * transition never applies.
 */
function Reveal({ children, className, delay = 0, rootMargin = "0px 0px -10% 0px" }: RevealProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
            return;
          }
        }
      },
      { threshold: 0, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, rootMargin]);

  return (
    <div
      ref={ref}
      className={cx("ls-reveal", shown && "is-in", className)}
      style={delay ? styleVars({ "--ls-delay": `${delay}ms` }) : undefined}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ glyphs */

type GlyphKind = "play" | "prev" | "next" | "rec" | "arrow" | "chevron";

function Glyph({ kind, className }: { kind: GlyphKind; className?: string }) {
  return (
    <svg
      className={cx("ls-glyph", className)}
      viewBox="0 0 24 24"
      focusable="false"
      aria-hidden="true"
    >
      {kind === "play" ? <path d="M7 4.6v14.8L19.4 12z" /> : null}
      {kind === "prev" ? (
        <>
          <rect x="5.2" y="4.6" width="2.6" height="14.8" rx="1.1" />
          <path d="M20 5.5v13L9.6 12z" />
        </>
      ) : null}
      {kind === "next" ? (
        <>
          <rect x="16.2" y="4.6" width="2.6" height="14.8" rx="1.1" />
          <path d="M4 5.5v13L14.4 12z" />
        </>
      ) : null}
      {kind === "rec" ? <circle cx="12" cy="12" r="6.4" /> : null}
      {kind === "arrow" ? (
        <path
          d="M4 12h14.2M13 6.4 18.8 12 13 17.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {kind === "chevron" ? (
        <path
          d="M6 9.5 12 15.5 18 9.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}

/* -------------------------------------------------------------------- hero */

/**
 * The hero tape and the deck it drops into. `inserting` is the whole
 * animation state: CSS moves the cassette down behind the deck face and lights
 * the transport lamp, and every one of those rules lives behind
 * `prefers-reduced-motion: no-preference` in landing.css.
 *
 * At rest the tape is poised in the deck mouth with its lower third swallowed
 * (the depth is the well's height, never a transform on the slide); under
 * reduced motion it is already seated, only its label band above the mouth.
 * The house tape's title is read from the demo manifest. The play key on the
 * deck face is decoration (the deck is aria-hidden; "Press play" is the
 * control), and page 1's star sits right behind it (HeroSky).
 */
function HeroDeck({ inserting }: { inserting: boolean }) {
  return (
    <div
      className="ls-tape-stage"
      data-ls="tape-stage"
      data-inserting={inserting ? "true" : "false"}
    >
      {HOUSE_TAPE.sky ? <HeroSky src={HOUSE_TAPE.sky} /> : null}

      {/* the well clips at the deck mouth, so the tape is genuinely swallowed */}
      <div className="ls-tape-well" aria-hidden="true">
        <div className="ls-tape-slide" data-ls="tape-slide">
          <Cassette
            className="ls-cassette"
            title={HOUSE_TAPE.title}
            meta="SIDE A · PRESS PLAY"
            spinning
          />
        </div>
      </div>

      <div className="ls-deck" data-ls="deck" aria-hidden="true">
        <span className="ls-deck-top" />
        <span className="ls-deck-mouth" />
        <span className="ls-deck-lamp" />
        <span className="ls-deck-readout sk-font-meta">
          {inserting ? "▶ PLAY · SIDE A" : "DECK · READY"}
        </span>
        <span className="ls-deck-vents">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </span>
        <span className="ls-deck-key" data-ls="play-key" aria-hidden="true">
          <Glyph kind="play" />
        </span>
      </div>
    </div>
  );
}

function Hero() {
  const router = useRouter();
  const [inserting, setInserting] = React.useState(false);
  const timer = React.useRef<number | undefined>(undefined);

  // Warm the Read Room so the tape starts the moment the deck swallows it.
  React.useEffect(() => {
    try {
      router.prefetch(DEMO_HREF);
    } catch {
      /* prefetch is best-effort; the push below works regardless */
    }
  }, [router]);

  React.useEffect(
    () => () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    },
    [],
  );

  const goToDoors = React.useCallback(() => {
    const el = document.getElementById(DOORS_ID);
    if (!el) return;
    el.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }, []);

  /** Insert the tape, then hand over to the Read Room's demo cover gate. */
  const pressPlay = React.useCallback(() => {
    if (timer.current !== undefined) return; // already threading
    if (prefersReducedMotion()) {
      router.push(DEMO_HREF);
      return;
    }
    setInserting(true);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      router.push(DEMO_HREF);
    }, INSERT_MS);
  }, [router]);

  return (
    <section className="ls-hero" aria-labelledby="ls-hero-title">
      <Starfield />

      <LandingNav privacyHref={PRIVACY_URL} />

      <div className="ls-wrap ls-hero-inner">
        {/* two unbreakable halves: on a phone the only break is after the · */}
        <p className="ls-eyebrow ls-hero-kicker sk-font-meta" data-ls="hero-kicker">
          <span className="ls-nw">The library cassette ·</span>{" "}
          <span className="ls-nw">rebuilt for the web</span>
        </p>

        <HeroDeck inserting={inserting} />

        {/* The visible line is the page's one h1. aria-label adds the brand to
            its name (and to the hero region's) without changing its text. */}
        <h1
          id="ls-hero-title"
          className="ls-hero-line sk-font-tape"
          aria-label="StorySyncHQ: Press play on the stories you make together."
        >
          Press play on the stories you make together.
        </h1>

        <p className="ls-hero-sub">
          Photos of their drawings. Their voice on every page. A little music underneath.
          One link that plays anywhere.
        </p>

        <div className="ls-hero-cta" style={styleVars({ "--sk-big-h": "84px" })}>
          <BigButton
            data-ls="press-play"
            icon={<Glyph kind="play" />}
            label="Press play"
            variant="gold"
            shape="pill"
            aria-busy={inserting}
            onClick={pressPlay}
          />
          <p className="sr-only" role="status">
            {inserting ? "Threading the demo tape" : ""}
          </p>
          <button
            type="button"
            data-ls="or-scroll"
            className="ls-hero-hint sk-font-meta sk-focus"
            onClick={goToDoors}
          >
            or scroll to the two doors
            <Glyph kind="chevron" />
          </button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- doors */

function PlayDoor() {
  return (
    <Link href="/read" className="ls-door ls-door--play sk-focus">
      <div className="ls-door-stripe" aria-hidden="true" />
      <div className="ls-door-band" aria-hidden="true">
        <span className="ls-door-holes">
          <span className="ls-door-hole" />
          <span className="ls-door-hole" />
        </span>
        <span className="ls-door-kicker sk-font-meta">Side A · Receive</span>
      </div>

      <div className="ls-door-body">
        <span className="ls-door-glyph ls-door-glyph--play" aria-hidden="true">
          <Glyph kind="play" />
        </span>
        <div className="ls-door-title sk-font-tape">Play a story</div>
        <p className="ls-door-copy">
          Open a tape someone made for you: a shared link, a{" "}
          <code className="sk-font-meta">.storysync</code> file, or our demo tape.
        </p>
        <div className="ls-door-spacer" />
        {/* visual affordance only — the link is already named by its title */}
        <div className="ls-door-cta sk-font-meta" aria-hidden="true">
          Play a story
          <Glyph kind="arrow" />
        </div>
      </div>

      <div className="ls-door-reels" aria-hidden="true">
        <Reel size={34} />
        <Reel size={34} />
      </div>
    </Link>
  );
}

const VU_PATTERN = [
  0.16, 0.31, 0.52, 0.7, 0.58, 0.41, 0.63, 0.81, 0.66, 0.44, 0.27, 0.35, 0.55, 0.47, 0.3, 0.2,
];

/** A glimpse of the studio: stage, filmstrip, transport, live-ish meter. */
function StageGlimpse() {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [level, setLevel] = React.useState(VU_PATTERN[0]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;

    let timer: number | undefined;
    let i = 0;
    const stop = () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };
    const start = () => {
      if (timer !== undefined) return;
      timer = window.setInterval(() => {
        i = (i + 1) % VU_PATTERN.length;
        setLevel(VU_PATTERN[i]);
      }, 280);
    };

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) start();
        else stop();
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      stop();
    };
  }, []);

  return (
    <div ref={ref} className="ls-glimpse" aria-hidden="true">
      <GlassPanel className="ls-glimpse-panel">
        <div className="ls-glimpse-stage">
          <span className="ls-glimpse-art" />
          <span className="ls-glimpse-lines">
            <span />
            <span />
            <span />
          </span>
        </div>

        <div className="ls-glimpse-strip">
          <span className="ls-glimpse-frame is-live" />
          <span className="ls-glimpse-frame" />
          <span className="ls-glimpse-frame" />
          <span className="ls-glimpse-frame ls-glimpse-frame--add">+</span>
        </div>

        <div className="ls-glimpse-row">
          <span className="ls-mini-transport">
            <span className="ls-mini-btn">
              <Glyph kind="prev" />
            </span>
            <span className="ls-mini-btn ls-mini-btn--rec">
              <Glyph kind="rec" />
            </span>
            <span className="ls-mini-btn ls-mini-btn--play">
              <Glyph kind="play" />
            </span>
            <span className="ls-mini-btn">
              <Glyph kind="next" />
            </span>
          </span>
          <span className="ls-glimpse-meter">
            <span
              className="ls-glimpse-meter-fill"
              style={styleVars({ "--ls-level": `${Math.round(level * 100)}%` })}
            />
          </span>
        </div>
      </GlassPanel>
    </div>
  );
}

function MakeDoor() {
  return (
    <Link href="/studio" className="ls-door ls-door--make sk-focus">
      <div className="ls-door-body">
        <div className="ls-door-kicker ls-door-kicker--studio sk-font-meta">
          The studio · Create
        </div>
        <span className="ls-door-glyph ls-door-glyph--rec" aria-hidden="true">
          <span className="ls-door-dot" />
        </span>
        <div className="ls-door-title ls-door-title--studio sk-font-tape">Make a story</div>
        <p className="ls-door-copy ls-door-copy--studio">
          Snap the drawings. Record the voice, page by page. The Stage shows precisely what your
          listener will get — then hand it over as one link.
        </p>
        <StageGlimpse />
        <div className="ls-door-spacer" />
        {/* visual affordance only — the link is already named by its title */}
        <div className="ls-door-cta sk-font-meta" aria-hidden="true">
          Make a story
          <Glyph kind="arrow" />
        </div>
      </div>
    </Link>
  );
}

/* --------------------------------------------------------------- vignettes */

function SnapVignette() {
  return (
    <span className="ls-vig ls-vig--snap" aria-hidden="true">
      <span className="ls-snap-frame ls-anim">
        <svg className="ls-snap-art" viewBox="0 0 140 96" focusable="false" aria-hidden="true">
          <rect x="0" y="0" width="140" height="96" fill="#FFFDF6" />
          <g stroke="#E3452F" strokeWidth="3" strokeLinecap="round" fill="none">
            <path d="M22 74h44M22 74V50l22-16 22 16v24" />
          </g>
          <path d="M36 74v-14h14v14" stroke="#7C6BFF" strokeWidth="3" fill="none" strokeLinecap="round" />
          <circle cx="108" cy="24" r="11" fill="#FFC93C" stroke="#1E1A16" strokeWidth="2.5" />
          <g stroke="#FFC93C" strokeWidth="2.6" strokeLinecap="round">
            <path d="M108 5v5M108 38v5M89 24h5M122 24h5M94 10l3.6 3.6M118.4 34.4l3.6 3.6M122 10l-3.6 3.6M97.6 34.4 94 38" />
          </g>
          <path
            d="M4 84c12-6 22 4 34-1s20 5 32 0 22 4 34-2"
            stroke="#1E1A16"
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
            opacity="0.5"
          />
        </svg>
        <span className="ls-snap-flash ls-anim" />
      </span>
      <span className="ls-snap-corner ls-snap-corner--tl" />
      <span className="ls-snap-corner ls-snap-corner--br" />
    </span>
  );
}

const WAVE_BARS = [0.34, 0.62, 0.88, 0.5, 1, 0.44, 0.76, 0.36, 0.66];

function RecordVignette() {
  return (
    <span className="ls-vig ls-vig--rec" aria-hidden="true">
      <span className="ls-rec-dot">
        <span className="ls-rec-ring ls-anim" />
      </span>
      <span className="ls-wave">
        {WAVE_BARS.map((h, i) => (
          <span
            key={i}
            className="ls-wave-bar ls-anim"
            style={styleVars({ height: `${Math.round(h * 100)}%`, animationDelay: `${i * 110}ms` })}
          />
        ))}
      </span>
    </span>
  );
}

function ShareVignette() {
  return (
    <span className="ls-vig ls-vig--share" aria-hidden="true">
      {/* the real link's shape (/read?story=<128-bit code>), code truncated */}
      <span className="ls-chip sk-font-meta">/read?story=3f9c…a71e</span>
      <span className="ls-devices">
        <span className="ls-dev ls-dev--phone ls-anim" />
        <span className="ls-dev ls-dev--tablet ls-anim" />
        <span className="ls-dev ls-dev--laptop ls-anim" />
      </span>
    </span>
  );
}

interface Beat {
  index: string;
  title: string;
  copy: string;
  vignette: React.ReactNode;
}

const BEATS: Beat[] = [
  {
    index: "01",
    title: "Snap your drawings",
    copy: "Point the camera at a crayon masterpiece. It lands on the page — resized, straightened, and kept right here on your device.",
    vignette: <SnapVignette />,
  },
  {
    index: "02",
    title: "Record your voice",
    copy: "One tap per page. Their voice, their pauses, their giggles — recorded to the story and normalized to a format every browser can play.",
    vignette: <RecordVignette />,
  },
  {
    index: "03",
    title: "Share one link",
    copy: "Grandparents open it in any browser. No app, no account, no install — the tape plays the way you made it, music and all.",
    vignette: <ShareVignette />,
  },
];

/* ------------------------------------------------------------------ page */

export default function Landing() {
  return (
    <div className="ls-root sk-font-ui">
      {/* Reveals are opacity-gated; keep the page readable with JS disabled. */}
      <noscript>
        <style>{`.ls-reveal{opacity:1 !important;transform:none !important}`}</style>
      </noscript>

      <Hero />

      {/* ------------------------------------------------------- two doors */}
      <section id={DOORS_ID} className="ls-section ls-section--doors" aria-labelledby="ls-doors-title">
        <div className="ls-wrap">
          {/* s01 draws no head here: the doors start right under the hero, so
              their tops peek in at the fold. The h2 still names the section. */}
          <h2 id="ls-doors-title" className="sr-only">
            Someone makes it. Someone plays it.
          </h2>

          <div className="ls-doors-grid">
            <Reveal className="ls-doors-cell" delay={80} rootMargin={DOORS_REVEAL_MARGIN}>
              <PlayDoor />
            </Reveal>
            <Reveal className="ls-doors-cell" delay={180} rootMargin={DOORS_REVEAL_MARGIN}>
              <MakeDoor />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ------------------------------------------- remember the magic? */}
      <section className="ls-band" aria-labelledby={MAGIC_TITLE_ID}>
        <div className="ls-wrap">
          <span className="ls-seam" data-ls="seam" aria-hidden="true" />
          <div className="ls-band-grid">
            <Reveal>
              <MagicBand />
            </Reveal>
            <Reveal delay={120}>
              <SurfacesRow />
            </Reveal>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- how it works */}
      <section className="ls-section" aria-labelledby="ls-how-title">
        <div className="ls-wrap">
          <Reveal className="ls-section-head">
            <p className="ls-eyebrow sk-font-meta">Three steps · one tape</p>
            <h2 id="ls-how-title" className="ls-h2 sk-font-tape">
              How the magic works
            </h2>
          </Reveal>

          <ul className="ls-beats">
            {BEATS.map((beat, i) => (
              <li key={beat.index} className="ls-beat-cell">
                <Reveal delay={80 * i} className="ls-beat-reveal">
                  <GlassPanel className="ls-beat">
                    {beat.vignette}
                    <span className="ls-beat-index sk-font-meta">{beat.index}</span>
                    <h3 className="ls-beat-title sk-font-tape">{beat.title}</h3>
                    <p className="ls-beat-copy">{beat.copy}</p>
                  </GlassPanel>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------- the protocol */}
      <section className="ls-section ls-section--protocol" aria-labelledby="ls-protocol-title">
        <div className="ls-wrap ls-protocol-grid">
          <Reveal>
            <p className="ls-eyebrow sk-font-meta">The open format</p>
            <h2 id="ls-protocol-title" className="ls-h2 sk-font-tape">
              .storysync — like PDF, for story experiences
            </h2>
            <p className="ls-lede">
              One file holds the pages, the images, the narration, the music bed and the timing,
              described by a manifest anyone can read. Published narration is always AAC/M4A, so a
              tape recorded on an Android phone plays on a grandparent&rsquo;s iPad.
            </p>
            <p className="ls-lede ls-lede--quiet">
              The spec is open and the player is plain web. Write your own reader if you like —
              nobody needs our servers to hear a story.
            </p>
            <div className="ls-protocol-links">
              <Link className="ls-link ls-link--lead sk-font-meta sk-focus" href={PROTOCOL_HREF}>
                Read the protocol
                <Glyph kind="arrow" />
              </Link>
              <a
                className="ls-link sk-font-meta sk-focus"
                href={SCHEMA_URL}
                target="_blank"
                rel="noreferrer"
              >
                Read the v2 schema
                <Glyph kind="arrow" />
              </a>
              <a
                className="ls-link sk-font-meta sk-focus"
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
              >
                Source on GitHub
                <Glyph kind="arrow" />
              </a>
            </div>
          </Reveal>

          <Reveal delay={140} className="ls-protocol-tape">
            <TapeLabel title={HOUSE_TAPE.title} author={HOUSE_TAPE.author} meta={HOUSE_TAPE.meta} />
            <p className="ls-protocol-readout sk-font-meta">
              manifest.json · assets/ · zip · ssync v2
            </p>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------ foot */}
      <footer className="ls-footer">
        <div className="ls-wrap ls-footer-inner">
          <div>
            <p className="ls-footer-mark sk-font-tape">StorySyncHQ</p>
            <p className="ls-footer-note">
              Nothing leaves this device until a <span className="ls-nw">grown-up</span> taps
              through the gate. No trackers, ever.
            </p>
            <p className="ls-company sk-font-meta" data-ls="company">
              A product of Island Development Crew LLC ·{" "}
              <span className="ls-nw">Part of the SyncHQ Suite</span>
            </p>
          </div>
          <nav className="ls-footer-links sk-font-meta" aria-label="Footer">
            <Link className="ls-footer-link sk-focus" href={PROTOCOL_HREF}>
              Protocol
            </Link>
            <a className="ls-footer-link sk-focus" href={PRIVACY_URL} target="_blank" rel="noreferrer">
              Privacy
            </a>
            <a className="ls-footer-link sk-focus" href={GITHUB_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link className="ls-footer-link sk-focus" href="/classic">
              Classic site
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
