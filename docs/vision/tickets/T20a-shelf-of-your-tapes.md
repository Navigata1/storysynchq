# T20a · The shelf: your tapes as cassettes on a ledge, selected lift, pull-out delete
Milestone: M4 · Reference: s07 (brief screens[6]) · Status in reel: Next
Type: AFK (agent can finish alone)
Blocked by: T00 (fixtures), T01 (tape-meta runtime label), T05a + T05b (tokens; allocates Shelf + ShelfTape to this ticket), T13b (kit `TapeRibbon` in use), T16 (kit `PullTapeIcon` in `PrintSlot.tsx` in use), T10 (`tests/fixtures/reader-tapes.ts`), T15 (shared tape-source resolver; file order on `ReadRoom.tsx`), T18 (file order on `ReadRoom.tsx`)   ·   Blocks: T20b, T21, T22a, T25
Split from T20. T20a = your own tapes, selection, the band, pull-out delete. T20b = Sent to you + NEW.

## Why
s07 is the family's shelf: "a Register A room holding Register B tapes … four shelf tapes (LOCAL piece 8, 150x110
faces) standing on an 8px #3B3733 ledge", "Mia's tape — lifted 10px over a gold glow", "'Bath Time Song' — tilted 8deg
and raised 30px, half out of its slot, a tape-brown loop spilling below it, a small glass toast above it" reading
"Pulled out. Pictures, voices, the saved copy and the link are gone.", and "a blank paper tape with a dashed ink
border, i-plus and mono text". The realism note: "Next: a shelf view of the family's saved tapes (the cloud library
exists; the redesign has no shelf)". design-direction §2: "A story in a library is a cassette on a shelf … Deleting is
pulling the tape out." Today `/read` shows three doors and none of the tapes this family already made.

## Done when (acceptance, each testable)
- [ ] The Read Room chooser (no `?story=`, no `?demo=`) keeps the kicker "STORYSYNC READER" (rendered text
      "StorySync Reader", uppercase by CSS) and the h1 **"Pick a tape."**, then a section "YOUR TAPES"
      (`data-shelf="yours"`; mono 11 px label) with the note **"Unlisted. Only people you send a link to can open
      them."** (12 px, `--ss-fg-3`, lucide `Lock`, decorative).
- [ ] The section holds a kit `Shelf` (8 px `--ss-shell` ledge, 1 px top highlight, soft shadow) with one kit
      `ShelfTape` per tape in this device's library (`ssync-library`) and, when Supabase is configured and a grown-up is
      signed in, per row of their cloud library, merged by id, newest first; then, last, the blank tape.
- [ ] Each `ShelfTape` (`data-sk="shelf-tape"`, `data-tape-id="<id>"`) is a 150×110 face at ≥ 768 px (≥ 128 px wide
      below): paper label with the 10 px tape-red stripe and label-yellow band with two ink holes; title in Fraunces 800,
      at most two lines (ellipsis; full title in the accessible name); a 32 px inset of the tape's first pictured page
      (2 px ink border; omitted when the tape has no picture); a mono 9.5 px uppercase meta "<AUTHOR> · ~m:ss" (author
      omitted when empty; runtime from T01's tape-meta helper); a small dark reel window with two kit `Reel`s at rest.
      All colours from T05a tokens.
- [ ] The blank tape is the shipped door: class `pl-choice pl-choice-3`, accessible name "Make your own story in the
      studio", paper face with a 2 px dashed ink border, lucide `Plus`, **"Make your own"** and
      **"BLANK TAPE · YOUR VOICE · YOUR PICTURES"**; activating it navigates to `/studio` as today. It stands on the same
      ledge after the radio group below and is a button, not a radio (it is never "selected").
- [ ] Shelf tapes form a radio group named "Your tapes" (`role="radiogroup"`, each tape `role="radio"` with
      `aria-checked`, roving tabindex). Click, Enter or Space selects; ← / → move the selection; selecting never opens a
      tape. The first tape is selected on arrival.
- [ ] The selected tape is lifted 10 px (`translateY(-10px)`) over a gold glow (a soft `--ss-gold` radial under it),
      with a 300 ms `var(--ss-ease)` transition; under `prefers-reduced-motion: reduce` it is lifted with no transition.
- [ ] Below the shelf, a band for the selected tape (`data-shelf="band"`): a mono label-yellow line
      "<TITLE> · <AUTHOR>" (uppercase), a gold **"Play this tape"** (lucide `Play`) that opens the Player's cover gate for
      that tape (the end card's QR uses the tape's `signature.shareUrl` when it has one), and a ghost button with a
      tape-red outline and the kit `PullTapeIcon` (in use since T16): **"Pull the tape out"**.
- [ ] "Pull the tape out" arms on the first activation (label becomes **"Tap again to delete everything"**, tape-red
      variant, like the publish card's delete); a second activation within the same selection deletes; changing the
      selection or pressing Escape disarms it.
- [ ] Deleting runs the shipped `deleteBook(id)` (device copy, cloud row and its share link), and also clears the
      Studio draft (`ssync-studio-draft`) when that draft is this tape (its `published.id` or `publishedIds` contains
      the id); a draft for a different story is left alone.
- [ ] The pull-out: the tape tilts 8° and rises 30 px over 420 ms `var(--ss-ease)`, a tape-brown loop (the kit
      `TapeRibbon`, stroke 12, round caps) spills below it, then it leaves the shelf; a status line (`role="status"`)
      reads **"Pulled out. Pictures, voices, the saved copy and the link are gone."** and the next tape is selected.
      Under reduced motion the tape is removed at once with the same line. Input is never blocked during the motion.
- [ ] After a pull-out, `ssync-library` no longer holds the row, and `/read?story=<its code>` shows "We couldn't find
      that tape".
- [ ] Below "YOUR TAPES", a row "THE HOUSE TAPE" (mono label) keeps the shipped doors unchanged: the demo
      (`.pl-choice-1`, "Play the demo tape, The Brave Little Star", its TapeLabel) and "Open a tape from this device"
      (`.pl-choice-2`), with the single `input[type="file"]`. With an empty library the page has exactly three
      `.pl-choice` elements.
- [ ] Layout: at ≥ 1024 px the chooser is a two-column room (shelves left ≈ 60 %, a right column reserved for T22a's
      panel; until T22a the left column spans the full width); below 1024 px one column. The shelf scrolls horizontally
      inside itself when it overflows (the scroller is named "Your tapes shelf" and keyboard reachable); the document
      never scrolls sideways at 320, 375, 390, 768, 1024, 1140 and 1440 px.
- [ ] `?story=`, `?demo=1`, the file door and the missing state behave exactly as today; closing the Player returns to
      the chooser with the shelf re-read.
- [ ] Nothing is fetched for the shelf except, when signed in, the user's own cloud library; nothing is counted.

## Seams and files
Seam 1 (E2E, primary): `/read` with seeded library rows (M2's `seedReaderTapes` + `libraryRow`, T00's
`loadTape("twinkle")`), desktop + mobile, plus 1140×712. Seam 2 (Node): the pure shelf model (merge, order, label facts,
draft ownership). The cloud branch is covered by the pure merge only (CI has no Supabase; M4-PRD OQ 3).
The Read Room reads the shelf after mount (SSR-safe: the first paint is the shipped chooser without tapes), keeps the
selection in state, and passes the chosen manifest to the Player as it does for the demo. Kit `Shelf`/`ShelfTape` are
built here per T05b's allocation (brief `design_system` LOCAL piece 8) with a `stamp` slot and a `pulling` state for
later tickets.

## Files (ownership)
- `src/components/player/shelf.ts` — **new** (pure: merge device + cloud rows, order, label facts, inset URL,
  `draftBelongsTo(draft, id)`; relative imports only).
- `src/components/studio-kit/Shelf.tsx` — **new** (`Shelf` ledge + `ShelfTape` face: selected, pulling, blank,
  stamp slot).
- `src/components/studio-kit/shelf.css` — **new**, owned by T20a (ledge, faces, lift, pull-out keyframes,
  reduced-motion state).
- `src/components/player/ReadRoom.tsx` — modify (chooser → shelf room; band; delete; house row).
- `src/components/player/read-room.css` — **new**, owned by T20a (two-column room, band, house row; `player.css` is
  not edited).
- `src/lib/cloud-storage.ts` — not modified (uses `getBooks`, `deleteBook`, `isCloudEnabled`); `src/lib/supabase.ts`
  `getUser` is imported, not changed.
- `tests/fixtures/shelf-seed.ts` — **new** (`seedShelf(page, { library, draft? })`: writes `ssync-library` and an
  optional Studio draft **once per browser context** — an init script guarded by a marker key — so a delete stays deleted
  across later navigations; T20b/T21 extend it).
- `tests/vision-shelf.spec.ts` — **new** (E2E + Node block for `shelf.ts`).
- `docs/vision/evidence/T20a-1140.png`, `T20a-375.png`, `T20a-pullout-1140.png` — **new**.

## Existing tests that may change
- None. Constraints this ticket builds around (must keep passing unchanged):
  `tests/critic-player.spec.ts:627` (`.pl-choice` count 3 after closing the demo with an empty library),
  `tests/wp-player.spec.ts:728` / `tests/critic-player.spec.ts:619` (no `.pl-choice` on `?demo=1`),
  `tests/critic-melody.spec.ts:464` and `tests/studio-experience.spec.ts:25` (`/Play the demo tape/i` opens the cover),
  `tests/critic-landing.spec.ts:441` (exactly one `input[type="file"]` on `/read`, gone once a tape opens),
  `tests/critic-studio.spec.ts:330` / `tests/wp-studio.spec.ts:323` ("We couldn't find that tape" after delete),
  `tests/fable-pass.spec.ts` (`/Make your own/` button), T05b's `tests/vision-tape-stock.spec.ts` test 1 (the first
  `[data-sk="tape"]` on `/read` is still the demo's TapeLabel — shelf faces are `data-sk="shelf-tape"`), T00's
  `openTapeInReadRoom` (`input[type="file"][accept*=".storysync"]`).

## Tests (written first)
`tests/vision-shelf.spec.ts`:
1. Node: `shelf.ts` merges device rows `[a (created 2026-10-19), b (2026-10-21)]` and cloud rows
   `[b (2026-10-21), c (2026-10-20)]` → ids `[b, c, a]` (`createdAt` desc, `b` once, the cloud copy of `b` wins); label facts for Twinkle: title, meta "Mia, age 4 — with Mom · ~<runtime from tape-meta>" (uppercase by CSS),
   inset = page 1's data URL; a tape with no picture → no inset; `draftBelongsTo` true for `published.id` and for an id
   in `publishedIds`, false otherwise.
2. E2E (desktop + mobile): seed Twinkle + a synthetic picture-less tape → two `[data-sk="shelf-tape"]` then the blank
   `.pl-choice-3`; the note text verbatim; the first tape is `aria-checked="true"` and its computed transform has a
   −10 px translateY; ArrowRight moves `aria-checked` to the second; reduced motion → `transition-duration` 0 s on the
   selected face.
3. E2E: empty library → `.pl-choice` count 3, `/Play the demo tape/i` opens the cover.
4. E2E: band → "Play this tape" → cover gate shows the tape's title; Close → back on the shelf.
5. E2E: `seedShelf` with Twinkle and a Studio draft whose `published.id` is Twinkle's row id → select Twinkle → "Pull the tape out" →
   "Tap again to delete everything" → status line verbatim; `ssync-library` lacks the row; `ssync-studio-draft` is gone;
   `/read?story=<code>` shows "We couldn't find that tape". Same with a draft for another story → the draft survives.
6. E2E: Escape after arming → label back to "Pull the tape out", nothing deleted.
7. E2E: no horizontal page overflow at the listed widths with five seeded tapes; the shelf scroller has
   `overflow-x: auto`, a name and is focusable.
8. E2E reduced motion: pull-out removes the face at once (no `animationName` other than "none" on it).
Red first: no shelf, no band, no delete on `/read`.

## Fidelity check
Viewport **1140×712** — state: Twinkle + two synthetic tapes seeded, Twinkle selected. Compare with s07
(`renders/s07.png` laptop screen x98–1238, y58–770, 1:1; shelf row A ≈ x120–760, y145–375): kicker + h1, YOUR TAPES label
+ note, faces on the ledge, lift + glow, blank tape. Save `docs/vision/evidence/T20a-1140.png`. Mid-pull-out (pause
with `page.clock`) → `T20a-pullout-1140.png` (compare with the Bath Time Song face and toast ≈ x450–725, y150–400). Also
**375×812** → `T20a-375.png`. Deviations to record: no search field, avatar or "Keep tapes on this laptop" (Idea); no
"MADE IN" in the meta (M2-PRD OQ 3); the house tape is a door in its own row, not a face on the shelf; the toast is a
status line under the shelf rather than a floating glass bubble.
