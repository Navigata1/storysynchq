# T22b · "Read it in…": whose voice (blank voice cassettes) → the chosen name reads the copy
Milestone: M4 · Reference: s07 right panel (brief screens[6]) · Status in reel: Next
Type: AFK (agent can finish alone)
Blocked by: T22a (the panel and its door; file order on `ReadRoom.tsx`), T20b (sent narrators), T15 (query effect, "read by" byline), T03 (narrator from the byline), T04b (per-voice consent from the byline), T19 (file order on `Studio.tsx`, `ToolPanels.tsx`), T18 (file order on `types.ts`, `draft.ts`)   ·   Blocks: T24a (file order on `Studio.tsx`, `ToolPanels.tsx`, `types.ts`), T25
Split from T22. T22a = the panel, the feeling, the door. T22b = whose voice.

## Why
s07's panel: "a mono 10.5px label + five blank voice cassettes (LOCAL piece 6, 68x60): browser voice (reels spinning,
'READING NOW'), Mom, Mia, Grandma Rose (each hand-lettered with a tape-red record dot) and a greyed locked one" labelled
"MADE VOICE · PHASE 3". "Google cannot read this in your voice" only becomes true when the copy knows whose voice it is.
T15 already makes the gate's byline "read by" for a re-voiced tape, so T03 names that reader as the narrator and T04b
writes consent for that voice; this ticket lets the family pick the reader on the shelf, before the Creator opens.

## Done when (acceptance, each testable)
- [ ] Between the line and "WHAT SHOULD IT FEEL LIKE?", the panel shows **"WHOSE VOICE?"** (mono 10.5 px) over a row of
      kit `VoiceCassette`s (68×60: shell, paper label, dark window with two small reels; the name hand-lettered in Fraunces
      italic over a dashed ink line; a tape-red record dot) forming a radio group named "Whose voice?":
      1. **"Browser voice"**, first. When the target has no recorded page (the house tape, a sent tape whose reference has no
         narrator) it is the one reading today: its reels turn slowly with a faint blur and **"READING NOW"** (mono) sits
         under it; static under reduced motion.
      2. Up to four names this device already knows, most recent first, deduped case-insensitively: every
         `metadata.narrator` of tapes on the shelf (own and sent references) and every `voiceConsent[].voice` of your own
         tapes reduced by T03's `narratorFromByline`. When the target has a recorded narrator, that name's cassette carries
         READING NOW instead.
      3. **"Someone new"** (lucide `Plus`), which reveals a text field labelled "Whose voice?" (trimmed, max 40 characters).
      "Browser voice" is checked by default. No locked "MADE VOICE · PHASE 3" cassette is rendered.
- [ ] "Make our own copy" with a name chosen (or typed) appends `&voice=<name>` (URL-encoded) to T22a's Creator URL;
      "Browser voice" appends nothing.
- [ ] The Creator reads `voice` in T15's after-mount query effect (and cleans it from the URL with the rest), stores it as
      draft-only `voiceName`, shows **"Reading as <name>"** as the Voice card's subtitle when no take is running, and
      prefills the gate's **"read by"** byline (T15) with it. The grown-up can still change the byline at the gate.
- [ ] Published result, with no change to T03's or T04b's modules: a copy of the house tape opened with `&voice=Mom`, one
      take recorded, gate passed with the prefilled byline → `metadata.author` "Island Development Crew" (T15),
      `metadata.narrator` "Mom", one `voiceConsent` record with `voice` "Mom", and the cover's meta text contains "VOICE: Mom"
      (drawn uppercase by the label CSS).
- [ ] A draft without `voiceName` behaves exactly as T15 left it (byline prefilled empty).
- [ ] `voiceName` survives autosave and restore; "Start a new story", "delete everything" and opening another tape clear
      it.
- [ ] Names are read from this device only and never sent anywhere; the name reaches a manifest only through the byline
      rules that already exist (narrator, consent).
- [ ] Keyboard: ← → move between cassettes; selecting "Someone new" moves focus to its text field; every cassette has a
      visible focus ring and an accessible name ("Browser voice, reading now", "Mia", "Someone new").

## Seams and files
Seam 1 (E2E, primary): `/read` → choose a voice → `/studio` with T15's `stubMicrophone` → publish → library read-back and
the cover (prior art: T15's `tests/vision-revoice.spec.ts` test 4, `tests/wp-studio.spec.ts` `readLibrary`). Seam 2
(Node): the pure known-voices rule. Kit `VoiceCassette` is built here per T05b (brief `design_system` LOCAL piece 6),
without its locked state.

## Files (ownership)
- `src/components/studio-kit/VoiceCassette.tsx` + `src/components/studio-kit/voice-cassette.css` — **new**.
- `src/components/player/known-voices.ts` — **new** (pure: names known on this device from shelf entries; imports T03's
  `narrator.ts` relatively).
- `src/components/player/ReadItIn.tsx` — modify (T22a's file: WHOSE VOICE row; `&voice=` on the door URL).
- `src/components/player/read-it-in.css` — modify (T22a's file: the row).
- `src/components/player/read-it-in.ts` — modify (T22a's file: append `voice`).
- `src/components/player/ReadRoom.tsx` — modify (pass shelf entries, own and sent, to the panel).
- `src/components/studio/Studio.tsx` — modify (`voice` in the query effect; `voiceName` into the gate's byline default and
  the Voice card).
- `src/components/studio/types.ts` — modify (draft-only `voiceName?: string`; cleared where `remix` is replaced).
- `src/components/studio/draft.ts` — modify (keep `voiceName` through `loadDraft`).
- `src/components/studio/ToolPanels.tsx` — modify (Voice card subtitle "Reading as <name>").
- `tests/vision-whose-voice.spec.ts` — **new** (E2E + Node block).
- `docs/vision/evidence/T22b-1140.png` — **new**.

## Existing tests that may change
- None. Without `&voice=` the Creator, the gate and publish behave exactly as T15 specifies, so T15's, T03's and T04b's
  tests and the shipped studio suites are unchanged.

## Tests (written first)
`tests/vision-whose-voice.spec.ts`:
1. Node: known voices from shelf entries [Twinkle own (narrator "Mia", consent voice "Mia, age 4 — with Mom"), Goodnight,
   Mia sent later (narrator "Grandma Rose")] → `["Grandma Rose", "Mia"]`; duplicates differing only in case collapse; at
   most four.
2. E2E: Twinkle in the library + Goodnight, Mia remembered as sent → the row reads "Browser voice", "Grandma Rose", "Mia",
   "Someone new"; with the house tape targeted "Browser voice" carries "READING NOW"; with Twinkle targeted "Mia" does.
3. E2E: house tape, "Someone new" → type "Mom" → Hush → "Make our own copy" → `/studio` with no `voice` left in the URL;
   open Voice → subtitle "Reading as Mom"; record page 1 → Finish → the gate's read-by field has value "Mom" → pass →
   library row: `metadata.narrator` "Mom", `metadata.author` "Island Development Crew", `voiceConsent` = one record for
   "Mom".
4. E2E: that tape opened by its link → the cover meta's text matches `/VOICE: Mom/i`.
5. E2E: reload the Creator before publishing → "Keep working on it" → the subtitle still reads "Reading as Mom".
6. E2E: reduced motion → the READING NOW cassette's reels have `animationName` "none".
Red first: no voice row; the read-by field is empty.

## Fidelity check
Viewport **1140×712** — state: Twinkle + a sent Goodnight, Mia on the shelf, the house tape targeted, "Browser voice"
reading now. Compare with s07's WHOSE VOICE row (`renders/s07.png` ≈ x787–1200, y343–440): cassette size, hand-lettered
names, the READING NOW label under the first. Save `docs/vision/evidence/T22b-1140.png`. Deviations to record: the locked
"MADE VOICE · PHASE 3" cassette is omitted (P3); "Mom" appears only when this device knows it or it is typed.
