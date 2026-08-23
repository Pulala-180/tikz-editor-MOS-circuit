import { describe, expect, it } from "vitest";

import {
  absScalar,
  addScalar,
  applyFrameToWorldPoint,
  applyFrameToWorldVector,
  applyWorldToFramePoint,
  applyWorldToFrameVector,
  clampScalar,
  clientBounds,
  clientPoint,
  clientVector,
  cm,
  cmToPt,
  divScalar,
  frameLocalPoint,
  frameLocalVector,
  frameToWorldTransform,
  invertFrameToWorldTransform,
  mapWorldTransformToSvgTransform,
  maxScalar,
  minScalar,
  negScalar,
  pt,
  ptToCm,
  px,
  pxToPt,
  scaleScalar,
  scalarValue,
  sourceCmPoint,
  subScalar,
  svgBounds,
  svgPoint,
  svgToWorldPoint,
  svgToWorldTransform,
  textRectLocalPoint,
  textareaLocalPoint,
  viewportBounds,
  viewportPoint,
  viewportVector,
  worldBounds,
  worldPoint,
  worldToFrameLocal,
  worldToSvgBounds,
  worldToSvgPoint,
  worldToSvgTransform,
  worldToSvgY,
  worldTransform,
  worldVector,
  worldVectorToFrameLocal
} from "../packages/core/src/coords/index.js";
import { anchorToWorldTransform } from "../packages/core/src/coords/transforms.js";

describe("coordinate scalar helpers", () => {
  it("preserves branded scalar values through arithmetic and clamping", () => {
    expect(scalarValue(addScalar(pt(2), pt(3)))).toBe(5);
    expect(scalarValue(subScalar(cm(7), cm(2)))).toBe(5);
    expect(scalarValue(scaleScalar(px(6), 1.5))).toBe(9);
    expect(scalarValue(divScalar(pt(9), 2))).toBe(4.5);
    expect(scalarValue(absScalar(pt(-4)))).toBe(4);
    expect(scalarValue(minScalar(pt(9), pt(-1)))).toBe(-1);
    expect(scalarValue(maxScalar(pt(9), pt(-1)))).toBe(9);
    expect(scalarValue(clampScalar(pt(12), pt(-2), pt(8)))).toBe(8);
    expect(scalarValue(negScalar(pt(-12)))).toBe(12);
  });

  it("converts source units and pixels with numerically stable edge cases", () => {
    expect(scalarValue(cmToPt(cm(2)))).toBeCloseTo(56.905511811, 10);
    expect(scalarValue(ptToCm(pt(28.4527559055)))).toBeCloseTo(1, 12);
    expect(sourceCmPoint(cm(1), cm(-2))).toEqual({ x: 1, y: -2 });

    expect(scalarValue(pxToPt(px(18), 3))).toBe(6);
    expect(scalarValue(pxToPt(px(18), 0))).toBe(18_000_000);
    expect(scalarValue(pxToPt(px(18), -4))).toBe(18_000_000);
  });
});

describe("coordinate point and transform helpers", () => {
  it("constructs every exported point, vector, bounds, and transform shape", () => {
    expect(worldPoint(pt(1), pt(2))).toEqual({ x: 1, y: 2 });
    expect(worldVector(pt(3), pt(4))).toEqual({ x: 3, y: 4 });
    expect(svgPoint(pt(5), pt(6))).toEqual({ x: 5, y: 6 });
    expect(viewportPoint(px(7), px(8))).toEqual({ x: 7, y: 8 });
    expect(viewportVector(px(9), px(10))).toEqual({ x: 9, y: 10 });
    expect(clientPoint(px(11), px(12))).toEqual({ x: 11, y: 12 });
    expect(clientVector(px(13), px(14))).toEqual({ x: 13, y: 14 });
    expect(textRectLocalPoint(px(15), px(16))).toEqual({ x: 15, y: 16 });
    expect(textareaLocalPoint(px(17), px(18))).toEqual({ x: 17, y: 18 });
    expect(worldBounds(pt(1), pt(2), pt(3), pt(4))).toEqual({ minX: 1, minY: 2, maxX: 3, maxY: 4 });
    expect(svgBounds(pt(5), pt(6), pt(7), pt(8))).toEqual({ minX: 5, minY: 6, maxX: 7, maxY: 8 });
    expect(viewportBounds(px(9), px(10), px(11), px(12))).toEqual({ minX: 9, minY: 10, maxX: 11, maxY: 12 });
    expect(clientBounds(px(13), px(14), px(15), px(16))).toEqual({ minX: 13, minY: 14, maxX: 15, maxY: 16 });
    expect(worldToSvgTransform(1, 2, 3, 4, 5, 6)).toEqual({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 });
    expect(svgToWorldTransform(6, 5, 4, 3, 2, 1)).toEqual({ a: 6, b: 5, c: 4, d: 3, e: 2, f: 1 });
    expect(anchorToWorldTransform(1, 0, 0, 1, 9, 8)).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 9, f: 8 });
  });

  it("round-trips frame transforms and rejects singular or non-finite inverses", () => {
    const transform = frameToWorldTransform(2, 1, -0.5, 3, 10, -4);
    const local = frameLocalPoint(pt(7), pt(-2));
    const world = applyFrameToWorldPoint(transform, local);
    const inverse = invertFrameToWorldTransform(transform);

    expect(inverse).not.toBeNull();
    expect(world).toEqual({ x: 25, y: -3 });
    expect(inverse ? applyWorldToFramePoint(inverse, world).x : NaN).toBeCloseTo(7, 12);
    expect(inverse ? applyWorldToFramePoint(inverse, world).y : NaN).toBeCloseTo(-2, 12);

    const vector = applyFrameToWorldVector(transform, frameLocalVector(pt(3), pt(5)));
    expect(vector).toEqual({ x: 3.5, y: 18 });
    expect(inverse ? applyWorldToFrameVector(inverse, vector).x : NaN).toBeCloseTo(3, 12);
    expect(inverse ? applyWorldToFrameVector(inverse, vector).y : NaN).toBeCloseTo(5, 12);
    expect(worldToFrameLocal(world, transform)?.x).toBeCloseTo(7, 12);
    expect(worldVectorToFrameLocal(vector, transform)?.y).toBeCloseTo(5, 12);

    expect(invertFrameToWorldTransform(frameToWorldTransform(1, 2, 2, 4, 0, 0))).toBeNull();
    expect(invertFrameToWorldTransform(frameToWorldTransform(Number.NaN, 0, 0, 1, 0, 0))).toBeNull();
    expect(worldToFrameLocal(world, frameToWorldTransform(1, 2, 2, 4, 0, 0))).toBeNull();
    expect(worldVectorToFrameLocal(vector, frameToWorldTransform(1, 2, 2, 4, 0, 0))).toBeNull();
  });

  it("maps world geometry into the flipped SVG coordinate system", () => {
    const viewBox = { y: -10, height: 100 };

    expect(worldToSvgY(pt(15), viewBox)).toBe(65);
    expect(worldToSvgPoint(worldPoint(pt(5), pt(15)), viewBox)).toEqual({ x: 5, y: 65 });
    expect(svgToWorldPoint(svgPoint(pt(5), pt(65)), viewBox)).toEqual({ x: 5, y: 15 });
    expect(worldToSvgBounds(worldBounds(pt(-2), pt(5), pt(8), pt(15)), viewBox)).toEqual({
      minX: -2,
      minY: 65,
      maxX: 8,
      maxY: 75
    });

    expect(worldTransform(1, 2, 3, 4, 5, 6)).toEqual({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 });
    expect(mapWorldTransformToSvgTransform(worldTransform(1, 2, 3, 4, 5, 6), viewBox)).toEqual({
      a: 1,
      b: -2,
      c: -3,
      d: 4,
      e: 245,
      f: -246
    });
  });
});
