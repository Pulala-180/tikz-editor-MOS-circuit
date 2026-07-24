import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import agentSyncPlugin from "../../apps/web/agent-sync-plugin";

describe("agentSyncPlugin", () => {
  it("should return a plugin with name 'agent-sync-plugin'", () => {
    const plugin = agentSyncPlugin();
    expect(plugin.name).toBe("agent-sync-plugin");
    expect(typeof plugin.configureServer).toBe("function");
  });

  it("should setup directory watching and trigger HMR ws send on target file change", () => {
    const plugin = agentSyncPlugin();

    let changeHandler: ((file: string) => void) | undefined;

    const mockWatcher = {
      add: vi.fn(),
      on: vi.fn((event: string, handler: (file: string) => void) => {
        if (event === "change") {
          changeHandler = handler;
        }
      }),
    };

    const mockWs = {
      send: vi.fn(),
    };

    const mockServer = {
      watcher: mockWatcher,
      ws: mockWs,
    };

    // Call configureServer
    // @ts-expect-error partial mock for server
    plugin.configureServer!(mockServer);

    expect(mockWatcher.add).toHaveBeenCalled();
    expect(mockWatcher.on).toHaveBeenCalledWith("change", expect.any(Function));

    const expectedSyncDir = path.resolve(process.cwd(), "apps/web/agent-sync");
    const expectedTargetFile = path.resolve(expectedSyncDir, "active-drawing.tex");

    // Simulate change event on a different file
    changeHandler!("some-other-file.txt");
    expect(mockWs.send).not.toHaveBeenCalled();

    // Mock fs.readFileSync for targetFile
    const readFileSyncSpy = vi.spyOn(fs, "readFileSync").mockReturnValue("\\draw (0,0) -- (1,1);");

    // Simulate change event on target file
    changeHandler!(expectedTargetFile);

    expect(readFileSyncSpy).toHaveBeenCalledWith(expectedTargetFile, "utf-8");
    expect(mockWs.send).toHaveBeenCalledWith("agent:update-code", {
      source: "\\draw (0,0) -- (1,1);",
    });

    readFileSyncSpy.mockRestore();
  });

  it("should handle error when reading file fails", () => {
    const plugin = agentSyncPlugin();

    let changeHandler: ((file: string) => void) | undefined;
    const mockWatcher = {
      add: vi.fn(),
      on: vi.fn((event: string, handler: (file: string) => void) => {
        if (event === "change") {
          changeHandler = handler;
        }
      }),
    };

    const mockWs = {
      send: vi.fn(),
    };

    const mockServer = {
      watcher: mockWatcher,
      ws: mockWs,
    };

    // @ts-expect-error partial mock for server
    plugin.configureServer!(mockServer);

    const expectedSyncDir = path.resolve(process.cwd(), "apps/web/agent-sync");
    const expectedTargetFile = path.resolve(expectedSyncDir, "active-drawing.tex");

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const readFileSyncSpy = vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw new Error("Read error");
    });

    changeHandler!(expectedTargetFile);

    expect(mockWs.send).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to read agent sync file", expect.any(Error));

    readFileSyncSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
