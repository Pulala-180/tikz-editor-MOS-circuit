import { describe, expect, it } from "vitest";

import {
  evaluateSemantic,
  elementsOfKind
} from "./helpers.js";

function expectLinearTransform(
  transform: { a: number; b: number; c: number; d: number } | undefined,
  expected: { a: number; b: number; c: number; d: number }
): void {
  expect(transform).toBeDefined();
  if (!transform) {
    return;
  }
  expect(transform.a).toBeCloseTo(expected.a, 3);
  expect(transform.b).toBeCloseTo(expected.b, 3);
  expect(transform.c).toBeCloseTo(expected.c, 3);
  expect(transform.d).toBeCloseTo(expected.d, 3);
}

describe("semantic evaluator / trees", () => {
    it("lays out default child trees downward and auto-inserts parent edges", () => {
      const source = String.raw`\begin{tikzpicture}
    \path node {root}
      child { node {left} }
      child { node {right} };
  \end{tikzpicture}`;
      const result = evaluateSemantic(source);
  
      const texts = elementsOfKind(result.scene.elements, "Text");
      const root = texts.find((element) => element.kind === "Text" && element.text === "root");
      const left = texts.find((element) => element.kind === "Text" && element.text === "left");
      const right = texts.find((element) => element.kind === "Text" && element.text === "right");
      expect(root?.kind).toBe("Text");
      expect(left?.kind).toBe("Text");
      expect(right?.kind).toBe("Text");
      if (root?.kind === "Text" && left?.kind === "Text" && right?.kind === "Text") {
        expect(left.position.x).toBeLessThan(root.position.x);
        expect(right.position.x).toBeGreaterThan(root.position.x);
        expect(left.position.y).toBeLessThan(root.position.y);
        expect(right.position.y).toBeLessThan(root.position.y);
      }
  
      const edgePaths = result.scene.elements.filter((element) => {
        if (element.kind !== "Path") {
          return false;
        }
        return element.commands.length >= 2 && element.commands[0]?.kind === "M" && element.commands[1]?.kind === "L";
      });
      expect(edgePaths.length).toBeGreaterThanOrEqual(2);
      expect(result.featureUsage.child_operation).toBe("used-supported");
    });

    it("supports grow and grow' ordering semantics", () => {
      const growRight = String.raw`\begin{tikzpicture}
    \path[grow=right,sibling distance=8mm] node {root}
      child { node {A} }
      child { node {B} };
  \end{tikzpicture}`;
      const growRightReversed = String.raw`\begin{tikzpicture}
    \path[grow'=right,sibling distance=8mm] node {root}
      child { node {A} }
      child { node {B} };
  \end{tikzpicture}`;
  
      const rightResult = evaluateSemantic(growRight);
      const reversedResult = evaluateSemantic(growRightReversed);
  
      const rightA = rightResult.scene.elements.find((element) => element.kind === "Text" && element.text === "A");
      const rightB = rightResult.scene.elements.find((element) => element.kind === "Text" && element.text === "B");
      const reversedA = reversedResult.scene.elements.find((element) => element.kind === "Text" && element.text === "A");
      const reversedB = reversedResult.scene.elements.find((element) => element.kind === "Text" && element.text === "B");
  
      expect(rightA?.kind).toBe("Text");
      expect(rightB?.kind).toBe("Text");
      expect(reversedA?.kind).toBe("Text");
      expect(reversedB?.kind).toBe("Text");
      if (
        rightA?.kind === "Text" &&
        rightB?.kind === "Text" &&
        reversedA?.kind === "Text" &&
        reversedB?.kind === "Text"
      ) {
        expect(rightA.position.y).toBeLessThan(rightB.position.y);
        expect(reversedA.position.y).toBeGreaterThan(reversedB.position.y);
      }
    });

    it("keeps sibling spacing when grow' is set before the child list", () => {
      const source = String.raw`\begin{tikzpicture}
    \path node {root} [grow'=up]
      child { node {left} }
      child { node {right} };
  \end{tikzpicture}`;
      const result = evaluateSemantic(source);
  
      const root = result.scene.elements.find((element) => element.kind === "Text" && element.text === "root");
      const left = result.scene.elements.find((element) => element.kind === "Text" && element.text === "left");
      const right = result.scene.elements.find((element) => element.kind === "Text" && element.text === "right");
      expect(root?.kind).toBe("Text");
      expect(left?.kind).toBe("Text");
      expect(right?.kind).toBe("Text");
      if (root?.kind === "Text" && left?.kind === "Text" && right?.kind === "Text") {
        expect(left.position.y).toBeGreaterThan(root.position.y);
        expect(right.position.y).toBeGreaterThan(root.position.y);
        expect(left.position.x).toBeLessThan(root.position.x);
        expect(right.position.x).toBeGreaterThan(root.position.x);
        expect(Math.abs(right.position.x - left.position.x)).toBeGreaterThan(20);
      }
    });

    it("applies child-body path options to following operations", () => {
      const source = String.raw`\begin{tikzpicture}
    \path node {root}
      child {[fill] circle (2pt)}
      child {[fill] circle (2pt)};
  \end{tikzpicture}`;
      const result = evaluateSemantic(source);
  
      const filledCirclePaths = result.scene.elements.filter(
        (element) =>
          element.kind === "Path" &&
          element.style.fill != null &&
          element.style.fill !== "none" &&
          element.style.stroke == null &&
          element.commands.some((command) => command.kind === "A")
      );
      expect(filledCirclePaths).toHaveLength(2);
      if (filledCirclePaths.every((element) => element.kind === "Path")) {
        for (const circlePath of filledCirclePaths) {
          expect(circlePath.style.fill).not.toBeNull();
        }
      }
    });

    it("applies level and every-child tree style keys without generic unsupported diagnostics", () => {
      const source = String.raw`\begin{tikzpicture}
    \path[
      every child/.style={draw=red},
      every child node/.style={fill=yellow},
      level/.style={sibling distance=#1mm},
      level 2/.style={level distance=4mm}
    ]
      node {root}
      child { node {a} child { node {a1} } child { node {a2} } }
      child { node {b} };
  \end{tikzpicture}`;
      const result = evaluateSemantic(source);
  
      const unsupportedTreeDiagnostics = result.diagnostics.filter(
        (diagnostic) =>
          diagnostic.code === "unsupported-option-key:every child/.style" ||
          diagnostic.code === "unsupported-option-key:every child node/.style" ||
          diagnostic.code === "unsupported-option-key:level/.style" ||
          diagnostic.code === "unsupported-option-key:level 2/.style"
      );
      expect(unsupportedTreeDiagnostics).toHaveLength(0);
      expect(result.featureUsage.tree_every_child_styles).toBe("used-supported");
      expect(result.featureUsage.tree_level_styles).toBe("used-supported");
    });

    it("counts missing children in layout but does not render them", () => {
      const source = String.raw`\begin{tikzpicture}
    \path node {root}
      child[missing] {}
      child { node {visible} };
  \end{tikzpicture}`;
      const result = evaluateSemantic(source);
  
      const texts = elementsOfKind(result.scene.elements, "Text");
      expect(texts.filter((element) => element.kind === "Text" && element.text === "root")).toHaveLength(1);
      expect(texts.filter((element) => element.kind === "Text" && element.text === "visible")).toHaveLength(1);
      expect(result.featureUsage.tree_missing_child).toBe("used-supported");
    });

    it("supports parent/child anchor tree keys for edge endpoints", () => {
      const source = String.raw`\begin{tikzpicture}
    \path[parent anchor=south,child anchor=north]
      node[draw] {root}
      child { node[draw] {leaf} };
  \end{tikzpicture}`;
      const result = evaluateSemantic(source);
  
      const root = result.scene.elements.find((element) => element.kind === "Text" && element.text === "root");
      const leaf = result.scene.elements.find((element) => element.kind === "Text" && element.text === "leaf");
      const edge = result.scene.elements.find(
        (element) =>
          element.kind === "Path" &&
          element.commands.length >= 2 &&
          element.commands[0]?.kind === "M" &&
          element.commands[element.commands.length - 1]?.kind === "L" &&
          !element.commands.some((command) => command.kind === "Z")
      );
      expect(root?.kind).toBe("Text");
      expect(leaf?.kind).toBe("Text");
      expect(edge?.kind).toBe("Path");
      if (root?.kind === "Text" && leaf?.kind === "Text" && edge?.kind === "Path") {
        const start = edge.commands[0];
        const end = edge.commands[edge.commands.length - 1];
        expect(start?.kind).toBe("M");
        expect(end?.kind).toBe("L");
        if (start?.kind === "M" && end?.kind === "L") {
          expect(start.to.y).toBeLessThan(root.position.y);
          expect(end.to.y).toBeGreaterThan(leaf.position.y);
        }
      }
      expect(result.featureUsage.tree_anchor_keys).toBe("used-supported");
    });

    it("inherits sloped tree scope for edge labels", () => {
      const source = String.raw`\begin{tikzpicture}
    \tikzset{sloped}
    \path
      node {root}
      child { node {leaf} edge from parent node[above] {label} };
  \end{tikzpicture}`;
      const result = evaluateSemantic(source);

      const label = result.scene.elements.find(
        (element): element is Extract<(typeof result.scene.elements)[number], { kind: "Text" }> =>
          element.kind === "Text" && element.text === "label"
      );
      expect(label?.kind).toBe("Text");
      if (label?.kind === "Text") {
        expectLinearTransform(label.transform, {
          a: 0,
          b: 1,
          c: -1,
          d: 0
        });
      }
    });

    it("auto-names unnamed tree descendants for internal linking", () => {
      const source = String.raw`\begin{tikzpicture}
    \path node {root}
      child { node {left} }
      child { node {right} };
  \end{tikzpicture}`;
      const result = evaluateSemantic(source);
  
      expect(result.featureUsage.tree_auto_naming).toBe("used-supported");
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === "edge-from-parent-outside-child")).toBe(false);
    });

    it("preserves distinct treeChild metadata for nested descendants", () => {
      const source = String.raw`\begin{tikzpicture}
    \path node {root}
      child { node {left} child { node {left-left} } };
  \end{tikzpicture}`;
      const result = evaluateSemantic(source);

      const left = result.scene.elements.find((element) => element.kind === "Text" && element.text === "left");
      const leftLeft = result.scene.elements.find((element) => element.kind === "Text" && element.text === "left-left");
      expect(left?.kind).toBe("Text");
      expect(leftLeft?.kind).toBe("Text");
      if (left?.kind === "Text" && leftLeft?.kind === "Text") {
        expect(left.treeChild).toBeDefined();
        expect(leftLeft.treeChild).toBeDefined();
        if (!left.treeChild || !leftLeft.treeChild) {
          return;
        }
        expect(leftLeft.treeChild.parentSourceId).toBe(left.treeChild.childSourceId);
        expect(leftLeft.treeChild.childSourceId).not.toBe(left.treeChild.childSourceId);
        expect(leftLeft.treeChild.level).toBeGreaterThan(left.treeChild.level);
        expect(left.treeChild.bodySpan).toBeDefined();
        expect(leftLeft.treeChild.bodySpan).toBeDefined();
        if (!left.treeChild.bodySpan || !leftLeft.treeChild.bodySpan) {
          return;
        }
        expect(source.slice(left.treeChild.bodySpan.from, left.treeChild.bodySpan.to)).toContain("node {left}");
        expect(source.slice(leftLeft.treeChild.bodySpan.from, leftLeft.treeChild.bodySpan.to)).toContain("node {left-left}");
      }
    });

    it("places explicit edge-from-parent labels as edge nodes", () => {
      const source = String.raw`\begin{tikzpicture}
    \path node {root}
      child { node {leaf} edge from parent node[left] {L} };
  \end{tikzpicture}`;
      const result = evaluateSemantic(source);
  
      const label = result.scene.elements.find((element) => element.kind === "Text" && element.text === "L");
      expect(label?.kind).toBe("Text");
      expect(result.featureUsage.edge_from_parent_operation).not.toBe("unused");
    });

    it("places trailing edge-from-parent coordinate operations at edge midpoint by default", () => {
      const source = String.raw`\begin{tikzpicture}
    \path node {root}
      child { node {leaf} edge from parent coordinate (wrong) };
    \draw (wrong) -- +(0,4pt);
  \end{tikzpicture}`;
      const result = evaluateSemantic(source);
  
      const edgePath = result.scene.elements.find(
        (element) => element.kind === "Path" && element.id.includes("edge-from-parent") && element.commands.length >= 2
      );
      const markerPath = result.scene.elements.find(
        (element) =>
          element.kind === "Path" &&
          !element.id.includes("edge-from-parent") &&
          element.commands.length >= 2 &&
          element.commands[0]?.kind === "M" &&
          element.commands[1]?.kind === "L"
      );
  
      expect(edgePath?.kind).toBe("Path");
      expect(markerPath?.kind).toBe("Path");
      if (edgePath?.kind === "Path" && markerPath?.kind === "Path") {
        const edgeStart = edgePath.commands[0];
        const edgeEnd = edgePath.commands[1];
        const markerStart = markerPath.commands[0];
        expect(edgeStart?.kind).toBe("M");
        expect(edgeEnd?.kind).toBe("L");
        expect(markerStart?.kind).toBe("M");
        if (edgeStart?.kind === "M" && edgeEnd?.kind === "L" && markerStart?.kind === "M") {
          const expectedMidX = (edgeStart.to.x + edgeEnd.to.x) / 2;
          const expectedMidY = (edgeStart.to.y + edgeEnd.to.y) / 2;
          expect(markerStart.to.x).toBeCloseTo(expectedMidX, 3);
          expect(markerStart.to.y).toBeCloseTo(expectedMidY, 3);
        }
      }
    });

    it("emits deferred-hook diagnostics and falls back to default tree behavior", () => {
      const source = String.raw`\begin{tikzpicture}
    \path[
      growth function={\foo},
      edge from parent path={(\tikzparentnode) -- (\tikzchildnode)},
      edge from parent macro=\bar
    ]
      node {root}
      child { node {leaf} };
  \end{tikzpicture}`;
      const result = evaluateSemantic(source);
  
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === "unsupported-tree-growth-function")).toBe(true);
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === "unsupported-tree-edge-from-parent-path")).toBe(true);
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === "unsupported-tree-edge-from-parent-macro")).toBe(true);
      expect(result.featureUsage.tree_deferred_hooks).toBe("used-unsupported");
    });
});
