import fs from "fs";
import path from "path";
import { exec } from "child_process";
import type { Plugin } from "vite";

export default function agentSyncPlugin(): Plugin {
  return {
    name: "agent-sync-plugin",
    configureServer(server) {
      const syncDirSketch = path.resolve(__dirname, "../../Sketch/active-drawing");
      const targetFileSketch = path.resolve(syncDirSketch, "active-drawing.tex");
      const syncDirWeb = path.resolve(__dirname, "agent-sync");
      const targetFileWeb = path.resolve(syncDirWeb, "active-drawing.tex");

      // Ensure directories and files exist
      [syncDirSketch, syncDirWeb].forEach((dir) => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      });

      const targets = [targetFileSketch, targetFileWeb];

      server.watcher.add(syncDirSketch);
      server.watcher.add(syncDirWeb);
      server.watcher.add(targetFileSketch);
      server.watcher.add(targetFileWeb);

      const sendContent = (filePath: string) => {
        try {
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, "utf-8");
            server.ws.send("agent:update-code", { source: content });
          }
        } catch (e) {
          console.error("Failed to read agent sync file", e);
        }
      };

      const isTarget = (file: string) => {
        const norm = path.normalize(file).toLowerCase();
        return targets.some((t) => norm === path.normalize(t).toLowerCase() || norm.endsWith("active-drawing.tex"));
      };

      server.watcher.on("all", (event, file) => {
        if (typeof file === "string" && isTarget(file)) {
          sendContent(file);
        }
      });

      // Robust fallback polling for instant Windows update detection
      targets.forEach((t) => {
        if (fs.existsSync(t)) {
          fs.watchFile(t, { interval: 200 }, () => sendContent(t));
        }
      });

      server.ws.on("agent:request-code", (data, client) => {
        const activeFile = fs.existsSync(targetFileSketch) ? targetFileSketch : targetFileWeb;
        if (fs.existsSync(activeFile)) {
          try {
            const content = fs.readFileSync(activeFile, "utf-8");
            client.send("agent:update-code", { source: content });
          } catch (e) {
            console.error("Failed to read agent sync file on request", e);
          }
        }
      });

      let currentSketchDir = path.resolve(__dirname, "../../Sketch");
      if (!fs.existsSync(currentSketchDir)) {
        fs.mkdirSync(currentSketchDir, { recursive: true });
      }

      type FileTreeItem = {
        name: string;
        relPath: string;
        isDirectory: boolean;
        size?: number;
        mtime?: number;
        children?: FileTreeItem[];
      };

      function scanTree(dirPath: string, relBase = ""): FileTreeItem[] {
        if (!fs.existsSync(dirPath)) return [];
        try {
          const entries = fs.readdirSync(dirPath, { withFileTypes: true });
          const items: FileTreeItem[] = [];

          for (const entry of entries) {
            if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
            const fullPath = path.resolve(dirPath, entry.name);
            const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;

            if (entry.isDirectory()) {
              items.push({
                name: entry.name,
                relPath,
                isDirectory: true,
                children: scanTree(fullPath, relPath)
              });
            } else if (entry.name.endsWith(".tex") || entry.name.endsWith(".tikz")) {
              const stat = fs.statSync(fullPath);
              items.push({
                name: entry.name,
                relPath,
                isDirectory: false,
                size: stat.size,
                mtime: stat.mtimeMs
              });
            }
          }

          return items.sort((a, b) => {
            if (!a.isDirectory && b.isDirectory) return -1;
            if (a.isDirectory && !b.isDirectory) return 1;
            return a.name.localeCompare(b.name, "zh", { sensitivity: "base" });
          });
        } catch (e) {
          console.error("Failed to scan directory tree", e);
          return [];
        }
      }

      function broadcastSketchTree() {
        const tree = scanTree(currentSketchDir);
        server.ws.send("sketch:tree-update", {
          currentDir: currentSketchDir,
          dirName: path.basename(currentSketchDir),
          tree
        });
      }

      server.watcher.add(currentSketchDir);
      server.watcher.on("all", (event, file) => {
        if (typeof file === "string" && file.startsWith(currentSketchDir)) {
          broadcastSketchTree();
        }
      });

      server.ws.on("sketch:request-tree", (data, client) => {
        client.send("sketch:tree-update", {
          currentDir: currentSketchDir,
          dirName: path.basename(currentSketchDir),
          tree: scanTree(currentSketchDir)
        });
      });

      server.ws.on("sketch:switch-dir", (data: { dirPath: string }, client) => {
        try {
          if (fs.existsSync(data.dirPath) && fs.statSync(data.dirPath).isDirectory()) {
            server.watcher.unwatch(currentSketchDir);
            currentSketchDir = path.resolve(data.dirPath);
            server.watcher.add(currentSketchDir);
            broadcastSketchTree();
          }
        } catch (e) {
          console.error("Failed to switch directory", e);
        }
      });

      server.ws.on("sketch:open-folder-dialog", () => {
        const safeStart = currentSketchDir.replace(/'/g, "''");
        const psScript = [
          'Add-Type -AssemblyName System.Windows.Forms',
          '$d = New-Object System.Windows.Forms.OpenFileDialog',
          '$d.ValidateNames = $false',
          '$d.CheckFileExists = $false',
          '$d.CheckPathExists = $true',
          `$d.InitialDirectory = '${safeStart}'`,
          '$d.FileName = "选择当前文件夹"',
          '$d.Title = "请进入您想要切换的目标文件夹，然后点击【打开】"',
          'if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {',
          '    $folder = [System.IO.Path]::GetDirectoryName($d.FileName)',
          '    Write-Output $folder',
          '}'
        ].join('; ');

        const psCommand = `powershell -NoProfile -Command "& { ${psScript} }"`;

        exec(psCommand, (err, stdout) => {
          if (!err && stdout && stdout.trim()) {
            const selectedPath = stdout.trim();
            if (fs.existsSync(selectedPath) && fs.statSync(selectedPath).isDirectory()) {
              server.watcher.unwatch(currentSketchDir);
              currentSketchDir = path.resolve(selectedPath);
              server.watcher.add(currentSketchDir);
              broadcastSketchTree();
            }
          }
        });
      });

      server.ws.on("sketch:create-folder", (data: { parentRelPath?: string; folderName: string }) => {
        try {
          const parent = data.parentRelPath ? path.resolve(currentSketchDir, data.parentRelPath) : currentSketchDir;
          const safeName = data.folderName.replace(/[/\\?%*:|"<>]/g, "_").trim();
          const target = path.resolve(parent, safeName);
          if (!fs.existsSync(target)) {
            fs.mkdirSync(target, { recursive: true });
            broadcastSketchTree();
          }
        } catch (e) {
          console.error("Failed to create folder", e);
        }
      });

      server.ws.on("sketch:read", (data: { relPath: string }, client) => {
        try {
          const filePath = path.resolve(currentSketchDir, data.relPath);
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, "utf-8");
            client.send("sketch:file-data", {
              name: path.basename(data.relPath),
              relPath: data.relPath,
              content
            });
          }
        } catch (e) {
          console.error("Failed to read sketch file", e);
        }
      });

      server.ws.on("sketch:rename", (data: { oldRelPath: string; newRelPath: string }, client) => {
        try {
          const oldPath = path.resolve(currentSketchDir, data.oldRelPath);
          const newPath = path.resolve(currentSketchDir, data.newRelPath);
          if (fs.existsSync(oldPath)) {
            fs.renameSync(oldPath, newPath);
            broadcastSketchTree();
            client.send("sketch:rename-success", {
              oldRelPath: data.oldRelPath,
              newRelPath: data.newRelPath,
              oldName: path.basename(data.oldRelPath),
              newName: path.basename(data.newRelPath)
            });
          }
        } catch (e) {
          console.error("Failed to rename file/folder", e);
        }
      });

      server.ws.on("sketch:create", (data: { title: string; source: string; relFolder?: string }) => {
        try {
          const rawName = (data.title || "Untitled").replace(/[/\\?%*:|"<>]/g, "_").trim();
          const safeName = rawName.endsWith(".tex") || rawName.endsWith(".tikz") ? rawName : `${rawName}.tex`;
          const targetDir = data.relFolder ? path.resolve(currentSketchDir, data.relFolder) : currentSketchDir;
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          const filePath = path.resolve(targetDir, safeName);
          fs.writeFileSync(filePath, data.source, "utf-8");
          broadcastSketchTree();
        } catch (e) {
          console.error("Failed to create sketch file", e);
        }
      });

      server.ws.on("sketch:save", (data: { title: string; source: string; relPath?: string }) => {
        try {
          const filePath = data.relPath
            ? path.resolve(currentSketchDir, data.relPath)
            : path.resolve(
                currentSketchDir,
                (data.title.endsWith(".tex") || data.title.endsWith(".tikz") ? data.title : `${data.title}.tex`).replace(/[/\\?%*:|"<>]/g, "_")
              );
          fs.writeFileSync(filePath, data.source, "utf-8");
          broadcastSketchTree();
        } catch (e) {
          console.error("Failed to save sketch file", e);
        }
      });

      function deletePathOrName(candidate: string) {
        if (!candidate || candidate.trim().length === 0) return;
        const normalized = candidate.trim().replace(/[/\\?%*:|"<>]/g, (m) => m === "/" || m === "\\" ? "/" : "_");
        const withTex = normalized.endsWith(".tex") || normalized.endsWith(".tikz") ? normalized : `${normalized}.tex`;

        // 1. Direct check in currentSketchDir
        const directPath = path.resolve(currentSketchDir, normalized);
        if (fs.existsSync(directPath)) {
          const stat = fs.statSync(directPath);
          if (stat.isDirectory()) {
            fs.rmSync(directPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(directPath);
          }
          return;
        }

        const texPath = path.resolve(currentSketchDir, withTex);
        if (fs.existsSync(texPath)) {
          fs.unlinkSync(texPath);
          return;
        }

        // 2. Search recursively across all subdirectories
        function searchAndDelete(dir: string): boolean {
          if (!fs.existsSync(dir)) return false;
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const full = path.resolve(dir, entry.name);
              if (entry.isDirectory()) {
                if (entry.name === normalized) {
                  fs.rmSync(full, { recursive: true, force: true });
                  return true;
                }
                if (searchAndDelete(full)) return true;
              } else {
                if (
                  entry.name === normalized ||
                  entry.name === withTex ||
                  entry.name.replace(/\.(tex|tikz)$/i, "") === normalized
                ) {
                  fs.unlinkSync(full);
                  return true;
                }
              }
            }
          } catch (e) {
            console.error("Error searching file to delete", e);
          }
          return false;
        }
        searchAndDelete(currentSketchDir);
      }

      server.ws.on("sketch:delete", (data: { relPath?: string; title?: string; name?: string; id?: string }) => {
        try {
          const target = data.relPath || data.name || data.title;
          if (target) {
            deletePathOrName(target);
            broadcastSketchTree();
          }
        } catch (e) {
          console.error("Failed to delete sketch path", e);
        }
      });
    }
  };
}
