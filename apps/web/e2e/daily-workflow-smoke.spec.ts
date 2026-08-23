import { expect, test, type Page } from "@playwright/test";
import {
  clickTextHitRegionByTargetId,
  dragBetweenPoints,
  dragHitRegionByTargetId,
  expectSourceCanvasConsistency,
  gotoApp,
  interactionLayer,
  openMenuCommand,
  readCodeMirrorText,
  readPersistedWorkspaceDocumentCount,
  readSelectedSourceIds,
  readSource,
  resetStorageBeforeNavigation,
  selectAllSceneElements,
  setSource,
  tabSwitchButtons,
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

function toolbarButton(page: Page, label: string) {
  return page.locator(`[data-tauri-drag-region] button[aria-label="${label}"]`).first();
}

test("daily edit loop keeps source, snapshot, canvas and history coherent", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, String.raw`\begin{tikzpicture}
\draw[blue,fill=blue!10] (0,0) rectangle (1,0.6);
\node[draw,align=center] at (1,1) {Hello wrapped world};
\end{tikzpicture}`);
  await waitForHitRegions(page, 2);
  await expectSourceCanvasConsistency(page, {
    minSceneSourceIds: 2,
    minHitRegions: 2,
    requireVisibleSourceEditor: true
  });

  await clickTextHitRegionByTargetId(page, "path:1");
  await expectSourceCanvasConsistency(page, {
    minSceneSourceIds: 2,
    minHitRegions: 2,
    assertSelectionInScene: true
  });

  const textWidthInput = await nodeTextWidthInput(page);
  await textWidthInput.click();
  await textWidthInput.pressSequentially("96");
  await expect.poll(async () => readSource(page)).toContain("text width=96pt");
  await expectSourceCanvasConsistency(page, {
    minSceneSourceIds: 2,
    minHitRegions: 2,
    assertSelectionInScene: true
  });

  const sourceBeforeDrag = await readSource(page);
  await dragHitRegionByTargetId(page, "path:0", 36, 18);
  await expect.poll(async () => readSource(page)).not.toEqual(sourceBeforeDrag);
  await expectSourceCanvasConsistency(page, {
    minSceneSourceIds: 2,
    minHitRegions: 2,
    assertSelectionInScene: true
  });

  await selectAllSceneElements(page);
  const sourceBeforeDuplicate = await readSource(page);
  await openMenuCommand(page, "edit", "edit.duplicate");
  await expect.poll(async () => readSource(page)).not.toEqual(sourceBeforeDuplicate);
  await expectSourceCanvasConsistency(page, {
    minSceneSourceIds: 4,
    minHitRegions: 4,
    assertSelectionInScene: true
  });

  const duplicatedSource = await readSource(page);
  await openMenuCommand(page, "edit", "edit.undo");
  await expect.poll(async () => readSource(page)).toEqual(sourceBeforeDuplicate);
  await expectSourceCanvasConsistency(page, {
    minSceneSourceIds: 2,
    minHitRegions: 2,
    assertSelectionInScene: true
  });

  await openMenuCommand(page, "edit", "edit.redo");
  await expect.poll(async () => readSource(page)).toEqual(duplicatedSource);
  await expectSourceCanvasConsistency(page, {
    minSceneSourceIds: 4,
    minHitRegions: 4,
    assertSelectionInScene: true
  });

  await openMenuCommand(page, "insert", "insert.rect");
  const layer = interactionLayer(page);
  await dragBetweenPoints(page, layer, { x: 140, y: 180 }, { x: 250, y: 255 });
  await page.mouse.up();
  await expect.poll(async () => readSource(page)).toContain("rectangle");
  await expectSourceCanvasConsistency(page, {
    minSceneSourceIds: 5,
    minHitRegions: 5,
    requireVisibleSourceEditor: true,
    assertSelectionInScene: true,
    assertNoActiveCanvasDrag: true,
    assertNoPendingRequest: true
  });

  await expect(await readCodeMirrorText(page)).toEqual(await readSource(page));
});

test("document switching, reload and panel visibility keep sources isolated", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, String.raw`\begin{tikzpicture}
\draw[fill=red!10] (0,0) rectangle (1,1);
\node[draw] at (2,0) {doc one};
\end{tikzpicture}
\begin{tikzpicture}
\draw (0,0) circle (0.5cm);
\end{tikzpicture}`);
  await expectSourceCanvasConsistency(page, {
    minSceneSourceIds: 2,
    minHitRegions: 2,
    requireVisibleSourceEditor: true,
    assertNoPendingRequest: true
  });

  await openMenuCommand(page, "file", "file.new-document");
  await expect(tabSwitchButtons(page)).toHaveCount(2);
  await setSource(page, String.raw`\begin{tikzpicture}
\draw[blue] (0,0) -- (1,1);
\node[draw] at (1,0) {doc two};
\end{tikzpicture}`);
  await expectSourceCanvasConsistency(page, {
    minSceneSourceIds: 2,
    minHitRegions: 2,
    requireVisibleSourceEditor: true,
    assertNoPendingRequest: true
  });

  await tabSwitchButtons(page).first().click();
  await expect.poll(async () => readSource(page)).toContain("doc one");
  await expectSourceCanvasConsistency(page, {
    minSceneSourceIds: 2,
    minHitRegions: 2,
    requireVisibleSourceEditor: true,
    assertNoPendingRequest: true
  });

  await openMenuCommand(page, "view", "view.toggle-source-panel");
  await expectSourceCanvasConsistency(page, {
    minSceneSourceIds: 2,
    minHitRegions: 2,
    assertNoPendingRequest: true
  });

  await tabSwitchButtons(page).nth(1).click();
  await expect.poll(async () => readSource(page)).toContain("doc two");
  await expectSourceCanvasConsistency(page, {
    minSceneSourceIds: 2,
    minHitRegions: 2,
    assertNoPendingRequest: true
  });
  await expect.poll(async () => readPersistedWorkspaceDocumentCount(page)).toBe(2);

  await page.reload();
  await expect(tabSwitchButtons(page)).toHaveCount(2);
  await tabSwitchButtons(page).first().click();
  await expect.poll(async () => readSource(page)).toContain("doc one");
  await expectSourceCanvasConsistency(page, {
    minSceneSourceIds: 2,
    minHitRegions: 2,
    assertNoPendingRequest: true
  });
  await tabSwitchButtons(page).nth(1).click();
  await expect.poll(async () => readSource(page)).toContain("doc two");
  await expectSourceCanvasConsistency(page, {
    minSceneSourceIds: 2,
    minHitRegions: 2,
    assertNoPendingRequest: true
  });
});

test("creation modal and toolbar workflows keep source and canvas synchronized", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, String.raw`\begin{tikzpicture}
\end{tikzpicture}`);
  await expectSourceCanvasConsistency(page, {
    requireVisibleSourceEditor: true,
    assertNoPendingRequest: true
  });

  await openMenuCommand(page, "insert", "insert.equation");
  await expect(page.getByTestId("equation-modal")).toBeVisible();
  await page.locator("math-field").evaluate((element) => {
    const field = element as unknown as { value: string; dispatchEvent: (event: Event) => void };
    field.value = String.raw`\frac{a}{b}`;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByTestId("equation-modal").getByRole("button", { name: "Insert" }).click();
  await expect.poll(async () => readSource(page)).toContain(String.raw`\node at (0,0) {$\frac{a}{b}$};`);
  await expectSourceCanvasConsistency(page, {
    minSceneSourceIds: 1,
    minHitRegions: 1,
    requireVisibleSourceEditor: true,
    assertNoPendingRequest: true
  });

  await toolbarButton(page, "Matrix").click();
  await expect(page.getByTestId("toolbar-tool-popup-addMatrix")).toBeVisible();
  await page.getByTestId("toolbar-matrix-picker-cell-2-3").click();
  const layer = interactionLayer(page);
  await dragBetweenPoints(page, layer, { x: 185, y: 190 }, { x: 185, y: 190 });
  await page.mouse.up();
  await expect.poll(async () => readSource(page)).toContain("\\matrix [matrix of nodes] at (");
  await expect.poll(async () => readSelectedSourceIds(page)).toHaveLength(1);
  await expectSourceCanvasConsistency(page, {
    minSceneSourceIds: 2,
    minHitRegions: 2,
    requireVisibleSourceEditor: true,
    assertSelectionInScene: true,
    assertNoActiveCanvasDrag: true,
    assertNoPendingRequest: true
  });
});
