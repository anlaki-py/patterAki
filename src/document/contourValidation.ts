import { seamIssue } from "./seamAllowance";
import {
  outlineArea,
  connectedPath,
  PIECE_AREA_TOLERANCE_MM2,
} from "./pieceTopology";
import type { PatternDocument } from "./schema";
import type { Segment } from "./segments";
import {
  formatContourIssues,
  validateContourSegments,
  type ContourCheck,
  type ContourIssue,
  type ContourSegment,
} from "../geometry/contourValidation";
import { distance, type Vec2 } from "../geometry/line";

export type ContourCycle = { pointIds: string[]; segmentIds: string[] };

const samePoint = (a: Vec2 | undefined, b: Vec2 | undefined) =>
  !!a && !!b && distance(a, b) < 1e-12;

export function contourSegment(
  doc: PatternDocument,
  edge: Segment,
): ContourSegment {
  const a = doc.points[edge.from],
    b = doc.points[edge.to];
  return edge.kind === "cubic"
    ? {
        id: edge.id,
        kind: "cubic",
        a,
        b,
        control1: edge.control1,
        control2: edge.control2,
      }
    : { id: edge.id, kind: "line", a, b };
}

function adjacency(doc: PatternDocument) {
  const map = new Map<string, string[]>();
  for (const edge of Object.values(doc.segments)) {
    for (const point of [edge.from, edge.to])
      map.set(point, [...(map.get(point) ?? []), edge.id]);
  }
  return map;
}

/**
 * Infer only unambiguous simple closed loops: every vertex has degree two and
 * the component's segment count equals its vertex count. Branched components
 * are not guessed into an arbitrary closed path.
 */
export function documentCycles(doc: PatternDocument): ContourCycle[] {
  const adjacent = adjacency(doc);
  const remaining = new Set(Object.keys(doc.segments));
  const cycles: ContourCycle[] = [];
  while (remaining.size) {
    const seed = [...remaining].sort()[0];
    const component = new Set<string>();
    const points = new Set<string>();
    const queue = [seed];
    while (queue.length) {
      const id = queue.shift()!;
      if (!remaining.has(id) || component.has(id)) continue;
      component.add(id);
      const edge = doc.segments[id];
      for (const point of [edge.from, edge.to]) {
        points.add(point);
        for (const next of adjacent.get(point) ?? [])
          if (!component.has(next)) queue.push(next);
      }
    }
    for (const id of component) remaining.delete(id);
    if ([...points].some((point) => (adjacent.get(point) ?? []).length !== 2))
      continue;
    if (points.size !== component.size) continue;
    const start = [...points].sort()[0];
    const segmentIds: string[] = [];
    const pointIds: string[] = [];
    let current = start,
      previous: string | null = null;
    while (true) {
      if (current === start && segmentIds.length) break;
      pointIds.push(current);
      const choices = [...(adjacent.get(current) ?? [])].sort();
      const edgeId =
        choices.find((id) => id !== previous && !segmentIds.includes(id)) ??
        choices.find((id) => id !== previous);
      if (!edgeId || segmentIds.includes(edgeId)) break;
      segmentIds.push(edgeId);
      const edge = doc.segments[edgeId];
      current = edge.from === current ? edge.to : edge.from;
      previous = edgeId;
      if (segmentIds.length > component.size + 1) break;
    }
    if (
      segmentIds.length === component.size &&
      current === start &&
      new Set(segmentIds).size === component.size
    )
      cycles.push({ pointIds, segmentIds });
  }
  return cycles;
}

export function contourSegmentsFor(
  doc: PatternDocument,
  segmentIds: string[],
): ContourSegment[] {
  return segmentIds
    .map((id) => doc.segments[id])
    .filter((edge): edge is Segment => !!edge)
    .map((edge) => contourSegment(doc, edge));
}

export function validateDocumentContours(doc: PatternDocument): ContourCheck {
  const issues = documentCycles(doc).flatMap(
    (cycle) =>
      validateContourSegments(contourSegmentsFor(doc, cycle.segmentIds)).issues,
  );
  return { valid: issues.length === 0, issues };
}

function geometryChanged(
  before: PatternDocument,
  after: PatternDocument,
  id: string,
) {
  const a = before.segments[id],
    b = after.segments[id];
  if (!a || !b) return true;
  if (a.kind !== b.kind) return true;
  if (
    !samePoint(before.points[a.from], after.points[b.from]) ||
    !samePoint(before.points[a.to], after.points[b.to])
  )
    return true;
  return a.kind === "cubic" && b.kind === "cubic"
    ? !samePoint(a.control1, b.control1) || !samePoint(a.control2, b.control2)
    : false;
}

/** Segment IDs whose geometry was translated, bent or otherwise changed. */
export function changedSegmentIds(
  before: PatternDocument,
  after: PatternDocument,
): Set<string> {
  const ids = new Set([
    ...Object.keys(before.segments),
    ...Object.keys(after.segments),
  ]);
  return new Set([...ids].filter((id) => geometryChanged(before, after, id)));
}

const sharesSegment = (a: ContourCycle, b: ContourCycle) =>
  a.segmentIds.some((id) => b.segmentIds.includes(id));

/**
 * Validate closed contours touched by an edit. Unrelated open construction
 * lines and pre-existing invalid contours are deliberately not revalidated.
 * Splitting an edge changes segment IDs but keeps a cycle alive through its
 * unchanged neighbours, so identity is matched by overlap rather than an exact
 * key.
 */
export function validateDocumentEdit(
  before: PatternDocument,
  after: PatternDocument,
): ContourCheck {
  const changed = changedSegmentIds(before, after);
  if (!changed.size) return { valid: true, issues: [] };
  const issues: ContourIssue[] = [];
  for (const piece of Object.values(after.pieces)) {
    const ids = piece.stitchingOutline.map((ref) => ref.segmentId);
    if (!ids.some((id) => changed.has(id))) continue;
    if (
      !connectedPath(after, piece.stitchingOutline, true) ||
      outlineArea(after, piece.stitchingOutline) <= PIECE_AREA_TOLERANCE_MM2
    )
      issues.push({
        code: "unknown-topology",
        segmentIds: ids,
        message: "Piece outline must stay closed, nondegenerate and clockwise.",
      });
    else
      issues.push(
        ...validateContourSegments(contourSegmentsFor(after, ids)).issues,
      );
  }
  const offsetIssue = seamIssue(after);
  if (offsetIssue)
    issues.push({
      code: "unknown-topology",
      segmentIds: [...changed],
      message: offsetIssue,
    });
  const afterCycles = documentCycles(after);
  for (const cycle of afterCycles) {
    if (!cycle.segmentIds.some((id) => changed.has(id))) continue;
    issues.push(
      ...validateContourSegments(contourSegmentsFor(after, cycle.segmentIds))
        .issues,
    );
  }
  for (const cycle of documentCycles(before)) {
    if (
      cycle.segmentIds.some((id) => changed.has(id)) &&
      !afterCycles.some((next) => sharesSegment(cycle, next))
    )
      issues.push({
        code: "unknown-topology",
        segmentIds: cycle.segmentIds,
        message:
          "This edit would break a closed contour into ambiguous or open topology.",
      });
  }
  return { valid: issues.length === 0, issues };
}

export function assertValidDocumentEdit(
  before: PatternDocument,
  after: PatternDocument,
) {
  const check = validateDocumentEdit(before, after);
  if (!check.valid) throw new Error(formatContourIssues(check));
  return after;
}
