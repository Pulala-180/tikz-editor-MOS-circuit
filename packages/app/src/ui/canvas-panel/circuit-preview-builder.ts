import type { WorldPoint } from "../coords/types";
import { worldToSvgPoint } from "./geometry";
import { worldPoint, pt } from "tikz-editor/coords/index";
import type { SvgViewBox } from "tikz-editor/svg/types";
import type { ToolMode } from "../../store/types";
import { parseTikz } from "tikz-editor/parser/index";
import { evaluateTikzFigure } from "tikz-editor/semantic/evaluate";
import { renderPathWithArrows } from "tikz-editor/svg/arrows/render";
import type { SceneFigure, ScenePathCommand } from "tikz-editor/semantic/types";
import { getCircuitComponentSnippet } from "./circuit-snippets";

export type CircuitPreviewPath = {
  d: string;
  strokeWidth?: number;
  strokeLinecap?: "round" | "butt" | "square";
  strokeLinejoin?: "miter" | "round" | "bevel";
  stroke?: string;
  fill?: string;
};

export type CircuitPreviewText = {
  x: number;
  y: number;
  main: string;
  sub?: string;
  fontSize?: number;
  anchor?: "start" | "middle" | "end";
  italic?: boolean;
};

export type CircuitPreviewData = {
  paths: CircuitPreviewPath[];
  texts?: CircuitPreviewText[];
};

const sceneCache = new Map<string, SceneFigure>();

function getOrEvaluateScene(toolMode: ToolMode): SceneFigure | null {
  const cached = sceneCache.get(toolMode);
  if (cached) return cached;

  const snippet = getCircuitComponentSnippet(toolMode, "0", "0");
  if (!snippet) return null;

  const code = snippet.includes("\\begin{tikzpicture}")
    ? snippet
    : `\\begin{tikzpicture}\n${snippet}\n\\end{tikzpicture}`;

  const parseRes = parseTikz(code);
  const semRes = evaluateTikzFigure(parseRes.figure, parseRes.source);
  sceneCache.set(toolMode, semRes.scene);
  return semRes.scene;
}

function parseNodeText(raw: string): { main: string; sub?: string; italic?: boolean } {
  const textSubMatch = raw.match(/\\textit\{([^}]+)\}\\textsubscript\{(?:\s*\\textup\{)?([^}]+)\}?/);
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
  viewBox: SvgViewBox
): CircuitPreviewData | null {
  const scene = getOrEvaluateScene(toolMode);
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
        italic: parsed.italic
      });
    }
  }

  return { paths, texts };
}
