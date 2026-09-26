import type { WorldPoint } from "../coords/types";
import { worldToSvgPoint } from "./geometry";
import { worldPoint, pt } from "tikz-editor/coords/index";
import type { SvgViewBox } from "tikz-editor/svg/types";
import type { ToolMode } from "../../store/types";
import { parseTikz } from "tikz-editor/parser/index";
import { evaluateTikzFigure } from "tikz-editor/semantic/evaluate";
import { renderPathWithArrows } from "tikz-editor/svg/arrows/render";
import type { SceneFigure, ScenePathCommand } from "tikz-editor/semantic/types";
import { getCircuitComponentSnippet, assignUniqueCircuitInstanceIndex, nextCircuitInstanceIndex } from "./circuit-snippets";
import type { NodeTextEngine } from "tikz-editor/text/types";

export type CircuitPreviewPath = {
  d: string;
  strokeWidth?: number;
  strokeLinecap?: "round" | "butt" | "square";
  strokeLinejoin?: "miter" | "round" | "bevel";
  stroke?: string;
  fill?: string;
};

export type CircuitPreviewTextToken = {
  text: string;
  sub?: string;
  italic?: boolean;
};

export type CircuitPreviewText = {
  x: number;
  y: number;
  main: string;
  sub?: string;
  fontSize?: number;
  anchor?: "start" | "middle" | "end";
  italic?: boolean;
  tokens?: CircuitPreviewTextToken[];
};

export type CircuitPreviewData = {
  paths: CircuitPreviewPath[];
  texts?: CircuitPreviewText[];
};

const sceneCache = new Map<string, SceneFigure>();

function getOrEvaluateScene(
  toolMode: ToolMode,
  source?: string,
  textEngine?: NodeTextEngine | null
): SceneFigure | null {
  const rawSnippet = getCircuitComponentSnippet(toolMode, "0", "0");
  if (!rawSnippet) return null;

  const familyMatch = /\bnode_([A-Za-z]+)x\b/.exec(rawSnippet);
  const nextIndex = familyMatch && source ? nextCircuitInstanceIndex(source, familyMatch[1]) : 1;
  const cacheKey = `${toolMode}:${nextIndex}:${textEngine ? "mj" : "plain"}`;
  const cached = sceneCache.get(cacheKey);
  if (cached) return cached;

  const snippet = source ? assignUniqueCircuitInstanceIndex(rawSnippet, source) : rawSnippet;
  const code = snippet.includes("\\begin{tikzpicture}")
    ? snippet
    : `\\begin{tikzpicture}\n${snippet}\n\\end{tikzpicture}`;

  const parseRes = parseTikz(code);
  const semRes = evaluateTikzFigure(parseRes.figure, parseRes.source, {
    textEngine: textEngine ?? undefined
  });
  sceneCache.set(cacheKey, semRes.scene);
  return semRes.scene;
}

export function parseNodeText(raw: string | undefined | null): {
  main: string;
  sub?: string;
  italic?: boolean;
  tokens?: CircuitPreviewTextToken[];
} {
  if (!raw || typeof raw !== "string") {
    return { main: "", italic: false };
  }

  // 1. \textit{...}\textsubscript{...}
  const textSubMatch = raw.match(/\\textit\{([^}]+)\}\\textsubscript\{(?:\s*\\textup\{)?([^}]+)\}?/);
  if (textSubMatch) {
    return {
      main: textSubMatch[1],
      sub: textSubMatch[2],
      italic: true,
      tokens: [{ text: textSubMatch[1], sub: textSubMatch[2], italic: true }]
    };
  }

  // 2. Clean latex commands like \normalsize, \small, \large and $
  const clean = raw.replace(/\\(normalsize|small|large|textbf|mathbf)/g, "").replace(/[$]/g, "").trim();

  // 3. Single variable with subscript, e.g. M_{1}, M_1, R_{D}, V_{in}, C_{gd}
  const singleSubMatch = clean.match(/^([A-Za-z]+)_\{?([A-Za-z0-9]+)\}?$/);
  if (singleSubMatch) {
    return {
      main: singleSubMatch[1],
      sub: singleSubMatch[2],
      italic: true,
      tokens: [{ text: singleSubMatch[1], sub: singleSubMatch[2], italic: true }]
    };
  }

  // 4. Multiple / compound math tokens with subscripts, e.g. g_{m}v_{gs}, g_m v_{gs}, g_{m1}v_{gs1}
  const tokenRegex = /([A-Za-z]+)(?:_\{?([A-Za-z0-9]+)\}?)?/g;
  const tokens: CircuitPreviewTextToken[] = [];
  let match: RegExpExecArray | null;
  let hasAnySub = false;

  while ((match = tokenRegex.exec(clean)) !== null) {
    const text = match[1];
    const sub = match[2];
    if (sub) hasAnySub = true;
    tokens.push({
      text,
      sub,
      italic: true
    });
  }

  if (tokens.length > 0 && hasAnySub) {
    const simplified = tokens.map((t) => t.text + (t.sub || "")).join("");
    return {
      main: simplified,
      italic: true,
      tokens
    };
  }

  if (clean.includes("{") || clean.includes("}") || clean.includes("_")) {
    const simplified = clean.replace(/_\{?([A-Za-z0-9]+)\}?/g, "$1").replace(/[{}]/g, "");
    return { main: simplified, italic: true };
  }

  return { main: clean, italic: clean.length <= 2, tokens: [{ text: clean, italic: clean.length <= 2 }] };
}

function encodeCommands(commands: ScenePathCommand[], liveWorld: WorldPoint, viewBox: SvgViewBox): string {
  const parts: string[] = [];
  for (const cmd of commands) {
    if (cmd.kind === "Z") {
      parts.push("Z");
      continue;
    }
    if (cmd.kind === "C") {
      const c1 = worldToSvgPoint(worldPoint(pt(liveWorld.x + cmd.c1.x), pt(liveWorld.y + cmd.c1.y)), viewBox);
      const c2 = worldToSvgPoint(worldPoint(pt(liveWorld.x + cmd.c2.x), pt(liveWorld.y + cmd.c2.y)), viewBox);
      const to = worldToSvgPoint(worldPoint(pt(liveWorld.x + cmd.to.x), pt(liveWorld.y + cmd.to.y)), viewBox);
      parts.push(`C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)} ${c2.x.toFixed(2)} ${c2.y.toFixed(2)} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`);
      continue;
    }
    if (cmd.kind === "A") {
      const to = worldToSvgPoint(worldPoint(pt(liveWorld.x + cmd.to.x), pt(liveWorld.y + cmd.to.y)), viewBox);
      const sweep = cmd.sweep ? 0 : 1;
      parts.push(`A ${cmd.rx.toFixed(2)} ${cmd.ry.toFixed(2)} ${(-cmd.xAxisRotation).toFixed(2)} ${cmd.largeArc ? 1 : 0} ${sweep} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`);
      continue;
    }
    const to = worldToSvgPoint(worldPoint(pt(liveWorld.x + cmd.to.x), pt(liveWorld.y + cmd.to.y)), viewBox);
    parts.push(`${cmd.kind} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`);
  }
  return parts.join(" ");
}

export function buildCircuitPreview(
  toolMode: ToolMode,
  liveWorld: WorldPoint,
  viewBox: SvgViewBox,
  source?: string,
  textEngine?: NodeTextEngine | null
): CircuitPreviewData | null {
  const scene = getOrEvaluateScene(toolMode, source, textEngine);
  if (!scene) return null;

  const paths: CircuitPreviewPath[] = [];
  const texts: CircuitPreviewText[] = [];

  for (const el of scene.elements) {
    if (el.kind === "Path") {
      const rendered = renderPathWithArrows(el);
      if (rendered.shaftCommands.length > 0) {
        paths.push({
          d: encodeCommands(rendered.shaftCommands, liveWorld, viewBox),
          strokeWidth: el.style.lineWidth,
          strokeLinecap: el.style.lineCap,
          strokeLinejoin: el.style.lineJoin,
          stroke: el.style.stroke ?? "black",
          fill: el.style.fill ?? "none"
        });
      }
      for (const tip of rendered.tipPaths) {
        paths.push({
          d: encodeCommands(tip.commands, liveWorld, viewBox),
          strokeWidth: el.style.lineWidth,
          strokeLinecap: "butt",
          strokeLinejoin: "miter",
          stroke: "black",
          fill: "black"
        });
      }
    } else if (el.kind === "Circle") {
      const center = worldToSvgPoint(worldPoint(pt(liveWorld.x + el.center.x), pt(liveWorld.y + el.center.y)), viewBox);
      const r = el.radius;
      const d = `M ${(center.x - r).toFixed(2)} ${center.y.toFixed(2)} a ${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(r * 2).toFixed(2)} 0 a ${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-r * 2).toFixed(2)} 0`;
      paths.push({
        d,
        strokeWidth: el.style.lineWidth,
        stroke: el.style.stroke ?? "black",
        fill: el.style.fill ?? "none"
      });
    } else if (el.kind === "Text") {
      const pos = worldToSvgPoint(worldPoint(pt(liveWorld.x + el.position.x), pt(liveWorld.y + el.position.y)), viewBox);
      const parsed = parseNodeText(el.text);
      texts.push({
        x: pos.x,
        y: pos.y,
        fontSize: el.style.fontSize ?? 11,
        anchor: "middle",
        main: parsed.main,
        sub: parsed.sub,
        italic: parsed.italic,
        tokens: parsed.tokens
      });
    }
  }

  return { paths, texts };
}
