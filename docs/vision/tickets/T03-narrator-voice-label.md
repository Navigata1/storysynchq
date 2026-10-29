# T03 · Write `metadata.narrator`; show "VOICE: <narrator>" on covers and in the deck chip when present
Milestone: M0 · Reference: s05 (brief screens[4]); s04 for the "story by" input · Status in reel: Next
Type: AFK (agent can finish alone)
Blocked by: T00   ·   Blocks: T04b (serializes the publish-assembly edit in `Studio.tsx`), T09a (the DeckChip keeps the mic + narrator)

## Why
At 6:14 Grandma Rose's iPhone shows Mia's cover with `SIDE A · 5 PAGES · ~0:24 · VOICE: MIA`. Once the tape plays, the deck chip carries "a hairline + i-mic 12px and the narrator's name": "Mia". The reel's realism note is blunt: "'VOICE: MIA' on the cover and the narrator's name in the deck chip (the Creator never writes metadata.narrator today)".

The Player already prints ` · VOICE: <narrator>` on the cover when the manifest has one. The Creator just never writes it, and the deck chip never shows it. A tape read by the browser voice must never claim a person's name.

## Done when (acceptance, each testable)
- [ ] A new pure module provides `narratorFromByline` and `resolveNarrator`.
  - `narratorFromByline(byline)` returns the lead name of a "story by" line: the text before the first of `,` · ` — ` · ` – ` · ` - ` · ` with ` · `(`, trimmed, at most 40 characters, `undefined` when empty. Cases:
    - "Mia, age 4 — with Mom" → "Mia"
    - "Grandma Rose" → "Grandma Rose"
    - "  Mom " → "Mom"
    - "Bo (5) with Dad" → "Bo"
    - "" → undefined
  - `resolveNarrator({ byline, existing, hasRecordedVoice })`:
    - returns `undefined` when `hasRecordedVoice` is false;
    - otherwise returns `narratorFromByline(byline) ?? existing?.trim() || undefined`.
- [ ] At publish, the Creator sets `metadata.narrator` from `resolveNarrator`, and deletes the key when it resolves to `undefined`:
  - byline = the gate's "story by"; existing = the draft's `metadata.narrator`; `hasRecordedVoice` = any published page has `text.audioUrl`.
  - Publishing the Twinkle draft with story by "Mia, age 4 — with Mom" writes `metadata.narrator: "Mia"` into the saved tape (device library `ssyncData`) and into the downloaded `.storysync`'s `manifest.json`.
  - Publishing a draft with no recorded voice writes no `narrator` key, even when story by is filled in.
  - Re-publishing after changing story by to "Grandma Rose" writes "Grandma Rose". The previous narrator is not sticky.
- [ ] Opening that published tape by its link shows the cover tape label meta `SIDE A · 5 PAGES · ~<m:ss> · VOICE: Mia`, rendered uppercase as `VOICE: MIA` by the label's CSS (`text-transform: uppercase`). The runtime figure is not asserted here (see M0-PRD Notes).
- [ ] While the tape plays, the deck chip shows a lucide `Mic` glyph (12 px) after a hairline, then the narrator's name "Mia" in the chip's mono type.
  - The chip stays `aria-hidden` as today, because the cover meta is the accessible statement.
  - The page counter `03 / 05` is unchanged.
- [ ] With no `metadata.narrator`, as on the house tape, neither the cover nor the deck chip shows a VOICE label, a mic glyph or a name.
- [ ] The deck chip's new parts use Tailwind utilities and the lucide icon only. `player.css` is not edited, because it is shared with T08–T11.
- [ ] A decision log entry records the derivation rule and Open Question 5 (an explicit "Whose voice?" field).
- [ ] All four gates are green.

## Seams and files
- Primary seam: Playwright E2E across `/studio` → publish → `/read?story=` (desktop + mobile).
  - The draft is seeded with `seedStudioDraft(page, "twinkle")` (T00).
  - The published manifest is read back from `localStorage["ssync-library"]`, as `tests/wp-studio.spec.ts` does.
- Secondary seam: one Node-side block pins `narratorFromByline` / `resolveNarrator` edge cases.
- Module: `src/lib/storysync/narrator.ts` (new, pure).
- Creator: `runPublish` in `src/components/studio/Studio.tsx`, at the manifest assembly (step 2), sets or deletes `metadata.narrator`.
- Player: the `pl-deck` block in `src/components/player/Player.tsx` adds the hairline, the `Mic` icon (`lucide-react`, already a dependency) and `{narrator}` when present.

## Tests (written first)
`tests/vision-narrator.spec.ts`:
1. Node: the `narratorFromByline` / `resolveNarrator` table above, including `hasRecordedVoice: false` → `undefined` with a non-empty byline.
2. E2E:
   - `seedStudioDraft(page, "twinkle")`, `restoreDraft`, then "Finish my story".
   - In the gate, answer the a×b question (read from the label), type story by "Mia, age 4 — with Mom", tick consent and press Continue.
   - Wait for "Your tape is ready".
   - Expect the library entry `ssyncData.metadata.narrator === "Mia"`.
3. E2E:
   - Continue from 2: `page.goto(<share url>)`.
   - The cover `[data-pl="cover"] [data-sk="tape"]` contains "VOICE: Mia", and its meta element's computed `text-transform` is `uppercase`.
   - "Tap to Begin" → the deck `.pl-deck` contains the text "Mia" and an `svg` (the mic).
4. E2E: the same flow with a draft seeded without voices (`seedStudioDraft(page, "twinkle", { narration: false })`, the T00 option that strips every `audioUrl` and the `recordings` meta) → no `narrator` key in the saved tape; the cover has no "VOICE:".
5. E2E: re-publish (back to the studio, Finish again with story by "Grandma Rose") → narrator "Grandma Rose".
6. E2E: `/read?demo=1` → the cover does not contain "VOICE:"; after Tap to Begin, `.pl-deck svg` count is 0 (no mic).

Red first:
- 1 fails because the module does not exist.
- 2, 4 and 5 fail because publish never writes or clears narrator.
- 3 fails at the deck chip.
- 6 passes today (a guard).

## Fidelity check
- Viewport 390×844 (Grandma's iPhone in s05).
- States:
  - (a) Twinkle's cover gate opened from its link;
  - (b) page 3 playing, after Tap to Begin and two page turns.
- Reference crops in `docs/vision/reference/renders/s05.png`:
  - the cover figure's tape label, scaled 0.46 at about x965–1145, y190–345 (`SIDE A · 5 PAGES · ~0:24 · VOICE: MIA`);
  - the iPhone deck chip at about x1190–1475, y135–175 (reels · `03 / 05` · hairline · mic · "Mia"). The "Next" chip in the reference marks this as Next work; ours ships, so no chip.
- Save `docs/vision/evidence/T03-cover.png` and `docs/vision/evidence/T03-deck.png`.

## Files (ownership)
- `src/lib/storysync/narrator.ts` (new)
- `src/components/studio/Studio.tsx` (modify: publish manifest assembly only, about 6 lines)
- `src/components/player/Player.tsx` (modify: the `pl-deck` element only; cover meta unchanged)
- `tests/vision-narrator.spec.ts` (new)
- `agent_docs/decisions.md` (append one entry; shared, append-only)

## Existing tests that may change
- None. `tests/wp-player.spec.ts:171` seeds `narrator: "Mum"` and asserts read-along timing, not the deck text. It keeps passing; the deck chip gains "Mum".
- `tests/critic-landing.spec.ts:462` expects `/01\s*\/\s*08/` on the demo (no narrator). Unaffected.
