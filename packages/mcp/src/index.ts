#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  getCanvasStateSchema,
  handleGetCanvasState,
  setCanvasCodeSchema,
  handleSetCanvasCode,
  appendTikzSnippetSchema,
  handleAppendTikzSnippet
} from "./tools/canvas.js";
import {
  listComponentsSchema,
  handleListComponents,
  applyCircuitSchema,
  handleApplyCircuit
} from "./tools/circuit.js";
import {
  validateTikzSyntaxSchema,
  handleValidateTikzSyntax,
  exportCanvasImageSchema,
  handleExportCanvasImage
} from "./tools/export.js";
import {
  listSketchesSchema,
  handleListSketches,
  readSketchSchema,
  handleReadSketch,
  saveSketchSchema,
  handleSaveSketch
} from "./tools/sketch.js";
import { registerResources } from "./resources/canvas-resource.js";

const server = new McpServer({
  name: "tikz-editor",
  version: "0.5.1"
});

// Register tools
server.tool(
  "get_canvas_state",
  "读取当前 TikZ Editor 活动画板状态（源码、文件路径、组件数量及 AST 语法诊断）",
  getCanvasStateSchema,
  async () => handleGetCanvasState()
);

server.tool(
  "set_canvas_code",
  "将完整的 TikZ 源码写入活动画板并触发浏览器 160FPS 热更新",
  setCanvasCodeSchema,
  async (args) => handleSetCanvasCode(args)
);

server.tool(
  "append_tikz_snippet",
  "在当前画板追加一段 TikZ 代码（自动插入在 \\end{tikzpicture} 前）",
  appendTikzSnippetSchema,
  async (args) => handleAppendTikzSnippet(args)
);

server.tool(
  "validate_tikz_syntax",
  "离线调用 @tikz-editor/core 解析器校验 TikZ 语法并返回详细诊断信息",
  validateTikzSyntaxSchema,
  async (args) => handleValidateTikzSyntax(args)
);

server.tool(
  "export_canvas_image",
  "将 TikZ 代码导出为 SVG 矢量图或独立编译的 Standalone LaTeX 文档",
  exportCanvasImageSchema,
  async (args) => handleExportCanvasImage(args)
);

server.tool(
  "list_circuit_components",
  "获取支持的模拟电路元器件模板（MOS管/电阻/电源/地）及其引脚坐标",
  listComponentsSchema,
  async () => handleListComponents()
);

server.tool(
  "apply_circuit_layout",
  "高级电路拓扑生成器：传入元件列表与引脚连接关系，自动进行正交布线与引脚对齐并写入画板",
  applyCircuitSchema,
  async (args) => handleApplyCircuit(args)
);

server.tool(
  "list_sketches",
  "浏览草稿箱 (Sketch/) 中的历史工程文件",
  listSketchesSchema,
  async (args) => handleListSketches(args)
);

server.tool(
  "read_sketch",
  "读取指定草稿文件内容",
  readSketchSchema,
  async (args) => handleReadSketch(args)
);

server.tool(
  "save_sketch",
  "将 TikZ 源码保存为新的草稿文件",
  saveSketchSchema,
  async (args) => handleSaveSketch(args)
);

// Register resources
registerResources(server);

// Start server on stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[TikZ Editor MCP Server] Running on stdio transport");
}

main().catch((err) => {
  console.error("[TikZ Editor MCP Server] Fatal error:", err);
  process.exit(1);
});
