import type { WorldPoint } from "../coords/types";
import { worldToSvgPoint } from "./geometry";
import { worldPoint, pt } from "tikz-editor/coords/index";
import type { SvgViewBox } from "tikz-editor/svg/types";
import { parseTikz } from "tikz-editor/parser/index";
import { evaluateTikzFigure } from "tikz-editor/semantic/evaluate";
import { renderPathWithArrows } from "tikz-editor/svg/arrows/render";
import type { SceneFigure, ScenePathCommand } from "tikz-editor/semantic/types";
import type { CircuitPreviewPath, CircuitPreviewText } from "./circuit-preview-builder";
import { resolveComponentPort } from "./circuit-node-registry";

export type CandidateAnchor = {
  id: string;
  label: string;
  world: WorldPoint;
  priority: number;
};

export type PastePlacementDraft = {
  snippets: string[];
  scene: SceneFigure;
  candidateAnchors: CandidateAnchor[];
  activeAnchorIndex: number;
};

export type ClusterPastePreviewData = {
  paths: CircuitPreviewPath[];
  texts: CircuitPreviewText[];
  activeAnchor: {
    x: number;
    y: number;
    label: string;
    index: number;
    total: number;
  };
  candidateAnchors: Array<{
    x: number;
    y: number;
    label: string;
    isActive: boolean;
  }>;
};

function parseNodeText(raw: string): { main: string; sub?: string; italic?: boolean } {
  const textSubMatch = raw.match(/\\textit\{([^}]+)\}\textsubscript\{(?:\s*\\textup\{)?([^}]+)\}?/);
  if (textSubMatch) {
    return { main: textSubMatch[1], sub: textSubMatch[2], italic: true };
  }

  const clean = raw.replace(/\\normalsize/g, "").replace(/[$]/g, "").trim();
  const subMatch = clean.match(/^([A-Za-z]+)_\{?([A-Za-z0-9]+)\}?$/);
  if (subMatch) {
    return { main: subMatch[1], sub: subMatch[2], italic: true };
  }

  return { main: clean, italic: clean.length <= 2 };
}

function encodeCommandsWithOffset(
  commands: readonly ScenePathCommand[],
  dxWorld: number,
  dyWorld: number,
  viewBox: SvgViewBox
): string {
  const parts: string[] = [];
  for (const cmd of commands) {
    if (cmd.kind === "Z") {
      parts.push("Z");
      continue;
    }
    if (cmd.kind === "C") {
      const c1 = worldToSvgPoint(worldPoint(pt(cmd.c1.x + dxWorld), pt(cmd.c1.y + dyWorld)), viewBox);
      const c2 = worldToSvgPoint(worldPoint(pt(cmd.c2.x + dxWorld), pt(cmd.c2.y + dyWorld)), viewBox);
      const to = worldToSvgPoint(worldPoint(pt(cmd.to.x + dxWorld), pt(cmd.to.y + dyWorld)), viewBox);
      parts.push(`C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)} ${c2.x.toFixed(2)} ${c2.y.toFixed(2)} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`);
      continue;
    }
    if (cmd.kind === "A") {
      const to = worldToSvgPoint(worldPoint(pt(cmd.to.x + dxWorld), pt(cmd.to.y + dyWorld)), viewBox);
      const sweep = cmd.sweep ? 0 : 1;
      parts.push(`A ${cmd.rx.toFixed(2)} ${cmd.ry.toFixed(2)} ${(-cmd.xAxisRotation).toFixed(2)} ${cmd.largeArc ? 1 : 0} ${sweep} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`);
      continue;
    }
    const to = worldToSvgPoint(worldPoint(pt(cmd.to.x + dxWorld), pt(cmd.to.y + dyWorld)), viewBox);
    parts.push(`${cmd.kind} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`);
  }
  return parts.join(" ");
}

/**
 * 拓扑排序电路节点：从上到下、从左到右，遇到支路沿支路遍历到底再走下一条支路
 */
export function sortCandidateAnchorsByCircuitBranches(
  anchors: CandidateAnchor[],
  wireEdges: Array<[WorldPoint, WorldPoint]>,
  componentGroups: Array<WorldPoint[]>
): CandidateAnchor[] {
  if (anchors.length <= 1) return anchors;

  const adj = new Map<number, number[]>();
  for (let i = 0; i < anchors.length; i++) adj.set(i, []);

  const findNearestAnchorIndex = (p: WorldPoint): number => {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < anchors.length; i++) {
      const d = Math.hypot(anchors[i].world.x - p.x, anchors[i].world.y - p.y);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestDist <= 3.0 ? bestIdx : -1;
  };

  // 同一元件内部引脚互通
  for (const group of componentGroups) {
    const indices = group.map(findNearestAnchorIndex).filter((idx) => idx >= 0);
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const u = indices[i];
        const v = indices[j];
        if (u !== v) {
          if (!adj.get(u)!.includes(v)) adj.get(u)!.push(v);
          if (!adj.get(v)!.includes(u)) adj.get(v)!.push(u);
        }
      }
    }
  }

  // 导线两端引脚互通
  for (const [p1, p2] of wireEdges) {
    const u = findNearestAnchorIndex(p1);
    const v = findNearestAnchorIndex(p2);
    if (u >= 0 && v >= 0 && u !== v) {
      if (!adj.get(u)!.includes(v)) adj.get(u)!.push(v);
      if (!adj.get(v)!.includes(u)) adj.get(v)!.push(u);
    }
  }

  // 几何比较器：上到下（Y从大到小），左到右（X从小到大）
  const compareGeometric = (aIdx: number, bIdx: number): number => {
    const a = anchors[aIdx];
    const b = anchors[bIdx];
    if (Math.abs(b.world.y - a.world.y) > 1.5) {
      return b.world.y - a.world.y;
    }
    return a.world.x - b.world.x;
  };

  const visited = new Set<number>();
  const orderedIndices: number[] = [];

  const dfs = (u: number) => {
    visited.add(u);
    orderedIndices.push(u);

    const neighbors = (adj.get(u) ?? [])
      .filter((v) => !visited.has(v))
      .sort(compareGeometric);

    for (const v of neighbors) {
      if (!visited.has(v)) {
        dfs(v);
      }
    }
  };

  const allIndices = anchors.map((_, i) => i).sort(compareGeometric);
  for (const root of allIndices) {
    if (!visited.has(root)) {
      dfs(root);
    }
  }

  return orderedIndices.map((idx, i) => ({
    ...anchors[idx],
    id: `anchor-${i + 1}`
  }));
}

export function createPastePlacementDraft(snippets: readonly string[]): PastePlacementDraft | null {
  const normalizedSnippets = snippets
    .map((s) => s.replace(/\r\n?/g, "\n").trim())
    .filter((s) => s.length > 0);
  if (normalizedSnippets.length === 0) {
    return null;
  }

  const code = normalizedSnippets.some((s) => s.includes("\\begin{tikzpicture}"))
    ? normalizedSnippets.join("\n")
    : `\\begin{tikzpicture}\n${normalizedSnippets.join("\n")}\n\\end{tikzpicture}`;

  try {
    const parseRes = parseTikz(code);
    const semRes = evaluateTikzFigure(parseRes.figure, parseRes.source);
    const scene = semRes.scene;

    const rawAnchors: Array<{ label: string; world: WorldPoint; priority: number }> = [];
    const wireEdges: Array<[WorldPoint, WorldPoint]> = [];
    const componentGroups: Array<WorldPoint[]> = [];

    // 1. 提取所有语义定义的节点引脚
    for (const target of semRes.nodeAnchorTargets) {
      const resolved = resolveComponentPort(target.nodeName, target.anchor);
      rawAnchors.push({
        label: resolved.label,
        world: target.world,
        priority: resolved.priority
      });
    }

    // 2. 提取 editHandles 中定义的 coordinate 引脚
    for (const handle of semRes.editHandles) {
      if (handle.kind === "path-point" && handle.sourceRef.sourceId.includes("coordinate")) {
        const resolved = resolveComponentPort(handle.sourceText || "", null);
        rawAnchors.push({
          label: resolved.label,
          world: handle.world,
          priority: resolved.priority
        });
      }
    }

    // 3. 提取所有 Path 的端点与导线连线关系
    const pureWireEndpoints: WorldPoint[] = [];
    for (const el of scene.elements) {
      if (el.kind === "Path") {
        const pts: WorldPoint[] = [];
        for (const cmd of el.commands) {
          if (cmd.kind === "M" || cmd.kind === "L" || cmd.kind === "C" || cmd.kind === "A") {
            pts.push(cmd.to);
          }
        }
        if (pts.length >= 2) {
          wireEdges.push([pts[0], pts[pts.length - 1]]);
          pureWireEndpoints.push(pts[0], pts[pts.length - 1]);
        }
      }
    }

    // 4. 节点去重合并（重合距离 <= 1.5pt，合并为一个节点，优先保留更有语义的元件端口名）
    const DEDUPE_DIST_PT = 1.5;
    const mergedAnchors: CandidateAnchor[] = [];

    for (const raw of rawAnchors) {
      const existingIdx = mergedAnchors.findIndex(
        (a) => Math.hypot(a.world.x - raw.world.x, a.world.y - raw.world.y) <= DEDUPE_DIST_PT
      );
      if (existingIdx >= 0) {
        // 如果新节点优先级更高，替换标签
        if (raw.priority < mergedAnchors[existingIdx].priority) {
          mergedAnchors[existingIdx].label = raw.label;
          mergedAnchors[existingIdx].priority = raw.priority;
        }
      } else {
        mergedAnchors.push({
          id: `temp-${mergedAnchors.length}`,
          label: raw.label,
          world: raw.world,
          priority: raw.priority
        });
      }
    }

    // 5. 如果没有任何元件引脚（如单独复制了一根或多根纯导线），则将导线端点作为候选锚点
    if (mergedAnchors.length === 0) {
      for (const pt of pureWireEndpoints) {
        const existing = mergedAnchors.some(
          (a) => Math.hypot(a.world.x - pt.x, a.world.y - pt.y) <= DEDUPE_DIST_PT
        );
        if (!existing) {
          mergedAnchors.push({
            id: `temp-${mergedAnchors.length}`,
            label: "导线端点",
            world: pt,
            priority: 10
          });
        }
      }
    }

    // 如果仍然没有锚点，则以 (0,0) 为默认锚点
    if (mergedAnchors.length === 0) {
      mergedAnchors.push({
        id: "temp-origin",
        label: "原点",
        world: worldPoint(pt(0), pt(0)),
        priority: 100
      });
    }

    // 6. 执行拓扑分支排序
    const sortedAnchors = sortCandidateAnchorsByCircuitBranches(mergedAnchors, wireEdges, componentGroups);

    return {
      snippets: normalizedSnippets,
      scene,
      candidateAnchors: sortedAnchors,
      activeAnchorIndex: 0
    };
  } catch (error) {
    console.error("[paste-cluster-builder] Failed to parse and evaluate snippets", error);
    return null;
  }
}

export function buildClusterPastePreview(
  draft: PastePlacementDraft,
  liveWorld: WorldPoint,
  viewBox: SvgViewBox
): ClusterPastePreviewData | null {
  const activeAnchor = draft.candidateAnchors[draft.activeAnchorIndex] ?? draft.candidateAnchors[0];
  if (!activeAnchor) return null;

  // 将整个图平移，使得 activeAnchor 的世界坐标对齐 liveWorld
  const dxWorld = liveWorld.x - activeAnchor.world.x;
  const dyWorld = liveWorld.y - activeAnchor.world.y;

  const paths: CircuitPreviewPath[] = [];
  const texts: CircuitPreviewText[] = [];

  for (const el of draft.scene.elements) {
    if (el.kind === "Path") {
      const rendered = renderPathWithArrows(el);
      if (rendered.shaftCommands.length > 0) {
        paths.push({
          d: encodeCommandsWithOffset(rendered.shaftCommands, dxWorld, dyWorld, viewBox),
          strokeWidth: el.style.lineWidth,
          strokeLinecap: el.style.lineCap,
          strokeLinejoin: el.style.lineJoin,
          stroke: el.style.stroke ?? "black",
          fill: el.style.fill ?? "none"
        });
      }
      for (const tip of rendered.tipPaths) {
        paths.push({
          d: encodeCommandsWithOffset(tip.commands, dxWorld, dyWorld, viewBox),
          strokeWidth: el.style.lineWidth,
          strokeLinecap: "butt",
          strokeLinejoin: "miter",
          stroke: "black",
          fill: "black"
        });
      }
    } else if (el.kind === "Text") {
      const parsedText = parseNodeText(el.text);
      const textSvg = worldToSvgPoint(
        worldPoint(pt(el.position.x + dxWorld), pt(el.position.y + dyWorld)),
        viewBox
      );
      texts.push({
        x: textSvg.x,
        y: textSvg.y,
        main: parsedText.main,
        sub: parsedText.sub,
        fontSize: el.style.fontSize ?? 14,
        anchor: el.style.textAnchor ?? "start",
        italic: parsedText.italic
      });
    }
  }

  // 转换所有候选锚点到 SVG 坐标
  const candidateAnchors = draft.candidateAnchors.map((anchor, idx) => {
    const svgPt = worldToSvgPoint(
      worldPoint(pt(anchor.world.x + dxWorld), pt(anchor.world.y + dyWorld)),
      viewBox
    );
    return {
      x: svgPt.x,
      y: svgPt.y,
      label: anchor.label,
      isActive: idx === draft.activeAnchorIndex
    };
  });

  const activeSvgPt = worldToSvgPoint(
    worldPoint(pt(activeAnchor.world.x + dxWorld), pt(activeAnchor.world.y + dyWorld)),
    viewBox
  );

  return {
    paths,
    texts,
    activeAnchor: {
      x: activeSvgPt.x,
      y: activeSvgPt.y,
      label: activeAnchor.label,
      index: draft.activeAnchorIndex + 1,
      total: draft.candidateAnchors.length
    },
    candidateAnchors
  };
}
