import { expect, test, type Page } from "@playwright/test";
import {
  gotoApp,
  resetStorageBeforeNavigation,
  setCanvasTransform,
  setSource,
  waitForHitRegions
} from "./helpers";

/**
 * A plain line: its endpoints are snap reference points but NOT named pins, so a snap onto one can
 * only come from the snap pipeline — the `snapLines` source of a connect target.
 */
const PLAIN_LINE_SOURCE = String.raw`\begin{tikzpicture}
  \draw[thick] (0,0) -- (2,0);
\end{tikzpicture}`;

/** A named pin, so hovering it also snaps the endpoint ANCHOR (`nodeAnchorOverlay.snappedAnchor`). */
const PINNED_SOURCE = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (2,0);
    \coordinate (node_Mx.d) at (2,0);
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
 * Screen position of a TikZ coordinate (cm), mapped the way the app does: cm -> world pt, then
 * world -> SVG user space (the y axis is mirrored, see `worldToSvgY`), then through the interaction
 * layer's own screen CTM. Deriving it from the live DOM keeps it correct at any pan/zoom, so the
 * same helper can drive the zoom assertion.
 */
async function worldToScreen(page: Page, cmX: number, cmY: number): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(({ x, y }) => {
    const PT_PER_CM = 28.4527559;
    const svg = document.querySelector('[data-testid="canvas-interaction-layer"]');
    if (!(svg instanceof SVGGraphicsElement)) {
      return null;
    }
    const ctm = svg.getScreenCTM();
    const box = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
    if (!ctm || box.length !== 4 || box.some((value) => !Number.isFinite(value)) || box[3] <= 0) {
      return null;
    }
    const screen = new DOMPoint(x * PT_PER_CM, 2 * box[1] + box[3] - y * PT_PER_CM).matrixTransform(ctm);
    return { x: screen.x, y: screen.y };
  }, { x: cmX, y: cmY });
  if (!point) {
    throw new Error("Could not map a world point onto the interaction layer.");
  }
  return point;
}

/** On-screen width of the ⊕ ring. Zoom-independent geometry means this must not move with `scale`. */
async function ringScreenWidth(page: Page, source: "snap" | "anchor"): Promise<number> {
  const width = await page.evaluate((kind) => {
    const marker = document.querySelector(
      `[data-testid="canvas-connect-target"][data-connect-source="${kind}"]`
    );
    const ring = marker?.querySelector("circle");
    return ring ? ring.getBoundingClientRect().width : null;
  }, source);
  if (width == null) {
    throw new Error(`No ⊕ ring rendered for the "${source}" source.`);
  }
  return width;
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("a two-axis snap marks the target with a ⊕", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, PLAIN_LINE_SOURCE);
  await waitForHitRegions(page, 1);
  await activateTool(page, "addOrthoWire");
  await setCanvasTransform(page, { translateX: 60, translateY: 60, scale: 1 });

  const endpoint = await worldToScreen(page, 2, 0);
  await page.mouse.move(endpoint.x, endpoint.y, { steps: 8 });

  const marker = page.locator('[data-testid="canvas-connect-target"][data-connect-source="snap"]');
  await expect(marker).toHaveCount(1);
  await expect(marker.locator("circle")).toBeVisible();

  // Same contract as the pin halo: decoration that must never intercept the press.
  await expect(marker).toHaveCSS("pointer-events", "none");
  // Screen-pixel geometry: strokes are non-scaling and the radius rides a user-unit length that
  // already encodes 1/scale, so neither can shrink to a hairline when the viewBox is scaled.
  await expect(marker.locator("circle")).toHaveCSS("vector-effect", "non-scaling-stroke");
  await expect(marker.locator("line").first()).toHaveCSS("vector-effect", "non-scaling-stroke");

  // The ⊕ sits centred on the snapped point, not on the raw pointer.
  const ringBox = await marker.locator("circle").boundingBox();
  expect(ringBox).not.toBeNull();
  expect(Math.abs(ringBox!.x + ringBox!.width / 2 - endpoint.x)).toBeLessThan(2);
  expect(Math.abs(ringBox!.y + ringBox!.height / 2 - endpoint.y)).toBeLessThan(2);
});

test("a snapped pin marks the target with a ⊕ that cannot steal the click", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, PINNED_SOURCE);
  await waitForHitRegions(page, 1);
  await activateTool(page, "addOrthoWire");
  await setCanvasTransform(page, { translateX: 60, translateY: 60, scale: 1 });

  const pin = await worldToScreen(page, 2, 0);
  await page.mouse.move(pin.x, pin.y, { steps: 8 });

  const marker = page.locator('[data-testid="canvas-connect-target"][data-connect-source="anchor"]');
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveCSS("pointer-events", "none");
  await expect
    .poll(async () => page.locator('[data-testid="node-anchor-halo"][data-anchor-snapped="true"]').count())
    .toBe(1);

  // Decoration, not a click target: the topmost hit at the pin's own centre is NOT the ⊕ (the dot
  // or the component's hit region still owns it), exactly like the pin halo contract.
  const topmostIsMarker = await page.evaluate(({ x, y }) => {
    const top = document.elementFromPoint(x, y);
    return top ? top.closest('[data-testid="canvas-connect-target"]') !== null : true;
  }, { x: pin.x, y: pin.y });
  expect(topmostIsMarker).toBe(false);
});

test("the ⊕ keeps a fixed screen size when the canvas is zoomed", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, PLAIN_LINE_SOURCE);
  await waitForHitRegions(page, 1);
  await activateTool(page, "addOrthoWire");

  await setCanvasTransform(page, { translateX: 60, translateY: 60, scale: 1 });
  const atOneToOne = await worldToScreen(page, 2, 0);
  await page.mouse.move(atOneToOne.x, atOneToOne.y, { steps: 8 });
  const wideAtOne = await ringScreenWidth(page, "snap");

  await setCanvasTransform(page, { translateX: 60, translateY: 60, scale: 3 });
  const atThreeToOne = await worldToScreen(page, 2, 0);
  await page.mouse.move(atThreeToOne.x, atThreeToOne.y, { steps: 8 });
  const wideAtThree = await ringScreenWidth(page, "snap");

  console.log("[connect-marker]", JSON.stringify({ wideAtOne, wideAtThree }));
  expect(wideAtOne).toBeGreaterThan(4);
  expect(Math.abs(wideAtThree - wideAtOne)).toBeLessThan(0.5);
});
