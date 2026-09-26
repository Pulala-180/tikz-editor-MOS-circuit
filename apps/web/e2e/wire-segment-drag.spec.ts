import { expect, test, type Page } from "@playwright/test";
import { gotoApp, readSource, resetStorageBeforeNavigation, setSource, waitForHitRegions } from "./helpers";

const MOS_CIRCUIT_FIXTURE = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,3.5)}]
    \coordinate (node_M2.d) at (0,0);
    \draw[thick] (0,0) -- (0.5,0);
  \end{scope}
  \begin{scope}[shift={(0,0)}]
    \coordinate (node_M1.s) at (0,0);
    \draw[thick] (0,0) -- (0.5,0);
  \end{scope}
  \draw[line width=0.32mm] (node_M2.d) -- (5.0,3.5) -- (5.0,0) -- (node_M1.s);
\end{tikzpicture}`;

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("dragging the middle vertical wire segment stretches adjacent horizontal segments without detaching endpoints", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, MOS_CIRCUIT_FIXTURE);
  await waitForHitRegions(page, 2);

  // Find the wire path in DOM
  const wirePoint = await page.evaluate(() => {
    const paths = Array.from(document.querySelectorAll("path[data-source-id]"));
    for (const p of paths as SVGPathElement[]) {
      const d = p.getAttribute("d") ?? "";
      const matches = [...d.matchAll(/(-?\d*\.?\d+)[\s,]+(-?\d*\.?\d+)/g)];
      if (matches.length >= 4) {
        const p1 = [Number(matches[1][1]), Number(matches[1][2])];
        const p2 = [Number(matches[2][1]), Number(matches[2][2])];
        const midSvgX = (p1[0] + p2[0]) / 2;
        const midSvgY = (p1[1] + p2[1]) / 2;

        const m = p.getScreenCTM();
        if (!m) continue;
        const sp = p.ownerSVGElement!.createSVGPoint();
        sp.x = midSvgX;
        sp.y = midSvgY;
        const screenPt = sp.matrixTransform(m);
        return { x: screenPt.x, y: screenPt.y, initialD: d };
      }
    }
    return null;
  });

  expect(wirePoint, "wire path middle point should be found").toBeTruthy();

  // Drag the middle segment to the right (+60px screen)
  await page.mouse.move(wirePoint!.x, wirePoint!.y);
  await page.mouse.down();
  await page.mouse.move(wirePoint!.x + 60, wirePoint!.y, { steps: 5 });
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForTimeout(300);

  // Read the source after dragging
  const sourceAfter = await readSource(page);

  // 1. Both endpoints (node_M2.d) and (node_M1.s) MUST still be intact!
  expect(sourceAfter).toContain("(node_M2.d)");
  expect(sourceAfter).toContain("(node_M1.s)");

  // 2. The middle vertical segment must have moved to a larger X coordinate
  console.log("Entire sourceAfter:\n", sourceAfter);
  const wireLine = sourceAfter.split("\n").find((l) => l.includes("line width=0.32mm")) ?? "";
  expect(wireLine).toBeTruthy();
  console.log("Wire line after drag:", wireLine);

  const coords = [...wireLine.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
  expect(coords.length).toBe(4);
  expect(coords[0]).toBe("node_M2.d");
  expect(coords[3]).toBe("node_M1.s");

  const corner1X = parseFloat(coords[1].split(",")[0]);
  const corner2X = parseFloat(coords[2].split(",")[0]);
  expect(corner1X).toBeGreaterThan(5.0);
  expect(corner2X).toBeGreaterThan(5.0);
  expect(Math.abs(corner1X - corner2X)).toBeLessThan(0.05); // Still strictly vertical!
});
