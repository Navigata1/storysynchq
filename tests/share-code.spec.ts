// T02 · 128-bit share codes (32 hex), old codes still resolve.
//
// Reference: s05, the stage callout "THE LINK, HONESTLY" — cloud share codes
// were 16 hex characters (64-bit) while PRIVACY.md rule 4 promised 128-bit.
// One minting function now makes every link, on the device and in the cloud.
//
// Node side (no browser):
//   1. mintShareCode() is 32 lowercase hex from crypto.getRandomValues over
//      16 bytes; 10 000 calls give 10 000 codes
//   2. with no getRandomValues it throws — it never weakens to Date/Math.random;
//      every missing-CSPRNG case (absent or throwing) is a ShareCodeError
//   3. shareLinkRow(id) is the exact row the cloud insert writes
//   4. migration 002 only changes the column default (no row is touched)
//   5. no gallery query in src/, and cloud-storage.ts has no private minter
//   +  shareBook (device path, crypto stubbed) gives the ticket's exact
//      CloudError sentence and keeps no code; an existing 16-hex code is kept
// E2E on the device-library path (CI has no Supabase):
//   6. a tape kept under a 16-hex code from before still opens at /read?story=
//      (a guard against a future length check)
//   +  a browser with no getRandomValues publishes with no link, never a weak one
//   7. a publish prints story=<32 hex>; the PRIVATE LINK field never scrolls the
//      page sideways (1180×820, 375×812); Copy writes the whole URL

import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { mintShareCode, shareLinkRow, ShareCodeError } from "../src/lib/share-code";
import { CloudError, shareBook } from "../src/lib/cloud-storage";
import { isSupabaseConfigured } from "../src/lib/supabase";
import { LIBRARY_KEY, restoreDraft, seedDeviceLibrary, seedStudioDraft } from "./fixtures/helpers";
import { REPO_ROOT, TWINKLE } from "./fixtures/tapes";

const HEX_128 = /^[0-9a-f]{32}$/;
const MIGRATION_002 = path.join(REPO_ROOT, "supabase", "migrations", "002_share_code_128bit.sql");
const SRC_DIR = path.join(REPO_ROOT, "src");
const CLOUD_STORAGE = path.join(SRC_DIR, "lib", "cloud-storage.ts");
const SUPABASE = path.join(SRC_DIR, "lib", "supabase.ts");

/** A fresh 64-bit code, shaped like every cloud link made before this change. */
const LEGACY_CODE = "9b2d4e6f8a0c1e3d";

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx?|jsx?|mjs|cjs)$/.test(entry.name) ? [full] : [];
  });
}

/** Replace one global; returns the function that puts the original back. */
function swapGlobal(name: "crypto" | "window", value: unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  return () => {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete (globalThis as Record<string, unknown>)[name];
  };
}

/** Swap `globalThis.crypto` for one test, restoring the real one whatever happens. */
function withCrypto<T>(replacement: unknown, run: () => T): T {
  const restore = swapGlobal("crypto", replacement);
  try {
    return run();
  } finally {
    restore();
  }
}

/** A CSPRNG that is there but fails when asked (a broken polyfill, a locked-down runtime). */
const BROKEN_CSPRNG = {
  getRandomValues(): never {
    throw new TypeError("getRandomValues: not allowed here");
  },
};

/** The sentence `shareBook` must give when no private link can be made safely (ticket T02). */
const UNSAFE_LINK =
  "Making the link: this browser cannot make a private link safely. Download the .storysync file instead.";

/** `window.localStorage` for Node, holding the device library `cloud-storage.ts` reads. */
function memoryLibrary(rows: Array<{ id: string; shareCode?: string }>) {
  const store = new Map<string, string>([[LIBRARY_KEY, JSON.stringify(rows)]]);
  return {
    window: {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, String(value)),
        removeItem: (key: string) => void store.delete(key),
      },
    },
    rows: () => JSON.parse(store.get(LIBRARY_KEY) || "[]") as Array<{ id: string; shareCode?: string }>,
  };
}

/**
 * `shareBook` takes the device path only when no cloud client is bound. The
 * test process loads no `.env*` file and CI sets no Supabase variables, so
 * `./supabase` binds `null` on import; say so loudly if that ever changes.
 */
function expectDevicePath(): void {
  expect(
    isSupabaseConfigured(),
    "these Node tests need NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY unset (the device path)",
  ).toBe(false);
}

/* --------------------------------------------------------------- 1 · 2 · 3 */

test.describe("share code · one minting function, 128 bits", () => {
  test("mintShareCode is 32 lowercase hex, and 10 000 calls give 10 000 codes", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 10_000; i += 1) {
      const code = mintShareCode();
      expect(code).toMatch(HEX_128);
      codes.add(code);
    }
    expect(codes.size).toBe(10_000);
  });

  test("the code is the 16 bytes crypto.getRandomValues gave, as hex", () => {
    const requested: number[] = [];
    const fake = {
      getRandomValues<T extends ArrayBufferView | null>(array: T): T {
        const bytes = array as unknown as Uint8Array;
        requested.push(bytes.length);
        bytes.forEach((_, i) => (bytes[i] = i * 17));
        return array;
      },
    };
    const code = withCrypto(fake, () => mintShareCode());
    expect(requested).toEqual([16]);
    expect(code).toBe("00112233445566778899aabbccddeeff");
  });

  test("without crypto.getRandomValues it throws instead of weakening", () => {
    // An object without getRandomValues (the ticket's case) …
    expect(() => withCrypto({}, () => mintShareCode())).toThrow();
    expect(() => withCrypto({}, () => shareLinkRow("abc"))).toThrow();
    // … and no crypto at all.
    expect(() => withCrypto(undefined, () => mintShareCode())).toThrow();
    // The real one is back.
    expect(typeof globalThis.crypto.getRandomValues).toBe("function");
    expect(mintShareCode()).toMatch(HEX_128);
  });

  test("every way the CSPRNG can be missing is a ShareCodeError, so shareBook can name it", () => {
    expect(() => withCrypto({}, () => mintShareCode())).toThrow(ShareCodeError);
    expect(() => withCrypto(undefined, () => mintShareCode())).toThrow(ShareCodeError);
    // There, but failing when asked: still no secure bytes, so still no code.
    expect(() => withCrypto(BROKEN_CSPRNG, () => mintShareCode())).toThrow(ShareCodeError);
    expect(() => withCrypto(BROKEN_CSPRNG, () => shareLinkRow("abc"))).toThrow(ShareCodeError);
  });

  test("shareLinkRow is the row the cloud insert writes: the id and a fresh 32-hex code", () => {
    const row = shareLinkRow("abc");
    expect(row).toEqual({ storybook_id: "abc", share_code: expect.stringMatching(HEX_128) });
    expect(Object.keys(row).sort()).toEqual(["share_code", "storybook_id"]);
    expect(shareLinkRow("abc").share_code).not.toBe(row.share_code);
  });
});

/* -------------------------------------------------------------------- 4 · 5 */

test.describe("share code · the migration and the sources", () => {
  test("migration 002 changes the column default to 16 bytes and touches no row", () => {
    expect(fs.existsSync(MIGRATION_002), "supabase/migrations/002_share_code_128bit.sql").toBe(true);
    const sql = fs.readFileSync(MIGRATION_002, "utf8");

    expect(sql).toContain("ALTER COLUMN share_code SET DEFAULT");
    expect(sql).toContain("gen_random_bytes(16)");
    expect(sql).toMatch(
      /ALTER TABLE public\.shared_links\s+ALTER COLUMN share_code SET DEFAULT encode\(gen_random_bytes\(16\), 'hex'\);/,
    );
    // Not one word that could rewrite, remove or empty what is already there —
    // in the statements or in the comments.
    for (const word of ["UPDATE", "DELETE", "DROP", "TRUNCATE"]) {
      expect(sql, `002 must not contain ${word}`).not.toMatch(new RegExp(`\\b${word}\\b`, "i"));
    }

    // The header says who applies it, and that the app does not wait for it.
    const header = sql
      .split("\n")
      .filter((line) => line.startsWith("--"))
      .join("\n");
    expect(header).toMatch(/optional/i);
    expect(header).toMatch(/explicit/i);
    expect(header).toContain("Jon");
    expect(header).toMatch(/production/i);
  });

  test("no gallery query in src/, and cloud-storage.ts mints through share-code.ts", () => {
    const offenders = sourceFiles(SRC_DIR)
      .filter((file) => fs.readFileSync(file, "utf8").includes("getPublicStorybooks"))
      .map((file) => path.relative(REPO_ROOT, file));
    expect(offenders, "a public listing of other people's stories").toEqual([]);

    const supabaseSource = fs.readFileSync(SUPABASE, "utf8");
    expect(supabaseSource).not.toContain("view_count");
    expect(supabaseSource).not.toMatch(/\.eq\(\s*["']is_public["']\s*,\s*true\s*\)/);
    // The cloud insert writes the row the Node tests above prove.
    expect(supabaseSource).toMatch(/\.insert\(\s*shareLinkRow\(\s*storybookId\s*\)\s*\)/);

    const cloudSource = fs.readFileSync(CLOUD_STORAGE, "utf8");
    expect(cloudSource).not.toMatch(/function\s+mintShareCode\b/);
    expect(cloudSource).not.toMatch(/(?:const|let|var)\s+mintShareCode\b/);
    expect(cloudSource).toMatch(/import\s*\{[^}]*\bmintShareCode\b[^}]*\}\s*from\s*["']\.\/share-code["']/);
  });
});

/* --------------------------------------------- shareBook's honest sentence */

test.describe("share code · shareBook on this device, in Node", () => {
  test("no secure random source: the exact CloudError the ticket names, and no code is kept", async () => {
    expectDevicePath();

    for (const [why, csprng] of [
      ["no getRandomValues", {}],
      ["a getRandomValues that throws", BROKEN_CSPRNG],
    ] as const) {
      const device = memoryLibrary([{ id: "t02-tape" }]);
      const restoreWindow = swapGlobal("window", device.window);
      const restoreCrypto = swapGlobal("crypto", csprng);
      let failure: unknown;
      try {
        await shareBook("t02-tape");
      } catch (err) {
        failure = err;
      } finally {
        restoreCrypto();
        restoreWindow();
      }
      expect(failure, why).toBeInstanceOf(CloudError);
      expect((failure as CloudError).kind, why).toBe("unknown");
      expect((failure as Error).message, why).toBe(UNSAFE_LINK);
      expect(device.rows()[0].shareCode, `${why}: no code is written`).toBeUndefined();
    }

    // Control: with the real CSPRNG the same call reaches the minter and keeps a 32-hex code.
    const device = memoryLibrary([{ id: "t02-tape" }]);
    const restoreWindow = swapGlobal("window", device.window);
    try {
      const code = await shareBook("t02-tape");
      expect(code).toMatch(HEX_128);
      expect(device.rows()[0].shareCode).toBe(code);
    } finally {
      restoreWindow();
    }
  });

  test("a tape that already has a 16-hex code keeps it, even with no secure random source", async () => {
    expectDevicePath();
    const device = memoryLibrary([{ id: "t02-tape", shareCode: LEGACY_CODE }]);
    const restoreWindow = swapGlobal("window", device.window);
    const restoreCrypto = swapGlobal("crypto", {});
    try {
      // The link already sent is not re-minted, lengthened or refused.
      expect(await shareBook("t02-tape")).toBe(LEGACY_CODE);
    } finally {
      restoreCrypto();
      restoreWindow();
    }
    expect(device.rows()[0].shareCode).toBe(LEGACY_CODE);
  });
});

/* ------------------------------------------------------------------- 6 · 7 */

/** Seeded Twinkle draft → restore → Finish → the gate (a×b, consent) → "Your tape is ready". */
async function publishTwinkle(page: Page): Promise<void> {
  await seedStudioDraft(page, "twinkle");
  await page.goto("/studio");
  await restoreDraft(page);

  await page.getByRole("button", { name: "Finish my story" }).click();
  const question = page.locator('label[for="studio-gate-answer"]');
  await expect(question).toBeVisible({ timeout: 15000 });
  const match = (await question.innerText()).match(/(\d+)\s*[×x*]\s*(\d+)/);
  expect(match, "the gate asks an a×b question").not.toBeNull();
  await page.locator("#studio-gate-answer").fill(String(Number(match![1]) * Number(match![2])));
  await page.locator("#studio-gate-consent").check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Your tape is ready" })).toBeVisible({
    timeout: 30000,
  });
}

/** The card's read-only "Share link" field; returns the URL it holds. */
async function shareLink(page: Page): Promise<string> {
  const field = page.getByRole("textbox", { name: "Share link" });
  await expect(field).toHaveAttribute("data-studio", "share-url");
  await expect(field).toHaveJSProperty("readOnly", true);
  return field.inputValue();
}

test.describe("share code · links on this device", () => {
  test("a tape kept under a 16-hex code from before still opens", async ({ page }) => {
    await seedDeviceLibrary(page, "twinkle", { shareCode: LEGACY_CODE });
    await page.goto(`/read?story=${LEGACY_CODE}`);

    await expect(page.getByText(TWINKLE.title).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("button", { name: /Tap to Begin/ })).toBeVisible();
    await expect(page.getByText("We couldn't find that tape")).toHaveCount(0);
  });

  test("a browser with no getRandomValues gets no link at all, never a guessable one", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.addInitScript(() => {
      // randomUUID (story ids) stays; only the CSPRNG behind share codes goes.
      Reflect.deleteProperty(Crypto.prototype, "getRandomValues");
    });
    await publishTwinkle(page);
    expect(await page.evaluate(() => typeof crypto.getRandomValues)).toBe("undefined");

    // The tape is kept, honestly linkless: no field, and no code in the library.
    await expect(page.locator('[data-studio="share-url"]')).toHaveCount(0);
    await expect(page.getByText(/download the \.storysync file/i).first()).toBeVisible();
    const rows = await page.evaluate(
      (key) => JSON.parse(window.localStorage.getItem(key) || "[]") as Array<{ shareCode?: string }>,
      LIBRARY_KEY,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].shareCode).toBeUndefined();
  });

  for (const viewport of [
    { width: 1180, height: 820 },
    { width: 375, height: 812 },
  ]) {
    test.describe(`publish at ${viewport.width}×${viewport.height}`, () => {
      test.use({ viewport, permissions: ["clipboard-read", "clipboard-write"] });

      test("the private link is story=<32 hex>, fits the page, and Copy writes all of it", async ({
        page,
      }) => {
        test.setTimeout(90000);
        await publishTwinkle(page);
        const url = await shareLink(page);
        expect(url).toMatch(/\/read\?story=[0-9a-f]{32}$/);

        /* the field never pushes the page sideways */
        const fit = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(fit.scrollWidth).toBeLessThanOrEqual(fit.innerWidth);

        const field = page.locator('[data-studio="share-url"]');
        const copy = page.getByRole("button", { name: "Copy", exact: true });
        for (const box of [await field.boundingBox(), await copy.boundingBox()]) {
          expect(box).not.toBeNull();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(fit.innerWidth);
        }

        /* Copy writes the full URL — all 32 hex — not what fits on screen */
        await copy.click();
        await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
        const copied = await page.evaluate(() => navigator.clipboard.readText());
        expect(copied).toBe(url);
        expect(copied.split("story=")[1]).toMatch(HEX_128);
      });
    });
  }
});
