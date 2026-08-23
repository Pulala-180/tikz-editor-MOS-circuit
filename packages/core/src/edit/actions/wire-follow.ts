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
 * （rectangle/circle/ellipse）。引用命名锚点的端点天然跟随锚点/scope，
 * 不在此范围（rewriteTargetHandleId != null 直接跳过）。
 */

import type { CoordinateItem, PathStatement, ScopeStatement, Span, Statement } from "../../ast/types.js";
import { pt } from "../../coords/scalars.js";
import { worldPoint, type WorldPoint } from "../../coords/points.js";
import { parseTikzForEdit, type EditParseOptions } from "../parse-options.js";
import { rewriteCoordinate } from "../rewrite.js";
import type { EditHandle } from "../../semantic/types.js";

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
  const scopePortStatementIds = new Set<string>();
  for (const scopeId of scopeElementIds) {
    const scope = findScopeStatementById(parsed.figure.body, scopeId);
    if (scope) {
      collectCoordinateStatementIds(scope.body, scopePortStatementIds);
    }
  }

  const portBuckets = new Map<string, WorldPoint[]>();
  const directMovedPathHandles = new Map<string, EditHandle[]>();
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
  for (const handles of directMovedPathHandles.values()) {
    handles.sort((left, right) => left.sourceRef.sourceSpan.from - right.sourceRef.sourceSpan.from);
    addPortBucket(portBuckets, handles[0]?.world);
    if (handles.length > 1) {
      addPortBucket(portBuckets, handles[handles.length - 1]?.world);
    }
  }
  const movedVddRails = findVddRails(parsed.figure.body, editHandles, source, new Set(scopeElementIds));
  if (portBuckets.size === 0 && movedVddRails.length === 0) {
    return delta;
  }

  let deltaX: number = delta.x as number;
  let deltaY: number = delta.y as number;

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
      if (!isFollowableEndpoint(endpoint)) {
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
        if (vX > 0) {
          const minDeltaX = MIN_WIRE_LENGTH_PT - vX;
          if (deltaX < minDeltaX) {
            deltaX = minDeltaX;
          }
        } else if (vX < 0) {
          const maxDeltaX = -vX - MIN_WIRE_LENGTH_PT;
          if (deltaX > maxDeltaX) {
            deltaX = maxDeltaX;
          }
        }
      } else if (isVertical) {
        if (vY > 0) {
          const minDeltaY = MIN_WIRE_LENGTH_PT - vY;
          if (deltaY < minDeltaY) {
            deltaY = minDeltaY;
          }
        } else if (vY < 0) {
          const maxDeltaY = -vY - MIN_WIRE_LENGTH_PT;
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
  parseOptions: EditParseOptions = {}
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

  // 1. 被移动 scope 子树内 command==="coordinate" 的 Path 语句 id（scope 端口语句）
  const scopePortStatementIds = new Set<string>();
  for (const scopeId of scopeElementIds) {
    const scope = findScopeStatementById(parsed.figure.body, scopeId);
    if (scope) {
      collectCoordinateStatementIds(scope.body, scopePortStatementIds);
    }
  }

  // 2. 端口 handle（移动前 world）建量化桶——精确值，无取整误差。
  //    scope 坐标端口 + 直接移动的路径元件首末端点。
  const portBuckets = new Map<string, WorldPoint[]>();
  const directMovedPathHandles = new Map<string, EditHandle[]>();
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
  for (const handles of directMovedPathHandles.values()) {
    handles.sort((left, right) => left.sourceRef.sourceSpan.from - right.sourceRef.sourceSpan.from);
    addPortBucket(portBuckets, handles[0]?.world);
    if (handles.length > 1) {
      addPortBucket(portBuckets, handles[handles.length - 1]?.world);
    }
  }
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
        if (isFollowableEndpoint(centerHandle) && (bucketContains(portBuckets, centerHandle.world) || isPointOnVddRail(centerHandle.world, movedVddRails))) {
          const freshCoordItems = singleCoordinateItems(statement);
          if (freshCoordItems.length > 0) {
            const fresh = freshCoordItems[0];
            const newWorld = worldPoint(pt(centerHandle.world.x + delta.x), pt(centerHandle.world.y + delta.y));
            const adjusted = {
              ...centerHandle,
              sourceRef: { ...centerHandle.sourceRef, sourceSpan: fresh.span }
            };
            const text = rewriteCoordinate(newWorld, adjusted, source);
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
          const text = rewriteCoordinate(newWorld, adjusted, source);
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
      if (!isFollowableEndpoint(endpoint)) {
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
      const text = rewriteCoordinate(newWorld, adjusted, source);
      if (text == null) {
        continue;
      }
      pending.push({ span: freshItem.span, text, statementId: statement.id });
    }
  }
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

function hasShapeKeyword(statement: PathStatement): boolean {
  return statement.items.some(
    (item) => item.kind === "PathKeyword" && SHAPE_KEYWORDS.has(item.keyword)
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
  const scopePortStatementIds = new Set<string>();
  for (const scopeId of scopeElementIds) {
    const scope = findScopeStatementById(parsed.figure.body, scopeId);
    if (scope) {
      collectCoordinateStatementIds(scope.body, scopePortStatementIds);
    }
  }

  const portBuckets = new Map<string, WorldPoint[]>();
  const directMovedPathHandles = new Map<string, EditHandle[]>();
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
  for (const handles of directMovedPathHandles.values()) {
    handles.sort((left, right) => left.sourceRef.sourceSpan.from - right.sourceRef.sourceSpan.from);
    addPortBucket(portBuckets, handles[0]?.world);
    if (handles.length > 1) {
      addPortBucket(portBuckets, handles[handles.length - 1]?.world);
    }
  }
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
      if (!isFollowableEndpoint(endpoint)) {
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
        staticEndpointWorld: otherEndpoint.world
      });
    }
  }

  return attachedWires;
}

