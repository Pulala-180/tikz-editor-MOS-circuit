"""MOS-circuit 结构校验器：把 skill 的范式约束变成可检查的规则。

面向"模型按 skill 直接书写的相对级联 TikZ"（8 大元件各自独立 scope、
shift 依附链、锚点命名规约、\normalsize 标注、正交弦）。实现为轻量
行级 tokenizer + 正则，不引入完整 AST；纯函数、可单测。

规则清单：
- scope-isolation       8 大核心元件必须各自独立 scope，禁止画在 scope 外（error）
- no-global-coordinate  顶层禁止全局 \coordinate（相对定位法则）（error）
- anchor-naming         锚点命名须符合 node_<id>_<d|g|s> / _c / _branch_<L|R|U|D>
                        等规约（warning）
- font-size             标注必须 \normalsize，禁止 \large/\huge/\small（error）
- dynamic-pgf           禁止 \pgfgetlastxy 等动态 PGF 宏（会挂前端 AST parser）（error）
- opacity-zero          禁止 opacity=0（前端 parser 依赖 0.01）（error）
- orthogonal-chords     弦/跨 scope 连接必须正交 |- / -|（error——
                        skill：DO NOT use straight lines for chords）
- anchor-resolution     引用的命名锚点必须已定义（error）
- node-completeness     黑点节点 scope 必须含 circle（启发式）（warning）
- wire-lock             进线归己法则：非根元件 scope 的进线必须按名引用父级锚点，
                        纯局部坐标的进线拖拽时会与父级断连（error）
- hit-target            Rule 10：中间路由段 scope（非元件）必须带 opacity=0.01
                        隐形热区垫片，否则转折线/中间段无法手调（warning）
- component-pad         垫片白名单：只允许中间路由段与微小端子（黑点节点含 Vb、
                        空心 IO 端子 Vin/Vout）；严禁 5 大元件（nMOS/pMOS/R/C/GND/VDD）
                        scope 内加垫片（error）
- io-circle-last        IO 端子空心圆必须是 scope 内最后一条 \draw 命令，
                        否则导线会盖住端子圆（error；\node 标签允许在圆后）

注意：\pgfmathsetmacro 等前端 grammar 已支持的宏不报违规。
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# ---------------------------------------------------------------------------
# 规则产物
# ---------------------------------------------------------------------------


@dataclass
class Violation:
    rule: str
    severity: str  # "error" | "warning"
    message: str
    location: int | None = None  # 1-based 行号


# ---------------------------------------------------------------------------
# 8 大核心元件的特征标记（源自 skill 元件库的原始 TikZ 片段）
# ---------------------------------------------------------------------------

COMPONENT_MARKERS: dict[str, list[str]] = {
    # 箭头线是 -0.03 终点；nMOS 上排线终点是 0，不能把 Triangle 与任意
    # (-0.33, ±0.2) 组合当 pMOS/nMOS（否则上排线会误判）
    "nMOS": [r"Triangle\[", r"\(-0\.33,-0\.2\)\s*--\s*\(-0\.03,-0\.2\)"],
    "pMOS": [r"Triangle\[", r"\(-0\.33,0\.2\)\s*--\s*\(-0\.03,0\.2\)"],
    # 电阻锯齿家族（或关系）：
    # - 水平经典点 (0.1875,0.15)（skill 元件库；Toolbar 方言电阻无此点，不会被误认）；
    # - 纵向锯齿：x 交替 ±0.15（规范纵向款、ro 款 (0.15,-0.48)、rO2 款 (0.15,0.28)
    #   等所有变体）
    "Resistor": [
        r"\(0\.1875,0\.15\)|\(0\.15,\s*[-\d.]+\)\s*--\s*\(-0\.15,\s*[-\d.]+\)",
    ],
    "Capacitor": [r"\(0\.1,\s*-0\.25\)|\(-0\.06,\s*-0\.25\)"],
    "GND": [r"\(-0\.06,\s*-0\.2\)\s*--\s*\(0\.06,\s*-0\.2\)"],
    # VDD 两种轨宽是"或"关系（同一类型内 all() 为与，变体必须并进一个模式）：
    # 元件库正版 (-0.95,0)--(0.9,0)，真实画布常被拉宽为宽轨
    "VDD": [
        r"\(-0\.95,\s*0\)\s*--\s*\(0\.9,\s*0\)|\(-4\.5,\s*0\)\s*--\s*\(4\.5,\s*0\)",
    ],
    "BlackNode": [r"fill=black[^;]*circle\s*\(0\.055cm\)"],
    "IONode": [r"fill=white[^;]*circle\s*\(0\.055cm\)"],
    # 电流源（用户 2026-08-07 定义）：1.8mm/1.7mm 箭头 + 0.25cm 圆。
    # 与规则是 AND 关系：只有箭头没有圆的 scope 仍判未定义（如旧 2.5mm 夹具）
    "CurrentSource": [
        r"Triangle\[length=1\.8mm,\s*width=1\.7mm\]",
        r"circle\s*\(0\.25cm\)",
    ],
    # 电压源（用户 2026-08-07 定义）：0.25cm 圆 + rotate=90 极性短线（无箭头）——
    # 与电流源（圆 + 箭头）靠 rotate=90 区分
    "VoltageSource": [
        r"circle\s*\(0\.25cm\)",
        r"rotate=90",
    ],
    # 电流箭头（用户 2026-08-07 定义）：1.8mm/1.7mm 箭头 + 短引线 (0,-0.15)--(0,-0.25)、
    # 无圆——与电流源（引线 ±0.4）靠短引线区分
    "CurrentArrow": [
        r"Triangle\[length=1\.8mm,\s*width=1\.7mm\]",
        r"\(0,\s*-0\.15\)\s*--\s*\(0,\s*-0\.25\)",
    ],
}

COMPONENT_MARKER_RE: dict[str, list[re.Pattern]] = {
    ctype: [re.compile(p) for p in pats] for ctype, pats in COMPONENT_MARKERS.items()
}

# 锚点命名规约（宽松版：同时接受 node_ 前缀与元件库的裸端口名）
ANCHOR_NAME_RE = re.compile(
    r"^node_\w+_(d|g|s)$"
    r"|^node_\w+_c$"
    r"|^node_\w+_branch_[LRUD]$"
    r"|^\w+_(left|right|top|bottom)$"
    r"|^\w+_(d|g|s)$"
)

COORDINATE_RE = re.compile(r"\\coordinate\s*\(([A-Za-z_]\w*)\)")
SCOPE_BEGIN_RE = re.compile(r"\\begin\{(scope|tikzpicture)\}")
SCOPE_END_RE = re.compile(r"\\end\{(scope|tikzpicture)\}")
NODE_FONT_RE = re.compile(r"\\node[^;]*(\\large|\\Large|\\huge|\\Huge|\\small)")
DYNAMIC_PGF_RE = re.compile(
    r"\\pgfgetlastxy|\\pgfextractx|\\pgfextracty|\\pgfpointanchor"
)
OPACITY_ZERO_RE = re.compile(r"opacity\s*=\s*0(?!\.\d)")
PLAIN_ANCHOR_PAIR_RE = re.compile(
    r"\(([A-Za-z_]\w*)\)\s*--\s*\(([A-Za-z_]\w*)\)"
)
REFERENCE_RE = re.compile(r"\(([A-Za-z_]\w*)\)")
SHIFT_REF_RE = re.compile(r"shift=\{\s*\(([A-Za-z_]\w*)\)\s*\}")
# 坐标表达式引用：\coordinate (P) at (0,0 -| node_gm_branch_U); —— 并联支路端口
# 用 -|/|- 表达式锁定总线 y，表达式里的父锚点名必须算进 wire-lock 引用
EXPR_REF_RE = re.compile(r"(?:\|-|-\|)\s*([A-Za-z_]\w*)")
NODE_COORD_RE = re.compile(r"\\coordinate\s*\(node_\w+_c\)")
CIRCLE_RE = re.compile(r"circle\s*\(0\.055cm\)")
# 根元件（基准起点法则）：scope 原点即 (0,0)，无父级可锁定
ROOT_SHIFT_RE = re.compile(r"shift=\{\s*\(0\s*,\s*0\)\s*\}")
# 垫片白名单：中间路由段 + 微小端子（黑点节点、空心 IO 端子——Vin/Vout/Vb 都小，
# 必须靠垫片才好抓）；严禁的是 5 个大元件（nMOS/pMOS/R/C/GND/VDD），
# 它们有自己的拖拽句柄，垫片只会造成误点
PAD_WHITELIST = {"BlackNode", "IONode"}
PAD_RE = re.compile(r"opacity=0\.01")
# 未定义元件检测：非 MOS 通道箭头（1.6mm）的 Triangle 箭头 = 未确认元件
# （如电流源 2.5mm）——元件白名单政策：未定义的元件必须经用户同意才允许使用。
# 已批准形态：电流源 1.8mm/1.7mm + 0.25cm 圆（COMPONENT_MARKERS["CurrentSource"]，
# 识别后不会落入此规则）
UNDEFINED_ARROW_RE = re.compile(r"Triangle\[(?!length=1\.6mm)")
# 小信号标注（用户 2026-08-07 严令）：电流源/电压源/电流箭头只用于小信号模型，
# \node 标签首字母必须小写（$v$/$i$），大写（$V$/$I$ 是大信号符号）报 error。
# 提取 \node ... {..} 花括号文本，先剥掉 \command（如 \normalsize）再找首字母
SMALL_SIGNAL_MARKERS = frozenset({"CurrentSource", "VoltageSource", "CurrentArrow"})
LABEL_BRACE_RE = re.compile(r"\\node[^;]*\{([^}]*)\}")
COMMAND_STRIP_RE = re.compile(r"\\[A-Za-z]+")


def _detect_component_types(text: str) -> set[str]:
    found: set[str] = set()
    for ctype, pats in COMPONENT_MARKER_RE.items():
        if all(p.search(text) for p in pats):
            found.add(ctype)
    return found


def _parse_scope_ranges(
    lines: list[str],
) -> list[tuple[int, int]]:
    """返回所有 \begin{scope}..\end{scope} 的行区间 [start, end)。"""
    ranges: list[tuple[int, int]] = []
    stack: list[int] = []
    for i, ln in enumerate(lines):
        if SCOPE_BEGIN_RE.search(ln):
            if "scope" in ln:
                stack.append(i)
        if SCOPE_END_RE.search(ln):
            if "scope" in ln and stack:
                ranges.append((stack.pop(), i + 1))
    return ranges


def _in_scope(ranges: list[tuple[int, int]], line_index: int) -> bool:
    return any(s <= line_index < e for s, e in ranges)


def validate_drawing(source: str) -> list[Violation]:
    """校验相对级联 TikZ 源码，返回违规清单（空列表 = 合规）。"""
    vs: list[Violation] = []
    lines = source.splitlines()
    ranges = _parse_scope_ranges(lines)

    # 每个 scope 内的元件类型 + 该 scope 定义的锚点
    scope_types: list[set[str]] = []
    scope_anchors: list[set[str]] = []
    for s, e in ranges:
        body = "\n".join(lines[s:e])
        types = _detect_component_types(body)
        scope_types.append(types)
        anchors = set(COORDINATE_RE.findall(body))
        scope_anchors.append(anchors)
        if len(types) >= 2:
            vs.append(
                Violation(
                    "scope-isolation",
                    "error",
                    f"scope 第 {s + 1} 行起包含多个基础元件"
                    f"（{', '.join(sorted(types))}）：8 大核心元件必须各自独立 scope 封装",
                    s + 1,
                )
            )
        if NODE_COORD_RE.search(body) and not CIRCLE_RE.search(body):
            vs.append(
                Violation(
                    "node-completeness",
                    "warning",
                    f"第 {s + 1} 行起的黑点节点 scope 缺少圆点"
                    r"（\draw[fill=black] ... circle (0.055cm)）",
                    s + 1,
                )
            )
        # 该 scope 引用的命名锚点：draw 中的普通引用 + \coordinate 表达式 (-|/|-)
        # 中的父锚点引用（元件笔画是纯局部坐标，路由段/进线/表达式端口引用锚点）
        refs: set[str] = set()
        for ln in lines[s:e]:
            if "\\draw" in ln:
                refs |= set(REFERENCE_RE.findall(ln))
            elif "\\coordinate" in ln:
                refs |= set(EXPR_REF_RE.findall(ln))

        # Rule 10：中间路由段（无元件特征但引用了命名锚点的 scope，如转折线中间段）
        # 必须带隐形热区垫片（opacity=0.01），否则 UI 拿不到拖拽句柄、无法手调。
        # 纯局部坐标的 scope（如 Toolbar 方言的元件 body）不是路由段，不适用。
        if not types and refs and not re.search(r"opacity=0\.01", body):
            vs.append(
                Violation(
                    "hit-target",
                    "warning",
                    f"第 {s + 1} 行起的中间路由段 scope 缺少隐形热区垫片"
                    r"（\node[..., fill=white, opacity=0.01] ...）："
                    "转折线/中间段将无法手调",
                    s + 1,
                )
            )

        # IO 端子空心圆必须是 scope 内最后一条 \draw（否则导线盖住端子圆）。
        # 只查 \draw：\node 标签允许在圆后（文字在最上层是正常的）。
        if "IONode" in types:
            io_circle_line: int | None = None
            last_draw_line: int | None = None
            for ln_i in range(s, e):
                ln = lines[ln_i]
                if "\\draw" in ln:
                    last_draw_line = ln_i
                    if io_circle_line is None and COMPONENT_MARKER_RE["IONode"][0].search(ln):
                        io_circle_line = ln_i
            if (
                io_circle_line is not None
                and last_draw_line is not None
                and io_circle_line < last_draw_line
            ):
                vs.append(
                    Violation(
                        "io-circle-last",
                        "error",
                        f"第 {io_circle_line + 1} 行的空心圆必须画在 scope 内"
                        "所有 \\draw 之后（它是端子本体，最后画才不被导线盖住）",
                        io_circle_line + 1,
                    )
                )

        # 元件白名单：未定义元件（非标准 Triangle 箭头等）必须报违规——
        # 只允许用户定义/确认的元件形态，未确认的一律要经用户同意
        if not types and UNDEFINED_ARROW_RE.search(body):
            vs.append(
                Violation(
                    "undefined-component",
                    "error",
                    f"第 {s + 1} 行起的 scope 疑似未定义的元件"
                    "（非 MOS 通道箭头）：元件白名单政策——未定义元件必须经用户"
                    "同意后才允许使用，不得擅自绘制",
                    s + 1,
                )
            )

        # 小信号标注：电流源/电压源/电流箭头 scope 的 \node 标签首字母必须小写
        if types & SMALL_SIGNAL_MARKERS:
            for ln_i in range(s, e):
                ln = lines[ln_i]
                if "\\node" not in ln:
                    continue
                m = LABEL_BRACE_RE.search(ln)
                if not m:
                    continue
                text = COMMAND_STRIP_RE.sub("", m.group(1))
                for ch in text:
                    if ch.isalpha():
                        if ch.isupper():
                            vs.append(
                                Violation(
                                    "small-signal-label",
                                    "error",
                                    f"第 {ln_i + 1} 行："
                                    f"{', '.join(sorted(types & SMALL_SIGNAL_MARKERS))} 的标注"
                                    f"以大写字母 {ch!r} 开头（{m.group(1)!r}）——小信号模型"
                                    "标注必须小写（如 $v$/$i$，$V$/$I$ 是大信号符号）",
                                    ln_i + 1,
                                )
                            )
                        break

        # 垫片白名单：白名单外的大元件 scope 严禁 opacity=0.01 垫片
        forbidden = types - PAD_WHITELIST
        if forbidden and PAD_RE.search(body):
            vs.append(
                Violation(
                    "component-pad",
                    "error",
                    f"第 {s + 1} 行起的元件 scope（{', '.join(sorted(forbidden))}）"
                    "内严禁加垫片（opacity=0.01）：垫片只允许中间路由段与黑点节点使用，"
                    "大元件有自己的拖拽句柄，垫片会造成误点",
                    s + 1,
                )
            )

        # 进线归己法则：非根元件 scope 必须至少有一条 draw 按名引用外部（父级）锚点。
        # 纯局部坐标的进线（如 (0,-0.5) -- (0,-1.0)）在拖拽 scope 时端点随整体平移，
        # 而父锚点留在原地 → 断连。shift 引用不算数——拖拽改写的正是 shift。
        if types and not ROOT_SHIFT_RE.search(lines[s]):
            if not (refs - anchors):
                vs.append(
                    Violation(
                        "wire-lock",
                        "error",
                        f"第 {s + 1} 行起的元件 scope（{', '.join(sorted(types))}）"
                        "进线未按名引用父级锚点：导线端只是局部坐标，拖拽时与父级"
                        r"输出端会断连。正版写法：\draw[thick] (0, -0.5) |- (父锚点名);",
                        s + 1,
                    )
                )

    # 顶层检查：元件画在 scope 外 / 全局 \coordinate / 命名 / 字号 / 动态宏 / opacity
    all_anchors: set[str] = set()
    anchor_scope: dict[str, int] = {}
    for idx, anchors in enumerate(scope_anchors):
        all_anchors |= anchors
        for a in anchors:
            anchor_scope[a] = idx

    for i, ln in enumerate(lines):
        if _in_scope(ranges, i) or SCOPE_BEGIN_RE.search(ln) or SCOPE_END_RE.search(ln):
            continue
        types = _detect_component_types(ln)
        if types:
            vs.append(
                Violation(
                    "scope-isolation",
                    "error",
                    f"第 {i + 1} 行：{', '.join(sorted(types))} 画在 scope 之外，"
                    "8 大核心元件必须各自独立 scope 封装",
                    i + 1,
                )
            )
        if re.search(r"\\coordinate\b", ln):
            vs.append(
                Violation(
                    "no-global-coordinate",
                    "error",
                    f"第 {i + 1} 行：顶层禁止全局 \\coordinate"
                    "（相对定位法则：锚点必须定义在元件自己的 scope 内）",
                    i + 1,
                )
            )

    # 命名规约（所有 \coordinate 定义）
    for i, ln in enumerate(lines):
        for name in COORDINATE_RE.findall(ln):
            if not ANCHOR_NAME_RE.match(name):
                vs.append(
                    Violation(
                        "anchor-naming",
                        "warning",
                        f"第 {i + 1} 行：锚点 {name!r} 不符合命名规约"
                        "（node_<id>_<d|g|s> / node_<名>_c / node_<名>_branch_<L|R|U|D>）",
                        i + 1,
                    )
                )

    # 字号铁律
    for i, ln in enumerate(lines):
        m = NODE_FONT_RE.search(ln)
        if m:
            vs.append(
                Violation(
                    "font-size",
                    "error",
                    f"第 {i + 1} 行：标注禁止 {m.group(1)}，必须使用 \\normalsize",
                    i + 1,
                )
            )

    # 动态 PGF 宏
    for i, ln in enumerate(lines):
        if DYNAMIC_PGF_RE.search(ln):
            vs.append(
                Violation(
                    "dynamic-pgf",
                    "error",
                    f"第 {i + 1} 行：禁止动态 PGF 宏（\\pgfgetlastxy 等）——"
                    "会挂掉前端 AST parser",
                    i + 1,
                )
            )

    # opacity=0
    for i, ln in enumerate(lines):
        if OPACITY_ZERO_RE.search(ln):
            vs.append(
                Violation(
                    "opacity-zero",
                    "error",
                    f"第 {i + 1} 行：opacity=0 会让前端 parser 丢失拖拽热区，"
                    "必须用 opacity=0.01",
                    i + 1,
                )
            )

    # 锚点引用完整性 + 弦正交性
    for i, ln in enumerate(lines):
        if not (re.search(r"\\draw\b", ln) or SHIFT_REF_RE.search(ln)):
            continue
        # shift 引用
        for name in SHIFT_REF_RE.findall(ln):
            if name not in all_anchors:
                vs.append(
                    Violation(
                        "anchor-resolution",
                        "error",
                        f"第 {i + 1} 行：shift 引用的锚点 {name!r} 未定义",
                        i + 1,
                    )
                )
        if "\\draw" not in ln:
            # \coordinate 表达式中的父锚点引用也要解析
            for name in EXPR_REF_RE.findall(ln):
                if name not in all_anchors:
                    vs.append(
                        Violation(
                            "anchor-resolution",
                            "error",
                            f"第 {i + 1} 行：坐标表达式引用了未定义的锚点 {name!r}",
                            i + 1,
                        )
                    )
            continue
        # draw 中的命名锚点引用
        for name in REFERENCE_RE.findall(ln):
            if name not in all_anchors:
                vs.append(
                    Violation(
                        "anchor-resolution",
                        "error",
                        f"第 {i + 1} 行：导线/图形引用了未定义的锚点 {name!r}",
                        i + 1,
                    )
                )
        # 正交弦：-- 连接两个已定义锚点，且画在顶层或跨 scope
        if ("--" in ln) and ("|-" not in ln) and ("-|" not in ln):
            m = PLAIN_ANCHOR_PAIR_RE.search(ln)
            if m:
                a, b = m.group(1), m.group(2)
                if a in all_anchors and b in all_anchors:
                    top_level = not _in_scope(ranges, i)
                    cross_scope = anchor_scope.get(a) != anchor_scope.get(b)
                    if top_level or cross_scope:
                        vs.append(
                            Violation(
                                "orthogonal-chords",
                                "error",
                                f"第 {i + 1} 行：连接 {a!r} 与 {b!r} 的弦禁止直线"
                                "（DO NOT use straight lines for chords）——必须用"
                                "正交路由（|- 或 -|），否则拖拽时撕裂",
                                i + 1,
                            )
                        )

    return vs


def is_valid(source: str) -> bool:
    """是否零违规（无 error 也无 warning）。"""
    return not validate_drawing(source)
