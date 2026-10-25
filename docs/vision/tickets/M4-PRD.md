# M4 · Answer back + shelf (s06, s07) — PRD

Milestone: M4 · Tickets: **T18, T19, T20a, T20b, T21, T22a, T22b** (HANDOFF §9 ids kept; T20 and T22 are split in
two because each carries a data model plus a new kit piece plus a route change, more than one fresh context window holds).
Reference screens served:
- **s06 · Grandma answers back** (two iPhones 390×844, brief `screens[5]`, editorial status "Next"): the end card's
  "Send a thank-you back" button and line (phone 1), the Creator's "Reply to · <title>" chip and the READ THIS card
  (phone 2).
- **s07 · Our shelf** (laptop 1140×712, brief `screens[6]`, editorial status "Next"): the shelf of your tapes, the NEW
  stamp, Sent to you, the pull-out delete, resume, and the "Read it in…" panel.
Contract: `docs/vision/HANDOFF.md` §4 (s06, s07), §5 (`signature.replyTo`), §9 M4. Where this PRD and `CLAUDE.md` /
`PRIVACY.md` / `docs/format-spec.md` disagree, those win.

---

## Problem Statement

The Reader delivers a tape and then lets go of it. When Grandma reaches the end of Mia's tape on her phone, the end card
offers "Read it again" and "Make your own story", but nothing that answers Mia: making a story means starting a blank one
with no idea it is a reply, and nothing in the file she sends back says what it answers. When she records her page, her
own words disappear under the recording controls, so she has to remember them.

Back home, Jess opens `/read` and gets three doors, every time: the demo, a file, a blank tape. The tapes the family
already made on this device, or in the cloud library when she is signed in, are nowhere on that screen, and the tape
Grandma sent by link last night is gone the moment it was played. Nothing says which tape is new. A tape abandoned at
page 5 starts again at page 1. Deleting a tape is only possible from inside the Creator, straight after publishing it.
And the wedge, "make any storybook read itself in the voice and mood you choose", has no door from the Reader: T15 (M3)
teaches the Creator to open a tape, but nothing on the shelf says "read this one in Mom's voice, make it Hush".

## Solution

Seven vertical slices, in dependency order:

1. **T18 — Send a thank-you back.** On the end card of any tape except the house tape, a gold "Send a thank-you back"
   button with the line "Record one page in your voice. It goes back to <name> as its own little tape." opens the Creator
   on a one-page reply titled "Thank you, <name>", with a violet "Reply to · <title>" chip. The reply's manifest carries
   `signature.replyTo` (the link of the tape it answers), added to the spec, the schema, the manifest type and the
   round-trip test first. "Make your own story" steps down to the gold outline the reference draws. The grown-up records
   her own voice and consents for it with T14's "Mine — I'm the grown-up speaking".
2. **T19 — READ THIS.** While a take is recording, the Voice card shows the page's own words on a paper card, large,
   labelled "READ THIS", with no highlighting (words never light during a take). It sits above the Stop button, so on a
   phone it lands between the Stage and the button, as in the reference, and the Stage stays exactly what the Player shows.
3. **T20a — The shelf.** The Read Room's first row becomes "YOUR TAPES": every tape kept on this device (and, when a
   grown-up is signed in, the cloud library) as a cassette standing on a ledge, the blank "Make your own" tape last.
   Selecting a tape lifts it 10 px over a gold glow and shows a band with "Play this tape" and "Pull the tape out".
   Pulling a tape out deletes every copy and the link (the shipped `deleteBook` path, plus the Studio draft when it is that
   tape), drawn as the tape tilting up out of its slot with its ribbon spilling, then the line "Pulled out. Pictures,
   voices, the saved copy and the link are gone." The house tape and "Open a tape from this device" keep their shipped
   doors in their own row.
4. **T20b — Sent to you + NEW.** A tape opened from somebody else's link stays on this device's shelf as a reference (its
   link code and label facts only, never its pictures, words or voices), marked "SENT TO YOU". Tapes that arrived since
   the previous visit to the shelf carry a tape-red "NEW" stamp. "Take it off this shelf" forgets the reference; only the
   maker can delete the tape.
5. **T21 — Resume.** The Reader remembers, on this device only, the page each tape was left on. The shelf band says "You
   stopped at page N." with "Pick up where you left off" and "Start again"; a tape opened from a link shows the same line
   and a "Pick up where you left off" button on its cover gate. Finishing a tape, pulling it out or taking it off the
   shelf forgets the place.
6. **T22a — Read it in… (the feeling).** A panel beside the shelf, for the selected tape (or the house tape): the tape's
   page as a header, "Read it in…", "A computer read you this one. Now read it in yours.", "WHAT SHOULD IT FEEL LIKE?" with
   the eight moods as tape chips (names and blurbs verbatim from the shared mood module), and "Make our own copy", which
   goes to T15's `/studio?open=<house | code | id>&mood=<Mood>`. T15's re-voice rules do the rest (no source voices, no
   source signature, `remixOf`, the reader as narrator).
7. **T22b — Read it in… (whose voice).** "WHOSE VOICE?" adds a row of blank voice cassettes: "Browser voice" ("READING
   NOW" when that is how the tape is read today), up to four voices this device already knows (narrators and consent names
   on the shelf), and "Someone new". The chosen name rides as `&voice=<name>` into the Creator, which prefills T15's
   "read by" byline with it, so T03 names the narrator and T04b asks consent for that voice by name.

## User Stories

1. As a grandparent at the end of a grandchild's tape, I want a "Send a thank-you back" button, so that answering is one tap and not a blank studio.
2. As a grandparent, I want the button's line to tell me what will happen ("Record one page in your voice. It goes back to Mia as its own little tape."), so that I know it is one page and that it goes back to her.
3. As a grandparent in the Creator, I want a "Reply to · Twinkle Came to My Window" chip, so that I can see this page answers Mia's tape.
4. As a grandparent, I want the reply to start as one page with a title I can change, so that I only have to take a photo, type my words and read them.
5. As a grandparent with an unfinished story in the Creator, I want to be asked before the reply replaces it, so that I never lose work by accident.
6. As a parent receiving a reply, I want the file to say which tape it answers, so that the answer survives outside this app.
7. As a developer writing my own player, I want `signature.replyTo` in the spec and schema, so that I can show "a reply to…" in my reader.
8. As a listener of the house tape, I want no "Send a thank-you back" offered, so that I am not invited to answer a company.
9. As a grown-up recording a page, I want my words printed large above the Stop button while I record, so that I can read them without scrolling.
10. As a grown-up recording, I want the words not to light up, so that the app never pretends to follow my voice.
11. As a parent opening `/read`, I want the tapes we made on this device standing on a shelf, so that I can pick one without hunting for a link.
12. As a signed-in parent, I want my cloud library on the same shelf, so that a tape made on the tablet shows up on the laptop.
13. As a child, I want the tape I pick to lift up off the shelf, so that I can see which one I chose.
14. As a parent, I want to pull a tape out to delete it, with a second tap to confirm, so that one tap can never erase a story by accident.
15. As a parent, I want pulling a tape out to remove every copy, the link, my place in it and the draft it came from, so that "delete" means all of it.
16. As a parent, I want to be told in plain words what was removed, so that I trust the delete.
17. As a parent who opened a link from Grandma, I want her tape to stay on my shelf marked "SENT TO YOU", so that I can play it again tomorrow without finding the message.
18. As a parent, I want only the link kept for a tape sent to me, not its pictures or voices, so that when Grandma deletes it, it is really gone everywhere.
19. As a parent, I want a "NEW" stamp on a tape that arrived since I last looked at the shelf, so that I notice Grandma's reply at breakfast.
20. As a parent, I want to take a sent tape off my shelf, so that my shelf holds only what I want, knowing only its maker can delete the tape itself.
21. As a child who stopped at page 5, I want the shelf to say "You stopped at page 5." and offer "Pick up where you left off", so that the story carries on where we left it.
22. As a grandparent reopening a link, I want the cover to offer "Pick up where you left off", so that I do not have to skip through the pages.
23. As a parent, I want "Start again" too, so that bedtime can start from the beginning.
24. As a parent, I want the place I stopped kept on this device only, so that nobody learns what we read.
25. As a parent, I want to take the house tape (or any tape on my shelf) and choose what it should feel like, so that the same story can be Hush at bedtime.
26. As a parent, I want "Make our own copy" to open the tape in the Creator with that feeling already chosen, so that I only have to record.
27. As a parent, I want to pick whose voice will read the copy from the voices this device already knows, or type a new one, so that the copy is credited to the right reader.
28. As a parent, I want the gate to ask consent for that voice and the cover to say "VOICE: <that name>", so that the copy tells the truth about who is reading.
29. As a keyboard user, I want every shelf tape, mood chip and voice cassette reachable with Tab and arrows and named for a screen reader, so that the shelf is usable without a mouse.
30. As a viewer with reduced motion, I want the lift, the pull-out and the reels to change without moving, so that the shelf stays still.
31. As a parent on a 375 px phone, I want the shelf to scroll inside itself and the page never to scroll sideways, so that the Read Room stays usable.

## Implementation Decisions

Modules (pure modules use relative imports only, so Node-side tests import them directly, as M2/M3 do):

- **Signature: `replyTo` (protocol; T18).** An optional string on the Signature layer: the share URL (or id) of the tape
  this one answers. Distinct from `remixOf`: a reply is a new tape, not a derivative of the one it answers. Spec §7 and
  the v2 schema gain the field (description only, additive; v2.0 readers ignore it); the manifest type gains it; the
  round-trip test proves it survives pack/unpack. The value is the answered tape's own `signature.shareUrl`, else the link
  it was opened from; with neither, nothing is written (the chip still shows).
- **Reply seed and hand-off (T18).** A pure helper builds the seed from the answered tape: the name to thank (T03's
  narrator, else the lead name of the byline, else none), the default title ("Thank you, <name>" / "Thank you"), the chip
  title, and the `replyTo` value. The seed is a handful of strings, so it travels as a one-shot `sessionStorage` entry read
  and removed by the Creator on `/studio?reply=1` (no network, no story data, nothing in browser history beyond the flag).
  This is a sibling of T15's `?open=` entry, sharing T15's after-mount query handling, URL clean-up and its replace
  dialog (`OpenTapeDialog`, named "Reply to <title>?"). The chip title is draft-only Studio state, never in the manifest.
- **End card (T18).** T12's end-card component gains an optional reply action rendered as the reference's gold `--lg`
  button with its line; the Read Room passes it for every origin except the house tape.
- **Voice card (T19).** The Voice card receives the active page's words and, while recording, renders a READ THIS paper
  card above the Stop button, inside T13a's docked column / floating card / bottom sheet. The Stage is not changed.
- **Shelf model (new, pure; T20a).** Merges this device's library and, when signed in, the cloud library into ordered
  shelf entries (dedupe by id, newest first) with label facts: title, author, runtime label (T01's tape-meta helper),
  first picture for the 32 px inset, share URL, share code. Also answers "does the Studio draft belong to this tape?"
  (the draft's published id or published ids) so a pull-out removes that draft too.
- **Kit `Shelf` + `ShelfTape` (T20a builds; T05b allocation, brief `design_system` LOCAL piece 8).** An 8 px shell ledge
  with a 1 px top highlight and a soft shadow; 150×110 tape faces (paper label with stripe and band, a small reel window,
  mono meta); `selected` lifts 10 px over a gold glow; `pulling` tilts 8°, raises 30 px and spills a tape-brown loop drawn
  with the kit `TapeRibbon` (in use since T13b); a `stamp` slot (used by T20b for NEW); `variant="blank"` for "Make your
  own". The pull-out icon is the kit `PullTapeIcon` (in use since T16).
- **Read Room (T20a–T22b).** The chooser state becomes a two-column room at ≥ 1024 px (shelves left, the "Read it in…"
  panel right, added by T22a) and a single stacked column below. The shipped doors keep their classes and names
  (`.pl-choice-1..3`, "Play the demo tape, The Brave Little Star", "Open a .storysync file from this device", "Make your
  own story in the studio"), the single file input stays, and `?story=` / `?demo=1` / file flows are unchanged. Shelf
  tapes are a radio group ("Your tapes"); selecting is not opening; the band's gold button opens. T15's shared
  tape-source module (manifest reader, device lookup, `loadTapeByCode`) is the only resolver used.
- **Sent to you (new, pure; T20b).** A device-local list (one localStorage key, versioned envelope, capped) of link
  references: share code, title, author, narrator, page count, runtime label, added-at. Remember / forget / sanitize
  functions; a "previous shelf visit" timestamp read once per visit decides NEW (a sent tape added after the previous
  visit). A tape counts as yours, and is never remembered as sent, when its id or code is in this device's library or the
  signed-in cloud library. No pictures, words or voices are ever stored for a sent tape.
- **Resume (new, pure; T21).** A device-local map from a tape key (the share code from `signature.shareUrl` or the opened
  link, else created-time + title) to `{ page, of, at }`, capped and least-recently-used. A page is recorded from page 2
  on; the end card clears it; a stale entry (page count changed) is ignored. The Player gains an explicit start page and
  a page-change callback; the cover gate offers "Pick up where you left off" when a place exists and the shelf did not
  already choose the start page.
- **Read it in… (T22a/b).** A panel component in the player folder. Kit `MoodTapeChip` (brief LOCAL piece 5; built by
  T22a, since T13b's mood lane is a coloured strip, not chips) and kit `VoiceCassette` (LOCAL piece 6; built by T22b;
  the locked "MADE VOICE · PHASE 3" state is not built). "Make our own copy" navigates to T15's entry:
  `/studio?open=house&mood=<Mood>` for the house tape, `/studio?open=<share code or library id>&mood=<Mood>` for a shelf
  tape. T15's re-voice rules strip the source's voices, voice names, music and signature, keep the original author, write
  `remixOf`, and set the story mood from `&mood=`. Nothing is fetched by the panel itself.
- **Voice name (T22b).** `&voice=<name>` (read and cleaned by the same after-mount effect as T15's `?open=`/`?mood=`)
  becomes a draft-only `voiceName`: the Voice card's subtitle says "Reading as <name>", and the gate's "read by" byline
  (T15) is prefilled with it, so T03's narrator rule and T04b's per-voice consent name that voice with no change to
  either module.
- No new runtime dependencies; no server actions or API routes; nothing is fetched except the tape being opened (cloud by
  link, or the house tape's JSON); no counters, no listening history beyond the single resume page.

## Testing Decisions

- **E2E seam** on `/read` and `/studio` (desktop 1280×720 and mobile 375×812 projects, plus explicit reference viewports
  390×844 and 1140×712). Prior art: `seedLibrary` + `/read?story=<id>` and the end-card walk in `tests/wp-player.spec.ts`;
  T00's `seedStudioDraft` / `restoreDraft` / `seedDeviceLibrary` / `openTapeInReadRoom`; T15's
  `tests/fixtures/mic.ts` `stubMicrophone`; library read-back after publish (`readLibrary` in `tests/wp-studio.spec.ts`);
  reduced motion via `emulateMedia` and `animationName` (`tests/wp-landing.spec.ts`); the pinned clock (`page.clock`) for
  NEW and resume times.
- **Node-side seam** (prior art `tests/storysync-roundtrip.spec.ts`) for the pure rules: the reply seed, the shelf merge
  and draft ownership, the Sent-to-you list (remember / forget / cap / sanitize / own-or-sent / NEW), the resume store
  (record / clear / stale / cap / key), known voices, and `replyTo` round-tripping through the container.
- **What is tested is behaviour:** the words a listener reads, the manifest a publish writes (read back from the device
  library), what is in localStorage after an action and what is gone after a delete, the URL the app lands on, focus
  order, computed styles that carry the register (paper, ink border, lift transform), and overflow at 375 px.
- **Fixtures:** T00's Twinkle and Goodnight, Mia; M2's `tests/fixtures/reader-tapes.ts` (`libraryRow`, `seedReaderTapes`)
  for synthetic shelf rows; a new `tests/fixtures/shelf-seed.ts` (created by T20a, extended by T20b and T21) for the
  Sent-to-you list, the shelf-visit time, resume entries and a Studio draft tied to a library id. Rivera content stays
  under `tests/fixtures/` (T00's guard test).
- **Known untestable path, said out loud:** CI builds without Supabase, so the cloud half of the shelf (signed-in library)
  and a link resolved from the cloud for Sent to you cannot be driven end to end. Their pure decisions are covered
  Node-side; the integration is a manual check on a Supabase-configured preview (Open Question 3).
- **Never weaken an existing assertion.** Each ticket lists the existing tests that constrain it (notably `.pl-choice`
  count 3, the unique file input, "Play the demo tape", the unique "Stop —" button, T13a's room-fit check) and builds
  around them.

## Out of Scope

Quoted from HANDOFF §4:
- s06 **I:** ""Keep it on this phone" (offline tapes). Do not build." — no offline copy; Sent to you stores a link, not
  a tape.
- s07 **I:** "search, genre pills, "Keep tapes on this laptop", the curated catalog beyond the Star, Premium badges. Do
  not build." — no search field, no genres, no FEATURED catalog band, no SEALED ORIGINALS row, no "COMING TO THE SHELF"
  stamps, no Premium marks, no avatar/name chip in the header.
- s07 **P3:** "made voices." — the locked "MADE VOICE · PHASE 3" cassette is left out entirely (not drawn inert).
- s06/s07 items owned by other milestones: the J-card (T12), adult self-consent in the gate (T14), the Creator opening a
  tape and the re-voice rules (T15), the missing-tape state (shipped).
- The spec figures on the stages (the mini gate, the missing-tape figure) are annotation, not UI.
- Anything listening-history-shaped: the reference render's "On Sunday you heard all 8 pages." is not built; the shelf
  prints only the page you stopped at (HANDOFF §7: no "plays", "listens", minutes or scores).

## Open Questions (for Jon)

1. **`shared_links.views` (and `storybooks.view_count`).** `supabase/migrations/001_initial_schema.sql` defines
   `views INTEGER DEFAULT 0` on `shared_links` and `view_count INTEGER DEFAULT 0` on `storybooks`. Confirmed with grep:
   nothing in `src/` increments either; the only reader is the unused `getPublicStorybooks` select in
   `src/lib/supabase.ts`, which T02 deletes. M4 adds no counter and reads neither (the shelf, NEW and resume are all
   device-local). Dropping the columns is a production migration only you can approve and apply (same as M0-PRD OQ 3,
   M2-PRD OQ 4, M3-PRD OQ 1).
2. **Sent to you keeps a link, not a tape.** To keep "delete removes every copy" true, a sent tape is remembered as its
   share code plus label facts (title, maker, narrator, page count, runtime) and nothing else, so its shelf face has no
   picture inset (the reference shows one). Keep it that way, or allow a small cached thumbnail (a copy the maker's delete
   could not reach)?
3. **Cloud on the preview.** The signed-in shelf and "Sent to you from a cloud link" can only be exercised with Supabase
   configured. Is the Vercel preview configured with Supabase, so the builder (and Claude's review) can walk them by hand?
4. **NEW means "received".** The plan stamps NEW only on tapes sent to you, added since your previous visit to the shelf,
   and clears it on the next visit. Your own new tapes are not stamped. Right?
5. **Reply wording.** The reference line is "It goes back to Mia as her own little tape." The app cannot know pronouns,
   so it prints "It goes back to Mia as its own little tape." (the page goes back as its own tape). OK?
6. **Reply on the house tape.** The plan hides "Send a thank-you back" on the house tape (no family to answer). Show it
   everywhere instead?
7. **Voices this device knows.** The voice row lists narrators and consent names already on this device's shelf,
   including a sent tape's narrator (e.g. "Grandma Rose"). Is listing a name learned from someone else's tape acceptable,
   or only names from your own tapes?
8. **Shelf tapes without a share code.** "Make our own copy" for a shelf tape uses T15's `?open=<code>`, which also
   matches a device-library id. A signed-in cloud tape that was never given a link has neither on another device, so it
   cannot be copied from there. Acceptable (every publish mints a link today), or should the shelf hide "Read it in…" for
   such a tape?

## Notes

- **File order (strict, one editor at a time):**
  - `src/components/player/ReadRoom.tsx`: T15 (M3, moves the resolver out) → T18 → T20a → T20b → T21 → T22a → T22b.
  - `src/components/player/Player.tsx`: M2's chain (T03 → T10 → T11 → T08 → T09a → T09b → T12) → T18 → T21.
  - `src/components/player/EndCard.tsx` (T12's file): T12 → T18.
  - `src/components/studio/Studio.tsx`: M3's chain (T04b → T15 → T13a → T13b → T14 → T16 → T17) → T18 → T19 → T22b →
    T24a (M5).
  - `src/components/studio/ToolPanels.tsx`: T13a → T19 → T22b → T24a (M5).
  - `src/components/studio/types.ts`: T15, T17 → T18 → T22b → T24a (M5). `draft.ts`: T18 → T22b → T24a.
  - `src/components/studio/OpenTapeDialog.tsx` (T15's file): T15 → T18 (optional labels only).
  - `PRIVACY.md` "What is stored where": T20b then T21 append rows (shared, append-only).
  - `agent_docs/decisions.md`: append-only.
  Each ticket lists these predecessors as file-order blockers on top of the HANDOFF §9 blockers.
- **Alignment with M3.** M3's notes assumed the READ THIS card would live on the Stage ("T19 edits the Stage after
  T13a"). M4 puts it in the Voice card instead, above Stop: on a phone T13a keeps the Voice card as a bottom sheet over the
  lower Stage, so a card on the Stage would be hidden mid-take, and keeping it off the Stage keeps "Stage = Player"
  literal. T13a's "Blocks: T19" still holds (file order on `ToolPanels.tsx` and `Studio.tsx`), and T19 must keep T13a's
  room-fit assertion green at 1180×820 with the card showing.
- **Kit builders.** M0's T05b allocates `TapeRibbon` to T13 and `PrintSlot`/`PullTapeIcon` to T16; M3's tickets cite
  them as built by "T05c" / "T05d". M4 depends on the consumers (T13b, T16), which guarantees the pieces exist whichever
  ticket builds them; the orchestrator should reconcile the M0/M3 naming before the build starts.
- **One spectacle stays the landing's.** The shelf's lift and pull-out are 300–420 ms ease-out state changes on one
  object, triggered by the user, interruptible, with a still reduced-motion state; only the "READING NOW" voice cassette's
  reels turn, and not under reduced motion.
- **Status chips.** Everything M4 builds is Next in the reel and built here, so no status chip is rendered for it (brief
  LOCAL 15: shipped = no chip). The reference's "Next" / "Sent to you · Next" chips are not drawn.
- **Reference copy kept verbatim:** "Send a thank-you back", "Read it again", "Make your own story", "Reply to · <title>",
  "READ THIS", "STORYSYNC READER", "Pick a tape.", "YOUR TAPES", "Unlisted. Only people you send a link to can open them.",
  "NEW", "Sent to you" (as "SENT TO YOU"), "Pulled out. Pictures, voices, the saved copy and the link are gone.", "Make
  your own", "BLANK TAPE · YOUR VOICE · YOUR PICTURES", "You stopped at page N.", "Pick up where you left off", "Start
  again", "Read it in…", "A computer read you this one. Now read it in yours.", "WHOSE VOICE?", "Browser voice", "READING
  NOW", "WHAT SHOULD IT FEEL LIKE?", the eight mood names with their blurbs, "Make our own copy".
- **Deliberate deviations to record in REPORT.md:** "its own little tape" (OQ 5); shelf meta prints `~m:ss` from the
  shared runtime helper and no "MADE IN" (M2-PRD OQ 3); no picture on sent tapes (OQ 2); the Read-it-in header uses the
  tape's resume or first pictured page with no words over the art (calm zones are unknowable for arbitrary tapes); the house
  tape stays a door in its own row rather than a shelf face (shipped tests pin it as a direct open); the pull-out toast is a
  status line, not a floating bubble.
- **Reference crops:** s06 phone 1 `renders/s06.png` ≈ x416–775, y162–938 (scale .92); s06 phone 2 ≈ x841–1200, y162–938
  (scale .92); s07 laptop screen x98–1238, y58–770 (1140×712, 1:1): shelf row A ≈ x120–760, y145–375, band area ≈
  x120–760, y470–600, "Read it in…" panel ≈ x775–1213, y150–752.
