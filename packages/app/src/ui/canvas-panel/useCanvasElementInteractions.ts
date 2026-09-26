import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { clientPoint, px, pt, worldPoint, worldBounds, worldVector } from "tikz-editor/coords/index";
import {
  buildSnapContext,
  collectOpenPathEndpointSourceIds,
  collectPathEndpointSnapPoints,
  collectSelectionGeometryFromBounds,
  collectSourceWorldBounds,
  mergeSnapPointLists,
  resolveMoveAxisConstraintFromEditHandles,
  type SnapBounds,
  type SnapGuideInput,
  type SnapLine,
  type SnapSettingsPatch
} from "tikz-editor/edit/snapping";
import type { EditHandle, SceneElement } from "tikz-editor/semantic/types";
import type { CoordinateItem, PathKeywordItem, PathStatement, Statement } from "tikz-editor/ast/types";
import type { ClientPoint, WorldBounds, WorldPoint } from "../coords/types";
import { resolveEligibleExplicitPath, type ExplicitPathAnalysis } from "tikz-editor/edit/path-editing";
import { closestPointOnLine, closestPointOnCubic } from "tikz-editor/edit/curve-math";
import {
  findAllInterComponentStraightWires,
  findInterComponentStraightWireConnection,
  findHalfConnectedStraightWireConnection
} from "tikz-editor/index";
import { detectRigidLeafBranches, findAttachedWiresForTransientDrag } from "tikz-editor/edit/actions/wire-follow";
import type { CanvasTransform, ToolMode } from "../../store/types";
import { clientToWorldPoint } from "./geometry";
import { makeMergeKey, selectionAnchorRatioFromPoint } from "./panel-helpers";
import {
  collectAllScopeDescendantSourceIds,
  isSourceWithinScope,
  type ScopeOverlayIndex,
  resolveFocusedScopeIdForSelection,
  resolveScopeAwarePointerDownTarget,
  resolveScopeAwarePointerUpDrillTarget
} from "./scope-overlay";
import type {
  ApplyActionWithFeedbackFn,
  CanvasDispatch,
  CanvasEditParseOptions,
  CanvasSnapshot,
  DragState,
  EditableTextTarget,
  SnapDebugLogInput,
  StateSetter,
  ValueSetter
} from "./types";
import type { HitRegion } from "./hit-regions";

export type UseCanvasElementInteractionsArgs = {
  svgResult: CanvasSnapshot["svg"];
  toolMode: ToolMode;
  selectedElementIds: ReadonlySet<string>;
  suppressNextBackgroundClickRef: MutableRefObject<boolean>;
  viewportRef: RefObject<HTMLDivElement | null>;
  beginCanvasTextInteraction: (event: ReactPointerEvent<SVGElement>, target: EditableTextTarget) => void;
  closeTextEditingSession: () => void;
  interactionSvgRef: RefObject<SVGSVGElement | null>;
  dispatch: CanvasDispatch;
  draggableSourceIds: ReadonlySet<string>;
  directManipulationDisabledReasonBySourceId?: ReadonlyMap<string, string>;
  snapshot: CanvasSnapshot;
  source: string;
  setWarning: StateSetter<string | null>;
  onBucketFillRegion: (region: HitRegion | undefined) => void;
  setSnapLines: StateSetter<SnapLine[]>;
  logSnapDebug: (input: SnapDebugLogInput) => void;
  snapGuideInput: SnapGuideInput;
  snapSettingsPatch: SnapSettingsPatch;
  canvasTransform: CanvasTransform;
  viewportWorldBounds: WorldBounds | null;
  setDragState: ValueSetter<DragState | null>;
  resolveEditableTextTarget: (targetId: string, region?: HitRegion) => EditableTextTarget | null;
  densePathSourceIds: ReadonlySet<string>;
  expandedDensePathSourceId: string | null;
  setExpandedDensePathSourceId: StateSetter<string | null>;
  scopeOverlay: ScopeOverlayIndex;
  focusedScopeId: string | null;
  applyActionWithFeedback: ApplyActionWithFeedbackFn;
  activeFigureId: string | null;
  parseOptions: CanvasEditParseOptions;
  onNodePositionTargetPick?: (targetId: string) => boolean;
  onHandlePointerDown?: (event: ReactPointerEvent<SVGElement>, handle: EditHandle) => void;
};

function clientPointFromEvent(event: Pick<PointerEvent | ReactPointerEvent<SVGElement> | ReactMouseEvent<SVGElement>, "clientX" | "clientY">): ClientPoint {
  return clientPoint(px(event.clientX), px(event.clientY));
}

/** Screen-pixel radius for grabbing an operator wire's implicit corner (matches the 20px handle hit test above). */
const ORTHO_CORNER_HIT_THRESHOLD_PX = 20;

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

/**
 * Resolves the world position of the IMPLICIT corner of an `|-` / `-|` operator wire when the
 * pointer is within `thresholdWorld` of it. Returns null for any other path (explicit polylines,
 * wires without a named-anchor operator, or a pointer away from the corner).
 */
function resolveImplicitOrthoCornerTarget(
  parseResult: CanvasSnapshot["parseResult"],
  editHandles: readonly EditHandle[],
  targetId: string,
  world: WorldPoint,
  thresholdWorld: number
): { cornerWorld: WorldPoint } | null {
  const figure = parseResult?.figure;
  if (!figure) {
    return null;
  }
  const statement = findPathStatementBySourceId(figure.body, targetId);
  if (!statement || statement.command !== "draw") {
    return null;
  }
  const operator = statement.items.find(
    (item) => item.kind === "PathKeyword" && (item.keyword === "|-" || item.keyword === "-|")
  );
  if (!operator) {
    return null;
  }
  const coordinateCount = statement.items.filter((item) => item.kind === "Coordinate").length;
  if (coordinateCount !== 2) {
    return null;
  }
  const handles = editHandles
    .filter((handle) => handle.kind === "path-point" && handle.sourceRef.sourceId === targetId)
    .sort((left, right) => left.sourceRef.sourceSpan.from - right.sourceRef.sourceSpan.from);
  if (handles.length < 2) {
    return null;
  }
  const first = handles[0].world;
  const last = handles[handles.length - 1].world;
  // `|-` bends at (first.x, last.y); `-|` bends at (last.x, first.y). See
  // packages/core/src/semantic/path/segments.ts.
  const cornerWorld =
    operator.kind === "PathKeyword" && operator.keyword === "|-"
      ? worldPoint(pt(first.x), pt(last.y))
      : worldPoint(pt(last.x), pt(first.y));
  if (Math.hypot(cornerWorld.x - world.x, cornerWorld.y - world.y) > thresholdWorld) {
    return null;
  }
  return { cornerWorld };
}

/**
 * Detect if the cursor is directly on an orthogonal wire segment (not on a handle/corner).
 */
function resolveOrthoSegmentTarget(
  parseResult: CanvasSnapshot["parseResult"],
  editHandles: readonly EditHandle[],
  targetId: string,
  world: WorldPoint,
  thresholdWorld: number
): { segmentIndex: number; axis: "h" | "v" } | null {
  const figure = parseResult?.figure;
  if (!figure) {
    return null;
  }
  const statement = findPathStatementBySourceId(figure.body, targetId);
  if (!statement || statement.command !== "draw") {
    return null;
  }
  // Reject non-wire shapes
  const hasShape = statement.items.some(
    (item) =>
      item.kind === "PathKeyword" &&
      (item.keyword === "circle" ||
        item.keyword === "rectangle" ||
        item.keyword === "ellipse" ||
        item.keyword === "arc" ||
        item.keyword === "grid")
  );
  if (hasShape) {
    return null;
  }

  // Reject single straight wire connecting two components or half-connected straight wire (死命令：禁止推拉变折线，仅随元件移动伸缩或自由端沿方向伸缩)
  const sourceText = parseResult?.source ?? "";
  if (
    findInterComponentStraightWireConnection(statement, figure.body, editHandles, sourceText) ||
    findHalfConnectedStraightWireConnection(statement, figure.body, editHandles, sourceText)
  ) {
    return null;
  }

  const coordinates = statement.items.filter((item): item is CoordinateItem => item.kind === "Coordinate");
  if (coordinates.length < 2) {
    return null;
  }

  const operator = statement.items.find(
    (item): item is PathKeywordItem => item.kind === "PathKeyword" && (item.keyword === "|-" || item.keyword === "-|")
  );

  // 任何仅有两个端点且非 |- / -| 的普通直连导线，绝不存在中间正交段，严禁启动正交推拉（彻底杜绝误触被拉出凹坑台阶）
  if (coordinates.length === 2 && !operator) {
    return null;
  }

  const statementHandles = editHandles
    .filter((handle) => handle.kind === "path-point" && handle.sourceRef.sourceId === targetId)
    .sort((left, right) => left.sourceRef.sourceSpan.from - right.sourceRef.sourceSpan.from);

  // If 2 coordinates with implicit operator |- or -|
  if (operator && coordinates.length === 2 && statementHandles.length >= 2) {
    const p0 = statementHandles[0].world;
    const p1 = statementHandles[statementHandles.length - 1].world;
    const corner =
      operator.keyword === "|-"
        ? worldPoint(pt(p0.x), pt(p1.y))
        : worldPoint(pt(p1.x), pt(p0.y));

    const segments: Array<{ segIdx: number; pA: WorldPoint; pB: WorldPoint; axis: "h" | "v" }> = [
      {
        segIdx: 0,
        pA: p0,
        pB: corner,
        axis: operator.keyword === "|-" ? "v" : "h"
      },
      {
        segIdx: 1,
        pA: corner,
        pB: p1,
        axis: operator.keyword === "|-" ? "h" : "v"
      }
    ];

    let bestMatch: { segmentIndex: number; axis: "h" | "v"; dist: number } | null = null;
    for (const seg of segments) {
      const dx = seg.pB.x - seg.pA.x;
      const dy = seg.pB.y - seg.pA.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 1e-4) continue;
      const t = ((world.x - seg.pA.x) * dx + (world.y - seg.pA.y) * dy) / lenSq;
      if (t < 0.05 || t > 0.95) continue;
      const projX = seg.pA.x + t * dx;
      const projY = seg.pA.y + t * dy;
      const dist = Math.hypot(world.x - projX, world.y - projY);
      if (dist <= thresholdWorld && (!bestMatch || dist < bestMatch.dist)) {
        bestMatch = { segmentIndex: seg.segIdx, axis: seg.axis, dist };
      }
    }
    if (bestMatch) {
      return { segmentIndex: bestMatch.segmentIndex, axis: bestMatch.axis };
    }
    return null;
  }

  // Explicit polyline
  const pts: WorldPoint[] = [];
  for (const coord of coordinates) {
    const handle = statementHandles.find((h) => h.sourceRef.sourceSpan.from === coord.span.from);
    if (handle) {
      pts.push(handle.world);
    } else if (coord.form === "cartesian") {
      pts.push(worldPoint(pt(parseFloat(coord.x) * 28.4527559), pt(parseFloat(coord.y) * 28.4527559)));
    }
  }

  if (pts.length < 2 || pts.length !== coordinates.length) {
    return null;
  }

  let bestMatch: { segmentIndex: number; axis: "h" | "v"; dist: number } | null = null;
  for (let k = 0; k < pts.length - 1; k++) {
    const pA = pts[k];
    const pB = pts[k + 1];
    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-4) continue;

    const isVertical = Math.abs(dx) <= 1.0;
    const isHorizontal = Math.abs(dy) <= 1.0;
    if (!isVertical && !isHorizontal) continue;

    const t = ((world.x - pA.x) * dx + (world.y - pA.y) * dy) / lenSq;
    if (t < 0.05 || t > 0.95) continue;
    const projX = pA.x + t * dx;
    const projY = pA.y + t * dy;
    const dist = Math.hypot(world.x - projX, world.y - projY);
    if (dist <= thresholdWorld && (!bestMatch || dist < bestMatch.dist)) {
      bestMatch = { segmentIndex: k, axis: isVertical ? "v" : "h", dist };
    }
  }

  if (bestMatch) {
    return { segmentIndex: bestMatch.segmentIndex, axis: bestMatch.axis };
  }
  return null;
}

export function resolveEffectiveDraggedIds(input: {
  draggedIds: readonly string[];
  draggableSourceIds: ReadonlySet<string>;
  snapshot: CanvasSnapshot;
  scopeOverlay: ScopeOverlayIndex;
}): string[] {
  const { draggedIds, draggableSourceIds, snapshot, scopeOverlay } = input;
  if (draggedIds.length <= 1) {
    return draggedIds.filter((id) => draggableSourceIds.has(id));
  }

  const draggedIdSet = new Set(draggedIds);

  const isComponentInSelection = (compId: string): boolean => {
    if (draggedIdSet.has(compId)) return true;
    const ancestors = scopeOverlay.ancestorScopeIdsBySourceId.get(compId) ?? [];
    return ancestors.some((a) => draggedIdSet.has(a));
  };

  const interWires = snapshot.parseResult
    ? findAllInterComponentStraightWires(
        snapshot.parseResult.figure.body,
        snapshot.editHandles,
        snapshot.source
      )
    : [];

  const internalWireIds = new Set<string>();
  for (const conn of interWires) {
    if (
      draggedIdSet.has(conn.wireSourceId) &&
      isComponentInSelection(conn.componentAId) &&
      isComponentInSelection(conn.componentBId)
    ) {
      internalWireIds.add(conn.wireSourceId);
    }
  }

  const effective: string[] = [];
  for (const id of draggedIds) {
    if (draggableSourceIds.has(id)) {
      effective.push(id);
    } else if (internalWireIds.has(id)) {
      effective.push(id);
    }
  }

  // Filter out any child ID whose ancestor scope is already in effective
  const effectiveSet = new Set(effective);
  return effective.filter((id) => {
    const ancestors = scopeOverlay.ancestorScopeIdsBySourceId.get(id) ?? [];
    return !ancestors.some((a) => effectiveSet.has(a));
  });
}

export function useCanvasElementInteractions(args: UseCanvasElementInteractionsArgs) {
  const {
    svgResult,
    toolMode,
    selectedElementIds,
    suppressNextBackgroundClickRef,
    viewportRef,
    beginCanvasTextInteraction,
    closeTextEditingSession,
    interactionSvgRef,
    dispatch,
    draggableSourceIds,
    directManipulationDisabledReasonBySourceId,
    snapshot,
    source,
    setWarning,
    onBucketFillRegion,
    setSnapLines,
    logSnapDebug,
    snapGuideInput,
    snapSettingsPatch,
    canvasTransform,
    viewportWorldBounds,
    setDragState,
    resolveEditableTextTarget,
    densePathSourceIds,
    expandedDensePathSourceId,
    setExpandedDensePathSourceId,
    scopeOverlay,
    focusedScopeId,
    applyActionWithFeedback,
    activeFigureId,
    parseOptions,
    onNodePositionTargetPick,
    onHandlePointerDown
  } = args;

  const pendingScopeDrillRef = useRef<{
    pointerId: number;
    startClient: ClientPoint;
    selectedScopeId: string;
    hitSourceId: string;
    dragIds: string[];
    moved: boolean;
    dragStarted: boolean;
  } | null>(null);
  const pendingTextInteractionRef = useRef<{
    pointerId: number;
    startClient: ClientPoint;
    targetId: string;
    textTarget: EditableTextTarget;
    dragIds: string[];
    wasSelectedOnWorldPointerDown: boolean;
    moved: boolean;
    dragStarted: boolean;
  } | null>(null);

  const startElementDrag = useCallback(
    (
      pointerId: number,
      world: WorldPoint,
      draggedIds: string[],
      options: { adornmentDragFromText?: boolean } = {}
    ) => {
      const effectiveDraggedIds = resolveEffectiveDraggedIds({
        draggedIds,
        draggableSourceIds,
        snapshot,
        scopeOverlay
      });

      if (effectiveDraggedIds.length === 0) {
        const reason = draggedIds
          .map((id) => directManipulationDisabledReasonBySourceId?.get(id))
          .find((candidate): candidate is string => Boolean(candidate && candidate.trim().length > 0));
        if (reason) {
          setWarning(reason);
        }
        setSnapLines([]);
        return;
      }

      if (snapshot.source !== source) {
        setWarning("Wait for recompute to finish before dragging.");
        setSnapLines([]);
        logSnapDebug({
          phase: "drag-start-element",
          note: "blocked: snapshot/source mismatch",
          snapshotMatchesSource: false,
          dragKind: "element",
          rawPoint: world,
          lines: []
        });
        return;
      }

      const snapExcludedSourceIds = collectSnapExcludedSourceIds(effectiveDraggedIds, scopeOverlay, snapshot.scene?.elements);
      const scopeInternalSourceIds = collectAllScopeDescendantSourceIds(scopeOverlay);
      const selectedForSnap = new Set(snapExcludedSourceIds);

      // Exclude attached wires and intermediate collinear branch dots from snap targets
      // so dragging a transistor/component does NOT magnetically snap to its own connected branch dots or lines.
      if (snapshot.source && snapshot.parseResult && snapshot.editHandles) {
        const attachedWires = findAttachedWiresForTransientDrag(
          snapshot.source,
          snapshot.editHandles,
          effectiveDraggedIds,
          effectiveDraggedIds.filter((id) => scopeOverlay.scopesById.has(id))
        );
        for (const w of attachedWires) {
          selectedForSnap.add(w.wireSourceId);
        }
        const rigidBranches = detectRigidLeafBranches(
          snapshot.source,
          snapshot.parseResult.figure.body,
          snapshot.editHandles,
          effectiveDraggedIds,
          worldPoint(pt(1), pt(1))
        );
        for (const rb of rigidBranches) {
          if (rb.leafComponentId) selectedForSnap.add(rb.leafComponentId);
          if (rb.wireStatementId) selectedForSnap.add(rb.wireStatementId);
          if (rb.associatedDotStatementIds) {
            for (const dotId of rb.associatedDotStatementIds) {
              selectedForSnap.add(dotId);
            }
          }
        }
      }

      const endpointSourceIds = snapshot.scene
        ? collectOpenPathEndpointSourceIds(snapshot.scene.elements, snapshot.editHandles)
        : new Set<string>();

      // A TEXT element (SceneText) is a free-floating label: magnetic alignment to nearby points /
      // anchors / grid fights the user's placement instead of helping it (and a `\node` label would
      // otherwise advertise its own compass pin points as snap candidates). So a text-only drag gets
      // NO snap context at all -- no grid/point/guide snapping and no published candidates. Dragging
      // a component or a wire (or any mixed selection) snaps exactly as before.
      const textSourceIds = new Set(
        (snapshot.scene?.elements ?? [])
          .filter((element) => element.kind === "Text")
          .map((element) => element.sourceRef.sourceId)
      );
      const dragIsTextOnly =
        effectiveDraggedIds.length > 0 &&
        effectiveDraggedIds.every((id) => textSourceIds.has(id) || id.startsWith("node-adornment:"));

      const snapContext = snapshot.scene && !dragIsTextOnly
        ? buildSnapContext({
            sceneElements: snapshot.scene.elements,
            selectedSourceIds: [...selectedForSnap],
            editHandles: snapshot.editHandles,
            guides: snapGuideInput,
            settings: snapSettingsPatch,
            zoom: canvasTransform.scale,
            viewportWorld: viewportWorldBounds,
            excludedSourceIds: scopeInternalSourceIds
          })
        : null;
      const worldBoundsBySource = snapshot.scene
        ? collectSourceWorldBounds(snapshot.scene.elements)
        : new Map<string, SnapBounds>();
      const worldInteractionBoundsBySource = new Map<string, SnapBounds>(worldBoundsBySource);
      for (const scopeId of scopeOverlay.scopesById.keys()) {
        let mergedBounds: WorldBounds | null = null;
        for (const [sourceId, sourceBounds] of worldBoundsBySource.entries()) {
          const ancestors = scopeOverlay.ancestorScopeIdsBySourceId.get(sourceId) ?? [];
          if (!ancestors.includes(scopeId)) {
            continue;
          }
          mergedBounds = mergedBounds
            ? worldBounds(
                pt(Math.min(mergedBounds.minX, sourceBounds.minX)),
                pt(Math.min(mergedBounds.minY, sourceBounds.minY)),
                pt(Math.max(mergedBounds.maxX, sourceBounds.maxX)),
                pt(Math.max(mergedBounds.maxY, sourceBounds.maxY))
              )
            : worldBounds(sourceBounds.minX, sourceBounds.minY, sourceBounds.maxX, sourceBounds.maxY);
        }
        if (!mergedBounds) {
          continue;
        }
        worldInteractionBoundsBySource.set(scopeId, Object.assign(worldBounds(
          mergedBounds.minX,
          mergedBounds.minY,
          mergedBounds.maxX,
          mergedBounds.maxY
        ), { sourceId: scopeId }));
      }

      const initialSelection = collectSelectionGeometryFromBounds(worldInteractionBoundsBySource, effectiveDraggedIds);
      if (initialSelection) {
        // 端点吸附：把被拖动元件（含 scope 子元素）的首末 path-point 端口
        // 加入 movable snap points，这样电阻/直线的端口能吸到其他端口上。
        const selectedEndpointPoints = collectPathEndpointSnapPoints(
          snapshot.editHandles,
          new Set([...selectedForSnap].filter((sourceId) => endpointSourceIds.has(sourceId)))
        );
        initialSelection.snapPoints = mergeSnapPointLists(
          initialSelection.snapPoints,
          selectedEndpointPoints
        );
      }
      const movementAxis =
        effectiveDraggedIds.length <= 1
          ? resolveMoveAxisConstraintFromEditHandles(
              snapshot.editHandles,
              selectedForSnap,
              {
                requireAttachedWire: true,
                sceneElements: snapshot.scene?.elements ?? [],
                nodeAnchorTargets: snapshot.semanticResult?.nodeAnchorTargets ?? []
              }
            )
          : null;

      let finalMovementAxis: "x" | "y" | "orthogonal" | "locked" | null = movementAxis;
      if (effectiveDraggedIds.length > 1) {
        finalMovementAxis = "orthogonal";
      } else if (!finalMovementAxis && snapshot.source) {
        const isMosfet =
          snapshot.editHandles.some((h) => {
            if (!selectedForSnap.has(h.sourceRef.sourceId)) return false;
            const spanText = snapshot.source.slice(
              Math.max(0, h.sourceRef.sourceSpan.from - 200),
              Math.min(snapshot.source.length, h.sourceRef.sourceSpan.to + 200)
            );
            return spanText.includes("node_Mx") || spanText.includes("node_M");
          }) ||
          effectiveDraggedIds.some((id) => {
            const handles = snapshot.editHandles.filter((h) => h.sourceRef.sourceId === id);
            return handles.some((h) => {
              const spanText = snapshot.source.slice(
                Math.max(0, h.sourceRef.sourceSpan.from - 200),
                Math.min(snapshot.source.length, h.sourceRef.sourceSpan.to + 200)
              );
              return spanText.includes("node_Mx") || spanText.includes("node_M");
            });
          });
        if (isMosfet) {
          finalMovementAxis = "orthogonal";
        }
      }

      const selectionAnchorRatio = initialSelection
        ? selectionAnchorRatioFromPoint(initialSelection.bounds, world)
        : null;
      setSnapLines([]);

      setDragState({
        kind: "element",
        pointerId,
        elementIds: effectiveDraggedIds,
        startWorld: world,
        adornmentDragFromText:
          effectiveDraggedIds.length === 1 && effectiveDraggedIds[0]?.startsWith("node-adornment:")
            ? options.adornmentDragFromText === true
            : undefined,
        lastAppliedTotalDelta: worldVector(pt(0), pt(0)),
        movementAxis: finalMovementAxis,
        snapContext,
        initialSelection,
        selectionAnchorRatio,
        historyMergeKey: makeMergeKey(
          "drag-element",
          effectiveDraggedIds.slice().sort().join(","),
          pointerId
        )
      });
      logSnapDebug({
        phase: "drag-start-element",
        snapshotMatchesSource: true,
        dragKind: "element",
        context: snapContext,
        rawPoint: world,
        lines: []
      });
    },
    [
      canvasTransform.scale,
      directManipulationDisabledReasonBySourceId,
      draggableSourceIds,
      logSnapDebug,
      scopeOverlay,
      setDragState,
      setSnapLines,
      setWarning,
      snapGuideInput,
      snapSettingsPatch,
      snapshot.editHandles,
      snapshot.scene,
      snapshot.source,
      source,
      viewportWorldBounds
    ]
  );

  useEffect(() => {
    function onWorldPointerMove(event: PointerEvent) {
      const pending = pendingScopeDrillRef.current;
      if (pending?.pointerId !== event.pointerId || pending.dragStarted) {
        return;
      }
      const clientPoint = clientPointFromEvent(event);
      const dx = clientPoint.x - pending.startClient.x;
      const dy = clientPoint.y - pending.startClient.y;
      if ((dx * dx) + (dy * dy) <= 16) {
        return;
      }
      pending.moved = true;
      if (pending.dragIds.length === 0 || !svgResult) {
        return;
      }
      const world = clientToWorldPoint(clientPoint, interactionSvgRef.current, svgResult.viewBox);
      if (!world) {
        return;
      }
      startElementDrag(event.pointerId, world, pending.dragIds);
      pending.dragStarted = true;
    }

    function onWorldPointerUp(event: PointerEvent) {
      const pending = pendingScopeDrillRef.current;
      if (pending?.pointerId !== event.pointerId) {
        return;
      }
      pendingScopeDrillRef.current = null;
      if (pending.moved) {
        return;
      }

      const selectedScopeId = selectedElementIds.size === 1
        ? (selectedElementIds.values().next().value ?? null)
        : null;
      if (!selectedScopeId || selectedScopeId !== pending.selectedScopeId) {
        return;
      }

      const drillTarget = resolveScopeAwarePointerUpDrillTarget({
        selectedScopeId,
        hitSourceId: pending.hitSourceId,
        scopeOverlay
      });
      if (!drillTarget || drillTarget === selectedScopeId) {
        return;
      }

      dispatch({ type: "SELECT", id: drillTarget, additive: false });
      dispatch({ type: "SET_FOCUSED_SCOPE", scopeId: resolveFocusedScopeIdForSelection(drillTarget, scopeOverlay) });
      setSnapLines([]);
    }

    function onTextWorldPointerMove(event: PointerEvent) {
      const pending = pendingTextInteractionRef.current;
      if (pending?.pointerId !== event.pointerId || pending.dragStarted) {
        return;
      }
      const clientPoint = clientPointFromEvent(event);
      const dx = clientPoint.x - pending.startClient.x;
      const dy = clientPoint.y - pending.startClient.y;
      if ((dx * dx) + (dy * dy) <= 16) {
        return;
      }
      pending.moved = true;
      if (!svgResult) {
        return;
      }
      const world = clientToWorldPoint(clientPoint, interactionSvgRef.current, svgResult.viewBox);
      if (!world) {
        return;
      }
      if (!pending.wasSelectedOnWorldPointerDown) {
        dispatch({ type: "SELECT", id: pending.targetId, additive: false });
        dispatch({
          type: "SET_FOCUSED_SCOPE",
          scopeId: resolveFocusedScopeIdForSelection(pending.targetId, scopeOverlay)
        });
      }
      closeTextEditingSession();
      startElementDrag(event.pointerId, world, pending.dragIds);
      pending.dragStarted = true;
    }

    function onTextWorldPointerUp(event: PointerEvent) {
      const pending = pendingTextInteractionRef.current;
      if (pending?.pointerId !== event.pointerId) {
        return;
      }
      pendingTextInteractionRef.current = null;
      if (pending.moved) {
        return;
      }
      dispatch({ type: "SELECT", id: pending.targetId, additive: false });
      dispatch({
        type: "SET_FOCUSED_SCOPE",
        scopeId: resolveFocusedScopeIdForSelection(pending.targetId, scopeOverlay)
      });
      beginCanvasTextInteraction(
        {
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
          button: 0,
          detail: 1,
          clientX: event.clientX,
          clientY: event.clientY,
          pointerId: event.pointerId,
          currentTarget: {
            setPointerCapture() {
              // No-op for deferred text activation outside the original React event.
            }
          }
        } as unknown as ReactPointerEvent<SVGElement>,
        pending.textTarget
      );
    }

    window.addEventListener("pointermove", onWorldPointerMove);
    window.addEventListener("pointerup", onWorldPointerUp);
    window.addEventListener("pointercancel", onWorldPointerUp);
    window.addEventListener("pointermove", onTextWorldPointerMove);
    window.addEventListener("pointerup", onTextWorldPointerUp);
    window.addEventListener("pointercancel", onTextWorldPointerUp);
    return () => {
      window.removeEventListener("pointermove", onWorldPointerMove);
      window.removeEventListener("pointerup", onWorldPointerUp);
      window.removeEventListener("pointercancel", onWorldPointerUp);
      window.removeEventListener("pointermove", onTextWorldPointerMove);
      window.removeEventListener("pointerup", onTextWorldPointerUp);
      window.removeEventListener("pointercancel", onTextWorldPointerUp);
    };
  }, [beginCanvasTextInteraction, closeTextEditingSession, dispatch, interactionSvgRef, scopeOverlay, selectedElementIds, setSnapLines, startElementDrag, svgResult]);

  const onElementPointerDown = useCallback(
    (event: ReactPointerEvent<SVGElement>, targetId: string, region?: HitRegion) => {
      if (!svgResult) return;
      if (toolMode === "addBucket") {
        if (event.button !== 0) {
          return;
        }
        viewportRef.current?.focus({ preventScroll: true });
        closeTextEditingSession();
        event.preventDefault();
        event.stopPropagation();
        onBucketFillRegion(region);
        return;
      }
      if (toolMode !== "select") return;
      const additiveSelection = event.shiftKey || event.ctrlKey || event.metaKey;
      const clientPoint = clientPointFromEvent(event);
      const hitSourceId = typeof region?.sourceId === "string" ? region.sourceId : targetId;
      const matrixEdgeSelection =
        region?.shape === "rect" && region.matrixEdgeSelection
          ? region.matrixEdgeSelection
          : null;
      const resolvedTargetId = resolveScopeAwarePointerDownTarget({
        hitTargetId: targetId,
        hitSourceId,
        scopeOverlay,
        focusedScopeId
      });

      viewportRef.current?.focus({ preventScroll: true });
      const alreadySelected = selectedElementIds.has(resolvedTargetId);

      if (event.button !== 0) {
        return;
      }

      if (onNodePositionTargetPick?.(resolvedTargetId)) {
        event.preventDefault();
        event.stopPropagation();
        suppressNextBackgroundClickRef.current = true;
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      suppressNextBackgroundClickRef.current = true;

      if (!additiveSelection && matrixEdgeSelection && event.button === 0) {
        closeTextEditingSession();
        setExpandedDensePathSourceId(null);
        dispatch({ type: "SELECT_RANGE", ids: matrixEdgeSelection.selectionIds });
        dispatch({
          type: "SET_FOCUSED_SCOPE",
          scopeId: resolveFocusedScopeIdForSelection(matrixEdgeSelection.matrixSourceId, scopeOverlay)
        });
        setSnapLines([]);
        return;
      }

      const textTarget = resolvedTargetId === targetId ? resolveEditableTextTarget(targetId, region) : null;
      if (!additiveSelection && textTarget) {
        const draggedIds = alreadySelected && selectedElementIds.size > 0 ? [...selectedElementIds] : [resolvedTargetId];
        const supportsDeferredTextDrag = snapshot.editHandles.some(
          (handle: EditHandle) =>
            handle.sourceRef.sourceId === resolvedTargetId &&
            handle.kind === "node-position" &&
            handle.pathAttachmentContext != null
        );
        if (
          supportsDeferredTextDrag &&
          event.pointerType !== "touch" &&
          draggedIds.every((id) => draggableSourceIds.has(id))
        ) {
          pendingTextInteractionRef.current = {
            pointerId: event.pointerId,
            startClient: clientPoint,
            targetId: resolvedTargetId,
            textTarget,
            dragIds: draggedIds,
            wasSelectedOnWorldPointerDown: alreadySelected,
            moved: false,
            dragStarted: false
          };
        } else {
          dispatch({ type: "SELECT", id: targetId, additive: false });
          dispatch({
            type: "SET_FOCUSED_SCOPE",
            scopeId: resolveFocusedScopeIdForSelection(targetId, scopeOverlay)
          });
          beginCanvasTextInteraction(event, textTarget);
        }
        return;
      }

      const isAdornmentTarget = resolvedTargetId.startsWith("node-adornment:");
      closeTextEditingSession();

      // Keep dense-path expansion when re-clicking the same selected dense path.
      if (
        !additiveSelection &&
        !(expandedDensePathSourceId != null && resolvedTargetId === expandedDensePathSourceId)
      ) {
        setExpandedDensePathSourceId(null);
      }

      const singleSelectedId = selectedElementIds.size === 1
        ? (selectedElementIds.values().next().value ?? null)
        : null;
      const singleSelectedScopeId =
        singleSelectedId && scopeOverlay.scopesById.has(singleSelectedId) ? singleSelectedId : null;
      const shouldDeferScopeDrillToWorldPointerUp =
        !additiveSelection &&
        singleSelectedScopeId != null &&
        resolvedTargetId === singleSelectedScopeId &&
        isSourceWithinScope(singleSelectedScopeId, hitSourceId, scopeOverlay);

      const world = clientToWorldPoint(clientPoint, interactionSvgRef.current, svgResult.viewBox);
      if (!world) return;

      // Shift on an unselected element adds to the selection; Shift on an
      // already-selected element falls through so a constrained (axis-locked)
      // drag can start instead.
      if (additiveSelection && !alreadySelected) {
        dispatch({ type: "SELECT", id: resolvedTargetId, additive: true });
        return;
      }

      if (shouldDeferScopeDrillToWorldPointerUp) {
        const canDragSelectedScope = draggableSourceIds.has(singleSelectedScopeId);
        pendingScopeDrillRef.current = {
          pointerId: event.pointerId,
          startClient: clientPoint,
          selectedScopeId: singleSelectedScopeId,
          hitSourceId,
          dragIds: canDragSelectedScope ? [singleSelectedScopeId] : [],
          moved: false,
          dragStarted: false
        };
        setSnapLines([]);
        return;
      }

      const endpointHandle =
        !additiveSelection &&
        onHandlePointerDown &&
        snapshot.editHandles.find((h) => {
          if (h.kind !== "path-point" || h.sourceRef.sourceId !== resolvedTargetId) return false;
          const dx = h.world.x - world.x;
          const dy = h.world.y - world.y;
          const thresholdWorld = 20 / Math.max(canvasTransform.scale || 1, 1e-3);
          return Math.hypot(dx, dy) <= thresholdWorld;
        });

      if (endpointHandle && onHandlePointerDown) {
        if (!alreadySelected) {
          dispatch({ type: "SELECT", id: resolvedTargetId, additive: false });
        }
        onHandlePointerDown(event, endpointHandle);
        return;
      }

      // Grabbing the IMPLICIT corner of an `|-` / `-|` operator wire. That corner is derived by
      // TikZ and has no edit handle, so the endpoint-handle test above misses it and the gesture
      // used to fall through to the element drag -- translating the WHOLE wire ("整条线飞起来").
      // Start a dedicated corner drag that materialises `A -- (corner) -- B` in place of the
      // operator, keeping both endpoints (anchors included) untouched.
      if (!additiveSelection) {
        const orthoCorner = resolveImplicitOrthoCornerTarget(
          snapshot.parseResult,
          snapshot.editHandles,
          resolvedTargetId,
          world,
          ORTHO_CORNER_HIT_THRESHOLD_PX / Math.max(canvasTransform.scale || 1, 1e-3)
        );
        if (orthoCorner) {
          if (!alreadySelected) {
            dispatch({ type: "SELECT", id: resolvedTargetId, additive: false });
            dispatch({
              type: "SET_FOCUSED_SCOPE",
              scopeId: resolveFocusedScopeIdForSelection(resolvedTargetId, scopeOverlay)
            });
          }
          setSnapLines([]);
          setDragState({
            kind: "ortho-corner",
            pointerId: event.pointerId,
            elementId: resolvedTargetId,
            cursor: "grabbing",
            startWorld: orthoCorner.cornerWorld,
            lastKnownWorld: orthoCorner.cornerWorld,
            historyMergeKey: makeMergeKey("drag-ortho-corner", resolvedTargetId, event.pointerId),
            baselineSource: source
          });
          return;
        }
      }

      if (!additiveSelection && (!alreadySelected || selectedElementIds.size <= 1)) {
        const orthoSegment = resolveOrthoSegmentTarget(
          snapshot.parseResult,
          snapshot.editHandles,
          resolvedTargetId,
          world,
          15 / Math.max(canvasTransform.scale || 1, 1e-3)
        );
        if (orthoSegment) {
          if (!alreadySelected) {
            dispatch({ type: "SELECT", id: resolvedTargetId, additive: false });
            dispatch({
              type: "SET_FOCUSED_SCOPE",
              scopeId: resolveFocusedScopeIdForSelection(resolvedTargetId, scopeOverlay)
            });
          }
          setSnapLines([]);
          const orthoSnapContext = snapshot.scene
            ? buildSnapContext({
                sceneElements: snapshot.scene.elements,
                selectedSourceIds: [resolvedTargetId],
                editHandles: snapshot.editHandles,
                guides: snapGuideInput,
                settings: snapSettingsPatch,
                zoom: canvasTransform.scale,
                viewportWorld: viewportWorldBounds,
                excludedSourceIds: []
              })
            : null;
          setDragState({
            kind: "ortho-segment",
            pointerId: event.pointerId,
            elementId: resolvedTargetId,
            segmentIndex: orthoSegment.segmentIndex,
            axis: orthoSegment.axis,
            cursor: orthoSegment.axis === "v" ? "ew-resize" : "ns-resize",
            startWorld: world,
            lastKnownWorld: world,
            historyMergeKey: makeMergeKey("drag-ortho-segment", resolvedTargetId, event.pointerId),
            baselineSource: source,
            snapContext: orthoSnapContext
          });
          return;
        }
      }

      const draggedIds = alreadySelected && selectedElementIds.size > 0 ? [...selectedElementIds] : [resolvedTargetId];
      if (!alreadySelected) {
        dispatch({ type: "SELECT", id: resolvedTargetId, additive: false });
        dispatch({
          type: "SET_FOCUSED_SCOPE",
          scopeId: resolveFocusedScopeIdForSelection(resolvedTargetId, scopeOverlay)
        });
        if (isAdornmentTarget || event.pointerType === "touch") {
          // On touch: selecting an unselected element doesn't immediately start a drag;
          // the user can begin a new gesture to drag once it's selected.
          setSnapLines([]);
          return;
        }
      } else if (selectedElementIds.size === 1 && selectedElementIds.has(resolvedTargetId)) {
        dispatch({
          type: "SET_FOCUSED_SCOPE",
          scopeId: resolveFocusedScopeIdForSelection(resolvedTargetId, scopeOverlay)
        });
      }

      const adornmentDragFromText =
        isAdornmentTarget &&
        region?.shape === "rect" &&
        typeof region.sceneTextKey === "string";
      startElementDrag(event.pointerId, world, draggedIds, { adornmentDragFromText });
    },
    [
      beginCanvasTextInteraction,
      dispatch,
      draggableSourceIds,
      focusedScopeId,
      interactionSvgRef,
      onBucketFillRegion,
      onNodePositionTargetPick,
      expandedDensePathSourceId,
      resolveEditableTextTarget,
      selectedElementIds,
      suppressNextBackgroundClickRef,
      setExpandedDensePathSourceId,
      setSnapLines,
      closeTextEditingSession,
      startElementDrag,
      scopeOverlay,
      snapshot.editHandles,
      svgResult,
      toolMode,
      viewportRef
    ]
  );

  const tryInsertPathWorldPoint = useCallback(
    (event: ReactMouseEvent<SVGElement>, sourceId: string): boolean => {
      if (!svgResult || snapshot.source !== source) return false;

      const resolved = resolveEligibleExplicitPath(
        source,
        sourceId,
        parseOptions ?? {
          activeFigureId:
            activeFigureId ?? (snapshot.figures.length > 1 ? null : undefined)
        }
      );
      if (resolved.kind !== "eligible") return false;
      const analysis = resolved.analysis;

      const world = clientToWorldPoint(clientPointFromEvent(event), interactionSvgRef.current, svgResult.viewBox);
      if (!world) return false;

      const result = findClosestSegmentWorldPoint(snapshot.editHandles, sourceId, analysis, world);
      if (!result) return false;

      // Threshold: 12px screen distance
      const thresholdWorld = 12 / canvasTransform.scale;
      if (result.distance > thresholdWorld) return false;

      applyActionWithFeedback({
        kind: "insertPathPoint",
        elementId: sourceId,
        segmentIndex: result.segmentIndex,
        point: result.point
      });
      return true;
    },
    [svgResult, snapshot, source, parseOptions, activeFigureId, interactionSvgRef, canvasTransform.scale, applyActionWithFeedback]
  );

  const onElementDoubleClick = useCallback(
    (event: ReactMouseEvent<SVGElement>, targetId: string, region?: HitRegion) => {
      if (toolMode !== "select") return;

      const sourceId = typeof region?.sourceId === "string" ? region.sourceId : targetId;
      const textTarget = resolveEditableTextTarget(targetId, region);

      event.preventDefault();
      event.stopPropagation();
      if (textTarget) {
        return;
      }
      viewportRef.current?.focus({ preventScroll: true });

      if (densePathSourceIds.has(sourceId)) {
        if (expandedDensePathSourceId === sourceId) {
          // Expanded dense paths should use double-click for point insertion first.
          if (tryInsertPathWorldPoint(event, sourceId)) {
            return;
          }
          // Missed insertion is a no-op; keep dense path expanded.
          return;
        }
        dispatch({ type: "SELECT", id: sourceId, additive: false });
        dispatch({
          type: "SET_FOCUSED_SCOPE",
          scopeId: resolveFocusedScopeIdForSelection(sourceId, scopeOverlay)
        });
        setExpandedDensePathSourceId(sourceId);
        closeTextEditingSession();
        return;
      }

      // Try to insert a point on a path segment
      if (tryInsertPathWorldPoint(event, sourceId)) {
        return;
      }
    },
    [
      dispatch,
      densePathSourceIds,
      scopeOverlay,
      setExpandedDensePathSourceId,
      closeTextEditingSession,
      toolMode,
      viewportRef,
      expandedDensePathSourceId,
      resolveEditableTextTarget,
      tryInsertPathWorldPoint
    ]
  );

  return {
    onElementPointerDown,
    onElementDoubleClick
  };
}

export function collectSnapExcludedSourceIds(
  draggedIds: readonly string[],
  scopeOverlay: ScopeOverlayIndex,
  sceneElements?: readonly SceneElement[]
): string[] {
  if (draggedIds.length === 0) {
    return [...draggedIds];
  }

  const selectedForSnap = new Set<string>(draggedIds);
  const draggedScopeIds = draggedIds.filter((id) => scopeOverlay.scopesById.has(id));
  if (draggedScopeIds.length > 0) {
    for (const [sourceId, ancestorScopeIds] of scopeOverlay.ancestorScopeIdsBySourceId.entries()) {
      if (draggedScopeIds.some((scopeId) => ancestorScopeIds.includes(scopeId))) {
        selectedForSnap.add(sourceId);
      }
    }
  }

  if (sceneElements && sceneElements.length > 0) {
    const candidateElements = sceneElements;
    for (const candidate of candidateElements) {
      const candidateSourceId = candidate.sourceRef.sourceId;
      if (selectedForSnap.has(candidateSourceId)) {
        continue;
      }
      for (const selectedSourceId of selectedForSnap) {
        if (isSyntheticTreeDescendantSourceId(candidateSourceId, selectedSourceId, candidate, sceneElements)) {
          selectedForSnap.add(candidateSourceId);
          break;
        }
      }
    }
  }

  return [...selectedForSnap];
}

function isSyntheticTreeDescendantSourceId(
  candidateSourceId: string,
  selectedSourceId: string,
  candidateElement?: SceneElement,
  sceneElements?: readonly SceneElement[]
): boolean {
  if (candidateSourceId.startsWith(`${selectedSourceId}:tree-child:`)) {
    return true;
  }
  if (candidateSourceId.startsWith(`${selectedSourceId}:`) || candidateSourceId.startsWith(`${selectedSourceId}-`)) {
    return true;
  }
  const pathMatch = /^path:(\d+)$/.exec(selectedSourceId);
  if (pathMatch) {
    const stmtIdx = pathMatch[1];
    if (candidateSourceId.startsWith(`node:${stmtIdx}:`)) {
      return true;
    }
  }
  if (candidateElement && sceneElements) {
    const cSpan = candidateElement.sourceRef.sourceSpan;
    for (const sEl of sceneElements) {
      if (sEl.sourceRef.sourceId === selectedSourceId) {
        const sSpan = sEl.sourceRef.sourceSpan;
        if (cSpan.from >= sSpan.from && cSpan.to <= sSpan.to) {
          return true;
        }
      }
    }
  }
  return false;
}

function findClosestSegmentWorldPoint(
  editHandles: readonly EditHandle[],
  sourceId: string,
  analysis: ExplicitPathAnalysis,
  pointer: WorldPoint
): { segmentIndex: number; point: WorldPoint; distance: number } | null {
  let best: { segmentIndex: number; point: WorldPoint; distance: number } | null = null;

  for (let i = 0; i < analysis.segments.length; i++) {
    const seg = analysis.segments[i];
    const startW = resolveAnchorWorld(editHandles, sourceId, analysis.anchors[seg.startAnchorIndex]);
    const endW = resolveAnchorWorld(editHandles, sourceId, analysis.anchors[seg.endAnchorIndex]);
    if (!startW || !endW) continue;

    let closest: { point: WorldPoint };
    if (seg.kind === "line") {
      closest = closestPointOnLine(pointer, startW, endW);
    } else if (seg.kind === "cubic") {
      const c1Item = seg.control1Index != null ? analysis.statement.items[seg.control1Index] : null;
      const c2Item = seg.control2Index != null ? analysis.statement.items[seg.control2Index] : null;
      if (c1Item?.kind !== "Coordinate" || c2Item?.kind !== "Coordinate") continue;
      const c1W = resolveControlWorld(editHandles, sourceId, c1Item.span);
      const c2W = seg.usedAnd ? resolveControlWorld(editHandles, sourceId, c2Item.span) : c1W;
      if (!c1W || !c2W) continue;
      closest = closestPointOnCubic(pointer, startW, c1W, c2W, endW);
    } else {
      continue;
    }

    const dist = Math.hypot(closest.point.x - pointer.x, closest.point.y - pointer.y);
    if (!best || dist < best.distance) {
      best = { segmentIndex: i, point: closest.point, distance: dist };
    }
  }

  return best;
}

function resolveAnchorWorld(
  editHandles: readonly EditHandle[],
  sourceId: string,
  anchor: ExplicitPathAnalysis["anchors"][number]
): WorldPoint | null {
  const handle = editHandles.find(
    (h) =>
      h.sourceRef.sourceId === sourceId &&
      h.kind === "path-point" &&
      h.sourceRef.sourceSpan.from === anchor.item.span.from &&
      h.sourceRef.sourceSpan.to === anchor.item.span.to
  );
  return handle ? handle.world : null;
}

function resolveControlWorld(
  editHandles: readonly EditHandle[],
  sourceId: string,
  span: { from: number; to: number }
): WorldPoint | null {
  const handle = editHandles.find(
    (h) =>
      h.sourceRef.sourceId === sourceId &&
      h.kind === "path-control" &&
      h.sourceRef.sourceSpan.from === span.from &&
      h.sourceRef.sourceSpan.to === span.to
  );
  return handle ? handle.world : null;
}
