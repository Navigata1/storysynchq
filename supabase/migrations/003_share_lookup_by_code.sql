-- StorySyncHQ · 003 · A shared tape opens by its code, and by nothing else
--
-- Why: PRIVACY.md rule 4 promises that a shared story is reachable only by
-- someone holding its link. Migration 001 broke that promise in the database
-- with three broad read policies:
--
--   "Anyone reads shared links"       on shared_links  FOR SELECT USING (true)
--   "Anyone reads public storybooks"  on storybooks    FOR SELECT USING (is_public = true)
--   "Public media readable"           on page_media    FOR SELECT (any public story's media)
--
-- The anon key ships in every browser, so one request could list every share
-- code and every published story (its pictures and a child's voice in
-- ssync_data) without holding a single link.
--
-- What this changes:
--
--   1. Adds public.storybook_by_share_code(code text): SECURITY DEFINER,
--      STABLE, STRICT, search_path pinned to public. It returns the one
--      published storybook whose shared_links.share_code equals code exactly,
--      and only the columns the Reader needs (never user_id, is_premium or the
--      counters). Any other input matches no row and returns nothing: NULL
--      (STRICT), an empty string, a prefix, a code of the wrong length.
--   2. Lets anon and authenticated execute it (PUBLIC's implicit grant is
--      revoked; it is the only way a link holder reads a story).
--   3. Drops the three policies above. Every owner policy stays exactly as 001
--      made it ("Users manage own storybooks", "Users manage own media",
--      "Users manage own links"), so saving a tape, listing your own tapes,
--      making a link and removing every copy of a story work as before.
--
-- Media: nothing in the app reads page_media; a tape's pictures and narration
-- travel inside storybooks.ssync_data, which the function returns. So the
-- public page_media policy goes too.
--
-- No row is written, changed or removed, and no table or column changes.
--
-- The app works before and after this runs. It calls the function first; while
-- the function is missing, PostgREST answers PGRST202 (or Postgres 42883) and
-- the app falls back to the exact-match select it used before
-- (src/lib/supabase.ts). Once this is applied that fallback is never taken.
--
-- HITL: Jon applies this to production (Supabase SQL editor or
-- `supabase db push`). Agents do not apply it.

CREATE OR REPLACE FUNCTION public.storybook_by_share_code(code text)
RETURNS TABLE (
  id uuid,
  title text,
  author text,
  genre text,
  age_range text,
  page_count integer,
  description text,
  cover_image_url text,
  created_at timestamptz,
  ssync_data jsonb
)
LANGUAGE sql
STABLE
STRICT
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.title, s.author, s.genre, s.age_range, s.page_count,
         s.description, s.cover_image_url, s.created_at, s.ssync_data
  FROM public.shared_links AS l
  JOIN public.storybooks AS s ON s.id = l.storybook_id
  WHERE l.share_code = storybook_by_share_code.code
    AND s.is_public = true
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.storybook_by_share_code(text) IS
  'The one published storybook a share code names (exact match), with only the Reader''s columns. The only way a link holder reads a story (PRIVACY.md rule 4).';

REVOKE ALL ON FUNCTION public.storybook_by_share_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storybook_by_share_code(text) TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone reads shared links" ON public.shared_links;
DROP POLICY IF EXISTS "Anyone reads public storybooks" ON public.storybooks;
DROP POLICY IF EXISTS "Public media readable" ON public.page_media;

-- Have PostgREST see the new function now rather than on its next reload.
NOTIFY pgrst, 'reload schema';
