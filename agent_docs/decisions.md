# Decision Log — append only

Format: date · decision · rationale. Newest at the bottom. Never rewrite history;
if a decision is reversed, append the reversal.

---

**2026-07 · Stack re-audit (v2)** — Full decision-by-decision review recorded in
`ARCHITECTURE_REVIEW.md`. Headline verdicts: published narration is always AAC/M4A
(codec matrix miss), COPPA-first privacy posture (parental gate, deletion, zero
trackers), camera-first native capture, raw Web Audio dual-bus player, jszip → fflate.

**2026-08-02 · Apply v2 to the existing Next.js app, not a fresh Vite monorepo** —
StorySyncHQ already ships a working reader/creator/library on Next.js 16 + React 19 +
Supabase, deployed on Vercel. Rebuilding as a monorepo would discard working product to
satisfy a doc written before the app existed. The tape plan's exit criteria are kept;
`packages/core|editor|player` map to `src/lib/storysync`, `StoryCreator`, and
`ImmersiveReader` + `src/lib/audio`. Mapping table added to PLAN_OF_ATTACK.md.

**2026-08-02 · Publish transcode path: client-side WebCodecs + mp4-muxer, WAV fallback** —
The Tape 1 IEQ choice between ffmpeg.wasm and a server transcode step is resolved as
*neither*: ffmpeg.wasm is a ~30 MB download that punishes every publisher, and a server
transcode moves a child's voice through infrastructure we don't need (worse COPPA posture).
Instead: (1) Safari already records AAC/MP4 → passthrough; (2) Chromium exposes WebCodecs
`AudioEncoder` with AAC → decode + re-encode client-side, mux to M4A with mp4-muxer (~10 KB);
(3) anything else falls back to WAV 16 kHz mono — bigger, but universally playable.
Opus/WebM is never written into a published story. Encoded in `docs/format-spec.md` and
`public/protocol/v2.schema.json`.

**2026-08-02 · Recorder mime is negotiated, never hardcoded** — The reader hardcoded
`audio/webm;codecs=opus`, which throws on iOS Safari (recording was simply broken there).
`src/lib/audio/recorder.ts` probes `MediaRecorder.isTypeSupported` in preference order
(mp4 → webm/opus → webm → default) and reports what it actually got.

**2026-08-02 · Images compressed at capture, not at publish** — Raw camera data URLs
(3–10 MB each) blow the ~5 MB localStorage quota after two pages and bloat Supabase rows.
`src/lib/images.ts` downscales to ≤2048px and re-encodes (JPEG q0.82) at upload time,
using `createImageBitmap(..., { imageOrientation: "from-image" })` so EXIF rotation is
baked in. Target ≤ ~350 KB/page per the 15 MB story budget.

**2026-08-02 · Supabase stays; R2 deferred** — The review recommends Cloudflare R2, but
Supabase auth + storage is already wired and working. Swapping storage backends is not on
the POC critical path. R2/presigned-Worker URLs go to the Phase 3 backlog with Tauri.

**2026-08-25 · Apply the v2 audit as a new body on the proven engine, not a monorepo** —
The redesign keeps Next.js 16 + the `src/lib` engine (dual-bus audio, recorder, transcode,
container) and rebuilds the *experience* on top: `/` immersive landing, `/studio` (create),
`/read` (receive), `/classic` (the previous single-file app, preserved). The single-file shell
convention in CLAUDE.md §7 is superseded for the new surfaces: components live in
`src/components/{studio-kit,landing,studio,player}`; `src/lib` stays the shared engine.

**2026-08-25 · Two-register design language** — Register A "studio chrome" (deep navy, glass,
Geist) for the room; Register B "tape stock" (paper/ink/label-yellow/tape-red, Fraunces + Plex
Mono) for anything that *is* a story. The rule: chrome recedes, tape glows. Source of Register B:
the prompt pack's own cassette-label aesthetic. Full brief: `docs/design-direction.md`.

**2026-08-25 · Simple mode is the product; Advanced is a toggle** — Per the recovered Protocol
Vision review ("do not start with Studio Mode"), the child/family read-record-share loop is the
default and the pitch; the inspector, mix buses, and manifest readout live behind Advanced.

**2026-08-25 · SSYNC v2.1 Signature layer (draft)** — Optional `signature` block: `shareUrl`,
`ownership`, `remixOf`, `voiceConsent[]`, `rights`. Additive; v2.0 readers ignore it. Voice
consent is written by the parental gate at publish. Spec §7, schema, and `manifest.ts` updated.

**2026-09-05 · "Public" means reachable-by-link, not indexed** — Published stories are saved
`isPublic: true` so the existing Supabase read policy lets a share-code holder load them; there is
no public index (the library page is curated). A share-by-code RLS policy that avoids `is_public`
is deferred — it needs a migration applied to production, decided with Jon.

**2026-09-05 · Push after every commit** — A container recycle stranded four unpushed commits
(recovered from a bundle Jon had downloaded). Rule: commit → push immediately, always.

**2026-09-05 · Gauntlet pass 1 — verdicts and what the critics left open** — Four Opus work
packages against `docs/10x-plan.md`: Melody band 5 (r1), Studio band 5 (r1), Landing band 5 (r2,
after a /protocol horizontal-overflow fail), Player pass at band 4 (r2, after a falsified item:
"Tap to Begin" threw without Web Audio). Permanent gates live in `tests/wp-*.spec.ts` and
`tests/critic-*.spec.ts`. Known, accepted: two studio tabs on one device share the single
`ssync-studio-draft` key and overwrite each other's autosave — per-tab draft ids are a follow-up.
The `/protocol` packet diagram uses a fixed 760px viewBox and scrolls sideways on phones by
design (keyboard-reachable, legend repeats every key); a stacked narrow variant is a follow-up.

**2026-09-06 · Pre-merge once-over, lint-clean at v1** — Final pass over the whole surface before
merging PR #1. Gates on the merge head: `tsc` clean, `next build` green (6 routes), **eslint 0 errors**
(the 9 remaining errors were all in the preserved `/classic` app: two unescaped apostrophes, a
`Math.random()` starfield rendered during SSR — a real hydration mismatch, now a fixed pseudo-random
sequence — an effect-driven `setState` for the library list (now a lazy initializer; the component
only mounts after a client action), online/offline detection (now `useSyncExternalStore`), and the
unused `AIIllustrationGenerator` (now derives its image/prompt with `useMemo`). One documented
`eslint-disable` remains: hydrating the localStorage-fallback user after mount, where a lazy
initializer would disagree with the prerendered signed-out HTML. CLAUDE.md's project structure and
the single-file convention were stale since the redesign and now describe the real tree. Vercel:
the `storysynchq` project lives in the Island Dev Crew team (Standard Protection — production URL
public, previews behind Vercel auth); its last deploy predates the v2 engine, so the Git link is the
remaining step to get the redesign live.
Also in this pass: the seven demo illustrations were ~1 MB each (1024² JPEG at near-lossless
quality) against the project's own ≤ ~350 KB/page budget — re-encoded through the same
canvas → JPEG q0.82 path the app applies to every upload (6.9 MB → 1.8 MB, identical pixel
dimensions, no visible change); the PWA manifest referenced `/icons/icon-*.png` that did not exist
(generated a cassette glyph set in the tape-stock palette, all eight sizes); `public/sw.js` cache
version bumped `v1 → v2` so returning visitors' cache-first assets from the March build are purged
on activate; README replaced (it was still the create-next-app boilerplate).

**2026-10-19 · CI is the merge gate; production is SHA-stamped; Vercel deploys from Git again** —
The gates in CLAUDE.md §6 used to run only when someone remembered. `.github/workflows/ci.yml` now
runs them on every PR and every push to `main` (npm ci → tsc → eslint → next build → full Playwright
suite, desktop + mobile, against `next start`). Under CI, `test.only` fails the run and one retry is
allowed so a timing-sensitive audio test that needs it is reported as flaky, not hidden. Every Vercel
build stamps `<meta name="ssync-build">` with `VERCEL_GIT_COMMIT_SHA` ("local" elsewhere), so "is
production serving commit X" is answered from page source, not inferred. The Vercel project had lost
its Git link after March (the Sep 6 redesign deploy was pushed by hand); Jon reconnected it on
2026-10-19, so pushes to `main` deploy to production and PR branches get preview deployments again.

**2026-10-20 · The Vision Reel is the build target; handoff written for an outside builder** — Ten
reference screens (one family's week, Side A receive/make/hand over, Side B answer/keep/open up/grow)
were produced from the full recovered vision and live in `docs/vision/` with their brief, design
foundation and renders. `docs/vision/HANDOFF.md` is the spec for building the app to them: Shipped
and Next items get built, Idea and Phase 3 items stay out, work runs PRD → vertical-slice tickets →
TDD, and the result comes back to Claude for a fidelity and taste review before merging.

**2026-10-25 · T00 · Vision fixtures live in `tests/fixtures/`, generated, reproducible, guarded.**

- The Rivera family's tapes ("Twinkle Came to My Window", "Goodnight, Mia") are committed as real
  `.storysync` files. They are packed by `packStorysync`, with pictures rasterized from the reference SVG
  symbols and narration synthesized in code (WAV, 16 kHz mono; unequal peaks for T17).
- A dedicated config (`tests/fixtures/generate.config.ts`) regenerates them byte-identically. ZIP mtimes are
  pinned to each tape's `created` time in UTC.
- A guard test fails if any cast string reaches `src/` or `public/`.
- Page helpers seed the Studio draft and the device library through an init script once per tab. A reload
  keeps what the app did since, so delete and resume flows test truthfully.
- Share codes in tests are minted as 128-bit hex. The reference's 16-hex code is exported for reference only.

**2026-10-25 · Tape labels are derived, never typed (T01)** — The landing's protocol teaser printed a hand-typed `SIDE A · 8 PAGES · 4:32 · AAC/M4A` for the house tape. That tape has no recorded voice and runs about 1:47. All runtime and label arithmetic now lives in `src/lib/storysync/tape-meta.ts`:
- `estimateRuntimeSeconds`: words ÷ 2.5 plus the autoPause sum, 3 s default, `ms` honoured.
- `narrationKind` and `tapeMetaLine`.
- The Player's `timing.ts` re-exports `estimateSeconds` / `parseDuration` / `formatClock` from it. The Player cover keeps its 20 s floor.

The landing imports `public/demo/brave-little-star.ssync.json` statically, at build time with no runtime fetch. The teaser's title, author and meta all come from it, so the label now reads `SIDE A · 8 PAGES · ~1:47 · READ-ALONG`.

The narration kind is:
- `READ-ALONG` when no page has `audioUrl`.
- `AAC/M4A` only when every recorded page is AAC.
- `WAV` when any recorded page is WAV.
- `RECORDED` when a recorded page's codec is neither declared nor readable from its URL. A label never claims a codec on a guess.

The protocol rule sentence ("Published narration is always AAC/M4A …") stays: it is a rule about published tapes, not a claim about this one.

**2026-10-25 · T04a · The validator warns; consent dates are calendar dates; one consent record per voice.**

- `validateManifest` returns `warnings: string[]` alongside `errors`. A warning is drift from the v2.1 draft that
  still opens and plays. It never makes `ok` false, never makes `packStorysync` or `unpackStorysync` throw, and
  never blocks a publish. Errors keep their exact wording.
- `signature.voiceConsent[].date` is a calendar date, `YYYY-MM-DD`: the consenting device's local date. Readers
  MUST accept the full ISO timestamps older tapes carry, and validators SHOULD warn:
  - `signature.voiceConsent[i].date is a full timestamp; the v2.1 draft asks for a date`
  - `signature.voiceConsent[i].date "<value>" is not a calendar date (YYYY-MM-DD)`

  The schema keeps `format: "date"` and adds no `pattern`, so the rule never becomes a schema failure.
- There is one `voiceConsent` record per recorded voice. `grantedBy` is conventionally `"parent/guardian"` or
  `"self"` (free text allowed; there are schema `examples`, not an enum). A tape with a recorded voice and no
  record warns `a recorded voice is on this tape but signature.voiceConsent is empty; the v2.1 draft says it
  SHOULD carry one`.

**2026-10-25 · T03 · The narrator is the lead name of "story by", and only for a recorded voice.**

- At publish, `metadata.narrator` is derived by `src/lib/storysync/narrator.ts`:
  - `resolveNarrator({ byline: <gate's story by>, existing: <draft's narrator>, hasRecordedVoice: <any published
    page has text.audioUrl> })`.
  - Without a recorded voice it is `undefined`, and the Creator **deletes** the key. A tape read by the browser
    voice never names a person, even when "story by" is filled in or the draft carried a narrator.
  - Otherwise the byline's lead name wins, then the draft's existing narrator. A re-publish with a new "story
    by" replaces the old name; it is not sticky.
- The lead name is the text before the first `,` · ` - ` · `—` · `–` · ` with ` (any case) · `(`.
  - Em and en dashes count with or without spaces; a bare hyphen inside a name does not.
  - Whitespace is collapsed and trimmed, the name is capped at 40 characters (code points), and an empty result
    is `undefined`.
  - Example: "Ada, age 4 — with Dad" → "Ada".
- The Player shows the name in two places:
  - the cover meta, which already printed `· VOICE: <narrator>`, uppercased by the tape label's CSS;
  - the deck chip, as a hairline, a lucide `Mic` at 12 px and the name.

  The deck stays `aria-hidden`; the cover meta is the accessible statement.
- Below 768 px, the deck's narrator part folds away while the top chrome is up: its width, its gap and its
  opacity. The pill keeps its counter-only size and stays clear of the chips. The part opens again when the
  controls idle out.
  - Reduced motion means no transition.
  - On phones the chrome also stays up on the end card and while paused, so the name is hidden there too. This
    is accepted: the deck is decorative (`aria-hidden`), and the cover meta carries the name for everyone.
- **Open Question 5 (Jon):** No reference screen draws a narrator field, so "story by" stands in. If a parent
  types "story by: Mom" over the child's voice, the cover says "VOICE: MOM".
  - Should the Creator ask "Whose voice?" explicitly? T14's "Whose voice is on this tape?" is the natural place.
  - If it does, that answer should take precedence over the byline. That is a small change to the order inside
    `resolveNarrator`, and its Node test pins the new order.

**2026-10-25 · T05a · SSYNC tokens live on `:root`; next/font variables sit on `<html>`.** The reference foundation tokens (`--ss-*`, `--mood-*`, `--ss-layer-*`, `--ss-ease`, `--ss-display/-ui/-mono`) are defined once, on `:root` in `src/app/globals.css`, and exposed to Tailwind 4 through `@theme inline` (`bg-ss-navy`, `ease-ss`, `font-ss-display` …). `src/components/studio-kit/tokens.ts` is the typed mirror, for SVG attributes, canvas and tests only. `tests/vision-tokens.spec.ts` fails if the CSS and the mirror resolve differently on `/`, `/read`, `/studio` or `/protocol`.

Because `:root` type tokens reference `var(--font-*)`, the next/font variable classes moved from `<body>` to `<html>`. A custom property is substituted where it is declared, so on `<body>` the type tokens computed empty.

The kit's layout convention: existing primitives stay in `kit.tsx`/`kit.css`, and each new shared component is its own `studio-kit/<Name>.tsx` (plus a scoped `<name>.css` when needed), imported from that file directly.

T05a is the only M0–M5 ticket that edits `globals.css`.

**2026-10-25 · T04b · The Creator writes one consent record per recorded voice, dated with the device's local
calendar day.**

- A recorded voice is keyed per page by `text.voice`, then "story by", then "narrator". `recordedVoices` returns
  them distinct and in page order (`src/lib/storysync/consent.ts`). The gate asks once per voice and the publish
  writes `consentRecords(voices, "parent/guardian", consentDate(now))`.
  - With one voice, the gate is exactly s04's row (`#studio-gate-consent`).
  - With several, each row carries the voice's name over the same sentence, and Continue (and Enter) waits for
    every tick.
  - A tape with no recorded voice carries no `voiceConsent` key.
- **M0-PRD Open Question 6 (per-voice ticking vs one checkbox listing the voices): per-voice ticking.** Consent to
  one recording is not consent to another (M0 story 9), and per-voice rows map one-to-one onto the records the
  file carries. Renaming the "story by" voice keeps its tick (same recordings, new credit). Any change in which
  recordings a row stands for clears every tick.
- **M0-PRD Open Question 7 (which day is "the date"): the consenting device's local calendar date.** It is built
  from `getFullYear` / `getMonth` / `getDate`, never `toISOString`, so 11:30 pm on Oct 19 in Los Angeles writes
  `2026-10-19` although UTC says Oct 20. It is the day the grown-up would name, and it matches the stamp's "OCT 19
  2026".
- The writer enforces the gate: `runPublish` refuses to assemble a tape with a recorded voice missing from the
  consented list.

**2026-10-25 · T05b · Tape stock is one implementation: TapeLabel inside Cassette; reels rest at 18°; reel face is contextual.** The kit `Cassette` (`studio-kit/Cassette.tsx` + `cassette.css`) renders the reference `.ss-cassette` and uses the kit `TapeLabel` for its label (class `sk-cassette-label`), so the band, holes, "STORYSYNC", title and meta can never drift between a label and a cassette. The cassette is `aria-hidden` and scales internally with container units. `Reel` draws the reference `#i-reel` geometry. Its spin keyframes start at 18°, so a reel at rest or under reduced motion sits on the reference's static 18° frame. Its face is `--sk-reel-face`: paper in tape-stock contexts (the Cassette window), and a faint ink tint by default so reels on studio chrome keep reading light-on-dark. `Reel.size` accepts a CSS length as well as px.

**2026-10-25 · T10 · A page's `music.duration` is the crossfade into that page's mood; the Player reads it through a pure music plan.**

- **Where the answer lives.** `src/components/player/music-plan.ts` is the one place that says which mood a page plays
  and how long the bed takes to cross into it. The Player's private mood logic moved there unchanged, and a frozen copy
  in `tests/vision-music-plan.spec.ts` proves it.
  - Callers: the Player, T12's liner notes and T24's per-page moods.
  - Relative imports only, so Node tests import it.
- **The crossfade.**
  - **Whose duration.** The duration belongs to the page being entered, whichever way the reader turns. Going back
    6 → 5 on the house tape uses page 5's 1.6 s, not page 6's 3 s.
  - **Default.** 1.6 s. It has one source: the bed's exported `DEFAULT_CROSSFADE_S`.
  - **What parses.** A non-negative `"Ns"` / `"Nms"` / bare-seconds string, clamped to 0.05–10 s. Anything else is the
    default; for example, `"-2s"` is the default, not the floor.
  - **Starting from silence.** It is not a crossfade. The bed keeps its own pad fade-in, and the duration does not
    apply.
- **Engine and bed.**
  - `startMusic` / `setMood` take an optional crossfade in seconds; when it is omitted, the behaviour is unchanged.
  - Both expose a read-only `lastCrossfadeSeconds` (null before the first crossfade).
  - `window.__ssyncPlayer.crossfadeSeconds()` reads it. It is a getter only, and nothing leaves the device.
- **Duck depth.** The engine exports `DUCK_DEPTH_DB = -20·log10(DUCK_FACTOR)` ≈ 12.04, so the UI can print "12 dB"
  from the real constant (T09a, M5).
- **Spec and schema.** §4 of the format spec documents the rule, and the v2 schema's `duration` gains a matching
  description with no structural change.

**2026-10-25 · T11 · `settings.accessibility` holds the storyteller's defaults; the viewer's own choices win, and only
those are stored.**

- **Where the answer lives.** `src/components/player/prefs.ts` is the one place that says how a page reads for this
  viewer.
  - It resolves field by field: the viewer's explicit choice, else the tape's default, else the product default.
  - Pure, relative imports only, so the Node tests import it.
- **What a tape can ask for.**
  - `highContrast: true` → high contrast.
  - `dyslexiaFont: true` → the easier-to-read font.
  - `false` is the schema default and is treated as absent.
  - `timingMultiplier` keeps its job: it scales every pause, and the viewer's pause and speed multiply on top. A
    broken multiplier reads as 1.
- **What is stored.**
  - Only choices the viewer actually made, under the unchanged key `ssync-reader-prefs`, in a sparse shape with a
    version marker: `{ "v": 2, "contrast": false }`.
  - On this device only, never sent anywhere (COPPA posture).
  - Opening a tape writes nothing. Before T11 the Player rewrote the whole prefs object on every mount.
- **Legacy entries.** A full object from before T11 counts as explicit only where a value differs from the product
  default. So the all-defaults object every old reader wrote means "no choices", and a stored `contrast: true` stays a
  choice. Legacy entries are not rewritten until the viewer changes a setting.
- **What the viewer sees.**
  - A switch whose value comes from the tape says "Set by the storyteller".
  - Turning it off is a choice that wins on every tape afterwards: "viewer preferences still win", s08 / HANDOFF §4.
  - The sheet's footer says "Saved on this device only" (s02 figure C).
- **The HC skin.** It is now pure white semibold, spoken words included, to match s02 figure C.
- **Spec.** `docs/format-spec.md` §4: "Players SHOULD apply `settings.accessibility` as defaults; a viewer's own
  choices override them, and are stored on the device only."

**2026-10-25 · T15 · The Creator opens any tape to re-voice it: pictures, words, pauses and mood carry over; voices,
voice names and the signature never do.**

- **Re-voice rules** (`src/lib/storysync/revoice.ts`, pure):
  - Version "2.0", `created` = now, and pages renumbered 1…n.
  - Kept: title, author, language, genre, ageRange and description; settings; each page's illustration, words (and
    their other text fields), timing, layout and unknown page fields.
  - Removed: `narrator`, `coverImage`, the whole signature, and per page `audioUrl`, `audioCodec`, `voice` and `music`.
    Also every other top-level field: a v1 tape's `voices` and `music` tables describe the source's voices and beds.
  - The mood is the first page's music through `resolveMood` (else Wonder). Music is on when any page had music.
  - `remix.of` is the source's `shareUrl`, else the app URL it was loaded from (house:
    `<origin>/demo/brave-little-star.ssync.json`; a code: `<origin>/read?story=<code>`), else `"<title>" by <author>`.
- **Pictures** are re-encoded through the shipped pipeline whatever their source. They are fetched only from this
  app's own `/demo/`, and never for a file. A picture that cannot be read is dropped and its alt kept, so an opened
  draft is self-contained.
- **One resolver.** `/read?story=` and `/studio?open=` share `loadTapeByCode` (`src/lib/storysync/tape-source.ts`):
  the cloud first, then this device.
- **Publishing a re-voiced tape.** The author is the original. The byline ("read by") is the reader: narrator and
  consent voice. Ownership is `© <year> <original author>` and `signature.remixOf` = `remix.of`.
- **Never lose a story.** Opening over a story, or over a saved draft at `?open=`, asks "Open <title>?" first.
  Autosave writes only on change, so keeping a story leaves its stored draft byte-identical.
- **Magic ends a re-voice.** Magic replaces every page, so the story is a new one. It drops the remix record, and over
  an opened tape it also drops the opened tape's metadata (author, description). The gate goes back to "story by", and
  the byline becomes the author. A publish then writes no `remixOf` and claims nothing of the source's credit.
- **M3-PRD Open Question 2 (opening your own tape on a new device): voices are always dropped, for now.** A tape's
  recorded voices and consent records never come along when it is opened, even when it is your own. Telling "mine" from
  "someone else's" needs an identity the file does not carry. A consent record names a voice and a grantor, not a
  device or an account, so matching them cannot prove ownership. Offering "Keep the voices on this tape (and their
  consent records)" is left to Jon; T15 does not build it. Until then, a parent who wants to keep editing her own tape
  keeps the draft on the device that made it.
- **M3-PRD Open Question 3 (credit on a re-voiced tape): the original author keeps `metadata.author` and the ownership
  line. The reader is credited as `metadata.narrator` and in the consent record, not in ownership.** `remixOf` falls
  back to the title text `"<title>" by <author>` only when the source has no link and no app URL, which in practice
  means a `.storysync` file that was never shared. That fallback is a readable id, not a URL. The schema's "share URL or
  id" admits it, and nothing in the app parses `remixOf`. Whether ownership should also name the reader is Jon's
  call. Today it does not, because the reader owns their recording, not the story.
  - **For Jon, onward sharing of unlisted links.** For a tape opened by code, `remixOf` (and therefore the re-voiced
    tape) carries `<origin>/read?story=<code>`. That is the source family's unlisted share code. When it has a
    `shareUrl`, the `shareUrl` is carried instead, which is the same link. So anyone who receives the re-voice can
    open the original family's tape, including its recorded voices, for as long as that family keeps it published.
    This is consistent with the ticket (`remix.of` is the `shareUrl`, else the app URL it was loaded from). However, it
    passes an unlisted link on beyond the people it was first shared with. The alternatives are to keep the code out
    and write the readable `"<title>" by <author>` id instead, or to ask at the gate ("Credit the original with its
    link?"). T15 builds neither. Until Jon rules, the link travels.


**2026-10-25 · T08 · The Reader opens a book on wide screens; Space pauses, P is music.**
At ≥ 1024 px wide and landscape (`useSpread`, a client-only `useSyncExternalStore` whose server snapshot is
"stacked"), every non-title page with a picture and words renders as a two-page spread. The picture is on the left
at its natural aspect (the box is sized from the loaded image's ratio; never cropped or stretched). The words are on
a sheer Register-A right page (440/560 of the left page's height) under a mono "PAGE n · MOOD" kicker. The book's
height is `min(100dvh − 140px, (100vw − 120px) / 1.7857, 880px)`. Phones and portrait tablets keep the full-bleed
and stacked pages unchanged. Spread styling lives in `src/components/player/spread.css`; `player.css` is not
edited.

The s02 keyboard hint "← → turn · space pause · P music · esc close" is printed verbatim. The bindings changed to
make it true:
- **Space now toggles pause** (it used to turn the page);
- **P now toggles the music** (it used to pause).

Arrows and Escape are unchanged, and Space on a focused control still belongs to that control. No existing test
asserted the old Space or P bindings.

**2026-10-25 · T09a · The deck chip states the three sounds; the book makes room for it.**
- **Rows:** from 768 px the Player's deck chip (kit `DeckChip`) is a `role="group"` named "Now playing" with three
  mono rows. Their words come from one pure module, `src/components/player/deck-status.ts`, which reads the manifest
  and live flags only. The MELODY number is `round(DUCK_DEPTH_DB)` from the engine, never a literal.
- **Countdown:** it ticks once a second, only during the hold the Player already schedules, and is never `aria-live`.
- **Whose voice:** the name is shown exactly once at any time. While the chrome is up, the VOICE row names the
  narrator (≥ 768); when the chrome idles out, the rows fold and T03's mic + name opens. This is now the rule at
  every width; T03 previously kept the name always open at ≥ md.
- **Book clearance:** in spread mode the book's top edge moves to 98 px. `deck.css` overrides spread.css's
  `--pl-spread-reserve-y` and re-centres with `padding-top`. The book is 950×532 at 1120×700 (was 1000×560), the
  render's chip-above-book composition, with T08's ≥ 75 % vh and centring rules intact.
- **Last page:** CHIME reads "last page" and the foot "the end in N s", because the automatic end does not chime.
- **Open question for Jon:** should the automatic end chime like a manual "next" on the last page does?

**2026-10-25 · T13a · The room fits the tablet; the Stage borrows the light; only reels loop.**
- From 768 px wide and 600 px tall the Studio shell is exactly one viewport (`height: 100dvh`). The rail runs the full
  height beside the Stage, the strip and the Transport (s03). From 1024 px an open tool card docks in its own `tool`
  column between the rail and the Stage (320 px). Below that it floats (768–1023 px) or is a bottom sheet (phones), as
  before.
- The Stage's picture zone is a CSS size container. The photo frame is the largest box of the photo's own aspect ratio
  that fits with a margin.
- The Stage's backdrop is the page's own picture (`blur(36px) brightness(.5)`, no Ken Burns). A picture-less page keeps
  the last picture's light (the Player's rule). That memory is per story (`storyKey` = the draft's `startedAt`), so
  "Delete everything" leaves no trace of the deleted pictures on screen.
- `ListeningRing` is a new kit piece. There was no T05d, so this ticket built it to the s03 inset spec. The ring is
  declared on the wrapper's `box-shadow` and painted over the child by a `::after` that inherits it, clipped to the
  frame.
- "Nothing loops in the Creator except reels" (brief): inside `.studio`, the kit's record-ring pulses
  (`BigButton` red, Transport REC) hold a frozen frame at opacity .55. Other routes keep the kit default.
- Below 400 px the Studio's transport keys are 52 px, so a 375 px phone does not scroll sideways, and the readout stays on
  one line (round 1).
- Round 1: the tool card's container comes right after the rail in the DOM and before `<main>`. Grid areas place it,
  and z-index 47 keeps a floating card or sheet above the Stage. Tab order is therefore rail → card → Stage, the order
  the eye reads (WCAG 2.4.3).
- Round 1: the docked Voice card's take stands at the card's foot (s03). On screens under 700 px tall, the card's body
  scrolls and the privacy footnote stays pinned at its foot. Nothing in the card clips the live ring during a take.

**2026-10-25 · T09b · Where the tape is: tape packs on the reels and a segmented strip that never hides.**
- **One module:** the reader shows its place as a cassette does, from one pure module,
  `src/components/player/tape-position.ts`.
  - `p = (page index + in-page fraction) / page count`.
  - Pack diameters `left = big − (big − small)·p`, `right = small + (big − small)·p`, with big = 1.55 × and
    small = 1.05 × the chip's reel (18 px pill, 20 px expanded; `DECK_REEL_PX`).
  - The strip has one segment per page, each holding its page's share of p.
- **In-page fraction:** the recorded clip's `currentTime / duration` (on `timeupdate`), or the browser voice's
  `(spoken word + 1) / words` (boundary events, whether or not the read-along lights words), then 1 once the voice or
  a wordless page's beat is done.
  - It is reset only when a page comes on screen (`enterPage`), so a forward turn never moves the tape back.
- **Motion:** sizes and fills ease out over 600 ms (`--ss-ease`); under reduced motion they snap (0 s).
- **The strip:**
  - It is a `role="progressbar"` (never a slider, no timecode) and stays on screen when the chrome idles out, as in
    s05.
  - Phones: 16 px gutters at `bottom: max(19px, safe-area)`, with the transport moved above it.
  - The open book: a tape-brown strip on the bottom edge with a 6 px tick per page.

**2026-10-25 · T13b · The filmstrip is a strip of tape: one scrolling track, a kit TapeRibbon, a per-page mood lane.**
- **Kit:** `TapeRibbon` (`studio-kit/TapeRibbon.tsx` + `tape-ribbon.css`) is the brief's LOCAL (3) tape-brown band: `data-sk="tape-ribbon"`, `variant="band"`, always `aria-hidden`, thickness by `--sk-ribbon-h` (12px default; the filmstrip spine is 10px, as s03). Static. The curved SVG variant is added by its first consumer (T20).
- **One track:** the ribbon, the frames and the mood lane share one horizontally scrolling track, so they scroll together on a phone. The ribbon runs the full track width behind the frames at mid-height; the frames row passes pointer events to its tiles only, so between frames the ribbon is what is hit.
- **Pinned controls:** the move controls (and, mid-take, the locked "move" pill) are `position: sticky; right: 0` in the track, so they sit on the ribbon at the strip's right end, as in s03, and stay in reach when the strip scrolls. Two parts keep a tile clear of them:
  - `scroll-padding-inline-end` covers the strip's own `scrollIntoView` calls: the Transport's page turn and a click on a frame.
  - A focus handler on the scroller covers Tab. The browser's focus scroll ignores scroll-padding and skips a tile that is already inside the scroller. One frame after keyboard focus, a tile that is not inside the padded scrollport is centred (`inline: "center"`), so it is its own snap position under proximity snapping.
- **Mood lane:** `Filmstrip` takes `moods: (MoodName | null)[]`, one per page. The Studio passes `musicOn ? mood : null` for every page today; T24 fills it per page. One 8px segment per page in `--mood-<name>`, under its frame; the label names the current page's mood ("WONDER · GENTLE MUSIC ADDED FOR YOU", uppercase by CSS) and wraps under the lane, right-aligned and sticky, rather than widen the tape. No page with music → no lane.
- **Snap the next drawing** replaces "+": add a page, then open the shipped camera input in the same gesture.
- **Frame size:** 112×84 at ≥ 1024px wide and ≥ 700px tall; 84×62 otherwise. A short laptop keeps the small frames so the docked Voice card's body fits (T13a's 700px line). From 1024 to 1179px wide the same frames are packed tighter: 10px gap, 12px inset, a 104px Snap tile and a slimmer housing. Five pages, the Snap tile and the move controls then fit an iPad held sideways, and the Snap tile is never under the controls on load.
- **`addPage` returns whether it added a page.** The Snap tile reuses its mid-take guard instead of repeating it.

**2026-10-25 · T12 · The end card is a modal dialog with liner notes from the tape alone.** The end card moved out of
`Player.tsx` into `src/components/player/EndCard.tsx`; it prints a J-card (`src/components/studio-kit/JCard.tsx`, the
brief's shared piece 10) from `src/components/player/liner-notes.ts`, a pure mapping that uses only manifest fields
and omits any row without data (no credits, no MADE IN, no device, no counts). Consent dates print from their own
calendar parts (UTC check), never the local clock. The J-card's rows set its height; the spine's printed line is
laid out of flow and cut to fit, so a child's long title can never stretch the card. The card is `aria-modal`, takes focus when it opens and keeps Tab
on its controls; Escape still exits; "Read it again" hands focus to the stage, so Space and the arrows keep their tape
meanings. The CONSENT row carries its lines as fields (`voice?`, `granted`, `date?`, `tail`), so no renderer parses the
printed text. The `/protocol` link is not prefetched, so nothing is fetched until a listener
follows it. Three brief colours were raised for AA contrast (J-card keys 62% ink, "PASS IT ON" in `--ss-red-ink`, the
privacy line in `--ss-fg-3`). From 880px the card lays out in two columns so a laptop sees all of it.

**2026-10-25 · T14 · The grown-up moment shows what goes into the tape; consent carries its own grantor.**
- **Two objects.** `ParentGate` is one `role="dialog"` holding two objects: the Register-A gate and a Register-B sheet, "What goes into your tape". They sit side by side from 1024px and in one scrolling column below it.
- **One source for the sheet.** The sheet's seven rows come only from `src/components/studio/tape-sheet.ts` (pure), so the sheet cannot drift from what Continue writes. A test compares the published manifest with the sheet text captured before Continue.
- **Kit pieces.** `PacketBands` and `ConsentStamp` are kit pieces (`src/components/studio-kit/`) built by their first consumer. `ConsentStamp` exposes `data-inked`, presses once in 420 ms, is static under reduced motion, and announces once through a polite live region.
- **Grantor per voice.** Voice consent is now `{ voice, grantedBy }` per recorded voice: `"parent/guardian"` by default, or `"self"` when the grown-up answers "Mine — I'm the grown-up speaking" (s06). `consentRecordsFor(choices, consentDate(now))` writes them. Changing a voice's answer clears its tick.
- **The byline is the author.** For a tape made in the Studio, the gate's byline is always written to `metadata.author`, an empty one included. A cleared byline no longer leaves the draft's old author on the tape. Re-voiced tapes keep their author (T15).
- **Pauses as the Player plays them.** The sheet's Behavior row reads pauses the way the Player will: a page without `autoPause` uses `pauseBetweenPages`, else 3 s.
- **Picture size.** "about N KB" is the mean decoded size of the page pictures, in KiB, to the nearest 10, or the nearest 1 under 5.

**2026-10-25 · T02 · One share-code minter, 128 bits, never weakened; migration 002 is HITL.**

- **One minter.** Every share link, on the device and in the cloud, is minted by `mintShareCode()` in
  `src/lib/share-code.ts`: 16 bytes from `crypto.getRandomValues`, as 32 lowercase hex characters.
- **No fallback.** Without a CSPRNG, or with one that fails when asked, it throws `ShareCodeError`. `shareBook`
  catches only that error and reports "Making the link: this browser cannot make a private link safely. Download the
  .storysync file instead." A guessable link to a child's voice is worse than no link. Local story ids may still fall
  back to a non-secret value, because ids are not links.
- **Explicit cloud codes.** The cloud insert writes `shareLinkRow(storybookId)`, so links never depend on the column
  default.
- **Old links keep working.** Cloud links made before share codes became 128-bit used 64-bit codes. They resolve by
  exact match, with no length check, until their story is deleted (PRIVACY.md rule 4). The cutoff is this change,
  not a calendar date: until it deploys, new cloud links still take the 64-bit column default.
- **No gallery query.** The unused public query `getPublicStorybooks` is deleted, so `src/` has no query that lists
  other people's stories.
- **Migration 002 is HITL and pending.** `supabase/migrations/002_share_code_128bit.sql` only changes
  `shared_links.share_code`'s default to `encode(gen_random_bytes(16), 'hex')` and changes no row. Jon applies it to
  production; it is optional for the app.
- **Raised, not fixed** (M0-PRD Open Questions):
  - **OQ1, RLS enumeration.** The broad SELECT policies on `shared_links` and `storybooks` still let anyone holding the
    anon key list share codes and published stories. Proposed fix: T02b (migration 003 plus a by-code RPC).
  - **OQ3, counter columns.** `shared_links.views` and `storybooks.view_count` now have no reader or writer in `src/`.
    Dropping them needs Jon's yes.

**2026-10-25 · T16 · Publish card: phone order is DOM order, tape budget, no false "saved"**
- **Phone order is DOM order, not CSS `order`.** The ready card chooses two columns or one from `(min-width: 1024px)` (`useSyncExternalStore`, client-only) and sets `data-layout`; `publish-card.css` lays out from that attribute. Below 1024 the left column's lower half (meter, Download, Back, delete, fine print) renders after the link column, so Tab and screen-reader order match visual order at every width (WCAG 2.4.3 / 1.3.2), and a half-typed sign-in survives an iPad rotation.
- **Tape budget.** `TAPE_BUDGET_BYTES` = 15 × 1,048,576 (format-spec §5 "≤ 15 MB"). The size meter shows an over-budget tape in tape-red with " · over the 15 MB budget" in its value text and blocks nothing; `aria-valuenow` is clamped to the budget while the value text keeps the true size.
- **No "Saved on this device" when nothing was saved.** When the save step fails, the ready card drops that sentence; the sign-in offer stays.

**2026-10-25 · T06 · The hero's one light is anchored in CSS, and insertion depth is the well's height.** The play key and HeroSky's 0×0 anchor read the same custom properties (`--ls-key-size`, `--ls-key-lift`) from `.ls-tape-stage`. The deck is the stage's last child and has no border, so the key and page 1's star are one point at every width, with no layout script. The sky box is offset by the star's fixed position in the house tape's page-1 picture (64.1% × 46.2%). How deep the tape sits in the deck is `--ls-tape-depth` (0.68 poised; 0.27 seated under reduced motion), applied as the well's `aspect-ratio: 1.6 / depth` on its content box. `[data-ls="tape-slide"]` therefore stays untransformed at rest, and `ls-insert` travels from whatever depth the well shows. The hero's title is the demo manifest's `metadata.title`, never typed into a component.

**2026-10-25 · T23a · `/protocol` FIG. 1 explodes the house tape's real page 3, and empty layers say so.**
- The exploded packet is computed, not drawn. `packetPlates()` (pure, `src/components/protocol/plates.ts`) reads the
  manifest through the Player's own music plan, `MOODS` and the engine's duck constant.
- The kit's `PacketExploded` renders the result and holds no story content.
- The Visual plate prints the path the download really writes. To guarantee that, the container's data-URL naming rule is
  now an exported pure helper, `packedAssetPath()`, which `buildStorysyncFromStory` uses itself.
- A layer the tape does not use prints a plain-words empty value in ink-3 italic.
- The Signature seal is drawn unsealed (a dashed outline) until a consent record exists, so the figure never implies
  consent the tape does not carry.
- The legacy v1 `signature.qrCode` is never surfaced.
- The figure is static at every width and motion preference, and is flat below 768 px.

**2026-10-25 · T17 · "Evening out each voice": loudness levelling before AAC.**
- **Where.** `src/lib/audio/level.ts` is pure: no DOM, no Web Audio, no dependencies. It runs on the device at publish, so a child's voice never leaves the device to be levelled. `normalizeNarration(blob, mime, { level: true })` uses it; without the option the function is byte-for-byte what it was, and `/classic` never passes it.
- **Measure.** Active-speech RMS is computed over 50 ms windows; windows under −50 dBFS are ignored, and an all-silent take is left alone.
- **Target and clamp.** −20 dBFS RMS. The gain is clamped to [−12, +18] dB. T17 proposed +15, but a −26 dBFS-peak whisper measures about −37 dBFS RMS, and +15 left it 2 dB short. No gain is applied within ±0.5 dB of the target. After the gain, the result is re-measured and nudged to within 0.1 dB, so a second pass is the identity.
- **Limiter.** A sample-wise soft knee from −6 dBFS, tanh-shaped with slope 1 at the knee, toward a −1 dBFS ceiling that no sample passes. Below the knee the gain is exactly linear.
- **Codec policy.**
  - WAV (16-bit PCM mono) is levelled in place, with the same header, rate and length.
  - Other WAV layouts are decoded, and stay as recorded when already even.
  - Draft Opus/WebM is decoded, levelled, then goes AAC, else WAV, in the same single pass.
  - AAC/MP4 (Safari) is decoded, levelled and re-encoded as AAC, but only where a WebCodecs AAC encoder exists. Otherwise it is left exactly as recorded (`aac-encoder-unavailable`), and never turned into a WAV just to level it (M3-PRD OQ 5).
  - Any compliant clip that will not decode (`undecodable`) or re-encode (`encode-failed`) is left as recorded.
  - Opus/WebM is never an output.
- **Once.** `RecordingMeta.levelled` marks a take that has been levelled or found even. Such a take passes straight through on later publishes, so a re-publish writes identical clips. A new take levels only its own page, and a clip published with levelling off is levelled on the next publish with it on.
- **UI.** The publish list gains "Evening out each voice" first (id `level`). Its detail is `<even>/<total>`, plus " · k left as recorded" for skipped takes, or "off", or "no recordings". It is always done: levelling never fails a publish.
- **Inspector.** Mix ends with the switch `#insp-level-voices`, on by default. Its setting, `StudioState.levelVoices`, is draft-only and never written to a manifest.
- **Label.** "Evening out each voice", not s09's "Voice clean-up (level, rumble)": no rumble filter is built (M3-PRD OQ 4).
- **Open for Jon.** OQ 4 (rumble high-pass and the s09 label), OQ 5 (the AAC passthrough policy), and OQ 6 (the −20 dBFS target, and now the +18 dB boost ceiling).

**2026-10-25 · T02b · A shared tape is read by its code only; migration 003 is HITL and pending Jon's apply.**

- **One way in.** A link holder reads a story only through `public.storybook_by_share_code(code text)`. It is
  SECURITY DEFINER, STABLE and STRICT, with `search_path = public`, and executable by `anon` and `authenticated`. It
  returns the one published storybook whose share code equals `code` exactly, with only the Reader's columns: no
  `user_id`, flags or counters.
- **Broad reads dropped.** Migration 003 drops "Anyone reads shared links", "Anyone reads public storybooks" and
  "Public media readable". Every owner policy stays. Media is not read separately, because pictures and narration
  live in `ssync_data`.
- **`is_public` still gates a link.** The function keeps today's rule that only published stories open by link, so the
  migration narrows access and never widens it.
- **The app does not wait for Jon.** `getStorybookByShareCode` calls the RPC first. Only on PGRST202/42883 ("function
  not found") does it fall back to the exact-match two-step select. Any other RPC error is reported as a `CloudError`.
  A code that is not lowercase hex never reaches the network.
- **Migration 003 is HITL and pending.** Jon applies `supabase/migrations/003_share_lookup_by_code.sql` to
  production. Until he does, the database still allows the enumeration that M0-PRD Open Question 1 describes, although
  nothing in `src/` performs it. Once he has, the fallback can be deleted.
