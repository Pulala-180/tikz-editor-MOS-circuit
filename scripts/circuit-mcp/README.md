# circuit-editor MCP

让 Claude Code 识别电路图片（电阻 / nMOS / pMOS）、分析器件位置与端口连接关系，
并自动生成 TikZ 电路写入 TikZ 编辑器 —— 浏览器通过 Vite HMR 实时更新。

## 工作流

```
用户发电路图片
   ↓
Claude（视觉）识别器件类型、大致位置、端口连接
   ↓  可选：analyze_circuit_image（OCR 提取图片中的文字标签，核对器件标注）
   ↓
apply_circuit(components, wires)
   ↓
验证 → 计算精确端口坐标 → 生成 TikZ → 覆写 active-drawing.tex
   ↓
Vite HMR → 编辑器实时渲染
```

## 安装

```bash
# 1. 安装依赖（mcp SDK；rapidocr 仅用于图片文字标签提取，可选）
D:\python-libs\Scripts\pip.exe install "mcp>=2.0"
D:\python-libs\Scripts\pip.exe install rapidocr        # 可选

# 2. 注册到 Claude Code
claude mcp add -s user circuit-editor -- D:\python-libs\Scripts\python.exe \
  E:\tikz-editor-master\tikz-editor-master\scripts\circuit-mcp\server.py

# 3. 验证
claude mcp list          # 应显示 circuit-editor ✔ Connected
```

重启 Claude Code 会话后，`/mcp` 中可见该服务器。

## 工具

| 工具 | 说明 |
|------|------|
| `apply_circuit` | 核心。接收完整电路描述（组件 + 导线），校验后生成 TikZ 并写入同步文件 |
| `list_components` | 查看器件模板：端口命名（电阻 P1/P2，MOS 管 G/D/S）、局部坐标、原始代码 |
| `analyze_circuit_image` | OCR 提取图片中的文字标签（R1、M2、Vdd…），辅助核对标注 |
| `reset_circuit` | 清空画布（写入空 tikzpicture） |
| `get_drawing` | 读取当前同步文件内容 |

资源：`tikz://active-drawing` —— 当前画布源码。

## apply_circuit 输入格式

```jsonc
{
  "components": [
    { "id": "M1", "type": "nmos", "x": 0, "y": 0, "label": "$M_1$" },   // 原点为该器件插入点
    { "id": "R1", "type": "resistor", "x": 0.05, "y": 2.6, "label": "$R_D$" }
  ],
  "wires": [
    { "id": "w1", "from": "M1.G",      "to": "R1.P2" },                 // 端口引用：<组件id>.<端口>
    { "id": "w2", "from": "R1.P1",     "to": { "x": -0.3, "y": 3.6 } }, // 自由端点（如接 Vdd）
    { "id": "w3", "from": "M1.S",      "to": { "x": 0.433, "y": -1.0 } }
  ],
  "junction_dots": true   // 三线以上交汇点自动打结点（默认 true）
}
```

端口命名：电阻 `P1`（左）/ `P2`（右）；nMOS/pMOS `G`（栅）/ `D`（漏）/ `S`（源）。

返回：`ok`、生成的完整 TikZ、每个组件端口的**全局坐标**（用于核对/微调）、结点位置、
写入的文件路径。输入有误时返回 `ok: false` 和可操作的错误说明，不会写入文件。

## 坐标约定

- 单位 cm；`(x, y)` 是组件的插入原点（与工具栏插入的位置语义一致）。
- 生成代码与工具栏 `insertResistor` / `insertMosfet` / `insertPmos` 逐字一致，
  渲染结果与手动插入完全相同（nMOS 的 `xshift=-17pt, yshift=4pt` 已折算进 scope 偏移）。
- 从图片估计位置即可：`apply_circuit` 会返回每个端口的实际坐标，发现接偏了就在
  下一次调用中微调 `x/y`（整个文件会被重新生成，幂等）。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `CIRCUIT_SYNC_FILE` | 同步文件路径（编辑器监听此文件热更新） | `apps/web/agent-sync/active-drawing.tex` |

## 测试

```bash
cd scripts/circuit-mcp
D:\python-libs\Scripts\python.exe -m unittest tests.test_builder -v        # 单元测试：端口数学、校验、代码生成
D:\python-libs\Scripts\python.exe -m unittest tests.test_integration -v   # 集成测试：stdio 协议端到端
```

## 结构

```
scripts/circuit-mcp/
├── server.py            # MCP 服务器（stdio），工具定义
├── circuit/
│   ├── components.py    # 器件模板（与 Toolbar.tsx 逐字一致）+ 端口数学
│   ├── builder.py       # 校验 + TikZ 生成
│   └── ocr.py           # RapidOCR 标签提取（可选辅助）
├── tests/
└── requirements.txt
```

## 已知限制

- 识别环节依赖视觉模型（Claude）直接从图片分析器件与连接；OCR 只补充文字标签。
- 每次 `apply_circuit` 会整体覆写同步文件 —— 与工具栏手动插入的代码共存时，
  请用 `get_drawing` 先取当前内容，把手动部分合并进 `components`/`wires` 再重新提交。
