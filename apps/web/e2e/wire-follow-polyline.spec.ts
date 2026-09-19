import { expect, test, type Page } from "@playwright/test";
import { gotoApp, readSource, resetStorageBeforeNavigation, setSource, waitForHitRegions } from "./helpers";

// Two separate \draw statements share the endpoint (2,2):
//   A: (0,0) -- (2,2)           <- the 2-point element we drag. Diagonal, so its hit
//                                  region has a non-empty bounding box (Playwright treats
//                                  a purely horizontal/vertical path as invisible).
//   B: (2,2) -- (4,2) -- (4,4)  <- attached polyline; its elbow at (4,2) must survive the drag
const SHARED_ENDPOINT_SOURCE = String.raw`\begin{tikzpicture}
  \draw[thick] (0,0) -- (2,2);
  \draw[thick] (2,2) -- (4,2) -- (4,4);
\end{tikzpicture}`;

/** Point counts (M/L commands) per rendered path, keyed by data-source-id. */
async function pathPointCounts(page: Page): Promise<Map<string, number>> {
  const entries = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("path[data-source-id]")).map((element) => {
      const id = element.getAttribute("data-source-id") ?? "";
      const d = element.getAttribute("d") ?? "";
      return { id, count: (d.match(/[ML]/g) ?? []).length };
    });
  });
  return new Map(entries.filter((entry) => entry.id).map((entry) => [entry.id, entry.count]));
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("attached polyline keeps its elbows while its component is dragged", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, SHARED_ENDPOINT_SOURCE);
  await waitForHitRegions(page, 2);

  const before = await pathPointCounts(page);
  const polylineId = [...before.entries()].find(([, count]) => count >= 3)?.[0];
  const moverId = [...before.entries()].find(([, count]) => count === 2)?.[0];
  expect(polylineId, "expected a rendered polyline carrying 3+ points").toBeTruthy();
  expect(moverId, "expected a rendered 2-point path to drag").toBeTruthy();

  const region = page.locator(`[data-hit-region-target-id='${moverId}']`).first();
  await expect(region).toBeVisible();
  const box = await region.boundingBox();
  if (!box) {
    throw new Error("Missing drag target bounds.");
  }

  // Drag, then hold the gesture open so the transient 120 FPS rewrite is observable.
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 60, startY + 40, { steps: 8 });
  await page.waitForTimeout(120);

  const duringCount = (await pathPointCounts(page)).get(polylineId as string) ?? 0;
  expect(
    duringCount,
    `attached polyline collapsed into a straight segment mid-drag (points=${duringCount}, expected >= 3)`
  ).toBeGreaterThanOrEqual(3);

  await page.mouse.up();

  // The committed source must keep BOTH segments of the attached polyline.
  const after = await readSource(page);
  expect((after.match(/--/g) ?? []).length, `source lost polyline segments:\n${after}`).toBeGreaterThanOrEqual(3);
});
