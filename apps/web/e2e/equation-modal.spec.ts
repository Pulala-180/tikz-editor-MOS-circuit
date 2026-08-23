import { expect, test } from "@playwright/test";
import {
  focusCanvas,
  clickHitRegionByTargetId,
  gotoApp,
  openMenuCommand,
  readSource,
  resetStorageBeforeNavigation,
  setSource
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
  await gotoApp(page);
});

test("Insert > Equation opens modal and inserts a node at origin", async ({ page }) => {
  await openMenuCommand(page, "insert", "insert.equation");
  await expect(page.getByTestId("equation-modal")).toBeVisible();
  await expect(page.locator("math-field")).toHaveCount(1);

  await page.locator("math-field").evaluate((element) => {
    const field = element as unknown as { value: string; dispatchEvent: (event: Event) => void };
    field.value = "x+y";
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await page.getByTestId("equation-modal").getByRole("button", { name: "Insert" }).click();
  await expect(page.getByTestId("equation-modal")).toHaveCount(0);
  await expect.poll(async () => readSource(page)).toContain("\\node at (0,0) {$x+y$};");
});

test("Insert equation preserves TeX braces", async ({ page }) => {
  await openMenuCommand(page, "insert", "insert.equation");
  await expect(page.getByTestId("equation-modal")).toBeVisible();

  await page.locator("math-field").evaluate((element) => {
    const field = element as unknown as { value: string; dispatchEvent: (event: Event) => void };
    field.value = "\\frac{a}{b}=x";
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await page.getByTestId("equation-modal").getByRole("button", { name: "Insert" }).click();
  await expect(page.getByTestId("equation-modal")).toHaveCount(0);
  await expect.poll(async () => readSource(page)).toContain("\\node at (0,0) {$\\frac{a}{b}=x$};");
});

test("insert equation draft persists after closing and reopening modal", async ({ page }) => {
  await openMenuCommand(page, "insert", "insert.equation");
  await expect(page.getByTestId("equation-modal")).toBeVisible();
  await page.locator("math-field").evaluate((element) => {
    const field = element as unknown as { value: string; dispatchEvent: (event: Event) => void };
    field.value = "\\frac{a}{b}";
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("equation-modal")).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+Shift+E");
  await expect(page.getByTestId("equation-modal")).toBeVisible();
  await expect(page.locator("math-field")).toHaveJSProperty("value", "\\frac{a}{b}");
});

test("math-only nodes expose Edit equation in context menu", async ({ page }) => {
  await setSource(
    page,
    String.raw`\begin{tikzpicture}
  \node at (0,0) {$x+y$};
  \node at (2,0) {$x$ and $y$};
\end{tikzpicture}`
  );

  await clickHitRegionByTargetId(page, "path:0", { button: "right" });
  await expect(page.getByTestId("canvas-context-cmd-edit.equation")).toBeVisible();
  await page.getByTestId("canvas-context-cmd-edit.equation").click();

  await expect(page.getByTestId("equation-modal")).toBeVisible();
  await page.locator("math-field").evaluate((element) => {
    const field = element as unknown as { value: string; dispatchEvent: (event: Event) => void };
    field.value = "x-y";
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByTestId("equation-modal").getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => readSource(page)).toContain("\\node at (0,0) {$x-y$};");

  await clickHitRegionByTargetId(page, "path:1", { button: "right" });
  await expect(page.getByTestId("canvas-context-cmd-edit.equation")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await clickHitRegionByTargetId(page, "path:0");
  await expect.poll(async () => readSource(page)).toContain("\\node at (0,0) {$x-y$};");
  await expect.poll(async () => {
    const selected = await page.evaluate(() => {
      const api = (globalThis as unknown as {
        __TIKZ_EDITOR_APP_TEST_API__?: { getSelectedSourceIds?: () => string[] };
      }).__TIKZ_EDITOR_APP_TEST_API__;
      return api?.getSelectedSourceIds?.() ?? [];
    });
    return selected.includes("path:0");
  }).toBe(true);
  await focusCanvas(page);
  let modalOpened = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.keyboard.press("ControlOrMeta+Shift+E");
    try {
      await expect(page.getByTestId("equation-modal")).toBeVisible({ timeout: 2_000 });
      modalOpened = true;
      break;
    } catch {
      // Retry to handle occasional delayed keybinding activation after context-menu workflows.
    }
  }
  expect(modalOpened).toBe(true);
});
