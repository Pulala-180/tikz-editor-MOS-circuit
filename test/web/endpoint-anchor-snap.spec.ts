import { describe, expect, it } from "vitest";

import type { NodeAnchorTarget } from "../../packages/core/src/semantic/types.js";
import { resolveEndpointAnchorSnap, type MatrixCellAnchorHint } from "../../packages/app/src/ui/canvas-panel/endpoint-anchor-snap";
import { wb, wp } from "../coords-helpers.js";

const TARGETS: NodeAnchorTarget[] = [
  { nodeName: "A", anchor: "center", world: wp(0, 0), tier: "basic" },
  { nodeName: "A", anchor: "east", world: wp(10, 0), tier: "basic" },
  { nodeName: "A", anchor: "base", world: wp(0, -10), tier: "special" },
  { nodeName: "B", anchor: "center", world: wp(80, 0), tier: "basic" },
  { nodeName: "B", anchor: "west", world: wp(70, 0), tier: "basic" }
];

describe("resolveEndpointAnchorSnap", () => {
  it("reveals anchors only for the nearest node within reveal radius", () => {
    const result = resolveEndpointAnchorSnap({
      pointerWorld: wp(4, 0),
      zoom: 1,
      nodeAnchorTargets: TARGETS
    });

    expect(result.visibleAnchors.length).toBeGreaterThan(0);
    expect(result.visibleAnchors.every((target) => target.nodeName === "A")).toBe(true);
  });

  it("reveals only basic anchors when cursor is near node but not very close", () => {
    const result = resolveEndpointAnchorSnap({
      pointerWorld: wp(30, 0),
      zoom: 1,
      nodeAnchorTargets: TARGETS
    });

    expect(result.visibleAnchors.every((target) => target.tier === "basic")).toBe(true);
  });

  it("does not reveal specialized anchors even when cursor is very close", () => {
    const result = resolveEndpointAnchorSnap({
      pointerWorld: wp(9, 0),
      zoom: 1,
      nodeAnchorTargets: TARGETS
    });

    expect(result.visibleAnchors.every((target) => target.tier === "basic")).toBe(true);
    expect(result.visibleAnchors.some((target) => target.anchor === "base")).toBe(false);
    expect(result.snappedAnchor?.nodeName).toBe("A");
    expect(result.snappedAnchor?.anchor).toBe("east");
  });

  it("returns no visible anchors when no node is within reveal radius", () => {
    const result = resolveEndpointAnchorSnap({
      pointerWorld: wp(200, 200),
      zoom: 1,
      nodeAnchorTargets: TARGETS
    });

    expect(result.visibleAnchors).toHaveLength(0);
    expect(result.snappedAnchor).toBeNull();
  });

  it("uses node extent (not only center) for proximity on large nodes", () => {
    const wideTargets: NodeAnchorTarget[] = [
      { nodeName: "Wide", anchor: "center", world: wp(0, 0), tier: "basic" },
      { nodeName: "Wide", anchor: "west", world: wp(-150, 0), tier: "basic" },
      { nodeName: "Wide", anchor: "east", world: wp(150, 0), tier: "basic" },
      { nodeName: "Wide", anchor: "north", world: wp(0, 20), tier: "basic" },
      { nodeName: "Wide", anchor: "south", world: wp(0, -20), tier: "basic" }
    ];

    const result = resolveEndpointAnchorSnap({
      // Near east edge, far from center (center distance ~= 150).
      pointerWorld: wp(148, 0),
      zoom: 1,
      nodeAnchorTargets: wideTargets
    });

    expect(result.visibleAnchors.length).toBeGreaterThan(0);
    expect(result.visibleAnchors.every((target) => target.nodeName === "Wide")).toBe(true);
    expect(result.snappedAnchor?.anchor).toBe("east");
  });

  it("biases anchor reveal toward the nearest matrix cell row/column when hints are available", () => {
    const matrixTargets: NodeAnchorTarget[] = [
      { nodeName: "m-1-1", anchor: "center", world: wp(0, 0), tier: "basic" },
      { nodeName: "m-1-1", anchor: "east", world: wp(0.8, 0), tier: "basic" },
      { nodeName: "m-1-2", anchor: "center", world: wp(1.6, 0), tier: "basic" },
      { nodeName: "m-1-2", anchor: "west", world: wp(1.2, 0), tier: "basic" }
    ];
    const matrixHints: MatrixCellAnchorHint[] = [
      {
        matrixSourceId: "path:0",
        cellSourceId: "node:0:0:matrix-cell:1:1",
        row: 1,
        column: 1,
        bounds: wb(-0.4, -0.4, 0.9, 0.4)
      },
      {
        matrixSourceId: "path:0",
        cellSourceId: "node:0:0:matrix-cell:1:2",
        row: 1,
        column: 2,
        bounds: wb(1.0, -0.4, 2.1, 0.4)
      }
    ];

    const result = resolveEndpointAnchorSnap({
      pointerWorld: wp(1.05, 0),
      zoom: 1,
      nodeAnchorTargets: matrixTargets,
      matrixCellAnchorHints: matrixHints
    });

    expect(result.visibleAnchors.length).toBeGreaterThan(0);
    expect(result.visibleAnchors.every((target) => target.nodeName === "m-1-2")).toBe(true);
    expect(result.snappedAnchor?.nodeName).toBe("m-1-2");
  });

  it("shows both matrix-cell anchors and matrix anchors for matrix cell hover", () => {
    const matrixTargets: NodeAnchorTarget[] = [
      { nodeName: "m", anchor: "center", world: wp(0, 0), tier: "basic" },
      { nodeName: "m", anchor: "east", world: wp(2, 0), tier: "basic" },
      { nodeName: "m-1-1", anchor: "center", world: wp(1, 1), tier: "basic" },
      { nodeName: "m-1-1", anchor: "east", world: wp(1.2, 1), tier: "basic" }
    ];
    const matrixHints: MatrixCellAnchorHint[] = [
      {
        matrixSourceId: "path:0",
        cellSourceId: "node:0:0:matrix-cell:1:1",
        row: 1,
        column: 1,
        bounds: wb(0.7, 0.7, 1.3, 1.3)
      }
    ];

    const result = resolveEndpointAnchorSnap({
      pointerWorld: wp(1.1, 1.0),
      zoom: 1,
      nodeAnchorTargets: matrixTargets,
      matrixCellAnchorHints: matrixHints
    });

    const nodeNames = new Set(result.visibleAnchors.map((target) => target.nodeName));
    expect(nodeNames.has("m-1-1")).toBe(true);
    expect(nodeNames.has("m")).toBe(true);
  });

  it("keeps snapping to the nearest anchor when matrix and cell anchors are both visible", () => {
    const matrixTargets: NodeAnchorTarget[] = [
      { nodeName: "m", anchor: "center", world: wp(0, 0), tier: "basic" },
      { nodeName: "m", anchor: "east", world: wp(2, 0), tier: "basic" },
      { nodeName: "m-1-1", anchor: "center", world: wp(1, 1), tier: "basic" },
      { nodeName: "m-1-1", anchor: "east", world: wp(1.2, 1), tier: "basic" }
    ];
    const matrixHints: MatrixCellAnchorHint[] = [
      {
        matrixSourceId: "path:0",
        cellSourceId: "node:0:0:matrix-cell:1:1",
        row: 1,
        column: 1,
        bounds: wb(0.7, 0.7, 1.3, 1.3)
      }
    ];

    const result = resolveEndpointAnchorSnap({
      pointerWorld: wp(1.18, 1.0),
      zoom: 1,
      nodeAnchorTargets: matrixTargets,
      matrixCellAnchorHints: matrixHints
    });

    expect(result.snappedAnchor?.nodeName).toBe("m-1-1");
    expect(result.snappedAnchor?.anchor).toBe("east");
  });

  it("maintains sticky hysteresis lock when pointer moves beyond initial snap radius but within release radius", () => {
    // Initial snap radius is 20px, release radius is 32px.
    // At distance = 25px (outside 20px, inside 32px):
    // Without previousSnappedAnchor, it would NOT snap:
    const withoutPrev = resolveEndpointAnchorSnap({
      pointerWorld: wp(0, 25),
      zoom: 1,
      nodeAnchorTargets: TARGETS
    });
    expect(withoutPrev.snappedAnchor).toBeNull();

    // With previousSnappedAnchor (anchor 'center' at (0,0)), it STAYS locked:
    const withPrev = resolveEndpointAnchorSnap({
      pointerWorld: wp(0, 25),
      zoom: 1,
      nodeAnchorTargets: TARGETS,
      previousSnappedAnchor: TARGETS[0]
    });
    expect(withPrev.snappedAnchor?.nodeName).toBe("A");
    expect(withPrev.snappedAnchor?.anchor).toBe("center");

    // Beyond release radius (distance = 35px > 32px), it breaks away:
    const beyondRelease = resolveEndpointAnchorSnap({
      pointerWorld: wp(0, 35),
      zoom: 1,
      nodeAnchorTargets: TARGETS,
      previousSnappedAnchor: TARGETS[0]
    });
    expect(beyondRelease.snappedAnchor).toBeNull();
  });
});
