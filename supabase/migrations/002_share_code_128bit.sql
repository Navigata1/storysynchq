-- StorySyncHQ · 002 · 128-bit share codes
--
-- Why: migration 001 gave shared_links.share_code the default
-- encode(gen_random_bytes(8), 'hex') — 16 hex characters, 64 bits. PRIVACY.md
-- rule 4 promises a 128-bit code that is not guessable.
--
-- Optional for the app. Since T02 the app inserts an explicit 128-bit code
-- (32 hex, minted in the browser by src/lib/share-code.ts) with every link it
-- makes, so links are 128-bit whether or not this has run. This only makes the
-- column's own default match, so nothing that leans on the default — a
-- dashboard insert, a script — can ever mint a 64-bit code again.
--
-- Existing rows are left exactly as they are. Links already sent keep their
-- 16-hex codes and keep resolving (the lookup is an exact match with no length
-- check) until their story is deleted.
--
-- HITL: Jon applies this to production (Supabase SQL editor or
-- `supabase db push`). Agents do not apply it.

ALTER TABLE public.shared_links ALTER COLUMN share_code SET DEFAULT encode(gen_random_bytes(16), 'hex');
