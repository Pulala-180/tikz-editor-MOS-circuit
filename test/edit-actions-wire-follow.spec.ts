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

    // delta=0：若 scope 坐标格式未变则直接识别为 no-op (unsupported)，若触发规范化重写则导线不得有任何改写
    if (result.kind === "success") {
      expect(result.newSource).toContain("\\draw (2,-0.4) -- (4,0);");
    } else {
      expect(result.kind).toBe("unsupported");
    }
  });
});

// --- 多拐点导线的内点跟随 ---------------------------------------------------------------
//
// 端点跟随只是橡皮筋的一半：多拐点导线 `A -- c1 -- c2 -- B` 里，端点动而 c 不动，两者之间
// 那一腿立刻从轴对齐滑成任意斜线 —— 这正是"移动元件后连接线变歪"的现场。锚点端点
// （`(node_M2.g)`）尤其危险：它的文本必须保持引用（不能改写成坐标），所以早期实现直接
// `continue`，连同相邻内点的校正一起跳过，那一腿必然变斜。

function mosAt(name: string, x: number, y: number): string {
  return `\\begin{scope}[shift={(${x},${y})}]
    \\coordinate (node_${name}.g) at (0.3,0.5);
    \\coordinate (node_${name}.d) at (1.03,1);
  \\end{scope}`;
}

/** M1@(0,0) 端口 g=(0.3,0.5) d=(1.03,1)；M2@(5,0) 端口 g=(5.3,0.5) d=(6.03,1) */
function twoMosfets(wire: string): string {
  return `${mosAt("M1", 0, 0)}
    ${mosAt("M2", 5, 0)}
    ${wire}`;
}

/** 第二个 scope（M2）的语句 id —— 逐语句编号，不能硬编码。 */
function secondScopeId(source: string): string {
  const wrapped = `\\begin{tikzpicture}\n${source}\n\\end{tikzpicture}\n`;
  const parsed = parseTikz(wrapped, { recover: true });
  const scopes = parsed.figure.body.filter((statement) => statement.kind === "Scope");
  return scopes[scopes.length - 1].id;
}

/**
 * 顶层导线每一条腿的形态（读**求值后**的 world 坐标，所以命名锚点也会解析成真实位置）。
 * "SKEW" = 被拖成了任意斜线。
 *
 * 容差取 0.5pt：scope 的 shift 在自由拖动时按整数 pt 量化（见 wire-follow.ts 顶部说明），
 * 所以锚点解析出来的 world 与写死的坐标之间会残留 ~0.02pt 的取整误差。
 */
function wireLegKinds(documentSource: string): string[] {
  const AXIS_EPSILON_PT = 0.5;
  const parsed = parseTikz(documentSource, { recover: true });
  const semantic = evaluateTikzFigure(parsed.figure, documentSource);
  const wire = parsed.figure.body.find(
    (statement) => statement.kind === "Path" && statement.command === "draw"
  );
  if (!wire) throw new Error("no top-level draw statement");
  const points = semantic.editHandles
    .filter((handle) => handle.kind === "path-point" && handle.sourceRef.sourceId === wire.id)
    .sort((left, right) => left.sourceRef.sourceSpan.from - right.sourceRef.sourceSpan.from)
    .map((handle) => handle.world);
  const legs: string[] = [];
  for (let index = 0; index + 1 < points.length; index += 1) {
    const dx = Math.abs(points[index + 1].x - points[index].x);
    const dy = Math.abs(points[index + 1].y - points[index].y);
    legs.push(dx < AXIS_EPSILON_PT ? "V" : dy < AXIS_EPSILON_PT ? "H" : "SKEW");
  }
  return legs;
}

describe("applyEditAction – 多拐点导线跟随（拖动元件后连接线不得变斜）", () => {
  it("keeps a literal-coordinate multi-corner wire orthogonal", () => {
    const source = twoMosfets("\\draw (1.03,1) -- (1.03,3) -- (5.3,3) -- (5.3,0.5);");
    const { result, wrapped } = move(source, [secondScopeId(source)], 1, 0);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    // 端点和相邻内点一起右移 1cm，最后一腿保持竖直
    expect(result.newSource).toContain("\\draw (1.03,1) -- (1.03,3) -- (6.3,3) -- (6.3,0.5);");
    expect(wireLegKinds(result.newSource)).toEqual(["V", "H", "V"]);
    expectPatchesReconstructSource(wrapped, result);
  });

  it("re-orthogonalises the corner next to a named-anchor endpoint", () => {
    const source = twoMosfets("\\draw (node_M1.d) -- (1.03,3) -- (5.3,3) -- (node_M2.g);");
    const { result, wrapped } = move(source, [secondScopeId(source)], 1, 0);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    // 锚点文本保持引用不动；内点必须跟到 M2 新位置的正上方，否则最后一腿变斜
    expect(result.newSource).toContain("(node_M1.d) -- (1.03,3) -- (6.3,3) -- (node_M2.g)");
    expect(wireLegKinds(result.newSource)).toEqual(["V", "H", "V"]);
    expectPatchesReconstructSource(wrapped, result);
  });

  it("walks inward past consecutive collinear legs (overshoot stubs)", () => {
    // 回折导线：(5.3,-2) → (5.3,4) → (5.3,0.5) 三点共线于 x=5.3。只修紧邻端点那个角点会把
    // 上一条腿拖斜，所以校正必须继续向内传播。M2 右移 1cm 后整段竖直回折一起右移。
    const source = twoMosfets("\\draw (1.03,0) -- (1.03,-2) -- (5.3,-2) -- (5.3,4) -- (5.3,0.5);");
    const { result, wrapped } = move(source, [secondScopeId(source)], 1, 0);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.newSource).toContain("\\draw (1.03,0) -- (1.03,-2) -- (6.3,-2) -- (6.3,4) -- (6.3,0.5);");
    expect(wireLegKinds(result.newSource)).toEqual(["V", "H", "V", "V"]);
    expectPatchesReconstructSource(wrapped, result);
  });
});
