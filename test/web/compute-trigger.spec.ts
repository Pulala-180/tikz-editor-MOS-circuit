import { describe, expect, it } from "vitest";
import { computeTrigger, dragKindToComputeTrigger } from "../../packages/app/src/ui/compute-trigger";

describe("compute trigger mapping", () => {
  it("maps resize drags to drag-element incremental trigger", () => {
    expect(dragKindToComputeTrigger("resize")).toBe("drag-element");
  });

  it("maps rotate drags to drag-element incremental trigger", () => {
    expect(dragKindToComputeTrigger("rotate")).toBe("drag-element");
  });

  it("prefers drag trigger over source scrub fallback", () => {
    expect(computeTrigger("resize", "path:0")).toBe("drag-element");
    expect(computeTrigger("rotate", "path:0")).toBe("drag-element");
    expect(computeTrigger("handle", "path:0")).toBe("drag-handle");
  });

  it("uses drag-element fallback for source scrubbing", () => {
    expect(computeTrigger(null, "path:0")).toBe("drag-element");
  });
});
