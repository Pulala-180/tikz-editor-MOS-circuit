"""Antigravity MCP Bridge Server for TikZ Editor Assistant Panel.

Websocket (ws://localhost:3100) bridge between the web editor's Assistant panel
and the native Antigravity CLI (D:\\Antigravity\\cli\\bin\\antigravity-cli.exe).
"""

import asyncio
import json
import os
import re
import sys
from typing import Dict, Optional
import websockets

# Add circuit-mcp to sys.path
sys.path.insert(
    0,
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "circuit-mcp"),
)
try:
    from circuit.validator import validate_drawing
except ImportError:
    validate_drawing = None

ANTIGRAVITY_CLI = r"D:\Antigravity\cli\bin\antigravity-cli.exe"

TIKZ_BLOCK_RE = re.compile(r"```(?:tikz|latex)?\s*\n(.*?)\n\s*```", re.DOTALL)

AVAILABLE_MODELS = [
    {"id": "auto", "label": "Antigravity 自动优选 (极速秒回 2~3s · 推荐)"},
    {"id": "gemini-3.8-flash-low", "label": "Gemini 3.8 Flash (极速秒回 2~3s)"},
    {"id": "gemini-3.8-flash-medium", "label": "Gemini 3.8 Flash (均衡平衡)"},
    {"id": "gemini-3.8-flash-high", "label": "Gemini 3.8 Flash (深度推理)"},
    {"id": "gemini-3.1-pro-high", "label": "Gemini 3.1 Pro (大模型深度推理)"},
    {"id": "claude-sonnet-4-6", "label": "Claude Sonnet 4.6 (Thinking)"},
    {"id": "gpt-oss-120b-medium", "label": "GPT-OSS 120B"},
]

TIKZ_SYSTEM_PROMPT = """你是一个直接嵌入在 TikZ Editor 中的专业绘图与交互 AI 助手（Antigravity）。
你的核心任务是协助用户解答问题、创建、修改和完善各类 TikZ 电路图与矢量插图。

关键原则与极速直出规范：
1. 【禁止调用任何外部工具】：严禁调用任何外部文件读取、搜索或 MCP 工具，请立即在当前回复中直接以文字或代码形式输出完整结果！
2. 当用户要求绘制、修改或修复图形时，你必须输出完整可编译的 TikZ 代码。
3. TikZ 代码必须包裹在且仅包裹在单个 ```tikz ... ``` 代码块中，编辑器会自动提取并实时渲染到画布上。
4. 如果是电路图，严格遵循 MOS-circuit 规范：
   - 核心元件各自处于独立的 \\begin{scope} 中；
   - 导线与元件端口精确对齐，连接线使用正交路由 (|- 或 -|)；
   - 标注使用 \\normalsize。
5. 请使用简洁、专业、礼貌的中文直接向用户解释你的设计与修改。
"""

active_tasks: Dict[any, asyncio.Task] = {}
active_procs: Dict[any, asyncio.subprocess.Process] = {}

LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "server_activity.log")

def log_event(msg: str):
    import datetime
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}\n"
    print(line, end="", flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception:
        pass

def extract_tikz(text: str) -> Optional[str]:
    blocks = list(TIKZ_BLOCK_RE.finditer(text))
    if not blocks:
        return None
    return blocks[-1].group(1).strip("\n")

async def safe_send(websocket, data: dict):
    try:
        await websocket.send(json.dumps(data))
    except Exception:
        pass

async def execute_turn(websocket, payload: dict):
    prompt = payload.get("prompt", "")
    model = payload.get("model", "")
    context = payload.get("context", {})
    source = context.get("source", "")
    diagnostics = context.get("diagnosticsText", "")

    log_event(f"[Server] 收到请求 (Model: {model or 'default'}): {prompt}")

    await safe_send(websocket, {
        "type": "turn-status",
        "status": "inProgress"
    })
    log_event("[Server] 已发送 turn-status: inProgress")

    full_prompt = (
        f"【极速直出指令：立即直接作答或生成TikZ代码，严禁调用任何外部读取文件工具或MCP工具】\n\n"
        f"{TIKZ_SYSTEM_PROMPT}\n\n"
        f"用户需求: {prompt}\n\n"
    )
    if source:
        full_prompt += f"当前画布 TikZ 源码:\n```tikz\n{source}\n```\n\n"
    if diagnostics:
        full_prompt += f"当前画布诊断信息:\n{diagnostics}\n\n"

    valid_model_ids = {m["id"] for m in AVAILABLE_MODELS if m["id"] != "auto"}
    selected_model = model if (model and model in valid_model_ids) else "gemini-3.8-flash-low"
    log_event(f"[Server] 选用底层推理引擎模型: {selected_model}")

    cmd = [
        ANTIGRAVITY_CLI,
        "--disable-slash-commands",
        "--dangerously-skip-permissions",
        "--output-format", "stream-json",
        "--model", selected_model,
        "--print", full_prompt
    ]

    if not os.path.exists(ANTIGRAVITY_CLI):
        err = f"未找到 Antigravity CLI 引擎: {ANTIGRAVITY_CLI}"
        log_event(f"[Server] 错误: {err}")
        await safe_send(websocket, {"type": "error", "message": err})
        await safe_send(websocket, {
            "type": "delta",
            "deltaType": "item/agentMessage/delta",
            "content": f"⚠️ {err}"
        })
        await safe_send(websocket, {
            "type": "turn-status",
            "status": "failed",
            "error": err
        })
        return

    try:
        log_event("[Server] 正在调用 Antigravity CLI 执行实时流式推理...")
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        active_procs[websocket] = proc

        out = ""
        while True:
            line_bytes = await proc.stdout.readline()
            if not line_bytes:
                break
            line_text = line_bytes.decode("utf-8", errors="replace").strip()
            if not line_text:
                continue
            try:
                msg = json.loads(line_text)
                evt = msg.get("event")
                if evt == "step_update":
                    su = msg.get("step_update", {})
                    delta = su.get("text_delta")
                    if delta:
                        out += delta
                        await safe_send(websocket, {
                            "type": "delta",
                            "deltaType": "item/agentMessage/delta",
                            "content": delta
                        })
                elif evt == "result":
                    res = msg.get("result", {})
                    resp = res.get("response")
                    if resp and not out:
                        out = resp
                        await safe_send(websocket, {
                            "type": "delta",
                            "deltaType": "item/agentMessage/delta",
                            "content": out
                        })
            except Exception:
                pass

        _, stderr = await proc.communicate()
        err = stderr.decode("utf-8", errors="replace").strip() if stderr else ""
        log_event(f"[Server] Antigravity CLI 推理完成 (累计输出: {len(out)} 字符, stderr: {len(err)} 字符)")
        if err:
            log_event(f"[Server] Antigravity CLI stderr 详情: {err[:500]}")

        if not out and err:
            out = f"⚠️ Antigravity 返回异常: {err}"
            await safe_send(websocket, {
                "type": "delta",
                "deltaType": "item/agentMessage/delta",
                "content": out
            })
        elif not out:
            out = "Antigravity 已收到消息。"
            await safe_send(websocket, {
                "type": "delta",
                "deltaType": "item/agentMessage/delta",
                "content": out
            })

        # 3. 检查是否有生成的 TikZ 代码，如有则触发画板热重载
        tikz_code = extract_tikz(out)
        if tikz_code:
            if validate_drawing:
                try:
                    violations = validate_drawing(tikz_code)
                    if violations:
                        log_event(f"[Server] 电路规则校验提示: 发现 {len(violations)} 项规则注意点")
                except Exception as ve:
                    log_event(f"[Server] 校验引擎提示: {ve}")

            log_event("[Server] 检测到生成的 TikZ 代码，正在推送到画布...")
            await safe_send(websocket, {
                "type": "source-updated",
                "source": tikz_code
            })

        await safe_send(websocket, {
            "type": "turn-status",
            "status": "completed"
        })
        log_event("[Server] 回合完成并已通知前端")
    except asyncio.CancelledError:
        log_event("[Server] 回合被中断")
        await safe_send(websocket, {
            "type": "turn-status",
            "status": "interrupted"
        })
    except Exception as e:
        log_event(f"[Server] 执行异常: {e}")
        await safe_send(websocket, {
            "type": "error",
            "message": str(e)
        })
        await safe_send(websocket, {
            "type": "turn-status",
            "status": "failed",
            "error": str(e)
        })
    finally:
        active_procs.pop(websocket, None)
        active_tasks.pop(websocket, None)

async def handle_client(websocket):
    client_addr = getattr(websocket, 'remote_address', 'client')
    log_event(f"[Server] 客户端已建立连接: {client_addr}")
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
            except Exception:
                continue

            msg_type = data.get("type")
            log_event(f"[Server] 收到客户端消息类型: {msg_type}")

            if msg_type == "get-models":
                log_event("[Server] 响应模型列表查询")
                await websocket.send(json.dumps({
                    "type": "models",
                    "models": AVAILABLE_MODELS
                }))

            elif msg_type == "interrupt":
                log_event("[Server] 收到中断请求")
                if websocket in active_procs:
                    proc = active_procs[websocket]
                    try:
                        proc.terminate()
                    except Exception:
                        pass
                if websocket in active_tasks:
                    task = active_tasks[websocket]
                    task.cancel()
                await websocket.send(json.dumps({
                    "type": "turn-status",
                    "status": "interrupted"
                }))

            elif msg_type == "start-turn":
                payload = data.get("payload", {})
                # If there's an ongoing task for this socket, cancel it first
                if websocket in active_tasks and not active_tasks[websocket].done():
                    active_tasks[websocket].cancel()
                
                task = asyncio.create_task(execute_turn(websocket, payload))
                active_tasks[websocket] = task

    except websockets.exceptions.ConnectionClosed:
        log_event(f"[Server] 客户端断开连接: {client_addr}")
    except Exception as e:
        log_event(f"[Server] 客户端处理异常: {e}")
    finally:
        if websocket in active_procs:
            try:
                active_procs[websocket].terminate()
            except Exception:
                pass
            active_procs.pop(websocket, None)
        if websocket in active_tasks:
            active_tasks[websocket].cancel()
            active_tasks.pop(websocket, None)

async def main():
    while True:
        try:
            async with websockets.serve(handle_client, "0.0.0.0", 3100):
                print("Antigravity MCP Bridge Server running on ws://localhost:3100")
                await asyncio.Future()
        except asyncio.CancelledError:
            break
        except Exception as e:
            log_event(f"[Server] 监听服务异常，1秒后自动恢复: {e}")
            await asyncio.sleep(1)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
