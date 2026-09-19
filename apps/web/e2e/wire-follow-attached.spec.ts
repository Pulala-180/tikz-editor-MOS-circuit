import { expect, test, type Page } from "@playwright/test";
import { gotoApp, readSource, resetStorageBeforeNavigation, setSource, waitForHitRegions } from "./helpers";

// A circuit-mcp shaped component: a scope of raw \draw primitives with NO \coordinate pins, so its
// pin leads exist only as ordinary path endpoints. The drain lead ends at local (1.03,1), i.e.
// world (2.03,2), and a wire starts exactly there.
const MCP_STYLE_SOURCE = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(1,1)}]
    \draw[line width=0.32mm] (0.3,0.5) -- (0.56,0.5);
    \draw[line width=0.32mm] (0.7,0.70) -- (1.03,0.70) -- (1.03,1);
  \end{scope}
  \draw[thick, line cap=round] (2.03,2) -- (3,2);
\end{tikzpicture}`;

/** The one wire statement in the document (the only line cap=round draw). */
function wireLine(source: string): string {
  return source.split("\n").find((line) => line.includes("line cap=round")) ?? "";
}

function wirePoints(source: string): Array<[number, number]> {
  return [...wireLine(source).matchAll(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g)].map(
    (match) => [Number(match[1]), Number(match[2])] as [number, number]
  );
}

async function sceneSourceIds(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: { getSceneSourceIds?: () => string[] };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    return api?.getSceneSourceIds?.() ?? [];
  });
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("a coordinate-less component drags its attached wire along", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, MCP_STYLE_SOURCE);
  await waitForHitRegions(page, 1);

  const ids = await sceneSourceIds(page);
  console.log("[ids]", JSON.stringify(ids));

  const before = wirePoints(await readSource(page));
  expect(before.length, `wire not found in source`).toBe(2);

  // Drag a member of the scope; the app promotes an unselected member drag to a scope drag, which
  // moves the whole component. Pick a member whose hit region has a real 2D box -- Playwright calls
  // a purely horizontal/vertical path hidden (zero-height/width bbox).
  let dragBox: { x: number; y: number; width: number; height: number } | null = null;
  for (const id of ids) {
    const region = page.locator(`[data-hit-region-target-id='${id}']`).first();
    if ((await region.count()) === 0) continue;
    const candidate = await region.boundingBox();
    if (candidate && candidate.width > 0 && candidate.height > 0) {
      dragBox = candidate;
      break;
    }
  }
  if (!dragBox) {
    throw new Error(`No draggable member hit region found among ${JSON.stringify(ids)}`);
  }
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragBox.x + dragBox.width / 2 + 70, dragBox.y + dragBox.height / 2 + 45, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  const after = wirePoints(await readSource(page));
  console.log("[wire before]", JSON.stringify(before), "[wire after]", JSON.stringify(after));

  expect(after.length, `wire disappeared:\n${await readSource(page)}`).toBe(2);
  // The far end is anchored to nothing, so it must stay put...
  expect(Math.abs(after[1][0] - before[1][0])).toBeLessThan(0.02);
  expect(Math.abs(after[1][1] - before[1][1])).toBeLessThan(0.02);
  // ...while the end attached to the moved component must have followed it.
  const attachMoved = Math.hypot(after[0][0] - before[0][0], after[0][1] - before[0][1]);
  expect(attachMoved, "the attached wire end did not follow the component").toBeGreaterThan(0.2);
});
