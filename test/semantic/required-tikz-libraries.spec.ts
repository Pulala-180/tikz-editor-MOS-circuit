import { describe, expect, it } from "vitest";
import { FEATURE_IDS } from "../../packages/core/src/capabilities/feature-ids.js";
import { inferRequiredTikzLibraries } from "../../packages/core/src/semantic/required-tikz-libraries.js";
import { evaluateSemantic } from "./helpers.js";

describe("semantic evaluator / required tikz libraries", () => {
  it("infers libraries from feature usage and style usage", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw[arrows={-Latex[length=10pt]}] (0,0) -- (1,0);
  \draw[pattern=grid] (0,0) rectangle (1,1);
  \draw[pattern={Lines[angle=45,distance=4pt]}] (2,0) rectangle (3,1);
  \graph { a -> b };
  \matrix[matrix of nodes] { A & B \\ };
  \draw[decorate,decoration={snake}] (0,0) -- (2,0);
  \node[right=of A] {B};
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    expect(result.scene.requiredTikzLibraries).toEqual([
      "arrows.meta",
      "decorations",
      "decorations.pathmorphing",
      "graphs",
      "matrix",
      "patterns",
      "patterns.meta",
      "positioning"
    ]);
  });

  it("includes libraries for used unsupported features", () => {
    const featureUsage = Object.fromEntries(FEATURE_IDS.map((featureId) => [featureId, "unused"])) as Record<string, "unused" | "used-supported" | "used-unsupported">;
    featureUsage.decoration_pathreplacing = "used-unsupported";

    const requiredLibraries = inferRequiredTikzLibraries({
      featureUsage,
      elements: []
    });

    expect(requiredLibraries).toContain("decorations");
    expect(requiredLibraries).toContain("decorations.pathreplacing");
  });

  it("removes libraries when features are no longer used", () => {
    const withLibraries = evaluateSemantic(String.raw`\begin{tikzpicture}
  \draw[arrows={-Latex[length=10pt]}] (0,0) -- (1,0);
  \draw[pattern=grid] (0,0) rectangle (1,1);
\end{tikzpicture}`);

    const withoutLibraries = evaluateSemantic(String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0);
\end{tikzpicture}`);

    expect(withLibraries.scene.requiredTikzLibraries).toEqual(["arrows.meta", "patterns"]);
    expect(withoutLibraries.scene.requiredTikzLibraries).toEqual([]);
  });

  it("infers shape libraries for non-basic node shapes", () => {
    const result = evaluateSemantic(String.raw`\begin{tikzpicture}
  \node[draw, diamond] {};
  \node[draw, cloud] at (2,0) {};
  \node[draw, rectangle callout] at (4,0) {};
  \node[draw, single arrow] at (6,0) {};
  \node[draw, rounded rectangle] at (8,0) {};
  \node[draw, magnifying glass] at (10,0) {};
  \node[draw, rectangle split, rectangle split parts=3] at (12,0) {A\nodepart{two}B\nodepart{three}C};
\end{tikzpicture}`);

    expect(result.scene.requiredTikzLibraries).toEqual([
      "shapes.arrows",
      "shapes.callouts",
      "shapes.geometric",
      "shapes.misc",
      "shapes.multipart",
      "shapes.symbols"
    ]);
  });

  it("infers fit library when fit nodes are used", () => {
    const result = evaluateSemantic(String.raw`\begin{tikzpicture}
  \node (a) at (0,0) {};
  \node (b) at (1,1) {};
  \node[draw,fit=(a) (b)] {};
\end{tikzpicture}`);

    expect(result.scene.requiredTikzLibraries).toEqual(["fit"]);
  });

  it("does not infer fit library when fit is unused", () => {
    const result = evaluateSemantic(String.raw`\begin{tikzpicture}
  \node (a) at (0,0) {};
  \node (b) at (1,1) {};
\end{tikzpicture}`);

    expect(result.scene.requiredTikzLibraries).toEqual([]);
  });
});
