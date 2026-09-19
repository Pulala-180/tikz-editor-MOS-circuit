/**
 * Power rail (VDD rail) geometry.
 *
 * A power rail is the thick horizontal/vertical bar that feeds a circuit: a heavy
 * "bus" with a row of hollow-circle taps on it, one per branch that leaves the rail.
 * Reference tooling draws it in two clicks (first end, second end) and then grows the
 * taps automatically; `buildPowerRailSnippetBetween` is exactly that two-point entry
 * point, and `buildPowerRailSnippet` is the single-shape builder both the two-point
 * flow and the single-click tool modes funnel through.
 *
 * Pin naming follows the repo convention for two-terminal parts: `l`/`r` for a
 * horizontal rail, `t`/`b` for a vertical one, plus `tap1..tapN` for the branch taps.
 * The instance placeholder is `node_RAILx`, so `assignUniqueCircuitInstanceIndex`
 * renumbers rails to `node_RAIL1`, `node_RAIL2`, ... like every other component.
 */

export type PowerRailOrientation = "horizontal" | "vertical";

export type PowerRailOptions = {
  /** Rail axis. Defaults to horizontal. */
  orientation?: PowerRailOrientation;
  /**
   * Explicit tap count. When omitted (`null`/`undefined`) the count is derived from the
   * rail length so a longer rail grows more taps — the "抽头数随长度可调" behaviour.
   */
  taps?: number | null;
  /** Pin family placeholder. Defaults to `RAIL` (`node_RAILx`). */
  placeholderId?: string;
  /** Label drawn beside the rail. Defaults to `$V_{DD}$`. */
  label?: string;
};

/** Default rail length for the single-click tool modes (cm). */
export const POWER_RAIL_DEFAULT_LENGTH_CM = 2.4;
/** Preferred distance between neighbouring taps (cm). */
export const POWER_RAIL_TAP_SPACING_CM = 0.8;
export const POWER_RAIL_MIN_TAPS = 1;
export const POWER_RAIL_MAX_TAPS = 8;
/** Heavy stroke that reads as a "bus" rather than a signal wire. */
export const POWER_RAIL_BAR_WIDTH = "0.9mm";
/** Hollow-circle tap radius (cm). */
export const POWER_RAIL_TAP_RADIUS_CM = 0.07;

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Number(value.toFixed(3));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** Tap count for a rail of the given length: one per `spacingCm`, clamped to sane bounds. */
export function derivePowerRailTapCount(
  lengthCm: number,
  spacingCm: number = POWER_RAIL_TAP_SPACING_CM
): number {
  const safeLength = Number.isFinite(lengthCm) ? Math.abs(lengthCm) : 0;
  const safeSpacing = spacingCm > 0 ? spacingCm : POWER_RAIL_TAP_SPACING_CM;
  const raw = Math.round(safeLength / safeSpacing);
  return Math.min(POWER_RAIL_MAX_TAPS, Math.max(POWER_RAIL_MIN_TAPS, raw));
}

/**
 * Build the TikZ for a rail whose first end sits at `(originXCm, originYCm)` and which
 * runs `lengthCm` towards +x (horizontal) or -y (vertical), which is the direction the
 * other vertical components in this repo use for "down".
 */
export function buildPowerRailSnippet(
  originXCm: number,
  originYCm: number,
  lengthCm: number,
  options: PowerRailOptions = {}
): string {
  const orientation = options.orientation ?? "horizontal";
  const placeholderId = options.placeholderId ?? "RAIL";
  const label = options.label ?? "$V_{DD}$";
  const length = Number.isFinite(lengthCm) && Math.abs(lengthCm) > 1e-6
    ? Math.abs(lengthCm)
    : POWER_RAIL_DEFAULT_LENGTH_CM;
  const tapCount = options.taps == null
    ? derivePowerRailTapCount(length)
    : Math.min(POWER_RAIL_MAX_TAPS, Math.max(POWER_RAIL_MIN_TAPS, Math.floor(options.taps)));
  const pad = "    ";

  const lines: string[] = [];
  lines.push(`\\begin{scope}[shift={(${fmt(originXCm)},${fmt(originYCm)})}]`);

  const endCoord = orientation === "horizontal" ? `(${fmt(length)},0)` : `(0,${fmt(-length)})`;
  const firstAnchor = orientation === "horizontal" ? "l" : "t";
  const secondAnchor = orientation === "horizontal" ? "r" : "b";
  lines.push(`${pad}\\coordinate (node_${placeholderId}x.${firstAnchor}) at (0,0);`);
  lines.push(`${pad}\\draw[line width=${POWER_RAIL_BAR_WIDTH}, line cap=butt] (0,0) -- ${endCoord};`);

  for (let index = 1; index <= tapCount; index += 1) {
    const along = fmt(length * (index / (tapCount + 1)));
    const tapCoord = orientation === "horizontal" ? `(${along},0)` : `(0,${fmt(-Number(along))})`;
    lines.push(`${pad}\\coordinate (node_${placeholderId}x.tap${index}) at ${tapCoord};`);
    lines.push(
      `${pad}\\draw[line width=0.3mm, fill=white] ${tapCoord} circle (${POWER_RAIL_TAP_RADIUS_CM});`
    );
  }

  lines.push(`${pad}\\coordinate (node_${placeholderId}x.${secondAnchor}) at ${endCoord};`);
  lines.push(
    orientation === "horizontal"
      ? `${pad}\\node at (${fmt(length / 2)},0.3) {${label}};`
      : `${pad}\\node[right] at (0.25,${fmt(-length / 2)}) {${label}};`
  );
  lines.push("  \\end{scope}");
  return lines.join("\n");
}

/**
 * Two-point entry point: the shape the "click the second end" interaction needs.
 * Normalises the pair into an origin + length and delegates to the single builder, so
 * the taps are laid out identically no matter which end the user clicked first.
 */
export function buildPowerRailSnippetBetween(
  from: { xCm: number; yCm: number },
  to: { xCm: number; yCm: number },
  options: PowerRailOptions = {}
): string {
  const orientation =
    options.orientation ??
    (Math.abs(to.xCm - from.xCm) >= Math.abs(to.yCm - from.yCm) ? "horizontal" : "vertical");

  if (orientation === "horizontal") {
    return buildPowerRailSnippet(
      Math.min(from.xCm, to.xCm),
      from.yCm,
      Math.abs(to.xCm - from.xCm),
      { ...options, orientation }
    );
  }
  return buildPowerRailSnippet(
    from.xCm,
    Math.max(from.yCm, to.yCm),
    Math.abs(to.yCm - from.yCm),
    { ...options, orientation }
  );
}
