"""Unit tests for the pdflatex render bridge (render_preview)."""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from circuit.render import render_tikz_to_png

VALID_SOURCE = (
    "\\begin{tikzpicture}\n"
    "  \\draw[thick] (0,0) -- (1,0);\n"
    "  \\node at (0.5,0.3) {\\normalsize $X$};\n"
    "\\end{tikzpicture}\n"
)

EMPTY_SOURCE = "\\begin{tikzpicture}\n\\end{tikzpicture}\n"

BROKEN_SOURCE = (
    "\\begin{tikzpicture}\n"
    "  \\draw[thick] (0,0) -- (1,0) -- (\\nosuchcmd);\n"
    "\\end{tikzpicture}\n"
)


class RenderTest(unittest.TestCase):
    def test_valid_circuit_renders_png(self):
        with tempfile.TemporaryDirectory() as out:
            result = render_tikz_to_png(VALID_SOURCE, out_dir=out)
            self.assertTrue(result["ok"], result)
            png = result["png"]
            self.assertTrue(os.path.isfile(png))
            self.assertGreater(os.path.getsize(png), 0)

    def test_empty_tikzpicture_renders(self):
        with tempfile.TemporaryDirectory() as out:
            result = render_tikz_to_png(EMPTY_SOURCE, out_dir=out)
            self.assertTrue(result["ok"], result)
            self.assertTrue(os.path.isfile(result["png"]))

    def test_syntax_error_returns_ok_false_with_line(self):
        with tempfile.TemporaryDirectory() as out:
            result = render_tikz_to_png(BROKEN_SOURCE, out_dir=out)
            self.assertFalse(result["ok"])
            self.assertTrue(result["error"], "错误信息不应为空")
            self.assertIsNotNone(result.get("line"), "应解析出错误行号")
            self.assertIsInstance(result.get("log"), list)

    def test_no_source_renders_empty(self):
        with tempfile.TemporaryDirectory() as out:
            result = render_tikz_to_png("", out_dir=out)
            self.assertTrue(result["ok"], result)

    def test_returns_png_path_and_log(self):
        with tempfile.TemporaryDirectory() as out:
            result = render_tikz_to_png(VALID_SOURCE, out_dir=out)
            self.assertTrue(result["png"].endswith(".png"))
            self.assertIsInstance(result["log"], list)

    def test_positioning_library_label_renders(self):
        # 电流源/元件库标签用 right=0.15cm（positioning 库语法）——preamble 必须加载
        src = (
            "\\begin{tikzpicture}\n"
            "  \\node[right=0.15cm] at (0, 0) {\\normalsize $g_{m1} v_{in}$};\n"
            "\\end{tikzpicture}\n"
        )
        with tempfile.TemporaryDirectory() as out:
            result = render_tikz_to_png(src, out_dir=out)
            self.assertTrue(result["ok"], result)


if __name__ == "__main__":
    unittest.main()
