"use client";

/**
 * LandingNav — the s01 top nav, at the top of the hero
 * (docs/vision/tickets/T07-magic-band-surfaces-company-line.md).
 *
 * The wordmark (Fraunces 700 with the cassette icon) goes home; the four links
 * name the whole system: "StorySync Reader", "StorySync Creator",
 * "The SSYNC Protocol", "Privacy".
 *
 * Below 640 px the links collapse behind a disclosure button named "Menu"
 * (aria-expanded / aria-controls). Enter or Space opens it (it is a native
 * button); Escape closes it and returns focus to the button; a pointer press
 * outside the nav closes it; tabbing out of the nav closes it. Nothing here
 * animates — the menu simply appears — so there is no reduced-motion variant
 * to write. Styles live in landing-bands.css.
 */

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

/** The app icon (public/icons): the same cassette the favicon and PWA carry. */
const ICON_SRC = "/icons/icon-96x96.png";
const MENU_ID = "ls-nav-menu";

interface NavLink {
  label: string;
  href: string;
  /** Leaves the app (opens in a new tab, like the footer's Privacy link). */
  external?: boolean;
}

export interface LandingNavProps {
  /** The PRIVACY.md URL the footer already links to. */
  privacyHref: string;
}

export function LandingNav({ privacyHref }: LandingNavProps) {
  const [open, setOpen] = React.useState(false);
  const navRef = React.useRef<HTMLElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);

  const links: readonly NavLink[] = [
    { label: "StorySync Reader", href: "/read" },
    { label: "StorySync Creator", href: "/studio" },
    { label: "The SSYNC Protocol", href: "/protocol" },
    { label: "Privacy", href: privacyHref, external: true },
  ];

  // While the menu is open: Escape closes it (focus back on the button), and a
  // press anywhere outside the nav closes it.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const nav = navRef.current;
      const active = document.activeElement;
      setOpen(false);
      // Return focus only if it was in the nav (or nowhere) — never steal it.
      if (!active || active === document.body || (nav && nav.contains(active))) {
        buttonRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const nav = navRef.current;
      if (nav && event.target instanceof Node && !nav.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  /** Tabbing past the last link closes the menu rather than leaving it over the hero. */
  const onBlur = React.useCallback((event: React.FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    if (next) setOpen(false);
  }, []);

  const close = React.useCallback(() => setOpen(false), []);

  return (
    <nav
      ref={navRef}
      aria-label="Main"
      className="ls-nav"
      data-ls="nav"
      data-open={open ? "true" : "false"}
      onBlur={onBlur}
    >
      <Link href="/" className="ls-nav-mark sk-focus" onClick={close}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a 22 px app icon; no optimisation pipeline yet (CLAUDE.md §3) */}
        <img className="ls-nav-icon" src={ICON_SRC} alt="" width={22} height={22} decoding="async" />
        <span className="ls-nav-word sk-font-tape">StorySyncHQ</span>
      </Link>

      <button
        ref={buttonRef}
        type="button"
        className="ls-nav-menu sk-focus"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={MENU_ID}
        onClick={() => setOpen((was) => !was)}
      >
        {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </button>

      <ul id={MENU_ID} className="ls-nav-links">
        {links.map((link) => (
          <li key={link.label}>
            {link.external ? (
              <a
                className="ls-nav-link sk-focus"
                href={link.href}
                target="_blank"
                rel="noreferrer"
                onClick={close}
              >
                {link.label}
              </a>
            ) : (
              <Link className="ls-nav-link sk-focus" href={link.href} onClick={close}>
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default LandingNav;
