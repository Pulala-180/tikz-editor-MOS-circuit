"""Circuit model validation and TikZ code generation.

The generated document is a complete tikzpicture that is written to the
editor's agent-sync file (`apps/web/agent-sync/active-drawing.tex`); Vite HMR
pushes it to the browser, replacing the editor source (see
`apps/web/agent-sync-plugin.ts` and `apps/web/src/main.tsx`).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .components import (
    DEFAULT_LABELS,
    ISOURCE_ARROWS,
    PT_PER_CM,
    SMALL_SIGNAL_TYPES,
    TEMPLATES,
    VALID_PORTS,
    VALID_TYPES,
    fmt_cm,
    fmt_pt,
)

COMPONENT_TYPES = VALID_TYPES


class CircuitError(ValueError):
    """Raised when the circuit description is invalid (user should fix input)."""


@dataclass
class ComponentSpec:
    id: str
    type: str
    x: float
    y: float
    label: str | None = None
    direction: str = "down"  # 电流源方向：down=从上往下，up=从下往上（仅 current_source）


@dataclass
class WireEndpoint:
    """Either a component port reference (``R1.P2``) or a free point (x, y)."""

    ref: str | None = None
    x: float | None = None
    y: float | None = None

    @property
    def is_free(self) -> bool:
        return self.ref is None

    @property
    def key(self) -> tuple:
        if self.ref is not None:
            return ("ref", self.ref)
        return ("free", round(self.x or 0, 6), round(self.y or 0, 6))


@dataclass
class WireSpec:
    id: str
    from_: WireEndpoint
    to: WireEndpoint
    style: str = "thick"


@dataclass
class PlacedComponent:
    id: str
    type: str
    x: float
    y: float
    label: str
    ports: dict[str, tuple[float, float]]  # global coordinates in cm
    direction: str = "down"


@dataclass
class BuildResult:
    components: list[PlacedComponent]
    wires: list[dict[str, Any]]
    junctions: list[tuple[float, float]]
    tikz: str
    warnings: list[str] = field(default_factory=list)


def _fmt_num(v: float) -> str:
    """Round a global coordinate to 3 decimals for output."""
    return f"{v:.3f}"


def parse_component_spec(raw: dict[str, Any]) -> ComponentSpec:
    """Validate and normalize a raw component dict from the tool input."""
    cid = raw.get("id")
    ctype = raw.get("type")
    if not isinstance(cid, str) or not cid.strip():
        raise CircuitError(f"组件缺少有效的 id：{raw!r}（id 必须是非空字符串）")
    if ctype not in TEMPLATES:
        raise CircuitError(
            f"组件 {cid!r} 的类型 {ctype!r} 无效。可用类型：{', '.join(VALID_TYPES)}"
        )
    x = raw.get("x", 0.0)
    y = raw.get("y", 0.0)
    if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
        raise CircuitError(f"组件 {cid!r} 的 x/y 坐标必须是数字，收到 x={x!r}, y={y!r}")
    label = raw.get("label")
    if label is not None and not isinstance(label, str):
        raise CircuitError(f"组件 {cid!r} 的 label 必须是字符串，收到 {label!r}")
    direction = raw.get("direction", "down")
    if ctype == "current_source" and direction not in ("down", "up"):
        raise CircuitError(
            f"组件 {cid!r} 的 direction 必须为 'down'（从上往下）或 'up'（从下往上），"
            f"收到 {direction!r}"
        )
    return ComponentSpec(
        id=cid.strip(), type=ctype, x=float(x), y=float(y), label=label, direction=direction
    )


def parse_wire_spec(raw: dict[str, Any], index: int) -> WireSpec:
    """Validate and normalize a raw wire dict from the tool input."""
    wid = raw.get("id") or f"wire{index}"
    if not isinstance(wid, str) or not wid.strip():
        raise CircuitError(f"导线缺少有效的 id：{raw!r}")

    def parse_endpoint(value: Any, name: str) -> WireEndpoint:
        if value is None:
            raise CircuitError(f"导线 {wid!r} 缺少 {name} 端点")
        if isinstance(value, str):
            return WireEndpoint(ref=value.strip())
        if isinstance(value, dict):
            x = value.get("x")
            y = value.get("y")
            if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
                raise CircuitError(
                    f"导线 {wid!r} 的 {name} 自由端点需要数字 x/y，收到 {value!r}"
                )
            return WireEndpoint(x=float(x), y=float(y))
        raise CircuitError(
            f"导线 {wid!r} 的 {name} 端点必须是 '<组件id>.<端口>' 字符串或 {{x, y}}，"
            f"收到 {value!r}"
        )

    from_ = parse_endpoint(raw.get("from"), "from")
    to = parse_endpoint(raw.get("to"), "to")
    style = raw.get("style")
    if style is not None and not isinstance(style, str):
        raise CircuitError(f"导线 {wid!r} 的 style 必须是字符串")
    return WireSpec(id=wid.strip(), from_=from_, to=to, style=style or "thick")


def _port_position(
    placed: PlacedComponent, port_name: str
) -> tuple[float, float]:
    if port_name not in placed.ports:
        raise CircuitError(
            f"组件 {placed.id!r}（{placed.type}）没有端口 {port_name!r}，"
            f"可用端口：{', '.join(sorted(placed.ports))}"
        )
    return placed.ports[port_name]


def _resolve_endpoint(
    ep: WireEndpoint, by_id: dict[str, PlacedComponent], wire_id: str
) -> tuple[float, float]:
    """Resolve an endpoint to global coordinates in cm.

    Raises CircuitError with an actionable message if the reference is malformed,
    points to an unknown component, or names an invalid port.
    """
    if ep.ref is not None:
        if "." not in ep.ref:
            raise CircuitError(
                f"导线 {wire_id!r} 的端点 {ep.ref!r} 格式错误：应为 '<组件id>.<端口>'，"
                f"例如 'R1.P2' 或 'M1.G'"
            )
        cid, port = ep.ref.rsplit(".", 1)
        placed = by_id.get(cid)
        if placed is None:
            raise CircuitError(
                f"导线 {wire_id!r} 引用了不存在的组件 {cid!r}。"
                f"已放置的组件：{', '.join(sorted(by_id)) or '（无）'}"
            )
        return _port_position(placed, port)
    return (float(ep.x), float(ep.y))


def _label_text(spec: ComponentSpec) -> str:
    if spec.label is not None:
        label = spec.label.strip()
        if not label:
            label = DEFAULT_LABELS[spec.type]
    elif spec.type in SMALL_SIGNAL_TYPES:
        # 小信号元件不传 label 时用默认小写标注（$i$/$v$），
        # 不用 '$<id>$'——id 如 I1/V1 会把大写字母带进标签
        label = DEFAULT_LABELS[spec.type]
    else:
        label = f"${spec.id}$"
    return label


def build_circuit(
    components: list[dict[str, Any]],
    wires: list[dict[str, Any]],
    junction_dots: bool = True,
) -> BuildResult:
    """Validate the full circuit description and generate the TikZ document.

    Raises CircuitError on the first invalid input with an actionable message.
    """
    # 1. Validate component specs, check duplicate ids.
    specs = [parse_component_spec(c) for c in components]
    seen: set[str] = set()
    for spec in specs:
        if spec.id in seen:
            raise CircuitError(f"组件 id 重复：{spec.id!r}（每个 id 只能出现一次）")
        seen.add(spec.id)

    # 2. Compute global port positions.
    placed: dict[str, PlacedComponent] = {}
    for spec in specs:
        tpl = TEMPLATES[spec.type]
        ox_cm, oy_cm = tpl.offset_cm()
        ports = {
            p.name: (spec.x + ox_cm + p.x, spec.y + oy_cm + p.y) for p in tpl.ports
        }
        placed[spec.id] = PlacedComponent(
            id=spec.id,
            type=spec.type,
            x=spec.x,
            y=spec.y,
            label=_label_text(spec),
            ports=ports,
            direction=spec.direction,
        )

    # 3. Validate wires, resolve endpoints.
    wire_specs = [parse_wire_spec(w, i) for i, w in enumerate(wires)]
    wire_seen: set[str] = set()
    resolved: list[tuple[WireSpec, tuple[float, float], tuple[float, float]]] = []
    for ws in wire_specs:
        if ws.id in wire_seen:
            raise CircuitError(f"导线 id 重复：{ws.id!r}")
        wire_seen.add(ws.id)
        a = _resolve_endpoint(ws.from_, placed, ws.id)
        b = _resolve_endpoint(ws.to, placed, ws.id)
        resolved.append((ws, a, b))

    # 4. Junction dots: any point where >= 2 wire endpoints meet.
    junctions: list[tuple[float, float]] = []
    if junction_dots:
        counts: dict[tuple[float, float], int] = {}
        for ws, a, b in resolved:
            counts[round_point(a)] = counts.get(round_point(a), 0) + 1
            counts[round_point(b)] = counts.get(round_point(b), 0) + 1
        junctions = [pt for pt, n in counts.items() if n >= 2]

    # 5. Generate TikZ.
    lines: list[str] = []
    lines.append(r"\begin{tikzpicture}")
    lines.append(r"  % --- circuit generated by circuit-mcp ---")
    for spec in specs:
        tpl = TEMPLATES[spec.type]
        ox_pt, oy_pt = tpl.scope_offset_pt
        xshift_pt = spec.x * PT_PER_CM + ox_pt
        yshift_pt = spec.y * PT_PER_CM + oy_pt
        label = placed[spec.id].label
        body = tpl.tikz_body.replace("{LABEL}", label)
        if spec.type == "current_source":
            arrow = ISOURCE_ARROWS.get(spec.direction) or ISOURCE_ARROWS["down"]
            body = body.replace("{ARROW_LINE}", arrow)
        label_node = tpl.label_node.replace("{LABEL}", label)
        lines.append(f"  % component {spec.id} ({spec.type}) at ({fmt_cm(spec.x)}, {fmt_cm(spec.y)})")
        lines.append(rf"  \begin{{scope}}[xshift={{{fmt_pt(xshift_pt)}pt}}, yshift={{{fmt_pt(yshift_pt)}pt}}]")
        for ln in body.splitlines():
            lines.append(f"    {ln}")
        lines.append(f"    {label_node}")
        lines.append(r"  \end{scope}")
    for ws, a, b in resolved:
        lines.append(
            rf"  % wire {ws.id}"
        )
        lines.append(
            rf"  \draw[{ws.style}, line cap=round] ({_fmt_num(a[0])},{_fmt_num(a[1])}) -- ({_fmt_num(b[0])},{_fmt_num(b[1])});"
        )
    for jx, jy in junctions:
        lines.append(
            rf"  \draw[fill=black] ({_fmt_num(jx)},{_fmt_num(jy)}) circle (0.05cm);"
        )
    lines.append(r"\end{tikzpicture}")

    wires_out = [
        {
            "id": ws.id,
            "from": ws.from_.ref or {"x": ws.from_.x, "y": ws.from_.y},
            "to": ws.to.ref or {"x": ws.to.x, "y": ws.to.y},
            "endpoints": [[_fmt_num(a[0]), _fmt_num(a[1])], [_fmt_num(b[0]), _fmt_num(b[1])]],
        }
        for ws, a, b in resolved
    ]

    return BuildResult(
        components=[placed[c.id] for c in specs],
        wires=wires_out,
        junctions=junctions,
        tikz="\n".join(lines),
        warnings=[],
    )


def round_point(pt: tuple[float, float]) -> tuple[float, float]:
    return (round(pt[0], 4), round(pt[1], 4))


def catalog() -> dict[str, Any]:
    """Static catalog of component templates for the list_components tool."""
    out: dict[str, Any] = {}
    for ctype, tpl in TEMPLATES.items():
        out[ctype] = {
            "description": tpl.description,
            "ports": {
                p.name: {"x": p.x, "y": p.y} for p in tpl.ports
            },
            "scope_offset_pt": list(tpl.scope_offset_pt),
            "default_label": tpl.default_label,
            "tikz_body": tpl.tikz_body,
        }
    return out
