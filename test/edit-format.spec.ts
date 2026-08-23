import { describe, expect, it } from "vitest";

import { NUMBER_FORMAT_PRESETS, formatNumber } from "../packages/core/src/edit/format.js";

describe("formatNumber", () => {
  it("defaults to compact two-decimal formatting", () => {
    expect(formatNumber(12.345)).toBe("12.35");
    expect(formatNumber(12.3)).toBe("12.3");
    expect(formatNumber(-0.004)).toBe("0");
  });

  it("supports interaction-specific fractional precision", () => {
    expect(formatNumber(90.8, NUMBER_FORMAT_PRESETS.pointDimension)).toBe("91");
    expect(formatNumber(90.84, NUMBER_FORMAT_PRESETS.pointDimensionFine)).toBe("90.8");
    expect(formatNumber(120.2, NUMBER_FORMAT_PRESETS.pointDistance)).toBe("120");
    expect(formatNumber(120.25, NUMBER_FORMAT_PRESETS.pointDistanceFine)).toBe("120.3");
    expect(formatNumber(-0.1, NUMBER_FORMAT_PRESETS.pointDistance)).toBe("0");
  });
});
