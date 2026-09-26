import { planWireRoute, leadAxisAt } from "../packages/app/src/ui/canvas-panel/wire-auto-route";
import { formatTikzWireSnippet } from "../packages/app/src/ui/canvas-panel/wire-routing-helper";
import { worldPoint, pt } from "tikz-editor/coords/index";

const failures: string[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures.push(message);
    console.error("FAIL:", message);
  }
}

console.log("Running Virtuoso wire route checks...");

const viewBox = { y: 0, height: 600 };

// Scenario 1: M5.s (top left) to M1.d (bottom right)
// M5 is shifted (0, 3) cm -> M5.s is at (0.73, 2.5) cm -> in pt: (20.77, 71.13)
// M1 is shifted (3, 0) cm -> M1.d is at (3.73, 0.5) cm -> in pt: (106.13, 14.23)
const startM5 = worldPoint(pt(0.73 * 28.4527559), pt(2.5 * 28.4527559));
const endM1 = worldPoint(pt(3.73 * 28.4527559), pt(0.5 * 28.4527559));

// Mock leads: M5.s has vertical lead, M1.d has vertical lead
const m5Lead = {
  p1: { x: 0.73 * 28.4527559, y: 2.79 * 28.4527559 },
  p2: { x: 0.73 * 28.4527559, y: 2.5 * 28.4527559 }
};
const m1Lead = {
  p1: { x: 3.73 * 28.4527559, y: 0.2 * 28.4527559 },
  p2: { x: 3.73 * 28.4527559, y: 0.5 * 28.4527559 }
};

const leads = [m5Lead, m1Lead];
const startLeadAxis = leadAxisAt(startM5, leads);
const endLeadAxis = leadAxisAt(endM1, leads);

assert(startLeadAxis === "v", `Expected startLeadAxis 'v', got '${startLeadAxis}'`);
assert(endLeadAxis === "v", `Expected endLeadAxis 'v', got '${endLeadAxis}'`);

// Default auto route
const route = planWireRoute({
  start: startM5,
  end: endM1,
  viewBox,
  mode: "orthogonal",
  startLeadAxis,
  endLeadAxis,
  obstacles: [],
  existingSegments: []
});

console.log("Route points:", route.map((p) => ({ x: (p.x / 28.4527559).toFixed(2), y: (p.y / 28.4527559).toFixed(2) })));

// Test 1: The route must have AT MOST 3 points (1 corner) or 4 points (symmetrical Z), never 5 points
assert(route.length <= 4, `Route has too many points: ${route.length}`);

// Test 2: The route MUST NOT leave M5.s horizontally!
// Since M5.s is a vertical downward lead, the first leg must be vertical (dx close to 0)
const firstLegDx = Math.abs(route[1].x - route[0].x);
assert(firstLegDx < 1e-3, `Route left vertical pin horizontally! firstLegDx = ${firstLegDx}`);

// Test 3: Snippet format
const snippet = formatTikzWireSnippet(route, {
  fromAnchor: { nodeName: "node_M5", anchor: "s" },
  toAnchor: { nodeName: "node_M1", anchor: "d" }
});
console.log("Generated snippet:\n", snippet);
assert(snippet.includes("(node_M5.s) |- (node_M1.d)") || snippet.includes("--"), "Snippet is invalid");

// Test 4: Explicit orientation override (HV vs VH)
const routeHV = planWireRoute({
  start: startM5,
  end: endM1,
  viewBox,
  mode: "orthogonal",
  orientation: "HV",
  startLeadAxis,
  endLeadAxis,
  obstacles: [],
  existingSegments: []
});
// HV means start.y is kept in the first leg (horizontal)
assert(Math.abs(routeHV[1].y - routeHV[0].y) < 1e-3, "routeHV did not follow horizontal first");

const routeVH = planWireRoute({
  start: startM5,
  end: endM1,
  viewBox,
  mode: "orthogonal",
  orientation: "VH",
  startLeadAxis,
  endLeadAxis,
  obstacles: [],
  existingSegments: []
});
// VH means start.x is kept in the first leg (vertical)
assert(Math.abs(routeVH[1].x - routeVH[0].x) < 1e-3, "routeVH did not follow vertical first");

if (failures.length === 0) {
  console.log("SUCCESS: All Virtuoso wire route checks passed!");
  process.exit(0);
} else {
  console.error(`FAILED: ${failures.length} check(s) failed.`);
  process.exit(1);
}
