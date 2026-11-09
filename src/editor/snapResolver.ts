import type { PatternDocument } from "../document/schema";
import type { Tool } from "./store";
import { geometrySnaps } from "./geometrySnaps";
import {
  guideEdgeSnaps,
  guideGuideSnaps,
  guideProjectionSnaps,
  rayGuideSnaps,
} from "./guideSnaps";
import { distance, type Vec2 } from "../geometry/line";
import {
  alignmentReferences,
  alignedEdgePriority,
  guidesAt,
  resolveSnapCandidates,
  snapPriority,
  type SnapCandidate,
  type SnapKind,
  type SnapLock,
} from "../geometry/snapping";
import type { SnapModes } from "./settings";
export type SnapResolutionOptions = {
  tool: Tool;
  scale: number;
  touch: boolean;
  origin?: Vec2;
  movingPoint?: string;
  excludedPoints?: ReadonlySet<string>;
  excludedEdges?: ReadonlySet<string>;
  panning: boolean;
  snap: boolean;
  grid: boolean;
  bypass: boolean;
  constrain: boolean;
  modes?: SnapModes;
  gridSpacingMm?: number;
  mouseRadiusPx?: number;
  touchRadiusPx?: number;
  releaseMultiplier?: number;
  previousLock?: SnapLock | null;
  cycleOffset?: number;
  showGuides?: boolean;
  snapGuides?: boolean;
  axisLock?: "horizontal" | "vertical" | null;
  axisOrigin?: Vec2;
};
export type SnapResolution = {
  chosen?: SnapCandidate;
  choices: SnapCandidate[];
  choiceIndex: number;
  lock: SnapLock | null;
  tolerance: number;
};
const allModes: SnapModes = {
  endpoints: true,
  intersections: true,
  midpoints: true,
  edges: true,
  alignments: true,
  perpendicular: true,
  guides: true,
  grid: true,
};
const finite = (p: Vec2) => Number.isFinite(p.x) && Number.isFinite(p.y);
const candidate = (
  point: Vec2,
  label: string,
  kind: SnapKind,
  targetId: string,
  extra: Partial<SnapCandidate> = {},
): SnapCandidate => ({
  point,
  label,
  kind,
  targetId,
  priority: snapPriority[kind],
  ...extra,
});
const angularLabels = ["Horizontal", "45°", "Vertical", "45°"];
export function collectSnapCandidates(
  doc: PatternDocument,
  pointer: Vec2,
  options: SnapResolutionOptions,
): SnapCandidate[] {
  const modes = options.modes ?? allModes;
  const tolerance =
    (options.touch
      ? (options.touchRadiusPx ?? 16)
      : (options.mouseRadiusPx ?? 8)) / options.scale;
  const origin = options.origin;
  const pointEntries = Object.entries(doc.points)
    .filter(
      ([id]) => id !== options.movingPoint && !options.excludedPoints?.has(id),
    )
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const points = pointEntries.map(([, point]) => point);
  const refs = origin ? [origin, ...points] : points;
  const results: SnapCandidate[] = [];
  if (modes.endpoints)
    for (const [id, point] of pointEntries)
      results.push(candidate(point, "Endpoint", "endpoint", `point:${id}`));
  const geometry = geometrySnaps(
    doc,
    pointer,
    tolerance,
    refs,
    options.movingPoint,
    options.excludedEdges,
  );
  if (modes.intersections)
    for (const snap of geometry.intersections)
      results.push(
        candidate(
          snap.point,
          snap.label,
          "intersection",
          `intersection:${snap.edgeId}:${(snap.t ?? 0).toFixed(9)}`,
          {
            edgeId: snap.edgeId,
            t: snap.t,
          },
        ),
      );
  if (modes.midpoints)
    for (const snap of geometry.midpoints)
      results.push(
        candidate(
          snap.point,
          snap.label,
          "midpoint",
          `midpoint:${snap.edgeId}`,
          {
            edgeId: snap.edgeId,
            t: snap.t,
          },
        ),
      );
  if (modes.edges) {
    for (const snap of geometry.alignedEdges)
      results.push(
        candidate(
          snap.point,
          snap.label,
          "on-edge",
          `edge-alignment:${snap.edgeId}:${snap.label}`,
          {
            edgeId: snap.edgeId,
            t: snap.t,
            guides: snap.guides,
            priority: alignedEdgePriority,
          },
        ),
      );
    for (const snap of geometry.edges) {
      const guides = guidesAt(snap.point, refs);
      results.push(
        candidate(snap.point, snap.label, "on-edge", `edge:${snap.edgeId}`, {
          edgeId: snap.edgeId,
          t: snap.t,
          ...(guides.length ? { guides } : {}),
        }),
      );
    }
  }
  if (modes.alignments) {
    if ((options.tool === "line" || options.tool === "polyline") && origin) {
      for (let i = 0; i < 8; i++) {
        const radians = (i * Math.PI) / 4,
          ux = Math.cos(radians),
          uy = Math.sin(radians),
          dx = pointer.x - origin.x,
          dy = pointer.y - origin.y,
          along = dx * ux + dy * uy;
        if (along <= 0) continue;
        const point = {
          x: origin.x + along * ux,
          y: origin.y + along * uy,
        };
        if (distance(pointer, point) > tolerance) continue;
        results.push(
          candidate(point, angularLabels[i % 4], "angle", `angle:${i}`, {
            guides: [{ from: origin, to: point }],
          }),
        );
      }
    }
    const horizontal = alignmentReferences(pointer, refs, tolerance, "y")[0],
      vertical = alignmentReferences(pointer, refs, tolerance, "x")[0];
    if (horizontal && vertical) {
      const point = { x: vertical.x, y: horizontal.y };
      if (distance(pointer, point) <= tolerance)
        results.push(
          candidate(
            point,
            "Aligned",
            "alignment",
            `alignment:combined:${vertical.x.toFixed(9)}:${horizontal.y.toFixed(9)}`,
            {
              guides: guidesAt(point, refs),
              // A two-axis alignment is more specific than a single-axis
              // alignment, matching the legacy snapPoint ordering.
              priority: snapPriority.alignment - 0.1,
            },
          ),
        );
    }
    if (horizontal)
      results.push(
        candidate(
          { x: pointer.x, y: horizontal.y },
          "Horizontal",
          "alignment",
          `alignment:y:${horizontal.y.toFixed(9)}`,
          {
            guides: guidesAt({ x: pointer.x, y: horizontal.y }, refs),
          },
        ),
      );
    if (vertical)
      results.push(
        candidate(
          { x: vertical.x, y: pointer.y },
          "Vertical",
          "alignment",
          `alignment:x:${vertical.x.toFixed(9)}`,
          {
            guides: guidesAt({ x: vertical.x, y: pointer.y }, refs),
          },
        ),
      );
  }
  if (modes.perpendicular && origin)
    for (const edge of Object.values(doc.segments)) {
      if (edge.kind !== "line") continue;
      if (edge.from === options.movingPoint || edge.to === options.movingPoint)
        continue;
      if (options.excludedEdges?.has(edge.id)) continue;
      const a = doc.points[edge.from],
        b = doc.points[edge.to],
        ab = { x: b.x - a.x, y: b.y - a.y },
        squared = ab.x * ab.x + ab.y * ab.y;
      if (squared < 1e-12) continue;
      const t = ((origin.x - a.x) * ab.x + (origin.y - a.y) * ab.y) / squared;
      if (t < 0 || t > 1) continue;
      const foot = { x: a.x + t * ab.x, y: a.y + t * ab.y };
      if (distance(pointer, foot) > tolerance) continue;
      results.push(
        candidate(
          foot,
          "Perpendicular",
          "perpendicular",
          `perpendicular:${edge.id}`,
          {
            edgeId: edge.id,
            t,
            guides: [{ from: origin, to: foot }],
          },
        ),
      );
    }
  const guidesEnabled =
    modes.guides &&
    options.snapGuides !== false &&
    options.showGuides !== false;
  if (guidesEnabled) {
    results.push(
      ...guideProjectionSnaps(doc, pointer, tolerance, true),
      ...guideGuideSnaps(doc, pointer, tolerance, true),
      ...guideEdgeSnaps(doc, pointer, tolerance, true, options.excludedEdges),
    );
    if (origin && modes.alignments)
      results.push(...rayGuideSnaps(doc, pointer, origin, tolerance, true));
  }
  if (modes.grid && options.grid) {
    const spacing = options.gridSpacingMm ?? 10,
      ix = Math.round(pointer.x / spacing),
      iy = Math.round(pointer.y / spacing),
      point = { x: ix * spacing, y: iy * spacing };
    if (distance(pointer, point) <= tolerance)
      results.push(candidate(point, "", "grid", `grid:${ix}:${iy}`));
  }
  return results;
}
export function resolveSnapDetailed(
  doc: PatternDocument,
  pointer: Vec2,
  options: SnapResolutionOptions,
): SnapResolution {
  const tolerance =
    (options.touch
      ? (options.touchRadiusPx ?? 16)
      : (options.mouseRadiusPx ?? 8)) / options.scale;
  let candidates = collectSnapCandidates(doc, pointer, options);
  if (options.axisLock) {
    const axis = options.axisLock;
    const origin = options.axisOrigin;
    if (origin)
      candidates = candidates.filter((candidate) =>
        axis === "horizontal"
          ? Math.abs(candidate.point.y - origin.y) <= 1e-6
          : Math.abs(candidate.point.x - origin.x) <= 1e-6,
      );
  }
  if (options.tool === "point")
    candidates = candidates.filter(
      (candidate) =>
        candidate.kind === "endpoint" ||
        (!!candidate.edgeId && candidate.t !== undefined),
    );
  const resolution = resolveSnapCandidates(pointer, candidates, {
    tolerance,
    previousLock: options.previousLock,
    cycleOffset: options.cycleOffset,
    releaseMultiplier: options.releaseMultiplier,
  });
  return { ...resolution, tolerance };
}
export function stripSnap(candidate: SnapCandidate | undefined) {
  if (!candidate) return undefined;
  const { point, label, guides, edgeId, t } = candidate;
  return {
    point,
    label,
    ...(guides ? { guides } : {}),
    ...(edgeId ? { edgeId } : {}),
    ...(t !== undefined ? { t } : {}),
  };
}
export function snapIsFree(candidate: SnapCandidate | undefined) {
  return !candidate || !finite(candidate.point);
}
