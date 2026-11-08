import { distance, lerp, project, type Vec2 } from "./line";
export type SnapGuide = { from: Vec2; to: Vec2 };
export type Snap = {
  point: Vec2;
  label: string;
  guides?: SnapGuide[];
  edgeId?: string;
  t?: number;
};
export function alignmentReferences(
  point: Vec2,
  refs: Vec2[],
  tolerance: number,
  axis: "x" | "y",
): Vec2[] {
  const seen = new Set<number>();
  return refs
    .filter((ref) => Math.abs(ref[axis] - point[axis]) <= tolerance)
    .sort(
      (a, b) =>
        Math.abs(a[axis] - point[axis]) - Math.abs(b[axis] - point[axis]) ||
        distance(a, point) - distance(b, point),
    )
    .filter((ref) => {
      if (seen.has(ref[axis])) return false;
      seen.add(ref[axis]);
      return true;
    });
}
export function guidesAt(point: Vec2, refs: Vec2[]): SnapGuide[] {
  const guides: SnapGuide[] = [];
  for (const axis of ["x", "y"] as const) {
    const ref = refs
      .filter(
        (p) =>
          Math.abs(p[axis] - point[axis]) < 1e-7 && distance(p, point) > 1e-7,
      )
      .sort((a, b) => distance(a, point) - distance(b, point))[0];
    if (ref) guides.push({ from: ref, to: point });
  }
  return guides;
}
export function snapPoint(
  point: Vec2,
  points: Vec2[],
  lines: [Vec2, Vec2][],
  tolerance: number,
  origin?: Vec2,
  grid = false,
  extra: {
    midpoints?: Snap[];
    edges?: Snap[];
    alignedEdges?: Snap[];
    requireEdge?: boolean;
  } = {},
): Snap {
  const nearest = (candidates: Snap[]) =>
    candidates
      .filter((c) => distance(point, c.point) <= tolerance)
      .sort((a, b) => distance(point, a.point) - distance(point, b.point))[0];
  const exact = nearest(points.map((p) => ({ point: p, label: "Endpoint" })));
  if (exact) return exact;
  const midpoint = nearest([
    ...lines.map(([a, b]) => ({ point: lerp(a, b, 0.5), label: "Midpoint" })),
    ...(extra.midpoints ?? []),
  ]);
  if (midpoint) return midpoint;
  const refs = origin ? [origin, ...points] : points;
  const alignedEdge = nearest(extra.alignedEdges ?? []);
  if (alignedEdge) return alignedEdge;
  const edge = nearest([
    ...lines.map(([a, b]) => ({
      point: lerp(a, b, project(a, b, point)),
      label: "On edge",
    })),
    ...(extra.edges ?? []),
  ]);
  if (edge) {
    const guides = guidesAt(edge.point, refs);
    return guides.length ? { ...edge, guides } : edge;
  }
  if (extra.requireEdge) return { point, label: "" };
  const horizontal = alignmentReferences(point, refs, tolerance, "y")[0],
    vertical = alignmentReferences(point, refs, tolerance, "x")[0];
  const combined =
    horizontal && vertical ? { x: vertical.x, y: horizontal.y } : undefined;
  if (combined && distance(combined, point) <= tolerance)
    return {
      point: combined,
      label: "Aligned",
      guides: guidesAt(combined, refs),
    };
  const alignment = nearest([
    ...(horizontal
      ? [{ point: { x: point.x, y: horizontal.y }, label: "Horizontal" }]
      : []),
    ...(vertical
      ? [{ point: { x: vertical.x, y: point.y }, label: "Vertical" }]
      : []),
  ]);
  if (alignment)
    return { ...alignment, guides: guidesAt(alignment.point, refs) };
  const gridSnap =
    grid &&
    nearest([
      {
        point: {
          x: Math.round(point.x / 10) * 10,
          y: Math.round(point.y / 10) * 10,
        },
        label: "Grid",
      },
    ]);
  return gridSnap || { point, label: "" };
}
