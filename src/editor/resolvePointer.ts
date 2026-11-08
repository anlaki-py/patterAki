import { geometrySnaps } from "./geometrySnaps";
import type { PatternDocument } from "../document/schema";
import { angle, distance, endpoint, type Vec2 } from "../geometry/line";
import { snapPoint, type Snap } from "../geometry/snapping";
import { findPointInsertion } from "./pointTool";
import type { Tool } from "./store";
export function resolvePointer(
  doc: PatternDocument,
  point: Vec2,
  options: {
    tool: Tool;
    scale: number;
    touch: boolean;
    origin?: Vec2;
    movingPoint?: string;
    panning: boolean;
    snap: boolean;
    grid: boolean;
    bypass: boolean;
    constrain: boolean;
  },
): Snap {
  const { tool, scale, touch, origin, movingPoint } = options;
  const free = { point, label: "" };
  if (
    options.panning ||
    tool === "pan" ||
    ((tool === "select" || tool === "curve") && !movingPoint)
  )
    return free;
  if (options.constrain && origin)
    return {
      point: endpoint(
        origin,
        Math.max(distance(origin, point), 1e-9),
        Math.round(angle(origin, point) / 45) * 45,
      ),
      label: "45° constraint",
    };
  const tolerance = (touch ? 16 : 8) / scale;
  if (!options.snap || options.bypass) {
    if (tool === "point") {
      const hit = findPointInsertion(doc, point, tolerance);
      return hit
        ? {
            point: hit.point,
            label: hit.atEndpoint ? "Existing point" : "Insert point",
            edgeId: hit.edgeId,
            t: hit.t,
          }
        : free;
    }
    return free;
  }
  const points = Object.entries(doc.points)
    .filter(([id]) => id !== movingPoint)
    .map(([, p]) => p);
  const candidates = geometrySnaps(
    doc,
    point,
    tolerance,
    origin ? [origin, ...points] : points,
    movingPoint,
  );
  const result = snapPoint(point, points, [], tolerance, origin, options.grid, {
    ...candidates,
    requireEdge: tool === "point",
  });
  return result.label === "Grid" ? { ...result, label: "" } : result;
}
