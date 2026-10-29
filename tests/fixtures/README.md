# Vision fixtures: "Twinkle Came to My Window" and "Goodnight, Mia"

Two real `.storysync` tapes from the Vision Reel's invented family, kept here
so tests can drive the app into the reference states (s03–s07).

> **Illustrative only.** The family (Mia, Mom, Grandma Rose), the drawings,
> the words, the share codes and the timestamps come from the reference reel
> (`docs/vision/HANDOFF.md` §1 and §12). They are test fixtures, never product
> content. Nothing from here may appear in `src/` or `public/`.
> `tests/fixtures-vision.spec.ts` has a guard test that fails the suite if it does.
> The only built-in tape stays the house demo, "The Brave Little Star".

## What is here

| File | What it is |
|---|---|
| `twinkle.storysync` | Mia's tape: 5 pages, her voice, Wonder, 2 s pauses, consent from a parent |
| `twinkle/page-1.jpg` … `page-5.jpg` | Her five crayon drawings, 600×600 JPEG |
| `twinkle/narration-1.wav` … `-5.wav` | Her five clips: 5.1 / 4.4 / 6.4 / 3.8 / 4.3 s (24.0 s) |
| `goodnight-mia.storysync` | Grandma's reply: 1 page, her voice, consent `self` |
| `goodnight-mia/page-1.jpg` | A photo of her window at night, 600×480 JPEG |
| `goodnight-mia/narration-1.wav` | Her 7.6 s clip |
| `tapes.ts` | The facts (titles, byline, narrator, page texts, clip lengths, peak levels, mood, autoPause, signature), absolute paths to every file, and `loadTape(name)`. Pure Node. |
| `helpers.ts` | Page helpers: `openTapeInReadRoom`, `seedStudioDraft`, `restoreDraft`, `seedDeviceLibrary` |
| `generate-fixtures.ts`, `generate.config.ts` | The generator and its own Playwright config |

## Provenance

- **Pictures are the reference SVG.** Mia's drawings are the `<symbol>`s
  `#s03-d1` … `#s03-d5` in `docs/vision/reference/screens/s03.html`. The
  generator rasterizes them in the bundled Chromium. Each drawing is shot "as a
  photo" (the brief's treatment and the s03 Stage): crayon paper `#FBF7EC`, an
  8 px paper margin, the reference's own `s03-crayon` filter and the Stage's
  faint warm vignette. The result is JPEG quality 85. Grandma's window is
  `#s06-win` in `s06.html`, rasterized full bleed at 600×480.
- **Audio is generated, not recorded.** No real voice is in this folder. Each
  clip is 16-bit PCM, mono, 16 kHz. It is a voiced 180 Hz tone with
  formant-shaped harmonics, amplitude-modulated at about 4 syllables a second,
  with 80 ms raised-cosine fades. The peak levels are unequal on purpose so
  voice levelling (T17) has something to even out:

  | Clip | Twinkle 1 | 2 | 3 | 4 | 5 | Goodnight 1 |
  |---|---|---|---|---|---|---|
  | Seconds | 5.1 | 4.4 | 6.4 | 3.8 | 4.3 | 7.6 |
  | Peak dBFS | −9 | −20 | −14 | −26 | −12 | −15 |

- **Tapes are packed by the app's own code** (`packStorysync` in
  `src/lib/storysync/container.ts`). Nothing here re-implements the ZIP
  layout. The ZIP entry times are pinned to each tape's `created` time (UTC),
  so running the generator again gives byte-identical files.

## Regenerate

```sh
npx playwright test --config tests/fixtures/generate.config.ts
```

This rewrites every file listed above from the reference sources and from
code. It needs no new dependency. The main suite never runs it: the main
config's default `testMatch` only picks up `*.spec.*` / `*.test.*`, so it
skips `generate-fixtures.ts`, `tapes.ts` and `helpers.ts`. After regenerating,
run `tests/fixtures-vision.spec.ts`.

## Using them

```ts
import { loadTape, TWINKLE } from "./fixtures/tapes";
import { openTapeInReadRoom, seedStudioDraft, restoreDraft, seedDeviceLibrary } from "./fixtures/helpers";

await openTapeInReadRoom(page, "twinkle");            // /read → the file input → cover ("Tap to Begin")
await seedStudioDraft(page, "twinkle");               // draft envelope v1, MADE IN 7:48 by default
await page.goto("/studio"); await restoreDraft(page); // "Keep working on it"
await seedDeviceLibrary(page, "goodnight-mia", { shareCode }); // then /read?story=<shareCode>
```

- The seeds are written by an init script once per tab, before the app runs.
  If the page reloads, the app keeps whatever it saved or deleted since; the
  seed does not bring it back.
- `seedStudioDraft` gives a fresh Creator draft. It has data-URL pictures and
  voices, `recordings` meta `{ mimeType: "audio/wav", duration }`, mood
  Wonder and music on. `startedAt` is set relative to the page's own clock.
  It has no signature, no `metadata.narrator` and no `page.music`, because
  publish writes those. The options are:
  - `byline`: "story by" (default `""`)
  - `voices`: per-page `text.voice`
  - `narration: false`: a picture-and-words draft
  - `published: true`: pages keep `audioCodec: "wav"`
  - `startedAgoS`: default 468, which gives "MADE IN 7:48"
- Mint share codes in the test (`randomBytes(16).toString("hex")`). The
  reference's `3f9c2a7be41d0c58` is exported as `REFERENCE_SHARE_CODE` for
  reference only.

## Where the fixtures differ from the reference, and why

- **Narration is WAV, not AAC.** WAV is the permitted published fallback, and
  Node cannot encode AAC without a new dependency. The reference's Twinkle
  label says `AAC/M4A`, and Grandma's reply was a Safari AAC passthrough.
- **Size.** Twinkle is about 1.1 MB, not the reference's "2.0 MB of 15 MB".
  The pictures are capped at 120 KB each, where the reference's camera photos
  are about 340 KB. The WAV clips are larger than AAC would be.
- **Values the reference does not state.** These were chosen and documented:
  Goodnight's peak level (−15 dBFS), its `created` time (6:31 pm, written
  `2026-10-19T18:31:00Z` in the same form as Twinkle's), and its mood (Wonder,
  the Creator's default).

## Pictures and text a test keeps (`evidence.ts`)

An ordinary run never writes or creates a tracked file. Every screenshot or
text file a spec keeps for a human goes through `evidence.ts`, which writes it
into the test's own output folder (`test.info().outputPath()`, under
`test-results/`) unless an opt-in is set:

| Opt-in | Destination | Used for |
|---|---|---|
| `VISION_EVIDENCE=1` | `docs/vision/evidence/<name>` | the vision hand-back packet (`T16.png`, `T17-levels.txt`, `s10-…png`) |
| `VISION_EVIDENCE=<dir>` | `<dir>/<name>`, created if missing | the same files, anywhere else |
| `UPDATE_SCREENSHOTS=1` | `tests/screenshots/<name>` | the legacy critic / builder pictures (`{ dir: "tests/screenshots" }`) |

```ts
import { evidencePath, evidenceShot, evidenceText } from "./fixtures/evidence";

await evidenceShot(page, "s05-publish-1180x820.png");                    // settled shot
await page.screenshot({ path: evidencePath("T16.png") });                 // a spec's own shot
await page.screenshot({ path: evidencePath("wp-player-endcard-qr.png", { dir: "tests/screenshots" }) });
evidenceText("T17-levels.txt", lines.join("\n"));                         // text evidence
```

File names are the ones the files always had, so an opted-in run rewrites
today's files and nothing else:

```sh
VISION_EVIDENCE=1 npx playwright test tests/vision-fidelity.spec.ts   # docs/vision/evidence/
UPDATE_SCREENSHOTS=1 npx playwright test tests/wp-player.spec.ts      # tests/screenshots/
```

## No-network checks (`sends.ts`)

`watchSends(page, opts?)` records what a page sends while a test watches, so
every "nothing is sent" check counts the same things in `next dev` (local) and
`next start` (CI):

```ts
import { watchSends } from "./fixtures/sends";

const sends = watchSends(page);                     // fetch, xhr, ping, beacon
… drive the page …
expect(sends.urls(), "nothing is sent").toEqual([]);
```

- `types`: the resource types recorded (default fetch / xhr / ping / beacon;
  `"all"` for every type).
- `origin`: the app's origin (default the project's `baseURL`).
- `foreignTo: origin`: record only requests to any other origin.
- `ignore(url, request)`: a spec's own extra filter.
- `stop()` ends recording; `sent()` gives URL, method and resource type.

Never recorded: non-http(s) URLs (`data:`, `blob:`), same-origin `/_next/…` and
`/__nextjs…` (the framework's code, dev tooling, hot reload), and same-origin
`?_rsc=…` (production prefetches every visible `<Link>` that way; `next dev`
does not, so a check that counts it is green locally and red in CI).
