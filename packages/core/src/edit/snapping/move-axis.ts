import type { EditHandle, SceneElement, NodeAnchorTarget } from "../../semantic/types.js";
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
    nodeAnchorTargets?: readonly NodeAnchorTarget[];
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
    const axis = resistorMoveAxis(points);
    if (!axis) {
      continue;
    }
    if (resolved && resolved !== axis) {
      return null;
    }
    resolved = axis;
  }

  // 3. Attached straight wire axis inheritance (Trunk interior dots, Terminals VDD/GND/Vin/Vout, wired components)
  if (!resolved && sceneElements.length > 0) {
    resolved = attachedWireAxisConstraint(editHandles, selected, sceneElements);
  }

  // 4. Two-terminal component anchors (Capacitor, Source, Resistor scope, etc.)
  if (!resolved && options.nodeAnchorTargets && options.nodeAnchorTargets.length > 0) {
    const selectedHandles = editHandles.filter((h) => selected.has(h.sourceRef.sourceId));
    resolved = twoTerminalComponentMoveAxis(selectedHandles, options.nodeAnchorTargets);
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
    const sId = el.sourceRef.sourceId;
    if (sId.includes("node_") || sId.startsWith("scope:")) {
      componentPortSourceIds.add(sId);
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

  // Also check if any selected port sits in the interior of a wire segment (T-junction / tap dot)
  for (const element of sceneElements) {
    if (element.kind !== "Path" || selected.has(element.sourceRef.sourceId)) {
      continue;
    }
    if (element.commands.some((command) => command.kind === "Z")) {
      continue;
    }
    const handles = editHandles
      .filter((h) => h.kind === "path-point" && h.sourceRef.sourceId === element.sourceRef.sourceId)
      .sort((a, b) => a.sourceRef.sourceSpan.from - b.sourceRef.sourceSpan.from);
    if (handles.length === 2) {
      const p1 = handles[0]!.world;
      const p2 = handles[1]!.world;
      const lineX = (p1.x + p2.x) / 2;
      const lineY = (p1.y + p2.y) / 2;
      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);
      const isV = Math.abs(p2.x - p1.x) <= 1.0 && Math.abs(p2.y - p1.y) > 1.0;
      const isH = Math.abs(p2.y - p1.y) <= 1.0 && Math.abs(p2.x - p1.x) > 1.0;
      for (const port of selectedPorts) {
        if (
          isV &&
          Math.abs(port.x - lineX) <= ATTACHED_WIRE_EPSILON_PT &&
          port.y >= minY - ATTACHED_WIRE_EPSILON_PT &&
          port.y <= maxY + ATTACHED_WIRE_EPSILON_PT
        ) {
          return true;
        }
        if (
          isH &&
          Math.abs(port.y - lineY) <= ATTACHED_WIRE_EPSILON_PT &&
          port.x >= minX - ATTACHED_WIRE_EPSILON_PT &&
          port.x <= maxX + ATTACHED_WIRE_EPSILON_PT
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

function attachedWireAxisConstraint(
  editHandles: readonly EditHandle[],
  selected: ReadonlySet<string>,
  sceneElements: readonly SceneElement[]
): MoveAxis | null {
  const selectedPorts = collectPathEndpointSnapPoints(editHandles, selected);
  if (selectedPorts.length === 0) {
    return null;
  }

  // 1. First priority: check if any selected port sits in the interior of a straight trunk wire (T-junction / tap point, e.g. branch dot)
  for (const element of sceneElements) {
    if (element.kind !== "Path" || selected.has(element.sourceRef.sourceId)) {
      continue;
    }
    if (element.commands.some((command) => command.kind === "Z")) {
      continue;
    }

    const handles = editHandles
      .filter((h) => h.kind === "path-point" && h.sourceRef.sourceId === element.sourceRef.sourceId)
      .sort((a, b) => a.sourceRef.sourceSpan.from - b.sourceRef.sourceSpan.from);
    if (handles.length !== 2) {
      continue;
    }

    const p1 = handles[0]!.world;
    const p2 = handles[1]!.world;
    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);
    const isV = dx <= 1.0 && dy > 1.0;
    const isH = dy <= 1.0 && dx > 1.0;
    if (!isV && !isH) {
      continue;
    }

    for (const port of selectedPorts) {
      if (isV) {
        const lineX = (p1.x + p2.x) / 2;
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);
        if (
          Math.abs(port.x - lineX) <= ATTACHED_WIRE_EPSILON_PT &&
          port.y >= minY - ATTACHED_WIRE_EPSILON_PT &&
          port.y <= maxY + ATTACHED_WIRE_EPSILON_PT
        ) {
          const distToP1 = Math.hypot(port.x - p1.x, port.y - p1.y);
          const distToP2 = Math.hypot(port.x - p2.x, port.y - p2.y);
          if (distToP1 > ATTACHED_WIRE_EPSILON_PT && distToP2 > ATTACHED_WIRE_EPSILON_PT) {
            return "y";
          }
        }
      } else if (isH) {
        const lineY = (p1.y + p2.y) / 2;
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        if (
          Math.abs(port.y - lineY) <= ATTACHED_WIRE_EPSILON_PT &&
          port.x >= minX - ATTACHED_WIRE_EPSILON_PT &&
          port.x <= maxX + ATTACHED_WIRE_EPSILON_PT
        ) {
          const distToP1 = Math.hypot(port.x - p1.x, port.y - p1.y);
          const distToP2 = Math.hypot(port.x - p2.x, port.y - p2.y);
          if (distToP1 > ATTACHED_WIRE_EPSILON_PT && distToP2 > ATTACHED_WIRE_EPSILON_PT) {
            return "x";
          }
        }
      }
    }
  }

  // 2. Second priority: endpoint attached wires (VDD, GND, Vin, Vout, Resistors, etc.)
  const wireOrientations = new Set<"h" | "v">();
  for (const element of sceneElements) {
    if (element.kind !== "Path" || selected.has(element.sourceRef.sourceId)) {
      continue;
    }
    if (element.commands.some((command) => command.kind === "Z")) {
      continue;
    }

    const handles = editHandles
      .filter((h) => h.kind === "path-point" && h.sourceRef.sourceId === element.sourceRef.sourceId)
      .sort((a, b) => a.sourceRef.sourceSpan.from - b.sourceRef.sourceSpan.from);
    if (handles.length !== 2) {
      continue;
    }

    const p1 = handles[0]!.world;
    const p2 = handles[1]!.world;

    const touchesP1 = selectedPorts.some(
      (port) => Math.hypot(port.x - p1.x, port.y - p1.y) <= ATTACHED_WIRE_EPSILON_PT
    );
    const touchesP2 = selectedPorts.some(
      (port) => Math.hypot(port.x - p2.x, port.y - p2.y) <= ATTACHED_WIRE_EPSILON_PT
    );
    if (!touchesP1 && !touchesP2) {
      continue;
    }

    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);
    if (dx <= 1.0 && dy > 1.0) {
      wireOrientations.add("v");
    } else if (dy <= 1.0 && dx > 1.0) {
      wireOrientations.add("h");
    }
  }

  if (wireOrientations.has("v") && !wireOrientations.has("h")) {
    return "y";
  }
  if (wireOrientations.has("h") && !wireOrientations.has("v")) {
    return "x";
  }
  return null;
}

function resistorMoveAxis(points: readonly WorldPoint[]): MoveAxis | null {
  if (points.length < MIN_RESISTOR_POINT_COUNT) {
    return null;
  }

  let ordered = points.slice();
  let first = ordered[0];
  let last = ordered[ordered.length - 1];
  if (!first || !last) {
    return null;
  }

  let dx = last.x - first.x;
  let dy = last.y - first.y;
  let length = Math.hypot(dx, dy);
  if (length <= MOVE_AXIS_EPSILON) {
    return null;
  }

  let absDx = Math.abs(dx);
  let absDy = Math.abs(dy);
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

  // If points were emitted in reverse order, reverse them along the baseline
  const ux0 = dx / length;
  const uy0 = dy / length;
  const second = ordered[1];
  if (second) {
    const projSecond = (second.x - first.x) * ux0 + (second.y - first.y) * uy0;
    if (projSecond < 0) {
      ordered.reverse();
      first = ordered[0]!;
      last = ordered[ordered.length - 1]!;
      dx = last.x - first.x;
      dy = last.y - first.y;
      absDx = Math.abs(dx);
      absDy = Math.abs(dy);
      length = Math.hypot(dx, dy);
      alongSpan = axis === "x" ? absDx : absDy;
    }
  }

  const ux = dx / length;
  const uy = dy / length;
  const middle = ordered.slice(1, -1);
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

    // Signed perpendicular distance from the first→last baseline. Resistor
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

function twoTerminalComponentMoveAxis(
  selectedHandles: readonly EditHandle[],
  nodeAnchorTargets?: readonly NodeAnchorTarget[]
): MoveAxis | null {
  if (!nodeAnchorTargets || nodeAnchorTargets.length === 0) {
    return null;
  }

  const selectedHandleWorlds = selectedHandles.map((h) => h.world);
  if (selectedHandleWorlds.length === 0) {
    return null;
  }

  // Find nodeAnchorTargets that coincide with selected handles
  const matchedTargets: NodeAnchorTarget[] = [];
  for (const target of nodeAnchorTargets) {
    const touches = selectedHandleWorlds.some(
      (w) => Math.hypot(w.x - target.world.x, w.y - target.world.y) <= ATTACHED_WIRE_EPSILON_PT
    );
    if (touches) {
      matchedTargets.push(target);
    }
  }

  if (matchedTargets.length === 0) {
    return null;
  }

  // Group matched targets by nodeName
  const targetsByNode = new Map<string, NodeAnchorTarget[]>();
  for (const t of matchedTargets) {
    const list = targetsByNode.get(t.nodeName);
    if (list) {
      list.push(t);
    } else {
      targetsByNode.set(t.nodeName, [t]);
    }
  }

  for (const targets of targetsByNode.values()) {
    const anchors = new Set(targets.map((t) => t.anchor.toLowerCase()));
    const isV =
      (anchors.has("t") && anchors.has("b")) ||
      (anchors.has("top") && anchors.has("bottom"));
    const isH =
      (anchors.has("l") && anchors.has("r")) ||
      (anchors.has("left") && anchors.has("right"));

    if (isV && !isH) {
      return "y";
    }
    if (isH && !isV) {
      return "x";
    }

    const isBranchDot = targets.some(
      (t) => t.anchor.toLowerCase() === "dot" || t.nodeName.toLowerCase().startsWith("d")
    );
    if (isBranchDot) {
      continue;
    }

    // Geometric fallback: exactly 2 opposite terminal anchors with significant distance along one axis
    if (targets.length === 2) {
      const p1 = targets[0]!.world;
      const p2 = targets[1]!.world;
      const dx = Math.abs(p2.x - p1.x);
      const dy = Math.abs(p2.y - p1.y);
      if (dx <= 1.0 && dy >= 14.0) {
        return "y";
      }
      if (dy <= 1.0 && dx >= 14.0) {
        return "x";
      }
    }
  }

  return null;
}
