import type { DocumentSession } from "../store/types";

export type CloseIntent =
  | { kind: "close-document"; documentId: string }
  | { kind: "close-all" }
  | { kind: "window-close" };

export type SaveStatus = "saved" | "cancelled" | "failed";

export function collectDirtyDocumentIdsForIntent(
  intent: CloseIntent,
  documents: Record<string, DocumentSession>,
  tabOrder: string[]
): string[] {
  const isDocUnsavedDraft = (doc?: DocumentSession): boolean => {
    if (!doc) return false;
    return Boolean(doc.dirty || doc.fileRef == null);
  };

  if (intent.kind === "close-document") {
    const doc = documents[intent.documentId];
    return isDocUnsavedDraft(doc) ? [intent.documentId] : [];
  }
  return tabOrder.filter((id) => isDocUnsavedDraft(documents[id]));
}

export function summarizeSaveStatuses(statuses: SaveStatus[]): SaveStatus {
  if (statuses.includes("failed")) {
    return "failed";
  }
  if (statuses.includes("cancelled")) {
    return "cancelled";
  }
  return "saved";
}
