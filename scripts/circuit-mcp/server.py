"""Circuit MCP server for the TikZ editor.

Workflow: the vision-capable model looks at a circuit image, identifies the
resistor/MOS components, their positions and port connections, then calls
``apply_circuit`` with the structured description. This server validates it,
computes exact port coordinates, generates the TikZ document and overwrites the
editor's agent-sync file — Vite HMR pushes it to the browser instantly.

Run:
    python server.py

Register in Claude Code:
    claude mcp add circuit-editor -- python <abs path to server.py>

Env vars:
    CIRCUIT_SYNC_FILE  path to the agent-sync file (default: the tikz-editor
                       agent-sync/active-drawing.tex used by the web editor)
"""

from __future__ import annotations

import os
import sys
from typing import Any, Literal, Union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pydantic import BaseModel, ConfigDict, Field

from circuit.builder import (
    BuildResult,
    CircuitError,
    PlacedComponent,
    build_circuit,
    catalog,
)
from circuit.ocr import extract_labels
from circuit.render import render_tikz_to_png
from circuit.validator import validate_drawing as check_drawing

# ---------------------------------------------------------------------------
# Sync file
# ---------------------------------------------------------------------------

DEFAULT_SYNC_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..",
    "..",
    "apps",
    "web",
    "agent-sync",
    "active-drawing.tex",
)


def sync_file_path() -> str:
    return os.environ.get("CIRCUIT_SYNC_FILE", DEFAULT_SYNC_FILE)


def write_drawing(tikz: str) -> str:
    path = os.path.abspath(sync_file_path())
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(tikz)
    return path


def current_source() -> str:
    """读取同步文件当前内容（文件缺失时按空画布处理）。"""
    return _read_drawing_resource()


# ---------------------------------------------------------------------------
# Tool input models (drive the JSON schema shown to the model)
# ---------------------------------------------------------------------------


class ComponentIn(BaseModel):
    """一个电路器件（电阻/MOS 管/电源/电流箭头）。id 为唯一标识，如 R1、M1、I1、V1。"""

    id: str = Field(description="组件唯一标识，如 'R1'、'M1'、'I1'、'V1'。导线通过 '<id>.<端口>' 引用它")
    type: Literal[
        "resistor", "nmos", "pmos", "current_source", "voltage_source", "current_arrow"
    ] = Field(
        description="器件类型：resistor=电阻，nmos=nMOS 管，pmos=pMOS 管，"
        "current_source=电流源（direction 定方向），voltage_source=电压源，"
        "current_arrow=电流方向箭头"
    )
    direction: Literal["down", "up"] = Field(
        default="down",
        description="电流源方向：down=从上往下，up=从下往上（仅 current_source 有效）",
    )
    x: float = Field(default=0.0, description="器件原点的 x 坐标（cm）")
    y: float = Field(default=0.0, description="器件原点的 y 坐标（cm）")
    label: str | None = Field(
        default=None,
        description="图中标注文本（如 '$R_D$'、'$M_1$'、'$g_{m1} v_{in}$'）。省略时用 '$<id>$'；"
        "电流源/电压源/电流箭头是小信号元件，省略时用默认小写标注（$i$/$v$），"
        "且校验器禁止大写首字母标注（$V$/$I$ 是大信号符号）",
    )


class FreePoint(BaseModel):
    """自由端点（不连接任何组件端口，如接到 Vdd/电源轨）。"""

    x: float = Field(description="x 坐标（cm）")
    y: float = Field(description="y 坐标（cm）")


class WireIn(BaseModel):
    """一条导线：连接两个端点。端点是 '<组件id>.<端口>' 或自由坐标 {x, y}。"""

    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(default=None, description="导线标识（可选）")
    from_: Union[str, FreePoint] = Field(alias="from", description="起点：如 'R1.P2'，或 {x, y}")
    to: Union[str, FreePoint] = Field(description="终点：如 'M1.G'，或 {x, y}")
    style: str = Field(default="thick", description="线型，默认 'thick'")


# ---------------------------------------------------------------------------
# Tool implementations (pure functions — unit-testable without MCP)
# ---------------------------------------------------------------------------


def run_apply_circuit(
    components: list[dict[str, Any]],
    wires: list[dict[str, Any]],
    junction_dots: bool = True,
) -> dict[str, Any]:
    """Validate + generate + write the drawing. See the apply_circuit docstring."""
    result: BuildResult = build_circuit(components, wires, junction_dots=junction_dots)
    path = write_drawing(result.tikz)
    return {
        "ok": True,
        "file": path,
        "tikz": result.tikz,
        "components": [_component_payload(c) for c in result.components],
        "wires": result.wires,
        "junctions": [[round(x, 3), round(y, 3)] for x, y in result.junctions],
        "warnings": result.warnings,
    }


def _component_payload(c: PlacedComponent) -> dict[str, Any]:
    return {
        "id": c.id,
        "type": c.type,
        "x": c.x,
        "y": c.y,
        "label": c.label,
        "direction": c.direction,
        "ports": {name: [round(x, 3), round(y, 3)] for name, (x, y) in c.ports.items()},
    }


def run_reset_circuit() -> dict[str, Any]:
    """Reset the sync file to an empty tikzpicture. See the reset_circuit docstring."""
    path = write_drawing("\\begin{tikzpicture}\n\n\\end{tikzpicture}\n")
    return {"ok": True, "file": path}


def run_read_drawing() -> dict[str, Any]:
    """Read the current sync file content. See the get_drawing docstring."""
    path = os.path.abspath(sync_file_path())
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
    except FileNotFoundError:
        return {"ok": True, "file": path, "content": "", "exists": False}
    return {"ok": True, "file": path, "content": content, "exists": True}


# ---------------------------------------------------------------------------
# MCP server
# ---------------------------------------------------------------------------

from mcp.server.mcpserver import MCPServer  # noqa: E402
from mcp.server.mcpserver.resources import FunctionResource  # noqa: E402


def _read_drawing_resource() -> str:
    """Read the current sync file for the tikz://active-drawing resource."""
    path = os.path.abspath(sync_file_path())
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return "\\begin{tikzpicture}\n\n\\end{tikzpicture}\n"


drawing_resource = FunctionResource.from_function(
    _read_drawing_resource,
    uri="tikz://active-drawing",
    name="active-drawing",
    description="浏览器编辑器当前显示的 TikZ 源码（agent-sync 同步文件内容）",
    mime_type="text/x-tex",
)

server = MCPServer(
    name="circuit-editor",
    title="TikZ 电路编辑器 MCP",
    version="0.1.0",
    resources=[drawing_resource],
    instructions=(
        "该服务器把电路图片分析结果变成编辑器里可渲染的 TikZ 电路：\n"
        "1. 用户发来电路图片后，先由视觉模型识别器件（电阻/nMOS/pMOS/电流源/"
        "电压源/电流箭头）、它们的大致位置和端口连接关系；\n"
        "2. 可选调用 analyze_circuit_image 提取图片中的文字标签辅助核对器件标注；\n"
        "3. 调用 apply_circuit 生成并写入电路（浏览器编辑器会实时更新）；\n"
        "4. 端口命名：电阻 P1/P2，MOS 管 G/D/S，电流源/电压源 top/bottom，"
        "电流箭头 bottom。电流源方向用 direction 参数（down=从上往下，up=从下往上）。"
        "坐标单位 cm，原点为器件插入点。\n"
        "位置从图片估计即可——生成后会返回每个端口的实际坐标供核对，可在下次调用时微调。\n"
        "5. 自由书写 TikZ（按 MOS-circuit skill 写相对级联结构）时，交付前必须闭环：\n"
        "   调用 validate_drawing 校验（8 大元件独立 scope、无全局坐标、命名规约、"
        "\\normalsize、禁动态宏、正交弦、锚点完整），修至零违规；\n"
        "   再调用 render_preview 查看渲染 PNG，与参考图片对比一致后才算完成。"
    ),
)


@server.tool()
async def apply_circuit(
    components: list[ComponentIn],
    wires: list[WireIn],
    junction_dots: bool = True,
) -> dict[str, Any]:
    """根据完整的电路描述生成 TikZ 电路并写入编辑器同步文件（浏览器立即更新）。

    输入：components 列出所有器件及位置；wires 用 '<组件id>.<端口>' 或 {x, y}
    描述每条导线的两个端点。端口：电阻 P1（左）/P2（右）；MOS 管 G/D/S；
    电流源/电压源 top（上端）/bottom（下端）；电流箭头 bottom（短引线接入点）。
    电流源方向用 direction 参数（down=上→下，up=下→上）。
    返回：生成的完整 TikZ 代码、每个组件端口的全局坐标、结点位置，以及写入的文件路径。
    输入有误（未知组件、非法端口等）时返回 ok=false 和可操作的错误说明，不会写入文件。
    """
    try:
        return run_apply_circuit(
            [c.model_dump() for c in components],
            [w.model_dump(by_alias=True) for w in wires],
            junction_dots=junction_dots,
        )
    except CircuitError as e:
        return {"ok": False, "error": str(e)}


@server.tool()
async def list_components() -> dict[str, Any]:
    """列出编辑器工具栏支持的电路器件（电阻、nMOS、pMOS、电流源、电压源、电流箭头）及其端口定义。

    返回每种器件的端口名称、端口在器件局部坐标系中的位置、默认标注和原始 TikZ 代码。
    布局电路前可先调用本工具确认端口命名（电阻 P1/P2；MOS 管 G/D/S；
    电流源/电压源 top/bottom；电流箭头 bottom）。
    """
    return {"ok": True, "components": catalog()}


@server.tool()
async def reset_circuit() -> dict[str, Any]:
    """清空编辑器画布：把同步文件重置为空的 tikzpicture。

    当需要从头开始绘制新电路时调用。返回写入的文件路径。
    """
    return run_reset_circuit()


@server.tool()
async def get_drawing() -> dict[str, Any]:
    """读取当前同步文件中的 TikZ 源码（即浏览器编辑器当前显示的内容）。"""
    return run_read_drawing()


@server.tool()
async def analyze_circuit_image(image_path: str) -> dict[str, Any]:
    """用 OCR 提取电路图片中的文字标签（如 'R1'、'M2'、'Vdd'），辅助核对器件标注。

    器件类型、位置和连接关系仍以视觉分析为准——本工具只补充图片里印刷的文字。
    传入图片的绝对路径。返回识别到的文本行及其像素位置；RapidOCR 未安装或图片
    不存在时返回 ok=false 和说明。
    """
    return extract_labels(image_path)


@server.tool()
async def validate_drawing(source: str | None = None) -> dict[str, Any]:
    """按 MOS-circuit 范式校验 TikZ 源码（相对级联结构），返回违规清单。

    不传 source 时校验同步文件的当前内容。校验规则：8 大核心元件必须各自
    独立 scope（禁止元件画在 scope 外）；顶层禁止全局 \\coordinate；锚点
    命名规约（node_<id>_<d|g|s> / _c / _branch_<L|R|U|D>）；标注必须
    \\normalsize；禁止 \\pgfgetlastxy 等动态 PGF 宏；禁止 opacity=0（须用
    0.01）；弦/跨 scope 连接必须正交（|- / -|）；导线引用的命名锚点必须
    已定义。

    返回：valid（是否零违规）、violations（[{rule, severity, message,
    location}]，error 级必须修复，warning 级建议修复）、error_count、
    warning_count。自由书写 TikZ 后交付前必须调用本工具修至零违规。
    """
    if source is None:
        source = current_source()
    violations = check_drawing(source)
    return {
        "ok": True,
        "valid": not violations,
        "violations": [vars(v) for v in violations],
        "error_count": sum(1 for v in violations if v.severity == "error"),
        "warning_count": sum(1 for v in violations if v.severity == "warning"),
    }


@server.tool()
async def render_preview() -> dict[str, Any]:
    """把同步文件当前的 TikZ 编译渲染成 PNG（pdflatex → pdftoppm），返回图片路径。

    供"多次识图"自检：交付前调用本工具查看渲染结果，与用户提供的电路
    图片逐元件、逐端口、逐连线对比；有偏差就修正源码，重新校验、重新渲染，
    直到一致。编译失败时返回 ok=false、错误信息和错误行号，需修复后重试。
    PNG 写到同步文件目录下的 active-drawing-preview.png。
    """
    sync_dir = os.path.dirname(os.path.abspath(sync_file_path()))
    result = render_tikz_to_png(current_source(), out_dir=sync_dir)
    if not result["ok"]:
        stray = os.path.join(sync_dir, "drawing-1.png")
        if os.path.isfile(stray):
            os.remove(stray)
        return result
    png = os.path.join(sync_dir, "active-drawing-preview.png")
    try:
        os.replace(result["png"], png)
        result["png"] = png
    except OSError:
        pass
    return result


def main() -> None:
    server.run(transport="stdio")


if __name__ == "__main__":
    main()
