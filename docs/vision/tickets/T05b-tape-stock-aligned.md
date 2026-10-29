# T05b · Align TapeLabel and Reel to the reference; add Cassette and adopt it in the landing hero
Milestone: M0 · Reference: s01 (hero cassette), s05 (printing label, phone cover), s06/s07 (labels on end card and shelf) · brief `design_system` "Tape stock" + `foundation.css` `.ss-tape`, `.ss-cassette`, `.ss-reel` · Status in reel: Shipped (foundation)
Type: AFK (agent can finish alone)
Blocked by: T00, T05a   ·   Blocks: T06, T07, T08, T09a, T12, T13, T14, T16, T20, T22, T23 (every ticket "Blocked by T05")
Split from T05. T05a ports the tokens; T05b aligns the pieces that already render on today's pages, tests them there, and allocates every other §6 piece to the ticket that first renders it (see "Kit allocation" below).

## Why
The tape label is the most-repeated object in the reel:
- the hero cassette, "label band 'STORYSYNC' with holes, title, meta";
- the publish card's printing label;
- Grandma's cover ".ss-tape--sm (title, author, meta with VOICE: MIA)";
- the end card;
- every shelf tape.

The brief fixes its look: 3px ink border, radius 12, a 10px tape-red stripe over a 3px ink rule, and a label-yellow band in mono 600 11px with 0.2em tracking. The band carries two filled ink holes and "STORYSYNC". Under it sits a ruled paper field with a Fraunces 800 title, an italic 500 author and a mono 500 11px meta at 0.15em, uppercase, in full ink.

Today's TapeLabel is close but not the same: Fraunces 900, a non-italic author, a 10px meta at 70% opacity over a rule, and hollow 13px holes. The landing hero hand-builds its own cassette. If these drift now, every later screen inherits the drift. HANDOFF §6 step 2: "`TapeLabel` (exists, align it), `Cassette`, `Reel` (exists)".

## Done when (acceptance, each testable)
- [ ] TapeLabel matches the reference, with no API change (same props, still `data-sk="tape"`):
  - the outer card has a 3px solid ink border and radius 12px;
  - the stripe is 10px `--ss-red` over a 3px ink bottom border;
  - the band is `--ss-label` (or `accent`), mono weight 600, 11px, letter-spacing 0.2em, uppercase. Two filled ink holes of 10px sit at the left, and the text "STORYSYNC" sits at the right;
  - the field is ruled paper, with repeating 27/28px lines at `rgba(30,26,22,.07)`;
  - the title is Fraunces weight 800, 28px at ≥ 640px viewports, with a fluid clamp below that does not go under 20px;
  - the author is Fraunces italic weight 500, 16px, `--ss-ink-2`, prefixed "by ";
  - the meta is mono 500, 11px, 0.15em, uppercase, full ink, with no top rule and no opacity.
- [ ] Reel matches the reference ink reel (circle rim, dashed inner circle, spokes, hub). When `spinning` is false or reduced motion is on, it rests at the reference's static 18° frame (`transform: rotate(18deg)`), not at 0°. Under `prefers-reduced-motion: reduce`, `animation-name` is `none` on every `.sk-reel-svg`.
- [ ] A new `Cassette` in `src/components/studio-kit/Cassette.tsx` with `cassette.css`:
  - props `{ title, meta, author?, spinning?, width?, className?, children? }`;
  - renders the `.ss-cassette` look: shell gradient `--ss-shell-hi → --ss-shell → --ss-shell-2` (165deg), radius 20, aspect 1.6, four screws;
  - the label (74% height) holds the stripe, the band with holes and "STORYSYNC", the title and the meta;
  - the dark window carries the tape-brown ribbon and two kit `Reel`s, and there is a foot;
  - `data-sk="cassette"`, `aria-hidden` (decorative; the hero's accessible name stays on its button);
  - the `className` passes through to the root.
- [ ] The landing hero renders `<Cassette className="ls-cassette" …>` inside the existing `[data-ls="tape-slide"]`, replacing the hand-built screws, label, window and foot markup.
  - The `ls-cassette` class, the `data-ls` hooks, the `INSERT_MS` timing and the reduced-motion behaviour are untouched.
  - The hero's label text is still today's text ("StorySyncHQ" / "SIDE A · PRESS PLAY"). T06 changes it to the demo's title.
  - The now-dead `.ls-cassette-*` / `.ls-screw*` rules are deleted from `landing.css`.
- [ ] Every existing TapeLabel consumer renders the aligned label with no layout breakage at 375×812 (no horizontal scroll, title wraps), with no code change in those consumers:
  - the Read Room's three choices;
  - the Player cover and end card;
  - the publish card;
  - the landing protocol teaser and the `/protocol` page's demo download label (`DownloadDemo`).
- [ ] Every colour in the changed `.sk-tape*` / `.sk-reel*` rules and in `cassette.css` comes from a `var(--ss-*)` token from T05a, including `--ss-shell-hi`, `--ss-foot-1` and `--ss-foot-2`. No hex literal is added.
- [ ] All four gates are green, including every landing suite (`wp-landing`, `critic-landing`, `fable-pass`, `smoke`) unchanged.

## Seams and files
- Seam: Playwright E2E reading computed styles of the real labels and cassette on `/`, `/read` (chooser and the Twinkle cover via T00 `openTapeInReadRoom`) and the publish card (T00 `seedStudioDraft` → publish), on desktop + mobile.
- No dev route. Components are tested where they render (HANDOFF §9 T05).

## Tests (written first)
`tests/vision-tape-stock.spec.ts`:
1. `/read` chooser: for the first `[data-sk="tape"]`:
   - border width is 3px and colour `rgb(30, 26, 22)`;
   - the title has computed `font-weight` 800 and a `font-family` containing the Fraunces next/font family;
   - the author's `font-style` is `italic` and its text starts with "by ";
   - the meta's `font-size` is 11px, `text-transform` uppercase, `opacity` 1, `border-top-style` none;
   - the band contains "STORYSYNC" (case-insensitive), and its two hole elements have a non-transparent ink background.
2. The Twinkle cover via `openTapeInReadRoom(page, "twinkle")`: the same checks pass on `[data-pl="cover"] [data-sk="tape"]`; at 375×812, `document.documentElement.scrollWidth <= 375`.
3. `/`: `[data-ls="tape-slide"] [data-sk="cassette"]` exists and also has class `ls-cassette`. It holds exactly two `[data-sk="reel"]`, a label with "STORYSYNC" and four screw elements.
4. `/` under `emulateMedia({ reducedMotion: "reduce" })`: every `[data-sk="reel"] svg` has `animationName === "none"` and a computed transform equal to an 18° rotation matrix.
5. Publish card (`seedStudioDraft` → Finish → gate → "Your tape is ready"): its `[data-sk="tape"]` passes check 1.

Red first:
- 1 and 2 fail on weight 900, non-italic author, 10px meta and hollow holes.
- 3 fails because there is no Cassette.
- 4 fails on the 0° rest frame.
- 5 fails like 1.

## Fidelity check
- s01 hero cassette:
  - Viewport 1080×675; `/` hero at rest under reduced motion (the tape seated).
  - Crop: `docs/vision/reference/renders/s01.png`, cassette and label at about x465–805, y160–310. Compare shell, band, title weight and reel window. The title text differs until T06.
- s05 phone cover:
  - Viewport 390×844; the Twinkle cover gate.
  - Crop: the s05 cover figure at about x965–1145, y190–345 (scaled 0.46).
- s05 printing label:
  - Viewport 1180×820; the Twinkle publish card.
  - Crop: s05 label at about x262–713, y70–197. The picture inset is T16; this crop checks only band, title, author and meta.
- Save `docs/vision/evidence/T05b-s01.png`, `T05b-s05-cover.png` and `T05b-s05-label.png`.

## Kit allocation (shared pieces built by their first consumer)
This allocation keeps HANDOFF §9 ("No new dev-only routes; test each component through the pages that use it") and tests-first both true.
- Each piece below is built by the named ticket inside `src/components/studio-kit/`, as `<Name>.tsx` plus an optional component-scoped `<kebab>.css`.
- It must use T05a tokens only, lucide icons only, `data-sk="<kebab>"` on its root, no `infinite` animation outside playback reels, and a `prefers-reduced-motion` state.
- Its spec is the brief `design_system` entry cited. The consumer's E2E is its test.
- A later ticket that reuses a piece extends it and owns that change and its test.

| Piece | Kit file | Brief spec (design_system) | Built and tested by | Reused by |
|---|---|---|---|---|
| DeckChip, three sounds (compact + expanded, tape-pack discs, narrator) | `DeckChip.tsx` | LOCAL (7) | T09a | T09b |
| JCard (liner notes) | `JCard.tsx` | LOCAL (10) | T12 | — |
| ListeningRing (tape-red ring while recording; no loop) | `ListeningRing.tsx` | MOTION ("recording = … a tape-red listening ring") | T13 | — |
| TapeRibbon (band + SVG path, stroke 12, round caps) | `TapeRibbon.tsx` | LOCAL (3) | T13 (filmstrip spine) | T16 (size meter), T20 (pulled-out loop) |
| MoodTapeChip used in the mood lane | `MoodTapeChip.tsx` | LOCAL (5) | T13 if its mood lane uses chips, otherwise T22 | T22, T24 |
| PacketBands (seven bands on a dashed spine, Signature red stroke, "V2.1 · DRAFT") | `PacketBands.tsx` | LOCAL (11) | T14 | T23 (flat form) |
| ConsentStamp (two lines, −4°, inks once) | `ConsentStamp.tsx` | `.ss-stamp` + s04 layout_spec | T14 | T12 (may show the inked record) |
| LayerChips (seven 68×24 chips, "consent written") | `LayerChips.tsx` | s05 layout_spec "Layer chips" | T16 | — |
| SizeMeter ("2.0 MB OF 15 MB", pictures ink / voices amber) | `SizeMeter.tsx` | s05 layout_spec + LOCAL (3) | T16 | — |
| PrintSlot + PullTapeIcon | `PrintSlot.tsx` | LOCAL (12) | T16 | T20 (pull-out delete) |
| TapeLabel picture inset (72×72, 2px ink, radius 6) | `kit.tsx` TapeLabel `inset` prop | s05 layout_spec "TapeLabel … 72x72 inset" | T16 | T20 |
| Shelf + ShelfTape (ledge, lift, NEW stamp, pulled-out) | `Shelf.tsx` | LOCAL (8) | T20 | T21, T22 |
| VoiceCassette (blank voice cassette; locked = inert "PHASE 3") | `VoiceCassette.tsx` | LOCAL (6) | T22 | — |
| PacketExploded (skewed plates 01→07) | `PacketExploded.tsx` | LOCAL (11) | T23 | — |
| StatusChip (next / idea / phase3 / later; no "shipped") | `StatusChip.tsx` | LOCAL (15) | the first ticket that must render an inert future item; none planned, and T25 audits | — |
| Not built: spec figure (1), stage layers strip (2), passport stamp (4), sealed cassette (9), mascot (13), e-reader (14) | — | annotation / Idea / P3 | — | — |

## Files (ownership)
- `src/components/studio-kit/kit.tsx` (modify: TapeLabel markup for the band text and filled holes; Reel static frame)
- `src/components/studio-kit/kit.css` (modify: `.sk-tape*`, `.sk-reel*` rules)
- `src/components/studio-kit/Cassette.tsx` (new)
- `src/components/studio-kit/cassette.css` (new, component-scoped)
- `src/components/landing/Landing.tsx` (modify: `HeroDeck`'s cassette markup → `<Cassette>`; the protocol section belongs to T01)
- `src/components/landing/landing.css` (modify: delete the superseded `.ls-cassette-*` and `.ls-screw*` rules; keep `.ls-cassette` positioning used by the slide)
- `tests/vision-tape-stock.spec.ts` (new)
- `agent_docs/decisions.md` (append one entry; shared, append-only)

## Existing tests that may change
- None should change. They depend on hooks this ticket keeps:
  - `tests/critic-landing.spec.ts:348` queries `.ls-cassette` (kept as the Cassette's `className`) and reads its bounding box after Back;
  - `tests/wp-landing.spec.ts` and `tests/critic-landing.spec.ts` read `[data-ls="tape-slide"]` / `[data-ls="tape-stage"]` animation and transform (kept);
  - `tests/critic-player.spec.ts:488` checks the end card's `[data-sk="tape"]` visibility.
- If the 800-weight title wraps differently and moves an existing geometry assertion, the builder fixes the layout to keep the assertion's intent and records the reason. Tests are never loosened.
