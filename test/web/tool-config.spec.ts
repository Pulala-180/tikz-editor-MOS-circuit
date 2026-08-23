import { describe, expect, it } from "vitest";
import {
  isToolCreateMode,
  resolveToolbarToolMode,
  toolModeAutoOpensPopup,
  toolModeFromShortcut,
  toolModeHasPopup,
  toolModePopupKind
} from "../../packages/app/src/ui/tool-config.js";

describe("resolveToolbarToolMode", () => {
  it("deactivates non-select tool when reclicked", () => {
    expect(resolveToolbarToolMode("addRect", "addRect")).toBe("select");
    expect(resolveToolbarToolMode("addNode", "addNode")).toBe("select");
    expect(resolveToolbarToolMode("addFreehand", "addFreehand")).toBe("select");
  });

  it("keeps popup-enabled tool active when reclicked", () => {
    expect(resolveToolbarToolMode("addShape", "addShape")).toBe("addShape");
    expect(resolveToolbarToolMode("addMatrix", "addMatrix")).toBe("addMatrix");
  });

  it("keeps select active when reclicking select", () => {
    expect(resolveToolbarToolMode("select", "select")).toBe("select");
  });

  it("switches to clicked mode for normal tool changes", () => {
    expect(resolveToolbarToolMode("select", "addLine")).toBe("addLine");
    expect(resolveToolbarToolMode("addArrow", "addEllipse")).toBe("addEllipse");
  });

  it("maps keyboard shortcut B to addBezier", () => {
    expect(toolModeFromShortcut("b")).toBe("addBezier");
    expect(toolModeFromShortcut("B")).toBe("addBezier");
  });

  it("maps keyboard shortcut P to addPath", () => {
    expect(toolModeFromShortcut("p")).toBe("addPath");
    expect(toolModeFromShortcut("P")).toBe("addPath");
  });

  it("maps keyboard shortcut F to addFreehand", () => {
    expect(toolModeFromShortcut("f")).toBe("addFreehand");
    expect(toolModeFromShortcut("F")).toBe("addFreehand");
  });

  it("maps keyboard shortcut S to addShape", () => {
    expect(toolModeFromShortcut("s")).toBe("addShape");
    expect(toolModeFromShortcut("S")).toBe("addShape");
  });

  it("treats addBezier as a tool-create mode", () => {
    expect(isToolCreateMode("addBezier")).toBe(true);
    expect(isToolCreateMode("addPath")).toBe(true);
    expect(isToolCreateMode("addShape")).toBe(true);
    expect(isToolCreateMode("addFreehand")).toBe(true);
    expect(isToolCreateMode("select")).toBe(false);
  });

  it("treats addGrid as a create mode without a keyboard shortcut", () => {
    expect(isToolCreateMode("addGrid")).toBe(true);
    expect(toolModeFromShortcut("g")).toBeNull();
    expect(toolModeFromShortcut("G")).toBeNull();
  });

  it("exposes popup metadata for shape/matrix pickers but not freehand or rectangle", () => {
    expect(toolModeHasPopup("addFreehand")).toBe(false);
    expect(toolModePopupKind("addFreehand")).toBeNull();
    expect(toolModeHasPopup("addShape")).toBe(true);
    expect(toolModePopupKind("addShape")).toBe("shape-picker");
    expect(toolModeHasPopup("addMatrix")).toBe(true);
    expect(toolModePopupKind("addMatrix")).toBe("matrix-picker");
    // Shape tool no longer auto-opens; it opens on click but only activates when a shape is selected
    expect(toolModeAutoOpensPopup("addShape")).toBe(false);
    expect(toolModeHasPopup("addRect")).toBe(false);
    expect(toolModePopupKind("addRect")).toBeNull();
  });
});
