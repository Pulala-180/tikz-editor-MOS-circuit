# TikZ Editor（MOS 电路与高性能定制版）

> 💡 **上游致谢**：本项目基于 Dominik Peters 的开源项目 [**tikz-editor**](https://github.com/DominikPeters/tikz-editor) 进行了深度重构、性能动力学优化与电路专业化适配。
>
> 📄 **新手必读·图文完整教程 PDF**：👉 [**《TikZ Editor 电路绘制简易教程与使用指南.pdf》**](./TikZ%20Editor%20电路绘制简易教程与使用指南.pdf)（包含简易绘制全流程、技巧与自定义元件指引）

TikZ Editor 是一款直观、高性能的可视化 TikZ 编辑器，专为**电子原理图（尤其是 MOS 模拟/数字集成电路）**及通用科技论文插图量身定制。具备实时双向 AST 同步、160+ FPS 瞬态 DOM 动力学渲染、弹性导线拓扑跟随、单轴约束导线拉伸、Sketch 草稿文件管理系统以及引脚纳米级精准磁吸等核心特性。

---

## 📚 教程与开发文档导航 (Documentation Index)

| 文档名称 | 形式 | 核心内容 |
| :--- | :---: | :--- |
| 📄 [**TikZ Editor 电路绘制简易教程与使用指南.pdf**](./TikZ%20Editor%20电路绘制简易教程与使用指南.pdf) | **PDF 图文指南** | **从零开始的电路绘制图文全流程、快捷键使用、极速拖拽微调技巧与 MOS 核心器件绘制实战** |
| 🔌 [**MCP 官方服务端接入与配置指引**](./packages/mcp/README.md) | **Markdown 指南** | **Claude Desktop / Cursor / Antigravity 原生 MCP 接入、10 大绘图与电路工具使用说明** |
| 📖 [**元器件扩展开发与引脚节点标准指南 (SOP)**](./docs/COMPONENT_DEVELOPMENT_GUIDE.md) | **Markdown 规范** | **自定义新元件、引脚命名军规、快捷键分配与 6 步接入流水线 CheckList** |
| 🔤 [**TikZ Arial 字体配置与独立编译方案**](#-tikz-arial-字体配置与编译方案-typography--standalone-workflow) | **Markdown 规范** | **工业级 Arial 粗斜体公式排版、XeLaTeX 引擎配置、独立单文件编译与高清导出** |
| 🤖 [**AI Agent 协同与系统指令**](./AGENTS.md) | **Markdown 指令** | **AI 助手（Cursor / Claude / Copilot）自动化开发与热重载规范** |

---

## ⚡ 极速上手：小白 / 群友一键启动（双击即用）

> 💡 **如果您是新手或直接下载了源码压缩包**：
> 1. 确保电脑已安装 **[Node.js](https://nodejs.org/)** (>= 18.0.0)。
> 2. **Windows 用户**：直接双击项目根目录下的 **`一键启动.bat`**（或 `start.bat`）。
> 3. 脚本将**全自动安装依赖包、启动服务器并在浏览器自动弹出打开** [http://localhost:8888](http://localhost:8888)！
> 4. ⌨️ **全局快捷召唤（Win+R）**：首次双击运行后，脚本会自动为您注册全局快捷指令。以后在电脑任何界面按下 **`Win + R`**，输入 **`tikz circuit`**（或 **`tikz`**）敲回车，即可瞬间秒级打开电路编辑器！

> ⚠️ **关于 `localhost` 的特别说明**：
> `localhost` 代表的是您自己的本机电脑。如果您将 `http://localhost:8888` 链接直接发给群友，群友电脑上由于没有运行本程序是打不开的。如需分享给其他人使用，请让群友下载本仓库并双击 `一键启动.bat`，或者在同一局域网下分享您的局域网 IP（启动黑框中显示的 Network 地址）。

---

## 🤖 AI Agent 协同与 MCP 服务 (AI Assistant Guide)

如果您使用 **Claude Desktop / Cursor / Claude Code / Antigravity / Windsurf** 等 AI 助手：
- **原生 MCP 支持**：运行 `npm run mcp`，或直接在 Claude Desktop / Cursor 配置文件中挂载 `packages/mcp/dist/index.js`（详见 [`packages/mcp/README.md`](./packages/mcp/README.md)）。
- **AI 随时感知与操控画板**：AI 具备 10 个专属工具与资源（读取源码、一键排版电路、语法校验、SVG导出、草稿箱管理）。
- **启动网页开发服务**：`npm run dev`（内置 Vite `open: true`，启动后自动拉起浏览器）。
- **双向实时同步**：MCP 或外部 Agent 写入 `Sketch/active-drawing/active-drawing.tex` 时，浏览器画布会自动触发 160+ FPS 极速热重载。

---

## 🚀 核心适配性设计与深度优化（全景复盘）

### 1. ⚡ 瞬态 DOM 极速拖拽引擎（160+ FPS）
- **针对优化**：解决复杂电路上拖拽移动时因全量 AST 解析引发的掉帧卡顿，大幅提升高刷帧率体验。
- **核心实现**：设计了直连 DOM Transform 的瞬态交互层（借鉴 Visio 与 Draw.io 顶级架构）。在鼠标拖拽过程中完全绕过高开销的解析管道，实现 **160+ FPS 极限丝滑拖拽**；仅在松开鼠标时原子化提交单一 AST 事务。
- 💡 **极致丝滑拖拽秘籍**：微调电路时，在画布空白处右键单击并**关闭所有的 Snap**（如取消勾选 `Snap to Grid`、`Snap to Guides`、`Snap to Object Points`，或在拖拽时按住 `Ctrl`/`Cmd` 临时绕过吸附），即可畅享无拘无束、像素级精准的极致丝滑体验！而在连线接线时重新开启，即可获得完美的引脚磁吸锁定。

### 2. 🔗 实时高刷新弹性导线跟随系统（120 FPS）
- **针对优化**：实现元件与连接导线之间的智能动力学联动，移动元件时自动保持电路拓扑完整。
- **核心实现**：构建了智能拓扑导线追踪引擎 (`wire-follow.ts`)。移动任何元件时，相连导线在 120 FPS 瞬态下**实时弹性拉伸、平移和折叠**，元件移动到哪，导线就粘到哪，电路拓扑永不破损。
- ⚠️ **重要使用注意事项**：实现元件拖拽时的**连线动态伸缩跟随功能**的前提是——**连线的端点必须准确连接到元件的引脚节点（Object Points / 引脚锚点）上**。建议在布线时保持开启 `Snap to Object Points`，确保导线端点与管子引脚产生严格物理咬合（出现 $\otimes$ 标志），只要节点建立咬合连接，移动元件时导线就会自动弹性伸缩与跟随！

### 3. 🎯 严格单轴锁定与最小安全长度约束
- **针对优化**：解决自由拉伸导线端点时容易拖歪、偏轴以及元件反向穿透导致导线塌缩报错的问题。
- **核心实现**：
  - **单轴约束 (Axis Constraint)**：水平导线端点拖拽时严格锁定 $Y$ 轴坐标，仅允许水平拉长/缩短；竖直导线严格锁定 $X$ 轴坐标，仅允许竖直拉长/缩短；
  - **最小安全距离保护**：设定 $0.1\,\text{cm}$ 最小安全长度，防止元件过度靠近或逆向移动时导致导线长度为 0 或语法崩溃。

### 4. 🧲 阶梯吸附优先级与 $\otimes$ 严格同点咬合锁 (Visio 级磁吸)
- **针对优化**：优化磁吸决策算法，消除网格对元件引脚的吸附抢跑干扰，彻底杜绝引脚虚接。
- **核心实现**：
  - 建立了阶梯吸附决策树：`元件引脚端点 (Point Snap) > 参考对齐线 (Guide Snap) > 网格刻度 (Grid Snap)`；
  - 引入专用的 **$\otimes$（圆圈十字）同点咬合高亮符号**与**粘滞滞后算法**，只有空间坐标严格重叠时触发锁定，确保电路连线 100% 物理咬合。

### 5. 📐 连续正交折线布线工具（快捷键 `M`）
- **针对优化**：专为电路原理图量身打造横平竖直的正交多拐角布线体系。
- **核心实现**：全新打造 **`M` 键连续正交布线工具**。每点击一次生成一个拐角节点，支持上下左右 4 向正交自动延伸，底层严格使用标准 `\draw[thick, line cap=round] (x1,y1) -- (x2,y2);` 独立线段语法，各段均可独立微调且拓扑锁死。

### 6. 📁 Sketch 草稿工作区与工程文件管理面板
- **针对优化**：原生 TikZ Editor 缺少多文件与草稿箱管理体系，容易丢失临时电路设计。
- **核心实现**：
  - 在代码区上方内嵌专用的 **Sketch 工程目录面板**，支持实时展开/折叠、多级文件夹树状展示与缩进；
  - 支持一键新建、快速切换、双击打开与安全删除；
  - 提供完善的文件关闭生命周期管理（“保存 / 暂存至 Sketch / 彻底删除”模态确认框）。

### 7. 🔄 完整 8 态极性矩阵与 X/Y 双轴镜像系统
- **针对优化**：支持电源/信号源正负极性与电流方向的灵活反转，以及 MOS 管栅极朝向与 D/S 引脚的直观对称。
- **核心实现**：
  - **`X` / `V` 键**：关于 X 轴做垂直镜像（Top $\leftrightarrow$ Bottom，D 极与 S 极对调，电压源正负极上下颠倒，电流源箭头上下掉头）；
  - **`Y` / `H` 键**：关于 Y 轴做水平镜像（Left $\leftrightarrow$ Right，Gate 栅极开口朝向翻转，正负极左右翻转）；
  - **`R` 键**：90° 顺时针连贯旋转；
  - **`W` / `A` / `S` / `D` 键**：上/左/下/右一键直达指定朝向；
  - 为电压源 (Voltage Source) 和电流源 (Current Source) 打造完整的 **8 态全极性矩阵**（4 方向 $\times$ 2 端锚点）。

### 8. 🔌 MOS 模拟/数字电路标准元件库与二级级联菜单
- **针对优化**：针对集成电路与模拟电子技术教学科研，内建完整的标准电路元器件库及工具栏二级下拉级联预览。
- **核心实现**：
  - **nMOS & pMOS 晶体管**（支持左开/右开，加号锚点精准可选 D/G/S 极，共 6 种子态）；
  - **电阻** ($R_D$) 与 **电容**（横/竖态，加号在端点）；
  - **电压源** 与 **电流源**（支持完整 8 态极性与箭头指示）；
  - **接地端** (GND) 与 **电源轨** (VDD)（支持三线递减接地与动态连接线联动）；
  - **输入输出端口** ($V_{in}, V_{out}$) 与 **实心黑点节点** (Dot Node)。

### 9. 🤖 外部 AI Agent 实时双向热同步 (Agent Sync Plugin)
- **针对优化**：打破浏览器孤岛，实现与外部 AI 编码助手（如 Antigravity / Claude / Cursor）的无缝热更新联动。
- **核心实现**：在 Vite 层定制开发了 `agent-sync-plugin` 与 WebSocket 监听器，并在全局暴露 `useEditorStore` 调度接口，外部 AI 可直接通过 API 向编辑器实时注入 TikZ 代码并自动触发图形更新。

### 10. 🛡️ 纯净前端打包与浏览器环境加固
- **针对优化**：加固纯前端浏览器运行环境，提升 Vite 开发环境与产物打包的稳定性。
- **核心实现**：彻底剔除了核心库中对 Node.js 原生模块 (`node:fs`) 的运行时依赖，根除了 Vite 打包与开发环境下的白屏崩溃 Bug；24/24 自动化单元测试全绿灯通过。

---

## 🎨 个性化定制工具栏与自定义元件库指南

本项目采用高度模块化的分层设计，开发者只需 4 步即可轻松扩展自定义电路元件或工具栏按钮：

```
┌─────────────────────────────────────────────────────────────┐
│                 【4 步扩展全新自定义电路元件】              │
├─────────────────────────────────────────────────────────────┤
│ 1. 注册类型 (types.ts)       -> 声明全新 ToolMode 枚举名称  │
│ 2. 工具栏图标 (tool-config)   -> 绘制 SVG 图标与加入按钮组   │
│ 3. 动态光标预览 (preview)    -> 定义鼠标跟随高刷轻量预览图   │
│ 4. TikZ 代码模板 (interaction)-> 定义点击后生成的 LaTeX 源码│
└─────────────────────────────────────────────────────────────┘
```

### 步骤 1：声明 ToolMode 类型
在 `packages/app/src/store/types.ts` 中的 `ToolMode` 联合类型中增加您的新元件模式名称：
```ts
export type ToolMode =
  | "select"
  | "addMyComponent" // 新增自定义元件
  // ...
```

### 步骤 2：在工具栏中注册按钮与图标
在 `packages/app/src/ui/tool-config.tsx` 中绘制 SVG 图标并配置按钮：
```tsx
function MyComponentIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor">
      {/* 您的 SVG 路径 */}
    </svg>
  );
}

// 在 TOOL_BUTTONS 数组中添加：
{
  mode: "addMyComponent",
  label: "我的自定义元件",
  icon: MyComponentIcon,
  shortcut: "K" // 自定义一键呼出快捷键
}
```

### 步骤 3：定义鼠标悬停高刷预览 (Preview Builder)
在 `packages/app/src/ui/canvas-panel/circuit-preview-builder.ts` 中添加轻量几何渲染：
```ts
if (toolMode === "addMyComponent") {
  return {
    paths: [
      line(0, 0, 0, -0.5),
      circle(0, -0.25, 0.25)
    ],
    texts: [{ x: 0.3, y: -0.25, main: "X_1" }]
  };
}
```

### 步骤 4：定义点击落盘生成的 TikZ LaTeX 模板
在 `packages/app/src/ui/canvas-panel/useCanvasToolInteractions.ts` 中配置标准 LaTeX 源码：
```ts
} else if (toolMode === "addMyComponent") {
  snippet = `\\begin{scope}[shift={(${xCm},${yCm})}]
    \\coordinate (node_X.top) at (0,0);
    \\draw[thick] (0,0) -- (0,-0.5);
    \\node at (0.3,-0.25) {$X_1$};
  \\end{scope}`;
}
```

---

## ⌨️ 电路设计快捷键速查表

### 1. 🔌 元件一键呼出快捷键（选择模式下直接单键呼出）

| 按键 | 对应元件 | 说明 |
|:---|:---|:---|
| **`Z`** | **nMOS** 晶体管 | 放置 nMOS 晶体管（默认栅极在左） |
| **`Q`** | **pMOS** 晶体管 | 放置 pMOS 晶体管（默认栅极在左） |
| **`R`** | **电阻** ($R_D$) | 放置电阻（默认竖直形态） |
| **`C`** | **电容** | 放置电容（默认竖直形态） |
| **`E` / `I`** | **电流源** (Current Source) | 放置电流源（8 态可选） |
| **`U` / `V`** | **电压源** (Voltage Source) | 放置电压源（8 态可选） |
| **`A`** | **电流指示箭头** | 放置电流方向指示箭头 |
| **`G`** | **接地端** (GND) | 放置接地端（标准三线递减接地符号） |
| **`T`** | **IO 端口** (Terminal) | 放置输入/输出端口 ($V_{in}, V_{out}$) |
| **`D`** | **实心连接黑点** (●) | 放置实心连接黑点节点 |
| **`V + D`** | **VDD 电源轨** | 放置 VDD 电源符号 |
| **`W`** | **单段引线** (Wire Lead) | 放置单段引出导线 |
| **`M`** | **正交折线布线工具** | 启动多段连续正交折线布线工具 |
| **`N`** | **通用 TikZ 节点** | 放置标准 TikZ 文本/几何节点 |

---

### 2. 🔄 元件放置预览实时微调键（鼠标附带元件移动时按键）

| 按键 | 功能 | 说明 |
|:---|:---|:---|
| **`X` / `V`** | **垂直镜像翻转 (X轴)** | 沿 X 轴垂直镜像（Top $\leftrightarrow$ Bottom，D $\leftrightarrow$ S，正负极对调，箭头掉头） |
| **`Y` / `H`** | **水平镜像翻转 (Y轴)** | 沿 Y 轴水平镜像（Left $\leftrightarrow$ Right，栅极开口翻转，正负极左右翻转） |
| **`R`** | **顺时针 90° 旋转** | 顺时针 90° 连贯旋转（上 $\to$ 右 $\to$ 下 $\to$ 左） |
| **`W` / `A` / `S` / `D`** | **4向直达朝向** | 一键定向到 上 / 左 / 下 / 右 预设形态 |
| **`G`** *(MOS模式下)* | **切到 Gate 栅极锚点** | 将 MOS 放置吸附锚点切换到**栅极 (Gate)** |
| **`D`** *(MOS模式下)* | **切到 Drain 漏极锚点** | 将 MOS 放置吸附锚点切换到**漏极 (Drain)** |
| **`S`** *(MOS模式下)* | **切到 Source 源极锚点** | 将 MOS 放置吸附锚点切换到**源极 (Source)** |
| **`A` / `D`** *(IO模式下)* | **$V_{in}$ 端口左右朝向** | 切换为 $V_{in}$ 端口（左开 / 右开） |
| **`W` / `S`** *(IO模式下)* | **$V_{out}$ 端口左右朝向** | 切换为 $V_{out}$ 端口（左开 / 右开） |

---

## 🔤 TikZ Arial 字体配置与编译方案 (Typography & Standalone Workflow)

在集成电路（IC）、电子工程与期刊工业标准原理图中，元器件标识与电路节点公式普遍采用 **Arial / 无衬线加粗（Sans-serif Bold）** 风格（例如 $V_{\mathrm{DD}}$、$R_D$、$W/L$、$M_1$），以获得清晰锐利、工业感极强的视觉层次。

本方案提炼自高端微电子作业与讲义工程实践，利用 `fontspec` 与 `etoolbox` 在 `tikzpicture` 环境中动态注入独立的 `arialmath` 数学版本，实现**正文保持经典学术衬线字体（如 Times / NewTX），而电路图中源码 `$R_D$` 无需任何修改即可自动呈现 Arial 粗直体/粗斜体**。

---

### 1. 核心设计与引擎要求

- **编译器引擎**：必须使用 **XeLaTeX** 或 **LuaLaTeX**（传统 pdflatex 不支持 `fontspec` 与直接调用 TTF/OTF 系统字体）。
- **必备宏包**：
  - `fontspec`：管理系统字体与定义 NFSS 字体族；
  - `etoolbox`：利用 `\AtBeginEnvironment` 环境钩子实现环境级作用域切换；
  - `tikz`：绘图引擎及配套库；
  - `amsmath`：基础数学符号与排版支持。

---

### 2. Arial 字体与公式映射代码解析

在导言区加入如下全局声明：

```latex
\usepackage{fontspec}
\usepackage{etoolbox}

% 1. 声明 Arial 字体族并映射到 NFSS 族名 arialx
% （Windows 平台可直接指定 C:/Windows/Fonts/ 路径，跨平台亦可直接使用字体名称 "Arial"）
\newfontfamily\ArialFont[
  Path = C:/Windows/Fonts/,
  Extension = .ttf,
  UprightFont = arial,
  BoldFont = arialbd,
  ItalicFont = ariali,
  BoldItalicFont = arialbi,
  NFSSFamily = arialx
]{arial}

% 2. 声明专属数学版本 arialmath
\DeclareMathVersion{arialmath}

% 3. 将公式中的数字/运算符与字母变量绑定到 Arial 字体
\SetSymbolFont{operators}{arialmath}{TU}{arialx}{b}{n}   % 数字与标准函数名 -> Arial 粗体
\SetSymbolFont{letters}  {arialmath}{TU}{arialx}{b}{it}  % 变量字母（如 R, C, V, L） -> Arial 粗斜体

% 4. 自动环境钩子：进入 tikzpicture 时自动激活 arialmath 并将文本设为 Arial
\AtBeginEnvironment{tikzpicture}{%
  \mathversion{arialmath}%
  \ArialFont%
}
```

> 💡 **原理优势**：
> 1. **零代码侵入**：TikZ 源码内的公式书写完全遵循标准 LaTeX 格式（直接写 `$R_D$`、`$V_{\mathrm{in}}$`），无需手动套用 `\mathbf` 或 `\text`。
> 2. **精准区分直体与斜体**：数字、括号保持粗直体，物理量变量自动转为粗斜体，完全符合 IEEE / JSSC 芯片顶级期刊排版规范。
> 3. **局部隔离**：仅在 `tikzpicture` 内部生效，绝不污染正文的正规公式字体（如 Times / Computer Modern）。

---

### 3. 强烈工程建议：每个 TikZ 独立为一个单文件 (`.tex`)

在实际芯片工程图和讲义排版中，**强烈建议使用者为每个电路图单独创建一个 `.tex` 文件**，采用 `standalone` 文档类进行维护，而不要将庞大的 TikZ 代码直接堆砌在主文档正文中。

#### 为什么必须采用“一图一文件”独立编译架构？
1. **⚡ 编译提速百倍**：主文档如果包含数十幅复杂电路图，全量编译将极度缓慢。独立成单文件后，单个图编译耗时通常在 0.5 秒以内，微调修改瞬间出图。
2. **🛡️ 杜绝全局字体与样式冲突**：大型论文或讲义往往加载大量格式包（`newtxtext`, `ctex`, `bm` 等），容易与 TikZ 图形设置发生字体抢跑或宏冲突。独立文件拥有纯净闭环的编译环境。
3. **🎯 完美契合 TikZ Editor 与 Git 协同**：在 TikZ Editor 中通过左侧 Sketch 工程面板或 MCP 实时读写单个电路文件；Git 提交时每个电路的变更历史独立清晰，合并冲突概率几乎为零。
4. **🖼️ 高清导出与多格式无缝复用**：
   - 独立编译出的 PDF 为严格按图形外接矩形紧凑裁切的单页矢量文件；
   - 可一键使用命令行无损导出为 600 DPI / 1200 DPI 超高清 PNG，用于 PPT 汇报或 Word 文档：
     ```bash
     pdftoppm -png -r 600 circuit_demo.pdf circuit_demo_hd
     ```
5. **🚀 双模灵活引入（编译缓存优化）**：
   在主文档宏包（如 `Command.tex`）中定义智能引入命令：
   ```latex
   \newcommand{\InputCircuit}[1]{%
     \IfFileExists{#1.pdf}{%
       \includegraphics{#1.pdf}% 如果已编译出独立矢量 PDF，直接极速包含（秒级加载）
     }{%
       \IfFileExists{#1.tex}{%
         \input{#1.tex}% 否则动态编译 tex 源码
       }{%
         \input{#1}%
       }%
     }%
   }
   ```

---

### 4. 完整独立单文件模板 (`standalone` 示例)

新建单独文件（例如 `circuit_demo.tex`），可直接使用如下完整模板独立编译：

```latex
\documentclass[tikz, border=2mm]{standalone}

% --- 基础宏包 ---
\usepackage{amsmath, amssymb}
\usepackage{fontspec}
\usepackage{etoolbox}
\usepackage{tikz}
\usetikzlibrary{calc, arrows.meta}

% ============================================================
% Arial 字体与公式数学版本配置
% ============================================================
\newfontfamily\ArialFont[
  Path = C:/Windows/Fonts/,
  Extension = .ttf,
  UprightFont = arial,
  BoldFont = arialbd,
  ItalicFont = ariali,
  BoldItalicFont = arialbi,
  NFSSFamily = arialx
]{arial}

\DeclareMathVersion{arialmath}
\SetSymbolFont{operators}{arialmath}{TU}{arialx}{b}{n}   % 数字与符号 -> Arial 粗体
\SetSymbolFont{letters}  {arialmath}{TU}{arialx}{b}{it}  % 变量       -> Arial 粗斜体

% 挂载到 tikzpicture 环境
\AtBeginEnvironment{tikzpicture}{%
  \mathversion{arialmath}%
  \ArialFont%
}

\begin{document}
\begin{tikzpicture}[>=latex, line cap=round, line join=round]

  % 1. 电源轨 VDD
  \draw[thick] (-0.8, 4.0) -- (0.8, 4.0);
  \node[above, font=\large] at (0, 4.0) {$V_{\mathrm{DD}}$};
  \draw[thick] (0, 4.0) -- (0, 3.2);

  % 2. 负载电阻 RD
  \draw[thick] (-0.25, 2.2) rectangle (0.25, 3.2);
  \node[right=4pt] at (0.25, 2.7) {$R_D = 5\,\mathrm{k}\Omega$};
  \draw[thick] (0, 2.2) -- (0, 1.4);

  % 3. 输出端口 Vout
  \draw[thick] (0, 1.4) -- (1.2, 1.4);
  \filldraw[black] (0, 1.4) circle (1.5pt);
  \node[right] at (1.2, 1.4) {$V_{\mathrm{out}}$};

  % 4. nMOS 放大管 M1
  \draw[thick] (0, 1.4) -- (0, 1.1) -- (-0.35, 1.1);       % 漏极 Drain
  \draw[thick] (-0.35, 0.4) -- (-0.35, 1.2);              % 沟道板
  \draw[thick] (-0.5, 0.5) -- (-0.5, 1.1);                % 栅极板 Gate
  \draw[thick] (-0.5, 0.8) -- (-1.2, 0.8);                % 栅极端子
  \node[left] at (-1.2, 0.8) {$V_{\mathrm{in}}$};
  \node[left=3pt] at (-0.55, 0.4) {$M_1$};
  \draw[thick] (-0.35, 0.5) -- (0, 0.5) -- (0, 0.2);       % 源极 Source

  % 5. 接地端 GND
  \draw[thick] (0, 0.2) -- (0, 0);
  \draw[thick] (-0.4, 0) -- (0.4, 0);
  \draw[thick] (-0.25, -0.08) -- (0.25, -0.08);
  \draw[thick] (-0.1, -0.16) -- (0.1, -0.16);

\end{tikzpicture}
\end{document}
```

---

## 🛠️ 快速上手与本地运行

### 环境要求
- Node.js >= 18.0.0
- npm >= 9.0.0

### 安装与启动

```bash
# 1. 克隆本仓库
git clone git@github.com:Pulala-180/tikz-editor-MOS-circuit.git
cd tikz-editor-MOS-circuit

# 2. 安装 Monorepo 所有依赖包
npm install

# 3. 启动本地热重载开发服务器
npm run dev
```

启动完成后，在浏览器打开 [http://localhost:8888](http://localhost:8888) 即可开始绘制！

---

## ❓ 常见问题排错 (FAQ)

### Q1: 为什么不能直接双击 `index.html` 打开？
> **解答**：本项目基于 React 19 + TypeScript + Vite 模块化架构构建，浏览器受安全策略限制无法通过 `file://` 协议直接加载 ES 模块。请务必使用 `一键启动.bat` 或运行 `npm run dev` 启动本地服务。

### Q2: 提示 `'node'` 或 `'npm'` 不是内部或外部命令？
> **解答**：说明电脑尚未安装 Node.js 或未将 Node.js 添加到系统环境变量。请前往 [Node.js 官网](https://nodejs.org/) 下载 LTS 版本安装，安装时勾选 "Add to PATH"，安装后重新双击 `一键启动.bat` 即可。

### Q3: 为什么发给群友 `http://localhost:8888` 对方打不开？
> **解答**：`localhost` 仅代表您当前使用的这台电脑。若想让同一局域网（同一 Wi-Fi）下的同学访问，请将启动黑框中显示的 `Network: http://192.168.x.x:8888/` 分享给对方。若想让任何人随时访问，可部署到 GitHub Pages 或 Vercel。

---

## 📄 开源许可证
本项目遵循 MIT 开源许可证（继承自原版 [DominikPeters/tikz-editor](https://github.com/DominikPeters/tikz-editor)）。
