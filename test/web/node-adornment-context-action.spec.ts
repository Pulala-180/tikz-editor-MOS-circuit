import { describe, expect, it } from "vitest";
import { applyEditAction } from "../../packages/core/src/edit/actions.js";
import { renderTikzToSvg } from "../../packages/core/src/render/index.js";
import { resolveNodeAdornmentContextAction } from "../../packages/app/src/ui/canvas-panel/node-adornment-context-action.js";
import { wp } from "../coords-helpers.js";

describe("resolveNodeAdornmentContextAction", () => {
  it("resolves a rendered node selection into an add-label action with a nearest-side keyword", () => {
    const source = String.raw`\begin{tikzpicture}
  \node[draw] at (0,0) {A};
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);

    const result = resolveNodeAdornmentContextAction({
      source,
      clickedTargetId: "path:0",
      selectedTargetId: "path:0",
      clickedWorld: wp(20, 0),
      sceneElements: rendered.semantic.scene.elements,
      viewBox: rendered.svg?.viewBox ?? null,
      adornmentKind: "label",
      text: "Label"
    });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") {
      throw new Error("Expected a ready result");
    }
    expect(result.action).toMatchObject({
      kind: "addNodeAdornment",
      nodeId: "node:0:2",
      adornmentKind: "label",
      angle: "right",
      text: "Label"
    });
    expect(result.pendingTextTargetId).toBe("node-adornment:node:0:2:label:0");
  });

  it("produces an action that rewrites source to valid node label syntax", () => {
    const source = String.raw`\begin{tikzpicture}
  \node[draw] (A) at (-1, -1) {A};
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);

    const resolved = resolveNodeAdornmentContextAction({
      source,
      clickedTargetId: "path:0",
      selectedTargetId: "path:0",
      clickedWorld: wp(-1, -2),
      sceneElements: rendered.semantic.scene.elements,
      viewBox: rendered.svg?.viewBox ?? null,
      adornmentKind: "label",
      text: "Label"
    });

    expect(resolved.kind).toBe("ready");
    if (resolved.kind !== "ready") {
      throw new Error("Expected a ready result");
    }

    const applied = applyEditAction(source, [], resolved.action);
    expect(applied.kind).toBe("success");
    if (applied.kind !== "success") {
      throw new Error("Expected generated adornment action to succeed");
    }
    expect(applied.newSource).toContain(`\\node[draw, label=${resolved.action.angle}:Label] (A) at (-1, -1) {A};`);
    expect(applied.newSource).not.toContain("\\node[draw], label=");
  });

  it("resolves a selected node statement to its inline node item and increments the adornment index", () => {
    const source = String.raw`\begin{tikzpicture}
  \node[draw,label=above:X] at (0,0) {A};
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);

    const result = resolveNodeAdornmentContextAction({
      source,
      clickedTargetId: "path:0",
      selectedTargetId: "path:0",
      clickedWorld: wp(0, 20),
      sceneElements: rendered.semantic.scene.elements,
      viewBox: rendered.svg?.viewBox ?? null,
      adornmentKind: "pin",
      text: "Pin"
    });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") {
      throw new Error("Expected a ready result");
    }
    expect(result.action.nodeId).toBe("node:0:2");
    expect(result.action.angle).toBe("above");
    expect(result.pendingTextTargetId).toBe("node-adornment:node:0:2:pin:1");
  });

  it("returns unsupported for non-node targets", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0);
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);

    const result = resolveNodeAdornmentContextAction({
      source,
      clickedTargetId: "path:0",
      selectedTargetId: "path:0",
      clickedWorld: wp(1, 0),
      sceneElements: rendered.semantic.scene.elements,
      viewBox: rendered.svg?.viewBox ?? null,
      adornmentKind: "label",
      text: "Label"
    });

    expect(result.kind).toBe("unsupported");
  });
});
