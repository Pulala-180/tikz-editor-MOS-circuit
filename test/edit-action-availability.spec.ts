import { afterEach, describe, expect, it, vi } from "vitest";
import { getEditActionAvailability } from "../packages/core/src/edit/action-availability.js";
import * as parserModule from "../packages/core/src/parser/index.js";
import { renderTikzToSvg } from "../packages/core/src/render/index.js";

describe("getEditActionAvailability", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gates align/distribute actions by selection size", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0);
  \draw (3,1) -- (4,1);
  \draw (10,4) -- (11,4);
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);

    const availability = getEditActionAvailability({
      source,
      snapshotSource: source,
      selectedSourceIds: ["path:0"],
      scene: rendered.semantic.scene,
      editHandles: rendered.semantic.editHandles,
      hasClipboardContent: false
    });

    expect(availability["align-left"].enabled).toBe(false);
    expect(availability["align-left"].reason).toContain("at least 2");
    expect(availability["distribute-horizontal"].enabled).toBe(false);
    expect(availability["distribute-horizontal"].reason).toContain("at least 3");
    expect(availability["transform-rotateLeft90"].enabled).toBe(true);
    expect(availability["transform-flipHorizontal"].enabled).toBe(true);
  });

  it("gates arrange actions when snapshot/source are out of sync", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0);
  \draw (2,1) -- (3,1);
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);

    const availability = getEditActionAvailability({
      source,
      snapshotSource: `${source} `,
      selectedSourceIds: ["path:0", "path:1"],
      scene: rendered.semantic.scene,
      editHandles: rendered.semantic.editHandles
    });

    expect(availability["align-left"].enabled).toBe(false);
    expect(availability["align-left"].reason).toContain("recompute");
    expect(availability["transform-rotateRight90"].enabled).toBe(false);
    expect(availability["transform-rotateRight90"].reason).toContain("recompute");
  });

  it("gates arrange actions when any selected element is non-rewritable", () => {
    const source = String.raw`\begin{tikzpicture}
  \coordinate (A) at (2,0);
  \coordinate (B) at (3,0);
  \draw (0,0) -- (1,0);
  \draw (A) -- (B);
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);

    const availability = getEditActionAvailability({
      source,
      snapshotSource: source,
      selectedSourceIds: ["path:2", "path:3"],
      scene: rendered.semantic.scene,
      editHandles: rendered.semantic.editHandles
    });

    expect(availability["align-left"].enabled).toBe(false);
    expect(availability["align-left"].reason).toContain("unsupported coordinate forms");
  });

  it("gates transform actions for empty and adornment selections", () => {
    const source = String.raw`\begin{tikzpicture}
  \node[draw,label=above:A] {B};
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);

    const empty = getEditActionAvailability({
      source,
      snapshotSource: source,
      selectedSourceIds: [],
      scene: rendered.semantic.scene,
      editHandles: rendered.semantic.editHandles
    });
    expect(empty["transform-flipVertical"].enabled).toBe(false);
    expect(empty["transform-flipVertical"].reason).toContain("at least one");

    const adornment = getEditActionAvailability({
      source,
      snapshotSource: source,
      selectedSourceIds: ["node-adornment:node:0:2:label:0"],
      scene: rendered.semantic.scene,
      editHandles: rendered.semantic.editHandles
    });
    expect(adornment["transform-flipHorizontal"].enabled).toBe(false);
    expect(adornment["transform-flipHorizontal"].reason).toContain("Adornment");
  });

  it("allows transform actions for scope selections", () => {
    const source = String.raw`\begin{tikzpicture}
  \begin{scope}
    \draw (0,0) -- (1,0);
  \end{scope}
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);

    const availability = getEditActionAvailability({
      source,
      snapshotSource: source,
      selectedSourceIds: ["scope:0"],
      scene: rendered.semantic.scene,
      editHandles: rendered.semantic.editHandles
    });

    expect(availability["transform-rotateLeft90"].enabled).toBe(true);
    expect(availability["transform-rotateLeft90"].reason).toBeNull();
    expect(availability["transform-flipHorizontal"].enabled).toBe(true);
    expect(availability["transform-flipHorizontal"].reason).toBeNull();
  });

  it("gates arrange actions when bounds are missing", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0);
  \draw (2,1) -- (3,1);
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);

    const availability = getEditActionAvailability({
      source,
      snapshotSource: source,
      selectedSourceIds: ["path:0", "missing-id"],
      scene: rendered.semantic.scene,
      editHandles: rendered.semantic.editHandles
    });

    expect(availability["align-left"].enabled).toBe(false);
    expect(availability["align-left"].reason).toContain("geometry bounds");
  });

  it("gates arrange actions when selected elements have no edit handles", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0);
  \draw (2,1) -- (3,1);
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);

    const availability = getEditActionAvailability({
      source,
      snapshotSource: source,
      selectedSourceIds: ["path:0", "path:1"],
      scene: rendered.semantic.scene,
      editHandles: []
    });

    expect(availability["align-left"].enabled).toBe(false);
    expect(availability["align-left"].reason).toContain("edit handles");
  });

  it("enables arrange actions for rewritable multi-selection", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0);
  \draw (3,1) -- (4,1);
  \draw (10,4) -- (11,4);
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);

    const availability = getEditActionAvailability({
      source,
      snapshotSource: source,
      selectedSourceIds: ["path:0", "path:1", "path:2"],
      scene: rendered.semantic.scene,
      editHandles: rendered.semantic.editHandles
    });

    expect(availability["align-left"].enabled).toBe(true);
    expect(availability["distribute-horizontal"].enabled).toBe(true);
    expect(availability["distribute-vertical"].enabled).toBe(true);
  });

  it("disables no-op arrange modes", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0);
  \draw (0,2) -- (1,2);
  \draw (0,4) -- (1,4);
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);

    const availability = getEditActionAvailability({
      source,
      snapshotSource: source,
      selectedSourceIds: ["path:0", "path:1", "path:2"],
      scene: rendered.semantic.scene,
      editHandles: rendered.semantic.editHandles
    });

    expect(availability["align-left"].enabled).toBe(false);
    expect(availability["align-left"].reason).toContain("already aligned");
    expect(availability["distribute-vertical"].enabled).toBe(false);
    expect(availability["distribute-vertical"].reason).toContain("already evenly distributed");
  });

  it("reuses one parsed explicit-path analysis across path-related availability checks", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0) -- (2,0);
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);
    const activeHandleId = rendered.semantic.editHandles.find(
      (handle) => source.slice(handle.sourceRef.sourceSpan.from, handle.sourceRef.sourceSpan.to) === "(1,0)"
    )?.id ?? null;
    const parseSpy = vi.spyOn(parserModule, "parseTikz");

    const availability = getEditActionAvailability({
      source,
      activeFigureId: "figure:0",
      snapshotSource: source,
      selectedSourceIds: ["path:0"],
      scene: rendered.semantic.scene,
      editHandles: rendered.semantic.editHandles,
      activeHandleId
    });

    expect(availability["path-split"].enabled).toBe(true);
    expect(availability["path-delete-point"].enabled).toBe(true);
    expect(availability["path-point-smooth"].enabled).toBe(true);
    expect(parseSpy).toHaveBeenCalledTimes(1);
  });

  it("enables delete point for closed explicit path anchors", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0) -- (1,1) -- cycle;
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);
    const activeHandleId = rendered.semantic.editHandles.find(
      (handle) => source.slice(handle.sourceRef.sourceSpan.from, handle.sourceRef.sourceSpan.to) === "(0,0)"
    )?.id ?? null;

    const availability = getEditActionAvailability({
      source,
      activeFigureId: "figure:0",
      snapshotSource: source,
      selectedSourceIds: ["path:0"],
      scene: rendered.semantic.scene,
      editHandles: rendered.semantic.editHandles,
      activeHandleId
    });

    expect(availability["path-delete-point"].enabled).toBe(true);
  });

  it("enables group for same-parent multi-statement selections and gates mixed parents", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0);
  \draw (0,1) -- (1,1);
  \begin{scope}
    \draw (0,2) -- (1,2);
  \end{scope}
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);

    const allowed = getEditActionAvailability({
      source,
      snapshotSource: source,
      selectedSourceIds: ["path:0", "path:1"],
      scene: rendered.semantic.scene,
      editHandles: rendered.semantic.editHandles
    });
    expect(allowed.group.enabled).toBe(true);

    const mixedParents = getEditActionAvailability({
      source,
      snapshotSource: source,
      selectedSourceIds: ["path:0", "path:3"],
      scene: rendered.semantic.scene,
      editHandles: rendered.semantic.editHandles
    });
    expect(mixedParents.group.enabled).toBe(false);
    expect(mixedParents.group.reason).toContain("same parent");
  });

  it("enables repeat for authored contiguous blocks and rejects non-contiguous blocks", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,0);
  \draw (0,1) -- (1,1);
  \draw (0,2) -- (1,2);
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);

    const contiguous = getEditActionAvailability({
      source,
      snapshotSource: source,
      selectedSourceIds: ["path:0", "path:1"],
      scene: rendered.semantic.scene,
      editHandles: rendered.semantic.editHandles
    });
    expect(contiguous.repeat.enabled).toBe(true);

    const nonContiguous = getEditActionAvailability({
      source,
      snapshotSource: source,
      selectedSourceIds: ["path:0", "path:2"],
      scene: rendered.semantic.scene,
      editHandles: rendered.semantic.editHandles
    });
    expect(nonContiguous.repeat.enabled).toBe(false);
    expect(nonContiguous.repeat.reason).toContain("contiguous");
  });

  it("rejects repeat for foreach-origin selections", () => {
    const source = String.raw`\begin{tikzpicture}
  \foreach \x in {0,...,1} {
    \draw (\x,0) -- ++(1,0);
  }
\end{tikzpicture}`;
    const rendered = renderTikzToSvg(source);

    const availability = getEditActionAvailability({
      source,
      snapshotSource: source,
      selectedSourceIds: ["foreach:0"],
      scene: rendered.semantic.scene,
      editHandles: rendered.semantic.editHandles
    });

    expect(availability.repeat.enabled).toBe(false);
    expect(availability.repeat.reason).toContain("foreach");
  });

  it("enables ungroup only for ungroupable scopes", () => {
    const ungroupableSource = String.raw`\begin{tikzpicture}
  \begin{scope}[name=mygroup]
    \draw (0,0) -- (1,0);
  \end{scope}
\end{tikzpicture}`;
    const ungroupableRendered = renderTikzToSvg(ungroupableSource);
    const ungroupable = getEditActionAvailability({
      source: ungroupableSource,
      snapshotSource: ungroupableSource,
      selectedSourceIds: ["scope:0"],
      scene: ungroupableRendered.semantic.scene,
      editHandles: ungroupableRendered.semantic.editHandles
    });
    expect(ungroupable.ungroup.enabled).toBe(true);

    const transformedSource = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(1,0)}]
    \draw (0,0) -- (1,0);
  \end{scope}
\end{tikzpicture}`;
    const transformedRendered = renderTikzToSvg(transformedSource);
    const transformed = getEditActionAvailability({
      source: transformedSource,
      snapshotSource: transformedSource,
      selectedSourceIds: ["scope:0"],
      scene: transformedRendered.semantic.scene,
      editHandles: transformedRendered.semantic.editHandles
    });
    expect(transformed.ungroup.enabled).toBe(false);
    expect(transformed.ungroup.reason).toContain("without options");
  });
});
