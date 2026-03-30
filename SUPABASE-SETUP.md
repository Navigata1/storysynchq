# StorySyncHQ — Supabase Setup Guide

> **Time:** ~10 minutes | **Prereqs:** Supabase account, Vercel project deployed

---

## Step 1: Create the Supabase Project

1. Go to [supabase.com](https://supabase.com) → **Sign In**
2. Click **New Project**
3. Fill in:
   - **Organization:** `Island Development Crew` (create one if it doesn't exist)
   - **Project name:** `storysynchq`
   - **Database password:** Click **Generate** for a strong password → **SAVE THIS SOMEWHERE SAFE** (1Password, notes, etc.)
   - **Region:** `US East (North Virginia)` — `us-east-1` (closest to Huntsville, AL)
4. Click **Create new project**

## Step 2: Wait for Provisioning

Project takes ~2 minutes to spin up. You'll see a progress indicator. Wait until the dashboard is fully loaded.

## Step 3: Get Your Credentials

1. Go to **Settings** → **API** (left sidebar)
2. Copy these two values:

| Field | Looks like | Where to find |
|-------|-----------|---------------|
| **Project URL** | `https://abcdefghijk.supabase.co` | Under "Project URL" |
| **anon public key** | `eyJhbGciOiJIUzI1NiIs...` (long JWT) | Under "Project API keys" → `anon` `public` |

> ⚠️ Do NOT copy the `service_role` key — that's admin-level and should never be in frontend code.

## Step 4: Set Environment Variables (Local)

Create `.env.local` in the **storysynchq project root** (`~/clawd/storysynchq/`):

```env
# Supabase — StorySyncHQ
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJyour-anon-key-here
```

Replace with your actual values from Step 3.

> `.env.local` is gitignored — your keys stay local. See `.env.local.example` for the template.

## Step 5: Run the Database Schema

1. Go to **Supabase Dashboard** → **SQL Editor** (left sidebar)
2. Click **New query**
3. Open the file `supabase/migrations/001_initial_schema.sql` from this repo
4. **Copy the entire contents** and paste into the SQL Editor
5. Click **Run**
6. You should see: `Success. No rows returned.` for each statement

> If you see errors, check that you're running against a fresh project with no existing tables.

## Step 6: Enable Auth Providers

1. Go to **Authentication** → **Providers** (left sidebar)
2. **Email/Password** should already be enabled by default — verify the toggle is ON
3. *(Optional)* Enable **Google OAuth** for social login later:
   - Toggle Google ON
   - You'll need a Google Cloud OAuth client ID/secret (can do this later)

## Step 7: Create Storage Bucket

1. Go to **Storage** (left sidebar)
2. Click **New bucket**
3. Fill in:
   - **Name:** `storybook-media`
   - **Public bucket:** Toggle **ON** (Yes)
4. Click **Create bucket**

> This bucket stores page images, stickers, and media for storybooks.

## Step 8: Verify Everything

### Tables
Go to **Table Editor** → you should see these tables:
- ✅ `profiles`
- ✅ `storybooks`
- ✅ `page_media`
- ✅ `shared_links`

### Auth
Go to **Authentication** → **Users** → should be **empty** (ready for signups)

### Storage
Go to **Storage** → should see the `storybook-media` bucket

> If any of these are missing, re-run the schema (Step 5) or re-create the bucket (Step 7).

## Step 9: Deploy to Vercel with Env Vars

1. Go to [vercel.com](https://vercel.com) → **storysynchq** project
2. Click **Settings** → **Environment Variables**
3. Add these two variables:

| Key | Value | Environment |
|-----|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://your-project-id.supabase.co` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJyour-anon-key-here` | Production, Preview, Development |

4. Click **Save** for each
5. Go to **Deployments** → click **⋮** on the latest → **Redeploy**

## Step 10: Test End-to-End

1. Open [storysynchq.vercel.app](https://storysynchq.vercel.app)
2. Click **Sign In** → **Sign Up**
3. Enter an email and password → Submit
4. ✅ Check Supabase **Authentication → Users** — your new account should appear
5. Create a new story → Add some pages → **Save**
6. ✅ Check Supabase **Table Editor → storybooks** — your story should be there
7. Refresh the page — story should persist (loaded from database)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Invalid API key" | Double-check `.env.local` values match Supabase dashboard exactly |
| Tables not showing | Re-run the SQL migration in Step 5 |
| Auth not working | Verify Email provider is enabled in Authentication → Providers |
| Vercel deploy still broken | Make sure you **redeployed** after adding env vars |
| CORS errors | Your Supabase URL might be wrong — check for typos |

---

## Files Reference

| File | Purpose |
|------|---------|
| `.env.local` | Your local Supabase credentials (gitignored) |
| `.env.local.example` | Template with placeholder values (committed) |
| `supabase/migrations/001_initial_schema.sql` | Database schema to run in SQL Editor |
| `src/lib/supabase.ts` | Supabase client initialization |
