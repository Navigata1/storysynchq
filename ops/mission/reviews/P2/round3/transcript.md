I'm approving P2 round 3: this round found no High. Of the five prior findings, I confirmed four and rejected one, P2-R2-03, which is Low. Under the frozen stop rule a rejected Low doesn't block the phase. As in earlier rounds I could only read the code, not run it, so the layout figures below are my own arithmetic.

## Prior findings

**P2-R1-01: confirmed.** At this head, starting a take on a short landscape screen still docks the Voice card on the right (`studio.css:873-904`). The card has `inset: 8px 8px 8px auto`, which beats the ≥768px rule that would make it a floating card (`left:18px; bottom:18px`). The take-sheet zone height is overridden by the combined selector at `:897-898`. The judge's "recording a take" state checks the uncovered photo height at both landscape sizes (`a2-layout.spec.ts:1166-1179` in the diff).

**P2-R1-02: confirmed.** Fixed or sticky chrome at page level only excuses a covered control when the page can still scroll in the direction that uncovers it (`scrollY > 0` for top chrome, `scrollY < maxY - 1` for bottom chrome; diff lines 1112-1117).

**P2-R2-01 (High): confirmed.**
- The transport is now hidden only while `data-take-card` is set (`studio.css:870`). That flag is `cardAside = shortLandscape && recording && tool === "voice"` (`Studio.tsx:1652`).
- Closing the card with its Close key (`ToolPanels.tsx:69-76`, which sets the tool to null at `Studio.tsx:2003`) clears that flag. The transport row is in the grid areas (`"top" "stage" "transport"`), and `inert` is dropped because `stopAside` is false (`Studio.tsx:2150-2151`). The transport's REC key shows as "Stop recording" while recording (`Transport.tsx:82-84`).
- Escape (`Studio.tsx:1611-1612`) now leads to the same safe state.
- Nothing else can be open mid-take: every take opens the Voice tool (`Studio.tsx:2172`), and the rail is hidden.
- The new "Voice card closed" judge requires a visible, uncovered Stop.

**P2-R2-02: confirmed.**
- At 844×390 `phone` is false, but `cardAside` is true. So `stopAside` changes and the layout effect runs (`Studio.tsx:1698-1715`).
- Focus on the transport (`area.contains(active)`) moves to the card's `voice-record`.
- Focus left on an element with no client rects now counts as lost (`:1706-1707`). On Close, focus goes back to the transport's Stop, which is marked `data-sk="transport"` and `data-kind="stop"` (`kit.tsx:322-323`).

**P2-R2-03: rejected.**
- The new strip branch (diff lines 1106-1111) only exempts a thumbnail through `continue`. When the strip can't scroll the way that clears the handle, it doesn't report anything; it falls through to the page-level check at lines 1112-1117.
- That check sees the handle as pinned (`.studio-film-moves` is `position: sticky; right: 0`, `filmstrip.css:245-247`) and the thumbnail as not pinned. The strip sits low on screen, so the check takes it for bottom chrome. It excuses the thumbnail whenever `window.scrollY < maxY - 1`.
- So a thumbnail stuck under the handle, with the strip already scrolled to its end, still passes on any page that can scroll down. That includes the un-locked room on phones and short landscape screens. The claim "excused only while the strip can scroll the way that clears it" doesn't hold.

## New findings

**P2-R3-01 (Low, defect):** the strip branch falls through to the page-level exemption, so the R2-03 gap is still open. **Fix:** inside the strip branch, if the strip can't scroll the clearing way, report the overlap rather than falling through. Or skip the page-level check when the hit element is inside the strip.

**P2-R3-02 (Low, judgement):** on a short landscape screen, closing the Voice card mid-take leaves the page's words nowhere on screen.
- `studio.css:888` hides `[data-studio="stage-text"]` for every take (`.studio[data-recording="true"]`), not only while the card is open. READ THIS lives inside the card.
- The comments at `studio.css:868-869` and `decisions.md` say "READ THIS carries the words", which isn't true once the card is closed.
- Showing the words again may squeeze the photo below 120px at 667×375, so this is a trade-off. Either scope the rule to `data-take-card`, or make the comment and decision log say the words go with the card.

**P2-R3-03 (Low, judgement):** the "Voice card closed" judge can pass without testing its state.
- At `a2-layout.spec.ts:1010-1011` in the diff, `if (await close.isVisible()) await close.click();` skips the close without failing.
- If the Close key ever went missing or got covered, the judge would check the card-open take instead, and the card's own Stop would satisfy the Stop check.
- **Fix:** assert that Close is visible, click it, then assert the tool card is gone before judging.

```json
{"verdict": "approve", "prior": {"P2-R1-01": "confirmed", "P2-R1-02": "confirmed", "P2-R2-01": "confirmed", "P2-R2-02": "confirmed", "P2-R2-03": "rejected"}, "filesRead": ["CLAUDE.md", "ops/mission/contract.md", "ops/mission/plan.lock.json", ".a2-review/log.txt", ".a2-review/diff.patch", "ops/mission/reviews/P2/round1/transcript.md", "ops/mission/reviews/P2/round1/dispositions.json", "ops/mission/reviews/P2/round2/transcript.md", "ops/mission/reviews/P2/round2/dispositions.json", "src/components/studio/Studio.tsx", "src/components/studio/studio.css", "src/components/studio/Transport.tsx", "src/components/studio/ToolPanels.tsx", "src/components/studio/read-this.css", "src/components/studio/filmstrip.css"], "findings": [{"id": "P2-R3-01", "severity": "low", "file": "tests/a2-layout.spec.ts", "line": 196, "summary": "The Filmstrip sticky-handle exemption still falls through to the page-level chrome exemption, so P2-R2-03's gap is open", "mechanism": "The strip branch (diff lines 1106-1111) only `continue`s when the strip can scroll the clearing way. Otherwise it falls through to `if (hit && pinned(hit) && !pinned(el))` (diff lines 1112-1117). There the sticky .studio-film-moves (filmstrip.css:245-247) counts as pinned chrome in the lower half of the screen, and the thumbnail is excused whenever window.scrollY < maxY - 1. A thumbnail under the handle at the strip's end therefore passes on any page that can scroll down (the un-locked room on phones and short landscape screens), contrary to the round-2 disposition.", "fix": "In the strip branch, when the strip cannot scroll the clearing way, push the overlap problem and `continue` (or exclude hits inside `strip` from the page-level exemption)."}, {"id": "P2-R3-02", "severity": "low", "file": "src/components/studio/studio.css", "line": 888, "summary": "Short landscape take with the Voice card closed: the page's words are shown nowhere", "mechanism": ".studio[data-recording='true'] [data-studio='stage-text'] { display: none !important } applies to the whole take, not only while data-take-card is set. READ THIS lives inside the Voice card, so after Close Voice mid-take neither the Stage's words nor READ THIS is on screen. The comment at studio.css:868-869 and decisions.md ('READ THIS carries the words') then do not hold.", "fix": "Scope the rule to .studio[data-take-card='true'] if the photo still clears 120px with the words back, or else amend the comment and the decision log to say the words go with the card."}, {"id": "P2-R3-03", "severity": "low", "file": "tests/a2-layout.spec.ts", "line": 100, "summary": "The 'recording, Voice card closed' judge can silently judge the card-open state instead", "mechanism": "`if (await close.isVisible()) await close.click();` skips the close when the key is not visible. If Close Voice regressed (missing or covered), the state would still be judged with the card open, and the card's own Stop would satisfy the Stop check. The state's name and its P2-R2-01 guard would then pass without being tested.", "fix": "Replace with `await expect(close).toBeVisible(); await close.click(); await expect(page.locator('[data-studio=\"tool-card\"]')).toHaveCount(0);` before judging."}]}
```
