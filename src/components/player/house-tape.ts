/**
 * The house tape, "The Brave Little Star", as the Read Room and its "Read it in…" panel know it
 * without a request. Its own module so the Read Room can name it without loading the panel
 * (mission P4, C7: the panel is fetched only where it shows).
 */
import houseTape from "../../../public/demo/brave-little-star.ssync.json";
import type { SsyncManifest } from "@/lib/storysync/manifest";
import { normalizeTapeManifest } from "@/lib/storysync/tape-source";
import { houseTarget } from "./read-it-in";

/**
 * The house tape exactly as the Read Room's demo door opens it (the same
 * permissive reader, so its resume key is the same), resolved at build time:
 * no runtime request.
 */
export const HOUSE_TAPE: SsyncManifest = normalizeTapeManifest(houseTape) ?? (houseTape as unknown as SsyncManifest);

/** The panel's target when it is about the house tape. */
export const HOUSE_READ_IT_IN = houseTarget(HOUSE_TAPE);
