import { describe, expect, it } from "vitest";
import { applyEditAction } from "../packages/core/src/edit/actions.js";
import { parseTikz } from "../packages/core/src/parser/index.js";
import { evaluateTikzFigure } from "../packages/core/src/semantic/evaluate.js";
import { detectRigidLeafBranches, findAttachedWiresForTransientDrag } from "../packages/core/src/edit/actions/wire-follow.js";
import { wp } from "./coords-helpers.js";
import { cm } from "./edit-actions-helpers.js";

function setupCircuit(source: string) {
  const wrapped = `\\begin{tikzpicture}\n${source}\n\\end{tikzpicture}\n`;
  const parsed = parseTikz(wrapped, { recover: true });
  const semantic = evaluateTikzFigure(parsed.figure, wrapped);
  return { wrapped, parsed, semantic };
}

function move(source: string, elementIds: string[], dxCm: number, dyCm = 0) {
  const { wrapped, semantic } = setupCircuit(source);
  const result = applyEditAction(wrapped, semantic.editHandles, {
    kind: "moveElements",
    elementIds,
    delta: wp(cm(dxCm), cm(dyCm))
  });
  return { result, wrapped, semantic };
}

describe("刚性叶子支路联动跟随 (Rigid Leaf Branch Follow)", () => {
  const circuitVinM1 = `
  \\begin{scope}[shift={(1.07,3.4)}]
    \\coordinate (node_M1.g) at (0,0);
    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0.26,0);
    \\coordinate (node_M1.d) at (0.73,0.5);
    \\coordinate (node_M1.s) at (0.73,-0.5);
  \\end{scope}
  \\begin{scope}[shift={(0.0,3.4)}]
    \\node at (-0.01,-0.30) {$V_{in}^-$};
    \\draw[line width=0.32mm, line cap=round] (0.15,0) -- (0.6,0);
    \\coordinate (node_IO_Vin1.port) at (0.6,0);
  \\end{scope}
  \\draw[line width=0.32mm, line cap=round] (0.6,3.4) -- (1.07,3.4);
  `;

  it("detectRigidLeafBranches 能检测出 M1 垂直移动时的 Vin 刚性叶子支路", () => {
    const { wrapped, parsed, semantic } = setupCircuit(circuitVinM1);
    const m1Scope = parsed.figure.body.find(
      (s: any) => s.kind === "Scope" && wrapped.slice(s.span.from, s.span.to).includes("node_M1")
    );
    const vinScope = parsed.figure.body.find(
      (s: any) => s.kind === "Scope" && wrapped.slice(s.span.from, s.span.to).includes("node_IO_Vin1")
    );
    const wire = parsed.figure.body.find(
      (s: any) => s.kind === "Path" && s.command === "draw" && wrapped.slice(s.span.from, s.span.to).includes("0.6,3.4")
    );

    expect(m1Scope).toBeDefined();
    expect(vinScope).toBeDefined();
    expect(wire).toBeDefined();

    const branches = detectRigidLeafBranches(
      wrapped,
      parsed.figure.body,
      semantic.editHandles,
      [m1Scope!.id],
      wp(cm(0), cm(1)) // 向上移动 1cm
    );

    expect(branches.length).toBe(1);
    expect(branches[0].wireStatementId).toBe(wire!.id);
    expect(branches[0].leafComponentId).toBe(vinScope!.id);
    expect(branches[0].orientation).toBe("h");
  });

  it("垂直移动 M1 时，Vin 和水平导线整体向上平移，保持严格水平线", () => {
    const { wrapped, parsed } = setupCircuit(circuitVinM1);
    const m1Scope = parsed.figure.body.find(
      (s: any) => s.kind === "Scope" && wrapped.slice(s.span.from, s.span.to).includes("node_M1")
    );

    const { result } = move(circuitVinM1, [m1Scope!.id], 0, 1);
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    // M1 scope 移至 y = 4.4
    expect(result.newSource).toContain("shift={(1.07,4.4)}");
    // Vin scope 同步平移至 y = 4.4
    expect(result.newSource).toContain("shift={(0,4.4)}");
    // 导线两端 y 坐标一致，严格保持水平线！
    expect(result.newSource).toContain("(0.6,4.4) -- (1.07,4.4)");
  });

  it("斜向移动 M1 时，Vin 仅在 Y 方向移动，导线拉长且保持水平", () => {
    const { wrapped, parsed } = setupCircuit(circuitVinM1);
    const m1Scope = parsed.figure.body.find(
      (s: any) => s.kind === "Scope" && wrapped.slice(s.span.from, s.span.to).includes("node_M1")
    );

    // dx = 0.5, dy = 1
    const { result } = move(circuitVinM1, [m1Scope!.id], 0.5, 1);
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    // M1 scope 移至 (1.57, 4.4)
    expect(result.newSource).toContain("shift={(1.57,4.4)}");
    // Vin scope X 不变，Y 移至 4.4
    expect(result.newSource).toContain("shift={(0,4.4)}");
    // 导线两端 y 均为 4.4，保持完全水平！
    expect(result.newSource).toContain("(0.6,4.4) -- (1.57,4.4)");
  });

  it("非叶子元件（度数 > 1）互连时，坚决不误移动对端元件", () => {
    const circuitM1M2 = `
    \\begin{scope}[shift={(1.07,3.4)}]
      \\coordinate (node_M1.g) at (0,0);
      \\draw[thick] (0,0) -- (0.26,0);
    \\end{scope}
    \\begin{scope}[shift={(3.47,3.4)}]
      \\coordinate (node_M2.g) at (0,0);
      \\draw[thick] (0,0) -- (-0.26,0);
    \\end{scope}
    \\begin{scope}[shift={(3.47,5.0)}]
      \\coordinate (node_M3.s) at (0,0);
    \\end{scope}
    \\draw[thick] (1.07,3.4) -- (3.47,3.4);
    \\draw[thick] (3.47,3.4) -- (3.47,5.0);
    `;

    const { wrapped, parsed } = setupCircuit(circuitM1M2);
    const m1Scope = parsed.figure.body.find(
      (s: any) => s.kind === "Scope" && wrapped.slice(s.span.from, s.span.to).includes("node_M1")
    );

    const { result } = move(circuitM1M2, [m1Scope!.id], 0, 1);
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    // M2 有多条连线，不是叶子节点，绝不可联动平移！
    expect(result.newSource).toContain("shift={(3.47,3.4)}");
  });

  it("在单端放大器电路中向上移动 M1 时，Vin 和栅极导线严格水平联动跟随", () => {
    const texContent = `\\begin{tikzpicture}
  \\begin{scope}[shift={(0,3.4)}]
    \\draw[line width=0.32mm, line cap=round] (0.15,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.6,0);
    \\node[left] at (0.1,0) {$V_{in}^-$};
    \\coordinate (node_IO1.port) at (0.6,0);
  \\end{scope}
  \\draw[line width=0.32mm, line cap=round] (0.6,3.4) -- (1.07,3.4);
  \\begin{scope}[shift={(1.07,3.4)}]
    \\coordinate (node_M1.g) at (0,0);
    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0.26,0);
    \\draw[line width=0.7mm] (0.25,-0.25) -- (0.25,0.25);
    \\draw[line width=0.7mm] (0.41,-0.3) -- (0.41,0.3);
    \\draw[line width=0.32mm, line cap=round, line join=round] (0.40,0.2) -- (0.73,0.2) -- (0.73,0.5);
    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (0.40,-0.2) -- (0.70,-0.2);
    \\draw[line width=0.32mm, line cap=round] (0.73,-0.21) -- (0.73,-0.5);
    \\node[node font=\\sffamily\\bfseries] at (1.04,0) {$M_{1}$};
    \\coordinate (node_M1.d) at (0.73,0.5);
    \\coordinate (node_M1.s) at (0.73,-0.5);
  \\end{scope}
\\end{tikzpicture}`;

    const parsed = parseTikz(texContent, { recover: true });
    const semantic = evaluateTikzFigure(parsed.figure, texContent);

    const m1Scope = parsed.figure.body.find(
      (s: any) => s.kind === "Scope" && texContent.slice(s.span.from, s.span.to).includes("node_M1")
    );
    expect(m1Scope).toBeDefined();

    // 向上移动 M1 0.5cm (从 y=3.4 移到 y=3.9)
    const result = applyEditAction(texContent, semantic.editHandles, {
      kind: "moveElements",
      elementIds: [m1Scope!.id],
      delta: wp(cm(0), cm(0.5))
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    // 1. M1 shift 变为 y=3.9
    expect(result.newSource).toContain("shift={(1.07,3.9)}");
    // 2. Vin- shift 同步平移变为 y=3.9
    expect(result.newSource).toContain("shift={(0,3.9)}");
    // 3. 栅极连接线两端 y 坐标完全一致为 3.9，保持绝对正交水平！
    expect(result.newSource).toContain("(0.6,3.9) -- (1.07,3.9)");
  });

  it("左右移动 M1 时，上方负载电阻 RD、垂直漏极连线、分叉黑圆点与 Vout 抽头支路全部同步横向平移", () => {
    const amplifierCircuit = `
    \\begin{scope}[shift={(1.8,5.0)}]
      \\coordinate (node_RD.bottom) at (0,0);
      \\draw[thick] (0,0) -- (0,0.3) -- (-0.2,0.4) -- (0.2,0.6) -- (-0.2,0.8) -- (0.2,1.0) -- (0,1.1) -- (0,1.4);
      \\node at (0.6,0.9) {$R_D$};
      \\coordinate (node_RD.top) at (0,1.4);
    \\end{scope}
    \\begin{scope}[shift={(1.07,3.4)}]
      \\coordinate (node_M1.g) at (0,0);
      \\draw[thick] (0,0) -- (0.26,0);
      \\coordinate (node_M1.d) at (0.73,0.5);
      \\coordinate (node_M1.s) at (0.73,-0.5);
      \\node at (1.04,0) {$M_1$};
    \\end{scope}
    \\draw[thick] (1.8,3.9) -- (1.8,5.0);
    \\draw[fill=black] (1.8,4.45) circle (0.06);
    \\draw[thick] (1.8,4.45) -- (2.95,4.45);
    \\begin{scope}[shift={(2.8,4.45)}]
      \\node at (0.85,-0.30) {$V_{out}$};
      \\draw[thick] (0.15,0) node[circle, draw=black, fill=white] {} -- (0.6,0);
      \\coordinate (node_IO_Vout.port) at (0.15,0);
    \\end{scope}
    `;

    const { wrapped, parsed, semantic } = setupCircuit(amplifierCircuit);
    const m1Scope = parsed.figure.body.find(
      (s: any) => s.kind === "Scope" && wrapped.slice(s.span.from, s.span.to).includes("node_M1")
    );
    expect(m1Scope).toBeDefined();

    // 向左移动 M1 1cm (dx = -1)
    const result = applyEditAction(wrapped, semantic.editHandles, {
      kind: "moveElements",
      elementIds: [m1Scope!.id],
      delta: wp(cm(-1), cm(0))
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    // 1. M1 向左平移 1cm: x 从 1.07 变为 0.07
    expect(result.newSource).toContain("shift={(0.07,3.4)}");
    // 2. 负载电阻 RD 同步向左平移 1cm: x 从 1.8 变为 0.8
    expect(result.newSource).toContain("shift={(0.8,5)}");
    // 3. 垂直漏极线两端 x 均平移为 0.8，保持严格垂直！
    expect(result.newSource).toContain("(0.8,3.9) -- (0.8,5)");
    // 4. 分叉黑圆点 x 平移为 0.8！
    expect(result.newSource).toContain("(0.8,4.45) circle (0.06)");
    // 5. 水平引出线两端 x 均平移 1cm: (0.8, 4.45) -- (1.95, 4.45)，保持水平！
    expect(result.newSource).toContain("(0.8,4.45) -- (1.95,4.45)");
    // 6. Vout 端口 scope 同步平移至 x = 1.8！
    expect(result.newSource).toContain("shift={(1.8,4.45)}");
  });

  it("多次移动 M1 在 Source-degeneration 电路中不会导致连线坐标错位或凹坑", () => {
    const sourceDegeneration = `\\begin{tikzpicture}
  \\draw[thick, line cap=round] (0.73,2.6) -- (0.73,2.5);
  \\begin{scope}[shift={(0.73,2.5)}]
      \\coordinate (node_Rx.t) at (0,0);
      \\draw[thick, line cap=round] (0,0) -- (0,-0.15) -- (0.15,-0.19) -- (-0.15,-0.27) -- (0.15,-0.35) -- (-0.15,-0.43) -- (0.15,-0.51) -- (-0.15,-0.59) -- (0,-0.63) -- (0,-0.78);
      \\node[right] at (0.25,-0.39) {$R_S$};
      \\coordinate (node_Rx.b) at (0,-0.78);
    \\end{scope}
  \\draw[thick, line cap=round] (0,3.1) -- (-0.3,3.1);
  \\begin{scope}[shift={(-0.9,3.1)}]
      \\node at (-0.01,-0.30) {$V_{in}$};
      \\draw[thick, line cap=round] (0.15,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.6,0);
      \\coordinate (node_IOx.port) at (0.6,0);
    \\end{scope}
  \\draw[thick, line cap=round] (0.73,3.6) -- (0.73,5.5);
  \\begin{scope}[shift={(0.73,5.5)}]
      \\coordinate (node_Rx2.b) at (0,0);
      \\draw[thick, line cap=round] (0,0) -- (0,0.15) -- (0.15,0.19) -- (-0.15,0.27) -- (0.15,0.35) -- (-0.15,0.43) -- (0.15,0.51) -- (-0.15,0.59) -- (0,0.63) -- (0,0.78);
      \\node[right] at (0.25,0.39) {$R_D$};
      \\coordinate (node_Rx2.t) at (0,0.78);
    \\end{scope}
  \\draw[thick, line cap=round] (0.73,6.28) -- (0.73,7.36);
  \\begin{scope}[shift={(0.73,7.36)}]
      \\coordinate (node_VDD.bottom) at (0,0);
      \\draw[ultra thick] (-0.95,0) -- (0.9,0);
      \\node[draw=none] at (1.22,-0.22) {$V_{DD}$};
    \\end{scope}
  \\draw[thick, fill=black] (0.71,4.69) circle (0.06);
  \\draw[thick, line cap=round] (0.73,4.69) -- (1.36,4.69);
  \\begin{scope}[shift={(1.22,4.691)}]
      \\node at (0.85,-0.30) {$V_{out}$};
      \\draw[thick, line cap=round] (0.6,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.15,0);
      \\coordinate (node_IOx2.port) at (0.15,0);
    \\end{scope}
  \\draw[thick, line cap=round] (0.73,1.72) -- (0.73,0.2);
  \\begin{scope}[shift={(0.73,0.21)}]
      \\coordinate (node_GND.top) at (0,0);
      \\draw[thick, line cap=round] (0,0) -- (0,-0.21);
      \\draw[ultra thick] (-0.17,-0.21) -- (0.17,-0.21);
      \\draw[ultra thick] (-0.11,-0.35) -- (0.11,-0.35);
      \\draw[ultra thick] (-0.08,-0.49) -- (0.08,-0.49);
    \\end{scope}
  \\begin{scope}[shift={(0.00,3.10)}]
      \\coordinate (node_Mx.g) at (0,0);
      \\draw[thick, line cap=round] (0,0) -- (0.26,0);
      \\draw[ultra thick] (0.25,-0.25) -- (0.25,0.25);
      \\draw[ultra thick] (0.41,-0.3) -- (0.41,0.3);
      \\draw[thick, line cap=round, line join=round] (0.40,0.2) -- (0.73,0.2) -- (0.73,0.5);
      \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, thick, line cap=round] (0.40,-0.2) -- (0.70,-0.2);
      \\draw[thick, line cap=round] (0.73,-0.21) -- (0.73,-0.5);
      \\node[node font=\\sffamily\\bfseries] at (1.04,0) {$M_1$};
      \\coordinate (node_Mx.d) at (0.73,0.5);
      \\coordinate (node_Mx.s) at (0.73,-0.5);
    \\end{scope}
\\end{tikzpicture}`;

    let curTex = sourceDegeneration;
    const moves = [
      { dx: 0, dy: 1 },    // 向上移 1cm
      { dx: 0.5, dy: 0 },  // 向右移 0.5cm
      { dx: 0, dy: -0.5 }, // 向下移 0.5cm
      { dx: -0.5, dy: 0 }, // 向左移 0.5cm
      { dx: 0, dy: -0.5 }  // 回到原高度
    ];

    for (const m of moves) {
      const parsed = parseTikz(curTex, { recover: true });
      const semantic = evaluateTikzFigure(parsed.figure, curTex);
      const m1Scope = parsed.figure.body.find(
        (s: any) => s.kind === "Scope" && curTex.slice(s.span.from, s.span.to).includes("node_Mx")
      );
      expect(m1Scope).toBeDefined();

      const res = applyEditAction(curTex, semantic.editHandles, {
        kind: "moveElements",
        elementIds: [m1Scope!.id],
        delta: wp(cm(m.dx), cm(m.dy))
      });
      expect(res.kind).toBe("success");
      if (res.kind !== "success") return;
      curTex = res.newSource;
    }

    console.log("Final tex vin/wire:\n", curTex.split("\n").filter(l => l.includes("Vin") || l.includes("3.1") || l.includes("node_IOx") || l.includes("node_Mx")).join("\n"));
  });

  it("多次移动 M1 在 5 tube OTA 电路中测试", () => {
    const otaSource = `\\begin{tikzpicture}
  \\draw[thick, line cap=round] (0.85,1.5) -- (0.85,1.2);
  \\draw[thick, line cap=round] (0.85,2.50) -- (0.85,3.3);
  \\draw[thick, line cap=round] (0.12,2.00) -- (0.02,2);
  \\begin{scope}[shift={(-0.58,2)}]
      \\node at (-0.01,-0.30) {$V_{in}$};
      \\draw[thick, line cap=round] (0.15,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.6,0);
      \\coordinate (node_IOx.port) at (0.6,0);
  \\end{scope}
  \\begin{scope}[shift={(0.12,2.00)}]
      \\coordinate (node_Mx.g) at (0,0);
      \\draw[thick, line cap=round] (0,0) -- (0.26,0);
      \\draw[ultra thick] (0.25,-0.25) -- (0.25,0.25);
      \\draw[ultra thick] (0.41,-0.3) -- (0.41,0.3);
      \\draw[thick, line cap=round, line join=round] (0.40,0.2) -- (0.73,0.2) -- (0.73,0.5);
      \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, thick, line cap=round] (0.40,-0.2) -- (0.70,-0.2);
      \\draw[thick, line cap=round] (0.73,-0.21) -- (0.73,-0.5);
      \\node[node font=\\sffamily\\bfseries] at (1.04,0) {$M_1$};
      \\coordinate (node_Mx.d) at (0.73,0.5);
      \\coordinate (node_Mx.s) at (0.73,-0.5);
  \\end{scope}
\\end{tikzpicture}`;

    let curTex = otaSource;
    const moves = [
      { dx: 0, dy: 0.5 },
      { dx: 0, dy: -0.5 }
    ];

    for (const m of moves) {
      const parsed = parseTikz(curTex, { recover: true });
      const semantic = evaluateTikzFigure(parsed.figure, curTex);
      const m1Scope = parsed.figure.body.find(
        (s: any) => s.kind === "Scope" && curTex.slice(s.span.from, s.span.to).includes("node_Mx")
      );
      const res = applyEditAction(curTex, semantic.editHandles, {
        kind: "moveElements",
        elementIds: [m1Scope!.id],
        delta: wp(cm(m.dx), cm(m.dy))
      });
      expect(res.kind).toBe("success");
      if (res.kind !== "success") return;
      curTex = res.newSource;
    }

    console.log("OTA result:\n", curTex);
  });

  it("拖动 M1 时在 fine 精度（拖拽中）和 default 精度（松开后）下连线与 scope 坐标严格一致无台阶", () => {
    const userCircuit = `\\begin{tikzpicture}
  \\begin{scope}[shift={(1.69,2.73)}]
      \\coordinate (node_M1.g) at (0,0);
      \\draw[line width=0.32mm, line cap=round] (0,0) -- (0.26,0);
      \\draw[line width=0.7mm] (0.25,-0.25) -- (0.25,0.25);
      \\draw[line width=0.7mm] (0.41,-0.3) -- (0.41,0.3);
      \\draw[line width=0.32mm, line cap=round, line join=round] (0.40,0.2) -- (0.73,0.2) -- (0.73,0.5);
      \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (0.40,-0.2) -- (0.70,-0.2);
      \\draw[line width=0.32mm, line cap=round] (0.73,-0.21) -- (0.73,-0.5);
      \\node[node font=\\sffamily\\bfseries] at (1.04,0) {$M_{1}$};
      \\coordinate (node_M1.d) at (0.73,0.5);
      \\coordinate (node_M1.s) at (0.73,-0.5);
    \\end{scope}


  \\draw[line width=0.32mm, line cap=round] (1.69,2.73) -- (1.39,2.73);

  \\begin{scope}[shift={(0.79,2.73)}]
      \\node at (-0.01,-0.30) {$V_{in}$};
      \\draw[line width=0.32mm, line cap=round] (0.15,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.6,0);
      \\coordinate (node_IO1.port) at (0.6,0);
    \\end{scope}
\\end{tikzpicture}`;

    const parsed = parseTikz(userCircuit, { recover: true });
    const semantic = evaluateTikzFigure(parsed.figure, userCircuit);
    const m1Scope = parsed.figure.body.find(
      (s: any) => s.kind === "Scope" && userCircuit.slice(s.span.from, s.span.to).includes("node_M1")
    );
    expect(m1Scope).toBeDefined();

    // 临界 delta: dy_cm = -2.355 (y 从 2.73 变到 0.375)
    const dy_pt = -2.355 * 28.4527559055;
    const dx_pt = -0.01 * 28.4527559055;

    // 1. 拖拽过程中 (formatPrecision: "fine")
    const resFine = applyEditAction(userCircuit, semantic.editHandles, {
      kind: "moveElements",
      elementIds: [m1Scope!.id],
      delta: wp(cm(-0.01), cm(-2.355)),
      formatPrecision: "fine"
    });
    expect(resFine.kind).toBe("success");
    if (resFine.kind === "success") {
      // 验证 M1 scope、连线两端 Y、Vin scope 严格一致 (均为 0.375)
      expect(resFine.newSource).toContain("shift={(1.68,0.375)}");
      expect(resFine.newSource).toContain("(1.68,0.375) -- (1.39,0.375)");
      expect(resFine.newSource).toContain("shift={(0.79,0.375)}");
    }

    // 2. 拖拽释放后 (formatPrecision: default / 2位小数)
    const resDefault = applyEditAction(userCircuit, semantic.editHandles, {
      kind: "moveElements",
      elementIds: [m1Scope!.id],
      delta: wp(cm(-0.01), cm(-2.355))
    });
    expect(resDefault.kind).toBe("success");
    if (resDefault.kind === "success") {
      // 验证 M1 scope、连线两端 Y、Vin scope 严格一致 (均为 0.38)
      expect(resDefault.newSource).toContain("shift={(1.68,0.38)}");
      expect(resDefault.newSource).toContain("(1.68,0.38) -- (1.39,0.38)");
      expect(resDefault.newSource).toContain("shift={(0.79,0.38)}");
    }
  });

  it("debug transient drag data for Source-degeneration", async () => {
    const sourceDegeneration = `\\begin{tikzpicture}
  \\draw[thick, line cap=round] (0.73,2.6) -- (0.73,2.5);
  \\begin{scope}[shift={(0.73,2.5)}]
      \\coordinate (node_Rx.t) at (0,0);
      \\draw[thick, line cap=round] (0,0) -- (0,-0.15) -- (0.15,-0.19) -- (-0.15,-0.27) -- (0.15,-0.35) -- (-0.15,-0.43) -- (0.15,-0.51) -- (-0.15,-0.59) -- (0,-0.63) -- (0,-0.78);
      \\node[right] at (0.25,-0.39) {$R_S$};
      \\coordinate (node_Rx.b) at (0,-0.78);
    \\end{scope}
  \\draw[thick, line cap=round] (0,3.1) -- (-0.3,3.1);
  \\begin{scope}[shift={(-0.9,3.1)}]
      \\node at (-0.01,-0.30) {$V_{in}$};
      \\draw[thick, line cap=round] (0.15,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.6,0);
      \\coordinate (node_IOx.port) at (0.6,0);
    \\end{scope}
  \\draw[thick, line cap=round] (0.73,3.6) -- (0.73,5.5);
  \\begin{scope}[shift={(0.73,5.5)}]
      \\coordinate (node_Rx2.b) at (0,0);
      \\draw[thick, line cap=round] (0,0) -- (0,0.15) -- (0.15,0.19) -- (-0.15,0.27) -- (0.15,0.35) -- (-0.15,0.43) -- (0.15,0.51) -- (-0.15,0.59) -- (0,0.63) -- (0,0.78);
      \\node[right] at (0.25,0.39) {$R_D$};
      \\coordinate (node_Rx2.t) at (0,0.78);
    \\end{scope}
  \\draw[thick, line cap=round] (0.73,6.28) -- (0.73,7.36);
  \\begin{scope}[shift={(0.73,7.36)}]
      \\coordinate (node_VDD.bottom) at (0,0);
      \\draw[ultra thick] (-0.95,0) -- (0.9,0);
      \\node[draw=none] at (1.22,-0.22) {$V_{DD}$};
    \\end{scope}
  \\draw[thick, fill=black] (0.71,4.69) circle (0.06);
  \\draw[thick, line cap=round] (0.73,4.69) -- (1.36,4.69);
  \\begin{scope}[shift={(1.22,4.691)}]
      \\node at (0.85,-0.30) {$V_{out}$};
      \\draw[thick, line cap=round] (0.6,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.15,0);
      \\coordinate (node_IOx2.port) at (0.15,0);
    \\end{scope}
  \\draw[thick, line cap=round] (0.73,1.72) -- (0.73,0.2);
  \\begin{scope}[shift={(0.73,0.21)}]
      \\coordinate (node_GND.top) at (0,0);
      \\draw[thick, line cap=round] (0,0) -- (0,-0.21);
      \\draw[ultra thick] (-0.17,-0.21) -- (0.17,-0.21);
      \\draw[ultra thick] (-0.11,-0.35) -- (0.11,-0.35);
      \\draw[ultra thick] (-0.08,-0.49) -- (0.08,-0.49);
    \\end{scope}
  \\begin{scope}[shift={(0.00,3.10)}]
      \\coordinate (node_Mx.g) at (0,0);
      \\draw[thick, line cap=round] (0,0) -- (0.26,0);
      \\draw[ultra thick] (0.25,-0.25) -- (0.25,0.25);
      \\draw[ultra thick] (0.41,-0.3) -- (0.41,0.3);
      \\draw[thick, line cap=round, line join=round] (0.40,0.2) -- (0.73,0.2) -- (0.73,0.5);
      \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, thick, line cap=round] (0.40,-0.2) -- (0.70,-0.2);
      \\draw[thick, line cap=round] (0.73,-0.21) -- (0.73,-0.5);
      \\node[node font=\\sffamily\\bfseries] at (1.04,0) {$M_1$};
      \\coordinate (node_Mx.d) at (0.73,0.5);
      \\coordinate (node_Mx.s) at (0.73,-0.5);
    \\end{scope}
\\end{tikzpicture}`;

    const parsed = parseTikz(sourceDegeneration, { recover: true });
    const semantic = evaluateTikzFigure(parsed.figure, sourceDegeneration);
    const m1Scope = parsed.figure.body.find(
      (s: any) => s.kind === "Scope" && sourceDegeneration.slice(s.span.from, s.span.to).includes("node_Mx")
    );
    console.log("M1 Scope ID:", m1Scope?.id);

    const rigidInit = detectRigidLeafBranches(
      sourceDegeneration,
      parsed.figure.body,
      semantic.editHandles,
      [m1Scope!.id],
      wp(cm(1), cm(1))
    );
    console.log("rigidInit with (1, 1):", JSON.stringify(rigidInit, null, 2));

    const rigidDxOnly = detectRigidLeafBranches(
      sourceDegeneration,
      parsed.figure.body,
      semantic.editHandles,
      [m1Scope!.id],
      wp(cm(1), cm(0))
    );
    console.log("rigidDxOnly with (1, 0):", JSON.stringify(rigidDxOnly, null, 2));

    const rigidDyOnly = detectRigidLeafBranches(
      sourceDegeneration,
      parsed.figure.body,
      semantic.editHandles,
      [m1Scope!.id],
      wp(cm(0), cm(-1))
    );
    console.log("rigidDyOnly with (0, -1):", JSON.stringify(rigidDyOnly, null, 2));

    const scopeIds = [m1Scope!.id];
    const attachedWires = findAttachedWiresForTransientDrag(
      sourceDegeneration,
      semantic.editHandles,
      [m1Scope!.id],
      scopeIds
    );
    console.log("attachedWires:", JSON.stringify(attachedWires, null, 2));

    const { emitSvg } = await import("../packages/core/src/svg/emit.js");
    const svgResult = emitSvg(semantic.scene);
    console.log("svg contains path:6?", svgResult.svg.includes('data-source-id="path:6"'));
    const match = svgResult.svg.match(/<path[^>]*data-source-id="path:6"[^>]*>/);
    console.log("path:6 tag in svg:", match?.[0]);

    // Test buildTranslatedPolylineD when dragging M1 down by 1cm (dy = -28.45pt in world, svgDy = +28.45pt in SVG)
    const points = [{ x: 0, y: 113.242 }, { x: -8.5358, y: 113.242 }];
    const svgDx = 0;
    const svgDy = 28.4527559; // moving down
    const rb = rigidInit.find(b => b.wireStatementId === "path:6");
    const staticOffset = rb
      ? {
          x: rb.orientation === "h" ? 0 : svgDx,
          y: rb.orientation === "h" ? svgDy : 0
        }
      : undefined;

    console.log("rb for path:6:", rb);
    console.log("staticOffset for path:6:", staticOffset);

    const { collectSnapExcludedSourceIds } = await import("../packages/app/src/ui/canvas-panel/useCanvasElementInteractions.js");
    const { buildScopeOverlayIndex } = await import("../packages/app/src/ui/canvas-panel/scope-overlay.js");
    const scopeOverlay = buildScopeOverlayIndex(parsed.figure.body, new Map());
    console.log("scopeOverlay scopesById keys:", Array.from(scopeOverlay.scopesById.keys()));
    console.log("scopeOverlay ancestorScopeIdsBySourceId:", Array.from(scopeOverlay.ancestorScopeIdsBySourceId.entries()));

    const allSourceIds = collectSnapExcludedSourceIds(["scope:7"], scopeOverlay, semantic.scene.elements);
    console.log("allSourceIds for scope:7:", allSourceIds);
  });

  it("平移 M1 时，主干线上的支路节点 scope (node_D1) 及下游叶子元件 (R2) 同步联动跟随", () => {
    const userCircuit = `\\begin{tikzpicture}
  \\begin{scope}[shift={(3.28,1.898)}]
      \\coordinate (node_M1.g) at (0,0);
      \\draw[line width=0.32mm, line cap=round] (0,0) -- (0.26,0);
      \\draw[line width=0.7mm] (0.25,-0.25) -- (0.25,0.25);
      \\draw[line width=0.7mm] (0.41,-0.3) -- (0.41,0.3);
      \\draw[line width=0.32mm, line cap=round, line join=round] (0.40,0.2) -- (0.73,0.2) -- (0.73,0.5);
      \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (0.40,-0.2) -- (0.70,-0.2);
      \\draw[line width=0.32mm, line cap=round] (0.73,-0.21) -- (0.73,-0.5);
      \\node[node font=\\sffamily\\bfseries] at (1.04,0) {$M_{1}$};
      \\coordinate (node_M1.d) at (0.73,0.5);
      \\coordinate (node_M1.s) at (0.73,-0.5);
    \\end{scope}

  \\begin{scope}[shift={(4.01,0.62)}]
      \\coordinate (node_GND.top) at (0,0);
      \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,-0.21);
      \\draw[ultra thick] (-0.17,-0.21) -- (0.17,-0.21);
      \\draw[ultra thick] (-0.11,-0.35) -- (0.11,-0.35);
      \\draw[ultra thick] (-0.05,-0.49) -- (0.05,-0.49);
    \\end{scope}

  \\begin{scope}[shift={(4.01,4.56)}]
      \\coordinate (node_VDD.bottom) at (0,0);
      \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,0.19);
      \\draw[line width=0.32mm] (-0.2,0.19) -- (0.2,0.19);
      \\node[above, node font=\\sffamily\\bfseries, inner sep=1pt] at (0,0.19) {$V_{DD}$};
    \\end{scope}

  \\begin{scope}[shift={(4.01,3.28)}]
      \\coordinate (node_R1.b) at (0,0);
      \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,0.15);
      \\draw[line width=0.32mm] (-0.15,0.15) rectangle (0.15,0.65);
      \\node[node font=\\sffamily\\bfseries] at (0.41,0.4) {$R_{1}$};
      \\draw[line width=0.32mm, line cap=round] (0,0.65) -- (0,0.8);
      \\coordinate (node_R1.t) at (0,0.8);
    \\end{scope}

  \\begin{scope}[shift={(4.01,2.815)}]
      \\coordinate (node_D1.dot) at (0,0);
      \\draw[line width=0.32mm, fill=black] (0,0) circle (0.06);
      \\draw[line width=0.32mm, line cap=round] (0,0) -- (0.18,0);
      \\coordinate (node_D1.right) at (0.18,0);
    \\end{scope}

  \\begin{scope}[shift={(4.49,2.815)}]
      \\coordinate (node_R2.l) at (0,0);
      \\draw[line width=0.32mm, line cap=round] (0,0) -- (0.15,0);
      \\draw[line width=0.32mm] (0.15,-0.15) rectangle (0.65,0.15);
      \\node[node font=\\sffamily\\bfseries] at (0.4,0.41) {$R_{2}$};
      \\draw[line width=0.32mm, line cap=round] (0.65,0) -- (0.8,0);
      \\coordinate (node_R2.r) at (0.8,0);
    \\end{scope}

  \\draw[line width=0.32mm, line cap=round] (4.01,0.62) -- (4.01,1.398);
  \\draw[line width=0.32mm, line cap=round] (4.01,2.398) -- (4.01,3.28);
  \\draw[line width=0.32mm, line cap=round] (4.01,4.08) -- (4.01,4.56);
  \\draw[line width=0.32mm, line cap=round] (4.19,2.815) -- (4.49,2.815);
\\end{tikzpicture}`;

    const parsed = parseTikz(userCircuit, { recover: true });
    const semantic = evaluateTikzFigure(parsed.figure, userCircuit);
    const m1Scope = parsed.figure.body.find(
      (s: any) => s.kind === "Scope" && userCircuit.slice(s.span.from, s.span.to).includes("node_M1")
    );
    expect(m1Scope).toBeDefined();

    // 向左移动 M1 dx = -0.507 cm
    const result = applyEditAction(userCircuit, semantic.editHandles, {
      kind: "moveElements",
      elementIds: [m1Scope!.id],
      delta: wp(cm(-0.507), cm(0))
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    // 1. M1 向左平移至 2.77
    expect(result.newSource).toContain("shift={(2.77,1.9)}");
    // 2. GND, VDD, R1 同步平移至 3.5
    expect(result.newSource).toContain("shift={(3.5,0.62)}");
    expect(result.newSource).toContain("shift={(3.5,4.56)}");
    expect(result.newSource).toContain("shift={(3.5,3.28)}");
    // 3. 支路节点 node_D1 同步平移至 3.5！
    expect(result.newSource).toContain("shift={(3.5,2.82)}");
    // 4. 下游叶子电阻 node_R2 同步联动平移至 3.98！
    expect(result.newSource).toContain("shift={(3.98,2.82)}");
    // 5. 3 根竖直主干线均平移至 x = 3.5
    expect(result.newSource).toContain("(3.5,0.62) -- (3.5,1.4)");
    expect(result.newSource).toContain("(3.5,2.4) -- (3.5,3.28)");
    expect(result.newSource).toContain("(3.5,4.08) -- (3.5,4.56)");
    // 6. 水平引出导线两端平移为 (3.68, 2.82) -- (3.98, 2.82)，保持严格水平！
    expect(result.newSource).toContain("(3.68,2.82) -- (3.98,2.82)");
  });

  it("当支路下游元件连接多根导线（非叶子元件）时，支路节点平移而下游元件不动，引线自动弹性伸缩", () => {
    // 在用户电路基础上，R2 另一端连接到另一个元件 R3，使 R2 成为非叶子节点
    const circuitWithNonLeaf = `\\begin{tikzpicture}
  \\begin{scope}[shift={(3.28,1.898)}]
      \\coordinate (node_M1.g) at (0,0);
      \\draw[line width=0.32mm, line cap=round] (0,0) -- (0.26,0);
      \\coordinate (node_M1.d) at (0.73,0.5);
      \\coordinate (node_M1.s) at (0.73,-0.5);
    \\end{scope}
  \\begin{scope}[shift={(4.01,3.28)}]
      \\coordinate (node_R1.b) at (0,0);
      \\coordinate (node_R1.t) at (0,0.8);
    \\end{scope}
  \\begin{scope}[shift={(4.01,2.815)}]
      \\coordinate (node_D1.dot) at (0,0);
      \\draw[line width=0.32mm, fill=black] (0,0) circle (0.06);
      \\draw[line width=0.32mm, line cap=round] (0,0) -- (0.18,0);
      \\coordinate (node_D1.right) at (0.18,0);
    \\end{scope}
  \\begin{scope}[shift={(4.49,2.815)}]
      \\coordinate (node_R2.l) at (0,0);
      \\coordinate (node_R2.r) at (0.8,0);
    \\end{scope}
  \\begin{scope}[shift={(6.0,2.815)}]
      \\coordinate (node_R3.l) at (0,0);
    \\end{scope}

  \\draw[line width=0.32mm, line cap=round] (4.01,2.398) -- (4.01,3.28);
  \\draw[line width=0.32mm, line cap=round] (4.19,2.815) -- (4.49,2.815);
  \\draw[line width=0.32mm, line cap=round] (5.29,2.815) -- (6.0,2.815);
\\end{tikzpicture}`;

    const parsed = parseTikz(circuitWithNonLeaf, { recover: true });
    const semantic = evaluateTikzFigure(parsed.figure, circuitWithNonLeaf);
    const m1Scope = parsed.figure.body.find(
      (s: any) => s.kind === "Scope" && circuitWithNonLeaf.slice(s.span.from, s.span.to).includes("node_M1")
    );

    const result = applyEditAction(circuitWithNonLeaf, semantic.editHandles, {
      kind: "moveElements",
      elementIds: [m1Scope!.id],
      delta: wp(cm(-0.507), cm(0))
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    // 支路节点随主干线平移至 3.5
    expect(result.newSource).toContain("shift={(3.5,2.82)}");
    // R2 作为多端网络元件保持原位 4.49！
    expect(result.newSource).toContain("shift={(4.49,2.815)}");
    // 中间引出导线弹性伸缩：起点跟随 node_D1.right 移至 3.68，终点钉在 R2 原位 4.49！
    expect(result.newSource).toContain("(3.68,2.82) -- (4.49,2.82)");
  });
});




