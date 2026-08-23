import { describe, expect, it } from "vitest";

import { parseTikz } from "../../packages/core/src/parser/index.js";
import { evaluateTikzFigure } from "../../packages/core/src/semantic/evaluate.js";

describe("semantic nodeAnchorTargets", () => {
  it("exports named node anchors with basic vs special tiers", () => {
    const source = String.raw`\begin{tikzpicture}
  \node[draw] (A) at (0,0) {A};
\end{tikzpicture}`;
    const parsed = parseTikz(source, { recover: true });
    const semantic = evaluateTikzFigure(parsed.figure, source);
    const anchors = semantic.nodeAnchorTargets.filter((target) => target.nodeName === "A");

    const center = anchors.find((target) => target.anchor === "center");
    const east = anchors.find((target) => target.anchor === "east");
    const base = anchors.find((target) => target.anchor === "base");

    expect(center).toBeDefined();
    expect(center?.tier).toBe("basic");
    expect(east).toBeDefined();
    expect(east?.tier).toBe("basic");
    expect(base).toBeDefined();
    expect(base?.tier).toBe("special");
  });

  it("deduplicates center anchor exports per node", () => {
    const source = String.raw`\begin{tikzpicture}
  \node[draw] (A) at (0,0) {A};
\end{tikzpicture}`;
    const parsed = parseTikz(source, { recover: true });
    const semantic = evaluateTikzFigure(parsed.figure, source);
    const centerAnchors = semantic.nodeAnchorTargets.filter(
      (target) => target.nodeName === "A" && target.anchor === "center"
    );
    expect(centerAnchors).toHaveLength(1);
  });
});
