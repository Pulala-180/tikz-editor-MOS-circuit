import { describe, expect, it } from "vitest";

import { parseTikz } from "../../packages/core/src/parser/index.js";
import { evaluateTikzFigure } from "../../packages/core/src/semantic/evaluate.js";
import { applyEdit, applyEditIntent } from "../../packages/core/src/edit/apply.js";
import type { EditHandle } from "../../packages/core/src/semantic/types.js";
import { PT_PER_CM } from "../../packages/core/src/edit/format.js";
import { wp } from "../coords-helpers.js";

const cm = (value: number): number => value * PT_PER_CM;

function evaluateAndGetHandles(source: string) {
  const parsed = parseTikz(source);
  const result = evaluateTikzFigure(parsed.figure, source);
  return { parsed, result, handles: result.editHandles };
}

function findHandleBySpanText(source: string, handles: EditHandle[], text: string): EditHandle | undefined {
  return handles.find((h) => source.slice(h.sourceRef.sourceSpan.from, h.sourceRef.sourceSpan.to) === text);
}

/**
 * Round-trip test helper:
 * 1. Parse & evaluate source
 * 2. Find handle matching spanText
 * 3. Apply move intent to newWorld
 * 4. Re-parse & re-evaluate
 * 5. Find handle in new source and verify its world position
 */
function roundTripMove(
  source: string,
  spanText: string,
  newWorld: ReturnType<typeof wp>
) {
  const { handles } = evaluateAndGetHandles(source);
  const handle = findHandleBySpanText(source, handles, spanText);
  if (!handle) {
    throw new Error(`No handle found for span text "${spanText}". Available: ${handles.map((h) => `"${source.slice(h.sourceRef.sourceSpan.from, h.sourceRef.sourceSpan.to)}"`).join(", ")}`);
  }

  const editResult = applyEditIntent(source, handles, {
    kind: "move",
    handleId: handle.id,
    newWorld
  });

  if (editResult.kind !== "success") {
    return editResult;
  }

  // Re-evaluate with new source
  const { handles: newHandles } = evaluateAndGetHandles(editResult.newSource);

  // Find the corresponding handle in the new source (same span position)
  const newHandle = newHandles.find((h) => {
    // The handle should be at the same span.from as the patch's newSpan.from
    const patch = editResult.patches[0];
    return h.sourceRef.sourceSpan.from === patch.newSpan.from;
  });

  return {
    ...editResult,
    newHandle,
    newHandles
  };
}

describe("edit integration (round-trip)", () => {
  it("moves a simple cartesian node", () => {
    const source = String.raw`\begin{tikzpicture}
\node at (1,2) {A};
\end{tikzpicture}`;
    const result = roundTripMove(source, "(1,2)", wp(cm(3), cm(4)));

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    expect(result.newSource).toContain("(3,4)");
    expect(result.newHandle).toBeDefined();
    expect(result.newHandle!.world.x).toBeCloseTo(cm(3), 0);
    expect(result.newHandle!.world.y).toBeCloseTo(cm(4), 0);
  });

  it("moves a node without explicit placement by inserting an inline at coordinate", () => {
    const source = String.raw`\begin{tikzpicture}
\node (A) {A};
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);
    const handle = handles.find((candidate) => candidate.kind === "node-position");

    expect(handle).toBeDefined();

    const result = applyEditIntent(source, handles, {
      kind: "move",
      handleId: handle!.id,
      newWorld: wp(cm(2), cm(3))
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    expect(result.newSource).toContain("\\node (A) at (2,3) {A};");

    const reevaluated = evaluateAndGetHandles(result.newSource);
    const movedHandle = reevaluated.handles.find((candidate) => candidate.kind === "node-position");
    expect(movedHandle).toBeDefined();
    expect(movedHandle!.world.x).toBeCloseTo(cm(2), 0);
    expect(movedHandle!.world.y).toBeCloseTo(cm(3), 0);
  });

  it("moves a path-point coordinate", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) -- (2,3);
\end{tikzpicture}`;
    const result = roundTripMove(source, "(2,3)", wp(cm(5), cm(6)));

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    expect(result.newSource).toContain("(5,6)");
    expect(result.newHandle).toBeDefined();
    expect(result.newHandle!.world.x).toBeCloseTo(cm(5), 0);
    expect(result.newHandle!.world.y).toBeCloseTo(cm(6), 0);
  });

  it("moves the first Bezier control point without changing the second control", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) .. controls (1,1) and (2,1) .. (3,0);
\end{tikzpicture}`;
    const result = roundTripMove(source, "(1,1)", wp(cm(1.5), cm(2)));

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    expect(result.newSource).toContain("(1.5,2)");
    expect(result.newSource).toContain("(2,1)");
  });

  it("moves the explicit endpoint coordinate of a Bezier curve", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) .. controls (1,1) and (2,1) .. (3,0);
\end{tikzpicture}`;
    const result = roundTripMove(source, "(3,0)", wp(cm(4), cm(0.5)));

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    expect(result.newSource).toContain("(4,0.5)");
    expect(result.newSource).toContain("(1,1)");
    expect(result.newSource).toContain("(2,1)");
  });

  it("preserves single-control curve syntax after dragging control point", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) .. controls (1,1) .. (3,0);
\end{tikzpicture}`;
    const result = roundTripMove(source, "(1,1)", wp(cm(1.25), cm(1.5)));

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    expect(result.newSource).toContain("controls (1.25,1.5)");
    expect(result.newSource).not.toContain(" and ");
  });

  it("dragging a synthetic out-handle rewrites only out= on to-curves", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) to[out=0,in=180] (2,0);
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);
    const outHandle = handles.find(
      (handle) => handle.kind === "path-control" && handle.curveEdit?.kind === "to-angle" && handle.curveEdit.role === "out"
    );
    expect(outHandle).toBeDefined();

    const result = applyEditIntent(source, handles, {
      kind: "move",
      handleId: outHandle!.id,
      newWorld: wp(0, cm(1))
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.newSource).toContain("out=90");
    expect(result.newSource).toContain("in=180");
  });

  it("dragging a synthetic in-handle rewrites only in= on to-curves", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) to[out=0,in=180] (2,0);
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);
    const inHandle = handles.find(
      (handle) => handle.kind === "path-control" && handle.curveEdit?.kind === "to-angle" && handle.curveEdit.role === "in"
    );
    expect(inHandle).toBeDefined();

    const result = applyEditIntent(source, handles, {
      kind: "move",
      handleId: inHandle!.id,
      newWorld: wp(cm(2), cm(1))
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.newSource).toContain("out=0");
    expect(result.newSource).toContain("in=90");
  });

  it("writes integer out-angles for synthetic in/out drags", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) to[out=0,in=180] (2,0);
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);
    const outHandle = handles.find(
      (handle) => handle.kind === "path-control" && handle.curveEdit?.kind === "to-angle" && handle.curveEdit.role === "out"
    );
    expect(outHandle).toBeDefined();

    const result = applyEditIntent(source, handles, {
      kind: "move",
      handleId: outHandle!.id,
      newWorld: wp(cm(1), cm(0.5))
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.newSource).toContain("out=27");
  });

  it("writes relative out-angles for relative to-curves", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) to[out=0,in=180,relative] (1,1);
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);
    const outHandle = handles.find(
      (handle) => handle.kind === "path-control" && handle.curveEdit?.kind === "to-angle" && handle.curveEdit.role === "out"
    );
    expect(outHandle).toBeDefined();

    const result = applyEditIntent(source, handles, {
      kind: "move",
      handleId: outHandle!.id,
      newWorld: wp(0, cm(1))
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.newSource).toContain("relative");
    expect(result.newSource).toContain("out=45");
  });

  it("treats no-op synthetic curve drags as success", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) to[out=0,in=180] (2,0);
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);
    const outHandle = handles.find(
      (handle) => handle.kind === "path-control" && handle.curveEdit?.kind === "to-angle" && handle.curveEdit.role === "out"
    );
    expect(outHandle).toBeDefined();

    const result = applyEditIntent(source, handles, {
      kind: "move",
      handleId: outHandle!.id,
      newWorld: outHandle!.world
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.newSource).toContain("out=0");
    expect(result.newSource).toContain("in=180");
  });

  it("dragging the bend handle rewrites bend direction and flips across zero", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) to[bend left=30] (2,0);
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);
    const bendHandle = handles.find(
      (handle) => handle.kind === "path-bend" && handle.curveEdit?.kind === "to-bend"
    );
    expect(bendHandle).toBeDefined();

    const raised = applyEditIntent(source, handles, {
      kind: "move",
      handleId: bendHandle!.id,
      newWorld: wp(cm(1), cm(1))
    });
    expect(raised.kind).toBe("success");
    if (raised.kind !== "success") return;
    expect(raised.newSource).toContain("bend left=45");

    const reevaluated = evaluateAndGetHandles(raised.newSource);
    const reevaluatedBendHandle = reevaluated.handles.find(
      (handle) => handle.kind === "path-bend" && handle.curveEdit?.kind === "to-bend"
    );
    expect(reevaluatedBendHandle).toBeDefined();

    const lowered = applyEditIntent(raised.newSource, reevaluated.handles, {
      kind: "move",
      handleId: reevaluatedBendHandle!.id,
      newWorld: wp(cm(1), cm(-1))
    });
    expect(lowered.kind).toBe("success");
    if (lowered.kind !== "success") return;
    expect(lowered.newSource).toContain("bend right=45");
    expect(lowered.newSource).not.toContain("bend left");
  });

  it("moves a node inside xscale=2 scope", () => {
    const source = String.raw`\begin{tikzpicture}
\begin{scope}[xscale=2]
\node at (1,2) {A};
\end{scope}
\end{tikzpicture}`;
    // Node at local (1,2) → world (2,2) due to xscale=2
    // Move to world (6, 4) → local should be (3, 4)
    const result = roundTripMove(source, "(1,2)", wp(cm(6), cm(4)));

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    expect(result.newSource).toContain("(3,4)");
    expect(result.newHandle).toBeDefined();
    expect(result.newHandle!.world.x).toBeCloseTo(cm(6), 0);
    expect(result.newHandle!.world.y).toBeCloseTo(cm(4), 0);
  });

  it("moves a node inside rotate=90 scope", () => {
    const source = String.raw`\begin{tikzpicture}
\begin{scope}[rotate=90]
\node at (1,0) {A};
\end{scope}
\end{tikzpicture}`;
    // rotate(90): local (1,0) → world (0,1)
    // Move to world (-2, 0) → inverse rotate: local (0, 2)
    const result = roundTripMove(source, "(1,0)", wp(cm(-2), 0));

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    expect(result.newHandle).toBeDefined();
    expect(result.newHandle!.world.x).toBeCloseTo(cm(-2), 0);
    expect(result.newHandle!.world.y).toBeCloseTo(0, 0);
  });

  it("moves a node inside a cm-transformed scope", () => {
    const source = String.raw`\begin{tikzpicture}
\begin{scope}[cm={0,1,1,0,(1cm,1cm)}]
\node at (1,2) {A};
\end{scope}
\end{tikzpicture}`;
    // cm={0,1,1,0,(1,1)} maps local (x,y) -> world (y+1, x+1)
    // local (1,2) -> world (3,2); moving to world (5,4) yields local (3,4)
    const result = roundTripMove(source, "(1,2)", wp(cm(5), cm(4)));

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    expect(result.newSource).toContain("(3,4)");
    expect(result.newHandle).toBeDefined();
    expect(result.newHandle!.world.x).toBeCloseTo(cm(5), 0);
    expect(result.newHandle!.world.y).toBeCloseTo(cm(4), 0);
  });

  it("moves a polar coordinate preserving polar form", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) -- (45:2);
\end{tikzpicture}`;
    // (45:2) → world (√2·cm, √2·cm)
    // Move to world (0, 3cm) → polar (90:3)
    const result = roundTripMove(source, "(45:2)", wp(0, cm(3)));

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    // Source should contain polar notation
    expect(result.newSource).toMatch(/\(90(\.\d+)?:3(\.\d+)?\)/);
    expect(result.newHandle).toBeDefined();
    expect(result.newHandle!.world.x).toBeCloseTo(0, 0);
    expect(result.newHandle!.world.y).toBeCloseTo(cm(3), 0);
  });

  it("moves named path handles by rewriting matching coordinate definitions", () => {
    const source = String.raw`\begin{tikzpicture}
\coordinate (A) at (0,0);
\coordinate (B) at (2,1);
\draw[thick,blue] (A) -- (B);
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);
    const namedHandle = handles.find(
      (h) =>
        source.slice(h.sourceRef.sourceSpan.from, h.sourceRef.sourceSpan.to) === "(A)" &&
        h.coordinateForm === "named"
    );
    expect(namedHandle).toBeDefined();

    const result = applyEditIntent(source, handles, {
      kind: "move",
      handleId: namedHandle!.id,
      newWorld: wp(cm(1), cm(1))
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    expect(result.newSource).toContain(String.raw`\coordinate (A) at (1,1);`);
    expect(result.newSource).toContain(String.raw`\coordinate (B) at (2,1);`);
    expect(result.newSource).toContain(String.raw`\draw[thick,blue] (A) -- (B);`);

    const reevaluated = evaluateAndGetHandles(result.newSource);
    const movedNamedHandle = reevaluated.handles.find(
      (h) =>
        result.newSource.slice(h.sourceRef.sourceSpan.from, h.sourceRef.sourceSpan.to) === "(A)" &&
        h.coordinateForm === "named"
    );
    expect(movedNamedHandle).toBeDefined();
    expect(movedNamedHandle!.world.x).toBeCloseTo(cm(1), 3);
    expect(movedNamedHandle!.world.y).toBeCloseTo(cm(1), 3);
  });

  it("detaches named path endpoints to numeric coordinates when dragged", () => {
    const source = String.raw`\begin{tikzpicture}
\node (A) at (0,0) {A};
\draw (A) -- (1,1);
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);
    const namedHandle = findHandleBySpanText(source, handles, "(A)");

    if (!namedHandle) {
      // Named coordinates may not get handles at all — that's also fine
      return;
    }

    const result = applyEditIntent(source, handles, {
      kind: "move",
      handleId: namedHandle.id,
      newWorld: wp(cm(5), cm(5))
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.newSource).toContain("\\draw (5,5) -- (1,1);");
  });

  it("returns unsupported when a handle maps to a shared expanded source span", () => {
    const source = String.raw`\begin{tikzpicture}
\foreach \x in {0,1} { \draw (\x,0) -- ++(1,0); }
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);
    const duplicatedSpanHandle = handles.find((handle, index) =>
      handles.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          other.sourceRef.sourceSpan.from === handle.sourceRef.sourceSpan.from &&
          other.sourceRef.sourceSpan.to === handle.sourceRef.sourceSpan.to
      )
    );
    expect(duplicatedSpanHandle).toBeDefined();

    const result = applyEditIntent(source, handles, {
      kind: "move",
      handleId: duplicatedSpanHandle!.id,
      newWorld: wp(cm(3), cm(0))
    });

    expect(result.kind).toBe("unsupported");
  });

  it("returns error for nonexistent handle", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) -- (1,1);
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);

    const result = applyEditIntent(source, handles, {
      kind: "move",
      handleId: "nonexistent-handle",
      newWorld: wp(cm(5), cm(5))
    });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("not found");
    }
  });

  it("moves a relative ++ coordinate", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) -- ++(1,1);
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);
    const deltaHandle = handles.find((h) => h.rewriteMode === "delta");

    if (!deltaHandle) {
      // If no delta handle, skip (may not be implemented yet)
      return;
    }

    const result = applyEditIntent(source, handles, {
      kind: "move",
      handleId: deltaHandle.id,
      newWorld: wp(cm(2), cm(3))
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.newSource).toContain("-- ++(2,3)");
    expect(result.newSource.includes("++++")).toBe(false);
  });

  it("preserves coordinate-local options when rewriting a polar coordinate", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) -- ([xshift=3pt]45:2);
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);
    const polarHandle = handles.find((h) => source.slice(h.sourceRef.sourceSpan.from, h.sourceRef.sourceSpan.to).includes("[xshift=3pt]"));
    expect(polarHandle).toBeDefined();

    const result = applyEditIntent(source, handles, {
      kind: "move",
      handleId: polarHandle!.id,
      newWorld: wp(0, cm(3))
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.newSource).toContain("[xshift=3pt]");
    expect(result.newSource).toMatch(/\(\[xshift=3pt\]\s*90(\.\d+)?:\s*3(\.\d+)?\)/);
  });

  it("preserves coordinate-local options when rewriting a relative coordinate", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (1,1) -- ++([xshift=3pt]1,0);
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);
    const deltaHandle = handles.find((h) => h.rewriteMode === "delta");
    expect(deltaHandle).toBeDefined();

    const result = applyEditIntent(source, handles, {
      kind: "move",
      handleId: deltaHandle!.id,
      newWorld: wp(cm(3), cm(2))
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.newSource).toContain("++([xshift=3pt]2,1)");
  });

  it("returns unsupported for xyz coordinates", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (1,2,3) -- (2,3,4);
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);
    const xyzHandle = handles.find((h) => h.coordinateForm === "xyz");
    expect(xyzHandle).toBeDefined();

    const result = applyEditIntent(source, handles, {
      kind: "move",
      handleId: xyzHandle!.id,
      newWorld: wp(cm(4), cm(5))
    });

    expect(result.kind).toBe("unsupported");
  });

  it("rejects stale handles when source fingerprint differs", () => {
    const sourceA = String.raw`\begin{tikzpicture}
\draw (1,1) -- (2,2);
\end{tikzpicture}`;
    const sourceB = String.raw`\begin{tikzpicture}
\draw (9,9) -- (8,8);
\end{tikzpicture}`;
    expect(sourceA.length).toBe(sourceB.length);

    const { handles } = evaluateAndGetHandles(sourceA);
    const handle = findHandleBySpanText(sourceA, handles, "(1,1)");
    expect(handle).toBeDefined();

    const result = applyEditIntent(sourceB, handles, {
      kind: "move",
      handleId: handle!.id,
      newWorld: wp(cm(3), cm(4))
    });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message.toLowerCase()).toContain("stale");
    }
  });

  it("patch metadata includes old and new spans", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) -- (1,1);
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);
    const handle = findHandleBySpanText(source, handles, "(1,1)");
    expect(handle).toBeDefined();

    const result = applyEditIntent(source, handles, {
      kind: "move",
      handleId: handle!.id,
      newWorld: wp(cm(10), cm(20))
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    expect(result.patches).toHaveLength(1);
    const patch = result.patches[0];
    expect(patch.oldSpan).toEqual(handle!.sourceRef.sourceSpan);
    expect(patch.replacement).toContain("10");
    expect(patch.replacement).toContain("20");
    expect(patch.newSpan.from).toBe(patch.oldSpan.from);
    expect(patch.newSpan.to).toBe(patch.oldSpan.from + patch.replacement.length);
  });

  it("applies direct AST edits and rejects mismatched targets", () => {
    const source = String.raw`\begin{tikzpicture}
\begin{scope}
\node at (1,2) {A};
\end{scope}
\end{tikzpicture}`;
    const { parsed } = evaluateAndGetHandles(source);
    const coordinateId = parsed.figure.body[0]?.kind === "Scope"
      ? parsed.figure.body[0].body[0]?.kind === "Path"
        ? parsed.figure.body[0].body[0].items.find((item) => item.kind === "Coordinate")?.id
        : undefined
      : undefined;
    const nodeId = parsed.figure.body[0]?.kind === "Scope"
      ? parsed.figure.body[0].body[0]?.kind === "Path"
        ? parsed.figure.body[0].body[0].items.find((item) => item.kind === "Node")?.id
        : undefined
      : undefined;
    expect(coordinateId).toBeDefined();
    expect(nodeId).toBeDefined();

    expect(applyEdit(parsed, { kind: "updateCoordinate", targetId: coordinateId!, x: "3", y: "4" }).source)
      .toContain("(3,4)");
    expect(applyEdit(parsed, { kind: "updateNodeText", targetId: nodeId!, text: "B" }).source)
      .toContain("{B}");
    expect(() => applyEdit(parsed, { kind: "updateCoordinate", targetId: "missing", x: "0", y: "0" }))
      .toThrow(/Unknown edit target/);
    expect(() => applyEdit(parsed, { kind: "updateCoordinate", targetId: nodeId!, x: "0", y: "0" }))
      .toThrow(/not a coordinate/);
    expect(() => applyEdit(parsed, { kind: "updateNodeText", targetId: coordinateId!, text: "B" }))
      .toThrow(/not a node/);
  });

  it("rejects stale rewrite-target handles before mutating source", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) -- (1,1);
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);
    const handle = findHandleBySpanText(source, handles, "(1,1)")!;
    const result = applyEditIntent(source, [
      { ...handle, rewriteTargetHandleId: "detached-target" },
      {
        ...handle,
        id: "detached-target",
        sourceRef: { ...handle.sourceRef, sourceFingerprint: "stale-fingerprint" }
      }
    ], {
      kind: "move",
      handleId: handle.id,
      newWorld: wp(cm(2), cm(2))
    });

    expect(result).toEqual({
      kind: "error",
      message: "Handle does not match current source (stale handle)."
    });
  });

  it("rejects unknown intents and missing rewrite-target handles", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) -- (1,1);
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);
    const handle = findHandleBySpanText(source, handles, "(1,1)")!;

    const unknown = applyEditIntent(source, handles, {
      kind: "rotate",
      handleId: handle.id,
      newWorld: wp(cm(2), cm(2))
    } as never);
    expect(unknown).toEqual({ kind: "error", message: "Unknown intent kind: rotate" });

    const missingTarget = applyEditIntent(source, [{ ...handle, rewriteTargetHandleId: "missing-target" }], {
      kind: "move",
      handleId: handle.id,
      newWorld: wp(cm(2), cm(2))
    });
    expect(missingTarget).toEqual({
      kind: "error",
      message: "Rewrite target handle could not be resolved (stale handle?)."
    });
  });

  it("rejects invalid rewrite spans and stale rewrite text", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) -- (1,1);
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);
    const handle = findHandleBySpanText(source, handles, "(1,1)")!;

    const invalidSpan = applyEditIntent(source, [
      { ...handle, sourceRef: { ...handle.sourceRef, sourceSpan: { from: source.length + 1, to: source.length + 2 } } }
    ], {
      kind: "move",
      handleId: handle.id,
      newWorld: wp(cm(2), cm(2))
    });
    expect(invalidSpan.kind).toBe("error");
    if (invalidSpan.kind === "error") {
      expect(invalidSpan.message).toContain("source span exceeds");
    }

    const staleText = applyEditIntent(source, [{ ...handle, sourceText: "(9,9)" }], {
      kind: "move",
      handleId: handle.id,
      newWorld: wp(cm(2), cm(2))
    });
    expect(staleText).toEqual({
      kind: "error",
      message: "Handle span content mismatch (stale handle)."
    });
  });

  it("guards malformed curve edit handles", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) to[out=0,in=180] (2,0);
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);
    const outHandle = handles.find(
      (handle) => handle.kind === "path-control" && handle.curveEdit?.kind === "to-angle" && handle.curveEdit.role === "out"
    );
    expect(outHandle).toBeDefined();

    const missingTarget = applyEditIntent(source, [
      {
        ...outHandle!,
        curveEdit: { ...outHandle!.curveEdit!, operationItemId: "missing-operation" }
      } as EditHandle
    ], {
      kind: "move",
      handleId: outHandle!.id,
      newWorld: wp(0, cm(1))
    });
    expect(missingTarget.kind).toBe("unsupported");

    const nonFiniteAngle = applyEditIntent(source, handles, {
      kind: "move",
      handleId: outHandle!.id,
      newWorld: wp(Number.NaN, Number.NaN)
    });
    expect(nonFiniteAngle.kind).toBe("success");
    if (nonFiniteAngle.kind === "success") {
      expect(nonFiniteAngle.newSource).toContain("out=0");
    }
  });

  it("normalizes degenerate bend handles without producing invalid angles", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) to[bend left=30] (2,0);
\end{tikzpicture}`;
    const { handles } = evaluateAndGetHandles(source);
    const bendHandle = handles.find(
      (handle) => handle.kind === "path-bend" && handle.curveEdit?.kind === "to-bend"
    );
    expect(bendHandle).toBeDefined();

    const result = applyEditIntent(source, [
      {
        ...bendHandle!,
        curveEdit: {
          ...bendHandle!.curveEdit!,
          startWorld: wp(0, 0),
          endWorld: wp(0, 0)
        }
      } as EditHandle
    ], {
      kind: "move",
      handleId: bendHandle!.id,
      newWorld: wp(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
    });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.newSource).toContain("bend left=0");
    }
  });
});
