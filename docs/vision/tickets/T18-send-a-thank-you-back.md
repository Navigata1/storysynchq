# T18 · "Send a thank-you back" → one-page reply in the Creator, `signature.replyTo`, "Reply to · <title>" chip
Milestone: M4 · Reference: s06 phone 1 (end card) + phone 2 (Creator) (brief screens[5]) · Status in reel: Next
Type: AFK (agent can finish alone)
Blocked by: T00 (Twinkle + Goodnight, Mia fixtures), T03 (narrator), T04a + T04b (consent protocol, per-voice records), T12 (the end-card component this adds to; file order on `Player.tsx`), T14 (adult self-consent, `grantedBy: "self"`), T15 (after-mount query entry, `OpenTapeDialog`, `tests/fixtures/mic.ts`; file order on `ReadRoom.tsx`), T17 (file order on `Studio.tsx`, the last M3 editor)   ·   Blocks: T20a (file order on `ReadRoom.tsx`), T21 (file order on `Player.tsx`), T19 (file order on `Studio.tsx`), T25

## Why
s06's second callout: "THE LOOP RUNS BOTH WAYS — The end card turns a listener into a maker. Grandma's one page
becomes its own tape and goes back by text message, onto Mia's shelf." Phone 1 draws a gold "Send a thank-you back"
button under the J-card with the line "Record one page in your voice. It goes back to Mia as her own little tape.";
"Make your own story" steps down to a gold outline beside "Read it again". Phone 2 is Grandma's one-page Creator with a
violet "Reply to · Twinkle Came to My Window" chip under the top bar. HANDOFF §5 adds "`signature.replyTo` (share URL
or id of the tape this answers) … distinct from `remixOf`", so the answer is in the file, not only in the app.

## Done when (acceptance, each testable)
- [ ] **Spec first.** `docs/format-spec.md` §7 lists `replyTo` ("share URL or id of the tape this one answers; a reply
      is a new tape, not a derivative, so it is distinct from `remixOf`"); `public/protocol/v2.schema.json` gains
      `signature.replyTo` (`type: string`, with that description; additive); `SsyncSignature` in
      `src/lib/storysync/manifest.ts` gains `replyTo?: string`; `tests/storysync-roundtrip.spec.ts` proves a manifest
      with `signature.replyTo` packs and unpacks with the value intact; `validateManifest` is unchanged for it (no new
      error or warning); one entry is appended to `agent_docs/decisions.md`.
- [ ] A pure reply-seed helper maps an answered tape (+ the link it was opened from, if any) to
      `{ name, title, chipTitle, replyTo }`:
      `name` = `metadata.narrator`, else T03's lead name of `metadata.author`, else undefined;
      `title` = "Thank you, <name>" or "Thank you";
      `chipTitle` = the answered tape's title;
      `replyTo` = the answered tape's `signature.shareUrl`, else the opened link, else undefined.
      For Twinkle opened at `/read?story=<code>`: `{ name: "Mia", title: "Thank you, Mia", chipTitle: "Twinkle Came to
      My Window", replyTo: "<origin>/read?story=<code>" }`.
- [ ] **End card.** When the tape was opened from a link or a file (any origin except the house tape), the end card
      shows, after the J-card's last row and before the action pair, a gold large full-width button
      **"Send a thank-you back"** (lucide `Mic`), and under it the 12.5 px line
      **"Record one page in your voice. It goes back to Mia as its own little tape."** (the name from the seed; with no
      name: "Record one page in your voice. It goes back as its own little tape."). The pair below reads **"Read it
      again"** (ghost, lucide `Repeat`) and **"Make your own story"** (gold outline, lucide `Star`); the reply button is
      now the only filled gold action. On the house tape (`/read?demo=1`) no reply button and no line are rendered, and
      the end card is exactly T12's.
- [ ] Activating "Send a thank-you back" (click or Enter) stops narration and music, writes the seed as a one-shot
      `sessionStorage` entry (`ssync-reply-seed`: name, title, chip title, `replyTo` — strings only) and navigates to
      `/studio?reply=1`. The Creator reads the seed after mount (T15's query effect), removes the entry, cleans the URL
      with `history.replaceState`, and opens on a draft with **exactly one** blank page (no picture, no words, no
      voice), title input value **"Thank you, Mia"**,
      music on with the default mood, and a violet chip **"Reply to · Twinkle Came to My Window"** (lucide `Heart`,
      `data-studio="reply-to"`) directly under the top bar at every width. The draft's manifest carries
      `signature.replyTo`; the chip title is draft-only state and never appears in a published manifest.
- [ ] **Never lose a story.** When the current draft has content, the reply does not replace it silently: T15's
      `OpenTapeDialog` appears, named **"Reply to Twinkle Came to My Window?"**, with T15's body text and the buttons
      "Keep my story" (the draft stays byte-identical; the seed is discarded) and **"Start the reply"**. When the reply
      arrives with a saved draft, this dialog takes the place of the restore prompt, as T15's does for `?open=`.
- [ ] `/studio?reply=1` with no seed in `sessionStorage` (a refresh, a pasted URL) opens the Creator exactly as `/studio`
      does today.
- [ ] The chip survives autosave and the restore prompt ("Keep working on it" brings it back); "Start a new story" or
      "delete everything" clears it.
- [ ] Publishing the reply (photo + words + one take, grown-up gate with the "Mine — I'm the grown-up speaking" option,
      T14) writes a library row whose `ssyncData` has 1 page, `signature.replyTo` equal to the Twinkle link, no
      `remixOf`, and one `voiceConsent` record with `grantedBy: "self"` and a `YYYY-MM-DD` date.
- [ ] A reply opened from a `.storysync` file without a `shareUrl` still opens the reply draft and the chip, and the
      published reply has **no** `replyTo` key (nothing invented).
- [ ] Keyboard: on the end card, Tab order is J-card link → "Send a thank-you back" → "Read it again" → "Make your own
      story" → Close; every control shows the kit focus ring. At 375×812 and 390×844 the end card still scrolls inside
      itself with no horizontal overflow, and the reply button is ≥ 56 px tall.
- [ ] Nothing new is fetched or counted; nothing new is stored beyond the existing draft key and the one-shot
      `sessionStorage` seed, which is removed as soon as the Creator reads it.

## Seams and files
Seam 1 (E2E, primary): `/read?story=<code>` with T00's Twinkle seeded in the device library → walk to the end card →
reply → `/studio` → publish → read the library back (prior art: `tests/wp-player.spec.ts` end-card walk,
`tests/wp-studio.spec.ts` `readLibrary`; T15's `tests/fixtures/mic.ts` `stubMicrophone`). Seam 2 (Node): the reply-seed helper and the `replyTo`
round trip (prior art: `tests/storysync-roundtrip.spec.ts`).
The Read Room passes an `onReply` callback (with the seed) to the Player for every origin except `demo`; the Player
forwards it to T12's end-card component. The seed is a few strings, so it travels as a one-shot `sessionStorage` entry
rather than through T15's `?open=` (which loads a whole tape); the Studio reads it in the same after-mount query effect T15
adds, sets the one-page manifest (with `signature.replyTo`) and a draft-only `reply: { title }` in Studio state, and
renders the chip. The replace confirmation reuses T15's `OpenTapeDialog`. Publish already
spreads the draft's `signature` into the published one, so `replyTo` travels without a publish-path change (assert it).

## Files (ownership)
- `docs/format-spec.md` — modify (§7, one sentence).
- `public/protocol/v2.schema.json` — modify (`signature.replyTo`).
- `src/lib/storysync/manifest.ts` — modify (`SsyncSignature.replyTo`).
- `src/lib/storysync/reply.ts` — **new** (pure reply seed; imports T03's `narrator.ts` relatively).
- `src/components/player/EndCard.tsx` — modify (T12's file: optional reply action + line; "Make your own story" to gold
  outline when the reply shows).
- `src/components/player/end-card.css` — modify (T12's file: reply button block and line spacing).
- `src/components/player/Player.tsx` — modify (`onReply` prop passed to the end card).
- `src/components/player/ReadRoom.tsx` — modify (build the seed from the manifest + `shareUrl`; write the one-shot
  `sessionStorage` seed and navigate to `/studio?reply=1`; not for origin `demo`).
- `src/components/studio/Studio.tsx` — modify (`?reply=1` in T15's query effect; seed → one-page draft; dialog wiring;
  chip under the top bar).
- `src/components/studio/OpenTapeDialog.tsx` — modify (T15's file: optional title / confirm-label props only, defaults
  unchanged).
- `src/components/studio/types.ts` — modify (draft-only `reply?: { title: string }` in `StudioState`; `blankState`
  leaves it undefined).
- `src/components/studio/draft.ts` — modify (keep `reply` through `loadDraft`'s merge).
- `src/components/studio/reply-chip.css` — **new**, owned by T18 (chip placement under the top bar at phone/tablet).
- `tests/storysync-roundtrip.spec.ts` — modify (add one `replyTo` round-trip test; existing tests untouched).
- `tests/vision-reply.spec.ts` — **new** (E2E + Node block for the seed).
- `agent_docs/decisions.md` — append one entry.
- `docs/vision/evidence/T18-endcard-390.png`, `T18-creator-390.png` — **new**.

## Existing tests that may change
- `tests/vision-reader-end-card.spec.ts` (T12): if it asserts that "Make your own story" is the filled gold action or a
  Tab order without the reply button, those two assertions change for link-opened tapes only, because s06 phone 1 draws
  the reply as the gold action and "Make your own story" in gold outline. The house-tape variant keeps T12's assertions.
- Must keep passing unchanged: `tests/wp-player.spec.ts` › end card (`/Make your own story/i` button still present,
  title unique), `tests/critic-player.spec.ts:490` and the exact-share-URL QR test, `tests/fable-pass.spec.ts`
  (`/Make your own/` on the house tape — no reply button there), every `tests/wp-studio.spec.ts` /
  `tests/critic-studio.spec.ts` publish test (a draft without `reply` publishes exactly as today).

## Tests (written first)
`tests/vision-reply.spec.ts`:
1. Node: reply seed for Twinkle (link) → the exact object above; for Goodnight, Mia (narrator "Grandma Rose") →
   name "Grandma Rose", title "Thank you, Grandma Rose"; a tape with no narrator and no author → title "Thank you",
   name undefined; a tape carrying `signature.shareUrl` → that URL wins over the opened link; no URL anywhere →
   `replyTo` undefined.
2. Node (in `tests/storysync-roundtrip.spec.ts`): `signature.replyTo` survives `packStorysync` → `unpackStorysync`.
3. E2E (desktop + mobile): seed Twinkle with `seedDeviceLibrary(page, "twinkle", { shareCode })`, open
   `/read?story=<code>`, Tap to Begin, walk to the end with ArrowRight → button "Send a thank-you back" and the line
   "Record one page in your voice. It goes back to Mia as its own little tape." are visible; "Make your own story" has a
   transparent background and a gold border (computed styles); Tab order as above.
4. E2E: click it → URL ends `/studio` (the `?reply=1` flag cleaned); `sessionStorage` no longer holds
   `ssync-reply-seed`; `[data-studio="reply-to"]` reads "Reply to · Twinkle Came to My Window"; the
   filmstrip has exactly one frame; `#studio-title` has value "Thank you, Mia"; reload → restore prompt → "Keep working
   on it" → the chip is still there.
5. E2E: with T15's `stubMicrophone`, add a picture (T00 drawing via the file input), type words, record a take, Finish →
   gate (answer, "Mine — I'm the grown-up speaking", consent) → the newest library row has 1 page,
   `signature.replyTo` = the Twinkle link, no `remixOf`, `voiceConsent[0].grantedBy` "self".
6. E2E: `/read?demo=1` walked to the end → `getByRole("button", { name: "Send a thank-you back" })` has count 0.
7. E2E: Twinkle opened through `openTapeInReadRoom` (file, no shareUrl) → reply → publish → no `replyTo` key.
8. E2E: `seedStudioDraft(page, "goodnight-mia")` in the same context, then the reply from Twinkle's end card → the dialog
   "Reply to Twinkle Came to My Window?" (no restore prompt); "Keep my story" → the stored draft is unchanged and no chip;
   repeat with "Start the reply" → one page and the chip.
9. E2E: `/studio?reply=1` typed directly with nothing in `sessionStorage` → the Creator as today (no chip).
Red first: no reply button, no `replyTo` type or schema field, no chip.

## Fidelity check
- Viewport **390×844**, state 1: Twinkle opened as a link, end card, scrolled so the J-card's last row and the reply
  block are in view. Compare with s06 phone 1 (`renders/s06.png` ≈ x416–775, y162–938, scale .92; reply block ≈
  y615–760): gold `--lg` reply button full width, line under it, ghost + gold-outline pair. Save
  `docs/vision/evidence/T18-endcard-390.png`.
- Viewport **390×844**, state 2: the reply Creator just opened (before any photo). Compare with s06 phone 2
  (≈ x841–1200, y162–938): top bar, the violet chip under it at y≈112. Save `docs/vision/evidence/T18-creator-390.png`.
- Deviations to record: "its own little tape" (M4-PRD OQ 5); no "Next"/"Idea" chips; title prefilled "Thank you, Mia"
  where the reference shows Grandma's own title "Goodnight, Mia"; "Finish my story" keeps its shipped label on the phone.
