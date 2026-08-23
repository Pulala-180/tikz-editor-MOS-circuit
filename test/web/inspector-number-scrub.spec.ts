import { describe, expect, it } from "vitest";
import {
  createNumberScrubState,
  updateNumberScrubState
} from "../../packages/app/src/ui/inspector-panel/number-scrub";

describe("inspector number scrub state", () => {
  it("does not activate before crossing the threshold", () => {
    const state = createNumberScrubState({
      startX: 20,
      startValue: 1,
      step: 0.1
    });

    const result = updateNumberScrubState(state, {
      currentX: 24,
      modifiers: { shiftKey: false, altKey: false }
    });

    expect(result.didActivate).toBe(false);
    expect(result.nextValue).toBeNull();
    expect(result.nextState.hasActivated).toBe(false);
  });

  it("updates scrubbed value deterministically during drag", () => {
    let state = createNumberScrubState({
      startX: 0,
      startValue: 1,
      step: 0.1
    });

    const first = updateNumberScrubState(state, {
      currentX: 10,
      modifiers: { shiftKey: false, altKey: false }
    });
    expect(first.didActivate).toBe(true);
    expect(first.nextValue).toBeCloseTo(1.1, 6);

    state = first.nextState;
    const second = updateNumberScrubState(state, {
      currentX: 18,
      modifiers: { shiftKey: false, altKey: false }
    });
    expect(second.nextValue).toBeCloseTo(1.2, 6);
  });

  it("supports modifier-based sensitivity while scrubbing", () => {
    const state = createNumberScrubState({
      startX: 0,
      startValue: 1,
      step: 0.1
    });

    const shifted = updateNumberScrubState(state, {
      currentX: 16,
      modifiers: { shiftKey: true, altKey: false }
    });
    expect(shifted.nextValue).toBeCloseTo(1.1, 6);

    const accelerated = updateNumberScrubState(state, {
      currentX: 16,
      modifiers: { shiftKey: false, altKey: true }
    });
    expect(accelerated.nextValue).toBeCloseTo(1.8, 6);
  });

  it("supports transient previews and one final commit", () => {
    let state = createNumberScrubState({
      startX: 0,
      startValue: 1,
      step: 0.1
    });

    const operations: string[] = [];
    let currentSource = "base";
    const baseSource = "base";

    const move = (currentX: number) => {
      const result = updateNumberScrubState(state, {
        currentX,
        modifiers: { shiftKey: false, altKey: false }
      });
      state = result.nextState;
      if (result.nextValue != null) {
        currentSource = "preview";
        operations.push(`preview:${result.nextValue.toFixed(1)}`);
      }
    };

    const finish = (commit: boolean) => {
      if (!state.hasActivated) {
        return;
      }
      if (currentSource !== baseSource) {
        operations.push("restore");
        currentSource = baseSource;
      }
      if (commit) {
        operations.push(`commit:${state.lastValue.toFixed(1)}`);
      }
    };

    move(18);
    finish(true);

    expect(operations).toEqual(["preview:1.2", "restore", "commit:1.2"]);
  });
});
