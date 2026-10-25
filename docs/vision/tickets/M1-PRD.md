# M1 · Landing (s01) — PRD

Reference screen: **s01 · Press play** (`docs/vision/reference/screens/s01.html`, render `renders/s01.png`,
brief `screens[0]`). Reel status: **Shipped, small changes** (editorial.json `status["1"]`).
Tickets: **T06**, **T07**. Both edit `src/components/landing/Landing.tsx` after T01 and T05b (M0) have, so they run in that order (see Notes).

## Problem Statement

A parent who lands on storysynchq.vercel.app today sees a cassette labelled "StorySyncHQ", a deck that
says "DECK · READY", and a headline that falls below the fold on a 1080×675 laptop. The tape does not
say which story it will play, and the brand's one light (the gold of the deck, the star of the house
tape) is two separate things. Below the doors, the page never says *why* the product exists: the
library cassette memory that `/classic` carried ("Remember the magic?") is gone, the three surfaces
(Reader, Creator, Protocol) are never named together, and the company behind it is invisible. Under
reduced motion the hero shows a tape hovering over an empty deck instead of the calm still the
reference draws ("the tape is simply already in").

## Solution

Bring `/` to the s01 reference without adding a second spectacle:

- The hero tape carries the house tape's own title and "SIDE A · PRESS PLAY", read from the demo
  manifest (never typed into a component). The hero is recomposed to the s01 geometry so the
  headline, subline and "Press play" sit above the fold at 1080×675 with the tops of the two doors
  peeking in.
- Page 1's star (the house tape's first watercolor, masked to its swirl and single star) sits exactly
  behind a round play key on the deck face, under one gold glow: one light per screen.
- Under `prefers-reduced-motion` the hero is a still: the tape already seated in the deck, reels still,
  button unpressed. Press play routes instantly (shipped behaviour, kept).
- A top nav names the product and the three surfaces ("StorySync Reader", "StorySync Creator",
  "The SSYNC Protocol", "Privacy"); on a phone it collapses to the wordmark and a menu button.
- After the doors: a tape-stripe seam, the "Remember the magic?" band in Jon's words, the
  "Three surfaces · one file" row, and the footer's company line.

## User Stories

1. As a parent opening the site, I want the cassette in the hero to say "The Brave Little Star", so that I know pressing play will play a real story, not a logo.
2. As a parent on a 1080×675 laptop, I want the headline, the subline and "Press play" visible without scrolling, so that I can act in the first second.
3. As a visitor, I want the deck's play key and the story's star to be the same point of light, so that the page reads as one calm, warm thing.
4. As a visitor who asked the OS for reduced motion, I want the hero drawn still with the tape already in the deck, so that nothing moves and nothing looks broken.
5. As a visitor who prefers reduced motion, I want Press play to open the demo's cover gate immediately, so that I never wait on an animation I asked not to see.
6. As a keyboard user, I want the nav links and the phone menu button reachable and ringed, so that I can get to the Reader, Creator, Protocol and Privacy without a mouse.
7. As a phone user (390×844), I want the nav to collapse to the wordmark and a menu button, so that the hero is not crowded.
8. As a grandparent who remembers library cassette books, I want a band that says "Remember the magic?", so that I recognise what this is for.
9. As a parent comparing tools, I want the three surfaces named in one row with one line each, so that I understand that the Reader, the Creator and the SSYNC Protocol are one system around one file.
10. As a parent deciding whether to trust the site with my child's voice, I want the footer to state "Nothing leaves this device until a grown-up taps through the gate. No trackers, ever." and who makes the product, so that I know who is accountable.
11. As a screen-reader user, I want the decorative sky, star, play key and reels hidden from assistive technology, so that the hero reads as a headline, a sentence and one button.
12. As a phone user at 320–414 px, I want no horizontal scroll, so that the 1300 px sky layer never drags the page sideways.

## Implementation Decisions

- **Demo tape summary.** The hero tape reads the house tape's title from the demo manifest that T01
  already imports statically into the landing (build-time JSON import; `tapeMetaLine` lives in the T01
  tape-meta module). M1 adds no second reader of the demo manifest and no story strings inside
  components (CLAUDE.md §7).
- **Hero composition** stays in the landing module and keeps the kit `Cassette` that T05b adopts in the
  hero (same `ls-cassette` class and `data-ls` hooks); M1 only feeds it the title and meta. The deck gains a decorative round play key and a
  "sky" layer (the demo's page-1 illustration at ~16% opacity under a radial mask, plus a brighter
  star-core mask) positioned *relative to the deck*, so the star stays behind the key at every width.
  The star's position inside page 1 is a measured constant (64.1% × 46.2% of the image, from the
  reference's `.s01-starcore` mask centre 833,601 of a 1300 px layer); the play key centre is the anchor.
- **Insertion depth.** At rest the cassette sits poised in the mouth (lower third swallowed, as drawn);
  the spectacle slides it the rest of the way in (760 ms, ease-out, unchanged budget ≤ 900 ms). Under
  reduced motion the cassette is drawn fully seated by a static rule; no animation exists in the
  reduced cascade.
- **Nav** is a small new landing piece (wordmark + four links; under 640 px a disclosure menu that
  closes on Escape and on outside click). Icons come from `lucide-react` (already a dependency).
- **Magic band and surfaces row** are two new static landing pieces with copy verbatim from the
  reference; the surfaces row is text, not links (the nav already links each surface — no duplicate
  tab stops). Motion: the existing scroll Reveal only, skipped under reduced motion. One scroll owner.
- **Styling.** New CSS lives in new component-scoped files owned by each ticket; the shared
  `landing.css` is touched only where an existing hero rule must change (stated per ticket).
- **Budget.** Landing JS stays ≤ 200 KB beyond the framework (design-direction §10); the sky reuses
  `/demo/images/page1.jpg` (~300 KB image, not JS), loaded once, decorative, `fetchpriority="low"`.

## Testing Decisions

- Seam: **Playwright E2E on `/`** at the project viewports (desktop 1280×720, mobile 375×812) plus
  explicit `setViewportSize` checks at the reference viewports (1080×675 laptop, 390×844 phone).
- Test external behaviour only: visible text, link targets, geometry from bounding boxes (the star
  point vs. the play key centre, the fold), computed animation names under emulated reduced motion,
  horizontal overflow.
- Prior art: `tests/wp-landing.spec.ts` (insert probe, forced-animation read, overflow sweep 320–1440)
  and `tests/critic-landing.spec.ts` (route timing, back-restores-tape, single h1 rule on /protocol).
  New suites: `tests/vision-landing-hero.spec.ts` (T06) and `tests/vision-landing-bands.spec.ts` (T07).
- Two existing assertions change because the reference adds a nav link to `/protocol` (listed in T07).

## Out of Scope

Quoted from HANDOFF §4 and the s01 brief:
- Nothing on s01 is **Idea** or **Phase 3**; there is nothing to leave out except: "Exactly one
  spectacle (landing)" — no second animated section, no looping motion added below the hero.
- The protocol teaser's runtime label (`~1:47 · READ-ALONG`) is **T01** (M0), not M1.
- The reference's layers strip, callouts and the "REDUCED MOTION" spec figure are stage annotation,
  not UI.

## Open Questions (for Jon)

1. **Section order.** The s01 phone runs doors → seam → "Remember the magic?" → "Three surfaces" →
   footer, with no "How the magic works" beats and no protocol teaser. M1 keeps both shipped sections
   (after the new bands, before the footer). Should they be retired to match the reference exactly?
2. **Wordmark.** The reference nav uses `icon.png` (the cassette whose reels are eyes, 22 px). The app
   ships `/icons/icon-*.png` (a cassette glyph set). OK to use `/icons/icon-72x72.png` scaled to 22 px?
3. **Privacy link target.** The nav's "Privacy" goes to `PRIVACY.md` on GitHub (as the footer does).
   Is an in-app privacy page wanted later? (Not built in M1.)

## Notes

- **File order on `Landing.tsx`: T01 (M0, protocol teaser) → T05b (M0, hero Cassette) → T06 → T07.** T06 and
  T07 are AFK; HANDOFF §9's "T05" is split in M0 into T05a (tokens, one-file-per-component kit layout) and
  T05b (TapeLabel/Reel aligned, Cassette, component allocation); each M1 ticket is blocked by the T05 half it
  needs and by the previous `Landing.tsx` editor, so only one ticket edits that file at a time.
- The Rivera family never appears on `/`. The hero is the house tape only.
- Fidelity states: s01 laptop crop is `renders/s01.png` x94–1174, y74–749 (1080×675 at 1:1); the phone
  screen is approximately x1183–1573, y78–922 (390×844). The reference freezes the tape mid-insert;
  our at-rest still shows the same depth (poised in the mouth), the reduced-motion still shows it seated.
