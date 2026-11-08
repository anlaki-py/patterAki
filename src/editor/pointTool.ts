import { segmentPoint, segmentProjection } from "../document/segments";
import type { PatternDocument } from "../document/schema";
import { splitLine } from "../document/operations";
import { distance, type Vec2 } from "../geometry/line";
import { createId } from "./ids";
import { useEditor } from "./store";
export function findPointInsertion(
  doc: PatternDocument,
  cursor: Vec2,
  tolerance: number,
) {
  let nearest:
    | {
        edgeId: string;
        point: Vec2;
        t: number;
        distance: number;
        atEndpoint: boolean;
      }
    | undefined;
  for (const edge of Object.values(doc.segments)) {
    const a = doc.points[edge.from],
      b = doc.points[edge.to];
    const t = segmentProjection(doc, edge, cursor),
      point = segmentPoint(doc, edge, t),
      gap = distance(cursor, point);
    if (gap > tolerance || (nearest && gap >= nearest.distance)) continue;
    nearest = {
      edgeId: edge.id,
      point,
      t,
      distance: gap,
      atEndpoint: distance(a, point) < 1e-9 || distance(b, point) < 1e-9,
    };
  }
  return nearest;
}
export function insertPointAt(
  cursor: Vec2,
  tolerance: number,
  target?: { edgeId: string; t: number },
) {
  const s = useEditor.getState();
  const edge = target ? s.document.segments[target.edgeId] : undefined;
  const hit =
    target && edge
      ? {
          edgeId: edge.id,
          t: target.t,
          atEndpoint: target.t <= 1e-9 || target.t >= 1 - 1e-9,
        }
      : findPointInsertion(s.document, cursor, tolerance);
  if (!hit || hit.atEndpoint) return false;
  s.commit(splitLine(s.document, hit.edgeId, hit.t, createId));
  useEditor.setState({ selected: [hit.edgeId] });
  return true;
}
