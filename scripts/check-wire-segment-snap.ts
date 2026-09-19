/**
 * Verification for the wire-segment (trunk projection) snap added to the snapping pipeline.
 *
 * Run with: node --import tsx scripts/check-wire-segment-snap.ts
 *
 * The context is built with an explicit `wireSegments` override so the behaviour can be
 * asserted numerically without a browser or a TikZ parser in the loop.
 */
import { buildSnapContext, findWireSegmentAtPoint, snapToolPointer } from "../packages/core/src/edit/snapping/index";
import { worldPoint } from "../packages/core/src/coords/points";
import { pt } from "../packages/core/src/coords/scalars";

const failures: string[] = [];

function check(label: string, actual: number, expected: number, tolerance = 1e-6): void {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    failures.push(`${label}: expected ${expected}, got ${actual}`);
  }
}

// zoom is 10, so the default 20px threshold is 2 world units.
const context = buildSnapContext({
  sceneElements: [],
  selectedSourceIds: [],
  wireSegments: [
    { sourceId: "trunk", p1: worldPoint(pt(0), pt(0)), p2: worldPoint(pt(4), pt(0)) }
  ],
  zoom: 10
});

// Within threshold and mid-span: must land exactly on the trunk.
const near = snapToolPointer({ context, pointer: worldPoint(pt(3), pt(0.3)), kind: "line-end" });
check("near.x", near.snappedPoint?.x ?? NaN, 3);
check("near.y", near.snappedPoint?.y ?? NaN, 0);

// Beyond the threshold: must be left alone.
const far = snapToolPointer({ context, pointer: worldPoint(pt(3), pt(5)), kind: "line-end" });
check("far.y", far.snappedPoint?.y ?? NaN, 5);

// Past the segment end (projection parameter outside the [0.04, 0.96] span guard):
// must NOT be pulled back onto the trunk.
const offEnd = snapToolPointer({ context, pointer: worldPoint(pt(4.5), pt(0.3)), kind: "line-end" });
check("offEnd.y", offEnd.snappedPoint?.y ?? NaN, 0.3);

// Grid snapping must not mask the trunk. The trunk sits at y=0.5 (not a grid multiple) and
// the pointer is in range of BOTH a grid line and the trunk; landing on the wire is the
// more meaningful result, so the projection must win.
const gridContext = buildSnapContext({
  sceneElements: [],
  selectedSourceIds: [],
  wireSegments: [
    { sourceId: "trunk2", p1: worldPoint(pt(0), pt(0.5)), p2: worldPoint(pt(4), pt(0.5)) }
  ],
  zoom: 10,
  settings: { grid: { enabled: true } }
});
const overGrid = snapToolPointer({ context: gridContext, pointer: worldPoint(pt(3), pt(0.8)), kind: "line-end" });
check("overGrid.x", overGrid.snappedPoint?.x ?? NaN, 3);
check("overGrid.y", overGrid.snappedPoint?.y ?? NaN, 0.5);

// ---------------------------------------------------------------------------
// T-junction host detection (this is what makes the auto junction dot fire).
// The app uses a 0.1pt tolerance; mirror it here.
// ---------------------------------------------------------------------------
const TOLERANCE = 0.1;
const trunk = { sourceId: "trunk", p1: worldPoint(pt(0), pt(0)), p2: worldPoint(pt(4), pt(0)) };

function expectHost(label: string, x: number, y: number, expected: boolean): void {
  const host = findWireSegmentAtPoint(worldPoint(pt(x), pt(y)), [trunk], TOLERANCE);
  const actual = host !== null;
  if (actual !== expected) {
    failures.push(`${label}: expected host=${expected}, got ${actual}`);
  }
}

expectHost("mid-trunk is a T-junction", 3, 0, true);
expectHost("float noise on the trunk still counts", 3, 0.0001, true);
expectHost("0.3pt off the trunk is NOT a junction", 3, 0.3, false);
expectHost("a shared corner (trunk start) is NOT a junction", 0, 0, false);
expectHost("a shared corner (trunk end) is NOT a junction", 4, 0, false);
expectHost("past the trunk end is NOT a junction", 4.5, 0, false);

if (failures.length > 0) {
  console.error("FAIL: wire-segment snap");
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}

console.log("OK: wire-segment snap projects onto the trunk, and respects threshold + span limits");
