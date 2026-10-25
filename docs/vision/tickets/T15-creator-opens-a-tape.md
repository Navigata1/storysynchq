# T15 · Creator opens a `.storysync` (and the house tape) to re-voice it; recorded voices replace browser voice per page
Milestone: M3 · Reference: s07 "Read it in…" and s09 (brief screens[6], screens[8]); the wedge in HANDOFF §2 · Status in reel: Next
Type: AFK (agent can finish alone)
Blocked by: T00 (fixtures), T03 (narrator rule), T04b (consent module; file order on `runPublish` and `ParentGate`)   ·   Blocks: T13a (file order on `Studio.tsx`), T18, T22

## Why
The wedge is "Make any storybook read itself in the voice and mood you choose", and the demo line is *"Google cannot read
this in your voice."* s07's "Read it in…" promises to "open any tape, including the house tape, in the Creator to
re-voice it in your own voices and a chosen mood". The roadmap names "the Creator opening a .storysync so any tape can be
re-voiced - the wedge".

Today the Creator cannot open anything. It starts blank or from its own draft, so "The Brave Little Star" can only ever be
heard in the browser voice. This ticket opens a tape in the Creator: its pictures, words, pauses and mood. Each page you
record then plays your voice, and every page you have not recorded keeps the browser voice. Another family's recorded
voices are never carried over.

## Done when (acceptance, each testable)
- [ ] **Entry: a file.** The Studio top bar has an "Open a tape" control:
  - a lucide `FolderOpen` icon; the visible label "Open a tape" at ≥ 640 px, and the same accessible name at every width;
  - it sits after Exit;
  - it opens a hidden `input[type="file"][accept=".storysync,.zip"]` (`data-studio="open-tape-input"`);
  - the file is read and unpacked on this device with the container loader. Nothing is uploaded.
- [ ] **Entry: the house tape.** `/studio?open=house` opens "The Brave Little Star":
  - it fetches this app's `/demo/brave-little-star.ssync.json`;
  - each picture is inlined through the shipped image pipeline (EXIF-safe, ≤ 2048 px, JPEG data URL);
  - the opened draft therefore contains no `/demo/` URL.
- [ ] **Entry: a code.** `/studio?open=<code>` resolves the tape exactly as `/read?story=<code>` does: the cloud by share
  code first, then this device's library.
  - An unknown code shows "We couldn't find that tape" as a status in the Studio, and the current story is untouched.
- [ ] **Mood override.** An optional `&mood=<name>` sets the story mood through `resolveMood` (for T22).
  - Unknown values are ignored.
  - The query is read after mount from `window.location`, and the URL is then cleaned with `history.replaceState`, so
    refresh does not re-open.
  - `src/app/studio/page.tsx` stays a static route with no Suspense change.
- [ ] **Re-voice rules.** A pure module turns any source manifest into a Creator draft:
  - `version` is "2.0" and `metadata.created` is now. `title`, `author`, `language`, `genre`, `ageRange` and
    `description` are kept. `narrator` and `coverImage` are removed.
  - `signature` is removed entirely: no source consent, ownership, rights, shareUrl or `qrCode` is carried.
  - Pages are renumbered 1…n.
    - Kept: `illustration` (url, alt, other fields), `text.content`, `text.wordHighlight`, `timing`, `layout`, and
      unknown page fields.
    - Removed: `text.audioUrl`, `text.audioCodec`, `text.voice` and `music`.
  - `settings` is kept.
  - It also returns:
    - `mood` = `resolveMood` of the first page that has `music`, or "Wonder";
    - `musicOn` = whether any source page had `music`;
    - `remix = { of, title, author }`. `of` is the source `signature.shareUrl`, else the absolute app URL the tape was
      loaded from (house tape: `<origin>/demo/brave-little-star.ssync.json`), else `"<title>" by <author>`.
- [ ] **Opening replaces the draft cleanly.**
  - The new state has the re-voiced manifest, `recordings: {}`, `published: null`, `publishedIds: []`, `startedAt` =
    now, and `remix` set. `mood` and `musicOn` come from the module, or from `?mood=`.
  - The Stage shows page 1.
  - A polite announcement reads "Opened <title>, <n> pages. Record your voice on any page."
- [ ] **Never lose a story by accident.** When the current draft has content (`storyHasContent`), opening shows a dialog
  before anything is replaced. The dialog is named "Open <title>?" and has the body "The story on the Stage will be
  replaced. It is only kept on this device, so download it first if you want to keep it."
  - "Keep my story" closes the dialog, and the draft stays byte-identical in `localStorage["ssync-studio-draft"]`.
  - "Open it" replaces.
  - When `?open=` arrives with a saved draft, this dialog takes the place of the restore prompt. "Keep my story" restores
    the draft exactly as "Keep working on it" would, so a parent sees one question, not two.
  - Escape closes the dialog like "Keep my story".
  - Focus moves into the dialog and returns to the opener.
- [ ] **A bad file is honest.** A non-`.storysync` file shows "That file could not be opened as a .storysync tape." (the
  Read Room's sentence) in a `role="status"`, and the state is unchanged.
- [ ] **Recorded voices replace the browser voice per page.**
  - After opening the house tape and recording page 1, filmstrip frame 1 reads "Page 1, has voice" and frames 2–8 do not.
  - The published tape has `text.audioUrl` + `audioCodec` on page 1 only.
  - Opening that tape in `/read` and turning to page 2 reads it with the browser voice; the Player's existing rule is
    unchanged.
- [ ] **Credit and consent on a re-voiced tape.**
  - The gate's byline label reads "read by (optional)", rendered uppercase as "READ BY (OPTIONAL)", and is prefilled
    empty.
  - At publish:
    - `metadata.author` stays the original ("Island Development Crew" for the house tape);
    - `metadata.narrator` comes from T03's `resolveNarrator` with the reader as byline;
    - `signature.voiceConsent` has one record per recorded voice, keyed by the reader (T04b), never the source's
      "narrator";
    - `signature.ownership` is `© <year> <original author>`, `rights` is "personal use", and `signature.remixOf` =
      `remix.of`.
  - A normal (non-re-voiced) tape publishes exactly as before. Its byline label stays "story by (optional)" and no
    `remixOf` is written.
- [ ] **Self-contained.** The re-voiced tape's downloaded `.storysync` passes `unpackStorysync`. No string in its
  `manifest.json` contains `/demo/` or `storysynchq.com`.
- [ ] **One resolver.** The Read Room's permissive manifest reader and device-library lookup move into a shared tape-source
  module, unchanged, and the Read Room imports them back. Every existing Read Room suite (`wp-player`, `critic-player`,
  `fable-pass`, `smoke`, `studio-experience`) passes unchanged.
- [ ] **COPPA.** Opening a file makes no network request (asserted). The house tape fetches only same-origin `/demo/*`.
  Nothing leaves before the gate.
- [ ] A decision log entry records the re-voice rules and M3-PRD Open Questions 2 and 3.
- [ ] All four gates are green.

## Seams and files
- Primary seam: Playwright E2E on `/studio`, both projects:
  - `?open=house`, file input (T00 `tests/fixtures/twinkle.storysync`), and `?open=<code>` via T00 `seedDeviceLibrary(page, "goodnight-mia", { shareCode })`;
  - recording through the deterministic microphone stub, then the gate, then reading the published tape back from
    `localStorage["ssync-library"]`.
- Secondary seam: one Node block pins the re-voice module against `loadTape("twinkle").manifest` and the house JSON (read
  with `node:fs`).
- Modules:
  - `src/lib/storysync/revoice.ts` (new, pure; imports types and `resolveMood` only);
  - `src/lib/storysync/tape-source.ts` (new: `HOUSE_TAPE_URL`, `normalizeTapeManifest` and `deviceTapeByCode` moved from
    ReadRoom, plus `loadTapeByCode`);
  - `src/components/studio/open-tape.ts` (new, client: file → manifest, house JSON → inlined pictures, code → manifest;
    then `revoiceManifest`).
- `runPublish` separates author and byline when `state.remix` is set. Gate prop `bylineLabel` ("story by" | "read by").

## Files (ownership)
- `src/lib/storysync/revoice.ts` (new)
- `src/lib/storysync/tape-source.ts` (new)
- `src/components/studio/open-tape.ts` (new)
- `src/components/studio/OpenTapeDialog.tsx` (new; Tailwind utilities only)
- `src/components/studio/Studio.tsx` (modify: top bar control + hidden input, `?open=`/`?mood=` effect, dialog wiring, `remix` in `runPublish`; after T04b in file order)
- `src/components/studio/types.ts` (modify: `StudioState.remix`, `RemixRecord` type, `blankState` sets `remix: null`)
- `src/components/studio/ParentGate.tsx` (modify: `bylineLabel` prop only; T14 later redesigns the gate and keeps the prop)
- `src/components/player/ReadRoom.tsx` (modify: delete the private `normalizeManifest`/`deviceCopy`/`DEMO_URL`, import them from `tape-source`; no behaviour change. M4's T20–T22 edit this file after T15)
- `tests/fixtures/mic.ts` (new: `stubMicrophone(page, { deny? })`, moved from the prior art in `tests/wp-studio.spec.ts`; used by T13a, T13b, T17)
- `tests/vision-revoice.spec.ts` (new)
- `agent_docs/decisions.md` (append one entry; shared, append-only)

## Existing tests that may change
- None. `tests/wp-studio.spec.ts` keeps its own `stubMicrophone`; the shared helper is a copy, and de-duplication is
  optional and not required.
- The Read Room refactor is a pure move, guarded by the existing Read Room suites:
  - `tests/wp-player.spec.ts` (`seedLibrary` + `?story=`);
  - `tests/critic-player.spec.ts` ("We couldn't find that tape");
  - `tests/critic-landing.spec.ts` (the `.storysync` file input on `/read`);
  - `tests/studio-experience.spec.ts` (demo tape).
- The gate's byline label for normal tapes is unchanged ("story by (optional)"), so `tests/critic-studio.spec.ts` and
  `tests/wp-studio.spec.ts` gate helpers are unaffected.

## Tests (written first)
`tests/vision-revoice.spec.ts`:
1. Node, re-voice of `loadTape("twinkle").manifest`:
   - no page has `audioUrl`/`audioCodec`/`voice`/`music`;
   - no `signature`;
   - author "Mia, age 4 — with Mom";
   - `version` "2.0";
   - page texts deep-equal the fixture facts;
   - `mood` "Wonder", `musicOn` true;
   - `remix.of` === `"Twinkle Came to My Window" by Mia, age 4 — with Mom` (the fixture has no shareUrl).
2. Node, re-voice of `public/demo/brave-little-star.ssync.json` with `sourceRef` `http://x/demo/brave-little-star.ssync.json`:
   - 8 pages, ids 1–8;
   - no page has `text.voice`;
   - `mood` "Wonder" (from "wonder");
   - no `signature`;
   - `remix.of` equals the `sourceRef`.
3. E2E `/studio?open=house`:
   - 8 frames named "Page 1" … "Page 8" (none "has voice");
   - the Stage text area equals the demo JSON page 1 text;
   - every frame `img` `src` starts with `data:image/jpeg`;
   - the title input reads "The Brave Little Star";
   - the URL no longer has `?open`.
4. E2E re-voice and publish (fake mic):
   - `?open=house` → Transport REC → "Stop — …" → frame 1 "has voice", frame 2 not;
   - Finish → gate shows "READ BY (OPTIONAL)"; read by "Grandpa Joe"; consent; Continue;
   - library manifest:
     - `metadata.author` "Island Development Crew";
     - `metadata.narrator` "Grandpa Joe";
     - `voiceConsent[0].voice` "Grandpa Joe";
     - `signature.remixOf` === `${origin}/demo/brave-little-star.ssync.json`;
     - `ownership` matches `/^© \d{4} Island Development Crew$/`;
     - `pages[0].text.audioUrl` truthy, `pages[1..7]` have none;
     - `JSON.stringify(manifest)` contains neither `/demo/images/` nor `storysynchq.com`.
5. E2E file:
   - "Open a tape" → `setInputFiles("tests/fixtures/twinkle.storysync")` → 5 frames, none "has voice";
   - title "Twinkle Came to My Window";
   - frame 3 → Stage text "I was scared of the dark. Twinkle came to my window.";
   - `page.on("request")` saw no request other than same-origin `/_next/` assets.
6. E2E replace confirmation:
   - `seedStudioDraft(page, "twinkle")`, then go straight to `/studio?open=house`:
     - the dialog "Open The Brave Little Star?" is shown;
     - the restore prompt "Pick up where you left off?" is not shown.
   - "Keep my story" → title still "Twinkle Came to My Window", 5 frames, and the stored draft unchanged.
   - In a fresh context, the same flow with "Open it" → 8 frames.
   - In-session: with a story on the Stage, "Open a tape" + a file → the same dialog appears before anything is replaced.
7. E2E code:
   - `seedDeviceLibrary(page, "goodnight-mia", { shareCode: <32 hex> })` → `/studio?open=<code>` → 1 frame, not "has voice";
   - the Stage text is the reply fixture sentence verbatim;
   - `/studio?open=ffffffffffffffffffffffffffffffff` → status "We couldn't find that tape", and the Studio is unchanged.
8. E2E bad file: a 10-byte `.storysync` → status "That file could not be opened as a .storysync tape."; frames unchanged.
9. E2E `?open=house&mood=Calm`: open the Music tool → the "Calm" radio has `aria-checked="true"`.

Red first:
- 1 and 2 fail because no module exists.
- 3–9 fail because there is no entry point.
- The existing Read Room suites pass before and after (a guard on the move).

## Fidelity check
- Viewport 1180×820; also 375×812.
- State: `/studio?open=house` with page 1 on the Stage; then the gate after recording page 1.
- Reference: there is no screen of this exact state. The gate crop is s04's left panel (`docs/vision/reference/renders/s04.png` x338–805, y145–792): compare the byline row, which must read "READ BY (OPTIONAL)" for this tape.
- The intent being checked is s07's "Read it in…" → Creator hand-off: the tape opens on page 1 with its pictures and words
  and no voice badges.
- Save `docs/vision/evidence/T15-open-house.png` and `docs/vision/evidence/T15-gate-read-by.png`.
