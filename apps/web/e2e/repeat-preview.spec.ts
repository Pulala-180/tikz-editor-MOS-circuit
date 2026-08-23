import { expect, test } from "@playwright/test";
import { gotoApp, openMenuCommand, resetStorageBeforeNavigation, setSource } from "./helpers";

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("repeat preview shows all added cells for a 3x3 node grid", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, String.raw`\begin{tikzpicture}
  \node[draw, minimum width=1cm, minimum height=1cm] at (0, 0) {C};
\end{tikzpicture}`);

  await page.evaluate(() => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: {
        selectSourceIds?: (sourceIds: string[]) => void;
      };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    api?.selectSourceIds?.(["path:0"]);
  });

  await openMenuCommand(page, "edit", "edit.repeat");
  await expect(page.getByTestId("repeat-modal")).toBeVisible();

  await page.getByTestId("repeat-columns-input").fill("3");
  await page.getByTestId("repeat-rows-input").fill("3");

  await expect(page.getByTestId("canvas-repeat-preview-layer")).toBeVisible();
  await expect.poll(async () => {
    return await page.getByTestId("canvas-repeat-preview-layer").locator("text").count();
  }).toBe(8);
});

test("repeat preview shows all added cells for named node C in the exact example", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, String.raw`\begin{tikzpicture}[every node/.style={fill=blue!10}]
  \draw (-3,-3) rectangle (3,3);


  \node[draw] (A) at (-1, -1) {A};
  \node[draw] (B) at (1.5, -0.5) {B};
  \node[draw] (C) at (0, 1.5) {C};
\end{tikzpicture}`);

  await page.evaluate(() => {
    const api = (globalThis as unknown as {
      __TIKZ_EDITOR_APP_TEST_API__?: {
        selectSourceIds?: (sourceIds: string[]) => void;
      };
    }).__TIKZ_EDITOR_APP_TEST_API__;
    api?.selectSourceIds?.(["path:3"]);
  });

  await openMenuCommand(page, "edit", "edit.repeat");
  await expect(page.getByTestId("repeat-modal")).toBeVisible();

  await page.getByTestId("repeat-columns-input").fill("3");
  await page.getByTestId("repeat-rows-input").fill("3");

  await expect(page.getByTestId("canvas-repeat-preview-layer")).toBeVisible();
  await expect.poll(async () => {
    return await page.getByTestId("canvas-repeat-preview-layer").locator("text").evaluateAll((nodes) =>
      nodes.filter((node) => node.textContent === "C").length
    );
  }).toBe(8);
});
