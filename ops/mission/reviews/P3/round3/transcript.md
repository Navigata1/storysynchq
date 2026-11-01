## P3 round 3 review: approve, no High findings

All six prior repairs hold at this head, and the change has no new High or Medium defect. I raise one new Low. I could only read files, not run anything, so whether the suite passes is still up to P3-G5. The checkout has no `ops/mission/evidence/P3*` files yet. The round 1 and round 2 dispositions say "a2-a11y, T19 and protocol specs pass", but nothing in the diff backs that up yet.

### Prior findings
- **P3-R1-01: confirmed.**
  - `tests/a2-layout.spec.ts` now requires Close Voice to be visible, clicks it, and expects no tool card to remain (lines 101–104 of the new file).
  - The `words` check then requires the Stage's textarea to be visible, to hold the page's words, to be at least 16 px tall, to sit inside the viewport, and to be the top element under its upper middle.
  - The CSS it guards is `src/components/studio/studio.css:875-894`. The hide now keys on `data-take-card` only, so if the words were hidden again the test would fail.
- **P3-R1-02: confirmed.**
  - `tests/a2-a11y.spec.ts` scans the Player's Reading options dialog.
  - The scope (five product routes, `/classic` excluded) is stated in the judge's header and in contract A5.
- **P3-R1-03: confirmed.**
  - `TableScroller` (`src/components/protocol/ProtocolPage.tsx:534-569`) sets `role`, `aria-label` and `tabIndex=0` only while `scrollWidth > clientWidth + 1`. So the table takes no Tab stop on desktop.
- **P3-R2-01: confirmed.** `agent_docs/decisions.md` now has a follow-up entry (diff lines 20–22) saying the scroller is a region with a Tab stop only while it actually scrolls.
- **P3-R2-02: confirmed.**
  - Both `ReadThis` (`src/components/studio/ToolPanels.tsx:126-142`) and `TableScroller` now measure again after `document.fonts.ready` and on every `loadingdone` event, as well as on resize.
  - A `live` flag stops a late `ready` callback from setting state after unmount, and the `loadingdone` listener is removed in cleanup.
  - `ReadThis` re-runs this effect when `words` changes.
- **P3-R2-03: confirmed.**
  - The C6 claim in `ops/mission/idea.lock.json:49` now names the product routes and puts `/classic` out of scope.
  - The new sum for `idea.lock.json` is in `SHA256SUMS`, and amendment A6 is appended to the contract with its new sum.
  - No other C6 text in `ops/` says "every route".

### Rest of the change: checked and sound
- **Landscape take, card closed:** the head row, status line and progress bar it hides contain no controls and no live regions (`Stage.tsx:113-147`, `246-270`). The textarea stays focusable, so long words can still be scrolled from the keyboard.
- **New ARIA:** `role="region"` is allowed on a `<p>`. The region's name matches what T19 waits for (`/The words to read/`).
- **Player:** axe is injected by the test only, from `node_modules`. Nothing in the Player changed, so it makes no new third-party requests.
- **Untouched:** the codec path, the parental gate, deletion and share codes.

### New finding
- **P3-R3-01 · Low · judgement** · `tests/vision-read-this.spec.ts:11-13` (also `tests/a2-a11y.spec.ts:2`)
  - **Mechanism:** the T19 spec's header still says the card is "never focusable" and the label is "tape-red". Since A4, its assertions require ink red and a Tab stop on overflowing words. The a2-a11y header still opens with "every route", though it narrows the scope a few lines later. These are comments, not assertions, so no test is wrong. But a reader of the header gets the old rule.
  - **Fix:** update the two header lines at the next registered amendment that touches these specs. Not urgent.

```json
{"verdict": "approve", "prior": {"P3-R1-01": "confirmed", "P3-R1-02": "confirmed", "P3-R1-03": "confirmed", "P3-R2-01": "confirmed", "P3-R2-02": "confirmed", "P3-R2-03": "confirmed"}, "filesRead": ["CLAUDE.md", "ops/mission/contract.md", "ops/mission/plan.lock.json", "ops/mission/idea.lock.json", "ops/mission/claims.json", "ops/mission/judges/required-P3.json", ".a2-review/log.txt", ".a2-review/diff.patch", "ops/mission/reviews/P3/round1/transcript.md", "ops/mission/reviews/P3/round1/dispositions.json", "ops/mission/reviews/P3/round2/transcript.md", "ops/mission/reviews/P3/round2/dispositions.json", "src/components/protocol/ProtocolPage.tsx", "src/components/studio/ToolPanels.tsx", "src/components/studio/Stage.tsx", "src/components/studio/studio.css", "tests/vision-read-this.spec.ts", "tests/a2-a11y.spec.ts", "tests/a2-layout.spec.ts", "agent_docs/decisions.md"], "findings": [{"id": "P3-R3-01", "severity": "low", "file": "tests/vision-read-this.spec.ts", "line": 11, "summary": "T19's header comment still says the READ THIS card is 'never focusable' with a 'tape-red' label, and a2-a11y's header opens with 'every route'; the assertions below say otherwise", "mechanism": "A4 changed T19 to assert the ink-red label and one Tab stop on overflowing words, and A5/A6 narrowed C6 to the product routes, but the header prose of both specs was not updated. Nothing tests the comments, so the suite is unaffected; a reader of the spec header gets the old rule.", "fix": "At the next registered amendment touching these specs, change T19's header to 'focusable only when its words overflow' and 'label ink-red', and a2-a11y line 2 to 'every product route'.", "kind": "judgement"}]}
```
