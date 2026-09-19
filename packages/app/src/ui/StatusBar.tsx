import { useEffect, useState } from "react";
import { RiArrowDownSLine, RiAspectRatioLine, RiGridLine } from "@remixicon/react";
import { useEditorStore } from "../store/store";
import type { CanvasDragKind, ToolMode, WireSourceDescriptor } from "../store/types";
import { getModifierKeyLabels, type ModifierKeyLabels } from "./key-labels";
import { useFrameTimingStats } from "./useFrameTimingStats";
import { RenderedTooltip } from "./RenderedTooltip";
import css from "./StatusBar.module.css";

const TEX_PT_PER_IN = 72.27;
const CSS_SCREEN_DPI = 96;
// Canvas transforms use CSS pixels, whose reference inch is 96 px.
const ACTUAL_SIZE_SCALE = CSS_SCREEN_DPI / TEX_PT_PER_IN;
const ZOOM_LEVELS = [25, 50, 75, 100, 125, 150, 200, 300, 400] as const;
const MIN_ZOOM_PERCENT = 25;
const MAX_ZOOM_PERCENT = 400;

export function StatusBar() {
  const snapshot = useEditorStore((s) => s.snapshot);
  const activeFigureId = useEditorStore((s) => s.activeFigureId);
  const currentDocument = useEditorStore((s) => s.documents[s.activeDocumentId] ?? null);
  const canvasTransform = useEditorStore((s) => s.canvasTransform);
  const canvasFitToContentScale = useEditorStore((s) => s.canvasFitToContentScale);
  const fitToContentModeActive = useEditorStore((s) => s.fitToContentModeActive);
  const showGrid = useEditorStore((s) => s.showGrid);
  const snapModes = useEditorStore((s) => s.snapModes);
  const selectedIds = useEditorStore((s) => s.selectedElementIds);
  const pendingRequestId = useEditorStore((s) => s.pendingRequestId);
  const toolMode = useEditorStore((s) => s.toolMode);
  const activeCanvasDragKind = useEditorStore((s) => s.activeCanvasDragKind);
  const activeSourceScrubSourceId = useEditorStore((s) => s.activeSourceScrubSourceId);
  const canvasStatusHint = useEditorStore((s) => s.canvasStatusHint);
  const wireSource = useEditorStore((s) => s.wireSource);
  const clipboardPlacementCount = useEditorStore((s) => s.clipboardPlacementCount);
  const dispatch = useEditorStore((s) => s.dispatch);

  const snapActive = Boolean(snapModes && (snapModes.grid || snapModes.guides || snapModes.points || snapModes.gaps));
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const canvas = document.querySelector<HTMLElement>('[data-testid="canvas-viewport"]');
      if (!canvas) {
        setCursorPos(null);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        const x = Math.round((e.clientX - rect.left - canvasTransform.translateX) / canvasTransform.scale);
        const y = Math.round((e.clientY - rect.top - canvasTransform.translateY) / canvasTransform.scale);
        setCursorPos({ x, y });
      } else {
        setCursorPos(null);
      }
    };
    window.addEventListener("pointermove", handlePointerMove);
    return () => { window.removeEventListener("pointermove", handlePointerMove); };
  }, [canvasTransform]);

  const showPerf = import.meta.env.DEV;
  const perfStats = useFrameTimingStats(activeCanvasDragKind, showPerf);

  const parseResult = snapshot.parseResult;
  const semanticResult = snapshot.semanticResult;
  const incrementalInfo = snapshot.incremental;

  const parseDiags = parseResult?.diagnostics ?? [];
  const semanticDiags = semanticResult?.diagnostics ?? [];
  const allDiags = [...parseDiags, ...semanticDiags];
  const errorCount = allDiags.filter((d) => d.severity === "error").length;
  const warnCount = allDiags.filter((d) => d.severity === "warning").length;

  const elementCount = snapshot.scene?.elements.length ?? 0;
  const selectedCount = selectedIds.size;
  const figures = snapshot.figures;
  const activeFigureIndex = activeFigureId ? figures.findIndex((figure) => figure.id === activeFigureId) : -1;
  const showFigureContext = figures.length > 1 && activeFigureIndex >= 0;
  const zoomPercent = Math.round((canvasTransform.scale / ACTUAL_SIZE_SCALE) * 100);
  const fitToContentDoubleZoomPercent = canvasFitToContentScale == null
    ? MAX_ZOOM_PERCENT
    : Math.ceil((canvasFitToContentScale / ACTUAL_SIZE_SCALE) * 200);
  const maxZoomPercent = Math.max(MAX_ZOOM_PERCENT, fitToContentDoubleZoomPercent, zoomPercent);
  const sliderZoomPercent = Math.max(MIN_ZOOM_PERCENT, Math.min(maxZoomPercent, zoomPercent));
  const zoomOptions = [...new Set([
    ...ZOOM_LEVELS.filter((level) => level <= maxZoomPercent),
    maxZoomPercent,
    zoomPercent
  ])].sort((left, right) => left - right);

  const requestZoomPercent = (percent: number) => {
    if (!Number.isFinite(percent)) {
      return;
    }
    dispatch({ type: "REQUEST_ZOOM_SCALE", scale: (percent / 100) * ACTUAL_SIZE_SCALE });
  };
  const toggleFitToContent = () => {
    if (fitToContentModeActive) {
      dispatch({ type: "SET_FIT_TO_CONTENT_MODE", active: false });
      return;
    }
    dispatch({ type: "REQUEST_FIT_TO_CONTENT" });
  };

  const perfClassName = css.ok;
  const perfSummary = perfStats.frameCount === 0
    ? "warming…"
    : `${formatPerf(perfStats.fps, 0)} fps · p95 ${formatPerf(perfStats.p95FrameMs)} ms · max ${formatPerf(perfStats.maxFrameMs)} ms`;
  const dragSummary = perfStats.dragFrameCount > 0
    ? ` · drag max ${formatPerf(perfStats.dragMaxFrameMs)} ms${activeCanvasDragKind ? ` (${activeCanvasDragKind})` : ""}`
    : "";
  const showIncrementalFallback =
    showPerf &&
    incrementalInfo != null &&
    (
      (incrementalInfo.parseStrategy === "full" &&
        incrementalInfo.parseFallbackReason !== undefined &&
        incrementalInfo.parseFallbackReason !== "no-previous-cache") ||
      (incrementalInfo.strategy === "full" &&
        incrementalInfo.fallbackReason !== "no-previous-cache")
    );
  const incrementalFallbackClass =
    incrementalInfo?.parseFallbackReason === "runtime-error" ||
    incrementalInfo?.fallbackReason === "runtime-error" ||
    incrementalInfo?.fallbackReason === "restore-failed"
      ? css.error
      : css.warning;
  const incrementalFallbackReason = [
    incrementalInfo?.parseStrategy === "full" && incrementalInfo.parseFallbackReason
      ? `parser ${incrementalInfo.parseFallbackReason}`
      : null,
    incrementalInfo?.strategy === "full" && incrementalInfo.fallbackReason
      ? `semantic ${incrementalInfo.fallbackReason}`
      : null
  ].filter(Boolean).join(" + ") || "unknown";
  const modifierHint = resolveModifierHint(
    activeCanvasDragKind,
    activeSourceScrubSourceId,
    toolMode,
    getModifierKeyLabels()
  );
  const placementHint = resolvePlacementHint(toolMode, clipboardPlacementCount);

  return (
    <div className={css.bar} data-testid="status-bar" data-select="chrome">
      <div className={css.group}>
        {showFigureContext && (
          <div className={css.cell}>
            <span>图形 {activeFigureIndex + 1} / {figures.length}</span>
          </div>
        )}

        <div className={css.cell}>
          <span>{elementCount} 个对象</span>
        </div>

        <div className={css.cell}>
          <span>{selectedCount > 0 ? `已选择 ${selectedCount} 项` : "未选择"}</span>
        </div>

        <div className={css.cell} title="光标坐标">
          <span>{cursorPos ? `坐标: (${cursorPos.x}, ${cursorPos.y})` : "坐标: (—, —)"}</span>
        </div>

        <div className={css.cell} title={`网格: ${showGrid ? "显示" : "隐藏"} · 吸附: ${snapActive ? "开启" : "关闭"}`}>
          <span className={css.label}>网格 / 吸附:</span>
          <span>{showGrid ? "网格开" : "网格关"} · {snapActive ? "吸附开" : "吸附关"}</span>
        </div>

        {showPerf && (
          <div className={css.cell}>
            <span className={css.label}>性能:</span>
            <span className={perfClassName}>
              {perfSummary}
              {dragSummary}
            </span>
          </div>
        )}

        {showIncrementalFallback && (
          <div className={css.cell}>
            <span className={css.label}>增量:</span>
            <span className={incrementalFallbackClass}>
              降级 ({incrementalFallbackReason})
            </span>
          </div>
        )}

        {canvasStatusHint && (
          <div className={css.cell}>
            <span className={css.hint}>{canvasStatusHint}</span>
          </div>
        )}

        {placementHint && (
          <div className={css.cell}>
            <span className={css.hint} data-testid="placement-hint">{placementHint}</span>
          </div>
        )}

        {wireSource && (
          <div className={css.cell}>
            <span className={css.hint} data-testid="wire-source">
              {`Wire source: ${formatWireSource(wireSource)}`}
            </span>
          </div>
        )}

        {modifierHint && (
          <div className={css.cell}>
            <span className={css.label}>快捷键:</span>
            <span className={css.hint}>{modifierHint}</span>
          </div>
        )}
      </div>

      <div className={css.spacer} />

      <div className={css.group}>
        {currentDocument?.dirty && (
          <div className={css.cell}>
            <span>未保存</span>
          </div>
        )}

        {currentDocument?.externalChangeStatus && currentDocument.externalChangeStatus !== "none" ? (
          <div className={css.cell}>
            <span className={css.warning}>
              {currentDocument.externalChangeStatus === "changed"
                ? "磁盘文件已修改"
                : currentDocument.externalChangeStatus === "missing"
                  ? "文件丢失"
                  : currentDocument.externalChangeStatus === "permission-needed"
                    ? "需要文件权限"
                    : "文件同步错误"}
            </span>
          </div>
        ) : null}

        <div className={css.cell}>
          {pendingRequestId ? (
            <span className={css.warning}>正在计算...</span>
          ) : errorCount > 0 ? (
            <span className={css.error}>编译错误</span>
          ) : (
            <span className={css.ok}>就绪</span>
          )}
        </div>

        {errorCount > 0 && (
          <div className={css.cell}>
            <span className={css.error}>{errorCount} 个错误</span>
          </div>
        )}

        {warnCount > 0 && (
          <div className={css.cell}>
            <span className={css.warning}>{warnCount} 个警告</span>
          </div>
        )}

        <RenderedTooltip content={showGrid ? "隐藏网格" : "显示网格"}>
          <button
            type="button"
            className={[css.iconButton, showGrid ? css.iconButtonActive : ""].filter(Boolean).join(" ")}
            aria-label={showGrid ? "隐藏网格" : "显示网格"}
            aria-pressed={showGrid}
            onClick={() => { dispatch({ type: "TOGGLE_CANVAS_AID", aid: "grid" }); }}
          >
            <RiGridLine size={15} aria-hidden="true" />
          </button>
        </RenderedTooltip>

        <RenderedTooltip content="适应内容 (F)">
          <button
            type="button"
            className={[css.iconButton, fitToContentModeActive ? css.iconButtonActive : ""].filter(Boolean).join(" ")}
            aria-label="适应内容"
            aria-pressed={fitToContentModeActive}
            onClick={toggleFitToContent}
          >
            <RiAspectRatioLine size={15} aria-hidden="true" />
          </button>
        </RenderedTooltip>

        <span className={css.label} title={`缩放: ${zoomPercent}%`}>缩放:</span>
        <input
          className={css.zoomSlider}
          type="range"
          min={MIN_ZOOM_PERCENT}
          max={maxZoomPercent}
          step={1}
          value={sliderZoomPercent}
          aria-label={`缩放: ${zoomPercent}%`}
          onChange={(event) => { requestZoomPercent(Number(event.currentTarget.value)); }}
        />

        <span className={css.zoomSelectWrap}>
          <select
            className={css.zoomSelect}
            value={String(zoomPercent)}
            aria-label="缩放百分比"
            onChange={(event) => { requestZoomPercent(Number(event.currentTarget.value)); }}
          >
            {zoomOptions.map((level) => (
              <option key={level} value={level}>{level}%</option>
            ))}
          </select>
          <RiArrowDownSLine className={css.zoomSelectCaret} size={14} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

function formatPerf(value: number | null, digits = 1): string {
  return value == null ? "—" : value.toFixed(digits);
}

/**
 * Status-bar text for a wire-draft origin. Matches the reference tool's wording: pins and other
 * positioned sources use a colon (`terminal:M8:D`), while a wire-trunk branch is space-separated
 * (`route route-ul-40`).
 */
function formatWireSource(source: WireSourceDescriptor): string {
  return source.kind === "route" ? `route ${source.id}` : `${source.kind}:${source.id}`;
}

function resolveModifierHint(
  activeCanvasDragKind: CanvasDragKind | null,
  activeSourceScrubSourceId: string | null,
  toolMode: ToolMode,
  keys: ModifierKeyLabels
): string | null {
  if (activeSourceScrubSourceId) {
    return `${keys.shift} 较慢调节数值 · ${keys.alt} 较快调节数值`;
  }

  switch (activeCanvasDragKind) {
    case "rotate":
      return `${keys.shift} 步进 15° 吸附 · ${keys.primary} 忽略吸附 · ${keys.alt} 绕中心旋转`;
    case "resize":
      return `${keys.shift} 保持比例`;
    case "element":
      return `${keys.primary} 忽略吸附`;
    case "handle":
      return `${keys.primary} 忽略吸附`;
    case "tool-create":
      return resolveToolCreateModifierHint(toolMode, keys);
    case "marquee":
      return `${keys.shift} 或 ${keys.primary} 添加到选择`;
    case "pan":
    case null:
      return null;
  }
}

/**
 * Gesture readout for the sticky circuit-placement modes and the clipboard-placement draft.
 * Placement is the one place where "what happens on the next click" is not obvious, so the bar
 * states the gesture itself (rotate / mirror / next-click) the way the reference tool does.
 */
const CIRCUIT_PLACEMENT_MODES = [
  "addResistor",
  "addNMOS",
  "addPMOS",
  "addDotNode",
  "addIoNode",
  "addVDD",
  "addCapacitor",
  "addGND",
  "addCurrentSource",
  "addControlledCurrentSource",
  "addVoltageSource",
  "addCurrentArrow",
  "addWireLead",
  "addPowerRail"
] as const;

function isCircuitPlacementMode(toolMode: ToolMode): boolean {
  return CIRCUIT_PLACEMENT_MODES.some((prefix) => toolMode.startsWith(prefix));
}

function resolvePlacementHint(
  toolMode: ToolMode,
  clipboardPlacementCount: number | null | undefined
): string | null {
  if (clipboardPlacementCount != null && clipboardPlacementCount > 0) {
    // Matches the reference tool's `Copied 1 components · click to place another · Esc exits`.
    return `Copied ${clipboardPlacementCount} component${clipboardPlacementCount === 1 ? "" : "s"} · click to place another · Esc exits`;
  }
  if (toolMode.startsWith("addPowerRail")) {
    return "Power rail: click the first end, then the second · Esc cancels";
  }
  if (isCircuitPlacementMode(toolMode)) {
    // Matches the reference tool's placement banner; `R` alone still rotates, H/Y and V/X keep
    // their existing mirrors, and W/A/S/D keep switching orientation.
    return "Place component mirrored left/right · R rotates · Shift+R / Ctrl+R mirrors · click to place another · Esc exits";
  }
  return null;
}

function resolveToolCreateModifierHint(toolMode: ToolMode, keys: ModifierKeyLabels): string {
  const snapHint = `${keys.primary} 忽略吸附`;
  switch (toolMode) {
    case "addRect":
      return `${keys.shift} 绘制正方形 · ${snapHint}`;
    case "addEllipse":
      return `${keys.shift} 绘制正圆 · ${snapHint}`;
    case "addGrid":
      return `${keys.shift} 绘制正方形网格 · ${snapHint}`;
    case "select":
    case "magnify":
    case "addBucket":
    case "addNode":
    case "addMatrix":
    case "addShape":
    case "addPath":
    case "addFreehand":
    case "addLine":
    case "addCircle":
    case "addArrow":
    case "addBezier":
      return snapHint;
    // The wire tool is the one place where "what do I do next" is genuinely unclear, so state the
    // gesture itself rather than a modifier note.
    case "addOrthoWire":
      return "点击引脚开始，然后点击目标引脚 · Shift+F3 拐角模式 · Space 拐角侧 · Esc 取消";
    case "addRoundedLine":
      return "点击开始，再次点击完成 · Esc 取消";
    // Circuit tools and the remaining wire tools were not listed, so this returned undefined while
    // the signature promised a string. Fall back to the generic modifier hint.
    default:
      return snapHint;
  }
}
