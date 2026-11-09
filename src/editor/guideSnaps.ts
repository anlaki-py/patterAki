import type { PatternDocument } from "../document/schema";
import type { ConstructionGuide } from "../document/guideSchema";
import { asCubic, segmentPoint, type Segment } from "../document/segments";
import { cubicAxisParameters } from "../geometry/bezier";
import { distance, lerp, type Vec2 } from "../geometry/line";
import type { SnapCandidate } from "../geometry/snapping";
const EPSILON = 1e-9;
function visibleGuides(doc: PatternDocument) {
  return Object.values(doc.guides)
    .filter((guide) => guide.visible)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
export function guideProjectionSnaps(
  doc: PatternDocument,
  pointer: Vec2,
  tolerance: number,
  enabled: boolean,
): SnapCandidate[] {
  if (!enabled) return [];
  const results: SnapCandidate[] = [];
  for (const guide of visibleGuides(doc)) {
    const point =
      guide.axis === "x"
        ? { x: guide.positionMm, y: pointer.y }
        : { x: pointer.x, y: guide.positionMm };
    if (distance(pointer, point) > tolerance) continue;
    results.push({
      point,
      label: "Guide",
      kind: "guide",
      targetId: `guide:${guide.id}`,
      priority: 7,
    });
  }
  return results;
}
export function guideGuideSnaps(
  doc: PatternDocument,
  pointer: Vec2,
  tolerance: number,
  enabled: boolean,
): SnapCandidate[] {
  if (!enabled) return [];
  const vertical = visibleGuides(doc).filter((guide) => guide.axis === "x"),
    horizontal = visibleGuides(doc).filter((guide) => guide.axis === "y");
  const results: SnapCandidate[] = [];
  for (const x of vertical) {
    for (const y of horizontal) {
      const point = { x: x.positionMm, y: y.positionMm };
      if (distance(pointer, point) > tolerance) continue;
      results.push({
        point,
        label: "Guide intersection",
        kind: "guide-intersection",
        targetId: `guide-cross:${x.id}:${y.id}`,
        priority: 3,
      });
    }
  }
  return results;
}
const guideHits = (
  guide: ConstructionGuide,
  edge: Segment,
  doc: PatternDocument,
  axis: "x" | "y",
): { point: Vec2; t: number }[] => {
  if (edge.kind === "cubic") {
    return cubicAxisParameters(asCubic(doc, edge), axis, guide.positionMm).map(
      (t) => ({ point: segmentPoint(doc, edge, t), t }),
    );
  }
  const a = doc.points[edge.from],
    b = doc.points[edge.to],
    denominator = b[axis] - a[axis];
  if (Math.abs(denominator) < EPSILON) return [];
  const t = (guide.positionMm - a[axis]) / denominator;
  if (t < -EPSILON || t > 1 + EPSILON) return [];
  const clamped = Math.max(0, Math.min(1, t));
  return [{ point: lerp(a, b, clamped), t: clamped }];
};
export function guideEdgeSnaps(
  doc: PatternDocument,
  pointer: Vec2,
  tolerance: number,
  enabled: boolean,
  excludedEdges?: ReadonlySet<string>,
): SnapCandidate[] {
  if (!enabled) return [];
  const results: SnapCandidate[] = [];
  const guides = visibleGuides(doc);
  for (const guide of guides) {
    const axis = guide.axis;
    for (const edge of Object.values(doc.segments)) {
      if (excludedEdges?.has(edge.id)) continue;
      for (const hit of guideHits(guide, edge, doc, axis)) {
        if (!Number.isFinite(hit.point.x) || !Number.isFinite(hit.point.y))
          continue;
        if (distance(pointer, hit.point) > tolerance) continue;
        results.push({
          point: hit.point,
          label: "Guide intersection",
          kind: "guide-intersection",
          targetId: `guide-edge:${guide.id}:${edge.id}:${axis}:${hit.t.toFixed(9)}`,
          priority: 3,
          edgeId: edge.id,
          t: hit.t,
        });
      }
    }
  }
  return results;
}
export function rayGuideSnaps(
  doc: PatternDocument,
  pointer: Vec2,
  origin: Vec2,
  tolerance: number,
  enabled: boolean,
): SnapCandidate[] {
  if (!enabled) return [];
  const results: SnapCandidate[] = [];
  for (let i = 0; i < 8; i++) {
    const radians = (i * Math.PI) / 4,
      ux = Math.cos(radians),
      uy = Math.sin(radians);
    for (const guide of visibleGuides(doc)) {
      let along: number;
      if (guide.axis === "x") {
        if (Math.abs(ux) < EPSILON) continue;
        along = (guide.positionMm - origin.x) / ux;
      } else {
        if (Math.abs(uy) < EPSILON) continue;
        along = (guide.positionMm - origin.y) / uy;
      }
      if (!Number.isFinite(along) || along <= 0) continue;
      const point = {
        x: origin.x + along * ux,
        y: origin.y + along * uy,
      };
      if (distance(pointer, point) > tolerance) continue;
      results.push({
        point,
        label: "Guide intersection",
        kind: "guide-intersection",
        targetId: `angle-guide:${guide.id}:${i}`,
        priority: 3,
        guides: [{ from: origin, to: point }],
      });
    }
  }
  return results;
}
