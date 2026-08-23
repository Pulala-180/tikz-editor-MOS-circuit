import { describe, expect, it } from "vitest";

import type { MacroBinding } from "../packages/core/src/macros/types.js";
import { parseOptionListRaw } from "../packages/core/src/options/parse.js";
import {
  clamp01,
  mixNormalizedColors,
  normalizeColor,
  normalizeShadingName,
  resolveColorToCss,
  resolveDefineColorModel
} from "../packages/core/src/semantic/style/colors.js";
import {
  cloneArrowMarker,
  makeDefaultArrowMarker,
  parseArrowSideSpecification,
  parseArrowSpecification,
  parseTipsMode
} from "../packages/core/src/semantic/style/arrows.js";
import { parseDashPattern, parseDashValue } from "../packages/core/src/semantic/style/dash.js";
import { defaultStyle } from "../packages/core/src/semantic/style/defaults.js";
import { extractCircleRadius } from "../packages/core/src/semantic/style/extract-circle-radius.js";
import { expandOptionListMacros } from "../packages/core/src/semantic/style/macro-options.js";
import { isInherentlyColoredPattern, parsePatternValue } from "../packages/core/src/semantic/style/patterns.js";

function textMacro(value: string): MacroBinding {
  return {
    kind: "text",
    value,
    provenance: [{ macroName: "\\m", definitionId: "macro:0", definitionSpan: { from: 0, to: 0 }, commandRaw: "\\def" }]
  };
}

describe("semantic style helper parsers", () => {
  it("parses dash patterns and phases with invalid grammar rejection", () => {
    expect(parseDashPattern("on 2pt off 3pt")).toEqual([2, 3]);
    const millimeterPattern = parseDashPattern("{on 1mm off 2mm on 0.5pt off 0.25pt}");
    expect(millimeterPattern?.[0]).toBeCloseTo(2.8453, 4);
    expect(millimeterPattern?.[1]).toBeCloseTo(5.6906, 4);
    expect(millimeterPattern?.slice(2)).toEqual([0.5, 0.25]);
    expect(parseDashPattern("on")).toBeNull();
    expect(parseDashPattern("skip 2pt off 3pt")).toBeNull();
    expect(parseDashPattern("on 0pt off 3pt")).toBeNull();
    expect(parseDashPattern("on nope off 3pt")).toBeNull();

    expect(parseDashValue("solid")).toEqual({ pattern: null, phase: 0 });
    expect(parseDashValue("none")).toEqual({ pattern: null, phase: 0 });
    expect(parseDashValue("on 4pt off 2pt phase 1pt")).toEqual({ pattern: [4, 2], phase: 1 });
    expect(parseDashValue("phase")).toBeNull();
    expect(parseDashValue("on 4pt off 2pt phase nope")).toBeNull();
    expect(parseDashValue("")).toBeNull();
  });

  it("extracts circle radius only from valid radius option values", () => {
    expect(extractCircleRadius(undefined)).toBeNull();
    expect(extractCircleRadius(parseOptionListRaw("[draw, radius=2cm]"))).toBeCloseTo(56.9055, 3);
    expect(extractCircleRadius(parseOptionListRaw("[radius=nope]"))).toBeNull();
    expect(extractCircleRadius(parseOptionListRaw("[circle]"))).toBeNull();
  });

  it("expands macros inside option values and unknown option tokens without mutating unchanged lists", () => {
    const optionList = parseOptionListRaw(String.raw`[draw=\stroke, \mystyle, line width=1pt]`);
    const trace: unknown[] = [];
    const macros = new Map<string, MacroBinding>([
      ["\\stroke", textMacro("red")],
      ["\\mystyle", textMacro("dashed")]
    ]);

    const expanded = expandOptionListMacros([optionList], macros, trace as never);
    expect(expanded).not.toBe(optionList);
    expect(expanded[0]?.raw).toBe("draw=red, dashed, line width=1pt");
    expect(expanded[0]?.entries).toEqual([
      expect.objectContaining({ kind: "kv", key: "draw", valueRaw: "red", raw: "draw=red" }),
      expect.objectContaining({ kind: "unknown", raw: "dashed" }),
      expect.objectContaining({ kind: "kv", key: "line width", valueRaw: "1pt", raw: "line width=1pt" })
    ]);
    expect(trace.length).toBeGreaterThan(0);

    expect(expandOptionListMacros([], macros, undefined)).toEqual([]);
    expect(expandOptionListMacros([optionList], new Map(), undefined)).toBeInstanceOf(Array);
    expect(expandOptionListMacros([parseOptionListRaw("[draw=blue]")], macros, undefined)[0]?.raw).toBe("[draw=blue]");
  });

  it("parses legacy patterns, default empty patterns, and malformed pattern specs", () => {
    const style = defaultStyle();
    style.fillPattern = { kind: "legacy", name: "grid", inherentlyColored: false };

    expect(parsePatternValue("", style)).toMatchObject({
      pattern: { kind: "legacy", name: "grid" },
      recognized: true,
      disabled: false,
      diagnostics: []
    });
    expect(parsePatternValue("none", style)).toEqual({
      pattern: null,
      recognized: true,
      disabled: true,
      diagnostics: []
    });

    const inherentlyColored = parsePatternValue("horizontal lines dark blue", style);
    expect(inherentlyColored.pattern?.kind).toBe("legacy");
    expect(isInherentlyColoredPattern(inherentlyColored.pattern)).toBe(true);

    const malformed = parsePatternValue("Lines[angle=45] trailing", style);
    expect(malformed.recognized).toBe(true);
    expect(malformed.pattern?.kind).toBe("meta-lines");
    expect(malformed.diagnostics).toContain("invalid-pattern-spec:Lines[angle=45] trailing");

    const unclosed = parsePatternValue("Lines[angle=45", style);
    expect(unclosed.recognized).toBe(true);
    expect(unclosed.pattern?.kind).toBe("meta-lines");
    expect(unclosed.diagnostics).toContain("invalid-pattern-spec:Lines[angle=45");

    const unsupported = parsePatternValue("HouseBricks[angle=30]", style);
    expect(unsupported).toMatchObject({
      pattern: null,
      recognized: false,
      disabled: false
    });
    expect(unsupported.diagnostics).toContain("unsupported-pattern:housebricks");
  });

  it("parses meta pattern families with defaults, expressions, invalid values, and unsupported options", () => {
    const style = defaultStyle();
    style.lineWidth = 2.5;

    const lines = parsePatternValue("Lines", style);
    expect(lines.pattern).toMatchObject({ kind: "meta-lines", distance: 3, angle: 0, xshift: 0, yshift: 0, lineWidth: 2.5 });
    expect(lines.diagnostics).toEqual([]);

    const hatch = parsePatternValue("Hatch[distance=4pt,angle={30+15},xshift=1pt,yshift=2pt,line width=0.7pt]", style);
    expect(hatch.pattern).toMatchObject({
      kind: "meta-hatch",
      distance: 4,
      angle: 45,
      xshift: 1,
      yshift: 2,
      lineWidth: 0.7
    });

    const dots = parsePatternValue("Dots[distance=5pt,angle=90,xshift=1pt,yshift=2pt,radius=.8pt,line width=2pt]", style);
    expect(dots.pattern).toMatchObject({
      kind: "meta-dots",
      distance: 5,
      angle: 90,
      xshift: 1,
      yshift: 2,
      radius: 0.8
    });
    expect(dots.diagnostics).toContain("unsupported-pattern-option:dots:line width");

    const stars = parsePatternValue("Stars[distance=6pt,radius=1pt,points=7.4,angle=nope,xshift=nope,yshift=nope,foo=bar]", style);
    expect(stars.pattern).toMatchObject({
      kind: "meta-stars",
      distance: 6,
      radius: 1,
      points: 7
    });
    expect(stars.diagnostics).toEqual(expect.arrayContaining([
      "invalid-pattern-option-value:stars:angle=nope",
      "invalid-pattern-option-value:stars:xshift=nope",
      "invalid-pattern-option-value:stars:yshift=nope",
      "unsupported-pattern-option:stars:foo"
    ]));

    const invalidValues = parsePatternValue("Lines[distance=nope,line width=nope,angle=nope,flag]", style);
    expect(invalidValues.pattern?.kind).toBe("meta-lines");
    expect(invalidValues.diagnostics).toEqual(expect.arrayContaining([
      "invalid-pattern-option-value:lines:distance=nope",
      "invalid-pattern-option-value:lines:line width=nope",
      "invalid-pattern-option-value:lines:angle=nope",
      "invalid-pattern-option:lines:flag"
    ]));

    const invalidStars = parsePatternValue("Stars[radius=nope,points=1]", style);
    expect(invalidStars.pattern?.kind).toBe("meta-stars");
    expect(invalidStars.diagnostics).toEqual(expect.arrayContaining([
      "invalid-pattern-option-value:stars:radius=nope",
      "invalid-pattern-option-value:stars:points=1"
    ]));
  });

  it("normalizes xcolor aliases, relative mixes, model colors, and css-resolvable colors", () => {
    const aliases = new Map([
      ["brand", "red!25!blue"],
      ["accent", "brand!50!."],
      ["empty", ""]
    ]);
    const resolveAlias = (name: string) => aliases.get(name) ?? null;

    expect(normalizeColor("none")).toBe("none");
    expect(normalizeColor(".")).toBe("black");
    expect(normalizeColor(".", { currentColor: "#123456" })).toBe("#123456");
    expect(normalizeColor("brand", { resolveAlias })).toBe("#4000bf");
    expect(normalizeColor("accent", { currentColor: "white", resolveAlias })).toBe("#9f80df");
    expect(normalizeColor("empty", { resolveAlias })).toBe("empty");
    expect(normalizeColor("{rgb,255:red,12;green,34;blue,56}")).toBe("#0c2238");
    expect(normalizeColor("rgb:red,.2;green,.4;blue,.6")).toBe("#336699");
    expect(normalizeColor("rgb:red,1;green,0;blue,0;white,1")).toBe("#ff0000");
    expect(normalizeColor("{rgb:red,1;green,0;blue,0} trailing}")).toBe("{rgb:red,1;green,0;blue,0} trailing}");
    expect(normalizeColor(String.raw`{\{rgb:red,1;green,0;blue,0}`)).toBe(String.raw`\{rgb:red,1;green,0;blue,0`);
    expect(normalizeColor(".", { currentColor: "lightgray" })).toBe("#bfbfbf");
    expect(normalizeColor(".", { currentColor: "red!50!blue" })).toBe("#800080");
    expect(normalizeColor(".", { currentColor: "none" })).toBe("black");
    expect(resolveColorToCss("none")).toBeNull();
    expect(resolveColorToCss("definitely-not-css")).toBeNull();
    expect(resolveColorToCss("blue")).toBe("#0000ff");
    expect(mixNormalizedColors("#000000", "#ffffff", 0.25)).toBe("#bfbfbf");
    expect(mixNormalizedColors("not-a-color", "#ffffff", 0.25)).toBeNull();
    expect(normalizeShadingName("  Axis   Left  ")).toBe("axis left");
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
  });

  it("resolves definecolor models and rejects malformed color specifications", () => {
    expect(resolveDefineColorModel("", "1,2,3")).toBeNull();
    expect(resolveDefineColorModel("RGB", "12,34,56")).toBe("#0c2238");
    expect(resolveDefineColorModel("RGB", "12,34")).toBeNull();
    expect(resolveDefineColorModel("rgb", "0.2,0.4,0.6")).toBe("#336699");
    expect(resolveDefineColorModel("rgb", "0.2,0.4")).toBeNull();
    expect(resolveDefineColorModel("rgb", "0.2,nope,0.6")).toBeNull();
    expect(resolveDefineColorModel("Gray", "7.5")).toBe("#808080");
    expect(resolveDefineColorModel("Gray", "")).toBeNull();
    expect(resolveDefineColorModel("gray", "0.25")).toBe("#404040");
    expect(resolveDefineColorModel("gray", "")).toBeNull();
    expect(resolveDefineColorModel("HTML", "#AABBCC")).toBe("#aabbcc");
    expect(resolveDefineColorModel("HTML", "xyz")).toBeNull();
    expect(resolveDefineColorModel("cmy", "0,0.5,1")).toBe("#ff8000");
    expect(resolveDefineColorModel("cmy", "0,0.5")).toBeNull();
    expect(resolveDefineColorModel("cmyk", "0,0.5,1,0.25")).toBe("#bf6000");
    expect(resolveDefineColorModel("hsb", "0.5,1,1")).toBe("#00ffff");
    expect(resolveDefineColorModel("hsb", "0.5,1")).toBeNull();
    expect(resolveDefineColorModel("HSB", "120,240,240")).toBe("#00ffff");
    expect(resolveDefineColorModel("HSB", "")).toBeNull();
    expect(resolveDefineColorModel("unknown", "1,2,3")).toBeNull();
  });

  it("parses tips modes and complex arrow side specifications", () => {
    expect(parseTipsMode("")).toBe("true");
    expect(parseTipsMode("proper")).toBe("proper");
    expect(parseTipsMode("on draw")).toBe("on draw");
    expect(parseTipsMode("on proper draw")).toBe("on proper draw");
    expect(parseTipsMode("never")).toBe("never");
    expect(parseTipsMode("sometimes")).toBeNull();

    const style = defaultStyle();
    style.lineWidth = 0.8;
    style.arrowShorthandEnd = makeDefaultArrowMarker("stealth", style.lineWidth);

    const marker = parseArrowSideSpecification(String.raw`.{Latex[open,round,sep,color=red]}_ Stealth[length=8pt,width'=3pt,inset'=20pt,line width'=9pt,scale=0.5]`, "end", style);
    expect(marker?.tips).toHaveLength(2);
    expect(marker?.tips[0]).toMatchObject({
      kind: "latex",
      open: true,
      round: true,
      fill: "none",
      color: "#ff0000",
      afterLineEnd: true
    });
    expect(marker?.tips[0]?.sep).toBeGreaterThan(0);
    expect(marker?.tips[1]).toMatchObject({
      kind: "stealth",
      afterLineEnd: true
    });
    expect(marker?.tips[1]?.inset).toBe(10);

    const cappedKite = parseArrowSideSpecification("Kite[length=2pt,inset'=20pt,line width=9pt]", "end", style);
    expect(cappedKite?.tips[0]?.kind).toBe("kite");
    expect(cappedKite?.tips[0]?.inset).toBeLessThan(cappedKite?.tips[0]?.length ?? 0);

    const shorthand = parseArrowSpecification("{|-<}", style);
    expect(shorthand?.start?.tips[0]?.kind).toBe("bar");
    expect(shorthand?.end?.tips[0]?.kind).toBe("stealth");

    const start = parseArrowSideSpecification("Triangle Cap[scale length=2,scale width=3,line width=0pt,sep=2pt,fill=none]", "start", style);
    expect(start?.tips[0]).toMatchObject({
      kind: "triangle-cap",
      open: true,
      fill: "none",
      lineWidth: 0,
      sep: 2
    });

    const cloned = cloneArrowMarker(start!);
    cloned.tips[0].length += 10;
    expect(cloned.tips[0]?.length).not.toBe(start?.tips[0]?.length);
    expect(parseArrowSpecification("to", style)).toBeNull();
    expect(parseArrowSideSpecification("{", "end", style)).toBeNull();
  });
});
