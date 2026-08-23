import { afterEach, describe, expect, it, vi } from "vitest";
import {
  convertKeynoteClipboardToScopeSnippet,
  convertPowerPointClipboardToScopeSnippet
} from "../packages/app/src/ui/svg-import.js";

const toTikzFromClipboardMock = vi.hoisted(() => vi.fn<(input: string) => { tikz: string }>());
const parseClipboardGVMLMock = vi.hoisted(() => vi.fn<(input: ArrayBuffer) => Promise<{ slides: unknown[]; size: { width: number; height: number } }>>());
const convertSlideToTikZMock = vi.hoisted(() => vi.fn<(slide: unknown, size: { width: number; height: number }) => { body: string; images: unknown[] }>());

vi.mock("keynote-clipboard", () => ({
  toTikzFromClipboard: toTikzFromClipboardMock
}));

vi.mock("pptx2tikz", () => ({
  parseClipboardGVML: parseClipboardGVMLMock,
  convertSlideToTikZ: convertSlideToTikZMock
}));

vi.mock("svg2tikz", () => ({
  svgToTikz: vi.fn<(source: string) => string>()
}));

describe("svg-import keynote helper", () => {
  afterEach(() => {
    toTikzFromClipboardMock.mockReset();
    parseClipboardGVMLMock.mockReset();
    convertSlideToTikZMock.mockReset();
  });

  it("converts keynote clipboard payload to scope snippet", async () => {
    const tikz = String.raw`\begin{tikzpicture}
\draw (0,0) -- (1,1);
\end{tikzpicture}`;
    toTikzFromClipboardMock.mockReturnValue({ tikz });

    const converted = await convertKeynoteClipboardToScopeSnippet("{\"dummy\":true}");

    expect(converted.kind).toBe("success");
    if (converted.kind !== "success") {
      return;
    }
    expect(converted.tikzSource).toBe(tikz);
    expect(converted.body).toBe("\\draw (0,0) -- (1,1);");
    expect(converted.snippet).toContain("\\begin{scope}");
    expect(converted.snippet).toContain("\\draw (0,0) -- (1,1);");
    expect(converted.snippet).toContain("\\end{scope}");
  });

  it("surfaces keynote conversion errors with a keynote prefix", async () => {
    toTikzFromClipboardMock.mockImplementation(() => {
      throw new Error("bad keynote payload");
    });

    const converted = await convertKeynoteClipboardToScopeSnippet("not json");

    expect(converted).toEqual({
      kind: "failure",
      message: "Keynote import failed: bad keynote payload"
    });
  });

  it("converts PowerPoint GVML clipboard payload to scope snippet", async () => {
    const slide = { id: "slide-1" };
    const size = { width: 1024, height: 768 };
    const body = String.raw`\begin{document}
\begin{tikzpicture}
\draw (2,2) -- (3,3);
\end{tikzpicture}
\end{document}`;
    parseClipboardGVMLMock.mockResolvedValue({ slides: [slide], size });
    convertSlideToTikZMock.mockReturnValue({ body, images: [] });

    const converted = await convertPowerPointClipboardToScopeSnippet(new Uint8Array([1, 2, 3]));

    expect(converted.kind).toBe("success");
    if (converted.kind !== "success") {
      return;
    }
    expect(converted.tikzSource).toBe(body);
    expect(converted.body).toBe("\\draw (2,2) -- (3,3);");
    expect(converted.snippet).toContain("\\begin{scope}");
    expect(converted.snippet).toContain("\\draw (2,2) -- (3,3);");
    expect(converted.snippet).toContain("\\end{scope}");
    expect(convertSlideToTikZMock).toHaveBeenCalledWith(slide, size, { xcolorRgbConvert: true });
  });

  it("surfaces PowerPoint conversion errors with a powerpoint prefix", async () => {
    parseClipboardGVMLMock.mockImplementation(async () => {
      throw new Error("bad gvml payload");
    });

    const converted = await convertPowerPointClipboardToScopeSnippet(new Uint8Array([1]));

    expect(converted).toEqual({
      kind: "failure",
      message: "PowerPoint import failed: bad gvml payload"
    });
  });
});
