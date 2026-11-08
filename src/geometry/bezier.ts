import { distance, lerp, project, type Vec2 } from "./line";
export type Cubic = [Vec2, Vec2, Vec2, Vec2];
export function splitCubic(c: Cubic, t: number): [Cubic, Cubic] {
  const a = lerp(c[0], c[1], t),
    b = lerp(c[1], c[2], t),
    d = lerp(c[2], c[3], t);
  const e = lerp(a, b, t),
    f = lerp(b, d, t),
    p = lerp(e, f, t);
  return [
    [c[0], a, e, p],
    [p, f, d, c[3]],
  ];
}
export const cubicPoint = (c: Cubic, t: number) => splitCubic(c, t)[0][3];
// Chord and control-polygon lengths bound arc length. Allocate the error budget
// across subdivision so the sum remains within 0.001 mm for normal drafts.
export function cubicLength(c: Cubic, tolerance = 0.001, depth = 0): number {
  const chord = distance(c[0], c[3]);
  const polygon =
    distance(c[0], c[1]) + distance(c[1], c[2]) + distance(c[2], c[3]);
  if (polygon - chord <= 2 * tolerance || depth >= 24)
    return (polygon + chord) / 2;
  const [a, b] = splitCubic(c, 0.5);
  return (
    cubicLength(a, tolerance / 2, depth + 1) +
    cubicLength(b, tolerance / 2, depth + 1)
  );
}
export function cubicParameterAtLength(c: Cubic, length: number): number {
  const total = cubicLength(c);
  if (length <= 0) return 0;
  if (length >= total) return 1;
  let low = 0,
    high = 1;
  for (let i = 0; i < 35; i++) {
    const t = (low + high) / 2;
    if (cubicLength(splitCubic(c, t)[0]) < length) low = t;
    else high = t;
  }
  return (low + high) / 2;
}
export function projectCubic(c: Cubic, p: Vec2): number {
  let best = { gap: Infinity, t: 0, low: 0, high: 1 };
  const visit = (part: Cubic, low: number, high: number, depth: number) => {
    const chord = distance(part[0], part[3]);
    const polygon =
      distance(part[0], part[1]) +
      distance(part[1], part[2]) +
      distance(part[2], part[3]);
    if (polygon - chord < 0.001 || depth >= 20) {
      const ratio = project(part[0], part[3], p),
        q = lerp(part[0], part[3], ratio),
        gap = distance(q, p);
      if (gap < best.gap)
        best = { gap, t: low + (high - low) * ratio, low, high };
      return;
    }
    const [a, b] = splitCubic(part, 0.5),
      mid = (low + high) / 2;
    visit(a, low, mid, depth + 1);
    visit(b, mid, high, depth + 1);
  };
  visit(c, 0, 1, 0);
  let { low, high } = best;
  for (let i = 0; i < 35; i++) {
    const a = low + (high - low) / 3,
      b = high - (high - low) / 3;
    if (distance(cubicPoint(c, a), p) < distance(cubicPoint(c, b), p)) high = b;
    else low = a;
  }
  return [0, 1, best.t, (low + high) / 2].sort(
    (a, b) => distance(cubicPoint(c, a), p) - distance(cubicPoint(c, b), p),
  )[0];
}
// Roots of one coordinate minus a reference value. Derivative roots divide the
// cubic into monotone intervals, including tangencies at interval boundaries.
export function cubicAxisParameters(
  c: Cubic,
  axis: "x" | "y",
  value: number,
): number[] {
  const [p0, p1, p2, p3] = c.map((p) => p[axis]);
  const a = -p0 + 3 * p1 - 3 * p2 + p3,
    b = 3 * p0 - 6 * p1 + 3 * p2,
    d = -3 * p0 + 3 * p1,
    e = p0 - value;
  const evaluate = (t: number) => ((a * t + b) * t + d) * t + e;
  const boundaries = [0, 1];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) boundaries.push(-d / (2 * b));
  } else {
    const discriminant = 4 * b * b - 12 * a * d;
    if (discriminant >= 0) {
      boundaries.push(
        (-2 * b - Math.sqrt(discriminant)) / (6 * a),
        (-2 * b + Math.sqrt(discriminant)) / (6 * a),
      );
    }
  }
  const stops = boundaries
    .filter((t) => t >= 0 && t <= 1)
    .sort((x, y) => x - y);
  if ([a, b, d, e].every((v) => Math.abs(v) < 1e-12)) return [];
  const roots: number[] = [];
  const add = (t: number) => {
    if (!roots.some((r) => Math.abs(r - t) < 1e-8)) roots.push(t);
  };
  for (const t of stops) if (Math.abs(evaluate(t)) < 1e-8) add(t);
  for (let i = 1; i < stops.length; i++) {
    let low = stops[i - 1],
      high = stops[i];
    const sign = evaluate(low);
    if (sign * evaluate(high) >= 0) continue;
    for (let j = 0; j < 50; j++) {
      const mid = (low + high) / 2;
      if (evaluate(mid) * sign > 0) low = mid;
      else high = mid;
    }
    add((low + high) / 2);
  }
  return roots.sort((x, y) => x - y);
}
