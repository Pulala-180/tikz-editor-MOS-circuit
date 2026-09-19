import { expect, test, type Page } from "@playwright/test";
import { gotoApp, resetStorageBeforeNavigation, setSource, waitForHitRegions } from "./helpers";

// `formatTikzWireSnippet` writes a 2-leg route whose middle point IS the orthogonal corner of its
// two ends with TikZ's `-|` / `|-` OPERATOR when either end is a named anchor:
//
//   \draw[thick, line cap=round] (node_M3.d) |- (2,2);
//
// The operator's corner is IMPLICIT -- it has no CoordinateItem and no edit handle, and TikZ derives
// it from the two endpoints. The transient drag preview models the wire as a POINT LIST (it parses
// the rendered `d` and translates the attached endpoint only), so it used to freeze that implicit
// corner at its pre-drag position: the attached end slid away while the corner sat still, dragging
// the first leg into a diagonal -- the reported "整条线跟着飞起来" transient. These tests read the
// RENDERED geometry (`d`) MID-GESTURE and require the implicit corner to be recomputed so both legs
// stay orthogonal, matching what the committed source does on release.
//
// Two orientations, because the leg that skews depends on which way the component moves:
//   `|-`  = vertical first  -> a HORIZONTAL component drag skews leg 1
//   `-|`  = horizontal first -> a VERTICAL component drag skews leg 1

const OPERATOR_VERT_FIRST = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \coordinate (node_M3.g) at (0,0);
    \draw[thick, line cap=round] (0,0) -- (0.26,0);
    \draw[thick, line cap=round, line join=round] (0.40,0.2) -- (0.73,0.2) -- (0.73,0.5);
    \coordinate (node_M3.d) at (0.73,0.5);
    \coordinate (node_M3.s) at (0.73,-0.5);
  \end{scope}
  \draw[thick, line cap=round] (node_M3.d) |- (2,2);
\end{tikzpicture}`;

const OPERATOR_HORIZ_FIRST = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \coordinate (node_M3.g) at (0,0);
    \draw[thick, line cap=round] (0,0) -- (0.26,0);
    \draw[thick, line cap=round, line join=round] (0.40,0.2) -- (0.73,0.2) -- (0.73,0.5);
    \coordinate (node_M3.d) at (0.73,0.5);
    \coordinate (node_M3.s) at (0.73,-0.5);
  \end{scope}
  \draw[thick, line cap=round] (node_M3.d) -| (2,2);
\end{tikzpicture}`;

// Pin-to-pin operator wire: BOTH ends are named anchors, so neither end ever needs a source
// rewrite -- the wire follows purely because the anchors resolve to the moved scope. The diagonal
// member exists only so the scope has a hit region with a real 2D box to grab.
const OPERATOR_PIN_TO_PIN = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (1,1);
    \draw[thick] (0,0) -- (2,0);
    \coordinate (node_M1.d) at (2,0);
  \end{scope}
  \begin{scope}[shift={(3,3)}]
    \draw[thick] (0,0) -- (2,0);
    \coordinate (node_R2.l) at (0,0);
  \end{scope}
  \draw[thick, line cap=round] (node_M1.d) |- (node_R2.l);
\end{tikzpicture}`;

type Wire = { sourceId: string; p0: [number, number]; p1: [number, number]; p2: [number, number] };

/**
 * The rendered wire: the only 3-point path that reaches the far end (x >= 50 in SVG user units).
 * The scope's own primitives are a 2-point lead and a 3-point body that stays at x <= 21.
 */
async function readRenderedWire(page: Page): Promise<Wire> {
  const candidates = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("path[data-source-id]")).map((element) => ({
      sourceId: element.getAttribute("data-source-id") ?? "",
      points: [...(element.getAttribute("d") ?? "").matchAll(/(-?\d*\.?\d+)[\s,]+(-?\d*\.?\d+)/g)].map(
        (match) => [Number(match[1]), Number(match[2])] as [number, number]
      )
    }));
  });
  const threes = candidates.filter((candidate) => candidate.points.length === 3);
  const wire = threes.find((candidate) => Math.max(...candidate.points.map((p) => p[0])) >= 50);
  expect(
    wire,
    `expected a 3-point operator wire among ${JSON.stringify(candidates.map((c) => c.sourceId))}`
  ).toBeTruthy();
  const w = wire as NonNullable<typeof wire>;
  return { sourceId: w.sourceId, p0: w.points[0], p1: w.points[1], p2: w.points[2] };
}

/** Same drag target selection as wire-follow-anchor.spec.ts: a member with a real 2D bbox. */
async function draggableMemberBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const ids = await page.evaluate(() => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: { getSceneSourceIds?: () => string[] };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    return api?.getSceneSourceIds?.() ?? [];
  });
  for (const id of ids) {
    const region = page.locator(`[data-hit-region-target-id='${id}']`).first();
    if ((await region.count()) === 0) continue;
    const box = await region.boundingBox();
    if (box && box.width > 0 && box.height > 0) return box;
  }
  throw new Error(`No draggable member hit region found among ${JSON.stringify(ids)}`);
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("a `|-` operator wire recomputes its implicit corner MID-DRAG, staying orthogonal", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, OPERATOR_VERT_FIRST);
  await waitForHitRegions(page, 1);

  const before = await readRenderedWire(page);
  // Sanity: `|-` = vertical first, so p0 and p1 share x, and p1 and p2 share y.
  expect(Math.abs(before.p0[0] - before.p1[0]), "fixture leg 1 is not vertical").toBeLessThan(0.05);
  expect(Math.abs(before.p1[1] - before.p2[1]), "fixture leg 2 is not horizontal").toBeLessThan(0.05);

  const box = await draggableMemberBox(page);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  // Purely horizontal: leg 1 (vertical) must slide, and its implicit corner must follow.
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 90, startY, { steps: 10 });
  await page.waitForTimeout(200);

  const during = await readRenderedWire(page);
  expect(during.sourceId, "the wire identity changed mid-drag").toBe(before.sourceId);
  // The attached (anchor) end followed the component...
  expect(
    during.p0[0] - before.p0[0],
    `attached end did not follow the component mid-drag (d=${JSON.stringify(during)})`
  ).toBeGreaterThan(1);
  // ...the far end stayed put...
  expect(Math.abs(during.p2[0] - before.p2[0]), "far end drifted mid-drag").toBeLessThan(0.05);
  expect(Math.abs(during.p2[1] - before.p2[1]), "far end drifted mid-drag").toBeLessThan(0.05);
  // ...and the IMPLICIT corner was recomputed: leg 1 is still vertical (this is the regression --
  // a frozen corner leaves p1 at its old x and the leg becomes a diagonal).
  expect(
    Math.abs(during.p0[0] - during.p1[0]),
    `leg 1 went diagonal mid-drag: the implicit corner was not recomputed (d=${JSON.stringify(during)})`
  ).toBeLessThan(0.05);
  expect(Math.abs(during.p1[1] - during.p2[1]), `leg 2 went diagonal mid-drag (d=${JSON.stringify(during)})`).toBeLessThan(0.05);

  await page.mouse.up();
  await page.waitForTimeout(250);

  // COMMITTED: the source keeps the operator, and the rendered wire is still orthogonal.
  const after = await readRenderedWire(page);
  expect(Math.abs(after.p0[1] - after.p2[1]) > 0.05 || Math.abs(after.p0[0] - after.p1[0]) < 0.05).toBe(true);
  expect(Math.abs(after.p0[0] - after.p1[0]), "committed leg 1 is not vertical").toBeLessThan(0.05);
  expect(Math.abs(after.p1[1] - after.p2[1]), "committed leg 2 is not horizontal").toBeLessThan(0.05);
  const source = await page.evaluate(() => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: { getSource?: () => string };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    return api?.getSource?.() ?? "";
  });
  expect(source, `committed source lost the operator form:\n${source}`).toContain("|-");
});

test("a `-|` operator wire recomputes its implicit corner MID-DRAG, staying orthogonal", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, OPERATOR_HORIZ_FIRST);
  await waitForHitRegions(page, 1);

  const before = await readRenderedWire(page);
  // Sanity: `-|` = horizontal first, so p0 and p1 share y, and p1 and p2 share x.
  expect(Math.abs(before.p0[1] - before.p1[1]), "fixture leg 1 is not horizontal").toBeLessThan(0.05);
  expect(Math.abs(before.p1[0] - before.p2[0]), "fixture leg 2 is not vertical").toBeLessThan(0.05);

  const box = await draggableMemberBox(page);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  // Purely vertical: leg 1 (horizontal) must slide, and its implicit corner must follow.
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY - 70, { steps: 10 });
  await page.waitForTimeout(200);

  const during = await readRenderedWire(page);
  expect(during.sourceId, "the wire identity changed mid-drag").toBe(before.sourceId);
  // The attached (anchor) end followed the component vertically...
  expect(
    Math.abs(during.p0[1] - before.p0[1]),
    `attached end did not follow the component mid-drag (d=${JSON.stringify(during)})`
  ).toBeGreaterThan(1);
  // ...the far end stayed put...
  expect(Math.abs(during.p2[1] - before.p2[1]), "far end drifted mid-drag").toBeLessThan(0.05);
  // ...and the IMPLICIT corner was recomputed: leg 1 is still horizontal.
  expect(
    Math.abs(during.p0[1] - during.p1[1]),
    `leg 1 went diagonal mid-drag: the implicit corner was not recomputed (d=${JSON.stringify(during)})`
  ).toBeLessThan(0.05);
  expect(Math.abs(during.p1[0] - during.p2[0]), `leg 2 went diagonal mid-drag (d=${JSON.stringify(during)})`).toBeLessThan(0.05);

  await page.mouse.up();
  await page.waitForTimeout(250);
  const source = await page.evaluate(() => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: { getSource?: () => string };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    return api?.getSource?.() ?? "";
  });
  expect(source, `committed source lost the operator form:\n${source}`).toContain("-|");
});

test("a pin-to-pin `|-` wire follows its component at the moved pin MID-DRAG", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, OPERATOR_PIN_TO_PIN);
  await waitForHitRegions(page, 1);

  const before = await readRenderedWire(page);
  // Sanity: `|-` = vertical first; the M1 pin is the near end (left), R2 the far end (right).
  expect(Math.abs(before.p0[0] - before.p1[0]), "fixture leg 1 is not vertical").toBeLessThan(0.05);
  expect(before.p2[0], "fixture far end is not to the right").toBeGreaterThan(before.p0[0]);

  const box = await draggableMemberBox(page);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 90, startY, { steps: 10 });
  await page.waitForTimeout(200);

  const during = await readRenderedWire(page);
  expect(during.sourceId, "the wire identity changed mid-drag").toBe(before.sourceId);
  // The M1-anchored end tracked the component...
  expect(
    during.p0[0] - before.p0[0],
    `the wire did not follow the moved pin mid-drag (d=${JSON.stringify(during)})`
  ).toBeGreaterThan(1);
  // ...the R2-anchored far end stayed pinned to its own component...
  expect(Math.abs(during.p2[0] - before.p2[0]), "far pin drifted mid-drag").toBeLessThan(0.05);
  expect(Math.abs(during.p2[1] - before.p2[1]), "far pin drifted mid-drag").toBeLessThan(0.05);
  // ...and the implicit corner kept both legs orthogonal.
  expect(Math.abs(during.p0[0] - during.p1[0]), `leg 1 went diagonal mid-drag (d=${JSON.stringify(during)})`).toBeLessThan(0.05);
  expect(Math.abs(during.p1[1] - during.p2[1]), `leg 2 went diagonal mid-drag (d=${JSON.stringify(during)})`).toBeLessThan(0.05);

  await page.mouse.up();
  await page.waitForTimeout(250);
  const after = await readRenderedWire(page);
  expect(after.p0[0] - before.p0[0], "the wire did not follow the committed move").toBeGreaterThan(1);
  expect(Math.abs(after.p2[0] - before.p2[0]), "far pin moved on commit").toBeLessThan(0.05);
  expect(Math.abs(after.p0[0] - after.p1[0]), "committed leg 1 is not vertical").toBeLessThan(0.05);
});
