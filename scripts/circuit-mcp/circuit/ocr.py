"""Optional OCR assist for circuit images.

The vision-capable model (Claude) does the actual component detection from the
image. This module only extracts text labels (e.g. ``R1``, ``M2``, ``Vdd``)
from the image via RapidOCR, so the model can align detected components with
their printed labels. All failures are graceful: the server never depends on
this module being importable or on the image being readable.
"""

from __future__ import annotations

import os
from typing import Any

_engine = None


def _get_engine():
    """Lazily import RapidOCR (new package layout, then legacy)."""
    global _engine
    if _engine is not None:
        return _engine
    try:
        from rapidocr import RapidOCR  # new layout (rapidocr >= 2.x)
    except ImportError:
        try:
            from rapidocr_onnxruntime import RapidOCR  # legacy
        except ImportError:
            return None
    _engine = RapidOCR()
    return _engine


def extract_labels(image_path: str) -> dict[str, Any]:
    """Run OCR on the image; return the recognized text lines with boxes.

    Returns a dict with keys ``ocr_lines`` (list of {text, box, conf}),
    ``image_path`` and ``note`` explaining how to combine this with the model's
    own visual analysis.
    """
    if not os.path.exists(image_path):
        return {
            "ok": False,
            "error": f"图片不存在：{image_path}",
            "ocr_lines": [],
        }
    engine = _get_engine()
    if engine is None:
        return {
            "ok": False,
            "error": (
                "RapidOCR 未安装，无法提取图片中的文字标签。"
                "可运行：pip install rapidocr；或仅依赖视觉模型直接识别器件。"
            ),
            "ocr_lines": [],
        }
    try:
        result, _ = engine(image_path)
    except Exception as e:  # noqa: BLE001 - report any OCR failure gracefully
        return {
            "ok": False,
            "error": f"OCR 失败：{e}",
            "ocr_lines": [],
        }

    lines = []
    if result:
        # rapidocr result rows: [box(4 points), text, score]
        for row in result:
            box, text, score = row[0], row[1], row[2]
            if not isinstance(text, str) or not text.strip():
                continue
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            lines.append(
                {
                    "text": text.strip(),
                    "box": box,
                    "center": [round((min(xs) + max(xs)) / 2, 1), round((min(ys) + max(ys)) / 2, 1)],
                    "confidence": round(float(score), 3) if score is not None else None,
                }
            )
    return {
        "ok": True,
        "image_path": image_path,
        "ocr_lines": lines,
        "note": (
            "这些是图片中识别出的文字标签及其像素中心。用它来核对器件标注："
            "例如 OCR 出现 'R1' 且你视觉上在某个位置看到电阻，就把该组件 id 设为 R1。"
            "器件类型、位置和连接关系以你的视觉分析为准。"
        ),
    }
