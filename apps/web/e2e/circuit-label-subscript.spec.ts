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

test("the tenth MOSFET keeps its index inside the subscript ($M_{10}$, never $M_10$)", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, EMPTY_SOURCE);

  const viewport = canvasViewport(page);
  await expect(viewport).toBeVisible();
  const box = await viewport.boundingBox();
  if (!box) {
    throw new Error("Missing canvas viewport bounds.");
  }

  // Stamp ten nMOS devices across the canvas so the family index reaches two digits.
  for (let i = 0; i < 10; i += 1) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    await placeTool(page, "addNMOS", {
      x: box.x + box.width * (0.15 + col * 0.16),
      y: box.y + box.height * (0.3 + row * 0.35)
    });
  }

  // The tenth placement must commit before we assert on the document.
  await expect
    .poll(async () => (await readSource(page)).includes("node_M10"), {
      timeout: 15_000,
      intervals: [100, 200, 400, 800]
    })
    .toBe(true);

  const source = await readSource(page);

  // The placeholder id must never reach the document.
  expect(source, `placeholder id survived:\n${source}`).not.toContain("node_Mx");

  // The tenth MOSFET owns node_M10 and its label keeps the two-digit index inside braces.
  expect(source, `missing two-digit pin id:\n${source}`).toContain("node_M10");
  expect(source, `expected $M_{10}$, source was:\n${source}`).toContain("$M_{10}$");
  // The first instance is braced too, and no unbraced subscript survives anywhere.
  expect(source, `expected $M_{1}$, source was:\n${source}`).toContain("$M_{1}$");
  expect(source, `unbraced subscript would render as M₁0:\n${source}`).not.toMatch(/\$M_\d/);

  // Render audit: the emitted math SVG typesets "10" as one two-character subscript
  // (Arial text engine: `tspan[baseline-shift="-30%"]`) rather than a subscripted "1"
  // trailing a full-size "0". With the old unbraced `$M_10$` this node never appears, so
  // the poll below fails on the bug and passes on the fix.
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const svgs = Array.from(document.querySelectorAll('svg[data-text-renderer="mathjax"]'));
          for (const svg of svgs) {
            const subscriptGlyphs = Array.from(svg.querySelectorAll('tspan[baseline-shift="-30%"]'));
            if (subscriptGlyphs.some((glyph) => (glyph.textContent ?? "").replace(/\s+/g, "") === "10")) {
              return true;
            }
          }
          return false;
        }),
      { timeout: 20_000, intervals: [100, 200, 400, 800] }
    )
    .toBe(true);
});
