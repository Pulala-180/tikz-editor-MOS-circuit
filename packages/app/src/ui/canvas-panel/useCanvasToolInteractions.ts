import { useCallback, useEffect, type MouseEvent as ReactMouseEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { viewportPoint, clientPoint as makeClientPoint, worldPoint, pt, px } from "tikz-editor/coords/index";
import { buildSnapContext, resolveSnapSettings, snapToolPointer, type SnapGuideInput, type SnapLine, type SnapSettingsPatch } from "tikz-editor/edit/snapping";
import type { NodeAnchorTarget } from "tikz-editor/semantic/types";
import type { ClientPoint, WorldBounds, WorldPoint } from "../coords/types";
import type { CanvasTransform, ToolMode } from "../../store/types";
import { resolveEndpointAnchorSnap } from "./endpoint-anchor-snap";
import { clientToWorldPoint, distanceSquared } from "./geometry";
import { createPathToolDraft, pathToolCloseRadiusWorld, pathToolCurrentPoint, pathToolShouldClose } from "./path-tool";
import { resolvePathEndpointSnap } from "./path-endpoint-snap";
import { createFreehandToolDraft } from "./freehand-tool";
import { isToolCreateMode } from "../tool-config";
import { formatTooltipCoordinateRows } from "./interaction-helpers";
import { getCircuitComponentSnippet } from "./circuit-snippets";
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

export type UseCanvasToolInteractionsArgs = {
  viewportRef: RefObject<HTMLDivElement | null>;
  toolMode: ToolMode;
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

      if (event.button === 0 && toolMode !== "select") {
        const clientPoint = makeClientPoint(px(event.clientX), px(event.clientY));
        const world = clientToWorldPoint(clientPoint, interactionSvgRef.current, svgResult.viewBox);
        if (!world) {
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

          const snippet = `\\draw[thick, line cap=round] (${activeDraft.startWorld.x.toFixed(2)},${activeDraft.startWorld.y.toFixed(2)}) -- (${resolvedStart.x.toFixed(2)},${resolvedStart.y.toFixed(2)});\n`;
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
          const activeDraft = args.orthoWireDraft;
          if (!activeDraft) {
            args.setOrthoWireDraft({
              currentWorld: resolvedStart,
              startAnchor: startEndpointAnchor
            });
            setSnapLines(startSnapResult.lines);
            return;
          }

          const dx = Math.abs(resolvedStart.x - activeDraft.currentWorld.x);
          const dy = Math.abs(resolvedStart.y - activeDraft.currentWorld.y);
          const nextPoint: WorldPoint = dx >= dy
            ? worldPoint(pt(resolvedStart.x), pt(activeDraft.currentWorld.y))
            : worldPoint(pt(activeDraft.currentWorld.x), pt(resolvedStart.y));

          if (Math.abs(nextPoint.x - activeDraft.currentWorld.x) < 1e-3 && Math.abs(nextPoint.y - activeDraft.currentWorld.y) < 1e-3) {
            return;
          }

          const x1Cm = (activeDraft.currentWorld.x / 28.4527559).toFixed(2);
          const y1Cm = (activeDraft.currentWorld.y / 28.4527559).toFixed(2);
          const x2Cm = (nextPoint.x / 28.4527559).toFixed(2);
          const y2Cm = (nextPoint.y / 28.4527559).toFixed(2);
          const snippet = `\\draw[thick, line cap=round] (${x1Cm},${y1Cm}) -- (${x2Cm},${y2Cm});\n`;

          applyActionWithFeedback({
            kind: "pasteStatements",
            snippets: [snippet],
            delta: worldPoint(pt(0), pt(0))
          });

          if (startEndpointAnchor && (!activeDraft.startAnchor || startEndpointAnchor.nodeSourceId !== activeDraft.startAnchor.nodeSourceId)) {
            args.setOrthoWireDraft(null);
            dispatch({ type: "SET_TOOL_MODE", mode: "select" });
            setToolCursorWorld(null);
            setSnapLines([]);
            setNodeAnchorOverlay(null);
            return;
          }

          args.setOrthoWireDraft({
            currentWorld: nextPoint,
            startAnchor: startEndpointAnchor
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
          toolMode === "addDotNode" ||
          toolMode.startsWith("addIoNode") ||
          toolMode === "addVDD" ||
          toolMode.startsWith("addCapacitor") ||
          toolMode.startsWith("addGND") ||
          toolMode.startsWith("addCurrentSource") ||
          toolMode.startsWith("addVoltageSource") ||
          toolMode.startsWith("addCurrentArrow") ||
          toolMode.startsWith("addWireLead")
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
            toolMode === "addDotNode" ||
            toolMode.startsWith("addIoNode") ||
            toolMode === "addVDD" ||
            toolMode.startsWith("addCapacitor") ||
            toolMode.startsWith("addGND") ||
            toolMode.startsWith("addCurrentSource") ||
            toolMode.startsWith("addVoltageSource") ||
            toolMode.startsWith("addCurrentArrow") ||
            toolMode.startsWith("addWireLead")
          ) {
            const xCm = (nodeAt.x / 28.4527559).toFixed(2);
            const yCm = (nodeAt.y / 28.4527559).toFixed(2);
            const snippet = getCircuitComponentSnippet(toolMode, xCm, yCm);
            if (!snippet) return;

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
              dispatch({ type: "SET_TOOL_MODE", mode: "select" });
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
      if (toolMode !== "select") {
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
    [closeTextEditingSession, onInteractionPointerDown, startMarqueeSelection, toolMode, viewportRef]
  );

  const onInteractionPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!svgResult || toolMode === "select") {
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
      const combinedOverlay = mergePathEndpointIntoOverlay(hoverEndpointAnchorOverlay, hoverPathEndpoint);
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
      viewportRef
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
      const combinedOverlayEnter = mergePathEndpointIntoOverlay(hoverEndpointAnchorOverlay, hoverPathEndpointEnter);
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

  return {
    onBackgroundClick,
    onViewportPointerDown,
    onViewportPointerUp,
    onInteractionPointerDown,
    onInteractionPointerUp,
    onInteractionLostPointerCapture,
    onInteractionPointerMove,
    onInteractionPointerLeave,
    onInteractionPointerEnter
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
