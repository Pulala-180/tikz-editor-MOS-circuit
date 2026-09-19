import { expect, test, type Page } from "@playwright/test";
import { gotoApp, readSource, resetStorageBeforeNavigation, setSource, waitForHitRegions } from "./helpers";

// A component with a named pin, so hovering can reveal an anchor and its halo.
const PINNED_SOURCE = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (2,0);
    \coordinate (node_Mx.d) at (2,0);
  \end{scope}
\end{tikzpicture}`;

/**
 * Hover points along every hit region until anchors appear. Sampling matters: the reveal radius
 * is small (60px / zoom) while a pin sits at one END of its lead, so hovering only the region's
 * centre misses it entirely on anything but a very short line.
 */
async function revealAnchors(page: Page): Promise<boolean> {
  const regions = page.locator("[data-hit-region-target-id]");
  const dot = page.locator('[data-testid="node-anchor-dot"]');
  for (let index = 0; index < (await regions.count()); index += 1) {
    const box = await regions.nth(index).boundingBox();
    if (!box) continue;
    for (const fx of [0.5, 0.9, 0.98, 0.1, 0.02]) {
      for (const fy of [0.5, 0.1, 0.9]) {
        await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy, { steps: 6 });
        await page.waitForTimeout(80);
        if ((await dot.count()) > 0) {
          return true;
        }
      }
    }
  }
  return false;
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("revealed pins get a halo that cannot steal clicks from the dot", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, PINNED_SOURCE);
  await waitForHitRegions(page, 1);

  // Anchors only reveal while a drawing tool is active (the wire workflow).
  await page.evaluate(() => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: { dispatch?: (action: unknown) => void };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    api?.dispatch?.({ type: "SET_TOOL_MODE", mode: "addOrthoWire" });
  });

  const revealed = await revealAnchors(page);
  console.log("[counts]", JSON.stringify({
    revealed,
    dotCount: await page.locator('[data-testid="node-anchor-dot"]').count(),
    haloCount: await page.locator('[data-testid="node-anchor-halo"]').count()
  }));
  expect(revealed, "no pin anchor was revealed by hovering its lead").toBe(true);
  const halo = page.locator('[data-testid="node-anchor-halo"]').first();
  await expect(halo).toBeVisible();
  // Decorative only: a ring wider than the dot must never intercept the press.
  await expect(halo).toHaveCSS("pointer-events", "none");

  // Hovering a pin marks exactly that halo as the active target.
  const dot = page.locator('[data-testid="node-anchor-dot"]').first();
  const dotBox = await dot.boundingBox();
  if (!dotBox) {
    throw new Error("Missing anchor dot bounds.");
  }
  await page.mouse.move(dotBox.x + dotBox.width / 2, dotBox.y + dotBox.height / 2, { steps: 6 });
  await expect
    .poll(async () => page.locator('[data-testid="node-anchor-halo"][data-anchor-snapped="true"]').count())
    .toBe(1);

  // Sanity: the document itself is untouched by hovering.
  expect(await readSource(page)).toContain("node_Mx.d");
});
