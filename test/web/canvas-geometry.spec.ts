import { describe, expect, it } from "vitest";
import { pickGridStepPt } from "../../packages/core/src/edit/snapping/grid-snaps.js";
import { GRID_MINOR_TARGET_PX } from "../../packages/core/src/edit/snapping/types.js";
import { resolveOverlayGridSteps } from "../../packages/app/src/ui/canvas-panel/geometry.js";

describe("canvas overlay grid/ruler steps", () => {
  it("keeps overlay minor steps aligned with snapping grid steps across zoom levels", () => {
    const scales = [0.35, 0.75, 1, 1.5, 2, 3.5, 8];

    for (const scale of scales) {
      const overlay = resolveOverlayGridSteps(scale);
      const snapMinor = pickGridStepPt(scale, GRID_MINOR_TARGET_PX);

      expect(overlay.minorStep).toBeCloseTo(snapMinor, 9);
      expect(overlay.majorStep).toBeCloseTo(snapMinor * 5, 9);
    }
  });
});
