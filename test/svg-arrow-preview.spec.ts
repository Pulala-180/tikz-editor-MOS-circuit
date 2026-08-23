import { describe, expect, it } from "vitest";

import { renderArrowTipPreviewPaths } from "../packages/core/src/svg/arrows/preview.js";
import type { ArrowTip, ArrowTipKind } from "../packages/core/src/semantic/types.js";

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

describe("SVG arrow tip previews", () => {
  it("renders representative filled, open, rounded, and reversed previews with stable bounds", () => {
    const latex = renderArrowTipPreviewPaths(tip("latex", { open: true, lineWidth: 0.3 }), 0.4, "blue");
    const stealth = renderArrowTipPreviewPaths(tip("stealth", { round: true, reversed: true, fill: "red" }), 0.4);
    const kiteBackAnchored = renderArrowTipPreviewPaths(tip("kite", { inset: 2 }), 0.4, "black", { anchor: "back" });

    expect(latex.paths[0]?.d).toContain("C ");
    expect(latex.paths[0]?.fill).toBe("none");
    expect(latex.paths[0]?.stroke).toBe("blue");
    expect(stealth.paths[0]?.fill).toBe("red");
    expect(stealth.paths[0]?.lineJoin).toBe("round");
    expect(kiteBackAnchored.xBounds.min).toBeGreaterThanOrEqual(0);
    expect(kiteBackAnchored.xBounds.max).toBeGreaterThan(kiteBackAnchored.xBounds.min);
  });

  it("renders stroke-only and cap tip families with appropriate paint defaults", () => {
    const strokeOnlyKinds: ArrowTipKind[] = ["bar", "hooks", "cm-rightarrow", "straight-barb", "arc-barb", "tee-barb", "rays"];
    for (const kind of strokeOnlyKinds) {
      const preview = renderArrowTipPreviewPaths(tip(kind, { rayCount: kind === "rays" ? 6 : null }), Number.NaN, "green");
      expect(preview.paths.length).toBeGreaterThan(0);
      expect(preview.paths.every((path) => path.fill === "none")).toBe(true);
      expect(preview.paths.every((path) => path.stroke === "green")).toBe(true);
      expect(preview.paths.every((path) => path.strokeWidth >= 0.4)).toBe(true);
    }

    const roundCap = renderArrowTipPreviewPaths(tip("round-cap", { lineWidth: 0 }), 0.2, "purple");
    const buttCap = renderArrowTipPreviewPaths(tip("butt-cap", { lineWidth: 0 }), 0.2, "purple");
    expect(roundCap.paths[0]?.lineCap).toBe("round");
    expect(roundCap.paths[0]?.fill).toBe("purple");
    expect(buttCap.paths[0]?.lineCap).toBe("butt");
    expect(buttCap.paths[0]?.fill).toBe("purple");
  });

  it("formats every remaining tip family without non-finite path data", () => {
    const kinds: ArrowTipKind[] = ["to", "triangle", "triangle-cap", "square", "circle", "implies"];
    for (const kind of kinds) {
      const preview = renderArrowTipPreviewPaths(tip(kind, { length: Number.NaN, width: Number.POSITIVE_INFINITY }), 0.5);
      expect(preview.paths.length).toBeGreaterThan(0);
      for (const path of preview.paths) {
        expect(path.d).not.toMatch(/NaN|Infinity|-Infinity/);
        expect(path.d).toMatch(/[MLCAZ]/);
      }
    }
  });
});
