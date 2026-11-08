import { expect, it } from "vitest";
import { cubicIntersections, lineIntersections } from "./intersections";
import { type Cubic, cubicPoint } from "./bezier";
import { distance, lerp } from "./line";
const arch: Cubic = [
  { x: 0, y: 0 },
  { x: 0, y: 100 },
  { x: 100, y: 100 },
  { x: 100, y: 0 },
];
const horizontal = (y: number): Cubic => [
  { x: -10, y },
  { x: 30, y },
  { x: 70, y },
  { x: 110, y },
];
it("finds exact straight crossings and endpoint touches", () => {
  expect(
    lineIntersections(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 25, y: -20 },
      { x: 25, y: 20 },
    ),
  ).toEqual([{ t: 0.25, u: 0.5, point: { x: 25, y: 0 } }]);
  expect(
    lineIntersections(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 20 },
    ),
  ).toHaveLength(1);
});
it("ignores parallel disjoint edges but rejects overlapping edges", () => {
  expect(
    lineIntersections(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 10 },
      { x: 100, y: 10 },
    ),
  ).toEqual([]);
  expect(() =>
    lineIntersections(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 20, y: 0 },
      { x: 120, y: 0 },
    ),
  ).toThrow("Overlapping");
});
it("finds both curve/line crossings and refines the curve parameters", () => {
  const hits = cubicIntersections(arch, horizontal(50));
  expect(hits).toHaveLength(2);
  for (const hit of hits) {
    expect(hit.point.y).toBeCloseTo(50, 5);
    expect(
      distance(cubicPoint(arch, hit.t), cubicPoint(horizontal(50), hit.u)),
    ).toBeLessThan(1e-5);
  }
});
it("finds tangency once and rejects a near miss", () => {
  const hits = cubicIntersections(arch, horizontal(75));
  expect(hits).toHaveLength(1);
  expect(hits[0].point.x).toBeCloseTo(50, 3);
  expect(cubicIntersections(arch, horizontal(75.01))).toEqual([]);
});
it("finds crossings between two curved segments", () => {
  const other: Cubic = arch.map((p) => ({ x: p.x, y: 100 - p.y })) as Cubic;
  const hits = cubicIntersections(arch, other);
  expect(hits).toHaveLength(2);
  for (const hit of hits)
    expect(
      distance(cubicPoint(arch, hit.t), cubicPoint(other, hit.u)),
    ).toBeLessThan(1e-5);
});
it("rejects coincident curves and supports a straight cubic crossing", () => {
  expect(() => cubicIntersections(arch, arch)).toThrow("Overlapping");
  const a = { x: 50, y: -10 },
    b = { x: 50, y: 100 },
    vertical: Cubic = [a, lerp(a, b, 1 / 3), lerp(a, b, 2 / 3), b];
  expect(cubicIntersections(arch, vertical)).toHaveLength(1);
});
