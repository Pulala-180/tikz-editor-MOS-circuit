import type { CursorScript } from "../cursor-script";
import type { Point } from "./points";

export type CursorWaypoints = Record<string, Point>;

export type CursorPathScript = {
  jumpTo: (name: string, position?: string | number) => CursorPathScript;
  moveTo: (
    name: string,
    duration?: number,
    position?: string | number,
    ease?: string
  ) => CursorPathScript;
  glideTo: (
    name: string,
    duration?: number,
    position?: string | number,
    ease?: string
  ) => CursorPathScript;
};

export function createCursorPathScript(cursor: CursorScript, waypoints: CursorWaypoints): CursorPathScript {
  const get = (name: string): Point => {
    const waypoint = waypoints[name];
    if (!waypoint) {
      throw new Error(`Unknown cursor waypoint: ${name}`);
    }
    return waypoint;
  };

  const api: CursorPathScript = {
    jumpTo(name, position) {
      const p = get(name);
      cursor.setFrame({ x: p.x, y: p.y }, position);
      return api;
    },
    moveTo(name, duration = 0.3, position, ease = "power1.inOut") {
      const p = get(name);
      cursor.moveTo(p.x, p.y, duration, position, ease);
      return api;
    },
    glideTo(name, duration = 0.42, position, ease = "power2.inOut") {
      const p = get(name);
      cursor.glideTo(p.x, p.y, duration, position, ease);
      return api;
    }
  };

  return api;
}
