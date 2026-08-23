import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOpenedFileForDocument } from "../packages/app/src/ui/svg-import.js";

const THIS_DIR = fileURLToPath(new URL(".", import.meta.url));

function readIpeFixture(name: string): string {
  return readFileSync(join(THIS_DIR, "fixtures/ipe", name), "utf8");
}

describe("Ipe file import", () => {
  it("converts an ipe fixture to a virtual tex document", async () => {
    const converted = await resolveOpenedFileForDocument({
      source: readIpeFixture("polygon-and-text.ipe"),
      fileRef: {
        kind: "file",
        name: "polygon-and-text.ipe"
      }
    });

    expect(converted.kind).toBe("success");
    if (converted.kind !== "success") {
      return;
    }
    expect(converted.title).toBe("polygon-and-text.tex");
    expect(converted.fileRef).toEqual({
      kind: "virtual",
      name: "polygon-and-text.tex"
    });
    expect(converted.source).toContain("\\begin{tikzpicture}");
    expect(converted.source).toContain("\\path");
    expect(converted.source).toContain("\\node");
  });

  it("rejects non-ipe sources when the caller requires ipe import", async () => {
    const converted = await resolveOpenedFileForDocument(
      {
        source: "\\begin{tikzpicture}\\end{tikzpicture}",
        fileRef: {
          kind: "file",
          name: "plain.tex"
        }
      },
      { requireIpe: true }
    );

    expect(converted).toEqual({
      kind: "failure",
      message: "Selected file is not an Ipe document."
    });
  });
});
