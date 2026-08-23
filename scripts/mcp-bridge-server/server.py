"""Antigravity MCP Bridge Server with TikZ validation gate.

Websocket (ws://localhost:3100) bridge between the web editor's Assistant panel
and the google.antigravity Agent. The agent's returned TikZ is validated
against the MOS-circuit structural rules (circuit-mcp validator) BEFORE it is
streamed to the client: error-level violations are fed back to the agent for
up to MAX_ROUNDS fix rounds, so the client only ever receives a compliant
drawing. This is a protocol-level gate — it does not depend on model discipline.
"""

import asyncio
import json
import os
import re
import sys

import websockets
from google.antigravity import Agent, LocalAgentConfig

# 复用 circuit-mcp 的范式校验器（相对级联 TikZ）
sys.path.insert(
    0,
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "circuit-mcp"),
)
from circuit.validator import COMPONENT_MARKER_RE, validate_drawing  # noqa: E402

MAX_ROUNDS = 3
TIKZ_BLOCK_RE = re.compile(r"```tikz\s*\n(.*?)\n\s*```", re.DOTALL)

TIKZ_SYSTEM_PROMPT = """
You are a TikZ diagram editing assistant, integrated directly into the user's TikZ Editor.

Your goal is to help the user create, modify, and fix TikZ diagrams.
You will be provided with the current TikZ source code, and potentially a base64 encoded snapshot of the canvas, diagnostic errors, and context about other figures in the document.

CRITICAL INSTRUCTIONS:
1. When the user asks you to modify the code, you MUST return the COMPLETE updated TikZ source code.
2. The code you return MUST be wrapped in exactly ONE markdown code block starting with ```tikz and ending with ```.
3. Do not just return the snippet that changed; return the FULL document or the FULL figure.
4. Keep the original formatting and comments as much as possible unless you are explicitly asked to refactor.
5. If there are syntax errors provided in the diagnostics, try to fix them.
6. Your output is automatically validated against the MOS-circuit structural rules (each of the 8 core circuit components in its own \\begin{scope} block, no global \\coordinate, \\normalsize labels, no \\pgfgetlastxy, opacity=0.01 not 0, orthogonal |- / -| chords, every referenced anchor defined). If validation fails, the violation list will be returned to you — you MUST fix all error-level violations and return the complete code again. Do not submit code you know violates these rules.
"""


def extract_tikz(text: str) -> str | None:
    """取最后一个 ```tikz 代码块的内容。"""
    blocks = list(TIKZ_BLOCK_RE.finditer(text))
    if not blocks:
        return None
    return blocks[-1].group(1).strip("\n")


def _is_circuit(tikz: str) -> bool:
    """是否包含 8 大核心元件特征（电路图才执行完整范式校验）。"""
    return any(
        any(p.search(tikz) for p in pats) for pats in COMPONENT_MARKER_RE.values()
    )


def blocking_violations(tikz: str) -> list:
    """返回必须修复的违规（error 级）。

    非电路图（无元件特征，如流程图）只拦会挂前端解析器的规则
    （动态宏 / 未定义锚点），避免误伤普通图形。
    """
    vs = validate_drawing(tikz)
    if _is_circuit(tikz):
        return [v for v in vs if v.severity == "error"]
    return [
        v
        for v in vs
        if v.severity == "error" and v.rule in ("anchor-resolution", "dynamic-pgf")
    ]


def feedback_text(violations: list, limit: int = 8) -> str:
    lines = []
    for v in violations[:limit]:
        loc = f"第 {v.location} 行" if v.location else "位置未知"
        lines.append(f"- [{v.rule}] {loc}：{v.message}")
    if len(violations) > limit:
        lines.append(f"- …… 另有 {len(violations) - limit} 条违规")
    return "\n".join(lines)


async def handle_client(websocket):
    print("[Server] Client connected")
    try:
        async for message in websocket:
            data = json.loads(message)
            if data.get("type") == "start-turn":
                payload = data.get("payload", {})
                prompt = payload.get("prompt", "")
                context = payload.get("context", {})

                source = context.get("source", "")
                diagnostics = context.get("diagnosticsText", "")

                full_prompt = f"User Request: {prompt}\n\nCurrent TikZ Source:\n```tikz\n{source}\n```\n"
                if diagnostics:
                    full_prompt += f"\nDiagnostics:\n{diagnostics}\n"

                print(f"[Server] Starting Antigravity Agent for request: {prompt}")

                config = LocalAgentConfig(system_instructions=TIKZ_SYSTEM_PROMPT)

                try:
                    async with Agent(config) as agent:
                        final_text: str | None = None
                        last_feedback = ""
                        current_prompt = full_prompt

                        for rnd in range(1, MAX_ROUNDS + 1):
                            response = await agent.chat(current_prompt)

                            # 消费 thoughts（原协议保留）
                            async for thought in response.thoughts:
                                pass

                            text = ""
                            async for token in response:
                                text += token

                            tikz = extract_tikz(text)
                            if tikz is None:
                                last_feedback = (
                                    "你的回答没有包含 ```tikz 代码块。"
                                    "必须返回完整 TikZ，且只包裹在一个 ```tikz ... ``` 代码块内。"
                                )
                            else:
                                violations = blocking_violations(tikz)
                                if not violations:
                                    final_text = text
                                    print(f"[Server] Round {rnd} passed validation")
                                    break
                                last_feedback = feedback_text(violations)
                                print(
                                    f"[Server] Round {rnd} failed validation: "
                                    f"{last_feedback[:120]}..."
                                )

                            current_prompt = (
                                full_prompt
                                + "\n\n你上一轮的输出未通过结构校验。"
                                "请修复全部 error 级违规后重新输出完整 TikZ：\n"
                                + last_feedback
                            )

                        if final_text is None:
                            await websocket.send(
                                json.dumps(
                                    {
                                        "type": "turn-status",
                                        "status": "failed",
                                        "error": (
                                            f"输出连续 {MAX_ROUNDS} 轮未通过结构校验，已停止。"
                                            f"最后的问题：\n{last_feedback}"
                                        ),
                                    }
                                )
                            )
                            continue

                        # 流式转发最终（已过校验的）结果
                        for i in range(0, len(final_text), 250):
                            await websocket.send(
                                json.dumps(
                                    {"type": "delta", "content": final_text[i : i + 250]}
                                )
                            )
                        await websocket.send(
                            json.dumps({"type": "turn-status", "status": "completed"})
                        )
                        print("[Server] Turn completed")

                except Exception as e:
                    print(f"[Server] Agent Error: {e}")
                    await websocket.send(
                        json.dumps(
                            {"type": "turn-status", "status": "failed", "error": str(e)}
                        )
                    )

    except websockets.exceptions.ConnectionClosed:
        print("[Server] Client disconnected")


async def main():
    server = await websockets.serve(handle_client, "localhost", 3100)
    print("Antigravity MCP Bridge Server running on ws://localhost:3100")
    await server.wait_closed()


if __name__ == "__main__":
    asyncio.run(main())
