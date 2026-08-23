import { describe, expect, it } from "vitest";

import { expandGrayAliasToBlackMix, serializeBlackMixToGrayAlias } from "../../packages/app/src/ui/color-picker-grayscale";

describe("color-picker grayscale aliases", () => {
  it("expands named gray aliases to black mix tokens", () => {
    expect(expandGrayAliasToBlackMix("darkgray")).toBe("black!75");
    expect(expandGrayAliasToBlackMix("gray")).toBe("black!50");
    expect(expandGrayAliasToBlackMix("lightgray")).toBe("black!25");
  });

  it("passes non-alias tokens through unchanged", () => {
    expect(expandGrayAliasToBlackMix("black!37")).toBe("black!37");
    expect(expandGrayAliasToBlackMix("red")).toBe("red");
    expect(expandGrayAliasToBlackMix(null)).toBeNull();
  });

  it("serializes canonical black mix percentages back to named grays", () => {
    expect(serializeBlackMixToGrayAlias(75)).toBe("darkgray");
    expect(serializeBlackMixToGrayAlias(50)).toBe("gray");
    expect(serializeBlackMixToGrayAlias(25)).toBe("lightgray");
    expect(serializeBlackMixToGrayAlias(37)).toBe("black!37");
  });
});
