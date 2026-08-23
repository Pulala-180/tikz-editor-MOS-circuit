# TikZ Editor (MOS Circuit & High-Performance Edition)

> ?? **Upstream Attribution**: This project is an enhanced, performance-optimized, and schematic-specialized fork of the original open-source [**tikz-editor by Dominik Peters**](https://github.com/DominikPeters/tikz-editor).

An intuitive, high-performance visual TikZ editor tailored for electronic schematics (especially MOS analog/digital circuits) and general scientific illustrations, featuring real-time bidirectional AST synchronization, 160+ FPS transient DOM kinetics, elastic wire follow, and precision pin snapping.

---

## ?? Key Enhancements & Adaptive Designs (vs. Original Project)

### 1. ? Transient Direct DOM Drag Optimization (160+ FPS)
- **Problem in Original**: Every pixel of element movement triggered full-pipeline AST parsing, geometry re-calculation, and React virtual DOM reconciliation, resulting in 20~30 FPS lag and jitter on complex schematics.
- **Solution**: Engineered a direct DOM transform transient interaction layer (inspired by Visio & Draw.io). During mouse drags, high-overhead parser pipelines are completely bypassed for butter-smooth **160+ FPS** rendering, with single-transaction atomic AST commits upon mouse release.
- ?? **Pro-Tip for Ultra-Smooth Free Dragging**: When moving components across densely populated circuits and seeking the ultimate unrestricted, silky-smooth drag experience, right-click the canvas and uncheck **`Snapping -> Snap to Object Points`** (or hold `Ctrl`/`Cmd` temporarily). Re-check it when routing wires for precise pin-magnetic lock!

### 2. ?? Real-Time Elastic Wire-Follow Kinetics (120 FPS)
- **Problem in Original**: Moving a transistor or component broke all connected wires, requiring tedious manual re-routing.
- **Solution**: Built an intelligent topology wire-follow engine. Moving any component dynamically stretches, translates, and folds attached wire segments in real time (120 FPS), preserving circuit topology effortlessly.

### 3. ?? Precision Point-to-Point Snapping & $\otimes$ Coincident Indicator
- **Problem in Original**: Canvas grid snap overshadowed component pin snaps, often leading to 0.05cm offsets and false/broken connections.
- **Solution**:
  - Implemented a tiered snapping priority engine: `Object Pin Points > Alignment Guides > Grid Points`.
  - Added a dedicated $\otimes$ (circumscribed circle) coincident visual indicator with sticky hysteresis, locking pin-to-pin connections with absolute precision.

### 4. ?? Consecutive Orthogonal Wire Engine (Hotkey `M`)
- **Problem in Original**: Lack of intuitive orthogonal wiring logic matching standard electronic schematic conventions.
- **Solution**: Created a multi-click consecutive orthogonal wiring tool (Hotkey `M`). Each click creates an anchor corner, supporting 4-directional orthogonal expansion using standard TikZ `\draw[thick, line cap=round] (x1,y1) -- (x2,y2);` syntax.

### 5. ?? Full 8-Variant Polarity Matrix & Dual-Axis Mirror System
- **Problem in Original**: Flipping components left Voltage/Current source polarities static, and MOS gate/drain/source orientations were difficult to mirror.
- **Solution**:
  - **`X` / `V`**: X-axis vertical symmetry (Top $\leftrightarrow$ Bottom, Drain $\leftrightarrow$ Source, $\pm$ polarities inverted, current arrows flipped).
  - **`Y` / `H`**: Y-axis horizontal symmetry (Left $\leftrightarrow$ Right, Gate orientation flipped, $\pm$ polarities inverted).
  - **`R`**: 90° clockwise rotation.
  - **`W` / `A` / `S` / `D`**: Instant directional orientation (Up / Left / Down / Right).
  - Built a comprehensive **8-variant polarity matrix** for Voltage and Current Sources (4 directions $\times$ 2 anchor pins).

### 6. ?? Standard MOS Schematic Component Library
- Integrated standardized TikZ templates for:
  - **nMOS & pMOS Transistors** (standard pin geometry, isolated labels)
  - **Resistors** ($R_D$) & **Capacitors**
  - **Voltage Sources** & **Current Sources** (full 8-state polarities)
  - **GND** & **VDD** Power Rails
  - **IO Ports** ($V_{in}, V_{out}$) & **Dot Nodes** (connection points)

### 7. ??? Robust Client-Side Bundling
- Eliminated browser bundle dependencies on Node.js native modules (`node:fs`), preventing Vite HMR crashes and white-screen build bugs.
- Comprehensive unit test coverage with 24/24 passing suites.

---

## ?? Complete Shortcut Keys Cheatsheet (快捷键全景速查表)

### 1. ?? Component Quick-Insert (选择模式下一键呼出元件)

| Key | Component | Description |
|:---|:---|:---|
| **`Z`** | **nMOS** Transistor | 放置 nMOS 晶体管（默认栅极在左） |
| **`Q`** | **pMOS** Transistor | 放置 pMOS 晶体管（默认栅极在左） |
| **`R`** | **Resistor** ($R_D$) | 放置电阻（默认竖直形态） |
| **`C`** | **Capacitor** | 放置电容 |
| **`E` / `I`** | **Current Source** | 放置电流源（8 态可选） |
| **`U` / `V`** | **Voltage Source** | 放置电压源（8 态可选） |
| **`A`** | **Current Arrow** | 放置电流方向指示箭头 |
| **`G`** | **GND** | 放置接地端（标准三线递减接地符号） |
| **`T`** | **IO Port** (Terminal) | 放置输入/输出端口 ($V_{in}, V_{out}$) |
| **`D`** | **Dot Node** (●) | 放置实心连接黑点节点 |
| **`V + D`** | **VDD** Power Rail | 放置 VDD 电源符号 |
| **`W`** | **Wire Lead** | 放置单段引出导线 |
| **`M`** | **Orthogonal Wire Tool** | 启动多段连续正交折线布线工具 |
| **`N`** | **General Node** | 放置标准 TikZ 文本/几何节点 |

---

### 2. ?? Component Placement & Orientation Tweaks (放置预览中实时微调)

| Key | Action | Description |
|:---|:---|:---|
| **`X` / `V`** | **Vertical Mirror (X-Axis)** | 沿 X 轴垂直镜像（Top $\leftrightarrow$ Bottom，D $\leftrightarrow$ S，正负极对调，箭头掉头） |
| **`Y` / `H`** | **Horizontal Mirror (Y-Axis)** | 沿 Y 轴水平镜像（Left $\leftrightarrow$ Right，栅极开口翻转，正负极左右翻转） |
| **`R`** | **Rotate 90°** | 顺时针 90° 连贯旋转（上 $\to$ 右 $\to$ 下 $\to$ 左） |
| **`W` / `A` / `S` / `D`** | **Direct Direction** | 一键定向到 上 / 左 / 下 / 右 预设形态 |
| **`G`** *(in MOS mode)* | **Gate Anchor** | 将 MOS 放置吸附锚点切换到**栅极 (Gate)** |
| **`D`** *(in MOS mode)* | **Drain Anchor** | 将 MOS 放置吸附锚点切换到**漏极 (Drain)** |
| **`S`** *(in MOS mode)* | **Source Anchor** | 将 MOS 放置吸附锚点切换到**源极 (Source)** |
| **`A` / `D`** *(in IO mode)* | **$V_{in}$ Port** | 切换为 $V_{in}$ 端口（左开 / 右开） |
| **`W` / `S`** *(in IO mode)* | **$V_{out}$ Port** | 切换为 $V_{out}$ 端口（左开 / 右开） |

---

### 3. ?? Element Selection & Canvas Editing (画布元素操作)

| Shortcut | Function | Description |
|:---|:---|:---|
| **`X` / `V`** | **Vertical Flip** | 对选中元件做垂直镜像对称 |
| **`Y` / `H`** | **Horizontal Flip** | 对选中元件做水平镜像对称 |
| **`R`** | **Rotate 90°** | 对选中元件进行 90° 旋转 |
| **`Delete` / `Backspace`** | **Delete** | 删除选中的元件或连线 |
| **`Ctrl` + `D`** | **Duplicate** | 原位复制选中元素 |
| **`Ctrl` + `C` / `Ctrl` + `V`** | **Copy / Paste** | 剪贴板复制 / 粘贴 |
| **`Ctrl` + `Z`** | **Undo** | 撤销上一步操作 |
| **`Ctrl` + `Shift` + `Z`** *(or `Ctrl`+`Y`)* | **Redo** | 重做操作 |
| **`Ctrl` + `G`** | **Group** | 将选中元素打组成组 (Scope) |
| **`Ctrl` + `Shift` + `G`** | **Ungroup** | 解除选中元素的分组 |
| **`Ctrl` + `]` / `Ctrl` + `[`** | **Layer Order** | 图层上移一层 / 下移一层 |
| **`Arrow Keys (↑ ↓ ← →)`** | **Nudge** | 按 0.05cm 步长微调位置（配合 `Shift` 键加速） |

---

### 4. ?? Viewport & Snapping Controls (视口漫游与磁吸控制)

| Shortcut / Interaction | Function | Description |
|:---|:---|:---|
| **`Space` + Left Drag** | **Canvas Pan** | 抓手漫游，顺畅平移无限画布 |
| **Middle Click Drag** | **Canvas Pan** | 鼠标中键拖拽平移画布 |
| **`Ctrl` + Mouse Wheel** | **Canvas Zoom** | 以鼠标指针为中心平滑无级缩放 |
| **`Ctrl` + `0`** | **Zoom 100%** | 重置为 1:1 实际比例 |
| **`Ctrl` + `1`** | **Zoom to Fit** | 自适应全图缩放 |
| **`Ctrl` (Hold during drag)** | **Bypass Snap** | 拖拽时临时完全关闭磁吸，自由微调位置 |
| **`Escape`** | **Cancel / Select** | 取消当前布线或工具，返回选择模式 |

---

## ??? Quick Start

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation & Run

```bash
# Clone the repository
git clone git@github.com:Pulala-180/tikz-editor-MOS-circuit.git
cd tikz-editor-MOS-circuit

# Install monorepo dependencies
npm install

# Start development server with HMR
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## ?? License
MIT (Inherited from original [DominikPeters/tikz-editor](https://github.com/DominikPeters/tikz-editor))
