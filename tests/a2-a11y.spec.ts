/**
 * C6's judge (archipelago-2 mission, phase P3): every route has zero serious or critical
 * axe-core violations in its first-screen state and in each open dialog the suite reaches
 * (idea.lock C6; judges/required-P3.json needs 8 passing per project). Routes: /, /read, the
 * Player, /studio, /protocol. Dialogs: the Player's Reading options, the restore prompt, the
 * parental gate, the publish card, the Voice card mid-take (P3-R1-02).
 *
 * Out of scope, stated: /classic, the previous single-file app, which CLAUDE.md keeps
 * untouched. axe finds serious contrast failures there (gray-500 card text); C6 is reported
 * for the five product routes above, never for /classic.
 *
 * axe-core (devDependency, pinned) is injected into the page and run on the whole document,
 * WCAG 2.0/2.1/2.2 A and AA rules plus best practices. A violation fails the test when its
 * impact is serious or critical; the message names each rule, its help text and the first
 * offending targets, so a failure says what to fix.
 */

import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { restoreDraft, seedDeviceLibrary, seedStudioDraft } from "./fixtures/helpers";
import { stubMicrophone } from "./fixtures/mic";

const AXE = path.join(__dirname, "..", "node_modules", "axe-core", "axe.min.js");

interface Violation {
  id: string;
  impact: string | null;
  help: string;
  targets: string[];
}

async function seriousViolations(page: Page): Promise<Violation[]> {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForTimeout(400); // let entrance animations land: contrast is judged as seen
  await page.addScriptTag({ path: AXE });
  const found = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; impact: string | null; help: string; nodes: { target: unknown[] }[] }[] }> } }).axe;
    const r = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
      resultTypes: ["violations"],
    });
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.slice(0, 4).map((n) => n.target.join(" ")),
    }));
  });
  return found.filter((v) => v.impact === "serious" || v.impact === "critical");
}

async function expectClean(page: Page, where: string) {
  const bad = await seriousViolations(page);
  expect(
    bad.map((v) => `${v.impact} ${v.id}: ${v.help} @ ${v.targets.join(" | ")}`),
    `${where}: serious or critical axe violations`,
  ).toEqual([]);
}

async function openStudioWithTape(page: Page) {
  await seedStudioDraft(page, "twinkle", { narration: true });
  await page.goto("/studio");
  await restoreDraft(page);
  await expect(page.locator('[data-studio="stage-photo"]')).toBeVisible({ timeout: 15000 });
}

test.describe("a11y", () => {
  test("landing, first screen", async ({ page }) => {
    await page.goto("/");
    await expectClean(page, "/");
  });

  test("read room, first screen", async ({ page }) => {
    await page.goto("/read");
    await expectClean(page, "/read");
  });

  test("player, a page of a tape", async ({ page }) => {
    const code = randomBytes(16).toString("hex");
    await seedDeviceLibrary(page, "twinkle", { shareCode: code });
    await page.goto(`/read?story=${code}`);
    const root = page.locator(".pl-root");
    await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
    await expectClean(page, "player cover");
    await page.getByRole("button", { name: /Tap to Begin/ }).click();
    await expect(root).toHaveAttribute("data-view", "page");
    await expectClean(page, "player page");
  });

  test("studio, a tape open", async ({ page }) => {
    await openStudioWithTape(page);
    await expectClean(page, "/studio");
  });

  test("protocol, first screen", async ({ page }) => {
    await page.goto("/protocol");
    await expectClean(page, "/protocol");
  });

  test("dialog: the Player's Reading options", async ({ page }) => {
    const code = randomBytes(16).toString("hex");
    await seedDeviceLibrary(page, "twinkle", { shareCode: code });
    await page.goto(`/read?story=${code}`);
    const root = page.locator(".pl-root");
    await expect(root).toHaveAttribute("data-view", "cover", { timeout: 20000 });
    await page.getByRole("button", { name: /Tap to Begin/ }).click();
    await expect(root).toHaveAttribute("data-view", "page");
    await page.getByRole("button", { name: "Reading options" }).first().click();
    await expect(page.getByRole("dialog", { name: "Reading options" })).toBeVisible({ timeout: 10000 });
    await expectClean(page, "reading options");
  });

  test("dialog: the parental gate", async ({ page }) => {
    await openStudioWithTape(page);
    await page.getByRole("button", { name: "Finish my story" }).click();
    await expect(page.locator('label[for="studio-gate-answer"]')).toContainText(/\d+\s*[×x*]\s*\d+/, { timeout: 10000 });
    await expectClean(page, "parental gate");
  });

  test("dialog: keep working on your story? (the restore prompt)", async ({ page }) => {
    await seedStudioDraft(page, "twinkle", { narration: true });
    await page.goto("/studio");
    await expect(page.getByRole("button", { name: /Keep working on it/ })).toBeVisible({ timeout: 20000 });
    await expectClean(page, "restore prompt");
  });

  test("dialog: your tape is ready (the publish card)", async ({ page }) => {
    await openStudioWithTape(page);
    await page.getByRole("button", { name: "Finish my story" }).click();
    const question = page.locator('label[for="studio-gate-answer"]');
    await expect(question).toContainText(/\d+\s*[×x*]\s*\d+/, { timeout: 10000 });
    const [, a, b] = (await question.innerText()).match(/(\d+)\s*[×x*]\s*(\d+)/)!;
    await page.locator("#studio-gate-answer").fill(String(Number(a) * Number(b)));
    const consent = page.locator("#studio-gate-consent");
    if (await consent.isVisible()) await consent.check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Your tape is ready" })).toBeVisible({ timeout: 30000 });
    await expectClean(page, "publish card");
  });

  test("dialog: the Voice card mid-take", async ({ page }) => {
    await stubMicrophone(page);
    await openStudioWithTape(page);
    await page.getByRole("button", { name: "Record my voice on this page" }).click();
    await expect(page.locator(".studio[data-recording='true']")).toHaveCount(1);
    await expectClean(page, "voice card mid-take");
  });
});
