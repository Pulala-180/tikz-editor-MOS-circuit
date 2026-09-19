import type { ToolMode } from "../../store/types";
import { POWER_RAIL_DEFAULT_LENGTH_CM, buildPowerRailSnippet, buildPowerRailSnippetBetween } from "./power-rail";

/**
 * Two-point power-rail template: the click-sequence interaction collects the two rail ends and
 * funnels them here, so the taps are laid out by the shared builder regardless of which end the
 * user clicked first. Kept beside `getCircuitComponentSnippet` so both rail entry points live
 * in the template layer.
 */
export function getPowerRailSnippetBetween(
  fromXCm: number,
  fromYCm: number,
  toXCm: number,
  toYCm: number
): string {
  return buildPowerRailSnippetBetween({ xCm: fromXCm, yCm: fromYCm }, { xCm: toXCm, yCm: toYCm });
}

export function getCircuitComponentSnippet(toolMode: ToolMode, xCm: string, yCm: string): string | null {
  if (toolMode === "addResistor" || toolMode === "addResistor_H_Left") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Rx.l) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0.15,0) -- (0.19,0.15) -- (0.27,-0.15) -- (0.35,0.15) -- (0.43,-0.15) -- (0.51,0.15) -- (0.59,-0.15) -- (0.63,0) -- (0.78,0);\n    \\node at (0.39,0.35) {$R_{D}$};\n    \\coordinate (node_Rx.r) at (0.78,0);\n  \\end{scope}`;
  }
  if (toolMode === "addResistor_H_Right") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Rx.l) at (-0.78,0);\n    \\draw[line width=0.32mm, line cap=round] (-0.78,0) -- (-0.63,0) -- (-0.59,0.15) -- (-0.51,-0.15) -- (-0.43,0.15) -- (-0.35,-0.15) -- (-0.27,0.15) -- (-0.19,-0.15) -- (-0.15,0) -- (0,0);\n    \\node at (-0.39,0.35) {$R_{D}$};\n    \\coordinate (node_Rx.r) at (0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addResistor_V_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Rx.t) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,-0.15) -- (0.15,-0.19) -- (-0.15,-0.27) -- (0.15,-0.35) -- (-0.15,-0.43) -- (0.15,-0.51) -- (-0.15,-0.59) -- (0,-0.63) -- (0,-0.78);\n    \\node[right] at (0.25,-0.39) {$R_{D}$};\n    \\coordinate (node_Rx.b) at (0,-0.78);\n  \\end{scope}`;
  }
  if (toolMode === "addResistor_V_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Rx.b) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,0.15) -- (0.15,0.19) -- (-0.15,0.27) -- (0.15,0.35) -- (-0.15,0.43) -- (0.15,0.51) -- (-0.15,0.59) -- (0,0.63) -- (0,0.78);\n    \\node[right] at (0.25,0.39) {$R_{D}$};\n    \\coordinate (node_Rx.t) at (0,0.78);\n  \\end{scope}`;
  }

  // NMOS
  if (toolMode === "addNMOS" || toolMode === "addNMOS_Left_G") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.g) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0.26,0);\n    \\draw[line width=0.7mm] (0.25,-0.25) -- (0.25,0.25);\n    \\draw[line width=0.7mm] (0.41,-0.3) -- (0.41,0.3);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (0.40,0.2) -- (0.73,0.2) -- (0.73,0.5);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (0.40,-0.2) -- (0.70,-0.2);\n    \\draw[line width=0.32mm, line cap=round] (0.73,-0.21) -- (0.73,-0.5);\n    \\node[node font=\\sffamily\\bfseries] at (1.04,0) {$M_{1}$};\n    \\coordinate (node_Mx.d) at (0.73,0.5);\n    \\coordinate (node_Mx.s) at (0.73,-0.5);\n  \\end{scope}`;
  }
  if (toolMode === "addNMOS_Left_D") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.d) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (-0.73,-0.5) -- (-0.47,-0.5);\n    \\draw[line width=0.7mm] (-0.48,-0.75) -- (-0.48,-0.25);\n    \\draw[line width=0.7mm] (-0.32,-0.8) -- (-0.32,-0.2);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (-0.33,-0.3) -- (0,-0.3) -- (0,0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (-0.33,-0.7) -- (-0.03,-0.7);\n    \\draw[line width=0.32mm, line cap=round] (0,-0.71) -- (0,-1.0);\n    \\node[node font=\\sffamily\\bfseries] at (0.31,-0.5) {$M_{1}$};\n    \\coordinate (node_Mx.g) at (-0.73,-0.5);\n    \\coordinate (node_Mx.s) at (0,-1.0);\n  \\end{scope}`;
  }
  if (toolMode === "addNMOS_Left_S") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.s) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (-0.73,0.5) -- (-0.47,0.5);\n    \\draw[line width=0.7mm] (-0.48,0.25) -- (-0.48,0.75);\n    \\draw[line width=0.7mm] (-0.32,0.2) -- (-0.32,0.8);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (-0.33,0.7) -- (0,0.7) -- (0,1.0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (-0.33,0.3) -- (-0.03,0.3);\n    \\draw[line width=0.32mm, line cap=round] (0,0.29) -- (0,0);\n    \\node[node font=\\sffamily\\bfseries] at (0.31,0.5) {$M_{1}$};\n    \\coordinate (node_Mx.d) at (0,1.0);\n    \\coordinate (node_Mx.g) at (-0.73,0.5);\n  \\end{scope}`;
  }
  if (toolMode === "addNMOS_Top_G") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.g) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,-0.26);\n    \\draw[line width=0.7mm] (-0.25,-0.25) -- (0.25,-0.25);\n    \\draw[line width=0.7mm] (-0.3,-0.41) -- (0.3,-0.41);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (0.2,-0.40) -- (0.2,-0.73) -- (0.5,-0.73);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (-0.2,-0.40) -- (-0.2,-0.70);\n    \\draw[line width=0.32mm, line cap=round] (-0.21,-0.73) -- (-0.5,-0.73);\n    \\node[node font=\\sffamily\\bfseries] at (0,-1.04) {$M_{1}$};\n    \\coordinate (node_Mx.d) at (0.5,-0.73);\n    \\coordinate (node_Mx.s) at (-0.5,-0.73);\n  \\end{scope}`;
  }
  if (toolMode === "addNMOS_Top_D") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.d) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (-0.5,0.73) -- (-0.5,0.47);\n    \\draw[line width=0.7mm] (-0.75,0.48) -- (-0.25,0.48);\n    \\draw[line width=0.7mm] (-0.8,0.32) -- (-0.2,0.32);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (-0.3,0.33) -- (-0.3,0) -- (0,0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (-0.7,0.33) -- (-0.7,0.03);\n    \\draw[line width=0.32mm, line cap=round] (-0.71,0) -- (-1.0,0);\n    \\node[node font=\\sffamily\\bfseries] at (-0.5,-0.31) {$M_{1}$};\n    \\coordinate (node_Mx.g) at (-0.5,0.73);\n    \\coordinate (node_Mx.s) at (-1.0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addNMOS_Top_S") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.s) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0.5,0.73) -- (0.5,0.47);\n    \\draw[line width=0.7mm] (0.25,0.48) -- (0.75,0.48);\n    \\draw[line width=0.7mm] (0.2,0.32) -- (0.8,0.32);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (0.7,0.33) -- (0.7,0) -- (1.0,0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (0.3,0.33) -- (0.3,0.03);\n    \\draw[line width=0.32mm, line cap=round] (0.29,0) -- (0,0);\n    \\node[node font=\\sffamily\\bfseries] at (0.5,-0.31) {$M_{1}$};\n    \\coordinate (node_Mx.g) at (0.5,0.73);\n    \\coordinate (node_Mx.d) at (1.0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addNMOS_Right_G") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.g) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (-0.26,0);\n    \\draw[line width=0.7mm] (-0.25,-0.25) -- (-0.25,0.25);\n    \\draw[line width=0.7mm] (-0.41,-0.3) -- (-0.41,0.3);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (-0.40,0.2) -- (-0.73,0.2) -- (-0.73,0.5);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (-0.40,-0.2) -- (-0.70,-0.2);\n    \\draw[line width=0.32mm, line cap=round] (-0.73,-0.21) -- (-0.73,-0.5);\n    \\node[node font=\\sffamily\\bfseries] at (-1.04,0) {$M_{1}$};\n    \\coordinate (node_Mx.d) at (-0.73,0.5);\n    \\coordinate (node_Mx.s) at (-0.73,-0.5);\n  \\end{scope}`;
  }
  if (toolMode === "addNMOS_Right_D") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.d) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0.73,-0.5) -- (0.47,-0.5);\n    \\draw[line width=0.7mm] (0.48,-0.75) -- (0.48,-0.25);\n    \\draw[line width=0.7mm] (0.32,-0.8) -- (0.32,-0.2);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (0.33,-0.3) -- (0,-0.3) -- (0,0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (0.33,-0.7) -- (0.03,-0.7);\n    \\draw[line width=0.32mm, line cap=round] (0,-0.71) -- (0,-1.0);\n    \\node[node font=\\sffamily\\bfseries] at (-0.31,-0.5) {$M_{1}$};\n    \\coordinate (node_Mx.g) at (0.73,-0.5);\n    \\coordinate (node_Mx.s) at (0,-1.0);\n  \\end{scope}`;
  }
  if (toolMode === "addNMOS_Right_S") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.s) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0.73,0.5) -- (0.47,0.5);\n    \\draw[line width=0.7mm] (0.48,0.25) -- (0.48,0.75);\n    \\draw[line width=0.7mm] (0.32,0.2) -- (0.32,0.8);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (0.33,0.7) -- (0,0.7) -- (0,1.0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (0.33,0.3) -- (0.03,0.3);\n    \\draw[line width=0.32mm, line cap=round] (0,0.29) -- (0,0);\n    \\node[node font=\\sffamily\\bfseries] at (-0.31,0.5) {$M_{1}$};\n    \\coordinate (node_Mx.d) at (0,1.0);\n    \\coordinate (node_Mx.g) at (0.73,0.5);\n  \\end{scope}`;
  }
  if (toolMode === "addNMOS_Bottom_G") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.g) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,0.26);\n    \\draw[line width=0.7mm] (-0.25,0.25) -- (0.25,0.25);\n    \\draw[line width=0.7mm] (-0.3,0.41) -- (0.3,0.41);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (-0.2,0.40) -- (-0.2,0.73) -- (-0.5,0.73);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (0.2,0.40) -- (0.2,0.70);\n    \\draw[line width=0.32mm, line cap=round] (0.21,0.73) -- (0.5,0.73);\n    \\node[node font=\\sffamily\\bfseries] at (0,1.04) {$M_{1}$};\n    \\coordinate (node_Mx.d) at (-0.5,0.73);\n    \\coordinate (node_Mx.s) at (0.5,0.73);\n  \\end{scope}`;
  }
  if (toolMode === "addNMOS_Bottom_D") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.d) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0.5,-0.73) -- (0.5,-0.47);\n    \\draw[line width=0.7mm] (0.25,-0.48) -- (0.75,-0.48);\n    \\draw[line width=0.7mm] (0.2,-0.32) -- (0.8,-0.32);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (0.3,-0.33) -- (0.3,0) -- (0,0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (0.7,-0.33) -- (0.7,-0.03);\n    \\draw[line width=0.32mm, line cap=round] (0.71,0) -- (1.0,0);\n    \\node[node font=\\sffamily\\bfseries] at (0.5,0.31) {$M_{1}$};\n    \\coordinate (node_Mx.g) at (0.5,-0.73);\n    \\coordinate (node_Mx.s) at (1.0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addNMOS_Bottom_S") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.s) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (-0.5,-0.73) -- (-0.5,-0.47);\n    \\draw[line width=0.7mm] (-0.75,-0.48) -- (-0.25,-0.48);\n    \\draw[line width=0.7mm] (-0.8,-0.32) -- (-0.2,-0.32);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (-0.7,-0.33) -- (-0.7,0) -- (-1.0,0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (-0.3,-0.33) -- (-0.3,-0.03);\n    \\draw[line width=0.32mm, line cap=round] (-0.29,0) -- (0,0);\n    \\node[node font=\\sffamily\\bfseries] at (-0.5,0.31) {$M_{1}$};\n    \\coordinate (node_Mx.g) at (-0.5,-0.73);\n    \\coordinate (node_Mx.d) at (-1.0,0);\n  \\end{scope}`;
  }

  // PMOS
  if (toolMode === "addPMOS" || toolMode === "addPMOS_Left_G") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.g) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0.26,0);\n    \\draw[line width=0.7mm] (0.25,-0.25) -- (0.25,0.25);\n    \\draw[line width=0.7mm] (0.41,-0.3) -- (0.41,0.3);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (0.40,-0.2) -- (0.73,-0.2) -- (0.73,-0.5);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (0.73,0.2) -- (0.44,0.2);\n    \\draw[line width=0.32mm, line cap=round] (0.73,0.5) -- (0.73,0.2);\n    \\node[node font=\\sffamily\\bfseries] at (1.04,0) {$M_{1}$};\n    \\coordinate (node_Mx.d) at (0.73,-0.5);\n    \\coordinate (node_Mx.s) at (0.73,0.5);\n  \\end{scope}`;
  }
  if (toolMode === "addPMOS_Left_D") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.d) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (-0.73,0.5) -- (-0.47,0.5);\n    \\draw[line width=0.7mm] (-0.48,0.25) -- (-0.48,0.75);\n    \\draw[line width=0.7mm] (-0.32,0.2) -- (-0.32,0.8);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (-0.33,0.3) -- (0,0.3) -- (0,0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (0,0.7) -- (-0.29,0.7);\n    \\draw[line width=0.32mm, line cap=round] (0,1.0) -- (0,0.7);\n    \\node[node font=\\sffamily\\bfseries] at (0.31,0.5) {$M_{1}$};\n    \\coordinate (node_Mx.g) at (-0.73,0.5);\n    \\coordinate (node_Mx.s) at (0,1.0);\n  \\end{scope}`;
  }
  if (toolMode === "addPMOS_Left_S") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.s) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (-0.73,-0.5) -- (-0.47,-0.5);\n    \\draw[line width=0.7mm] (-0.48,-0.75) -- (-0.48,-0.25);\n    \\draw[line width=0.7mm] (-0.32,-0.8) -- (-0.32,-0.2);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (-0.33,-0.7) -- (0,-0.7) -- (0,-1.0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (0,-0.3) -- (-0.29,-0.3);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,-0.3);\n    \\node[node font=\\sffamily\\bfseries] at (0.31,-0.5) {$M_{1}$};\n    \\coordinate (node_Mx.g) at (-0.73,-0.5);\n    \\coordinate (node_Mx.d) at (0,-1.0);\n  \\end{scope}`;
  }
  if (toolMode === "addPMOS_Top_G") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.g) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,-0.26);\n    \\draw[line width=0.7mm] (-0.25,-0.25) -- (0.25,-0.25);\n    \\draw[line width=0.7mm] (-0.3,-0.41) -- (0.3,-0.41);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (-0.2,-0.40) -- (-0.2,-0.73) -- (-0.5,-0.73);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (0.2,-0.73) -- (0.2,-0.44);\n    \\draw[line width=0.32mm, line cap=round] (0.5,-0.73) -- (0.2,-0.73);\n    \\node[node font=\\sffamily\\bfseries] at (0,-1.04) {$M_{1}$};\n    \\coordinate (node_Mx.d) at (-0.5,-0.73);\n    \\coordinate (node_Mx.s) at (0.5,-0.73);\n  \\end{scope}`;
  }
  if (toolMode === "addPMOS_Top_D") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.d) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0.5,0.73) -- (0.5,0.47);\n    \\draw[line width=0.7mm] (0.25,0.48) -- (0.75,0.48);\n    \\draw[line width=0.7mm] (0.2,0.32) -- (0.8,0.32);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (0.3,0.33) -- (0.3,0) -- (0,0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (0.7,0) -- (0.7,0.29);\n    \\draw[line width=0.32mm, line cap=round] (1.0,0) -- (0.7,0);\n    \\node[node font=\\sffamily\\bfseries] at (0.5,-0.31) {$M_{1}$};\n    \\coordinate (node_Mx.g) at (0.5,0.73);\n    \\coordinate (node_Mx.s) at (1.0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addPMOS_Top_S") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.s) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (-0.5,0.73) -- (-0.5,0.47);\n    \\draw[line width=0.7mm] (-0.75,0.48) -- (-0.25,0.48);\n    \\draw[line width=0.7mm] (-0.8,0.32) -- (-0.2,0.32);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (-0.7,0.33) -- (-0.7,0) -- (-1.0,0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (-0.3,0) -- (-0.3,0.29);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (-0.3,0);\n    \\node[node font=\\sffamily\\bfseries] at (-0.5,-0.31) {$M_{1}$};\n    \\coordinate (node_Mx.g) at (-0.5,0.73);\n    \\coordinate (node_Mx.d) at (-1.0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addPMOS_Right_G") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.g) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (-0.26,0);\n    \\draw[line width=0.7mm] (-0.25,-0.25) -- (-0.25,0.25);\n    \\draw[line width=0.7mm] (-0.41,-0.3) -- (-0.41,0.3);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (-0.40,-0.2) -- (-0.73,-0.2) -- (-0.73,-0.5);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (-0.73,0.2) -- (-0.44,0.2);\n    \\draw[line width=0.32mm, line cap=round] (-0.73,0.5) -- (-0.73,0.2);\n    \\node[node font=\\sffamily\\bfseries] at (-1.04,0) {$M_{1}$};\n    \\coordinate (node_Mx.d) at (-0.73,-0.5);\n    \\coordinate (node_Mx.s) at (-0.73,0.5);\n  \\end{scope}`;
  }
  if (toolMode === "addPMOS_Right_D") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.d) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0.73,0.5) -- (0.47,0.5);\n    \\draw[line width=0.7mm] (0.48,0.25) -- (0.48,0.75);\n    \\draw[line width=0.7mm] (0.32,0.2) -- (0.32,0.8);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (0.33,0.3) -- (0,0.3) -- (0,0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (0,0.7) -- (0.29,0.7);\n    \\draw[line width=0.32mm, line cap=round] (0,1.0) -- (0,0.7);\n    \\node[node font=\\sffamily\\bfseries] at (-0.31,0.5) {$M_{1}$};\n    \\coordinate (node_Mx.g) at (0.73,0.5);\n    \\coordinate (node_Mx.s) at (0,1.0);\n  \\end{scope}`;
  }
  if (toolMode === "addPMOS_Right_S") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.s) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0.73,-0.5) -- (0.47,-0.5);\n    \\draw[line width=0.7mm] (0.48,-0.75) -- (0.48,-0.25);\n    \\draw[line width=0.7mm] (0.32,-0.8) -- (0.32,-0.2);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (0.33,-0.7) -- (0,-0.7) -- (0,-1.0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (0,-0.3) -- (0.29,-0.3);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,-0.3);\n    \\node[node font=\\sffamily\\bfseries] at (-0.31,-0.5) {$M_{1}$};\n    \\coordinate (node_Mx.g) at (0.73,-0.5);\n    \\coordinate (node_Mx.d) at (0,-1.0);\n  \\end{scope}`;
  }
  if (toolMode === "addPMOS_Bottom_G") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.g) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,0.26);\n    \\draw[line width=0.7mm] (-0.25,0.25) -- (0.25,0.25);\n    \\draw[line width=0.7mm] (-0.3,0.41) -- (0.3,0.41);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (0.2,0.40) -- (0.2,0.73) -- (0.5,0.73);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (-0.2,0.73) -- (-0.2,0.44);\n    \\draw[line width=0.32mm, line cap=round] (-0.5,0.73) -- (-0.2,0.73);\n    \\node[node font=\\sffamily\\bfseries] at (0,1.04) {$M_{1}$};\n    \\coordinate (node_Mx.d) at (0.5,0.73);\n    \\coordinate (node_Mx.s) at (-0.5,0.73);\n  \\end{scope}`;
  }
  if (toolMode === "addPMOS_Bottom_D") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.d) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (-0.5,-0.73) -- (-0.5,-0.47);\n    \\draw[line width=0.7mm] (-0.75,-0.48) -- (-0.25,-0.48);\n    \\draw[line width=0.7mm] (-0.8,-0.32) -- (-0.2,-0.32);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (-0.3,-0.33) -- (-0.3,0) -- (0,0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (-0.7,0) -- (-0.7,-0.29);\n    \\draw[line width=0.32mm, line cap=round] (-1.0,0) -- (-0.7,0);\n    \\node[node font=\\sffamily\\bfseries] at (-0.5,0.31) {$M_{1}$};\n    \\coordinate (node_Mx.g) at (-0.5,-0.73);\n    \\coordinate (node_Mx.s) at (-1.0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addPMOS_Bottom_S") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.s) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0.5,-0.73) -- (0.5,-0.47);\n    \\draw[line width=0.7mm] (0.25,-0.48) -- (0.75,-0.48);\n    \\draw[line width=0.7mm] (0.2,-0.32) -- (0.8,-0.32);\n    \\draw[line width=0.32mm, line cap=round, line join=round] (0.7,-0.33) -- (0.7,0) -- (1.0,0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (0.3,0) -- (0.3,-0.29);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0.3,0);\n    \\node[node font=\\sffamily\\bfseries] at (0.5,0.31) {$M_{1}$};\n    \\coordinate (node_Mx.g) at (0.5,-0.73);\n    \\coordinate (node_Mx.d) at (1.0,0);\n  \\end{scope}`;
  }

  // Dot Node
  if (toolMode === "addDotNode") {
    return `\\draw[line width=0.32mm, fill=black] (${xCm},${yCm}) circle (0.06);`;
  }

  // IO Nodes
  if (toolMode === "addIoNode" || toolMode === "addIoNode_Vin_Left") {
    const scopeX = (parseFloat(xCm) - 0.6).toFixed(2);
    return `\\begin{scope}[shift={(${scopeX},${yCm})}]\n    \\node at (-0.01,-0.30) {$V_{in}$};\n    \\draw[line width=0.32mm, line cap=round] (0.15,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.6,0);\n    \\coordinate (node_IOx.port) at (0.6,0);\n  \\end{scope}`;
  }
  if (toolMode === "addIoNode_Vin_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\node at (0.35,0.45) {$V_{in}$};\n    \\draw[line width=0.32mm, line cap=round] (0,0.45) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0,0);\n    \\coordinate (node_IOx.port) at (0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addIoNode_Vin_Right") {
    const scopeX = (parseFloat(xCm) - 0.15).toFixed(2);
    return `\\begin{scope}[shift={(${scopeX},${yCm})}]\n    \\node at (0.85,-0.30) {$V_{in}$};\n    \\draw[line width=0.32mm, line cap=round] (0.6,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.15,0);\n    \\coordinate (node_IOx.port) at (0.15,0);\n  \\end{scope}`;
  }
  if (toolMode === "addIoNode_Vin_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\node at (0.35,-0.45) {$V_{in}$};\n    \\draw[line width=0.32mm, line cap=round] (0,-0.45) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0,0);\n    \\coordinate (node_IOx.port) at (0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addIoNode_Vout_Left") {
    const scopeX = (parseFloat(xCm) - 0.6).toFixed(2);
    return `\\begin{scope}[shift={(${scopeX},${yCm})}]\n    \\node at (-0.01,-0.30) {$V_{out}$};\n    \\draw[line width=0.32mm, line cap=round] (0.15,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.6,0);\n    \\coordinate (node_IOx.port) at (0.6,0);\n  \\end{scope}`;
  }
  if (toolMode === "addIoNode_Vout_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\node at (0.35,0.45) {$V_{out}$};\n    \\draw[line width=0.32mm, line cap=round] (0,0.45) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0,0);\n    \\coordinate (node_IOx.port) at (0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addIoNode_Vout_Right") {
    const scopeX = (parseFloat(xCm) - 0.15).toFixed(2);
    return `\\begin{scope}[shift={(${scopeX},${yCm})}]\n    \\node at (0.85,-0.30) {$V_{out}$};\n    \\draw[line width=0.32mm, line cap=round] (0.6,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.15,0);\n    \\coordinate (node_IOx.port) at (0.15,0);\n  \\end{scope}`;
  }
  if (toolMode === "addIoNode_Vout_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\node at (0.35,-0.45) {$V_{out}$};\n    \\draw[line width=0.32mm, line cap=round] (0,-0.45) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0,0);\n    \\coordinate (node_IOx.port) at (0,0);\n  \\end{scope}`;
  }

  // VDD
  if (toolMode === "addVDD") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_VDD.bottom) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,0.22);\n    \\draw[ultra thick] (-0.95,0.22) -- (0.9,0.22);\n    \\node[draw=none] at (1.2,0.22) {$V_{DD}$};\n  \\end{scope}`;
  }

  // Port objects (vdd-port / port). Same lead + hollow-circle silhouette as the IO
  // terminal, but the pin is `node_<family>x.port` so the placement auto-numbers to
  // VDD1 / VDD2 / Port1 / Port2 and the label stays `$V_{DD}$` (or the net name the user
  // types for a generic port — `$V_{in}$` by default).
  const portFamily = toolMode.startsWith("addIoNode_VddPort")
    ? "VDD"
    : toolMode.startsWith("addIoNode_Port")
      ? "Port"
      : null;
  if (portFamily) {
    const portLabel = portFamily === "VDD" ? "$V_{DD}$" : "$V_{in}$";
    const isLeft = toolMode.endsWith("_Left");
    const isTop = toolMode.endsWith("_Top");
    const isRight = toolMode.endsWith("_Right");
    if (isLeft) {
      const scopeX = (parseFloat(xCm) - 0.6).toFixed(2);
      return `\\begin{scope}[shift={(${scopeX},${yCm})}]\n    \\node at (-0.01,-0.30) {${portLabel}};\n    \\draw[line width=0.32mm, line cap=round] (0.15,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.6,0);\n    \\coordinate (node_${portFamily}x.port) at (0.6,0);\n  \\end{scope}`;
    }
    if (isTop) {
      return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\node at (0.35,0.45) {${portLabel}};\n    \\draw[line width=0.32mm, line cap=round] (0,0.45) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0,0);\n    \\coordinate (node_${portFamily}x.port) at (0,0);\n  \\end{scope}`;
    }
    if (isRight) {
      const scopeX = (parseFloat(xCm) - 0.15).toFixed(2);
      return `\\begin{scope}[shift={(${scopeX},${yCm})}]\n    \\node at (0.85,-0.30) {${portLabel}};\n    \\draw[line width=0.32mm, line cap=round] (0.6,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.15,0);\n    \\coordinate (node_${portFamily}x.port) at (0.15,0);\n  \\end{scope}`;
    }
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\node at (0.35,-0.45) {${portLabel}};\n    \\draw[line width=0.32mm, line cap=round] (0,-0.45) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0,0);\n    \\coordinate (node_${portFamily}x.port) at (0,0);\n  \\end{scope}`;
  }

  // Power rails (VDD rail). The single-click tool modes stamp the default-length rail
  // anchored at the clicked end; the two-point builder lives in ./power-rail and is what
  // the "click the second end" interaction calls.
  if (toolMode === "addPowerRail" || toolMode === "addPowerRail_H_Left" || toolMode === "addPowerRail_H_Right") {
    const anchorX = parseFloat(xCm);
    const anchoredLeft = toolMode !== "addPowerRail_H_Right";
    const originX = anchoredLeft ? anchorX : anchorX - POWER_RAIL_DEFAULT_LENGTH_CM;
    return buildPowerRailSnippet(originX, parseFloat(yCm), POWER_RAIL_DEFAULT_LENGTH_CM, {
      orientation: "horizontal"
    });
  }
  if (toolMode === "addPowerRail_V_Top" || toolMode === "addPowerRail_V_Bottom") {
    const anchorY = parseFloat(yCm);
    const anchoredTop = toolMode === "addPowerRail_V_Top";
    const originY = anchoredTop ? anchorY : anchorY + POWER_RAIL_DEFAULT_LENGTH_CM;
    return buildPowerRailSnippet(parseFloat(xCm), originY, POWER_RAIL_DEFAULT_LENGTH_CM, {
      orientation: "vertical"
    });
  }

  // Capacitors
  if (toolMode === "addCapacitor" || toolMode === "addCapacitor_H_Left") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Cx.l) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0.2,0);\n    \\draw[ultra thick] (0.2,-0.25) -- (0.2,0.25);\n    \\draw[ultra thick] (0.36,-0.25) -- (0.36,0.25);\n    \\draw[line width=0.32mm, line cap=round] (0.36,0) -- (0.56,0);\n    \\coordinate (node_Cx.r) at (0.56,0);\n    \\node at (0.2,0.52) {$C_{gd}$};\n  \\end{scope}`;
  }
  if (toolMode === "addCapacitor_H_Right") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Cx.l) at (-0.56,0);\n    \\draw[line width=0.32mm, line cap=round] (-0.56,0) -- (-0.36,0);\n    \\draw[ultra thick] (-0.36,-0.25) -- (-0.36,0.25);\n    \\draw[ultra thick] (-0.2,-0.25) -- (-0.2,0.25);\n    \\draw[line width=0.32mm, line cap=round] (-0.2,0) -- (0,0);\n    \\coordinate (node_Cx.r) at (0,0);\n    \\node at (-0.36,0.52) {$C_{gd}$};\n  \\end{scope}`;
  }
  if (toolMode === "addCapacitor_V_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Cx.t) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,-0.2);\n    \\draw[ultra thick] (-0.25,-0.2) -- (0.25,-0.2);\n    \\draw[ultra thick] (-0.25,-0.36) -- (0.25,-0.36);\n    \\draw[line width=0.32mm, line cap=round] (0,-0.36) -- (0,-0.56);\n    \\coordinate (node_Cx.b) at (0,-0.56);\n    \\node at (0.52,-0.28) {$C_{gd}$};\n  \\end{scope}`;
  }
  if (toolMode === "addCapacitor_V_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Cx.b) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,0.2);\n    \\draw[ultra thick] (-0.25,0.2) -- (0.25,0.2);\n    \\draw[ultra thick] (-0.25,0.36) -- (0.25,0.36);\n    \\draw[line width=0.32mm, line cap=round] (0,0.36) -- (0,0.56);\n    \\coordinate (node_Cx.t) at (0,0.56);\n    \\node at (0.52,0.28) {$C_{gd}$};\n  \\end{scope}`;
  }

  // GND
  if (toolMode === "addGND" || toolMode === "addGND_V_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_GND.top) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,-0.21);\n    \\draw[ultra thick] (-0.17,-0.21) -- (0.17,-0.21);\n    \\draw[ultra thick] (-0.11,-0.35) -- (0.11,-0.35);\n    \\draw[ultra thick] (-0.08,-0.49) -- (0.08,-0.49);\n  \\end{scope}`;
  }
  if (toolMode === "addGND_V_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_GND.bottom) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,0.21);\n    \\draw[ultra thick] (-0.17,0.21) -- (0.17,0.21);\n    \\draw[ultra thick] (-0.11,0.35) -- (0.11,0.35);\n    \\draw[ultra thick] (-0.08,0.49) -- (0.08,0.49);\n  \\end{scope}`;
  }
  if (toolMode === "addGND_H_Left") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_GND.l) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0.21,0);\n    \\draw[ultra thick] (0.21,-0.17) -- (0.21,0.17);\n    \\draw[ultra thick] (0.35,-0.11) -- (0.35,0.11);\n    \\draw[ultra thick] (0.49,-0.08) -- (0.49,0.08);\n  \\end{scope}`;
  }
  if (toolMode === "addGND_H_Right") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_GND.r) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (-0.21,0);\n    \\draw[ultra thick] (-0.21,-0.17) -- (-0.21,0.17);\n    \\draw[ultra thick] (-0.35,-0.11) -- (-0.35,0.11);\n    \\draw[ultra thick] (-0.49,-0.08) -- (-0.49,0.08);\n  \\end{scope}`;
  }

  // Current Sources
  if (toolMode === "addCurrentSource_Right_Left" || toolMode === "addCurrentSource_H_Left") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.l) at (0,0);\n    \\draw[line width=0.32mm] (0,0) -- (0.15,0);\n    \\draw[line width=0.32mm] (0.4,0) circle (0.25cm);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, line width=0.32mm] (0.25,0) -- (0.55,0);\n    \\node[above=0.15cm] at (0.4,0.25) {\\normalsize $i$};\n    \\draw[line width=0.32mm, line cap=round] (0.65,0) -- (0.8,0);\n    \\coordinate (node_Ix.r) at (0.8,0);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentSource_Right_Right" || toolMode === "addCurrentSource_H_Right") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.l) at (-0.8,0);\n    \\draw[line width=0.32mm] (-0.8,0) -- (-0.65,0);\n    \\draw[line width=0.32mm] (-0.4,0) circle (0.25cm);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, line width=0.32mm] (-0.55,0) -- (-0.25,0);\n    \\node[above=0.15cm] at (-0.4,0.25) {\\normalsize $i$};\n    \\draw[line width=0.32mm, line cap=round] (-0.15,0) -- (0,0);\n    \\coordinate (node_Ix.r) at (0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentSource_Left_Left") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.l) at (0,0);\n    \\draw[line width=0.32mm] (0,0) -- (0.15,0);\n    \\draw[line width=0.32mm] (0.4,0) circle (0.25cm);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, line width=0.32mm] (0.55,0) -- (0.25,0);\n    \\node[above=0.15cm] at (0.4,0.25) {\\normalsize $i$};\n    \\draw[line width=0.32mm, line cap=round] (0.65,0) -- (0.8,0);\n    \\coordinate (node_Ix.r) at (0.8,0);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentSource_Left_Right") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.l) at (-0.8,0);\n    \\draw[line width=0.32mm] (-0.8,0) -- (-0.65,0);\n    \\draw[line width=0.32mm] (-0.4,0) circle (0.25cm);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, line width=0.32mm] (-0.25,0) -- (-0.55,0);\n    \\node[above=0.15cm] at (-0.4,0.25) {\\normalsize $i$};\n    \\draw[line width=0.32mm, line cap=round] (-0.15,0) -- (0,0);\n    \\coordinate (node_Ix.r) at (0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentSource_Down_Top" || toolMode === "addCurrentSource_V_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.top) at (0,0);\n    \\draw[line width=0.32mm] (0,0) -- (0,-0.15);\n    \\draw[line width=0.32mm] (0,-0.4) circle (0.25cm);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, line width=0.32mm] (0,-0.25) -- (0,-0.55);\n    \\node[right=0.15cm] at (0.15,-0.41) {\\normalsize $i$};\n    \\draw[line width=0.32mm, line cap=round] (0,-0.65) -- (0,-0.8);\n    \\coordinate (node_Ix.bottom) at (0,-0.8);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentSource" || toolMode === "addCurrentSource_Down_Bottom" || toolMode === "addCurrentSource_V_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.bottom) at (0,0);\n    \\draw[line width=0.32mm] (0,0.8) -- (0,0.65);\n    \\draw[line width=0.32mm] (0,0.4) circle (0.25cm);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, line width=0.32mm] (0,0.55) -- (0,0.25);\n    \\node[right=0.15cm] at (0.15,0.39) {\\normalsize $i$};\n    \\draw[line width=0.32mm, line cap=round] (0,0.15) -- (0,0);\n    \\coordinate (node_Ix.top) at (0,0.8);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentSource_Up_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.top) at (0,0);\n    \\draw[line width=0.32mm] (0,0) -- (0,-0.15);\n    \\draw[line width=0.32mm] (0,-0.4) circle (0.25cm);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, line width=0.32mm] (0,-0.55) -- (0,-0.25);\n    \\node[right=0.15cm] at (0.15,-0.41) {\\normalsize $i$};\n    \\draw[line width=0.32mm, line cap=round] (0,-0.65) -- (0,-0.8);\n    \\coordinate (node_Ix.bottom) at (0,-0.8);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentSource_Up_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.bottom) at (0,0);\n    \\draw[line width=0.32mm] (0,0.8) -- (0,0.65);\n    \\draw[line width=0.32mm] (0,0.4) circle (0.25cm);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, line width=0.32mm] (0,0.25) -- (0,0.55);\n    \\node[right=0.15cm] at (0.15,0.39) {\\normalsize $i$};\n    \\draw[line width=0.32mm, line cap=round] (0,0.15) -- (0,0);\n    \\coordinate (node_Ix.top) at (0,0.8);\n  \\end{scope}`;
  }

  // Controlled Current Sources (菱形受控电流源)
  if (toolMode === "addControlledCurrentSource_Right_Left" || toolMode === "addControlledCurrentSource_H_Left") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.l) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0.144,0);\n    \\draw[line width=0.32mm] (0.144,0) -- (0.48,0.24) -- (0.816,0) -- (0.48,-0.24) -- cycle;\n    \\draw[-{Triangle[length=2.16mm, width=2.04mm]}, line width=0.32mm] (0.30,0) -- (0.66,0);\n    \\node[above=0.144cm] at (0.48,0.24) {\\normalsize $g_{m}v_{gs}$};\n    \\draw[line width=0.32mm, line cap=round] (0.816,0) -- (0.96,0);\n    \\coordinate (node_Ix.r) at (0.96,0);\n  \\end{scope}`;
  }
  if (toolMode === "addControlledCurrentSource_Right_Right" || toolMode === "addControlledCurrentSource_H_Right") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.l) at (-0.96,0);\n    \\draw[line width=0.32mm, line cap=round] (-0.96,0) -- (-0.816,0);\n    \\draw[line width=0.32mm] (-0.816,0) -- (-0.48,0.24) -- (-0.144,0) -- (-0.48,-0.24) -- cycle;\n    \\draw[-{Triangle[length=2.16mm, width=2.04mm]}, line width=0.32mm] (-0.66,0) -- (-0.30,0);\n    \\node[above=0.144cm] at (-0.48,0.24) {\\normalsize $g_{m}v_{gs}$};\n    \\draw[line width=0.32mm, line cap=round] (-0.144,0) -- (0,0);\n    \\coordinate (node_Ix.r) at (0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addControlledCurrentSource_Left_Left") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.l) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0.144,0);\n    \\draw[line width=0.32mm] (0.144,0) -- (0.48,0.24) -- (0.816,0) -- (0.48,-0.24) -- cycle;\n    \\draw[-{Triangle[length=2.16mm, width=2.04mm]}, line width=0.32mm] (0.66,0) -- (0.30,0);\n    \\node[above=0.144cm] at (0.48,0.24) {\\normalsize $g_{m}v_{gs}$};\n    \\draw[line width=0.32mm, line cap=round] (0.816,0) -- (0.96,0);\n    \\coordinate (node_Ix.r) at (0.96,0);\n  \\end{scope}`;
  }
  if (toolMode === "addControlledCurrentSource_Left_Right") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.l) at (-0.96,0);\n    \\draw[line width=0.32mm, line cap=round] (-0.96,0) -- (-0.816,0);\n    \\draw[line width=0.32mm] (-0.816,0) -- (-0.48,0.24) -- (-0.144,0) -- (-0.48,-0.24) -- cycle;\n    \\draw[-{Triangle[length=2.16mm, width=2.04mm]}, line width=0.32mm] (-0.30,0) -- (-0.66,0);\n    \\node[above=0.144cm] at (-0.48,0.24) {\\normalsize $g_{m}v_{gs}$};\n    \\draw[line width=0.32mm, line cap=round] (-0.144,0) -- (0,0);\n    \\coordinate (node_Ix.r) at (0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addControlledCurrentSource_Down_Top" || toolMode === "addControlledCurrentSource_V_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.top) at (0,0);\n    \\draw[line cap=round, line width=0.32mm] (0,0) -- (0,-0.144);\n    \\draw[line width=0.32mm] (0,-0.144) -- (0.24,-0.48) -- (0,-0.816) -- (-0.24,-0.48) -- cycle;\n    \\draw[-{Triangle[length=2.16mm, width=2.04mm]}, line width=0.32mm] (0,-0.30) -- (0,-0.66);\n    \\node[right=0.144cm] at (0.24,-0.48) {\\normalsize $g_{m}v_{gs}$};\n    \\draw[line width=0.32mm, line cap=round] (0,-0.816) -- (0,-0.96);\n    \\coordinate (node_Ix.bottom) at (0,-0.96);\n  \\end{scope}`;
  }
  if (toolMode === "addControlledCurrentSource" || toolMode === "addControlledCurrentSource_Down_Bottom" || toolMode === "addControlledCurrentSource_V_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.bottom) at (0,0);\n    \\draw[line cap=round, line width=0.32mm] (0,0.96) -- (0,0.816);\n    \\draw[line width=0.32mm] (0,0.816) -- (0.24,0.48) -- (0,0.144) -- (-0.24,0.48) -- cycle;\n    \\draw[-{Triangle[length=2.16mm, width=2.04mm]}, line width=0.32mm] (0,0.66) -- (0,0.30);\n    \\node[right=0.144cm] at (0.24,0.48) {\\normalsize $g_{m}v_{gs}$};\n    \\draw[line width=0.32mm, line cap=round] (0,0.144) -- (0,0);\n    \\coordinate (node_Ix.top) at (0,0.96);\n  \\end{scope}`;
  }
  if (toolMode === "addControlledCurrentSource_Up_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.top) at (0,0);\n    \\draw[line cap=round, line width=0.32mm] (0,0) -- (0,-0.144);\n    \\draw[line width=0.32mm] (0,-0.144) -- (0.24,-0.48) -- (0,-0.816) -- (-0.24,-0.48) -- cycle;\n    \\draw[-{Triangle[length=2.16mm, width=2.04mm]}, line width=0.32mm] (0,-0.66) -- (0,-0.30);\n    \\node[right=0.144cm] at (0.24,-0.48) {\\normalsize $g_{m}v_{gs}$};\n    \\draw[line width=0.32mm, line cap=round] (0,-0.816) -- (0,-0.96);\n    \\coordinate (node_Ix.bottom) at (0,-0.96);\n  \\end{scope}`;
  }
  if (toolMode === "addControlledCurrentSource_Up_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.bottom) at (0,0);\n    \\draw[line cap=round, line width=0.32mm] (0,0.96) -- (0,0.816);\n    \\draw[line width=0.32mm] (0,0.816) -- (0.24,0.48) -- (0,0.144) -- (-0.24,0.48) -- cycle;\n    \\draw[-{Triangle[length=2.16mm, width=2.04mm]}, line width=0.32mm] (0,0.30) -- (0,0.66);\n    \\node[right=0.144cm] at (0.24,0.48) {\\normalsize $g_{m}v_{gs}$};\n    \\draw[line width=0.32mm, line cap=round] (0,0.144) -- (0,0);\n    \\coordinate (node_Ix.top) at (0,0.96);\n  \\end{scope}`;
  }

  // Voltage Sources
  if (toolMode === "addVoltageSource" || toolMode === "addVoltageSource_Up_Top" || toolMode === "addVoltageSource_V_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Vx.top) at (0,0);\n    \\draw[line width=0.32mm] (0,0) -- (0,-0.15);\n    \\draw[line width=0.32mm] (0,-0.4) circle (0.25cm);\n    \\node[right=0.15cm] at (-0.98,-0.4) {\\normalsize $v$};\n    \\draw[line width=0.32mm, line cap=round] (0,-0.65) -- (0,-0.8);\n    \\coordinate (node_Vx.bottom) at (0,-0.8);\n    \\draw[line width=0.32mm] (0.32,-0.10) -- (0.50,-0.10);\n    \\draw[line width=0.32mm] (0.41,-0.01) -- (0.41,-0.19);\n    \\draw[line width=0.32mm] (0.32,-0.75) -- (0.50,-0.75);\n  \\end{scope}`;
  }
  if (toolMode === "addVoltageSource_Down_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Vx.top) at (0,0);\n    \\draw[line width=0.32mm] (0,0) -- (0,-0.15);\n    \\draw[line width=0.32mm] (0,-0.4) circle (0.25cm);\n    \\node[right=0.15cm] at (-0.98,-0.4) {\\normalsize $v$};\n    \\draw[line width=0.32mm, line cap=round] (0,-0.65) -- (0,-0.8);\n    \\coordinate (node_Vx.bottom) at (0,-0.8);\n    \\draw[line width=0.32mm] (0.32,-0.10) -- (0.50,-0.10);\n    \\draw[line width=0.32mm] (0.32,-0.75) -- (0.50,-0.75);\n    \\draw[line width=0.32mm] (0.41,-0.66) -- (0.41,-0.84);\n  \\end{scope}`;
  }
  if (toolMode === "addVoltageSource_Up_Bottom" || toolMode === "addVoltageSource_V_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Vx.bottom) at (0,0);\n    \\draw[line width=0.32mm] (0,0.8) -- (0,0.65);\n    \\draw[line width=0.32mm] (0,0.4) circle (0.25cm);\n    \\node[right=0.15cm] at (-0.98,0.4) {\\normalsize $v$};\n    \\draw[line width=0.32mm, line cap=round] (0,0.15) -- (0,0);\n    \\coordinate (node_Vx.top) at (0,0.8);\n    \\draw[line width=0.32mm] (0.32,0.70) -- (0.50,0.70);\n    \\draw[line width=0.32mm] (0.41,0.79) -- (0.41,0.61);\n    \\draw[line width=0.32mm] (0.32,0.05) -- (0.50,0.05);\n  \\end{scope}`;
  }
  if (toolMode === "addVoltageSource_Down_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Vx.bottom) at (0,0);\n    \\draw[line width=0.32mm] (0,0.8) -- (0,0.65);\n    \\draw[line width=0.32mm] (0,0.4) circle (0.25cm);\n    \\node[right=0.15cm] at (-0.98,0.4) {\\normalsize $v$};\n    \\draw[line width=0.32mm, line cap=round] (0,0.15) -- (0,0);\n    \\coordinate (node_Vx.top) at (0,0.8);\n    \\draw[line width=0.32mm] (0.32,0.70) -- (0.50,0.70);\n    \\draw[line width=0.32mm] (0.32,0.05) -- (0.50,0.05);\n    \\draw[line width=0.32mm] (0.41,0.14) -- (0.41,-0.04);\n  \\end{scope}`;
  }
  if (toolMode === "addVoltageSource_Right_Left" || toolMode === "addVoltageSource_H_Left") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Vx.l) at (0,0);\n    \\draw[line width=0.32mm] (0,0) -- (0.15,0);\n    \\draw[line width=0.32mm] (0.4,0) circle (0.25cm);\n    \\node[above=0.15cm] at (0.4,0.13) {\\normalsize $v$};\n    \\draw[line width=0.32mm, line cap=round] (0.65,0) -- (0.8,0);\n    \\coordinate (node_Vx.r) at (0.8,0);\n    \\draw[line width=0.32mm] (0.61,-0.41) -- (0.79,-0.41);\n    \\draw[line width=0.32mm] (0.70,-0.32) -- (0.70,-0.50);\n    \\draw[line width=0.32mm] (-0.04,-0.41) -- (0.14,-0.41);\n  \\end{scope}`;
  }
  if (toolMode === "addVoltageSource_Left_Left") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Vx.l) at (0,0);\n    \\draw[line width=0.32mm] (0,0) -- (0.15,0);\n    \\draw[line width=0.32mm] (0.4,0) circle (0.25cm);\n    \\node[above=0.15cm] at (0.4,0.13) {\\normalsize $v$};\n    \\draw[line width=0.32mm, line cap=round] (0.65,0) -- (0.8,0);\n    \\coordinate (node_Vx.r) at (0.8,0);\n    \\draw[line width=0.32mm] (-0.04,-0.41) -- (0.14,-0.41);\n    \\draw[line width=0.32mm] (0.05,-0.32) -- (0.05,-0.50);\n    \\draw[line width=0.32mm] (0.61,-0.41) -- (0.79,-0.41);\n  \\end{scope}`;
  }
  if (toolMode === "addVoltageSource_Right_Right" || toolMode === "addVoltageSource_H_Right") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Vx.l) at (-0.8,0);\n    \\draw[line width=0.32mm] (-0.8,0) -- (-0.65,0);\n    \\draw[line width=0.32mm] (-0.4,0) circle (0.25cm);\n    \\node[above=0.15cm] at (-0.4,0.13) {\\normalsize $v$};\n    \\draw[line width=0.32mm, line cap=round] (-0.15,0) -- (0,0);\n    \\coordinate (node_Vx.r) at (0,0);\n    \\draw[line width=0.32mm] (-0.19,-0.41) -- (-0.01,-0.41);\n    \\draw[line width=0.32mm] (-0.10,-0.32) -- (-0.10,-0.50);\n    \\draw[line width=0.32mm] (-0.84,-0.41) -- (-0.66,-0.41);\n  \\end{scope}`;
  }
  if (toolMode === "addVoltageSource_Left_Right") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Vx.l) at (-0.8,0);\n    \\draw[line width=0.32mm] (-0.8,0) -- (-0.65,0);\n    \\draw[line width=0.32mm] (-0.4,0) circle (0.25cm);\n    \\node[above=0.15cm] at (-0.4,0.13) {\\normalsize $v$};\n    \\draw[line width=0.32mm, line cap=round] (-0.15,0) -- (0,0);\n    \\coordinate (node_Vx.r) at (0,0);\n    \\draw[line width=0.32mm] (-0.84,-0.41) -- (-0.66,-0.41);\n    \\draw[line width=0.32mm] (-0.75,-0.32) -- (-0.75,-0.50);\n    \\draw[line width=0.32mm] (-0.19,-0.41) -- (-0.01,-0.41);\n  \\end{scope}`;
  }

  // Current Arrows
  if (toolMode === "addCurrentArrow_Right_Left" || toolMode === "addCurrentArrow_H_Left") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ax.l) at (0,0);\n    \\draw[-{Triangle[length=3.5mm, width=2mm]}, line width=0.32mm] (0,0) -- (0.6,0);\n    \\node[above=0.08cm] at (0.3,0) {$i$};\n    \\draw[line width=0.32mm, line cap=round] (0.5,0) -- (0.8,0);\n    \\coordinate (node_Ax.r) at (0.8,0);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentArrow_Right_Right" || toolMode === "addCurrentArrow_H_Right") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ax.l) at (-0.8,0);\n    \\draw[-{Triangle[length=3.5mm, width=2mm]}, line width=0.32mm] (-0.8,0) -- (-0.2,0);\n    \\node[above=0.08cm] at (-0.5,0) {$i$};\n    \\draw[line width=0.32mm, line cap=round] (-0.3,0) -- (0,0);\n    \\coordinate (node_Ax.r) at (0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentArrow_Left_Left") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ax.l) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0.3,0);\n    \\draw[-{Triangle[length=3.5mm, width=2mm]}, line width=0.32mm] (0.8,0) -- (0.2,0);\n    \\node[above=0.08cm] at (0.5,0) {$i$};\n    \\coordinate (node_Ax.r) at (0.8,0);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentArrow_Left_Right") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ax.l) at (-0.8,0);\n    \\draw[line width=0.32mm, line cap=round] (-0.8,0) -- (-0.5,0);\n    \\draw[-{Triangle[length=3.5mm, width=2mm]}, line width=0.32mm] (0,0) -- (-0.6,0);\n    \\node[above=0.08cm] at (-0.3,0) {$i$};\n    \\coordinate (node_Ax.r) at (0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentArrow_Down_Top" || toolMode === "addCurrentArrow_V_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ax.top) at (0,0);\n    \\draw[-{Triangle[length=3.5mm, width=2mm]}, line width=0.32mm] (0,0) -- (0,-0.6);\n    \\node[right=0.15cm] at (0,-0.3) {$i$};\n    \\draw[line width=0.32mm, line cap=round] (0,-0.5) -- (0,-0.8);\n    \\coordinate (node_Ax.bottom) at (0,-0.8);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentArrow" || toolMode === "addCurrentArrow_Down_Bottom" || toolMode === "addCurrentArrow_V_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ax.top) at (0,0.8);\n    \\draw[-{Triangle[length=3.5mm, width=2mm]}, line width=0.32mm] (0,0.8) -- (0,0.2);\n    \\node[right=0.15cm] at (0,0.5) {$i$};\n    \\draw[line width=0.32mm, line cap=round] (0,0.3) -- (0,0);\n    \\coordinate (node_Ax.bottom) at (0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentArrow_Up_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ax.top) at (0,0);\n    \\draw[line width=0.32mm, line cap=round] (0,0) -- (0,-0.3);\n    \\draw[-{Triangle[length=3.5mm, width=2mm]}, line width=0.32mm] (0,-0.8) -- (0,-0.2);\n    \\node[right=0.15cm] at (0,-0.5) {$i$};\n    \\coordinate (node_Ax.bottom) at (0,-0.8);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentArrow_Up_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ax.top) at (0,0.8);\n    \\draw[line width=0.32mm, line cap=round] (0,0.8) -- (0,0.5);\n    \\draw[-{Triangle[length=3.5mm, width=2mm]}, line width=0.32mm] (0,0) -- (0,0.6);\n    \\node[right=0.15cm] at (0,0.3) {$i$};\n    \\coordinate (node_Ax.bottom) at (0,0);\n  \\end{scope}`;
  }

  // Wire Leads
  if (toolMode === "addWireLead" || toolMode === "addWireLead_V_Top") {
    const topY = (parseFloat(yCm) + 0.3).toFixed(2);
    return `\\draw[line width=0.32mm, line cap=round] (${xCm},${yCm}) -- (${xCm},${topY});`;
  }
  if (toolMode === "addWireLead_V_Bottom") {
    const bottomY = (parseFloat(yCm) - 0.3).toFixed(2);
    return `\\draw[line width=0.32mm, line cap=round] (${xCm},${yCm}) -- (${xCm},${bottomY});`;
  }
  if (toolMode === "addWireLead_H_Left") {
    const leftX = (parseFloat(xCm) - 0.3).toFixed(2);
    return `\\draw[line width=0.32mm, line cap=round] (${xCm},${yCm}) -- (${leftX},${yCm});`;
  }
  if (toolMode === "addWireLead_H_Right") {
    const rightX = (parseFloat(xCm) + 0.3).toFixed(2);
    return `\\draw[line width=0.32mm, line cap=round] (${xCm},${yCm}) -- (${rightX},${yCm});`;
  }

  return null;
}

/** Matches the placeholder instance id every component template ships with (`node_Rx`, `node_Mx`, ...). */
const PLACEHOLDER_NODE_ID = /\bnode_([A-Za-z]+)x\b/;

/**
 * Next free instance index for a component family, derived from the ids already in the
 * document: `node_R1`, `node_R2` -> 3. Returns 1 when the family is unused.
 */
export function nextCircuitInstanceIndex(source: string, family: string): number {
  const used = new Set<number>();
  const pattern = new RegExp(`\\bnode_${family}(\\d+)\\b`, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    used.add(Number(match[1]));
  }
  let index = 1;
  while (used.has(index)) {
    index += 1;
  }
  return index;
}

/**
 * Rewrites a component snippet's placeholder ids (`node_Rx`, `node_Mx`, ...) to the next
 * free index for that family, so placing a second component of the same kind no longer
 * emits colliding `\coordinate` names. Labels following the same family+index convention
 * are renumbered with it, and the rewrite always emits a *braced* subscript so multi-digit
 * indices stay inside the subscript (`$M_{1}$` -> `$M_{10}$`, never `$M_10$`, which TeX
 * would typeset as a subscripted "1" followed by a full-size "0"). Both the braced form the
 * templates ship (`$M_{1}$`) and any legacy unbraced form already in a snippet (`$M_1$`) are
 * matched and normalised to the braced form. Unrelated labels (`$R_{D}$`, `$i$`, `$V_{out}$`)
 * are left untouched. Snippets without a placeholder id (GND, VDD) are returned unchanged.
 */
export function assignUniqueCircuitInstanceIndex(snippet: string, source: string): string {
  const familyMatch = PLACEHOLDER_NODE_ID.exec(snippet);
  if (!familyMatch) {
    return snippet;
  }
  const family = familyMatch[1];
  const index = nextCircuitInstanceIndex(source, family);
  return snippet
    .replace(new RegExp(`\\bnode_${family}x\\b`, "g"), `node_${family}${index}`)
    // Braced or bare subscript, family`_`<digits>: re-emit braced so the braces grow with the index.
    .replace(new RegExp(`\\$${family}_(?:\\{\\d+\\}|\\d+)\\$`, "g"), `$${family}_{${index}}$`);
}
