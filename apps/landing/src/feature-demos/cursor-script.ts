import type gsap from "gsap";
import type { CursorStyle } from "./cursor-overlay";

export type CursorFrame = {
  x: number;
  y: number;
  visible: boolean;
  pressed: boolean;
  cursor: CursorStyle;
};

export type CursorScript = {
  moveTo: (x: number, y: number, duration?: number, position?: string | number, ease?: string) => CursorScript;
  glideTo: (x: number, y: number, duration?: number, position?: string | number, ease?: string) => CursorScript;
  setFrame: (frame: Partial<CursorFrame>, position?: string | number) => CursorScript;
  setStyle: (cursor: CursorStyle, position?: string | number) => CursorScript;
  setPressed: (pressed: boolean, position?: string | number) => CursorScript;
  setVisible: (visible: boolean, position?: string | number) => CursorScript;
};

export type CursorCommitters = {
  onPositionChange?: () => void;
  onFrameChange?: () => void;
};

export function createCursorScript(
  timeline: gsap.core.Timeline,
  state: CursorFrame,
  committers: CursorCommitters
): CursorScript {
  const commitPosition = (): void => {
    committers.onPositionChange?.();
  };
  const commitFrame = (): void => {
    committers.onFrameChange?.();
  };

  const api: CursorScript = {
    moveTo(x, y, duration = 0.3, position, ease = "power1.inOut") {
      timeline.to(
        state,
        {
          x,
          y,
          duration,
          ease,
          onStart: commitPosition,
          onUpdate: commitPosition,
          onComplete: () => {
            state.x = x;
            state.y = y;
            commitPosition();
          }
        },
        position
      );
      return api;
    },
    glideTo(x, y, duration = 0.42, position, ease = "power2.inOut") {
      let fromX = state.x;
      let fromY = state.y;
      let bend = createSubtleCursorBend(fromX, fromY, x, y);
      timeline.to(
        state,
        {
          x,
          y,
          duration,
          ease,
          onStart: () => {
            fromX = state.x;
            fromY = state.y;
            bend = createSubtleCursorBend(fromX, fromY, x, y);
            commitPosition();
          },
          onUpdate: () => {
            const progress = cursorLineProgress(fromX, fromY, x, y, state.x, state.y);
            const amount = 4 * progress * (1 - progress) * bend.offset;
            state.x += bend.normalX * amount;
            state.y += bend.normalY * amount;
            commitPosition();
          },
          onComplete: () => {
            state.x = x;
            state.y = y;
            commitPosition();
          }
        },
        position
      );
      return api;
    },
    setFrame(frame, position) {
      timeline.call(() => {
        if (!assignCursorPatchIfChanged(state, frame)) {
          return;
        }
        commitFrame();
      }, undefined, position);
      return api;
    },
    setStyle(cursor, position) {
      timeline.call(() => {
        if (state.cursor === cursor) {
          return;
        }
        state.cursor = cursor;
        commitFrame();
      }, undefined, position);
      return api;
    },
    setPressed(pressed, position) {
      timeline.call(() => {
        if (state.pressed === pressed) {
          return;
        }
        state.pressed = pressed;
        commitFrame();
      }, undefined, position);
      return api;
    },
    setVisible(visible, position) {
      timeline.call(() => {
        if (state.visible === visible) {
          return;
        }
        state.visible = visible;
        commitFrame();
      }, undefined, position);
      return api;
    }
  };

  return api;
}

type CursorBend = {
  normalX: number;
  normalY: number;
  offset: number;
};

function createSubtleCursorBend(fromX: number, fromY: number, toX: number, toY: number): CursorBend {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.hypot(dx, dy);
  if (distance < 28) {
    return { normalX: 0, normalY: 0, offset: 0 };
  }
  const bend = Math.min(3, Math.max(0.9, distance * 0.025));
  const sign = cursorBendSign(fromX, fromY, toX, toY);
  return {
    normalX: (-dy / distance) * sign,
    normalY: (dx / distance) * sign,
    offset: bend
  };
}

function cursorLineProgress(fromX: number, fromY: number, toX: number, toY: number, x: number, y: number): number {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return 1;
  }
  return Math.max(0, Math.min(1, ((x - fromX) * dx + (y - fromY) * dy) / lengthSquared));
}

function cursorBendSign(fromX: number, fromY: number, toX: number, toY: number): 1 | -1 {
  const hash = Math.round(fromX * 13 + fromY * 17 + toX * 19 + toY * 23);
  return hash % 2 === 0 ? 1 : -1;
}

function assignCursorPatchIfChanged(target: CursorFrame, patch: Partial<CursorFrame>): boolean {
  let changed = false;
  if (patch.x !== undefined && target.x !== patch.x) {
    target.x = patch.x;
    changed = true;
  }
  if (patch.y !== undefined && target.y !== patch.y) {
    target.y = patch.y;
    changed = true;
  }
  if (patch.visible !== undefined && target.visible !== patch.visible) {
    target.visible = patch.visible;
    changed = true;
  }
  if (patch.pressed !== undefined && target.pressed !== patch.pressed) {
    target.pressed = patch.pressed;
    changed = true;
  }
  if (patch.cursor !== undefined && target.cursor !== patch.cursor) {
    target.cursor = patch.cursor;
    changed = true;
  }
  return changed;
}
