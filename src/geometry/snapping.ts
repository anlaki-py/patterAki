import { distance, lerp, project, type Vec2 } from "./line";
export type SnapGuide = { from: Vec2; to: Vec2 };
export type Snap = {
  point: Vec2;
  label: string;
  guides?: SnapGuide[];
  edgeId?: string;
  t?: number;
};
export type SnapKind =
  | "endpoint"
  | "intersection"
  | "guide-intersection"
  | "midpoint"
  | "perpendicular"
  | "on-edge"
  | "guide"
  | "angle"
  | "alignment"
  | "grid";
export type SnapCandidate = Snap & {
  kind: SnapKind;
  targetId: string;
  priority: number;
  selectable?: boolean;
};
export type SnapLock = {
  targetId: string;
  point: Vec2;
  kind: SnapKind;
};
export const snapPriority: Record<SnapKind, number> = {
  endpoint: 1,
  intersection: 2,
  "guide-intersection": 3,
  midpoint: 4,
  perpendicular: 5,
  "on-edge": 7,
  guide: 7,
  angle: 8.5,
  alignment: 8,
  grid: 9,
};
export const alignedEdgePriority = 6;
const finite = (p: Vec2) => Number.isFinite(p.x) && Number.isFinite(p.y);
function compareCandidates(pointer: Vec2, a: SnapCandidate, b: SnapCandidate) {
  if (a.priority !== b.priority) return a.priority - b.priority;
  const byDistance = distance(pointer, a.point) - distance(pointer, b.point);
  if (byDistance !== 0) return byDistance;
  if (a.targetId !== b.targetId) return a.targetId < b.targetId ? -1 : 1;
  const byT = (a.t ?? 0) - (b.t ?? 0);
  if (byT !== 0) return byT;
  const byX = a.point.x - b.point.x;
  return byX !== 0 ? byX : a.point.y - b.point.y;
}
export function sortSnapCandidates(pointer: Vec2, candidates: SnapCandidate[]) {
  return [...candidates].sort((a, b) => compareCandidates(pointer, a, b));
}
export function resolveSnapCandidates(
  pointer: Vec2,
  candidates: SnapCandidate[],
  options: {
    tolerance: number;
    previousLock?: SnapLock | null;
    cycleOffset?: number;
    releaseMultiplier?: number;
  },
): {
  chosen?: SnapCandidate;
  choices: SnapCandidate[];
  choiceIndex: number;
  lock: SnapLock | null;
} {
  const tolerance = options.tolerance;
  if (!finite(pointer) || !Number.isFinite(tolerance) || tolerance <= 0)
    return { choices: [], choiceIndex: 0, lock: null };
  const finiteCandidates = candidates.filter(
    (candidate) =>
      finite(candidate.point) && Number.isFinite(candidate.priority),
  );
  const eligible = finiteCandidates.filter(
    (candidate) => distance(pointer, candidate.point) <= tolerance,
  );
  const sorted = sortSnapCandidates(pointer, eligible);
  const best = sorted[0];
  const release = tolerance * Math.max(1, options.releaseMultiplier ?? 1.5);
  let held: SnapCandidate | undefined;
  if (options.previousLock) {
    // Hysteresis keeps the chosen target between acquisition radius and the
    // release radius even though no new target could be acquired there.
    held = finiteCandidates.find(
      (candidate) => candidate.targetId === options.previousLock!.targetId,
    );
    if (held && distance(pointer, held.point) > release) held = undefined;
    // An exact topology target can replace a held weak candidate when the raw
    // pointer lands within a small inner radius. Without this exception a held
    // grid/alignment target could make a nearby endpoint unreachable.
    if (
      held &&
      best &&
      best.priority <= 2 &&
      best.priority < held.priority &&
      distance(pointer, best.point) <= tolerance * 0.4
    )
      held = best;
  }
  const base = held ?? best;
  if (!base) return { choices: [], choiceIndex: 0, lock: null };
  const choices = sorted.filter(
    (candidate) => candidate.priority === base.priority,
  );
  if (!choices.some((candidate) => candidate.targetId === base.targetId))
    choices.unshift(base);
  const baseIndex = Math.max(
    0,
    choices.findIndex((candidate) => candidate.targetId === base.targetId),
  );
  const offset = options.cycleOffset ?? 0;
  const choiceIndex =
    choices.length > 0
      ? (((baseIndex + offset) % choices.length) + choices.length) %
        choices.length
      : 0;
  const chosen = choices[choiceIndex] ?? base;
  return {
    chosen,
    choices,
    choiceIndex,
    lock: {
      targetId: chosen.targetId,
      point: chosen.point,
      kind: chosen.kind,
    },
  };
}
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
    intersections?: Snap[];
    requireEdge?: boolean;
  } = {},
): Snap {
  const nearest = (candidates: Snap[]) =>
    candidates
      .filter((c) => distance(point, c.point) <= tolerance)
      .sort((a, b) => distance(point, a.point) - distance(point, b.point))[0];
  const exact = nearest(points.map((p) => ({ point: p, label: "Endpoint" })));
  if (exact) return exact;
  const crossing = nearest(extra.intersections ?? []);
  if (crossing) return crossing;
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
