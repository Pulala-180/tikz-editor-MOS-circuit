import { describe, expect, it } from "vitest";
import { parseTikz } from "../packages/core/src/parser/index.js";
import { evaluateTikzFigure } from "../packages/core/src/semantic/evaluate.js";
import { resolveMoveAxisConstraintFromEditHandles } from "../packages/core/src/edit/snapping/move-axis.js";
import { applyEditAction } from "../packages/core/src/edit/actions.js";
import { clampDeltaForAttachedWires } from "../packages/core/src/edit/actions/wire-follow.js";
import { wp } from "./coords-helpers.js";

const USER_CIRCUIT = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(3.42,2.349)}]
      \coordinate (node_M1.g) at (0,0);
      \draw[line width=0.32mm, line cap=round] (0,0) -- (0.26,0);
      \draw[line width=0.7mm] (0.25,-0.25) -- (0.25,0.25);
      \draw[line width=0.7mm] (0.41,-0.3) -- (0.41,0.3);
      \draw[line width=0.32mm, line cap=round, line join=round] (0.40,0.2) -- (0.73,0.2) -- (0.73,0.5);
      \draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (0.40,-0.2) -- (0.70,-0.2);
      \draw[line width=0.32mm, line cap=round] (0.73,-0.21) -- (0.73,-0.5);
      \node[node font=\sffamily\bfseries] at (1.04,0) {$M_{1}$};
      \coordinate (node_M1.d) at (0.73,0.5);
      \coordinate (node_M1.s) at (0.73,-0.5);
    \end{scope}

  \begin{scope}[shift={(4.15,0.712)}]
      \coordinate (node_GND.top) at (0,0);
      \draw[line width=0.32mm, line cap=round] (0,0) -- (0,-0.21);
      \draw[ultra thick] (-0.17,-0.21) -- (0.17,-0.21);
      \draw[ultra thick] (-0.11,-0.35) -- (0.11,-0.35);
      \draw[ultra thick] (-0.08,-0.49) -- (0.08,-0.49);
    \end{scope}

  \draw[line width=0.32mm, line cap=round] (4.15,1.849) -- (node_GND.top);

  \begin{scope}[shift={(4.15,5.144)}]
      \coordinate (node_VDD.bottom) at (0,0);
      \draw[line width=0.32mm, line cap=round] (0,0) -- (0,0.22);
      \draw[ultra thick] (-0.4,0.22) -- (0.42,0.22);
      \node[draw=none] at (0.84,0.03) {$V_{DD}$};
  \end{scope}

  \draw[line width=0.32mm, line cap=round] (4.15,2.849) -- (4.15,3.72);
  \draw[line width=0.32mm, line cap=round] (4.147,4.5) -- (node_VDD.bottom);
  \draw[line width=0.32mm, line cap=round] (3.42,2.349) -- (3.32,2.369);

  \begin{scope}[shift={(2.72,2.369)}]
      \node at (-0.01,-0.30) {$V_{in}$};
      \draw[line width=0.32mm] (0.15,0) circle (0.06);
      \draw[line width=0.32mm, line cap=round] (0.21,0) -- (0.6,0);
      \coordinate (node_IO1.port) at (0.6,0);
    \end{scope}

  \begin{scope}[shift={(4.147,3.72)}]
      \coordinate (node_R1.b) at (0,0);
      \draw[line width=0.32mm, line cap=round] (0,0) -- (0,0.15) -- (0.15,0.19) -- (-0.15,0.27) -- (0.15,0.35) -- (-0.15,0.43) -- (0.15,0.51) -- (-0.15,0.59) -- (0,0.63) -- (0,0.78);
      \node[right] at (0.25,0.39) {$R_{D}$};
      \coordinate (node_R1.t) at (0,0.78);
    \end{scope}

  \begin{scope}[shift={(4.147,3.476)}]
      \coordinate (node_D1.dot) at (0,0);
      \draw[line width=0.32mm, fill=black] (0,0) circle (0.06);
      \draw[line width=0.32mm, line cap=round] (0,0) -- (0.18,0);
      \coordinate (node_D1.right) at (0.18,0);
    \end{scope}

  \draw[line width=0.32mm, line cap=round] (4.327,3.476) -- (6.202,3.476);

  \begin{scope}[shift={(6.202,3.476)}]
      \coordinate (node_R2.l) at (0,0);
      \draw[line width=0.32mm, line cap=round] (0,0) -- (0.15,0) -- (0.19,0.15) -- (0.27,-0.15) -- (0.35,0.15) -- (0.43,-0.15) -- (0.51,0.15) -- (0.59,-0.15) -- (0.63,0) -- (0.78,0);
      \node at (0.39,0.35) {$R_{D}$};
      \coordinate (node_R2.r) at (0.78,0);
    \end{scope}
\end{tikzpicture}`;

describe("Circuit drag hierarchy and axis constraint verification", () => {
  it("locks vertical resistor to y-axis when wired", () => {
    const parsed = parseTikz(USER_CIRCUIT, { recover: true });
    const sem = evaluateTikzFigure(parsed.figure, USER_CIRCUIT);
    const r1Scope = parsed.figure.body.find(
      (stmt: any) => stmt.kind === "Scope" && USER_CIRCUIT.slice(stmt.span.from, stmt.span.to).includes("node_R1")
    )!;
    const r1Handles = sem.editHandles.filter(
      (h) => h.sourceRef.sourceSpan.from >= r1Scope.span.from && h.sourceRef.sourceSpan.to <= r1Scope.span.to
    );
    const r1SourceIds = new Set([r1Scope.id, ...r1Handles.map((h) => h.sourceRef.sourceId)]);

    const axis = resolveMoveAxisConstraintFromEditHandles(sem.editHandles, r1SourceIds, {
      requireAttachedWire: true,
      sceneElements: sem.scene.elements,
      nodeAnchorTargets: sem.nodeAnchorTargets
    });
    expect(axis).toBe("y");
  });

  it("locks horizontal resistor to x-axis when wired", () => {
    const parsed = parseTikz(USER_CIRCUIT, { recover: true });
    const sem = evaluateTikzFigure(parsed.figure, USER_CIRCUIT);
    const r2Scope = parsed.figure.body.find(
      (stmt: any) => stmt.kind === "Scope" && USER_CIRCUIT.slice(stmt.span.from, stmt.span.to).includes("node_R2")
    )!;
    const r2Handles = sem.editHandles.filter(
      (h) => h.sourceRef.sourceSpan.from >= r2Scope.span.from && h.sourceRef.sourceSpan.to <= r2Scope.span.to
    );
    const r2SourceIds = new Set([r2Scope.id, ...r2Handles.map((h) => h.sourceRef.sourceId)]);

    const axis = resolveMoveAxisConstraintFromEditHandles(sem.editHandles, r2SourceIds, {
      requireAttachedWire: true,
      sceneElements: sem.scene.elements,
      nodeAnchorTargets: sem.nodeAnchorTargets
    });
    expect(axis).toBe("x");
  });

  it("locks wired capacitors, voltage sources, and current sources to their respective axes", () => {
    // Vertical Capacitor wired to a line
    const vCap = String.raw`\begin{tikzpicture}
      \begin{scope}[shift={(2,4)}]
        \coordinate (node_C1.t) at (0,0);
        \draw (0,0) -- (0,-0.2);
        \draw (-0.25,-0.2) -- (0.25,-0.2);
        \draw (-0.25,-0.36) -- (0.25,-0.36);
        \draw (0,-0.36) -- (0,-0.56);
        \coordinate (node_C1.b) at (0,-0.56);
      \end{scope}
      \draw (2,4) -- (2,5);
    \end{tikzpicture}`;
    const vCapParsed = parseTikz(vCap, { recover: true });
    const vCapSem = evaluateTikzFigure(vCapParsed.figure, vCap);
    const vCapScope = vCapParsed.figure.body.find((s: any) => s.kind === "Scope")!;
    const vCapIds = new Set([
      vCapScope.id,
      ...vCapSem.editHandles
        .filter((h) => h.sourceRef.sourceSpan.from >= vCapScope.span.from && h.sourceRef.sourceSpan.to <= vCapScope.span.to)
        .map((h) => h.sourceRef.sourceId)
    ]);
    expect(
      resolveMoveAxisConstraintFromEditHandles(vCapSem.editHandles, vCapIds, {
        requireAttachedWire: true,
        sceneElements: vCapSem.scene.elements,
        nodeAnchorTargets: vCapSem.nodeAnchorTargets
      })
    ).toBe("y");

    // Horizontal Voltage Source wired to a line
    const hVolt = String.raw`\begin{tikzpicture}
      \begin{scope}[shift={(0,0)}]
        \coordinate (node_V1.l) at (0,0);
        \draw (0,0) -- (0.15,0);
        \draw (0.4,0) circle (0.25);
        \draw (0.65,0) -- (0.8,0);
        \coordinate (node_V1.r) at (0.8,0);
      \end{scope}
      \draw (0.8,0) -- (2,0);
    \end{tikzpicture}`;
    const hVoltParsed = parseTikz(hVolt, { recover: true });
    const hVoltSem = evaluateTikzFigure(hVoltParsed.figure, hVolt);
    const hVoltScope = hVoltParsed.figure.body.find((s: any) => s.kind === "Scope")!;
    const hVoltIds = new Set([
      hVoltScope.id,
      ...hVoltSem.editHandles
        .filter((h) => h.sourceRef.sourceSpan.from >= hVoltScope.span.from && h.sourceRef.sourceSpan.to <= hVoltScope.span.to)
        .map((h) => h.sourceRef.sourceId)
    ]);
    expect(
      resolveMoveAxisConstraintFromEditHandles(hVoltSem.editHandles, hVoltIds, {
        requireAttachedWire: true,
        sceneElements: hVoltSem.scene.elements,
        nodeAnchorTargets: hVoltSem.nodeAnchorTargets
      })
    ).toBe("x");
  });

  it("locks wired VDD and GND to y-axis, and Vin to x-axis, preventing slanted wires", () => {
    const parsed = parseTikz(USER_CIRCUIT, { recover: true });
    const sem = evaluateTikzFigure(parsed.figure, USER_CIRCUIT);

    // VDD connected to vertical wire -> "y"
    const vddScope = parsed.figure.body.find(
      (stmt: any) => stmt.kind === "Scope" && USER_CIRCUIT.slice(stmt.span.from, stmt.span.to).includes("node_VDD")
    )!;
    const vddIds = new Set([
      vddScope.id,
      ...sem.editHandles
        .filter((h) => h.sourceRef.sourceSpan.from >= vddScope.span.from && h.sourceRef.sourceSpan.to <= vddScope.span.to)
        .map((h) => h.sourceRef.sourceId)
    ]);
    expect(
      resolveMoveAxisConstraintFromEditHandles(sem.editHandles, vddIds, {
        requireAttachedWire: true,
        sceneElements: sem.scene.elements,
        nodeAnchorTargets: sem.nodeAnchorTargets
      })
    ).toBe("y");

    // GND connected to vertical wire -> "y"
    const gndScope = parsed.figure.body.find(
      (stmt: any) => stmt.kind === "Scope" && USER_CIRCUIT.slice(stmt.span.from, stmt.span.to).includes("node_GND")
    )!;
    const gndIds = new Set([
      gndScope.id,
      ...sem.editHandles
        .filter((h) => h.sourceRef.sourceSpan.from >= gndScope.span.from && h.sourceRef.sourceSpan.to <= gndScope.span.to)
        .map((h) => h.sourceRef.sourceId)
    ]);
    expect(
      resolveMoveAxisConstraintFromEditHandles(sem.editHandles, gndIds, {
        requireAttachedWire: true,
        sceneElements: sem.scene.elements,
        nodeAnchorTargets: sem.nodeAnchorTargets
      })
    ).toBe("y");

    // Vin connected to horizontal wire -> "x"
    const vinScope = parsed.figure.body.find(
      (stmt: any) => stmt.kind === "Scope" && USER_CIRCUIT.slice(stmt.span.from, stmt.span.to).includes("node_IO1")
    )!;
    const vinIds = new Set([
      vinScope.id,
      ...sem.editHandles
        .filter((h) => h.sourceRef.sourceSpan.from >= vinScope.span.from && h.sourceRef.sourceSpan.to <= vinScope.span.to)
        .map((h) => h.sourceRef.sourceId)
    ]);
    expect(
      resolveMoveAxisConstraintFromEditHandles(sem.editHandles, vinIds, {
        requireAttachedWire: true,
        sceneElements: sem.scene.elements,
        nodeAnchorTargets: sem.nodeAnchorTargets
      })
    ).toBe("x");

    // Vertical RD (R1) connected to vertical wire -> "y"
    const r1Scope = parsed.figure.body.find(
      (stmt: any) => stmt.kind === "Scope" && USER_CIRCUIT.slice(stmt.span.from, stmt.span.to).includes("node_R1")
    )!;
    const r1Ids = new Set([
      r1Scope.id,
      ...sem.editHandles
        .filter((h) => h.sourceRef.sourceSpan.from >= r1Scope.span.from && h.sourceRef.sourceSpan.to <= r1Scope.span.to)
        .map((h) => h.sourceRef.sourceId)
    ]);
    expect(
      resolveMoveAxisConstraintFromEditHandles(sem.editHandles, r1Ids, {
        requireAttachedWire: true,
        sceneElements: sem.scene.elements,
        nodeAnchorTargets: sem.nodeAnchorTargets
      })
    ).toBe("y");

    // Horizontal RD (R2) connected to horizontal wire -> "x"
    const r2Scope = parsed.figure.body.find(
      (stmt: any) => stmt.kind === "Scope" && USER_CIRCUIT.slice(stmt.span.from, stmt.span.to).includes("node_R2")
    )!;
    const r2Ids = new Set([
      r2Scope.id,
      ...sem.editHandles
        .filter((h) => h.sourceRef.sourceSpan.from >= r2Scope.span.from && h.sourceRef.sourceSpan.to <= r2Scope.span.to)
        .map((h) => h.sourceRef.sourceId)
    ]);
    expect(
      resolveMoveAxisConstraintFromEditHandles(sem.editHandles, r2Ids, {
        requireAttachedWire: true,
        sceneElements: sem.scene.elements,
        nodeAnchorTargets: sem.nodeAnchorTargets
      })
    ).toBe("x");

    // Branch Dot (D1) sits along vertical trunk wire M1-RD -> locks to "y" (slides up/down, no left/right!)
    const d1Scope = parsed.figure.body.find(
      (stmt: any) => stmt.kind === "Scope" && USER_CIRCUIT.slice(stmt.span.from, stmt.span.to).includes("node_D1")
    )!;
    const d1Ids = new Set([
      d1Scope.id,
      ...sem.editHandles
        .filter((h) => h.sourceRef.sourceSpan.from >= d1Scope.span.from && h.sourceRef.sourceSpan.to <= d1Scope.span.to)
        .map((h) => h.sourceRef.sourceId)
    ]);
    expect(
      resolveMoveAxisConstraintFromEditHandles(sem.editHandles, d1Ids, {
        requireAttachedWire: true,
        sceneElements: sem.scene.elements,
        nodeAnchorTargets: sem.nodeAnchorTargets
      })
    ).toBe("y");

    // MOSFET (M1) is multi-axis driver -> null
    const m1Scope = parsed.figure.body.find(
      (stmt: any) => stmt.kind === "Scope" && USER_CIRCUIT.slice(stmt.span.from, stmt.span.to).includes("node_M1")
    )!;
    const m1Ids = new Set([
      m1Scope.id,
      ...sem.editHandles
        .filter((h) => h.sourceRef.sourceSpan.from >= m1Scope.span.from && h.sourceRef.sourceSpan.to <= m1Scope.span.to)
        .map((h) => h.sourceRef.sourceId)
    ]);
    expect(
      resolveMoveAxisConstraintFromEditHandles(sem.editHandles, m1Ids, {
        requireAttachedWire: true,
        sceneElements: sem.scene.elements,
        nodeAnchorTargets: sem.nodeAnchorTargets
      })
    ).toBeNull();
  });

  it("leaves unconnected terminals freely movable in 2D", () => {
    const standalone = String.raw`\begin{tikzpicture}
      \begin{scope}[shift={(0,0)}]
        \coordinate (node_VDD.bottom) at (0,0);
        \draw (0,0) -- (0,0.22);
        \draw (-0.4,0.22) -- (0.42,0.22);
      \end{scope}
    \end{tikzpicture}`;
    const parsed = parseTikz(standalone, { recover: true });
    const sem = evaluateTikzFigure(parsed.figure, standalone);
    const scope = parsed.figure.body[0]!;
    const ids = new Set([scope.id, ...sem.editHandles.map((h) => h.sourceRef.sourceId)]);
    expect(
      resolveMoveAxisConstraintFromEditHandles(sem.editHandles, ids, {
        requireAttachedWire: true,
        sceneElements: sem.scene.elements,
        nodeAnchorTargets: sem.nodeAnchorTargets
      })
    ).toBeNull();
  });

  it("moving VDD does NOT drag RD or any internal circuit backwards", () => {
    const parsed = parseTikz(USER_CIRCUIT, { recover: true });
    const sem = evaluateTikzFigure(parsed.figure, USER_CIRCUIT);
    const vddScope = parsed.figure.body.find(
      (stmt: any) => stmt.kind === "Scope" && USER_CIRCUIT.slice(stmt.span.from, stmt.span.to).includes("node_VDD")
    )!;

    // Move VDD to the right by 1cm (28.346pt, 0)
    const result = applyEditAction(USER_CIRCUIT, sem.editHandles, {
      kind: "moveElements",
      elementIds: [vddScope.id],
      delta: wp(28.346457, 0)
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      // VDD shifted from 4.15 to 5.15
      expect(result.newSource).toContain("[shift={(5.15,5.14");
      // CRITICAL: R1 must REMAIN at its original position (4.147, 3.72), NOT moved to 5.14!
      expect(result.newSource).toContain("[shift={(4.147,3.72)}]");
    }
  });

  it("moving GND does NOT drag connected transistor or components backwards", () => {
    const parsed = parseTikz(USER_CIRCUIT, { recover: true });
    const sem = evaluateTikzFigure(parsed.figure, USER_CIRCUIT);
    const gndScope = parsed.figure.body.find(
      (stmt: any) => stmt.kind === "Scope" && USER_CIRCUIT.slice(stmt.span.from, stmt.span.to).includes("node_GND")
    )!;

    // Move GND down by 1cm (0, -28.346pt)
    const result = applyEditAction(USER_CIRCUIT, sem.editHandles, {
      kind: "moveElements",
      elementIds: [gndScope.id],
      delta: wp(0, -28.346457)
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      // M1 must REMAIN at its original position (3.42, 2.349)
      expect(result.newSource).toContain("[shift={(3.42,2.349)}]");
    }
  });

  it("moving M1 transistor horizontally moves the drain branch rigidly so vertical wire does not skew", () => {
    const parsed = parseTikz(USER_CIRCUIT, { recover: true });
    const sem = evaluateTikzFigure(parsed.figure, USER_CIRCUIT);
    const m1Scope = parsed.figure.body.find(
      (stmt: any) => stmt.kind === "Scope" && USER_CIRCUIT.slice(stmt.span.from, stmt.span.to).includes("node_M1")
    )!;

    // Move M1 right by 1cm (28.346pt, 0)
    const result = applyEditAction(USER_CIRCUIT, sem.editHandles, {
      kind: "moveElements",
      elementIds: [m1Scope.id],
      delta: wp(28.346457, 0)
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      // M1 shifted to 4.42
      expect(result.newSource).toContain("[shift={(4.42,2.35)}]");
      // R1 (drain branch) followed M1 to 5.14 so the vertical line stayed vertical!
      expect(result.newSource).toContain("[shift={(5.14,3.72)}]");
    }
  });

  it("moving M1 vertically does NOT drag branch dot D1 or branch resistor R2, and clamps before colliding with D1", () => {
    const parsed = parseTikz(USER_CIRCUIT, { recover: true });
    const sem = evaluateTikzFigure(parsed.figure, USER_CIRCUIT);
    const m1Scope = parsed.figure.body.find(
      (stmt: any) => stmt.kind === "Scope" && USER_CIRCUIT.slice(stmt.span.from, stmt.span.to).includes("node_M1")
    )!;

    // 1. Verify physical clamping stops M1 before colliding with D1 (relative distance is 0.627cm)
    const excessiveUp = 0.8 * 28.3464567; // 0.8cm
    const clamped = clampDeltaForAttachedWires(
      USER_CIRCUIT,
      sem.editHandles,
      [m1Scope.id],
      [m1Scope.id],
      wp(0, excessiveUp)
    );
    // Must be clamped to less than 0.627cm (17.77pt), keeping MIN_WIRE_LENGTH_PT buffer
    expect(clamped.y).toBeLessThan(17.77);
    expect(clamped.y).toBeGreaterThan(10.0);

    // 2. Perform a safe upward move (0.3cm = 8.5pt)
    const result = applyEditAction(USER_CIRCUIT, sem.editHandles, {
      kind: "moveElements",
      elementIds: [m1Scope.id],
      delta: wp(0, 0.3 * 28.3464567)
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      // M1 moves up from 2.349 to ~2.65
      expect(result.newSource).toContain("[shift={(3.42,2.65)}]");
      // CRITICAL: Branch dot D1 MUST remain at its original position (4.147, 3.476)!
      expect(result.newSource).toContain("[shift={(4.147,3.476)}]");
      // Branch resistor R2 MUST remain at its original position (6.202, 3.476)!
      expect(result.newSource).toContain("[shift={(6.202,3.476)}]");
      // Drain resistor R1 MUST remain at its original position (4.147, 3.72)!
      expect(result.newSource).toContain("[shift={(4.147,3.72)}]");
    }
  });

  it("moving branch dot D1 vertically slides it along vertical trunk wire and clamps within trunk boundary", () => {
    const parsed = parseTikz(USER_CIRCUIT, { recover: true });
    const sem = evaluateTikzFigure(parsed.figure, USER_CIRCUIT);
    const d1Scope = parsed.figure.body.find(
      (stmt: any) => stmt.kind === "Scope" && USER_CIRCUIT.slice(stmt.span.from, stmt.span.to).includes("node_D1")
    )!;

    // 1. Clamping check: initial D1 is at 3.476cm.
    // Trunk upper boundary (R1 bottom) is 3.72cm (dist = 0.244cm = 6.916pt).
    // Excessive UP (0.5cm) must clamp before R1.b:
    const clampedUp = clampDeltaForAttachedWires(
      USER_CIRCUIT,
      sem.editHandles,
      [d1Scope.id],
      [d1Scope.id],
      wp(0, 0.5 * 28.3465)
    );
    expect(clampedUp.y).toBeLessThan(6.92);
    expect(clampedUp.y).toBeGreaterThan(3.0);

    // Trunk lower boundary (M1 drain) is 2.849cm (dist = 0.627cm = 17.77pt).
    // Excessive DOWN (-1.0cm) must clamp before M1.d:
    const clampedDown = clampDeltaForAttachedWires(
      USER_CIRCUIT,
      sem.editHandles,
      [d1Scope.id],
      [d1Scope.id],
      wp(0, -1.0 * 28.3465)
    );
    expect(clampedDown.y).toBeGreaterThan(-17.77);
    expect(clampedDown.y).toBeLessThan(-10.0);

    // 2. Perform a safe upward move (0.1cm = 2.83pt)
    const result = applyEditAction(USER_CIRCUIT, sem.editHandles, {
      kind: "moveElements",
      elementIds: [d1Scope.id],
      delta: wp(0, 0.1 * 28.3465)
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      // D1 moves up from 3.476 to ~3.58
      expect(result.newSource).toContain("[shift={(4.15,3.58)}]");
      // Right branch resistor R2 follows vertically to keep tap wire horizontal!
      expect(result.newSource).toContain("[shift={(6.2,3.58)}]");
      // M1 and R1 remain stationary on the trunk!
      expect(result.newSource).toContain("[shift={(3.42,2.349)}]");
      expect(result.newSource).toContain("[shift={(4.147,3.72)}]");
    }
  });
});
