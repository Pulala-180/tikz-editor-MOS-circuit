# slidable-layout

不用 MCP。纯本地流程：

1. 视觉识别（我 / Gemini / VisionMax）输出结构化 JSON 网表；
2. `generator_v2.py` 按「生成树 + 弦 + 单轴滑轨」生成 TikZ；
3. 写入 `apps/web/agent-sync/active-drawing.tex`；
4. 编译导出 PNG 后，把「原图 + 导出图」一起交给 Gemini 做差异审查；
5. 根据差异表修改 JSON 或布局提示，重新生成。

## 一键生成 + 渲染 + Gemini 验证

```bat
cd /d E:\tikz-editor-master\tikz-editor-master\scripts\slidable-layout
run_verify.cmd "D:\path\to\original_circuit.png"
```

输出：

- `original_circuit.png`：原图副本
- `v2-preview-1.png`：生成的 TikZ 渲染图
- `gemini_diff_v2.md`：VisionMax 差异审查报告

## 只生成 / 只渲染

```bat
run_generator_v2.cmd
run_render_v2.cmd
```

## JSON 约定（v2）

- `components`: 元件清单。每个非 root 元件有 `parent`、`axis`（`x`/`y`）、`gap`（cm）、
  `type`、`label`；root 是整图总把手。
- `bus`: 水平/垂直路由轨道，是一个带不可见热区的单轴 scope。
- `chords`: 非树边，最后画。支持：
  - `route: "-|"` / `"|-"`：单折正交弦；
  - `route: "tap"` / `"tap_h"`：垂直/水平接轨；
  - `route: "bus"` / `"bus_h"`：三段式自愈折线，中段挂在命名 bus 锚点上；
  - `route: "corner_bus"`：五段式 L 形绕线，`corner` 是垂直通道，`bus` 是水平通道。
- `nets`: 完整电气网表（仅校验用，不参与定位）。

## 强制校验

`generator_v2.py` 在生成前强制检查：

1. 每个非 root 元件恰好一个 parent，parent 必须先于子元件定义；
2. parent 依赖无环；
3. 每个非 root scope 恰好单轴（xshift 或 yshift）；
4. chord 端点引用的锚点必须存在；
5. chord 内禁止硬编码绝对坐标折点。
