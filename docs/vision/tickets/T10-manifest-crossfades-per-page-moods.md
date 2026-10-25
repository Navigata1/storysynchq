# T10 · Honour manifest crossfade durations; per-page mood playback
Milestone: M2 · Reference: s02 (brief screens[1]) · Status in reel: Next (s02 "mood crossfades (1.6 s - the manifest's own crossfade duration is not read yet)")
Type: AFK (agent can finish alone)
Blocked by: T03 (file order on `Player.tsx`: T03 edits the deck first)   ·   Blocks: T11 (file order on `Player.tsx`), T09a (uses the engine's exported duck depth), T12 (uses the music plan), T24

## Why
s02's turn figure draws the melody changing under the page: "Wonder → a diagonal crossfade wedge labelled
'1.6 s' → Adventure", and the realism note is blunt: "mood crossfades (1.6 s - the manifest's own crossfade
duration is not read yet)". The house tape's own manifest asks for a 2 s crossfade into Adventure on page 4
and 3 s into the peaceful ending on page 6; today both are played in 1.6 s. When the Creator writes moods
per page (T24), every page's own mood must play, entered at the pace its author wrote.

## Done when (acceptance, each testable)
- [ ] A pure music-plan module answers, for any page of any manifest: the page's mood (same results as the
      Player's current private logic: v2 mood strings, v1 track ids via `music.tracks`, `{ crossfade }`
      objects, silence when the page names no music) and the crossfade seconds into it:
      `{ crossfade: "adventure", duration: "2s" }` → 2; `"3s"` → 3; `"450ms"` → 0.45; a string page
      (`"wonder"`) → 1.6; missing/unparseable (`"soon"`, `""`, `"-2s"`) → 1.6; values clamp to 0.05–10 s.
- [ ] The engine's start and set-mood calls take an optional crossfade seconds and pass it to the music
      bed; with no argument the behaviour is exactly today's (1.6 s).
- [ ] The engine and the bed expose a read-only "last crossfade seconds" (null before any crossfade), and
      `window.__ssyncPlayer` gains a getter `crossfadeSeconds()` reading it (getters only, as today).
- [ ] The engine exports its duck depth in dB (derived from the existing duck factor; ≈ 12.04), unchanged
      behaviour.
- [ ] Playing the house tape (`/read?demo=1`), turning 3 → 4 makes `data-mood="Adventure"` and
      `__ssyncPlayer.crossfadeSeconds()` = **2**; 5 → 6 makes `data-mood="Calm"` and = **3**; going back
      6 → 5 crossfades into Adventure with **1.6** (page 5 is a plain string — the duration belongs to the
      page being entered).
- [ ] A per-page-mood fixture tape (Wonder → `{ crossfade: "Hush", duration: "4s" }` → `"Rain"` →
      `"Wonder"`) plays each page's own mood (`data-mood` and `__ssyncPlayer.moodName()` agree per page) with
      crossfades 4, 1.6, 1.6, and the bed never stops between pages (`musicPlaying()` stays true when
      sampled every 50 ms across the turns).
- [ ] A page that names no music still means silence (the bed stops), and Music off still stops the bed.
- [ ] `docs/format-spec.md` §4 documents `pages[].music.duration` ("crossfade into this page's mood;
      default 1.6 s; players MAY clamp"); `public/protocol/v2.schema.json` gives the `duration` property a
      matching `description` (no structural change); `agent_docs/decisions.md` gets one appended entry.
- [ ] No new runtime dependency; `npx tsc --noEmit`, lint, build and the full Playwright suite are green.

## Seams and files
Seam 1 (Node): the pure music-plan module (moods + crossfade seconds) — imported directly by a Node-side
Playwright test, relative imports only. Seam 2 (E2E): `/read` with the live engine observed through
`window.__ssyncPlayer`. The Player stops owning `moodTokens`/`pageMood` privately and asks the music plan;
its music effect passes the entered page's crossfade seconds to the engine.

## Files (ownership)
- `src/components/player/music-plan.ts` — **new** (pure: page mood, crossfade seconds; imports the
  shared moods module by relative path).
- `src/lib/audio/engine.ts` — modify: optional crossfade seconds on `startMusic`/`setMood`, read-only last
  crossfade getter, exported duck depth in dB.
- `src/lib/audio/music.ts` — modify: `MusicBed` records the last crossfade seconds (read-only getter).
- `src/components/player/Player.tsx` — modify: use the music plan; pass crossfade seconds; extend the
  `__ssyncPlayer` hook with `crossfadeSeconds()`.
- `docs/format-spec.md` — modify (§4 playback model, one bullet).
- `public/protocol/v2.schema.json` — modify (description text on `pages[].music.duration` only).
- `agent_docs/decisions.md` — append one entry.
- `tests/vision-music-plan.spec.ts` — **new** (Node-side).
- `tests/vision-reader-crossfade.spec.ts` — **new** (E2E).
- `tests/fixtures/reader-tapes.ts` — **new**, created here: `silentWavDataUrl()`, `libraryRow()`,
  `seedReaderTapes(page, rows)` (writes `ssync-library` once in an init script, as `tests/wp-player.spec.ts`
  does; named apart from T00's fixture-name `seedDeviceLibrary`) and the per-page-mood tape. Later M2 tickets add
  their synthetic tapes to this file in chain order. Twinkle itself always comes from T00.

## Existing tests that may change
- None. Must keep passing unchanged: `tests/critic-player.spec.ts` "mood changes across pages without the
  bed ever stopping" (moods per page `["Wonder","Wonder","Adventure","Adventure","Calm","Calm","Calm"]`,
  zero drops, ≤ 2 contexts), `tests/wp-player.spec.ts` "page.music drives the shared moods module…" and
  "a story with no page.music is silent", `tests/critic-melody.spec.ts` and `tests/wp-melody.spec.ts`
  (the bed's own rendering, default crossfade unchanged).

## Tests (written first)
1. `tests/vision-music-plan.spec.ts` (Node): mood per page of the house tape JSON
   (`wonder ×3, adventure ×2, peaceful→Calm ×3`), crossfade seconds per page (`1.6,1.6,1.6,2,1.6,3,1.6,1.6`),
   the parse/clamp table above, v1 `music.tracks` lookup, silence for no music.
2. `tests/vision-reader-crossfade.spec.ts` (E2E, desktop + mobile projects): the house-tape turns 3→4, 5→6,
   6→5 read `crossfadeSeconds()` 2, 3, 1.6; the per-page-mood fixture reads 4, 1.6, 1.6 with no drops.
Red first: the hook getter does not exist and the Player always passes nothing (1.6).

## Fidelity check
No new visual. Viewport **1120×700** — state: demo page 4 just after the turn from 3 (`data-mood`
"Adventure"); save `docs/vision/evidence/T10.png` and note `crossfadeSeconds()` = 2 in the ledger.
Reference: s02 figure B "PAGE 3 → 4 · THE TURN" (`renders/s02.png` x1316–1584, y250–440) — the wedge label
in the reference says 1.6 s for a string page; the house tape's page 4 now honours its own 2 s.
