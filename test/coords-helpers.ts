import {
  clientBounds,
  clientPoint,
  clientVector,
  frameLocalPoint,
  frameLocalVector,
  pt,
  px,
  sourceCmPoint,
  svgBounds,
  svgPoint,
  svgVector,
  viewportBounds,
  viewportPoint,
  viewportVector,
  worldBounds,
  worldPoint,
  worldVector
} from "../packages/core/src/coords/index.js";
import { cm } from "../packages/core/src/coords/scalars.js";

export const wp = (x: number, y: number) => worldPoint(pt(x), pt(y));
export const wv = (x: number, y: number) => worldVector(pt(x), pt(y));
export const wb = (minX: number, minY: number, maxX: number, maxY: number) =>
  worldBounds(pt(minX), pt(minY), pt(maxX), pt(maxY));

export const sp = (x: number, y: number) => svgPoint(pt(x), pt(y));
export const sv = (x: number, y: number) => svgVector(pt(x), pt(y));
export const sb = (minX: number, minY: number, maxX: number, maxY: number) =>
  svgBounds(pt(minX), pt(minY), pt(maxX), pt(maxY));

export const vp = (x: number, y: number) => viewportPoint(px(x), px(y));
export const vv = (x: number, y: number) => viewportVector(px(x), px(y));
export const vb = (minX: number, minY: number, maxX: number, maxY: number) =>
  viewportBounds(px(minX), px(minY), px(maxX), px(maxY));

export const cp = (x: number, y: number) => clientPoint(px(x), px(y));
export const cv = (x: number, y: number) => clientVector(px(x), px(y));
export const cb = (minX: number, minY: number, maxX: number, maxY: number) =>
  clientBounds(px(minX), px(minY), px(maxX), px(maxY));

export const flp = (x: number, y: number) => frameLocalPoint(pt(x), pt(y));
export const flv = (x: number, y: number) => frameLocalVector(pt(x), pt(y));
export const scp = (x: number, y: number) => sourceCmPoint(cm(x), cm(y));
