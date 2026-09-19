/**
 * Pure helpers that turn a rich-label toolbar command into real, compilable
 * LaTeX for a canvas node label.
 *
 * The app renders a node label through the shared MathJax pipeline as
 * `\mbox{<text>}`, so the *text* mode only accepts text-safe wrappers
 * (`\textit`). Everything else — sub/superscripts, `\Omega` — is math-only and
 * must live inside `$...$`. These helpers enter math mode automatically when
 * needed, so a button can never emit LaTeX that fails to compile. Verified
 * against the repo's MathJax 4.1.1 configuration (input/tex + output/svg +
 * color/html packages).
 *
 * The toolbar deliberately exposes only a small set of commands: italic,
 * subscript, superscript and the symbol palette. Text-mode bold, overline,
 * bullet lists, alignment and font-size switches were removed; their builders
 * are gone with them so no dead LaTeX production logic lingers.
 */

const CARET_MARKER = "";

export type LatexToolbarCommand = "italic" | "subscript" | "superscript";

export type LatexToolbarResult = {
  text: string;
  selectionStart: number;
  selectionEnd: number;
};

/** Commands that must be applied inside math mode; disabled for foreach templates. */
export const MATH_ONLY_COMMANDS: ReadonlySet<LatexToolbarCommand> = new Set<LatexToolbarCommand>([
  "subscript",
  "superscript"
]);

export type LatexSymbol = { tex: string; label: string; title: string };

/** A compact palette of math symbols, each producing compilable math-mode LaTeX. */
export const LATEX_SYMBOLS: readonly LatexSymbol[] = [
  { tex: "\\Omega", label: "Ω", title: "Omega" },
  { tex: "\\alpha", label: "α", title: "alpha" },
  { tex: "\\beta", label: "β", title: "beta" },
  { tex: "\\gamma", label: "γ", title: "gamma" },
  { tex: "\\delta", label: "δ", title: "delta" },
  { tex: "\\mu", label: "μ", title: "mu" },
  { tex: "\\theta", label: "θ", title: "theta" },
  { tex: "\\Delta", label: "Δ", title: "Delta" },
  { tex: "\\infty", label: "∞", title: "infinity" },
  { tex: "\\pm", label: "±", title: "plus-minus" },
  { tex: "\\times", label: "×", title: "times" },
  { tex: "\\leq", label: "≤", title: "less-or-equal" },
  { tex: "\\geq", label: "≥", title: "greater-or-equal" },
  { tex: "\\rightarrow", label: "→", title: "rightarrow" },
  { tex: "\\leftarrow", label: "←", title: "leftarrow" },
  { tex: "\\partial", label: "∂", title: "partial" },
  { tex: "\\nabla", label: "∇", title: "nabla" },
  { tex: "\\sum", label: "∑", title: "sum" },
  { tex: "\\int", label: "∫", title: "integral" },
  { tex: "\\sqrt{}", label: "√", title: "square root" }
];

function countUnescapedDollarsBefore(text: string, index: number): number {
  let count = 0;
  const limit = Math.min(index, text.length);
  for (let i = 0; i < limit; i += 1) {
    if (text[i] === "\\") {
      i += 1;
      continue;
    }
    if (text[i] === "$") {
      count += 1;
    }
  }
  return count;
}

function countUnescapedDollars(text: string): number {
  return countUnescapedDollarsBefore(text, text.length);
}

export function hasUnescapedDollar(text: string): boolean {
  return countUnescapedDollars(text) > 0;
}

export function isInsideMath(text: string, index: number): boolean {
  return countUnescapedDollarsBefore(text, index) % 2 === 1;
}

/** True when the final character is an unescaped `$` (a math run's closer/opener). */
function endsWithUnescapedDollar(text: string): boolean {
  if (text.length === 0 || text[text.length - 1] !== "$") {
    return false;
  }
  let backslashes = 0;
  for (let i = text.length - 2; i >= 0 && text[i] === "\\"; i -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 0;
}

function startsWithUnescapedDollar(text: string): boolean {
  return text.length > 0 && text[0] === "$";
}

/**
 * A raw `$` delimiter next to a freshly-inserted run would fuse into MathJax's
 * display-math delimiter `$$`, which collapses the whole label to literal
 * source. A single space keeps the runs distinct; it is typeset as one space
 * inside the surrounding `\mbox`.
 */
function disjointRunsGuard(needsDelimiter: boolean, adjacentHasDollar: boolean): string {
  return needsDelimiter && adjacentHasDollar ? " " : "";
}

/** Separator so a trailing control word (`\Omega`) cannot gobble a following letter. */
function controlWordSeparator(tex: string, following: string): string {
  return /[a-zA-Z]$/.test(tex) && /^[a-zA-Z]/.test(following) ? " " : "";
}

/** Drop `$` math delimiters (and escaped characters untouched) from a fragment. */
function stripMathDelimiters(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "\\") {
      out += char;
      if (i + 1 < text.length) {
        out += text[i + 1];
        i += 1;
      }
      continue;
    }
    if (char === "$") {
      continue;
    }
    out += char;
  }
  return out;
}

function finalize(marked: string): LatexToolbarResult {
  const markerIndex = marked.indexOf(CARET_MARKER);
  if (markerIndex < 0) {
    return { text: marked, selectionStart: marked.length, selectionEnd: marked.length };
  }
  const text = marked.slice(0, markerIndex) + marked.slice(markerIndex + CARET_MARKER.length);
  return { text, selectionStart: markerIndex, selectionEnd: markerIndex };
}

/**
 * Insert math-only content, entering math mode when the caret/selection is not
 * already inside `$...$`. `buildCore(operand)` returns the LaTeX for the
 * construct; `operand` excludes any `$` delimiters the selection carried.
 *
 * The selection's dollars are *removed* and the surrounding math state is
 * re-derived from the parity of the unescaped `$` before the caret and inside the
 * selection, so a selection that straddles a math boundary still gets closed (or
 * reopened) exactly once. Emitted delimiters are guarded so two runs never fuse
 * into `$$`.
 */
function buildMathScopedInsertion(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  buildCore: (operand: string, hasSelection: boolean) => string
): LatexToolbarResult {
  const before = text.slice(0, selectionStart);
  const selected = text.slice(selectionStart, selectionEnd);
  const after = text.slice(selectionEnd);
  const hasSelection = selected.length > 0;
  const operand = hasSelection ? stripMathDelimiters(selected) : CARET_MARKER;
  const core = buildCore(operand, hasSelection);
  const trailing = hasSelection ? CARET_MARKER : "";
  const stateBefore = isInsideMath(text, selectionStart);
  const stateAfter = stateBefore !== (countUnescapedDollars(selected) % 2 === 1);

  // No math anywhere near the insertion: wrap the whole label in one run.
  if (!stateBefore && !stateAfter && !hasUnescapedDollar(`${before}${operand}${after}`)) {
    return finalize(`$${before}${core}${trailing}${after}$`);
  }

  const prefix = stateBefore ? "" : "$";
  const suffix = stateAfter ? "" : "$";
  const openGuard = disjointRunsGuard(prefix.length > 0, endsWithUnescapedDollar(before));
  const closeGuard = disjointRunsGuard(suffix.length > 0, startsWithUnescapedDollar(after));
  return finalize(`${before}${openGuard}${prefix}${core}${trailing}${suffix}${closeGuard}${after}`);
}

/**
 * Wrap a selection in a command that is valid in both text and math mode
 * (`\textit`). Handles the same boundary cases as `buildMathScopedInsertion`:
 * only the delimiter that the removed selection's dollars actually require is
 * re-added, and never as `$$`.
 */
function buildTextWrapper(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  open: string,
  close: string
): LatexToolbarResult {
  const before = text.slice(0, selectionStart);
  const selected = text.slice(selectionStart, selectionEnd);
  const after = text.slice(selectionEnd);
  const hasSelection = selected.length > 0;
  const operand = hasSelection ? stripMathDelimiters(selected) : CARET_MARKER;
  const trailing = hasSelection ? CARET_MARKER : "";
  const stateBefore = isInsideMath(text, selectionStart);
  const stateAfter = stateBefore !== (countUnescapedDollars(selected) % 2 === 1);
  const prefix = !stateBefore && stateAfter ? "$" : "";
  const suffix = stateBefore && !stateAfter ? "$" : "";
  const openGuard = disjointRunsGuard(prefix.length > 0, endsWithUnescapedDollar(before));
  const closeGuard = disjointRunsGuard(suffix.length > 0, startsWithUnescapedDollar(after));
  return finalize(
    `${before}${openGuard}${prefix}${open}${operand}${close}${trailing}${suffix}${closeGuard}${after}`
  );
}

/** True when the caret/selection sits in (or carries) math content. */
function isMathContext(text: string, selectionStart: number, selectionEnd: number): boolean {
  return (
    isInsideMath(text, selectionStart) ||
    isInsideMath(text, selectionEnd) ||
    countUnescapedDollars(text.slice(selectionStart, selectionEnd)) > 0
  );
}

/**
 * Apply a wrapper that has both a text-mode and a math-mode spelling
 * (`\textit`/`\mathit`). Math content must use the math spelling: `\textit`
 * switches its argument to text mode, where `_` and `^` are illegal.
 */
function buildModeAwareWrapper(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  textOpen: string,
  textClose: string,
  mathOpen: string = textOpen,
  mathClose: string = textClose
): LatexToolbarResult {
  if (isMathContext(text, selectionStart, selectionEnd)) {
    return buildMathScopedInsertion(
      text,
      selectionStart,
      selectionEnd,
      (operand) => `${mathOpen}${operand}${mathClose}`
    );
  }
  return buildTextWrapper(text, selectionStart, selectionEnd, textOpen, textClose);
}

/** Apply a toolbar command to the current label text + selection. */
export function applyLatexToolbarCommand(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  command: LatexToolbarCommand
): LatexToolbarResult {
  switch (command) {
    case "italic":
      return buildModeAwareWrapper(
        text,
        selectionStart,
        selectionEnd,
        "\\textit{",
        "}",
        "\\mathit{",
        "}"
      );
    case "subscript":
      return buildMathScopedInsertion(
        text,
        selectionStart,
        selectionEnd,
        (operand) => `_{${operand}}`
      );
    case "superscript":
      return buildMathScopedInsertion(
        text,
        selectionStart,
        selectionEnd,
        (operand) => `^{${operand}}`
      );
    default:
      return { text, selectionStart, selectionEnd };
  }
}

/** Insert a math symbol, replacing the current selection. */
export function insertLatexSymbol(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  tex: string
): LatexToolbarResult {
  const before = text.slice(0, selectionStart);
  const selected = text.slice(selectionStart, selectionEnd);
  const after = text.slice(selectionEnd);
  const stateBefore = isInsideMath(text, selectionStart);
  const stateAfter = stateBefore !== (countUnescapedDollars(selected) % 2 === 1);

  if (!stateBefore && !stateAfter && !hasUnescapedDollar(`${before}${after}`)) {
    const separator = controlWordSeparator(tex, after);
    return finalize(`$${before}${tex}${separator}${CARET_MARKER}${after}$`);
  }

  const prefix = stateBefore ? "" : "$";
  const suffix = stateAfter ? "" : "$";
  const openGuard = disjointRunsGuard(prefix.length > 0, endsWithUnescapedDollar(before));
  const closeGuard = disjointRunsGuard(suffix.length > 0, startsWithUnescapedDollar(after));
  const separator = controlWordSeparator(tex, suffix.length > 0 ? suffix : after);
  return finalize(
    `${before}${openGuard}${prefix}${tex}${separator}${CARET_MARKER}${suffix}${closeGuard}${after}`
  );
}

export type LatexToolbarDisabled = { disabled: boolean; reason?: string };

export type LatexToolbarContext = {
  isForeachTemplateEdit: boolean;
};

/**
 * Whether a command is meaningful for the current label. Commands that cannot
 * produce compilable LaTeX for the label are reported as disabled so the caller
 * can show a tooltip instead of emitting broken code.
 */
export function resolveLatexToolbarCommandAvailability(
  command: LatexToolbarCommand,
  context: LatexToolbarContext
): LatexToolbarDisabled {
  if (context.isForeachTemplateEdit && MATH_ONLY_COMMANDS.has(command)) {
    return {
      disabled: true,
      reason: "Math formatting is not available while editing a \\foreach template label."
    };
  }
  return { disabled: false };
}

export function resolveSymbolPaletteAvailability(
  context: LatexToolbarContext
): LatexToolbarDisabled {
  if (context.isForeachTemplateEdit) {
    return {
      disabled: true,
      reason: "Symbols are not available while editing a \\foreach template label."
    };
  }
  return { disabled: false };
}
