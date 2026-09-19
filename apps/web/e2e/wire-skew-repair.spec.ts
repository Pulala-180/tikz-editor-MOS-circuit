import { expect, test, type Page } from "@playwright/test";
import { gotoApp, readSource, resetStorageBeforeNavigation, setSource, waitForHitRegions } from "./helpers";

// Skewed-wire repair channel.
//
// The wire-follow re-orthogonalisation only ever re-derives a corner ALONG ITS ORIGINAL leg
// direction, so a leg that is ALREADY a stale arbitrary diagonal can never heal itself. These
// wires were skewed by earlier builds and the skew is now baked into the source. The repair pass
// re-routes the whole wire orthogonally between its two ends whenever an attached leg is a
// genuine arbitrary diagonal -- while never touching deliberate `octagonal45` / `anyAngle` routes
// and never materialising an anchor reference into a coordinate.

// Two component scopes, each exposing one pin, joined by a wire whose THREE legs are all skewed
// (arbitrary angles: ~26.6°, ~25.2°, ~20° -- none is within the 8° axis band nor a 45° run).
const SKEWED_TWO_ANCHOR_WIRE = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (0.8,0.8);
    \coordinate (node_M1.g) at (0,0);
  \end{scope}
  \begin{scope}[shift={(4.2,-1.1)}]
    \draw[thick] (0,0) -- (0.8,0.8);
    \coordinate (node_M2.d) at (0,0);
  \end{scope}
  \draw[thick, line cap=round] (node_M1.g) -- (1.4,-0.7) -- (3.1,-1.5) -- (node_M2.d);
\end{tikzpicture}`;

// A deliberate `octagonal45` route: horizontal stub, exact 45° middle leg, vertical stub. It is
// attached at the horizontal-stub end, so a HORIZONTAL drag along the stub keeps it intact under
// the pre-existing follow logic -- which is exactly the bar the repair pass must not lower.
const FORTY_FIVE_DEGREE_WIRE = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (0.8,0.8);
    \coordinate (node_M1.g) at (0,0);
  \end{scope}
  \draw[thick, line cap=round] (node_M1.g) -- (1.2,0) -- (2.4,1.2) -- (2.4,2.4);
\end{tikzpicture}`;

type Pt = [number, number];
type Box = { x: number; y: number; width: number; height: number };

async function readPaths(page: Page): Promise<Map<string, Pt[]>> {
  const entries = await page.evaluate(() =>
    Array.from(document.querySelectorAll("path[data-source-id]")).map((element) => ({
      id: element.getAttribute("data-source-id") ?? "",
      points: [...(element.getAttribute("d") ?? "").matchAll(/(-?\d*\.?\d+)[\s,]+(-?\d*\.?\d+)/g)].map(
        (match) => [Number(match[1]), Number(match[2])] as [number, number]
      )
    }))
  );
  return new Map(entries.filter((entry) => entry.id).map((entry) => [entry.id, entry.points]));
}

/** The one rendered path carrying `count` points (the wire; the scope members carry 2). */
async function wirePath(page: Page, count: number): Promise<{ id: string; points: Pt[] }> {
  const paths = await readPaths(page);
  for (const [id, points] of paths) {
    if (points.length === count) {
      return { id, points };
    }
  }
  throw new Error(`no rendered path with ${count} points among ${JSON.stringify([...paths.keys()])}`);
}

async function sceneSourceIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: { getSceneSourceIds?: () => string[] };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    return api?.getSceneSourceIds?.() ?? [];
  });
}

/** A draggable scope-member box (real 2D area), excluding the wire itself. */
async function memberBoxes(page: Page, wireId: string): Promise<Box[]> {
  const boxes: Box[] = [];
  for (const id of await sceneSourceIds(page)) {
    if (id === wireId) continue;
    const region = page.locator(`[data-hit-region-target-id='${id}']`).first();
    if ((await region.count()) === 0) continue;
    const box = await region.boundingBox();
    if (box && box.width > 0 && box.height > 0) boxes.push(box);
  }
  boxes.sort((a, b) => a.x + a.width / 2 - (b.x + b.width / 2));
  return boxes;
}

/**
 * Every segment within 1 degree of an axis. A small absolute slack covers source rounding to
 * 2 decimals in cm plus the scope-shift quantisation to whole pt on commit (a leg can be off by
 * a few hundredths of an SVG unit and still be visually dead straight).
 */
const ORTHO_TAN_1DEG = Math.tan((1 * Math.PI) / 180);
function everySegmentOrthogonal(points: Pt[], slack = 0.05): boolean {
  for (let index = 0; index + 1 < points.length; index += 1) {
    const dx = Math.abs(points[index + 1][0] - points[index][0]);
    const dy = Math.abs(points[index + 1][1] - points[index][1]);
    const lo = Math.min(dx, dy);
    const hi = Math.max(dx, dy);
    if (lo > hi * ORTHO_TAN_1DEG + slack) {
      return false;
    }
  }
  return true;
}

/** The committed wire statement (the only source line carrying `--` and a numeric pair list). */
function wireLine(source: string): string {
  return source.split("\n").find((line) => line.includes("line cap=round")) ?? "";
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("dragging a component re-routes an already-skewed attached wire orthogonally", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, SKEWED_TWO_ANCHOR_WIRE);
  await waitForHitRegions(page, 3);

  const before = await wirePath(page, 4);
  // Fixture sanity: the wire really is skewed before the drag.
  expect(everySegmentOrthogonal(before.points), "fixture wire should start skewed").toBe(false);

  const boxes = await memberBoxes(page, before.id);
  const mover = boxes[boxes.length - 1]; // the right-hand scope (node_M2)
  expect(mover, "expected a draggable scope member").toBeTruthy();

  const startX = mover.x + mover.width / 2;
  const startY = mover.y + mover.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 70, startY + 45, { steps: 10 });
  await page.waitForTimeout(160);

  // Transient (mid-drag): the preview must already be orthogonal.
  const during = await wirePath(page, 4);
  expect(during.id, "wire identity changed mid-drag").toBe(before.id);
  expect(
    everySegmentOrthogonal(during.points),
    `transient wire stayed skewed mid-drag: ${JSON.stringify(during.points)}`
  ).toBe(true);
  await page.mouse.up();
  await page.waitForTimeout(250);

  // Committed render: every segment orthogonal.
  const after = await wirePath(page, 4);
  expect(
    everySegmentOrthogonal(after.points),
    `rendered wire stayed skewed after commit: ${JSON.stringify(after.points)}`
  ).toBe(true);

  // Committed source: both anchor references survive, the stale coordinates are gone.
  const source = await readSource(page);
  const line = wireLine(source);
  expect(line, `wire line missing:\n${source}`).toContain("(node_M1.g)");
  expect(line, `attached anchor end was materialised:\n${source}`).toContain("(node_M2.d)");
  expect(line, `stale interior coordinate survived:\n${source}`).not.toContain("(1.4");
  expect(line, `stale interior coordinate survived:\n${source}`).not.toContain("(3.1");
  // The two authored interior points now sit on one horizontal level (H-V-H re-route).
  const numbers = [...line.matchAll(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2])
  }));
  expect(numbers.length, `expected two source interior points:\n${source}`).toBe(2);
  expect(Math.abs(numbers[0].y - numbers[1].y), `source middle leg is not horizontal:\n${source}`).toBeLessThan(0.05);
});

test("a deliberate 45-degree route is never straightened by the repair", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, FORTY_FIVE_DEGREE_WIRE);
  await waitForHitRegions(page, 2);

  const before = await wirePath(page, 4);
  // Fixture sanity: middle leg is exactly 45 degrees.
  const [p1, p2] = [before.points[1], before.points[2]];
  expect(Math.abs(Math.abs(p2[0] - p1[0]) - Math.abs(p2[1] - p1[1]))).toBeLessThan(0.05);

  const boxes = await memberBoxes(page, before.id);
  const mover = boxes[boxes.length - 1];
  expect(mover, "expected a draggable scope member").toBeTruthy();

  // Drag purely HORIZONTALLY along the stub so the pre-existing follow logic preserves the route;
  // the repair pass must not be the one that bends it.
  const startX = mover.x + mover.width / 2;
  const startY = mover.y + mover.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 90, startY, { steps: 10 });
  await page.waitForTimeout(160);
  await page.mouse.up();
  await page.waitForTimeout(250);

  const after = await wirePath(page, 4);
  const [a1, a2] = [after.points[1], after.points[2]];
  const middleDx = Math.abs(a2[0] - a1[0]);
  const middleDy = Math.abs(a2[1] - a1[1]);
  expect(
    Math.abs(middleDx - middleDy),
    `middle leg was straightened/skewed: ${JSON.stringify(after.points)}`
  ).toBeLessThan(0.05);
  expect(middleDx, "middle leg collapsed to an axis").toBeGreaterThan(0.2);

  const source = await readSource(page);
  expect(wireLine(source), `45-degree interior was rewritten:\n${source}`).toContain("(2.4,1.2)");
});
