import { afterEach, describe, expect, it } from "vitest";

import {
  incrementProfilingCounter,
  recordProfilingComputeTiming,
  recordProfilingSourcePanelSyncTiming,
  recordProfilingSvgPatchTiming,
  type TikzEditorProfilingRecorder
} from "../packages/core/src/profiling.js";

describe("profiling recorder helpers", () => {
  afterEach(() => {
    globalThis.__TIKZ_EDITOR_PROFILING_RECORDER__ = undefined;
  });

  it("no-ops when no profiling recorder is installed", () => {
    expect(() => {
      incrementProfilingCounter("parseTikzCalls");
      recordProfilingComputeTiming({ requestId: "r1", kind: "compute", durationMs: 1 });
      recordProfilingSvgPatchTiming({
        durationMs: 2,
        operationCount: 3,
        forceReplaceAll: false,
        hasReplaceAll: false,
        hasReplaceDefs: false
      });
      recordProfilingSourcePanelSyncTiming({
        kind: "externalSyncDispatch",
        durationMs: 4,
        mode: "patch",
        coalescedToAnimationFrame: true,
        patchCount: 1,
        docLength: 10
      });
    }).not.toThrow();
  });

  it("forwards profiling events to the installed recorder", () => {
    const events: unknown[] = [];
    const recorder: TikzEditorProfilingRecorder = {
      incrementCounter: (...args) => events.push(["counter", ...args]),
      recordComputeTiming: (timing) => events.push(["compute", timing]),
      recordSvgPatchTiming: (timing) => events.push(["svg", timing]),
      recordSourcePanelSyncTiming: (timing) => events.push(["sync", timing])
    };
    globalThis.__TIKZ_EDITOR_PROFILING_RECORDER__ = recorder;

    incrementProfilingCounter("parseTikzForEditCalls", 5);
    recordProfilingComputeTiming({ requestId: "r2", kind: "compute", durationMs: 6, incremental: true });
    recordProfilingSvgPatchTiming({
      durationMs: 7,
      operationCount: 8,
      forceReplaceAll: true,
      hasReplaceAll: true,
      hasReplaceDefs: true,
      fallbackReason: "test"
    });
    recordProfilingSourcePanelSyncTiming({
      kind: "externalSyncDispatch",
      durationMs: 9,
      mode: "replace",
      trustedPatch: false,
      coalescedToAnimationFrame: false,
      patchCount: 0,
      docLength: 11
    });

    expect(events).toEqual([
      ["counter", "parseTikzForEditCalls", 5],
      ["compute", { requestId: "r2", kind: "compute", durationMs: 6, incremental: true }],
      ["svg", {
        durationMs: 7,
        operationCount: 8,
        forceReplaceAll: true,
        hasReplaceAll: true,
        hasReplaceDefs: true,
        fallbackReason: "test"
      }],
      ["sync", {
        kind: "externalSyncDispatch",
        durationMs: 9,
        mode: "replace",
        trustedPatch: false,
        coalescedToAnimationFrame: false,
        patchCount: 0,
        docLength: 11
      }]
    ]);
  });
});
