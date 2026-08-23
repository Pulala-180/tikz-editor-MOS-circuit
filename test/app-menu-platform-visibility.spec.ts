import { describe, expect, it } from "vitest";
import { filterAppMenuDefinitionForTarget } from "../packages/app/src/app-menu/platform-visibility";
import type { AppMenuDefinition } from "../packages/app/src/app-menu/types";

const TEST_MENU: AppMenuDefinition = [
  {
    id: "view",
    label: "View",
    items: [
      { kind: "command", commandId: "view.toggle-grid", label: "Grid" },
      {
        kind: "command",
        commandId: "view.toggle-source-panel",
        label: "Source",
        platforms: ["desktop"]
      },
      {
        kind: "command",
        commandId: "view.toggle-inspector-panel",
        label: "Inspector",
        platforms: ["desktop-windows"]
      },
      {
        kind: "command",
        commandId: "help.check-for-updates",
        label: "Check for Updates",
        platforms: ["desktop-linux"]
      },
      {
        kind: "command",
        commandId: "view.toggle-assistant-panel",
        label: "Assistant",
        platforms: ["desktop-macos"]
      },
      {
        kind: "command",
        commandId: "view.toggle-snap-haptics",
        label: "Haptic Snap Feedback",
        platforms: ["desktop-macos"]
      },
      {
        kind: "command",
        commandId: "view.toggle-dev-panel",
        label: "Developer",
        platforms: ["web"]
      }
    ]
  }
];

function commandIds(definition: AppMenuDefinition): string[] {
  const section = definition[0];
  if (!section) {
    return [];
  }
  return section.items
    .filter((item): item is Extract<(typeof section.items)[number], { kind: "command" }> => item.kind === "command")
    .map((item) => item.commandId);
}

describe("filterAppMenuDefinitionForTarget", () => {
  it("keeps generic desktop items on desktop-windows target", () => {
    const filtered = filterAppMenuDefinitionForTarget(TEST_MENU, "desktop-windows");
    expect(commandIds(filtered)).toContain("view.toggle-source-panel");
    expect(commandIds(filtered)).toContain("view.toggle-inspector-panel");
    expect(commandIds(filtered)).not.toContain("help.check-for-updates");
    expect(commandIds(filtered)).not.toContain("view.toggle-assistant-panel");
    expect(commandIds(filtered)).not.toContain("view.toggle-snap-haptics");
  });

  it("keeps generic desktop items on desktop-macos target", () => {
    const filtered = filterAppMenuDefinitionForTarget(TEST_MENU, "desktop-macos");
    expect(commandIds(filtered)).toContain("view.toggle-source-panel");
    expect(commandIds(filtered)).toContain("view.toggle-assistant-panel");
    expect(commandIds(filtered)).toContain("view.toggle-snap-haptics");
    expect(commandIds(filtered)).not.toContain("view.toggle-inspector-panel");
    expect(commandIds(filtered)).not.toContain("help.check-for-updates");
  });

  it("keeps linux scoped items on desktop-linux target", () => {
    const filtered = filterAppMenuDefinitionForTarget(TEST_MENU, "desktop-linux");
    expect(commandIds(filtered)).toContain("view.toggle-source-panel");
    expect(commandIds(filtered)).toContain("help.check-for-updates");
    expect(commandIds(filtered)).not.toContain("view.toggle-inspector-panel");
    expect(commandIds(filtered)).not.toContain("view.toggle-assistant-panel");
  });

  it("keeps windows and macos scoped items visible on legacy desktop target", () => {
    const filtered = filterAppMenuDefinitionForTarget(TEST_MENU, "desktop");
    expect(commandIds(filtered)).toContain("view.toggle-inspector-panel");
    expect(commandIds(filtered)).toContain("view.toggle-assistant-panel");
    expect(commandIds(filtered)).toContain("help.check-for-updates");
  });
});
