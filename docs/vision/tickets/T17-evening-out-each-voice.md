# T17 · "Evening out each voice": loudness levelling before AAC, a publish step, an Inspector toggle
Milestone: M3 · Reference: s05 step list (brief screens[4]); s09 Inspector Mix row (brief screens[8]) · Status in reel: Next
Type: AFK (agent can finish alone)
Blocked by: T00 (uneven fixture clips), T16 (file order on `Studio.tsx`; the step renders in T16's card)   ·   Blocks: T24 (file order on `Inspector.tsx`, Mix section)

## Why
Mia whispers "We flew over the moon!" and shouts "This is Twinkle." Grandma Rose turns her phone up for page 4 and gets
blasted on page 5.

s05's step list carries the line **"Evening out each voice · planned"** under a violet "Next". The s09 Inspector carries
a clean-up row with a switch, and the roadmap names "a voice clean-up pass, the planned AudioEnhancer (5, 9)".

HANDOFF §9 defines it: "loudness levelling (OfflineAudioContext gain to a target RMS + gentle limiting) before AAC; a step
in the publish list; toggle in Inspector".

It must keep every promise the codec rule makes:
- published narration is AAC/M4A, WAV the only fallback, Opus/WebM never;
- a child's voice is never sent to a server;
- `/classic` stays untouched.

## Done when (acceptance, each testable)
- [ ] **A pure levelling module** works on mono `Float32Array` PCM:
  - `activeRmsDb(pcm, rate)`: RMS in dBFS over 50 ms windows, ignoring windows below −50 dBFS. All-silent returns
    `-Infinity`.
  - `levelGainDb(rmsDb)`: target −20 dBFS, clamped to [−12, +15] dB. Returns 0 when |gain| < 0.5 dB, or when the input
    is silent.
  - `applyGainAndLimit(pcm, gainDb)`: soft-knee limiter with knee −6 dBFS and ceiling −1 dBFS. The output never exceeds
    the ceiling, and samples below the knee are scaled exactly linearly.
  - `levelPcm(pcm, rate)` returns `{ pcm, gainDb, outcome: "applied" | "unchanged" }`.
  - It has no DOM, no Web Audio and no dependencies, so it is Node-importable.
- [ ] **WAV is levelled in place.**
  - `levelWav(bytes)` parses 16-bit PCM mono WAV, levels it and writes 16-bit PCM mono WAV at the same sample rate and
    length.
  - Other WAV layouts (stereo, 24-bit, float) go through the decode path below.
  - If the gain is 0, the original bytes are returned unchanged (identity).
- [ ] **`normalizeNarration` gains an optional `{ level: true }`.** Without the option, output is byte-identical to today
  for every input, so `/classic` and every existing caller are unchanged. With it:
  - WAV → `levelWav`;
  - draft Opus/WebM → decode (the existing OfflineAudioContext path), level, then the existing ladder (AAC if WebCodecs
    can, else WAV) in the same single pass;
  - AAC/MP4 passthrough → decode, level and re-encode AAC only when the AAC encoder is available. Otherwise the clip is
    returned unchanged with `levelling: { outcome: "skipped", reason: "aac-encoder-unavailable" }`. It never converts to
    WAV just to level;
  - any decode failure → the original clip unchanged, `outcome: "skipped"`, reason "undecodable".
  - The result carries `levelling: { outcome, gainDb?, reason? }`.
  - Opus/WebM can never be the output.
- [ ] **A publish step.** "Evening out each voice" is the first step in the publish list (before "Converting voices to
  AAC"), with id `level`.
  - Its detail reads `<levelled-or-at-target>/<total>`: "5/5" for Twinkle.
  - When any clips were skipped it appends " · <k> left as recorded" (e.g. "4/5 · 1 left as recorded").
  - With levelling off: "off". With no recordings: "no recordings".
  - The step reaches `done` in every one of these cases. Levelling never fails a publish.
  - It renders in T16's ready card and in the publishing dialog.
- [ ] **The published voices are even.** Publishing the Twinkle draft (fixture peaks about −9 / −20 / −14 / −26 / −12
  dBFS) writes five WAV clips (this Chromium has no AAC encoder; with one they are AAC) where:
  - each clip's active RMS is within ±1 dB of −20 dBFS;
  - the spread between the loudest and quietest is ≤ 2 dB (it was about 17 dB in the fixture);
  - every sample peak is ≤ −1 dBFS;
  - each clip keeps its duration within 10 ms and its sample rate (16 000 Hz).
- [ ] **Levelled once.**
  - `RecordingMeta` gains `levelled?: boolean`, set when a clip is levelled or found at target.
  - Re-publishing without new takes writes byte-identical clips.
  - A new take on one page levels only that page.
  - A clip published earlier with levelling off is levelled on the next publish with levelling on: a WAV in place, or an
    AAC when the encoder exists.
- [ ] **The Inspector toggle.**
  - Advanced → Inspector → Mix gains a switch `#insp-level-voices` labelled "Evening out each voice", on by default, with
    the 12 px note "Brings every recording to the same loudness before it becomes AAC. Nothing leaves this device to do it.".
  - The setting lives in `StudioState.levelVoices`. It is draft-only (never written to a manifest) and persists through
    autosave and restore.
  - Off → the publish writes clips byte-identical to the draft's (WAV passthrough today), and the step reads "off".
  - The label is "Evening out each voice", not s09's "Voice clean-up (level, rumble)", because no rumble filter is built
    (M3-PRD OQ 4).
- [ ] **Unchanged truths.**
  - `validateManifest` passes every published tape.
  - `audioCodec` is "wav" for WAV input (`tests/wp-studio.spec.ts:285` holds).
  - A fake 4-byte `audio/mp4` take (the test microphone) still publishes, with the take's bytes unchanged.
    - It is skipped either way: as "undecodable" where an AAC encoder exists, and as "aac-encoder-unavailable" where it
      does not.
    - The step detail says "left as recorded".
- [ ] The decision log entry records the target, the clamp, the limiter, the AAC-passthrough policy, and M3-PRD OQ 4–6.
- [ ] All four gates are green.

## Seams and files
- Primary seam: Playwright E2E on `/studio` → gate → library.
  - Twinkle via T00 `seedStudioDraft(page, "twinkle")`. The published WAV data URLs are read from
    `localStorage["ssync-library"]`, decoded in the test with `node:buffer`, and measured with the module's
    `activeRmsDb`, plus an independent whole-clip RMS for the spread check.
  - Prior art: `tests/wp-studio.spec.ts` (library read-back, codec assertions).
- Secondary seam: Node-side block on the pure module (prior art: `tests/storysync-roundtrip.spec.ts`) for edge cases a
  browser cannot reach cheaply: limiter ceiling, clamp, silence, identity and the WAV round trip.
- Modules:
  - `src/lib/audio/level.ts` (new, pure);
  - `src/lib/audio/transcode.ts` (modify: the optional `level` option and the `levelling` result; today's code path is
    unchanged when the option is absent).
- Studio: `runPublish` adds the `level` step, passes `{ level: state.levelVoices }`, and also levels clips that already
  carry `audioCodec` when `meta.levelled` is false and levelling is on; it updates `RecordingMeta.levelled`.

## Files (ownership)
- `src/lib/audio/level.ts` (new)
- `src/lib/audio/transcode.ts` (modify)
- `src/components/studio/types.ts` (modify: `StudioState.levelVoices`, `RecordingMeta.levelled`, `blankState`)
- `src/components/studio/Studio.tsx` (modify: `STEP_TEMPLATE`, `runPublish` levelling, Inspector props; after T16 in file order)
- `src/components/studio/Inspector.tsx` (modify: one switch row at the end of Mix; M5's T24 edits Mix after this)
- `tests/vision-levelling.spec.ts` (new)
- `agent_docs/decisions.md` (append one entry; shared, append-only)

## Existing tests that may change
- None. Without the option `normalizeNarration` is unchanged, so `/classic` and its suites are untouched.
- `tests/wp-studio.spec.ts:285` (`audioCodec` "wav"), `tests/critic-studio.spec.ts:425–429` (`assets/narration-1.(m4a|wav)`,
  codec aac|wav) and `tests/wp-studio.spec.ts:412` hold: WAV stays WAV, and the codec is still set.
- Their seeded WAVs are 0.05 s / 2.6 s tones, so levelling changes their bytes. No existing test compares published audio
  bytes (searched for `audioUrl` equality), so none breaks.
- T16's step-list assertion (three steps) becomes four with "Evening out each voice · 5/5" first. That is
  `tests/vision-publish-card.spec.ts` test 4, an M3 test this ticket updates, with the reason "T17 adds the real step".

## Tests (written first)
`tests/vision-levelling.spec.ts`:
1. Node:
   - a 1 s 220 Hz sine at −30 dBFS RMS → `levelPcm` gainDb ≈ +10 (±0.2) and output active RMS −20 ± 0.2;
   - a −60 dBFS RMS signal → gain clamped to +15;
   - an all-zero buffer → `outcome: "unchanged"` and samples identical;
   - a 0 dBFS square → peak ≤ 10^(−1/20) and no sample with |x| > 1;
   - a signal already at −20 dBFS → `unchanged`, identical samples.
2. Node: `levelWav` on the T00 fixture `narration-4.wav` (the quietest):
   - header PCM/1 ch/16 kHz/16-bit kept, and the data length kept;
   - active RMS −20 ± 1;
   - `levelWav(levelWav(x))` is byte-identical to `levelWav(x)`.
3. E2E:
   - seed Twinkle → Finish → gate → the published card;
   - the step "Evening out each voice · 5/5" is first and done;
   - library clips: each active RMS within −20 ± 1 dBFS, spread ≤ 2 dB, peaks ≤ −1 dBFS, durations within 10 ms of the
     fixture facts;
   - `audioCodec` "wav" (or "aac" where the encoder exists).
4. E2E idempotence: Back to the studio → Finish again → the five clip data URLs are identical to the first publish.
5. E2E off:
   - Advanced → `#insp-level-voices` uncheck → reload + restore → still unchecked;
   - Finish → step "Evening out each voice · off" → the five clips are byte-identical to the seeded draft data URLs.
6. E2E skipped:
   - `stubMicrophone` take (4-byte `audio/mp4`) on page 1 of a seeded draft → Finish completes ("Your tape is ready");
   - the step detail contains "left as recorded";
   - page 1's published clip decodes (base64) to the same bytes as the take.
7. E2E guard: `/classic` is not exercised by this ticket. A Node assertion checks that `src/app/classic/page.tsx` still
   calls `normalizeNarration(blob, rec.mimeType)` with two arguments (no `level`).

Red first:
- 1, 2 and 7 fail because the module and option do not exist (7 passes and guards once the option exists).
- 3–6 fail because there is no step and no levelling.

## Fidelity check
- Viewport 1180×820.
- State A: the Twinkle tape published (T16's card) with the steps "Evening out each voice · 5/5", "Converting voices to
  AAC · 5/5", "Assembling the SSYNC manifest · 5 pages", "Saving your tape · this device".
- State B: Advanced with the Inspector's Mix section showing the switch.
- Reference crops:
  - s05 step list, `docs/vision/reference/renders/s05.png` about x88–475, y295–392. The reference's fourth row
    "Evening out each voice · planned" + "Next" becomes a real, first, done row (deviation by design);
  - s09 Inspector Mix, `docs/vision/reference/renders/s09.png`, the clean-up row near the end of Mix. The label differs
    (OQ 4).
- Save `docs/vision/evidence/T17-steps.png` and `T17-inspector.png`, plus `docs/vision/evidence/T17-levels.txt` with the
  before/after dBFS of the five clips.
