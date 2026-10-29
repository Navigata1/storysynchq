// Share codes — the unlisted, unguessable part of `/read?story=<code>`.
//
// One minting function for every link the app makes, on this device and in the
// cloud library, so a grandparent's link is what PRIVACY.md rule 4 says it is:
// 128 bits from the browser's CSPRNG, as 32 lowercase hex characters.
//
// It never weakens. With no `crypto.getRandomValues` it throws rather than
// fall back to the clock or `Math.random()` — a guessable link to a child's
// voice is worse than no link (the tape can still be downloaded and handed on).
//
// Pure and dependency-free on purpose: Node tests import it directly and need
// no cloud at all (`./supabase` binds a live client on import when configured).

/** 16 bytes = 128 bits. */
const SHARE_CODE_BYTES = 16;

/**
 * Thrown when this runtime cannot give secure random bytes: no
 * `crypto.getRandomValues`, or one that fails when asked. It is the only error
 * `mintShareCode` throws, so a caller can always name the cause.
 */
export class ShareCodeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ShareCodeError";
  }
}

/** A fresh unlisted code: 32 lowercase hex characters from `crypto.getRandomValues`. */
export function mintShareCode(): string {
  const source = globalThis.crypto;
  if (!source || typeof source.getRandomValues !== "function") {
    throw new ShareCodeError(
      "No secure random source (crypto.getRandomValues) here, so no private link can be made safely.",
    );
  }
  const bytes = new Uint8Array(SHARE_CODE_BYTES);
  try {
    source.getRandomValues(bytes);
  } catch (cause) {
    throw new ShareCodeError(
      "The secure random source (crypto.getRandomValues) failed, so no private link can be made safely.",
      { cause },
    );
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The `shared_links` row the cloud insert writes. */
export interface ShareLinkRow {
  storybook_id: string;
  share_code: string;
}

/**
 * The exact object `createShareLink` hands to `.insert()`: the code is minted
 * here, never left to the column default (migration 001's default is 64-bit).
 */
export function shareLinkRow(storybookId: string): ShareLinkRow {
  return { storybook_id: storybookId, share_code: mintShareCode() };
}
