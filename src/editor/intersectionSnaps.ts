import type { PatternDocument } from "../document/schema";
import { asCubic, type Segment } from "../document/segments";
import type { Cubic } from "../geometry/bezier";
import {
  cubicIntersections,
  lineIntersections,
  type Intersection,
} from "../geometry/intersections";
import { distance, type Vec2 } from "../geometry/line";
import type { Snap } from "../geometry/snapping";
type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
const HIT_EPSILON = 1e-10;
const WELD_TOLERANCE = 1e-4;
const AMBIGUOUS_INTERSECTION = /overlap|too close to resolve/i;
function controlHull(cubic: Cubic): Bounds {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const point of cubic) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, maxX, minY, maxY };
}
function contains(bounds: Bounds, point: Vec2, tolerance: number) {
  return (
    point.x >= bounds.minX - tolerance &&
    point.x <= bounds.maxX + tolerance &&
    point.y >= bounds.minY - tolerance &&
    point.y <= bounds.maxY + tolerance
  );
}
function overlap(a: Bounds, b: Bounds) {
  return (
    a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY
  );
}
function isKnownAmbiguousIntersection(error: unknown) {
  return error instanceof Error && AMBIGUOUS_INTERSECTION.test(error.message);
}
function usable(hit: Intersection) {
  return (
    Number.isFinite(hit.t) &&
    Number.isFinite(hit.u) &&
    Number.isFinite(hit.point.x) &&
    Number.isFinite(hit.point.y) &&
    hit.t >= -HIT_EPSILON &&
    hit.t <= 1 + HIT_EPSILON &&
    hit.u >= -HIT_EPSILON &&
    hit.u <= 1 + HIT_EPSILON
  );
}
const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function compareCandidates(pointer: Vec2, a: Snap, b: Snap) {
  const byDistance = distance(pointer, a.point) - distance(pointer, b.point);
  if (byDistance !== 0) return byDistance;
  const byEdge = compareIds(a.edgeId ?? "", b.edgeId ?? "");
  if (byEdge !== 0) return byEdge;
  const byParameter = (a.t ?? 0) - (b.t ?? 0);
  if (byParameter !== 0) return byParameter;
  const byX = a.point.x - b.point.x;
  return byX !== 0 ? byX : a.point.y - b.point.y;
}
export function intersectionSnaps(
  doc: PatternDocument,
  pointer: Vec2,
  toleranceMm: number,
  movingPoint?: string,
): Snap[] {
  if (
    !Number.isFinite(pointer.x) ||
    !Number.isFinite(pointer.y) ||
    !Number.isFinite(toleranceMm) ||
    toleranceMm <= 0
  )
    return [];
  const nearby: { edge: Segment; cubic: Cubic; bounds: Bounds }[] = [];
  for (const edge of Object.values(doc.segments)) {
    if (edge.from === movingPoint || edge.to === movingPoint) continue;
    const cubic = asCubic(doc, edge);
    const bounds = controlHull(cubic);
    if (contains(bounds, pointer, toleranceMm))
      nearby.push({ edge, cubic, bounds });
  }
  nearby.sort((a, b) => compareIds(a.edge.id, b.edge.id));
  const results: Snap[] = [];
  for (let i = 0; i < nearby.length; i++) {
    for (let j = i + 1; j < nearby.length; j++) {
      const a = nearby[i],
        b = nearby[j];
      if (!overlap(a.bounds, b.bounds)) continue;
      let hits: Intersection[];
      try {
        hits =
          a.edge.kind === "line" && b.edge.kind === "line"
            ? lineIntersections(
                doc.points[a.edge.from],
                doc.points[a.edge.to],
                doc.points[b.edge.from],
                doc.points[b.edge.to],
              )
            : cubicIntersections(a.cubic, b.cubic);
      } catch (error) {
        // Coincident/overlapping pairs have no unique crossing. Skip that pair
        // only; unrelated solver failures must stay visible.
        if (isKnownAmbiguousIntersection(error)) continue;
        throw error;
      }
      for (const hit of hits) {
        if (!usable(hit) || distance(pointer, hit.point) > toleranceMm)
          continue;
        if (
          results.some(
            (candidate) =>
              distance(candidate.point, hit.point) < WELD_TOLERANCE,
          )
        )
          continue;
        results.push({
          point: hit.point,
          label: "Intersection",
          edgeId: a.edge.id,
          t: Math.min(1, Math.max(0, hit.t)),
        });
      }
    }
  }
  return results.sort((a, b) => compareCandidates(pointer, a, b));
}
