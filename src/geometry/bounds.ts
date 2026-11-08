import { cubicAxisParameters, cubicPoint, type Cubic } from "./bezier";
import type { Vec2 } from "./line";
export type Bounds = { min: Vec2; max: Vec2 };
export function selectionBounds(a: Vec2, b: Vec2): Bounds {
  return {
    min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
  };
}
function containsPoint(box: Bounds, point: Vec2, tolerance = 0) {
  return (
    point.x >= box.min.x - tolerance &&
    point.x <= box.max.x + tolerance &&
    point.y >= box.min.y - tolerance &&
    point.y <= box.max.y + tolerance
  );
}
export function lineTouchesBox(a: Vec2, b: Vec2, box: Bounds): boolean {
  let start = 0,
    end = 1;
  for (const axis of ["x", "y"] as const) {
    const delta = b[axis] - a[axis];
    if (delta === 0) {
      if (a[axis] < box.min[axis] || a[axis] > box.max[axis]) return false;
      continue;
    }
    const first = (box.min[axis] - a[axis]) / delta;
    const last = (box.max[axis] - a[axis]) / delta;
    start = Math.max(start, Math.min(first, last));
    end = Math.min(end, Math.max(first, last));
    if (start > end) return false;
  }
  return true;
}
export function cubicTouchesBox(curve: Cubic, box: Bounds): boolean {
  if (containsPoint(box, curve[0]) || containsPoint(box, curve[3])) return true;
  // An outside curve must touch a box boundary to enter it. Solve each
  // boundary in parameter space, including tangent contacts.
  for (const axis of ["x", "y"] as const) {
    for (const boundary of [box.min[axis], box.max[axis]]) {
      for (const t of cubicAxisParameters(curve, axis, boundary)) {
        // Match the root solver's coordinate tolerance, in millimetres.
        if (containsPoint(box, cubicPoint(curve, t), 1e-8)) return true;
      }
    }
  }
  return false;
}
