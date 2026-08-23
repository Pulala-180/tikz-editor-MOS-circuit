import { describe, it, expect } from "vitest";
import { renderTikzToSvg } from "../packages/core/src/render/index.js";

function renderSvg(source: string) {
  const result = renderTikzToSvg(source);
  return { svg: result.svg.svg, scene: result.semantic.scene, diagnostics: result.semantic.diagnostics };
}

describe("statement-level macro expansion", () => {
  describe("\\newcommand with TikZ elements", () => {
    it("macro expanding to a single \\node", () => {
      const source = String.raw`\begin{tikzpicture}
        \newcommand{\mynode}[2]{\node[#1] at (#2,0) {hello};}
        \mynode{red}{3}
      \end{tikzpicture}`;

      const { svg, scene } = renderSvg(source);
      expect(scene.elements.filter(e => e.kind === "Text")).toHaveLength(1);
      expect(svg).toContain("hello");
      expect(svg).toContain('fill="#ff0000"');
    });

    it("macro expanding to a \\draw", () => {
      const source = String.raw`\begin{tikzpicture}
        \newcommand{\myline}[2]{\draw (#1,0) -- (#2,0);}
        \myline{0}{3}
      \end{tikzpicture}`;

      const { svg } = renderSvg(source);
      expect(svg).toContain("<path");
    });

    it("providecommand expands to TikZ statements without overwriting existing macros", () => {
      const source = String.raw`\begin{tikzpicture}
        \newcommand{\mynode}[1]{\node at (#1,0) {kept};}
        \providecommand{\mynode}[1]{\node at (#1,0) {overwritten};}
        \providecommand{\myline}[2]{\draw (#1,0) -- (#2,0);}
        \mynode{1}
        \myline{0}{3}
      \end{tikzpicture}`;

      const { svg, scene } = renderSvg(source);
      expect(scene.elements.filter(e => e.kind === "Text")).toHaveLength(1);
      expect(svg).toContain(">kept<");
      expect(svg).not.toContain("overwritten");
      expect(svg).toContain("<path");
    });

    it("DeclareRobustCommand expands to TikZ statements", () => {
      const source = String.raw`\begin{tikzpicture}
        \DeclareRobustCommand{\mynode}[2]{\node[#1] at (#2,0) {robust};}
        \mynode{red}{3}
      \end{tikzpicture}`;

      const { svg, scene } = renderSvg(source);
      expect(scene.elements.filter(e => e.kind === "Text")).toHaveLength(1);
      expect(svg).toContain("robust");
      expect(svg).toContain('fill="#ff0000"');
    });

    it("macro-expanded elements keep invocation source refs and generated identity refs", () => {
      const source = String.raw`\begin{tikzpicture}
        \newcommand{\myline}{\draw (0,0) -- (1,0);}
        \myline
      \end{tikzpicture}`;

      const { scene } = renderSvg(source);
      const path = scene.elements.find((element) => element.kind === "Path");
      expect(path?.kind).toBe("Path");
      if (path?.kind === "Path") {
        expect(source.slice(path.sourceRef.sourceSpan.from, path.sourceRef.sourceSpan.to).trim()).toBe(String.raw`\myline`);
        expect(path.identityRef?.sourceId.startsWith("path:")).toBe(true);
        expect(path.origin?.macroStack?.[0]?.macroName).toBe(String.raw`\myline`);
      }
    });

    it("macro expanding to multiple statements", () => {
      const source = String.raw`\begin{tikzpicture}
        \newcommand{\axes}{
          \draw[->] (0,0) -- (3,0);
          \draw[->] (0,0) -- (0,3);
        }
        \axes
      \end{tikzpicture}`;

      const { svg } = renderSvg(source);
      // Two paths (the two arrows)
      const pathCount = (svg.match(/<path /g) ?? []).length;
      expect(pathCount).toBeGreaterThanOrEqual(2);
    });

    it("macro with no arguments (\\def)", () => {
      const source = String.raw`\begin{tikzpicture}
        \def\mybox{\draw (0,0) rectangle (1,1);}
        \mybox
      \end{tikzpicture}`;

      const { svg } = renderSvg(source);
      expect(svg).toContain("<path");
    });
  });

  describe("macros inside foreach", () => {
    it("macro used in foreach body", () => {
      const source = String.raw`\begin{tikzpicture}
        \newcommand{\mynode}[1]{\node at (#1,0) {#1};}
        \foreach \x in {1,2,3} {
          \mynode{\x}
        }
      \end{tikzpicture}`;

      const { scene, svg } = renderSvg(source);
      expect(scene.elements.filter(e => e.kind === "Text")).toHaveLength(3);
      expect(svg).toContain(">1<");
      expect(svg).toContain(">2<");
      expect(svg).toContain(">3<");
    });

    it("macro with conditional inside foreach", () => {
      const source = String.raw`\begin{tikzpicture}
        \newcommand{\colornode}[1]{
          \ifnum#1=2\relax
            \node[red] at (#1,0) {#1};
          \else
            \node at (#1,0) {#1};
          \fi
        }
        \foreach \x in {1,2,3} {
          \colornode{\x}
        }
      \end{tikzpicture}`;

      const { scene, svg } = renderSvg(source);
      expect(scene.elements.filter(e => e.kind === "Text")).toHaveLength(3);
      // Only x=2 should be red
      expect((svg.match(/fill="#ff0000"/g) ?? []).length).toBe(1);
    });
  });

  describe("macro with \\let alias", () => {
    it("aliased macro expands to statements", () => {
      const source = String.raw`\begin{tikzpicture}
        \newcommand{\mynode}[1]{\node at (#1,0) {X};}
        \let\myalias=\mynode
        \myalias{2}
      \end{tikzpicture}`;

      const { scene, svg } = renderSvg(source);
      expect(scene.elements.filter(e => e.kind === "Text")).toHaveLength(1);
      expect(svg).toContain(">X<");
    });
  });

  describe("edge cases", () => {
    it("macro that does not expand to TikZ is left as unknown", () => {
      const source = String.raw`\begin{tikzpicture}
        \node at (0,0) {hello};
        \someunknowncommand
      \end{tikzpicture}`;

      const { scene } = renderSvg(source);
      // The node still renders; unknown command is ignored
      expect(scene.elements.filter(e => e.kind === "Text")).toHaveLength(1);
    });

    it("recursive macro hits expansion limit gracefully", () => {
      const source = String.raw`\begin{tikzpicture}
        \def\loop{\loop}
        \loop
      \end{tikzpicture}`;

      // Should not hang — limit kicks in
      const { diagnostics } = renderSvg(source);
      // Either hits macro depth limit or statement expansion limit
      expect(diagnostics.length).toBeGreaterThan(0);
    });

    it("macro body with nested braces", () => {
      const source = String.raw`\begin{tikzpicture}
        \newcommand{\labeled}[2]{\node[draw, label={above:#2}] at (#1,0) {#1};}
        \labeled{1}{top}
      \end{tikzpicture}`;

      const { svg } = renderSvg(source);
      expect(svg).toContain(">1<");
    });
  });

  describe("provenance: macro-expanded elements are read-only", () => {
    it("expanded elements have macro origin", () => {
      const source = String.raw`\begin{tikzpicture}
        \newcommand{\mynode}[1]{\node at (#1,0) {X};}
        \mynode{2}
      \end{tikzpicture}`;

      const result = renderTikzToSvg(source);
      const textElements = result.semantic.scene.elements.filter(e => e.kind === "Text");
      expect(textElements).toHaveLength(1);
      // Macro-expanded elements should have macroStack in origin
      expect(textElements[0].origin?.macroStack).toBeDefined();
      expect(textElements[0].origin!.macroStack!.length).toBeGreaterThan(0);
    });
  });
});
