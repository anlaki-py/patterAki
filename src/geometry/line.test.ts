import { describe, expect, it } from "vitest";
import { distance, endpoint, project, resizeLine } from "./line";
import { snapPoint } from "./snapping";
describe("millimetre line geometry", () => {
  it.each([
    ["start", 120, 0, 120],
    ["end", 120, -20, 100],
    ["center", 120, -10, 110],
    ["start", 80, 0, 80],
    ["end", 80, 20, 100],
    ["center", 80, 10, 90],
  ] as const)("%s anchor for %s mm", (anchor, length, x1, x2) => {
    const [a, b] = resizeLine({ x: 0, y: 0 }, { x: 100, y: 0 }, length, anchor);
    expect(a.x).toBeCloseTo(x1, 10);
    expect(b.x).toBeCloseTo(x2, 10);
    expect(distance(a, b)).toBeCloseTo(length, 10);
  });
  it("preserves midpoint and direction on a diagonal", () => {
    const [a, b] = resizeLine(
      { x: -30, y: 15 },
      { x: 30, y: 95 },
      125,
      "center",
    );
    expect(distance(a, b)).toBeCloseTo(125, 10);
    expect((a.x + b.x) / 2).toBeCloseTo(0, 10);
    expect((a.y + b.y) / 2).toBeCloseTo(55, 10);
  });
  it.each([0, -1, NaN, Infinity])("rejects invalid length %s", (length) =>
    expect(() =>
      resizeLine({ x: 0, y: 0 }, { x: 100, y: 0 }, length, "start"),
    ).toThrow(),
  );
  it("rejects a zero-length source", () =>
    expect(() =>
      resizeLine({ x: 0, y: 0 }, { x: 0, y: 0 }, 10, "start"),
    ).toThrow());
  it("projects onto a bounded segment", () => {
    expect(project({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 25, y: 30 })).toBe(
      0.25,
    );
    expect(project({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 150, y: 30 })).toBe(
      1,
    );
  });
  it("keeps typed length exact", () =>
    expect(
      distance({ x: 0, y: 0 }, endpoint({ x: 0, y: 0 }, 125, 37)),
    ).toBeCloseTo(125, 10));
});
describe("snap priorities", () => {
  it("prefers endpoints over a closer grid target", () =>
    expect(
      snapPoint({ x: 10, y: 10 }, [{ x: 12, y: 10 }], [], 4, undefined, true),
    ).toEqual({ point: { x: 12, y: 10 }, label: "Endpoint" }));
  it("uses midpoint then axis alignment", () => {
    expect(
      snapPoint(
        { x: 51, y: 1 },
        [],
        [
          [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
        ],
        4,
      ).label,
    ).toBe("Midpoint");
    expect(snapPoint({ x: 30, y: 2 }, [], [], 4, { x: 0, y: 0 }).point).toEqual(
      { x: 30, y: 0 },
    );
  });
  it("converts screen tolerance without moving saved candidates", () => {
    const p = { x: 50, y: 0 };
    expect(snapPoint({ x: 53, y: 0 }, [p], [], 8 / 2).point).toBe(p);
    expect(snapPoint({ x: 53, y: 0 }, [p], [], 8 / 4).point).toEqual({
      x: 53,
      y: 0,
    });
    expect(snapPoint({ x: 53, y: 0 }, [p], [], 8 / 4).label).toBe("Horizontal");
  });
});
