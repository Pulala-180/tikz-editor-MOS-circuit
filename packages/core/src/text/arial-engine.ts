import type {
  NodeTextEngine,
  NodeTextMeasureRequest,
  NodeTextMetrics,
  NodeTextRenderPayload,
  NodeTextValidationIssue
} from "./types.js";

// Greek and math symbol mapping for Arial unicode rendering
const GREEK_MATH_SYMBOLS: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  Gamma: "Γ",
  delta: "δ",
  Delta: "Δ",
  epsilon: "ε",
  varepsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  Theta: "Θ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  Lambda: "Λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  Xi: "Ξ",
  pi: "π",
  Pi: "Π",
  rho: "ρ",
  sigma: "σ",
  Sigma: "Σ",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  varphi: "ϕ",
  Phi: "Φ",
  chi: "χ",
  psi: "ψ",
  Psi: "Ψ",
  omega: "ω",
  Omega: "Ω",
  pm: "±",
  mp: "∓",
  times: "×",
  cdot: "·",
  div: "÷",
  approx: "≈",
  neq: "≠",
  ne: "≠",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  ll: "≪",
  gg: "≫",
  infty: "∞",
  partial: "∂",
  nabla: "∇",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  parallel: "∥"
};

type FormattedSegment = {
  text: string;
  italic: boolean;
  subscript?: boolean;
  superscript?: boolean;
  fontSizeRatio?: number;
};

export function parseLatexForArial(input: string): FormattedSegment[] {
  let raw = input.trim();
  if (raw.length === 0) return [];

  // If wrapped in $ ... $, strip outer dollars
  const isMath = raw.startsWith("$") && raw.endsWith("$") && raw.length >= 2;
  if (isMath) {
    raw = raw.slice(1, -1).trim();
  }

  // Parse macros & math structures
  const segments: FormattedSegment[] = [];

  let idx = 0;
  while (idx < raw.length) {
    const ch = raw[idx];

    // 1. TeX control sequences (\macro)
    if (ch === "\\") {
      const match = raw.slice(idx).match(/^\\([a-zA-Z]+|\S)/);
      if (match) {
        const cmd = match[1];
        const cmdEnd = idx + match[0].length;

        // LaTeX formatting macros
        if (cmd === "textit" || cmd === "mathit" || cmd === "it") {
          const arg = readGroupArg(raw, cmdEnd);
          if (arg) {
            const inner = parseLatexForArial(arg.content);
            for (const seg of inner) {
              segments.push({ ...seg, italic: true });
            }
            idx = arg.nextIndex;
            continue;
          }
        } else if (cmd === "textbf" || cmd === "mathbf" || cmd === "bf") {
          const arg = readGroupArg(raw, cmdEnd);
          if (arg) {
            const inner = parseLatexForArial(arg.content);
            segments.push(...inner);
            idx = arg.nextIndex;
            continue;
          }
        } else if (cmd === "textup" || cmd === "mathrm" || cmd === "text" || cmd === "rm") {
          const arg = readGroupArg(raw, cmdEnd);
          if (arg) {
            const inner = parseLatexForArial(arg.content);
            for (const seg of inner) {
              segments.push({ ...seg, italic: false });
            }
            idx = arg.nextIndex;
            continue;
          }
        } else if (cmd === "textsubscript") {
          const arg = readGroupArg(raw, cmdEnd);
          if (arg) {
            const inner = parseLatexForArial(arg.content);
            for (const seg of inner) {
              segments.push({
                ...seg,
                subscript: true,
                fontSizeRatio: 0.72
              });
            }
            idx = arg.nextIndex;
            continue;
          }
        } else if (cmd === "textsuperscript") {
          const arg = readGroupArg(raw, cmdEnd);
          if (arg) {
            const inner = parseLatexForArial(arg.content);
            for (const seg of inner) {
              segments.push({
                ...seg,
                superscript: true,
                fontSizeRatio: 0.72
              });
            }
            idx = arg.nextIndex;
            continue;
          }
        } else if (cmd in GREEK_MATH_SYMBOLS) {
          segments.push({
            text: GREEK_MATH_SYMBOLS[cmd],
            italic: isMath && !["Omega", "Delta", "Gamma", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Phi", "Psi"].includes(cmd)
          });
          idx = cmdEnd;
          continue;
        } else if (cmd === "frac") {
          const numArg = readGroupArg(raw, cmdEnd);
          if (numArg) {
            const denArg = readGroupArg(raw, numArg.nextIndex);
            if (denArg) {
              segments.push(...parseLatexForArial(numArg.content));
              segments.push({ text: "/", italic: false });
              segments.push(...parseLatexForArial(denArg.content));
              idx = denArg.nextIndex;
              continue;
            }
          }
        } else if (cmd === "," || cmd === " " || cmd === ";" || cmd === "quad") {
          segments.push({ text: " ", italic: false });
          idx = cmdEnd;
          continue;
        }

        // Unknown macro, push as literal symbol if single char or skip
        segments.push({ text: match[0], italic: false });
        idx = cmdEnd;
        continue;
      }
    }

    // 2. Subscript _
    if (ch === "_") {
      const nextIdx = idx + 1;
      if (nextIdx < raw.length) {
        if (raw[nextIdx] === "{") {
          const arg = readGroupArg(raw, nextIdx);
          if (arg) {
            const inner = parseLatexForArial(arg.content);
            for (const seg of inner) {
              // Numbers & multi-letter strings in subscript default to upright unless specified
              const isNumericOrMulti = /^[0-9]+$/.test(seg.text) || (!seg.italic && seg.text.length > 1);
              segments.push({
                ...seg,
                subscript: true,
                italic: seg.italic ?? !isNumericOrMulti,
                fontSizeRatio: 0.72
              });
            }
            idx = arg.nextIndex;
            continue;
          }
        } else {
          const singleChar = raw[nextIdx];
          const isNum = /^[0-9]$/.test(singleChar);
          segments.push({
            text: singleChar,
            subscript: true,
            italic: isMath && !isNum,
            fontSizeRatio: 0.72
          });
          idx = nextIdx + 1;
          continue;
        }
      }
    }

    // 3. Superscript ^
    if (ch === "^") {
      const nextIdx = idx + 1;
      if (nextIdx < raw.length) {
        if (raw[nextIdx] === "{") {
          const arg = readGroupArg(raw, nextIdx);
          if (arg) {
            const inner = parseLatexForArial(arg.content);
            for (const seg of inner) {
              segments.push({
                ...seg,
                superscript: true,
                fontSizeRatio: 0.72
              });
            }
            idx = arg.nextIndex;
            continue;
          }
        } else {
          segments.push({
            text: raw[nextIdx],
            superscript: true,
            italic: isMath && /^[a-zA-Z]$/.test(raw[nextIdx]),
            fontSizeRatio: 0.72
          });
          idx = nextIdx + 1;
          continue;
        }
      }
    }

    // 4. Regular characters
    if (ch === "{" || ch === "}") {
      idx++;
      continue;
    }

    const isLetter = /^[a-zA-Z]$/.test(ch);
    const isDigit = /^[0-9]$/.test(ch);

    segments.push({
      text: ch,
      italic: isMath ? isLetter : false
    });
    idx++;
  }

  // Merge adjacent segments with identical styling
  const merged: FormattedSegment[] = [];
  for (const seg of segments) {
    if (merged.length > 0) {
      const last = merged[merged.length - 1];
      if (
        last.italic === seg.italic &&
        last.subscript === seg.subscript &&
        last.superscript === seg.superscript &&
        last.fontSizeRatio === seg.fontSizeRatio
      ) {
        last.text += seg.text;
        continue;
      }
    }
    merged.push({ ...seg });
  }

  return merged;
}

function readGroupArg(str: string, startIndex: number): { content: string; nextIndex: number } | null {
  let i = startIndex;
  while (i < str.length && /\s/.test(str[i])) i++;
  if (i >= str.length) return null;

  if (str[i] === "{") {
    let depth = 1;
    const start = i + 1;
    i++;
    while (i < str.length && depth > 0) {
      if (str[i] === "\\") {
        i += 2;
        continue;
      }
      if (str[i] === "{") depth++;
      else if (str[i] === "}") depth--;
      if (depth === 0) {
        return { content: str.slice(start, i), nextIndex: i + 1 };
      }
      i++;
    }
    return { content: str.slice(start), nextIndex: str.length };
  }

  // Single character argument
  return { content: str[i], nextIndex: i + 1 };
}

// Measurement helper
let offscreenCanvasCtx: CanvasRenderingContext2D | null = null;
function getCanvasContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!offscreenCanvasCtx) {
    const canvas = document.createElement("canvas");
    offscreenCanvasCtx = canvas.getContext("2d");
  }
  return offscreenCanvasCtx;
}

function estimateSegmentWidthPt(seg: FormattedSegment, fontSizePt: number): number {
  const effectiveSize = fontSizePt * (seg.fontSizeRatio ?? 1.0);
  const ctx = getCanvasContext();
  if (ctx) {
    const style = seg.italic ? "italic" : "normal";
    ctx.font = `${style} bold ${effectiveSize}pt Arial, sans-serif`;
    return ctx.measureText(seg.text).width;
  }

  // Node.js fallback metrics
  let charWidthRatio = 0.58;
  if (seg.italic) charWidthRatio = 0.60;
  if (seg.text.length === 1 && /[A-Z]/.test(seg.text)) charWidthRatio = 0.70;
  if (seg.text.length === 1 && /[ijl1tf]/.test(seg.text)) charWidthRatio = 0.32;
  if (seg.text.length === 1 && /[mwMW]/.test(seg.text)) charWidthRatio = 0.85;

  return seg.text.length * effectiveSize * charWidthRatio;
}

export function createArialNodeTextEngine(): NodeTextEngine {
  const cache = new Map<string, { payload: NodeTextRenderPayload; metrics: NodeTextMetrics }>();

  return {
    validate(_text: string): NodeTextValidationIssue | null {
      // All LaTeX formulas are accepted and formatted
      return null;
    },

    measure(request: NodeTextMeasureRequest): NodeTextMetrics | null {
      const fontSizePt = request.fontSizePt || 10;
      const segments = parseLatexForArial(request.text);

      let totalWidth = 0;
      for (const seg of segments) {
        totalWidth += estimateSegmentWidthPt(seg, fontSizePt);
      }
      totalWidth = Math.max(totalWidth, fontSizePt * 0.4);

      const height = fontSizePt * 1.25;
      const baselineY = fontSizePt * 0.88;
      const midLineY = fontSizePt * 0.52;
      const cacheKey = `arial:${request.text}:${fontSizePt}`;

      // Build SVG Tspans body
      const tspans = segments
        .map((seg) => {
          const fontStyle = seg.italic ? ' font-style="italic"' : ' font-style="normal"';
          let subSuperAttr = "";
          if (seg.subscript) {
            const subSize = (fontSizePt * 0.72).toFixed(2);
            subSuperAttr = ` font-size="${subSize}" baseline-shift="-30%"`;
          } else if (seg.superscript) {
            const superSize = (fontSizePt * 0.72).toFixed(2);
            subSuperAttr = ` font-size="${superSize}" baseline-shift="35%"`;
          }
          const escaped = seg.text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          return `<tspan${fontStyle}${subSuperAttr}>${escaped}</tspan>`;
        })
        .join("");

      const body = `<text x="${(totalWidth / 2).toFixed(2)}" y="${baselineY.toFixed(2)}" text-anchor="middle" dominant-baseline="alphabetic" font-family="Arial, 'Helvetica Neue', Helvetica, sans-serif" font-weight="bold" font-size="${fontSizePt}" fill="currentColor">${tspans}</text>`;

      const payload: NodeTextRenderPayload = {
        cacheKey,
        viewBox: {
          x: 0,
          y: 0,
          width: totalWidth,
          height: height
        },
        body
      };

      const metrics: NodeTextMetrics = {
        cacheKey,
        width: totalWidth,
        height,
        baselineY,
        midLineY,
        paragraphId: null,
        renderSourceText: request.text
      };

      cache.set(cacheKey, { payload, metrics });
      return metrics;
    },

    renderFromCache(cacheKey: string): NodeTextRenderPayload | null {
      return cache.get(cacheKey)?.payload ?? null;
    }
  };
}
