# T01 · Landing teaser prints `~1:47 · READ-ALONG`
Milestone: M0 · Reference: s01 (brief screens[0]) · Status in reel: Shipped (truth fix)
Type: AFK (agent can finish alone)
Blocked by: —   ·   Blocks: T06 (file order on `Landing.tsx`)

## Why
The landing's protocol section shows the house tape on a printed label as `SIDE A · 8 PAGES · 4:32 · AAC/M4A`. The reel's realism note for s01 says:

> "The landing's protocol teaser must stop printing '4:32 · AAC/M4A' for a tape with no recorded voice; the true label is '~1:47 · READ-ALONG'."

The cast confirms it: "runtime ~1:47 (184 words at 2.5 words/s + 33 s of pauses; never print 4:32), read by the browser voice … it has no recorded narration".

The label is also a hand-typed literal in a component. It must be derived from the demo manifest in `/public`, so it can never drift from the tape again.

## Done when (acceptance, each testable)
- [ ] On `/`, the protocol-section tape label reads exactly `SIDE A · 8 PAGES · ~1:47 · READ-ALONG` (text content; the label CSS uppercases it).
- [ ] The string `4:32` appears nowhere in the rendered landing (desktop and mobile).
- [ ] The landing never prints `AAC/M4A` on the house tape's label. The prose sentence "Published narration is always AAC/M4A …" stays; it is a protocol rule, not a claim about this tape.
- [ ] The teaser label's title "The Brave Little Star" and author "by Island Development Crew" come from `public/demo/brave-little-star.ssync.json` `metadata`, not from string literals in `Landing.tsx`. The Landing component contains no "Brave Little Star" literal for the teaser. The hero cassette text belongs to T06.
- [ ] A new pure module computes and labels runtimes:
  - `estimateRuntimeSeconds(pages)` returns words ÷ 2.5 + Σ autoPause per page, with a default pause of 3 s when absent and `ms` units honoured.
  - `narrationKind(pages)` returns `"READ-ALONG"` when no page has `text.audioUrl`, `"AAC/M4A"` when every recorded page has `audioCodec: "aac"`, and `"WAV"` when any recorded page is `"wav"`.
  - `tapeMetaLine(manifest)` returns `SIDE A · <n> PAGE(S) · ~<m:ss> · <kind>`.
  - For the house tape it returns 106.6 s → `~1:47`, `READ-ALONG`.
- [ ] The Player's runtime arithmetic (`estimateSeconds`, `parseDuration`, `formatClock` in `src/components/player/timing.ts`) re-exports from the new module. The Player cover still prints `SIDE A · 8 PAGES · ~1:47` for the demo, and `tests/wp-player.spec.ts` imports keep working untouched.
- [ ] The landing gains no runtime request: the manifest is a static JSON import resolved at build time. The demo manifest adds about 7 KB raw to the landing chunk (record the before/after first-load JS of `/` from `next build` in the ledger).
- [ ] All four gates are green.

## Seams and files
- Primary seam: Playwright E2E on `/` (desktop 1280×720 + mobile 375×812).
- Secondary seam: one Node-side block that pins `narrationKind` and `tapeMetaLine` for recorded tapes (AAC, WAV, mixed) and for `ms` pauses. The landing can only ever show the house tape, so E2E cannot vary it.
- Module: `src/lib/storysync/tape-meta.ts` (new, pure, no DOM) holds the arithmetic and the label. `src/components/player/timing.ts` re-exports `estimateSeconds` / `parseDuration` / `formatClock` from it, so there is one source.
- Component: `src/components/landing/Landing.tsx`, protocol section only (`ls-protocol-tape`). It imports the demo manifest JSON and renders `<TapeLabel title author meta={tapeMetaLine(...)}>`.

## Tests (written first)
`tests/vision-landing-teaser.spec.ts`:
1. E2E: `page.goto("/")`, scroll `.ls-protocol-tape` into view, and expect `[data-sk="tape"]` inside it `toContainText("SIDE A · 8 PAGES · ~1:47 · READ-ALONG")`. Expect it to contain "The Brave Little Star" and "Island Development Crew".
2. E2E: `expect(page.locator("body")).not.toContainText("4:32")`. The teaser label does not contain "AAC/M4A".
3. Node: `tapeMetaLine` over the demo manifest (read from `public/demo/…json` via `node:fs`) equals `SIDE A · 8 PAGES · ~1:47 · READ-ALONG`. A 2-page manifest with `audioCodec: "aac"` on both recorded pages gives `… · AAC/M4A`. One `wav` gives `… · WAV`. A page with `autoPause: "450ms"` adds 0.45 s, not 450 s.

Red first: 1–2 fail on today's literal `4:32 · AAC/M4A`; 3 fails because the module does not exist.

## Fidelity check
- Viewports 1080×675 (the s01 laptop) and 390×844 (the s01 phone).
- State: `/`, scrolled until the protocol section's tape label is fully in view, reveal settled (or reduced motion).
- Reference: no s01 crop shows this section. Compare the label's Register-B look against the s01 hero cassette label crop (`docs/vision/reference/renders/s01.png`, about x480–790, y180–265: band, title, mono meta) and the copy against brief `screens[0].realism`.
- Save `docs/vision/evidence/T01.png`.

## Files (ownership)
- `src/lib/storysync/tape-meta.ts` (new)
- `src/components/player/timing.ts` (modify: re-export the three helpers from tape-meta; no behaviour change)
- `src/components/landing/Landing.tsx` (modify: protocol section teaser only; the hero is T05b/T06)
- `tests/vision-landing-teaser.spec.ts` (new)
- `agent_docs/decisions.md` (append one entry; shared, append-only)

## Existing tests that may change
- None. I searched `tests/*.ts` for `4:32`, `8 PAGES`, `ls-protocol` and `AAC/M4A`. The only `AAC/M4A` assertion is `tests/storysync-roundtrip.spec.ts:89`, about the validator, and it is unaffected.
- `tests/wp-player.spec.ts` imports `splitWords`/`wordIndexAtTime` (and may import others) from `src/components/player/timing.ts`. Those exports remain.
