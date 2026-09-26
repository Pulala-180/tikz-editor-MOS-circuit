export const PT_PER_CM = 28.452756;

export interface Port {
  name: string;
  x: number; // local coordinate, cm
  y: number; // local coordinate, cm
}

export interface ComponentTemplate {
  type: string;
  ports: Port[];
  scopeOffsetPt?: [number, number];
  tikzBody: string;
  labelNode: string;
  defaultLabel: string;
  description: string;
}

const RESISTOR_BODY = String.raw`\draw[line width=0.32mm, line cap=round] (-0.35,0) -- (-0.195,0) -- (-0.1625,0.15) -- (-0.0975,-0.15) -- (-0.0325,0.15) -- (0.0325,-0.15) -- (0.0975,0.15) -- (0.1625,-0.15) -- (0.195,0) -- (0.35,0);`;
const RESISTOR_LABEL = String.raw`\node at (0.05,0.35) {LABEL};`;

const NMOS_BODY = [
  String.raw`\draw[line width=0.32mm, line cap=round] (0.3,0.5) -- (0.56,0.5);`,
  String.raw`\draw[line width=0.7mm] (0.55,0.25) -- (0.55,0.75);`,
  String.raw`\draw[line width=0.7mm] (0.7,0.2) -- (0.7,0.8);`,
  String.raw`\draw[line width=0.32mm, line cap=round, line join=round] (0.7,0.70) -- (1.03,0.70) --(1.03,1);`,
  String.raw`\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (0.7,0.3) -- (1.0,0.3);`,
  String.raw`\draw[line width=0.32mm, line cap=round] (1.03,0.291) -- (1.03,0);`
].join("\n");
const NMOS_LABEL = String.raw`\node[node font=\sffamily\bfseries] at (0,0.54) {LABEL};`;

const PMOS_BODY = [
  String.raw`\draw[line width=0.32mm, line cap=round] (0.3,0.5) -- (0.56,0.5);`,
  String.raw`\draw[line width=0.7mm] (0.55,0.25) -- (0.55,0.75);`,
  String.raw`\draw[line width=0.7mm] (0.7,0.2) -- (0.7,0.8);`,
  String.raw`\draw[line width=0.32mm, line cap=round, line join=round] (0.7,0.30) -- (1.03,0.30) --(1.03,0);`,
  String.raw`\draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (1.03,0.7) -- (0.74,0.7);`,
  String.raw`\draw[line width=0.32mm, line cap=round] (1.03,1) -- (1.03,0.7);`
].join("\n");
const PMOS_LABEL = String.raw`\node[node font=\sffamily\bfseries] at (0,0.54) {LABEL};`;

const ISOURCE_BODY = [
  String.raw`\draw[line width=0.32mm] (0, 0) circle (0.25cm);`,
  String.raw`\draw[-{Triangle[length=1.8mm, width=1.7mm]}, line width=0.32mm] {ARROW_LINE};`,
  String.raw`\draw[line width=0.32mm, line cap=round] (0,-0.25) -- (0,-0.4);`,
  String.raw`\draw[line width=0.32mm, line cap=round] (0,0.4) -- (0,0.25);`
].join("\n");
const ISOURCE_LABEL = String.raw`\node[right=0.15cm] at (0.15, -0.01) {\normalsize {LABEL}};`;

const VSOURCE_BODY = [
  String.raw`\draw[line width=0.32mm] (0, 0.4) -- (0, 0.25);`,
  String.raw`\draw[line width=0.32mm] (0, 0) circle (0.25cm);`,
  String.raw`\draw[line width=0.32mm, line cap=round] (0, -0.25) -- (0, -0.4);`,
  String.raw`\draw[line width=0.32mm] (0.32, 0.30) -- (0.50, 0.30);`,
  String.raw`\draw[line width=0.32mm] (0.41, 0.39) -- (0.41, 0.21);`,
  String.raw`\draw[line width=0.32mm] (0.32, -0.30) -- (0.50, -0.30);`
].join("\n");
const VSOURCE_LABEL = String.raw`\node[left=0.15cm] at (-0.15, 0.02) {\normalsize {LABEL}};`;

const GND_BODY = [
  String.raw`\draw[line width=0.32mm] (0,0) -- (0,-0.2);`,
  String.raw`\draw[line width=0.6mm] (-0.3,-0.2) -- (0.3,-0.2);`,
  String.raw`\draw[line width=0.45mm] (-0.2,-0.28) -- (0.2,-0.28);`,
  String.raw`\draw[line width=0.3mm] (-0.1,-0.36) -- (0.1,-0.36);`
].join("\n");

const VDD_BODY = [
  String.raw`\draw[line width=0.32mm] (0,0) -- (0,0.2);`,
  String.raw`\draw[line width=0.6mm] (-0.3,0.2) -- (0.3,0.2);`
].join("\n");
const VDD_LABEL = String.raw`\node[above=0.05cm] at (0,0.2) {\normalsize {LABEL}};`;

export const CATALOG: Record<string, ComponentTemplate> = {
  resistor: {
    type: "resistor",
    ports: [
      { name: "P1", x: -0.35, y: 0.0 },
      { name: "P2", x: 0.35, y: 0.0 }
    ],
    scopeOffsetPt: [0, 0],
    tikzBody: RESISTOR_BODY,
    labelNode: RESISTOR_LABEL,
    defaultLabel: "$R$",
    description: "电阻，水平放置，引脚 P1(左) / P2(右)"
  },
  nmos: {
    type: "nmos",
    ports: [
      { name: "G", x: 0.3, y: 0.5 },
      { name: "D", x: 1.03, y: 1.0 },
      { name: "S", x: 1.03, y: 0.0 }
    ],
    scopeOffsetPt: [-17, 4],
    tikzBody: NMOS_BODY,
    labelNode: NMOS_LABEL,
    defaultLabel: "$M$",
    description: "nMOS 场效应晶体管，引脚 G(栅) / D(漏，上) / S(源，下)"
  },
  pmos: {
    type: "pmos",
    ports: [
      { name: "G", x: 0.3, y: 0.5 },
      { name: "S", x: 1.03, y: 1.0 },
      { name: "D", x: 1.03, y: 0.0 }
    ],
    scopeOffsetPt: [-17, 4],
    tikzBody: PMOS_BODY,
    labelNode: PMOS_LABEL,
    defaultLabel: "$M$",
    description: "pMOS 场效应晶体管，引脚 G(栅) / S(源，上) / D(漏，下)"
  },
  current_source: {
    type: "current_source",
    ports: [
      { name: "top", x: 0.0, y: 0.4 },
      { name: "bottom", x: 0.0, y: -0.4 }
    ],
    scopeOffsetPt: [0, 0],
    tikzBody: ISOURCE_BODY,
    labelNode: ISOURCE_LABEL,
    defaultLabel: "$i_{in}$",
    description: "独立/受控电流源，引脚 top / bottom"
  },
  voltage_source: {
    type: "voltage_source",
    ports: [
      { name: "top", x: 0.0, y: 0.4 },
      { name: "bottom", x: 0.0, y: -0.4 }
    ],
    scopeOffsetPt: [0, 0],
    tikzBody: VSOURCE_BODY,
    labelNode: VSOURCE_LABEL,
    defaultLabel: "$v_{in}$",
    description: "独立电压源，上正下负，引脚 top / bottom"
  },
  gnd: {
    type: "gnd",
    ports: [{ name: "top", x: 0.0, y: 0.0 }],
    scopeOffsetPt: [0, 0],
    tikzBody: GND_BODY,
    labelNode: "",
    defaultLabel: "",
    description: "接地端 (GND)，引脚 top"
  },
  vdd: {
    type: "vdd",
    ports: [{ name: "bottom", x: 0.0, y: 0.0 }],
    scopeOffsetPt: [0, 0],
    tikzBody: VDD_BODY,
    labelNode: VDD_LABEL,
    defaultLabel: "$V_{DD}$",
    description: "电源端 (VDD)，引脚 bottom"
  }
};
