import type { Vec2 as Point } from "./line";

/** Solve the projective map from four output corners to source pixels. */
export function homography(source: Point[], target: Point[]): number[] {
  if (source.length !== 4 || target.length !== 4)
    throw new Error("Choose four corners.");
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = target[i],
      { x: u, y: v } = source[i];
    if (![x, y, u, v].every(Number.isFinite))
      throw new Error("Invalid corner coordinates.");
    a.push(
      [x, y, 1, 0, 0, 0, -u * x, -u * y, u],
      [0, 0, 0, x, y, 1, -v * x, -v * y, v],
    );
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++)
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    if (Math.abs(divisor) < 1e-10)
      throw new Error(
        "Corners are degenerate; choose a flat, convex quadrilateral.",
      );
    a[col] = a[col].map((v) => v / divisor);
    for (let row = 0; row < 8; row++)
      if (row !== col) {
        const factor = a[row][col];
        a[row] = a[row].map((v, j) => v - factor * a[col][j]);
      }
  }
  return [...a.map((row) => row[8]), 1];
}
export function project(h: number[], p: Point): Point {
  const d = h[6] * p.x + h[7] * p.y + h[8];
  if (Math.abs(d) < 1e-10) throw new Error("Perspective crosses infinity.");
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / d,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / d,
  };
}
export function validateCorners(points: Point[]) {
  if (points.length !== 4)
    throw new Error("Choose four corners clockwise from top left.");
  const crosses = points.map((p, i) => {
    const b = points[(i + 1) % 4],
      c = points[(i + 2) % 4];
    return (b.x - p.x) * (c.y - b.y) - (b.y - p.y) * (c.x - b.x);
  });
  if (!crosses.every((v) => v > 1) && !crosses.every((v) => v < -1))
    throw new Error(
      "Corners must form a convex quadrilateral in perimeter order.",
    );
}
export function calibrationScale(a: Point, b: Point, distanceMm: number) {
  const pixels = Math.hypot(a.x - b.x, a.y - b.y);
  if (
    !Number.isFinite(distanceMm) ||
    distanceMm <= 0 ||
    distanceMm > 1e7 ||
    pixels < 1 ||
    !Number.isFinite(pixels)
  )
    throw new Error(
      "Choose two distinct points and a positive known distance in mm.",
    );
  return distanceMm / pixels;
}
