import { cubicPoint } from "../geometry/bezier";
import type { Vec2 } from "../geometry/line";
import { asCubic } from "./segments";
import {
  documentSchema,
  type PatternDocument,
  type PatternPiece,
} from "./schema";
import { normalizeOutline } from "./pieceTopology";
import { pieceEdges } from "./pieces";
export type RigidTransform = PatternPiece["transform"];
export function applyTransform(m: RigidTransform, p: Vec2): Vec2 {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}
export function composeTransform(
  m: RigidTransform,
  n: RigidTransform,
): RigidTransform {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}
export function pieceBounds(doc: PatternDocument, ids: string[]) {
  const samples: Vec2[] = [];
  for (const id of ids) {
    const piece = doc.pieces[id];
    if (!piece) throw new Error("Piece no longer exists.");
    for (const edgeId of pieceEdges(doc, piece)) {
      const edge = doc.segments[edgeId];
      const curve = asCubic(doc, edge);
      samples.push(curve[0], curve[3]);
      if (edge.kind !== "cubic") continue;
      for (const axis of ["x", "y"] as const) {
        const [p0, p1, p2, p3] = curve.map((p) => p[axis]);
        const a = -p0 + 3 * p1 - 3 * p2 + p3,
          b = 2 * (p0 - 2 * p1 + p2),
          c = p1 - p0;
        const discriminant = b * b - 4 * a * c;
        const roots =
          Math.abs(a) < 1e-12
            ? Math.abs(b) < 1e-12
              ? []
              : [-c / b]
            : discriminant < 0
              ? []
              : [
                  (-b + Math.sqrt(discriminant)) / (2 * a),
                  (-b - Math.sqrt(discriminant)) / (2 * a),
                ];
        for (const t of roots)
          if (t > 0 && t < 1) samples.push(cubicPoint(curve, t));
      }
    }
  }
  if (!samples.length) throw new Error("Select at least one piece.");
  return {
    min: {
      x: Math.min(...samples.map((p) => p.x)),
      y: Math.min(...samples.map((p) => p.y)),
    },
    max: {
      x: Math.max(...samples.map((p) => p.x)),
      y: Math.max(...samples.map((p) => p.y)),
    },
  };
}
export function transformPieces(
  doc: PatternDocument,
  ids: string[],
  matrix: RigidTransform,
): PatternDocument {
  const selected = new Set(ids);
  if (!selected.size) throw new Error("Select at least one piece.");
  const edges = new Set<string>();
  for (const id of selected) {
    const piece = doc.pieces[id];
    if (!piece || piece.locked || !piece.visible)
      throw new Error("Hidden or locked pieces cannot be transformed.");
    pieceEdges(doc, piece).forEach((edgeId) => edges.add(edgeId));
  }
  const points = new Set(
    [...edges].flatMap((id) => [doc.segments[id].from, doc.segments[id].to]),
  );
  const next: PatternDocument = {
    ...doc,
    points: Object.fromEntries(
      Object.entries(doc.points).map(([id, p]) => [
        id,
        points.has(id) ? { ...p, ...applyTransform(matrix, p) } : p,
      ]),
    ),
    segments: Object.fromEntries(
      Object.entries(doc.segments).map(([id, edge]) => [
        id,
        edges.has(id) && edge.kind === "cubic"
          ? {
              ...edge,
              control1: applyTransform(matrix, edge.control1),
              control2: applyTransform(matrix, edge.control2),
            }
          : edge,
      ]),
    ),
    pieces: { ...doc.pieces },
  };
  for (const id of selected)
    next.pieces[id] = {
      ...doc.pieces[id],
      transform: composeTransform(matrix, doc.pieces[id].transform),
      stitchingOutline: normalizeOutline(next, doc.pieces[id].stitchingOutline),
    };
  return documentSchema.parse(next);
}
export function rotationAround(degrees: number, pivot: Vec2): RigidTransform {
  if (!Number.isFinite(degrees)) throw new Error("Rotation must be finite.");
  const radians = (degrees * Math.PI) / 180,
    a = Math.cos(radians),
    b = Math.sin(radians);
  return {
    a,
    b,
    c: -b,
    d: a,
    e: pivot.x - a * pivot.x + b * pivot.y,
    f: pivot.y - b * pivot.x - a * pivot.y,
  };
}
export function mirrorAround(axis: "x" | "y", pivot: Vec2): RigidTransform {
  return axis === "x"
    ? { a: -1, b: 0, c: 0, d: 1, e: 2 * pivot.x, f: 0 }
    : { a: 1, b: 0, c: 0, d: -1, e: 0, f: 2 * pivot.y };
}
/** World-mm geometry is canonical. The accumulated rigid frame is baked into
 * points/controls and records placement; renderers must never apply it again. */
export function duplicatePieces(
  doc: PatternDocument,
  ids: string[],
  createId: () => string,
  delta: Vec2,
): { document: PatternDocument; pieceIds: string[] } {
  let next = structuredClone(doc);
  const used = new Set([
    ...Object.keys(doc.points),
    ...Object.keys(doc.segments),
    ...Object.keys(doc.annotations),
    ...Object.keys(doc.guides),
    ...Object.keys(doc.pieces),
    ...Object.values(doc.pieces).flatMap((p) =>
      p.internalPaths.map((path) => path.id),
    ),
  ]);
  const fresh = () => {
    const id = createId();
    if (!id || used.has(id))
      throw new Error(
        "Duplicate ID generator returned an existing or empty ID.",
      );
    used.add(id);
    return id;
  };
  const result: string[] = [];
  for (const id of new Set(ids)) {
    const source = doc.pieces[id];
    if (!source || source.locked || !source.visible)
      throw new Error("Select visible, unlocked pieces to duplicate.");
    const pieceId = fresh(),
      pointMap = new Map<string, string>(),
      edgeMap = new Map<string, string>();
    for (const edgeId of pieceEdges(doc, source)) {
      const edge = doc.segments[edgeId];
      for (const pointId of [edge.from, edge.to])
        if (!pointMap.has(pointId)) {
          const newId = fresh();
          pointMap.set(pointId, newId);
          next.points[newId] = { ...doc.points[pointId] };
        }
      const newId = fresh();
      edgeMap.set(edgeId, newId);
      next.segments[newId] = {
        ...structuredClone(edge),
        id: newId,
        from: pointMap.get(edge.from)!,
        to: pointMap.get(edge.to)!,
      };
    }
    const refs = (edges: PatternPiece["stitchingOutline"]) =>
      edges.map((ref) => ({ ...ref, segmentId: edgeMap.get(ref.segmentId)! }));
    next.pieces[pieceId] = {
      ...structuredClone(source),
      id: pieceId,
      name: `${source.name.slice(0, 115)} copy`,
      rootSegmentId: edgeMap.get(source.rootSegmentId)!,
      stitchingOutline: refs(source.stitchingOutline),
      internalPaths: source.internalPaths.map((path) => ({
        ...path,
        id: fresh(),
        edges: refs(path.edges),
      })),
    };
    result.push(pieceId);
  }
  next = transformPieces(next, result, {
    a: 1,
    b: 0,
    c: 0,
    d: 1,
    e: delta.x,
    f: delta.y,
  });
  return { document: next, pieceIds: result };
}
