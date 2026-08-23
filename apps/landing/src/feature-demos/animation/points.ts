export type Point = {
  x: number;
  y: number;
};

export function point(x: number, y: number): Point {
  return { x, y };
}

export function offsetPoint(base: Point, dx: number, dy: number): Point {
  return { x: base.x + dx, y: base.y + dy };
}

export function rotatePointAround(point: Point, center: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos
  };
}
