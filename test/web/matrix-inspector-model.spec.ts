import { describe, expect, it } from "vitest";
import { parseLength } from "../../packages/core/src/semantic/coords/parse-length.js";
import { buildMatrixInspectorDescriptor } from "../../packages/core/src/edit/inspector.js";

describe("matrix inspector model descriptor", () => {
  it("builds matrix-level controls for matrix statements", () => {
    const source = String.raw`\begin{tikzpicture}
  \matrix[matrix of nodes,row sep=2mm,column sep=3mm,draw=blue,fill=yellow] {
    A & B \\
  };
\end{tikzpicture}`;

    const descriptor = buildMatrixInspectorDescriptor(source, "path:0", undefined);
    expect(descriptor).toBeDefined();
    if (!descriptor) {
      throw new Error("Expected matrix descriptor");
    }

    const matrixSection = descriptor.sections.find((section) => section.id === "matrix");
    expect(matrixSection).toBeDefined();
    if (!matrixSection) {
      throw new Error("Expected matrix section");
    }

    const rowSep = matrixSection.properties.find((property) => property.id === "matrix-row-sep");
    const columnSep = matrixSection.properties.find((property) => property.id === "matrix-column-sep");
    const draw = matrixSection.properties.find((property) => property.id === "matrix-draw");
    const fill = matrixSection.properties.find((property) => property.id === "matrix-fill");

    expect(rowSep?.kind).toBe("length");
    expect(columnSep?.kind).toBe("length");
    expect(draw?.kind).toBe("color");
    expect(fill?.kind).toBe("color");
    if (rowSep?.kind === "length") {
      expect(rowSep.value).toBeCloseTo(parseLength("2mm", "pt") ?? 0, 5);
      expect(rowSep.write.writable).toBe(true);
    }
    if (columnSep?.kind === "length") {
      expect(columnSep.value).toBeCloseTo(parseLength("3mm", "pt") ?? 0, 5);
      expect(columnSep.write.writable).toBe(true);
    }
    if (draw?.kind === "color") {
      expect(draw.value).toBe("blue");
      expect(draw.write.writable).toBe(true);
    }
    if (fill?.kind === "color") {
      expect(fill.value).toBe("yellow");
      expect(fill.write.writable).toBe(true);
    }
  });

  it("returns null for non-matrix statements", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0);
\end{tikzpicture}`;
    const descriptor = buildMatrixInspectorDescriptor(source, "path:0", undefined);
    expect(descriptor).toBeNull();
  });
});
