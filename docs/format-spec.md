# The `.storysync` Format — SSYNC Protocol v2 Specification

Status: v2.0 · August 2026
Schema twin: [`/public/protocol/v2.schema.json`](../public/protocol/v2.schema.json)
Runtime implementation: [`/src/lib/storysync/`](../src/lib/storysync/)

SSYNC is to storybooks what PDF is to documents: an open format for immersive,
narrated, illustrated, musical reading experiences. It is **not video** — it is
lightweight synchronized stills plus layered audio.

## 1. Container

A `.storysync` file is a **ZIP archive** with this layout:

```
my-story.storysync
├── manifest.json            REQUIRED — SSYNC v2 manifest (UTF-8 JSON)
└── assets/                  All bundled media, flat, referenced by manifest
    ├── cover.jpg
    ├── page-1.jpg
    ├── narration-1.m4a
    ├── page-2.jpg
    ├── narration-2.wav      (fallback codec — see §3)
    └── ...
```

Rules:

- `manifest.json` MUST exist at the archive root and validate against the v2 schema.
- Every `assets/…` path referenced by the manifest MUST exist in the archive.
  A reader MUST reject a container with dangling references.
- Asset entries SHOULD be stored uncompressed (deflate level 0) — media is
  already compressed; recompression wastes time for ~0 gain.
- Readers MUST ignore unknown files in the archive (forward compatibility).
- Unknown manifest fields MUST be ignored, never fatal (forward compatibility).

## 2. Manifest

Top level: `version` (`"2.0"`), `metadata` (requires `title`), optional
`settings`, and `pages[]` (at least one).

A page:

```jsonc
{
  "id": 3,
  "illustration": { "url": "assets/page-3.jpg", "alt": "A drawing of a red boat" },
  "text": {
    "content": "The little boat sailed on.",
    "audioUrl": "assets/narration-3.m4a",   // recorded narration for this page
    "audioCodec": "aac"                      // "aac" | "wav"
  },
  "music": "Calm",                           // mood name for the music bed
  "timing": { "autoPause": "3s" }
}
```

URL fields (`coverImage`, `illustration.url`, `text.audioUrl`) accept either a
container-relative `assets/…` path or an external `https:`/`data:` URL. A
self-contained story (the normal case) uses only `assets/…` paths.

## 3. The published-audio codec rule (normative)

This rule exists because MediaRecorder output differs per browser: Safari
records **AAC/MP4**, Chrome/Android records **Opus/WebM** — and iOS Safari
cannot reliably play Opus/WebM. Without normalization, a story recorded on an
Android phone silently fails on an iPhone: the exact cross-device magic moment
the format exists to deliver.

Therefore, in a **published** `.storysync`:

1. Narration audio **MUST** be AAC-LC in an MP4/M4A container
   (`assets/narration-N.m4a`, `audioCodec: "aac"`). The reference target is
   mono, 48 kHz, ~96 kbps.
2. When the authoring environment cannot encode AAC, narration **MAY** fall
   back to 16-bit PCM WAV, 16 kHz mono (`audioCodec: "wav"`). WAV is larger but
   plays everywhere; it is the *only* permitted fallback.
3. Narration **MUST NOT** be Opus, WebM, or Ogg. Those codecs are valid only in
   unpublished editor drafts that never leave the authoring device.

Normalization happens at **publish time** ("Finish my story"), client-side —
a child's voice is never sent to a server just to be transcoded. The reference
ladder (implemented in `src/lib/audio/transcode.ts`):

| Source recording | Action |
|---|---|
| AAC/MP4 (Safari) | passthrough — already compliant |
| Opus/WebM (Chromium), AAC encoder available (WebCodecs) | decode → AAC-LC 48 kHz mono 96 kbps → M4A |
| Opus/WebM, no AAC encoder (e.g. Firefox) | decode → WAV 16 kHz mono |

## 4. Playback model

- **Two audio buses**: narration (foreground) and music bed (background). While
  narration plays, the music bed ducks approximately −12 dB with smooth gain
  ramps (~0.6 s), restoring afterward — the cassette-book sound.
- **Tap to Begin**: browsers (iOS Safari especially) block audio before a user
  gesture. Players MUST gate playback behind an initial tap and resume the
  audio context inside that gesture.
- **Auto-advance**: when a page's narration ends, wait `timing.autoPause`
  (scaled by `settings.accessibility.timingMultiplier`), optionally play a
  page-turn cue, then advance. Manual navigation re-syncs narration to the new
  page.
- **No text-to-speech requirement**: if `text.audioUrl` is absent, a player MAY
  synthesize narration from `text.content` (the reference reader uses the Web
  Speech API) or display text silently.

## 5. Size budget

Reference budget for an 8-page story with ~5 minutes of narration: **≤ 15 MB**.
Illustrations SHOULD be ≤ 2048 px on the long edge, JPEG/WebP, ~350 KB each.
At AAC 96 kbps, 5 minutes of narration is ≈ 3.6 MB.

## 6. Privacy posture (normative for the reference implementation)

- Publishing (upload/share) is gated behind a **parental gate** — a neutral
  adult-verification interaction a pre-reader cannot pass by tapping through.
- Deleting a story deletes **all** of it: manifest, images, narration, share
  code. No soft-delete of children's voice data.
- Players ship **zero third-party trackers**. See [`/PRIVACY.md`](../PRIVACY.md).

## 7. Versioning

- `1.0` — bare JSON document (`.ssync.json`), external/data-URL media only.
  Readers keep accepting v1 documents.
- `2.0` — this spec: ZIP container, bundled assets, codec rule, `audioCodec`.
- Future versions bump `version` and migrate in `src/lib/storysync/`.
