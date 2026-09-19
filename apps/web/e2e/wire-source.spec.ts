import { expect, test, type Page } from "@playwright/test";
import { canvasViewport, gotoApp, readSource, resetStorageBeforeNavigation, setSource, waitForHitRegions } from "./helpers";

/**
 * The wire tool can be started from four kinds of location, and the status bar echoes which one was
 * used ("Wire source: …"). These cases cover pin, existing-wire mid-span (a T-branch), junction dot,
 * and empty grid point, plus the lifecycle (the readout clears when the draft does).
 */
const TRUNK = String.raw`\begin{tikzpicture}
  \draw[thick] (0,0) -- (4,0);
\end{tikzpicture}`;

const TRUNK_WITH_JUNCTION = String.raw`\begin{tikzpicture}
  \draw[thick] (0,0) -- (4,0);
  \draw[line width=0.32mm, fill=black] (2,0) circle (0.06);
\end{tikzpicture}`;

const TWO_PINS = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (2,0);
    \coordinate (node_M1_d) at (2,0);
  \end{scope}
\end{tikzpicture}`;

const EMPTY = String.raw`\begin{tikzpicture}
\end{tikzpicture}`;

async function activateOrthoWire(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: { dispatch?: (action: unknown) => void };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    api?.dispatch?.({ type: "SET_TOOL_MODE", mode: "addOrthoWire" });
  });
}

function wireSourceCell(page: Page) {
  return page.locator('[data-testid="wire-source"]');
}

/** Reveals the named pin's dot, returning its screen centre (see pin-connect-drag.spec.ts). */
async function revealPinCentre(page: Page, anchorNode: string): Promise<{ x: number; y: number } | null> {
  const regions = page.locator("[data-hit-region-target-id]");
  const dot = page.locator(`[data-testid="node-anchor-dot"][data-anchor-node="${anchorNode}"]`);
  for (let index = 0; index < (await regions.count()); index += 1) {
    const box = await regions.nth(index).boundingBox();
    if (!box) continue;
    for (const fx of [0.5, 0.9, 0.98, 0.1, 0.02]) {
      for (const fy of [0.5, 0.1, 0.9]) {
        await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy, { steps: 6 });
        await page.waitForTimeout(80);
        if ((await dot.count()) > 0) {
          const dotBox = await dot.first().boundingBox();
          if (dotBox) return { x: dotBox.x + dotBox.width / 2, y: dotBox.y + dotBox.height / 2 };
        }
      }
    }
  }
  return null;
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("starting on a pin reports terminal:<node>:<anchor>", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, TWO_PINS);
  await waitForHitRegions(page, 1);
  await activateOrthoWire(page);

  const pin = await revealPinCentre(page, "node_M1_d");
  expect(pin, "pin never revealed").not.toBeNull();
  if (!pin) throw new Error("unreachable");

  await page.mouse.click(pin.x, pin.y);
  await page.waitForTimeout(200);

  const text = await wireSourceCell(page).textContent();
  console.log("[WIRE-SOURCE terminal]", JSON.stringify(text));
  expect(text ?? "").toContain("Wire source: terminal:node_M1_d");
});

test("starting on an existing wire mid-span reports route <sourceId>", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, TRUNK);
  await waitForHitRegions(page, 1);
  await activateOrthoWire(page);

  const trunk = page.locator("[data-hit-region-target-id]").first();
  const box = await trunk.boundingBox();
  if (!box) throw new Error("trunk hit region has no bounds");

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(200);

  const text = await wireSourceCell(page).textContent();
  console.log("[WIRE-SOURCE route]", JSON.stringify(text));
  expect(text ?? "").toMatch(/^Wire source: route \S+$/);
});

test("starting on a junction dot reports junction:<sourceId>", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, TRUNK_WITH_JUNCTION);
  await waitForHitRegions(page, 1);
  await activateOrthoWire(page);

  // The dot sits at the trunk's midpoint; the junction check runs before the trunk-projection one.
  const trunk = page.locator("[data-hit-region-target-id]").first();
  const box = await trunk.boundingBox();
  if (!box) throw new Error("trunk hit region has no bounds");

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(200);

  const text = await wireSourceCell(page).textContent();
  console.log("[WIRE-SOURCE junction]", JSON.stringify(text));
  expect(text ?? "").toMatch(/^Wire source: junction:\S+$/);
});

test("starting on empty space reports grid:<x>,<y> and clears when the draft ends", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, EMPTY);

  const viewport = canvasViewport(page);
  await viewport.focus();
  const layer = page.locator("[data-canvas-viewport='true'] svg").last();
  const box = await layer.boundingBox();
  if (!box) throw new Error("canvas layer has no bounds");
  await activateOrthoWire(page);

  await page.mouse.click(box.x + 140, box.y + 120);
  await page.waitForTimeout(200);

  const text = await wireSourceCell(page).textContent();
  console.log("[WIRE-SOURCE grid]", JSON.stringify(text));
  expect(text ?? "").toMatch(/^Wire source: grid:-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);

  // Escape drops the draft; the readout must go with it.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await expect(wireSourceCell(page)).toHaveCount(0);
});
