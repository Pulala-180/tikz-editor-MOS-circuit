import { describe, expect, it } from "vitest";

import { renderTikzToSvgAsync } from "../../packages/core/src/render/index.js";
import { worldPoint, type WorldPoint } from "../../packages/core/src/coords/points.js";
import { pt } from "../../packages/core/src/coords/scalars.js";
import { applyMatrix } from "../../packages/core/src/semantic/transform.js";
import type { SceneElement, ScenePath } from "../../packages/core/src/semantic/types.js";

type ShapeBounds = {
  width: number;
  height: number;
};

type ShapeParityCase = {
  shape: string;
  natural: ShapeBounds;
  minimum: ShapeBounds;
  tolerance?: number;
};

const PGF_SHAPE_BBOX_CASES: ShapeParityCase[] = [
  { shape: "rectangle", natural: { width: 54.54552, height: 13.55971 }, minimum: { width: 62.36288, height: 39.68536 } },
  { shape: "rounded rectangle", natural: { width: 56.44388, height: 13.5597 }, minimum: { width: 55.72174, height: 39.68536 } },
  { shape: "chamfered rectangle", natural: { width: 60.2591, height: 19.27328 }, minimum: { width: 62.36288, height: 39.68536 } },
  { shape: "circle", natural: { width: 56.0785, height: 56.0785 }, minimum: { width: 62.36288, height: 62.36288 } },
  { shape: "magnifying glass", natural: { width: 77.606, height: 77.606 }, minimum: { width: 86.349, height: 86.349 } },
  { shape: "ellipse", natural: { width: 77.13906, height: 19.1763 }, minimum: { width: 77.13906, height: 39.68536 } },
  { shape: "circle split", natural: { width: 60.97622, height: 60.97622 }, minimum: { width: 62.36288, height: 62.36288 } },
  { shape: "circle solidus", natural: { width: 96.71412, height: 96.71412 }, minimum: { width: 96.71412, height: 96.71412 } },
  { shape: "ellipse split", natural: { width: 77.13906, height: 38.91626 }, minimum: { width: 77.13906, height: 39.68536 } },
  { shape: "diamond", natural: { width: 67.94016, height: 67.94016 }, minimum: { width: 67.94016, height: 67.94016 } },
  { shape: "diamond split", natural: { width: 109.64594, height: 109.48086 }, minimum: { width: 109.64594, height: 109.48086 } },
  { shape: "rectangle split", natural: { width: 54.54552, height: 47.94568 }, minimum: { width: 62.3629, height: 47.94568 } },
  { shape: "trapezium", natural: { width: 70.20196, height: 13.5597 }, minimum: { width: 205.43308, height: 39.68536 } },
  { shape: "semicircle", natural: { width: 60.90506, height: 30.45253 }, minimum: { width: 79.37072, height: 39.68537 } },
  { shape: "regular polygon", natural: { width: 90.68216, height: 86.24327 }, minimum: { width: 90.68216, height: 86.24327 } },
  { shape: "star", natural: { width: 110.04642, height: 104.65965 }, minimum: { width: 110.04642, height: 104.65965 } },
  { shape: "starburst", natural: { width: 95.84823, height: 40.92999 }, minimum: { width: 95.84823, height: 40.92999 } },
  { shape: "isosceles triangle", natural: { width: 70.91414, height: 58.7435 }, minimum: { width: 75.28156, height: 62.36288 } },
  { shape: "kite", natural: { width: 66.28854, height: 76.55176 }, minimum: { width: 66.28854, height: 76.55176 } },
  { shape: "dart", natural: { width: 85.60027, height: 70.91086 }, minimum: { width: 85.60027, height: 70.91086 } },
  { shape: "circular sector", natural: { width: 66.63157, height: 66.63248 }, minimum: { width: 66.63157, height: 66.63248 } },
  { shape: "cylinder", natural: { width: 69.25365, height: 13.5597 }, minimum: { width: 72.04003, height: 62.36288 } },
  { shape: "single arrow", natural: { width: 61.92343, height: 28.1316 }, minimum: { width: 70.41618, height: 62.36286 } },
  { shape: "double arrow", natural: { width: 68.90286, height: 28.1316 }, minimum: { width: 85.88836, height: 62.36286 } },
  { shape: "signal", natural: { width: 61.32567, height: 13.5597 }, minimum: { width: 74.38908, height: 39.68536 } },
  { shape: "tape", natural: { width: 54.54568, height: 23.52251 }, minimum: { width: 62.363, height: 39.68539 } },
  { shape: "cloud", natural: { width: 88.2157, height: 91.65554 }, minimum: { width: 88.2157, height: 91.65554 } },
  { shape: "rectangle callout", natural: { width: 54.5455, height: 25.83246 }, minimum: { width: 62.36288, height: 51.95813 } },
  { shape: "ellipse callout", natural: { width: 77.13906, height: 31.35133 }, minimum: { width: 77.13906, height: 51.13504 } },
  { shape: "cloud callout", natural: { width: 88.2157, height: 101.64378 }, minimum: { width: 88.2157, height: 101.64378 } }
];

function shapeSource(shape: string, minimum: boolean): string {
  const sizeOptions = minimum ? ", minimum width=2.2cm, minimum height=1.4cm" : "";
  return String.raw`\begin{tikzpicture}
  \node[draw, shape=${shape}${sizeOptions}, fill=pink] at (0.6,2.2) {Hello there};
\end{tikzpicture}`;
}

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

function shapeBounds(elements: readonly SceneElement[]): ShapeBounds {
  const shapeElements = elements.filter((candidate) => candidate.kind !== "Text");
  if (shapeElements.length === 0) {
    throw new Error("Expected a rendered node shape element.");
  }
  const bounds = shapeElements.map(elementBounds);
  return {
    width: Math.max(...bounds.map((bound) => bound.maxX)) - Math.min(...bounds.map((bound) => bound.minX)),
    height: Math.max(...bounds.map((bound) => bound.maxY)) - Math.min(...bounds.map((bound) => bound.minY))
  };
}

function elementBounds(element: SceneElement): Bounds {
  if (element.kind === "Circle") {
    const center = element.transform ? applyMatrix(element.transform, element.center) : element.center;
    return {
      minX: center.x - element.radius,
      maxX: center.x + element.radius,
      minY: center.y - element.radius,
      maxY: center.y + element.radius
    };
  }

  if (element.kind === "Ellipse") {
    const center = element.transform ? applyMatrix(element.transform, element.center) : element.center;
    return {
      minX: center.x - element.rx,
      maxX: center.x + element.rx,
      minY: center.y - element.ry,
      maxY: center.y + element.ry
    };
  }

  if (element.kind === "Path") {
    return pathBounds(element);
  }

  throw new Error(`Unexpected node shape element kind: ${element.kind}`);
}

function pathBounds(path: ScenePath): Bounds {
  const points = pathBoundsPoints(path);
  if (points.length === 0) {
    throw new Error("Expected path commands with coordinates.");
  }

  const transformed = points.map((point) => (path.transform ? applyMatrix(path.transform, point) : point));
  const xs = transformed.map((point) => point.x);
  const ys = transformed.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

function pathBoundsPoints(path: ScenePath): WorldPoint[] {
  const points: WorldPoint[] = [];
  let current: WorldPoint | null = null;

  for (const command of path.commands) {
    if (command.kind === "M" || command.kind === "L" || command.kind === "A") {
      points.push(command.to);
      current = command.to;
      continue;
    }
    if (command.kind === "C" && current) {
      points.push(command.to, ...cubicExtremaPoints(current, command.c1, command.c2, command.to));
      current = command.to;
    }
  }

  return points;
}

function cubicExtremaPoints(
  p0: WorldPoint,
  p1: WorldPoint,
  p2: WorldPoint,
  p3: WorldPoint
): WorldPoint[] {
  const roots = new Set<number>();
  for (const axis of ["x", "y"] as const) {
    for (const root of cubicExtremaRoots(p0[axis], p1[axis], p2[axis], p3[axis])) {
      roots.add(root);
    }
  }
  return [...roots].map((t) => cubicPoint(p0, p1, p2, p3, t));
}

function cubicExtremaRoots(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = -p0 + p1;
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) < 1e-9) {
      return [];
    }
    const t = -c / b;
    return t > 0 && t < 1 ? [t] : [];
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return [];
  }
  const sqrt = Math.sqrt(discriminant);
  return [(-b + sqrt) / (2 * a), (-b - sqrt) / (2 * a)].filter((t) => t > 0 && t < 1);
}

function cubicPoint(
  p0: WorldPoint,
  p1: WorldPoint,
  p2: WorldPoint,
  p3: WorldPoint,
  t: number
): WorldPoint {
  const u = 1 - t;
  return worldPoint(
    pt(u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x),
    pt(u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y)
  );
}

function expectBounds(actual: ShapeBounds, expected: ShapeBounds, tolerance: number): void {
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(tolerance);
}

describe("semantic evaluator / PGF node shape parity", () => {
  it.each(PGF_SHAPE_BBOX_CASES)("matches PGF painted bbox dimensions for $shape", async (testCase) => {
    const natural = await renderTikzToSvgAsync(shapeSource(testCase.shape, false));
    const minimum = await renderTikzToSvgAsync(shapeSource(testCase.shape, true));
    const tolerance = testCase.tolerance ?? 1;

    expectBounds(shapeBounds(natural.semantic.scene.elements), testCase.natural, tolerance);
    expectBounds(shapeBounds(minimum.semantic.scene.elements), testCase.minimum, tolerance);
  });
});
