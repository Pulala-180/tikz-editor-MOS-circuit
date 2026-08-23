import { describe, expect, it } from "vitest";
import {
  buildSnapshotEditSourceFingerprint,
  buildSourceRevisionFingerprint
} from "../../packages/app/src/source-identity";

describe("source revision fingerprints", () => {
  it("separates documents that share a revision and source length", () => {
    const first = buildSourceRevisionFingerprint({
      documentId: "doc-a",
      sourceRevision: 7,
      sourceLength: 120
    });
    const second = buildSourceRevisionFingerprint({
      documentId: "doc-b",
      sourceRevision: 7,
      sourceLength: 120
    });

    expect(first).toBe("source-revision:doc-a:7:120");
    expect(second).toBe("source-revision:doc-b:7:120");
    expect(first).not.toBe(second);
  });

  it("falls back to content hashing when revision identity is incomplete", () => {
    expect(
      buildSourceRevisionFingerprint({
        documentId: "doc-a",
        sourceRevision: null,
        sourceLength: 120
      })
    ).toBeUndefined();
    expect(
      buildSourceRevisionFingerprint({
        documentId: null,
        sourceRevision: 7,
        sourceLength: 120
      })
    ).toBeUndefined();
  });

  it("does not force revision identities onto content-hash snapshots", () => {
    expect(
      buildSnapshotEditSourceFingerprint({
        documentId: "doc-a",
        sourceRevision: 7,
        sourceLength: 120,
        sourceRefs: [{ sourceFingerprint: "fnv1a32:12345678:120" }]
      })
    ).toBeUndefined();
    expect(
      buildSnapshotEditSourceFingerprint({
        documentId: "doc-a",
        sourceRevision: 7,
        sourceLength: 120,
        sourceRefs: [{ sourceFingerprint: "source-revision:doc-a:7:120" }]
      })
    ).toBe("source-revision:doc-a:7:120");
  });
});
