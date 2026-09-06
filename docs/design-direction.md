# StorySyncHQ — Design Direction: The Digital Studio

> The build brief for the ground-up experience redesign (August 2026).
> Every UI agent reads this in full before writing a line.

## 1. What we are making — in one paragraph

A place that feels like sitting in a small, warm recording studio with a storybook
open on the monitor. The **Stage** — a viewport window like the preview monitor in
Sony Vegas or After Effects — shows the story exactly as a listener will receive
it. Around the Stage sits the tooling: a filmstrip of pages, a big red record
button, gentle music controls. A 4-year-old sees three friendly tools and a huge
play button; an engineer flips **Advanced** and gets timing curves, gain meters,
codec readouts, and the raw manifest. Both are the same room. The product is the
*feeling*: cassette-book magic — hear the voice, read along, watch the pages turn
— and the power to *make* that feeling and hand it to someone else as one file or
one link. That loop (receive ↔ create) IS the SSYNC protocol's reason to exist.

## 2. The two-register design language

The interface fuses two aesthetics, used with discipline:

### Register A — "Studio chrome" (the room)
The application shell: dark, calm, professional, glassy.
- Background `#0a0e1a` (deep navy) → panels `bg-white/5, border-white/10, backdrop-blur-xl`
- Accents: warm gold `#F59E0B` (primary action, active state), soft violet `#7C6BFF` (secondary)
- UI type: Geist (already loaded). Meta/readouts: monospace (`font-mono`)
- The chrome NEVER competes with the Stage. It recedes; the story glows.

### Register B — "Tape stock" (the artifacts)
The content objects that live inside the chrome: story covers, cassette labels,
the share card, the published tape. Warm, analog, printed.
- Paper `#FFFDF6`, ink `#1E1A16`, label-yellow `#FFC93C`, tape-red `#E3452F`, shell `#3B3733`
- Artifact type: **Fraunces** (Google Fonts, serif, 700/900) for tape titles;
  IBM Plex Mono / mono for label meta ("SIDE A · 8 PAGES · 4:32")
- Signature shapes: the cassette label card (3px ink border, yellow field, red
  stripe), spinning tape reels (circle + dashed inner circle), rounded story pages
- A story in a library is a *cassette on a shelf*. A published story is a
  *labeled tape*. Deleting is *pulling the tape out*.

The fusion rule: **chrome is Register A; anything that represents a story is
Register B.** The contrast between cool room and warm tape is the brand.

## 3. Motion principles

- Tape-transport metaphors: reels spin while audio plays; record pulses the red
  dot; page turns feel like a gentle physical page, not a slide deck.
- Audio-coupled motion: ducking, fades and meters move with real gain ramps from
  the engine (`DualBusAudioEngine`) — motion mirrors sound (ease-out, 300–600ms).
- Scroll-driven narrative on the landing only. In the studio, motion responds to
  *action*, never plays on a loop (except spinning reels during playback).
- `prefers-reduced-motion`: every non-essential animation gates off it. Always.
- Nothing blocks input. Animations are interruptible.

## 4. Information architecture (routes)

```
/            Landing — the immersive cassette-memory story, then two doors:
             ▶ PLAY A STORY (receive)   ● MAKE A STORY (create)
/read        The receiving room. Loads a story from ?story=<shareCode> (cloud),
             an uploaded .storysync file, or the built-in demo. Full-bleed
             Player with "Tap to Begin". Final page → "Make your own" loop.
/studio      The digital studio (create). Stage + tools, Simple/Advanced modes.
/classic     The previous single-page app, preserved unchanged as fallback.
```

## 5. The Studio — layout contract

```
┌────────────────────────────────────────────────────────────┐
│ Top bar: ⏏ exit · story title (editable) · mode toggle     │
│          [Simple ◉──○ Advanced] · ● FINISH MY STORY        │
├──────────┬──────────────────────────────────┬──────────────┤
│ Tool     │                                  │ Inspector    │
│ rail     │            THE STAGE             │ (Advanced    │
│ (left)   │   live preview of current page   │  only)       │
│          │   exactly as the player renders  │ · timing     │
│ 📷 Photo │   it — image, text, playback     │ · music mood │
│ 🎙 Voice │                                  │ · gain meter │
│ ♪ Music  │                                  │ · manifest   │
│ ✨ Magic │                                  │   & codec    │
├──────────┴──────────────────────────────────┴──────────────┤
│ FILMSTRIP: page thumbnails as a horizontal tape/timeline   │
│ [1][2][3][4][+]   ◀ ▶ reorder · 🎙 badge = narrated        │
├────────────────────────────────────────────────────────────┤
│ TRANSPORT: ⏮ ● REC ▶ PLAY ⏭ · reels spin while playing     │
└────────────────────────────────────────────────────────────┘
```

- **Simple mode (default)**: tool rail + stage + filmstrip + transport only.
  Huge tap targets. A child flows: tap 📷 → camera opens → photo lands on stage →
  tap ● REC → talk → tap ▶ to hear it. Repeat per page.
- **Advanced mode**: inspector panel slides in (timing autoPause, music mood per
  story, narration/music volume, live gain meter fed by the engine, manifest JSON
  view with the codec rule surfaced, per-page details).
- Mobile (<768px): rail collapses to a bottom toolbar, inspector becomes a sheet.
  The Stage always wins the space fight.
- "● FINISH MY STORY" → parental gate → normalize audio to AAC (existing
  `normalizeNarration`) → save + share link + .storysync download. Publishing UI
  shows the tape being "printed": a Register-B cassette-label share card.

## 6. The Player (receive) — contract

- Cover gate: Register-B tape label (title, author, duration) with **Tap to
  Begin** — the tap unlocks the audio engine (iOS rule, non-negotiable).
- Then: full-bleed page, image above, story text in serif below, word highlight
  when TTS narrates; recorded narration plays through the narration bus with the
  music bed ducking −12 dB beneath it.
- Auto-advance after narration + `timing.autoPause`; swipe/arrow/tap-zone nav
  always works and re-syncs audio; optional page-turn cue.
- Accessibility panel: reading speed, timing multiplier, dyslexia font, high
  contrast, font size. Keyboard: ←/→/space/escape/p.
- Final page: gentle end card — "☆ Make your own story" → /studio, plus replay.

## 7. Engine reuse — the redesign is a new body on the proven engine

Do NOT rewrite these. Import and drive them:

| Capability | Module |
|---|---|
| Manifest types + validation | `@/lib/storysync/manifest` (`SsyncManifest`, `SsyncPage`) |
| Pack/unpack `.storysync` | `@/lib/storysync/container` |
| Mic recording (Safari-safe) | `@/lib/audio/recorder` (`NarrationRecorder`) |
| Publish AAC normalization | `@/lib/audio/transcode` (`normalizeNarration`) |
| Dual-bus playback + ducking + unlock | `@/lib/audio/engine` (`DualBusAudioEngine`) |
| Image downscale/EXIF | `@/lib/images` (`processImageSafe`) |
| Story/illustration generation | `@/lib/story-engine`, `src/app/page-improvements` (`generateIllustration`) |
| Cloud saves + share codes | `@/lib/cloud-storage` (Supabase w/ localStorage fallback) |

The protocol manifest is the single source of truth: the Stage renders from the
same `SsyncManifest` the Player consumes. If the Stage and Player ever disagree,
that is a bug in the protocol contract, not a styling choice.

## 8. Constraints

- Next.js 16 App Router, React 19, TS strict, Tailwind 4 utilities (custom CSS
  allowed only for complex animation, in a component-scoped .css file).
- All new UI is client components (`"use client"`) and must be SSR-safe (no
  window access during render).
- Zero new runtime dependencies without explicit approval. Fonts via
  `next/font/google` (Fraunces, IBM Plex Mono) — no external requests elsewhere.
- COPPA posture everywhere: parental gate before anything leaves the device,
  one-tap full deletion, zero trackers. See PRIVACY.md.
- Everything must work with no server (Tauri wrap later): no server actions, no
  API routes for core flows.
- `npm run build` green, `npm run lint` no new errors, Playwright suite green.

## 9. Vision addendum (from the recovered Protocol Vision review, Aug 25 2026)

The recovered vision document sharpens four things — these override any conflicting
instinct elsewhere in this file:

1. **The wedge**: "Make any storybook read itself in the voice and mood you
   choose." The moat is NOT one-shot AI story generation (commoditized) — it is
   post-creation ownership: parent voice, page timing, remixable moods,
   accessibility presets, a portable package that survives outside the app.
   The demo moment to build toward: *"Google cannot read this in your voice."*
2. **Do not lead with Studio Mode.** "PowerPoint-level control is a later moat.
   The near-term magic is a beautiful read/record/share loop." Simple mode is
   the product; Advanced mode is depth for later, present but never the pitch.
   The Family Voice Storybook journey is priority one; schools second;
   remix marketplace later.
3. **Naming**: "SSYNC Protocol" for the format; "StorySync Reader" and
   "StorySync Creator" for the product surfaces.
4. **The seven-layer packet model** (protocol anatomy, use this language when
   the UI explains the format): Metadata / Visual / Text / Voice / Sound /
   Behavior / Signature. The Signature layer (share URL, QR, ownership, remix
   ancestry, consent records, offline bundle) is v2.1 protocol work — consent
   and rights metadata are sacred, especially for voice.
5. **The ten-minute test (kill criteria)**: a user must create and share a
   satisfying 5-page narrated story in under 10 minutes, or nothing else matters.

## 10. Composition doctrine (Adaptive Design Intelligence)

Applied from the IDC design-intelligence method — these are hard rules for every
surface:

- **Exactly one signature moment** across the whole experience: the landing's
  cassette press-play. Nothing else may compete with it in spectacle.
- **One scroll owner per viewport**: at any scroll position, exactly one element
  owns motion. No two sections animating simultaneously in view.
- **Shared grammars**: one easing family everywhere (ease-out, tape-transport
  physics — motion decays like a reel spinning down, never bounces); one grid;
  one material language per register (glass for chrome, print for tape); one
  light direction.
- **Recovery stillness**: after any animated moment, the next viewport is calm.
  Never chain two spectacle sections.
- **Chapter seams**: sections transition with a deliberate seam (the tape-stripe
  divider), not by drifting into each other.
- **Temporal completeness**: every animation defines trigger, duration, easing,
  reversibility, and its reduced-motion state. "None" is a valid state; unknown
  is not.
- **Mechanisms transfer, trade dress does not**: borrow interaction mechanics
  from the best immersive sites, never their branded compositions or assets.
- **Budgets**: landing ≤ 200KB JS beyond the framework, no video assets in v1,
  CSS/SVG animation over canvas where possible, 60fps or the effect is cut.

## 11. The feeling test (from CLAUDE.md §9)

Before shipping any screen, ask: *does this get us closer to the kid at the
library table with the cassette deck — undivided, focused, magical attention on
a story?* If a feature, effect, or panel pulls attention away from the story, it
belongs behind Advanced mode or nowhere.
