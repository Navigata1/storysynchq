# T07 · "Remember the magic?" band + "Three surfaces · one file" row + company line
Milestone: M1 · Reference: s01 (brief screens[0]) · Status in reel: Shipped (small changes)
Type: AFK (agent can finish alone)
Blocked by: T05a (tokens), T06 (file order: T06 edits `Landing.tsx` first)   ·   Blocks: T25

## Why
The landing never says why StorySync exists. The reference carries the band over from `/classic` in
Jon's words — "READ ALONG. LISTEN. FEEL." / "Remember the magic?" / "Library books with cassette tapes.
Reading along while the narrator guided you page by page. Background music that made every story feel
alive." / "Now any storybook can read itself — in the voice and mood you choose." — then names the
whole system in one row ("THREE SURFACES · ONE FILE") and signs the page: "A product of Island
Development Crew LLC · Part of the SyncHQ Suite". The s01 nav names the same three surfaces at the top
("StorySync Reader", "StorySync Creator", "The SSYNC Protocol", "Privacy"), so it ships here too.

## Done when (acceptance, each testable)
- [ ] After the two doors (`#ls-doors`) and before any other section, a tape-stripe seam
      (`aria-hidden`, red/yellow segments) and a band `data-ls="magic"` with, in order and verbatim:
      kicker "READ ALONG. LISTEN. FEEL." (gold, mono); heading (h2) "Remember the magic?" (Fraunces
      italic); quote paragraph "Library books with cassette tapes. Reading along while the narrator
      guided you page by page. Background music that made every story feel alive." (with a left rule);
      wedge line "Now any storybook can read itself — in the voice and mood you choose." (label-yellow).
- [ ] Directly after it, a block `data-ls="surfaces"` with the mono label "THREE SURFACES · ONE FILE"
      and exactly three rows, each a 28 px glass circle holding a decorative lucide icon (Headphones,
      Mic, Package) and one line with the surface name in weight 600, verbatim:
      "StorySync Reader — plays any tape in any browser. No app, no account." /
      "StorySync Creator — pictures, voices, a little music and timing, made together." /
      "SSYNC Protocol — the open file between them. Like PDF, for storybooks."
      The rows are text, not links.
- [ ] The footer keeps "Nothing leaves this device until a grown-up taps through the gate. No trackers,
      ever." and adds the line "A product of Island Development Crew LLC · Part of the SyncHQ Suite"
      (mono, muted). Footer links (Protocol, Privacy, GitHub, Classic site) are unchanged.
- [ ] A top nav (`<nav aria-label="Main">`) at the top of the hero: wordmark "StorySyncHQ" (Fraunces 700,
      with the cassette icon, linking to `/`) and four links — "StorySync Reader" → `/read`,
      "StorySync Creator" → `/studio`, "The SSYNC Protocol" → `/protocol`, "Privacy" → the PRIVACY.md URL
      already used by the footer.
- [ ] Below 640 px the four links collapse behind a menu button (`aria-expanded`, `aria-controls`,
      accessible name "Menu"); Enter/Space opens it, Escape closes it and returns focus to the button,
      clicking outside closes it. At 390×844 the hero shows only the wordmark and the menu button.
- [ ] Every new link and button shows the kit focus ring (`sk-focus`) and is reachable by Tab in
      document order; tap targets ≥ 44 px tall on the phone.
- [ ] No new animation beyond the existing scroll `Reveal` (skipped under reduced motion); nothing in
      the new sections loops. Under emulated reduced motion the bands are visible immediately.
- [ ] No horizontal scroll at 320–1440 px (the existing sweep stays green).
- [ ] Exactly one `<h1>` on `/` still (the new heading is an h2).
- [ ] Landing JS beyond the framework stays ≤ 200 KB (check the `/` route's First Load JS in
      `npm run build` output; record it in `docs/vision/evidence/LEDGER.md`).

## Seams and files
Seam: Playwright E2E on `/`. No `src/lib` change. Copy lives in the new landing components (it is
product copy, not story data).

## Files (ownership)
- `src/components/landing/Landing.tsx` — modify: mount `LandingNav` in the hero, insert the seam +
  `MagicBand` + `SurfacesRow` after the doors section, add the company line to the footer.
- `src/components/landing/LandingNav.tsx` — **new** (wordmark, four links, phone disclosure menu).
- `src/components/landing/MagicBand.tsx` — **new**.
- `src/components/landing/SurfacesRow.tsx` — **new**.
- `src/components/landing/landing-bands.css` — **new**, owned by T07 (nav, seam, band, rows,
  company line). `landing.css` is not edited.
- `tests/vision-landing-bands.spec.ts` — **new**.
- `tests/wp-landing.spec.ts`, `tests/critic-landing.spec.ts` — modify (counts only, see below).
- `docs/vision/evidence/T07-390.png`, `docs/vision/evidence/T07-1080.png` — **new** (fidelity).

## Existing tests that may change
- `tests/wp-landing.spec.ts` › "the landing points at the protocol page": `a[href="/protocol"]`
  `toHaveCount(2)` → **3** (nav + protocol section + footer). Reason: the s01 nav adds "The SSYNC
  Protocol" link. `links.first()` becomes the nav link; the click-through assertion is unchanged.
- `tests/critic-landing.spec.ts` › "the landing points at /protocol from the protocol section and the
  footer": `a[href="/protocol"]:not(footer a)` `toHaveCount(1)` → **2** (nav + protocol section).
  Reason: same nav link. Footer count stays 1.
- Must keep passing unchanged: the overflow sweep, "or scroll to the two doors" opens `#ls-doors`,
  keyboard Press play on Enter, all /protocol tests.

## Tests (written first)
`tests/vision-landing-bands.spec.ts`:
1. the magic band's four strings, verbatim and in order, and it follows `#ls-doors` in the DOM.
2. the surfaces block: label + three rows with the exact lines; no `<a>` inside it.
3. footer: privacy line + company line verbatim.
4. nav at 1280: four links with exact names and hrefs; wordmark links to `/`.
5. nav at 390×844: links hidden, "Menu" button; keyboard open (Enter), Escape closes and refocuses the
   button; outside click closes.
6. reduced motion: bands visible without scrolling into view triggers; single h1.

## Fidelity check
Viewport **390×844** — state: `/` scrolled so the doors' "Play a story" card is at the top; compare with
the phone screen in `renders/s01.png` (approx. x1183–1573, y78–922): doors → seam → magic band → three
surfaces → footer lines. Viewport **1080×675** — top of `/`: compare the nav row with s01.png
x94–1174, y74–126. Save `docs/vision/evidence/T07-390.png` and `T07-1080.png`. Known deviation to record:
the shipped "How the magic works" and protocol sections still sit between the surfaces row and the
footer (M1-PRD Open Question 1).
