import { describe, expect, it } from "vitest";
import {
  clearFillPatternPreviewCache,
  renderFillPatternPreviewSvg
} from "../packages/core/src/svg/patterns/preview.js";

describe("svg pattern preview helper", () => {
  it("emits namespaced SVG previews for every meta pattern preset", () => {
    clearFillPatternPreviewCache();

    const previews = new Map(
      (["Lines", "Hatch", "Dots", "Stars"] as const).map((preset) => [
        preset,
        renderFillPatternPreviewSvg(preset)
      ])
    );

    for (const [preset, svg] of previews) {
      expect(svg).toContain("<svg");
      expect(svg).toContain(`preview-pattern-${preset.toLowerCase()}`);
      expect(svg).toContain("fill=\"url(#");
    }

    expect(previews.get("Lines")).toContain("M -1.5 0 L 1.5 0");
    expect(previews.get("Hatch")).toContain("preview-pattern-hatch");
    expect(previews.get("Dots")).toContain("<circle");
    expect(previews.get("Stars")).toContain("<path");
    expect(new Set(previews.values()).size).toBe(previews.size);
  });

  it("caches rendered previews until the cache is explicitly cleared", () => {
    clearFillPatternPreviewCache();

    const first = renderFillPatternPreviewSvg("Dots");
    const second = renderFillPatternPreviewSvg("Dots");
    clearFillPatternPreviewCache();
    const afterClear = renderFillPatternPreviewSvg("Dots");

    expect(second).toBe(first);
    expect(afterClear).toBe(first);
  });

  it("keeps legacy inherently colored pattern ids independent of pattern color", () => {
    clearFillPatternPreviewCache();

    const checkerboard = renderFillPatternPreviewSvg("checkerboard light gray");
    const darkBlueLines = renderFillPatternPreviewSvg("horizontal lines dark blue");

    expect(checkerboard).toContain("preview-pattern-checkerboard-light-gray");
    expect(darkBlueLines).toContain("preview-pattern-horizontal-lines-dark-blue");
    expect(checkerboard).not.toBe(darkBlueLines);
    expect(checkerboard).toContain("<pattern");
    expect(darkBlueLines).toContain("<pattern");
  });

  it("rewrites all local references when namespacing pattern SVG ids", () => {
    clearFillPatternPreviewCache();

    const svg = renderFillPatternPreviewSvg("north east lines");
    const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    const fills = [...svg.matchAll(/fill="url\(#([^"]+)\)"/g)].map((match) => match[1]);

    expect(ids.length).toBeGreaterThan(0);
    expect(fills.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const referencedId of fills) {
      expect(ids).toContain(referencedId);
      expect(referencedId).toContain("preview-pattern-north-east-lines");
    }
    expect(svg).not.toContain("url(#tikz-pattern-1)");
  });
});
