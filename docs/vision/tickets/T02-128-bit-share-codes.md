# T02 · 128-bit share codes (32 hex), old codes still resolve; migration file; PRIVACY.md true
Milestone: M0 · Reference: s05 (brief screens[4]) · Status in reel: Shipped (truth fix)
Type: HITL (Jon applies migration 002 to production; everything else is AFK)
Blocked by: T00 (fixture helpers for the two E2E guards)   ·   Blocks: —

## Why
The s05 stage callout says it plainly:

> "THE LINK, HONESTLY — Cloud share codes are 16 hex characters today (64-bit); the privacy page promises 128-bit — one migration closes it."

`PRIVACY.md` rule 4 promises a parent that "its 128-bit share code is not guessable".
- The device library already mints 16 random bytes (`mintShareCode` in `src/lib/cloud-storage.ts`).
- The cloud does not. `createShareLink` inserts a row without a code, so Postgres fills the default `encode(gen_random_bytes(8),'hex')` from migration 001.

A grandparent's link has to be what the privacy page says it is. Every link already sent must keep working.

## Done when (acceptance, each testable)
- [ ] A new module `src/lib/share-code.ts` exports:
  - `mintShareCode()`, which returns 32 lowercase hex characters from `crypto.getRandomValues` over 16 bytes;
  - `shareLinkRow(storybookId)`, which returns `{ storybook_id, share_code }` with a freshly minted code.
- [ ] `mintShareCode()` never weakens. When `crypto.getRandomValues` is unavailable it throws. It does not fall back to `Date.now()`/`Math.random()` as today's local fallback does.
  - `shareBook` turns that into a `CloudError("unknown", "Making the link: this browser cannot make a private link safely. Download the .storysync file instead.")`.
  - The `newId()` local-id fallback may keep a non-secret id, because ids are not links.
- [ ] `createShareLink` in `src/lib/supabase.ts` inserts `shareLinkRow(storybookId)`, so cloud links carry a 32-hex code whatever the database default is.
- [ ] The device library path (`shareBook` without Supabase) uses the same `mintShareCode`. The duplicate in `cloud-storage.ts` is removed.
- [ ] Old codes still resolve: a tape stored in the device library under a 16-hex `shareCode` opens at `/read?story=<16hex>` and shows its cover. The cloud lookup (`getStorybookByShareCode`) stays an exact match, with no length check.
- [ ] Publishing on this device produces a private-link URL ending in `story=` + 32 hex. At 1180×820 and at 375×812 the "PRIVATE LINK" field (input "Share link") does not cause horizontal page scroll. "Copy" writes the full URL, all 32 hex, to the clipboard.
- [ ] `supabase/migrations/002_share_code_128bit.sql` exists:
  - It runs `ALTER TABLE public.shared_links ALTER COLUMN share_code SET DEFAULT encode(gen_random_bytes(16), 'hex');`.
  - It does not update, delete or rewrite existing rows.
  - Its header comment says it is optional for the app, which inserts explicit codes, and that Jon applies it to production.
- [ ] The unused `getPublicStorybooks` (a public listing query that also selects `view_count`) is deleted from `src/lib/supabase.ts`. `src/` then contains no query that lists other people's stories. I confirmed today that nothing imports it.
- [ ] `PRIVACY.md` rule 4 stays true and adds one sentence: links made before this change used 64-bit codes; they keep working until the story is deleted, and new links are 128-bit.
- [ ] A decision log entry is appended. It names migration 002 as HITL and records Open Questions 1 and 3 from M0-PRD (RLS enumeration, counter columns) as raised, not fixed.
- [ ] **HITL stop.** The builder does not apply the migration. The ticket is "done (AFK part)" when the code ships. It is closed when Jon confirms 002 is applied, or waives it.
- [ ] All four gates are green.

## Seams and files
- Primary seam: Node-side Playwright tests for the share-code module and the migration file (prior art: `tests/storysync-roundtrip.spec.ts`).
- Secondary seam: one E2E guard on `/read?story=` for legacy codes, and one on the publish card's link field. Both use the device-library path, because CI has no Supabase.
- The cloud insert is proven through `shareLinkRow`, the exact object `createShareLink` passes to `.insert()`. `supabase.ts` binds a live client at import time, so it is not imported in Node tests.

## Tests (written first)
`tests/share-code.spec.ts`:
1. Node: `mintShareCode()` matches `/^[0-9a-f]{32}$/`, and 10 000 calls give 10 000 distinct codes.
2. Node: with `globalThis.crypto` temporarily replaced by an object without `getRandomValues`, `mintShareCode` throws. The original is restored in `finally`.
3. Node: `shareLinkRow("abc")` deep-equals `{ storybook_id: "abc", share_code: <32 hex> }`.
4. Node: `supabase/migrations/002_share_code_128bit.sql` contains `gen_random_bytes(16)` and `ALTER COLUMN share_code SET DEFAULT`. It contains none of `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`.
5. Node: no file under `src/` contains `getPublicStorybooks`, and `src/lib/cloud-storage.ts` no longer defines its own `mintShareCode`.
6. E2E: `seedDeviceLibrary(page, "twinkle", { shareCode: "9b2d4e6f8a0c1e3d" })` (T00 helper, a fresh 16-hex code, not a cast code) → `/read?story=9b2d4e6f8a0c1e3d` shows the cover with "Twinkle Came to My Window". "We couldn't find that tape" is absent.
7. E2E: `seedStudioDraft(page, "twinkle")` → restore → Finish → gate (answer the a×b, tick consent) → "Your tape is ready":
   - the read-only input `[data-studio="share-url"]` (accessible name "Share link") has a value matching `/\/read\?story=[0-9a-f]{32}$/`;
   - `document.documentElement.scrollWidth <= innerWidth`;
   - with clipboard permissions granted, Copy → `navigator.clipboard.readText()` equals the full URL.

Red first: 1–5 fail because the module and migration do not exist and the duplicate and gallery query are still present. 6 passes today (a guard against a future length check). 7 passes on the device path today (a guard for layout).

## Fidelity check
- Viewport 1180×820 (the s05 tablet), plus 375×812.
- State: the publish card after a device-library publish of the Twinkle draft.
- Reference crop: the s05 PRIVATE LINK field and Copy button (`docs/vision/reference/renders/s05.png`, about x500–885, y270–340).
- Deliberate deviation: the reference prints a 16-hex code (today's honest state); ours prints 32 hex. Record it in the evidence ledger.
- Save `docs/vision/evidence/T02.png`.

## Files (ownership)
- `src/lib/share-code.ts` (new)
- `src/lib/cloud-storage.ts` (modify: import `mintShareCode`, remove the local copy, honest error in `shareBook`)
- `src/lib/supabase.ts` (modify: `createShareLink` inserts `shareLinkRow`; delete `getPublicStorybooks`)
- `supabase/migrations/002_share_code_128bit.sql` (new)
- `PRIVACY.md` (modify: one sentence in rule 4)
- `tests/share-code.spec.ts` (new)
- `agent_docs/decisions.md` (append one entry; shared, append-only)

## Existing tests that may change
- None change. `tests/critic-studio.spec.ts:254` already expects `/^[0-9a-f]{32}$/` for the device-library code. It keeps passing and now also covers the shared minting function.
- `tests/wp-studio.spec.ts:276` compares `shareCode` to the URL. Unaffected.
