import { describe, expect, it } from "vitest";
import type { WorldPoint } from "../../packages/core/src/coords/points.js";
import type { EditHandle } from "../../packages/core/src/semantic/types.js";
import { identityMatrix } from "../../packages/core/src/semantic/transform.js";
import { computeDragCapability } from "../../packages/app/src/ui/canvas-panel/drag-capability";

function makeHandle(
  overrides: Partial<EditHandle> & {
    id: string;
    sourceId: string;
    sourceFingerprint?: string;
    world?: WorldPoint;
    sourceSpan?: { from: number; to: number };
  }
): EditHandle {
  return {
    id: overrides.id,
    runtimeId: overrides.runtimeId ?? `runtime:handle:${overrides.id}`,
    sourceRef: {
      sourceId: overrides.sourceId,
      sourceSpan: overrides.sourceSpan ?? { from: 0, to: 5 },
      sourceFingerprint: overrides.sourceFingerprint ?? "fingerprint"
    },
    kind: overrides.kind ?? "path-point",
    world: overrides.world ?? { x: 0, y: 0 },
    transform: overrides.transform ?? identityMatrix(),
    sourceText: overrides.sourceText ?? "(0,0)",
    coordinateForm: overrides.coordinateForm ?? "cartesian",
    rewriteMode: overrides.rewriteMode ?? "direct",
    rewriteTargetHandleId: overrides.rewriteTargetHandleId,
    relativePrefix: overrides.relativePrefix,
    relativeBase: overrides.relativeBase,
    local: overrides.local
  } as EditHandle;
}

describe("computeDragCapability", () => {
  it("marks non-endpoint unsupported handles and their source as non-draggable", () => {
    const unsupported = makeHandle({
      id: "h-unsupported",
      sourceId: "path:0",
      kind: "path-control",
      coordinateForm: "named",
      rewriteMode: "unsupported"
    });

    const capability = computeDragCapability([unsupported]);
    expect(capability.draggableHandleIds.has("h-unsupported")).toBe(false);
    expect(capability.draggableSourceIds.has("path:0")).toBe(false);
  });

  it("keeps supported handles draggable while blocking whole-source dragging when mixed", () => {
    const unsupported = makeHandle({
      id: "h-named",
      sourceId: "path:0",
      kind: "path-control",
      coordinateForm: "named",
      rewriteMode: "unsupported",
      sourceSpan: { from: 0, to: 3 }
    });
    const supported = makeHandle({
      id: "h-cart",
      sourceId: "path:0",
      coordinateForm: "cartesian",
      rewriteMode: "direct",
      sourceSpan: { from: 10, to: 15 }
    });

    const capability = computeDragCapability([unsupported, supported]);
    expect(capability.draggableHandleIds.has("h-named")).toBe(false);
    expect(capability.draggableHandleIds.has("h-cart")).toBe(true);
    expect(capability.draggableSourceIds.has("path:0")).toBe(false);
  });

  it("treats named path endpoints as draggable even when rewrite mode is unsupported", () => {
    const endpoint = makeHandle({
      id: "h-endpoint-named",
      sourceId: "path:0",
      kind: "path-point",
      coordinateForm: "named",
      rewriteMode: "unsupported",
      sourceSpan: { from: 6, to: 9 }
    });

    const capability = computeDragCapability([endpoint]);
    expect(capability.draggableHandleIds.has("h-endpoint-named")).toBe(true);
    expect(capability.draggableSourceIds.has("path:0")).toBe(false);
  });

  it("blocks dragging when a handle rewrites to a conflicting shared source span", () => {
    const first = makeHandle({
      id: "h-first",
      sourceId: "path:0",
      sourceSpan: { from: 20, to: 25 }
    });
    const second = makeHandle({
      id: "h-second",
      sourceId: "path:1",
      sourceSpan: { from: 20, to: 25 }
    });

    const capability = computeDragCapability([first, second]);
    expect(capability.draggableHandleIds.size).toBe(0);
    expect(capability.draggableSourceIds.size).toBe(0);
  });

  it("allows named handles that resolve to a shared rewrite target handle", () => {
    const target = makeHandle({
      id: "h-target",
      sourceId: "node:0",
      sourceSpan: { from: 30, to: 35 },
      rewriteMode: "direct",
      coordinateForm: "cartesian"
    });
    const namedAlias = makeHandle({
      id: "h-alias",
      sourceId: "path:0",
      sourceSpan: { from: 50, to: 53 },
      coordinateForm: "named",
      rewriteMode: "unsupported",
      rewriteTargetHandleId: "h-target"
    });

    const capability = computeDragCapability([target, namedAlias]);
    expect(capability.draggableHandleIds.has("h-target")).toBe(true);
    expect(capability.draggableHandleIds.has("h-alias")).toBe(true);
    expect(capability.draggableSourceIds.has("path:0")).toBe(true);
  });

  it("treats synthetic bend handles as draggable", () => {
    const bend = makeHandle({
      id: "h-bend",
      sourceId: "path:0",
      kind: "path-bend",
      sourceSpan: { from: 200, to: 201 },
      coordinateForm: "cartesian",
      rewriteMode: "direct"
    });

    const capability = computeDragCapability([bend]);
    expect(capability.draggableHandleIds.has("h-bend")).toBe(true);
    expect(capability.draggableSourceIds.has("path:0")).toBe(true);
  });
});
