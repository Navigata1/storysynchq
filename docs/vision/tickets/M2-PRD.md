# M2 · Reader (s02, s05 phone, s06 end card) — PRD

Reference screens: **s02 · The room around a page** (laptop 1120×700, brief `screens[1]`, "Shipped, plus
next"), **s05 · One link, Grandma's iPhone** — the iPhone Reader only (390×844, brief `screens[4]`), and
**s06 · Grandma answers back** — the end card only (iPhone 390×844, brief `screens[5]`, "Next").
Tickets: **T10, T11, T08, T09a, T09b, T12** (T09 split in two; ids otherwise as HANDOFF §9).

## Problem Statement

A grandparent opening a tape on a laptop gets one picture stretched full-bleed with its words on a dark
scrim at the bottom: it reads like a slideshow, not a book. The deck in the corner is two tiny reels and
a page counter; nothing says what the three sounds are (whose voice, which melody, when the chime comes)
and nothing shows how far through the tape you are except a thin bar. The melody always crossfades in
1.6 s even when the tape's author wrote 2 s or 3 s, so the story's own pacing is ignored. A tape whose
author asked for high contrast or the easier-to-read font opens without them, because the Reader only
listens to the viewer's saved preferences. And when the tape ends, the end card shows the label and two
buttons but none of what the Signature layer carries: who made it, whose voice it is, the music, the
owner, and the consent that travels inside the file. A curious parent has no way from there to learn
what a tape is.

## Solution

Six vertical slices on the shipped Player, in one strict order because they share `Player.tsx`:

1. **T10** — the music follows the manifest: each page's own mood plays, and a page that declares a
   crossfade duration (`pages[].music.duration`) is entered over that duration; 1.6 s stays the default.
2. **T11** — `settings.accessibility` (high contrast, easier-to-read font, timing multiplier, pause
   between pages) are the tape's defaults; anything the viewer has explicitly chosen still wins, and
   only explicit choices are saved, on this device only.
3. **T08** — at desktop widths the page becomes an open book: art left (dominant, ~560/440), a sheer
   text page right with a "PAGE 2 · WONDER" kicker. Phones keep the shipped full-bleed/stacked layouts.
4. **T09a** — the deck chip expands to the three sounds: VOICE (9-bar mini waveform + narrator name or
   "Storyteller (browser voice)"), MELODY (mood + "12 dB under the voice"), CHIME (seconds to the turn);
   the right page's foot shows the turn ring and "next page in 3 s · turn cue ready". On a phone the chip
   is the compact pill with the narrator's name.
5. **T09b** — progress is cassette-native: tape packs on the reels (left big early, right big late) and a
   tape strip with one tick per page that fills within the page.
6. **T12** — the end card prints the J-card liner notes (pictures, words, voice, music, made in, owner,
   consent) ending in "What's inside this tape? →" to `/protocol`, with "Read it again" / "Make your own
   story", the pass-it-on QR, and "Nobody is counting plays. This page has no trackers."

## User Stories

1. As a grandparent on a laptop, I want the picture on the left and the words on the right like an open book, so that the page feels like a storybook and not a video frame.
2. As a grandparent on a phone, I want the same full-bleed page I get today, so that the picture stays big on a small screen.
3. As a listener, I want to see which page I am on and which mood is playing ("PAGE 2 · WONDER"), so that I know where I am in the story.
4. As a listener, I want the deck chip to say whose voice I am hearing, so that "VOICE · Mia" tells me this tape is in her own voice.
5. As a listener of the house tape, I want the chip to say "Storyteller (browser voice)", so that nobody is misled into thinking a person recorded it.
6. As a listener, I want the chip to say which melody is playing and that it sits "12 dB under the voice", so that the three sounds feel deliberate.
7. As a listener, I want to see the seconds to the next page turn, so that I can get ready to turn or pause.
8. As a listener, I want the reels' tape packs and a strip of tape to show how far through the story I am, so that progress feels like a cassette, not a scrubber.
9. As a tape author, I want my crossfade durations honoured, so that the music changes at the pace I set.
10. As a tape author, I want each page's own mood to play, so that a quiet page can be quiet and a brave page can be brave.
11. As a parent making a tape for a child with low vision, I want my tape to open in high contrast by default, so that my child does not have to find a setting.
12. As a viewer who turned high contrast off, I want my choice to win over any tape's default, so that the Reader respects me.
13. As a viewer, I want to see when a setting came from the storyteller, so that I understand why the page looks the way it does.
14. As a viewer, I want my reading options saved on this device only, so that nothing about me leaves it.
15. As a grandparent at the end of a tape, I want liner notes like the card inside a cassette case, so that I know who made it, whose voice it is and that consent was given.
16. As a curious parent at the end card, I want "What's inside this tape?" to take me to the protocol page, so that I can learn what a .storysync is.
17. As a grandparent who opened a link, I want a QR to pass the tape on to another phone, so that the tape can travel without typing.
18. As a parent, I want the end card to state that nobody is counting plays, so that I can trust the Reader with my child's voice.
19. As a keyboard or screen-reader user, I want every new control reachable and every decorative glyph hidden, so that the Reader stays accessible.
20. As a listener with reduced motion, I want packs, rings and strips to change without animating, so that the room stays still.

## Implementation Decisions

Modules (new pure modules are dependency-free and use relative imports only, like the existing player
timing module, so Node-side tests can import them directly):

- **Music plan (new, pure; T10).** Extracts the Player's private "which mood is this page" logic and
  adds "how long is the crossfade into this page": the page's own `music.duration` when it is a
  parseable duration, otherwise the 1.6 s default; clamped to a sane range. The duration belongs to the
  page being *entered*, in either direction.
- **Music bed / engine (modify; T10).** The engine's start/setMood accept an optional crossfade seconds
  and pass it to the bed (the bed already takes it). Both expose a read-only "last crossfade seconds"
  for tests and the console. The engine exports its duck depth in dB so the UI can print "12 dB" from
  the real constant instead of a literal.
- **Reader prefs (new, pure; T11).** One function resolves effective preferences from author defaults
  (`settings.accessibility`) and the viewer's explicit choices; viewer choices win field by field. A
  sanitizer reads stored viewer choices (new sparse shape; legacy full objects are read as explicit only
  for values that differ from the product defaults). The manifest type gains the two schema fields it is
  missing (`highContrast`, `dyslexiaFont`) — the JSON schema already has them.
- **Spread layout (T08).** A client-only media-query hook (SSR default: stacked, set in an effect, the
  cover gate hides the first paint) decides spread vs stack: spread when the viewport is ≥ 1024 px wide
  and landscape. The page gets `is-spread`; the layout class (`is-full` etc.) applies only when stacked.
  Spread CSS lives in a new player-scoped stylesheet. Top chips switch their text glyphs (♪ ⚙ ⏏) for
  lucide icons (Music, Settings, X), names unchanged.
- **Deck status (new, pure; T09a).** Maps (page, manifest, live flags: narrating, paused, music on/live,
  audio ok, speech available, hold remaining) → the three row strings and the foot line. A kit `DeckChip`
  renders it (expanded at ≥ 768 px, compact below, keeping T03's mic + narrator). Per M0's allocation rule
  (T05b: a shared piece is built by its first consumer), **T09a builds `DeckChip`** in its own kit file with
  the brief's `design_system` (7) spec, and **T12 builds `JCard`** with spec (10).
- **Tape position (new, pure; T09b).** Maps (page index, total, in-page fraction) → story position, the
  two pack diameters and the strip fill; the Player supplies the in-page fraction from the clip time
  (recorded voice), the read-along index (browser voice) or 1 after narration.
- **Liner notes (new, pure; T12).** Maps a manifest → ordered J-card rows (key, value) using only fields
  the tape carries: page count with pictures, word count, narrator / browser voice, moods in page order,
  ownership + rights, consent records (granted-by wording + `YYYY-MM-DD` formatted as "Oct 19, 2026",
  timestamps tolerated). Rows with no data are omitted; nothing is invented.
- **End card (new component; T12).** The end card moves out of the Player into its own component
  (label + sticker, J-card, actions, QR, privacy line, close), rendered with the kit `JCard` T12 builds.
- No new runtime dependencies; no network; no storage beyond the existing device-only prefs key.

## Testing Decisions

- **Node-side seam** (prior art: `tests/storysync-roundtrip.spec.ts`; `tests/wp-player.spec.ts` importing
  `src/components/player/timing.ts`): the music plan, reader prefs, deck status, tape position and liner
  notes modules are tested as pure functions — input manifest/flags, output values. Fixtures from the
  house tape JSON and from `tests/fixtures/`.
- **E2E seam** on `/read` (prior art: `seedLibrary` + `/read?story=<id>` in `tests/wp-player.spec.ts`,
  the read-only `window.__ssyncPlayer` hook, emulated reduced motion, pixel contrast sampling): desktop
  1280×720 and mobile 375×812 projects plus explicit reference viewports (1120×700, 390×844).
- The engine is observed only through its existing read-only hook (`window.__ssyncPlayer`) extended with
  getters, never through private state. Getters only; no story data; nothing leaves the device.
- Existing Player tests that assert the full-bleed scrim and the ~62ch measure at 1440×900 change with
  T08 because the reference changes the desktop behaviour (listed in T08 with reasons); every contrast bar
  is kept, re-targeted at the spread's text page.
- Fixtures: the Twinkle tape and its helpers come from **T00** (`tests/fixtures/tapes.ts` `loadTape`,
  `tests/fixtures/helpers.ts` `seedDeviceLibrary` / `openTapeInReadRoom`; rasterized drawings, WAV clips,
  narrator "Mia", one consent record dated 2026-10-19). M2's synthetic tapes (per-page moods, author
  defaults, countdown, white/4:3 art, multi-voice consent) live in `tests/fixtures/reader-tapes.ts`, created by
  T10 and extended by later M2 tickets in chain order; its `seedReaderTapes(page, rows)` writes `ssync-library`
  once, so a test needing Twinkle beside synthetic tapes adds a row built from `loadTape("twinkle")` instead of
  calling two seeders.

## Out of Scope

Quoted from HANDOFF §4:
- s02 **I:** "word-to-picture hotspots ("tap a word, the picture answers"). Do not build." — the
  reference's dashed ring and "Idea · tap a word, the picture answers" chip are left out entirely.
- s05: "Not UI: the passport-stamp ribbon in the reference is an explanatory diagram. Do not build it."
- s06 **I:** ""Keep it on this phone" (offline tapes). Do not build."
- s06 **N** items owned by other milestones: **"Send a thank-you back"** (T18, M4), the **READ THIS** card
  (T19), **adult self-consent** in the gate (T14). T12 leaves the reply button out (no placeholder).
- s05 publish card, size meter, layer chips, "Evening out each voice" (T16, T17, M3).
- Studio authoring of per-page moods and "Type a feeling" (T24, M5) — T10 is the Player/engine side only.
- **P3:** nothing on these screens; StorySync for Schools, made voices, Cast etc. are never built.

## Open Questions (for Jon)

1. **Fullscreen on open.** The s02 realism line lists "fullscreen on open (from /classic)" as Vision, but
   HANDOFF §4 does not list it as Next. M2 does not build it. Build it (behind the Tap to Begin gesture)?
2. **J-card credits.** The reference rows "PICTURES — 5 crayon drawings by Mia, age 4" and "WORDS — Mia
   said them; Mom typed them" are not in the manifest. T12 prints only what the tape carries ("5 pictures",
   "35 words on 5 pages"). Add an optional, additive `metadata.credits` (pictures / words) to the spec?
3. **MADE IN.** The Creator shows "Made in 7:48" but never writes it into the tape, and "on an Android
   tablet" would be device data in a child's file. T12 omits the row unless the tape carries it. Write an
   optional making-time field (duration only, never the device)?
4. **`shared_links.views`** (same question as M0-PRD OQ 3). `supabase/migrations/001_initial_schema.sql`
   defines `views INTEGER DEFAULT 0`; nothing in `src/` increments it (verified with grep). T12's end card says
   "Nobody is counting plays.", which is true today. Dropping the column (and `storybooks.view_count`) is a
   production migration only Jon can approve and apply.
5. **QR URL text.** The s06 QR row prints the link without `https://`; the shipped end card prints the exact
   URL and a critic test pins it byte for byte. T12 keeps the exact URL. OK?

## Notes

- **`Player.tsx` order (strict, one editor at a time): T03 (M0, adds mic + narrator to the deck) → T10 → T11 →
  T08 → T09a → T09b → T12.** Logic-only slices (T10, T11) land before the render restructure (T08); the
  deck chip (T09a/b) and end card (T12) build on T08's tree. Each ticket lists its predecessor as a
  file-order blocker on top of the HANDOFF §9 blockers.
- The page turn stays the shipped turn (no page curl). s02 figure B's curl is a still of the turn, and a
  curl would compete with the one spectacle.
- Spread breakpoint ≥ 1024 px and landscape means an iPad in landscape (1180×820) reads as a spread and a
  portrait tablet (1024×1366) keeps the stacked page.
- Rivera family content is fixture-only (`tests/fixtures/`, T00's guard test enforces it), never in `src/` or `public/`.
- Runtime label: for Twinkle the shipped word estimate gives 35 words ÷ 2.5 + 5 × 2 s = 24 s → "~0:24", the
  reference's figure, so M2 keeps the shipped runtime rule (re-count in tests from the fixture, never a literal).
- Cross-check for M0: T03's test 6 expects `.pl-deck svg` count 0 on the house tape, but the shipped `Reel` is an
  inline SVG (two per deck), so that selector already counts 2; T03 should target the mic glyph by a hook. T09a
  gives the mic `data-pl="deck-mic"` and re-targets that assertion if it exists.
- Reference crops: s02 laptop screen `renders/s02.png` x98–1218, y58–758 (1120×700, 1:1); s05 iPhone screen
  approx. x1178–1568, y78–922; s06 phone 1 (end card) approx. x416–775, y162–938 (drawn at scale .92).
