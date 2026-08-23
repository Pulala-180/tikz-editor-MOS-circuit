import { expect, test } from "@playwright/test";
import {
  gotoApp,
  injectNoFsApiFallback,
  openMenuCommand,
  readPersistedWorkspaceDocumentCount,
  readActiveFigureId,
  readFigureCount,
  readSource,
  resetStorageBeforeNavigation,
  setSource,
  tabSwitchButtons
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await resetStorageBeforeNavigation(page);
});

test("boots with one tab and supports new/switch/close-all workflows", async ({ page }) => {
  await gotoApp(page);
  await expect(tabSwitchButtons(page)).toHaveCount(1);
  await expect(page.locator(".flexlayout__tab_button_content:has-text('Styles')").first()).toBeVisible();

  await openMenuCommand(page, "file", "file.new-document");
  await expect(tabSwitchButtons(page)).toHaveCount(2);

  await tabSwitchButtons(page).first().click();
  await expect(page.locator("[role='tab'][aria-selected='true']")).toHaveCount(1);

  await openMenuCommand(page, "file", "file.close-all-documents");
  await expect(tabSwitchButtons(page)).toHaveCount(1);
});

test("keeps sources isolated per tab and restores workspace on reload", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, "\\draw (0,0)--(1,0); % doc1");
  await openMenuCommand(page, "file", "file.new-document");
  await setSource(page, "\\draw (2,0)--(3,0); % doc2");

  await tabSwitchButtons(page).first().click();
  await expect.poll(async () => readSource(page)).toContain("% doc1");
  await tabSwitchButtons(page).nth(1).click();
  await expect.poll(async () => readSource(page)).toContain("% doc2");
  await expect.poll(async () => readPersistedWorkspaceDocumentCount(page)).toBe(2);

  await page.reload();
  await expect(tabSwitchButtons(page)).toHaveCount(2);
  await tabSwitchButtons(page).first().click();
  await expect.poll(async () => readSource(page)).toContain("% doc1");
});

test("new/open/save/close keyboard shortcuts smoke", async ({ page }) => {
  await injectNoFsApiFallback(page);
  await page.addInitScript(() => {
    const originalClick = Function.prototype.call.bind(HTMLInputElement.prototype.click) as (input: HTMLInputElement) => void;
    HTMLInputElement.prototype.click = function clickPatched(this: HTMLInputElement) {
      if (this.type === "file") {
        const file = new File(["\\\\draw (7,7)--(8,8); % keyboard-open"], "keyboard-open.tex", { type: "text/plain" });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        Object.defineProperty(this, "files", {
          configurable: true,
          get: () => dataTransfer.files
        });
        this.dispatchEvent(new Event("change"));
        return;
      }
      originalClick(this);
    };
  });

  await gotoApp(page);
  await page.keyboard.press("ControlOrMeta+N");
  await expect(tabSwitchButtons(page)).toHaveCount(2);

  const download = page.waitForEvent("download");
  await page.keyboard.press("ControlOrMeta+S");
  await download;

  await page.keyboard.press("ControlOrMeta+O");
  await expect.poll(async () => readSource(page)).toContain("% keyboard-open");

  await page.getByTestId("canvas-viewport").click();
  await page.keyboard.press("ControlOrMeta+W");
  if (await page.getByTestId("unsaved-changes-modal").count()) {
    await page.getByTestId("unsaved-discard").click();
  }
  const tabCount = await tabSwitchButtons(page).count();
  expect(tabCount).toBeGreaterThanOrEqual(1);
});

test("open example defaults to opening a new tab", async ({ page }) => {
  await gotoApp(page);
  const before = await tabSwitchButtons(page).count();

  await openMenuCommand(page, "file", "file.open-example");
  await expect(page.getByTestId("open-example-modal")).toBeVisible();
  await page.locator("[data-testid^='open-example-card-']").first().click();

  await expect(tabSwitchButtons(page)).toHaveCount(before + 1);
});

test("multi-figure mode supports figure strip activation and clears active figure after deletion", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, String.raw`\documentclass{article}
\begin{document}
\begin{tikzpicture}
  \draw (0,0) -- (1,0);
\end{tikzpicture}
\begin{tikzpicture}
  \draw (0,0) -- (0,1);
\end{tikzpicture}
\end{document}`);

  await expect.poll(async () => readFigureCount(page)).toBe(2);
  await expect(page.getByTestId("figure-navigator")).toBeVisible();

  const firstActive = await readActiveFigureId(page);
  expect(firstActive).not.toBeNull();

  await page.getByRole("button", { name: "Figure 2" }).click();
  await expect.poll(async () => readActiveFigureId(page)).not.toBe(firstActive);

  await setSource(page, String.raw`\documentclass{article}
\begin{document}
\begin{tikzpicture}
  \draw (0,0) -- (1,0);
\end{tikzpicture}
\end{document}`);

  await expect.poll(async () => readFigureCount(page)).toBe(1);
  await expect.poll(async () => readActiveFigureId(page)).toBeNull();
});

test("fallback save path triggers browser download", async ({ page }) => {
  await injectNoFsApiFallback(page);
  await gotoApp(page);
  await setSource(page, "\\draw (0,0)--(2,2); % save-fallback");

  const downloadPromise = page.waitForEvent("download");
  await openMenuCommand(page, "file", "file.save-document");
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain(".tex");
});

test("fallback open path uses file input and loads content", async ({ page }) => {
  await injectNoFsApiFallback(page);
  await page.addInitScript(() => {
    const originalClick = Function.prototype.call.bind(HTMLInputElement.prototype.click) as (input: HTMLInputElement) => void;
    HTMLInputElement.prototype.click = function clickPatched(this: HTMLInputElement) {
      if (this.type === "file") {
        const file = new File(["\\\\draw (7,7)--(8,8); % fallback-open"], "fallback-open.tex", { type: "text/plain" });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        Object.defineProperty(this, "files", {
          configurable: true,
          get: () => dataTransfer.files
        });
        this.dispatchEvent(new Event("change"));
        return;
      }
      originalClick(this);
    };
  });

  await gotoApp(page);
  await openMenuCommand(page, "file", "file.open-document");
  await expect.poll(async () => readSource(page)).toContain("% fallback-open");
});

test("fallback open path imports svg as a new tikz document", async ({ page }) => {
  await injectNoFsApiFallback(page);
  await page.addInitScript(() => {
    const originalClick = Function.prototype.call.bind(HTMLInputElement.prototype.click) as (input: HTMLInputElement) => void;
    HTMLInputElement.prototype.click = function clickPatched(this: HTMLInputElement) {
      if (this.type === "file") {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="red"/></svg>`;
        const file = new File([svg], "fallback-open.svg", { type: "image/svg+xml" });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        Object.defineProperty(this, "files", {
          configurable: true,
          get: () => dataTransfer.files
        });
        this.dispatchEvent(new Event("change"));
        return;
      }
      originalClick(this);
    };
  });

  await gotoApp(page);
  await openMenuCommand(page, "file", "file.open-document");
  await expect.poll(async () => readSource(page)).toContain("\\begin{tikzpicture}");
});

test("file import svg command imports svg as a new tikz document", async ({ page }) => {
  await injectNoFsApiFallback(page);
  await page.addInitScript(() => {
    const originalClick = Function.prototype.call.bind(HTMLInputElement.prototype.click) as (input: HTMLInputElement) => void;
    HTMLInputElement.prototype.click = function clickPatched(this: HTMLInputElement) {
      if (this.type === "file") {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect x="2" y="2" width="16" height="16" fill="blue"/></svg>`;
        const file = new File([svg], "menu-import.svg", { type: "image/svg+xml" });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        Object.defineProperty(this, "files", {
          configurable: true,
          get: () => dataTransfer.files
        });
        this.dispatchEvent(new Event("change"));
        return;
      }
      originalClick(this);
    };
  });

  await gotoApp(page);
  await openMenuCommand(page, "file", "file.import-svg");
  await expect.poll(async () => readSource(page)).toContain("\\begin{tikzpicture}");
});

test("file import powerpoint command shows an error for invalid pptx data", async ({ page }) => {
  await injectNoFsApiFallback(page);
  await page.addInitScript(() => {
    const originalClick = Function.prototype.call.bind(HTMLInputElement.prototype.click) as (input: HTMLInputElement) => void;
    HTMLInputElement.prototype.click = function clickPatched(this: HTMLInputElement) {
      if (this.type === "file") {
        const invalid = new Uint8Array([1, 2, 3, 4, 5, 6]);
        const file = new File(
          [invalid],
          "broken.pptx",
          { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }
        );
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        Object.defineProperty(this, "files", {
          configurable: true,
          get: () => dataTransfer.files
        });
        this.dispatchEvent(new Event("change"));
        return;
      }
      originalClick(this);
    };
  });

  await gotoApp(page);

  const dialogPromise = page.waitForEvent("dialog");
  await openMenuCommand(page, "file", "file.import-powerpoint");
  const dialog = await dialogPromise;
  expect(dialog.message()).toContain("PowerPoint import failed:");
  await dialog.accept();
});

test("fs-api save/open flows with rebinding and permission fallback", async ({ page }) => {
  await page.addInitScript(() => {
    type PermissionMode = "read" | "readwrite";
    const writes: string[] = [];
    const openedText = "\\draw (9,9)--(10,10); % opened";
    const createHandle = (name: string, allowWrite: { value: boolean }) => ({
      name,
      queryPermission: async ({ mode }: { mode: PermissionMode }) => {
        if (mode === "read") return "granted";
        return allowWrite.value ? "granted" : "prompt";
      },
      requestPermission: async ({ mode }: { mode: PermissionMode }) => {
        if (mode === "read") return "granted";
        allowWrite.value = true;
        return "granted";
      },
      getFile: async () => ({ text: async () => openedText }),
      createWritable: async () => ({
        write: async (value: string) => {
          writes.push(value);
        },
        close: async () => undefined
      })
    });

    const allowWrite = { value: true };
    const saveHandle = createHandle("bound.tex", allowWrite);
    const memoryStore = new Map<string, unknown>();

    (globalThis as unknown as { __TIKZ_EDITOR_BROWSER_PLATFORM_ENV__: unknown }).__TIKZ_EDITOR_BROWSER_PLATFORM_ENV__ = {
      fsApi: {
        showOpenFilePicker: async () => [createHandle("opened.tex", { value: true })],
        showSaveFilePicker: async () => saveHandle
      },
      fsHandleStore: {
        load: async (id: string) => memoryStore.get(id) ?? null,
        save: async (id: string, handle: unknown) => {
          memoryStore.set(id, handle);
        }
      }
    };

    (globalThis as unknown as { __PW_FSA_WRITES__: string[] }).__PW_FSA_WRITES__ = writes;
    (globalThis as unknown as { __PW_FSA_DENY_NEXT__: () => void }).__PW_FSA_DENY_NEXT__ = () => {
      allowWrite.value = false;
    };
  });

  await gotoApp(page);
  await setSource(page, "\\draw (1,1)--(2,2); % fs-save");
  await openMenuCommand(page, "file", "file.save-document-as");
  await openMenuCommand(page, "file", "file.save-document");

  const writesAfterNormalSave = await page.evaluate(() => {
    return (globalThis as unknown as { __PW_FSA_WRITES__?: string[] }).__PW_FSA_WRITES__ ?? [];
  });
  expect(writesAfterNormalSave.length).toBeGreaterThanOrEqual(2);

  await page.evaluate(() => {
    (globalThis as unknown as { __PW_FSA_DENY_NEXT__?: () => void }).__PW_FSA_DENY_NEXT__?.();
  });
  await openMenuCommand(page, "file", "file.save-document");
  const writesAfterPermissionRecovery = await page.evaluate(() => {
    return (globalThis as unknown as { __PW_FSA_WRITES__?: string[] }).__PW_FSA_WRITES__ ?? [];
  });
  expect(writesAfterPermissionRecovery.length).toBeGreaterThanOrEqual(3);

  await openMenuCommand(page, "file", "file.open-document");
  await expect.poll(async () => readSource(page)).toContain("% opened");
});

test("fs-api linked save detects external changes before overwriting", async ({ page }) => {
  await page.addInitScript(() => {
    type PermissionMode = "read" | "readwrite";
    let diskText = "\\draw (0,0)--(1,1); % base";
    let lastModified = 1;
    const memoryStore = new Map<string, unknown>();
    const handle = {
      name: "linked.tex",
      queryPermission: async () => "granted",
      requestPermission: async (_options: { mode: PermissionMode }) => "granted",
      getFile: async () => ({
        text: async () => diskText,
        lastModified,
        size: diskText.length
      }),
      createWritable: async () => {
        let pending = diskText;
        return {
          write: async (value: string) => {
            pending = value;
          },
          close: async () => {
            diskText = pending;
            lastModified += 1;
          }
        };
      }
    };

    (globalThis as unknown as { __TIKZ_EDITOR_BROWSER_PLATFORM_ENV__: unknown }).__TIKZ_EDITOR_BROWSER_PLATFORM_ENV__ = {
      fsApi: {
        showOpenFilePicker: async () => [handle],
        showSaveFilePicker: async () => handle
      },
      fsHandleStore: {
        load: async (id: string) => memoryStore.get(id) ?? null,
        save: async (id: string, storedHandle: unknown) => {
          memoryStore.set(id, storedHandle);
        }
      }
    };
    (globalThis as unknown as {
      __PW_SET_LINKED_DISK_TEXT__: (next: string) => void;
      __PW_GET_LINKED_DISK_TEXT__: () => string;
    }).__PW_SET_LINKED_DISK_TEXT__ = (next: string) => {
      diskText = next;
      lastModified += 1;
    };
    (globalThis as unknown as { __PW_GET_LINKED_DISK_TEXT__: () => string }).__PW_GET_LINKED_DISK_TEXT__ = () => diskText;
  });

  await gotoApp(page);
  await openMenuCommand(page, "file", "file.open-document");
  await expect.poll(async () => readSource(page)).toContain("% base");
  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem("tikz-editor:workspace");
    const parsed = raw ? JSON.parse(raw) as { documents?: Array<{ diskRevision?: unknown }> } : null;
    return Boolean(parsed?.documents?.some((doc) => doc.diskRevision));
  })).toBe(true);

  await setSource(page, "\\draw (2,2)--(3,3); % local");
  await page.evaluate(() => {
    (globalThis as unknown as { __PW_SET_LINKED_DISK_TEXT__?: (next: string) => void })
      .__PW_SET_LINKED_DISK_TEXT__?.("\\draw (4,4)--(5,5); % remote");
  });

  await openMenuCommand(page, "file", "file.save-document");
  await expect(page.getByTestId("file-conflict-modal")).toBeVisible();
  await page.getByTestId("file-conflict-save-anyway").click();

  await expect.poll(async () => page.evaluate(() => {
    return (globalThis as unknown as { __PW_GET_LINKED_DISK_TEXT__?: () => string }).__PW_GET_LINKED_DISK_TEXT__?.() ?? "";
  })).toContain("% local");
});

test("export commands smoke and svg copy command writes clipboard text", async ({ page }) => {
  await page.addInitScript(() => {
    const writes: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          writes.push(value);
        }
      }
    });
    (globalThis as unknown as { __PW_CLIPBOARD_WRITES__: string[] }).__PW_CLIPBOARD_WRITES__ = writes;
  });

  await gotoApp(page);
  await openMenuCommand(page, "file", "file.export-svg-download");
  await expect(page.getByRole("heading", { name: "Export SVG" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await openMenuCommand(page, "file", "file.export-png-download");
  await expect(page.getByRole("heading", { name: "Export PNG" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  const pdfDownload = page.waitForEvent("download");
  await openMenuCommand(page, "file", "file.export-pdf-download");
  await pdfDownload;

  const latexDownload = page.waitForEvent("download");
  await openMenuCommand(page, "file", "file.export-standalone-latex-download");
  await latexDownload;

  await openMenuCommand(page, "file", "file.export-svg-copy");
  await expect.poll(async () => (await page.evaluate(() => {
    return (globalThis as unknown as { __PW_CLIPBOARD_WRITES__?: string[] }).__PW_CLIPBOARD_WRITES__ ?? [];
  })).length).toBeGreaterThan(0);
  const clipboardWrites = await page.evaluate(() => {
    return (globalThis as unknown as { __PW_CLIPBOARD_WRITES__?: string[] }).__PW_CLIPBOARD_WRITES__ ?? [];
  });
  expect(clipboardWrites[0]).toContain("<svg");
});

test("close tab unsaved modal supports cancel, discard and save flows", async ({ page }) => {
  await page.addInitScript(() => {
    const writes: string[] = [];
    (globalThis as unknown as { __TIKZ_EDITOR_BROWSER_PLATFORM_ENV__: unknown }).__TIKZ_EDITOR_BROWSER_PLATFORM_ENV__ = {
      fsApi: {
        showSaveFilePicker: async () => ({
          name: "saved.tex",
          createWritable: async () => ({
            write: async (value: string) => {
              writes.push(value);
            },
            close: async () => undefined
          })
        })
      }
    };
    (globalThis as unknown as { __PW_UNSAVED_WRITES__: string[] }).__PW_UNSAVED_WRITES__ = writes;
  });

  await gotoApp(page);
  await openMenuCommand(page, "file", "file.new-document");
  await setSource(page, "\\draw (0,0)--(1,1); % dirty");

  // Cancel branch
  await openMenuCommand(page, "file", "file.close-document");
  await expect(page.getByTestId("unsaved-changes-modal")).toBeVisible();
  await page.getByTestId("unsaved-cancel").click();
  await expect(page.getByTestId("unsaved-changes-modal")).toHaveCount(0);
  await expect(tabSwitchButtons(page)).toHaveCount(2);

  // Discard branch
  await openMenuCommand(page, "file", "file.close-document");
  await page.getByTestId("unsaved-discard").click();
  await expect(tabSwitchButtons(page)).toHaveCount(1);

  // Save branch
  await openMenuCommand(page, "file", "file.new-document");
  await setSource(page, "\\draw (2,2)--(3,3); % dirty-save");
  await openMenuCommand(page, "file", "file.close-document");
  await page.getByTestId("unsaved-save").click();
  await expect(tabSwitchButtons(page)).toHaveCount(1);

  const writes = await page.evaluate(() => {
    return (globalThis as unknown as { __PW_UNSAVED_WRITES__?: string[] }).__PW_UNSAVED_WRITES__ ?? [];
  });
  expect(writes.length).toBeGreaterThan(0);
});

test("help commands open external resources via external url hook", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    const originalOpen = window.open;
    window.open = ((url: string | URL | undefined) => {
      calls.push(String(url ?? ""));
      return null;
    });
    (globalThis as unknown as { __PW_WINDOW_OPEN_CALLS__?: string[] }).__PW_WINDOW_OPEN_CALLS__ = calls;
    (globalThis as unknown as { __PW_WINDOW_OPEN_RESTORE__?: () => void }).__PW_WINDOW_OPEN_RESTORE__ = () => {
      window.open = originalOpen;
    };
  });

  await gotoApp(page);
  await openMenuCommand(page, "help", "help.open-pgf-tikz-manual");
  await openMenuCommand(page, "help", "help.open-github-repository");
  await openMenuCommand(page, "help", "help.open-github-issues");

  const calls = await page.evaluate(() => {
    return (globalThis as unknown as { __PW_WINDOW_OPEN_CALLS__?: string[] }).__PW_WINDOW_OPEN_CALLS__ ?? [];
  });
  expect(calls).toHaveLength(3);
  expect(calls[0]).toContain("https://tikz.dev");
  expect(calls[1]).toContain("https://github.com/DominikPeters/tikz-editor");
  expect(calls[2]).toContain("https://github.com/DominikPeters/tikz-editor/issues");
});
