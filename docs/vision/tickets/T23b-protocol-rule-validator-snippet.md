# T23b · `/protocol`: the codec rule as MUST / MAY / MUST NOT, a validator block in real `validateManifest` language, "Write your own player", the download in the hero
Milestone: M5 · Reference: s08 (brief screens[7]) · Status in reel: Next (inside a Shipped page)
Type: AFK (agent can finish alone)
Blocked by: T23a (the figure-grid section; file order on `ProtocolPage.tsx`, `protocol.css`), T04a (`warnings` and the exact timestamp WARN sentence), T00 (Twinkle fixture)   ·   Blocks: T25
Split from T23. T23a = the exploded packet. T23b = the three cards, the hero download and the hero lede.

## Why
s08's right column: "(1) the codec rule, glass 428x120 — three rows tagged in mono 11px MUST (gold), MAY (fg-2), MUST NOT
(tape-red) with 13px text; (2) the validator, console #05070d 428x132, mono 11.5px, tags PASS (--ss-ok), WARN
(label-yellow), FAIL (tape-red), long lines wrapping; (3) a .ss-code block" titled "Write your own player", and in the hero
a gold "Download the demo as .storysync" with "Nothing is uploaded — the ZIP is built on this device." HANDOFF §4 asks for
"a validator block showing PASS/WARN/FAIL lines in the real `validateManifest` language" and "the codec rule as MUST / MAY /
MUST NOT". The callout: "LIKE PDF, FOR STORYBOOKS — A .storysync is a ZIP … Rename it .zip and open it with anything". A
developer should be able to read the rule, see the validator talk, copy a player, and download a tape to try it, in one
screen.

## Done when (acceptance, each testable)
- [ ] **Hero.** The lede is the reference's, verbatim, as one paragraph: **"SSYNC is to storybooks what PDF is to documents:
      pictures, words, voices, music and timing in one open file. Deliberately not video. The player is plain web — nobody
      needs our servers, or our app, to hear a story."** The facts strip and the schema/spec links are unchanged. At
      ≥ 1024 px the hero's right side holds the download: DownloadDemo's new compact variant — the gold button
      **"Download the demo as .storysync"** (lucide `Download`, replacing the "⬇" glyph) and under it the idle status line
      **"Nothing is uploaded — the ZIP is built on this device."** — keeping `[data-protocol="download-demo"]`,
      `[data-protocol="download-status"]`, the packing/done/error statuses and a `.pr-take` wrapper. The old bottom
      section "Hold one in your hand / The demo tape, as a file" is removed, so each hook exists exactly once.
- [ ] **Codec card** (glass, first card of T23a's right column): a title **"The codec rule"** that is **not** a heading
      element (the page keeps exactly one heading matching `/codec rule/i`), a lucide `Headphones` glyph, and a `dl` of three
      rows, verbatim:
      **MUST** (mono 11 px, `--ss-gold`) — "Narration is AAC-LC in M4A, mono, 48 kHz, about 96 kbps.";
      **MAY** (`--ss-fg-2`) — "Fall back to 16-bit WAV, 16 kHz mono. The only fallback.";
      **MUST NOT** (`--ss-red`) — "Opus, WebM or Ogg. Drafts only, never a published tape."
- [ ] **Validator report (pure).** `validationReport(manifest, assetPaths?)` in the storysync library returns ordered
      `{ level, text }` lines: PASS "version <v> · metadata.title · <n> pages" when the version, title and pages checks pass;
      when `assetPaths` is given, PASS "every assets/ path in the manifest exists" or FAIL "missing from the container: <paths>";
      each `validateManifest` warning verbatim as WARN; each error verbatim as FAIL. It never rewrites a validator sentence.
- [ ] **Validator card** (console `--ss-slot`, mono 11.5 px, long lines wrap, an `h3` **"Validator"** with a lucide
      `CircleCheck`): lines computed at render (no fetch) from the static demo import, in this order:
      1. on the house tape as the download packs it (T23a's naming; version "2.0"): **"PASS  version 2.0 · metadata.title ·
         8 pages"** and **"PASS  every assets/ path in the manifest exists"**;
      2. on a hand-edited copy whose `signature.voiceConsent[0].date` is `2026-10-19T18:20:00Z`: **"WARN  a hand-edited copy:
         signature.voiceConsent[0].date is a full timestamp; the v2.1 draft asks for a date"**;
      3. on a hand-edited copy whose `pages[2].text.audioUrl` is `assets/narration-3.webm`: **"FAIL  a hand-edited copy:
         "** followed by the validator's own sentence, verbatim (today: `pages[2].text.audioUrl "assets/narration-3.webm"
         uses a draft-only codec — published narration must be AAC/M4A (or WAV fallback)`).
      Tags coloured PASS `--ss-ok`, WARN `--ss-label`, FAIL `--ss-red`; the list is an `ul` (not a scroll region).
- [ ] **"Write your own player"** card: an `h3` **"Write your own player"** (lucide `Code`), and a code block (class
      `pr-snippet`, **not** `pr-code`; focusable, `aria-label`, `overflow-x: auto`, scrolls itself at 375 px) whose text is
      exactly:
      ```
      import { unzipSync, strFromU8 } from 'fflate';
      const files = unzipSync(tape);
      const m = JSON.parse(strFromU8(files['manifest.json']));
      for (const page of m.pages) {
        draw(files[page.illustration.url], page.text.content);
      }
      ```
      exported from one constant that the page renders and the test executes. Optional token colouring uses tokens only.
- [ ] **The snippet is true.** Executed in Node against the demo packed for real (pictures read from `public/demo/images`,
      packed with the repo's container), with `tape` = the bytes and `draw` a recorder, it calls `draw` once per page (8) with
      each page's text in order and, for every pictured page, a `Uint8Array` that starts with the JPEG magic bytes.
- [ ] Layout: at ≥ 1024 px the three cards stack in T23a's right column (≈ 428 px) beside FIG. 1; below, they follow the
      figure in one column. No horizontal page overflow at 320–1440 px. No new link to the spec or the schemas.
- [ ] Nothing here fetches, uploads or counts; the download still packs on this device.

## Seams and files
Seam 1 (Node): the validator report (house tape packed for real, Twinkle, hand-edited copies, missing asset) and the
snippet execution, prior art `tests/storysync-roundtrip.spec.ts` (fflate's `unzipSync`/`strFromU8` are already a
dependency). Seam 2 (E2E): `/protocol` cards, hero download, and every shipped `/protocol` assertion (prior art
`tests/wp-landing.spec.ts`, `tests/critic-landing.spec.ts`).

## Files (ownership)
- `src/lib/storysync/report.ts` — **new** (pure: `validationReport`; relative imports only).
- `src/components/protocol/snippet.ts` — **new** (the exact snippet text as one exported constant).
- `src/components/protocol/ProtocolCards.tsx` — **new** (codec card, validator card, snippet card).
- `src/components/protocol/ProtocolPage.tsx` — modify (T23a's section gets the cards; hero lede + compact download;
  remove the bottom take section).
- `src/components/protocol/DownloadDemo.tsx` — modify (`compact` variant: button + status only, same hooks and `.pr-take`).
- `src/components/protocol/protocol.css` — modify (cards, console, snippet block, hero right column).
- `tests/vision-protocol-cards.spec.ts` — **new** (Node + E2E).
- `docs/vision/evidence/T23b-1140.png`, `T23b-375.png` — **new**.

## Existing tests that may change
- None. Built around (must keep passing unchanged): `tests/critic-landing.spec.ts` › "carries the codec rule…"
  (`getByRole("heading", { name: /codec rule/i })` must stay unique — the card title is not a heading; `.pr-rule` keeps
  MUST/MUST NOT/aac), "the download button emits a .storysync…" (one `[data-protocol="download-demo"]`, `.pr-take` to scroll
  to, `download-status` contains ".storysync" after download), "/protocol is one document"; `tests/wp-landing.spec.ts` ›
  "carries the codec rule, the container layout and the spec links" (`/published-audio codec rule/i` heading; spec links
  exactly 2; each schema link exactly 1), "downloads the demo as a real .storysync container", "neither route scrolls
  sideways", "the code blocks scroll themselves, keyboard-reachably, at 375px" (`.pr-tree` and `.pr-code` unique — hence
  `pr-snippet`).

## Tests (written first)
`tests/vision-protocol-cards.spec.ts`:
1. Node: pack the house tape for real (inline `public/demo/images/page*.jpg` as JPEG data URLs, `buildStorysyncFromStory`),
   unpack, `validationReport(manifest, Object.keys(assets))` → exactly the two PASS lines above.
2. Node: Twinkle → "PASS version 2.0 · metadata.title · 5 pages" + the assets PASS; a timestamp-date copy → the WARN
   sentence equals T04a's string; a `.webm` copy → the FAIL text equals `validateManifest(copy).errors[0]`; removing
   `assets/page-2.jpg` from the asset list → "FAIL missing from the container: assets/page-2.jpg".
3. Node: run the snippet constant (import line replaced by injected `unzipSync`/`strFromU8`) on the packed house tape →
   8 `draw` calls, texts equal the manifest's page texts in order, pictured pages get JPEG bytes.
4. E2E (desktop + mobile): the hero lede verbatim; `[data-protocol="download-demo"]` count 1, inside the hero; idle status
   verbatim; the codec card's three rows verbatim with tag colours (`rgb(245, 158, 11)`, fg-2, `rgb(227, 69, 47)`);
   headings matching `/codec rule/i` count 1.
5. E2E: the validator card shows four lines in order with tags PASS, PASS, WARN, FAIL and the exact texts; tag colours
   `rgb(63, 182, 139)` / `rgb(255, 201, 60)` / `rgb(227, 69, 47)`.
6. E2E: the snippet block's text equals the constant; at 375 px it is focusable, named, `overflow-x: auto` and its right
   edge ≤ 376.
7. E2E: the shipped download test flow still works from the hero (download event, `.storysync` filename).
Red first: no report module, no cards, the download is at the bottom.

## Fidelity check
Viewport **1140×712** — state: `/protocol` at the top (hero + figure grid in view). Compare with s08 (`renders/s08.png`
laptop screen x98–1238, y58–770; right cards ≈ x762–1206, y292–738; hero download ≈ x915–1206, y120–186): card order,
console look, tag colours, snippet block, the gold download at the hero's right. Save `docs/vision/evidence/T23b-1140.png`;
**375×812** → `T23b-375.png`. Deviations to record: both WARN and FAIL come from labelled hand-edited copies of the house
tape and the FAIL keeps the validator's double quotes (M5-PRD OQ 3); the PASS lines name the house tape (8 pages) rather
than Mia's (5 pages); no e-reader figure (annotation).
