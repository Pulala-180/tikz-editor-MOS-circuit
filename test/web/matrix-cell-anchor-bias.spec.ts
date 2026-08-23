import { describe, expect, it } from "vitest";
import { renderTikzToSvg } from "../../packages/core/src/render/index.js";
import { collectSourceWorldBounds } from "../../packages/core/src/edit/snapping/index.js";
import { resolveEndpointAnchorSnap, type MatrixCellAnchorHint } from "../../packages/app/src/ui/canvas-panel/endpoint-anchor-snap";
import { wb, wp } from "../coords-helpers.js";

describe("matrix-cell anchor bias integration", () => {
  it("prefers anchors of the nearest matrix cell when adding path endpoints", () => {
    const source = String.raw`\begin{tikzpicture}
  \matrix[matrix of nodes] (m) {
    A & B \\
    C & D \\
  };
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);
    const boundsBySource = collectSourceWorldBounds(rendered.semantic.scene.elements);
    const hintsByCellId = new Map<string, MatrixCellAnchorHint>();
    for (const element of rendered.semantic.scene.elements) {
      const matrixCell = element.matrixCell;
      if (!matrixCell || hintsByCellId.has(matrixCell.cellSourceId)) {
        continue;
      }
      const bounds = boundsBySource.get(matrixCell.cellSourceId);
      if (!bounds) {
        continue;
      }
      hintsByCellId.set(matrixCell.cellSourceId, {
        matrixSourceId: matrixCell.matrixSourceId,
        cellSourceId: matrixCell.cellSourceId,
        row: matrixCell.row,
        column: matrixCell.column,
        bounds: wb(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY)
      });
    }
    const hints = [...hintsByCellId.values()];
    const cell12 = hints.find((hint) => hint.row === 1 && hint.column === 2);
    if (!cell12) {
      throw new Error("Expected matrix cell (1,2) hint");
    }
    const pointer = wp(
      (cell12.bounds.minX + cell12.bounds.maxX) / 2,
      (cell12.bounds.minY + cell12.bounds.maxY) / 2
    );

    const snap = resolveEndpointAnchorSnap({
      pointerWorld: pointer,
      zoom: 1,
      nodeAnchorTargets: rendered.semantic.nodeAnchorTargets,
      matrixCellAnchorHints: hints
    });

    expect(snap.visibleAnchors.length).toBeGreaterThan(0);
    expect(snap.visibleAnchors.some((anchor) => anchor.nodeName === "m-1-2")).toBe(true);
  });

  it("shows A-cell anchors when hovering at the center of A in a styled named matrix", () => {
    const source = String.raw`\begin{tikzpicture}
  \matrix[
    matrix of nodes,
    ampersand replacement=\&,
    nodes={draw,minimum width=12mm,minimum height=8mm,fill=orange!12},
    row sep=4mm,
    column sep=6mm
  ] (m) {
    A \& B \& C \\
    D \& E \& F \\
  };
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);
    const boundsBySource = collectSourceWorldBounds(rendered.semantic.scene.elements);
    const hintsByCellId = new Map<string, MatrixCellAnchorHint>();
    for (const element of rendered.semantic.scene.elements) {
      const matrixCell = element.matrixCell;
      if (!matrixCell || hintsByCellId.has(matrixCell.cellSourceId)) {
        continue;
      }
      const bounds = boundsBySource.get(matrixCell.cellSourceId);
      if (!bounds) {
        continue;
      }
      hintsByCellId.set(matrixCell.cellSourceId, {
        matrixSourceId: matrixCell.matrixSourceId,
        cellSourceId: matrixCell.cellSourceId,
        row: matrixCell.row,
        column: matrixCell.column,
        bounds: wb(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY)
      });
    }
    const hints = [...hintsByCellId.values()];
    const cellA = hints.find((hint) => hint.row === 1 && hint.column === 1);
    if (!cellA) {
      throw new Error("Expected matrix cell A (1,1) hint");
    }
    const pointer = wp(
      (cellA.bounds.minX + cellA.bounds.maxX) / 2,
      (cellA.bounds.minY + cellA.bounds.maxY) / 2
    );

    const snap = resolveEndpointAnchorSnap({
      pointerWorld: pointer,
      zoom: 1,
      nodeAnchorTargets: rendered.semantic.nodeAnchorTargets,
      matrixCellAnchorHints: hints
    });

    expect(snap.visibleAnchors.some((anchor) => anchor.nodeName === "m-1-1")).toBe(true);
  });

  it("shows A-cell anchors at A-center when hints are built from world-space bounds", () => {
    const source = String.raw`\begin{tikzpicture}
  \matrix[
    matrix of nodes,
    ampersand replacement=\&,
    nodes={draw,minimum width=12mm,minimum height=8mm,fill=orange!12},
    row sep=4mm,
    column sep=6mm
  ] (m) {
    A \& B \& C \\
    D \& E \& F \\
  };
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);
    const boundsBySource = collectSourceWorldBounds(rendered.semantic.scene.elements);
    const hintsByCellId = new Map<string, MatrixCellAnchorHint>();
    for (const element of rendered.semantic.scene.elements) {
      const matrixCell = element.matrixCell;
      if (!matrixCell || hintsByCellId.has(matrixCell.cellSourceId)) {
        continue;
      }
      const bounds = boundsBySource.get(matrixCell.cellSourceId);
      if (!bounds) {
        continue;
      }
      hintsByCellId.set(matrixCell.cellSourceId, {
        matrixSourceId: matrixCell.matrixSourceId,
        cellSourceId: matrixCell.cellSourceId,
        row: matrixCell.row,
        column: matrixCell.column,
        bounds: wb(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY)
      });
    }
    const hints = [...hintsByCellId.values()];
    const aCenter = rendered.semantic.nodeAnchorTargets.find(
      (anchor) => anchor.nodeName === "m-1-1" && anchor.anchor === "center"
    );
    if (!aCenter) {
      throw new Error("Expected m-1-1 center anchor");
    }

    const snap = resolveEndpointAnchorSnap({
      pointerWorld: aCenter.world,
      zoom: 1,
      nodeAnchorTargets: rendered.semantic.nodeAnchorTargets,
      matrixCellAnchorHints: hints
    });

    expect(snap.visibleAnchors.some((anchor) => anchor.nodeName === "m-1-1")).toBe(true);
  });
});
