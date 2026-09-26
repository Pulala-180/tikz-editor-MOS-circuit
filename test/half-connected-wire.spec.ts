import { describe, expect, it } from "vitest";
import { applyEditAction } from "../packages/core/src/edit/actions.js";
import { parseTikz } from "../packages/core/src/parser/index.js";
import { evaluateTikzFigure } from "../packages/core/src/semantic/evaluate.js";
import {
  findHalfConnectedStraightWireConnection,
  findAllHalfConnectedStraightWires,
  collectHalfConnectedStraightWireLockedHandleIds,
  findInterComponentStraightWireConnection,
  INTER_COMPONENT_STRAIGHT_WIRE_BLOCK_REASON
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

function componentAt(id: string, x: number, y: number): string {
  return `\\begin{scope}[shift={(${x},${y})}]
    \\draw[thick] (0,0) -- (0.8,0.8);
    \\coordinate (node_${id}.top) at (0,0.8);
    \\coordinate (node_${id}.bottom) at (0,0);
  \\end{scope}`;
}

describe("半连接单段直线导线行为规范", () => {
  it("正确识别一端连接元件、一端自由的单段直线导线", () => {
    // Component A at (0, 2). Wire starts from node_A.bottom (0,2) and goes down to (0, 1) free end.
    const source = `${componentAt("A", 0, 2)}
\\draw[thick] (node_A.bottom) -- (0,1);`;
    const wrapped = `\\begin{tikzpicture}\n${source}\\end{tikzpicture}\n`;
    const parsed = parseTikz(wrapped, { recover: true });
    const semantic = evaluateTikzFigure(parsed.figure, wrapped);

    const wireStmt = parsed.figure.body.find(
      (s: any) => s.kind === "Path" && s.command === "draw" && s.id !== parsed.figure.body[0]?.id
    );
    expect(wireStmt).toBeDefined();

    const halfConn = findHalfConnectedStraightWireConnection(
      wireStmt!,
      parsed.figure.body,
      semantic.editHandles,
      wrapped
    );

    expect(halfConn).not.toBeNull();
    expect(halfConn?.connectedEndpointIndex).toBe(0);
    expect(halfConn?.freeEndpointIndex).toBe(1);
    expect(halfConn?.isAxisAligned).toBe("v");
  });

  it("已连接端 Handle 被加入锁定集合，禁止自由拖拽", () => {
    const source = `${componentAt("A", 0, 2)}
\\draw[thick] (node_A.bottom) -- (0,1);`;
    const wrapped = `\\begin{tikzpicture}\n${source}\\end{tikzpicture}\n`;
    const parsed = parseTikz(wrapped, { recover: true });
    const semantic = evaluateTikzFigure(parsed.figure, wrapped);

    const lockedHandles = collectHalfConnectedStraightWireLockedHandleIds(
      parsed.figure.body,
      semantic.editHandles,
      wrapped
    );

    const wireStmt = parsed.figure.body.find(
      (s: any) => s.kind === "Path" && s.command === "draw"
    );
    expect(wireStmt).toBeDefined();

    expect(lockedHandles.size).toBe(1);
    const wireHandles = semantic.editHandles.filter(
      (h) => h.kind === "path-point" && h.sourceRef.sourceId === wireStmt!.id
    );
    const connHandle = wireHandles.find((h) => lockedHandles.has(h.id));
    expect(connHandle).toBeDefined();
  });

  it("移动已连接元件时，导线已连接端跟随位移伸长/缩短，自由端坐标保持不变", () => {
    const source = `${componentAt("A", 0, 2)}
\\draw[thick] (0,2) -- (0,1);`;
    const wrapped = `\\begin{tikzpicture}\n${source}\\end{tikzpicture}\n`;
    const parsed = parseTikz(wrapped, { recover: true });
    const scopeA = parsed.figure.body.find((s: any) => s.kind === "Scope");

    // Move component A upward by 1cm: (0, 2) -> (0, 3)
    const { result } = move(source, [scopeA.id], 0, 1);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.newSource).toContain("shift={(0,3)}");
    // Wire connected endpoint stretched to (0,3), while free endpoint remains at (0,1)
    expect(result.newSource).toContain("\\draw[thick] (0,3) -- (0,1);");
  });

  it("当自由端吸附并连接到另一元件后，自动升级为两元件间直线并受死命令保护", () => {
    // Initially wire is half-connected between A and free point (0, 0.8)
    const source = `${componentAt("A", 0, 2)}
${componentAt("B", 0, 0)}
\\draw[thick] (node_A.bottom) -- (0,0.8);`;
    const wrapped = `\\begin{tikzpicture}\n${source}\\end{tikzpicture}\n`;
    const parsed = parseTikz(wrapped, { recover: true });
    const semantic = evaluateTikzFigure(parsed.figure, wrapped);

    const wireStmt = parsed.figure.body.find(
      (s: any) => s.kind === "Path" && s.command === "draw"
    );
    expect(wireStmt).toBeDefined();

    const wireHandles = semantic.editHandles.filter(
      (h) => h.kind === "path-point" && h.sourceRef.sourceId === wireStmt!.id
    );
    // Find free handle at (0, 0.8)
    const freeHandle = wireHandles.find((h) => Math.abs(h.world.y - 0.8 * 28.4527559) < 2.0);
    expect(freeHandle).toBeDefined();

    // Connect handle to node_B.top
    const connectResult = applyEditAction(wrapped, semantic.editHandles, {
      kind: "connectHandle",
      handleId: freeHandle!.id,
      nodeName: "node_B",
      anchor: "top"
    });

    expect(connectResult.kind).toBe("success");
    if (connectResult.kind !== "success") return;
    expect(connectResult.newSource).toContain("\\draw[thick] (node_A.bottom) -- (node_B.top);");

    // Re-parse and verify it is now locked under inter-component dead command
    const updatedParsed = parseTikz(connectResult.newSource, { recover: true });
    const updatedSemantic = evaluateTikzFigure(updatedParsed.figure, connectResult.newSource);
    const updatedWire = updatedParsed.figure.body.find(
      (s: any) => s.kind === "Path" && s.command === "draw" && !s.id.includes("scope")
    );

    expect(
      findInterComponentStraightWireConnection(
        updatedWire!,
        updatedParsed.figure.body,
        updatedSemantic.editHandles,
        connectResult.newSource
      )
    ).not.toBeNull();

    // Moving this wire directly is now blocked
    const moveBlocked = applyEditAction(connectResult.newSource, updatedSemantic.editHandles, {
      kind: "moveElements",
      elementIds: [updatedWire!.id],
      delta: wp(cm(1), cm(0))
    });

    expect(moveBlocked.kind).toBe("unsupported");
    if (moveBlocked.kind === "unsupported") {
      expect(moveBlocked.reason).toBe(INTER_COMPONENT_STRAIGHT_WIRE_BLOCK_REASON);
    }
  });
});
