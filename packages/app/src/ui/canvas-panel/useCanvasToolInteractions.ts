import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { viewportPoint, clientPoint as makeClientPoint, worldPoint, pt, px, scalarValue } from "tikz-editor/coords/index";
import { ptToCm } from "tikz-editor/coords/source";
import { buildSnapContext, collectWireSegmentsFromScene, findWireSegmentAtPoint, resolveSnapSettings, snapToolPointer, type SnapGuideInput, type SnapLine, type SnapSettingsPatch } from "tikz-editor/edit/snapping";
import type { NodeAnchorTarget } from "tikz-editor/semantic/types";
import type { ClientPoint, WorldBounds, WorldPoint } from "../coords/types";
import type { CanvasTransform, ToolMode } from "../../store/types";
import { resolveEndpointAnchorSnap, resolveWireStartSource } from "./endpoint-anchor-snap";
import { clientToWorldPoint, distanceSquared, worldToSvgPoint } from "./geometry";
import { createPathToolDraft, pathToolCloseRadiusWorld, pathToolCurrentPoint, pathToolShouldClose } from "./path-tool";
import { resolvePathEndpointSnap } from "./path-endpoint-snap";
import { createFreehandToolDraft } from "./freehand-tool";
import { isToolCreateMode } from "../tool-config";
import { formatTooltipCoordinateRows } from "./interaction-helpers";
import { assignUniqueCircuitInstanceIndex, getCircuitComponentSnippet, getPowerRailSnippetBetween } from "./circuit-snippets";
import { collectAllScopeDescendantSourceIds, type ScopeOverlayIndex } from "./scope-overlay";
import type { MatrixCellAnchorHint } from "./endpoint-anchor-snap";
import type {
  ApplyActionWithFeedbackFn,
  CanvasDispatch,
  CanvasEditParseOptions,
  CanvasSnapshot,
  DragState,
  DragTooltipState,
  FreehandToolDraft,
  MagnifierState,
  NodeAnchorOverlayState,
  PathToolDraft,
  PendingAddedSelection,
  PendingBezier,
  PendingTouchViewport,
  SnapDebugLogInput,
  StateSetter,
  ValueSetter,
  RoundedLineToolDraft,
  OrthoWireToolDraft
} from "./types";
import { unwrapPasteClusterSnippets, type PastePlacementDraft } from "./paste-cluster-builder";
import { computeWireWaypoints, formatCm, formatJunctionDotSnippet, formatTikzWireSnippet } from "./wire-routing-helper";
import { leadAxisAt, planWireRoute } from "./wire-auto-route";
import { collectSourceBounds } from "./panel-helpers";

/**
 * How close (in world pt, ~0.0035cm) a committed wire endpoint must sit to an existing segment
 * to count as a T-junction. The projection is mathematically exact, so this only needs to absorb
 * float noise -- it stays far below the 0.01cm write precision and the snap threshold, so mere
 * proximity never qualifies.
 */
const JUNCTION_TOLERANCE_WORLD = 0.1;

/**
 * While a wiring tool is active, surface EVERY connectable pin instead of only the ones inside the
 * 60px reveal radius. With proximity alone there is no way to see where a wire may go — or even
 * that a component has pins at all. Proximity still decides which pin is the active target, so the
 * `snappedAnchor` is carried over untouched.
 */
function widenAnchorOverlayForWiring(
  toolMode: ToolMode,
  proximity: NodeAnchorOverlayState | null,
  allTargets: readonly NodeAnchorTarget[]
): NodeAnchorOverlayState | null {
  if (toolMode !== "addOrthoWire" && toolMode !== "addLine" && toolMode !== "addArrow") {
    return proximity;
  }
  return {
    visibleAnchors: allTargets.filter((target) => target.tier === "basic"),
    snappedAnchor: proximity?.snappedAnchor ?? null,
    anchorStateBySourceId: proximity?.anchorStateBySourceId,
    radiusScale: proximity?.radiusScale
  };
}

export type UseCanvasToolInteractionsArgs = {
  viewportRef: RefObject<HTMLDivElement | null>;
  toolMode: ToolMode;
  pastePlacementDraft?: PastePlacementDraft | null;
  setPastePlacementDraft?: StateSetter<PastePlacementDraft | null>;
  closeTextEditingSession: () => void;
  startMarqueeSelection: (pointerId: number, clientPoint: ClientPoint, additiveSelection: boolean) => boolean;
  pendingTouchViewportRef: MutableRefObject<PendingTouchViewport | null>;
  suppressNextBackgroundClickRef: MutableRefObject<boolean>;
  svgResult: CanvasSnapshot["svg"];
  setDragState: ValueSetter<DragState | null>;
  canvasTransform: CanvasTransform;
  interactionSvgRef: RefObject<SVGSVGElement | null>;
  pendingBezier: PendingBezier | null;
  snapshot: CanvasSnapshot;
  source: string;
  setWarning: StateSetter<string | null>;
  setSnapLines: StateSetter<SnapLine[]>;
  setDragTooltip: StateSetter<DragTooltipState | null>;
  logSnapDebug: (input: SnapDebugLogInput) => void;
  snapGuideInput: SnapGuideInput;
  snapSettingsPatch: SnapSettingsPatch;
  viewportWorldBounds: WorldBounds | null;
  nodeAnchorTargets: readonly NodeAnchorTarget[];
  matrixCellAnchorHints: readonly MatrixCellAnchorHint[];
  toolCursorWorld: WorldPoint | null;
  setToolCursorWorld: StateSetter<WorldPoint | null>;
  setPathDraft: StateSetter<PathToolDraft | null>;
  setPathSegmentDraft: StateSetter<Extract<DragState, { kind: "tool-path-segment" }> | null>;
  setToolDraft: StateSetter<Extract<DragState, { kind: "tool-create" }> | null>;
  setBezierBendDraft: StateSetter<Extract<DragState, { kind: "tool-bezier-bend" }> | null>;
  setPendingBezier: StateSetter<PendingBezier | null>;
  setNodeAnchorOverlay: StateSetter<NodeAnchorOverlayState | null>;
  setFreehandDraft: StateSetter<FreehandToolDraft | null>;
  setMagnifierState: StateSetter<MagnifierState | null>;
  setDragCursorLock: StateSetter<string | null>;
  magnifierState: MagnifierState | null;
  pathDraftRef: MutableRefObject<PathToolDraft | null>;
  finalizePathDraft: (closed: boolean) => void;
  queueSelectionForAddedElement: (preferredWorld: WorldPoint, preferredSourceId?: string) => void;
  applyActionWithFeedback: ApplyActionWithFeedbackFn;
  pendingAddedSelectionRef: MutableRefObject<PendingAddedSelection | null>;
  dispatch: CanvasDispatch;
  selectedAddMatrixRows: number;
  selectedAddMatrixColumns: number;
  creationStrokeColor: string;
  pathDraft: PathToolDraft | null;
  pathSegmentDraft: Extract<DragState, { kind: "tool-path-segment" }> | null;
  dragRef: MutableRefObject<DragState | null>;
  toolDraft: Extract<DragState, { kind: "tool-create" }> | null;
  bezierBendDraft: Extract<DragState, { kind: "tool-bezier-bend" }> | null;
  freehandDraft: FreehandToolDraft | null;
  roundedLineDraft: RoundedLineToolDraft | null;
  setRoundedLineDraft: StateSetter<RoundedLineToolDraft | null>;
  orthoWireDraft: OrthoWireToolDraft | null;
  setOrthoWireDraft: StateSetter<OrthoWireToolDraft | null>;
  scopeOverlay?: ScopeOverlayIndex;
  parseOptions: CanvasEditParseOptions;
};

export function useCanvasToolInteractions(args: UseCanvasToolInteractionsArgs) {
  const {
    viewportRef,
    toolMode,
    pastePlacementDraft,
    setPastePlacementDraft,
    closeTextEditingSession,
    startMarqueeSelection,
    pendingTouchViewportRef,
    suppressNextBackgroundClickRef,
    svgResult,
    setDragState,
    canvasTransform,
    interactionSvgRef,
    pendingBezier,
    snapshot,
    source,
    setWarning,
    setSnapLines,
    setDragTooltip,
    logSnapDebug,
    snapGuideInput,
    snapSettingsPatch,
    viewportWorldBounds,
    nodeAnchorTargets,
    matrixCellAnchorHints,
    toolCursorWorld,
    setToolCursorWorld,
    setPathDraft,
    setPathSegmentDraft,
    setToolDraft,
    setBezierBendDraft,
    setPendingBezier,
    setNodeAnchorOverlay,
    setFreehandDraft,
    setMagnifierState,
    setDragCursorLock,
    magnifierState,
    pathDraftRef,
    finalizePathDraft,
    queueSelectionForAddedElement,
    applyActionWithFeedback,
    pendingAddedSelectionRef,
    dispatch,
    selectedAddMatrixRows,
    selectedAddMatrixColumns,
    creationStrokeColor,
    pathDraft,
    pathSegmentDraft,
    dragRef,
    toolDraft,
    bezierBendDraft,
    freehandDraft,
    scopeOverlay,
    parseOptions
  } = args;
  const finalizePendingTouchViewportTap = useCallback(
    (pointerId: number) => {
      const pending = pendingTouchViewportRef.current;
      if (pending?.pointerId !== pointerId) return false;
      clearTimeout(pending.timer);
      pendingTouchViewportRef.current = null;
      if (!pending.additiveSelection) {
        dispatch({ type: "CLEAR_SELECTION" });
      }
      return true;
    },
    [dispatch, pendingTouchViewportRef]
  );

  // Mirror the clipboard-placement draft size into the store so the status bar can echo
  // `Copied N components · click to place another · Esc exits`. Sourcing it from the prop means
  // every place CanvasPanel clears the draft (Esc, leaving select mode) clears the readout too.
  useEffect(() => {
    dispatch({
      type: "SET_CLIPBOARD_PLACEMENT",
      count: pastePlacementDraft ? pastePlacementDraft.snippets.length : null
    });
  }, [dispatch, pastePlacementDraft]);

  // Power rails are placed in two clicks (first end, then second end), so the first end has to
  // survive between pointer events. A ref keeps it out of the render/state plumbing; it is dropped
  // as soon as the rail tool is no longer active (Esc, tool switch, or after a completed rail).
  const powerRailStartRef = useRef<WorldPoint | null>(null);
  /**
   * Set when a right-click press was consumed by the wire tool. The contextmenu event arrives AFTER
   * the press handler has already run, and completing a wire switches the tool back to `select` -- so
   * by then the "wire tool is armed" test no longer holds and the canvas menu would pop open right on
   * top of the wire the user just drew. Remembering the consumed press closes that window.
   */
  const consumedWireRightClickRef = useRef(false);
  useEffect(() => {
    if (!toolMode.startsWith("addPowerRail")) {
      powerRailStartRef.current = null;
    }
  }, [toolMode]);

  // Mirror the wire-draft origin into the store so the status bar can render `Wire source: …`.
  // Cleared whenever there is no live wire draft: leaving the tool, finishing the wire, Esc, or
  // re-arming with the tool's own key (which drops the draft without changing the tool mode).
  useEffect(() => {
    if (toolMode !== "addOrthoWire" || !args.orthoWireDraft) {
      dispatch({ type: "SET_WIRE_SOURCE", source: null });
    }
  }, [dispatch, toolMode, args.orthoWireDraft]);

  useEffect(() => {
    function onWorldPointerMove(event: PointerEvent) {
      const pending = pendingTouchViewportRef.current;
      if (pending?.pointerId !== event.pointerId) return;
      const clientPoint = makeClientPoint(px(event.clientX), px(event.clientY));
      const dx = clientPoint.x - pending.startClient.x;
      const dy = clientPoint.y - pending.startClient.y;
      if (dx * dx + dy * dy > 16) {
        clearTimeout(pending.timer);
        pendingTouchViewportRef.current = null;
        setDragState({
          kind: "pan",
          pointerId: pending.pointerId,
          startClient: pending.startClient,
          startTransform: pending.startTransform
        });
      }
    }

    function onWorldPointerUp(event: PointerEvent) {
      finalizePendingTouchViewportTap(event.pointerId);
    }

    window.addEventListener("pointermove", onWorldPointerMove);
    window.addEventListener("pointerup", onWorldPointerUp);
    window.addEventListener("pointercancel", onWorldPointerUp);
    return () => {
      window.removeEventListener("pointermove", onWorldPointerMove);
      window.removeEventListener("pointerup", onWorldPointerUp);
      window.removeEventListener("pointercancel", onWorldPointerUp);
      const pending = pendingTouchViewportRef.current;
      if (pending) {
        clearTimeout(pending.timer);
        pendingTouchViewportRef.current = null;
      }
    };
  }, [finalizePendingTouchViewportTap, pendingTouchViewportRef, setDragState]);

  const updateInitialPlacementTooltip = useCallback(
    (event: Pick<ReactPointerEvent<SVGSVGElement>, "clientX" | "clientY">, point: WorldPoint | null) => {
      const canShow =
        point != null &&
        !toolDraft &&
        !bezierBendDraft &&
        !pathSegmentDraft &&
        !pathDraft &&
        !pendingBezier &&
        !freehandDraft &&
        (toolMode === "addNode" ||
          toolMode === "addMatrix" ||
          (isToolCreateMode(toolMode) && toolMode !== "addFreehand"));

      if (!canShow) {
        setDragTooltip(null);
        return;
      }

      setDragTooltip({
        kind: "tool-create",
        anchor: makeClientPoint(px(event.clientX), px(event.clientY)),
        rows: formatTooltipCoordinateRows(point)
      });
    },
    [bezierBendDraft, freehandDraft, pathDraft, pathSegmentDraft, pendingBezier, setDragTooltip, toolDraft, toolMode]
  );

  const onBackgroundClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement | SVGSVGElement>) => {
      if (suppressNextBackgroundClickRef.current) {
        suppressNextBackgroundClickRef.current = false;
        return;
      }
      if (toolMode !== "select" || event.target !== event.currentTarget) {
        return;
      }
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        return;
      }
      dispatch({ type: "CLEAR_SELECTION" });
    },
    [dispatch, suppressNextBackgroundClickRef, toolMode]
  );

  const onInteractionPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      viewportRef.current?.focus({ preventScroll: true });
      closeTextEditingSession();
      const additiveSelection = event.shiftKey || event.ctrlKey || event.metaKey;

      if (!svgResult) return;

      if (toolMode === "magnify" && event.button === 0) {
        setNodeAnchorOverlay(null);
        setToolCursorWorld(null);
        setSnapLines([]);
        setDragTooltip(null);
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Ignore capture failures; magnifier still works while the pointer remains over the canvas.
        }
        const viewport = viewportRef.current;
        if (!viewport) {
          return;
        }
        const rect = viewport.getBoundingClientRect();
        const clientPoint = makeClientPoint(px(event.clientX), px(event.clientY));
        setMagnifierState({
          pointerId: event.pointerId,
          center: viewportPoint(px(clientPoint.x - rect.left), px(clientPoint.y - rect.top))
        });
        setDragCursorLock("none");
        event.preventDefault();
        return;
      }

      const canPan = event.button === 1 || (event.button === 0 && event.altKey);
      if (canPan) {
        const clientPoint = makeClientPoint(px(event.clientX), px(event.clientY));
        setDragState({
          kind: "pan",
          pointerId: event.pointerId,
          startClient: clientPoint,
          startTransform: canvasTransform
        });
        event.preventDefault();
        return;
      }

      // A right-click while the wire tool is armed is the 45° gesture: press M, then right-click the
      // two pins. It rides the SAME pick path as a left click -- anchor snapping, the two-click
      // pin-to-pin route, the fallback hand routing -- with the routing mode forced to octagonal45.
      // The contextmenu handler suppresses the canvas menu for this tool, so the two never fight.
      const wireRightClick = event.button === 2 && toolMode === "addOrthoWire";
      if ((event.button === 0 || wireRightClick) && (toolMode !== "select" || pastePlacementDraft)) {
        const clientPoint = makeClientPoint(px(event.clientX), px(event.clientY));
        const world = clientToWorldPoint(clientPoint, interactionSvgRef.current, svgResult.viewBox);
        if (!world) {
          return;
        }

        if (pastePlacementDraft) {
          event.preventDefault();
          event.stopPropagation();
          setDragTooltip(null);
          const bypassSnap = event.ctrlKey || event.metaKey;
          const snapContext = snapshot.scene
            ? buildSnapContext({
                sceneElements: snapshot.scene.elements,
                selectedSourceIds: [],
                editHandles: snapshot.editHandles,
                nodeAnchorTargets,
                guides: snapGuideInput,
                settings: snapSettingsPatch,
                zoom: canvasTransform.scale,
                viewportWorld: viewportWorldBounds
              })
            : null;
          const snapResult = snapContext
            ? snapToolPointer({
                context: snapContext,
                pointer: world,
                kind: "node",
                modifiers: { ctrlOrMeta: bypassSnap }
              })
            : { snappedPoint: world, offset: undefined, lines: [] as SnapLine[] };
          const snapSettings = resolveSnapSettings(snapSettingsPatch);
          const previewToleranceWorld = snapSettings.thresholdPx / Math.max(canvasTransform.scale, 1e-6);
          const previewMatchesClick =
            !bypassSnap &&
            toolCursorWorld != null &&
            distanceSquared(world, toolCursorWorld) <= previewToleranceWorld * previewToleranceWorld;
          const nodeAt = previewMatchesClick ? toolCursorWorld : (snapResult.snappedPoint ?? world);

          const activeAnchor =
            pastePlacementDraft.candidateAnchors[pastePlacementDraft.activeAnchorIndex] ??
            pastePlacementDraft.candidateAnchors[0];
          if (activeAnchor) {
            setToolCursorWorld(nodeAt);
            const deltaX = nodeAt.x - activeAnchor.world.x;
            const deltaY = nodeAt.y - activeAnchor.world.y;
            const deltaXCm = scalarValue(ptToCm(pt(deltaX)));
            const deltaYCm = scalarValue(ptToCm(pt(deltaY)));
            const flatSnippets = unwrapPasteClusterSnippets(
              pastePlacementDraft.snippets,
              deltaXCm,
              deltaYCm
            );
            const ok = applyActionWithFeedback({
              kind: "pasteStatements",
              snippets: flatSnippets,
              delta: worldPoint(pt(0), pt(0))
            });
            if (!ok.sourceChanged) {
              pendingAddedSelectionRef.current = null;
            }
            if (ok.sourceChanged) {
              suppressNextBackgroundClickRef.current = true;
              setSnapLines([]);
              // "SELECT_ELEMENTS" is not a real action type, so this clear silently did nothing.
              dispatch({ type: "SELECT_RANGE", ids: [] });
            }
          }
          return;
        }
        if (toolMode === "addBucket") {
          setToolCursorWorld(null);
          setNodeAnchorOverlay(null);
          setSnapLines([]);
          setDragTooltip(null);
          setWarning("Cannot fill the tikzpicture background.");
          event.preventDefault();
          return;
        }
        const drawDragKind: DragState["kind"] =
          toolMode === "addPath"
            ? "tool-path-segment"
            : toolMode === "addFreehand"
              ? "tool-freehand"
            : toolMode === "addBezier" && pendingBezier
              ? "tool-bezier-bend"
              : "tool-create";
        if (snapshot.source !== source) {
          setWarning("Wait for recompute to finish before starting a draw gesture.");
          setSnapLines([]);
          logSnapDebug({
            phase: "tool-start",
            note: "blocked: snapshot/source mismatch",
            snapshotMatchesSource: false,
            dragKind: drawDragKind,
            rawPoint: world,
            lines: []
          });
          return;
        }
        const shouldSnapToolStart = toolMode !== "addFreehand";
        const scopeInternalSourceIds = scopeOverlay ? collectAllScopeDescendantSourceIds(scopeOverlay) : undefined;
        const toolSnapContext = shouldSnapToolStart && snapshot.scene
          ? buildSnapContext({
              sceneElements: snapshot.scene.elements,
              selectedSourceIds: [],
              editHandles: snapshot.editHandles,
              nodeAnchorTargets,
              guides: snapGuideInput,
              settings: snapSettingsPatch,
              zoom: canvasTransform.scale,
              viewportWorld: viewportWorldBounds,
              excludedSourceIds: scopeInternalSourceIds
            })
          : null;
        const startSnapResult = toolSnapContext && shouldSnapToolStart
          ? snapToolPointer({
              context: toolSnapContext,
              pointer: world,
              kind: toolMode === "addPath" ? "line-end" : "node",
              modifiers: { ctrlOrMeta: event.ctrlKey || event.metaKey }
            })
          : { snappedPoint: world, offset: undefined, lines: [] as SnapLine[] };
        const snappedStart = startSnapResult.snappedPoint ?? world;
        const lineToolStartAnchorSnap =
          toolMode === "addLine" || toolMode === "addArrow" || toolMode === "addPath" || toolMode === "addOrthoWire"
            ? resolveEndpointAnchorSnap({
                pointerWorld: world,
                zoom: toolSnapContext?.zoom ?? canvasTransform.scale,
                nodeAnchorTargets,
                matrixCellAnchorHints
              })
            : null;
        const startEndpointAnchor = lineToolStartAnchorSnap?.snappedAnchor ?? null;
        const resolvedStart = startEndpointAnchor?.world ?? snappedStart;

        setToolCursorWorld(resolvedStart);
        event.preventDefault();

        if (toolMode === "addFreehand") {
          const nextFreehandDraft = createFreehandToolDraft(resolvedStart, canvasTransform.scale);
          setPathDraft(null);
          setPathSegmentDraft(null);
          setToolDraft(null);
          setBezierBendDraft(null);
          setPendingBezier(null);
          setSnapLines([]);
          setNodeAnchorOverlay(null);
          setFreehandDraft(nextFreehandDraft);
          setDragTooltip(null);
          const nextFreehandDrag: Extract<DragState, { kind: "tool-freehand" }> = {
            kind: "tool-freehand",
            pointerId: event.pointerId,
            points: nextFreehandDraft.points,
            minSampleDistanceWorld: nextFreehandDraft.minSampleDistanceWorld
          };
          setDragState(nextFreehandDrag);
          logSnapDebug({
            phase: "tool-freehand-start",
            snapshotMatchesSource: true,
            dragKind: "tool-freehand",
            rawPoint: world,
            snappedPoint: resolvedStart,
            lines: []
          });
          return;
        }

        if (toolMode === "addRoundedLine") {
          const activeDraft = args.roundedLineDraft;
          if (!activeDraft) {
            args.setRoundedLineDraft({ startWorld: resolvedStart });
            setSnapLines(startSnapResult.lines);
            return;
          }

          const snippet = `\\draw[thick, line cap=round] (${formatCm(activeDraft.startWorld.x)},${formatCm(activeDraft.startWorld.y)}) -- (${formatCm(resolvedStart.x)},${formatCm(resolvedStart.y)});\n`;
          const ok = applyActionWithFeedback({
            kind: "pasteStatements",
            snippets: [snippet],
            delta: worldPoint(pt(0), pt(0))
          });
          args.setRoundedLineDraft(null);
          dispatch({ type: "SET_TOOL_MODE", mode: "select" });
          setToolCursorWorld(null);
          setSnapLines([]);
          return;
        }

        if (toolMode === "addOrthoWire") {
          if (wireRightClick) {
            consumedWireRightClickRef.current = true;
          }
          const activeDraft = args.orthoWireDraft;
          if (!activeDraft) {
            // Classify the origin (pin / trunk mid-span / junction dot / empty grid) before the
            // draft exists, then mirror it into the store so the status bar can echo it.
            const wireStart = resolveWireStartSource({
              pointerWorld: world,
              startWorld: resolvedStart,
              snappedAnchor: startEndpointAnchor,
              sceneElements: snapshot.scene?.elements ?? [],
              zoom: toolSnapContext?.zoom ?? canvasTransform.scale
            });
            args.setOrthoWireDraft({
              currentWorld: wireStart.world,
              startAnchor: startEndpointAnchor,
              // A right-click always means the 45° connection, so it also fixes the mode that the
              // completion click reads back off the draft.
              ...(wireRightClick ? { routingMode: "octagonal45" as const } : {}),
              emittedLegs: 0
            });
            dispatch({
              type: "SET_WIRE_SOURCE",
              source: { kind: wireStart.kind, id: wireStart.id }
            });
            setToolCursorWorld(wireStart.world);
            setSnapLines(startSnapResult.lines);
            return;
          }

          // A right-click forces the 45° connection regardless of what Shift+F3 last selected.
          const mode = wireRightClick ? "octagonal45" : activeDraft.routingMode ?? "orthogonal";
          const orientation = activeDraft.orientation;
          const emittedLegs = activeDraft.emittedLegs ?? 0;

          // Two-click connection: when both ends are pins, lay the whole route in ONE action instead
          // of making the user click once per leg. Hand routing (an end that is not a pin) keeps the
          // documented "one click, one segment" feel.
          //
          // Only when NO leg has been emitted yet. If the user already hand-placed a waypoint, this
          // must fall through to the per-leg path — re-planning from the origin here would draw a
          // second, overlapping wire and discard the waypoint they just chose.
          const routeAnchorKey = (
            anchor: { nodeSourceId?: string | null; nodeName?: string } | null | undefined
          ): string => (anchor ? `${anchor.nodeSourceId || ""}|${anchor.nodeName ?? ""}` : "");
          const originAnchorForRoute = activeDraft.startAnchor ?? null;
          const targetAnchor =
            emittedLegs === 0 &&
            originAnchorForRoute &&
            startEndpointAnchor &&
            routeAnchorKey(startEndpointAnchor) !== routeAnchorKey(originAnchorForRoute)
              ? startEndpointAnchor
              : null;
          if (originAnchorForRoute && targetAnchor && snapshot.svg?.viewBox) {
            const routeViewBox = snapshot.svg.viewBox;
            const sceneElements = snapshot.scene?.elements ?? [];
            const sceneSegments = collectWireSegmentsFromScene(sceneElements);
            const route = planWireRoute({
              start: originAnchorForRoute.world,
              end: targetAnchor.world,
              viewBox: routeViewBox,
              mode,
              orientation,
              // Leave each pin along its own lead's direction and arrive along the other's — a wire
              // that turns 90° right at the pin reads as a wrong connection.
              startLeadAxis: leadAxisAt(originAnchorForRoute.world, sceneSegments),
              endLeadAxis: leadAxisAt(targetAnchor.world, sceneSegments),
              obstacles: [...collectSourceBounds(sceneElements, routeViewBox).values()],
              existingSegments: sceneSegments.map((segment) => {
                const a = worldToSvgPoint(segment.p1, routeViewBox);
                const b = worldToSvgPoint(segment.p2, routeViewBox);
                return { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
              })
            });
            const snippet = formatTikzWireSnippet(route, {
              fromAnchor: { nodeName: originAnchorForRoute.nodeName, anchor: originAnchorForRoute.anchor },
              toAnchor: { nodeName: targetAnchor.nodeName, anchor: targetAnchor.anchor }
            });
            applyActionWithFeedback({
              kind: "pasteStatements",
              snippets: [snippet],
              delta: worldPoint(pt(0), pt(0))
            });
            args.setOrthoWireDraft(null);
            dispatch({ type: "SET_TOOL_MODE", mode: "select" });
            setToolCursorWorld(null);
            setSnapLines([]);
            setNodeAnchorOverlay(null);
            return;
          }

          const dx = Math.abs(resolvedStart.x - activeDraft.currentWorld.x);
          const dy = Math.abs(resolvedStart.y - activeDraft.currentWorld.y);

          // 默认（没用 Space 显式选过朝向）沿用历史规则：拐角跟着位移大的那一轴走。
          // 一旦显式选了 HV/VH，就以它为准；45°/任意角根本不用这个朝向。
          const waypoints =
            mode === "orthogonal" && !orientation
              ? [
                  activeDraft.currentWorld,
                  dx >= dy
                    ? worldPoint(pt(resolvedStart.x), pt(activeDraft.currentWorld.y))
                    : worldPoint(pt(activeDraft.currentWorld.x), pt(resolvedStart.y)),
                  resolvedStart
                ]
              : computeWireWaypoints(activeDraft.currentWorld, resolvedStart, mode, orientation ?? "HV");

          const originAnchor = activeDraft.startAnchor ?? null;
          const anchorKey = (
            anchor: { nodeSourceId?: string | null; nodeName?: string } | null | undefined
          ): string => (anchor ? `${anchor.nodeSourceId || ""}\u0000${anchor.nodeName ?? ""}` : "");

          // Virtuoso-aligned wire handfeel:
          // 1. If clicking in empty space, user is dropping a corner waypoint: commit the first leg and continue.
          // 2. If clicking directly onto a pin (isEndingOnPin), commit the entire route to the pin in one atomic action!
          const isEndingOnPin =
            startEndpointAnchor != null &&
            anchorKey(startEndpointAnchor) !== anchorKey(originAnchor);

          const leg = mode === "orthogonal" && !isEndingOnPin ? waypoints.slice(0, 2) : waypoints;
          const nextPoint = leg[leg.length - 1];
          if (Math.abs(nextPoint.x - activeDraft.currentWorld.x) < 1e-3 && Math.abs(nextPoint.y - activeDraft.currentWorld.y) < 1e-3) {
            return;
          }

          // 首尾写成锚点引用，让导线真正"长在引脚上"——挪动元件时跟着走。
          // 起点锚点只属于第一段；之后各段从上一段末端（普通坐标）续画。
          const fromAnchor =
            emittedLegs === 0 && originAnchor
              ? { nodeName: originAnchor.nodeName, anchor: originAnchor.anchor }
              : null;

          // 本段末端正落在某个引脚上时，写成锚点引用并收线。
          // 身份比较以 nodeName 兜底：纯 \coordinate 引脚的 nodeSourceId 是空串，
          // 只比 sourceId 会把两个不同引脚误认成同一个。
          const endsOnPin =
            startEndpointAnchor != null &&
            Math.abs(startEndpointAnchor.world.x - nextPoint.x) < 1e-6 &&
            Math.abs(startEndpointAnchor.world.y - nextPoint.y) < 1e-6;
          const landingAnchor =
            endsOnPin && anchorKey(startEndpointAnchor) !== anchorKey(originAnchor)
              ? startEndpointAnchor
              : null;
          const toAnchor = landingAnchor
            ? { nodeName: landingAnchor.nodeName, anchor: landingAnchor.anchor }
            : null;

          const snippet = formatTikzWireSnippet(leg, { fromAnchor, toAnchor });

          // Landing on the trunk of an existing wire is a T-junction. The dot goes into the
          // SAME action as the segment so a single undo removes both.
          const snippets = [snippet];
          if (snapshot.scene) {
            const host = findWireSegmentAtPoint(
              nextPoint,
              collectWireSegmentsFromScene(snapshot.scene.elements),
              JUNCTION_TOLERANCE_WORLD
            );
            if (host) {
              snippets.push(formatJunctionDotSnippet(nextPoint));
            }
          }

          applyActionWithFeedback({
            kind: "pasteStatements",
            snippets,
            delta: worldPoint(pt(0), pt(0))
          });

          if (landingAnchor) {
            args.setOrthoWireDraft(null);
            dispatch({ type: "SET_TOOL_MODE", mode: "select" });
            setToolCursorWorld(null);
            setSnapLines([]);
            setNodeAnchorOverlay(null);
            return;
          }

          args.setOrthoWireDraft({
            currentWorld: nextPoint,
            startAnchor: originAnchor,
            routingMode: activeDraft.routingMode,
            orientation: activeDraft.orientation,
            emittedLegs: emittedLegs + 1
          });
          setToolCursorWorld(nextPoint);
          setSnapLines(startSnapResult.lines);
          return;
        }

        if (toolMode === "addPath") {
          const activeDraft = pathDraftRef.current;
          if (!activeDraft) {
            // Check if click is near an endpoint of an existing open path
            const endpointSnap = snapshot.editHandles.length > 0
              ? resolvePathEndpointSnap({
                  pointerWorld: resolvedStart,
                  zoom: canvasTransform.scale,
                  editHandles: snapshot.editHandles,
                  source,
                  parseOptions
                })
              : null;
            const appendTarget = endpointSnap
              ? { elementId: endpointSnap.elementId, end: endpointSnap.end }
              : undefined;
            const draftStart = endpointSnap ? endpointSnap.world : resolvedStart;
            setPathDraft(
              createPathToolDraft(
                draftStart,
                appendTarget,
                endpointSnap || !startEndpointAnchor
                  ? undefined
                  : {
                      nodeName: startEndpointAnchor.nodeName,
                      nodeSourceId: startEndpointAnchor.nodeSourceId,
                      anchor: startEndpointAnchor.anchor
                    }
              )
            );
            setPathSegmentDraft(null);
            setToolDraft(null);
            setBezierBendDraft(null);
            setSnapLines(startSnapResult.lines);
            logSnapDebug({
              phase: "tool-path-start",
              snapshotMatchesSource: true,
              dragKind: null,
              context: toolSnapContext,
              rawPoint: world,
              snappedPoint: draftStart,
              offset: startSnapResult.offset,
              lines: startSnapResult.lines
            });
            return;
          }

          const closeRadiusWorld = pathToolCloseRadiusWorld(canvasTransform.scale);
          if (pathToolShouldClose(activeDraft, resolvedStart, closeRadiusWorld)) {
            finalizePathDraft(true);
            return;
          }

          if (event.detail >= 2) {
            finalizePathDraft(false);
            return;
          }

          const segmentStart = pathToolCurrentPoint(activeDraft);
          if (distanceSquared(segmentStart, resolvedStart) <= 1e-6) {
            setSnapLines(startSnapResult.lines);
            return;
          }

          const midpoint = worldPoint(
            pt((segmentStart.x + resolvedStart.x) / 2),
            pt((segmentStart.y + resolvedStart.y) / 2)
          );
          const nextPathSegmentDraft: Extract<DragState, { kind: "tool-path-segment" }> = {
            kind: "tool-path-segment",
            pointerId: event.pointerId,
            startWorld: segmentStart,
            endWorld: resolvedStart,
            endEndpointAnchor: startEndpointAnchor,
            startPointerWorld: resolvedStart,
            rawBendWorld: midpoint,
            bendWorld: midpoint,
            isBending: false,
            snapContext: toolSnapContext
          };
          setNodeAnchorOverlay(null);
          setToolDraft(null);
          setBezierBendDraft(null);
          setPathSegmentDraft(nextPathSegmentDraft);
          setDragState(nextPathSegmentDraft);
          setSnapLines([]);
          logSnapDebug({
            phase: "tool-path-segment-start",
            snapshotMatchesSource: true,
            dragKind: "tool-path-segment",
            context: toolSnapContext,
            rawPoint: world,
            snappedPoint: resolvedStart,
            offset: startSnapResult.offset,
            lines: startSnapResult.lines
          });
          return;
        }

        if (toolMode === "addBezier" && pendingBezier) {
          const bendSnap = toolSnapContext
            ? snapToolPointer({
                context: toolSnapContext,
                pointer: world,
                kind: "line-end",
                modifiers: { ctrlOrMeta: event.ctrlKey || event.metaKey }
              })
            : { snappedPoint: world, offset: undefined, lines: [] as SnapLine[] };
          const bendStart = bendSnap.snappedPoint ?? world;
          setToolCursorWorld(bendStart);
          setSnapLines([]);
          const nextBendDraft: Extract<DragState, { kind: "tool-bezier-bend" }> = {
            kind: "tool-bezier-bend",
            pointerId: event.pointerId,
            startWorld: pendingBezier.startWorld,
            endWorld: pendingBezier.endWorld,
            rawCurrentWorld: bendStart,
            currentWorld: bendStart,
            snapContext: toolSnapContext
          };
          setDragState(nextBendDraft);
          setBezierBendDraft(nextBendDraft);
          logSnapDebug({
            phase: "tool-bezier-bend-start",
            snapshotMatchesSource: true,
            dragKind: "tool-bezier-bend",
            context: toolSnapContext,
            rawPoint: world,
            snappedPoint: bendStart,
            offset: bendSnap.offset,
            lines: bendSnap.lines
          });
          return;
        }

        if (
          toolMode === "addNode" ||
          toolMode === "addMatrix" ||
          toolMode.startsWith("addResistor") ||
          toolMode.startsWith("addNMOS") ||
          toolMode.startsWith("addPMOS") ||
          toolMode.startsWith("addDotNode") ||
          toolMode.startsWith("addIoNode") ||
          toolMode === "addVDD" ||
          toolMode.startsWith("addCapacitor") ||
          toolMode.startsWith("addGND") ||
          toolMode.startsWith("addCurrentSource") ||
          toolMode.startsWith("addControlledCurrentSource") ||
          toolMode.startsWith("addVoltageSource") ||
          toolMode.startsWith("addCurrentArrow") ||
          toolMode.startsWith("addWireLead") ||
          toolMode.startsWith("addPowerRail")
        ) {
          event.preventDefault();
          event.stopPropagation();
          setDragTooltip(null);
          const bypassSnap = event.ctrlKey || event.metaKey;
          const snapResult = toolSnapContext
              ? snapToolPointer({
                  context: toolSnapContext,
                  pointer: world,
                  kind: "node",
                  modifiers: { ctrlOrMeta: bypassSnap }
                })
              : { snappedPoint: world, offset: undefined, lines: [] as SnapLine[] };
          const snapSettings = resolveSnapSettings(snapSettingsPatch);
          const previewToleranceWorld = snapSettings.thresholdPx / Math.max(canvasTransform.scale, 1e-6);
          const previewMatchesClick =
            !bypassSnap &&
            toolCursorWorld != null &&
            distanceSquared(world, toolCursorWorld) <= previewToleranceWorld * previewToleranceWorld;
          const nodeAt = previewMatchesClick ? toolCursorWorld : snapResult.snappedPoint ?? world;
          setSnapLines(snapResult.lines);
          logSnapDebug({
            phase: "tool-add-node",
            snapshotMatchesSource: true,
            dragKind: null,
            context: toolSnapContext,
            rawPoint: world,
            snappedPoint: nodeAt,
            offset: snapResult.offset,
            lines: snapResult.lines
          });

          if (
            toolMode.startsWith("addResistor") ||
            toolMode.startsWith("addNMOS") ||
            toolMode.startsWith("addPMOS") ||
            toolMode.startsWith("addDotNode") ||
            toolMode.startsWith("addIoNode") ||
            toolMode === "addVDD" ||
            toolMode.startsWith("addCapacitor") ||
            toolMode.startsWith("addGND") ||
            toolMode.startsWith("addCurrentSource") ||
            toolMode.startsWith("addControlledCurrentSource") ||
            toolMode.startsWith("addVoltageSource") ||
            toolMode.startsWith("addCurrentArrow") ||
            toolMode.startsWith("addWireLead") ||
            toolMode.startsWith("addPowerRail")
          ) {
            // Power rail is a two-point shape (first end, then second end): the first click just
            // arms the draft, the second closes the rail with the length-scaled taps.
            if (toolMode.startsWith("addPowerRail")) {
              const railStart = powerRailStartRef.current;
              if (!railStart) {
                powerRailStartRef.current = nodeAt;
                setToolCursorWorld(nodeAt);
                setSnapLines([]);
                logSnapDebug({
                  phase: "tool-power-rail-start",
                  snapshotMatchesSource: true,
                  dragKind: null,
                  rawPoint: world,
                  snappedPoint: nodeAt,
                  lines: []
                });
                return;
              }
              const toCm = (value: number) => value / 28.4527559;
              const rawSnippet = getPowerRailSnippetBetween(
                toCm(railStart.x),
                toCm(railStart.y),
                toCm(nodeAt.x),
                toCm(nodeAt.y)
              );
              const snippet = assignUniqueCircuitInstanceIndex(rawSnippet, source);
              queueSelectionForAddedElement(nodeAt);
              const ok = applyActionWithFeedback({
                kind: "pasteStatements",
                snippets: [snippet],
                delta: worldPoint(pt(0), pt(0))
              });
              if (!ok.sourceChanged) {
                pendingAddedSelectionRef.current = null;
                return;
              }
              suppressNextBackgroundClickRef.current = true;
              powerRailStartRef.current = null;
              dispatch({ type: "SET_TOOL_MODE", mode: "select" });
              setToolCursorWorld(null);
              setSnapLines([]);
              return;
            }

            const xCm = formatCm(nodeAt.x);
            const yCm = formatCm(nodeAt.y);
            const rawSnippet = getCircuitComponentSnippet(toolMode, xCm, yCm);
            if (!rawSnippet) return;
            const snippet = assignUniqueCircuitInstanceIndex(rawSnippet, source);

            queueSelectionForAddedElement(nodeAt);
            const ok = applyActionWithFeedback({
              kind: "pasteStatements",
              snippets: [snippet],
              delta: worldPoint(pt(0), pt(0))
            });
            if (!ok.sourceChanged) {
              pendingAddedSelectionRef.current = null;
            }
            if (ok.sourceChanged) {
              suppressNextBackgroundClickRef.current = true;
              const isSticky = toolMode.startsWith("addNMOS") || toolMode.startsWith("addPMOS");
              if (!isSticky) {
                dispatch({ type: "SET_TOOL_MODE", mode: "select" });
              }
              // Sticky placement: nMOS and pMOS stay armed so the next click stamps another part;
              // other components exit back to select mode so ghost preview does not appear again.
              setToolDraft(null);
              setToolCursorWorld(null);
              setSnapLines([]);
            }
            return;
          }

          if (toolMode !== "addMatrix") {
            queueSelectionForAddedElement(nodeAt);
          }
          const ok = applyActionWithFeedback({
            kind: "addElement",
            template: toolMode === "addMatrix"
              ? {
                  kind: "matrix",
                  rows: selectedAddMatrixRows,
                  columns: selectedAddMatrixColumns,
                  matrixKind: "nodes"
                }
              : { kind: "node", strokeColor: creationStrokeColor },
            at: nodeAt
          });
          if (!ok.sourceChanged) {
            pendingAddedSelectionRef.current = null;
          }
          if (ok.sourceChanged) {
            suppressNextBackgroundClickRef.current = true;
            dispatch({ type: "SET_TOOL_MODE", mode: "select" });
            setToolDraft(null);
            setToolCursorWorld(null);
            setSnapLines([]);
          }
          return;
        }

        if (isToolCreateMode(toolMode)) {
          setDragTooltip(null);
          setSnapLines([]);
          const nextDraft: Extract<DragState, { kind: "tool-create" }> = {
            kind: "tool-create",
            pointerId: event.pointerId,
            toolMode,
            startWorld: resolvedStart,
            startEndpointAnchor,
            rawCurrentWorld: resolvedStart,
            currentWorld: resolvedStart,
            activeEndpointAnchor: null,
            snapContext: toolSnapContext
          };
          setNodeAnchorOverlay(
            lineToolStartAnchorSnap && lineToolStartAnchorSnap.visibleAnchors.length > 0
              ? lineToolStartAnchorSnap
              : null
          );
          setBezierBendDraft(null);
          setDragState(nextDraft);
          setToolDraft(nextDraft);
          logSnapDebug({
            phase: "tool-start",
            snapshotMatchesSource: true,
            dragKind: "tool-create",
            context: toolSnapContext,
            rawPoint: world,
            snappedPoint: resolvedStart,
            lines: []
          });
        }
        return;
      }

      if (toolMode === "select" && event.button === 0 && event.target === event.currentTarget) {
        if (event.pointerType === "touch") {
          const pending = pendingTouchViewportRef.current;
          if (!event.isPrimary || (pending && pending.pointerId !== event.pointerId)) {
            if (pending) {
              clearTimeout(pending.timer);
              pendingTouchViewportRef.current = null;
            }
            if (dragRef.current?.kind === "pan" || dragRef.current?.kind === "marquee") {
              setDragState(null);
            }
            event.preventDefault();
            return;
          }
          // On touch: moving immediately pans the canvas; marquee only opens after a long press.
          const touchWorldPointerId = event.pointerId;
          const touchClientPoint = makeClientPoint(px(event.clientX), px(event.clientY));
          const timer = setTimeout(() => {
            if (pendingTouchViewportRef.current?.pointerId === touchWorldPointerId) {
              pendingTouchViewportRef.current = null;
              startMarqueeSelection(touchWorldPointerId, touchClientPoint, additiveSelection);
            }
          }, 400);
          pendingTouchViewportRef.current = {
            pointerId: touchWorldPointerId,
            startClient: touchClientPoint,
            additiveSelection,
            startTransform: canvasTransform,
            timer
          };
          event.preventDefault();
        } else {
          const clientPoint = makeClientPoint(px(event.clientX), px(event.clientY));
          if (startMarqueeSelection(event.pointerId, clientPoint, additiveSelection)) {
            event.preventDefault();
          }
        }
      }
    },
    [
      applyActionWithFeedback,
      canvasTransform,
      dispatch,
      creationStrokeColor,
      finalizePathDraft,
      logSnapDebug,
      queueSelectionForAddedElement,
      setDragState,
      setNodeAnchorOverlay,
      selectedAddMatrixRows,
      selectedAddMatrixColumns,
      snapshot.scene,
      snapshot.source,
      snapshot.editHandles,
      source,
      svgResult,
      startMarqueeSelection,
      nodeAnchorTargets,
      matrixCellAnchorHints,
      pendingBezier,
      toolMode,
      toolCursorWorld,
      snapGuideInput,
      snapSettingsPatch,
      viewportWorldBounds,
      interactionSvgRef,
      dragRef,
      pathDraftRef,
      setBezierBendDraft,
      setFreehandDraft,
      setMagnifierState,
      setDragCursorLock,
      setPathDraft,
      setPathSegmentDraft,
      setPendingBezier,
      setSnapLines,
      setDragTooltip,
      closeTextEditingSession,
      setToolCursorWorld,
      // The callback closes over args, so the in-progress wire draft must be a dependency.
      // Without it, clearing the draft from the keyboard handler is invisible here and the
      // next click extends the previous wire instead of starting a new one.
      args.orthoWireDraft,
      setToolDraft,
      setWarning,
      parseOptions,
      viewportRef,
      pendingAddedSelectionRef,
      suppressNextBackgroundClickRef,
      pendingTouchViewportRef
    ]
  );

  const onViewportPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      viewportRef.current?.focus({ preventScroll: true });
      if (event.button !== 0 || event.target !== event.currentTarget) {
        return;
      }
      if (toolMode !== "select" || pastePlacementDraft) {
        if (toolMode !== "magnify") {
          onInteractionPointerDown(event as unknown as ReactPointerEvent<SVGSVGElement>);
        }
        return;
      }
      closeTextEditingSession();
      const additiveSelection = event.shiftKey || event.ctrlKey || event.metaKey;
      const clientPoint = makeClientPoint(px(event.clientX), px(event.clientY));
      if (startMarqueeSelection(event.pointerId, clientPoint, additiveSelection)) {
        event.preventDefault();
      }
    },
    [closeTextEditingSession, onInteractionPointerDown, pastePlacementDraft, startMarqueeSelection, toolMode, viewportRef]
  );

  const onInteractionPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!svgResult || (toolMode === "select" && !pastePlacementDraft)) {
        setNodeAnchorOverlay(null);
        setDragTooltip(null);
        return;
      }
      if (toolMode === "magnify") {
        const magnifier = magnifierState;
        if (magnifier?.pointerId !== event.pointerId) {
          setNodeAnchorOverlay(null);
          setToolCursorWorld(null);
          setSnapLines([]);
          setDragTooltip(null);
          return;
        }
        const viewport = viewportRef.current;
        if (!viewport) {
          return;
        }
        const rect = viewport.getBoundingClientRect();
        const clientPoint = makeClientPoint(px(event.clientX), px(event.clientY));
        setMagnifierState({
          pointerId: magnifier.pointerId,
          center: viewportPoint(px(clientPoint.x - rect.left), px(clientPoint.y - rect.top))
        });
        event.preventDefault();
        return;
      }
      if (toolMode === "addBucket") {
        setToolCursorWorld(null);
        setNodeAnchorOverlay(null);
        setSnapLines([]);
        setDragTooltip(null);
        return;
      }
      if (pathSegmentDraft) {
        return;
      }

      const clientPoint = makeClientPoint(px(event.clientX), px(event.clientY));
      const world = clientToWorldPoint(clientPoint, interactionSvgRef.current, svgResult.viewBox);
      if (!world) {
        setNodeAnchorOverlay(null);
        setDragTooltip(null);
        return;
      }
      if (toolMode === "addFreehand") {
        setToolCursorWorld(world);
        setNodeAnchorOverlay(null);
        setSnapLines([]);
        setDragTooltip(null);
        logSnapDebug({
          phase: "tool-hover-move",
          snapshotMatchesSource: snapshot.source === source,
          dragKind: dragRef.current?.kind ?? null,
          rawPoint: world,
          lines: []
        });
        return;
      }
      if (!snapshot.scene || snapshot.source !== source) {
        setToolCursorWorld(world);
        setNodeAnchorOverlay(null);
        setSnapLines([]);
        updateInitialPlacementTooltip(event, world);
        logSnapDebug({
          phase: "tool-hover-move",
          note: !snapshot.scene ? "no scene available" : "stale snapshot/source mismatch",
          snapshotMatchesSource: snapshot.source === source,
          dragKind: null,
          rawPoint: world,
          lines: []
        });
        return;
      }

      const scopeInternalSourceIds = scopeOverlay ? collectAllScopeDescendantSourceIds(scopeOverlay) : undefined;
      const snapContext = buildSnapContext({
        sceneElements: snapshot.scene.elements,
        selectedSourceIds: [],
        editHandles: snapshot.editHandles,
        nodeAnchorTargets,
        guides: snapGuideInput,
        settings: snapSettingsPatch,
        zoom: canvasTransform.scale,
        viewportWorld: viewportWorldBounds,
        excludedSourceIds: scopeInternalSourceIds
      });
      const snapped = snapToolPointer({
        context: snapContext,
        pointer: world,
        kind: toolMode === "addPath" ? "line-end" : "node",
        modifiers: { ctrlOrMeta: event.ctrlKey || event.metaKey }
      });
      const showNodeAnchors =
        !toolDraft &&
        !bezierBendDraft &&
        !pathSegmentDraft &&
        (toolMode === "addLine" || toolMode === "addArrow" || toolMode === "addPath" || toolMode === "addOrthoWire");
      const hoverEndpointAnchorOverlay = showNodeAnchors
        ? resolveEndpointAnchorSnap({
            pointerWorld: world,
            zoom: snapContext.zoom,
            nodeAnchorTargets,
            matrixCellAnchorHints
          })
        : null;
      const hoverAnchorOverlay = widenAnchorOverlayForWiring(
        toolMode,
        hoverEndpointAnchorOverlay,
        nodeAnchorTargets
      );
      const hoverEndpointAnchor = hoverEndpointAnchorOverlay?.snappedAnchor ?? null;
      const hoverPathEndpoint =
        toolMode === "addPath" && !pathDraft && !pathSegmentDraft
          ? resolvePathEndpointSnap({
              pointerWorld: snapped.snappedPoint ?? world,
              zoom: canvasTransform.scale,
              editHandles: snapshot.editHandles,
              source,
              parseOptions
            })
          : null;
      const combinedOverlay = mergePathEndpointIntoOverlay(hoverAnchorOverlay, hoverPathEndpoint);
      setNodeAnchorOverlay(
        combinedOverlay && combinedOverlay.visibleAnchors.length > 0
          ? combinedOverlay
          : null
      );
      const closeCandidateWorld =
        toolMode === "addPath" &&
        pathDraft &&
        pathToolShouldClose(
          pathDraft,
          snapped.snappedPoint ?? world,
          pathToolCloseRadiusWorld(canvasTransform.scale)
        )
          ? pathDraft.startWorld
          : null;
      const cursorWorld = closeCandidateWorld ?? hoverPathEndpoint?.world ?? hoverEndpointAnchor?.world ?? snapped.snappedPoint ?? world;
      setToolCursorWorld(cursorWorld);
      updateInitialPlacementTooltip(event, cursorWorld);
      if (!toolDraft && !bezierBendDraft && !pathSegmentDraft) {
        setSnapLines(snapped.lines);
      }
      logSnapDebug({
        phase: "tool-hover-move",
        snapshotMatchesSource: true,
        dragKind: toolDraft ? "tool-create" : bezierBendDraft ? "tool-bezier-bend" : pathSegmentDraft ? "tool-path-segment" : null,
        context: snapContext,
        rawPoint: world,
        snappedPoint: snapped.snappedPoint ?? world,
        offset: snapped.offset,
        lines: snapped.lines
      });
    },
    [
      canvasTransform.scale,
      logSnapDebug,
      nodeAnchorTargets,
      matrixCellAnchorHints,
      snapshot.scene,
      snapshot.source,
      snapshot.editHandles,
      source,
      setNodeAnchorOverlay,
      svgResult,
      bezierBendDraft,
      pathDraft,
      pathSegmentDraft,
      toolDraft,
      toolMode,
      snapGuideInput,
      snapSettingsPatch,
      viewportWorldBounds,
      interactionSvgRef,
      dragRef,
      setSnapLines,
      setToolCursorWorld,
      updateInitialPlacementTooltip,
      setDragTooltip,
      parseOptions,
      magnifierState,
      setMagnifierState,
      viewportRef,
      pastePlacementDraft
    ]
  );

  const onInteractionPointerLeave = useCallback(() => {
    if (toolMode === "magnify") {
      if (!magnifierState) {
        setNodeAnchorOverlay(null);
        setToolCursorWorld(null);
        setSnapLines([]);
      }
      return;
    }
    if (toolMode === "select" || toolDraft || bezierBendDraft || pathSegmentDraft || freehandDraft) {
      return;
    }
    setNodeAnchorOverlay(null);
    setToolCursorWorld(null);
    setSnapLines([]);
    setDragTooltip(null);
  }, [bezierBendDraft, freehandDraft, magnifierState, pathSegmentDraft, setDragTooltip, setNodeAnchorOverlay, setSnapLines, setToolCursorWorld, toolDraft, toolMode]);

  const onInteractionPointerEnter = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!svgResult || toolMode === "select") {
        setNodeAnchorOverlay(null);
        setDragTooltip(null);
        return;
      }
      if (toolMode === "magnify") {
        if (magnifierState?.pointerId !== event.pointerId) {
          setNodeAnchorOverlay(null);
          setToolCursorWorld(null);
          setSnapLines([]);
          setDragTooltip(null);
        }
        return;
      }
      if (toolMode === "addBucket") {
        setToolCursorWorld(null);
        setNodeAnchorOverlay(null);
        setSnapLines([]);
        setDragTooltip(null);
        return;
      }
      if (pathSegmentDraft) {
        return;
      }
      const clientPoint = makeClientPoint(px(event.clientX), px(event.clientY));
      const world = clientToWorldPoint(clientPoint, interactionSvgRef.current, svgResult.viewBox);
      if (!world) {
        setNodeAnchorOverlay(null);
        setDragTooltip(null);
        return;
      }
      if (toolMode === "addFreehand") {
        setToolCursorWorld(world);
        setNodeAnchorOverlay(null);
        setSnapLines([]);
        setDragTooltip(null);
        logSnapDebug({
          phase: "tool-hover-enter",
          snapshotMatchesSource: snapshot.source === source,
          dragKind: dragRef.current?.kind ?? null,
          rawPoint: world,
          lines: []
        });
        return;
      }
      if (!snapshot.scene || snapshot.source !== source) {
        setToolCursorWorld(world);
        setNodeAnchorOverlay(null);
        setSnapLines([]);
        updateInitialPlacementTooltip(event, world);
        logSnapDebug({
          phase: "tool-hover-enter",
          note: !snapshot.scene ? "no scene available" : "stale snapshot/source mismatch",
          snapshotMatchesSource: snapshot.source === source,
          dragKind: null,
          rawPoint: world,
          lines: []
        });
        return;
      }

      const scopeInternalSourceIds = scopeOverlay ? collectAllScopeDescendantSourceIds(scopeOverlay) : undefined;
      const snapContext = buildSnapContext({
        sceneElements: snapshot.scene.elements,
        selectedSourceIds: [],
        editHandles: snapshot.editHandles,
        nodeAnchorTargets,
        guides: snapGuideInput,
        settings: snapSettingsPatch,
        zoom: canvasTransform.scale,
        viewportWorld: viewportWorldBounds,
        excludedSourceIds: scopeInternalSourceIds
      });
      const snapped = snapToolPointer({
        context: snapContext,
        pointer: world,
        kind: toolMode === "addPath" ? "line-end" : "node",
        modifiers: { ctrlOrMeta: event.ctrlKey || event.metaKey }
      });
      const showNodeAnchorsEnter =
        !toolDraft &&
        !bezierBendDraft &&
        !pathSegmentDraft &&
        (toolMode === "addLine" || toolMode === "addArrow" || toolMode === "addPath" || toolMode === "addOrthoWire");
      const hoverEndpointAnchorOverlay = showNodeAnchorsEnter
        ? resolveEndpointAnchorSnap({
            pointerWorld: world,
            zoom: snapContext.zoom,
            nodeAnchorTargets,
            matrixCellAnchorHints
          })
        : null;
      const hoverEndpointAnchor = hoverEndpointAnchorOverlay?.snappedAnchor ?? null;
      const hoverPathEndpointEnter =
        toolMode === "addPath" && !pathDraft && !pathSegmentDraft
          ? resolvePathEndpointSnap({
              pointerWorld: snapped.snappedPoint ?? world,
              zoom: canvasTransform.scale,
              editHandles: snapshot.editHandles,
              source,
              parseOptions
            })
          : null;
      const combinedOverlayEnter = mergePathEndpointIntoOverlay(
        widenAnchorOverlayForWiring(toolMode, hoverEndpointAnchorOverlay, nodeAnchorTargets),
        hoverPathEndpointEnter
      );
      setNodeAnchorOverlay(
        combinedOverlayEnter && combinedOverlayEnter.visibleAnchors.length > 0
          ? combinedOverlayEnter
          : null
      );
      const closeCandidateWorld =
        toolMode === "addPath" &&
        pathDraft &&
        pathToolShouldClose(
          pathDraft,
          snapped.snappedPoint ?? world,
          pathToolCloseRadiusWorld(canvasTransform.scale)
        )
          ? pathDraft.startWorld
          : null;
      const cursorWorld = closeCandidateWorld ?? hoverPathEndpointEnter?.world ?? hoverEndpointAnchor?.world ?? snapped.snappedPoint ?? world;
      setToolCursorWorld(cursorWorld);
      updateInitialPlacementTooltip(event, cursorWorld);
      if (!toolDraft && !bezierBendDraft && !pathSegmentDraft) {
        setSnapLines(snapped.lines);
      }
      logSnapDebug({
        phase: "tool-hover-enter",
        snapshotMatchesSource: true,
        dragKind: toolDraft ? "tool-create" : bezierBendDraft ? "tool-bezier-bend" : pathSegmentDraft ? "tool-path-segment" : null,
        context: snapContext,
        rawPoint: world,
        snappedPoint: snapped.snappedPoint ?? world,
        offset: snapped.offset,
        lines: snapped.lines
      });
    },
    [
      canvasTransform.scale,
      logSnapDebug,
      nodeAnchorTargets,
      matrixCellAnchorHints,
      snapshot.scene,
      snapshot.source,
      snapshot.editHandles,
      source,
      setNodeAnchorOverlay,
      svgResult,
      bezierBendDraft,
      pathDraft,
      pathSegmentDraft,
      toolDraft,
      toolMode,
      snapGuideInput,
      snapSettingsPatch,
      viewportWorldBounds,
      interactionSvgRef,
      dragRef,
      setSnapLines,
      setToolCursorWorld,
      updateInitialPlacementTooltip,
      setDragTooltip,
      parseOptions,
      magnifierState
    ]
  );

  const onInteractionPointerUp = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (toolMode === "magnify") {
        const magnifier = magnifierState;
        if (magnifier?.pointerId === event.pointerId) {
          setNodeAnchorOverlay(null);
          setToolCursorWorld(null);
          setSnapLines([]);
          setMagnifierState(null);
          setDragCursorLock(null);
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }
      if (event.pointerType !== "touch") {
        return;
      }
      finalizePendingTouchViewportTap(event.pointerId);
    },
    [
      finalizePendingTouchViewportTap,
      magnifierState,
      setDragCursorLock,
      setMagnifierState,
      setNodeAnchorOverlay,
      setSnapLines,
      setToolCursorWorld,
      toolMode
    ]
  );

  const onInteractionLostPointerCapture = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (toolMode !== "magnify") {
        return;
      }
      const magnifier = magnifierState;
      if (magnifier?.pointerId !== event.pointerId) {
        return;
      }
      setNodeAnchorOverlay(null);
      setToolCursorWorld(null);
      setSnapLines([]);
      setMagnifierState(null);
      setDragCursorLock(null);
    },
    [magnifierState, setDragCursorLock, setMagnifierState, setNodeAnchorOverlay, setSnapLines, setToolCursorWorld, toolMode]
  );

  const onViewportPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "touch") {
        return;
      }
      finalizePendingTouchViewportTap(event.pointerId);
    },
    [finalizePendingTouchViewportTap]
  );

  /**
   * Capture-phase guard for the canvas context menu. While the wire tool is armed the right button
   * belongs to the 45° gesture (M, then right-click two pins). Two cases must be suppressed: the
   * press that only ARMS the draft (the tool is still `addOrthoWire`), and the press that COMPLETES
   * the wire (that one already switched the tool back to `select` before `contextmenu` fired).
   * Capturing parent-first is what also keeps the per-element menus shut -- the gesture has to be
   * able to target a pin that sits on a component.
   */
  const onInteractionContextMenuCapture = useCallback(
    (event: ReactMouseEvent<SVGElement>) => {
      if (toolMode !== "addOrthoWire" && !consumedWireRightClickRef.current) {
        return;
      }
      consumedWireRightClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    [toolMode]
  );

  return {
    onBackgroundClick,
    onViewportPointerDown,
    onViewportPointerUp,
    onInteractionPointerDown,
    onInteractionPointerUp,
    onInteractionLostPointerCapture,
    onInteractionPointerMove,
    onInteractionPointerLeave,
    onInteractionPointerEnter,
    onInteractionContextMenuCapture
  };
}

function mergePathEndpointIntoOverlay(
  nodeOverlay: { visibleAnchors: NodeAnchorTarget[]; snappedAnchor: NodeAnchorTarget | null } | null,
  pathEndpoint: { elementId: string; end: string; world: WorldPoint } | null
): { visibleAnchors: NodeAnchorTarget[]; snappedAnchor: NodeAnchorTarget | null } | null {
  if (!pathEndpoint && !nodeOverlay) return null;

  // Create a synthetic NodeAnchorTarget for the path endpoint
  const pathEndpointAnchor: NodeAnchorTarget | null = pathEndpoint
    ? {
        nodeName: `__path:${pathEndpoint.elementId}`,
        anchor: pathEndpoint.end,
        world: pathEndpoint.world,
        tier: "basic" as const
      }
    : null;

  const visibleAnchors = [
    ...(nodeOverlay?.visibleAnchors ?? []),
    ...(pathEndpointAnchor ? [pathEndpointAnchor] : [])
  ];

  // The snapped anchor: prefer path endpoint (it's the append target) over node anchors
  const snappedAnchor = pathEndpointAnchor ?? nodeOverlay?.snappedAnchor ?? null;

  return { visibleAnchors, snappedAnchor };
}
