import { expect, it } from "vitest";
import { exactDraftEndpoint, rectangleDimensions } from "./draftInput";
import { distance } from "../geometry/line";
import { autoPanDelta } from "./autoPan";
it("keeps explicit exact lengths and angles independent of grid or display units", () => {
  const start = { x: 13, y: 27 };
  const end = exactDraftEndpoint(start, "125 mm", 30, 10);
  expect(distance(start, end)).toBeCloseTo(125, 12);
  expect(rectangleDimensions("180 mm", "24 cm", 25.4)).toEqual({
    width: 180,
    height: 240,
  });
  expect(() => exactDraftEndpoint(start, "0", 0, 1)).toThrow();
  expect(() => exactDraftEndpoint(start, "1", "", 1)).toThrow();
  expect(() => rectangleDimensions("", 10, 1)).toThrow();
});
it("pans proportionally near borders, stops away from edges and caps delayed frames", () => {
  const size = { width: 800, height: 600 };
  expect(autoPanDelta({ x: 400, y: 300 }, size, 16)).toEqual({ x: 0, y: 0 });
  expect(autoPanDelta({ x: 0, y: 300 }, size, 1000)).toEqual({ x: 15, y: 0 });
  expect(autoPanDelta({ x: 800, y: 600 }, size, 10)).toEqual({ x: -3, y: -3 });
  expect(autoPanDelta({ x: -1, y: -1 }, size, 16)).toEqual({ x: 0, y: 0 });
});
