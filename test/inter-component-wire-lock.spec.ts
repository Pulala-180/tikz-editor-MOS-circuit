import { describe, expect, it } from "vitest";
import { applyEditAction } from "../packages/core/src/edit/actions.js";
import { parseTikz } from "../packages/core/src/parser/index.js";
import { evaluateTikzFigure } from "../packages/core/src/semantic/evaluate.js";
import {
  INTER_COMPONENT_STRAIGHT_WIRE_BLOCK_REASON,
  findInterComponentStraightWireConnection
} from "../packages/core/src/edit/actions/wire-follow.js";
import { wp } from "./coords-helpers.js";
import { cm } from "./edit-actions-helpers.js";

function move(source: string, elementIds: string[], dxCm: number, dyCm = 0) {
  const wrapped = `\\begin{tikzpicture}\n${source}\\end{tikzpicture}\n`;
  const parsed = parseTikz(wrapped, { recover: true });
  const semantic = evaluateTikzFigure(parsed.figure, wrapped);
  const result = applyEditAction(wrapped, semantic.editHandles, {
    kind: "moveElements",
    elementIds,
    delta: wp(cm(dxCm), cm(dyCm))
  });
  return { result, wrapped, parsed, semantic };
}

function getIds(source: string) {
  const wrapped = `\\begin{tikzpicture}\n${source}\\end{tikzpicture}\n`;
  const parsed = parseTikz(wrapped, { recover: true });
  const scopes = parsed.figure.body.filter((s: any) => s.kind === "Scope");
  const topDraws = parsed.figure.body.filter((s: any) => s.kind === "Path" && s.command === "draw");
  return {
    scopeA: scopes[0]?.id,
    scopeB: scopes[1]?.id,
    wire: topDraws[0]?.id
  };
}

function componentAt(id: string, x: number, y: number): string {
  return `\\begin{scope}[shift={(${x},${y})}]
    \\draw[thick] (0,0) -- (0.8,0.8);
    \\coordinate (node_${id}.top) at (0,0.8);
    \\coordinate (node_${id}.bottom) at (0,0);
  \\end{scope}`;
}

describe("死命令：两元件间单段直线连接线禁止独立平移，仅随两端元件伸缩", () => {
  it("禁止单独上下左右移动两元件之间的单段直线导线（命名锚点）", () => {
    const source = `${componentAt("A", 0, 2)}
${componentAt("B", 0, 0)}
\\draw[thick] (node_A.bottom) -- (node_B.top);`;
    const { wire } = getIds(source);

    const { result } = move(source, [wire], 1, 0);

    expect(result.kind).toBe("unsupported");
    if (result.kind === "unsupported") {
      expect(result.reason).toBe(INTER_COMPONENT_STRAIGHT_WIRE_BLOCK_REASON);
    }
  });

  it("禁止单独上下左右移动两元件之间的单段直线导线（绝对坐标接点）", () => {
    const source = `${componentAt("A", 0, 2)}
${componentAt("B", 0, 0)}
\\draw[thick] (0,2) -- (0,0.8);`;
    const { wire } = getIds(source);

    const { result } = move(source, [wire], 0, 1);

    expect(result.kind).toBe("unsupported");
    if (result.kind === "unsupported") {
      expect(result.reason).toBe(INTER_COMPONENT_STRAIGHT_WIRE_BLOCK_REASON);
    }
  });

  it("移动端点元件 A 时，导线自动拉长或缩短，另一端固定在元件 B 上", () => {
    const source = `${componentAt("A", 0, 2)}
${componentAt("B", 0, 0)}
\\draw[thick] (0,2) -- (0,0.8);`;
    const { scopeA } = getIds(source);

    // Move component A upward by 1cm: (0, 2) -> (0, 3)
    const { result } = move(source, [scopeA], 0, 1);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    // Component A moved upward:
    expect(result.newSource).toContain("shift={(0,3)}");
    // Wire endpoint attached to A followed up to (0,3), while endpoint at B remained fixed at (0,0.8):
    expect(result.newSource).toContain("\\draw[thick] (0,3) -- (0,0.8);");
  });

  it("移动端点元件 B 时，导线自动拉长或缩短，另一端固定在元件 A 上", () => {
    const source = `${componentAt("A", 0, 2)}
${componentAt("B", 0, 0)}
\\draw[thick] (0,2) -- (0,0.8);`;
    const { scopeB } = getIds(source);

    // Move component B downward by 1cm: (0, 0) -> (0, -1)
    const { result } = move(source, [scopeB], 0, -1);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    // Component B moved downward:
    expect(result.newSource).toContain("shift={(0,-1)}");
    // Wire endpoint attached to B followed down to (0,-0.2), while endpoint at A remained fixed at (0,2):
    expect(result.newSource).toContain("\\draw[thick] (0,2) -- (0,-0.2);");
  });

  it("同时选中元件 A、元件 B 及中间导线整体移动时，全组作为整体平移", () => {
    const source = `${componentAt("A", 0, 2)}
${componentAt("B", 0, 0)}
\\draw[thick] (0,2) -- (0,0.8);`;
    const { scopeA, scopeB, wire } = getIds(source);

    // Move all three elements by (1, 0)
    const { result } = move(source, [scopeA, scopeB, wire], 1, 0);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    // Both scopes moved right:
    expect(result.newSource).toContain("shift={(1,2)}");
    expect(result.newSource).toContain("shift={(1,0)}");
    // Wire also moved right rigidly:
    expect(result.newSource).toContain("\\draw[thick] (1,2) -- (1,0.8);");
  });

  it("误选元件 A 及导线一起移动时，导线不会被平移扯脱，仍保持一端固定在 B 上仅跟随 A 伸缩", () => {
    const source = `${componentAt("A", 0, 2)}
${componentAt("B", 0, 0)}
\\draw[thick] (0,2) -- (0,0.8);`;
    const { scopeA, wire } = getIds(source);

    // Move scope A and wire by (0, 1) without scope B
    const { result } = move(source, [scopeA, wire], 0, 1);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.newSource).toContain("shift={(0,3)}");
    // Endpoint at B is still anchored at (0,0.8)!
    expect(result.newSource).toContain("\\draw[thick] (0,3) -- (0,0.8);");
  });

  it("多拐点折线导线（含 |- 算子）不属于单段直线，不受此死命令拦截", () => {
    const source = `${componentAt("A", 0, 2)}
${componentAt("B", 2, 0)}
\\draw[thick] (node_A.bottom) |- (node_B.top);`;
    const { wire } = getIds(source);

    // Wire has implicit corner |-
    const { result, parsed, semantic } = move(source, [wire], 1, 0);

    const wireStmt = parsed.figure.body.find((s: any) => s.id === wire);
    expect(findInterComponentStraightWireConnection(wireStmt, parsed.figure.body, semantic.editHandles, "")).toBeNull();

    if (result.kind === "unsupported") {
      expect(result.reason).not.toBe(INTER_COMPONENT_STRAIGHT_WIRE_BLOCK_REASON);
    }
  });

  it("多段折线导线（含中间点）可以独立平移，不受此死命令拦截", () => {
    const source = `${componentAt("A", 0, 2)}
${componentAt("B", 2, 0)}
\\draw[thick] (0,2) -- (1,1) -- (2,0.8);`;
    const { wire } = getIds(source);

    const { result } = move(source, [wire], 1, 0);
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.newSource).toContain("\\draw[thick] (1,2) -- (2,1) -- (3,0.8);");
    }
  });

  it("单端悬空的导线不属于两元件连接线，不受此死命令拦截", () => {
    const source = `${componentAt("A", 0, 2)}
\\draw[thick] (0,2) -- (5,5);`;
    const { wire } = getIds(source);

    const { result } = move(source, [wire], 1, 0);

    expect(result.kind).not.toBe("unsupported");
  });
});
