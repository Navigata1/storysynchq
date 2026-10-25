# T24a · Advanced: per-page moods (Inspector "whole story · page N"), published per page, played per page in the Creator
Milestone: M5 · Reference: s09 (brief screens[8]) · Status in reel: Next (inside a Shipped Inspector; the window frame is Phase 3)
Type: AFK (agent can finish alone)
Blocked by: T10 (the Player plays each page's mood; music plan), T13a (Stage status row shows the mood), T13b (mood lane takes one mood per page), T15 (the open path in `open-tape.ts` this extends), T17 (file order on `Inspector.tsx`), T22b (file order on `Studio.tsx`, `ToolPanels.tsx`, `types.ts`, `draft.ts`), T00 (Twinkle draft)   ·   Blocks: T24b, T25
Split from T24. T24a = per-page moods end to end. T24b = "Type a feeling".

## Why
s09's Inspector MIX section draws the MOOD select ("Hush · D open fourths/fifths · 66 BPM") with the line "whole story ·
per-page moods next", and HANDOFF §4 marks "**per-page moods** in the Creator" as Next. The house tape already moves from
Wonder to Adventure to Calm, and since T10 the Player plays each page's own mood with the author's crossfades, but the
Creator can only write one mood for the whole story. Doctrine: "Stage = Player" — the Creator's status row, mood lane and
preview must play what the Reader will play, page by page.

## Done when (acceptance, each testable)
- [ ] `StudioState` gains draft-only `pageMoods: Record<string, MoodName>` (page id → explicit override); `blankState`
      gives `{}`; `loadDraft` fills `{}` for older drafts and drops entries for unknown pages or non-mood values.
      Overrides never live in the draft's `page.music`.
- [ ] A pure page-moods module exports: `effectiveMood(state, pageId)` (override, else story `mood`); `publishedMusic(state,
      pageId)` (effective mood when `musicOn`, `undefined` when off); `renumberPageMoods(pageMoods, oldIdsInOrder)` (to 1…n
      with the pages at publish); `prunePageMoods(pageMoods, pageIds)`; `moodsForLane(state)` (one entry per page, `null` when
      music is off); and `sourcePageMoods(sourceManifest, storyMood)` (each source page's mood through T10's music plan, which
      understands v1 track ids and `{ crossfade }` objects; only pages whose mood differs from the story mood; keyed by the
      re-voiced page ids 1…n).
- [ ] **Inspector MOOD row** (Advanced, in Mix, after T17's switch order is respected): the shipped select `#insp-mood` stays
      the whole-story control (label unchanged), and a second select **`#insp-page-mood`** labelled "mood · page N" offers
      **"Same as the story (<Mood>)"** then the eight moods as "<Name> · <scale> · <tempo> BPM" (the shipped readout format).
      When the active page has an override, a mono 10.5 px line reads **"whole story · page N has its own mood"**; otherwise
      **"whole story · every page"**. Choosing a mood sets `pageMoods[activeId]`; choosing "Same as the story" removes it.
- [ ] **Publish.** Every published page's `music` is `publishedMusic` for its draft id (music off → no `music` key on any
      page, as today); `pageMoods` is re-keyed with the renumbered pages, so a second publish writes the same moods.
- [ ] **Stage = Player.** T13a's Stage status row shows the **active page's** effective mood ("Hush · music on"); T13b's mood
      lane draws one segment per page in that page's mood colour, and its label names the story mood when every page shares
      it ("WONDER · GENTLE MUSIC ADDED FOR YOU" unchanged in that case). The Creator's preview bed plays the active page's
      effective mood and, when playback turns to a page with another mood, changes mood with the engine's default crossfade.
- [ ] **Re-voice keeps the arc.** T15's open path (`open-tape.ts`) also computes `sourcePageMoods` from the source
      manifest before re-voicing it (T15's `revoice.ts` is unchanged); opening the house tape (`/studio?open=house`) gives pages 4–5 Adventure and 6–8 Calm
      (the JSON's "peaceful" resolves to Calm) over a Wonder story; `&mood=<name>` (T22a) still means one mood on every
      page (overrides cleared).
- [ ] **Simple mode stays simple.** Choosing a mood in the Music card sets the story mood and clears every override; while
      overrides exist the card shows one line: **"<n> pages have their own mood — choosing here sets every page."** ("1 page
      has its own mood — …" for one).
- [ ] Deleting a page drops its override; moving a page keeps it with the page; "Start a new story" and "delete
      everything" clear all overrides.
- [ ] End to end: a Twinkle draft, Advanced, page 3 → Hush, Finish → gate → the library row has `pages[2].music` "Hush" and
      every other page "Wonder"; opening its link and turning to page 3 gives `data-mood="Hush"` and
      `__ssyncPlayer.moodName()` "Hush" (T10's hooks).
- [ ] No status chip; no new dependency; nothing leaves the device.

## Seams and files
Seam 1 (E2E, primary): `/studio` Advanced with T00's `seedStudioDraft(page, "twinkle")` + `restoreDraft`, publish and
library read-back (prior art `tests/wp-studio.spec.ts`), then `/read?story=<code>` with T10's `__ssyncPlayer` getters.
Seam 2 (Node): the page-moods module, including `sourcePageMoods` on the house JSON and on Twinkle (prior art T15's Node
block). The Studio audio hook
reads `effectiveMood` for the active page; no engine change.

## Files (ownership)
- `src/components/studio/page-moods.ts` — **new** (pure; relative imports only).
- `src/components/studio/types.ts` — modify (`pageMoods` in `StudioState`, `blankState`).
- `src/components/studio/draft.ts` — modify (`loadDraft` fills/sanitizes `pageMoods`).
- `src/components/studio/Studio.tsx` — modify (handlers; `publishedMusic` in `runPublish`; re-key after publish; prune on
  delete; pass per-page moods to Stage/Filmstrip; open path takes re-voice page moods unless `&mood=`).
- `src/components/studio/Inspector.tsx` — modify (`#insp-page-mood`, the mono line).
- `src/components/studio/ToolPanels.tsx` — modify (Music card: clear overrides + the note).
- `src/components/studio/useStudioAudio.ts` — modify (play the active page's effective mood; change on page turns).
- `src/components/studio/open-tape.ts` — modify (T15's file: compute `sourcePageMoods` before re-voice; drop them when
  `&mood=` is present).
- `tests/vision-page-moods.spec.ts` — **new** (Node + E2E).
- `docs/vision/evidence/T24a-1290.png` — **new**.

## Existing tests that may change
- None. Built around (must keep passing unchanged): `tests/critic-studio.spec.ts` › "music off strips an existing
  page.music; music on writes the shared mood" (drafts carrying `music: "Rain"` with story mood "Calm" still publish "Calm"
  — overrides are not read from `page.music`); `tests/wp-studio.spec.ts` (`pages[0].music` "Hush"; music off deletes
  `page.music`); `tests/critic-studio.spec.ts` (`#insp-autopause` and the Inspector's other ids); T15's
  `tests/vision-revoice.spec.ts` (`revoice.ts` is untouched; its output still has no `music` on any page); T13b's lane tests for a single-mood story.

## Tests (written first)
`tests/vision-page-moods.spec.ts`:
1. Node: `effectiveMood` / `publishedMusic` with and without overrides and with music off; `renumberPageMoods({ "7":
   "Hush" }, ["3","7"])` → `{ "2": "Hush" }`; `prunePageMoods` drops a deleted id; `moodsForLane` length = pages.
2. Node: `sourcePageMoods(houseJson, "Wonder")` → `{ "4": "Adventure", "5": "Adventure", "6": "Calm", "7": "Calm", "8":
   "Calm" }` (page 4 is a `{ crossfade: "adventure" }` object, page 6 `{ crossfade: "peaceful" }`); Twinkle (all Wonder) →
   `{}`.
3. E2E (desktop): Twinkle draft → Advanced → page 3 → `#insp-page-mood` = Hush → the line "whole story · page 3 has its own
   mood"; the Stage status row reads "Hush · music on"; the lane's third segment has the Hush colour `rgb(169, 139, 245)`.
4. E2E: publish → `pages[2].music` "Hush", others "Wonder"; publish again → same.
5. E2E: open the published link → ArrowRight ×2 → `data-mood="Hush"` and `moodName()` "Hush"; back to page 2 → "Wonder".
6. E2E: Simple mode Music card shows "1 page has its own mood — choosing here sets every page."; choose Calm → every page
   publishes "Calm"; the line is gone.
7. E2E: delete page 3 → no override remains (publish shows no Hush).
8. E2E: `/studio?open=house` → Advanced → page 6 shows `#insp-page-mood` = Calm; `/studio?open=house&mood=Hush` → every
   page "Same as the story (Hush)".
Red first: no page select; publish writes one mood.

## Fidelity check
Viewport **1290×900** — state: the house tape opened in the Creator, Advanced on, page 3 active with its own Hush mood.
Compare with s09 (`renders/s09.png` window x24–1314, y50–950; Inspector MIX/MOOD ≈ x950–1300, y360–480; Stage header ≈
x270–935, y160–185): the MOOD select and line, the Stage's "Hush" readout. Save `docs/vision/evidence/T24a-1290.png`.
Deviations to record: no "Next" chip; no window title bar, CAST, timeline or SFX lane (Phase 3); the mood readout uses the
shipped "<scale> · <tempo> BPM" format.
