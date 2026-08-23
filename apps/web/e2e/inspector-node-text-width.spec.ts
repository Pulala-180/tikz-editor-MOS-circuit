import { expect, test, type Page } from "@playwright/test";
import {
  clickTextHitRegionByTargetId,
  gotoApp,
  readSource,
  resetStorageBeforeNavigation,
  setSource,
  waitForHitRegions
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

async function nodeTextWidthInput(page: Page) {
  const label = page.getByText("Text width", { exact: true }).first();
  await expect(label).toBeVisible();
  return label.locator("xpath=following::input[@type='number'][1]");
}

async function textHitRegionWidthPx(page: Page, targetId: string): Promise<number> {
  const region = page.locator(
    `[data-hit-region-target-id='${targetId}'][data-hit-region-interaction-mode='text']`
  ).first();
  await expect(region).toBeVisible();
  const box = await region.boundingBox();
  if (!box) {
    throw new Error(`Missing text hit-region bounds for ${targetId}.`);
  }
  return box.width;
}

test("node text width input reflects typed value and writes source", async ({ page }, testInfo) => {
  await gotoApp(page);
  await setSource(page, String.raw`\begin{tikzpicture}
\node[draw,align=center] at (0,0) {Hello wrapped world};
\end{tikzpicture}`);
  await waitForHitRegions(page, 1);

  await clickTextHitRegionByTargetId(page, "path:0");

  const input = await nodeTextWidthInput(page);
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("");

  await input.click();
  await input.pressSequentially("120");

  await expect.soft(input).toHaveValue("120");
  await page.waitForTimeout(100);
  expect.soft(await readSource(page)).toContain("text width=120pt");
  expect(testInfo.errors).toHaveLength(0);
});

test("node text width visual resize remains consistent with source mutation", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, String.raw`\begin{tikzpicture}
\node[draw,align=center] at (0,0) {Hello wrapped world};
\end{tikzpicture}`);
  await waitForHitRegions(page, 1);

  await clickTextHitRegionByTargetId(page, "path:0");
  const input = await nodeTextWidthInput(page);
  const widthBefore = await textHitRegionWidthPx(page, "path:0");

  await input.click();
  await input.pressSequentially("150");

  const sourceAfter = await readSource(page);
  const widthAfter = await textHitRegionWidthPx(page, "path:0");

  expect(sourceAfter).toContain("text width=150pt");
  expect(Math.abs(widthAfter - widthBefore)).toBeGreaterThan(0.5);
});
