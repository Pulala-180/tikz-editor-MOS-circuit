import { describe, expect, it } from "vitest";
import { renderTikzToSvgAsync } from "../../packages/core/src/render/index.js";
import { OPEN_EXAMPLE_CATALOG } from "../../packages/app/src/ui/examples/open-example-catalog.js";

describe("open example catalog", () => {
  it("contains at least eight built-in examples", () => {
    expect(OPEN_EXAMPLE_CATALOG.length).toBeGreaterThanOrEqual(8);
  });

  it("renders each example without errors and produces SVG output", async () => {
    for (const example of OPEN_EXAMPLE_CATALOG) {
      const result = await renderTikzToSvgAsync(example.source, {
        parse: { recover: true },
        svg: { padding: 18 }
      });

      expect(result.svg.svg.length).toBeGreaterThan(0);

      const parseErrors = result.parse.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
      const semanticErrors = result.semantic.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
      const renderErrors = result.renderDiagnostics.filter((diagnostic) => diagnostic.severity === "error");

      expect(parseErrors, `${example.id}: parse errors`).toHaveLength(0);
      expect(semanticErrors, `${example.id}: semantic errors`).toHaveLength(0);
      expect(renderErrors, `${example.id}: render errors`).toHaveLength(0);
    }
  }, 30000);
});
