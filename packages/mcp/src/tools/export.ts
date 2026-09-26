import { z } from "zod";
import { readCanvasState } from "../canvas-bridge.js";
import {
  parseTikz,
  evaluateTikzFigure,
  renderTikzToSvg,
  createStandaloneLatexExportArtifact
} from "@tikz-editor/core";

export const validateTikzSyntaxSchema = {
  source: z.string().optional().describe("要校验的 TikZ 源码。若省略则自动校验当前画板内容")
};

export function handleValidateTikzSyntax(args: { source?: string }) {
  const code = args.source || readCanvasState().source;
  if (!code) {
    return {
      content: [
        {
          type: "text" as const,
          text: "⚠️ 画布为空，未提供代码进行校验"
        }
      ]
    };
  }

  try {
    const parseResult = parseTikz(code);
    const semanticResult = evaluateTikzFigure(parseResult.figure, parseResult.source);

    const diagnostics = [
      ...parseResult.diagnostics.map((d: any) => ({
        stage: "parse",
        severity: d.severity,
        message: d.message,
        line: d.line
      })),
      ...semanticResult.diagnostics.map((d: any) => ({
        stage: "semantic",
        severity: d.severity,
        message: d.message,
        line: d.line
      }))
    ];

    const errors = diagnostics.filter((d) => d.severity === "error");
    const warnings = diagnostics.filter((d) => d.severity === "warning");

    const summary = {
      valid: errors.length === 0,
      totalErrors: errors.length,
      totalWarnings: warnings.length,
      diagnostics
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(summary, null, 2)
        }
      ]
    };
  } catch (e: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `❌ 语法校验发生异常: ${e.message}`
        }
      ]
    };
  }
}

export const exportCanvasImageSchema = {
  format: z.enum(["svg", "standalone_latex"]).default("svg").describe("导出格式：svg (矢量图源码) 或 standalone_latex (独立可编译 LaTeX 模板)"),
  source: z.string().optional().describe("要导出的源码（可选，默认使用当前画板内容）")
};

export function handleExportCanvasImage(args: { format?: "svg" | "standalone_latex"; source?: string }) {
  const code = args.source || readCanvasState().source;
  if (!code) {
    return {
      content: [
        {
          type: "text" as const,
          text: "⚠️ 画布为空，无法导出"
        }
      ]
    };
  }

  const format = args.format || "svg";

  if (format === "standalone_latex") {
    try {
      const artifact = createStandaloneLatexExportArtifact({ source: code, activeFigureId: null });
      return {
        content: [
          {
            type: "text" as const,
            text: artifact.text
          }
        ]
      };
    } catch (e: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `❌ 导出 Standalone LaTeX 失败: ${e.message}`
          }
        ]
      };
    }
  }

  // format === 'svg'
  try {
    const res = renderTikzToSvg(code);
    return {
      content: [
        {
          type: "text" as const,
          text: res.svg.svg
        }
      ]
    };
  } catch (e: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `❌ 渲染 SVG 失败: ${e.message}`
        }
      ]
    };
  }
}
