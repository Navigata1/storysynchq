# T14 · Gate: "What goes into your tape" seven-layer sheet; inked consent stamp; trust line; adult self-consent option
Milestone: M3 · Reference: s04 (brief screens[3]); self-consent from s06 (brief screens[5], the "Her grown-up moment" figure) · Status in reel: Shipped (the gate) + Next (sheet, stamp, trust line, self-consent)
Type: AFK (agent can finish alone)
Blocked by: T04a, T04b (per-voice consent, `YYYY-MM-DD` dates), T13b (file order on `Studio.tsx`)   ·   Blocks: T16 (reuses `layerPresence` and the byte counter; file order on `Studio.tsx`), T18 (reply uses self-consent)  ·  (T05c/T05d: see correction below)

> **Planning correction (orchestrator):** there is no T05c/T05d ticket. Per the M0 PRD and T05b's allocation table, each kit piece is built by its first consumer. This ticket therefore **creates** the kit components it names (`src/components/studio-kit/<Name>.tsx` + a component-scoped CSS file it owns) to the brief `design_system` spec, and tests them through this ticket's page.


## Why
s04 is Jess's grown-up moment. Beside the shipped gate stands a printed sheet: "ONE FILE · SEVEN LAYERS", ".storysync",
**"What goes into your tape"**. It has seven numbered bands describing *this* story in plain words, from "Metadata —
Twinkle Came to My Window · by Mia, age 4 — with Mom · English" to "Signature — © 2026 Mia, age 4 — with Mom · personal
use", tagged "V2.1 · DRAFT".

When she ticks consent, a stamp inks onto the Signature band: **"VOICE CONSENT · GRANTED" / "PARENT/GUARDIAN · OCT 19
2026"**. Under the consent row is the promise, in label-yellow italic: **"Your child's voice never goes anywhere without
you."**

In s06, Grandma Rose records her own reply. Her gate asks **"Whose voice is on this tape?"**, with the options **"Mine —
I'm the grown-up speaking"** and **"A child's — I'm their parent or guardian"**, and she ticks **"This is my own voice,
and I'm happy to share it."** The callout: "A grown-up recording her own voice needs her own line and a record that says
'granted by self' — the schema already allows it."

Today the gate is a single glass panel. Consent changes nothing visible, and a grandparent must claim to be her own
guardian.

## Done when (acceptance, each testable)
- [ ] **Two objects.**
  - At ≥ 1024 px the dialog `getByRole("dialog", { name: "A grown-up moment" })` contains:
    - the gate, a Register-A panel up to 520 px wide;
    - the sheet, a Register-B paper sheet `section[aria-labelledby]` named "What goes into your tape", up to 480 px wide,
      with a 3px ink border and radius 14.
  - They sit side by side with a 28 px (±4) gap, centred.
  - At 1180×820 both lie fully inside the viewport and the overlay needs no scroll.
  - Below 1024 px the sheet follows the gate in one scrolling column, and `scrollWidth <= 375` at 375×812.
- [ ] **Gate copy, verbatim from s04**, ids kept (`#studio-gate-answer`, `#studio-gate-author`, `#studio-gate-consent` for
  a single voice):
  - kicker "BEFORE ANYTHING LEAVES THIS DEVICE" with a lucide `Lock`. This is a deviation: the reference's "TABLET" is
    a device the app cannot know;
  - title "A grown-up moment";
  - body "Finishing the story saves it and can make a private link to share. A child's voice is personal information, so a grown-up answers this first. Nothing has left this device yet.";
  - question "What is <a> × <b>?" with the numbers in amber at 20 px;
  - byline label "story by (optional)" (CSS uppercase), or T15's "read by (optional)" on a re-voiced tape;
  - consent sentence "I am this child's parent or guardian and I consent to sharing this recording.";
  - sub-line "This consent is written into the tape itself, so it travels with the story wherever the file goes.";
  - buttons "Not now" (lucide `Undo2`) and "Continue" (lucide `Check`);
  - footer "No trackers, no analytics. Share links are unlisted and random, and deleting the story removes the link, the pictures and the recordings."
  - A wrong answer still rotates the question. No live ✓ is shown for a right answer before Continue (deviation: a live
    tick would let a pre-reader type numbers until it turns green).
- [ ] **Trust line.** When a recorded voice exists, a Fraunces italic line in label-yellow reads exactly "Your child's
  voice never goes anywhere without you."
  - When every recorded voice is marked "Mine", it reads "Your voice never goes anywhere without you." (M3-PRD OQ 7).
  - With no recorded voice the line is absent.
- [ ] **Whose voice.** With a recorded voice, a radio group named "Whose voice is on this tape?" offers "Mine — I'm the
  grown-up speaking" and "A child's — I'm their parent or guardian". The child option is the default.
  - Choosing "Mine" changes that voice's consent sentence to "This is my own voice, and I'm happy to share it.".
  - With several recorded voices (T04b), each consent row carries its own two-option group, named
    `Whose voice is "<voice>"?`.
  - Keyboard: arrow keys move within a group, and Tab moves between groups.
- [ ] **Records.** Continue writes one `voiceConsent` record per recorded voice with that voice's own `grantedBy`
  ("self" or "parent/guardian") and the local `YYYY-MM-DD` date (T04b's rule).
  - Continue stays disabled until every row is ticked, as T04b.
  - `validateManifest(...).warnings` is `[]`.
- [ ] **The sheet.**
  - A 44 px ink header bar: mono "ONE FILE · SEVEN LAYERS" at left, Fraunces label-yellow ".storysync" at right.
  - The Fraunces 800 title "What goes into your tape".
  - The kit `PacketBands` with seven bands numbered 01–07, named Metadata, Visual, Text, Voice, Sound, Behavior,
    Signature, in the packet fills.
  - Signature has the tape-red stroke and the tag "V2.1 · DRAFT".
  - The footer "Nothing has left this device yet." with a lucide `Lock` (deviation: "device", not "tablet").
- [ ] **Band values** come from a pure tape-sheet module, so they always describe *this* draft. For the Twinkle draft with
  story by "Mia, age 4 — with Mom" and the clock pinned to 2026-10-19:
  - Metadata: "Twinkle Came to My Window · by Mia, age 4 — with Mom · English". The language name comes from
    `metadata.language` via `Intl.DisplayNames`. With no byline: "Twinkle Came to My Window · English". On a re-voiced
    tape: "<title> · by <author> · read by <reader> · English".
  - Visual: "5 pictures · about <N> KB each", where N is the mean decoded size of the page pictures rounded to the nearest
    10 KB. Also up to five 26 px thumbnails whose `src` are the page pictures in order, then "+k" when more.
    - Variants: one picture → "1 picture · about <N> KB"; none → "No pictures — words only".
  - Text: "the words on 5 pages, kept as text — never baked into the pictures".
    - Variants: one page → "the words on 1 page, …"; none → "No words — pictures and voice only".
  - Voice: "5 recordings · become AAC/M4A when you tap Continue (WAV if this browser can't make AAC)" (verbatim from the
    reference), with a lucide `AudioWaveform` (an icon, not data).
    - Variants:
      - one → "1 recording · becomes AAC/M4A when you tap Continue (WAV if this browser can't make AAC)";
      - all already published → "5 recordings · already AAC/M4A" (or "already WAV" / "already AAC/M4A and WAV");
      - none → "No recorded voice · read aloud by the browser voice".
  - Sound: "Wonder, a music box that dips under every word" (verbatim), with a lucide `Star`. The mood name comes from the
    story mood. Music off → "No music · silence under the words".
  - Behavior: "2-second pauses · the turn-the-page chime · words light up" (verbatim).
    - Varied pauses → "pauses of 2–4 seconds".
    - The chime clause drops when `settings.pageTurnSound === false`; the highlight clause drops when
      `settings.readAlongHighlight === false`.
  - Signature: "© 2026 Mia, age 4 — with Mom · personal use" (verbatim), live: typing a new byline updates Metadata and
    Signature on the next render. On a re-voiced tape it uses the original author (T15).
- [ ] **The sheet tells the truth.** After Continue, the published manifest agrees with the sheet as it stood:
  - every page's `music` equals the Sound band's mood;
  - every `timing.autoPause` equals the Behavior band's seconds;
  - `signature.ownership + " · " + signature.rights` equals the Signature band's value;
  - the number of pages with `text.audioUrl` equals the Voice band's count;
  - `metadata.title` and the byline equal the Metadata band's parts.
- [ ] **The stamp inks.** Over the Signature band's right half sits the kit `ConsentStamp`
  (`[data-sk="consent-stamp"]`).
  - It is `data-inked="false"` (invisible) until every consent row is ticked, then `data-inked="true"` with the lines
    "VOICE CONSENT · GRANTED" and "PARENT/GUARDIAN · OCT 19 2026".
    - The second line reads "SELF · OCT 19 2026" when the voice is "Mine", and "2 VOICES · OCT 19 2026" when several
      voices have mixed grantors.
    - The date is the same local date the record carries.
  - Unticking un-inks it.
  - It presses once (420 ms) and never loops. Under reduced motion it appears with `animationName` `none`.
  - It is announced once via its polite live region.
  - With no recorded voice there is no stamp.
- [ ] Continue, Not now, Escape (cancels) and the focus order (answer → byline → whose voice → consent → Not now →
  Continue) work by keyboard. The sheet has no focusable elements.
- [ ] Styling uses Tailwind utilities, plus component-scoped `parent-gate.css` only for the two-object layout breakpoint.
  No shared stylesheet is edited.
- [ ] All four gates are green.

## Seams and files
- Seam: Playwright E2E on `/studio` through the gate to the saved tape:
  - desktop and mobile projects, plus 1180×820;
  - Twinkle via T00 `seedStudioDraft` (and `{ narration: false }`, `{ voices: { 1: "Mom", 2: "Mom" } }`);
  - clock pinned with `page.clock.setFixedTime(new Date("2026-10-19T18:09:58"))`;
  - the saved manifest read from `localStorage["ssync-library"]`;
  - prior art: T04b `tests/vision-consent.spec.ts`, `tests/critic-studio.spec.ts` gate helpers.
- Modules:
  - `src/components/studio/tape-sheet.ts` (new, pure, relative imports only): `tapeSheet(input) → rows` and
    `layerPresence(manifest)`;
  - `src/lib/storysync/tape-size.ts` (new, pure): `dataUrlBytes(url)` and `tapeBytes(manifest)` (picture/voice/total
    decoded bytes; T16 adds the budget);
  - `src/lib/storysync/consent.ts` (T04b's module) gains `consentRecordsFor(choices: { voice; grantedBy }[], date)` and
    `stampDate("2026-10-19") → "OCT 19 2026"`.
- `ParentGate` props become: `defaultAuthor`, `bylineLabel`, `voices`, `sheet` (the tape-sheet input) and
  `onPass(author, consents: { voice; grantedBy }[])`. `runPublish` writes `consentRecordsFor(consents, consentDate(now))`.

## Files (ownership)
- `src/components/studio/ParentGate.tsx` (modify: layout, copy, whose-voice groups, sheet, stamp)
- `src/components/studio/parent-gate.css` (new, component-scoped: the two-object breakpoint)
- `src/components/studio/tape-sheet.ts` (new)
- `src/lib/storysync/tape-size.ts` (new; T16 appends the budget and label)
- `src/lib/storysync/consent.ts` (modify: two functions appended; T04b's module)
- `src/components/studio/Studio.tsx` (modify: gate props, `runPublish` consent signature; after T13b in file order)
- `src/components/studio-kit/PacketBands.tsx`, `src/components/studio-kit/packet-bands.css`, `src/components/studio-kit/ConsentStamp.tsx`, `src/components/studio-kit/consent-stamp.css` (modify: expose `data-inked` on the stamp, plus any consumer adjustment to the s04 look; owned by T05c)
- `tests/vision-gate-sheet.spec.ts` (new)
- `agent_docs/decisions.md` (append one entry; shared, append-only)

## Existing tests that may change
None should change. They depend on hooks this ticket keeps:
- `tests/wp-studio.spec.ts:190–220` and `tests/critic-studio.spec.ts:220–240`:
  - `label[for="studio-gate-answer"]` with "a × b";
  - `#studio-gate-answer`, `#studio-gate-consent`;
  - "Continue", and the dialog name "A grown-up moment".
- `tests/critic-studio.spec.ts:340–358`: Enter in the answer field does not pass while consent is unticked. Kept, and the
  default grantor stays "parent/guardian".
- `tests/wp-studio.spec.ts:278–281`: one record, `grantedBy` "parent/guardian", `date` truthy. Kept.
- T04b's `tests/vision-consent.spec.ts`: the single-voice checkbox count stays 1, because the whose-voice controls are
  radios. Two voices give two checkboxes. Records are unchanged at the default.

## Tests (written first)
`tests/vision-gate-sheet.spec.ts`:
1. Layout:
   - at 1180×820, the gate and sheet boxes are side by side, with a gap of 24–32, both inside the viewport, and overlay
     `scrollHeight <= clientHeight`;
   - at 375×812 the sheet's top ≥ the gate's bottom, and `scrollWidth <= 375`.
2. Copy: every gate string listed above, verbatim (the kicker by innerText, uppercase).
3. Sheet for Twinkle with the byline typed:
   - the header, title, footer and "V2.1 · DRAFT";
   - seven bands in order, numbered 01–07, with the exact values above. Visual's N is computed in the test from the
     seeded picture data URLs; there are 5 thumbnails with matching `src`;
   - retyping the byline as "Ada" → Metadata ends "· by Ada · English" and Signature "© 2026 Ada · personal use".
4. Truth: Continue → library manifest checks listed under "The sheet tells the truth", against band text captured before
   Continue.
5. Stamp:
   - unticked → `data-inked="false"`;
   - tick → `data-inked="true"`, lines "VOICE CONSENT · GRANTED" / "PARENT/GUARDIAN · OCT 19 2026";
   - untick → false.
   - Under reduced motion it is inked with `animationName` `none`.
6. Self-consent:
   - choose "Mine — I'm the grown-up speaking" → the sentence becomes "This is my own voice, and I'm happy to share it.";
   - the trust line is "Your voice never goes anywhere without you.";
   - tick → stamp "SELF · OCT 19 2026";
   - Continue with byline "Grandma Rose" → `voiceConsent` deep-equals `[{ voice: "Grandma Rose", grantedBy: "self", date: "2026-10-19" }]`.
7. Two voices (`voices: { 1: "Mom", 2: "Mom" }`):
   - two groups named `Whose voice is "Mom"?` and `Whose voice is "Mia, age 4 — with Mom"?`;
   - mark Mom "Mine", tick both → stamp "2 VOICES · OCT 19 2026";
   - records `[{ Mom, self }, { Mia…, parent/guardian }]`, in order.
8. No voice (`narration: false`):
   - no radio, no checkbox, no trust line, no stamp;
   - Voice band "No recorded voice · read aloud by the browser voice";
   - Continue publishes.
9. Keyboard: the Tab order as listed; Escape closes and returns to the Studio with nothing saved.

Red first:
- 1–7 fail on today's single panel.
- 8 partly passes today (no checkbox) and fails on the sheet.

## Fidelity check
- Viewport 1180×820 (the s04 tablet).
- State: the Twinkle draft, "Finish my story", answer correct, story by "Mia, age 4 — with Mom", consent ticked (stamp
  inked), clock pinned to 2026-10-19.
- Reference crops in `docs/vision/reference/renders/s04.png`:
  - the gate about x338–805, y145–792: kicker, title, body, question, input, byline, consent box, trust line, buttons,
    footer;
  - the sheet about x833–1260, y145–790: header bar, title, spine with chips 01–07, seven bands, the Visual thumbnails,
    the Voice waveform glyph, the Sound star, the Signature stroke + "V2.1 · DRAFT" + inked stamp, footer.
- Deviations to note:
  - "DEVICE" for "TABLET";
  - generic Visual and Text wording, without the cast's credits;
  - no live ✓ on the answer;
  - the whose-voice group is present (s06), where s04 shows a child-only gate. It defaults to the child option, so the
    s04 state is unchanged apart from the group.
- Save `docs/vision/evidence/T14.png`, `T14-self.png` (s06 figure state: "Mine" selected, stamp "SELF") and `T14-375.png`.
