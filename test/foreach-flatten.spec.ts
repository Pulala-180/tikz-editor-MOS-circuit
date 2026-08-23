import { describe, expect, it } from "vitest";

import type {
  ChildOperationItem,
  ForeachStatement,
  NodeItem,
  PathForeachItem,
  PathItem,
  Statement
} from "../packages/core/src/ast/types.js";
import { flattenForeachInSource } from "../packages/core/src/foreach/flatten.js";
import { parseTikz } from "../packages/core/src/parser/index.js";
import { applySourcePatches } from "../packages/core/src/edit/source-patches.js";
import { applyEditAction } from "../packages/core/src/edit/actions.js";

describe("foreach flattening", () => {
  it("flattens statement foreach loops", () => {
    const source = String.raw`\begin{tikzpicture}
\foreach \x in {0,1,2} {
  \draw (\x,0) circle (2pt);
}
\end{tikzpicture}`;

    const loop = firstStatementForeach(source);
    const flattened = flattenForeachInSource(source, { kind: "sourceId", sourceId: loop.id });

    expect(flattened.kind).toBe("success");
    if (flattened.kind !== "success") return;
    expect(flattened.newSource).toContain(String.raw`\draw (0,0) circle (2pt);`);
    expect(flattened.newSource).toContain(String.raw`\draw (1,0) circle (2pt);`);
    expect(flattened.newSource).toContain(String.raw`\draw (2,0) circle (2pt);`);
    expect(flattened.newSource).not.toContain(String.raw`\foreach \x`);
    expect(applySourcePatches(source, flattened.patches)).toEqual({
      kind: "success",
      source: flattened.newSource
    });
    expect(parseErrors(flattened.newSource)).toEqual([]);
  });

  it("flattens unbraced statement foreach bodies", () => {
    const source = String.raw`\begin{tikzpicture}
\foreach \x in {0,1,2} \draw (\x,0) -- ++(0,1);
\end{tikzpicture}`;

    const flattened = flattenForeachInSource(source, {
      kind: "sourceId",
      sourceId: firstStatementForeach(source).id
    });

    expect(flattened.kind).toBe("success");
    if (flattened.kind !== "success") return;
    expect(flattened.newSource).toContain(String.raw`\draw (0,0) -- ++(0,1);`);
    expect(flattened.newSource).toContain(String.raw`\draw (2,0) -- ++(0,1);`);
    expect(parseErrors(flattened.newSource)).toEqual([]);
  });

  it("flattens multi-variable, count, evaluate, and remember bindings", () => {
    const source = String.raw`\begin{tikzpicture}
\foreach \x/\label [count=\i from 1, evaluate=\x as \y using \x*2, remember=\x as \lastx (initially 0)] in {1/A,2/B} {
  \node at (\x,\y) {\i:\label:\lastx};
}
\end{tikzpicture}`;

    const flattened = flattenForeachInSource(source, {
      kind: "sourceId",
      sourceId: firstStatementForeach(source).id
    });

    expect(flattened.kind).toBe("success");
    if (flattened.kind !== "success") return;
    expect(flattened.newSource).toContain(String.raw`\node at (1,2) {1:A:0};`);
    expect(flattened.newSource).toContain(String.raw`\node at (2,4) {2:B:1};`);
    expect(parseErrors(flattened.newSource)).toEqual([]);
  });

  it("recursively flattens nested statement foreach loops", () => {
    const source = String.raw`\begin{tikzpicture}
\foreach \x in {1,2} {
  \foreach \y in {\x,3} {
    \node at (\x,\y) {\x/\y};
  }
}
\end{tikzpicture}`;

    const flattened = flattenForeachInSource(
      source,
      { kind: "sourceId", sourceId: firstStatementForeach(source).id },
      { recursive: true }
    );

    expect(flattened.kind).toBe("success");
    if (flattened.kind !== "success") return;
    expect(flattened.newSource).not.toContain(String.raw`\foreach`);
    expect(flattened.newSource).toContain(String.raw`\node at (1,1) {1/1};`);
    expect(flattened.newSource).toContain(String.raw`\node at (1,3) {1/3};`);
    expect(flattened.newSource).toContain(String.raw`\node at (2,2) {2/2};`);
    expect(flattened.newSource).toContain(String.raw`\node at (2,3) {2/3};`);
    expect(parseErrors(flattened.newSource)).toEqual([]);
  });

  it("flattens path foreach items", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) foreach \x in {1,2,3} { -- (\x,0) };
\end{tikzpicture}`;

    const flattened = flattenForeachInSource(source, {
      kind: "sourceId",
      sourceId: firstPathForeach(source).id
    });

    expect(flattened.kind).toBe("success");
    if (flattened.kind !== "success") return;
    expect(flattened.newSource).toContain(String.raw`\draw (0,0) -- (1,0) -- (2,0) -- (3,0);`);
    expect(parseErrors(flattened.newSource)).toEqual([]);
  });

  it("flattens node foreach clauses", () => {
    const source = String.raw`\begin{tikzpicture}
\path (0,0) -- (2,0) node foreach \p in {0.25,0.75} [pos=\p] {\p};
\end{tikzpicture}`;

    const clauseId = firstNodeForeach(source).foreachClauses?.[0]?.id;
    expect(clauseId).toBeDefined();
    const flattened = flattenForeachInSource(source, {
      kind: "sourceId",
      sourceId: clauseId!
    });

    expect(flattened.kind).toBe("success");
    if (flattened.kind !== "success") return;
    expect(flattened.newSource).toContain(String.raw`node [pos=0.25] {0.25} node [pos=0.75] {0.75}`);
    expect(parseErrors(flattened.newSource)).toEqual([]);
  });

  it("flattens child foreach clauses", () => {
    const source = String.raw`\begin{tikzpicture}
\node {root}
  child foreach \side in {left,right} {
    node {\side}
  };
\end{tikzpicture}`;

    const clauseId = firstChildForeach(source).foreachClauses?.[0]?.id;
    expect(clauseId).toBeDefined();
    const flattened = flattenForeachInSource(source, {
      kind: "sourceId",
      sourceId: clauseId!
    });

    expect(flattened.kind).toBe("success");
    if (flattened.kind !== "success") return;
    expect(flattened.newSource).toContain(String.raw`child {
    node {left}
  } child {
    node {right}
  }`);
    expect(parseErrors(flattened.newSource)).toEqual([]);
  });

  it("preserves macro calls while substituting foreach variables", () => {
    const source = String.raw`\begin{tikzpicture}
\newcommand{\markpoint}[1]{\fill (#1,0) circle (1pt);}
\foreach \x in {1,2} {
  \markpoint{\x}
}
\end{tikzpicture}`;

    const flattened = flattenForeachInSource(source, {
      kind: "sourceId",
      sourceId: firstStatementForeach(source).id
    });

    expect(flattened.kind).toBe("success");
    if (flattened.kind !== "success") return;
    expect(flattened.newSource).toContain(String.raw`\markpoint{1}`);
    expect(flattened.newSource).toContain(String.raw`\markpoint{2}`);
    expect(flattened.newSource).toContain(String.raw`\newcommand{\markpoint}`);
    expect(flattened.newSource).not.toContain(String.raw`\fill (1,0) circle (1pt);`);
  });

  it("runs as an edit action and selects newly generated statement ids", () => {
    const source = String.raw`\begin{tikzpicture}
\foreach \x in {0,1} {
  \draw (\x,0) -- (\x,1);
}
\end{tikzpicture}`;

    const result = applyEditAction(source, [], {
      kind: "flattenForeach",
      target: { kind: "sourceId", sourceId: firstStatementForeach(source).id },
      recursive: true
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.newSource).not.toContain(String.raw`\foreach`);
    expect(result.selectedSourceIds).toEqual(["path:0", "path:1"]);
    expect(result.changedSourceIds).toEqual(["path:0", "path:1"]);
    expect(applySourcePatches(source, result.patches)).toEqual({
      kind: "success",
      source: result.newSource
    });
  });

  it("refuses unsupported options, breakforeach, malformed headers, and expansion limits", () => {
    const unsupportedOption = String.raw`\begin{tikzpicture}
\foreach \x [unknown option=true] in {1,2} {
  \draw (\x,0);
}
\end{tikzpicture}`;
    expect(flattenForeachInSource(unsupportedOption, {
      kind: "sourceId",
      sourceId: firstStatementForeach(unsupportedOption).id
    }).kind).toBe("unsupported");

    const breakForeach = String.raw`\begin{tikzpicture}
\foreach \x in {1,2,3} {
  \breakforeach
  \draw (\x,0);
}
\end{tikzpicture}`;
    expect(flattenForeachInSource(breakForeach, {
      kind: "sourceId",
      sourceId: firstStatementForeach(breakForeach).id
    }).kind).toBe("unsupported");

    const malformedHeader = String.raw`\begin{tikzpicture}
\foreach in {1,2} {
  \draw (0,0);
}
\end{tikzpicture}`;
    expect(flattenForeachInSource(malformedHeader, { kind: "span", span: firstForeachLikeSpan(malformedHeader) }).kind).toBe("unsupported");

    const expansionLimit = String.raw`\begin{tikzpicture}
\foreach \x in {1,...,100} {
  \draw (\x,0);
}
\end{tikzpicture}`;
    expect(flattenForeachInSource(
      expansionLimit,
      { kind: "sourceId", sourceId: firstStatementForeach(expansionLimit).id },
      { maxExpansions: 10 }
    ).kind).toBe("unsupported");
  });
});

function firstStatementForeach(source: string): ForeachStatement {
  const statement = parseTikz(source).figure.body.find((candidate): candidate is ForeachStatement => candidate.kind === "Foreach");
  if (!statement) {
    throw new Error("Expected statement foreach");
  }
  return statement;
}

function firstPathForeach(source: string): PathForeachItem {
  const item = firstPathItem(source, (candidate): candidate is PathForeachItem => candidate.kind === "PathForeach");
  if (!item) {
    throw new Error("Expected path foreach");
  }
  return item;
}

function firstNodeForeach(source: string): NodeItem {
  const item = firstPathItem(source, (candidate): candidate is NodeItem =>
    candidate.kind === "Node" && (candidate.foreachClauses?.length ?? 0) > 0
  );
  if (!item) {
    throw new Error("Expected node foreach");
  }
  return item;
}

function firstChildForeach(source: string): ChildOperationItem {
  const item = firstPathItem(source, (candidate): candidate is ChildOperationItem =>
    candidate.kind === "ChildOperation" && (candidate.foreachClauses?.length ?? 0) > 0
  );
  if (!item) {
    throw new Error("Expected child foreach");
  }
  return item;
}

function firstPathItem<T extends PathItem>(
  source: string,
  predicate: (item: PathItem) => item is T
): T | null {
  const visitItems = (items: readonly PathItem[]): T | null => {
    for (const item of items) {
      if (predicate(item)) {
        return item;
      }
      if (item.kind === "ChildOperation") {
        const nested = visitItems(item.body);
        if (nested) {
          return nested;
        }
      }
    }
    return null;
  };

  const visitStatements = (statements: readonly Statement[]): T | null => {
    for (const statement of statements) {
      if (statement.kind === "Path") {
        const item = visitItems(statement.items);
        if (item) {
          return item;
        }
      }
      if (statement.kind === "Scope") {
        const nested = visitStatements(statement.body);
        if (nested) {
          return nested;
        }
      }
    }
    return null;
  };

  return visitStatements(parseTikz(source).figure.body);
}

function parseErrors(source: string): string[] {
  return parseTikz(source).diagnostics
    .filter((diagnostic) => diagnostic.severity === "error")
    .map((diagnostic) => diagnostic.message);
}

function firstForeachLikeSpan(source: string) {
  const index = source.indexOf(String.raw`\foreach`);
  if (index < 0) {
    throw new Error("Expected foreach text");
  }
  return {
    from: index,
    to: index + String.raw`\foreach`.length
  };
}
