import { describe, expect, it } from "vitest";

import {
  decideLinkedFileRefresh,
  hashTextForRevision,
  revisionForText,
  revisionsMatch
} from "../packages/app/src/linked-file-sync.js";
import { createDocumentSession } from "../packages/app/src/store/workspace-state.js";
import type { DocumentSession, FileRevision } from "../packages/app/src/store/types.js";

function linkedDoc(params: {
  source: string;
  savedSource?: string;
  diskSource?: string;
  diskRevision?: FileRevision;
  dirty?: boolean;
  externalChangeStatus?: DocumentSession["externalChangeStatus"];
}): DocumentSession {
  const source = params.source;
  const diskSource = params.diskSource ?? params.savedSource ?? source;
  const doc = createDocumentSession({
    source,
    title: "linked.tex",
    fileRef: {
      kind: "file",
      name: "linked.tex",
      path: "/tmp/linked.tex",
      provider: "desktop-fs"
    },
    diskRevision: params.diskRevision ?? revisionForText(diskSource),
    lastKnownDiskSource: diskSource,
    externalChangeStatus: params.externalChangeStatus ?? "none"
  });
  doc.savedSource = params.savedSource ?? diskSource;
  doc.dirty = params.dirty ?? source !== doc.savedSource;
  return doc;
}

describe("linked file sync decisions", () => {
  it("hashes text deterministically", () => {
    expect(hashTextForRevision("abc")).toBe(hashTextForRevision("abc"));
    expect(hashTextForRevision("abc")).not.toBe(hashTextForRevision("abcd"));
  });

  it("compares complete revisions", () => {
    const left = revisionForText("a", { mtimeMs: 1, size: 1 });
    expect(revisionsMatch(left, { ...left })).toBe(true);
    expect(revisionsMatch(left, { ...left, mtimeMs: 2 })).toBe(false);
  });

  it("returns no-change for unchanged linked files", () => {
    const doc = linkedDoc({ source: "same" });
    const decision = decideLinkedFileRefresh(doc, {
      status: "ok",
      source: "same",
      revision: doc.diskRevision!,
      fileRef: doc.fileRef!
    });
    expect(decision.kind).toBe("no-change");
  });

  it("reloads clean documents when disk changed", () => {
    const doc = linkedDoc({ source: "base" });
    const revision = revisionForText("remote");
    const decision = decideLinkedFileRefresh(doc, {
      status: "ok",
      source: "remote",
      revision,
      fileRef: doc.fileRef!
    });
    expect(decision).toEqual({
      kind: "reload",
      source: "remote",
      revision,
      fileRef: doc.fileRef
    });
  });

  it("marks dirty documents as changed when disk changed", () => {
    const doc = linkedDoc({ source: "local", savedSource: "base", dirty: true });
    const revision = revisionForText("remote");
    const decision = decideLinkedFileRefresh(doc, {
      status: "ok",
      source: "remote",
      revision,
      fileRef: doc.fileRef!
    });
    expect(decision.kind).toBe("mark-status");
    if (decision.kind === "mark-status") {
      expect(decision.externalChangeStatus).toBe("changed");
    }
  });

  it("maps missing and permission failures to document status", () => {
    const doc = linkedDoc({ source: "base" });
    expect(decideLinkedFileRefresh(doc, { status: "missing" })).toEqual({
      kind: "mark-status",
      externalChangeStatus: "missing"
    });
    expect(decideLinkedFileRefresh(doc, { status: "permission-needed" })).toEqual({
      kind: "mark-status",
      externalChangeStatus: "permission-needed"
    });
  });
});
