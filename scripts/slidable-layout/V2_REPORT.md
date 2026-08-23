# slidable-layout v2 落地说明

## 核心变化

1. **生成树 + 弦**：定位 parent 无环；所有反馈/并联边最后作为 chord 绘制。
2. **单轴关节**：每个非 root scope 只保留 `xshift` 或 `yshift` 之一。
3. **bus 路由**：长距离反馈线不再用一段 `-|` 硬冲，而是经过命名 bus 锚点：
   - `bus_cross_top` / `bus_cross_bot`：P→M5、Q→M6 交叉反馈；
   - `bus_col_L` / `bus_col_R` + `bus_out_L` / `bus_out_R`：P→M1、Q→M3 绕行；
   - `bus_vb`：M11/M12 栅极偏置线。
4. **M11/M12 栅极改为相对朝内**，Vb 横线从两管之间穿过，不再穿过元件本体。
5. **不可见热区收窄**：bus 的 `opacity=0.01` 节点只覆盖实际线段，不遮挡元件拖拽手柄。
6. **生成前校验**：`generator_v2.py` 检查 parent 先定义、无环、单轴、锚点存在、chord 无硬编码折点。

## 文件

- `generator_v2.py`：v2 生成器 + 校验器；
- `netlists/slew_rate_enhancer_v2.json`：带 `nets` 与多段 route 的网表；
- `run_generator_v2.cmd` / `run_render_v2.cmd`：生成 / 渲染；
- `run_verify.cmd`：一键「生成 → pdflatex → PNG → 复制原图 → VisionMax 差异审查」；
- 同步文件：`E:\tikz-editor-master\tikz-editor-master\apps\web\agent-sync\active-drawing.tex`（已写入 v2）。

## 验证命令

```bat
cd /d E:\tikz-editor-master\tikz-editor-master\scripts\slidable-layout
run_verify.cmd "D:\path\to\original_circuit.png"
```

输出：

- `original_circuit.png`
- `v2-preview-1.png`
- `gemini_diff_v2.md`

看到 diff 后只改 critical/major，回到 JSON 重跑即可。
