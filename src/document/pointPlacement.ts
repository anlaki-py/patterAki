import { asCubic, segmentLength } from "./segments";
import {
  cubicLength,
  splitCubic,
  cubicParameterAtLength,
  projectCubic,
  type Cubic,
} from "../geometry/bezier";
import { distance, lerp, type Vec2 } from "../geometry/line";
import type { PatternDocument } from "./schema";
import { splitLine } from "./operations";
export type PointPlacement = {
  edgeId: string;
  pointId: string;
  newEdgeId: string;
  start: Vec2;
  end: Vec2;
  initialFromStart: number;
  lengthMm: number;
  curve?: Cubic;
  existing: boolean;
};
export function placementOnEdge(
  doc: PatternDocument,
  edgeId: string,
  t: number,
  ids: { pointId: string; newEdgeId: string },
): PointPlacement {
  const edge = doc.segments[edgeId];
  if (!edge) throw new Error("Select an existing edge.");
  const start = doc.points[edge.from],
    end = doc.points[edge.to];
  return {
    edgeId,
    ...ids,
    start,
    end,
    initialFromStart:
      edge.kind === "cubic"
        ? cubicLength(splitCubic(asCubic(doc, edge), t)[0])
        : distance(start, end) * t,
    lengthMm: segmentLength(doc, edge),
    curve: edge.kind === "cubic" ? asCubic(doc, edge) : undefined,
    existing: false,
  };
}
export function placementAtVertex(
  doc: PatternDocument,
  pointId: string,
): PointPlacement {
  const edges = Object.values(doc.segments).filter(
    (edge) => edge.from === pointId || edge.to === pointId,
  );
  if (edges.length !== 2)
    throw new Error(
      "Choose a point between two straight edges, or right-click inside an edge to add one.",
    );
  if (edges.some((edge) => edge.kind === "cubic"))
    throw new Error(
      "Use the curve arms to reposition this existing point. Right-click inside a curve to insert by arc distance.",
    );
  const first = edges.find((edge) => edge.to === pointId) ?? edges[0];
  const second = edges.find((edge) => edge.id !== first.id)!;
  const start = doc.points[first.from === pointId ? first.to : first.from];
  const end = doc.points[second.from === pointId ? second.to : second.from];
  const point = doc.points[pointId],
    total = distance(start, end);
  if (
    total < 1e-9 ||
    Math.abs(distance(start, point) + distance(point, end) - total) > 1e-7
  )
    throw new Error(
      "This is a corner. Use endpoint dragging to reshape it; exact split distances apply to straight edges.",
    );
  return {
    edgeId: first.id,
    pointId,
    newEdgeId: "",
    start,
    end,
    initialFromStart: distance(start, point),
    lengthMm: total,
    existing: true,
  };
}
export function splitDistances(
  total: number,
  value: number,
  side: "start" | "end",
) {
  if (
    !Number.isFinite(total) ||
    !Number.isFinite(value) ||
    value <= 1e-9 ||
    total - value <= 1e-9
  )
    throw new Error(
      "Both distances must be positive and smaller than the full edge length.",
    );
  const fromStart = side === "start" ? value : total - value;
  return { fromStart, fromEnd: total - fromStart };
}
export function applyPointPlacement(
  doc: PatternDocument,
  target: PointPlacement,
  fromStart: number,
): PatternDocument {
  const total = target.lengthMm;
  splitDistances(total, fromStart, "start");
  if (target.existing)
    return {
      ...doc,
      points: {
        ...doc.points,
        [target.pointId]: lerp(target.start, target.end, fromStart / total),
      },
    };
  const ids = [target.pointId, target.newEdgeId];
  return splitLine(
    doc,
    target.edgeId,
    target.curve
      ? cubicParameterAtLength(target.curve, fromStart)
      : fromStart / total,
    () => ids.shift()!,
  );
}

export function placementDistanceFromStart(target: PointPlacement, p: Vec2) {
  return target.curve
    ? cubicLength(splitCubic(target.curve, projectCubic(target.curve, p))[0])
    : distance(target.start, p);
}
