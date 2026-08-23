import { describe, expect, it } from "vitest";

import { collectGeometryInvalidation } from "../../packages/core/src/semantic/dependencies.js";
import { evaluateSemantic } from "./helpers.js";

describe("semantic dependencies / dom diff hints", () => {
  it("scopes affected source ids to the changed subgraph", () => {
    const source = String.raw`\begin{tikzpicture}
  \coordinate (A) at (0,0);
  \draw (A) -- (1,0);
  \coordinate (B) at (0,1);
  \draw (B) -- (1,1);
\end{tikzpicture}`;
    const result = evaluateSemantic(source);
    const graph = result.dependencies;

    const producerA = sourceIdsProducingCoordinate(graph, "A")[0];
    const consumersA = sourceIdsConsumingCoordinate(graph, "A");
    const consumersB = sourceIdsConsumingCoordinate(graph, "B");

    expect(producerA).toBeDefined();
    const invalidation = collectGeometryInvalidation(graph, {
      changedSourceIds: producerA ? [producerA] : []
    });
    expect(invalidation.reachedOpaque).toBe(false);
    for (const sourceId of consumersA) {
      expect(invalidation.affectedSourceIds).toContain(sourceId);
    }
    for (const sourceId of consumersB) {
      expect(invalidation.affectedSourceIds).not.toContain(sourceId);
    }
  });

  it("reports opaque closures locally for drag-fallback decisions", () => {
    const source = String.raw`\begin{tikzpicture}
  \foreach \x in {0,1}
    \draw (\x,0) -- (\x,1);
  \coordinate (A) at (0,2);
  \draw (A) -- (1,2);
\end{tikzpicture}`;
    const result = evaluateSemantic(source);
    const graph = result.dependencies;

    const opaqueSources = graph.nodes
      .filter((node): node is Extract<(typeof graph.nodes)[number], { kind: "source" }> => node.kind === "source")
      .filter((node) => node.opaque)
      .map((node) => node.sourceId);
    expect(opaqueSources.length).toBeGreaterThan(0);

    const plainProducer = sourceIdsProducingCoordinate(graph, "A")[0];
    expect(plainProducer).toBeDefined();

    const fromPlain = collectGeometryInvalidation(graph, {
      changedSourceIds: plainProducer ? [plainProducer] : []
    });
    expect(fromPlain.reachedOpaque).toBe(false);

    const fromOpaque = collectGeometryInvalidation(graph, {
      changedSourceIds: [opaqueSources[0]]
    });
    expect(fromOpaque.reachedOpaque).toBe(true);
    expect(fromOpaque.opaqueSourceIds).toContain(opaqueSources[0]);
  });

  it("keeps directly changed sources affected even when they have no dependency node", () => {
    const source = String.raw`\begin{tikzpicture}
  \node[draw,label=right:L] at (0,0) {A};
\end{tikzpicture}`;
    const result = evaluateSemantic(source);

    const invalidation = collectGeometryInvalidation(result.dependencies, {
      changedSourceIds: ["path:0"]
    });

    expect(invalidation.reachedOpaque).toBe(false);
    expect(invalidation.affectedSourceIds).toContain("path:0");
  });
});

function sourceIdsProducingCoordinate(
  graph: ReturnType<typeof evaluateSemantic>["dependencies"],
  coordinateName: string
): string[] {
  const resourceNodeId = `resource:named-coordinate:${coordinateName}`;
  const sourceNodeById = new Map<string, string>();
  for (const node of graph.nodes) {
    if (node.kind !== "source") {
      continue;
    }
    sourceNodeById.set(node.id, node.sourceId);
  }
  const sourceIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.relation !== "producer" || edge.to !== resourceNodeId) {
      continue;
    }
    const sourceId = sourceNodeById.get(edge.from);
    if (sourceId) {
      sourceIds.add(sourceId);
    }
  }
  return [...sourceIds].sort();
}

function sourceIdsConsumingCoordinate(
  graph: ReturnType<typeof evaluateSemantic>["dependencies"],
  coordinateName: string
): string[] {
  const resourceNodeId = `resource:named-coordinate:${coordinateName}`;
  const sourceNodeById = new Map<string, string>();
  for (const node of graph.nodes) {
    if (node.kind !== "source") {
      continue;
    }
    sourceNodeById.set(node.id, node.sourceId);
  }
  const sourceIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.relation !== "consumer" || edge.from !== resourceNodeId) {
      continue;
    }
    const sourceId = sourceNodeById.get(edge.to);
    if (sourceId) {
      sourceIds.add(sourceId);
    }
  }
  return [...sourceIds].sort();
}
