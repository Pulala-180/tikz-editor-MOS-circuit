import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

type ExtractDocsModule = {
  anchorIdToKeyNames: (anchorId: string) => string[];
  encodeHashAnchor: (anchor: string) => string;
  extractEntriesFromHtml: (
    page: string,
    html: string
  ) => Record<
    string,
    {
      type: "key" | "command" | "style";
      signatureHtml: string;
      defaultHtml: string;
      snippetHtml: string;
      page: string;
      anchor: string;
      href: string;
    }
  >;
};

let extractDocs: ExtractDocsModule;

beforeAll(async () => {
  // @ts-expect-error script module has no static TypeScript declarations
  extractDocs = (await import("../scripts/extract-docs.mjs")) as ExtractDocsModule;
});

describe("extract-docs script", () => {
  it("maps special operator anchors", () => {
    expect(extractDocs.anchorIdToKeyNames("pgf.-bar/")).toEqual(["-|"]);
    expect(extractDocs.anchorIdToKeyNames("pgf.bar/-")).toEqual(["|-"]);
    expect(extractDocs.anchorIdToKeyNames("pgf...")).toEqual([".."]);
    expect(extractDocs.anchorIdToKeyNames("pgf.--")).toEqual(["--"]);
  });

  it("extracts signature/default/snippet html from tikz-paths", () => {
    const htmlPath = join(process.cwd(), "tikz-dev", "tikz-paths.html");
    if (!existsSync(htmlPath)) {
      return;
    }
    const html = readFileSync(htmlPath, "utf8");
    const entries = extractDocs.extractEntriesFromHtml("tikz-paths", html);

    const pathEntry = entries[String.raw`\path`];
    expect(pathEntry).toBeDefined();
    expect(pathEntry.type).toBe("command");
    expect(pathEntry.signatureHtml).toContain("<kbd>");
    expect(pathEntry.snippetHtml).toContain("<p>");

    const lineTo = entries["--"];
    expect(lineTo).toBeDefined();
    expect(lineTo.snippetHtml).toContain("line-to operation");

    const everyPath = entries["/tikz/every path"];
    expect(everyPath).toBeDefined();
    expect(everyPath.type).toBe("style");
    expect(everyPath.defaultHtml.toLowerCase()).toContain("style");
  });

  it("preserves verbatim spans as code in snippets", () => {
    const htmlPath = join(process.cwd(), "tikz-dev", "tikz-shapes.html");
    if (!existsSync(htmlPath)) {
      return;
    }
    const html = readFileSync(htmlPath, "utf8");
    const entries = extractDocs.extractEntriesFromHtml("tikz-shapes", html);

    const nodeCommand = entries[String.raw`\node`];
    expect(nodeCommand).toBeDefined();
    expect(nodeCommand.snippetHtml).toContain("<code>{tikzpicture}</code>");
    expect(nodeCommand.snippetHtml).toContain("<code>\\path node</code>");
  });

  it("builds hash-safe anchor links", () => {
    expect(extractDocs.encodeHashAnchor("pgf.line:width")).toBe("pgf.line%3Awidth");
    expect(extractDocs.encodeHashAnchor("pgf./tikz/line:width")).toBe("pgf./tikz/line%3Awidth");
  });
});
