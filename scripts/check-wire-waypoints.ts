/**
 * Verification for the wire routing math (computeWireWaypoints), which had NO test coverage and was
 * flagged as an unverified assumption in the plan's appendix B -- in particular whether the
 * octagonal 45-degree route is actually symmetric.
 *
 * Run with: node --import tsx scripts/check-wire-waypoints.ts
 */
import { computeWireWaypoints } from "../packages/app/src/ui/canvas-panel/wire-routing-helper";
import { worldPoint } from "../packages/core/src/coords/points";
import { pt } from "../packages/core/src/coords/scalars";

const failures: string[] = [];
const EPS = 1e-9;

function check(label: string, actual: number, expected: number): void {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > EPS) {
    failures.push(`${label}: expected ${expected}, got ${actual}`);
  }
}

/** Flat "x,y x,y ..." rendering so a whole waypoint list can be compared in one assertion. */
function shape(points: readonly { x: number; y: number }[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

const p1 = worldPoint(pt(0), pt(0));
const p2 = worldPoint(pt(4), pt(-2)); // |dx|=4 > |dy|=2, dx>0, dy<0

// --- orthogonal -------------------------------------------------------------
const hv = computeWireWaypoints(p1, p2, "orthogonal", "HV");
check("orthogonal HV corner.x", hv[1].x, 4);
check("orthogonal HV corner.y", hv[1].y, 0);
if (shape(hv) !== "0,0 4,0 4,-2") failures.push(`orthogonal HV shape: ${shape(hv)}`);

const vh = computeWireWaypoints(p1, p2, "orthogonal", "VH");
if (shape(vh) !== "0,0 0,-2 4,-2") failures.push(`orthogonal VH shape: ${shape(vh)}`);

// --- any-angle --------------------------------------------------------------
const any = computeWireWaypoints(p1, p2, "anyAngle", "HV");
if (shape(any) !== "0,0 4,-2") failures.push(`anyAngle shape: ${shape(any)}`);

// --- octagonal 45 -----------------------------------------------------------
// |dx|=4, |dy|=2 => stub=(4-2)/2=1, corner1=(1,0), corner2=(3,-2); the middle leg is 45 degrees
// and the two stubs are equal, which is what keeps cross-coupled pairs symmetric.
const oct = computeWireWaypoints(p1, p2, "octagonal45", "HV");
if (oct.length !== 4) {
  failures.push(`octagonal45 waypoint count: expected 4, got ${oct.length}`);
} else {
  if (shape(oct) !== "0,0 1,0 3,-2 4,-2") failures.push(`octagonal45 shape: ${shape(oct)}`);
  // The 45-degree leg must have equal |dx| and |dy|.
  check("octagonal45 leg |dx|", Math.abs(oct[2].x - oct[1].x), Math.abs(oct[2].y - oct[1].y));
  // The two stubs must be equal -> the route is symmetric about the centre.
  check("octagonal45 stub head", Math.abs(oct[1].x - oct[0].x), Math.abs(oct[3].x - oct[2].x));
  check("octagonal45 stub tail", Math.abs(oct[1].y - oct[0].y), Math.abs(oct[3].y - oct[2].y));
}

// Vertical-dominant case must take the mirrored branch and stay symmetric too.
const pv = worldPoint(pt(1), pt(5));
const octV = computeWireWaypoints(worldPoint(pt(0), pt(0)), pv, "octagonal45", "HV");
if (octV.length !== 4) {
  failures.push(`octagonal45 vertical waypoint count: ${octV.length}`);
} else {
  check("octagonal45 vertical leg |dx|", Math.abs(octV[2].x - octV[1].x), Math.abs(octV[2].y - octV[1].y));
  check("octagonal45 vertical stub head", Math.abs(octV[1].y - octV[0].y), Math.abs(octV[3].y - octV[2].y));
  check("octagonal45 vertical end x", octV[3].x, 1);
  check("octagonal45 vertical end y", octV[3].y, 5);
}

if (failures.length > 0) {
  console.error("FAIL: wire waypoints");
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}

console.log("OK: routing waypoints are correct, and the 45-degree route is symmetric");
