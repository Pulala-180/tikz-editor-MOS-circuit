import { expect, test, type Page } from "@playwright/test";
import { gotoApp, readSource, resetStorageBeforeNavigation, setSource, waitForHitRegions } from "./helpers";

// M then RIGHT-CLICK connects two pins with a 45° route.
//
// The two pins of a connection rarely differ by the same amount in x and y, so the difference has to
// be absorbed by a straight leg. That leg is placed at the pin whose own lead runs ALONG it, so the
// pin is entered (or left) along its lead; the far pin is reached by the exact 45° leg. Both fixtures
// below have |dx| > |dy|, i.e. a horizontal leftover -- they differ only in WHERE the matching lead
// is, which is the whole of the rule.

const SOURCE_LEAD_MATCHES: string = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (2,0);
    \coordinate (node_A.r) at (2,0);
  \end{scope}
  \begin{scope}[shift={(5,1)}]
    \draw[thick] (0,0) -- (2,0);
    \coordinate (node_B.l) at (0,0);
  \end{scope}
\end{tikzpicture}`;

/** The same span, but only the DESTINATION pin sits on a horizontal lead. */
const TARGET_LEAD_MATCHES: string = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (0,1);
    \coordinate (node_A.t) at (0,1);
  \end{scope}
  \begin{scope}[shift={(5,0)}]
    \draw[thick] (0,0) -- (2,0);
    \coordinate (node_B.l) at (0,0);
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
 * Hover sample points across every hit region until the dot for `anchorNode` appears, then return its
 * screen centre. The reveal radius is 60px/zoom and a pin sits at one END of its lead, so sampling the
 * region centre alone is not enough.
 */
async function revealPinCentre(page: Page, anchorNode: string, anchorName: string | null): Promise<{ x: number; y: number } | null> {
  const regions = page.locator("[data-hit-region-target-id]");
  const selector = anchorName
    ? `[data-testid="node-anchor-dot"][data-anchor-node="${anchorNode}"][data-anchor-name="${anchorName}"]`
    : `[data-testid="node-anchor-dot"][data-anchor-node="${anchorNode}"]`;
  const dot = page.locator(selector);
  for (let index = 0; index < (await regions.count()); index += 1) {
    const box = await regions.nth(index).boundingBox();
    if (!box) continue;
    for (const fx of [0.5, 0.9, 0.98, 0.1, 0.02]) {
      for (const fy of [0.5, 0.1, 0.9]) {
        await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy, { steps: 6 });
        await page.waitForTimeout(80);
        if ((await dot.count()) > 0) {
          const dotBox = await dot.first().boundingBox();
          if (dotBox) {
            return { x: dotBox.x + dotBox.width / 2, y: dotBox.y + dotBox.height / 2 };
          }
        }
      }
    }
  }
  return null;
}

async function rightClickPins(
  page: Page,
  start: { x: number; y: number },
  target: { x: number; y: number }
): Promise<void> {
  await page.mouse.click(start.x, start.y, { button: "right" });
  await page.waitForTimeout(200);
  await page.mouse.click(target.x, target.y, { button: "right" });
  await page.waitForTimeout(400);
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("M + right-click: the leftover leg goes to the pin whose lead runs along it", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, SOURCE_LEAD_MATCHES);
  await waitForHitRegions(page, 1);
  await activateTool(page, "addOrthoWire");

  // Source (2,0) -> target (5,1): |dx|=3 > |dy|=1, so 2cm of horizontal leftover and a 1cm/1cm
  // 45° leg. Both leads are horizontal, so the source pin is served: (2,0) -> (4,0) -> (5,1).
  const target = await revealPinCentre(page, "node_B", "l");
  const start = await revealPinCentre(page, "node_A", "r");
  expect(start, "node_A.r never revealed").not.toBeNull();
  expect(target, "node_B.l never revealed").not.toBeNull();
  if (!start || !target) throw new Error("unreachable");

  await rightClickPins(page, start, target);

  const source = await readSource(page);
  console.log("[45-RC start-lead] source:", JSON.stringify(source));

  // Anchor references at both ends: the wire is attached to the pins and follows them.
  expect(source).toContain("(node_A.r)");
  expect(source).toContain("(node_B.l)");
  // The single interior point is the 45° corner, i.e. the straight leg sits at the SOURCE pin.
  expect(source).toContain("(node_A.r) -- (4.00,0.00) -- (node_B.l)");
});

test("M + right-click: the leftover leg moves to the target when only its lead matches", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, TARGET_LEAD_MATCHES);
  await waitForHitRegions(page, 1);
  await activateTool(page, "addOrthoWire");

  // Source (0,1) has a VERTICAL lead, target (5,0) a horizontal one. |dx|=5 > |dy|=1 leaves 4cm of
  // horizontal leftover, which no vertical lead can absorb -- so it goes to the target:
  // (0,1) -> (1,0) diagonally, then (1,0) -> (5,0) straight in along the target's lead.
  const target = await revealPinCentre(page, "node_B", "l");
  const start = await revealPinCentre(page, "node_A", "t");
  expect(start, "node_A.t never revealed").not.toBeNull();
  expect(target, "node_B.l never revealed").not.toBeNull();
  if (!start || !target) throw new Error("unreachable");

  await rightClickPins(page, start, target);

  const source = await readSource(page);
  console.log("[45-RC target-lead] source:", JSON.stringify(source));

  expect(source).toContain("(node_A.t)");
  expect(source).toContain("(node_B.l)");
  expect(source).toContain("(node_A.t) -- (1.00,0.00) -- (node_B.l)");
});

test("a right-click while the wire tool is armed does not open the canvas context menu", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, SOURCE_LEAD_MATCHES);
  await waitForHitRegions(page, 1);
  await activateTool(page, "addOrthoWire");

  const menu = page.getByTestId("canvas-context-menu");

  const start = await revealPinCentre(page, "node_A", "r");
  const target = await revealPinCentre(page, "node_B", "l");
  if (!start || !target) throw new Error("pins never revealed");

  // The press that only ARMS the draft.
  await page.mouse.click(start.x, start.y, { button: "right" });
  await page.waitForTimeout(200);
  await expect(menu, "the arming right-click must be the wire gesture, not a menu").toHaveCount(0);

  // The press that COMPLETES the wire. This one switches the tool back to `select` before the
  // contextmenu event fires, so the armed-mode check alone cannot suppress it.
  await page.mouse.click(target.x, target.y, { button: "right" });
  await page.waitForTimeout(300);
  await expect(menu, "the completing right-click must not stack a menu on the new wire").toHaveCount(0);

  // The wire tool still opens no menu on empty canvas either -- the gesture owns the button.
  await activateTool(page, "addOrthoWire");
  const layer = page.locator("[data-canvas-viewport='true'] svg").last();
  const box = await layer.boundingBox();
  if (!box) throw new Error("canvas layer bounds missing");
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.85, { button: "right" });
  await page.waitForTimeout(200);
  await expect(menu).toHaveCount(0);

  // With the selection tool the menu must still work, i.e. the suppression is scoped to the wire tool.
  await activateTool(page, "select");
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.85, { button: "right" });
  await expect(menu).toHaveCount(1);
});
