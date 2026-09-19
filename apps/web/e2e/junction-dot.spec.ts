import { expect, test, type Page } from "@playwright/test";
import { gotoApp, readSource, resetStorageBeforeNavigation, setSource, waitForHitRegions } from "./helpers";

/**
 * §S2.5 shipped with the junction decision verified numerically in core
 * (`scripts/check-wire-segment-snap.ts`) but with no assertion that the app layer actually
 * *writes* the dot. This closes that gap.
 *
 * No world→screen conversion is needed: orthogonal routing takes the corner as
 * `(start.x, end.y)`, so clicking twice at the same screen x, the second time on the trunk,
 * makes the emitted leg terminate exactly on the trunk.
 */
const TRUNK = String.raw`\begin{tikzpicture}
  \draw[thick] (0,0) -- (4,0);
\end{tikzpicture}`;

const EMPTY = String.raw`\begin{tikzpicture}
\end{tikzpicture}`;

async function activateTool(page: Page, mode: string): Promise<void> {
  await page.evaluate((nextMode) => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: { dispatch?: (action: unknown) => void };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    api?.dispatch?.({ type: "SET_TOOL_MODE", mode: nextMode });
  }, mode);
}

function hasJunctionDot(source: string): boolean {
  return /\\draw\[line width=0\.32mm, fill=black\] \([^)]*\) circle \(0\.06\)/.test(source);
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("a wire landing on an existing trunk writes a junction dot", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, TRUNK);
  await waitForHitRegions(page, 1);
  await activateTool(page, "addOrthoWire");

  const trunk = page.locator("[data-hit-region-target-id]").first();
  const box = await trunk.boundingBox();
  if (!box) throw new Error("trunk hit region has no bounds");
  const midX = box.x + box.width / 2;
  const midY = box.y + box.height / 2;

  // Same screen x for both clicks ⇒ the corner is directly below the start ⇒ the leg ends on
  // the trunk rather than beside it.
  await page.mouse.click(midX, midY - 150);
  await page.waitForTimeout(200);
  await page.mouse.click(midX, midY);
  await page.waitForTimeout(400);

  const source = await readSource(page);
  console.log("[JUNCTION] source:", JSON.stringify(source));

  // The stub wire itself must have been written. Keyed on `line cap=round`: the trunk lead is
  // `\draw[thick]` and the junction dot is `fill=black`, so this counts wire segments exactly.
  const wireCount = (source.match(/line cap=round/g) ?? []).length;
  expect(wireCount, `no new wire was drawn:\n${source}`).toBe(1);
  // ...and so must the junction dot, in the same action.
  expect(hasJunctionDot(source), `expected a junction dot in:\n${source}`).toBe(true);
});

test("one undo removes the wire and its junction dot together", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, TRUNK);
  await waitForHitRegions(page, 1);
  await activateTool(page, "addOrthoWire");

  const trunk = page.locator("[data-hit-region-target-id]").first();
  const box = await trunk.boundingBox();
  if (!box) throw new Error("trunk hit region has no bounds");
  const midX = box.x + box.width / 2;
  const midY = box.y + box.height / 2;

  await page.mouse.click(midX, midY - 150);
  await page.waitForTimeout(200);
  await page.mouse.click(midX, midY);
  await page.waitForTimeout(400);

  const withJunction = await readSource(page);
  expect(hasJunctionDot(withJunction), `setup failed, no dot to undo:\n${withJunction}`).toBe(true);

  const dispatches = await page.evaluate(() => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: { runCommand?: (id: string) => boolean };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    return api?.runCommand?.("edit.undo") ?? false;
  });
  expect(dispatches, "edit.undo was not accepted").toBe(true);
  await page.waitForTimeout(400);

  const source = await readSource(page);
  console.log("[JUNCTION-UNDO] source:", JSON.stringify(source));

  // Both the stub and its dot must go in ONE undo: the dot went into the same `snippets` array.
  expect(hasJunctionDot(source), `junction dot survived the undo:\n${source}`).toBe(false);
  expect(
    (source.match(/line cap=round/g) ?? []).length,
    `the stub wire survived the undo:\n${source}`
  ).toBe(0);
});

test("a wire ending in empty space writes no junction dot", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, EMPTY);
  await activateTool(page, "addOrthoWire");

  const layer = page.locator("[data-canvas-viewport='true'] svg").last();
  const box = await layer.boundingBox();
  if (!box) throw new Error("canvas layer has no bounds");

  await page.mouse.click(box.x + 120, box.y + 120);
  await page.waitForTimeout(200);
  await page.mouse.click(box.x + 300, box.y + 260);
  await page.waitForTimeout(400);

  const source = await readSource(page);
  console.log("[JUNCTION-NEG] source:", JSON.stringify(source));
  expect(source).toMatch(/\\draw\[/);
  expect(hasJunctionDot(source), `unexpected junction dot in:\n${source}`).toBe(false);
});
