import { describe, expect, it } from "vitest";
import { collectSnapExcludedSourceIds } from "../../packages/app/src/ui/canvas-panel/useCanvasElementInteractions.js";

describe("collectSnapExcludedSourceIds", () => {
  it("excludes synthetic tree descendants when dragging a tree root", () => {
    const excluded = new Set(
      collectSnapExcludedSourceIds(
        ["path:0"],
        {
          scopesById: new Map(),
          ancestorScopeIdsBySourceId: new Map(),
          boundsByScopeId: new Map()
        },
        [
          { sourceRef: { sourceId: "path:0" } },
          { sourceRef: { sourceId: "path:0:tree-child:1:child-operation:0:1" } },
          { sourceRef: { sourceId: "path:0:tree-child:1:child-operation:0:1:tree-child:2:child-operation:0:2" } },
          { sourceRef: { sourceId: "path:1" } }
        ] as any
      )
    );

    expect(excluded.has("path:0")).toBe(true);
    expect(excluded.has("path:0:tree-child:1:child-operation:0:1")).toBe(true);
    expect(excluded.has("path:0:tree-child:1:child-operation:0:1:tree-child:2:child-operation:0:2")).toBe(true);
    expect(excluded.has("path:1")).toBe(false);
  });

  it("preserves scope descendant exclusion behavior", () => {
    const excluded = new Set(
      collectSnapExcludedSourceIds(
        ["scope:0"],
        {
          scopesById: new Map([["scope:0", {} as any]]),
          ancestorScopeIdsBySourceId: new Map([
            ["path:2", ["scope:0"]],
            ["path:3", []]
          ]),
          boundsByScopeId: new Map()
        },
        []
      )
    );

    expect(excluded.has("scope:0")).toBe(true);
    expect(excluded.has("path:2")).toBe(true);
    expect(excluded.has("path:3")).toBe(false);
  });
});
