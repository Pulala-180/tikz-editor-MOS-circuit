# 刚性叶子支路联动跟随设计规范 (Rigid Leaf Branch Follow Design)

## 1. 背景与目标
在模拟电路绘制中（如 TikZ Editor），MOSFET 等核心元件的引脚（如栅极）经常通过单段正交导线连接到输入输出端口或偏置端子（如 $V_{in}, V_{out}, V_b$）。
当用户上下拖动 MOSFET 时，由于栅极连线原本为水平线，若对端端口保持静止，该连线将被拉扯成非正交的斜线（Skewed Wire），严重破坏电路规范与视觉美感。

本设计目标：在移动元件时，自动识别其通过正交导线相连的“刚性叶子端子支路（Rigid Leaf Branch）”，使对端叶子元件与导线在垂直于导线方向的位移上同频联动，确保导线始终保持绝对正交，绝不变斜。

---

## 2. 拓扑识别与安全准则 (Topological Detection & Safety)

### 2.1 刚性叶子支路的判定充要条件
对于被移动元件集合 $S_{moved}$（如 $\{M_1\}$）以及移动矢量 $\vec{\Delta} = (\Delta x, \Delta y)$：
遍历所有与 $S_{moved}$ 端口物理重合或锚点相连的顶层单段直线导线 $W = (P_1, P_2)$：
1. **正交导线条件**：
   - 导线在移动前必须是轴对齐的：水平线（$|P_1.y - P_2.y| \le \epsilon$）或竖直线（$|P_1.x - P_2.x| \le \epsilon$）。
2. **正交破坏位移条件（Skew Risk）**：
   - 若 $W$ 为水平线，且 $\Delta y \neq 0$（垂直位移会导致该水平线发生倾斜）；
   - 若 $W$ 为竖直线，且 $\Delta x \neq 0$（水平位移会导致该竖直线发生倾斜）。
3. **叶子对端元件判定（Leaf Component Guard）**：
   - 设 $P_{other}$ 为不属于 $S_{moved}$ 的另一端点，对应的对端元件为 $C_{other}$；
   - $C_{other} \notin S_{moved}$；
   - $C_{other}$ 在全电路中的外连导线度数为 1（Degree == 1），即除了导线 $W$ 之外，没有其他外部导线与其连接；
   - 或者 $C_{other}$ 为明确的 IO 终端节点（scope 内包含 `node_IO_`、`Vin`、`Vout`、`Vb` 等单端口端子）。
满足上述全部条件的 $(W, C_{other})$ 判定为一个刚性叶子支路。

---

## 3. 正交解耦位移规则 (Decoupled Displacement)

对于被判定为刚性叶子支路的 $(W, C_{other})$：
- **若 $W$ 为水平线**：
  - $C_{other}$ 的位移矢量为：$\vec{\Delta}_{leaf} = (0, \Delta y)$。
  - $C_{other}$ 仅在 Y 轴跟随移动，X 轴保持静止。
  - 导线 $W$ 的两端点 Y 坐标均增加 $\Delta y$；其连向 $M_1$ 的端点 X 坐标跟随 $M_1$ 移动 $\Delta x$（即导线纯水平伸缩），连向 $C_{other}$ 的端点 X 坐标保持静止。
- **若 $W$ 为竖直线**：
  - $C_{other}$ 的位移矢量为：$\vec{\Delta}_{leaf} = (\Delta x, 0)$。
  - $C_{other}$ 仅在 X 轴跟随移动，Y 轴保持静止。
  - 导线 $W$ 纯垂直伸缩，两端点 X 坐标均增加 $\Delta x$。

---

## 4. 架构改写与系统模块

1. **检测与改写核心：`packages/core/src/edit/actions/wire-follow.ts`**
   - 扩展/新增 `detectRigidLeafBranches` 方法，根据当前 AST、editHandles、movedElementIds 与 delta 计算刚性叶子支路集合。
   - 在 `applyWireEndpointFollowPatches` 或 `applyMoveElementsAction` 中，将刚性叶子元件的 scope纳入移动改写（生成 `shift` 改写 patch），并将导线两端点同步保持正交。
2. **移动处理中枢：`packages/core/src/edit/actions/move-arrange-actions.ts`**
   - 在 `applyMoveElementsAction` 中融合叶子元件位移，保证 patches 统一处理。
3. **实时拖拽交互：`packages/app/src/ui/canvas-panel/useCanvasDragController.ts`**
   - 在 `onPointerDown` 初始化时收集叶子元件与导线的 DOM 元素；
   - 在 `onPointerMove` 实时应用解耦后的 SVG Transform，实现 120 FPS 零延迟平移。

---

## 5. 测试与验证计划
1. **单元测试**：`test/rigid-leaf-branch-follow.spec.ts`
   - 测试用例 1：垂直移动管子，水平相连的 $V_{in}$ 和导线同步垂直平移，导线保持水平。
   - 测试用例 2：复合斜向移动管子，$V_{in}$ 仅垂直平移，水平导线拉长且保持水平。
   - 测试用例 3：连接到度数 > 1 的元件（如 $M_2$）时，对端元件静止，绝不误动。
2. **回归测试**：运行全部原有测试 `npm run test` 或 `vitest`。
