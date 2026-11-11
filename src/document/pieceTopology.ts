import { cubicPoint } from "../geometry/bezier";
import type { Vec2 } from "../geometry/line";

export type OutlineEdge = { segmentId: string; reversed: boolean };
export type TopologyDocument = {
  points: Record<string, Vec2>;
  segments: Record<
    string,
    | { id: string; from: string; to: string; kind: "line" }
    | {
        id: string;
        from: string;
        to: string;
        kind: "cubic";
        control1: Vec2;
        control2: Vec2;
      }
  >;
};
export const PIECE_AREA_TOLERANCE_MM2 = 1e-8;

export function orderedOutline(
  doc: TopologyDocument,
  ids: string[],
): OutlineEdge[] {
  if (ids.length < 3 || new Set(ids).size !== ids.length)
    throw new Error("A piece needs a simple closed outline.");
  const first = doc.segments[ids[0]];
  if (!first) throw new Error("Outline segment is missing.");
  let current = first.from;
  const outline = ids.map((segmentId) => {
    const edge = doc.segments[segmentId];
    if (!edge || (edge.from !== current && edge.to !== current))
      throw new Error("Outline edges must be connected in order.");
    const reversed = edge.to === current;
    current = reversed ? edge.from : edge.to;
    return { segmentId, reversed };
  });
  if (current !== first.from)
    throw new Error("Stitching outline must close by point identity.");
  return normalizeOutline(doc, outline);
}

/** Exact cubic signed area via three-point Gaussian integration of degree five.
 * Positive area is clockwise in the editor's downward-positive Y coordinates. */
export function outlineArea(
  doc: TopologyDocument,
  outline: OutlineEdge[],
): number {
  // Translate to the first anchor to avoid cancellation at large world positions.
  const origin = doc.points[doc.segments[outline[0].segmentId].from];
  let area = 0;
  for (const ref of outline) {
    const edge = doc.segments[ref.segmentId];
    const relative = (p: Vec2) => ({ x: p.x - origin.x, y: p.y - origin.y });
    const a = relative(doc.points[edge.from]),
      b = relative(doc.points[edge.to]);
    let integral = a.x * b.y - b.x * a.y;
    if (edge.kind === "cubic") {
      const c = [a, relative(edge.control1), relative(edge.control2), b] as [
        Vec2,
        Vec2,
        Vec2,
        Vec2,
      ];
      integral = 0;
      for (const [t, w] of [
        [0.5 - Math.sqrt(15) / 10, 5 / 18],
        [0.5, 4 / 9],
        [0.5 + Math.sqrt(15) / 10, 5 / 18],
      ]) {
        const p = cubicPoint(c, t),
          u = 1 - t;
        const dx =
          3 *
          (u * u * (c[1].x - a.x) +
            2 * u * t * (c[2].x - c[1].x) +
            t * t * (b.x - c[2].x));
        const dy =
          3 *
          (u * u * (c[1].y - a.y) +
            2 * u * t * (c[2].y - c[1].y) +
            t * t * (b.y - c[2].y));
        integral += w * (p.x * dy - p.y * dx);
      }
    }
    area += (ref.reversed ? -integral : integral) / 2;
  }
  return area;
}
export function normalizeOutline(
  doc: TopologyDocument,
  outline: OutlineEdge[],
): OutlineEdge[] {
  const area = outlineArea(doc, outline);
  if (Math.abs(area) <= PIECE_AREA_TOLERANCE_MM2)
    throw new Error("Piece outline has degenerate area.");
  return area > 0
    ? outline
    : [...outline]
        .reverse()
        .map((ref) => ({ ...ref, reversed: !ref.reversed }));
}
export function connectedPath(
  doc: TopologyDocument,
  refs: OutlineEdge[],
  closed: boolean,
): boolean {
  if (
    !refs.length ||
    new Set(refs.map((r) => r.segmentId)).size !== refs.length
  )
    return false;
  const endpoints = refs.map((ref) => {
    const edge = doc.segments[ref.segmentId];
    return edge
      ? ref.reversed
        ? [edge.to, edge.from]
        : [edge.from, edge.to]
      : null;
  });
  return (
    endpoints.every(
      (pair, i) =>
        !!pair &&
        !!doc.points[pair[0]] &&
        !!doc.points[pair[1]] &&
        (i === 0 || endpoints[i - 1]?.[1] === pair[0]),
    ) &&
    (!closed || endpoints.at(-1)?.[1] === endpoints[0]?.[0])
  );
}
