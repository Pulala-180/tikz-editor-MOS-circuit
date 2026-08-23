import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOpenedPowerPointForDocument } from "../packages/app/src/ui/svg-import.js";

const THIS_DIR = fileURLToPath(new URL(".", import.meta.url));

describe("PowerPoint file import", () => {
  it("converts a pptx fixture to a virtual multi-figure tex document", async () => {
    const raw = readFileSync(join(THIS_DIR, "fixtures/presentation.pptx"));
    const bytes = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);

    const converted = await resolveOpenedPowerPointForDocument({
      bytes,
      fileRef: {
        kind: "file",
        name: "presentation.pptx"
      }
    });

    expect(converted.kind).toBe("success");
    if (converted.kind !== "success") {
      return;
    }
    expect(converted.title).toBe("presentation.tex");
    expect(converted.fileRef).toEqual({
      kind: "virtual",
      name: "presentation.tex"
    });
    expect(converted.source).toContain("\\documentclass");
    expect(converted.source).toContain("\\begin{tikzpicture}");
    expect(converted.source).not.toContain("\\includegraphics");
  });
});
