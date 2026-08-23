import type { EditHandle, SceneElement } from "../../semantic/types.js";
import type { WorldPoint } from "../../coords/points.js";
import { collectPathEndpointSnapPoints } from "./geometry.js";

export type MoveAxis = "x" | "y" | "locked";

const MOVE_AXIS_EPSILON = 1e-6;
/** Integer-pt scope-shift formatting can quantize a snapped port by up to 0.5pt. */
const ATTACHED_WIRE_EPSILON_PT = 0.51;
const MIN_RESISTOR_POINT_COUNT = 6;
const MIN_RESISTOR_ALTERNATIONS = 3;
const MIN_RESISTOR_PROJECTION = 0.12;
const MAX_RESISTOR_PROJECTION = 0.88;

/**
 * Detects a horizontal/vertical "symbol" polyline (the built-in resistor is a
 * zig-zag open path) or an orthogonal wire segment and returns the axis along
 * which the element may be moved.
 */
export function resolveMoveAxisConstraintFromEditHandles(
  editHandles: readonly EditHandle[],
  sourceIds: ReadonlySet<string> | readonly string[],
  options: {
    requireAttachedWire?: boolean;
    sceneElements?: readonly SceneElement[];
  } = {}
): MoveAxis | null {
  const selected = sourceIds instanceof Set ? sourceIds : new Set(sourceIds);
  const sceneElements = options.sceneElements ?? [];

  // 1. Check if the selection is a single straight wire segment
  const wireAxis = wireMoveAxis(editHandles, selected, sceneElements);
  if (wireAxis) {
    return wireAxis;
  }

  const pointsBySource = new Map<string, WorldPoint[]>();

  for (const handle of editHandles) {
    if (handle.kind !== "path-point") {
      continue;
    }
    const sourceId = handle.sourceRef.sourceId.trim();
    if (sourceId.length === 0 || !selected.has(sourceId)) {
      continue;
    }
    const points = pointsBySource.get(sourceId);
    if (points) {
      points.push(handle.world);
    } else {
      pointsBySource.set(sourceId, [handle.world]);
    }
  }

  let resolved: MoveAxis | null = null;
  for (const points of pointsBySource.values()) {
    const axis = resistorMoveAxis(sortPathPoints(points));
    if (!axis) {
      continue;
    }
    if (resolved && resolved !== axis) {
      return null;
    }
    resolved = axis;
  }

  if (!resolved || !options.requireAttachedWire) {
    return resolved;
  }

  return hasAttachedWireEndpoint(editHandles, selected, sceneElements)
    ? resolved
    : null;
}

function wireMoveAxis(
  editHandles: readonly EditHandle[],
  selected: ReadonlySet<string>,
  sceneElements: readonly SceneElement[]
): MoveAxis | null {
  if (selected.size !== 1) {
    return null;
  }
  const [selectedId] = [...selected];
  const element = sceneElements.find((e) => e.sourceRef.sourceId === selectedId);
  if (!element || element.kind !== "Path" || element.commands.some((c) => c.kind === "Z")) {
    return null;
  }

  const handles = editHandles
    .filter((h) => h.kind === "path-point" && h.sourceRef.sourceId === selectedId)
    .sort((a, b) => a.sourceRef.sourceSpan.from - b.sourceRef.sourceSpan.from);

  if (handles.length !== 2) {
    return null;
  }

  const p1 = handles[0].world;
  const p2 = handles[1].world;
  const dx = Math.abs(p2.x - p1.x);
  const dy = Math.abs(p2.y - p1.y);
  const isHorizontal = dy <= 0.5;
  const isVertical = dx <= 0.5;
  if (!isHorizontal && !isVertical) {
    return null;
  }

  const componentPortSourceIds = new Set<string>();
  for (const el of sceneElements) {
    if (selected.has(el.sourceRef.sourceId)) continue;
    if (el.kind === "Node" || el.kind === "Scope" || (el.kind === "Path" && el.sourceRef.sourceId.includes("node_"))) {
      componentPortSourceIds.add(el.sourceRef.sourceId);
    }
  }

  const otherComponentHandles = editHandles.filter((h) => {
    if (selected.has(h.sourceRef.sourceId)) return false;
    const sId = h.sourceRef.sourceId;
    return (
      h.kind === "node-position" ||
      componentPortSourceIds.has(sId) ||
      sId.startsWith("scope:") ||
      sId.includes("node_")
    );
  });

  const p1Attached = otherComponentHandles.some(
    (h) => Math.hypot(h.world.x - p1.x, h.world.y - p1.y) <= ATTACHED_WIRE_EPSILON_PT
  );
  const p2Attached = otherComponentHandles.some(
    (h) => Math.hypot(h.world.x - p2.x, h.world.y - p2.y) <= ATTACHED_WIRE_EPSILON_PT
  );

  if (p1Attached || p2Attached) {
    return "locked";
  }

  return isHorizontal ? "y" : "x";
}

function hasAttachedWireEndpoint(
  editHandles: readonly EditHandle[],
  selected: ReadonlySet<string>,
  sceneElements: readonly SceneElement[]
): boolean {
  const wireSourceIds = new Set<string>();
  for (const element of sceneElements) {
    if (element.kind !== "Path" || selected.has(element.sourceRef.sourceId)) {
      continue;
    }
    if (element.commands.some((command) => command.kind === "Z")) {
      continue;
    }
    wireSourceIds.add(element.sourceRef.sourceId);
  }
  if (wireSourceIds.size === 0) {
    return false;
  }

  const selectedPorts = collectPathEndpointSnapPoints(editHandles, selected);
  const wireEndpoints = collectPathEndpointSnapPoints(editHandles, wireSourceIds);
  for (const port of selectedPorts) {
    for (const endpoint of wireEndpoints) {
      const dx = endpoint.x - port.x;
      const dy = endpoint.y - port.y;
      if (Math.hypot(dx, dy) <= ATTACHED_WIRE_EPSILON_PT) {
        return true;
      }
    }
  }

  return false;
}

function sortPathPoints(points: WorldPoint[]): WorldPoint[] {
  return points.slice().sort((left, right) => {
    // Path-point handles are emitted in source order.  Sorting by coordinate
    // projection would be ambiguous for tilted symbols; keeping insertion order
    // is already source order, but make it deterministic for the rare case in
    // which semantic emission order differs from source traversal.
    const byX = left.x - right.x;
    if (Math.abs(byX) > MOVE_AXIS_EPSILON) {
      return byX;
    }
    return left.y - right.y;
  });
}

function resistorMoveAxis(points: readonly WorldPoint[]): MoveAxis | null {
  if (points.length < MIN_RESISTOR_POINT_COUNT) {
    return null;
  }

  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    return null;
  }

  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const length = Math.hypot(dx, dy);
  if (length <= MOVE_AXIS_EPSILON) {
    return null;
  }

  let axis: MoveAxis;
  let alongSpan: number;
  if (absDx >= absDy) {
    if (absDy > Math.max(MOVE_AXIS_EPSILON, absDx * 0.12)) {
      return null;
    }
    axis = "x";
    alongSpan = absDx;
  } else {
    if (absDx > Math.max(MOVE_AXIS_EPSILON, absDy * 0.12)) {
      return null;
    }
    axis = "y";
    alongSpan = absDy;
  }

  const ux = dx / length;
  const uy = dy / length;
  const middle = points.slice(1, -1);
  if (middle.length < MIN_RESISTOR_ALTERNATIONS + 1) {
    return null;
  }

  let previousSign = 0;
  let alternations = 0;
  let previousProjection = Number.NEGATIVE_INFINITY;
  for (const point of middle) {
    const relativeX = point.x - first.x;
    const relativeY = point.y - first.y;
    const projection = (relativeX * ux + relativeY * uy) / alongSpan;
    if (
      projection < MIN_RESISTOR_PROJECTION ||
      projection > MAX_RESISTOR_PROJECTION ||
      projection <= previousProjection + MOVE_AXIS_EPSILON
    ) {
      return null;
    }
    previousProjection = projection;

    // Signed perpendicular distance from the first→last baseline.  Resistor
    // templates contain short collinear lead-in/out segments on the baseline;
    // skip those while still requiring alternating peaks above/below it.
    const perpendicular = relativeX * uy - relativeY * ux;
    if (Math.abs(perpendicular) <= MOVE_AXIS_EPSILON) {
      continue;
    }
    const sign = Math.sign(perpendicular);
    if (previousSign !== 0 && sign !== previousSign) {
      alternations += 1;
    }
    previousSign = sign;
  }

  return alternations >= MIN_RESISTOR_ALTERNATIONS ? axis : null;
}
