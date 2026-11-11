import type { PatternDocument } from "./schema";
import type { Vec2 } from "../geometry/line";
import { distance } from "../geometry/line";

export function applyDraftTangents(
  doc: PatternDocument,
  positions: Vec2[],
  tangents: ReadonlyMap<number, Vec2>,
): PatternDocument {
  const points = { ...doc.points },
    segments = { ...doc.segments };
  const tangentAt = (id: string) => {
    const index = positions.findIndex((p) => distance(p, points[id]) < 1e-9);
    return tangents.get(index);
  };
  for (const edge of Object.values(segments)) {
    const a = points[edge.from],
      b = points[edge.to];
    const start = tangentAt(edge.from),
      end = tangentAt(edge.to);
    if (!start && !end) continue;
    segments[edge.id] = {
      ...edge,
      kind: "cubic",
      control1: start
        ? { x: a.x + start.x, y: a.y + start.y }
        : { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
      control2: end
        ? { x: b.x - end.x, y: b.y - end.y }
        : { x: b.x - (b.x - a.x) / 3, y: b.y - (b.y - a.y) / 3 },
    };
    if (start) points[edge.from] = { ...a, mode: "symmetric" };
    if (end) points[edge.to] = { ...b, mode: "symmetric" };
  }
  return { ...doc, points, segments };
}
