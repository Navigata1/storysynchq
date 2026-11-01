I found no High findings, so this round doesn't block P3. I found one Medium and two Lows; the verdict is **amend** because of the Medium.

**Prior findings:** none for P3, and `ops/mission/reviews/P3/` doesn't exist yet. Nothing to confirm or reject.

**What I checked and found sound:**
- **Contrast figures:** I recomputed them and they hold.
  - Landing readout amber at 0.64 on black: about 5.0:1. At the old 0.5 it was 3.39:1, which matches the claimed 3.4.
  - Ink red `#b4301f`: about 6.1:1 on the paper `rgb(255,253,246)` and about 6.2:1 under white text.
  - `--ss-red-ink` is defined at `globals.css:51`.
- **Judge order:** the C6 judge is registered in `order.json`, `required-P3.json` and ROOTSUMS. It landed in commit dd696a9, before the `src/` fix in af9d709.
- **Judge size:** it has 9 tests, and `required-P3.json` needs 8 passing per project.
- **No new requests from the Player:** axe is injected from `node_modules` by the test only. Nothing in the Player changed.
- **Codec rule, parental gate, deletion, share codes:** none of them are touched.
- **Landscape take CSS:** `data-take-card` is only set while recording (`Studio.tsx:1652`), so the narrowed `display:none` can't hide the Stage's words outside a take.
- **Protocol scroller Tab stop:** `vision-protocol-m6.spec.ts` names focus by tag and class, so the scroller test still finds `pr-table-scroll` after the new `aria-label`. The Tab-walk tests don't count an exact number of stops.
- **READ THIS words:** `ToolPanels.tsx` measures overflow again when the words change and whenever the box resizes. The T19 spec checks the same overflow condition the component uses.

**Findings:**

- **P3-R1-01 · Medium · hard defect** · `src/components/studio/studio.css:872-894`
  - **Mechanism:** the P2-R3-02 repair (on a landscape phone, closing the Voice card mid-take brings the page's words back as a compact line) changes what the user sees. No test checks that the words are actually visible. `a2-layout.spec.ts` reaches the closed-card state but only judges overlap and the photo's ≥120 px height. If the words were still hidden, every test would still pass.
  - **Fix:** in the "recording, Voice card closed" state at 844×390 and 667×375, assert that the words box is visible, shows the page's words and isn't covered. Also assert that the head row and status line are hidden while the photo keeps ≥120 px.

- **P3-R1-02 · Low · judgement** · `tests/a2-a11y.spec.ts:717`
  - **Mechanism:** C6 says "every route" and "each open dialog the suite reaches". The judge covers 5 routes and 4 dialogs. It leaves out `/classic` and dialogs other suites do reach, such as the Player's Reading options. The commit message claims "zero serious axe violations on routes and dialogs (C6)", which reads broader than what the judge checks.
  - **Fix:** either add `/classic` and the Reading options dialog to the judge, or state the scope in the claim ("5 routes, `/classic` excluded as preserved legacy") when C6 is reported.

- **P3-R1-03 · Low · judgement** · `src/components/protocol/ProtocolPage.tsx:450`
  - **Mechanism:** the format table's scroller now always has `tabIndex=0`. On desktop, where the table fits and doesn't scroll, that adds an empty Tab stop. The READ THIS words avoid this by only taking a stop when they overflow.
  - **Fix:** use the same measure-overflow pattern as `ReadThis` here, or accept it as harmless and note that.

```json
{"verdict": "amend", "prior": {}, "filesRead": ["ops/mission/contract.md", "ops/mission/plan.lock.json", ".a2-review/log.txt", ".a2-review/diff.patch", "src/components/studio/studio.css", "src/components/studio/Studio.tsx", "src/components/studio/Stage.tsx", "tests/vision-protocol-m6.spec.ts", "tests/a2-layout.spec.ts", "ops/mission/judges/required-P3.json", "ops/mission/judges/order.json", "ops/mission/SHA256SUMS", "ops/mission/idea.lock.json", "src/app/globals.css", "src/components/studio-kit/listening-ring.css", "src/components/studio/read-this.css", "tests/vision-studio-room.spec.ts", "tests/vision-type-a-feeling.spec.ts", "tests/vision-read-this.spec.ts", "CLAUDE.md"], "findings": [{"id": "P3-R1-01", "severity": "medium", "file": "src/components/studio/studio.css", "line": 875, "summary": "P2-R3-02's repair (words come back as a compact line when the Voice card closes mid-take on a landscape phone) has no test that checks the words are visible", "mechanism": "The CSS moves the stage-text hide from data-recording to data-take-card and hides the head and status rows. No spec checks that [data-studio=stage-text] is visible in the recording, card-closed landscape state: a2-layout only judges overlap and photo height there, and the T19 and studio-room specs don't cover it. Hiding the words again would pass every test.", "fix": "In the a2-layout 'recording, Voice card closed' state at 844x390 and 667x375 (or a dedicated spec), assert the stage-text textarea is visible, holds the page's words and is unobscured, the stage-head and stage-status are hidden, and the photo keeps at least 120 px.", "kind": "defect"}, {"id": "P3-R1-02", "severity": "low", "file": "tests/a2-a11y.spec.ts", "line": 717, "summary": "C6 says every route and each dialog the suite reaches; the judge covers 5 routes and 4 dialogs", "mechanism": "/classic and dialogs other suites reach (for example the Player's Reading options) are never axe-scanned, while the commit message claims zero serious violations on routes and dialogs.", "fix": "Add /classic and the Reading options dialog to the judge, or state the narrower scope when C6 is reported.", "kind": "judgement"}, {"id": "P3-R1-03", "severity": "low", "file": "src/components/protocol/ProtocolPage.tsx", "line": 450, "summary": "The format-table scroller is always a Tab stop, even on desktop where it doesn't scroll", "mechanism": "tabIndex={0} and role=region are unconditional, unlike ReadThis, which takes a stop only while it overflows; keyboard users get an empty stop on wide screens.", "fix": "Measure overflow (scrollWidth > clientWidth) the way ReadThis does and set tabIndex and role only while it scrolls, or accept it and note it.", "kind": "judgement"}]}
```
