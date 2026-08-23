import { describe, expect, it } from "vitest";
import { applyEditAction } from "../packages/core/src/edit/actions.js";
import { parseTikz } from "../packages/core/src/parser/index.js";
import { evaluateTikzFigure } from "../packages/core/src/semantic/evaluate.js";
import { wp } from "./coords-helpers.js";
import { cm, expectPatchesReconstructSource } from "./edit-actions-helpers.js";

// 橡皮筋导线：拖动元件 scope 时，与 scope 内 \coordinate 端口 world 坐标重合的
// 顶层导线端点同步移动（导线自动拉长/变短）。MVP：仅绝对坐标端点、仅顶层 draw。

function move(source: string, elementIds: string[], dxCm: number, dyCm = 0) {
  // 与编辑器的真实源码一致：tikzpicture 包装（parseTikz 对裸 scope 返回空 body）
  const wrapped = `\\begin{tikzpicture}\n${source}\\end{tikzpicture}\n`;
  const parsed = parseTikz(wrapped, { recover: true });
  const semantic = evaluateTikzFigure(parsed.figure, wrapped);
  const result = applyEditAction(wrapped, semantic.editHandles, {
    kind: "moveElements",
    elementIds,
    delta: wp(cm(dxCm), cm(dyCm))
  });
  return { result, wrapped };
}

// 元件形态：scope shift + 端口锚点 \coordinate。语句 id 布局：
// scope:0 → 内部 path:1/path:2（两个端口）→ 顶层 draw = path:3
function voltageSourceAt(x: number, y: number): string {
  return `\\begin{scope}[shift={(${x},${y})}]
    \\coordinate (node_Vx.top) at (0,0.4);
    \\coordinate (node_Vx.bottom) at (0,-0.4);
  \\end{scope}`;
}

describe("applyEditAction – wire follow (橡皮筋导线)", () => {
  it("moves the wire endpoint coincident with a scope port along with the scope", () => {
    const source = `${voltageSourceAt(2, 0)}
    \\draw (2,-0.4) -- (4,0);`;
    const { result, wrapped } = move(source, ["scope:0"], 1, 0);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    // scope shift 右移 1cm：shift={(2,0)} → 新位置；导线起点跟随端口 → (3,-0.4)
    expect(result.newSource).toContain("\\draw (3,-0.4) -- (4,0);");
    expect(result.changedSourceIds).toContain("path:3"); // 顶层导线 id 进增量重算范围
    expectPatchesReconstructSource(wrapped, result);
  });

  it("moves the tail endpoint when it is coincident with the port", () => {
    const source = `${voltageSourceAt(2, 0)}
    \\draw (0,0) -- (2,-0.4);`;
    const { result, wrapped } = move(source, ["scope:0"], 0, 1);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.newSource).toContain("\\draw (0,0) -- (2,0.6);");
    expectPatchesReconstructSource(wrapped, result);
  });

  it("leaves wires untouched when no endpoint coincides with a port", () => {
    const source = `${voltageSourceAt(2, 0)}
    \\draw (5,5) -- (6,6);`;
    const { result, wrapped } = move(source, ["scope:0"], 1, 0);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.newSource).toContain("\\draw (5,5) -- (6,6);");
    expectPatchesReconstructSource(wrapped, result);
  });

  it("does not rewrite endpoints that reference the named anchor (they follow naturally)", () => {
    const source = `${voltageSourceAt(2, 0)}
    \\draw (node_Vx.bottom) -- (4,0);`;
    const { result, wrapped } = move(source, ["scope:0"], 1, 0);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    // 命名锚点端点文本不变——锚点随 scope 移动，导线天然跟随
    expect(result.newSource).toContain("\\draw (node_Vx.bottom) -- (4,0);");
    expectPatchesReconstructSource(wrapped, result);
  });

  it("does not follow wires drawn inside scopes (top-level wires only)", () => {
    const source = `${voltageSourceAt(2, 0)}
    \\begin{scope}[shift={(0,0)}]
      \\draw (2,-0.4) -- (4,0);
    \\end{scope}`;
    const { result, wrapped } = move(source, ["scope:0"], 1, 0);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.newSource).toContain("\\draw (2,-0.4) -- (4,0);");
    expectPatchesReconstructSource(wrapped, result);
  });

  it("follows both endpoints when a wire bridges two ports", () => {
    const source = `${voltageSourceAt(2, 0)}
    ${voltageSourceAt(4, 0)}
    \\draw (2,-0.4) -- (4,-0.4);`;
    const { result, wrapped } = move(source, ["scope:0"], 1, 0);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.newSource).toContain("\\draw (3,-0.4) -- (4,-0.4);");
    expectPatchesReconstructSource(wrapped, result);
  });

  it("does not double-move a wire when it is selected together with the scope", () => {
    const source = `${voltageSourceAt(2, 0)}
    \\draw (2,-0.4) -- (4,0);`;
    const { result, wrapped } = move(source, ["scope:0", "path:3"], 1, 0);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    // 导线整体平移 1cm 后端点已到 (3,-0.4)/(5,0)，橡皮筋不得再追加一次 delta
    expect(result.newSource).toContain("\\draw (3,-0.4) -- (5,0);");
    expectPatchesReconstructSource(wrapped, result);
  });

  it("follows a wire attached to a directly moved path endpoint", () => {
    const source = String.raw`\draw[thick] (0,0) -- (0.7,0);
    \draw (0.7,0) -- (2,0);`;
    const { result, wrapped } = move(source, ["path:0"], 1, 0);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.newSource).toContain("\draw[thick] (1,0) -- (1.7,0);");
    expect(result.newSource).toContain("\draw (1.7,0) -- (2,0);");
    expect(result.changedSourceIds).toContain("path:1");
    expectPatchesReconstructSource(wrapped, result);
  });

  it("follows only the coincident endpoint of a directly moved zig-zag path", () => {
    const source = String.raw`\draw (0,0) -- (0.155,0) -- (0.1875,0.15) -- (0.2525,-0.15) -- (0.3175,0.15) -- (0.3825,-0.15) -- (0.4475,0.15) -- (0.5125,-0.15) -- (0.545,0) -- (0.7,0);
    \draw (0.7,0) -- (2,0);`;
    const { result, wrapped } = move(source, ["path:0"], 1, 0);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    // 被移动 path:0 的终点由 (0.7,0) 变成 (1.7,0)；导线起点跟随拉伸。
    expect(result.newSource).toContain("\draw (1.7,0) -- (2,0);");
    expect(result.changedSourceIds).toContain("path:1");
    expectPatchesReconstructSource(wrapped, result);
  });

  it("produces no wire patches for a zero delta", () => {
    const source = `${voltageSourceAt(2, 0)}
    \\draw (2,-0.4) -- (4,0);`;
    const { result } = move(source, ["scope:0"], 0, 0);

    // delta=0：scope 分支可能做 shift 文本规范化，但导线不得有任何改写
    expect(result.newSource).toContain("\\draw (2,-0.4) -- (4,0);");
  });
});
