# StorySyncHQ Privacy Posture — COPPA First

The flagship user is a 4-year-old recording their voice over their own drawings.
A child's voice recording is **personal information under COPPA** (15 U.S.C. §§ 6501–6506).
That fact shapes the product, not just this document.

## The rules the app enforces

1. **Nothing leaves the device without a parent.** Creating, recording, and previewing a
   story all run entirely in the browser (state + localStorage). Saving to the cloud
   library or sharing a link is gated behind a **parental gate** — a neutral
   adult-verification screen (arithmetic challenge) that a pre-reader can't pass by
   tapping through. The gate is re-asked per session, not remembered forever.

2. **One-tap full deletion.** Deleting a story removes the story record, its share code,
   its images, and its narration audio — cloud row and local copies both. There is no
   soft-delete archive of children's voice data.

3. **Zero third-party trackers in the player.** The reader/player ships no analytics, no
   crash telemetry, no ad pixels, no external fonts-with-beacons. Diagnostics are local
   (browser console) only. Opt-in, PII-scrubbed crash reporting may come at beta — it will
   never be on by default.

4. **Unlisted, unguessable share links.** Share codes are random and unlisted. A shared
   story is reachable only by someone holding the link. Share links can be revoked by
   deleting the story.

5. **Drafts are local.** Autosaved drafts (including any recorded narration) live in the
   browser's localStorage only, and the draft is wiped by the story-deletion action.

## What is stored where

| Data | Where | When | Deleted by |
|---|---|---|---|
| Story text, images, narration audio (draft) | Browser localStorage / memory | While creating | "Delete story" or clearing browser data |
| Story text, images, narration audio (saved) | Supabase (user's row) or localStorage fallback | Only after parental gate | "Delete story" (removes all assets + share code) |
| Share code | Supabase | Only after parental gate | Deleting the story |
| Account email | Supabase auth | On sign-up (an adult action) | Account deletion |

## Phase 3 commitments (designed now, enforced then)

- Voice cloning will always require explicit, documented, revocable consent.
- Any telemetry will be opt-in and PII-scrubbed, never default-on.
- A written retention policy ships with accounts for schools (batch deployment).
