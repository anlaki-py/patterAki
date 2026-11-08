import type { PatternDocument } from "../document/schema";
import { annotationTouchesBox } from "../document/annotationGeometry";
import type { Vec2 } from "../geometry/line";
import { findPointInsertion } from "./pointTool";
export type ContextHit =
  { kind: "edge" | "annotation"; id: string } | { kind: "empty" };
export function contextTarget(
  doc: PatternDocument,
  point: Vec2,
  tolerance: number,
  target?: { edge?: string; annotation?: string },
): ContextHit {
  if (target?.annotation && doc.annotations[target.annotation])
    return { kind: "annotation", id: target.annotation };
  if (target?.edge && doc.segments[target.edge])
    return { kind: "edge", id: target.edge };
  const mark = Object.values(doc.annotations)
    .reverse()
    .find((mark) =>
      annotationTouchesBox(mark, {
        min: { x: point.x - tolerance, y: point.y - tolerance },
        max: { x: point.x + tolerance, y: point.y + tolerance },
      }),
    );
  if (mark) return { kind: "annotation", id: mark.id };
  const hit = findPointInsertion(doc, point, tolerance);
  return hit ? { kind: "edge", id: hit.edgeId } : { kind: "empty" };
}
