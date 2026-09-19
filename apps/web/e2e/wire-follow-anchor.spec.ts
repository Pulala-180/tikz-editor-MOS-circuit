import { expect, test, type Page } from "@playwright/test";
import { gotoApp, resetStorageBeforeNavigation, setSource, waitForHitRegions } from "./helpers";

// An editor-style component (a scope with a NAMED pin `\coordinate (node_M3.d)`) plus a wire whose
// attached end is written as an ANCHOR REFERENCE rather than a literal coordinate:
//
//   \draw[thick, line cap=round] (node_M3.d) -- (2,0.5);
//
// which is exactly what `formatTikzWireSnippet` emits once routing corners are added
// (`(node_M3.d) -- (5.00,0.00) -- (node_R1.p1)`). The anchor has no literal coordinate in the wire
// text, so matching the wire end to the moved pin must go through the pin's evaluated world position.
//
// Note the wire source text NEVER changes when the component moves: `(node_M3.d)` keeps tracking the
// pin, which is the whole point of writing anchors. So the assertions below read the RENDERED
// geometry (path `d`), not the source, and they observe it MID-GESTURE -- the reported bug was that
// the wire sat still for the entire drag and only snapped on release.
const ANCHOR_WIRE_SOURCE = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \coordinate (node_M3.g) at (0,0);
    \draw[thick, line cap=round] (0,0) -- (0.26,0);
    \draw[thick, line cap=round, line join=round] (0.40,0.2) -- (0.73,0.2) -- (0.73,0.5);
    \coordinate (node_M3.d) at (0.73,0.5);
    \coordinate (node_M3.s) at (0.73,-0.5);
  \end{scope}
  \draw[thick, line cap=round] (node_M3.d) -- (2,0.5);
\end{tikzpicture}`;

type RenderedWire = { sourceId: string; from: [number, number]; to: [number, number] };

/**
 * The rendered wire: the only two-point path in the figure. The scope's own primitives are a
 * two-point lead at x<=0.26cm and a three-point body, so the wire is the two-point path whose far
 * end reaches furthest right (2cm).
 */
async function readRenderedWire(page: Page): Promise<RenderedWire> {
  const candidates = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("path[data-source-id]")).map((element) => ({
      sourceId: element.getAttribute("data-source-id") ?? "",
      points: [...(element.getAttribute("d") ?? "").matchAll(/(-?\d*\.?\d+)[\s,]+(-?\d*\.?\d+)/g)].map(
        (match) => [Number(match[1]), Number(match[2])] as [number, number]
      )
    }));
  });
  const two = candidates.filter((candidate) => candidate.points.length === 2);
  expect(two.length, `expected a two-point wire among ${JSON.stringify(candidates.map((c) => c.sourceId))}`).toBeGreaterThan(0);
  const wire = two.reduce((best, candidate) => (candidate.points[1][0] > best.points[1][0] ? candidate : best));
  return { sourceId: wire.sourceId, from: wire.points[0], to: wire.points[1] };
}

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
    // Playwright reports a purely horizontal/vertical path as hidden (zero-height/width bbox).
    if (box && box.width > 0 && box.height > 0) return box;
  }
  throw new Error(`No draggable member hit region found among ${JSON.stringify(ids)}`);
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("a wire written as a named anchor reference follows its component during the drag", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, ANCHOR_WIRE_SOURCE);
  await waitForHitRegions(page, 1);

  const before = await readRenderedWire(page);
  // Sanity: the wire starts out orthogonal (horizontal at the drain's world y).
  expect(Math.abs(before.from[1] - before.to[1]), "fixture wire is not initially orthogonal").toBeLessThan(0.02);
  expect(before.to[0]).toBeGreaterThan(before.from[0]);

  const box = await draggableMemberBox(page);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  // Drag purely along the wire's axis so an orthogonal wire must stay orthogonal; the app's
  // movement-axis lock keeps it axis-aligned.
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 90, startY, { steps: 10 });
  await page.waitForTimeout(200);

  // MID-GESTURE: the anchor end must already track the component...
  const during = await readRenderedWire(page);
  expect(during.sourceId, "the wire identity changed mid-drag").toBe(before.sourceId);
  const movedX = during.from[0] - before.from[0];
  expect(movedX, `attached anchor end did not follow the component mid-drag (d=${JSON.stringify(during)})`).toBeGreaterThan(1);
  // ...while the far end stays put...
  expect(Math.abs(during.to[0] - before.to[0]), "far end drifted mid-drag").toBeLessThan(0.05);
  expect(Math.abs(during.to[1] - before.to[1]), "far end drifted mid-drag").toBeLessThan(0.05);
  // ...and the segment is still orthogonal.
  expect(Math.abs(during.from[1] - during.to[1]), `wire went diagonal mid-drag (d=${JSON.stringify(during)})`).toBeLessThan(0.05);

  await page.mouse.up();
  await page.waitForTimeout(250);

  // COMMITTED: same story after release. The anchor keeps working without any source rewrite.
  const after = await readRenderedWire(page);
  expect(after.sourceId).toBe(before.sourceId);
  expect(after.from[0] - before.from[0], "attached end did not follow the committed move").toBeGreaterThan(1);
  expect(Math.abs(after.to[0] - before.to[0]), "far end moved on commit").toBeLessThan(0.05);
  expect(Math.abs(after.to[1] - before.to[1]), "far end moved on commit").toBeLessThan(0.05);
  expect(Math.abs(after.from[1] - after.to[1]), `wire went diagonal on commit (d=${JSON.stringify(after)})`).toBeLessThan(0.05);
});
