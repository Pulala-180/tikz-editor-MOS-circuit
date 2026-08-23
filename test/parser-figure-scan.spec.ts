import { describe, expect, it } from "vitest";

import { parseTikz } from "../packages/core/src/parser/index.js";
import { scanTikzFigures } from "../packages/core/src/parser/figure-scan.js";

describe("tikz figure scanner", () => {
  it("tracks starred figures and ignores unterminated figure candidates", () => {
    const source = String.raw`\begin{tikzpicture*}
  \draw (0,0) -- (1,0);
\end{tikzpicture*}
\begin{tikzpicture}
  \draw (0,0) -- (0,1);`;

    const figures = scanTikzFigures(source);

    expect(figures).toHaveLength(1);
    expect(source.slice(figures[0]?.beginSpan.from, figures[0]?.beginSpan.to)).toBe(String.raw`\begin{tikzpicture*}`);
    expect(source.slice(figures[0]?.endSpan.from, figures[0]?.endSpan.to)).toBe(String.raw`\end{tikzpicture*}`);
    expect(figures[0]?.isTemplate).toBe(false);
  });

  it("marks unresolved placeholder figures as templates only inside macro bodies", () => {
    const source = String.raw`\newcommand*{\templatedFigure}[2][blue]{%
  \begin{tikzpicture}
    \node[draw=#1] {#2};
  \end{tikzpicture}
}
\DeclareRobustCommand{\robustTemplate}{\begin{tikzpicture}\node {#1};\end{tikzpicture}}
\begin{tikzpicture}
  \node {#1 is literal document text};
\end{tikzpicture}`;

    const figures = scanTikzFigures(source);

    expect(figures).toHaveLength(3);
    expect(figures.map((figure) => figure.isTemplate)).toEqual([true, true, false]);
  });

  it("handles def templates with comments, escaped controls, and malformed command definitions", () => {
    const source = String.raw`\def\drawTemplate#1%
  ignored parameter text \relax {%
  \begin{tikzpicture}
    \node {#1};
  \end{tikzpicture}
}
\newcommand\directTemplate[1]{\begin{tikzpicture}\node {#1};\end{tikzpicture}}
\newcommand
% grouped non-control names are accepted by TeX, but the body must not leak into the next figure
{not-a-control}
\newcommand
% missing command target, so this must not claim the following figure
\begin{tikzpicture}
  \node {#1};
\end{tikzpicture}
\def\brokenTemplate#1{\begin{tikzpicture}\node {#1};`;

    const figures = scanTikzFigures(source);

    expect(figures).toHaveLength(3);
    expect(figures.map((figure) => figure.isTemplate)).toEqual([true, true, false]);
  });

  it("does not treat escaped hashes or comments as unresolved placeholders", () => {
    const source = String.raw`\begin{tikzpicture}
  \node {\#1 is escaped};
  % #2 is only a comment
  \node {##3 is doubled};
\end{tikzpicture}`;

    const figures = scanTikzFigures(source);

    expect(figures).toHaveLength(1);
    expect(figures[0]?.isTemplate).toBe(false);
  });

  it("applies parser text validation defaults and throws when recovery is disabled", () => {
    const source = String.raw`\begin{tikzpicture}
  \node {bad};
\end{tikzpicture}`;

    const parsed = parseTikz(source, {
      nodeTextValidator: ({ node }) => node.text === "bad" ? { message: "blocked text" } : null
    });

    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({
      code: "invalid-node-tex",
      message: "blocked text"
    }));
    expect(() => parseTikz(String.raw`\begin{tikzpicture}\node {oops;\end{tikzpicture}`, { recover: false })).toThrow(/TikZ parse failed/);
  });
});
