import { z } from "zod";
import fs from "fs";
import path from "path";
import { SKETCH_DIR, listSketches, writeCanvasCode } from "../canvas-bridge.js";

export const listSketchesSchema = {
  subDir: z.string().optional().default("").describe("子目录（可选）")
};

export function handleListSketches(args: { subDir?: string }) {
  const items = listSketches(args.subDir || "");
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(items, null, 2)
      }
    ]
  };
}

export const readSketchSchema = {
  fileName: z.string().describe("草稿文件名或相对路径，如 'OTA.tex' 或 'active-drawing/active-drawing.tex'")
};

export function handleReadSketch(args: { fileName: string }) {
  const rawPath = args.fileName.replace(/^[/\\]+/, "");
  const fullPath = path.resolve(SKETCH_DIR, rawPath);

  if (!fs.existsSync(fullPath)) {
    return {
      content: [
        {
          type: "text" as const,
          text: `❌ 草稿文件不存在: ${args.fileName}`
        }
      ]
    };
  }

  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    return {
      content: [
        {
          type: "text" as const,
          text: content
        }
      ]
    };
  } catch (e: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `❌ 读取文件失败: ${e.message}`
        }
      ]
    };
  }
}

export const saveSketchSchema = {
  fileName: z.string().describe("保存的文件名（如 'my-circuit.tex'）"),
  source: z.string().describe("TikZ 源码"),
  setAsActive: z.boolean().optional().default(true).describe("是否同时设为当前活动画板")
};

export function handleSaveSketch(args: { fileName: string; source: string; setAsActive?: boolean }) {
  const safeName = args.fileName.replace(/[/\\?%*:|"<>]/g, "_");
  const finalName = safeName.endsWith(".tex") || safeName.endsWith(".tikz") ? safeName : `${safeName}.tex`;
  const destPath = path.resolve(SKETCH_DIR, finalName);

  try {
    fs.writeFileSync(destPath, args.source, "utf-8");
    let activeMsg = "";
    if (args.setAsActive) {
      writeCanvasCode(args.source);
      activeMsg = "并已同步为当前活动画板";
    }
    return {
      content: [
        {
          type: "text" as const,
          text: `✅ 草稿已成功保存至 ${finalName} ${activeMsg}`
        }
      ]
    };
  } catch (e: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `❌ 保存草稿失败: ${e.message}`
        }
      ]
    };
  }
}
