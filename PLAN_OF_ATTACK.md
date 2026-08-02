# StorySync POC — Plan of Attack (v2)

> **Mission**: In 5 weeks, prove the Child Journey end-to-end — a 4-year-old's drawings + voice become a shareable, magical narrated storybook that plays in any browser.
>
> v2 incorporates the July 2026 architecture review: codec normalization, COPPA posture, camera-first capture, custom player, React 19/fflate hygiene.

---

## Implementation mapping — this repo

The tape plan below was written for a fresh Vite monorepo. StorySyncHQ already ships a working
Next.js app (reader + creator + library + Supabase), so the tapes map onto this repo instead of
a rebuild — same decisions, same exit criteria, existing code refactored rather than discarded:

| Plan concept | Where it lives here |
|---|---|
| `packages/core` (manifest, pack/unpack, codec rule) | `src/lib/storysync/` + `public/protocol/v2.schema.json` + `docs/format-spec.md` |
| `packages/editor` | `StoryCreator` in `src/app/page.tsx` |
| `packages/player` | `ImmersiveReader` in `src/app/page.tsx` + `src/lib/audio/` |
| Audio engine (dual-bus, ducking, iOS unlock) | `src/lib/audio/engine.ts` |
| Recorder + publish transcode | `src/lib/audio/recorder.ts`, `src/lib/audio/transcode.ts` |
| Vite + React 19 | Next.js 16 + React 19 (already deployed on Vercel — kept) |
| Cloudflare R2 storage | Supabase (already wired) — R2 revisit deferred to Phase 3 |
| Decision log | `agent_docs/decisions.md` |

---

## The one thing we're proving

A complete loop: **Capture images → Record voice per page → Auto-enhance + music → Publish (normalize audio) → Share link → Plays anywhere with tap-to-play.**

Everything not on that critical path is deferred. No professional mode, no PDF ingestion, no voice cloning, no exports in the POC.

---

## 5-Week Timeline

### Week 1 — Foundation (Tapes 0–1)
**Deliverable: repo scaffolded, `.storysync` format v0 locked in code**
- Monorepo bootstrap (React 19, Vite, TS strict, Vitest), CLAUDE.md wired, skills installed
- `packages/core`: manifest Zod schema, **fflate** pack/unpack, round-trip tests
- **Publish-codec rule encoded in the spec**: published narration is always AAC/M4A; transcode path decided (ffmpeg.wasm vs Worker) in Tape 1 IEQ
- ✅ Exit: `pack()` → `.storysync` → `unpack()` → identical manifest + assets

### Week 2 — Editor Shell + Image Capture (Tape 2) ← SPRINT 1
**Deliverable: a child/parent can create a page sequence from photos**
- Child-Mode-only editor: huge tap targets, camera-first via native `capture="environment"` input; react-dropzone drag path for desktop
- Client-side EXIF fix, resize ≤2048px, WebP/JPEG compress → R2 via presigned Worker URLs
- Drag-to-reorder page strip, delete, add; drafts survive refresh
- ✅ Exit: 8 photos → ordered, persisted page sequence, demonstrated at phone viewport

### Week 3 — Voice Recording (Tape 3)
**Deliverable: per-page narration recorded in the browser**
- MediaRecorder per page (record in the browser's native codec — normalization happens at publish)
- Big-red-button record/review/re-record loop, duration → manifest page timing
- Graceful mic-permission denial recovery
- ✅ Exit: 8-page story fully narrated in under 5 minutes of user time

### Week 4 — Player (Tapes 4–5)
**Deliverable: the magic moment — synchronized playback**
- **Custom lightweight pager** (reveal.js only if a <1-day bend, per review) consuming `.storysync`
- Raw Web Audio dual-bus: narration foreground + music bed ducked ~-12dB with gain ramps
- "Tap to Begin" cover gate (iOS unlock), narration-end + delay auto-advance, optional page-turn cue, manual nav re-syncs
- Default gentle music bed auto-applied (licensed library folder + licenses.md)
- AudioEnhancer interface + OfflineAudioContext normalization/high-pass pass
- ✅ Exit: hands-free start-to-finish playback on iOS Safari, Android Chrome, desktop

### Week 5 — Publish, Privacy, Validate (Tapes 6–7)
**Deliverable: grandparent test passes, lawfully**
- "Finish my story" publish: **transcode all narration to AAC/M4A**, pack, deploy story + player bundle to clean share URL
- **Parental gate before publish**, one-tap full-story deletion, zero trackers in player, unguessable unlisted URLs
- QR code on final page linking back to editor; native share sheet
- Local diagnostics ("export diagnostic bundle") instead of Sentry — telemetry deferred to opt-in at beta
- E2E Playwright run + real-kid test + size/perf audit
- ✅ Exit: all six POC success checks pass

---

## POC Success Checklist (v2)

1. [ ] A 4-year-old completes creation with only photo-taking help from a parent
2. [ ] Total creation time under 15 minutes for an 8-page story
3. [ ] Share link plays on iOS Safari, Android Chrome, desktop — no install, **including cross-device pairs (recorded on Android → played on iPhone and vice versa)**
4. [ ] Story file (8 pages, ~5 min audio) under **15 MB**
5. [ ] Parental gate + one-tap deletion work; player ships with zero third-party trackers
6. [ ] The playback moment feels like the cassette-book memory — the gut-check test

---

## Tape → Prompt Pack mapping

| Tape | Session | Focus |
|---|---|---|
| 0 | Bootstrap | Repo, React 19/Vite/TS, CLAUDE.md, skills |
| 1 | Format Core | Zod schema + fflate round-trip + codec rule |
| 2 | Editor + Capture | Sprint 1 — camera-first input, R2, ordering |
| 3 | Voice | Per-page MediaRecorder narration |
| 4 | Player | Custom pager + Web Audio dual-bus |
| 5 | Music + Enhance | Music bed, ducking, enhancement pass |
| 6 | Publish + Privacy | AAC normalization, parental gate, share, QR |
| 7 | E2E Validation | Cross-device matrix + checklist |

---

## Working agreement with Claude Code / Codex

- Start every session: read CLAUDE.md + ARCHITECTURE_REVIEW.md, issue an IEQ
- One session = one tape; `/clear` between tapes
- Mid-session decisions append to `agent_docs/decisions.md`
- Notion remains status source of truth; update sprint items as tapes complete

---

## Deferred (Phase 3 backlog — captured, not forgotten)

Tauri 2 editor wrap (desktop + iOS/Android; code-signing budget: Apple $99/yr + Windows cert) · PDF ingestion · Professional mode timeline editor · Voice cloning + consent flows · EPUB3/PowerPoint export · Multi-language narration · Accessibility preset library · School batch deployment · Focus Mode integration · Guided AI mode · Opt-in PII-scrubbed crash reporting
