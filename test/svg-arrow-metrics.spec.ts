import { describe, expect, it } from "vitest";

import type { ArrowTip, ArrowTipKind } from "../packages/core/src/semantic/types.js";
import {
  buildArrowTipMetrics,
  computeArrowShortening,
  computeStealthShapeParameters,
  normalizeArrowTip
} from "../packages/core/src/svg/arrows/metrics.js";

function tip(kind: ArrowTipKind, overrides: Partial<ArrowTip> = {}): ArrowTip {
  return {
    kind,
    open: false,
    round: false,
    reversed: false,
    bend: false,
    afterLineEnd: false,
    color: null,
    fill: null,
    length: 8,
    width: 5,
    inset: null,
    sep: 0,
    lineWidth: null,
    arc: null,
    rayCount: null,
    ...overrides
  };
}

describe("SVG arrow metrics", () => {
  it("normalizes malformed tip dimensions and fallback paint inputs", () => {
    const normalized = normalizeArrowTip(
      tip("stealth", {
        afterLineEnd: undefined,
        color: null,
        length: -1,
        width: 0,
        sep: -4,
        lineWidth: Number.NaN
      }),
      Number.NaN,
      "orange"
    );

    expect(normalized.afterLineEnd).toBe(false);
    expect(normalized.length).toBe(0.01);
    expect(normalized.width).toBe(0.01);
    expect(normalized.sep).toBe(0);
    expect(normalized.lineWidth).toBe(0.4);
    expect(normalized.color).toBe("orange");
  });

  it("computes shortening plans for mixed before-line and after-line tips", () => {
    const before = normalizeArrowTip(tip("latex", { length: 6, sep: 1 }), 0.4, "black");
    const after = normalizeArrowTip(tip("stealth", { afterLineEnd: true, length: 5, sep: 2 }), 0.4, "black");

    expect(computeArrowShortening("end", [], 0.4)).toEqual({
      lineEndShortening: 0,
      totalLength: 0,
      plans: []
    });

    const shortening = computeArrowShortening("end", [before, after], 0.4);
    expect(shortening.lineEndShortening).toBeGreaterThan(0);
    expect(shortening.totalLength).toBeGreaterThan(shortening.lineEndShortening);
    expect(shortening.plans).toHaveLength(2);
    expect(shortening.plans.map((plan) => plan.index)).toEqual([0, 1]);
  });

  it("reverses metrics for representative arrow families", () => {
    const reversibleKinds: ArrowTipKind[] = [
      "latex",
      "stealth",
      "kite",
      "cm-rightarrow",
      "bar",
      "hooks",
      "tee-barb",
      "triangle",
      "square",
      "rays",
      "implies",
      "to"
    ];

    for (const kind of reversibleKinds) {
      const forward = normalizeArrowTip(tip(kind, { inset: kind === "tee-barb" ? 3 : null, rayCount: kind === "rays" ? 5 : null }), 0.5, "black");
      const reversed = normalizeArrowTip(
        tip(kind, { reversed: true, inset: kind === "tee-barb" ? 3 : null, rayCount: kind === "rays" ? 5 : null }),
        0.5,
        "black"
      );

      const forwardMetrics = buildArrowTipMetrics(forward, 0.5);
      const reversedMetrics = buildArrowTipMetrics(reversed, 0.5);
      expect(reversedMetrics.tipEnd).toBeCloseTo(-forwardMetrics.backEnd, 8);
      expect(reversedMetrics.backEnd).toBeCloseTo(-forwardMetrics.tipEnd, 8);
      if (kind !== "latex" && kind !== "stealth") {
        expect(reversedMetrics.lineEnd).toBeCloseTo(-forwardMetrics.lineEnd, 8);
      }
    }
  });

  it("handles rounded Latex and zero-inset Stealth miter limits", () => {
    const roundedLatex = buildArrowTipMetrics(
      normalizeArrowTip(tip("latex", { round: true, lineWidth: 10 }), 0.4, "black"),
      0.4
    );
    expect(roundedLatex.tipEnd).toBeGreaterThan(0);

    const zeroInsetStealth = normalizeArrowTip(tip("stealth", { inset: 0, lineWidth: 2 }), 0.4, "black");
    const params = computeStealthShapeParameters(zeroInsetStealth);
    expect(params.backMiter).toBeCloseTo(params.lineWidth / 2, 8);
  });
});
