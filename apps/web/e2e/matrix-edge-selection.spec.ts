import { expect, test } from "@playwright/test";
import {
  gotoApp,
  openMenuCommand,
  openMenuSection,
  readSelectedSourceIds,
  readSource,
  resetStorageBeforeNavigation,
  setSource,
  waitForHitRegions
} from "./helpers";

function normalizeSourceWhitespace(source: string): string {
  return source.replace(/\s+/g, "");
}

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("matrix edge strips expose directional cursors and delete full row/column selections", async ({ page }) => {
  const source = String.raw`\begin{tikzpicture}
  \matrix[matrix of nodes] (m) {
    A & B \\
    C & D \\
  };
\end{tikzpicture}`;

  await gotoApp(page);
  await setSource(page, source);
  await page.getByRole("button", { name: "Select" }).click();
  await waitForHitRegions(page, 1);

  const rowStrip = page.locator('[data-hit-region-matrix-edge-kind="row"]').first();
  await expect(rowStrip).toBeVisible();
  await rowStrip.hover();
  await expect.poll(async () => rowStrip.evaluate((el) => getComputedStyle(el).cursor)).toBe("e-resize");
  await rowStrip.click();

  await expect.poll(async () => (await readSelectedSourceIds(page)).length).toBe(2);
  await openMenuSection(page, "edit");
  await expect(page.getByTestId("menu-cmd-edit.delete")).toBeEnabled();
  await openMenuCommand(page, "edit", "edit.delete");
  await expect
    .poll(async () => normalizeSourceWhitespace(await readSource(page)))
    .not.toContain("A&B");
  await expect
    .poll(async () => normalizeSourceWhitespace(await readSource(page)))
    .toContain("{C&D}");

  await setSource(page, source);
  await page.getByRole("button", { name: "Select" }).click();
  await waitForHitRegions(page, 1);
  await expect.poll(async () => page.locator('[data-hit-region-matrix-edge-kind="row"]').count()).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => page.locator('[data-hit-region-matrix-edge-kind="column"]').count()).toBeGreaterThanOrEqual(2);

  const columnStrip = page.locator('[data-hit-region-matrix-edge-kind="column"]').first();
  await expect(columnStrip).toBeVisible();
  await columnStrip.hover();
  await expect.poll(async () => columnStrip.evaluate((el) => getComputedStyle(el).cursor)).toBe("s-resize");
  await columnStrip.click();

  await expect.poll(async () => (await readSelectedSourceIds(page)).length).toBe(2);
  await openMenuSection(page, "edit");
  await expect(page.getByTestId("menu-cmd-edit.delete")).toBeEnabled();
  await openMenuCommand(page, "edit", "edit.delete");
  await expect
    .poll(async () => normalizeSourceWhitespace(await readSource(page)))
    .not.toContain("A");
  await expect
    .poll(async () => normalizeSourceWhitespace(await readSource(page)))
    .not.toContain("C");
  await expect
    .poll(async () => normalizeSourceWhitespace(await readSource(page)))
    .toContain("{B\\\\D}");
});
