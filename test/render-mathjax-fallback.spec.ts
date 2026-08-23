import { afterEach, describe, expect, it, vi } from "vitest";

const source = String.raw`\begin{tikzpicture}
  \node at (0,0) {$x^2$};
\end{tikzpicture}`;

async function importRenderWithMathJaxFailure(error: unknown) {
  const createMathJaxNodeTextEngine = vi.fn(async () => {
    throw error;
  });

  vi.doMock("../packages/core/src/text/mathjax-engine.js", () => ({
    createMathJaxNodeTextEngine
  }));

  const renderModule = await import("../packages/core/src/render/index.js");
  return { createMathJaxNodeTextEngine, renderTikzToSvgAsync: renderModule.renderTikzToSvgAsync };
}

describe("render MathJax fallback", () => {
  afterEach(() => {
    const target = globalThis as { window?: unknown; document?: unknown };
    delete target.window;
    delete target.document;
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("../packages/core/src/text/mathjax-engine.js");
  });

  it("reports MathJax initialization failures once and memoizes node-runtime fallback", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { createMathJaxNodeTextEngine, renderTikzToSvgAsync } = await importRenderWithMathJaxFailure(
      new Error("synthetic init failure")
    );

    const first = await renderTikzToSvgAsync(source);
    const second = await renderTikzToSvgAsync(source);

    expect(createMathJaxNodeTextEngine).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(first.renderDiagnostics).toEqual([
      {
        code: "mathjax-engine-unavailable",
        message:
          "MathJax text engine initialization failed; falling back to plain SVG text rendering. (synthetic init failure)",
        severity: "warning"
      }
    ]);
    expect(second.renderDiagnostics).toEqual(first.renderDiagnostics);
    expect(first.svg.svg).toContain("<text");
    expect(first.svg.svg).not.toContain('data-text-renderer="mathjax"');
  });

  it("uses a generic warning when MathJax fails without detail", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { renderTikzToSvgAsync } = await importRenderWithMathJaxFailure("");

    const result = await renderTikzToSvgAsync(source);

    expect(result.renderDiagnostics).toEqual([
      {
        code: "mathjax-engine-unavailable",
        message: "MathJax text engine initialization failed; falling back to plain SVG text rendering.",
        severity: "warning"
      }
    ]);
  });

  it("retries MathJax initialization in browser-like runtimes", async () => {
    const target = globalThis as { window?: unknown; document?: unknown };
    target.window = {};
    target.document = {};
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { createMathJaxNodeTextEngine, renderTikzToSvgAsync } = await importRenderWithMathJaxFailure(
      new Error("transient browser failure")
    );

    await renderTikzToSvgAsync(source);
    await renderTikzToSvgAsync(source);

    expect(createMathJaxNodeTextEngine).toHaveBeenCalledTimes(2);
  });
});
