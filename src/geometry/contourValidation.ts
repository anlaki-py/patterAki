import { cubicIntersections, lineIntersections } from "./intersections";
import { cubicPoint, type Cubic } from "./bezier";
import { distance, lerp, type Vec2 } from "./line";

export type ContourSegment =
  | { id: string; kind: "line"; a: Vec2; b: Vec2 }
  | {
      id: string;
      kind: "cubic";
      a: Vec2;
      b: Vec2;
      control1: Vec2;
      control2: Vec2;
    };

export type ContourIssueCode =
  "self-intersection" | "overlap" | "zero-length" | "unknown-topology";

export type ContourIssue = {
  code: ContourIssueCode;
  segmentIds: string[];
  point?: Vec2;
  message: string;
};

export type ContourCheck = { valid: boolean; issues: ContourIssue[] };

export const CONTOUR_TOLERANCE = 1e-7;

const cubicOf = (segment: ContourSegment): Cubic =>
  segment.kind === "cubic"
    ? [segment.a, segment.control1, segment.control2, segment.b]
    : [
        segment.a,
        lerp(segment.a, segment.b, 1 / 3),
        lerp(segment.a, segment.b, 2 / 3),
        segment.b,
      ];

const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x;

type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
function boundsOf(c: Cubic): Bounds {
  return {
    minX: Math.min(...c.map((p) => p.x)),
    maxX: Math.max(...c.map((p) => p.x)),
    minY: Math.min(...c.map((p) => p.y)),
    maxY: Math.max(...c.map((p) => p.y)),
  };
}
function boxesOverlap(a: Bounds, b: Bounds, tolerance: number) {
  return !(
    a.maxX < b.minX - tolerance ||
    b.maxX < a.minX - tolerance ||
    a.maxY < b.minY - tolerance ||
    b.maxY < a.minY - tolerance
  );
}

/**
 * Interior self-intersections of one cubic. Uses the polynomial identity
 * C(t)-C(u) = (t-u)(a(t²+tu+u²) + b(t+u) + c) from the builder brief.
 * Near-singular coefficient pairs (straight/control-collinear curves) are
 * treated as no interior crossing instead of dividing by a near-zero value.
 */
export function cubicSelfIntersections(
  c: Cubic,
): { t: number; u: number; point: Vec2 }[] {
  const a = {
    x: -c[0].x + 3 * c[1].x - 3 * c[2].x + c[3].x,
    y: -c[0].y + 3 * c[1].y - 3 * c[2].y + c[3].y,
  };
  const b = {
    x: 3 * c[0].x - 6 * c[1].x + 3 * c[2].x,
    y: 3 * c[0].y - 6 * c[1].y + 3 * c[2].y,
  };
  const linear = {
    x: -3 * c[0].x + 3 * c[1].x,
    y: -3 * c[0].y + 3 * c[1].y,
  };
  const denominator = cross(a, b);
  const conditioning =
    1e-12 * Math.max(1, Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y));
  if (Math.abs(denominator) <= conditioning) return [];
  const negLinear = { x: -linear.x, y: -linear.y };
  const q = cross(negLinear, b) / denominator;
  const s = cross(a, negLinear) / denominator;
  const product = s * s - q;
  const discriminant = s * s - 4 * product;
  if (discriminant <= 1e-12) return [];
  const root = Math.sqrt(discriminant);
  const t = (s + root) / 2;
  const u = (s - root) / 2;
  if (
    t <= 1e-7 ||
    t >= 1 - 1e-7 ||
    u <= 1e-7 ||
    u >= 1 - 1e-7 ||
    Math.abs(t - u) <= 1e-6
  )
    return [];
  const point = cubicPoint(c, t);
  const box = boundsOf(c);
  const size = Math.max(box.maxX - box.minX, box.maxY - box.minY, 1);
  if (distance(point, cubicPoint(c, u)) > 1e-6 * size) return [];
  return [{ t, u, point }];
}

function sharedEndpoint(a: ContourSegment, b: ContourSegment) {
  const candidates = [a.a, a.b];
  return candidates.find(
    (point) =>
      distance(point, b.a) <= CONTOUR_TOLERANCE ||
      distance(point, b.b) <= CONTOUR_TOLERANCE,
  );
}

function addIssue(issues: ContourIssue[], issue: ContourIssue) {
  if (
    issues.some(
      (existing) =>
        existing.code === issue.code &&
        existing.segmentIds.join("|") === issue.segmentIds.join("|"),
    )
  )
    return;
  issues.push(issue);
}

/**
 * Validate one ordered closed contour. Adjacent segments may touch at their
 * intentional shared endpoint; any other touch, crossing, tangency or overlap
 * is reported. Separate contours are intentionally not compared here.
 */
export function validateContourSegments(
  segments: ContourSegment[],
): ContourCheck {
  const issues: ContourIssue[] = [];
  if (segments.length < 3)
    addIssue(issues, {
      code: "unknown-topology",
      segmentIds: segments.map((segment) => segment.id),
      message: "A closed contour needs at least three segments.",
    });
  for (const segment of segments) {
    if (distance(segment.a, segment.b) < 1e-9)
      addIssue(issues, {
        code: "zero-length",
        segmentIds: [segment.id],
        point: segment.a,
        message: `Segment ${segment.id} has zero length.`,
      });
  }
  const curves = segments.map(cubicOf);
  const boxes = curves.map(boundsOf);
  for (let i = 0; i < segments.length; i++) {
    const self = cubicSelfIntersections(curves[i]);
    if (self.length)
      addIssue(issues, {
        code: "self-intersection",
        segmentIds: [segments[i].id],
        point: self[0].point,
        message: `Curve ${segments[i].id} crosses itself at ${self[0].point.x.toFixed(2)}, ${self[0].point.y.toFixed(2)} mm.`,
      });
    for (let j = i + 1; j < segments.length; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === segments.length - 1);
      if (!boxesOverlap(boxes[i], boxes[j], CONTOUR_TOLERANCE)) continue;
      const shared = adjacent
        ? sharedEndpoint(segments[i], segments[j])
        : undefined;
      let hits;
      try {
        hits =
          segments[i].kind === "line" && segments[j].kind === "line"
            ? lineIntersections(
                segments[i].a,
                segments[i].b,
                segments[j].a,
                segments[j].b,
              )
            : cubicIntersections(curves[i], curves[j]);
      } catch (error) {
        addIssue(issues, {
          code: /overlap|too close/i.test((error as Error).message)
            ? "overlap"
            : "unknown-topology",
          segmentIds: [segments[i].id, segments[j].id],
          message: `Segments ${segments[i].id} and ${segments[j].id} cannot be resolved safely: ${(error as Error).message}`,
        });
        continue;
      }
      const crossing = hits.find(
        (hit) => !shared || distance(hit.point, shared) > 1e-6,
      );
      if (crossing)
        addIssue(issues, {
          code: "self-intersection",
          segmentIds: [segments[i].id, segments[j].id],
          point: crossing.point,
          message: `Contour crosses itself at ${crossing.point.x.toFixed(2)}, ${crossing.point.y.toFixed(2)} mm between ${segments[i].id} and ${segments[j].id}.`,
        });
    }
  }
  return { valid: issues.length === 0, issues };
}

/** Validate a new explicitly closed path before it becomes a document. */
export function validateClosedPositions(positions: Vec2[]): ContourCheck {
  const ids = positions.map((_, index) => `draft-${index}`);
  return validateContourSegments(
    positions.map((a, index) => ({
      id: ids[index],
      kind: "line",
      a,
      b: positions[(index + 1) % positions.length],
    })),
  );
}

export function formatContourIssues(check: ContourCheck): string {
  if (check.valid) return "";
  return `Closed contour is invalid: ${check.issues.map((issue) => issue.message).join(" ")}`;
}
