// T09a · The deck chip's three sounds, as words (Node, pure).
//
// Reference: s02 — the deck chip says "VOICE · Storyteller (browser voice)",
// "MELODY · Wonder, 12 dB under the voice", "CHIME · next turn in 0:03", and the
// right page ends with "next page in 3 s · turn cue ready". s05 — on a recorded
// tape the voice is the narrator's name.
//
// The seam: src/components/player/deck-status.ts maps (page, manifest, live
// flags, the engine's duck depth) → the three row strings and the foot line.
// It reads only the manifest and the flags it is handed: nothing is counted,
// nothing is stored.

import { test, expect } from "@playwright/test";
import {
  deckStatus,
  formatCountdown,
  type DeckFlags,
  type DeckManifest,
  type DeckPage,
} from "../src/components/player/deck-status";
import { DUCK_DEPTH_DB } from "../src/lib/audio/engine";

/** A playing, unpaused tape with music on and live, sound working, speech present. */
const LIVE: DeckFlags = {
  narrating: false,
  paused: false,
  musicOn: true,
  musicLive: true,
  audioOk: true,
  speechAvailable: true,
  holdRemainingS: null,
  holdTotalS: 3,
};

const flags = (patch: Partial<DeckFlags> = {}): DeckFlags => ({ ...LIVE, ...patch });

const RECORDED: DeckPage = {
  text: { content: "I was scared of the dark.", audioUrl: "data:audio/wav;base64,AAAA" },
  music: "Wonder",
};
const WORDS: DeckPage = { text: { content: "Every night, she watched the world below." }, music: "wonder" };
const PICTURE_ONLY: DeckPage = { text: { content: "   " }, music: "wonder" };
const SILENT_PAGE: DeckPage = { text: { content: "Then nobody made a sound at all." } };

const tape = (patch: Partial<DeckManifest> = {}): DeckManifest => ({
  metadata: {},
  settings: { autoPlay: true, pageTurnSound: true },
  ...patch,
});
const NARRATED = tape({ metadata: { narrator: "Mia" } });

test.describe("deck status · VOICE (node)", () => {
  test("a recorded voice is the narrator's name, or 'Recorded voice' when the tape names nobody", () => {
    expect(deckStatus(RECORDED, NARRATED, flags(), DUCK_DEPTH_DB).voice).toBe("VOICE · Mia");
    expect(deckStatus(RECORDED, tape(), flags(), DUCK_DEPTH_DB).voice).toBe("VOICE · Recorded voice");
    // a blank narrator is no name
    expect(
      deckStatus(RECORDED, tape({ metadata: { narrator: "   " } }), flags(), DUCK_DEPTH_DB).voice,
    ).toBe("VOICE · Recorded voice");
    // the recording wins over the device: no speech needed to play a clip
    expect(deckStatus(RECORDED, NARRATED, flags({ speechAvailable: false }), DUCK_DEPTH_DB).voice).toBe(
      "VOICE · Mia",
    );
  });

  test("words with no recording are the browser voice, or words only when this device has no speech", () => {
    expect(deckStatus(WORDS, tape(), flags(), DUCK_DEPTH_DB).voice).toBe(
      "VOICE · Storyteller (browser voice)",
    );
    // a narrator on the tape does not name the browser voice
    expect(deckStatus(WORDS, NARRATED, flags(), DUCK_DEPTH_DB).voice).toBe(
      "VOICE · Storyteller (browser voice)",
    );
    expect(deckStatus(WORDS, tape(), flags({ speechAvailable: false }), DUCK_DEPTH_DB).voice).toBe(
      "VOICE · Words only",
    );
  });

  test("a page with no words says so", () => {
    expect(deckStatus(PICTURE_ONLY, tape(), flags(), DUCK_DEPTH_DB).voice).toBe(
      "VOICE · No words on this page",
    );
    expect(deckStatus({}, tape(), flags(), DUCK_DEPTH_DB).voice).toBe("VOICE · No words on this page");
    expect(deckStatus(undefined, tape(), flags(), DUCK_DEPTH_DB).voice).toBe(
      "VOICE · No words on this page",
    );
  });
});

test.describe("deck status · MELODY (node)", () => {
  test("a live bed is its mood, the engine's duck depth under the voice", () => {
    expect(deckStatus(WORDS, tape(), flags(), DUCK_DEPTH_DB).melody).toBe(
      "MELODY · Wonder, 12 dB under the voice",
    );
    // the number is the engine's, rounded: never a literal
    expect(DUCK_DEPTH_DB).toBeGreaterThan(12);
    expect(DUCK_DEPTH_DB).toBeLessThan(12.1);
    expect(deckStatus(WORDS, tape(), flags(), 9.6).melody).toBe("MELODY · Wonder, 10 dB under the voice");
    expect(deckStatus(WORDS, tape(), flags(), 6.02).melody).toBe("MELODY · Wonder, 6 dB under the voice");
    // the page's own mood, through the shared vocabulary
    const hush: DeckPage = { text: { content: "Shh." }, music: { crossfade: "hush", duration: "4s" } };
    expect(deckStatus(hush, tape(), flags(), DUCK_DEPTH_DB).melody).toBe(
      "MELODY · Hush, 12 dB under the voice",
    );
  });

  test("music off, no music on the page, no sound on this device", () => {
    expect(deckStatus(WORDS, tape(), flags({ musicOn: false, musicLive: false }), DUCK_DEPTH_DB).melody).toBe(
      "MELODY · off",
    );
    expect(deckStatus(SILENT_PAGE, tape(), flags({ musicLive: false }), DUCK_DEPTH_DB).melody).toBe(
      "MELODY · none on this page",
    );
    expect(deckStatus(WORDS, tape(), flags({ audioOk: false, musicLive: false }), DUCK_DEPTH_DB).melody).toBe(
      "MELODY · no sound on this device",
    );
    // no sound at all outranks everything; the listener's off outranks the page
    expect(
      deckStatus(SILENT_PAGE, tape(), flags({ audioOk: false, musicOn: false, musicLive: false }), DUCK_DEPTH_DB)
        .melody,
    ).toBe("MELODY · no sound on this device");
    expect(
      deckStatus(SILENT_PAGE, tape(), flags({ musicOn: false, musicLive: false }), DUCK_DEPTH_DB).melody,
    ).toBe("MELODY · off");
  });

  test("a bed that is not playing never claims to duck", () => {
    expect(deckStatus(WORDS, tape(), flags({ musicLive: false }), DUCK_DEPTH_DB).melody).toBe("MELODY · Wonder");
  });
});

test.describe("deck status · CHIME (node)", () => {
  test("the tape's own settings first: cue off, then a tape that never turns itself", () => {
    const noCue = tape({ settings: { autoPlay: true, pageTurnSound: false } });
    expect(deckStatus(WORDS, noCue, flags({ holdRemainingS: 2 }), DUCK_DEPTH_DB).chime).toBe("CHIME · off");
    expect(deckStatus(WORDS, noCue, flags({ paused: true }), DUCK_DEPTH_DB).chime).toBe("CHIME · off");
    const manual = tape({ settings: { autoPlay: false, pageTurnSound: true } });
    expect(deckStatus(WORDS, manual, flags({ narrating: true }), DUCK_DEPTH_DB).chime).toBe(
      "CHIME · when you turn the page",
    );
    // a v1 tape with no settings turns itself, with the cue on
    expect(deckStatus(WORDS, { metadata: {} }, flags({ holdRemainingS: 3 }), DUCK_DEPTH_DB).chime).toBe(
      "CHIME · next turn in 0:03",
    );
  });

  test("paused, speaking, then the hold counting down to the turn", () => {
    expect(deckStatus(WORDS, tape(), flags({ paused: true, narrating: true }), DUCK_DEPTH_DB).chime).toBe(
      "CHIME · paused",
    );
    expect(deckStatus(WORDS, tape(), flags({ narrating: true }), DUCK_DEPTH_DB).chime).toBe(
      "CHIME · after the voice",
    );
    // the beat before a voice starts is still "after the voice"
    expect(deckStatus(RECORDED, NARRATED, flags(), DUCK_DEPTH_DB).chime).toBe("CHIME · after the voice");
    expect(deckStatus(WORDS, tape(), flags({ holdRemainingS: 4 }), DUCK_DEPTH_DB).chime).toBe(
      "CHIME · next turn in 0:04",
    );
    expect(deckStatus(WORDS, tape(), flags({ holdRemainingS: 2.2 }), DUCK_DEPTH_DB).chime).toBe(
      "CHIME · next turn in 0:03",
    );
    // a page with no voice to wait for counts its whole hold
    expect(deckStatus(PICTURE_ONLY, tape(), flags({ holdTotalS: 5 }), DUCK_DEPTH_DB).chime).toBe(
      "CHIME · next turn in 0:05",
    );
    expect(
      deckStatus(WORDS, tape(), flags({ speechAvailable: false, holdTotalS: 3 }), DUCK_DEPTH_DB).chime,
    ).toBe("CHIME · next turn in 0:03");
  });

  test("the last page ends the tape: no turn, no chime to promise", () => {
    expect(deckStatus(WORDS, tape(), flags({ lastPage: true, holdRemainingS: 2 }), DUCK_DEPTH_DB).chime).toBe(
      "CHIME · last page",
    );
    expect(deckStatus(WORDS, tape(), flags({ lastPage: true, narrating: true }), DUCK_DEPTH_DB).chime).toBe(
      "CHIME · last page",
    );
    // a listener's own "next" on the last page is still a turn the cue marks
    const manual = tape({ settings: { autoPlay: false, pageTurnSound: true } });
    expect(deckStatus(WORDS, manual, flags({ lastPage: true }), DUCK_DEPTH_DB).chime).toBe(
      "CHIME · when you turn the page",
    );
  });
});

test.describe("deck status · the countdown and the foot line (node)", () => {
  test("countdown is ⌈remaining⌉ whole seconds as m:ss", () => {
    expect(formatCountdown(4.2)).toBe("0:05");
    expect(formatCountdown(3.0)).toBe("0:03");
    expect(formatCountdown(0.4)).toBe("0:01");
    expect(formatCountdown(61)).toBe("1:01");
    expect(formatCountdown(600)).toBe("10:00");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-1)).toBe("0:00");
    expect(formatCountdown(Number.NaN)).toBe("0:00");
  });

  test("the foot line: the page's hold, counting down during it, cue ready or off", () => {
    expect(deckStatus(WORDS, tape(), flags({ holdTotalS: 3 }), DUCK_DEPTH_DB).foot).toBe(
      "next page in 3 s · turn cue ready",
    );
    expect(deckStatus(WORDS, tape(), flags({ narrating: true, holdTotalS: 4 }), DUCK_DEPTH_DB).foot).toBe(
      "next page in 4 s · turn cue ready",
    );
    expect(
      deckStatus(WORDS, tape(), flags({ holdTotalS: 4, holdRemainingS: 2.4 }), DUCK_DEPTH_DB).foot,
    ).toBe("next page in 3 s · turn cue ready");
    // whole seconds, rounded up
    expect(deckStatus(WORDS, tape(), flags({ holdTotalS: 1.5 }), DUCK_DEPTH_DB).foot).toBe(
      "next page in 2 s · turn cue ready",
    );
    const noCue = tape({ settings: { autoPlay: true, pageTurnSound: false } });
    expect(deckStatus(WORDS, noCue, flags({ holdTotalS: 3 }), DUCK_DEPTH_DB).foot).toBe(
      "next page in 3 s · turn cue off",
    );
    expect(deckStatus(WORDS, tape(), flags({ lastPage: true, holdTotalS: 5 }), DUCK_DEPTH_DB).foot).toBe(
      "the end in 5 s",
    );
  });

  test("no foot line when the tape does not turn its own pages", () => {
    const manual = tape({ settings: { autoPlay: false, pageTurnSound: true } });
    expect(deckStatus(WORDS, manual, flags(), DUCK_DEPTH_DB).foot).toBeNull();
    expect(deckStatus(WORDS, manual, flags({ holdRemainingS: 2 }), DUCK_DEPTH_DB).foot).toBeNull();
  });

  test("the ring's share: empty while the voice speaks and before the hold, the elapsed share during it", () => {
    expect(deckStatus(WORDS, tape(), flags({ narrating: true, holdTotalS: 4 }), DUCK_DEPTH_DB).holdShare).toBe(0);
    expect(deckStatus(WORDS, tape(), flags({ holdTotalS: 4 }), DUCK_DEPTH_DB).holdShare).toBe(0);
    expect(
      deckStatus(WORDS, tape(), flags({ holdTotalS: 4, holdRemainingS: 4 }), DUCK_DEPTH_DB).holdShare,
    ).toBe(0);
    expect(
      deckStatus(WORDS, tape(), flags({ holdTotalS: 4, holdRemainingS: 1 }), DUCK_DEPTH_DB).holdShare,
    ).toBeCloseTo(0.75, 5);
    expect(
      deckStatus(WORDS, tape(), flags({ holdTotalS: 4, holdRemainingS: -1 }), DUCK_DEPTH_DB).holdShare,
    ).toBe(1);
  });

  test("the waveform is lit only while a voice is speaking", () => {
    expect(deckStatus(WORDS, tape(), flags({ narrating: true }), DUCK_DEPTH_DB).speaking).toBe(true);
    expect(deckStatus(WORDS, tape(), flags({ narrating: true, paused: true }), DUCK_DEPTH_DB).speaking).toBe(false);
    expect(deckStatus(WORDS, tape(), flags(), DUCK_DEPTH_DB).speaking).toBe(false);
  });

  test("the status is a pure function of what it is handed", () => {
    const page = { ...WORDS };
    const manifest = tape();
    const input = flags({ holdRemainingS: 2 });
    const snapshot = JSON.stringify({ page, manifest, input });
    const a = deckStatus(page, manifest, input, DUCK_DEPTH_DB);
    const b = deckStatus(page, manifest, input, DUCK_DEPTH_DB);
    expect(a).toEqual(b);
    expect(JSON.stringify({ page, manifest, input })).toBe(snapshot);
  });
});
