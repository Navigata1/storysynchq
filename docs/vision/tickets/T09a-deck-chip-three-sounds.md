# T09a · Expanded deck chip: three sounds and the narrator's name
Milestone: M2 · Reference: s02 (brief screens[1]) + s05 iPhone (brief screens[4]) · Status in reel: Next
Type: AFK (agent can finish alone)
Blocked by: T00 (Twinkle fixture), T03 (narrator in the deck), T05a (tokens + kit file layout), T05b (allocates DeckChip to this ticket), T10 (exports the duck depth), T08 (file order on `Player.tsx`; the turn line sits in the spread's text page)   ·   Blocks: T09b (file order), T25
(Split from HANDOFF T09 "Expanded deck chip: three sounds, narrator name, tape-pack progress"; the progress half is T09b.)

## Why
s02's callout: "THREE SOUNDS, AT ONCE — The narrator on the voice bus; the Wonder melody, a music box over a
soft pad, ducked about 12 dB beneath it; and a paper-and-wood chime, under 300 ms, on its own channel when
the page turns." The chip says so in three rows — "VOICE · Storyteller (browser voice)", "MELODY · Wonder,
12 dB under the voice", "CHIME · next turn in 0:03" — and the right page ends with "next page in 3 s · turn
cue ready". On Grandma's iPhone (s05) the chip is a pill with "the narrator's name": "Mia". Today the deck is
two tiny reels and "02 / 08", and nothing tells a listener whose voice it is.

## Done when (acceptance, each testable)
- [ ] At ≥ 768 px wide the deck chip (top-left, glass, radius 18, `role="group"`, accessible name "Now playing")
      shows the two reels, the counter ("02 / 08" format kept exactly) and three mono rows with decorative
      micro-glyphs (`aria-hidden`): a 9-bar mini waveform (gold while a voice is speaking, dim otherwise —
      static bars, never a looping animation), three note dots with a small down arrow, a hollow ring.
- [ ] VOICE row, from the page and the device (pure deck-status module):
      recorded `audioUrl` + `metadata.narrator` → "VOICE · <narrator>"; recorded, no narrator →
      "VOICE · Recorded voice"; no recording, words, speech available → "VOICE · Storyteller (browser voice)";
      no recording, words, no speech → "VOICE · Words only"; no words → "VOICE · No words on this page".
- [ ] MELODY row: bed live → "MELODY · <Mood>, 12 dB under the voice" (the number is the engine's exported duck
      depth, rounded — not a literal); listener turned music off → "MELODY · off"; page names no music →
      "MELODY · none on this page"; Web Audio unavailable → "MELODY · no sound on this device".
- [ ] CHIME row: `pageTurnSound: false` → "CHIME · off"; `autoPlay: false` → "CHIME · when you turn the page";
      paused → "CHIME · paused"; voice still speaking → "CHIME · after the voice"; during the hold before an
      automatic turn → "CHIME · next turn in 0:0N", counting down once per second to the turn (m:ss, rounded up).
- [ ] In spread mode the text page's foot shows a 24 px ring (gold arc = elapsed share of the hold, empty while
      the voice speaks) and the mono line "next page in N s · turn cue ready" (N = the page's hold in whole
      seconds, counting down during the hold; "· turn cue off" when `pageTurnSound` is false). Absent when
      `autoPlay` is false, and absent on phones.
- [ ] Below 768 px the chip is the compact pill: reels + counter + a hairline + a lucide Mic glyph + the narrator's
      name when `metadata.narrator` is present (s05: "Mia"); no rows.
- [ ] The three rows (not the reels or the counter) fade out with the rest of the chrome after the idle timeout
      and return on mouse move / touch; the reels and counter never hide (shipped rule).
- [ ] The countdown is not an `aria-live` region (no per-second announcements); the shipped polite "Page n of N"
      announcement is unchanged.
- [ ] Reduced motion: reels do not spin, the ring arc jumps without transition.
- [ ] Nothing is counted or stored: the chip reads only the manifest and live engine/narration state.

## Seams and files
Seam 1 (Node): a pure deck-status module (inputs: page, manifest, flags `{narrating, paused, musicOn, musicLive,
audioOk, speechAvailable, holdRemainingS, holdTotalS}`, the duck depth) → the three row strings and the foot
line. Seam 2 (E2E): `/read` with seeded fixtures, reading the chip's visible text. The Player tracks the hold
deadline it already schedules (set when narration finishes, cleared on turn/pause) and ticks a 1 s interval
only while a hold is running. A new kit `DeckChip` renders it: this ticket is its first consumer, so it builds it
(M0 allocation rule) to the brief's `design_system` (7): glass pill radius 18, two 18–20 px reels, mono counter,
three mono rows when expanded. It keeps the `.pl-deck` class on its root and T03's mic + narrator (the mic gets
`data-pl="deck-mic"`).

## Files (ownership)
- `src/components/player/deck-status.ts` — **new** (pure).
- `src/components/studio-kit/DeckChip.tsx` + its component-scoped stylesheet — **new** (file naming per T05a's
  one-file-per-component kit layout; consumers import it directly, the kit barrel and `kit.css` are not edited).
- `src/components/player/deck.css` — **new**, owned by T09a (chip placement in the room, rows' idle fade,
  turn ring + foot line).
- `src/components/player/player.css` — modify (unavoidable, the `.pl-deck*` block only, ~lines 522–556): it moves
  into `deck.css` so the chip's placement has one owner. No other rule in the shared stylesheet changes.
- `src/components/player/Player.tsx` — modify: replace the `.pl-deck` element with the DeckChip; hold deadline
  state; foot line in the spread text page; speech availability flag.
- `tests/vision-deck-status.spec.ts` — **new** (Node).
- `tests/vision-reader-deck-chip.spec.ts` — **new** (E2E).
- Twinkle comes from T00 (`tests/fixtures/helpers.ts` `seedDeviceLibrary(page, "twinkle", { shareCode })` or
  `openTapeInReadRoom`); not modified here.
- `tests/fixtures/reader-tapes.ts` — modify: add `countdownTape` (1 s silent clip, autoPause "4s"),
  `noCueTape` (`pageTurnSound: false`), `manualTape` (`autoPlay: false`).
- `docs/vision/evidence/T09a.png`, `T09a-390.png` — **new**.

## Existing tests that may change
- `tests/vision-narrator.spec.ts` (T03) — the deck assertions: if they locate the mic as `.pl-deck svg` (count 1 on
  Twinkle, 0 on the house tape), re-target them to `[data-pl="deck-mic"]`. Reason: the reels are inline SVG and the
  expanded chip's micro-glyphs are SVG too, so a bare `svg` count no longer means "mic". The intent — a mic and the
  name only when the tape has a narrator — is unchanged. If T03 asserted `aria-hidden` on the deck, that changes to
  the `role="group"` "Now playing" chip because the three rows carry information no other element states (the
  mood and the time to the turn); the cover meta stays the statement of the voice.
- Must keep passing unchanged: `tests/critic-landing.spec.ts` "the packed tape really plays" (finds the
  counter by `/01\s*\/\s*08/`), `tests/fable-pass.spec.ts` (locates `[data-page]` with `.first()` — the chip must
  not add `data-page` attributes), every `wp-player`/`critic-player` test (they never target `.pl-deck`).

## Tests (written first)
1. `tests/vision-deck-status.spec.ts` (Node): the VOICE/MELODY/CHIME truth tables above; countdown formatting
   is ⌈remaining⌉ whole seconds as m:ss (4.2 → "0:05", 3.0 → "0:03", 0.4 → "0:01", 61 → "1:01"); the foot line
   with cue on/off; no foot line when `autoPlay` is false.
2. `tests/vision-reader-deck-chip.spec.ts` (E2E; stub `speechSynthesis` as `tests/critic-player.spec.ts` does for
   determinism): house tape at 1280×720 → "VOICE · Storyteller (browser voice)", "MELODY · Wonder, 12 dB under the
   voice"; Music off → "MELODY · off"; Twinkle at 1280×720 → "VOICE · Mia"; Twinkle at 390×844 → compact pill
   with "Mia" and no rows; `countdownTape` → "CHIME · next turn in 0:04" then a smaller value, then the page turns,
   foot line "next page in 4 s · turn cue ready" before the hold; `noCueTape` → "CHIME · off" and "turn cue off";
   `manualTape` → "CHIME · when you turn the page" and no foot line; idle 4.2 s → rows hidden, counter visible.
Red first: no rows exist.

## Fidelity check
Viewport **1120×700** — state: house tape page 2, voice speaking (stubbed), chrome visible. Compare the chip with
`renders/s02.png` crop ≈ x118–565, y74–155 and the foot line with ≈ x698–970, y605–635. Save
`docs/vision/evidence/T09a.png`. Viewport **390×844** — state: Twinkle page 3 during the clip; compare the pill
with the s05 iPhone crop ≈ x1188–1475, y137–175. Save `T09a-390.png`. Expected deviation: pack discs on the reels
arrive in T09b; the reference's violet "Next" chip on the deck is reel annotation, not UI.
