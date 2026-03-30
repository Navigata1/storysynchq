-- StorySyncHQ Database Schema
-- Run in Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users/profiles (extends Supabase Auth)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT,
  avatar_url TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'creator', 'studio')),
  stories_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Storybooks
CREATE TABLE public.storybooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT DEFAULT '',
  genre TEXT DEFAULT 'children',
  age_range TEXT DEFAULT 'all ages',
  description TEXT DEFAULT '',
  page_count INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT false,
  is_premium BOOLEAN DEFAULT false,
  cover_image_url TEXT,
  ssync_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Page media (illustrations, audio recordings)
CREATE TABLE public.page_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  storybook_id UUID NOT NULL REFERENCES public.storybooks(id) ON DELETE CASCADE,
  page_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('illustration', 'narration', 'music')),
  file_url TEXT NOT NULL,
  file_size INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shared links
CREATE TABLE public.shared_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  storybook_id UUID NOT NULL REFERENCES public.storybooks(id) ON DELETE CASCADE,
  share_code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(8), 'hex'),
  views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_storybooks_user ON public.storybooks(user_id, created_at DESC);
CREATE INDEX idx_storybooks_public ON public.storybooks(is_public, created_at DESC) WHERE is_public = true;
CREATE INDEX idx_page_media_book ON public.page_media(storybook_id, page_id);
CREATE INDEX idx_shared_links_code ON public.shared_links(share_code);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storybooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_links ENABLE ROW LEVEL SECURITY;

-- Profiles: users see own + public view of others
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Storybooks: users CRUD own, anyone reads public
CREATE POLICY "Users manage own storybooks" ON public.storybooks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anyone reads public storybooks" ON public.storybooks FOR SELECT USING (is_public = true);

-- Page media: follows storybook ownership
CREATE POLICY "Users manage own media" ON public.page_media FOR ALL
  USING (storybook_id IN (SELECT id FROM public.storybooks WHERE user_id = auth.uid()));
CREATE POLICY "Public media readable" ON public.page_media FOR SELECT
  USING (storybook_id IN (SELECT id FROM public.storybooks WHERE is_public = true));

-- Shared links: owner manages, anyone reads
CREATE POLICY "Users manage own links" ON public.shared_links FOR ALL
  USING (storybook_id IN (SELECT id FROM public.storybooks WHERE user_id = auth.uid()));
CREATE POLICY "Anyone reads shared links" ON public.shared_links FOR SELECT USING (true);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER storybooks_updated BEFORE UPDATE ON public.storybooks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update stories count on insert/delete
CREATE OR REPLACE FUNCTION update_stories_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET stories_count = stories_count + 1 WHERE id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET stories_count = stories_count - 1 WHERE id = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER storybooks_count_trigger
  AFTER INSERT OR DELETE ON public.storybooks
  FOR EACH ROW EXECUTE FUNCTION update_stories_count();
