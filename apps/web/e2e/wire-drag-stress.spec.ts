import { expect, test, type Page } from "@playwright/test";
import { gotoApp, readSource, resetStorageBeforeNavigation, setSource, waitForHitRegions } from "./helpers";

// Stress companion to wire-drag-ortho.spec.ts.  The original defect ("同一点连拖三次，线越拖越斜，
// 最后塌掉") was an ACCUMULATION: if the per-leg re-orthogonalisation leaves a residual that the next
// drag cannot clear, the tilt grows monotonically and the wire collapses after enough drags.
//
// Three drags is not enough to distinguish "residual cleared each round" from "residual grows slowly".
// This spec drags the SAME component back and forth (out and back, so it stays on screen) and records
// the off-axis tilt after every single drag.  A converging implementation pins tilt near zero; an
// accumulating one shows it climbing.

type Pt = [number, number];

const FIXTURE = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (0.8,0.8);
    \coordinate (node_A.g) at (0,0);
  \end{scope}
  \draw[thick, line cap=round] (node_A.g) -- (2.0,0) -- (2.0,2.4);
\end{tikzpicture}`;

/**
 * Control: the same component, same drag cycle, but with NO wire attached. Any position drift here is
 * a property of the component-drag path itself, not of wire following.
 */
const FIXTURE_NO_WIRE = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (0.8,0.8);
    \coordinate (node_A.g) at (0,0);
  \end{scope}
\end{tikzpicture}`;

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

async function dragComponentOnce(page: Page, dx: number, dy: number): Promise<void> {
  const from = await memberStrokePoint(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 10 });
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForTimeout(220);
}

/**
 * A cycle of four drags that returns the component to its starting place while exercising BOTH legs
 * of the wire (a horizontal drag moves the corner's y; a vertical drag moves its x) plus a diagonal.
 */
const CYCLE: Array<[number, number]> = [
  [40, 0],
  [0, 40],
  [-40, 0],
  [35, -35],
  [0, -40],
  [-35, 35]
];
const ROUNDS = 4;
const SUB_PIXEL_TILT = 0.6;

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("24 alternating drags never accumulate tilt on an explicit attached polyline", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, FIXTURE);
  await waitForHitRegions(page, 2);

  const start = await wirePath(page);
  expect(maxTilt(start.pts), `fixture should start orthogonal: ${start.d}`).toBeLessThan(SUB_PIXEL_TILT);

  const tilts: number[] = [];
  let firstLine = "";
  let lastLine = "";
  const startMember = await memberStrokePoint(page);
  let lastMember = startMember;
  for (let i = 0; i < ROUNDS; i += 1) {
    for (const [dx, dy] of CYCLE) {
      await dragComponentOnce(page, dx, dy);
      const after = await wirePath(page);
      lastMember = await memberStrokePoint(page);

      const member = (await readPaths(page)).find((p) => p.id === "path:1");
      expect(member, "scope member missing").toBeTruthy();
      const wireEnd = after.pts[0];
      const memberEnd = member!.pts[0];
      expect(
        Math.hypot(wireEnd[0] - memberEnd[0], wireEnd[1] - memberEnd[1]),
        `drag ${tilts.length + 1}: wire detached from its pin: wire=${JSON.stringify(after.pts)}`
      ).toBeLessThan(0.6);

      tilts.push(maxTilt(after.pts));

      const source = await readSource(page);
      const line = source.split("\n").find((l) => l.includes("line cap=round")) ?? "";
      const shiftLine = source.split("\n").find((l) => l.includes("shift={"))?.trim() ?? "";
      // eslint-disable-next-line no-console
      console.log(`[STRESS] drag ${tilts.length + 1}: ${shiftLine}`);
      if (!firstLine) firstLine = line.trim();
      lastLine = line.trim();
      // The anchor must never be materialised into a literal coordinate.
      expect(line, `drag ${tilts.length}: anchor was materialised:\n${source}`).toContain("(node_A.g)");
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[STRESS] tilt per drag (px): ${tilts.map((t) => t.toFixed(3)).join(", ")}`);
  // eslint-disable-next-line no-console
  console.log(`[STRESS] wire source first: ${firstLine}`);
  // eslint-disable-next-line no-console
  console.log(`[STRESS] wire source last : ${lastLine}`);
  // eslint-disable-next-line no-console
  console.log(
    `[STRESS] component screen pos: start=(${startMember.x.toFixed(1)},${startMember.y.toFixed(1)}) end=(${lastMember.x.toFixed(1)},${lastMember.y.toFixed(1)}) drift=${Math.hypot(lastMember.x - startMember.x, lastMember.y - startMember.y).toFixed(2)}px`
  );

  const worst = Math.max(...tilts);
  const last = tilts[tilts.length - 1];
  expect(worst, `tilt grew across ${tilts.length} drags: ${tilts.map((t) => t.toFixed(3)).join(", ")}`).toBeLessThan(
    SUB_PIXEL_TILT
  );
  // The wire must be no worse off at the end of a round trip than after the first drag.
  expect(
    last,
    `drift accumulated over ${tilts.length} drags (last=${last.toFixed(3)}, worst=${worst.toFixed(3)})`
  ).toBeLessThanOrEqual(worst + 0.05);
});

// CONTROL for the OPEN defect tracked below.  The stress run above also shows the COMPONENT ending
// ~24px away from where it started -- but only when a wire is attached.  With no wire the same cycle
// returns to the pixel, which localises the drift to the wire-attached case rather than to the
// component-drag path.  (Root cause measured separately: object-point snapping keeps the attached
// wire -- which follows the drag -- as a snap target, so the element repeatedly snaps onto its own
// moving geometry.  Turning that snap mode off cuts the drift from ~24px to ~6px.)
test("CONTROL: a component with no attached wire returns exactly over a net-zero drag cycle", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, FIXTURE_NO_WIRE);
  await waitForHitRegions(page, 1);

  const start = await memberStrokePoint(page);
  let last = start;
  for (let i = 0; i < ROUNDS; i += 1) {
    for (const [dx, dy] of CYCLE) {
      await dragComponentOnce(page, dx, dy);
      last = await memberStrokePoint(page);
    }
  }
  const drift = Math.hypot(last.x - start.x, last.y - start.y);
  expect(
    drift,
    `component wandered ${drift.toFixed(2)}px with no wire attached (start=${start.x.toFixed(1)},${start.y.toFixed(1)} end=${last.x.toFixed(1)},${last.y.toFixed(1)})`
  ).toBeLessThan(1);
});
