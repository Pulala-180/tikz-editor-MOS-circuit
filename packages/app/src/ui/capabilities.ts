import {
  capabilityMatrix,
  type CapabilityMatrix,
  type CapabilityRow,
  type FeatureId
} from "tikz-editor/capabilities";
import type { InspectorProperty } from "tikz-editor/edit/inspector";
import type { ToolMode } from "../store/types";

type LayerKey = keyof Pick<CapabilityRow, "parser" | "semantic" | "svg" | "edit">;

type CapabilityCheck = {
  feature: FeatureId;
  layers: readonly LayerKey[];
  label: string;
};

type CapabilityStatus = "supported" | "partial" | "unsupported";

export type CapabilitySummary = {
  status: CapabilityStatus;
  reason: string;
};

const TOOL_CHECKS: Record<ToolMode, readonly CapabilityCheck[]> = {
  addResistor: [],
  addResistor_H_Left: [],
  addResistor_H_Right: [],
  addResistor_V_Top: [],
  addResistor_V_Bottom: [],
  addNMOS: [],
  addNMOS_Left_D: [],
  addNMOS_Left_G: [],
  addNMOS_Left_S: [],
  addNMOS_Right_D: [],
  addNMOS_Right_G: [],
  addNMOS_Right_S: [],
  addPMOS: [],
  addPMOS_Left_D: [],
  addPMOS_Left_G: [],
  addPMOS_Left_S: [],
  addPMOS_Right_D: [],
  addPMOS_Right_G: [],
  addPMOS_Right_S: [],
  addDotNode: [],
  addIoNode: [],
  addIoNode_Vin_Left: [],
  addIoNode_Vin_Right: [],
  addIoNode_Vout_Left: [],
  addIoNode_Vout_Right: [],
  addVDD: [],
  addCapacitor: [],
  addCapacitor_H_Left: [],
  addCapacitor_H_Right: [],
  addCapacitor_V_Top: [],
  addCapacitor_V_Bottom: [],
  addGND: [],
  addGND_H_Left: [],
  addGND_H_Right: [],
  addGND_V_Top: [],
  addGND_V_Bottom: [],
  addCurrentSource: [],
  addCurrentSource_H_Left: [],
  addCurrentSource_H_Right: [],
  addCurrentSource_V_Top: [],
  addCurrentSource_V_Bottom: [],
  addCurrentSource_Up_Top: [],
  addCurrentSource_Up_Bottom: [],
  addCurrentSource_Down_Top: [],
  addCurrentSource_Down_Bottom: [],
  addCurrentSource_Left_Left: [],
  addCurrentSource_Left_Right: [],
  addCurrentSource_Right_Left: [],
  addCurrentSource_Right_Right: [],
  addVoltageSource: [],
  addVoltageSource_H_Left: [],
  addVoltageSource_H_Right: [],
  addVoltageSource_V_Top: [],
  addVoltageSource_V_Bottom: [],
  addCurrentArrow: [],
  addCurrentArrow_H_Left: [],
  addCurrentArrow_H_Right: [],
  addCurrentArrow_V_Top: [],
  addCurrentArrow_V_Bottom: [],
  addCurrentArrow_Up_Top: [],
  addCurrentArrow_Up_Bottom: [],
  addCurrentArrow_Down_Top: [],
  addCurrentArrow_Down_Bottom: [],
  addCurrentArrow_Left_Left: [],
  addCurrentArrow_Left_Right: [],
  addCurrentArrow_Right_Left: [],
  addCurrentArrow_Right_Right: [],
  addWireLead: [],
  addWireLead_H_Left: [],
  addWireLead_H_Right: [],
  addWireLead_V_Top: [],
  addWireLead_V_Bottom: [],
  select: [
    { feature: "path_statement", layers: ["parser", "semantic", "svg", "edit"], label: "selection/move pipeline" }
  ],
  magnify: [],
  addBucket: [
    { feature: "options_structured", layers: ["edit"], label: "fill option editing" }
  ],
  addNode: [
    { feature: "path_statement", layers: ["parser", "semantic", "svg"], label: "node statement pipeline" },
    { feature: "svg_text", layers: ["semantic", "svg"], label: "text node rendering" }
  ],
  addMatrix: [
    { feature: "matrix_node", layers: ["parser", "semantic", "svg", "edit"], label: "matrix of nodes pipeline" }
  ],
  addShape: [
    { feature: "path_statement", layers: ["parser", "semantic", "svg"], label: "node statement pipeline" },
    { feature: "shape_rectangle", layers: ["parser", "semantic", "svg"], label: "rectangle shape rendering" },
    { feature: "shape_circle", layers: ["parser", "semantic", "svg"], label: "circle shape rendering" },
    { feature: "shape_ellipse", layers: ["parser", "semantic", "svg"], label: "ellipse shape rendering" },
    { feature: "shape_diamond", layers: ["parser", "semantic", "svg"], label: "diamond shape rendering" },
    { feature: "shape_trapezium", layers: ["parser", "semantic", "svg"], label: "trapezium shape rendering" },
    { feature: "shape_semicircle", layers: ["parser", "semantic", "svg"], label: "semicircle shape rendering" },
    { feature: "shape_regular_polygon", layers: ["parser", "semantic", "svg"], label: "regular polygon rendering" },
    { feature: "shape_star", layers: ["parser", "semantic", "svg"], label: "star shape rendering" },
    { feature: "shape_isosceles_triangle", layers: ["parser", "semantic", "svg"], label: "triangle shape rendering" },
    { feature: "shape_kite", layers: ["parser", "semantic", "svg"], label: "kite shape rendering" },
    { feature: "shape_dart", layers: ["parser", "semantic", "svg"], label: "dart shape rendering" },
    { feature: "shape_circular_sector", layers: ["parser", "semantic", "svg"], label: "circular sector rendering" },
    { feature: "shape_cylinder", layers: ["parser", "semantic", "svg"], label: "cylinder rendering" },
    { feature: "shape_cloud", layers: ["parser", "semantic", "svg"], label: "cloud rendering" },
    { feature: "shape_starburst", layers: ["parser", "semantic", "svg"], label: "starburst rendering" },
    { feature: "shape_signal", layers: ["parser", "semantic", "svg"], label: "signal rendering" },
    { feature: "shape_tape", layers: ["parser", "semantic", "svg"], label: "tape rendering" },
    { feature: "shape_rectangle_callout", layers: ["parser", "semantic", "svg"], label: "rectangle callout rendering" },
    { feature: "shape_ellipse_callout", layers: ["parser", "semantic", "svg"], label: "ellipse callout rendering" },
    { feature: "shape_cloud_callout", layers: ["parser", "semantic", "svg"], label: "cloud callout rendering" },
    { feature: "shape_single_arrow", layers: ["parser", "semantic", "svg"], label: "single arrow rendering" },
    { feature: "shape_double_arrow", layers: ["parser", "semantic", "svg"], label: "double arrow rendering" }
  ],
  addPath: [
    { feature: "path_operators_basic", layers: ["parser", "semantic", "svg"], label: "polyline path rendering" },
    { feature: "path_operator_curves", layers: ["parser", "semantic", "svg"], label: "Bezier segment rendering" },
    { feature: "keyword_controls", layers: ["parser", "semantic", "svg"], label: "Bezier control-point parsing" },
    { feature: "path_cycle", layers: ["parser", "semantic", "svg"], label: "cycle closure rendering" }
  ],
  addFreehand: [
    { feature: "path_operators_basic", layers: ["parser", "semantic", "svg"], label: "path rendering" },
    { feature: "path_operator_curves", layers: ["parser", "semantic", "svg"], label: "Bezier curve rendering" },
    { feature: "keyword_controls", layers: ["parser", "semantic", "svg"], label: "Bezier control-point parsing" }
  ],
  addLine: [
    { feature: "path_operators_basic", layers: ["parser", "semantic", "svg"], label: "line path rendering" }
  ],
  addArrow: [
    { feature: "path_operators_basic", layers: ["parser", "semantic", "svg"], label: "line path rendering" },
    { feature: "arrow_tips", layers: ["parser", "semantic", "svg"], label: "arrow tip rendering" }
  ],
  addBezier: [
    { feature: "path_operator_curves", layers: ["parser", "semantic", "svg"], label: "Bezier curve path rendering" },
    { feature: "keyword_controls", layers: ["parser", "semantic", "svg"], label: "Bezier control-point parsing" }
  ],
  addGrid: [
    { feature: "keyword_grid", layers: ["parser", "semantic", "svg"], label: "grid keyword rendering" }
  ],
  addRect: [
    { feature: "shape_rectangle", layers: ["parser", "semantic", "svg"], label: "rectangle shape rendering" }
  ],
  addEllipse: [
    { feature: "shape_ellipse", layers: ["parser", "semantic", "svg"], label: "ellipse shape rendering" }
  ],
  addCircle: [
    { feature: "shape_circle", layers: ["parser", "semantic", "svg"], label: "circle shape rendering" }
  ]
};

const INSPECTOR_CHECKS: Record<InspectorProperty["kind"], readonly CapabilityCheck[]> = {
  text: [
    { feature: "options_structured", layers: ["edit"], label: "text option editing" },
    { feature: "svg_text", layers: ["semantic", "svg"], label: "text rendering" }
  ],
  enum: [
    { feature: "options_structured", layers: ["edit"], label: "enum option editing" }
  ],
  boolean: [
    { feature: "options_structured", layers: ["edit"], label: "boolean option editing" }
  ],
  number: [
    { feature: "options_structured", layers: ["edit"], label: "transform option editing" }
  ],
  slider: [
    { feature: "options_structured", layers: ["edit"], label: "slider option editing" }
  ],
  length: [
    { feature: "options_structured", layers: ["edit"], label: "length option editing" }
  ],
  optionalLength: [
    { feature: "options_structured", layers: ["edit"], label: "length option editing" }
  ],
  color: [
    { feature: "options_structured", layers: ["edit"], label: "style option editing" }
  ],
  nodeTextAlign: [
    { feature: "options_structured", layers: ["edit"], label: "text alignment option editing" },
    { feature: "svg_text", layers: ["semantic", "svg"], label: "text rendering" }
  ],
  nodeShape: [
    { feature: "options_structured", layers: ["edit"], label: "node shape option editing" }
  ],
  nodeFont: [
    { feature: "options_structured", layers: ["edit"], label: "node font option editing" },
    { feature: "svg_text", layers: ["semantic", "svg"], label: "text rendering" }
  ],
  lineWidth: [
    { feature: "options_structured", layers: ["edit"], label: "line width editing" }
  ],
  dashStyle: [
    { feature: "options_structured", layers: ["edit"], label: "dash style editing" }
  ],
  lineCap: [
    { feature: "options_structured", layers: ["edit"], label: "line cap editing" }
  ],
  lineJoin: [
    { feature: "options_structured", layers: ["edit"], label: "line join editing" }
  ],
  pathMorphingDecoration: [
    { feature: "options_structured", layers: ["edit"], label: "decoration option editing" },
    { feature: "decoration_pathmorphing", layers: ["semantic", "svg"], label: "path morphing rendering" }
  ],
  fillMode: [
    { feature: "options_structured", layers: ["edit"], label: "fill paint mode editing" },
    { feature: "path_shading", layers: ["semantic", "svg", "edit"], label: "gradient fill rendering/editing" },
    { feature: "path_patterns", layers: ["semantic", "svg", "edit"], label: "pattern fill rendering/editing" }
  ],
  fillShading: [
    { feature: "options_structured", layers: ["edit"], label: "shading option editing" },
    { feature: "path_shading", layers: ["semantic", "svg", "edit"], label: "gradient fill rendering/editing" }
  ],
  fillPattern: [
    { feature: "options_structured", layers: ["edit"], label: "pattern option editing" },
    { feature: "path_patterns", layers: ["semantic", "svg", "edit"], label: "pattern fill rendering/editing" }
  ],
  fillPatternOption: [
    { feature: "options_structured", layers: ["edit"], label: "pattern option editing" },
    { feature: "path_patterns", layers: ["semantic", "svg", "edit"], label: "pattern fill rendering/editing" }
  ],
  roundedCorners: [
    { feature: "options_structured", layers: ["edit"], label: "rounded corners editing" }
  ],
  arrowTip: [
    { feature: "options_structured", layers: ["edit"], label: "arrow option editing" },
    { feature: "arrow_tips", layers: ["semantic", "svg"], label: "arrow tip rendering" }
  ],
  shadowPreset: [
    { feature: "options_structured", layers: ["edit"], label: "shadow option editing" },
    { feature: "path_shadows", layers: ["semantic", "svg"], label: "shadow rendering" }
  ]
};

const NODE_SHAPE_FEATURE_BY_VALUE: Partial<
  Record<Exclude<Extract<InspectorProperty, { kind: "nodeShape" }>["value"], "custom">, FeatureId>
> = {
  rectangle: "shape_rectangle",
  circle: "shape_circle",
  ellipse: "shape_ellipse",
  diamond: "shape_diamond",
  trapezium: "shape_trapezium",
  semicircle: "shape_semicircle",
  "regular polygon": "shape_regular_polygon",
  star: "shape_star",
  "isosceles triangle": "shape_isosceles_triangle",
  kite: "shape_kite",
  dart: "shape_dart",
  "circular sector": "shape_circular_sector",
  cylinder: "shape_cylinder",
  cloud: "shape_cloud",
  starburst: "shape_starburst",
  signal: "shape_signal",
  tape: "shape_tape",
  "rectangle callout": "shape_rectangle_callout",
  "ellipse callout": "shape_ellipse_callout",
  "cloud callout": "shape_cloud_callout",
  "single arrow": "shape_single_arrow",
  "double arrow": "shape_double_arrow"
};

export function getToolCapabilityStatus(
  toolMode: ToolMode,
  matrix: CapabilityMatrix = capabilityMatrix
): CapabilitySummary {
  const checks = TOOL_CHECKS[toolMode];
  if (!checks) {
    return {
      status: "unsupported",
      reason: `No capability checks registered for tool mode ${toolMode}.`
    };
  }
  return evaluateChecks(checks, matrix);
}

export function getInspectorPropertyCapabilityStatus(
  property: InspectorProperty,
  matrix: CapabilityMatrix = capabilityMatrix
): CapabilitySummary {
  const checks = [...INSPECTOR_CHECKS[property.kind]];
  if (property.kind === "nodeShape" && property.value !== "custom") {
    const shapeFeature = NODE_SHAPE_FEATURE_BY_VALUE[property.value];
    if (shapeFeature) {
      checks.push({
        feature: shapeFeature,
        layers: ["parser", "semantic", "svg", "edit"],
        label: `${property.value} node shape support`
      });
    }
  }
  return evaluateChecks(checks, matrix);
}

function evaluateChecks(
  checks: readonly CapabilityCheck[],
  matrix: CapabilityMatrix
): CapabilitySummary {
  const unsupported: string[] = [];
  const partial: string[] = [];

  for (const check of checks) {
    const row = matrix[check.feature];
    let status: CapabilityStatus = "supported";

    for (const layer of check.layers) {
      const layerStatus = row?.[layer];
      if (layerStatus === "none" || layerStatus == null) {
        status = "unsupported";
        break;
      }
      if (layerStatus === "partial") {
        status = "partial";
      }
    }

    if (status === "unsupported") {
      unsupported.push(check.label);
      continue;
    }
    if (status === "partial") {
      partial.push(check.label);
    }
  }

  if (unsupported.length > 0) {
    return {
      status: "unsupported",
      reason: `Unavailable in capability matrix: ${unsupported.join(", ")}.`
    };
  }

  if (partial.length > 0) {
    return {
      status: "partial",
      reason: `Partially supported: ${partial.join(", ")}.`
    };
  }

  return { status: "supported", reason: "Supported by current capability matrix." };
}
