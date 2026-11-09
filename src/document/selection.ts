import { annotationTouchesBox } from "./annotationGeometry";
import type { Vec2 } from "../geometry/line";
import type { PatternDocument } from "./schema";
import { asCubic } from "./segments";
import { expandPieceSelection } from "./pieces";
import {
  cubicTouchesBox,
  lineTouchesBox,
  type Bounds,
} from "../geometry/bounds";

export function edgesInBox(doc: PatternDocument, box: Bounds): string[] {
  return Object.values(doc.segments)
    .filter((edge) =>
      edge.kind === "cubic"
        ? cubicTouchesBox(asCubic(doc, edge), box)
        : lineTouchesBox(doc.points[edge.from], doc.points[edge.to], box),
    )
    .map((edge) => edge.id);
}

export function translateEdges(
  doc: PatternDocument,
  ids: string[],
  delta: Vec2,
): PatternDocument {
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y))
    throw new Error("Move distances must be finite.");
  const moved = new Set<string>();
  for (const id of ids) {
    const edge = doc.segments[id];
    if (!edge) throw new Error("This edge no longer exists.");
    moved.add(edge.from);
    moved.add(edge.to);
  }
  const shift = (p: Vec2) => ({ x: p.x + delta.x, y: p.y + delta.y });
  // Each shared vertex moves once. Attached controls follow their own anchor,
  // including controls on unselected neighbours, so connections stay intact.
  return {
    ...doc,
    points: Object.fromEntries(
      Object.entries(doc.points).map(([id, point]) => [
        id,
        moved.has(id) ? shift(point) : point,
      ]),
    ),
    segments: Object.fromEntries(
      Object.entries(doc.segments).map(([id, edge]) => [
        id,
        edge.kind === "cubic"
          ? {
              ...edge,
              control1: moved.has(edge.from)
                ? shift(edge.control1)
                : edge.control1,
              control2: moved.has(edge.to)
                ? shift(edge.control2)
                : edge.control2,
            }
          : edge,
      ]),
    ),
  };
}

export function itemsInBox(doc: PatternDocument, box: Bounds): string[] {
  return [
    ...expandPieceSelection(doc, edgesInBox(doc, box)),
    ...Object.values(doc.annotations)
      .filter((mark) => annotationTouchesBox(mark, box))
      .map((mark) => mark.id),
  ];
}
export function translateSelection(
  doc: PatternDocument,
  ids: string[],
  delta: Vec2,
): PatternDocument {
  if (ids.some((id) => !doc.segments[id] && !doc.annotations[id]))
    throw new Error("A selected item no longer exists.");
  const next = translateEdges(
    doc,
    ids.filter((id) => !!doc.segments[id]),
    delta,
  );
  const selected = new Set(ids);
  return {
    ...next,
    annotations: Object.fromEntries(
      Object.entries(doc.annotations).map(([id, mark]) => [
        id,
        selected.has(id)
          ? {
              ...mark,
              position: {
                x: mark.position.x + delta.x,
                y: mark.position.y + delta.y,
              },
            }
          : mark,
      ]),
    ),
  };
}
