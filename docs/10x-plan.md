# StorySyncHQ — The 10× Plan (Fable 5.1 reassessment, September 2026)

> Read after `docs/design-direction.md`. This is the bar the gauntlet loops against.
> Every work package below has a **falsifiable acceptance probe**. A critic must be
> able to fail a package on captured evidence, or the package is not done.

## 1. Verdict on the redesign as shipped (commits a80cbd2…ff39e56)

**What is already excellent — protect it:**
- The landing hero: a full-CSS cassette in a starfield room; "Press play on the
  stories you make together." The signature moment lands at 1440 and at 390.
- The two-register language works: tape-stock cards (Read Room chooser, cover
  gate, doors) against calm studio chrome. Typography (Fraunces / Plex Mono /
  Geist) is right.
- The cover gate: tape deck + label + "Tap to Begin" — the cassette clicking in.
- The studio layout contract is real, including the mobile collapse.

**Where it is not yet the thing — the gaps that matter, in priority order:**

| # | Gap | Why it blocks the feeling |
|---|---|---|
| G1 | **The share loop is broken in production.** With Supabase configured: unauthenticated publish is rejected by RLS and misreported as "storage full"; published rows are `is_public: false` so recipients can never read them; re-publish orphans copies that "Delete everything" misses (COPPA). | The grandparent moment — the reason the format exists — cannot happen. |
| G2 | **The melody is a sine drone.** Two detuned oscillators through a low-pass. | "It had a nice little melody behind it" is the memory. A drone is not a melody. This is the largest untapped emotional lever and it costs zero licensing. |
| G3 | **The player is not immersive on desktop.** A ~650px illustration with dead black on both sides; "full" layout text sits on the art with a weak scrim. Read-along highlight exists only for TTS, not for the recorded voice. | The Stage/Player is the product. Dead space and unreadable text break "undivided attention on a story." |
| G4 | **Music contract broken both ways.** Studio writes `page.music` moods the Player doesn't know (`Hush`); music-off is ignored by the Player (falls back to Wonder). | Preview ≠ published tape. The Stage promise ("exactly what the listener gets") is false. |
| G5 | **Child-flow correctness bugs** (code-review verified): recording attributed to the page active at *stop*, not *start*; nav not blocked while recording; Space on a focused button hijacked into play; TTS fallback truncated by a stale timer; autosave failure hidden under 1024px; re-normalizing already-normalized narration; `450ms` parsed as 450s; multi-MB `JSON.stringify` per meter tick; cover image duplicated. | Each one is a moment where a 4-year-old's story goes wrong silently. |
| G6 | **No sound design.** No page-turn cue in the new player/studio; no recording start/stop cues. | The "turn the page" chime is one of the three memories in the origin quote. |
| G7 | **Publish is a dead end.** No QR, no native share sheet, no consent record, no "made in m:ss". | Tape 6 of the plan; the Signature layer exists in the protocol but nothing writes it. |
| G8 | **Hero "Press play" only scrolls.** | The cassette should *play* — into the deck, onto the cover gate. |
| G9 | **The protocol has no home in the product.** Schema link only. | "Like PDF" is only credible if the spec is a page a developer can read. |

## 2. The 10× thesis

Ten-times is not ten more features. It is closing the distance between the
screenshot and the *feeling*: a real melody under a real voice, an illustration
that fills the room, words lighting as they are spoken, a chime when the page
turns, and a link that actually plays on the grandparent's phone — with the
consent record travelling inside the tape. Everything below serves that.

## 3. Work packages and their bars

Builders own disjoint files. Critics are blind: they verify from the repo, the
running app, and captured evidence — never from a builder's report.

### WP-M · The Melody — a generative music engine (foundation, runs first)
Owner files: `src/lib/audio/moods.ts` (new), `src/lib/audio/music.ts` (new),
`src/lib/audio/engine.ts` (extend, keep API compatible).
- One canonical mood vocabulary (protocol values written to `page.music`):
  `Wonder · Adventure · Calm · Joy · Hush · Rain · Suspense · Melancholy`, with
  synonym resolution (`resolveMood(string|undefined) → MoodName | null`, null = silence).
- Per mood: key/scale (pentatonic/major/minor), tempo, a soft pad (filtered
  detuned saws/triangles, slow LFO), and a **music-box/celesta arpeggio** of
  scheduled notes (exponential envelopes, gentle randomness within the scale,
  bar-aligned) — a real melody, quiet, loopable, never busy. Optional soft
  noise "tape hiss" bed at −40 dB for warmth (mood-gated).
- Engine: `startMusic(mood)` / `setMood(mood)` crossfade; ducking unchanged;
  `stopMusic()` fades out. Scheduler uses look-ahead timing (no `setInterval`
  drift); disposes cleanly; respects `visibilitychange` (pause when hidden).
- Deterministic seed option for tests.
**Bar (falsifiable):** (a) node test: `resolveMood` maps every Studio and legacy
value (`Wonder`, `hush`, `Adventure`, `undefined→null`, unknown→`Wonder`);
(b) `OfflineAudioContext` render of 8 s of each mood produces non-silent output
with ≥ 8 distinct scheduled note onsets and peak < 0 dBFS (a Playwright test
running in the browser); (c) tsc + lint clean.

### WP-S · Studio hardening + the share loop that works
Owner files: `src/components/studio/**`, `src/lib/cloud-storage.ts`.
- Publish: set `isPublic: true` (unlisted-by-URL; matches the read policy — document
  in `PRIVACY.md` that "public" means reachable by link, not indexed).
  Unauthenticated + Supabase configured → offer sign-in (existing `signIn`/`signUp`
  in `@/lib/supabase`) **or** an honest local path ("Saved on this device — download
  the tape or sign in to get a link"); never misreport as "storage full" (typed errors).
  Re-publish **updates** the existing story id; "Delete everything" removes every copy
  and share code (`deleteBook` + local library).
- Consent record: the parental gate adds one checkbox — "I am this child's
  parent/guardian and consent to sharing this recording" — written to
  `manifest.signature.voiceConsent[]` (+ `ownership`, `shareUrl` when known).
- Publish card: QR (`qrcode` dep, approved), `navigator.share` when available,
  "Made in m:ss" from a local start timestamp, `.storysync` download, delete-all.
- Fix all G5 bugs: capture page id at record start and lock navigation while
  recording; keyboard handler ignores events targeting `button, a, input, select,
  textarea, [role=switch], [role=radio]`; clear the auto-advance timer before TTS
  fallback; autosave note visible at all widths; memoize `approxBytes` on manifest
  and isolate the meter; omit `coverImage` when equal to page 1; `parseSeconds`
  honours `ms`; pass `audioCodec`/blob type so normalized narration passes through.
- Music: consume `@/lib/audio/moods` + `music.ts`; music-off deletes `page.music`.
- Sound design: soft synthesized cues for record start/stop and page change.
**Bar:** Playwright (localStorage fallback): publish → share code → `/read?story=`
loads it; re-publish leaves exactly one library entry; delete-all leaves zero;
consent recorded in the manifest when narration exists; Space on a focused
"Finish my story" activates it and does not toggle playback; recording started
on page 1 lands on page 1 after switching pages. tsc/lint clean.
`npm run build` green.

### WP-P · The Player becomes the room
Owner files: `src/components/player/**`.
- Ambient backdrop: the page illustration blurred/scaled behind the composition
  with a vignette, so there is never dead black around the art at any viewport;
  slow, subtle Ken-Burns drift on the backdrop (reduced-motion: static).
- "full" layout: real legibility — gradient scrim sized to the text block, text
  never over busy art without it.
- Read-along for **recorded** narration: estimate word timings linearly across the
  clip duration (`audio.duration`), highlight the current word; TTS keeps
  `onboundary`. Highlight style = amber current word, warm past words.
- Page-turn cue (synthesized page/tape sound, ≤ 300 ms, `pageTurnSound` honoured).
- Story text: Fraunces/Literata-class serif via the font variables, sized to the
  viewport (clamp), max ~62ch measure.
- Music via the shared moods module; honour music-off (no `page.music` → silence);
  crossfade moods across pages.
- End card: TapeLabel of the story + replay + "☆ Make your own" + QR of the
  current share URL (when `?story=` present).
**Bar:** Playwright screenshots at 1440×900 and 390×844 during playback where a
pixel sample at (x=40,y=450) and (x=1400,y=450) is not pure black (backdrop
present); the end card renders after the last page (test can force `?page=last`
or navigate with ArrowRight); `page.music` absent → engine music not started
(expose `data-music="off"` on the player root for the test). tsc/lint clean.

### WP-L · Landing "insert the tape" + the protocol page
Owner files: `src/components/landing/**`, `src/app/protocol/page.tsx` (new),
`src/components/protocol/**` (new).
- Hero "Press play": the cassette animates into a deck (≤ 900 ms, reduced-motion:
  instant) then routes to `/read?demo=1`, which the Read Room must open directly
  on the demo cover gate (coordinate: WP-P owner adds `demo=1` handling — the
  landing owner only navigates).
- `/protocol`: the SSYNC page — seven-layer packet diagram (inline SVG), the
  codec rule, the container layout, links to `v1`/`v2` schema, `docs/format-spec.md`
  (GitHub), and a "download the demo as .storysync" button that packs the demo
  in-browser via `buildStorysyncFromStory`. Register-A page with Register-B
  artifact examples.
**Bar:** Playwright: clicking "Press play" ends on `/read` with the demo cover
gate visible within 3 s; `/protocol` renders the seven layer names and the
download button produces a `.storysync` download event. tsc/lint clean.

## 4. Gauntlet protocol

- **Builders**: Opus 5, one per WP, disjoint file ownership, must run
  `npx tsc --noEmit` and `npx eslint <owned paths>` before reporting.
- **Blind critics**: Opus 5, one per WP round. They never trust the builder's
  report. They read the diff, run tsc/lint and the WP's Playwright tests, take
  screenshots where the bar is visual, and score with band caps: a UI claim
  without runtime evidence caps at band 4; an unverified claim caps the whole
  verdict at 3; a falsified claim is a fail. **Pass = band ≥ 4 on every bar
  item with evidence.**
- **Loopback**: a failed round returns the critic's blockers to the same builder;
  **round cap 2 per WP** (enforced by the workflow). A WP still failing after
  round 2 is reported honestly as unfinished with the critic's evidence — never
  laundered into a pass.
- **Integrator (Fable 5.1)**: after all WPs, runs the full gates — tsc, lint
  (no new errors vs. baseline), `npm run build`, full Playwright suite (both
  projects), visual audit at 1440/390 — fixes anything below excellent, appends
  decisions to `agent_docs/decisions.md`, commits, **pushes immediately**.

## 5. Out of scope for this loop (recorded, not forgotten)

Supabase RLS policy for share-by-code without `is_public` (needs a migration
applied to production — decide with Jon); Tauri wrap; licensed music library;
ElevenLabs voices; PDF import; remix marketplace; embeddable player package.
