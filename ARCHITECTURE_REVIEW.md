# StorySync — Honest Architecture Review (July 2026)

Same rules as the ListSync audit: decision by decision, including my own misses. The core bet — lightweight web-native format, `.storysync` ZIP + JSON manifest, Web Audio playback — remains validated. But several individual choices were made from research that's now 12-18 months stale, and two genuine misses need fixing before a line of production code is written.

---

## The two real misses

### 🔴 Miss #1 — The MediaRecorder codec matrix (this project's "jiff")

The plan says "record narration in the browser via MediaRecorder, play it back everywhere." Here's what that hides: **Safari records AAC in an MP4 container; Chrome/Android records Opus in WebM.** A story narrated on an Android phone produces WebM/Opus audio that iOS Safari historically won't play in the grandparent's browser — the exact cross-device magic moment the entire POC exists to prove, silently broken for the most common real-world pairing (Android parent → iPhone grandparent, or vice versa).

**Fix**: normalize all narration to **AAC/M4A at publish time** (universal playback target). Two viable paths: ffmpeg.wasm client-side during "Finish my story" (keeps everything local, adds ~30s and a big wasm download) or a Cloudflare Worker/container transcode step at publish (fast, tiny client, audio briefly transits server). Decide in Tape 1, encode into the format spec: `narration` assets in the published `.storysync` are always AAC/M4A. Raw recordings can stay in their native codec as editor drafts only.

### 🔴 Miss #2 — COPPA and children's voice data (missed entirely)

The flagship persona is a 4-year-old recording their voice. Children's voice recordings are **personal information under COPPA**, full stop. The original plan treated privacy as "unguessable URLs, auth later" — that's not a posture, that's a liability. The ListSync review said crash telemetry "conflicts with your positioning"; here it's stronger: any child data leaving the device without a parental gate conflicts with the *law*.

**Fix, designed now even if enforced at beta**: parental gate before any upload/publish (neutral-adult verification screen), a written data policy (what's stored, where, retention, one-tap deletion of a story and all assets), no analytics or third-party trackers in the player, Sentry deferred exactly as in ListSync (local diagnostics first, opt-in later, PII-scrubbed). This also *strengthens* the product story: "your child's voice never goes anywhere without you" is the same trust wedge as ListSync's Keychain pitch.

---

## Stack audit — decision by decision

| Decision | Verdict | July 2026 upgrade |
|---|---|---|
| **`.storysync` = ZIP + JSON manifest** | ✅ Right call | Keep. Swap **jszip → fflate** (smaller, faster, actively maintained, streams well). Manifest versioned from v0 for migrations. |
| **Reveal.js as player foundation** | ⚠️ Honest re-look | It was chosen to speed the POC, but reveal.js is a *presentation* framework: keyboard chrome, plugin system, slide DOM conventions — none serve a full-bleed storybook, and its audio plugin is single-track. A custom pager is ~200 lines next to a Web Audio engine we must write anyway. **Timebox reveal.js to Tape 4's IEQ: if bending it costs more than a day, build the lightweight custom player immediately** rather than "later." The player IS the product. |
| **Howler.js for audio** | ⚠️ Downgrade to optional | Howler shines for one-shot playback; our dual-bus graph (narration + ducked music bed, gain ramps, OfflineAudioContext enhancement) wants **raw Web Audio** with a ~20-line iOS unlock helper. Howler's HTML5-fallback mode can actively fight a custom graph. |
| **Dropzone.js** | 🔴 Stale choice | Dropzone is a 2012-era, DOM-imperative library bolted awkwardly onto React. Worse: drag-and-drop is a *desktop* metaphor — Child Mode is a phone pointed at drawings on the kitchen table. Use **native `<input type="file" accept="image/*" capture="environment">`** as the primary path (opens the camera directly) with **react-dropzone** for desktop drag. This is a UX correction, not just a dependency swap. |
| **React (unpinned/18-era)** | ⚠️ Stale | **React 19** — stable with the compiler, same verdict as ListSync. |
| **Vite 6** | ✅ Fine | Vite 7 (Rolldown) when convenient; not urgent. |
| **Cloudflare R2 + presigned Worker URLs** | ✅ Right call | Keep. Zero egress fees is exactly right for media-heavy share links. Serve published stories via a custom domain on R2/Pages. |
| **ElevenLabs + Soundraw** | ✅ Keep, correctly deferred | Neither is on the POC critical path (voice cloning is Phase 3; music beds are pre-generated tracks in a licensed library folder with `licenses.md` provenance). No change. |
| **Sentry** | ⚠️ Mirror ListSync verdict | Defer. Local `console`/log capture + "export diagnostic bundle" for the POC. Opt-in, PII-scrubbed crash reporting at beta — non-negotiable given children's data in memory at crash time. |
| **25MB size budget** | ✅ Validated | 8 pages × ~350KB WebP + 5 min AAC@96kbps ≈ 7MB. Comfortable headroom; tighten budget to 15MB in the checklist. |
| **"Web-only" distribution** | 💡 Strategic upgrade | Playback **must stay web** — success criterion #5 ("works on any device without installing anything") is the soul of the share link. But the **creator/editor is a natural Tauri 2 app**: same React codebase, desktop download for authors/educators (Professional Mode home), iOS/Android targets from the same code, files and mic access without browser permission friction — and it aligns the whole portfolio with the ListSync stack. Decision now, build later: architect the editor as a plain Vite app with zero server-rendered assumptions so the Tauri wrap in Phase 3 is a packaging exercise, not a rewrite. Code-signing costs (Apple Developer ID $99/yr + Windows cert) go on the Phase 3 budget line, same as ListSync. |

---

## Priority order if you touch five things

1. **Codec normalization to AAC/M4A at publish** — correctness of the signature moment (Tape 1 spec + Tape 3/6 implementation)
2. **COPPA posture: parental gate + deletion + no trackers** — legal floor and trust wedge (Tape 6)
3. **Native camera capture replaces Dropzone as primary input** — the actual child-mode UX (Tape 2)
4. **Raw Web Audio dual-bus, reveal.js timeboxed** — the player is the product (Tape 4)
5. **React 19 + fflate + Vite 7** — hygiene (Tape 0)

All five are folded into the updated CLAUDE.md, PLAN_OF_ATTACK.md, and prompt pack in this bundle.
