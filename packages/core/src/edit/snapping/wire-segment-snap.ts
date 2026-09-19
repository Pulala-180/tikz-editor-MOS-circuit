import { worldPoint } from "../../coords/points.js";
import { pt } from "../../coords/scalars.js";
import type { WorldPoint } from "../../coords/points.js";
import type { SceneElement } from "../../semantic/types.js";

export interface WireSegment {
  sourceId: string;
  p1: WorldPoint;
  p2: WorldPoint;
}

export interface WireSegmentSnapResult {
  wireSourceId: string;
  p1: WorldPoint;
  p2: WorldPoint;
  projectedPoint: WorldPoint;
  t: number;
  distancePx: number;
}

/**
 * Finds the nearest point on any existing wire segment within a pixel threshold.
 * Constrains projection parameter t to (0.04, 0.96) so it attaches to the trunk line
 * rather than conflicting with existing pin anchors at the endpoints.
 */
export function findNearestWireSegmentSnap(
  pointerWorld: WorldPoint,
  wires: readonly WireSegment[],
  zoom: number,
  thresholdPx: number = 18
): WireSegmentSnapResult | null {
  const thresholdWorld = thresholdPx / Math.max(zoom, 1e-3);
  let best: WireSegmentSnapResult | null = null;
  let minDistance = thresholdWorld;

  for (const wire of wires) {
    const vx = wire.p2.x - wire.p1.x;
    const vy = wire.p2.y - wire.p1.y;
    const lenSq = vx * vx + vy * vy;
    if (lenSq < 1e-4) continue;

    // Parameterized orthogonal projection: t = ((P - A) . (B - A)) / |B - A|^2
    const t = ((pointerWorld.x - wire.p1.x) * vx + (pointerWorld.y - wire.p1.y) * vy) / lenSq;

    if (t > 0.04 && t < 0.96) {
      const projX = wire.p1.x + t * vx;
      const projY = wire.p1.y + t * vy;
      const dist = Math.hypot(pointerWorld.x - projX, pointerWorld.y - projY);

      if (dist < minDistance) {
        minDistance = dist;
        best = {
          wireSourceId: wire.sourceId,
          p1: wire.p1,
          p2: wire.p2,
          projectedPoint: worldPoint(pt(projX), pt(projY)),
          t,
          distancePx: dist * zoom
        };
      }
    }
  }

  return best;
}

/**
 * Finds an existing wire segment that `point` sits on (within `toleranceWorld`) and away
 * from its very ends -- i.e. a T-junction host. Endpoint-to-endpoint touches are excluded
 * by the same [0.04, 0.96] span guard used for snapping, so an ordinary corner where two
 * wires meet does not read as a junction.
 */
export function findWireSegmentAtPoint(
  point: WorldPoint,
  wires: readonly WireSegment[],
  toleranceWorld: number
): WireSegment | null {
  for (const wire of wires) {
    const vx = wire.p2.x - wire.p1.x;
    const vy = wire.p2.y - wire.p1.y;
    const lenSq = vx * vx + vy * vy;
    if (lenSq < 1e-4) continue;

    const t = ((point.x - wire.p1.x) * vx + (point.y - wire.p1.y) * vy) / lenSq;
    if (t <= 0.04 || t >= 0.96) continue;

    const projX = wire.p1.x + t * vx;
    const projY = wire.p1.y + t * vy;
    if (Math.hypot(point.x - projX, point.y - projY) <= toleranceWorld) {
      return wire;
    }
  }
  return null;
}

/**
 * Flattens scene paths into straight segments so a routing pointer can be projected onto
 * an existing wire trunk. Curves and arcs break the chain instead of being approximated.
 */
export function collectWireSegmentsFromScene(elements: readonly SceneElement[]): WireSegment[] {
  const segments: WireSegment[] = [];

  for (const element of elements) {
    if (element.kind !== "Path") continue;
    if (element.commands.length < 2) continue;

    let current: WorldPoint | null = null;
    for (const command of element.commands) {
      if (command.kind === "M") {
        current = command.to;
      } else if (command.kind === "L") {
        if (current) {
          segments.push({ sourceId: element.sourceRef.sourceId, p1: current, p2: command.to });
        }
        current = command.to;
      } else {
        current = null;
      }
    }
  }

  return segments;
}
