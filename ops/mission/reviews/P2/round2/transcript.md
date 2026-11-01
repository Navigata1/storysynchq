I'm asking for changes (**amend**). Both round-1 repairs hold up when I read the code at this head. But the R1-01 fix creates a new High defect in the recording step, which by the stop rule keeps P2 from closing. As before, I could only read the code, not run it, so the layout numbers below are my own arithmetic.

## Prior findings

**P2-R1-01: confirmed.**
- The judge now has a "studio (recording a take)" state (`tests/a2-layout.spec.ts:749-762`). It checks every landscape size, counting the photo's uncovered pixels down its middle, and needs at least 120.
- The fix (`studio.css:856-886`) holds for this case. Under 600px tall and below 1024px wide, a take turns the room into one screen: the Voice card docks on the right and the picture zone's right margin clears it.
- By my arithmetic the photo is about 218px tall at 844×390 and about 211px at 667×375. It sits beside the card, not under it. The old sheet's height cap is overridden, so it no longer applies.

**P2-R1-02: confirmed.**
- The fixed/sticky exemption (`a2-layout.spec.ts:852-857`) now applies only when scrolling can actually uncover the control. Under top chrome that needs `scrollY > 0`; under bottom chrome it needs room left to scroll down.
- The lead's reversal of my round-1 directions is correct.
- One loose end remains on the sideways strip; it is P2-R2-03 below.

## New findings

**P2-R2-01 (High, defect): on a landscape phone, closing the Voice card mid-take leaves no Stop anywhere on screen.**
- In this layout (`studio.css:866-868`) the transport, the rail and the filmstrip are all hidden. The Voice card is the only Stop left.
- That card can still be closed during a take, by its Close key (`ToolPanels.tsx:69-76`, wired at `Studio.tsx:1989`) or by Escape (`Studio.tsx:1608-1609`, which doesn't check for a take).
- The Stage has no Stop of its own, and Space won't stop a take (`Studio.tsx:929-931` only announces "Finish the recording…").
- So a parent on a phone held sideways who taps ✕ is left with a live mic and no visible way to stop it. Their only way out is Exit or a reload, and the take is lost.
- The existing focus logic (`Studio.tsx:1683`) promises that closing the sheet mid-take brings back "the transport's Stop, which is back". The new CSS breaks that.
- It also makes the decision log's "the card has its own Stop" false whenever the card is closed.
- The judge misses it because it only judges the Studio with the card open.
- **Fix:** add `.studio[data-recording="true"]:not(:has([data-studio="tool-card"]))` to this media query and leave the transport visible in that case (or hide it only while the card is open). Alternatively, block closing the card and Escape while a take is live. Then add a judged state: at 844×390 and 667×375, mid-take with the card closed, a visible, uncovered Stop must exist.

**P2-R2-02 (Medium, defect): at 844×390, starting a take from the transport's REC by keyboard drops focus.**
- `transportAside` only covers phones under 768px (`Studio.tsx:430-431, 1642`). At 844 wide it stays false, so the focus hand-off at `Studio.tsx:1687-1702` never runs.
- The new CSS still hides the transport that holds focus (`studio.css:868`), so focus falls to `<body>`.
- From there, the documented Escape key closes the card and leads straight into P2-R2-01.
- **Fix:** have the hand-off also run when this landscape-take layout applies (a matching `useMediaQuery`), moving focus to the card's Stop.

**P2-R2-03 (Low, judgement): the Filmstrip exemption checks only that the strip can scroll, not that it can scroll the right way.**
- In `a2-layout.spec.ts:851`, the test `strip.scrollWidth > strip.clientWidth` is always true here, because the code that finds the strip already requires it.
- So a thumbnail under the strip's sticky handle is excused even when the strip is scrolled to the end that can't uncover it. That is the same gap as R1-02, but sideways, and it doesn't match the disposition's "only while its strip scrolls sideways".
- **Fix:** excuse it only when `scrollLeft > 0` (handle on the left) or when `scrollLeft` is short of the end (handle on the right).

```json
{"verdict": "amend", "prior": {"P2-R1-01": "confirmed", "P2-R1-02": "confirmed"}, "filesRead": ["ops/mission/contract.md", "ops/mission/plan.lock.json", "ops/mission/idea.lock.json", ".a2-review/log.txt", ".a2-review/diff.patch", "ops/mission/reviews/P2/round1/transcript.md", "ops/mission/reviews/P2/round1/dispositions.json", "src/components/studio/studio.css", "src/components/studio/stage.css", "src/components/studio/Studio.tsx", "src/components/studio/Stage.tsx", "src/components/studio/ToolPanels.tsx", "tests/fixtures/mic.ts"], "findings": [{"id": "P2-R2-01", "severity": "high", "file": "src/components/studio/studio.css", "line": 868, "summary": "On a landscape phone (under 600px tall, under 1024px wide), closing the Voice card mid-take leaves no Stop on screen", "mechanism": "The new landscape-take rule hides .studio-area-transport, .studio-area-rail and .studio-area-film whenever data-recording is true, so the Voice card is the only Stop. The card stays closable mid-take: its Close key (ToolPanels.tsx:69-76, onClose at Studio.tsx:1989 sets tool null) and Escape (Studio.tsx:1608-1609, no check for a take). The Stage renders no Stop, and Space during a take only announces (Studio.tsx:929-931). The mic keeps recording with no visible way to stop it; Exit or a reload loses the take. This breaks the invariant at Studio.tsx:1683 ('the transport's Stop, which is back') and makes the decision log's 'the card has its own Stop' false once the card is closed. a2-layout.spec.ts only judges the take with the card open, so it passes.", "fix": "Hide the transport in this media query only while the tool card is mounted (e.g. .studio[data-recording='true']:has([data-studio='tool-card']) .studio-area-transport { display: none; }), or keep the card from closing and ignore Escape while a take is live. Add a judged state to a2-layout.spec.ts: at 844x390 and 667x375, mid-take with the Voice card closed, a visible, uncovered Stop control exists."}, {"id": "P2-R2-02", "severity": "medium", "file": "src/components/studio/Studio.tsx", "line": 1642, "summary": "At 844x390 a keyboard REC on the transport loses focus when the transport is hidden mid-take", "mechanism": "transportAside is phone && recording && tool==='voice', and phone is under 768px (Studio.tsx:430-431). At 844 wide it is false, so the focus hand-off layout effect (1687-1702) never moves focus to the card's Stop. The new CSS (studio.css:868) still sets the focused transport to display:none, so focus drops to <body>. From there Escape closes the card (leading into P2-R2-01).", "fix": "Make the hand-off condition include the landscape-take media query (a useMediaQuery matching '(orientation: landscape) and (max-height: 599.98px) and (max-width: 1023.98px)') so focus moves to the card's voice-record Stop."}, {"id": "P2-R2-03", "severity": "low", "file": "tests/a2-layout.spec.ts", "line": 851, "summary": "The Filmstrip sticky-handle exemption doesn't check the direction scrolling would uncover the thumbnail", "mechanism": "strip.scrollWidth > strip.clientWidth always holds here, because scroller() only returns a strip that meets it. So any thumbnail under a sticky element in the strip is excused even when the strip is scrolled to the end where the handle can't be cleared. This is the sideways version of P2-R1-02 and doesn't match the disposition's 'only while its strip scrolls sideways'.", "fix": "Excuse it only if the strip can still scroll the way that uncovers the thumbnail: strip.scrollLeft > 0 for a handle on the left, or strip.scrollLeft < strip.scrollWidth - strip.clientWidth - 1 for a handle on the right."}]}
```
