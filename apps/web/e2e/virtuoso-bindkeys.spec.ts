import { expect, test, type Page } from "@playwright/test";
import { canvasViewport, gotoApp, readCanvasTransform, readSource, resetStorageBeforeNavigation, setSource } from "./helpers";

const EMPTY_SOURCE = String.raw`\begin{tikzpicture}
\end{tikzpicture}`;

/** Activate the resistor tool and stamp it — an undoable edit that does not need a code edit. */
async function placeResistor(page: Page, at: { x: number; y: number }): Promise<void> {
  await page.evaluate(() => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: { dispatch?: (action: unknown) => void };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    api?.dispatch?.({ type: "SET_TOOL_MODE", mode: "addResistor_V_Bottom" });
  });
  await page.mouse.click(at.x, at.y);
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("Virtuoso keys: u / Shift+u undo and redo, [ / ] zoom", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, EMPTY_SOURCE);

  // These keys only fire with the canvas focused, so that typing in the source panel is unaffected.
  const viewport = canvasViewport(page);
  await viewport.focus();
  await expect(viewport).toBeFocused();

  const box = await viewport.boundingBox();
  if (!box) {
    throw new Error("Missing canvas viewport bounds.");
  }

  // --- u / Shift+u ---------------------------------------------------------
  await placeResistor(page, { x: box.x + box.width * 0.45, y: box.y + box.height * 0.45 });
  expect(await readSource(page), "the resistor was not placed").toContain("\\coordinate (node_R");

  await page.keyboard.press("u");
  await expect
    .poll(async () => (await readSource(page)).includes("\\coordinate (node_R"))
    .toBe(false);

  await page.keyboard.press("Shift+u");
  await expect
    .poll(async () => (await readSource(page)).includes("\\coordinate (node_R"))
    .toBe(true);

  // --- [ / ] ---------------------------------------------------------------
  const before = await readCanvasTransform(page);
  await page.keyboard.press("]");
  await expect.poll(async () => (await readCanvasTransform(page)).scale).toBeGreaterThan(before.scale);

  const zoomedIn = await readCanvasTransform(page);
  await page.keyboard.press("[");
  await expect.poll(async () => (await readCanvasTransform(page)).scale).toBeLessThan(zoomedIn.scale);
});
