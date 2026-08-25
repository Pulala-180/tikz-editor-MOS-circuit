export type CircuitPortDescriptor = {
  portKey: string;
  nameZh: string;
  nameEn: string;
  priority: number;
};

export const CIRCUIT_PORT_DEFINITIONS: Record<string, CircuitPortDescriptor> = {
  // MOSFET Ports
  "d": { portKey: "d", nameZh: "漏极 (d)", nameEn: "Drain (d)", priority: 1 },
  "g": { portKey: "g", nameZh: "栅极 (g)", nameEn: "Gate (g)", priority: 2 },
  "s": { portKey: "s", nameZh: "源极 (s)", nameEn: "Source (s)", priority: 3 },
  "b_body": { portKey: "b_body", nameZh: "衬底 (b)", nameEn: "Bulk (b)", priority: 4 },

  // Passive Component 2-port
  "t": { portKey: "t", nameZh: "顶端口 (t)", nameEn: "Top (t)", priority: 1 },
  "b": { portKey: "b", nameZh: "底端口 (b)", nameEn: "Bottom (b)", priority: 2 },
  "l": { portKey: "l", nameZh: "左端口 (l)", nameEn: "Left (l)", priority: 1 },
  "r": { portKey: "r", nameZh: "右端口 (r)", nameEn: "Right (r)", priority: 2 },

  // Sources & Power
  "vdd": { portKey: "vdd", nameZh: "电源 (VDD)", nameEn: "VDD", priority: 1 },
  "gnd": { portKey: "gnd", nameZh: "接地 (GND)", nameEn: "GND", priority: 1 },
  "origin": { portKey: "origin", nameZh: "原点 (origin)", nameEn: "Origin", priority: 5 },
  "pin": { portKey: "pin", nameZh: "引脚 (pin)", nameEn: "Pin", priority: 1 },
  "center": { portKey: "center", nameZh: "中心 (center)", nameEn: "Center", priority: 6 }
};

export function resolveComponentPort(nodeName: string, anchorName?: string | null): { label: string; priority: number } {
  const cleanAnchor = (anchorName ?? "").toLowerCase().trim();
  const cleanNode = nodeName.toLowerCase().trim();

  // 1. Direct Anchor Match
  if (cleanAnchor && CIRCUIT_PORT_DEFINITIONS[cleanAnchor]) {
    const desc = CIRCUIT_PORT_DEFINITIONS[cleanAnchor];
    return { label: desc.nameZh, priority: desc.priority };
  }

  // 2. Node Name Match (e.g. node_Mx.d, node_Rx.t, node_VDD, node_GND)
  if (cleanNode.includes(".d") || cleanNode.endsWith("_d")) {
    return { label: "漏极 (d)", priority: 1 };
  }
  if (cleanNode.includes(".g") || cleanNode.endsWith("_g")) {
    return { label: "栅极 (g)", priority: 2 };
  }
  if (cleanNode.includes(".s") || cleanNode.endsWith("_s")) {
    return { label: "源极 (s)", priority: 3 };
  }
  if (cleanNode.includes(".t") || cleanNode.endsWith("_t")) {
    return { label: "顶端口 (t)", priority: 1 };
  }
  if (cleanNode.includes(".b") || cleanNode.endsWith("_b")) {
    return { label: "底端口 (b)", priority: 2 };
  }
  if (cleanNode.includes(".l") || cleanNode.endsWith("_l")) {
    return { label: "左端口 (l)", priority: 1 };
  }
  if (cleanNode.includes(".r") || cleanNode.endsWith("_r")) {
    return { label: "右端口 (r)", priority: 2 };
  }
  if (cleanNode.includes("vdd")) {
    return { label: "电源 (VDD)", priority: 1 };
  }
  if (cleanNode.includes("gnd")) {
    return { label: "接地 (GND)", priority: 1 };
  }
  if (cleanNode.includes("vin") || cleanNode.includes("vout") || cleanNode.includes("vtest") || cleanNode.includes("vx") || cleanNode.includes("vy")) {
    return { label: "IO引脚", priority: 1 };
  }

  // Fallback
  const displayAnchor = anchorName ? `${nodeName}.${anchorName}` : nodeName;
  return { label: displayAnchor, priority: 10 };
}
