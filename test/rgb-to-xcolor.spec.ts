import { describe, expect, it } from "vitest";

import { parseColorInput, rgbToXcolorExpression } from "xcolor-rgb-convert";

describe("xcolor-rgb-convert integration", () => {
  it("converts RGB to an xcolor expression", () => {
    const result = rgbToXcolorExpression({ r: 26, g: 43, b: 60 }, { mode: "release", maxMixes: 2 });

    expect(result.expression.length).toBeGreaterThan(0);
    expect(result.error2).toBeGreaterThanOrEqual(0);
  });

  it("parses custom color inputs", () => {
    const parsed = parseColorInput("hsl(120, 100%, 50%)");

    expect(parsed).not.toBeNull();
    expect(parsed?.rgb).toEqual({ r: 0, g: 255, b: 0 });
  });
});
