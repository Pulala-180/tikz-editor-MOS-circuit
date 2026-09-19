import { expect, test, type Page } from "@playwright/test";
import { canvasViewport, gotoApp, readSource, resetStorageBeforeNavigation, setSource } from "./helpers";
import {
  POWER_RAIL_DEFAULT_LENGTH_CM,
  buildPowerRailSnippet,
  buildPowerRailSnippetBetween,
  derivePowerRailTapCount
} from "../../../packages/app/src/ui/canvas-panel/power-rail";

const EMPTY_SOURCE = String.raw`\begin{tikzpicture}
\end{tikzpicture}`;

/** Activate a circuit tool and click once to stamp it at the given screen point. */
async function placeTool(page: Page, mode: string, at: { x: number; y: number }): Promise<void> {
  await page.evaluate((toolMode) => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: { dispatch?: (action: unknown) => void };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    api?.dispatch?.({ type: "SET_TOOL_MODE", mode: toolMode });
  }, mode);
  await page.mouse.click(at.x, at.y);
}

async function placeTwice(page: Page, mode: string): Promise<string> {
  await gotoApp(page);
  await setSource(page, EMPTY_SOURCE);

  const viewport = canvasViewport(page);
  await expect(viewport).toBeVisible();
  const box = await viewport.boundingBox();
  if (!box) {
    throw new Error("Missing canvas viewport bounds.");
  }

  await placeTool(page, mode, { x: box.x + box.width * 0.35, y: box.y + box.height * 0.4 });
  await placeTool(page, mode, { x: box.x + box.width * 0.6, y: box.y + box.height * 0.6 });
  return await readSource(page);
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("vdd-port stamps an auto-numbered VDD<n> port pin labelled $V_{DD}$", async ({ page }) => {
  const source = await placeTwice(page, "addIoNode_VddPort_Left");

  // The click-insertion path reuses the addIoNode branch, so the placeholder must be gone.
  expect(source, `vdd-port placeholder id survived:\n${source}`).not.toContain("node_VDDx");

  const pins = new Set(source.match(/node_VDD\d+\.port/g) ?? []);
  expect(
    [...pins].sort(),
    `expected two auto-numbered VDD port pins, got [${[...pins].join(", ")}]\n${source}`
  ).toEqual(["node_VDD1.port", "node_VDD2.port"]);

  // Reference name auto-numbers, the displayed label stays the fixed VDD symbol.
  expect(source).toContain("$V_{DD}$");
});

test("generic port stamps an auto-numbered Port<n> pin and keeps its net-name label", async ({ page }) => {
  const source = await placeTwice(page, "addIoNode_Port_Right");

  expect(source, `port placeholder id survived:\n${source}`).not.toContain("node_Portx");

  const pins = new Set(source.match(/node_Port\d+\.port/g) ?? []);
  expect(
    [...pins].sort(),
    `expected two auto-numbered port pins, got [${[...pins].join(", ")}]\n${source}`
  ).toEqual(["node_Port1.port", "node_Port2.port"]);

  // A generic port carries a net name (default $V_{in}$) that renumbering must not touch.
  expect(source).toContain("$V_{in}$");
});

test("port and power-rail tools render a hover ghost (their TikZ templates parse)", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, EMPTY_SOURCE);

  const viewport = canvasViewport(page);
  await expect(viewport).toBeVisible();
  const box = await viewport.boundingBox();
  if (!box) {
    throw new Error("Missing canvas viewport bounds.");
  }
  const hoverAt = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 };

  for (const mode of ["addIoNode_VddPort_Left", "addIoNode_Port_Bottom", "addPowerRail_H_Left"]) {
    await page.evaluate((toolMode) => {
      const api = (globalThis as unknown as {
        __TIKZ_EDITOR_APP_TEST_API__?: { dispatch?: (action: unknown) => void };
      }).__TIKZ_EDITOR_APP_TEST_API__;
      api?.dispatch?.({ type: "SET_TOOL_MODE", mode: toolMode });
    }, mode);
    await page.mouse.move(hoverAt.x, hoverAt.y);
    await page.mouse.move(hoverAt.x + 4, hoverAt.y + 4);

    const ghost = page.locator("g[class*='toolPreviewCircuit']").first();
    await expect(ghost, `no hover ghost rendered for ${mode}`).toBeVisible();
    expect(
      await ghost.locator("path").count(),
      `${mode} hover ghost has no geometry`
    ).toBeGreaterThan(0);
  }
});

test("power rail between two points lays a heavy bar with length-scaled taps", () => {
  // Tap count is a function of length: longer rail -> more taps.
  expect(derivePowerRailTapCount(POWER_RAIL_DEFAULT_LENGTH_CM)).toBe(3);
  expect(derivePowerRailTapCount(0.8)).toBe(1);
  expect(derivePowerRailTapCount(40)).toBe(8);

  const rail = buildPowerRailSnippetBetween({ xCm: 1.25, yCm: -2.5 }, { xCm: 3.65, yCm: -2.5 });
  const originX = Math.min(1.25, 3.65);

  // Heavy bus stroke, not a signal wire.
  expect(rail).toContain("line width=0.9mm");
  expect(rail).toContain(`\\begin{scope}[shift={(${originX},-2.5)}]`);

  // Two-point pins follow the resistor `l`/`r` convention; taps are named `tap1..tapN`.
  expect(rail).toContain("\\coordinate (node_RAILx.l) at (0,0);");
  expect(rail).toContain(`\\coordinate (node_RAILx.r) at (${POWER_RAIL_DEFAULT_LENGTH_CM},0);`);
  for (let index = 1; index <= 3; index += 1) {
    expect(rail, `missing tap${index} pin:\n${rail}`).toContain(`\\coordinate (node_RAILx.tap${index})`);
  }
  expect(rail).not.toContain("node_RAILx.tap4");
  // Each tap is a hollow circle node sitting on the bar.
  expect((rail.match(/fill=white\] \(/g) ?? []).length).toBe(3);
  expect(rail).toContain("$V_{DD}$");

  // The two-point builder is order-insensitive: right-to-left gives the same shape.
  const reversed = buildPowerRailSnippetBetween({ xCm: 3.65, yCm: -2.5 }, { xCm: 1.25, yCm: -2.5 });
  expect(reversed).toBe(rail);

  // A vertical rail uses the `t`/`b` terminal convention instead.
  const vertical = buildPowerRailSnippet(0, 0, 2.4, { orientation: "vertical" });
  expect(vertical).toContain("\\coordinate (node_RAILx.t) at (0,0);");
  expect(vertical).toContain("\\coordinate (node_RAILx.b) at (0,-2.4);");
  expect(vertical).toContain("\\coordinate (node_RAILx.tap2) at (0,-1.2);");

  // Explicit tap count overrides the length-derived one (how the two-click flow tunes it).
  const dense = buildPowerRailSnippet(0, 0, 2.4, { taps: 5 });
  expect((dense.match(/fill=white\] \(/g) ?? []).length).toBe(5);
});

test("port placement honours the rotate (r) and mirror (h) keys", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, EMPTY_SOURCE);

  const viewport = canvasViewport(page);
  await viewport.focus();
  await expect(viewport).toBeFocused();
  const box = await viewport.boundingBox();
  if (!box) {
    throw new Error("Missing canvas viewport bounds.");
  }
  const clickAt = (fx: number, fy: number) =>
    page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);

  // `o` arms the vdd-port tool; `r` rotates it to the Top placement before it is stamped.
  await page.keyboard.press("o");
  await page.keyboard.press("r");
  await clickAt(0.4, 0.45);
  let source = await readSource(page);
  expect(source, `rotate did not reach the Top placement:\n${source}`).toContain(
    "\\node at (0.35,0.45) {$V_{DD}$};"
  );

  // `h` mirrors it (left -> right).
  await page.keyboard.press("o");
  await page.keyboard.press("h");
  await clickAt(0.6, 0.55);
  source = await readSource(page);
  expect(source, `mirror did not reach the Right placement:\n${source}`).toContain(
    "\\node at (0.85,-0.30) {$V_{DD}$};"
  );

  // The addIoNode family's Vin/Vout state machine must not hijack a port: pressing `o`
  // again while placing stays on vdd-port_Left instead of switching the object to Vout.
  await page.keyboard.press("o");
  await page.keyboard.press("o");
  await clickAt(0.5, 0.75);
  source = await readSource(page);
  expect(source, `placement keypress hijacked the port:\n${source}`).toContain(
    "\\node at (-0.01,-0.30) {$V_{DD}$};"
  );
  expect(source).not.toContain("node_Vout");
});

