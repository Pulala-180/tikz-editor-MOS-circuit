import { worldPoint, pt } from "tikz-editor/coords/index";
import type { WorldPoint } from "tikz-editor/coords/index";

export type WireRoutingMode = "orthogonal" | "octagonal45" | "anyAngle";
export type OrthoOrientation = "HV" | "VH";

const PT_TO_CM = 28.4527559;

export function formatCm(pointsPt: number): string {
  return (pointsPt / PT_TO_CM).toFixed(2);
}

/**
 * Computes waypoints between start and end according to the specified routing mode.
 */
export function computeWireWaypoints(
  p1: WorldPoint,
  p2: WorldPoint,
  mode: WireRoutingMode = "orthogonal",
  orientation: OrthoOrientation = "HV"
): WorldPoint[] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx < 1e-3 && absDy < 1e-3) {
    return [p1];
  }

  if (mode === "anyAngle" || absDx < 1e-3 || absDy < 1e-3) {
    return [p1, p2];
  }

  if (mode === "orthogonal") {
    if (orientation === "HV") {
      const corner = worldPoint(pt(p2.x), pt(p1.y));
      return [p1, corner, p2];
    } else {
      const corner = worldPoint(pt(p1.x), pt(p2.y));
      return [p1, corner, p2];
    }
  }

  if (mode === "octagonal45") {
    // 45° octagonal router: symmetric 3-segment routing for StrongArm cross-coupled pairs
    if (absDx >= absDy) {
      const stub = (absDx - absDy) / 2;
      const c1 = worldPoint(pt(p1.x + Math.sign(dx) * stub), pt(p1.y));
      const c2 = worldPoint(pt(c1.x + Math.sign(dx) * absDy), pt(p2.y));
      return [p1, c1, c2, p2];
    } else {
      const stub = (absDy - absDx) / 2;
      const c1 = worldPoint(pt(p1.x), pt(p1.y + Math.sign(dy) * stub));
      const c2 = worldPoint(pt(p2.x), pt(c1.y + Math.sign(dy) * absDx));
      return [p1, c1, c2, p2];
    }
  }

  return [p1, p2];
}

/** A wire endpoint that references a named TikZ anchor instead of a fixed coordinate. */
export type WireEndpointRef = {
  nodeName: string;
  anchor: string;
};

/** `(node_M1)` for the default anchor, `(node_M1.d)` otherwise. */
export function formatAnchorRef(ref: WireEndpointRef): string {
  const anchor = (ref.anchor ?? "").trim();
  return anchor.length === 0 || anchor === "center" ? `(${ref.nodeName})` : `(${ref.nodeName}.${anchor})`;
}

/**
 * Formats waypoints into standard TikZ syntax.
 *
 * The first and last waypoint may be given as anchor references. A 2-leg route whose middle point
 * is the orthogonal corner of its two ends is written with TikZ's `-|` / `|-` operator rather than
 * an explicit corner coordinate: the operator RECOMPUTES the corner from its endpoints, so a wire
 * attached to a pin stays orthogonal when that pin moves. A hard-coded corner is left behind by the
 * move and the segment gets dragged into a diagonal.
 */
export function formatTikzWireSnippet(
  waypoints: readonly WorldPoint[],
  options: {
    strokeStyle?: string;
    fromAnchor?: WireEndpointRef | null;
    toAnchor?: WireEndpointRef | null;
  } = {}
): string {
  if (waypoints.length < 2) return "";
  // Match the component bodies' weight (0.32mm) rather than TikZ's `thick`: a wire should read as
  // the same line as the part it connects to, not a heavier one.
  const style = options.strokeStyle ?? "line width=0.32mm, line cap=round";

  // Only when a real anchor end is involved. A hand-authored corner (a manual waypoint) is a
  // deliberate choice, so a plain polyline must stay an explicit coordinate list.
  if (waypoints.length === 3 && (options.fromAnchor ?? options.toAnchor)) {
    const [a, mid, b] = waypoints;
    const asCoord = (p: WorldPoint): string => `(${formatCm(p.x)},${formatCm(p.y)})`;
    const first = options.fromAnchor ? formatAnchorRef(options.fromAnchor) : asCoord(a);
    const last = options.toAnchor ? formatAnchorRef(options.toAnchor) : asCoord(b);
    const CORNER_EPS = 1e-6;
    // `-|` bends at (last.x, first.y); `|-` bends at (first.x, last.y). See
    // packages/core/src/semantic/path/segments.ts.
    if (Math.abs(mid.x - b.x) < CORNER_EPS && Math.abs(mid.y - a.y) < CORNER_EPS) {
      return `\\draw[${style}] ${first} -| ${last};\n`;
    }
    if (Math.abs(mid.x - a.x) < CORNER_EPS && Math.abs(mid.y - b.y) < CORNER_EPS) {
      return `\\draw[${style}] ${first} |- ${last};\n`;
    }
  }

  const coords = waypoints
    .map((p, index) => {
      const ref =
        index === 0
          ? options.fromAnchor
          : index === waypoints.length - 1
            ? options.toAnchor
            : null;
      return ref ? formatAnchorRef(ref) : `(${formatCm(p.x)},${formatCm(p.y)})`;
    })
    .join(" -- ");
  return `\\draw[${style}] ${coords};\n`;
}

/**
 * Formats a junction dot snippet at a world point.
 */
export function formatJunctionDotSnippet(point: WorldPoint): string {
  return `\\draw[line width=0.32mm, fill=black] (${formatCm(point.x)},${formatCm(point.y)}) circle (0.06);\n`;
}

