"""Unit tests for the circuit builder (port math, validation, codegen).

Port coordinates below are hand-computed from the toolbar TikZ code
(packages/app/src/ui/Toolbar.tsx, insertResistor / insertMosfet / insertPmos):

- resistor at (x, y): P1=(x-0.35, y), P2=(x+0.35, y)
- nMOS body lives in scope [xshift=-17pt, yshift=4pt], local ports
  G=(0.3,0.5), D=(1.03,1), S=(1.03,0) -> global = (x + ox, y + oy)
  with ox=-17/28.452756, oy=4/28.452756
- pMOS local ports G=(0.3,0.5), D=(1.03,0), S=(1.03,1), no offset
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from circuit.builder import CircuitError, build_circuit

PT_PER_CM = 28.452756
OX_NMOS = -17.0 / PT_PER_CM
OY_NMOS = 4.0 / PT_PER_CM


def near(a, b, eps=0.002):
    return abs(a - b) <= eps


class PortMathTest(unittest.TestCase):
    def test_resistor_origin(self):
        r = build_circuit(
            [{"id": "R1", "type": "resistor", "x": 0, "y": 0}], []
        )
        comp = r.components[0]
        self.assertTrue(near(comp.ports["P1"][0], -0.35))
        self.assertTrue(near(comp.ports["P1"][1], 0.0))
        self.assertTrue(near(comp.ports["P2"][0], 0.35))
        self.assertTrue(near(comp.ports["P2"][1], 0.0))

    def test_nmos_origin(self):
        """nMOS at origin: scope offset (-17pt, +4pt) folded into ports."""
        r = build_circuit([{"id": "M1", "type": "nmos", "x": 0, "y": 0}], [])
        ports = r.components[0].ports
        self.assertTrue(near(ports["G"][0], 0.3 + OX_NMOS), ports["G"])
        self.assertTrue(near(ports["G"][1], 0.5 + OY_NMOS), ports["G"])
        self.assertTrue(near(ports["D"][0], 1.03 + OX_NMOS), ports["D"])
        self.assertTrue(near(ports["D"][1], 1.0 + OY_NMOS), ports["D"])
        self.assertTrue(near(ports["S"][0], 1.03 + OX_NMOS), ports["S"])
        self.assertTrue(near(ports["S"][1], 0.0 + OY_NMOS), ports["S"])

    def test_nmos_shifted(self):
        r = build_circuit([{"id": "M1", "type": "nmos", "x": 3.0, "y": -1.0}], [])
        ports = r.components[0].ports
        self.assertTrue(near(ports["G"][0], 3.0 + OX_NMOS + 0.3), ports["G"])
        self.assertTrue(near(ports["D"][1], -1.0 + OY_NMOS + 1.0), ports["D"])

    def test_pmos_ports(self):
        r = build_circuit([{"id": "M1", "type": "pmos", "x": 2.0, "y": 1.0}], [])
        ports = r.components[0].ports
        self.assertTrue(near(ports["G"][0], 2.3) and near(ports["G"][1], 1.5), ports["G"])
        self.assertTrue(near(ports["D"][0], 3.03) and near(ports["D"][1], 1.0), ports["D"])
        self.assertTrue(near(ports["S"][0], 3.03) and near(ports["S"][1], 2.0), ports["S"])


class ValidationTest(unittest.TestCase):
    def test_duplicate_id(self):
        with self.assertRaises(CircuitError) as ctx:
            build_circuit(
                [
                    {"id": "R1", "type": "resistor"},
                    {"id": "R1", "type": "resistor"},
                ],
                [],
            )
        self.assertIn("R1", str(ctx.exception))
        self.assertIn("重复", str(ctx.exception))

    def test_unknown_type(self):
        with self.assertRaises(CircuitError) as ctx:
            build_circuit([{"id": "X1", "type": "capacitor"}], [])
        msg = str(ctx.exception)
        self.assertIn("capacitor", msg)
        self.assertIn("resistor", msg)

    def test_missing_id(self):
        with self.assertRaises(CircuitError):
            build_circuit([{"type": "resistor"}], [])

    def test_unknown_component_in_wire(self):
        with self.assertRaises(CircuitError) as ctx:
            build_circuit(
                [{"id": "R1", "type": "resistor"}],
                [{"from": "R1.P1", "to": "NOPE.G"}],
            )
        msg = str(ctx.exception)
        self.assertIn("NOPE", msg)
        self.assertIn("R1", msg)

    def test_unknown_port(self):
        with self.assertRaises(CircuitError) as ctx:
            build_circuit(
                [{"id": "R1", "type": "resistor"}],
                [{"from": "R1.P1", "to": "R1.X"}],
            )
        msg = str(ctx.exception)
        self.assertIn("R1", msg)
        self.assertIn("X", msg)
        self.assertIn("P1", msg)  # actionable: lists valid ports

    def test_bad_ref_format(self):
        with self.assertRaises(CircuitError) as ctx:
            build_circuit(
                [{"id": "R1", "type": "resistor"}],
                [{"from": "R1", "to": "R1.P1"}],
            )
        self.assertIn("R1.P2", str(ctx.exception))

    def test_duplicate_wire_id(self):
        with self.assertRaises(CircuitError):
            build_circuit(
                [{"id": "R1", "type": "resistor"}],
                [
                    {"id": "w1", "from": "R1.P1", "to": {"x": 0, "y": 1}},
                    {"id": "w1", "from": "R1.P2", "to": {"x": 1, "y": 1}},
                ],
            )


class WireAndCodegenTest(unittest.TestCase):
    def test_wire_between_ports(self):
        r = build_circuit(
            [
                {"id": "R1", "type": "resistor", "x": 0, "y": 0},
                {"id": "M1", "type": "nmos", "x": 0, "y": 0},
            ],
            [{"id": "w1", "from": "R1.P2", "to": "M1.G"}],
        )
        self.assertEqual(len(r.wires), 1)
        w = r.wires[0]
        g_global = (0.3 + OX_NMOS, 0.5 + OY_NMOS)
        self.assertTrue(near(float(w["endpoints"][0][0]), 0.35))
        self.assertTrue(near(float(w["endpoints"][0][1]), 0.0))
        self.assertTrue(near(float(w["endpoints"][1][0]), g_global[0]))
        self.assertTrue(near(float(w["endpoints"][1][1]), g_global[1]))
        self.assertIn("\\draw[thick", r.tikz)

    def test_free_point_wire(self):
        r = build_circuit(
            [{"id": "R1", "type": "resistor", "x": 1, "y": 2}],
            [{"from": "R1.P1", "to": {"x": -1.5, "y": 2.0}}],
        )
        self.assertEqual(r.wires[0]["endpoints"][1], ["-1.500", "2.000"])

    def test_junction_dots_only_at_shared_points(self):
        r = build_circuit(
            [
                {"id": "R1", "type": "resistor", "x": 0, "y": 0},
                {"id": "R2", "type": "resistor", "x": 3, "y": 0},
                {"id": "R3", "type": "resistor", "x": 1.5, "y": 1.5},
            ],
            [
                {"id": "w1", "from": "R1.P2", "to": "R2.P1"},
                {"id": "w2", "from": "R3.P1", "to": {"x": 0.35, "y": 0.0}},
            ],
        )
        self.assertEqual(len(r.junctions), 1)
        jx, jy = r.junctions[0]
        self.assertTrue(near(jx, 0.35) and near(jy, 0.0))
        # the junction gets a dot in the tikz; count circle commands
        self.assertEqual(r.tikz.count("circle (0.05cm)"), 1)

    def test_no_junction_dots_when_disabled(self):
        r = build_circuit(
            [{"id": "R1", "type": "resistor"}, {"id": "R2", "type": "resistor"}],
            [
                {"from": "R1.P2", "to": {"x": 0.35, "y": 0}},
                {"from": "R2.P1", "to": {"x": 0.35, "y": 0}},
            ],
            junction_dots=False,
        )
        self.assertEqual(r.junctions, [])
        self.assertNotIn("circle", r.tikz)

    def test_default_and_explicit_labels(self):
        r = build_circuit(
            [
                {"id": "R1", "type": "resistor"},
                {"id": "M1", "type": "nmos", "label": "$M_{out}$"},
            ],
            [],
        )
        self.assertIn("{$R1$}", r.tikz)
        self.assertIn("{$M_{out}$}", r.tikz)

    def test_document_structure(self):
        r = build_circuit(
            [{"id": "R1", "type": "resistor", "x": 1, "y": 1}],
            [{"from": "R1.P1", "to": "R1.P2"}],
        )
        self.assertTrue(r.tikz.startswith("\\begin{tikzpicture}"))
        self.assertTrue(r.tikz.rstrip().endswith("\\end{tikzpicture}"))
        self.assertIn("xshift=", r.tikz)
        self.assertIn("circuit-mcp", r.tikz)


class CurrentSourceTest(unittest.TestCase):
    """电流源（用户 2026-08-07 定义）：圆 0.25cm + 1.8mm/1.7mm 箭头，
    端口 top(0, +0.4) / bottom(0, -0.4)，direction 决定箭头方向。"""

    def test_current_source_ports(self):
        r = build_circuit([{"id": "I1", "type": "current_source", "x": 0, "y": 0}], [])
        ports = r.components[0].ports
        self.assertTrue(near(ports["top"][0], 0.0) and near(ports["top"][1], 0.4), ports["top"])
        self.assertTrue(near(ports["bottom"][0], 0.0) and near(ports["bottom"][1], -0.4), ports["bottom"])

    def test_current_source_shifted_ports(self):
        r = build_circuit([{"id": "I1", "type": "current_source", "x": 1.5, "y": -2.0}], [])
        ports = r.components[0].ports
        self.assertTrue(near(ports["top"][1], -2.0 + 0.4), ports["top"])
        self.assertTrue(near(ports["bottom"][1], -2.0 - 0.4), ports["bottom"])

    def test_default_direction_down_arrow(self):
        # 不传 direction 时默认从上往下：(0, 0.15) -- (0, -0.15)
        r = build_circuit([{"id": "I1", "type": "current_source"}], [])
        self.assertIn("(0, 0.15) -- (0, -0.15)", r.tikz)
        self.assertNotIn("(0, -0.15) -- (0, 0.15)", r.tikz)

    def test_direction_up_arrow(self):
        r = build_circuit([{"id": "I1", "type": "current_source", "direction": "up"}], [])
        self.assertIn("(0, -0.15) -- (0, 0.15)", r.tikz)
        self.assertNotIn("(0, 0.15) -- (0, -0.15)", r.tikz)

    def test_invalid_direction_rejected(self):
        with self.assertRaises(CircuitError) as ctx:
            build_circuit([{"id": "I1", "type": "current_source", "direction": "left"}], [])
        self.assertIn("direction", str(ctx.exception))
        self.assertIn("down", str(ctx.exception))

    def test_wire_to_current_source_port(self):
        r = build_circuit(
            [{"id": "I1", "type": "current_source", "x": 0, "y": 0}],
            [{"from": "I1.top", "to": {"x": 0, "y": 1.5}}],
        )
        self.assertEqual(r.wires[0]["endpoints"][0], ["0.000", "0.400"])

    def test_direction_reported_in_payload(self):
        r = build_circuit([{"id": "I1", "type": "current_source", "direction": "up"}], [])
        self.assertEqual(r.components[0].direction, "up")

    def test_small_signal_default_labels_lowercase(self):
        # 电流源/电压源/电流箭头只用于小信号模型：不传 label 时默认标注小写，
        # 且不使用大写 id（$I1$/$V1$）作为标签
        r = build_circuit(
            [
                {"id": "I1", "type": "current_source"},
                {"id": "V1", "type": "voltage_source"},
                {"id": "A1", "type": "current_arrow"},
            ],
            [],
        )
        self.assertIn(r"{\normalsize $i$}", r.tikz)  # 电流源标签带 \normalsize
        self.assertIn(r"{\normalsize $v$}", r.tikz)  # 电压源标签带 \normalsize
        self.assertIn(r"{$i$}", r.tikz)  # 电流箭头标签无 \normalsize
        self.assertNotIn(r"$I1$", r.tikz)
        self.assertNotIn(r"$V1$", r.tikz)


class VoltageSourceAndArrowTest(unittest.TestCase):
    """电压源（0.25cm 圆 + rotate=90 极性短线，标签在左）与电流箭头
    （1.8mm/1.7mm 箭头 + 短引线，无圆），用户 2026-08-07 定义。"""

    def test_voltage_source_ports(self):
        r = build_circuit([{"id": "V1", "type": "voltage_source", "x": 0, "y": 0}], [])
        ports = r.components[0].ports
        self.assertTrue(near(ports["top"][0], 0.0) and near(ports["top"][1], 0.4), ports["top"])
        self.assertTrue(near(ports["bottom"][0], 0.0) and near(ports["bottom"][1], -0.4), ports["bottom"])

    def test_voltage_source_body_has_circle_and_rotate90(self):
        r = build_circuit([{"id": "V1", "type": "voltage_source", "label": "$v_x$"}], [])
        self.assertIn("circle (0.25cm)", r.tikz)
        self.assertIn("rotate=90", r.tikz)
        self.assertIn("$v_x$", r.tikz)

    def test_current_arrow_port(self):
        r = build_circuit([{"id": "A1", "type": "current_arrow", "x": 0, "y": 0}], [])
        ports = r.components[0].ports
        self.assertTrue(near(ports["bottom"][0], 0.0) and near(ports["bottom"][1], -0.25), ports["bottom"])

    def test_current_arrow_body_has_arrow(self):
        r = build_circuit([{"id": "A1", "type": "current_arrow", "label": "$i_X$"}], [])
        self.assertIn("Triangle[length=1.8mm, width=1.7mm]", r.tikz)
        self.assertIn("$i_X$", r.tikz)


if __name__ == "__main__":
    unittest.main()
