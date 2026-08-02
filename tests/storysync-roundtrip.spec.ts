// Node-side tests for the .storysync container core — no browser needed.
// Exit criterion from PLAN_OF_ATTACK Week 1: pack() → .storysync → unpack()
// → identical manifest + assets.

import { test, expect } from "@playwright/test";
import {
  packStorysync,
  unpackStorysync,
  buildStorysyncFromStory,
  loadStorysyncToStory,
  dataUrlToBytes,
  bytesToDataUrl,
  StorysyncError,
} from "../src/lib/storysync/container";
import { SsyncManifest, validateManifest } from "../src/lib/storysync/manifest";

// 1x1 red JPEG and a 44-byte silent WAV header+sample, as fixtures.
const TINY_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";
const TINY_WAV_B64 = "UklGRiYAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQIAAAAAAA==";

function makeStory(): SsyncManifest {
  return {
    version: "2.0",
    metadata: { title: "The Round Trip", author: "Test Kid", created: "2026-08-02T00:00:00Z" },
    settings: { autoPlay: true, pageTurnSound: true },
    pages: [
      {
        id: 1,
        illustration: { url: `data:image/jpeg;base64,${TINY_JPEG_B64}`, alt: "A drawing" },
        text: {
          content: "Once upon a time.",
          audioUrl: `data:audio/wav;base64,${TINY_WAV_B64}`,
          audioCodec: "wav",
        },
        music: "Calm",
      },
      { id: 2, text: { content: "The end." } },
    ],
  };
}

test.describe("storysync container", () => {
  test("pack → unpack round-trips manifest and assets byte-identically", () => {
    const manifest: SsyncManifest = {
      version: "2.0",
      metadata: { title: "Raw Pack" },
      pages: [
        { id: 1, illustration: { url: "assets/page-1.jpg" }, text: { content: "Hi", audioUrl: "assets/narration-1.m4a", audioCodec: "aac" } },
      ],
    };
    const assets = new Map<string, Uint8Array>([
      ["assets/page-1.jpg", dataUrlToBytes(`data:image/jpeg;base64,${TINY_JPEG_B64}`).bytes],
      ["assets/narration-1.m4a", new Uint8Array([0, 1, 2, 3, 42])],
    ]);

    const packed = packStorysync(manifest, assets);
    const { manifest: out, assets: outAssets } = unpackStorysync(packed);

    expect(out).toEqual(manifest);
    expect([...outAssets.keys()].sort()).toEqual([...assets.keys()].sort());
    for (const [path, bytes] of assets) {
      expect(Array.from(outAssets.get(path)!)).toEqual(Array.from(bytes));
    }
  });

  test("story with data URLs → container → story is lossless", () => {
    const story = makeStory();
    const packed = buildStorysyncFromStory(story);
    const restored = loadStorysyncToStory(packed);

    expect(restored.metadata).toEqual(story.metadata);
    expect(restored.pages.length).toBe(2);
    expect(restored.pages[0].text?.content).toBe("Once upon a time.");
    // Media survives byte-identically through the data URL → asset → data URL cycle.
    expect(restored.pages[0].illustration?.url).toBe(story.pages[0].illustration?.url);
    expect(restored.pages[0].text?.audioUrl).toBe(story.pages[0].text?.audioUrl);
    expect(restored.pages[1]).toEqual(story.pages[1]);
  });

  test("published container rejects draft-only narration codecs (webm/opus)", () => {
    const bad: SsyncManifest = {
      version: "2.0",
      metadata: { title: "Bad Codec" },
      pages: [{ id: 1, text: { content: "x", audioUrl: "assets/narration-1.webm" } }],
    };
    const result = validateManifest(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("AAC/M4A");
    expect(() => packStorysync(bad, new Map([["assets/narration-1.webm", new Uint8Array([1])]]))).toThrow(
      StorysyncError
    );
  });

  test("unpack rejects containers with dangling asset references", () => {
    const manifest: SsyncManifest = {
      version: "2.0",
      metadata: { title: "Dangling" },
      pages: [{ id: 1, illustration: { url: "assets/page-1.jpg" } }],
    };
    expect(() => packStorysync(manifest, new Map())).toThrow(/missing assets/i);
  });

  test("unpack rejects non-zip garbage", () => {
    expect(() => unpackStorysync(new Uint8Array([1, 2, 3, 4]))).toThrow(/storysync/i);
  });

  test("data URL helpers round-trip bytes", () => {
    const { bytes, mime } = dataUrlToBytes(`data:audio/wav;base64,${TINY_WAV_B64}`);
    expect(mime).toBe("audio/wav");
    expect(bytesToDataUrl(bytes, mime)).toBe(`data:audio/wav;base64,${TINY_WAV_B64}`);
  });
});
