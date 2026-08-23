#!/usr/bin/env python3
"""Generator v2: single-axis slidable TikZ from a validated circuit manifest.

Math model
----------
The electrical netlist is an arbitrary graph G.  The TikZ layout is encoded as
a spanning tree T of G:

- every component lives in exactly one anchored ``scope``;
- every non-root scope has exactly one prismatic joint (``xshift`` OR ``yshift``);
- every electrical edge that is NOT in T is emitted last as an orthogonal chord
  (``-|`` / ``|-`` / a named-bus three-segment route);
- hardcoded absolute bend coordinates are rejected by the validator.

This keeps the coordinate dependency graph acyclic and gives the UI editor
single-axis drag handles only.
"""

from __future__ import annotations

import argparse
import json
import os
import re
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

ANCHOR_RE = re.compile(r"node_[A-Za-z0-9_]+")
HARD_COORD_RE = re.compile(r"\(\s*[+-]?\d+(?:\.\d+)?\s*,")

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
            r"\draw[thick, line cap=round] (node_{id}_top) -- (0,0.195) -- (0.15,0.1625) -- (-0.15,0.0975) -- (0.15,0.0325) -- (-0.15,-0.0325) -- (0.15,-0.0975) -- (-0.15,-0.1625) -- (0,-0.195) -- (node_{id}_bottom);",
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
    "bus": {
        "anchors": ["node_{id}_c"],
        "body": [
            r"\coordinate (node_{id}_c) at (0, 0);",
            r"\node[minimum height={hit_h}, minimum width={hit_w}, fill=white, opacity=0.01] at ({hit_x}, {hit_y}) {{}};",
        ],
        "label": None,
    },
}

PORT_ALIASES = {
    "nmos_left": {"g": "g", "d": "d", "s": "s"},
    "nmos_right": {"g": "g", "d": "d", "s": "s"},
    "pmos_left": {"g": "g", "d": "d", "s": "s"},
    "pmos_right": {"g": "g", "d": "d", "s": "s"},
    "resistor_v": {"top": "top", "bottom": "bottom"},
    "capacitor_v": {"bottom": "bottom", "top": "top"},
    "current_source_down": {"top": "top", "bottom": "bottom"},
    "vdd": {"branch_L": "branch_L"},
    "black_node": {"c": "c"},
    "io_node": {"c": "c"},
    "rail": {"branch_D": "branch_D", "branch_L": "branch_L", "branch_R": "branch_R", "branch_U": "branch_U"},
    "bus": {"c": "c"},
}


class SpecError(ValueError):
    pass


def _fmt_gap(gap: float) -> str:
    return f"{gap:g}cm"


def _scope_header(comp: dict[str, Any]) -> str:
    if comp.get("root"):
        return r"\begin{scope}[shift={(0, 0)}]"
    axis = comp.get("axis", "y")
    if axis not in ("x", "y"):
        raise SpecError(f"component {comp.get('id')!r}: axis must be 'x' or 'y'")
    key = "xshift" if axis == "x" else "yshift"
    return rf"\begin{{scope}}[shift={{({comp['parent']})}}, {key}={_fmt_gap(comp['gap'])}]"


def _anchor_names_for(comp: dict[str, Any]) -> list[str]:
    cid = comp["id"]
    tpl = TEMPLATES[comp["type"]]
    names: list[str] = []
    for raw in tpl["anchors"]:
        names.append(
            raw.format(
                id=cid,
                parent=comp.get("parent", ""),
                branch_dir=comp.get("branch_dir", "D"),
            )
        )
    return names


def _render_component(comp: dict[str, Any]) -> list[str]:
    tpl = TEMPLATES[comp["type"]]
    cid = comp["id"]
    incoming = comp.get("incoming")
    hit_h = comp.get("hit_h", "0.6cm")
    hit_w = comp.get("hit_w", "0.9cm")
    hit_x = comp.get("hit_x", "0")
    hit_y = comp.get("hit_y", "0")
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
            line = raw.format(
                id=cid,
                parent=comp.get("parent", ""),
                branch_dir=comp.get("branch_dir", "D"),
                hit_h=hit_h,
                hit_w=hit_w,
                hit_x=hit_x,
                hit_y=hit_y,
                label_side=comp.get("label_side", "left"),
            )
        lines.append(f"  {line}")
    label = tpl.get("label")
    if label:
        lines.append(
            "  "
            + label.format(
                id=cid,
                label=comp.get("label", f"${cid}$"),
                label_side=comp.get("label_side", "left"),
            )
        )
    lines.append(r"\end{scope}")
    return lines


def _render_chord(chord: dict[str, Any]) -> list[str]:
    route = chord.get("route", "-|")
    style = chord.get("style", "thick")
    cid = chord.get("id", "")
    lines = [f"% chord {cid}".rstrip()]
    if route in ("-|", "|-"):
        lines.append(rf"\draw[{style}] ({chord['from']}) {route} ({chord['to']});")
        return lines
    if route == "tap":
        lines.append(rf"\draw[{style}] ({chord['from']}) -- ({chord['from']} |- {chord['to']});")
        return lines
    if route == "tap_h":
        lines.append(rf"\draw[{style}] ({chord['from']}) -- ({chord['from']} -| {chord['to']});")
        return lines
    if route == "bus":
        bus = chord.get("bus")
        if not bus:
            raise SpecError(f"chord {cid!r}: route 'bus' requires a 'bus' anchor")
        lines.append(
            rf"\draw[{style}] ({chord['from']}) -- ({chord['from']} |- {bus}) -- ({chord['to']} |- {bus}) -- ({chord['to']});"
        )
        return lines
    if route == "bus_h":
        bus = chord.get("bus")
        if not bus:
            raise SpecError(f"chord {cid!r}: route 'bus_h' requires a 'bus' anchor")
        lines.append(
            rf"\draw[{style}] ({chord['from']}) -- ({chord['from']} -| {bus}) -- ({chord['to']} -| {bus}) -- ({chord['to']});"
        )
        return lines
    if route == "corner_bus":
        corner = chord.get("corner")
        bus = chord.get("bus")
        if not corner or not bus:
            raise SpecError(f"chord {cid!r}: route 'corner_bus' requires 'corner' and 'bus' anchors")
        lines.append(
            rf"\draw[{style}] ({chord['from']}) -- ({chord['from']} -| {corner}) -- ({corner} |- {bus}) -- ({chord['to']} |- {bus}) -- ({chord['to']});"
        )
        return lines
    raise SpecError(f"chord {cid!r}: unsupported route {route!r}")


def _validate_anchors(spec: dict[str, Any]) -> dict[str, set[str]]:
    components = spec.get("components", [])
    seen_ids: set[str] = set()
    anchors: dict[str, set[str]] = {}
    comp_order: dict[str, int] = {}

    for idx, comp in enumerate(components):
        cid = comp.get("id")
        if not isinstance(cid, str) or not cid.strip():
            raise SpecError(f"component #{idx}: missing id")
        cid = cid.strip()
        if cid in seen_ids:
            raise SpecError(f"component {cid!r}: duplicate id")
        seen_ids.add(cid)
        comp["id"] = cid
        ctype = comp.get("type")
        if ctype not in TEMPLATES:
            raise SpecError(f"component {cid!r}: unknown type {ctype!r}")
        comp["type"] = ctype
        comp_order[cid] = idx

        if not comp.get("root"):
            parent = comp.get("parent")
            if not parent:
                raise SpecError(f"component {cid!r}: non-root component needs a parent anchor")
            comp["parent"] = str(parent).strip()
            if comp.get("axis") not in ("x", "y"):
                raise SpecError(f"component {cid!r}: axis must be 'x' or 'y'")
            if comp.get("gap") is None:
                raise SpecError(f"component {cid!r}: missing gap")
        comp_anchors = _anchor_names_for(comp)
        anchors[cid] = set(comp_anchors)

    # parents must already exist when they are referenced
    all_anchor_names: set[str] = set()
    for comp in components:
        if not comp.get("root"):
            parent = comp["parent"]
            if parent not in all_anchor_names:
                raise SpecError(
                    f"component {comp['id']!r}: parent {parent!r} is not defined before it "
                    "(sort components so the spanning-tree parent comes first)"
                )
        all_anchor_names.update(anchors[comp["id"]])

    # spanning tree must be acyclic
    parent_of = {c["id"]: None if c.get("root") else _anchor_owner(c["parent"], anchors) for c in components}
    state: dict[str, int] = {}

    def visit(cid: str, trail: list[str]) -> None:
        if state.get(cid) == 2:
            return
        if state.get(cid) == 1:
            cycle = trail[trail.index(cid):] + [cid]
            raise SpecError("parent cycle detected: " + " -> ".join(cycle))
        state[cid] = 1
        p = parent_of.get(cid)
        if p is not None:
            visit(p, trail + [cid])
        state[cid] = 2

    for cid in parent_of:
        visit(cid, [])

    # only one root is allowed for a single movable frame
    roots = [c for c in components if c.get("root")]
    if len(roots) != 1:
        raise SpecError(f"expected exactly one root component, got {len(roots)}")

    return anchors


def _anchor_owner(anchor: str, anchors: dict[str, set[str]]) -> str | None:
    for cid, names in anchors.items():
        if anchor in names:
            return cid
    return None


def _validate_chords(spec: dict[str, Any], anchors: dict[str, set[str]]) -> None:
    all_anchor_names = {name for names in anchors.values() for name in names}
    seen_chords: set[str] = set()
    for chord in spec.get("chords", []):
        cid = chord.get("id", "")
        if cid in seen_chords:
            raise SpecError(f"chord {cid!r}: duplicate id")
        seen_chords.add(cid)
        route = chord.get("route", "-|")
        if route not in ("-|", "|-", "tap", "tap_h", "bus", "bus_h", "corner_bus"):
            raise SpecError(f"chord {cid!r}: unsupported route {route!r}")
        text_parts = [
            chord.get("from", ""),
            chord.get("to", ""),
            chord.get("bus", ""),
            chord.get("corner", ""),
        ]
        for text in text_parts:
            if HARD_COORD_RE.search(str(text)):
                raise SpecError(
                    f"chord {cid!r}: hardcoded absolute coordinate detected in {text!r}; "
                    "use a named anchor or (A |- B) projection"
                )
            for name in ANCHOR_RE.findall(str(text)):
                if name not in all_anchor_names:
                    raise SpecError(f"chord {cid!r}: unknown anchor {name!r}")


def _validate_nets(spec: dict[str, Any], anchors: dict[str, set[str]]) -> None:
    port_suffixes: dict[str, set[str]] = {}
    for comp in spec.get("components", []):
        port_suffixes.setdefault(comp["type"], set()).update(PORT_ALIASES.get(comp["type"], {}).keys())

    for net in spec.get("nets", []):
        nid = net.get("id", "")
        pins = net.get("pins", [])
        if len(pins) < 2:
            raise SpecError(f"net {nid!r}: a net must have at least two pins")
        for pin in pins:
            if not isinstance(pin, str) or "." not in pin:
                raise SpecError(f"net {nid!r}: malformed pin {pin!r}, expected <component>.<port>")
            cid, port = pin.rsplit(".", 1)
            comp = next((c for c in spec.get("components", []) if c["id"] == cid), None)
            if comp is None:
                raise SpecError(f"net {nid!r}: unknown component {cid!r} in pin {pin!r}")
            allowed = port_suffixes.get(comp["type"], set())
            if port not in allowed:
                raise SpecError(
                    f"net {nid!r}: port {port!r} is invalid for {comp['type']}; "
                    f"allowed: {sorted(allowed)}"
                )


def validate_spec(spec: dict[str, Any]) -> None:
    anchors = _validate_anchors(spec)
    _validate_chords(spec, anchors)
    _validate_nets(spec, anchors)


def generate(spec: dict[str, Any]) -> str:
    validate_spec(spec)
    lines: list[str] = [
        r"\begin{tikzpicture}",
        r"% generated by scripts/slidable-layout/generator_v2.py",
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
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()

    with open(args.spec, "r", encoding="utf-8") as f:
        spec = json.load(f)
    validate_spec(spec)
    if args.validate_only:
        print("spec OK")
        return 0
    tikz = generate(spec)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(tikz)
    print(f"wrote {os.path.abspath(args.out)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
