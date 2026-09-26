import { describe, expect, it } from "vitest";

import {
  resolveHandleDragAction,
  shouldCommitHandleAnchorOnPointerUp
} from "../../packages/app/src/ui/canvas-panel/handle-drag-actions.js";
import {
  isAdditiveSelectionModifier,
  isResizeHandleAdditiveSelectionModifier
} from "../../packages/app/src/ui/canvas-panel/selection-modifiers.js";
import { wp } from "../coords-helpers.js";

describe("handle drag actions", () => {
  it("keeps Shift as additive selection for ordinary handles but not resize handles", () => {
    const shiftOnly = { shiftKey: true, ctrlKey: false, metaKey: false };
    const ctrlOnly = { shiftKey: false, ctrlKey: true, metaKey: false };

    expect(isAdditiveSelectionModifier(shiftOnly)).toBe(true);
    expect(isResizeHandleAdditiveSelectionModifier(shiftOnly)).toBe(false);
    expect(isResizeHandleAdditiveSelectionModifier(ctrlOnly)).toBe(true);
  });

  it("uses moveHandle during drag to allow smooth stretching and preview snapping", () => {
    const action = resolveHandleDragAction({
      handleId: "handle-1",
      newWorld: wp(10, 20),
      activeEndpointAnchor: {
        nodeName: "A",
        anchor: "east",
        world: wp(1, 2),
        tier: "basic"
      }
    });

    expect(action).toEqual({
      kind: "moveHandle",
      handleId: "handle-1",
      newWorld: wp(10, 20)
    });
  });

  it("falls back to moveHandle when no endpoint anchor is active", () => {
    const action = resolveHandleDragAction({
      handleId: "handle-1",
      newWorld: wp(10, 20),
      activeEndpointAnchor: null
    });

    expect(action).toEqual({
      kind: "moveHandle",
      handleId: "handle-1",
      newWorld: wp(10, 20)
    });
  });

  it("commits the anchor connection on pointer up when an endpoint anchor is active", () => {
    expect(
      shouldCommitHandleAnchorOnPointerUp({
        snapshotSource: "\\draw (0,0) -- (1,1);",
        source: "\\draw (0,0) -- (1,2);",
        activeEndpointAnchor: {
          nodeName: "A",
          anchor: "east",
          world: wp(1, 2),
          tier: "basic"
        }
      })
    ).toBe(true);

    expect(
      shouldCommitHandleAnchorOnPointerUp({
        snapshotSource: "\\draw (0,0) -- (1,1);",
        source: "\\draw (0,0) -- (1,2);",
        activeEndpointAnchor: null
      })
    ).toBe(false);
  });
});
