/**
 * T12 · liner notes (Node-side, no browser).
 *
 * `src/components/player/liner-notes.ts` reads a manifest and returns the rows
 * the end card's J-card prints, in order: PICTURES, WORDS, VOICE, MUSIC,
 * MADE IN, OWNER, CONSENT. Only what the tape carries; a row with no data is
 * left out; nothing is invented (docs/vision/tickets/T12-end-card-jcard-liner-notes.md).
 *
 * Reference: s06 phone 1 — "LINER NOTES · The Signature layer printed like the
 * card inside a cassette case: who made it, whose voice, and the consent that
 * travels inside the file." CONSENT reads "given by a parent or guardian ·
 * Oct 19, 2026 · written into this tape".
 *
 * Expected strings are literals here, never imported from the source, so the
 * test can fail. Dates are formatted from their UTC calendar parts only: run
 * this file once with `TZ=America/Los_Angeles` too (the evidence notes do).
 */

import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { formatConsentDate, linerNotes, type LinerRow } from "../src/components/player/liner-notes";
import type { SsyncManifest } from "../src/lib/storysync/manifest";
import { GOODNIGHT_MIA, loadTape, TWINKLE } from "./fixtures/tapes";
import { recordedNoConsentTape, silentWavDataUrl, twoVoiceConsentTape } from "./fixtures/reader-tapes";

const HOUSE_TAPE_JSON = fs.readFileSync(
  path.join(__dirname, "..", "public", "demo", "brave-little-star.ssync.json"),
  "utf8",
);
const HOUSE_TAPE = JSON.parse(HOUSE_TAPE_JSON) as SsyncManifest;

/** key → value, for terse assertions. */
function asRecord(rows: readonly LinerRow[]): Record<string, string> {
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

function keys(rows: readonly LinerRow[]): string[] {
  return rows.map((r) => r.key);
}

/** A tiny tape built in the test: n pages, each with optional picture / words / voice. */
function tape(
  pages: Array<{ picture?: boolean; words?: string; voice?: boolean; music?: string }>,
  extra: Partial<SsyncManifest> = {},
): SsyncManifest {
  return {
    version: "2.0",
    metadata: { title: "A Test Tape" },
    ...extra,
    pages: pages.map((p, i) => ({
      id: i + 1,
      ...(p.picture ? { illustration: { url: `/demo/images/page${i + 1}.jpg` } } : {}),
      ...(p.words !== undefined || p.voice
        ? {
            text: {
              content: p.words ?? "",
              ...(p.voice ? { audioUrl: silentWavDataUrl(1), audioCodec: "wav" as const } : {}),
            },
          }
        : {}),
      ...(p.music ? { music: p.music } : {}),
    })),
  };
}

/* ───────────────────────────────────────────────────── the two real tapes */

test.describe("T12 · liner notes · the tapes the reel prints", () => {
  test("Twinkle reads, verbatim, as the s06 J-card (what the tape carries)", () => {
    const rows = linerNotes(loadTape("twinkle").story);
    expect(keys(rows)).toEqual(["PICTURES", "WORDS", "VOICE", "MUSIC", "OWNER", "CONSENT"]);
    expect(asRecord(rows)).toEqual({
      PICTURES: "5 pictures",
      WORDS: "35 words on 5 pages",
      VOICE: "Mia",
      MUSIC: "Wonder",
      OWNER: "© 2026 Mia, age 4 — with Mom · personal use",
      CONSENT: "given by a parent or guardian · Oct 19, 2026 · written into this tape",
    });
    // the narrator is the fixture's own, not a guess from the byline
    expect(TWINKLE.narrator).toBe("Mia");
    // the MUSIC row also carries the moods themselves, for the mood tag
    expect(rows.find((r) => r.key === "MUSIC")?.moods).toEqual(["Wonder"]);
  });

  test("the house tape: counted from its own JSON, read by the browser voice, three moods, no signature rows", () => {
    // Re-count from the JSON, independently of the module.
    const pages = HOUSE_TAPE.pages;
    const pictures = pages.filter((p) => (p.illustration?.url ?? "").trim() !== "").length;
    const perPage = pages.map((p) => (p.text?.content ?? "").trim().split(/\s+/).filter(Boolean).length);
    const words = perPage.reduce((a, b) => a + b, 0);
    const pagesWithWords = perPage.filter((n) => n > 0).length;
    expect(pictures).toBe(7);
    expect(words).toBe(184);
    expect(pagesWithWords).toBe(8);

    const rows = linerNotes(HOUSE_TAPE);
    expect(keys(rows)).toEqual(["PICTURES", "WORDS", "VOICE", "MUSIC"]);
    expect(asRecord(rows)).toEqual({
      PICTURES: `${pictures} pictures`,
      WORDS: `${words} words on ${pagesWithWords} pages`,
      VOICE: "Read by the browser voice",
      // wonder → adventure → "peaceful" (a v1 track whose mood is calm)
      MUSIC: "Wonder · Adventure · Calm",
    });
    expect(rows.find((r) => r.key === "MUSIC")?.moods).toEqual(["Wonder", "Adventure", "Calm"]);
  });

  test("Grandma's reply: an adult's own voice reads in the speaker's words", () => {
    const rows = asRecord(linerNotes(loadTape("goodnight-mia").story));
    expect(GOODNIGHT_MIA.signature.voiceConsent?.[0]?.grantedBy).toBe("self");
    expect(rows.CONSENT).toBe(
      "given by the speaker, for their own voice · Oct 19, 2026 · written into this tape",
    );
    expect(rows.VOICE).toBe("Grandma Rose");
    expect(rows.PICTURES).toBe("1 picture");
    expect(rows.OWNER).toBe("© 2026 Grandma Rose · personal use");
  });
});

/* ──────────────────────────────────────────────────────────── CONSENT */

test.describe("T12 · liner notes · CONSENT", () => {
  test("two voices → two lines, each led by the voice's name", () => {
    const row = linerNotes(twoVoiceConsentTape).find((r) => r.key === "CONSENT");
    expect(row?.value.split("\n")).toEqual([
      "Ada, age 5: given by a parent or guardian · Oct 20, 2026 · written into this tape",
      "Grandpa Joe: given by the speaker, for their own voice · Oct 21, 2026 · written into this tape",
    ]);
  });

  test("a legacy ISO timestamp prints its date part", () => {
    const story = loadTape("twinkle").story;
    const legacy: SsyncManifest = {
      ...story,
      signature: {
        ...story.signature,
        voiceConsent: [{ voice: "Mia, age 4 — with Mom", grantedBy: "parent/guardian", date: "2026-10-19T23:40:00.000Z" }],
      },
    };
    expect(asRecord(linerNotes(legacy)).CONSENT).toBe(
      "given by a parent or guardian · Oct 19, 2026 · written into this tape",
    );
  });

  test("any other grantedBy is printed verbatim; the conventional ones match loosely", () => {
    const base = tape([{ words: "Hello there.", voice: true }]);
    const withGrant = (grantedBy: string): string | undefined =>
      asRecord(
        linerNotes({ ...base, signature: { voiceConsent: [{ voice: "Bo", grantedBy, date: "2026-03-04" }] } }),
      ).CONSENT;
    expect(withGrant("the school, with a signed form")).toBe(
      "given by the school, with a signed form · Mar 4, 2026 · written into this tape",
    );
    expect(withGrant(" Parent / Guardian ")).toBe(
      "given by a parent or guardian · Mar 4, 2026 · written into this tape",
    );
    expect(withGrant("SELF")).toBe("given by the speaker, for their own voice · Mar 4, 2026 · written into this tape");
  });

  test("a recorded voice with no record says so; no voice and no record → no row", () => {
    const recorded = asRecord(linerNotes(recordedNoConsentTape));
    expect(recorded.CONSENT).toBe("No consent record in this tape");
    expect(recorded.VOICE).toBe("A recorded voice");

    const unrecorded = linerNotes(tape([{ picture: true, words: "Just words." }]));
    expect(keys(unrecorded)).not.toContain("CONSENT");
  });

  test("the CONSENT row also carries its lines as fields, so the card never re-parses the text (round 2)", () => {
    // one record: no voice lead-in, the date as printed, the tail
    const twinkle = linerNotes(loadTape("twinkle").story).find((r) => r.key === "CONSENT");
    expect(twinkle?.lines).toEqual([
      { granted: "given by a parent or guardian", date: "Oct 19, 2026", tail: "written into this tape" },
    ]);

    // several records: each line names its voice
    const two = linerNotes(twoVoiceConsentTape).find((r) => r.key === "CONSENT");
    expect(two?.lines).toEqual([
      { voice: "Ada, age 5", granted: "given by a parent or guardian", date: "Oct 20, 2026", tail: "written into this tape" },
      {
        voice: "Grandpa Joe",
        granted: "given by the speaker, for their own voice",
        date: "Oct 21, 2026",
        tail: "written into this tape",
      },
    ]);

    // a record with no date has no date field (not an empty string)
    const undated = linerNotes({
      ...tape([{ words: "Hi", voice: true }]),
      signature: { voiceConsent: [{ voice: "Bo", grantedBy: "parent/guardian" }] },
    }).find((r) => r.key === "CONSENT");
    expect(undated?.lines).toEqual([{ granted: "given by a parent or guardian", tail: "written into this tape" }]);

    // "No consent record in this tape" is a statement, not a record: no lines
    const none = linerNotes(recordedNoConsentTape).find((r) => r.key === "CONSENT");
    expect(none?.value).toBe("No consent record in this tape");
    expect(none?.lines).toBeUndefined();

    // only CONSENT carries lines
    for (const row of linerNotes(loadTape("twinkle").story)) {
      if (row.key !== "CONSENT") expect(row.lines, row.key).toBeUndefined();
    }
  });

  test("an empty signature leaves OWNER and CONSENT out", () => {
    const rows = linerNotes(tape([{ picture: true, words: "A page." }], { signature: {} }));
    expect(keys(rows)).not.toContain("OWNER");
    expect(keys(rows)).not.toContain("CONSENT");
    // ownership alone, rights alone
    expect(asRecord(linerNotes(tape([{ words: "x" }], { signature: { ownership: "© 2026 Us" } }))).OWNER).toBe(
      "© 2026 Us",
    );
    expect(asRecord(linerNotes(tape([{ words: "x" }], { signature: { rights: "personal use" } }))).OWNER).toBe(
      "personal use",
    );
  });
});

/* ──────────────────────────────────────────────────── the other rows */

test.describe("T12 · liner notes · counts, voice, music, made in", () => {
  test("singular and plural, and rows with nothing to say are left out", () => {
    expect(asRecord(linerNotes(tape([{ picture: true, words: "Hello" }])))).toMatchObject({
      PICTURES: "1 picture",
      WORDS: "1 word on 1 page",
    });
    // words on two of three pages; pictures on none
    const rows = linerNotes(tape([{ words: "One two" }, { words: "three" }, {}]));
    expect(asRecord(rows).WORDS).toBe("3 words on 2 pages");
    expect(keys(rows)).not.toContain("PICTURES");
    // a picture book with no words and no voice: nothing is read, so no VOICE and no WORDS
    const silent = linerNotes(tape([{ picture: true }, { picture: true }]));
    expect(keys(silent)).toEqual(["PICTURES", "MUSIC"]);
  });

  test("MUSIC: distinct moods in page order, or a quiet tape", () => {
    const rows = linerNotes(
      tape([
        { words: "a", music: "calm" },
        { words: "b", music: "Hush" },
        { words: "c", music: "calm" },
        { words: "d" },
        { words: "e", music: "Rain" },
      ]),
    );
    const music = rows.find((r) => r.key === "MUSIC");
    expect(music?.value).toBe("Calm · Hush · Rain");
    expect(music?.moods).toEqual(["Calm", "Hush", "Rain"]);

    const quiet = linerNotes(tape([{ words: "a" }, { words: "b" }])).find((r) => r.key === "MUSIC");
    expect(quiet?.value).toBe("No music — a quiet tape");
    expect(quiet?.moods).toEqual([]);
  });

  test("VOICE: the narrator when recorded; never a person's name on a browser-read tape", () => {
    const named = tape([{ words: "Hi", voice: true }], { metadata: { title: "T", narrator: "  Ada  " } });
    expect(asRecord(linerNotes(named)).VOICE).toBe("Ada");
    const unrecorded = tape([{ words: "Hi" }], { metadata: { title: "T", narrator: "Ada" } });
    expect(asRecord(linerNotes(unrecorded)).VOICE).toBe("Read by the browser voice");
  });

  test("MADE IN is never printed: no tape carries a making time (M2-PRD OQ 3)", () => {
    for (const story of [loadTape("twinkle").story, loadTape("goodnight-mia").story, HOUSE_TAPE]) {
      expect(keys(linerNotes(story))).not.toContain("MADE IN");
    }
  });
});

/* ───────────────────────────────────────────────────────── the date */

test.describe("T12 · liner notes · dates read the calendar, not the clock", () => {
  test(`"YYYY-MM-DD" formats as "Mon D, YYYY" whatever the machine's timezone (TZ=${process.env.TZ ?? "unset"})`, () => {
    expect(formatConsentDate("2026-10-19")).toBe("Oct 19, 2026");
    // the first and last day of a year are where a local-time parse slips a day
    expect(formatConsentDate("2026-01-01")).toBe("Jan 1, 2026");
    expect(formatConsentDate("2026-12-31")).toBe("Dec 31, 2026");
    expect(formatConsentDate("2026-10-19T00:30:00-07:00")).toBe("Oct 19, 2026");
    expect(formatConsentDate("2026-10-19T23:59:59Z")).toBe("Oct 19, 2026");
  });

  test("a date that is not a calendar date is printed as the tape wrote it", () => {
    expect(formatConsentDate("2026-02-31")).toBe("2026-02-31");
    expect(formatConsentDate(" last spring ")).toBe("last spring");
    expect(formatConsentDate("")).toBe("");
  });

  test("a record with no date leaves the date out", () => {
    const rows = asRecord(
      linerNotes({
        ...tape([{ words: "Hi", voice: true }]),
        signature: { voiceConsent: [{ voice: "Bo", grantedBy: "parent/guardian" }] },
      }),
    );
    expect(rows.CONSENT).toBe("given by a parent or guardian · written into this tape");
  });
});
