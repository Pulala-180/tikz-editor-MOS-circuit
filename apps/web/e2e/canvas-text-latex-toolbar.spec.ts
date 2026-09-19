import { expect, test, type Page } from "@playwright/test";
import {
  clickTextHitRegionByTargetId,
  gotoApp,
  readStoreSource,
  resetStorageBeforeNavigation,
  setSource,
  waitForHitRegions
} from "./helpers";

const PRIMARY_MOD = process.platform === "darwin" ? "Meta" : "Control";

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

async function openSingleNodeLabelEditor(page: Page, nodeText: string): Promise<void> {
  await gotoApp(page);
  await setSource(page, `\\begin{tikzpicture}\n\\node at (0,0) {${nodeText}};\n\\end{tikzpicture}`);
  await waitForHitRegions(page, 1);
  await clickTextHitRegionByTargetId(page, "path:0");
  await expect(page.getByTestId("canvas-text-edit-popup")).toBeVisible();
  await expect(page.getByTestId("canvas-text-edit-textarea")).toBeFocused();
}

async function selectTextareaRange(page: Page, start: number, end: number): Promise<void> {
  await page.getByTestId("canvas-text-edit-textarea").evaluate((element, range) => {
    const [nextStart, nextEnd] = range as [number, number];
    const textarea = element as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(nextStart, nextEnd);
    textarea.dispatchEvent(new Event("select", { bubbles: true }));
  }, [start, end]);
}

async function clickToolbarButton(page: Page, command: string): Promise<void> {
  await page.getByTestId(`canvas-text-edit-toolbar-${command}`).click();
}

async function readTextareaSelection(page: Page): Promise<{ start: number; end: number }> {
  return page.getByTestId("canvas-text-edit-textarea").evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    return { start: textarea.selectionStart, end: textarea.selectionEnd };
  });
}

test("rich label editor exposes the trimmed toolbar plus a live MathJax preview", async ({ page }) => {
  await openSingleNodeLabelEditor(page, "$M_1$");

  const toolbar = page.getByTestId("canvas-text-edit-toolbar");
  await expect(toolbar).toBeVisible();
  // Retained formatting buttons.
  await expect(page.getByTestId("canvas-text-edit-toolbar-italic")).toBeVisible();
  await expect(page.getByTestId("canvas-text-edit-toolbar-subscript")).toBeVisible();
  await expect(page.getByTestId("canvas-text-edit-toolbar-superscript")).toBeVisible();
  await expect(page.getByTestId("canvas-text-edit-toolbar-symbol")).toBeVisible();
  // Retained function keys (deleting them would make the panel unusable).
  await expect(page.getByTestId("canvas-text-edit-toolbar-apply")).toBeVisible();
  await expect(page.getByTestId("canvas-text-edit-toolbar-delete")).toBeVisible();
  // Removed buttons must be gone, not merely hidden.
  for (const removed of [
    "bold",
    "overline",
    "bulletList",
    "alignLeft",
    "alignCenter",
    "alignRight",
    "fontGrow",
    "fontShrink"
  ]) {
    await expect(page.getByTestId(`canvas-text-edit-toolbar-${removed}`)).toHaveCount(0);
  }

  // The raw LaTeX source is still editable and the compiled formula is previewed live.
  const preview = page.getByTestId("canvas-text-edit-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("data-status", "ready");
  await expect(page.getByTestId("canvas-text-edit-preview-math").locator("svg").first()).toBeVisible();
});

test("rich label panel uses the fixed 1.15 enlargement", async ({ page }) => {
  await openSingleNodeLabelEditor(page, "$v_{out}$");

  const popup = page.getByTestId("canvas-text-edit-popup");
  const readFixedScale = async () =>
    popup.evaluate((element) => {
      const transform = getComputedStyle(element).transform;
      return new DOMMatrixReadOnly(transform).a;
    });

  expect(await readFixedScale()).toBeCloseTo(1.15, 2);
});

test("preview re-renders live as the LaTeX source changes", async ({ page }) => {
  await openSingleNodeLabelEditor(page, "$M_1$");
  const preview = page.getByTestId("canvas-text-edit-preview");
  const previewMath = page.getByTestId("canvas-text-edit-preview-math");
  await expect(preview).toHaveAttribute("data-status", "ready");
  await expect(previewMath.locator("svg").first()).toBeVisible();
  const before = await previewMath.innerHTML();
  expect(before.length).toBeGreaterThan(0);

  // Changing the source re-compiles the preview to the new formula.
  await page.getByTestId("canvas-text-edit-textarea").press(`${PRIMARY_MOD}+a`);
  await page.keyboard.type("$M_2$");
  await expect.poll(async () => await previewMath.innerHTML()).not.toBe(before);
  await expect(preview).toHaveAttribute("data-status", "ready");
});

test("subscript button turns plain text into compilable math-mode LaTeX", async ({ page }) => {
  await openSingleNodeLabelEditor(page, "Vin");
  await selectTextareaRange(page, 1, 3);
  await clickToolbarButton(page, "subscript");

  await expect.poll(async () => await readStoreSource(page)).toContain("{$V_{in}$}");
  await expect(page.getByTestId("canvas-text-edit-textarea")).toHaveValue("$V_{in}$");
});

test("superscript and italic buttons emit compilable LaTeX with automatic math mode", async ({ page }) => {
  await openSingleNodeLabelEditor(page, "Vin");

  await selectTextareaRange(page, 1, 3);
  await clickToolbarButton(page, "superscript");
  await expect.poll(async () => await readStoreSource(page)).toContain("{$V^{in}$}");

  // Selecting the already-math label and applying italic must not nest `$...$`.
  await page.getByTestId("canvas-text-edit-textarea").press(`${PRIMARY_MOD}+a`);
  await clickToolbarButton(page, "italic");
  await expect.poll(async () => await readStoreSource(page)).toContain("{$\\mathit{V^{in}}$}");
});

// --- The caret-positioning defence -------------------------------------------
// Regression guard for "put the caret in the middle, press a button, and the
// content lands somewhere else". The insertion offset must equal the caret the
// textarea reports, byte for byte, and must not disturb the surrounding source.

test("CURSOR: a subscript inserts exactly at a mouse-placed mid-text caret", async ({ page }) => {
  await openSingleNodeLabelEditor(page, "$M\\delta\\mathit{a}_2$");
  const textarea = page.getByTestId("canvas-text-edit-textarea");
  const before = await textarea.inputValue();
  expect(before).toBe("$M\\delta\\mathit{a}_2$");

  // Put the caret in the middle of the text with a real mouse click.
  const box = (await textarea.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);

  const caret = await readTextareaSelection(page);
  expect(caret.start).toBe(caret.end);
  expect(caret.start).toBeGreaterThan(0);
  expect(caret.start).toBeLessThan(before.length);

  await clickToolbarButton(page, "subscript");

  // The source is byte-identical except for `_{}` landing exactly at the caret.
  const expected = `${before.slice(0, caret.start)}_{}${before.slice(caret.start)}`;
  await expect(textarea).toHaveValue(expected);
  await expect.poll(async () => await readStoreSource(page)).toContain(`{${expected}}`);

  // The `$` math runs stay balanced — no `$$`, no stray delimiters.
  expect(expected.match(/(?<!\\)\$/g) ?? []).toHaveLength(before.match(/(?<!\\)\$/g)?.length ?? 0);
  expect(expected).not.toContain("$$");

  // The caret is left inside the new `_{ }`, so the next keystroke becomes the
  // subscript (offset of the marker is `before + "_" + "{"`).
  const after = await readTextareaSelection(page);
  expect(after.start).toBe(caret.start + "_{".length);
  expect(after.end).toBe(after.start);
});

test("CURSOR: a superscript inserts at a keyboard-placed mid-text caret, byte for byte", async ({ page }) => {
  await openSingleNodeLabelEditor(page, "$M\\delta\\mathit{a}_2$");
  const textarea = page.getByTestId("canvas-text-edit-textarea");

  // Home then 8 arrow-rights: a real, deterministic caret move to offset 8, right
  // after `\delta` and before `\mathit` — the middle of the label.
  await textarea.press("Home");
  for (let i = 0; i < 8; i += 1) {
    await textarea.press("ArrowRight");
  }
  const caret = await readTextareaSelection(page);
  expect(caret).toEqual({ start: 8, end: 8 });

  await clickToolbarButton(page, "superscript");

  await expect(textarea).toHaveValue("$M\\delta^{}\\mathit{a}_2$");
  await expect(page.getByTestId("canvas-text-edit-preview")).toHaveAttribute("data-status", "ready");
});

test("CURSOR: italic on a selected subscript digit yields an italic subscript", async ({ page }) => {
  await openSingleNodeLabelEditor(page, "$X_2$");
  const textarea = page.getByTestId("canvas-text-edit-textarea");

  // Select just the subscript digit "2" (offset 3..4), then press italic.
  await selectTextareaRange(page, 3, 4);
  await clickToolbarButton(page, "italic");

  await expect(textarea).toHaveValue("$X_\\mathit{2}$");
  await expect.poll(async () => await readStoreSource(page)).toContain("{$X_\\mathit{2}$}");
  await expect(page.getByTestId("canvas-text-edit-preview")).toHaveAttribute("data-status", "ready");
});

test("symbol palette inserts a math symbol", async ({ page }) => {
  await openSingleNodeLabelEditor(page, "A");
  await selectTextareaRange(page, 1, 1);
  await page.getByTestId("canvas-text-edit-toolbar-symbol").click();
  const palette = page.getByTestId("canvas-text-edit-symbol-palette");
  await expect(palette).toBeVisible();
  await page.getByTestId("canvas-text-edit-symbol-button").first().click();
  await expect(palette).toHaveCount(0);
  await expect.poll(async () => await readStoreSource(page)).toContain("$A\\Omega$");
});

test("Apply closes the label editor and Delete clears the text but keeps it open", async ({ page }) => {
  await openSingleNodeLabelEditor(page, "Hello");
  await clickToolbarButton(page, "delete");
  await expect(page.getByTestId("canvas-text-edit-textarea")).toHaveValue("");
  await expect(page.getByTestId("canvas-text-edit-popup")).toBeVisible();
  await expect.poll(async () => await readStoreSource(page)).toContain("{}");

  await clickToolbarButton(page, "apply");
  await expect(page.getByTestId("canvas-text-edit-popup")).toHaveCount(0);
});

test("toolbar edits are undoable through the existing history merge path", async ({ page }) => {
  await openSingleNodeLabelEditor(page, "Vin");
  await selectTextareaRange(page, 1, 3);
  await clickToolbarButton(page, "subscript");
  await expect.poll(async () => await readStoreSource(page)).toContain("{$V_{in}$}");

  await page.getByTestId("canvas-text-edit-textarea").focus();
  await page.keyboard.press(`${PRIMARY_MOD}+z`);
  await expect(page.getByTestId("canvas-text-edit-textarea")).toHaveValue("Vin");
  await expect.poll(async () => await readStoreSource(page)).toContain("{Vin}");
});

test("math toolbar buttons are disabled for foreach template labels", async ({ page }) => {
  await gotoApp(page);
  await setSource(
    page,
    `\\begin{tikzpicture}\n  \\foreach \\y in {1,2} {\n    \\node at (\\y, 0) {\\y};\n  }\n\\end{tikzpicture}`
  );
  const region = page.locator('[data-hit-region-interaction-mode="text"]').first();
  await expect(region).toBeVisible();
  await region.click();
  await expect(page.getByTestId("canvas-text-edit-foreach-tag")).toHaveText("foreach");

  await expect(page.getByTestId("canvas-text-edit-toolbar-subscript")).toBeDisabled();
  await expect(page.getByTestId("canvas-text-edit-toolbar-symbol")).toBeDisabled();
  await expect(page.getByTestId("canvas-text-edit-toolbar-italic")).toBeEnabled();
});
