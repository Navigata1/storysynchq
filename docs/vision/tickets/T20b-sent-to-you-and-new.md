# T20b · Sent to you (device-local link references) + the NEW stamp
Milestone: M4 · Reference: s07 (brief screens[6]) · Status in reel: Next
Type: AFK (agent can finish alone)
Blocked by: T20a (the shelf, `ShelfTape` stamp slot, `shelf-seed.ts`; file order on `ReadRoom.tsx`), T00 (Goodnight, Mia fixture), T02 (128-bit codes; old 16-hex codes still valid)   ·   Blocks: T21 (file order on `ReadRoom.tsx`, `PRIVACY.md`), T22b (voice names include sent narrators), T25
Split from T20. T20a = your own tapes, selection, band, pull-out. T20b = tapes sent to you + NEW.

## Why
s07 row A, first tape: "(a) Grandma's reply — paper label …, mono 9.5px meta, a tape-red .ss-stamp 'NEW' rotated
-6deg at its top-right", meta "FROM GRANDMA ROSE · 1 PAGE · 0:08", and under the ledge "Sent to you". The callout:
"SENT TO YOU — A tape opened from a link could stay on the shelf, on this device. Today it plays and is gone". HANDOFF
§4 s07 N: "a 'NEW' stamp on tapes received since the last visit; Sent to you (tapes opened from a link stay on this
device's shelf)". s06 how_it_connects: "Tuesday at breakfast it is on the family shelf, stamped NEW". The privacy line
on the same screen sets the bar: "A family's tapes are reachable only by their link — never listed, searched or
counted", and delete must keep meaning every copy, so what stays on a recipient's shelf is the link, not the tape.

## Done when (acceptance, each testable)
- [ ] A pure Sent-to-you module owns one localStorage key `ssync-sent-to-you` holding `{ v: 1, tapes: SentTape[] }`
      where `SentTape = { code, title, author, narrator?, pages, runtime, addedAt }` and nothing else (no pictures,
      words, voices, URLs other than the code). It exports: `rememberSent(list, entry, now)` (dedupe by code; an existing
      code keeps its `addedAt` and refreshes its label facts; capped at 30, dropping the oldest), `forgetSent(list, code)`,
      `sanitizeSent(raw)` (drops malformed entries, unknown fields and anything that is not 16–64 lowercase hex for
      `code`), `isOwnTape({ id, code }, ownIds, ownCodes)`, and `isNewSince(tape, previousVisit)` (`addedAt` strictly
      after `previousVisit`; no previous visit → not NEW).
- [ ] When `/read?story=<code>` resolves (cloud or device) to a tape that is not this device's own (its id or code is
      not in the device library and, when signed in, not in the user's cloud library), the Read Room remembers it with
      `rememberSent` before the cover shows. A device-library hit is never remembered (it is yours).
- [ ] The shelf shows remembered tapes before your own, NEW ones first, then newest `addedAt` first. Each is a
      `ShelfTape` with `data-sent="true"`, no picture inset, a mono meta **"FROM <AUTHOR> · N PAGE(S) · ~m:ss"**
      (uppercase; "PAGE" when N is 1; the "FROM …" part omitted when the author is empty), and under it on the ledge a
      mono label **"SENT TO YOU"**.
- [ ] **NEW.** On mount the Read Room reads `ssync-shelf-visit` (ISO time) as the previous visit, then writes the
      current time. A sent tape with `addedAt` after the previous visit carries a tape-red stamp **"NEW"**
      (`data-stamp="new"`; 2 px tape-red border and ink, mono 600, rotated −6°, at the face's top-right) and ", new" at the
      end of its accessible name. The stamp stays for the whole visit and is gone on the next visit.
- [ ] Selecting a sent tape: the band's **"Play this tape"** navigates to `/read?story=<code>` (the tape is resolved
      by its link, never from a stored copy); the delete control is replaced by a ghost **"Take it off this shelf"**,
      which forgets the reference at once (no second tap) and shows the status line
      **"Taken off this shelf. Only the person who made it can delete the tape itself."**
- [ ] When `/read?story=<code>` resolves to nothing for a remembered code, the shipped missing state shows, plus a ghost
      button **"Take it off this shelf"** that forgets it and returns to the chooser.
- [ ] Your own tapes never show "SENT TO YOU" or NEW, and pulling out your own tape (T20a) is unchanged.
- [ ] `PRIVACY.md` "What is stored where" gains two rows (append-only):
      "Tapes sent to you: link code, title, maker, narrator, page count, length — never pictures, words or voices |
      this browser's localStorage | when you open someone else's link | 'Take it off this shelf', or clearing browser
      data" and "When you last looked at the shelf (one timestamp) | this browser's localStorage | each visit to /read |
      clearing browser data".
- [ ] Nothing is sent anywhere because of Sent to you or NEW; nothing is counted.

## Seams and files
Seam 1 (Node, primary for the rules): the pure module (remember / forget / cap / sanitize / own-or-sent / NEW), prior
art `tests/storysync-roundtrip.spec.ts`. Seam 2 (E2E): `/read` with `ssync-sent-to-you` and `ssync-shelf-visit` seeded
by `tests/fixtures/shelf-seed.ts` and the clock pinned with `page.clock`. The "opened from someone else's link" path
cannot be driven end to end in CI (no Supabase: every link that resolves locally is a device-library hit, i.e. yours);
it is covered by the pure `isOwnTape` decision plus a test that a device-library hit is **not** remembered, and by a
manual check on a Supabase-configured preview (M4-PRD OQ 3).

## Files (ownership)
- `src/components/player/sent-to-you.ts` — **new** (pure; relative imports only).
- `src/components/player/ReadRoom.tsx` — modify (remember on resolve; render sent tapes + NEW; band variant; missing
  state's extra button; shelf-visit timestamp).
- `src/components/studio-kit/Shelf.tsx` — modify (T20a's file: `sent` label under the ledge; NEW stamp rendering in the
  stamp slot).
- `src/components/studio-kit/shelf.css` — modify (T20a's file: NEW stamp, SENT TO YOU label).
- `PRIVACY.md` — modify (two rows; shared, append-only).
- `tests/fixtures/shelf-seed.ts` — modify (add `sent` and `previousVisit` options).
- `tests/vision-sent-to-you.spec.ts` — **new** (Node + E2E).
- `docs/vision/evidence/T20b-1140.png` — **new**.

## Existing tests that may change
- None. `tests/wp-player.spec.ts` / `tests/critic-player.spec.ts` seed `ssync-library` and open `/read?story=<id>`;
  those hits are device-library tapes, so nothing is remembered and their shelves are unchanged.

## Tests (written first)
`tests/vision-sent-to-you.spec.ts`:
1. Node: `rememberSent` dedupes by code and keeps the first `addedAt`; the 31st entry drops the oldest; `forgetSent`
   removes only that code; `sanitizeSent` drops entries with a non-hex code, a missing title, or extra fields (pictures);
   `isOwnTape` true by id or by code; `isNewSince` strictly-after semantics and false with no previous visit.
2. E2E (clock pinned): previous visit 2026-10-20T07:00Z; seed one sent tape (Goodnight, Mia label facts from the facts
   module, `addedAt` 2026-10-20T19:31Z) and Twinkle in the library → the first face has `data-sent="true"`, the
   stamp "NEW", meta "FROM GRANDMA ROSE · 1 PAGE · ~<runtime>", label "SENT TO YOU"; Twinkle has neither.
3. E2E: reload (same context) → no NEW stamp (the previous visit is now the first visit's time).
4. E2E: select the sent tape → "Play this tape" → URL is `/read?story=<code>`; in CI the code resolves to nothing (no
   cloud), so the missing state shows with "Take it off this shelf" → activating it returns to the chooser with the code
   forgotten; `ssync-sent-to-you` never gained a second entry.
5. E2E: from the shelf band, "Take it off this shelf" → status line verbatim; the key no longer holds the code; the face
   is gone.
6. E2E: a remembered code opened directly by URL that resolves to nothing → the same missing state + button.
7. E2E: `/read?story=<code>` for a device-library tape → after Close, `ssync-sent-to-you` is still empty.
Red first: the module does not exist; no SENT TO YOU, no NEW.

## Fidelity check
Viewport **1140×712** — state: previous visit yesterday, Goodnight, Mia remembered as sent today, Twinkle and one more
own tape in the library, Twinkle selected. Compare with s07 row A (`renders/s07.png` ≈ x120–440, y230–400): the NEW
stamp's tilt and placement, the "FROM …" meta, the SENT TO YOU label under the ledge. Save
`docs/vision/evidence/T20b-1140.png`. Deviations to record: no picture inset on a sent tape (M4-PRD OQ 2); "SENT TO YOU"
is a plain mono label, not a "Next" chip.
