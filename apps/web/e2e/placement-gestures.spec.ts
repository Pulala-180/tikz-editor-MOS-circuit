import { expect, test, type Page } from "@playwright/test";
import { canvasViewport, gotoApp, readSource, resetStorageBeforeNavigation, setSource } from "./helpers";

const EMPTY_SOURCE = String.raw`\begin{tikzpicture}
\end{tikzpicture}`;

/**
 * Placement gestures closed loop:
 *   ① sticky placement (stay armed after a stamp, Esc exits)
 *   ② placement-time orientation gestures (R rotates, Shift+R / Ctrl+R mirror)
 *   ③ sticky clipboard placement (copy, then click-click to place repeatedly)
 *   ④ power rail two-point drop (first end, second end)
 */

async function placeTool(page: Page, mode: string, at: { x: number; y: number }): Promise<void> {
  await page.evaluate((toolMode) => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: { dispatch?: (action: unknown) => void };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    api?.dispatch?.({ type: "SET_TOOL_MODE", mode: toolMode });
  }, mode);
  await page.mouse.click(at.x, at.y);
}

async function viewportBox(page: Page) {
  const viewport = canvasViewport(page);
  await expect(viewport).toBeVisible();
  const box = await viewport.boundingBox();
  if (!box) {
    throw new Error("Missing canvas viewport bounds.");
  }
  return { viewport, box };
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("① placement stays armed after a stamp and Esc exits", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, EMPTY_SOURCE);
  const { viewport, box } = await viewportBox(page);

  await viewport.focus();
  // `q` arms the pMOS tool from select mode.
  await page.keyboard.press("q");
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.35);
  // No re-arm: a second click must stamp a second part (sticky placement).
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.65);

  let source = await readSource(page);
  const ids = new Set(source.match(/node_M\d+/g) ?? []);
  expect(
    [...ids].sort(),
    `expected two sticky-placed transistors:\n${source}`
  ).toEqual(["node_M1", "node_M2"]);

  // Esc leaves placement mode: a third click on empty canvas adds nothing.
  await page.keyboard.press("Escape");
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  source = await readSource(page);
  const idsAfterEsc = new Set(source.match(/node_M\d+/g) ?? []);
  expect(
    [...idsAfterEsc].sort(),
    `Esc did not exit sticky placement:\n${source}`
  ).toEqual(["node_M1", "node_M2"]);
});

test("② R rotates, Shift+R and Ctrl+R mirror the pending part", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, EMPTY_SOURCE);
  const { viewport, box } = await viewportBox(page);
  await viewport.focus();

  // Baseline: `q` then a single part is the Left placement (drain pin at +x).
  await page.keyboard.press("q");
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
  let source = await readSource(page);
  expect(source, `baseline pMOS was not the Left placement:\n${source}`).toMatch(
    /\\coordinate \(node_M\d+\.d\) at \(0\.73,-0\.5\);/
  );

  // Shift+R mirrors the still-armed part left/right -> Right placement (drain pin at -x).
  await page.keyboard.press("Shift+R");
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.3);
  source = await readSource(page);
  expect(source, `Shift+R did not mirror to the Right placement:\n${source}`).toMatch(
    /\\coordinate \(node_M\d+\.d\) at \(-0\.73,-0\.5\);/
  );

  // Ctrl+R mirrors it back -> Left placement again.
  await page.keyboard.press("Control+r");
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.7);
  source = await readSource(page);
  expect(
    (source.match(/\\coordinate \(node_M\d+\.d\) at \(0\.73,-0\.5\);/g) ?? []).length,
    `Ctrl+R did not mirror back to the Left placement:\n${source}`
  ).toBe(2);
});

test("② the placement banner is shown in the status bar", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, EMPTY_SOURCE);
  const { viewport } = await viewportBox(page);
  await viewport.focus();

  await expect(page.getByTestId("placement-hint")).toHaveCount(0);

  await page.keyboard.press("q");
  const hint = page.getByTestId("placement-hint");
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText(
    "Place component mirrored left/right · R rotates · Shift+R / Ctrl+R mirrors · click to place another · Esc exits"
  );

  await page.keyboard.press("Escape");
  await expect(hint).toHaveCount(0);
});

test("③ copied elements place repeatedly until Esc", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0);
\end{tikzpicture}`);
  const { viewport, box } = await viewportBox(page);

  await page.evaluate(() => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: { selectSourceIds?: (ids: string[]) => void };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    api?.selectSourceIds?.(["path:0"]);
  });
  await viewport.focus();
  await page.keyboard.press("Control+c");

  const hint = page.getByTestId("placement-hint");
  await expect(hint).toHaveText("Copied 1 component · click to place another · Esc exits");

  // Two clicks in a row paste two copies (sticky clipboard placement).
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.4);
  await page.mouse.click(box.x + box.width * 0.65, box.y + box.height * 0.6);

  await expect
    .poll(async () => ((await readSource(page)).match(/\\draw/g) ?? []).length)
    .toBe(3);

  await page.keyboard.press("Escape");
  await expect(hint).toHaveCount(0);
});

test("④ power rail drops between two clicks (first end, second end)", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, EMPTY_SOURCE);
  const { viewport, box } = await viewportBox(page);
  await viewport.focus();

  // `k` arms the power-rail tool from select mode.
  await page.keyboard.press("k");
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.45);
  // The first click only arms the draft — no rail yet.
  expect(await readSource(page), "the first click already committed a rail").not.toContain("node_RAIL");

  // The second click commits the rail spanning the two ends.
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.45);
  const source = await readSource(page);
  expect(source, `two-point rail was not written:\n${source}`).toContain("line width=0.9mm");
  expect(source).toMatch(/\\coordinate \(node_RAIL\d+\.l\) at \(0,0\);/);
  expect(source).toMatch(/\\coordinate \(node_RAIL\d+\.r\) at \(/);
  expect(source).toMatch(/\\coordinate \(node_RAIL\d+\.tap1\)/);
  expect(source).toContain("$V_{DD}$");
  expect(source, `rail pin ids were not renumbered:\n${source}`).not.toContain("node_RAILx");
});

test("④ Esc cancels a half-finished power rail", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, EMPTY_SOURCE);
  const { viewport, box } = await viewportBox(page);
  await viewport.focus();

  await page.keyboard.press("k");
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
  await page.keyboard.press("Escape");
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.5);

  expect(await readSource(page), "Esc did not cancel the half-finished rail").not.toContain("node_RAIL");
});
