import { describe, expect, it } from "vitest";

import { evaluateSemantic, firstElementOfKind } from "./helpers.js";

describe("semantic evaluator / svg operation", () => {
  it("supports basic relative SVG path commands", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) svg {h 10 v 10 h -10};
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    expect(result.featureUsage.svg_operation).toBe("used-supported");
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "invalid-svg-path-data")).toBe(false);

    const path = firstElementOfKind(result.scene.elements, "Path");
    expect(path?.kind).toBe("Path");
    if (path?.kind === "Path") {
      const lines = path.commands.filter((command) => command.kind === "L");
      expect(lines).toHaveLength(3);
      const first = lines[0];
      const last = lines[2];
      if (first?.kind === "L") {
        expect(first.to.x).toBeCloseTo(10, 6);
        expect(first.to.y).toBeCloseTo(0, 6);
      }
      if (last?.kind === "L") {
        expect(last.to.x).toBeCloseTo(0, 6);
        expect(last.to.y).toBeCloseTo(10, 6);
      }
    }
  });

  it("applies local svg operation transforms", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) svg[scale=2] {h 10};
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    expect(result.featureUsage.svg_operation).toBe("used-supported");
    const path = firstElementOfKind(result.scene.elements, "Path");
    expect(path?.kind).toBe("Path");
    if (path?.kind === "Path") {
      const line = path.commands.find((command) => command.kind === "L");
      expect(line?.kind).toBe("L");
      if (line?.kind === "L") {
        expect(line.to.x).toBeCloseTo(20, 6);
        expect(line.to.y).toBeCloseTo(0, 6);
      }
    }
  });

  it("supports quoted payloads and follows the existing current point", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0) svg "h 10";
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    expect(result.featureUsage.svg_operation).toBe("used-supported");
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "invalid-svg-path-data")).toBe(false);

    const path = firstElementOfKind(result.scene.elements, "Path");
    expect(path?.kind).toBe("Path");
    if (path?.kind === "Path") {
      const lines = path.commands.filter((command) => command.kind === "L");
      expect(lines.length).toBeGreaterThanOrEqual(2);
      const last = lines[lines.length - 1];
      if (last?.kind === "L") {
        expect(last.to.x).toBeCloseTo(38.4527559, 5);
        expect(last.to.y).toBeCloseTo(0, 6);
      }
    }
  });

  it("supports smooth curves and arcs from SVG path syntax", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) svg {q 10 0 10 10 t 10 10 a 10 10 0 0 1 20 0};
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    expect(result.featureUsage.svg_operation).toBe("used-supported");
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "invalid-svg-path-data")).toBe(false);

    const path = firstElementOfKind(result.scene.elements, "Path");
    expect(path?.kind).toBe("Path");
    if (path?.kind === "Path") {
      const cubics = path.commands.filter((command) => command.kind === "C");
      expect(cubics.length).toBeGreaterThanOrEqual(3);
      const last = cubics[cubics.length - 1];
      if (last?.kind === "C") {
        expect(last.to.x).toBeCloseTo(40, 4);
        expect(last.to.y).toBeCloseTo(20, 4);
      }
    }
  });

  it("keeps close-path semantics aligned with the active subpath start", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0) svg {h 10 z} -- (0,1);
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    const path = firstElementOfKind(result.scene.elements, "Path");
    expect(path?.kind).toBe("Path");
    if (path?.kind === "Path") {
      expect(path.commands.some((command) => command.kind === "Z")).toBe(true);
      const lines = path.commands.filter((command) => command.kind === "L");
      const finalLine = lines[lines.length - 1];
      expect(finalLine?.kind).toBe("L");
      if (finalLine?.kind === "L") {
        expect(finalLine.to.x).toBeCloseTo(0, 5);
        expect(finalLine.to.y).toBeCloseTo(28.4527559, 4);
      }
    }
  });
});
