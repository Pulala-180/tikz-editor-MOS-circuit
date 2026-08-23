"""pdflatex 渲染桥：把 tikzpicture 源码编译成 PNG（render_preview 的后端）。

把同步文件里的源码包装进 standalone 文档 → 临时目录隔离编译（pdflatex）
→ pdftoppm 转 PNG → 返回 PNG 路径；编译失败时解析 .log 返回错误行号。

环境变量可覆盖工具路径：TIKZ_PDFLATEX / TIKZ_PDFTOPPM。
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile

# arrows.meta：元件库的 Triangle 箭头需要；positioning：电流源/元件库标签的
# right=0.15cm 等方位语法需要；amsmath/amssymb：$M_1$、\mathbf 等标注
PREAMBLE = (
    "\\documentclass[tikz,border=1cm]{standalone}\n"
    "\\usepackage{amsmath}\n"
    "\\usepackage{amssymb}\n"
    "\\usetikzlibrary{arrows.meta}\n"
    "\\usetikzlibrary{positioning}\n"
    "\\begin{document}\n"
)
POSTAMBLE = "\n\\end{document}\n"

_TL_CANDIDATES = [
    r"D:\TeXlive\texlive\2025\bin\windows",
    r"C:\texlive\2025\bin\windows",
    r"C:\Program Files\MiKTeX\miktex\bin\x64",
]

ERROR_LINE_RE = re.compile(r"^l\.(\d+)")


def _tool_path(p: str) -> str:
    """Windows 下子进程参数用正斜杠（pdflatex/pdftoppm 对反斜杠路径处理不可靠）。"""
    return p.replace("\\", "/") if os.name == "nt" else p


def _find_exe(name: str, env_var: str) -> str | None:
    exe = os.environ.get(env_var)
    if exe and os.path.isfile(exe):
        return exe
    found = shutil.which(name)
    if found:
        return found
    for d in _TL_CANDIDATES:
        p = os.path.join(d, name + ".exe")
        if os.path.isfile(p):
            return p
    return None


def _parse_log(log_text: str) -> list[dict]:
    """从 pdflatex 日志提取错误：'! message' + 后续 'l.N' 行号。"""
    errors: list[dict] = []
    current: dict | None = None
    for ln in log_text.splitlines():
        if ln.startswith("!"):
            current = {"message": ln[1:].strip(), "line": None}
        else:
            m = ERROR_LINE_RE.match(ln.strip())
            if m and current is not None:
                current["line"] = int(m.group(1))
                errors.append(current)
                current = None
    return errors


def render_tikz_to_png(source: str, out_dir: str | None = None) -> dict:
    """编译 TikZ 源码为 PNG。

    返回 {"ok": True, "png": <绝对路径>, "log": []}；
    失败时 {"ok": False, "error": <中文说明>, "line": <行号|None>, "log": [...]}。
    """
    pdflatex = _find_exe("pdflatex", "TIKZ_PDFLATEX")
    if not pdflatex:
        return {
            "ok": False,
            "error": "未找到 pdflatex（请安装 TeX Live，或设置 TIKZ_PDFLATEX 环境变量）",
            "log": [],
        }
    work = out_dir or tempfile.mkdtemp(prefix="tikz-render-")
    os.makedirs(work, exist_ok=True)

    # 空白源码按空画布处理（等价 reset_circuit 的空 tikzpicture）——
    # 完全无 tikzpicture 时页面尺寸为 0，pdftoppm 拒绝渲染
    if not source or not source.strip():
        source = "\\begin{tikzpicture}\n\\end{tikzpicture}\n"

    doc = PREAMBLE + source + POSTAMBLE
    tex_path = os.path.join(work, "drawing.tex")
    with open(tex_path, "w", encoding="utf-8") as f:
        f.write(doc)

    try:
        subprocess.run(
            [
                pdflatex,
                "-interaction=nonstopmode",
                "-halt-on-error",
                "-output-directory",
                _tool_path(work),
                _tool_path(tex_path),
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
    except (subprocess.TimeoutExpired, OSError) as e:
        return {"ok": False, "error": f"pdflatex 执行失败：{e}", "log": []}

    pdf_path = os.path.join(work, "drawing.pdf")
    if not os.path.isfile(pdf_path):
        log_path = os.path.join(work, "drawing.log")
        log_text = ""
        if os.path.isfile(log_path):
            with open(log_path, encoding="utf-8", errors="replace") as f:
                log_text = f.read()
        errors = _parse_log(log_text)
        if errors:
            e0 = errors[0]
            line = e0["line"]
            where = f"（第 {line} 行）" if line else ""
            return {
                "ok": False,
                "error": f"编译失败{where}：{e0['message']}",
                "line": line,
                "log": [e["message"] for e in errors[:10]],
            }
        return {
            "ok": False,
            "error": "编译失败，未产生 PDF",
            "log": log_text.splitlines()[-20:],
        }

    pdftoppm = _find_exe("pdftoppm", "TIKZ_PDFTOPPM")
    if not pdftoppm:
        return {"ok": False, "error": "未找到 pdftoppm（Poppler）", "log": []}
    png_base = os.path.join(work, "drawing")
    try:
        subprocess.run(
            [
                pdftoppm,
                "-png",
                "-r",
                "150",
                _tool_path(pdf_path),
                _tool_path(png_base),
            ],
            capture_output=True,
            timeout=60,
        )
    except (subprocess.TimeoutExpired, OSError) as e:
        return {"ok": False, "error": f"pdftoppm 执行失败：{e}", "log": []}

    png_path = png_base + "-1.png"  # pdftoppm 默认输出 drawing-1.png
    if not os.path.isfile(png_path):
        alt = png_base + ".png"
        if os.path.isfile(alt):
            png_path = alt
    if not os.path.isfile(png_path):
        return {
            "ok": False,
            "error": "PDF 已生成但 pdftoppm 未产出 PNG",
            "log": [],
        }
    return {"ok": True, "png": png_path, "log": []}
