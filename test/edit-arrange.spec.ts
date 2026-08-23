import { describe, expect, it } from "vitest";
import { planAlignDeltas, planDistributeDeltas } from "../packages/core/src/edit/arrange.js";
import { wb } from "./coords-helpers.js";

describe("edit arrange planning", () => {
  it("rejects align and distribute requests with too few usable source ids", () => {
    const bounds = new Map([
      ["a", wb(0, 0, 10, 10)],
      ["b", wb(20, 0, 30, 10)]
    ]);

    expect(planAlignDeltas(bounds, [" a ", "a", " "], "left")).toEqual({
      kind: "unsupported",
      reason: "Align requires at least 2 selected elements."
    });
    expect(planDistributeDeltas(bounds, ["a", "b"], "horizontal")).toEqual({
      kind: "unsupported",
      reason: "Distribute requires at least 3 selected elements."
    });
  });

  it("reports missing source bounds before planning deltas", () => {
    const bounds = new Map([
      ["a", wb(0, 0, 10, 10)],
      ["b", wb(20, 0, 30, 10)]
    ]);

    expect(planAlignDeltas(bounds, ["a", "missing"], "right")).toEqual({
      kind: "unsupported",
      reason: "Could not resolve geometry bounds for selected element: missing"
    });
    expect(planDistributeDeltas(bounds, ["a", "missing", "b"], "vertical")).toEqual({
      kind: "unsupported",
      reason: "Could not resolve geometry bounds for selected element: missing"
    });
  });

  it("plans vertical distribution and preserves selected order for tied geometry", () => {
    const bounds = new Map([
      ["top", wb(0, 30, 10, 40)],
      ["first-middle", wb(0, 10, 10, 20)],
      ["second-middle", wb(20, 10, 30, 20)],
      ["bottom", wb(0, 0, 10, 10)]
    ]);

    const result = planDistributeDeltas(
      bounds,
      ["top", "second-middle", "first-middle", "bottom"],
      "vertical"
    );

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.deltas.get("second-middle")?.y).toBeCloseTo(10, 6);
    expect(result.deltas.get("first-middle")?.y).toBeCloseTo(0, 6);
    expect(result.deltas.get("top")).toMatchObject({ x: 0, y: 0 });
    expect(result.deltas.get("bottom")).toMatchObject({ x: 0, y: 0 });
  });
});
