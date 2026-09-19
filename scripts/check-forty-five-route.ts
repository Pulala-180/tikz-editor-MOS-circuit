/**
 * Verification for the lead-aware 45-degree route (fortyFiveCandidates in wire-auto-route.ts).
 *
 * The two pins of a connection rarely differ by the same amount in x and y, so the leftover has to be
 * absorbed by a straight leg. These assertions lock down what the route guarantees:
 *   * exactly one straight leftover leg, axis-aligned, as long as the coordinate difference;
 *   * one exact 45-degree leg (equal |dx| and |dy|);
 *   * the straight leg sits at the pin whose LEAD runs along it, so that pin is entered/left along its
 *     own lead -- and the source pin is preferred when neither lead matches.
 *
 * Run with: node --import tsx scripts/check-forty-five-route.ts
 */
import { fortyFiveCandidates } from "../packages/app/src/ui/canvas-panel/wire-auto-route";

const failures: string[] = [];
const EPS = 1e-9;

function check(label: string, actual: number, expected: number): void {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > EPS) {
    failures.push(`${label}: expected ${expected}, got ${actual}`);
  }
}

function shape(points: readonly { x: number; y: number }[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/** Asserts the shape guarantees hold for every candidate of a case. */
function checkShape(label: string, points: readonly { x: number; y: number }[], dx: number, dy: number): void {
  if (points.length === 2) {
    check(`${label}: exact-45 has equal |dx|/|dy|`, Math.abs(dx), Math.abs(dy));
    return;
  }
  if (points.length !== 3) {
    failures.push(`${label}: expected 2 or 3 points, got ${points.length} (${shape(points)})`);
    return;
  }
  const [a, b, c] = points;
  const leg1dx = b.x - a.x;
  const leg1dy = b.y - a.y;
  const leg2dx = c.x - b.x;
  const leg2dy = c.y - b.y;
  const leg1AxisAligned = Math.abs(leg1dx) < EPS || Math.abs(leg1dy) < EPS;
  const leg2AxisAligned = Math.abs(leg2dx) < EPS || Math.abs(leg2dy) < EPS;

  if (leg1AxisAligned === leg2AxisAligned) {
    failures.push(`${label}: exactly one leg must be straight, got ${shape(points)}`);
    return;
  }
  const straight = leg1AxisAligned ? [leg1dx, leg1dy] : [leg2dx, leg2dy];
  const diagonal = leg1AxisAligned ? [leg2dx, leg2dy] : [leg1dx, leg1dy];

  check(`${label}: straight leg length`, Math.abs(straight[0]) + Math.abs(straight[1]), Math.abs(Math.abs(dx) - Math.abs(dy)));
  check(`${label}: 45-degree leg |dx|`, Math.abs(diagonal[0]), Math.abs(diagonal[1]));
  check(`${label}: total dx`, points[points.length - 1].x - points[0].x, dx);
  check(`${label}: total dy`, points[points.length - 1].y - points[0].y, dy);
}

const s = { x: 0, y: 0 };

// --- horizontal leftover (|dx| > |dy|) --------------------------------------
const hEnd = { x: 4, y: -2 }; // |dx|=4 > |dy|=2, leftover 2 is horizontal
const hStart = fortyFiveCandidates(s, hEnd, "h", "v");
check("h-leftover candidate count", hStart.length, 2);
// The straight leg must sit at the pin whose lead is horizontal: the source.
if (shape(hStart[0].points) !== "0,0 2,0 4,-2") {
  failures.push(`h-leftover source-lead-h shape: ${shape(hStart[0].points)}`);
}
if (!hStart[0].respectsLeads) failures.push("h-leftover source-lead-h: first candidate must respect leads");
if (shape(hStart[1].points) !== "0,0 2,-2 4,-2") {
  failures.push(`h-leftover alternative shape: ${shape(hStart[1].points)}`);
}
if (hStart[1].respectsLeads) failures.push("h-leftover alternative: must not claim to respect leads");

// Only the DESTINATION lead runs along the leftover -> the stub belongs at the destination.
const hEndLead = fortyFiveCandidates(s, hEnd, "v", "h");
if (shape(hEndLead[0].points) !== "0,0 2,-2 4,-2") {
  failures.push(`h-leftover dest-lead-h shape: ${shape(hEndLead[0].points)}`);
}
if (!hEndLead[0].respectsLeads) failures.push("h-leftover dest-lead-h: first candidate must respect leads");

// --- vertical leftover (|dy| > |dx|) ----------------------------------------
const vEnd = { x: 2, y: 4 }; // |dy|=4 > |dx|=2, leftover 2 is vertical
const vStart = fortyFiveCandidates(s, vEnd, "v", "h");
if (shape(vStart[0].points) !== "0,0 0,2 2,4") {
  failures.push(`v-leftover source-lead-v shape: ${shape(vStart[0].points)}`);
}
if (!vStart[0].respectsLeads) failures.push("v-leftover source-lead-v: first candidate must respect leads");

// Neither lead matches the leftover axis -> the source pin is still placed first.
const vNeither = fortyFiveCandidates(s, vEnd, "h", "h");
if (shape(vNeither[0].points) !== "0,0 0,2 2,4") {
  failures.push(`v-leftover no-lead-match first shape: ${shape(vNeither[0].points)}`);
}
if (vNeither[0].respectsLeads || vNeither[1].respectsLeads) {
  failures.push("v-leftover no-lead-match: neither candidate may claim to respect leads");
}

// --- shape guarantees, both orientations, negative directions ---------------
for (const [dx, dy] of [
  [4, -2],
  [-4, 2],
  [4, 2],
  [2, 4],
  [-2, -4],
  [7, 1]
] as Array<[number, number]>) {
  const label = `d=${dx},${dy}`;
  const candidates = fortyFiveCandidates(s, { x: dx, y: dy }, "h", "v");
  check(`${label}: candidate count`, candidates.length, 2);
  for (const [index, candidate] of candidates.entries()) {
    checkShape(`${label}#${index}`, candidate.points, dx, dy);
  }
}

// --- already exactly 45 degrees: no leftover leg to place --------------------
const exact = fortyFiveCandidates(s, { x: 3, y: -3 }, "h", "v");
if (exact.length !== 1 || exact[0].points.length !== 2) {
  failures.push(`exact-45 should be a single 2-point candidate, got ${JSON.stringify(exact)}`);
}
if (shape(exact[0].points) !== "0,0 3,-3") {
  failures.push(`exact-45 shape: ${shape(exact[0].points)}`);
}

// --- axis-degenerate ends stay straight -------------------------------------
const degenerate = fortyFiveCandidates(s, { x: 0, y: -5 }, "v", "v");
if (degenerate.length !== 1 || shape(degenerate[0].points) !== "0,0 0,-5") {
  failures.push(`degenerate axis shape: ${JSON.stringify(degenerate.map((c) => shape(c.points)))}`);
}

if (failures.length > 0) {
  console.error("FAIL: lead-aware 45-degree route");
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}

console.log("OK: 45-degree routes keep one straight leftover leg, placed by the pin lead axis");
