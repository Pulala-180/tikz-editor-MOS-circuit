// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { useEditorStore } from "@tikz-editor/app";
import { registerAgentSyncHMR } from "../../apps/web/src/main";

describe("Client-side HMR listener in main.tsx", () => {
  it("registers handler for agent:update-code and dispatches CODE_EDITED on useEditorStore", () => {
    let updateCodeCallback: ((data: { source: string }) => void) | undefined;

    const mockHot = {
      on: vi.fn((event: string, cb: (data: { source: string }) => void) => {
        if (event === "agent:update-code") {
          updateCodeCallback = cb;
        }
      }),
    };

    registerAgentSyncHMR(mockHot);

    expect(mockHot.on).toHaveBeenCalledWith("agent:update-code", expect.any(Function));
    expect(updateCodeCallback).toBeDefined();

    const dispatchSpy = vi.spyOn(useEditorStore.getState(), "dispatch");
    const testCode = "\\draw (0,0) -- (2,2);";

    updateCodeCallback!({ source: testCode });

    expect(dispatchSpy).toHaveBeenCalledWith({
      type: "CODE_EDITED",
      source: testCode,
    });

    dispatchSpy.mockRestore();
  });
});
