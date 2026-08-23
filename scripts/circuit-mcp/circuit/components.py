"""Component templates for the TikZ circuit editor.

Templates are copied verbatim from the editor toolbar
(packages/app/src/ui/Toolbar.tsx, insertResistor / insertMosfet / insertPmos),
so generated components render pixel-identically to toolbar-inserted ones.

The nMOS toolbar code wraps its body in ``\\begin{scope}[xshift=-17pt, yshift=4pt]``.
We keep that offset as ``scope_offset_pt`` and fold it into the per-component
scope shift when placing the component at an arbitrary (x, y) position.

Port coordinates are the local coordinates (inside the scope) where the
component's leads terminate — wires must start/end exactly there.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# 1 cm = 28.452756 pt (TeX)
PT_PER_CM = 28.452756


@dataclass(frozen=True)
class Port:
    name: str
    x: float  # local coordinate, cm
    y: float  # local coordinate, cm


@dataclass(frozen=True)
class ComponentTemplate:
    type: str
    ports: tuple[Port, ...]
    scope_offset_pt: tuple[float, float] = (0.0, 0.0)
    tikz_body: str = ""
    label_node: str = ""
    default_label: str = ""
    description: str = ""

    def port(self, name: str) -> Port | None:
        for p in self.ports:
            if p.name == name:
                return p
        return None

    def port_names(self) -> list[str]:
        return [p.name for p in self.ports]

    def offset_cm(self) -> tuple[float, float]:
        return (self.scope_offset_pt[0] / PT_PER_CM, self.scope_offset_pt[1] / PT_PER_CM)


# fmt: off
_RESISTOR_BODY = r"""\draw[thick, line cap=round] (-0.35,0) -- (-0.195,0) -- (-0.1625,0.15) -- (-0.0975,-0.15) -- (-0.0325,0.15) -- (0.0325,-0.15) -- (0.0975,0.15) -- (0.1625,-0.15) -- (0.195,0) -- (0.35,0);"""
_RESISTOR_LABEL = r"""\node at (0.05,0.35) {{LABEL}};"""

_NMOS_BODY = "\n".join([
    r"\draw[thick, line cap=round] (0.3,0.5) -- (0.56,0.5);",
    r"\draw[ultra thick] (0.55,0.25) -- (0.55,0.75);",
    r"\draw[ultra thick] (0.7,0.2) -- (0.7,0.8);",
    r"\draw[thick, line cap=round, line join=round] (0.7,0.70) -- (1.03,0.70) --(1.03,1);",
    r"\draw[-{Triangle[length=1.6mm, width=1.1mm, sep=-1.2pt]}, thick, line cap=round] (0.7,0.3) -- (1.0,0.3);",
    r"\draw[thick, line cap=round] (1.03,0.291) -- (1.03,0);",
])
_NMOS_LABEL = r"""\node[node font=\sffamily\bfseries] at (0,0.54) {{LABEL}};"""

_PMOS_BODY = "\n".join([
    r"\draw[thick, line cap=round] (0.3,0.5) -- (0.56,0.5);",
    r"\draw[ultra thick] (0.55,0.25) -- (0.55,0.75);",
    r"\draw[ultra thick] (0.7,0.2) -- (0.7,0.8);",
    r"\draw[thick, line cap=round, line join=round] (0.7,0.30) -- (1.03,0.30) --(1.03,0);",
    r"\draw[-{Triangle[length=1.6mm, width=1.1mm, sep=-1.2pt]}, thick, line cap=round] (0.7,0.7) -- (1.0,0.7);",
    r"\draw[thick, line cap=round] (1.03,1) -- (1.03,0.71);",
])
_PMOS_LABEL = r"""\node[node font=\sffamily\bfseries] at (0,0.54) {{LABEL}};"""

# 电流源（用户 2026-08-07 定义）：圆 0.25cm + 1.8mm/1.7mm 箭头，标签在右侧。
# 方向由 {ARROW_LINE} 占位符决定（down=从上往下，up=从下往上）——两方向仅箭头线不同，
# 铅垂线/圆/标签完全一致。端口 top/bottom 在 (0, ±0.4)。
_ISOURCE_BODY = "\n".join([
    r"\draw[thick] (0, 0) circle (0.25cm);",
    r"\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] {ARROW_LINE};",
    r"\draw[thick, line cap=round] (0,-0.25) -- (0,-0.4);",
    r"\draw[thick, line cap=round] (0,0.4) -- (0,0.25);",
])
_ISOURCE_ARROW_DOWN = r"(0, 0.15) -- (0, -0.15)"
_ISOURCE_ARROW_UP = r"(0, -0.15) -- (0, 0.15)"
ISOURCE_ARROWS: dict[str, str] = {
    "down": _ISOURCE_ARROW_DOWN,
    "up": _ISOURCE_ARROW_UP,
}
_ISOURCE_LABEL = r"""\node[right=0.15cm] at (0.15, -0.01) {\normalsize {LABEL}};"""

# 电压源（用户 2026-08-07 定义）：0.25cm 圆 + rotate=90 极性短线（无箭头），
# 标签在左侧。嵌套 scope 与 rotate=90 是符号本体，原样保留。
_VSOURCE_BODY = "\n".join([
    r"\draw[thick] (0, 0) circle (0.25cm);",
    r"\draw[thick, line cap=round] (0,-0.25) -- (0,-0.4);",
    r"\draw[thick, line cap=round] (0,0.4) -- (0,0.25);",
    r"\begin{scope}",
    r"  \draw[thick] (0.35,0.2) -- (0.35,0.35);",
    r"  \draw[thick, rotate=90] (0.28,-0.42) -- (0.28,-0.28);",
    r"\end{scope}",
    r"\draw[thick, rotate=90] (-0.3,-0.42) -- (-0.3,-0.28);",
])
_VSOURCE_LABEL = r"""\node[right=0.15cm] at (-0.93, 0) {\normalsize {LABEL}};"""

# 电流箭头（用户 2026-08-07 定义）：1.8mm/1.7mm 箭头从上往下 + 短引线 (0,-0.25)。
# 无圆、无铅垂线——与电流源（圆 + 引线 ±0.4）形态区分。
_CARROW_BODY = "\n".join([
    r"\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (0, 0.15) -- (0, -0.15);",
    r"\draw[thick, line cap=round] (0,-0.15) -- (0,-0.25);",
])
_CARROW_LABEL = r"""\node[right=0.15cm] at (-0.07, -0.04) {{LABEL}};"""
# fmt: on

TEMPLATES: dict[str, ComponentTemplate] = {
    "resistor": ComponentTemplate(
        type="resistor",
        ports=(Port("P1", -0.35, 0.0), Port("P2", 0.35, 0.0)),
        tikz_body=_RESISTOR_BODY,
        label_node=_RESISTOR_LABEL,
        default_label=r"$R$",
        description="两引脚电阻，引脚 P1（左端）和 P2（右端）在水平中心线上。",
    ),
    "nmos": ComponentTemplate(
        type="nmos",
        ports=(Port("G", 0.3, 0.5), Port("D", 1.03, 1.0), Port("S", 1.03, 0.0)),
        scope_offset_pt=(-17.0, 4.0),
        tikz_body=_NMOS_BODY,
        label_node=_NMOS_LABEL,
        default_label=r"$M$",
        description="nMOS 晶体管，栅极 G（左侧中部）、漏极 D（右上）、源极 S（右下）。",
    ),
    "pmos": ComponentTemplate(
        type="pmos",
        ports=(Port("G", 0.3, 0.5), Port("D", 1.03, 0.0), Port("S", 1.03, 1.0)),
        tikz_body=_PMOS_BODY,
        label_node=_PMOS_LABEL,
        default_label=r"$M$",
        description="pMOS 晶体管，栅极 G（左侧中部）、漏极 D（右下）、源极 S（右上）。",
    ),
    "current_source": ComponentTemplate(
        type="current_source",
        ports=(Port("top", 0.0, 0.4), Port("bottom", 0.0, -0.4)),
        tikz_body=_ISOURCE_BODY,
        label_node=_ISOURCE_LABEL,
        default_label=r"$I$",
        description="电流源：圆内箭头表示电流方向，端口 top（上端）和 bottom（下端）"
        "在垂直中心线上。方向由 direction 参数决定：down=从上往下，up=从下往上。",
    ),
    "voltage_source": ComponentTemplate(
        type="voltage_source",
        ports=(Port("top", 0.0, 0.4), Port("bottom", 0.0, -0.4)),
        tikz_body=_VSOURCE_BODY,
        label_node=_VSOURCE_LABEL,
        default_label=r"$V$",
        description="电压源：圆内 +/− 极性短线（rotate=90），端口 top（上端）和"
        "bottom（下端）在垂直中心线上，标签在左侧。",
    ),
    "current_arrow": ComponentTemplate(
        type="current_arrow",
        ports=(Port("bottom", 0.0, -0.25),),
        tikz_body=_CARROW_BODY,
        label_node=_CARROW_LABEL,
        default_label=r"$i$",
        description="电流方向箭头：1.8mm 箭头指向下方（从上往下），短引线接入点"
        "bottom (0, -0.25)，标签在箭头左侧。",
    ),
}

DEFAULT_LABELS = {
    "resistor": r"$R$",
    "nmos": r"$M$",
    "pmos": r"$M$",
    # 小信号模型符号：电流源/电压源/电流箭头只用于小信号，标注必须小写
    "current_source": r"$i$",
    "voltage_source": r"$v$",
    "current_arrow": r"$i$",
}

# 小信号专用元件：标注首字母必须小写（validator 的 small-signal-label 规则）
SMALL_SIGNAL_TYPES = frozenset({"current_source", "voltage_source", "current_arrow"})

VALID_TYPES = tuple(TEMPLATES.keys())
VALID_PORTS: dict[str, list[str]] = {
    t: TEMPLATES[t].port_names() for t in VALID_TYPES
}


def fmt_cm(value: float) -> str:
    """Format a cm value with 3 decimals, dropping trailing zeros."""
    return f"{value:.3f}".rstrip("0").rstrip(".") or "0"


def fmt_pt(value: float) -> str:
    return f"{value:.3f}".rstrip("0").rstrip(".") or "0"
