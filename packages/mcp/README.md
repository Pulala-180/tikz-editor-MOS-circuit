# @tikz-editor/mcp

TikZ Editor 官方原生 Model Context Protocol (MCP) 服务端。

让 **Claude Desktop**、**Cursor**、**Antigravity**、**Claude Code**、**Windsurf** 等主流 AI 助手直接与 TikZ Editor 双向无缝协同：实时读取当前画板、精准生成/修改 TikZ 图元、一键生成 MOS 模拟电路、离线语法校验与 SVG 导出。

---

## ⚡ 特性亮点

- 🚀 **纯 TypeScript 原生实现**：基于官方 `@modelcontextprotocol/sdk`，**零 Python 依赖**，只要安装了 Node.js 即可运行！
- 🔄 **毫秒级热同步**：外部 AI 工具调用更新代码时，浏览器端 TikZ 画布以 160+ FPS 实时重绘渲染。
- 🔍 **离线 AST 语法预检**：直接复用 `@tikz-editor/core`，任何代码在注入画板前都会进行语法诊断，杜绝脏代码破坏画板。
- ⚡ **模拟电路高级拓扑**：内置 MOS 管（nMOS/pMOS）、电阻、独立/受控源及接地引脚的纳米级几何计算与正交连线（Orthogonal Routing）。
- 🎨 **SVG / Standalone 导出**：可直接将画板内容导出为 SVG 矢量图供 AI 进行视觉自检，或导出为独立可编译的 LaTeX 模板。

---

## 🛠️ 工具清单 (Tools)

| 工具名称 | 功能描述 | 核心参数 |
| :--- | :--- | :--- |
| `get_canvas_state` | 读取当前活动画板的 TikZ 完整源码、组件数量及 AST 诊断信息 | 无 |
| `set_canvas_code` | 将完整的 TikZ 源码写入画板并触发即时热更新 | `source` (代码), `validateFirst` (语法预检) |
| `append_tikz_snippet` | 在当前画板追加一段 TikZ 代码（自动插入在 `\end{tikzpicture}` 前） | `snippet` (追加的图元代码) |
| `validate_tikz_syntax` | 调用核心解析器校验代码语法，返回诊断信息与错误位置 | `source` (可选，默认校验当前画板) |
| `export_canvas_image` | 导出为 SVG 矢量图或独立编译的 Standalone LaTeX 文档 | `format`: `"svg"` 或 `"standalone_latex"` |
| `list_circuit_components` | 列出所有支持的模拟电路器件模板及其引脚定义与局部坐标 | 无 |
| `apply_circuit_layout` | 电路拓扑生成器：传入组件列表与导线连接关系，自动排版对齐引脚 | `components`, `wires`, `junctionDots` |
| `list_sketches` | 浏览草稿箱 (`Sketch/`) 中的所有历史工程文件 | `subDir` (可选) |
| `read_sketch` | 读取指定草稿文件的内容 | `fileName` (草稿文件名) |
| `save_sketch` | 将代码另存为新草稿文件（可自动设为当前活动画板） | `fileName`, `source`, `setAsActive` |

---

## 📖 接入与配置指引

### 1. Claude Desktop 配置

打开 Claude Desktop 配置文件（Windows 路径：`%APPDATA%\Claude\claude_desktop_config.json`），在 `mcpServers` 中添加：

```json
{
  "mcpServers": {
    "tikz-editor": {
      "command": "node",
      "args": [
        "E:/tikz-editor-master/tikz-editor-master/packages/mcp/dist/index.js"
      ]
    }
  }
}
```

### 2. Cursor 配置

在 Cursor 的项目根目录创建或编辑 `.cursor/mcp.json`（或在 Cursor 设置 -> Features -> MCP 中添加）：

```json
{
  "mcpServers": {
    "tikz-editor": {
      "command": "node",
      "args": [
        "E:/tikz-editor-master/tikz-editor-master/packages/mcp/dist/index.js"
      ]
    }
  }
}
```

### 3. Claude Code / Antigravity CLI 配置

使用命令行直接一键注册：

```bash
claude mcp add tikz-editor -- node E:/tikz-editor-master/tikz-editor-master/packages/mcp/dist/index.js
```

---

## 💻 命令行直接测试

在项目根目录下编译并测试：

```bash
# 编译 MCP
npm run build:mcp

# 运行自动化测试套件
node packages/mcp/test-mcp.mjs
```
