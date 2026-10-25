# T21 · Resume: remember the last page per tape on this device; "You stopped at page N"
Milestone: M4 · Reference: s07 (brief screens[6]) · Status in reel: Next
Type: AFK (agent can finish alone)
Blocked by: T20a + T20b (shelf, band, `shelf-seed.ts`; file order on `ReadRoom.tsx` and `PRIVACY.md`), T12 + T18 (file order on `Player.tsx`), T00 (Twinkle fixture)   ·   Blocks: T22a (file order on `ReadRoom.tsx`; the Read-it-in header uses the resume page), T25

## Why
s07's band reads "You stopped at page 5." with "Pick up where you left off" and "Start again", and the realism note
says: "Next: … resume at the page you stopped (/classic had it)". A child who fell asleep at page 5 should not have to
skip through four pages the next night, and a grandparent reopening a link from her messages should land where she
left off. The place is the only listening fact the Reader may keep, and only on this device: no history, no
"heard", no counts (HANDOFF §7).

## Done when (acceptance, each testable)
- [ ] A pure resume module owns one localStorage key `ssync-resume` holding `{ v: 1, tapes: Record<key, { page, of,
      at }> }` and exports:
      `tapeKey(manifest, openedCode?)` → `code:<share code>` from `signature.shareUrl`'s `story=` value, else from
      `openedCode`, else `t:<metadata.created>|<metadata.title>`;
      `recordPage(store, key, index, total, now)` → stores 1-based `page = index + 1` only when `1 ≤ index < total`
      (page 2 onward), `of = total`;
      `clearTape(store, key)`;
      `resumePoint(store, key, total)` → `{ page }` or null (null when the stored `of` differs from `total`: the tape
      changed);
      a cap of 50 tapes, least-recently-`at` dropped first; `sanitizeResume(raw)` ignores junk.
- [ ] The Player gains an optional start page and a page callback: it reports each settled page and the end card; the
      Read Room records pages and clears the tape when the end card shows. Nothing is recorded before Tap to Begin. The
      same tape gets the same key from every door: a link passes its `?story=` code, a shelf tape passes its library
      entry's share code (or, without one, falls back to created + title), the demo and files use `tapeKey` alone.
- [ ] **Shelf band.** When the selected tape has a resume point, the band shows **"You stopped at page N."** (Fraunces
      700, 22 px) with a gold **"Pick up where you left off"** (opens the Player's cover; Tap to Begin starts at page N)
      and a ghost **"Start again"** (Tap to Begin starts at page 1). Without a resume point the band is T20a's ("Play
      this tape"). On arrival the shelf selects the tape with the most recent resume point (else T20a's default).
- [ ] **Cover gate.** When a tape is opened without a start page chosen by the shelf (a link, the demo, a file) and a
      resume point exists, the cover shows the line **"You stopped at page N."** and, under Tap to Begin, a ghost button
      **"Pick up where you left off"**; activating it is the audio-unlock gesture and starts at page N; Tap to Begin is
      unchanged (page 1). With no resume point the cover is exactly today's.
- [ ] Reaching the end card clears the place; pulling the tape out (T20a) and "Take it off this shelf" (T20b) clear it
      too.
- [ ] Keyboard: both cover buttons and both band buttons are reachable with Tab in visual order and show the kit focus
      ring; ← → still turn pages after resuming.
- [ ] `PRIVACY.md` "What is stored where" gains one row (append-only): "Where you stopped in each tape (a page number) |
      this browser's localStorage | as you read | finishing the tape, pulling it out, taking it off the shelf, or clearing
      browser data".
- [ ] Nothing about reading is stored except the page number per tape; nothing is sent; no "heard", "listened",
      weekday or count appears anywhere.

## Seams and files
Seam 1 (E2E, primary): `/read` shelf and `/read?story=<code>` with the clock pinned; prior art: the end-card walk with
ArrowRight in `tests/wp-player.spec.ts`. Seam 2 (Node): the pure resume module. The Player change is two props and the
cover's extra row; `__ssyncPlayer` is not extended.

## Files (ownership)
- `src/components/player/resume.ts` — **new** (pure; relative imports only).
- `src/components/player/Player.tsx` — modify (start page prop, page callback, cover resume row).
- `src/components/player/resume.css` — **new**, owned by T21 (cover line + ghost button spacing; `player.css` untouched).
- `src/components/player/ReadRoom.tsx` — modify (record/clear; band resume variant; default selection; clear on delete
  and on take-off).
- `PRIVACY.md` — modify (one row; shared, append-only).
- `tests/fixtures/shelf-seed.ts` — modify (add `resume` option).
- `tests/vision-resume.spec.ts` — **new** (Node + E2E).
- `docs/vision/evidence/T21-1140.png`, `T21-cover-390.png` — **new**.

## Existing tests that may change
- None. Every existing Player test runs in a fresh context with no `ssync-resume`, so its cover is today's; tests that
  turn pages and close (`tests/critic-player.spec.ts` ?demo=1 test closes on page 1) record nothing or a place that no
  later step reads. Must keep passing: every `/Tap to Begin/i` lookup (the button and its name are unchanged).

## Tests (written first)
`tests/vision-resume.spec.ts`:
1. Node: `tapeKey` for a manifest with `signature.shareUrl` `…/read?story=abc…` → `code:abc…`; with only an opened code
   → that code; with neither → `t:<created>|<title>`; `recordPage` ignores index 0 and index ≥ total; `resumePoint` null
   when `of` changed; cap 50 drops the oldest `at`; `sanitizeResume` drops non-numeric pages.
2. E2E: Twinkle in the library with a share code; open `/read?story=<code>`, Tap to Begin, ArrowRight ×2 (page 3),
   Close → `ssync-resume` holds `{ page: 3, of: 5 }` for `code:<code>`; reopen the link → the cover shows "You stopped at
   page 3." and "Pick up where you left off"; click it → the page indicator reads page 3 of 5.
3. E2E: same, but Tap to Begin → page 1.
4. E2E: on the shelf, Twinkle is selected by default (most recent place), the band shows the line and both buttons;
   "Start again" → cover → Tap to Begin → page 1; "Pick up where you left off" → page 3.
5. E2E: walk to the end card → the entry is cleared; the band shows "Play this tape".
6. E2E: pull Twinkle out → `ssync-resume` no longer holds its key.
7. E2E: the house tape (`?demo=1`) remembers a place under its `t:` key and offers it on its cover.
Red first: no resume key, no line, no button.

## Fidelity check
Viewport **1140×712** — state: Twinkle selected with a place at page 3. Compare with the s07 band area
(`renders/s07.png` ≈ x120–760, y470–600): label-yellow mono line, the Fraunces resume line, gold + ghost buttons. Save
`docs/vision/evidence/T21-1140.png`; and **390×844** cover with the resume row → `T21-cover-390.png`. Deviations to
record: no FEATURED band art (Idea catalog); the reference render's "On Sunday you heard all 8 pages." is not built
(listening history); the house tape's resume is offered on its cover, not in a catalog band.
