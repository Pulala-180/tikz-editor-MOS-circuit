import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import agentSyncPlugin from "./agent-sync-plugin";

const profilingBuild = process.env.TIKZ_PROFILE_BUILD === "1";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/editor/web/" : "/",
  server: {
    port: 8888,
    host: true,
    open: true,
  },
  plugins: [react(), agentSyncPlugin()],
  publicDir: path.resolve(__dirname, "../../packages/app/public"),
  define: {
    "import.meta.env.TIKZ_EDITOR_VERSION": JSON.stringify(process.env.npm_package_version ?? "0.1.0")
  },
  worker: {
    format: "es"
  },
  optimizeDeps: {
    exclude: ["mathlive"]
  },
  resolve: {
    alias: {
      "@tikz-editor/app/app-menu": path.resolve(__dirname, "../../packages/app/src/app-menu/index.ts"),
      "@tikz-editor/app/linked-file-sync": path.resolve(__dirname, "../../packages/app/src/linked-file-sync.ts"),
      "@tikz-editor/app/platform/current": path.resolve(__dirname, "../../packages/app/src/platform/current.ts"),
      "@tikz-editor/app/platform/types": path.resolve(__dirname, "../../packages/app/src/platform/types.ts"),
      "@tikz-editor/app/store/types": path.resolve(__dirname, "../../packages/app/src/store/types.ts"),
      "@tikz-editor/app/workspace": path.resolve(__dirname, "../../packages/app/src/ui/workspace-apply.ts"),
      "@tikz-editor/app": path.resolve(__dirname, "../../packages/app/src/index.ts"),
      "@tikz-editor/lang-tikz": path.resolve(__dirname, "../../packages/lang-tikz/src/index.ts"),
      "@tikz-editor/lezer-tikz": path.resolve(__dirname, "../../packages/lezer-tikz/src/index.ts"),
      "@tikz-editor/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
      "tikz-editor": path.resolve(__dirname, "../../packages/core/src"),
    },
  },
  esbuild: profilingBuild
    ? { minifyIdentifiers: false, keepNames: true }
    : undefined,
  // Content-Security-Policy should be configured at the production web server level:
  //   Content-Security-Policy: script-src 'self'
  // This blocks any inline event handlers that could be embedded in TikZ-generated SVG.
  // It is not set here because Vite's dev server injects inline scripts for React Refresh.
}));
