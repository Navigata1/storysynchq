# Decision Log — append only

Format: date · decision · rationale. Newest at the bottom. Never rewrite history;
if a decision is reversed, append the reversal.

---

**2026-07 · Stack re-audit (v2)** — Full decision-by-decision review recorded in
`ARCHITECTURE_REVIEW.md`. Headline verdicts: published narration is always AAC/M4A
(codec matrix miss), COPPA-first privacy posture (parental gate, deletion, zero
trackers), camera-first native capture, raw Web Audio dual-bus player, jszip → fflate.

**2026-08-02 · Apply v2 to the existing Next.js app, not a fresh Vite monorepo** —
StorySyncHQ already ships a working reader/creator/library on Next.js 16 + React 19 +
Supabase, deployed on Vercel. Rebuilding as a monorepo would discard working product to
satisfy a doc written before the app existed. The tape plan's exit criteria are kept;
`packages/core|editor|player` map to `src/lib/storysync`, `StoryCreator`, and
`ImmersiveReader` + `src/lib/audio`. Mapping table added to PLAN_OF_ATTACK.md.

**2026-08-02 · Publish transcode path: client-side WebCodecs + mp4-muxer, WAV fallback** —
The Tape 1 IEQ choice between ffmpeg.wasm and a server transcode step is resolved as
*neither*: ffmpeg.wasm is a ~30 MB download that punishes every publisher, and a server
transcode moves a child's voice through infrastructure we don't need (worse COPPA posture).
Instead: (1) Safari already records AAC/MP4 → passthrough; (2) Chromium exposes WebCodecs
`AudioEncoder` with AAC → decode + re-encode client-side, mux to M4A with mp4-muxer (~10 KB);
(3) anything else falls back to WAV 16 kHz mono — bigger, but universally playable.
Opus/WebM is never written into a published story. Encoded in `docs/format-spec.md` and
`public/protocol/v2.schema.json`.

**2026-08-02 · Recorder mime is negotiated, never hardcoded** — The reader hardcoded
`audio/webm;codecs=opus`, which throws on iOS Safari (recording was simply broken there).
`src/lib/audio/recorder.ts` probes `MediaRecorder.isTypeSupported` in preference order
(mp4 → webm/opus → webm → default) and reports what it actually got.

**2026-08-02 · Images compressed at capture, not at publish** — Raw camera data URLs
(3–10 MB each) blow the ~5 MB localStorage quota after two pages and bloat Supabase rows.
`src/lib/images.ts` downscales to ≤2048px and re-encodes (JPEG q0.82) at upload time,
using `createImageBitmap(..., { imageOrientation: "from-image" })` so EXIF rotation is
baked in. Target ≤ ~350 KB/page per the 15 MB story budget.

**2026-08-02 · Supabase stays; R2 deferred** — The review recommends Cloudflare R2, but
Supabase auth + storage is already wired and working. Swapping storage backends is not on
the POC critical path. R2/presigned-Worker URLs go to the Phase 3 backlog with Tauri.
