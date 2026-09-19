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

  it("leaves pointer mapping untouched when the painted width matches the model", () => {
    const layout = createVisualTextLayout("iw", "iw", (text) => (text === "i" ? 1 : 4), {
      renderedWidth: 5
    });

    expect(layout.getLineWidth(0)).toBe(5);
    expect(layout.getCaretPosition(2).x).toBe(5);
    expect(layout.resolveSourceOffsetFromLineX(0, 4)).toBe(2);
  });

  it("advances scripts at MathJax's reduced script size", () => {
    const layout = createVisualTextLayout("$x_{ab}$", "$x_{ab}$", measureTextWidth);

    // 'x' at full size, then the `{ab}` script at 0.707 each.
    expect(layout.getLineWidth(0)).toBeCloseTo(1 + 2 * 0.707, 3);
  });

  it("keeps braced subscript boundaries on the reduced o/u advances", () => {
    const layout = createVisualTextLayout("$v_{out}$", "$v_{out}$", measureTextWidth);

    expect(layout.getCaretPosition(4).x).toBeCloseTo(1, 3);
    expect(layout.getCaretPosition(5).x).toBeCloseTo(1 + 0.707, 3);
    expect(layout.getCaretPosition(6).x).toBeCloseTo(1 + 2 * 0.707, 3);
  });

  it("ends a single-token script after exactly one advance", () => {
    const bare = createVisualTextLayout("$x$", "$x$", measureTextWidth);
    const scripted = createVisualTextLayout(String.raw`$x_\alpha$`, String.raw`$x_\alpha$`, measureTextWidth);

    expect(scripted.getLineWidth(0) - bare.getLineWidth(0)).toBeCloseTo(0.707, 3);
  });

  it("re-anchors pointer mapping to the painted width when scripts shrink the line", () => {
    // `\normalsize` is stripped before measuring, so the model sees `$I_{SS}$`.
    // MathJax paints both subscript `S` at ~0.707; modelling that keeps a click
    // on the painted right edge at the subscript end instead of inside the run.
    const sourceText = String.raw`\normalsize $I_{SS}$`;
    const renderText = "$I_{SS}$";
    const paintedWidth = 1 + 2 * 0.707;

    const layout = createVisualTextLayout(sourceText, renderText, measureTextWidth);
    expect(layout.getLineWidth(0)).toBeCloseTo(paintedWidth, 3);
    expect(layout.resolveSourceOffsetFromLineX(0, paintedWidth)).toBe(18);

    // An explicit painted width still re-anchors any residual model drift.
    const anchored = createVisualTextLayout(sourceText, renderText, measureTextWidth, {
      renderedWidth: paintedWidth
    });
    expect(anchored.resolveSourceOffsetFromLineX(0, paintedWidth)).toBe(18);
    expect(anchored.getCaretPosition(sourceText.length).x).toBeCloseTo(paintedWidth, 3);
  });
});
