/**
 * One-tap deletion, every branch (mission P6, P6-R1-02; PRIVACY.md).
 *
 * `pullTapeOut` (src/lib/device-library.ts) sweeps this device's copy first, then runs the
 * cloud half when a cloud is configured, and forgets the tape's draft and reading places only
 * once a copy is really gone. Node-side, with a stand-in localStorage, so the branches that need
 * a configured cloud (which the e2e build has not) are pinned too:
 *
 *   no cloud            the device copy goes; forgotten; "gone"
 *   cloud reached       both go; forgotten; "gone"
 *   cloud unreachable   the device copy still goes and is forgotten; "cloud-unreached", never
 *                       a claim that a cloud copy exists
 *   cloud-only tape, cloud unreachable    nothing removed, nothing forgotten; "kept"
 *   storage refuses the write             nothing forgotten, the cloud not asked; "kept"
 *
 * and what the Read Room says for each (pullOutcomeLine, P6-R2-03): nothing extra when every
 * copy is gone, never a claim that a cloud copy exists when the cloud merely was not reached.
 */

import { expect, test } from "@playwright/test";
import { LIBRARY_KEY, pullOutcomeLine, pullTapeOut } from "../src/lib/device-library";

/** A stand-in `window.localStorage`; `refuseWrites` makes setItem throw like a full or locked store. */
function withStorage(rows: { id: string }[], refuseWrites = false) {
  const store = new Map<string, string>([[LIBRARY_KEY, JSON.stringify(rows)]]);
  const g = globalThis as unknown as { window?: unknown };
  const before = g.window;
  g.window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (refuseWrites) throw new Error("QuotaExceededError");
        store.set(k, v);
      },
    },
  };
  return {
    ids: () => (JSON.parse(store.get(LIBRARY_KEY) ?? "[]") as { id: string }[]).map((r) => r.id),
    restore: () => {
      g.window = before;
    },
  };
}

test.describe("pullTapeOut · one-tap deletion, every branch", () => {
  test("no cloud: the device copy goes and the tape is forgotten", async () => {
    const s = withStorage([{ id: "a" }, { id: "b" }]);
    try {
      let forgotten = 0;
      const out = await pullTapeOut("a", { forgetHere: () => forgotten++ });
      expect(out).toEqual({ kind: "gone" });
      expect(s.ids()).toEqual(["b"]);
      expect(forgotten).toBe(1);
    } finally {
      s.restore();
    }
  });

  test("cloud reached: both halves run, then the tape is forgotten", async () => {
    const s = withStorage([{ id: "a" }]);
    try {
      const order: string[] = [];
      const out = await pullTapeOut("a", {
        forgetHere: () => order.push("forget"),
        cloud: async () => {
          order.push(`cloud (device ids then: ${s.ids().join(",") || "none"})`);
        },
      });
      expect(out).toEqual({ kind: "gone" });
      // the device copy is already gone when the cloud half runs
      expect(order).toEqual(["cloud (device ids then: none)", "forget"]);
    } finally {
      s.restore();
    }
  });

  test("cloud unreachable: the device copy still goes, and nothing claims a cloud copy exists", async () => {
    const s = withStorage([{ id: "a" }, { id: "b" }]);
    try {
      let forgotten = 0;
      const out = await pullTapeOut("a", {
        forgetHere: () => forgotten++,
        cloud: async () => {
          throw new Error("could not reach the cloud library.");
        },
      });
      expect(out).toEqual({ kind: "cloud-unreached", why: "could not reach the cloud library." });
      expect(s.ids()).toEqual(["b"]);
      expect(forgotten, "its draft and places go with the device copy").toBe(1);
    } finally {
      s.restore();
    }
  });

  test("a cloud-only tape whose cloud cannot be reached is kept, and nothing is forgotten", async () => {
    const s = withStorage([{ id: "b" }]);
    try {
      let forgotten = 0;
      const out = await pullTapeOut("a", {
        forgetHere: () => forgotten++,
        cloud: async () => {
          throw new Error("offline");
        },
      });
      expect(out).toEqual({ kind: "kept", why: "offline" });
      expect(s.ids()).toEqual(["b"]);
      expect(forgotten).toBe(0);
    } finally {
      s.restore();
    }
  });

  test("storage that refuses the write keeps the tape, forgets nothing and asks no cloud", async () => {
    const s = withStorage([{ id: "a" }], true);
    try {
      let forgotten = 0;
      let asked = 0;
      const out = await pullTapeOut("a", {
        forgetHere: () => forgotten++,
        cloud: async () => {
          asked++;
        },
      });
      expect(out.kind).toBe("kept");
      expect(s.ids()).toEqual(["a"]);
      expect(forgotten).toBe(0);
      expect(asked).toBe(0);
    } finally {
      s.restore();
    }
  });
});

test.describe("pullOutcomeLine · what the grown-up is told", () => {
  test("every copy gone: no line (the room says Pulled out.)", () => {
    expect(pullOutcomeLine({ kind: "gone" })).toBeNull();
  });

  test("cloud unreached: off this device, and a cloud copy only 'may' remain", () => {
    const line = pullOutcomeLine({ kind: "cloud-unreached", why: "offline" })!;
    expect(line).toBe(
      "Taken off this device. The cloud library could not be reached, so a cloud copy may still be there. offline",
    );
    expect(line, "never asserts a cloud copy exists").not.toMatch(/cloud copy is still|still on the shelf/);
  });

  test("kept: the tape is still on the shelf, with the reason", () => {
    expect(pullOutcomeLine({ kind: "kept", why: "Try again." })).toBe("That tape is still on the shelf. Try again.");
  });
});
