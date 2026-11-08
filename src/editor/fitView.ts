import { annotationBounds } from "../document/annotationGeometry";
import type { PatternDocument } from "../document/schema";
export function fitView(doc: PatternDocument, width: number, height: number) {
  const points = [
    ...Object.values(doc.points),
    ...Object.values(doc.segments).flatMap((edge) =>
      edge.kind === "cubic" ? [edge.control1, edge.control2] : [],
    ),
    ...Object.values(doc.annotations).flatMap((mark) => {
      const bounds = annotationBounds(mark);
      return [bounds.min, bounds.max];
    }),
  ];
  if (!points.length) return { x: 40, y: 40, scale: 2 };
  const minX = Math.min(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const w = Math.max(...points.map((p) => p.x)) - minX;
  const h = Math.max(...points.map((p) => p.y)) - minY;
  const scale = Math.max(
    0.1,
    Math.min(20, (width - 80) / Math.max(w, 1), (height - 80) / Math.max(h, 1)),
  );
  return {
    x: (width - w * scale) / 2 - minX * scale,
    y: (height - h * scale) / 2 - minY * scale,
    scale,
  };
}
