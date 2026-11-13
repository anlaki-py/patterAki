import { cubicParameterAtLength } from "../geometry/bezier";
import type { Vec2 } from "../geometry/line";
import { applyTransform, type RigidTransform } from "./pieceTransforms";
import { asCubic, segmentLength, segmentPoint } from "./segments";
import {
  documentSchema,
  type PatternDocument,
  type PatternPiece,
} from "./schema";
import { emptySewing, type Sewing } from "./sewingSchema";
export function updateSewing(
  doc: PatternDocument,
  pieceId: string,
  change: (s: Sewing) => Sewing,
) {
  const p = doc.pieces[pieceId];
  if (!p || p.locked || !p.visible)
    throw new Error("Choose a visible, unlocked piece.");
  const sewing = change(structuredClone(p.sewing ?? emptySewing()));
  return documentSchema.parse({
    ...doc,
    pieces: {
      ...doc.pieces,
      [pieceId]: {
        ...p,
        sewing,
        metadata: {
          ...p.metadata,
          onFold:
            Object.values(sewing.edges).some((e) => e.role === "fold") ||
            p.metadata.onFold,
        },
      },
    },
  });
}
export function edgeAllowance(
  piece: PatternPiece,
  segmentId: string,
  defaultMm: number,
) {
  const edge = piece.sewing?.edges[segmentId];
  return edge?.allowanceMm ?? (edge?.role === "fold" ? 0 : defaultMm);
}
export function inverseTransform(m: RigidTransform, p: Vec2): Vec2 {
  return {
    x: m.a * (p.x - m.e) + m.b * (p.y - m.f),
    y: m.c * (p.x - m.e) + m.d * (p.y - m.f),
  };
}
export function notchPoint(
  doc: PatternDocument,
  notch: Sewing["notches"][number],
) {
  const edge = doc.segments[notch.segmentId];
  const t =
    edge.kind === "cubic"
      ? cubicParameterAtLength(
          asCubic(doc, edge),
          segmentLength(doc, edge) * notch.fraction,
        )
      : notch.fraction;
  const p = segmentPoint(doc, edge, t);
  const a = segmentPoint(doc, edge, Math.max(0, t - 0.00001));
  const b = segmentPoint(doc, edge, Math.min(1, t + 0.00001));
  return {
    position: p,
    rotation: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
  };
}
export function dartPoints(dart: Sewing["darts"][number]) {
  const radians = (dart.rotation * Math.PI) / 180;
  const at = (x: number, y: number) => ({
    x: dart.center.x + x * Math.cos(radians) - y * Math.sin(radians),
    y: dart.center.y + x * Math.sin(radians) + y * Math.cos(radians),
  });
  return {
    legA: at(-dart.intakeMm / 2, 0),
    legB: at(dart.intakeMm / 2, 0),
    apex: at(0, dart.depthMm),
  };
}
export function resolvedMark(
  doc: PatternDocument,
  piece: PatternPiece,
  mark: Sewing["marks"][number],
) {
  if (mark.segmentId) {
    const n = notchPoint(doc, {
      segmentId: mark.segmentId,
      fraction: mark.fraction ?? 0.5,
      id: mark.id,
      style: "single",
      depthMm: 1,
    });
    return { ...mark, position: n.position, rotation: n.rotation };
  }
  const start = applyTransform(piece.transform, mark.position);
  const r = (mark.rotation * Math.PI) / 180;
  const end = applyTransform(piece.transform, {
    x: mark.position.x + Math.cos(r),
    y: mark.position.y + Math.sin(r),
  });
  return {
    ...mark,
    position: start,
    rotation: (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI,
  };
}
/** Reassign semantic arc fractions after a split, including splits of cubics. */
export function splitSewing(
  piece: PatternPiece,
  original: string,
  added: string,
  fraction: number,
): PatternPiece {
  if (!piece.sewing) return piece;
  const s = structuredClone(piece.sewing);
  if (s.edges[original]) s.edges[added] = { ...s.edges[original] };
  s.notches = s.notches.map((n) =>
    n.segmentId !== original
      ? n
      : n.fraction <= fraction
        ? { ...n, fraction: n.fraction / fraction }
        : {
            ...n,
            segmentId: added,
            fraction: (n.fraction - fraction) / (1 - fraction),
          },
  );
  s.marks = s.marks.map((mark) => {
    if (mark.segmentId !== original) return mark;
    const position = mark.fraction ?? 0.5;
    return position <= fraction
      ? { ...mark, fraction: position / fraction }
      : {
          ...mark,
          segmentId: added,
          fraction: (position - fraction) / (1 - fraction),
        };
  });
  return { ...piece, sewing: s };
}
/** Convert an explicitly selected legacy mark without losing its text or world direction. */
export function attachAnnotation(
  doc: PatternDocument,
  pieceId: string,
  annotationId: string,
  recordId: string,
  edgeId?: string,
) {
  const piece = doc.pieces[pieceId],
    mark = doc.annotations[annotationId];
  if (!piece || !mark || (mark.kind !== "grainline" && mark.kind !== "fold"))
    throw new Error(
      "Select a grainline or fold mark and choose its parent piece.",
    );
  const angle = (mark.rotation * Math.PI) / 180;
  const x =
      piece.transform.a * Math.cos(angle) + piece.transform.b * Math.sin(angle),
    y =
      piece.transform.c * Math.cos(angle) + piece.transform.d * Math.sin(angle);
  const next = updateSewing(doc, pieceId, (s) => {
    s.marks.push({
      id: recordId,
      kind: mark.kind,
      position: inverseTransform(piece.transform, mark.position),
      rotation: (Math.atan2(y, x) * 180) / Math.PI,
      lengthMm: mark.lengthMm,
      label: mark.label,
      ...(mark.kind === "grainline" && mark.labelPosition
        ? { labelPosition: mark.labelPosition }
        : {}),
      fontSizeMm: mark.fontSizeMm,
      ...(edgeId ? { segmentId: edgeId } : {}),
    });
    if (mark.kind === "fold" && edgeId) s.edges[edgeId] = { role: "fold" };
    return s;
  });
  const annotations = { ...next.annotations };
  delete annotations[annotationId];
  return documentSchema.parse({ ...next, annotations });
}
