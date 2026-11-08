import { expect, it } from "vitest";
import { cubicTouchesBox, lineTouchesBox, selectionBounds } from "./bounds";
import type { Cubic } from "./bezier";
const box = selectionBounds({ x: 10, y: 10 }, { x: 20, y: 20 });
it.each([
  [
    { x: 0, y: 15 },
    { x: 30, y: 15 },
  ],
  [
    { x: 15, y: 0 },
    { x: 15, y: 30 },
  ],
  [
    { x: 0, y: 10 },
    { x: 30, y: 10 },
  ],
  [
    { x: 0, y: 20 },
    { x: 20, y: 0 },
  ],
  [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ],
  [
    { x: 12, y: 12 },
    { x: 18, y: 18 },
  ],
])(
  "selects lines crossing, contained in or touching the box: %j to %j",
  (a, b) => {
    expect(lineTouchesBox(a, b, box)).toBe(true);
    expect(lineTouchesBox(b, a, box)).toBe(true);
  },
);
it.each([
  [
    { x: 0, y: 9 },
    { x: 30, y: 9 },
  ],
  [
    { x: 0, y: 19 },
    { x: 19, y: 0 },
  ],
  [
    { x: 0, y: 0 },
    { x: 9, y: 9 },
  ],
])(
  "excludes lines missing the box even if their bounds overlap: %j to %j",
  (a, b) => {
    expect(lineTouchesBox(a, b, box)).toBe(false);
  },
);
const curve: Cubic = [
  { x: 0, y: 0 },
  { x: 100 / 3, y: 40 },
  { x: 200 / 3, y: 40 },
  { x: 100, y: 0 },
];
it("selects a curve crossing the box with both endpoints outside", () => {
  expect(
    cubicTouchesBox(curve, selectionBounds({ x: 40, y: 20 }, { x: 60, y: 35 })),
  ).toBe(true);
});
it("includes tangent contact with a box border or corner", () => {
  expect(
    cubicTouchesBox(curve, selectionBounds({ x: 49, y: 30 }, { x: 51, y: 35 })),
  ).toBe(true);
  expect(
    cubicTouchesBox(curve, selectionBounds({ x: 50, y: 30 }, { x: 60, y: 35 })),
  ).toBe(true);
});
it("excludes empty space inside curve bounds and boxes just beyond a tangent", () => {
  expect(
    cubicTouchesBox(curve, selectionBounds({ x: 40, y: 0 }, { x: 60, y: 10 })),
  ).toBe(false);
  expect(
    cubicTouchesBox(
      curve,
      selectionBounds({ x: 49, y: 30.001 }, { x: 51, y: 35 }),
    ),
  ).toBe(false);
});
it("includes curves contained in the box or with an endpoint inside", () => {
  expect(
    cubicTouchesBox(
      curve,
      selectionBounds({ x: -1, y: -1 }, { x: 101, y: 41 }),
    ),
  ).toBe(true);
  expect(
    cubicTouchesBox(curve, selectionBounds({ x: -1, y: -1 }, { x: 1, y: 1 })),
  ).toBe(true);
});
it("handles a cubic coincident with a box boundary", () => {
  const boundary: Cubic = [
    { x: 0, y: 10 },
    { x: 10, y: 10 },
    { x: 20, y: 10 },
    { x: 30, y: 10 },
  ];
  expect(cubicTouchesBox(boundary, box)).toBe(true);
  expect(
    cubicTouchesBox(boundary.map((p) => ({ x: p.y, y: p.x })) as Cubic, box),
  ).toBe(true);
});
