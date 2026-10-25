# T00 · Test fixtures: "Twinkle Came to My Window" and "Goodnight, Mia"
Milestone: M0 · Reference: s03, s05, s06 (brief screens[2], screens[4], screens[5]) · Status in reel: n/a (test infrastructure; the content is illustrative and stays in tests)
Type: AFK (agent can finish alone)
Blocked by: —   ·   Blocks: T02, T03, T04a, T04b, T05b (plus every later ticket that drives a reference state: T09a, T09b, T12–T22, T25)

## Why
Every reference screen after s02 is told through one family's tapes. Mia's five crayon pages, "This is Twinkle. She is a little star." through "Goodnight, Twinkle. Goodnight, Grandma!", run 0:24 in her voice. Grandma answers with a one-page "Goodnight, Mia". To prove the app reaches those states, tests need the same tapes as real `.storysync` files, made by the repo's own container code, plus helpers that load them through the app's own doors: the Read Room's file input, the Studio's local draft and the device library. HANDOFF §1 and §12 allow this content as test fixtures only. It must never appear in the product.

## Done when (acceptance, each testable)
- [ ] **Drawings.** `tests/fixtures/twinkle/page-1.jpg` … `page-5.jpg` exist:
  - JPEG, 600×600, at most 120 KB each.
  - Rasterized from the reference symbols `#s03-d1` … `#s03-d5` in `docs/vision/reference/screens/s03.html`.
  - Each sits on crayon paper `#FBF7EC` with an 8 px paper margin, the brief's "as a photo" treatment.
- [ ] **Clips.** `tests/fixtures/twinkle/narration-1.wav` … `-5.wav` exist:
  - 16-bit PCM mono at 16 000 Hz.
  - Durations 5.1 / 4.4 / 6.4 / 3.8 / 4.3 s (±10 ms); total 24.0 s.
  - Content is speech-like: a 180 Hz voiced tone with harmonics, amplitude-modulated at a syllable rate of about 4 Hz, with 80 ms fade in/out.
  - Peak levels are deliberately unequal, about −9 / −20 / −14 / −26 / −12 dBFS, so voice levelling (T17) has something to even out. The levels are documented in the facts module.
- [ ] **Twinkle tape.** `tests/fixtures/twinkle.storysync` unpacks with `unpackStorysync`. Its manifest:
  - passes `validateManifest` with no errors;
  - has `version` "2.0";
  - has `metadata` = { title "Twinkle Came to My Window", author "Mia, age 4 — with Mom", narrator "Mia", language "en", created "2026-10-19T18:02:10Z" };
  - has 5 pages with ids 1–5;
  - carries the page texts verbatim:
    - (1) "This is Twinkle. She is a little star."
    - (2) "Twinkle looked down at all the houses."
    - (3) "I was scared of the dark. Twinkle came to my window."
    - (4) "We flew over the moon!"
    - (5) "Goodnight, Twinkle. Goodnight, Grandma!"
  - has, on every page, `illustration.url` = `assets/page-N.jpg`, `text.audioUrl` = `assets/narration-N.wav`, `text.audioCodec` "wav", `music` "Wonder" and `timing.autoPause` "2s";
  - has `signature` = { ownership "© 2026 Mia, age 4 — with Mom", rights "personal use", voiceConsent [{ voice "Mia, age 4 — with Mom", grantedBy "parent/guardian", date "2026-10-19" }] }, with no `shareUrl`.
- [ ] **Reply tape.** `tests/fixtures/goodnight-mia.storysync` unpacks and validates with no errors. Its manifest:
  - has title "Goodnight, Mia", author "Grandma Rose", narrator "Grandma Rose";
  - has 1 page with text "Goodnight, my brave little star. I'll look for Twinkle at my window tonight. Love, Grandma.";
  - uses as its image `#s06-win` from `docs/vision/reference/screens/s06.html`, rasterized at 600×480 JPEG;
  - has a 7.6 s WAV clip;
  - has `voiceConsent` [{ voice "Grandma Rose", grantedBy "self", date "2026-10-19" }].
- [ ] **Facts module.** `tests/fixtures/tapes.ts` exports:
  - the tape facts: titles, byline, narrator, page texts, clip seconds, peak levels, mood, autoPause;
  - absolute paths to every fixture file;
  - `loadTape(name)`, which returns `{ bytes, manifest, story }` where `story` is the data-URL app shape from `loadStorysyncToStory`.
  It is pure Node and imports only `src/lib/storysync/*` and `node:` modules.
- [ ] **Page helpers.** `tests/fixtures/helpers.ts` exports:
  - `openTapeInReadRoom(page, name)`. It visits `/read`, calls `setInputFiles` on `input[type="file"][accept*=".storysync"]`, and resolves when the cover's "Tap to Begin" button is visible.
  - `seedStudioDraft(page, name, opts?)`. It writes the `ssync-studio-draft` v1 envelope through `addInitScript`:
    - a state with data-URL pictures and voices, `recordings` meta `{ mimeType: "audio/wav", duration }` per page, mood "Wonder", music on, and `startedAt` `opts.startedAgoS` seconds ago (default 468, which gives "MADE IN 7:48");
    - author from `opts.byline` (default "" so the gate's "story by" stays the user's input);
    - optional per-page `text.voice` overrides via `opts.voices` (`Record<pageId, string>`, for multi-voice consent in T04b);
    - option `opts.narration` (default true). When false, it strips every `audioUrl` and empties `recordings`, giving a picture-and-words draft read by the browser voice;
    - option `opts.published` (default false). When false, pages carry no `audioCodec`, as a fresh draft would;
    - `metadata.narrator` is never present in the seeded draft, because the Creator writes it at publish (T03).
  - `restoreDraft(page)`, which clicks "Keep working on it" in the restore prompt.
  - `seedDeviceLibrary(page, name, { shareCode })`, which writes one `ssync-library` entry the Read Room resolves by `?story=`.
- [ ] **Regeneration.** `npx playwright test --config tests/fixtures/generate.config.ts` reproduces every fixture file from the reference sources (drawings) and from code (clips, tapes). It needs no new dependency. The main suite never runs the generator (its testMatch ignores it).
- [ ] **Smoke tests.** In `tests/fixtures-vision.spec.ts`:
  - `openTapeInReadRoom(page, "twinkle")` shows a cover whose tape label contains "Twinkle Came to My Window" and "SIDE A · 5 PAGES".
  - `seedStudioDraft(page, "twinkle")` + `restoreDraft(page)` opens the Studio with 5 filmstrip frames whose accessible names are "Page 1, has voice" … "Page 5, has voice" (the first also ", selected").
  - `seedDeviceLibrary(page, "goodnight-mia", { shareCode })` + `/read?story=<code>` shows "Goodnight, Mia" on the cover.
- [ ] **Guard.** A Node test fails if any of these strings appears in any file under `src/` or `public/`: "Twinkle Came to My Window", "Goodnight, Mia", "Rivera", "Grandma Rose", "Mia, age 4", "Maple Street", "Okafor", "3f9c2a7be41d0c58", "9a41c07e3d5b2f16". It passes today.
- [ ] **Documentation.**
  - `tests/fixtures/README.md` states provenance (reference SVG and generated audio), the illustrative-only rule and the regenerate command.
  - `CLAUDE.md`'s project structure lists `tests/fixtures/`.
- [ ] All four gates are green (`npx tsc --noEmit`, `npm run lint`, `npm run build`, `npx playwright test`).

## Seams and files
- Seam: Node-side Playwright tests for fixture integrity and the guard (prior art: `tests/storysync-roundtrip.spec.ts`). Helper smoke runs as E2E on `/read` and `/studio`, because the helpers exist to drive the app.
- Rasterizing: the generator opens each `<symbol>` from the reference HTML in the bundled Chromium (`/opt/pw-browsers/chromium` when present, as `playwright.config.ts` already does). It wraps the symbol in a 600×600 SVG with the `s03-crayon` filter and screenshots it as JPEG at quality 85.
- Packing: `packStorysync` from `src/lib/storysync/container.ts`. Nothing re-implements the ZIP layout.

## Tests (written first)
`tests/fixtures-vision.spec.ts`:
1. Node: each `.storysync` unpacks, `validateManifest(...).errors` is empty, and the metadata, page texts, mood, autoPause and signature match the facts module exactly.
2. Node: each WAV header says PCM/1 channel/16 kHz/16-bit; duration = data bytes ÷ 32 000 is within 10 ms of the fact; measured peaks are within 1 dB of the documented peak levels.
3. Node: each JPEG starts with `FF D8`, its SOF0 dimensions are 600×600 (600×480 for the reply), and it is at most 120 KB.
4. Node: the cast-string guard over `src/` and `public/`.
5. E2E (desktop + mobile): `openTapeInReadRoom` → cover label text; `seedStudioDraft` + `restoreDraft` → 5 frames named "Page N, has voice"; `seedDeviceLibrary` → `?story=` opens "Goodnight, Mia".

Red first: 1–3 and 5 fail because the files and helpers do not exist. 4 passes from the start (it is a guard).

## Fidelity check
- Viewport 1180×820 (tablet, the s03 device).
- State: open `docs/vision/reference/screens/s03.html` rendered with `docs/vision/tools/render.cjs` next to a contact sheet of the five generated JPEGs.
- Reference crop: s03 filmstrip frames and Stage photo (`docs/vision/reference/renders/s03.png`).
- The drawings must be the same five pictures (star, houses, window, moon, heart). Save the contact sheet to `docs/vision/evidence/T00.png`.

## Files (ownership)
- `tests/fixtures/README.md` (new)
- `tests/fixtures/tapes.ts` (new)
- `tests/fixtures/helpers.ts` (new)
- `tests/fixtures/generate-fixtures.ts` (new; not matched by the main suite)
- `tests/fixtures/generate.config.ts` (new; dedicated config, `testDir: tests/fixtures`, `testMatch: generate-fixtures.ts`)
- `tests/fixtures/twinkle/page-1.jpg` … `page-5.jpg` (new, generated)
- `tests/fixtures/twinkle/narration-1.wav` … `narration-5.wav` (new, generated)
- `tests/fixtures/goodnight-mia/page-1.jpg`, `tests/fixtures/goodnight-mia/narration-1.wav` (new, generated)
- `tests/fixtures/twinkle.storysync`, `tests/fixtures/goodnight-mia.storysync` (new, generated)
- `tests/fixtures-vision.spec.ts` (new)
- `CLAUDE.md` (one line in Project Structure; shared doc, append-only edit)
- `agent_docs/decisions.md` (append one entry; shared, append-only)

## Existing tests that may change
- None. The fixtures are additive. The main config's default testMatch (`*.spec|test.*`) does not pick up `generate-fixtures.ts`, `tapes.ts` or `helpers.ts`.
