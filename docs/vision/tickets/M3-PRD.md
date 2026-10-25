# M3 · Creator Simple + publish (s03, s04, s05) — PRD

Reference screens:
- **s03 · Snap. Tell. Hear it.** → `/studio` Simple mode (tablet 1180×820, brief `screens[2]`, editorial "Shipped, plus next").
- **s04 · A grown-up moment** → `ParentGate` (tablet 1180×820, brief `screens[3]`, "Shipped, plus next").
- **s05 · One link, Grandma's iPhone** → `PublishCard` only (tablet 1180×820, brief `screens[4]`, "Shipped, plus next"). The iPhone Reader half of s05 belongs to M2 (T03, T09).

Tickets: **T15, T13a, T13b, T14, T16, T17**. HANDOFF §9's T13 is split in two (T13a room, T13b tape), because one ticket
covering the rail, the Stage, the Voice card, the viewport fit and the filmstrip would not fit one fresh context window.
Ids and titles are otherwise as HANDOFF §9.

Contract: `docs/vision/HANDOFF.md` §4 (s03–s05), §5, §6, §7, §9 M3. Where this PRD disagrees with `CLAUDE.md`, `PRIVACY.md`
or `docs/format-spec.md`, those win.

## Problem Statement

A four-year-old and her mum sit at the kitchen table with five crayon drawings. Today's Creator gets them most of the way,
but at the tablet size the reel is drawn for it falls short in ways they feel:

- **The room does not fit the tablet.** At 1180×820 a page with a photo makes the Stage taller than the screen. The
  filmstrip and the big transport sit below the fold, about 1,500 px down. A child cannot see her pages and her record
  button at the same time.
- **Four equal tools.** Photo, Voice, Music and Magic are four identical emoji tiles. The reel's point, "the voice is the
  moat", is that three friendly tools come first and Magic sits apart, quieter.
- **The Stage is a black box.** The Player puts every picture in a room lit by its own colours. The Stage shows the same
  picture on black, edge to edge. "Stage = Player" holds for the content but not for the light.
- **Recording paints the whole monitor red.** The tape-red ring should hug the photo the child is talking about. The
  Voice card floats over the Stage and covers it, and it never says that the pages stay put.
- **The filmstrip is thumbnails, not tape.** Nothing shows that gentle music was added for her ("WONDER · GENTLE MUSIC
  ADDED FOR YOU").
- **The grown-up moment asks for trust without showing what is being trusted.** Jess answers 7 × 6 and ticks consent, but
  she never sees what goes into the tape in plain words: seven layers, five recordings that will become AAC, the music,
  the pauses, the signature. Ticking consent does nothing visible. There is no promise that "Your child's voice never
  goes anywhere without you."
- **A grandparent cannot consent to her own voice.** Grandma recording a reply is asked to swear she is "this child's
  parent or guardian".
- **The printed tape is a tall single column.** At 820 px tall it scrolls. The label does not carry the child's first
  drawing. Nothing shows the seven layers, that consent was written, or how big the tape is against the format's 15 MB
  budget. Delete is a dustbin, not "pulling the tape out".
- **Uneven voices.** Mia whispers page 4 and shouts page 1. The tape plays them as recorded, so Grandma turns the volume
  up and down all story long.
- **No tape can be re-voiced.** The wedge is "Make any storybook read itself in the voice and mood you choose", and
  "Google cannot read this in your voice." Yet the Creator cannot open a `.storysync`, not even the house tape, so no
  tape can be read again in your own voice.

## Solution

Six vertical slices on the shipped Creator. They run in one strict order, because all six edit `Studio.tsx`:

1. **T15 — the Creator opens a tape to re-voice it.**
   - Entry points: "Open a tape" (a local `.storysync` file), `/studio?open=house` (the house tape) and `/studio?open=<code>`
     (a tape this device or the cloud resolves by its share code, exactly as `/read?story=` does).
   - Pictures, words, timing and the mood carry over. Pictures fetched from the app are inlined, so the result is
     self-contained.
   - Every recorded voice, voice name and signature from the source is dropped. Nobody re-shares another person's voice,
     and consent never travels to a tape it was not given for.
   - The original author keeps the credit. The gate's byline becomes "read by", which names the narrator and the consent
     voice. `signature.remixOf` records the source.
   - A page you record plays your voice. Every other page keeps the browser voice.
   - It goes first because M4's "Send a thank-you back" (T18) and "Read it in…" (T22) build on it.
2. **T13a — the room fits and borrows the light.**
   - Simple mode fits the viewport at tablet and desktop sizes.
   - The rail shows three friendly tools, a divider, and a quieter Magic tile.
   - The Stage's picture zone is lit by the page's own blurred picture, as the Player's room is: static, never looping.
     The photo is centred with a radius and shadow.
   - While recording, a tape-red listening ring hugs the photo with a "Listening… 0:05" pill and a "recording" chip.
   - At ≥ 1024 px the open tool card docks as a column beside the Stage instead of covering it.
   - The Voice card says "Pages stay put while you record."
   - The microphone-off copy matches the reference word for word.
   - While recording, Finish shows "after this take".
3. **T13b — the filmstrip is a strip of tape.**
   - The frames ride a tape-brown ribbon.
   - Voice badges are a red mic. The add tile is "Snap the next drawing", which adds a page and opens the camera.
   - The frame being recorded carries a static red dot. While recording, the move controls collapse to a locked "move" pill.
   - An 8 px mood lane runs under the frames, one segment per page in the mood's colour, labelled
     "WONDER · GENTLE MUSIC ADDED FOR YOU". The lane is per page, so T24's per-page moods simply fill it.
4. **T14 — the grown-up moment shows what goes into the tape.**
   - Beside the gate is a printed Register-B sheet, "What goes into your tape", with seven numbered bands describing
     *this* story in plain words. The bands update live as "story by" changes and tell exactly what Continue will write.
   - Ticking consent inks the stamp "VOICE CONSENT · GRANTED / PARENT/GUARDIAN · OCT 19 2026" on the Signature band.
   - The trust line reads "Your child's voice never goes anywhere without you."
   - "Whose voice is on this tape?" lets a grown-up consent to her own voice ("This is my own voice, and I'm happy to
     share it."), recorded as `grantedBy: "self"`.
5. **T16 — the printed tape, landscape.** The label comes out of a print slot carrying the child's first drawing. Under
   it sit the seven layer chips with "consent written". Below that is a two-column card:
   - left: the heading, "MADE IN 7:48", the finished step list, a size meter "2.0 MB OF 15 MB", Download, Back, and
     "Pull the tape out — delete everything";
   - right: the private link, Copy, the QR, "Share the link…", and the unlisted note.

   At 1180×820 it fits without scrolling. On a phone it is one column with the link before the delete.
6. **T17 — "Evening out each voice".**
   - Before AAC conversion, each recording is measured and brought to one target loudness, with gentle limiting so
     nothing clips.
   - It is a real first step in the publish list ("Evening out each voice · 5/5"), with an on/off switch in the
     Inspector's Mix section.
   - A clip is levelled at most once.
   - A clip that cannot be decoded, or an AAC clip on a browser that cannot re-encode AAC, is published exactly as
     recorded, and the step says so.
   - `/classic` is untouched.

## User Stories

1. As a child at a tablet, I want my pages, my picture and the big record button on one screen, so that I never have to scroll to find them.
2. As a child, I want three big tools (Photo, Voice, Music) first, so that I can tell my story without a menu.
3. As a parent, I want Magic present but set apart and quieter, so that my child's own voice and drawings stay the point.
4. As a child, I want my drawing to light the Stage the way it lights the story when Grandma plays it, so that what I make looks like what she will see.
5. As a child recording, I want a red ring around my picture and a "Listening… 0:05" pill, so that I know the tablet is listening to me about this page.
6. As a child recording, I want the words to stay still while I talk, so that nothing pretends to follow my voice before it can.
7. As a parent, I want the Voice card beside the Stage, not on top of it, so that the picture my child is describing stays visible.
8. As a parent, I want to read "Pages stay put while you record.", so that I understand why the filmstrip will not move mid-take.
9. As a parent whose microphone is blocked, I want plain instructions naming the lock or microphone icon, so that I can fix it without guessing.
10. As a child, I want the pages drawn as a strip of tape with a red mic on the ones I have told, so that I can see which pages still need my voice.
11. As a parent, I want a coloured mood lane saying "WONDER · GENTLE MUSIC ADDED FOR YOU", so that I know music is there without opening a panel.
12. As a child, I want "Snap the next drawing" to add a page and open the camera in one tap, so that the next drawing is one step away.
13. As a parent at the grown-up moment, I want a printed sheet listing the seven layers of this tape in plain words, so that I know exactly what I am about to share.
14. As a parent, I want the sheet to match what is written into the file (pauses, music, recordings, signature), so that the sheet is a promise and not a decoration.
15. As a parent, I want ticking consent to ink a stamp on the Signature band, so that I can see that my consent went into the tape.
16. As a parent, I want to read "Your child's voice never goes anywhere without you.", so that I trust the next step.
17. As a grandparent recording my own voice, I want to answer "Mine — I'm the grown-up speaking", so that I am not asked to swear I am a child's guardian.
18. As a grandparent, I want my consent recorded as granted by myself, so that the file states the truth about whose permission it carries.
19. As a parent with a story of two voices, I want to choose for each voice whose it is, so that every record in the file is accurate.
20. As a parent at the printed tape, I want the label to show my child's first drawing, so that the tape looks like hers.
21. As a parent, I want to see the seven layers and "consent written" under the label, so that I can confirm what the file carries.
22. As a parent, I want a meter showing how big the tape is against 15 MB, so that I know it will travel by text and email.
23. As a parent on a tablet, I want the printed tape, the link and the QR on one screen, so that I can hand it over without scrolling.
24. As a parent on a phone, I want the link and QR before the delete button, so that sharing comes first and deleting is deliberate.
25. As a parent, I want delete drawn as "Pull the tape out — delete everything" and to need two taps, so that it is unmistakable and never accidental.
26. As a grandparent listening, I want every page at the same loudness, so that I do not ride the volume through the story.
27. As a parent, I want to switch voice levelling off in Advanced, so that a recording I mixed myself is published as it is.
28. As a parent, I want the publish list to say what happened to each voice ("Evening out each voice · 5/5", or which were left as recorded), so that nothing is hidden.
29. As a family, I want to open the house tape in the Creator and read it in our own voices, so that "Google cannot read this in your voice" becomes true for us.
30. As a parent, I want to open a `.storysync` file from this device in the Creator, so that any tape can be re-voiced.
31. As a parent opening someone else's tape, I want their recorded voices left behind, so that I never re-share a child's voice without that family's consent.
32. As a story's original author, I want the re-voiced tape to keep my name as author and to record where it came from, so that credit is not lost.
33. As a reader re-voicing a tape, I want my name to appear as the narrator and on the consent record, so that listeners know whose voice it is.
34. As a parent with a story in progress, I want to be asked before an opened tape replaces it, so that I never lose my child's work by accident.
35. As a keyboard or screen-reader user, I want the rail, the sheet, the stamp, the switches and the delete control reachable and labelled, so that the Creator stays accessible.
36. As a user with reduced motion, I want the ring, the stamp, the print slot and the ribbon to appear without animating, so that the room stays still.

## Implementation Decisions

**Order and shared files.** `Studio.tsx` is one 1,193-line file and every M3 ticket edits it. The chain is strict:
**T04b (M0) → T15 → T13a → T13b → T14 → T16 → T17**. Each ticket lists its predecessor as a file-order blocker on top
of the HANDOFF §9 blockers. New CSS goes in component-scoped files each ticket owns: `stage.css`, `tool-rail.css`,
`filmstrip.css`, `parent-gate.css`, `publish-card.css`. The Studio's shell stylesheet is edited only where the grid itself
must change: T13a's viewport fit and docking, and T13b's deletion of the superseded strip rules, which are region-disjoint
and sequential.

**Modules (new pure modules use relative imports only, so Node-side tests import them directly, like the player's timing
module):**

- **Tape source (new, storysync library; T15).**
  - Moves the Read Room's permissive manifest reader (v1 documents, cloud rows and old builds) and its device-library
    lookup out of the Read Room, unchanged. The Read Room imports them back, so there is one resolver for "what tape
    does this code mean".
  - Exports the house tape's URL and a `loadTapeByCode` that tries the cloud by share code first, then this device.
- **Re-voice (new, pure; T15).** Turns any source manifest into a Creator draft manifest:
  - version 2.0, metadata kept (title, author, language, description), `created` set to now;
  - `narrator` and `coverImage` dropped;
  - the signature dropped entirely;
  - pages renumbered 1…n, keeping illustration, words, word highlight, timing and unknown fields;
  - `audioUrl`, `audioCodec`, `voice` and per-page `music` removed;
  - settings kept.

  It also returns:
  - the story mood: the first page's music through `resolveMood`, or Wonder;
  - whether music was on (any page had music);
  - a remix record `{ of, title, author }`, where `of` is the source's `signature.shareUrl`, else the app URL it was
    loaded from (the house tape), else the text `"<title>" by <author>`.
- **Tape opener (new, client; T15).**
  - Reads a `.storysync` with the container's loader, entirely on this device.
  - Fetches the house tape JSON and inlines each picture through the shipped image pipeline (EXIF-safe, ≤ 2048 px,
    JPEG).
  - Feeds both to re-voice.
  - The Studio reads `?open=` after mount (`window.location`, no search-params hook), so the route stays static and needs
    no Suspense boundary.
- **Studio state (T15, T17).** Gains two draft-only fields, neither ever written into a manifest:
  - `remix` (the record above, or null);
  - `levelVoices` (default true).

  `RecordingMeta` gains `levelled?: boolean`. Old drafts load because the draft loader merges over a blank state.
- **Publish assembly (T15, T14, T17), in `runPublish`.**
  - For a re-voiced tape, `metadata.author` stays the original. The gate's byline is the reader: it feeds T03's narrator
    rule and T04b's consent voice. Ownership is `© <year> <original author>` and `signature.remixOf` is set.
  - Consent records carry each voice's own `grantedBy` (T14).
  - Levelling runs inside the existing per-clip normalization loop (T17).
- **Tape sheet (new, pure, studio-side; T14).** Maps (draft manifest, story mood, music on, byline, re-voice record,
  picture byte sizes) to the seven plain-words rows the gate's sheet prints. It also maps a manifest to which of the
  seven layers it carries (`layerPresence`), which T16's chips reuse.
  - Wording is fixed by the reference wherever the reference has it:
    - Voice: "5 recordings · become AAC/M4A when you tap Continue (WAV if this browser can't make AAC)";
    - Sound: "Wonder, a music box that dips under every word". Every mood has the music-box line and the 12 dB duck, so
      this stays true for all eight moods;
    - Behavior: "2-second pauses · the turn-the-page chime · words light up";
    - Signature: "© 2026 Mia, age 4 — with Mom · personal use".
  - Where the reference names the cast ("Mia's drawings", "typed by Mom"), the app prints only what it knows: "5
    pictures · about 110 KB each" and "the words on 5 pages, kept as text — never baked into the pictures".
- **Consent (modify T04b's module; T14).** Adds per-voice grantors: records are built from (voice, grantedBy) pairs,
  still dated `YYYY-MM-DD` local. A formatter prints the stamp date "OCT 19 2026".
- **Tape size (new, pure).** Built in two steps:
  - T14 creates `tapeBytes(manifest)`, which returns `{ pictureBytes, voiceBytes, totalBytes }`. It counts the decoded
    bytes of every data-URL picture (cover included) and voice, which is exactly the asset bytes the container will hold.
    The sheet's "about N KB each" uses it.
  - T16 adds `TAPE_BUDGET_BYTES` = 15 × 1,048,576 (format-spec §5) and a formatter giving "2.0 MB OF 15 MB".

  Over budget is shown, never blocked.
- **Voice levelling (new, pure DSP; T17).** Works on mono `Float32Array` PCM:
  - an active-RMS measure: 50 ms windows, windows under −50 dBFS ignored;
  - a gain toward a target of −20 dBFS RMS, clamped to −12…+15 dB, and skipped when |gain| < 0.5 dB, which makes it
    idempotent;
  - a gentle soft-knee limiter: knee at −6 dBFS, ceiling −1 dBFS, never above.
  - WAV is levelled on its own PCM in place, with sample rate and length kept.
  - The browser's OfflineAudioContext only decodes and resamples (it already does in the transcode module). No
    DynamicsCompressorNode is used, because its output differs between browsers and cannot be pinned in Node.
- **Transcode (modify; T17).** `normalizeNarration` gains an optional `{ level }` option. Without it, behaviour is
  byte-for-byte today's, which keeps `/classic` untouched. With it:
  - WAV → levelled WAV;
  - draft Opus/WebM → decode, level, then AAC or WAV (one pass, no extra transcode);
  - AAC passthrough → decode, level, re-encode AAC only when the browser can encode AAC, otherwise left as recorded.
    It never degrades to WAV just to level.
  - Any decode failure → the original clip, unchanged.

  It reports per clip: applied (with gain dB), unchanged (already at target), or skipped (with a reason).
- **Components.**
  - **Rail (T13a):** lucide icons; three 92 px tools, a separator, a 64 px Magic tile.
  - **Stage (T13a):** ambient backdrop layer, centred photo, the kit `ListeningRing` from T05d, the "recording" chip, the
    status row with the story mood.
  - **Voice card (T13a):** lock row, verbatim microphone help.
  - **Filmstrip (T13b):** the kit `TapeRibbon` from T05c, the mood lane, the Snap tile, the locked move pill.
  - **ParentGate (T14):** two objects, gate plus sheet. The kit `PacketBands` and `ConsentStamp` come from T05c. The
    whose-voice radio group.
  - **Open-tape dialog (T15, new):** the replace confirmation.
  - **PublishCard (T16):** two columns, the kit `PrintSlot`, `PullTapeIcon`, `LayerChips` and `SizeMeter` from T05c.
    `TapeLabel` gains an optional, additive `inset` slot; it renders identically when the slot is absent.
  - **Inspector (T17):** an "Evening out each voice" switch in Mix.
- **Copy rules.** No status chips on anything M3 builds; doctrine says shipped things carry none. The reference's
  "AMBIENT LIGHT · Next", the delete's "Next" chip and "Evening out each voice · planned · Next" are not rendered. Device
  words the app cannot know become "device": "BEFORE ANYTHING LEAVES THIS DEVICE", "Nothing has left this device yet."
- **No new runtime dependencies.** No network beyond what exists: the house tape JSON and pictures come from this app's
  `/public`, and `?open=<code>` uses the same cloud read as `/read?story=`. Nothing is uploaded before the gate.

## Testing Decisions

- **Seams.** The existing highest seams only:
  - **Playwright E2E** on `/studio` (desktop 1280×720 and mobile 375×812 projects, plus explicit 1180×820 for the
    reference tablet). This is the primary seam of every M3 ticket.
  - **Node-side Playwright** for pure `src/lib` and studio-side modules. Prior art: `tests/storysync-roundtrip.spec.ts`
    and the M0/M2 pure-module tests.
  - Where a ticket has a pure core with edge cases a browser cannot reach cheaply, a small Node block pins them, with the
    E2E still the acceptance: T15 re-voice, T16 byte math, T17 DSP.
- **What is tested is behaviour:**
  - geometry a child depends on (everything on one screen, the card beside the Stage, the Magic tile smaller and apart);
  - what the gate's sheet says against what the published manifest actually carries;
  - the records written (`grantedBy: "self"`, per-voice grantors, `remixOf`, author vs narrator);
  - the bytes published (levelled RMS within ±1 dB of target, peaks ≤ −1 dBFS, byte-identical when off or re-published);
  - the meter's label against the bytes in the library;
  - reduced motion (`animationName` none, no `infinite` iteration anywhere in the Creator).
- **Prior art reused:**
  - T00's `seedStudioDraft`, `restoreDraft`, `seedDeviceLibrary` and `loadTape`;
  - the deterministic microphone stub from `tests/wp-studio.spec.ts` (`stubMicrophone`), which T15 copies into a shared
    fixture helper (`tests/fixtures/mic.ts`);
  - the library read-back (`localStorage["ssync-library"]`) from `tests/wp-studio.spec.ts`;
  - the gate pass by reading the a × b label (`tests/critic-studio.spec.ts`);
  - the pinned clock (`page.clock.setFixedTime`) from T04b;
  - `setInputFiles` on the `.storysync` input from `tests/critic-landing.spec.ts`.
- **Fixtures.**
  - The Twinkle tape and its five deliberately uneven clips (peaks −9 / −20 / −14 / −26 / −12 dBFS) come from T00, so
    T17 has something real to even out.
  - Goodnight, Mia serves the one-page `?open=<code>` case.
  - The cast stays under `tests/fixtures/`; T00's guard test enforces it.
- **Existing assertions that change.** Only two, both because the reference renames the control: the delete button's
  name in `tests/critic-studio.spec.ts:324` and `tests/wp-studio.spec.ts:315` (T16). Every other studio suite keeps its
  hooks:
  - `#studio-gate-*`, `[data-studio="share-url" | "share-qr" | "made-in"]`, `[data-sk="transport"]`;
  - the "Page N, has voice" frame names, "Stop — m:ss", "Close Voice", "Tap again to delete everything" and
    "Back to the studio";
  - the "SIDE A · N PAGES" meta and `audioCodec` "wav" for WAV input.
- **Fidelity.** Each ticket names its 1180×820 state and reference crop and saves `docs/vision/evidence/T<nn>.png`.

## Out of Scope

Quoted from HANDOFF §4:
- s03 **I:** "the listening mascot and the giant "Hear it" button. Do not build. Words do not light during a take (needs
  on-device alignment); keep that honest." These are left out entirely, not drawn inert. The Voice card keeps the
  shipped "Stop — m:ss" button.
- s05: "Not UI: the passport-stamp ribbon in the reference is an explanatory diagram. Do not build it."
- The s03 ten-minute ribbon is an annotation: "there is deliberately no clock in a child's view; 'Made in 7:48' is printed
  on the finished tape" (brief `screens[2].realism`).
- s09 **P3, do not build:** "the Tauri desktop app, the professional multi-lane timeline, Cast (several narration tracks
  per page), sound effects lane."
- s07 **P3:** "made voices". Re-voicing in M3 means recording a real person's voice, never synthesizing one.
- Owned by other milestones:
  - the s05 iPhone Reader: cover "VOICE: MIA" and deck chip (T03, T09);
  - the s06 phone Creator's "More" toolbar and READ THIS card (T19);
  - "Send a thank-you back" and `signature.replyTo` (T18);
  - the Read Room's "Read it in…" picker (T22, which links to T15's `?open=` entry);
  - per-page mood authoring and "Type a feeling" (T24);
  - the s09 Inspector's segmented Simple/Advanced control (T24 / T25).

## Open Questions (for Jon)

1. **`shared_links.views` / `storybooks.view_count`** (same as M0-PRD OQ 3 and M2-PRD OQ 4).
   - Migration 001 defines `views INTEGER DEFAULT 0` and `view_count INTEGER DEFAULT 0`.
   - I confirmed by search that nothing in `src/` increments either. The only reader is `getPublicStorybooks`'s select of
     `view_count`, which T02 deletes.
   - M3's printed tape says nothing about plays, which is true today.
   - Dropping the columns is a production migration only you can approve and apply.
2. **Opening your own tape on a new device.** T15 drops every recorded voice when a tape is opened, because re-voicing
   someone else's tape must never re-share their child's voice. That also means a parent who opens her *own* `.storysync`
   to keep editing loses the voices. Should the Creator offer "Keep the voices on this tape (and their consent records)"
   when the file's consent records match? T15 does not build it.
3. **Credit on a re-voiced tape.** T15 keeps the original author, puts the reader in `metadata.narrator` and the consent
   record, writes ownership `© <year> <original author>`, and sets `signature.remixOf` to the source's link, or its app
   URL, or `"<title>" by <author>` when the source had no link. Is a title-text `remixOf` acceptable? The schema says
   "share URL or id". Should ownership name the reader's voice too?
4. **"Voice clean-up (level, rumble)".** s09 labels the Inspector row that way. T17 builds levelling and limiting only, so
   the row is labelled "Evening out each voice", the publish step's name. Add an 80 Hz rumble high-pass (cheap, pure,
   testable) and adopt the s09 label?
5. **Levelling Safari's AAC.** A Safari recording is AAC and passes straight through today. Levelling it needs a decode
   and an AAC re-encode, which only browsers with a WebCodecs AAC encoder can do. T17 leaves such clips as recorded (the
   step says so) rather than converting them to a larger WAV. Agree?
6. **Target loudness.** T17 levels to −20 dBFS RMS of active speech with a −1 dBFS ceiling: a little quieter than
   podcasts, comfortable under the −12 dB-ducked bed. Want it louder for phone speakers, for example −18?
7. **Trust line for a grown-up's own voice.** When every recorded voice is marked "Mine", T14 shows "Your voice never goes
   anywhere without you." instead of the child line. That is new copy, not in any reference. OK?
8. **"Snap the next drawing".** T13b makes the add tile add a page *and* open the camera, because the reference names it
   that way and the child flow is camera-first. Cancelling leaves a blank page, as "+" does today. Agree?
9. **The size budget.** T16 reads format-spec §5's "≤ 15 MB" as 15 × 1,048,576 bytes and shows over-budget tapes in
   tape-red without blocking them. Should anything stronger happen past 15 MB?

## Notes

- **Deliberate deviations from the references**, to record in REPORT.md:
  - No Next or Idea chips on built items.
  - "device" replaces "tablet" in copy.
  - Generic sheet wording replaces the cast's credits ("Mia's drawings", "typed by Mom", "words typed by Mom, as Mia said
    them").
  - The gate does not show a live ✓ when the answer is right, because a pre-reader could type numbers until it turns
    green. Wrong answers keep rotating the question.
  - The "Evening out each voice" step is first in the list, its true position (before AAC), not fourth as drawn.
  - The phone toolbar keeps Magic as a quieter fourth tile rather than s06's "More" menu. That is for T19 / T25 to
    revisit.
  - The s03 reference's "pulsing" red dot on the recording frame is static, because nothing loops in the Creator except
    reels.
- **Cross-milestone file order.**
  - T15 edits `ReadRoom.tsx` (imports only; the two moved helpers). M4's T20, T21 and T22 edit `ReadRoom.tsx` after it.
    The M4 planner should list T15 as a file-order blocker for T20, as T22 already is.
  - T17 adds a row to the Inspector's Mix section. M5's T24 also edits Mix (mood line, "Type a feeling"). T24 should run
    after T17 on `Inspector.tsx`.
  - T19 (READ THIS card) edits the Stage after T13a.
- **Docking with Advanced open.** At 1180 px with the Inspector column and a tool card both open, the Stage narrows to
  about 380 px. That is acceptable, because s09 is a desktop window and Simple mode is the product. T13a records the
  width in its evidence.
- **The demo manifest's legacy `signature.qrCode`** (pointing at `storysynchq.com`, a Phase 3 domain) is dropped by
  re-voice along with the rest of the source signature. It never reaches a re-voiced tape.
- **The Rivera family** appears only in fixtures and test expectations under `tests/`, never in `src/` or `public/`.
