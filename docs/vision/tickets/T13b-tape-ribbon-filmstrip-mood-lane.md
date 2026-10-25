# T13b · Tape-ribbon filmstrip with mood lane
Milestone: M3 · Reference: s03 (brief screens[2]) · Status in reel: Shipped (filmstrip, voice badges, page lock) + Next (tape ribbon, mood lane)
Type: AFK (agent can finish alone)
Blocked by: T13a (file order on `Studio.tsx`, `studio.css`)   ·   Blocks: T14 (file order on `Studio.tsx`), T24 (per-page moods fill this lane)  ·  (T05c/T05d: see correction below)

> **Planning correction (orchestrator):** there is no T05c/T05d ticket. Per the M0 PRD and T05b's allocation table, each kit piece is built by its first consumer. This ticket therefore **creates** the kit components it names (`src/components/studio-kit/<Name>.tsx` + a component-scoped CSS file it owns) to the brief `design_system` spec, and tests them through this ticket's page.

Split from T13. T13a is the room; T13b is the tape.

## Why
In s03 the pages are "Filmstrip as tape": frames ride "a 10px tape-brown ribbon running behind the frames at mid-height".
- Told pages carry a red mic badge.
- The page being told carries a red dot.
- The last tile says "Snap the next drawing".
- While Mia talks, the 'move' control is dimmed with a lock.
- Under the frames runs "An 8px Wonder mood lane … with its mono 10px label at the right end": **"WONDER · GENTLE MUSIC ADDED FOR YOU"**.

The brief's vision line is "Filmstrip as a strip of tape with voice badges and a mood lane", and "Gentle music on by
default, Wonder".

Today the strip is grey thumbnails with an emoji badge and a "+". Nothing tells a parent that music was added for them.

## Done when (acceptance, each testable)
- [ ] **Tape ribbon.**
  - `section[aria-label="Pages"]` contains one kit `TapeRibbon` (`[data-sk="tape-ribbon"]`, `variant="band"`,
    `aria-hidden`), spanning the strip's width.
  - Its vertical centre is within ±6 px of the frames' vertical centre.
  - It is painted behind the frames: `elementFromPoint` at a frame's centre returns that frame or its descendant, and at a
    point on the ribbon between two frames returns the ribbon.
  - Today's sprocket-free strip keeps its horizontal scroll and snap.
- [ ] **Frames.**
  - Frames are 112×84 at ≥ 1024 px and keep today's size below that.
  - Accessible names are unchanged ("Page N", ", has voice", ", selected") and so is the disabled-while-recording rule.
  - A told page shows a red badge with a lucide `Mic` (no emoji).
  - The selected frame keeps the gold border.
  - A frame with no picture shows a lucide `Pen` instead of "✎".
- [ ] **The page being told.**
  - While recording, the current frame carries a red dot at its top-right (`[data-studio="frame-live"]`).
  - The dot is static: `animationName` `none` and no infinite animation.
- [ ] **Snap the next drawing.** The add tile shows a lucide `Camera` and the text "Snap the next drawing", and its
  accessible name is "Snap the next drawing".
  - Clicking it adds a page, selects it ("Page 6, selected" for Twinkle), and opens the camera picker: a `filechooser`
    event fires for an input with `accept="image/*"` and `capture="environment"`.
  - Cancelling the picker leaves the blank page, as "+" does today.
  - While recording it is disabled with the title "Finish the recording first".
- [ ] **Move controls.**
  - When not recording, the three controls keep their names: "Move this page earlier", "Move this page later" and
    "Delete this page". They use lucide `ChevronLeft`, `ChevronRight` and `Trash2`.
  - While recording, they are replaced by one disabled pill reading "move" with a lucide `Lock`, with the title "Finish
    the recording first".
- [ ] **Mood lane.** Under the frames is `[data-studio="mood-lane"]`, an 8 px lane with one segment per page (`[data-studio="mood-segment"]`, count = page count).
  - The segments are aligned under their frames. Each segment's background is that page's mood colour token
    (`--mood-<name>`): Wonder → `rgb(245, 181, 68)`.
  - The label at the right end reads "Wonder · gentle music added for you", rendered uppercase by CSS
    (innerText "WONDER · GENTLE MUSIC ADDED FOR YOU"), with a lucide `Star`.
  - The Studio passes the lane a per-page list. Today every page gets the story mood. When T24 adds per-page moods, the
    same prop carries them, and the label names the current page's mood.
  - Choosing Calm in the Music tool turns every segment `--mood-calm` and the label "CALM · GENTLE MUSIC ADDED FOR YOU".
  - Switching music off removes the lane (count 0). Switching it back restores it.
- [ ] **Phone.** At 375×812 the strip still scrolls horizontally inside itself, the ribbon and lane scroll with the frames,
  and `document.documentElement.scrollWidth <= 375`.
- [ ] **Reduced motion.** No transition or transform on frames (today's rule kept). The live dot is static anyway.
- [ ] The obsolete `.studio-strip` / `.studio-thumb` rules move from the Studio's shell stylesheet into the new
  `filmstrip.css`, or are deleted where superseded. Nothing else in the shell stylesheet changes.
- [ ] All four gates are green.

## Seams and files
- Seam: Playwright E2E on `/studio`:
  - desktop and mobile projects, plus 1180×820;
  - Twinkle via T00 `seedStudioDraft` + `restoreDraft`;
  - recording via `tests/fixtures/mic.ts`;
  - the camera picker via `page.waitForEvent("filechooser")`.
- `Filmstrip` gains `moods: (MoodName | null)[]` (one per page; `null` means no music on that page) and a
  `onSnapNext` callback. Studio derives `moods` from `state.musicOn ? state.mood : null` per page today, and wires
  `onSnapNext` to add a page and then open the shipped photo input.

## Files (ownership)
- `src/components/studio/Filmstrip.tsx` (modify)
- `src/components/studio/filmstrip.css` (new, component-scoped: frame sizes, ribbon layering, lane)
- `src/components/studio/studio.css` (modify: remove or move the `.studio-strip` / `.studio-thumb` rules only; after T13a, region-disjoint)
- `src/components/studio/Studio.tsx` (modify: Filmstrip props `moods`, `onSnapNext`; after T13a in file order)
- `tests/vision-filmstrip.spec.ts` (new)
- `agent_docs/decisions.md` (append one entry; shared, append-only)

## Existing tests that may change
- None should change:
  - `tests/wp-studio.spec.ts:470–500` and `tests/critic-studio.spec.ts:430–465` use `getByRole("button", { name: /^Page \d/ })`, "Page 1, has voice" and the disabled-frame rule, all kept;
  - `tests/fixtures-vision.spec.ts` (T00) expects five frames named "Page 1, has voice" … ("Page 1, has voice, selected"
    first), which is kept.
- No existing test clicks "Add a new page" (searched). The add control's name changes to "Snap the next drawing" because
  the reference names it.

## Tests (written first)
`tests/vision-filmstrip.spec.ts`:
1. Ribbon:
   - present, `aria-hidden`;
   - centre ±6 px of the frame centre;
   - `elementFromPoint` checks (frame on top, ribbon between frames).
2. Frames:
   - 112×84 at 1180×820;
   - 5 frames + the Snap tile;
   - every "has voice" frame contains an `svg` badge and no emoji text.
3. Live dot: `stubMicrophone` → REC → `[data-studio="frame-live"]` inside the current frame, `animationName` `none`;
   after Stop it is gone.
4. Snap: `Promise.all([waitForEvent("filechooser"), click "Snap the next drawing"])` → the chooser's element has
   `accept="image/*"`; frame "Page 6, selected" exists.
5. Move pill:
   - while recording, the three move/delete names have count 0 and a disabled control with the text "move" exists;
   - after Stop, the three are back.
6. Mood lane:
   - 5 segments with background `rgb(245, 181, 68)`;
   - label innerText "WONDER · GENTLE MUSIC ADDED FOR YOU";
   - Music tool → Calm → segments `--mood-calm` and the label "CALM · GENTLE MUSIC ADDED FOR YOU";
   - switch off → lane count 0.
7. Phone: at 375×812, `scrollWidth <= 375`; the strip's own `scrollWidth > clientWidth` with 5 frames (it scrolls
   inside itself).

Red first: 1–6 fail on today's markup. 7 passes today and guards the change.

## Fidelity check
- Viewport 1180×820.
- State: the Twinkle draft, page 3 selected, recording about 5 s (as T13a's state).
- Reference: `docs/vision/reference/renders/s03.png` filmstrip about x430–1262, y552–642. Compare:
  - the ribbon behind the frames at mid-height;
  - the badged frames 1–2 and active frame 3 with the red dot;
  - the "Snap the next drawing" tile;
  - the locked "move" pill at the right;
  - the Wonder lane with "WONDER · GENTLE MUSIC ADDED FOR YOU" at its right end.
- Deliberate deviation: the reference's "pulsing" dot is static, because nothing loops in the Creator except reels.
- Save `docs/vision/evidence/T13b.png` and `docs/vision/evidence/T13b-375.png`.
