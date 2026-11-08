import {
  cubicLength,
  cubicPoint,
  projectCubic,
  type Cubic,
} from "../geometry/bezier";
import { distance, lerp, project, type Vec2 } from "../geometry/line";
import type { PatternDocument } from "./schema";
export type Segment = PatternDocument["segments"][string];
export function asCubic(doc: PatternDocument, edge: Segment): Cubic {
  const a = doc.points[edge.from],
    b = doc.points[edge.to];
  return edge.kind === "cubic"
    ? [a, edge.control1, edge.control2, b]
    : [a, lerp(a, b, 1 / 3), lerp(a, b, 2 / 3), b];
}
export function segmentLength(doc: PatternDocument, edge: Segment) {
  return edge.kind === "cubic"
    ? cubicLength(asCubic(doc, edge))
    : distance(doc.points[edge.from], doc.points[edge.to]);
}
export function segmentPoint(doc: PatternDocument, edge: Segment, t: number) {
  return edge.kind === "cubic"
    ? cubicPoint(asCubic(doc, edge), t)
    : lerp(doc.points[edge.from], doc.points[edge.to], t);
}
export function segmentProjection(
  doc: PatternDocument,
  edge: Segment,
  p: Vec2,
) {
  return edge.kind === "cubic"
    ? projectCubic(asCubic(doc, edge), p)
    : project(doc.points[edge.from], doc.points[edge.to], p);
}
export function segmentPath(doc: PatternDocument, edge: Segment) {
  const a = doc.points[edge.from],
    b = doc.points[edge.to];
  return edge.kind === "cubic"
    ? `M ${a.x} ${a.y} C ${edge.control1.x} ${edge.control1.y} ${edge.control2.x} ${edge.control2.y} ${b.x} ${b.y}`
    : `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
}
