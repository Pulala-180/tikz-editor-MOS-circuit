import { describe, it, expect } from "vitest";
import viteConfig from "../../apps/web/vite.config";

describe("vite.config.ts", () => {
  it("should include agent-sync-plugin in plugins array", () => {
    const config = typeof viteConfig === "function"
      ? viteConfig({ command: "serve", mode: "development" })
      : viteConfig;
    const plugins = (config as any).plugins || [];
    const pluginNames = plugins.flat().map((p: any) => p?.name);
    expect(pluginNames).toContain("agent-sync-plugin");
  });
});
