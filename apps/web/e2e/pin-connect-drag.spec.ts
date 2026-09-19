import { expect, test, type Page } from "@playwright/test";
import { gotoApp, readSource, resetStorageBeforeNavigation, setSource, waitForHitRegions } from "./helpers";

// Two components, each with one named pin, far enough apart to force an L-shaped route.
const TWO_PINS_SOURCE = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (2,0);
    \coordinate (node_M1_d) at (2,0);
  \end{scope}
  \begin{scope}[shift={(3,3)}]
    \draw[thick] (0,0) -- (2,0);
    \coordinate (node_R1_p1) at (2,0);
  \end{scope}
\end{tikzpicture}`;

const EMPTY_CANVAS_SOURCE = String.raw`\begin{tikzpicture}
\end{tikzpicture}`;

async function activateTool(page: Page, mode: string): Promise<void> {
  await page.evaluate((nextMode) => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: { dispatch?: (action: unknown) => void };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    api?.dispatch?.({ type: "SET_TOOL_MODE", mode: nextMode });
  }, mode);
}

/**
 * Hover sample points across every hit region until the dot for `anchorNode` appears, then return
 * its screen centre. The reveal radius is 60px/zoom and a pin sits at one END of its lead, so
 * sampling the region centre alone is not enough.
 */
async function revealPinCentre(page: Page, anchorNode: string): Promise<{ x: number; y: number } | null> {
  return revealNamedPinCentre(page, anchorNode, null);
}

/**
 * Same as {@link revealPinCentre}, but can target one named anchor of the node, which is the
 * dot-form pin convention the editor's own templates emit (`\coordinate (node_R1.r)`).
 */
async function revealNamedPinCentre(
  page: Page,
  anchorNode: string,
  anchorName: string | null
): Promise<{ x: number; y: number } | null> {
  const regions = page.locator("[data-hit-region-target-id]");
  const selector = anchorName
    ? `[data-testid="node-anchor-dot"][data-anchor-node="${anchorNode}"][data-anchor-name="${anchorName}"]`
    : `[data-testid="node-anchor-dot"][data-anchor-node="${anchorNode}"]`;
  const dot = page.locator(selector);
  for (let index = 0; index < (await regions.count()); index += 1) {
    const box = await regions.nth(index).boundingBox();
    if (!box) continue;
    for (const fx of [0.5, 0.9, 0.98, 0.1, 0.02]) {
      for (const fy of [0.5, 0.1, 0.9]) {
        await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy, { steps: 6 });
        await page.waitForTimeout(80);
        if ((await dot.count()) > 0) {
          const dotBox = await dot.first().boundingBox();
          if (dotBox) {
            return { x: dotBox.x + dotBox.width / 2, y: dotBox.y + dotBox.height / 2 };
          }
        }
      }
    }
  }
  return null;
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("ortho wire between two pins emits anchor references, not fixed coordinates", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, TWO_PINS_SOURCE);
  await waitForHitRegions(page, 1);
  await activateTool(page, "addOrthoWire");

  const target = await revealPinCentre(page, "node_R1_p1");
  const start = await revealPinCentre(page, "node_M1_d");
  expect(start, "start pin never revealed").not.toBeNull();
  expect(target, "target pin never revealed").not.toBeNull();
  if (!start || !target) throw new Error("unreachable");

  // Two-click connection: origin pin, then destination pin. The whole route is laid in one action
  // (docs/VIRTUOSO_PARITY_PLAN.md appendix I) — there is no third click to finish.
  await page.mouse.click(start.x, start.y);
  await page.waitForTimeout(200);
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(400);

  const source = await readSource(page);
  console.log("[ORTHO] final source:", JSON.stringify(source));

  // The wire is attached to both pins by name...
  expect(source).toContain("(node_M1_d)");
  expect(source).toContain("(node_R1_p1)");
  // ...and one of them is the endpoint of a `--` run that reached past a corner coordinate,
  // i.e. the anchors are genuinely wire endpoints rather than free-standing text.
  // ...and the anchors are joined by a routing operator, i.e. they are genuinely wire endpoints.
  // The form is `-|` / `|-` (fully relative) rather than an explicit corner coordinate, so nothing
  // in the wire can go stale when a component moves.
  expect(source).toMatch(/\(node_M1_d\)\s*(?:--|-\||\|-)\s*\(node_R1_p1\)/);

  // Anchor-referenced endpoints must actually RESOLVE: a wire written as `(node_M1_d)` only
  // counts if the renderer turned that name back into geometry in the scene.
  const sceneSourceIds = await page.evaluate(() => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: { getSceneSourceIds?: () => string[] };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    return api?.getSceneSourceIds?.() ?? [];
  });
  console.log("[ORTHO] scene source ids:", JSON.stringify(sceneSourceIds));
  // Two leads + ONE wire polyline (the auto-route writes the whole path as a single \draw).
  // If the anchor refs failed to resolve, the wire would be missing from the scene entirely.
  expect(sceneSourceIds.length).toBeGreaterThanOrEqual(3);
});

test("ortho wire between empty space still emits plain coordinates", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, EMPTY_CANVAS_SOURCE);
  await activateTool(page, "addOrthoWire");

  const layer = page.locator("[data-canvas-viewport='true'] svg").last();
  const box = await layer.boundingBox();
  if (!box) throw new Error("canvas layer bounds missing");

  const a = { x: box.x + 80, y: box.y + 80 };
  const b = { x: box.x + 300, y: box.y + 220 };

  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(200);
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(200);
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(400);

  const source = await readSource(page);
  console.log("[ORTHO-EMPTY] source:", JSON.stringify(source));

  expect(source).toMatch(/\\draw\[/);
  // No pin was involved, so nothing may be written as a named-anchor reference.
  expect(source).not.toContain("node_");
});

test("connects two editor-native components using the dot-form pin convention", async ({ page }) => {
  // Mirrors what `circuit-snippets.ts` emits for two resistors: `\coordinate (node_Rx.l/.r)`.
  const dotFormSource = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (0.78,0);
    \coordinate (node_R1.l) at (0,0);
    \coordinate (node_R1.r) at (0.78,0);
  \end{scope}
  \begin{scope}[shift={(3,3)}]
    \draw[thick] (0,0) -- (0.78,0);
    \coordinate (node_R2.l) at (0,0);
    \coordinate (node_R2.r) at (0.78,0);
  \end{scope}
\end{tikzpicture}`;

  await gotoApp(page);
  await setSource(page, dotFormSource);
  await waitForHitRegions(page, 1);
  await activateTool(page, "addOrthoWire");

  const target = await revealNamedPinCentre(page, "node_R2", "l");
  const start = await revealNamedPinCentre(page, "node_R1", "r");
  expect(start, "node_R1.r never revealed").not.toBeNull();
  expect(target, "node_R2.l never revealed").not.toBeNull();
  if (!start || !target) throw new Error("unreachable");

  await page.mouse.click(start.x, start.y);
  await page.waitForTimeout(200);
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(200);
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(400);

  const source = await readSource(page);
  console.log("[DOTFORM] final source:", JSON.stringify(source));

  // Dot-form pins must round-trip as `(node_R1.r)` / `(node_R2.l)`, not as numbers.
  expect(source).toContain("(node_R1.r)");
  expect(source).toContain("(node_R2.l)");
  expect(source).toMatch(/\(node_R1\.r\)\s*(?:--|-\||\|-)\s*\(node_R2\.l\)/);
});

test("pin-to-pin drag with the Line tool also emits anchor references", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, TWO_PINS_SOURCE);
  await waitForHitRegions(page, 1);
  await activateTool(page, "addLine");

  const target = await revealPinCentre(page, "node_R1_p1");
  const start = await revealPinCentre(page, "node_M1_d");
  if (!start || !target) throw new Error("could not reveal both pins");

  await page.mouse.move(start.x, start.y, { steps: 6 });
  await page.mouse.down();
  await page.mouse.move((start.x + target.x) / 2, (start.y + target.y) / 2, { steps: 10 });
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(400);

  const source = await readSource(page);
  console.log("[LINE] final source:", JSON.stringify(source));
  expect(source).toContain("(node_M1_d)");
  expect(source).toContain("(node_R1_p1)");
});
