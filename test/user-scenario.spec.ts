import { describe, expect, it } from "vitest";
import { applyEditAction } from "../packages/core/src/edit/actions.js";
import { parseTikz } from "../packages/core/src/parser/index.js";
import { evaluateTikzFigure } from "../packages/core/src/semantic/evaluate.js";
import { wp } from "./coords-helpers.js";
import { cm } from "./edit-actions-helpers.js";

describe("User scenario: Left/Right/Up shift with minimum wire length constraint", () => {
  const code = `\\begin{tikzpicture}
  \\begin{scope}[shift={(-6.572,1.72)}]
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

  \\draw[line width=0.32mm, line cap=round] (-5.85,2.22) -- (-5.85,2.52);

  \\begin{scope}[shift={(-5.842,2.52)}]
      \\coordinate (node_R1.b) at (0,0);
      \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,0.15) -- (0.15,0.19) -- (-0.15,0.27) -- (0.15,0.35) -- (-0.15,0.43) -- (0.15,0.51) -- (-0.15,0.59) -- (0,0.63) -- (0,0.78);
      \\node[right] at (0.25,0.39) {$R_{D}$};
      \\coordinate (node_R1.t) at (0,0.78);
    \\end{scope}

  \\draw[line width=0.32mm, line cap=round] (-6.57,1.72) -- (-6.87,1.72);

  \\begin{scope}[shift={(-7.47,1.72)}]
      \\node at (-0.01,-0.30) {$V_{in}$};
      \\draw[line width=0.32mm, line cap=round] (0.15,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.6,0);
      \\coordinate (node_IO1.port) at (0.6,0);
    \\end{scope}
\\end{tikzpicture}`;

  it("当向左平移 M1 触发 Vin 连接线最小限制时，M1 与 RD 保持同频限幅，连线严格垂直", () => {
    const parsed = parseTikz(code, { recover: true });
    const sem = evaluateTikzFigure(parsed.figure, code);
    const m1 = parsed.figure.body.find(
      (s: any) => s.kind === "Scope" && code.slice(s.span.from, s.span.to).includes("node_M1")
    );

    // 试图向左拖拽 1cm，但 Vin 连线原长 0.30cm，最小线长 0.10cm，应限幅在 dx = -0.20cm
    const res = applyEditAction(code, sem.editHandles, {
      kind: "moveElements",
      elementIds: [m1!.id],
      delta: wp(cm(-1), cm(0))
    });

    expect(res.kind).toBe("success");
    if (res.kind !== "success") return;

    // 1. M1 限幅在 dx = -0.20cm: (-6.572 -> -6.77)
    expect(res.newSource).toContain("shift={(-6.77,1.72)}");
    // 2. RD 随动限幅在 dx = -0.20cm: (-5.842 -> -6.04)
    expect(res.newSource).toContain("shift={(-6.04,2.52)}");
    // 3. M1 到 RD 的垂直连线两端 x 完全一致为 -6.05，严格垂直无倾斜！
    expect(res.newSource).toContain("(-6.05,2.22) -- (-6.05,2.52)");
    // 4. Vin 连线缩短至 0.10cm 极限：(-6.77,1.72) -- (-6.87,1.72)
    expect(res.newSource).toContain("(-6.77,1.72) -- (-6.87,1.72)");
  });

  it("向右平移 M1 时，RD 与连线同步右移，完全垂直", () => {
    const parsed = parseTikz(code, { recover: true });
    const sem = evaluateTikzFigure(parsed.figure, code);
    const m1 = parsed.figure.body.find(
      (s: any) => s.kind === "Scope" && code.slice(s.span.from, s.span.to).includes("node_M1")
    );

    const res = applyEditAction(code, sem.editHandles, {
      kind: "moveElements",
      elementIds: [m1!.id],
      delta: wp(cm(0.5), cm(0))
    });

    expect(res.kind).toBe("success");
    if (res.kind !== "success") return;

    // 1. M1 右移 0.5cm: (-6.572 -> -6.07)
    expect(res.newSource).toContain("shift={(-6.07,1.72)}");
    // 2. RD 同步右移 0.5cm: (-5.842 -> -5.34)
    expect(res.newSource).toContain("shift={(-5.34,2.52)}");
    // 3. 连线两端 x 一致为 -5.35，严格垂直！
    expect(res.newSource).toContain("(-5.35,2.22) -- (-5.35,2.52)");
    // 4. Vin 连线拉长为 0.80cm: (-6.07,1.72) -- (-6.87,1.72)
    expect(res.newSource).toContain("(-6.07,1.72) -- (-6.87,1.72)");
  });

  it("向上平移 M1 触发 RD 连接线最小限制时，Vin 同步向上限幅，保持严格水平", () => {
    const parsed = parseTikz(code, { recover: true });
    const sem = evaluateTikzFigure(parsed.figure, code);
    const m1 = parsed.figure.body.find(
      (s: any) => s.kind === "Scope" && code.slice(s.span.from, s.span.to).includes("node_M1")
    );

    // 向上移动 M1 试图移 0.5cm，但 M1.d 到 RD.b 垂直连线原长 0.30cm，最小线长 0.10cm，应限幅在 dy = +0.20cm
    const res = applyEditAction(code, sem.editHandles, {
      kind: "moveElements",
      elementIds: [m1!.id],
      delta: wp(cm(0), cm(0.5))
    });

    expect(res.kind).toBe("success");
    if (res.kind !== "success") return;

    // 1. M1 限幅在 dy = +0.20cm: (1.72 -> 1.92)
    expect(res.newSource).toContain("shift={(-6.57,1.92)}");
    // 2. Vin 随同向上平移 0.20cm: (1.72 -> 1.92)
    expect(res.newSource).toContain("shift={(-7.47,1.92)}");
    // 3. Vin 连线两端 y 坐标完全一致为 1.92，保持严格水平！
    expect(res.newSource).toContain("(-6.57,1.92) -- (-6.87,1.92)");
    // 4. M1 到 RD 的垂直连线缩短至 0.10cm: (-5.85,2.42) -- (-5.85,2.52)
    expect(res.newSource).toContain("(-5.85,2.42) -- (-5.85,2.52)");
  });

  it("平移 M1 时，VDD 与 RD、垂直连线同步横向平移", async () => {
    const codeWithVdd = `\\begin{tikzpicture}
  \\begin{scope}[shift={(-6.572,1.72)}]
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

  \\draw[line width=0.32mm, line cap=round] (-5.85,2.22) -- (-5.85,2.52);

  \\begin{scope}[shift={(-5.842,2.52)}]
      \\coordinate (node_R1.b) at (0,0);
      \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,0.15) -- (0.15,0.19) -- (-0.15,0.27) -- (0.15,0.35) -- (-0.15,0.43) -- (0.15,0.51) -- (-0.15,0.59) -- (0,0.63) -- (0,0.78);
      \\node[right] at (0.25,0.39) {$R_{D}$};
      \\coordinate (node_R1.t) at (0,0.78);
    \\end{scope}

  \\draw[line width=0.32mm, line cap=round] (-5.85,3.30) -- (-5.85,3.60);

  \\begin{scope}[shift={(-5.842,3.60)}]
      \\coordinate (node_VDD.bottom) at (0,0);
      \\draw[ultra thick] (-0.95,0) -- (0.9,0);
      \\node[draw=none] at (1.2,0) {$V_{DD}$};
    \\end{scope}

  \\draw[line width=0.32mm, line cap=round] (-6.57,1.72) -- (-6.87,1.72);

  \\begin{scope}[shift={(-7.47,1.72)}]
      \\node at (-0.01,-0.30) {$V_{in}$};
      \\draw[line width=0.32mm, line cap=round] (0.15,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.6,0);
      \\coordinate (node_IO1.port) at (0.6,0);
    \\end{scope}
\\end{tikzpicture}`;

    const parsed = parseTikz(codeWithVdd, { recover: true });
    const sem = evaluateTikzFigure(parsed.figure, codeWithVdd);
    const m1 = parsed.figure.body.find(
      (s: any) => s.kind === "Scope" && codeWithVdd.slice(s.span.from, s.span.to).includes("node_M1")
    );

    const res = applyEditAction(codeWithVdd, sem.editHandles, {
      kind: "moveElements",
      elementIds: [m1!.id],
      delta: wp(cm(0.5), cm(0))
    });

    expect(res.kind).toBe("success");
    if (res.kind !== "success") return;

    console.log("res.newSource:\n", res.newSource);
    // VDD should follow in X: (-5.842 -> -5.34)
    expect(res.newSource).toContain("shift={(-5.34,3.6)}");
    expect(res.newSource).toContain("(-5.35,3.3) -- (-5.35,3.6)");

    const { detectRigidLeafBranches, findAttachedWiresForTransientDrag } = await import("../packages/core/src/edit/actions/wire-follow.js");
    const rigid = detectRigidLeafBranches(codeWithVdd, parsed.figure.body, sem.editHandles, [m1!.id], wp(cm(1), cm(1)));
    console.log("rigidBranches:", JSON.stringify(rigid, null, 2));

    const attached = findAttachedWiresForTransientDrag(codeWithVdd, sem.editHandles, [m1!.id], [m1!.id]);
    console.log("attachedWires:", JSON.stringify(attached, null, 2));

    console.log("sem keys:", Object.keys(sem));
    if ((sem as any).scene) {
      const { emitSvgModel } = await import("../packages/core/src/svg/emit.js");
      const { worldToSvgPoint } = await import("../packages/app/src/ui/canvas-panel/geometry.js");
      const svgModel = emitSvgModel((sem as any).scene);
      const wire22Part = svgModel.parts.find(p => (p as any).sourceId === "path:22");
      console.log("wire22Part markup:", wire22Part?.markup);
      const wire11Part = svgModel.parts.find(p => (p as any).sourceId === "path:11");
      console.log("wire11Part markup:", wire11Part?.markup);

      const viewBox = svgModel.viewBox;
      console.log("viewBox:", viewBox);
      const movingSvg22 = worldToSvgPoint(attached[1].movingEndpointWorld, viewBox);
      const staticSvg22 = worldToSvgPoint(attached[1].staticEndpointWorld, viewBox);
      console.log("wire22 movingSvg:", movingSvg22, "staticSvg:", staticSvg22);
    }
  });

  it("Request 2 代码分析: 检查 M1 拖拽时 attachedWires 和 rigidBranches", async () => {
    const codeReq2 = `\\begin{tikzpicture}
  \\begin{scope}[shift={(-5.266,1.72)}]
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

  \\draw[line width=0.32mm, line cap=round] (-5.26,1.72) -- (-6.87,1.72);

  \\begin{scope}[shift={(-7.47,1.72)}]
      \\node at (-0.01,-0.30) {$V_{in}$};
      \\draw[line width=0.32mm, line cap=round] (0.15,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.6,0);
      \\coordinate (node_IO1.port) at (0.6,0);
    \\end{scope}

  \\draw[line width=0.32mm, line cap=round] (-4.53,2.22) -- (-4.53,2.52);

  \\begin{scope}[shift={(-4.536,2.52)}]
      \\coordinate (node_R1.b) at (0,0);
      \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,0.15) -- (0.15,0.19) -- (-0.15,0.27) -- (0.15,0.35) -- (-0.15,0.43) -- (0.15,0.51) -- (-0.15,0.59) -- (0,0.63) -- (0,0.78);
      \\node[right] at (0.25,0.39) {$R_{D}$};
      \\coordinate (node_R1.t) at (0,0.78);
    \\end{scope}

  \\draw[line width=0.32mm, line cap=round] (-4.53,3.3) -- (-4.53,3.6);

  \\begin{scope}[shift={(-4.536,3.6)}]
      \\coordinate (node_R2.b) at (0,0);
      \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,0.15) -- (0.15,0.19) -- (-0.15,0.27) -- (0.15,0.35) -- (-0.15,0.43) -- (0.15,0.51) -- (-0.15,0.59) -- (0,0.63) -- (0,0.78);
      \\node[right] at (0.25,0.39) {$R_{D}$};
      \\coordinate (node_R2.t) at (0,0.78);
    \\end{scope}

  \\draw[line width=0.32mm, line cap=round] (-4.53,4.38) -- (-4.53,4.68);

  \\begin{scope}[shift={(-4.531,4.68)}]
      \\coordinate (node_R3.b) at (0,0);
      \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,0.15) -- (0.15,0.19) -- (-0.15,0.27) -- (0.15,0.35) -- (-0.15,0.43) -- (0.15,0.51) -- (-0.15,0.59) -- (0,0.63) -- (0,0.78);
      \\node[right] at (0.25,0.39) {$R_{D}$};
      \\coordinate (node_R3.t) at (0,0.78);
    \\end{scope}
\\end{tikzpicture}`;

    const parsed = parseTikz(codeReq2, { recover: true });
    const sem = evaluateTikzFigure(parsed.figure, codeReq2);
    const m1 = parsed.figure.body.find(
      (s: any) => s.kind === "Scope" && codeReq2.slice(s.span.from, s.span.to).includes("node_M1")
    );

    const { detectRigidLeafBranches, findAttachedWiresForTransientDrag } = await import("../packages/core/src/edit/actions/wire-follow.js");
    const rigid = detectRigidLeafBranches(codeReq2, parsed.figure.body, sem.editHandles, [m1!.id], wp(cm(1), cm(1)));
    console.log("Req2 rigidBranches:", JSON.stringify(rigid, null, 2));

    const attached = findAttachedWiresForTransientDrag(codeReq2, sem.editHandles, [m1!.id], [m1!.id]);
    console.log("Req2 attachedWires:", JSON.stringify(attached, null, 2));
  });
});

