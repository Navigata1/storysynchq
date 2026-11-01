I'm approving round 3 of P4. All six earlier repairs hold when I trace the code at `95aa72c`, and I found no new High. I raise one Low, a judgement call. I couldn't run anything, so the size figures (share link 168 KB, demo 165 KB, `/read` 161 KB) are still the builder's numbers. No P4 gate results are in the diff yet; the P4-G6 budget run has to produce them.

## Prior findings

- **P4-R1-01 (High): confirmed.** `js_measure.mjs` measures `/read?demo=1` and `/read?story=a2a2…`. Each run waits until the Player's cover shows (`.pl-root[data-view="cover"]`) and the network goes quiet, then counts every same-origin script the page asked for. Fetches for other pages' links are aborted. The share-link run answers the cloud's by-code lookup with the house tape. `js-budget.json` holds both routes to 174080 bytes (170 KB), and `test_gates.py` lists them.
- **P4-R1-02 (High): confirmed.** All four ways a tape opens start the Player download at once: share link (`ReadRoom.tsx:573`), shelf (`:745`), demo (`:788`) and file (`:806`). The lazy Player uses that same download, shows the threading reels while it loads, and shows a Try again screen if it can't be fetched. The second `decisions.md` entry corrects the earlier claim.
- **P4-R1-03 (Medium): confirmed.** `supabase-lazy.ts` forgets a failed load, so the next call tries again. In `cloud-storage.ts`, `cloudModule()` (`:100-107`) wraps every cloud call (save `:229`, update `:293`, shelf read `:342`, share `:409`, delete `:454`) and reports a failed load as a network `CloudError`. The Player, end card, panel and library loaders also forget failures.
- **P4-R1-04 (Low): confirmed.** `js_budget.py:530-531` builds with a placeholder cloud project. `getUser()` only loads supabase-js when a sign-in is stored on the device (`sb-<ref>-auth-token`). `supabase.ts:13` calls `createClient` with no custom storage key, so that is the key supabase-js really uses. A share link resolves through `restShareClient`, without supabase-js.
- **P4-R2-01 (Medium): confirmed.** The new `tests/share-rest.spec.ts` replaces `fetch` with a recorder that answers like PostgREST. It covers:
  - the RPC's URL, method, anon-key headers and body;
  - a 404 `PGRST202` falling back to the two exact-match queries, with their query strings checked;
  - a code with no link never reaching the stories table;
  - two rows refused as `PGRST116`;
  - a 401 becoming an auth `CloudError`;
  - a 500 not falling back;
  - a 503 with a non-JSON body still failing with its status;
  - a `TypeError` from `fetch` becoming a network error;
  - a found row opening as a book.

  It is registered in ROOTSUMS and named by amendment A11. The shared `fetch` swap is safe because each test restores it in `finally`.
- **P4-R2-02 (Low): confirmed.** The comments at `Player.tsx:84-89` and `ReadRoom.tsx:1302-1310` now say a failed prefetch is retried by the render that needs it, and that once next/dynamic settles on the fallback the page keeps it until reload. That matches the code.

## New findings

- **P4-R3-01 · Low · judgement: offline, the shelf's one-tap delete no longer removes this device's copy.** Before this diff, the Read Room imported `deleteBook` directly, so `deleteBook` always cleared the copy on this device first (`cloud-storage.ts:445-451`), even when the cloud was out of reach. Now `pullOut` (`ReadRoom.tsx:696`) first has to download the library code (`loadLibrary()`). If that download fails (the room's own prefetch failed and the device is still offline), nothing is deleted: the child's recorded voice stays on the device. The parent is told honestly ("That tape is still on the shelf. This page could not reach its library code…"), and a retry once back online works. So this is not a COPPA breach, but it is a step back in the deletion guarantee. **Fix:** clear the device copy from a small module the room imports directly (as `draft-key.ts` does for drafts), then load the library for the cloud half.

Also checked, no problem found:
- **Codec rule:** if the encoder can't be downloaded, publishing fails (`Studio.tsx:1318`) instead of publishing an unconverted recording.
- **Third-party requests:** none were added. The QR encoder is this app's own code, and the share lookup only contacts the configured Supabase project, as supabase-js did before.
- **Share-lookup tests:** they still match. There is exactly one `.rpc(` call across `share-lookup.ts` and `supabase.ts`, and the code that reads links and stories is unchanged, only moved.
- **Remaining importers:** `/classic` is the only file still importing `@/lib/supabase` directly, as the docs say. Every file that uses `next/dynamic` with `ssr: false` is a client component.

```json
{"verdict": "approve", "prior": {"P4-R1-01": "confirmed", "P4-R1-02": "confirmed", "P4-R1-03": "confirmed", "P4-R1-04": "confirmed", "P4-R2-01": "confirmed", "P4-R2-02": "confirmed"}, "filesRead": ["ops/mission/contract.md", "ops/mission/plan.lock.json", "CLAUDE.md", ".a2-review/log.txt", ".a2-review/diff.patch", "ops/mission/reviews/P4/round1/transcript.md", "ops/mission/reviews/P4/round1/dispositions.json", "ops/mission/reviews/P4/round2/transcript.md", "ops/mission/reviews/P4/round2/dispositions.json", "tests/share-rest.spec.ts", "tests/share-lookup.spec.ts", "src/lib/cloud-storage.ts", "src/lib/supabase.ts", "src/components/player/ReadRoom.tsx", "src/components/player/Player.tsx", "src/components/studio/Studio.tsx"], "findings": [{"id": "P4-R3-01", "severity": "low", "file": "src/components/player/ReadRoom.tsx", "line": 696, "summary": "Offline, the shelf's one-tap delete no longer removes the device copy of the tape: it now depends on downloading the cloud-storage chunk first", "mechanism": "Before this diff deleteBook was imported directly, so its device-library sweep (cloud-storage.ts:445-451) ran even with the cloud out of reach. pullOut now awaits loadLibrary() before calling deleteBook; if the room's prefetch failed and the device is still offline, the import throws and nothing is deleted locally, so the child's recorded narration stays on the device. The status line reports it honestly and a retry works once online, so this is a step back in the deletion guarantee rather than a breach.", "fix": "Clear the device library entry from a small module the Read Room imports directly (as draft-key.ts does for drafts) before awaiting loadLibrary() for the cloud half, or show the delete control as unavailable until the library chunk has loaded.", "kind": "judgement"}]}
```
