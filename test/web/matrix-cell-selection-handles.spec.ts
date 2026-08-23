/** @vitest-environment jsdom */

import { createElement, useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderTikzToSvg } from "../../packages/core/src/render/index.js";
import { useCanvasSelectionDerivedState } from "../../packages/app/src/ui/canvas-panel/useCanvasSelectionDerivedState.js";

type DerivedStateSnapshot = {
  resizeFrameSourceIds: Set<string>;
  handleDisplays: Array<{ kind: string; elementId?: string; cursor?: string }>;
};

function Harness(props: {
  source: string;
  selectedElementIds: Set<string>;
  onUpdate: (state: DerivedStateSnapshot) => void;
}) {
  const rendered = renderTikzToSvg(props.source);
  const derived = useCanvasSelectionDerivedState({
    snapshot: {
      source: props.source,
      scene: rendered.semantic.scene,
      editHandles: rendered.semantic.editHandles,
      parseResult: rendered.parse,
      semanticResult: rendered.semantic
    },
    selectedElementIds: props.selectedElementIds,
    collapsedDensePathSourceIds: new Set<string>(),
    svgResult: rendered.svg,
    canvasTransform: { translateX: 0, translateY: 0, scale: 1 },
    marqueeDraft: null,
    toolMode: "select",
    viewportSize: { width: 1024, height: 768 },
    ROTATE_HANDLE_OFFSET_PX: 24
  });

  useEffect(() => {
    props.onUpdate({
      resizeFrameSourceIds: derived.resizeFrameSourceIds,
      handleDisplays: derived.handleDisplays
    });
  }, [derived.handleDisplays, derived.resizeFrameSourceIds, props]);

  return null;
}

describe("matrix-cell selection handles", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows no-op corner handles for selected matrix cells and suppresses rotate handle", async () => {
    const source = String.raw`\begin{tikzpicture}
  \matrix[matrix of nodes,nodes={draw}] {
    A & B \\
  };
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);
    const matrixCellId = rendered.semantic.scene.elements.find(
      (entry) => entry.matrixCell?.row === 1 && entry.matrixCell.column === 1
    )?.matrixCell?.cellSourceId;
    expect(matrixCellId).toBeDefined();
    if (!matrixCellId) {
      throw new Error("Expected matrix cell source id");
    }

    let latest: DerivedStateSnapshot = {
      resizeFrameSourceIds: new Set<string>(),
      handleDisplays: []
    };
    let updated = false;
    await act(async () => {
      root.render(createElement(Harness, {
        source,
        selectedElementIds: new Set([matrixCellId]),
        onUpdate: (state: DerivedStateSnapshot) => {
          latest = state;
          updated = true;
        }
      }));
    });

    expect(updated).toBe(true);

    expect(latest.resizeFrameSourceIds.has(matrixCellId)).toBe(true);
    const cellResizeHandles = latest.handleDisplays.filter(
      (display: { kind: string; elementId?: string }) =>
        display.kind === "resize-element" && display.elementId === matrixCellId
    );
    expect(cellResizeHandles).toHaveLength(4);
    for (const handle of cellResizeHandles) {
      expect(handle.cursor).toBe("not-allowed");
    }
    const cellRotateHandles = latest.handleDisplays.filter(
      (display: { kind: string; elementId?: string }) =>
        display.kind === "rotate-element" && display.elementId === matrixCellId
    );
    expect(cellRotateHandles).toHaveLength(0);
  });
});
