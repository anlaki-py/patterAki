import { lineTouchesBox, type Bounds } from "./bounds";
import { distance, type Vec2 } from "./line";
export type MarkLine = [Vec2, Vec2];
export type MarkText = {
  position: Vec2;
  text: string;
  size: number;
  width: number;
};
export type MarkShape = {
  lines: MarkLine[];
  circles: { center: Vec2; radius: number }[];
  texts: MarkText[];
};
export function transformMarkPoint(
  point: Vec2,
  position: Vec2,
  rotation: number,
): Vec2 {
  const radians = (rotation * Math.PI) / 180;
  return {
    x: position.x + point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: position.y + point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}
export function textCorners(text: MarkText): Vec2[] {
  const { x, y } = text.position;
  return [
    { x, y },
    { x: x + text.width, y },
    { x: x + text.width, y: y + text.size * 1.2 },
    { x, y: y + text.size * 1.2 },
  ];
}
export function markTouchesBox(
  shape: MarkShape,
  position: Vec2,
  rotation: number,
  box: Bounds,
): boolean {
  const transform = (p: Vec2) => transformMarkPoint(p, position, rotation);
  if (
    shape.lines.some(([a, b]) =>
      lineTouchesBox(transform(a), transform(b), box),
    )
  )
    return true;
  for (const circle of shape.circles) {
    const center = transform(circle.center);
    const closest = {
      x: Math.max(box.min.x, Math.min(box.max.x, center.x)),
      y: Math.max(box.min.y, Math.min(box.max.y, center.y)),
    };
    if (distance(center, closest) <= circle.radius) return true;
  }
  for (const text of shape.texts) {
    const corners = textCorners(text).map(transform);
    if (corners.some((p, i) => lineTouchesBox(p, corners[(i + 1) % 4], box)))
      return true;
    // The box may be entirely inside the text's selectable rectangle.
    const local = transformMarkPoint(
      { x: box.min.x - position.x, y: box.min.y - position.y },
      { x: 0, y: 0 },
      -rotation,
    );
    if (
      local.x >= text.position.x &&
      local.x <= text.position.x + text.width &&
      local.y >= text.position.y &&
      local.y <= text.position.y + text.size * 1.2
    )
      return true;
  }
  return false;
}
export function markBounds(
  shape: MarkShape,
  position: Vec2,
  rotation: number,
): Bounds {
  const transform = (p: Vec2) => transformMarkPoint(p, position, rotation);
  const points = [
    ...shape.lines.flat().map(transform),
    ...shape.texts.flatMap(textCorners).map(transform),
    ...shape.circles.flatMap(({ center, radius }) => {
      const p = transform(center);
      return [
        { x: p.x - radius, y: p.y - radius },
        { x: p.x + radius, y: p.y + radius },
      ];
    }),
    position,
  ];
  return {
    min: {
      x: Math.min(...points.map((p) => p.x)),
      y: Math.min(...points.map((p) => p.y)),
    },
    max: {
      x: Math.max(...points.map((p) => p.x)),
      y: Math.max(...points.map((p) => p.y)),
    },
  };
}
