// Node-side tests for the .storysync container core — no browser needed.
// Exit criterion from PLAN_OF_ATTACK Week 1: pack() → .storysync → unpack()
// → identical manifest + assets.

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
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
import { loadTape, TAPE_NAMES } from "./fixtures/tapes";

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
  test("data URL parser accepts parameterized mimes (Safari: audio/mp4;codecs=mp4a.40.2)", () => {
    const { bytes, mime } = dataUrlToBytes(`data:audio/mp4;codecs=mp4a.40.2;base64,${TINY_WAV_B64}`);
    expect(mime).toBe("audio/mp4");
    expect(bytes.length).toBeGreaterThan(0);
    // Round-trips through a container as an .m4a asset.
    const story: SsyncManifest = {
      version: "2.0",
      metadata: { title: "Safari Take" },
      pages: [{ id: 1, text: { content: "hi", audioUrl: `data:audio/mp4;codecs=mp4a.40.2;base64,${TINY_WAV_B64}`, audioCodec: "aac" } }],
    };
    const restored = loadStorysyncToStory(buildStorysyncFromStory(story));
    expect(restored.pages[0].text?.audioUrl?.startsWith("data:audio/mp4;base64,")).toBe(true);
  });
});

/* ── consent (v2.1 draft) — T04a ─────────────────────────────────────────
 * The Signature layer's consent date is a calendar date (YYYY-MM-DD). Older
 * tapes carry a full ISO timestamp: they keep opening, and the validator says
 * so as a WARN that never blocks (s08). Names here are original, not the
 * reference cast.
 */
test.describe("consent (v2.1 draft)", () => {
  const TIMESTAMP_WARNING = "signature.voiceConsent[0].date is a full timestamp; the v2.1 draft asks for a date";
  const NO_CONSENT_WARNING =
    "a recorded voice is on this tape but signature.voiceConsent is empty; the v2.1 draft says it SHOULD carry one";

  /** One recorded page (WAV fallback, container-relative), consent dated `date`. */
  function recordedTape(date?: string): SsyncManifest {
    return {
      version: "2.0",
      metadata: { title: "Ada's Kite" },
      signature: {
        voiceConsent: [{ voice: "Ada", grantedBy: "parent/guardian", ...(date === undefined ? {} : { date }) }],
      },
      pages: [
        {
          id: 1,
          text: { content: "My kite is red.", audioUrl: "assets/narration-1.wav", audioCodec: "wav" },
        },
      ],
    };
  }

  test("1 · a full timestamp passes with exactly one WARN", () => {
    const result = validateManifest(recordedTape("2026-10-19T18:09:58.123Z"));
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([TIMESTAMP_WARNING]);
  });

  test("2 · a date that is not YYYY-MM-DD passes with a WARN quoting it", () => {
    const result = validateManifest(recordedTape("Oct 19 2026"));
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([
      'signature.voiceConsent[0].date "Oct 19 2026" is not a calendar date (YYYY-MM-DD)',
    ]);
  });

  test("3 · a calendar date, or no date at all, warns about nothing", () => {
    expect(validateManifest(recordedTape("2026-10-19")).warnings).toEqual([]);
    // `date` is optional in the schema.
    expect(validateManifest(recordedTape()).warnings).toEqual([]);
  });

  test("3b · every record is checked, by its own index", () => {
    const tape = recordedTape("2026-10-19");
    tape.signature!.voiceConsent!.push(
      { voice: "Grandpa Theo", grantedBy: "self", date: "2026-10-19T20:00:00Z" },
      { voice: "Ada's big brother", grantedBy: "parent/guardian", date: "19/10/2026" },
    );
    const result = validateManifest(tape);
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([
      "signature.voiceConsent[1].date is a full timestamp; the v2.1 draft asks for a date",
      'signature.voiceConsent[2].date "19/10/2026" is not a calendar date (YYYY-MM-DD)',
    ]);
  });

  test("4 · a recorded voice with no consent record SHOULD carry one; the house tape warns about nothing", () => {
    const noSignature = recordedTape();
    delete noSignature.signature;
    const missing = validateManifest(noSignature);
    expect(missing.ok).toBe(true);
    expect(missing.warnings).toEqual([NO_CONSENT_WARNING]);

    const empty = recordedTape();
    empty.signature = { voiceConsent: [] };
    expect(validateManifest(empty).warnings).toEqual([NO_CONSENT_WARNING]);

    // The house tape has no recorded voice, so it needs no consent record.
    const demoPath = path.join(__dirname, "..", "public", "demo", "brave-little-star.ssync.json");
    const demo = validateManifest(JSON.parse(fs.readFileSync(demoPath, "utf8")));
    expect(demo.errors).toEqual([]);
    expect(demo.warnings).toEqual([]);
  });

  test("5 · a warning never blocks the container: pack and unpack succeed", () => {
    const tape = recordedTape("2026-10-19T18:09:58.123Z");
    const assets = new Map([["assets/narration-1.wav", dataUrlToBytes(`data:audio/wav;base64,${TINY_WAV_B64}`).bytes]]);
    const packed = packStorysync(tape, assets);
    const { manifest } = unpackStorysync(packed);
    // Readers MUST accept the timestamp: it comes back exactly as written.
    expect(manifest).toEqual(tape);
    expect(validateManifest(manifest).warnings).toEqual([TIMESTAMP_WARNING]);
  });

  test("6 · the reference fixture tapes have no errors and no warnings", () => {
    for (const name of TAPE_NAMES) {
      const result = validateManifest(loadTape(name).manifest);
      expect(result.errors, name).toEqual([]);
      expect(result.warnings, name).toEqual([]);
    }
  });

  test("6b · the s08 FAIL line is unchanged and stays an error, not a warning", () => {
    const handEdited = recordedTape("2026-10-19");
    handEdited.pages.push(
      { id: 2, text: { content: "It flew up.", audioUrl: "assets/narration-2.wav", audioCodec: "wav" } },
      { id: 3, text: { content: "Bye, kite!", audioUrl: "assets/narration-3.webm" } },
    );
    const result = validateManifest(handEdited);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      'pages[2].text.audioUrl "assets/narration-3.webm" uses a draft-only codec — published narration must be AAC/M4A (or WAV fallback)',
    ]);
    expect(result.warnings).toEqual([]);
  });

  test("7 · v2.schema.json still parses and documents the consent record", () => {
    const schemaPath = path.join(__dirname, "..", "public", "protocol", "v2.schema.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    const items = schema.properties.signature.properties.voiceConsent.items;
    expect(items.required).toEqual(["voice", "grantedBy"]);
    expect(items.properties.grantedBy.examples).toEqual(["parent/guardian", "self"]);
    expect(items.properties.voice.description).toMatch(/whose voice, as credited/i);
    expect(items.properties.grantedBy.description).toMatch(/who consented/i);
    expect(items.properties.date.description).toMatch(/calendar date of consent, YYYY-MM-DD/i);
    expect(items.properties.date.description).toMatch(/validators warn on timestamps/i);
    // The rule is a warning, not a schema failure: format stays, no pattern.
    expect(items.properties.date.format).toBe("date");
    expect(items.properties.date.pattern).toBeUndefined();
  });
});

/* ── reply (v2.1 draft) — T18 ─────────────────────────────────────────────
 * `signature.replyTo` names the tape this one answers: a reply is a new tape,
 * not a derivative, so it is its own field beside `remixOf`. Names here are
 * original, not the reference cast.
 */
test.describe("reply (v2.1 draft)", () => {
  test("signature.replyTo survives pack → unpack, and the validator says nothing about it", () => {
    const reply: SsyncManifest = {
      version: "2.0",
      metadata: { title: "Thank you, Ada", author: "Grandpa Theo", narrator: "Grandpa Theo" },
      signature: {
        replyTo: "https://storysynchq.vercel.app/read?story=0f1e2d3c4b5a69788796a5b4c3d2e1f0",
        ownership: "© 2026 Grandpa Theo",
        rights: "personal use",
        voiceConsent: [{ voice: "Grandpa Theo", grantedBy: "self", date: "2026-10-19" }],
      },
      pages: [
        {
          id: 1,
          illustration: { url: "assets/page-1.jpg", alt: "A kite over the hill" },
          text: { content: "Thank you for the kite story.", audioUrl: "assets/narration-1.wav", audioCodec: "wav" },
        },
      ],
    };
    const assets = new Map<string, Uint8Array>([
      ["assets/page-1.jpg", dataUrlToBytes(`data:image/jpeg;base64,${TINY_JPEG_B64}`).bytes],
      ["assets/narration-1.wav", dataUrlToBytes(`data:audio/wav;base64,${TINY_WAV_B64}`).bytes],
    ]);

    const { manifest } = unpackStorysync(packStorysync(reply, assets));
    expect(manifest).toEqual(reply);
    expect(manifest.signature?.replyTo).toBe(reply.signature!.replyTo);
    expect(manifest.signature).not.toHaveProperty("remixOf");
    // additive: no new error and no new warning for it
    expect(validateManifest(manifest)).toEqual({ ok: true, errors: [], warnings: [] });

    // the schema documents it beside remixOf, as a plain string
    const schemaPath = path.join(__dirname, "..", "public", "protocol", "v2.schema.json");
    const signature = JSON.parse(fs.readFileSync(schemaPath, "utf8")).properties.signature.properties;
    expect(signature.replyTo.type).toBe("string");
    expect(signature.replyTo.description).toMatch(/share URL or id of the tape this one answers/i);
    expect(signature.replyTo.description).toMatch(/distinct from remixOf/i);
    expect(signature.remixOf.type).toBe("string");
  });
});
