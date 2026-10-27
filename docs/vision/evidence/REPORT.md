# StorySync Vision build: hand-back report

For Jon. This covers the build of `docs/vision/HANDOFF.md` on branch `claude/storysync-audit-refactor-soq121` (PR #5): the 34 tickets T00–T24b, the T25 fidelity spec, and the M6 fidelity sweep. `LEDGER.md` has one row per ticket with its commits, tests, review score and screenshots. `gates.txt` has the final gate output. The per-ticket notes in `docs/vision/evidence/tickets/` hold the full detail behind every line below.

Nothing has been merged. Supabase migrations 002 and 003 have not been applied anywhere.

---

## 1. What was built

### M0 · Truth and foundations

- **T00 · Test fixtures.** Two real `.storysync` tapes, "Twinkle Came to My Window" (5 pages, 1.1 MB) and "Goodnight, Mia" (1 page, 286 KB), packed by the app's own `packStorysync`. They come with page helpers that seed drafts, the device library and the shelf. Regenerating them is byte-identical. A guard test keeps the illustrative family's names out of `src/` and `public/`.
- **T01 · Landing teaser truth.** The teaser label is now computed from the demo manifest (words ÷ 2.5 plus pauses), not typed by hand. It reads `~1:47 · READ-ALONG`. The arithmetic lives in `src/lib/storysync/tape-meta.ts`.
- **T02 · 128-bit share codes.** One minter (`src/lib/share-code.ts`) issues 32-hex CSPRNG codes and has no weak fallback. Old 64-bit codes still resolve. Migration 002 changes the column default. PRIVACY.md now describes this accurately.
- **T02b · Links cannot be listed.** Migration 003 adds a `SECURITY DEFINER` function, `storybook_by_share_code(code)`, that returns only the Reader's columns, and drops the broad public read policies. The app calls the function and, while the function is missing, falls back to an exact-match select.
- **T03 · Narrator.** Publishing writes `metadata.narrator`, the lead name of "story by". The Player shows "VOICE: <name>" on the cover and a mic with the name in the deck chip.
- **T04a · Consent dates in the protocol.** `date` is `YYYY-MM-DD`. `validateManifest` now returns warnings as well as errors. A timestamp, a non-calendar date, or a recorded voice with no consent record warns and never fails.
- **T04b · Consent per recorded voice.** The gate asks once per voice. Publishing writes one record per voice, dated with the device's local day, and refuses a tape that has an unconsented voice.
- **T05a · Foundation tokens.** The reference tokens (`--ss-*`, moods, layers, easing, type) are on `:root`. They are exposed through Tailwind and mirrored in `studio-kit/tokens.ts`, and a drift test guards the mirror.
- **T05b · Tape stock.** TapeLabel and Reel now match the reference geometry. A new kit Cassette is used in the landing hero.

### M1 · Landing (s01)

- **T06 · Hero tape.** The hero cassette's label carries the demo's title. Page 1's star sits behind the deck's play key. Under reduced motion the tape is still and already seated.
- **T07 · Bands.** Adds the "Remember the magic?" band, the "Three surfaces · one file" row, the company line ("A product of Island Development Crew LLC · Part of the SyncHQ Suite"), and the s01 top nav with a phone menu.

### M2 · Reader (s02, s05 phone, s06 end card)

- **T08 · Spread.** From 1024px landscape, a page with a picture and words renders as an art-dominant two-page spread. Phones and portrait screens keep full-bleed. Space now toggles pause, and P toggles music.
- **T09a · Deck chip.** From 768px the deck chip shows VOICE (with the narrator's name), MELODY (mood and "12 dB under the voice") and CHIME (a hold countdown).
- **T09b · Tape-pack progress.** Reading position sets the size of the tape packs on the reels (left pack big early, right pack big late) and fills a per-page tape strip.
- **T10 · Crossfades.** The Player honours `pages[].music.duration` and plays per-page moods. The rules come from one pure music plan.
- **T11 · Author defaults.** `settings.accessibility` sets the tape's defaults. A viewer's own choice still wins. Switches the author set say "Set by the storyteller".
- **T12 · J-card.** The end card prints liner notes built only from the manifest (pictures, words, voice, music, owner, consent) and links "What's inside this tape? →" to `/protocol`.

### M3 · Creator Simple and publish (s03, s04, s05)

- **T13a · Studio room.** The rail shows three tools with Magic set apart. The Stage borrows the Player's ambient light. A tape-red listening ring surrounds the photo during a take. From 768px the room fits one viewport, with a docked tool column from 1024px.
- **T13b · Tape ribbon.** The filmstrip is one scrolling tape with a per-page mood lane ("WONDER · GENTLE MUSIC ADDED FOR YOU"). A "Snap the next drawing" tile adds a page and opens the camera.
- **T14 · Gate sheet.** Beside the gate is a printed "What goes into your tape" sheet listing the seven layers for this story. Ticking consent inks a stamp on the Signature band. The trust line is added. The gate asks "Whose voice is on this tape?" and records `grantedBy: "self"` for a grown-up's own voice.
- **T15 · Open a tape.** The Creator opens a `.storysync`, a share code or the house tape to re-voice it. Pictures, words, timing and mood carry over. Voices and the signature are dropped. `signature.remixOf` credits the source.
- **T16 · Publish card.** At ≥1024px the card has two columns: the first page on the tape label, layer chips with "consent written", a size meter against 15 MB, and "Pull the tape out — delete everything".
- **T17 · Evening out each voice.** Before AAC encoding, each take is levelled on the device to −20 dBFS RMS of active speech, with a clamped gain and a soft limiter (`src/lib/audio/level.ts`). This appears as the first publish step and as a toggle in the Inspector.

### M4 · Answer back and the shelf (s06, s07)

- **T18 · Send a thank-you back.** The end card opens the Creator as a one-page reply under a "Reply to · <title>" chip, and `signature.replyTo` is recorded. The format spec and schema were updated first.
- **T19 · READ THIS.** While a page with words is being recorded, the Voice card shows those words in large type on a paper note above Stop. Nothing is highlighted, because words do not light during a take.
- **T20a · The shelf.** The Read Room is a ledge of cassettes, merging device and cloud tapes. The selected tape lifts. A two-press pull-out runs the full delete.
- **T20b · Sent to you.** A tape opened from someone else's link stays on this device's shelf as a reference only: code, title, author and pages, capped at 30. It gets a NEW stamp if it arrived since the last visit.
- **T21 · Resume.** One page number per tape is kept on this device (capped at 50). The cover and the shelf offer "You stopped at page N." Finishing the tape, Start again, and every delete path forget the place.
- **T22a · Read it in… (feeling).** Eight mood tape chips and a "Make our own copy" door that opens the Creator with the chosen mood.
- **T22b · Read it in… (whose voice).** Blank voice cassettes for the voices this device already knows. The chosen name travels to the Studio in a `#voice=` fragment and fills in the gate's "read by".

### M5 · Protocol (s08) and Advanced (s09)

- **T23a · Exploded packet.** FIG. 1 takes a real page of the house tape apart into seven printed plates. A layer the tape does not carry is labelled empty in plain words.
- **T23b · Protocol cards.** The codec rule is stated as MUST / MAY / MUST NOT. A validator console prints real `validateManifest` verdicts. A "Write your own player" fflate snippet is tested against the packed house tape. The download moved into the hero.
- **T24a · Per-page moods.** The Inspector gains "mood · page N" overrides. They are published as each page's `music` and played per page in the Creator.
- **T24b · Type a feeling.** You type your own words and `resolveMood` maps them to one of the eight moods; for example, "a quiet lullaby for bedtime" becomes Hush. You apply the result to this page or to every page. The typed words are never stored.

### M6 · Fidelity sweep and hand-back

- **T25 · Fidelity spec.** `tests/vision-fidelity.spec.ts` puts each surface into the state its reference screen shows, at that screen's viewport, with reduced-motion and 375px variants. It checks that the state was reached: key elements in view, no sideways scroll, no console errors. Then it takes the screenshot. Shots go to `docs/vision/evidence/` only under `VISION_EVIDENCE=1`, so an ordinary run never changes a tracked file.
- **T26 · This packet.**

No new runtime dependency was added. `package.json` is unchanged on this branch.

---

## 2. M6: the fidelity sweep

### Method

1. **Capture.** T25 shot every surface at its reference viewport from a production build.
2. **Critic panel.** Each screen was critiqued through two lenses: fidelity and taste, then honesty, engine, privacy and craft. A judge merged the findings per screen and scored the screen.
3. **Adversarial verification.** A separate verifier tried to refute every major and blocker finding against the running app and the code. A finding survived only if it could not be refuted. Asks to build Idea or Phase 3 items were dropped at this step.
4. **Fix groups.** The confirmed findings were split into file-disjoint groups, one per surface, so groups could not collide. Each group fixed tests-first.
5. **Independent review.** A reviewer who had not written the fix reviewed each group before commit.

There were two waves. Wave A covered landing and kit, player and end card, protocol, gate and publish, and the Studio chrome. Wave B handled what wave A deferred because the files were still busy with T22b, T24a and T24b, plus s07 and s09, which could only be critiqued once those tickets landed.

### Scores before fixes

| Screen | Score | Confirmed findings | Refuted by the verifier |
|---|---|---|---|
| s01 Landing | 8 | 9 | 3 |
| s02 Reader | 7 | 9 (1 blocker) | 2 |
| s03 Studio Simple | 6.5 | 12 | 2 |
| s04 Gate | 8.3 | 7 | 2 |
| s05 Publish + phone reader | 7 | 14 | 1 |
| s06 End card + phone Creator | 7.2 | 10 | 6 |
| s07 Read Room | 7.5 | (critiqued after T22b; count not recorded) | — |
| s08 Protocol | 7.5 | 8 | 4 |
| s09 Studio Advanced | 6.5 | 5 | — |
| s10 | not scored (nothing to build) | — | — |

That is 69 confirmed findings for s01–s06 and s08, and 5 for s09. The only blocker was on s02: keyboard focus landed on chrome that had idled out and was invisible.

### What the fixes changed

`LEDGER.md` lists each fix commit and its review score. In plain terms:

- **Landing (11bc705, dabcd93).** The door cards now peek in at the fold on laptop and phone. Press play is the reference gold pill. Footer contrast meets AA. The visible headline is the page's h1. The unmeasured "about ten minutes" claim is gone. The hero cassette gained its tape pack and smoked window.
- **Reader (9c73db6, dabcd93).**
  - Fixed the blocker: focus now wakes the chrome.
  - The read-along matches the reference: gold current word with an underline and a halo, cream spoken words.
  - Unread words meet AA on phones.
  - On phones in portrait, a full-bleed page fits the picture from the top over a mirrored, blurred foot of the same drawing.
  - The foot no longer promises "next page in 3 s" while the voice is still speaking.
  - The cover gate shows only the blurred first drawing, not the Player ghosted through it.
- **Protocol (1af9dd4, dabcd93).** The page has one "Fig. 1". The sticky bar no longer hides focus, and scroll padding follows the bar's real height. The empty-plate notes meet AA. Plate readouts fit on one line. The archive tree lists what the download actually contains.
- **Gate (39b7e97, 4afab88).**
  - A wrong answer's alert stays until the parent types again.
  - The footer meets AA, focus returns on close, and the buttons are pills.
  - A reply's gate opens with no grantor chosen and keeps its height.
  - With several voices, the "choose whose voice" prompt stays until every voice has an answer.
- **Publish (39b7e97, 4afab88).**
  - The voices step says what each take actually became. "Converting voices to AAC" is printed only when every take really became AAC.
  - With no cloud library, the card offers no QR and no share sheet, because the link only opens on this device.
  - The ready card is a real modal: the Studio behind it is inert and focus is trapped.
  - The link field keeps the share code visible, and copy and delete are announced.
  - A reply's card says "Send it back to <name>".
- **Studio (d18c975, 9040729, 4afab88, 6391953).**
  - Nothing can interrupt or leak into a take. Magic, Photo and "Add a picture" wait. Play, Listen and Space refuse while recording. A story change during a take cancels the take, and the cancellation is announced.
  - The Transport is an inset deck with a truthful readout.
  - On a phone, the bar is one row with a "More" popover, the take sheet keeps the photo whole and has one Stop, and the filmstrip's move controls fold behind a "move" key.
  - The s09 Inspector runs full height with denser rows. Music bed is a switch, and mood icons follow the mood.
- **Read Room (49aafbb).** The Read it in… panel follows s07's own geometry and fits the first screen at 1140×712. The resume band keeps its four actions on one row from 1024px.
- **Tests (dd452c6).** Test runs no longer rewrite tracked pictures. One shared helper handles every "nothing is sent" check, and it ignores Next's own route prefetches.

The full list of M6 decisions is in `agent_docs/decisions.md` under "2026-10-27 · M6".

### Still open after M6

- The screens were not re-scored by a fresh panel after wave B. The review scores in the ledger are per fix group, not per screen.
- On `/protocol` at 1140px, the Visual plate's readout is cut short with an ellipsis ("The little star among bigger, sleepy…"). The full alt text is in the DOM, but there is no `title` and no second line, so a sighted reader cannot see the rest (M6-C review note).
- The other items still open are in §6.

---

## 3. Deliberately not built, and why

All of these are marked **I** (Idea) or **P3** (Phase 3) in HANDOFF §4, and §10 says none may be built or presented as working:

- **s02:** word-to-picture hotspots ("tap a word, the picture answers"). I.
- **s03:** the listening mascot and the giant "Hear it" button. I. Words also do not light during a take, because that would need on-device alignment. The READ THIS card shows the words with no highlight.
- **s05:** the passport-stamp ribbon. It is an explanatory diagram, not UI.
- **s06:** "Keep it on this phone" (offline tapes). I.
- **s07:**
  - Idea items: search, genre pills, "Keep tapes on this laptop", the curated catalog beyond the Star (FEATURED band, sealed originals, "COMING TO THE SHELF"), and Premium badges.
  - Phase 3: made voices. There is no "MADE VOICE · PHASE 3" cassette.
- **s09:** the Tauri desktop app (window title bar), the professional multi-lane timeline, Cast (several narration tracks per page), and the sound-effects lane. All P3.
- **s10:** everything on it: StorySync for Schools, bilingual tracks, class shelf, sealed roadmap tapes and plans (P3 or I). Only one thing is checked here, that `/read` opens from a link with no account (`s10-read-from-qr-390x844.png`).
- **The violet "Next" status chips** in the references. They mark unbuilt work, and everything built here ships, so no surface shows one.

These were also not built, by decision. Each one waits on a question for you in §5:

- Fullscreen on open (M2-PRD OQ 1).
- A `metadata.credits` field (M2-PRD OQ 2).
- A making-time field (M2-PRD OQ 3).
- An 80 Hz rumble filter (M3-PRD OQ 4).
- Keeping the voices when you reopen your own tape (M3-PRD OQ 2).
- `/protocol` exploding the tape you came from (M5-PRD OQ 2).

---

## 4. Deviations from the references, with reasons

These are grouped by screen and collected from each ticket's deviations section and from the M6 decisions. Where M6 replaced an earlier deviation, the M6 state is given.

### s01 · Landing

- **Two estimators.** The teaser label has a fourth kind, `RECORDED`, for a recorded voice whose codec cannot be told from the tape; neither "AAC/M4A" nor "WAV" would be true. The teaser's estimator has no 20 s floor. The Player cover's estimator keeps its floor (T01).
- **Cassette label sizes** follow s01 rather than the bare `.ss-cassette`, and the title and meta are single-line with an ellipsis. The window covers the label's lower half (T05b).
- **Reels.** The face defaults to a faint ink tint and is paper only on tape stock. Nine existing reels sit on dark chrome, where a paper default would make white discs. Strokes scale with the reel (T05b).
- **Scroll chevron.** The separate bobbing chevron was removed. It cost about 44px and broke the fold, and s01 puts the chevron inside the scroll hint (T06).
- **Deck readout.** At rest the readout says "DECK · READY", where s01 draws the frozen mid-insert "PLAY · SIDE A". The mid-insert state does match s01. Reel motion blur and ghost trails, which are part of that frozen illustration, were not drawn (T06).
- **Narrow phones.** Below a 348px stage, the cassette is 100% − 8px and the deck reaches into the gutter (T06).
- **Shipped sections stay.** "How the magic works" and the protocol teaser still sit between the surfaces row and the footer. s01's phone column omits them (M1-PRD OQ 1, T07).
- **Doors.** The doors are larger than s01's compact phone doors, so the phone column is longer (T07). The doors section head was removed in M6 so the doors peek in at the fold, which replaces T06's deviation.
- **Phone Menu button** is 44×44 rather than 36×36, for the tap-target rule (T07).
- **Footer privacy line** keeps the shipped UI font rather than s01's 11px mono. M6 raised it to AA contrast (T07, 11bc705).
- **Nav at 640–719px** uses 1rem edges and 12px gaps; s01's spacing overflows there (T07).
- **Wide screens.** At ≥960px the band and the surfaces row sit side by side. s01 only draws the phone column (T07).
- **Press play** is a pill through an opt-in kit `shape="pill"`. The kit's 16px BigButton stays the default for the two-line doors (M6).

### s02 · Reader

- **Book geometry.** At 1120×700 the book is 950×532 at y98, not the brief's 1000×560 at y70, so it clears the expanded deck chip. The chip is 67px tall, against 81px in the reference (T08, T09a).
- **Chips are 44px tall** (reference 30) for touch (T08).
- **Keyboard hint** uses fg-3 (about 6:1) rather than the reference's color (about 4:1) (T08).
- **Prose line-height** stays at the shipped 1.58 (reference 1.5), so the easier-to-read skin keeps its 1.95 (T08).
- **CHIME and read-along.** The reference shows the CHIME row and a lit word at the same moment. The app says "after the voice" while the voice speaks and counts down only during the hold. On the last page CHIME says "last page". A bed that is not live yet shows no dB claim (T09a). The foot says "3 s after the voice" mid-voice (M6).
- **The chip stays at full opacity.** The shipped .55 dim made 11px text unreadable (T09a).
- **768–850px.** The chip's VOICE and MELODY rows are cut with an ellipsis there (T09a).
- **Pack discs are smaller.** The largest is 31px and the smallest 21px, against 38/29px in the reference. T09a trimmed the chip window from 42px to 34px to keep air above the book. On the phone pill the reels are 26px apart, not 32px (T09b).
- **Pack sizes follow the formula.** On Grandma's page 3 the right pack is slightly larger than the left. The reference draws it a little behind the formula (T09b).
- **The tape strip stays on screen** when the chrome idles out, as s05 draws it. The glow follows the filled length exactly (T09b).
- **Accessibility defaults.** An explicit `false` in `settings.accessibility` is not treated as an author default. The "Set by the storyteller" hint is added as a second line, not swapped in (T11).
- **Phone portrait-fit** uses a mirrored, blurred foot of the drawing. No phone s02 reference exists (M6).

### s03 · Studio Simple

- **Magic tile is 44px** (reference 64px), because the acceptance caps Magic at 72px including its label (T13a).
- **Shipped controls kept:**
  - "Close Voice" key;
  - Stage "VOICE" chip;
  - the "your voice · m:ss / Listen / Delete" block;
  - the kit ModeToggle switch instead of a segmented pill;
  - a 40px Finish (reference 32px).

  All of these are covered by existing tests (T13a).
- **Not built:** the credit line "words typed by Mom, as Mia said them". It is family content, and no manifest field carries it (T13a).
- **Title centring** is exact only from 1180px (T13a).
- **Short laptops keep 84×62 frames.** The 112×84 frames apply only at ≥1024px wide and ≥700px tall, so T13a's short-laptop test still holds (T13b).
- **The mood lane** is per-page segments with a solid fill, not one continuous gradient, so per-page moods can colour it (T13b).
- **The live dot** is static and sits top-right, because nothing loops in the Creator except reels (T13b).
- **The Snap tile is at 70% while recording,** because it is disabled then (T13b).
- **Move controls.** They sit in a dark housing. On phones they fold behind a 44px "move" key (T13b, M6).
- **1024–1179px.** The tape is packed tighter so the Snap tile is not covered (T13b).
- **Fixture content differs.** The Twinkle fixture has five told pages; the reference moment has three (T13b).

### s04 · Gate

- **"DEVICE" instead of "TABLET".** The app cannot know the device (T14).
- **Generic wording.** The Visual and Text bands use generic wording ("5 pictures · about 70 KB each") rather than the family's credits (T14).
- **No live ✓ on the answer.** A pre-reader could otherwise type numbers until it turns green (T14).
- **The "whose voice" group is present** (it comes from s06). On the tablet its two options sit side by side, so the pair is about 772px tall against s04's 720 (T14).
- **Voice glyph** is lucide `AudioWaveform`, not the 15-bar mini waveform. The Sound icon follows the mood (T14).
- **Changing "whose voice" clears that row's tick.** The consent sentence changed (T14).
- **Focus wraps inside the dialog** (T14).
- **Two-voice rows.** s04 draws only one voice. The extra rows reuse its sentence under a mixed-case voice label that wraps rather than truncating (T04b).
- **The gate panel scrolls inside itself** on short phones (T04b).
- **The question is random** each time; the reference shows 7 × 6 (T25 note).
- **Per-page moods.** With per-page moods the Sound band adds "· Hush on page 3". No reference draws this (T24a).

### s05 · Publish and Grandma's iPhone

- **Narrator name type.** The name is set in the UI sans, as s05's CSS sets it, not the mono the ticket asked for (T03).
- **Narrator fold on phones.** Below 768px, while the controls are up, the hairline, mic and name fold away so the pill clears the top chrome. They return when the chrome idles out (T03).
- **Fixture narration is WAV and Twinkle is 1.1 MB, not "2.0 MB of 15 MB".** Node has no AAC encoder without a new dependency, and headless Chromium has none either (T00).
- **"Evening out each voice".**
  - It is the first step and is shown as done, not the fourth step marked "planned". It happens before AAC.
  - It is labelled "Evening out each voice" rather than s09's "Voice clean-up (level, rumble)", because no rumble filter exists.
  - The maximum boost is +18 dB, not +15. With +15 the quietest fixture clip cannot reach −20 ±1 dB, and levelling is not idempotent (T17).
- **The voices step text depends on the codec** (see §2) (M6).
- **Device mode** shows no QR and no share sheet. The link opens on this device only (M6).
- **The link field drops the scheme** so the share code is never clipped (M6).

### s06 · End card and the phone Creator

- **J-card rows are derived.** PICTURES and WORDS are derived from the tape ("5 pictures", "35 words on 5 pages"). There is no MADE IN row, and VOICE shows the narrator. The manifest has no credits or making-time field, and "on an Android tablet" would be device data (T12).
- **The spine** prints the tape's title + " · SIDE A", with no family name. A long title is cut with an ellipsis; " · SIDE A" never is (T12).
- **QR heading.** Below 385px it is 10.5px and wraps on a balanced line. The QR shows the full URL with its scheme (T12, M2-PRD OQ 5).
- **Contrast is raised** above the brief's values: J-card keys at 62% ink, "PASS IT ON" in the Signature red ink, privacy line in fg-3 (T12).
- **Kept from the shipped app:** the close chip (the phone reference has none), and a laptop layout with the case beside the actions (T12).
- **Reply copy and controls.**
  - "its own little tape", not "her own little tape". The app cannot know pronouns (T18).
  - The reply title is prefilled "Thank you, Mia" (T18).
  - Buttons keep the kit's 16px radius (T18).
  - "Make your own story" carries s06's 8% gold wash (T18).
  - The "Reply to" chip is a status label, not a control (T18).
- **READ THIS lives in the Voice sheet,** not on the Stage, so the Stage stays identical to the Player.
  - In a short docked column (≥1024px wide and under 700px tall) there is no card, because the Stage words are in view beside it.
  - The words scroller is not a Tab stop.
  - The words render slightly lighter than the reference image because the app uses the variable Fraunces font file (T19).
- **The phone bar** is one row. The visible label is "Finish"; the accessible name stays "Finish my story" (M6).

### s07 · Read Room

- **The house tape is a door in its own row,** not a face on the shelf (T20a).
- **The toast is a status line** under the shelf, so it never covers a tape (T20a).
- **Face details:**
  - stripe 4px (s07's face, not the ticket's 10px);
  - inset border 2px;
  - the tape loop is drawn at stroke 12;
  - no intro paragraph;
  - gold kicker;
  - no "MADE IN" (T20a).
- **Sent tapes.**
  - A sent tape has no picture inset. A cached thumbnail would be a copy the maker's delete could not reach (T20b).
  - "SENT TO YOU" is a plain mono label under each sent tape (T20b).
  - The NEW stamp radius is 7px (T20b).
  - Close from a sent tape returns to the shelf (T20b).
- **Resume band.**
  - It shows a place ("You stopped at page N."), not s07's "On Sunday you heard all 8 pages". Listening history is forbidden by HANDOFF §7.
  - There is no FEATURED art and no per-page strip.
  - The band keeps a delete action, "Pull the tape out" or "Take it off this shelf".
  - Buttons are 48px (T21).
- **Read it in… panel.**
  - The header shows a page picture without words over it (T22a).
  - A mono target line names the tape (T22a).
  - On phones the blurbs wrap (T22a).
  - At ≥1024px M6 adopted s07.html's own panel geometry (440px, 12px padding, 42px button) so the panel fits the first screen (49aafbb).
- **The chosen voice travels in the URL fragment, not the query.** A Next client navigation sends the query to the server, so a name in the query would reach server logs (T22b).
- **The voice row.**
  - It shows only names this device knows.
  - "Checked" and "READING NOW" are separate marks.
  - "Someone new" with a name field is new UI (T22b).

### s08 · Protocol

- **The house tape's page 3 is exploded,** not Mia's. Its Voice and Signature plates are honestly empty: a dashed flat line for the voice, and a seal drawn unsealed because the tape has no consent record. Plate 02 prints the alt text rather than pixel and byte sizes. There is no QR on plate 07 (T23a, M5-PRD OQ 2).
- **Connectors are paper dashes.** Ink would be invisible on navy (T23a).
- **Plate 03's sentence is 12px** with a two-line clamp (T23a).
- **Validator lines.** WARN and FAIL both come from labelled hand-edited copies, each prefixed "a hand-edited copy:". The validator keeps its double quotes, and the PASS line names the house tape (8 pages) (T23b, M5-PRD OQ 3).
- **The player snippet** has two `?.` compared with the reference. The reference text throws on the house tape's page 8, which has no picture. This needs your sign-off (§5) (T23b).
- **Card layout.**
  - The codec rows wrap to two lines.
  - The fact tiles are restyled to s08's spec.
  - The spec and schema links row stays, so FIG. 1 starts about 120px lower.
  - The cards column starts at 1088px, so the plates keep their 556px.
  - The player glyph is lucide `CodeXml` (T23b).
- **Only one figure is numbered.** The older seven-band diagram stays in manifest order with no figure number (M6).

### s09 · Studio Advanced

- **Page mood select.** It sits above the whole-story select, so T17's tested keyboard path still holds. The selects are native. M6 made the docked rows 36px; the phone sheet keeps 44px (T24a, M6).
- **"Type a feeling" apply buttons.** There are two explicit buttons, "Use for page N" and "Use for every page", instead of one arrow. A house-default line appears for unknown words. The pill is outlined with the mood's icon (T24b).
- **`resolveMood` own-key fix.** "constructor" used to return `Object`; it now returns the documented answer (T24b).
- **The levelling row** is labelled "Evening out each voice" (T17).
- **Not drawn:** the window title bar, CAST, the timeline and the SFX lane (P3).

### s10

- Nothing to build. Only the no-account open is shot.

---

## 5. Open questions for Jon

**Production and repo (need your hands):**

1. **Apply migration 002** (`supabase/migrations/002_share_code_128bit.sql`: the share_code default becomes 16 random bytes). This is HITL; the build never applied it. The app does not depend on it, because it inserts explicit 128-bit codes.
2. **Apply migration 003** (`003_share_lookup_by_code.sql`: the `storybook_by_share_code` RPC, and it drops the public read policies). This is HITL and was never applied by the build.
   - Until it is applied, anyone with the shipped anon key can list every share code and published story. Each cloud link open also costs one extra request: the RPC returns 404, then the exact-match fallback runs.
   - After it is applied, the `storybookByShareCodeBefore003` fallback in `src/lib/supabase.ts` can be deleted.
   - The two migrations can be applied in either order.
3. **The `views` columns.** `shared_links.views` and `storybooks.view_count` still exist, and nothing in `src/` reads or writes them. Drop them, since the COPPA posture says no counters? This is a production migration (M0-PRD OQ 3 and its repeats).
4. **Delete the leftover branch `claude/push-probe`** on origin.

**Privacy and product calls:**

5. **Read Room home chip prefetch.** Production Next prefetches the visible `<Link href="/">` as `/?_rsc=…`. Nothing personal is sent; it is a page payload request. Should that link use `prefetch={false}`, so the Read Room makes zero background requests? The no-send tests currently ignore these prefetches.
6. **Device-mode share URL in the file.** A device-mode `.storysync` still carries the device-only `shareUrl` in its signature. It is harmless, because the code only opens on that device, but you should decide whether a device-mode file should drop it.
7. **The cloud QR/share path is tested only in dev.** A development-only seam (`__ssyncTestCloud`, compiled out of production) lets a test check the cloud card. CI runs a production build with no Supabase, so it skips that test. Is the Vercel preview configured with Supabase so the signed-in shelf, Sent to you from a cloud link, and the cloud card can be walked by hand (M4-PRD OQ 3)?
8. **The `/protocol` snippet.** Approve the two `?.` in "Write your own player", or keep the reference's exact text, which throws on a page with no picture (T23b)?
9. **Whose name is "VOICE:".** It is currently the lead name of "story by". If a parent types "story by: Mom" over the child's voice, the cover says MOM. Should the Creator ask "Whose voice?" explicitly (M0-PRD OQ 5)?
10. **Old 64-bit links.** Keep resolving them, or add a "renew link" (M0-PRD OQ 4)? Related: each cloud re-publish inserts a new `shared_links` row, so a story can hold several codes. Delete revokes them all (T02).
11. **Onward sharing.** `remixOf` and `replyTo` carry the source tape's unlisted link inside the new tape. Acceptable (T15, T18)?

**Format and audio:**

12. **J-card credits.** Add an optional `metadata.credits` and a making-time field (duration only) (M2-PRD OQ 2, 3)?
13. **QR row.** Keep the full URL with its scheme (M2-PRD OQ 5)?
14. **Fullscreen on open** behind Tap to Begin (M2-PRD OQ 1)?
15. **Levelling.**
    - Add an 80 Hz rumble high-pass and adopt s09's "Voice clean-up (level, rumble)" label (M3-PRD OQ 4)?
    - Safari AAC takes are left as recorded where no WebCodecs AAC encoder exists. Agree (OQ 5)?
    - Is −20 dBFS right, or −18 for phone speakers (OQ 6)?
    - The +18 dB boost ceiling also needs your yes (T17).
16. **Opening your own tape drops its voices.** Offer "Keep the voices" when the consent records match (M3-PRD OQ 2)? How should a re-voiced tape credit the reader (OQ 3)?
17. **New copy.**
    - The adult trust line "Your voice never goes anywhere without you." (M3-PRD OQ 7).
    - "Snap the next drawing" adds a page and opens the camera (OQ 8).
    - Over 15 MB is shown in red but not blocked (OQ 9).
18. **Shelf.**
    - Sent tapes have no thumbnail (M4-PRD OQ 2).
    - NEW is only for received tapes (OQ 4).
    - The reply wording "its own little tape" (OQ 5).
    - Reply is hidden on the house tape (OQ 6).
    - Names learned from someone else's tape are listed in the voice row (OQ 7).
    - A signed-in cloud tape with no link cannot be copied from another device (OQ 8).
19. **Protocol and moods.**
    - Explode the tape you came from on `/protocol` (M5-PRD OQ 2)?
    - Keep the validator's real wording (OQ 3)?
    - Simple mode's mood choice clears per-page overrides (OQ 4).
    - An unrecognised feeling applies Wonder (OQ 5).
20. **Landing.**
    - Retire "How the magic works" and the protocol teaser to match s01 (M1-PRD OQ 1)?
    - The wordmark icon (OQ 2).
    - An in-app privacy page (OQ 3)?
21. **Fixtures and fonts.** WAV narration in fixtures (M0-PRD OQ 9). The extra Fraunces 800/italic and Plex Mono 600 weights are self-hosted (OQ 8).
22. **The automatic last-page end** opens the end card without the page-turn chime. Should it chime (T09a)?

---

## 6. Known bugs and limits

Each item was checked against the M6 commits. Items M6 fixed are not listed.

**Not exercised in CI:**

- **Cloud mode has not been tested end to end.** CI has no Supabase. The following are covered only by pure-function tests, by the dev-only seam, or not at all:
  - the signed-in shelf;
  - Sent to you from a cloud link;
  - a sent tape whose own `shareUrl` names a different code (T21);
  - the signed-out sign-in panel's fit on the publish card (T16).
- **AAC encoding is absent in headless Chromium,** so every test publishes WAV. The AAC re-encode branch of levelling (levelled AAC passthrough, Opus → levelled AAC) has not been verified on a browser that has WebCodecs AAC, or on Safari (T17).
- **The over-budget (>15 MB) red label** is not driven end to end. localStorage cannot hold a tape that size, so it is covered by a Node test only (T16).

**Layout:**

- **At 320px the Studio scrolls sideways.** The transport row needs about 366px (T13a/T05b). It predates this build and was not fixed.
- **The Studio top bar can wrap to two rows between 640 and 767px.** M6 made it one row below 640px; it was already one row from 768px (T15, T13a).
- **Landscape phones** (844×390, 667×375): the Studio's Stage photo is tiny or hidden, and the floating Voice card scrolls (T19).
- **On `/protocol` at 1140px,** the Visual plate readout is cut by an ellipsis with no way to see the rest (§2).
- **A long voice name** in the Read it in… row can run under the record dot (T22b).

**Behaviour:**

- **The publish label says "ON THIS DEVICE" even when the save failed** (T16).
- **The Studio does not show `shareBook`'s own error sentence.** It catches any failure as "no link" and shows the generic no-link copy (T02; `Studio.tsx` around line 1141).
- **Reader position:**
  - A paused browser voice re-reads its page from the start, and the tape strip steps back with it (T09b).
  - Browser voices that send no word boundaries move the strip in one jump per page (T09b).
- **Per-page moods:**
  - Selecting a page on the filmstrip while the Music card is open stops the bed (T24a).
  - A source page with no music opens as the story mood (T24a).
- **Repeated announcements.** Applying the same feeling twice repeats an identical announcement, which a screen reader may skip (T24b).
- **Midnight edge.** The gate's stamp date and the consent record's date can differ if the gate is left open across local midnight (T14).
- **No draft download.** The replace dialog says "download it first", but the only download is behind Finish (T15).
- **`uploadMedia`** is unused. If it were used, `getPublicUrl` would make media world-readable by URL, outside the by-code model (T02b).

**Leftovers and cleanup:**

- `.pl-qr-title` in `player.css` is overridden and unused (T12).
- `DownloadDemo`'s default variant and `.pr-take-*` styles are no longer rendered (T23b).
- `MOOD_ICON` still has private copies in `EndCard.tsx`, `ParentGate.tsx` and `PacketExploded.tsx` (T22a).
- `consentRecords` in `src/lib/storysync/consent.ts` has no caller (T14).
- The comment at `Studio.tsx:1063` says `is_public` "is what the read policy checks"; after 003 it is the by-code function that checks it (T02b).

**Test stability:**

- Some tests failed once under a loaded local dev server and passed on rerun:
  - `critic-player.spec.ts:437`
  - `wp-player.spec.ts:480`
  - `wp-player.spec.ts:901`
  - `vision-resume.spec.ts:297`
  - the landing press-play stopwatches
  - the `wp-landing` 320–1440 sweep, which takes about 30 s against a 30 s timeout

  See `gates.txt` for how they did on the production run (T18, T20a, T22a, T23a).

---

## 7. Process notes

- **Ticket structure.** Every ticket was a vertical slice with its own tests, written first and seen red where the ticket notes say so. Each ticket was reviewed independently before commit.
  - Review scores ran from 8.7 to 9.2 for the tickets that passed.
  - Several tickets passed only after a fix round: T02, T03, T13a, T13b, T15, T21, T22a and T23b.
  - **T12 did not pass review after two fix rounds** (8.4). Its one blocking item, the focus ring on paper at about 2.1:1, was fixed afterwards in 88308d0. No later score is recorded.
- **All reviews were same-family.** Cross-family review was not available, so every verdict here is same-family: verdict-pending in IDC terms. Claude's review is the first independent one.
- **Builders could not run `npm run build`.** The shared checkout forbade it, so the build gate ran in CI (`next start`) and in the final gate run (`gates.txt`).
- **CI stayed green except for these incidents,** each fixed in the commit named:
  - **CI-only layout failures:** 219dcd9, e503b57, c5d0e99, 6312ca3, b127af3, a1431d7, de9df56, 9e70bb8.
    - Root cause: CI's headless Chromium hinted fonts fully and rounded glyph advances to whole pixels.
    - Fixed in de9df56 with `--font-render-hinting=none`.
    - The temporary probe that found it was removed in 9e70bb8.
  - **A wrong-press flake** in `wp-player`: 716d045.
  - **Flaky settle reads:** a4af680 (T16), 2c8b8d6 (T13b).
  - **A cross-ticket leak:** T23b's commit carried T20a's in-flight expectations; fixed in d99ce88.
  - **Production-only `/?_rsc=` prefetches** tripping the no-send checks: fe387be, 2f94af0, 10cd638.
  - **The verify job's 30-minute cap:** raised to 45 minutes in 5e021c6. Chromium is now cached per lockfile (891a556).
  - **During M6:**
    - ef9f372: the packed-tape round trip, after 9c73db6 stopped the cover ghosting.
    - b9afc9a: an illustrative name in a JSDoc example tripped the fixtures guard.
- **Four container restarts** happened during the build. None lost work; in-flight changes were backed up and resumed each time.
- **Working-tree noise.** About 92 tracked screenshots are still modified in the working tree: 24 under `docs/vision/evidence/` (T13a, T16, T17, T20a, T20b) and 68 under `tests/screenshots/`. Early test runs re-rendered them before dd452c6 made such writes opt-in. They were never committed.
  - To drop them locally, run `git restore -- tests/screenshots docs/vision/evidence/*.png`.
  - There are also untracked strays: `s01-390.png` at the repo root and four new PNGs under `tests/screenshots/`. These were never committed either.

---

## PR and preview

PR: https://github.com/Navigata1/storysynchq/pull/5
Preview: https://storysynchq-git-claude-storysync-audit-ref-382375-islanddevcrew.vercel.app (its `ssync-build` meta is checked against the head commit in the PR description)
