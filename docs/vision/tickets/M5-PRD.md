# M5 · Protocol (s08) and Advanced (s09) — PRD

Milestone: M5 · Tickets: **T23a, T23b, T24a, T24b** (HANDOFF §9's T23 and T24 are each split in two: T23 carries a new
figure, three new cards and two pure modules on one page; T24 carries a state-model change across five Creator files plus
a new resolver surface. Ids otherwise as HANDOFF §9).
Reference screens served:
- **s08 · One file holds the whole storybook** → `/protocol` (laptop 1140×712 on a paper stage, brief `screens[7]`,
  editorial status "Shipped, plus next"): the exploded packet figure, the codec rule as MUST / MAY / MUST NOT, the validator
  block, "Write your own player", the download in the hero.
- **s09 · Both are the same room** → `/studio` Advanced (drawn as a 1290×900 desktop window, brief `screens[8]`, editorial
  status "Phase 3" for the frame; HANDOFF §4 marks per-page moods and "Type a feeling" **Next**): the Inspector's MOOD and
  TYPE A FEELING rows.
Contract: `docs/vision/HANDOFF.md` §4 (s08, s09), §5 (per-page mood), §9 M5. Where this PRD and `CLAUDE.md` /
`PRIVACY.md` / `docs/format-spec.md` disagree, those win.

---

## Problem Statement

Marco, the engineer in the family, follows "What's inside this tape?" from Mia's end card and lands on `/protocol`. The
page tells him the format is seven layers and draws seven flat bands, but it never shows him a real page taken apart: which
field holds the picture, where the voice file sits, what the music layer actually says, where consent lives. The codec rule
is there, but as prose in a long section rather than the three-line rule a developer can hold in their head. The
validator's messages are real and precise, yet no one reading the page ever sees them, so "the format tells you when a tape
is wrong" is a claim, not a demonstration. There is no code to copy: the page says "write your own player" in its footer
and offers nothing to start from. The download sits at the very bottom, after five sections.

In the Creator's Advanced mode, the whole story has one mood. The house tape itself moves from Wonder to Adventure to Calm,
and the Player now honours each page's own mood (T10), but nothing a parent makes can do that: the Inspector offers one
select, and choosing a mood for "the quiet page" is impossible. And the mood names are a vocabulary a parent has to learn;
the engine already understands "a quiet lullaby for bedtime" (it resolves to Hush), but nothing lets a parent type a feeling
in their own words.

## Solution

Four vertical slices, two per surface, each surface's pair in strict order:

1. **T23a — The exploded packet.** Under the hero, a figure grid opens with **FIG. 1 — PAGE 3 OF THE BRAVE LITTLE STAR,
   TAKEN APART**: the house tape's third page as seven printed plates, 01 Metadata at the bottom to 07 Signature at the top,
   skewed like a stack of tape stock, each plate naming its manifest field and showing that page's actual value (title line,
   picture, sentence, voice, mood band, timing, signature). Plates with nothing on this tape say so (the house tape has no
   recorded voice and no signature). The Signature plate carries the tape-red stroke and "V2.1 · DRAFT". Under the stack:
   "A reader that understands only layers 1–3 still shows the story; each layer above adds a sense."
2. **T23b — The rule, the validator, the snippet.** Beside the figure, three cards: **The codec rule** as MUST / MAY /
   MUST NOT, verbatim from the reference; a **Validator** console printing PASS / WARN / FAIL lines produced at render by
   the real `validateManifest` (and T04a's warnings) on the house tape as the download packs it, plus two labelled
   hand-edited copies (a timestamp consent date; a `.webm` narration); and **Write your own player**, the reference's
   fflate snippet, which a Node test runs against the real packed demo. The download moves into the hero as the reference
   draws it, and the hero lede becomes the reference's.
3. **T24a — Per-page moods.** The Creator keeps a story mood and, in Advanced, lets any page have its own: the Inspector's
   MOOD row gains "page N" beside "whole story". Overrides are draft-only state, so the story mood still wins over stale
   page data exactly as today; at publish every page's `music` is its effective mood. The Stage's status row, the mood lane
   (T13b) and the Studio preview all play the page's own mood (Stage = Player). A re-voiced tape (T15) keeps its source's
   mood arc unless a mood was chosen on the shelf.
4. **T24b — Type a feeling.** A TYPE A FEELING row runs `resolveMood` on what the parent types ("a quiet lullaby for
   bedtime" → Hush), shows the result as a mood pill, says honestly when no feeling word was recognised (Wonder is the house
   default), and applies it to this page or to every page. The typed words are never stored.

## User Stories

1. As a developer arriving from a tape's J-card, I want to see one real page taken apart into its seven layers, so that I understand the format in one look.
2. As a developer, I want each plate to name its manifest field (`pages[].text.audioUrl`…), so that I can find it in a file.
3. As a developer, I want plates the tape does not use to say so, so that I learn which layers are optional.
4. As a developer, I want the Signature layer marked as the v2.1 draft, so that I know it may still change.
5. As a developer, I want the codec rule as three lines (MUST, MAY, MUST NOT), so that I can implement it without reading prose.
6. As a developer, I want to see real validator output (PASS, WARN, FAIL) in the validator's own words, so that I know what my tapes will be told.
7. As a developer, I want a working snippet that unzips a tape and walks its pages, so that I can write my own player in minutes.
8. As a developer, I want the demo download at the top of the page, so that I can test my player on a real file right away.
9. As a screen-reader user, I want the figure's plates read in layer order (01 to 07) with their values, so that the picture is not the only way in.
10. As a phone user, I want the plates to lie flat and full width at 375 px, so that the figure stays readable and the page never scrolls sideways.
11. As a parent in Advanced mode, I want to give one page its own mood, so that the scary page can be Suspense and the last page Calm.
12. As a parent, I want the whole-story mood to stay one control, so that Simple mode's single choice still means every page.
13. As a parent, I want the Stage and the filmstrip's mood lane to show each page's mood, so that what I see is what the Reader will play.
14. As a parent, I want the preview to change melody when it turns to a page with another mood, so that I hear the tape as a listener will.
15. As a parent re-voicing the house tape, I want its Wonder → Adventure → Calm arc kept, so that my copy feels like the original.
16. As a parent, I want to type a feeling in my own words and see which mood it means, so that I do not have to learn eight names.
17. As a parent, I want to be told when the app did not recognise my words, so that "Wonder" is not passed off as understanding.
18. As a parent, I want to apply that mood to this page or to every page, so that typing is as powerful as choosing.
19. As a parent, I want my typed words kept nowhere, so that only the mood name goes into the tape.
20. As a keyboard user, I want every new Inspector control labelled and reachable in order, so that Advanced stays accessible.

## Implementation Decisions

- **Packet plates (new, pure; T23a).** Maps (manifest, page index, an asset-path resolver, optional voice seconds) → seven
  plates `{ n, layer, path, value, empty }` in layer order, using only what the tape carries: 01 metadata (title · by
  author · language); 02 the picture's packed path and alt text; 03 the sentence; 04 the voice's path and codec (+ seconds
  when known) or "none on this page — the browser voice reads it"; 05 the page's mood (T10's music plan) with the bed's
  scale and tempo from `MOODS` and the duck depth from the engine's exported dB constant; 06 autoPause × the timing
  multiplier, chime on/off, words light up or not; 07 ownership · rights · consent (grantedBy · date) or "nothing signed on
  this tape yet". The legacy v1 `signature.qrCode` is never surfaced. Relative imports only.
- **Packed asset naming (T23a).** The container's private "data URL → `assets/<base>.<ext>`" rule is exported as a pure
  helper that `buildStorysyncFromStory` itself uses, so the figure prints the path the download really writes
  (`assets/page-3.jpg`).
- **Kit `PacketExploded` (T23a builds; T05b allocation, brief `design_system` LOCAL piece 11).** An ordered list in layer
  order; visually 07 on top (column-reverse); each plate a parallelogram (skewX −18° on a decorative backing, contents
  upright), 2 px ink border, radius 8, layer fill tokens, a 22 px ink number chip, Fraunces 600 15 px name, mono 10.5 px
  path, the artifact at the right; 10 px gaps, each plate 14 px right of the one below, dashed ink connectors at both
  corners, soft shadow. Below 768 px: flat, full width, no offset. Static: nothing animates.
- **Validator report (new, pure, storysync library; T23b).** `validationReport(manifest, assetPaths?)` → ordered
  `{ level: "PASS" | "WARN" | "FAIL", text }` lines: "version <v> · metadata.title · <n> pages" when those pass; "every
  assets/ path in the manifest exists" (or a FAIL naming the missing paths) when an asset list is given; every
  `validateManifest` warning verbatim as WARN and every error verbatim as FAIL. A caller may prefix a line ("a hand-edited
  copy: "). It never rewrites the validator's sentences.
- **Protocol page (T23a/b).** The hero gains the reference lede and the download (DownloadDemo's compact variant, same
  hooks); a new figure-grid section follows (FIG. 1 left, three cards right); the existing sections (seven flat bands +
  legend, container, full codec rule + ladder, privacy) stay below unchanged; the old bottom "Hold one in your hand"
  section is removed because its download moved up. The demo manifest is imported statically (the landing already does,
  T01), so the figure and the validator need no fetch.
- **Studio page moods (new, pure; T24a).** Draft-only `pageMoods: Record<pageId, MoodName>` beside the story `mood`.
  Pure helpers: the effective mood of a page (override, else story mood), the published `music` per page (effective when
  music is on, absent when off), renumbering with the pages at publish, pruning on page delete, and the per-page list the
  mood lane draws. Overrides never live in the draft's `page.music`, which keeps today's rule that the Studio's choice wins
  over stale page data.
- **Re-voice keeps the arc (T24a).** T15's open path also derives the source's per-page moods through T10's music plan
  (pages whose mood differs from the story mood), which become `pageMoods`; T15's pure `revoice.ts` is unchanged; a
  `&mood=` from the shelf (T22a) still applies one mood to every page.
- **Studio audio (T24a).** The preview bed plays the active page's effective mood and, when playback turns to a page with
  another mood, crossfades with the engine's default (T10's optional seconds left unset).
- **Inspector (T24a/b).** MOOD keeps `#insp-mood` as the whole-story control and adds `#insp-page-mood` ("Same as the
  story (<Mood>)" + the eight moods) with a mono line "whole story · page N has its own mood" when an override exists.
  TYPE A FEELING adds `#insp-feeling` with a live result pill and two actions ("Use for page N", "Use for every page").
  Simple mode's Music card choice sets the story mood and clears every override, with a one-line note when overrides exist.
- **Mood explanation (T24b).** `explainMood(value)` in the shared moods module returns `{ mood, matched }` with exactly
  `resolveMood`'s mood and the word that decided it (null for the house-default fallback or for empty input). Additive; no
  existing export changes.
- No new runtime dependencies; no network; nothing typed leaves the device; no status chips on built items.

## Testing Decisions

- **E2E seam:** `/protocol` (desktop 1280×720 and mobile 375×812 projects, plus 1140×712 for fidelity and the 320–1440
  overflow sweep the shipped suite already runs) and `/studio` Advanced (plus 1290×900). Prior art: `tests/wp-landing.spec.ts`
  and `tests/critic-landing.spec.ts` (/protocol structure, overflow, focusable code blocks, the download), T00's
  `seedStudioDraft` + `restoreDraft`, `tests/wp-studio.spec.ts` publish read-back, `tests/wp-player.spec.ts` /
  T10's `window.__ssyncPlayer` getters for per-page playback.
- **Node seam** (prior art `tests/storysync-roundtrip.spec.ts`): packet plates on the house tape and on Twinkle (which
  proves the figure would print Mia's page exactly as the reference does); the validator report on the house tape packed
  for real from `public/demo` with `packStorysync`, on Twinkle, and on hand-edited copies; the "Write your own player"
  snippet executed against packed bytes; the studio page-mood helpers; `explainMood` against `resolveMood` over a phrase list.
- **Behaviour, not markup:** the strings a developer reads, the manifest a publish writes, the mood the engine is playing,
  computed styles that carry the register (paper plates, ink borders, skew only at ≥ 768 px), keyboard order, overflow.
- **Constraints from shipped tests** (built around, never weakened): one `h1`; exactly one heading matching
  `/codec rule/i` and one matching `/published-audio codec rule/i`; layer names as `h3` only in the legend and as text only
  inside `svg.pr-packet-svg`; seven `[data-protocol-layer]`; one `[data-protocol="download-demo"]`, one
  `[data-protocol="download-status"]`, a `.pr-take` to scroll to; exactly two links to `docs/format-spec.md` and one each
  to the v1/v2 schemas; `.pr-tree` and `.pr-code` unique, focusable and self-scrolling at 375 px; `#insp-mood` and
  `#insp-autopause` ids; the Studio's mood winning over the draft's stale `page.music`.

## Out of Scope

Quoted from HANDOFF §4:
- s09 **P3, do not build:** "the Tauri desktop app, the professional multi-lane timeline, Cast (several narration tracks
  per page), sound effects lane." — no window chrome, no timeline, no CAST list, no SFX lane, no "Opened from …"
  provenance panel beyond what T15 shows.
- s08's e-reader ("MARCO'S PLAYER · 41 LINES", LOCAL piece 14) is a figure beside the laptop, not product UI; it is not
  built. The snippet is the honest form of it.
- s09's "Voice clean-up (level, rumble)" row is T17's "Evening out each voice" (M3), not M5.
- s08's author-default accessibility (the Player honouring `settings.accessibility`) is T11 (M2); the Behavior plate
  only describes the layer.
- HANDOFF §4 s10: "Everything here is **P3** or **I** … Do not build any of it."
- Authoring per-page crossfade durations (`pages[].music.duration`): T10 plays them; no Creator control is planned.

## Open Questions (for Jon)

1. **`shared_links.views` / `storybooks.view_count`.** Same as M0-PRD OQ 3, M2-PRD OQ 4, M3-PRD OQ 1, M4-PRD OQ 1:
   confirmed nothing in `src/` increments either (grep); M5 reads neither. Dropping them is a production migration only you
   can approve.
2. **Whose page is exploded.** The figure shows the house tape's page 3, so its Voice and Signature plates are honestly
   empty (the house tape is read by the browser voice and signs nothing). The reference explodes Mia's page 3, where every
   plate is full. Should `/protocol` accept the tape you came from (the J-card link carrying its share code) and explode
   that page instead? It would be a T12 + T23 follow-up; M5 does not build it.
3. **Validator lines on hand-edited copies.** The house tape passes cleanly, so the WARN and FAIL lines come from two
   labelled hand-edited copies, each prefixed "a hand-edited copy:" (the reference prefixes only the FAIL). And the real
   validator quotes paths with double quotes where the reference draws single quotes. Keep the validator's real wording?
4. **Simple mode clears per-page moods.** Choosing a mood in the Music card (Simple mode) sets every page and drops the
   Advanced overrides, with a note saying so. Alternative: keep overrides and change only the pages that follow the story.
   Which do you want?
5. **Unrecognised feelings.** `resolveMood` maps any unknown phrase to Wonder (the house default). T24b shows Wonder with
   "No feeling word we know — Wonder is the house default." Should an unrecognised phrase instead apply nothing?

## Notes

- **File order (strict):**
  - `src/components/protocol/ProtocolPage.tsx`, `protocol.css`, `DownloadDemo.tsx`: T23a → T23b (no other M0–M5 ticket
    edits them; T05a edits `layers.ts` only).
  - `src/lib/storysync/container.ts`: T23a (one pure export; no behaviour change).
  - `src/components/studio/Inspector.tsx`: T17 (M3, Mix switch) → T24a → T24b.
  - `src/components/studio/Studio.tsx`, `types.ts`, `draft.ts`, `ToolPanels.tsx`: M4's chain (… → T19 → T22b) → T24a →
    T24b (T24b touches `Studio.tsx` only to wire the Inspector callbacks).
  - `src/components/studio/useStudioAudio.ts`: T24a.
  - `src/components/studio/open-tape.ts` (T15's file): T15 → T24a.
  - `src/lib/audio/moods.ts`: T24b (additive export).
- **Kit allocation reconciled.** T05b's table says T23 reuses `PacketBands` (T14) in its flat form. The shipped `/protocol`
  already draws the flat bands as the inline SVG that `tests/wp-landing.spec.ts` and `tests/critic-landing.spec.ts` pin
  (`svg.pr-packet-svg`, `[data-protocol-layer]`), so T23 keeps that SVG and adds only `PacketExploded`. Record in REPORT.md.
- **One spectacle.** The exploded figure is static; it never animates in, on scroll or on hover.
- **Status chips.** Built items carry none: no "Next" on FIG. 1, on the Behavior plate's author defaults (T11 builds them),
  on "whole story · per-page moods", or on TYPE A FEELING. s09's "Phase 3 · desktop app" and "Shipped in the web Studio
  today" chips belong to the window frame and the Inspector header, neither of which M5 changes.
- **Reference copy kept verbatim:** "FIG. 1 — PAGE 3 OF … TAKEN APART" (with the house tape's title), the seven layer names
  and field paths, "V2.1 · DRAFT", "A reader that understands only layers 1–3 still shows the story; each layer above adds a
  sense.", "The codec rule", the three MUST / MAY / MUST NOT sentences, "Validator", "PASS  version 2.0 · metadata.title ·
  <n> pages", "PASS  every assets/ path in the manifest exists", "WARN  signature.voiceConsent[0].date is a full timestamp;
  the v2.1 draft asks for a date" (after the prefix), "Write your own player" and its snippet, "Download the demo as
  .storysync", "Nothing is uploaded — the ZIP is built on this device.", the reference lede; in s09 "MOOD", "whole story",
  "TYPE A FEELING", "a quiet lullaby for bedtime", "Hush".
- **Reference crops:** s08 laptop screen `renders/s08.png` x98–1238, y58–770 (1140×712, 1:1): hero ≈ y100–290, exploded
  stack ≈ x130–740, y285–745, right cards ≈ x762–1206, y292–738, hero download ≈ x915–1206, y120–186. s09 window
  x24–1314, y50–950 (1290×900): Inspector MIX/MOOD/TYPE A FEELING ≈ x950–1300, y360–560; Stage header ≈ x270–935, y160–185;
  PAGES list ≈ x24–255, y290–620.
