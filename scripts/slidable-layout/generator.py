#!/usr/bin/env python3
"""Generate single-axis slidable TikZ from a structured circuit manifest.

This is intentionally independent from circuit-mcp. It consumes a JSON
manifest produced by the vision stage and emits TikZ that follows
MOS-circuit Paradigm 16:

- every ordinary component is inside its own scope;
- anchored scopes use exactly one of xshift/yshift (single-axis slider);
- non-tree edges are emitted last as orthogonal chords;
- named anchors are used as real geometry endpoints.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

SYNC_FILE = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
        "apps",
        "web",
        "agent-sync",
        "active-drawing.tex",
    )
)

# ---------------------------------------------------------------------------
# component templates
# ---------------------------------------------------------------------------

TEMPLATES: dict[str, dict[str, Any]] = {
    "nmos_left": {
        "anchors": ["node_{id}_g", "node_{id}_d", "node_{id}_s"],
        "body": [
            r"\coordinate (node_{id}_g) at (-0.73, 0);",
            r"\coordinate (node_{id}_d) at (0, 0.5);",
            r"\coordinate (node_{id}_s) at (0, -0.6);",
            r"\draw[thick] (node_{id}_s) |- ({parent});",
            r"\draw[thick, line cap=round] (node_{id}_g) -- (-0.47,0);",
            r"\draw[ultra thick] (-0.48,-0.25) -- (-0.48,0.25);",
            r"\draw[ultra thick] (-0.32,-0.3) -- (-0.32,0.3);",
            r"\draw[thick, line cap=round, line join=round] (-0.33,0.2) -- (0,0.2) -- (node_{id}_d);",
            r"\draw[-{Triangle[length=1.6mm, width=1.1mm, sep=-1.2pt]}, thick, line cap=round] (-0.33,-0.2) -- (-0.03,-0.2);",
            r"\draw[thick, line cap=round, line join=round] (0,-0.21) -- (node_{id}_s);",
        ],
        "label": r"\node[right=0.08cm] at (0, 0) {{\\normalsize {label}}};",
    },
    "nmos_right": {
        "anchors": ["node_{id}_g", "node_{id}_d", "node_{id}_s"],
        "body": [
            r"\coordinate (node_{id}_g) at (0.73, 0);",
            r"\coordinate (node_{id}_d) at (0, 0.5);",
            r"\coordinate (node_{id}_s) at (0, -0.6);",
            r"\draw[thick] (node_{id}_s) |- ({parent});",
            r"\draw[thick, line cap=round] (node_{id}_g) -- (0.47,0);",
            r"\draw[ultra thick] (0.48,-0.25) -- (0.48,0.25);",
            r"\draw[ultra thick] (0.32,-0.3) -- (0.32,0.3);",
            r"\draw[thick, line cap=round, line join=round] (0.33,0.2) -- (0,0.2) -- (node_{id}_d);",
            r"\draw[-{Triangle[length=1.6mm, width=1.1mm, sep=-1.2pt]}, thick, line cap=round] (0.33,-0.2) -- (0.03,-0.2);",
            r"\draw[thick, line cap=round, line join=round] (0,-0.21) -- (node_{id}_s);",
        ],
        "label": r"\node[left=0.15cm] at (0, 0) {{\\normalsize {label}}};",
    },
    "pmos_left": {
        "anchors": ["node_{id}_g", "node_{id}_d", "node_{id}_s"],
        "body": [
            r"\coordinate (node_{id}_g) at (-0.73, 0);",
            r"\coordinate (node_{id}_s) at (0, 0.5);",
            r"\coordinate (node_{id}_d) at (0, -0.6);",
            r"\draw[thick] (node_{id}_d) |- ({parent});",
            r"\draw[thick, line cap=round] (node_{id}_g) -- (-0.47,0);",
            r"\draw[ultra thick] (-0.48,-0.25) -- (-0.48,0.25);",
            r"\draw[ultra thick] (-0.32,-0.3) -- (-0.32,0.3);",
            r"\draw[thick, line cap=round, line join=round] (-0.33,-0.2) -- (0,-0.2) -- (node_{id}_d);",
            r"\draw[-{Triangle[length=1.6mm, width=1.1mm, sep=-1.2pt]}, thick, line cap=round] (-0.33,0.2) -- (-0.03,0.2);",
            r"\draw[thick, line cap=round, line join=round] (-0.33,0.2) -- (0,0.2) -- (node_{id}_s);",
        ],
        "label": r"\node[right=0.08cm] at (0, 0) {{\\normalsize {label}}};",
    },
    "pmos_right": {
        "anchors": ["node_{id}_g", "node_{id}_d", "node_{id}_s"],
        "body": [
            r"\coordinate (node_{id}_g) at (0.73, 0);",
            r"\coordinate (node_{id}_s) at (0, 0.5);",
            r"\coordinate (node_{id}_d) at (0, -0.6);",
            r"\draw[thick] (node_{id}_d) |- ({parent});",
            r"\draw[thick, line cap=round] (node_{id}_g) -- (0.47,0);",
            r"\draw[ultra thick] (0.48,-0.25) -- (0.48,0.25);",
            r"\draw[ultra thick] (0.32,-0.3) -- (0.32,0.3);",
            r"\draw[thick, line cap=round, line join=round] (0.33,-0.2) -- (0,-0.2) -- (node_{id}_d);",
            r"\draw[-{Triangle[length=1.6mm, width=1.1mm, sep=-1.2pt]}, thick, line cap=round] (0.33,0.2) -- (0.03,0.2);",
            r"\draw[thick, line cap=round, line join=round] (0,0.5) -- (0,0.21);",
        ],
        "label": r"\node[left=0.15cm] at (0, 0) {{\\normalsize {label}}};",
    },
    "resistor_v": {
        "anchors": ["node_{id}_top", "node_{id}_bottom"],
        "body": [
            r"\coordinate (node_{id}_top) at (0, 0.35);",
            r"\coordinate (node_{id}_bottom) at (0, -0.35);",
            r"\draw[thick] (node_{id}_top) |- ({parent});",
            r"\draw[thick, line cap=round] (node_{id}_bottom) -- (0,-0.195) -- (0.15,-0.1625) -- (-0.15,-0.0975) -- (0.15,-0.0325) -- (-0.15,0.0325) -- (0.15,0.0975) -- (-0.15,0.1625) -- (0,0.195) -- (node_{id}_top);",
        ],
        "label": r"\node[right=0.2cm] at (0.15, 0) {{\\normalsize {label}}};",
    },
    "capacitor_v": {
        "anchors": ["node_{id}_bottom"],
        "body": [
            r"\coordinate (node_{id}_bottom) at (0, -0.08);",
            r"\draw[thick] (0, 0.08) |- ({parent});",
            r"\draw[ultra thick] (-0.25, 0.08) -- (0.25, 0.08);",
            r"\draw[ultra thick] (-0.25, -0.08) -- (0.25, -0.08);",
        ],
        "label": r"\node[right=0.25cm] at (0.25, 0) {{\\normalsize {label}}};",
    },
    "current_source_down": {
        "anchors": ["node_{id}_top", "node_{id}_bottom"],
        "body": [
            r"\coordinate (node_{id}_top) at (0, 0.4);",
            r"\coordinate (node_{id}_bottom) at (0, -0.4);",
            r"\draw[thick] (0, 0.4) |- ({parent});",
            r"\draw[thick] (0, 0) circle (0.25cm);",
            r"\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (0, 0.15) -- (0, -0.15);",
            r"\draw[thick, line cap=round] (0,-0.25) -- (0,-0.4);",
            r"\draw[thick, line cap=round] (0,0.4) -- (0,0.25);",
        ],
        "label": r"\node[right=0.15cm] at (0.25, 0) {{\\normalsize {label}}};",
    },
    "gnd": {
        "anchors": [],
        "body": [
            r"\draw[thick] (0, 0) |- ({parent});",
            r"\draw[ultra thick] (-0.2, 0) -- (0.2, 0);",
            r"\draw[ultra thick] (-0.13, -0.1) -- (0.13, -0.1);",
            r"\draw[ultra thick] (-0.06, -0.2) -- (0.06, -0.2);",
        ],
        "label": None,
    },
    "vdd": {
        "anchors": ["node_{id}_branch_L"],
        "body": [
            r"\coordinate (node_{id}_branch_L) at (0, 0);",
            r"\draw[thick] (node_{id}_branch_L) |- ({parent});",
            r"\draw[ultra thick] (-0.95, 0) -- (0.9, 0);",
        ],
        "label": r"\node[above=0.05cm] at (node_{id}_branch_L) {{\\normalsize {label}}};",
    },
    "black_node": {
        "anchors": ["node_{id}_c"],
        "body": [
            r"\coordinate (node_{id}_c) at (0, 0);",
            r"\node[minimum height=0.5cm, minimum width=0.5cm, fill=white, opacity=0.01] at (node_{id}_c) {};",
            r"\draw[thick] (node_{id}_c) |- ({parent});",
            r"\draw[fill=black] (node_{id}_c) circle (0.055cm);",
        ],
        "label": None,
    },
    "io_node": {
        "anchors": ["node_{id}_c"],
        "body": [
            r"\coordinate (node_{id}_c) at (0, 0);",
            r"\draw[thick] (node_{id}_c) -| ({parent});",
            r"\draw[fill=white, thick] (node_{id}_c) circle (0.055cm);",
        ],
        "label": r"\node[{label_side}=0.12cm] at (node_{id}_c) {{\\normalsize {label}}};",
    },
    "rail": {
        "anchors": ["node_{id}_branch_{branch_dir}"],
        "body": [
            r"\coordinate (node_{id}_branch_{branch_dir}) at (0, 0);",
            r"\node[minimum height=1.0cm, minimum width=0.9cm, fill=white, opacity=0.01] at (node_{id}_branch_{branch_dir}) {{}};",
        ],
        "label": None,
    },
}


def _fmt_gap(gap: float) -> str:
    return f"{gap:g}cm"


def _scope_header(comp: dict[str, Any]) -> str:
    if comp.get("root"):
        return r"\begin{scope}[shift={(0, 0)}]"
    axis = comp.get("axis", "y")
    key = "xshift" if axis == "x" else "yshift"
    return rf"\begin{{scope}}[shift={{({comp['parent']})}}, {key}={_fmt_gap(comp['gap'])}]"


def _render_component(comp: dict[str, Any]) -> list[str]:
    tpl = TEMPLATES[comp["type"]]
    cid = comp["id"]
    incoming = comp.get("incoming")
    lines: list[str] = []
    lines.append(f"% component {cid} ({comp['type']})")
    lines.append(_scope_header(comp))
    for raw in tpl["body"]:
        if (
            incoming
            and "({parent})" in raw
            and raw.lstrip().startswith(r"\draw[thick]")
        ):
            line = incoming
        else:
            line = raw.format(id=cid, parent=comp.get("parent", ""), branch_dir=comp.get("branch_dir", "D"))
        lines.append(f"  {line}")
    label = tpl.get("label")
    if label:
        label_side = comp.get("label_side", "left" if comp.get("type") == "io_node" else "right")
        line = label.format(id=cid, label=comp.get("label", f"${cid}$"), label_side=label_side)
        lines.append(f"  {line}")
    lines.append(r"\end{scope}")
    return lines


def _render_chord(chord: dict[str, Any]) -> list[str]:
    route = chord.get("route", "-|")
    return [
        f"% chord {chord.get('id', '')}".rstrip(),
        rf"\draw[{chord.get('style', 'thick')}] ({chord['from']}) {route} ({chord['to']});",
    ]


def generate(spec: dict[str, Any]) -> str:
    lines: list[str] = [
        r"\begin{tikzpicture}",
        r"% generated by scripts/slidable-layout/generator.py",
    ]
    for comp in spec.get("components", []):
        lines.extend(_render_component(comp))
        lines.append("")
    lines.append("% global chords")
    for chord in spec.get("chords", []):
        lines.extend(_render_chord(chord))
    lines.append("")
    lines.append(r"\end{tikzpicture}")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", required=True)
    parser.add_argument("--out", default=SYNC_FILE)
    args = parser.parse_args()

    with open(args.spec, "r", encoding="utf-8") as f:
        spec = json.load(f)
    tikz = generate(spec)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(tikz)
    print(f"wrote {os.path.abspath(args.out)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
