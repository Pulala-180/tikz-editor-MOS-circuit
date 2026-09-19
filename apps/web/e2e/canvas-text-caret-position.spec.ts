import { expect, test } from "@playwright/test";
import {
  clickTextHitRegionByTargetId,
  gotoApp,
  resetStorageBeforeNavigation,
  setSource,
  waitForHitRegions
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("typing inside centered text keeps caret overlay strictly aligned with insertion point", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, `\\begin{tikzpicture}\n\\node at (0,0) {$M_{s1}$};\n\\end{tikzpicture}`);
  await waitForHitRegions(page, 1);
  await clickTextHitRegionByTargetId(page, "path:0");

  const textarea = page.getByTestId("canvas-text-edit-textarea");
  await expect(textarea).toBeFocused();
  await expect(textarea).toHaveValue("$M_{s1}$");

  // Move caret to between 's' and '1' (offset 5 in "$M_{s1}$")
  // 0:$, 1:M, 2:_, 3:{, 4:s, 5:1, 6:}, 7:$
  await textarea.evaluate((el) => {
    const ta = el as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(5, 5);
    ta.dispatchEvent(new Event("select", { bubbles: true }));
  });

  const getCaretLeft = async () => {
    return await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="canvas-text-edit-caret-overlay"]') as HTMLDivElement | null;
      if (!overlay) return null;
      return Number.parseFloat(overlay.style.left);
    });
  };

  const initialLeft = await getCaretLeft();
  expect(initialLeft).not.toBeNull();

  // Type 1st 's' -> "$M_{ss1}$" (offset 6)
  await page.keyboard.type("s");
  await expect(textarea).toHaveValue("$M_{ss1}$");
  const leftAfterFirstS = await getCaretLeft();
  expect(leftAfterFirstS).not.toBeNull();
  expect(leftAfterFirstS!).toBeGreaterThan(initialLeft!);
  const charWidth = leftAfterFirstS! - initialLeft!;

  // Type 2nd 's' -> "$M_{sss1}$" (offset 7)
  await page.keyboard.type("s");
  await expect(textarea).toHaveValue("$M_{sss1}$");
  const leftAfterSecondS = await getCaretLeft();
  expect(leftAfterSecondS).not.toBeNull();
  expect(leftAfterSecondS!).toBeGreaterThan(leftAfterFirstS!);

  // Critical regression check: In monospace font, each character advance should be nearly identical (within 1px).
  // The bug previously caused a 16px jump across '1' onto '}' due to subpixel line-wrapping in mirror div!
  const secondAdvance = leftAfterSecondS! - leftAfterFirstS!;
  expect(Math.abs(secondAdvance - charWidth)).toBeLessThan(1.0);

  // Type 'x' -> verify insertion happens right at the caret position before '1'
  await page.keyboard.type("x");
  await expect(textarea).toHaveValue("$M_{sssx1}$");
  const leftAfterX = await getCaretLeft();
  expect(leftAfterX).not.toBeNull();
  expect(leftAfterX!).toBeGreaterThan(leftAfterSecondS!);
  const thirdAdvance = leftAfterX! - leftAfterSecondS!;
  expect(Math.abs(thirdAdvance - charWidth)).toBeLessThan(1.0);
});
