import { useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { RiDownloadCloudLine } from "@remixicon/react";
import { useProjectNamedColorSwatches } from "../colors/project-named-colors";
import { useEditorStore } from "../store/store";
import { getActiveEditorPlatform } from "../platform/current";
import { NODE_SHAPE_OPTIONS } from "tikz-editor/edit/inspector";
import { ColorPicker, cssColorForToken } from "./ColorPicker";
import { getToolCapabilityStatus } from "./capabilities";
import { RenderedTooltip } from "./RenderedTooltip";
import {
  resolveToolbarToolMode,
  TOOL_BUTTONS,
  TOOL_COLOR_OPTIONS,
  CaretDownIcon,
  ResistorIcon,
  MosfetIcon,
  PlotIcon,
  OrthoWireIcon,
  type ToolPopupKind
} from "./tool-config";
import { GENERATED_NODE_SHAPE_PREVIEWS } from "./generated-node-shape-previews";
import { ToolbarToolPopup, ToolbarPopupSection, ToolbarPopupVisualChoiceGrid } from "./ToolbarToolPopup";
import popupCss from "./ToolbarToolPopup.module.css";
import type { ToolMode } from "../store/types";
import css from "./Toolbar.module.css";

const SHAPE_POPUP_CHOICES = NODE_SHAPE_OPTIONS.map((option) => ({
  id: option.value,
  label: option.label,
  previewSvg: GENERATED_NODE_SHAPE_PREVIEWS[option.value] ?? null
}));

type PlotPreset = {
  label: string;
  expr: string;
  latex: string;
  domainMin: string;
  domainMax: string;
};

const PLOT_PRESETS: PlotPreset[] = [
  { label: "sin(x)",  expr: "sin(deg(\\x))", latex: "\\sin x",    domainMin: "0",    domainMax: "6.28" },
  { label: "cos(x)",  expr: "cos(deg(\\x))", latex: "\\cos x",    domainMin: "0",    domainMax: "6.28" },
  { label: "tan(x)",  expr: "tan(deg(\\x))", latex: "\\tan x",    domainMin: "-1.4", domainMax: "1.4"  },
  { label: "x²",      expr: "\\x*\\x",       latex: "x^2",        domainMin: "-2",   domainMax: "2"    },
  { label: "x³",      expr: "\\x*\\x*\\x",   latex: "x^3",        domainMin: "-2",   domainMax: "2"    },
  { label: "√x",      expr: "sqrt(\\x)",      latex: "\\sqrt{x}",  domainMin: "0",    domainMax: "4"    },
  { label: "eˣ",      expr: "exp(\\x)",       latex: "e^x",        domainMin: "-2",   domainMax: "1.5"  },
  { label: "ln(x)",   expr: "ln(\\x)",        latex: "\\ln x",     domainMin: "0.1",  domainMax: "4"    },
  { label: "1/x",     expr: "1/\\x",          latex: "\\frac{1}{x}", domainMin: "0.3", domainMax: "4"  },
  { label: "|x|",     expr: "abs(\\x)",       latex: "|x|",        domainMin: "-3",   domainMax: "3"    },
  { label: "sin(x)/x", expr: "sin(deg(\\x))/\\x", latex: "\\frac{\\sin x}{x}", domainMin: "-12", domainMax: "12" },
  { label: "x·sin(x)", expr: "\\x*sin(deg(\\x))", latex: "x \\sin x", domainMin: "-10", domainMax: "10" },
];

/** Convert a TikZ plot expression to LaTeX for display */
function tikzToLatex(expr: string): string {
  let s = expr.trim();
  // Remove outer braces if present
  if (s.startsWith("{") && s.endsWith("}")) {
    s = s.slice(1, -1).trim();
  }
  // \x → x
  s = s.replace(/\\x\b/g, "x");
  // Trig with deg(): sin(deg(...)) → \sin(...)
  s = s.replace(/\bsin\(deg\(([^)]+)\)\)/g, "\\sin($1)");
  s = s.replace(/\bcos\(deg\(([^)]+)\)\)/g, "\\cos($1)");
  s = s.replace(/\btan\(deg\(([^)]+)\)\)/g, "\\tan($1)");
  // Plain trig (fallback)
  s = s.replace(/\bsin\(/g, "\\sin(");
  s = s.replace(/\bcos\(/g, "\\cos(");
  s = s.replace(/\btan\(/g, "\\tan(");
  // exp(x) → e^{x}
  s = s.replace(/\bexp\(([^)]+)\)/g, "e^{$1}");
  // ln(x) → \ln(x)
  s = s.replace(/\bln\(/g, "\\ln(");
  // sqrt(x) → \sqrt{x}
  s = s.replace(/\bsqrt\(([^)]+)\)/g, "\\sqrt{$1}");
  // abs(x) → |x|
  s = s.replace(/\babs\(([^)]+)\)/g, "|$1|");
  // pi → π (Unicode for display)
  s = s.replace(/\bpi\b/g, "\\pi");
  // * → \cdot
  s = s.replace(/\*/g, " \\cdot ");
  return s;
}

type CircuitElementSubmenuProps = {
  tooltip: string;
  buttonContent: React.ReactNode;
  buttonStyle?: React.CSSProperties;
  toolModes: {
    hLeft: ToolMode;
    hRight: ToolMode;
    vTop: ToolMode;
    vBottom: ToolMode;
  };
  defaultMode?: ToolMode;
  currentToolMode: ToolMode;
  onSelectMode: (mode: ToolMode) => void;
};

function CircuitElementSubmenu({
  tooltip,
  buttonContent,
  buttonStyle,
  toolModes,
  defaultMode,
  currentToolMode,
  onSelectMode
}: CircuitElementSubmenuProps) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<"horizontal" | "vertical" | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const isActive =
    currentToolMode === toolModes.hLeft ||
    currentToolMode === toolModes.hRight ||
    currentToolMode === toolModes.vTop ||
    currentToolMode === toolModes.vBottom;

  const handleMouseEnter = () => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = window.setTimeout(() => {
      setOpen(false);
      setActiveCategory(null);
    }, 180);
  };

  return (
    <div
      className={css.wireMenuContainer}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <RenderedTooltip content={tooltip}>
        <button
          type="button"
          className={[css.btn, isActive ? css.btnActive : ""].filter(Boolean).join(" ")}
          aria-label={tooltip}
          onClick={() => onSelectMode(isActive ? "select" : (defaultMode ?? toolModes.hLeft))}
          style={buttonStyle}
        >
          {buttonContent}
        </button>
      </RenderedTooltip>

      {open && (
        <div className={css.wireDropdown}>
          {/* 横向形态 */}
          <div
            className={[
              css.wireMenuItem,
              activeCategory === "horizontal" ? css.wireMenuItemActive : ""
            ]
              .filter(Boolean)
              .join(" ")}
            onMouseEnter={() => setActiveCategory("horizontal")}
            title="横向"
          >
            <svg width="18" height="14" viewBox="0 0 18 14" style={{ display: "block" }}>
              <line x1="2" y1="7" x2="16" y2="7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: "10px", opacity: 0.5, marginLeft: "4px" }}>›</span>

            {activeCategory === "horizontal" && (
              <div className={css.wireSubmenu}>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === toolModes.hLeft ? css.wireSubmenuItemActive : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  title="加号在左端"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode(toolModes.hLeft);
                    setOpen(false);
                  }}
                >
                  <svg width="26" height="16" viewBox="0 0 26 16" style={{ display: "block" }}>
                    <line x1="1.5" y1="8" x2="7.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="4.5" y1="5" x2="4.5" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="10" y1="8" x2="24.5" y2="8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === toolModes.hRight ? css.wireSubmenuItemActive : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  title="加号在右端"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode(toolModes.hRight);
                    setOpen(false);
                  }}
                >
                  <svg width="26" height="16" viewBox="0 0 26 16" style={{ display: "block" }}>
                    <line x1="1.5" y1="8" x2="16" y2="8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    <line x1="18.5" y1="8" x2="24.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="21.5" y1="5" x2="21.5" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* 纵向形态 */}
          <div
            className={[
              css.wireMenuItem,
              activeCategory === "vertical" ? css.wireMenuItemActive : ""
            ]
              .filter(Boolean)
              .join(" ")}
            onMouseEnter={() => setActiveCategory("vertical")}
            title="纵向"
          >
            <svg width="18" height="14" viewBox="0 0 18 14" style={{ display: "block" }}>
              <line x1="9" y1="1" x2="9" y2="13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: "10px", opacity: 0.5, marginLeft: "4px" }}>›</span>

            {activeCategory === "vertical" && (
              <div className={css.wireSubmenu}>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === toolModes.vTop ? css.wireSubmenuItemActive : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  title="加号在头顶 (上端)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode(toolModes.vTop);
                    setOpen(false);
                  }}
                >
                  <svg width="16" height="26" viewBox="0 0 16 26" style={{ display: "block" }}>
                    <line x1="5" y1="4.5" x2="11" y2="4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="8" y1="1.5" x2="8" y2="7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="8" y1="10" x2="8" y2="24.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === toolModes.vBottom ? css.wireSubmenuItemActive : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  title="加号在脚下 (下端)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode(toolModes.vBottom);
                    setOpen(false);
                  }}
                >
                  <svg width="16" height="26" viewBox="0 0 16 26" style={{ display: "block" }}>
                    <line x1="8" y1="1.5" x2="8" y2="16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    <line x1="5" y1="21.5" x2="11" y2="21.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="8" y1="18.5" x2="8" y2="24.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type CurrentArrowSubmenuProps = {
  tooltip: string;
  buttonContent: React.ReactNode;
  buttonStyle?: React.CSSProperties;
  currentToolMode: ToolMode;
  onSelectMode: (mode: ToolMode) => void;
};

function CurrentArrowSubmenu({
  tooltip,
  buttonContent,
  buttonStyle,
  currentToolMode,
  onSelectMode
}: CurrentArrowSubmenuProps) {
  const [open, setOpen] = useState(false);
  const [activeDirection, setActiveDirection] = useState<"up" | "down" | "left" | "right" | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const isActive =
    currentToolMode === "addCurrentArrow" ||
    currentToolMode.startsWith("addCurrentArrow_");

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = window.setTimeout(() => {
      setOpen(false);
      setActiveDirection(null);
    }, 180);
  };

  return (
    <div
      className={css.wireMenuContainer}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <RenderedTooltip content={tooltip}>
        <button
          type="button"
          className={[css.btn, isActive ? css.btnActive : ""].filter(Boolean).join(" ")}
          aria-label={tooltip}
          onClick={() => onSelectMode(isActive ? "select" : "addCurrentArrow_Right_Left")}
          style={buttonStyle}
        >
          {buttonContent}
        </button>
      </RenderedTooltip>

      {open && (
        <div className={css.wireDropdown}>
          {/* 1. 向右箭头 (Right) */}
          <div
            className={[
              css.wireMenuItem,
              activeDirection === "right" ? css.wireMenuItemActive : ""
            ].filter(Boolean).join(" ")}
            onMouseEnter={() => setActiveDirection("right")}
            title="向右 (Right)"
          >
            <svg width="20" height="14" viewBox="0 0 20 14" style={{ display: "block" }}>
              <line x1="2" y1="7" x2="16" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <polyline points="12,3 16,7 12,11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: "10px", opacity: 0.5, marginLeft: "4px" }}>›</span>

            {activeDirection === "right" && (
              <div className={css.wireSubmenu}>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === "addCurrentArrow_Right_Left" || currentToolMode === "addCurrentArrow_H_Left"
                      ? css.wireSubmenuItemActive
                      : ""
                  ].filter(Boolean).join(" ")}
                  title="加号在左端 (向右)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode("addCurrentArrow_Right_Left");
                    setOpen(false);
                  }}
                >
                  <svg width="28" height="16" viewBox="0 0 28 16" style={{ display: "block" }}>
                    <line x1="1.5" y1="8" x2="6.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="4" y1="5.5" x2="4" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="9" y1="8" x2="24" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <polyline points="19,4 24,8 19,12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === "addCurrentArrow_Right_Right" || currentToolMode === "addCurrentArrow_H_Right"
                      ? css.wireSubmenuItemActive
                      : ""
                  ].filter(Boolean).join(" ")}
                  title="加号在右端 (向右)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode("addCurrentArrow_Right_Right");
                    setOpen(false);
                  }}
                >
                  <svg width="28" height="16" viewBox="0 0 28 16" style={{ display: "block" }}>
                    <line x1="2" y1="8" x2="17" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <polyline points="12,4 17,8 12,12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="20" y1="8" x2="25" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="22.5" y1="5.5" x2="22.5" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* 2. 向左箭头 (Left) */}
          <div
            className={[
              css.wireMenuItem,
              activeDirection === "left" ? css.wireMenuItemActive : ""
            ].filter(Boolean).join(" ")}
            onMouseEnter={() => setActiveDirection("left")}
            title="向左 (Left)"
          >
            <svg width="20" height="14" viewBox="0 0 20 14" style={{ display: "block" }}>
              <line x1="4" y1="7" x2="18" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <polyline points="8,3 4,7 8,11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: "10px", opacity: 0.5, marginLeft: "4px" }}>›</span>

            {activeDirection === "left" && (
              <div className={css.wireSubmenu}>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === "addCurrentArrow_Left_Left" ? css.wireSubmenuItemActive : ""
                  ].filter(Boolean).join(" ")}
                  title="加号在左端 (向左)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode("addCurrentArrow_Left_Left");
                    setOpen(false);
                  }}
                >
                  <svg width="28" height="16" viewBox="0 0 28 16" style={{ display: "block" }}>
                    <line x1="1.5" y1="8" x2="6.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="4" y1="5.5" x2="4" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="10" y1="8" x2="25" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <polyline points="15,4 10,8 15,12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === "addCurrentArrow_Left_Right" ? css.wireSubmenuItemActive : ""
                  ].filter(Boolean).join(" ")}
                  title="加号在右端 (向左)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode("addCurrentArrow_Left_Right");
                    setOpen(false);
                  }}
                >
                  <svg width="28" height="16" viewBox="0 0 28 16" style={{ display: "block" }}>
                    <line x1="3" y1="8" x2="18" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <polyline points="8,4 3,8 8,12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="20" y1="8" x2="25" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="22.5" y1="5.5" x2="22.5" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* 3. 向上箭头 (Up) */}
          <div
            className={[
              css.wireMenuItem,
              activeDirection === "up" ? css.wireMenuItemActive : ""
            ].filter(Boolean).join(" ")}
            onMouseEnter={() => setActiveDirection("up")}
            title="向上 (Up)"
          >
            <svg width="18" height="16" viewBox="0 0 18 16" style={{ display: "block" }}>
              <line x1="9" y1="14" x2="9" y2="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <polyline points="5,6 9,2 13,6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: "10px", opacity: 0.5, marginLeft: "4px" }}>›</span>

            {activeDirection === "up" && (
              <div className={css.wireSubmenu}>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === "addCurrentArrow_Up_Top" ? css.wireSubmenuItemActive : ""
                  ].filter(Boolean).join(" ")}
                  title="加号在上端 (向上)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode("addCurrentArrow_Up_Top");
                    setOpen(false);
                  }}
                >
                  <svg width="16" height="28" viewBox="0 0 16 28" style={{ display: "block" }}>
                    <line x1="5.5" y1="4" x2="10.5" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="8" y1="1.5" x2="8" y2="6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="8" y1="25" x2="8" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <polyline points="4,15 8,10 12,15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === "addCurrentArrow_Up_Bottom" ? css.wireSubmenuItemActive : ""
                  ].filter(Boolean).join(" ")}
                  title="加号在下端 (向上)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode("addCurrentArrow_Up_Bottom");
                    setOpen(false);
                  }}
                >
                  <svg width="16" height="28" viewBox="0 0 16 28" style={{ display: "block" }}>
                    <line x1="8" y1="18" x2="8" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <polyline points="4,8 8,3 12,8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="5.5" y1="23.5" x2="10.5" y2="23.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="8" y1="21" x2="8" y2="26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* 4. 向下箭头 (Down) */}
          <div
            className={[
              css.wireMenuItem,
              activeDirection === "down" ? css.wireMenuItemActive : ""
            ].filter(Boolean).join(" ")}
            onMouseEnter={() => setActiveDirection("down")}
            title="向下 (Down)"
          >
            <svg width="18" height="16" viewBox="0 0 18 16" style={{ display: "block" }}>
              <line x1="9" y1="2" x2="9" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <polyline points="5,10 9,14 13,10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: "10px", opacity: 0.5, marginLeft: "4px" }}>›</span>

            {activeDirection === "down" && (
              <div className={css.wireSubmenu}>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === "addCurrentArrow_Down_Top" || currentToolMode === "addCurrentArrow_V_Top"
                      ? css.wireSubmenuItemActive
                      : ""
                  ].filter(Boolean).join(" ")}
                  title="加号在上端 (向下)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode("addCurrentArrow_Down_Top");
                    setOpen(false);
                  }}
                >
                  <svg width="16" height="28" viewBox="0 0 16 28" style={{ display: "block" }}>
                    <line x1="5.5" y1="4" x2="10.5" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="8" y1="1.5" x2="8" y2="6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="8" y1="10" x2="8" y2="25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <polyline points="4,20 8,25 12,20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === "addCurrentArrow_Down_Bottom" || currentToolMode === "addCurrentArrow_V_Bottom" || currentToolMode === "addCurrentArrow"
                      ? css.wireSubmenuItemActive
                      : ""
                  ].filter(Boolean).join(" ")}
                  title="加号在下端 (向下)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode("addCurrentArrow_Down_Bottom");
                    setOpen(false);
                  }}
                >
                  <svg width="16" height="28" viewBox="0 0 16 28" style={{ display: "block" }}>
                    <line x1="8" y1="3" x2="8" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <polyline points="4,13 8,18 12,13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="5.5" y1="23.5" x2="10.5" y2="23.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="8" y1="21" x2="8" y2="26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type CurrentSourceSubmenuProps = {
  tooltip: string;
  buttonContent: React.ReactNode;
  buttonStyle?: React.CSSProperties;
  currentToolMode: ToolMode;
  onSelectMode: (mode: ToolMode) => void;
};

function CurrentSourceSubmenu({
  tooltip,
  buttonContent,
  buttonStyle,
  currentToolMode,
  onSelectMode
}: CurrentSourceSubmenuProps) {
  const [open, setOpen] = useState(false);
  const [activeDirection, setActiveDirection] = useState<"up" | "down" | "left" | "right" | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const isActive =
    currentToolMode === "addCurrentSource" ||
    currentToolMode.startsWith("addCurrentSource_");

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = window.setTimeout(() => {
      setOpen(false);
      setActiveDirection(null);
    }, 180);
  };

  return (
    <div
      className={css.wireMenuContainer}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <RenderedTooltip content={tooltip}>
        <button
          type="button"
          className={[css.btn, isActive ? css.btnActive : ""].filter(Boolean).join(" ")}
          aria-label={tooltip}
          onClick={() => onSelectMode(isActive ? "select" : "addCurrentSource_Right_Left")}
          style={buttonStyle}
        >
          {buttonContent}
        </button>
      </RenderedTooltip>

      {open && (
        <div className={css.wireDropdown}>
          {/* 1. 向右 (Right) */}
          <div
            className={[
              css.wireMenuItem,
              activeDirection === "right" ? css.wireMenuItemActive : ""
            ].filter(Boolean).join(" ")}
            onMouseEnter={() => setActiveDirection("right")}
            title="向右 (Right)"
          >
            <svg width="22" height="16" viewBox="0 0 22 16" style={{ display: "block" }}>
              <circle cx="11" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <line x1="8" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <polyline points="12,6 14,8 12,10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: "10px", opacity: 0.5, marginLeft: "4px" }}>›</span>

            {activeDirection === "right" && (
              <div className={css.wireSubmenu}>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === "addCurrentSource_Right_Left" || currentToolMode === "addCurrentSource_H_Left"
                      ? css.wireSubmenuItemActive
                      : ""
                  ].filter(Boolean).join(" ")}
                  title="加号在左端 (向右)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode("addCurrentSource_Right_Left");
                    setOpen(false);
                  }}
                >
                  <svg width="30" height="16" viewBox="0 0 30 16" style={{ display: "block" }}>
                    <line x1="1.5" y1="8" x2="5.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="3.5" y1="6" x2="3.5" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="7.5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="16" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    <line x1="14" y1="8" x2="18" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <polyline points="16.5,6.5 18,8 16.5,9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="21" y1="8" x2="28.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === "addCurrentSource_Right_Right" || currentToolMode === "addCurrentSource_H_Right"
                      ? css.wireSubmenuItemActive
                      : ""
                  ].filter(Boolean).join(" ")}
                  title="加号在右端 (向右)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode("addCurrentSource_Right_Right");
                    setOpen(false);
                  }}
                >
                  <svg width="30" height="16" viewBox="0 0 30 16" style={{ display: "block" }}>
                    <line x1="1.5" y1="8" x2="9" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="14" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    <line x1="12" y1="8" x2="16" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <polyline points="14.5,6.5 16,8 14.5,9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="19" y1="8" x2="22.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="24.5" y1="8" x2="28.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="26.5" y1="6" x2="26.5" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* 2. 向左 (Left) */}
          <div
            className={[
              css.wireMenuItem,
              activeDirection === "left" ? css.wireMenuItemActive : ""
            ].filter(Boolean).join(" ")}
            onMouseEnter={() => setActiveDirection("left")}
            title="向左 (Left)"
          >
            <svg width="22" height="16" viewBox="0 0 22 16" style={{ display: "block" }}>
              <circle cx="11" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <line x1="14" y1="8" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <polyline points="10,6 8,8 10,10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: "10px", opacity: 0.5, marginLeft: "4px" }}>›</span>

            {activeDirection === "left" && (
              <div className={css.wireSubmenu}>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === "addCurrentSource_Left_Left" ? css.wireSubmenuItemActive : ""
                  ].filter(Boolean).join(" ")}
                  title="加号在左端 (向左)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode("addCurrentSource_Left_Left");
                    setOpen(false);
                  }}
                >
                  <svg width="30" height="16" viewBox="0 0 30 16" style={{ display: "block" }}>
                    <line x1="1.5" y1="8" x2="5.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="3.5" y1="6" x2="3.5" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="7.5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="16" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    <line x1="18" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <polyline points="15.5,6.5 14,8 15.5,9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="21" y1="8" x2="28.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === "addCurrentSource_Left_Right" ? css.wireSubmenuItemActive : ""
                  ].filter(Boolean).join(" ")}
                  title="加号在右端 (向左)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode("addCurrentSource_Left_Right");
                    setOpen(false);
                  }}
                >
                  <svg width="30" height="16" viewBox="0 0 30 16" style={{ display: "block" }}>
                    <line x1="1.5" y1="8" x2="9" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="14" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    <line x1="16" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <polyline points="13.5,6.5 12,8 13.5,9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="19" y1="8" x2="22.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="24.5" y1="8" x2="28.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="26.5" y1="6" x2="26.5" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* 3. 向上 (Up) */}
          <div
            className={[
              css.wireMenuItem,
              activeDirection === "up" ? css.wireMenuItemActive : ""
            ].filter(Boolean).join(" ")}
            onMouseEnter={() => setActiveDirection("up")}
            title="向上 (Up)"
          >
            <svg width="18" height="20" viewBox="0 0 18 20" style={{ display: "block" }}>
              <circle cx="9" cy="10" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <line x1="9" y1="13" x2="9" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <polyline points="7,9 9,7 11,9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: "10px", opacity: 0.5, marginLeft: "4px" }}>›</span>

            {activeDirection === "up" && (
              <div className={css.wireSubmenu}>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === "addCurrentSource_Up_Top" ? css.wireSubmenuItemActive : ""
                  ].filter(Boolean).join(" ")}
                  title="加号在上端 (向上)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode("addCurrentSource_Up_Top");
                    setOpen(false);
                  }}
                >
                  <svg width="16" height="30" viewBox="0 0 16 30" style={{ display: "block" }}>
                    <line x1="6" y1="3.5" x2="10" y2="3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="8" y1="1.5" x2="8" y2="5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="8" y1="7.5" x2="8" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="8" cy="16" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    <line x1="8" y1="18" x2="8" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <polyline points="6.5,15.5 8,14 9.5,15.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="8" y1="21" x2="8" y2="28.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === "addCurrentSource_Up_Bottom" ? css.wireSubmenuItemActive : ""
                  ].filter(Boolean).join(" ")}
                  title="加号在下端 (向上)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode("addCurrentSource_Up_Bottom");
                    setOpen(false);
                  }}
                >
                  <svg width="16" height="30" viewBox="0 0 16 30" style={{ display: "block" }}>
                    <line x1="8" y1="1.5" x2="8" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="8" cy="14" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    <line x1="8" y1="16" x2="8" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <polyline points="6.5,13.5 8,12 9.5,13.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="8" y1="19" x2="8" y2="22.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="6" y1="26.5" x2="10" y2="26.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="8" y1="24.5" x2="8" y2="28.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* 4. 向下 (Down) */}
          <div
            className={[
              css.wireMenuItem,
              activeDirection === "down" ? css.wireMenuItemActive : ""
            ].filter(Boolean).join(" ")}
            onMouseEnter={() => setActiveDirection("down")}
            title="向下 (Down)"
          >
            <svg width="18" height="20" viewBox="0 0 18 20" style={{ display: "block" }}>
              <circle cx="9" cy="10" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <line x1="9" y1="7" x2="9" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <polyline points="7,11 9,13 11,11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: "10px", opacity: 0.5, marginLeft: "4px" }}>›</span>

            {activeDirection === "down" && (
              <div className={css.wireSubmenu}>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === "addCurrentSource_Down_Top" || currentToolMode === "addCurrentSource_V_Top"
                      ? css.wireSubmenuItemActive
                      : ""
                  ].filter(Boolean).join(" ")}
                  title="加号在上端 (向下)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode("addCurrentSource_Down_Top");
                    setOpen(false);
                  }}
                >
                  <svg width="16" height="30" viewBox="0 0 16 30" style={{ display: "block" }}>
                    <line x1="6" y1="3.5" x2="10" y2="3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="8" y1="1.5" x2="8" y2="5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="8" y1="7.5" x2="8" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="8" cy="16" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    <line x1="8" y1="14" x2="8" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <polyline points="6.5,16.5 8,18 9.5,16.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="8" y1="21" x2="8" y2="28.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === "addCurrentSource_Down_Bottom" || currentToolMode === "addCurrentSource_V_Bottom" || currentToolMode === "addCurrentSource"
                      ? css.wireSubmenuItemActive
                      : ""
                  ].filter(Boolean).join(" ")}
                  title="加号在下端 (向下)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode("addCurrentSource_Down_Bottom");
                    setOpen(false);
                  }}
                >
                  <svg width="16" height="30" viewBox="0 0 16 30" style={{ display: "block" }}>
                    <line x1="8" y1="1.5" x2="8" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="8" cy="14" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    <line x1="8" y1="14" x2="8" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <polyline points="6.5,16.5 8,18 9.5,16.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="8" y1="19" x2="8" y2="22.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="6" y1="26.5" x2="10" y2="26.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="8" y1="24.5" x2="8" y2="28.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type MosfetElementSubmenuProps = {
  tooltip: string;
  buttonContent: React.ReactNode;
  buttonStyle?: React.CSSProperties;
  toolModes: {
    leftD: ToolMode;
    leftG: ToolMode;
    leftS: ToolMode;
    rightD: ToolMode;
    rightG: ToolMode;
    rightS: ToolMode;
  };
  currentToolMode: ToolMode;
  onSelectMode: (mode: ToolMode) => void;
};

function MosfetElementSubmenu({
  tooltip,
  buttonContent,
  buttonStyle,
  toolModes,
  currentToolMode,
  onSelectMode
}: MosfetElementSubmenuProps) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<"left" | "right" | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const isActive =
    currentToolMode === toolModes.leftD ||
    currentToolMode === toolModes.leftG ||
    currentToolMode === toolModes.leftS ||
    currentToolMode === toolModes.rightD ||
    currentToolMode === toolModes.rightG ||
    currentToolMode === toolModes.rightS;

  const handleMouseEnter = () => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = window.setTimeout(() => {
      setOpen(false);
      setActiveCategory(null);
    }, 180);
  };

  const renderSubmenu = (dMode: ToolMode, gMode: ToolMode, sMode: ToolMode) => (
    <div className={css.wireSubmenu} style={{ minWidth: "42px" }}>
      <div
        className={[
          css.wireSubmenuItem,
          currentToolMode === dMode ? css.wireSubmenuItemActive : ""
        ]
          .filter(Boolean)
          .join(" ")}
        title="D (漏极)"
        style={{ fontSize: "13px", fontWeight: "bold", fontFamily: "serif", padding: "4px 8px" }}
        onClick={(e) => {
          e.stopPropagation();
          onSelectMode(dMode);
          setOpen(false);
        }}
      >
        D
      </div>
      <div
        className={[
          css.wireSubmenuItem,
          currentToolMode === gMode ? css.wireSubmenuItemActive : ""
        ]
          .filter(Boolean)
          .join(" ")}
        title="G (栅极)"
        style={{ fontSize: "13px", fontWeight: "bold", fontFamily: "serif", padding: "4px 8px" }}
        onClick={(e) => {
          e.stopPropagation();
          onSelectMode(gMode);
          setOpen(false);
        }}
      >
        G
      </div>
      <div
        className={[
          css.wireSubmenuItem,
          currentToolMode === sMode ? css.wireSubmenuItemActive : ""
        ]
          .filter(Boolean)
          .join(" ")}
        title="S (源极)"
        style={{ fontSize: "13px", fontWeight: "bold", fontFamily: "serif", padding: "4px 8px" }}
        onClick={(e) => {
          e.stopPropagation();
          onSelectMode(sMode);
          setOpen(false);
        }}
      >
        S
      </div>
    </div>
  );

  return (
    <div
      className={css.wireMenuContainer}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <RenderedTooltip content={tooltip}>
        <button
          type="button"
          className={[css.btn, isActive ? css.btnActive : ""].filter(Boolean).join(" ")}
          aria-label={tooltip}
          onClick={() => onSelectMode(isActive ? "select" : toolModes.leftG)}
          style={buttonStyle}
        >
          {buttonContent}
        </button>
      </RenderedTooltip>

      {open && (
        <div className={css.wireDropdown} style={{ minWidth: "48px" }}>
          {/* 栅极在左 (常规) */}
          <div
            className={[
              css.wireMenuItem,
              activeCategory === "left" ? css.wireMenuItemActive : ""
            ]
              .filter(Boolean)
              .join(" ")}
            onMouseEnter={() => setActiveCategory("left")}
            title="栅极在左"
          >
            <svg width="18" height="14" viewBox="0 0 18 14" style={{ display: "block" }}>
              <line x1="1" y1="7" x2="6" y2="7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="6" y1="2" x2="6" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="10" y1="1" x2="10" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M10 3.5 h5 v-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 10.5 h5 v2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: "10px", opacity: 0.5, marginLeft: "4px" }}>›</span>

            {activeCategory === "left" && renderSubmenu(toolModes.leftD, toolModes.leftG, toolModes.leftS)}
          </div>

          {/* 栅极在右 (关于y轴对称镜像) */}
          <div
            className={[
              css.wireMenuItem,
              activeCategory === "right" ? css.wireMenuItemActive : ""
            ]
              .filter(Boolean)
              .join(" ")}
            onMouseEnter={() => setActiveCategory("right")}
            title="栅极在右 (Y轴对称)"
          >
            <svg width="18" height="14" viewBox="0 0 18 14" style={{ display: "block" }}>
              <line x1="17" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="12" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="8" y1="1" x2="8" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M8 3.5 h-5 v-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 10.5 h-5 v2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: "10px", opacity: 0.5, marginLeft: "4px" }}>›</span>

            {activeCategory === "right" && renderSubmenu(toolModes.rightD, toolModes.rightG, toolModes.rightS)}
          </div>
        </div>
      )}
    </div>
  );
}

type IoNodeSubmenuProps = {
  tooltip: string;
  currentToolMode: ToolMode;
  onSelectMode: (mode: ToolMode) => void;
};

function IoNodeSubmenu({
  tooltip,
  currentToolMode,
  onSelectMode
}: IoNodeSubmenuProps) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<"vin" | "vout" | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const isActive = currentToolMode.startsWith("addIoNode");

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = window.setTimeout(() => {
      setOpen(false);
      setActiveCategory(null);
    }, 180);
  };

  return (
    <div
      className={css.wireMenuContainer}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <RenderedTooltip content={tooltip}>
        <button
          type="button"
          className={[css.btn, isActive ? css.btnActive : ""].filter(Boolean).join(" ")}
          aria-label={tooltip}
          onClick={() => onSelectMode(isActive ? "select" : "addIoNode_Vin_Left")}
          style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" style={{ display: "block" }}>
            <circle cx="4.5" cy="9" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <line x1="7.3" y1="9" x2="16.5" y2="9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </RenderedTooltip>

      {open && (
        <div className={css.wireDropdown} style={{ minWidth: "54px" }}>
          {/* 1. Vin */}
          <div
            className={[
              css.wireMenuItem,
              activeCategory === "vin" ? css.wireMenuItemActive : ""
            ].filter(Boolean).join(" ")}
            onMouseEnter={() => setActiveCategory("vin")}
            title="Vin (输入端点)"
          >
            <span style={{ fontSize: "12px", fontWeight: "bold", fontFamily: "serif" }}>
              V<sub>in</sub>
            </span>
            <span style={{ fontSize: "10px", opacity: 0.5, marginLeft: "6px" }}>›</span>

            {activeCategory === "vin" && (
              <div className={css.wireSubmenu}>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === "addIoNode" || currentToolMode === "addIoNode_Vin_Left"
                      ? css.wireSubmenuItemActive
                      : ""
                  ].filter(Boolean).join(" ")}
                  title="Vin - 圆圈在左 (加号在右)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode("addIoNode_Vin_Left");
                    setOpen(false);
                  }}
                >
                  <svg width="44" height="22" viewBox="0 0 44 22" style={{ display: "block" }}>
                    <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" fill="none" />
                    <line x1="12" y1="8" x2="34" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <line x1="34" y1="5" x2="34" y2="11" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="31" y1="8" x2="37" y2="8" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
                    <text x="9" y="19" fontSize="7" fontFamily="serif" textAnchor="middle" fill="currentColor">Vin</text>
                  </svg>
                </div>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === "addIoNode_Vin_Right"
                      ? css.wireSubmenuItemActive
                      : ""
                  ].filter(Boolean).join(" ")}
                  title="Vin - 圆圈在右 (加号在左)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode("addIoNode_Vin_Right");
                    setOpen(false);
                  }}
                >
                  <svg width="44" height="22" viewBox="0 0 44 22" style={{ display: "block" }}>
                    <line x1="10" y1="5" x2="10" y2="11" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="7" y1="8" x2="13" y2="8" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="10" y1="8" x2="32" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <circle cx="35" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" fill="none" />
                    <text x="35" y="19" fontSize="7" fontFamily="serif" textAnchor="middle" fill="currentColor">Vin</text>
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* 2. Vout */}
          <div
            className={[
              css.wireMenuItem,
              activeCategory === "vout" ? css.wireMenuItemActive : ""
            ].filter(Boolean).join(" ")}
            onMouseEnter={() => setActiveCategory("vout")}
            title="Vout (输出端点)"
          >
            <span style={{ fontSize: "12px", fontWeight: "bold", fontFamily: "serif" }}>
              V<sub>out</sub>
            </span>
            <span style={{ fontSize: "10px", opacity: 0.5, marginLeft: "6px" }}>›</span>

            {activeCategory === "vout" && (
              <div className={css.wireSubmenu}>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === "addIoNode_Vout_Left"
                      ? css.wireSubmenuItemActive
                      : ""
                  ].filter(Boolean).join(" ")}
                  title="Vout - 圆圈在左 (加号在右)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode("addIoNode_Vout_Left");
                    setOpen(false);
                  }}
                >
                  <svg width="44" height="22" viewBox="0 0 44 22" style={{ display: "block" }}>
                    <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" fill="none" />
                    <line x1="12" y1="8" x2="34" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <line x1="34" y1="5" x2="34" y2="11" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="31" y1="8" x2="37" y2="8" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
                    <text x="9" y="19" fontSize="7" fontFamily="serif" textAnchor="middle" fill="currentColor">Vout</text>
                  </svg>
                </div>
                <div
                  className={[
                    css.wireSubmenuItem,
                    currentToolMode === "addIoNode_Vout_Right"
                      ? css.wireSubmenuItemActive
                      : ""
                  ].filter(Boolean).join(" ")}
                  title="Vout - 圆圈在右 (加号在左)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMode("addIoNode_Vout_Right");
                    setOpen(false);
                  }}
                >
                  <svg width="44" height="22" viewBox="0 0 44 22" style={{ display: "block" }}>
                    <line x1="10" y1="5" x2="10" y2="11" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="7" y1="8" x2="13" y2="8" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="10" y1="8" x2="32" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <circle cx="35" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" fill="none" />
                    <text x="35" y="19" fontSize="7" fontFamily="serif" textAnchor="middle" fill="currentColor">Vout</text>
                  </svg>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type ToolbarProps = {
  updateChip?: {
    version: string;
    onClick: () => void;
  } | null;
};

export function Toolbar({ updateChip = null }: ToolbarProps) {
  const toolMode = useEditorStore((s) => s.toolMode);
  const bucketFillColor = useEditorStore((s) => s.bucketFillColor);
  const selectedAddShape = useEditorStore((s) => s.selectedAddShape);
  const selectedAddMatrixRows = useEditorStore((s) => s.selectedAddMatrixRows);
  const selectedAddMatrixColumns = useEditorStore((s) => s.selectedAddMatrixColumns);
  const selectedElementIds = useEditorStore((s) => s.selectedElementIds);
  const activeHandleId = useEditorStore((s) => s.activeHandleId);
  const snapshot = useEditorStore((s) => s.snapshot);
  const source = useEditorStore((s) => s.source);
  const dispatch = useEditorStore((s) => s.dispatch);
  const projectNamedColorSwatches = useProjectNamedColorSwatches();
  const namedColorLookup = useMemo(
    () => new Map(projectNamedColorSwatches.map((swatch) => [swatch.token, swatch.cssColor] as const)),
    [projectNamedColorSwatches]
  );
  const [openPopupMode, setOpenPopupMode] = useState<ToolMode | "function-plot" | null>(null);
  const [bucketPopupClosePending, setBucketPopupClosePending] = useState(false);
  const [matrixHoverSize, setMatrixHoverSize] = useState<{ rows: number; columns: number } | null>(null);
  const matrixPreviewRows = matrixHoverSize?.rows ?? selectedAddMatrixRows;
  const matrixPreviewColumns = matrixHoverSize?.columns ?? selectedAddMatrixColumns;
  const isDesktop = getActiveEditorPlatform().id.startsWith("desktop");
  const isMacDesktop =
    isDesktop &&
    typeof navigator !== "undefined" &&
    /(mac|iphone|ipad)/i.test(navigator.platform);
  const showAppTitle = !isDesktop;

  // ── Function plot state ──────────────────────────────────────────────────────
  const [plotExpr, setPlotExpr] = useState("sin(deg(\\x))");
  const [plotDomainMin, setPlotDomainMin] = useState("0");
  const [plotDomainMax, setPlotDomainMax] = useState("6.28");
  const [plotColor, setPlotColor] = useState("blue");
  const [plotLineStyle, setPlotLineStyle] = useState<"solid" | "dashed" | "dotted">("solid");
  const [plotSmooth, setPlotSmooth] = useState(true);
  const plotPreviewRef = useRef<HTMLDivElement>(null);

  // Render KaTeX preview whenever expression changes
  useEffect(() => {
    const container = plotPreviewRef.current;
    if (!container) return;
    try {
      const latex = tikzToLatex(plotExpr);
      katex.render(`f(x) = ${latex}`, container, {
        throwOnError: false,
        displayMode: true,
        output: "html"
      });
    } catch {
      container.textContent = "";
    }
  }, [plotExpr]);

  // Close popup when tool mode changes (unless it's a popup that can be used independently)
  useEffect(() => {
    if (openPopupMode && openPopupMode !== "addShape" && openPopupMode !== "addBucket" && openPopupMode !== "addMatrix" && openPopupMode !== "function-plot" && openPopupMode !== toolMode) {
      setOpenPopupMode(null);
    }
  }, [openPopupMode, toolMode]);

  useEffect(() => {
    if (openPopupMode !== "addBucket" && bucketPopupClosePending) {
      setBucketPopupClosePending(false);
    }
  }, [bucketPopupClosePending, openPopupMode]);

  useEffect(() => {
    if (openPopupMode !== "addBucket" || !bucketPopupClosePending) {
      return;
    }

    function onPointerUp(): void {
      setBucketPopupClosePending(false);
      setOpenPopupMode(null);
    }

    window.addEventListener("pointerup", onPointerUp);
    return () => { window.removeEventListener("pointerup", onPointerUp); };
  }, [bucketPopupClosePending, openPopupMode]);

  const closeBucketPopup = () => {
    setBucketPopupClosePending(false);
    setOpenPopupMode(null);
  };

  const getPlacementCoord = (defaultX = "0", defaultY = "0"): { x: string; y: string } => {
    if (activeHandleId) {
      const handle = snapshot.editHandles.find((h) => h.id === activeHandleId);
      if (handle?.world) {
        return {
          x: (handle.world.x / 28.4527559).toFixed(2),
          y: (handle.world.y / 28.4527559).toFixed(2)
        };
      }
    }
    if (selectedElementIds.size > 0 && snapshot.scene?.elements) {
      for (const element of snapshot.scene.elements) {
        if (selectedElementIds.has(element.sourceRef.sourceId)) {
          if (element.kind === "Text") {
            return {
              x: (element.position.x / 28.4527559).toFixed(2),
              y: (element.position.y / 28.4527559).toFixed(2)
            };
          }
          if (element.kind === "Circle" || element.kind === "Ellipse") {
            return {
              x: (element.center.x / 28.4527559).toFixed(2),
              y: (element.center.y / 28.4527559).toFixed(2)
            };
          }
          if (element.kind === "Path" && element.commands.length > 0) {
            const cmd = element.commands.find((c) => "to" in c && c.to) as { to?: { x: number; y: number } } | undefined;
            if (cmd?.to) {
              return {
                x: (cmd.to.x / 28.4527559).toFixed(2),
                y: (cmd.to.y / 28.4527559).toFixed(2)
              };
            }
          }
        }
      }
    }
    return { x: defaultX, y: defaultY };
  };

  const insertResistor = () => {
    const coord = getPlacementCoord("0", "0");
    const drawCode = `\\begin{scope}[shift={(${coord.x},${coord.y})}]
    \\coordinate (node_Rx.l) at (0,0);
    \\draw[thick, line cap=round] (0,0) -- (0.155,0) -- (0.1875,0.15) -- (0.2525,-0.15) -- (0.3175,0.15) -- (0.3825,-0.15) -- (0.4475,0.15) -- (0.5125,-0.15) -- (0.545,0) -- (0.7,0);
    \\node at (0.4,0.35) {$R_D$};
    \\coordinate (node_Rx.r) at (0.7,0);
  \\end{scope}`;
    const lastEnd = source.lastIndexOf("\\end{tikzpicture}");
    if (lastEnd === -1) {
      const code = `\\begin{tikzpicture}\n  ${drawCode}\n\\end{tikzpicture}`;
      dispatch({ type: "CODE_EDITED", source: source ? source + "\n\n" + code : code });
    } else {
      const before = source.slice(0, lastEnd);
      const after = source.slice(lastEnd);
      const newSource = before + "  " + drawCode + "\n" + after;
      dispatch({ type: "CODE_EDITED", source: newSource });
    }
  };

  const insertMosfet = () => {
    const coord = getPlacementCoord("0", "0");
    const drawCode = `\\begin{scope}[shift={(${coord.x},${coord.y})}]
    \\coordinate (node_Mx.g) at (-0.25,0);
    \\draw[thick, line cap=round] (-0.25,0) -- (0.01,0);
    \\draw[ultra thick] (0,-0.25) -- (0,0.25);
    \\draw[ultra thick] (0.15,-0.3) -- (0.15,0.3);
    \\draw[thick, line cap=round, line join=round] (0.15,0.2) -- (0.48,0.2) -- (0.48,0.5);
    \\draw[-{Triangle[length=1.6mm, width=1.1mm, sep=-1.2pt]}, thick, line cap=round] (0.15,-0.2) -- (0.45,-0.2);
    \\draw[thick, line cap=round] (0.48,-0.209) -- (0.48,-0.5);
    \\node[node font=\\sffamily\\bfseries] at (-0.55,0.04) {$M_1$};
    \\coordinate (node_Mx.d) at (0.48,0.5);
    \\coordinate (node_Mx.s) at (0.48,-0.5);
  \\end{scope}`;
    const lastEnd = source.lastIndexOf("\\end{tikzpicture}");
    if (lastEnd === -1) {
      const code = `\\begin{tikzpicture}\n  ${drawCode}\n\\end{tikzpicture}`;
      dispatch({ type: "CODE_EDITED", source: source ? source + "\n\n" + code : code });
    } else {
      const before = source.slice(0, lastEnd);
      const after = source.slice(lastEnd);
      const newSource = before + "  " + drawCode + "\n" + after;
      dispatch({ type: "CODE_EDITED", source: newSource });
    }
  };

  const insertPmos = () => {
    const coord = getPlacementCoord("0", "0");
    const drawCode = `\\begin{scope}[shift={(${coord.x},${coord.y})}]
    \\coordinate (node_Mx.g) at (-0.25,0);
    \\draw[thick, line cap=round] (-0.25,0) -- (0.01,0);
    \\draw[ultra thick] (0,-0.25) -- (0,0.25);
    \\draw[ultra thick] (0.15,-0.3) -- (0.15,0.3);
    \\draw[thick, line cap=round, line join=round] (0.15,-0.2) -- (0.48,-0.2) -- (0.48,-0.5);
    \\draw[-{Triangle[length=1.6mm, width=1.1mm, sep=-1.2pt]}, thick, line cap=round] (0.15,0.2) -- (0.45,0.2);
    \\draw[thick, line cap=round] (0.48,0.5) -- (0.48,0.21);
    \\node[node font=\\sffamily\\bfseries] at (-0.55,0.04) {$M_1$};
    \\coordinate (node_Mx.d) at (0.48,-0.5);
    \\coordinate (node_Mx.s) at (0.48,0.5);
  \\end{scope}`;
    const lastEnd = source.lastIndexOf("\\end{tikzpicture}");
    if (lastEnd === -1) {
      const code = `\\begin{tikzpicture}\n  ${drawCode}\n\\end{tikzpicture}`;
      dispatch({ type: "CODE_EDITED", source: source ? source + "\n\n" + code : code });
    } else {
      const before = source.slice(0, lastEnd);
      const after = source.slice(lastEnd);
      const newSource = before + "  " + drawCode + "\n" + after;
      dispatch({ type: "CODE_EDITED", source: newSource });
    }
  };

  const insertNode = () => {
    const coord = getPlacementCoord("1.03", "0.3");
    const drawCode = `\\begin{scope}[shift={(${coord.x},${coord.y})}]
    \\draw[fill=black] (0,0) circle (0.055cm);
    \\coordinate (node_Nx.center) at (0,0);
  \\end{scope}`;
    const lastEnd = source.lastIndexOf("\\end{tikzpicture}");
    if (lastEnd === -1) {
      const code = `\\begin{tikzpicture}\n  ${drawCode}\n\\end{tikzpicture}`;
      dispatch({ type: "CODE_EDITED", source: source ? source + "\n\n" + code : code });
    } else {
      const before = source.slice(0, lastEnd);
      const after = source.slice(lastEnd);
      const newSource = before + "  " + drawCode + "\n" + after;
      dispatch({ type: "CODE_EDITED", source: newSource });
    }
  };

  const insertIoNode = () => {
    const coord = getPlacementCoord("0.63", "0.38");
    const drawCode = `\\begin{scope}[shift={(${coord.x},${coord.y})}]
    \\draw[fill=white, thick] (0,0) circle (0.055cm);
    \\coordinate (node_IOx.center) at (0,0);
  \\end{scope}`;
    const lastEnd = source.lastIndexOf("\\end{tikzpicture}");
    if (lastEnd === -1) {
      const code = `\\begin{tikzpicture}\n  ${drawCode}\n\\end{tikzpicture}`;
      dispatch({ type: "CODE_EDITED", source: source ? source + "\n\n" + code : code });
    } else {
      const before = source.slice(0, lastEnd);
      const after = source.slice(lastEnd);
      const newSource = before + "  " + drawCode + "\n" + after;
      dispatch({ type: "CODE_EDITED", source: newSource });
    }
  };

  const insertVdd = () => {
    const coord = getPlacementCoord("-0.55", "3.43");
    const drawCode = `\\begin{scope}[shift={(${coord.x},${coord.y})}]
    \\draw[ultra thick] (-0.55,0) -- (1.3,0);
    \\node[draw=none] at (1.6,-0.22) {$V_{DD}$};
    \\draw[thick, line cap=round] (0.4,-0.22) -- (0.4,-0.0);
    \\coordinate (node_VDD.bottom) at (0.4,-0.22);
  \\end{scope}`;
    const lastEnd = source.lastIndexOf("\\end{tikzpicture}");
    if (lastEnd === -1) {
      const code = `\\begin{tikzpicture}\n  ${drawCode}\n\\end{tikzpicture}`;
      dispatch({ type: "CODE_EDITED", source: source ? source + "\n\n" + code : code });
    } else {
      const before = source.slice(0, lastEnd);
      const after = source.slice(lastEnd);
      const newSource = before + "  " + drawCode + "\n" + after;
      dispatch({ type: "CODE_EDITED", source: newSource });
    }
  };

  const insertCapacitor = () => {
    const coord = getPlacementCoord("0", "0");
    const drawCode = `\\begin{scope}[shift={(${coord.x},${coord.y})}]
    \\coordinate (node_Cx.l) at (-0.2,0);
    \\draw[ultra thick] (0,-0.25) -- (0,0.25);
    \\draw[ultra thick] (0.16,-0.25) -- (0.16,0.25);
    \\draw[thick, line cap=round] (0,0) -- (-0.2,0);
    \\draw[thick, line cap=round] (0.16,0) -- (0.36,0);
    \\coordinate (node_Cx.r) at (0.36,0);
  \\end{scope}`;
    const lastEnd = source.lastIndexOf("\\end{tikzpicture}");
    if (lastEnd === -1) {
      const code = `\\begin{tikzpicture}\n  ${drawCode}\n\\end{tikzpicture}`;
      dispatch({ type: "CODE_EDITED", source: source ? source + "\n\n" + code : code });
    } else {
      const before = source.slice(0, lastEnd);
      const after = source.slice(lastEnd);
      const newSource = before + "  " + drawCode + "\n" + after;
      dispatch({ type: "CODE_EDITED", source: newSource });
    }
  };

  const insertGnd = () => {
    const coord = getPlacementCoord("0.2", "0.05");
    const drawCode = `\\begin{scope}[shift={(${coord.x},${coord.y})}]
    \\draw[ultra thick] (0.03,-0.16) -- (0.37,-0.16);
    \\draw[ultra thick] (0.09,-0.3) -- (0.31,-0.3);
    \\draw[ultra thick] (0.12,-0.44) -- (0.28,-0.44);
    \\draw[thick, line cap=round] (0.2,-0.16) -- (0.2,0.05);
    \\coordinate (node_GND.top) at (0.2,0.05);
  \\end{scope}`;
    const lastEnd = source.lastIndexOf("\\end{tikzpicture}");
    if (lastEnd === -1) {
      const code = `\\begin{tikzpicture}\n  ${drawCode}\n\\end{tikzpicture}`;
      dispatch({ type: "CODE_EDITED", source: source ? source + "\n\n" + code : code });
    } else {
      const before = source.slice(0, lastEnd);
      const after = source.slice(lastEnd);
      const newSource = before + "  " + drawCode + "\n" + after;
      dispatch({ type: "CODE_EDITED", source: newSource });
    }
  };

  const insertFunctionPlot = () => {
    const expr = plotExpr.trim();
    if (!expr) return;
    const parts: string[] = [];
    if (plotDomainMin || plotDomainMax) {
      parts.push(`domain=${plotDomainMin || "0"}:${plotDomainMax || "1"}`);
    }
    parts.push("smooth");
    parts.push("variable=\\x");
    if (plotColor && plotColor !== "black") {
      parts.push(plotColor);
    }
    if (plotLineStyle === "dashed") {
      parts.push("dashed");
    } else if (plotLineStyle === "dotted") {
      parts.push("dotted");
    }
    const opts = parts.join(", ");
    const wrappedExpr = expr.startsWith("{") ? expr : `{${expr}}`;
    const drawCode = `\\draw[${opts}] plot (\\x, ${wrappedExpr});`;
    const lastEnd = source.lastIndexOf("\\end{tikzpicture}");
    if (lastEnd === -1) {
      const code = `\\begin{tikzpicture}\n  ${drawCode}\n\\end{tikzpicture}`;
      dispatch({ type: "CODE_EDITED", source: source ? source + "\n\n" + code : code });
    } else {
      const before = source.slice(0, lastEnd);
      const after = source.slice(lastEnd);
      const newSource = before + "  " + drawCode + "\n" + after;
      dispatch({ type: "CODE_EDITED", source: newSource });
    }
  };

  const applyPlotPreset = (preset: PlotPreset) => {
    setPlotExpr((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return preset.expr;
      return `${trimmed} + ${preset.expr}`;
    });
    setPlotDomainMin(preset.domainMin);
    setPlotDomainMax(preset.domainMax);
  };

  const resetPlotForm = () => {
    setPlotExpr("sin(deg(\\x))");
    setPlotDomainMin("0");
    setPlotDomainMax("6.28");
    setPlotColor("blue");
    setPlotLineStyle("solid");
  };

  const renderPlotPopup = () => {
    return (
      <ToolbarPopupSection title="Function Plot">
        <div className={popupCss.plotPopup}>
          {/* Preset selector */}
          <div className={popupCss.plotPresetRow}>
            {PLOT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={popupCss.plotPresetBtn}
                onClick={() => applyPlotPreset(preset)}
                title={`Add ${preset.label}`}
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              className={popupCss.plotRefreshBtn}
              onClick={resetPlotForm}
              title="Reset form"
            >
              ↺
            </button>
          </div>

          {/* LaTeX preview */}
          <div className={popupCss.plotPreviewBox}>
            <div ref={plotPreviewRef} className={popupCss.plotPreviewMath} />
          </div>

          {/* Expression input */}
          <label className={popupCss.plotLabel}>
            Expression
            <input
              type="text"
              className={popupCss.plotInput}
              value={plotExpr}
              onChange={(e) => setPlotExpr(e.target.value)}
              placeholder="sin(deg(\x))"
              spellCheck={false}
            />
          </label>

          {/* Domain */}
          <div className={popupCss.plotDomainRow}>
            <label className={popupCss.plotLabel}>
              x min
              <input
                type="text"
                className={popupCss.plotInputSmall}
                value={plotDomainMin}
                onChange={(e) => setPlotDomainMin(e.target.value)}
                placeholder="0"
                spellCheck={false}
              />
            </label>
            <label className={popupCss.plotLabel}>
              x max
              <input
                type="text"
                className={popupCss.plotInputSmall}
                value={plotDomainMax}
                onChange={(e) => setPlotDomainMax(e.target.value)}
                placeholder="6.28"
                spellCheck={false}
              />
            </label>
          </div>

          {/* Color and style */}
          <div className={popupCss.plotDomainRow}>
            <label className={popupCss.plotLabel}>
              Color
              <select
                className={popupCss.plotInputSmall}
                value={plotColor}
                onChange={(e) => setPlotColor(e.target.value)}
              >
                <option value="black">black</option>
                <option value="blue">blue</option>
                <option value="red">red</option>
                <option value="green">green</option>
                <option value="orange">orange</option>
                <option value="purple">purple</option>
                <option value="cyan">cyan</option>
                <option value="magenta">magenta</option>
              </select>
            </label>
            <label className={popupCss.plotLabel}>
              Style
              <select
                className={popupCss.plotInputSmall}
                value={plotLineStyle}
                onChange={(e) => setPlotLineStyle(e.target.value as "solid" | "dashed" | "dotted")}
              >
                <option value="solid">solid</option>
                <option value="dashed">dashed</option>
                <option value="dotted">dotted</option>
              </select>
            </label>
          </div>

          {/* Insert button */}
          <button
            type="button"
            className={popupCss.plotInsertBtn}
            onClick={() => {
              insertFunctionPlot();
              setOpenPopupMode(null);
            }}
          >
            Insert Plot
          </button>
        </div>
      </ToolbarPopupSection>
    );
  };

  const renderPopup = (popupKind: ToolPopupKind) => {
    if (popupKind === "bucket-color") {
      return (
        <ToolbarPopupSection title="Bucket Color">
          <ColorPicker
            ariaLabel="Bucket fill color"
            value={bucketFillColor}
            syntaxValue={bucketFillColor}
            options={TOOL_COLOR_OPTIONS}
            namedColorSwatches={projectNamedColorSwatches}
            onChange={(nextValue) => {
              dispatch({ type: "SET_BUCKET_FILL_COLOR", value: nextValue });
              // Auto-activate bucket tool after selecting a color
              dispatch({ type: "SET_TOOL_MODE", mode: "addBucket" });
              setBucketPopupClosePending(true);
            }}
          />
        </ToolbarPopupSection>
      );
    }
    if (popupKind === "shape-picker") {
      return (
        <ToolbarPopupSection title="Shape">
          <ToolbarPopupVisualChoiceGrid
            choices={SHAPE_POPUP_CHOICES}
            selectedId={selectedAddShape}
            onSelect={(id) => {
              dispatch({ type: "SET_ADD_SHAPE_PRESET", value: id as typeof selectedAddShape });
              // Activate the shape tool and close popup
              dispatch({ type: "SET_TOOL_MODE", mode: "addShape" });
              setOpenPopupMode(null);
            }}
            testIdPrefix="toolbar-shape-choice"
          />
        </ToolbarPopupSection>
      );
    }
    if (popupKind === "matrix-picker") {
      const maxColumns = 10;
      const maxRows = 8;
      const isSelected = (row: number, column: number): boolean =>
        row <= matrixPreviewRows && column <= matrixPreviewColumns;
      return (
        <ToolbarPopupSection title={`Insert Matrix (${matrixPreviewColumns} x ${matrixPreviewRows})`}>
          <div
            className={popupCss.matrixPicker}
            data-testid="toolbar-matrix-picker-grid"
            onMouseLeave={() => { setMatrixHoverSize(null); }}
          >
            {Array.from({ length: maxRows }, (_, rowIndex) => rowIndex + 1).map((row) => (
              <div key={row} className={popupCss.matrixPickerRow}>
                {Array.from({ length: maxColumns }, (_, columnIndex) => columnIndex + 1).map((column) => (
                  <button
                    key={`${row}-${column}`}
                    type="button"
                    className={[
                      popupCss.matrixPickerCell,
                      isSelected(row, column) ? popupCss.matrixPickerCellSelected : ""
                    ].filter(Boolean).join(" ")}
                    onMouseEnter={() => { setMatrixHoverSize({ rows: row, columns: column }); }}
                    onFocus={() => { setMatrixHoverSize({ rows: row, columns: column }); }}
                    onClick={() => {
                      dispatch({ type: "SET_ADD_MATRIX_PRESET", rows: row, columns: column });
                      dispatch({ type: "SET_TOOL_MODE", mode: "addMatrix" });
                      setMatrixHoverSize(null);
                      setOpenPopupMode(null);
                    }}
                    data-testid={`toolbar-matrix-picker-cell-${row}-${column}`}
                    aria-label={`${row} rows by ${column} columns`}
                    aria-selected={isSelected(row, column)}
                  />
                ))}
              </div>
            ))}
          </div>
        </ToolbarPopupSection>
      );
    }
    if (popupKind === "function-plot") {
      return renderPlotPopup();
    }
    return null;
  };

  const renderBucketButton = () => {
    const mode = "addBucket" as const;
    const toolDef = TOOL_BUTTONS.find((b) => b.mode === mode)!;
    const capability = getToolCapabilityStatus(mode);
    const unsupported = capability.status === "unsupported";
    const buttonTitle = unsupported
      ? `${toolDef.title}\n${capability.reason}`
      : toolDef.title;
    const Icon = toolDef.icon;
    const isActive = toolMode === mode;

    const bucketFillColorCss = cssColorForToken(bucketFillColor, namedColorLookup) ?? "transparent";

    return (
      <ToolbarToolPopup
        key={mode}
        open={openPopupMode === mode}
        onClose={closeBucketPopup}
        popup={renderPopup("bucket-color")}
        popupTestId="toolbar-tool-popup-addBucket"
        popupClassName={popupCss.bucketColorPopup}
      >
        <div className={css.splitButton}>
          <RenderedTooltip content={buttonTitle}>
            <button
              type="button"
              className={[css.btn, css.splitButtonMain, isActive ? css.btnActive : ""].filter(Boolean).join(" ")}
              aria-label={toolDef.label}
              disabled={unsupported}
              onClick={() => {
                dispatch({ type: "SET_TOOL_MODE", mode: isActive ? "select" : mode });
                closeBucketPopup();
              }}
            >
              <Icon size={18} />
              <div
                className={css.bucketColorIndicator}
                style={{ backgroundColor: bucketFillColorCss }}
              />
            </button>
          </RenderedTooltip>
          <RenderedTooltip content="Choose bucket color">
            <button
              type="button"
              className={[css.btn, css.splitButtonCaret, isActive ? css.btnActive : ""].filter(Boolean).join(" ")}
              aria-label="Choose bucket color"
              aria-haspopup="dialog"
              aria-expanded={openPopupMode === mode}
              disabled={unsupported}
              data-testid="toolbar-bucket-color-caret"
              onClick={(e) => {
                e.stopPropagation();
                setOpenPopupMode((current) => (current === mode ? null : mode));
              }}
            >
              <CaretDownIcon size={8} />
            </button>
          </RenderedTooltip>
        </div>
      </ToolbarToolPopup>
    );
  };

  const renderShapeButton = () => {
    const mode = "addShape" as const;
    const toolDef = TOOL_BUTTONS.find((b) => b.mode === mode)!;
    const capability = getToolCapabilityStatus(mode);
    const unsupported = capability.status === "unsupported";
    const buttonTitle = unsupported
      ? `${toolDef.title}\n${capability.reason}`
      : toolDef.title;
    const Icon = toolDef.icon;
    const isActive = toolMode === mode;

    return (
      <ToolbarToolPopup
        key={mode}
        open={openPopupMode === mode}
        onClose={() => { setOpenPopupMode(null); }}
        popup={renderPopup("shape-picker")}
        popupTestId="toolbar-tool-popup-addShape"
      >
        <RenderedTooltip content={buttonTitle}>
          <button
            type="button"
            className={[css.btn, isActive ? css.btnActive : ""].filter(Boolean).join(" ")}
            aria-label={toolDef.label}
            aria-haspopup="dialog"
            aria-expanded={openPopupMode === mode}
            disabled={unsupported}
            onClick={() => {
              // Just open the popup, don't activate the tool
              setOpenPopupMode((current) => (current === mode ? null : mode));
            }}
          >
            <Icon size={18} />
          </button>
        </RenderedTooltip>
      </ToolbarToolPopup>
    );
  };

  const renderMatrixButton = () => {
    const mode = "addMatrix" as const;
    const toolDef = TOOL_BUTTONS.find((b) => b.mode === mode)!;
    const capability = getToolCapabilityStatus(mode);
    const unsupported = capability.status === "unsupported";
    const buttonTitle = unsupported
      ? `${toolDef.title}\n${capability.reason}`
      : toolDef.title;
    const Icon = toolDef.icon;
    const isActive = toolMode === mode;

    return (
      <ToolbarToolPopup
        key={mode}
        open={openPopupMode === mode}
        onClose={() => {
          setOpenPopupMode(null);
          setMatrixHoverSize(null);
        }}
        popup={renderPopup("matrix-picker")}
        popupTestId="toolbar-tool-popup-addMatrix"
      >
        <RenderedTooltip content={buttonTitle}>
          <button
            type="button"
            className={[css.btn, isActive ? css.btnActive : ""].filter(Boolean).join(" ")}
            aria-label={toolDef.label}
            aria-haspopup="dialog"
            aria-expanded={openPopupMode === mode}
            disabled={unsupported}
            onClick={() => {
              setMatrixHoverSize(null);
              setOpenPopupMode((current) => (current === mode ? null : mode));
            }}
          >
            <Icon size={18} />
          </button>
        </RenderedTooltip>
      </ToolbarToolPopup>
    );
  };

  const renderStandardButton = (toolDef: (typeof TOOL_BUTTONS)[number]) => {
    const { mode, label, title, icon: Icon } = toolDef;
    const capability = getToolCapabilityStatus(mode);
    const unsupported = capability.status === "unsupported";
    const buttonTitle = unsupported
      ? `${title}\n${capability.reason}`
      : title;
    const nextMode = resolveToolbarToolMode(toolMode, mode);
    const isActive = toolMode === mode;

    return (
      <RenderedTooltip key={mode} content={buttonTitle}>
        <button
          type="button"
          className={[css.btn, isActive ? css.btnActive : ""].filter(Boolean).join(" ")}
          aria-label={label}
          disabled={unsupported}
          onClick={() => {
            dispatch({ type: "SET_TOOL_MODE", mode: nextMode });
            setOpenPopupMode(null);
          }}
        >
          <Icon size={18} />
        </button>
      </RenderedTooltip>
    );
  };

  return (
    <div className={`${css.toolbar}${isMacDesktop ? ` ${css.toolbarDesktop}` : ""}`} data-tauri-drag-region data-select="chrome">
      {showAppTitle ? (
        <>
          <span className={css.title}>
            TikZ Editor <span className={css.titleQualifier}>Web</span>
          </span>
          <div className={css.separator} />
        </>
      ) : null}

      <div className={css.group}>
        {TOOL_BUTTONS.flatMap((toolDef) => {
          const separator = toolDef.separatorBefore ? <div key={`sep-${toolDef.mode}`} className={css.separator} /> : null;
          // Special handling for bucket and shape buttons
          let button;
          if (toolDef.mode === "addBucket") {
            button = renderBucketButton();
          } else if (toolDef.mode === "addMatrix") {
            button = renderMatrixButton();
          } else if (toolDef.mode === "addShape") {
            button = renderShapeButton();
          } else {
            button = renderStandardButton(toolDef);
          }
          return separator ? [separator, button] : [button];
        })}
        <div className={css.separator} />
        <ToolbarToolPopup
          open={openPopupMode === "function-plot"}
          onClose={() => setOpenPopupMode(null)}
          popup={renderPlotPopup()}
          popupTestId="toolbar-tool-popup-plot"
          popupClassName={popupCss.plotPopupContainer}
        >
          <RenderedTooltip content="Function Plot">
            <button
              type="button"
              className={[css.btn, openPopupMode === "function-plot" ? css.btnActive : ""].filter(Boolean).join(" ")}
              aria-label="Function Plot"
              aria-haspopup="dialog"
              aria-expanded={openPopupMode === "function-plot"}
              onClick={() => {
                setOpenPopupMode((current) => (current === "function-plot" ? null : "function-plot"));
              }}
            >
              <PlotIcon size={18} />
            </button>
          </RenderedTooltip>
        </ToolbarToolPopup>
        <div className={css.separator} />
        <MosfetElementSubmenu
          tooltip="nMOS (Z)"
          buttonContent="n"
          buttonStyle={{ fontSize: "16px", fontWeight: "bold", fontFamily: "serif" }}
          toolModes={{
            leftD: "addNMOS_Left_D",
            leftG: "addNMOS_Left_G",
            leftS: "addNMOS_Left_S",
            rightD: "addNMOS_Right_D",
            rightG: "addNMOS_Right_G",
            rightS: "addNMOS_Right_S"
          }}
          currentToolMode={toolMode}
          onSelectMode={(mode) => dispatch({ type: "SET_TOOL_MODE", mode })}
        />
        <MosfetElementSubmenu
          tooltip="pMOS (Q)"
          buttonContent="p"
          buttonStyle={{ fontSize: "16px", fontWeight: "bold", fontFamily: "serif" }}
          toolModes={{
            leftD: "addPMOS_Left_D",
            leftG: "addPMOS_Left_G",
            leftS: "addPMOS_Left_S",
            rightD: "addPMOS_Right_D",
            rightG: "addPMOS_Right_G",
            rightS: "addPMOS_Right_S"
          }}
          currentToolMode={toolMode}
          onSelectMode={(mode) => dispatch({ type: "SET_TOOL_MODE", mode })}
        />
        <CircuitElementSubmenu
          tooltip="连接线 (W)"
          buttonContent="—"
          buttonStyle={{ fontSize: "15px", fontWeight: "bold", fontFamily: "monospace" }}
          toolModes={{
            hLeft: "addWireLead_H_Left",
            hRight: "addWireLead_H_Right",
            vTop: "addWireLead_V_Top",
            vBottom: "addWireLead_V_Bottom"
          }}
          defaultMode="addWireLead_V_Top"
          currentToolMode={toolMode}
          onSelectMode={(mode) => dispatch({ type: "SET_TOOL_MODE", mode })}
        />
        <RenderedTooltip content="多段正交线 (M)">
          <button
            type="button"
            className={[css.btn, toolMode === "addOrthoWire" ? css.btnActive : ""].filter(Boolean).join(" ")}
            aria-label="多段正交线"
            onClick={() => dispatch({ type: "SET_TOOL_MODE", mode: toolMode === "addOrthoWire" ? "select" : "addOrthoWire" })}
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <OrthoWireIcon size={18} />
          </button>
        </RenderedTooltip>
        <CircuitElementSubmenu
          tooltip="电阻 (R)"
          buttonContent={<ResistorIcon size={18} />}
          toolModes={{
            hLeft: "addResistor_H_Left",
            hRight: "addResistor_H_Right",
            vTop: "addResistor_V_Top",
            vBottom: "addResistor_V_Bottom"
          }}
          defaultMode="addResistor_V_Bottom"
          currentToolMode={toolMode}
          onSelectMode={(mode) => dispatch({ type: "SET_TOOL_MODE", mode })}
        />
        <CircuitElementSubmenu
          tooltip="电容 (C)"
          buttonContent={
            <svg width="18" height="18" viewBox="0 0 18 18" style={{ display: "block" }}>
              <line x1="1" y1="9" x2="6.5" y2="9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="6.5" y1="3" x2="6.5" y2="15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <line x1="11.5" y1="3" x2="11.5" y2="15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <line x1="11.5" y1="9" x2="17" y2="9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          }
          toolModes={{
            hLeft: "addCapacitor_H_Left",
            hRight: "addCapacitor_H_Right",
            vTop: "addCapacitor_V_Top",
            vBottom: "addCapacitor_V_Bottom"
          }}
          defaultMode="addCapacitor_V_Top"
          currentToolMode={toolMode}
          onSelectMode={(mode) => dispatch({ type: "SET_TOOL_MODE", mode })}
        />
        <CircuitElementSubmenu
          tooltip="电压源 (V)"
          buttonContent="V"
          buttonStyle={{ fontSize: "14px", fontWeight: "bold", fontFamily: "serif" }}
          toolModes={{
            hLeft: "addVoltageSource_H_Left",
            hRight: "addVoltageSource_H_Right",
            vTop: "addVoltageSource_V_Top",
            vBottom: "addVoltageSource_V_Bottom"
          }}
          defaultMode="addVoltageSource_V_Top"
          currentToolMode={toolMode}
          onSelectMode={(mode) => dispatch({ type: "SET_TOOL_MODE", mode })}
        />
        <CurrentSourceSubmenu
          tooltip="电流源 (E)"
          buttonContent="I"
          buttonStyle={{ fontSize: "14px", fontWeight: "bold", fontFamily: "serif" }}
          currentToolMode={toolMode}
          onSelectMode={(mode) => dispatch({ type: "SET_TOOL_MODE", mode })}
        />
        <CurrentArrowSubmenu
          tooltip="电流箭头 (A)"
          buttonContent="i"
          buttonStyle={{ fontSize: "14px", fontWeight: "bold", fontFamily: "serif" }}
          currentToolMode={toolMode}
          onSelectMode={(mode) => dispatch({ type: "SET_TOOL_MODE", mode })}
        />
        <RenderedTooltip content="VDD (按住V+D)">
          <button
            type="button"
            className={[css.btn, toolMode === "addVDD" ? css.btnActive : ""].filter(Boolean).join(" ")}
            aria-label="VDD"
            onClick={() => dispatch({ type: "SET_TOOL_MODE", mode: toolMode === "addVDD" ? "select" : "addVDD" })}
            style={{ fontSize: "12px", fontWeight: "bold", fontFamily: "serif" }}
          >
            VDD
          </button>
        </RenderedTooltip>
        <CircuitElementSubmenu
          tooltip="GND (G)"
          buttonContent="GND"
          buttonStyle={{ fontSize: "12px", fontWeight: "bold", fontFamily: "serif" }}
          toolModes={{
            hLeft: "addGND_H_Left",
            hRight: "addGND_H_Right",
            vTop: "addGND_V_Top",
            vBottom: "addGND_V_Bottom"
          }}
          defaultMode="addGND_V_Bottom"
          currentToolMode={toolMode}
          onSelectMode={(mode) => dispatch({ type: "SET_TOOL_MODE", mode })}
        />
        <RenderedTooltip content="支路节点 (D)">
          <button
            type="button"
            className={[css.btn, toolMode === "addDotNode" ? css.btnActive : ""].filter(Boolean).join(" ")}
            aria-label="支路节点"
            onClick={() => dispatch({ type: "SET_TOOL_MODE", mode: toolMode === "addDotNode" ? "select" : "addDotNode" })}
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <circle cx="9" cy="9" r="4" fill="currentColor" />
            </svg>
          </button>
        </RenderedTooltip>
        <IoNodeSubmenu
          tooltip="I&O 端点 (T)"
          currentToolMode={toolMode}
          onSelectMode={(mode) => dispatch({ type: "SET_TOOL_MODE", mode })}
        />
      </div>
      <div className={css.spacer} />
      {updateChip ? (
        <RenderedTooltip content={`Install update ${updateChip.version}`}>
          <button
            type="button"
            className={css.updateChip}
            onClick={updateChip.onClick}
            data-testid="toolbar-update-chip"
            aria-label={`Update available: ${updateChip.version}`}
          >
            <RiDownloadCloudLine size={15} aria-hidden="true" />
            <span>Update available</span>
          </button>
        </RenderedTooltip>
      ) : null}
    </div>
  );
}
