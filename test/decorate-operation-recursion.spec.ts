import { describe, expect, it } from "vitest";
import { parseTikz } from "../packages/core/src/parser/index.js";
import { evaluateTikzFigure } from "../packages/core/src/semantic/evaluate.js";

describe("decorate operation recursion guard", () => {
  it("does not recurse indefinitely when decorate has no subpath", () => {
    const source = String.raw`\begin{tikzpicture}
\path decorate [decoration={text along path,
     text={Some text along a path}}]
\end{tikzpicture}`;

    const parsed = parseTikz(source, { recover: true });
    expect(() => evaluateTikzFigure(parsed.figure, source)).not.toThrow();

    const semantic = evaluateTikzFigure(parsed.figure, source);
    expect(semantic.diagnostics.some((diagnostic) => diagnostic.code === "invalid-decorate-operation")).toBe(true);
  });
});
