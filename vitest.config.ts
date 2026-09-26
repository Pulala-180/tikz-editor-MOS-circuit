import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@tikz-editor/app/app-menu": path.resolve(__dirname, "packages/app/src/app-menu/index.ts"),
      "@tikz-editor/app/linked-file-sync": path.resolve(__dirname, "packages/app/src/linked-file-sync.ts"),
      "@tikz-editor/app/platform/current": path.resolve(__dirname, "packages/app/src/platform/current.ts"),
      "@tikz-editor/app/platform/types": path.resolve(__dirname, "packages/app/src/platform/types.ts"),
      "@tikz-editor/app/store/types": path.resolve(__dirname, "packages/app/src/store/types.ts"),
      "@tikz-editor/app/workspace": path.resolve(__dirname, "packages/app/src/ui/workspace-apply.ts"),
      "@tikz-editor/app": path.resolve(__dirname, "packages/app/src/index.ts"),
      "@tikz-editor/lang-tikz": path.resolve(__dirname, "packages/lang-tikz/src/index.ts"),
      "@tikz-editor/lezer-tikz": path.resolve(__dirname, "packages/lezer-tikz/src/index.ts"),
      "@tikz-editor/core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "tikz-editor": path.resolve(__dirname, "packages/core/src"),
    },
  },
  test: {
    environment: "node",
  },
});
