import { describe, expect, it } from "vitest";
import {
  formatEquationText,
  isMathOnlyNodeText,
  parseMathOnlyNodeText,
  resolveEquationNodeTarget
} from "../../packages/app/src/ui/equation-utils.js";

describe("equation-utils", () => {
  it("detects math-only node text across supported wrappers", () => {
    expect(isMathOnlyNodeText("$x+y$")).toBe(true);
    expect(isMathOnlyNodeText("\\(x+y\\)")).toBe(true);
    expect(isMathOnlyNodeText("$$x+y$$")).toBe(true);
    expect(isMathOnlyNodeText(" $x+y$ ")).toBe(true);
  });

  it("rejects mixed text that is not entirely math", () => {
    expect(isMathOnlyNodeText("$x$ and $y$")).toBe(false);
    expect(isMathOnlyNodeText("x+y")).toBe(false);
  });

  it("parses and formats delimiter styles", () => {
    expect(parseMathOnlyNodeText("$x$")).toEqual({ latex: "x", delimiter: "inline-dollar" });
    expect(parseMathOnlyNodeText("\\(x\\)")).toEqual({ latex: "x", delimiter: "inline-paren" });
    expect(parseMathOnlyNodeText("$$x$$")).toEqual({ latex: "x", delimiter: "display-dollar" });

    expect(formatEquationText("x+y", "inline-dollar")).toBe("$x+y$");
    expect(formatEquationText("x+y", "inline-paren")).toBe("\\(x+y\\)");
    expect(formatEquationText("x+y", "display-dollar")).toBe("$$x+y$$");
  });

  it("resolves equation target from node path statement ids", () => {
    const source = String.raw`\begin{tikzpicture}
  \node at (0,0) {$x+y$};
\end{tikzpicture}`;

    const target = resolveEquationNodeTarget(source, "path:0");
    expect(target).toEqual(expect.objectContaining({
      sourceId: "path:0",
      latex: "x+y",
      delimiter: "inline-dollar"
    }));
  });
});
