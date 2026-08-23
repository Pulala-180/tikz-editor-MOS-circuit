import { describe, expect, it } from "vitest";
import type { DocumentSession } from "../packages/app/src/store/types.js";
import { collectDirtyDocumentIdsForIntent, summarizeSaveStatuses } from "../packages/app/src/ui/close-guard.js";

function makeDoc(id: string, dirty: boolean): DocumentSession {
  return {
    id,
    title: id,
    source: "\\draw (0,0)--(1,1);",
    snapshot: {} as DocumentSession["snapshot"],
    pendingRequestId: null,
    lastEditChangedSourceIds: null,
    lastEditChangeToken: 0,
    history: [],
    historyIndex: -1,
    selectedElementIds: new Set(),
    fileRef: null,
    savedSource: "\\draw (0,0)--(1,1);",
    dirty
  } as unknown as DocumentSession;
}

describe("close guard helpers", () => {
  it("collects dirty document for single close intent", () => {
    const docs = {
      a: makeDoc("a", true),
      b: makeDoc("b", false)
    };
    expect(
      collectDirtyDocumentIdsForIntent({ kind: "close-document", documentId: "a" }, docs, ["a", "b"])
    ).toEqual(["a"]);
    expect(
      collectDirtyDocumentIdsForIntent({ kind: "close-document", documentId: "b" }, docs, ["a", "b"])
    ).toEqual([]);
  });

  it("collects all dirty documents for close-all and window-close intents", () => {
    const docs = {
      a: makeDoc("a", true),
      b: makeDoc("b", false),
      c: makeDoc("c", true)
    };
    expect(
      collectDirtyDocumentIdsForIntent({ kind: "close-all" }, docs, ["a", "b", "c"])
    ).toEqual(["a", "c"]);
    expect(
      collectDirtyDocumentIdsForIntent({ kind: "window-close" }, docs, ["a", "b", "c"])
    ).toEqual(["a", "c"]);
  });

  it("summarizes save outcomes with failed precedence over cancelled", () => {
    expect(summarizeSaveStatuses(["saved", "saved"])).toBe("saved");
    expect(summarizeSaveStatuses(["saved", "cancelled"])).toBe("cancelled");
    expect(summarizeSaveStatuses(["cancelled", "failed"])).toBe("failed");
  });
});
