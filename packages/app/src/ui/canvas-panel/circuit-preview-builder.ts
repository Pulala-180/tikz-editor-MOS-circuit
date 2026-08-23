import { PT_PER_CM } from "tikz-editor/edit/format";
import { pt, worldPoint } from "tikz-editor/coords/index";
import type { WorldPoint } from "../coords/types";
import { worldToSvgPoint } from "./geometry";
import type { SvgViewBox } from "tikz-editor/svg/types";
import type { ToolMode } from "../../store/types";

function wp(x: number, y: number): WorldPoint {
  return worldPoint(pt(x), pt(y));
}

export type CircuitPreviewPath = {
  d: string;
  strokeWidth?: number;
  strokeLinecap?: "round" | "butt" | "square";
  fill?: string;
};

export type CircuitPreviewText = {
  x: number;
  y: number;
  main: string;
  sub?: string;
  fontSize?: number;
  anchor?: "start" | "middle" | "end";
  italic?: boolean;
};

export type CircuitPreviewData = {
  paths: CircuitPreviewPath[];
  texts?: CircuitPreviewText[];
};

export function buildCircuitPreview(
  toolMode: ToolMode,
  liveWorld: WorldPoint,
  viewBox: SvgViewBox
): CircuitPreviewData | null {
  const p = (xCm: number, yCm: number) =>
    worldToSvgPoint(wp(liveWorld.x + xCm * PT_PER_CM, liveWorld.y + yCm * PT_PER_CM), viewBox);

  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    ultraThick = false,
    linecap: "round" | "butt" = "butt"
  ): CircuitPreviewPath => {
    const p1 = p(x1, y1);
    const p2 = p(x2, y2);
    return {
      d: `M ${p1.x.toFixed(2)},${p1.y.toFixed(2)} L ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`,
      strokeWidth: ultraThick ? 1.6 : 0.8,
      strokeLinecap: linecap
    };
  };

  const polyline = (pts: [number, number][], ultraThick = false): CircuitPreviewPath => {
    const svgPts = pts.map(([x, y]) => p(x, y));
    const d = svgPts.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join(" ");
    return {
      d,
      strokeWidth: ultraThick ? 1.6 : 0.8,
      strokeLinecap: "butt"
    };
  };

  const circle = (cx: number, cy: number, rCm: number, fill = "none"): CircuitPreviewPath => {
    const center = p(cx, cy);
    const edge = p(cx + rCm, cy);
    const rSvg = Math.abs(edge.x - center.x);
    return {
      d: `M ${center.x.toFixed(2)},${(center.y - rSvg).toFixed(2)} a ${rSvg.toFixed(2)},${rSvg.toFixed(2)} 0 1,0 0.001,0 Z`,
      strokeWidth: 0.8,
      fill
    };
  };

  // 严格依据 TikZ Triangle[length=1.6mm, width=1.1mm] 尺寸构建实心三角箭头
  const arrowTriangle = (
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    lengthMm = 1.6,
    widthMm = 1.1
  ): CircuitPreviewPath => {
    const p1 = p(fromX, fromY);
    const p2 = p(toX, toY);
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const len = lengthMm * 0.1 * PT_PER_CM;
    const halfWidth = (widthMm / 2) * 0.1 * PT_PER_CM;
    const baseX = p2.x - len * Math.cos(angle);
    const baseY = p2.y - len * Math.sin(angle);
    const wing1X = baseX + halfWidth * Math.sin(angle);
    const wing1Y = baseY - halfWidth * Math.cos(angle);
    const wing2X = baseX - halfWidth * Math.sin(angle);
    const wing2Y = baseY + halfWidth * Math.cos(angle);
    return {
      d: `M ${p2.x.toFixed(2)},${p2.y.toFixed(2)} L ${wing1X.toFixed(2)},${wing1Y.toFixed(2)} L ${wing2X.toFixed(2)},${wing2Y.toFixed(2)} Z`,
      fill: "currentColor"
    };
  };

  // 1. 连接线 (Wire Lead)
  if (toolMode.startsWith("addWireLead")) {
    let dx = 0;
    let dy = 0;
    if (toolMode === "addWireLead" || toolMode === "addWireLead_V_Top") dy = 0.3;
    else if (toolMode === "addWireLead_V_Bottom") dy = -0.3;
    else if (toolMode === "addWireLead_H_Left") dx = -0.3;
    else if (toolMode === "addWireLead_H_Right") dx = 0.3;
    return { paths: [line(0, 0, dx, dy)] };
  }

  // 2. 实心支路节点 (Dot Node)
  if (toolMode === "addDotNode") {
    return { paths: [circle(0, 0, 0.06, "currentColor")] };
  }

  // 3. nMOS 管 (nMOS Transistor)
  if (toolMode.startsWith("addNMOS")) {
    if (toolMode === "addNMOS" || toolMode === "addNMOS_Left_G") {
      return {
        paths: [
          line(0, 0, 0.26, 0),
          line(0.25, -0.25, 0.25, 0.25, true),
          line(0.41, -0.3, 0.41, 0.3, true),
          polyline([[0.4, 0.2], [0.73, 0.2], [0.73, 0.5]]),
          line(0.4, -0.2, 0.7, -0.2),
          arrowTriangle(0.4, -0.2, 0.7, -0.2),
          line(0.73, -0.21, 0.73, -0.5)
        ],
        texts: [{ ...p(1.04, 0), main: "M", sub: "1" }]
      };
    }
    if (toolMode === "addNMOS_Left_D") {
      return {
        paths: [
          line(-0.73, -0.5, -0.47, -0.5),
          line(-0.48, -0.75, -0.48, -0.25, true),
          line(-0.32, -0.8, -0.32, -0.2, true),
          polyline([[-0.33, -0.3], [0, -0.3], [0, 0]]),
          line(-0.33, -0.7, -0.03, -0.7),
          arrowTriangle(-0.33, -0.7, -0.03, -0.7),
          line(0, -0.71, 0, -1.0)
        ],
        texts: [{ ...p(0.31, -0.5), main: "M", sub: "1" }]
      };
    }
    if (toolMode === "addNMOS_Left_S") {
      return {
        paths: [
          line(-0.73, 0.5, -0.47, 0.5),
          line(-0.48, 0.25, -0.48, 0.75, true),
          line(-0.32, 0.2, -0.32, 0.8, true),
          polyline([[-0.33, 0.7], [0, 0.7], [0, 1.0]]),
          line(-0.33, 0.3, -0.03, 0.3),
          arrowTriangle(-0.33, 0.3, -0.03, 0.3),
          line(0, 0.29, 0, 0)
        ],
        texts: [{ ...p(0.31, 0.5), main: "M", sub: "1" }]
      };
    }
    if (toolMode === "addNMOS_Right_G") {
      return {
        paths: [
          line(0, 0, -0.26, 0),
          line(-0.25, -0.25, -0.25, 0.25, true),
          line(-0.41, -0.3, -0.41, 0.3, true),
          polyline([[-0.4, 0.2], [-0.73, 0.2], [-0.73, 0.5]]),
          line(-0.4, -0.2, -0.7, -0.2),
          arrowTriangle(-0.4, -0.2, -0.7, -0.2),
          line(-0.73, -0.21, -0.73, -0.5)
        ],
        texts: [{ ...p(-1.04, 0), main: "M", sub: "1" }]
      };
    }
    if (toolMode === "addNMOS_Right_D") {
      return {
        paths: [
          line(0.73, -0.5, 0.47, -0.5),
          line(0.48, -0.75, 0.48, -0.25, true),
          line(0.32, -0.8, 0.32, -0.2, true),
          polyline([[0.33, -0.3], [0, -0.3], [0, 0]]),
          line(0.33, -0.7, 0.03, -0.7),
          arrowTriangle(0.33, -0.7, 0.03, -0.7),
          line(0, -0.71, 0, -1.0)
        ],
        texts: [{ ...p(-0.31, -0.5), main: "M", sub: "1" }]
      };
    }
    if (toolMode === "addNMOS_Right_S") {
      return {
        paths: [
          line(0.73, 0.5, 0.47, 0.5),
          line(0.48, 0.25, 0.48, 0.75, true),
          line(0.32, 0.2, 0.32, 0.8, true),
          polyline([[0.33, 0.7], [0, 0.7], [0, 1.0]]),
          line(0.33, 0.3, 0.03, 0.3),
          arrowTriangle(0.33, 0.3, 0.03, 0.3),
          line(0, 0.29, 0, 0)
        ],
        texts: [{ ...p(-0.31, 0.5), main: "M", sub: "1" }]
      };
    }
  }

  // 4. pMOS 管 (pMOS Transistor)
  if (toolMode.startsWith("addPMOS")) {
    if (toolMode === "addPMOS" || toolMode === "addPMOS_Left_G") {
      return {
        paths: [
          line(0, 0, 0.26, 0),
          line(0.25, -0.25, 0.25, 0.25, true),
          line(0.41, -0.3, 0.41, 0.3, true),
          polyline([[0.4, -0.2], [0.73, -0.2], [0.73, -0.5]]),
          line(0.73, 0.2, 0.43, 0.2),
          arrowTriangle(0.73, 0.2, 0.43, 0.2),
          line(0.73, 0.5, 0.73, 0.2)
        ],
        texts: [{ ...p(1.04, 0), main: "M", sub: "1" }]
      };
    }
    if (toolMode === "addPMOS_Left_D") {
      return {
        paths: [
          line(-0.73, 0.5, -0.47, 0.5),
          line(-0.48, 0.25, -0.48, 0.75, true),
          line(-0.32, 0.2, -0.32, 0.8, true),
          polyline([[-0.33, 0.3], [0, 0.3], [0, 0]]),
          line(0, 0.7, -0.3, 0.7),
          arrowTriangle(0, 0.7, -0.3, 0.7),
          line(0, 1.0, 0, 0.7)
        ],
        texts: [{ ...p(0.31, 0.5), main: "M", sub: "1" }]
      };
    }
    if (toolMode === "addPMOS_Left_S") {
      return {
        paths: [
          line(-0.73, -0.5, -0.47, -0.5),
          line(-0.48, -0.75, -0.48, -0.25, true),
          line(-0.32, -0.8, -0.32, -0.2, true),
          polyline([[-0.33, -0.7], [0, -0.7], [0, -1.0]]),
          line(0, -0.3, -0.3, -0.3),
          arrowTriangle(0, -0.3, -0.3, -0.3),
          line(0, 0, 0, -0.3)
        ],
        texts: [{ ...p(0.31, -0.5), main: "M", sub: "1" }]
      };
    }
    if (toolMode === "addPMOS_Right_G") {
      return {
        paths: [
          line(0, 0, -0.26, 0),
          line(-0.25, -0.25, -0.25, 0.25, true),
          line(-0.41, -0.3, -0.41, 0.3, true),
          polyline([[-0.4, -0.2], [-0.73, -0.2], [-0.73, -0.5]]),
          line(-0.73, 0.2, -0.43, 0.2),
          arrowTriangle(-0.73, 0.2, -0.43, 0.2),
          line(-0.73, 0.5, -0.73, 0.2)
        ],
        texts: [{ ...p(-1.04, 0), main: "M", sub: "1" }]
      };
    }
    if (toolMode === "addPMOS_Right_D") {
      return {
        paths: [
          line(0.73, 0.5, 0.47, 0.5),
          line(0.48, 0.25, 0.48, 0.75, true),
          line(0.32, 0.2, 0.32, 0.8, true),
          polyline([[0.33, 0.3], [0, 0.3], [0, 0]]),
          line(0, 0.7, 0.3, 0.7),
          arrowTriangle(0, 0.7, 0.3, 0.7),
          line(0, 1.0, 0, 0.7)
        ],
        texts: [{ ...p(-0.31, 0.5), main: "M", sub: "1" }]
      };
    }
    if (toolMode === "addPMOS_Right_S") {
      return {
        paths: [
          line(0.73, -0.5, 0.47, -0.5),
          line(0.48, -0.75, 0.48, -0.25, true),
          line(0.32, -0.8, 0.32, -0.2, true),
          polyline([[0.33, -0.7], [0, -0.7], [0, -1.0]]),
          line(0, -0.3, 0.3, -0.3),
          arrowTriangle(0, -0.3, 0.3, -0.3),
          line(0, 0, 0, -0.3)
        ],
        texts: [{ ...p(-0.31, -0.5), main: "M", sub: "1" }]
      };
    }
  }

  // 5. 电阻 (Resistor)
  if (toolMode.startsWith("addResistor")) {
    if (toolMode === "addResistor" || toolMode === "addResistor_H_Left") {
      return {
        paths: [polyline([[0, 0], [0.15, 0], [0.19, 0.15], [0.27, -0.15], [0.35, 0.15], [0.43, -0.15], [0.51, 0.15], [0.59, -0.15], [0.63, 0], [0.78, 0]])],
        texts: [{ ...p(0.39, 0.35), main: "R", sub: "D" }]
      };
    }
    if (toolMode === "addResistor_H_Right") {
      return {
        paths: [polyline([[-0.78, 0], [-0.63, 0], [-0.59, 0.15], [-0.51, -0.15], [-0.43, 0.15], [-0.35, -0.15], [-0.27, 0.15], [-0.19, -0.15], [-0.15, 0], [0, 0]])],
        texts: [{ ...p(-0.39, 0.35), main: "R", sub: "D" }]
      };
    }
    if (toolMode === "addResistor_V_Top") {
      return {
        paths: [polyline([[0, 0], [0, -0.15], [0.15, -0.19], [-0.15, -0.27], [0.15, -0.35], [-0.15, -0.43], [0.15, -0.51], [-0.15, -0.59], [0, -0.63], [0, -0.78]])],
        texts: [{ ...p(0.35, -0.39), main: "R", sub: "D", anchor: "start" }]
      };
    }
    if (toolMode === "addResistor_V_Bottom") {
      return {
        paths: [polyline([[0, 0], [0, 0.15], [0.15, 0.19], [-0.15, 0.27], [0.15, 0.35], [-0.15, 0.43], [0.15, 0.51], [-0.15, 0.59], [0, 0.63], [0, 0.78]])],
        texts: [{ ...p(0.35, 0.39), main: "R", sub: "D", anchor: "start" }]
      };
    }
  }

  // 6. 电容 (Capacitor)
  if (toolMode.startsWith("addCapacitor")) {
    if (toolMode === "addCapacitor" || toolMode === "addCapacitor_H_Left") {
      return {
        paths: [
          line(0, 0, 0.2, 0),
          line(0.2, -0.25, 0.2, 0.25, true),
          line(0.36, -0.25, 0.36, 0.25, true),
          line(0.36, 0, 0.56, 0)
        ],
        texts: [{ ...p(0.28, 0.52), main: "C", sub: "gd" }]
      };
    }
    if (toolMode === "addCapacitor_H_Right") {
      return {
        paths: [
          line(-0.56, 0, -0.36, 0),
          line(-0.36, -0.25, -0.36, 0.25, true),
          line(-0.2, -0.25, -0.2, 0.25, true),
          line(-0.2, 0, 0, 0)
        ],
        texts: [{ ...p(-0.28, 0.52), main: "C", sub: "gd" }]
      };
    }
    if (toolMode === "addCapacitor_V_Top") {
      return {
        paths: [
          line(0, 0, 0, -0.2),
          line(-0.25, -0.2, 0.25, -0.2, true),
          line(-0.25, -0.36, 0.25, -0.36, true),
          line(0, -0.36, 0, -0.56)
        ],
        texts: [{ ...p(0.52, -0.28), main: "C", sub: "gd", anchor: "start" }]
      };
    }
    if (toolMode === "addCapacitor_V_Bottom") {
      return {
        paths: [
          line(0, 0, 0, 0.2),
          line(-0.25, 0.2, 0.25, 0.2, true),
          line(-0.25, 0.36, 0.25, 0.36, true),
          line(0, 0.36, 0, 0.56)
        ],
        texts: [{ ...p(0.52, 0.28), main: "C", sub: "gd", anchor: "start" }]
      };
    }
  }

  // 7. 电压源 (Voltage Source)
  if (toolMode.startsWith("addVoltageSource")) {
    if (toolMode === "addVoltageSource" || toolMode === "addVoltageSource_Up_Top" || toolMode === "addVoltageSource_V_Top") {
      return {
        paths: [
          line(0, 0, 0, -0.15),
          circle(0, -0.4, 0.25),
          line(0, -0.65, 0, -0.8),
          // top plus sign
          line(0, -0.28, 0, -0.20),
          line(-0.04, -0.24, 0.04, -0.24),
          // bottom minus sign
          line(-0.04, -0.56, 0.04, -0.56)
        ],
        texts: [{ ...p(-0.45, -0.4), main: "v" }]
      };
    }
    if (toolMode === "addVoltageSource_Down_Top") {
      return {
        paths: [
          line(0, 0, 0, -0.15),
          circle(0, -0.4, 0.25),
          line(0, -0.65, 0, -0.8),
          // top minus sign
          line(-0.04, -0.24, 0.04, -0.24),
          // bottom plus sign
          line(0, -0.60, 0, -0.52),
          line(-0.04, -0.56, 0.04, -0.56)
        ],
        texts: [{ ...p(-0.45, -0.4), main: "v" }]
      };
    }
    if (toolMode === "addVoltageSource_Up_Bottom" || toolMode === "addVoltageSource_V_Bottom") {
      return {
        paths: [
          line(0, 0.8, 0, 0.65),
          circle(0, 0.4, 0.25),
          line(0, 0.15, 0, 0),
          // top plus sign
          line(0, 0.56, 0, 0.48),
          line(-0.04, 0.52, 0.04, 0.52),
          // bottom minus sign
          line(-0.04, 0.28, 0.04, 0.28)
        ],
        texts: [{ ...p(-0.45, 0.4), main: "v" }]
      };
    }
    if (toolMode === "addVoltageSource_Down_Bottom") {
      return {
        paths: [
          line(0, 0.8, 0, 0.65),
          circle(0, 0.4, 0.25),
          line(0, 0.15, 0, 0),
          // top minus sign
          line(-0.04, 0.52, 0.04, 0.52),
          // bottom plus sign
          line(0, 0.24, 0, 0.32),
          line(-0.04, 0.28, 0.04, 0.28)
        ],
        texts: [{ ...p(-0.45, 0.4), main: "v" }]
      };
    }
    if (toolMode === "addVoltageSource_Right_Left" || toolMode === "addVoltageSource_H_Left") {
      return {
        paths: [
          line(0, 0, 0.15, 0),
          circle(0.4, 0, 0.25),
          line(0.65, 0, 0.8, 0),
          // right plus sign
          line(0.65, -0.4, 0.65, -0.23),
          line(0.57, -0.31, 0.72, -0.31),
          // left minus sign
          line(0.1, -0.31, 0.24, -0.31)
        ],
        texts: [{ ...p(0.4, 0.35), main: "v" }]
      };
    }
    if (toolMode === "addVoltageSource_Left_Left") {
      return {
        paths: [
          line(0, 0, 0.15, 0),
          circle(0.4, 0, 0.25),
          line(0.65, 0, 0.8, 0),
          // left plus sign
          line(0.17, -0.4, 0.17, -0.23),
          line(0.10, -0.31, 0.24, -0.31),
          // right minus sign
          line(0.57, -0.31, 0.72, -0.31)
        ],
        texts: [{ ...p(0.4, 0.35), main: "v" }]
      };
    }
    if (toolMode === "addVoltageSource_Right_Right" || toolMode === "addVoltageSource_H_Right") {
      return {
        paths: [
          line(-0.8, 0, -0.65, 0),
          circle(-0.4, 0, 0.25),
          line(-0.15, 0, 0, 0),
          // right plus sign
          line(-0.15, -0.4, -0.15, -0.23),
          line(-0.23, -0.31, -0.08, -0.31),
          // left minus sign
          line(-0.7, -0.31, -0.56, -0.31)
        ],
        texts: [{ ...p(-0.4, 0.35), main: "v" }]
      };
    }
    if (toolMode === "addVoltageSource_Left_Right") {
      return {
        paths: [
          line(-0.8, 0, -0.65, 0),
          circle(-0.4, 0, 0.25),
          line(-0.15, 0, 0, 0),
          // left plus sign
          line(-0.63, -0.4, -0.63, -0.23),
          line(-0.70, -0.31, -0.56, -0.31),
          // right minus sign
          line(-0.23, -0.31, -0.08, -0.31)
        ],
        texts: [{ ...p(-0.4, 0.35), main: "v" }]
      };
    }
  }

  // 8. 电流源 (Current Source)
  if (toolMode.startsWith("addCurrentSource")) {
    if (toolMode === "addCurrentSource" || toolMode === "addCurrentSource_Down_Bottom" || toolMode === "addCurrentSource_V_Bottom") {
      return {
        paths: [
          line(0, 0.8, 0, 0.65),
          circle(0, 0.4, 0.25),
          line(0, 0.55, 0, 0.25),
          arrowTriangle(0, 0.55, 0, 0.25, 1.8, 1.7),
          line(0, 0.15, 0, 0)
        ],
        texts: [{ ...p(0.45, 0.4), main: "i" }]
      };
    }
    if (toolMode === "addCurrentSource_Down_Top" || toolMode === "addCurrentSource_V_Top") {
      return {
        paths: [
          line(0, 0, 0, -0.15),
          circle(0, -0.4, 0.25),
          line(0, -0.25, 0, -0.55),
          arrowTriangle(0, -0.25, 0, -0.55, 1.8, 1.7),
          line(0, -0.65, 0, -0.8)
        ],
        texts: [{ ...p(0.45, -0.4), main: "i" }]
      };
    }
    if (toolMode === "addCurrentSource_Up_Top") {
      return {
        paths: [
          line(0, 0, 0, -0.15),
          circle(0, -0.4, 0.25),
          line(0, -0.55, 0, -0.25),
          arrowTriangle(0, -0.55, 0, -0.25, 1.8, 1.7),
          line(0, -0.65, 0, -0.8)
        ],
        texts: [{ ...p(0.45, -0.4), main: "i" }]
      };
    }
    if (toolMode === "addCurrentSource_Up_Bottom") {
      return {
        paths: [
          line(0, 0.8, 0, 0.65),
          circle(0, 0.4, 0.25),
          line(0, 0.25, 0, 0.55),
          arrowTriangle(0, 0.25, 0, 0.55, 1.8, 1.7),
          line(0, 0.15, 0, 0)
        ],
        texts: [{ ...p(0.45, 0.4), main: "i" }]
      };
    }
    if (toolMode === "addCurrentSource_Right_Left" || toolMode === "addCurrentSource_H_Left") {
      return {
        paths: [
          line(0, 0, 0.15, 0),
          circle(0.4, 0, 0.25),
          line(0.25, 0, 0.55, 0),
          arrowTriangle(0.25, 0, 0.55, 0, 1.8, 1.7),
          line(0.65, 0, 0.8, 0)
        ],
        texts: [{ ...p(0.4, 0.45), main: "i" }]
      };
    }
    if (toolMode === "addCurrentSource_Left_Left") {
      return {
        paths: [
          line(0, 0, 0.15, 0),
          circle(0.4, 0, 0.25),
          line(0.55, 0, 0.25, 0),
          arrowTriangle(0.55, 0, 0.25, 0, 1.8, 1.7),
          line(0.65, 0, 0.8, 0)
        ],
        texts: [{ ...p(0.4, 0.45), main: "i" }]
      };
    }
    if (toolMode === "addCurrentSource_Right_Right" || toolMode === "addCurrentSource_H_Right") {
      return {
        paths: [
          line(-0.8, 0, -0.65, 0),
          circle(-0.4, 0, 0.25),
          line(-0.55, 0, -0.25, 0),
          arrowTriangle(-0.55, 0, -0.25, 0, 1.8, 1.7),
          line(-0.15, 0, 0, 0)
        ],
        texts: [{ ...p(-0.4, 0.45), main: "i" }]
      };
    }
    if (toolMode === "addCurrentSource_Left_Right") {
      return {
        paths: [
          line(-0.8, 0, -0.65, 0),
          circle(-0.4, 0, 0.25),
          line(-0.25, 0, -0.55, 0),
          arrowTriangle(-0.25, 0, -0.55, 0, 1.8, 1.7),
          line(-0.15, 0, 0, 0)
        ],
        texts: [{ ...p(-0.4, 0.45), main: "i" }]
      };
    }
  }

  // 9. 电流箭头 (Current Arrow)
  if (toolMode.startsWith("addCurrentArrow")) {
    if (toolMode === "addCurrentArrow" || toolMode === "addCurrentArrow_Down_Bottom" || toolMode === "addCurrentArrow_V_Bottom") {
      return {
        paths: [
          line(0, 0.4, 0, 0.1),
          arrowTriangle(0, 0.4, 0, 0.1, 1.8, 1.7),
          line(0, 0.1, 0, 0)
        ],
        texts: [{ ...p(-0.2, 0.2), main: "i" }]
      };
    }
    if (toolMode === "addCurrentArrow_Up_Top") {
      return {
        paths: [
          line(0, 0, 0, -0.1),
          line(0, -0.4, 0, -0.1),
          arrowTriangle(0, -0.4, 0, -0.1, 1.8, 1.7)
        ],
        texts: [{ ...p(-0.2, -0.2), main: "i" }]
      };
    }
    if (toolMode === "addCurrentArrow_Right_Left" || toolMode === "addCurrentArrow_H_Left") {
      return {
        paths: [
          line(0, 0, 0.3, 0),
          arrowTriangle(0, 0, 0.3, 0, 1.8, 1.7),
          line(0.3, 0, 0.4, 0)
        ],
        texts: [{ ...p(0.15, 0.2), main: "i" }]
      };
    }
    if (toolMode === "addCurrentArrow_Right_Right" || toolMode === "addCurrentArrow_H_Right") {
      return {
        paths: [
          line(-0.4, 0, -0.1, 0),
          arrowTriangle(-0.4, 0, -0.1, 0, 1.8, 1.7),
          line(-0.1, 0, 0, 0)
        ],
        texts: [{ ...p(-0.25, 0.2), main: "i" }]
      };
    }
  }

  // 10. VDD 电源轨
  if (toolMode === "addVDD") {
    return {
      paths: [
        line(0, 0, 0, 0.22),
        line(-0.95, 0.22, 0.9, 0.22, true)
      ],
      texts: [{ ...p(1.2, 0.22), main: "V", sub: "DD" }]
    };
  }

  // 11. GND 接地端
  if (toolMode.startsWith("addGND")) {
    if (toolMode === "addGND" || toolMode === "addGND_V_Top") {
      return {
        paths: [
          line(0, 0, 0, -0.21),
          line(-0.17, -0.21, 0.17, -0.21, true),
          line(-0.11, -0.35, 0.11, -0.35, true),
          line(-0.08, -0.49, 0.08, -0.49, true)
        ]
      };
    }
    if (toolMode === "addGND_V_Bottom") {
      return {
        paths: [
          line(0, 0, 0, 0.21),
          line(-0.17, 0.21, 0.17, 0.21, true),
          line(-0.11, 0.35, 0.11, 0.35, true),
          line(-0.08, 0.49, 0.08, 0.49, true)
        ]
      };
    }
    if (toolMode === "addGND_H_Left") {
      return {
        paths: [
          line(0, 0, 0.21, 0),
          line(0.21, -0.17, 0.21, 0.17, true),
          line(0.35, -0.11, 0.35, 0.11, true),
          line(0.49, -0.08, 0.49, 0.08, true)
        ]
      };
    }
    if (toolMode === "addGND_H_Right") {
      return {
        paths: [
          line(0, 0, -0.21, 0),
          line(-0.21, -0.17, -0.21, 0.17, true),
          line(-0.35, -0.11, -0.35, 0.11, true),
          line(-0.49, -0.08, -0.49, 0.08, true)
        ]
      };
    }
  }

  // 12. IO 端口 (IO Node)
  if (toolMode.startsWith("addIoNode")) {
    if (toolMode === "addIoNode" || toolMode === "addIoNode_Vin_Left") {
      return {
        paths: [
          circle(-0.45, 0, 0.05, "white"),
          line(-0.45, 0, 0, 0)
        ],
        texts: [{ ...p(-0.61, -0.3), main: "V", sub: "in" }]
      };
    }
    if (toolMode === "addIoNode_Vin_Right") {
      return {
        paths: [
          circle(0.45, 0, 0.05, "white"),
          line(0.45, 0, 0, 0)
        ],
        texts: [{ ...p(0.7, -0.3), main: "V", sub: "in" }]
      };
    }
    if (toolMode === "addIoNode_Vout_Left") {
      return {
        paths: [
          circle(-0.45, 0, 0.05, "white"),
          line(-0.45, 0, 0, 0)
        ],
        texts: [{ ...p(-0.61, -0.3), main: "V", sub: "out" }]
      };
    }
    if (toolMode === "addIoNode_Vout_Right") {
      return {
        paths: [
          circle(0.45, 0, 0.05, "white"),
          line(0.45, 0, 0, 0)
        ],
        texts: [{ ...p(0.7, -0.3), main: "V", sub: "out" }]
      };
    }
  }

  return null;
}
