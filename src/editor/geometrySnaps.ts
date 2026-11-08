import type { PatternDocument } from "../document/schema";
import {
  asCubic,
  segmentPoint,
  segmentProjection,
  type Segment,
} from "../document/segments";
import {
  cubicAxisParameters,
  cubicLength,
  cubicParameterAtLength,
} from "../geometry/bezier";
import { distance, type Vec2 } from "../geometry/line";
import { alignmentReferences, guidesAt, type Snap } from "../geometry/snapping";
import { intersectionSnaps } from "./intersectionSnaps";
const midpointCache = new WeakMap<
  PatternDocument,
  Map<string, { point: Vec2; t: number }>
>();
function midpoint(doc: PatternDocument, edge: Segment) {
  let cache = midpointCache.get(doc);
  if (!cache) {
    cache = new Map();
    midpointCache.set(doc, cache);
  }
  let result = cache.get(edge.id);
  if (!result) {
    const c = edge.kind === "cubic" ? asCubic(doc, edge) : undefined;
    const t = c ? cubicParameterAtLength(c, cubicLength(c) / 2) : 0.5;
    result = { point: segmentPoint(doc, edge, t), t };
    cache.set(edge.id, result);
  }
  return result;
}
export function geometrySnaps(
  doc: PatternDocument,
  point: Vec2,
  tolerance: number,
  refs: Vec2[],
  movingPoint?: string,
) {
  const midpoints: Snap[] = [],
    edges: Snap[] = [],
    alignedEdges: Snap[] = [];
  for (const edge of Object.values(doc.segments)) {
    if (edge.from === movingPoint || edge.to === movingPoint) continue;
    const hull = asCubic(doc, edge);
    if (
      point.x < Math.min(...hull.map((p) => p.x)) - tolerance ||
      point.x > Math.max(...hull.map((p) => p.x)) + tolerance ||
      point.y < Math.min(...hull.map((p) => p.y)) - tolerance ||
      point.y > Math.max(...hull.map((p) => p.y)) + tolerance
    )
      continue;
    const middle = midpoint(doc, edge);
    midpoints.push({ ...middle, edgeId: edge.id, label: "Midpoint" });
    const t = segmentProjection(doc, edge, point),
      projected = segmentPoint(doc, edge, t);
    if (distance(projected, point) > tolerance) continue;
    edges.push({ point: projected, t, edgeId: edge.id, label: "On edge" });
    for (const axis of ["x", "y"] as const) {
      for (const ref of alignmentReferences(point, refs, tolerance, axis)) {
        const a = doc.points[edge.from],
          b = doc.points[edge.to];
        const params =
          edge.kind === "cubic"
            ? cubicAxisParameters(asCubic(doc, edge), axis, ref[axis])
            : Math.abs(b[axis] - a[axis]) > 1e-12
              ? [(ref[axis] - a[axis]) / (b[axis] - a[axis])]
              : [];
        for (const parameter of params) {
          if (parameter < 0 || parameter > 1) continue;
          const p = segmentPoint(doc, edge, parameter);
          if (distance(p, point) > tolerance) continue;
          alignedEdges.push({
            point: p,
            t: parameter,
            edgeId: edge.id,
            label: axis === "y" ? "On edge · Horizontal" : "On edge · Vertical",
            guides: guidesAt(p, refs),
          });
        }
      }
    }
  }
  return {
    midpoints,
    edges,
    alignedEdges,
    intersections: intersectionSnaps(doc, point, tolerance, movingPoint),
  };
}
