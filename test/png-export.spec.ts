import { describe, expect, it } from "vitest";
import {
  createPngExportArtifact,
  DEFAULT_PNG_EXPORT_FILE_NAME,
  normalizePngExportFileName,
  PNG_EXPORT_MIME_TYPE
} from "../packages/core/src/export/index.js";

describe("PNG export helpers", () => {
  it("defaults to the standard export file name", () => {
    expect(normalizePngExportFileName()).toBe(DEFAULT_PNG_EXPORT_FILE_NAME);
    expect(normalizePngExportFileName("   ")).toBe(DEFAULT_PNG_EXPORT_FILE_NAME);
  });

  it("appends the png extension when omitted", () => {
    expect(normalizePngExportFileName("diagram")).toBe("diagram.png");
    expect(normalizePngExportFileName("  diagram  ")).toBe("diagram.png");
  });

  it("preserves an existing png extension", () => {
    expect(normalizePngExportFileName("diagram.png")).toBe("diagram.png");
    expect(normalizePngExportFileName("diagram.PNG")).toBe("diagram.PNG");
  });

  it("creates a PNG artifact with the normalized file name", () => {
    const artifact = createPngExportArtifact({
      fileName: "preview"
    });

    expect(artifact).toEqual({
      fileName: "preview.png",
      mimeType: PNG_EXPORT_MIME_TYPE
    });
  });
});
