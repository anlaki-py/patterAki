import { visibleDocument } from "../document/pieceAccess";
import { pieceOutlinePath } from "../document/piecePaths";
import type { PatternDocument, PatternPiece } from "../document/schema";
import { cutPath } from "../document/seamAllowance";
import { segmentPath } from "../document/segments";

type InternalPath = PatternPiece["internalPaths"][number];

function prepareGeometry(source: PatternDocument) {
  const doc = visibleDocument(source);
  const owners = new Map<string, PatternPiece>();
  const internalPaths = new Map<string, InternalPath>();
  const outlinePoints = new Set<string>();
  // Match pieceForItem's first-owner semantics, including shared endpoints.
  for (const piece of Object.values(doc.pieces)) {
    const register = (edgeId: string, outline: boolean) => {
      if (!owners.has(edgeId)) owners.set(edgeId, piece);
      const edge = doc.segments[edgeId];
      if (!edge) return;
      for (const id of [edge.from, edge.to]) {
        if (!owners.has(id)) owners.set(id, piece);
        if (outline && owners.get(id) === piece) outlinePoints.add(id);
      }
    };
    for (const ref of piece.stitchingOutline) register(ref.segmentId, true);
    for (const path of piece.internalPaths)
      for (const ref of path.edges) {
        register(ref.segmentId, false);
        if (!internalPaths.has(ref.segmentId))
          internalPaths.set(ref.segmentId, path);
      }
  }
  const pieces = Object.values(doc.pieces)
    .filter((piece) => piece.visible)
    .map((piece) => ({ piece, outline: pieceOutlinePath(doc, piece) }));
  const paths = new Map(
    Object.values(doc.segments).map((edge) => [
      edge.id,
      segmentPath(doc, edge),
    ]),
  );
  const cuts = new Map<string, string | null>();
  return {
    doc,
    pieces,
    owners: owners as ReadonlyMap<string, PatternPiece>,
    internalPaths: internalPaths as ReadonlyMap<string, InternalPath>,
    outlinePoints: outlinePoints as ReadonlySet<string>,
    paths: paths as ReadonlyMap<string, string>,
    cut(pieceId: string) {
      // Stitch-only view never needs offsets. Invalid previews stay omitted;
      // the inspector reports their issue, and a new document retries them.
      if (!cuts.has(pieceId)) {
        try {
          cuts.set(pieceId, cutPath(doc, doc.pieces[pieceId]));
        } catch {
          cuts.set(pieceId, null);
        }
      }
      return cuts.get(pieceId) ?? null;
    },
  };
}

// Documents are immutable. Weak keys let abandoned previews/history be collected;
// no viewport or derived data is attached to documents or persisted.
const cache = new WeakMap<
  PatternDocument,
  ReturnType<typeof prepareGeometry>
>();
export function preparedGeometry(doc: PatternDocument) {
  let result = cache.get(doc);
  if (!result) {
    result = prepareGeometry(doc);
    cache.set(doc, result);
  }
  return result;
}
