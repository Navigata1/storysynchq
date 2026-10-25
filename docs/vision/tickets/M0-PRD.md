# M0 · Truth and foundations — PRD

Milestone: M0 · Tickets: T00, T01, T02, T03, T04a, T04b, T05a, T05b
Reference screens served: s01 (landing teaser), s04 (grown-up gate, consent), s05 (cover "VOICE: MIA", deck chip narrator, private link), s06 (consent wording carried in the file), and every screen through the shared design foundation (T05a/T05b).
Contract: `docs/vision/HANDOFF.md` §3 "Known truths", §5, §6, §9 M0. Where this PRD and `CLAUDE.md` / `PRIVACY.md` / `docs/format-spec.md` disagree, those win.

---

## Problem Statement

The Vision Reel shows a product that never says anything false, and today's app says four false things before a single new feature is built:

- A visitor scrolling the landing reads that the house tape "The Brave Little Star" runs **4:32** and carries **AAC/M4A** narration. It has no recorded voice at all. It is read by the browser voice and runs about **1:47**.
- A parent who reads `PRIVACY.md` is promised a **128-bit**, unguessable share code. When signed in, the cloud mints **64-bit** codes (16 hex). (A wider issue is found while confirming this. The cloud's read policies let anyone holding the public key list every shared link. See Open Questions.)
- Grandma opening Mia's tape should see **"VOICE: MIA"** on the cover and Mia's name in the deck chip. The Creator never writes `metadata.narrator`, so no listener ever sees whose voice it is.
- The consent that "travels inside the tape" is written as **one** record named after "story by", dated with a full **timestamp**. The v2.1 draft calls for a calendar **date**, and the reel calls for one record **per recorded voice**. No validator flags the drift.

Every later milestone also needs two foundations that do not exist yet:

- One shared design vocabulary. The reference foundation tokens and the shared tape-stock pieces must live in the app, so ten surfaces built by separate tickets look like one product.
- One shared, honest test cast. Mia's five-page tape and Grandma's one-page reply are needed as fixtures, so every test can drive the real app into the reference states. None of that content may enter the product.

## Solution

Fix the four truths at their source, then lay the two foundations:

1. **Derived tape labels.** The landing teaser prints a label computed from the demo manifest: runtime is words ÷ 2.5 + the autoPause sum, and the label reads READ-ALONG when no page carries `audioUrl`. The result is `SIDE A · 8 PAGES · ~1:47 · READ-ALONG`. The title and author come from the manifest too, never from component literals (T01).
2. **128-bit codes everywhere.** One minting function makes 16 random bytes (32 hex) for both the device library and the cloud. The cloud insert passes an explicit code, so no database change is needed for new links. An optional migration moves the database default to 16 bytes, and Jon applies it. Old 16-hex codes keep resolving, and `PRIVACY.md` stays true (T02).
3. **Narrator.** At publish, a tape that carries a recorded voice gets `metadata.narrator`, derived from "story by" ("Mia, age 4 — with Mom" → "Mia"). The cover already prints `VOICE: <narrator>`. The Player's deck chip gains a mic glyph and the narrator's name (T03).
4. **Consent in the protocol first, then in the Creator.**
   - The validator learns WARN lines. A timestamp date reads exactly "signature.voiceConsent[0].date is a full timestamp; the v2.1 draft asks for a date". The schema and the spec are updated (T04a).
   - The Creator writes one record per distinct recorded voice, dated `YYYY-MM-DD` (local calendar date), granted by "parent/guardian". The gate asks for consent once per voice: exactly the reference row when there is one voice, one row per voice when there are more (T04b).
5. **Foundation tokens.**
   - Every reference token moves into the app as CSS custom properties: navy scale, glass, fg scale, gold/violet/ok, paper/ink/label/red/shell, kraft and tape-brown, eight mood colours, seven packet-layer fills, type and `--ss-ease`. Tailwind utilities are generated from them.
   - A TypeScript mirror holds the values, and a test proves the two never drift.
   - The kit adopts a one-file-per-component layout, so later tickets add components without editing each other's files (T05a).
6. **Shared pieces.**
   - TapeLabel and Reel are aligned to the reference look, and a new Cassette is adopted by the landing hero. These have consumers today, so they are tested on those pages (T05b).
   - Every other §6 piece (DeckChip, LayerChips, MoodTapeChip, VoiceCassette, JCard, PacketBands, PacketExploded, Shelf and ShelfTape, ConsentStamp, SizeMeter, TapeRibbon, ListeningRing, PrintSlot and the pull-the-tape icon, StatusChip, the TapeLabel picture inset) is allocated, in T05b's table, to the first ticket that renders it on a real page. Each entry gives the exact kit file name and the brief spec it must follow.
   - That consumer builds the component inside the kit and tests it through its page. This keeps HANDOFF §9's "test each component through the pages that use it" and TDD's tests-first both true.
7. **Fixtures.**
   - "Twinkle Came to My Window": five pages, Mia's crayon drawings rasterized from the reference SVG, generated WAV clips of 5.1/4.4/6.4/3.8/4.3 s, mood Wonder, autoPause 2 s, story by "Mia, age 4 — with Mom".
   - "Goodnight, Mia": one page, Grandma's window photo, a 7.6 s clip.
   - Both are packed as `.storysync` files by the repo's own container code and live under `tests/fixtures/`.
   - Helpers open a tape in the Read Room, seed a Studio draft and seed the device library.
   - A guard test fails if any cast string ever appears under `src/` or `public/` (T00).

## User Stories

1. As a parent visiting the landing, I want the house tape's label to state its real length and that it is read along by the browser voice, so that I trust every other claim the page makes.
2. As a parent sharing a tape, I want the private link's code to be as unguessable as the privacy page promises, so that only the people I send it to can open my child's voice.
3. As a grandparent who opened a link made before this change, I want that old link to keep working, so that a tape I already have does not vanish.
4. As Jon, I want the database default change delivered as a migration file I apply myself, with nothing in the app depending on it, so that production changes stay in my hands.
5. As a grandparent opening a tape, I want the cover to say whose voice I am about to hear ("VOICE: MIA"), so that I know it is Mia before I tap.
6. As a listener, I want the narrator's name in the deck chip while the tape plays, so that the room keeps saying whose voice this is.
7. As a parent publishing a tape read by the browser voice, I want no narrator claimed, so that the tape never names a person who did not speak.
8. As a parent, I want the consent I give to be written into the tape once for each recorded voice, dated with the day I gave it, so that the file carries a precise record wherever it goes.
9. As a parent finishing a tape with two recorded voices, I want to consent for each voice separately, so that I never consent to a recording I have not thought about.
10. As a developer writing my own player, I want the validator to warn, not fail, when a consent date is a timestamp, so that older tapes still open while new tapes are written correctly.
11. As a developer reading the spec and the schema, I want the consent record's date format and its `grantedBy` values written down, so that my own creator writes the same thing.
12. As a builder of any later ticket, I want every reference token available as a CSS variable and a Tailwind utility, so that my surface uses the same colours, type and easing as every other surface.
13. As a builder, I want TapeLabel, Reel and Cassette to already look like the reference, so that the Register-B tape stock reads as printed and consistent on every screen.
14. As a builder, I want to know which ticket builds each remaining shared piece, in which kit file and to which exact brief spec, so that two tickets never build two different DeckChips.
15. As a test author, I want Mia's tape and Grandma's reply as real `.storysync` files plus helpers that load them, so that my tests reach the reference states through the app's own entry points.
16. As Jon, I want a test that fails if any Rivera-family content leaks into the product, so that the illustrative cast stays illustrative.
17. As a reviewer, I want every M0 change to land with its spec, schema, decision log and tests in the same ticket, so that the protocol and the code never disagree.

## Implementation Decisions

**Modules that change or appear (no file paths here; each ticket lists exact files):**

- **Tape-meta module (new, in the storysync library).** Pure functions: a runtime estimate over pages (words ÷ 2.5 + autoPause, defaulting to 3 s per page), a clock formatter, and a narration-kind classifier.
  - The classifier returns READ-ALONG when no page has `audioUrl`, AAC/M4A when every recorded page is `aac`, and WAV when any is `wav`.
  - A label builder composes `SIDE A · N PAGES · ~m:ss · <KIND>`.
  - The Player's existing timing helpers re-export the arithmetic from here, so there is one source. The Player's own behaviour is unchanged.
- **Landing teaser.** Reads the demo manifest at build time as a static JSON import from `/public`, which is about 7 KB and needs no runtime fetch. The title, author and meta all come from it, and nothing about the house tape stays as a component literal.
- **Share-code module (new).**
  - `mintShareCode()` returns 32 lowercase hex from `crypto.getRandomValues(16 bytes)`. With no CSPRNG it refuses (throws) rather than falling back to time and `Math.random`.
  - `shareLinkRow(storybookId)` builds the explicit cloud insert.
  - The device library and the cloud insert both use it.
  - The unused public-gallery query is deleted from the Supabase module, so the app contains no listing query.
- **Database.** An optional forward migration sets the `share_code` default to 16 random bytes. It does not touch existing rows, and Jon applies it (HITL).
- **Narrator module (new, in the storysync library).**
  - `narratorFromByline(byline)` takes the lead name before the first `,`, ` — `, ` – `, ` - `, ` with ` or `(`. It trims, caps at 40 characters, and returns undefined when empty.
  - `resolveNarrator({ byline, existing, hasRecordedVoice })` returns undefined without a recorded voice. Otherwise the byline-derived name wins, then an existing `metadata.narrator`.
  - The Creator's publish assembly sets or deletes `metadata.narrator` through it.
  - The Player's deck chip renders a lucide `Mic` glyph and the name when `metadata.narrator` is present. It stays `aria-hidden`; the cover meta is the accessible statement.
- **Manifest validation.**
  - `ValidationResult` gains `warnings: string[]`. `ok` still depends only on errors, so packing and unpacking never fail on a warning.
  - WARN lines: a consent date that is a timestamp, which uses the reference's exact wording; a consent date that is not `YYYY-MM-DD`; and a recorded voice with no consent record, which is the spec's SHOULD.
  - The schema's `voiceConsent` items gain descriptions: `date` is a calendar date, and `grantedBy` is conventionally "parent/guardian" or "self", free text allowed. The spec's §7 states one record per recorded voice and the date rule.
- **Consent module (new, in the storysync library).**
  - `recordedVoices(pages, byline)` returns the ordered distinct voice names of recorded pages. The key is `text.voice`, then the byline, then "narrator".
  - `consentDate(now)` returns the local `YYYY-MM-DD`.
  - `consentRecords(voices, grantedBy, date)` builds the records.
  - The gate receives the voice list and renders one consent row per voice. A single voice keeps the existing control id and the reference copy verbatim. Continue is enabled only when every row is ticked.
- **Tokens.**
  - `:root` custom properties use the reference names (`--ss-*`, `--mood-*`), plus `--ss-layer-*` packet fills, `--ss-kraft`, `--ss-tape-brown`, `--ss-crayon-paper`, `--ss-red-ink` and the cassette and print-slot tones (`--ss-shell-hi`, `--ss-foot-1`, `--ss-foot-2`, `--ss-slot`).
  - Tailwind gets `@theme inline` colour tokens (`bg-ss-navy`, `text-ss-ink`, `bg-mood-wonder` and so on), and the reference ease becomes a Tailwind easing token.
  - A typed mirror exports the same values for components that need them in code: mood colours keyed by the shared mood names, and layer fills keyed by the seven layer names.
  - Fraunces loads as its variable axis with italic, and Plex Mono adds 600. These are the same families, self-hosted, with no new third-party request.
- **Kit layout.**
  - Existing primitives stay in the kit barrel.
  - Every new shared component gets its own component file and its own component-scoped stylesheet under the kit. Consumers import it directly, so later tickets never co-edit the barrel or the kit stylesheet.
  - TapeLabel and Reel are aligned in place.
  - Cassette is new and is adopted by the landing hero. It keeps the hero's `ls-cassette` class and `data-ls` hooks, so the spectacle's animation and its tests are untouched.
- **Component allocation.**
  - Components the reference needs, but that no page renders yet, are not pre-built in M0.
  - T05b's allocation table names, for each one, the kit file (`studio-kit/<Name>.tsx` + component-scoped CSS), the brief `design_system` spec number it must match, and the consumer ticket that builds and tests it.
  - A component reused by a later ticket is extended by that ticket, which owns that change and its test.
  - The design-system pieces the brief marks as annotation, Idea or P3 are not built.
- **Fixtures.**
  - A generator, run on demand through a dedicated Playwright config (no new dependency), rasterizes the reference's inline SVG symbols with the bundled Chromium. It synthesizes speech-like 16 kHz mono WAVs at deliberately different loudness, for later voice-levelling tests, and packs both tapes with the container module.
  - The generated binaries are committed, so the suite never regenerates them.
  - A typed facts module and a page-helpers module are the only way tests reach them.

## Testing Decisions

- **Seams.** The highest existing seams only:
  - Playwright E2E on the route (desktop 1280×720 and mobile 375×812 projects) for anything a person sees.
  - Node-side Playwright tests for `src/lib` behaviour, with `tests/storysync-roundtrip.spec.ts` as prior art.
  - One seam per ticket where possible. Where a ticket has a pure rule and a visible effect (T01, T02, T03), the E2E is primary and one small Node block pins the rule's edge cases.
- **What is tested is behaviour, not markup:**
  - The label text a visitor reads.
  - The codes a link carries.
  - The manifest a publish writes, read back from the device library as the existing studio suites do.
  - What a listener sees on the cover and in the deck chip.
  - What a validator returns.
  - Computed styles that carry the register (font family, weight, style, ink border, token values).
- **Prior art reused:**
  - Draft seeding through `addInitScript` (`tests/critic-studio.spec.ts`, `tests/wp-studio.spec.ts`).
  - Device-library seeding (`tests/wp-player.spec.ts`, `tests/critic-player.spec.ts`).
  - The `.storysync` file input (`tests/critic-landing.spec.ts`).
  - Reduced-motion checks via `animationName` (`tests/wp-landing.spec.ts`).
  - The pinned clock via Playwright's clock API, for consent dates.
- **Component tests go through pages.** I verified on this repo that Playwright's transform rewrites JSX in imported components into component-testing objects, so `react-dom/server` cannot render kit components in a Node test. Kit components are therefore tested on the pages that render them, never through a dev-only route. That is why components without a consumer are allocated to their first consumer, not pre-built.
- **Never weaken an existing assertion.** Each ticket lists the existing tests it touches and why. M0 changes none of today's assertions' meaning.
- **Fidelity.** Each visible ticket names its viewport and the reference crop, and saves `docs/vision/evidence/T<nn>.png`.

## Out of Scope

M0 builds none of the following. Quoted from HANDOFF §4:

- s02: "**I:** word-to-picture hotspots ("tap a word, the picture answers"). Do not build."
- s03: "**I:** the listening mascot and the giant "Hear it" button. Do not build. Words do not light during a take (needs on-device alignment); keep that honest."
- s05: "Not UI: the passport-stamp ribbon in the reference is an explanatory diagram. Do not build it."
- s06: "**I:** "Keep it on this phone" (offline tapes). Do not build."
- s07: "**I:** search, genre pills, "Keep tapes on this laptop", the curated catalog beyond the Star, Premium badges. Do not build. **P3:** made voices."
- s09: "**P3, do not build:** the Tauri desktop app, the professional multi-lane timeline, Cast (several narration tracks per page), sound effects lane."
- s10: "Everything here is **P3** or **I** (StorySync for Schools, bilingual tracks, class shelf, sealed roadmap tapes, plans). Only check that `/read` opens from a QR with no account. Do not build any of it."

Also out of M0, because each belongs to a later milestone:

- the hero tape title and star alignment (T06);
- the "Remember the magic?" band (T07);
- the expanded three-sound deck chip and tape-pack progress (T09);
- the seven-layer sheet, inked stamp and adult self-consent (T14);
- `signature.replyTo` (T18);
- building the shared components that T05b allocates to later tickets (DeckChip → T09a, JCard → T12, and so on).

The design-system pieces the brief marks as diagram or annotation are never built: the spec figure, the stage layers strip, the passport stamp, the sealed cassette, the mascot and the e-reader.

## Open Questions (need Jon)

1. **Shared links can be listed by anyone (privacy, high).**
   - Migration 001 grants `FOR SELECT USING (true)` on `shared_links` and `FOR SELECT USING (is_public = true)` on `storybooks`. With the public anon key that ships in the client, anyone can query every share code and every published story's `ssync_data` (pictures and children's voices) without holding a link.
   - 128-bit codes do not help until reads go through a code-keyed path.
   - Proposed fix:
     - Revoke those two broad policies.
     - Add a `SECURITY DEFINER` function `story_by_share_code(code text)` that returns only the matching story.
     - Switch the app's shared-story read to call it.
   - This changes production RLS, so it needs your yes. It would be migration 003 plus a small change to the cloud read path. I can add it to T02 or open a separate ticket.
2. **Apply migration 002** (share-code default to 16 bytes) to production. The app does not depend on it, because it inserts explicit 128-bit codes. The migration only stops a stray default from ever minting 64-bit codes.
3. **Counter columns.**
   - `shared_links.views` and `storybooks.view_count` exist. I confirmed nothing in `src/` increments either.
   - The only reader was the unused `getPublicStorybooks`, which T02 deletes. `profiles.stories_count` is maintained by a trigger and is never shown.
   - The COPPA posture says no counters. Drop them in a migration? That needs your yes, because it changes production.
4. **Old 64-bit links.** Keep resolving them (the plan, per HANDOFF), or offer a one-tap "renew link" that re-mints a 128-bit code and revokes the old one?
5. **Whose name is "VOICE:"?** The plan derives the narrator from the lead name of "story by" ("Mia, age 4 — with Mom" → "Mia"), because no reference screen draws a narrator field. If a parent types "story by: Mom" over Mia's voice, the cover says "VOICE: MOM". Would you rather the Creator ask "Whose voice?" explicitly? T14's "Whose voice is on this tape?" is the natural place.
6. **More than one recorded voice.** The plan shows one consent row per distinct voice. Today that only happens for imported or replied tapes. Is per-voice ticking right, or one checkbox that lists the voices?
7. **Consent date.** The plan uses the consenting device's local calendar date, so a tablet on Oct 19 at 11 pm writes 2026-10-19 even though UTC says Oct 20. Agree?
8. **Fonts.** Matching the reference needs Fraunces 800 and italic, and Plex Mono 600. These are the same families, self-hosted by `next/font`, with no third-party request, but a slightly larger font payload. OK under "no new font requests"?
9. **Fixture narration is WAV.** Node has no AAC encoder without a new dependency, and WAV is the protocol's permitted fallback. The Chromium publish path still converts drafts through WebCodecs where it can. Acceptable?

## Notes

- **Deliberate deviation from s05.**
  - The reference prints a 16-hex code (`3f9c2a7be41d0c58`) because it shows today's honest state.
  - After T02 the app prints 32 hex. T25/T26 should record this in REPORT.md as intended, not as a fidelity miss.
  - The cast strings are never hardcoded. Fixtures use their own codes.
- **Runtime label for recorded tapes (for M2/M3, not M0).**
  - The Player's cover estimate is word-based. For Twinkle it gives ~0:25 (37 words ÷ 2.5 + 5 × 2 s), while the reference prints ~0:24, the clip sum.
  - T01's helper deliberately keeps the house-tape rule. Whoever owns T09/T16 should decide whether recorded tapes report clip durations. Not asserted in M0.
- **The demo manifest is a v1 document.** It carries a legacy `signature.qrCode` pointing at `storysynchq.com`, a Phase 3 domain per the cast. Nothing renders it today, so M0 leaves it alone. T23 should not surface it.
- **Shared files touched across tickets (unavoidable, append-only or region-disjoint):**
  - `agent_docs/decisions.md` is append-only.
  - `src/components/studio/Studio.tsx` is touched by T03 then T04b; T04b is blocked by T03 to serialize the publish-assembly edit.
  - `src/components/landing/Landing.tsx` is touched by T01 (protocol section) and T05b (hero cassette), in disjoint regions.
  - `CLAUDE.md` is touched by T00 (project structure: `tests/fixtures/`) and T05a (studio-kit layout line).
  - `src/app/globals.css` is edited only by T05a in M0–M5. Every later ticket adds component-scoped CSS instead.
- **Deviation from HANDOFF §6.** §6 says "Do this once, early (T05)" for components. M0 ports the tokens once, early (T05a), and aligns the pieces with live consumers (T05b). It does not pre-build components that no page renders yet, because they would ship untested: there are no dev routes, and Node SSR of kit components is blocked by Playwright's JSX transform. The T05b allocation table keeps them single-sourced. Record this in REPORT.md.
- **No new runtime or dev dependency** anywhere in M0.
