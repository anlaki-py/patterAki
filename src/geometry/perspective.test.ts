import { describe, expect, it } from "vitest";
import {
  calibrationScale,
  homography,
  project,
  validateCorners,
} from "./perspective";

describe("reference photo geometry", () => {
  it("calibrates a 100 mm ruler independent of display scale", () => {
    expect(calibrationScale({ x: 10, y: 20 }, { x: 310, y: 420 }, 100)).toBe(
      0.2,
    );
    expect(
      500 * calibrationScale({ x: 10, y: 20 }, { x: 310, y: 420 }, 100),
    ).toBe(100);
  });
  it("maps every corner and interior points through a projective correction", () => {
    const flat = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ];
    const photo = [
      { x: 20, y: 10 },
      { x: 270, y: 30 },
      { x: 220, y: 180 },
      { x: 30, y: 150 },
    ];
    validateCorners(photo);
    const h = homography(photo, flat),
      inverse = homography(flat, photo);
    flat.forEach((p, i) => {
      expect(project(h, p).x).toBeCloseTo(photo[i].x, 8);
      expect(project(h, p).y).toBeCloseTo(photo[i].y, 8);
    });
    const restored = project(inverse, project(h, { x: 80, y: 60 }));
    expect(restored.x).toBeCloseTo(80, 8);
    expect(restored.y).toBeCloseTo(60, 8);
  });
  it("rejects zero scales, coincident points, crossing or degenerate corners", () => {
    expect(() =>
      calibrationScale({ x: 0, y: 0 }, { x: 0, y: 0 }, 100),
    ).toThrow();
    expect(() =>
      calibrationScale({ x: 0, y: 0 }, { x: 100, y: 0 }, 0),
    ).toThrow();
    expect(() =>
      validateCorners([
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        { x: 100, y: 0 },
        { x: 0, y: 100 },
      ]),
    ).toThrow();
    expect(() =>
      homography(Array(4).fill({ x: 0, y: 0 }), Array(4).fill({ x: 0, y: 0 })),
    ).toThrow();
  });
});
