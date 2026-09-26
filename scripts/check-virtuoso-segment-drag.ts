import { parseTikzForEdit } from "../packages/core/src/edit/parse-options.js";
import { formatNumber } from "../packages/core/src/edit/format.js";
import { ptToCm } from "../packages/core/src/coords/source.js";
import { replaceSpan } from "../packages/core/src/edit/patch.js";
import { formatCoordinate } from "../packages/core/src/edit/style.js";
import type { CoordinateItem, PathKeywordItem, PathStatement, Span, Statement } from "../packages/core/src/ast/types.js";
import type { EditParseOptions } from "../packages/core/src/edit/parse-options.js";
import type { WorldPoint } from "../packages/core/src/coords/points.js";
import { worldPoint } from "../packages/core/src/coords/points.js";
import { pt } from "../packages/core/src/coords/scalars.js";
import type { EditHandle } from "../packages/core/src/semantic/types.js";

function findPathStatementBySourceId(
  statements: readonly Statement[],
  sourceId: string
): PathStatement | null {
  for (const statement of statements) {
    if (statement.kind === "Path" && statement.id === sourceId) {
      return statement;
    }
    if (statement.kind === "Scope") {
      const nested = findPathStatementBySourceId(statement.body, sourceId);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

function getCoordinateWorld(
  coord: CoordinateItem,
  statementId: string,
  editHandles?: readonly EditHandle[]
): { x: string; y: string } {
  if (editHandles) {
    const matchingHandle = editHandles.find(
      (h) =>
        h.kind === "path-point" &&
        h.sourceRef.sourceId === statementId &&
        h.sourceRef.sourceSpan.from === coord.span.from
    );
    if (matchingHandle) {
      return {
        x: formatNumber(ptToCm(matchingHandle.world.x)),
        y: formatNumber(ptToCm(matchingHandle.world.y))
      };
    }
  }
  if (coord.form === "cartesian") {
    return {
      x: coord.x,
      y: coord.y
    };
  }
  return { x: "0", y: "0" };
}

export function applyMoveOrthoSegment(
  source: string,
  elementId: string,
  segmentIndex: number,
  axis: "h" | "v",
  newWorld: WorldPoint,
  parseOptions: EditParseOptions = {},
  editHandles?: readonly EditHandle[]
): { newSource: string } {
  const parsed = parseTikzForEdit(source, parseOptions);
  const statement = findPathStatementBySourceId(parsed.figure.body, elementId);
  if (!statement || statement.command !== "draw") {
    throw new Error("Target statement not found or not a draw path");
  }

  const coordinates = statement.items.filter((item): item is CoordinateItem => item.kind === "Coordinate");
  const operator = statement.items.find(
    (item): item is PathKeywordItem =>
      item.kind === "PathKeyword" && (item.keyword === "|-" || item.keyword === "-|" || item.keyword === "--")
  );

  const newCmX = formatNumber(ptToCm(newWorld.x));
  const newCmY = formatNumber(ptToCm(newWorld.y));

  // Case 1: 2-point wire (either implicit |- / -|, or explicit --)
  if (coordinates.length === 2 && operator) {
    const c0 = coordinates[0];
    const c1 = coordinates[1];
    const p0 = getCoordinateWorld(c0, elementId, editHandles);
    const p1 = getCoordinateWorld(c1, elementId, editHandles);

    let replacement = "";
    if (axis === "v") {
      replacement = `-- (${newCmX},${p0.y}) -- (${newCmX},${p1.y}) --`;
    } else {
      replacement = `-- (${p0.x},${newCmY}) -- (${p1.x},${newCmY}) --`;
    }
    const updated = replaceSpan(source, operator.span, replacement);
    return { newSource: updated.source };
  }

  const m = coordinates.length;
  if (m < 2 || segmentIndex < 0 || segmentIndex >= m - 1) {
    throw new Error(`Invalid segmentIndex ${segmentIndex} for polyline with ${m} coordinates`);
  }

  const k = segmentIndex;
  const ck = coordinates[k];
  const ck1 = coordinates[k + 1];

  // Case 2: Internal segment (1 <= k <= m - 3)
  if (k >= 1 && k <= m - 3) {
    const rawK = source.slice(ck.span.from, ck.span.to);
    const rawK1 = source.slice(ck1.span.from, ck1.span.to);

    const newKText = axis === "v" ? formatCoordinate(rawK, newCmX, ck.y) : formatCoordinate(rawK, ck.x, newCmY);
    const newK1Text = axis === "v" ? formatCoordinate(rawK1, newCmX, ck1.y) : formatCoordinate(rawK1, ck1.x, newCmY);

    const r2 = replaceSpan(source, ck1.span, newK1Text);
    const r1 = replaceSpan(r2.source, ck.span, newKText);
    return { newSource: r1.source };
  }

  // Case 3: Boundary segment k === 0 (start endpoint ck to intermediate corner ck1)
  if (k === 0) {
    const pk = getCoordinateWorld(ck, elementId, editHandles);
    const rawK1 = source.slice(ck1.span.from, ck1.span.to);
    if (axis === "v") {
      const newK1Text = formatCoordinate(rawK1, newCmX, ck1.y);
      const newCorner = ` -- (${newCmX},${pk.y})`;
      const r2 = replaceSpan(source, ck1.span, newK1Text);
      const r1 = replaceSpan(r2.source, { from: ck.span.to, to: ck.span.to }, newCorner);
      return { newSource: r1.source };
    } else {
      const newK1Text = formatCoordinate(rawK1, ck1.x, newCmY);
      const newCorner = ` -- (${pk.x},${newCmY})`;
      const r2 = replaceSpan(source, ck1.span, newK1Text);
      const r1 = replaceSpan(r2.source, { from: ck.span.to, to: ck.span.to }, newCorner);
      return { newSource: r1.source };
    }
  }

  // Case 4: Boundary segment k === m - 2 (intermediate corner ck to end endpoint ck1)
  if (k === m - 2) {
    const pk1 = getCoordinateWorld(ck1, elementId, editHandles);
    const rawK = source.slice(ck.span.from, ck.span.to);
    if (axis === "v") {
      const newKText = formatCoordinate(rawK, newCmX, ck.y);
      const newCorner = `(${newCmX},${pk1.y}) -- `;
      const r2 = replaceSpan(source, { from: ck1.span.from, to: ck1.span.from }, newCorner);
      const r1 = replaceSpan(r2.source, ck.span, newKText);
      return { newSource: r1.source };
    } else {
      const newKText = formatCoordinate(rawK, ck.x, newCmY);
      const newCorner = `(${pk1.x},${newCmY}) -- `;
      const r2 = replaceSpan(source, { from: ck1.span.from, to: ck1.span.from }, newCorner);
      const r1 = replaceSpan(r2.source, ck.span, newKText);
      return { newSource: r1.source };
    }
  }

  // Fallback
  const rawK = source.slice(ck.span.from, ck.span.to);
  const rawK1 = source.slice(ck1.span.from, ck1.span.to);
  const newKText = axis === "v" ? formatCoordinate(rawK, newCmX, ck.y) : formatCoordinate(rawK, ck.x, newCmY);
  const newK1Text = axis === "v" ? formatCoordinate(rawK1, newCmX, ck1.y) : formatCoordinate(rawK1, ck1.x, newCmY);
  const r2 = replaceSpan(source, ck1.span, newK1Text);
  const r1 = replaceSpan(r2.source, ck.span, newKText);
  return { newSource: r1.source };
}

// ---------------------------------------------------------
// Tests:
// ---------------------------------------------------------
console.log("Running comprehensive check-virtuoso-segment-drag suite...");

// Test 1: 4-point wire, dragging middle vertical segment (User's exact scenario!)
const src1 = `\\begin{tikzpicture}\n\\draw[line width=0.32mm] (node_M2.d) -- (5.00,3.50) -- (5.00,-0.50) -- (node_M1.s);\n\\end{tikzpicture}`;
const p1 = parseTikzForEdit(src1);
const id1 = p1.figure.body[0].id;
const res1 = applyMoveOrthoSegment(src1, id1, 1, "v", worldPoint(pt(7 * 28.4527559), pt(0)));
console.log("Test 1 Result:\n", res1.newSource);
if (!res1.newSource.includes("(node_M2.d) -- (7,3.50) -- (7,-0.50) -- (node_M1.s)") &&
    !res1.newSource.includes("(node_M2.d) -- (7.00,3.50) -- (7.00,-0.50) -- (node_M1.s)")) {
  console.error("FAIL Test 1");
  process.exit(1);
}

// Test 2: 4-point wire, dragging middle horizontal segment
const src2 = `\\begin{tikzpicture}\n\\draw[line width=0.32mm] (node_M2.d) -- (1.00,4.00) -- (5.00,4.00) -- (node_M1.s);\n\\end{tikzpicture}`;
const p2 = parseTikzForEdit(src2);
const id2 = p2.figure.body[0].id;
const res2 = applyMoveOrthoSegment(src2, id2, 1, "h", worldPoint(pt(0), pt(2.5 * 28.4527559)));
console.log("Test 2 Result:\n", res2.newSource);
if (!res2.newSource.includes("2.5") || !res2.newSource.includes("(node_M2.d)") || !res2.newSource.includes("(node_M1.s)")) {
  console.error("FAIL Test 2");
  process.exit(1);
}

// Test 3: 3-point wire, dragging vertical leg (k=1)
const src3 = `\\begin{tikzpicture}\n\\draw[line width=0.32mm] (node_M2.d) -- (5.00,3.50) -- (5.00,-0.50);\n\\end{tikzpicture}`;
const p3 = parseTikzForEdit(src3);
const id3 = p3.figure.body[0].id;
const res3 = applyMoveOrthoSegment(src3, id3, 1, "v", worldPoint(pt(6.2 * 28.4527559), pt(0)));
console.log("Test 3 Result:\n", res3.newSource);
if (!res3.newSource.includes("6.2") || !res3.newSource.includes("(node_M2.d)")) {
  console.error("FAIL Test 3");
  process.exit(1);
}

// Test 4: 2-point wire with |- implicit operator, dragging vertical segment
const src4 = `\\begin{tikzpicture}\n\\draw[line width=0.32mm] (node_M2.d) |- (node_M1.s);\n\\end{tikzpicture}`;
const p4 = parseTikzForEdit(src4);
const id4 = p4.figure.body[0].id;
const res4 = applyMoveOrthoSegment(src4, id4, 0, "v", worldPoint(pt(4.5 * 28.4527559), pt(0)));
console.log("Test 4 Result:\n", res4.newSource);
if (!res4.newSource.includes("4.5") || !res4.newSource.includes("(node_M2.d)") || !res4.newSource.includes("(node_M1.s)")) {
  console.error("FAIL Test 4");
  process.exit(1);
}

// Test 5: 4-point wire, dragging first segment k=0
const src5 = `\\begin{tikzpicture}\n\\draw (1.00,3.50) -- (5.00,3.50) -- (5.00,-0.50) -- (1.00,-0.50);\n\\end{tikzpicture}`;
const p5 = parseTikzForEdit(src5);
const id5 = p5.figure.body[0].id;
const res5 = applyMoveOrthoSegment(src5, id5, 0, "h", worldPoint(pt(0), pt(4.2 * 28.4527559)));
console.log("Test 5 Result:\n", res5.newSource);
if (!res5.newSource.includes("4.2") || !res5.newSource.includes("(1.00,3.50)")) {
  console.error("FAIL Test 5");
  process.exit(1);
}

console.log("ALL TESTS PASSED SUCCESSFULLY! 100% ROCK SOLID!");
