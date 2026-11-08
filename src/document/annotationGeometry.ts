import type { Annotation } from "./annotationSchema";
import type { MarkShape, MarkText } from "../geometry/marks";
import { markBounds, markTouchesBox } from "../geometry/marks";
import type { Bounds } from "../geometry/bounds";

function textLines(text: string, size: number, y = 0): MarkText[] {
  return text.split("\n").map((line, i) => ({
    text: line,
    size,
    position: { x: 0, y: y + i * size * 1.2 },
    width: Math.max(1, Array.from(line).length) * size * 0.6,
  }));
}
export function annotationShape(mark: Annotation): MarkShape {
  const shape: MarkShape = { lines: [], circles: [], texts: [] };
  if (mark.kind === "text") {
    shape.texts = textLines(mark.text, mark.fontSizeMm);
    return shape;
  }
  if (mark.kind === "drill") {
    const radius = mark.sizeMm / 2;
    shape.circles = [{ center: { x: 0, y: 0 }, radius }];
    shape.lines = [
      [
        { x: -radius, y: 0 },
        { x: radius, y: 0 },
      ],
      [
        { x: 0, y: -radius },
        { x: 0, y: radius },
      ],
    ];
    return shape;
  }
  const length = mark.lengthMm,
    head = Math.min(4, length / 4);
  shape.lines.push([
    { x: 0, y: 0 },
    { x: length, y: 0 },
  ]);
  if (mark.kind === "fold") {
    shape.lines.push(
      [
        { x: 0, y: -head },
        { x: 0, y: head },
      ],
      [
        { x: length, y: -head },
        { x: length, y: head },
      ],
    );
  } else {
    shape.lines.push(
      [
        { x: length - head, y: -head / 2 },
        { x: length, y: 0 },
      ],
      [
        { x: length - head, y: head / 2 },
        { x: length, y: 0 },
      ],
    );
    if (mark.kind === "grainline")
      shape.lines.push(
        [
          { x: head, y: -head / 2 },
          { x: 0, y: 0 },
        ],
        [
          { x: head, y: head / 2 },
          { x: 0, y: 0 },
        ],
      );
  }
  if (mark.label)
    shape.texts = textLines(
      mark.label,
      mark.fontSizeMm,
      -mark.fontSizeMm * 1.2 - 2,
    );
  return shape;
}
export const annotationBounds = (mark: Annotation) =>
  markBounds(annotationShape(mark), mark.position, mark.rotation);
export const annotationTouchesBox = (mark: Annotation, box: Bounds) =>
  markTouchesBox(annotationShape(mark), mark.position, mark.rotation, box);

export function annotationInRange(mark: Annotation): boolean {
  const bounds = annotationBounds(mark);
  return [bounds.min.x, bounds.min.y, bounds.max.x, bounds.max.y].every(
    (v) => Number.isFinite(v) && Math.abs(v) <= 1e7,
  );
}
