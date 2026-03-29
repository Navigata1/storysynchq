# StorySyncHQ — Agent Briefing Document

## 1. Architecture Overview
StorySyncHQ is TWO things:
1. **The SSYNC Protocol** — An open JSON-based standard for immersive storybooks (like PDF for documents, SSYNC for storybooks)
2. **The Web App** — A reader + creator that implements the protocol

### Stack
- **Framework:** Next.js 15 + React 19 + TypeScript
- **Styling:** Tailwind CSS 4
- **Fonts:** Geist (UI), Georgia/Literata (story text)
- **TTS:** Web Speech API (browser-native, no API key needed)
- **Audio:** Web Audio API for background music
- **Animations:** CSS animations + transitions (no external libs)
- **Deployment:** Vercel (auto-deploy from GitHub main branch)
- **URL:** storysynchq.vercel.app

### Project Structure
```
src/app/
  page.tsx          — Landing page + reader (main entry)
  layout.tsx        — Root layout (fonts, metadata)
  globals.css       — Global styles
public/
  protocol/
    v1.schema.json  — SSYNC protocol JSON schema
  demo/
    brave-little-star.ssync.json  — Demo storybook data
    images/
      page[1-7].jpg — AI-generated watercolor illustrations
```

## 2. Design & Style Guidelines
- **Background:** Deep navy #0a0e1a
- **Surface:** Glassmorphic cards (backdrop-blur-xl, bg-white/5, border-white/10)
- **Primary accent:** Warm gold #F59E0B
- **Secondary accent:** Soft violet #7C6BFF
- **Text:** White for headings, gray-300 for body, gray-500 for muted
- **UI Font:** Geist Sans (system)
- **Story Font:** Georgia or serif for immersive reading
- **Animations:** Smooth, cinematic — ease-out transitions, 300-600ms durations
- **Principle:** "The Creative Control Center" — stable, connected, pro-grade

## 3. Git Etiquette
- Branch naming: `feat/description`, `fix/description`
- Commit messages: `feat:`, `fix:`, `style:`, `docs:`, `refactor:`
- Remote: origin → github.com/Navigata1/storysynchq.git
- Auto-deploy: push to main → Vercel deploys

## 4. Testing Approach
- **Visual verification:** Run `npm run dev`, open in browser, check rendering
- **Build verification:** `npm run build` must pass without errors
- **Mobile test:** Check responsive at 375px (iPhone SE) and 768px (iPad)
- **Reader test:** Load demo storybook, verify page turns, TTS narration, navigation
- **Accessibility:** Keyboard navigation (arrows, space, escape)

## 5. Key Conventions
- Single-file approach for MVP (keep page.tsx as the main file)
- Extract components only when they exceed ~200 lines
- Use Tailwind utility classes, not custom CSS (except for complex animations)
- All demo content in /public — no hardcoded story data in components
- SSYNC protocol is the source of truth — the renderer reads the format, period

## 6. Known Constraints
- No external audio files yet — use Web Speech API for TTS narration
- Music tracks are "generated" prompts for now — actual audio integration is Phase 2
- Images are AI-generated JPGs — not optimized yet (no next/image optimization)
- No auth/accounts — read-only experience for MVP

## 7. RPIT Loop (Research → Plan → Implement → Test)
For every feature:
1. **Research:** Check if existing code handles it, look at relevant files
2. **Plan:** Describe approach before writing code
3. **Implement:** Write the code
4. **Test:** Verify it works (`npm run build`, visual check)

## 8. Reference Documents
- PRD: ~/clawd/projects/storysynchq/STORYSYNC-PRD.md
- Vision: ~/clawd/projects/storysynchq/storysync_project_instructions.md
- Protocol: public/protocol/v1.schema.json
- Design Research: ~/clawd/context/design-research/storysynchq-design-research.md
