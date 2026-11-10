import type { PatternDocument } from "../document/schema";
import { distance, type Vec2 } from "../geometry/line";
import {
  resolveSnapCandidates,
  snapPriority,
  type SnapCandidate,
} from "../geometry/snapping";
import {
  collectSnapCandidates,
  type SnapResolution,
  type SnapResolutionOptions,
} from "./snapResolver";

function pickupRadius(options: SnapResolutionOptions): number {
  return (
    (options.touch
      ? (options.touchRadiusPx ?? 16)
      : (options.mouseRadiusPx ?? 8)) / options.scale
  );
}

const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
const difference = (a: Vec2, b: Vec2): Vec2 => ({
  x: a.x - b.x,
  y: a.y - b.y,
});

function closestDistance(point: Vec2, a: Vec2, b: Vec2): number {
  const d = difference(b, a);
  const lengthSquared = dot(d, d);
  if (lengthSquared < 1e-12) return distance(point, a);
  const t = Math.max(
    0,
    Math.min(1, dot(difference(point, a), d) / lengthSquared),
  );
  return distance(point, { x: a.x + d.x * t, y: a.y + d.y * t });
}

/**
 * A line can be perpendicular to a nearby straight reference edge without
 * ending exactly on that edge. The foot-on-segment snap still has priority.
 */
export function perpendicularRayCandidates(
  doc: PatternDocument,
  pointer: Vec2,
  options: SnapResolutionOptions,
): SnapCandidate[] {
  const origin = options.origin;
  if (
    !origin ||
    options.modes?.perpendicular === false ||
    (options.tool !== "line" && options.tool !== "polyline")
  )
    return [];

  const tolerance = pickupRadius(options);
  const referenceRadius = Math.max(tolerance * 3, 12 / options.scale);
  const raw = difference(pointer, origin);
  const results: SnapCandidate[] = [];
  for (const edge of Object.values(doc.segments)) {
    if (edge.kind !== "line" || options.excludedEdges?.has(edge.id)) continue;
    const a = doc.points[edge.from];
    const b = doc.points[edge.to];
    if (!a || !b) continue;
    const ab = difference(b, a);
    const length = Math.hypot(ab.x, ab.y);
    if (length < 1e-9) continue;
    if (
      Math.min(closestDistance(origin, a, b), closestDistance(pointer, a, b)) >
      referenceRadius
    )
      continue;

    const tangent = { x: ab.x / length, y: ab.y / length };
    const normal = { x: -tangent.y, y: tangent.x };

    // If the normal through the draft origin reaches the reference SEGMENT,
    // prefer the exact intersection over a nearby free perpendicular ray.
    // Otherwise an on-edge click could end at y=50.8 instead of y=50.
    const footT = dot(difference(origin, a), tangent);
    if (footT >= 0 && footT <= length) {
      const foot = {
        x: a.x + tangent.x * footT,
        y: a.y + tangent.y * footT,
      };
      if (
        distance(pointer, foot) <= tolerance &&
        distance(origin, foot) > 1e-9
      ) {
        results.push({
          point: foot,
          label: "Perpendicular",
          kind: "perpendicular",
          targetId: `perpendicular-foot:${edge.id}`,
          priority: snapPriority.perpendicular,
          edgeId: edge.id,
          t: footT / length,
          guides: [{ from: origin, to: foot }],
        });
        continue;
      }
    }

    const along = dot(raw, normal);
    if (Math.abs(along) < 1e-9 || Math.abs(dot(raw, tangent)) > tolerance)
      continue;
    const foot = {
      x: Math.abs(normal.x) < 1e-12 ? origin.x : origin.x + normal.x * along,
      y: Math.abs(normal.y) < 1e-12 ? origin.y : origin.y + normal.y * along,
    };
    results.push({
      point: foot,
      label: "Perpendicular · 90°",
      kind: "perpendicular",
      targetId: `perpendicular-ray:${edge.id}`,
      priority: snapPriority.perpendicular + 0.5,
      guides: [{ from: origin, to: foot }],
    });
  }
  return results;
}

/**
 * Resolve drawing snaps, including perpendicular directions to nearby edges.
 * Only called for active Line/Polyline drafts, never for moves or Add point.
 */
export function resolveDraftSnap(
  doc: PatternDocument,
  pointer: Vec2,
  options: SnapResolutionOptions,
): SnapResolution {
  const tolerance = pickupRadius(options);
  const normal = collectSnapCandidates(doc, pointer, options);
  const rays = perpendicularRayCandidates(doc, pointer, options);
  const chosen = resolveSnapCandidates(pointer, [...normal, ...rays], {
    tolerance,
    previousLock: options.previousLock,
    cycleOffset: options.cycleOffset,
    releaseMultiplier: options.releaseMultiplier,
  });
  return { ...chosen, tolerance };
}

/**
 * Shift is a hard 45°-increment angle lock. Compatible magnetic targets may
 * change *length* but never the angle, so a snapped point cannot tilt the line.
 */
export function resolveConstrainedSnap(
  doc: PatternDocument,
  constrained: Vec2,
  options: SnapResolutionOptions & { origin: Vec2 },
): SnapResolution {
  const tolerance = pickupRadius(options);
  const origin = options.origin;
  const direction = difference(constrained, origin);
  const length = Math.hypot(direction.x, direction.y);
  if (length < 1e-9)
    return { choices: [], choiceIndex: 0, lock: null, tolerance };
  const unit = { x: direction.x / length, y: direction.y / length };
  const onRay = (point: Vec2) => {
    const v = difference(point, origin);
    const cross = unit.x * v.y - unit.y * v.x;
    return Math.abs(cross) < 1e-8 && dot(unit, v) >= -1e-8;
  };

  const targets = collectSnapCandidates(doc, constrained, options)
    // Bare angle/alignment feedback isn't a magnetic object to lock onto.
    .filter((target) => target.kind !== "angle" && target.kind !== "alignment")
    .filter((target) => onRay(target.point));

  if (options.modes?.alignments !== false) {
    for (const [id, ref] of Object.entries(doc.points)) {
      if (id === options.movingPoint || options.excludedPoints?.has(id))
        continue;
      for (const axis of ["x", "y"] as const) {
        if (Math.abs(unit[axis]) < 1e-9) continue;
        const along = (ref[axis] - origin[axis]) / unit[axis];
        if (along <= 1e-9) continue;
        const aligned = {
          x: origin.x + unit.x * along,
          y: origin.y + unit.y * along,
        };
        if (distance(constrained, aligned) > tolerance) continue;
        targets.push({
          point: aligned,
          label:
            axis === "x"
              ? "X aligned · angle locked"
              : "Y aligned · angle locked",
          kind: "alignment",
          targetId: `shift:${axis}:${id}`,
          priority: snapPriority.alignment,
          guides: [{ from: ref, to: aligned }],
        });
      }
    }
  }

  // Intersect the hard Shift ray with real straight edges. Nearest-edge
  // projections alone can be slightly off-axis and tilt the final line.
  if (options.modes?.edges !== false) {
    const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x;
    for (const edge of Object.values(doc.segments)) {
      if (edge.kind !== "line" || options.excludedEdges?.has(edge.id)) continue;
      const a = doc.points[edge.from];
      const b = doc.points[edge.to];
      if (!a || !b) continue;
      const segment = difference(b, a);
      const denominator = cross(unit, segment);
      if (Math.abs(denominator) < 1e-10) continue;
      const offset = difference(a, origin);
      const alongRay = cross(offset, segment) / denominator;
      const alongEdge = cross(offset, unit) / denominator;
      if (alongRay < 0 || alongEdge < 0 || alongEdge > 1) continue;
      const intersection = {
        x: origin.x + unit.x * alongRay,
        y: origin.y + unit.y * alongRay,
      };
      if (distance(constrained, intersection) > tolerance) continue;
      targets.push({
        point: intersection,
        label: "On edge · angle locked",
        kind: "on-edge",
        targetId: `shift:edge:${edge.id}`,
        priority: snapPriority["on-edge"] - 1,
        edgeId: edge.id,
        t: alongEdge,
        guides: [{ from: origin, to: intersection }],
      });
    }
  }

  // Intersection with a visible construction guide also maintains the angle.
  if (
    options.modes?.guides !== false &&
    options.showGuides !== false &&
    options.snapGuides !== false
  ) {
    for (const guide of Object.values(doc.guides)) {
      if (!guide.visible || Math.abs(unit[guide.axis]) < 1e-9) continue;
      const along = (guide.positionMm - origin[guide.axis]) / unit[guide.axis];
      if (along < 0) continue;
      const intersection = {
        x: origin.x + unit.x * along,
        y: origin.y + unit.y * along,
      };
      if (distance(constrained, intersection) > tolerance) continue;
      targets.push({
        point: intersection,
        label: "Guide · angle locked",
        kind: "guide",
        targetId: `shift:guide:${guide.id}`,
        priority: snapPriority.guide,
        guides: [{ from: origin, to: intersection }],
      });
    }
  }

  const resolution = resolveSnapCandidates(constrained, targets, {
    tolerance,
    previousLock: options.previousLock,
    cycleOffset: options.cycleOffset,
    releaseMultiplier: options.releaseMultiplier,
  });
  return { ...resolution, tolerance };
}
