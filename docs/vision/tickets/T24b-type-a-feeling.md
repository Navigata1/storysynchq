# T24b · Advanced: "Type a feeling" — `resolveMood` on your own words, applied to this page or every page
Milestone: M5 · Reference: s09 (brief screens[8]) · Status in reel: Next (s09 realism: "the type-a-feeling field (the resolver already exists in the engine)")
Type: AFK (agent can finish alone)
Blocked by: T24a (page moods, the Inspector MOOD row; file order on `Inspector.tsx`, `Studio.tsx`), T22a (kit mood icon set in `MoodTapeChip.tsx`)   ·   Blocks: T25
Split from T24. T24a = per-page moods end to end. T24b = "Type a feeling".

## Why
s09's Inspector draws "a TYPE A FEELING row with .ss-chip--future, the input text, an arrow and .ss-mood.is-on in
--mood-hush": a parent types "a quiet lullaby for bedtime" and the engine answers **Hush**. HANDOFF §4: "**'Type a
feeling'** field that runs `resolveMood` ('a quiet lullaby for bedtime' → Hush)". The resolver already understands
synonyms and phrases (it picks the longest feeling word, "lullaby" over "quiet"); nothing lets a parent use it. It must be
honest when it understands nothing: `resolveMood` returns the house default Wonder for an unknown phrase, and the field must
say that is a default, not an understanding.

## Done when (acceptance, each testable)
- [ ] The shared moods module gains `explainMood(value)` → `{ mood: MoodName | null; matched: string | null }`, additive:
      `mood` always equals `resolveMood(value)`; `matched` is the normalised word or phrase that decided it (a mood name or a
      synonym), or `null` when the result is the house-default fallback or the input is empty. No existing export changes.
      Examples: "a quiet lullaby for bedtime" → `{ Hush, "lullaby" }`; "a bit scary" → `{ Suspense, "scary" }`; "Calm" →
      `{ Calm, "calm" }`; "xyzzy" → `{ Wonder, null }`; "" / "!!" → `{ null, null }`.
- [ ] In the Inspector's Mix section, after T24a's MOOD row: a mono 10.5 px label **"TYPE A FEELING"** for a text input
      `#insp-feeling` (placeholder **"a quiet lullaby for bedtime"**, max 80 characters, `autocomplete="off"`), then, as the
      parent types (debounced ≤ 200 ms), a result pill (`data-studio="feeling-result"`, `aria-live="polite"`): the mood's
      lucide icon (the kit's mood icon set from T22a) and its name, outlined in its `--mood-*` colour with a 20 % fill — e.g.
      **"Hush"** for "a quiet lullaby for bedtime".
- [ ] With `matched === null` and a non-empty input the pill reads "Wonder" and a 11.5 px muted line under it reads
      **"No feeling word we know — Wonder is the house default."**; with empty input there is no pill and both actions are
      disabled.
- [ ] Two actions: **"Use for page N"** (sets `pageMoods[active]` through T24a; Enter in the input does the same) and
      **"Use for every page"** (sets the story mood and clears every override). After either, the MOOD selects reflect it
      and a polite announcement reads "Page 3 is Hush now." / "Every page is Hush now.".
- [ ] The typed words are never stored: not in the draft (`ssync-studio-draft` contains no "lullaby" after typing and
      applying), not in the manifest, not sent anywhere; only the resolved mood name is applied.
- [ ] Keyboard: Tab reaches the input, then "Use for page N", then "Use for every page", each with the kit focus ring;
      the pill is not focusable.
- [ ] No status chip; the field works in Advanced only (Simple mode is unchanged).

## Seams and files
Seam 1 (Node): `explainMood` against `resolveMood` (prior art: `tests/critic-melody.spec.ts` "protocol values, casing, junk
and non-strings" and `tests/wp-melody.spec.ts`). Seam 2 (E2E): `/studio` Advanced with T00's Twinkle draft, publish read-back
(prior art `tests/wp-studio.spec.ts`).

## Files (ownership)
- `src/lib/audio/moods.ts` — modify (additive `explainMood`).
- `src/components/studio/Inspector.tsx` — modify (TYPE A FEELING row).
- `src/components/studio/feeling.css` — **new**, owned by T24b (pill in the mood colour, the muted note).
- `src/components/studio/Studio.tsx` — modify (wire the two actions to T24a's handlers; announcement).
- `tests/vision-type-a-feeling.spec.ts` — **new** (Node + E2E).
- `docs/vision/evidence/T24b-1290.png` — **new**.

## Existing tests that may change
- None. `resolveMood` is untouched, so `tests/critic-melody.spec.ts` and `tests/wp-melody.spec.ts` (vocabulary, casing, junk,
  non-strings) pass unchanged; T24a's Inspector ids are untouched.

## Tests (written first)
`tests/vision-type-a-feeling.spec.ts`:
1. Node: for every phrase in a list (the five examples above, every `MOOD_NAMES` entry in three casings, each synonym in
   `moods.ts` alone and inside a sentence, junk, non-strings), `explainMood(x).mood === resolveMood(x)`; `matched` is null
   exactly when the input has a letter or digit but no known word, or is empty.
2. E2E (desktop): Twinkle draft → Advanced → page 3 → type "a quiet lullaby for bedtime" → the pill reads "Hush" with border
   colour `rgb(169, 139, 245)`; press Enter → `#insp-page-mood` value Hush; the announcement text.
3. E2E: type "xyzzy" → pill "Wonder" and the house-default line verbatim.
4. E2E: type "a bit scary" → "Use for every page" → `#insp-mood` value "Suspense", no page override; Finish → every page's
   `music` "Suspense".
5. E2E: after typing and applying, `localStorage["ssync-studio-draft"]` does not contain "lullaby" or "scary".
6. E2E: empty input → both buttons disabled, no pill.
Red first: no `explainMood`, no field.

## Fidelity check
Viewport **1290×900** — state: the house tape in the Creator, Advanced, page 3, "a quiet lullaby for bedtime" typed, Hush
shown. Compare with s09 (`renders/s09.png` Inspector TYPE A FEELING row ≈ x960–1300, y500–550): input, arrow, Hush pill in
`--mood-hush`. Save `docs/vision/evidence/T24b-1290.png`. Deviations to record: two explicit apply buttons instead of the
reference's single arrow (the reference does not say which pages the arrow applies to); the house-default note (M5-PRD
OQ 5); no "Idea"/"Next" chip.
