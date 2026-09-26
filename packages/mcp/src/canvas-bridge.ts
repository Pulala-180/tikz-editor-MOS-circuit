import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is 3 levels up from packages/mcp/src (or dist)
export const PROJECT_ROOT = path.resolve(__dirname, "../../..");

export const SKETCH_DIR = path.resolve(PROJECT_ROOT, "Sketch");
export const ACTIVE_SKETCH_FILE = path.resolve(SKETCH_DIR, "active-drawing/active-drawing.tex");
export const AGENT_SYNC_DIR = path.resolve(PROJECT_ROOT, "apps/web/agent-sync");
export const ACTIVE_WEB_FILE = path.resolve(AGENT_SYNC_DIR, "active-drawing.tex");
export const ACTIVE_RECORD_FILE = path.resolve(AGENT_SYNC_DIR, "current-active-file.txt");

export interface CanvasState {
  source: string;
  activeFilePath: string;
  isLive: boolean;
  mtime?: number;
}

export function getActiveFilePath(): string {
  if (fs.existsSync(ACTIVE_RECORD_FILE)) {
    try {
      const record = fs.readFileSync(ACTIVE_RECORD_FILE, "utf-8").trim();
      if (record && fs.existsSync(record)) {
        return record;
      }
    } catch {}
  }
  if (fs.existsSync(ACTIVE_SKETCH_FILE)) {
    return ACTIVE_SKETCH_FILE;
  }
  return ACTIVE_WEB_FILE;
}

export function readCanvasState(): CanvasState {
  const filePath = getActiveFilePath();
  if (fs.existsSync(filePath)) {
    try {
      const source = fs.readFileSync(filePath, "utf-8");
      const stat = fs.statSync(filePath);
      return {
        source,
        activeFilePath: filePath,
        isLive: true,
        mtime: stat.mtimeMs
      };
    } catch (e: any) {
      return {
        source: "",
        activeFilePath: filePath,
        isLive: false
      };
    }
  }

  return {
    source: "",
    activeFilePath: filePath,
    isLive: false
  };
}

export function writeCanvasCode(source: string, targetFile?: string): { success: boolean; filePath: string; error?: string } {
  try {
    const dest = targetFile ? path.resolve(PROJECT_ROOT, targetFile) : getActiveFilePath();
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.writeFileSync(dest, source, "utf-8");

    // Also sync to active-drawing if writing to a sketch file, ensuring web preview updates
    if (dest !== ACTIVE_SKETCH_FILE && fs.existsSync(path.dirname(ACTIVE_SKETCH_FILE))) {
      try {
        fs.writeFileSync(ACTIVE_SKETCH_FILE, source, "utf-8");
      } catch {}
    }
    if (dest !== ACTIVE_WEB_FILE && fs.existsSync(path.dirname(ACTIVE_WEB_FILE))) {
      try {
        fs.writeFileSync(ACTIVE_WEB_FILE, source, "utf-8");
      } catch {}
    }

    return {
      success: true,
      filePath: dest
    };
  } catch (e: any) {
    return {
      success: false,
      filePath: targetFile || getActiveFilePath(),
      error: e.message || String(e)
    };
  }
}

export interface SketchItem {
  name: string;
  relPath: string;
  size: number;
  mtime: number;
}

export function listSketches(subDir = ""): SketchItem[] {
  const targetDir = path.resolve(SKETCH_DIR, subDir);
  if (!fs.existsSync(targetDir)) return [];

  const results: SketchItem[] = [];
  const entries = fs.readdirSync(targetDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const fullPath = path.resolve(targetDir, entry.name);
    if (entry.isFile() && (entry.name.endsWith(".tex") || entry.name.endsWith(".tikz"))) {
      const stat = fs.statSync(fullPath);
      results.push({
        name: entry.name,
        relPath: path.relative(SKETCH_DIR, fullPath).replace(/\\/g, "/"),
        size: stat.size,
        mtime: stat.mtimeMs
      });
    }
  }

  return results.sort((a, b) => b.mtime - a.mtime);
}
