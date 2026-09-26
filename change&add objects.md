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
  - [4. 引脚命名对拖拽轴向与拓扑行为的影响 (避坑须知)](#4-引脚命名对拖拽轴向与拓扑行为的影响-避坑须知)
- [五、 新增/修改元件的标准 8 步流水线 (CheckList)](#五-新增修改元件的标准-8-步流水线-checklist)
  - [Step 1: 声明工具模式枚举 (types.ts)](#step-1-声明工具模式枚举-typests)
  - [Step 2: 注册工具能力 (capabilities.ts)](#step-2-注册工具能力-capabilitiests)
  - [Step 3: 编写标准 TikZ 模板 (circuit-snippets.ts)](#step-3-编写标准-tikz-模板-circuit-snippetsts)
  - [Step 4: 注册引脚中文名与优先级 (circuit-node-registry.ts)](#step-4-注册引脚中文名与优先级-circuit-node-registryts)
  - [Step 5: 注册画布点击捕获 (useCanvasToolInteractions.ts)](#step-5-注册画布点击捕获-usecanvastoolinteractionsts)
  - [Step 6: 挂载工具栏与快捷键 (Toolbar.tsx & circuit-hotkeys.ts)](#step-6-挂载工具栏与快捷键-toolbartsx--circuit-hotkeysts)
  - [Step 7: 注册状态栏操作提示 (StatusBar.tsx)](#step-7-注册状态栏操作提示-statusbartsx)
  - [Step 8 (可选): 同步 Python MCP 助手元件库 (components.py)](#step-8-可选-同步-python-mcp-助手元件库-componentspy)
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

### 1. 选择模式下已占用的“一键呼出”主键 (16个)

| 按键 | 触发元件 / 对应工具 | 英文助记 |
| :---: | :--- | :--- |
| **`A`** | **电流箭头** (`addCurrentArrow`) | Arrow |
| **`C`** | **电容** (`addCapacitor`) | Capacitor |
| **`D`** | **实心连接圆点** (`addDotNode`) / 配合 V 键出 **VDD** | Dot / VDD |
| **`E`** | **理想电流源** (`addCurrentSource`) | Current source |
| **`F`** | **自适应画布内容聚焦** (`Fit to Content`) | Fit view |
| **`G`** | **接地端 GND** (`addGND`) | Ground |
| **`I`** | **理想电流源 (别名)** (`addCurrentSource`) | Current $i$ |
| **`J`** | **通用端口 Port** (`addIoNode_Port_Left`) | Junction / Port |
| **`K`** | **VDD 电源轨** (`addPowerRail`) | Power rail (K) |
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
| **`B`** | **三极管 (BJT) / 电池 (Battery) / 偏置 (Bias)** | ⭐ **首选黄金键**。完全空闲，BJT / Base 首字母 |
| **`L`** | **电感 (Inductor)** | ⭐ **首选黄金键**。完全空闲，电感国际标准符号为 $L_1$ |
| **`O`** | **运算放大器 (Op-Amp)** | ⭐ **首选黄金键**。完全空闲，Op-Amp 首字母 |
| **`P`** | **电位器 (Potentiometer) / 探针 (Probe)** | ⭐ **首选黄金键**。完全空闲（因 pMOS 使用 Q 键） |
| **`U`** | **集成芯片 (IC Unit) / 变压器 (Transformer)** | 完全空闲，芯片在原理图中常用 $U_1$ 代号 |
| **`S`** | **开关 (Switch) / 信号源 (Signal)** | 备选。选择模式下尚未绑定呼出工具 |

---

## 三、 系统架构原理（单一真实数据源与自动拓扑分析）

系统采用 **Single Source of Truth（单一真实数据源）** 架构：
1. **代码集中管理**：所有元件的 TikZ 源码集中由 `circuit-snippets.ts` 管理；
2. **矢量引擎直出**：悬停虚影与点击插入均调用 `@tikz-editor/core` 语法求值引擎，实时将 TikZ 代码编译为矢量图层与引脚拓扑，**画板实物与预选虚影 100% 像素级同步**；
3. **引脚全自动提取**：所有以 `\coordinate (node_Xx.port)` 声明的引脚会被核心语法引擎自动解析为可吸附、可连线的语义目标（`nodeAnchorTargets`），无需手动编写任何坐标映射表；
4. **`scope` 内部引脚隔离与防干扰机制（核心原理）**：
   - 编辑器为了防止复杂元件（如 MOS 管内部由栅极短线、漏源折线、三角形箭头等 7~8 个子路径组成）把内部每一个几何拐弯或折点都错误暴露为可吸附引脚，在内核（`useCanvasSelectionDerivedState.ts`）中建立了**严格的隔离防火墙**：
     ```ts
     if (scopeInternalIds.has(sourceId)) continue; // 过滤所有 scope 内部未命名的路径元素
     ```
   - **核心结论**：封装在 `\begin{scope}` 内部的图形，**只要没有声明 `\coordinate`，编辑器一律视其为纯视觉绘制细节，绝不会外露生成 `NodeAnchorTarget`**。

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
| **`.l` / `.left`** | Left (左端口) | `左端口 (l)` | 1 | 水平放置的双端元件 |
| **`.r` / `.right`** | Right (右端口) | `右端口 (r)` | 2 | 水平放置的双端元件 |
| **`.dot`** | 节点 (支路连接点) | `节点 (dot)` | 1 | 支路节点 (Dot Node) |
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

### 4. 引脚命名对拖拽轴向与拓扑行为的影响 (避坑须知)
元件被连线后的拖拽移动特性直接取决于引脚命名规范，添加新元件时必须遵守以下规则：
* **双端元件（阻容/电感/二极管/源）**：垂直放置时引脚名必须严格成对使用 `.t` 与 `.b`；水平放置时必须严格使用 `.l` 与 `.r`。系统据此识别其物理轴向并在连线后自动开启“防扯歪轴向锁定”（垂直只能上下动、水平只能左右动）。切勿随意起名（如 `.1`/`.2`），否则拖动时会丢失轴向锁定被斜扯成 45° 歪线。
* **边界终端元件（VDD / GND / 信号端口）**：节点命名标识必须包含 `node_VDD`、`node_GND` 或 `node_IO`（如 `(node_IO1.port)`）。系统据此将其判定为单向拉伸的终端叶子，拖拽时仅拉伸自身引线，绝不会反向拉扯内部的核心晶体管或电路网络。
* **支路抽头节点（如 Dot 黑点、变压器抽头）**：坐落在主干线上的引脚必须使用 `.dot`。系统会将其识别为主干抽头，允许沿主干滑动调节抽头位置，同时死锁垂直于主干的自由度（严禁横向脱轨）。

---

## 五、 新增/修改元件的标准 8 步流水线 (CheckList)

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
在 `TOOL_CHECKS` 对象中注册新定义的每个模式（若遗漏，系统会将该模式标记为 `"unsupported"` 并在菜单/交互中置灰禁用）：
```ts
const TOOL_CHECKS: Record<ToolMode, readonly CapabilityCheck[]> = {
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
在 `getCircuitComponentSnippet(toolMode, xCm, yCm)` 中补充各子模式对应的标准 TikZ 代码。

⚠️ **两大核心语法铁律（直接影响序号自增与标称渲染）**：
1. **坐标占位符必须以小写 `x` 结尾 (`node_<family>x`)**：
   - 源码正则为 `/\bnode_([A-Za-z]+)x\b/`；必须写成 `node_Lx.l`, `node_Rx.t`, `node_Qx.b` 等格式，系统才能提取出 `family` 并在放置时自增为 `node_L1`, `node_L2`。切勿写成 `node_OA` 或 `node_L_1`。
2. **标称文字与序号自增正则对齐**：
   - 源码通过 `new RegExp(\`\\$${family}_(?:\\{\\d+\\}|\\d+)\\$\`, "g")` 进行文本自增替换；模板标签中的公式代号必须与 `node_<family>x` 的字母一致（例如 `node_Qx` 配对 `$Q_{1}$`，`node_Lx` 配对 `$L_1$`）。

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
* 系统标准引脚表为 `.l`, `.r`, `.t`, `.b`, `.dot`, `.vdd`, `.gnd`, `.port`。
* **新增特殊引脚后缀**：若新元件包含全新引脚（如三极管的集电极 `.c` 与发射极 `.e`），必须在 `CIRCUIT_PORT_DEFINITIONS` 中注册：
  ```ts
  "c": { portKey: "c", nameZh: "集电极 (c)", nameEn: "Collector (c)", priority: 1 },
  "e": { portKey: "e", nameZh: "发射极 (e)", nameEn: "Emitter (e)", priority: 3 },
  ```
* **同名冲突上下文消歧**：如三极管基极也是 `.b`，但标准表中 `"b"` 默认为 `"底端口 (b)"`。必须在 `resolveComponentPort` 中根据节点族前缀消歧：
  ```ts
  if (cleanNode.includes(".b") || cleanNode.endsWith("_b")) {
    if (cleanNode.startsWith("node_q") || cleanNode.includes("bjt")) {
      return { label: "基极 (b)", priority: 2 };
    }
    return { label: "底端口 (bottom)", priority: 2 };
  }
  ```

---

### Step 5: 注册画布点击捕获与连放 (useCanvasToolInteractions.ts)
📁 **文件**：`packages/app/src/ui/canvas-panel/useCanvasToolInteractions.ts`
必须在以下三处守卫中同步注册新工具前缀：
1. **第 890 行附近 (MouseDown 事件)**：
   ```ts
   toolMode.startsWith("addInductor") ||
   ```
   *说明：此处的守卫负责拦截原生拖拽并激活鼠标指针端点吸附（Snap）。若遗漏，点击放置将无法吸附对齐！*
2. **第 940 行附近 (MouseUp 事件)**：
   ```ts
   toolMode.startsWith("addInductor") ||
   ```
   *说明：负责在鼠标松开时向文档提交插入操作与派发历史记录。*
3. **第 1016 行附近 (连放模式 Sticky Placement)**：
   *说明：默认单次放置后退回选择模式；若希望像 MOS 管或三极管一样连续点击盖章放置，在 `isMos` 或连放白名单中包含新模式前缀。*

---

### Step 6: 挂载工具栏与快捷键 (Toolbar.tsx & circuit-hotkeys.ts)
📁 **文件 1**：`packages/app/src/ui/Toolbar.tsx`
* **双端元件**：直接使用通用 `CircuitElementSubmenu`（提供 H/V 四向切换）：
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
* **三端/多端元件（MOS、BJT、运放）**：需参照 `MosfetElementSubmenu`，定制包含端子级联（如 C/B/E 或 D/G/S）的下拉面板组件。
* **高亮激活映射**：在 `Toolbar.tsx` 约 120 行的 `isActive` 判断中，补充裸模式名（如 `currentToolMode === "addInductor"`）的高亮映射。

📁 **文件 2 (快捷键与旋转/镜像状态机)**：`packages/app/src/ui/canvas-panel/circuit-hotkeys.ts`
必须接入以下 **4 大状态机函数**：
* **1. 单键快速呼出 (`resolveSelectModeInitialTool`)**：
  ```ts
  if (k === "l") return "addInductor_H_Left";
  ```
* **2. 按 `R` 键顺时针旋转 (`rotateCircuitToolMode`)**：
  ```ts
  if (mode.startsWith("addInductor")) {
    if (mode === "addInductor_H_Left") return "addInductor_V_Top";
    if (mode === "addInductor_V_Top") return "addInductor_H_Right";
    if (mode === "addInductor_H_Right") return "addInductor_V_Bottom";
    return "addInductor_H_Left";
  }
  ```
* **3. 镜像对称翻转 (`flipCircuitToolModeHorizontal` & `flipCircuitToolModeVertical`)**：
  ```ts
  // 水平镜像 (Y / H 键)
  if (mode.startsWith("addInductor")) {
    if (mode === "addInductor_H_Left") return "addInductor_H_Right";
    if (mode === "addInductor_H_Right") return "addInductor_H_Left";
    return mode;
  }
  // 垂直镜像 (X / V 键)
  if (mode.startsWith("addInductor")) {
    if (mode === "addInductor_V_Top") return "addInductor_V_Bottom";
    if (mode === "addInductor_V_Bottom") return "addInductor_V_Top";
    return mode;
  }
  ```
* **4. 辅助按键直达切换 (`switchCircuitToolModeWithKey`)**：
  ```ts
  if (currentMode.startsWith("addInductor")) {
    if (k === "w") return "addInductor_V_Top";
    if (k === "a") return "addInductor_H_Left";
    if (k === "s") return "addInductor_V_Bottom";
    if (k === "d") return "addInductor_H_Right";
  }
  ```

---

### Step 7: 注册状态栏操作提示 (StatusBar.tsx)
📁 **文件**：`packages/app/src/ui/StatusBar.tsx`
1. 将新元件的前缀加入第 370 行附近的 `CIRCUIT_PLACEMENT_MODES` 数组：
   ```ts
   const CIRCUIT_PLACEMENT_MODES = [
     // ...
     "addInductor",
   ] as const;
   ```
2. 系统会自动调用 `resolvePlacementHint` 输出标准的 `点击画布放置... (R 旋转 / WASD 选朝向 / X 上下翻转 / Y 左右翻转)` 操作指引。

---

### Step 8 (可选): 同步 Python MCP 助手元件库 (components.py)
📁 **文件**：`scripts/circuit-mcp/circuit/components.py`
若需要让 Antigravity 外部 AI 桥接助手也能通过自然语言指令生成该元件，在 `components.py` 中注册：
```python
_INDUCTOR_BODY = r"""\draw[thick, line cap=round] (0,0) -- (0.15,0) arc[start angle=180, end angle=0, radius=0.1] arc[start angle=180, end angle=0, radius=0.1] arc[start angle=180, end angle=0, radius=0.1] -- (0.9,0);"""

TEMPLATES["inductor"] = ComponentTemplate(
    type="inductor",
    ports=(Port("l", 0.0, 0.0), Port("r", 0.9, 0.0)),
    tikz_body=_INDUCTOR_BODY,
    default_label="L_1",
    description="电感器 (Inductor)",
)

PIN_SUFFIXES["inductor"] = {"L": "l", "R": "r"}
DEFAULT_LABELS["inductor"] = r"$L$"
```
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
3. **关键端口必须显式声明 `coordinate`（⚠️ 严禁仅靠裸画线充当引脚）**：
   * 必须包含标准的端口命名（如 `(node_Rx.l)`, `(node_Rx.r)`, `(node_Mx.g)`, `(node_Dx.dot)`, `(node_Dx.top)`），供自动连线和引线捕捉系统使用；
   * ⚠️ **重大避坑经验（黑点端能吸 vs 引线端失灵的假象）**：
     - **错误写法**：在 scope 内只写 `\draw ... circle (0.06); \draw ... (0,0) -- (0,0.3);` 而不写 `\coordinate`；
     - **为什么看起来“有一端能吸”**：底层连线系统有一道针对实心小圆盘的几何兜底检测（`findJunctionDotAt`），只要检测到 `circle (0.06)` 会将其当成普通交点临时识别；这容易给开发者造成“不需要加 coordinate 也能吸附”的错觉；
     - **为什么“另一端绝对失灵”**：未带黑点的引线末端 `(0, 0.3)` 既没有小圆盘几何兜底，又被 scope 内部防火墙直接当成内部细节过滤掉，导致该端点的 `NodeAnchorTarget` 彻底为 0。导线工具（`W`）、磁吸光环（Halo）与引脚连线（`formatTikzWireSnippet`）完全无法识别该引线端；
     - **正确做法**：**每个对外连接端口必须显式写出 `\coordinate`**。只有声明了 `\coordinate`，导线工具才能在悬停时亮起磁吸光环，并在连线时正确输出 `(node_D1.top)` 等语义锚点，实现元件拖动时导线自动跟随机制（Wire-Follow）。
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