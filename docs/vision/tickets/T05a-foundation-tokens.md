# T05a · Port the reference foundation tokens into the app; kit file-per-component layout
Milestone: M0 · Reference: all (brief `design_system` TOKENS and TYPE; `docs/vision/reference/foundation.css` `.ss-screen` custom properties) · Status in reel: Shipped (foundation)
Type: AFK (agent can finish alone)
Blocked by: —   ·   Blocks: T05b (and through it every ticket "Blocked by T05")
Split from T05 ("Port reference tokens + shared components into studio-kit (§6)"). T05a = tokens and type; T05b = align the existing pieces, add Cassette, and allocate the remaining §6 pieces to their first consumers.

## Why
The ten references were drawn with one vocabulary:
- **Register A** (the room): "navy #0a0e1a (-2 #0f1426, -3 #161d33, -4 #1f2742), glass rgba(255,255,255,.05) with 1px lines at .10/.16, text #fff / #cdd3e2 / #8d96ad / #5d6680, gold #F59E0B (+ #fbbf4a) … violet #7C6BFF (+ #a59bff) … ok #3fb68b".
- **Register B** (the tape): "paper #FFFDF6 (#f5eedc, #e9dfc6), ink #1E1A16 (#5a5148, #8b8073), label-yellow #FFC93C, tape-red #E3452F, shell #3B3733 (#2c2926)".
- The kraft, tape-brown and crayon-paper additions.
- The eight mood colours and the seven packet-layer fills.
- One easing family, `--ss-ease`.

Today the app repeats these as scattered literals (`#1e1a16` in `kit.css`, `TAPE`/`STUDIO` in `kit.tsx`, `fill: "#EFE9DC"` in the protocol's `layers.ts`, Tailwind `amber-500` stand-ins). Ten surfaces built by different tickets will only read as one room if they draw from one source. HANDOFF §6 step 1: "Move the tokens … into `src/app/globals.css` / `kit.css` as CSS custom properties."

## Done when (acceptance, each testable)
- [ ] `:root` defines every token, with the reference names and values:
  - **Register A:** `--ss-navy`, `--ss-navy-2..4`, `--ss-line`, `--ss-line-2`, `--ss-glass`, `--ss-glass-2`, `--ss-fg`, `--ss-fg-2..4`, `--ss-gold`, `--ss-gold-2`, `--ss-violet`, `--ss-violet-2`, `--ss-ok`.
  - **Register B:** `--ss-paper`, `--ss-paper-2`, `--ss-paper-3`, `--ss-ink`, `--ss-ink-2`, `--ss-ink-3`, `--ss-label`, `--ss-red`, `--ss-shell`, `--ss-shell-2`.
  - **Local additions:**
    - `--ss-kraft: #DFD2B8`;
    - `--ss-tape-brown: linear-gradient(180deg, #5b3a24, #3d2616)`, with the solid stops `--ss-tape-brown-1: #5b3a24` and `--ss-tape-brown-2: #3d2616`;
    - `--ss-crayon-paper: #FBF7EC`;
    - `--ss-red-ink: #B4301F` (the Signature tag ink).
    - the cassette and print-slot tones the foundation uses as literals: `--ss-shell-hi: #4a443e`, `--ss-foot-1: #2e2a27`, `--ss-foot-2: #24211f`, `--ss-slot: #05070d`.
  - **Moods:** `--mood-wonder` … `--mood-melancholy`.
  - **Packet layers:** `--ss-layer-metadata: #EFE9DC`, `--ss-layer-visual: #E4E0FA`, `--ss-layer-text: #FBF3DF`, `--ss-layer-voice: #FADFDA`, `--ss-layer-sound: #FBEBD2`, `--ss-layer-behavior: #E6E9EE`, `--ss-layer-signature: #FFE9A8`.
  - **Motion:** `--ss-ease: cubic-bezier(0.22, 0.8, 0.24, 1)`.
  - **Type:**
    - `--ss-display: var(--font-fraunces), "Iowan Old Style", Georgia, serif`;
    - `--ss-ui: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif`;
    - `--ss-mono: var(--font-plex-mono), ui-monospace, Menlo, monospace`.
  - Values are exactly those in `docs/vision/reference/foundation.css` and brief `design_system`.
- [ ] Tailwind 4 `@theme inline` declares the tokens as theme variables: `--color-ss-*`, `--color-mood-*`, `--color-ss-layer-*`, `--ease-ss` and `--font-ss-display` / `--font-ss-ui` / `--font-ss-mono`. Utilities such as `bg-ss-navy`, `text-ss-ink`, `border-ss-ink`, `bg-mood-wonder` and `ease-ss` are therefore generated wherever later tickets use them.
- [ ] The kit's own transitions adopt the one easing family. Every `ease-out` in `kit.css` transitions becomes `var(--ss-ease)` (doctrine: "one easing family everywhere"). Durations are unchanged.
- [ ] A typed mirror `src/components/studio-kit/tokens.ts` exports:
  - `REGISTER_A`, `REGISTER_B` and `LOCAL` (hex strings);
  - `MOOD_COLOR: Record<MoodName, string>`, keyed by the shared `MoodName` from `@/lib/audio/moods`;
  - `LAYER_FILL: Record<"Metadata"|"Visual"|"Text"|"Voice"|"Sound"|"Behavior"|"Signature", string>`;
  - `SS_EASE`.
  - `kit.tsx`'s `TAPE` and `STUDIO` constants re-export from it (same keys and values).
  - `src/components/protocol/layers.ts` takes its seven `fill`s from `LAYER_FILL`, with no visual change.
- [ ] Tokens and mirror never drift. In a browser on `/`, `/read`, `/studio` and `/protocol`, `getComputedStyle(document.documentElement).getPropertyValue(name).trim().toLowerCase()` equals the mirror's value for every token.
- [ ] `kit.css` consumes tokens instead of literals for every colour that has a token: ink, paper, label, red, gold, violet, navy. Rendering is unchanged: the computed `border-top-color` of `[data-sk="tape"]` stays `rgb(30, 26, 22)`, and the computed `background-color` of `.sk-tape-stripe` stays `rgb(227, 69, 47)`.
- [ ] Fonts match the reference weights, still self-hosted by `next/font` with no new third-party request:
  - Fraunces loads as its variable font (`weight` omitted, so the 100–900 axis is available), with `style: ["normal", "italic"]`;
  - IBM Plex Mono loads 400, 500 and 600.
  - In a browser, `document.fonts.check('italic 800 20px "Fraunces"')`, or the next/font family name the variable resolves to, returns true after `document.fonts.ready`.
- [ ] Kit layout convention, documented in the `kit.tsx` header and one line in `CLAUDE.md` (Project Structure, `studio-kit/`):
  - existing primitives stay in `kit.tsx`/`kit.css`;
  - every new shared component lives in its own `src/components/studio-kit/<Name>.tsx` with a component-scoped `<name>.css` when it needs custom CSS;
  - consumers import it directly from that file.
- [ ] The landing's first-load JS for `/` does not grow by more than 1 KB. Tokens are CSS; the mirror is tree-shaken. Record the `next build` route table before and after in the ledger.
- [ ] `/classic` renders unchanged. The tokens are additive on `:root`, and `body`'s background in `globals.css` is not changed by this ticket.
- [ ] All four gates are green.

## Seams and files
- Seam: Playwright E2E reads computed custom properties and computed styles on the four routes (desktop + mobile).
- The mirror is imported by the test in Node and compared in the browser, which is the drift check.

## Tests (written first)
`tests/vision-tokens.spec.ts`:
1. For each route in `/`, `/read`, `/studio`, `/protocol`: every `REGISTER_A`, `REGISTER_B`, `LOCAL`, `MOOD_COLOR` (as `--mood-<lowercase name>`) and `LAYER_FILL` (as `--ss-layer-<lowercase name>`) value equals the computed `:root` custom property. `--ss-ease` equals `SS_EASE`.
2. The `MOOD_COLOR` keys deep-equal `MOOD_NAMES` from `src/lib/audio/moods.ts` (Node). The eight colours equal the brief's: Wonder #f5b544, Adventure #f28c38, Calm #5db4e8, Joy #f7d348, Hush #a98bf5, Rain #8c9bb0, Suspense #7b7fe8, Melancholy #e58fa6.
3. Theme wiring:
   - Node: `src/app/globals.css` contains an `@theme inline` block declaring `--color-ss-navy: var(--ss-navy)`, `--color-ss-ink: var(--ss-ink)`, `--color-mood-wonder: var(--mood-wonder)`, `--color-ss-layer-signature: var(--ss-layer-signature)` and `--ease-ss: var(--ss-ease)`.
   - E2E on `/studio`: the computed `transition-timing-function` of the first `[data-sk="big"]` (BigButton) includes `cubic-bezier(0.22, 0.8, 0.24, 1)`.
4. After `document.fonts.ready` on `/`, an italic 800 Fraunces face is available.
5. Unchanged rendering: `[data-sk="tape"]` border colour and stripe colour keep their values.

Red first: 1–4 fail because no tokens, mirror, theme block or easing exist; 5 passes before and after (a guard).

## Fidelity check
- Viewports 1080×675 (s01 laptop) and 390×844.
- State: `/` hero at rest, and `/read?demo=1` cover gate.
- Reference: there is no new visual. This ticket must not change pixels. Take the screenshots before and after, save the pair as `docs/vision/evidence/T05a-before.png` / `T05a-after.png`, and expect them identical except for the Fraunces italic author line, which T05b turns on.

## Files (ownership)
- `src/app/globals.css` (modify: `:root` tokens + `@theme inline` additions. T05a is the only M0–M5 ticket that edits `globals.css`; later tickets add component-scoped CSS instead)
- `src/app/layout.tsx` (modify: Fraunces variable + italic, Plex Mono 600)
- `src/components/studio-kit/tokens.ts` (new)
- `src/components/studio-kit/kit.tsx` (modify: header doc + `TAPE`/`STUDIO` from `tokens.ts`)
- `src/components/studio-kit/kit.css` (modify: literals → `var(--ss-*)`, no visual change)
- `src/components/protocol/layers.ts` (modify: `fill` values from `LAYER_FILL`)
- `CLAUDE.md` (one line under Project Structure `studio-kit/`; shared doc)
- `tests/vision-tokens.spec.ts` (new)
- `agent_docs/decisions.md` (append one entry; shared, append-only)

## Existing tests that may change
- None. The change is additive or value-preserving.
- Suites that read computed colours or fonts on the kit (`tests/critic-player.spec.ts:488` checks the end card's `[data-sk="tape"]` visibility only; `tests/wp-landing.spec.ts` / `tests/critic-landing.spec.ts` read the hero's animation and transform) are unaffected.
- If the Fraunces variable font changes text metrics enough to move a layout assertion, the builder fixes the layout, not the test.
