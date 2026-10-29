# T23a · `/protocol`: the exploded packet figure (a real page taken apart into seven plates)
Milestone: M5 · Reference: s08 (brief screens[7]) · Status in reel: Next (inside a Shipped page)
Type: AFK (agent can finish alone)
Blocked by: T00 (Twinkle fixture for the Node proof), T04a (consent date format the Signature plate prints), T05a + T05b (tokens incl. `--ss-layer-*`, `--ss-red-ink`; allocates `PacketExploded` here), T10 (music plan page mood; engine's exported duck dB), T01 (static demo-manifest import pattern)   ·   Blocks: T23b (file order on `ProtocolPage.tsx`, `protocol.css`), T25
Split from T23. T23a = the figure grid and the exploded packet. T23b = the codec card, the validator, the player snippet,
the hero download and lede.

## Why
s08 is Marco's Saturday: he followed "What's inside this tape?" and finds "FIG. 1 — PAGE 3 OF MIA'S TAPE, TAKEN APART":
"seven parallelogram plates 420x50 (skewX(-18deg), contents counter-skewed upright), 01 Metadata at the bottom up to 07
Signature at the top … each plate 14px right of the one below, dashed ink connectors at both corners … Signature #FFE9A8
with the 3.5px #E3452F stroke and its tag", each plate showing its field path and that page's artifact, under the caption
"A reader that understands only layers 1–3 still shows the story; each layer above adds a sense." The realism note:
"Vision: the exploded real page". Today's `/protocol` explains the seven layers with flat bands that hold no real data.

## Done when (acceptance, each testable)
- [ ] A pure packet-plates module maps `(manifest, pageIndex, { assetPath, voiceSeconds? })` to seven plates
      `{ n: "01".."07", layer, path, value, empty }` in layer order, using only what the tape carries:
      01 Metadata · `metadata` — "<title> · by <author> · <language>" (missing parts omitted);
      02 Visual · `pages[].illustration` — "<packed path> · <alt>";
      03 Text · `pages[].text.content` — the sentence verbatim;
      04 Voice · `pages[].text.audioUrl` — "<packed path> · <codec>" (+ " · <s> s" when `voiceSeconds` is given), or, with no
      recording, "none on this page — the browser voice reads it" (`empty: true`);
      05 Sound · `pages[].music` — "<Mood> · <MOODS[mood].scaleName> · <tempo> BPM · ducks <round(engine duck dB)> dB" via
      T10's music plan, or "no music on this page — silence, on purpose" (`empty: true`);
      06 Behavior · `settings · pages[].timing` — "autoPause <n>s × <multiplier 1 decimal> · chime on|off · words light up|words
      stay still";
      07 Signature · `signature` — "<ownership> · <rights> · consent: <grantedBy> · <date>" (one consent clause per record),
      or "nothing signed on this tape yet" (`empty: true`). The legacy v1 `signature.qrCode` is never read.
- [ ] Verbatim for the house tape page 3 (re-read from `public/demo/brave-little-star.ssync.json` in the test):
      01 "The Brave Little Star · by Island Development Crew · en"; 02 "assets/page-3.jpg · The little star among bigger,
      sleepy stars"; 04 empty; 05 "Wonder · A major pentatonic · 76 BPM · ducks 12 dB"; 06 "autoPause 4s × 1.0 · chime on ·
      words light up"; 07 "nothing signed on this tape yet".
      Verbatim for Twinkle page 3 with `voiceSeconds` 6.4 (the reference's page): 01 "Twinkle Came to My Window · by Mia, age 4
      — with Mom · en"; 03 "I was scared of the dark. Twinkle came to my window."; 04 "assets/narration-3.wav · wav · 6.4 s";
      05 begins "Wonder · A major pentatonic · 76 BPM"; 06 "autoPause 2s × 1.0 · …"; 07 "© 2026 Mia, age 4 — with Mom ·
      personal use · consent: parent/guardian · 2026-10-19".
- [ ] The container exports its "data URL → `assets/<base>.<ext>`" naming as a pure helper and
      `buildStorysyncFromStory` uses it (no behaviour change; the round-trip tests stay green). The page resolves the house
      tape's picture to the path the download writes: `assets/page-3.jpg`.
- [ ] `/protocol` gains, right after the hero, a section (`aria-labelledby` an `h2` "Taken apart", visually hidden) whose
      left column is a `figure` with the mono caption **"FIG. 1 — PAGE 3 OF THE BRAVE LITTLE STAR, TAKEN APART"** (title from
      the manifest, uppercase by CSS) and the kit `PacketExploded`, and the Fraunces italic 13 px caption **"A reader that
      understands only layers 1–3 still shows the story; each layer above adds a sense."** The right column is reserved for
      T23b's cards (until then the figure spans the width).
- [ ] Kit `PacketExploded` (`data-sk="packet-exploded"`): an `ol` of seven `li` in layer order 01→07 (so assistive tech
      reads Metadata first), drawn bottom-to-top (07 on top). Each plate: layer fill from `--ss-layer-*`, 2 px ink border,
      radius 8, a 22 px ink number chip, the layer name in Fraunces 600 15 px (**not** a heading element), the field path in
      mono 10.5 px, the value, and its artifact at the right end: 01 a mini label line (stripe + title); 02 a 40 px thumbnail
      of the page picture (decorative `alt=""`, the alt text is in the value); 03 the sentence in Fraunces 12 px (two-line
      clamp, full text in the DOM); 04 a 48-bar amber waveform when there is a recording, else a dashed flat line; 05 a 60 px
      band in the mood colour with its lucide icon; 06 three 18×24 decorative micro pages (default, high contrast, easier to
      read); 07 a tape-red 3.5 px stroke, the tag **"V2.1 · DRAFT"** in `--ss-red-ink`, and a round tape-red seal glyph
      (lucide `Stamp`). Empty plates print their value in `--ss-ink-3` italic.
- [ ] At ≥ 768 px the plates are parallelograms (a decorative backing with `skewX(-18deg)`, contents upright), 10 px apart,
      each shifted 14 px right of the one below, with dashed ink connectors at both corners and a soft shadow; below 768 px
      they are flat, full width, unshifted, still 07 on top.
- [ ] The figure is static: no transition or animation on any plate (`animationName` "none" everywhere in it), with or
      without reduced motion; nothing is fetched for it (the demo manifest is a static import; the thumbnail is the
      same-origin demo image).
- [ ] Shipped structure untouched: one `h1`; the seven layer names stay `h3` only in the legend and `text` only inside
      `svg.pr-packet-svg`; seven `[data-protocol-layer]`; no new link to the spec or the schemas; no horizontal page overflow
      at 320–1440 px.

## Seams and files
Seam 1 (Node, primary for the values): the plates module against the house tape JSON (read with `node:fs`) and
`loadTape("twinkle").manifest` (prior art: `tests/storysync-roundtrip.spec.ts`). Seam 2 (E2E): `/protocol` — the figure's
caption, plate order, the computed skew at ≥ 768 px and its absence below, the absence of animation, the shipped
structure. `PacketExploded` is built here per T05b's allocation (brief `design_system` LOCAL piece 11), receives plates as
data, and holds no story content.

## Files (ownership)
- `src/components/protocol/plates.ts` — **new** (pure; relative imports only: manifest types, T10's music plan, `MOODS`,
  the engine's duck constant).
- `src/components/studio-kit/PacketExploded.tsx` — **new**.
- `src/components/studio-kit/packet-exploded.css` — **new**, owned by T23a.
- `src/lib/storysync/container.ts` — modify (export the asset-naming helper; `buildStorysyncFromStory` uses it).
- `src/components/protocol/ProtocolPage.tsx` — modify (the figure-grid section after the hero; static demo import).
- `src/components/protocol/protocol.css` — modify (the figure-grid section layout; component-scoped to `/protocol`, no
  other M0–M5 ticket edits it).
- `tests/vision-protocol-packet.spec.ts` — **new** (Node + E2E).
- `docs/vision/evidence/T23a-1140.png`, `T23a-375.png` — **new**.

## Existing tests that may change
- None. Built around (must keep passing unchanged): `tests/critic-landing.spec.ts` › "draws all seven layers as real
  inline-SVG text" (layer `h3`s in the legend must stay unique, so plate names are not headings), "/protocol is one
  document" (one `h1`, named links), the overflow sweep; `tests/wp-landing.spec.ts` › seven `[data-protocol-layer]`, the
  spec-link count of 2, "neither route scrolls sideways, at any width from 320 to 1440"; `tests/storysync-roundtrip.spec.ts`
  (the container's output is byte-for-byte the same).

## Tests (written first)
`tests/vision-protocol-packet.spec.ts`:
1. Node: house tape page 3 → the seven plates verbatim as above (values re-derived from the JSON where they are data);
   `qrCode` never appears in any value.
2. Node: Twinkle page 3 with `voiceSeconds: 6.4` → the Twinkle values above.
3. Node: a page with no music → plate 05 `empty`; `pageTurnSound: false` → "chime off"; `readAlongHighlight: false` →
   "words stay still".
4. Node: the container helper names a JPEG data URL `assets/page-3.jpg` and a WAV `assets/narration-3.wav`; packing the
   Twinkle story with `buildStorysyncFromStory` still round-trips.
5. E2E (desktop + mobile): `/protocol` → the caption text; `[data-sk="packet-exploded"] li` count 7, in DOM order Metadata …
   Signature; the first `li` is visually lowest (its box's top is the greatest); plate 07 contains "V2.1 · DRAFT".
6. E2E at 1280×720: a plate's backing has a computed transform equal to `skewX(-18deg)`; at 375×812 it has none and every
   plate's right edge ≤ 375.
7. E2E: every element inside the figure has `animationName` "none"; `page.getByRole("heading", { level: 3, name: "Visual",
   exact: true })` still resolves to exactly one element.
Red first: no plates module, no figure.

## Fidelity check
Viewport **1140×712** — state: `/protocol` scrolled so FIG. 1 is in view. Compare with s08 (`renders/s08.png` laptop screen
x98–1238, y58–770; exploded stack ≈ x130–740, y285–745): plate skew, stacking offset, fills, number chips, the Signature
stroke and tag, captions. Save `docs/vision/evidence/T23a-1140.png`; **375×812** → `T23a-375.png`. Deviations to record:
the page is the house tape's (M5-PRD OQ 2), so plates 04 and 07 are honestly empty and plate 01's label line names The
Brave Little Star; plate 02 prints the alt text rather than "2048 px · 338 KB"; no QR on plate 07 (the house tape has no
share link); no "Next" chip on the Behavior plate (T11 ships author defaults).
