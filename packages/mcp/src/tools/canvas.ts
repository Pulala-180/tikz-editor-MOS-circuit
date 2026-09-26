import { z } from "zod";
import { readCanvasState, writeCanvasCode } from "../canvas-bridge.js";
import { parseTikz, evaluateTikzFigure } from "@tikz-editor/core";

export const getCanvasStateSchema = {};

export function handleGetCanvasState() {
  const state = readCanvasState();
  let diagnosticsSummary = "无语法错误";
  let componentCount = 0;

  if (state.source) {
    try {
      const parseResult = parseTikz(state.source);
      const semanticResult = evaluateTikzFigure(parseResult.figure, parseResult.source);
      const allDiagnostics = [...parseResult.diagnostics, ...semanticResult.diagnostics];
      if (allDiagnostics.length > 0) {
        diagnosticsSummary = allDiagnostics.map((d: any) => `[${d.severity || "info"}] ${d.message}`).join("\n");
      }
      componentCount = semanticResult.nodeAnchorTargets?.length || 0;
    } catch (e: any) {
      diagnosticsSummary = `AST 解析异常: ${e.message}`;
    }
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            activeFile: state.activeFilePath,
            isLiveSyncActive: state.isLive,
            componentCount,
            diagnostics: diagnosticsSummary,
            source: state.source
          },
          null,
          2
        )
      }
    ]
  };
}

export const setCanvasCodeSchema = {
  source: z.string().describe("完整的 TikZ 代码，必须包含 \\begin{tikzpicture} 和 \\end{tikzpicture}"),
  validateFirst: z.boolean().optional().describe("是否在写入前进行 AST 语法预校验，默认为 true")
};

export function handleSetCanvasCode(args: { source: string; validateFirst?: boolean }) {
  const { source, validateFirst = true } = args;

  if (validateFirst) {
    try {
      const parseResult = parseTikz(source);
      const errors = parseResult.diagnostics.filter((d: any) => d.severity === "error");
      if (errors.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ 语法校验未通过，已阻止写入画布:\n` + errors.map((e: any) => `- ${e.message}`).join("\n")
            }
          ]
        };
      }
    } catch (err: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `❌ 语法解析严重失败: ${err.message}`
          }
        ]
      };
    }
  }

  const res = writeCanvasCode(source);
  if (!res.success) {
    return {
      content: [
        {
          type: "text" as const,
          text: `❌ 写入画板失败: ${res.error}`
        }
      ]
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: `✅ 成功写入画板并触发热更新！文件: ${res.filePath}`
      }
    ]
  };
}

export const appendTikzSnippetSchema = {
  snippet: z.string().describe("要追加的 TikZ 图元或连线代码（例如 \\draw (0,0) -- (1,1);）")
};

export function handleAppendTikzSnippet(args: { snippet: string }) {
  const state = readCanvasState();
  let currentSource = state.source.trim();

  let newSource = "";
  if (!currentSource || !currentSource.includes("\\begin{tikzpicture}")) {
    newSource = `\\begin{tikzpicture}\n  ${args.snippet}\n\\end{tikzpicture}`;
  } else {
    const endIdx = currentSource.lastIndexOf("\\end{tikzpicture}");
    if (endIdx !== -1) {
      newSource =
        currentSource.slice(0, endIdx).trimEnd() +
        "\n  " +
        args.snippet.trim() +
        "\n" +
        currentSource.slice(endIdx);
    } else {
      newSource = currentSource + "\n" + args.snippet;
    }
  }

  const res = writeCanvasCode(newSource);
  return {
    content: [
      {
        type: "text" as const,
        text: res.success ? `✅ 成功追加图元代码并刷新画板！` : `❌ 追加失败: ${res.error}`
      }
    ]
  };
}
