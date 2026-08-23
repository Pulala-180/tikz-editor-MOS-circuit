import { describe, expect, it } from "vitest";

import { parseCustomColorInput } from "../../packages/app/src/ui/custom-color-input";

describe("parseCustomColorInput", () => {
  it("parses hex colors", () => {
    const longHex = parseCustomColorInput("#1a2b3c");
    expect(longHex).toEqual({
      rgb: { r: 26, g: 43, b: 60 },
      hex: "#1a2b3c"
    });

    const shortHex = parseCustomColorInput("#abc");
    expect(shortHex).toEqual({
      rgb: { r: 170, g: 187, b: 204 },
      hex: "#aabbcc"
    });
  });

  it("parses rgb/rgba forms and warns for alpha input", () => {
    const rgb = parseCustomColorInput("rgb(255, 128, 0)");
    expect(rgb).toEqual({
      rgb: { r: 255, g: 128, b: 0 },
      hex: "#ff8000"
    });

    const rgba = parseCustomColorInput("rgba(255, 0, 0, 0.5)");
    expect(rgba).toEqual({
      rgb: { r: 255, g: 0, b: 0 },
      hex: "#ff0000",
      warning: "Alpha channel ignored; using opaque RGB."
    });
  });

  it("parses hsl/hsla forms", () => {
    const hsl = parseCustomColorInput("hsl(120, 100%, 50%)");
    expect(hsl).toEqual({
      rgb: { r: 0, g: 255, b: 0 },
      hex: "#00ff00"
    });

    const hsla = parseCustomColorInput("hsla(240 100% 50% / 40%)");
    expect(hsla).toEqual({
      rgb: { r: 0, g: 0, b: 255 },
      hex: "#0000ff",
      warning: "Alpha channel ignored; using opaque RGB."
    });
  });

  it("parses hsb/hsv forms", () => {
    const hsv = parseCustomColorInput("hsv(0,100%,100%)");
    expect(hsv).toEqual({
      rgb: { r: 255, g: 0, b: 0 },
      hex: "#ff0000"
    });

    const hsb = parseCustomColorInput("hsb(240 100% 100%)");
    expect(hsb).toEqual({
      rgb: { r: 0, g: 0, b: 255 },
      hex: "#0000ff"
    });
  });

  it("accepts bare RGB triplets and warns for alpha", () => {
    const plain = parseCustomColorInput("255 128 0");
    expect(plain).toEqual({
      rgb: { r: 255, g: 128, b: 0 },
      hex: "#ff8000"
    });

    const withAlpha = parseCustomColorInput("255, 0, 0, 0.6");
    expect(withAlpha).toEqual({
      rgb: { r: 255, g: 0, b: 0 },
      hex: "#ff0000",
      warning: "Alpha channel ignored; using opaque RGB."
    });
  });

  it("returns null for malformed input", () => {
    expect(parseCustomColorInput("")).toBeNull();
    expect(parseCustomColorInput("rgb(255, 0)")).toBeNull();
    expect(parseCustomColorInput("hsl(30, 50)")).toBeNull();
    expect(parseCustomColorInput("hsb(blue, 50%, 50%)")).toBeNull();
    expect(parseCustomColorInput("not-a-color")).toBeNull();
  });
});
