import { useState } from "react";
import { useSettingsStore } from "../settings/useSettingsStore";
import {
  BASE_FONT_SIZE_OPTIONS,
  EDITOR_FONT_SIZE_OPTIONS,
  type BaseFontSize,
  type ColorPickerAccuracy,
  type ColorScheme,
  type GridSize,
  type MathJaxFont
} from "../settings/types";
import { Modal } from "./Modal";
import css from "./SettingsModal.module.css";

type CategoryId = "general" | "editor" | "canvas";

const MATHJAX_FONTS: { value: MathJaxFont; label: string }[] = [
  { value: "arial-bold",      label: "Arial Bold (IEEE 电路 / 无衬线)" },
  { value: "mathjax-newcm",   label: "New Computer Modern" },
  { value: "mathjax-asana",   label: "Asana Math" },
  { value: "mathjax-bonum",   label: "Gyre Bonum" },
  { value: "mathjax-dejavu",  label: "DejaVu" },
  { value: "mathjax-fira",    label: "Fira / Fira Math" },
  { value: "mathjax-modern",  label: "Latin Modern" },
  { value: "mathjax-pagella", label: "Gyre Pagella" },
  { value: "mathjax-schola",  label: "Gyre Schola" },
  { value: "mathjax-stix2",   label: "STIX2" },
  { value: "mathjax-termes",  label: "Gyre Termes" },
  { value: "mathjax-tex",     label: "TeX (经典 MathJax v3)" },
];

const BASE_FONT_SIZE_LABELS: Record<BaseFontSize, string> = {
  9: "9 pt (IEEE 图表标准)",
  10: "10 pt (默认 / 期刊标准)",
  11: "11 pt (中号)",
  12: "12 pt (书籍 / 论文 / 报告)"
};

const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: "general", label: "常规设置" },
  { id: "editor", label: "代码编辑器" },
  { id: "canvas", label: "画板与渲染" }
];

let rememberedCategory: CategoryId = "general";
const MIN_FORMATTER_MAX_LINE_LENGTH = 40;
const MAX_FORMATTER_MAX_LINE_LENGTH = 240;

type SettingsModalProps = {
  onClose: () => void;
};

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryId>(rememberedCategory);
  const [formatterMaxLineLengthInput, setFormatterMaxLineLengthInput] = useState<string | null>(null);

  const selectCategory = (id: CategoryId) => {
    rememberedCategory = id;
    setActiveCategory(id);
  };
  const settings = useSettingsStore((s) => s.settings);
  const updateGeneralSettings = useSettingsStore((s) => s.updateGeneralSettings);
  const updateEditorSettings = useSettingsStore((s) => s.updateEditorSettings);
  const updateCanvasSettings = useSettingsStore((s) => s.updateCanvasSettings);
  const updateColorPickerSettings = useSettingsStore((s) => s.updateColorPickerSettings);
  const updateRenderingSettings = useSettingsStore((s) => s.updateRenderingSettings);
  const resetGeneralSettings = useSettingsStore((s) => s.resetGeneralSettings);
  const resetEditorSettings = useSettingsStore((s) => s.resetEditorSettings);
  const resetCanvasSettings = useSettingsStore((s) => s.resetCanvasSettings);
  const formatterMaxLineLengthValue = formatterMaxLineLengthInput ?? String(settings.editor.formatterMaxLineLength);

  const commitFormatterMaxLineLength = () => {
    const parsed = Number(formatterMaxLineLengthValue);
    const clamped = Number.isFinite(parsed)
      ? Math.max(MIN_FORMATTER_MAX_LINE_LENGTH, Math.min(MAX_FORMATTER_MAX_LINE_LENGTH, Math.round(parsed)))
      : settings.editor.formatterMaxLineLength;

    updateEditorSettings({ formatterMaxLineLength: clamped });
    setFormatterMaxLineLengthInput(null);
  };

  const resetActiveCategoryToDefaults = () => {
    if (activeCategory === "general") {
      resetGeneralSettings();
      return;
    }
    if (activeCategory === "editor") {
      resetEditorSettings();
      setFormatterMaxLineLengthInput(null);
      return;
    }
    resetCanvasSettings();
  };

  return (
    <Modal
      onClose={onClose}
      size="lg"
      labelledBy="settings-title"
      dataTestId="settings-modal"
      className={css.dialog}
    >
      <Modal.Header
        title="设置"
        titleId="settings-title"
        showCloseButton
        onClose={onClose}
        closeAriaLabel="关闭设置"
      />

      <Modal.Body padding="none" scroll={false}>
        <div className={css.bodyLayout}>
          <nav className={css.sidebar}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={[css.navItem, activeCategory === cat.id ? css.navItemActive : ""].filter(Boolean).join(" ")}
                onClick={() => { selectCategory(cat.id); }}
                data-testid={`settings-category-${cat.id}`}
              >
                {cat.label}
              </button>
            ))}
          </nav>

          <div className={css.content}>
            {activeCategory === "general" && (
              <div className={css.panel}>
                <div className={css.panelTitle}>常规设置</div>
                <div className={css.settingsGroup}>
                  <div className={css.settingRow}>
                    <label className={css.settingLabel} htmlFor="setting-ui-font-size">
                      界面字体大小
                      <span className={css.settingDesc}>调整应用程序界面的文本字体大小。</span>
                    </label>
                    <select
                      id="setting-ui-font-size"
                      className={css.select}
                      value={settings.general.uiFontSizePx}
                      onChange={(e) => { updateGeneralSettings({ uiFontSizePx: Number(e.target.value) }); }}
                    >
                      {[10, 11, 12, 13, 14].map((size) => (
                        <option key={size} value={size}>{size}px</option>
                      ))}
                    </select>
                  </div>

                  <div className={css.settingRow}>
                    <label className={css.settingLabel} htmlFor="setting-color-scheme">
                      色彩主题
                      <span className={css.settingDesc}>控制应用程序界面的浅色/深色主题。</span>
                    </label>
                    <select
                      id="setting-color-scheme"
                      className={css.select}
                      value={settings.general.colorScheme}
                      onChange={(e) => { updateGeneralSettings({ colorScheme: e.target.value as ColorScheme }); }}
                    >
                      <option value="system">跟随系统（默认）</option>
                      <option value="light">浅色模式</option>
                      <option value="dark">深色模式</option>
                    </select>
                  </div>

                  <div className={css.settingRow}>
                    <label className={css.settingLabel} htmlFor="setting-canvas-invert">
                      深色模式下反转画板颜色
                      <span className={css.settingDesc}>
                        深色模式下对图表应用亮度反转，同时保持色相不变。
                      </span>
                    </label>
                    <input
                      id="setting-canvas-invert"
                      type="checkbox"
                      className={css.checkbox}
                      checked={settings.general.canvasInvert}
                      onChange={(e) => { updateGeneralSettings({ canvasInvert: e.target.checked }); }}
                    />
                  </div>

                  <div className={css.settingRow}>
                    <label className={css.settingLabel} htmlFor="setting-color-picker-accuracy">
                      取色器精度
                      <span className={css.settingDesc}>
                        近似模式使用快速整数混合；精确模式支持更高精度的混色计算。
                      </span>
                    </label>
                    <select
                      id="setting-color-picker-accuracy"
                      className={css.select}
                      value={settings.colorPicker.accuracy}
                      onChange={(e) => { updateColorPickerSettings({ accuracy: e.target.value as ColorPickerAccuracy }); }}
                    >
                      <option value="approximate">近似（默认）</option>
                      <option value="exact">精确</option>
                    </select>
                  </div>
                </div>
                <div className={css.resetRow}>
                  <button
                    type="button"
                    className={css.resetButton}
                    data-testid="settings-reset-general"
                    onClick={resetActiveCategoryToDefaults}
                  >
                    恢复默认设置
                  </button>
                </div>
              </div>
            )}

            {activeCategory === "editor" && (
              <div className={css.panel}>
                <div className={css.panelTitle}>代码编辑器</div>
                <div className={css.settingsGroup}>
                  <div className={css.settingRow}>
                    <label className={css.settingLabel} htmlFor="setting-word-wrap">
                      自动换行
                      <span className={css.settingDesc}>在源码编辑器中对超出宽度的长行自动换行。</span>
                    </label>
                    <input
                      id="setting-word-wrap"
                      type="checkbox"
                      className={css.checkbox}
                      checked={settings.editor.wordWrap}
                      onChange={(e) => { updateEditorSettings({ wordWrap: e.target.checked }); }}
                    />
                  </div>

                  <div className={css.settingRow}>
                    <label className={css.settingLabel} htmlFor="setting-line-numbers">
                      代码行号
                      <span className={css.settingDesc}>在源码编辑器中显示代码行号。</span>
                    </label>
                    <input
                      id="setting-line-numbers"
                      type="checkbox"
                      className={css.checkbox}
                      checked={settings.editor.lineNumbers}
                      onChange={(e) => { updateEditorSettings({ lineNumbers: e.target.checked }); }}
                    />
                  </div>

                  <div className={css.settingRow}>
                    <label className={css.settingLabel} htmlFor="setting-font-size">
                      字体大小
                      <span className={css.settingDesc}>源码编辑器的字体大小。</span>
                    </label>
                    <select
                      id="setting-font-size"
                      className={css.select}
                      value={settings.editor.fontSize}
                      onChange={(e) => { updateEditorSettings({ fontSize: Number(e.target.value) }); }}
                    >
                      {EDITOR_FONT_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>{size}px</option>
                      ))}
                    </select>
                  </div>

                  <div className={css.settingRow}>
                    <label className={css.settingLabel} htmlFor="setting-indent-size">
                      缩进空格数
                      <span className={css.settingDesc}>按 Tab 键与代码格式化时插入的空格数。</span>
                    </label>
                    <select
                      id="setting-indent-size"
                      className={css.select}
                      value={settings.editor.indentSize}
                      onChange={(e) => { updateEditorSettings({ indentSize: Number(e.target.value) as 2 | 4 }); }}
                    >
                      <option value={2}>2 个空格</option>
                      <option value={4}>4 个空格</option>
                    </select>
                  </div>
                </div>

                <div className={css.panelTitle}>代码格式化</div>
                <div className={css.settingsGroup}>
                  <div className={css.settingRow}>
                    <label className={css.settingLabel} htmlFor="setting-formatter-reflow-long-options">
                      长选项列表自动折行
                      <span className={css.settingDesc}>格式化代码时将过长的选项列表拆分为每行一项。</span>
                    </label>
                    <input
                      id="setting-formatter-reflow-long-options"
                      type="checkbox"
                      className={css.checkbox}
                      checked={settings.editor.formatterReflowLongOptions}
                      onChange={(e) => { updateEditorSettings({ formatterReflowLongOptions: e.target.checked }); }}
                    />
                  </div>

                  <div className={css.settingRow}>
                    <label className={css.settingLabel} htmlFor="setting-formatter-max-line-length">
                      单行最大长度
                      <span className={css.settingDesc}>选项列表超出此字符长度限制时将自动折行重排。</span>
                    </label>
                    <input
                      id="setting-formatter-max-line-length"
                      type="number"
                      className={css.numberInput}
                      min={MIN_FORMATTER_MAX_LINE_LENGTH}
                      max={MAX_FORMATTER_MAX_LINE_LENGTH}
                      value={formatterMaxLineLengthValue}
                      onChange={(e) => { setFormatterMaxLineLengthInput(e.target.value); }}
                      onBlur={commitFormatterMaxLineLength}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          commitFormatterMaxLineLength();
                        }
                      }}
                    />
                  </div>
                </div>
                <div className={css.resetRow}>
                  <button
                    type="button"
                    className={css.resetButton}
                    data-testid="settings-reset-editor"
                    onClick={resetActiveCategoryToDefaults}
                  >
                    恢复默认设置
                  </button>
                </div>
              </div>
            )}

            {activeCategory === "canvas" && (
              <div className={css.panel}>
                <div className={css.panelTitle}>画板设置</div>
                <div className={css.settingsGroup}>
                  <div className={css.settingRow}>
                    <label className={css.settingLabel} htmlFor="setting-grid-size">
                      网格大小
                      <span className={css.settingDesc}>控制对齐吸附网格的疏密程度。</span>
                    </label>
                    <select
                      id="setting-grid-size"
                      className={css.select}
                      value={settings.canvas.gridSize}
                      onChange={(e) => { updateCanvasSettings({ gridSize: e.target.value as GridSize }); }}
                    >
                      <option value="fine">精细 (Fine)</option>
                      <option value="standard">标准 (Standard)</option>
                      <option value="coarse">粗放 (Coarse)</option>
                    </select>
                  </div>

                  <div className={css.settingRow}>
                    <label className={css.settingLabel} htmlFor="setting-handle-size">
                      控制点手柄尺寸
                      <span className={css.settingDesc}>控制画板上可拖拽控制点与手柄的显示大小。</span>
                    </label>
                    <select
                      id="setting-handle-size"
                      className={css.select}
                      value={settings.canvas.handleSizePx}
                      onChange={(e) => { updateCanvasSettings({ handleSizePx: Number(e.target.value) }); }}
                    >
                      <option value={7}>小 (Small)</option>
                      <option value={9}>中 (Medium)</option>
                      <option value={11}>大 (Large)</option>
                    </select>
                  </div>

                  <div className={css.settingRow}>
                    <label className={css.settingLabel} htmlFor="setting-zoom-speed">
                      缩放速度
                      <span className={css.settingDesc}>
                        慢 ↔ 快 ({settings.canvas.zoomSpeed.toFixed(4)})
                      </span>
                    </label>
                    <input
                      id="setting-zoom-speed"
                      className={css.range}
                      type="range"
                      min={0.0015}
                      max={0.009}
                      step={0.0005}
                      list="zoom-speed-ticks"
                      value={settings.canvas.zoomSpeed}
                      onChange={(e) => { updateCanvasSettings({ zoomSpeed: Number(e.target.value) }); }}
                    />
                    <datalist id="zoom-speed-ticks">
                      <option value={0.0045} />
                    </datalist>
                  </div>
                </div>

                <div className={css.panelTitle}>渲染与字体</div>
                <div className={css.settingsGroup}>
                  <div className={css.settingRow}>
                    <label className={css.settingLabel} htmlFor="setting-base-font-size">
                      基准字号
                      <span className={css.settingDesc}>LaTeX 导言区基准字号（对应 \normalsize）。</span>
                    </label>
                    <select
                      id="setting-base-font-size"
                      className={css.select}
                      value={settings.rendering.baseFontSize}
                      onChange={(e) => { updateRenderingSettings({ baseFontSize: Number(e.target.value) as BaseFontSize }); }}
                    >
                      {BASE_FONT_SIZE_OPTIONS.map(({ value, label }) => (
                        <option key={value} value={value}>{BASE_FONT_SIZE_LABELS[value] ?? label}</option>
                      ))}
                    </select>
                  </div>
                  <div className={css.settingRow}>
                    <label className={css.settingLabel} htmlFor="setting-mathjax-font">
                      数学公式字体
                      <span className={css.settingDesc}>文本节点中数学公式渲染所使用的字体。</span>
                    </label>
                    <select
                      id="setting-mathjax-font"
                      className={css.select}
                      value={settings.rendering.mathJaxFont}
                      onChange={(e) => { updateRenderingSettings({ mathJaxFont: e.target.value as MathJaxFont }); }}
                    >
                      {MATHJAX_FONTS.map(({ value, label }) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className={css.fontPreviewRow}>
                    <img
                      key={settings.rendering.mathJaxFont}
                      className={css.fontPreviewImg}
                      src={`${import.meta.env.BASE_URL}font-previews/${settings.rendering.mathJaxFont}.svg`}
                      alt={`预览字体 ${settings.rendering.mathJaxFont}`}
                    />
                  </div>
                </div>

                <div className={css.resetRow}>
                  <button
                    type="button"
                    className={css.resetButton}
                    data-testid="settings-reset-canvas"
                    onClick={resetActiveCategoryToDefaults}
                  >
                    恢复默认设置
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
}
