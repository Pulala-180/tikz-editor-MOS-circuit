import { describe, expect, it } from "vitest";

import type { EmitSvgResult } from "../packages/core/src/svg/types.js";
import { applyPreviewEnhancements } from "../packages/app/src/ui/assistant-tool-handlers.js";
import { serializeSvgForExport } from "../packages/app/src/ui/export-commands.js";

function makeSvgResult(): EmitSvgResult {
  return {
    svg: '<svg viewBox="0 0 100 100" role="img" aria-label="TikZ SVG preview"><path d="M 0 0 L 100 100" /></svg>',
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    model: {
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
      defs: [],
      defsFingerprint: "",
      parts: [
        {
          partId: "path:0",
          sourceId: "path:0",
          elementId: null,
          order: 0,
          markup: '<path d="M 0 0 L 100 100" />',
          fingerprint: '<path d="M 0 0 L 100 100" />'
        }
      ],
      diagnostics: []
    },
    diagnostics: []
  };
}

describe("assistant preview enhancements", () => {
  it("keeps assistant grid markup in serialized export output", async () => {
    const enhanced = applyPreviewEnhancements(makeSvgResult(), {
      showGrid: { spacing: 1 }
    });

    expect(enhanced.model.parts.some((part) => part.partId.startsWith("assistant-grid"))).toBe(true);

    const serialized = await serializeSvgForExport(enhanced);
    expect(serialized).toContain('class="assistant-grid"');
  });

  it("propagates zoomed viewBox into SVG model serialization", async () => {
    const enhanced = applyPreviewEnhancements(makeSvgResult(), {
      zoomRegion: {
        min_x: 0,
        min_y: 0,
        max_x: 1,
        max_y: 1
      }
    });

    const serialized = await serializeSvgForExport(enhanced);
    expect(serialized).toContain(`viewBox="${enhanced.viewBox.x}`);
    expect(enhanced.model.viewBox).toEqual(enhanced.viewBox);
  });
});
