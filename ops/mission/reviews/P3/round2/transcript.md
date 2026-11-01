I confirm all three prior repairs and found no High issues, so my verdict is **approve**, with three Low notes. I couldn't run anything (Read, Grep and Glob only), so whether the tests actually pass rests on P3-G5 at this head. The diff has no P3 gate evidence yet.

## Prior findings

**P3-R1-01: confirmed.** `tests/a2-layout.spec.ts:263-275` now checks that the page's words are back when the Voice card is closed mid-take:
- The setup at lines 101-104 requires that Close Voice is visible, clicks it, and expects no tool card left. So the state can't quietly be "card open".
- The check needs the words box (`[data-studio="stage-text"] textarea`) to be visible and to hold the page's words. It must also be at least 16 px tall, inside the viewport, and the top element under its upper middle.
- If the words were hidden again (`display:none`), `toBeVisible` would fail.
- The CSS this checks is at `src/components/studio/studio.css:875-894`.
- One gap: last round's fix also asked to assert that the head row and status line are hidden. That wasn't added. It's not the defect that was raised, so I don't hold the repair back for it.

**P3-R1-02: confirmed.**
- `tests/a2-a11y.spec.ts:947-958` scans the Player's Reading options dialog. The name it waits for matches `role="dialog" aria-label="Reading options"` at `src/components/player/Player.tsx:1569-1570`.
- The judge's header and contract A5 both state the scope: five product routes and the dialogs they open, with `/classic` excluded. That was one of the two fixes last round offered.

**P3-R1-03: confirmed.** `TableScroller` (`src/components/protocol/ProtocolPage.tsx:534-557`) sets `role`, `aria-label` and `tabIndex=0` only while `scrollWidth > clientWidth + 1`, and re-measures when the box resizes.
- At 375 px the table scrolls, so the scroller is a Tab stop. That is what `vision-protocol-m6.spec.ts:326-348` relies on: it Shift+Tabs back from the privacy link and expects `pr-table-scroll` to have focus. That spec still holds.
- On desktop, where the table fits, it takes no Tab stop.

## Rest of the change
I checked these and found them sound:
- **Ink red:** `--ss-red-ink` already existed (`globals.css:51`, `tokens.ts:73`).
- **Listening pill:** no spec checks the pill's background colour. The "no whole-zone red tint" test in `vision-studio-room` covers only boxes over 60% of the zone, so the pill change can't break it. The ring keeps tape red, which `vision-studio-room.spec.ts:533-535` still asserts.
- **READ THIS label:** the T19 spec now expects the ink red.
- **Hidden head row:** the Stage's head row hidden in the landscape take holds no live region. Stage has no `aria-live` or `role="status"`.
- **Minimum test count:** `required-P3.json` needs 8 per project and the judge has 10 tests.
- **Untouched areas:** the parental gate, deletion, share codes, Player network requests and the codec path aren't touched. axe-core is a test-only devDependency, injected from `node_modules`.

## New findings (all Low)
- **P3-R2-01 · Low · judgement** · `agent_docs/decisions.md:792`
  - **Mechanism:** the decision log still says the format table's scroller "is a named region with a Tab stop", with no condition. Since commit 6cabdb7 that's only true while it scrolls; on desktop it takes no stop.
  - **Fix:** append a line saying it takes the stop only while it scrolls (P3-R1-03).
- **P3-R2-02 · Low · judgement** · `src/components/studio/ToolPanels.tsx:129` and `ProtocolPage.tsx:540`
  - **Mechanism:** the overflow measure runs on mount, when the words change, and when the box itself resizes. A web font swapping in can change `scrollHeight`/`scrollWidth` without resizing a box capped by `max-height` or a fixed width, so the measure goes stale.
  - **Effect in READ THIS:** the fallback `tabIndex=-1` then keeps the browser from making the scroller keyboard-reachable. In the landscape take with the card open, READ THIS is the only place the words appear.
  - **Fix:** also re-measure after `document.fonts.ready`, or observe the content element too.
- **P3-R2-03 · Low · judgement** · `ops/mission/idea.lock.json:49`
  - **Mechanism:** the frozen C6 claim says "Every route". `/classic` is a shipped route and is known to fail axe on serious contrast issues. Only contract A5 narrows the scope.
  - **Fix:** when C6 is reported (band, PR text), quote A5's scope ("five product routes; /classic excluded") rather than the bare lock text.

```json
{"verdict": "approve", "prior": {"P3-R1-01": "confirmed", "P3-R1-02": "confirmed", "P3-R1-03": "confirmed"}, "filesRead": ["CLAUDE.md", "ops/mission/contract.md", "ops/mission/plan.lock.json", "ops/mission/idea.lock.json", "ops/mission/claims.json", "ops/mission/judges/required-P3.json", ".a2-review/log.txt", ".a2-review/diff.patch", "ops/mission/reviews/P3/round1/transcript.md", "ops/mission/reviews/P3/round1/dispositions.json", "src/components/protocol/ProtocolPage.tsx", "src/components/player/Player.tsx", "src/components/studio/Stage.tsx", "src/components/studio/studio.css", "src/components/studio/ToolPanels.tsx", "src/components/studio-kit/listening-ring.css", "src/components/studio/read-this.css", "src/app/globals.css", "src/components/studio-kit/tokens.ts", "agent_docs/decisions.md", "tests/a2-layout.spec.ts", "tests/a2-a11y.spec.ts", "tests/vision-read-this.spec.ts", "tests/vision-protocol-m6.spec.ts", "tests/vision-studio-room.spec.ts"], "findings": [{"id": "P3-R2-01", "severity": "low", "file": "agent_docs/decisions.md", "line": 792, "summary": "The decision log says the protocol format table's scroller always has a Tab stop; since 6cabdb7 it has one only while it scrolls", "mechanism": "The P3 entry was written before the P3-R1-03 repair and was not followed up. TableScroller now sets role, aria-label and tabIndex only when scrollWidth > clientWidth, so on desktop the log's statement is no longer accurate.", "fix": "Append a decisions.md line: the format table's scroller is a named region with a Tab stop only while it scrolls (P3-R1-03), as READ THIS does.", "kind": "judgement"}, {"id": "P3-R2-02", "severity": "low", "file": "src/components/studio/ToolPanels.tsx", "line": 129, "summary": "The overflow measure for READ THIS words (and for the protocol table at ProtocolPage.tsx:540) can go stale when a web font swaps in", "mechanism": "The measure runs on mount, when the words change, and when the element's own box resizes (ResizeObserver). A font swap changes scrollHeight/scrollWidth without resizing a box capped by max-height or a fixed width, so overflows/scrolls can stay false while the content really scrolls. In ReadThis the fallback tabIndex=-1 then stops Chromium from making the scroller keyboard-focusable on its own, and in the landscape take with the card open READ THIS is the only place the words appear.", "fix": "Also call measure() after document.fonts.ready resolves, or observe the scroller's content element (the table / an inner span) as well as the scroller.", "kind": "judgement"}, {"id": "P3-R2-03", "severity": "low", "file": "ops/mission/idea.lock.json", "line": 49, "summary": "The frozen C6 claim text says 'Every route'; /classic is a shipped route that is known to fail and is excluded only by contract A5", "mechanism": "The judge and A5 state the five-route scope, but the lock's claim text is unchanged. Reporting C6 by its lock wording would claim more than tests/a2-a11y.spec.ts checks.", "fix": "Whenever C6 is reported (band, PR text, close), quote A5's scope: five product routes and their dialogs, /classic excluded.", "kind": "judgement"}]}
```
