import { pt, svgPoint } from "tikz-editor/coords/index";
import type { WorldPoint } from "tikz-editor/coords/index";
import { svgToWorldPoint, worldToSvgPoint } from "./geometry";
import type { OrthoOrientation, WireRoutingMode } from "./wire-routing-helper";
import type { SvgViewBox } from "tikz-editor/svg/types";

type Pt2 = { x: number; y: number };
type Rect2 = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Routing happens entirely in SVG space: that is where component boxes already live, so corridors
 * can be derived from the obstacle edges themselves rather than guessed. Only the winning route is
 * converted back to world coordinates for emission.
 *
 * Score order is deliberate — an obstacle hit dominates everything, then wire coincidence, then
 * length. The feature is "don't cross a part, don't lie on an existing wire"; among routes that are
 * equally clean, shortest wins.
 */
const OBSTACLE_PENALTY = 1e6;
const COINCIDENCE_PENALTY = 1e3;
/**
 * Penalty for a route that turns 90° right at a pin (i.e. ignores its lead's direction). It ranks
 * BELOW an obstacle hit on purpose: crossing a component is worse than an ugly turn, but when
 * nothing is in the way the pin directions win.
 */
const LEADS_PENALTY = 1e4;
const LENGTH_WEIGHT = 1;
/** Gap left between a route and an obstacle edge, in SVG units. */
const CLEARANCE = 10;
const EPS = 1e-6;
/** A pin sits ON its own component's boundary, so containment needs a little slack. */
const OWNER_CONTAIN_SLACK = 1.5;

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function orientation(a: Pt2, b: Pt2, c: Pt2): number {
  const value = cross(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y);
  if (Math.abs(value) < EPS) return 0;
  return value > 0 ? 1 : -1;
}

function onSegment(a: Pt2, b: Pt2, c: Pt2): boolean {
  return (
    Math.min(a.x, b.x) - EPS <= c.x &&
    c.x <= Math.max(a.x, b.x) + EPS &&
    Math.min(a.y, b.y) - EPS <= c.y &&
    c.y <= Math.max(a.y, b.y) + EPS
  );
}

function segmentsIntersect(p1: Pt2, p2: Pt2, p3: Pt2, p4: Pt2): boolean {
  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, p3)) return true;
  if (o2 === 0 && onSegment(p1, p2, p4)) return true;
  if (o3 === 0 && onSegment(p3, p4, p1)) return true;
  if (o4 === 0 && onSegment(p3, p4, p2)) return true;
  return false;
}

function pointInRect(p: Pt2, r: Rect2): boolean {
  return p.x >= r.minX - EPS && p.x <= r.maxX + EPS && p.y >= r.minY - EPS && p.y <= r.maxY + EPS;
}

/** True when the segment touches the rectangle at all (crossing OR passing through). */
export function segmentHitsRect(a: Pt2, b: Pt2, r: Rect2): boolean {
  if (pointInRect(a, r) || pointInRect(b, r)) return true;
  const corners: Pt2[] = [
    { x: r.minX, y: r.minY },
    { x: r.maxX, y: r.minY },
    { x: r.maxX, y: r.maxY },
    { x: r.minX, y: r.maxY }
  ];
  for (let i = 0; i < 4; i += 1) {
    if (segmentsIntersect(a, b, corners[i], corners[(i + 1) % 4])) return true;
  }
  return false;
}

/**
 * Length along which two segments coincide. They must be parallel AND collinear; the overlap is
 * measured as the shared extent along the shared direction.
 */
export function collinearOverlapLength(a1: Pt2, b1: Pt2, a2: Pt2, b2: Pt2): number {
  const dx1 = b1.x - a1.x;
  const dy1 = b1.y - a1.y;
  const dx2 = b2.x - a2.x;
  const dy2 = b2.y - a2.y;
  const len1 = Math.hypot(dx1, dy1);
  const len2 = Math.hypot(dx2, dy2);
  if (len1 < EPS || len2 < EPS) return 0;

  const ux = dx1 / len1;
  const uy = dy1 / len1;
  if (Math.abs(cross(ux, uy, dx2 / len2, dy2 / len2)) > 1e-4) return 0;
  if (Math.abs(cross(ux, uy, a2.x - a1.x, a2.y - a1.y)) > 1e-3) return 0;

  const project = (p: Pt2): number => (p.x - a1.x) * ux + (p.y - a1.y) * uy;
  const lo1 = 0;
  const hi1 = len1;
  const p2a = project(a2);
  const p2b = project(b2);
  const lo2 = Math.min(p2a, p2b);
  const hi2 = Math.max(p2a, p2b);
  return Math.max(0, Math.min(hi1, hi2) - Math.max(lo1, lo2));
}

function distance(a: Pt2, b: Pt2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Drops consecutive duplicates — endpoint alignment collapses some candidates to zero length. */
function dedupeConsecutive(points: Pt2[]): Pt2[] {
  return points.filter(
    (p, i) =>
      i === 0 ||
      Math.abs(p.x - points[i - 1].x) > 1e-9 ||
      Math.abs(p.y - points[i - 1].y) > 1e-9
  );
}

/** Orientation of the lead segment a pin sits on. */
export type LeadAxis = "h" | "v";

/**
 * Orientation of the lead whose endpoint coincides with `point`. This is what a wire must follow:
 * leaving a pin along its own lead's direction, and arriving along the other pin's, is what makes a
 * connection read as deliberate — turning 90° right at the pin does not.
 */
export function leadAxisAt(
  point: { x: number; y: number },
  leads: readonly { p1: { x: number; y: number }; p2: { x: number; y: number } }[],
  tolerance = 0.5
): LeadAxis | null {
  for (const lead of leads) {
    const touches =
      Math.hypot(lead.p1.x - point.x, lead.p1.y - point.y) <= tolerance ||
      Math.hypot(lead.p2.x - point.x, lead.p2.y - point.y) <= tolerance;
    if (!touches) continue;
    const dx = Math.abs(lead.p2.x - lead.p1.x);
    const dy = Math.abs(lead.p2.y - lead.p1.y);
    if (dx > dy) return "h";
    if (dy > dx) return "v";
  }
  return null;
}

export type WireRoutePlanInput = {
  start: WorldPoint;
  end: WorldPoint;
  viewBox: Pick<SvgViewBox, "y" | "height">;
  mode: WireRoutingMode;
  orientation?: OrthoOrientation;
  /** Orientation of the lead at each endpoint, when known (see {@link leadAxisAt}). */
  startLeadAxis?: LeadAxis | null;
  endLeadAxis?: LeadAxis | null;
  /** Component boxes to route around, in SVG space. */
  obstacles?: readonly Rect2[];
  /** Existing wire segments to avoid lying on, in SVG space. */
  existingSegments?: readonly { a: Pt2; b: Pt2 }[];
};

/** A candidate polyline, plus whether it honours both pins' lead directions. */
type RouteCandidate = { points: Pt2[]; respectsLeads: boolean };

/**
 * Orthogonal candidates, shaped by the orientation of the lead each pin sits on.
 *
 * A wire must LEAVE its source pin along that pin's lead direction and ARRIVE at the destination
 * along its lead direction — otherwise it turns 90° right at the pin, which reads as a wrong
 * connection. When the two directions differ the minimal route is a single corner (`-|` / `|-`);
 * when they match, a two-corner Z is required.
 *
 * The direction-agnostic shapes are ALSO returned, tagged `respectsLeads: false`, because a lead
 * direction can be impossible to honour — e.g. both pins lead horizontally and a component sits on
 * the straight line between them. `planWireRoute` ranks an obstacle hit above the leads penalty, so
 * a clean wrong-direction route beats a crossing right-direction one.
 */
function orthogonalCandidates(
  s: Pt2,
  e: Pt2,
  obstacles: readonly Rect2[],
  startAxis: LeadAxis | null,
  endAxis: LeadAxis | null
): RouteCandidate[] {
  const pushing = (target: Pt2[][], points: Pt2[]): void => {
    const deduped = dedupeConsecutive(points);
    if (deduped.length >= 2) {
      target.push(deduped);
    }
  };

  // Perpendicular corridors: obstacle edges (padded by CLEARANCE) plus a few fractions of the span.
  // These are what let a route step around a component.
  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const f of [1 / 3, 1 / 2, 2 / 3]) {
    xs.add(s.x + (e.x - s.x) * f);
    ys.add(s.y + (e.y - s.y) * f);
  }
  for (const r of obstacles) {
    xs.add(r.minX - CLEARANCE);
    xs.add(r.maxX + CLEARANCE);
    ys.add(r.minY - CLEARANCE);
    ys.add(r.maxY + CLEARANCE);
  }

  const respecting: Pt2[][] = [];
  if (startAxis === "v" && endAxis === "h") {
    // Leave vertically, arrive horizontally: the one corner must keep the start's x.
    pushing(respecting, [s, { x: s.x, y: e.y }, e]);
  } else if (startAxis === "h" && endAxis === "v") {
    // Leave horizontally, arrive vertically: the corner must keep the start's y.
    pushing(respecting, [s, { x: e.x, y: s.y }, e]);
  } else if (startAxis === "v" && endAxis === "v") {
    // Both pins lead vertically. A Z would honour BOTH lead directions, but its two hard-coded
    // corners go stale the moment either component moves — the wire gets dragged into a trapezoid.
    // Prefer the fully-relative two-leg corner instead: it is written as TikZ's `|-` / `-|`, so the
    // bend is recomputed from the endpoints and can never skew. Honouring the source lead wins the
    // tie; leaving perpendicular at the far pin is a much smaller cost than a wire that drifts.
    pushing(respecting, [s, { x: s.x, y: e.y }, e]);
  } else if (startAxis === "h" && endAxis === "h") {
    pushing(respecting, [s, { x: e.x, y: s.y }, e]);
  }

  const fallbacks: Pt2[][] = [];
  if (respecting.length === 0) {
    pushing(fallbacks, [s, { x: e.x, y: s.y }, e]);
    pushing(fallbacks, [s, { x: s.x, y: e.y }, e]);
  }
  for (const x of xs) {
    pushing(fallbacks, [s, { x, y: s.y }, { x, y: e.y }, e]);
  }
  for (const y of ys) {
    pushing(fallbacks, [s, { x: s.x, y }, { x: e.x, y }, e]);
  }

  const isSame = (a: Pt2[], b: Pt2[]): boolean =>
    a.length === b.length &&
    a.every((p, i) => Math.abs(p.x - b[i].x) < 1e-6 && Math.abs(p.y - b[i].y) < 1e-6);

  return [
    ...respecting.map((points) => ({ points, respectsLeads: true })),
    ...fallbacks
      .filter((points) => !respecting.some((already) => isSame(already, points)))
      .map((points) => ({ points, respectsLeads: false }))
  ];
}

/**
 * 45° candidates: one straight leftover leg plus one exact 45° leg.
 *
 * The two ends rarely differ by the same amount in x and y, so the difference has to be absorbed by a
 * straight leg. Which pin that leg sits on is what the lead axes decide: the straight leg is placed at
 * the pin whose lead runs ALONG it, so that pin is entered (or left) along its own lead. The other pin
 * is reached by the 45° leg, which no lead direction can match anyway -- a 45° leg is never parallel to
 * a horizontal or vertical lead. When neither pin matches (its lead runs across the leftover axis) the
 * source pin is used, since that is the end the user just grabbed.
 *
 * Both placements are returned as candidates so the shared scorer can still prefer the other one when
 * this one would cross a component or lie on an existing wire. The lead-matching one is listed first,
 * and the scorer keeps the earlier candidate on a tie.
 */
export function fortyFiveCandidates(
  s: Pt2,
  e: Pt2,
  startAxis: LeadAxis | null,
  endAxis: LeadAxis | null
): RouteCandidate[] {
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const a = Math.abs(dx);
  const b = Math.abs(dy);
  if (a < EPS || b < EPS || Math.abs(a - b) <= EPS) {
    // Degenerate, or already exactly 45°: there is no leftover leg, so no lead direction applies.
    return [{ points: dedupeConsecutive([s, e]), respectsLeads: false }];
  }

  const signX = Math.sign(dx);
  const signY = Math.sign(dy);
  const stubAxis: LeadAxis = a > b ? "h" : "v";
  const stub = Math.abs(a - b);
  // One straight leg of `stub`, the other leg exactly 45°: whichever end the stub is left out of, the
  // rest of the span is equal in x and y.
  const stubCornerAtStart: Pt2 = a > b ? { x: s.x + signX * stub, y: s.y } : { x: s.x, y: s.y + signY * stub };
  const stubCornerAtEnd: Pt2 = a > b ? { x: e.x - signX * stub, y: e.y } : { x: e.x, y: e.y - signY * stub };

  const startMatches = startAxis === stubAxis;
  const endMatches = endAxis === stubAxis;
  const preferStart = startMatches || !endMatches;
  const candidates = preferStart
    ? [
        { points: dedupeConsecutive([s, stubCornerAtStart, e]), respectsLeads: startMatches },
        { points: dedupeConsecutive([s, stubCornerAtEnd, e]), respectsLeads: endMatches }
      ]
    : [
        { points: dedupeConsecutive([s, stubCornerAtEnd, e]), respectsLeads: endMatches },
        { points: dedupeConsecutive([s, stubCornerAtStart, e]), respectsLeads: startMatches }
      ];
  return candidates.filter((candidate) => candidate.points.length >= 2);
}

/**
 * Picks the cleanest route between two points: fewest component crossings, then least coincidence
 * with existing wires, then shortest. Falls back to the plain L-route when nothing is clean — per
 * docs/VIRTUOSO_PARITY_PLAN.md §S3.5, a predictable route beats a cleverly messy one.
 */
export function planWireRoute(input: WireRoutePlanInput): WorldPoint[] {
  const viewBox = input.viewBox;
  const startSvgRaw = worldToSvgPoint(input.start, viewBox);
  const endSvgRaw = worldToSvgPoint(input.end, viewBox);
  const s: Pt2 = { x: startSvgRaw.x, y: startSvgRaw.y };
  const e: Pt2 = { x: endSvgRaw.x, y: endSvgRaw.y };

  // The box a pin lives on must not count as an obstacle, or every route would "hit" its own part.
  const obstacles = (input.obstacles ?? []).filter((rect) => {
    const grown: Rect2 = {
      minX: rect.minX - OWNER_CONTAIN_SLACK,
      minY: rect.minY - OWNER_CONTAIN_SLACK,
      maxX: rect.maxX + OWNER_CONTAIN_SLACK,
      maxY: rect.maxY + OWNER_CONTAIN_SLACK
    };
    return !pointInRect(s, grown) && !pointInRect(e, grown);
  });

  let svgCandidates: RouteCandidate[];
  if (input.mode === "anyAngle") {
    // 45°/any-angle routes are geometric constraints in their own right; the lead directions do not
    // apply to them.
    svgCandidates = [{ points: dedupeConsecutive([s, e]), respectsLeads: true }];
  } else if (input.mode === "octagonal45") {
    // The lead axes DO apply here: they choose which end the straight leftover leg is left out of.
    svgCandidates = fortyFiveCandidates(s, e, input.startLeadAxis ?? null, input.endLeadAxis ?? null);
  } else {
    // The lead axes come from world coordinates, but the world→SVG mapping is an axis-aligned
    // scale (no rotation), so an "h" lead stays horizontal in SVG space.
    svgCandidates = orthogonalCandidates(
      s,
      e,
      obstacles,
      input.startLeadAxis ?? null,
      input.endLeadAxis ?? null
    );
  }
  if (svgCandidates.length === 0) {
    return [input.start, input.end];
  }

  let best: Pt2[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of svgCandidates) {
    const points = candidate.points;
    let obstacleHits = 0;
    let coincidence = 0;
    let length = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      length += distance(a, b);
      for (const rect of obstacles) {
        if (segmentHitsRect(a, b, rect)) obstacleHits += 1;
      }
      for (const segment of input.existingSegments ?? []) {
        coincidence += collinearOverlapLength(a, b, segment.a, segment.b);
      }
    }
    // Ranking: crossing a component ≫ turning at a pin ≫ lying on a wire ≫ length.
    const score =
      obstacleHits * OBSTACLE_PENALTY +
      (candidate.respectsLeads ? 0 : LEADS_PENALTY) +
      coincidence * COINCIDENCE_PENALTY +
      length * LENGTH_WEIGHT;
    if (score < bestScore) {
      bestScore = score;
      best = points;
    }
  }

  if (!best) {
    return [input.start, input.end];
  }
  const routed = best.map((p) => svgToWorldPoint(svgPoint(pt(p.x), pt(p.y)), viewBox));
  return routed.length >= 2 ? routed : [input.start, input.end];
}
