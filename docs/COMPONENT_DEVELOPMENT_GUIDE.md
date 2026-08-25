# TikZ Editor 电路元件库开发与引脚节点规范指南 (SOP)

本文档规定了在 **TikZ Editor** 中新增电路元件、修改现有元件、配置旋转镜像、引脚节点命名与自动识别、快捷键分配原则以及多选复制吸附机制的标准开发规范。

---

## 目录
- [一、 AI Agent 交互准则（缺失信息主动询问规范）](#一-ai-agent-交互准则缺失信息主动询问规范)
- [二、 全局电路快捷键占用与空闲推荐清单 (Hotkeys Map)](#二-全局电路快捷键占用与空闲推荐清单-hotkeys-map)
- [三、 系统架构原理（单一真实数据源与自动拓扑分析）](#三-系统架构原理单一真实数据源与自动拓扑分析)
- [四、 电路节点与引脚命名注册规范 (Node & Port Registry)](#四-电路节点与引脚命名注册规范-node--port-registry)
  - [1. 节点声明标准语法](#1-节点声明标准语法)
  - [2. 标准引脚后缀与自动识别映射表](#2-标准引脚后缀与自动识别映射表)
  - [3. 新引脚类型扩展方法](#3-新引脚类型扩展方法)
- [五、 新增/修改元件的标准 6 步流水线 (CheckList)](#五-新增修改元件的标准-6-步流水线-checklist)
  - [Step 1: 声明工具模式枚举 (types.ts)](#step-1-声明工具模式枚举-typests)
  - [Step 2: 注册工具能力 (capabilities.ts)](#step-2-注册工具能力-capabilitiests)
  - [Step 3: 编写标准 TikZ 模板 (circuit-snippets.ts)](#step-3-编写标准-tikz-模板-circuit-snippetsts)
  - [Step 4: 注册引脚中文名与优先级 (circuit-node-registry.ts)](#step-4-注册引脚中文名与优先级-circuit-node-registryts)
  - [Step 5: 注册画布点击捕获 (useCanvasToolInteractions.ts)](#step-5-注册画布点击捕获-usecanvastoolinteractionsts)
  - [Step 6: 挂载工具栏与快捷键 (Toolbar.tsx & circuit-hotkeys.ts)](#step-6-挂载工具栏与快捷键-toolbartsx--circuit-hotkeysts)
- [六、 多选复制、整体镜像翻转与自动解包机制 (Cluster Copy & Paste)](#六-多选复制整体镜像翻转与自动解包机制-cluster-copy--paste)
- [七、 TikZ 元件代码编写与坐标规范](#七-tikz-元件代码编写与坐标规范)
- [八、 编译打包与验证交付](#八-编译打包与验证交付)

---

## 一、 AI Agent 交互准则（缺失信息主动询问规范）

当使用者提出 **“添加新元件”** 或 **“修改现有元件”** 时，AI Agent **严禁自作主张盲目编写**。若使用者的需求中缺少以下关键信息，Agent **必须主动向使用者提问确认**：

### 📋 必须核对的 5 大关键要素：
1. **插入基准锚点（鼠标红叉所在位置）**：
   * 该元件以哪个端口/端点对齐鼠标指针 `(0, 0)`？
   * *例如*：MOSFET 是以 Gate（栅极）、Drain（漏极）还是 Source（源极）作为插入点？双端阻容是以左端点、右端点、顶端还是底端作为插入点？
2. **旋转朝向需求（Rotation）**：
   * 是否需要支持旋转？需要提供哪些方向的子模式（如水平 Horizontal、垂直 Vertical，或 Up / Down / Left / Right）？
3. **镜像翻转需求（Mirror / Flip）**：
   * 是否需要支持左右镜像或上下翻转？（例如 MOSFET 的栅极朝左 vs 朝右）
4. **标称文字与下标位置（Label & Math）**：
   * 元件的默认标称文字是什么（如 `$M_1$`, `$R_D$`, `$C_{in}$`, `$v$`, `$i$`）？
   * 标签文字相对于元件主体放置在什么方位（如上方、右侧、偏移距离）？
5. **快捷键冲突排查与空闲推荐（Hotkeys Recommendation）**：
   * Agent **必须主动向使用者推荐尚未被占用的主快捷键**（如推荐 `L` 对应电感、`B` 对应三极管/电池、`O` 对应运放、`P` 对应电位器等）；
   * 严禁将已占用的核心呼出热键重复分配给新元件，避免快捷键冲突。

---

## 二、 全局电路快捷键占用与空闲推荐清单 (Hotkeys Map)

为确保新元件快捷键不发生冲突，以下是当前系统 **26 个英文字母的全面分配与空闲状态**：

### 1. 选择模式下已占用的“一键呼出”主键 (14个)

| 按键 | 触发元件 / 对应工具 | 英文助记 |
| :---: | :--- | :--- |
| **`A`** | **电流箭头** (`addCurrentArrow`) | Arrow |
| **`C`** | **电容** (`addCapacitor`) | Capacitor |
| **`D`** | **实心连接圆点** (`addDotNode`) / 配合 V 键出 **VDD** | Dot / VDD |
| **`E`** | **理想电流源** (`addCurrentSource`) | Current source |
| **`F`** | **自适应画布内容聚焦** (`Fit to Content`) | Fit view |
| **`G`** | **接地端 GND** (`addGND`) | Ground |
| **`I`** | **理想电流源 (别名)** (`addCurrentSource`) | Current $i$ |
| **`M`** | **正交多段折线导线** (`addOrthoWire`) | Multiline Wire |
| **`N`** | **普通文本节点** (`addNode`) | Node |
| **`Q`** | **pMOSFET 管** (`addPMOS`) | pMOS（Q为晶体管代号） |
| **`R`** | **电阻** (`addResistor`) | Resistor |
| **`T`** | **IO 端口 Terminal** (`addIoNode`) | Terminal ($V_{in}/V_{out}$) |
| **`V`** | **理想电压源** (`addVoltageSource`) | Voltage source |
| **`W`** | **基础连接引线** (`addWireLead`) | Wire |
| **`Z`** | **nMOSFET 管** (`addNMOS`) | nMOS |

---

### 2. 选中有元件 / 复制虚影预选时的变换热键 (5个)
* **`H`** / **`Y`**：沿 Y 轴水平左右对称翻转 (`xscale=-1`)；
* **`V`** / **`X`**：沿 X 轴垂直上下对称翻转 (`yscale=-1`)；
* **`Tab`** / **`Q`**：按拓扑分支顺序切换虚影对齐的引脚吸附点（下一个 / 上一个）；
* **`Escape`**：取消虚影预选或退出当前工具模式。

---

### 3. ⭐ 选择模式下【完全空闲可用】的黄金主键 (推荐清单)

若需要给新元件添加**初次一键呼出快捷键**，优先从以下空闲字母中挑选：

| 推荐主键 | 推荐适用的元件类型 | 推荐理由与行业标准 |
| :---: | :--- | :--- |
| **`L`** | **电感 (Inductor)** | ⭐ **首选黄金键**。完全空闲，电感国际标准符号为 $L_1$ |
| **`B`** | **三极管 (BJT) / 电池 (Battery) / 偏置 (Bias)** | ⭐ **首选黄金键**。完全空闲，BJT / Battery 首字母 |
| **`O`** | **运算放大器 (Op-Amp)** | ⭐ **首选黄金键**。完全空闲，Op-Amp 首字母 |
| **`P`** | **电位器 (Potentiometer) / 探针 (Probe)** | ⭐ **首选黄金键**。完全空闲（因 pMOS 使用 Q 键） |
| **`K`** | **开关 (Key/Switch) / 继电器 (Relay)** | ⭐ **首选黄金键**。完全空闲，原理图中常以 $K_1$ 命名开关 |
| **`J`** | **结型场效应管 (JFET)** | 完全空闲，JFET 首字母 |
| **`U`** | **集成芯片 (IC Unit) / 变压器 (Transformer)** | 完全空闲，芯片在原理图中常用 $U_1$ 代号 |
| **`S`** | **开关 (Switch) / 信号源 (Signal)** | 备选。选择模式下尚未绑定呼出工具 |

---

## 三、 系统架构原理（单一真实数据源与自动拓扑分析）

系统采用 **Single Source of Truth（单一真实数据源）** 架构：
1. **代码集中管理**：所有元件的 TikZ 源码集中由 `circuit-snippets.ts` 管理；
2. **矢量引擎直出**：悬停虚影与点击插入均调用 `@tikz-editor/core` 语法求值引擎，实时将 TikZ 代码编译为矢量图层与引脚拓扑，**画板实物与预选虚影 100% 像素级同步**；
3. **引脚全自动提取**：所有以 `\coordinate (node_Xx.port)` 声明的引脚会被核心语法引擎自动解析为可吸附、可连线的语义目标（`nodeAnchorTargets`），无需手动编写任何坐标映射表。

---

## 四、 电路节点与引脚命名注册规范 (Node & Port Registry)

所有元件的引脚命名必须严格遵守以下规则，以确保导线自动吸附、复制去重以及徽标提示正常工作。

### 1. 节点声明标准语法
在 TikZ 模板中，元件关键引脚必须使用 `\coordinate` 显式声明：
```latex
\coordinate (node_<元件标识>.<引脚后缀>) at (x, y);
```
* **`<元件标识>`**：建议以 `node_` 开头，如 `node_Rx`（电阻）、`node_Mx`（MOS管）、`node_Lx`（电感）、`node_OA`（运放）；
* **`<引脚后缀>`**：代表引脚的功能语义（如 `.d`, `.g`, `.s`, `.t`, `.b`, `.in+`, `.out`）。

### 2. 标准引脚后缀与自动识别映射表
系统在 `circuit-node-registry.ts` 中预设了以下标准引脚映射：

| 引脚后缀 | 物理含义 | 中文徽标提示 | 拓扑优先级 | 适用元件 |
| :--- | :--- | :--- | :---: | :--- |
| **`.d`** | Drain (漏极) | `漏极 (d)` | 1 | MOSFET / JFET |
| **`.g`** | Gate (栅极) | `栅极 (g)` | 2 | MOSFET / JFET |
| **`.s`** | Source (源极) | `源极 (s)` | 3 | MOSFET / JFET |
| **`.b` / `.b_body`** | Bulk (衬底) | `衬底 (b)` | 4 | MOSFET 四端器件 |
| **`.t`** | Top (顶端口) | `顶端口 (t)` | 1 | 竖直放置的电阻/电容/电感/二极管 |
| **`.b`** | Bottom (底端口) | `底端口 (b)` | 2 | 竖直放置的电阻/电容/电感/二极管 |
| **`.l`** | Left (左端口) | `左端口 (l)` | 1 | 水平放置的双端元件 |
| **`.r`** | Right (右端口) | `右端口 (r)` | 2 | 水平放置的双端元件 |
| **`.vdd`** | 电源轨 | `电源 (VDD)` | 1 | VDD 节点 |
| **`.gnd`** | 接地端 | `接地 (GND)` | 1 | GND 节点 |
| **`.vin` / `.vout`** | IO 端口 | `IO引脚` | 1 | 信号输入输出端子 |
| **`.c` / `.b` / `.e`** | 集电极/基极/发射极 | `集电极 (c)` / `基极 (b)` / `发射极 (e)` | 1~3 | BJT 三极管 |
| **`.in+` / `.in-` / `.out`** | 运放同相/反相/输出 | `同相端 (+)` / `反相端 (-)` / `输出端 (out)` | 1~3 | 运算放大器 (Op-Amp) |

### 3. 新引脚类型扩展方法
若新增元件具有全新的引脚类型（如变压器初级/次级引脚），只需在 `packages/app/src/ui/canvas-panel/circuit-node-registry.ts` 的 `CIRCUIT_PORT_DEFINITIONS` 对象中追加一行定义：
```ts
export const CIRCUIT_PORT_DEFINITIONS: Record<string, CircuitPortDescriptor> = {
  // ... 已有定义
  "pri_t": { portKey: "pri_t", nameZh: "初级上端 (Pri+)", nameEn: "Primary Top", priority: 1 },
  "pri_b": { portKey: "pri_b", nameZh: "初级下端 (Pri-)", nameEn: "Primary Bottom", priority: 2 },
  "sec_t": { portKey: "sec_t", nameZh: "次级上端 (Sec+)", nameEn: "Secondary Top", priority: 1 },
  "sec_b": { portKey: "sec_b", nameZh: "次级下端 (Sec-)", nameEn: "Secondary Bottom", priority: 2 },
};
```

---

## 五、 新增/修改元件的标准 6 步流水线 (CheckList)

以添加 **电感（Inductor，分配快捷键 L）** 为例：

### Step 1: 声明工具模式枚举 (types.ts)
📁 **文件**：`packages/app/src/store/types.ts`
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
📁 **文件**：`packages/app/src/ui/capabilities.ts`
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
📁 **文件**：`packages/app/src/ui/canvas-panel/circuit-snippets.ts`
在 `getCircuitComponentSnippet(toolMode, xCm, yCm)` 中补充各子模式对应的标准 TikZ 代码：
```ts
// 电感 - 水平左锚点
if (toolMode === "addInductor" || toolMode === "addInductor_H_Left") {
  return `\begin{scope}[shift={(${xCm},${yCm})}]
    \coordinate (node_Lx.l) at (0,0);
    \draw[thick, line cap=round] (0,0) -- (0.15,0) arc[start angle=180, end angle=0, radius=0.1] arc[start angle=180, end angle=0, radius=0.1] arc[start angle=180, end angle=0, radius=0.1] -- (0.9,0);
    \node at (0.45,0.3) {$L_1$};
    \coordinate (node_Lx.r) at (0.9,0);
  \end{scope}`;
}
// 电感 - 垂直顶锚点
if (toolMode === "addInductor_V_Top") {
  return `\begin{scope}[shift={(${xCm},${yCm})}]
    \coordinate (node_Lx.t) at (0,0);
    \draw[thick, line cap=round] (0,0) -- (0,-0.15) arc[start angle=90, end angle=-90, radius=0.1] arc[start angle=90, end angle=-90, radius=0.1] arc[start angle=90, end angle=-90, radius=0.1] -- (0,-0.9);
    \node[right] at (0.25,-0.45) {$L_1$};
    \coordinate (node_Lx.b) at (0,-0.9);
  \end{scope}`;
}
```

---

### Step 4: 注册引脚中文名与优先级 (circuit-node-registry.ts)
📁 **文件**：`packages/app/src/ui/canvas-panel/circuit-node-registry.ts`
* 若使用的引脚已在标准表（如 `.l`, `.r`, `.t`, `.b`）中，**无需修改任何代码**；
* 若有特殊引脚，按 [四、3](#3-新引脚类型扩展方法) 添加映射。

---

### Step 5: 注册画布点击捕获 (useCanvasToolInteractions.ts)
📁 **文件**：`packages/app/src/ui/canvas-panel/useCanvasToolInteractions.ts`
在鼠标点击插入判断条件中（约 600 行和 645 行），添加对新工具前缀的匹配：
```ts
toolMode.startsWith("addInductor") ||
```

---

### Step 6: 挂载工具栏与快捷键 (Toolbar.tsx & circuit-hotkeys.ts)
📁 **文件 1**：`packages/app/src/ui/Toolbar.tsx`
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

📁 **文件 2 (快捷键与旋转交互)**：`packages/app/src/ui/canvas-panel/circuit-hotkeys.ts`
* 在 `resolveSelectModeInitialTool` 中配置单键呼出：
  ```ts
  if (k === "l") return "addInductor_H_Left";
  ```
* 在 `rotateCircuitToolMode` 中配置顺时针旋转状态机：
  ```ts
  if (mode.startsWith("addInductor")) {
    if (mode === "addInductor_H_Left") return "addInductor_V_Top";
    if (mode === "addInductor_V_Top") return "addInductor_H_Right";
    if (mode === "addInductor_H_Right") return "addInductor_V_Bottom";
    return "addInductor_H_Left";
  }
  ```

---

## 六、 多选复制、整体镜像翻转与自动解包机制 (Cluster Copy & Paste)

系统对包含多个元件及连线的复合电路复制提供了全自动托管支持：

1. **自动 Group 包装（构建整体临时 Scope）**：
   - 框选多个元件与导线按 `Ctrl+C` 时，系统自动计算复合包围盒中心 $(c_x, c_y)$，并将所有元件转换相对坐标包装在单一大群组中：
     ```latex
     \begin{scope}[shift={(cx, cy)}, clusterScope=true]
       ... 内部各元件独立 scope 与导线 ...
     \end{scope}
     ```
2. **对称翻转与引脚切换**：
   - 按 **`X` / `V`**：整个复合模块关于中心整体垂直镜像（`yscale=-1`）；
   - 按 **`Y` / `H`**：整个复合模块关于中心整体水平镜像（`xscale=-1`）；
   - 按 **`Tab` / `Q`**：沿电路拓扑分支顺序在所有元件的引脚之间循环切换对齐吸附点。
3. **点击粘贴自动 Ungroup 解包平展**：
   - 鼠标左键点击盖章放置时，系统调用 `unwrapPasteClusterSnippets`，自动将外层的总位移与镜像系数 $(S_x, S_y)$ 投影合并到每个内部子元件的局部坐标中；
   - **完全脱去外层临时 Scope**，直接向文档插入平级、干净的各元件代码；
   - 新插入的代码中的 `node_Xx` 自动重命名为 `node_Xx2`，被复制的原始元件代码完全保持不变。

---

## 七、 TikZ 元件代码编写与坐标规范

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

## 八、 编译打包与验证交付

完成代码编辑后，在项目根目录执行全量生产构建：
```bash
npm run build
```
构建成功（0 Error）后，在浏览器中按 **Ctrl + F5 强制刷新**，即可使用全新元件并进行功能与坐标验证。