import { expect, test, type Page } from "@playwright/test";
import { dragHitRegionByTargetIdAndMode, gotoApp, readSource, resetStorageBeforeNavigation, setSource, waitForHitRegions } from "./helpers";

// A dragged TEXT label must NOT snap: no position-preset magnetism (start / 0.25 / 0.5 / 0.75 / end
// / named anchors), no point/grid/guide magnetism. It lands exactly where it is dropped, so its
// `pos` is the raw drop fraction instead of being pulled back onto a preset. Dragging a component or
// a wire keeps every snap.

const LABEL_ON_WIRE = String.raw`\begin{tikzpicture}
  \draw[thick] (0,0) -- (4,0) node[midway] {$V_{gs1}$};
\end{tikzpicture}`;

const TWO_COMPONENTS = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (1,0);
    \coordinate (node_A.g) at (0,0);
  \end{scope}
  \begin{scope}[shift={(3,0)}]
    \draw[thick] (0,0) -- (1,0);
    \coordinate (node_B.g) at (0,0);
  \end{scope}
\end{tikzpicture}`;

function posOf(source: string): number | null {
  const line = source.split("\n").find((l) => l.includes("node")) ?? "";
  if (!line.includes("node")) return null;
  if (line.includes("midway")) return 0.5;
  const match = line.match(/pos\s*=\s*(-?\d*\.?\d+)/);
  return match ? Number(match[1]) : null;
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("dragging a text label does not snap it onto a position preset", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, LABEL_ON_WIRE);
  await waitForHitRegions(page, 1);

  // A drag whose raw drop is well inside the preset window (0.5 +/- 3%): with snapping the label
  // would be pulled back to exactly 0.5 (its `pos` option dropped as the default); with snapping off
  // it keeps the raw fraction.
  const textRegionId = await page.evaluate(
    () =>
      document.querySelector("[data-hit-region-interaction-mode='text']")?.getAttribute("data-hit-region-target-id") ??
      "path:0"
  );
  await dragHitRegionByTargetIdAndMode(page, textRegionId, "text", 14, 0);
  await page.waitForTimeout(250);

  const source = await readSource(page);
  const pos = posOf(source);
  expect(pos, `label position unreadable:\n${source}`).not.toBeNull();
  expect(
    Math.abs((pos as number) - 0.5),
    `label snapped back onto the 0.5 preset:\n${source}`
  ).toBeGreaterThan(0.005);
  expect(pos as number, `label moved implausibly far:\n${source}`).toBeLessThan(0.6);
});

test("dragging a component still snaps its pin onto a neighbouring pin", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, TWO_COMPONENTS);
  await waitForHitRegions(page, 2);

  const before = await readSource(page);
  expect(before).toContain("shift={(0,0)}");

  // Drag the left scope's member so its pin lands a few screen px SHORT of the right pin at (3,0);
  // snapping must pull it exactly onto (3,0) => xshift = 3cm = 85.358pt. The screen delta is derived
  // from the two rendered members so it does not depend on the canvas fit.
  const geometry = await page.evaluate(() => {
    const toClient = (el: SVGPathElement, at: "start" | "end") => {
      const len = el.getTotalLength();
      const p = el.getPointAtLength(at === "start" ? 0 : len);
      const m = el.getScreenCTM();
      if (!m) return null;
      const sp = el.ownerSVGElement!.createSVGPoint();
      sp.x = p.x;
      sp.y = p.y;
      const s = sp.matrixTransform(m);
      return { x: s.x, y: s.y };
    };
    const paths = Array.from(document.querySelectorAll("path[data-source-id]")) as SVGPathElement[];
    const a = paths[0];
    const b = paths[1];
    if (!a || !b) return null;
    return { a: toClient(a, "start"), b: toClient(b, "start"), aEnd: toClient(a, "end") };
  });
  expect(geometry?.a && geometry?.b, "members not rendered").toBeTruthy();
  const gap = geometry!.b!.x - geometry!.a!.x; // screen px from A's pin to B's pin
  const short = 6; // leave a gap so snapping has something to do (an unsnapped drop would be ~3.2pt short)
  const dx = Math.round(gap - short);

  const sx = (geometry!.a!.x + geometry!.aEnd!.x) / 2;
  const sy = geometry!.a!.y;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + dx, sy, { steps: 12 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(350);

  const source = await readSource(page);
  const shifts = [...source.matchAll(/shift=\{\{?\(?(-?[\d.]+)pt/g)].map((m) => Number(m[1]));
  const xshift = [...source.matchAll(/shift=\{\((-?[\d.]+)pt/g)].map((m) => Number(m[1]));
  const first = xshift[0] ?? shifts[0];
  expect(first, `no scope shift found:\n${source}`).toBeDefined();
  expect(
    Math.abs((first as number) - 85.358),
    `component pin did NOT snap onto the neighbouring pin (xshift=${first}):\n${source}`
  ).toBeLessThan(2.5);
});
