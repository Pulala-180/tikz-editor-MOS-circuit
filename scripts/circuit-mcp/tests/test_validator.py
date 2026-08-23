"""Unit tests for the MOS-circuit structural validator.

The fixtures below are derived from the MOS-circuit skill's component library
(relative-cascade style: each of the 8 core components in its own scope,
anchors named node_<id>_<d|g|s> / _c / _branch_<L|R|U|D>, \normalsize labels,
orthogonal |- / -| wires for chords).
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from circuit.validator import validate_drawing


def rules(source: str) -> set[str]:
    return {v.rule for v in validate_drawing(source)}


def errors(source: str) -> list:
    return [v for v in validate_drawing(source) if v.severity == "error"]


def warnings(source: str) -> list:
    return [v for v in validate_drawing(source) if v.severity == "warning"]


# ---------------------------------------------------------------------------
# Fixtures: the 8 core components as standalone scopes (from the skill library)
# ---------------------------------------------------------------------------

NMOS_M1 = """\
  \\begin{scope}[shift={(0,0)}]
    \\coordinate (M1_g) at (-0.73, 0);
    \\coordinate (M1_d) at (0, 0.5);
    \\coordinate (M1_s) at (0, -0.5);
    \\draw[thick] (-0.73,0) -- (-0.47,0);
    \\draw[ultra thick] (-0.48,-0.25) -- (-0.48,0.25);
    \\draw[ultra thick] (-0.32,-0.3) -- (-0.32,0.3);
    \\draw[thick, line cap=round, line join=round] (-0.33,0.2) -- (0,0.2) -- (0,0.5);
    \\draw[-{Triangle[length=1.6mm, width=1.1mm, sep=-1.2pt]}, thick, line cap=round] (-0.33,-0.2) -- (-0.03,-0.2);
    \\draw[thick, line cap=round, line join=round] (0,-0.21) -- (0,-0.5);
    \\node[right=0.08cm] at (0, 0) {\\normalsize $M_1$};
  \\end{scope}"""

NMOS_M3 = """\
  \\begin{scope}[shift={(M1_d)}, yshift=1.0cm]
    \\coordinate (M3_g) at (-0.73, 0);
    \\coordinate (M3_d) at (0, 0.5);
    \\coordinate (M3_s) at (0, -0.5);
    \\draw[thick] (0, -0.5) |- (M1_d);
    \\draw[thick] (-0.73,0) -- (-0.47,0);
    \\draw[ultra thick] (-0.48,-0.25) -- (-0.48,0.25);
    \\draw[ultra thick] (-0.32,-0.3) -- (-0.32,0.3);
    \\draw[thick, line cap=round, line join=round] (-0.33,0.2) -- (0,0.2) -- (0,0.5);
    \\draw[-{Triangle[length=1.6mm, width=1.1mm, sep=-1.2pt]}, thick, line cap=round] (-0.33,-0.2) -- (-0.03,-0.2);
    \\draw[thick, line cap=round, line join=round] (0,-0.21) -- (0,-0.5);
    \\node[right=0.08cm] at (0, 0) {\\normalsize $M_3$};
  \\end{scope}"""

BLACK_NODE = """\
  \\begin{scope}[shift={(M1_d)}, yshift=0.3cm]
    \\coordinate (node_X_c) at (0,0);
    \\coordinate (node_X_branch_L) at (-1.5cm, 0);
    \\draw[thick] (node_X_c) |- (M1_d);
    \\draw[fill=black] (node_X_c) circle (0.055cm);
    \\draw[thick] (node_X_c) -- (node_X_branch_L);
  \\end{scope}"""

RESISTOR_R1 = """\
  \\begin{scope}[shift={(node_X_branch_L)}]
    \\coordinate (R1_left) at (0, 0);
    \\draw[thick] (0.7,0) -| (node_X_branch_L);
    \\draw[thick, line cap=round] (0,0) -- (0.155,0) -- (0.1875,0.15) -- (0.2525,-0.15) -- (0.3175,0.15) -- (0.3825,-0.15) -- (0.4525,0.15) -- (0.5125,-0.15) -- (0.545,0) -- (0.7,0);
    \\node[above=0.15cm] at (0.35, 0) {\\normalsize $R_1$};
  \\end{scope}"""

CAPACITOR_C1 = """\
  \\begin{scope}[shift={(R1_left)}, xshift=-0.8cm]
    \\coordinate (C1_left) at (-0.3, 0);
    \\draw[thick] (0.34, 0) -| (R1_left);
    \\draw[ultra thick] (0.1, -0.25) -- (0.1, 0.25);
    \\draw[ultra thick] (-0.06, -0.25) -- (-0.06, 0.25);
    \\draw[thick] (0.1, 0) -- (0.34, 0);
    \\draw[thick] (-0.06, 0) -- (-0.3, 0);
  \\end{scope}"""

IO_NODE = """\
  \\begin{scope}[shift={(C1_left)}]
    \\draw[thick] (0,0) -- (C1_left);
    \\draw[fill=white, thick] (0,0) circle (0.055cm);
  \\end{scope}"""

# 用户 2026-08-07 批准的电流源形态：1.8mm/1.7mm 箭头 + 0.25cm 圆
# （进入元件白名单，未批准形态继续拦）
CURRENT_SOURCE_APPROVED = """\
  \\begin{scope}[shift={(M1_d)}, yshift=-0.5cm]
    \\draw[thick] (0,0) |- (M1_d);
    \\draw[thick] (0, 0) circle (0.25cm);
    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (0, 0.15) -- (0, -0.15);
    \\node[right=0.15cm] at (0.15, -0.01) {\\normalsize $g_{\\mathrm{m1}} v_{in}$};
    \\draw[thick, line cap=round] (0,-0.25) -- (0,-0.4);
    \\draw[thick, line cap=round] (0,0.4) -- (0,0.25);
  \\end{scope}"""

# 电压源（用户 2026-08-07 定义）：0.25cm 圆 + rotate=90 极性短线（无箭头）
VOLTAGE_SOURCE = """\
  \\begin{scope}[shift={(M1_d)}, yshift=-0.5cm]
    \\draw[thick] (0,0) |- (M1_d);
    \\draw[thick] (0, 0) circle (0.25cm);
    \\node[right=0.15cm] at (-0.93, 0) {\\normalsize $v_x$};
    \\draw[thick, line cap=round] (0,-0.25) -- (0,-0.4);
    \\draw[thick, line cap=round] (0,0.4) -- (0,0.25);
    \\begin{scope}
      \\draw[thick] (0.35,0.2) -- (0.35,0.35);
      \\draw[thick, rotate=90] (0.28,-0.42) -- (0.28,-0.28);
    \\end{scope}
    \\draw[thick, rotate=90] (-0.3,-0.42) -- (-0.3,-0.28);
  \\end{scope}"""

# 电流箭头（用户 2026-08-07 定义）：1.8mm/1.7mm 箭头 + 短引线 (0,-0.25)，无圆
CURRENT_ARROW = """\
  \\begin{scope}[shift={(M1_d)}, yshift=-0.5cm]
    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (0, 0.15) -- (0, -0.15);
    \\node[right=0.15cm] at (-0.07, -0.04) {$i_X$};
    \\draw[thick, line cap=round] (0,-0.15) -- (0,-0.25);
  \\end{scope}"""


class VoltageSourceAndArrowWhitelistTest(unittest.TestCase):
    """电压源/电流箭头（用户 2026-08-07 批准）：识别为元件，不被白名单误拦。"""

    def test_voltage_source_not_undefined(self):
        src = wrap(NMOS_M1 + "\n" + VOLTAGE_SOURCE)
        self.assertNotIn("undefined-component", rules(src))
        self.assertNotIn("hit-target", rules(src))

    def test_current_arrow_not_undefined(self):
        # 关键：1.8mm 箭头无圆——必须识别为 CurrentArrow 才不被白名单拦
        src = wrap(NMOS_M1 + "\n" + CURRENT_ARROW)
        self.assertNotIn("undefined-component", rules(src))

    def test_current_arrow_recognized_as_component(self):
        src = wrap(NMOS_M1 + "\n" + CURRENT_ARROW)
        self.assertNotIn("hit-target", rules(src))

    def test_voltage_and_current_source_distinct(self):
        # 圆+rotate=90 → VoltageSource；圆+箭头 → CurrentSource；同图互不误认
        src = wrap(NMOS_M1 + "\n" + VOLTAGE_SOURCE + "\n" + CURRENT_SOURCE_APPROVED)
        self.assertNotIn("undefined-component", rules(src))
        self.assertNotIn("scope-isolation", rules(src))


VDD = """\
  \\begin{scope}[shift={(M3_d)}, yshift=0.5cm]
    \\draw[thick] (0, 0) |- (M3_d);
    \\draw[ultra thick] (-0.95,0) -- (0.9,0);
    \\node[above=0.05cm] at (0,0) {\\normalsize $V_{DD}$};
  \\end{scope}"""

GND = """\
  \\begin{scope}[shift={(M1_s)}, yshift=-0.5cm]
    \\draw[thick] (0, 0) |- (M1_s);
    \\draw[ultra thick] (-0.2, 0) -- (0.2, 0);
    \\draw[ultra thick] (-0.13, -0.1) -- (0.13, -0.1);
    \\draw[ultra thick] (-0.06, -0.2) -- (0.06, -0.2);
  \\end{scope}"""

VALID_CASCADE = (
    "\\begin{tikzpicture}\n"
    + NMOS_M1
    + "\n"
    + CURRENT_SOURCE_APPROVED
    + "\n"
    + NMOS_M3
    + "\n"
    + BLACK_NODE
    + "\n"
    + RESISTOR_R1
    + "\n"
    + CAPACITOR_C1
    + "\n"
    + IO_NODE
    + "\n"
    + VDD
    + "\n"
    + GND
    + "\n"
    + "  \\draw[thick] (M1_g) |- (M3_g);\n"  # 反馈弦：正交
    + "\\end{tikzpicture}\n"
)


def wrap(body: str) -> str:
    return "\\begin{tikzpicture}\n" + body + "\\end{tikzpicture}\n"


class ScopeIsolationTest(unittest.TestCase):
    def test_valid_cascade_has_no_scope_violation(self):
        self.assertNotIn("scope-isolation", rules(VALID_CASCADE))

    def test_resistor_and_capacitor_in_one_scope(self):
        src = wrap(
            "  \\begin{scope}[shift={(0,0)}]\n"
            "    \\draw[thick] (0,0) -- (0.155,0) -- (0.1875,0.15) -- (0.7,0);\n"
            "    \\draw[ultra thick] (0.1, -0.25) -- (0.1, 0.25);\n"
            "    \\draw[ultra thick] (-0.06, -0.25) -- (-0.06, 0.25);\n"
            "  \\end{scope}\n"
        )
        self.assertIn("scope-isolation", rules(src))

    def test_mos_and_black_node_in_one_scope(self):
        src = wrap(
            "  \\begin{scope}[shift={(0,0)}]\n"
            "    \\draw[-{Triangle[length=1.6mm, width=1.1mm, sep=-1.2pt]}, thick] (-0.33,-0.2) -- (-0.03,-0.2);\n"
            "    \\draw[fill=black] (0,0) circle (0.055cm);\n"
            "  \\end{scope}\n"
        )
        self.assertIn("scope-isolation", rules(src))

    def test_component_drawn_at_top_level(self):
        src = wrap(
            "  \\draw[thick, line cap=round] (0,0) -- (0.155,0) -- (0.1875,0.15) -- (0.7,0);\n"
        )
        self.assertIn("scope-isolation", rules(src))


class GlobalCoordinateTest(unittest.TestCase):
    def test_global_coordinate_violation(self):
        src = wrap(
            "  \\coordinate (X) at (5,2);\n"
            "  \\draw[thick] (0,0) -- (1,1);\n"
        )
        self.assertIn("no-global-coordinate", rules(src))

    def test_scope_local_coordinates_ok(self):
        self.assertNotIn("no-global-coordinate", rules(VALID_CASCADE))


class AnchorNamingTest(unittest.TestCase):
    def test_bad_anchor_name_warning(self):
        src = wrap(
            "  \\begin{scope}[shift={(0,0)}]\n"
            "    \\coordinate (foo) at (0, 0);\n"
            "    \\draw[thick] (-0.73,0) -- (-0.47,0);\n"
            "    \\draw[fill=black] (foo) circle (0.055cm);\n"
            "  \\end{scope}\n"
        )
        self.assertIn("anchor-naming", rules(src))

    def test_convention_names_ok(self):
        src = wrap(
            "  \\begin{scope}[shift={(0,0)}]\n"
            "    \\coordinate (M1_g) at (-0.73, 0);\n"
            "    \\coordinate (node_X_c) at (0,0);\n"
            "    \\coordinate (node_X_branch_L) at (-1.5cm, 0);\n"
            "    \\coordinate (R1_left) at (0, 0);\n"
            "    \\draw[thick] (-0.73,0) -- (-0.47,0);\n"
            "    \\draw[fill=black] (node_X_c) circle (0.055cm);\n"
            "  \\end{scope}\n"
        )
        self.assertNotIn("anchor-naming", rules(src))


class FontSizeTest(unittest.TestCase):
    def test_large_font_violation(self):
        src = wrap(
            "  \\begin{scope}[shift={(0,0)}]\n"
            "    \\draw[thick] (-0.73,0) -- (-0.47,0);\n"
            "    \\node[right=0.08cm] at (0, 0) {\\large $M_1$};\n"
            "  \\end{scope}\n"
        )
        self.assertIn("font-size", rules(src))

    def test_small_font_violation(self):
        src = wrap(
            "  \\begin{scope}[shift={(0,0)}]\n"
            "    \\node at (0, 0) {\\small $R_1$};\n"
            "  \\end{scope}\n"
        )
        self.assertIn("font-size", rules(src))

    def test_normalsize_ok(self):
        self.assertNotIn("font-size", rules(VALID_CASCADE))


class DynamicPgfTest(unittest.TestCase):
    def test_pgfgetlastxy_violation(self):
        src = wrap("  \\pgfgetlastxy{\\mX}{\\mY}\n")
        self.assertIn("dynamic-pgf", rules(src))

    def test_pgfmathsetmacro_allowed(self):
        src = wrap("  \\pgfmathsetmacro{\\foo}{2+2}\n")
        self.assertNotIn("dynamic-pgf", rules(src))


class OpacityTest(unittest.TestCase):
    def test_opacity_zero_violation(self):
        src = wrap(
            "  \\draw[line width=12pt, opacity=0] (0,0) -- (1,1);\n"
        )
        self.assertIn("opacity-zero", rules(src))

    def test_opacity_001_ok(self):
        src = wrap(
            "  \\node[minimum height=0.5cm, minimum width=0.5cm, fill=white, opacity=0.01] at (0,0) {};\n"
        )
        self.assertNotIn("opacity-zero", rules(src))


class OrthogonalChordTest(unittest.TestCase):
    def test_diagonal_chord_warning(self):
        src = wrap(
            "  \\begin{scope}[shift={(0,0)}]\n"
            "    \\coordinate (M1_d) at (0, 0.5);\n"
            "    \\coordinate (M3_g) at (-0.73, 1.5);\n"
            "    \\draw[thick] (-0.73,0) -- (-0.47,0);\n"
            "  \\end{scope}\n"
            "  \\draw[thick] (M1_d) -- (M3_g);\n"
        )
        self.assertIn("orthogonal-chords", rules(src))

    def test_orthogonal_chord_ok(self):
        self.assertNotIn("orthogonal-chords", rules(VALID_CASCADE))

    def test_in_scope_branch_line_not_flagged(self):
        # 节点 scope 内的分支句柄线是 -- 连接同 scope 锚点，不算弦
        self.assertNotIn("orthogonal-chords", rules(BLACK_NODE))

    def test_diagonal_chord_is_error_not_warning(self):
        # skill 语义：弦禁止直线（DO NOT use straight lines for chords）——
        # 对角弦必须 error 级（桥接校验门才会拦下）
        src = wrap(
            "  \\begin{scope}[shift={(0,0)}]\n"
            "    \\coordinate (M1_d) at (0, 0.5);\n"
            "    \\coordinate (M3_g) at (-0.73, 1.5);\n"
            "    \\draw[thick] (-0.73,0) -- (-0.47,0);\n"
            "  \\end{scope}\n"
            "  \\draw[thick] (M1_d) -- (M3_g);\n"
        )
        hits = [v for v in validate_drawing(src) if v.rule == "orthogonal-chords"]
        self.assertTrue(hits)
        self.assertEqual(hits[0].severity, "error")


class HitTargetTest(unittest.TestCase):
    """Rule 10：中间路由段（非元件 scope 中的连线段）必须带隐形热区垫片。"""

    STITCH = """\
  \\begin{scope}[shift={(node_Drain_branch_out)}]
    \\coordinate (node_Vout_left) at (-0.055,0);
    \\draw[thick] (node_Drain_branch_out) -- (node_Drain_branch_out -| node_Vout_left) -- (node_Vout_left);
  \\end{scope}"""

    PAD_NODE = (
        "    \\node[minimum height=1cm, minimum width=4cm, fill=white, opacity=0.01] "
        "at (0, -0.5cm) {};\n"
    )

    def test_intermediate_segment_without_pad_warning(self):
        src = wrap(NMOS_M1 + "\n" + self.STITCH)
        self.assertIn("hit-target", rules(src))

    def test_intermediate_segment_with_pad_ok(self):
        src = wrap(NMOS_M1 + "\n" + self.STITCH + self.PAD_NODE)
        self.assertNotIn("hit-target", rules(src))
        self.assertNotIn("component-pad", rules(src))  # 中间路由段允许垫片


class ComponentPadTest(unittest.TestCase):
    """垫片白名单：只允许中间路由段与黑点节点；其余 7 大元件 scope 内严禁垫片。"""

    PAD_IN_MOS = NMOS_M1.replace(
        "    \\node[right=0.08cm] at (0, 0) {\\normalsize $M_1$};",
        "    \\node[right=0.08cm] at (0, 0) {\\normalsize $M_1$};\n"
        "    \\node[minimum height=1cm, minimum width=2cm, fill=white, opacity=0.01] at (0, 0) {};",
    )

    PAD_IN_BLACKNODE = BLACK_NODE.replace(
        "    \\draw[thick] (node_X_c) -- (node_X_branch_L);",
        "    \\draw[thick] (node_X_c) -- (node_X_branch_L);\n"
        "    \\node[minimum height=0.5cm, minimum width=0.5cm, fill=white, opacity=0.01] at (0, 0) {};",
    )

    def test_pad_on_mos_component_error(self):
        src = wrap(self.PAD_IN_MOS)
        self.assertIn("component-pad", rules(src))

    def test_pad_on_blacknode_allowed(self):
        src = wrap(self.PAD_IN_BLACKNODE)
        self.assertNotIn("component-pad", rules(src))

    def test_pad_on_io_terminal_allowed(self):
        # IO 端子（Vin/Vout 空心圆）和黑点一样是微小端子，允许垫片
        src = wrap(
            IO_NODE
            + "    \\node[minimum height=0.5cm, minimum width=0.5cm, fill=white, opacity=0.01] at (0, 0) {};\n"
        )
        self.assertNotIn("component-pad", rules(src))

    def test_component_without_pad_ok(self):
        self.assertNotIn("component-pad", rules(VALID_CASCADE))


class IOCircleLastTest(unittest.TestCase):
    """IO 端子空心圆必须是 scope 内最后一条 \draw 命令，防止导线盖住端子。"""

    def test_circle_with_draw_after_it_error(self):
        src = wrap(
            "  \\begin{scope}[shift={(C1_left)}]\n"
            "    \\draw[fill=white, thick] (0,0) circle (0.055cm);\n"
            "    \\draw[thick] (0,0) -- (C1_left);\n"  # 圆之后还有 draw → 违规
            "  \\end{scope}\n"
        )
        self.assertIn("io-circle-last", rules(src))

    def test_circle_last_draw_ok(self):
        # skill 正版：圆是最后一条 draw（标签 \node 在圆后允许——文字在最上层是正常的）
        src = wrap(IO_NODE)
        self.assertNotIn("io-circle-last", rules(src))

    def test_circle_before_label_node_ok(self):
        # 画布现行模式：圆 → 标签 \node，圆仍是最后一条 draw
        src = wrap(
            "  \\begin{scope}[shift={(C1_left)}]\n"
            "    \\draw[thick] (0,0) -- (C1_left);\n"
            "    \\draw[fill=white, thick] (0,0) circle (0.055cm);\n"
            "    \\node[right=0.1cm] at (0,0) {\\normalsize $V_{\\mathrm{out}}$};\n"
            "  \\end{scope}\n"
        )
        self.assertNotIn("io-circle-last", rules(src))

    def test_black_node_circle_not_covered_by_rule(self):
        # 规则只针对空心圆（用户指定），黑点暂不适用
        src = wrap(BLACK_NODE)
        self.assertNotIn("io-circle-last", rules(src))


# 垂直电阻（用户已确认形态）：从 (0,0) 向下到 (0,-2.0)，锯齿 ±0.15
VERTICAL_RESISTOR = """\
  \\begin{scope}[shift={(node_X_c)}, yshift=-0.5cm]
    \\coordinate (node_Rx_branch_D) at (0,0);
    \\draw[thick] (0,0) |- (node_X_c);
    \\draw[thick, line cap=round] (0,0) -- (0,-0.4) -- (0.15,-0.48) -- (-0.15,-0.64) -- (0.15,-0.8) -- (-0.15,-0.96) -- (0.15,-1.12) -- (-0.15,-1.28) -- (0,-1.36) -- (0,-2.0);
    \\node[right=0.15cm] at (0.15, -1.0) {\\normalsize $R_x$};
  \\end{scope}"""

# 未定义元件：电流源（非 MOS 的 1.6mm 通道箭头）
CURRENT_SOURCE = """\
  \\begin{scope}[shift={(node_M1_d)}, yshift=-0.5cm]
    \\draw[thick] (0,0) |- (node_M1_d);
    \\draw[-{Triangle[length=2.5mm, width=1.5mm]}, thick] (0, 0.5) -- (0, -0.3);
    \\node[left] at (0, 0.1) {\\normalsize $I_{\\mathrm{REF}}$};
  \\end{scope}"""


class CurrentSourceWhitelistTest(unittest.TestCase):
    """电流源已批准形态（1.8mm 箭头 + 0.25cm 圆）识别为 CurrentSource：
    不再报 undefined-component；无圆的 1.8mm 箭头与旧 2.5mm 形态仍拦截。"""

    def test_approved_current_source_not_undefined(self):
        src = wrap(NMOS_M1 + "\n" + CURRENT_SOURCE_APPROVED)
        self.assertNotIn("undefined-component", rules(src))

    def test_approved_current_source_recognized_as_component(self):
        # 有元件特征 → 不是中间路由段，hit-target 垫片规则不触发
        src = wrap(NMOS_M1 + "\n" + CURRENT_SOURCE_APPROVED)
        self.assertNotIn("hit-target", rules(src))

    def test_approved_direction_up_not_undefined(self):
        up = CURRENT_SOURCE_APPROVED.replace(
            "\\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (0, 0.15) -- (0, -0.15);",
            "\\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (0, -0.15) -- (0, 0.15);",
        )
        src = wrap(NMOS_M1 + "\n" + up)
        self.assertNotIn("undefined-component", rules(src))

    def test_arrow_without_circle_still_undefined(self):
        # 只有 1.8mm 箭头、没有 0.25cm 圆 → 不是批准的电流源形态
        src = wrap(
            NMOS_M1
            + "\n"
            + """\
  \\begin{scope}[shift={(M1_d)}, yshift=-0.5cm]
    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (0, 0.5) -- (0, -0.3);
  \\end{scope}"""
        )
        self.assertIn("undefined-component", rules(src))

    def test_legacy_2_5mm_current_source_still_undefined(self):
        # 旧夹具（2.5mm 箭头）：未批准形态，继续拦截
        src = wrap(NMOS_M1 + "\n" + CURRENT_SOURCE)
        self.assertIn("undefined-component", rules(src))


class SmallSignalLabelTest(unittest.TestCase):
    """小信号标注：电流源/电压源/电流箭头只用于小信号模型，
    \\node 标签首字母必须小写（$v$/$i$），大写（$V$/$I$）报 error。"""

    def test_current_source_upper_case_label_violation(self):
        src = wrap(
            NMOS_M1
            + "\n"
            + CURRENT_SOURCE_APPROVED.replace(r"$g_{\mathrm{m1}} v_{in}$", r"$I_{REF}$")
        )
        self.assertIn("small-signal-label", rules(src))

    def test_voltage_source_upper_case_violation(self):
        src = wrap(NMOS_M1 + "\n" + VOLTAGE_SOURCE.replace(r"$v_x$", r"$V_X$"))
        self.assertIn("small-signal-label", rules(src))

    def test_current_arrow_upper_case_violation(self):
        src = wrap(NMOS_M1 + "\n" + CURRENT_ARROW.replace(r"$i_X$", r"$I_X$"))
        self.assertIn("small-signal-label", rules(src))

    def test_lower_case_labels_ok(self):
        self.assertNotIn("small-signal-label", rules(VALID_CASCADE))

    def test_mos_label_exempt(self):
        # MOS 的 $M_1$ 不受小信号规则限制
        src = wrap(NMOS_M1)
        self.assertNotIn("small-signal-label", rules(src))

    def test_error_severity(self):
        src = wrap(
            CURRENT_SOURCE_APPROVED.replace(r"$g_{\mathrm{m1}} v_{in}$", r"$I_{REF}$")
        )
        hits = [v for v in validate_drawing(src) if v.rule == "small-signal-label"]
        self.assertTrue(hits)
        self.assertEqual(hits[0].severity, "error")


class VerticalResistorAndWhitelistTest(unittest.TestCase):
    """方案 A：垂直电阻合法化（进入特征库，wire-lock 生效）；
    元件白名单：未定义元件（非标准箭头等）必须报 undefined-component。"""

    def test_vertical_resistor_recognized(self):
        # 垂直电阻被识别为 Resistor → wire-lock 规则对它生效
        src = wrap(self.vertical_without_lock())
        self.assertIn("wire-lock", rules(src))

    def test_vertical_resistor_with_lock_ok(self):
        src = wrap(
            NMOS_M1
            + "\n"
            + """\
  \\begin{scope}[shift={(node_M1_d)}, yshift=-0.5cm]
    \\draw[thick] (0,0) |- (node_M1_d);
    \\draw[thick, line cap=round] (0,0) -- (0,-0.4) -- (0.15,-0.48) -- (-0.15,-0.64) -- (0.15,-0.8) -- (-0.15,-0.96) -- (0.15,-1.12) -- (-0.15,-1.28) -- (0,-1.36) -- (0,-2.0);
    \\node[right=0.15cm] at (0.15, -1.0) {\\normalsize $R_x$};
  \\end{scope}"""
        )
        self.assertNotIn("wire-lock", rules(src))
        self.assertNotIn("undefined-component", rules(src))

    def test_current_source_is_undefined_component(self):
        src = wrap(NMOS_M1 + "\n" + CURRENT_SOURCE)
        self.assertIn("undefined-component", rules(src))

    def test_mos_arrow_not_undefined(self):
        self.assertNotIn("undefined-component", rules(VALID_CASCADE))

    def test_canonical_vertical_resistor_recognized(self):
        # 规范纵向款（水平款坐标转置）：无进线锁定 → 被识别为 Resistor 才会报
        # wire-lock（证明识别生效）
        src = wrap(
            NMOS_M1
            + "\n"
            + """\
  \\begin{scope}[shift={(M1_d)}, yshift=0.5cm]
    \\draw[thick, line cap=round] (0,0) -- (0,0.155) -- (0.15,0.1875) -- (-0.15,0.2525) -- (0.15,0.3175) -- (-0.15,0.3825) -- (0.15,0.4525) -- (-0.15,0.5125) -- (0,0.545) -- (0,0.7);
  \\end{scope}"""
        )
        self.assertIn("wire-lock", rules(src))

    def test_rO2_variant_recognized(self):
        # 画布实际出现的 rO2 变体 (0.15,0.28)：纵向锯齿家族，必须识别为 Resistor
        src = wrap(
            NMOS_M1
            + "\n"
            + """\
  \\begin{scope}[shift={(M1_d)}, yshift=0.5cm]
    \\draw[thick, line cap=round] (0,0) -- (0,0.2) -- (0.15,0.28) -- (-0.15,0.44) -- (0.15,0.60) -- (-0.15,0.76) -- (0.15,0.92) -- (-0.15,1.08) -- (0,1.16) -- (0,1.4);
  \\end{scope}"""
        )
        self.assertIn("wire-lock", rules(src))

    def test_expression_port_reference_satisfies_wire_lock(self):
        # 并联支路端口用 (0,0 -| 父锚点) 表达式锁定——-| 里的父锚点引用必须算进
        # wire-lock（x 跟随模块、y 锁定总线的画法）
        src = wrap(
            NMOS_M1
            + "\n"
            + """\
  \\begin{scope}[shift={(M1_d)}, yshift=-1.0cm]
    \\coordinate (R1_top) at (0,0 -| M1_d);
    \\coordinate (R1_bottom) at (0,0 -| M1_s);
    \\draw[thick, line cap=round] (0,0) -- (0.155,0) -- (0.1875,0.15) -- (0.7,0);
    \\draw[thick] (0,0) -- (R1_top);
    \\draw[thick] (0.7,0) -- (R1_bottom);
  \\end{scope}"""
        )
        self.assertNotIn("wire-lock", rules(src))
        self.assertNotIn("anchor-resolution", rules(src))

    def vertical_without_lock(self):
        return VERTICAL_RESISTOR.replace(
            "    \\draw[thick] (0,0) |- (node_X_c);",
            "    \\draw[thick] (0,0) -- (0,-0.4); % no parent ref",
        )


class AnchorResolutionTest(unittest.TestCase):
    def test_undefined_anchor_error(self):
        src = wrap(
            "  \\begin{scope}[shift={(0,0)}]\n"
            "    \\coordinate (M1_d) at (0, 0.5);\n"
            "  \\end{scope}\n"
            "  \\draw[thick] (M1_d) -- (NOPE_d);\n"
        )
        self.assertIn("anchor-resolution", rules(src))

    def test_all_anchors_defined_ok(self):
        self.assertNotIn("anchor-resolution", rules(VALID_CASCADE))


class NodeCompletenessTest(unittest.TestCase):
    def test_junction_scope_without_circle_warning(self):
        src = wrap(
            "  \\begin{scope}[shift={(0,0)}]\n"
            "    \\coordinate (node_X_c) at (0,0);\n"
            "    \\coordinate (node_X_branch_L) at (-1.5cm, 0);\n"
            "    \\draw[thick] (0,0) -- (node_X_branch_L);\n"
            "  \\end{scope}\n"
        )
        self.assertIn("node-completeness", rules(src))

    def test_junction_scope_with_circle_ok(self):
        self.assertNotIn("node-completeness", rules(VALID_CASCADE))


# 进线锁定：真实画布中的 "Local incoming wire" 模式（纯局部坐标，不引用父锚点）
LOCAL_WIRE_M3 = """\
  \\begin{scope}[shift={(M1_d)}, yshift=1.0cm]
    \\coordinate (M3_g) at (-0.73, 0);
    \\coordinate (M3_d) at (0, 0.5);
    \\coordinate (M3_s) at (0, -0.5);
    \\draw[thick] (0, -0.5) -- (0, -1.0); % Local incoming wire
    \\draw[thick] (-0.73,0) -- (-0.47,0);
    \\draw[-{Triangle[length=1.6mm, width=1.1mm, sep=-1.2pt]}, thick, line cap=round] (-0.33,-0.2) -- (-0.03,-0.2);
    \\node[right=0.08cm] at (0, 0) {\\normalsize $M_3$};
  \\end{scope}"""

# 重合式：无进线（注释 "No incoming wire needed"），靠端口与父锚点坐标重合
NO_WIRE_M9 = """\
  \\begin{scope}[shift={(node_Jtail_c)}, yshift=-0.5cm]
    \\coordinate (M9_g) at (-0.73, 0);
    \\coordinate (M9_d) at (0, 0.5);
    \\coordinate (M9_s) at (0, -0.5);
    \\draw[thick] (-0.73,0) -- (-0.47,0);
    \\draw[-{Triangle[length=1.6mm, width=1.1mm, sep=-1.2pt]}, thick, line cap=round] (-0.33,-0.2) -- (-0.03,-0.2);
    \\node[right=0.08cm] at (0, 0) {\\normalsize $M_9$};
  \\end{scope}"""


class WireLockTest(unittest.TestCase):
    """进线归己法则：非根元件 scope 的进线必须按名引用父级锚点，
    否则拖拽时导线端与父级输出端断连。"""

    def test_local_coordinate_incoming_wire_error(self):
        # 当前画布的 "Local incoming wire" 模式：纯局部坐标 → 必须报违规
        src = wrap(NMOS_M1 + "\n" + LOCAL_WIRE_M3)
        self.assertIn("wire-lock", rules(src))

    def test_no_incoming_wire_error(self):
        # "No incoming wire needed" 重合式：无任何外部锚点引用 → 必须报违规
        src = wrap(NMOS_M1 + "\n" + NO_WIRE_M9)
        self.assertIn("wire-lock", rules(src))

    def test_canonical_locked_incoming_wire_ok(self):
        # skill 正版：\draw (0, -0.5) |- (M1_d) 按名引用父锚点 → 合规
        self.assertNotIn("wire-lock", rules(VALID_CASCADE))

    def test_root_component_exempt(self):
        # 根 MOS（shift={(0,0)}）无父级，不要求进线
        src = wrap(NMOS_M1)
        self.assertNotIn("wire-lock", rules(src))

    def test_wide_vdd_rail_still_flagged(self):
        # 真实画布的宽轨 VDD（(-4.5,0)--(4.5,0)）也必须被识别为 VDD 并检查进线
        src = wrap(
            NMOS_M1
            + "\n"
            + """\
  \\begin{scope}[shift={(M1_d)}, yshift=1.0cm]
    \\coordinate (node_VDDmain_branch_D) at (0,0);
    \\draw[thick] (0,0) -- (0, -0.5); % Local incoming wire
    \\draw[ultra thick] (-4.5, 0) -- (4.5, 0);
    \\node[right=0.1cm] at (4.5, 0) {\\normalsize $V_{\\mathrm{DD}}$};
  \\end{scope}"""
        )
        self.assertIn("wire-lock", rules(src))


class AggregateTest(unittest.TestCase):
    def test_fully_valid_cascade_zero_violations(self):
        self.assertEqual(validate_drawing(VALID_CASCADE), [])

    def test_violations_have_message_and_location(self):
        src = wrap(
            "  \\coordinate (X) at (5,2);\n"
            "  \\draw[thick] (0,0) -- (1,1);\n"
        )
        vs = validate_drawing(src)
        self.assertTrue(all(v.message for v in vs))
        self.assertTrue(all(v.location is not None for v in vs))
        loc = {v.location for v in vs}
        self.assertIn(2, loc)  # 违规在第 2 行（tikzpicture 首行之后）

    def test_errors_and_warnings_severity(self):
        src = wrap(
            "  \\begin{scope}[shift={(0,0)}]\n"
            "    \\coordinate (foo) at (0, 0);\n"
            "    \\draw[thick] (0,0) -- (0.155,0) -- (0.1875,0.15) -- (0.7,0);\n"
            "    \\draw[ultra thick] (0.1, -0.25) -- (0.1, 0.25);\n"
            "  \\end{scope}\n"
        )
        err = errors(src)
        warn = warnings(src)
        self.assertTrue(any(v.rule == "scope-isolation" for v in err))
        self.assertTrue(any(v.rule == "anchor-naming" for v in warn))


if __name__ == "__main__":
    unittest.main()
