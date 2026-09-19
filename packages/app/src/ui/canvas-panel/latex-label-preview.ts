/**
 * Live LaTeX preview for the rich-label editor.
 *
 * MathJax only runs inside the render worker, so instead of re-instantiating a
 * math renderer in the UI we mirror the SVG the canvas already produced for the
 * label (`<svg data-text-renderer="mathjax">`) straight out of the emitted SVG
 * model. That keeps the preview on the exact same MathJax pipeline as the node
 * render — no extra math library, no duplicated rendering — and it updates live
 * because every keystroke re-patches the source and re-emits the SVG.
 */

type SvgPartLike = {
  partId: string;
  sourceId: string;
  elementId: string | null;
  markup: string;
};

type SvgModelLike = {
  parts: readonly SvgPartLike[];
};

export type LatexPreviewStatus = "empty" | "ready" | "error";

export type LatexPreviewState = {
  status: LatexPreviewStatus;
  html: string | null;
  message: string | null;
};

export const EMPTY_LATEX_PREVIEW: LatexPreviewState = {
  status: "empty",
  html: null,
  message: null
};

function isMathjaxTextPart(part: SvgPartLike, sourceId: string): boolean {
  if (part.sourceId !== sourceId) {
    return false;
  }
  return (
    part.partId.includes(":text:mathjax") || part.markup.includes('data-text-renderer="mathjax"')
  );
}

/** Re-wrap the emitted node-text SVG as a standalone, positionable preview. */
function toStandaloneSvg(markup: string): string | null {
  const trimmed = markup.trim();
  if (!trimmed.startsWith("<svg")) {
    return null;
  }
  const openEnd = trimmed.indexOf(">");
  const closeStart = trimmed.lastIndexOf("</svg>");
  if (openEnd < 0 || closeStart < 0 || closeStart <= openEnd) {
    return null;
  }
  const openTag = trimmed.slice(0, openEnd + 1);
  const body = trimmed.slice(openEnd + 1, closeStart);
  const viewBox = /viewBox="([^"]*)"/.exec(openTag)?.[1];
  if (!viewBox) {
    return null;
  }
  const numbers = viewBox.trim().split(/\s+/).map(Number);
  const width = numbers[2];
  const height = numbers[3];
  const sizeAttrs =
    Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
      ? ` width="${width}" height="${height}"`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${sizeAttrs} overflow="visible" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}

export function resolveLatexLabelPreview(
  model: SvgModelLike | null,
  sourceId: string | null,
  sceneTextId: string | null,
  text: string | null
): LatexPreviewState {
  if (!sourceId || text == null || text.trim().length === 0) {
    return EMPTY_LATEX_PREVIEW;
  }
  if (!model) {
    return { status: "error", html: null, message: "Preview unavailable" };
  }
  const candidates = model.parts.filter((part) => isMathjaxTextPart(part, sourceId));
  const chosen =
    (sceneTextId ? candidates.find((part) => part.elementId === sceneTextId) : undefined) ??
    candidates[0];
  if (!chosen) {
    return { status: "error", html: null, message: "Invalid LaTeX" };
  }
  const html = toStandaloneSvg(chosen.markup);
  if (!html) {
    return { status: "error", html: null, message: "Preview unavailable" };
  }
  return { status: "ready", html, message: null };
}
