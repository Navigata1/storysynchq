# T19 · READ THIS teleprompter card while recording
Milestone: M4 · Reference: s06 phone 2 (brief screens[5]); also s03 realism ("Words do not light during a take") · Status in reel: Next
Type: AFK (agent can finish alone)
Blocked by: T00 (Goodnight, Mia draft fixture), T13a (docked Voice card, listening ring, room fit; file order on `ToolPanels.tsx`), T15 (`tests/fixtures/mic.ts`), T18 (file order on `Studio.tsx`)   ·   Blocks: T22b (file order on `Studio.tsx`), T24a (file order on `ToolPanels.tsx`), T25

## Why
s06 phone 2 shows Grandma mid-take: her window photo inside the tape-red listening ring, a "Listening… 0:05" pill,
and under the Stage "the READ THIS card (paper, 3px ink border, radius 14, padding 14): mono 10.5px tape-red label,
then Fraunces 600 22px/1.35 ink — her own words, no highlight", then the round Stop button ("Stop — 0:05"). Today the
words sit in the Stage's text box, which on a phone is covered by the Voice sheet the moment recording starts, so a
grown-up reading a page aloud has nothing to read from. The card is a teleprompter, not read-along: s03 is explicit
that words do not light during a take, because that "would need on-device speech alignment".

## Done when (acceptance, each testable)
- [ ] While a take is recording and the Voice panel is open, the panel shows, **above** the Stop button, a card
      `data-studio="read-this"`:
      Register B paper (`--ss-paper`), 3 px solid ink border, radius 14 px, padding 14 px;
      a label row with a small tape-red dot and the text **"READ THIS"** (mono, 10.5 px, uppercase, `--ss-red`);
      the active page's words **verbatim** (same string as the page's `text.content`, whitespace preserved as
      paragraphs) in Fraunces weight 600, 22 px at ≤ 480 px wide (fluid up to 28 px on wider panels), line-height 1.35,
      colour `--ss-ink`.
- [ ] No word inside the card carries a highlight class or style (no `.is-now`/`.is-past`, one text colour); nothing
      in it animates or changes while the take runs.
- [ ] The card is absent when not recording, and absent while recording a page with no words (no empty card, no
      placeholder text).
- [ ] The card is a labelled region (`role="note"`, accessible name "Read this") and is not focusable; the Stop button
      keeps focus order and stays the only button named `/^Stop —/`.
- [ ] Long words scroll inside the card (max-height ≈ 40 % of the viewport height on phones), never pushing the Stop
      button off-screen: at **390×844** and **375×812**, with the Goodnight, Mia draft recording, the card's and the
      Stop button's bounding boxes are both fully inside the viewport and do not intersect each other.
- [ ] The Stage is unchanged during the take (Stage = Player): the page text box keeps its value, and after Stop the
      words are still exactly as typed.
- [ ] Under `prefers-reduced-motion: reduce` the card appears with no transition (`animationName` "none").
- [ ] Desktop/tablet: the same card renders inside T13a's Voice card (the docked column at ≥ 1024 px, the floating card
      at 768–1023 px) above the Stop button, fully visible at 1180×820; T13a's room-fit assertion
      (`scrollHeight <= innerHeight`, photo + filmstrip + transport inside the viewport) still passes at 1180×820, 1280×720
      and 1024×768 **during a take with the card showing** (the card scrolls inside itself rather than growing the room).

## Seams and files
Seam: E2E on `/studio` with a seeded draft and the deterministic microphone (T15's `tests/fixtures/mic.ts`
`stubMicrophone`; prior art `fakeMic` in `tests/critic-studio.spec.ts`; T00's `seedStudioDraft`).
`Studio.tsx` passes the active page's `text.content` to the Voice panel; the panel renders the card only when
`recording && words.trim()`. Card styles live in a new component-scoped stylesheet (no Tailwind arbitrary soup for the
paper card; tokens from T05a only).

## Files (ownership)
- `src/components/studio/ToolPanels.tsx` — modify (VoicePanel: `pageWords` prop + READ THIS card while recording).
- `src/components/studio/read-this.css` — **new**, owned by T19 (card look; scroll; reduced-motion state).
- `src/components/studio/Studio.tsx` — modify (pass the active page's words to `VoicePanel`).
- `tests/vision-read-this.spec.ts` — **new** (E2E).
- `docs/vision/evidence/T19-390.png`, `T19-1180.png` — **new**.

## Existing tests that may change
- None. Must keep passing unchanged: T13a's `tests/vision-studio-room.spec.ts` room-fit and
  "words stay still during a take" checks (the card is outside the Stage), `tests/critic-studio.spec.ts` › "the keyboard cannot turn the page while the mic is
  live" and "the meter does not re-serialize the manifest" (the `/^Stop —/` button stays unique; the card adds no
  serialization), `tests/wp-studio.spec.ts` recording test (Stop from the Voice panel's big red button,
  "Close Voice"), every test that types into `textarea` (`tests/creator-v2.spec.ts`).

## Tests (written first)
`tests/vision-read-this.spec.ts` (desktop + mobile projects, plus explicit 390×844 and 1180×820):
1. Seed Goodnight, Mia as a Studio draft without narration (`seedStudioDraft(page, "goodnight-mia", { narration: false })`),
   `restoreDraft`, fake mic → start a take from the transport → `[data-studio="read-this"]` is visible, its text equals
   "Goodnight, my brave little star. I'll look for Twinkle at my window tonight. Love, Grandma." (from the facts
   module, not a literal), the label reads "READ THIS".
2. Computed styles: card background `rgb(255, 253, 246)`, border 3 px `rgb(30, 26, 22)`, radius 14 px; text
   `font-weight` 600, family contains Fraunces, `font-size` ≥ 22 px, line-height ratio 1.35 ± 0.02; label colour
   `rgb(227, 69, 47)`.
3. No highlight: every descendant's computed `color` equals the text colour; no `.is-now`/`.is-past` elements.
4. At 390×844 and 375×812: card and `/^Stop —/` button boxes inside the viewport, non-intersecting. At 1180×820 during
   the take: `document.documentElement.scrollHeight <= innerHeight` and the card's box does not intersect the Stage photo.
5. Stop → card gone; the Stage textarea still holds the same words; `.studio[data-recording='true']` count 0.
6. A page with no words → recording shows no card.
7. Reduced motion → card `animationName` "none".
Red first: no card exists.

## Fidelity check
Viewport **390×844** — state: Goodnight, Mia draft (picture + words, no voice yet), a take running for ~5 s with the
Voice panel open. Compare with s06 phone 2 (`renders/s06.png` ≈ x841–1200, y162–938, scale .92; READ THIS card ≈
x855–1187, y535–690; Stop ≈ y700–830): paper card proportions, label, type size, card above the round Stop. Save
`docs/vision/evidence/T19-390.png`; also **1180×820** → `T19-1180.png`. Deviations to record: no "Next" chip; the
card lives in the Voice sheet (above Stop) rather than in the Stage, so the Stage stays exactly what the Player shows;
the reference's codec line under Stop ("DRAFT · AAC — …") is not part of this ticket.
