import { addPath } from "../document/operations";
import { applyDraftTangents } from "../document/curveDraft";
import type { PatternDocument } from "../document/schema";
import { parseLength } from "../document/lengthInput";
import { endpoint, type Vec2 } from "../geometry/line";

export function exactDraftEndpoint(
  origin: Vec2,
  length: string | number,
  degrees: string | number,
  factor: number,
) {
  if (String(degrees).trim() === "") throw new Error("Enter an angle.");
  return endpoint(origin, parseLength(length, factor), Number(degrees));
}
export function rectangleDimensions(
  width: string | number,
  height: string | number,
  factor: number,
) {
  const w = parseLength(width, factor),
    h = parseLength(height, factor);
  if (w <= 0 || h <= 0) throw new Error("Width and height must be positive.");
  return { width: w, height: h };
}

/** Line always draws straight; deliberate anchor drags belong to Polyline. */
export function draftTangent(
  tool: string,
  start: Vec2,
  end: Vec2,
  scale: number,
): Vec2 | null {
  if (
    tool !== "polyline" ||
    Math.hypot(end.x - start.x, end.y - start.y) * scale < 3
  )
    return null;
  return { x: end.x - start.x, y: end.y - start.y };
}

export function createDraftDocument(
  doc: PatternDocument,
  tool: string,
  positions: Vec2[],
  closed: boolean,
  tangents: ReadonlyMap<number, Vec2>,
  id: () => string,
) {
  const next = addPath(doc, positions, closed, id);
  return tool === "polyline"
    ? applyDraftTangents(
        next,
        positions,
        tangents,
        new Set(Object.keys(doc.segments)),
      )
    : next;
}
