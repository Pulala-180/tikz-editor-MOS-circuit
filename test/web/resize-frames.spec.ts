import { describe, expect, it } from "vitest";
import type { SceneText } from "../../packages/core/src/semantic/types.js";
import { parseTikz } from "../../packages/core/src/parser/index.js";
import { evaluateTikzFigure } from "../../packages/core/src/semantic/evaluate.js";
import { PT_PER_CM } from "../../packages/core/src/edit/format.js";
import { resolveResizeFrameForSource } from "../../packages/app/src/ui/canvas-panel/resize-frames";

const TEST_VIEW_BOX = {
  x: -200,
  y: -200,
  width: 400,
  height: 400
};
const cm = (value: number) => value * PT_PER_CM;

function resolveFrame(source: string, sourceId: string) {
  const parsed = parseTikz(source, { recover: true });
  const evaluated = evaluateTikzFigure(parsed.figure, source);
  return resolveResizeFrameForSource(
    evaluated.scene.elements,
    evaluated.editHandles,
    sourceId,
    TEST_VIEW_BOX
  );
}

describe("resize frame geometry", () => {
  it("derives rotated rectangle corners with stable corner-role assignment", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw[rotate=45] (0,0) rectangle (2,1);
\end{tikzpicture}`;
    const frame = resolveFrame(source, "path:0");
    expect(frame).not.toBeNull();
    if (!frame) {
      return;
    }

    const topLeft = frame.cornersByRole["top-left"].world;
    const topRight = frame.cornersByRole["top-right"].world;
    const bottomLeft = frame.cornersByRole["bottom-left"].world;
    const bottomRight = frame.cornersByRole["bottom-right"].world;
    expect(topLeft.x).toBeCloseTo(cm(-Math.SQRT1_2), 3);
    expect(topLeft.y).toBeCloseTo(cm(Math.SQRT1_2), 3);
    expect(topRight.x).toBeCloseTo(cm(Math.SQRT1_2), 3);
    expect(topRight.y).toBeCloseTo(cm(3 * Math.SQRT1_2), 3);
    expect(bottomRight.x).toBeCloseTo(cm(2 * Math.SQRT1_2), 3);
    expect(bottomRight.y).toBeCloseTo(cm(2 * Math.SQRT1_2), 3);
    expect(bottomLeft.x).toBeCloseTo(0, 3);
    expect(bottomLeft.y).toBeCloseTo(0, 3);
  });

  it("uses transformed circle basis so corner handles are not on axis-aligned AABB corners", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw[rotate=45] (0,0) circle (1cm);
\end{tikzpicture}`;
    const frame = resolveFrame(source, "path:0");
    expect(frame).not.toBeNull();
    if (!frame) {
      return;
    }

    const corner = frame.cornersByRole["top-left"].svg;
    const isAabbCorner =
      Math.abs(corner.x - frame.boundsSvg.minX) <= 1e-6 &&
      Math.abs(corner.y - frame.boundsSvg.minY) <= 1e-6;

    expect(isAabbCorner).toBe(false);
  });

  it("builds rotated frame polygons for transform-rotated filled ellipse paths", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw[rotate=45,fill=yellow] (0,0) ellipse [x radius=1cm, y radius=0.5cm];
\end{tikzpicture}`;
    const frame = resolveFrame(source, "path:0");
    expect(frame).not.toBeNull();
    if (!frame) {
      return;
    }

    const topLeft = frame.cornersByRole["top-left"].world;
    const topRight = frame.cornersByRole["top-right"].world;
    const topEdge = {
      x: topRight.x - topLeft.x,
      y: topRight.y - topLeft.y
    };

    expect(frame.polygonSvg).toHaveLength(4);
    expect(Math.abs(topEdge.x)).toBeGreaterThan(1e-3);
    expect(Math.abs(topEdge.y)).toBeGreaterThan(1e-3);
  });

  it("builds rotated frame polygons for rotated draw nodes", () => {
    const source = String.raw`\begin{tikzpicture}
  \node[draw,rotate=30] at (0,0) {C};
\end{tikzpicture}`;
    const frame = resolveFrame(source, "path:0");
    expect(frame).not.toBeNull();
    if (!frame) {
      return;
    }

    const topLeft = frame.cornersByRole["top-left"].world;
    const topRight = frame.cornersByRole["top-right"].world;
    const edge = {
      x: topRight.x - topLeft.x,
      y: topRight.y - topLeft.y
    };
    const corner = frame.cornersByRole["top-left"].svg;
    const isAabbCorner =
      Math.abs(corner.x - frame.boundsSvg.minX) <= 1e-6 &&
      Math.abs(corner.y - frame.boundsSvg.minY) <= 1e-6;

    expect(frame.polygonSvg).toHaveLength(4);
    expect(Math.abs(edge.x)).toBeGreaterThan(1e-3);
    expect(Math.abs(edge.y)).toBeGreaterThan(1e-3);
    expect(isAabbCorner).toBe(false);
  });

  it("builds resize frames for empty shaped nodes", () => {
    const source = String.raw`\begin{tikzpicture}
  \node[draw,shape=diamond,minimum width=2.2cm,minimum height=1.4cm] at (0,0) {};
\end{tikzpicture}`;
    const frame = resolveFrame(source, "path:0");
    expect(frame).not.toBeNull();
    if (!frame) {
      return;
    }

    expect(frame.polygonSvg).toHaveLength(4);
    expect(frame.boundsSvg.maxX - frame.boundsSvg.minX).toBeGreaterThan(1e-3);
    expect(frame.boundsSvg.maxY - frame.boundsSvg.minY).toBeGreaterThan(1e-3);
  });

  it("applies node affine transforms to node resize-frame geometry", () => {
    const baseSource = String.raw`\tikz \node[draw,minimum width=100pt] at (0.78,-2.26) {Hello};`;
    const scaledSource = String.raw`\tikz \node[draw,xscale=0.6,minimum width=100pt] at (0.78,-2.26) {Hello};`;

    const baseFrame = resolveFrame(baseSource, "path:0");
    const scaledFrame = resolveFrame(scaledSource, "path:0");
    expect(baseFrame).not.toBeNull();
    expect(scaledFrame).not.toBeNull();
    if (!baseFrame || !scaledFrame) {
      return;
    }

    const baseWidth = baseFrame.boundsSvg.maxX - baseFrame.boundsSvg.minX;
    const scaledWidth = scaledFrame.boundsSvg.maxX - scaledFrame.boundsSvg.minX;
    expect(scaledWidth / baseWidth).toBeCloseTo(0.6, 1);
  });

  it("ignores label and pin adornments when resolving node resize frames", () => {
    const plainSource = String.raw`\begin{tikzpicture}
  \node[draw] at (0,0) {C};
\end{tikzpicture}`;
    const adornedSource = String.raw`\begin{tikzpicture}
  \node[draw,label=right:L,pin=above:P] at (0,0) {C};
\end{tikzpicture}`;

    const plainFrame = resolveFrame(plainSource, "path:0");
    const adornedFrame = resolveFrame(adornedSource, "path:0");

    expect(plainFrame).not.toBeNull();
    expect(adornedFrame).not.toBeNull();
    if (!plainFrame || !adornedFrame) {
      return;
    }

    expect(adornedFrame.boundsSvg.minX).toBeCloseTo(plainFrame.boundsSvg.minX, 6);
    expect(adornedFrame.boundsSvg.maxX).toBeCloseTo(plainFrame.boundsSvg.maxX, 6);
    expect(adornedFrame.boundsSvg.minY).toBeCloseTo(plainFrame.boundsSvg.minY, 6);
    expect(adornedFrame.boundsSvg.maxY).toBeCloseTo(plainFrame.boundsSvg.maxY, 6);
  });

  it("returns null when frame geometry cannot be resolved from handles", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw[rotate=45] (0,0) circle (1cm);
\end{tikzpicture}`;
    const parsed = parseTikz(source, { recover: true });
    const evaluated = evaluateTikzFigure(parsed.figure, source);
    const frame = resolveResizeFrameForSource(
      evaluated.scene.elements,
      [],
      "path:0",
      TEST_VIEW_BOX
    );

    expect(frame).toBeNull();
  });

  it("uses node visual dimensions for text-only nodes so inner sep is included", () => {
    const source = String.raw`\tikz \node[inner sep=10pt] {A};`;
    const parsed = parseTikz(source, { recover: true });
    const evaluated = evaluateTikzFigure(parsed.figure, source);
    const text = evaluated.scene.elements.find(
      (element): element is SceneText => element.kind === "Text"
    );
    expect(text?.kind).toBe("Text");
    if (!text || text.kind !== "Text") {
      return;
    }

    const frame = resolveResizeFrameForSource(
      evaluated.scene.elements,
      evaluated.editHandles,
      "path:0",
      TEST_VIEW_BOX
    );
    expect(frame).not.toBeNull();
    if (!frame) {
      return;
    }

    const width = frame.boundsSvg.maxX - frame.boundsSvg.minX;
    expect(text.nodeVisualWidth).toBeDefined();
    expect(width).toBeCloseTo(text.nodeVisualWidth ?? 0, 3);
  });
});
