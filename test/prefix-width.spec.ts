import { describe, expect, it } from "vitest";

import {
  finalizePrefixWidthTable,
  extendTeXControlWordPrefixEnd,
  findNearestPrefixIndexFromTable,
  hasDanglingMathScriptOperator,
  readPrefixUnitsFromTable,
  scanTeXPrefixState,
  seedPrefixWidthTable,
  stabilizePrefixForMeasurement
} from "../packages/core/src/text/prefix-width.js";
import {
  buildLineStarts,
  findLineEndOffset,
  lineBreakWidthAt,
  lineForOffset
} from "../packages/core/src/text/line-map.js";
import {
  finalizePrefixWidthTable as finalizeMathPrefixWidthTable,
  stabilizePrefixForMeasurement as stabilizeMathPrefixForMeasurement
} from "../packages/core/src/text/knuth-plass/editor/mathPrefix.js";

describe("prefix width helpers", () => {
  it("tracks \\[ ... \\] as math mode and stabilizes by closing \\]", () => {
    const open = scanTeXPrefixState("Cost: \\[x+1");
    expect(open.inMath).toBe(true);
    expect(open.mathMode).toBe("bracket");

    const stabilized = stabilizePrefixForMeasurement("Cost: \\[x+1");
    expect(stabilized.endsWith("\\]")).toBe(true);
  });

  it("tracks $$ ... $$ as math mode and stabilizes with $$", () => {
    const open = scanTeXPrefixState("Cost: $$x+1");
    expect(open.inMath).toBe(true);
    expect(open.mathMode).toBe("dollar-double");

    const stabilized = stabilizePrefixForMeasurement("Cost: $$x+1");
    expect(stabilized.endsWith("$$")).toBe(true);
  });

  it("interpolates unknown measurements and preserves monotonic order", () => {
    const table = [0, 90, Number.NaN, Number.NaN, 210, Number.NaN, 320];
    const finalized = finalizePrefixWidthTable(table, 320);

    expect(finalized[2]).toBe(130);
    expect(finalized[3]).toBe(170);
    expect(finalized[5]).toBe(265);
    for (let index = 1; index < finalized.length; index += 1) {
      expect(finalized[index]).toBeGreaterThanOrEqual(finalized[index - 1] ?? 0);
    }
  });

  it("falls back to proportional mapping when no table is present", () => {
    expect(readPrefixUnitsFromTable(3, 6, 120, null)).toBe(60);
    expect(findNearestPrefixIndexFromTable(55, 6, 120, null)).toBe(3);
  });

  it("uses nearest measured prefix when a table is provided", () => {
    const table = [0, 10, 22, 35, 50];
    expect(findNearestPrefixIndexFromTable(21, 4, 50, table)).toBe(2);
    expect(findNearestPrefixIndexFromTable(48, 4, 50, table)).toBe(4);
  });

  it("carries the last valid math width forward through invalid prefixes", () => {
    const table = [0, 120, Number.NaN, Number.NaN, 320];
    const finalized = finalizeMathPrefixWidthTable(table, 320);

    expect(finalized[1]).toBe(120);
    expect(finalized[2]).toBe(120);
    expect(finalized[3]).toBe(120);
    expect(finalized[4]).toBe(320);
  });

  it("extends prefixes that end inside a control word to the full command", () => {
    const content = String.raw`A\cap B`;

    expect(extendTeXControlWordPrefixEnd(content, 2)).toBe(5);
    expect(extendTeXControlWordPrefixEnd(content, 3)).toBe(5);
    expect(extendTeXControlWordPrefixEnd(content, 4)).toBe(5);
    expect(extendTeXControlWordPrefixEnd(content, 5)).toBe(5);
    expect(extendTeXControlWordPrefixEnd(content, 6)).toBe(6);
  });

  it("extends fraction prefixes that land inside the command name", () => {
    const content = String.raw`x=\frac{n}{2}`;

    expect(extendTeXControlWordPrefixEnd(content, 3)).toBe(7);
    expect(extendTeXControlWordPrefixEnd(content, 4)).toBe(7);
    expect(extendTeXControlWordPrefixEnd(content, 5)).toBe(7);
    expect(extendTeXControlWordPrefixEnd(content, 6)).toBe(7);
    expect(extendTeXControlWordPrefixEnd(content, 7)).toBe(7);
    expect(extendTeXControlWordPrefixEnd(content, 8)).toBe(8);
  });

  it("leaves incomplete fraction math invalid so width can carry forward", () => {
    expect(stabilizeMathPrefixForMeasurement(String.raw`$\frac{n`)).toBe(String.raw`$\frac{n}$`);
  });

  it("stabilizes escaped tails, unbalanced groups, left-right pairs, and script operators", () => {
    expect(stabilizePrefixForMeasurement(String.raw`$x^`)).toBe(String.raw`$x^{}$`);
    expect(stabilizePrefixForMeasurement("\\($x+\\")).toBe(String.raw`\($x+\phantom{}\)`);
    expect(stabilizePrefixForMeasurement(String.raw`\[x+1`)).toBe(String.raw`\[x+1\]`);
    expect(stabilizePrefixForMeasurement(String.raw`$\left( x`)).toBe(String.raw`$\left( x\right.$`);
    expect(stabilizePrefixForMeasurement(String.raw`\textbf{abc`)).toBe(String.raw`\textbf{abc}`);
    expect(stabilizePrefixForMeasurement("$\\alpha\\")).toBe(String.raw`$\alpha\phantom{}$`);

    expect(scanTeXPrefixState(String.raw`\$ $x`).mathMode).toBe("dollar");
    expect(scanTeXPrefixState(String.raw`\(x\) $$y$$`).mathMode).toBe("none");
    expect(hasDanglingMathScriptOperator(String.raw`x\_`)).toBe(false);
    expect(hasDanglingMathScriptOperator(String.raw`x\\_`)).toBe(true);
    expect(hasDanglingMathScriptOperator("   ")).toBe(false);
  });

  it("normalizes invalid prefix width tables before interpolation and lookup", () => {
    expect(seedPrefixWidthTable(3, 42)).toEqual([0, undefined, undefined, 42]);
    expect(finalizePrefixWidthTable([], 10)).toEqual([]);
    expect(finalizePrefixWidthTable([Number.NaN, Number.NaN, Number.NaN], -10)).toEqual([0, 0, 0]);

    const finalized = finalizePrefixWidthTable([0, 80, 40, Number.NaN], 100);
    expect(finalized).toEqual([0, 80, 80, 100]);

    expect(readPrefixUnitsFromTable(0, 4, 40, [0, 10, 20, 30, 40])).toBe(0);
    expect(readPrefixUnitsFromTable(2, 4, 40, [0, 10, 20])).toBe(20);
    expect(readPrefixUnitsFromTable(Number.POSITIVE_INFINITY, 4, 40, [0, 10, 20, 30, 40])).toBe(0);
    expect(readPrefixUnitsFromTable(3.8, 4, 40, [0, 10, Number.NaN, 30, 40])).toBe(30);
    expect(findNearestPrefixIndexFromTable(15, 4, 40, [0, 10, Number.NaN, 30, 40])).toBe(2);
    expect(findNearestPrefixIndexFromTable(15, 0, 40, [0])).toBe(0);
    expect(findNearestPrefixIndexFromTable(Number.POSITIVE_INFINITY, 4, 40, [0, 10, 20, 30, 40])).toBe(4);
  });

  it("extends control symbols and clamps prefix ends", () => {
    const content = String.raw`\% \alpha`;

    expect(extendTeXControlWordPrefixEnd(content, -1)).toBe(0);
    expect(extendTeXControlWordPrefixEnd(content, 1)).toBe(2);
    expect(extendTeXControlWordPrefixEnd(content, 4)).toBe(content.length);
    expect(extendTeXControlWordPrefixEnd(content, 99)).toBe(content.length);
  });
});

describe("line map helpers", () => {
  it("recognizes every supported line break width", () => {
    expect(lineBreakWidthAt("a\nb", 1)).toBe(1);
    expect(lineBreakWidthAt("a\r\nb", 1)).toBe(2);
    expect(lineBreakWidthAt("a\rb", 1)).toBe(1);
    expect(lineBreakWidthAt("abc", 1)).toBe(0);
  });

  it("builds line starts and resolves offsets across mixed newlines", () => {
    const source = "one\r\ntwo\nthree\rfour";
    const starts = buildLineStarts(source);

    expect(starts).toEqual([0, 5, 9, 15]);
    expect(lineForOffset(0, starts)).toBe(1);
    expect(lineForOffset(8, starts)).toBe(2);
    expect(lineForOffset(15, starts)).toBe(4);
    expect(findLineEndOffset(source, 5)).toBe(8);
  });
});
