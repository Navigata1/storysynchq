# T13a · Rail: three tools + Magic set apart; Stage borrows the Player's ambient light; listening ring (the room fits the tablet)
Milestone: M3 · Reference: s03 (brief screens[2]) · Status in reel: Shipped (Simple mode, Voice card, mic recovery) + Next (Magic apart, ambient Stage, listening ring)
Type: AFK (agent can finish alone)
Blocked by: T00 (Twinkle draft), T05b (Reel/kit alignment), T15 (file order on `Studio.tsx`; provides `tests/fixtures/mic.ts`)   ·   Blocks: T13b (file order on `Studio.tsx`, `studio.css`), T19 (READ THIS card on the Stage)  ·  (T05c/T05d: see correction below)

> **Planning correction (orchestrator):** there is no T05c/T05d ticket. Per the M0 PRD and T05b's allocation table, each kit piece is built by its first consumer. This ticket therefore **creates** the kit components it names (`src/components/studio-kit/<Name>.tsx` + a component-scoped CSS file it owns) to the brief `design_system` spec, and tests them through this ticket's page.

Split from T13 ("Rail: three tools + Magic set apart; Stage borrows the Player's ambient light; listening ring; tape-ribbon filmstrip with mood lane"). T13a is the room: rail, Stage, Voice card, top bar and viewport fit. T13b is the tape: filmstrip and mood lane.

## Why
On s03, Mia tells page 3 at the kitchen table. The tablet shows everything at once:
- the rail of "three friendly tools first, Magic set apart";
- the Voice card with "Stop — 0:05", "Pages stay put while you record." and "Recordings live only in this browser until a grown-up taps Finish my story.";
- the Stage, where "Mia's drawing 3 blurred as the monitor's own ambient backdrop" lights a sharp photo "inside a 3px tape-red inset ring and a red inner glow", with "Listening… 0:05" at its foot and the words standing still ("words stay still during a take");
- the filmstrip and transport below.

The callout says "MAGIC STAYS QUIET — … It sits apart on purpose: the voice is the moat."

Today, at 1180×820, the room does not fit:
- A page with a photo makes the Stage about 1,220 px tall, so the filmstrip and transport start about 1,320 px down.
- The four tools are equal emoji tiles.
- The Stage shows the picture on black.
- Recording tints the whole picture zone red.
- The Voice card floats over the Stage it is talking about.

Doctrine: "Stage = Player. The Creator's Stage renders from the same SsyncManifest the Reader plays." That includes the light.

## Done when (acceptance, each testable)
- [ ] **The room fits.** In Simple mode, at 1180×820, 1280×720 and 1024×768, with the Twinkle draft on page 3, with no tool
  open and again with Voice open:
  - `document.documentElement.scrollHeight <= innerHeight`;
  - the Stage photo, the filmstrip section `section[aria-label="Pages"]` and the transport `section[aria-label="Transport"]`
    all lie fully inside the viewport;
  - at 375×812 the shipped stage-first column and bottom toolbar remain, with no horizontal scroll
    (`scrollWidth <= 375`).
- [ ] **Rail: three friendly tools, Magic apart.** `nav[aria-label="Story tools"]` holds buttons with accessible names
  exactly "Photo", "Voice", "Music", "Magic", in that order.
  - Each icon is a lucide SVG (`Camera`, `Mic`, `Music`, `Sparkles`). No emoji remain: each button's text content is
    exactly its label.
  - A `role="separator"` sits between Music and Magic.
  - At ≥ 768 px:
    - Photo, Voice and Music are ≥ 88 px tall with radius 22;
    - Magic is ≤ 72 px tall, its label renders at 12 px in the muted foreground, and its top is ≥ 16 px below Music's
      bottom.
  - At 375 px: all four remain in the bottom toolbar, and Magic's box is narrower than Photo's.
  - The active tool keeps `aria-pressed="true"` and the gold fill (computed background contains `rgb(245, 158, 11)` or the
    gold gradient).
- [ ] **The Stage borrows the light.** The picture zone has a backdrop layer `[data-studio="stage-backdrop"]`:
  - its `img` `src` equals the current page's `illustration.url`, which equals the Stage photo's `src`, which equals the
    draft manifest's page URL. One source, the manifest;
  - its computed `filter` contains `blur(36px)` and `brightness(0.5)`;
  - its `animationName` is `none`. No Ken Burns: nothing loops in the Creator.
  - A page with no picture keeps the previous picture's light, the Player's rule: after adding a blank page, the backdrop
    `src` is still page 5's URL. With no picture anywhere it falls back to the navy room gradient.
- [ ] **The photo is a photo.** The Stage `img` (`[data-studio="stage-photo"]`) is centred in the picture zone:
  - it fits inside it with ≥ 8 px margin on every side;
  - computed `border-radius` is 10px, with a drop shadow;
  - it is never taller than the zone at any of the fit viewports.
  - The "Add a picture" button for a blank page keeps its behaviour, with a lucide `Camera` instead of the emoji.
- [ ] **Listening ring.** While recording (deterministic mic stub):
  - the photo's wrapper `[data-sk="listening-ring"]` has `data-active="true"`;
  - its computed `box-shadow` contains `rgb(227, 69, 47)`, inset 3px plus the soft inner glow of the s03 spec
    (`inset 0 0 0 3px` + `inset 0 0 80px` at 35%). If T05d's outer-ring default differs, this ticket adjusts
    `ListeningRing` to the s03 spec and logs it;
  - a pill at the photo's bottom centre reads "Listening… 0:0N" with a static live dot;
  - the Stage header shows a centred red chip "recording";
  - the whole-zone red tint of today is gone, so the backdrop stays visible outside the ring.
  - After "Stop — m:ss", `data-active="false"` and the pill and chip are gone.
- [ ] **Words stay still during a take.** While recording, the Stage text is unchanged and no element inside the text zone
  carries a read-along highlight.
- [ ] **Stage status row** (mono 10.5px, lowercase as in the reference):
  - left: "recording · 0:05" while recording; otherwise today's states ("narrating", "voice ready", "browser voice");
  - right: "<Mood> · music on" (e.g. "Wonder · music on") with a lucide `Star`, or "music off".
  - The header voice chip uses a lucide `Mic` with "voice" (no emoji).
- [ ] **Voice card, docked.** At ≥ 1024 px an open tool card (Voice, Music or Magic) is a column between the rail and the
  Stage:
  - its box does not intersect the Stage photo's box;
  - its left edge is ≥ the rail's right edge;
  - its width is between 300 and 340 px.
  - Between 768 and 1023 px it keeps today's floating card. Below 768 px it keeps today's bottom sheet above the transport.
  - "Close Voice" still closes it.
- [ ] **Voice card copy.**
  - A lock row (lucide `Lock`, 14 px) reads "Pages stay put while you record."
  - The footnote "Recordings live only in this browser until a grown-up taps Finish my story." is unchanged.
  - The record button keeps "Start recording" / "Stop — m:ss" / "Record it again".
  - With the microphone denied, the copy is verbatim:
    - subtitle "We could not start listening";
    - headline "The microphone is switched off";
    - body "A grown-up needs to allow the microphone for this site — look for the lock or microphone icon next to the web address, choose Allow, then tap Try again.";
    - buttons "Try again" (lucide `Mic`) and "Keep writing instead" (lucide `Pen`).
- [ ] **Top bar.**
  - Exit shows a lucide `ArrowLeft` with "Exit". Its accessible name is unchanged.
  - The title is centred, in Fraunces, with a faint lucide `Pen`.
  - While recording, "Finish my story" is disabled and a mono note "after this take" (CSS uppercase) appears under it. The
    note is gone when the take stops.
- [ ] **Honesty: no Idea items.** No mascot image, no "Hear it" control, and no text "Idea" or "Next" anywhere in `/studio`.
- [ ] **Nothing loops but reels.** During a take, every entry of `document.getAnimations()` whose `effect.getComputedTiming().iterations` is `Infinity` targets an element inside `[data-sk="reel"]`.
- [ ] **Reduced motion.** Under `reducedMotion: "reduce"`:
  - the ring's `transitionDuration` is `0s` (or it appears with no transition);
  - no reel spins;
  - the docked card has `animationName` `none`.
- [ ] All four gates are green.

## Seams and files
- Seam: Playwright E2E on `/studio`:
  - desktop and mobile projects, plus explicit `setViewportSize` to 1180×820 and 1024×768;
  - Twinkle seeded with T00 `seedStudioDraft(page, "twinkle")` + `restoreDraft`;
  - recording driven by `tests/fixtures/mic.ts` `stubMicrophone` (T15), with `stubMicrophone(page, { deny: true })` for
    the denied state.
- Stage reads `illustration.url` from the page prop only. The backdrop's "keep last picture" memory lives inside Stage.
- Studio passes `mood` and `musicOn` to Stage, renders tool cards into a new grid area `studio-area-tool`, and adds the
  Finish note.
- The shell grid change (height 100dvh at ≥ 768 px, the `tool` column at ≥ 1024 px) is in the Studio's own shell
  stylesheet. That is unavoidable, because the grid lives there. The picture-zone sizing (a container-query square) is in
  a new `stage.css`.

## Files (ownership)
- `src/components/studio/ToolRail.tsx` (modify: lucide icons, separator, Magic tile)
- `src/components/studio/Stage.tsx` (modify: backdrop, photo, `ListeningRing`, header chip, status row, lucide glyphs)
- `src/components/studio/stage.css` (new, component-scoped: picture-zone container sizing, backdrop `img` filter)
- `src/components/studio/ToolPanels.tsx` (modify: `VoicePanel` lock row, mic-denied copy + lucide icons; `PanelShell` docking class. `MusicPanel`/`MagicPanel` content unchanged)
- `src/components/studio/studio.css` (modify: shell grid fit, `studio-area-tool`, docking rules, removal of the whole-zone recording tint if styled there. Shared with T13b, sequential, region-disjoint)
- `src/components/studio/Studio.tsx` (modify: tool-card placement, top bar Exit/title/Finish note, Stage props; after T15 in file order)
- `src/components/studio-kit/ListeningRing.tsx`, `src/components/studio-kit/listening-ring.css` (modify: expose `data-active` for tests, and adjust to the s03 inset spec if T05d's ring differs; owned by T05d, consumer adjustment)
- `tests/vision-studio-room.spec.ts` (new)
- `agent_docs/decisions.md` (append one entry; shared, append-only)

## Existing tests that may change
- None should change. They depend on hooks this ticket keeps:
  - `tests/wp-studio.spec.ts:470–500` and `tests/critic-studio.spec.ts:430–465`:
    - "Stop — m:ss" in the Voice card, "Close Voice";
    - `.studio[data-recording='true']`;
    - frames disabled during a take;
    - `[data-sk="transport"][data-kind="rec" | "next"]`;
    - the Transport readout `/● 0:0[2-9]/` and "pg 1/2" (the transport is not edited).
  - `tests/studio-experience.spec.ts`: `[data-sk="mode"]` and `[data-sk="transport"]` visible.
  - `tests/fable-pass.spec.ts` (studio autosave) does not read the layout.
- If docking moves a control that an existing test clicks by role, the role and name are unchanged, so the test is
  unaffected. Tests are never loosened.

## Tests (written first)
`tests/vision-studio-room.spec.ts`:
1. Fit:
   - at 1180×820, 1280×720 and 1024×768 with Twinkle on page 3, `scrollHeight <= innerHeight`;
   - the photo, Pages and Transport boxes are inside the viewport;
   - repeat with the Voice card open;
   - at 375×812, `scrollWidth <= 375`.
2. Rail:
   - names, order, separator, no emoji text;
   - heights at 1180×820 (tools ≥ 88, Magic ≤ 72, gap ≥ 16);
   - at 375, Magic narrower than Photo;
   - click Voice → `aria-pressed="true"`.
3. Ambient:
   - backdrop `img.src` === `[data-studio="stage-photo"].src` === the seeded page-3 URL;
   - computed filter has `blur(36px)` and `brightness(0.5)`;
   - `animationName` `none`.
   - Add a page via the strip's add control → backdrop `src` still the page-5 URL.
4. Ring:
   - with `stubMicrophone`, Transport REC → ring `data-active="true"`, box-shadow has `rgb(227, 69, 47)`;
   - the pill matches `/^Listening… 0:0\d$/`;
   - the header chip "recording";
   - the Stage text value is unchanged.
   - "Stop — …" → ring inactive, and the pill and chip are gone.
5. Docked card at 1180×820: Voice open → the card box does not intersect the photo box; card.x ≥ rail.right; width
   300–340.
6. Copy:
   - the lock row is visible;
   - with `stubMicrophone(page, { deny: true })` → REC → the four verbatim strings and the two buttons.
7. Finish while recording: disabled, and the note "after this take" visible; after Stop the note is gone and Finish is
   enabled.
8. Honesty: `getByText("Hear it")`, `getByText(/^Idea$/)` and `getByText(/^Next$/)` all have count 0 on `/studio`, idle
   and recording.
9. Loops: during a take, filter `document.getAnimations()` to infinite ones → every target `closest('[data-sk="reel"]')`
   is non-null.
10. Reduced motion: emulate `reduce` → no reel animation, ring `transitionDuration` `0s`, docked card `animationName`
    `none`.

Red first:
- 1 fails (the Stage overflows).
- 2–8 fail on today's markup.
- 9 and 10 may pass today and guard the change.

## Fidelity check
- Viewport 1180×820 (the s03 tablet).
- State: the Twinkle draft, page 3 on the Stage, Voice open, recording about 5 s (fake mic).
- Reference: `docs/vision/reference/renders/s03.png`, tablet region about x312–1288, y52–740. Compare:
  - the rail (about x330–412, y135–480): three tools, the divider, the small Magic tile;
  - the Voice card (about x430–680, y132–548): title, subtitle, big button with "Stop — 0:05", lock row, footnote. The
    mascot and its "Idea" chip are deliberately absent;
  - the Stage (about x690–1262, y132–548): blurred backdrop, centred photo, red ring, "Listening… 0:05" pill, "recording"
    chip, status row "recording · 0:05" / "Wonder · music on". The reference's "AMBIENT LIGHT · Next" chip is
    deliberately absent;
  - the top bar (about y70–120): Exit, centred title with pen, Finish with "after this take".
- The filmstrip and mood lane are T13b's. The transport is unchanged.
- Save `docs/vision/evidence/T13a.png`, plus `T13a-375.png` (phone, recording) and `T13a-reduced.png`.
