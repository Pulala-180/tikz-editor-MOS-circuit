import fs from "fs";
import path from "path";
import type { Plugin } from "vite";

export default function agentSyncPlugin(): Plugin {
  return {
    name: "agent-sync-plugin",
    configureServer(server) {
      const syncDir = path.resolve(__dirname, "agent-sync");
      const targetFile = path.resolve(syncDir, "active-drawing.tex");

      // Ensure directory exists
      if (!fs.existsSync(syncDir)) {
        fs.mkdirSync(syncDir, { recursive: true });
      }

      server.watcher.add(syncDir);

      server.watcher.on("change", (file) => {
        if (file === targetFile) {
          try {
            const content = fs.readFileSync(targetFile, "utf-8");
            server.ws.send("agent:update-code", { source: content });
          } catch (e) {
            console.error("Failed to read agent sync file", e);
          }
        }
      });
    }
  };
}
