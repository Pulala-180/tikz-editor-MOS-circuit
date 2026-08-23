import { describe, expect, it } from "vitest";
import type { SyntaxNode } from "@lezer/common";

import { collectParseErrorDiagnostics, collectStructuralDiagnostics } from "../packages/core/src/diagnostics/collect.js";
import type { Diagnostic } from "../packages/core/src/diagnostics/types.js";

type TestNode = SyntaxNode & {
  firstChild: TestNode | null;
  nextSibling: TestNode | null;
  parent: TestNode | null;
};

function testNode(
  name: string,
  from: number,
  to: number,
  children: TestNode[] = [],
  options: { isError?: boolean; isAnonymous?: boolean } = {}
): TestNode {
  const node = {
    type: {
      name,
      isError: options.isError ?? false,
      isAnonymous: options.isAnonymous ?? false
    },
    from,
    to,
    firstChild: children[0] ?? null,
    nextSibling: null,
    parent: null
  } as TestNode;
  for (let index = 0; index < children.length; index += 1) {
    children[index].parent = node;
    children[index].nextSibling = children[index + 1] ?? null;
  }
  return node;
}

describe("diagnostic collection", () => {
  it("describes parse errors from recovered tree context", () => {
    const source = "\\draw bad; ;";
    const drawCommand = testNode("DrawCmd", 0, 5);
    const pathCommand = testNode("PathCommand", 0, 5, [drawCommand]);
    const pathError = testNode("⚠", 6, 9, [], { isError: true });
    const path = testNode("PathStatement", 0, 10, [pathCommand, pathError]);
    const straySemicolon = testNode("⚠", 11, 12, [], { isError: true });
    const bodyItem = testNode("BodyItem", 11, 12, [straySemicolon]);
    const root = testNode("TikzFile", 0, source.length, [path, bodyItem]);
    const diagnostics: Diagnostic[] = [];

    collectParseErrorDiagnostics(root, source, diagnostics);

    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "Syntax error in \\draw statement. Check for a missing semicolon or malformed path.",
      "Unexpected semicolon. Check for a missing command before this point."
    ]);
  });

  it("deduplicates parse errors by span and reports embedded path commands", () => {
    const source = "\\path \\draw";
    const duplicated = testNode("⚠", 0, 5, [], { isError: true });
    const sameSpan = testNode("⚠", 0, 5, [], { isError: true });
    const drawCommand = testNode("DrawCmd", 6, 11);
    const knownCommand = testNode("KnownCommand", 6, 11, [drawCommand]);
    const unknownPathItem = testNode("UnknownPathItem", 6, 11, [knownCommand]);
    const path = testNode("PathStatement", 0, source.length, [duplicated, sameSpan, unknownPathItem]);
    const diagnostics: Diagnostic[] = [];

    collectParseErrorDiagnostics(path, source, diagnostics);
    collectStructuralDiagnostics(path, source, diagnostics);

    expect(diagnostics.filter((diagnostic) => diagnostic.code === "parse-error")).toHaveLength(1);
    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: "missing-semicolon",
      message: "\\draw starts before the previous statement ended; add a semicolon before \\draw."
    }));
  });
});
