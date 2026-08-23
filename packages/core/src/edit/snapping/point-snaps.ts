import { worldPoint } from "../../coords/points.js";
import { pt } from "../../coords/scalars.js";
import type { WorldPoint } from "../../coords/points.js";
import type {
  Axis,
  AxisMinOffset,
  AxisSnapBuckets,
  PointSnapCandidate,
  SnapLine,
  SnapPoint
} from "./types.js";
import { SNAP_EPSILON } from "./geometry.js";

export function collectPointSnaps({
  selectionPoints,
  referencePoints,
  minOffset,
  nearest,
  kind,
  enabledAxis
}: {
  selectionPoints: readonly WorldPoint[];
  referencePoints: readonly (SnapPoint | WorldPoint)[];
  minOffset: AxisMinOffset;
  nearest: AxisSnapBuckets;
  kind: "point" | "grid";
  enabledAxis?: Axis | null;
}): void {
  for (const from of selectionPoints) {
    for (const to of referencePoints) {
      const offsetX = to.x - from.x;
      const offsetY = to.y - from.y;

      if (enabledAxis !== "y") {
        const absX = Math.abs(offsetX);
        if (absX <= minOffset.x + SNAP_EPSILON) {
          if (absX + SNAP_EPSILON < minOffset.x) {
            nearest.x.length = 0;
          }

          nearest.x.push({
            kind,
            axis: "x",
            from: worldPoint(pt(from.x), pt(from.y)),
            to: worldPoint(pt(to.x), pt(to.y)),
            offset: offsetX,
            key: roundSnapValue(to.x)
          });
          minOffset.x = absX;
        }
      }

      if (enabledAxis !== "x") {
        const absY = Math.abs(offsetY);
        if (absY <= minOffset.y + SNAP_EPSILON) {
          if (absY + SNAP_EPSILON < minOffset.y) {
            nearest.y.length = 0;
          }

          nearest.y.push({
            kind,
            axis: "y",
            from: worldPoint(pt(from.x), pt(from.y)),
            to: worldPoint(pt(to.x), pt(to.y)),
            offset: offsetY,
            key: roundSnapValue(to.y)
          });
          minOffset.y = absY;
        }
      }
    }
  }
}

export function collectGuideSnaps({
  selectionPoints,
  guides,
  minOffset,
  nearest,
  enabledAxis
}: {
  selectionPoints: readonly WorldPoint[];
  guides: { x: readonly number[]; y: readonly number[] };
  minOffset: AxisMinOffset;
  nearest: AxisSnapBuckets;
  enabledAxis?: Axis | null;
}): void {
  for (const from of selectionPoints) {
    if (enabledAxis !== "y") {
      for (const guideX of guides.x) {
        const offsetX = guideX - from.x;
        const absX = Math.abs(offsetX);
        if (absX <= minOffset.x + SNAP_EPSILON) {
          if (absX + SNAP_EPSILON < minOffset.x) {
            nearest.x.length = 0;
          }

          nearest.x.push({
            kind: "guide",
            axis: "x",
            from: worldPoint(pt(from.x), pt(from.y)),
            to: worldPoint(pt(guideX), pt(from.y)),
            offset: offsetX,
            key: roundSnapValue(guideX)
          });
          minOffset.x = absX;
        }
      }
    }

    if (enabledAxis !== "x") {
      for (const guideY of guides.y) {
        const offsetY = guideY - from.y;
        const absY = Math.abs(offsetY);
        if (absY <= minOffset.y + SNAP_EPSILON) {
          if (absY + SNAP_EPSILON < minOffset.y) {
            nearest.y.length = 0;
          }

          nearest.y.push({
            kind: "guide",
            axis: "y",
            from: worldPoint(pt(from.x), pt(from.y)),
            to: worldPoint(pt(from.x), pt(guideY)),
            offset: offsetY,
            key: roundSnapValue(guideY)
          });
          minOffset.y = absY;
        }
      }
    }
  }
}

export function pointSnapOffset(nearest: AxisSnapBuckets): WorldPoint {
  const xSnap = nearest.x.find((snap): snap is PointSnapCandidate => snap.kind !== "gap");
  const ySnap = nearest.y.find((snap): snap is PointSnapCandidate => snap.kind !== "gap");

  return worldPoint(pt(xSnap?.offset ?? 0), pt(ySnap?.offset ?? 0));
}

export function createPointSnapLines(nearest: AxisSnapBuckets): SnapLine[] {
  const lines: SnapLine[] = [];
  const seen = new Set<string>();

  for (const snap of nearest.x) {
    if (snap.kind !== "point") {
      continue;
    }
    const from = worldPoint(pt(snap.to.x), pt(snap.from.y));
    const to = worldPoint(pt(snap.to.x), pt(snap.to.y));
    const key = makeLineKey("x", from, to);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const isCoincident = Math.abs(from.x - to.x) < 1e-4 && Math.abs(from.y - to.y) < 1e-4;
    lines.push({
      type: "points",
      axis: "x",
      points: [from, to],
      is2DSnapped: isCoincident
    });
  }

  for (const snap of nearest.y) {
    if (snap.kind !== "point") {
      continue;
    }
    const from = worldPoint(pt(snap.from.x), pt(snap.to.y));
    const to = worldPoint(pt(snap.to.x), pt(snap.to.y));
    const key = makeLineKey("y", from, to);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const isCoincident = Math.abs(from.x - to.x) < 1e-4 && Math.abs(from.y - to.y) < 1e-4;
    lines.push({
      type: "points",
      axis: "y",
      points: [from, to],
      is2DSnapped: isCoincident
    });
  }

  return lines;
}

export function createPointerLinesForPointSnap(nearest: AxisSnapBuckets, snappedPoint: WorldPoint): SnapLine[] {
  const lines: SnapLine[] = [];
  const xSnap = nearest.x.find((snap): snap is PointSnapCandidate => snap.kind === "point");
  const ySnap = nearest.y.find((snap): snap is PointSnapCandidate => snap.kind === "point");
  const is2DSnapped = Boolean(xSnap && ySnap);

  if (xSnap) {
    lines.push({
      type: "pointer",
      axis: "x",
      from: worldPoint(pt(xSnap.to.x), pt(xSnap.to.y)),
      to: worldPoint(pt(xSnap.to.x), pt(snappedPoint.y)),
      is2DSnapped
    });
  }

  if (ySnap) {
    lines.push({
      type: "pointer",
      axis: "y",
      from: worldPoint(pt(ySnap.to.x), pt(ySnap.to.y)),
      to: worldPoint(pt(snappedPoint.x), pt(ySnap.to.y)),
      is2DSnapped
    });
  }

  return lines;
}

export function createEmptySnapBuckets(): AxisSnapBuckets {
  return {
    x: [],
    y: []
  };
}

export function createMinOffset(threshold: number, enabledAxis?: Axis | null): AxisMinOffset {
  return {
    x: enabledAxis === "y" ? 0 : Math.max(0, threshold),
    y: enabledAxis === "x" ? 0 : Math.max(0, threshold)
  };
}

export function roundSnapValue(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function makeLineKey(
  axis: Axis,
  from: WorldPoint,
  to: WorldPoint
): string {
  const ax = roundSnapValue(from.x);
  const ay = roundSnapValue(from.y);
  const bx = roundSnapValue(to.x);
  const by = roundSnapValue(to.y);
  if (axis === "x") {
    return `${axis}:${ax}:${Math.min(ay, by)}:${Math.max(ay, by)}`;
  }
  return `${axis}:${ay}:${Math.min(ax, bx)}:${Math.max(ax, bx)}`;
}
