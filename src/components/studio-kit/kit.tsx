"use client";

/**
 * studio-kit — the shared primitives for "The Digital Studio".
 *
 * Two registers, one kit (docs/design-direction.md §2):
 *   Register A — studio chrome: GlassPanel, TransportButton, ModeToggle, VUMeter
 *   Register B — tape stock:    Reel, TapeLabel
 *   BigButton bridges both (child-scale action, warm gradients).
 *
 * Cascade note: kit.css lives in @layer components, so any Tailwind utility a
 * consumer passes via `className` wins the override. Style freely from outside.
 *
 * Inherited CSS custom properties you can set on any ancestor:
 *   --sk-ink            ink colour Reel picks up (GlassPanel sets it light,
 *                       TapeLabel sets it to tape ink — nested reels adapt)
 *   --sk-big-h          BigButton min-height (default 64px; child mode: 88–104px)
 *   --sk-transport-size TransportButton diameter (default 56px)
 */

import * as React from "react";
import "./kit.css";

/* ------------------------------------------------------------------ tokens */

/** Register B — tape stock palette. */
export const TAPE = {
  paper: "#FFFDF6",
  ink: "#1E1A16",
  label: "#FFC93C",
  red: "#E3452F",
  shell: "#3B3733",
} as const;

/** Register A — studio chrome palette (convenience; kit styling already uses it). */
export const STUDIO = {
  bg: "#0a0e1a",
  gold: "#F59E0B",
  violet: "#7C6BFF",
} as const;

/* ------------------------------------------------------------------ utils */

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/* ------------------------------------------------------------------- Reel */

export interface ReelProps {
  /** Spin while audio moves. Pauses in place when false (it keeps its angle). */
  spinning?: boolean;
  /** Diameter in px. Default 56. */
  size?: number;
  className?: string;
}

const REEL_SPOKES = [0, 60, 120, 180, 240, 300];

/**
 * A cassette reel: 3px ink rim, dashed inner circle, six spokes, solid hub.
 * Decorative (aria-hidden) — pair it with a labelled control for state.
 * Colour comes from the inherited `--sk-ink` (light inside GlassPanel, ink
 * inside TapeLabel), so it reads correctly in both registers.
 */
export function Reel({ spinning = false, size = 56, className }: ReelProps) {
  return (
    <span
      data-sk="reel"
      data-spinning={spinning ? "true" : "false"}
      aria-hidden="true"
      className={cx("sk-reel", spinning && "sk-reel--spinning", className)}
      style={{ width: size, height: size }}
    >
      <svg className="sk-reel-svg" viewBox="0 0 100 100" focusable="false" aria-hidden="true">
        <circle className="sk-reel-face" cx="50" cy="50" r="45" />
        <circle className="sk-reel-rim" cx="50" cy="50" r="45" />
        <circle className="sk-reel-dash" cx="50" cy="50" r="32" />
        {REEL_SPOKES.map((angle) => (
          <line
            key={angle}
            className="sk-reel-spoke"
            x1="50"
            y1="21"
            x2="50"
            y2="39"
            transform={`rotate(${angle} 50 50)`}
          />
        ))}
        <circle className="sk-reel-hub" cx="50" cy="50" r="9" />
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------- GlassPanel */

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
}

/**
 * Register A surface: the studio chrome panel. Recedes — never competes with
 * the Stage. Pass Tailwind utilities in `className` to adjust padding/radius.
 */
export function GlassPanel({ children, className, ...rest }: GlassPanelProps) {
  return (
    <div
      data-sk="glass"
      {...rest}
      className={cx(
        "sk-glass rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- TapeLabel */

export interface TapeLabelProps {
  /** The story title — Fraunces 900, the loudest thing on the card. */
  title: string;
  author?: string;
  /** Mono label line, e.g. "SIDE A · 8 PAGES · 4:32". */
  meta?: React.ReactNode;
  /** Override the yellow header band (the red stripe is fixed brand). */
  accent?: string;
  className?: string;
}

/**
 * Register B artifact: the cassette label card. Paper field, 3px ink border,
 * label-yellow band under a tape-red stripe. This is the cover gate of every
 * published story and the face of a story in the library.
 */
export function TapeLabel({ title, author, meta, accent, className }: TapeLabelProps) {
  return (
    <div data-sk="tape" className={cx("sk-tape", className)}>
      <div className="sk-tape-stripe" aria-hidden="true" />
      <div className="sk-tape-band" style={{ backgroundColor: accent ?? TAPE.label }}>
        <span className="sk-tape-holes" aria-hidden="true">
          <span className="sk-tape-hole" />
          <span className="sk-tape-hole" />
        </span>
        <span className="sk-tape-mark sk-font-meta" aria-hidden="true">
          StorySync
        </span>
      </div>
      <div className="sk-tape-field">
        <div className="sk-tape-title sk-font-tape">{title}</div>
        {author ? <div className="sk-tape-author sk-font-tape">by {author}</div> : null}
        {meta ? <div className="sk-tape-meta sk-font-meta">{meta}</div> : null}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- BigButton */

export type BigButtonVariant = "gold" | "violet" | "red" | "ghost";

export interface BigButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Emoji, SVG, or any node. Decorative — the label names the button. */
  icon?: React.ReactNode;
  label: string;
  variant?: BigButtonVariant;
}

/**
 * Child-scale action button. ≥64px tall by default; raise `--sk-big-h` (or add
 * a Tailwind min-h utility) for child mode. The red variant pulses a record
 * ring — that ring goes static, not invisible, under prefers-reduced-motion.
 */
export function BigButton({
  icon,
  label,
  variant = "gold",
  disabled = false,
  className,
  type = "button",
  ...rest
}: BigButtonProps) {
  return (
    <button
      data-sk="big"
      data-variant={variant}
      {...rest}
      type={type}
      disabled={disabled}
      className={cx("sk-big sk-focus sk-font-ui", `sk-big--${variant}`, className)}
    >
      {variant === "red" ? <span className="sk-big-ring" aria-hidden="true" /> : null}
      {icon ? (
        <span className="sk-big-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="sk-big-label">{label}</span>
    </button>
  );
}

/* ---------------------------------------------------------- TransportButton */

export type TransportKind = "prev" | "play" | "pause" | "rec" | "stop" | "next";

export interface TransportButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  kind: TransportKind;
  /** Lit state — gold for playback controls, pulsing red for rec. */
  active?: boolean;
}

const TRANSPORT_LABEL: Record<TransportKind, string> = {
  prev: "Previous page",
  play: "Play",
  pause: "Pause",
  rec: "Record",
  stop: "Stop",
  next: "Next page",
};

function TransportGlyph({ kind }: { kind: TransportKind }) {
  return (
    <svg className="sk-transport-glyph" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
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
      {kind === "play" ? <path d="M6.4 4.4v15.2L19.6 12z" /> : null}
      {kind === "pause" ? (
        <>
          <rect x="6.2" y="4.8" width="4" height="14.4" rx="1.4" />
          <rect x="13.8" y="4.8" width="4" height="14.4" rx="1.4" />
        </>
      ) : null}
      {kind === "rec" ? <circle cx="12" cy="12" r="6.4" /> : null}
      {kind === "stop" ? <rect x="5.8" y="5.8" width="12.4" height="12.4" rx="2" /> : null}
    </svg>
  );
}

/**
 * Round studio transport control. `active` lights it gold; an active `rec`
 * pulses red. Always labelled — the glyph is aria-hidden.
 */
export function TransportButton({
  kind,
  active,
  disabled = false,
  className,
  type = "button",
  ...rest
}: TransportButtonProps) {
  const ariaLabel = rest["aria-label"] ?? TRANSPORT_LABEL[kind];
  return (
    <button
      data-sk="transport"
      data-kind={kind}
      {...rest}
      type={type}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={active === undefined ? undefined : active}
      className={cx(
        "sk-transport sk-focus",
        `sk-transport--${kind}`,
        active && "is-active",
        className,
      )}
    >
      {kind === "rec" ? <span className="sk-transport-ring" aria-hidden="true" /> : null}
      <TransportGlyph kind={kind} />
    </button>
  );
}

/* --------------------------------------------------------------- ModeToggle */

export interface ModeToggleProps {
  advanced: boolean;
  onChange: (advanced: boolean) => void;
  disabled?: boolean;
  className?: string;
  /** Accessible name for the switch. Default "Advanced mode". */
  label?: string;
}

/**
 * Simple ◉──○ Advanced. A real `role="switch"` button: Space/Enter toggle,
 * arrow keys set an explicit side. The flanking words are decorative.
 */
export function ModeToggle({
  advanced,
  onChange,
  disabled = false,
  className,
  label = "Advanced mode",
}: ModeToggleProps) {
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        onChange(true);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        onChange(false);
      }
    },
    [onChange],
  );

  return (
    <div data-sk="mode" className={cx("sk-mode sk-font-meta", className)}>
      <span className={cx("sk-mode-word", !advanced && "is-on")} aria-hidden="true">
        Simple
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={advanced}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!advanced)}
        onKeyDown={handleKeyDown}
        className="sk-mode-track sk-focus"
      >
        <span className="sk-mode-knob" aria-hidden="true" />
      </button>
      <span className={cx("sk-mode-word", advanced && "is-on")} aria-hidden="true">
        Advanced
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ VUMeter */

export interface VUMeterProps {
  /** 0..1, clamped. Drive it from the engine's analyser. */
  level: number;
  /** Accessible name. Default "Audio level". */
  label?: string;
  className?: string;
}

/**
 * Compact horizontal gain meter: segmented gold bars running into red
 * headroom past the 78% redline. Fast attack, slow decay — the transition
 * duration is swapped imperatively so the needle falls like a real meter.
 */
export function VUMeter({ level, label = "Audio level", className }: VUMeterProps) {
  const value = clamp01(level);
  const fillRef = React.useRef<HTMLDivElement | null>(null);
  const prevRef = React.useRef(0);

  React.useEffect(() => {
    const rising = value >= prevRef.current;
    prevRef.current = value;
    const el = fillRef.current;
    if (!el) return;
    el.style.transitionDuration = rising ? "70ms" : "520ms";
  }, [value]);

  const clip = `inset(0 ${Math.round((1 - value) * 1000) / 10}% 0 0)`;

  return (
    <div
      data-sk="vu"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Math.round(value * 100) / 100}
      aria-valuetext={`${Math.round(value * 100)} percent`}
      className={cx("sk-vu", className)}
    >
      <div className="sk-vu-track">
        <div
          ref={fillRef}
          className="sk-vu-fill"
          style={{ clipPath: clip, WebkitClipPath: clip }}
        />
        <div className="sk-vu-redline" aria-hidden="true" />
      </div>
    </div>
  );
}
