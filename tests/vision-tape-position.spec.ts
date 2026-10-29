// T09b · Where the tape is: story position, tape packs, the strip (Node, pure).
//
// Reference: s02 — "two 20px reels, each on a tape-brown pack disc (left pack
// 18px wide, right 9px: early in the tape)" and "a 3px tape strip across the
// full width … with 8 ticks (segment 1 gold, segment 2 at 70%)". s05 — "a 3px
// gold tape strip … with 5 ticks (segments 1-2 full, 3 at 80%)". The callout:
// "no scrubber, no timecode, only a strip of tape filling up."
//
// The seam: src/components/player/tape-position.ts maps (page index, page
// count, in-page fraction 0–1) → the story position p = (index + fraction) /
// count, the two pack diameters for a reel size (left = big − (big − small)·p,
// right = small + (big − small)·p) and the strip's fill. It also turns what
// the Player knows about the voice (the clip's clock, the lit word) into the
// in-page fraction. Inputs are clamped; nothing is counted or stored.

import { test, expect } from "@playwright/test";
import {
  PACK_EMPTY,
  PACK_FULL,
  clipFraction,
  packDiameters,
  segmentFill,
  speechFraction,
  storyPosition,
  tapePosition,
} from "../src/components/player/tape-position";

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

test.describe("T09b · story position p = (index + fraction) / count", () => {
  test("the ticket's three points, and Grandma's page 3 at 80 %", () => {
    expect(storyPosition(0, 8, 0)).toBe(0);
    expect(storyPosition(1, 8, 0.5)).toBeCloseTo(0.1875, 12);
    expect(storyPosition(7, 8, 1)).toBe(1);
    // s02: page 2 of 8 with the voice 70 % through; s05: page 3 of 5 at 80 %
    expect(storyPosition(1, 8, 0.7)).toBeCloseTo(0.2125, 12);
    expect(storyPosition(2, 5, 0.8)).toBeCloseTo(0.56, 12);
  });

  test("a new page starts where the last one ended: turning forward never moves p back", () => {
    for (const count of [1, 2, 5, 8, 23]) {
      let last = -1;
      for (let i = 0; i < count; i++) {
        for (const f of [0, 0.25, 0.5, 0.999, 1]) {
          const p = storyPosition(i, count, f);
          expect(p).toBeGreaterThanOrEqual(last);
          last = p;
        }
        // the end of page i is the start of page i + 1
        if (i + 1 < count) expect(close(storyPosition(i, count, 1), storyPosition(i + 1, count, 0))).toBe(true);
      }
    }
  });

  test("clamps: negative, NaN and over-range inputs; count 0 → p 0", () => {
    expect(storyPosition(0, 0, 0.5)).toBe(0);
    expect(storyPosition(3, 0, 1)).toBe(0);
    expect(storyPosition(0, -4, 1)).toBe(0);
    expect(storyPosition(0, Number.NaN, 1)).toBe(0);
    expect(storyPosition(0, Number.POSITIVE_INFINITY, 1)).toBe(0);
    // index below 0 → page 1; past the end → the last page
    expect(storyPosition(-3, 8, 0)).toBe(0);
    expect(storyPosition(Number.NaN, 8, 0.5)).toBeCloseTo(0.0625, 12);
    expect(storyPosition(12, 8, 0)).toBeCloseTo(0.875, 12);
    expect(storyPosition(12, 8, 1)).toBe(1);
    // the fraction stays inside its page
    expect(storyPosition(1, 8, -2)).toBeCloseTo(0.125, 12);
    expect(storyPosition(1, 8, 7)).toBeCloseTo(0.25, 12);
    expect(storyPosition(1, 8, Number.NaN)).toBeCloseTo(0.125, 12);
    // a fractional index is a page, not a place between pages
    expect(storyPosition(1.6, 8, 0)).toBeCloseTo(0.125, 12);
    for (const args of [
      [-1, -1, -1],
      [99, 3, 99],
      [Number.NaN, Number.NaN, Number.NaN],
      [Number.NEGATIVE_INFINITY, 5, Number.POSITIVE_INFINITY],
    ] as const) {
      const p = storyPosition(args[0], args[1], args[2]);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("T09b · the two tape packs", () => {
  for (const reel of [18, 20]) {
    test(`reel ${reel} px · full left / empty right at the start, swapped at the end, crossing at p = 0.5`, () => {
      const big = reel * PACK_FULL;
      const small = reel * PACK_EMPTY;
      expect(big).toBeGreaterThan(small);
      // a pack is never smaller than the reel that sits on it
      expect(small).toBeGreaterThanOrEqual(reel);

      const start = packDiameters(0, reel);
      expect(start.left).toBeCloseTo(big, 9);
      expect(start.right).toBeCloseTo(small, 9);
      const end = packDiameters(1, reel);
      expect(end.left).toBeCloseTo(small, 9);
      expect(end.right).toBeCloseTo(big, 9);
      const mid = packDiameters(0.5, reel);
      expect(Math.abs(mid.left - mid.right)).toBeLessThanOrEqual(0.5);

      // the formula, at the reference's moment (s02: page 2 of 8, 70 % in)
      const p = storyPosition(1, 8, 0.7);
      const at = packDiameters(p, reel);
      expect(at.left).toBeCloseTo(big - (big - small) * p, 9);
      expect(at.right).toBeCloseTo(small + (big - small) * p, 9);
      expect(at.left).toBeGreaterThan(at.right); // "left pack big early in a tape"
    });
  }

  test("tape only moves from left to right: the left pack never grows as p rises, the right never shrinks", () => {
    let prev = packDiameters(0, 20);
    for (let k = 1; k <= 200; k++) {
      const now = packDiameters(k / 200, 20);
      expect(now.left).toBeLessThanOrEqual(prev.left);
      expect(now.right).toBeGreaterThanOrEqual(prev.right);
      // the tape is all there: the two packs always add up to the same
      expect(now.left + now.right).toBeCloseTo(prev.left + prev.right, 9);
      prev = now;
    }
  });

  test("the packs fit the chip: they never touch across the reels' centres (pill 26 px / 24 px at 320, window 46 px)", () => {
    for (let k = 0; k <= 20; k++) {
      const p = k / 20;
      const pill = packDiameters(p, 18);
      expect((pill.left + pill.right) / 2).toBeLessThan(24); // the 320 px pill's reels are 24 px apart
      const wide = packDiameters(p, 20);
      expect(Math.max(wide.left, wide.right)).toBeLessThanOrEqual(32); // inside the 34 px reel window
    }
  });

  test("clamps: p outside 0–1, NaN p, and a reel size of 0 / NaN", () => {
    expect(packDiameters(-1, 20)).toEqual(packDiameters(0, 20));
    expect(packDiameters(4, 20)).toEqual(packDiameters(1, 20));
    expect(packDiameters(Number.NaN, 20)).toEqual(packDiameters(0, 20));
    expect(packDiameters(0.3, 0)).toEqual({ left: 0, right: 0 });
    expect(packDiameters(0.3, Number.NaN)).toEqual({ left: 0, right: 0 });
    expect(packDiameters(0.3, -20)).toEqual({ left: 0, right: 0 });
  });
});

test.describe("T09b · the strip of tape", () => {
  test("fill = p; one segment per page, each holding its page's share", () => {
    const s02 = tapePosition(1, 8, 0.7, 20);
    expect(s02.fill).toBeCloseTo(0.2125, 12);
    expect(s02.p).toBe(s02.fill);
    expect(s02.left).toBeCloseTo(packDiameters(s02.p, 20).left, 12);
    expect(s02.right).toBeCloseTo(packDiameters(s02.p, 20).right, 12);
    // s02: segment 1 full, segment 2 at 70 %, the rest empty
    const fills = Array.from({ length: 8 }, (_, i) => segmentFill(s02.p, 8, i));
    expect(fills[0]).toBe(1);
    expect(fills[1]).toBeCloseTo(0.7, 9);
    for (const f of fills.slice(2)) expect(f).toBe(0);
    // s05: segments 1–2 full, 3 at 80 %
    const s05 = Array.from({ length: 5 }, (_, i) => segmentFill(storyPosition(2, 5, 0.8), 5, i));
    expect(s05[0]).toBe(1);
    expect(s05[1]).toBe(1);
    expect(s05[2]).toBeCloseTo(0.8, 9);
    expect(s05[3]).toBe(0);
    expect(s05[4]).toBe(0);
    // the segments' fills add up to the whole strip's fill
    for (const [i, n, f] of [
      [0, 1, 0.3],
      [3, 8, 0.25],
      [4, 5, 1],
    ] as const) {
      const p = storyPosition(i, n, f);
      const sum = Array.from({ length: n }, (_, k) => segmentFill(p, n, k)).reduce((a, b) => a + b, 0);
      expect(sum / n).toBeCloseTo(p, 9);
    }
  });

  test("segment clamps: out-of-range segment, count 0, NaN", () => {
    expect(segmentFill(0.5, 8, -1)).toBe(0);
    expect(segmentFill(0.5, 8, 8)).toBe(0);
    expect(segmentFill(0.5, 0, 0)).toBe(0);
    expect(segmentFill(Number.NaN, 8, 0)).toBe(0);
    expect(segmentFill(2, 8, 7)).toBe(1);
  });
});

test.describe("T09b · the in-page fraction, from what the Player knows", () => {
  test("recorded voice: currentTime / duration of the clip", () => {
    expect(clipFraction(0, 6)).toBe(0);
    expect(clipFraction(1, 6)).toBeCloseTo(1 / 6, 12);
    expect(clipFraction(4, 6)).toBeCloseTo(2 / 3, 12);
    expect(clipFraction(6, 6)).toBe(1);
    // metadata not loaded yet, a stream of unknown length, or a clock past the end
    expect(clipFraction(2, Number.NaN)).toBe(0);
    expect(clipFraction(2, 0)).toBe(0);
    expect(clipFraction(2, Number.POSITIVE_INFINITY)).toBe(0);
    expect(clipFraction(7, 6)).toBe(1);
    expect(clipFraction(-1, 6)).toBe(0);
    expect(clipFraction(Number.NaN, 6)).toBe(0);
  });

  test("browser voice: (lit word + 1) / word count", () => {
    expect(speechFraction(-1, 10)).toBe(0); // nothing spoken yet
    expect(speechFraction(0, 10)).toBeCloseTo(0.1, 12);
    expect(speechFraction(4, 10)).toBeCloseTo(0.5, 12);
    expect(speechFraction(9, 10)).toBe(1);
    expect(speechFraction(30, 10)).toBe(1);
    expect(speechFraction(3, 0)).toBe(0);
    expect(speechFraction(Number.NaN, 10)).toBe(0);
  });

  test("pure: the same inputs give the same answer, and nothing is kept between calls", () => {
    const a = tapePosition(3, 8, 0.4, 18);
    tapePosition(7, 8, 1, 18);
    const b = tapePosition(3, 8, 0.4, 18);
    expect(b).toEqual(a);
  });
});
