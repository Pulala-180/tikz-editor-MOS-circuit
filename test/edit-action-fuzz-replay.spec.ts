import { describe, expect, it } from "vitest";
import { worldPoint, type WorldPoint } from "../packages/core/src/coords/points.js";
import { pt } from "../packages/core/src/coords/scalars.js";
import { PT_PER_CM } from "../packages/core/src/edit/format.js";
import { applyEditAction, type EditAction } from "../packages/core/src/edit/actions.js";
import { applySourcePatches } from "../packages/core/src/edit/source-patches.js";
import { renderTikzToSvg, type RenderTikzToSvgResult } from "../packages/core/src/render/index.js";

type SuccessfulEditActionResult = Extract<
  ReturnType<typeof applyEditAction>,
  { kind: "success" | "partial" }
>;

function cm(value: number): number {
  return value * PT_PER_CM;
}

function wp(x: number, y: number): WorldPoint {
  return worldPoint(pt(x), pt(y));
}

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function renderForEdit(source: string): RenderTikzToSvgResult {
  return renderTikzToSvg(source, {
    parse: {
      recover: true,
      includeContextDefinitions: true
    },
    svg: { padding: 18 }
  });
}

function sceneSourceIds(rendered: RenderTikzToSvgResult): string[] {
  return Array.from(
    new Set(rendered.semantic.scene.elements.map((element) => element.sourceRef.sourceId))
  );
}

function matrixSourceIds(rendered: RenderTikzToSvgResult): string[] {
  return Array.from(
    new Set(
      rendered.semantic.scene.elements.flatMap((element) =>
        element.matrixCell ? [element.matrixCell.matrixSourceId] : []
      )
    )
  );
}

function assertPatchReplay(
  previousSource: string,
  result: SuccessfulEditActionResult,
  context: string
): void {
  const replayed = applySourcePatches(previousSource, result.patches);
  expect(replayed.kind, context).toBe("success");
  if (replayed.kind !== "success") {
    return;
  }
  expect(replayed.source, context).toBe(result.newSource);
}

function assertRenderable(source: string, context: string): RenderTikzToSvgResult {
  const rendered = renderForEdit(source);
  const parseErrors = rendered.parse.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  expect(parseErrors, context).toEqual([]);
  expect(rendered.svg.svg, context).toContain("<svg");
  return rendered;
}

function assertSelectedIdsResolve(
  result: SuccessfulEditActionResult,
  rendered: RenderTikzToSvgResult,
  context: string
): void {
  const selectedSourceIds = result.selectedSourceIds ?? [];
  if (selectedSourceIds.length === 0) {
    return;
  }

  const ids = new Set(sceneSourceIds(rendered));
  const missing = selectedSourceIds.filter((sourceId) => !ids.has(sourceId) && !sourceId.startsWith("scope:"));
  expect(missing, context).toEqual([]);
}

function sourceIdActions(
  ids: readonly string[],
  rng: () => number
): EditAction[] {
  if (ids.length === 0) {
    return [];
  }

  const elementId = pick(ids, rng);
  const actions: EditAction[] = [
    {
      kind: "moveElement",
      elementId,
      delta: wp(cm((rng() - 0.5) * 0.6), cm((rng() - 0.5) * 0.6))
    },
    {
      kind: "setProperty",
      elementId,
      level: "command",
      key: "line width",
      value: `${(0.4 + rng() * 1.2).toFixed(2)}pt`
    },
    {
      kind: "setProperty",
      elementId,
      level: "command",
      key: "fill",
      value: pick(["red!20", "blue!15", "green!20", "none"], rng)
    },
    {
      kind: "duplicateElements",
      elementIds: [elementId],
      delta: wp(cm(0.25 + rng() * 0.25), cm(-0.25 - rng() * 0.25))
    }
  ];

  const pathIds = ids.filter((id) => id.startsWith("path:"));
  if (pathIds.length > 0) {
    const pathId = pick(pathIds, rng);
    actions.push(
      {
        kind: "reversePath",
        elementId: pathId
      },
      {
        kind: "toggleClosedPath",
        elementId: pathId,
        closed: rng() > 0.5
      },
      {
        kind: "insertPathPoint",
        elementId: pathId,
        segmentIndex: 0,
        point: wp(cm(0.5 + rng()), cm((rng() - 0.5) * 0.8))
      }
    );
  }

  if (ids.length >= 2) {
    const pair = shuffled(ids, rng).slice(0, 2);
    actions.push(
      {
        kind: "moveElements",
        elementIds: pair,
        delta: wp(cm((rng() - 0.5) * 0.4), cm((rng() - 0.5) * 0.4))
      },
      {
        kind: "alignElements",
        elementIds: pair,
        mode: pick(["left", "center", "right", "top", "middle", "bottom"] as const, rng)
      },
      {
        kind: "distributeElements",
        elementIds: pair,
        axis: pick(["horizontal", "vertical"] as const, rng)
      },
      {
        kind: "reorderElements",
        elementIds: [pair[0]],
        direction: pick(["sendToBack", "sendBackward", "bringForward", "bringToFront"] as const, rng)
      },
      {
        kind: "groupElements",
        elementIds: pair
      }
    );
  }

  if (ids.length >= 3) {
    actions.push({
      kind: "deleteElement",
      elementId
    });
  }

  return actions;
}

function matrixActions(rendered: RenderTikzToSvgResult, rng: () => number): EditAction[] {
  const matrixIds = matrixSourceIds(rendered);
  if (matrixIds.length === 0) {
    return [];
  }
  const matrixSourceId = pick(matrixIds, rng);
  return [
    {
      kind: "addMatrixRow",
      matrixSourceId,
      rowIndex: 1
    },
    {
      kind: "addMatrixColumn",
      matrixSourceId,
      columnIndex: 1
    },
    {
      kind: "transposeMatrix",
      matrixSourceId
    },
    {
      kind: "removeMatrixRow",
      matrixSourceId,
      rowIndex: 1
    },
    {
      kind: "removeMatrixColumn",
      matrixSourceId,
      columnIndex: 1
    }
  ];
}

function handleActions(rendered: RenderTikzToSvgResult, rng: () => number): EditAction[] {
  const handles = rendered.semantic.editHandles.filter((handle) =>
    handle.handleType === "coordinate" &&
    handle.kind === "path-point" &&
    handle.coordinateForm === "cartesian" &&
    handle.rewriteMode === "direct"
  );
  if (handles.length === 0) {
    return [];
  }

  const handle = pick(handles, rng);
  return [
    {
      kind: "moveHandle",
      handleId: handle.id,
      newWorld: wp(
        handle.world.x + cm((rng() - 0.5) * 0.5),
        handle.world.y + cm((rng() - 0.5) * 0.5)
      )
    },
    {
      kind: "deletePathPoint",
      elementId: handle.sourceRef.sourceId,
      handleId: handle.id
    },
    {
      kind: "setPathPointKind",
      elementId: handle.sourceRef.sourceId,
      handleId: handle.id,
      pointKind: pick(["corner", "smooth"] as const, rng)
    }
  ];
}

function additiveActions(rng: () => number): EditAction[] {
  const at = wp(cm(rng() * 3), cm(rng() * 2));
  return [
    {
      kind: "addElement",
      template: {
        kind: "rectangle",
        corner: wp(at.x + cm(0.8 + rng()), at.y + cm(0.5 + rng()))
      },
      at
    },
    {
      kind: "addElement",
      template: {
        kind: "line",
        to: wp(at.x + cm(0.7 + rng()), at.y + cm((rng() - 0.5) * 0.8)),
        hasArrow: rng() > 0.5
      },
      at
    },
    {
      kind: "addElement",
      template: {
        kind: "node",
        text: `N${Math.floor(rng() * 100)}`,
        shape: rng() > 0.5 ? "rectangle" : undefined
      },
      at
    }
  ];
}

function candidateActions(
  rendered: RenderTikzToSvgResult,
  rng: () => number
): EditAction[] {
  return shuffled([
    ...sourceIdActions(sceneSourceIds(rendered), rng),
    ...matrixActions(rendered, rng),
    ...handleActions(rendered, rng),
    ...additiveActions(rng)
  ], rng);
}

function applyFirstSuccessfulAction(
  source: string,
  rendered: RenderTikzToSvgResult,
  rng: () => number,
  context: string
): SuccessfulEditActionResult {
  const failures: string[] = [];
  for (const action of candidateActions(rendered, rng)) {
    const result = applyEditAction(source, rendered.semantic.editHandles, action);
    if (result.kind === "success" || result.kind === "partial") {
      if (result.newSource === source) {
        failures.push(`${action.kind}: no-op ${result.kind}`);
        continue;
      }
      return result;
    }
    failures.push(`${action.kind}: ${result.kind}`);
  }
  throw new Error(`${context}: no successful edit action candidates. ${failures.join(", ")}`);
}

function assertSuccessfulActionReplay(
  source: string,
  rendered: RenderTikzToSvgResult,
  action: EditAction,
  context: string
): { source: string; rendered: RenderTikzToSvgResult; result: SuccessfulEditActionResult } {
  const result = applyEditAction(source, rendered.semantic.editHandles, action);
  expect(result.kind, context).toMatch(/^(success|partial)$/);
  if (result.kind !== "success" && result.kind !== "partial") {
    throw new Error(`${context}: edit action did not succeed.`);
  }
  assertPatchReplay(source, result, context);
  const nextRendered = assertRenderable(result.newSource, context);
  assertSelectedIdsResolve(result, nextRendered, context);
  return {
    source: result.newSource,
    rendered: nextRendered,
    result
  };
}

type TargetedReplayScenario = {
  label: string;
  source: string;
  actions: readonly EditAction[];
};

const TARGETED_REPLAY_SCENARIOS: readonly TargetedReplayScenario[] = [
  {
    label: "path editing operations",
    source: String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0) -- (1,1);
\end{tikzpicture}`,
    actions: [
      { kind: "reversePath", elementId: "path:0" },
      { kind: "insertPathPoint", elementId: "path:0", segmentIndex: 0, point: wp(cm(0.4), cm(0.3)) },
      { kind: "toggleClosedPath", elementId: "path:0", closed: true }
    ]
  },
  {
    label: "align operation",
    source: String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0);
  \draw (2,2) -- (3,2);
\end{tikzpicture}`,
    actions: [
      { kind: "alignElements", elementIds: ["path:0", "path:1"], mode: "left" }
    ]
  },
  {
    label: "distribute and reorder operations",
    source: String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0);
  \draw (2,0) -- (3,0);
  \draw (10,0) -- (11,0);
\end{tikzpicture}`,
    actions: [
      { kind: "distributeElements", elementIds: ["path:0", "path:1", "path:2"], axis: "horizontal" },
      { kind: "reorderElements", elementIds: ["path:0"], direction: "bringToFront" }
    ]
  },
  {
    label: "group operation",
    source: String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0);
  \draw (0,1) -- (1,1);
  \draw (0,2) -- (1,2);
\end{tikzpicture}`,
    actions: [
      { kind: "groupElements", elementIds: ["path:0", "path:1"] }
    ]
  },
  {
    label: "repeat operation",
    source: String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0);
\end{tikzpicture}`,
    actions: [
      {
        kind: "repeatElements",
        elementIds: ["path:0"],
        columns: 2,
        rows: 2,
        horizontalStep: cm(1.5),
        verticalStep: cm(1)
      }
    ]
  },
  {
    label: "ungroup operation",
    source: String.raw`\begin{tikzpicture}
  \begin{scope}
    \draw (0,0) -- (1,0);
    \draw (0,1) -- (1,1);
  \end{scope}
\end{tikzpicture}`,
    actions: [
      { kind: "ungroupElements", elementIds: ["scope:0"] }
    ]
  },
  {
    label: "matrix structure operations",
    source: String.raw`\begin{tikzpicture}
  \matrix [matrix of nodes] at (0,0) {
    A & B \\
    C & D \\
  };
\end{tikzpicture}`,
    actions: [
      { kind: "addMatrixRow", matrixSourceId: "path:0", rowIndex: 2 },
      { kind: "addMatrixColumn", matrixSourceId: "path:0", columnIndex: 2 },
      { kind: "transposeMatrix", matrixSourceId: "path:0" }
    ]
  },
  {
    label: "node text update and duplication",
    source: String.raw`\begin{tikzpicture}
  \node[draw] at (0,0) {A};
\end{tikzpicture}`,
    actions: [
      { kind: "updateNodeText", elementId: "path:0", text: "Updated" },
      { kind: "duplicateElements", elementIds: ["path:0"], delta: wp(cm(1), cm(-0.5)) }
    ]
  }
];

const SEEDS = [
  {
    label: "paths and node",
    source: String.raw`\begin{tikzpicture}
  \draw[blue] (0,0) -- (1,0) -- (1,1);
  \node[draw] at (2,1) {A};
\end{tikzpicture}`
  },
  {
    label: "closed shapes",
    source: String.raw`\begin{tikzpicture}
  \draw[fill=yellow!20] (0,0) rectangle (1.5,1);
  \draw[red] (2,0) circle (0.5cm);
\end{tikzpicture}`
  },
  {
    label: "matrix and connector",
    source: String.raw`\begin{tikzpicture}
  \matrix [matrix of nodes] at (0,0) {
    A & B \\
    C & D \\
  };
  \draw (0,0) -- (2,1);
\end{tikzpicture}`
  }
] as const;

describe("edit action fuzz/replay", () => {
  for (const scenario of TARGETED_REPLAY_SCENARIOS) {
    it(`replays targeted ${scenario.label}`, () => {
      let source = scenario.source;
      let rendered = assertRenderable(source, `${scenario.label}: initial render`);

      for (const [actionIndex, action] of scenario.actions.entries()) {
        const context = `${scenario.label}: ${action.kind} ${actionIndex + 1}`;
        const next = assertSuccessfulActionReplay(source, rendered, action, context);
        source = next.source;
        rendered = next.rendered;
      }
    });
  }

  for (const [seedIndex, seed] of SEEDS.entries()) {
    it(`keeps source patches replayable and renderable for ${seed.label}`, () => {
      const rng = makeRng(0xC0FFEE + seedIndex);
      let source = seed.source;
      let rendered = assertRenderable(source, `${seed.label}: initial render`);

      for (let step = 0; step < 12; step += 1) {
        const context = `${seed.label}: step ${step + 1}`;
        const result = applyFirstSuccessfulAction(source, rendered, rng, context);
        assertPatchReplay(source, result, context);
        rendered = assertRenderable(result.newSource, context);
        assertSelectedIdsResolve(result, rendered, context);
        source = result.newSource;
      }
    });
  }
});
