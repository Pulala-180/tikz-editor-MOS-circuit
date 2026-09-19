import { describe, expect, it } from "vitest";
import { applyEditAction } from "../packages/core/src/edit/actions.js";
import { parseTikz } from "../packages/core/src/parser/index.js";
import { evaluateTikzFigure } from "../packages/core/src/semantic/evaluate.js";
import { wp } from "./coords-helpers.js";
import { cm } from "./edit-actions-helpers.js";

// Regression: a net-zero drag cycle must return a component to exactly where it started.
//
// The e2e stress spec (apps/web/e2e/wire-drag-stress.spec.ts) showed a component with an attached
// polyline ending ~27px from its start after such a cycle, while the same component with NO wire
// returned exactly.  Driving the core action directly reproduced it with exact deltas and no pointer
// snapping, and the trace showed the scope's shift being written as `11.38ptcm` -- `formatScopeShiftValue`
// had been changed to emit its own `pt` unit, but `formatScopeTranslationMutation` still appended `cm`.
// The resulting value cannot be parsed, so the shift was dropped and every later drag accumulated on a
// corrupted baseline.
//
// These tests read the scope offset back through a strict unit parser: an unreadable value becomes
// NaN, so the old `11.38ptcm` fails loudly instead of silently drifting.

const PT_PER_CM = 28.4527559055;

const SOURCE = String.raw`\begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (0.8,0.8);
    \coordinate (node_A.g) at (0,0);
  \end{scope}
  \draw[thick, line cap=round] (node_A.g) -- (2.0,0) -- (2.0,2.4);`;

const SOURCE_NO_WIRE = String.raw`\begin{scope}[shift={(0,0)}]
    \draw[thick] (0,0) -- (0.8,0.8);
    \coordinate (node_A.g) at (0,0);
  \end{scope}`;

/** Net zero, mixing axis and diagonal drags -- the diagonal steps are the ones that expose the bug. */
const CYCLE: Array<[number, number]> = [
  [40, 0],
  [0, 40],
  [-40, 0],
  [35, -35],
  [0, -40],
  [-35, 35]
];

// 40 screen px ≈ 0.4 cm at the app's zoom. Only the fact that the CYCLE sums to zero matters.
const PX_TO_CM = 0.01;

/** Strict: an unparseable length yields NaN, which fails the assertions below. */
function lenToPt(raw: string): number {
  const match = /^([-+]?[\d.]+)\s*(pt|mm|cm)?$/.exec(raw.trim());
  if (!match) return Number.NaN;
  const value = Number(match[1]);
  const unit = match[2] ?? "pt";
  return unit === "cm" ? value * PT_PER_CM : unit === "mm" ? value * (PT_PER_CM / 10) : value;
}

/** The scope's offset in pt, reading both the `shift={(x,y)}` and `xshift=/yshift=` forms. */
function shiftPt(source: string): [number, number] {
  const line = source.split("\n").find((candidate) => candidate.includes("\\begin{scope}")) ?? "";
  const pair = line.match(/shift=\{\(([^,()]+),([^)]+)\)\}/);
  if (pair) return [lenToPt(pair[1]), lenToPt(pair[2])];
  const xs = line.match(/xshift=([^,\]]+)/);
  const ys = line.match(/yshift=([^,\]]+)/);
  return [xs ? lenToPt(xs[1]) : 0, ys ? lenToPt(ys[1]) : 0];
}

function wireLineOf(source: string): string {
  return source.split("\n").find((line) => line.includes("line cap=round"))?.trim() ?? "(none)";
}

function runCycle(initial: string, rounds: number): string {
  let current = `\\begin{tikzpicture}\n${initial}\n\\end{tikzpicture}\n`;
  for (let round = 0; round < rounds; round += 1) {
    for (const [dxPx, dyPx] of CYCLE) {
      const parsed = parseTikz(current, { recover: true });
      const semantic = evaluateTikzFigure(parsed.figure, current);
      const result = applyEditAction(current, semantic.editHandles, {
        kind: "moveElements",
        elementIds: ["scope:0"],
        delta: wp(cm(dxPx * PX_TO_CM), cm(dyPx * PX_TO_CM))
      });
      expect(result.kind).toBe("success");
      if (result.kind !== "success") throw new Error("move failed");
      current = result.newSource;
      // Every intermediate step must itself be parseable -- a corrupted write shows up immediately.
      expect(shiftPt(current).some(Number.isNaN), `malformed scope shift:\n${current}`).toBe(false);
    }
  }
  return current;
}

describe("moveElements round-trip: a net-zero drag cycle returns to the start", () => {
  it("control: a component with no attached wire returns exactly", () => {
    const final = runCycle(SOURCE_NO_WIRE, 4);
    expect(shiftPt(final)).toEqual([0, 0]);
  });

  it("with an attached polyline the component AND its wire return to their start", () => {
    const final = runCycle(SOURCE, 4);
    // eslint-disable-next-line no-console
    console.log(`[ROUNDTRIP] final wire = ${wireLineOf(final)}`);
    expect(shiftPt(final)).toEqual([0, 0]);
    // The wire's interior corner is re-derived from the anchor, so it must land back on y=0.
    expect(wireLineOf(final)).toContain("(2,0)");
  });
});
