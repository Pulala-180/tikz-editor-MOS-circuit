import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderTikzToSvgAsync } from "../../../packages/core/src/render/index.ts";
import type { ResizeRole } from "../../../packages/core/src/edit/actions.ts";
import type { EditHandle, SceneElement, ScenePath } from "../../../packages/core/src/semantic/types.ts";
import type { SvgBounds, SvgPoint } from "../../../packages/app/src/ui/coords/types.ts";
import { computeDragCapability } from "../../../packages/app/src/ui/canvas-panel/drag-capability.ts";
import { deriveCurveControlLines } from "../../../packages/app/src/ui/canvas-panel/curve-controls.ts";
import { worldToSvgPoint } from "../../../packages/app/src/ui/canvas-panel/geometry.ts";
import {
  collectSourceBounds,
  isTextOnlyNodeSource,
  preferredNodeBoundsForSource,
  resolveScenePathShapeHint,
  sourceHasSingleResizablePathShape
} from "../../../packages/app/src/ui/canvas-panel/panel-helpers.ts";
import { resolveResizeFrameForSource, resolveResizeFrameFromBounds } from "../../../packages/app/src/ui/canvas-panel/resize-frames.ts";
import { augmentScopeOverlayWithMatrices, buildScopeOverlayIndex } from "../../../packages/app/src/ui/canvas-panel/scope-overlay.ts";
import {
  buildResizeHandleDisplaysForBounds,
  buildResizeHandleDisplaysForFrame
} from "../../../packages/app/src/ui/canvas-panel/useCanvasSelectionDerivedState.ts";

type ToolPreview = {
  mode: string;
  source: string;
  bbox?: string;
};

type ToolPreviewOutput = {
  svg: string;
};

type SelectionBoxDisplay =
  | {
      sourceId: string;
      dashed?: boolean;
      kind: "axis-aligned";
      bounds: SvgBounds;
    }
  | {
      sourceId: string;
      dashed?: boolean;
      kind: "polygon";
      points: ReadonlyArray<SvgPoint>;
    };

type HandleDisplay =
  | {
      point: SvgPoint;
      kind: "move-handle";
      handle: EditHandle;
    }
  | {
      point: SvgPoint;
      kind: "move-element";
      elementId: string;
    }
  | {
      point: SvgPoint;
      kind: "resize-element";
      elementId: string;
      role: ResizeRole;
      rotationDeg: number;
    };

type AppHandleDisplay =
  | ReturnType<typeof buildResizeHandleDisplaysForFrame>[number]
  | ReturnType<typeof buildResizeHandleDisplaysForBounds>[number];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.resolve(__dirname, "../src/generated/tool-svgs.ts");
const SVG_OPTIONS = { svg: { padding: 0 } } as const;
const PREVIEW_CANVAS_SCALE = 6;
const PREVIEW_ASPECT_RATIO = 16 / 5.3;
const REFERENCE_PREVIEW_WIDTH_PX = 280;
const HANDLE_SIZE_PX = 6.5;
const HANDLE_STROKE_WIDTH_PX = 1.2;
const SELECTION_STROKE_WIDTH_PX = 1.1;
const CURVE_CONTROL_STROKE_WIDTH_PX = 1.1;
const CROP_PADDING_PX = 11;
const MIN_CROP_HEIGHT_PX = 46;
const HANDLE_FILL = "#fff";
const HANDLE_STROKE = "#1060b0";
const SELECTION_STROKE = "rgba(13, 95, 182, 0.9)";
const CURVE_CONTROL_STROKE = "rgba(13, 95, 182, 0.5)";

const previews: readonly ToolPreview[] = [
  {
    mode: "select",
    source: String.raw`\node[draw,circle] (a) at (-0.58,0) {A};
\node[draw,circle] (b) at (0.58,0) {B};
\draw[->] (a) -- (b);`
  },
  {
    mode: "magnify",
    source: String.raw`\node[draw, circle, fill=blue!10] (s) at (-1.12,0.22) {$s$};
\node[draw, rounded corners, fill=green!12] (p) at (-0.18,0.42) {parse};
\node[draw, rounded corners, fill=yellow!18] (i) at (-0.22,-0.36) {IR};
\node[draw, circle, fill=red!10] (t) at (1.08,0.03) {SVG};
\draw[->] (s) -- (p);
\draw[->] (s) -- (i);
\draw[->] (p) -- (t);
\draw[->] (i) -- (t);
\draw[->, bend left=18] (p) to (i);`,
    bbox: "(-1.75,-0.82) rectangle (1.75,0.82)"
  },
  {
    mode: "addNode",
    source: String.raw`\node at (0,0) {Nodes with text};`
  },
  {
    mode: "addShape",
    source: String.raw`\node[draw, shape=starburst] at (0,0) {Shaped nodes};`,
    bbox: "(-2.2,-1.0) rectangle (2.2,1.0)"
  },
  {
    mode: "addMatrix",
    source: String.raw`\matrix [matrix of nodes] at (0,0) {
  A & B & C & D \\
  E & F & G & H \\
};`
  },
  {
    mode: "addLine",
    source: String.raw`\draw (-1.09,-0.2) -- (1.11,0.2);`
  },
  {
    mode: "addArrow",
    source: String.raw`\draw[->] (-1,-0.2) -- (1,0.2);`
  },
  {
    mode: "addBezier",
    source: String.raw`\draw (-1,-0.3) .. controls (-0.33,0.21) and (0.33,0.21) .. (1,-0.3);`
  },
  {
    mode: "addPath",
    source: String.raw`\draw (-1,-0.14) -- (-0.52,0.15) -- (-0.26,-0.17) -- (0.2,0.15) .. controls (0.27,-0.04) and (0.4,-0.13) .. (0.6,-0.13) .. controls (0.76,-0.1) and (0.85,-0.01) .. (0.88,0.15);`
  },
  {
    mode: "addFreehand",
    source: String.raw`\draw (-1.01,-0.23) .. controls (-0.99,-0.2) and (-0.93,-0.07) .. (-0.88,-0.03) .. controls (-0.82,0) and (-0.73,0.02) .. (-0.69,-0.02) .. controls (-0.64,-0.05) and (-0.64,-0.23) .. (-0.59,-0.24) .. controls (-0.54,-0.25) and (-0.47,-0.11) .. (-0.4,-0.07) .. controls (-0.34,-0.03) and (-0.25,0.02) .. (-0.19,-0.01) .. controls (-0.14,-0.03) and (-0.11,-0.21) .. (-0.05,-0.21) .. controls (0,-0.22) and (0.08,-0.07) .. (0.14,-0.03) .. controls (0.2,0) and (0.26,0.04) .. (0.32,0.02) .. controls (0.38,0.01) and (0.45,-0.13) .. (0.51,-0.13) .. controls (0.56,-0.13) and (0.6,0.02) .. (0.66,0.04) .. controls (0.72,0.06) and (0.81,-0.04) .. (0.86,-0.03) .. controls (0.91,-0.01) and (0.92,0.08) .. (0.94,0.13) .. controls (0.97,0.17) and (1,0.23) .. (1.01,0.25);`
  },
  {
    mode: "addGrid",
    source: String.raw`\draw (-1,-0.4) grid[ystep=0.2cm, xstep=0.5cm] (1,0.4);`
  },
  {
    mode: "addRect",
    source: String.raw`\draw (-1,-0.25) rectangle (1,0.25);`
  },
  {
    mode: "addEllipse",
    source: String.raw`\draw (0,0) ellipse [x radius=1cm, y radius=0.18cm];`
  },
  {
    mode: "addCircle",
    source: String.raw`\draw (0,0) circle (0.47cm);`
  },
  {
    mode: "addBucket",
    source: String.raw`\draw[fill=green!18, draw=black] (-1,-0.25) rectangle (1,0.25);`
  }
] as const;

function wrapSource(preview: ToolPreview): string {
  const bbox = preview.bbox ?? "(-1.65,-0.7) rectangle (1.65,0.7)";
  return String.raw`\begin{tikzpicture}
\path[use as bounding box] ${bbox};
${preview.source}
\end{tikzpicture}`;
}

const renderedEntries = await Promise.all(
  previews.map(async (preview) => {
    const source = wrapSource(preview);
    const rendered = await renderTikzToSvgAsync(source, SVG_OPTIONS);
    const diagnostics = [
      ...rendered.parse.diagnostics,
      ...rendered.semantic.diagnostics,
      ...rendered.renderDiagnostics
    ];
    const hardDiagnostics = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
    if (hardDiagnostics.length > 0) {
      throw new Error(`Rendering ${preview.mode} produced diagnostics: ${JSON.stringify(hardDiagnostics)}`);
    }
    const { cropViewBox, overlaySvg } = buildSelectionOverlaySvg({
      preview,
      elements: rendered.semantic.scene.elements,
      editHandles: rendered.semantic.editHandles,
      statements: rendered.parse.figure.body,
      viewBox: rendered.svg.viewBox
    });
    const croppedSvg = replaceRootViewBox(rendered.svg.svg, cropViewBox);
    return [
      preview.mode,
      {
        svg: appendOverlaySvg(croppedSvg, overlaySvg)
      }
    ] as const;
  })
);

const file = `// Generated by apps/landing/scripts/generate-tool-svgs.mts.
// Do not edit by hand.

export const LANDING_TOOL_SVGS = ${JSON.stringify(Object.fromEntries(renderedEntries) satisfies Record<string, ToolPreviewOutput>, null, 2)} as const;
`;

await mkdir(path.dirname(OUT_FILE), { recursive: true });
await writeFile(OUT_FILE, file);

function appendOverlaySvg(baseSvg: string, overlaySvg: string): string {
  if (!overlaySvg) {
    return baseSvg;
  }
  const overlayStart = overlaySvg.indexOf(">");
  const overlayEnd = overlaySvg.lastIndexOf("</svg>");
  const baseEnd = baseSvg.lastIndexOf("</svg>");
  if (overlayStart < 0 || overlayEnd < 0 || baseEnd < 0) {
    throw new Error("Could not merge tool preview overlay into SVG.");
  }
  const overlayInner = overlaySvg.slice(overlayStart + 1, overlayEnd);
  return `${baseSvg.slice(0, baseEnd)}${overlayInner}${baseSvg.slice(baseEnd)}`;
}

function replaceRootViewBox(baseSvg: string, viewBox: SvgViewBoxLike): string {
  return baseSvg.replace(
    /\bviewBox="[^"]+"/,
    `viewBox="${fmt(viewBox.x)} ${fmt(viewBox.y)} ${fmt(viewBox.width)} ${fmt(viewBox.height)}"`
  );
}

function buildSelectionOverlaySvg({
  preview,
  elements,
  editHandles,
  statements,
  viewBox
}: {
  preview: ToolPreview;
  elements: SceneElement[];
  editHandles: EditHandle[];
  statements: Parameters<typeof buildScopeOverlayIndex>[0];
  viewBox: { x: number; y: number; width: number; height: number };
}): { cropViewBox: SvgViewBoxLike; overlaySvg: string } {
  const selectedElementIds = resolvePreviewSelectedSourceIds(preview, elements, editHandles);
  const selectedHandles = editHandles.filter((handle) => selectedElementIds.has(handle.sourceRef.sourceId));
  const selectedNodeSourceIds = new Set(
    selectedHandles
      .filter((handle) => handle.kind === "node-position")
      .map((handle) => handle.sourceRef.sourceId)
  );
  const sourceBoundsSvg = collectSourceBounds(elements, viewBox);
  const contentBounds = boundsForPreviewContent(sourceBoundsSvg);
  const scopeOverlay = augmentScopeOverlayWithMatrices(
    buildScopeOverlayIndex(statements, sourceBoundsSvg),
    elements,
    sourceBoundsSvg
  );
  const matrixSourceIds = new Set<string>();
  const matrixCellSourceIds = new Set<string>();
  for (const element of elements) {
    const matrixCell = element.matrixCell;
    if (!matrixCell) {
      continue;
    }
    matrixSourceIds.add(matrixCell.matrixSourceId);
    matrixCellSourceIds.add(matrixCell.cellSourceId);
  }

  const dragCapability = computeDragCapability(editHandles);
  const resizablePathShapeSourceIds = new Set<string>();
  for (const sourceId of selectedElementIds) {
    if (matrixSourceIds.has(sourceId) || matrixCellSourceIds.has(sourceId)) {
      continue;
    }
    if (sourceHasSingleResizablePathShape(elements, editHandles, sourceId, statements)) {
      resizablePathShapeSourceIds.add(sourceId);
    }
  }

  const nodeResizeSourceIds = new Set<string>();
  for (const handle of selectedHandles) {
    if (handle.kind === "node-position" && !matrixSourceIds.has(handle.sourceRef.sourceId) && !matrixCellSourceIds.has(handle.sourceRef.sourceId)) {
      nodeResizeSourceIds.add(handle.sourceRef.sourceId);
    }
  }

  const resizeFrameSourceIds = new Set<string>(resizablePathShapeSourceIds);
  for (const sourceId of nodeResizeSourceIds) {
    resizeFrameSourceIds.add(sourceId);
  }
  for (const sourceId of selectedElementIds) {
    if (matrixSourceIds.has(sourceId) || matrixCellSourceIds.has(sourceId)) {
      resizeFrameSourceIds.add(sourceId);
    }
  }

  const textOnlyNodeSelectionSourceIds = new Set<string>();
  for (const sourceId of selectedNodeSourceIds) {
    if (isTextOnlyNodeSource(elements, sourceId)) {
      textOnlyNodeSelectionSourceIds.add(sourceId);
    }
  }

  const selectionBoundsBySource = new Map<string, SvgBounds>();
  for (const sourceId of selectedElementIds) {
    const fallbackBounds = sourceBoundsSvg.get(sourceId) ?? scopeOverlay.boundsByScopeId.get(sourceId) ?? null;
    const bounds = selectedNodeSourceIds.has(sourceId)
      ? preferredNodeBoundsForSource(elements, sourceId, viewBox, fallbackBounds)
      : fallbackBounds;
    if (bounds) {
      selectionBoundsBySource.set(sourceId, bounds);
    }
  }

  const resizeFramesBySource = new Map<string, ReturnType<typeof resolveResizeFrameForSource>>();
  for (const sourceId of resizeFrameSourceIds) {
    const textOnlyBounds = textOnlyNodeSelectionSourceIds.has(sourceId)
      ? selectionBoundsBySource.get(sourceId)
      : undefined;
    if (textOnlyBounds) {
      resizeFramesBySource.set(sourceId, resolveResizeFrameFromBounds(sourceId, textOnlyBounds, viewBox));
      continue;
    }
    const scopeBounds = scopeOverlay.boundsByScopeId.get(sourceId);
    if (scopeBounds && matrixSourceIds.has(sourceId)) {
      resizeFramesBySource.set(sourceId, resolveResizeFrameFromBounds(sourceId, scopeBounds, viewBox));
      continue;
    }
    const path = elements.find((element): element is ScenePath => element.sourceRef.sourceId === sourceId && element.kind === "Path");
    const pathShapeHint = path ? resolveScenePathShapeHint(path, statements, sourceId) : undefined;
    resizeFramesBySource.set(
      sourceId,
      resolveResizeFrameForSource(elements, editHandles, sourceId, viewBox, pathShapeHint)
    );
  }

  const selectionBoxes: SelectionBoxDisplay[] = [];
  for (const sourceId of resizeFrameSourceIds) {
    const resizeFrame = resizeFramesBySource.get(sourceId) ?? null;
    if (resizeFrame) {
      selectionBoxes.push({
        sourceId,
        dashed: textOnlyNodeSelectionSourceIds.has(sourceId),
        kind: "polygon",
        points: resizeFrame.polygonSvg
      });
      continue;
    }
    const bounds = selectionBoundsBySource.get(sourceId);
    if (bounds) {
      selectionBoxes.push({
        sourceId,
        dashed: textOnlyNodeSelectionSourceIds.has(sourceId),
        kind: "axis-aligned",
        bounds
      });
    }
  }

  const selectedResizeHandleSourceIds = new Set(resizeFrameSourceIds);
  const handleDisplays: HandleDisplay[] = [];
  const draggableSourceIds = new Set(dragCapability.draggableSourceIds);
  for (const sourceId of matrixSourceIds) {
    draggableSourceIds.add(sourceId);
  }
  for (const handle of selectedHandles) {
    if (handle.kind === "node-position") {
      continue;
    }
    if (handle.kind === "path-point" && resizablePathShapeSourceIds.has(handle.sourceRef.sourceId)) {
      continue;
    }
    handleDisplays.push({
      point: worldToSvgPoint(handle.world, viewBox),
      kind: "move-handle",
      handle
    });
  }
  for (const sourceId of selectedResizeHandleSourceIds) {
    const resizeFrame = resizeFramesBySource.get(sourceId) ?? null;
    if (resizeFrame) {
      handleDisplays.push(
        ...buildResizeHandleDisplaysForFrame({
          sourceId,
          resizeFrame,
          canvasScale: PREVIEW_CANVAS_SCALE,
          resizeDisabled: matrixSourceIds.has(sourceId) || matrixCellSourceIds.has(sourceId)
        }).map(stripHandleDisplayCursor)
      );
      continue;
    }
    const bounds = selectionBoundsBySource.get(sourceId);
    if (bounds) {
      handleDisplays.push(
        ...buildResizeHandleDisplaysForBounds({
          sourceId,
          bounds,
          canvasScale: PREVIEW_CANVAS_SCALE,
          resizeDisabled: false
        }).map(stripHandleDisplayCursor)
      );
    }
  }

  const curveControlLines = deriveCurveControlLines(elements, selectedElementIds, editHandles);
  const cropBounds = boundsForCrop(contentBounds, selectionBoxes, curveControlLines, handleDisplays, viewBox);
  const cropViewBox = expandBoundsToPreviewViewBox(cropBounds, viewBox);
  return {
    cropViewBox,
    overlaySvg: selectedElementIds.size === 0
      ? ""
      : renderOverlaySvg(viewBox, cropViewBox, selectionBoxes, curveControlLines, handleDisplays)
  };
}

function stripHandleDisplayCursor(display: AppHandleDisplay): HandleDisplay {
  const { cursor: _cursor, ...rest } = display;
  if (rest.kind === "rotate-element") {
    return {
      point: rest.point,
      kind: "move-element",
      elementId: rest.elementId
    };
  }
  return rest;
}

function resolvePreviewSelectedSourceIds(
  preview: ToolPreview,
  elements: readonly SceneElement[],
  editHandles: readonly EditHandle[]
): Set<string> {
  if (preview.mode === "magnify") {
    return new Set();
  }
  const matrixSourceIds = new Set(elements.map((element) => element.matrixCell?.matrixSourceId).filter((id): id is string => Boolean(id)));
  if (preview.mode === "addMatrix") {
    return matrixSourceIds;
  }
  const ids = new Set<string>();
  for (const element of elements) {
    const sourceId = element.sourceRef.sourceId;
    if (sourceId === "path:0" || element.matrixCell) {
      continue;
    }
    ids.add(sourceId);
  }
  for (const handle of editHandles) {
    const sourceId = handle.sourceRef.sourceId;
    if (sourceId !== "path:0" && !sourceId.includes("matrix-cell")) {
      ids.add(sourceId);
    }
  }
  return ids;
}

function renderOverlaySvg(
  viewBox: { x: number; y: number; width: number; height: number },
  displayViewBox: SvgViewBoxLike,
  selectionBoxes: readonly SelectionBoxDisplay[],
  curveControlLines: ReturnType<typeof deriveCurveControlLines>,
  handleDisplays: readonly HandleDisplay[]
): string {
  const handleHalfSize = svgUnitsForScreenPx(displayViewBox, HANDLE_SIZE_PX / 2);
  const handleStrokeWidth = svgUnitsForScreenPx(displayViewBox, HANDLE_STROKE_WIDTH_PX);
  const selectionStrokeWidth = svgUnitsForScreenPx(displayViewBox, SELECTION_STROKE_WIDTH_PX);
  const curveControlStrokeWidth = svgUnitsForScreenPx(displayViewBox, CURVE_CONTROL_STROKE_WIDTH_PX);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(displayViewBox.x)} ${fmt(displayViewBox.y)} ${fmt(displayViewBox.width)} ${fmt(displayViewBox.height)}" aria-hidden="true">`
  ];

  if (selectionBoxes.length > 0) {
    parts.push(`<g class="landingExactSelectionOverlay">`);
    for (const box of selectionBoxes) {
      const dash = box.dashed ? ` stroke-dasharray="5 3"` : ` stroke-dasharray="5 3"`;
      if (box.kind === "polygon") {
        parts.push(`<polygon fill="none" stroke="${SELECTION_STROKE}"${dash} stroke-width="${fmt(selectionStrokeWidth)}" points="${box.points.map((point) => `${fmt(point.x)},${fmt(point.y)}`).join(" ")}" />`);
      } else {
        parts.push(`<rect fill="none" stroke="${SELECTION_STROKE}"${dash} stroke-width="${fmt(selectionStrokeWidth)}" x="${fmt(box.bounds.minX)}" y="${fmt(box.bounds.minY)}" width="${fmt(Math.max(0.001, box.bounds.maxX - box.bounds.minX))}" height="${fmt(Math.max(0.001, box.bounds.maxY - box.bounds.minY))}" />`);
      }
    }
    parts.push(`</g>`);
  }

  if (curveControlLines.length > 0) {
    parts.push(`<g class="landingExactCurveControlOverlay">`);
    for (const line of curveControlLines) {
      const from = worldToSvgPoint(line.from, viewBox);
      const to = worldToSvgPoint(line.to, viewBox);
      parts.push(`<line x1="${fmt(from.x)}" y1="${fmt(from.y)}" x2="${fmt(to.x)}" y2="${fmt(to.y)}" stroke="${CURVE_CONTROL_STROKE}" stroke-width="${fmt(curveControlStrokeWidth)}" />`);
    }
    parts.push(`</g>`);
  }

  if (handleDisplays.length > 0) {
    parts.push(`<g class="landingExactHandleOverlay">`);
    for (const display of handleDisplays) {
      if (display.kind === "move-handle" && (display.handle.kind === "path-control" || display.handle.kind === "path-bend")) {
        parts.push(`<circle cx="${fmt(display.point.x)}" cy="${fmt(display.point.y)}" r="${fmt(handleHalfSize)}" fill="${HANDLE_FILL}" stroke="${HANDLE_STROKE}" stroke-width="${fmt(handleStrokeWidth)}" />`);
      } else {
        const transform = display.kind === "resize-element" && Math.abs(display.rotationDeg) > 1e-6
          ? ` transform="rotate(${fmt(display.rotationDeg)} ${fmt(display.point.x)} ${fmt(display.point.y)})"`
          : "";
        parts.push(`<rect x="${fmt(display.point.x - handleHalfSize)}" y="${fmt(display.point.y - handleHalfSize)}" width="${fmt(handleHalfSize * 2)}" height="${fmt(handleHalfSize * 2)}" fill="${HANDLE_FILL}" stroke="${HANDLE_STROKE}" stroke-width="${fmt(handleStrokeWidth)}"${transform} />`);
      }
    }
    parts.push(`</g>`);
  }

  parts.push(`</svg>`);
  return parts.join("");
}

type SvgViewBoxLike = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function boundsForPreviewContent(sourceBoundsSvg: Map<string, SvgBounds>): SvgBounds | null {
  let bounds: SvgBounds | null = null;
  for (const [sourceId, sourceBounds] of sourceBoundsSvg) {
    if (sourceId === "path:0") {
      continue;
    }
    bounds = includeBounds(bounds, sourceBounds);
  }
  return bounds;
}

function boundsForCrop(
  contentBounds: SvgBounds | null,
  selectionBoxes: readonly SelectionBoxDisplay[],
  curveControlLines: ReturnType<typeof deriveCurveControlLines>,
  handleDisplays: readonly HandleDisplay[],
  viewBox: SvgViewBoxLike
): SvgBounds {
  let bounds = contentBounds;
  for (const box of selectionBoxes) {
    if (box.kind === "axis-aligned") {
      bounds = includeBounds(bounds, box.bounds);
    } else {
      for (const point of box.points) {
        bounds = includePoint(bounds, point);
      }
    }
  }
  for (const display of handleDisplays) {
    bounds = includePoint(bounds, display.point);
  }
  for (const line of curveControlLines) {
    bounds = includePoint(bounds, worldToSvgPoint(line.from, viewBox));
    bounds = includePoint(bounds, worldToSvgPoint(line.to, viewBox));
  }
  return bounds ?? {
    minX: viewBox.x,
    minY: viewBox.y,
    maxX: viewBox.x + viewBox.width,
    maxY: viewBox.y + viewBox.height
  };
}

function expandBoundsToPreviewViewBox(bounds: SvgBounds, originalViewBox: SvgViewBoxLike): SvgViewBoxLike {
  const baseScale = REFERENCE_PREVIEW_WIDTH_PX / originalViewBox.width;
  const padding = CROP_PADDING_PX / Math.max(baseScale, 1e-6);
  const minHeight = MIN_CROP_HEIGHT_PX / Math.max(baseScale, 1e-6);
  let minX = bounds.minX - padding;
  let minY = bounds.minY - padding;
  let maxX = bounds.maxX + padding;
  let maxY = bounds.maxY + padding;

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  let width = Math.max(0.001, maxX - minX);
  let height = Math.max(minHeight, maxY - minY);
  if (width / height > PREVIEW_ASPECT_RATIO) {
    height = width / PREVIEW_ASPECT_RATIO;
  } else {
    width = height * PREVIEW_ASPECT_RATIO;
  }

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height
  };
}

function includeBounds(current: SvgBounds | null, next: SvgBounds): SvgBounds {
  if (!current) {
    return { ...next };
  }
  return {
    minX: Math.min(current.minX, next.minX),
    minY: Math.min(current.minY, next.minY),
    maxX: Math.max(current.maxX, next.maxX),
    maxY: Math.max(current.maxY, next.maxY)
  };
}

function includePoint(current: SvgBounds | null, point: SvgPoint): SvgBounds {
  const pointBounds = {
    minX: point.x,
    minY: point.y,
    maxX: point.x,
    maxY: point.y
  };
  return includeBounds(current, pointBounds);
}

function svgUnitsForScreenPx(viewBox: SvgViewBoxLike, px: number): number {
  const referencePreviewHeightPx = REFERENCE_PREVIEW_WIDTH_PX / PREVIEW_ASPECT_RATIO;
  const scale = Math.min(
    REFERENCE_PREVIEW_WIDTH_PX / Math.max(viewBox.width, 1e-6),
    referencePreviewHeightPx / Math.max(viewBox.height, 1e-6)
  );
  return px / Math.max(scale, 1e-6);
}

function fmt(value: number): string {
  if (Math.abs(value) < 1e-9) {
    return "0";
  }
  return Number(value.toFixed(4)).toString();
}
