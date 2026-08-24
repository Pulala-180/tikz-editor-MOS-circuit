import type { ToolMode } from "../../store/types";

export function getCircuitComponentSnippet(toolMode: ToolMode, xCm: string, yCm: string): string | null {
  if (toolMode === "addResistor" || toolMode === "addResistor_H_Left") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Rx.l) at (0,0);\n    \\draw[thick, line cap=round] (0,0) -- (0.15,0) -- (0.19,0.15) -- (0.27,-0.15) -- (0.35,0.15) -- (0.43,-0.15) -- (0.51,0.15) -- (0.59,-0.15) -- (0.63,0) -- (0.78,0);\n    \\node at (0.39,0.35) {$R_D$};\n    \\coordinate (node_Rx.r) at (0.78,0);\n  \\end{scope}`;
  }
  if (toolMode === "addResistor_H_Right") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Rx.l) at (-0.78,0);\n    \\draw[thick, line cap=round] (-0.78,0) -- (-0.63,0) -- (-0.59,0.15) -- (-0.51,-0.15) -- (-0.43,0.15) -- (-0.35,-0.15) -- (-0.27,0.15) -- (-0.19,-0.15) -- (-0.15,0) -- (0,0);\n    \\node at (-0.39,0.35) {$R_D$};\n    \\coordinate (node_Rx.r) at (0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addResistor_V_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Rx.t) at (0,0);\n    \\draw[thick, line cap=round] (0,0) -- (0,-0.15) -- (0.15,-0.19) -- (-0.15,-0.27) -- (0.15,-0.35) -- (-0.15,-0.43) -- (0.15,-0.51) -- (-0.15,-0.59) -- (0,-0.63) -- (0,-0.78);\n    \\node[right] at (0.25,-0.39) {$R_D$};\n    \\coordinate (node_Rx.b) at (0,-0.78);\n  \\end{scope}`;
  }
  if (toolMode === "addResistor_V_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Rx.b) at (0,0);\n    \\draw[thick, line cap=round] (0,0) -- (0,0.15) -- (0.15,0.19) -- (-0.15,0.27) -- (0.15,0.35) -- (-0.15,0.43) -- (0.15,0.51) -- (-0.15,0.59) -- (0,0.63) -- (0,0.78);\n    \\node[right] at (0.25,0.39) {$R_D$};\n    \\coordinate (node_Rx.t) at (0,0.78);\n  \\end{scope}`;
  }

  // NMOS
  if (toolMode === "addNMOS" || toolMode === "addNMOS_Left_G") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.g) at (0,0);\n    \\draw[thick, line cap=round] (0,0) -- (0.26,0);\n    \\draw[ultra thick] (0.25,-0.25) -- (0.25,0.25);\n    \\draw[ultra thick] (0.41,-0.3) -- (0.41,0.3);\n    \\draw[thick, line cap=round, line join=round] (0.40,0.2) -- (0.73,0.2) -- (0.73,0.5);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, thick, line cap=round] (0.40,-0.2) -- (0.70,-0.2);\n    \\draw[thick, line cap=round] (0.73,-0.21) -- (0.73,-0.5);\n    \\node[node font=\\sffamily\\bfseries] at (1.04,0) {$M_1$};\n    \\coordinate (node_Mx.d) at (0.73,0.5);\n    \\coordinate (node_Mx.s) at (0.73,-0.5);\n  \\end{scope}`;
  }
  if (toolMode === "addNMOS_Left_D") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.d) at (0,0);\n    \\draw[thick, line cap=round] (-0.73,-0.5) -- (-0.47,-0.5);\n    \\draw[ultra thick] (-0.48,-0.75) -- (-0.48,-0.25);\n    \\draw[ultra thick] (-0.32,-0.8) -- (-0.32,-0.2);\n    \\draw[thick, line cap=round, line join=round] (-0.33,-0.3) -- (0,-0.3) -- (0,0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, thick, line cap=round] (-0.33,-0.7) -- (-0.03,-0.7);\n    \\draw[thick, line cap=round] (0,-0.71) -- (0,-1.0);\n    \\node[node font=\\sffamily\\bfseries] at (0.31,-0.5) {$M_1$};\n    \\coordinate (node_Mx.g) at (-0.73,-0.5);\n    \\coordinate (node_Mx.s) at (0,-1.0);\n  \\end{scope}`;
  }
  if (toolMode === "addNMOS_Left_S") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.s) at (0,0);\n    \\draw[thick, line cap=round] (-0.73,0.5) -- (-0.47,0.5);\n    \\draw[ultra thick] (-0.48,0.25) -- (-0.48,0.75);\n    \\draw[ultra thick] (-0.32,0.2) -- (-0.32,0.8);\n    \\draw[thick, line cap=round, line join=round] (-0.33,0.7) -- (0,0.7) -- (0,1.0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, thick, line cap=round] (-0.33,0.3) -- (-0.03,0.3);\n    \\draw[thick, line cap=round] (0,0.29) -- (0,0);\n    \\node[node font=\\sffamily\\bfseries] at (0.31,0.5) {$M_1$};\n    \\coordinate (node_Mx.d) at (0,1.0);\n    \\coordinate (node_Mx.g) at (-0.73,0.5);\n  \\end{scope}`;
  }
  if (toolMode === "addNMOS_Right_G") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.g) at (0,0);\n    \\draw[thick, line cap=round] (0,0) -- (-0.26,0);\n    \\draw[ultra thick] (-0.25,-0.25) -- (-0.25,0.25);\n    \\draw[ultra thick] (-0.41,-0.3) -- (-0.41,0.3);\n    \\draw[thick, line cap=round, line join=round] (-0.40,0.2) -- (-0.73,0.2) -- (-0.73,0.5);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, thick, line cap=round] (-0.40,-0.2) -- (-0.70,-0.2);\n    \\draw[thick, line cap=round] (-0.73,-0.21) -- (-0.73,-0.5);\n    \\node[node font=\\sffamily\\bfseries] at (-1.04,0) {$M_1$};\n    \\coordinate (node_Mx.d) at (-0.73,0.5);\n    \\coordinate (node_Mx.s) at (-0.73,-0.5);\n  \\end{scope}`;
  }
  if (toolMode === "addNMOS_Right_D") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.d) at (0,0);\n    \\draw[thick, line cap=round] (0.73,-0.5) -- (0.47,-0.5);\n    \\draw[ultra thick] (0.48,-0.75) -- (0.48,-0.25);\n    \\draw[ultra thick] (0.32,-0.8) -- (0.32,-0.2);\n    \\draw[thick, line cap=round, line join=round] (0.33,-0.3) -- (0,-0.3) -- (0,0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, thick, line cap=round] (0.33,-0.7) -- (0.03,-0.7);\n    \\draw[thick, line cap=round] (0,-0.71) -- (0,-1.0);\n    \\node[node font=\\sffamily\\bfseries] at (-0.31,-0.5) {$M_1$};\n    \\coordinate (node_Mx.g) at (0.73,-0.5);\n    \\coordinate (node_Mx.s) at (0,-1.0);\n  \\end{scope}`;
  }
  if (toolMode === "addNMOS_Right_S") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.s) at (0,0);\n    \\draw[thick, line cap=round] (0.73,0.5) -- (0.47,0.5);\n    \\draw[ultra thick] (0.48,0.25) -- (0.48,0.75);\n    \\draw[ultra thick] (0.32,0.2) -- (0.32,0.8);\n    \\draw[thick, line cap=round, line join=round] (0.33,0.7) -- (0,0.7) -- (0,1.0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, thick, line cap=round] (0.33,0.3) -- (0.03,0.3);\n    \\draw[thick, line cap=round] (0,0.29) -- (0,0);\n    \\node[node font=\\sffamily\\bfseries] at (-0.31,0.5) {$M_1$};\n    \\coordinate (node_Mx.d) at (0,1.0);\n    \\coordinate (node_Mx.g) at (0.73,0.5);\n  \\end{scope}`;
  }

  // PMOS
  if (toolMode === "addPMOS" || toolMode === "addPMOS_Left_G") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.g) at (0,0);\n    \\draw[thick, line cap=round] (0,0) -- (0.26,0);\n    \\draw[ultra thick] (0.25,-0.25) -- (0.25,0.25);\n    \\draw[ultra thick] (0.41,-0.3) -- (0.41,0.3);\n    \\draw[thick, line cap=round, line join=round] (0.40,-0.2) -- (0.73,-0.2) -- (0.73,-0.5);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, thick, line cap=round] (0.73,0.2) -- (0.44,0.2);\n    \\draw[thick, line cap=round] (0.73,0.5) -- (0.73,0.2);\n    \\node[node font=\\sffamily\\bfseries] at (1.04,0) {$M_1$};\n    \\coordinate (node_Mx.d) at (0.73,-0.5);\n    \\coordinate (node_Mx.s) at (0.73,0.5);\n  \\end{scope}`;
  }
  if (toolMode === "addPMOS_Left_D") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.d) at (0,0);\n    \\draw[thick, line cap=round] (-0.73,0.5) -- (-0.47,0.5);\n    \\draw[ultra thick] (-0.48,0.25) -- (-0.48,0.75);\n    \\draw[ultra thick] (-0.32,0.2) -- (-0.32,0.8);\n    \\draw[thick, line cap=round, line join=round] (-0.33,0.3) -- (0,0.3) -- (0,0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, thick, line cap=round] (0,0.7) -- (-0.29,0.7);\n    \\draw[thick, line cap=round] (0,1.0) -- (0,0.7);\n    \\node[node font=\\sffamily\\bfseries] at (0.31,0.5) {$M_1$};\n    \\coordinate (node_Mx.g) at (-0.73,0.5);\n    \\coordinate (node_Mx.s) at (0,1.0);\n  \\end{scope}`;
  }
  if (toolMode === "addPMOS_Left_S") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.s) at (0,0);\n    \\draw[thick, line cap=round] (-0.73,-0.5) -- (-0.47,-0.5);\n    \\draw[ultra thick] (-0.48,-0.75) -- (-0.48,-0.25);\n    \\draw[ultra thick] (-0.32,-0.8) -- (-0.32,-0.2);\n    \\draw[thick, line cap=round, line join=round] (-0.33,-0.7) -- (0,-0.7) -- (0,-1.0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, thick, line cap=round] (0,-0.3) -- (-0.29,-0.3);\n    \\draw[thick, line cap=round] (0,0) -- (0,-0.3);\n    \\node[node font=\\sffamily\\bfseries] at (0.31,-0.5) {$M_1$};\n    \\coordinate (node_Mx.g) at (-0.73,-0.5);\n    \\coordinate (node_Mx.d) at (0,-1.0);\n  \\end{scope}`;
  }
  if (toolMode === "addPMOS_Right_G") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.g) at (0,0);\n    \\draw[thick, line cap=round] (0,0) -- (-0.26,0);\n    \\draw[ultra thick] (-0.25,-0.25) -- (-0.25,0.25);\n    \\draw[ultra thick] (-0.41,-0.3) -- (-0.41,0.3);\n    \\draw[thick, line cap=round, line join=round] (-0.40,-0.2) -- (-0.73,-0.2) -- (-0.73,-0.5);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, thick, line cap=round] (-0.73,0.2) -- (-0.44,0.2);\n    \\draw[thick, line cap=round] (-0.73,0.5) -- (-0.73,0.2);\n    \\node[node font=\\sffamily\\bfseries] at (-1.04,0) {$M_1$};\n    \\coordinate (node_Mx.d) at (-0.73,-0.5);\n    \\coordinate (node_Mx.s) at (-0.73,0.5);\n  \\end{scope}`;
  }
  if (toolMode === "addPMOS_Right_D") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.d) at (0,0);\n    \\draw[thick, line cap=round] (0.73,0.5) -- (0.47,0.5);\n    \\draw[ultra thick] (0.48,0.25) -- (0.48,0.75);\n    \\draw[ultra thick] (0.32,0.2) -- (0.32,0.8);\n    \\draw[thick, line cap=round, line join=round] (0.33,0.3) -- (0,0.3) -- (0,0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, thick, line cap=round] (0,0.7) -- (0.29,0.7);\n    \\draw[thick, line cap=round] (0,1.0) -- (0,0.7);\n    \\node[node font=\\sffamily\\bfseries] at (-0.31,0.5) {$M_1$};\n    \\coordinate (node_Mx.g) at (0.73,0.5);\n    \\coordinate (node_Mx.s) at (0,1.0);\n  \\end{scope}`;
  }
  if (toolMode === "addPMOS_Right_S") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Mx.s) at (0,0);\n    \\draw[thick, line cap=round] (0.73,-0.5) -- (0.47,-0.5);\n    \\draw[ultra thick] (0.48,-0.75) -- (0.48,-0.25);\n    \\draw[ultra thick] (0.32,-0.8) -- (0.32,-0.2);\n    \\draw[thick, line cap=round, line join=round] (0.33,-0.7) -- (0,-0.7) -- (0,-1.0);\n    \\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, thick, line cap=round] (0,-0.3) -- (0.29,-0.3);\n    \\draw[thick, line cap=round] (0,0) -- (0,-0.3);\n    \\node[node font=\\sffamily\\bfseries] at (-0.31,-0.5) {$M_1$};\n    \\coordinate (node_Mx.g) at (0.73,-0.5);\n    \\coordinate (node_Mx.d) at (0,-1.0);\n  \\end{scope}`;
  }

  // Dot Node
  if (toolMode === "addDotNode") {
    return `\\draw[thick, fill=black] (${xCm},${yCm}) circle (0.06);`;
  }

  // IO Nodes
  if (toolMode === "addIoNode" || toolMode === "addIoNode_Vin_Left") {
    const scopeX = (parseFloat(xCm) - 0.6).toFixed(2);
    return `\\begin{scope}[shift={(${scopeX},${yCm})}]\n    \\node at (-0.01,-0.30) {$V_{in}$};\n    \\draw[thick, line cap=round] (0.15,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.6,0);\n    \\coordinate (node_IOx.port) at (0.6,0);\n  \\end{scope}`;
  }
  if (toolMode === "addIoNode_Vin_Right") {
    const scopeX = (parseFloat(xCm) - 0.15).toFixed(2);
    return `\\begin{scope}[shift={(${scopeX},${yCm})}]\n    \\node at (0.85,-0.30) {$V_{in}$};\n    \\draw[thick, line cap=round] (0.6,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.15,0);\n    \\coordinate (node_IOx.port) at (0.15,0);\n  \\end{scope}`;
  }
  if (toolMode === "addIoNode_Vout_Left") {
    const scopeX = (parseFloat(xCm) - 0.6).toFixed(2);
    return `\\begin{scope}[shift={(${scopeX},${yCm})}]\n    \\node at (-0.01,-0.30) {$V_{out}$};\n    \\draw[thick, line cap=round] (0.15,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.6,0);\n    \\coordinate (node_IOx.port) at (0.6,0);\n  \\end{scope}`;
  }
  if (toolMode === "addIoNode_Vout_Right") {
    const scopeX = (parseFloat(xCm) - 0.15).toFixed(2);
    return `\\begin{scope}[shift={(${scopeX},${yCm})}]\n    \\node at (0.85,-0.30) {$V_{out}$};\n    \\draw[thick, line cap=round] (0.6,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.15,0);\n    \\coordinate (node_IOx.port) at (0.15,0);\n  \\end{scope}`;
  }

  // VDD
  if (toolMode === "addVDD") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_VDD.bottom) at (0,0);\n    \\draw[thick, line cap=round] (0,0) -- (0,0.22);\n    \\draw[ultra thick] (-0.95,0.22) -- (0.9,0.22);\n    \\node[draw=none] at (1.2,0.22) {$V_{DD}$};\n  \\end{scope}`;
  }

  // Capacitors
  if (toolMode === "addCapacitor" || toolMode === "addCapacitor_H_Left") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Cx.l) at (0,0);\n    \\draw[thick, line cap=round] (0,0) -- (0.2,0);\n    \\draw[ultra thick] (0.2,-0.25) -- (0.2,0.25);\n    \\draw[ultra thick] (0.36,-0.25) -- (0.36,0.25);\n    \\draw[thick, line cap=round] (0.36,0) -- (0.56,0);\n    \\coordinate (node_Cx.r) at (0.56,0);\n    \\node at (0.2,0.52) {$C_{gd}$};\n  \\end{scope}`;
  }
  if (toolMode === "addCapacitor_H_Right") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Cx.l) at (-0.56,0);\n    \\draw[thick, line cap=round] (-0.56,0) -- (-0.36,0);\n    \\draw[ultra thick] (-0.36,-0.25) -- (-0.36,0.25);\n    \\draw[ultra thick] (-0.2,-0.25) -- (-0.2,0.25);\n    \\draw[thick, line cap=round] (-0.2,0) -- (0,0);\n    \\coordinate (node_Cx.r) at (0,0);\n    \\node at (-0.36,0.52) {$C_{gd}$};\n  \\end{scope}`;
  }
  if (toolMode === "addCapacitor_V_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Cx.t) at (0,0);\n    \\draw[thick, line cap=round] (0,0) -- (0,-0.2);\n    \\draw[ultra thick] (-0.25,-0.2) -- (0.25,-0.2);\n    \\draw[ultra thick] (-0.25,-0.36) -- (0.25,-0.36);\n    \\draw[thick, line cap=round] (0,-0.36) -- (0,-0.56);\n    \\coordinate (node_Cx.b) at (0,-0.56);\n    \\node at (0.52,-0.28) {$C_{gd}$};\n  \\end{scope}`;
  }
  if (toolMode === "addCapacitor_V_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Cx.b) at (0,0);\n    \\draw[thick, line cap=round] (0,0) -- (0,0.2);\n    \\draw[ultra thick] (-0.25,0.2) -- (0.25,0.2);\n    \\draw[ultra thick] (-0.25,0.36) -- (0.25,0.36);\n    \\draw[thick, line cap=round] (0,0.36) -- (0,0.56);\n    \\coordinate (node_Cx.t) at (0,0.56);\n    \\node at (0.52,0.28) {$C_{gd}$};\n  \\end{scope}`;
  }

  // GND
  if (toolMode === "addGND" || toolMode === "addGND_V_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_GND.top) at (0,0);\n    \\draw[thick, line cap=round] (0,0) -- (0,-0.21);\n    \\draw[ultra thick] (-0.17,-0.21) -- (0.17,-0.21);\n    \\draw[ultra thick] (-0.11,-0.35) -- (0.11,-0.35);\n    \\draw[ultra thick] (-0.08,-0.49) -- (0.08,-0.49);\n  \\end{scope}`;
  }
  if (toolMode === "addGND_V_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_GND.bottom) at (0,0);\n    \\draw[thick, line cap=round] (0,0) -- (0,0.21);\n    \\draw[ultra thick] (-0.17,0.21) -- (0.17,0.21);\n    \\draw[ultra thick] (-0.11,0.35) -- (0.11,0.35);\n    \\draw[ultra thick] (-0.08,0.49) -- (0.08,0.49);\n  \\end{scope}`;
  }
  if (toolMode === "addGND_H_Left") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_GND.l) at (0,0);\n    \\draw[thick, line cap=round] (0,0) -- (0.21,0);\n    \\draw[ultra thick] (0.21,-0.17) -- (0.21,0.17);\n    \\draw[ultra thick] (0.35,-0.11) -- (0.35,0.11);\n    \\draw[ultra thick] (0.49,-0.08) -- (0.49,0.08);\n  \\end{scope}`;
  }
  if (toolMode === "addGND_H_Right") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_GND.r) at (0,0);\n    \\draw[thick, line cap=round] (0,0) -- (-0.21,0);\n    \\draw[ultra thick] (-0.21,-0.17) -- (-0.21,0.17);\n    \\draw[ultra thick] (-0.35,-0.11) -- (-0.35,0.11);\n    \\draw[ultra thick] (-0.49,-0.08) -- (-0.49,0.08);\n  \\end{scope}`;
  }

  // Current Sources
  if (toolMode === "addCurrentSource_Right_Left" || toolMode === "addCurrentSource_H_Left") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.l) at (0,0);\n    \\draw[thick] (0,0) -- (0.15,0);\n    \\draw[thick] (0.4,0) circle (0.25cm);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (0.25,0) -- (0.55,0);\n    \\node[above=0.15cm] at (0.4,0.25) {\\normalsize $i$};\n    \\draw[thick, line cap=round] (0.65,0) -- (0.8,0);\n    \\coordinate (node_Ix.r) at (0.8,0);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentSource_Right_Right" || toolMode === "addCurrentSource_H_Right") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.l) at (-0.8,0);\n    \\draw[thick] (-0.8,0) -- (-0.65,0);\n    \\draw[thick] (-0.4,0) circle (0.25cm);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (-0.55,0) -- (-0.25,0);\n    \\node[above=0.15cm] at (-0.4,0.25) {\\normalsize $i$};\n    \\draw[thick, line cap=round] (-0.15,0) -- (0,0);\n    \\coordinate (node_Ix.r) at (0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentSource_Left_Left") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.l) at (0,0);\n    \\draw[thick] (0,0) -- (0.15,0);\n    \\draw[thick] (0.4,0) circle (0.25cm);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (0.55,0) -- (0.25,0);\n    \\node[above=0.15cm] at (0.4,0.25) {\\normalsize $i$};\n    \\draw[thick, line cap=round] (0.65,0) -- (0.8,0);\n    \\coordinate (node_Ix.r) at (0.8,0);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentSource_Left_Right") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.l) at (-0.8,0);\n    \\draw[thick] (-0.8,0) -- (-0.65,0);\n    \\draw[thick] (-0.4,0) circle (0.25cm);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (-0.25,0) -- (-0.55,0);\n    \\node[above=0.15cm] at (-0.4,0.25) {\\normalsize $i$};\n    \\draw[thick, line cap=round] (-0.15,0) -- (0,0);\n    \\coordinate (node_Ix.r) at (0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentSource_Down_Top" || toolMode === "addCurrentSource_V_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.top) at (0,0);\n    \\draw[thick] (0,0) -- (0,-0.15);\n    \\draw[thick] (0,-0.4) circle (0.25cm);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (0,-0.25) -- (0,-0.55);\n    \\node[right=0.15cm] at (0.15,-0.41) {\\normalsize $i$};\n    \\draw[thick, line cap=round] (0,-0.65) -- (0,-0.8);\n    \\coordinate (node_Ix.bottom) at (0,-0.8);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentSource" || toolMode === "addCurrentSource_Down_Bottom" || toolMode === "addCurrentSource_V_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.bottom) at (0,0);\n    \\draw[thick] (0,0.8) -- (0,0.65);\n    \\draw[thick] (0,0.4) circle (0.25cm);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (0,0.55) -- (0,0.25);\n    \\node[right=0.15cm] at (0.15,0.39) {\\normalsize $i$};\n    \\draw[thick, line cap=round] (0,0.15) -- (0,0);\n    \\coordinate (node_Ix.top) at (0,0.8);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentSource_Up_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.top) at (0,0);\n    \\draw[thick] (0,0) -- (0,-0.15);\n    \\draw[thick] (0,-0.4) circle (0.25cm);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (0,-0.55) -- (0,-0.25);\n    \\node[right=0.15cm] at (0.15,-0.41) {\\normalsize $i$};\n    \\draw[thick, line cap=round] (0,-0.65) -- (0,-0.8);\n    \\coordinate (node_Ix.bottom) at (0,-0.8);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentSource_Up_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ix.bottom) at (0,0);\n    \\draw[thick] (0,0.8) -- (0,0.65);\n    \\draw[thick] (0,0.4) circle (0.25cm);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (0,0.25) -- (0,0.55);\n    \\node[right=0.15cm] at (0.15,0.39) {\\normalsize $i$};\n    \\draw[thick, line cap=round] (0,0.15) -- (0,0);\n    \\coordinate (node_Ix.top) at (0,0.8);\n  \\end{scope}`;
  }

  // Voltage Sources
  if (toolMode === "addVoltageSource" || toolMode === "addVoltageSource_Up_Top" || toolMode === "addVoltageSource_V_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Vx.top) at (0,0);\n    \\draw[thick] (0,0) -- (0,-0.15);\n    \\draw[thick] (0,-0.4) circle (0.25cm);\n    \\node[right=0.15cm] at (-0.93,-0.4) {\\normalsize $v$};\n    \\draw[thick, line cap=round] (0,-0.65) -- (0,-0.8);\n    \\coordinate (node_Vx.bottom) at (0,-0.8);\n    \\draw[thick] (0.35,-0.27) -- (0.35,-0.13);\n    \\draw[thick] (0.28,-0.2) -- (0.42,-0.2);\n    \\draw[thick] (0.28,-0.6) -- (0.42,-0.6);\n  \\end{scope}`;
  }
  if (toolMode === "addVoltageSource_Down_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Vx.top) at (0,0);\n    \\draw[thick] (0,0) -- (0,-0.15);\n    \\draw[thick] (0,-0.4) circle (0.25cm);\n    \\node[right=0.15cm] at (-0.93,-0.4) {\\normalsize $v$};\n    \\draw[thick, line cap=round] (0,-0.65) -- (0,-0.8);\n    \\coordinate (node_Vx.bottom) at (0,-0.8);\n    \\draw[thick] (0.28,-0.2) -- (0.42,-0.2);\n    \\draw[thick] (0.35,-0.67) -- (0.35,-0.53);\n    \\draw[thick] (0.28,-0.6) -- (0.42,-0.6);\n  \\end{scope}`;
  }
  if (toolMode === "addVoltageSource_Up_Bottom" || toolMode === "addVoltageSource_V_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Vx.bottom) at (0,0);\n    \\draw[thick] (0,0.8) -- (0,0.65);\n    \\draw[thick] (0,0.4) circle (0.25cm);\n    \\node[right=0.15cm] at (-0.93,0.4) {\\normalsize $v$};\n    \\draw[thick, line cap=round] (0,0.15) -- (0,0);\n    \\coordinate (node_Vx.top) at (0,0.8);\n    \\draw[thick] (0.35,0.53) -- (0.35,0.67);\n    \\draw[thick] (0.28,0.6) -- (0.42,0.6);\n    \\draw[thick] (0.28,0.2) -- (0.42,0.2);\n  \\end{scope}`;
  }
  if (toolMode === "addVoltageSource_Down_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Vx.bottom) at (0,0);\n    \\draw[thick] (0,0.8) -- (0,0.65);\n    \\draw[thick] (0,0.4) circle (0.25cm);\n    \\node[right=0.15cm] at (-0.93,0.4) {\\normalsize $v$};\n    \\draw[thick, line cap=round] (0,0.15) -- (0,0);\n    \\coordinate (node_Vx.top) at (0,0.8);\n    \\draw[thick] (0.28,0.6) -- (0.42,0.6);\n    \\draw[thick] (0.35,0.13) -- (0.35,0.27);\n    \\draw[thick] (0.28,0.2) -- (0.42,0.2);\n  \\end{scope}`;
  }
  if (toolMode === "addVoltageSource_Right_Left" || toolMode === "addVoltageSource_H_Left") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Vx.l) at (0,0);\n    \\draw[thick] (0,0) -- (0.15,0);\n    \\draw[thick] (0.4,0) circle (0.25cm);\n    \\node[above=0.15cm] at (0.4,0.13) {\\normalsize $v$};\n    \\draw[thick, line cap=round] (0.65,0) -- (0.8,0);\n    \\coordinate (node_Vx.r) at (0.8,0);\n    \\draw[thick] (0.65,-0.38) -- (0.65,-0.24);\n    \\draw[thick] (0.58,-0.31) -- (0.72,-0.31);\n    \\draw[thick] (0.1,-0.31) -- (0.24,-0.31);\n  \\end{scope}`;
  }
  if (toolMode === "addVoltageSource_Left_Left") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Vx.l) at (0,0);\n    \\draw[thick] (0,0) -- (0.15,0);\n    \\draw[thick] (0.4,0) circle (0.25cm);\n    \\node[above=0.15cm] at (0.4,0.13) {\\normalsize $v$};\n    \\draw[thick, line cap=round] (0.65,0) -- (0.8,0);\n    \\coordinate (node_Vx.r) at (0.8,0);\n    \\draw[thick] (0.17,-0.38) -- (0.17,-0.24);\n    \\draw[thick] (0.10,-0.31) -- (0.24,-0.31);\n    \\draw[thick] (0.58,-0.31) -- (0.72,-0.31);\n  \\end{scope}`;
  }
  if (toolMode === "addVoltageSource_Right_Right" || toolMode === "addVoltageSource_H_Right") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Vx.l) at (-0.8,0);\n    \\draw[thick] (-0.8,0) -- (-0.65,0);\n    \\draw[thick] (-0.4,0) circle (0.25cm);\n    \\node[above=0.15cm] at (-0.4,0.13) {\\normalsize $v$};\n    \\draw[thick, line cap=round] (-0.15,0) -- (0,0);\n    \\coordinate (node_Vx.r) at (0,0);\n    \\draw[thick] (-0.15,-0.38) -- (-0.15,-0.24);\n    \\draw[thick] (-0.22,-0.31) -- (-0.08,-0.31);\n    \\draw[thick] (-0.7,-0.31) -- (-0.56,-0.31);\n  \\end{scope}`;
  }
  if (toolMode === "addVoltageSource_Left_Right") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Vx.l) at (-0.8,0);\n    \\draw[thick] (-0.8,0) -- (-0.65,0);\n    \\draw[thick] (-0.4,0) circle (0.25cm);\n    \\node[above=0.15cm] at (-0.4,0.13) {\\normalsize $v$};\n    \\draw[thick, line cap=round] (-0.15,0) -- (0,0);\n    \\coordinate (node_Vx.r) at (0,0);\n    \\draw[thick] (-0.63,-0.38) -- (-0.63,-0.24);\n    \\draw[thick] (-0.70,-0.31) -- (-0.56,-0.31);\n    \\draw[thick] (-0.22,-0.31) -- (-0.08,-0.31);\n  \\end{scope}`;
  }

  // Current Arrows
  if (toolMode === "addCurrentArrow_Right_Left" || toolMode === "addCurrentArrow_H_Left") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ax.l) at (0,0);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (0,0) -- (0.3,0);\n    \\node[above=0.08cm] at (0.15,0) {$i$};\n    \\draw[thick, line cap=round] (0.3,0) -- (0.4,0);\n    \\coordinate (node_Ax.r) at (0.4,0);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentArrow_Right_Right" || toolMode === "addCurrentArrow_H_Right") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ax.l) at (-0.4,0);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (-0.4,0) -- (-0.1,0);\n    \\node[above=0.08cm] at (-0.25,0) {$i$};\n    \\draw[thick, line cap=round] (-0.1,0) -- (0,0);\n    \\coordinate (node_Ax.r) at (0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentArrow_Left_Left") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ax.l) at (0,0);\n    \\draw[thick, line cap=round] (0,0) -- (0.1,0);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (0.4,0) -- (0.1,0);\n    \\node[above=0.08cm] at (0.25,0) {$i$};\n    \\coordinate (node_Ax.r) at (0.4,0);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentArrow_Left_Right") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ax.l) at (-0.4,0);\n    \\draw[thick, line cap=round] (-0.4,0) -- (-0.3,0);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (0,0) -- (-0.3,0);\n    \\node[above=0.08cm] at (-0.15,0) {$i$};\n    \\coordinate (node_Ax.r) at (0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentArrow_Down_Top" || toolMode === "addCurrentArrow_V_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ax.top) at (0,0);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (0,0) -- (0,-0.3);\n    \\node[right=0.15cm] at (-0.07,-0.19) {$i$};\n    \\draw[thick, line cap=round] (0,-0.3) -- (0,-0.4);\n    \\coordinate (node_Ax.bottom) at (0,-0.4);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentArrow" || toolMode === "addCurrentArrow_Down_Bottom" || toolMode === "addCurrentArrow_V_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ax.top) at (0,0.4);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (0,0.4) -- (0,0.1);\n    \\node[right=0.15cm] at (-0.07,0.21) {$i$};\n    \\draw[thick, line cap=round] (0,0.1) -- (0,0);\n    \\coordinate (node_Ax.bottom) at (0,0);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentArrow_Up_Top") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ax.top) at (0,0);\n    \\draw[thick, line cap=round] (0,0) -- (0,-0.1);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (0,-0.4) -- (0,-0.1);\n    \\node[right=0.15cm] at (-0.07,-0.21) {$i$};\n    \\coordinate (node_Ax.bottom) at (0,-0.4);\n  \\end{scope}`;
  }
  if (toolMode === "addCurrentArrow_Up_Bottom") {
    return `\\begin{scope}[shift={(${xCm},${yCm})}]\n    \\coordinate (node_Ax.top) at (0,0.4);\n    \\draw[thick, line cap=round] (0,0.4) -- (0,0.3);\n    \\draw[-{Triangle[length=1.8mm, width=1.7mm]}, thick] (0,0) -- (0,0.3);\n    \\node[right=0.15cm] at (-0.07,0.19) {$i$};\n    \\coordinate (node_Ax.bottom) at (0,0);\n  \\end{scope}`;
  }

  // Wire Leads
  if (toolMode === "addWireLead" || toolMode === "addWireLead_V_Top") {
    const topY = (parseFloat(yCm) + 0.3).toFixed(2);
    return `\\draw[thick, line cap=round] (${xCm},${yCm}) -- (${xCm},${topY});`;
  }
  if (toolMode === "addWireLead_V_Bottom") {
    const bottomY = (parseFloat(yCm) - 0.3).toFixed(2);
    return `\\draw[thick, line cap=round] (${xCm},${yCm}) -- (${xCm},${bottomY});`;
  }
  if (toolMode === "addWireLead_H_Left") {
    const leftX = (parseFloat(xCm) - 0.3).toFixed(2);
    return `\\draw[thick, line cap=round] (${xCm},${yCm}) -- (${leftX},${yCm});`;
  }
  if (toolMode === "addWireLead_H_Right") {
    const rightX = (parseFloat(xCm) + 0.3).toFixed(2);
    return `\\draw[thick, line cap=round] (${xCm},${yCm}) -- (${rightX},${yCm});`;
  }

  return null;
}
