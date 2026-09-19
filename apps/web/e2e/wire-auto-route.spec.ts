import { expect, test, type Page } from "@playwright/test";
import { gotoApp, readSource, resetStorageBeforeNavigation, setSource, waitForHitRegions } from "./helpers";

/**
 * Two pins at the SAME height with a component between them — the common schematic case, and the
 * one where a naive L-route has nowhere to go. The obstacle sits on the straight line, so a router
 * that ignores components must cross it.
 */
const OBSTACLE_SOURCE = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (1,0);
    \coordinate (node_A.p) at (1,0);
  \end{scope}
  \begin{scope}[shift={(5,0)}]
    \draw[thick] (0,0) -- (1,0);
    \coordinate (node_B.p) at (0,0);
  \end{scope}
  \draw[fill=red] (2.2,-0.6) rectangle (3.2,0.6);
\end{tikzpicture}`;

/** Same, plus an existing wire lying exactly on the straight path between the pins. */
const COINCIDENT_SOURCE = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (1,0);
    \coordinate (node_A.p) at (1,0);
  \end{scope}
  \begin{scope}[shift={(5,0)}]
    \draw[thick] (0,0) -- (1,0);
    \coordinate (node_B.p) at (0,0);
  \end{scope}
  \draw[thick] (1.6,0) -- (4.4,0);
\end{tikzpicture}`;

/** Two pins far apart with a clear field. */
const FREE_SOURCE = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (1,0);
    \coordinate (node_A.p) at (1,0);
  \end{scope}
  \begin{scope}[shift={(5,3)}]
    \draw[thick] (0,0) -- (1,0);
    \coordinate (node_B.p) at (0,0);
  \end{scope}
\end{tikzpicture}`;

/**
 * A pin sits at the END of its component's lead. The wire must LEAVE along that lead's direction and
 * ARRIVE along the other pin's direction — otherwise it turns 90° right at the pin, which reads as a
 * wrong connection. Here `node_L.d` tops a VERTICAL lead and `node_R.g` starts a HORIZONTAL one, so
 * the route has to be vertical-then-horizontal: `(node_L.d) |- (node_R.g)`.
 */
const LEAD_ORIENTATION_SOURCE = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (0,2);
    \coordinate (node_L.d) at (0,2);
  \end{scope}
  \begin{scope}[shift={(4,4)}]
    \draw[thick] (0,0) -- (1,0);
    \coordinate (node_R.g) at (0,0);
  \end{scope}
\end{tikzpicture}`;

async function activateTool(page: Page, mode: string): Promise<void> {
  await page.evaluate((nextMode) => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: { dispatch?: (action: unknown) => void };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    api?.dispatch?.({ type: "SET_TOOL_MODE", mode: nextMode });
  }, mode);
}

/**
 * Anchor dots only exist while hovered, so reading them must never wait for "stability" — a
 * Playwright boundingBox() on a dot that fades would block until its own timeout and hang the test.
 * Read the rect straight out of the DOM instead.
 */
async function revealPin(page: Page, anchorNode: string): Promise<{ x: number; y: number } | null> {
  const regions = page.locator("[data-hit-region-target-id]");
  const selector = `[data-testid="node-anchor-dot"][data-anchor-node="${anchorNode}"]`;
  for (let index = 0; index < (await regions.count()); index += 1) {
    const box = await regions.nth(index).boundingBox();
    if (!box) continue;
    for (const fx of [0.5, 0.9, 0.98, 0.1, 0.02]) {
      for (const fy of [0.5, 0.1, 0.9]) {
        await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy, { steps: 4 });
        await page.waitForTimeout(60);
        const dotBox = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }, selector);
        if (dotBox && dotBox.width > 0) {
          return { x: dotBox.x + dotBox.width / 2, y: dotBox.y + dotBox.height / 2 };
        }
      }
    }
  }
  return null;
}

type Pt = { x: number; y: number };

/** The line produced by the last write: its numeric waypoints, in order. */
function numericWaypoints(source: string): Pt[] {
  const drawn = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("\\draw") && line.includes("--") && !line.includes("rectangle"))
    .pop();
  if (!drawn) return [];
  return [...drawn.matchAll(/\((-?[0-9.]+),(-?[0-9.]+)\)/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2])
  }));
}

function segmentsCrossRect(points: Pt[], rect: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
  const inside = (p: Pt): boolean =>
    p.x > rect.minX + 1e-6 && p.x < rect.maxX - 1e-6 && p.y > rect.minY + 1e-6 && p.y < rect.maxY - 1e-6;
  const ccw = (a: Pt, b: Pt, c: Pt): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const segX = (a: Pt, b: Pt, c: Pt, d: Pt): boolean => {
    const d1 = ccw(a, b, c);
    const d2 = ccw(a, b, d);
    const d3 = ccw(c, d, a);
    const d4 = ccw(c, d, b);
    return d1 * d2 < 0 && d3 * d4 < 0;
  };
  const corners: Pt[] = [
    { x: rect.minX, y: rect.minY },
    { x: rect.maxX, y: rect.minY },
    { x: rect.maxX, y: rect.maxY },
    { x: rect.minX, y: rect.maxY }
  ];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (inside(a) || inside(b)) return true;
    for (let k = 0; k < 4; k += 1) {
      if (segX(a, b, corners[k], corners[(k + 1) % 4])) return true;
    }
  }
  return false;
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("two clicks on two pins lay the whole wire in one action", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, FREE_SOURCE);
  await waitForHitRegions(page, 1);
  await activateTool(page, "addOrthoWire");

  const before = await readSource(page);
  const beforeDraws = (before.match(/line cap=round/g) ?? []).length;

  const target = await revealPin(page, "node_B");
  const start = await revealPin(page, "node_A");
  expect(start, "node_A pin never revealed").not.toBeNull();
  expect(target, "node_B pin never revealed").not.toBeNull();
  if (!start || !target) throw new Error("unreachable");

  // Just two clicks — no third click to finish the route.
  await page.mouse.click(start.x, start.y);
  await page.waitForTimeout(200);
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(400);

  const source = await readSource(page);
  console.log("[2CLICK] source:", JSON.stringify(source));

  expect((source.match(/line cap=round/g) ?? []).length, `no new wire was written:\n${source}`).toBe(
    beforeDraws + 1
  );
  // Both ends anchored by name, and the route has at least one corner coordinate in between.
  // Both pins lead horizontally, so the route is written as the fully-relative `-|` corner:
  // there is no hard-coded corner left to go stale when a component moves.
  expect(source, `expected a relative corner route:\n${source}`).toMatch(
    /\(node_A\.p\)\s*(?:-\||\|-)\s*\(node_B\.p\)/
  );
});

test("the route goes around a component sitting on the straight path", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, OBSTACLE_SOURCE);
  await waitForHitRegions(page, 1);
  await activateTool(page, "addOrthoWire");

  const target = await revealPin(page, "node_B");
  const start = await revealPin(page, "node_A");
  if (!start || !target) throw new Error("could not reveal both pins");

  await page.mouse.click(start.x, start.y);
  await page.waitForTimeout(200);
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(400);

  const source = await readSource(page);
  console.log("[AVOID-PART] source:", JSON.stringify(source));

  const waypoints = numericWaypoints(source);
  expect(waypoints.length).toBeGreaterThan(0);

  // The full polyline includes both pin positions, which are known from the source above.
  const polyline: Pt[] = [{ x: 1, y: 0 }, ...waypoints, { x: 5, y: 0 }];
  const cleared = !segmentsCrossRect(polyline, { minX: 2.2, minY: -0.6, maxX: 3.2, maxY: 0.6 });
  console.log("[AVOID-PART] polyline:", JSON.stringify(polyline), "cleared:", cleared);
  expect(cleared, `the route still crosses the component rect:\n${source}`).toBe(true);
  // And it must have actually detoured, not just been lucky.
  expect(waypoints.some((p) => Math.abs(p.y) > 0.6), "no detour was produced").toBe(true);
});

test("the route does not lie on an existing wire", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, COINCIDENT_SOURCE);
  await waitForHitRegions(page, 1);
  await activateTool(page, "addOrthoWire");

  const target = await revealPin(page, "node_B");
  const start = await revealPin(page, "node_A");
  if (!start || !target) throw new Error("could not reveal both pins");

  await page.mouse.click(start.x, start.y);
  await page.waitForTimeout(200);
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(400);

  const source = await readSource(page);
  console.log("[AVOID-WIRE] source:", JSON.stringify(source));

  const waypoints = numericWaypoints(source);
  expect(waypoints.length).toBeGreaterThan(0);
  // A route that stayed on y = 0 would sit exactly on the existing wire.
  expect(
    waypoints.some((p) => Math.abs(p.y) > 1e-3),
    `the route lies on the existing wire:\n${source}`
  ).toBe(true);
});

test("a hand-placed waypoint between two anchors survives instead of being re-routed away", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, FREE_SOURCE);
  await waitForHitRegions(page, 1);
  await activateTool(page, "addOrthoWire");

  const beforeDraws = ((await readSource(page)).match(/line cap=round/g) ?? []).length;

  const target = await revealPin(page, "node_B");
  const start = await revealPin(page, "node_A");
  if (!start || !target) throw new Error("could not reveal both pins");

  // Pin A, then a hand-placed waypoint out in empty space...
  await page.mouse.click(start.x, start.y);
  await page.waitForTimeout(200);
  const layer = page.locator("[data-canvas-viewport='true'] svg").last();
  const box = await layer.boundingBox();
  if (!box) throw new Error("canvas layer has no bounds");
  await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.22);
  await page.waitForTimeout(250);
  const afterWaypoint = await readSource(page);
  expect(
    (afterWaypoint.match(/line cap=round/g) ?? []).length,
    `the hand-placed leg was not written:\n${afterWaypoint}`
  ).toBe(beforeDraws + 1);

  // ...then the destination pin, which must simply finish the hand-drawn route. Re-reveal it first:
  // writing the waypoint leg grows the drawing bounds, which can refit the view and move every
  // screen position captured before it.
  const targetNow = await revealPin(page, "node_B");
  expect(targetNow, "destination pin never revealed on the second pass").not.toBeNull();
  if (!targetNow) throw new Error("unreachable");
  await page.mouse.click(targetNow.x, targetNow.y);
  await page.waitForTimeout(400);
  const source = await readSource(page);
  console.log("[WAYPOINT] source:", JSON.stringify(source));

  // The fix's core guarantee: exactly two new segments, and NO third wire re-planned from the
  // origin (which would also discard the waypoint the user just placed).
  //
  // NB: once the waypoint leg is written the drawing bounds grow and the view may refit, so
  // re-hitting the destination pin *by screen position* is not reliable in a test — that is a
  // harness limitation, not a product one. The segment count is the assertion that matters here;
  // that a pin landing is written as an anchor reference is covered by the two-click test above.
  expect((source.match(/line cap=round/g) ?? []).length, `unexpected extra wire:\n${source}`).toBe(
    beforeDraws + 2
  );
  const lastLeg = numericWaypoints(source).at(-1);
  expect(lastLeg?.y, `the second leg did not head for the destination row:\n${source}`).toBeCloseTo(3, 2);
});

test("the wire preview draws the whole route, not just its first leg", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, FREE_SOURCE);
  await waitForHitRegions(page, 1);
  await activateTool(page, "addOrthoWire");

  const start = await revealPin(page, "node_A");
  if (!start) throw new Error("pin never revealed");
  await page.mouse.click(start.x, start.y);
  await page.waitForTimeout(200);

  // Move diagonally: a single leg would be purely vertical or horizontal, so three points prove the
  // preview is the complete corner route.
  await page.mouse.move(start.x + 220, start.y - 160, { steps: 8 });
  await page.waitForTimeout(250);

  const preview = await page.evaluate(() => {
    const poly = document.querySelector('[class*="toolPreview"] polyline');
    if (!poly) return null;
    const style = getComputedStyle(poly);
    return {
      points: (poly.getAttribute("points") ?? "").split(/\s+/).filter(Boolean),
      dash: style.strokeDasharray,
      width: style.strokeWidth
    };
  });
  console.log("[PREVIEW] ", JSON.stringify(preview));

  expect(preview, "no polyline preview rendered").not.toBeNull();
  expect(preview?.points.length, "preview is a single leg").toBeGreaterThanOrEqual(3);
  // Dashed and screen-relative: an invisible hairline was the original complaint.
  expect(preview?.dash).toContain("6px");
  expect(Number.parseFloat(preview?.width ?? "0")).toBeGreaterThan(1);
});

test("the route leaves each pin along its own lead direction", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, LEAD_ORIENTATION_SOURCE);
  await waitForHitRegions(page, 1);
  await activateTool(page, "addOrthoWire");

  const target = await revealPin(page, "node_R");
  const start = await revealPin(page, "node_L");
  if (!start || !target) throw new Error("could not reveal both pins");

  await page.mouse.click(start.x, start.y);
  await page.waitForTimeout(200);
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(400);

  const source = await readSource(page);
  console.log("[DIR] source:", JSON.stringify(source));

  // Vertical lead out, horizontal lead in ⇒ the first leg must be vertical ⇒ `|-`.
  expect(source, `the route ignored the pin lead directions:\n${source}`).toMatch(
    /\(node_L\.d\)\s*\|\-\s*\(node_R\.g\)/
  );
});
