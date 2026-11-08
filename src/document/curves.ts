import { asCubic } from "./segments";
import type { PatternDocument } from "./schema";
import { type Vec2 } from "../geometry/line";
export function convertToCurve(
  doc: PatternDocument,
  id: string,
): PatternDocument {
  const edge = doc.segments[id];
  if (edge.kind === "cubic") return doc;
  const [, control1, control2] = asCubic(doc, edge);
  return {
    ...doc,
    segments: {
      ...doc.segments,
      [id]: { ...edge, kind: "cubic", control1, control2 },
    },
  };
}
export function bendCurve(
  doc: PatternDocument,
  id: string,
  t: number,
  delta: Vec2,
): PatternDocument {
  const next = convertToCurve(doc, id),
    edge = next.segments[id];
  if (edge.kind !== "cubic") return doc;
  const weight = 3 * t * (1 - t);
  if (weight < 0.05) return doc;
  const shift = (p: Vec2) => ({
    x: p.x + delta.x / weight,
    y: p.y + delta.y / weight,
  });
  return {
    ...next,
    segments: {
      ...next.segments,
      [id]: {
        ...edge,
        control1: shift(edge.control1),
        control2: shift(edge.control2),
      },
    },
  };
}
export function moveHandle(
  doc: PatternDocument,
  id: string,
  handle: "control1" | "control2",
  position: Vec2,
): PatternDocument {
  const next = convertToCurve(doc, id),
    edge = next.segments[id];
  return {
    ...next,
    segments: { ...next.segments, [id]: { ...edge, [handle]: position } },
  };
}
export function moveVertex(
  doc: PatternDocument,
  id: string,
  position: Vec2,
): PatternDocument {
  const old = doc.points[id],
    dx = position.x - old.x,
    dy = position.y - old.y;
  const shift = (p: Vec2) => ({ x: p.x + dx, y: p.y + dy });
  const segments = Object.fromEntries(
    Object.entries(doc.segments).map(([key, edge]) => [
      key,
      edge.kind === "cubic"
        ? {
            ...edge,
            control1: edge.from === id ? shift(edge.control1) : edge.control1,
            control2: edge.to === id ? shift(edge.control2) : edge.control2,
          }
        : edge,
    ]),
  );
  return { ...doc, points: { ...doc.points, [id]: position }, segments };
}
export function straightenCurve(
  doc: PatternDocument,
  id: string,
): PatternDocument {
  const { from, to } = doc.segments[id];
  return {
    ...doc,
    segments: { ...doc.segments, [id]: { id, kind: "line", from, to } },
  };
}
