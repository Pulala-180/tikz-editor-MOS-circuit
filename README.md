# TikZ Editor (MOS Circuit & High-Performance Edition)

> 💡 **Upstream Attribution**: This project is an enhanced, performance-optimized, and schematic-specialized fork of the original open-source [**tikz-editor by Dominik Peters**](https://github.com/DominikPeters/tikz-editor).

An intuitive, high-performance visual TikZ editor tailored for electronic schematics (especially MOS analog/digital circuits) and general scientific illustrations, featuring real-time bidirectional AST synchronization, 160+ FPS transient DOM kinetics, elastic wire follow, and precision pin snapping.

---

## 🚀 Key Enhancements & Adaptive Designs (vs. Original Project)

### 1. ⚡ Transient Direct DOM Drag Optimization (160+ FPS)
- **Problem in Original**: Every pixel of element movement triggered full-pipeline AST parsing, geometry re-calculation, and React virtual DOM reconciliation, resulting in 20~30 FPS lag and jitter on complex schematics.
- **Solution**: Engineered a direct DOM transform transient interaction layer (inspired by Visio & Draw.io). During mouse drags, high-overhead parser pipelines are completely bypassed for butter-smooth **160+ FPS** rendering, with single-transaction atomic AST commits upon mouse release.

### 2. 🔗 Real-Time Elastic Wire-Follow Kinetics (120 FPS)
- **Problem in Original**: Moving a transistor or component broke all connected wires, requiring tedious manual re-routing.
- **Solution**: Built an intelligent topology wire-follow engine. Moving any component dynamically stretches, translates, and folds attached wire segments in real time (120 FPS), preserving circuit topology effortlessly.

### 3. 🎯 Precision Point-to-Point Snapping & $\otimes$ Coincident Indicator
- **Problem in Original**: Canvas grid snap overshadowed component pin snaps, often leading to 0.05cm offsets and false/broken connections.
- **Solution**:
  - Implemented a tiered snapping priority engine: `Object Pin Points > Alignment Guides > Grid Points`.
  - Added a dedicated $\otimes$ (circumscribed circle) coincident visual indicator with sticky hysteresis, locking pin-to-pin connections with absolute precision.

### 4. 📐 Consecutive Orthogonal Wire Engine (Hotkey `M`)
- **Problem in Original**: Lack of intuitive orthogonal wiring logic matching standard electronic schematic conventions.
- **Solution**: Created a multi-click consecutive orthogonal wiring tool (Hotkey `M`). Each click creates an anchor corner, supporting 4-directional orthogonal expansion using standard TikZ `\draw[thick, line cap=round] (x1,y1) -- (x2,y2);` syntax.

### 5. 🔄 Full 8-Variant Polarity Matrix & Dual-Axis Mirror System
- **Problem in Original**: Flipping components left Voltage/Current source polarities static, and MOS gate/drain/source orientations were difficult to mirror.
- **Solution**:
  - **`X` / `V`**: X-axis vertical symmetry (Top $\leftrightarrow$ Bottom, Drain $\leftrightarrow$ Source, $\pm$ polarities inverted, current arrows flipped).
  - **`Y` / `H`**: Y-axis horizontal symmetry (Left $\leftrightarrow$ Right, Gate orientation flipped, $\pm$ polarities inverted).
  - **`R`**: 90° clockwise rotation.
  - **`W` / `A` / `S` / `D`**: Instant directional orientation (Up / Left / Down / Right).
  - Built a comprehensive **8-variant polarity matrix** for Voltage and Current Sources (4 directions $\times$ 2 anchor pins).

### 6. 🔌 Standard MOS Schematic Component Library
- Integrated standardized TikZ templates for:
  - **nMOS & pMOS Transistors** (standard pin geometry, isolated labels)
  - **Resistors** ($R_D$) & **Capacitors**
  - **Voltage Sources** & **Current Sources** (full 8-state polarities)
  - **GND** & **VDD** Power Rails
  - **IO Ports** ($V_{in}, V_{out}$) & **Dot Nodes** (connection points)

### 7. 🛡️ Robust Client-Side Bundling
- Eliminated browser bundle dependencies on Node.js native modules (`node:fs`), preventing Vite HMR crashes and white-screen build bugs.
- Comprehensive unit test coverage with 24/24 passing suites.

---

## ⌨️ Shortcut Keys Cheatsheet

| Key | Function | Description |
|:---|:---|:---|
| **`M`** | Orthogonal Wire Tool | Click to start routing, click corners to turn, double click/Enter to finish |
| **`X` / `V`** | Vertical Mirror (X-Axis) | Inverts vertical polarity, swaps Top/Bottom pins (D $\leftrightarrow$ S) |
| **`Y` / `H`** | Horizontal Mirror (Y-Axis) | Inverts horizontal polarity, swaps Left/Right gate orientation |
| **`R`** | Rotate 90° | Clockwise rotation through all 4 orthogonal orientations |
| **`W` / `A` / `S` / `D`** | Direct Orientation | Instant switch to Up / Left / Down / Right variant |
| **`Space` + Drag** | Canvas Pan | Smooth infinite canvas panning |
| **`Ctrl` + Scroll** | Canvas Zoom | Fluid zoom centered at cursor |

---

## 🛠️ Quick Start

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation & Run

```bash
# Clone the repository
git clone git@github.com:Pulala-180/tikz-editor-personalized.git
cd tikz-editor-personalized

# Install monorepo dependencies
npm install

# Start development server with HMR
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📄 License
MIT (Inherited from original [DominikPeters/tikz-editor](https://github.com/DominikPeters/tikz-editor))
