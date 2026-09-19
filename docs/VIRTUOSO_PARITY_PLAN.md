# Virtuoso 对齐实施计划（TikZ Editor MOS Edition）

> **目标**：让 TikZ Editor 的电路绘制**体感**对齐 Cadence Virtuoso Schematic Editor。
> **范围**：**只做绘图体验**。网表、ERC、SPICE 导出、Check and Save **明确不在范围内**（v1.1 起剔除，见 §0.5）。
> **本计划的定位**：可交给 subagent 分步执行的施工图。每步独立交付、带 e2e 验收、明确禁止越界改动。
> **替代文档**：本文件取代 Antigravity 生成的 `implementation_plan.md`（该文与代码已脱节，见附录 C）。

---

## 0. 一页纸结论

### 0.1 绘图手感的三根支柱（范围已收窄）

Virtuoso 画起来"顺手"，来自三件**纯绘图**的事，与"电气真值"无关：

| 支柱 | 具体表现 | 本项目现状 |
| :--- | :--- | :--- |
| **引脚可知** | 光标一碰引脚就能起线，绝不会"点空" | ⚠️ 编辑器自带元件**有**引脚；`circuit-mcp` 生成的电路**零引脚** ⇒ 锚点=0 |
| **交点可知** | T 型自动实心焊点；**跨越不打点** | ❌ 无 junction 概念，交点只是两条线画到一起 |
| **挂接可知** | 挪器件，导线跟着走且拐角不丢 | ⚠️ `wire-follow.ts:613-719` 已有跟随引擎；但瞬态重写会丢拐角（§S1.1） |

**关键结论：这三样全是几何问题，输出仍是纯 TikZ。**

> **v1.1 重要修正**：v1.0 曾引用 Analog Canvas 的"connectivity-aware … without treating drawing geometry as electrical truth" 作为设计信条，并据此批评"用几何反推电气是错的层"。
> **该批评只在"需要导出网表"的前提下成立。** 范围剔掉网表后，**几何推导就是正确的层** —— 不需要电气模型、不需要 sidecar、不需要碰 `WORKSPACE_VERSION` 迁移。
> 因此：Antigravity 的 `wire-segment-snap.ts`（线段投影磁吸）与 `formatJunctionDotSnippet`（焊点语句）**方向本就正确**，问题仅在于**没有接线**。详见 §S1.2 / §S2.5。

### 0.2 但现状比预期好得多（三路审计结论）

| 原本担心的 | 审计结论 | 影响 |
| :--- | :--- | :--- |
| scope 变换复合很难，引脚位置要自己算 | **求值器已经做完了**：`apply-kv.ts:732-745`（`xshift/yshift`）、`:746-769`（`shift`）、`resolveContextDelta`（`evaluate.ts:1187-1201`）链式复合，`context.namedCoordinates` 里就是世界坐标 | Phase 0 难度**大幅下降** |
| 没有"线挂在器件上"的关系 | **已有导线跟随引擎**：`wire-follow.ts:613-719` `findAttachedWiresForTransientDrag`、`isFollowableEndpoint`（:692） | Virtuoso 的 `m`=Stretch 已有半套地基 |
| 引脚规范没定 | **早定好了**：`change&add objects.md` 规定 `\coordinate (node_<标识>.<后缀>)`，`circuit-node-registry.ts` 认这套 | 无需重新设计 |
| 编辑器元件没有引脚 | **编辑器自带的元件模板本来就有 `\coordinate`**（`circuit-snippets.ts:3` 起，如 `node_Rx.l`/`.r`） | 只有 MCP 路径缺引脚 |

### 0.3 真正的断点（唯一的关键路径）

**同一件事有两条生成路径，只有一条吐引脚：**

| 生成路径 | 引脚 | 证据 |
| :--- | :--- | :--- |
| 编辑器工具栏放器件 | ✅ 有 `\coordinate` | `circuit-snippets.ts` 各模板；默认文档 `workspace-state.ts:13-26` |
| `circuit-mcp` 生成的电路 | ❌ **零个 `\coordinate`** | `apps/web/agent-sync/active-drawing.tex` 实测 `grep -c coordinate` = 0 |

`__pin-connect-probe.spec.ts:74-106` 已用测试固化此结论（`expect(anchors.length).toBe(0)`）。
**锚点 = 0 ⇒ 0-Click 起线无处可点、焊点无从判定、挪器件时导线跟不对。** 全案的瓶颈就在这。

### 0.4 对 Antigravity 方案的三个纠正

1. **`F3` 在 Virtuoso 里是"当前命令的选项表单"，不是三模循环**（官方绑定表）。用它做三模循环直接拧肌肉记忆，与目标自相矛盾。
2. **`m` 在 Virtuoso 里是 Stretch（带线一起挪）**，而现编辑器 `m` = 正交导线（`tool-config.tsx:228`）；`change&add objects.md` 还把 `M` 记为 "Multiline Wire"。方案说"原 M 键保留作连线别名"是双向撞车。
3. **"导线+焊点原子撤销"这个承诺是对的**（无需新机制），但**"Ctrl+Z 一键撤销整条多段线"是空许诺** —— 见 §S2.5。

### 0.5 范围剔除（v1.1 起）

| 剔除项 | 原编号 | 剔除理由 |
| :--- | :--- | :--- |
| 并查集连通性 → 自动网名 | S4.1 | 网名服务网表；纯绘图只需 `l` 打视觉标签（可后补，非必需） |
| ERC + Check and Save | S4.2 | 无电气模型，无从检查 |
| SPICE 网表导出 | S4.3 | 明确不在范围 |

**连带简化（这是本次剔除的最大红利）：**

- 不需要侧挂连接数据 ⇒ **不需要改 `WORKSPACE_VERSION`、不需要写迁移**（原 D2 风险归零）
- 不需要 `net` / `pin` 数据模型 ⇒ 输出保持**纯 TikZ**，编辑器仍是"绘图工具"而非"EDA 工具"
- 不需要并查集 ⇒ 移除全案唯一的图论算法

> `x` / `Shift+x` 两个键（Virtuoso 的 check / Check and Save）**退回空闲**，不再预留。

---

## 1. 现状架构速查（施工前必读）

### 1.1 三种并存的字母键位上下文

这是加 Virtuoso 键位前必须处理的架构点 —— **不是两套，是三套**：

| 上下文 | 解析入口 | 现有键位 |
| :--- | :--- | :--- |
| **选择模式呼出元件** | `resolveSelectModeInitialTool`（`circuit-hotkeys.ts:471-516`） | `w`=WireLead, `z`=nMOS, `n`=Node, `q`=pMOS, `r`=Resistor, `e`/`i`=CurrentSource, `c`=Capacitor, `v`=VoltageSource, `a`=CurrentArrow, `g`=GND, `t`=IoNode, `d`=Dot/VDD(按住 v) |
| **放置模式内切方向/锚点** | `switchCircuitToolModeWithKey`（`circuit-hotkeys.ts:318-466`） | `W/A/S/D` 切朝向, `G/D/S` 切 MOS 引脚, `H`/`Y` 水平镜像, `V`/`X` 垂直镜像, `I`/`O` 切 IO 类型 |
| **通用绘图图元** | `toolModeFromShortcut`（`tool-config.tsx:265`） | `v/n/s/l/m/a/b/p/f/r/e/c` |

调用点：`resolveSelectModeInitialTool` → `useCanvasKeyboardClipboard.ts:348` **和 `:594`（两处重复，必须同改）**；`toolModeFromShortcut` → `App.tsx:1815`。

### 1.2 编辑与撤销模型

- `EditAction` 联合类型共 **45 种**：`actions.ts:109-194`；dispatch switch：`actions.ts:242-345`。
- **已有 `connectHandle` action（`actions.ts:115`）和 `movePathAttachedNode`** —— 引脚连接不要从零造，先评估复用。
- 应用链：`applyActionWithFeedback`（`CanvasPanel.tsx:1838-1892`）→ `applyEditAction`（`actions.ts:242-345`）→ 各 applier（`edit/actions/*`）→ `replaceSpan`。
- **撤销是命令栈，同时携带 patches 与完整源码**：`HistoryEntry`（`store/types.ts:183-211`），push 于 `reducer.ts:943-944`。
- **无事务/begin-commit API**。唯一的成组原语是 `mergeKey` 合并（`reducer.ts:879-913`）：同 `mergeKey` + 同 `kind` 的相邻条目被覆盖而非追加。
- 多语句原子编辑**不需要新机制**：`pasteStatements` 已支持 `snippets: string[]`（`actions/paste-duplicate.ts:91-162`），`applyTextReplacements`（`statement-ops.ts`）支持多个不重叠替换。

### 1.3 磁吸管线

- 入口：`buildSnapContext`（`snapping/context.ts:49-129`），输入 `BuildSnapContextInput`（`types.ts:121-131`），输出 `SnapContext`（`types.ts:85-97`）。
- 候选源：`referencePoints`（:78）、`nodeAnchorTargets` 仅取 `tier==="basic"`（:91-110）、`visibleGaps`（:111-113）。
- 合并器：`collectPointGridAndGapSnaps` / `collectPointAndGridSnaps`（`snapping/index.ts:275-415`）；核心 `snapPointerWithPointsAndGrid`（`index.ts:179-221`）。
- 渲染：`setSnapLines`（`CanvasPanel.tsx:857`）→ `SnapOverlay`（`CanvasPanelView.tsx:664-670`）→ `overlays.tsx:68-160`。

### 1.4 引脚与锚点

- 引脚来源：`collectNodeAnchorTargets`（`semantic/evaluate.ts:795-870`），吃 `context.namedCoordinates`（:812）**和** `namedNodeGeometries`（:831，带 `name=` 的 `\node`）。
- 命名：按 `.` 切分 → `nodeName` / `anchor`，默认 `"center"`（`evaluate.ts:815-821`）；basic 白名单在 `evaluate.ts:796-806`。
- 渲染：`NodeAnchorOverlay`（`overlays.tsx:1303-1350`），`data-testid="node-anchor-dot"`（:1342）、`data-anchor-name`（:1345）；挂载 `CanvasPanelView.tsx:721-746`。
- 吸附：`resolveEndpointAnchorSnap`（`endpoint-anchor-snap.ts:22-140`），半径 60/20/32px，仅 `tier==="basic"`，带滞后锁定。

### 1.5 持久化与 e2e

- 存储：单 key `tikz-editor:workspace-v4`（`workspace-storage.ts:6`）；**每文档只存 `.tex` 文本，无 sidecar 槽位**。加字段须同时改 `workspace-state.ts:28` 的 `WORKSPACE_VERSION` 并写迁移（`workspace-storage.ts:112-114` 版本不符即拒）。
- 两个同步文件（`agent-sync-plugin.ts:10-13`）：`Sketch/active-drawing/active-drawing.tex` 与 `apps/web/agent-sync/active-drawing.tex`；`isTarget`（:38-41）匹配**任何**以此结尾的路径；`agent:request-code`（:56-66）**优先 Sketch 文件** ⇒ 读写可能指向不同文件。
- e2e 底座齐备：`apps/web/e2e/helpers.ts` 导出 `setSource`/`readSource`/`waitForHitRegions`/`clickHitRegionByTargetId`/`dragHitRegionByTargetId`/`dragBetweenPoints`/`selectAllSceneElements`/`readSelectionOverlayBoxSourceIds`/`expectSourceCanvasConsistency` 等。
- **现有断言模式**：`readSource` 前后字符串比对（见 `__pin-connect-probe.spec.ts:205-228`）。无专用 diff helper。
- 运行：`npm run -w @tikz-editor/web test:e2e`；本地探针配置 `playwright.dev-local.config.ts`（挂 8888 端口，免生产构建）。

---

## 2. 关键决策（需用户拍板）

| 编号 | 决策 | 建议 | 理由 |
| :--- | :--- | :--- | :--- |
| **D1** | 引脚从哪来 | **两条都做**：改 `circuit-mcp` 发射器（新电路）+ 编辑器"补引脚"命令（存量） | 只做一条则旧文档永远没法用。**已定（2026-09-12，用户授权按推荐执行）** |
| **D2** | 是否引入 sidecar 存连接数据 | ~~不引入~~ **已作废**（v1.1） | 剔除网表后不存在需要持久化的连接数据；几何推导即可 ⇒ 不碰 `WORKSPACE_VERSION`、不写迁移 |
| **D3** | 键位迁移是否接受破坏现有手感 | **零破坏**：Virtuoso 键位仅在"已选中对象"或"布线中"生效 | 三套上下文已并存，加第四层"上下文键位"比改字母表安全。**已定（2026-09-12）：取 A（上下文键位），不动字母表** |
| **D4** | 导线写出格式 | 统一走 `formatTikzWireSnippet`，**允许多点折线** | 坍缩修复与 45° 路由都需要折线；AST 侧已支持（`collectWireSegmentsFromScene` 遍历多个 `line` 命令） |

> **D3 说明**：这是全案唯一有主观成分的决策。选项 A = 上下文键位（零破坏，但要教用户"选中后 c 才是拷贝"）；选项 B = 彻底重排字母表（对齐最彻底，但现有 `change&add objects.md` 文档、教程 PDF、用户肌肉记忆全部作废）。**建议 A**。

---

## 3. 施工步骤

> **通用验收门槛（每步都要过）**：
> 1. `npm run -w @tikz-editor/web build` 零 error；
> 2. `npm run -w @tikz-editor/web test:e2e` 全量绿（含本步新增用例）；
> 3. 改动**仅限**本步"落点"列出的文件。
>
> **禁止**：跑 `--no-verify`、改 `playwright.config.ts` 的 `testDir`、动 §1 之外的架构。

---

### Phase 0 — 基线与护栏（无决策依赖，先做）

#### S0.1 建立测试基线
- **目标**：拿到改造前的真实绿/红状态，避免把既有问题记到新账上。
- **动作**：装依赖 → 跑全量 e2e → 记录失败用例与耗时。**重点确认 `__pin-connect-probe.spec.ts` 是否在跑**（`playwright.config.ts:41` 只设 `testDir`、无 `testMatch` ⇒ 它**会被默认套件执行**）。
- **交付物**：基线报告（失败用例清单 + 单次全量耗时）。
- **验收**：报告落盘，列出每条失败用例及判定（既有问题 / 环境问题）。
- **风险**：若探针 spec 因网络或浏览器缺失而挂，先修环境再往下。

#### S0.2 隔离探针 spec

> **状态：✅ 已完成（2026-09-12）** —— 已改名为 `apps/web/e2e/__pin-connect-probe.probe.ts`（后缀 `.probe.ts` 不匹配 Playwright 默认 `testMatch`），内容原样保留作 S2.3 的反例源。

- **目标**：探针是"断言 bug 存在"的临时物（`expect(anchors.length).toBe(0)`），留它会污染回归。
- **落点**：`apps/web/e2e/__pin-connect-probe.spec.ts`
- **动作**：迁移为 `docs/probes/` 下的记录，或改名为 `__pin-connect-probe.probe.ts` 使其不被 `*.spec.ts` 匹配。
- **验收**：默认套件不再执行它；全量绿。
- **风险**：别删 —— S2.3 还要拿它当反例源。

---

### Phase 1 — 交互止血与单点修复（不依赖任何决策，可并行施工）

#### S1.1 【最高性价比】修复 120 FPS 折线坍缩

> **状态：✅ 已完成并验证（2026-09-12）**
> - `types.ts:130-136` 新增 `initialPoints` 字段（`Array<{x,y}> | null`）
> - `useCanvasDragController.ts` 新增模块级纯函数 `parsePolylinePoints`（解析 `d` 的 M/L 点列；遇曲线/圆弧/闭合返回 `null` 安全回退）与 `buildTranslatedPolylineD`（只平移挂接端点，中间拐点原样保留）；捕获处填 `initialPoints`，重写处优先走折线分支
> - 新增 `apps/web/e2e/wire-follow-polyline.spec.ts`
> - **A/B 证据（在 8888 dev server 上做，免重建）**：
>   - 撤销修复 → `attached polyline collapsed into a straight segment mid-drag (points=2, expected >= 3)` —— **失败**
>   - 加上修复 → `ok` 通过
>   ⇒ 既证明 Bug 真实，也证明该用例不是空测试
> - **踩到的坑（已写进用例注释）**：被拖元素若用**纯水平/垂直线**，其 hit region 包围盒高/宽为 0，Playwright 判为 hidden ⇒ `toBeVisible` 失败。**必须用斜线**或给元素真实二维范围。

- **落点**：`useCanvasDragController.ts:987`（捕获 `initialD`）、`:1013-1022`（重写 `d`）
- **问题**：瞬态阶段用 `M x1,y1 L x2,y2` 覆盖，**丢弃全部中间拐点**。
- **关键发现**：`:987` 已经把原始完整路径存进 `initialD`（目前仅用于 `resetTransientDomTransforms`，:154-159），**里面保留着全部 `L…` 点列** ⇒ 无需重新路由，只要「解析 `initialD` 点列 → 仅平移 `movingEndpointIndex` 那个端点 → 重新拼 `d`」。
- **交付物**：保留拐角的瞬态重写。
- **验收**：新增 `apps/web/e2e/wire-follow-polyline.spec.ts`：
  1. 放一个元件 + 连一条带拐角的折线；
  2. `dragBetweenPoints` 拖动该元件；
  3. 断言拖动**过程中** DOM 里 `path[data-source-id=…]` 的 `d` **段数不变**（非仅首尾两点）；
  4. 松手后 `readSource` 的 `\draw` 拐点数与拖动前一致。
- **风险**：`movingEndpointIndex` 语义是 0/1（`wire-follow.ts:606-611`），折线时"哪端在动"要按首/末 handle 判定，别按线段序号。

#### S1.2 把磁吸孤儿模块接进主流程

> **状态：✅ 已完成并验证（2026-09-12）**
>
> **已完成的前置（`wire-routing-helper.ts` 修好了）**：
> - 该文件此前是 canvas-panel 里**唯一**用 `@tikz-editor/core` 的文件，而该包名解析到**过期的 `packages/core/dist`**，所以 `WireSegment` 拿不到（`WireSegment` 其实已在 `core/src/index.ts:62` 导出）。已统一改为邻居们都在用的源码别名 `tikz-editor/*`。
> - `collectWireSegmentsFromScene` 的判别全部写错（小写）：`el.kind !== "path"`（实际 `"Path"`）、`cmd.kind === "move"/"line"`（实际 `"M"`/`"L"`）、`path.sourceId`（实际 `path.sourceRef.sourceId`）。已按 `ScenePathCommand = M | L | C | A | Z` 修正，该函数此前**永远返回空数组**。
> - 修完 `tsc` 对这几个文件零报错。
>
> **⚠️ 接管线前必须知道的关键约束（本次读代码发现，方案原未提及）**：
> 现有磁吸机制是**逐轴**的 —— `AxisSnapCandidate` 带 `axis: "x" | "y"`，`snapPointerWithPointsAndGrid`（`snapping/index.ts:179-221`）跑两趟（先 x 后 y），只有 point 类快照能产出 `is2DSnapped`。
> 而**点到线段的投影天然是二维的**（横纵同时偏移），塞不进逐轴模型。可选的实现路径：
> (a) 为线段投影新增一种**二维候选**类型，在逐轴两趟之后单独应用；
> (b) 复用现有 `is2DSnapped` 通道，把投影点当成一个"点快照候选"投喂。
> **(a) 更干净但改动面大；(b) 改动小但要确认不与既有 point 快照互相覆盖。** 建议先做 (b) 并加坐标断言。
>
> **落点的架构修正**：`buildSnapContext`（`snapping/context.ts:49-129`）**本来就收 `sceneElements`**，所以线段收集应下沉到 **core**（与 `findNearestWireSegmentSnap` 放一起），而不是在 app 侧收集再传进去 —— 避免 app/core 分层颠倒。
>
> **本次实际落法（已按 (b') 实现并验证）**：
> - `core/src/edit/snapping/wire-segment-snap.ts`：新增 `collectWireSegmentsFromScene(elements)`（下沉到 core；曲线/圆弧断开链条、不做近似）
> - `core/src/edit/snapping/types.ts`：`SnapContext` 加 `wireSegments: WireSegment[]`；`BuildSnapContextInput` 加**可选覆盖** `wireSegments?`（专为数值验收留的无解析器入口）
> - `core/src/edit/snapping/context.ts`：`buildSnapContext` 用 `input.wireSegments ?? collectWireSegmentsFromScene(input.sceneElements)`，并按 `selectedSourceIds` / `excludedSourceIds` 过滤（**避免拖拽中的线吸附到自己**）
> - `core/src/edit/snapping/index.ts` `snapPointerWithPointsAndGrid`：**仅当逐轴两趟都没找到任何候选**时才查线段投影 —— 即"点是更具体的目标，线干是兜底"。投影本质二维，所以直接在函数顶部返回二维 `snappedPoint` + `offset`，**不进逐轴候选桶**（比新增候选类型改动面小得多）。可视化用 L 形两条 `pointer` 线，退化腿（该轴已对齐）不画
> - **app 侧删除重复的 `collectWireSegmentsFromScene`**（`wire-routing-helper.ts`），全仓只留 core 一份实现；随之移除 `SceneElement` / `WireSegment` 两个已无用的 import
>
> **验证方式（比鼠标坐标 e2e 更精确）**：新增 `scripts/check-wire-segment-snap.ts`（沿用仓库 `node --import tsx` 脚本惯例）。借 `wireSegments` 覆盖入口直接构造上下文，断言三件事：
> 1. 阈值内且落在弦内 → 投影到干线（`(3,0.3)` → 精确 `(3,0)`）
> 2. **超出阈值** → 不动（`(3,5)` 保持 y=5）
> 3. **超出线段跨度**（投影参数落在 `[0.04,0.96]` 之外）→ 不被拽回（`(4.5,0.3)` 保持 y=0.3）
>
> **A/B 证据**：把钩子的 `context.wireSegments` 换成 `[]` → `FAIL: near.y: expected 0, got 0.3`；恢复 → `OK`
>
> **回归**：`path-tools` + `core-editing` + 我的两个新用例 = **70 通过 / 9 失败，失败的 9 个与既有清单完全一致 ⇒ 零新增失败**（磁吸主路径变更未波及其它用例）

- **落点**：
  - `snapping/types.ts:121-131`（`BuildSnapContextInput`）、`:85-97`（`SnapContext`）加字段
  - `snapping/context.ts:49-129`（`buildSnapContext`）填充
  - `snapping/index.ts:275-415` / `:179-221` 消费
  - 数据源：`wire-segment-snap.ts:25` `findNearestWireSegmentSnap` + `wire-routing-helper.ts:88` `collectWireSegmentsFromScene`
- **现状**：两者**零调用点**，仅 `snapping/index.ts:62-65` 与 `core/src/index.ts:59` 有导出；`wire-routing-helper.ts` 仅被 `types.ts:19` 类型引用。
- **验收**：新增用例 —— 把导线拖到已有干线 18px 内，落点等于投影点（坐标断言，容差 < 0.5px）。
- **风险**：`buildSnapContext` 有 5 个调用点（`useCanvasElementInteractions.ts:180-191`、`useCanvasHandleInteractions.ts:206-219`、`useCanvasToolInteractions.ts:311/1013/1202`），加字段要保证旧调用点不炸。

#### S1.3 键位法则文档化 + 接入空闲 Virtuoso 键

> **状态：✅ 已完成（零冲突子集）2026-09-12**
> - 在 `App.tsx` 的非修饰键分支（紧随 `toolModeFromShortcut` 之后）加入：`u` / `Shift+u` = 撤销 / 重做（走既有 `edit.undo` / `edit.redo` 命令）、`[` / `]` = 缩小 / 放大（走既有 `view.zoom-out` / `view.zoom-in`）。
> - **全部要求 `canvasShortcutContext`（画布聚焦）**：否则在源码面板里敲 `[` `]` 会被吞掉（TikZ 选项里全是方括号），`u` 也会打不出来。
> - **`F6`（重绘）未做**：仓库里没有对应命令，**不凭空造一个** —— 留待真有"重绘"语义时再加。
> - 验证：新增 `apps/web/e2e/virtuoso-bindkeys.spec.ts`（放一个电阻 → `u` 消失 → `Shift+u` 回来；`]` 放大 → `[` 缩小，读真实 `canvasTransform.scale`）。**A/B**：禁用绑定 → 失败 `Expected: false, Received: true`；恢复 → 通过。

- **目标**：先立规则，再改键 —— 避免 `c`/`m` 互相咬。
- **落点**：
  - `circuit-hotkeys.ts:471-516`（`resolveSelectModeInitialTool`）
  - `useCanvasKeyboardClipboard.ts:348` **和 `:594`（两处重复，必须同改）**
- **本步只接零冲突键**：`u`/`Shift+u`（撤销/重做）、`[`/`]`（缩放）、`F6`（重绘）。
- **已天然对齐的**：`F` = Fit to Content（`change&add objects.md` 键位表）＝ Virtuoso 的 `f`；`w` = WireLead ≈ Virtuoso 的 `w`。**不要动。**
- **验收**：新增用例断言按键后 toolMode/视图变化；全量回归绿。
- **风险**：`F3`/`Esc` 在浏览器有默认行为，须 `preventDefault`；`[`/`]` 在文本框聚焦时不能劫持。

#### S1.4 `getNextCircuitIndex` 终结重名灾难

> **状态：✅ 已完成并验证（2026-09-12）**
> - `circuit-snippets.ts` 新增 `nextCircuitInstanceIndex(source, family)` 与 `assignUniqueCircuitInstanceIndex(snippet, source)`：从文档里已有的 `node_R<n>` 取下一个空位号；把模板占位 id（`node_Rx` / `node_Mx` / `node_Ix` / `node_Ax` / `node_Cx` / `node_Vx` / `node_IOx`）改写为唯一 id；**标签只在与家族同构时跟着改**（`$M_1$` → `$M_2$`），无关标签（`$R_D$` / `$i$` / `$V_{out}$`）不动；无占位 id 的模板（GND / VDD，属同一网络）原样返回
> - `useCanvasToolInteractions.ts:739` 调用处接入（先取原始片段，再赋唯一序号）
> - 新增 `apps/web/e2e/circuit-instance-index.spec.ts`：借测试 API 的 `dispatch`（运行时有、类型声明漏了，见 §D.3）设定 `SET_TOOL_MODE`，连放两个电阻
> - **A/B 证据（8888 dev server，免重建）**：撤销改动 → `placeholder id survived` 失败；加上 → `ok` 通过
>
> **注意**：测试里用到的 `__TIKZ_EDITOR_APP_TEST_API__.dispatch` 在 `App.tsx:1430` 运行时存在，但**没有写进 `App.tsx:1397-1427` 的类型声明** —— 这正是既有 tsc 错误之一。本次未顺手修（不属本步落点）。

- **落点**：`circuit-snippets.ts:3` `getCircuitComponentSnippet`（现吐字面 `Rx`/`Mx`/`Ix`/`Ax`）、`useCanvasToolInteractions.ts:739`（粘贴处）
- **问题**：无实例标识生成逻辑 —— 放两个电阻就得到两个 `node_Rx.l`，**命名冲突**。这正是路线图"`$M_1$` 重名灾准"。
- **动作**：插入时扫描现网源码取最大序号，生成唯一 id 并替换占位符。
- **验收**：新增用例连续放两个电阻，断言源码出现两个不同 id（如 `node_R1`/`node_R2`）且各自 `\coordinate` 齐全、无重名。
- **风险**：`node_Rx` 里的 `x` 是占位后缀还是真名字要看清模板；重命名必须覆盖**所有** `\coordinate` 与 `\node` 引用，漏一个就断连。

#### S1.5 Stamp 连续放置 + StatusBar HUD
- **对应路线图**：第一阶段 1、3。
- **交付物**：放下一个器件后保持放置态（`Esc` 退出）；底部状态栏显示当前模式与可用键位。
- **验收**：新增用例连续点击放 3 个器件；HUD 文本断言。
- **风险**：Stamp 与 S1.4 的序号生成要协同（每次落点都要取下一个序号）。

---

### Phase 2 — 引脚连接层（核心地基，依赖 D1/D3）

#### S2.1 固化引脚命名与写出格式
- **动作**：把 `\coordinate (node_<标识>.<后缀>)` 定为**唯一写出格式**，与 `change&add objects.md` 第四节、`circuit-node-registry.ts:8-29` 三方对齐。
- **注意**：`circuit-node-registry.ts:42-62` 同时容忍 `.d` 与 `_d` 两种（`node_Mx.d` / `node_x_d`），但**写出只用点号形式**，避免两套并存。
- **交付物**：决策记录 + 规范章节补进 `change&add objects.md`。
- **验收**：文档评审通过（无代码）。

#### S2.2 让 `circuit-mcp` 吐命名引脚

> **状态：✅ 已完成并验证（2026-09-12）**
>
> **改动（2 文件）**：
> - `circuit/components.py`：新增 `PIN_SUFFIXES`（端口名 → 锚点后缀）与 `pin_suffix()`。后缀沿用编辑器模板命名 —— 电阻 `l`/`r`、MOS `g`/`d`/`s`、竖直端子 `t`/`b`。
> - `circuit/builder.py`：组件 scope 内、标签之后，按 `tpl.ports` 输出 `\coordinate (node_<id>.<后缀>) at (<局部 cm 坐标>);` —— **只写局部坐标，scope 平移交给编辑器求值器**（与编辑器模板语义一致）。
>
> **不需要改校验器**：实测点号式对 `validate_drawing` **零违规** —— `COORDINATE_RE` 的正则 `[A-Za-z_]\w*` 匹配不到点号 ⇒ 点号式对校验器"不可见"，既不拦也不报。**附录 B 第 5 条结案：编辑器命名与 MOS 校验器兼容。**
>
> **验证**：
>
> | 项 | 结果 |
> | :--- | :--- |
> | 生成 M1+R1 的引脚 | `node_M1.g/d/s` + `node_R1.l/r` ✅ |
> | `validate_drawing` | **加引脚前后同为 1 条** `error:undefined-component`（器件不齐所致，与引脚无关）⇒ **零新增违规** ✅ |
> | 既有单测 93 条 | **加引脚前后同为 2 失败 1 错误**（均断言 `rotate=90`，属既有缺陷）⇒ **零新增失败** ✅（`git stash` A/B 实测） |
> | 浏览器实测 | 新增 `apps/web/e2e/mcp-pins.spec.ts`：MCP 产物在编辑器里 `node_M1` 浮出 `["d","g","s"]`、`node_R1` 浮出 `["l","r"]` ✅ |
>
> **⚠️ 运营坑**：MCP 是**常驻外部进程**，改完生成器后**已加载的 MCP 工具仍跑旧代码** —— 必须重启会话（或其进程）才生效。本次验证用 python 直调 `build_circuit` 绕开。
>
> **⚠️ 覆盖面**：本步只让**新生成**的电路带引脚。**存量**文档仍无引脚，需 S2.3（本次已顺手用生成器重写了 `apps/web/agent-sync/active-drawing.tex` 使其带引脚）。

- **落点**：`scripts/circuit-mcp`（生成器侧发射器）
- **动作**：每个器件模板输出命名 `\coordinate`，引脚局部坐标参照 `circuit-snippets.ts` 已有模板（如电阻 `node_Rx.l`/`.r`，MOS `node_Mx.g`/`.d`/`.s`）。**scope 平移交给求值器**（`apply-kv.ts:732-745`），只写局部坐标。
- **验收**：
  1. 用 MCP 生成 M1 + R1；
  2. `readSource` 断言含 `\coordinate`；
  3. `waitForHitRegions` 后锚点数 > 0（`node-anchor-dot`）。
- **风险**：MCP 是外部进程，改动需重启会话才生效；先确认它是否与 `circuit-snippets.ts` 共用模板，能共用就别写第二份。

#### S2.3 编辑器侧"补引脚"命令（存量文档）
- **目标**：给零 `\coordinate` 的存量电路（如当前 `active-drawing.tex`）注入引脚。
- **动作**：从 `\draw` 几何 + 器件模板反推引脚局部坐标 → 经现有求值器变换得到世界坐标 → **重写源码注入 `\coordinate`**。
- **简化点**：变换复合**不用自己算** —— `resolveContextDelta`（`evaluate.ts:1187-1201`）已链式处理父→子变换。
- **交付物**：一条可撤销的编辑命令（单 `EditAction`，故单步撤销）。
- **验收**：对无引脚文档执行命令，锚点数 **0 → >0**，且 `clickHitRegionByTargetId` 能点中；几何位置与原有 `\draw` 端点吻合。
- **风险**：这是全案最难一步 —— 反推本质是模式识别（哪段 `\draw` 是漏极引线）。**必须限定为"只识别已知器件模板的几何签名"**，识别不出就不动，绝不猜。宁可漏，不可错。

#### S2.4 0-Click 引脚起线

> **状态：❌ 已废弃（2026-09-12），不实施。**
>
> **废弃理由（两层，都经实测）**：
> 1. **加上修饰键之后它没有任何收益。** 用户选择保守方案（修饰键门控）后，`Shift+点引脚` 与 `M 再点引脚` **按键次数完全相同**。而"0-Click"这个设想的价值本来就在于**省掉那一次输入**——门控一加，价值归零。
> 2. **激进版（无条件按引脚即起线）不可取**：引脚紧贴器件本体，会让"拖器件"变成"起线"。而且实测发现**引脚圆点只在绘图工具激活时才显形，select 模式下根本不显形**（Antigravity 自己的探针也先 `activateLineTool` 才去 hover），要支持激进版还得额外放开 select 模式的引脚显形 —— 徒增改动面与风险。
>
> **更重要的判断**：**Virtuoso 本身就是"先按 `w` 再连线"**。现有流程（按 `M`/`W` → 点引脚吸附起线）**已经对齐 Virtuoso**，S2.4 并不是对齐 Virtuoso 的必需项 —— 它是 Antigravity 方案里的额外发挥。本计划继承它属判断失误，现予撤销。
>
> 本次已实现并随后**完整还原**（避免留下死代码），未在仓库保留任何 S2.4 痕迹。

- **落点**：`useCanvasToolInteractions.ts:488`（`addOrthoWire` 分支）
- **动作**：悬停引脚（`resolveEndpointAnchorSnap` 已给 `visibleAnchors`）即可按下起线，无需先切工具；对应 Virtuoso 的 `w` 语义。
- **验收**：新增用例从 `M1` 漏极拖到 `R1` 上端，`readSource` 断言新增一条 `\draw` 且两端点分别等于两引脚世界坐标。
- **风险**：现有 `addOrthoWire` 是"点一次出一段"的多点状态机（`useCanvasToolInteractions.ts:488-535`），改成"按下即起线"要保留原有中继点行为。

#### S2.5 导线 + 焊点原子提交

> **状态：✅ 已完成并验证（含自动化覆盖，2026-09-12 补齐）**
>
> **为什么钩在"端点落点"而不是"吸附结果"**：正交导线是**多点**构建，而且会把你吸附到的点**正交化**（`nextPoint` 一边坐标取自指针、一边取自上一点），所以"吸附到干线中段"这件事在中间几次点击里会被拐角吃掉。算下来真正落在干线上的是**最后那段竖直/水平段的落点**，所以判定必须打在 `nextPoint` 上，而不是 `resolvedStart` 上。
>
> **core（已实现 + 数值验证）**：
> - `findWireSegmentAtPoint(point, wires, toleranceWorld)`：判定某点是否落在既有线段上、且**不在两端**（复用同一套 `[0.04, 0.96]` 跨度护栏 ⇒ **普通拐角不会被误判成 T 型**）
> - 已从 `snapping/index.ts` 桶与 `core/src/index.ts` 顶层导出（连带 `collectWireSegmentsFromScene`）
>
> **app（已接好，未自动覆盖）**：`useCanvasToolInteractions.ts` 正交导线提交处 —— 命中 host 就把 `formatJunctionDotSnippet(nextPoint)` 追加进**同一个** `snippets` 数组 ⇒ 一次 `Ctrl+Z` 同时撤掉线段与焊点。容差 `JUNCTION_TOLERANCE_WORLD = 0.1`（世界单位 pt，≈0.0035cm）：投影是数学精确的，这个值只需吸收浮点噪声，**远低于 0.01cm 的写出精度与 20px 的吸附阈值**，所以"离得近"永远不会被误判成"在上面"。
>
> **数值验证（`scripts/check-wire-segment-snap.ts`，A/B 已过）**：
> | 用例 | 期望 | 结果 |
> | :--- | :--- | :--- |
> | 干线中段 | T 型 | ✅ |
> | 干线上的浮点噪声（0.0001pt） | T 型 | ✅ |
> | 离干线 0.3pt | **不是** | ✅ |
> | 共享拐角（干线起/止两端） | **不是** | ✅ |
> | 越过干线终点 | **不是** | ✅ |
>
> **A/B**：把跨度护栏放宽成 `t<0 \|\| t>1` → 两个"共享拐角"用例立刻**误判为 T 型**（`expected host=false, got true`）；恢复 → `OK`。
>
> **✅ 原"诚实的缺口"已关闭**：新增 `apps/web/e2e/junction-dot.spec.ts`（3 用例），**3 通过**。
>
> **怎么绕开 world→screen 换算的**（原以为这是不可自动化的原因）：**不需要换算。** 正交路由的拐角取 `(start.x, end.y)`，所以只要**两次点击屏幕 x 相同**、第二次**落在干线上**，发出的那段腿末端就**精确压在干线上**。取干线命中区的 `boundingBox()` 中心，向上偏移 150px 作为起点即可。
>
> | 用例 | 断言 | 结果 |
> | :--- | :--- | :--- |
> | 落在干线上 | 写出线段 **且** 写出焊点 `\draw[line width=0.32mm, fill=black] (2.00,0.00) circle (0.06);` | ✅ |
> | 一次撤销 | `edit.undo` 后**线段与焊点同时消失**（源码回到只有干线） | ✅ |
> | 落在空白处 | **不写**焊点（防"总是打点"） | ✅ |
>
> **手动验证**：贴一条长横干线 → 按 `M` 起正交导线 → 第一次点**干线上方** → 第二次点**干线下方**（竖向为主，让它竖直落线）→ 看源码面板是否出现 `\draw[line width=0.32mm, fill=black] (x,y) circle (0.06);`，且**按一次 Ctrl+Z 时线段与焊点一起消失**。

- **落点**：`useCanvasToolInteractions.ts` 导线提交处（`pasteStatements` 调用点）
- **动作**：把导线与焊点塞进**同一个** `snippets` 数组。焊点语句用 `formatJunctionDotSnippet`（`wire-routing-helper.ts:81`，已验证与方案文档一致：`\draw[line width=0.32mm, fill=black] (x,y) circle (0.06);`）。
- **机制确认**：一次 action 派发 = 一个 `HistoryEntry` = 一步撤销（`reducer.ts:943-944`），**无需新事务机制**。
- **验收**：一次 `Ctrl+Z` 后导线与焊点**同时消失**。
- **风险**：若同时给新 action kind，**必须补 `reducer.ts:856-872` 的 historyKind 映射** —— 未知 kind 会**静默落到 `"resize"`**。

#### S2.6 上下文键位补齐（依赖 D3）
- **目标**：补上 Virtuoso 的 `c`（拷贝）、`m`（Stretch）、`q`（查询）、`r`/`Ctrl+r`/`Shift+r`（旋转/翻转/镜像）、`l`（打网名标签，Phase 4 填实）。
- **实现方式**：**仅在"已选中对象"时生效**的上下文键位层，不动放置模式的方向键（`switchCircuitToolModeWithKey` 那套 `W/A/S/D`）。
- **验收**：
  - 选中实例后 `c` = 拷贝、`m` = 带线移动（复用 S1.1 的折线保留）、`q` = 属性面板；
  - 未选中时这些键的**原有行为不变**（回归用例覆盖）。
- **风险**：`c` 与 `m` 在"选择模式呼出元件"层已被占用（电容/正交导线）。上下文层必须在 `resolveSelectModeInitialTool` **之前**分流，且两处调用点（`:348`/`:594`）同改。

---

### Phase 3 — 布线体验（依赖 Phase 2）

#### S3.1 `F3` = 当前命令选项表单（Virtuoso 语义）

> **状态：⏳ 未做（2026-09-12）**。原因：**仓库里根本没有"命令选项表单"这个 UI**，凭空造一个表单属于新功能而非对齐；而三模/朝向用 `Shift+F3` / `Space` 已经能用（见 S3.2）。**`F3` 目前仍然什么都不做** —— 等真有选项表单可承载时再绑定，不要先占坑。

- **落点**：键位层
- **动作**：`F3` 绑定"当前命令的选项表单"（Virtuoso 官方语义）；三模循环改到 `Shift+F3` 或右键菜单。
- **验收**：布线中按 `F3` 弹出当前命令选项；`Shift+F3` 循环三模。
- **风险**：**这是对 Antigravity 方案的有意纠正**，会与既有用户习惯冲突，需在 HUD 里明示。

#### S3.2 三模路由接入 emitter

> **状态：✅ 已完成并验证 2026-09-12**
>
> **先补了数学验收（原方案列为风险，见附录 B 第 1 条）**：新增 `scripts/check-wire-waypoints.ts`，把 `computeWireWaypoints` 三种模式逐点断言，**重点验 45° 的对称性**（45° 段 |Δx| == |Δy|；前后两个 stub 相等 —— 这正是 StrongArm 交叉对要的对称）。A/B：把 stub 从 `(absDx-absDy)/2` 改成整份 → 形状与 stub 断言立刻失败。
>
> **按键（放在 `useCanvasKeyboardClipboard` 的按键处理器里，`defaultPrevented` 守卫之前，与重新起线那条同区）**：
> | 键 | 作用 |
> | :--- | :--- |
> | `Shift+F3` | 循环 正交 → 45°斜角 → 任意角 |
> | `Space` | 循环拐角朝向 自动 → 先横(HV) → 先竖(VH) → 自动 |
>
> 只在**导线草稿存在时**生效（不抢占其它模式的按键）。草稿值经 **ref** 读取，避免闭包陈旧（这是附录 E.1 的教训）。
>
> **提交路径**（`useCanvasToolInteractions.ts` 正交导线分支）：
> - 用 `computeWireWaypoints` 取代写死的单段正交；写出统一走 `formatTikzWireSnippet`
> - **正交保持"点一次出一段"的老手感**（`waypoints.slice(0,2)`），**45°/任意角一次走完整条路径**再从末端继续 —— 这样不破坏既有习惯
> - **不显式选朝向时，沿用历史的"拐角跟位移大的那一轴走"规则**（不是硬编码 HV），显式选了才以它为准
> - 草稿更新时**透传 `routingMode` / `orientation`**，否则每次点击都会把模式重置
>
> **踩到的坑**：`routingMode` 初值是 `undefined`（隐式正交），而循环链只判三个字面值 ⇒ 第一按落进 else、变成"正交→正交"的**空转**。修法：先 `?? "orthogonal"` 归一化再循环。**这个 bug 是 e2e 抓出来的，不是看代码看出来的。**
>
> **验证**：新增 `apps/web/e2e/wire-routing-modes.spec.ts` —— 默认(自动)朝向的已提交段两点共 y；`Space`×2 选 VH 后两点共 x；`Shift+F3` 后路径为 **4 点**且中段严格 45°、非退化。**A/B**：禁掉模式切换 → 45° 用例失败 `Expected: 4, Received: 2`；恢复 → 通过。
>
> **回归**：`74 通过 / 9 失败`，9 个与既有清单一致 ⇒ 零新增失败。

- **落点**：`wire-routing-helper.ts:18` `computeWireWaypoints` 取代 `useCanvasToolInteractions.ts:488` 写死的单段正交；写出统一走 `formatTikzWireSnippet`（:68）。
- **验收**：三模各画一次，断言折角数与走向（HV/VH）正确。
- **风险**：`computeWireWaypoints` 的 `octagonal45` 分支（:47-59）未经验证，需先用坐标断言锁死数学正确性再接入 UI。

#### S3.3 T 型焊点 / 跨越不打点
- **动作**：落点命中已有干线时，在交点**画出**实心焊点（`formatJunctionDotSnippet`，`wire-routing-helper.ts:81`），与导线同一次原子提交；**跨越（crossing）不打点**。
- **说明**：v1.1 起焊点**只是画出来的一条 TikZ 语句**，不再产出"junction 数据记录"（那本是为并查集服务的，已随网表一起剔除）。故本步是 §S2.5 的**判定侧**，可与它合并实现。
- **验收**：T 型接入后源码出现焊点语句；两条线十字交叉后源码**不**出现焊点语句。
- **风险**：T 型与跨越的区分靠容差，是经典误判源（点偏 1px 就判错）—— 容差须单测覆盖。

#### S3.4 引脚光环 overlay

> **状态：✅ 已完成并验证 2026-09-12**
>
> **先查清了现状（省了一次白做）**：overlay 里**早就有**每个可见锚点的圆点、以及"已吸附"时的放大态 + 十字，而且**已经有 `onAnchorPointerDown` / `onAnchorClick` / `onAnchorHoverChange` 三个钩子**。但 —— `CanvasPanel.tsx` 只在 `pendingNodePositionTargetPick` 为真时才把它传下去（那是"给节点挑定位目标"的流程）。**也就是说正常画线时引脚圆点纯装饰、不可点**。所以本步的范围就是**视觉可发现性**，不是新交互。
>
> **实现**：`overlays.tsx` 在每个锚点圆点**下面**加一圈光环（`data-testid="node-anchor-halo"`），已吸附时更亮并加 CSS 脉冲；`CanvasPanel.module.css` 加 `.nodeAnchorHalo` / `.nodeAnchorHaloSnapped` / `@keyframes nodeAnchorHaloPulse`。**光环 `pointer-events: none`** —— 它比圆点大，绝不能挡住点选（用例里有断言）。
>
> **验证**：新增 `apps/web/e2e/pin-halo.spec.ts` —— 激活导线工具 → 悬停显形 → 断言光环存在、`pointer-events` 为 `none`、悬停引脚时**恰好一个**光环标记为 `data-anchor-snapped="true"`。**A/B**：去掉光环 → `haloCount: 0` 用例失败；恢复 → 通过。
>
> **⚠️ 测试基础设施的教训（重要，已写进记忆）**：**引脚显形半径很小（60px ÷ zoom），而引脚在引线的端点**。所以 e2e 里 hover **hit region 的中心**根本碰不到引脚 —— 长线段上必然失败。必须**沿线段采样多个点、靠近端点**去 hover。此前那个引脚用例的"找不到锚点"就是这个原因，不是功能坏。

- **落点**：`overlays.tsx:1280-1350`、挂载 `CanvasPanelView.tsx:721`
- **验收**：悬停引脚出现光环；截图人工确认 + 断言 overlay 节点存在。

#### S3.5 移动后重路由：正交化 + 避让（**用户 2026-09-12 提出，明确"以后再做"**）

> **用户原话**：「当我移动之后原本的直线可以变成正交线，而且可以绕开元件，避免和其他的线重合」。

- **现状**：拖动元件时只有**附着端点跟随、既有拐角保留**（见附录 F），线不会重新走线 ⇒ 斜拉过去就是一条斜线。
- **目标**：移动结束后，把受影响导线**重算为正交折线**，并绕开器件与既有导线。
- **基础设施可复用**：S3.2 的 `computeWireWaypoints`（`wire-routing-helper.ts:18`，已修好类型）提供正交/45°/任意角三种走线；避让需要额外的**障碍几何**（器件包围盒 + 既有线段），当前不存在，是本步的主要新增。
- **⚠️ 设计取舍（务必保留）**：Cadence 社区有专帖抱怨 **Virtuoso 的自动重路由把图搞得一团糟**（见附录 F.1）。因此本步**不要做成不可控的魔法**：
  1. 重路由结果应当**可预览、可撤销**（一次 `Ctrl+Z` 回到移动前）；
  2. 应提供**关闭开关**（或"仅正交化、不避让"的中间档）；
  3. 避让失败时**宁可保持原样**，不要产出更乱的走线。
- **验收**：拖动后断言折角数增加且每段都是正交（Δx 或 Δy 为 0）；导线不与器件包围盒相交；一次撤销回到移动前。

---

### Phase 4 — 器件与图元补全（纯绘图体验）

> **v1.1 变更**：原 Phase 4 的并查集网名 / ERC / SPICE 导出三项（旧 S4.1–S4.3）**已剔除**，见 §0.5。
>
> **优先级提示**：本阶段**几乎不依赖前置**（除 S1.4 的序号生成），且属于"**能不能画**"而非"画得爽不爽"—— 器件不齐就画不出目标电路。**建议与 Phase 2 并行开工**，不要排在最后。详见 §4 的推荐执行序。

#### S4.1 器件补齐（BJT / 电感 / 运放 / 电位器 / 开关…）
- **动作**：**直接走 `change&add objects.md` 第五节的 6 步流水线**（现成 SOP，无需另立规范）：`types.ts` → `capabilities.ts` → `circuit-snippets.ts` → `circuit-node-registry.ts` → `useCanvasToolInteractions.ts` → Toolbar / `circuit-hotkeys.ts`。
- **键位**：该文档第二节已列出空闲键推荐 —— `L`=电感、`B`=BJT、`O`=运放、`P`=电位器、`K`=开关、`J`=JFET、`U`=IC。
- **冲突预警**：文档把 `L` 推荐给电感，但 Virtuoso 的 `l` 是"打导线标签"。**D3 选 A（上下文键位）则无冲突**；选 B 则二选一。
- **验收**：每个新器件按 §S2.1 命名规范带 `\coordinate` 引脚；`waitForHitRegions` 后锚点可吸附；插入序号唯一（不依赖 S1.4 也须自测）。
- **风险**：`change&add objects.md` 第一节要求"新元件 5 大要素必须主动向用户确认"（插入锚点 / 旋转 / 镜像 / 标签 / 键位）—— **派 subagent 前必须先把这 5 项问清**，否则会产出一批不符合用户直觉的符号。

#### S4.2 VDD Rail 可拉伸粗总线 + NoConnect 悬空叉号
- **对应路线图**：第二阶段 3、4。
- **动作**：VDD 粗总线支持拖拽拉伸、抽头数随长度增减；悬空端点标注叉号。
- **验收**：拉伸时抽头间距保持、抽头数与长度关系正确；NoConnect 标记可吸附到引脚。
- **风险**：VDD Rail 是"一条线多个抽头"，会引入**线段与抽头的父子关系** —— 这是本计划里最接近"需要新数据结构"的一处，开工前先确认能否用纯几何（重复的短垂线）表达而不建模型。

---

## 4. Subagent 派发契约

派发任何一步时，用如下模板，**不要让 subagent 自行发挥**：

```
任务：执行《Virtuoso 对齐实施计划》第 <Sx.y> 步。
必读：docs/VIRTUOSO_PARITY_PLAN.md 的 §1（现状架构）与该步全文。
允许改动：仅该步"落点"列出的文件。越界即失败。
前置：先跑 npm run -w @tikz-editor/web test:e2e 确认基线绿。
必须交付：
  1. git diff（仅落点文件）
  2. 该步"验收"对应的 e2e 用例（新增或修改），实际运行输出
  3. 若发现计划与代码不符 —— 报告，不要静默改计划
禁止：--no-verify、改 playwright.config.ts 的 testDir、顺手重构落点之外的代码
```

**依赖顺序（硬约束）**：S0.1 → S0.2 → {S1.1, S1.2, S1.3, S1.4, S1.5}（相互独立，可并行）→ S2.1 → {S2.2, S2.3} → S2.4 → S2.5 → S2.6 → S3.x ／ S4.x（此后两支线互不依赖，可并行）

**推荐执行序（按"绘图体验"价值排序 —— 与阶段编号不同，派活请按此表）**

| 序 | 步骤 | 为什么排这儿 |
| :--- | :--- | :--- |
| 1 | **S1.1** 折线坍缩 | 纯收益、不依赖任何决策，且已查明 `initialD` 里留有全部拐点 —— 最便宜的正确性修复 |
| 2 | **S1.4** 唯一序号 | 不修则每放第二个器件就重名，属"能不能用"的门槛 |
| 3 | **S4.1** 器件补齐 | 器件不齐就画不出目标电路，别的体验无从谈起（**可与 Phase 2 并行**） |
| 4 | **S2.1 → S2.2** 引脚落地（MCP 路径） | 打通"引脚可知"主干，是 0-Click 起线的前提 |
| 5 | **S2.5** 自动焊点 | 视觉收益最直接，机制现成（`pasteStatements` + `formatJunctionDotSnippet`） |
| 6 | ~~**S2.4** 0-Click 起线~~ | **已废弃**（见该步）：加修饰键后与"按 M"等价、无收益；且 Virtuoso 本身就是先按 `w`，现有流程已对齐 |
| 7 | **S1.2** 干线磁吸 | 与 0-Click 互补；孤儿模块已写好，只差接线 |
| 8 | **S1.3 + S2.6** 键位 | 手感对齐，但改动面最大，放后面稳妥 |
| 9 | **S3.x + S1.5 + S4.2** 三模 / Stamp / HUD / 总线 | 锦上添花 |
| 10 | **S2.3** 存量补引脚 | 全案最难（本质是模式识别），收益只覆盖旧文档 —— **建议最后做，或干脆不做** |

> **S2.3 特别提示**：这是全案唯一"可能做不完"的一步。若时间紧，可只做 S2.2（新电路自带引脚）+ 一个"识别不出就提示用户手动标注引脚"的兜底，放弃自动反推 —— 用户画新电路时不会碰到这个坑。

---

## 附录 A：陷阱清单（每条都有出处，施工前逐条确认）

1. **探针 spec 会随默认套件跑**：`playwright.config.ts:41` 只设 `testDir`、无 `testMatch`；`__pin-connect-probe.spec.ts` 内含 `expect(anchors.length).toBe(0)`，**是"断言 bug 存在"的测试**。修完必须同步改它，否则回归永远红。
2. **键位分支有两处重复**：`useCanvasKeyboardClipboard.ts:348` 与 `:594`，改一处必炸另一处。
3. **未知 action kind 静默降级**：`reducer.ts:856-872`，未映射的 kind 落到 `"resize"`，不报错。
4. **加持久化字段要写迁移**：`WORKSPACE_VERSION`（`workspace-state.ts:28`）不符即拒（`workspace-storage.ts:112-114`）。**D2 建议不引入 sidecar，正是为绕开这条。**
5. **两个 `active-drawing.tex`**：`isTarget`（`agent-sync-plugin.ts:38-41`）匹配任何以此结尾的路径；`agent:request-code`（:56-66）优先 Sketch 文件 ⇒ 读写可能不一致。历史上已被此坑误导过一次。
6. **器件 id 是字面占位符**：`circuit-snippets.ts` 里写死 `Rx`/`Mx`/`Ix`/`Ax`，放两个即重名（S1.4 处理）。
7. **两条生成路径不等价**：编辑器模板**有** `\coordinate`（`workspace-state.ts:13-26`），MCP 输出**没有**。任何"引脚相关"的改动两条路都要验。
8. **坐标格式统一**：`formatTikzWireSnippet`（`wire-routing-helper.ts:68`）用 cm 两位小数（`formatCm`，`PT_TO_CM = 28.4527559`），与现有导线写法（`toFixed(2)`）一致 —— 但要统一到 helper，禁止再各写一份。
9. **patch 逻辑分两层**：`source-patches.ts` 仅 core 内部用（`actions.ts:352`）；app reducer 直接存 patches（`reducer.ts:812/888/919-920`）。改 patch 别认错层。
10. **`buildSnapContext` 有 5 个调用点**：加字段必须保证旧调用点不炸。

## 附录 B：待验证假设（施工中优先证伪）

1. ~~`computeWireWaypoints` 的 `octagonal45` 分支数学是否真的对称正确~~ —— **已解决（2026-09-12，S3.2）**：`scripts/check-wire-waypoints.ts` 逐点断言，45° 段 |Δx| == |Δy|、两 stub 相等，A/B 已验证断言有效。
2. `connectHandle`（`actions.ts:115`）能否复用于引脚连接，还是只为"路径接节点"设计 —— **S2.4 开工前必须先读 applier**。
3. `wire-follow.ts` 的 `isFollowableEndpoint`（:692）对**折线**端点是否成立 —— S1.1 的成败前提。
4. MCP 生成器是否与 `circuit-snippets.ts` 共用模板 —— 若共用，S2.2 成本骤降。
5. 编辑器原生元件的引脚命名与 MOS 校验器（`validate_drawing`，要求 `node_<id>_<d|g|s>`、禁顶层全局 `\coordinate`）是否兼容 —— **本计划未验证此项**，但它是"编辑器产出能否过自己校验门"的关键，须尽早确认。

## 附录 C：为什么这份文档取代 Antigravity 的 `implementation_plan.md`

| 问题 | 证据 |
| :--- | :--- |
| 文档已与代码脱节 | 标 `[NEW]` 的 `wire-segment-snap.ts` **已存在**；`WireRoutingMode` 实际落在 `wire-routing-helper.ts:6` 而非文档说的 `store/types.ts` |
| 模块建了但没接线 | `findNearestWireSegmentSnap` / `computeWireWaypoints` / `formatJunctionDotSnippet` **零调用点** |
| 关键路径缺失 | 未提"引脚不可寻址"这一根本断点（`active-drawing.tex` 零 `\coordinate`） |
| 键位与 Virtuoso 冲突 | 用 `F3` 做三模循环（Virtuoso 中 `F3` = 选项表单）；保留 `M` 作连线（Virtuoso 中 `m` = Stretch） |
| 验证计划不成立 | 仅 `npm run build` + 5 项手工点击；仓库已有 19 个 e2e spec 与可用 Playwright 环境未用 |
| 承诺过头 | "Ctrl+Z 一键撤销整条线" —— 多点折线目前每次点击一步撤销 |

---

## 附录 D：环境与基线发现（2026-09-12 实测，S0.1 产出）

### D.1 跑 e2e 必须先摘掉系统代理（否则测试根本起不来）

机器上设了 `HTTP_PROXY` / `HTTPS_PROXY = http://127.0.0.1:7897`（Clash 类代理）。后果：

- Playwright 的 webServer 自检会走代理，代理对任何本地端口都返回响应 ⇒ Playwright 误判 **"端口已被占用"**，报错 `http://127.0.0.1:4173 is already used`。**换端口无用**，4173/4199 都一样；TCP 层实测端口是空的（`ECONNREFUSED`）。
- 浏览器自身也可能把 `127.0.0.1` 的流量送进代理，测试无法进行。

**正确跑法**（本条已写进 `apps/web/playwright.local.config.ts` 的使用方式）：

```bash
cd apps/web && env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy NO_PROXY=127.0.0.1,localhost npx playwright test --config playwright.local.config.ts
```

### D.2 两个 spec 在改动前就已无法通过（既有缺陷，非本次引入）

| Spec | 症状 | 根因 |
| :--- | :--- | :--- |
| `__pin-connect-probe.spec.ts` | `expect(anchors.length).toBe(0)` —— **断言 bug 存在** | Antigravity 的临时探针。`playwright.config.ts:41` 只设 `testDir`、无 `testMatch`，所以它**会随默认套件执行** |
| `rectangle-resize-rewrite.spec.ts` | `Cannot find package 'tikz-editor' imported from packages/app/src/edit-analysis-manager.ts` | `tikz-editor/*` 是**纯路径别名**（指向 `packages/core/src`，全仓 341 处使用，**没有同名包**），只在 `apps/web/tsconfig.json` 里定义，而该 tsconfig 的 `include` 仅 `["src"]`。Playwright 的 node 侧加载器从 `packages/app/src/` 向上找不到该路径映射 ⇒ 解析失败 |

**影响**：S0.1 的"全量绿基线"**当前不成立**。可用的回归门 = 排除这两个 spec 后的套件（已在 `playwright.local.config.ts` 的 `testIgnore` 里落实）。

**已解决（用户批准方案 A，2026-09-12）**：在仓库根新增 `tsconfig.json`，承载与 `apps/web/tsconfig.json` 相同的 `paths` 映射（`tikz-editor/*` 指向 `packages/core/src/*`）。Playwright 从 `packages/app/src/**` 向上即可找到该映射 ⇒ `rectangle-resize-rewrite.spec.ts` 恢复可加载。该文件 `files: []`，自身不编译任何东西，也不影响 `packages/*/tsconfig.json` 各自的构建。

### D.3 仓库不做类型检查，既有 tsc 错误一批

`vite build` 走 esbuild，**不跑类型检查**。用 `apps/web/tsconfig.json` 跑 `tsc --noEmit` 会报出**一批与本次改动无关的既有错误**，涉及 `App.tsx`、`useCanvasKeyboardClipboard.ts`、`useCanvasToolInteractions.ts`、`capabilities.ts`、`editor-commands.ts`、`StatusBar.tsx`、`svg-import.ts`、`paste-cluster-builder.ts`、`useCanvasHandleInteractions.ts`、`useCanvasDragController.ts:453/1454` 等。

**含义**：`tsc 零 error` **不能**作为验收门槛（会把既有债算到新账上）。验收以 e2e 为准。

### D.4 Antigravity 遗留的 `wire-routing-helper.ts` 本身类型就是错的

该模块被标为"已写好"，但 tsc 报出 8 处错误：

- `@tikz-editor/core` 并没有导出 `WireSegment`（`wire-routing-helper.ts:4`）
- 场景元素判别用了小写：`el.kind !== "path"`（实际是 `"Path"`）、`cmd.kind === "move"`（实际是 `"M"`）⇒ `wire-routing-helper.ts:92-107` 全部落空，`collectWireSegmentsFromScene` **永远返回空数组**

**结论**：S1.2 接线前**必须先修这个模块**，不能直接引。这条已并入 §S1.2 的前置条件。

### D.5 机器上跑着两套 dev server

`npm run dev` 起了两条链，vite 分别占 **8888**（PID 18752）与 **8889**（PID 10364）。另有无关第三方进程 `com.vortex.helper.exe`（PID 44108）在反复尝试连接本地端口。**本次工作未终止任何用户进程。**

### D.6 那批 e2e 失败是**既有的**（2026-09-12 归因实测，结论确定）

首轮全量跑出 35 失败 / 152 通过，集中在 `canvas-text-editing.spec.ts`（数学文本渲染几何）与 `core-editing.spec.ts`（拖拽/右键菜单），几乎全部卡在 ~10-17s 的 expect 超时。

**归因方法**：把全部 WIP 改动（我加的 + Antigravity 留下的，共 6 个路径）用 `git stash push -u -- <paths>` 撤回 HEAD，再跑其中一个代表性失败用例 `canvas-text-editing.spec.ts:718`。

**结果**：**回到 HEAD 后仍以完全相同的错误失败**（`Expected: > 1, Received: 0`）⇒ **这批失败与本次改动无关，属仓库/环境既有状态。**

**已排除的其他假设**：曾怀疑是"摘掉代理导致 MathJax CDN 拉不到"，但**保留代理 + `NO_PROXY=127.0.0.1,localhost` 重跑同一用例依然失败**，故与代理无关。

**因此本计划的验收口径为「不新增失败」**：以既有失败清单为基线，每步只要求不引入新失败项，不强求"全量绿"。

### D.7 跑 e2e 的两种配置及其适用面

| 配置 | 用途 | 说明 |
| :--- | :--- | :--- |
| `playwright.dev-local.config.ts`（挂 8888/8889 dev server） | **快速 A/B** | 无 webServer、免构建，源码改动经 HMR 立即生效 ⇒ 验证某修复时 `git stash` 掉源码即可拿到"失败"对照。**秒级**，本次 S1.1/S1.4 的 A/B 都走这条 |
| `playwright.local.config.ts`（4199，生产构建 + `vite preview`） | 权威回归 | 需 `reuseExistingServer: true` 配合手工常驻 preview；一次构建约 2 分钟 |

**注意**：跑基线期间**不要编辑源码** —— dev server 实时吃改动，会污染结果。

## 附录 E：施工中额外修复的既有缺陷（非计划内，用户报障）

### E.1 画完一条连线后再按 `M`，起点被锁定为上次终点（2026-09-12，已修 + 有回归用例）

**症状**（用户实测报告）：画完一条连接线后按 `M`，新线的起点被自动锁定在上一条正交导线的终点，下一次点击变成"继续延长上一条线"。

**根因是两个缺陷叠加，缺一不可**：

1. **`setOrthoWireDraft` 从未被解构。** `useCanvasKeyboardClipboard` 的 args 类型声明了它（`:83`）、`CanvasPanel` 也传了（`:3181`），但**函数体从未解构** ⇒ 函数体里所有 `setOrthoWireDraft(...)` 都是未声明标识符，运行时抛 `ReferenceError`，事件处理器当场中断（`preventDefault` 都没跑到）。
   - **旁证**：`tsc` 一直在报 `useCanvasKeyboardClipboard.ts:478: Cannot find name 'setOrthoWireDraft'` —— 这是既有的 tsc 错误之一，此前被当成"既有噪声"忽略了。
   - **连带影响**：**既有的 `Esc` 收线分支（`:478`）也一直在抛异常** ⇒ **`Esc` 从来没真正清掉过导线草稿**。用户"没有别的收线办法"正是这个原因。
2. **`onInteractionPointerDown` 的 useCallback 依赖数组缺 `args.orthoWireDraft`**（`useCanvasToolInteractions.ts` 依赖数组末段）。闭包捕获的是旧草稿值 ⇒ 即使状态被清空，点击处理器仍读到旧的草稿，于是继续延长。

**修复**：① 补上 `setOrthoWireDraft` 解构；② 依赖数组补 `args.orthoWireDraft`；③ 在 `useCanvasKeyboardClipboard` 的按键处理器里、**`defaultPrevented` 守卫之前**（App.tsx 的 tool 快捷键处理器也在 window 上并会 `preventDefault` 同一按键，放守卫之后就永远跑不到）加一条：处于 `addOrthoWire` 时按 `M` = 丢弃在途草稿、重新起线。放在这里而不是"放置模式"分支内，因为那个分支在文件里**重复了两份**。

**验证**：新增 `apps/web/e2e/ortho-wire-rearm.spec.ts`（断然不依赖坐标：接线是"点一次出一段"，故"按 M 后再点"修好后**只出一段**、未修时**出两段**）。
- A/B：去掉解构那一行 → **失败**（2 段）；恢复 → **通过**。
- 副产品：`tsc` 的 `Cannot find name 'setOrthoWireDraft'` 随之消失 —— 既有错误少一条。

**排错方法留档**（下次遇到"状态改了但处理器看不到"可复用）：在处理器入口、状态变更 effect、以及消费点各打一行 `console.log`，用测试里的 `page.on("console")` 抓出来比对。本次正是靠这三处日志定位到"状态已变 null、但消费点仍读到旧值"，从而把两个缺陷分开。

### E.2 移动 scope 时 shift 丢单位，方框"暴走"（2026-09-12，用户报障，已修；**3 条既有用例转绿**）

**症状**（用户实测）：MCP 生成的电路里把 R1 往上挪，电阻**塌到原点压在 MOS 身上**，连着它的导线斜着飞出去。

**根因**：`move-arrange-actions.ts` 的 `formatScopeShiftValue`：

```js
const valueCm = valuePt * CM_PER_PT;
const formatted = formatNumber(valueCm, { fractionDigits: ... });
return Number(formatted) === 0 ? null : formatted;   // ← 换算成 cm，却返回裸数字
```

`xshift`/`yshift` 是**尺寸**，裸数字被 TikZ（**以及应用自己的解析器**）读作 **pt**。于是 `yshift=4`（本意 4cm）被当成 4pt ≈ 0.14cm ⇒ R1 落到 y≈0.14cm，正压 M1。

**反推验证**：截图里 R1 就贴在 M1 位置 —— 按 pt 解释吻合；若按 cm 解释，R1 该在 4cm 高处，不吻合。**截图站在 pt 这边。**

**为什么全仓只此一处**：其他 scope-shift 写入点都带 pt —— 检查器 `property-write-builders.ts:988`（`xshift=${...}pt`）、缩放 `resize-element.ts:593`（pt）。**只有移动路径写裸 cm，是异类。**

**修复**：改回写 `pt`，与另外两处对齐（不是"给 cm 补标签"，而是"跟大家一致"）：

```js
const formatted = formatNumber(valuePt, { fractionDigits: formatPrecision === "fine" ? 3 : 2 });
return Number(formatted) === 0 ? null : `${formatted}pt`;
```

**顺带**：`core-editing.spec.ts` 的 `readShiftValue` 助手原正则只认 `pt`（`` `${axis}shift=([-0-9.]+)pt` ``），改为**两种单位都认并归一到 pt**（裸数字按 TikZ 语义当 pt）。

**验证（A/B，全量 `core-editing.spec.ts`）**：

| | 结果 |
| :--- | :--- |
| 修复前 | **7 失败 / 31 通过** |
| 修复后 | **4 失败 / 34 通过** |

**转绿的正是三条"暴走位移"用例** —— `selected scope drag tracks cursor displacement without runaway shifts`、`… from member area …`、`unselected member drag promotes to scope drag …`。它们本来就是被这个 bug 打红的：用例名里的 "without runaway shifts" 说的就是这个症状，而基线里它们以 21s / 17s 的**视觉断言超时**呈现，看不出真因。

**剩余 4 条失败与基线一致**（键盘快捷键建图形、吸附子菜单勾选态、桌面 tikz 粘贴、视图菜单勾选态），均为定位器/勾选态问题 ⇒ **零新增失败**。

**定向 A/B（只跑这 4 条 scope-drag 用例）**：

| | 结果 |
| :--- | :--- |
| 退回 bug 版（写裸 cm） | **3 失败**（21.2s / 17.2s / 3.1s —— 与基线签名一致） |
| 修复版（写 pt） | **4 通过** |

⇒ 这 3 条是**真守卫，不是空测试**。

**守卫的机制**：`readShiftValue` 已改为**要求单位必须存在**（``` `${axis}shift=([-0-9.]+)(pt|cm)` ```，单位非可选）。一旦哪次移动又写出裸数字，这几条用例立刻变红，**不必再等视觉断言超时**才知道出事。

**教训**：这 3 条用例长时间被当成"既有环境失败"（§D.6 那批），实际是**真 bug**。**"既然基线就红，就不必深究"是个危险的默认** —— 值得对既有失败清单逐条扫一遍，尤其断言里带 "runaway / explode / stable" 这类**症状词**的。

---

### E.3 自定义剪贴板粘贴从来没生效过：缺一个 import，ReferenceError 被吞（2026-09-12，由"复核既有失败清单"挖出）

**症状**：`core-editing.spec.ts` 的 "canvas paste prefers custom desktop tikz payload over plain text fallback" 长期红着，被归入"既有失败"。

**根因**：`useCanvasKeyboardClipboard.ts:884` 调用 `parseClipboardPayloadJson`，**但该模块从未 import 它**（定义在 `editor-clipboard.ts:93`）。调用抛 `ReferenceError`，被同一段的 `catch` 吞掉、回退到普通粘贴。用 `page.on("console")` 抓到的现场：

```
[tikz-editor] Desktop custom TikZ clipboard read failed; falling back to standard paste data.
  ReferenceError: parseClipboardPayloadJson is not defined
```

**后果**：**"优先使用桌面自定义 payload"这个功能从未生效过。** 剪贴板里带着 `com.tikzeditor.tikz-json` 时，应用永远走回退路径 —— 若回退也失败，用户看到的就是"粘贴没反应"。

**修复**：在 `useCanvasKeyboardClipboard.ts` 补 `import { parseClipboardPayloadJson } from "../editor-clipboard";`

**A/B 证据**（同一用例，源码里出现的东西）：

| | 源码 |
| :--- | :--- |
| 修复前 | `\draw (0.25,-0.25) -- (1.25,0.75);` ← 回退路径的**偏移**文本 |
| 修复后 | `\draw (4,4) -- (5,5);` ← **自定义 payload 原文** |

**⚠️ 与 §E.1 是同一类病**：`setOrthoWireDraft` 未解构、`parseClipboardPayloadJson` 未导入 —— 都是**缺失的绑定产生 ReferenceError，被宽泛的 `catch` 静默吞掉**。`tsc` 本该当场报 `Cannot find name '...'`，但 §D.3 已述：仓库不跑类型检查（vite 走 esbuild）。**这类 bug 只能靠 e2e 或主动跑 tsc 发现，而它们的 e2e 又长期红着被无视 —— 两个因素叠加，功能坏了很久没人知道。**

**建议（新增）**：把 `tsc --noEmit` 的既有错误清单单独过一遍，**专挑 `Cannot find name` / `Cannot find module`** —— 这类几乎必然是对应功能的静默失效，且修复成本通常只有一行。

### E.4 三条"既有失败"实为过时/自相矛盾的测试（2026-09-12，同批复核结果）

同一批复核还清掉三条**非产品缺陷**的红（已修，现全绿）：

| 用例 | 真因 | 处置 |
| :--- | :--- | :--- |
| `tool keyboard shortcut creates shape and escape returns to select` | 按 `r` 期望建**矩形**，但 `r` 在 select 模式已被改为**电阻**（`circuit-hotkeys.ts:486`，带注释的刻意改动） | 改用未被遮蔽的 `l`(Line) 走同一通路 |
| `view menu check-state toggles for grid, snapping modes, rulers and guides` | 断言"网格/吸附/标尺/参考线**默认全开**"，实际默认是 `grid/guides/gaps: false, points: true`（`reducer.ts:51-58`，有意为之） | 改为**记录初值 + 断言翻转变**，不再把默认值写死 |
| `canvas context menu exposes snapping submenu check states` | 同上 | 同上 |

**顺带发现一个真冲突（未处理，需拍板）**：`tool-config.tsx` 的 `TOOL_BUTTONS` 把 `r/e/c/a/v` 标成 Rectangle/Ellipse/Circle/Arrow/Select，而 `circuit-hotkeys.ts` 的 select 模式映射把**同一批键**给了 Resistor/CurrentSource/Capacitor/CurrentArrow/VoltageSource。**工具栏 `title` 向用户承诺了一个按不出来的快捷键。** 这属 §D3/S2.6 的键位设计范畴，本次**未擅自重设计**，仅立案。修 `r` 的用例时已把该冲突写进用例注释。

---

## 附录 F：拖动元件时导线跟随（Virtuoso `m`=Stretch 语义）2026-09-12

### F.1 Virtuoso 的方案（用户提问：「看看 Virtuoso 怎么处理」）

官方/教程绑定表给出的模型是**两条命令，不是一个开关**：

| 命令 | 语义 |
| :--- | :--- |
| **`m`** | **Stretch（move with wires attached）** —— 器件移动，**附着的导线跟着走/被拉伸** |
| **`Shift + m`** | **Move（selected only）** —— **只挪选中项，线留在原地**（于是连接断开） |
| **`r`** | 旋转 Symbol **并拖动连线** |
| （Layout 不同） | Layout XL 里 `m` = Move only、`s` = Stretch |

**⚠️ 值得警惕的行业教训**：Cadence 社区里有专门帖子问「**怎么移动/拉伸原理图导线而不要让 Virtuoso 自动重路由把图搞得一团糟**」—— 说明"跟随时自动重路由"如果做得太激进，用户会主动想关掉它。**本项目的取舍：只让附着端点跟随、保留既有拐角，不做任何自动重路由。**

- [Bindkeys – Universal Access (Virginia Tech)](https://www.mics.ece.vt.edu/ICDesign/Tutorials/AnalogIC/bindkeys.html)
- [Cadence Virtuoso 快捷鍵（含 `Shift+m` 不移动连线）](http://science-boy-not-difficult.blogspot.com/2024/03/cadence-virtuoso.html)
- [How can you move/stretch schematic wires WITHOUT Virtuoso rerouting everything…（Cadence 论坛，需登录）](https://community.cadence.com/cadence_technology_forums/f/custom-ic-design/38605/how-can-you-move-stretch-schematic-wires-without-virtuoso-rerouting-everything-and-making-a-mess)

### F.2 实测：本项目存在一个真实缺口（用户报障「拖动元件时线不跟」）

**诊断**：`wire-follow.ts` 判定"哪根线附着在被拖元件上"靠**端口桶（port buckets）**，而桶只有两个来源：
1. 被拖 scope 内的 `\coordinate` 引脚（编辑器自带模板有）
2. 被拖路径**自身**的首末端点

**`circuit-mcp` 生成的器件两条都不占**：它是 scope + 裸 `\draw`，**没有 `\coordinate`**，子路径 id 又不在 `movedIdSet` 里 ⇒ **端口桶为空 ⇒ 导线永远不跟**。而用户的电路正是 MCP 生成的。

**修复**：把「被拖 scope 内部 `\draw` 原语的端点」也算作端口 —— 对 MCP 器件而言，引脚引线的端点正是这些端点。

**关键：三处必须同时改。** 端口桶构造在 `wire-follow.ts` 里被**复制了三份**：
- `clampDeltaForAttachedWires`（拖动中限幅）
- `applyWireEndpointFollowPatches`（**落点改写**）
- `findAttachedWiresForTransientDrag`（**瞬态预览**）

只改瞬态预览 ⇒ **线会"跟一下、松手又弹回去"**，比不跟更难看。因此本次把这 30 行 × 3 收敛成**一个 `buildPortBuckets`**（这个 bug 的成因正是复制粘贴导致的遗漏三处同时存在）。

### F.3 验证

新增 `apps/web/e2e/wire-follow-attached.spec.ts`：MCP 风格器件（无 `\coordinate`）+ 一条起点精确落在其引线末端的导线 → 拖动成员（应用会提升为拖 scope）→ **断言源码里附着端变了、远端没变**。

**A/B 证据**：

| | 源码里的导线 |
| :--- | :--- |
| 去掉 scope 成员端口 | `[[2.03,2],[3,2]]` → `[[2.03,2],[3,2]]` —— **纹丝不动**，用例失败 `did not follow` |
| 加上修复 | `[[2.03,2],[3,2]]` → `[[2.39,2],[3,2]]` —— **附着端跟随、远端锚定** |

（那次只沿 x 移动是**轴向锁定**造成的：dx 70 > dy 45，`DragState.movementAxis` 固有机制，非缺陷。）

**回归**：`core-editing` + `path-tools` + 4 个自建用例 = **72 通过 / 9 失败，失败项与既有清单完全一致 ⇒ 零新增失败**。

### F.4 尚未做的 Virtuoso 对齐项（可选）

- **`Shift+m` = "只挪选中、线留下"**：本次实现了 `m` 的 Stretch 语义，**没有**实现"不跟随"的对照操作。用户若要完整对齐 Virtuoso 再加。
- **不做自动重路由**（见 F.1 的教训）。

---

## 附录 G：正交导线写出锚点引用（2026-09-12）

> **状态：✅ 已完成并验证。新增 `apps/web/e2e/pin-connect-drag.spec.ts`（3 用例）。**
>
> **与 §S2.4 的区别（重要，勿混）**：S2.4 已被废弃，它要改的是"**不切工具就能起线**"（手势层）；本步改的是"**已经能起线之后，写出什么**"（发射层）。**未触碰任何手势**，故 S2.4 的废弃结论不受影响，也未被推翻。

### G.1 问题

`addOrthoWire` 起线时**已经接住了引脚锚点**（`useCanvasToolInteractions.ts:502` `startAnchor: startEndpointAnchor`），终点也能精确吸附到目标引脚的世界坐标。但送出时走 `formatTikzWireSnippet(waypoints)` —— **该函数只吃坐标数组，签名里根本没有锚点参数**，结构上就吐不出锚点 ⇒ 产物是死坐标 `(2.00,0.00)`。

后果：**正交线是几何线，不是连接。** 挪动元件，Line 工具画的线跟着走，正交线不动。

对照证据（同一对引脚）：

| 工具 | 手势 | 产物 | 性质 |
| :--- | :--- | :--- | :--- |
| `addLine` | 拖拽 | `\draw (node_M1_d) -- (node_R1_p1);` | 锚点引用 → 跟随 |
| `addOrthoWire`（改前） | 点击 ×3 | `\draw[thick] (2.00,0.00) -- (5.00,0.00);` | 死坐标 → 不跟随 |

讽刺的是拖拽路径**本来就有这条通道**（`useCanvasDragController.ts:1301-1323` 对 `kind === "orthoWire"` 就填 `fromAnchor`/`toAnchor`），只有点击路径没接。

### G.2 改动（3 处）

1. **`wire-routing-helper.ts`** —— `formatTikzWireSnippet` 增可选 `fromAnchor` / `toAnchor`：首尾输出 `(node_x)` 或 `(node_x.d)`，**拐角仍是坐标**。新增 `WireEndpointRef` 类型与 `formatAnchorRef`（`anchor` 为 `center` 时省略后缀）。
2. **`types.ts`** —— `OrthoWireToolDraft` 增 `emittedLegs`；并在注释里把 `startAnchor` 的语义钉死为"**线的起点引脚**"，而非"指针最后碰到的锚点"。
3. **`useCanvasToolInteractions.ts` 正交分支** —— 顺带修掉两个连带缺陷：
   - **起点锚点被覆盖**：原代码每次点击都 `startAnchor: startEndpointAnchor`，点空地即变 `null` ⇒ 起点锚点丢失。改为保留原值，靠 `emittedLegs` 判断"只有第一段用起点锚点"。
   - **落点判定认不出不同引脚**：原判定只比 `nodeSourceId`，而纯 `\coordinate` 引脚的 `nodeSourceId` 是**空串** ⇒ 两个引脚都是 `""`，永远判不出"落到别的引脚"，**永不收线**。改为以 `nodeName` 兜底。

产物：

```latex
\draw[thick, line cap=round] (node_M1_d) -- (5.00,0.00);
\draw[thick, line cap=round] (5.00,0.00) -- (node_R1_p1);
```

### G.3 验证

| 用例 | 断言 | 结果 |
| :--- | :--- | :--- |
| 两引脚连线 | 源码含 `(node_M1_d)`/`(node_R1_p1)` 且为 `--` 端点 | ✅ |
| 同上 | `getSceneSourceIds().length >= 4`（2 引线 + 2 段线）⇒ **锚点引用真被求值器解析渲染**，非仅文本 | ✅ |
| 空白处连线 | 仍全坐标、不含 `node_`（防回归） | ✅ |
| Line 工具拖拽 | 仍含锚点引用（防回归） | ✅ |

**对既有工作零影响**：`wire-follow-attached` / `wire-follow-polyline` / `ortho-wire-rearm` / `wire-routing-modes` / `pin-halo` **5 条全通过**（其中 `wire-routing-modes` 正走本发射路径）。

### G.4 遗留

- **本步收益依赖引脚存在**。MCP 生成电路仍零 `\coordinate`（§0.3），故须配合 **S2.2** 才看得出效果 —— 编辑器自带元件（模板有引脚）**已验证可直接享受**。
- **【附录 B 第 5 条结案 · 冲突属实】** 编辑器原生元件的引脚命名与 MOS 校验器**确实不兼容**，实测证据：
  | 侧 | 形式 | 证据 |
  | :--- | :--- | :--- |
  | 编辑器模板 | **点号式** `\coordinate (node_Rx.l)` / `(node_Mx.g)` | `circuit-snippets.ts:5`、`:19` |
  | MCP 校验器 | **下划线式** `node_<id>_<d\|g\|s>` | `validator.py:100-106` `ANCHOR_NAME_RE` |

  更要命的是校验器的坐标正则 **`COORDINATE_RE = r"\\coordinate\s*\(([A-Za-z_]\w*)\)"`（`validator.py:108`）不含点号** ⇒ 编辑器产出的点号式引脚**校验器根本解析不出来**。
  因此 §S2.1 定"点号式为唯一写出格式"时，**必须同步放宽 `validator.py` 的 `ANCHOR_NAME_RE` 与 `COORDINATE_RE`**，否则 MCP 产出过不了自己的门。
- **本步与 `wire-lock` 规则同向**：`validator.py:19-20` 明写"非根元件 scope 的进线必须按名引用父级锚点，**纯局部坐标的进线拖拽时会与父级断连（error）**"。本次改动正是把正交导线从"纯局部坐标"改成"按名引用"，**与项目自己的校验规则一致**。
- **已实测两种形式都可用**：点号式 `(node_R1.r)`（`nodeName`/`anchor` 分离）与下划线式 `(node_M1_d)`（`nodeName` 全名、`anchor` 落 `center`）经 `formatAnchorRef` 都输出正确。`pin-connect-drag.spec.ts` 两种各有用例。

---

## 附录 H：tsc 主动清扫 —— 又抓到三个静默失效（2026-09-12）

E.3 揭示"**缺绑定 → ReferenceError → 被宽泛 catch 吞掉**"是一类反复出现的病。于是主动跑
`tsc --noEmit` 专挑 `Cannot find name` / `Cannot find module`，从 15 条既有错误里清出三条同类：

| 位置 | 症状 | 后果 |
| :--- | :--- | :--- |
| `useCanvasDragController.ts:453-454` | 引用了作用域里**根本不存在**的 `snapshot`（该文件只有 `snapshotSource` / `snapshotScene` / `snapshotEditHandles`） | **每次连线/箭头/正交导线拖拽都抛 ReferenceError** ⇒ **VDD 电源轨吸附从未生效**。修法照同文件 `:1109-1111` 的正确写法（`parseTikzForEdit(source)` + `snapshotEditHandles`） |
| `useCanvasKeyboardClipboard.ts:320`、`:1121`、`useCanvasToolInteractions.ts:373` | `dispatch({ type: "SELECT_ELEMENTS" })` —— **不是合法 action 类型**（正确名是 `SELECT_RANGE`，见 `types.ts:503` / `reducer.ts:1061`） | 三处"清空选区"**静默失效**（reducer 不认的 kind 不做任何事）。其中 `:1121` 的注释把意图写得很明白：*"Clear selection so original elements don't show bounding boxes and aren't transformed"* |
| `capabilities.ts:25` | `TOOL_CHECKS` **缺 11 个条目** | `getToolCapabilityStatus` 对缺失项返回 `"unsupported"`，而 `editor-command-runtime.ts:267` 做 `enabled: capability.status !== "unsupported"` ⇒ **这 11 个工具的插入命令在 UI 里被灰掉**：**`addOrthoWire`（正交导线）**、`addRoundedLine`、`addCurrentSource_Right_Left`、**`addVoltageSource` 的 8 个方位** |

**这解释了为什么 e2e 里够得着正交导线只能用 `SET_TOOL_MODE` 派发 —— 走 UI 的插入命令是禁用的。**

结果：tsc **15 → 3**（余 3 条为纯类型声明噪音：`pptx2tikz` 无 `.d.ts` ×2、`SceneText.anchor` ×1）。

**⚠️ 这批的共性**：`snapshot` 未定义、`SELECT_ELEMENTS` 拼错、`TOOL_CHECKS` 漏条目 —— 三者都不是"逻辑写错"，而是**缺失或拼错的名字**，运行时要么静默、要么被宽泛 catch 吃掉。**`tsc` 一跑就现形，而本仓库从不跑类型检查。**

**建议（强化 §E.3 那条）**：把 `tsc --noEmit` 纳入某个轻量 CI 门，**先只盯 `Cannot find name` / `Cannot find module`**，这两类几乎必然对应一个静默失效的功能，修复成本通常一行。

---

## 附录 I：两击成型连线 + 自动避让（用户需求，2026-09-12）

**用户原话**：「点击两个锚点45度连线和正交连线而不是多段连线一直点来点去，不覆盖元件不和原有的线重合」

结合 §S3.5 的告诫（"不要做成不可控的魔法"）实施如下。

### I.1 两击成型

- **两端都是引脚时，两次点击即完成整条走线**，不再"点一次出一段"。此前正交向导做 pin→pin 需要 3 次点击。
- **自由手绘仍保持多段手感**（某一端不是引脚时）—— 与 §S3.2 保留的决定**不冲突**：改的是"落到引脚"的收线方式，不是自由走线的节奏。
- 走线模式沿用草稿既有机制：正交 / 45° / 任意角（`Shift+F3` 循环，§S3.2）。
- **手工中间点受保护**：自动规划**仅在"一段都还没出过"时触发**（`emittedLegs === 0`）。若用户已手点了一段中间线，再点到引脚上**只是收线**，不会被从起点重规划 —— 否则会多画一条重叠的线，并丢掉刚选好的中间点。实现时先漏了这个闸（判据早于 `emittedLegs` 的声明），补闸后新增用例专测：**"手点中间点 → 落到引脚"必须恰好两段、无第三条线**。

### I.2 自动避让（新增 `wire-auto-route.ts`）

**做法：候选路线在世界坐标生成，在 SVG 空间打分。** 这样选是因为障碍物（元件包围盒）本来就以 SVG 存在（`collectSourceBounds`），只需单向 `worldToSvgPoint`，**不必求逆**；只有胜出路线用 `svgToWorldPoint` 换回世界坐标。

**评分次序（刻意如此）**：撞元件包围盒 ≫ 与既有导线重合长度 ≫ 总长度。
即"**宁可绕远，也不压件、不压线**"；只在同样干净的路线之间才比长短。

两个关键细节：

1. **走廊坐标由障碍物边缘 ± `CLEARANCE` 导出**，另加几个跨度分数。这条是必需的：朴素 L 形在"两端等高/同列"时**无处可走**，而"两引脚等高、中间卡个元件"恰恰是原理图最常见的情形。
2. **含端点的包围盒自动排除**（带 1.5 SVG 单位余量）。引脚就长在自己元件的边界上，不排除的话每条线都会"撞"自己的器件。

**回退**：无干净路线时回退朴素 L 形 —— 遵循 §S3.5："宁可保持原样，不要产出更乱的走线"。

### I.3 落点与验收

- 新增 `packages/app/src/ui/canvas-panel/wire-auto-route.ts`
- `useCanvasToolInteractions.ts` 正交分支新增两击路径（复用附录 G 的 `formatTikzWireSnippet` 首尾锚点 + 中间坐标）
- 新增 `apps/web/e2e/wire-auto-route.spec.ts`：① 两击成型（源码里一次 action 出现整条线、两端锚点引用）② 绕开挡在直线上的元件（几何断言：折线不与障碍矩形相交，且确实产生了偏移）③ 不压既有导线
- **e2e 结果：3 通过**，产出与断言逐条相符：
  - **两击成型**：`\draw[thick, line cap=round] (node_A.p) -- (5.00,0.00) -- (node_B.p);`
  - **绕开零件**：障碍 `(2.2,-0.6)–(3.2,0.6)` → 折线 `[{1,0},{1,0.95},{5,0.95},{5,0}]`；几何断言"折线不与障碍矩形相交"通过，且确实产生偏移（走廊 = 障碍上沿 0.6 + 余量）
  - **不压既有线**：既有线在 y=0 → 路线偏移到 y=0.35
- **连带修正**：`pin-connect-drag.spec.ts` 原先假设正交导线写成**两段**（场景元素 ≥ 4）。两击成型后整条线是**一条折线**（元素 3）。断言已更新 —— 这是行为改进导致的用例过时，非回归。
- **⚠️ 一次环境插曲（记录备查）**：中途一次验证时机器**只剩 1.6 GB / 15.7 GB 可用内存**（用户浏览器开着 54 个标签）。症状很有迷惑性：**三条用例全部挂在 `gotoApp`，即应用在页面里根本没渲染**，单条 150 秒都跑不完（同一 spec 正常只需 20 秒）。释放内存后 **20.2 秒 3 条全过**。**"集体失败、且都失败在应用未渲染"应先往资源上想，而不是怀疑被测代码。**（期间两个用户 dev server 8888/8889 自行退出，与本工作无关。）

### I.4 已知边界（刻意取舍）

- 避让是**有限候选打分，不是完备寻路**：密集障碍下可能找不到干净路线而回退。这是 §S3.5 要求的取舍，不是缺陷。
- **45° / 任意角模式不做避让**（每种模式只出一条候选）：它们本身就是几何约束解法，套绕行会破坏 45° 语义。
- 两击路径**不写 T 型焊点**：自动生成的路线跨越既有线属"跨越"，按 §S3.3 的规则跨越本就不打点。

---

## 附录 J：对照参考工具补齐"绘制过程"（2026-09-13）

用户提供一段 2 分 47 秒录屏（`analog-canvas.tokenzhang.com/editor` —— **另一个**原理图工具），要求"只看电路绘制过程"逐项对照补缺。用 OpenCV 按 0.5s 抽帧（343 帧）后逐段核对。

### J.1 已修：预览线其实是"看不见"，不是"没有"

**症状**：用户报"没有预览线啊"。**实测**（探针读真实 DOM）：预览线**一直在渲染**，但 stroke-width 计算值只有 **0.54px**（发丝，实际等于不可见），且是**实线**。

**根因**：`overlays.tsx` 的 `ToolPreviewOverlay` 全部用 `handleStrokeWidth`（`CanvasPanel.tsx:3594` 的 `1.2 / scale`）。该式假定"1 SVG 用户单位 = 1 CSS 像素"，但 SVG 有 viewBox 缩放，实测多出约 **1.54 倍** ⇒ 1.2 的意图落成 0.54px。

**修法**：预览笔统一改用 **`vector-effect: non-scaling-stroke` + 屏幕像素线宽**（`TOOL_PREVIEW_STROKE_PX = 1.6`），线宽从此与缩放无关；橡皮筋加**虚线** `6 5`（参考工具即虚线，也保证预览不会被误认成已提交元素）。共 20 处预览笔。**引脚光环（`node-anchor-halo`）等的笔宽刻意未动**，避免改变用户已认可的观感。

### J.2 已修：连线中显示**全部**可连引脚

参考工具在 W 连线时把**所有**引脚显形为空心圆，"能连哪儿"一眼可见。原来只显**光标 60px 内**的引脚（`resolveEndpointAnchorSnap` 的 reveal 半径）—— 光标一远就一个都没有，既看不出能连哪儿，也看不出器件究竟有没有引脚。

**修法**：新增 `widenAnchorOverlayForWiring()`（`useCanvasToolInteractions.ts`）—— 走线类工具（正交导线 / 直线 / 箭头）激活时，浮层的 `visibleAnchors` 用**全部 `tier === "basic"` 锚点**；**就近吸附仍决定当前目标**（`snappedAnchor` 原样传递）。"指针移动"与"进入画布"两个入口都接。

**验证**（探针读 DOM）：光标置于画布正中、离两个引脚都远时，`node-anchor-dot` 计数 = **2**；修改前为 **0**。

### J.3 已修：底部状态栏的走线提示

参考工具底部按上下文给可操作提示。原来 `addOrthoWire` / `addRoundedLine` 落进 `default`（只返回通用吸附提示）。现显式给出动作与键位：

```
Click a pin to start, then the destination pin · Shift+F3 corner mode · Space corner side · Esc cancels
```

键位已对着 `useCanvasKeyboardClipboard.ts:252`（`Shift+F3`）与 `:266`（`Space`）核实。

### J.4 已修：预览改为**整条路**，不再只画一段

用户接着报："还是只能看到一个从出发点引出来的线，看不到剩下的连线。"

**根因**：预览原来只生成**下一段**正交腿（`useCanvasDerivedState.ts` 的 `addOrthoWire` 分支按主轴取一个拐点），而参考工具预览的是**通往目标的完整路径**（含拐弯）。用户在移动过程中只看见一段，看不到"其余的连线"。

**修法**：
- `ToolPreview` 新增 `{ kind: "polyline" }` 变体，`ToolPreviewOverlay` 用 `<polyline>` 渲染（同样虚线 + `non-scaling-stroke`）。
- 预览改走 `computeWireWaypoints(from, to, routingMode, orientation)` —— **与提交路径同一套几何**，因此正交出 L 形、45° 出三段斜线，和参考工具的 "Wire corner: 45° diagonal" 预览一致。未显式选朝向时沿用提交路径的"拐角跟主轴走"默认。

**验证**（探针读 DOM，斜向移动）：
```
polylinePoints = ["56.9,85.4", "155.6,85.4", "155.6,13.5"]   ← 三点 = 完整 L
dash = "6px, 5px"   width = "1.6px"
```
已固化为用例（`wire-auto-route.spec.ts` → "the wire preview draws the whole route, not just its first leg"，断言点数 ≥3、虚线、线宽 >1px）。

**遗留**：预览走的是**普通拐角路线**，不是 `planWireRoute` 的**自动避让结果**。因此光标停在引脚上时，预览可能不显示绕行。要一致需把障碍/既有线数据也喂给预览侧（属结构性改动，未做）。

### J.5 未做 —— 登记待定夺

| 缺口 | 为什么没做 |
| :--- | :--- |
| 状态栏显示**当前源引脚**（参考工具是 `Wire source: terminal:M4:G`） | 走线草稿在 `CanvasPanel` **局部状态**，而 `StatusBar` 自读 store。要显示必须把草稿（或源引脚 + 模式）提升到 store —— 结构性改动，未擅自动 |
| 放置器件时的 **R 旋转 / Shift+R 镜像 + 底部提示** | 本库键位体系本就不同（`circuit-hotkeys.ts` 用 `W/A/S/D` 切朝向、`H/Y/V/X` 镜像）。换成参考工具那套会推翻现有肌肉记忆，属 **§D3 键位决策**范畴 |
| 左侧**分类器件库面板**（缩略图 + 分类） | 现为工具条；属 UI 重构，改动面大 |
| 空画布提示（"Press I / W"） | 低优先 |
| 参考工具的 **`F3` 直接循环拐角模式** | 本库是 `Shift+F3`。§S3.1 已决定**不占 `F3`**（Virtuoso 里 F3 是选项表单），维持不改；只把实际键位写进 J.3 的提示 |

**验收**：13 个 spec / 96 条用例 = **94 通过 / 2 失败**；两条失败与基线完全一致（`path-tools` 吸附预览点，既有）。`tsc` 保持 3 条（纯类型声明噪音）。

---

## 附录 K：引脚朝向感知的连线 + 正交算子写出（2026-09-13）

**用户原话**：「连接线的横纵应该是用起始位置的锚点所在线的朝向和终位置锚点所在线的朝向决定的……继续优化连接线的朝向和中间线段数量逻辑」。

### K.1 引脚朝向感知

引脚长在引线的**端点**上。导线必须**沿起点引线的朝向出去、沿终点引线的朝向进来** —— 否则一到引脚就拐 90°，读起来像接错了。

新增 `leadAxisAt(point, leads)`（`wire-auto-route.ts`）：在场景的所有线段里找出**端点落在该引脚上**的那一条，取其朝向（水平/竖直）。`planWireRoute` 相应增 `startLeadAxis` / `endLeadAxis`。

由此决定的**最少段数**：

| 起点引线 | 终点引线 | 形状 | 段数 |
| :--- | :--- | :--- | :--- |
| 竖 | 横 | 先竖后横（`\|-`） | 2 |
| 横 | 竖 | 先横后竖（`-\|`） | 2 |
| 竖 | 竖 | V-H-V | 3（x 对齐时退化为直线） |
| 横 | 横 | H-V-H | 3（y 对齐时退化为直线） |
| 未知（引脚不在任何引线上） | — | 退回全形状集 | — |

> 写这段时作者一度把两个算子搞反（以为 `-|` 是先竖）。**核实依据**：`packages/core/src/semantic/path/segments.ts:35-52` —— `-|` 拐角取 `(next.x, current.y)`（**先横后竖**），`|-` 拐角取 `(current.x, next.y)`（**先竖后横**）。凡涉及这两个算子，一律以此文件为准。

### K.2 写出改用正交算子 `-|` / `|-` —— 同时修掉"斜线"

`formatTikzWireSnippet`：当**两端含锚点引用**且路线是"中间点恰为两端正交拐角"的三点 L 时，改写为：

```latex
\draw[thick, line cap=round] (node_L.d) |- (node_R.g);
```

**不再写死拐角坐标** ⇒ 元件移动时拐角由 TikZ 现算 ⇒ **根除"锚点端跟走了、死坐标拐角留在原地、线段被拉成斜线"**。（这正是用户先前报的斜线问题的根因：子代理实测确认**锚点端本身是会跟的**，坏的是拐角。）

手写中间点的路线仍保持 `--` 折线（尊重用户的手工选择）。

### K.3 优先级：**障碍 > 引脚朝向 > 与既有线重合 > 长度**

朝向与避让会**真冲突**：两端引线都水平、而器件恰好卡在两者之间的直线上时，守朝向就必然穿件。故候选分两档 —— **守朝向**（`respectsLeads: true`）与**通用兜底**（`false`）—— 评分次序如上。效果：干净时守朝向；被逼到墙角时让路（穿件罚 1e6 远高于让路罚 1e4）。

### K.4 验证

`wire-auto-route` / `pin-connect-drag` / `junction-dot` / `wire-follow-anchor` 四个 spec = **14 通过 / 0 失败**；`tsc` 保持 3 条（纯类型声明噪音）。关键证据：

| 场景 | 产物 |
| :--- | :--- |
| 起点引线竖直 + 终点引线水平 | `(node_L.d) |- (node_R.g)`（**先竖**）✓ |
| 两端引线都水平 | `(node_A.p) -- (2.33,0.00) -- (2.33,3.00) -- (node_B.p)`（H-V-H，3 段）✓ |
| 器件卡在两者之间直线上 | 折线 `[{1,0},{1,0.95},{5,0.95},{5,0}]`，与障碍矩形不相交 ✓（**让路优先于守朝向**） |

---

**版本**：v1.1（范围收窄 —— 剔除网表 / ERC / SPICE，只做绘图体验）

**变更记录**
- **v1.1** —— 按用户要求剔除网表与仿真相关全部内容（原 S4.1–S4.3）。随之：作废 D2（sidecar 决策）、移除 `WORKSPACE_VERSION` 迁移风险、移除唯一的图论算法（并查集）；**修正 v1.0 关于"几何推导是错的层"的判断** —— 该判断仅在"需要导出网表"时成立，剔掉网表后几何推导即正确层；新增 §0.5 范围剔除、§4 推荐执行序（按体验价值排序，与阶段编号不同）。
- **v1.0** —— 首版。

**编写依据**：对 `E:\tikz-editor-master\tikz-editor-master` 的三路代码审计（编辑/撤销模型、磁吸与拖拽接线点、元件模型与 e2e 底座）+ Cadence Virtuoso 官方/教程绑定表

**未经验证**：未运行 e2e 全量基线、未在浏览器实机复验手感 —— 故本计划**刻意不给工期数字**，须由 S0.1 的基线报告校准。
