import { describe, expect, it } from "vitest";

import { EditorSession } from "../../packages/core/src/edit/session.js";
import { PT_PER_CM } from "../../packages/core/src/edit/format.js";
import { wp } from "../coords-helpers.js";

const cm = (value: number): number => value * PT_PER_CM;

describe("EditorSession", () => {
  it("initializes parse/semantic/svg state from source", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) -- (1,1);
\end{tikzpicture}`;
    const session = new EditorSession(source);

    expect(session.revision).toBe(0);
    expect(session.parseResult).not.toBeNull();
    expect(session.semanticResult).not.toBeNull();
    expect(session.svg).not.toBeNull();
    expect(session.editHandles.length).toBeGreaterThan(0);
  });

  it("setSource increments revision only when source changes", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) -- (1,1);
\end{tikzpicture}`;
    const session = new EditorSession(source);
    expect(session.revision).toBe(0);

    session.setSource(source);
    expect(session.revision).toBe(0);

    session.setSource(source.replace("(1,1)", "(2,2)"));
    expect(session.revision).toBe(1);
  });

  it("applyIntent updates source and refreshes state on success", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (0,0) -- (1,1);
\end{tikzpicture}`;
    const session = new EditorSession(source);
    const target = session.editHandles.find((handle) => source.slice(handle.sourceRef.sourceSpan.from, handle.sourceRef.sourceSpan.to) === "(1,1)");
    expect(target).toBeDefined();

    const result = session.applyIntent({
      kind: "move",
      handleId: target!.id,
      newWorld: wp(cm(3), cm(4))
    });

    expect(result.kind).toBe("success");
    expect(session.revision).toBe(1);
    expect(session.source).toContain("(3,4)");
    expect(session.semanticResult).not.toBeNull();
    expect(session.editHandles.length).toBeGreaterThan(0);
  });

  it("applyIntent does not mutate state when unsupported", () => {
    const source = String.raw`\begin{tikzpicture}
\draw (1,2,3) -- (2,3,4);
\end{tikzpicture}`;
    const session = new EditorSession(source);
    const target = session.editHandles.find((handle) => handle.coordinateForm === "xyz");
    expect(target).toBeDefined();

    const beforeSource = session.source;
    const beforeRevision = session.revision;
    const result = session.applyIntent({
      kind: "move",
      handleId: target!.id,
      newWorld: wp(cm(5), cm(6))
    });

    expect(result.kind).toBe("unsupported");
    expect(session.source).toBe(beforeSource);
    expect(session.revision).toBe(beforeRevision);
  });
});
