# T04b · Consent per recorded voice, dated `YYYY-MM-DD`, written by the Creator
Milestone: M0 · Reference: s04 (brief screens[3]) · Status in reel: Shipped (gate) + Next (one record per voice)
Type: AFK (agent can finish alone)
Blocked by: T00, T03 (file order on the publish assembly in `Studio.tsx`), T04a   ·   Blocks: T12, T14, T18
Split from T04. T04a changes the protocol; T04b makes the Creator write it.

## Why
s04 is Jess's grown-up moment. She answers 7 × 6 and ticks "I am this child's parent or guardian and I consent to sharing this recording." The callout explains what that tick does: it "writes signature.voiceConsent into manifest.json: voice 'Mia, age 4 — with Mom', granted by parent/guardian, dated."

The honest-gap callout names today's shortcut: "ONE RECORD TODAY — The Creator writes one consent record named after 'story by' … A record per voice comes next." Today's record is also dated with a full timestamp.

When a tape carries more than one voice, the parent must consent to each one, and the file must carry one record per voice with the calendar date she gave it. That happens today when a tape is imported (T15) or a reply is recorded (T18).

## Done when (acceptance, each testable)
- [ ] A new pure module provides `recordedVoices`, `consentDate` and `consentRecords`.
  - `recordedVoices(pages, byline)` returns the ordered, distinct voice names of pages that carry `text.audioUrl`. The key per page is `text.voice?.trim()`, then `byline.trim()`, then `"narrator"`.
  - `consentDate(date)` returns the local calendar date as `YYYY-MM-DD`, from `getFullYear` / `getMonth` / `getDate`, never `toISOString`.
  - `consentRecords(voices, grantedBy, date)` returns `[{ voice, grantedBy, date }]` in voice order.
- [ ] One recorded voice, the reference case. With the Twinkle draft (5 recorded pages, no `text.voice`), story by "Mia, age 4 — with Mom", and the clock pinned to 2026-10-19 18:09:58 local:
  - the gate shows exactly one consent row with the reference copy verbatim: "I am this child's parent or guardian and I consent to sharing this recording.";
  - beneath the row: "This consent is written into the tape itself, so it travels with the story wherever the file goes.";
  - the control keeps `id="studio-gate-consent"`;
  - the published tape carries `signature.voiceConsent` deep-equal to `[{ "voice": "Mia, age 4 — with Mom", "grantedBy": "parent/guardian", "date": "2026-10-19" }]`.
- [ ] Late-evening local date. With the clock pinned to 23:30 local on 2026-10-19 in a timezone where that is already 2026-10-20 UTC (run the page with `timezoneId: "America/Los_Angeles"`), the record's `date` is `"2026-10-19"`.
- [ ] Two recorded voices. With the Twinkle draft seeded with `voices: { 1: "Mom", 2: "Mom" }`, pages 3–5 keyed by the byline:
  - the gate shows two consent rows, in order "Mom", then "Mia, age 4 — with Mom";
  - each row shows the voice name as a mono label above the reference sentence;
  - "Continue" stays disabled, and pressing Enter in the answer field does not pass, until both are ticked;
  - the published tape carries two records, in that order, with the same date.
- [ ] No recorded voice. With the `narration: false` draft, no consent row is shown and the published tape has no `voiceConsent` key. Ownership "© <year> <story by>" and rights "personal use" are still written, as today.
- [ ] The publish never writes a timestamp into `voiceConsent[].date`. `validateManifest(published).warnings` (T04a) is empty for every case above.
- [ ] Ownership, rights and `shareUrl` behave exactly as today: `© <year> <author>` or `© <year>`, and "personal use".
- [ ] The gate's other copy is unchanged and verbatim from s04:
  - "A grown-up moment";
  - "Finishing the story saves it and can make a private link to share. A child's voice is personal information, so a grown-up answers this first. Nothing has left this device yet.";
  - "STORY BY (OPTIONAL)" (CSS uppercases "story by (optional)");
  - "Not now" / "Continue";
  - "No trackers, no analytics. Share links are unlisted and random, and deleting the story removes the link, the pictures and the recordings."
- [ ] The decision log entry notes Open Questions 6 and 7.
- [ ] All four gates are green.

## Seams and files
- Primary seam: Playwright E2E on `/studio` through the gate to the saved tape (desktop + mobile).
  - Seeded with T00 `seedStudioDraft`.
  - The time is pinned with `page.clock.setFixedTime(...)`.
  - The saved manifest is read from `localStorage["ssync-library"]` (prior art: `tests/critic-studio.spec.ts` consent probe).
- Module: `src/lib/storysync/consent.ts` (new, pure). Its rules are covered through the E2E outcomes, so this ticket needs no second seam.
- Gate: `ParentGate` takes `voices: string[]` in place of the boolean `requireConsent`, where `requireConsent` = `voices.length > 0`. It renders one row per voice and calls `onPass(author, consentedVoices)`.
- Creator: `runPublish` collects `recordedVoices(publishedPages, author)` and writes `consentRecords(voices, "parent/guardian", consentDate(now))`. `consentRef` becomes the list of consented voices, which retry needs.
- Styling uses Tailwind utilities only. No stylesheet is edited.

## Tests (written first)
`tests/vision-consent.spec.ts`:
1. Single voice:
   - clock 2026-10-19T18:09:58 local;
   - seed Twinkle, restore, then "Finish my story";
   - one `input[type=checkbox]` in the dialog "A grown-up moment", with the verbatim sentence;
   - answer, story by "Mia, age 4 — with Mom", tick, Continue → library `voiceConsent` deep-equals the reference record with `date: "2026-10-19"`.
2. Late evening:
   - `test.use({ timezoneId: "America/Los_Angeles" })`, clock 2026-10-19T23:30:00-07:00;
   - same flow → `date: "2026-10-19"`.
3. Two voices:
   - seed with `voices: { 1: "Mom", 2: "Mom" }`;
   - two checkboxes, labelled with "Mom" and "Mia, age 4 — with Mom";
   - tick only the first → Continue disabled; Enter in `#studio-gate-answer` keeps the dialog open; the library stays empty;
   - tick the second → published with two records in order.
4. No voice: the `narration: false` seed → no checkbox in the gate; the published tape has no `voiceConsent`; `ownership` matches `/^© \d{4}/`.
5. In every case, import `validateManifest` in the test, run it on the saved `ssyncData` (whose data URLs are fine for validation) and expect `warnings` to equal `[]`.

Red first: 1 and 2 fail on the timestamp; 3 fails on one row and one record; 4 passes today (a guard); 5 fails while dates are timestamps.

## Fidelity check
- Viewport 1180×820 (the s04 tablet).
- State: the Twinkle draft with "Finish my story" tapped; the gate answered "42" if the challenge is 7×6 (otherwise any correct answer); story by "Mia, age 4 — with Mom"; consent ticked.
- Reference crop: the left gate panel in `docs/vision/reference/renders/s04.png`, about x338–805, y145–792.
- Copy and order must match. The seven-layer sheet, the inked stamp and the italic trust line belong to T14 and are absent here.
- Save `docs/vision/evidence/T04b.png`, plus a two-voice variant `docs/vision/evidence/T04b-two-voices.png` (no reference exists; record that as a deviation note).

## Files (ownership)
- `src/lib/storysync/consent.ts` (new)
- `src/components/studio/ParentGate.tsx` (modify: voices prop, per-voice rows; the layout stays as is because T14 redesigns it)
- `src/components/studio/Studio.tsx` (modify: gate props, `runPublish` signature block, retry ref; after T03 in file order)
- `tests/vision-consent.spec.ts` (new)
- `agent_docs/decisions.md` (append one entry; shared, append-only)

## Existing tests that may change
Behaviour is unchanged for single-voice tapes, so none of these need editing:
- `tests/critic-studio.spec.ts:340–358`:
  - `#studio-gate-consent` is still the single-voice control;
  - `expect(consent).toHaveLength(1)` still holds;
  - `Date.parse(consent[0].date)` is still finite for `YYYY-MM-DD`;
  - `grantedBy` is still "parent/guardian".
- `tests/critic-studio.spec.ts:420`: one record. Holds.
- `tests/wp-studio.spec.ts:278–281`: one record, `grantedBy` "parent/guardian", `date` truthy. Holds.
- Only `tests/critic-studio.spec.ts` and `tests/wp-studio.spec.ts` drive the parental gate (by search for "grown-up" / "studio-gate"). `tests/creator-v2.spec.ts:34,39` drives the `/classic` app's own "Grown-ups only" gate, which is untouched. The gate's ids and labels are kept, so all of them still apply.
- If a builder finds any test asserting the ISO timestamp shape of `date` (none found by search), it changes because the reference requires a date. Record the reason in the commit.
