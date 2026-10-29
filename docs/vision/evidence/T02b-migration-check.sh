#!/usr/bin/env bash
# T02b evidence: run migrations 001 → 002 → 003 on a throwaway Postgres and
# check, as the anon and authenticated roles, what a browser holding the anon
# key can read before and after 003.
#
# Not part of the Playwright suite (CI has no Postgres). Needs a disposable
# server you can reach as superuser `postgres`, e.g. a local cluster:
#
#   PGHOST=/path/to/socket-dir PGPORT=54329 docs/vision/evidence/T02b-migration-check.sh
#
# It creates (and at the end drops) the database `t02b_check`, and creates the
# NOLOGIN roles anon / authenticated / service_role if the cluster lacks them.
# A failed check stops the run with "FAIL: <what>". Never point it at
# production.

set -euo pipefail
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
MIG="$REPO/supabase/migrations"
DB=t02b_check
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -U postgres -At)

"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"

# The parts of Supabase that 001 leans on: the API roles, auth.users,
# auth.uid() (from the request JWT's sub), pgcrypto, and the default grants
# Supabase gives the API roles on everything in public.
shim() {
  cat <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
CREATE EXTENSION pgcrypto;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

CREATE SCHEMA t02b;
GRANT USAGE ON SCHEMA t02b TO anon, authenticated;
CREATE FUNCTION t02b.check(label text, ok boolean) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
  RETURN 'ok    ' || label;
END $f$;
GRANT EXECUTE ON FUNCTION t02b.check(text, boolean) TO anon, authenticated;
SQL
}

# Two families. The owner has a published tape (128-bit link), an older tape
# (64-bit link) and an unpublished one that somehow has a link; the other
# family has one published tape.
seed() {
  cat <<'SQL'
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-4111-8111-111111111111', 'owner@example.test', '{"name":"Owner"}'),
  ('22222222-2222-4222-8222-222222222222', 'other@example.test', '{"name":"Other"}');
INSERT INTO public.storybooks (id, user_id, title, is_public, ssync_data) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Published tape', true,  '{"pages":[{"id":1}]}'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Old-link tape',  true,  '{"pages":[{"id":1}]}'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Unpublished',    false, '{"pages":[{"id":1}]}'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Other tape',     true,  '{"pages":[{"id":1}]}');
INSERT INTO public.shared_links (storybook_id, share_code) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', '5e0c7a91d2b84f36a1c09e7d3b6f2a48'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'c41e9a07b3d2f856'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '0f1e2d3c4b5a69788796a5b4c3d2e1f0'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'd00dfeed00dfeed00dfeed00dfeed001');
INSERT INTO public.page_media (storybook_id, page_id, media_type, file_url) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 1, 'narration', 'data:audio/mp4;base64,AAAA');
SQL
}

before_003() {
  cat <<'SQL'
\echo '--- before 003, as anon (the anon key every browser has)'
SET ROLE anon; SET request.jwt.claim.sub = '';
SELECT t02b.check('BUG: anon lists every share code (4)', (SELECT count(*) FROM public.shared_links) = 4);
SELECT t02b.check('BUG: anon lists every published story (3)', (SELECT count(*) FROM public.storybooks) = 3);
SELECT t02b.check('BUG: anon lists public media (1)', (SELECT count(*) FROM public.page_media) = 1);
SELECT t02b.check('the app''s pre-003 fallback (link by exact code, then the story by id) opens a tape',
  (SELECT s.title FROM public.storybooks s WHERE s.id =
    (SELECT storybook_id FROM public.shared_links WHERE share_code = '5e0c7a91d2b84f36a1c09e7d3b6f2a48')) = 'Published tape');
RESET ROLE;
SQL
}

after_003() {
  cat <<'SQL'
\echo '--- 003: the function'
SELECT t02b.check('SECURITY DEFINER, STABLE, STRICT, search_path=public',
  (SELECT prosecdef AND provolatile = 's' AND proisstrict AND proconfig = '{search_path=public}'
     FROM pg_proc WHERE oid = 'public.storybook_by_share_code(text)'::regprocedure));
SELECT t02b.check('anon may execute it', has_function_privilege('anon', 'public.storybook_by_share_code(text)', 'EXECUTE'));
SELECT t02b.check('authenticated may execute it', has_function_privilege('authenticated', 'public.storybook_by_share_code(text)', 'EXECUTE'));
SELECT t02b.check('policies left: the owner policies (and profiles''), none of the broad reads',
  (SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public')
  = ARRAY['Users manage own links', 'Users manage own media', 'Users manage own storybooks',
          'Users update own profile', 'Users view own profile']);

\echo '--- after 003, as anon'
SET ROLE anon; SET request.jwt.claim.sub = '';
SELECT t02b.check('anon lists no share codes', (SELECT count(*) FROM public.shared_links) = 0);
SELECT t02b.check('anon lists no stories', (SELECT count(*) FROM public.storybooks) = 0);
SELECT t02b.check('anon lists no media', (SELECT count(*) FROM public.page_media) = 0);
SELECT t02b.check('the pre-003 fallback now finds nothing either',
  (SELECT count(*) FROM public.shared_links WHERE share_code = '5e0c7a91d2b84f36a1c09e7d3b6f2a48') = 0);
SELECT t02b.check('a 128-bit code opens its one tape',
  (SELECT array_agg(title) FROM public.storybook_by_share_code('5e0c7a91d2b84f36a1c09e7d3b6f2a48')) = ARRAY['Published tape']);
SELECT t02b.check('a 64-bit code from before T02 still opens its tape',
  (SELECT array_agg(title) FROM public.storybook_by_share_code('c41e9a07b3d2f856')) = ARRAY['Old-link tape']);
SELECT t02b.check('only the Reader''s columns come back',
  (SELECT array_agg(k ORDER BY k) FROM public.storybook_by_share_code('5e0c7a91d2b84f36a1c09e7d3b6f2a48') r,
          jsonb_object_keys(to_jsonb(r)) k)
  = ARRAY['age_range', 'author', 'cover_image_url', 'created_at', 'description', 'genre', 'id',
          'page_count', 'ssync_data', 'title']);
SELECT t02b.check('NULL -> nothing', (SELECT count(*) FROM public.storybook_by_share_code(NULL)) = 0);
SELECT t02b.check('empty string -> nothing', (SELECT count(*) FROM public.storybook_by_share_code('')) = 0);
SELECT t02b.check('16-hex prefix of a 128-bit code -> nothing', (SELECT count(*) FROM public.storybook_by_share_code('5e0c7a91d2b84f36')) = 0);
SELECT t02b.check('31-hex (wrong length) -> nothing', (SELECT count(*) FROM public.storybook_by_share_code('5e0c7a91d2b84f36a1c09e7d3b6f2a4')) = 0);
SELECT t02b.check('upper-case -> nothing', (SELECT count(*) FROM public.storybook_by_share_code('5E0C7A91D2B84F36A1C09E7D3B6F2A48')) = 0);
SELECT t02b.check('wildcards -> nothing', (SELECT count(*) FROM public.storybook_by_share_code('%')) = 0);
SELECT t02b.check('an unpublished story''s link -> nothing', (SELECT count(*) FROM public.storybook_by_share_code('0f1e2d3c4b5a69788796a5b4c3d2e1f0')) = 0);
RESET ROLE;

\echo '--- after 003, as the owner (signed in)'
SET ROLE authenticated; SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
SELECT t02b.check('list my tapes: my 3, and only mine',
  (SELECT count(*) FROM public.storybooks WHERE user_id = auth.uid()) = 3 AND (SELECT count(*) FROM public.storybooks) = 3);
SELECT t02b.check('my links: my 3', (SELECT count(*) FROM public.shared_links) = 3);
SELECT t02b.check('a signed-in reader opens a link too',
  (SELECT count(*) FROM public.storybook_by_share_code('d00dfeed00dfeed00dfeed00dfeed001')) = 1);
-- Two requests, as the app makes them: saveStorybook, then createShareLink.
WITH saved AS (
  INSERT INTO public.storybooks (id, user_id, title, is_public, ssync_data)
  VALUES ('aaaaaaaa-0000-4000-8000-000000000004', auth.uid(), 'Saved after 003', true, '{"pages":[{"id":1}]}')
  RETURNING id
)
SELECT t02b.check('save a tape (insert … returning)', (SELECT count(*) FROM saved) = 1);
WITH linked AS (
  INSERT INTO public.shared_links (storybook_id, share_code)
  VALUES ('aaaaaaaa-0000-4000-8000-000000000004', '7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a') RETURNING share_code
)
SELECT t02b.check('make its link (insert … returning)', (SELECT count(*) FROM linked) = 1);
WITH changed AS (
  UPDATE public.storybooks SET title = 'Published tape (re-published)'
  WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001' AND user_id = auth.uid() RETURNING id
)
SELECT t02b.check('re-publish updates my row', (SELECT count(*) FROM changed) = 1);
WITH gone_link AS (
  DELETE FROM public.shared_links WHERE storybook_id = 'aaaaaaaa-0000-4000-8000-000000000002' RETURNING 1
)
SELECT t02b.check('delete: the link goes first', (SELECT count(*) FROM gone_link) = 1);
WITH gone_story AS (
  DELETE FROM public.storybooks WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002' RETURNING 1
)
SELECT t02b.check('delete: then the story', (SELECT count(*) FROM gone_story) = 1);
RESET ROLE;

\echo '--- after 003, as the other family (signed in)'
SET ROLE authenticated; SET request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
SELECT t02b.check('sees only their own tape', (SELECT count(*) FROM public.storybooks) = 1);
WITH attempt AS (
  DELETE FROM public.storybooks WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001' RETURNING 1
)
SELECT t02b.check('cannot remove someone else''s tape', (SELECT count(*) FROM attempt) = 0);
RESET ROLE;

\echo '--- after the owner''s delete, as anon'
SET ROLE anon; SET request.jwt.claim.sub = '';
SELECT t02b.check('the deleted tape''s link opens nothing',
  (SELECT count(*) FROM public.storybook_by_share_code('c41e9a07b3d2f856')) = 0);
SELECT t02b.check('a link made after 003 opens its tape',
  (SELECT array_agg(title) FROM public.storybook_by_share_code('7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a')) = ARRAY['Saved after 003']);
RESET ROLE;
SQL
}

{
  shim
  cat "$MIG/001_initial_schema.sql"
  cat "$MIG/002_share_code_128bit.sql"
  seed
  before_003
  echo "\\echo '--- applying 003'"
  cat "$MIG/003_share_lookup_by_code.sql"
  echo "\\echo '--- applying 003 a second time (it is safe to re-run)'"
  cat "$MIG/003_share_lookup_by_code.sql"
  after_003
} | "${PSQL[@]}" -d "$DB"

"${PSQL[@]}" -d postgres -c "DROP DATABASE $DB"
echo "T02b migration check: all checks passed"
