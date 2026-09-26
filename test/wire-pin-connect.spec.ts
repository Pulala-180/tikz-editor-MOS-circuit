import { describe, expect, it } from "vitest";
import * as fs from "fs";
import { parseTikz } from "../packages/core/src/parser/index.js";
import { evaluateTikzFigure } from "../packages/core/src/semantic/evaluate.js";
import { applyEditAction } from "../packages/core/src/edit/actions.js";

describe("wire to pin connect & reorder", () => {
  it("connects wire to node_M1.d and moves wire statement after M1 scope", () => {
    const source = fs.readFileSync("apps/web/agent-sync/active-drawing.tex", "utf8");
    const parsed = parseTikz(source, { recover: true });
    const semantic = evaluateTikzFigure(parsed.figure, source);

    // Find the wire in line 52: (1.8, 5.0) -- (1.8, 3.9)
    const wire = parsed.figure.body.find(
      (s: any) =>
        s.kind === "Path" &&
        s.command === "draw" &&
        s.items.some((it: any) => it.kind === "Coordinate" && it.y === "3.9")
    );
    expect(wire).toBeDefined();

    const wireHandles = semantic.editHandles.filter((h) => h.sourceRef.sourceId === wire?.id);
    const bottomHandle = wireHandles.find((h) => Math.abs(h.world.y - 3.9 * 28.4527559) < 2);
    expect(bottomHandle).toBeDefined();

    const res = applyEditAction(source, semantic.editHandles, {
      kind: "connectHandle",
      handleId: bottomHandle!.id,
      nodeName: "node_M1",
      anchor: "d"
    });

    expect(res.kind).toBe("success");
    if (res.kind === "success") {
      expect(res.newSource).toContain("(node_M1.d)");
      const lines = res.newSource.split("\n");
      const m1EndScopeIndex = lines.findIndex((l) => l.includes("\\coordinate (node_M1.s)"));
      const wireIndex = lines.findIndex((l) => l.includes("\\draw") && l.includes("(node_M1.d)"));
      expect(wireIndex).toBeGreaterThan(m1EndScopeIndex);

      // Verify the new source parses and evaluates without errors
      const newParsed = parseTikz(res.newSource, { recover: true });
      const newSemantic = evaluateTikzFigure(newParsed.figure, res.newSource);
      const newWire = newParsed.figure.body.find((s: any) =>
        s.items?.some((it: any) => it.raw?.includes("node_M1.d") || it.x === "node_M1.d")
      );
      expect(newWire).toBeDefined();
    }
  });

  it("smooth multi-frame drag simulation: moveHandle updates continuously across frames and connects on pointerup", () => {
    const originalSource = fs.readFileSync("apps/web/agent-sync/active-drawing.tex", "utf8");
    const parsed0 = parseTikz(originalSource, { recover: true });
    const semantic0 = evaluateTikzFigure(parsed0.figure, originalSource);

    // Find the wire: (1.8, 5.0) -- (1.8, 3.9)
    const wire0 = parsed0.figure.body.find(
      (s: any) =>
        s.kind === "Path" &&
        s.command === "draw" &&
        s.items.some((it: any) => it.kind === "Coordinate" && it.y === "3.9")
    );
    expect(wire0).toBeDefined();

    const wireHandles0 = semantic0.editHandles.filter((h) => h.sourceRef.sourceId === wire0?.id);
    const bottomHandle0 = wireHandles0.find((h) => Math.abs(h.world.y - 3.9 * 28.4527559) < 2);
    expect(bottomHandle0).toBeDefined();

    // Frame 1: drag handle to y = 4.5
    const frame1Res = applyEditAction(originalSource, semantic0.editHandles, {
      kind: "moveHandle",
      handleId: bottomHandle0!.id,
      newWorld: { x: bottomHandle0!.world.x, y: 4.5 * 28.4527559 }
    });
    expect(frame1Res.kind).toBe("success");
    if (frame1Res.kind !== "success") return;
    expect(frame1Res.newSource).toContain("1.8,4.5");

    // Frame 2: state updates, re-evaluate handles from frame 1 source, drag to y = 4.2
    const parsed1 = parseTikz(frame1Res.newSource, { recover: true });
    const semantic1 = evaluateTikzFigure(parsed1.figure, frame1Res.newSource);
    const bottomHandle1 = semantic1.editHandles.find((h) => Math.abs(h.world.y - 4.5 * 28.4527559) < 2);
    expect(bottomHandle1).toBeDefined();

    const frame2Res = applyEditAction(frame1Res.newSource, semantic1.editHandles, {
      kind: "moveHandle",
      handleId: bottomHandle1!.id,
      newWorld: { x: bottomHandle1!.world.x, y: 4.2 * 28.4527559 }
    });
    expect(frame2Res.kind).toBe("success");
    if (frame2Res.kind !== "success") return;
    expect(frame2Res.newSource).toContain("1.8,4.2");

    // Frame 3: drag further down to y = 3.9 (snapping to pin location)
    const parsed2 = parseTikz(frame2Res.newSource, { recover: true });
    const semantic2 = evaluateTikzFigure(parsed2.figure, frame2Res.newSource);
    const bottomHandle2 = semantic2.editHandles.find((h) => Math.abs(h.world.y - 4.2 * 28.4527559) < 2);
    expect(bottomHandle2).toBeDefined();

    const frame3Res = applyEditAction(frame2Res.newSource, semantic2.editHandles, {
      kind: "moveHandle",
      handleId: bottomHandle2!.id,
      newWorld: { x: bottomHandle2!.world.x, y: 3.9 * 28.4527559 }
    });
    expect(frame3Res.kind).toBe("success");
    if (frame3Res.kind !== "success") return;
    expect(frame3Res.newSource).toContain("1.8,3.9");

    // Frame 4 (Pointer Up): snap committed to node_M1.d
    const parsed3 = parseTikz(frame3Res.newSource, { recover: true });
    const semantic3 = evaluateTikzFigure(parsed3.figure, frame3Res.newSource);
    const bottomHandle3 = semantic3.editHandles.find((h) => Math.abs(h.world.y - 3.9 * 28.4527559) < 2);
    expect(bottomHandle3).toBeDefined();

    const connectRes = applyEditAction(frame3Res.newSource, semantic3.editHandles, {
      kind: "connectHandle",
      handleId: bottomHandle3!.id,
      nodeName: "node_M1",
      anchor: "d"
    });
    expect(connectRes.kind).toBe("success");
    if (connectRes.kind === "success") {
      expect(connectRes.newSource).toContain("(node_M1.d)");
      const lines = connectRes.newSource.split("\n");
      const m1EndScopeIndex = lines.findIndex((l) => l.includes("\\coordinate (node_M1.s)"));
      const wireIndex = lines.findIndex((l) => l.includes("\\draw") && l.includes("(node_M1.d)"));
      expect(wireIndex).toBeGreaterThan(m1EndScopeIndex);
    }
  });
});
