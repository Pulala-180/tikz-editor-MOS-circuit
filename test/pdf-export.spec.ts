import { describe, expect, it } from "vitest";
import {
  createPdfExportArtifact,
  DEFAULT_PDF_EXPORT_FILE_NAME,
  normalizePdfExportFileName,
  PDF_EXPORT_MIME_TYPE
} from "../packages/core/src/export/index.js";

describe("PDF export helpers", () => {
  it("defaults to the standard export file name", () => {
    expect(normalizePdfExportFileName()).toBe(DEFAULT_PDF_EXPORT_FILE_NAME);
    expect(normalizePdfExportFileName("   ")).toBe(DEFAULT_PDF_EXPORT_FILE_NAME);
  });

  it("appends the pdf extension when omitted", () => {
    expect(normalizePdfExportFileName("diagram")).toBe("diagram.pdf");
    expect(normalizePdfExportFileName("  diagram  ")).toBe("diagram.pdf");
  });

  it("preserves an existing pdf extension", () => {
    expect(normalizePdfExportFileName("diagram.pdf")).toBe("diagram.pdf");
    expect(normalizePdfExportFileName("diagram.PDF")).toBe("diagram.PDF");
  });

  it("creates a PDF artifact with the normalized file name", () => {
    const artifact = createPdfExportArtifact({
      fileName: "preview"
    });

    expect(artifact).toEqual({
      fileName: "preview.pdf",
      mimeType: PDF_EXPORT_MIME_TYPE
    });
  });
});
