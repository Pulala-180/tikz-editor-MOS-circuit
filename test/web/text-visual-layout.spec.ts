import { describe, expect, it } from "vitest";

import {
  collectLogicalLineRanges,
  createVisualTextLayout
} from "../../packages/app/src/ui/canvas-panel/text-visual-layout.js";

function measureTextWidth(text: string): number {
  return text.length;
}

describe("text visual layout", () => {
  it("collapses math delimiters in $...$ to the rendered prefix width", () => {
    const layout = createVisualTextLayout("$x$", "$x$", measureTextWidth);

    const start = layout.getCaretPosition(0);
    const open = layout.getCaretPosition(1);
    const afterX = layout.getCaretPosition(2);
    const end = layout.getCaretPosition(3);

    expect(start.lineIndex).toBe(0);
    expect(start.ratio).toBe(open.ratio);
    expect(afterX.ratio).toBe(end.ratio);
    expect(afterX.ratio).toBeGreaterThan(start.ratio);
  });

  it("collapses math delimiters in \\(...\\) to the rendered prefix width", () => {
    const layout = createVisualTextLayout(String.raw`\(` + "x" + String.raw`\)`, String.raw`\(` + "x" + String.raw`\)`, measureTextWidth);

    const offsets = [0, 1, 2, 3, 4, 5].map((offset) => layout.getCaretPosition(offset));

    expect(offsets[0]?.ratio).toBe(offsets[1]?.ratio);
    expect(offsets[1]?.ratio).toBe(offsets[2]?.ratio);
    expect(offsets[3]?.ratio).toBe(offsets[4]?.ratio);
    expect(offsets[4]?.ratio).toBe(offsets[5]?.ratio);
    expect(offsets[3]?.ratio).toBeGreaterThan(offsets[2]?.ratio ?? 0);
  });

  it("treats escaped delimiters as visible literals rather than math boundaries", () => {
    const layout = createVisualTextLayout(String.raw`\$x`, String.raw`\$x`, measureTextWidth);

    const before = layout.getCaretPosition(0);
    const afterEscape = layout.getCaretPosition(1);
    const afterDollar = layout.getCaretPosition(2);
    const afterX = layout.getCaretPosition(3);

    expect(before.ratio).toBe(afterEscape.ratio);
    expect(afterDollar.ratio).toBeGreaterThan(afterEscape.ratio);
    expect(afterX.ratio).toBeGreaterThan(afterDollar.ratio);
  });

  it("treats unmatched dollar delimiters as visible literals", () => {
    const layout = createVisualTextLayout("$", "$", measureTextWidth);

    expect(layout.getCaretPosition(1).x).toBeGreaterThan(layout.getCaretPosition(0).x);
    expect(layout.resolveSourceOffsetFromLineX(0, 0.5)).toBe(1);
  });

  it("splits TeX linebreak commands into logical lines including optional arguments", () => {
    const text = String.raw`First\\[2pt] Second`;
    const ranges = collectLogicalLineRanges(text);

    expect(ranges).toHaveLength(2);
    expect(text.slice(ranges[0].start, ranges[0].end)).toBe("First");
    expect(text.slice(ranges[1].start, ranges[1].end)).toBe(" Second");
  });

  it("treats control words as opaque visual steps instead of per-character advance", () => {
    const text = String.raw`\setminus`;
    const layout = createVisualTextLayout(text, text, measureTextWidth);
    const positions = Array.from({ length: text.length + 1 }, (_, offset) => layout.getCaretPosition(offset).ratio);

    for (let offset = 0; offset < text.length; offset += 1) {
      expect(positions[offset]).toBe(positions[0]);
    }
    expect(positions[text.length]).toBeGreaterThan(positions[0] ?? 0);
  });

  it("keeps backslash-letter text literal in plain fallback mode", () => {
    const text = String.raw`rendering \te`;
    const layout = createVisualTextLayout(text, text, measureTextWidth, { syntax: "plain" });

    const beforeSlash = layout.getCaretPosition(text.indexOf("\\"));
    const afterSlash = layout.getCaretPosition(text.indexOf("\\") + 1);
    const afterT = layout.getCaretPosition(text.indexOf("\\") + 2);
    const afterE = layout.getCaretPosition(text.indexOf("\\") + 3);

    expect(afterSlash.x).toBeGreaterThan(beforeSlash.x);
    expect(afterT.x).toBeGreaterThan(afterSlash.x);
    expect(afterE.x).toBeGreaterThan(afterT.x);
  });

  it("reports measured caret distances instead of only proportional ratios", () => {
    const layout = createVisualTextLayout("iw", "iw", (text) => {
      if (text === "i") return 1;
      if (text === "w") return 4;
      return text.length;
    });

    expect(layout.getCaretPosition(1).x).toBe(1);
    expect(layout.getCaretPosition(2).x).toBe(5);
    expect(layout.resolveSourceOffsetFromLineX(0, 4)).toBe(2);
  });

  it("maps normalized render text across explicit multiline math source", () => {
    const sourceText = String.raw`$x$ \\ variable`;
    const renderText = String.raw`$x$\\variable`;
    const layout = createVisualTextLayout(sourceText, renderText, measureTextWidth);

    expect(layout.getCaretPosition(0).ratio).toBe(layout.getCaretPosition(1).ratio);
    expect(layout.getCaretPosition(2).ratio).toBe(layout.getCaretPosition(3).ratio);
    expect(layout.getCaretPosition(2).ratio).toBeGreaterThan(layout.getCaretPosition(1).ratio);
    expect(layout.getCaretPosition(4).lineIndex).toBe(1);
  });
});
