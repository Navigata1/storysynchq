/**
 * PacketExploded — one page of a tape taken apart into its seven layers, as a
 * stack of printed plates (brief design_system LOCAL (11) "Packet bands and
 * plates", s08 FIG. 1).
 *
 * Register B on a Register A page: each plate is tape stock in its layer's
 * packet fill (`--ss-layer-*`), a 2 px ink border at radius 8, a 22 px ink
 * number chip, the layer's name (Fraunces 600 15 px — not a heading: the
 * page's legend owns those), its manifest field in mono 10.5 px, and the
 * page's value with its artifact at the right end:
 *   01 a mini label line · 02 the page picture · 03 the sentence
 *   04 an amber waveform (a dashed flat line when nothing was recorded)
 *   05 a band in the mood's colour with its icon · 06 three micro pages
 *   07 a tape-red stroke, the "V2.1 · DRAFT" tag and a round tape-red seal
 * An empty plate prints its value in ink-3 italic.
 *
 * Markup: an ordered list (`[data-sk="packet-exploded"]`) of the plates in
 * layer order, 01 first, so assistive tech reads Metadata first; CSS draws it
 * bottom-to-top (07 on top). At ≥ 768 px each plate is a parallelogram — a
 * decorative backing (`[data-plate="backing"]`) skewed −18°, contents upright
 * — 10 px apart, each 14 px right of the one below, joined by dashed
 * connectors at both corners. Below 768 px the plates lie flat, full width.
 *
 * The plates are data (`{ n, layer, path, value, empty }`, see
 * src/components/protocol/plates.ts); the component holds no story content.
 * Print, not chrome: nothing takes focus, nothing moves.
 */

import * as React from "react";
import { Cloud, CloudRain, Compass, Eye, Leaf, Moon, Stamp, Star, Sun, type LucideIcon } from "lucide-react";
import type { MoodName } from "@/lib/audio/moods";
import { LAYER_FILL, REGISTER_B, type PacketLayerName } from "./tokens";
import "./packet-exploded.css";

export interface ExplodedPlate {
  /** "01" … "07". */
  n: string;
  layer: PacketLayerName;
  /** The manifest field, e.g. `pages[].text.audioUrl`. */
  path: string;
  /** What the page carries there. Its first " · " part is set bold. */
  value: string;
  /** The page does not use this layer: the value says so, in ink-3 italic. */
  empty?: boolean;
}

/** What the artifacts need beyond the plates' values. */
export interface PacketExplodedArt {
  /** 01's label line: the title, set apart from the rest of the Metadata value. */
  title?: string;
  /** 02's thumbnail: the page picture, same-origin. Decorative — the value carries the alt text. */
  picture?: string;
  /** 05's band: the page's mood (colour and icon). */
  mood?: MoodName | null;
}

export interface PacketExplodedProps extends Omit<React.HTMLAttributes<HTMLOListElement>, "children"> {
  /** Seven plates, in layer order (01 Metadata first). */
  plates: readonly ExplodedPlate[];
  art?: PacketExplodedArt;
  /** The Signature plate's tag. Default "V2.1 · DRAFT"; null prints none. */
  signatureTag?: string | null;
}

/** Each mood's icon (brief design_system: the sprite's Lucide symbols). */
const MOOD_ICON: Record<MoodName, LucideIcon> = {
  Wonder: Star,
  Adventure: Compass,
  Calm: Moon,
  Joy: Sun,
  Hush: Cloud,
  Rain: CloudRain,
  Suspense: Eye,
  Melancholy: Leaf,
};

/** 32 bar heights (%), the reel's `.ss-wave` pattern; 48 bars repeat it. */
const WAVE = [
  18, 34, 58, 76, 52, 88, 64, 40, 22, 12, 30, 62, 94, 70, 46, 80, 56, 28, 14, 8, 24, 48, 72, 100, 66, 42, 58, 36,
  20, 44, 26, 10,
];
const WAVE_BARS = 48;

/** The mood band's notes: the reference's six dots, (x, y) in px. */
const NOTES: ReadonlyArray<readonly [number, number]> = [
  [22, 12],
  [28, 8],
  [34, 5],
  [40, 9],
  [46, 6],
  [52, 12],
];

/** The seal's wax: a 32-unit blob with a soft wobbly rim (the reference's own path). */
const SEAL_PATH =
  "M30.68 16 31.53 17.36 31.41 18.72 30.24 19.81 28.72 20.63 27.73 21.47 27.52 22.65 27.63 24.14 27.33 25.5 26.28 26.28 24.82 26.51 23.52 26.74 22.69 27.58 22.1 29.07 21.3 30.56 20.08 31.23 18.61 30.8 17.21 29.84 16 29.23 14.82 29.44 13.52 30.08 12.16 30.33 11.03 29.67 10.24 28.36 9.55 27.16 8.53 26.67 6.97 26.76 5.24 26.76 3.98 26.09 3.58 24.69 3.76 23.07 3.77 21.7 3.12 20.69 2 19.75 1.2 18.61 1.34 17.28 2.28 16 3.24 14.88 3.44 13.79 2.8 12.46 2.04 10.92 1.99 9.47 2.92 8.45 4.37 7.85 5.57 7.25 6.2 6.2 6.56 4.75 7.23 3.48 8.49 2.99 10.09 3.33 11.59 3.87 12.73 3.79 13.68 2.83 14.74 1.55 16 .83 17.3 1.14 18.45 2.11 19.51 2.89 20.74 2.98 22.24 2.62 23.75 2.57 24.82 3.41 25.23 5.01 25.32 6.68 25.74 7.83 26.85 8.4 28.35 8.87 29.51 9.7 29.81 10.98 29.44 12.4 29.17 13.68 29.63 14.81Z";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const SEP = " · ";

/**
 * "a · b · c" → [first line, rest]: the first `lead` parts, then the others.
 * With `head`, a value that starts with it splits right after it.
 */
function splitValue(value: string, lead = 1, head?: string): [string, string] {
  if (head && value.startsWith(`${head}${SEP}`)) return [head, value.slice(head.length + SEP.length)];
  const parts = value.split(SEP);
  return [parts.slice(0, lead).join(SEP), parts.slice(lead).join(SEP)];
}

/**
 * The value as a file line: its first part bold, the rest of the first line
 * beside it, the remainder on the line under (the " · " there is kept in the
 * text for every reader and shown as the break). Text content = the value.
 */
function FileLine({ plate, lead = 1, className }: { plate: ExplodedPlate; lead?: number; className?: string }) {
  if (plate.empty) {
    return (
      <span data-plate="value" className={cx("sk-px-file sk-px-file--empty", className)}>
        {plate.value}
      </span>
    );
  }
  const [first, tail] = splitValue(plate.value, lead);
  const [head, more] = splitValue(first, 1);
  return (
    <span data-plate="value" className={cx("sk-px-file", className)}>
      <span className="sk-px-line">
        <b className="sk-px-head">{head}</b>
        {more ? `${SEP}${more}` : null}
      </span>
      {tail ? (
        <>
          <span className="sk-px-sep">{SEP}</span>
          <span className="sk-px-tail">{tail}</span>
        </>
      ) : null}
    </span>
  );
}

function Wave() {
  return (
    <svg className="sk-px-wave" viewBox={`0 0 ${WAVE_BARS * 2} 26`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {Array.from({ length: WAVE_BARS }, (_, i) => {
        const h = Math.max(2, (WAVE[i % WAVE.length] / 100) * 26);
        return <rect key={i} x={i * 2 + 0.2} y={(26 - h) / 2} width={1.4} height={h} rx={0.7} />;
      })}
    </svg>
  );
}

/** Three 18×24 renderings of a page: default, high contrast, easier to read. Decorative. */
function MicroPages() {
  const { paper, ink, ink3, label } = REGISTER_B;
  /** The night sky the little picture shows, as the reference draws it. */
  const night = "#2b3a66";
  return (
    <span className="sk-px-renders" aria-hidden="true">
      <svg viewBox="0 0 18 24" focusable="false">
        <rect x=".5" y=".5" width="17" height="23" rx="2" fill={paper} stroke={ink} />
        <rect x="3" y="3" width="12" height="9" rx="1" fill={night} />
        <circle cx="11" cy="6.5" r="1.6" fill={label} />
        <rect x="3" y="14.5" width="12" height="1.6" rx=".8" fill={ink3} />
        <rect x="3" y="18" width="9" height="1.6" rx=".8" fill={ink3} />
      </svg>
      <svg viewBox="0 0 18 24" focusable="false">
        <rect x=".5" y=".5" width="17" height="23" rx="2" fill="#000" stroke={ink} />
        <rect x="3" y="3" width="12" height="9" rx="1" fill="none" stroke="#fff" strokeWidth="1.2" />
        <circle cx="11" cy="6.5" r="1.6" fill={label} />
        <rect x="3" y="14.2" width="12" height="2.4" rx="1" fill="#fff" />
        <rect x="3" y="18.4" width="9" height="2.4" rx="1" fill="#fff" />
      </svg>
      <svg viewBox="0 0 18 24" focusable="false">
        <rect x=".5" y=".5" width="17" height="23" rx="2" fill={LAYER_FILL.Text} stroke={ink} />
        <rect x="3" y="3" width="12" height="7" rx="1" fill={night} />
        <circle cx="11" cy="5.8" r="1.4" fill={label} />
        <rect x="3" y="13" width="10" height="2.6" rx="1.3" fill={ink} />
        <rect x="3" y="18.4" width="7" height="2.6" rx="1.3" fill={ink} />
      </svg>
    </span>
  );
}

/** The round tape-red seal. Unsealed (an outline) while nothing is signed. */
function Seal({ sealed }: { sealed: boolean }) {
  return (
    <span className="sk-px-seal" data-sealed={sealed ? "true" : "false"} aria-hidden="true">
      <svg className="sk-px-seal-wax" viewBox="0 0 32 32" focusable="false">
        <path d={SEAL_PATH} />
        <circle cx="16" cy="16" r="10.2" />
      </svg>
      <Stamp className="sk-px-seal-icon" strokeWidth={2.2} aria-hidden="true" focusable="false" />
    </span>
  );
}

function Artifact({ plate, art }: { plate: ExplodedPlate; art: PacketExplodedArt }) {
  switch (plate.layer) {
    case "Metadata": {
      const [title, rest] = splitValue(plate.value, 1, art.title);
      return (
        <span className="sk-px-label">
          <i aria-hidden="true" />
          <i aria-hidden="true" />
          <span data-plate="value" className="sk-px-label-text">
            <b>{title}</b>
            {rest ? (
              <>
                <span className="sk-px-sep"> · </span>
                <em>{rest}</em>
              </>
            ) : null}
          </span>
        </span>
      );
    }
    case "Visual":
      return (
        <>
          {art.picture && !plate.empty ? (
            <span className="sk-px-photo" aria-hidden="true">
              {/* A 40 px print of the page's own same-origin picture; decorative (the alt text is the value). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={art.picture} alt="" width={40} height={40} loading="lazy" decoding="async" />
            </span>
          ) : null}
          <FileLine plate={plate} />
        </>
      );
    case "Text":
      return (
        <p data-plate="value" className={cx("sk-px-sentence", plate.empty && "sk-px-file--empty")}>
          {plate.value}
        </p>
      );
    case "Voice":
      return (
        <>
          {plate.empty ? <span className="sk-px-flat" aria-hidden="true" /> : <Wave />}
          <FileLine plate={plate} />
        </>
      );
    case "Sound": {
      const mood = plate.empty ? null : art.mood ?? null;
      const Icon = mood ? MOOD_ICON[mood] : null;
      return (
        <>
          <span
            className={cx("sk-px-band", !mood && "sk-px-band--silent")}
            style={mood ? ({ "--sk-px-mood": `var(--mood-${mood.toLowerCase()})` } as React.CSSProperties) : undefined}
            aria-hidden="true"
          >
            {Icon ? <Icon className="sk-px-band-icon" strokeWidth={2.4} aria-hidden="true" focusable="false" /> : null}
            {mood ? NOTES.map(([x, y]) => <u key={x} style={{ left: x, top: y }} />) : null}
          </span>
          {/* "Wonder · A major pentatonic" over "76 BPM · ducks 12 dB" */}
          <FileLine plate={plate} lead={2} />
        </>
      );
    }
    case "Behavior":
      return (
        <>
          <FileLine plate={plate} />
          <MicroPages />
        </>
      );
    case "Signature":
      return (
        <>
          <Seal sealed={!plate.empty} />
          <FileLine plate={plate} className="sk-px-file--sig" />
        </>
      );
    default:
      return <FileLine plate={plate} />;
  }
}

export function PacketExploded({
  plates,
  art = {},
  signatureTag = "V2.1 · DRAFT",
  className,
  ...rest
}: PacketExplodedProps) {
  return (
    <ol {...rest} data-sk="packet-exploded" className={cx("sk-px", className)}>
      {plates.map((plate, index) => {
        const signature = plate.layer === "Signature";
        const style = {
          "--sk-px-i": index,
          "--sk-px-fill": `var(--ss-layer-${plate.layer.toLowerCase()})`,
        } as React.CSSProperties;
        return (
          <li
            key={plate.layer}
            data-layer={plate.layer}
            data-empty={plate.empty ? "true" : undefined}
            className={cx("sk-px-plate", signature && "sk-px-plate--sig")}
            style={style}
          >
            <span data-plate="backing" className="sk-px-back" aria-hidden="true" />
            <span className="sk-px-in">
              <span className="sk-px-num" aria-hidden="true">
                {plate.n}
              </span>
              <span className="sk-px-id">
                <span data-plate="name" className="sk-px-name">
                  {plate.layer}
                </span>
                {signature && signatureTag ? (
                  <>
                    <span className="sr-only"> (</span>
                    <span data-plate="tag" className="sk-px-tag">
                      {signatureTag}
                    </span>
                    <span className="sr-only">)</span>
                  </>
                ) : null}
                <span className="sr-only">, </span>
                <code data-plate="path" className="sk-px-path">
                  {plate.path}
                </code>
                <span className="sr-only">: </span>
              </span>
              <span className="sk-px-art">
                <Artifact plate={plate} art={art} />
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default PacketExploded;
