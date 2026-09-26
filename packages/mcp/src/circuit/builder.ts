import { CATALOG, PT_PER_CM, Port } from "./templates.js";

export interface ComponentInput {
  id: string;
  type: string;
  x: number;
  y: number;
  label?: string;
  direction?: "down" | "up";
}

export type WireEndpoint = string | { x: number; y: number };

export interface WireInput {
  id?: string;
  from: WireEndpoint;
  to: WireEndpoint;
  route?: "orthogonal" | "hv" | "vh" | "straight";
}

export interface BuildCircuitOptions {
  components: ComponentInput[];
  wires?: WireInput[];
  junctionDots?: boolean;
}

export interface BuildCircuitResult {
  ok: boolean;
  code: string;
  ports: Record<string, Record<string, { x: number; y: number }>>;
  junctions: Array<{ x: number; y: number }>;
  error?: string;
}

function roundCoord(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function buildCircuit(options: BuildCircuitOptions): BuildCircuitResult {
  const { components, wires = [], junctionDots = true } = options;
  const globalPorts: Record<string, Record<string, { x: number; y: number }>> = {};
  const lines: string[] = [];

  lines.push(String.raw`\begin{tikzpicture}[scale=1]`);

  // 1. Place Components
  for (const comp of components) {
    const tmpl = CATALOG[comp.type];
    if (!tmpl) {
      return {
        ok: false,
        code: "",
        ports: {},
        junctions: [],
        error: `未知元器件类型: '${comp.type}'。可用类型: ${Object.keys(CATALOG).join(", ")}`
      };
    }

    const offsetX = (tmpl.scopeOffsetPt?.[0] || 0) / PT_PER_CM;
    const offsetY = (tmpl.scopeOffsetPt?.[1] || 0) / PT_PER_CM;
    const scopeX = roundCoord(comp.x + offsetX);
    const scopeY = roundCoord(comp.y + offsetY);

    globalPorts[comp.id] = {};
    for (const p of tmpl.ports) {
      globalPorts[comp.id][p.name] = {
        x: roundCoord(scopeX + p.x),
        y: roundCoord(scopeY + p.y)
      };
    }

    const labelText = comp.label !== undefined ? comp.label : tmpl.defaultLabel.replace("LABEL", comp.id);
    let body = tmpl.tikzBody;

    if (comp.type === "current_source") {
      const arrowLine = comp.direction === "up" ? "(0, -0.15) -- (0, 0.15)" : "(0, 0.15) -- (0, -0.15)";
      body = body.replace("{ARROW_LINE}", arrowLine);
    }

    lines.push(`  % Component ${comp.id} (${comp.type})`);
    lines.push(`  \\begin{scope}[shift={(${scopeX},${scopeY})}]`);
    for (const bodyLine of body.split("\n")) {
      lines.push(`    ${bodyLine}`);
    }
    if (tmpl.labelNode && labelText) {
      const labelLine = tmpl.labelNode.replace("{LABEL}", labelText);
      lines.push(`    ${labelLine}`);
    }
    lines.push(`  \\end{scope}`);
  }

  // 2. Resolve & Place Wires
  const pointVisitCounts = new Map<string, number>();

  function resolveEndpoint(ep: WireEndpoint): { x: number; y: number } | null {
    if (typeof ep === "object" && ep !== null && "x" in ep && "y" in ep) {
      return { x: roundCoord(ep.x), y: roundCoord(ep.y) };
    }
    if (typeof ep === "string") {
      const parts = ep.split(".");
      if (parts.length === 2) {
        const [compId, portName] = parts;
        if (globalPorts[compId] && globalPorts[compId][portName]) {
          return globalPorts[compId][portName];
        }
      }
    }
    return null;
  }

  if (wires.length > 0) {
    lines.push(`  % Wires`);
    for (const wire of wires) {
      const p1 = resolveEndpoint(wire.from);
      const p2 = resolveEndpoint(wire.to);
      if (!p1 || !p2) {
        return {
          ok: false,
          code: "",
          ports: globalPorts,
          junctions: [],
          error: `无法解析导线端点: from=${JSON.stringify(wire.from)}, to=${JSON.stringify(wire.to)}`
        };
      }

      // Record point touches for junctions
      const k1 = `${p1.x},${p1.y}`;
      const k2 = `${p2.x},${p2.y}`;
      pointVisitCounts.set(k1, (pointVisitCounts.get(k1) || 0) + 1);
      pointVisitCounts.set(k2, (pointVisitCounts.get(k2) || 0) + 1);

      let routeOp = "--";
      if (wire.route === "hv") {
        routeOp = "-|";
      } else if (wire.route === "vh") {
        routeOp = "|-";
      } else if (wire.route === "orthogonal" || !wire.route) {
        if (Math.abs(p1.x - p2.x) > 0.001 && Math.abs(p1.y - p2.y) > 0.001) {
          routeOp = "|-";
        } else {
          routeOp = "--";
        }
      }

      lines.push(`  \\draw[line width=0.32mm] (${p1.x},${p1.y}) ${routeOp} (${p2.x},${p2.y});`);
    }
  }

  // 3. Automatic Junction Dots
  const junctions: Array<{ x: number; y: number }> = [];
  if (junctionDots) {
    for (const [key, count] of pointVisitCounts.entries()) {
      if (count >= 3) {
        const [xStr, yStr] = key.split(",");
        const jPt = { x: parseFloat(xStr), y: parseFloat(yStr) };
        junctions.push(jPt);
      }
    }
    if (junctions.length > 0) {
      lines.push(`  % Junctions`);
      for (const j of junctions) {
        lines.push(`  \\fill (${j.x},${j.y}) circle (1.5pt);`);
      }
    }
  }

  lines.push(String.raw`\end{tikzpicture}`);

  return {
    ok: true,
    code: lines.join("\n"),
    ports: globalPorts,
    junctions
  };
}
