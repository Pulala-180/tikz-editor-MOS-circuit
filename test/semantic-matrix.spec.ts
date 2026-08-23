import { describe, expect, it } from "vitest";

import { parseOptionListRaw } from "../packages/core/src/options/parse.js";
import {
  parseMatrixRowsForEdit,
  resolveMatrixCellEditTarget,
  resolveMatrixMode
} from "../packages/core/src/semantic/nodes/matrix.js";
import { evaluateSemantic } from "./semantic/helpers.js";

describe("semantic matrix nodes", () => {
  it("renders matrix containers through the supported node shape dispatch", () => {
    const shapes = [
      "chamfered rectangle",
      "cross out",
      "strike out",
      "magnifying glass",
      "circle split",
      "circle solidus",
      "ellipse split",
      "diamond split",
      "rectangle split, rectangle split parts=3",
      "rectangle split, rectangle split parts=3, rectangle split horizontal",
      "circle",
      "ellipse",
      "diamond",
      "trapezium",
      "semicircle",
      "isosceles triangle",
      "kite",
      "dart",
      "circular sector",
      "cylinder",
      "regular polygon, regular polygon sides=6",
      "star",
      "cloud",
      "starburst",
      "signal",
      "tape",
      "rectangle callout, callout absolute pointer={(8pt,4pt)}",
      "ellipse callout, callout absolute pointer={(8pt,4pt)}",
      "cloud callout, callout absolute pointer={(8pt,4pt)}",
      "single arrow",
      "double arrow",
      "rectangle"
    ];

    for (const shape of shapes) {
      const source = String.raw`\begin{tikzpicture}
  \matrix[matrix of nodes,draw,${shape},minimum width=1cm,minimum height=8mm] (m) {
    A & B \\
  };
\end{tikzpicture}`;
      const result = evaluateSemantic(source);
      const unsupported = result.diagnostics.filter((diagnostic) => diagnostic.code?.startsWith("unsupported-option-key"));
      expect(unsupported, shape).toEqual([]);

      const containerElements = result.scene.elements.filter((element) => element.kind !== "Text");
      expect(containerElements.length, shape).toBeGreaterThan(0);
    }
  });

  it("keeps prefixed and explicit matrix cell names and aliases addressable", () => {
    const source = String.raw`\begin{tikzpicture}
  \matrix[matrix of nodes,nodes={draw}] (m) {
    |[name=first,alias=firstAlias]| A & |(second)| \node[alias=secondAlias] at (1,2) {B}; \\
  };
  \draw (first) -- (firstAlias) -- (m-1-1) -- (second) -- (secondAlias) -- (m-1-2);
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code?.startsWith("unknown-named-coordinate:"))).toBe(false);
    const labels = result.scene.elements
      .filter((element) => element.kind === "Text")
      .map((element) => (element.kind === "Text" ? element.text : ""))
      .sort();
    expect(labels).toEqual(["A", "B"]);
  });

  it("resolves matrix mode key variants and spacing semantics", () => {
    const mode = resolveMatrixMode(
      parseOptionListRaw(String.raw`[
        matrix=true,
        matrix of math nodes=on,
        nodes in empty cells,
        row sep={between origins,2pt,between borders,3pt},
        column sep={between origins,4pt},
        ampersand replacement=\&,
        nodes={draw,name=fromNodes,alias=fromAlias},
        matrix anchor=north_east
      ]`)
    );

    expect(mode.enabled).toBe(true);
    expect(mode.matrixOfNodes).toBe(true);
    expect(mode.matrixKind).toBe("math-nodes");
    expect(mode.textMode).toBe("math");
    expect(mode.includeEmptyCells).toBe(true);
    expect(mode.cellSeparator).toBe(String.raw`\&`);
    expect(mode.rowSep).toEqual({ gap: 5, betweenOrigins: false });
    expect(mode.columnSep).toEqual({ gap: 4, betweenOrigins: true });
    expect(mode.matrixAnchor).toBe("north east");
    expect(mode.nodesOption?.entries.map((entry) => entry.kind === "unknown" ? entry.raw : entry.key)).toEqual([
      "draw",
      "name",
      "alias"
    ]);
  });

  it("resolves matrix cell edit spans across prefixes, separators, and invalid targets", () => {
    const mode = resolveMatrixMode(parseOptionListRaw(String.raw`[matrix of nodes,nodes in empty cells]`));
    const body = String.raw`
      |[draw,name=left]| A & |(right)| \node[alias=r] at (1,2) {B}; \\
       C & \\
    `;
    const baseOffset = 200;
    const rows = parseMatrixRowsForEdit(body, mode.cellSeparator, baseOffset);
    expect(rows.rows.map((row) => row.cells.length)).toEqual([2, 2]);

    const first = resolveMatrixCellEditTarget(body, { from: baseOffset, to: baseOffset + body.length }, mode, 1, 1);
    expect(first?.textMode).toBe("text");
    expect(first?.optionSpan).toBeDefined();
    expect(body.slice((first?.textSpan.from ?? 0) - baseOffset, (first?.textSpan.to ?? 0) - baseOffset)).toBe("A");

    const explicit = resolveMatrixCellEditTarget(body, { from: baseOffset, to: baseOffset + body.length }, mode, 1, 2);
    expect(body.slice((explicit?.textSpan.from ?? 0) - baseOffset, (explicit?.textSpan.to ?? 0) - baseOffset)).toBe("B");

    expect(resolveMatrixCellEditTarget(body, { from: baseOffset, to: baseOffset + body.length }, mode, 0, 1)).toBeNull();
    expect(resolveMatrixCellEditTarget(body, { from: baseOffset, to: baseOffset + body.length }, mode, 3, 1)).toBeNull();
  });
});
