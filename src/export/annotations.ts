import type { Annotation } from "../document/annotationSchema";
import { annotationShape } from "../document/annotationGeometry";
import { markBounds } from "../geometry/marks";
import { escapeXml } from "./xml";

export function exportAnnotation(mark: Annotation) {
  const shape = annotationShape(mark);
  const body = [
    ...shape.lines.map(
      ([a, b]) => `<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}"/>`,
    ),
    ...shape.circles.map(
      (c) => `<circle cx="${c.center.x}" cy="${c.center.y}" r="${c.radius}"/>`,
    ),
    ...shape.texts.map(
      (t) =>
        `<text x="${t.position.x}" y="${t.position.y}" font-size="${t.size}" dominant-baseline="hanging">${escapeXml(t.text)}</text>`,
    ),
  ].join("");
  // One em per character reserves space even when the viewer uses a wider font.
  const bounds = markBounds(
    {
      ...shape,
      texts: shape.texts.map((t) => ({
        ...t,
        width: Array.from(t.text).length * t.size,
      })),
    },
    mark.position,
    mark.rotation,
  );
  return {
    svg: `<g data-annotation="${escapeXml(mark.id)}" transform="translate(${mark.position.x} ${mark.position.y}) rotate(${mark.rotation})">${body}</g>`,
    bounds,
  };
}
