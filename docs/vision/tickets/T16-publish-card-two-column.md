# T16 · Publish card: two-column, first page on the label, layer chips, size meter, "Pull the tape out — delete everything"
Milestone: M3 · Reference: s05 (brief screens[4]), the tablet half · Status in reel: Shipped (printing label, Made in, steps, link, Copy, QR, Share, unlisted note, download, delete) + Next (landscape card, drawing on the label, layer chips, size meter, pull-the-tape delete)
Type: AFK (agent can finish alone)
Blocked by: T05b (aligned `TapeLabel`), T14 (`layerPresence`, `tapeBytes`; file order on `Studio.tsx`)   ·   Blocks: T17 (file order on `Studio.tsx`; T17's step renders in this card)  ·  (T05c/T05d: see correction below)

> **Planning correction (orchestrator):** there is no T05c/T05d ticket. Per the M0 PRD and T05b's allocation table, each kit piece is built by its first consumer. This ticket therefore **creates** the kit components it names (`src/components/studio-kit/<Name>.tsx` + a component-scoped CSS file it owns) to the brief `design_system` spec, and tests them through this ticket's page.


## Why
s05 opens at 6:11 on the family's tablet. Mia's tape has just come out of the print slot. Its label shows her drawing 1
beside "Twinkle Came to My Window", "by Mia, age 4 — with Mom", "SIDE A · 5 PAGES · 0:24 · AAC/M4A" and "SSYNC 2.0 ·
SHARED UNLISTED". Under it is a row of seven layer chips with "consent written".

The card is landscape, in two columns:
- **Left:** "Your tape is ready" with "MADE IN 7:48", the finished steps, a size meter "2.0 MB OF 15 MB" (PICTURES /
  VOICES), "Download the .storysync file", "Back to the studio", and the delete drawn as **"Pull the tape out — delete
  everything"** with "a small cassette with a tape-brown loop spilling out".
- **Right:** "PRIVATE LINK", the URL with Copy, the paper QR "POINT A PHONE CAMERA HERE", "Share the link…", and
  "Unlisted and unguessable…".

Design direction: "A published story is a *labeled tape*. Deleting is *pulling the tape out*."

Today the card is a tall single column (the label, then a glass panel) that scrolls at 820 px. The label carries no
picture, there are no chips or meter, and delete is a dustbin glyph.

## Done when (acceptance, each testable)
- [ ] **Two columns that fit.**
  - At ≥ 1024 px the published card has `[data-studio="publish-left"]` and `[data-studio="publish-right"]` side by side
    (right.x ≥ left.right + 24).
  - At 1180×820 the whole published state needs no scroll: print slot, label, chips and card are all inside the viewport,
    and overlay `scrollHeight <= clientHeight`.
  - Below 1024 px it is one column in this order: heading + Made in, steps, the right column (link, Copy, QR, Share, note),
    size meter, Download, Back, delete, fine print. Sharing comes before deleting on a phone. At 375×812,
    `scrollWidth <= 375`.
- [ ] **Printed out of a slot.**
  - A kit `PrintSlot` (`[data-sk="print-slot"]`) sits above the `TapeLabel`, and the label's top edge is tucked under it
    (label.top < slot.bottom).
  - The existing print-in animation still runs, and is `none` under reduced motion.
- [ ] **The child's first page on the label.**
  - `TapeLabel` gains an optional, additive `inset` slot that renders identically when absent.
  - The card passes a 72×72 image (`[data-studio="label-inset"]`) with a 2px ink border and radius 6. Its `src` equals
    the published `pages[0].illustration.url` and its `alt` is that page's alt.
  - No inset when page 1 has no picture.
  - Label meta is unchanged in content: "SIDE A · 5 PAGES · 0:24 · <codec>" and "SSYNC 2.0 · <SHARED UNLISTED | LINKED ON
    THIS DEVICE | ON THIS DEVICE>".
- [ ] **Layer chips.** Under the label is the kit `LayerChips`: `ul[aria-label="Layers in this tape"]` with seven items in
  order Metadata, Visual, Text, Voice, Sound, Behavior, Signature.
  - Each item is lit when T14's `layerPresence(published manifest)` says the layer is present, and hollow otherwise
    (`data-present`).
  - When `signature.voiceConsent` is non-empty, a gold note follows: "← consent written". The arrow is a lucide
    `ArrowLeft`; the text is exactly "consent written".
  - A tape with no recorded voice shows Voice hollow and no note.
- [ ] **Left column.**
  - The heading "Your tape is ready".
  - `[data-studio="made-in"]` with the text "Made in m:ss", CSS uppercase, with a lucide `Timer`.
  - The finished step list (mono 13 px; done = gold check dot, error = red, pending = hollow dotted ring), carrying the
    same steps and details as the publishing phase: "Converting voices to AAC · 5/5", "Assembling the SSYNC manifest · 5
    pages", "Saving your tape · this device".
  - The size meter.
  - "Download the .storysync file" (gold, full width, lucide `Download`).
  - "Back to the studio" (ghost, lucide `Undo2`).
  - The delete control.
  - The fine print "Delete removes the pictures, the recordings, the saved copy and the link. Nothing is kept in an archive."
- [ ] **Size meter.** The kit `SizeMeter` takes `pictureBytes` / `voiceBytes` from `tapeBytes(published manifest)` and the
  budget `TAPE_BUDGET_BYTES` (15 × 1,048,576).
  - Its label and `aria-valuetext` read `<x.y> MB OF 15 MB` from `formatTapeSize(total)`.
  - `role="meter"` with `aria-valuemax` = budget and `aria-valuenow` = total.
  - The legend reads "PICTURES" / "VOICES".
  - Over budget, the label turns tape-red and `aria-valuetext` appends " · over the 15 MB budget". Nothing is blocked.
- [ ] **Pull the tape out.**
  - The delete is a ghost button with a tape-red outline. Its accessible name is exactly "Pull the tape out — delete
    everything", and it contains the kit `PullTapeIcon`.
  - The first tap changes it to "Tap again to delete everything" (red, as today). The second tap deletes every copy, the
    draft and the link (today's `deleteEverything`).
  - After delete, `/read?story=<code>` shows "We couldn't find that tape".
- [ ] **Right column, verbatim.**
  - Mono label "private link" (CSS uppercase "PRIVATE LINK").
  - The URL input `[data-studio="share-url"]` (mono) with an amber-outline "Copy" (lucide `Copy`).
  - The paper QR block: `[data-studio="share-qr"]` ≥ 120 px, mono "point a phone camera here" (uppercase), and "Grandparents do not need the app, an account, or the file — the camera app opens the story in any browser.".
  - "Share the link…" (violet, lucide `Share`) only where Web Share exists.
  - The note "Unlisted and unguessable. Only someone holding this link can open the story — deleting the story revokes it." in cloud mode, and today's device-mode sentence otherwise.
  - The signed-out / no-cloud states (today's honest copy and the sign-in panel) render in the right column in place of
    the link.
- [ ] **Honesty.** No "Next" chip anywhere in the card, and no "planned" step. T17 adds the real levelling step.
- [ ] The publishing phase (the printing dialog with spinning reel and live steps) is unchanged.
- [ ] The new CSS is in a component-scoped `publish-card.css`.
- [ ] All four gates are green.

## Seams and files
- Primary seam: Playwright E2E on `/studio` through the gate to the published card:
  - desktop and mobile projects, plus 1180×820;
  - Twinkle via T00 `seedStudioDraft`; T00 `seedStudioDraft(..., { narration: false })` for the no-voice case;
  - the library read back from `localStorage["ssync-library"]`;
  - prior art: `tests/wp-studio.spec.ts`, `tests/critic-studio.spec.ts`.
- Secondary seam: one Node block for the byte math. `tapeBytes(loadTape("twinkle").story)` equals the sum of the asset
  byte lengths in `unpackStorysync(buildStorysyncFromStory(story)).assets`, split by `assets/page-*` vs
  `assets/narration-*`. `formatTapeSize` turns 2,097,152 into "2.0 MB OF 15 MB".
- `PublishCard` gains these props: `firstPicture?: { src; alt }`, `layers: Record<LayerName, boolean>`, `consentWritten`
  and `size: { pictureBytes; voiceBytes; totalBytes }`. `Studio` derives them from `publishedRef.current`.

## Files (ownership)
- `src/components/studio/PublishCard.tsx` (modify: published layout, chips, meter, delete, inset)
- `src/components/studio/publish-card.css` (new, component-scoped: two-column grid, phone order, slot tuck)
- `src/components/studio-kit/kit.tsx` (modify: `TapeLabel` optional `inset` prop only; additive)
- `src/lib/storysync/tape-size.ts` (modify: append `TAPE_BUDGET_BYTES`, `formatTapeSize`; created by T14)
- `src/components/studio/Studio.tsx` (modify: PublishCard props; after T14 in file order)
- `src/components/studio-kit/SizeMeter.tsx`, `src/components/studio-kit/LayerChips.tsx`, `src/components/studio-kit/PrintSlot.tsx` (modify: `LayerChips` exposes `data-present` per chip and takes a presence map; `PullTapeIcon` keeps `data-sk="pull-tape-icon"`; plus any consumer adjustment to the s05 look; owned by T05c)
- `tests/vision-publish-card.spec.ts` (new)
- `agent_docs/decisions.md` (append one entry; shared, append-only)

## Existing tests that may change
Both changes are needed because the reference renames the control to "Pull the tape out — delete everything". Neither
test is weakened; the second-tap step "Tap again to delete everything" and every post-delete assertion stay as they are.
- `tests/critic-studio.spec.ts:324`: `getByRole("button", { name: /^Delete everything$/ })` becomes `{ name: "Pull the tape out — delete everything" }`.
- `tests/wp-studio.spec.ts:315`: `getByRole("button", { name: /Delete everything/ })` becomes `{ name: /Pull the tape out — delete everything/ }`. This one is case-sensitive, so it no longer matches the new lowercase "delete everything".

Unchanged hooks that other assertions rely on:
- `[data-studio="share-url" | "share-qr" | "made-in"]`;
- the "Made in m:ss" text (`tests/wp-studio.spec.ts:268`, `tests/critic-studio.spec.ts:264`);
- QR width ≥ 120 (`tests/critic-studio.spec.ts:277`);
- `getByText(/SIDE A · 2 PAGES/)` (`tests/critic-studio.spec.ts:282`);
- "Download the .storysync file", "Back to the studio", "Your tape is ready" and "Tap again to delete everything".

## Tests (written first)
`tests/vision-publish-card.spec.ts`:
1. Layout at 1180×820 (Twinkle, published):
   - left and right side by side;
   - slot, label, chips and card inside the viewport;
   - overlay needs no scroll.
   - At 375×812: the DOM-visual order heading → steps → share-url → meter → Download → Back → delete, compared by
     `boundingBox().y`; `scrollWidth <= 375`.
2. Slot and inset:
   - `[data-sk="print-slot"]` above the label, with label.top < slot.bottom;
   - inset 72×72 with a 2px ink border, `src` === the library `pages[0].illustration.url`.
3. Chips:
   - seven `li` in order;
   - `data-present` all "true" for Twinkle;
   - the note "consent written" is visible.
   - The no-voice tape → Voice `data-present="false"` and no note.
4. Steps in the ready card: three `li` with done state and the exact texts "Converting voices to AAC · 5/5", "Assembling
   the SSYNC manifest · 5 pages", "Saving your tape · this device".
5. Meter: compute the expected total in the test from the library manifest's data URLs (decoded base64 lengths) →
   `role=meter` `aria-valuetext` === `${(total / 1048576).toFixed(1)} MB OF 15 MB`, and the visible label is the same
   text.
6. Delete:
   - the name is exactly "Pull the tape out — delete everything", and it contains `[data-sk="pull-tape-icon"]`;
   - click → "Tap again to delete everything" → click → library `[]`;
   - `/read?story=<code>` → "We couldn't find that tape".
7. Copy: every right-column string verbatim. `navigator.share` is stubbed to show "Share the link…".
8. Honesty: inside the card, `getByText(/^Next$/)` and `getByText(/planned/)` both have count 0.
9. Node: the `tapeBytes` / `formatTapeSize` block described in Seams.

Red first: 1–8 fail on today's single column. 9 fails because the budget export does not exist yet.

## Fidelity check
- Viewport 1180×820 (the s05 tablet).
- State: the Twinkle draft published with story by "Mia, age 4 — with Mom" and consent (T00 seed `startedAgoS` 468 →
  "MADE IN 7:48"). `navigator.share` is stubbed so the Share button shows.
- Reference crops in `docs/vision/reference/renders/s05.png`:
  - slot and label: about x245–730, y58–197;
  - chips: about x197–780, y213–235;
  - card: about x70–905, y245–652;
  - left column: about x88–475;
  - right column: about x500–886.
- Expected differences, to record as deviations:
  - the meta reads WAV in this environment's Chromium, which has no AAC encoder;
  - the URL is a 32-hex local code (T02);
  - there is no "Evening out each voice · planned" row or "Next" chips (T17 adds the real step);
  - the reference's 2.0 MB is illustrative; ours is the fixture's real size.
- Save `docs/vision/evidence/T16.png`, `T16-375.png` and `T16-no-voice.png`.
