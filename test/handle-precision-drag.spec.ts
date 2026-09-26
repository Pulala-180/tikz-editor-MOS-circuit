import { describe, it, expect } from "vitest";
import { applyEditAction } from "../packages/core/src/edit/actions.js";
import { wp } from "./coords-helpers.js";
import { cm, makeHandle } from "./edit-actions-helpers.js";

describe("Handle drag precision preservation", () => {
  it("preserves 3-decimal precision when horizontally dragging a horizontal wire", () => {
    const source = `\\draw[line width=0.32mm, line cap=round] (0.765,4.497) -- (1.065,4.497);`;
    const h1Start = source.indexOf("(0.765,4.497)");
    const h1End = h1Start + "(0.765,4.497)".length;
    const h2Start = source.indexOf("(1.065,4.497)");
    const h2End = h2Start + "(1.065,4.497)".length;

    const handle1 = makeHandle(source, {
      world: wp(cm(0.765), cm(4.497)),
      sourceSpan: { from: h1Start, to: h1End },
      sourceId: "wire-1"
    });
    const handle2 = makeHandle(source, {
      world: wp(cm(1.065), cm(4.497)),
      sourceSpan: { from: h2Start, to: h2End },
      sourceId: "wire-1"
    });

    const targetWorld = wp(cm(1.3), cm(4.497));

    const result = applyEditAction(source, [handle1, handle2], {
      kind: "moveHandle",
      handleId: handle2.id,
      newWorld: targetWorld
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.newSource).toBe(
        `\\draw[line width=0.32mm, line cap=round] (0.765,4.497) -- (1.3,4.497);`
      );
    }
  });

  it("preserves 3-decimal precision when vertically dragging a vertical wire", () => {
    const source = `\\draw[line width=0.32mm, line cap=round] (4.497,1.0) -- (4.497,2.0);`;
    const h1Start = source.indexOf("(4.497,1.0)");
    const h1End = h1Start + "(4.497,1.0)".length;
    const h2Start = source.indexOf("(4.497,2.0)");
    const h2End = h2Start + "(4.497,2.0)".length;

    const handle1 = makeHandle(source, {
      world: wp(cm(4.497), cm(1.0)),
      sourceSpan: { from: h1Start, to: h1End },
      sourceId: "wire-v"
    });
    const handle2 = makeHandle(source, {
      world: wp(cm(4.497), cm(2.0)),
      sourceSpan: { from: h2Start, to: h2End },
      sourceId: "wire-v"
    });

    const targetWorld = wp(cm(4.497), cm(3.5));

    const result = applyEditAction(source, [handle1, handle2], {
      kind: "moveHandle",
      handleId: handle2.id,
      newWorld: targetWorld
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.newSource).toBe(
        `\\draw[line width=0.32mm, line cap=round] (4.497,1.0) -- (4.497,3.5);`
      );
    }
  });

  it("preserves standard 2-decimal behavior for normal wires without fine precision", () => {
    const source = `\\draw (1,2) -- (3,2);`;
    const h1Start = source.indexOf("(1,2)");
    const h1End = h1Start + "(1,2)".length;
    const h2Start = source.indexOf("(3,2)");
    const h2End = h2Start + "(3,2)".length;

    const handle1 = makeHandle(source, {
      world: wp(cm(1), cm(2)),
      sourceSpan: { from: h1Start, to: h1End },
      sourceId: "wire-std"
    });
    const handle2 = makeHandle(source, {
      world: wp(cm(3), cm(2)),
      sourceSpan: { from: h2Start, to: h2End },
      sourceId: "wire-std"
    });

    const targetWorld = wp(cm(4.5), cm(2));

    const result = applyEditAction(source, [handle1, handle2], {
      kind: "moveHandle",
      handleId: handle2.id,
      newWorld: targetWorld
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.newSource).toBe(`\\draw (1,2) -- (4.5,2);`);
    }
  });
});
