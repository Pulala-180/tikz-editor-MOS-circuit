import { describe, expect, it } from "vitest";

import { PT_PER_CM } from "../packages/core/src/edit/format.js";
import { applyEditAction } from "../packages/core/src/edit/actions.js";
import { parseTikz } from "../packages/core/src/parser/index.js";
import { evaluateTikzFigure } from "../packages/core/src/semantic/evaluate.js";
import { buildRepeatPreviewScene } from "../packages/app/src/ui/repeat-preview.js";

const cm = (value: number) => value * PT_PER_CM;

describe("repeat preview", () => {
  it("shows the full first repeated row in a 3x3 node repeat", () => {
    const source = String.raw`\begin{tikzpicture}
  \node[draw, minimum width=1cm, minimum height=1cm] at (0, 0) {C};
\end{tikzpicture}`;

    const result = applyEditAction(source, [], {
      kind: "repeatElements",
      elementIds: ["path:0"],
      columns: 3,
      rows: 3,
      horizontalStep: cm(1),
      verticalStep: cm(1)
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    const parsed = parseTikz(result.newSource, { recover: true });
    const evaluated = evaluateTikzFigure(parsed.figure, result.newSource);
    const previewScene = buildRepeatPreviewScene(evaluated.scene, result.patches[0].newSpan);

    expect(previewScene).not.toBeNull();
    if (!previewScene) return;

    const previewTexts = previewScene.elements.filter((element) => element.kind === "Text");
    expect(previewTexts).toHaveLength(8);
  });

  it("shows the full first repeated row for a named node in the exact 3x3 repeat example", () => {
    const source = String.raw`\begin{tikzpicture}[every node/.style={fill=blue!10}]
  \draw (-3,-3) rectangle (3,3);


  \node[draw] (A) at (-1, -1) {A};
  \node[draw] (B) at (1.5, -0.5) {B};
  \node[draw] (C) at (0, 1.5) {C};
\end{tikzpicture}`;

    const result = applyEditAction(source, [], {
      kind: "repeatElements",
      elementIds: ["path:3"],
      columns: 3,
      rows: 3,
      horizontalStep: cm(0.487),
      verticalStep: cm(0.489)
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    const parsed = parseTikz(result.newSource, { recover: true });
    const evaluated = evaluateTikzFigure(parsed.figure, result.newSource);
    const previewScene = buildRepeatPreviewScene(evaluated.scene, result.patches[0].newSpan);

    expect(previewScene).not.toBeNull();
    if (!previewScene) return;

    const previewTexts = previewScene.elements.filter((element) => element.kind === "Text" && element.text === "C");
    expect(previewTexts).toHaveLength(8);
  });
});
