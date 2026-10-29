"use client";

/**
 * useSpread — is there room for an open book?
 *
 * At ≥ 1024 px wide AND landscape the Player lays a page with a picture and
 * words out as a two-page spread (s02); below that, the shipped phone/tablet
 * layouts stand. The answer is client-only: the server snapshot is "stacked"
 * (false), so the server render and the hydrating render agree and React
 * re-renders with the real media query straight after — behind the cover
 * gate, which covers the first paint. No hydration mismatch, no flash.
 */

import * as React from "react";

/** The breakpoint, as one media query. */
export const SPREAD_QUERY = "(min-width: 1024px) and (orientation: landscape)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(SPREAD_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(SPREAD_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/** True while the viewport is wide and landscape enough for a two-page spread. */
export function useSpread(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default useSpread;
