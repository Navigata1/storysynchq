# T08 · Desktop two-page spread (art-dominant), mobile keeps full-bleed
Milestone: M2 · Reference: s02 (brief screens[1]) · Status in reel: Next
Type: AFK (agent can finish alone)
Blocked by: T05a (tokens), T11 (file order on `Player.tsx`)   ·   Blocks: T09a (file order; the deck chip and the turn ring sit in this tree), T25

## Why
s02 is "a still page in a room lit by its own colors": an "open-book spread" with the watercolor on the left
page at 560×560 and a sheer right page (440×560) holding "PAGE 2 · WONDER" and the story text — "Every night,
she watched the world below. She saw children sleeping, parents reading stories, and cats prowling on
rooftops." The realism note names the gap: "the two-page spread at desktop width (today page 2 renders
full-bleed with its text on a measured scrim)". On a phone the full-bleed page is right and stays.

## Done when (acceptance, each testable)
- [ ] When the viewport is ≥ 1024 px wide **and** landscape, every page that has both a picture and words
      renders as a spread: `.pl-page.is-spread` with the art (`data-pl="art"`) on the left and the text page
      (`data-pl="text"`, still containing `data-pl="prose"`) on the right, regardless of the page's
      `layout` (`illustration-top`, `illustration-full`, `full`). `.pl-page.is-full` is **not** present in
      spread mode.
- [ ] Geometry at **1120×700** (reference viewport): the spread is horizontally centred (±4 px); the art's
      share of the spread width is 0.54–0.58 (reference 560/1000); a square picture renders square
      (|w − h| ≤ 2 px) and is never cropped or stretched (`object-fit: contain`, natural aspect kept); the
      text page is the art's height (±2 px) and abuts it (gap ≤ 2 px); the spread is at least 75% of the
      viewport height; it does not intersect the deck chip, the top chips or the transport pill. Same rules at
      1280×720, 1440×900 and 2560×1080 (the spread caps at a sensible maximum and stays centred).
- [ ] The text page shows a mono kicker "PAGE <n> · <MOOD>" (e.g. "PAGE 2 · WONDER" on the house tape's page 2;
      "PAGE <n>" alone when the page has no music), then the prose in Fraunces at 24–28 px at 1120×700 with a
      measure of 28–40 ch (reference ≈ 34 ch on a book-spread page); read-along classes work unchanged.
- [ ] The text page is sheer (Register A: dark translucent fill, blur, 1 px line, radius 14) and the prose clears
      **4.5:1** against the pixels behind it on the house tape page 2 **and** on the pure-white-art fixture
      (`critic-white`) at 1440×900 (pixel-sampled, as the existing contrast tests do).
- [ ] At "Largest" text size the prose scrolls inside the text page; nothing spills outside it.
- [ ] Below the breakpoint (375×812, 390×844, 1024×1366 portrait) the shipped layouts render unchanged:
      house tape page 2 is `.pl-page.is-full` with the measured scrim; no `.is-spread` anywhere.
- [ ] Text-only pages (house tape page 8 "The End ⭐") render as one centred text page in spread mode; title/cover
      layouts render as today.
- [ ] Top chips use lucide icons (Music, Settings, X) instead of the ♪ ⚙ ⏏ glyphs, with unchanged accessible
      names ("Music on"/"Music off", "Reading options", "Close story") and visible labels "Music on",
      "Reading options", "Close" at ≥ 640 px.
- [ ] In spread mode a keyboard hint "← → turn · space pause · P music · esc close" sits bottom-left (mono,
      muted) and hides with the rest of the chrome after the idle timeout; it is absent on phones.
- [ ] The page turn is the shipped turn applied to the whole spread; under reduced motion it is instant.
- [ ] No hydration warning and no console error on `/read?demo=1` (the spread decision is made after mount;
      the cover gate covers the first paint).

## Seams and files
Seam: Playwright E2E on `/read` (house tape and seeded fixtures) at explicit viewports. The spread decision is
a client-only media-query hook (SSR default "stacked"), mirroring how the Player already reads
`prefers-reduced-motion` in an effect. Spread styles live in a new player-scoped stylesheet keyed on
`.is-spread`; the shipped `player.css` rules for `is-full`/stacked stay as they are.

## Files (ownership)
- `src/components/player/useSpread.ts` — **new** (matchMedia hook: `(min-width: 1024px) and (orientation: landscape)`).
- `src/components/player/spread.css` — **new**, owned by T08 (spread geometry, sheer text page, kicker,
  keyboard hint, spread prose size/measure).
- `src/components/player/Player.tsx` — modify: render the spread structure (art page + text page + kicker),
  apply `is-spread`, lucide icons in the top chips, keyboard hint.
- `src/components/player/player.css` — not edited (spread rules override by specificity in `spread.css`);
  if an unavoidable conflict appears, only the `.pl-page`/`.pl-picture`/`.pl-text` block may change, noted in
  the ledger.
- `tests/vision-reader-spread.spec.ts` — **new**.
- `tests/wp-player.spec.ts`, `tests/critic-player.spec.ts` — modify (see below).
- `tests/fixtures/reader-tapes.ts` — modify: add a non-square (4:3) art tape for the never-cropped check.
- `docs/vision/evidence/T08.png`, `T08-390.png` — **new**.

## Existing tests that may change
All four change because the reference moves desktop pages from full-bleed + scrim to a spread; every
contrast bar is kept and re-targeted, none is weakened.
- `tests/wp-player.spec.ts` › "WP-P · words over art stay legible" › "the full-bleed scrim clears 4.5:1 behind
  the story text" (1440×900): asserts `.pl-page.is-full` count 1 and a `linear-gradient` on `[data-pl="text"]`.
  → At 1440×900 assert `.pl-page.is-spread` count 1 and keep `proseContrast ≥ 4.5`. The full-bleed + gradient
  assertions move to 390×844 (same test, second viewport).
- `tests/wp-player.spec.ts` › "WP-P · the story voice" › "Fraunces, clamp()-sized to the viewport, ~62ch
  measure": the 1440 expectations (clamp formula, 60–64 ch) → spread typography (Fraunces, 24–30 px, 28–40 ch);
  the 390 expectations stay exactly as they are.
- `tests/critic-player.spec.ts` › "prose is Fraunces, clamp()-sized, and capped near 62ch": wide (1440×900)
  ratio 55–70 ch → 28–40 ch; `wide.size > narrow.size + 4`, the ≤ 1.9 rem cap and `rendered ≤ maxWidth + 1`
  stay.
- `tests/critic-player.spec.ts` › "full-bleed text over PURE WHITE art clears 4.5:1 at desktop-1440x900":
  `.pl-page.is-full` count 1 → `.pl-page.is-spread` count 1; the p25 contrast ≥ 4.5 and
  `box.height < 0.8 · vh` assertions stay. The phone-390x844 variant is unchanged.
- Must keep passing unchanged: "the ordinary text panel clears 4.5:1 too, at 1440 and at 390", "no dead black"
  at 2560×1080 / 1024×1366 / 320×568 / 1440×720, "the backdrop reaches both edges" at 1440×900 and 390×844,
  Ken-Burns + reduced motion, "a text-only page keeps the last picture's light", the keyboard-never-dies tests
  (tap zones), `tests/fable-pass.spec.ts`.

## Tests (written first)
`tests/vision-reader-spread.spec.ts`:
1. 1120×700 house tape page 2: `.is-spread`, art left of text, ratios and adjacency, centring, no overlap with
   `.pl-deck`, `.pl-chrome--top` chips and the transport pill; kicker text "PAGE 2 · WONDER".
2. 1280×720 and 2560×1080: same geometry rules.
3. 375×812, 390×844, 1024×1366: no `.is-spread`; page 2 `.is-full`.
4. prose size 24–28 px and 28–40 ch at 1120×700; "Largest" text size scrolls inside the text page.
5. white-art fixture at 1440×900: p25 contrast ≥ 4.5.
6. 4:3 art fixture: natural aspect preserved (rendered w/h within 1% of 4/3).
7. text-only page 8: single centred text page; chip names unchanged; keyboard hint present at 1280, absent at 390.
Red first: no `.is-spread` exists.

## Fidelity check
Viewport **1120×700** — state: `/read?demo=1`, Tap to Begin, ArrowRight to page 2, chrome visible (move the
mouse), music on. Compare with `renders/s02.png` crop x98–1218, y58–758: spread proportions, sheer right page,
kicker, type size, chip row, keyboard hint, room light. Save `docs/vision/evidence/T08.png`. Then **390×844** page
2 → `T08-390.png` (must match today's phone page). Expected deviations at this stage: the expanded deck chip
(T09a), the turn ring line (T09a) and the tape strip ticks (T09b) are not here yet; the Idea hotspot ring is
never built.
