# TikZ Editor 电路元件库开发与增改标准操作规范 (SOP)

本文档规定了在 **TikZ Editor** 中新增电路元件、修改现有元件、配置旋转镜像以及 AI Agent 协助开发时的标准工作流程与规范。

---

## 目录
- [一、 AI Agent 交互准则（缺失信息主动询问规范）](#一-ai-agent-交互准则缺失信息主动询问规范)
- [二、 系统架构原理（单一真实数据源）](#二-系统架构原理单一真实数据源)
- [三、 新增/修改元件的标准 5 步流水线](#三-新增修改元件的标准-5-步流水线)
  - [Step 1: 声明工具模式枚举 (types.ts)](#step-1-声明工具模式枚举-typests)
  - [Step 2: 注册工具能力 (capabilities.ts)](#step-2-注册工具能力-capabilitiests)
  - [Step 3: 编写标准 TikZ 模板 (circuit-snippets.ts)](#step-3-编写标准-tikz-模板-circuit-snippetsts)
  - [Step 4: 注册画布点击捕获 (useCanvasToolInteractions.ts)](#step-4-注册画布点击捕获-usecanvastoolinteractionsts)
  - [Step 5: 挂载工具栏与快捷键 (Toolbar.tsx & circuit-hotkeys.ts)](#step-5-挂载工具栏与快捷键-toolbartsx--circuit-hotkeysts)
- [四、 TikZ 元件代码编写与坐标规范](#四-tikz-元件代码编写与坐标规范)
- [五、 编译打包与验证交付](#五-编译打包与验证交付)

---

## 一、 AI Agent 交互准则（缺失信息主动询问规范）

当使用者提出 **“添加新元件”** 或 **“修改现有元件”** 时，AI Agent **严禁自作主张盲目编写**。若使用者的需求中缺少以下关键信息，Agent **必须主动向使用者提问确认**：

### 📋 必须核对的 5 大关键要素：
1. **插入基准锚点（红叉所在位置）**：
   * 该元件以哪个端口/端点对齐鼠标指针 `(0, 0)`？
   * *例如*：MOSFET 是以 Gate（栅极）、Drain（漏极）还是 Source（源极）作为插入点？双端阻容是以左端点、右端点、顶端还是底端作为插入点？
2. **旋转朝向需求（Rotation）**：
   * 是否需要支持旋转？需要提供哪些方向的子模式（如水平 Horizontal、垂直 Vertical，或 Up / Down / Left / Right）？
3. **镜像翻转需求（Mirror / Flip）**：
   * 是否需要支持左右镜像或上下翻转？（例如 MOSFET 的栅极朝左 vs 朝右）
4. **标称文字与下标位置（Label & Math）**：
   * 元件的默认标称文字是什么（如 `$M_1$`, `$R_D$`, `$C_{in}$`, `$v$`, `$i$`）？
   * 标签文字相对于元件主体放置在什么方位（如上方、右侧、偏移距离）？
5. **快捷键与工具栏展示（Hotkeys & Toolbar）**：
   * 是否需要分配单字母快捷键（如 `Z` 为 NMOS，`R` 为电阻，`L` 为电感）？
   * 是否需要右键旋转菜单（`CircuitElementSubmenu` / `MosfetElementSubmenu`）？

---

## 二、 系统架构原理（单一真实数据源）

系统采用 **Single Source of Truth（单一数据源）** 架构：
1. 所有元件的 TikZ LaTeX 源码集中由 [`circuit-snippets.ts`](file:///E:/tikz-editor-master/tikz-editor-master/packages/app/src/ui/canvas-panel/circuit-snippets.ts) 管理；
2. **鼠标悬停预选虚影** 由 [`circuit-preview-builder.ts`](file:///E:/tikz-editor-master/tikz-editor-master/packages/app/src/ui/canvas-panel/circuit-preview-builder.ts) 直接调用核心库 `@tikz-editor/core` 语义求值引擎，实时将 TikZ 模板编译为包含箭头尖角（Miter 补偿）、正确线宽、数学下标的矢量路径；
3. **点击插入画板** 由 [`useCanvasToolInteractions.ts`](file:///E:/tikz-editor-master/tikz-editor-master/packages/app/src/ui/canvas-panel/useCanvasToolInteractions.ts) 直接插入完全相同的 TikZ 源码；
4. **优势**：修改或新增 TikZ 模板后，画板实物与悬停虚影自动保持 100% 像素级同步，无需手动维护两套绘制逻辑。

---

## 三、 新增/修改元件的标准 5 步流水线

以添加 **电感（Inductor）** 为例：

### Step 1: 声明工具模式枚举 (types.ts)
📁 **文件**：[`packages/app/src/store/types.ts`](file:///E:/tikz-editor-master/tikz-editor-master/packages/app/src/store/types.ts)
在 `ToolMode` 联合类型中增加主模式与各旋转/端口子模式：
```ts
export type ToolMode =
  // ... 其他已有工具
  | "addInductor"
  | "addInductor_H_Left"
  | "addInductor_H_Right"
  | "addInductor_V_Top"
  | "addInductor_V_Bottom"
```

---

### Step 2: 注册工具能力 (capabilities.ts)
📁 **文件**：[`packages/app/src/ui/capabilities.ts`](file:///E:/tikz-editor-master/tikz-editor-master/packages/app/src/ui/capabilities.ts)
在 `TOOL_CAPABILITIES` 对象中注册新定义的每个模式：
```ts
export const TOOL_CAPABILITIES: Record<ToolMode, readonly ToolCapability[]> = {
  // ...
  addInductor: [],
  addInductor_H_Left: [],
  addInductor_H_Right: [],
  addInductor_V_Top: [],
  addInductor_V_Bottom: [],
};
```

---

### Step 3: 编写标准 TikZ 模板 (circuit-snippets.ts)
📁 **文件**：[`packages/app/src/ui/canvas-panel/circuit-snippets.ts`](file:///E:/tikz-editor-master/tikz-editor-master/packages/app/src/ui/canvas-panel/circuit-snippets.ts)
在 `getCircuitComponentSnippet(toolMode, xCm, yCm)` 中补充各子模式对应的标准 TikZ 代码：
```ts
// 电感 - 水平左锚点
if (toolMode === "addInductor" || toolMode === "addInductor_H_Left") {
  return `\\begin{scope}[shift={(${xCm},${yCm})}]
    \\coordinate (node_Lx.l) at (0,0);
    \\draw[thick, line cap=round] (0,0) -- (0.15,0) arc[start angle=180, end angle=0, radius=0.1] arc[start angle=180, end angle=0, radius=0.1] arc[start angle=180, end angle=0, radius=0.1] -- (0.9,0);
    \\node at (0.45,0.3) {$L_1$};
    \\coordinate (node_Lx.r) at (0.9,0);
  \\end{scope}`;
}
// 电感 - 垂直顶锚点
if (toolMode === "addInductor_V_Top") {
  return `\\begin{scope}[shift={(${xCm},${yCm})}]
    \\coordinate (node_Lx.t) at (0,0);
    \\draw[thick, line cap=round] (0,0) -- (0,-0.15) arc[start angle=90, end angle=-90, radius=0.1] arc[start angle=90, end angle=-90, radius=0.1] arc[start angle=90, end angle=-90, radius=0.1] -- (0,-0.9);
    \\node[right] at (0.25,-0.45) {$L_1$};
    \\coordinate (node_Lx.b) at (0,-0.9);
  \\end{scope}`;
}
```

---

### Step 4: 注册画布点击捕获 (useCanvasToolInteractions.ts)
📁 **文件**：[`packages/app/src/ui/canvas-panel/useCanvasToolInteractions.ts`](file:///E:/tikz-editor-master/tikz-editor-master/packages/app/src/ui/canvas-panel/useCanvasToolInteractions.ts)
在鼠标交互判断条件中（约 600 行和 645 行），添加对新工具前缀的匹配：
```ts
toolMode.startsWith("addInductor") ||
```

---

### Step 5: 挂载工具栏与快捷键 (Toolbar.tsx & circuit-hotkeys.ts)
📁 **文件 1**：[`packages/app/src/ui/Toolbar.tsx`](file:///E:/tikz-editor-master/tikz-editor-master/packages/app/src/ui/Toolbar.tsx)
在电路工具栏中添加按钮或子菜单：
```tsx
<CircuitElementSubmenu
  tooltip="电感 (L)"
  buttonContent="L"
  toolModes={{
    hLeft: "addInductor_H_Left",
    hRight: "addInductor_H_Right",
    vTop: "addInductor_V_Top",
    vBottom: "addInductor_V_Bottom"
  }}
  currentToolMode={toolMode}
  onSelectMode={(mode) => dispatch({ type: "SET_TOOL_MODE", mode })}
/>
```

📁 **文件 2 (可选快捷键与旋转交互)**：[`packages/app/src/ui/canvas-panel/circuit-hotkeys.ts`](file:///E:/tikz-editor-master/tikz-editor-master/packages/app/src/ui/canvas-panel/circuit-hotkeys.ts)
* 配置单键呼出（如按 `L` 切换为电感模式）；
* 配置旋转状态机 `getNextRotatedCircuitMode(currentMode)`：
  ```ts
  if (mode.startsWith("addInductor")) {
    if (mode === "addInductor_H_Left") return "addInductor_V_Top";
    if (mode === "addInductor_V_Top") return "addInductor_H_Right";
    if (mode === "addInductor_H_Right") return "addInductor_V_Bottom";
    return "addInductor_H_Left";
  }
  ```

---

## 四、 TikZ 元件代码编写与坐标规范

为了确保元件在画布上精准吸附、端点不漂移、预选虚影与实物完全重合，编写 TikZ 代码时**必须严格遵守以下规范**：

1. **绝对以 `(0, 0)` 作为插入锚点**：
   * 无论元件几何多复杂，**使用者鼠标红叉吸附的端点必须定义在相对坐标 `(0, 0)`**；
   * *例*：若该模式是以“下端点”插入，则下端点必须写为 `(0, 0)`，主体向上延伸到 `(0, 0.78)`；
   * *例*：若该模式是以“左端点”插入，则左端点必须写为 `(0, 0)`，主体向右延伸到 `(0.78, 0)`。
2. **统一使用 `scope` 与 `shift` 参数**：
   ```latex
   \begin{scope}[shift={(${xCm},${yCm})}]
     ...
   \end{scope}
   ```
3. **关键端口必须显式声明 `coordinate`**：
   * 必须包含标准的端口命名（如 `(node_Rx.l)`, `(node_Rx.r)`, `(node_Mx.g)`, `(node_Mx.d)`, `(node_Mx.s)`），供自动连线和引线捕捉系统使用。
4. **箭头规范**：
   * 统一使用标准 TikZ 箭头几何：`-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}`。
5. **数学公式与文字标签**：
   * 统一使用 `$M_1$`, `$R_D$`, `$V_{in}$`, `$V_{DD}$` 等标准 LaTeX 格式；预选解析器会自动识别并渲染为标准的斜体数学符号与上下标。

---

## 五、 编译打包与验证交付

完成代码编辑后，在项目根目录执行生产构建：
```bash
npm run build -w @tikz-editor/web
```
构建成功（0 Error）后，在浏览器中按 **Ctrl + F5 强制刷新**，即可使用全新元件并进行功能与坐标验证。
