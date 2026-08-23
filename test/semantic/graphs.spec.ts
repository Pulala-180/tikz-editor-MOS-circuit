import { describe, expect, it } from "vitest";

import { evaluateSemantic, elementsOfKind } from "./helpers.js";

const nonNull = <T>(value: T | null): value is T => value != null;

describe("semantic evaluator / graph operations", () => {
  it("renders graph command nodes and matching-and-star edges", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph [nodes={draw,circle}] { a -> b -> {c, d} };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "invalid-graph-syntax")).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "graph-edge-without-start")).toBe(false);

    const labels = elementsOfKind(result.scene.elements, "Text");
    const edges = elementsOfKind(result.scene.elements, "Path");
    expect(labels.length).toBeGreaterThanOrEqual(4);
    expect(edges.length).toBeGreaterThanOrEqual(3);
  });

  it("supports graph as a path operation (`\\path graph ...`)", () => {
    const source = String.raw`\begin{tikzpicture}
  \path graph [nodes={draw}] { x -- y <- z };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "invalid-graph-syntax")).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "graph-edge-without-start")).toBe(false);
    const labels = elementsOfKind(result.scene.elements, "Text");
    const edges = elementsOfKind(result.scene.elements, "Path");
    expect(labels.length).toBeGreaterThanOrEqual(3);
    expect(edges.length).toBeGreaterThanOrEqual(2);
  });

  it("supports naming controls, quoted node names, and node text overrides", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph [name=cluster, name separator=-] {
    "x,y" [as={X comma Y}] -> item;
    "x,y" -> item;
  };
  \path (cluster-x@u2C@y) edge (cluster-item);
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "invalid-graph-syntax")).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "graph-edge-without-start")).toBe(false);

    const texts = elementsOfKind(result.scene.elements, "Text").map((text) => text.text);
    const paths = elementsOfKind(result.scene.elements, "Path");

    expect(texts).toContain("X comma Y");
    expect(texts).toContain("item");
    expect(paths.length).toBeGreaterThanOrEqual(3);
  });

  it("supports fresh/use-existing/number-nodes controls", () => {
    const freshSource = String.raw`\begin{tikzpicture}
  \graph [fresh nodes] { a -> a -> a };
\end{tikzpicture}`;
    const freshResult = evaluateSemantic(freshSource);
    const freshTexts = elementsOfKind(freshResult.scene.elements, "Text").map((text) => text.text);
    expect(freshTexts.filter((text) => text === "a")).toHaveLength(3);

    const numberedSource = String.raw`\begin{tikzpicture}
  \graph [number nodes] { a -> a -> a };
\end{tikzpicture}`;
    const numberedResult = evaluateSemantic(numberedSource);
    const numberedTexts = elementsOfKind(numberedResult.scene.elements, "Text").map((text) => text.text);
    expect(numberedTexts.filter((text) => text === "a")).toHaveLength(3);

    const existingSource = String.raw`\begin{tikzpicture}
  \node (a) at (0,0) {A};
  \node (b) at (1,0) {B};
  \graph [use existing nodes] { a -> b };
\end{tikzpicture}`;
    const existingResult = evaluateSemantic(existingSource);
    const existingTexts = elementsOfKind(existingResult.scene.elements, "Text").map((text) => text.text);
    expect(existingResult.diagnostics.some((diagnostic) => diagnostic.code === "graph-edge-without-start")).toBe(false);
    expect(existingTexts.filter((text) => text === "a" || text === "b")).toHaveLength(0);
    expect(elementsOfKind(existingResult.scene.elements, "Path").length).toBeGreaterThanOrEqual(1);
  });

  it("handles simple-graph last-edge-wins semantics and edge removal with -!-", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph [simple] {
    a ->[red] b;
    a ->[blue] b;
    a -!- b;
    c -> d;
    d <-[green] c;
  };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "invalid-graph-syntax")).toBe(false);

    const edges = elementsOfKind(result.scene.elements, "Path");
    expect(edges).toHaveLength(1);
    expect(edges[0]?.style.stroke).toBe("#00ff00");
  });

  it("supports source/target edge style accumulation, clear shorthands, and directional edge labels", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph {
    a [source edge style=red] -> b [target edge style=blue];
    a -> b;
    b [clear >, clear <];
    a -> b;
    a -> c [>"into c"];
    c [<"from c"] -> d;
  };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "invalid-graph-syntax")).toBe(false);

    const edges = elementsOfKind(result.scene.elements, "Path");
    const edgeStrokes = edges.map((edge) => edge.style.stroke);
    expect(edgeStrokes).toContain("#0000ff");
    expect(edgeStrokes).toContain("#ff0000");

    const texts = elementsOfKind(result.scene.elements, "Text").map((text) => text.text);
    expect(texts).toContain("into c");
    expect(texts).toContain("from c");
  });

  it("supports put-node-text-on-incoming/outgoing-edges", () => {
    const incomingSource = String.raw`\begin{tikzpicture}
  \graph [put node text on incoming edges] { a -> b };
\end{tikzpicture}`;
    const incomingResult = evaluateSemantic(incomingSource);
    const incomingTexts = elementsOfKind(incomingResult.scene.elements, "Text").map((text) => text.text);
    expect(incomingTexts).toEqual(["b"]);

    const outgoingSource = String.raw`\begin{tikzpicture}
  \graph [put node text on outgoing edges] { a -> b };
\end{tikzpicture}`;
    const outgoingResult = evaluateSemantic(outgoingSource);
    const outgoingTexts = elementsOfKind(outgoingResult.scene.elements, "Text").map((text) => text.text);
    expect(outgoingTexts).toEqual(["a"]);
  });

  it("expands predefined subgraph forms (I_n, K_n, K_nm, P_n, C_n, Grid_n)", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph {
    subgraph I_n [n=4, name=I];
    subgraph K_n [n=4, name=K];
    subgraph K_nm [V={u,v}, W={x,y,z}, name=B];
    subgraph P_n [n=4, name=P];
    subgraph C_n [n=4, name=C];
    subgraph Grid_n [n=4, wrap after=2, name=G];
  };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "invalid-graph-syntax")).toBe(false);

    const texts = elementsOfKind(result.scene.elements, "Text");
    const edges = elementsOfKind(result.scene.elements, "Path");
    expect(texts.length).toBeGreaterThanOrEqual(4 + 4 + 5 + 4 + 4 + 4);
    expect(edges.length).toBeGreaterThanOrEqual(6 + 6 + 3 + 4 + 4);
  });

  it("supports clockwise circular placement in subgraph options", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph { subgraph K_n [n=6, clockwise] };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);
    const labels = elementsOfKind(result.scene.elements, "Text").map((text) => ({ text: text.text, pos: text.position }));
    expect(labels.length).toBeGreaterThanOrEqual(6);
    const uniqueX = new Set(labels.map((entry) => Math.round(entry.pos.x)));
    const uniqueY = new Set(labels.map((entry) => Math.round(entry.pos.y)));
    expect(uniqueX.size).toBeGreaterThan(2);
    expect(uniqueY.size).toBeGreaterThan(2);
    expect(elementsOfKind(result.scene.elements, "Path").length).toBeGreaterThan(6);
  });

  it("keeps last-edge-wins direction for simple K_nm overlaps", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph [simple, branch right, grow down]
  {
    subgraph K_nm [V={1,2,3}, W={a,b,c,d}, ->];
    subgraph K_nm [V={2,3},   W={b,c},     <-];
  };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);
    const labels = elementsOfKind(result.scene.elements, "Text").filter(
      (text) => text.text === "1" || text.text === "2" || text.text === "3" || text.text === "a" || text.text === "b" || text.text === "c" || text.text === "d"
    );
    const segments = elementsOfKind(result.scene.elements, "Path")
      .map((path) => {
        const first = path.commands[0];
        const second = path.commands[1];
        if (!first || !second || first.kind !== "M" || second.kind !== "L") {
          return null;
        }
        return { start: first.to, end: second.to };
      })
      .filter(nonNull);

    const nearestLabel = (point: { x: number; y: number }): string | null => {
      let nearest: string | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const label of labels) {
        const dx = point.x - label.position.x;
        const dy = point.y - label.position.y;
        const distance = Math.hypot(dx, dy);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = label.text;
        }
      }
      return nearest;
    };

    const directedPairs = new Set<string>();
    for (const segment of segments) {
      const from = nearestLabel(segment.start);
      const to = nearestLabel(segment.end);
      if (!from || !to || from === to) {
        continue;
      }
      directedPairs.add(`${from}->${to}`);
    }

    expect(directedPairs.has("b->2")).toBe(true);
    expect(directedPairs.has("b->3")).toBe(true);
    expect(directedPairs.has("c->2")).toBe(true);
    expect(directedPairs.has("c->3")).toBe(true);
    expect(directedPairs.has("2->b")).toBe(false);
    expect(directedPairs.has("2->c")).toBe(false);
    expect(directedPairs.has("3->b")).toBe(false);
    expect(directedPairs.has("3->c")).toBe(false);
  });

  it("keeps center targets centered for circular C_n subgraphs", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph { subgraph C_n [n=5, clockwise] -> mid };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);
    const labels = elementsOfKind(result.scene.elements, "Text");
    const mid = labels.find((text) => text.text === "mid");
    const cycleNodes = labels.filter((text) => text.text === "1" || text.text === "2" || text.text === "3" || text.text === "4" || text.text === "5");

    expect(mid).toBeDefined();
    expect(cycleNodes).toHaveLength(5);
    if (!mid || cycleNodes.length !== 5) {
      return;
    }

    const cx = cycleNodes.reduce((sum, node) => sum + node.position.x, 0) / cycleNodes.length;
    const cy = cycleNodes.reduce((sum, node) => sum + node.position.y, 0) / cycleNodes.length;
    expect(Math.abs(mid.position.x - cx)).toBeLessThan(1);
    expect(Math.abs(mid.position.y - cy)).toBeLessThan(1);
  });

  it("supports join-operator keys on edge specifications", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph {
    {a,b} ->[complete bipartite] {c,d,e};
    {m,n,o} ->[matching] {p,q};
    {r,s,t} ->[matching and star] {u,v};
  };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "invalid-graph-syntax")).toBe(false);
    const edges = elementsOfKind(result.scene.elements, "Path");
    expect(edges.length).toBeGreaterThanOrEqual(6 + 2 + 3);
  });

  it("supports color classes and source/target color controls for operators", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph [color class=red, color class=green] {
    [complete bipartite={red}{green}]
    a [red], b [red], c [green], d [green, not green];
  };
  \graph { a0 -> { b [not source], c, d [not target] } -> e0 };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "invalid-graph-syntax")).toBe(false);

    const texts = elementsOfKind(result.scene.elements, "Text").map((text) => text.text);
    expect(texts).toContain("a");
    expect(texts).toContain("e0");

    const edges = elementsOfKind(result.scene.elements, "Path");
    expect(edges.length).toBeGreaterThanOrEqual(2 + 4);
  });

  it("supports graph operator option aliases, color pairs, and ranged shore names", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph [color class=red, color class=green] {
    [clique=red] a [red], b [red], c [red];
    [cycle=green] d [green], e [green], f [green];
    [path] g, h, i;
    [matching={red,green}] a, b, d, e;
    [matching and star={red,green}] b, c, e, f;
  };
  \graph {
    subgraph I_nm [V={3,...,1}, W={c,...,a}, name shore V={name=Left}, name shore W={name=Right}];
  };
  \path (Left 3) edge (Right a);
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "invalid-graph-syntax")).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "unknown-named-coordinate:Left 3")).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "unknown-named-coordinate:Right a")).toBe(false);
    const texts = elementsOfKind(result.scene.elements, "Text").map((text) => text.text);
    expect(texts).toEqual(expect.arrayContaining(["3", "2", "1", "c", "b", "a"]));
    expect(elementsOfKind(result.scene.elements, "Path").length).toBeGreaterThanOrEqual(4);
  });

  it("supports I_nm numeric shorthands with shore naming", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph { subgraph I_nm [n=2, m=2] };
  \path (V 1) edge (W 2);
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "graph-edge-without-start")).toBe(false);
    const edges = elementsOfKind(result.scene.elements, "Path");
    expect(edges.length).toBeGreaterThanOrEqual(1);
  });

  it("reports unsupported subgraph macros without creating fallback nodes", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph { subgraph Unknown_n [n=3] };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "invalid-graph-syntax")).toBe(true);
    const texts = elementsOfKind(result.scene.elements, "Text").map((text) => text.text);
    expect(texts).not.toContain("subgraph Unknown_n");
  });

  it("keeps graph edge paint order before node paint output", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph [nodes={draw,circle}] { a -> b };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);
    const kinds = result.scene.elements.map((element) => element.kind);
    const firstPathIndex = kinds.indexOf("Path");
    const firstCircleIndex = kinds.indexOf("Circle");
    const firstTextIndex = kinds.indexOf("Text");

    expect(firstPathIndex).toBeGreaterThanOrEqual(0);
    expect(firstCircleIndex).toBeGreaterThan(firstPathIndex);
    expect(firstTextIndex).toBeGreaterThan(firstPathIndex);
  });

  it("keeps edge-label placement stable for repeated same-geometry graph edges", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph {
    a -> b [>"L1"];
    b [clear >];
    a -> b [>"L2"];
  };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);
    const labels = elementsOfKind(result.scene.elements, "Text").filter((text) => text.text === "L1" || text.text === "L2");
    expect(labels).toHaveLength(2);
    const first = labels[0];
    const second = labels[1];
    if (!first || !second) {
      return;
    }

    expect(first.position.x).toBeCloseTo(second.position.x, 3);
    expect(first.position.y).toBeCloseTo(second.position.y, 3);
  });

  it("supports no-placement with graph-local x/y coordinates", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph [no placement] {
    a [x=0, y=0] -> b [x=1, y=0] -> c [x=1, y=1]
  };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);
    const textByLabel = new Map(elementsOfKind(result.scene.elements, "Text").map((text) => [text.text, text]));

    const a = textByLabel.get("a");
    const b = textByLabel.get("b");
    const c = textByLabel.get("c");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(c).toBeDefined();
    if (!a || !b || !c) {
      return;
    }

    expect(b.position.x).toBeGreaterThan(a.position.x + 20);
    expect(Math.abs(b.position.y - a.position.y)).toBeLessThan(1);
    expect(c.position.y).toBeGreaterThan(b.position.y + 20);
  });

  it("supports cartesian grow/branch placement controls", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph [grow right=5mm, branch down=4mm] { a -> { b, c } };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);
    const textByLabel = new Map(elementsOfKind(result.scene.elements, "Text").map((text) => [text.text, text]));

    const a = textByLabel.get("a");
    const b = textByLabel.get("b");
    const c = textByLabel.get("c");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(c).toBeDefined();
    if (!a || !b || !c) {
      return;
    }

    expect(b.position.x).toBeGreaterThan(a.position.x + 5);
    expect(Math.abs(c.position.x - b.position.x)).toBeLessThan(1);
    expect(c.position.y).toBeLessThan(b.position.y - 5);
  });

  it("supports grid placement with wrap-after columns", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph [grid placement, n=6, wrap after=3] { a, b, c, d, e, f };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);
    const textByLabel = new Map(elementsOfKind(result.scene.elements, "Text").map((text) => [text.text, text]));

    const a = textByLabel.get("a");
    const d = textByLabel.get("d");
    expect(a).toBeDefined();
    expect(d).toBeDefined();
    if (!a || !d) {
      return;
    }

    expect(Math.abs(d.position.x - a.position.x)).toBeLessThan(1);
    expect(d.position.y).toBeLessThan(a.position.y - 5);
  });

  it("supports clockwise and counterclockwise circular placement", () => {
    const clockwiseSource = String.raw`\begin{tikzpicture}
  \graph [clockwise=4, radius=1cm] { a, b, c, d };
\end{tikzpicture}`;
    const clockwiseResult = evaluateSemantic(clockwiseSource);
    const clockwiseText = new Map(elementsOfKind(clockwiseResult.scene.elements, "Text").map((text) => [text.text, text]));
    const clockwiseA = clockwiseText.get("a");
    const clockwiseB = clockwiseText.get("b");
    expect(clockwiseA).toBeDefined();
    expect(clockwiseB).toBeDefined();
    if (!clockwiseA || !clockwiseB) {
      return;
    }
    expect(clockwiseB.position.x).toBeGreaterThan(clockwiseA.position.x + 5);

    const counterSource = String.raw`\begin{tikzpicture}
  \graph [counterclockwise=4, radius=1cm] { a, b, c, d };
\end{tikzpicture}`;
    const counterResult = evaluateSemantic(counterSource);
    const counterText = new Map(elementsOfKind(counterResult.scene.elements, "Text").map((text) => [text.text, text]));
    const counterA = counterText.get("a");
    const counterB = counterText.get("b");
    expect(counterA).toBeDefined();
    expect(counterB).toBeDefined();
    if (!counterA || !counterB) {
      return;
    }
    expect(counterB.position.x).toBeLessThan(counterA.position.x - 5);
  });

  it("supports level style keys for placement controls", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph [no placement, level 2/.style={x=1}] { a -> { b, c } };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);
    const textByLabel = new Map(elementsOfKind(result.scene.elements, "Text").map((text) => [text.text, text]));

    const a = textByLabel.get("a");
    const b = textByLabel.get("b");
    const c = textByLabel.get("c");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(c).toBeDefined();
    if (!a || !b || !c) {
      return;
    }

    expect(b.position.x).toBeGreaterThan(a.position.x + 20);
    expect(c.position.x).toBeGreaterThan(a.position.x + 20);
  });

  it("inherits level styles to deeper descendants when no deeper override exists", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph [
    branch down=5mm,
    level 1/.style={nodes=red},
    level 2/.style={nodes=green!50!black},
    level 3/.style={nodes=blue}
  ] {
    a -> {
      b,
      c -> {
        d,
        e -> {f,g},
        h
      },
      j
    }
  };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);
    const texts = elementsOfKind(result.scene.elements, "Text");
    const colorByText = new Map(texts.map((text) => [text.text, text.style.textColor]));

    expect(colorByText.get("a")).toBe("#ff0000");
    expect(colorByText.get("b")).toBe("#008000");
    expect(colorByText.get("c")).toBe("#008000");
    expect(colorByText.get("d")).toBe("#0000ff");
    expect(colorByText.get("e")).toBe("#0000ff");
    expect(colorByText.get("h")).toBe("#0000ff");
    expect(colorByText.get("f")).toBe("#0000ff");
    expect(colorByText.get("g")).toBe("#0000ff");
  });

  it("supports grow/branch sep spacing refinement controls", () => {
    const regularSource = String.raw`\begin{tikzpicture}
  \graph [grow right] { a -> b -> c };
\end{tikzpicture}`;
    const regular = evaluateSemantic(regularSource);
    const regularText = new Map(elementsOfKind(regular.scene.elements, "Text").map((text) => [text.text, text]));
    const regularA = regularText.get("a");
    const regularB = regularText.get("b");
    expect(regularA).toBeDefined();
    expect(regularB).toBeDefined();
    if (!regularA || !regularB) {
      return;
    }
    const regularDx = regularB.position.x - regularA.position.x;

    const sepSource = String.raw`\begin{tikzpicture}
  \graph [grow right sep=2cm] { a -> b -> c };
\end{tikzpicture}`;
    const sep = evaluateSemantic(sepSource);
    const sepText = new Map(elementsOfKind(sep.scene.elements, "Text").map((text) => [text.text, text]));
    const sepA = sepText.get("a");
    const sepB = sepText.get("b");
    expect(sepA).toBeDefined();
    expect(sepB).toBeDefined();
    if (!sepA || !sepB) {
      return;
    }
    const sepDx = sepB.position.x - sepA.position.x;

    expect(sepDx).toBeGreaterThan(regularDx + 10);
  });

  it("keeps branch-left sep layouts from overlapping long sibling labels", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph [grow down sep, branch left sep] {
    start -- {
      an even longer text -- {short, very long text} -- more text,
      long -- longer,
      some text -- a -- b
    } -- end
  };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);
    const textByLabel = new Map(elementsOfKind(result.scene.elements, "Text").map((text) => [text.text, text]));
    const longer = textByLabel.get("longer");
    const veryLong = textByLabel.get("very long text");
    expect(longer).toBeDefined();
    expect(veryLong).toBeDefined();
    if (!longer || !veryLong) {
      return;
    }

    expect(Math.abs(longer.position.y - veryLong.position.y)).toBeLessThan(2);
    expect(veryLong.position.x - longer.position.x).toBeGreaterThan(60);
  });

  it("makes sep spacing depend on measured node size", () => {
    const shortSource = String.raw`\begin{tikzpicture}
  \graph [grow right sep] { a -> b };
\end{tikzpicture}`;
    const shortResult = evaluateSemantic(shortSource);
    const shortTextByLabel = new Map(elementsOfKind(shortResult.scene.elements, "Text").map((text) => [text.text, text]));
    const shortA = shortTextByLabel.get("a");
    const shortB = shortTextByLabel.get("b");
    if (!shortA || !shortB) {
      return;
    }
    const shortDistance = Math.hypot(shortB.position.x - shortA.position.x, shortB.position.y - shortA.position.y);

    const longSource = String.raw`\begin{tikzpicture}
  \graph [grow right sep] { veryverylonglabel -> b };
\end{tikzpicture}`;
    const longResult = evaluateSemantic(longSource);
    const longTextByLabel = new Map(elementsOfKind(longResult.scene.elements, "Text").map((text) => [text.text, text]));
    const longA = longTextByLabel.get("veryverylonglabel");
    const longB = longTextByLabel.get("b");
    if (!longA || !longB) {
      return;
    }
    const longDistance = Math.hypot(longB.position.x - longA.position.x, longB.position.y - longA.position.y);

    expect(longDistance).toBeGreaterThan(shortDistance + 20);
  });

  it("resolves quoted graph names with spaces when connecting edges", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph [grow right=2cm] {
    "Hi, World!" -> "It's \emph{important}!"[red,rotate=-45];
  };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "graph-edge-without-start")).toBe(false);
    const paths = elementsOfKind(result.scene.elements, "Path");
    expect(paths.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps graph edge direction stable for rotated target nodes", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph [grow right=2cm] {
    "Hi, World!" -> "It's \emph{important}!"[red,rotate=-45];
    "name"/actual text -> "It's \emph{important}!";
  };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);
    const segments = elementsOfKind(result.scene.elements, "Path")
      .map((path) => {
        const first = path.commands[0];
        const second = path.commands[1];
        if (!first || !second || first.kind !== "M" || second.kind !== "L") {
          return null;
        }
        return { start: first.to, end: second.to };
      })
      .filter(nonNull);

    const horizontalTopEdge = segments.find(
      (segment) => Math.abs(segment.start.y - segment.end.y) < 1e-6 && Math.abs(segment.start.y) < 1e-6
    );
    expect(horizontalTopEdge).toBeDefined();
    if (!horizontalTopEdge) {
      return;
    }
    expect(horizontalTopEdge.end.x).toBeGreaterThan(horizontalTopEdge.start.x);
  });

  it("supports set references like (set name) in graph terms", () => {
    const source = String.raw`\begin{tikzpicture}
  \node [set=red] (r1) at (0,0) {r1};
  \node [set=red] (r2) at (1,0) {r2};
  \node [set=green] (g1) at (0,1) {g1};
  \node [set=green] (g2) at (1,1) {g2};
  \graph { root -> (red) ->[complete bipartite] (green) };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "graph-edge-without-start")).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "unknown-named-coordinate:red")).toBe(false);
    expect(elementsOfKind(result.scene.elements, "Path").length).toBeGreaterThanOrEqual(6);
  });

  it("applies left/right anchor keys to keep complete-bipartite edge endpoints stable per source node", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph [left anchor=east, right anchor=west] {
    {a,b,c} -- [complete bipartite] {e,f,g}
  };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    const leftNodes = new Map(
      elementsOfKind(result.scene.elements, "Text")
        .filter((text) => text.text === "a" || text.text === "b" || text.text === "c")
        .map((text) => [text.text, text.position] as const)
    );
    expect(leftNodes.size).toBe(3);

    const segments = elementsOfKind(result.scene.elements, "Path")
      .map((path) => {
        const first = path.commands[0];
        const second = path.commands[1];
        if (!first || !second || first.kind !== "M" || second.kind !== "L") {
          return null;
        }
        return { start: first.to, end: second.to };
      })
      .filter(nonNull);
    expect(segments.length).toBeGreaterThanOrEqual(9);

    const startsBySource = new Map<string, Array<{ x: number; y: number }>>();
    for (const segment of segments) {
      let nearest: string | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const [label, position] of leftNodes.entries()) {
        const dx = segment.start.x - position.x;
        const dy = segment.start.y - position.y;
        const distance = Math.hypot(dx, dy);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = label;
        }
      }
      if (!nearest) {
        continue;
      }
      const bucket = startsBySource.get(nearest) ?? [];
      bucket.push(segment.start);
      startsBySource.set(nearest, bucket);
    }

    for (const starts of startsBySource.values()) {
      if (starts.length < 2) {
        continue;
      }
      const yMin = Math.min(...starts.map((point) => point.y));
      const yMax = Math.max(...starts.map((point) => point.y));
      expect(yMax - yMin).toBeLessThan(2.5);
    }
  });

  it("supports trie naming so repeated labels create path-distinct nodes", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph [trie] {
    a -> {
      a,
      c -> {a, b},
      b
    }
  };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "invalid-graph-syntax")).toBe(false);
    const texts = elementsOfKind(result.scene.elements, "Text").map((text) => text.text);
    expect(texts.filter((text) => text === "a")).toHaveLength(3);
    expect(texts.filter((text) => text === "b")).toHaveLength(2);
    expect(texts.filter((text) => text === "c")).toHaveLength(1);
    expect(elementsOfKind(result.scene.elements, "Path").length).toBeGreaterThanOrEqual(5);
  });

  it("materializes connector quote labels and edge-label keys in graph edges", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph [edge label=x] {
    a ->[red, "foo"] b --[thick, "bar"] {c, d};
  };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);
    const labels = elementsOfKind(result.scene.elements, "Text").map((text) => text.text);

    expect(labels).toContain("foo");
    expect(labels).toContain("bar");
    expect(labels.filter((text) => text === "x").length).toBeGreaterThanOrEqual(3);
  });

  it("applies edge quotes defaults to graph quote labels", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph [edge quotes={blue,auto}] {
    a ->["x"] b ->["y"'] c ->["b" red] d;
  };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);
    const labels = elementsOfKind(result.scene.elements, "Text").filter((text) => text.text === "x" || text.text === "y" || text.text === "b");
    const x = labels.find((text) => text.text === "x");
    const y = labels.find((text) => text.text === "y");
    const b = labels.find((text) => text.text === "b");
    expect(x?.style.textColor).toBe("#0000ff");
    expect(y?.style.textColor).toBe("#0000ff");
    expect(b?.style.textColor).toBe("#ff0000");
  });

  it("keeps node option parsing stable with trailing comments", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph {
    a [source edge style=red] ->[green]
    b [target edge style=blue]  % blue wins
  };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);
    const labels = elementsOfKind(result.scene.elements, "Text").map((text) => text.text);
    expect(labels.some((text) => text.includes("target edge style"))).toBe(false);
    const edges = elementsOfKind(result.scene.elements, "Path");
    expect(edges).toHaveLength(1);
    expect(edges[0]?.style.stroke).toBe("#0000ff");
  });

  it("handles apostrophe swap in directional graph edge label shortcuts", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph { a -> b -- {c [> "foo"], d [> "bar"']} };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);
    const labels = elementsOfKind(result.scene.elements, "Text").filter((text) => text.text === "foo" || text.text === "bar");
    expect(labels).toHaveLength(2);
    const foo = labels.find((label) => label.text === "foo");
    const bar = labels.find((label) => label.text === "bar");
    expect(foo).toBeDefined();
    expect(bar).toBeDefined();
    if (!foo || !bar) {
      return;
    }

    expect(Math.abs(foo.position.y - bar.position.y)).toBeGreaterThan(10);
  });

  it("ignores comments inside graph groups and preserves local node options", () => {
    const source = String.raw`\begin{tikzpicture}
  \graph {
    a -> { [nodes=red] % the option is local to these nodes:
      b, c
    } ->
    d
  };
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "invalid-polar-coordinate:(% the option is local to these nodes:\n      b)")).toBe(
      false
    );
    const labels = elementsOfKind(result.scene.elements, "Text");
    const b = labels.find((text) => text.text === "b");
    const c = labels.find((text) => text.text === "c");
    expect(b?.style.textColor).toBe("#ff0000");
    expect(c?.style.textColor).toBe("#ff0000");
    expect(elementsOfKind(result.scene.elements, "Path").length).toBeGreaterThanOrEqual(3);
  });

  it("supports empty nodes and math nodes controls", () => {
    const emptySource = String.raw`\begin{tikzpicture}
  \graph [empty nodes, nodes={circle, draw}] { a -> {b, c} };
\end{tikzpicture}`;
    const emptyResult = evaluateSemantic(emptySource);
    const emptyTexts = elementsOfKind(emptyResult.scene.elements, "Text").map((text) => text.text);
    expect(emptyTexts.length).toBe(0);
    expect(elementsOfKind(emptyResult.scene.elements, "Circle").length).toBeGreaterThanOrEqual(3);

    const mathSource = String.raw`\begin{tikzpicture}
  \graph [math nodes, nodes={circle, draw}] { a_1 -> {b^2, c_3^n} };
\end{tikzpicture}`;
    const mathResult = evaluateSemantic(mathSource);
    const mathTexts = elementsOfKind(mathResult.scene.elements, "Text").map((text) => text.text);
    expect(mathTexts).toContain("$a_1$");
    expect(mathTexts).toContain("$b^2$");
    expect(mathTexts).toContain("$c_3^n$");
  });
});
