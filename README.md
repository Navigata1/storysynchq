# StorySyncHQ

> Recreating the magic of library cassette-tape books for the digital age.
> Still images + synchronized narration + a music bed + timing controls. Not video.

StorySyncHQ is two things:

1. **The SSYNC protocol** — an open format for immersive storybooks. v1 is a bare JSON
   document; v2 is the `.storysync` container (a ZIP with `manifest.json` + `assets/`)
   plus one load-bearing rule: published narration is always AAC/M4A, so a tape recorded
   on an Android phone plays on an iPhone and vice versa. Spec: [`docs/format-spec.md`](docs/format-spec.md).
   Schemas: [`public/protocol/`](public/protocol/).
2. **The web app** — a reader and a creator that implement the protocol, built for a
   four-year-old with a parent beside them, with an Advanced mode for everyone else.

Live: https://storysynchq.vercel.app

## The surfaces

| Route | What it is |
|---|---|
| `/` | Landing — the cassette-into-deck hero, then two doors: play a story or make one |
| `/read` | The reader — open a share code, a `.storysync` file, or the demo tape; "Tap to Begin" unlocks audio on iOS |
| `/studio` | The Digital Studio — photograph drawings, record a voice per page, pick a mood, publish behind a parental gate |
| `/protocol` | The SSYNC page — packet diagram, codec rule, container layout, downloadable demo container |
| `/classic` | The previous single-file app, preserved |

## Stack

Next.js 16 · React 19 · TypeScript (strict) · Tailwind 4 · Web Audio (dual-bus engine with a
generative music bed) · MediaRecorder with negotiated mime · WebCodecs + mp4-muxer for AAC at
publish (WAV fallback) · fflate for the container · Supabase with a localStorage fallback ·
Playwright. No trackers, no analytics, anywhere — see [`PRIVACY.md`](PRIVACY.md).

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # must pass before merge
npm run lint
npx playwright test   # desktop + mobile projects; starts the dev server itself
```

The Playwright suite is the merge gate: legacy suites for `/classic`, builder gates
(`tests/wp-*.spec.ts`), blind-critic gates (`tests/critic-*.spec.ts`), the Fable pass, and a
Node-side pack → unpack round-trip for the container.

## Read before changing things

- [`CLAUDE.md`](CLAUDE.md) — the agent briefing: architecture, locked decisions, conventions
- [`ARCHITECTURE_REVIEW.md`](ARCHITECTURE_REVIEW.md) — why each stack decision was made
- [`docs/design-direction.md`](docs/design-direction.md) — the two-register design language
- [`docs/10x-plan.md`](docs/10x-plan.md) — the reassessment, gaps, and falsifiable bars
- [`agent_docs/decisions.md`](agent_docs/decisions.md) — append-only decision log
- [`PRIVACY.md`](PRIVACY.md) — the COPPA posture (a child's voice is personal information)

## Why

A kid at the library with a book and a cassette: the narrator, the page-turn chime, the
melody behind the story. Every decision here serves that kind of undivided attention.
