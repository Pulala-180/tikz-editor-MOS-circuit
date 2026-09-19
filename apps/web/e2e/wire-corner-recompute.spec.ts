import { expect, test, type Page } from "@playwright/test";
import { gotoApp, readSource, resetStorageBeforeNavigation, setSource, waitForHitRegions } from "./helpers";

// Two "corner froze" defects on wires whose corner is NOT a path-point handle the user can grab:
//
//  A) OPERATOR wires: `(a) |- (b)` derives its corner in TikZ -- it has no edit handle. A
//     pointer-down on the corner fell through to the element drag and translated the WHOLE wire
//     ("整条线飞起来"). The fix grabs the implicit corner and materialises `a -- (corner) -- b`,
//     keeping both endpoints (anchors included) byte-for-byte.
//
//  B) EXPLICIT polylines: `(a) -- (corner) -- (b)`. When `b`'s component moves, wire-follow
//     rewrites `b` to follow, but the authored interior corner stayed put -- so the leg between
//     them slid into a diagonal. The fix re-orthogonalises the ONE corner adjacent to the moving
//     end (horizontal leg keeps its y, vertical leg keeps its x); every other corner and the far
//     end stay put.

const OPERATOR_WIRE = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (1,1);
    \draw[thick] (0,0) -- (2,0);
    \coordinate (node_M1.d) at (2,0);
  \end{scope}
  \draw[thick, line cap=round] (node_M1.d) |- (3,3);
\end{tikzpicture}`;

// The scope (moved by the test) exposes the port (2,0). The polyline's last point (2,0) sits on
// that port, so it follows the component; its interior corner (2,1) sits a VERTICAL leg away.
const EXPLICIT_POLYLINE = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (1,1);
    \draw[thick] (0,0) -- (2,0);
    \coordinate (node_M1.d) at (2,0);
  \end{scope}
  \draw[thick, line cap=round] (0,1) -- (2,1) -- (2,0);
\end{tikzpicture}`;

type ThreePointPath = {
  sourceId: string;
  points: [number, number][];
  cornerScreen: { x: number; y: number };
};

/** The rendered 3-point path reaching furthest right (the wire; scope primitives are 2-point). */
async function readThreePointPath(page: Page): Promise<ThreePointPath> {
  const result = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("path[data-source-id]"))
      .map((element) => {
        const d = element.getAttribute("d") ?? "";
        const points = [...d.matchAll(/(-?\d*\.?\d+)[\s,]+(-?\d*\.?\d+)/g)].map(
          (match) => [Number(match[1]), Number(match[2])] as [number, number]
        );
        return { element, sourceId: element.getAttribute("data-source-id") ?? "", points };
      })
      .filter((candidate) => candidate.points.length === 3);

    const wire = candidates.sort(
      (a, b) =>
        Math.max(...b.points.map((p) => p[0])) - Math.max(...a.points.map((p) => p[0]))
    )[0];
    if (!wire) {
      return null;
    }
    const svg = wire.element.ownerSVGElement;
    const ctm = wire.element.getScreenCTM();
    if (!svg || !ctm) {
      return null;
    }
    const svgPoint = svg.createSVGPoint();
    svgPoint.x = wire.points[1][0];
    svgPoint.y = wire.points[1][1];
    const screen = svgPoint.matrixTransform(ctm);
    return {
      sourceId: wire.sourceId,
      points: wire.points,
      cornerScreen: { x: screen.x, y: screen.y }
    };
  });
  expect(result, "expected a rendered 3-point wire").toBeTruthy();
  return result as ThreePointPath;
}

/** A hit region with a real 2D box (not the thin wire) — dragging it moves the scope. */
async function draggableMemberBox(page: Page, excludeSourceId: string): Promise<{ x: number; y: number; width: number; height: number }> {
  const ids = await page.evaluate(() => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: { getSceneSourceIds?: () => string[] };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    return api?.getSceneSourceIds?.() ?? [];
  });
  for (const id of ids) {
    if (id === excludeSourceId) continue;
    const region = page.locator(`[data-hit-region-target-id='${id}']`).first();
    if ((await region.count()) === 0) continue;
    const box = await region.boundingBox();
    if (box && box.width > 0 && box.height > 0) return box;
  }
  throw new Error(`No draggable member box found among ${JSON.stringify(ids)}`);
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("grabbing an operator wire's implicit corner moves ONLY the corner (endpoints pinned)", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, OPERATOR_WIRE);
  await waitForHitRegions(page, 1);

  const before = await readThreePointPath(page);
  // `|-` = vertical first: p0/p1 share x, p1/p2 share y.
  expect(Math.abs(before.points[0][0] - before.points[1][0]), "fixture leg 1 is not vertical").toBeLessThan(0.05);

  const start = before.cornerScreen;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 45, start.y + 45, { steps: 10 });
  await page.waitForTimeout(220);

  const during = await readThreePointPath(page);
  expect(during.sourceId, "the wire identity changed mid-drag").toBe(before.sourceId);
  // Endpoints pinned (this is the regression: the old element-drag fallback translated the wire).
  expect(Math.abs(during.points[0][0] - before.points[0][0]), "anchor end moved mid-drag").toBeLessThan(0.05);
  expect(Math.abs(during.points[0][1] - before.points[0][1]), "anchor end moved mid-drag").toBeLessThan(0.05);
  expect(Math.abs(during.points[2][0] - before.points[2][0]), "far end moved mid-drag").toBeLessThan(0.05);
  expect(Math.abs(during.points[2][1] - before.points[2][1]), "far end moved mid-drag").toBeLessThan(0.05);
  // The corner itself moved.
  const cornerMoved = Math.hypot(
    during.points[1][0] - before.points[1][0],
    during.points[1][1] - before.points[1][1]
  );
  expect(cornerMoved, `corner did not move mid-drag (d=${JSON.stringify(during.points)})`).toBeGreaterThan(1);

  await page.mouse.up();
  await page.waitForTimeout(250);

  const after = await readThreePointPath(page);
  expect(Math.abs(after.points[0][0] - before.points[0][0]), "anchor end moved on commit").toBeLessThan(0.05);
  expect(Math.abs(after.points[0][1] - before.points[0][1]), "anchor end moved on commit").toBeLessThan(0.05);
  expect(Math.abs(after.points[2][0] - before.points[2][0]), "far end moved on commit").toBeLessThan(0.05);
  expect(Math.abs(after.points[2][1] - before.points[2][1]), "far end moved on commit").toBeLessThan(0.05);
  const committedSource = await readSource(page);
  expect(
    committedSource,
    `committed source should materialise the corner as an explicit polyline and keep both ends:\n${committedSource}`
  ).toMatch(/\(node_M1\.d\)\s*--\s*\([^)]*\)\s*--\s*\(3,3\)/);
});

test("dragging a component re-orthogonalises the polyline corner next to its attached end", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, EXPLICIT_POLYLINE);
  await waitForHitRegions(page, 1);

  const before = await readThreePointPath(page);
  const polylineId = before.sourceId;
  // Fixture: (0,1) -- (2,1) -- (2,0); the attached end (2,0) is a VERTICAL leg from corner (2,1).
  expect(Math.abs(before.points[1][0] - before.points[2][0]), "fixture leg 2 is not vertical").toBeLessThan(0.05);

  const box = await draggableMemberBox(page, polylineId);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 90, startY, { steps: 10 });
  await page.waitForTimeout(220);

  const during = await readThreePointPath(page);
  expect(during.sourceId, "the wire identity changed mid-drag").toBe(polylineId);
  // The attached end followed the component...
  expect(during.points[2][0] - before.points[2][0], "attached end did not follow mid-drag").toBeGreaterThan(1);
  // ...the far end stayed put...
  expect(Math.abs(during.points[0][0] - before.points[0][0]), "far end drifted mid-drag").toBeLessThan(0.05);
  expect(Math.abs(during.points[0][1] - before.points[0][1]), "far end drifted mid-drag").toBeLessThan(0.05);
  // ...and the adjacent corner was re-orthogonalised: the leg stays vertical (frozen corner -> diagonal).
  expect(
    Math.abs(during.points[1][0] - during.points[2][0]),
    `leg went diagonal mid-drag: adjacent corner not recomputed (d=${JSON.stringify(during.points)})`
  ).toBeLessThan(0.05);
  // The corner moved in x only (it keeps the y of the leg it terminates).
  expect(Math.abs(during.points[1][1] - before.points[1][1]), "corner y drifted mid-drag").toBeLessThan(0.05);
  expect(Math.abs(during.points[1][0] - before.points[1][0]), "corner did not move mid-drag").toBeGreaterThan(1);

  await page.mouse.up();
  await page.waitForTimeout(250);

  const after = await readThreePointPath(page);
  expect(Math.abs(after.points[0][0] - before.points[0][0]), "far end drifted on commit").toBeLessThan(0.05);
  expect(Math.abs(after.points[0][1] - before.points[0][1]), "far end drifted on commit").toBeLessThan(0.05);
  expect(Math.abs(after.points[1][0] - after.points[2][0]), "committed leg went diagonal").toBeLessThan(0.05);
  expect(
    Math.abs(after.points[1][1] - before.points[1][1]),
    `committed corner should keep its y (only x follows the moved end) (d=${JSON.stringify(after.points)})`
  ).toBeLessThan(0.05);
});
