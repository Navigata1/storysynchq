# StorySync: Build-to-Vision Handoff

**For:** GPT 6.1 Sol, working through Codex
**From:** Claude (Anthropic), the agent that ran the v2 engine, the Digital Studio redesign and the Vision Reel
**Owner:** Jon (Navigata1), Island Development Crew
**Repo:** github.com/Navigata1/storysynchq · live at https://storysynchq.vercel.app
**Date:** October 2026 · base commit `main 4a62bb0`

Read this whole file before you write any code. It is self-contained: it tells you what the product is,
what already exists, what the ten reference screens ask for, how to plan the work as tickets, how to
build it, how to prove it, and how to hand it back to Claude for a quality and taste review.

---

## 0. Your job in one paragraph

Ten reference screens were designed for StorySync (the "Vision Reel"). They show the product Jon
wants, told across one invented family's week. Most of what they show is either already shipped or
buildable on today's engine. Your job is to make the real app match those screens: every surface
labeled **Shipped** must look and behave like its reference, every item labeled **Next** must be
built, and every item labeled **Idea** or **Phase 3** must stay out of the product (or appear only
where the reference itself shows it as a labeled future item). You plan the work as PRD → tickets →
TDD implementation, keep CI green, and finish with an evidence packet that lets Claude score whether
the taste survived the build.

---

## 1. Where everything is

| What | Path | How to use it |
|---|---|---|
| This handoff | `docs/vision/HANDOFF.md` | The contract |
| The Vision Reel page | `docs/vision/reel/index.html` | Open in a browser. Click any screen for full size / actual size |
| The ten reference screens (source) | `docs/vision/reference/screens/s01.html` … `s10.html` | Static HTML at 1600×1000. Each is one `<section class="ss-screen" id="sNN">` with its own scoped `<style>` |
| Reference renders (the target images) | `docs/vision/reference/renders/s01.png` … `s10.png`, `contact-sheet.png` | What "done" looks like |
| Shared design system for the references | `docs/vision/reference/foundation.css`, `sprite.svg` | Tokens + components the screens use. Port these into the app (§6) |
| The creative brief (the full spec) | `docs/vision/reference/brief.json` | 122 KB. `screens[n].layout_spec`, `copy`, `fuses_vision`, `realism`, `how_it_connects`; plus `cast`, `design_system`, `system_map`, `roadmap`, `coverage_check` |
| Page copy + per-screen status | `docs/vision/reference/editorial.json` | `status`, `realism` per screen (the final, coherence-checked labels) |
| System map | `docs/vision/reference/system-map.svg` | The loop and the seven layers in one picture |
| Render tool | `docs/vision/tools/render.cjs` | `node docs/vision/tools/render.cjs docs/vision/reference/screens/s05.html /tmp/s05.png --w 1600 --h 1000 --selector "#s05"` renders any reference with real fonts (cached in `reference/fonts/`) |
| Ticket folder | `docs/vision/tickets/` | You write PRDs and tickets here (§8) |
| Evidence folder | `docs/vision/evidence/` | You write the hand-back packet here (§11) |

Also read, in this order: `CLAUDE.md` (agent briefing, locked decisions, conventions), `docs/design-direction.md`
(two-register design language, Studio and Player contracts, Vision addendum §9, composition doctrine §10),
`docs/format-spec.md` (the SSYNC protocol), `PRIVACY.md` (COPPA posture), `agent_docs/decisions.md` (why things are the way they are),
`docs/10x-plan.md` (the last gauntlet's bars).

**Important about the reference content.** The Rivera family (Mia 4, Jess, Marco, Grandma Rose), Mia's
crayon drawings, Grandma's window photo, the share code `3f9c2a7be41d0c58` and every timestamp are
**illustrative**. Never hardcode them into the product. The only built-in content stays the house demo tape
"The Brave Little Star" in `public/demo/`. You may turn the reference's crayon drawings into **test fixtures**
(original content, allowed by CLAUDE.md) so tests can drive the app into the reference states.

---

## 2. The product in one page

StorySync brings back the library cassette book: a picture, a voice, a little melody underneath, and a
chime that says turn the page. **Still images + synchronized narration + a music bed + timing. Not video.**

It is two things:
1. **The SSYNC protocol**: an open format. v2 is the `.storysync` file, a ZIP with `manifest.json` +
   `assets/`. Seven layers: Metadata, Visual, Text, Voice, Sound, Behavior, Signature (v2.1 draft).
   One load-bearing rule: **published narration is always AAC/M4A** (WAV the only fallback, Opus/WebM never),
   so a tape recorded on Android plays on an iPhone.
2. **The app**: **StorySync Reader** (`/read`, receive) and **StorySync Creator** (`/studio`, create),
   plus the landing (`/`) and the protocol page (`/protocol`). `/classic` is the old app, preserved.

**North star:** a 4-year-old, with a parent, photographs her own drawings, records her voice on each page,
gets gentle music added automatically, and shares one link a grandparent opens in any browser.
**Kill criterion (the ten-minute test):** a satisfying 5-page narrated story made and shared in under 10 minutes.
**The wedge:** "Make any storybook read itself in the voice and mood you choose." Demo line: *"Google cannot read this in your voice."*
**The loop:** every story ends with an invitation to make one back. Receive ↔ create is why the format exists.
**Order of markets:** families first, schools second, remix later.

**Doctrine you must not break** (from `docs/design-direction.md`):
- Simple mode is the product; Advanced is depth behind a toggle. Never lead with the studio.
- Two registers: **Register A, studio chrome** (navy `#0a0e1a`, glass, Geist, one gold `#F59E0B` primary action,
  violet `#7C6BFF` secondary/"Next") for the room; **Register B, tape stock** (paper `#FFFDF6`, ink `#1E1A16`,
  label-yellow `#FFC93C`, tape-red `#E3452F`, shell `#3B3733`, Fraunces + IBM Plex Mono) for anything that *is* a story.
  Chrome recedes, the story glows.
- **Exactly one spectacle** in the whole product: the landing's cassette pressed into the deck. Everything else is calm.
  Motion is ease-out 300–600 ms, reels spin down and never bounce, nothing loops in the Creator except reels during playback,
  every animation has a `prefers-reduced-motion` state.
- **Stage = Player.** The Creator's Stage renders from the same `SsyncManifest` the Reader plays. If they disagree, that is a bug.
- **Honesty.** Shipped things carry no status chip; Next things are built; Idea / Phase 3 things never pretend to work.
- **COPPA-first.** Nothing leaves the device before the grown-up gate; consent travels inside the file; delete removes every
  copy and the link; no trackers, analytics, play counts or listens anywhere, ever; links are unlisted.

---

## 3. What exists today (do not rebuild it)

**Stack:** Next.js 16.1.6 (App Router) · React 19.2.3 · TypeScript strict · Tailwind 4 · Playwright · Supabase with a
localStorage fallback · fflate · mp4-muxer · qrcode. Node 24 on Vercel.

**Engine (`src/lib`), reuse and extend, never replace:**

| Capability | Module |
|---|---|
| Manifest types + validation | `src/lib/storysync/manifest.ts` (`SsyncManifest`, `SsyncPage`, `SsyncSignature`, `validateManifest`) |
| Pack / unpack `.storysync` | `src/lib/storysync/container.ts` |
| Recorder (negotiated mime, Safari-safe) | `src/lib/audio/recorder.ts` (`NarrationRecorder`) |
| Publish AAC normalization | `src/lib/audio/transcode.ts` (`normalizeNarration`: Safari passthrough → WebCodecs AAC → WAV) |
| Dual-bus audio + ducking + iOS unlock | `src/lib/audio/engine.ts` (`DualBusAudioEngine`, ducks ≈ −12 dB) |
| Generative music bed, 8 moods | `src/lib/audio/music.ts`, `src/lib/audio/moods.ts` (`resolveMood`, `MOODS`, crossfade `CROSSFADE_S = 1.6`) |
| Images (EXIF-safe, ≤2048 px) | `src/lib/images.ts` (`processImageSafe`) |
| Cloud saves + share codes | `src/lib/cloud-storage.ts` (codes minted at line ~155 as 8 random bytes = 16 hex) |

**Surfaces (`src/components`):** `landing/` (Landing, deck insert), `player/` (Player, ReadRoom, sound, timing),
`studio/` (Studio, Stage, ToolRail, ToolPanels, Filmstrip, Transport, Inspector, ParentGate, PublishCard, draft, cues,
moods-ui, useStudioAudio), `studio-kit/` (Reel, TapeLabel, GlassPanel, BigButton, TransportButton, ModeToggle, VUMeter),
`protocol/` (ProtocolPage, PacketDiagram, DownloadDemo, layers).

**Gates:** `npx tsc --noEmit` · `npm run lint` (0 errors today) · `npm run build` · `npx playwright test`
(desktop 1280×720 + mobile 375×812; 270 tests today). CI (`.github/workflows/ci.yml`) runs all four on every PR and
push to `main`. Vercel deploys `main` to production and every PR to a preview. Each build stamps
`<meta name="ssync-build" content="<commit sha>">`.

**Known truths the reel surfaced (these are bugs, fix them first; see tickets T01–T04):**
1. The landing's protocol teaser prints `4:32 · AAC/M4A` for the house tape. That tape has no recorded voice; it is read
   by the browser voice and runs about **1:47**. The true label is `~1:47 · READ-ALONG`.
2. Share codes are 16 hex characters (64-bit). `PRIVACY.md` promises 128-bit. Fix needs code + a Supabase migration.
3. The Creator never writes `metadata.narrator`.
4. The Creator writes `signature.voiceConsent[].date` as a full ISO timestamp; the v2.1 draft schema says a date (`YYYY-MM-DD`).
   It also writes one consent record named after "story by" (`Studio.tsx` ~line 703), not one per voice.

---

## 4. The ten reference screens, mapped to the app

Status key: **S** = shipped, must match the reference visually · **N** = Next, you build it · **I** = Idea, do not build ·
**P3** = Phase 3, do not build. Viewports are the device viewport in the reference; screenshot your build at that size.

### s01 · Press play → `/` Landing (laptop 1080×675, phone 390×844)
- **S:** cassette-into-deck hero (760 ms then `/read?demo=1`, instant under reduced motion), two doors, starfield, footer privacy line.
- **N (small):** hero tape label carries the demo's title ("The Brave Little Star · SIDE A · PRESS PLAY"); page-1's star sits
  exactly behind the deck's play key (the brand's gold and the story's light are one point); a "Remember the magic?" band
  carried from `/classic` with Jon's words ("Read along. Listen. Feel."); a "Three surfaces · one file" row (Reader, Creator,
  SSYNC Protocol); company line "A product of Island Development Crew LLC · Part of the SyncHQ Suite"; fix the 4:32 teaser (T01).
- Reference: `reference/screens/s01.html`, brief `screens[0]`.

### s02 · The room around a page → `/read` Player (laptop 1120×700)
- **S:** Tap to Begin cover gate, ambient room from the page's own colors, read-along (amber current word, warm past words),
  page-turn chime, ducking, mood crossfades, Reading options, keyboard (← → space P esc), chrome that hides.
- **N:** two-page **spread** at desktop widths (art left, text right, art dominant ~560/440) instead of full-bleed + scrim;
  an expanded **deck chip** showing the three sounds at once (VOICE with a 9-bar mini waveform and narrator name,
  MELODY with mood + "12 dB under the voice", CHIME with seconds to the turn); **tape-pack progress** on the chip's reels
  (left pack big early, right pack big late); honor the manifest's own mood crossfade duration (`pages[].music.duration`)
  instead of always 1.6 s.
- **I:** word-to-picture hotspots ("tap a word, the picture answers"). Do not build.

### s03 · Snap. Tell. Hear it. → `/studio` Simple mode (tablet 1180×820)
- **S:** Simple mode, camera-first capture, tap-to-record/stop with blips, page lock while recording, voice badges, Wonder on
  by default, autosave on this device only, microphone-off recovery ("The microphone is switched off … Try again /
  Keep writing instead"), Magic as a local generator.
- **N:** Magic visually **set apart** from Photo/Voice/Music in the rail (three friendly tools first); the **Stage borrows the
  Player's ambient light** (blurred page backdrop); the filmstrip drawn as a **tape ribbon** with a mood lane
  ("WONDER · GENTLE MUSIC ADDED FOR YOU"); a tape-red **listening ring** around the Stage photo while recording.
- **I:** the listening mascot and the giant "Hear it" button. Do not build. Words do not light during a take (needs on-device
  alignment); keep that honest.

### s04 · A grown-up moment → `ParentGate` (tablet 1180×820)
- **S:** "A grown-up moment", an a×b question asked every time a story is finished, a consent row only when a recorded voice
  exists, consent + ownership + rights written into the manifest, AAC conversion in the browser.
- **N:** beside the gate, a printed **"What goes into your tape"** sheet (Register B) listing the seven layers in plain words for
  *this* story; ticking consent **inks a stamp** on the Signature band ("VOICE CONSENT · GRANTED · PARENT/GUARDIAN · <date>");
  the line *"Your child's voice never goes anywhere without you."*; one consent record **per recorded voice** (T04).

### s05 · One link, Grandma's iPhone → `PublishCard` (tablet) + `/read` on a phone (iPhone 390×844)
- **S:** the printing label, "Made in m:ss", the step list, private link + Copy, QR, Share the link… (Web Share), unlisted note,
  `.storysync` download, Delete everything, Tap to Begin, read-along on a recorded voice, Reading options.
- **N:** landscape two-column publish card; the child's first page on the tape label; a row of **layer chips** with
  "consent written"; a **size meter** "2.0 MB OF 15 MB" (format budget, `docs/format-spec.md` §5); delete drawn as
  **"Pull the tape out — delete everything"**; write `metadata.narrator` and show **"VOICE: <narrator>"** on the cover and the
  narrator in the Player's deck chip (T03); an **"Evening out each voice"** step (loudness levelling before AAC, see T17).
- Not UI: the passport-stamp ribbon in the reference is an explanatory diagram. Do not build it.

### s06 · Grandma answers back → Player end card + Creator on a phone (two iPhones 390×844)
- **S:** end card with the tape label, Read it again, Make your own story, QR when opened from a link; the Creator on a phone
  with its bottom toolbar; Safari AAC passthrough.
- **N:** **J-card liner notes** on the end card (Signature for listeners: pictures, words, voice, music, made in, owner,
  consent) ending in a link **"What's inside this tape? →"** to `/protocol`; **"Send a thank-you back"** which opens the
  Creator as a one-page reply ("Reply to · <title>" chip); a **READ THIS** card in the Creator that shows the page's words in
  large type while recording (teleprompter); **adult self-consent** in the gate ("Whose voice is on this tape? Mine — I'm the
  grown-up speaking / A child's — I'm their parent or guardian"; record `grantedBy: "self"`).
- **I:** "Keep it on this phone" (offline tapes). Do not build.

### s07 · Our shelf → `/read` Read Room (laptop 1140×712)
- **S:** "Pick a tape.", the demo, open a `.storysync`, make your own; "We couldn't find that tape" for a dead code; delete that
  removes every copy and the link; the eight moods.
- **N:** a **shelf of the family's tapes** (cloud library when signed in, this device otherwise) drawn as cassettes on a ledge,
  the selected one lifted over a gold glow; a **"NEW"** stamp on tapes received since the last visit; **Sent to you** (tapes
  opened from a link stay on this device's shelf); **resume** ("You stopped at page N" / "Pick up where you left off");
  **Read it in…** (open any tape, including the house tape, in the Creator to re-voice it in your own voices and a chosen
  mood: requires the Creator to open a `.storysync`, T15). Pull-out delete animation.
- **I:** search, genre pills, "Keep tapes on this laptop", the curated catalog beyond the Star, Premium badges. Do not build.
  **P3:** made voices.

### s08 · One file holds the whole storybook → `/protocol` (laptop 1140×712, paper stage)
- **S:** hero, facts row, codec rule and browser ladder, privacy section, demo download, validator messages, schemas.
- **N:** the **exploded packet figure** (a real page taken apart into seven printed plates, 01 Metadata at the bottom to
  07 Signature at the top, Signature tagged "V2.1 · DRAFT"); a **validator** block showing PASS/WARN/FAIL lines in the real
  `validateManifest` language; a **"Write your own player"** code block (the fflate snippet in the reference); the codec rule
  as MUST / MAY / MUST NOT; the Player honoring **author-default accessibility** from `settings.accessibility` (viewer
  preferences still win).

### s09 · Both are the same room → `/studio` Advanced (web; reference is drawn as a desktop window)
- **S:** Simple/Advanced toggle and every Inspector section (timing, mix, mood readout, activity-envelope note, codec badges,
  codec rule, manifest JSON), the restore prompt.
- **N:** **per-page moods** in the Creator; **"Type a feeling"** field that runs `resolveMood` ("a quiet lullaby for bedtime" →
  Hush); voice levelling toggle (T17).
- **P3, do not build:** the Tauri desktop app, the professional multi-lane timeline, Cast (several narration tracks per page),
  sound effects lane.

### s10 · Room 4, and the shelf to come → nothing to build
- Everything here is **P3** or **I** (StorySync for Schools, bilingual tracks, class shelf, sealed roadmap tapes, plans).
  Only check that `/read` opens from a QR with no account. Do not build any of it.

---

## 5. Protocol and engine changes (additive, spec-first)

Change the spec and schema **before** the code, in the same PR as the code that needs it. Every change is additive; v2.0 readers
must keep working (unknown fields ignored).

| Change | Files | Notes |
|---|---|---|
| Write `metadata.narrator` | `Studio.tsx` publish, `manifest.ts` | From "story by" or a new narrator field |
| `voiceConsent[].date` as `YYYY-MM-DD` | `Studio.tsx` ~703, `manifest.ts`, `public/protocol/v2.schema.json`, `docs/format-spec.md` §7 | Validator warns on timestamps |
| One consent record per recorded voice; `grantedBy: "parent/guardian" \| "self"` | ParentGate, Studio publish | Schema already allows free text |
| `signature.replyTo` (share URL or id of the tape this answers) | format-spec §7, schema, manifest.ts | For "Send a thank-you back"; distinct from `remixOf` |
| Per-page mood + honor `music.duration` crossfade | Studio state, Player, `music.ts` `setMood(mood, seconds)` | `setMood` already takes seconds |
| Player reads `settings.accessibility` as defaults | Player, timing | Viewer choices override |
| 128-bit share codes | `cloud-storage.ts` (16 bytes → 32 hex), new `supabase/migrations/002_*.sql` if the column has a length limit | **HITL:** Jon applies the migration to production. Old 16-hex codes keep working |

Update `docs/format-spec.md`, `public/protocol/v2.schema.json`, `tests/storysync-roundtrip.spec.ts` and the decision log
(`agent_docs/decisions.md`, append-only) for each.

---

## 6. Design system: port the reference foundation into the app

`docs/vision/reference/foundation.css` is the design system the references were drawn with (tokens, device-agnostic
components, Register A + B). The app's own kit is `src/components/studio-kit/` (`kit.tsx`, `kit.css`). Do this once, early (T05):

1. Move the tokens (navy scale, glass, fg scale, gold/violet/ok, paper/ink/label/red/shell, the 8 mood colors, type tokens,
   `--ss-ease`) into `src/app/globals.css` / `kit.css` as CSS custom properties.
2. Add React components for the shared pieces the screens reuse, with the reference look: `TapeLabel` (exists, align it),
   `Cassette`, `Reel` (exists), `DeckChip` (three sounds), `LayersStrip` (seven dots), `MoodTapeChip`, `JCard`, `PacketBands`
   + `PacketExploded`, `Shelf` + `ShelfTape`, `PassportStamp` is diagram-only (skip), `StatusChip` (`next` violet / `idea`,
   `phase3` grey dashed), `ConsentStamp`, `SizeMeter`, `TapeRibbon`, `ListeningRing`.
3. The icon set in `sprite.svg` is Lucide (ISC), already a dependency as `lucide-react`. Use `lucide-react` in the app; do not
   ship the sprite.
4. Fonts are already loaded with `next/font` (Geist, Fraunces, IBM Plex Mono). No new font requests.
5. No new runtime dependencies without Jon's approval (CLAUDE.md §8 of design-direction).

The brief's `design_system` field specifies each local shared piece exactly (sizes, borders, radii, states). Follow it.

---

## 7. Guardrails (non-negotiable)

- Everything in `CLAUDE.md`. TypeScript strict. Tailwind utilities, custom CSS only for complex animation in component-scoped files.
- All new UI is SSR-safe client components; no window access during render (lint enforces hydration rules today).
- No server actions or API routes for core flows (the Creator must stay wrappable by Tauri later).
- Published narration: AAC/M4A, WAV fallback, never Opus/WebM. Never hardcode a recorder mime.
- COPPA posture: no trackers, analytics, counters, "plays", "listens", minutes or scores anywhere. Nothing leaves before the gate.
- Exactly one spectacle (landing). `prefers-reduced-motion` respected everywhere.
- Accessibility is a requirement: keyboard paths, focus states, contrast in both registers, readable at 375 px.
- Do not build anything marked **I** or **P3** in §4. If a reference shows a future item inside a shipped surface, either leave it
  out or render it exactly as the reference does: visibly labeled, inert.
- Never weaken a test, skip a test, or merge around red CI. Never force-push `main`.
- `/classic` stays untouched.

---

## 8. The workflow: PRD → tickets → TDD build (Matt Pocock style)

Use Matt Pocock's skills if they are installed in your environment (his PRD-writing, PRD-to-issues and TDD skills).
The procedure below is the contract whether or not they are; it follows the same method.

### 8.1 PRD per milestone
For each milestone in §9, write `docs/vision/tickets/M<k>-PRD.md`:
problem statement (from the user's side), the reference screens it serves, user stories, what is in and out of scope
(quote the §4 statuses), module and seam decisions (which `src/lib` modules change, which components are new), testing
decisions (what behavior is tested, at which seam), and open questions for Jon (HITL).

### 8.2 Tickets as vertical tracer bullets
Split each PRD into tickets in `docs/vision/tickets/T<nn>-<slug>.md` (or GitHub issues if you have issue access; keep the files
either way). Every ticket is a **thin vertical slice** that cuts through every layer it needs (manifest → engine → component →
test) and is demoable on its own. Not horizontal layers.

Ticket template:
```markdown
# T<nn> · <title>
Milestone: M<k> · Reference: s0X (brief screens[X-1]) · Status in reel: Shipped | Next
Type: AFK (agent can finish alone) | HITL (needs Jon)
Blocked by: T<..>, T<..>   ·   Blocks: T<..>
## Why
One paragraph from the user's side, quoting the reference.
## Done when (acceptance, each testable)
- [ ] …
## Seams and files
## Tests (written first)
## Fidelity check
Viewport WxH; the state to reach; the reference crop to compare against.
```

Rules: tickets are ordered by their blocking edges; nothing starts before its blockers are merged into your working branch;
HITL tickets stop and ask Jon (only T02's migration apply is known to need him).

### 8.3 Implement each ticket with TDD
For each ticket, in dependency order:
1. **Red:** write the failing test(s) at the ticket's seam: unit-level Playwright Node tests for `src/lib` behavior (like
   `tests/storysync-roundtrip.spec.ts`), Playwright E2E for UI behavior. Run them; see them fail for the right reason.
2. **Green:** the smallest change that passes.
3. **Refactor** with the suite green.
4. **Fidelity:** drive the UI into the reference state, screenshot at the reference viewport into
   `docs/vision/evidence/T<nn>.png`, open it next to `docs/vision/reference/renders/s0X.png` and fix the differences that matter
   (layout, hierarchy, register, type, spacing, copy, states). Pixel-identical is not the goal; the same product is.
5. Run all four gates locally (`tsc`, `lint`, `build`, `playwright test`). Commit with `feat:` / `fix:` / `docs:` and the ticket
   id in the subject. Push after every commit.
6. Append a line to `docs/vision/evidence/LEDGER.md`: ticket, commit SHA, tests added, gates result, screenshot path, deviations.

### 8.4 Branches and PRs
Work on a branch `feat/vision-build` (or one per milestone). Open a **draft PR** to `main` early so CI and the Vercel preview
run on every push. Do **not** merge to `main` yourself; the merge happens after Claude's review (§11).

---

## 9. Milestones and the starting ticket backlog

Write the full tickets from this backlog (you may split further; keep the ids stable). Order = dependency order.

### M0 · Truth and foundations
| Id | Ticket | Type | Blocked by |
|---|---|---|---|
| T01 | Landing teaser prints `~1:47 · READ-ALONG` (derive from the demo manifest: words ÷ 2.5 + autoPause sum; label READ-ALONG when no `audioUrl`) | AFK | — |
| T02 | 128-bit share codes (32 hex), old codes still resolve; migration file; PRIVACY.md true | HITL (apply migration) | — |
| T03 | Write `metadata.narrator`; show "VOICE: <narrator>" on covers and in the deck chip when present | AFK | — |
| T04 | Consent per recorded voice; `date` as `YYYY-MM-DD`; validator WARN on timestamps; schema + spec | AFK | — |
| T05 | Port reference tokens + shared components into `studio-kit` (§6). No new dev-only routes; test each component through the pages that use it | AFK | — |

### M1 · Landing (s01)
| T06 | Hero tape carries the demo title; page-1 star aligned behind the play key; reduced-motion still | AFK | T05 |
| T07 | "Remember the magic?" band + "Three surfaces · one file" row + company line | AFK | T05 |

### M2 · Reader (s02, s05 phone, s06 end card)
| T08 | Desktop two-page spread (art-dominant), mobile keeps full-bleed | AFK | T05 |
| T09 | Expanded deck chip: three sounds, narrator name, tape-pack progress | AFK | T03, T05 |
| T10 | Honor manifest crossfade durations; per-page mood playback | AFK | — |
| T11 | Author-default accessibility from `settings.accessibility` | AFK | — |
| T12 | End-card J-card liner notes + "What's inside this tape?" → `/protocol` | AFK | T04, T05 |

### M3 · Creator Simple + publish (s03, s04, s05)
| T13 | Rail: three tools + Magic set apart; Stage borrows the Player's ambient light; listening ring; tape-ribbon filmstrip with mood lane | AFK | T05 |
| T14 | Gate: "What goes into your tape" seven-layer sheet; inked consent stamp; trust line; adult self-consent option | AFK | T04, T05 |
| T15 | Creator opens a `.storysync` (and the house tape) to re-voice it; recorded voices replace browser voice per page | AFK | — |
| T16 | Publish card: two-column, first page on the label, layer chips, size meter, "Pull the tape out — delete everything" | AFK | T05 |
| T17 | "Evening out each voice": loudness levelling (OfflineAudioContext gain to a target RMS + gentle limiting) before AAC; a step in the publish list; toggle in Inspector | AFK | — |

### M4 · Answer back + shelf (s06, s07)
| T18 | "Send a thank-you back" → one-page reply in the Creator, `signature.replyTo`, "Reply to · <title>" chip | AFK | T04, T15 |
| T19 | READ THIS teleprompter card while recording | AFK | T13 |
| T20 | Shelf view: your tapes as cassettes on a ledge, selected lift, NEW stamp, Sent to you (device-local), pull-out delete animation | AFK | T05 |
| T21 | Resume: remember the last page per tape on this device; "You stopped at page N" | AFK | T20 |
| T22 | "Read it in…": whose voice + what should it feel like (8 mood tape chips) → opens the Creator | AFK | T15, T20 |

### M5 · Protocol (s08) and Advanced (s09)
| T23 | `/protocol`: exploded packet figure, validator block with real messages, "Write your own player" snippet, MUST/MAY/MUST NOT | AFK | T04, T05 |
| T24 | Advanced: per-page moods + "Type a feeling" via `resolveMood` | AFK | T10 |

### M6 · Fidelity sweep and hand-back
| T25 | `tests/vision-fidelity.spec.ts`: drives each surface into its reference state with fixtures and saves screenshots to `docs/vision/evidence/` at the reference viewports | AFK | all above |
| T26 | Evidence packet + REPORT.md (§11); open the PR for Claude's review | AFK | T25 |

---

## 10. Definition of done (the whole build)

- Every **S** and **N** item in §4 is in the app, behaves as described, and survives `prefers-reduced-motion`, keyboard-only use
  and a 375 px phone.
- No **I** or **P3** item is built or presented as working.
- The ten-minute test passes on a real flow: 5 pages, 5 recordings, publish, open the link on a second browser profile.
- All gates green locally and in CI; the Vercel preview of the PR works end to end.
- `docs/format-spec.md`, the schema, `PRIVACY.md`, `CLAUDE.md` (project structure) and `agent_docs/decisions.md` describe the
  code as built.
- No new runtime dependency without Jon's written yes.

---

## 11. Hand-back to Claude (review of quality and taste)

When T26 is done, stop and hand back. Do not merge. Produce, in `docs/vision/evidence/`:

1. **`REPORT.md`**: what was built per ticket; what was deliberately not built and why; every deviation from a reference, with
   the reason; open questions for Jon; known bugs.
2. **`LEDGER.md`**: one line per ticket: id, commit SHA, tests added, gate results, screenshot paths.
3. **Screenshots**: for each reference screen, the app at that screen's viewport(s) in the reference state, named
   `s0X-<surface>-<viewport>.png` (e.g. `s05-publish-1180x820.png`, `s05-reader-390x844.png`), plus the reduced-motion and
   375 px variants where they differ.
4. **`gates.txt`**: the exact commands and their final output lines (tsc, lint summary, build route table, Playwright summary).
5. The **PR URL** and the **Vercel preview URL** whose `ssync-build` meta matches the PR head SHA.

Then tell Jon: "Ready for Claude's review: <PR URL>". Jon brings it back to Claude.

**What Claude will score** (so you know the bar now):

| Axis | Question |
|---|---|
| Fidelity | Does each surface read as its reference: layout, hierarchy, register, type, spacing, states, copy? |
| Taste | Chrome recedes, the story glows; one spectacle; calm motion; no generic SaaS drift; Register B looks printed, not glassy |
| Honesty | Status labels true; nothing fake; no invented numbers; Phase 3 absent |
| Engine truth | Stage = Player; AAC rule; consent in the file; delete really deletes; per-voice consent; crossfades honored |
| Privacy | Gate before anything leaves; no trackers or counters; unlisted links; 128-bit codes |
| Craft | Accessibility, reduced motion, 375 px, no hydration warnings, no console errors, performance budget (landing ≤ 200 KB JS beyond framework) |
| Process | Tickets were vertical slices, tests came first, CI stayed green, evidence is reproducible |

Claude will re-run the gates, render the references and your screenshots side by side, walk the ten-minute flow on the Vercel
preview, and return a scored review with a fix list ranked by severity.

---

## 12. Facts you may need (from the brief's cast; use only for fixtures and tests)

- House tape "The Brave Little Star" by Island Development Crew: 8 pages (7 watercolors + "The End"), ~1:47, read by the browser
  voice, moods Wonder (1–3) → Adventure (4–5) → Calm (6–8; manifest says "peaceful"), autoPause 3,3,4,3,4,5,6,5 s.
- Fixture tape "Twinkle Came to My Window", story by "Mia, age 4 — with Mom", 5 pages:
  (1) "This is Twinkle. She is a little star." (2) "Twinkle looked down at all the houses." (3) "I was scared of the dark.
  Twinkle came to my window." (4) "We flew over the moon!" (5) "Goodnight, Twinkle. Goodnight, Grandma!" Clips 5.1/4.4/6.4/3.8/4.3 s,
  mood Wonder, autoPause 2 s. The five drawings are inline SVG in `reference/screens/s03.html`; rasterize them for fixtures.
- Reply fixture "Goodnight, Mia" by Grandma Rose: 1 page, text "Goodnight, my brave little star. I'll look for Twinkle at my window
  tonight. Love, Grandma."
- The eight moods and their child-facing blurbs live in `src/lib/audio/moods.ts`. Use them verbatim.

---

*If anything in this file conflicts with `CLAUDE.md`, `PRIVACY.md` or the format spec, those win; note the conflict in REPORT.md.*
