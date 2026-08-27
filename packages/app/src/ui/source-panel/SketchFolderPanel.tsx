import { useState, useEffect } from "react";
import { useEditorStore } from "../../store/store";
import css from "./SketchFolderPanel.module.css";

export type FileTreeItem = {
  name: string;
  relPath: string;
  isDirectory: boolean;
  size?: number;
  mtime?: number;
  children?: FileTreeItem[];
};

// ── Fixed Vector Icons (Zero Jitter & Unified Folder Symbol) ────────────────

function CaretIcon({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ display: "block" }}>
      {open ? (
        <polygon points="2,3 8,3 5,7" />
      ) : (
        <polygon points="3,2 7,5 3,8" />
      )}
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="#f59e0b" style={{ display: "block" }}>
      <path d="M1.5 3A1.5 1.5 0 0 0 0 4.5v8A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H7.414l-1.707-1.707A1 1 0 0 0 5 2.5H1.5z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="#3b82f6" style={{ display: "block" }}>
      <path d="M4 1.5A1.5 1.5 0 0 0 2.5 3v10A1.5 1.5 0 0 0 4 14.5h8a1.5 1.5 0 0 0 1.5-1.5V5.5L9.5 1.5H4zm5 1V5a1 1 0 0 0 1 1h2.5L9 2.5z" />
    </svg>
  );
}

const RECENT_DIRS_KEY = "tikz-editor:recent-sketch-dirs";

function getStoredRecentDirs(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_DIRS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredRecentDirs(dirs: string[]) {
  try {
    localStorage.setItem(RECENT_DIRS_KEY, JSON.stringify(dirs.slice(0, 10)));
  } catch {}
}

export function SketchFolderPanel() {
  const [tree, setTree] = useState<FileTreeItem[]>([]);
  const [currentDir, setCurrentDir] = useState<string>("");
  const [dirName, setDirName] = useState<string>("Sketch");
  const [inputPath, setInputPath] = useState<string>("");
  const [pathError, setPathError] = useState<string | null>(null);
  const [isPickerLoading, setIsPickerLoading] = useState<boolean>(false);
  const [defaultDir, setDefaultDir] = useState<string>("");
  const [parentDir, setParentDir] = useState<string | null>(null);
  const [quickDirs, setQuickDirs] = useState<string[]>([]);
  const [recentDirs, setRecentDirs] = useState<string[]>(getStoredRecentDirs);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("tikz-editor:sketch-collapsed") === "true";
    }
    return false;
  });
  const [showDirSwitcher, setShowDirSwitcher] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFolderRelPath, setSelectedFolderRelPath] = useState<string | null>(null);
  const [renamingRelPath, setRenamingRelPath] = useState<string | null>(null);
  const [renameInputValue, setRenameInputValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    relPath: string;
    isDirectory: boolean;
    name: string;
  } | null>(null);

  const documents = useEditorStore((s) => s.documents);
  const activeDocumentId = useEditorStore((s) => s.activeDocumentId);
  const tabOrder = useEditorStore((s) => s.tabOrder);
  const dispatch = useEditorStore((s) => s.dispatch);

  const activeDoc = documents[activeDocumentId];
  const activeDocTitle = activeDoc?.title ?? "";

  // Subscribe to WebSocket events from Vite agentSyncPlugin
  useEffect(() => {
    if (typeof import.meta === "undefined" || !import.meta.hot) {
      return;
    }
    const hot = import.meta.hot;

    const handleTreeUpdate = (data: {
      currentDir: string;
      dirName: string;
      defaultDir?: string;
      parentDir?: string | null;
      quickDirs?: string[];
      tree: FileTreeItem[];
    }) => {
      if (data && Array.isArray(data.tree)) {
        setTree(data.tree);
        if (data.currentDir) {
          setCurrentDir(data.currentDir);
          setInputPath(data.currentDir);
          setRecentDirs((prev) => {
            const next = [data.currentDir, ...prev.filter((d) => d !== data.currentDir)].slice(0, 10);
            saveStoredRecentDirs(next);
            return next;
          });
        }
        if (data.dirName) setDirName(data.dirName);
        if (data.defaultDir) setDefaultDir(data.defaultDir);
        if (data.parentDir !== undefined) setParentDir(data.parentDir);
        if (Array.isArray(data.quickDirs)) setQuickDirs(data.quickDirs);
        setIsPickerLoading(false);
        setPathError(null);
      }
    };

    const handleFileData = (data: { name: string; relPath: string; content: string }) => {
      const baseTitle = data.name.replace(/\.(tex|tikz)$/i, "");
      const existing = Object.values(documents).find(
        (doc) => doc.title === baseTitle || doc.title === data.name || doc.fileRef?.name === data.name
      );
      if (existing) {
        dispatch({ type: "SWITCH_DOCUMENT", documentId: existing.id });
      } else {
        dispatch({
          type: "NEW_DOCUMENT",
          source: data.content,
          title: baseTitle,
          isExternal: false,
          sketchRelPath: data.relPath
        });
      }
    };

    const handleRenameSuccess = (data: { oldName: string; newName: string; oldRelPath: string; newRelPath: string }) => {
      const oldBase = data.oldName.replace(/\.(tex|tikz)$/i, "");
      const newBase = data.newName.replace(/\.(tex|tikz)$/i, "");
      const existing = Object.values(documents).find(
        (doc) => doc.title === oldBase || doc.title === data.oldName
      );
      if (existing) {
        dispatch({ type: "RENAME_DOCUMENT", documentId: existing.id, title: newBase });
      }
      if (selectedFolderRelPath === data.oldRelPath) {
        setSelectedFolderRelPath(data.newRelPath);
      }
    };

    const handlePickerStatus = (data: {
      status: "opening" | "success" | "cancelled" | "error";
      message?: string;
      selectedPath?: string;
    }) => {
      if (data.status === "opening") {
        setIsPickerLoading(true);
      } else if (data.status === "cancelled") {
        setIsPickerLoading(false);
      } else if (data.status === "error") {
        setIsPickerLoading(false);
        setPathError(data.message || "调起文件夹选择器失败");
      } else if (data.status === "success") {
        setIsPickerLoading(false);
        setShowDirSwitcher(false);
      }
    };

    const handleSwitchDirStatus = (data: { success: boolean; message?: string; targetPath?: string }) => {
      if (!data.success) {
        setPathError(data.message || "切换文件夹失败");
      } else {
        setPathError(null);
        setShowDirSwitcher(false);
      }
    };

    hot.on("sketch:tree-update", handleTreeUpdate);
    hot.on("sketch:file-data", handleFileData);
    hot.on("sketch:rename-success", handleRenameSuccess);
    hot.on("sketch:picker-status", handlePickerStatus);
    hot.on("sketch:switch-dir-status", handleSwitchDirStatus);

    hot.send("sketch:request-tree");

    return () => {
      hot.off("sketch:tree-update", handleTreeUpdate);
      hot.off("sketch:file-data", handleFileData);
      hot.off("sketch:rename-success", handleRenameSuccess);
      hot.off("sketch:picker-status", handlePickerStatus);
      hot.off("sketch:switch-dir-status", handleSwitchDirStatus);
    };
  }, [documents, dispatch, selectedFolderRelPath]);

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("tikz-editor:sketch-collapsed", String(next));
      }
      return next;
    });
  };

  useEffect(() => {
    const handleGlobalClick = () => { setContextMenu(null); };
    window.addEventListener("click", handleGlobalClick);
    return () => { window.removeEventListener("click", handleGlobalClick); };
  }, []);

  const toggleFolder = (relPath: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(relPath)) {
        next.delete(relPath);
      } else {
        next.add(relPath);
      }
      return next;
    });
    setSelectedFolderRelPath(relPath);
  };

  const handleDoubleClickFile = (item: FileTreeItem) => {
    if (item.isDirectory) return;
    const baseTitle = item.name.replace(/\.(tex|tikz)$/i, "");
    const existing = Object.values(documents).find(
      (doc) => doc.title === baseTitle || doc.title === item.name || doc.fileRef?.name === item.name
    );
    if (existing) {
      dispatch({ type: "SWITCH_DOCUMENT", documentId: existing.id });
    } else {
      import.meta.hot?.send("sketch:read", { relPath: item.relPath });
    }
  };

  const handleDeleteItem = (relPath: string, name: string, isDirectory: boolean, e?: React.MouseEvent) => {
    e?.stopPropagation();
    import.meta.hot?.send("sketch:delete", { relPath });

    if (selectedFolderRelPath === relPath) {
      setSelectedFolderRelPath(null);
    }

    const baseTitle = name.replace(/\.(tex|tikz)$/i, "");
    const openDoc = Object.values(documents).find(
      (doc) => doc.title === baseTitle || doc.title === name || doc.fileRef?.name === name
    );
    if (openDoc) {
      const otherTabs = tabOrder.filter((id) => id !== openDoc.id);
      if (otherTabs.length > 0) {
        dispatch({ type: "SWITCH_DOCUMENT", documentId: otherTabs[0] });
      }
      dispatch({ type: "CLOSE_DOCUMENT", documentId: openDoc.id });
      if (otherTabs.length === 0) {
        dispatch({ type: "NEW_DOCUMENT" });
      }
    }
  };

  const handleStartRename = (item: { relPath: string; name: string }, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setContextMenu(null);
    setRenamingRelPath(item.relPath);
    setRenameInputValue(item.name.replace(/\.(tex|tikz)$/i, ""));
  };

  const handleCommitRename = () => {
    if (!renamingRelPath) return;
    const trimmed = renameInputValue.trim();
    if (trimmed.length > 0) {
      const isTex = renamingRelPath.endsWith(".tex") || renamingRelPath.endsWith(".tikz");
      const newFileName = isTex && !trimmed.endsWith(".tex") && !trimmed.endsWith(".tikz") ? `${trimmed}.tex` : trimmed;
      const parentDir = renamingRelPath.includes("/") ? renamingRelPath.substring(0, renamingRelPath.lastIndexOf("/")) : "";
      const newRelPath = parentDir ? `${parentDir}/${newFileName}` : newFileName;

      if (newRelPath !== renamingRelPath) {
        import.meta.hot?.send("sketch:rename", {
          oldRelPath: renamingRelPath,
          newRelPath
        });
      }
    }
    setRenamingRelPath(null);
  };

  const handleCreateNewFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    const targetFolder = selectedFolderRelPath;
    const folderDisplay = targetFolder ? targetFolder.split("/").pop() : "根目录";
    const fileNameInput = window.prompt(`在 [${folderDisplay}] 下新建 TeX 文件名称 (无需输入.tex):`, "");
    if (fileNameInput === null) return;

    const safeTitle = fileNameInput.trim() || `Untitled ${Object.keys(documents).length + 1}`;
    const cleanTitle = safeTitle.replace(/\.(tex|tikz)$/i, "");

    if (targetFolder) {
      setExpandedFolders((prev) => new Set(prev).add(targetFolder));
    }

    import.meta.hot?.send("sketch:create", {
      title: cleanTitle,
      source: "\\begin{tikzpicture}\n\n\\end{tikzpicture}",
      relFolder: targetFolder ?? undefined
    });

    dispatch({
      type: "NEW_DOCUMENT",
      source: "\\begin{tikzpicture}\n\n\\end{tikzpicture}",
      title: cleanTitle
    });
  };

  const handleCreateNewFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    const targetParent = selectedFolderRelPath;
    const parentDisplay = targetParent ? targetParent.split("/").pop() : "根目录";
    const folderName = window.prompt(`在 [${parentDisplay}] 下新建子文件夹名称 (Folder Name):`, "");
    if (folderName && folderName.trim()) {
      if (targetParent) {
        setExpandedFolders((prev) => new Set(prev).add(targetParent));
      }
      import.meta.hot?.send("sketch:create-folder", {
        parentRelPath: targetParent ?? undefined,
        folderName: folderName.trim()
      });
    }
  };

  const handleSwitchDir = (targetPath: string) => {
    setPathError(null);
    import.meta.hot?.send("sketch:switch-dir", { dirPath: targetPath });
  };

  const handleSwitchToInputPath = () => {
    const trimmed = inputPath.trim();
    if (!trimmed) {
      setPathError("请输入有效文件夹路径");
      return;
    }
    handleSwitchDir(trimmed);
  };

  const handleOpenNativeFolderDialog = () => {
    setIsPickerLoading(true);
    setPathError(null);
    import.meta.hot?.send("sketch:open-folder-dialog");
  };

  const handleRestoreDefaultSketchDir = () => {
    handleSwitchDir("");
    setSelectedFolderRelPath(null);
  };

  const handleContextMenu = (e: React.MouseEvent, item: FileTreeItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (item.isDirectory) {
      setSelectedFolderRelPath(item.relPath);
    }
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      relPath: item.relPath,
      isDirectory: item.isDirectory,
      name: item.name
    });
  };

  // Recursive Tree Node component with files on top and subfolders below
  const renderTreeNode = (item: FileTreeItem, depth = 0) => {
    const indentPx = depth * 14 + 6;
    const isRenaming = renamingRelPath === item.relPath;

    if (item.isDirectory) {
      const isExpanded = expandedFolders.has(item.relPath);
      const isSelected = selectedFolderRelPath === item.relPath;

      return (
        <div key={item.relPath}>
          <div
            className={[
              css.treeRow,
              isSelected ? css.treeRowFolderSelected : ""
            ].filter(Boolean).join(" ")}
            style={{ paddingLeft: `${indentPx}px` }}
            onClick={(e) => { toggleFolder(item.relPath, e); }}
            onContextMenu={(e) => { handleContextMenu(e, item); }}
            title={`文件夹: ${item.relPath} (已选中)\n点击选中并在其下创建文件，右键重命名或删除`}
          >
            <div className={css.treeRowLeft}>
              <span className={css.caret}><CaretIcon open={isExpanded} /></span>
              <span className={css.icon}><FolderIcon /></span>
              {isRenaming ? (
                <input
                  autoFocus
                  type="text"
                  className={css.renameInput}
                  value={renameInputValue}
                  onChange={(e) => { setRenameInputValue(e.target.value); }}
                  onBlur={handleCommitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCommitRename();
                    if (e.key === "Escape") setRenamingRelPath(null);
                  }}
                  onClick={(e) => { e.stopPropagation(); }}
                />
              ) : (
                <span className={`${css.nodeName} ${css.folderName}`}>
                  {item.name}
                  {isSelected && <span style={{ fontSize: "9px", marginLeft: "4px", opacity: 0.75 }}>[选定]</span>}
                </span>
              )}
            </div>
            <div className={css.treeRowRight}>
              <button
                type="button"
                className={css.deleteBtn}
                onClick={(e) => { handleDeleteItem(item.relPath, item.name, true, e); }}
                title="删除该文件夹及其所有内容"
              >
                ✕
              </button>
            </div>
          </div>

          {isExpanded && item.children && item.children.length > 0 && (
            <div>
              {item.children.map((child) => renderTreeNode(child, depth + 1))}
            </div>
          )}
          {isExpanded && (!item.children || item.children.length === 0) && (
            <div className={css.emptyHint} style={{ paddingLeft: `${indentPx + 24}px` }}>
              (空文件夹)
            </div>
          )}
        </div>
      );
    }

    // File Node
    const baseName = item.name.replace(/\.(tex|tikz)$/i, "");
    const isActive =
      activeDocTitle === baseName ||
      activeDocTitle === item.name ||
      activeDoc?.fileRef?.name === item.name;

    return (
      <div
        key={item.relPath}
        className={[css.treeRow, isActive ? css.treeRowActive : ""].filter(Boolean).join(" ")}
        style={{ paddingLeft: `${indentPx + 16}px` }}
        onDoubleClick={() => { handleDoubleClickFile(item); }}
        onContextMenu={(e) => { handleContextMenu(e, item); }}
        title={`双击打开: ${item.relPath}\n右键重命名`}
      >
        <div className={css.treeRowLeft}>
          <span className={css.icon}><FileIcon /></span>
          {isRenaming ? (
            <input
              autoFocus
              type="text"
              className={css.renameInput}
              value={renameInputValue}
              onChange={(e) => { setRenameInputValue(e.target.value); }}
              onBlur={handleCommitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCommitRename();
                if (e.key === "Escape") setRenamingRelPath(null);
              }}
              onClick={(e) => { e.stopPropagation(); }}
            />
          ) : (
            <span className={css.nodeName}>{item.name}</span>
          )}
        </div>
        <div className={css.treeRowRight}>
          <button
            type="button"
            className={css.deleteBtn}
            onClick={(e) => { handleDeleteItem(item.relPath, item.name, false, e); }}
            title="删除该草稿文件"
          >
            ✕
          </button>
        </div>
      </div>
    );
  };

  const selectedFolderName = selectedFolderRelPath ? selectedFolderRelPath.split("/").pop() : null;

  return (
    <div className={[css.container, isCollapsed ? css.containerCollapsed : ""].filter(Boolean).join(" ")}>
      {/* Header bar */}
      <div className={css.header}>
        <div
          className={css.headerLeft}
          onClick={() => { setShowDirSwitcher((prev) => !prev); }}
          title={`当前工作目录: ${currentDir || "Sketch"}\n点击打开文件夹切换菜单`}
        >
          <span className={css.icon}><FolderIcon /></span>
          <span className={css.headerTitle}>{dirName}</span>
          <span className={css.pathTag} title={currentDir}>{currentDir.split(/[\\/]/).pop() || "Sketch"}</span>
          <span style={{ fontSize: "9px", opacity: 0.7 }}>▾</span>
        </div>

        <div className={css.headerActions}>
          {selectedFolderName && (
            <span
              className={css.selectedTargetBadge}
              title={`当前选定子目录: ${selectedFolderRelPath}\n点击取消选定(切回根目录)`}
              onClick={() => { setSelectedFolderRelPath(null); }}
              style={{ cursor: "pointer" }}
            >
              📁 {selectedFolderName} ✕
            </span>
          )}
          <button
            type="button"
            className={[css.actionBtn, selectedFolderRelPath ? css.actionBtnActive : ""].filter(Boolean).join(" ")}
            onClick={handleCreateNewFolder}
            title={selectedFolderName ? `在 [${selectedFolderName}] 下新建子文件夹` : "在根目录下新建子文件夹"}
          >
            📁+
          </button>
          <button
            type="button"
            className={[css.actionBtn, selectedFolderRelPath ? css.actionBtnActive : ""].filter(Boolean).join(" ")}
            onClick={handleCreateNewFile}
            title={selectedFolderName ? `在 [${selectedFolderName}] 下新建 TeX 文件` : "在根目录下新建 TeX 文件"}
          >
            ➕
          </button>
          <button
            type="button"
            className={css.actionBtn}
            onClick={toggleCollapsed}
            title={isCollapsed ? "展开目录" : "收起目录"}
          >
            {isCollapsed ? "▼ 展开" : "▲ 收起"}
          </button>
        </div>
      </div>

      {/* Modern Folder Switcher Popover */}
      {showDirSwitcher && (
        <div className={css.pathSwitcherModal}>
          <div className={css.browseBtnRow}>
            <button
              type="button"
              className={css.nativeBrowseBtn}
              onClick={handleOpenNativeFolderDialog}
              disabled={isPickerLoading}
              title="调出系统文件资源管理器窗口选择文件夹"
            >
              {isPickerLoading ? "⏳ 正在调出窗口..." : "📂 浏览选择文件夹..."}
            </button>
            <button
              type="button"
              className={css.restoreDefaultBtn}
              onClick={handleRestoreDefaultSketchDir}
              title="一键切回项目默认的 Sketch 草稿目录"
            >
              ⭐ 默认 Sketch
            </button>
          </div>

          <div className={css.pathInputRow}>
            <input
              type="text"
              className={css.pathInput}
              value={inputPath}
              placeholder="输入或粘贴文件夹完整绝对路径..."
              onChange={(e) => {
                setInputPath(e.target.value);
                setPathError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSwitchToInputPath();
              }}
            />
            <button
              type="button"
              className={css.switchGoBtn}
              onClick={handleSwitchToInputPath}
              title="前往并加载该文件夹下的 TeX 文件"
            >
              前往
            </button>
          </div>

          {pathError && (
            <div className={css.pathErrorMsg}>
              ⚠️ {pathError}
            </div>
          )}

          {/* Quick directories */}
          <div className={css.quickDirsRow}>
            <span className={css.quickDirLabel}>快捷:</span>
            {parentDir && parentDir !== currentDir && (
              <button
                type="button"
                className={css.quickChip}
                onClick={() => handleSwitchDir(parentDir)}
                title={`上一级: ${parentDir}`}
              >
                ⬆ 上一级
              </button>
            )}
            {quickDirs
              .filter((d) => d && d !== currentDir && d !== defaultDir)
              .slice(0, 4)
              .map((d) => {
                const base = d.split(/[\\/]/).pop() || d;
                return (
                  <button
                    key={d}
                    type="button"
                    className={css.quickChip}
                    onClick={() => handleSwitchDir(d)}
                    title={`切换到: ${d}`}
                  >
                    📁 {base}
                  </button>
                );
              })}
            {recentDirs
              .filter((d) => d && d !== currentDir && d !== defaultDir && !quickDirs.includes(d))
              .slice(0, 3)
              .map((d) => {
                const base = d.split(/[\\/]/).pop() || d;
                return (
                  <button
                    key={d}
                    type="button"
                    className={css.quickChip}
                    onClick={() => handleSwitchDir(d)}
                    title={`历史: ${d}`}
                  >
                    🕒 {base}
                  </button>
                );
              })}
          </div>

          <div className={css.currentPathDisplay} title={currentDir}>
            当前路径: {currentDir || "Sketch"}
          </div>
        </div>
      )}

      {/* Body / Tree List */}
      {!isCollapsed && (
        <>
          <div
            className={css.treeBody}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setSelectedFolderRelPath(null);
              }
            }}
          >
            {tree.length === 0 ? (
              <div className={css.emptyHint}>该目录暂无 .tex 文件或文件夹</div>
            ) : (
              tree.map((item) => renderTreeNode(item, 0))
            )}
          </div>

          {/* Bottom collapse handle */}
          <div
            className={css.bottomCollapseBar}
            onClick={toggleCollapsed}
            title="收起目录面板"
          >
            ▲ 收起目录
          </div>
        </>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className={css.contextMenu}
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => { e.stopPropagation(); }}
        >
          <div
            className={css.contextMenuItem}
            onClick={(e) => { handleStartRename(contextMenu, e); }}
          >
            ✏️ 重命名
          </div>
          <div
            className={css.contextMenuItem}
            style={{ color: "var(--color-error, #ef4444)" }}
            onClick={(e) => {
              handleDeleteItem(contextMenu.relPath, contextMenu.name, contextMenu.isDirectory, e);
              setContextMenu(null);
            }}
          >
            🗑️ 删除{contextMenu.isDirectory ? "文件夹" : "文件"}
          </div>
        </div>
      )}
    </div>
  );
}
