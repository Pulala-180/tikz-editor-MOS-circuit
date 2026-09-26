/**
 * 橡皮筋导线（wire follow）：拖动元件时，与元件端口 world 坐标重合的顶层导线
 * 端点同步移动（导线自动拉长/变短）。
 *
 * 端口来源有两种：
 * 1. scope 元件内部的 \coordinate 端口（电阻/电压源等工具栏元件）；
 * 2. 直接选中的路径元件自身的首末 path-point（例如普通 polyline 元件端口）。
 *
 * 与 scope 端口重合的导线端点同步移动后，导线会自动拉长/变短。
 *
 * 在 applyMoveElementsAction 的 scope 分支（改写 shift/xshift/yshift）之后调用，
 * 但本模块基于**原始 source**（动作入参）解析：这样产生的 patch oldSpan 与
 * 前面分支（scope/pivot）的 patch 同处"原始空间"，applyEditAction 的
 * normalizeResultPatches（actions.ts）校验 patchesMatchSourceTransition 时不
 * 会退化成长度变化的整块替换，增量 parse / CodeMirror 外科手术更新得以保留。
 * 调用方负责把本模块的 patch（原始空间）链式应用到 currentSource（偏移 =
 * 所有位于其之前的 patch 的长度差之和）。
 *
 * 匹配必须用**移动前**的 editHandles（入参）：scope 分支会把 shift 按 pt 取整
 * 格式化（如 56.906pt → 57pt），fresh evaluate 的端口 world 与未动的导线端点
 * world 之间会产生取整误差，精确匹配会失败。移动前的 handle world 是精确的。
 *
 * 导线语句内部相对位置不受 scope patch 影响（只是整体偏移），故按
 * "语句 + 首末索引"对应：fresh 语句的首末 CoordinateItem 即旧 handle 首末端点
 * 的当前 span（并以 sourceText 一致性兜底校验）。
 *
 * MVP 范围：仅绝对坐标端点（rewriteMode "direct"、无 relativePrefix）、
 * 仅顶层 draw 语句（figure.body 直接子 Path）、无形状关键字
 * （rectangle/circle/ellipse）。
 *
 * 命名锚点端点（`(node_M3.d)`，rewriteTargetHandleId != null）**不生成落点 patch** ——
 * 它的文本必须保持引用，锚点本身随所属 scope 一起移动，落点后自动跟随。但它仍参与
 * **挂接检测**（瞬态预览 + 限幅，见 isAttachableEndpoint）：否则拖拽全程这根线纹丝不动，
 * 松手才跳到位，用户看到的就是"线没跟着走"。它也必须走**内点校正**：多拐点导线
 * `… -- c -- (node_M2.d)` 里锚点确实位移了 delta，紧邻的内点 c 不动，那一腿立刻变斜。
 */

import type { CoordinateItem, PathStatement, ScopeStatement, Span, Statement } from "../../ast/types.js";
import { pt } from "../../coords/scalars.js";
import { worldPoint, worldVector, type WorldPoint, type WorldVector } from "../../coords/points.js";
import { parseTikzForEdit, type EditParseOptions } from "../parse-options.js";
import { rewriteCoordinate } from "../rewrite.js";
import type { EditHandle } from "../../semantic/types.js";
import { PT_PER_CM, type DragFormatPrecision } from "../format.js";

const ZERO_DELTA_EPSILON_PT = 1e-6;
// Scope shifts are quantized to integer pt during free moves, and to 0.1pt in
// fine drag mode (used for axis-locked resistors and point snaps).  A snapped
// port may therefore differ from a wire endpoint by up to ~0.05pt in source.
// Quantize buckets at 2pt and accept endpoints within 0.11pt as the same port.
const BUCKET_SIZE_PT = 2;
const MATCH_EPSILON_PT = 0.5;
const SHAPE_KEYWORDS = new Set(["rectangle", "circle", "ellipse"]);

export type WireFollowPending = { span: Span; text: string; statementId: string };

export type WireFollowResult = {
  /** 原始空间的待应用改写（span 相对动作入参的原始 source） */
  patches: WireFollowPending[];
  changedWireSourceIds: string[];
};

export type VddRail = {
  scopeId: string;
  y: number;
  minX: number;
  maxX: number;
};

// --- Skewed-wire repair -----------------------------------------------------------------------
//
// A corner whose coordinate was frozen while its attached end moved slides the leg into an
// ARBITRARY diagonal; that stale coordinate is now baked into the source, so the ordinary
// per-leg re-orthogonalisation (which faithfully preserves the pre-existing leg direction) can
// never heal it. This pass detects such genuinely-broken wires and re-routes their interior
// orthogonally between the two ends, leaving both endpoint texts (anchors included) byte-for-byte.
//
// Deliberate diagonals must survive: `octagonal45` routes are an exact 45° middle leg (plus
// axis stubs) and `anyAngle` routes are a single 2-point segment. Both are recognised
// GEOMETRICALLY -- the routing mode is draft-only state and is NOT persisted in the source, so
// geometry is the only evidence available at edit time:
//   * 2-point wires are never repaired (a lone diagonal is an anyAngle constraint, not a corner);
//   * a leg within AXIS_TOL of an axis is fine, a leg within DIAG_TOL of exactly 45° counts as a
//     deliberate diagonal run;
//   * only a leg that is NEITHER is "broken".

export type RepairPoint = { x: number; y: number };

/** A leg within this many degrees of horizontal/vertical is treated as axis-aligned. */
const REPAIR_AXIS_TOL_DEG = 8;
/**
 * A leg within this many degrees of exactly 45° is treated as a deliberate diagonal run. Kept
 * tight: the editor's `octagonal45` router emits an exact 45° middle leg, whereas a stale corner
 * lands at an essentially random angle, so a narrow band protects real diagonals without sparing
 * most broken wires.
 */
const REPAIR_DIAG_TOL_DEG = 4;
/** Longest interior this pass will re-route (1 or 2 corners); richer routes are left untouched. */
const REPAIR_MAX_POINTS = 4;

const TAN_AXIS_TOL = Math.tan((REPAIR_AXIS_TOL_DEG * Math.PI) / 180);
const TAN_DIAG_TOL = Math.tan((REPAIR_DIAG_TOL_DEG * Math.PI) / 180);

type LegKind = "degenerate" | "axis" | "diagonal45" | "skew";

function classifyLeg(a: RepairPoint, b: RepairPoint): LegKind {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (dx < 1e-9 && dy < 1e-9) {
    return "degenerate";
  }
  const lo = Math.min(dx, dy);
  const hi = Math.max(dx, dy);
  if (lo <= hi * TAN_AXIS_TOL) {
    return "axis";
  }
  if (Math.abs(dx - dy) <= hi * TAN_DIAG_TOL) {
    return "diagonal45";
  }
  return "skew";
}

/** True when the polyline carries at least one genuinely-broken (arbitrary-diagonal) leg. */
export function polylineNeedsOrthogonalRepair(points: readonly RepairPoint[]): boolean {
  if (points.length < 3) {
    return false;
  }
  for (let index = 0; index + 1 < points.length; index += 1) {
    if (classifyLeg(points[index], points[index + 1]) === "skew") {
      return true;
    }
  }
  return false;
}

/** Whether this pass is willing to repair the polyline at all (bounded interior size). */
export function isOrthogonalRepairCandidate(points: readonly RepairPoint[]): boolean {
  return (
    points.length >= 3 &&
    points.length <= REPAIR_MAX_POINTS &&
    polylineNeedsOrthogonalRepair(points)
  );
}

/**
 * The principal axis a leg runs along -- using the SAME tolerance the repair channel uses to call a
 * leg "axis-aligned" -- or null when the leg is a real diagonal (45° run or arbitrary skew).
 *
 * The per-leg re-orthogonalisation used to test this with a 1e-6 epsilon, which is far tighter than
 * the editor can hold: source coordinates are written to 2 decimals in cm and scope shifts are
 * quantized to 0.1pt (fine) / 1pt, so a leg that IS horizontal by the author's intent carries a
 * ~1e-3…1e-2 residual after its first rewrite. The exact test then reads "neither horizontal nor
 * vertical", refuses to recompute that corner, and -- with the endpoint still following the moving
 * component -- the leg's tilt GROWS on every later drag until the wire visibly collapses. This
 * tolerance closes the dead zone: any leg within {@link REPAIR_AXIS_TOL_DEG} of an axis is treated
 * as axis-aligned and re-derived EXACTLY, so the residual is cleared each drag instead of summed.
 */
export function axisAlignedLeg(a: RepairPoint, b: RepairPoint): "h" | "v" | null {
  if (classifyLeg(a, b) !== "axis") {
    return null;
  }
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? "h" : "v";
}

/**
 * Rebuilds the polyline's INTERIOR orthogonally, keeping both endpoints and the point count.
 * Returns a new array of the same length, or null when there is nothing safe to do.
 *
 * The shape character is preserved: a 1-corner wire keeps the dominant axis of its first leg; a
 * 2-corner wire keeps its middle leg horizontal or vertical. Coordinates are unit-agnostic (the
 * caller passes either world pt or SVG px).
 */
export function repairOrthogonalRoute(points: readonly RepairPoint[]): RepairPoint[] | null {
  if (!isOrthogonalRepairCandidate(points)) {
    return null;
  }
  const a = points[0];
  const b = points[points.length - 1];
  const out = points.map((point) => ({ x: point.x, y: point.y }));

  if (points.length === 3) {
    const firstHorizontal = Math.abs(points[1].x - a.x) >= Math.abs(points[1].y - a.y);
    out[1] = firstHorizontal ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    return out;
  }

  // 4 points: two interior corners. Keep the middle leg's orientation (H-V-H or V-H-V), which
  // makes every leg axis-aligned; the stub levels are split evenly so the shape stays balanced.
  const middleHorizontal = Math.abs(points[2].x - points[1].x) >= Math.abs(points[2].y - points[1].y);
  if (middleHorizontal) {
    const midY = (a.y + b.y) / 2;
    out[1] = { x: a.x, y: midY };
    out[2] = { x: b.x, y: midY };
  } else {
    const midX = (a.x + b.x) / 2;
    out[1] = { x: midX, y: a.y };
    out[2] = { x: midX, y: b.y };
  }
  return out;
}

export function findVddRails(
  statements: readonly Statement[],
  editHandles: readonly EditHandle[],
  source: string,
  filterScopeIds?: Set<string>
): VddRail[] {
  const rails: VddRail[] = [];
  for (const stmt of statements) {
    if (stmt.kind !== "Scope") continue;
    if (filterScopeIds && !filterScopeIds.has(stmt.id)) continue;

    const scopeText = source.slice(stmt.span.from, stmt.span.to);
    const isVdd =
      scopeText.includes("node_VDD") ||
      scopeText.includes("V_{DD}") ||
      scopeText.includes("VDD");
    if (!isVdd) continue;

    for (const child of stmt.body) {
      if (child.kind === "Path" && child.command === "draw") {
        const handles = editHandles
          .filter((h) => h.kind === "path-point" && h.sourceRef.sourceId === child.id)
          .sort((a, b) => a.sourceRef.sourceSpan.from - b.sourceRef.sourceSpan.from);
        if (handles.length >= 2) {
          const h1 = handles[0];
          const h2 = handles[handles.length - 1];
          if (Math.abs(h1.world.y - h2.world.y) <= 0.5) {
            rails.push({
              scopeId: stmt.id,
              y: (h1.world.y + h2.world.y) / 2,
              minX: Math.min(h1.world.x, h2.world.x),
              maxX: Math.max(h1.world.x, h2.world.x)
            });
          }
        }
      }
    }
  }
  return rails;
}

export function isPointOnVddRail(point: WorldPoint, rails: readonly VddRail[]): boolean {
  for (const rail of rails) {
    if (
      Math.abs(point.y - rail.y) <= MATCH_EPSILON_PT &&
      point.x >= rail.minX - MATCH_EPSILON_PT &&
      point.x <= rail.maxX + MATCH_EPSILON_PT
    ) {
      return true;
    }
  }
  return false;
}

export function clampDeltaForAttachedWires(
  source: string,
  editHandles: readonly EditHandle[],
  scopeElementIds: readonly string[],
  movedElementIds: readonly string[],
  delta: WorldPoint,
  parseOptions: EditParseOptions = {}
): WorldPoint {
  const MIN_WIRE_LENGTH_PT = 2.84527559; // 0.1cm = 1mm
  const movedIdSet = new Set(movedElementIds);
  if (movedIdSet.size === 0) {
    return delta;
  }
  if (Math.abs(delta.x) <= ZERO_DELTA_EPSILON_PT && Math.abs(delta.y) <= ZERO_DELTA_EPSILON_PT) {
    return delta;
  }

  const parsed = parseTikzForEdit(source, { ...parseOptions });
  const portBuckets = buildPortBuckets(parsed.figure.body, scopeElementIds, editHandles, movedIdSet);
  const movedVddRails = findVddRails(parsed.figure.body, editHandles, source, new Set(scopeElementIds));
  if (portBuckets.size === 0 && movedVddRails.length === 0) {
    return delta;
  }

  let deltaX: number = delta.x as number;
  let deltaY: number = delta.y as number;

  // Collect candidate stationary intermediate points (branch dots, junction nodes)
  const stationaryDots: WorldPoint[] = [];
  for (const stmt of parsed.figure.body) {
    if (movedIdSet.has(stmt.id)) continue;
    if (stmt.kind === "Scope") {
      const scopeText = source.slice(stmt.span.from, stmt.span.to);
      if (
        scopeText.includes(".dot") ||
        scopeText.includes("_dot") ||
        (scopeText.includes("circle") && scopeText.includes("coordinate"))
      ) {
        const h = editHandles.find(
          (handle) =>
            handle.kind === "path-point" &&
            handle.sourceRef.sourceSpan.from >= stmt.span.from &&
            handle.sourceRef.sourceSpan.to <= stmt.span.to
        );
        if (h) stationaryDots.push(h.world);
      }
    } else if (stmt.kind === "Path" && stmt.command === "draw") {
      const text = source.slice(stmt.span.from, stmt.span.to);
      if (text.includes("circle") && !text.includes("--")) {
        const h = editHandles.find((handle) => handle.kind === "path-point" && handle.sourceRef.sourceId === stmt.id);
        if (h) stationaryDots.push(h.world);
      }
    }
  }

  for (const statement of parsed.figure.body) {
    if (statement.kind !== "Path" || statement.command !== "draw") {
      continue;
    }
    if (movedIdSet.has(statement.id)) {
      continue;
    }
    if (hasShapeKeyword(statement)) {
      continue;
    }
    const statementHandles = editHandles
      .filter((handle) => handle.kind === "path-point" && handle.sourceRef.sourceId === statement.id)
      .sort((left, right) => left.sourceRef.sourceSpan.from - right.sourceRef.sourceSpan.from);
    if (statementHandles.length < 2) {
      continue;
    }
    const endpoints = [statementHandles[0], statementHandles[statementHandles.length - 1]];

    // Check if any moving port is sitting strictly inside this un-moved straight wire segment (e.g. branch dot sliding on trunk)
    if (endpoints.length === 2) {
      const p1 = endpoints[0].world;
      const p2 = endpoints[1].world;
      const dx = Math.abs(p2.x - p1.x);
      const dy = Math.abs(p2.y - p1.y);
      const isV = dx <= 1.0 && dy > 1.0;
      const isH = dy <= 1.0 && dx > 1.0;
      if (isV) {
        const lineX = (p1.x + p2.x) / 2;
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);
        for (const bucket of portBuckets.values()) {
          for (const port of bucket) {
            const distToP1 = Math.hypot(port.x - p1.x, port.y - p1.y);
            const distToP2 = Math.hypot(port.x - p2.x, port.y - p2.y);
            if (distToP1 <= MATCH_EPSILON_PT || distToP2 <= MATCH_EPSILON_PT) {
              continue;
            }
            if (
              Math.abs(port.x - lineX) <= 2.0 &&
              port.y >= minY + MIN_WIRE_LENGTH_PT &&
              port.y <= maxY - MIN_WIRE_LENGTH_PT
            ) {
              const maxDeltaY = (maxY - port.y) - MIN_WIRE_LENGTH_PT;
              if (deltaY > maxDeltaY) {
                deltaY = maxDeltaY;
              }
              const minDeltaY = (minY - port.y) + MIN_WIRE_LENGTH_PT;
              if (deltaY < minDeltaY) {
                deltaY = minDeltaY;
              }
            }
          }
        }
      } else if (isH) {
        const lineY = (p1.y + p2.y) / 2;
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        for (const bucket of portBuckets.values()) {
          for (const port of bucket) {
            const distToP1 = Math.hypot(port.x - p1.x, port.y - p1.y);
            const distToP2 = Math.hypot(port.x - p2.x, port.y - p2.y);
            if (distToP1 <= MATCH_EPSILON_PT || distToP2 <= MATCH_EPSILON_PT) {
              continue;
            }
            if (
              Math.abs(port.y - lineY) <= 2.0 &&
              port.x >= minX + MIN_WIRE_LENGTH_PT &&
              port.x <= maxX - MIN_WIRE_LENGTH_PT
            ) {
              const maxDeltaX = (maxX - port.x) - MIN_WIRE_LENGTH_PT;
              if (deltaX > maxDeltaX) {
                deltaX = maxDeltaX;
              }
              const minDeltaX = (minX - port.x) + MIN_WIRE_LENGTH_PT;
              if (deltaX < minDeltaX) {
                deltaX = minDeltaX;
              }
            }
          }
        }
      }
    }

    for (let index = 0; index < 2; index++) {
      const endpoint = endpoints[index];
      if (!isAttachableEndpoint(endpoint)) {
        continue;
      }
      const touchesPort = bucketContains(portBuckets, endpoint.world);
      const touchesVdd = isPointOnVddRail(endpoint.world, movedVddRails);
      if (!touchesPort && !touchesVdd) {
        continue;
      }

      const otherIndex = 1 - index;
      const otherEndpoint = endpoints[otherIndex];
      const otherMoves =
        otherEndpoint &&
        (bucketContains(portBuckets, otherEndpoint.world) || isPointOnVddRail(otherEndpoint.world, movedVddRails));
      if (otherMoves || !otherEndpoint) {
        continue;
      }

      const vX = endpoint.world.x - otherEndpoint.world.x;
      const vY = endpoint.world.y - otherEndpoint.world.y;
      const isHorizontal = Math.abs(vY) < 1.0;
      const isVertical = Math.abs(vX) < 1.0;

      if (isHorizontal) {
        const y0 = endpoint.world.y;
        if (vX > 0) {
          // endpoint is to the right of otherEndpoint, moves left (deltaX < 0) towards otherEndpoint
          // Check for intermediate obstacles between otherEndpoint.x and endpoint.x
          let closestObstacleX = otherEndpoint.world.x;
          for (const dot of stationaryDots) {
            if (Math.abs(dot.y - y0) <= 2.0 && dot.x < endpoint.world.x - 1.0 && dot.x >= otherEndpoint.world.x) {
              if (dot.x > closestObstacleX) closestObstacleX = dot.x;
            }
          }
          const dist = endpoint.world.x - closestObstacleX;
          const minDeltaX = MIN_WIRE_LENGTH_PT - dist;
          if (deltaX < minDeltaX) {
            deltaX = minDeltaX;
          }
        } else if (vX < 0) {
          // endpoint is to the left of otherEndpoint, moves right (deltaX > 0) towards otherEndpoint
          let closestObstacleX = otherEndpoint.world.x;
          for (const dot of stationaryDots) {
            if (Math.abs(dot.y - y0) <= 2.0 && dot.x > endpoint.world.x + 1.0 && dot.x <= otherEndpoint.world.x) {
              if (dot.x < closestObstacleX) closestObstacleX = dot.x;
            }
          }
          const dist = closestObstacleX - endpoint.world.x;
          const maxDeltaX = dist - MIN_WIRE_LENGTH_PT;
          if (deltaX > maxDeltaX) {
            deltaX = maxDeltaX;
          }
        }
      } else if (isVertical) {
        const x0 = endpoint.world.x;
        if (vY > 0) {
          // endpoint is above otherEndpoint, moves down (deltaY < 0) towards otherEndpoint
          let closestObstacleY = otherEndpoint.world.y;
          for (const dot of stationaryDots) {
            if (Math.abs(dot.x - x0) <= 2.0 && dot.y < endpoint.world.y - 1.0 && dot.y >= otherEndpoint.world.y) {
              if (dot.y > closestObstacleY) closestObstacleY = dot.y;
            }
          }
          const dist = endpoint.world.y - closestObstacleY;
          const minDeltaY = MIN_WIRE_LENGTH_PT - dist;
          if (deltaY < minDeltaY) {
            deltaY = minDeltaY;
          }
        } else if (vY < 0) {
          // endpoint is below otherEndpoint, moves up (deltaY > 0) towards otherEndpoint
          let closestObstacleY = otherEndpoint.world.y;
          for (const dot of stationaryDots) {
            if (Math.abs(dot.x - x0) <= 2.0 && dot.y > endpoint.world.y + 1.0 && dot.y <= otherEndpoint.world.y) {
              if (dot.y < closestObstacleY) closestObstacleY = dot.y;
            }
          }
          const dist = closestObstacleY - endpoint.world.y;
          const maxDeltaY = dist - MIN_WIRE_LENGTH_PT;
          if (deltaY > maxDeltaY) {
            deltaY = maxDeltaY;
          }
        }
      } else {
        const newVx = vX + deltaX;
        const newVy = vY + deltaY;
        const newDist = Math.hypot(newVx, newVy);
        if (newDist < MIN_WIRE_LENGTH_PT) {
          const oldDist = Math.hypot(vX, vY) || 1;
          const uX = newDist >= 1e-4 ? newVx / newDist : vX / oldDist;
          const uY = newDist >= 1e-4 ? newVy / newDist : vY / oldDist;
          deltaX = (otherEndpoint.world.x + uX * MIN_WIRE_LENGTH_PT) - endpoint.world.x;
          deltaY = (otherEndpoint.world.y + uY * MIN_WIRE_LENGTH_PT) - endpoint.world.y;
        }
      }
    }
  }

  return worldPoint(pt(deltaX), pt(deltaY));
}

export function applyWireEndpointFollowPatches(
  source: string,
  editHandles: readonly EditHandle[],
  scopeElementIds: readonly string[],
  movedElementIds: readonly string[],
  delta: WorldPoint,
  parseOptions: EditParseOptions = {},
  rigidBranches?: readonly RigidLeafBranch[],
  formatPrecision?: DragFormatPrecision
): WireFollowResult {
  const empty: WireFollowResult = { patches: [], changedWireSourceIds: [] };
  const movedIdSet = new Set(movedElementIds);
  if (movedIdSet.size === 0) {
    return empty;
  }
  if (Math.abs(delta.x) <= ZERO_DELTA_EPSILON_PT && Math.abs(delta.y) <= ZERO_DELTA_EPSILON_PT) {
    return empty;
  }

  const parsed = parseTikzForEdit(source, { ...parseOptions });

  if (rigidBranches === undefined) {
    rigidBranches = detectRigidLeafBranches(
      source,
      parsed.figure.body,
      editHandles,
      movedElementIds,
      delta
    );
  }

  const portBuckets = buildPortBuckets(parsed.figure.body, scopeElementIds, editHandles, movedIdSet);
  const movedVddRails = findVddRails(parsed.figure.body, editHandles, source, new Set(scopeElementIds));
  if (portBuckets.size === 0 && movedVddRails.length === 0) {
    return empty;
  }

  // 3. 顶层 draw 语句：端点 = 按 span 排序的首末 path-point handle（旧数据），
  //    与端口（移动前）精确匹配；span 用 fresh AST 首末 CoordinateItem 的当前 span
  const pending: { span: Span; text: string; statementId: string }[] = [];
  for (const statement of parsed.figure.body) {
    if (statement.kind !== "Path" || statement.command !== "draw") {
      continue;
    }
    if (movedIdSet.has(statement.id)) {
      continue; // 本次已整体移动（多选），避免双重 delta
    }
    const stmtText = source.slice(statement.span.from, statement.span.to);
    const isBranchDot = stmtText.includes("circle") && !stmtText.includes("--");
    if (isBranchDot) {
      const statementHandles = editHandles
        .filter((handle) => handle.kind === "path-point" && handle.sourceRef.sourceId === statement.id);
      if (statementHandles.length > 0) {
        const centerHandle = statementHandles[0];
        const associatedBranch = rigidBranches?.find((b) => b.associatedDotStatementIds?.includes(statement.id));
        if (
          associatedBranch ||
          (isFollowableEndpoint(centerHandle) && (bucketContains(portBuckets, centerHandle.world) || isPointOnVddRail(centerHandle.world, movedVddRails)))
        ) {
          const freshCoordItems = singleCoordinateItems(statement);
          if (freshCoordItems.length > 0) {
            const fresh = freshCoordItems[0];
            const dotDelta = associatedBranch ? associatedBranch.branchDelta : delta;
            const newWorld = worldPoint(pt(centerHandle.world.x + dotDelta.x), pt(centerHandle.world.y + dotDelta.y));
            const adjusted = {
              ...centerHandle,
              sourceRef: { ...centerHandle.sourceRef, sourceSpan: fresh.span }
            };
            const text = rewriteCoordinate(newWorld, adjusted, source, { formatPrecision });
            if (text != null) {
              pending.push({ span: fresh.span, text, statementId: statement.id });
            }
          }
        }
      }
      continue;
    }

    if (hasShapeKeyword(statement)) {
      continue;
    }
    const statementHandles = editHandles
      .filter((handle) => handle.kind === "path-point" && handle.sourceRef.sourceId === statement.id)
      .sort((left, right) => left.sourceRef.sourceSpan.from - right.sourceRef.sourceSpan.from);
    if (statementHandles.length < 2) {
      continue;
    }
    const endpoints = [statementHandles[0], statementHandles[statementHandles.length - 1]];
    const freshEndpointItems = endpointItems(statement);
    const allFreshCoordinateItems = singleCoordinateItems(statement);

    const rigidBranch = rigidBranches?.find((b) => b.wireStatementId === statement.id);
    if (rigidBranch) {
      const branchCoords: { span: Span; text: string; statementId: string }[] = [];
      for (let i = 0; i < 2; i++) {
        const ep = endpoints[i];
        const fresh = freshEndpointItems[i];
        if (!fresh || !ep) continue;
        if (!isFollowableEndpoint(ep)) continue;
        if (source.slice(fresh.span.from, fresh.span.to) !== ep.sourceText) continue;

        const endpointDelta =
          rigidBranch.isStretchOnly
            ? (i === rigidBranch.wireMovingEndpointIndex ? rigidBranch.branchDelta : worldPoint(pt(0), pt(0)))
            : (i === rigidBranch.wireMovingEndpointIndex
                ? (rigidBranch.isTapBranch ? rigidBranch.branchDelta : delta)
                : rigidBranch.branchDelta);
        const newWorld = worldPoint(pt(ep.world.x + endpointDelta.x), pt(ep.world.y + endpointDelta.y));
        const adjusted = {
          ...ep,
          sourceRef: { ...ep.sourceRef, sourceSpan: fresh.span }
        };
        const text = rewriteCoordinate(newWorld, adjusted, source, { formatPrecision });
        if (text != null) {
          branchCoords.push({ span: fresh.span, text, statementId: statement.id });
        }
      }

      // Hard Cadence Invariant: For rigid branches, ensure both endpoints have identical orthogonal component!
      if (branchCoords.length === 2) {
        if (rigidBranch.orientation === "h") {
          const match0 = branchCoords[0].text.match(/^\(([^,]+),\s*([^)]+)\)$/);
          const match1 = branchCoords[1].text.match(/^\(([^,]+),\s*([^)]+)\)$/);
          if (match0 && match1) {
            const unifiedY = match0[2];
            branchCoords[1].text = `(${match1[1]},${unifiedY})`;
          }
        } else if (rigidBranch.orientation === "v") {
          const match0 = branchCoords[0].text.match(/^\(([^,]+),\s*([^)]+)\)$/);
          const match1 = branchCoords[1].text.match(/^\(([^,]+),\s*([^)]+)\)$/);
          if (match0 && match1) {
            const unifiedX = match0[1];
            branchCoords[1].text = `(${unifiedX},${match1[2]})`;
          }
        }
      }
      pending.push(...branchCoords);
      continue;
    }

    const isIoNode = isIoNodeStatement(statement, source);

    if (isIoNode) {
      const firstTouches = bucketContains(portBuckets, endpoints[0].world) || isPointOnVddRail(endpoints[0].world, movedVddRails);
      const secondTouches = bucketContains(portBuckets, endpoints[1].world) || isPointOnVddRail(endpoints[1].world, movedVddRails);

      if (firstTouches || secondTouches) {
        for (let i = 0; i < 2; i++) {
          const ep = endpoints[i];
          const fresh = freshEndpointItems[i];
          if (!isFollowableEndpoint(ep)) continue;
          if (source.slice(fresh.span.from, fresh.span.to) !== ep.sourceText) continue;

          const newWorld = worldPoint(pt(ep.world.x + delta.x), pt(ep.world.y + delta.y));
          const adjusted = {
            ...ep,
            sourceRef: { ...ep.sourceRef, sourceSpan: fresh.span }
          };
          const text = rewriteCoordinate(newWorld, adjusted, source, { formatPrecision });
          if (text != null) {
            pending.push({ span: fresh.span, text, statementId: statement.id });
          }
        }
        continue;
      }
    }

    const MIN_WIRE_LENGTH_PT = 2.84527559; // 0.1cm = 1mm

    for (let index = 0; index < endpoints.length; index += 1) {
      const endpoint = endpoints[index];
      const freshItem = freshEndpointItems[index];
      if (!isAttachableEndpoint(endpoint)) {
        continue;
      }
      const touchesPort = bucketContains(portBuckets, endpoint.world);
      const touchesVdd = isPointOnVddRail(endpoint.world, movedVddRails);
      if (!touchesPort && !touchesVdd) {
        continue;
      }
      // 文本一致性兜底：fresh item 的文本必须与旧 handle 的源文本相同
      // （语句整体偏移只改变绝对位置，不改变内部文本）
      if (source.slice(freshItem.span.from, freshItem.span.to) !== endpoint.sourceText) {
        continue;
      }

      const otherIndex = 1 - index;
      const otherEndpoint = endpoints[otherIndex];
      const otherMoves =
        otherEndpoint &&
        (bucketContains(portBuckets, otherEndpoint.world) || isPointOnVddRail(otherEndpoint.world, movedVddRails));

      let newWorld = worldPoint(pt(endpoint.world.x + delta.x), pt(endpoint.world.y + delta.y));
      const followable = isFollowableEndpoint(endpoint);
      if (followable) {
        if (!otherMoves && otherEndpoint) {
          const dx = newWorld.x - otherEndpoint.world.x;
          const dy = newWorld.y - otherEndpoint.world.y;
          const dist = Math.hypot(dx, dy);
          if (dist < MIN_WIRE_LENGTH_PT) {
            const origDx = endpoint.world.x - otherEndpoint.world.x;
            const origDy = endpoint.world.y - otherEndpoint.world.y;
            const origDist = Math.hypot(origDx, origDy) || 1;
            const uX = dist >= 1e-4 ? dx / dist : origDx / origDist;
            const uY = dist >= 1e-4 ? dy / dist : origDy / origDist;
            newWorld = worldPoint(
              pt(otherEndpoint.world.x + uX * MIN_WIRE_LENGTH_PT),
              pt(otherEndpoint.world.y + uY * MIN_WIRE_LENGTH_PT)
            );
          }
        }

        const adjusted = {
          ...endpoint,
          sourceRef: { ...endpoint.sourceRef, sourceSpan: freshItem.span }
        };
        const text = rewriteCoordinate(newWorld, adjusted, source, { formatPrecision });
        if (text == null) {
          continue;
        }
        pending.push({ span: freshItem.span, text, statementId: statement.id });
      }
      // 命名锚点端点（`(node_M2.d)`）走到这里：它的文本必须保持引用（锚点随所属 scope 移动，
      // 落点天然跟随），所以不生成端点 patch —— 但它**物理上确实位移了 delta**。相邻的内点
      // 仍是冻结的绝对坐标，不按移动后的位置校正，两者之间那一腿就被拖成斜线（下方 re-ortho
      // 正是干这个的，所以这里绝不能 `continue`）。

      // Explicit multi-point wire (`A -- corner -- B`): the attached end follows the component --
      // whether its text is a literal coordinate or a named anchor -- but the interior corner next
      // to it was authored and used to stay put, so the leg between them slid into a diagonal.
      // Walk inward re-orthogonalising corners (keeping each leg's original horizontal / vertical
      // direction) until one is already correctly placed; the far end and every other corner stay
      // put. Only when a real interior point exists (`|-` / `-|` operator wires have just two points
      // and are handled by the operator).
      if (statementHandles.length >= 3 && allFreshCoordinateItems.length === statementHandles.length) {
        const adjacentIndex = index === 0 ? 1 : statementHandles.length - 2;
        const adjacentHandle = statementHandles[adjacentIndex];
        const adjacentItem = allFreshCoordinateItems[adjacentIndex];
        if (
          adjacentHandle &&
          adjacentItem &&
          isFollowableEndpoint(adjacentHandle) &&
          source.slice(adjacentItem.span.from, adjacentItem.span.to) === adjacentHandle.sourceText
        ) {
          const step = index === 0 ? 1 : -1;
          // 沿链向内传播：每跳保持该腿的**原方向**，直到某个角点本来就已在正确位置。
          // 正常导线的腿序列交替（V,H,V,…），第一跳就把角点摆正、第二跳发现"无需移动"即
          // 终止 —— 与只修一个角点的旧行为逐字节相同。仅当导线有**连续共线腿**（V,V 的
          // 回折）时才会多走几步，否则那一步会把上一条腿拖斜。
          //
          // 腿方向判定用 axisAlignedLeg（8° 容差），而不是 1e-6 精确判定：源码坐标是 2 位
          // 小数 cm、scope shift 量化到 0.1–1pt，于是"本来正交"的腿在第一轮改写后就带上
          // ~1e-3 的残差；精确判定会把它当成"非正交"而**从此不再复算该拐角**，挂接端却照常
          // 位移，斜度遂逐次累积。容差内一律判为轴对齐并**精确**复算，残差每轮清零。
          let outerWorld: WorldPoint = newWorld;
          let outerOrigin: WorldPoint = endpoint.world;
          for (let k = adjacentIndex; k > 0 && k < statementHandles.length - 1; k += step) {
            const cornerHandle = statementHandles[k];
            const cornerItem = allFreshCoordinateItems[k];
            if (
              !cornerHandle ||
              !cornerItem ||
              !isFollowableEndpoint(cornerHandle) ||
              source.slice(cornerItem.span.from, cornerItem.span.to) !== cornerHandle.sourceText
            ) {
              break;
            }
            const legAxis = axisAlignedLeg(outerOrigin, cornerHandle.world);
            if (!legAxis) {
              break; // 真斜腿 / 45° 腿：交由修复通道处理或原样保留
            }
            const legWasHorizontal = legAxis === "h";
            const newCornerWorld = legWasHorizontal
              ? worldPoint(pt(cornerHandle.world.x), pt(outerWorld.y))
              : worldPoint(pt(outerWorld.x), pt(cornerHandle.world.y));
            if (
              newCornerWorld.x === cornerHandle.world.x &&
              newCornerWorld.y === cornerHandle.world.y
            ) {
              break; // 该角点无需移动，更内侧的腿不受影响
            }
            const adjustedCorner = {
              ...cornerHandle,
              sourceRef: { ...cornerHandle.sourceRef, sourceSpan: cornerItem.span }
            };
            const cornerText = rewriteCoordinate(newCornerWorld, adjustedCorner, source, { formatPrecision });
            if (cornerText != null) {
              pending.push({ span: cornerItem.span, text: cornerText, statementId: statement.id });
            }
            outerWorld = newCornerWorld;
            outerOrigin = cornerHandle.world;
          }
        }
      }
    }
  }

  // 5. Skewed-wire repair: an ATTACHED wire whose leg(s) are already arbitrary diagonals gets its
  //    interior re-routed orthogonally in one shot. Runs after the follow pass so it wins the
  //    dedupe on any interior span both would touch (they never overlap in practice: the follow
  //    pass only re-orthogonalises an ALREADY-axis leg, repair only fires on a skew leg).
  pending.push(
    ...collectOrthogonalRepairPatches(
      source,
      parsed.figure.body,
      editHandles,
      movedIdSet,
      portBuckets,
      movedVddRails,
      delta,
      formatPrecision
    )
  );

  if (pending.length === 0) {
    return empty;
  }

  // 4. 按 span 去重（原始空间），按升序返回——调用方负责链式应用并填 newSpan
  const bySpan = new Map<string, WireFollowPending>();
  for (const replacement of pending) {
    bySpan.set(`${replacement.span.from}:${replacement.span.to}`, replacement);
  }
  const ordered = [...bySpan.values()].sort((left, right) => left.span.from - right.span.from);

  const changedWireSourceIds = new Set(ordered.map((replacement) => replacement.statementId));
  return {
    patches: ordered,
    changedWireSourceIds: [...changedWireSourceIds]
  };
}

/**
 * Patches the interior coordinate items of every attached, genuinely-skewed top-level draw wire so
 * that the whole wire runs orthogonally between its two ends. Endpoints are NEVER touched (anchors
 * stay anchors; a followable end is moved by the follow pass above), so no endpoint is ever
 * materialised into a coordinate. Only plain `--` chains of 3-4 points are considered.
 */
function collectOrthogonalRepairPatches(
  source: string,
  body: readonly Statement[],
  editHandles: readonly EditHandle[],
  movedIdSet: ReadonlySet<string>,
  portBuckets: ReadonlyMap<string, WorldPoint[]>,
  movedVddRails: readonly VddRail[],
  delta: WorldPoint,
  formatPrecision?: DragFormatPrecision
): WireFollowPending[] {
  const out: WireFollowPending[] = [];
  for (const statement of body) {
    if (statement.kind !== "Path" || statement.command !== "draw") {
      continue;
    }
    if (movedIdSet.has(statement.id)) {
      continue;
    }
    if (hasShapeKeyword(statement)) {
      continue;
    }
    const handles = editHandles
      .filter((handle) => handle.kind === "path-point" && handle.sourceRef.sourceId === statement.id)
      .sort((left, right) => left.sourceRef.sourceSpan.from - right.sourceRef.sourceSpan.from);
    const coordinateItems = singleCoordinateItems(statement);
    // Plain coordinate chain only: `|-` / `-|` operators carry just two CoordinateItems and are
    // orthogonal by construction, so they drop out here.
    if (handles.length !== coordinateItems.length || !isOrthogonalRepairCandidate(handles.map((h) => h.world))) {
      continue;
    }

    const endpoints = [handles[0], handles[handles.length - 1]];
    const endpointMoves = endpoints.map(
      (handle) =>
        bucketContains(portBuckets, handle.world) || isPointOnVddRail(handle.world, movedVddRails)
    );
    // Only an ATTACHED wire is repaired: at least one end must ride the moving component.
    if (!endpointMoves[0] && !endpointMoves[1]) {
      continue;
    }

    const routed = handles.map((handle, index) => {
      const end = index === 0 || index === handles.length - 1;
      if (end && endpointMoves[index === 0 ? 0 : 1]) {
        return { x: handle.world.x + delta.x, y: handle.world.y + delta.y };
      }
      return { x: handle.world.x, y: handle.world.y };
    });
    const repaired = repairOrthogonalRoute(routed);
    if (!repaired) {
      continue;
    }

    for (let index = 1; index < handles.length - 1; index += 1) {
      const handle = handles[index];
      const item = coordinateItems[index];
      // Interior anchors / relative coordinates are left alone (cannot be rewritten safely).
      if (!handle || !item || !isFollowableEndpoint(handle)) {
        continue;
      }
      if (source.slice(item.span.from, item.span.to) !== handle.sourceText) {
        continue;
      }
      const adjusted = { ...handle, sourceRef: { ...handle.sourceRef, sourceSpan: item.span } };
      const text = rewriteCoordinate(
        worldPoint(pt(repaired[index].x), pt(repaired[index].y)),
        adjusted,
        source,
        { formatPrecision }
      );
      if (text != null) {
        out.push({ span: item.span, text, statementId: statement.id });
      }
    }
  }
  return out;
}

function findScopeStatementById(
  statements: readonly Statement[],
  scopeId: string
): ScopeStatement | null {
  for (const statement of statements) {
    if (statement.kind !== "Scope") {
      continue;
    }
    if (statement.id === scopeId) {
      return statement;
    }
    const nested = findScopeStatementById(statement.body, scopeId);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function collectCoordinateStatementIds(statements: readonly Statement[], out: Set<string>): void {
  for (const statement of statements) {
    if (statement.kind === "Path" && statement.command === "coordinate") {
      out.add(statement.id);
    } else if (statement.kind === "Scope") {
      collectCoordinateStatementIds(statement.body, out);
    }
  }
}

/**
 * Draw statements nested inside a moved scope. Externally generated circuits (circuit-mcp) wrap a
 * component as a scope of raw `\draw` primitives with no `\coordinate` pins, so their pin leads
 * exist only as ordinary path endpoints -- these are the only port candidates such a component has.
 */
function collectDrawStatementIds(statements: readonly Statement[], out: Set<string>): void {
  for (const statement of statements) {
    if (statement.kind === "Path" && statement.command === "draw") {
      out.add(statement.id);
    } else if (statement.kind === "Scope") {
      collectDrawStatementIds(statement.body, out);
    }
  }
}

/** Buckets the first and last handle of every handle group, i.e. each path's two endpoints. */
function addEndpointBuckets(
  buckets: Map<string, WorldPoint[]>,
  handleGroups: ReadonlyMap<string, EditHandle[]>
): void {
  for (const handles of handleGroups.values()) {
    handles.sort((left, right) => left.sourceRef.sourceSpan.from - right.sourceRef.sourceSpan.from);
    addPortBucket(buckets, handles[0]?.world);
    if (handles.length > 1) {
      addPortBucket(buckets, handles[handles.length - 1]?.world);
    }
  }
}

/**
 * Every point a wire endpoint may attach to when something moves:
 *  - `\coordinate` pins inside a moved scope (the editor's own component templates),
 *  - the endpoints of the moved paths themselves,
 *  - the endpoints of draw primitives nested in a moved scope -- the ONLY port a
 *    coordinate-less externally generated component (circuit-mcp) has. Without this such a
 *    component gets zero port buckets and its wires never follow.
 *
 * Shared by the transient drag preview, the commit-time rewrite and the delta clamp; these used
 * to be three copies of the same block, which is how the omission above survived in all of them.
 */
function buildPortBuckets(
  body: readonly Statement[],
  scopeElementIds: readonly string[],
  editHandles: readonly EditHandle[],
  movedIdSet: ReadonlySet<string>
): Map<string, WorldPoint[]> {
  const scopePortStatementIds = new Set<string>();
  const scopeMemberPathIds = new Set<string>();
  for (const scopeId of scopeElementIds) {
    const scope = findScopeStatementById(body, scopeId);
    if (scope) {
      collectCoordinateStatementIds(scope.body, scopePortStatementIds);
      collectDrawStatementIds(scope.body, scopeMemberPathIds);
    }
  }

  const portBuckets = new Map<string, WorldPoint[]>();
  const directMovedPathHandles = new Map<string, EditHandle[]>();
  const scopeMemberPathHandles = new Map<string, EditHandle[]>();
  for (const handle of editHandles) {
    if (handle.kind !== "path-point") {
      continue;
    }
    if (scopePortStatementIds.has(handle.sourceRef.sourceId)) {
      if (isAbsolutePortHandle(handle)) {
        addPortBucket(portBuckets, handle.world);
      }
      continue;
    }
    // No followable check for scope members: like `\coordinate` ports these are attachment
    // targets, not coordinates we intend to rewrite.
    if (scopeMemberPathIds.has(handle.sourceRef.sourceId)) {
      const handles = scopeMemberPathHandles.get(handle.sourceRef.sourceId);
      if (handles) {
        handles.push(handle);
      } else {
        scopeMemberPathHandles.set(handle.sourceRef.sourceId, [handle]);
      }
      continue;
    }
    if (!movedIdSet.has(handle.sourceRef.sourceId)) {
      continue;
    }
    if (!isFollowableEndpoint(handle)) {
      continue;
    }
    const handles = directMovedPathHandles.get(handle.sourceRef.sourceId);
    if (handles) {
      handles.push(handle);
    } else {
      directMovedPathHandles.set(handle.sourceRef.sourceId, [handle]);
    }
  }
  addEndpointBuckets(portBuckets, directMovedPathHandles);
  addEndpointBuckets(portBuckets, scopeMemberPathHandles);
  return portBuckets;
}

function hasShapeKeyword(statement: PathStatement): boolean {
  return statement.items.some(
    (item) => item.kind === "PathKeyword" && SHAPE_KEYWORDS.has(item.keyword)
  );
}

/** True when the route uses TikZ's implicit orthogonal operators (`|-` / `-|`). */
function hasImplicitOrthoCorner(statement: PathStatement): boolean {
  return statement.items.some(
    (item) => item.kind === "PathKeyword" && (item.keyword === "|-" || item.keyword === "-|")
  );
}

function singleCoordinateItems(statement: PathStatement): CoordinateItem[] {
  return statement.items.filter(
    (item): item is CoordinateItem => item.kind === "Coordinate"
  );
}

/** fresh AST 中该 draw 语句的首末 CoordinateItem（= 旧 handle 首末端点的新 span）。 */
function endpointItems(statement: PathStatement): CoordinateItem[] {
  const items = statement.items.filter(
    (item): item is CoordinateItem => item.kind === "Coordinate"
  );
  if (items.length < 2) {
    return [];
  }
  return [items[0], items[items.length - 1]];
}

/** 端口：坐标形式为数值可求（cartesian/polar/xyz）；named/calc 端口的 world 不随
 * scope 移动，排除。 */
function isAbsolutePortHandle(handle: EditHandle): boolean {
  return (
    handle.coordinateForm === "cartesian" ||
    handle.coordinateForm === "polar" ||
    handle.coordinateForm === "xyz"
  );
}

/** 可跟随的导线端点：绝对坐标（direct）、非命名锚点引用（天然跟随）、非相对坐标。 */
function isFollowableEndpoint(handle: EditHandle): boolean {
  if (handle.rewriteTargetHandleId != null) {
    return false;
  }
  if (handle.relativePrefix != null) {
    return false;
  }
  return handle.rewriteMode === "direct";
}

/**
 * 挂接检测用的端点谓词：比 isFollowableEndpoint 宽一档。
 *
 * 命名锚点端点 `(node_M3.d)` 的源文本**必须保持引用**（否则就与引脚脱钩），所以它不是
 * rewriteTargetHandleId == null 的"可改写端点"；但它仍然**物理落在**被拖元件的引脚上。
 * 若在挂接检测里把它当外人，拖拽全程这根线都不动、直到松手才跳回去——用户看到的就是
 * "线没跟着走"。
 *
 * 因此：检测（瞬态预览 + 限幅）用本谓词；**落点改写**仍用 isFollowableEndpoint，
 * 命名锚点端点不生成 patch（它天然跟随锚点所属 scope）。
 */
function isAttachableEndpoint(handle: EditHandle): boolean {
  if (isFollowableEndpoint(handle)) {
    return true;
  }
  return handle.relativePrefix == null && handle.rewriteTargetHandleId != null;
}

function addPortBucket(buckets: Map<string, WorldPoint[]>, point: WorldPoint | undefined): void {
  if (!point) {
    return;
  }
  const key = bucketKey(point);
  const bucket = buckets.get(key);
  if (bucket) {
    bucket.push(point);
  } else {
    buckets.set(key, [point]);
  }
}

function bucketKey(point: WorldPoint): string {
  return `${Math.floor(point.x / BUCKET_SIZE_PT)}:${Math.floor(point.y / BUCKET_SIZE_PT)}`;
}

function bucketContains(buckets: ReadonlyMap<string, WorldPoint[]>, point: WorldPoint): boolean {
  const baseX = Math.floor(point.x / BUCKET_SIZE_PT);
  const baseY = Math.floor(point.y / BUCKET_SIZE_PT);
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const bucket = buckets.get(`${baseX + dx}:${baseY + dy}`);
      if (!bucket) {
        continue;
      }
      if (
        bucket.some(
          (candidate) =>
            Math.abs(candidate.x - point.x) <= MATCH_EPSILON_PT &&
            Math.abs(candidate.y - point.y) <= MATCH_EPSILON_PT
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function isIoNodeStatement(statement: PathStatement, source: string): boolean {
  const raw = source.slice(statement.span.from, statement.span.to);
  return (
    raw.includes("node[circle") ||
    raw.includes("node [circle") ||
    raw.includes("circle, draw") ||
    raw.includes("circle,draw") ||
    raw.includes("node_IO")
  );
}

export type TransientAttachedWire = {
  wireSourceId: string;
  movingEndpointIndex: 0 | 1;
  staticEndpointWorld: WorldPoint;
  movingEndpointWorld: WorldPoint;
  /**
   * True when the wire's route is an implicit orthogonal operator (`|-` / `-|`). Such a route has
   * only two CoordinateItems; its corner is computed by TikZ from the two endpoints and has NO
   * source text -- so the transient preview must RECOMPUTE it from the moved endpoint instead of
   * freezing it at its pre-drag position (freezing it is what drags the segment into a diagonal,
   * the reported transient defect).
   */
  implicitCorner: boolean;
  /**
   * True when the wire is an attached, genuinely-skewed (arbitrary-diagonal) route the repair pass
   * will re-route orthogonally on commit. The transient preview mirrors that so the user sees the
   * wire snap straight during the drag, not only on release.
   */
  skewedRepair: boolean;
};

export function findAttachedWiresForTransientDrag(
  source: string,
  editHandles: readonly EditHandle[],
  movedElementIds: readonly string[],
  scopeElementIds: readonly string[] = []
): TransientAttachedWire[] {
  const movedIdSet = new Set(movedElementIds);
  if (movedIdSet.size === 0) {
    return [];
  }

  const parsed = parseTikzForEdit(source);
  const portBuckets = buildPortBuckets(parsed.figure.body, scopeElementIds, editHandles, movedIdSet);
  const movedVddRails = findVddRails(parsed.figure.body, editHandles, source, new Set(scopeElementIds));
  if (portBuckets.size === 0 && movedVddRails.length === 0) {
    return [];
  }

  const attachedWires: TransientAttachedWire[] = [];

  for (const statement of parsed.figure.body) {
    if (statement.kind !== "Path" || statement.command !== "draw") {
      continue;
    }
    if (movedIdSet.has(statement.id)) {
      continue;
    }
    if (hasShapeKeyword(statement)) {
      continue;
    }
    const statementHandles = editHandles
      .filter((handle) => handle.kind === "path-point" && handle.sourceRef.sourceId === statement.id)
      .sort((left, right) => left.sourceRef.sourceSpan.from - right.sourceRef.sourceSpan.from);
    if (statementHandles.length < 2) {
      continue;
    }
    const endpoints = [statementHandles[0], statementHandles[statementHandles.length - 1]];

    for (let index = 0; index < 2; index++) {
      const endpoint = endpoints[index];
      if (!isAttachableEndpoint(endpoint)) {
        continue;
      }
      const touchesPort = bucketContains(portBuckets, endpoint.world);
      const touchesVdd = isPointOnVddRail(endpoint.world, movedVddRails);
      if (!touchesPort && !touchesVdd) {
        continue;
      }

      const otherIndex = 1 - index;
      const otherEndpoint = endpoints[otherIndex];
      const otherMoves =
        otherEndpoint &&
        (bucketContains(portBuckets, otherEndpoint.world) || isPointOnVddRail(otherEndpoint.world, movedVddRails));
      if (otherMoves || !otherEndpoint) {
        continue;
      }

      attachedWires.push({
        wireSourceId: statement.id,
        movingEndpointIndex: index as 0 | 1,
        movingEndpointWorld: endpoint.world,
        staticEndpointWorld: otherEndpoint.world,
        implicitCorner: hasImplicitOrthoCorner(statement),
        skewedRepair: isOrthogonalRepairCandidate(statementHandles.map((handle) => handle.world))
      });
    }
  }

  return attachedWires;
}

export const INTER_COMPONENT_STRAIGHT_WIRE_BLOCK_REASON =
  "两端连接元件的单段直线导线不可移动，仅跟随两端元件移动而伸缩。";

export type InterComponentStraightWireConnection = {
  wireSourceId: string;
  componentAId: string;
  componentBId: string;
};

export type HalfConnectedStraightWireConnection = {
  wireSourceId: string;
  connectedEndpointIndex: 0 | 1;
  connectedComponentId: string;
  freeEndpointIndex: 0 | 1;
  connectedHandleId?: string;
  freeHandleId?: string;
  anchorWorld: WorldPoint;
  freeWorld: WorldPoint;
  directionVector: WorldVector;
  isAxisAligned: "h" | "v" | null;
};

type StraightWireEndpointsAnalysis = {
  statement: Statement;
  coordinates: CoordinateItem[];
  statementHandles: EditHandle[];
  compA: string | null;
  compB: string | null;
  worldA: WorldPoint;
  worldB: WorldPoint;
};

function analyzeStraightWireEndpoints(
  statement: Statement,
  body: readonly Statement[],
  editHandles: readonly EditHandle[],
  source: string
): StraightWireEndpointsAnalysis | null {
  if (statement.kind !== "Path" || statement.command !== "draw") {
    return null;
  }
  if (hasShapeKeyword(statement)) {
    return null;
  }

  const coordinates = singleCoordinateItems(statement);
  if (coordinates.length !== 2) {
    return null;
  }

  // Must only be a simple single-segment straight wire with "--" operator
  const hasDisallowedItems = statement.items.some((item) => {
    if (item.kind === "Coordinate" || item.kind === "PathOption" || item.kind === "PathComment") {
      return false;
    }
    if (item.kind === "PathKeyword" && item.keyword === "--") {
      return false;
    }
    return true;
  });
  if (hasDisallowedItems) {
    return null;
  }

  const scopePortNames = new Map<string, string>(); // coordinateName -> componentId
  const scopePortBuckets = new Map<string, Array<{ componentId: string; point: WorldPoint }>>();

  function addPortPoint(point: WorldPoint, compId: string): void {
    const qx = Math.round(point.x / BUCKET_SIZE_PT);
    const qy = Math.round(point.y / BUCKET_SIZE_PT);
    const key = `${qx},${qy}`;
    const existing = scopePortBuckets.get(key);
    if (existing) {
      existing.push({ componentId: compId, point });
    } else {
      scopePortBuckets.set(key, [{ componentId: compId, point }]);
    }
  }

  // 1. Traverse scopes
  for (const stmt of body) {
    if (stmt.kind === "Scope") {
      const scopeId = stmt.id;
      const coordIds = new Set<string>();
      collectCoordinateStatementIds(stmt.body, coordIds);

      function collectCoordNames(stmts: readonly Statement[]) {
        for (const s of stmts) {
          if (s.kind === "Path" && s.command === "coordinate") {
            for (const item of s.items) {
              if (item.kind === "Coordinate" && item.raw) {
                const name = item.raw.replace(/[()]/g, "").trim();
                if (name) scopePortNames.set(name, scopeId);
              }
              if (item.kind === "Node" && item.name) {
                scopePortNames.set(item.name, scopeId);
              }
            }
          } else if (s.kind === "Scope") {
            collectCoordNames(s.body);
          }
        }
      }
      collectCoordNames(stmt.body);

      const memberDrawIds = new Set<string>();
      collectDrawStatementIds(stmt.body, memberDrawIds);

      for (const handle of editHandles) {
        if (handle.kind !== "path-point") continue;
        if (coordIds.has(handle.sourceRef.sourceId)) {
          addPortPoint(handle.world, scopeId);
          if (handle.sourceText) {
            const name = handle.sourceText.replace(/[()]/g, "").trim();
            if (name) scopePortNames.set(name, scopeId);
          }
        } else if (memberDrawIds.has(handle.sourceRef.sourceId)) {
          addPortPoint(handle.world, scopeId);
        }
      }
    } else if (stmt.kind === "Path" && stmt.command === "node") {
      for (const item of stmt.items) {
        if (item.kind === "Node" && item.name) {
          scopePortNames.set(item.name, stmt.id);
        }
      }
      for (const handle of editHandles) {
        if (handle.sourceRef.sourceId === stmt.id) {
          addPortPoint(handle.world, stmt.id);
        }
      }
    }
  }

  // 2. VDD rails
  const vddRails = findVddRails(body, editHandles, source);

  // 3. Resolve each endpoint's component
  const statementHandles = editHandles
    .filter((h) => h.kind === "path-point" && h.sourceRef.sourceId === statement.id)
    .sort((a, b) => a.sourceRef.sourceSpan.from - b.sourceRef.sourceSpan.from);

  const resolveCompId = (coordItem: CoordinateItem, handle: EditHandle | undefined): { compId: string | null; worldPt: WorldPoint | null } => {
    const fallbackPt = (coordItem.form === "cartesian" && coordItem.x && coordItem.y)
      ? worldPoint(
          pt(parseFloat(coordItem.x) * PT_PER_CM),
          pt(parseFloat(coordItem.y) * PT_PER_CM)
        )
      : null;
    const worldPt = handle?.world ?? fallbackPt;

    // Check named coordinate reference
    if (coordItem.raw) {
      const rawName = coordItem.raw.replace(/[()]/g, "").trim();
      if (scopePortNames.has(rawName)) {
        return { compId: scopePortNames.get(rawName)!, worldPt };
      }
      const match = rawName.match(/^(node_[A-Za-z0-9]+)[\._]/);
      if (match) {
        const prefix = match[1];
        for (const [name, compId] of scopePortNames) {
          if (name.startsWith(prefix)) {
            return { compId, worldPt };
          }
        }
      }
    }
    if (handle?.sourceText) {
      const rawName = handle.sourceText.replace(/[()]/g, "").trim();
      if (scopePortNames.has(rawName)) {
        return { compId: scopePortNames.get(rawName)!, worldPt };
      }
    }

    if (worldPt) {
      for (const rail of vddRails) {
        if (
          Math.abs(worldPt.y - rail.y) <= MATCH_EPSILON_PT &&
          worldPt.x >= rail.minX - MATCH_EPSILON_PT &&
          worldPt.x <= rail.maxX + MATCH_EPSILON_PT
        ) {
          return { compId: rail.scopeId, worldPt };
        }
      }

      const qx = Math.round(worldPt.x / BUCKET_SIZE_PT);
      const qy = Math.round(worldPt.y / BUCKET_SIZE_PT);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const key = `${qx + dx},${qy + dy}`;
          const list = scopePortBuckets.get(key);
          if (!list) continue;
          for (const entry of list) {
            if (Math.hypot(worldPt.x - entry.point.x, worldPt.y - entry.point.y) <= MATCH_EPSILON_PT) {
              return { compId: entry.componentId, worldPt };
            }
          }
        }
      }
    }

    return { compId: null, worldPt };
  };

  const resA = resolveCompId(coordinates[0], statementHandles[0]);
  const resB = resolveCompId(coordinates[1], statementHandles[statementHandles.length - 1]);
  const worldA = resA.worldPt ?? worldPoint(pt(0), pt(0));
  const worldB = resB.worldPt ?? worldPoint(pt(0), pt(0));

  return {
    statement,
    coordinates,
    statementHandles,
    compA: resA.compId,
    compB: resB.compId,
    worldA,
    worldB
  };
}

/**
 * Checks if a given statement in the AST is a single-segment straight wire
 * that connects two different circuit components (scopes, VDD rails, or standalone nodes).
 */
export function findInterComponentStraightWireConnection(
  statement: Statement,
  body: readonly Statement[],
  editHandles: readonly EditHandle[],
  source: string
): InterComponentStraightWireConnection | null {
  const analysis = analyzeStraightWireEndpoints(statement, body, editHandles, source);
  if (!analysis || !analysis.compA || !analysis.compB || analysis.compA === analysis.compB) {
    return null;
  }
  return {
    wireSourceId: statement.id,
    componentAId: analysis.compA,
    componentBId: analysis.compB
  };
}

export function findAllInterComponentStraightWires(
  body: readonly Statement[],
  editHandles: readonly EditHandle[],
  source: string
): InterComponentStraightWireConnection[] {
  const results: InterComponentStraightWireConnection[] = [];
  for (const stmt of body) {
    const conn = findInterComponentStraightWireConnection(stmt, body, editHandles, source);
    if (conn) {
      results.push(conn);
    }
  }
  return results;
}

export function collectInterComponentStraightWireSourceIds(
  body: readonly Statement[],
  editHandles: readonly EditHandle[],
  source: string
): Set<string> {
  const ids = new Set<string>();
  const connections = findAllInterComponentStraightWires(body, editHandles, source);
  for (const conn of connections) {
    ids.add(conn.wireSourceId);
  }
  return ids;
}

/**
 * Checks if a given statement in the AST is a single-segment straight wire
 * where EXACTLY ONE end is connected to a circuit component, and the other end is free.
 */
export function findHalfConnectedStraightWireConnection(
  statement: Statement,
  body: readonly Statement[],
  editHandles: readonly EditHandle[],
  source: string
): HalfConnectedStraightWireConnection | null {
  const analysis = analyzeStraightWireEndpoints(statement, body, editHandles, source);
  if (!analysis) return null;
  const isCompA = Boolean(analysis.compA);
  const isCompB = Boolean(analysis.compB);
  if ((isCompA && isCompB) || (!isCompA && !isCompB)) {
    return null;
  }

  const connectedEndpointIndex: 0 | 1 = isCompA ? 0 : 1;
  const freeEndpointIndex: 0 | 1 = isCompA ? 1 : 0;
  const connectedComponentId = (analysis.compA ?? analysis.compB)!;
  const h0 = analysis.statementHandles[0];
  const h1 = analysis.statementHandles[analysis.statementHandles.length - 1];
  const connectedHandleId = isCompA ? h0?.id : h1?.id;
  const freeHandleId = isCompA ? h1?.id : h0?.id;
  const anchorWorld = isCompA ? analysis.worldA : analysis.worldB;
  const freeWorld = isCompA ? analysis.worldB : analysis.worldA;

  const dx = freeWorld.x - anchorWorld.x;
  const dy = freeWorld.y - anchorWorld.y;
  const dist = Math.hypot(dx, dy);
  const directionVector = dist > 1e-6
    ? worldVector(pt(dx / dist), pt(dy / dist))
    : worldVector(pt(1), pt(0));

  const isAxisAligned: "h" | "v" | null =
    Math.abs(dy) <= 1.0 || Math.abs(directionVector.y) <= 0.05
      ? "h"
      : Math.abs(dx) <= 1.0 || Math.abs(directionVector.x) <= 0.05
        ? "v"
        : null;

  return {
    wireSourceId: statement.id,
    connectedEndpointIndex,
    connectedComponentId,
    freeEndpointIndex,
    connectedHandleId,
    freeHandleId,
    anchorWorld,
    freeWorld,
    directionVector,
    isAxisAligned
  };
}

export function findAllHalfConnectedStraightWires(
  body: readonly Statement[],
  editHandles: readonly EditHandle[],
  source: string
): HalfConnectedStraightWireConnection[] {
  const results: HalfConnectedStraightWireConnection[] = [];
  for (const stmt of body) {
    const conn = findHalfConnectedStraightWireConnection(stmt, body, editHandles, source);
    if (conn) {
      results.push(conn);
    }
  }
  return results;
}

export function collectHalfConnectedStraightWireLockedHandleIds(
  body: readonly Statement[],
  editHandles: readonly EditHandle[],
  source: string
): Set<string> {
  const lockedIds = new Set<string>();
  const wires = findAllHalfConnectedStraightWires(body, editHandles, source);
  for (const wire of wires) {
    if (wire.connectedHandleId) {
      lockedIds.add(wire.connectedHandleId);
    }
  }
  return lockedIds;
}

export type RigidLeafBranch = {
  wireStatementId: string;
  leafComponentId: string;
  orientation: "h" | "v";
  branchDelta: WorldPoint;
  wireMovingEndpointIndex: 0 | 1;
  wireStaticEndpointIndex: 0 | 1;
  isTapBranch?: boolean;
  isStretchOnly?: boolean;
  associatedDotStatementIds?: string[];
};

export function detectRigidLeafBranches(
  source: string,
  body: readonly Statement[],
  editHandles: readonly EditHandle[],
  movedElementIds: readonly string[],
  delta: WorldPoint
): RigidLeafBranch[] {
  const movedIdSet = new Set(movedElementIds);
  if (movedIdSet.size === 0) {
    return [];
  }
  if (Math.abs(delta.x) <= 1e-6 && Math.abs(delta.y) <= 1e-6) {
    return [];
  }

  const analyzedWires: NonNullable<ReturnType<typeof analyzeStraightWireEndpoints>>[] = [];
  for (const stmt of body) {
    const analysis = analyzeStraightWireEndpoints(stmt, body, editHandles, source);
    if (analysis) {
      analyzedWires.push(analysis);
    }
  }

  const branches: RigidLeafBranch[] = [];
  const currentMoved = new Set(movedIdSet);

  // 1. Cross-axis rigid propagation:
  // - If moving in X (delta.x != 0), vertical wires (isV) skew -> follow in X!
  // - If moving in Y (delta.y != 0), horizontal wires (isH) skew -> follow in Y!
  let changed = true;
  while (changed) {
    changed = false;
    for (const w of analyzedWires) {
      const isAInMoved = w.compA ? currentMoved.has(w.compA) : false;
      const isBInMoved = w.compB ? currentMoved.has(w.compB) : false;
      if ((isAInMoved && isBInMoved) || (!isAInMoved && !isBInMoved)) {
        continue;
      }
      const movingCompId = isAInMoved ? w.compA : w.compB;
      const otherCompId = isAInMoved ? w.compB : w.compA;
      if (!otherCompId || currentMoved.has(otherCompId)) {
        continue;
      }

      // Boundary terminals (VDD, GND, Vin, Vout, Port) are terminal leaves in the
      // circuit topology. They must NEVER propagate rigid motion into the circuit
      // to drag internal components (resistors, capacitors, transistors, etc.).
      if (movingCompId) {
        const movingScope = findScopeStatementById(body, movingCompId);
        if (movingScope) {
          const movingScopeText = source.slice(movingScope.span.from, movingScope.span.to);
          const isMovingTerminal =
            movingScopeText.includes("node_VDD") ||
            movingScopeText.includes("V_{DD}") ||
            movingScopeText.includes("VDD") ||
            movingScopeText.includes("node_GND") ||
            movingScopeText.includes("GND") ||
            movingScopeText.includes("node_IO") ||
            movingScopeText.includes("node_Port");
          if (isMovingTerminal) {
            continue;
          }
        }
      }

      const dx = Math.abs(w.worldB.x - w.worldA.x);
      const dy = Math.abs(w.worldB.y - w.worldA.y);
      const isH = dy <= 1.0;
      const isV = dx <= 1.0;
      if (!isH && !isV) {
        continue;
      }

      const orientation: "h" | "v" = isH ? "h" : "v";
      if (orientation === "h" && Math.abs(delta.y) <= 1e-4) {
        continue;
      }
      if (orientation === "v" && Math.abs(delta.x) <= 1e-4) {
        continue;
      }

      const otherScope = findScopeStatementById(body, otherCompId);
      if (!otherScope) {
        continue;
      }
      const otherScopeText = source.slice(otherScope.span.from, otherScope.span.to);
      const isTerminal =
        otherScopeText.includes("node_VDD") ||
        otherScopeText.includes("V_{DD}") ||
        otherScopeText.includes("VDD") ||
        otherScopeText.includes("node_GND") ||
        otherScopeText.includes("GND") ||
        otherScopeText.includes("node_IO");

      // Check if other component can move rigidly:
      // 1. Single-lead leaf component (e.g. Vin, Vout, GND, VDD): wire count <= 1 -> can move!
      // 2. Co-axial series component (e.g. resistor RD with vertical in and vertical out):
      //    all its attached wires share the same orientation -> can move!
      // 3. Multi-axis components (e.g. M2 with both H and V wires) or shared multi-drop terminals -> must NOT move!
      const wiresOnComp = analyzedWires.filter(
        (wire) => wire.compA === otherCompId || wire.compB === otherCompId
      );

      // Shared terminals (VDD/GND connected to multiple branches) must remain fixed
      if (isTerminal && wiresOnComp.length > 1) {
        continue;
      }

      const isCoaxialSeries =
        wiresOnComp.length > 0 &&
        wiresOnComp.every((wire) => {
          const wDx = Math.abs(wire.worldB.x - wire.worldA.x);
          const wDy = Math.abs(wire.worldB.y - wire.worldA.y);
          const wOri = wDy <= 1.0 ? "h" : wDx <= 1.0 ? "v" : null;
          return wOri === orientation;
        });
      if (wiresOnComp.length > 1 && !isCoaxialSeries) {
        continue;
      }

      const branchDelta =
        orientation === "h"
          ? worldPoint(pt(0), pt(delta.y))
          : worldPoint(pt(delta.x), pt(0));

      branches.push({
        wireStatementId: w.statement.id,
        leafComponentId: otherCompId,
        orientation,
        branchDelta,
        wireMovingEndpointIndex: isAInMoved ? 0 : 1,
        wireStaticEndpointIndex: isAInMoved ? 1 : 0
      });
      currentMoved.add(otherCompId);
      changed = true;
    }
  }

  // 2. Detect T-junction taps, branch node scopes, and branch dots on moved trunk wires
  const checkTrunkBranches = (isTrunkVertical: boolean) => {
    const isMoving = isTrunkVertical ? Math.abs(delta.x) > 1e-4 : Math.abs(delta.y) > 1e-4;
    if (!isMoving) return;

    const trunkOrientation: "v" | "h" = isTrunkVertical ? "v" : "h";
    const tapOrientation: "v" | "h" = isTrunkVertical ? "h" : "v";
    const trunkBranchDelta = isTrunkVertical
      ? worldPoint(pt(delta.x), pt(0))
      : worldPoint(pt(0), pt(delta.y));

    for (const b of [...branches]) {
      if (b.orientation !== trunkOrientation) continue;
      const trunkAnalysis = analyzedWires.find((w) => w.statement.id === b.wireStatementId);
      if (!trunkAnalysis) continue;

      const trunkCoord = isTrunkVertical
        ? (trunkAnalysis.worldA.x + trunkAnalysis.worldB.x) / 2
        : (trunkAnalysis.worldA.y + trunkAnalysis.worldB.y) / 2;
      const minAlong = isTrunkVertical
        ? Math.min(trunkAnalysis.worldA.y, trunkAnalysis.worldB.y)
        : Math.min(trunkAnalysis.worldA.x, trunkAnalysis.worldB.x);
      const maxAlong = isTrunkVertical
        ? Math.max(trunkAnalysis.worldA.y, trunkAnalysis.worldB.y)
        : Math.max(trunkAnalysis.worldA.x, trunkAnalysis.worldB.x);

      const isPointOnTrunk = (p: WorldPoint, tol = 2.0) => {
        const perp = isTrunkVertical ? p.x : p.y;
        const along = isTrunkVertical ? p.y : p.x;
        return Math.abs(perp - trunkCoord) <= tol && along >= minAlong - tol && along <= maxAlong + tol;
      };

      // 2A. Check branch node scopes sitting on the trunk
      for (const stmt of body) {
        if (stmt.kind !== "Scope" || currentMoved.has(stmt.id)) continue;
        const scopeText = source.slice(stmt.span.from, stmt.span.to);
        const hasDotKeyword =
          scopeText.includes(".dot") ||
          scopeText.includes("_dot") ||
          (scopeText.includes("circle") && scopeText.includes("coordinate"));
        if (!hasDotKeyword) continue;

        const scopeCoordIds = new Set<string>();
        collectCoordinateStatementIds(stmt.body, scopeCoordIds);
        if (scopeCoordIds.size === 0) continue;

        let dotHandle: EditHandle | undefined;

        // 1. First priority: statement whose text explicitly contains .dot or _dot
        for (const child of stmt.body) {
          if (child.kind === "Path" && child.command === "coordinate") {
            const childText = source.slice(child.span.from, child.span.to);
            if (childText.includes(".dot") || childText.includes("_dot")) {
              const h = editHandles.find(
                (handle) => handle.kind === "path-point" && handle.sourceRef.sourceId === child.id
              );
              if (h && isPointOnTrunk(h.world)) {
                dotHandle = h;
                break;
              }
            }
          }
        }

        // 2. Second priority: any coordinate belonging to this scope that sits on the trunk
        if (!dotHandle) {
          for (const handle of editHandles) {
            if (handle.kind === "path-point" && scopeCoordIds.has(handle.sourceRef.sourceId)) {
              if (isPointOnTrunk(handle.world)) {
                dotHandle = handle;
                break;
              }
            }
          }
        }

        if (dotHandle) {
          branches.push({
            wireStatementId: trunkAnalysis.statement.id,
            leafComponentId: stmt.id,
            orientation: trunkOrientation,
            branchDelta: trunkBranchDelta,
            wireMovingEndpointIndex: 0,
            wireStaticEndpointIndex: 0,
            isTapBranch: true
          });
          currentMoved.add(stmt.id);

          // Check if this branch node scope has an external tap wire connected to its other port
          for (const tapWire of analyzedWires) {
            if (branches.some((existing) => existing.wireStatementId === tapWire.statement.id)) {
              continue;
            }
            if (tapWire.compA !== stmt.id && tapWire.compB !== stmt.id) {
              continue;
            }

            const touchDotIndex: 0 | 1 = tapWire.compA === stmt.id ? 0 : 1;
            const otherIndex: 0 | 1 = tapWire.compA === stmt.id ? 1 : 0;
            const downstreamCompId = touchDotIndex === 0 ? tapWire.compB : tapWire.compA;

            if (downstreamCompId && !currentMoved.has(downstreamCompId)) {
              const wiresOnDownstream = analyzedWires.filter(
                (w) => w.compA === downstreamCompId || w.compB === downstreamCompId
              );

              if (wiresOnDownstream.length <= 1) {
                branches.push({
                  wireStatementId: tapWire.statement.id,
                  leafComponentId: downstreamCompId,
                  orientation: tapOrientation,
                  branchDelta: trunkBranchDelta,
                  wireMovingEndpointIndex: touchDotIndex,
                  wireStaticEndpointIndex: otherIndex,
                  isTapBranch: true
                });
                currentMoved.add(downstreamCompId);
              } else {
                branches.push({
                  wireStatementId: tapWire.statement.id,
                  leafComponentId: "",
                  orientation: tapOrientation,
                  branchDelta: trunkBranchDelta,
                  wireMovingEndpointIndex: touchDotIndex,
                  wireStaticEndpointIndex: otherIndex,
                  isTapBranch: false,
                  isStretchOnly: true
                });
              }
            } else if (!downstreamCompId) {
              branches.push({
                wireStatementId: tapWire.statement.id,
                leafComponentId: "",
                orientation: tapOrientation,
                branchDelta: trunkBranchDelta,
                wireMovingEndpointIndex: touchDotIndex,
                wireStaticEndpointIndex: otherIndex,
                isTapBranch: false,
                isStretchOnly: true
              });
            }
          }
        }
      }

      // 2B. Check direct tap wires attached to the trunk
      for (const tapWire of analyzedWires) {
        if (branches.some((existing) => existing.wireStatementId === tapWire.statement.id)) {
          continue;
        }
        const isTapCorrectOrientation = isTrunkVertical
          ? Math.abs(tapWire.worldB.y - tapWire.worldA.y) <= 1.0
          : Math.abs(tapWire.worldB.x - tapWire.worldA.x) <= 1.0;
        if (!isTapCorrectOrientation) continue;

        const touchA = isPointOnTrunk(tapWire.worldA, 1.5);
        const touchB = isPointOnTrunk(tapWire.worldB, 1.5);
        if (!touchA && !touchB) continue;

        const tapMovingIndex: 0 | 1 = touchA ? 0 : 1;
        const tapStaticIndex: 0 | 1 = touchA ? 1 : 0;
        const tapAttachedComp = touchA ? tapWire.compB : tapWire.compA;

        if (tapAttachedComp && !currentMoved.has(tapAttachedComp)) {
          const wiresOnComp = analyzedWires.filter(
            (w) => w.compA === tapAttachedComp || w.compB === tapAttachedComp
          );
          if (wiresOnComp.length <= 1) {
            branches.push({
              wireStatementId: tapWire.statement.id,
              leafComponentId: tapAttachedComp,
              orientation: tapOrientation,
              branchDelta: trunkBranchDelta,
              wireMovingEndpointIndex: tapMovingIndex,
              wireStaticEndpointIndex: tapStaticIndex,
              isTapBranch: true
            });
            currentMoved.add(tapAttachedComp);
          } else {
            branches.push({
              wireStatementId: tapWire.statement.id,
              leafComponentId: "",
              orientation: tapOrientation,
              branchDelta: trunkBranchDelta,
              wireMovingEndpointIndex: tapMovingIndex,
              wireStaticEndpointIndex: tapStaticIndex,
              isTapBranch: false,
              isStretchOnly: true
            });
          }
        }
      }

      // 2C. Check branch dots (top-level \draw ... circle)
      for (const stmt of body) {
        if (stmt.kind !== "Path" || stmt.command !== "draw") continue;
        const text = source.slice(stmt.span.from, stmt.span.to);
        if (text.includes("circle") && !text.includes("--")) {
          const statementHandles = editHandles
            .filter((handle) => handle.kind === "path-point" && handle.sourceRef.sourceId === stmt.id);
          if (statementHandles.length > 0) {
            const center = statementHandles[0].world;
            if (isPointOnTrunk(center, 2.0)) {
              b.associatedDotStatementIds = b.associatedDotStatementIds || [];
              b.associatedDotStatementIds.push(stmt.id);
            }
          }
        }
      }
    }
  };

  checkTrunkBranches(true);
  checkTrunkBranches(false);

  return branches;
}

