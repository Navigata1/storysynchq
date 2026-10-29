# T22a · "Read it in…": what should it feel like (8 mood tape chips) → "Make our own copy" opens the Creator
Milestone: M4 · Reference: s07 right panel (brief screens[6]) · Status in reel: Next
Type: AFK (agent can finish alone)
Blocked by: T15 (`/studio?open=…&mood=…`, re-voice rules), T20a + T20b + T21 (shelf, selection, resume page; file order on `ReadRoom.tsx`), T10 (music plan: a page's mood), T05a + T05b (tokens, `MOOD_COLOR`; T05b allocates `MoodTapeChip` here, since T13b's mood lane is a coloured strip, not chips)   ·   Blocks: T22b, T24b (shows a resolved mood with the same icon set), T25
Split from T22. T22a = the panel, the feeling, the door into the Creator. T22b = whose voice.

## Why
The wedge, in s07's third callout: "ANY BOOK, YOUR VOICES — make any storybook read itself in the voice and mood you
choose. Re-voicing a house tape needs the Creator to open a .storysync". The right panel draws it for The Brave Little
Star: a header from the tape's own art, "Read it in…", "A computer read you this one. Now read it in yours.", "WHAT SHOULD
IT FEEL LIKE?" over "eight mood tape chips (LOCAL piece 5) in 2 columns x 4 rows (182x48, gap 8), Hush selected", and a
full-width gold "Make our own copy". T15 taught the Creator to open a tape (`/studio?open=…&mood=…`) and set the rules
for a re-voiced copy; this ticket is the door to it from the shelf, with the feeling chosen before the first take.

## Done when (acceptance, each testable)
- [ ] The Read Room shows a "Read it in…" panel (`data-panel="read-it-in"`; glass, radius 20, padding 16): in the right
      column at ≥ 1024 px, under the shelves below that. Its target is the selected shelf tape; with nothing on the shelf
      it is the house tape. The house row (T20a) gains a ghost **"Read it in…"** button that targets the house tape; the
      band (T20a) gains a ghost **"Read it in…"** for the selected tape. Below 1024 px both buttons scroll the panel into
      view and move focus to its heading.
- [ ] Panel header: an image 372×110 (fluid width), radius 12, of the target's resume page (T21) or else its first
      pictured page (`object-fit: cover`), with a small paper tab "PAGE N" at its bottom-left; decorative (`alt=""`),
      since the heading names the tape. No words are drawn over the art. A sent tape (no stored pictures) or a tape with no
      picture → no header image.
- [ ] Heading **"Read it in…"** (an `h2`, Geist 600, 17 px), a mono line naming the target ("<TITLE> · <AUTHOR>",
      uppercase), then a Fraunces 500 16 px `--ss-fg-2` line: **"A computer read you this one. Now read it in yours."**
      when no page of the target has `audioUrl` (the house tape) or the target's pages are not on this device (a sent
      tape: its sent reference's narrator decides); otherwise "<narrator> read you this one. Now read it in yours."
      (`metadata.narrator`, else "Someone").
- [ ] **"WHAT SHOULD IT FEEL LIKE?"** (mono 10.5 px label) over eight kit `MoodTapeChip`s in 2 columns × 4 rows (gap 8;
      one column below 360 px), in `MOOD_NAMES` order, forming a radio group named "What should it feel like?". Each chip:
      paper label, 2 px ink border, radius 8, a 5 px band of its mood colour (`MOOD_COLOR`) across the top, the mood's lucide
      icon (Star, Compass, Moon, Sun, Cloud, CloudRain, Eye, Leaf), the name in Fraunces 700 14 px, the blurb in 11 px
      `--ss-ink-2` taken **verbatim** from `MOODS[name].blurb` (e.g. "Hush" + "Quiet and curious — almost a whisper"), and
      a 6-dot music-box contour in the mood colour at the right; selected = label-yellow field and 3 px ink border. Arrow
      keys move the selection; each chip's accessible name is "<Name>, <blurb>".
- [ ] The preselected mood is the target's first-page mood through T10's music plan (the house tape → Wonder); a target
      with no music, or a sent tape (no pages on this device) → Wonder.
- [ ] A full-width gold **"Make our own copy"** (lucide `Mic`) navigates to T15's entry: `/studio?open=house&mood=<Mood>`
      for the house tape; `/studio?open=<share code>&mood=<Mood>` for a shelf tape with a code (own or sent);
      `/studio?open=<library id>&mood=<Mood>` for a device tape without a code. Everything after that is T15's: its
      replace dialog when a story is in progress, its re-voice rules (no source voices, voice names, music or signature;
      the original author kept; `remixOf`), and the story mood from `&mood=`.
- [ ] The panel fetches nothing; choosing moods is local; the only network activity is whatever T15's entry does for the
      chosen target (the house tape's JSON, or the cloud read for a code).
- [ ] Under reduced motion nothing in the panel animates; at 375×812 the page never scrolls sideways.

## Seams and files
Seam: E2E on `/read` → `/studio` (prior art: the Read Room flows in `tests/wp-player.spec.ts`; T15's
`tests/vision-revoice.spec.ts` for what the Creator shows after `?open=`). The target → URL rule and the "who read it"
line are a small pure helper with a Node block. `MoodTapeChip` is built here per T05b's allocation (brief
`design_system` LOCAL piece 5).

## Files (ownership)
- `src/components/player/ReadItIn.tsx` — **new** (the panel).
- `src/components/player/read-it-in.css` — **new**, owned by T22a.
- `src/components/player/read-it-in.ts` — **new** (pure: target → Creator URL, default mood, the "read you this one"
  line; relative imports only).
- `src/components/studio-kit/MoodTapeChip.tsx` + `src/components/studio-kit/mood-tape-chip.css` — **new**.
- `src/components/player/ReadRoom.tsx` — modify (panel target; "Read it in…" buttons in the band and the house row).
- `tests/vision-read-it-in.spec.ts` — **new** (E2E + Node block).
- `docs/vision/evidence/T22a-1140.png`, `T22a-375.png` — **new**.

## Existing tests that may change
- None. The house row's demo door keeps its class and name (`.pl-choice-1`, "Play the demo tape, The Brave Little
  Star"); the added "Read it in…" buttons are separate controls, so `/Play the demo tape/i` stays unique and `.pl-choice`
  stays 3 on an empty shelf. T15's `tests/vision-revoice.spec.ts` is untouched (this ticket only links to its entry).

## Tests (written first)
`tests/vision-read-it-in.spec.ts`:
1. Node: the helper maps the house tape → `/studio?open=house&mood=Hush` (Hush chosen); a shelf entry with code `<32 hex>`
   → `?open=<code>&mood=…`; a device entry without a code → `?open=<id>&mood=…`; the line for the house tape is the
   computer line, for Twinkle "Mia read you this one. Now read it in yours."; default mood Wonder for both.
2. E2E (desktop + mobile): empty shelf → the panel targets The Brave Little Star; the computer line verbatim; eight radios
   whose names start with each `MOOD_NAMES` entry and whose blurbs equal `MOODS[<Mood>].blurb`; Wonder checked; chip
   computed styles (2 px ink border, 5 px top band in the mood colour, Fraunces 700 name); ArrowDown/ArrowRight move the
   check.
3. E2E: Twinkle in the library and selected → the line "Mia read you this one. Now read it in yours."; the header image
   `src` equals Twinkle page 1's picture; Wonder checked.
4. E2E: house tape, choose Hush → "Make our own copy" → lands on `/studio` (T15 cleans the query); 8 frames, none "has
   voice"; the Music tool's "Hush" radio is `aria-checked="true"` (T15's `&mood=` path).
5. E2E: Twinkle selected (device tape with a code) → Calm → "Make our own copy" → 5 frames titled "Twinkle Came to My
   Window", Music shows Calm.
6. E2E: no network request is made between loading `/read` and pressing "Make our own copy" other than same-origin
   `/_next/` assets.
7. E2E: at 375×812 the band's "Read it in…" scrolls the panel into view and focuses its heading; no horizontal overflow.
Red first: no panel, no chips, no door.

## Fidelity check
Viewport **1140×712** — state: empty own shelf (house tape target), Hush selected. Compare with s07's right panel
(`renders/s07.png` ≈ x775–1213, y150–752): header art + tab, heading, Fraunces line, mood chips 2×4 with the selected
label-yellow field, the gold button. Save `docs/vision/evidence/T22a-1140.png`; **375×812** → `T22a-375.png`. Deviations
to record: the header shows the tape's first (or resume) page without words over the art (the reference sets "Thank you,
little star." in page 6's calm zone, which is unknowable for arbitrary tapes); no "Next" chip; "WHOSE VOICE?" comes in
T22b.
