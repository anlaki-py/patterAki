import { itemEditable } from "./pieceAccess";
import { asCubic } from "./segments";
import type { PatternDocument } from "./schema";
import { type Vec2 } from "../geometry/line";
export function convertToCurve(
  doc: PatternDocument,
  id: string,
): PatternDocument {
  if (!itemEditable(doc, id))
    throw new Error("Locked or hidden pieces cannot be edited.");
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
  decouple = false,
): PatternDocument {
  const next = convertToCurve(doc, id),
    edge = next.segments[id];
  if (edge.kind !== "cubic") return doc;
  const pointId = handle === "control1" ? edge.from : edge.to;
  const anchor = doc.points[pointId];
  const mode = anchor.mode ?? "corner";
  const segments = { ...next.segments, [id]: { ...edge, [handle]: position } };
  if (!decouple && mode !== "corner") {
    const dx = position.x - anchor.x,
      dy = position.y - anchor.y;
    const length = Math.hypot(dx, dy);
    for (const other of Object.values(next.segments)) {
      if (other.id === id || (other.from !== pointId && other.to !== pointId))
        continue;
      const key = other.from === pointId ? "control1" : "control2";
      const cubic = asCubic(next, other);
      const old = cubic[key === "control1" ? 1 : 2];
      const size =
        mode === "symmetric"
          ? length
          : Math.hypot(old.x - anchor.x, old.y - anchor.y);
      segments[other.id] = {
        ...other,
        kind: "cubic",
        control1: cubic[1],
        control2: cubic[2],
        [key]:
          length > 1e-9
            ? {
                x: anchor.x - (dx * size) / length,
                y: anchor.y - (dy * size) / length,
              }
            : { x: anchor.x, y: anchor.y },
      };
    }
  }
  return { ...next, segments };
}
export function moveVertex(
  doc: PatternDocument,
  id: string,
  position: Vec2,
): PatternDocument {
  if (!itemEditable(doc, id))
    throw new Error("Locked or hidden pieces cannot be edited.");
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
  return {
    ...doc,
    points: { ...doc.points, [id]: { ...old, ...position } },
    segments,
  };
}
export function straightenCurve(
  doc: PatternDocument,
  id: string,
): PatternDocument {
  if (!itemEditable(doc, id))
    throw new Error("Locked or hidden pieces cannot be edited.");
  const { from, to } = doc.segments[id];
  return {
    ...doc,
    segments: { ...doc.segments, [id]: { id, kind: "line", from, to } },
  };
}

export function setPointMode(
  doc: PatternDocument,
  id: string,
  mode: "corner" | "smooth" | "symmetric",
): PatternDocument {
  if (!itemEditable(doc, id))
    throw new Error("Locked or hidden pieces cannot be edited.");
  if (!doc.points[id]) throw new Error("Select a point first.");
  const adjacent = Object.values(doc.segments).filter(
    (e) => e.from === id || e.to === id,
  );
  if (mode !== "corner" && adjacent.length > 2)
    throw new Error("Linked tangents require at most two adjacent edges.");
  const next = {
    ...doc,
    points: { ...doc.points, [id]: { ...doc.points[id], mode } },
  };
  if (mode === "corner" || !adjacent.length) return next;
  const edge = adjacent[0],
    handle = edge.from === id ? "control1" : "control2";
  const cubic = asCubic(next, edge);
  return moveHandle(
    next,
    edge.id,
    handle,
    cubic[handle === "control1" ? 1 : 2],
  );
}
