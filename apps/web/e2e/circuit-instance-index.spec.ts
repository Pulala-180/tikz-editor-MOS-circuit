import { expect, test, type Page } from "@playwright/test";
import { canvasViewport, gotoApp, readSource, resetStorageBeforeNavigation, setSource } from "./helpers";

const EMPTY_SOURCE = String.raw`\begin{tikzpicture}
\end{tikzpicture}`;

/** Activate a circuit tool and click once to stamp it at the given screen point. */
async function placeTool(page: Page, mode: string, at: { x: number; y: number }): Promise<void> {
  await page.evaluate((toolMode) => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: { dispatch?: (action: unknown) => void };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    api?.dispatch?.({ type: "SET_TOOL_MODE", mode: toolMode });
  }, mode);
  await page.mouse.click(at.x, at.y);
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("placing two components of the same kind writes distinct pin ids", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, EMPTY_SOURCE);

  const viewport = canvasViewport(page);
  await expect(viewport).toBeVisible();
  const box = await viewport.boundingBox();
  if (!box) {
    throw new Error("Missing canvas viewport bounds.");
  }

  await placeTool(page, "addResistor_V_Bottom", { x: box.x + box.width * 0.4, y: box.y + box.height * 0.4 });
  await placeTool(page, "addResistor_V_Bottom", { x: box.x + box.width * 0.6, y: box.y + box.height * 0.6 });

  const source = await readSource(page);

  // The placeholder id must never reach the document.
  expect(source, `placeholder id survived:\n${source}`).not.toContain("node_Rx");

  // Each placement owns its own family index.
  const families = new Set(source.match(/node_R\d+/g) ?? []);
  expect(
    families.size,
    `expected two distinct resistor ids, got [${[...families].join(", ")}]\n${source}`
  ).toBe(2);

  // Both placements keep their full pin set (.t / .b), 2 per resistor.
  const pinCoordinates = source.match(/\\coordinate \(node_R\d+\.[tb]\)/g) ?? [];
  expect(pinCoordinates.length, `pin coordinates missing or renamed inconsistently:\n${source}`).toBe(4);
});
