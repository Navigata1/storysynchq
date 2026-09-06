# StorySyncHQ — Agent Briefing Document (v2)

> Recreating the magic of library cassette-tape books for the digital age.
> Still images + synchronized narration + background music + timing controls. NOT video.

## 1. Architecture Overview
StorySyncHQ is TWO things:
1. **The SSYNC Protocol** — An open standard for immersive storybooks (like PDF for documents, SSYNC for storybooks). v1 is a bare JSON document; v2 adds the `.storysync` container (ZIP with bundled assets) and the published-audio codec rule.
2. **The Web App** — A reader + creator that implements the protocol.

**North star for the POC**: the Child Journey. A 4-year-old (with parent help) captures photos of drawings, records their voice per page, gets auto-added gentle music, and shares a link grandparents can open in any browser.

### Stack
- **Framework:** Next.js 16 + React 19 + TypeScript
- **Styling:** Tailwind CSS 4
- **Fonts:** Geist (UI), Georgia/Literata (story text)
- **TTS:** Web Speech API (browser-native, no API key needed)
- **Audio:** Web Audio API — dual-bus engine (narration + ducked music bed), `src/lib/audio/`
- **Container:** `.storysync` = ZIP via **fflate** (`src/lib/storysync/`)
- **Publish audio:** AAC/M4A normalization via WebCodecs + mp4-muxer (WAV fallback)
- **Storage/Auth:** Supabase (localStorage fallback), `src/lib/supabase.ts` + `src/lib/cloud-storage.ts`
- **Animations:** CSS animations + transitions (no external libs)
- **Deployment:** Vercel (auto-deploy from GitHub main branch)
- **URL:** storysynchq.vercel.app

### Project Structure
```
CLAUDE.md               — this file
ARCHITECTURE_REVIEW.md  — July 2026 stack audit — read before questioning any decision
PLAN_OF_ATTACK.md       — POC plan, tape-by-tape, with mapping onto this repo
PRIVACY.md              — COPPA posture (children's voice data)
agent_docs/decisions.md — append-only decision log
docs/format-spec.md     — full .storysync v2 specification (+ v2.1 Signature layer draft)
docs/design-direction.md— two-register design language (studio chrome / tape stock)
docs/10x-plan.md        — Fable 5.1 reassessment: gaps, falsifiable bars, gauntlet protocol
src/app/                — thin routes; each page renders one component tree
  page.tsx          — `/`         Landing (cassette-into-deck hero, the two doors)
  read/page.tsx     — `/read`     ReadRoom + Player (share code · .storysync file · demo tape)
  studio/page.tsx   — `/studio`   The Digital Studio (create → record → publish)
  protocol/page.tsx — `/protocol` The SSYNC protocol page (packet diagram, codec rule, schemas)
  classic/page.tsx  — `/classic`  The previous single-file app, preserved as-is
  layout.tsx        — Root layout (Geist + Fraunces + IBM Plex Mono, metadata)
  globals.css       — Global styles + design tokens
src/components/
  studio-kit/       — shared studio-chrome primitives (Reel, TapeLabel, GlassPanel, Transport…)
  landing/          — Landing + deck insert animation
  player/           — Player (dual-bus, read-along, page-turn cue), ReadRoom, timing presets
  studio/           — Stage, ToolRail, Filmstrip, Transport, Inspector, ParentGate, PublishCard, draft autosave
  protocol/         — ProtocolPage, PacketDiagram, DownloadDemo
src/lib/
  audio/            — recorder (Safari-safe mime), transcode (AAC at publish), engine (dual-bus),
                      moods (canonical 8-mood vocabulary), music (generative bed)
  storysync/        — manifest types/validation, fflate pack/unpack
  images.ts         — EXIF-safe downscale/compress pipeline
  story-engine.ts   — story generation
  supabase.ts / cloud-storage.ts
public/
  protocol/
    v1.schema.json  — SSYNC v1 JSON schema (bare document)
    v2.schema.json  — SSYNC v2 schema (.storysync container manifest + codec rule + signature)
  demo/             — demo storybook data + images
tests/              — Playwright: legacy suites (/classic), builder gates (wp-*), blind-critic
                      gates (critic-*), fable-pass, storysync-roundtrip (Node-side)
```

## 2. Locked architecture decisions (v2 — see ARCHITECTURE_REVIEW.md for rationale)

| Decision | Resolution |
|---|---|
| File format | `.storysync` = ZIP (via **fflate**) containing `manifest.json` + `assets/` |
| Published narration codec | **Always AAC/M4A** — normalize at publish (Safari records AAC/MP4, Chrome records Opus/WebM; without normalization cross-device playback breaks). WAV is the only permitted fallback when AAC encoding is unavailable; Opus/WebM is NEVER valid in a published story. Raw codecs allowed in editor drafts only |
| Recorder | MediaRecorder with negotiated mime (never hardcode a codec — Safari throws on `audio/webm`) |
| Audio engine | Raw Web Audio API: narration bus + music bed bus with gain ducking (~-12 dB under narration); iOS unlock via user-gesture `resume()` (no Howler) |
| Image input | Native `<input type="file" accept="image/*" capture="environment">` primary (camera-first, child mode); all uploads pass through resize ≤2048px + compress |
| Voice synthesis | Web Speech API now; ElevenLabs Phase 3 |
| Distribution | Playback stays web forever (share link, zero install). Editor stays server-assumption-free so a Tauri 2 wrap is a Phase 3 packaging exercise |
| Storage | Supabase (already wired) with localStorage fallback; R2/Worker URLs revisit in Phase 3 |
| Privacy | **COPPA-first**: parental gate before publish/share, one-tap full-story deletion, no trackers/analytics in player, unguessable unlisted share codes — see PRIVACY.md |

## 3. Key technical constraints
- iOS Safari blocks audio without user interaction → reader splash is "Tap to Begin," then `audioContext.resume()`.
- MediaRecorder output differs per browser → the AAC/M4A normalization rule above is load-bearing. Never hardcode a recording mime type.
- localStorage quota (~5 MB) → images MUST be compressed before storing as data URLs.
- No external audio files yet — music beds are Web Audio-generated; licensed track library is Phase 3.
- Images are not run through next/image optimization yet.

## 4. Design & Style Guidelines
- **Background:** Deep navy #0a0e1a
- **Surface:** Glassmorphic cards (backdrop-blur-xl, bg-white/5, border-white/10)
- **Primary accent:** Warm gold #F59E0B · **Secondary accent:** Soft violet #7C6BFF
- **Text:** White headings, gray-300 body, gray-500 muted
- **Story Font:** Georgia or serif for immersive reading
- **Animations:** Smooth, cinematic — ease-out, 300–600ms
- **Principle:** "The Creative Control Center" — stable, connected, pro-grade

## 5. Git Etiquette
- Branch naming: `feat/description`, `fix/description`
- Commit messages: `feat:`, `fix:`, `style:`, `docs:`, `refactor:`
- Remote: origin → github.com/Navigata1/storysynchq.git
- Auto-deploy: push to main → Vercel deploys

## 6. Testing Approach
- **Build verification:** `npm run build` must pass without errors
- **Round-trip:** pack → `.storysync` → unpack → identical manifest + assets (`tests/storysync-roundtrip.spec.ts`)
- **E2E gates:** `npx playwright test` (desktop 1280×720 + mobile 375×812) — legacy, `wp-*` builder, `critic-*` blind-critic and `fable-pass` suites must all pass before merge
- **Visual verification:** `npm run dev`, check rendering; mobile at 375px and 768px
- **Reader test:** Load demo storybook, verify page turns, TTS narration, navigation
- **Cross-device audio:** stories recorded on Chrome/Android must play on iOS Safari and vice versa
- **Accessibility:** Keyboard navigation (arrows, space, escape)

## 7. Key Conventions
- Routes are thin (`src/app/*/page.tsx` renders one component tree from `src/components/`); shared logic lives in `src/lib/`. `/classic` keeps the old single-file shell untouched
- Use Tailwind utility classes, not custom CSS (except complex animations)
- All demo content in /public — no hardcoded story data in components
- SSYNC protocol is the source of truth — the renderer reads the format, period
- TypeScript strict everywhere; manifest validation lives in `src/lib/storysync/manifest.ts`
- Accessibility is a first-class requirement (WCAG, timing presets), not polish
- Children's data handled under the COPPA posture — no exceptions, no trackers
- Voice cloning ALWAYS requires explicit documented consent flows (Phase 3)
- Never embed copyrighted content in fixtures — original sample stories only
- Mid-session architecture decisions append to `agent_docs/decisions.md`

## 8. RPIT Loop (Research → Plan → Implement → Test)
For every feature:
1. **Research:** Check if existing code handles it, look at relevant files
2. **Plan:** Describe approach before writing code
3. **Implement:** Write the code
4. **Test:** Verify it works (`npm run build`, visual check)

## 9. Emotional core — never lose this
This project exists because of the memory of being a kid at the library with a book and a cassette: the narrator, the "turn the page" chime, the melody behind the story. Every technical decision serves undivided, focused, magical attention on a story. When in doubt, ask: "does this get us closer to that feeling?"
