import { useEffect, useMemo, useState } from "react";
import type { EmitSvgResult } from "tikz-editor/svg/index";
import {
  exportPngDownload,
  normalizePngExportDpi,
  renderPngExport
} from "./export-commands";
import { Modal } from "./Modal";
import css from "./PngExportModal.module.css";

const DEFAULT_FILE_NAME = "tikz-export.png";

let rememberedDpi = "144";
let rememberedTransparentBackground = true;

type PreviewState =
  | {
      status: "loading";
      previousUrl: string | null;
      previousPixelWidth: number | null;
      previousPixelHeight: number | null;
      previousDpi: number | null;
    }
  | { status: "error"; message: string }
  | {
      status: "ready";
      url: string;
      pixelWidth: number;
      pixelHeight: number;
      dpi: number;
    };

type PngExportModalProps = {
  svgResult: EmitSvgResult;
  onClose: () => void;
};

export function PngExportModal({ svgResult, onClose }: PngExportModalProps) {
  const [dpiInput, setDpiInput] = useState(rememberedDpi);
  const [transparentBackground, setTransparentBackground] = useState(rememberedTransparentBackground);
  const [preview, setPreview] = useState<PreviewState>({
    status: "loading",
    previousUrl: null,
    previousPixelWidth: null,
    previousPixelHeight: null,
    previousDpi: null
  });
  const [downloadPending, setDownloadPending] = useState(false);
  const [showRefreshOverlay, setShowRefreshOverlay] = useState(false);

  const effectiveDpi = useMemo(() => normalizePngExportDpi(parseDpiInput(dpiInput)), [dpiInput]);

  useEffect(() => {
    rememberedDpi = dpiInput;
  }, [dpiInput]);

  useEffect(() => {
    rememberedTransparentBackground = transparentBackground;
  }, [transparentBackground]);

  useEffect(() => {
    let active = true;
    let nextPreviewUrl: string | null = null;

    setPreview((current) => ({
      status: "loading",
      previousUrl: current.status === "ready" ? current.url : current.status === "loading" ? current.previousUrl : null,
      previousPixelWidth:
        current.status === "ready"
          ? current.pixelWidth
          : current.status === "loading"
            ? current.previousPixelWidth
            : null,
      previousPixelHeight:
        current.status === "ready"
          ? current.pixelHeight
          : current.status === "loading"
            ? current.previousPixelHeight
            : null
      ,
      previousDpi:
        current.status === "ready"
          ? current.dpi
          : current.status === "loading"
            ? current.previousDpi
            : null
    }));

    void renderPngExport(svgResult, {
      dpi: effectiveDpi,
      transparentBackground,
      fileName: DEFAULT_FILE_NAME
    }).then(
      (result) => {
        if (!active) {
          return;
        }
        nextPreviewUrl = URL.createObjectURL(result.blob);
        setPreview({
          status: "ready",
          url: nextPreviewUrl,
          pixelWidth: result.pixelWidth,
          pixelHeight: result.pixelHeight,
          dpi: result.dpi
        });
      },
      (error) => {
        if (!active) {
          return;
        }
        setPreview({
          status: "error",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    );

    return () => {
      active = false;
      if (nextPreviewUrl) {
        URL.revokeObjectURL(nextPreviewUrl);
      }
    };
  }, [effectiveDpi, svgResult, transparentBackground]);

  useEffect(() => {
    if (!(preview.status === "loading" && preview.previousUrl)) {
      setShowRefreshOverlay(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowRefreshOverlay(true);
    }, 180);

    return () => {
      window.clearTimeout(timer);
      setShowRefreshOverlay(false);
    };
  }, [preview]);

  const handleExport = async () => {
    setDownloadPending(true);
    try {
      const exported = await exportPngDownload(svgResult, {
        dpi: effectiveDpi,
        transparentBackground,
        fileName: DEFAULT_FILE_NAME
      });
      if (exported) {
        onClose();
      }
    } finally {
      setDownloadPending(false);
    }
  };

  const previewDisplay =
    preview.status === "ready"
      ? {
          url: preview.url,
          pixelWidth: preview.pixelWidth,
          pixelHeight: preview.pixelHeight,
          dpi: preview.dpi,
          isRefreshing: false
        }
      : preview.status === "loading" && preview.previousUrl
        ? {
            url: preview.previousUrl,
            pixelWidth: preview.previousPixelWidth ?? Math.max(1, Math.ceil(svgResult.viewBox.width * (effectiveDpi / 72))),
            pixelHeight: preview.previousPixelHeight ?? Math.max(1, Math.ceil(svgResult.viewBox.height * (effectiveDpi / 72))),
            dpi: preview.previousDpi ?? effectiveDpi,
            isRefreshing: true
          }
        : null;

  const canExport = !downloadPending && previewDisplay != null;

  return (
    <Modal
      onClose={onClose}
      size="lg"
      labelledBy="png-export-title"
      dataTestId="png-export-modal"
      className={css.dialog}
    >
      <Modal.Header
        title="导出 PNG"
        titleId="png-export-title"
        showCloseButton
        onClose={onClose}
        closeAriaLabel="关闭 PNG 导出"
      />

      <Modal.Body padding="none" scroll={false}>
        <div className={css.body}>
          <div className={css.previewColumn}>
            <div
              className={[
                css.previewFrame,
                transparentBackground ? css.previewFrameTransparent : css.previewFrameOpaque
              ].join(" ")}
            >
              {previewDisplay ? (
                <div className={css.previewStack}>
                  <img
                    className={[
                      css.previewImage,
                      previewDisplay.isRefreshing ? css.previewImageRefreshing : ""
                    ].filter(Boolean).join(" ")}
                    src={previewDisplay.url}
                    alt="PNG 导出预览"
                  />
                  {previewDisplay.isRefreshing && showRefreshOverlay ? (
                    <div className={css.previewOverlay} data-select="text">正在渲染预览…</div>
                  ) : null}
                </div>
              ) : (
                <div className={css.previewStatus} data-select="text">
                  {preview.status === "loading"
                    ? "正在渲染预览…"
                    : preview.status === "error"
                      ? preview.message
                      : "预览不可用。"}
                </div>
              )}
            </div>
            <div className={css.previewMeta} data-select="text">
              {previewDisplay ? (
                <>
                  <span>{previewDisplay.pixelWidth} × {previewDisplay.pixelHeight}px</span>
                  <span>{previewDisplay.dpi} DPI</span>
                  <span>{transparentBackground ? "透明背景" : "白色背景"}</span>
                </>
              ) : (
                <span>修改导出设置时将实时更新 PNG 预览。</span>
              )}
            </div>
          </div>

          <form
            className={css.controls}
            onSubmit={(event) => {
              event.preventDefault();
              if (canExport) {
                void handleExport();
              }
            }}
          >
            <label className={css.field}>
              <span className={css.label}>分辨率 (DPI)</span>
              <input
                type="number"
                min={36}
                max={1200}
                step={1}
                inputMode="numeric"
                className={css.input}
                value={dpiInput}
                onChange={(event) => { setDpiInput(event.target.value); }}
              />
              <span className={css.help}>画板导出将使用所选 DPI 计算 PNG 像素尺寸（例如 72 DPI 为 1x 标准，144 DPI 为 2x 高清，288 DPI 为 4x 超清）。</span>
            </label>

            <label className={css.checkboxRow}>
              <input
                type="checkbox"
                checked={transparentBackground}
                onChange={(event) => { setTransparentBackground(event.target.checked); }}
              />
              <span className={css.checkboxText}>
                <span className={css.label}>透明背景</span>
                <span className={css.helpBlock}>关闭此选项以包含白色背景（纯白不透明）。</span>
              </span>
            </label>

            <div className={css.summary}>
              <div className={css.summaryRow}>
                <span>画布尺寸</span>
                <span>
                  {(previewDisplay?.pixelWidth ?? Math.max(1, Math.ceil(svgResult.viewBox.width * (effectiveDpi / 72))))} ×{" "}
                  {(previewDisplay?.pixelHeight ?? Math.max(1, Math.ceil(svgResult.viewBox.height * (effectiveDpi / 72))))}px
                </span>
              </div>
              <div className={css.summaryRow}>
                <span>源图形边界</span>
                <span>
                  {svgResult.viewBox.width.toFixed(1)} × {svgResult.viewBox.height.toFixed(1)}pt
                </span>
              </div>
              <div className={css.summaryRow}>
                <span>背景</span>
                <span>{transparentBackground ? "保留透明 (Alpha)" : "不透明纯白"}</span>
              </div>
            </div>
          </form>
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Modal.SecondaryButton data-testid="png-export-cancel" onClick={onClose}>
          取消
        </Modal.SecondaryButton>
        <Modal.PrimaryButton
          data-testid="png-export-download"
          disabled={!canExport}
          onClick={() => {
            void handleExport();
          }}
        >
          {downloadPending ? "导出中…" : "下载 PNG"}
        </Modal.PrimaryButton>
      </Modal.Footer>
    </Modal>
  );
}

function parseDpiInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}
