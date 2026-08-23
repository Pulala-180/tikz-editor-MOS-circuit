import { describe, expect, it } from "vitest";

import { renderTikzToSvgAsync } from "../../packages/core/src/render/index.js";
import type { RenderTikzToSvgResult } from "../../packages/core/src/render/index.js";

type AnchorPoint = {
  x: number;
  y: number;
};

type AnchorParityCase = {
  shape: string;
  nodeName: string;
  anchors: Record<string, AnchorPoint>;
  source?: string;
};

const PGF_ANCHOR_CASES: AnchorParityCase[] = [
  {
    shape: "isosceles triangle",
    nodeName: "it",
    anchors: {
      apex: { x: 47.49797, y: 0 },
      "left corner": { x: -28.78758, y: 31.5973 },
      "right corner": { x: -28.78758, y: -31.5973 },
      "left side": { x: 9.3552, y: 15.79866 },
      "right side": { x: 9.3552, y: -15.79866 },
      "lower side": { x: -28.78758, y: 0 }
    }
  },
  {
    shape: "kite",
    nodeName: "kite",
    anchors: {
      "upper vertex": { x: 0, y: 22.84328 },
      "left vertex": { x: -33.54135, y: 3.4758 },
      "lower vertex": { x: 0, y: -54.62549 },
      "right vertex": { x: 33.54135, y: 3.4758 },
      "upper left side": { x: -16.77068, y: 13.15955 },
      "lower right side": { x: 16.77068, y: -25.57484 }
    }
  },
  {
    shape: "dart",
    nodeName: "dart",
    anchors: {
      tip: { x: 44.32715, y: 0 },
      "tail center": { x: -27.59116, y: 0 },
      "left tail": { x: -42.48526, y: 35.9575 },
      "right tail": { x: -42.48526, y: -35.9575 },
      "left side": { x: 0.92094, y: 17.97874 },
      "right side": { x: 0.92094, y: -17.97874 }
    }
  },
  {
    shape: "regular polygon",
    nodeName: "poly",
    anchors: {
      "corner 1": { x: 0, y: 48.09937 },
      "corner 2": { x: -45.74562, y: 14.86371 },
      "side 1": { x: -22.8728, y: 31.48154 },
      "side 2": { x: -37.00882, y: -12.02484 },
      east: { x: 40.9148, y: 0 },
      west: { x: -40.91603, y: 0 }
    }
  },
  {
    shape: "star",
    nodeName: "star",
    anchors: {
      "outer point 1": { x: 0, y: 58.37921 },
      "inner point 1": { x: -22.87622, y: 31.48665 },
      "outer point 2": { x: -55.52242, y: 18.04039 },
      "inner point 2": { x: -37.01492, y: -12.02692 },
      east: { x: 44.41899, y: 0 },
      west: { x: -44.4184, y: 0 }
    }
  },
  {
    shape: "circle solidus",
    nodeName: "solidus",
    anchors: {
      text: { x: -30.98833, y: 24.04388 },
      lower: { x: 3.47438, y: -3.47438 },
      east: { x: 48.73778, y: 0 },
      north: { x: 0, y: 48.73778 }
    }
  },
  {
    shape: "circle split",
    nodeName: "csplit",
    source: String.raw`\begin{tikzpicture}
  \node[draw, shape=circle split, minimum width=2.2cm, minimum height=1.4cm, fill=pink] (csplit) at (0,0) {Hello there\nodepart{lower}Lower};
\end{tikzpicture}`,
    anchors: {
      lower: { x: -13.1389, y: -10.36629 },
      east: { x: 31.49797, y: 0 },
      north: { x: 0, y: 31.49797 },
      south: { x: 0, y: -31.49797 }
    }
  },
  {
    shape: "ellipse split",
    nodeName: "esplit",
    source: String.raw`\begin{tikzpicture}
  \node[draw, shape=ellipse split, minimum width=2.2cm, minimum height=1.4cm, fill=pink] (esplit) at (0,0) {Hello there\nodepart{lower}Lower};
\end{tikzpicture}`,
    anchors: {
      lower: { x: -13.1389, y: -10.36629 },
      east: { x: 38.91368, y: 0 },
      north: { x: 0, y: 20.11684 },
      south: { x: 0, y: -20.11684 }
    }
  },
  {
    shape: "diamond split",
    nodeName: "dsplit",
    source: String.raw`\begin{tikzpicture}
  \node[draw, shape=diamond split, minimum width=2.2cm, minimum height=1.4cm, fill=pink] (dsplit) at (0,0) {Hello there\nodepart{lower}Lower};
\end{tikzpicture}`,
    anchors: {
      text: { x: -24.0417, y: 1.9361 },
      lower: { x: -13.1389, y: -8.74163 },
      east: { x: 58.44969, y: 0 },
      north: { x: 0, y: 58.4497 },
      south: { x: 0, y: -58.44969 }
    }
  },
  {
    shape: "trapezium",
    nodeName: "trap",
    anchors: {
      "bottom left corner": { x: -103.44681, y: -20.11684 },
      "top left corner": { x: -80.22241, y: 20.11684 },
      "top right corner": { x: 80.22241, y: 20.11684 },
      "bottom right corner": { x: 103.44681, y: -20.11684 },
      "left side": { x: -91.83461, y: 0 },
      "right side": { x: 91.83461, y: 0 },
      "top side": { x: 0, y: 20.11684 },
      "bottom side": { x: 0, y: -20.11684 }
    }
  },
  {
    shape: "semicircle",
    nodeName: "semi",
    anchors: {
      apex: { x: 0, y: 29.52162 },
      "arc start": { x: 40.03368, y: -10.71205 },
      "arc end": { x: -40.03368, y: -10.71205 },
      "chord center": { x: 0, y: -10.71205 },
      east: { x: 38.636, y: -0.03389 },
      west: { x: -38.636, y: -0.03389 }
    }
  },
  {
    shape: "circular sector",
    nodeName: "sector",
    anchors: {
      "sector center": { x: 39.56163, y: 0 },
      "arc start": { x: -18.83281, y: 33.71394 },
      "arc end": { x: -18.83281, y: -33.71394 },
      "arc center": { x: -27.91986, y: 0 },
      east: { x: 39.56416, y: 0.0001 },
      west: { x: -27.91986, y: 0 }
    }
  },
  {
    shape: "cloud",
    nodeName: "cloud",
    anchors: {
      "puff 1": { x: 0, y: 46.19904 },
      "puff 2": { x: -27.14926, y: 37.37555 },
      east: { x: 39.06581, y: 0.00055 },
      north: { x: 0, y: 46.19904 }
    }
  },
  {
    shape: "starburst",
    nodeName: "burst",
    anchors: {
      "outer point 1": { x: 0, y: 20.1521 },
      "inner point 1": { x: -7.16974, y: 9.72903 },
      "outer point 2": { x: -16.42844, y: 15.3808 },
      "inner point 2": { x: -20.45041, y: 8.45805 },
      east: { x: 41.12259, y: 0.00021 },
      west: { x: -42.22487, y: 0.00015 }
    }
  },
  {
    shape: "cylinder",
    nodeName: "cyl",
    anchors: {
      "shape center": { x: 5.03043, y: 0 },
      "before top": { x: 34.37987, y: 31.49797 },
      top: { x: 41.38506, y: 0 },
      "after top": { x: 34.37987, y: -31.49797 },
      "before bottom": { x: -24.31902, y: -31.49797 },
      bottom: { x: -31.3242, y: 0 },
      "after bottom": { x: -24.31902, y: 31.49797 }
    }
  },
  {
    shape: "single arrow",
    nodeName: "single",
    anchors: {
      tip: { x: 43.38753, y: 0 },
      "before tip": { x: 11.6053, y: 31.78079 },
      "after tip": { x: 11.6053, y: -31.78079 },
      "before head": { x: 11.60529, y: 15.72928 },
      "after head": { x: 11.60529, y: -15.72928 },
      "before tail": { x: -27.77467, y: -15.72928 },
      "after tail": { x: -27.77467, y: 15.72928 },
      tail: { x: -27.77467, y: 0 }
    }
  },
  {
    shape: "double arrow",
    nodeName: "double",
    anchors: {
      "tip 1": { x: 43.38753, y: 0 },
      "before tip 1": { x: 11.6053, y: 31.78079 },
      "after tip 1": { x: 11.6053, y: -31.78079 },
      "before head 1": { x: 11.60529, y: 15.72928 },
      "after head 1": { x: 11.60529, y: -15.72928 },
      "tip 2": { x: -43.38753, y: 0 },
      "before tip 2": { x: -11.6053, y: -31.78079 },
      "after tip 2": { x: -11.6053, y: 31.78079 },
      "before head 2": { x: -11.60529, y: -15.72928 },
      "after head 2": { x: -11.60529, y: 15.72928 }
    }
  },
  {
    shape: "rectangle callout",
    nodeName: "rectcall",
    anchors: {
      pointer: { x: 19.05383, y: -33.05424 },
      east: { x: 31.49797, y: 0 },
      west: { x: -31.49797, y: 0 },
      north: { x: 0, y: 20.11684 },
      south: { x: 0, y: -20.11684 }
    }
  },
  {
    shape: "ellipse callout",
    nodeName: "ellcall",
    anchors: {
      pointer: { x: 18.44067, y: -31.98709 },
      east: { x: 38.91368, y: 0 },
      west: { x: -38.91368, y: 0 },
      north: { x: 0, y: 20.11684 },
      south: { x: 0, y: -20.11684 }
    }
  },
  {
    shape: "signal",
    nodeName: "signal",
    anchors: {
      east: { x: 47.57527, y: 0 },
      west: { x: -27.57468, y: 0 },
      north: { x: 0, y: 20.11684 },
      south: { x: 0, y: -20.11684 },
      "north east": { x: 27.4575, y: 20.11682 },
      "south west": { x: -27.57468, y: -20.11684 }
    }
  },
  {
    shape: "tape",
    nodeName: "tape",
    anchors: {
      east: { x: 31.49797, y: 0 },
      west: { x: -31.49797, y: 0 },
      north: { x: 0, y: 17.58119 },
      south: { x: 0, y: -17.5812 },
      "north east": { x: 31.49797, y: 17.45405 },
      "south west": { x: -31.49797, y: -17.45406 }
    }
  }
];

function shapeSource(testCase: AnchorParityCase): string {
  if (testCase.source) {
    return testCase.source;
  }
  return String.raw`\begin{tikzpicture}
  \node[draw, shape=${testCase.shape}, minimum width=2.2cm, minimum height=1.4cm, fill=pink] (${testCase.nodeName}) at (0,0) {Hello there};
\end{tikzpicture}`;
}

function targetFor(
  targets: RenderTikzToSvgResult["semantic"]["nodeAnchorTargets"],
  nodeName: string,
  anchor: string
): AnchorPoint {
  const target = targets.find((candidate) => candidate.nodeName === nodeName && candidate.anchor === anchor);
  if (!target) {
    throw new Error(`Missing node anchor target ${nodeName}.${anchor}.`);
  }
  return target.world;
}

describe("semantic evaluator / PGF node shape anchor parity", () => {
  it.each(PGF_ANCHOR_CASES)("matches PGF named anchors for $shape", async (testCase) => {
    const result = await renderTikzToSvgAsync(shapeSource(testCase));
    expect(result.semantic.diagnostics).toEqual([]);

    for (const [anchor, expected] of Object.entries(testCase.anchors)) {
      const actual = targetFor(result.semantic.nodeAnchorTargets, testCase.nodeName, anchor);
      expect(Math.abs(actual.x - expected.x), `${testCase.shape}.${anchor}.x`).toBeLessThanOrEqual(1);
      expect(Math.abs(actual.y - expected.y), `${testCase.shape}.${anchor}.y`).toBeLessThanOrEqual(1);
    }
  });
});
