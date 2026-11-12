import { lineIntersections } from "./intersections";
import { splitCubic, type Cubic } from "./bezier";
import { distance, lerp, project, type Vec2 } from "./line";

export type OffsetEdge = { curve: Cubic; cubic: boolean; width: number };
export type OffsetOptions = {
  join: "miter" | "round" | "bevel";
  miterLimit: number;
};
export const OFFSET_TOLERANCE_MM = 0.05;
const EPS = 1e-8;
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x;
const add = (p: Vec2, d: Vec2, t: number): Vec2 => ({
  x: p.x + d.x * t,
  y: p.y + d.y * t,
});
const fail = () => {
  throw new Error(
    "Cut outline is unresolved or self-crossing. Reduce the allowance or soften the corner.",
  );
};
function area(points: Vec2[]) {
  const o = points[0];
  return (
    points.reduce(
      (s, p, i) =>
        s + cross(sub(p, o), sub(points[(i + 1) % points.length], o)),
      0,
    ) / 2
  );
}
function simple(points: Vec2[]) {
  if (points.length < 3 || Math.abs(area(points)) < EPS) fail();
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (distance(a, b) < EPS) fail();
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      const c = points[j],
        d = points[(j + 1) % points.length];
      if (
        Math.max(a.x, b.x) + EPS < Math.min(c.x, d.x) ||
        Math.max(c.x, d.x) + EPS < Math.min(a.x, b.x) ||
        Math.max(a.y, b.y) + EPS < Math.min(c.y, d.y) ||
        Math.max(c.y, d.y) + EPS < Math.min(a.y, b.y)
      )
        continue;
      try {
        if (lineIntersections(a, b, c, d).length) fail();
      } catch {
        fail();
      }
    }
  }
}
/** Control hull distance bounds the flattened cubic's Hausdorff error by 0.005 mm.
 * A derivative control cone bounds the normal displacement error by 0.01 mm.
 * Subdivision/work limits reject unresolved cusps rather than claiming accuracy. */
function flatten(c: Cubic, width: number, out: Vec2[], depth = 0) {
  if (out.length > 12000 || depth > 24) fail();
  const chord = sub(c[3], c[0]),
    len = distance(c[0], c[3]);
  const flat = c
    .slice(1, 3)
    .every(
      (p) =>
        distance(p, lerp(c[0], c[3], project(c[0], c[3], p))) <=
        OFFSET_TOLERANCE_MM / 10,
    );
  const cone = c.slice(1).every((p, i) => {
    const v = sub(p, c[i]),
      l = Math.hypot(v.x, v.y);
    return (
      l < EPS ||
      (v.x * chord.x + v.y * chord.y > 0 &&
        (width * Math.abs(cross(v, chord))) / (l * len) <=
          OFFSET_TOLERANCE_MM / 5)
    );
  });
  if (len > EPS && flat && cone) {
    out.push(c[3]);
    return;
  }
  const [a, b] = splitCubic(c, 0.5);
  flatten(a, width, out, depth + 1);
  flatten(b, width, out, depth + 1);
}
export function offsetOutline(
  edges: OffsetEdge[],
  options: OffsetOptions,
): Vec2[] {
  if (
    edges.length < 3 ||
    !["miter", "round", "bevel"].includes(options.join) ||
    !Number.isFinite(options.miterLimit) ||
    options.miterLimit < 1 ||
    options.miterLimit > 20
  )
    fail();
  const points: Vec2[] = [],
    widths: number[] = [],
    corners: boolean[] = [];
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (
      !Number.isFinite(edge.width) ||
      edge.width < 0 ||
      edge.width > 1000 ||
      edge.curve.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
    )
      fail();
    if (distance(edge.curve[3], edges[(i + 1) % edges.length].curve[0]) > EPS)
      fail();
    const samples = [edge.curve[0]];
    if (edge.cubic) flatten(edge.curve, edge.width, samples);
    else samples.push(edge.curve[3]);
    samples.pop();
    for (let j = 0; j < samples.length; j++) {
      points.push(samples[j]);
      widths.push(edge.width);
      corners.push(j === 0);
      if (points.length > 12000) fail();
    }
  }
  simple(points);
  const sign = Math.sign(area(points));
  const directions = points.map((p, i) => {
    const q = points[(i + 1) % points.length],
      l = distance(p, q);
    return { x: (q.x - p.x) / l, y: (q.y - p.y) / l };
  });
  const normals = directions.map((d) => ({ x: sign * d.y, y: -sign * d.x }));
  const out: Vec2[] = [];
  const joins: { first: Vec2; last: Vec2 }[] = [];
  const push = (p: Vec2) => {
    if (out.length >= 12000) fail();
    if (
      Math.abs(p.x) > 1e7 ||
      Math.abs(p.y) > 1e7 ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y)
    )
      fail();
    if (!out.length || distance(out.at(-1)!, p) > EPS) out.push(p);
  };
  for (let i = 0; i < points.length; i++) {
    const prev = (i + points.length - 1) % points.length,
      p = points[i],
      u = directions[prev],
      v = directions[i];
    const a = add(p, normals[prev], widths[prev]),
      b = add(p, normals[i], widths[i]);
    const det = cross(u, v),
      convex = det * sign > 0,
      w = Math.max(widths[prev], widths[i]);
    const startIndex = out.length;
    const remember = () => {
      joins.push({ first: out[startIndex] ?? out.at(-1)!, last: out.at(-1)! });
    };
    if (w === 0) {
      push(p);
      remember();
      continue;
    }
    if (Math.abs(det) < 1e-10) {
      if (u.x * v.x + u.y * v.y < 0) fail();
      push(a);
      push(b);
      remember();
      continue;
    }
    const intersection = add(a, u, cross(sub(b, a), v) / det);
    if (!convex || !corners[i]) {
      if (distance(p, intersection) > Math.max(w * 20, 0.1)) fail();
      push(intersection);
    } else if (
      options.join === "miter" &&
      distance(p, intersection) <= w * options.miterLimit
    )
      push(intersection);
    else if (
      options.join === "round" &&
      Math.abs(widths[prev] - widths[i]) < EPS
    ) {
      const start = Math.atan2(a.y - p.y, a.x - p.x),
        sweep = Math.atan2(det, u.x * v.x + u.y * v.y);
      const steps = Math.max(
        1,
        Math.ceil(
          Math.abs(sweep) /
            (2 * Math.acos(Math.max(-1, 1 - OFFSET_TOLERANCE_MM / (10 * w)))),
        ),
      );
      for (let j = 0; j <= steps; j++)
        push({
          x: p.x + w * Math.cos(start + (sweep * j) / steps),
          y: p.y + w * Math.sin(start + (sweep * j) / steps),
        });
    } else {
      push(a);
      push(b);
    }
    remember();
  }
  for (let i = 0; i < joins.length; i++) {
    const delta = sub(joins[(i + 1) % joins.length].first, joins[i].last),
      d = directions[i];
    if (delta.x * d.x + delta.y * d.y < -EPS) fail();
  }
  if (out.length > 1 && distance(out[0], out.at(-1)!) < EPS) out.pop();
  simple(out);
  if (area(out) * sign <= 0) fail();
  return out;
}
