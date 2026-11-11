import { cubicPoint, splitCubic, type Cubic } from "./bezier";
import { distance, lerp, type Vec2 } from "./line";
export type Intersection = { t: number; u: number; point: Vec2 };
const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x;
const subtract = (a: Vec2, b: Vec2) => ({ x: a.x - b.x, y: a.y - b.y });
export function lineIntersections(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  d: Vec2,
): Intersection[] {
  const r = subtract(b, a),
    s = subtract(d, c),
    q = subtract(c, a),
    den = cross(r, s);
  if (Math.abs(den) <= 1e-12 * Math.max(1, distance(a, b) * distance(c, d))) {
    if (Math.abs(cross(q, r)) > 1e-9 * Math.max(1, distance(a, b))) return [];
    const axis = Math.abs(r.x) >= Math.abs(r.y) ? "x" : "y";
    const values = [
      (c[axis] - a[axis]) / r[axis],
      (d[axis] - a[axis]) / r[axis],
    ].sort((x, y) => x - y);
    const low = Math.max(0, values[0]),
      high = Math.min(1, values[1]);
    if (high - low > 1e-9)
      throw new Error(
        "Overlapping edges have no unique intersection points. Separate them first.",
      );
    if (high < low - 1e-9) return [];
    const t = Math.max(0, Math.min(1, (low + high) / 2)),
      point = lerp(a, b, t);
    const u =
      Math.abs(s.x) >= Math.abs(s.y)
        ? (point.x - c.x) / s.x
        : (point.y - c.y) / s.y;
    return [{ t, u: Math.max(0, Math.min(1, u)), point }];
  }
  const t = cross(q, s) / den,
    u = cross(q, r) / den;
  if (t < -1e-10 || t > 1 + 1e-10 || u < -1e-10 || u > 1 + 1e-10) return [];
  return [
    {
      t: Math.max(0, Math.min(1, t)),
      u: Math.max(0, Math.min(1, u)),
      point: lerp(a, b, Math.max(0, Math.min(1, t))),
    },
  ];
}
const bounds = (c: Cubic) => ({
  minX: Math.min(...c.map((p) => p.x)),
  maxX: Math.max(...c.map((p) => p.x)),
  minY: Math.min(...c.map((p) => p.y)),
  maxY: Math.max(...c.map((p) => p.y)),
});
function derivative(c: Cubic, t: number): Vec2 {
  const s = 1 - t;
  return {
    x:
      3 *
      (s * s * (c[1].x - c[0].x) +
        2 * s * t * (c[2].x - c[1].x) +
        t * t * (c[3].x - c[2].x)),
    y:
      3 *
      (s * s * (c[1].y - c[0].y) +
        2 * s * t * (c[2].y - c[1].y) +
        t * t * (c[3].y - c[2].y)),
  };
}
// Control hulls bound each curve. Subdivision isolates crossings, then Newton
// refinement finds parameters. Shared endpoints move by at most 0.0001 mm.
export function cubicIntersections(a: Cubic, b: Cubic): Intersection[] {
  if (
    a.every((p, i) => distance(p, b[i]) < 1e-9) ||
    a.every((p, i) => distance(p, b[3 - i]) < 1e-9)
  )
    throw new Error("Overlapping curves have no unique intersection points.");
  const hits: Intersection[] = [];
  let visits = 0;
  const visit = (
    left: Cubic,
    right: Cubic,
    t0: number,
    t1: number,
    u0: number,
    u1: number,
  ) => {
    if (++visits > 100000)
      throw new Error(
        "These curves overlap or are too close to resolve safely. No points were added.",
      );
    const x = bounds(left),
      y = bounds(right);
    if (
      x.maxX < y.minX - 1e-9 ||
      y.maxX < x.minX - 1e-9 ||
      x.maxY < y.minY - 1e-9 ||
      y.maxY < x.minY - 1e-9
    )
      return;
    const sizeA = Math.max(x.maxX - x.minX, x.maxY - x.minY),
      sizeB = Math.max(y.maxX - y.minX, y.maxY - y.minY);
    if (Math.max(sizeA, sizeB) < 1e-5 || Math.max(t1 - t0, u1 - u0) < 1e-12) {
      let t = (t0 + t1) / 2,
        u = (u0 + u1) / 2;
      for (let i = 0; i < 12; i++) {
        const p = cubicPoint(a, t),
          q = cubicPoint(b, u),
          delta = subtract(q, p),
          da = derivative(a, t),
          db = derivative(b, u),
          det = cross(da, db);
        if (Math.abs(det) < 1e-14) break;
        const nt = t + cross(delta, db) / det,
          nu = u + cross(delta, da) / det;
        // A root at an endpoint can land a few ulps outside [0, 1]. Rejecting
        // that step leaves the coarse subdivision midpoint as a false nearby
        // crossing. Clamp only parameter roundoff, not geometric near misses.
        const parameterRoundoff = 1e-12;
        if (
          nt < -parameterRoundoff ||
          nt > 1 + parameterRoundoff ||
          nu < -parameterRoundoff ||
          nu > 1 + parameterRoundoff
        )
          break;
        t = Math.max(0, Math.min(1, nt));
        u = Math.max(0, Math.min(1, nu));
      }
      const p = cubicPoint(a, t),
        q = cubicPoint(b, u);
      if (distance(p, q) > 1e-5) return;
      const point = lerp(p, q, 0.5);
      if (
        !hits.some(
          (hit) =>
            distance(hit.point, point) < 1e-4 &&
            Math.abs(hit.t - t) < 1e-4 &&
            Math.abs(hit.u - u) < 1e-4,
        )
      )
        hits.push({ t, u, point });
      return;
    }
    if (sizeA >= sizeB) {
      const [first, second] = splitCubic(left, 0.5),
        mid = (t0 + t1) / 2;
      visit(first, right, t0, mid, u0, u1);
      visit(second, right, mid, t1, u0, u1);
    } else {
      const [first, second] = splitCubic(right, 0.5),
        mid = (u0 + u1) / 2;
      visit(left, first, t0, t1, u0, mid);
      visit(left, second, t0, t1, mid, u1);
    }
  };
  visit(a, b, 0, 1, 0, 1);
  return hits.sort((x, y) => x.t - y.t);
}
