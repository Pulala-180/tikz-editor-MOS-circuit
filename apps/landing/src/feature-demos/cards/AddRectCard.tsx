import { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { applyCursorOverlayFrame, CursorOverlay } from "../cursor-overlay";
import { CURSOR_FOR_DRAG, CURSOR_FOR_HANDLE_ROLE } from "../cursor-conventions";
import { createCursorScript, type CursorFrame } from "../cursor-script";
import { addRectCommonViewBox, addRectInitial, addRectResized } from "../generated/feature-svgs";
import { buildRectHandleCenters, renderEditHandlesForBounds } from "../edit-handles";
import { createCursorPathScript } from "../animation/cursor-path";
import { point } from "../animation/points";
import { mountRenderedScene } from "../animation/rendered-scene";
import { setSvgAttrs } from "../animation/svg-actors";
import {
  formatTikzNumber,
  sourceKeyword,
  sourceLine,
  sourcePunctuation,
  SourcePreview,
  renderSourcePreview,
  sourceNumber,
  sourceText,
  type SourceLine
} from "../source-preview";
import { useDemoTimelinePlayback } from "../use-demo-playback";

type SceneRefs = {
  contentGroup: SVGGElement | null;
  handlesGroup: SVGGElement | null;
};

type RectBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type EditHandleOverlayRefs = {
  selectionRect: SVGRectElement;
  rotateStem: SVGLineElement;
  rotateCircle: SVGCircleElement;
  rotateGlyph: SVGGElement;
  handles: SVGRectElement[];
};

type AddRectSourceState = {
  visible: boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

const HANDLE_HALF_SIZE = 1.1;
const HANDLE_STROKE_WIDTH = 0.26;
const SELECTION_STROKE_WIDTH = 0.24;
const ROTATE_HANDLE_GAP = 5.2;

type AddRectCardProps = {
  sceneViewBox?: string;
};

export function AddRectCard({ sceneViewBox = addRectCommonViewBox }: AddRectCardProps = {}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  useDemoTimelinePlayback(rootRef, timelineRef);
  const cursorOverlayRef = useRef<SVGGElement | null>(null);
  const sourcePreviewRef = useRef<HTMLElement | null>(null);
  const sceneRef = useRef<SceneRefs>({
    contentGroup: null,
    handlesGroup: null
  });
  const cursorStateRef = useRef<CursorFrame>({
    x: addRectInitial.bounds.x - 6,
    y: addRectInitial.bounds.y - 18,
    visible: true,
    pressed: false,
    cursor: CURSOR_FOR_DRAG.toolCreate
  });
  const [cursorFrame, setCursorFrame] = useState<CursorFrame>({ ...cursorStateRef.current });
  const sourceStateRef = useRef<AddRectSourceState>({
    visible: false,
    x0: 0,
    y0: 0,
    x1: 0,
    y1: 0
  });
  const lastSourceKeyRef = useRef<string | null>(null);

  const commitCursorPosition = (): void => {
    if (cursorOverlayRef.current) {
      applyCursorOverlayFrame(cursorOverlayRef.current, cursorStateRef.current, 0.35);
    }
  };
  const commitCursorFrame = (): void => {
    commitCursorPosition();
    setCursorFrame({ ...cursorStateRef.current });
  };
  const commitSource = (): void => {
    const state = sourceStateRef.current;
    const sourceKey = state.visible
      ? [
        "visible",
        formatTikzNumber(state.x0),
        formatTikzNumber(state.y0),
        formatTikzNumber(state.x1),
        formatTikzNumber(state.y1)
      ].join("|")
      : "hidden";
    if (lastSourceKeyRef.current === sourceKey) {
      return;
    }
    lastSourceKeyRef.current = sourceKey;
    if (sourcePreviewRef.current) {
      renderSourcePreview(sourcePreviewRef.current, buildAddRectSourceLines(state));
    }
  };
  const idleAbove = point(addRectInitial.bounds.x - 6, addRectInitial.bounds.y - 10);
  const createStart = point(addRectInitial.bounds.x, addRectInitial.bounds.y);
  const createEnd = point(addRectInitial.bounds.x + addRectInitial.bounds.width, addRectInitial.bounds.y + addRectInitial.bounds.height);
  const resizeHover = point(addRectInitial.bounds.x + addRectInitial.bounds.width, addRectInitial.bounds.y + addRectInitial.bounds.height / 2);
  const resizeEnd = point(addRectResized.bounds.x + addRectResized.bounds.width, addRectResized.bounds.y + addRectResized.bounds.height / 2);
  const collapsedBounds = {
    x: createStart.x,
    y: createStart.y,
    width: 0.001,
    height: 0.001
  };
  const initialBounds = addRectInitial.bounds;
  const resizedBounds = addRectResized.bounds;

  useLayoutEffect(() => {
    if (!rootRef.current) {
      return;
    }

    const { contentGroup, handlesGroup } = sceneRef.current;
    if (!contentGroup || !handlesGroup) {
      return;
    }

    mountRenderedScene(contentGroup, addRectInitial.innerSvg);
    const bodyRect = contentGroup.querySelector<SVGPathElement>('path[data-source-id="path:1"]');
    if (!bodyRect) {
      return;
    }
    setSvgAttrs(bodyRect, {
      d: "M 0 0 L 1 0 L 1 1 L 0 1 Z",
      "vector-effect": "non-scaling-stroke"
    });

    const overlayRefs = queryEditHandleOverlayRefs(handlesGroup);
    if (!overlayRefs) {
      return;
    }
    prepareTransformDrivenEditHandleOverlay(overlayRefs);

    const createState: RectBounds = { ...collapsedBounds };
    const resizeState: RectBounds = { ...initialBounds };
    const resetState: RectBounds = { ...collapsedBounds };

    const updateSourceRect = (bounds: RectBounds, phase: "create" | "resize" | "reset"): void => {
      if (phase === "reset") {
        sourceStateRef.current.visible = false;
        sourceStateRef.current.x0 = 0;
        sourceStateRef.current.y0 = 0;
        sourceStateRef.current.x1 = 0;
        sourceStateRef.current.y1 = 0;
        commitSource();
        return;
      }

      sourceStateRef.current.visible = true;
      sourceStateRef.current.x0 = 0;
      sourceStateRef.current.y0 = 0;
      if (phase === "create") {
        const widthProgress = Math.max(0, Math.min(1, bounds.width / initialBounds.width));
        const heightProgress = Math.max(0, Math.min(1, bounds.height / initialBounds.height));
        sourceStateRef.current.x1 = widthProgress * 2;
        sourceStateRef.current.y1 = heightProgress * 1;
      } else {
        const widthProgress = Math.max(
          0,
          Math.min(1, (bounds.width - initialBounds.width) / (resizedBounds.width - initialBounds.width))
        );
        sourceStateRef.current.x1 = 2 + widthProgress * 1;
        sourceStateRef.current.y1 = 1;
      }
      commitSource();
    };

    const updateBodyAndOverlay = (bounds: RectBounds, overlayVisible: boolean, phase: "create" | "resize" | "reset"): void => {
      applyRectPathBounds(bodyRect, bounds);
      applyEditHandleOverlayBounds(overlayRefs, bounds);
      handlesGroup.style.display = overlayVisible ? "inline" : "none";
      handlesGroup.style.opacity = overlayVisible ? "1" : "0";
      handlesGroup.style.visibility = overlayVisible ? "visible" : "hidden";
      bodyRect.style.opacity = bounds.width > 0.01 && bounds.height > 0.01 ? "1" : "0";
      updateSourceRect(bounds, phase);
    };

    updateBodyAndOverlay(createState, false, "reset");
    sourceStateRef.current.visible = false;
    commitSource();
    Object.assign(cursorStateRef.current, {
      x: idleAbove.x,
      y: idleAbove.y,
      visible: true,
      pressed: false,
      cursor: CURSOR_FOR_DRAG.toolCreate
    });
    commitCursorFrame();

    const ctx = gsap.context(() => {
      gsap.set(contentGroup, { opacity: 0 });
      gsap.set(handlesGroup, { opacity: 0, display: "none", visibility: "hidden" });

      const tl = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 0.9 });
      timelineRef.current = tl;
      const cursor = createCursorScript(tl, cursorStateRef.current, {
        onPositionChange: commitCursorPosition,
        onFrameChange: commitCursorFrame
      });
      const cursorPath = createCursorPathScript(cursor, {
        idleAbove,
        createStart,
        createEnd,
        resizeHover,
        resizeEnd
      });

      cursor.setStyle(CURSOR_FOR_DRAG.toolCreate, 0);
      tl.to({}, { duration: 0.26, ease: "none" }, 0);

      tl.add("createHover");
      cursorPath.glideTo("createStart", 0.44, "createHover");

      tl.add("createPress", "createHover+=0.46");
      cursor.setPressed(true, "createPress");

      tl.add("createDrag", "createPress+=0.16");
      tl.to(contentGroup, { opacity: 1, duration: 0.05, ease: "none" }, "createDrag");
      cursorPath.moveTo("createEnd", 0.82, "createDrag", "power1.inOut");
      tweenRectBounds(tl, createState, collapsedBounds, initialBounds, 0.82, "createDrag", "power1.inOut", (bounds) =>
        { updateBodyAndOverlay(bounds, false, "create"); }
      );

      tl.add("createRelease", "createDrag+=0.82");
      tl.call(() => {
        updateBodyAndOverlay(resizeState, true, "resize");
      }, undefined, "createRelease");
      cursor.setPressed(false, "createRelease");
      cursor.setStyle("pointer", "createRelease");

      tl.add("resizeHoverMove", "createRelease+=0.2");
      cursorPath.glideTo("resizeHover", 0.5, "resizeHoverMove");
      cursor.setStyle(CURSOR_FOR_HANDLE_ROLE.right, "resizeHoverMove+=0.42");

      tl.add("resizePress", "resizeHoverMove+=0.54");
      cursor.setPressed(true, "resizePress");

      tl.add("resizeDrag", "resizePress+=0.16");
      cursorPath.moveTo("resizeEnd", 1.35, "resizeDrag", "power1.inOut");
      tweenRectBounds(tl, resizeState, initialBounds, resizedBounds, 1.315, "resizeDrag+=0.035", "power1.inOut", (bounds) =>
        { updateBodyAndOverlay(bounds, true, "resize"); }
      );

      tl.add("resizeRelease", "resizeDrag+=1.35");
      cursor.setPressed(false, "resizeRelease");
      cursor.setStyle("pointer", "resizeRelease");

      tl.add("reset", "resizeRelease+=0.26");
      tl.to(handlesGroup, { opacity: 0, duration: 0.08, ease: "none" }, "reset+=0.34");
      tl.set(handlesGroup, { display: "none", visibility: "hidden" }, "reset+=0.08");
      tl.to(contentGroup, { opacity: 0, duration: 0.08, ease: "none" }, "reset+=0.6");
      tl.call(() => {
        updateBodyAndOverlay(resizeState, false, "resize");
      }, undefined, "reset");
      tl.call(() => {
        updateBodyAndOverlay(resetState, false, "reset");
      }, undefined, "reset+=0.6");
      cursorPath.moveTo("idleAbove", 0.7, "reset", "power1.inOut");
      cursor.setStyle(CURSOR_FOR_DRAG.toolCreate, "reset+=0.32");
      cursor.setPressed(false, "reset");
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
      <svg className="featureScene" viewBox={sceneViewBox} role="img" aria-labelledby="add-rectangle-demo-title" data-layout-item="canvas.rectangle.demo">
        <title id="add-rectangle-demo-title">Rectangle draw and resize follows the handle</title>
        <g
          ref={(el) => {
            sceneRef.current.contentGroup = el;
          }}
          style={{ opacity: 0 }}
        />

        <g
          ref={(el) => {
            sceneRef.current.handlesGroup = el;
          }}
          style={{ opacity: 0, display: "none", visibility: "hidden" }}
        >
          {renderEditHandlesForBounds({
            bounds: initialBounds,
            handleHalfSize: HANDLE_HALF_SIZE,
            handleStrokeWidth: HANDLE_STROKE_WIDTH,
            selectionStrokeWidth: SELECTION_STROKE_WIDTH,
            rotateHandleGap: ROTATE_HANDLE_GAP
          })}
        </g>

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
        lines={buildAddRectSourceLines(sourceStateRef.current)}
        managedImperatively
        layoutItemId="canvas.rectangle.source"
      />
    </figure>
  );
}

function buildAddRectSourceLines(state: AddRectSourceState): SourceLine[] {
  if (!state.visible) {
    return [sourceLine(sourceText(" "))];
  }

  return [
    sourceLine(
      sourceKeyword("\\path"),
      sourceText("[draw, fill=white] "),
      sourcePunctuation("("),
      sourceNumber("0"),
      sourcePunctuation(", "),
      sourceNumber("0"),
      sourcePunctuation(") "),
      sourceKeyword("rectangle"),
      sourceText(" ("),
      sourceNumber(formatTikzNumber(state.x1)),
      sourcePunctuation(", "),
      sourceNumber(formatTikzNumber(state.y1)),
      sourcePunctuation(");")
    )
  ];
}

function queryEditHandleOverlayRefs(handlesGroup: SVGGElement): EditHandleOverlayRefs | null {
  const selectionRect = handlesGroup.querySelector<SVGRectElement>("rect.selectionRect");
  const rotateStem = handlesGroup.querySelector<SVGLineElement>("line.rotateHandleStem");
  const rotateCircle = handlesGroup.querySelector<SVGCircleElement>("circle.rotateHandleCircle");
  const rotateGlyph = handlesGroup.querySelector<SVGGElement>("g.rotateHandleGlyph");
  const handles = Array.from(handlesGroup.querySelectorAll<SVGRectElement>("rect.handle")).filter(
    (element): element is SVGRectElement => element instanceof SVGRectElement
  );

  if (!selectionRect || !rotateStem || !rotateCircle || !rotateGlyph || handles.length !== 8) {
    return null;
  }

  return {
    selectionRect,
    rotateStem,
    rotateCircle,
    rotateGlyph,
    handles
  };
}

function applyEditHandleOverlayBounds(refs: EditHandleOverlayRefs, bounds: RectBounds): void {
  setSvgAttrs(refs.selectionRect, {
    transform: `translate(${bounds.x} ${bounds.y}) scale(${Math.max(0.001, bounds.width)} ${Math.max(0.001, bounds.height)})`
  });

  const centers = buildRectHandleCenters(bounds);
  refs.handles.forEach((handle, index) => {
    const center = centers[index];
    if (!center) {
      return;
    }
    setSvgAttrs(handle, {
      transform: `translate(${center.x} ${center.y})`
    });
  });

  const rotateAnchorX = bounds.x + bounds.width / 2;
  const rotateAnchorY = bounds.y;
  const rotateY = rotateAnchorY - ROTATE_HANDLE_GAP;
  const rotateRadius = HANDLE_HALF_SIZE * 1.3;
  const glyphScale = (rotateRadius * 1.4) / 16;

  setSvgAttrs(refs.rotateStem, {
    transform: `translate(${rotateAnchorX} ${rotateAnchorY})`
  });
  setSvgAttrs(refs.rotateCircle, {
    transform: `translate(${rotateAnchorX} ${rotateY})`
  });
  setSvgAttrs(refs.rotateGlyph, {
    transform: `translate(${rotateAnchorX} ${rotateY}) scale(${glyphScale}) translate(-8 -8)`
  });
}

function prepareTransformDrivenEditHandleOverlay(refs: EditHandleOverlayRefs): void {
  setSvgAttrs(refs.selectionRect, {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    "vector-effect": "non-scaling-stroke"
  });
  refs.handles.forEach((handle) => {
    setSvgAttrs(handle, {
      x: -HANDLE_HALF_SIZE,
      y: -HANDLE_HALF_SIZE,
      width: HANDLE_HALF_SIZE * 2,
      height: HANDLE_HALF_SIZE * 2
    });
  });

  const rotateRadius = HANDLE_HALF_SIZE * 1.3;
  setSvgAttrs(refs.rotateStem, {
    x1: 0,
    y1: 0,
    x2: 0,
    y2: -ROTATE_HANDLE_GAP,
    "vector-effect": "non-scaling-stroke"
  });
  setSvgAttrs(refs.rotateCircle, {
    cx: 0,
    cy: 0,
    r: rotateRadius
  });
}

function tweenRectBounds(
  tl: gsap.core.Timeline,
  state: RectBounds,
  from: RectBounds,
  to: RectBounds,
  duration: number,
  position: gsap.Position,
  ease: string,
  onUpdate: (bounds: RectBounds) => void
): void {
  Object.assign(state, from);
  tl.to(
    state,
    {
      x: to.x,
      y: to.y,
      width: to.width,
      height: to.height,
      duration,
      ease,
      onUpdate: () => { onUpdate(state); }
    },
    position
  );
}

function applyRectPathBounds(path: SVGPathElement, bounds: RectBounds): void {
  setSvgAttrs(path, {
    transform: `translate(${bounds.x} ${bounds.y}) scale(${Math.max(0.001, bounds.width)} ${Math.max(0.001, bounds.height)})`
  });
}
