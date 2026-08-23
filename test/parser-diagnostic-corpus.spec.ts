import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { Diagnostic } from "../packages/core/src/diagnostics/types.js";
import { renderTikzToSvg } from "../packages/core/src/render/index.js";

type DiagnosticPhase = "parse" | "semantic";

type ExpectedDiagnostic = {
  phase: DiagnosticPhase;
  code: string;
  severity: Diagnostic["severity"];
  message: string;
};

type DiagnosticCorpusCase = {
  id: string;
  source: string;
  expected: ExpectedDiagnostic[];
};

const corpusPath = fileURLToPath(new URL("./fixtures/diagnostics/common-user-mistakes.json", import.meta.url));
const cases = JSON.parse(readFileSync(corpusPath, "utf8")) as DiagnosticCorpusCase[];

describe("common user mistake diagnostics corpus", () => {
  for (const testCase of cases) {
    it(`${testCase.id} has the expected actionable diagnostics`, () => {
      const rendered = renderTikzToSvg(testCase.source);

      for (const expected of testCase.expected) {
        const diagnostics = readDiagnostics(rendered, expected.phase);
        expect(diagnostics, `${testCase.id}:${expected.phase}:${expected.code}`).toEqual(expect.arrayContaining([
          expect.objectContaining({
            code: expected.code,
            severity: expected.severity,
            message: expected.message
          })
        ]));
      }
    });
  }
});

function readDiagnostics(
  rendered: ReturnType<typeof renderTikzToSvg>,
  phase: DiagnosticPhase
): readonly Diagnostic[] {
  if (phase === "parse") {
    return rendered.parse.diagnostics;
  }
  return rendered.semantic.diagnostics;
}
