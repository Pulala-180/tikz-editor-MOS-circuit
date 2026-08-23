import { describe, expect, it } from "vitest";
import { applyEditAction } from "../packages/core/src/edit/actions.js";
import { parseTikz } from "../packages/core/src/parser/index.js";
import { evaluateTikzFigure } from "../packages/core/src/semantic/evaluate.js";
import { wp } from "./coords-helpers.js";
import { cm, expectPatchesReconstructSource } from "./edit-actions-helpers.js";

/**
 * 两个电阻连接模型（Two Resistors Glue Model）测试套件：
 * 验证在 Visio Glue 机制下：
 * 1. 级联挂靠模型 (Cascaded Glue): R2 挂靠在 R1 端口上，拖动 R1 时 R2 自动跟随平移；
 * 2. 独立命名锚点导线粘附模型 (Glued Wire): R1 与 R2 之间通过 \draw (node_R1.r) -- (node_R2.l) 粘附，
 *    无论平移 R1 还是 R2，导线在 AST 与渲染中始终死死咬住两端端口，绝不脱钩、绝无浮点数漂移！
 */

function moveElement(source: string, elementIds: string[], dxCm: number, dyCm = 0) {
  const wrapped = `\\begin{tikzpicture}\n${source}\\end{tikzpicture}\n`;
  const parsed = parseTikz(wrapped, { recover: true });
  const semantic = evaluateTikzFigure(parsed.figure, wrapped);
  const result = applyEditAction(wrapped, semantic.editHandles, {
    kind: "moveElements",
    elementIds,
    delta: wp(cm(dxCm), cm(dyCm))
  });
  return { result, wrapped, semantic };
}

describe("两个电阻连接模型 (Two-Resistor Glue Model)", () => {
  // 模型 1：独立双电阻 + 命名锚点导线粘附 (True Glue)
  const twoResistorsWithGluedWire = `
  \\begin{scope}[shift={(1.0, 2.0)}]
    \\coordinate (node_R1.l) at (0, 0);
    \\draw[thick, line cap=round] (0,0) -- (0.15,0) -- (0.19,0.15) -- (0.27,-0.15) -- (0.35,0.15) -- (0.43,-0.15) -- (0.51,0.15) -- (0.59,-0.15) -- (0.63,0) -- (0.78,0);
    \\node at (0.39, 0.35) {$R_1$};
    \\coordinate (node_R1.r) at (0.78, 0);
  \\end{scope}

  \\begin{scope}[shift={(3.5, 2.0)}]
    \\coordinate (node_R2.l) at (0, 0);
    \\draw[thick, line cap=round] (0,0) -- (0.15,0) -- (0.19,0.15) -- (0.27,-0.15) -- (0.35,0.15) -- (0.43,-0.15) -- (0.51,0.15) -- (0.59,-0.15) -- (0.63,0) -- (0.78,0);
    \\node at (0.39, 0.35) {$R_2$};
    \\coordinate (node_R2.r) at (0.78, 0);
  \\end{scope}

  \\draw[thick] (node_R1.r) -- (node_R2.l);
`;

  it("当移动 R1 时，导线维持命名引用 (node_R1.r)，TikZ 原生天然跟随，无浮点数漂移", () => {
    const { result, wrapped } = moveElement(twoResistorsWithGluedWire, ["scope:0"], 1.5, 0.5);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    // R1 的 scope shift 发生改变
    expect(result.newSource).toContain("\\begin{scope}[shift={(2.5,2.5)}]");
    // 导线端点保持纯净的语义化命名锚点引用，源码无需修改数值
    expect(result.newSource).toContain("\\draw[thick] (node_R1.r) -- (node_R2.l);");
    expectPatchesReconstructSource(wrapped, result);
  });

  it("当移动 R2 时，R1 保持原位，导线两端依然死死咬住 (node_R1.r) 与 (node_R2.l)", () => {
    const { result, wrapped } = moveElement(twoResistorsWithGluedWire, ["scope:1"], -0.5, 1.0);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    // R2 的 scope shift 发生改变
    expect(result.newSource).toContain("\\begin{scope}[shift={(3,3)}]");
    // R1 保持原位
    expect(result.newSource).toContain("\\begin{scope}[shift={(1.0, 2.0)}]");
    // 连线依然维持命名绑定
    expect(result.newSource).toContain("\\draw[thick] (node_R1.r) -- (node_R2.l);");
    expectPatchesReconstructSource(wrapped, result);
  });

  // 模型 2：单轴级联挂靠电阻模型 (MOS-circuit 树状拓扑)
  const cascadedResistors = `
  \\begin{scope}[shift={(0.60, 3.60)}]
    \\coordinate (node_R1_left) at (0, 0);
    \\draw[thick, line cap=round] (0,0) -- (0.155,0) -- (0.1875,0.15) -- (0.2525,-0.15) -- (0.3175,0.15) -- (0.3825,-0.15) -- (0.4475,0.15) -- (0.5125,-0.15) -- (0.545,0) -- (0.7,0);
    \\node[above=0.15cm] at (0.35, 0) {\\normalsize $R_1$};
    \\coordinate (node_R1_right) at (0.7, 0);
  \\end{scope}

  \\begin{scope}[shift={(node_R1_right)}, xshift=1.0cm]
    \\coordinate (node_R2_left) at (0, 0);
    \\draw[thick] (0, 0) -- (node_R1_right);
    \\draw[thick, line cap=round] (0,0) -- (0.155,0) -- (0.1875,0.15) -- (0.2525,-0.15) -- (0.3175,0.15) -- (0.3825,-0.15) -- (0.4475,0.15) -- (0.5125,-0.15) -- (0.545,0) -- (0.7,0);
    \\node[above=0.15cm] at (0.35, 0) {\\normalsize $R_2$};
    \\coordinate (node_R2_right) at (0.7, 0);
  \\end{scope}
`;

  it("当移动根电阻 R1 时，子电阻 R2 及其进线 100% 自动跟随", () => {
    const { result, wrapped } = moveElement(cascadedResistors, ["scope:0"], 1.0, 1.0);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    // R1 移动到新坐标
    expect(result.newSource).toContain("\\begin{scope}[shift={(1.6,4.6)}]");
    // R2 作为子级，依然完美保持挂靠签名，拓扑结构丝毫不损
    expect(result.newSource).toContain("\\begin{scope}[shift={(node_R1_right)}, xshift=1.0cm]");
    expectPatchesReconstructSource(wrapped, result);
  });

  it("当插入第二个同名电阻时，命名冲突处理器将端口名从 node_Rx.l/r 优雅升级为 node_Rx2.l/r", async () => {
    const existingSource = `\\begin{scope}[shift={(1,2)}]
    \\coordinate (node_Rx.l) at (0,0);
    \\coordinate (node_Rx.r) at (0.7,0);
  \\end{scope}`;
    const newResistorSnippet = `\\begin{scope}[shift={(3,2)}]
    \\coordinate (node_Rx.l) at (0,0);
    \\coordinate (node_Rx.r) at (0.7,0);
  \\end{scope}`;

    const { renameSnippetDeclaredNames } = await import("../packages/core/src/edit/name-conflicts.js");
    const [renamed] = renameSnippetDeclaredNames(existingSource, [newResistorSnippet]);

    expect(renamed).toContain("(node_Rx2.l)");
    expect(renamed).toContain("(node_Rx2.r)");
  });

  // 模型 3：端点直接接触相连（无直线），移动其中一个，另一个元件必然同步跟随
  it("当两个电阻端点直接相连（无直线）时，移动 R1，R2 必然同步发生位置变化", () => {
    const directTouchingResistors = `
    \\begin{scope}[shift={(0.6, 3.6)}]
      \\coordinate (node_R1.l) at (0,0);
      \\draw[thick, line cap=round] (0,0) -- (0.15,0) -- (0.19,0.15) -- (0.27,-0.15) -- (0.35,0.15) -- (0.43,-0.15) -- (0.51,0.15) -- (0.59,-0.15) -- (0.63,0) -- (0.78,0);
      \\node at (0.39,0.35) {$R_1$};
      \\coordinate (node_R1.r) at (0.78,0);
    \\end{scope}
    \\begin{scope}[shift={(1.38, 3.6)}]
      \\coordinate (node_R2.l) at (0,0);
      \\draw[thick, line cap=round] (0,0) -- (0.15,0) -- (0.19,0.15) -- (0.27,-0.15) -- (0.35,0.15) -- (0.43,-0.15) -- (0.51,0.15) -- (0.59,-0.15) -- (0.63,0) -- (0.78,0);
      \\node at (0.39,0.35) {$R_2$};
      \\coordinate (node_R2.r) at (0.78,0);
    \\end{scope}
  `;

    // 移动 R1 (scope:0) 向右 1cm，向上 0.5cm
    const { result, wrapped } = moveElement(directTouchingResistors, ["scope:0"], 1.0, 0.5);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    // R1 移动到新坐标 (1.6, 4.1)
    expect(result.newSource).toContain("\\begin{scope}[shift={(1.6,4.1)}]");
    // R2 作为直接接触的元件，位置必然同步跟随移动到 (2.38, 4.1)
    expect(result.newSource).toContain("\\begin{scope}[shift={(2.38,4.1)}]");
    expectPatchesReconstructSource(wrapped, result);
  });

  // 模型 5：两电阻中间有直导线连接，左右拖动任何一个电阻，直导线被自动拉长或缩短 (Wire Elastic Stretch)
  it("当两电阻之间有直导线时，左右拖动任何一个电阻，直导线被自动拉长或缩短", () => {
    const twoResistorsWithNumericWire = `
    \\begin{scope}[shift={(0.6, 3.6)}]
      \\coordinate (node_R1.l) at (0,0);
      \\draw[thick, line cap=round] (0,0) -- (0.15,0) -- (0.19,0.15) -- (0.27,-0.15) -- (0.35,0.15) -- (0.43,-0.15) -- (0.51,0.15) -- (0.59,-0.15) -- (0.63,0) -- (0.78,0);
      \\node at (0.39,0.35) {$R_1$};
      \\coordinate (node_R1.r) at (0.78,0);
    \\end{scope}
    \\begin{scope}[shift={(2.5, 3.6)}]
      \\coordinate (node_R2.l) at (0,0);
      \\draw[thick, line cap=round] (0,0) -- (0.15,0) -- (0.19,0.15) -- (0.27,-0.15) -- (0.35,0.15) -- (0.43,-0.15) -- (0.51,0.15) -- (0.59,-0.15) -- (0.63,0) -- (0.78,0);
      \\node at (0.39,0.35) {$R_2$};
      \\coordinate (node_R2.r) at (0.78,0);
    \\end{scope}
    \\draw[thick, line cap=round] (1.38, 3.6) -- (2.5, 3.6);
  `;

    // 1. 向左拖动 R1 0.5cm (从 0.6 拖到 0.1，R1 右端从 1.38 变为 0.88)
    const { result: moveR1Result, wrapped: w1 } = moveElement(twoResistorsWithNumericWire, ["scope:0"], -0.5, 0);
    expect(moveR1Result.kind).toBe("success");
    if (moveR1Result.kind === "success") {
      // R1 移动到 shift={(0.1,3.6)}
      expect(moveR1Result.newSource).toContain("\\begin{scope}[shift={(0.1,3.6)}]");
      // R2 保持原地 shift={(2.5, 3.6)}
      expect(moveR1Result.newSource).toContain("\\begin{scope}[shift={(2.5, 3.6)}]");
      // 中间的直线被弹性拉长！左端点从 1.38 自动跟随变为 0.88，右端点依然贴紧 R2 的 2.5！
      expect(moveR1Result.newSource).toContain("(0.88, 3.6) -- (2.5, 3.6)");
      expectPatchesReconstructSource(w1, moveR1Result);
    }

    // 2. 向右拖动 R2 0.8cm (从 2.5 拖到 3.3，R2 左端从 2.5 变为 3.3)
    const { result: moveR2Result, wrapped: w2 } = moveElement(twoResistorsWithNumericWire, ["scope:1"], 0.8, 0);
    expect(moveR2Result.kind).toBe("success");
    if (moveR2Result.kind === "success") {
      // R1 保持原地 shift={(0.6, 3.6)}
      expect(moveR2Result.newSource).toContain("\\begin{scope}[shift={(0.6, 3.6)}]");
      // R2 移动到 shift={(3.3,3.6)}
      expect(moveR2Result.newSource).toContain("\\begin{scope}[shift={(3.3,3.6)}]");
      // 中间的直线被弹性拉长！左端点保持在 R1 的 1.38，右端点自动跟随拉伸到 3.3！
    // 3. 剧烈向内移动 R1 过猛（从 0.6 猛右移 1.1cm 到 1.7，几乎撞上 R2 的 2.5）
    // 导线端点自动被最小长度限制保护（截停在 2.5 - 0.1 = 2.4），绝不崩塌、绝无重叠乱码！
    const { result: violentMoveResult, wrapped: w3 } = moveElement(twoResistorsWithNumericWire, ["scope:0"], 1.1, 0);
    expect(violentMoveResult.kind).toBe("success");
    if (violentMoveResult.kind === "success") {
      expect(violentMoveResult.newSource).toContain("\\begin{scope}[shift={(1.7,3.6)}]");
      expect(violentMoveResult.newSource).toContain("(2.4, 3.6) -- (2.5, 3.6)");
      expectPatchesReconstructSource(w3, violentMoveResult);
    }
  });

  // 模型 6：IO Node 端口跟随相连器件同步平移 (IO Node Rigid Synchronous Follow in all directions)
  it("当 IO Node 与电阻左端口相连时，移动电阻（上下左右），IO Node 整个元件刚性同步跟随平移", () => {
    const resistorWithIoNode = `
    \\draw[thick, line cap=round] (0.25, 3.6) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.6, 3.6);
    \\begin{scope}[shift={(0.6, 3.6)}]
      \\coordinate (node_R1.l) at (0,0);
      \\draw[thick, line cap=round] (0,0) -- (0.15,0) -- (0.19,0.15) -- (0.27,-0.15) -- (0.35,0.15) -- (0.43,-0.15) -- (0.51,0.15) -- (0.59,-0.15) -- (0.63,0) -- (0.78,0);
      \\node at (0.39,0.35) {$R_1$};
      \\coordinate (node_R1.r) at (0.78,0);
    \\end{scope}
  `;

    // 移动电阻 R1 向右 0.8cm，向上 0.5cm (从 (0.6, 3.6) 移到 (1.4, 4.1))
    const { result, wrapped } = moveElement(resistorWithIoNode, ["scope:0"], 0.8, 0.5);
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      // 电阻平移到 shift={(1.4,4.1)}
      expect(result.newSource).toContain("\\begin{scope}[shift={(1.4,4.1)}]");
      // IO 节点整体跟随平移（左端从 0.25 变为 1.05，右端从 0.6 变为 1.4，高度从 3.6 变为 4.1）！
      expect(result.newSource).toContain("(1.05, 4.1) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (1.4, 4.1)");
      expectPatchesReconstructSource(wrapped, result);
    }
  });

  it("拖动 IO Node 的空心圆端点向左拉长时，空心圆与 Vin 标签一同平移，右端点保持不变", () => {
    const ioNodeWithVin = `\\draw[thick, line cap=round] (-0.5,3) node[circle, draw=black, fill=white, inner sep=1.5pt, label={[node font=\\sffamily\\bfseries]above left:$V_{in}$}] {} -- (0.40,3.00);`;
    const wrapped = `\\begin{tikzpicture}\n${ioNodeWithVin}\n\\end{tikzpicture}\n`;
    const parsed = parseTikz(wrapped, { recover: true });
    const semantic = evaluateTikzFigure(parsed.figure, wrapped);
    const leftHandle = semantic.editHandles.find(h => h.kind === "path-point" && Math.abs(h.world.x - (-0.5 * 28.4527559)) < 0.5);
    expect(leftHandle).toBeDefined();
    if (leftHandle) {
      const result = applyEditAction(wrapped, semantic.editHandles, {
        kind: "moveHandle",
        handleId: leftHandle.id,
        newWorld: wp(cm(-0.9), cm(3.0))
      });
      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.newSource).toContain("(-0.9, 3)");
        expect(result.newSource).toContain("(0.40,3.00)");
        expectPatchesReconstructSource(wrapped, result);
      }
    }
  });
});
