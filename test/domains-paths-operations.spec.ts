import { describe, expect, it } from "vitest";

import {
  mapChildOperationItem,
  mapCoordinateOperationItem,
  mapDecorateOperationNode,
  mapPathForeachOperationItem,
  mapSvgOperationItem,
  mapToOperationItem
} from "../packages/core/src/domains/paths/operations.js";

type FakeNode = {
  type: { name: string; isAnonymous: boolean };
  from: number;
  to: number;
  firstChild: FakeNode | null;
  nextSibling: FakeNode | null;
};

function fakeNode(name: string, from: number, to: number, children: FakeNode[] = [], isAnonymous = false): FakeNode {
  const node: FakeNode = {
    type: { name, isAnonymous },
    from,
    to,
    firstChild: null,
    nextSibling: null
  };
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    child.nextSibling = children[index + 1] ?? null;
    if (index === 0) {
      node.firstChild = child;
    }
  }
  return node;
}

describe("domain path operation mappers", () => {
  it("maps incomplete child operations to an empty body without options or foreach clauses", () => {
    const source = "child";
    const mapped = mapChildOperationItem(fakeNode("ChildOperation", 0, source.length) as never, source, 2, 3);

    expect(mapped.bodyRaw).toBe("{}");
    expect(mapped.body).toEqual([]);
    expect(mapped.options).toBeUndefined();
    expect(mapped.foreachClauses).toBeUndefined();
    expect(mapped.templateRaw).toBe("child");
  });

  it("maps incomplete decorate, foreach, and to operations without assuming parser children", () => {
    const decorate = mapDecorateOperationNode(fakeNode("DecorateOperation", 0, 8) as never, "decorate", 0, 0);
    expect(decorate.raw).toBe("decorate");
    expect(decorate.subpathRaw).toBe("decorate");
    expect(decorate.options).toBeUndefined();

    const foreach = mapPathForeachOperationItem(fakeNode("PathForeach", 0, 7) as never, "foreach", 0, 1);
    expect(foreach.commandRaw).toBe("foreach");
    expect(foreach.bodyRaw).toBe("");
    expect(foreach.options).toBeUndefined();
    expect(foreach.optionsSpan).toBeUndefined();

    const to = mapToOperationItem(fakeNode("ToOperation", 0, 2) as never, "to", 0, 2);
    expect(to.target).toBeUndefined();
    expect(to.nodes).toBeUndefined();
  });

  it("maps coordinate operation names from missing, numeric, and malformed coordinate nodes", () => {
    const missing = mapCoordinateOperationItem(fakeNode("CoordinateOperation", 0, 10) as never, "coordinate", 0, 0);
    expect(missing.name).toBeUndefined();
    expect(missing.nameSpan).toBeUndefined();

    const numericSource = "coordinate (1,2)";
    const numeric = mapCoordinateOperationItem(
      fakeNode("CoordinateOperation", 0, numericSource.length, [fakeNode("Coordinate", 11, 16)]) as never,
      numericSource,
      0,
      1
    );
    expect(numeric.name).toBe("1,2");

    const malformedSource = "coordinate {bad}";
    const malformed = mapCoordinateOperationItem(
      fakeNode("CoordinateOperation", 0, malformedSource.length, [fakeNode("Coordinate", 11, 16)]) as never,
      malformedSource,
      0,
      2
    );
    expect(malformed.name).toBeUndefined();
  });

  it("maps svg operations with missing and anonymous payload wrappers", () => {
    const missing = mapSvgOperationItem(fakeNode("SvgOperation", 0, 4) as never, "svg ", 1, 0);
    expect(missing.dataRaw).toBe("");
    expect(missing.dataSpan).toBeUndefined();

    const source = "svg {M0 0}";
    const anonymousPayload = fakeNode("SvgPayloadText", 5, 9, [], true);
    const payloadWrapper = fakeNode("SvgPayload", 4, 10, [anonymousPayload]);
    const wrapped = mapSvgOperationItem(
      fakeNode("SvgOperation", 0, source.length, [payloadWrapper]) as never,
      source,
      1,
      1
    );
    expect(wrapped.dataRaw).toBe("{M0 0}");
    expect(wrapped.dataSpan).toEqual({ from: 4, to: 10 });
  });
});
