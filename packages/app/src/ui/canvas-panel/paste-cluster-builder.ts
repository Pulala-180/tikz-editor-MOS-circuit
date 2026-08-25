import type { WorldPoint } from "../coords/types";
import { worldToSvgPoint } from "./geometry";
import { worldPoint, pt, scalarValue } from "tikz-editor/coords/index";
import { ptToCm } from "tikz-editor/coords/source";
import type { SvgViewBox } from "tikz-editor/svg/types";
import { parseTikz } from "tikz-editor/parser/index";
import { evaluateTikzFigure } from "tikz-editor/semantic/evaluate";
import { parseStatementSnapshot, statementSnippet } from "tikz-editor/edit/statement-ops";
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

function parseNodeText(raw: string | undefined | null): { main: string; sub?: string; italic?: boolean } {
  if (!raw || typeof raw !== "string") {
    return { main: "", italic: false };
  }
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
      if (!cmd.c1 || !cmd.c2 || !cmd.to) continue;
      const c1 = worldToSvgPoint(worldPoint(pt(cmd.c1.x + dxWorld), pt(cmd.c1.y + dyWorld)), viewBox);
      const c2 = worldToSvgPoint(worldPoint(pt(cmd.c2.x + dxWorld), pt(cmd.c2.y + dyWorld)), viewBox);
      const to = worldToSvgPoint(worldPoint(pt(cmd.to.x + dxWorld), pt(cmd.to.y + dyWorld)), viewBox);
      parts.push(`C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)} ${c2.x.toFixed(2)} ${c2.y.toFixed(2)} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`);
      continue;
    }
    if (cmd.kind === "A") {
      if (!cmd.to) continue;
      const to = worldToSvgPoint(worldPoint(pt(cmd.to.x + dxWorld), pt(cmd.to.y + dyWorld)), viewBox);
      const sweep = cmd.sweep ? 0 : 1;
      parts.push(`A ${cmd.rx.toFixed(2)} ${cmd.ry.toFixed(2)} ${(-cmd.xAxisRotation).toFixed(2)} ${cmd.largeArc ? 1 : 0} ${sweep} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`);
      continue;
    }
    if (cmd.to) {
      const to = worldToSvgPoint(worldPoint(pt(cmd.to.x + dxWorld), pt(cmd.to.y + dyWorld)), viewBox);
      parts.push(`${cmd.kind} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`);
    }
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
  for (let i = 0; i < anchors.length; i++) {
    adj.set(i, []);
  }

  const findAnchorIndex = (ptWorld: WorldPoint): number => {
    return anchors.findIndex(
      (a) => Math.hypot(a.world.x - ptWorld.x, a.world.y - ptWorld.y) <= 3.0
    );
  };

  for (const [p1, p2] of wireEdges) {
    const idx1 = findAnchorIndex(p1);
    const idx2 = findAnchorIndex(p2);
    if (idx1 >= 0 && idx2 >= 0 && idx1 !== idx2) {
      adj.get(idx1)?.push(idx2);
      adj.get(idx2)?.push(idx1);
    }
  }

  for (const group of componentGroups) {
    const indices = group.map(findAnchorIndex).filter((idx) => idx >= 0);
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const u = indices[i];
        const v = indices[j];
        if (!adj.get(u)?.includes(v)) adj.get(u)?.push(v);
        if (!adj.get(v)?.includes(u)) adj.get(v)?.push(u);
      }
    }
  }

  const compareGeometric = (i: number, j: number): number => {
    const a = anchors[i];
    const b = anchors[j];
    const dy = b.world.y - a.world.y;
    if (Math.abs(dy) > 4.0) {
      return dy;
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

function offsetSnippetDirect(snippet: string, deltaXCm: number, deltaYCm: number): string {
  const trimmed = snippet.trimStart();
  if (trimmed.startsWith("\\begin{scope}")) {
    const shiftMatch = snippet.match(/\\begin\{scope\}\s*\[(.*?)shift=\s*\{?\s*\(\s*([-0-9.]+)\s*,\s*([-0-9.]+)\s*\)\s*\}?(.*?)\]/s);
    if (shiftMatch) {
      const prefix = shiftMatch[1];
      const oldX = parseFloat(shiftMatch[2]);
      const oldY = parseFloat(shiftMatch[3]);
      const suffix = shiftMatch[4];
      const newX = (oldX + deltaXCm).toFixed(2);
      const newY = (oldY + deltaYCm).toFixed(2);
      return snippet.replace(
        shiftMatch[0],
        `\\begin{scope}[${prefix}shift={(${newX},${newY})}${suffix}]`
      );
    }
    const scopeOpenWithOptions = snippet.match(/\\begin\{scope\}\s*\[(.*?)\]/s);
    if (scopeOpenWithOptions) {
      const existingOpts = scopeOpenWithOptions[1].trim();
      const newShift = `shift={(${deltaXCm.toFixed(2)},${deltaYCm.toFixed(2)})}`;
      const newOpts = existingOpts ? `${newShift}, ${existingOpts}` : newShift;
      return snippet.replace(scopeOpenWithOptions[0], `\\begin{scope}[${newOpts}]`);
    }
    const scopeOpenNoOptions = snippet.match(/\\begin\{scope\}/s);
    if (scopeOpenNoOptions) {
      return snippet.replace(
        scopeOpenNoOptions[0],
        `\\begin{scope}[shift={(${deltaXCm.toFixed(2)},${deltaYCm.toFixed(2)})}]`
      );
    }
    return snippet;
  }

  return snippet.replace(/\(\s*([-0-9.]+)\s*,\s*([-0-9.]+)\s*\)/g, (match, xStr, yStr) => {
    const x = parseFloat(xStr);
    const y = parseFloat(yStr);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      const newX = (x + deltaXCm).toFixed(2);
      const newY = (y + deltaYCm).toFixed(2);
      return `(${newX},${newY})`;
    }
    return match;
  });
}

function computeSnippetsCenterCm(snippets: readonly string[]): { xCm: number; yCm: number } {
  try {
    const code = `\\begin{tikzpicture}\n${snippets.join("\n")}\n\\end{tikzpicture}`;
    const parsed = parseTikz(code);
    const sem = evaluateTikzFigure(parsed.figure, code);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const el of sem.scene.elements) {
      if (el.kind === "Path") {
        for (const cmd of el.commands) {
          if (cmd.kind !== "Z" && cmd.to) {
            minX = Math.min(minX, cmd.to.x);
            maxX = Math.max(maxX, cmd.to.x);
            minY = Math.min(minY, cmd.to.y);
            maxY = Math.max(maxY, cmd.to.y);
          }
        }
      } else if (el.kind === "Text") {
        minX = Math.min(minX, el.position.x);
        maxX = Math.max(maxX, el.position.x);
        minY = Math.min(minY, el.position.y);
        maxY = Math.max(maxY, el.position.y);
      }
    }
    if (!Number.isFinite(minX)) {
      return { xCm: 0, yCm: 0 };
    }
    const centerXPt = (minX + maxX) / 2;
    const centerYPt = (minY + maxY) / 2;
    return {
      xCm: parseFloat(scalarValue(ptToCm(pt(centerXPt))).toFixed(2)),
      yCm: parseFloat(scalarValue(ptToCm(pt(centerYPt))).toFixed(2))
    };
  } catch {
    return { xCm: 0, yCm: 0 };
  }
}

function parseScopeOptions(optString: string): { shiftX: number; shiftY: number; xscale: number; yscale: number } {
  let shiftX = 0;
  let shiftY = 0;
  let xscale = 1;
  let yscale = 1;
  const shiftMatch = optString.match(/shift=\s*\{?\s*\(\s*([-0-9.]+)\s*,\s*([-0-9.]+)\s*\)\s*\}?/);
  if (shiftMatch) {
    shiftX = parseFloat(shiftMatch[1]);
    shiftY = parseFloat(shiftMatch[2]);
  }
  const xscaleMatch = optString.match(/xscale=\s*(-?[0-9.]+)/);
  if (xscaleMatch) {
    xscale = parseFloat(xscaleMatch[1]);
  }
  const yscaleMatch = optString.match(/yscale=\s*(-?[0-9.]+)/);
  if (yscaleMatch) {
    yscale = parseFloat(yscaleMatch[1]);
  }
  return { shiftX, shiftY, xscale, yscale };
}

function updateScopeOptions(
  optString: string,
  newShiftX: number,
  newShiftY: number,
  extraXScale: number = 1,
  extraYScale: number = 1
): string {
  let opts = optString;
  const shiftMatch = opts.match(/shift=\s*\{?\s*\(\s*([-0-9.]+)\s*,\s*([-0-9.]+)\s*\)\s*\}?/);
  const newShiftStr = `shift={(${newShiftX.toFixed(2)},${newShiftY.toFixed(2)})}`;
  if (shiftMatch) {
    opts = opts.replace(shiftMatch[0], newShiftStr);
  } else {
    opts = opts.trim().length > 0 ? `${newShiftStr}, ${opts}` : newShiftStr;
  }

  if (extraXScale !== 1) {
    const xmatch = opts.match(/xscale=\s*(-?[0-9.]+)/);
    if (xmatch) {
      const val = parseFloat(xmatch[1]) * extraXScale;
      opts =
        val === 1
          ? opts.replace(xmatch[0], "").replace(/^,\s*|,\s*$/g, "").replace(/,\s*,/g, ",")
          : opts.replace(xmatch[0], `xscale=${val}`);
    } else {
      opts = `${opts}, xscale=${extraXScale}`;
    }
  }

  if (extraYScale !== 1) {
    const ymatch = opts.match(/yscale=\s*(-?[0-9.]+)/);
    if (ymatch) {
      const val = parseFloat(ymatch[1]) * extraYScale;
      opts =
        val === 1
          ? opts.replace(ymatch[0], "").replace(/^,\s*|,\s*$/g, "").replace(/,\s*,/g, ",")
          : opts.replace(ymatch[0], `yscale=${val}`);
    } else {
      opts = `${opts}, yscale=${extraYScale}`;
    }
  }

  return opts.replace(/^,\s*|,\s*$/g, "").replace(/,\s*,/g, ",");
}

function wrapSnippetsIntoClusterScope(snippets: readonly string[]): string[] {
  if (snippets.length <= 1) {
    return [...snippets];
  }
  const center = computeSnippetsCenterCm(snippets);
  const localSnippets = snippets.map((s) => offsetSnippetDirect(s, -center.xCm, -center.yCm));
  const innerBody = localSnippets.map((s) => `  ${s}`).join("\n");
  const wrapped = `\\begin{scope}[shift={(${center.xCm.toFixed(2)},${center.yCm.toFixed(2)})}, clusterScope=true]\n${innerBody}\n\\end{scope}`;
  return [wrapped];
}

export function unwrapPasteClusterSnippets(
  snippets: readonly string[],
  deltaXCm: number = 0,
  deltaYCm: number = 0
): string[] {
  if (snippets.length === 1 && snippets[0].includes("clusterScope=true")) {
    const wrappedScope = snippets[0];
    const outerMatch = wrappedScope.match(/^\\begin\{scope\}\s*\[(.*?)\]\s*\n([\s\S]*)\n\\end\{scope\}$/);
    if (!outerMatch) {
      return snippets.map((s) => offsetSnippetDirect(s, deltaXCm, deltaYCm));
    }
    const outerOpts = outerMatch[1].replace(/,?\s*clusterScope=true/g, "").replace(/^,\s*|,\s*$/g, "");
    const innerContent = outerMatch[2];
    const outerParsed = parseScopeOptions(outerOpts);

    const finalOuterX = outerParsed.shiftX + deltaXCm;
    const finalOuterY = outerParsed.shiftY + deltaYCm;
    const outerSx = outerParsed.xscale;
    const outerSy = outerParsed.yscale;

    const dummyCode = `\\begin{tikzpicture}\n${innerContent}\n\\end{tikzpicture}`;
    const snapshot = parseStatementSnapshot(dummyCode);
    const rootRefs = snapshot.byParentKey.get("root") ?? [];

    const resultSnippets: string[] = [];
    for (const ref of rootRefs) {
      const rawSnippet = statementSnippet(dummyCode, ref).trim();
      if (ref.statement.kind === "Scope") {
        const scopeOptMatch = rawSnippet.match(/\\begin\{scope\}(?:\s*\[(.*?)\])?/s);
        const innerOptStr = scopeOptMatch?.[1] ?? "";
        const innerParsed = parseScopeOptions(innerOptStr);

        const newInnerX = finalOuterX + outerSx * innerParsed.shiftX;
        const newInnerY = finalOuterY + outerSy * innerParsed.shiftY;
        const updatedOpts = updateScopeOptions(innerOptStr, newInnerX, newInnerY, outerSx, outerSy);

        let newSnippet = rawSnippet;
        if (scopeOptMatch) {
          newSnippet = rawSnippet.replace(scopeOptMatch[0], `\\begin{scope}[${updatedOpts}]`);
        }
        resultSnippets.push(newSnippet);
      } else if (ref.statement.kind === "Path") {
        const transformedPath = rawSnippet.replace(/\(\s*([-0-9.]+)\s*,\s*([-0-9.]+)\s*\)/g, (match, xStr, yStr) => {
          const x = parseFloat(xStr);
          const y = parseFloat(yStr);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            const newX = (finalOuterX + outerSx * x).toFixed(2);
            const newY = (finalOuterY + outerSy * y).toFixed(2);
            return `(${newX},${newY})`;
          }
          return match;
        });
        resultSnippets.push(transformedPath);
      } else {
        resultSnippets.push(rawSnippet);
      }
    }
    return resultSnippets;
  }

  return snippets.map((s) => offsetSnippetDirect(s, deltaXCm, deltaYCm));
}

export function createPastePlacementDraft(snippets: readonly string[]): PastePlacementDraft | null {
  const normalizedSnippets = snippets
    .map((s) => s.replace(/\r\n?/g, "\n").trim())
    .filter((s) => s.length > 0);
  if (normalizedSnippets.length === 0) {
    return null;
  }

  let effectiveSnippets = normalizedSnippets;
  if (normalizedSnippets.length > 1 && !normalizedSnippets.some((s) => s.includes("clusterScope=true"))) {
    try {
      effectiveSnippets = wrapSnippetsIntoClusterScope(normalizedSnippets);
    } catch {
      effectiveSnippets = normalizedSnippets;
    }
  }

  const code = effectiveSnippets.some((s) => s.includes("\\begin{tikzpicture}"))
    ? effectiveSnippets.join("\n")
    : `\\begin{tikzpicture}\n${effectiveSnippets.join("\n")}\n\\end{tikzpicture}`;

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
            if (cmd.to) pts.push(cmd.to);
          }
        }
        if (pts.length >= 2) {
          wireEdges.push([pts[0], pts[pts.length - 1]]);
          pureWireEndpoints.push(pts[0], pts[pts.length - 1]);
        }
      }
    }

    // 4. 对同一位置的引脚去重合并
    const DEDUPE_DIST_PT = 2.0;
    const mergedAnchors: CandidateAnchor[] = [];
    for (const raw of rawAnchors) {
      const existing = mergedAnchors.find(
        (a) => Math.hypot(a.world.x - raw.world.x, a.world.y - raw.world.y) <= DEDUPE_DIST_PT
      );
      if (existing) {
        if (raw.priority < existing.priority) {
          existing.label = raw.label;
          existing.priority = raw.priority;
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
      snippets: effectiveSnippets,
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
  try {
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
        if (rendered.tipPaths && rendered.tipPaths.length > 0) {
          for (const tip of rendered.tipPaths) {
            paths.push({
              d: encodeCommandsWithOffset(tip.commands, dxWorld, dyWorld, viewBox),
              strokeWidth: tip.strokeWidth,
              strokeLinecap: "butt",
              strokeLinejoin: "miter",
              stroke: tip.stroke ?? "black",
              fill: tip.fill ?? "black"
            });
          }
        }
      } else if (el.kind === "Text") {
        const svgPt = worldToSvgPoint(
          worldPoint(pt(el.position.x + dxWorld), pt(el.position.y + dyWorld)),
          viewBox
        );
        const parsed = parseNodeText(el.text);
        texts.push({
          main: parsed.main,
          sub: parsed.sub,
          italic: parsed.italic,
          x: svgPt.x,
          y: svgPt.y,
          fontSize: el.style.fontSize ?? 11,
          anchor: el.anchor ?? "center"
        });
      }
    }

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
  } catch (error) {
    console.error("[paste-cluster-builder] buildClusterPastePreview failed", error);
    return null;
  }
}

function toggleScopeScaleOption(snippet: string, optionKey: "xscale" | "yscale"): string {
  const scopeRegex = /\\begin\{scope\}\s*\[(.*?)\]/s;
  const match = snippet.match(scopeRegex);
  if (match) {
    const rawOpts = match[1];
    const keyRegex = new RegExp(`(^|[,\\s])${optionKey}\\s*=\\s*(-?[0-9.]+)`, "i");
    const keyMatch = rawOpts.match(keyRegex);
    let newOpts: string;
    if (keyMatch) {
      const val = parseFloat(keyMatch[2]);
      const newVal = -val;
      if (newVal === 1) {
        newOpts = rawOpts.replace(keyMatch[0], "").replace(/^,\s*|,\s*$/g, "").replace(/,\s*,/g, ",");
      } else {
        newOpts = rawOpts.replace(keyMatch[0], `${keyMatch[1]}${optionKey}=${newVal}`);
      }
    } else {
      newOpts = rawOpts.trim().length > 0 ? `${rawOpts}, ${optionKey}=-1` : `${optionKey}=-1`;
    }
    return snippet.replace(match[0], `\\begin{scope}[${newOpts}]`);
  } else if (snippet.startsWith("\\begin{scope}")) {
    return snippet.replace("\\begin{scope}", `\\begin{scope}[${optionKey}=-1]`);
  }
  return snippet;
}

export function flipPastePlacementDraft(
  draft: PastePlacementDraft,
  axis: "vertical" | "horizontal"
): PastePlacementDraft {
  const optionKey = axis === "vertical" ? "yscale" : "xscale";
  const newSnippets = draft.snippets.map((snippet) => toggleScopeScaleOption(snippet, optionKey));
  const newDraft = createPastePlacementDraft(newSnippets);
  if (!newDraft) return draft;

  newDraft.activeAnchorIndex = Math.min(draft.activeAnchorIndex, newDraft.candidateAnchors.length - 1);
  return newDraft;
}

export function cyclePastePlacementDraftAnchor(
  draft: PastePlacementDraft,
  direction: "next" | "prev" = "next"
): PastePlacementDraft {
  const total = draft.candidateAnchors.length;
  if (total <= 1) return draft;
  const step = direction === "prev" ? total - 1 : 1;
  return {
    ...draft,
    activeAnchorIndex: (draft.activeAnchorIndex + step) % total
  };
}
