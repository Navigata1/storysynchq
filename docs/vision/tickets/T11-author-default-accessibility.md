# T11 · Author-default accessibility from `settings.accessibility`
Milestone: M2 · Reference: s08 (brief screens[7], plate 06) + s02 (brief screens[1], figure C) · Status in reel: Next
Type: AFK (agent can finish alone)
Blocked by: T10 (file order on `Player.tsx`)   ·   Blocks: T08 (file order on `Player.tsx`), T23 (its plate 06 "Next" chip can be dropped once this ships)

## Why
The protocol page's Behavior plate promises "06 Behavior · settings · pages[].timing — autoPause 2s × 1.0 ·
chime on · words light up" with three micro renderings (default, high contrast, easier to read) and a
violet "Next" for author defaults; its realism note is exact: "author-default accessibility (in the schema;
the Player only reads viewer preferences)". HANDOFF §4 s08: "the Player honoring author-default
accessibility from `settings.accessibility` (viewer preferences still win)". s02's figure C shows the same
page "ONE PAGE, THREE WAYS" — "Default", "Easier to read", "High contrast" — "saved on this device only".
A parent making a tape for a child with low vision should not have to tell the grandparent to find a switch.

## Done when (acceptance, each testable)
- [ ] The manifest type carries the two schema fields it lacks: `settings.accessibility.highContrast` and
      `settings.accessibility.dyslexiaFont` (booleans; the JSON schema already defines both).
- [ ] A pure reader-prefs module resolves effective preferences field by field:
      viewer's explicit choice → else the tape's author default → else the product default.
      Author defaults: `highContrast` → contrast, `dyslexiaFont` → easier-to-read. `timingMultiplier` and
      `pauseBetweenPages` keep their shipped behaviour (they already scale every pause; the viewer's
      "Pause between pages" multiplies on top).
- [ ] Only explicit viewer choices are stored (on this device only, under the existing `ssync-reader-prefs`
      key, new sparse shape with a version marker). Opening the Reader without touching a setting writes
      **nothing** to storage. Legacy full objects are read as explicit only for values that differ from the
      product defaults (e.g. a stored `contrast: true` stays a choice; a stored `contrast: false` is not).
- [ ] A tape with `settings.accessibility.highContrast: true` opens in high contrast (`.pl-root.is-hc`)
      for a viewer with no stored choice; with `dyslexiaFont: true` it opens with the easier-to-read font
      (`.pl-root.is-dys`, prose font-family not Fraunces).
- [ ] In Reading options, a switch whose value comes from the tape shows the hint
      "Set by the storyteller" (and the switch reflects the effective value).
- [ ] Turning that switch off makes it the viewer's explicit choice: `is-hc` is removed, the choice
      survives a reload of the same tape, and it also wins on a *different* tape that asks for high contrast
      ("viewer preferences still win").
- [ ] Reading options shows a footer line "Saved on this device only" (s02 figure C copy, sentence case).
- [ ] A tape without `settings.accessibility` behaves exactly as today for a viewer with no choices.
- [ ] Every pause still respects `timingMultiplier` (house tape: `1.0`, unchanged runtime label `~1:47`).
- [ ] `docs/format-spec.md` §4 states "Players SHOULD apply `settings.accessibility` as defaults; a viewer's
      own choices override them, and are stored on the device only"; `agent_docs/decisions.md` gets one entry.

## Seams and files
Seam 1 (Node): the pure reader-prefs module (`resolve(authorDefaults, viewerChoices)`, `sanitize(stored)`,
`toStored(choices)`), relative imports only. Seam 2 (E2E): `/read?story=<id>` with seeded tapes, asserting
classes on `.pl-root`, the sheet's switches and `localStorage` contents.

## Files (ownership)
- `src/components/player/prefs.ts` — **new** (pure resolution + sparse storage shape).
- `src/components/player/Player.tsx` — modify: replace the in-file `Prefs`/`sanitizePrefs`/storage effects
  with the prefs module; switches mark storyteller defaults; sheet footer line.
- `src/lib/storysync/manifest.ts` — modify: add `highContrast?`, `dyslexiaFont?` to `settings.accessibility`
  (type only; `validateManifest` unchanged).
- `docs/format-spec.md` — modify (§4, one bullet).
- `agent_docs/decisions.md` — append one entry.
- `tests/vision-reader-prefs.spec.ts` — **new** (Node-side, pure module).
- `tests/vision-reader-author-a11y.spec.ts` — **new** (E2E).
- `tests/fixtures/reader-tapes.ts` — modify: add `authorHighContrastTape`, `authorEasierReadTape`.

## Existing tests that may change
- None. No current test reads `ssync-reader-prefs` or the `is-hc`/`is-dys` classes (verified by grep).
  Must keep passing: every `tests/wp-player.spec.ts` and `tests/critic-player.spec.ts` test (they run with
  an empty prefs store and tapes without author defaults).

## Tests (written first)
1. `tests/vision-reader-prefs.spec.ts` (Node): resolution table (no author/no viewer → defaults; author
   contrast → on; author on + viewer off → off; viewer on + author none → on; dyslexia likewise); legacy
   object `{speed:"normal",timing:1,fontScale:1,dyslexia:false,contrast:true}` → only `contrast` explicit;
   garbage → no choices; `toStored` round-trips and omits untouched fields.
2. `tests/vision-reader-author-a11y.spec.ts` (E2E): open the high-contrast fixture → `is-hc`, hint visible in
   Reading options, storage empty; switch off → no `is-hc`, storage holds only `contrast:false`; reload → still
   off; open the easier-read fixture → `is-dys` and the prose is not Fraunces; open the house tape → neither.
Red first: the author-default tape opens without `is-hc`.

## Fidelity check
Viewport **1120×700** — state: the high-contrast fixture on page 1, then Reading options open; compare the
text treatment with s02 figure C "High contrast" crop (`renders/s02.png` x1494–1576, y505–600) and the sheet
with the s02 figure C footer "saved on this device only". Save `docs/vision/evidence/T11-hc.png` and
`T11-sheet.png`. Reference for the protocol promise: s08 plate 06 (re-checked in T23).
