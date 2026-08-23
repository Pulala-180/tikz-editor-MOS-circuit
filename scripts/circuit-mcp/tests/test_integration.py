"""Integration test: spawn the real server over stdio and exercise the MCP protocol.

Verifies: tools are listed, apply_circuit writes the sync file, invalid input
returns ok=false without corrupting the file, reset works, resources expose the
drawing.
"""

import asyncio
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

SERVER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server.py")


class MCPIntegrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.mkdtemp(prefix="circuit-mcp-test-")
        cls.sync_file = os.path.join(cls.tmpdir, "active-drawing.tex")

    def _run(self):
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.stdio import stdio_client

        params = StdioServerParameters(
            command=sys.executable,
            args=[SERVER],
            env={**os.environ, "CIRCUIT_SYNC_FILE": self.sync_file},
        )

        async def scenario():
            async with stdio_client(params) as (read, write):
                async with ClientSession(read, write) as session:
                    init = await session.initialize()
                    self.assertEqual(init.server_info.name, "circuit-editor")

                    tools = (await session.list_tools()).tools
                    names = {t.name for t in tools}
                    self.assertTrue(
                        {"apply_circuit", "list_components", "reset_circuit",
                         "get_drawing", "analyze_circuit_image",
                         "validate_drawing", "render_preview"} <= names,
                        names,
                    )

                    # --- happy path ---
                    res = await session.call_tool(
                        "apply_circuit",
                        {
                            "components": [
                                {"id": "R1", "type": "resistor", "x": 0, "y": 0, "label": "$R_D$"},
                                {"id": "M1", "type": "nmos", "x": 2.5, "y": -0.5},
                            ],
                            "wires": [
                                {"id": "w1", "from": "R1.P2", "to": "M1.G"},
                                {"id": "w2", "from": "M1.S", "to": {"x": 5.0, "y": -0.64}},
                            ],
                        },
                    )
                    payload = self._payload(res)
                    self.assertTrue(payload["ok"], payload)
                    self.assertTrue(os.path.exists(self.sync_file))
                    with open(self.sync_file, encoding="utf-8") as f:
                        written = f.read()
                    self.assertIn("\\begin{tikzpicture}", written)
                    self.assertIn("{$R_D$}", written)
                    self.assertIn("M1.G", payload["wires"][0]["to"])
                    self.assertEqual(len(payload["components"]), 2)
                    # nmos port G on screen, nmos at (2.5, -0.5): G x = 2.5 - 17/28.452756 + 0.3
                    self.assertAlmostEqual(payload["components"][1]["ports"]["G"][0],
                                           2.5 - 17 / 28.452756 + 0.3, places=2)

                    # --- invalid input: ok=false, file untouched ---
                    before = written
                    bad = await session.call_tool(
                        "apply_circuit",
                        {
                            "components": [{"id": "R1", "type": "resistor"}],
                            "wires": [{"from": "R1.P1", "to": "R1.BOGUS"}],
                        },
                    )
                    bad_payload = self._payload(bad)
                    self.assertFalse(bad_payload["ok"])
                    self.assertIn("BOGUS", bad_payload["error"])
                    with open(self.sync_file, encoding="utf-8") as f:
                        self.assertEqual(f.read(), before)

                    # --- catalog ---
                    cat = self._payload(
                        await session.call_tool("list_components", {})
                    )
                    self.assertIn("resistor", cat["components"])
                    self.assertIn("P1", cat["components"]["resistor"]["ports"])
                    self.assertIn("current_source", cat["components"])
                    self.assertEqual(
                        set(cat["components"]["current_source"]["ports"]),
                        {"top", "bottom"},
                    )

                    # --- current_source: 方向/端口/标签 ---
                    cs = self._payload(
                        await session.call_tool(
                            "apply_circuit",
                            {
                                "components": [
                                    {"id": "I1", "type": "current_source",
                                     "x": 0, "y": 0, "direction": "up",
                                     "label": "$g_{m1} v_{in}$"},
                                ],
                                "wires": [
                                    {"id": "w3", "from": "I1.top", "to": {"x": 0.0, "y": 2.0}},
                                ],
                            },
                        )
                    )
                    self.assertTrue(cs["ok"], cs)
                    self.assertIn("(0, -0.15) -- (0, 0.15)", cs["tikz"])
                    self.assertEqual(cs["components"][0]["ports"]["top"], [0.0, 0.4])
                    self.assertEqual(cs["components"][0]["direction"], "up")
                    with open(self.sync_file, encoding="utf-8") as f:
                        self.assertIn("$g_{m1} v_{in}$", f.read())

                    # --- voltage_source / current_arrow ---
                    vs = self._payload(
                        await session.call_tool(
                            "apply_circuit",
                            {
                                "components": [
                                    {"id": "V1", "type": "voltage_source",
                                     "x": 0, "y": 0, "label": "$v_x$"},
                                    {"id": "A1", "type": "current_arrow",
                                     "x": 2, "y": 0, "label": "$i_X$"},
                                ],
                                "wires": [
                                    {"id": "w4", "from": "V1.top", "to": {"x": 0.0, "y": 1.5}},
                                    {"id": "w5", "from": "A1.bottom", "to": {"x": 2.0, "y": -1.0}},
                                ],
                            },
                        )
                    )
                    self.assertTrue(vs["ok"], vs)
                    self.assertIn("rotate=90", vs["tikz"])
                    self.assertIn("Triangle[length=1.8mm, width=1.7mm]", vs["tikz"])
                    self.assertEqual(set(vs["components"][0]["ports"]), {"top", "bottom"})
                    self.assertEqual(set(vs["components"][1]["ports"]), {"bottom"})

                    # --- reset ---
                    reset = self._payload(await session.call_tool("reset_circuit", {}))
                    self.assertTrue(reset["ok"])
                    with open(self.sync_file, encoding="utf-8") as f:
                        self.assertIn("tikzpicture", f.read())

                    # --- get_drawing + resource ---
                    drawing = self._payload(await session.call_tool("get_drawing", {}))
                    self.assertTrue(drawing["exists"])
                    self.assertIn("tikzpicture", drawing["content"])

                    resources = (await session.list_resources()).resources
                    self.assertTrue(any(r.uri == "tikz://active-drawing" for r in resources))
                    read = await session.read_resource("tikz://active-drawing")
                    self.assertIn("tikzpicture", read.contents[0].text)

                    # --- validate_drawing: 空画布合规 ---
                    v = self._payload(
                        await session.call_tool("validate_drawing", {})
                    )
                    self.assertTrue(v["valid"], v)

                    # --- validate_drawing: 显式源码可发现违规 ---
                    v2 = self._payload(
                        await session.call_tool(
                            "validate_drawing",
                            {
                                "source": "\\begin{tikzpicture}\n"
                                "  \\coordinate (X) at (1,1);\n"
                                "\\end{tikzpicture}\n"
                            },
                        )
                    )
                    self.assertFalse(v2["valid"])
                    self.assertTrue(
                        any(x["rule"] == "no-global-coordinate" for x in v2["violations"])
                    )

                    # --- validate_drawing: apply_circuit 输出（Toolbar.tsx 方言）---
                    # apply_circuit 的模板与 skill 元件库是不同画法（栅在右、坐标不同），
                    # 8 大元件特征标记匹配不到 → 校验器不适用，输出不被误伤。
                    v3 = self._payload(
                        await session.call_tool(
                            "validate_drawing", {"source": payload["tikz"]}
                        )
                    )
                    self.assertTrue(v3["valid"], v3)

                    # --- render_preview: 编译出 PNG ---
                    preview = self._payload(
                        await session.call_tool("render_preview", {})
                    )
                    self.assertTrue(preview["ok"], preview)
                    self.assertTrue(os.path.isfile(preview["png"]))
                    self.assertGreater(os.path.getsize(preview["png"]), 0)

        asyncio.run(scenario())

    def _payload(self, res):
        """Extract the JSON payload from a CallToolResult."""
        if res.structured_content is not None:
            return res.structured_content
        text = res.content[0].text
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"raw": text}

    def test_end_to_end(self):
        self._run()


if __name__ == "__main__":
    unittest.main()
