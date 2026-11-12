import type { PatternDocument } from "./schema";
import { pieceEdges } from "./pieces";
export function pieceForItem(doc: PatternDocument, id: string) {
  return Object.values(doc.pieces).find((piece) =>
    pieceEdges(doc, piece).some((edgeId) => {
      const edge = doc.segments[edgeId];
      return edgeId === id || edge?.from === id || edge?.to === id;
    }),
  );
}
export function itemEditable(doc: PatternDocument, id: string): boolean {
  const piece = pieceForItem(doc, id);
  return !piece || (piece.visible && !piece.locked);
}
export function itemVisible(doc: PatternDocument, id: string): boolean {
  const piece = pieceForItem(doc, id);
  if (!piece) return true;
  if (!piece.visible) return false;
  if (
    piece.stitchingOutline.some((ref) => {
      const e = doc.segments[ref.segmentId];
      return ref.segmentId === id || e?.from === id || e?.to === id;
    })
  )
    return true;
  const path = piece.internalPaths.find((p) =>
    p.edges.some((ref) => {
      const e = doc.segments[ref.segmentId];
      return ref.segmentId === id || e?.from === id || e?.to === id;
    }),
  );
  return !path || piece.sewing?.paths[path.id]?.visible !== false;
}
export function visibleDocument(doc: PatternDocument): PatternDocument {
  if (
    Object.values(doc.pieces).every(
      (piece) =>
        piece.visible &&
        !Object.values(piece.sewing?.paths ?? {}).some((path) => !path.visible),
    )
  )
    return doc;
  const segments = Object.fromEntries(
    Object.entries(doc.segments).filter(([id]) => itemVisible(doc, id)),
  );
  const visiblePoints = new Set(
    Object.values(segments).flatMap((edge) => [edge.from, edge.to]),
  );
  return {
    ...doc,
    segments,
    points: Object.fromEntries(
      Object.entries(doc.points).filter(
        ([id]) => visiblePoints.has(id) || !pieceForItem(doc, id),
      ),
    ),
  };
}
