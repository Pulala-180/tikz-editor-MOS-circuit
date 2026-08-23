import { describe, expect, it } from "vitest";

import {
  createSemanticSymbolResolver,
  defineSemanticSymbol,
  exportSemanticSymbolResolverState,
  importSemanticSymbolResolverState,
  popSemanticSymbolScope,
  pushSemanticSymbolScope,
  requireSemanticLibrary,
  resolveSemanticSymbol
} from "../../packages/core/src/semantic/symbol-resolver.js";

describe("semantic symbol resolver", () => {
  it("normalizes, scopes, and restores symbol dependencies", () => {
    const resolver = createSemanticSymbolResolver();

    defineSemanticSymbol(resolver, definition("style", " box ", "style-root"));
    defineSemanticSymbol(resolver, definition("key", "rounded corners", "key-root"));
    defineSemanticSymbol(resolver, definition("library", " Calc ", "library-root"));
    defineSemanticSymbol(resolver, definition("macro", "   ", "blank"));

    expect(resolveSemanticSymbol(resolver, "style", "box", "consumer-a")).toMatchObject({
      kind: "style",
      name: "box",
      statementId: "style-root"
    });
    expect(resolveSemanticSymbol(resolver, "key", "rounded corners", null)).toMatchObject({
      kind: "key",
      statementId: "key-root"
    });
    expect(resolveSemanticSymbol(resolver, "library", "calc", "consumer-lib")).toMatchObject({
      kind: "library",
      name: "calc",
      statementId: "library-root"
    });
    expect(resolveSemanticSymbol(resolver, "macro", "   ", "consumer-blank")).toBeNull();

    pushSemanticSymbolScope(resolver);
    defineSemanticSymbol(resolver, definition("style", "box", "style-child"));
    expect(resolveSemanticSymbol(resolver, "style", "box", "consumer-b")?.statementId).toBe("style-child");
    popSemanticSymbolScope(resolver);
    popSemanticSymbolScope(resolver);
    expect(resolveSemanticSymbol(resolver, "style", "box", "consumer-c")?.statementId).toBe("style-root");

    expect(resolveSemanticSymbol(resolver, "color", "missing", "consumer-missing")).toBeNull();
    requireSemanticLibrary(resolver, " Arrows.Meta ", "consumer-required");
    requireSemanticLibrary(resolver, "   ", "consumer-ignored");

    const state = exportSemanticSymbolResolverState(resolver);
    expect(state.requiredLibraries).toEqual(["arrows.meta"]);
    expect(state.dependencyEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({ consumerStatementId: "consumer-a", providerStatementId: "style-root" }),
      expect.objectContaining({ consumerStatementId: "consumer-lib", providerStatementId: "library-root" })
    ]));
    expect(state.unresolvedSymbols).toEqual([
      { consumerStatementId: "consumer-missing", kind: "color", name: "missing" },
      { consumerStatementId: "consumer-required", kind: "library", name: "arrows.meta" }
    ]);

    const imported = createSemanticSymbolResolver();
    importSemanticSymbolResolverState(imported, state);
    expect(resolveSemanticSymbol(imported, "style", "box", null)?.statementId).toBe("style-root");
    expect(exportSemanticSymbolResolverState(imported)).toEqual(state);
  });

  it("recovers an empty imported scope stack and ignores definitions without a top scope", () => {
    const resolver = createSemanticSymbolResolver();
    resolver.scopes = [];

    defineSemanticSymbol(resolver, definition("color", "accent", "color-a"));
    expect(resolveSemanticSymbol(resolver, "color", "accent", "consumer-a")).toBeNull();

    importSemanticSymbolResolverState(resolver, {
      scopes: [],
      dependencyEdges: [],
      unresolvedSymbols: [],
      requiredLibraries: ["calc"]
    });
    expect(resolver.scopes).toHaveLength(1);

    defineSemanticSymbol(resolver, definition("color", "accent", "color-b"));
    expect(resolveSemanticSymbol(resolver, "color", "accent", "consumer-b")).toMatchObject({
      kind: "color",
      statementId: "color-b"
    });
  });
});

function definition(
  kind: "macro" | "color" | "style" | "key" | "library",
  name: string,
  statementId: string
) {
  return {
    kind,
    name,
    statementId,
    span: { from: 0, to: name.length }
  };
}
