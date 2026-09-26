# 刚性叶子支路联动跟随实现计划 (Rigid Leaf Branch Follow Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当上下移动 MOSFET ($M_1$) 时，与其相连的输入端子（$V_{in}$ 等叶子端子）与水平连接线一同整体上下平移，保持连接线严格水平，彻底杜绝出现斜线。

**Architecture:** 
在 `packages/core` 中引入 `detectRigidLeafBranches` 拓扑度数与正交破环检测算法；在 `move-arrange-actions.ts` 中整合叶子 scope 的解耦平移与导线端点正交保持；在 `useCanvasDragController.ts` 中对叶子 DOM 元素施加 120 FPS 实时解耦平移。

**Tech Stack:** TypeScript, TikZ AST, Vitest, React SVG Canvas Drag Controller.

## Global Constraints
- 单段独立连线规范：导线保持单段水平或垂直，严禁产生斜线。
- 拓扑安全准则：仅当对端元件外连度数 == 1（或为明确的 IO 终端节点）时方可联动，严禁破坏主电路拓扑。
- 坐标解耦准则：水平导线仅跟随垂直分量 $(0, \Delta y)$，竖直导线仅跟随水平分量 $(\Delta x, 0)$。

---

### Task 1: 刚性叶子支路检测核心算法 (`detectRigidLeafBranches`)

**Files:**
- Test: `test/rigid-leaf-branch-follow.spec.ts`
- Modify: `packages/core/src/edit/actions/wire-follow.ts`

**Interfaces:**
- Produces:
  ```typescript
  export type RigidLeafBranch = {
    wireStatementId: string;
    leafComponentId: string;
    orientation: "h" | "v";
    branchDelta: WorldPoint;
    wireMovingEndpointIndex: 0 | 1;
    wireStaticEndpointIndex: 0 | 1;
  };
  export function detectRigidLeafBranches(
    source: string,
    body: readonly Statement[],
    editHandles: readonly EditHandle[],
    movedElementIds: readonly string[],
    delta: WorldPoint
  ): RigidLeafBranch[];
  ```

- [ ] **Step 1: 编写失败的单元测试**
创建 `test/rigid-leaf-branch-follow.spec.ts`，测试输入 MOSFET $M_1$ 连接 $V_{in}$，垂直移动时能准确检测出刚性叶子支路。

- [ ] **Step 2: 运行测试验证失败**
运行 `npx vitest run test/rigid-leaf-branch-follow.spec.ts`，验证因函数未导出而报错。

- [ ] **Step 3: 实现 `detectRigidLeafBranches` 算法**
在 `wire-follow.ts` 中实现：
1. 遍历所有顶层 draw 导线，使用 `resolveCompId` 计算每个端点所属元件及每个元件的外部连通度数；
2. 筛选与 `movedElementIds` 端口重合且原本为水平或竖直的单段导线；
3. 判断本次 `delta` 是否垂直于导线走向；
4. 确认对端元件为叶子元件（度数 == 1 或包含 `node_IO_` 等 IO 标志）；
5. 计算解耦后的 `branchDelta`。

- [ ] **Step 4: 运行测试验证通过**
运行 `npx vitest run test/rigid-leaf-branch-follow.spec.ts`，验证检测测试通过。

- [ ] **Step 5: 提交代码**
```bash
git add test/rigid-leaf-branch-follow.spec.ts packages/core/src/edit/actions/wire-follow.ts
git commit -m "feat(core): implement detectRigidLeafBranches algorithm"
```

---

### Task 2: 移动动作与源码生成层集成 (`applyMoveElementsAction`)

**Files:**
- Modify: `packages/core/src/edit/actions/wire-follow.ts`
- Modify: `packages/core/src/edit/actions/move-arrange-actions.ts`
- Test: `test/rigid-leaf-branch-follow.spec.ts`

**Interfaces:**
- Consumes: `detectRigidLeafBranches`
- Produces: `applyMoveElementsAction` 生成包含叶子 scope shift 改写与导线端点同步位移的完整 patches。

- [ ] **Step 1: 编写端到端源码改写测试**
在 `test/rigid-leaf-branch-follow.spec.ts` 中增加测试用例：
1. 垂直移动 $M_1$，验证生成的源码中 $M_1$ 与 $V_{in}$ 的 shift 均改变，导线两端 y 坐标一致，完全水平；
2. 复合斜向移动 $M_1$，验证 $V_{in}$ 仅在 Y 方向移动，导线拉长但保持水平；
3. 非叶子元件（如 $M_2$）连接时不被移动。

- [ ] **Step 2: 运行测试验证失败**
运行 `npx vitest run test/rigid-leaf-branch-follow.spec.ts`，确认失败。

- [ ] **Step 3: 在 `move-arrange-actions.ts` 中集成刚性支路跟随**
1. 在 `applyMoveElementsAction` 中调用 `detectRigidLeafBranches`；
2. 为每个检测到的 `leafComponentId` 生成 scope shift 改写 patch（位移量为 `branchDelta`）；
3. 调整 `wire-follow` 处理，使该刚性导线的对端端点也跟随 `branchDelta`，被拖拽端跟随 `delta`；
4. 将受影响的 scope 和导线 statement ID 写入 `changedSourceIds`。

- [ ] **Step 4: 运行测试验证通过**
运行 `npx vitest run test/rigid-leaf-branch-follow.spec.ts`，确认所有测试均 PASS。

- [ ] **Step 5: 提交代码**
```bash
git add packages/core/src/edit/actions/move-arrange-actions.ts packages/core/src/edit/actions/wire-follow.ts test/rigid-leaf-branch-follow.spec.ts
git commit -m "feat(core): integrate rigid leaf branch follow into applyMoveElementsAction"
```

---

### Task 3: 画布 120 FPS 实时拖拽联动 (`useCanvasDragController.ts`)

**Files:**
- Modify: `packages/app/src/ui/canvas-panel/useCanvasDragController.ts`

- [ ] **Step 1: 收集刚性支路 DOM 元素**
在 drag 初始化（`kind === "element"`）时，根据 AST 和 handles 调用 `detectRigidLeafBranches`，记录叶子元件的 DOM 元素和对应的导线 DOM 元素。

- [ ] **Step 2: 实时解耦施加 SVG Transform**
在拖拽每一帧的 `onPointerMove` 中：
- 被选中的元件施加 `translate(svgDx, svgDy)`；
- 水平支路的叶子元件施加 `translate(0, svgDy)`；
- 导线施加 `translate(0, svgDy)` 并弹性拉伸；
- 鼠标抬起时，通过已就绪的 `applyMoveElementsAction` 精确落盘。

- [ ] **Step 3: 运行全量测试验证**
运行现有全部测试：
```bash
npm run test
```

- [ ] **Step 4: 提交代码**
```bash
git add packages/app/src/ui/canvas-panel/useCanvasDragController.ts
git commit -m "feat(app): enable 120fps transient drag for rigid leaf branches"
```

---

### Task 4: 真实电路实测与回归验证

**Files:**
- Test: `Sketch/active-drawing/active-drawing.tex`

- [ ] **Step 1: 运行所有单元测试**
执行 `npx vitest run test/` 确保全绿。
- [ ] **Step 2: 实测当前 active-drawing.tex**
模拟或测试在实际电路中向上移动 $M_1$，验证输出源码保持纯正交。
