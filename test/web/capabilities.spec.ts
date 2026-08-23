import { describe, expect, it } from "vitest";
import { getInspectorPropertyCapabilityStatus } from "../../packages/app/src/ui/capabilities.js";

describe("inspector capabilities", () => {
  it("supports text inspector properties", () => {
    const result = getInspectorPropertyCapabilityStatus({
      kind: "text",
      id: "adornment-text",
      label: "Text",
      value: "Label",
      write: {
        mode: "setProperty",
        elementId: "node-adornment:node:0:2:label:0",
        level: "command",
        key: "__adornment_text__",
        writable: true
      }
    });

    expect(result.status).not.toBe("unsupported");
  });
});
