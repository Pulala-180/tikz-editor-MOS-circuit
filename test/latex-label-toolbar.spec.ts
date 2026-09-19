/**
 * Audits the rich-label toolbar against the *real* MathJax engine.
 *
 * Every toolbar button (and every palette symbol) is applied to a spread of
 * caret/selection placements, and the resulting label is run through the same
 * MathJax pipeline the canvas uses (`createMathJaxNodeTextEngine`). A button
 * that emits LaTeX MathJax cannot typeset fails the `invalid-node-tex` check.
 *
 * This is the standing gate for the defect "toolbar output collapses a label to
 * literal source on the canvas": a `$$` produced by wrapping math already inside
 * `$...$` or leaked selection text all throw here. Adding a new button means
 * adding it to `TOOLBAR_COMMANDS` and it is covered automatically.
 *
 * The toolbar is intentionally small: italic, subscript, superscript and the
 * symbol palette. Bold, overline, bullet lists, alignment and font-size buttons
 * were removed and are no longer audited.
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  LATEX_SYMBOLS,
  MATH_ONLY_COMMANDS,
  applyLatexToolbarCommand,
  insertLatexSymbol,
  type LatexToolbarCommand
} from "../packages/app/src/ui/canvas-panel/latex-label-toolbar.js";
import { createMathJaxNodeTextEngine } from "../packages/core/src/text/mathjax-engine.js";
import type { NodeTextEngine } from "../packages/core/src/text/types.js";

/** Every button rendered in the rich-label toolbar. Keep in sync with the UI. */
const TOOLBAR_COMMANDS: readonly LatexToolbarCommand[] = ["italic", "subscript", "superscript"];

type Scenario = { name: string; text: string; start: number; end: number };

/**
 * Placements that expose the toolbar's delimiter handling: plain text, caret
 * inside/at the edges of `$...$`, whole-run selections, partial selections, and
 * a selection that straddles a text→math boundary.
 */
const SCENARIOS: readonly Scenario[] = [
  { name: "caret in plain text", text: "resistor", start: 3, end: 3 },
  { name: "caret at end of plain text", text: "resistor", start: 8, end: 8 },
  { name: "caret inside math", text: "$x+y$", start: 2, end: 2 },
  { name: "caret before math run", text: "$M_2$", start: 0, end: 0 },
  { name: "caret after math run", text: "$M_2$", start: 5, end: 5 },
  { name: "selection in plain text", text: "resistor", start: 0, end: 3 },
  { name: "selection covers whole math run", text: "$M_2$", start: 0, end: 5 },
  { name: "selection inside math run", text: "$M_2$", start: 1, end: 4 },
  { name: "selection spans math boundary", text: "$M_2$ tail", start: 1, end: 10 },
  { name: "caret inside embedded math", text: "R $x+y$ C", start: 4, end: 4 },
  { name: "selection in embedded math", text: "R $M_2$ C", start: 3, end: 6 }
];

let engine: NodeTextEngine;

beforeAll(async () => {
  // A non-default font forces the MathJax path; the default ("arial-bold")
  // routes to a metrics-only engine that would not catch TeX errors.
  engine = await createMathJaxNodeTextEngine({ font: "mathjax-newcm" });
});

/** Returns MathJax's validation issue for a label, or null when it typesets. */
function validateLabel(text: string) {
  return engine.validate(text);
}

describe("latex label toolbar output is typesettable by MathJax", () => {
  describe.each(TOOLBAR_COMMANDS)("button %s", (command) => {
    it.each(SCENARIOS)("renders: $name", (scenario) => {
      const result = applyLatexToolbarCommand(
        scenario.text,
        scenario.start,
        scenario.end,
        command
      );

      // `$$` is MathJax display-math syntax; it must never be emitted inline,
      // because it collapses the whole label to literal source.
      expect(result.text).not.toContain("$$");

      expect(validateLabel(result.text)).toBeNull();
    });
  });

  it.each(LATEX_SYMBOLS.map((symbol) => [symbol.title, symbol.tex] as const))(
    "palette symbol %s renders",
    (_title, tex) => {
      for (const scenario of SCENARIOS) {
        const result = insertLatexSymbol(scenario.text, scenario.start, scenario.end, tex);
        expect(result.text, `${tex} in "${scenario.name}"`).not.toContain("$$");
        expect(validateLabel(result.text), `${tex} in "${scenario.name}"`).toBeNull();
      }
    }
  );

  it("keeps the whole selection inside the emitted construct (no residue)", () => {
    // Selection text must be fully captured, never left behind.
    const selected = applyLatexToolbarCommand("$M_2$", 1, 4, "subscript");
    expect(selected.text).toBe(String.raw`$_{M_2}$`);
    expect(selected.text.match(/M_2/g) ?? []).toHaveLength(1);
  });

  it("strips selection dollars when the selection crosses a math boundary", () => {
    const result = applyLatexToolbarCommand("$M_2$ tail", 1, 10, "subscript");
    expect(result.text).not.toContain("$$");
    // "tail" is captured into the construct, not left dangling outside it.
    expect(result.text.match(/tail/g) ?? []).toHaveLength(1);
    expect(validateLabel(result.text)).toBeNull();
  });

  it("merges a caret insertion into an adjacent math run without producing $$", () => {
    const atStart = insertLatexSymbol("$M_2$", 0, 0, "\\Omega");
    const atEnd = insertLatexSymbol("$M_2$", 5, 5, "\\Omega");
    expect(atStart.text).not.toContain("$$");
    expect(atEnd.text).not.toContain("$$");
    expect(validateLabel(atStart.text)).toBeNull();
    expect(validateLabel(atEnd.text)).toBeNull();
  });

  it("treats only subscript/superscript as math-only commands", () => {
    expect([...MATH_ONLY_COMMANDS]).toEqual(
      expect.arrayContaining(["subscript", "superscript"])
    );
    expect(MATH_ONLY_COMMANDS.has("italic")).toBe(false);
  });

  it("wraps a selected subscript digit in italics inside math mode", () => {
    // The X_2 → X_{\mathit{2}} flow: selecting the subscript and pressing the
    // italic button must not escape math mode (which would make `_` illegal).
    const result = applyLatexToolbarCommand("$X_2$", 3, 4, "italic");
    expect(result.text).toBe(String.raw`$X_\mathit{2}$`);
    expect(validateLabel(result.text)).toBeNull();
  });
});
