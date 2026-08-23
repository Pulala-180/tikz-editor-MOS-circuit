import { describe, expect, it } from "vitest";

import { parseTikz } from "../packages/core/src/parser/index.js";
import { applyEdit } from "../packages/core/src/edit/apply.js";
import { loadFixture } from "./helpers.js";

describe("roundtrip edits", () => {
  it("changes only the local coordinate span", () => {
    const source = loadFixture("multiline.tex");
    const parsed = parseTikz(source);

    const statement = parsed.figure.body.find((s) => s.kind === "Path");
    expect(statement?.kind).toBe("Path");
    if (!statement || statement.kind !== "Path") {
      return;
    }

    const coordinate = statement.items.find((item) => item.kind === "Coordinate");
    expect(coordinate?.kind).toBe("Coordinate");
    if (!coordinate || coordinate.kind !== "Coordinate") {
      return;
    }

    const updated = applyEdit(parsed, {
      kind: "updateCoordinate",
      targetId: coordinate.id,
      x: "10",
      y: "20"
    });

    const changed = updated.changedSpans[0];
    expect(source.slice(0, changed.from)).toBe(updated.source.slice(0, changed.from));

    const originalSuffixStart = coordinate.span.to;
    const updatedSuffixStart = changed.to;
    expect(source.slice(originalSuffixStart)).toBe(updated.source.slice(updatedSuffixStart));
  });

  it("changes only node text content while preserving surrounding layout", () => {
    const source = loadFixture("multiline.tex");
    const parsed = parseTikz(source);

    const pathStatements = parsed.figure.body.filter((s) => s.kind === "Path");
    const firstPath = pathStatements[0];
    if (!firstPath || firstPath.kind !== "Path") {
      throw new Error("Expected a path statement in fixture.");
    }

    const node = firstPath.items.find((item) => item.kind === "Node");
    expect(node?.kind).toBe("Node");
    if (!node || node.kind !== "Node") {
      return;
    }

    const updated = applyEdit(parsed, {
      kind: "updateNodeText",
      targetId: node.id,
      text: "Gamma"
    });

    expect(source.slice(0, node.textSpan.from)).toBe(updated.source.slice(0, node.textSpan.from));
    expect(source.slice(node.textSpan.to)).toBe(updated.source.slice(node.textSpan.from + "Gamma".length));

    const originalIndent = source.match(/\n(\s*)node\[/)?.[1] ?? "";
    const updatedIndent = updated.source.match(/\n(\s*)node\[/)?.[1] ?? "";
    expect(updatedIndent).toBe(originalIndent);
  });

  it("keeps comments outside edits byte-identical", () => {
    const source = loadFixture("multiline.tex");
    const parsed = parseTikz(source);

    const pathStatements = parsed.figure.body.filter((s) => s.kind === "Path");
    const firstPath = pathStatements[0];
    if (!firstPath || firstPath.kind !== "Path") {
      throw new Error("Expected a path statement in fixture.");
    }

    const node = firstPath.items.find((item) => item.kind === "Node");
    if (!node || node.kind !== "Node") {
      throw new Error("Expected a node item in fixture.");
    }

    const updated = applyEdit(parsed, {
      kind: "updateNodeText",
      targetId: node.id,
      text: "Delta"
    });

    expect(updated.source).toContain("% first line comment");
    expect(updated.source).toContain("% node comment");
    expect(source.includes("% first line comment")).toBe(true);
    expect(source.includes("% node comment")).toBe(true);
  });

  it("keeps stable ids for untouched items after reparse", () => {
    const source = loadFixture("multiline.tex");
    const parsedBefore = parseTikz(source);

    const firstPath = parsedBefore.figure.body.find((s) => s.kind === "Path");
    if (!firstPath || firstPath.kind !== "Path") {
      throw new Error("Expected a path statement in fixture.");
    }

    const firstCoordinate = firstPath.items.find((item) => item.kind === "Coordinate");
    if (!firstCoordinate || firstCoordinate.kind !== "Coordinate") {
      throw new Error("Expected at least one coordinate in fixture.");
    }

    const unchangedNodeBefore = firstPath.items.find((item) => item.kind === "Node");
    if (!unchangedNodeBefore || unchangedNodeBefore.kind !== "Node") {
      throw new Error("Expected node item in fixture.");
    }

    const edited = applyEdit(parsedBefore, {
      kind: "updateCoordinate",
      targetId: firstCoordinate.id,
      x: "9",
      y: "9"
    });

    const parsedAfter = parseTikz(edited.source);
    const firstPathAfter = parsedAfter.figure.body.find((s) => s.kind === "Path");
    if (!firstPathAfter || firstPathAfter.kind !== "Path") {
      throw new Error("Expected a path statement after reparse.");
    }

    const unchangedNodeAfter = firstPathAfter.items.find((item) => item.kind === "Node");
    expect(unchangedNodeAfter?.kind).toBe("Node");
    if (unchangedNodeAfter?.kind === "Node") {
      expect(unchangedNodeAfter.id).toBe(unchangedNodeBefore.id);
    }
  });

  it("preserves coordinate-local options while editing coordinate values", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) -- ([xshift=3pt] 1,1);
\end{tikzpicture}`;
    const parsed = parseTikz(source);

    const statement = parsed.figure.body.find((s) => s.kind === "Path");
    if (!statement || statement.kind !== "Path") {
      throw new Error("Expected a path statement in source.");
    }

    const target = statement.items.find((item) => item.kind === "Coordinate" && item.optionsSpan);
    if (!target || target.kind !== "Coordinate") {
      throw new Error("Expected coordinate with local options.");
    }

    const updated = applyEdit(parsed, {
      kind: "updateCoordinate",
      targetId: target.id,
      x: "10",
      y: "20"
    });

    expect(updated.source).toContain("([xshift=3pt] 10,20)");
  });
});
