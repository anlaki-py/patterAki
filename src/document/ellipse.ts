import { idAllocator } from "./identity";
import { documentSchema, type PatternDocument } from "./schema";
import { createPieceFromEdge } from "./pieces";
/** Four cubic arcs, maximum radial approximation error < 0.028% of radius. */
export function addEllipse(
  doc: PatternDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  id: () => string,
) {
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error("Enter positive, finite ellipse dimensions in mm.");
  id = idAllocator(doc, id);
  const next = structuredClone(doc),
    rx = width / 2,
    ry = height / 2,
    k = 0.5522847498307936;
  const pts = [
    { x: x + rx, y },
    { x: x + width, y: y + ry },
    { x: x + rx, y: y + height },
    { x, y: y + ry },
  ];
  const tangents = [
    { x: rx * k, y: 0 },
    { x: 0, y: ry * k },
    { x: -rx * k, y: 0 },
    { x: 0, y: -ry * k },
  ];
  const ids = pts.map((p) => {
    const key = id();
    next.points[key] = p;
    return key;
  });
  const edges = ids.map((from, i) => {
    const key = id(),
      j = (i + 1) % 4;
    next.segments[key] = {
      id: key,
      kind: "cubic",
      from,
      to: ids[j],
      control1: { x: pts[i].x + tangents[i].x, y: pts[i].y + tangents[i].y },
      control2: { x: pts[j].x - tangents[j].x, y: pts[j].y - tangents[j].y },
    };
    return key;
  });
  return documentSchema.parse(
    createPieceFromEdge(next, edges[0], id(), "Ellipse"),
  );
}
