import { expect, test, type Page } from "@playwright/test";
import { gotoApp, readSource, resetStorageBeforeNavigation, setSource, waitForHitRegions } from "./helpers";

// Dragging a component must keep its attached wires ORTHOGONAL, and must keep doing so under
// REPEATED drags.  The reported defect ("同一点连拖三次，线越拖越斜，最后塌掉") was an accumulation:
// the per-leg re-orthogonalisation tested the leg's direction with a 1e-6 epsilon, but the source
// writes coordinates to 2 decimals in cm and quantizes scope shifts to 0.1–1pt.  So after the FIRST
// drag a "horizontal" leg carried a ~1e-3 residual, the exact test read "neither horizontal nor
// vertical", the corner was never recomputed again, and the endpoint kept following the component --
// the tilt grew on every drag until the wire collapsed.  These tests drag the same component three
// times in three directions and require the wire to stay orthogonal (and attached) after EACH drag,
// with the off-axis residual staying sub-pixel rather than growing.

type Pt = [number, number];

function fixture(wire: string): string {
  return String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (0.8,0.8);
    \coordinate (node_A.g) at (0,0);
  \end{scope}
${wire}
\end{tikzpicture}`;
}

/** An ORTHOGONAL explicit polyline (what two-click + a hand-added middle point produces). */
const ORTHO_POLYLINE = fixture(String.raw`  \draw[thick, line cap=round] (node_A.g) -- (2.0,0) -- (2.0,2.4);`);
/** A polyline already tilted into an arbitrary diagonal by an earlier build (skew repair path). */
const SKEW_POLYLINE = fixture(String.raw`  \draw[thick, line cap=round] (node_A.g) -- (2.4,1.2) -- (3.4,2.6);`);
/** A two-click `|-` operator wire: its corner is derived by TikZ, nothing in the source can go stale. */
const OPERATOR_WIRE = fixture(String.raw`  \draw[thick, line cap=round] (node_A.g) |- (3,2.4);`);
/** A deliberate octagonal45 route: horizontal stub, exact 45° middle leg, vertical stub. */
const FORTY_FIVE_WIRE = fixture(String.raw`  \draw[thick, line cap=round] (node_A.g) -- (1.2,0) -- (2.4,1.2) -- (2.4,2.4);`);

async function readPaths(page: Page): Promise<Array<{ id: string; d: string; pts: Pt[] }>> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("path[data-source-id]")).map((element) => ({
      id: element.getAttribute("data-source-id") ?? "",
      d: element.getAttribute("d") ?? "",
      pts: [...(element.getAttribute("d") ?? "").matchAll(/(-?\d*\.?\d+)[\s,]+(-?\d*\.?\d+)/g)].map(
        (match) => [Number(match[1]), Number(match[2])] as [number, number]
      )
    }))
  );
}

/** The rendered wire: the one with the most points. */
async function wirePath(page: Page): Promise<{ id: string; d: string; pts: Pt[] }> {
  const all = await readPaths(page);
  all.sort((a, b) => b.pts.length - a.pts.length);
  expect(all[0]).toBeTruthy();
  return all[0];
}

/** Largest off-axis component of any segment, in SVG units. 0 = perfectly orthogonal. */
function maxTilt(pts: Pt[]): number {
  let worst = 0;
  for (let i = 0; i + 1 < pts.length; i += 1) {
    worst = Math.max(worst, Math.min(Math.abs(pts[i + 1][0] - pts[i][0]), Math.abs(pts[i + 1][1] - pts[i][1])));
  }
  return worst;
}

async function memberStrokePoint(page: Page): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(() => {
    const el = document.querySelector(`path[data-source-id='path:1']`) as SVGPathElement | null;
    if (!el) return null;
    const p = el.getPointAtLength(el.getTotalLength() * 0.5);
    const m = el.getScreenCTM();
    if (!m) return null;
    const sp = el.ownerSVGElement!.createSVGPoint();
    sp.x = p.x;
    sp.y = p.y;
    const s = sp.matrixTransform(m);
    return { x: s.x, y: s.y };
  });
  if (!point) throw new Error("scope member stroke point not found");
  return point;
}

/** Drag the component once by (dx,dy) screen px, starting from its current member position. */
async function dragComponentOnce(page: Page, dx: number, dy: number): Promise<void> {
  const from = await memberStrokePoint(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(250);
}

const DRAGS: Array<[number, number]> = [
  [45, 0],
  [0, 40],
  [-30, -35]
];

const SUB_PIXEL_TILT = 0.6;

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("repeated drags keep an explicit polyline attached wire orthogonal with no accumulating drift", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, ORTHO_POLYLINE);
  await waitForHitRegions(page, 2);

  const start = await wirePath(page);
  expect(maxTilt(start.pts), `fixture should start orthogonal: ${start.d}`).toBeLessThan(SUB_PIXEL_TILT);

  for (let i = 0; i < DRAGS.length; i += 1) {
    await dragComponentOnce(page, DRAGS[i][0], DRAGS[i][1]);
    const after = await wirePath(page);

    // 1. still attached: the wire's endpoint still coincides with the scope member's endpoint.
    const member = (await readPaths(page)).find((p) => p.id === "path:1");
    expect(member, "scope member missing").toBeTruthy();
    const wireEnd = after.pts[0];
    const memberEnd = member!.pts[0];
    expect(
      Math.hypot(wireEnd[0] - memberEnd[0], wireEnd[1] - memberEnd[1]),
      `drag ${i + 1}: wire detached from its pin: wire=${JSON.stringify(after.pts)} member=${JSON.stringify(member!.pts)}`
    ).toBeLessThan(0.6);

    // 2. every segment orthogonal, and the residual stays SUB-PIXEL (no accumulation).
    expect(
      maxTilt(after.pts),
      `drag ${i + 1}: wire drifted off-axis (accumulation): ${after.d}`
    ).toBeLessThan(SUB_PIXEL_TILT);

    // 3. the anchor reference survives (never materialised into a coordinate).
    const source = await readSource(page);
    const wireLine = source.split("\n").find((line) => line.includes("line cap=round")) ?? "";
    expect(wireLine, `drag ${i + 1}: anchor was materialised:\n${source}`).toContain("(node_A.g)");
  }
});

test("an already-skewed explicit wire is re-routed orthogonally by a drag", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, SKEW_POLYLINE);
  await waitForHitRegions(page, 2);

  const before = await wirePath(page);
  expect(maxTilt(before.pts), "fixture should start skewed").toBeGreaterThan(1);

  await dragComponentOnce(page, 45, 0);
  const after = await wirePath(page);
  expect(maxTilt(after.pts), `skew wire stayed skewed: ${after.d}`).toBeLessThan(SUB_PIXEL_TILT);

  const source = await readSource(page);
  const wireLine = source.split("\n").find((line) => line.includes("line cap=round")) ?? "";
  expect(wireLine, `anchor was materialised:\n${source}`).toContain("(node_A.g)");
});

test("a two-click operator wire stays orthogonal across repeated drags", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, OPERATOR_WIRE);
  await waitForHitRegions(page, 2);

  for (let i = 0; i < DRAGS.length; i += 1) {
    await dragComponentOnce(page, DRAGS[i][0], DRAGS[i][1]);
    const after = await wirePath(page);
    expect(
      maxTilt(after.pts),
      `drag ${i + 1}: operator wire skewed: ${after.d}`
    ).toBeLessThan(SUB_PIXEL_TILT);
  }
  // The operator form itself is never rewritten (TikZ derives the corner from the two ends).
  const source = await readSource(page);
  const wireLine = source.split("\n").find((line) => line.includes("line cap=round")) ?? "";
  expect(wireLine, `operator form was rewritten:\n${source}`).toMatch(/\|-|-\|/);
});

test("a deliberate 45-degree route is never straightened by a drag", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, FORTY_FIVE_WIRE);
  await waitForHitRegions(page, 2);

  const before = await wirePath(page);
  expect(before.pts.length, "fixture is a 4-point route").toBe(4);

  await dragComponentOnce(page, 90, 0);
  const after = await wirePath(page);
  expect(after.pts.length, `route lost its shape: ${after.d}`).toBe(4);
  const [p1, p2] = [after.pts[1], after.pts[2]];
  const middleDx = Math.abs(p2[0] - p1[0]);
  const middleDy = Math.abs(p2[1] - p1[1]);
  expect(middleDx, "middle leg collapsed to an axis").toBeGreaterThan(0.2);
  expect(
    Math.abs(middleDx - middleDy),
    `middle leg was straightened/skewed: ${after.d}`
  ).toBeLessThan(0.05);
});
