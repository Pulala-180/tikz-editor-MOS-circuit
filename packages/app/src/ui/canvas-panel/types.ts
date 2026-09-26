import type { AdornmentOwnerGeometry, Span, Statement } from "tikz-editor/ast/types";
import type { ComplexPathSegment } from "tikz-editor/edit/element-templates";
import type { EditAction, ResizeRole } from "tikz-editor/edit/actions";
import type { EditParseOptions } from "tikz-editor/edit/parse-options";
import type { SelectionGeometry, SnapContext, SnapLine } from "tikz-editor/edit/snapping";
import type { EditHandle, NodeAnchorTarget, SceneElement, SceneText } from "tikz-editor/semantic/types";
import type { SvgViewBox } from "tikz-editor/svg/index";
import type { NodeTextLayoutKind } from "tikz-editor/text/types";
import type { FrameTransform } from "tikz-editor/coords/index";
import type { Dispatch, SetStateAction } from "react";

import type { SessionSnapshot } from "../../compute";
import type { CanvasTransform, EditorAction } from "../../store/types";
import type { CanvasContextMenuTarget } from "../../context-menu";
import type { ToolCreateMode } from "../tool-config";
import type { ClientPoint, SvgBounds, SvgPoint, ViewportBounds, ViewportPoint, WorldBounds, WorldPoint, WorldVector } from "../coords/types";
import type { HitRegion } from "./hit-regions";
import type { ResizeFrame } from "./resize-frames";
import type { WireRoutingMode, OrthoOrientation } from "./wire-routing-helper";

export type { WireRoutingMode, OrthoOrientation };

export type GuideOrientation = "vertical" | "horizontal";

export type CanvasDispatch = (action: EditorAction) => void;

export type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type ValueSetter<T> = (value: T) => void;

export type CanvasSnapshot = SessionSnapshot;

export type CanvasSvgResult = SessionSnapshot["svg"];

export type CanvasSvgRenderModel = SessionSnapshot["svgModel"];

export type CanvasEditParseOptions = EditParseOptions;

export type ApplyActionWithFeedbackFn = (
  action: EditAction,
  historyMergeKey?: string,
  sourceOverride?: string
) => ApplyActionFeedback;

export type CanvasContextMenuState = {
  target: CanvasContextMenuTarget;
  anchor: ViewportPoint;
  handleIdOverride?: string | null;
  includeEditEquationForSingleNode?: boolean;
  nodePositioningAction?: "position-relative" | "convert-absolute" | null;
  includePathSubmenuForSingleSelection?: boolean;
  includeFlattenForeach?: boolean;
  includeMatrixMultiRemoveRow?: boolean;
  includeMatrixMultiRemoveColumn?: boolean;
  includeMatrixMultiInsertRowAbove?: boolean;
  includeMatrixMultiInsertRowBelow?: boolean;
  includeMatrixMultiInsertColumnLeft?: boolean;
  includeMatrixMultiInsertColumnRight?: boolean;
};

export type GuidesState = {
  vertical: number[];
  horizontal: number[];
};

export type GuidePreview = {
  orientation: GuideOrientation;
  value: number;
  hideValue?: number;
  visible?: boolean;
};

export type GuideDragState = {
  pointerId: number;
  orientation: GuideOrientation;
  source: "ruler" | "guide";
  sourceValue?: number;
  value: number;
  overViewport: boolean;
  overDeleteZone: boolean;
};

export type SelectionAnchorRatio = Readonly<{
  x: number;
  y: number;
}>;

export type GridResizeSnapConfig = {
  anchorWorld: WorldPoint;
  stepX: number;
  stepY: number;
  transform: FrameTransform;
};

export type DragTooltipRow = {
  label: string;
  value: string;
};

export type DragTooltipState = {
  kind: "resize" | "rotate" | "tool-create";
  anchor: ClientPoint;
  rows: DragTooltipRow[];
};

export type PendingTouchViewport = {
  pointerId: number;
  startClient: ClientPoint;
  additiveSelection: boolean;
  startTransform: CanvasTransform;
  timer: ReturnType<typeof setTimeout>;
};

export type MagnifierState = {
  pointerId: number;
  center: ViewportPoint;
};

export type DragState =
  | {
      kind: "element";
      pointerId: number;
      elementIds: string[];
      startWorld: WorldPoint;
      adornmentDragFromText?: boolean;
      lastAppliedTotalDelta: WorldVector;
      // Matches core's DragFormatPrecision. "coarse" was listed here but never assigned anywhere
      // (it looks copied from the unrelated GridSize union).
      lastMoveFormatPrecision?: "default" | "fine";
      transientDomElements?: Element[];
      initialTransforms?: Map<Element, string | null>;
      transientRigidLeafBranches?: Array<{
        leafDomElements: Element[];
        initialTransforms: Map<Element, string | null>;
        orientation: "h" | "v";
        wireSourceId: string;
        isTapBranch?: boolean;
        isStretchOnly?: boolean;
        followAxis?: "x" | "y";
      }>;
      transientAttachedWires?: Array<{
        element: SVGPathElement;
        elements?: SVGPathElement[];
        wireSourceId: string;
        initialD: string;
        /** Parsed M/L points of `initialD`; null when the path has curves/arcs, which keeps the 2-point fallback. */
        initialPoints: Array<{ x: number; y: number }> | null;
        staticSvg: { x: number; y: number };
        movingSvg: { x: number; y: number };
        movingEndpointIndex: 0 | 1;
        /**
         * The wire's route is an implicit `|-` / `-|` corner (TikZ computes the bend from the two
         * endpoints). The transient rewrite must recompute the interior point so the wire stays
         * orthogonal while the attached end moves; freezing it skews the wire into a diagonal.
         */
        implicitCorner: boolean;
        /**
         * The wire is an attached, genuinely-skewed route: the repair pass re-routes its interior
         * orthogonally on commit. Mirrored in the transient rewrite so the wire visibly snaps
         * straight during the drag.
         */
        skewedRepair: boolean;
      }>;
      movementAxis?: "x" | "y" | "orthogonal" | "locked" | null;
      adornmentDrag?: {
        ownerPoint: WorldPoint;
        ownerGeometry?: AdornmentOwnerGeometry;
        allowCenter: boolean;
        pointerOffsetFromReference: WorldVector;
        textDrag?: {
          pointerOffsetFromCenter: WorldVector;
          halfWidth: number;
          halfHeight: number;
        };
      };
      pathAttachedNodeDrag?: {
        nodeId: string;
        hostPathSourceId: string;
        pointerOffsetFromCenter: WorldVector;
        initialCenter: WorldPoint;
        initialAnchorPoint: WorldPoint;
        initialAnchorOffset: WorldVector;
        initialDistancePt: number;
        initialDirectionalAnchorPt: number;
        segment: NonNullable<EditHandle["pathAttachmentContext"]>["segment"];
        regime: NonNullable<EditHandle["pathAttachmentContext"]>["regime"];
        lastPreviewDelta?: WorldVector;
        lastAppliedPlacementKey?: string;
      };
      snapContext: SnapContext | null;
      initialSelection: SelectionGeometry | null;
      selectionAnchorRatio: SelectionAnchorRatio | null;
      historyMergeKey: string;
    }
  | {
      kind: "resize";
      pointerId: number;
      elementId: string;
      role: ResizeRole;
      cursor: string;
      preserveAspectRatio: number | null;
      initialFrame: ResizeFrame;
      initialScopeTransform:
        | {
            xscale: number;
            yscale: number;
            xshift: number;
            yshift: number;
          }
        | null;
      measurementMode: "center" | "opposite-corner";
      preserveAspectDuringResize: boolean;
      historyMergeKey: string;
    }
  | {
      kind: "rotate";
      pointerId: number;
      elementId: string;
      sourceId: string;
      cursor: string;
      centerWorld: WorldPoint;
      startPointerAngleDeg: number;
      centerPivotWorld: WorldPoint;
      startCenterPivotPointerAngleDeg: number;
      baseRotateDeg: number;
      lastAppliedRotateDeg: number;
      lastAppliedRotateMode: "property" | "origin" | "center-pivot";
      activeRotateMode: "property" | "origin" | "center-pivot";
      lastPointerClient: ClientPoint;
      lastPointerWorld: WorldPoint;
      preEditBaselineSource: string;
      latestSource: string;
      historyMergeKey: string;
    }
  | {
      kind: "handle";
      pointerId: number;
      handleId: string;
      sourceId: string;
      handleKind: EditHandle["kind"];
      cursor: string;
      lastKnownWorld: WorldPoint;
      startWorld?: WorldPoint;
      movementAxis?: "x" | "y" | null;
      lockedCoordinate?: number | null;
      directionConstraint?: {
        anchorWorld: WorldPoint;
        unitVector: { x: number; y: number };
        connectedComponentId?: string | null;
      } | null;
      snapContext: SnapContext | null;
      gridResizeSnap: GridResizeSnapConfig | null;
      historyMergeKey: string;
      activeEndpointAnchor: NodeAnchorTarget | null;
      otherEndpointWorld?: WorldPoint | null;
      preEditBaselineSource: string;
      transientPathElement?: SVGPathElement | null;
      transientHandleElement?: SVGElement | null;
      initialD?: string | null;
      initialPoints?: Array<{ x: number; y: number }> | null;
      movingEndpointIndex?: 0 | 1;
      cachedVddRails?: Array<{ y: number; minX: number; maxX: number }>;
    }
  | {
      kind: "pan";
      pointerId: number;
      startClient: ClientPoint;
      startTransform: CanvasTransform;
    }
  | {
      /**
       * Dragging the IMPLICIT corner of a `|-` / `-|` operator wire. The corner has no edit handle,
       * so this gesture materialises the route as an explicit `A -- (corner) -- B` polyline (both
       * endpoints, anchors included, are kept byte-for-byte) and then re-materialises it at the new
       * corner on every move. `baselineSource` is the operator form captured at pointer-down so the
       * rewrite is always rebuilt from a stable base.
       */
      kind: "ortho-corner";
      pointerId: number;
      elementId: string;
      cursor: string;
      startWorld: WorldPoint;
      lastKnownWorld: WorldPoint;
      historyMergeKey: string;
      baselineSource: string;
    }
  | {
      /**
       * Dragging an orthogonal segment of a wire/polyline. Endpoints remain fixed,
       * stretching adjacent segments (Virtuoso-style orthogonal wire drag).
       */
      kind: "ortho-segment";
      pointerId: number;
      elementId: string;
      segmentIndex: number;
      axis: "h" | "v";
      cursor: string;
      startWorld: WorldPoint;
      lastKnownWorld: WorldPoint;
      historyMergeKey: string;
      baselineSource: string;
      snapContext?: SnapContext | null;
      transientPathElement?: SVGPathElement | null;
      initialD?: string | null;
      initialPoints?: Array<{ x: number; y: number }> | null;
    }
  | {
      kind: "marquee";
      pointerId: number;
      startWorld: WorldPoint;
      currentWorld: WorldPoint;
      additive: boolean;
      baseSelectedIds: string[];
    }
  | {
      kind: "tool-create";
      pointerId: number;
      toolMode: ToolCreateMode;
      startWorld: WorldPoint;
      startEndpointAnchor: NodeAnchorTarget | null;
      rawCurrentWorld: WorldPoint;
      currentWorld: WorldPoint;
      activeEndpointAnchor: NodeAnchorTarget | null;
      snapContext: SnapContext | null;
    }
  | {
      kind: "tool-bezier-bend";
      pointerId: number;
      startWorld: WorldPoint;
      endWorld: WorldPoint;
      rawCurrentWorld: WorldPoint;
      currentWorld: WorldPoint;
      snapContext: SnapContext | null;
    }
  | {
      kind: "tool-path-segment";
      pointerId: number;
      startWorld: WorldPoint;
      endWorld: WorldPoint;
      endEndpointAnchor: NodeAnchorTarget | null;
      startPointerWorld: WorldPoint;
      rawBendWorld: WorldPoint;
      bendWorld: WorldPoint;
      isBending: boolean;
      snapContext: SnapContext | null;
    }
  | {
      kind: "tool-freehand";
      pointerId: number;
      points: WorldPoint[];
      minSampleDistanceWorld: number;
    }
  ;

export type PendingAddedSelection = {
  beforeIds: Set<string>;
  preferredWorld: WorldPoint;
  preferredSourceId?: string;
};

export type PendingBezier = {
  startWorld: WorldPoint;
  endWorld: WorldPoint;
};

export type PathAppendTarget = {
  elementId: string;
  end: "start" | "end";
};

export type PathToolDraft = {
  startWorld: WorldPoint;
  segments: ComplexPathSegment[];
  appendTarget?: PathAppendTarget;
};

export type RoundedLineToolDraft = {
  startWorld: WorldPoint;
};

export type OrthoWireToolDraft = {
  currentWorld: WorldPoint;
  /**
   * The anchor the wire started from. Set once on the first click and preserved for the life of
   * the wire — it is the origin pin, not "whatever anchor the pointer last happened to hit".
   */
  startAnchor?: NodeAnchorTarget | null;
  routingMode?: WireRoutingMode;
  orientation?: OrthoOrientation;
  /** Legs already written. The origin anchor only applies to the first leg. */
  emittedLegs?: number;
};

export type FreehandToolDraft = {
  points: WorldPoint[];
  minSampleDistanceWorld: number;
};

export type TextSelectionOverlay = {
  sourceId: string;
  selectionStart: number;
  selectionEnd: number;
  caret: TextSelectionOverlayBox | null;
  rects: TextSelectionOverlayBox[];
};

export type TextSelectionOverlayBox = {
  bounds: ViewportBounds;
  center?: ViewportPoint;
  rotationDeg?: number;
};

export type TextEditingSession = {
  sourceId: string;
  sceneTextId: string;
  sourceSpan: Span;
  workingSource: string;
  text: string;
  selectionStart: number;
  selectionEnd: number;
  historyMergeKey: string;
  usesMathJax: boolean;
  paragraphId: string | null;
  renderSourceText: string;
  layoutKind: NodeTextLayoutKind;
  region: Extract<HitRegion, { shape: "rect" }>;
  popupAnchorBox?: SvgBounds;
  isForeachTemplateEdit: boolean;
};

export type NodeAnchorOverlayState = {
  visibleAnchors: NodeAnchorTarget[];
  snappedAnchor: NodeAnchorTarget | null;
  anchorStateBySourceId?: ReadonlyMap<string, { disabled?: boolean }>;
  radiusScale?: number;
};

export type NodePositionLinkDisplay = {
  key: string;
  from: WorldPoint;
  to: WorldPoint;
  sourceId: string;
  targetSourceId?: string;
};

export type EditableTextTarget = {
  sourceId: string;
  sceneTextId: string;
  sourceSpan: Span;
  text: string;
  renderSourceText: string;
  usesMathJax: boolean;
  paragraphId: string | null;
  layoutKind: NodeTextLayoutKind;
  style: SceneText["style"];
  totalWidth: number;
  region: Extract<HitRegion, { shape: "rect" }>;
  popupAnchorBox?: SvgBounds;
  isForeachTemplateEdit?: boolean;
};

export type SnapDebugLogInput = {
  phase: string;
  note?: string;
  snapshotMatchesSource: boolean;
  dragKind: DragState["kind"] | null;
  context?: SnapContext | null;
  rawPoint?: WorldPoint | null;
  rawDelta?: WorldPoint | null;
  snappedPoint?: WorldPoint | null;
  snappedDelta?: WorldPoint | null;
  offset?: WorldPoint | null;
  lines?: readonly SnapLine[];
};

export type ApplyActionFeedback = {
  sourceChanged: boolean;
  newSource?: string;
};

export type SelectionBounds = {
  sourceId: string;
  bounds: SvgBounds;
};

export type SourceBoundsMap = ReadonlyMap<string, SvgBounds>;

export type ScopeHitBounds = {
  scopeId: string;
  bounds: WorldBounds;
};

export type SelectionBoxDisplay =
  | {
      key: string;
      sourceId: string;
      isAdornment: boolean;
      dashed?: boolean;
      kind: "axis-aligned";
      bounds: SvgBounds;
    }
  | {
      key: string;
      sourceId: string;
      isAdornment: boolean;
      dashed?: boolean;
      kind: "polygon";
      points: ReadonlyArray<SvgPoint>;
    };

export type AdornmentConnectorDisplay = {
  key: string;
  kind: "label" | "pin";
  from: SvgPoint;
  to: SvgPoint;
};

export type AdornmentHighlightBox = {
  key: string;
  bounds: SvgBounds;
};

export type HandleDisplay =
  | {
      key: string;
      point: SvgPoint;
      cursor: string;
      kind: "move-handle";
      handle: EditHandle;
    }
  | {
      key: string;
      point: SvgPoint;
      cursor: string;
      kind: "move-element";
      elementId: string;
    }
  | {
      key: string;
      point: SvgPoint;
      cursor: string;
      kind: "resize-element";
      elementId: string;
      role: ResizeRole;
      rotationDeg: number;
    }
  | {
      key: string;
      point: SvgPoint;
      anchor: SvgPoint;
      centerWorld: WorldPoint;
      centerPivotWorld: WorldPoint;
      cursor: string;
      kind: "rotate-element";
      elementId: string;
    };

export type OverlaySelectionState = {
  selectionBounds: SelectionBounds[];
  selectionBoundsBySource: ReadonlyMap<string, SvgBounds>;
  interactionBoundsSvgBySource: ReadonlyMap<string, SvgBounds>;
  selectedScopeHitBounds: ScopeHitBounds[];
  selectionBoxes: SelectionBoxDisplay[];
  selectedAdornmentConnectors: AdornmentConnectorDisplay[];
  adornmentHighlightBoxes: AdornmentHighlightBox[];
  marqueeBounds: SvgBounds | null;
  handleDisplays: HandleDisplay[];
  viewportWorldBounds: WorldBounds | null;
};

export type SceneSnapshot = { elements: SceneElement[] } | null;

export type SvgSnapshot = { viewBox: SvgViewBox } | null;

export type StatementList = readonly Statement[];
