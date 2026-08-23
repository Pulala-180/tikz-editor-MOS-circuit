import { describe, expect, it } from "vitest";

import { parseTikz } from "../packages/core/src/parser/index.js";
import { evaluateTikzFigure } from "../packages/core/src/semantic/evaluate.js";
import { emitSvg } from "../packages/core/src/svg/emit.js";

function renderSvg(source: string): string {
  const parsed = parseTikz(source);
  const semantic = evaluateTikzFigure(parsed.figure, source);
  return emitSvg(semantic.scene).svg;
}

function extractShaftLineEndpoints(svg: string, sourceId: string): { startX: number; endX: number } | null {
  const escapedSourceId = sourceId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = svg.match(new RegExp(`data-source-id="${escapedSourceId}" d="M ([0-9.\\-]+) [0-9.\\-]+ L ([0-9.\\-]+) [0-9.\\-]+"`));
  if (!match) {
    return null;
  }
  return {
    startX: Number(match[1]),
    endX: Number(match[2])
  };
}

function extractArrowPathPoints(svg: string, sourceId: string, tipKind: string): { x: number; y: number }[] {
  const escapedSourceId = sourceId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedTipKind = tipKind.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = svg.match(
    new RegExp(`data-source-id="${escapedSourceId}" data-arrow-tip-kind="${escapedTipKind}"[^>]* d="([^"]+)"`)
  );
  const d = match?.[1] ?? "";
  const numbers = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((numberMatch) => Number(numberMatch[0]));
  const points: { x: number; y: number }[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    points.push({ x: numbers[index], y: numbers[index + 1] });
  }
  return points;
}

describe("svg arrow geometry", () => {
  it("treats angle 90 as a single end tip instead of splitting it", () => {
    const source = String.raw`\begin{tikzpicture}[->,>=angle 90]
  \draw (0,0) -- (2,0);
\end{tikzpicture}`;
    const parsed = parseTikz(source);
    const semantic = evaluateTikzFigure(parsed.figure, source);
    const path = semantic.scene.elements.find((element) => element.kind === "Path");
    expect(path?.kind).toBe("Path");
    if (path?.kind === "Path") {
      expect(path.style.markerEnd?.tips).toHaveLength(1);
    }
    const svg = emitSvg(semantic.scene).svg;
    const tipMatches = svg.match(/data-arrow-tip-kind="cm-rightarrow"/g) ?? [];
    expect(tipMatches.length).toBe(1);
  });

  it("emits explicit tip path metadata and does not emit SVG markers", () => {
    const source = String.raw`\begin{tikzpicture}[>=Stealth]
  \draw[arrows={-Latex[open,length=10pt,color=blue]}] (0,0) -- (2,0);
  \draw[>->] (0,1) -- (2,1);
\end{tikzpicture}`;
    const svg = renderSvg(source);

    expect(svg).toContain('data-arrow-tip-kind="latex"');
    expect(svg).toContain('data-arrow-tip-kind="stealth"');
    expect(svg).toContain('data-arrow-side="start"');
    expect(svg).toContain('data-arrow-side="end"');
    expect(svg).toContain('data-arrow-index="0"');
    expect(svg).toContain('data-arrow-bend="false"');
    expect(svg).not.toContain("<marker");
    expect(svg).not.toContain("marker-start=");
    expect(svg).not.toContain("marker-end=");
  });

  it("shortens end shafts further when dot separators force after-line-end accumulation", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw[-{Stealth[length=4pt] Stealth[length=4pt]}] (0,0) -- (2,0);
  \draw[-{Stealth[length=4pt] . Stealth[length=4pt]}] (0,1) -- (2,1);
\end{tikzpicture}`;
    const svg = renderSvg(source);

    const plain = extractShaftLineEndpoints(svg, "path:0");
    const dotted = extractShaftLineEndpoints(svg, "path:1");
    expect(plain).not.toBeNull();
    expect(dotted).not.toBeNull();
    if (!plain || !dotted) {
      return;
    }

    expect(dotted.endX).toBeLessThan(plain.endX - 0.3);

    const dottedTips = svg.match(/data-source-id="path:1" data-arrow-tip-kind="stealth"/g) ?? [];
    expect(dottedTips.length).toBe(2);
  });

  it("uses curved geometry for Latex tips and keeps open tips unfilled", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw[-{Latex[open,length=8pt,width=6pt]}] (0,0) -- (2,0);
\end{tikzpicture}`;
    const svg = renderSvg(source);

    const tagMatch = svg.match(/<path data-source-id="path:0" data-arrow-tip-kind="latex"[^>]+>/);
    expect(tagMatch).not.toBeNull();
    const tag = tagMatch?.[0] ?? "";
    expect(tag).toContain('fill="none"');
    expect(tag.includes('stroke="black"') || tag.includes('stroke="#000000"')).toBe(true);
    expect(tag).toContain(' d="M ');
    expect(tag).toContain(" C ");
  });

  it("emits bend metadata and distinct bend/non-bend tip paths", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw[-{Stealth[bend]}] (0,0) .. controls (1,1) and (2,1) .. (3,0);
  \draw[-{Stealth}] (0,-1) .. controls (1,0) and (2,0) .. (3,-1);
\end{tikzpicture}`;
    const svg = renderSvg(source);

    expect(svg).toContain('data-source-id="path:0" data-arrow-tip-kind="stealth" data-arrow-side="end" data-arrow-index="0" data-arrow-bend="true"');
    expect(svg).toContain('data-source-id="path:1" data-arrow-tip-kind="stealth" data-arrow-side="end" data-arrow-index="0" data-arrow-bend="false"');
  });

  it("orients rigid tips from the original transformed arc endpoint tangent", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw[cm={30,0,0,30,(0pt,0pt)}, -{Stealth[inset=0pt,length=7pt,width=7pt]}] (0.03,0) arc[start angle=0, end angle=90, radius=1pt];
\end{tikzpicture}`;
    const svg = renderSvg(source);
    const points = extractArrowPathPoints(svg, "path:0", "stealth");

    expect(points).toHaveLength(4);
    expect(points[1]?.x).toBeCloseTo(points[3]?.x ?? Number.NaN, 3);
    expect(points[0]?.y).toBeCloseTo(points[2]?.y ?? Number.NaN, 3);
  });

  it("emits geometry metadata for additional arrows.meta tip families", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw[-{Kite[] Square[] Circle[] Rays[n=6]}] (0,0) -- (2,0);
  \draw[-{Bracket[] Parenthesis[]}] (0,1) -- (2,1);
\end{tikzpicture}`;
    const svg = renderSvg(source);

    expect(svg).toContain('data-arrow-tip-kind="kite"');
    expect(svg).toContain('data-arrow-tip-kind="square"');
    expect(svg).toContain('data-arrow-tip-kind="circle"');
    expect(svg).toContain('data-arrow-tip-kind="rays"');
    expect(svg).toContain('data-arrow-tip-kind="tee-barb"');
    expect(svg).toContain('data-arrow-tip-kind="arc-barb"');
  });
});
