import { create } from "zustand";
import { editorReducer, makeInitialState } from "./reducer";
import type { DocumentFileRef, DocumentSession, EditorAction, EditorState, WorkspacePersistedState } from "./types";
import { loadWorkspaceSeed, saveWorkspace } from "./workspace-storage";
import { workspaceStateFromEditorState } from "./workspace-state";

const HIGH_FREQUENCY_WORKSPACE_SAVE_DELAY_MS = 1000;

export type EditorStore = EditorState & {
  dispatch: (action: EditorAction) => void;
};

export const useEditorStore = create<EditorStore>((set) => ({
  ...makeInitialState(loadWorkspaceSeed() ?? undefined),
  dispatch: (action: EditorAction) => { set((state) => {
    const next = editorReducer(state, action);
    if (shouldSaveWorkspaceImmediately(state, next)) {
      const workspaceState = workspaceStateFromEditorState(next);
      persistWorkspaceNow(workspaceState);
    } else if (shouldScheduleWorkspaceSave(state, next)) {
      const workspaceState = workspaceStateFromEditorState(next);
      scheduleWorkspaceSave(workspaceState);
    }
    return next;
  }); }
}));

function shouldSaveWorkspaceImmediately(previous: EditorState, next: EditorState): boolean {
  if (
    previous.workspaceVersion !== next.workspaceVersion ||
    previous.tabOrder !== next.tabOrder ||
    previous.activeDocumentId !== next.activeDocumentId ||
    previous.recentDocumentIds !== next.recentDocumentIds ||
    Object.keys(previous.documents).length !== Object.keys(next.documents).length ||
    documentsSavedStatusChanged(previous.documents, next.documents)
  ) {
    return true;
  }
  if (typeof window === "undefined" && shouldScheduleWorkspaceSave(previous, next)) {
    return true;
  }
  return false;
}

function shouldScheduleWorkspaceSave(previous: EditorState, next: EditorState): boolean {
  if (previous.documents === next.documents) {
    return false;
  }
  for (const id of Object.keys(next.documents)) {
    const prevDoc = previous.documents[id];
    const nextDoc = next.documents[id];
    if (!prevDoc || persistedDocumentChanged(prevDoc, nextDoc)) {
      return true;
    }
  }
  return false;
}

function documentsSavedStatusChanged(
  previous: Record<string, DocumentSession>,
  next: Record<string, DocumentSession>
): boolean {
  for (const id of Object.keys(next)) {
    const prevDoc = previous[id];
    const nextDoc = next[id];
    if (prevDoc && nextDoc && prevDoc.savedSource !== nextDoc.savedSource) {
      return true;
    }
  }
  return false;
}

function persistedDocumentChanged(previous: DocumentSession, next: DocumentSession): boolean {
  return (
    previous.id !== next.id ||
    previous.title !== next.title ||
    previous.source !== next.source ||
    previous.activeFigureId !== next.activeFigureId ||
    previous.savedSource !== next.savedSource ||
    fileRefChanged(previous.fileRef, next.fileRef) ||
    fileRevisionChanged(previous.diskRevision, next.diskRevision) ||
    previous.lastKnownDiskSource !== next.lastKnownDiskSource ||
    previous.externalChangeStatus !== next.externalChangeStatus ||
    previous.assistantThreadId !== next.assistantThreadId ||
    previous.assistantWorkspacePath !== next.assistantWorkspacePath ||
    previous.assistantFigurePath !== next.assistantFigurePath ||
    previous.assistantPreviewPath !== next.assistantPreviewPath
  );
}

function fileRefChanged(previous: DocumentFileRef | null, next: DocumentFileRef | null): boolean {
  if (previous === next) {
    return false;
  }
  if (!previous || !next) {
    return true;
  }
  return (
    previous.kind !== next.kind ||
    previous.name !== next.name ||
    previous.handleId !== next.handleId ||
    previous.path !== next.path ||
    previous.provider !== next.provider
  );
}

function fileRevisionChanged(
  previous: DocumentSession["diskRevision"],
  next: DocumentSession["diskRevision"]
): boolean {
  if (previous === next) {
    return false;
  }
  if (!previous || !next) {
    return true;
  }
  return previous.hash !== next.hash || previous.mtimeMs !== next.mtimeMs || previous.size !== next.size;
}

let pendingWorkspaceSaveState: WorkspacePersistedState | null = null;
let pendingWorkspaceSaveTimer: number | null = null;
let hasBeforeUnloadSaveHandler = false;

function persistWorkspaceNow(state: WorkspacePersistedState): void {
  clearPendingWorkspaceSaveTimer();
  pendingWorkspaceSaveState = null;
  saveWorkspace(state);
}

function scheduleWorkspaceSave(state: WorkspacePersistedState): void {
  if (typeof window === "undefined") {
    saveWorkspace(state);
    return;
  }
  pendingWorkspaceSaveState = state;
  ensureBeforeUnloadSaveHandler();
  clearPendingWorkspaceSaveTimer();
  pendingWorkspaceSaveTimer = window.setTimeout(flushPendingWorkspaceSave, HIGH_FREQUENCY_WORKSPACE_SAVE_DELAY_MS);
}

function flushPendingWorkspaceSave(): void {
  const state = pendingWorkspaceSaveState;
  clearPendingWorkspaceSaveTimer();
  pendingWorkspaceSaveState = null;
  if (state) {
    saveWorkspace(state);
  }
}

function clearPendingWorkspaceSaveTimer(): void {
  if (pendingWorkspaceSaveTimer == null) {
    return;
  }
  if (typeof window !== "undefined") {
    window.clearTimeout(pendingWorkspaceSaveTimer);
  }
  pendingWorkspaceSaveTimer = null;
}

function ensureBeforeUnloadSaveHandler(): void {
  if (hasBeforeUnloadSaveHandler || typeof window === "undefined") {
    return;
  }
  window.addEventListener("beforeunload", flushPendingWorkspaceSave);
  window.addEventListener("pagehide", flushPendingWorkspaceSave);
  hasBeforeUnloadSaveHandler = true;
}
