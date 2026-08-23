import { beforeEach, describe, expect, it } from "vitest";
import { loadSettings } from "../../packages/app/src/settings/storage.js";
import { DEFAULT_SETTINGS } from "../../packages/app/src/settings/types.js";
import { setActiveEditorPlatform } from "../../packages/app/src/platform/current.js";
import { createBrowserPlatformAdapter } from "../../apps/web/src/platform/browser-platform.js";

const STORAGE_KEY = "tikz-editor:settings";

describe("settings storage", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    setActiveEditorPlatform(createBrowserPlatformAdapter({
      storage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        }
      }
    }));
  });

  it("fills new formatter settings from defaults for legacy settings objects", () => {
    const storage = new Map<string, string>();
    setActiveEditorPlatform(createBrowserPlatformAdapter({
      storage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        }
      }
    }));
    storage.set(
      STORAGE_KEY,
      JSON.stringify({
        settings: {
          editor: {
            wordWrap: true,
            fontSize: 13,
            lineNumbers: false,
            indentSize: 4
          }
        }
      })
    );

    const loaded = loadSettings();
    expect(loaded.editor.wordWrap).toBe(true);
    expect(loaded.editor.indentSize).toBe(4);
    expect(loaded.editor.formatterReflowLongOptions).toBe(DEFAULT_SETTINGS.editor.formatterReflowLongOptions);
    expect(loaded.editor.formatterMaxLineLength).toBe(DEFAULT_SETTINGS.editor.formatterMaxLineLength);
  });

  it("clamps formatter max line length when loading persisted values", () => {
    const storage = new Map<string, string>();
    setActiveEditorPlatform(createBrowserPlatformAdapter({
      storage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        }
      }
    }));
    storage.set(
      STORAGE_KEY,
      JSON.stringify({
        settings: {
          editor: {
            formatterMaxLineLength: 999
          }
        }
      })
    );

    const loaded = loadSettings();
    expect(loaded.editor.formatterMaxLineLength).toBe(240);
  });
});
