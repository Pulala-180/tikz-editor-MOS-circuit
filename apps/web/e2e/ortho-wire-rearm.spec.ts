import { expect, test, type Page } from "@playwright/test";
import { canvasViewport, gotoApp, readSource, resetStorageBeforeNavigation, setSource } from "./helpers";

const EMPTY_SOURCE = String.raw`\begin{tikzpicture}
\end{tikzpicture}`;

/**
 * Count committed wire segments only. Keyed on `line cap=round`, which the wire style carries but
 * the component leads (`\draw[thick]`) and junction dots (`fill=black`) do not — and unlike the
 * literal stroke style, it survives a change to the wire's line width.
 */
function countWireSegments(source: string): number {
  return (source.match(/line cap=round/g) ?? []).length;
}

async function activateOrthoWire(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: { dispatch?: (action: unknown) => void };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    api?.dispatch?.({ type: "SET_TOOL_MODE", mode: "addOrthoWire" });
  });
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("re-pressing the wire key starts a fresh wire instead of extending the previous one", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, EMPTY_SOURCE);

  // Focus the canvas WITHOUT clicking: a click here would already start a wire. Focus matters,
  // because the key handler deliberately ignores keys aimed at the source editor.
  const viewport = canvasViewport(page);
  await viewport.focus();
  await expect(viewport).toBeFocused();

  await activateOrthoWire(page);

  const box = await canvasViewport(page).boundingBox();
  if (!box) {
    throw new Error("Missing canvas viewport bounds.");
  }
  const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });

  // The wire tool commits one segment per click, so two clicks = one segment.
  const p1 = at(0.3, 0.3);
  const p2 = at(0.3, 0.6);
  await page.mouse.click(p1.x, p1.y);
  await page.mouse.click(p2.x, p2.y);
  expect(countWireSegments(await readSource(page)), "the first wire should be one segment").toBe(1);

  // Re-arm with the tool's own key: this must drop the in-progress draft...
  await page.keyboard.press("m");

  // ...so this click only STARTS a new wire and commits nothing. If the draft had survived,
  // this same click would instead have committed a second segment onto the old wire.
  const p3 = at(0.7, 0.4);
  await page.mouse.click(p3.x, p3.y);
  expect(
    countWireSegments(await readSource(page)),
    "re-pressing the wire key did not re-arm the tool: the click extended the previous wire"
  ).toBe(1);
});
