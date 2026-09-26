import type {
  EditHandle,
  EvaluateOptions
} from "../semantic/types.js";
import type { WorldPoint, WorldBounds } from "../coords/points.js";
import type { CoordinateItem, NodeItem, PathItem, PathKeywordItem, PathStatement, Statement, Span } from "../ast/types.js";
import type { SourcePatch } from "./types.js";
import { applyEditIntent } from "./apply.js";
import { replaceSpan } from "./patch.js";
import { PT_PER_CM, formatNumber, type DragFormatPrecision } from "./format.js";
import { formatCoordinate } from "./style.js";
import { ptToCm } from "../coords/source.js";
import { worldPoint } from "../coords/points.js";
import {
  generateElementSource,
  insertElementIntoSource,
  type AnchorReference,
  type ElementTemplate
} from "./element-templates.js";
import { resolvePropertyTarget } from "./property-target.js";
import type { AlignMode, DistributeAxis } from "./arrange.js";
import {
  applyTextReplacements,
  parseStatementSnapshot,
  type StatementRef
} from "./statement-ops.js";
import type { PathPointKind } from "./path-editing.js";
import {
  applyMovePathAttachedNodeAction,
  type MovePathAttachedNodeAction
} from "./actions/path-attached-node-actions.js";
import {
  applyAddNodeAdornmentAction,
  applyDuplicateAdornmentAction,
  applyMoveAdornmentAction
} from "./actions/adornment-actions.js";
import { applyDeleteAdornmentAction, applyDeleteElementsAction } from "./actions/delete-elements.js";
import {
  applyDuplicateElementsAction,
  applyPasteStatementsAction
} from "./actions/paste-duplicate.js";
import {
  applyAppendToPathAction,
  applyDeletePathPointAction,
  applyInsertPathPointAction,
  applyJoinPathsAction,
  applyReversePathAction,
  applySetPathPointKindAction,
  applySplitPathAction,
  applyToggleClosedPathAction
} from "./actions/path-editing-actions.js";
import {
  applyAlignElementsAction,
  applyDistributeElementsAction,
  applyMoveElementsAction
} from "./actions/move-arrange-actions.js";
import { applyReorderElementsAction, buildParentReorderReplacement } from "./actions/reorder-elements.js";
import { applyResizeElementAction } from "./actions/resize-element.js";
import {
  applyRotateElementAction,
  type RotateElementAction
} from "./actions/rotate-element.js";
import {
  applyPlannedSetPropertyAction,
  cleanupIdiomaticPropertyWrites,
  PROPERTY_WRITE_CLEANUP_NOOP_REASON
} from "./property-write-planner.js";
import { applyGroupElementsAction, applyUngroupElementsAction } from "./actions/group-ungroup-actions.js";
import { applyRepeatElementsAction } from "./actions/repeat.js";
import {
  applyAddTreeChildAction,
  applyAddTreeSiblingAction,
  applyRemoveTreeChildAction
} from "./actions/tree-child-actions.js";
import {
  applyAddMatrixColumnAction,
  applyAddMatrixRowAction,
  applyRemoveMatrixColumnAction,
  applyRemoveMatrixRowAction,
  applyTransposeMatrixAction
} from "./actions/matrix-structure-actions.js";
import {
  applyConvertNodePositionToAbsoluteAction,
  applyPositionNodeRelativeToAction,
  preflightPositionNodeRelativeToAction as preflightPositionNodeRelativeToActionRaw,
  type ConvertNodePositionToAbsoluteAction,
  type PositionNodeRelativeToPreflight,
  type PositionNodeRelativeToAction
} from "./actions/node-positioning-actions.js";
import { parseTikzForEdit, sourceFingerprintForEdit, type EditParseOptions } from "./parse-options.js";
import { patchesMatchSourceTransition } from "./source-patches.js";
import type { SemanticPropertyId } from "./property-registry.js";
import { flattenForeachInSource, type FlattenForeachTarget } from "../foreach/flatten.js";
import { applySetFigureBoundsAction, type SetFigureBoundsAction } from "./figure-bounds.js";

export type ResizeRole =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top"
  | "bottom"
  | "left"
  | "right";

export type StyleLevel = "command" | "scope" | "named-style" | "preamble";
export type { ElementTemplate } from "./element-templates.js";
export type ReorderDirection = "sendToBack" | "sendBackward" | "bringForward" | "bringToFront";
export { ADORNMENT_EDIT_NOOP_REASON } from "./actions/adornment-set-property.js";
export { PATH_ATTACHED_NODE_EDIT_NOOP_REASON } from "./actions/path-attached-node-actions.js";
export { PROPERTY_WRITE_CLEANUP_NOOP_REASON };

export type EditAction =
  | { kind: "moveElement"; elementId: string; delta: WorldPoint; formatPrecision?: DragFormatPrecision }
  | { kind: "moveElements"; elementIds: string[]; delta: WorldPoint; formatPrecision?: DragFormatPrecision }
  | { kind: "alignElements"; elementIds: string[]; mode: AlignMode }
  | { kind: "distributeElements"; elementIds: string[]; axis: DistributeAxis }
  | { kind: "moveHandle"; handleId: string; newWorld: WorldPoint; baselineSource?: string; formatPrecision?: DragFormatPrecision }
  | { kind: "rewriteImplicitOrthoCorner"; elementId: string; corner: WorldPoint; baselineSource?: string }
  | { kind: "moveOrthoSegment"; elementId: string; segmentIndex: number; axis: "h" | "v"; newWorld: WorldPoint; baselineSource?: string }
  | { kind: "connectHandle"; handleId: string; nodeName: string; nodeSourceId?: string; anchor: string; baselineSource?: string }
  | { kind: "splitPath"; elementId: string; handleId: string }
  | { kind: "joinPaths"; elementIds: [string, string] }
  | { kind: "reversePath"; elementId: string }
  | { kind: "toggleClosedPath"; elementId: string; closed: boolean }
  | { kind: "deletePathPoint"; elementId: string; handleId: string }
  | { kind: "setPathPointKind"; elementId: string; handleId: string; pointKind: PathPointKind }
  | { kind: "appendToPath"; elementId: string; end: "start" | "end"; segmentSource: string }
  | { kind: "insertPathPoint"; elementId: string; segmentIndex: number; point: WorldPoint }
  | {
      kind: "setProperty";
      elementId: string;
      level: StyleLevel;
      key: string;
      value: string;
      propertyId?: SemanticPropertyId;
      clearKeys?: string[];
      commentMode?: "disable" | "enable";
      commentSourceText?: string;
    }
  | RotateElementAction
  | { kind: "updateNodeText"; elementId: string; text: string }
  | SetFigureBoundsAction
  | { kind: "cleanupPropertyWrites"; elementIds?: string[] }
  | { kind: "addElement"; template: ElementTemplate; at: WorldPoint }
  | { kind: "deleteElement"; elementId: string }
  | { kind: "deleteElements"; elementIds: string[] }
  | { kind: "deleteAdornment"; targetId: string }
  | { kind: "pasteStatements"; snippets: string[]; anchorElementId?: string; delta?: WorldPoint }
  | { kind: "duplicateElements"; elementIds: string[]; delta?: WorldPoint }
  | { kind: "duplicateAdornment"; targetId: string }
  | {
      kind: "moveAdornment";
      targetId: string;
      ownerPoint: WorldPoint;
      newWorld: WorldPoint;
      angleRaw?: string;
      distancePt?: number;
      formatPrecision?: DragFormatPrecision;
    }
  | MovePathAttachedNodeAction
  | { kind: "addNodeAdornment"; nodeId: string; adornmentKind: "label" | "pin"; angle: string; text: string }
  | PositionNodeRelativeToAction
  | ConvertNodePositionToAbsoluteAction
  | { kind: "reorderElements"; elementIds: string[]; direction: ReorderDirection }
  | { kind: "groupElements"; elementIds: string[] }
  | { kind: "ungroupElements"; elementIds: string[] }
  | {
      kind: "repeatElements";
      elementIds: string[];
      columns: number;
      rows: number;
      horizontalStep: number;
      verticalStep: number;
    }
  | { kind: "flattenForeach"; target: FlattenForeachTarget; recursive?: boolean; maxExpansions?: number }
  | { kind: "addTreeChild"; parentSourceId: string; afterChildIndex?: number }
  | { kind: "removeTreeChild"; childSourceId: string }
  | { kind: "addTreeSibling"; siblingSourceId: string; position: "before" | "after" }
  | { kind: "addMatrixRow"; matrixSourceId: string; rowIndex: number }
  | { kind: "removeMatrixRow"; matrixSourceId: string; rowIndex: number }
  | { kind: "addMatrixColumn"; matrixSourceId: string; columnIndex: number }
  | { kind: "removeMatrixColumn"; matrixSourceId: string; columnIndex: number }
  | { kind: "transposeMatrix"; matrixSourceId: string }
  | {
      kind: "resizeElement";
      elementId: string;
      role: ResizeRole;
      newWorld: WorldPoint;
      preserveAspect?: boolean;
      preserveAspectRatio?: number;
      formatPrecision?: DragFormatPrecision;
      referenceBounds?: WorldBounds;
      referenceScopeTransform?: {
        xscale: number;
        yscale: number;
        xshift: number;
        yshift: number;
      };
    };

export type EditActionResult =
  | { kind: "success"; newSource: string; patches: SourcePatch[]; selectedSourceIds?: string[]; changedSourceIds?: string[] }
  | {
      kind: "partial";
      newSource: string;
      patches: SourcePatch[];
      skippedHandles: string[];
      reason: string;
      selectedSourceIds?: string[];
      changedSourceIds?: string[];
    }
  | { kind: "unsupported"; reason: string }
  | { kind: "error"; message: string };

const DEFAULT_DUPLICATE_OFFSET_PT = 0.25 * PT_PER_CM;
const GENERATED_NODE_NAME_RE = /(?:^|[^A-Za-z0-9_-])(node\d+)(?![A-Za-z0-9_-])/g;

export type EditActionApplyOptions = {
  evaluateOptions?: EvaluateOptions;
  parseOptions?: EditParseOptions;
};

export function preflightPositionNodeRelativeToAction(
  source: string,
  action: PositionNodeRelativeToAction,
  options: EditActionApplyOptions = {}
): PositionNodeRelativeToPreflight {
  const preflight = preflightPositionNodeRelativeToActionRaw(
    source,
    action,
    options.evaluateOptions,
    options.parseOptions ?? {}
  );
  return {
    ...preflight,
    result: normalizeResultPatches(source, preflight.result)
  };
}

type AnchorNameResolution = {
  source: string;
  anchor: AnchorReference;
  insertedSpan?: Span;
  insertedLength: number;
};

export function applyEditAction(
  source: string,
  editHandles: EditHandle[],
  action: EditAction,
  options: EditActionApplyOptions = {}
): EditActionResult {
  const evaluateOptions = options.evaluateOptions;
  const parseOptions = options.parseOptions ?? {};
  const rawResult = (() : EditActionResult => {
    switch (action.kind) {
      case "moveHandle":
        return applyMoveHandle(source, editHandles, action.handleId, action.newWorld, parseOptions, action.baselineSource, action.formatPrecision);
      case "rewriteImplicitOrthoCorner":
        return applyRewriteImplicitOrthoCornerAction(source, action, parseOptions);
      case "moveOrthoSegment":
        return applyMoveOrthoSegmentAction(source, editHandles, action, parseOptions);
      case "connectHandle":
        return applyConnectHandle(source, editHandles, action.handleId, action.nodeName, action.nodeSourceId, action.anchor, parseOptions, action.baselineSource);
      case "splitPath":
        return applySplitPath(source, editHandles, action, parseOptions);
      case "joinPaths":
        return applyJoinPaths(source, action, parseOptions);
      case "reversePath":
        return applyReversePath(source, action, parseOptions);
      case "toggleClosedPath":
        return applyToggleClosedPath(source, action, parseOptions);
      case "deletePathPoint":
        return applyDeletePathPoint(source, editHandles, action, parseOptions);
      case "setPathPointKind":
        return applySetPathPointKind(source, editHandles, action, parseOptions);
      case "appendToPath":
        return applyAppendToPathAction(source, action, parseOptions);
      case "insertPathPoint":
        return applyInsertPathPointAction(source, editHandles, action, parseOptions);
      case "moveElement":
        return applyMoveElements(source, editHandles, [action.elementId], action.delta, parseOptions, action.formatPrecision);
      case "moveElements":
        return applyMoveElements(source, editHandles, action.elementIds, action.delta, parseOptions, action.formatPrecision);
      case "alignElements":
        return applyAlignElements(source, action, parseOptions);
      case "distributeElements":
        return applyDistributeElements(source, action, parseOptions);
      case "setProperty":
        return applySetProperty(source, action, parseOptions);
      case "rotateElement":
        return applyRotateElementAction(source, action, evaluateOptions, parseOptions);
      case "updateNodeText":
        return applyUpdateNodeText(source, action, parseOptions);
      case "setFigureBounds":
        return applySetFigureBoundsAction(source, action, parseOptions);
      case "cleanupPropertyWrites":
        return cleanupIdiomaticPropertyWrites(source, { ...parseOptions, propertyWriteMode: "drag-end" }, action.elementIds);
      case "addElement":
        return applyAddElement(source, action.template, action.at, parseOptions);
      case "deleteElement":
        return applyDeleteElementsAction(source, [action.elementId], parseOptions);
      case "deleteElements":
        return applyDeleteElementsAction(source, action.elementIds, parseOptions);
      case "deleteAdornment":
        return applyDeleteAdornmentAction(source, action.targetId, parseOptions);
      case "pasteStatements":
        return applyPasteStatements(source, action, parseOptions);
      case "duplicateElements":
        return applyDuplicateElements(source, action, parseOptions);
      case "duplicateAdornment":
        return applyDuplicateAdornment(source, action.targetId, parseOptions);
      case "moveAdornment":
        return applyMoveAdornmentAction(source, action, parseOptions);
      case "movePathAttachedNode":
        return applyMovePathAttachedNodeAction(source, action, parseOptions);
      case "addNodeAdornment":
        return applyAddNodeAdornmentAction(source, action, parseOptions);
      case "positionNodeRelativeTo":
        return applyPositionNodeRelativeToAction(source, action, evaluateOptions, parseOptions);
      case "convertNodePositionToAbsolute":
        return applyConvertNodePositionToAbsoluteAction(source, action, evaluateOptions, parseOptions);
      case "reorderElements":
        return applyReorderElementsAction(source, action.elementIds, action.direction, parseOptions);
      case "groupElements":
        return applyGroupElements(source, action, parseOptions);
      case "ungroupElements":
        return applyUngroupElements(source, action, parseOptions);
      case "repeatElements":
        return applyRepeatElementsAction(source, action, parseOptions);
      case "flattenForeach":
        return applyFlattenForeachAction(source, action, parseOptions);
      case "addTreeChild":
        return applyAddTreeChildAction(source, action, parseOptions);
      case "removeTreeChild":
        return applyRemoveTreeChildAction(source, action, parseOptions);
      case "addTreeSibling":
        return applyAddTreeSiblingAction(source, action, parseOptions);
      case "addMatrixRow":
        return applyAddMatrixRowAction(source, action, parseOptions);
      case "removeMatrixRow":
        return applyRemoveMatrixRowAction(source, action, parseOptions);
      case "addMatrixColumn":
        return applyAddMatrixColumnAction(source, action, parseOptions);
      case "removeMatrixColumn":
        return applyRemoveMatrixColumnAction(source, action, parseOptions);
      case "transposeMatrix":
        return applyTransposeMatrixAction(source, action, parseOptions);
      case "resizeElement":
        return applyResizeElement(source, action, evaluateOptions, parseOptions);
    }
  })();
  return normalizeResultPatches(source, rawResult);
}

function normalizeResultPatches(source: string, result: EditActionResult): EditActionResult {
  if (result.kind !== "success" && result.kind !== "partial") {
    return result;
  }

  if (patchesMatchSourceTransition(source, result.newSource, result.patches)) {
    return result;
  }

  return {
    ...result,
    patches: [computeReplacementPatch(source, result.newSource)]
  };
}

function applyFlattenForeachAction(
  source: string,
  action: Extract<EditAction, { kind: "flattenForeach" }>,
  parseOptions: EditParseOptions
): EditActionResult {
  const flattened = flattenForeachInSource(source, action.target, {
    recursive: action.recursive,
    maxExpansions: action.maxExpansions
  });

  if (flattened.kind === "unsupported") {
    return { kind: "unsupported", reason: flattened.reason };
  }
  if (flattened.kind === "error") {
    return { kind: "error", message: flattened.message };
  }

  const selectedSourceIds = collectSourceIdsInSpan(flattened.newSource, flattened.flattenedSpan, parseOptions);
  return {
    kind: "success",
    newSource: flattened.newSource,
    patches: flattened.patches,
    selectedSourceIds,
    changedSourceIds: selectedSourceIds
  };
}

function collectSourceIdsInSpan(
  source: string,
  span: Span,
  parseOptions: EditParseOptions
): string[] {
  const parsed = parseTikzForEdit(source, parseOptions);
  const ids: string[] = [];
  const seen = new Set<string>();

  const add = (id: string): void => {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  };

  const visitStatements = (statements: readonly Statement[]): void => {
    for (const statement of statements) {
      if (spanContains(span, statement.span)) {
        add(statement.id);
      }

      if (statement.kind === "Path") {
        if (!spanContains(span, statement.span) && spansOverlap(span, statement.span)) {
          visitPathItems(statement.items);
        }
        continue;
      }

      if (statement.kind === "Scope") {
        visitStatements(statement.body);
      }
    }
  };

  const visitPathItems = (items: readonly PathItem[]): void => {
    for (const item of items) {
      if (spanContains(span, item.span)) {
        add(item.id);
      }
      if (item.kind === "Node") {
        continue;
      }
      if (item.kind === "ChildOperation") {
        visitPathItems(item.body);
      }
    }
  };

  visitStatements(parsed.figure.body);
  return ids;
}

function spanContains(outer: Span, inner: Span): boolean {
  return inner.from >= outer.from && inner.to <= outer.to;
}

function spansOverlap(left: Span, right: Span): boolean {
  return left.from < right.to && right.from < left.to;
}

function applyMoveHandle(
  source: string,
  editHandles: EditHandle[],
  handleId: string,
  newWorld: WorldPoint,
  parseOptions: EditParseOptions,
  baselineSource?: string,
  formatPrecision?: DragFormatPrecision
): EditActionResult {
  const baseSource = baselineSource ?? source;
  const baseFingerprint =
    baselineSource != null
      ? (editHandles.find((h) => h.sourceRef.sourceFingerprint)?.sourceRef.sourceFingerprint ?? sourceFingerprintForEdit(baseSource, parseOptions))
      : sourceFingerprintForEdit(source, parseOptions);

  const handle = editHandles.find((h) => h.id === handleId);
  let effectiveWorld = newWorld;
  let effectivePrecision = formatPrecision;

  if (handle && handle.kind === "path-point") {
    const sibling = editHandles.find(
      (h) => h.id !== handleId && h.sourceRef.sourceId === handle.sourceRef.sourceId && h.kind === "path-point"
    );
    if (sibling) {
      const wasHorizontal = Math.abs(handle.world.y - sibling.world.y) <= 1.0;
      const isNearHorizontal = Math.abs(newWorld.y - sibling.world.y) <= 1.5;
      if (wasHorizontal && isNearHorizontal) {
        effectiveWorld = { ...effectiveWorld, y: sibling.world.y };
        if (effectivePrecision === undefined && /\.\d{3,}/.test(sibling.sourceText)) {
          effectivePrecision = "fine";
        }
      }

      const wasVertical = Math.abs(handle.world.x - sibling.world.x) <= 1.0;
      const isNearVertical = Math.abs(newWorld.x - sibling.world.x) <= 1.5;
      if (wasVertical && isNearVertical) {
        effectiveWorld = { ...effectiveWorld, x: sibling.world.x };
        if (effectivePrecision === undefined && /\.\d{3,}/.test(sibling.sourceText)) {
          effectivePrecision = "fine";
        }
      }
    }
  }

  const result = applyEditIntent(
    baseSource,
    editHandles,
    { kind: "move", handleId, newWorld: effectiveWorld, formatPrecision: effectivePrecision },
    { ...parseOptions, sourceFingerprint: baseFingerprint }
  );
  if (result.kind === "success") {
    const patches =
      baseSource !== source
        ? [computeReplacementPatch(source, result.newSource)]
        : result.patches;
    return {
      kind: "success",
      newSource: result.newSource,
      patches,
      changedSourceIds: result.changedSourceIds
    };
  }
  if (result.kind === "unsupported") {
    return { kind: "unsupported", reason: result.reason };
  }
  return { kind: "error", message: result.message };
}

/**
 * Grabbing the IMPLICIT corner of an `|-` / `-|` operator wire and dragging it.
 *
 * The operator's corner is derived by TikZ from the two endpoints and has no source text, so it has
 * no edit handle and cannot be moved like a normal path point -- a pointer-down there fell through
 * to the element drag and translated the WHOLE wire ("整条线飞起来"). This action materialises the
 * route as an explicit `A -- (corner) -- B` polyline, keeping both endpoints (anchors included)
 * byte-for-byte and only inserting the corner coordinate where the operator used to be. After the
 * first move the corner is a real path point, so the ordinary path-point pipeline takes over.
 */
function applyRewriteImplicitOrthoCornerAction(
  source: string,
  action: Extract<EditAction, { kind: "rewriteImplicitOrthoCorner" }>,
  parseOptions: EditParseOptions
): EditActionResult {
  const baseSource = action.baselineSource ?? source;
  const parsed = parseTikzForEdit(baseSource, parseOptions);
  const statement = findPathStatementBySourceId(parsed.figure.body, action.elementId);
  if (!statement || statement.command !== "draw") {
    return { kind: "unsupported", reason: "Ortho corner rewrite requires a draw statement." };
  }
  const operator = statement.items.find(
    (item) => item.kind === "PathKeyword" && (item.keyword === "|-" || item.keyword === "-|")
  );
  const coordinateCount = statement.items.filter((item) => item.kind === "Coordinate").length;
  if (!operator || coordinateCount !== 2) {
    return { kind: "unsupported", reason: "Not an implicit orthogonal operator wire (|- / -|)." };
  }
  const cmX = formatNumber(ptToCm(action.corner.x));
  const cmY = formatNumber(ptToCm(action.corner.y));
  const replacement = `-- (${cmX},${cmY}) --`;
  const updated = replaceSpan(baseSource, operator.span, replacement);
  if (updated.source === source) {
    return { kind: "success", newSource: source, patches: [], changedSourceIds: [action.elementId] };
  }
  const patches =
    baseSource !== source
      ? [computeReplacementPatch(source, updated.source)]
      : [{ oldSpan: operator.span, newSpan: updated.changedSpan, replacement }];
  return { kind: "success", newSource: updated.source, patches, changedSourceIds: [action.elementId] };
}

function getCoordinateWorldForAction(
  coord: CoordinateItem,
  statementId: string,
  editHandles: readonly EditHandle[]
): { x: string; y: string } {
  const matchingHandle = editHandles.find(
    (h) =>
      h.kind === "path-point" &&
      h.sourceRef.sourceId === statementId &&
      h.sourceRef.sourceSpan.from === coord.span.from
  );
  if (matchingHandle) {
    return {
      x: formatNumber(ptToCm(matchingHandle.world.x)),
      y: formatNumber(ptToCm(matchingHandle.world.y))
    };
  }
  if (coord.form === "cartesian") {
    return {
      x: coord.x,
      y: coord.y
    };
  }
  return { x: "0", y: "0" };
}

/**
 * Move an orthogonal segment of a wire / polyline while keeping endpoints fixed.
 * Cadence Virtuoso style orthogonal wire stretching.
 */
function applyMoveOrthoSegmentAction(
  source: string,
  editHandles: readonly EditHandle[],
  action: Extract<EditAction, { kind: "moveOrthoSegment" }>,
  parseOptions: EditParseOptions
): EditActionResult {
  const baseSource = action.baselineSource ?? source;
  const parsed = parseTikzForEdit(baseSource, parseOptions);
  const statement = findPathStatementBySourceId(parsed.figure.body, action.elementId);
  if (!statement || statement.command !== "draw") {
    return { kind: "unsupported", reason: "Ortho segment move requires a draw statement." };
  }

  const coordinates = statement.items.filter((item): item is CoordinateItem => item.kind === "Coordinate");
  const operator = statement.items.find(
    (item): item is PathKeywordItem =>
      item.kind === "PathKeyword" && (item.keyword === "|-" || item.keyword === "-|" || item.keyword === "--")
  );

  const newCmX = formatNumber(ptToCm(action.newWorld.x));
  const newCmY = formatNumber(ptToCm(action.newWorld.y));

  // Case 1: 2-point wire (implicit |- / -|)
  if (coordinates.length === 2 && operator) {
    if (operator.keyword === "--") {
      return { kind: "unsupported", reason: "两点单段直连导线不可推拉折弯，仅跟随两端元件移动伸缩。" };
    }
    const c0 = coordinates[0];
    const c1 = coordinates[1];
    const p0 = getCoordinateWorldForAction(c0, action.elementId, editHandles);
    const p1 = getCoordinateWorldForAction(c1, action.elementId, editHandles);

    let replacement = "";
    if (action.axis === "v") {
      replacement = `-- (${newCmX},${p0.y}) -- (${newCmX},${p1.y}) --`;
    } else {
      replacement = `-- (${p0.x},${newCmY}) -- (${p1.x},${newCmY}) --`;
    }
    const updated = replaceSpan(baseSource, operator.span, replacement);
    const patches = [computeReplacementPatch(source, updated.source)];
    return { kind: "success", newSource: updated.source, patches, changedSourceIds: [action.elementId] };
  }

  const m = coordinates.length;
  if (m < 2 || action.segmentIndex < 0 || action.segmentIndex >= m - 1) {
    return { kind: "unsupported", reason: `Invalid segmentIndex ${action.segmentIndex} for polyline with ${m} coordinates` };
  }

  const k = action.segmentIndex;
  const ck = coordinates[k];
  const ck1 = coordinates[k + 1];

  let updatedSource = baseSource;

  // Case 2: Internal segment (1 <= k <= m - 3)
  if (k >= 1 && k <= m - 3) {
    const rawK = baseSource.slice(ck.span.from, ck.span.to);
    const rawK1 = baseSource.slice(ck1.span.from, ck1.span.to);

    const newKText = action.axis === "v" ? formatCoordinate(rawK, newCmX, ck.y) : formatCoordinate(rawK, ck.x, newCmY);
    const newK1Text = action.axis === "v" ? formatCoordinate(rawK1, newCmX, ck1.y) : formatCoordinate(rawK1, ck1.x, newCmY);

    const r2 = replaceSpan(baseSource, ck1.span, newK1Text);
    const r1 = replaceSpan(r2.source, ck.span, newKText);
    updatedSource = r1.source;
  } else if (k === 0) {
    // Case 3: Boundary segment k === 0 (start endpoint ck to intermediate corner ck1)
    const pk = getCoordinateWorldForAction(ck, action.elementId, editHandles);
    const rawK1 = baseSource.slice(ck1.span.from, ck1.span.to);
    if (action.axis === "v") {
      const newK1Text = formatCoordinate(rawK1, newCmX, ck1.y);
      const newCorner = ` -- (${newCmX},${pk.y})`;
      const r2 = replaceSpan(baseSource, ck1.span, newK1Text);
      const r1 = replaceSpan(r2.source, { from: ck.span.to, to: ck.span.to }, newCorner);
      updatedSource = r1.source;
    } else {
      const newK1Text = formatCoordinate(rawK1, ck1.x, newCmY);
      const newCorner = ` -- (${pk.x},${newCmY})`;
      const r2 = replaceSpan(baseSource, ck1.span, newK1Text);
      const r1 = replaceSpan(r2.source, { from: ck.span.to, to: ck.span.to }, newCorner);
      updatedSource = r1.source;
    }
  } else if (k === m - 2) {
    // Case 4: Boundary segment k === m - 2 (intermediate corner ck to end endpoint ck1)
    const pk1 = getCoordinateWorldForAction(ck1, action.elementId, editHandles);
    const rawK = baseSource.slice(ck.span.from, ck.span.to);
    if (action.axis === "v") {
      const newKText = formatCoordinate(rawK, newCmX, ck.y);
      const newCorner = `(${newCmX},${pk1.y}) -- `;
      const r2 = replaceSpan(baseSource, { from: ck1.span.from, to: ck1.span.from }, newCorner);
      const r1 = replaceSpan(r2.source, ck.span, newKText);
      updatedSource = r1.source;
    } else {
      const newKText = formatCoordinate(rawK, ck.x, newCmY);
      const newCorner = `(${pk1.x},${newCmY}) -- `;
      const r2 = replaceSpan(baseSource, { from: ck1.span.from, to: ck1.span.from }, newCorner);
      const r1 = replaceSpan(r2.source, ck.span, newKText);
      updatedSource = r1.source;
    }
  } else {
    // Fallback
    const rawK = baseSource.slice(ck.span.from, ck.span.to);
    const rawK1 = baseSource.slice(ck1.span.from, ck1.span.to);
    const newKText = action.axis === "v" ? formatCoordinate(rawK, newCmX, ck.y) : formatCoordinate(rawK, ck.x, newCmY);
    const newK1Text = action.axis === "v" ? formatCoordinate(rawK1, newCmX, ck1.y) : formatCoordinate(rawK1, ck1.x, newCmY);
    const r2 = replaceSpan(baseSource, ck1.span, newK1Text);
    const r1 = replaceSpan(r2.source, ck.span, newKText);
    updatedSource = r1.source;
  }

  if (updatedSource === source) {
    return { kind: "success", newSource: source, patches: [], changedSourceIds: [action.elementId] };
  }
  const patches = [computeReplacementPatch(source, updatedSource)];
  return { kind: "success", newSource: updatedSource, patches, changedSourceIds: [action.elementId] };
}

function findPathStatementBySourceId(
  statements: readonly Statement[],
  sourceId: string
): PathStatement | null {
  for (const statement of statements) {
    if (statement.kind === "Path" && statement.id === sourceId) {
      return statement;
    }
    if (statement.kind === "Scope") {
      const nested = findPathStatementBySourceId(statement.body, sourceId);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

function applyConnectHandle(
  source: string,
  editHandles: EditHandle[],
  handleId: string,
  nodeName: string,
  nodeSourceId: string | undefined,
  anchor: string,
  parseOptions: EditParseOptions,
  baselineSource?: string
): EditActionResult {
  const baseSource = baselineSource ?? source;
  const baseFingerprint =
    baselineSource != null
      ? (editHandles.find((h) => h.sourceRef.sourceFingerprint)?.sourceRef.sourceFingerprint ?? sourceFingerprintForEdit(baseSource, parseOptions))
      : sourceFingerprintForEdit(source, parseOptions);

  const handle = editHandles.find((candidate) => candidate.id === handleId);
  if (!handle) {
    return { kind: "error", message: `Handle not found: ${handleId}` };
  }

  if (handle.sourceRef.sourceFingerprint !== baseFingerprint) {
    return { kind: "error", message: "Handle does not match current source (stale handle)." };
  }

  if (handle.curveEdit) {
    return {
      kind: "unsupported",
      reason: "Only concrete path endpoint coordinates can be connected to node anchors."
    };
  }
  if (handle.kind !== "path-point") {
    return {
      kind: "unsupported",
      reason: "Only path endpoint handles can be connected to node anchors."
    };
  }

  if (
    handle.sourceRef.sourceSpan.from < 0 ||
    handle.sourceRef.sourceSpan.to > baseSource.length ||
    handle.sourceRef.sourceSpan.from >= handle.sourceRef.sourceSpan.to
  ) {
    return {
      kind: "unsupported",
      reason: "Handle does not point to a concrete coordinate span in source."
    };
  }

  if (isSharedExpandedHandleSpan(handle, editHandles)) {
    return {
      kind: "unsupported",
      reason: "Handle span is shared by expanded statements (foreach/macro), cannot connect safely."
    };
  }

  const currentSourceText = baseSource.slice(handle.sourceRef.sourceSpan.from, handle.sourceRef.sourceSpan.to);
  if (currentSourceText !== handle.sourceText) {
    return { kind: "error", message: "Handle span content mismatch (stale handle)." };
  }

  const nameResolution = resolveAnchorNodeName(baseSource, { nodeName, nodeSourceId, anchor }, parseOptions);
  if (!nameResolution) {
    return { kind: "error", message: "Node name is required for endpoint connection." };
  }
  const trimmedNodeName = nameResolution.anchor.nodeName.trim();

  const trimmedAnchor = anchor.trim().toLowerCase();
  if (trimmedAnchor.length === 0) {
    return { kind: "error", message: "Anchor is required for endpoint connection." };
  }

  const replacement =
    trimmedAnchor === "center"
      ? `(${trimmedNodeName})`
      : `(${trimmedNodeName}.${trimmedAnchor})`;
  const adjustedHandleSpan = shiftSpan(handle.sourceRef.sourceSpan, nameResolution.insertedSpan, nameResolution.insertedLength);
  const updated = replaceSpan(nameResolution.source, adjustedHandleSpan, replacement);
  const reordered = moveStatementAfterNamedDefinition(
    updated.source,
    handle.sourceRef.sourceId,
    trimmedNodeName,
    parseOptions
  );
  const reorderedPatches = reordered ? reordered.patches : [];
  const newSource = reordered?.source ?? updated.source;
  const patches =
    baseSource !== source
      ? [computeReplacementPatch(source, newSource)]
      : nameResolution.insertedSpan
        ? [computeReplacementPatch(baseSource, newSource)]
        : [
            {
              oldSpan: handle.sourceRef.sourceSpan,
              newSpan: updated.changedSpan,
              replacement
            },
            ...reorderedPatches
          ];
  return {
    kind: "success",
    newSource,
    patches,
    // Reordering can renumber statement source ids, so avoid stale id hints.
    // Returning [] forces the drag path to use full recompute for this frame.
    changedSourceIds: reordered || nameResolution.insertedSpan ? [] : [handle.sourceRef.sourceId]
  };
}

function resolveElementTemplateAnchorNames(
  source: string,
  template: ElementTemplate,
  parseOptions: EditParseOptions
): { source: string; template: ElementTemplate } {
  if (template.kind !== "line") {
    return { source, template };
  }

  let currentSource = source;
  const namesBySourceId = new Map<string, string>();
  const resolve = (anchor: AnchorReference | undefined): AnchorReference | undefined => {
    if (!anchor) {
      return anchor;
    }
    const nodeSourceId = anchor.nodeSourceId?.trim() ?? "";
    if (!nodeSourceId || anchor.nodeName.trim()) {
      return anchor;
    }
    const existing = namesBySourceId.get(nodeSourceId);
    if (existing) {
      return { ...anchor, nodeName: existing };
    }
    const resolved = resolveAnchorNodeName(currentSource, anchor, parseOptions);
    if (!resolved) {
      return anchor;
    }
    currentSource = resolved.source;
    namesBySourceId.set(nodeSourceId, resolved.anchor.nodeName);
    return resolved.anchor;
  };

  const fromAnchor = resolve(template.fromAnchor);
  const toAnchor = resolve(template.toAnchor);
  return {
    source: currentSource,
    template: {
      ...template,
      fromAnchor,
      toAnchor
    }
  };
}

function resolveAnchorNodeName(
  source: string,
  anchor: AnchorReference,
  parseOptions: EditParseOptions
): AnchorNameResolution | null {
  const nodeName = anchor.nodeName.trim();
  if (nodeName) {
    return {
      source,
      anchor: { ...anchor, nodeName },
      insertedLength: 0
    };
  }

  const nodeSourceId = anchor.nodeSourceId?.trim() ?? "";
  if (!nodeSourceId) {
    return null;
  }
  const named = ensureNodeSourceHasName(source, nodeSourceId, parseOptions);
  if (!named) {
    return null;
  }
  return {
    source: named.source,
    anchor: { ...anchor, nodeName: named.name },
    insertedSpan: named.insertedSpan,
    insertedLength: named.insertedLength
  };
}

function ensureNodeSourceHasName(
  source: string,
  nodeSourceId: string,
  parseOptions: EditParseOptions
): { source: string; name: string; insertedSpan?: Span; insertedLength: number } | null {
  const snapshot = parseStatementSnapshot(source, parseOptions);
  const ref = snapshot.byId.get(nodeSourceId);
  if (ref?.statement.kind !== "Path") {
    return null;
  }
  const node = findNodeItemForSourceId(ref.statement, nodeSourceId);
  if (!node) {
    return null;
  }
  const existingName = node.name?.trim();
  if (existingName) {
    return { source, name: existingName, insertedLength: 0 };
  }

  const name = nextGeneratedNodeName(source);
  const insertAt = nodeNameInsertionOffset(source, ref.statement, node);
  if (insertAt == null) {
    return null;
  }
  const insertion = ` (${name})`;
  return {
    source: source.slice(0, insertAt) + insertion + source.slice(insertAt),
    name,
    insertedSpan: { from: insertAt, to: insertAt },
    insertedLength: insertion.length
  };
}

function findNodeItemForSourceId(statement: PathStatement, sourceId: string): NodeItem | null {
  const statementHasTreeChildren = statement.items.some((candidate) => candidate.kind === "ChildOperation");
  const isSyntheticTreeChildStatement = statement.id.includes(":tree-child:");
  for (const item of statement.items) {
    if (item.kind !== "Node") {
      continue;
    }
    const shouldUseStatementSourceId =
      item.adornment != null ||
      statement.command === "node" ||
      statementHasTreeChildren ||
      isSyntheticTreeChildStatement;
    const itemSourceId = shouldUseStatementSourceId ? statement.id : item.id;
    if (itemSourceId === sourceId) {
      return item;
    }
  }
  return null;
}

function nodeNameInsertionOffset(source: string, statement: PathStatement, node: NodeItem): number | null {
  if (statement.command === "node") {
    if (node.optionsSpan) {
      return node.optionsSpan.to;
    }
    if (statement.options) {
      const optionEnd = statement.options.entries.reduce((max, entry) => Math.max(max, entry.span.to), statement.span.from);
      const rawAfterOptions = source.slice(optionEnd, statement.span.to);
      const closeIndex = rawAfterOptions.indexOf("]");
      if (closeIndex >= 0) {
        return optionEnd + closeIndex + 1;
      }
    }
    const raw = source.slice(statement.span.from, statement.span.to);
    const match = /^\\node\b/u.exec(raw);
    if (match) {
      return statement.span.from + match[0].length;
    }
    return null;
  }
  if (node.optionsSpan) {
    return node.optionsSpan.to;
  }
  const raw = source.slice(node.span.from, node.span.to);
  const match = /^\\node\b/u.exec(raw);
  if (match) {
    return node.span.from + match[0].length;
  }
  return null;
}

function nextGeneratedNodeName(source: string): string {
  const used = new Set<string>();
  for (const match of source.matchAll(GENERATED_NODE_NAME_RE)) {
    const name = match[1];
    if (name) {
      used.add(name);
    }
  }
  for (let index = 1; index < Number.MAX_SAFE_INTEGER; index += 1) {
    const candidate = `node${index}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  return `node${Date.now()}`;
}

function shiftSpan(span: Span, insertedSpan: Span | undefined, insertedLength: number): Span {
  if (!insertedSpan || insertedLength === 0 || insertedSpan.from > span.from) {
    return span;
  }
  return {
    from: span.from + insertedLength,
    to: span.to + insertedLength
  };
}

function applySplitPath(
  source: string,
  editHandles: EditHandle[],
  action: Extract<EditAction, { kind: "splitPath" }>,
  parseOptions: EditParseOptions
): EditActionResult {
  return applySplitPathAction(source, editHandles, action, parseOptions);
}

function applyJoinPaths(
  source: string,
  action: Extract<EditAction, { kind: "joinPaths" }>,
  parseOptions: EditParseOptions
): EditActionResult {
  return applyJoinPathsAction(source, action, { normalizeElementIds }, parseOptions);
}

function applyToggleClosedPath(
  source: string,
  action: Extract<EditAction, { kind: "toggleClosedPath" }>,
  parseOptions: EditParseOptions
): EditActionResult {
  return applyToggleClosedPathAction(source, action, parseOptions);
}

function applyReversePath(
  source: string,
  action: Extract<EditAction, { kind: "reversePath" }>,
  parseOptions: EditParseOptions
): EditActionResult {
  return applyReversePathAction(source, action, parseOptions);
}

function applyDeletePathPoint(
  source: string,
  editHandles: EditHandle[],
  action: Extract<EditAction, { kind: "deletePathPoint" }>,
  parseOptions: EditParseOptions
): EditActionResult {
  return applyDeletePathPointAction(source, editHandles, action, parseOptions);
}

function applySetPathPointKind(
  source: string,
  editHandles: EditHandle[],
  action: Extract<EditAction, { kind: "setPathPointKind" }>,
  parseOptions: EditParseOptions
): EditActionResult {
  return applySetPathPointKindAction(source, editHandles, action, parseOptions);
}

function applyMoveElements(
  source: string,
  editHandles: EditHandle[],
  elementIds: readonly string[],
  delta: WorldPoint,
  parseOptions: EditParseOptions = {},
  formatPrecision?: DragFormatPrecision
): EditActionResult {
  return applyMoveElementsAction(source, editHandles, elementIds, delta, formatPrecision, parseOptions);
}

function applyAlignElements(
  source: string,
  action: Extract<EditAction, { kind: "alignElements" }>,
  parseOptions: EditParseOptions
): EditActionResult {
  return applyAlignElementsAction(source, action, parseOptions);
}

function applyDistributeElements(
  source: string,
  action: Extract<EditAction, { kind: "distributeElements" }>,
  parseOptions: EditParseOptions
): EditActionResult {
  return applyDistributeElementsAction(source, action, parseOptions);
}

function applyPasteStatements(
  source: string,
  action: Extract<EditAction, { kind: "pasteStatements" }>,
  parseOptions: EditParseOptions
): EditActionResult {
  return applyPasteStatementsAction(source, action, {
    applyMoveElements,
    normalizeElementIds,
    uniqueStrings,
    defaultDuplicateOffsetPt: DEFAULT_DUPLICATE_OFFSET_PT
  }, parseOptions);
}

function applyDuplicateElements(
  source: string,
  action: Extract<EditAction, { kind: "duplicateElements" }>,
  parseOptions: EditParseOptions
): EditActionResult {
  return applyDuplicateElementsAction(source, action, {
    applyMoveElements,
    normalizeElementIds,
    uniqueStrings,
    defaultDuplicateOffsetPt: DEFAULT_DUPLICATE_OFFSET_PT
  }, parseOptions);
}

function applyDuplicateAdornment(source: string, targetId: string, parseOptions: EditParseOptions): EditActionResult {
  return applyDuplicateAdornmentAction(source, targetId, parseOptions);
}

function applyGroupElements(
  source: string,
  action: Extract<EditAction, { kind: "groupElements" }>,
  parseOptions: EditParseOptions
): EditActionResult {
  return applyGroupElementsAction(source, action.elementIds, parseOptions);
}

function applyUngroupElements(
  source: string,
  action: Extract<EditAction, { kind: "ungroupElements" }>,
  parseOptions: EditParseOptions
): EditActionResult {
  return applyUngroupElementsAction(source, action.elementIds, parseOptions);
}

function normalizeElementIds(elementIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const elementId of elementIds) {
    const id = elementId.trim();
    if (id.length === 0 || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
}

function resolveNodeTextSpanForElementId(
  source: string,
  elementId: string,
  parseOptions: EditParseOptions
): Span | null {
  const normalizedId = elementId.trim();
  if (normalizedId.length === 0) {
    return null;
  }

  const resolvedTarget = resolvePropertyTarget(source, normalizedId, parseOptions);
  if (resolvedTarget.kind === "found" && resolvedTarget.target.textSpan) {
    return resolvedTarget.target.textSpan;
  }

  const statementSnapshot = parseStatementSnapshot(source, parseOptions);
  const statementRef = statementSnapshot.byId.get(normalizedId);
  if (statementRef?.statement.kind === "Path" && statementRef.statement.command === "node") {
    const nodeItem = statementRef.statement.items.find((item) => item.kind === "Node");
    if (nodeItem?.kind === "Node") {
      return nodeItem.textSpan;
    }
  }

  const parsed = parseTikzForEdit(source, {
    ...parseOptions,
  });
  const stack: Statement[] = [...parsed.figure.body];
  while (stack.length > 0) {
    const statement = stack.shift()!;
    if (statement.kind === "Scope") {
      stack.unshift(...statement.body);
      continue;
    }
    if (statement.kind !== "Path") {
      continue;
    }
    if (statement.command === "node" && statement.id === normalizedId) {
      const nodeItem = statement.items.find((item) => item.kind === "Node");
      if (nodeItem?.kind === "Node") {
        return nodeItem.textSpan;
      }
    }
    for (const item of statement.items) {
      if (item.kind === "Node" && item.id === normalizedId) {
        return item.textSpan;
      }
    }
  }

  return null;
}

function isSharedExpandedHandleSpan(
  handle: EditHandle,
  editHandles: readonly EditHandle[]
): boolean {
  return editHandles.some(
    (candidate) =>
      candidate.id !== handle.id &&
      candidate.sourceRef.sourceSpan.from === handle.sourceRef.sourceSpan.from &&
      candidate.sourceRef.sourceSpan.to === handle.sourceRef.sourceSpan.to
  );
}

function moveStatementAfterNamedDefinition(
  source: string,
  movingStatementId: string,
  name: string,
  parseOptions: EditParseOptions = {}
): { source: string; patches: SourcePatch[] } | null {
  const snapshot = parseStatementSnapshot(source, parseOptions);
  const movingRef = snapshot.byId.get(movingStatementId);
  if (!movingRef) {
    return null;
  }

  const producerId = findNamedDefinitionStatementId(snapshot, name);
  if (!producerId || producerId === movingStatementId) {
    return null;
  }

  const rawProducerRef = snapshot.byId.get(producerId)!;
  const effectiveProducerRef = findAncestorInParentKey(snapshot, rawProducerRef, movingRef.parentKey);
  if (!effectiveProducerRef) {
    return null;
  }

  if (movingRef.index > effectiveProducerRef.index) {
    return null;
  }

  const parentRefs = snapshot.byParentKey.get(movingRef.parentKey)!;
  const ids = parentRefs.map((ref) => ref.id);
  const withoutMoving = ids.filter((id) => id !== movingStatementId);
  const producerIndexInFiltered = withoutMoving.indexOf(effectiveProducerRef.id);
  const nextOrder = [...withoutMoving];
  nextOrder.splice(producerIndexInFiltered + 1, 0, movingStatementId);

  const replacement = buildParentReorderReplacement(snapshot.source, parentRefs, nextOrder)!;

  const applied = applyTextReplacements(source, [
    {
      span: replacement.span,
      text: replacement.text
    }
  ]);

  return {
    source: applied.source,
    patches: applied.patches
  };
}

function findAncestorInParentKey(
  snapshot: ReturnType<typeof parseStatementSnapshot>,
  targetRef: StatementRef,
  targetParentKey: string
): StatementRef | null {
  if (targetRef.parentKey === targetParentKey) {
    return targetRef;
  }
  const prefix = targetParentKey === "" ? "" : `${targetParentKey}/`;
  if (!targetRef.parentKey.startsWith(prefix)) {
    return null;
  }
  const remaining = targetRef.parentKey.slice(prefix.length);
  const topIndexStr = remaining.split("/")[0];
  const topIndex = parseInt(topIndexStr, 10);
  if (Number.isNaN(topIndex)) {
    return null;
  }
  const siblings = snapshot.byParentKey.get(targetParentKey);
  return siblings?.[topIndex] ?? null;
}

function findNamedDefinitionStatementId(
  snapshot: ReturnType<typeof parseStatementSnapshot>,
  name: string
): string | null {
  const normalized = normalizeNodeNameCandidate(name);
  if (!normalized) {
    return null;
  }

  for (const ref of snapshot.all) {
    if (statementDeclaresName(ref.statement, normalized)) {
      return ref.id;
    }
  }

  return null;
}

function statementDeclaresName(statement: Statement, name: string): boolean {
  if (statement.kind !== "Path") {
    return false;
  }
  if (statement.command === "coordinate") {
    for (const item of statement.items) {
      if (item.kind === "Coordinate") {
        const coordName = normalizeNodeNameCandidate(item.x || item.raw?.replace(/[()]/g, ""));
        if (coordName === name || (coordName && (coordName.startsWith(name + ".") || coordName.startsWith(name + "_")))) {
          return true;
        }
      }
    }
  }
  for (const item of statement.items) {
    if (item.kind === "Node") {
      const nodeName = normalizeNodeNameCandidate(item.name);
      if (nodeName === name || (nodeName && (nodeName.startsWith(name + ".") || nodeName.startsWith(name + "_")))) {
        return true;
      }
      const aliases = item.aliases ?? [];
      for (const alias of aliases) {
        const aliasName = normalizeNodeNameCandidate(alias);
        if (aliasName === name || (aliasName && (aliasName.startsWith(name + ".") || aliasName.startsWith(name + "_")))) {
          return true;
        }
      }
      continue;
    }
    if (item.kind === "CoordinateOperation") {
      const coordName = normalizeNodeNameCandidate(item.name);
      if (coordName === name || (coordName && (coordName.startsWith(name + ".") || coordName.startsWith(name + "_")))) {
        return true;
      }
    }
  }
  return false;
}

function normalizeNodeNameCandidate(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed;
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique;
}

function applySetProperty(
  source: string,
  action: Extract<EditAction, { kind: "setProperty" }>,
  parseOptions: EditParseOptions
): EditActionResult {
  return applyPlannedSetPropertyAction(source, action, parseOptions);
}

function applyUpdateNodeText(
  source: string,
  action: Extract<EditAction, { kind: "updateNodeText" }>,
  parseOptions: EditParseOptions
): EditActionResult {
  const textSpan = resolveNodeTextSpanForElementId(source, action.elementId, parseOptions);
  if (!textSpan) {
    return { kind: "unsupported", reason: `No editable node text target found for ${action.elementId}` };
  }
  const updated = replaceSpan(source, textSpan, action.text);
  if (updated.source === source) {
    return { kind: "unsupported", reason: "Node text update would not change the source." };
  }
  return {
    kind: "success",
    newSource: updated.source,
    patches: [
      {
        oldSpan: textSpan,
        newSpan: updated.changedSpan,
        replacement: action.text
      }
    ],
    changedSourceIds: [action.elementId.trim()]
  };
}

function applyResizeElement(
  source: string,
  action: Extract<EditAction, { kind: "resizeElement" }>,
  evaluateOptions: EvaluateOptions | undefined,
  parseOptions: EditParseOptions
): EditActionResult {
  return applyResizeElementAction(source, action, evaluateOptions, parseOptions);
}

function applyAddElement(
  source: string,
  template: ElementTemplate,
  at: WorldPoint,
  parseOptions: EditParseOptions
): EditActionResult {
  const beforeStatements = parseStatementSnapshot(source);
  const resolved = resolveElementTemplateAnchorNames(source, template, parseOptions);
  const snippet = generateElementSource(resolved.template, at);

  const newSource = insertElementIntoSource(resolved.source, snippet);

  const afterStatements = parseStatementSnapshot(newSource);
  const insertedStatementId = afterStatements.all.find((ref) => !beforeStatements.byId.has(ref.id))!.id;

  return {
    kind: "success",
    newSource,
    patches: [computeReplacementPatch(source, newSource)],
    selectedSourceIds: [insertedStatementId],
    changedSourceIds: [insertedStatementId]
  };
}

function computeReplacementPatch(oldSource: string, newSource: string): SourcePatch {
  const oldLen = oldSource.length;
  const newLen = newSource.length;
  const minLen = Math.min(oldLen, newLen);

  let prefix = 0;
  while (prefix < minLen && oldSource.charCodeAt(prefix) === newSource.charCodeAt(prefix)) {
    prefix += 1;
  }

  let oldSuffix = oldLen;
  let newSuffix = newLen;
  while (
    oldSuffix > prefix &&
    newSuffix > prefix &&
    oldSource.charCodeAt(oldSuffix - 1) === newSource.charCodeAt(newSuffix - 1)
  ) {
    oldSuffix -= 1;
    newSuffix -= 1;
  }

  return {
    oldSpan: { from: prefix, to: oldSuffix },
    newSpan: { from: prefix, to: newSuffix },
    replacement: newSource.slice(prefix, newSuffix)
  };
}
