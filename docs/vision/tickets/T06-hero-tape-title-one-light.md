# T06 · Hero tape carries the demo title; page-1 star aligned behind the play key; reduced-motion still
Milestone: M1 · Reference: s01 (brief screens[0]) · Status in reel: Shipped (small changes)
Type: AFK (agent can finish alone)
Blocked by: T05a (tokens), T05b (hero Cassette; file order on `Landing.tsx`), T01 (demo manifest import; file order)   ·   Blocks: T07 (file order on `Landing.tsx`), T25

## Why
The reference hero is one light and one promise: "the hero tape carries the demo's title (today it reads
'StorySyncHQ · SIDE A · PRESS PLAY')", and "the single bright star from page 1 sits exactly behind the
deck's play key: the brand's gold and the story's light are the same point." Today the tape reads
"StorySyncHQ", the deck has no play key, the headline and "Press play" fall below the fold on a 1080×675
laptop, and under reduced motion a tape hovers over an empty deck instead of the still the reference
draws: "with reduced motion the tape is simply already in."

## Done when (acceptance, each testable)
- [ ] The hero cassette label shows the title read from `public/demo/brave-little-star.ssync.json`
      (`metadata.title`, today "The Brave Little Star") and the meta line "SIDE A · PRESS PLAY". The test
      reads the title from the JSON file, not from a literal; no component contains the string
      "The Brave Little Star" for the hero (it comes from the demo manifest T01 imports into the landing).
- [ ] The cassette's band still reads "STORYSYNC" (kit TapeLabel band), and the kicker above the deck
      reads "THE LIBRARY CASSETTE · REBUILT FOR THE WEB" (visually uppercase; source text unchanged).
- [ ] The deck face has a round play key (≈30 px at 1080 wide, gold rim, play glyph), decorative:
      `aria-hidden`, not focusable, not clickable. The deck readout keeps its shipped states
      ("DECK · READY" at rest, "▶ PLAY · SIDE A" while inserting).
- [ ] A decorative sky layer (`data-ls="sky"`, `aria-hidden`) shows the demo's page-1 illustration masked
      to its swirl and star, at ~16% opacity, plus a brighter star core; its star point
      (64.1% × 46.2% of the image box) is within **6 px** of the play key's centre at 1080×675, 1280×720,
      1440×900 and 390×844. (Test: `rect.x + 0.641·rect.width` / `rect.y + 0.462·rect.height` of the
      sky image box vs. the key's bounding-box centre.)
- [ ] One gold glow (radial, #F59E0B ≈12%) is centred on the play key; the old free-floating hero glow
      no longer competes (only one `.ls-hero-glow`-type light in the hero).
- [ ] At 1080×675, without scrolling: the headline "Press play on the stories you make together.", the
      subline "Photos of their drawings. Their voice on every page. A little music underneath. One link
      that plays anywhere." and the "Press play" button are fully inside the viewport, and the top edge
      of the doors section is visible above y = 675 (the doors "peek in").
- [ ] At rest (motion allowed) the cassette sits poised in the deck mouth with roughly its lower third
      hidden behind the deck face (visible cassette height between 55% and 75% of its full height).
- [ ] Press play still slides the tape in for 760 ms (ease-out) and routes to `/read?demo=1` with the
      cover gate; the computed animation on `[data-ls="tape-slide"]` while inserting is `ls-insert`
      with duration ≤ 900 ms and `fill-mode: forwards`; at rest the slide's own transform is `none`
      (the poised depth is an offset on the well, not on the slide).
- [ ] Under emulated `prefers-reduced-motion: reduce`: the cassette is drawn fully seated (visible
      height ≤ 40% of its full height — label band above the mouth only), the reels have no running
      animation (`animation-name: none` on every reel in the hero), the button is unpressed, the forced
      inserting state still yields `animation-name: none`, and Press play reaches the cover gate without
      ever setting `data-inserting="true"`.
- [ ] The sky layer causes no horizontal scroll at 320, 375, 390, 414, 768, 900, 1024, 1280, 1440 px.
- [ ] `/` still has exactly one visible primary gold action in the hero ("Press play").

## Seams and files
Seam: Playwright E2E on `/` (+ `/read?demo=1` for the route). No `src/lib` change.
The demo title comes from the demo manifest JSON that T01 imports statically into `Landing.tsx` (do not add a
second import or reader). The cassette is the kit `Cassette` T05b adopted in the hero; T06 passes it the title and
the meta line and keeps its `ls-cassette` class and `data-ls` hooks.

## Files (ownership)
- `src/components/landing/Landing.tsx` — modify: `HeroDeck` (Cassette title/meta from the demo manifest,
  play key element, sky mount), `Hero` (composition order unchanged; remove the old glow element).
- `src/components/studio-kit/` Cassette component from T05b — consume; modify only if it has no way to take a
  label title/meta (state it in the ledger).
- `src/components/landing/HeroSky.tsx` — **new**: the masked page-1 sky + star core + key glow,
  positioned from the play-key anchor via CSS custom properties.
- `src/components/landing/hero-sky.css` — **new**, owned by T06: sky/star/key/glow rules and the
  reduced-motion "seated" rule for the cassette.
- `src/components/landing/landing.css` — modify (unavoidable, hero block only): `.ls-hero-glow`
  removal, `.ls-tape-well`/`.ls-tape-slide` rest offset (poised depth), `.ls-cassette` width (≈340 px at
  1080), `.ls-deck-face` room for the key, hero vertical rhythm for the 1080×675 fold. No rules outside
  `.ls-hero*`, `.ls-deck*`, `.ls-tape*`, `.ls-cassette*`.
- `tests/vision-landing-hero.spec.ts` — **new**.
- `docs/vision/evidence/T06.png`, `docs/vision/evidence/T06-reduced.png`, `docs/vision/evidence/T06-390.png` — **new** (fidelity).

## Existing tests that may change
- None should change. These must keep passing unchanged and are the regression net:
  `tests/wp-landing.spec.ts` "Press play lands on /read?demo=1…", "the cassette travels into the deck
  and the animation budget is <= 900ms" (asserts `getComputedStyle(slide).transform === "none"` at
  rest, `ls-insert`, `forwards`, ≤ 0.9 s and translateY > 8 px mid-flight — so the poised depth and
  the reduced-motion seated depth must both come from the well/stage offset, never from a transform on
  `[data-ls="tape-slide"]`, and the keyframe keeps the name `ls-insert`), "prefers-reduced-motion: the
  tape cannot animate and never travels", "neither route scrolls sideways…";
  `tests/critic-landing.spec.ts` "the cassette animation is within the 900ms budget and really travels"
  (y must still increase during travel), "back from the Read Room restores the tape" (restored tape
  `|y| < 4`, `height > 120`, on screen — the poised rest position is the restored position).

## Tests (written first)
`tests/vision-landing-hero.spec.ts`:
1. hero label title equals `metadata.title` read from the demo JSON in Node; meta reads "SIDE A · PRESS PLAY".
2. star-behind-key distance ≤ 6 px at 1080×675, 1280×720, 1440×900, 390×844.
3. fold test at 1080×675: headline, subline, Press play inside the viewport; doors' top < 675.
4. poised depth at rest (55–75% visible), seated depth under reduced motion (≤ 40% visible), reels'
   `animationName === "none"` under reduce.
5. play key is `aria-hidden` and not in the tab order (Tab from the top of the page never focuses it).
6. sky layer: `aria-hidden`, and no horizontal overflow at the nine widths (reuse the wp-landing loop shape).
Run red first (title test fails on "StorySyncHQ", star test fails: no sky), then build.

## Fidelity check
Viewport **1080×675** (laptop) — state: `/` at rest, scrolled to top, fonts loaded; compare with
`renders/s01.png` crop x94–1174, y74–749. Then **1080×675 with reduced motion** — compare with the
"REDUCED MOTION" spec figure (s01.png x48–280, y836–980). Then **390×844** hero — the phone in s01 is
scrolled past the hero, so compare only type scale and the gold light. Save to
`docs/vision/evidence/T06.png`, `T06-reduced.png`, `T06-390.png`. Differences that matter: tape title,
star-behind-key, fold, insertion depth, one light. Pixel-identical is not the goal.
