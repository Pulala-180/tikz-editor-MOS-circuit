import { px } from "../../coords/scalars.js";
import type { Px } from "../../coords/scalars.js";
import type { WorldBounds, WorldPoint } from "../../coords/points.js";
import type { EditHandle, SceneElement } from "../../semantic/types.js";

export type Axis = "x" | "y";

export type SnapSettings = {
  thresholdPx: Px;
  grid: {
    enabled: boolean;
    minorTargetPx: Px;
  };
  points: {
    enabled: boolean;
  };
  gaps: {
    enabled: boolean;
    maxPairsPerAxis: number;
  };
  bypassWithCtrlOrMeta: boolean;
  viewportPaddingPx: Px;
};

export const GRID_MINOR_TARGET_PX = 22;

export const DEFAULT_SNAP_SETTINGS: SnapSettings = {
  thresholdPx: px(20),
  grid: {
    enabled: false,
    minorTargetPx: px(GRID_MINOR_TARGET_PX)
  },
  points: {
    enabled: true
  },
  gaps: {
    enabled: false,
    maxPairsPerAxis: 100000
  },
  bypassWithCtrlOrMeta: true,
  viewportPaddingPx: px(12)
};

export type SnapSettingsPatch = {
  thresholdPx?: Px;
  grid?: Partial<SnapSettings["grid"]>;
  points?: Partial<SnapSettings["points"]>;
  gaps?: Partial<SnapSettings["gaps"]>;
  bypassWithCtrlOrMeta?: boolean;
  viewportPaddingPx?: Px;
};

export type SnapModifiers = {
  ctrlOrMeta: boolean;
};

export type SnapPoint = WorldPoint & {
  sourceId: string;
  role: "corner" | "center" | "endpoint";
};

export type SnapBounds = WorldBounds & {
  sourceId: string;
};

export type Gap = {
  startBounds: SnapBounds;
  endBounds: SnapBounds;
  startSide: [WorldPoint, WorldPoint];
  endSide: [WorldPoint, WorldPoint];
  overlap: [number, number];
  length: number;
};

export type SnapGuides = {
  x: number[];
  y: number[];
};

export type SnapGuideInput = {
  x?: readonly number[];
  y?: readonly number[];
};

export type SnapContext = {
  zoom: number;
  viewportWorld: WorldBounds | null;
  selectedSourceIds: string[];
  guides: SnapGuides;
  referencePoints: SnapPoint[];
  referenceBounds: SnapBounds[];
  visibleGaps: {
    horizontal: Gap[];
    vertical: Gap[];
  };
  settings: SnapSettings;
};

export type SnapLine =
  | { type: "points"; axis: Axis; points: WorldPoint[]; is2DSnapped?: boolean }
  | {
      type: "gap";
      direction: "horizontal" | "vertical";
      gapKind: "center" | "equal";
      segments: Array<[WorldPoint, WorldPoint]>;
    }
  | { type: "pointer"; axis: Axis; from: WorldPoint; to: WorldPoint; is2DSnapped?: boolean };

export type SnapResult = {
  offset: WorldPoint;
  snappedPoint?: WorldPoint;
  snappedDelta?: WorldPoint;
  lines: SnapLine[];
};

export type SelectionGeometry = {
  bounds: WorldBounds;
  snapPoints: WorldPoint[];
};

export type BuildSnapContextInput = {
  sceneElements: SceneElement[];
  selectedSourceIds: readonly string[];
  editHandles?: readonly EditHandle[];
  nodeAnchorTargets?: readonly NodeAnchorTarget[];
  zoom: number;
  viewportWorld?: WorldBounds | null;
  guides?: SnapGuideInput;
  settings?: SnapSettingsPatch;
  excludedSourceIds?: ReadonlySet<string> | readonly string[];
};

export type SnapSelectionTranslationInput = {
  context: SnapContext;
  selection: SelectionGeometry;
  rawDelta: WorldPoint;
  modifiers?: SnapModifiers;
  settings?: SnapSettingsPatch;
  enabledAxis?: Axis | null;
};

export type SnapHandlePositionInput = {
  context: SnapContext;
  point: WorldPoint;
  sourceId?: string;
  allowSelfSnap?: boolean;
  modifiers?: SnapModifiers;
  settings?: SnapSettingsPatch;
};

export type SnapKeyboardNudgeInput = {
  anchor: WorldPoint | null;
  axis: Axis;
  direction: -1 | 1;
  step: number;
};

export type SnapToolPointerKind = "node" | "line-end" | "rect-corner" | "circle-edge";

export type SnapToolPointerInput = {
  context: SnapContext;
  pointer: WorldPoint;
  kind: SnapToolPointerKind;
  anchor?: WorldPoint;
  modifiers?: SnapModifiers;
  settings?: SnapSettingsPatch;
};

export type PointSnapCandidate = {
  kind: "point" | "grid" | "guide";
  axis: Axis;
  from: WorldPoint;
  to: WorldPoint;
  offset: number;
  key: number;
};

export type GapSnapDirection =
  | "center_horizontal"
  | "center_vertical"
  | "side_left"
  | "side_right"
  | "side_top"
  | "side_bottom";

export type GapSnapCandidate = {
  kind: "gap";
  axis: Axis;
  direction: GapSnapDirection;
  gap: Gap;
  offset: number;
};

export type AxisSnapCandidate = PointSnapCandidate | GapSnapCandidate;

export type AxisSnapBuckets = {
  x: AxisSnapCandidate[];
  y: AxisSnapCandidate[];
};

export type AxisMinOffset = {
  x: number;
  y: number;
};
