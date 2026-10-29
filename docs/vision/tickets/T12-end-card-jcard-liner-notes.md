# T12 · End-card J-card liner notes + "What's inside this tape?" → /protocol
Milestone: M2 · Reference: s06 phone 1 (brief screens[5]) · Status in reel: Next
Type: AFK (agent can finish alone)
Blocked by: T00 (Twinkle fixture), T04a (consent dates as `YYYY-MM-DD`), T04b (one record per voice), T05a (tokens + kit file layout), T05b (allocates JCard to this ticket), T10 (music plan), T09b (file order on `Player.tsx`)   ·   Blocks: T18 (adds "Send a thank-you back" to this end card), T23 (the link's destination), T25

## Why
s06's callout: "LINER NOTES — The Signature layer printed like the card inside a cassette case: who made it, whose
voice, and the consent that travels inside the file." The reference end card prints PICTURES, WORDS, VOICE, MUSIC,
MADE IN, OWNER and CONSENT ("given by a parent or guardian · Oct 19, 2026 · written into this tape") and ends in
"What's inside this tape? →", which is how Marco reaches `/protocol` in s08 ("FROM 'WHAT'S INSIDE THIS TAPE?'").
The realism note: "the J-card (the signature fields exist; no listener sees them today)". The card also says the
thing a parent most needs to read: "Nobody is counting plays. This page has no trackers."

## Done when (acceptance, each testable)
- [ ] A pure liner-notes module maps a manifest to ordered J-card rows `{ key, value }`, using only what the tape
      carries, and omits a row with no data:
      PICTURES "<n> pictures" ("1 picture"); WORDS "<w> words on <p> pages"; VOICE — any recorded page → the
      narrator, else "A recorded voice"; no recording → "Read by the browser voice"; MUSIC — the distinct moods in
      page order (via the T10 music plan), e.g. "Wonder · Adventure · Calm", none → "No music — a quiet tape";
      MADE IN — only when the tape carries a making time (none do today, see M2-PRD OQ 3); OWNER —
      `signature.ownership` + " · " + `signature.rights`; CONSENT — one line per `voiceConsent` record:
      "given by a parent or guardian · Oct 19, 2026 · written into this tape" (`grantedBy` "parent/guardian"),
      "given by the speaker, for their own voice · …" (`grantedBy` "self"), any other `grantedBy` verbatim; dates
      `YYYY-MM-DD` formatted as "Mon D, YYYY" in UTC (a legacy ISO timestamp uses its date part); with several
      records each line starts with the voice name; a recorded voice with no record → "No consent record in this
      tape"; no recorded voice and no record → row omitted.
- [ ] For the Twinkle fixture the rows read, verbatim: "5 pictures", "35 words on 5 pages", "Mia", "Wonder",
      "© 2026 Mia, age 4 — with Mom · personal use", "given by a parent or guardian · Oct 19, 2026 · written into
      this tape". For the house tape: "7 pictures", "184 words on 8 pages" (re-counted from the JSON in the test),
      "Read by the browser voice", "Wonder · Adventure · Calm"; no OWNER, no CONSENT row.
- [ ] The end card (`data-pl="end"`, still `role="dialog"`, name "The end") shows, in order: the TapeLabel
      (title, author, "SIDE A COMPLETE · N PAGES · ~m:ss") with a 52 px sticker of the last pictured page tilted
      6° on its right edge (decorative, `aria-hidden`; omitted for a tape without pictures); the J-card (Register B:
      paper, 3 px ink border, label-yellow spine with the vertical title + " · SIDE A", key/value rows, mood shown as
      a mood tape chip with its lucide icon, a small tape-red ring glyph on the CONSENT row, a 6 px tape-red stripe);
      as the J-card's last row a link **"What's inside this tape?"** (with a decorative arrow) to `/protocol`;
      "Read it again" and "Make your own story" side by side at ≥ 360 px (stacked below); the QR row when opened
      from a link with the heading "PASS IT ON · POINT A PHONE AT THIS" and the exact share URL; the shipped Close
      chip; and the line "Nobody is counting plays. This page has no trackers." (mono, muted).
- [ ] The title appears **once** as DOM text on the end card (the label): the spine's text is drawn from a data
      attribute via generated content and is `aria-hidden`, so `getByText(<title>)` stays unique.
- [ ] Activating "What's inside this tape?" (click or Enter) navigates to `/protocol` and its h1 "One file holds the
      whole storybook." is visible.
- [ ] Keyboard: from the end card, Tab reaches the link, Read it again, Make your own story and Close in that
      order, each with the kit focus ring; Escape still exits as today.
- [ ] At 375×812 and 390×844 the whole end card is reachable by scrolling inside it, with no horizontal overflow;
      under reduced motion it appears without the rise animation.
- [ ] "Make your own story" stays the one filled gold action until T18 adds the reply button (T18 demotes it to the
      reference's gold outline); no reply button, no "Keep it on this phone", no Idea chip is rendered here.
- [ ] Nothing new is fetched, counted or stored.

## Seams and files
Seam 1 (Node): the pure liner-notes module against the Twinkle fixture and the house tape JSON. Seam 2 (E2E):
`/read` → walk to the end card (ArrowRight, as the shipped end-card tests do) → assert rows, link, order, layout.
The end card moves out of `Player.tsx` into its own component that receives the manifest, runtime label, share
URL/QR and callbacks; the existing `.pl-end*`/`.pl-qr*` classes and `data-pl` hooks are kept. A new kit `JCard`
renders the rows: this ticket is its first consumer, so it builds it (M0 allocation rule) to the brief's
`design_system` (10): paper insert, 3 px ink border, radius 10, 24 px label-yellow spine with vertical mono 9.5 px
text, mono 9.5 px uppercase keys at 55% ink + Geist 12.5 px values with hairlines, 6 px tape-red bottom stripe. The
MUSIC value is a small inline mood tag (lucide icon + name in the mood colour), not the full mood tape chip, which
T05b allocates to its own first consumer.

## Files (ownership)
- `src/components/player/liner-notes.ts` — **new** (pure).
- `src/components/player/EndCard.tsx` — **new** (end card: label + sticker, JCard, actions, QR, privacy line, close).
- `src/components/player/end-card.css` — **new**, owned by T12 (sticker, J-card placement, action row, privacy line).
- `src/components/player/Player.tsx` — modify: render `EndCard` instead of the inline end card.
- `src/components/studio-kit/JCard.tsx` + its component-scoped stylesheet — **new** (file naming per T05a's
  one-file-per-component kit layout; the kit barrel and `kit.css` are not edited).
- `tests/vision-liner-notes.spec.ts` — **new** (Node).
- `tests/vision-reader-end-card.spec.ts` — **new** (E2E).
- `tests/fixtures/reader-tapes.ts` — modify: add a two-voice consent tape (one "parent/guardian", one "self") and a
  recorded tape with no consent record. Twinkle comes from T00 (`loadTape("twinkle")` for the Node test,
  `seedDeviceLibrary(page, "twinkle", { shareCode })` for the E2E).
- `docs/vision/evidence/T12-390.png`, `T12-1280.png` — **new**.

## Existing tests that may change
- None. Must keep passing unchanged: `tests/wp-player.spec.ts` › "the end card" (`end.getByText("The Brave Little
  Star")` must stay unique — hence the generated-content spine; Read it again / Make your own story buttons; no
  `[data-pl="qr"]` without `?story=`; Read it again returns to page 1) and "with ?story= present the end card carries
  a QR"; `tests/critic-player.spec.ts` › end card with audio removed (`[data-sk="tape"]` visible) and "the end-card
  QR encodes the exact share URL" (reads `.pl-qr-url` and expects `page.url()` byte for byte — keep the class and
  the full URL); `tests/fable-pass.spec.ts` › "mashing next … reach the end card" (`/Make your own/`).

## Tests (written first)
1. `tests/vision-liner-notes.spec.ts` (Node): Twinkle rows verbatim (above); house tape rows; "self" wording;
   two-voice tape → two prefixed lines; legacy timestamp date → "Oct 19, 2026"; recorded without record →
   "No consent record in this tape"; empty signature → OWNER/CONSENT omitted; "2026-10-19" formats as
   "Oct 19, 2026" whatever the machine's timezone (the formatter reads UTC parts only; run the suite once with
   `TZ=America/Los_Angeles` to prove it); the house tape counts 7 pictures and 184 words on 8 pages.
2. `tests/vision-reader-end-card.spec.ts` (E2E, desktop + mobile): seed Twinkle with T00's
   `seedDeviceLibrary(page, "twinkle", { shareCode })`, open `/read?story=<shareCode>`, walk to
   the end → J-card keys PICTURES/WORDS/VOICE/MUSIC/OWNER/CONSENT with the exact values; the link's name and href;
   click → `/protocol` h1; the privacy line; title unique; tab order; 390×844 scroll reaches the last line with no
   horizontal overflow; reduced motion → no animation on the end card's inner panel.
Red first: no J-card on the end card.

## Fidelity check
Viewport **390×844** — state: Twinkle fixture opened as a shared link (`?story=` so the QR shows), walked to the end
card, scrolled to top. Compare with s06 phone 1 (`renders/s06.png` ≈ x416–775, y162–938, drawn at scale .92):
label + sticker, J-card proportions and rows, action pair, QR row, privacy line. Save
`docs/vision/evidence/T12-390.png`; also **1280×720** → `T12-1280.png`. Deviations to record: no "Send a thank-you
back" (T18), no "Keep it on this phone" (Idea), PICTURES/WORDS values derived (M2-PRD OQ 2), no MADE IN row
(OQ 3), spine without a family name, QR shows the full URL (OQ 5), VOICE shows the narrator "Mia" (as on the s05
cover) where the s06 J-card prints the author line.
