import { describe, expect, it } from "vitest";
import gsap from "gsap";
import { createCursorScript, type CursorFrame } from "../apps/landing/src/feature-demos/cursor-script";

describe("landing cursor script", () => {
  it("commits imperative position changes during direct cursor movement", () => {
    const state: CursorFrame = {
      x: 0,
      y: 0,
      visible: true,
      pressed: false,
      cursor: "pointer"
    };
    const positions: CursorFrame[] = [];
    const timeline = gsap.timeline({ paused: true });
    const cursor = createCursorScript(timeline, state, {
      onPositionChange: () => {
        positions.push({ ...state });
      }
    });

    cursor.moveTo(10, 0, 1, 0, "none");

    timeline.progress(0.5);

    expect(state.x).toBeGreaterThan(0);
    expect(state.x).toBeLessThan(10);
    expect(positions.at(-1)?.x).toBe(state.x);
  });

  it("commits imperative position changes during cursor glides", () => {
    const state: CursorFrame = {
      x: 0,
      y: 0,
      visible: true,
      pressed: false,
      cursor: "pointer"
    };
    const positions: CursorFrame[] = [];
    const timeline = gsap.timeline({ paused: true });
    const cursor = createCursorScript(timeline, state, {
      onPositionChange: () => {
        positions.push({ ...state });
      }
    });

    cursor.glideTo(16, 4, 1, 0, "none");

    timeline.progress(0.5);

    expect(state.x).toBeGreaterThan(0);
    expect(state.x).toBeLessThan(16);
    expect(positions.at(-1)).toMatchObject({ x: state.x, y: state.y });
  });

  it("adds only a subtle bend to longer cursor glide paths", () => {
    const state: CursorFrame = {
      x: 0,
      y: 0,
      visible: true,
      pressed: false,
      cursor: "pointer"
    };
    const timeline = gsap.timeline({ paused: true });
    const cursor = createCursorScript(timeline, state, {});

    cursor.glideTo(100, 0, 1, 0, "none");

    timeline.progress(0.5);

    expect(state.x).toBeCloseTo(50, 2);
    expect(Math.abs(state.y)).toBeGreaterThan(0.5);
    expect(Math.abs(state.y)).toBeLessThanOrEqual(3);

    timeline.progress(1);

    expect(state).toMatchObject({ x: 100, y: 0 });
  });
});
