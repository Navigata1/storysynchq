# T02b · Share links cannot be enumerated: look up a tape by its code only
Milestone: M0 · Reference: s05 (brief screens[4], callout "THE LINK, HONESTLY"), s07 ("Unlisted means unlisted") · Status in reel: Shipped (the promise) — this ticket makes it true
Type: HITL (Jon applies the migration to production; the app works before and after)
Blocked by: T02   ·   Blocks: —

## Why
PRIVACY.md rule 4 and the reel promise that a tape is "reachable only by someone holding the link". Migration 001 says
otherwise: `shared_links` has `FOR SELECT USING (true)` and `storybooks` has `FOR SELECT USING (is_public = true)`. The
anon key ships in every browser, so anyone can list every share code and every published story with one request. A
family's tape must be openable by its code and by nothing else.

## Done when (acceptance, each testable)
- [ ] A new migration `supabase/migrations/003_share_lookup_by_code.sql`:
      - adds `public.storybook_by_share_code(code text)` — `SECURITY DEFINER`, `STABLE`, `SET search_path = public`,
        returning the one storybook (and only the columns the Reader needs) whose `shared_links.share_code = code`,
        and nothing for any other input (empty string, null, wrong length, a prefix);
      - grants `EXECUTE` on it to `anon` and `authenticated`;
      - drops the policies "Anyone reads shared links" and "Anyone reads public storybooks" (and the public
        `page_media` read policy if media is read through the storybook row), keeping every owner policy;
      - contains no `UPDATE`, `DELETE` or data change; a header comment says it is for Jon to apply and what it changes.
- [ ] The app resolves share codes through `supabase.rpc('storybook_by_share_code', { code })` first. If the function
      does not exist yet (PostgREST "function not found", e.g. `PGRST202` / Postgres `42883`), it falls back to today's
      two-step select, so production keeps working until the migration is applied.
- [ ] Nothing in `src/` lists `shared_links` or public `storybooks` any more (only the owner's own rows and the by-code RPC).
- [ ] Owner flows unchanged: save, list my tapes, delete (every copy and the link).
- [ ] PRIVACY.md rule 4 describes the by-code lookup in one plain sentence; the decision log entry says the migration
      is pending Jon's apply.

## Seams and files
- Seam: the share-code resolver in `src/lib/cloud-storage.ts` (`resolveShareCode` / the cloud path) and the Supabase
  helpers in `src/lib/supabase.ts`.
- Files (ownership): `supabase/migrations/003_share_lookup_by_code.sql` (new), `src/lib/supabase.ts`,
  `src/lib/cloud-storage.ts`, `PRIVACY.md` (rule 4 sentence), `tests/share-lookup.spec.ts` (new).

## Tests (written first)
- Node: with a stubbed Supabase client, the resolver calls `rpc('storybook_by_share_code', { code })`; on a
  function-not-found error it falls back to the select path; on an RPC error of any other kind it reports the
  cloud error (no fallback); an empty or non-hex code never reaches the network.
- Node: the migration file contains the function with `SECURITY DEFINER` and `search_path`, the two `DROP POLICY`
  statements, the grants, and no `UPDATE`/`DELETE`/`TRUNCATE`/`DROP TABLE`.
- Static: no `from("shared_links").select(` without an owner filter remains in `src/`.

## Fidelity check
No visual change. Evidence is the test output and the migration text.

## Existing tests that may change
None.
