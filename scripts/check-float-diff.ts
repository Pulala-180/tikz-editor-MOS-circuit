import { formatNumber, PT_PER_CM, CM_PER_PT } from "../packages/core/src/edit/format.js";

// Let's test if there is any floating point value where:
// scope formatting and wire formatting produce different results.
// What if scope was formatted with fractionDigits = 2?
// Let's test 1,000,000 floats between 0.35 and 0.40:
let diffCount = 0;
for (let i = 0; i < 1000000; i++) {
  const y = 0.35 + (i / 1000000) * 0.05;
  // Way 1: scope calculation:
  // parsed y0 = 2.73
  const y0 = 2.73;
  const dy = y - y0;
  const dy_pt = dy * PT_PER_CM;
  const scope_next_pt = y0 * PT_PER_CM + dy_pt;
  const scope_val_cm = scope_next_pt * CM_PER_PT;
  const scope_str = formatNumber(scope_val_cm, { fractionDigits: 2 });

  // Way 2: wire calculation:
  // wire endpoint y was parsed as 2.73 * PT_PER_CM
  const wire_y0_pt = 2.73 * PT_PER_CM;
  const wire_next_pt = wire_y0_pt + dy_pt;
  const wire_cm = wire_next_pt / PT_PER_CM;
  const wire_str = formatNumber(wire_cm, { fractionDigits: 2 });

  if (scope_str !== wire_str) {
    console.log(`DIFF FOUND at y=${y.toFixed(8)}: scope="${scope_str}", wire="${wire_str}"`);
    diffCount++;
    if (diffCount >= 5) break;
  }
}
console.log(`Tested 1,000,000 points. Diff count: ${diffCount}`);
