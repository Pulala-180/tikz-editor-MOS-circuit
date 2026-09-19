import { expect, test, type Page } from "@playwright/test";
import { canvasViewport, gotoApp, readSource, resetStorageBeforeNavigation, setSource } from "./helpers";

const EMPTY_SOURCE = String.raw`\begin{tikzpicture}
\end{tikzpicture}`;

async function activateOrthoWire(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: { dispatch?: (action: unknown) => void };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    api?.dispatch?.({ type: "SET_TOOL_MODE", mode: "addOrthoWire" });
  });
}

/** Every committed wire statement, as its list of (x,y) points in source order. */
function wirePointLists(source: string): Array<Array<[number, number]>> {
  return source
    .split("\n")
    .filter((line) => line.includes("line cap=round"))
    .map((line) =>
      [...line.matchAll(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g)].map(
        (match) => [Number(match[1]), Number(match[2])] as [number, number]
      )
    )
    .filter((points) => points.length >= 2);
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("wire routing modes: orthogonal corner control, then the 45-degree route", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, EMPTY_SOURCE);

  const viewport = canvasViewport(page);
  await viewport.focus();
  await expect(viewport).toBeFocused();
  const box = await viewport.boundingBox();
  if (!box) {
    throw new Error("Missing canvas viewport bounds.");
  }
  const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  const start = at(0.3, 0.62);
  const target = at(0.72, 0.48); // mostly horizontal, so the two corner rules differ

  const startDraft = async () => {
    await page.keyboard.press("Escape");
    await activateOrthoWire(page);
    await page.mouse.click(start.x, start.y);
  };

  // --- default (auto) + the committed leg is horizontal-first -------------------------------
  await startDraft();
  await page.mouse.click(target.x, target.y);
  let latest = wirePointLists(await readSource(page)).at(-1);
  expect(latest?.length, "one leg per click in orthogonal mode").toBe(2);
  expect(Math.abs((latest as Array<[number, number]>)[1][1] - (latest as Array<[number, number]>)[0][1])).toBeLessThan(0.02);

  // --- Space picks an explicit orientation (Space, Space => VH) -----------------------------
  await startDraft();
  await page.keyboard.press("Space");
  await page.keyboard.press("Space");
  await page.mouse.click(target.x, target.y);
  latest = wirePointLists(await readSource(page)).at(-1);
  expect(latest?.length).toBe(2);
  // VH means the corner is directly above/below the start, so the two points share x.
  expect(Math.abs((latest as Array<[number, number]>)[1][0] - (latest as Array<[number, number]>)[0][0])).toBeLessThan(0.02);

  // --- Shift+F3 switches to the 45-degree route, which commits the whole path ---------------
  await startDraft();
  await page.keyboard.press("Shift+F3");
  await page.mouse.click(target.x, target.y);
  latest = wirePointLists(await readSource(page)).at(-1);
  expect(latest?.length, "the 45-degree route is a 4-point path").toBe(4);
  const [a, b, c] = latest as Array<[number, number]>;
  // The middle leg must be exactly 45 degrees...
  expect(Math.abs(Math.abs(c[0] - b[0]) - Math.abs(c[1] - b[1]))).toBeLessThan(0.03);
  // ...and never a zero-length leg (that would mean the route degenerated).
  expect(Math.hypot(c[0] - b[0], c[1] - b[1])).toBeGreaterThan(0.05);
});
