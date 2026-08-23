import type {
  FrameLocalPoint,
  SvgPoint,
  ViewportPoint,
  WorldBounds,
  WorldPoint,
  WorldVector
} from "../packages/core/src/coords/index";

declare const frameLocalPointValue: FrameLocalPoint;
declare const svgPointValue: SvgPoint;
declare const viewportPointValue: ViewportPoint;
declare const worldBoundsValue: WorldBounds;
declare const worldPointValue: WorldPoint;
declare const worldVectorValue: WorldVector;

const sameWorldPoint: WorldPoint = worldPointValue;
const sameWorldVector: WorldVector = worldVectorValue;
const sameWorldBounds: WorldBounds = worldBoundsValue;

// @ts-expect-error world and svg spaces are distinct
const worldPointAsSvgPoint: SvgPoint = worldPointValue;

// @ts-expect-error world and viewport spaces are distinct
const worldPointAsViewportPoint: ViewportPoint = worldPointValue;

// @ts-expect-error frame-local and world spaces are distinct
const frameLocalAsWorldPoint: WorldPoint = frameLocalPointValue;

// @ts-expect-error points and vectors are distinct
const worldPointAsVector: WorldVector = worldPointValue;

// @ts-expect-error vectors and points are distinct
const worldVectorAsPoint: WorldPoint = worldVectorValue;

void sameWorldPoint;
void sameWorldVector;
void sameWorldBounds;
void worldPointAsSvgPoint;
void worldPointAsViewportPoint;
void frameLocalAsWorldPoint;
void worldPointAsVector;
void worldVectorAsPoint;
void svgPointValue;
void viewportPointValue;
