import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import type { EmitSvgResult } from "tikz-editor/svg/index";
import {
  copySvgText,
  downloadSvgMarkup,
  preloadSvgOptimizer,
  serializeSvgForExport,
  transformSvgMarkup,
  validateSvgMarkup,
  type SvgTransformPreset
} from "./export-commands";
import { Modal } from "./Modal";
import css from "./SvgExportModal.module.css";

const DEFAULT_FILE_NAME = "tikz-export.svg";
const SVG_CODE_EDITOR_ARIA_LABEL = "SVG 代码";

const SvgCodeEditor = lazy(async () => {
  const mod = await import("./SvgCodeEditor");
  return { default: mod.SvgCodeEditor };
});

let rememberedFileName = DEFAULT_FILE_NAME;

type OptimizerState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

type SvgExportModalProps = {
  svgResult: EmitSvgResult;
  onClose: () => void;
};

export function SvgExportModal({ svgResult, onClose }: SvgExportModalProps) {
  const [fileName, setFileName] = useState(rememberedFileName);
  const [markup, setMarkup] = useState("");
  const [baselineMarkup, setBaselineMarkup] = useState("");
  const [loadingMarkup, setLoadingMarkup] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [optimizerState, setOptimizerState] = useState<OptimizerState>({ status: "loading" });
  const [activeTransform, setActiveTransform] = useState<SvgTransformPreset | null>(null);
  const [copyPending, setCopyPending] = useState(false);
  const [downloadPending, setDownloadPending] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    rememberedFileName = fileName;
  }, [fileName]);

  useEffect(() => {
    let active = true;
    setLoadingMarkup(true);
    setLoadError(null);
    setOptimizerState({ status: "loading" });
    setCopyFeedback(null);

    void serializeSvgForExport(svgResult).then(
      (text) => {
        if (!active) {
          return;
        }
        setMarkup(text);
        setBaselineMarkup(text);
        setLoadingMarkup(false);
      },
      (error) => {
        if (!active) {
          return;
        }
        setLoadError(error instanceof Error ? error.message : String(error));
        setLoadingMarkup(false);
      }
    );

    void preloadSvgOptimizer().then(
      () => {
        if (active) {
          setOptimizerState({ status: "ready" });
        }
      },
      (error) => {
        if (active) {
          setOptimizerState({
            status: "error",
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }
    );

    return () => {
      active = false;
    };
  }, [svgResult]);

  useEffect(() => {
    if (!copyFeedback) {
      return;
    }
    const timer = window.setTimeout(() => { setCopyFeedback(null); }, 1800);
    return () => { window.clearTimeout(timer); };
  }, [copyFeedback]);

  const validation = useMemo(() => validateSvgMarkup(markup), [markup]);

  const previewUrl = usePreviewUrl(markup, validation.valid);
  const isBusy = loadingMarkup || activeTransform != null || downloadPending || copyPending;
  const canExportMarkup = !loadingMarkup && loadError == null && validation.valid && markup.trim().length > 0;
  const lineCount = markup.length === 0 ? 0 : markup.split(/\r?\n/).length;
  const hasEdits = markup !== baselineMarkup;

  const handleTransform = async (preset: SvgTransformPreset) => {
    if (optimizerState.status !== "ready") {
      return;
    }
    setActiveTransform(preset);
    setCopyFeedback(null);
    try {
      const nextMarkup = await transformSvgMarkup(markup, preset);
      setMarkup(nextMarkup);
    } catch (error) {
      setCopyFeedback(error instanceof Error ? error.message : String(error));
    } finally {
      setActiveTransform(null);
    }
  };

  const handleCopy = async () => {
    if (!canExportMarkup) {
      return;
    }
    setCopyPending(true);
    setCopyFeedback(null);
    try {
      const copied = await copySvgText(markup);
      setCopyFeedback(copied ? "已复制 SVG 代码至剪贴板。" : "复制到剪贴板失败。");
    } finally {
      setCopyPending(false);
    }
  };

  const handleDownload = async () => {
    if (!canExportMarkup) {
      return;
    }
    setDownloadPending(true);
    try {
      const exported = await downloadSvgMarkup(markup, { fileName });
      if (exported) {
        onClose();
      }
    } finally {
      setDownloadPending(false);
    }
  };

  const handleMarkupChange = (nextMarkup: string) => {
    setMarkup(nextMarkup);
    setCopyFeedback(null);
  };

  return (
    <Modal
      onClose={onClose}
      size="xl"
      labelledBy="svg-export-title"
      dataTestId="svg-export-modal"
      className={css.dialog}
    >
      <Modal.Header
        title="导出 SVG"
        titleId="svg-export-title"
        showCloseButton
        onClose={onClose}
        closeAriaLabel="关闭 SVG 导出"
      />

      <Modal.Body padding="none" scroll={false}>
        <div className={css.body}>
          <div className={css.previewColumn}>
            <div className={css.previewFrame}>
              {loadingMarkup ? (
                <div className={css.previewStatus} data-select="text">正在准备 SVG 导出…</div>
              ) : loadError ? (
                <div className={css.previewStatus} data-select="text">{loadError}</div>
              ) : !validation.valid ? (
                <div className={css.previewStatus} data-select="text">{validation.message}</div>
              ) : previewUrl ? (
                <img className={css.previewImage} src={previewUrl} alt="SVG 导出预览" />
              ) : (
                <div className={css.previewStatus} data-select="text">此浏览器不支持 SVG 预览。</div>
              )}
            </div>

            <div className={css.metaRow} data-select="text">
              <span>{svgResult.viewBox.width.toFixed(1)} × {svgResult.viewBox.height.toFixed(1)}pt</span>
              <span>{markup.length.toLocaleString()} 字符</span>
              <span>{lineCount.toLocaleString()} 行</span>
              <span>{hasEdits ? "已编辑" : "渲染生成"}</span>
            </div>
          </div>

          <div className={css.controlColumn}>
            <div className={css.controls}>
              <label className={css.field}>
                <span className={css.label}>文件名</span>
                <input
                  type="text"
                  className={css.input}
                  value={fileName}
                  onChange={(event) => { setFileName(event.target.value); }}
                />
              </label>

              <div className={css.field}>
                <span className={css.label}>SVGO 优化工具</span>
                <div className={css.transformRow}>
                  <Modal.SecondaryButton
                    disabled={loadingMarkup || loadError != null || optimizerState.status !== "ready" || activeTransform != null}
                    onClick={() => {
                      void handleTransform("beautify");
                    }}
                  >
                    {activeTransform === "beautify" ? "美化中…" : "美化排版"}
                  </Modal.SecondaryButton>
                  <Modal.SecondaryButton
                    disabled={loadingMarkup || loadError != null || optimizerState.status !== "ready" || activeTransform != null}
                    onClick={() => {
                      void handleTransform("compress");
                    }}
                  >
                    {activeTransform === "compress" ? "压缩中…" : "压缩代码"}
                  </Modal.SecondaryButton>
                  <Modal.GhostButton
                    disabled={loadingMarkup || !hasEdits}
                    onClick={() => {
                      setMarkup(baselineMarkup);
                      setCopyFeedback(null);
                    }}
                  >
                    重置
                  </Modal.GhostButton>
                </div>
                {optimizerState.status === "error" ? (
                  <span className={css.help} data-select="text">SVGO 不可用: {optimizerState.message}</span>
                ) : null}
                {copyFeedback ? <span className={css.help} data-select="text">{copyFeedback}</span> : null}
              </div>
            </div>

            <label className={css.editorLabel}>
              <span className={css.label}>SVG 代码</span>
              <Suspense
                fallback={(
                  <textarea
                    className={css.textarea}
                    value={markup}
                    spellCheck={false}
                    aria-label={SVG_CODE_EDITOR_ARIA_LABEL}
                    onChange={(event) => {
                      handleMarkupChange(event.target.value);
                    }}
                  />
                )}
              >
                <SvgCodeEditor
                  value={markup}
                  ariaLabel={SVG_CODE_EDITOR_ARIA_LABEL}
                  onChange={handleMarkupChange}
                />
              </Suspense>
            </label>
          </div>
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Modal.SecondaryButton data-testid="svg-export-cancel" onClick={onClose}>
          取消
        </Modal.SecondaryButton>
        <Modal.SecondaryButton
          data-testid="svg-export-copy"
          disabled={isBusy || !canExportMarkup}
          onClick={() => {
            void handleCopy();
          }}
        >
          {copyPending ? "复制中…" : "复制到剪贴板"}
        </Modal.SecondaryButton>
        <Modal.PrimaryButton
          data-testid="svg-export-download"
          disabled={isBusy || !canExportMarkup}
          onClick={() => {
            void handleDownload();
          }}
        >
          {downloadPending ? "导出中…" : "下载 SVG"}
        </Modal.PrimaryButton>
      </Modal.Footer>
    </Modal>
  );
}

function usePreviewUrl(svgMarkup: string, enabled: boolean): string | null {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (
      !enabled ||
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function" ||
      typeof URL.revokeObjectURL !== "function" ||
      typeof Blob === "undefined"
    ) {
      setPreviewUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" }));
    setPreviewUrl(nextUrl);
    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [enabled, svgMarkup]);

  return previewUrl;
}
