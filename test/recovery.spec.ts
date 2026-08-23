import { describe, expect, it } from "vitest";

import { parseTikz } from "../packages/core/src/parser/index.js";

describe("recovery behavior", () => {
  it("does not warn about a missing tikzpicture for blank source", () => {
    const result = parseTikz("");

    expect(result.figure.body).toEqual([]);
    expect(result.diagnostics.some((d) => d.code === "missing-tikzpicture")).toBe(false);
  });

  it("warns when nonblank TikZ code is outside a tikzpicture environment", () => {
    const result = parseTikz("\\draw (0,0) -- (1,0);");

    expect(result.diagnostics.some((d) => d.code === "missing-tikzpicture")).toBe(true);
  });

  it("keeps parseable state for partial node text", () => {
    const source = `\\begin{tikzpicture}\\draw (0,0) node {Hel\\end{tikzpicture}`;
    const result = parseTikz(source);

    expect(result.figure.body.length).toBeGreaterThan(0);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("keeps parseable state for partial coordinates", () => {
    const source = `\\begin{tikzpicture}\\draw (1,\\end{tikzpicture}`;
    const result = parseTikz(source);

    expect(result.figure.body.length).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.code === "malformed-coordinate" || d.code === "parse-error")).toBe(true);
  });

  it("keeps parseable state for broken options", () => {
    const source = `\\begin{tikzpicture}\\draw (0,0) node[x=1, {A};\\end{tikzpicture}`;
    const result = parseTikz(source);

    expect(result.figure.body.length).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.code === "missing-option-close" || d.code === "parse-error")).toBe(true);
  });

  it("keeps parseable state for partial relative coordinate options", () => {
    const source = `\\begin{tikzpicture}\\draw (0,0) -- +([xshift=3pt] 1,\\end{tikzpicture}`;
    const result = parseTikz(source);

    expect(result.figure.body.length).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.code === "malformed-coordinate" || d.code === "parse-error")).toBe(true);
  });
});
