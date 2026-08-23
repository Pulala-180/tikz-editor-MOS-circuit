import type { ReactElement } from "react";

const ROTATE_GLYPH_PATH_1 = "M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2z";
const ROTATE_GLYPH_PATH_2 = "M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466";

export type RectBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EditHandleOverlayOptions = {
  bounds: RectBounds;
  handleHalfSize?: number;
  handleStrokeWidth?: number;
  selectionStrokeWidth?: number;
  showRotateHandle?: boolean;
  rotateHandleGap?: number;
};

export function buildRectHandleCenters(bounds: RectBounds): Array<{ key: string; x: number; y: number }> {
  const x0 = bounds.x;
  const y0 = bounds.y;
  const x1 = bounds.x + bounds.width;
  const y1 = bounds.y + bounds.height;
  const xm = (x0 + x1) / 2;
  const ym = (y0 + y1) / 2;
  return [
    { key: "nw", x: x0, y: y0 },
    { key: "n", x: xm, y: y0 },
    { key: "ne", x: x1, y: y0 },
    { key: "e", x: x1, y: ym },
    { key: "se", x: x1, y: y1 },
    { key: "s", x: xm, y: y1 },
    { key: "sw", x: x0, y: y1 },
    { key: "w", x: x0, y: ym }
  ];
}

export function renderEditHandlesForBounds({
  bounds,
  handleHalfSize = 5,
  handleStrokeWidth = 1.2,
  selectionStrokeWidth = 1.1,
  showRotateHandle = true,
  rotateHandleGap = 24
}: EditHandleOverlayOptions): ReactElement {
  const centers = buildRectHandleCenters(bounds);
  const rotateAnchorX = bounds.x + bounds.width / 2;
  const rotateAnchorY = bounds.y;
  const rotateY = rotateAnchorY - rotateHandleGap;
  const rotateRadius = handleHalfSize * 1.3;
  const glyphScale = (rotateRadius * 1.4) / 16;

  return (
    <g className="handleOverlay" data-testid="demo-edit-handle-overlay">
      <rect
        x={bounds.x}
        y={bounds.y}
        width={Math.max(0.001, bounds.width)}
        height={Math.max(0.001, bounds.height)}
        className="selectionRect"
        strokeWidth={selectionStrokeWidth}
      />

      {showRotateHandle && (
        <>
          <line
            x1={rotateAnchorX}
            y1={rotateAnchorY}
            x2={rotateAnchorX}
            y2={rotateY}
            className="rotateHandleStem"
            strokeWidth={handleStrokeWidth}
          />
          <circle
            cx={rotateAnchorX}
            cy={rotateY}
            r={rotateRadius}
            className="handle rotateHandleCircle"
            strokeWidth={handleStrokeWidth * 0.75}
          />
          <g transform={`translate(${rotateAnchorX} ${rotateY}) scale(${glyphScale}) translate(-8 -8)`} className="rotateHandleGlyph">
            <path d={ROTATE_GLYPH_PATH_1} />
            <path d={ROTATE_GLYPH_PATH_2} />
          </g>
        </>
      )}

      {centers.map((point) => (
        <rect
          key={point.key}
          x={point.x - handleHalfSize}
          y={point.y - handleHalfSize}
          width={handleHalfSize * 2}
          height={handleHalfSize * 2}
          className="handle"
          strokeWidth={handleStrokeWidth}
        />
      ))}
    </g>
  );
}
