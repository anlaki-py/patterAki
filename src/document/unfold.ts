import { documentSchema, type PatternDocument } from "./schema";
import {
  applyTransform,
  composeTransform,
  duplicatePieces,
  transformPieces,
} from "./pieceTransforms";
import { inverseTransform, resolvedMark } from "./sewing";
import { orderedOutline } from "./pieceTopology";
export function foldReflection(
  doc: PatternDocument,
  pieceId: string,
  edgeId: string,
) {
  const piece = doc.pieces[pieceId],
    edge = doc.segments[edgeId];
  if (
    !piece?.stitchingOutline.some((r) => r.segmentId === edgeId) ||
    piece.sewing?.edges[edgeId]?.role !== "fold" ||
    edge.kind !== "line"
  )
    throw new Error("Designate a straight outline edge as On fold first.");
  const a = doc.points[edge.from],
    b = doc.points[edge.to],
    length = Math.hypot(b.x - a.x, b.y - a.y);
  const x = (b.x - a.x) / length,
    y = (b.y - a.y) / length;
  const m = {
    a: 2 * x * x - 1,
    b: 2 * x * y,
    c: 2 * x * y,
    d: 2 * y * y - 1,
    e: 0,
    f: 0,
  };
  m.e = a.x - m.a * a.x - m.c * a.y;
  m.f = a.y - m.b * a.x - m.d * a.y;
  return m;
}
export function mirrorOnFold(
  doc: PatternDocument,
  pieceId: string,
  edgeId: string,
) {
  return transformPieces(doc, [pieceId], foldReflection(doc, pieceId, edgeId));
}
/** Weld the reflected half into one canonical stitching loop. The fold becomes interior. */
export function unfoldPiece(
  doc: PatternDocument,
  pieceId: string,
  edgeId: string,
  id: () => string,
) {
  const reflection = foldReflection(doc, pieceId, edgeId);
  if (doc.pieces[pieceId].sewing?.notches.some((n) => n.segmentId === edgeId))
    throw new Error(
      "Move or remove notches on the fold before unfolding; the fold becomes interior.",
    );
  const result = duplicatePieces(doc, [pieceId], id, { x: 0, y: 0 });
  const reflected = transformPieces(
    result.document,
    result.pieceIds,
    reflection,
  );
  const next = structuredClone(reflected),
    source = next.pieces[pieceId],
    other = next.pieces[result.pieceIds[0]];
  const index = source.stitchingOutline.findIndex(
    (r) => r.segmentId === edgeId,
  );
  // Duplicate retains the stored endpoint directions even after winding normalization.
  const otherFold = Object.keys(other.sewing?.edges ?? {}).find(
    (key) =>
      other.sewing!.edges[key].role === "fold" &&
      (() => {
        const e = next.segments[key],
          original = next.segments[edgeId];
        return (
          e.kind === "line" &&
          Math.hypot(
            next.points[e.from].x - next.points[original.from].x,
            next.points[e.from].y - next.points[original.from].y,
          ) < 1e-6 &&
          Math.hypot(
            next.points[e.to].x - next.points[original.to].x,
            next.points[e.to].y - next.points[original.to].y,
          ) < 1e-6
        );
      })(),
  );
  if (!otherFold || index < 0)
    throw new Error("Cannot resolve reflected fold.");
  // Keep the former boundary symbols as interior marks in each half's frame.
  for (const [p, fold] of [
    [source, edgeId],
    [other, otherFold],
  ] as const) {
    p.sewing!.marks = p.sewing!.marks.map((mark) => {
      if (mark.segmentId !== fold) return mark;
      const world = resolvedMark(next, p, mark),
        angle = (world.rotation * Math.PI) / 180;
      const direction = {
        x: p.transform.a * Math.cos(angle) + p.transform.b * Math.sin(angle),
        y: p.transform.c * Math.cos(angle) + p.transform.d * Math.sin(angle),
      };
      const { segmentId: _segmentId, ...rest } = mark;
      void _segmentId;
      return {
        ...rest,
        position: inverseTransform(p.transform, world.position),
        rotation: (Math.atan2(direction.y, direction.x) * 180) / Math.PI,
      };
    });
  }
  const a = next.segments[edgeId],
    b = { ...next.segments[otherFold] };
  for (const edge of Object.values(next.segments)) {
    if (edge.from === b.from) edge.from = a.from;
    if (edge.from === b.to) edge.from = a.to;
    if (edge.to === b.from) edge.to = a.from;
    if (edge.to === b.to) edge.to = a.to;
  }
  delete next.points[b.from];
  delete next.points[b.to];
  delete next.segments[edgeId];
  delete next.segments[otherFold];
  const remaining = [...source.stitchingOutline, ...other.stitchingOutline]
    .map((r) => r.segmentId)
    .filter((key) => key !== edgeId && key !== otherFold);
  const ordered: string[] = [remaining.shift()!];
  let endpoint = next.segments[ordered[0]].to;
  while (remaining.length) {
    const i = remaining.findIndex(
      (key) =>
        next.segments[key].from === endpoint ||
        next.segments[key].to === endpoint,
    );
    if (i < 0) throw new Error("Unfold cannot form a single loop.");
    const key = remaining.splice(i, 1)[0],
      edge = next.segments[key];
    ordered.push(key);
    endpoint = edge.from === endpoint ? edge.to : edge.from;
  }
  source.stitchingOutline = orderedOutline(next, ordered);
  source.rootSegmentId = ordered[0];
  source.internalPaths.push(...other.internalPaths);
  const s = source.sewing!,
    t = other.sewing!;
  delete s.edges[edgeId];
  delete t.edges[otherFold];
  s.edges = { ...s.edges, ...t.edges };
  s.paths = { ...s.paths, ...t.paths };
  s.notches = [
    ...s.notches.filter((n) => n.segmentId !== edgeId),
    ...t.notches.filter((n) => n.segmentId !== otherFold),
  ];
  const frame = composeTransform(
    {
      a: source.transform.a,
      b: source.transform.c,
      c: source.transform.b,
      d: source.transform.d,
      e:
        -source.transform.a * source.transform.e -
        source.transform.b * source.transform.f,
      f:
        -source.transform.c * source.transform.e -
        source.transform.d * source.transform.f,
    },
    other.transform,
  );
  s.marks = [
    ...s.marks.filter((m) => m.segmentId !== edgeId),
    ...t.marks
      .filter((m) => m.segmentId !== otherFold)
      .map((m) => {
        const angle = (m.rotation * Math.PI) / 180;
        return {
          ...m,
          position: inverseTransform(
            source.transform,
            applyTransform(other.transform, m.position),
          ),
          rotation:
            (Math.atan2(
              frame.b * Math.cos(angle) + frame.d * Math.sin(angle),
              frame.a * Math.cos(angle) + frame.c * Math.sin(angle),
            ) *
              180) /
            Math.PI,
        };
      }),
  ];
  s.darts.push(
    ...t.darts.map((d) => {
      const angle = ((d.rotation + 90) * Math.PI) / 180;
      return {
        ...d,
        center: applyTransform(frame, d.center),
        rotation:
          (Math.atan2(
            frame.b * Math.cos(angle) + frame.d * Math.sin(angle),
            frame.a * Math.cos(angle) + frame.c * Math.sin(angle),
          ) *
            180) /
            Math.PI -
          90,
      };
    }),
  );
  source.metadata = { ...source.metadata, onFold: false, mirroredPair: false };
  delete next.pieces[other.id];
  return documentSchema.parse(next);
}
