import { describe, expect, it } from "vitest";

import {
  nextPartIdInOrder,
  removePartOrder,
  upsertPartOrder
} from "../../packages/core/src/svg/order.js";

describe("svg part ordering", () => {
  it("inserts at the head when afterPartId is null", () => {
    const next = upsertPartOrder(["a", "b", "c"], "x", null);
    expect(next).toEqual(["x", "a", "b", "c"]);
  });

  it("moves existing parts without self-anchoring", () => {
    const next = upsertPartOrder(["a", "b"], "b", "a");
    expect(next).toEqual(["a", "b"]);
    expect(nextPartIdInOrder(next, "b")).toBeNull();
  });

  it("appends when anchor is missing", () => {
    const next = upsertPartOrder(["a", "b"], "x", "missing");
    expect(next).toEqual(["a", "b", "x"]);
  });

  it("returns next sibling id for insertion anchors", () => {
    const order = upsertPartOrder(["a", "b", "c"], "b", null);
    expect(order).toEqual(["b", "a", "c"]);
    expect(nextPartIdInOrder(order, "b")).toBe("a");
    expect(nextPartIdInOrder(order, "c")).toBeNull();
  });

  it("removes part ids from order", () => {
    expect(removePartOrder(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
});
