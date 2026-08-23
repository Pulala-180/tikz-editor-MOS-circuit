import { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { applyCursorOverlayFrame, CursorOverlay } from "../cursor-overlay";
import { CURSOR_FOR_DRAG } from "../cursor-conventions";
import { createCursorScript, type CursorFrame } from "../cursor-script";
import { addArrowFinal, addArrowInitial, addArrowCommonViewBox } from "../generated/feature-svgs";
import { AnchorOverlay, applyAnchorOverlayState, buildRectAnchorDots } from "../animation/anchor-overlay";
import { createCursorPathScript } from "../animation/cursor-path";
import { point } from "../animation/points";
import { mountRenderedScene } from "../animation/rendered-scene";
import type { RectBounds } from "../animation/anchor-overlay";
import { useDemoTimelinePlayback } from "../use-demo-playback";
import {
  sourceKeyword,
  sourceLine,
  sourcePunctuation,
  sourceNumber,
  sourceString,
  sourceText,
  SourcePreview,
  renderSourcePreview,
  type SourceLine
} from "../source-preview";

type SceneRefs = {
  contentGroup: SVGGElement | null;
  previewLineGroup: SVGGElement | null;
  tipPath: SVGPathElement | null;
};

type AddArrowSourceState = {
  arrowVisible: boolean;
};

const NODE_REVEAL_RADIUS = 10.5;
const ANCHOR_SNAP_RADIUS = 4.2;
const ANIMATED_ARROW_STROKE_WIDTH = 1.2;

type AddArrowCardProps = {
  sceneViewBox?: string;
};

export function AddArrowCard({ sceneViewBox = addArrowCommonViewBox }: AddArrowCardProps = {}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  useDemoTimelinePlayback(rootRef, timelineRef);
  const cursorOverlayRef = useRef<SVGGElement | null>(null);
  const sourcePreviewRef = useRef<HTMLElement | null>(null);
  const sAnchorOverlayRef = useRef<SVGGElement | null>(null);
  const tAnchorOverlayRef = useRef<SVGGElement | null>(null);
  const sceneRef = useRef<SceneRefs>({
    contentGroup: null,
    previewLineGroup: null,
    tipPath: null
  });
  const sourceStateRef = useRef<AddArrowSourceState>({
    arrowVisible: false
  });
  const cursorStateRef = useRef<CursorFrame>({
    x: addArrowInitial.s.center.x,
    y: addArrowInitial.s.bounds.y - 18,
    visible: true,
    pressed: false,
    cursor: CURSOR_FOR_DRAG.toolCreate
  });
  const [cursorFrame, setCursorFrame] = useState<CursorFrame>({ ...cursorStateRef.current });
  const sAnchors = buildRectAnchorDots(addArrowInitial.s.bounds);
  const tAnchors = buildRectAnchorDots(addArrowInitial.t.bounds);

  const commitAnchorOverlays = (): void => {
    const cursorPoint = point(cursorStateRef.current.x, cursorStateRef.current.y);
    const toolActive = cursorStateRef.current.cursor === CURSOR_FOR_DRAG.toolCreate;
    const hoveredNode = toolActive
      ? resolveHoveredRectNode(cursorPoint, addArrowInitial.s.bounds, addArrowInitial.t.bounds)
      : null;
    if (sAnchorOverlayRef.current) {
      applyAnchorOverlayState(
        sAnchorOverlayRef.current,
        sAnchors,
        hoveredNode === "s",
        hoveredNode === "s" ? resolveSnappedRectAnchor(addArrowInitial.s.bounds, cursorPoint) : null
      );
    }
    if (tAnchorOverlayRef.current) {
      applyAnchorOverlayState(
        tAnchorOverlayRef.current,
        tAnchors,
        hoveredNode === "t",
        hoveredNode === "t" ? resolveSnappedRectAnchor(addArrowInitial.t.bounds, cursorPoint) : null
      );
    }
  };
  const commitCursorPosition = (): void => {
    if (cursorOverlayRef.current) {
      applyCursorOverlayFrame(cursorOverlayRef.current, cursorStateRef.current, 0.35);
    }
    commitAnchorOverlays();
  };
  const commitCursorFrame = (): void => {
    commitCursorPosition();
    setCursorFrame({ ...cursorStateRef.current });
  };
  const commitSource = (): void => {
    if (sourcePreviewRef.current) {
      renderSourcePreview(sourcePreviewRef.current, buildAddArrowSourceLines(sourceStateRef.current));
    }
  };

  useLayoutEffect(() => {
    if (!rootRef.current) {
      return;
    }

    const { contentGroup, previewLineGroup, tipPath } = sceneRef.current;
    if (!contentGroup || !previewLineGroup || !tipPath) {
      return;
    }

    mountRenderedScene(contentGroup, addArrowInitial.innerSvg);

    const sEast = point(addArrowInitial.s.bounds.x + addArrowInitial.s.bounds.width, addArrowInitial.s.center.y);
    const tWest = point(addArrowInitial.t.bounds.x, addArrowInitial.t.center.y);
    const initialAbove = point(addArrowInitial.s.center.x, addArrowInitial.s.bounds.y - 18);

    gsap.set([previewLineGroup, tipPath], { autoAlpha: 0 });
    gsap.set(previewLineGroup, {
      x: sEast.x,
      y: sEast.y,
      scaleX: 0,
      transformOrigin: "0 0"
    });
    gsap.set(tipPath, { attr: { d: addArrowFinal.edge?.tipD ?? "" } });
    sourceStateRef.current.arrowVisible = false;
    commitSource();
    Object.assign(cursorStateRef.current, {
      x: initialAbove.x,
      y: initialAbove.y,
      visible: true,
      pressed: false,
      cursor: CURSOR_FOR_DRAG.toolCreate
    });
    commitCursorFrame();

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 0.85 });
      timelineRef.current = tl;
      const cursor = createCursorScript(tl, cursorStateRef.current, {
        onPositionChange: commitCursorPosition,
        onFrameChange: commitCursorFrame
      });
      const cursorPath = createCursorPathScript(cursor, {
        initialAbove,
        sourceAnchor: sEast,
        targetAnchor: tWest
      });

      cursor.setStyle(CURSOR_FOR_DRAG.toolCreate, 0);
      tl.to({}, { duration: 0.42, ease: "none" }, 0);

      tl.add("sourceMove");
      cursorPath.glideTo("sourceAnchor", 1.12, "sourceMove");

      tl.add("sourceHover", "sourceMove+=1.12");
      tl.to({}, { duration: 0.16, ease: "none" }, "sourceHover");

      tl.add("sourceClick", "sourceHover+=0.02");
      cursor.setPressed(true, "sourceClick");
      cursor.setPressed(false, "sourceClick+=0.12");
      tl.to(previewLineGroup, { autoAlpha: 1, duration: 0.05, ease: "none" }, "sourceClick+=0.02");

      tl.add("targetMove", "sourceClick+=0.18");
      cursorPath.moveTo("targetAnchor", 0.86, "targetMove", "power1.inOut");
      cursor.setStyle(CURSOR_FOR_DRAG.toolCreate, "targetMove");
      tl.to(previewLineGroup, { scaleX: tWest.x - sEast.x, duration: 0.86, ease: "power1.inOut" }, "targetMove");

      tl.add("targetClick", "targetMove+=0.86");
      cursor.setPressed(true, "targetClick");
      cursor.setPressed(false, "targetClick+=0.12");
      tl.to(tipPath, { autoAlpha: 1, duration: 0.08, ease: "none" }, "targetClick+=0.02");
      tl.call(() => {
        sourceStateRef.current.arrowVisible = true;
        commitSource();
      }, undefined, "targetClick");

      tl.add("deactivateTool", "targetClick+=0.22");
      cursor.setStyle("pointer", "deactivateTool");
      tl.to({}, { duration: 0.18, ease: "none" }, "deactivateTool");

      tl.add("reset", "deactivateTool+=0.26");
      cursorPath.moveTo("initialAbove", 0.44, "reset", "power1.inOut");
      cursor.setPressed(false, "reset");
      tl.call(() => {
        sourceStateRef.current.arrowVisible = false;
        commitSource();
      }, undefined, 0);
    }, rootRef);

    return () => {
      timelineRef.current = null;
      ctx.revert();
    };
  // GSAP owns this mount-time script; callback identities are intentionally excluded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <figure className="featureDemo" ref={rootRef}>
      <svg className="featureScene" viewBox={sceneViewBox} role="img" aria-labelledby="add-arrow-demo-title" data-layout-item="layout.anchors.demo">
        <title id="add-arrow-demo-title">Add arrow snaps to node anchors</title>
        <g
          ref={(el) => {
            sceneRef.current.contentGroup = el;
          }}
        />

        <g
          pointerEvents="none"
        >
          <AnchorOverlay ref={sAnchorOverlayRef} anchors={sAnchors} visible={false} />
        </g>

        <g
          pointerEvents="none"
        >
          <AnchorOverlay ref={tAnchorOverlayRef} anchors={tAnchors} visible={false} />
        </g>

        <g
          ref={(el) => {
            sceneRef.current.previewLineGroup = el;
          }}
        >
          <line
            x1={0}
            y1={0}
            x2={1}
            y2={0}
            stroke="black"
            strokeWidth={ANIMATED_ARROW_STROKE_WIDTH}
            strokeLinecap="butt"
            vectorEffect="non-scaling-stroke"
          />
        </g>

        <path
          ref={(el) => {
            sceneRef.current.tipPath = el;
          }}
          fill="none"
          stroke="black"
          strokeWidth={ANIMATED_ARROW_STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          d={addArrowFinal.edge?.tipD ?? ""}
        />

        <CursorOverlay
          ref={cursorOverlayRef}
          x={cursorFrame.x}
          y={cursorFrame.y}
          visible={cursorFrame.visible}
          pressed={cursorFrame.pressed}
          cursor={cursorFrame.cursor}
          scale={0.35}
        />
      </svg>
      <SourcePreview
        ref={sourcePreviewRef}
        lines={buildAddArrowSourceLines(sourceStateRef.current)}
        managedImperatively
        layoutItemId="layout.anchors.source"
      />
    </figure>
  );
}

function buildAddArrowSourceLines(state: AddArrowSourceState): SourceLine[] {
  const sX = "0";
  const sY = "0";
  const tX = "3";
  const tY = "0";

  const lines = [
    sourceLine(
      sourceKeyword("\\node"),
      sourceText("[draw, fill=blue!10] "),
      sourcePunctuation("(s)"),
      sourceText(" at ("),
      sourceNumber(sX),
      sourcePunctuation(", "),
      sourceNumber(sY),
      sourceText(") "),
      sourceString("{Start};")
    ),
    sourceLine(
      sourceKeyword("\\node"),
      sourceText("[draw, fill=green!10] "),
      sourcePunctuation("(t)"),
      sourceText(" at ("),
      sourceNumber(tX),
      sourcePunctuation(", "),
      sourceNumber(tY),
      sourceText(") "),
      sourceString("{End};")
    )
  ];

  lines.push(state.arrowVisible
    ? sourceLine(
      sourceKeyword("\\draw"),
      sourceText("[->] "),
      sourcePunctuation("(s.east)"),
      sourceText(" -- "),
      sourcePunctuation("(t.west)"),
      sourcePunctuation(";")
    )
    : sourceLine(sourceText(" ")));

  return lines;
}

function resolveHoveredRectNode(cursor: { x: number; y: number }, sBounds: RectBounds, tBounds: RectBounds): "s" | "t" | null {
  const sDistanceSq = distanceSquaredToBounds(cursor, sBounds);
  const tDistanceSq = distanceSquaredToBounds(cursor, tBounds);
  const revealRadiusSq = NODE_REVEAL_RADIUS * NODE_REVEAL_RADIUS;
  const nearest = sDistanceSq <= tDistanceSq ? "s" : "t";
  const nearestDistanceSq = nearest === "s" ? sDistanceSq : tDistanceSq;
  return nearestDistanceSq <= revealRadiusSq ? nearest : null;
}

function resolveSnappedRectAnchor(bounds: RectBounds, cursor: { x: number; y: number }): string | null {
  const anchors = buildRectAnchorDots(bounds);
  let snappedKey: string | null = null;
  let snappedDistanceSq = Number.POSITIVE_INFINITY;
  const snapRadiusSq = ANCHOR_SNAP_RADIUS * ANCHOR_SNAP_RADIUS;
  for (const anchor of anchors) {
    const dx = cursor.x - anchor.x;
    const dy = cursor.y - anchor.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq > snapRadiusSq || distanceSq >= snappedDistanceSq) {
      continue;
    }
    snappedKey = anchor.key;
    snappedDistanceSq = distanceSq;
  }
  return snappedKey;
}

function distanceSquaredToBounds(
  point: { x: number; y: number },
  bounds: RectBounds
): number {
  const maxX = bounds.x + bounds.width;
  const maxY = bounds.y + bounds.height;
  const clampedX = Math.min(maxX, Math.max(bounds.x, point.x));
  const clampedY = Math.min(maxY, Math.max(bounds.y, point.y));
  const dx = point.x - clampedX;
  const dy = point.y - clampedY;
  return dx * dx + dy * dy;
}
