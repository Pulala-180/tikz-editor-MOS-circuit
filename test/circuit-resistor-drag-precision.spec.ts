import { describe, expect, it } from "vitest";
import { applyEditAction } from "../packages/core/src/edit/actions.js";
import { parseTikz } from "../packages/core/src/parser/index.js";
import { evaluateTikzFigure } from "../packages/core/src/semantic/evaluate.js";
import { wp } from "./coords-helpers.js";
import { cm, expectPatchesReconstructSource } from "./edit-actions-helpers.js";

// User's exact test circuit snippet
const USER_CIRCUIT_FIXTURE = String.raw`\begin{tikzpicture}
  % --- VDD ---
  \begin{scope}[shift={(2.5,5.0)}]
    \coordinate (node_VDD.bottom) at (0,0);
    \draw[line width=0.32mm, line cap=round] (0,0) -- (0,0.22);
    \draw[ultra thick] (-0.95,0.22) -- (0.9,0.22);
    \node[draw=none] at (1.2,0.22) {$V_{DD}$};
  \end{scope}

  % --- RD ---
  \begin{scope}[shift={(2.5,5.0)}]
    \coordinate (node_RD.t) at (0,0);
    \draw[line width=0.32mm, line cap=round] (0,0) -- (0,-0.15) -- (0.15,-0.19) -- (-0.15,-0.27) -- (0.15,-0.35) -- (-0.15,-0.43) -- (0.15,-0.51) -- (-0.15,-0.59) -- (0,-0.63) -- (0,-0.78);
    \node[right] at (0.25,-0.39) {$R_{D}$};
    \coordinate (node_RD.b) at (0,-0.78);
  \end{scope}

  % --- Wires from RD to M1.d and Vout ---
  \draw[line width=0.32mm, line cap=round] (2.5,4.22) -- (2.5,3.7);
  \draw[line width=0.32mm, fill=black] (2.5,3.7) circle (0.06);
  \draw[line width=0.32mm, line cap=round] (2.5,3.7) -- (2.5,3.2);
  \draw[line width=0.32mm, line cap=round] (2.5,3.7) -- (3.5,3.7);

  % --- IO Vout ---
  \begin{scope}[shift={(3.35,3.7)}]
    \node at (0.85,-0.30) {$V_{out}$};
    \draw[line width=0.32mm, line cap=round] (0.6,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.15,0);
    \coordinate (node_IO_Vout.port) at (0.15,0);
  \end{scope}

  % --- M1 (nMOS) ---
  \begin{scope}[shift={(1.77,2.7)}]
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

  % --- Vin and wire to M1.g ---
  \draw[line width=0.32mm, line cap=round] (1.0,2.7) -- (1.77,2.7);
  \begin{scope}[shift={(0.4,2.7)}]
    \node at (-0.01,-0.30) {$V_{in}$};
    \draw[line width=0.32mm, line cap=round] (0.15,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.6,0);
    \coordinate (node_IO_Vin.port) at (0.6,0);
  \end{scope}

  % --- Wire from M1.s to RS ---
  \draw[line width=0.32mm, line cap=round] (2.5,2.2) -- (2.5,1.8);

  % --- RS (Source Degeneration Resistor) ---
  \begin{scope}[shift={(2.5,1.8)}]
    \coordinate (node_RS.t) at (0,0);
    \draw[line width=0.32mm, line cap=round] (0,0) -- (0,-0.15) -- (0.15,-0.19) -- (-0.15,-0.27) -- (0.15,-0.35) -- (-0.15,-0.43) -- (0.15,-0.51) -- (-0.15,-0.59) -- (0,-0.63) -- (0,-0.78);
    \node[right] at (0.25,-0.39) {$R_{S}$};
    \coordinate (node_RS.b) at (0,-0.78);
  \end{scope}

  % --- Wire from RS to GND ---
  \draw[line width=0.32mm, line cap=round] (2.5,1.02) -- (2.5,0.6);

  % --- GND ---
  \begin{scope}[shift={(2.5,0.6)}]
    \coordinate (node_GND.top) at (0,0);
    \draw[line width=0.32mm, line cap=round] (0,0) -- (0,-0.21);
    \draw[ultra thick] (-0.17,-0.21) -- (0.17,-0.21);
    \draw[ultra thick] (-0.11,-0.35) -- (0.11,-0.35);
    \draw[ultra thick] (-0.08,-0.49) -- (0.08,-0.49);
  \end{scope}
\end{tikzpicture}`;

describe("Circuit resistor drag precision & alignment verification", () => {
  it("moving RD vertically preserves cm units without 'pt' quantization error, perfectly matching connected wire", () => {
    const parsed = parseTikz(USER_CIRCUIT_FIXTURE, { recover: true });
    const semantic = evaluateTikzFigure(parsed.figure, USER_CIRCUIT_FIXTURE);

    // Find RD scope ID
    const rdScope = parsed.figure.body.find(
      (stmt) => stmt.kind === "Scope" && USER_CIRCUIT_FIXTURE.slice(stmt.span.from, stmt.span.to).includes("node_RD")
    );
    expect(rdScope).toBeTruthy();
    const rdScopeId = rdScope!.id;

    // Move RD down by 0.3cm (dy = -0.3cm)
    const result = applyEditAction(USER_CIRCUIT_FIXTURE, semantic.editHandles, {
      kind: "moveElements",
      elementIds: [rdScopeId],
      delta: wp(0, cm(-0.3))
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    // 1. RD scope must be written in clean cm coordinates, NOT 'pt'!
    // shift={(2.5, 5.0)} moved down by 0.3 -> shift={(2.5,4.7)}
    expect(result.newSource).toContain(String.raw`\begin{scope}[shift={(2.5,4.7)}]`);
    expect(result.newSource).not.toContain("71pt");

    // 2. Connected wire below RD must follow exactly:
    // Original wire: (2.5, 4.22) -- (2.5, 3.7)
    // New wire start: y = 4.22 - 0.3 = 3.92
    // Both X are strictly 2.5, matching to 0.00000mm!
    expect(result.newSource).toContain("(2.5,3.92) -- (2.5,3.7)");

    expectPatchesReconstructSource(USER_CIRCUIT_FIXTURE, result);
  });

  it("moving Vin horizontally preserves cm units and wire stays strictly aligned in Y", () => {
    const parsed = parseTikz(USER_CIRCUIT_FIXTURE, { recover: true });
    const semantic = evaluateTikzFigure(parsed.figure, USER_CIRCUIT_FIXTURE);

    // Find Vin scope ID
    const vinScope = parsed.figure.body.find(
      (stmt) => stmt.kind === "Scope" && USER_CIRCUIT_FIXTURE.slice(stmt.span.from, stmt.span.to).includes("node_IO_Vin")
    );
    expect(vinScope).toBeTruthy();
    const vinScopeId = vinScope!.id;

    // Move Vin left by 0.2cm (dx = -0.2cm)
    const result = applyEditAction(USER_CIRCUIT_FIXTURE, semantic.editHandles, {
      kind: "moveElements",
      elementIds: [vinScopeId],
      delta: wp(cm(-0.2), 0)
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    // Vin was at shift={(0.4, 2.7)}, now at shift={(0.2,2.7)}
    expect(result.newSource).toContain(String.raw`\begin{scope}[shift={(0.2,2.7)}]`);
    expect(result.newSource).not.toContain("11pt");

    // Wire to M1.g was (1.0, 2.7) -- (1.77, 2.7)
    // Now wire start follows: 1.0 - 0.2 = 0.8
    expect(result.newSource).toContain("(0.8,2.7) -- (1.77,2.7)");

    expectPatchesReconstructSource(USER_CIRCUIT_FIXTURE, result);
  });
});
