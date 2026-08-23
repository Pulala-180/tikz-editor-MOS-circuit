import { describe, expect, it } from "vitest";
import {
  createSvgExportArtifact,
  DEFAULT_SVG_EXPORT_FILE_NAME,
  normalizeSvgExportFileName,
  SVG_EXPORT_MIME_TYPE
} from "../packages/core/src/export/index.js";

describe("svg export module", () => {
  it("uses the default filename when none is provided", () => {
    expect(normalizeSvgExportFileName()).toBe(DEFAULT_SVG_EXPORT_FILE_NAME);
    expect(normalizeSvgExportFileName("   ")).toBe(DEFAULT_SVG_EXPORT_FILE_NAME);
  });

  it("adds .svg extension when missing", () => {
    expect(normalizeSvgExportFileName("diagram")).toBe("diagram.svg");
    expect(normalizeSvgExportFileName("  diagram  ")).toBe("diagram.svg");
  });

  it("keeps existing .svg extension case-insensitively", () => {
    expect(normalizeSvgExportFileName("diagram.svg")).toBe("diagram.svg");
    expect(normalizeSvgExportFileName("diagram.SVG")).toBe("diagram.SVG");
  });

  it("builds export artifacts with stable mime type and text passthrough", () => {
    const svg = `<svg viewBox="0 0 1 1"><path d="M0 0L1 1"/></svg>`;
    const artifact = createSvgExportArtifact({
      svg,
      fileName: "figure"
    });

    expect(artifact.fileName).toBe("figure.svg");
    expect(artifact.mimeType).toBe(SVG_EXPORT_MIME_TYPE);
    expect(artifact.text).toBe(svg);
  });
});
