import { describe, expect, it } from "vitest";
import type { OptionListAst } from "../../packages/core/src/options/types.js";
import type { StyleChainEntry } from "../../packages/core/src/semantic/style-chain.js";
import {
  cloneResolvedStyle,
  cloneStyleChain,
  cloneStyleChainEntry,
  diffResolvedStyle
} from "../../packages/core/src/semantic/style-chain.js";
import { defaultStyle } from "../../packages/core/src/semantic/style/defaults.js";

function makeOptionList(raw = "draw"): OptionListAst {
  return {
    span: { from: 0, to: raw.length },
    raw,
    entries: [
      {
        kind: "flag",
        key: raw,
        raw,
        span: { from: 0, to: raw.length }
      }
    ]
  };
}

function makeStyleChainEntry(): StyleChainEntry {
  const before = defaultStyle();
  const after = { ...before, lineWidth: 2, dashArray: [3, 2] };
  return {
    kind: "command",
    sourceRef: {
      sourceId: "source-id",
      sourceSpan: { from: 1, to: 2 },
      sourceKind: "path-statement",
      label: "draw"
    },
    rawOptions: [makeOptionList()],
    before,
    after,
    resolvedContributions: diffResolvedStyle(before, after)
  };
}

describe("style chain structural sharing", () => {
  it("shares resolved style snapshots by reference", () => {
    const style = defaultStyle();
    expect(cloneResolvedStyle(style)).toBe(style);
  });

  it("copies only style-chain containers", () => {
    const entry = makeStyleChainEntry();
    const chain = [entry];
    const cloned = cloneStyleChain(chain);

    expect(cloned).not.toBe(chain);
    expect(cloned[0]).toBe(entry);
  });

  it("preserves entry data via structural sharing", () => {
    const entry = makeStyleChainEntry();
    const cloned = cloneStyleChainEntry(entry);

    expect(cloned).not.toBe(entry);
    expect(cloned.rawOptions).not.toBe(entry.rawOptions);
    expect(cloned.rawOptions[0]).toBe(entry.rawOptions[0]);
    expect(cloned.before).toBe(entry.before);
    expect(cloned.after).toBe(entry.after);
    expect(cloned.resolvedContributions).not.toBe(entry.resolvedContributions);
    expect(cloned.resolvedContributions.dashArray).toBe(entry.resolvedContributions.dashArray);
  });

  it("keeps diff values as shared references", () => {
    const before = defaultStyle();
    const nextDecoration = {
      ...before.decoration,
      params: { ...before.decoration.params, amplitude: "5pt" }
    };
    const nextDashArray = [1, 2, 3];
    const after = {
      ...before,
      dashArray: nextDashArray,
      decoration: nextDecoration
    };
    const diff = diffResolvedStyle(before, after);

    expect(diff.dashArray).toBe(nextDashArray);
    expect(diff.decoration).toBe(nextDecoration);
  });
});
