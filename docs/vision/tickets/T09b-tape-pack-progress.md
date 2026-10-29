# T09b · Tape-pack progress on the reels + a strip of tape filling up
Milestone: M2 · Reference: s02 (brief screens[1]) + s05 iPhone (brief screens[4]) · Status in reel: Next
Type: AFK (agent can finish alone)
Blocked by: T09a (file order on `Player.tsx` and the DeckChip)   ·   Blocks: T12 (file order on `Player.tsx`), T25
(Split from HANDOFF T09; this is its "tape-pack progress" half.)

## Why
s02 is explicit that this is not video: "NOT VIDEO — A still page in a room lit by its own colors. Sound carries
the motion: no scrubber, no timecode, only a strip of tape filling up." The chip's reels sit on "a tape-brown pack
disc (left pack 18px wide, right 9px: early in the tape)" — "the left pack big early in a tape, the right pack big
late: cassette-native progress". At the bottom, "a 3px tape strip across the full width … with 8 ticks (segment 1
gold, segment 2 at 70%)"; on Grandma's phone "a 3px gold tape strip … with 5 ticks (segments 1-2 full, 3 at 80%)".
Today progress is a plain bar and the reels never change.

## Done when (acceptance, each testable)
- [ ] A pure tape-position module maps (page index, page count, in-page fraction 0–1) → story position
      p = (index + fraction) / count, the two pack diameters (left = big − (big − small)·p, right = small +
      (big − small)·p, for the chip's reel size) and the strip fill p. Inputs are clamped; count 0 → p 0.
- [ ] The Player supplies the in-page fraction honestly: recorded voice → `currentTime / duration` of the clip;
      browser voice → (lit word + 1) / word count; after the voice finishes and during the hold → 1; a new page
      starts at 0; a wordless page → 1 once its beat has passed.
- [ ] Each reel in the DeckChip (expanded and compact) sits on a tape-brown pack disc (`data-pl="pack-left"`,
      `data-pl="pack-right"`, decorative). On page 1 at the start the left pack is larger than the right; on the last
      page after its voice the right pack is larger than the left; the left pack never grows while turning forward
      through the house tape (sampled after each ArrowRight).
- [ ] The bottom tape strip keeps `role="progressbar"`, `aria-valuemin=1`, `aria-valuemax=<count>`,
      `aria-valuenow=<page>`, `aria-valuetext="Page n of N"`, and draws one segment per page
      (`data-pl="strip-seg"` × count: 8 on the house tape, 5 on Twinkle) with the filled length = p × width (±2%).
      No timecode, no handle, not draggable, not focusable as a slider.
- [ ] During a recorded clip the strip fill and the right pack grow while the clip plays (sampled at ~1 s and ~4 s
      into a 6 s clip: both strictly larger at 4 s).
- [ ] Size/fill changes ease out over ~600 ms; under reduced motion they change without transition
      (`transition-duration` 0s computed).
- [ ] Phones (390×844): the compact pill shows the packs too; the strip spans the full width above the home
      indicator safe area.

## Seams and files
Seam 1 (Node): the pure tape-position module. Seam 2 (E2E): `/read` with the house tape and the Twinkle /
recorded-voice fixtures, measuring pack bounding boxes and the strip fill width. The Player derives the in-page
fraction from state it already has (the clip element, the lit word, the narration-finished moment).

## Files (ownership)
- `src/components/player/tape-position.ts` — **new** (pure).
- `src/components/studio-kit/DeckChip.tsx` + its stylesheet (built by T09a) — modify (pack discs; size props from
  tape-position).
- `src/components/player/deck.css` — modify (pack disc + strip styles; created by T09a).
- `src/components/player/Player.tsx` — modify: compute the in-page fraction; replace the plain progress fill with
  the segmented strip; pass pack sizes to the chip.
- `src/components/player/player.css` — modify (unavoidable, `.pl-progress*` block only: the segmented strip
  replaces the single fill).
- `tests/vision-tape-position.spec.ts` — **new** (Node).
- `tests/vision-reader-tape-progress.spec.ts` — **new** (E2E).
- `tests/fixtures/reader-tapes.ts` — modify: add a 6 s recorded-voice tape (autoPlay false). Twinkle from T00.
- `docs/vision/evidence/T09b.png`, `T09b-390.png` — **new**.

## Existing tests that may change
- None. No current test asserts the progress fill (`.pl-progress-fill`) or its transform (verified by grep);
  the progressbar's ARIA contract is kept as is.

## Tests (written first)
1. `tests/vision-tape-position.spec.ts` (Node): p for (0, 8, 0) = 0, (1, 8, 0.5) = 0.1875, (7, 8, 1) = 1; pack sizes
   cross at p = 0.5 (equal ±0.5 px); clamps for negative/NaN/over-range input.
2. `tests/vision-reader-tape-progress.spec.ts` (E2E, desktop + mobile): house tape page 1 left > right; ArrowRight
   ×7 → left non-increasing each step; end of page 8 right > left; 8 strip segments; fill ≈ p × width; 6 s clip: fill
   and right pack larger at ~4 s than at ~1 s; reduced motion → no transition; Twinkle at 390×844 → 5 segments.
Red first: no pack elements, one unsegmented fill.

## Fidelity check
Viewport **1120×700** — state: house tape page 2 mid-voice; compare the reels' packs with `renders/s02.png`
≈ x130–230, y80–125 and the strip with ≈ x98–1218, y748–758. Save `docs/vision/evidence/T09b.png`. Viewport
**390×844** — Twinkle page 3 near the end of its clip; compare the strip with the s05 iPhone crop ≈ x1188–1548,
y896–904 (segments 1–2 full, 3 mostly full). Save `T09b-390.png`.
