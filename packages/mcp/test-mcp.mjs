import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import assert from "assert";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, "dist/index.js");

console.log("=== Testing TikZ Editor MCP Server ===");

const proc = spawn("node", [serverPath], {
  stdio: ["pipe", "pipe", "inherit"]
});

let buffer = "";
const responses = [];

proc.stdout.on("data", (chunk) => {
  buffer += chunk.toString("utf-8");
  const lines = buffer.split("\n");
  buffer = lines.pop(); // keep remainder
  for (const line of lines) {
    if (line.trim()) {
      try {
        const json = JSON.parse(line.trim());
        responses.push(json);
      } catch (e) {
        console.error("Failed to parse stdout line:", line);
      }
    }
  }
});

function send(msg) {
  proc.stdin.write(JSON.stringify(msg) + "\n");
}

async function waitForResponse(id, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = responses.find((r) => r.id === id);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timeout waiting for response to id=${id}`);
}

async function runTests() {
  try {
    // 1. Initialize
    console.log("1. Testing MCP initialize...");
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" }
      }
    });
    const initRes = await waitForResponse(1);
    assert(initRes.result, "Initialize should return result");
    assert.strictEqual(initRes.result.serverInfo.name, "tikz-editor");
    console.log("✔ Initialize OK:", initRes.result.serverInfo);

    // 2. Tools List
    console.log("2. Testing tools/list...");
    send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    });
    const toolsRes = await waitForResponse(2);
    assert(toolsRes.result?.tools?.length > 0, "Should return registered tools");
    const toolNames = toolsRes.result.tools.map((t) => t.name);
    console.log("✔ Registered Tools:", toolNames);
    assert(toolNames.includes("get_canvas_state"));
    assert(toolNames.includes("set_canvas_code"));
    assert(toolNames.includes("apply_circuit_layout"));
    assert(toolNames.includes("validate_tikz_syntax"));
    assert(toolNames.includes("export_canvas_image"));

    // 3. Call validate_tikz_syntax with valid code
    console.log("3. Testing tools/call: validate_tikz_syntax (valid code)...");
    send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "validate_tikz_syntax",
        arguments: {
          source: "\\begin{tikzpicture}\n  \\draw (0,0) -- (1,1);\n\\end{tikzpicture}"
        }
      }
    });
    const valRes = await waitForResponse(3);
    const valObj = JSON.parse(valRes.result.content[0].text);
    assert.strictEqual(valObj.valid, true, "Syntax should be valid");
    console.log("✔ Validation of valid code passed:", valObj);

    // 4. Call validate_tikz_syntax with broken code
    console.log("4. Testing tools/call: validate_tikz_syntax (broken code)...");
    send({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "validate_tikz_syntax",
        arguments: {
          source: "\\begin{tikzpicture}\n  \\draw (0,0) -- \n"
        }
      }
    });
    const valBrokenRes = await waitForResponse(4);
    const valBrokenObj = JSON.parse(valBrokenRes.result.content[0].text);
    assert(valBrokenObj.totalErrors > 0, "Should report syntax errors");
    console.log("✔ Broken syntax correctly detected:", valBrokenObj.diagnostics[0]?.message);

    // 5. Call apply_circuit_layout
    console.log("5. Testing tools/call: apply_circuit_layout (MOS CS stage)...");
    send({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "apply_circuit_layout",
        arguments: {
          components: [
            { id: "M1", type: "nmos", x: 0, y: 0, label: "$M_1$" },
            { id: "R1", type: "resistor", x: 0.05, y: 2.6, label: "$R_D$" }
          ],
          wires: [
            { from: "M1.D", to: "R1.P1", route: "straight" }
          ],
          writeToCanvas: false
        }
      }
    });
    const circuitRes = await waitForResponse(5);
    const circuitObj = JSON.parse(circuitRes.result.content[0].text);
    assert.strictEqual(circuitObj.status, "success");
    assert(circuitObj.code.includes("begin{tikzpicture}"));
    console.log("✔ Circuit generation passed! Output ports:", circuitObj.ports);

    // 6. Call export_canvas_image to SVG
    console.log("6. Testing tools/call: export_canvas_image (SVG)...");
    send({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "export_canvas_image",
        arguments: {
          format: "svg",
          source: "\\begin{tikzpicture}\n  \\draw (0,0) circle (1cm);\n\\end{tikzpicture}"
        }
      }
    });
    const svgRes = await waitForResponse(6);
    const svgText = svgRes.result.content[0].text;
    assert(svgText.includes("<svg"), "Should output SVG XML");
    console.log("✔ Export SVG passed! (SVG length: " + svgText.length + " bytes)");

    console.log("\n🎉 ALL MCP TESTS PASSED SUCCESSFULLY! 🎉\n");
    proc.kill();
    process.exit(0);
  } catch (err) {
    console.error("❌ Test Failed:", err);
    proc.kill();
    process.exit(1);
  }
}

runTests();
