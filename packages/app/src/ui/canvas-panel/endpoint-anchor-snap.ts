import { worldBounds, worldPoint, pt } from "tikz-editor/coords/index";
import { collectWireSegmentsFromScene, findWireSegmentAtPoint } from "tikz-editor/edit/snapping";
import type { NodeAnchorTarget, SceneElement } from "tikz-editor/semantic/types";
import type { WireSourceKind } from "../../store/types";
import type { WorldBounds, WorldPoint } from "../coords/types";

const NODE_REVEAL_RADIUS_PX = 60;
const SNAP_RADIUS_PX = 20;
const RELEASE_RADIUS_PX = 32;

export type EndpointAnchorSnapResult = {
  visibleAnchors: NodeAnchorTarget[];
  snappedAnchor: NodeAnchorTarget | null;
};

export type MatrixCellAnchorHint = {
  matrixSourceId: string;
  cellSourceId: string;
  row: number;
  column: number;
  bounds: WorldBounds;
};

export function resolveEndpointAnchorSnap(input: {
  pointerWorld: WorldPoint;
  zoom: number;
  nodeAnchorTargets: readonly NodeAnchorTarget[];
  matrixCellAnchorHints?: readonly MatrixCellAnchorHint[];
  previousSnappedAnchor?: NodeAnchorTarget | null;
}): EndpointAnchorSnapResult {
  const zoom = Math.max(input.zoom, 1e-6);
  if (input.nodeAnchorTargets.length === 0) {
    return {
      visibleAnchors: [],
      snappedAnchor: null
    };
  }

  const revealNodeRadius = NODE_REVEAL_RADIUS_PX / zoom;
  const snapRadius = SNAP_RADIUS_PX / zoom;
  const releaseRadius = RELEASE_RADIUS_PX / zoom;
  const revealNodeRadiusSq = revealNodeRadius * revealNodeRadius;
  const snapRadiusSq = snapRadius * snapRadius;
  const releaseRadiusSq = releaseRadius * releaseRadius;

  const byNode = new Map<string, NodeAnchorTarget[]>();
  for (const target of input.nodeAnchorTargets) {
    const key = nodeAnchorTargetKey(target);
    const existing = byNode.get(key);
    if (existing) {
      existing.push(target);
    } else {
      byNode.set(key, [target]);
    }
  }

  const visibleAnchorGroups: NodeAnchorTarget[][] = [];
  const nearestMatrixCellHint = resolveNearestMatrixCellHint(input.pointerWorld, input.matrixCellAnchorHints ?? []);
  const preferredMatrixCellAnchors = nearestMatrixCellHint
    ? resolvePreferredMatrixCellAnchors(byNode, nearestMatrixCellHint.row, nearestMatrixCellHint.column, input.pointerWorld)
    : null;

  for (const anchors of byNode.values()) {
    const extent = deriveNodeExtent(anchors);
    if (!extent) {
      continue;
    }
    const distSq = distanceSquaredToBounds(input.pointerWorld, extent);
    if (distSq <= revealNodeRadiusSq) {
      visibleAnchorGroups.push(anchors);
    }
  }

  if (
    preferredMatrixCellAnchors &&
    preferredMatrixCellAnchors.distanceSq <= revealNodeRadiusSq &&
    preferredMatrixCellAnchors.anchors.length > 0
  ) {
    visibleAnchorGroups.push(preferredMatrixCellAnchors.anchors);
    const relatedMatrixAnchors = resolveRelatedMatrixNodeAnchors(byNode, preferredMatrixCellAnchors.anchors, input.pointerWorld);
    if (relatedMatrixAnchors && relatedMatrixAnchors.distanceSq <= revealNodeRadiusSq) {
      visibleAnchorGroups.push(relatedMatrixAnchors.anchors);
    }
  }

  if (visibleAnchorGroups.length === 0) {
    return {
      visibleAnchors: [],
      snappedAnchor: null
    };
  }

  const uniqueVisibleAnchors = new Map<string, NodeAnchorTarget>();
  for (const group of visibleAnchorGroups) {
    for (const anchor of group) {
      if (anchor.tier !== "basic") {
        continue;
      }
      uniqueVisibleAnchors.set(`${nodeAnchorTargetKey(anchor)}:${anchor.anchor}`, anchor);
    }
  }
  const visibleAnchors = [...uniqueVisibleAnchors.values()].sort((left, right) => {
    const byNode = nodeAnchorTargetKey(left).localeCompare(nodeAnchorTargetKey(right));
    if (byNode !== 0) {
      return byNode;
    }
    return left.anchor.localeCompare(right.anchor);
  });

  let snappedAnchor: NodeAnchorTarget | null = null;
  let snappedDistanceSq = Number.POSITIVE_INFINITY;

  if (input.previousSnappedAnchor) {
    const prevKey = `${nodeAnchorTargetKey(input.previousSnappedAnchor)}:${input.previousSnappedAnchor.anchor}`;
    const matchingInVisible = visibleAnchors.find(
      (a) => `${nodeAnchorTargetKey(a)}:${a.anchor}` === prevKey
    );
    if (matchingInVisible) {
      const distSq = distanceSquared(matchingInVisible.world, input.pointerWorld);
      if (distSq <= releaseRadiusSq) {
        snappedAnchor = matchingInVisible;
        snappedDistanceSq = distSq;
      }
    }
  }

  if (!snappedAnchor) {
    for (const anchor of visibleAnchors) {
      const distSq = distanceSquared(anchor.world, input.pointerWorld);
      if (distSq > snapRadiusSq || distSq >= snappedDistanceSq) {
        continue;
      }
      snappedDistanceSq = distSq;
      snappedAnchor = anchor;
    }
  }

  return {
    visibleAnchors,
    snappedAnchor
  };
}

function nodeAnchorTargetKey(target: NodeAnchorTarget): string {
  const nodeName = target.nodeName.trim();
  if (nodeName.length > 0) {
    return nodeName;
  }
  return target.nodeSourceId?.trim() ?? "";
}

function resolveNearestMatrixCellHint(
  pointerWorld: WorldPoint,
  hints: readonly MatrixCellAnchorHint[]
): MatrixCellAnchorHint | null {
  let nearest: MatrixCellAnchorHint | null = null;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;
  for (const hint of hints) {
    const distanceSq = distanceSquaredToBounds(pointerWorld, hint.bounds);
    if (distanceSq >= nearestDistanceSq) {
      continue;
    }
    nearest = hint;
    nearestDistanceSq = distanceSq;
  }
  return nearest;
}

function resolvePreferredMatrixCellAnchors(
  anchorsByNode: ReadonlyMap<string, NodeAnchorTarget[]>,
  row: number,
  column: number,
  pointerWorld: WorldPoint
): { anchors: NodeAnchorTarget[]; distanceSq: number } | null {
  let best: { anchors: NodeAnchorTarget[]; distanceSq: number } | null = null;
  for (const [nodeName, anchors] of anchorsByNode.entries()) {
    const parsed = parseTrailingMatrixCellIndices(nodeName);
    if (parsed?.row !== row || parsed.column !== column) {
      continue;
    }
    const extent = deriveNodeExtent(anchors);
    if (!extent) {
      continue;
    }
    const distanceSq = distanceSquaredToBounds(pointerWorld, extent);
    if (!best || distanceSq < best.distanceSq) {
      best = { anchors, distanceSq };
    }
  }
  return best;
}

function resolveRelatedMatrixNodeAnchors(
  anchorsByNode: ReadonlyMap<string, NodeAnchorTarget[]>,
  preferredCellAnchors: readonly NodeAnchorTarget[],
  pointerWorld: WorldPoint
): { anchors: NodeAnchorTarget[]; distanceSq: number } | null {
  let best: { anchors: NodeAnchorTarget[]; distanceSq: number } | null = null;
  for (const anchor of preferredCellAnchors) {
    const parsed = parseTrailingMatrixCellIndices(anchor.nodeName);
    if (!parsed) {
      continue;
    }
    const baseNodeName = anchor.nodeName.slice(0, parsed.suffixStart);
    if (!baseNodeName) {
      continue;
    }
    const anchors = anchorsByNode.get(baseNodeName);
    if (!anchors || anchors.length === 0) {
      continue;
    }
    const extent = deriveNodeExtent(anchors);
    if (!extent) {
      continue;
    }
    const distanceSq = distanceSquaredToBounds(pointerWorld, extent);
    if (!best || distanceSq < best.distanceSq) {
      best = { anchors, distanceSq };
    }
  }
  return best;
}

function parseTrailingMatrixCellIndices(nodeName: string): { row: number; column: number; suffixStart: number } | null {
  const match = /-(\d+)-(\d+)$/.exec(nodeName.trim());
  if (!match) {
    return null;
  }
  const row = Number.parseInt(match[1] ?? "", 10);
  const column = Number.parseInt(match[2] ?? "", 10);
  if (!Number.isInteger(row) || !Number.isInteger(column) || row <= 0 || column <= 0) {
    return null;
  }
  return { row, column, suffixStart: match.index };
}

function distanceSquared(a: WorldPoint, b: WorldPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function deriveNodeExtent(
  anchors: readonly NodeAnchorTarget[]
): WorldBounds | null {
  const candidates = anchors.filter((anchor) => anchor.tier === "basic");
  const source = candidates.length > 0 ? candidates : anchors;
  if (source.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const anchor of source) {
    minX = Math.min(minX, anchor.world.x);
    minY = Math.min(minY, anchor.world.y);
    maxX = Math.max(maxX, anchor.world.x);
    maxY = Math.max(maxY, anchor.world.y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return worldBounds(pt(minX), pt(minY), pt(maxX), pt(maxY));
}

function distanceSquaredToBounds(
  point: WorldPoint,
  bounds: WorldBounds
): number {
  const clampedX = Math.min(bounds.maxX, Math.max(bounds.minX, point.x));
  const clampedY = Math.min(bounds.maxY, Math.max(bounds.minY, point.y));
  const dx = point.x - clampedX;
  const dy = point.y - clampedY;
  return dx * dx + dy * dy;
}

/** World pt per cm — matches the canvas' TikZ conversion. */
const PT_PER_CM = 28.4527559;
/** A junction dot we emit is `circle (0.06)` (≈1.7 world pt); anything up to 3pt reads as one. */
const JUNCTION_DOT_MAX_RADIUS_WORLD = 3;
/**
 * How close (world pt) the resolved wire start must sit to a wire trunk to count as starting on it.
 * The snap pipeline projects the pointer exactly onto the trunk, so the start is either on it or
 * nowhere near it — this only absorbs float noise, and stays far below the snap threshold so mere
 * proximity never mislabels a plain grid point as a route.
 */
const ROUTE_ON_TRUNK_TOLERANCE_WORLD = 0.5;

export type WireStartResolution = {
  kind: WireSourceKind;
  /** Kind-specific identity: `nodeName:anchor`, a source id, or `x,y` in cm. */
  id: string;
  /** Where the wire should actually begin (snapped onto the junction dot when one was hit). */
  world: WorldPoint;
};

/**
 * Classifies where a wire draft is about to start, mirroring the geometry the snap pipeline already
 * committed to. Priority is specificity: a pin beats a junction dot, a junction dot beats a bare
 * trunk, and anything else is an empty grid point.
 */
export function resolveWireStartSource(input: {
  pointerWorld: WorldPoint;
  startWorld: WorldPoint;
  snappedAnchor: NodeAnchorTarget | null;
  sceneElements: readonly SceneElement[];
  zoom: number;
  thresholdPx?: number;
}): WireStartResolution {
  const thresholdWorld = (input.thresholdPx ?? 18) / Math.max(input.zoom, 1e-3);

  if (input.snappedAnchor) {
    const nodeName = input.snappedAnchor.nodeName?.trim()
      || input.snappedAnchor.nodeSourceId?.trim()
      || "?";
    return {
      kind: "terminal",
      id: `${nodeName}:${input.snappedAnchor.anchor}`,
      world: input.startWorld
    };
  }

  const junction = findJunctionDotAt(input.pointerWorld, input.sceneElements, thresholdWorld);
  if (junction) {
    return { kind: "junction", id: junction.sourceId, world: junction.center };
  }

  const trunk = findWireSegmentAtPoint(
    input.startWorld,
    collectWireSegmentsFromScene(input.sceneElements),
    ROUTE_ON_TRUNK_TOLERANCE_WORLD
  );
  if (trunk) {
    return { kind: "route", id: trunk.sourceId, world: input.startWorld };
  }

  return { kind: "grid", id: formatGridId(input.startWorld), world: input.startWorld };
}

/**
 * Junction dots are ordinary scene geometry, so they are addressable by source id rather than being
 * opaque source text. Depending on whether the fill compounds the subpath, the dot parses either as
 * a `SceneCircle` or as a `ScenePath` carrying `shapeHint: "circle"` — both are handled. A small
 * circle near the pointer is the junction it belongs to.
 */
function findJunctionDotAt(
  pointerWorld: WorldPoint,
  elements: readonly SceneElement[],
  thresholdWorld: number
): { sourceId: string; center: WorldPoint } | null {
  let best: { sourceId: string; center: WorldPoint } | null = null;
  let bestDistance = thresholdWorld;
  for (const element of elements) {
    const disk = elementDisk(element);
    if (!disk || disk.radius > JUNCTION_DOT_MAX_RADIUS_WORLD) {
      continue;
    }
    const distance = Math.hypot(disk.center.x - pointerWorld.x, disk.center.y - pointerWorld.y);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = { sourceId: element.sourceRef.sourceId, center: disk.center };
    }
  }
  return best;
}

/** Center + radius of a circular element, for either its `Circle` or compounded-`Path` form. */
function elementDisk(element: SceneElement): { center: WorldPoint; radius: number } | null {
  if (element.kind === "Circle") {
    return { center: element.center, radius: element.radius };
  }
  if (element.kind !== "Path" || element.shapeHint !== "circle") {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const command of element.commands) {
    const points =
      command.kind === "C"
        ? [command.c1, command.c2, command.to]
        : command.kind === "M" || command.kind === "L" || command.kind === "A"
          ? [command.to]
          : [];
    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  if (!Number.isFinite(minX)) {
    return null;
  }
  return {
    center: worldPoint(pt((minX + maxX) / 2), pt((minY + maxY) / 2)),
    radius: Math.max(maxX - minX, maxY - minY) / 2
  };
}

function formatGridId(world: WorldPoint): string {
  return `${(world.x / PT_PER_CM).toFixed(2)},${(world.y / PT_PER_CM).toFixed(2)}`;
}
