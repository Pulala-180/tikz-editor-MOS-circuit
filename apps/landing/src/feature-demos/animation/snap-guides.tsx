import type { ReactNode } from "react";

type Point = {
  x: number;
  y: number;
};

export type SnapGuideLine =
  | { type: "points"; axis: "x" | "y"; points: Point[] }
  | { type: "pointer"; axis: "x" | "y"; from: Point; to: Point }
  | {
      type: "gap";
      direction: "horizontal" | "vertical";
      gapKind: "center" | "equal";
      segments: Array<[Point, Point]>;
    };

export type SnapGuidesOverlayProps = {
  lines: readonly SnapGuideLine[];
  strokeWidth?: number;
  crossSize?: number;
};

const SNAP_GAP_ARROW_MARKER_ID = "landing-snap-gap-arrow";

export function SnapGuidesOverlay({
  lines,
  strokeWidth = 1.2,
  crossSize = 5
}: SnapGuidesOverlayProps): ReactNode {
  if (lines.length === 0) {
    return null;
  }

  return (
    <g className="snapOverlay">
      <defs>
        <marker
          id={SNAP_GAP_ARROW_MARKER_ID}
          markerWidth={6}
          markerHeight={6}
          refX={10}
          refY={5}
          orient="auto-start-reverse"
          viewBox="0 0 10 10"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="snapGapArrowHead" />
        </marker>
      </defs>
      {lines.map((line, index) => {
        if (line.type === "points") {
          const first = line.points[0];
          const last = line.points[line.points.length - 1];
          return (
            <g key={`snap-points-${index}`}>
              {first && last && line.points.length > 1 && (
                <line
                  x1={first.x}
                  y1={first.y}
                  x2={last.x}
                  y2={last.y}
                  className="snapLine"
                  strokeWidth={strokeWidth}
                />
              )}
              {line.points.map((point, pointIndex) => (
                <g key={`snap-point-${index}-${pointIndex}`}>
                  <line
                    x1={point.x - crossSize}
                    y1={point.y - crossSize}
                    x2={point.x + crossSize}
                    y2={point.y + crossSize}
                    className="snapLine"
                    strokeWidth={strokeWidth}
                  />
                  <line
                    x1={point.x - crossSize}
                    y1={point.y + crossSize}
                    x2={point.x + crossSize}
                    y2={point.y - crossSize}
                    className="snapLine"
                    strokeWidth={strokeWidth}
                  />
                </g>
              ))}
            </g>
          );
        }

        if (line.type === "pointer") {
          return (
            <g key={`snap-pointer-${index}`}>
              <line
                x1={line.from.x}
                y1={line.from.y}
                x2={line.to.x}
                y2={line.to.y}
                className="snapLine"
                strokeWidth={strokeWidth}
              />
              <line
                x1={line.from.x - crossSize}
                y1={line.from.y - crossSize}
                x2={line.from.x + crossSize}
                y2={line.from.y + crossSize}
                className="snapLine"
                strokeWidth={strokeWidth}
              />
              <line
                x1={line.from.x - crossSize}
                y1={line.from.y + crossSize}
                x2={line.from.x + crossSize}
                y2={line.from.y - crossSize}
                className="snapLine"
                strokeWidth={strokeWidth}
              />
            </g>
          );
        }

        return (
          <g key={`snap-gap-${index}`}>
            {line.segments.map((segment, segmentIndex) => (
              <line
                key={`snap-gap-segment-${index}-${segmentIndex}`}
                x1={segment[0].x}
                y1={segment[0].y}
                x2={segment[1].x}
                y2={segment[1].y}
                className="snapLine snapGapLine"
                strokeWidth={strokeWidth}
                markerStart={line.gapKind === "equal" ? `url(#${SNAP_GAP_ARROW_MARKER_ID})` : undefined}
                markerEnd={line.gapKind === "equal" ? `url(#${SNAP_GAP_ARROW_MARKER_ID})` : undefined}
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}
