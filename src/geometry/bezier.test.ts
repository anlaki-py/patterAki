import { expect, it } from "vitest";
import {
  cubicAxisParameters,
  cubicLength,
  cubicParameterAtLength,
  cubicPoint,
  projectCubic,
  splitCubic,
  type Cubic,
} from "./bezier";
import { distance } from "./line";
const curve: Cubic = [
  { x: 0, y: 0 },
  { x: 0, y: 100 },
  { x: 100, y: 100 },
  { x: 100, y: 0 },
];
it("measures a cubic with analytic arc length 200 mm", () => {
  expect(cubicLength(curve)).toBeCloseTo(200, 3);
  expect(cubicPoint(curve, 0.5)).toEqual({ x: 50, y: 75 });
});
it("splits without changing any sampled positions", () => {
  const t = 0.37,
    [a, b] = splitCubic(curve, t);
  for (let i = 0; i <= 100; i++) {
    const u = i / 100;
    const p = u <= t ? cubicPoint(a, u / t) : cubicPoint(b, (u - t) / (1 - t));
    expect(distance(p, cubicPoint(curve, u))).toBeLessThan(1e-10);
  }
  expect(cubicLength(a) + cubicLength(b)).toBeCloseTo(cubicLength(curve), 3);
});
it("finds a parameter by true arc distance rather than parameter ratio", () => {
  const t = cubicParameterAtLength(curve, 30);
  expect(cubicLength(splitCubic(curve, t)[0])).toBeCloseTo(30, 3);
  expect(Math.abs(t - 0.15)).toBeGreaterThan(0.01);
});
it("projects onto a curve instead of its chord", () => {
  expect(projectCubic(curve, { x: 50, y: 80 })).toBeCloseTo(0.5, 5);
  expect(projectCubic(curve, curve[0])).toBe(0);
  expect(projectCubic(curve, curve[3])).toBe(1);
});
it("handles straight and collapsed cubics", () => {
  expect(
    cubicLength([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 60, y: 0 },
      { x: 100, y: 0 },
    ]),
  ).toBe(100);
  expect(
    cubicLength([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]),
  ).toBe(0);
});

it("finds both reference-line crossings and a tangency without duplicates", () => {
  const crossings = cubicAxisParameters(curve, "y", 50);
  expect(crossings).toHaveLength(2);
  for (const t of crossings) expect(cubicPoint(curve, t).y).toBeCloseTo(50, 8);
  expect(cubicAxisParameters(curve, "y", 75)).toEqual([0.5]);
  expect(cubicAxisParameters(curve, "y", 76)).toEqual([]);
});
it("does not invent isolated intersections when the whole curve lies on a reference", () => {
  const straight: Cubic = [
    { x: 0, y: 5 },
    { x: 20, y: 5 },
    { x: 80, y: 5 },
    { x: 100, y: 5 },
  ];
  expect(cubicAxisParameters(straight, "y", 5)).toEqual([]);
  expect(cubicAxisParameters(straight, "x", 0)).toEqual([0]);
  expect(cubicAxisParameters(straight, "x", 100)).toEqual([1]);
});
