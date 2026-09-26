import { describe, expect, it } from "vitest";
import { parseTikz } from "../packages/core/src/parser/index.js";
import { evaluateTikzFigure } from "../packages/core/src/semantic/evaluate.js";
import { collectInterComponentStraightWireSourceIds, findAllInterComponentStraightWires } from "../packages/core/src/edit/actions/wire-follow.js";
import { computeDragCapability } from "../packages/app/src/ui/canvas-panel/drag-capability.js";
import { resolveMoveAxisConstraintFromEditHandles } from "../packages/core/src/edit/snapping/move-axis.js";

describe("Marquee selection drag of RD and gm vgs", () => {
  const code = `\\begin{tikzpicture}
  \\begin{scope}[shift={(0, 2.5)}]
      \\coordinate (node_R1.b) at (0,0);
      \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,0.15) -- (0.15,0.19) -- (-0.15,0.27) -- (0.15,0.35) -- (-0.15,0.43) -- (0.15,0.51) -- (-0.15,0.59) -- (0,0.63) -- (0,0.78);
      \\node[right] at (0.25,0.39) {$R_{D}$};
      \\coordinate (node_R1.t) at (0,0.78);
  \\end{scope}

  \\draw[line width=0.32mm, line cap=round] (0, 2.5) -- (0, 2.0);
  \\draw[line width=0.32mm, fill=black] (0, 2.25) circle (0.06);

  \\begin{scope}[shift={(0, 2.0)}]
    \\coordinate (node_I1.top) at (0,0);
    \\draw[line cap=round, line width=0.32mm] (0,0) -- (0,-0.144);
    \\draw[line width=0.32mm] (0,-0.144) -- (0.24,-0.48) -- (0,-0.816) -- (-0.24,-0.48) -- cycle;
    \\draw[-{Triangle[length=2.16mm, width=2.04mm]}, line width=0.32mm] (0,-0.30) -- (0,-0.66);
    \\node[right=0.144cm] at (0.24,-0.48) {\\normalsize $g_{m}v_{gs}$};
    \\draw[line width=0.32mm, line cap=round] (0,-0.816) -- (0,-0.96);
    \\coordinate (node_I1.bottom) at (0,-0.96);
  \\end{scope}
\\end{tikzpicture}`;

  it("inspects draggableSourceIds, interComponent wires, and moveAxis", async () => {
    const parsed = parseTikz(code, { recover: true });
    const sem = evaluateTikzFigure(parsed.figure, code);

    const interWires = findAllInterComponentStraightWires(parsed.figure.body, sem.editHandles, code);
    console.log("Inter-component wires:", interWires);

    const wireIds = collectInterComponentStraightWireSourceIds(parsed.figure.body, sem.editHandles, code);
    console.log("Inter-component wire IDs:", Array.from(wireIds));

    const cap = computeDragCapability(sem.editHandles);
    console.log("Base draggableSourceIds:", Array.from(cap.draggableSourceIds));

    const scopeR1 = parsed.figure.body.find((s: any) => s.kind === "Scope" && code.slice(s.span.from, s.span.to).includes("node_R1"));
    const scopeI1 = parsed.figure.body.find((s: any) => s.kind === "Scope" && code.slice(s.span.from, s.span.to).includes("node_I1"));
    const midWire = parsed.figure.body.find((s: any) => s.kind === "Path" && s.command === "draw");

    const allScopeR1SourceIds = parsed.figure.body
      .filter((s: any) => s.kind === "Scope" && code.slice(s.span.from, s.span.to).includes("node_R1"))
      .flatMap((s: any) => [s.id, ...s.body.map((c: any) => c.id)]);

    const allScopeI1SourceIds = parsed.figure.body
      .filter((s: any) => s.kind === "Scope" && code.slice(s.span.from, s.span.to).includes("node_I1"))
      .flatMap((s: any) => [s.id, ...s.body.map((c: any) => c.id)]);

    console.log("Scope R1 source IDs:", allScopeR1SourceIds);
    console.log("Scope I1 source IDs:", allScopeI1SourceIds);

    const pointsBySource = new Map<string, any[]>();
    for (const handle of sem.editHandles) {
      if (handle.kind !== "path-point") continue;
      const sourceId = handle.sourceRef.sourceId.trim();
      if (!allScopeR1SourceIds.includes(sourceId) && !allScopeI1SourceIds.includes(sourceId)) continue;
      if (!pointsBySource.has(sourceId)) pointsBySource.set(sourceId, []);
      pointsBySource.get(sourceId)!.push(handle.world);
    }
    console.log("pointsBySource keys:", Array.from(pointsBySource.keys()));
    const { resolveEffectiveDraggedIds } = await import("../packages/app/src/ui/canvas-panel/useCanvasElementInteractions.js");
    const { buildScopeOverlayIndex } = await import("../packages/app/src/ui/canvas-panel/scope-overlay.js");

    const scopeOverlay = buildScopeOverlayIndex(parsed.figure.body, new Map());
    const draggableSourceIds = new Set<string>(["scope:0", "scope:7", "path:6"]); // scopes and dot

    // Test 1: Marquee captures both scopes and the interconnecting wire
    const effectiveWithInternalWire = resolveEffectiveDraggedIds({
      draggedIds: ["scope:0", "scope:7", "path:5", "path:6"],
      draggableSourceIds,
      snapshot: {
        source: code,
        parseResult: parsed,
        editHandles: sem.editHandles,
        scene: sem.scene,
        figures: [{ id: "fig-0", code, parseResult: parsed, scene: sem.scene, editHandles: sem.editHandles }]
      } as any,
      scopeOverlay
    });
    expect(effectiveWithInternalWire).toContain("scope:0");
    expect(effectiveWithInternalWire).toContain("scope:7");
    expect(effectiveWithInternalWire).toContain("path:5");
    expect(effectiveWithInternalWire).toContain("path:6");

    // Test 2: Marquee captures a single wire alone -> must be blocked (empty effective)
    const effectiveSingleWire = resolveEffectiveDraggedIds({
      draggedIds: ["path:5"],
      draggableSourceIds,
      snapshot: {
        source: code,
        parseResult: parsed,
        editHandles: sem.editHandles,
        scene: sem.scene,
        figures: []
      } as any,
      scopeOverlay
    });
    expect(effectiveSingleWire).toEqual([]);

    // Test 3: Moving elements horizontally with internal wire succeeds
    const { applyEditAction } = await import("../packages/core/src/edit/actions.js");
    const { wp } = await import("./coords-helpers.js");
    const { cm } = await import("./edit-actions-helpers.js");

    const moveRes = applyEditAction(code, sem.editHandles, {
      kind: "moveElements",
      elementIds: effectiveWithInternalWire,
      delta: wp(cm(1), cm(0))
    });
    expect(moveRes.kind).toBe("success");
    if (moveRes.kind === "success") {
      expect(moveRes.newSource).toContain("\\begin{scope}[shift={(1,2.5)}]");
      expect(moveRes.newSource).toContain("\\draw[line width=0.32mm, line cap=round] (1, 2.5) -- (1, 2);");
      expect(moveRes.newSource).toContain("\\begin{scope}[shift={(1,2)}]");
    }
  });
});
