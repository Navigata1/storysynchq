# T04a · Consent in the protocol: `date` as `YYYY-MM-DD`, validator WARN on timestamps, schema + spec
Milestone: M0 · Reference: s04 (brief screens[3]); validator wording from s08 (brief screens[7]) · Status in reel: Next
Type: AFK (agent can finish alone)
Blocked by: T00 (fixture round-trip check)   ·   Blocks: T04b, T12 (J-card reads consent dates), T23 (the validator block prints these lines)
Split from T04 (the "Consent per recorded voice; date as YYYY-MM-DD; validator WARN on timestamps; schema + spec" ticket). T04a is the protocol half, spec-first per HANDOFF §5. T04b is the Creator half.

## Why
The s04 callout "CONSENT TRAVELS IN THE TAPE" promises that ticking the box "writes signature.voiceConsent into manifest.json: voice 'Mia, age 4 — with Mom', granted by parent/guardian, dated". The v2.1 draft schema already types `date` as `format: date`, yet the Creator writes `2026-10-19T18:09:58.123Z`.

On s08 Marco's validator prints the drift honestly, as a warning that never blocks:

> `WARN  signature.voiceConsent[0].date is a full timestamp; the v2.1 draft asks for a date`

Older tapes must keep opening; new ones must be written right. HANDOFF §5 says to change the spec and schema before the code, in the same PR.

## Done when (acceptance, each testable)
- [ ] `ValidationResult` gains `warnings: string[]` (always present, possibly empty). `ok` still means `errors.length === 0`. Warnings never make `ok` false, never make `packStorysync` or `unpackStorysync` throw, and never block a publish.
- [ ] `validateManifest` adds these warnings, in this order, for each `signature.voiceConsent[i]`:
  - when `date` is a full ISO timestamp (matches `^\d{4}-\d{2}-\d{2}T`), exactly: `signature.voiceConsent[<i>].date is a full timestamp; the v2.1 draft asks for a date`;
  - when `date` is present, is not a timestamp and does not match `^\d{4}-\d{2}-\d{2}$`, exactly: `signature.voiceConsent[<i>].date "<value>" is not a calendar date (YYYY-MM-DD)`;
  - nothing when `date` is absent (the schema allows that) or is `YYYY-MM-DD`.
- [ ] `validateManifest` adds one manifest-level warning when any page's `text.audioUrl` is set and `signature.voiceConsent` is missing or empty, exactly: `a recorded voice is on this tape but signature.voiceConsent is empty; the v2.1 draft says it SHOULD carry one`.
  - The house tape (no audio) produces no warnings.
  - The Twinkle fixture (T00) produces none.
- [ ] The existing errors are unchanged, including the s08 FAIL wording `pages[2].text.audioUrl "assets/narration-3.webm" uses a draft-only codec — published narration must be AAC/M4A (or WAV fallback)`.
- [ ] The `SsyncSignature.voiceConsent` TSDoc says:
  - `date` is a calendar date, `YYYY-MM-DD`, the consenting device's local date;
  - `grantedBy` is conventionally `"parent/guardian"` or `"self"` (free text allowed);
  - there is one record per recorded voice.
  - No type narrowing, so old manifests still type-check.
- [ ] `public/protocol/v2.schema.json` `signature.voiceConsent.items` gains descriptions:
  - `voice`: whose voice, as credited;
  - `grantedBy`: who consented, with `examples: ["parent/guardian", "self"]`;
  - `date`: calendar date of consent, `YYYY-MM-DD`; validators warn on timestamps.
  - `format: "date"` stays. No `pattern` is added, which would turn a warning into a schema failure.
  - The file still parses as JSON.
- [ ] `docs/format-spec.md` §7 states:
  - one `voiceConsent` record per recorded voice;
  - the field meanings above;
  - `date` is `YYYY-MM-DD`; readers MUST accept a timestamp and validators SHOULD warn;
  - an example record `{ "voice": "Ada, age 4 — with Dad", "grantedBy": "parent/guardian", "date": "2026-10-19" }`. The example uses an original name, not the Rivera cast.
- [ ] A decision log entry: warnings added to the validator; consent date rule; one record per voice.
- [ ] All four gates are green.

## Seams and files
- Seam: Node-side Playwright tests on `src/lib/storysync/manifest.ts` and the container, in `tests/storysync-roundtrip.spec.ts`, as HANDOFF §5 asks ("Update … `tests/storysync-roundtrip.spec.ts` … for each").
- The schema and spec are documents. One Node test asserts the schema keeps parsing and carries the new descriptions.

## Tests (written first)
In `tests/storysync-roundtrip.spec.ts`, new `describe("consent (v2.1 draft)")`:
1. A manifest with `voiceConsent: [{ voice: "Ada", grantedBy: "parent/guardian", date: "2026-10-19T18:09:58.123Z" }]` and a WAV page → `ok === true` and `warnings` contains exactly `signature.voiceConsent[0].date is a full timestamp; the v2.1 draft asks for a date`.
2. `date: "Oct 19 2026"` → `ok === true`, warning `signature.voiceConsent[0].date "Oct 19 2026" is not a calendar date (YYYY-MM-DD)`.
3. `date: "2026-10-19"` → `warnings` is `[]`.
4. A recorded page with no `signature` → the "SHOULD carry one" warning. The demo manifest (`public/demo/brave-little-star.ssync.json`, read with `node:fs`) → `warnings` is `[]`.
5. `packStorysync` + `unpackStorysync` succeed for manifest 1, so a warning never blocks the container.
6. The T00 fixtures `twinkle.storysync` and `goodnight-mia.storysync` → `errors` and `warnings` are both empty.
7. `public/protocol/v2.schema.json` parses, and `…voiceConsent.items.properties.grantedBy.examples` deep-equals `["parent/guardian", "self"]`.

Red first: 1, 2, 4 and 7 fail (no `warnings`, no examples); 3 and 5 fail on `warnings` being undefined.

## Fidelity check
- No visual surface in this ticket.
- Evidence: the validator output for the four cases above, pasted into `docs/vision/evidence/T04a.txt`, next to the s08 validator crop (`docs/vision/reference/renders/s08.png`, the PASS/WARN/FAIL block). The WARN line must read identically.

## Files (ownership)
- `src/lib/storysync/manifest.ts` (modify: `ValidationResult.warnings`, consent checks, TSDoc)
- `public/protocol/v2.schema.json` (modify: `signature.voiceConsent.items` descriptions/examples only)
- `docs/format-spec.md` (modify: §7 only; T18 later edits §7 for `replyTo`, T23 may cite it. Sequential, not parallel)
- `tests/storysync-roundtrip.spec.ts` (modify: add a `describe("consent (v2.1 draft)")` block; existing tests untouched)
- `agent_docs/decisions.md` (append one entry; shared, append-only)

## Existing tests that may change
- None of today's assertions change. `tests/storysync-roundtrip.spec.ts` gains new tests. Its existing `validateManifest` checks read `result.ok` / `result.errors`, which keep their meaning.
- `src/components/studio/Studio.tsx` reads `validation.ok` / `validation.errors` at publish. It is unaffected and is not edited here (T04b fixes the writer).
