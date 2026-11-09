import {
  contourSegmentsFor,
  documentCycles,
  type ContourCycle,
} from "./contourValidation";
import { validateContourSegments } from "../geometry/contourValidation";
import type { PatternDocument, PatternPiece } from "./schema";

/** Find a closed, unbranched existing contour containing the given edge. */
export function closedCycleForEdge(
  doc: PatternDocument,
  edgeId: string,
): ContourCycle | undefined {
  if (!doc.segments[edgeId]) return undefined;
  return documentCycles(doc).find((cycle) => cycle.segmentIds.includes(edgeId));
}

export function pieceEdges(
  doc: PatternDocument,
  piece: PatternPiece,
): string[] {
  const cycle = closedCycleForEdge(doc, piece.rootSegmentId);
  return cycle?.segmentIds ?? [];
}

export function pieceForEdge(
  doc: PatternDocument,
  edgeId: string,
): PatternPiece | undefined {
  if (!doc.segments[edgeId]) return undefined;
  const cycle = closedCycleForEdge(doc, edgeId);
  if (!cycle) return undefined;
  return Object.values(doc.pieces).find((piece) =>
    cycle.segmentIds.includes(piece.rootSegmentId),
  );
}

/** Explicit conversion: no automatic piece inference on migration/open. */
export function createPieceFromEdge(
  doc: PatternDocument,
  edgeId: string,
  pieceId: string,
  name = `Piece ${Object.keys(doc.pieces).length + 1}`,
): PatternDocument {
  if (
    !pieceId ||
    doc.points[pieceId] ||
    doc.segments[pieceId] ||
    doc.annotations[pieceId] ||
    doc.guides[pieceId] ||
    doc.pieces[pieceId]
  )
    throw new Error("The new piece ID is missing or already in use.");
  if (!name.trim() || name.trim().length > 120)
    throw new Error("Enter a piece name between 1 and 120 characters.");
  const cycle = closedCycleForEdge(doc, edgeId);
  if (!cycle || cycle.segmentIds.length < 3)
    throw new Error(
      "Select an edge from an unbranched closed contour to create a piece.",
    );
  const valid = validateContourSegments(
    contourSegmentsFor(doc, cycle.segmentIds),
  );
  if (!valid.valid)
    throw new Error(
      "This contour is invalid; repair it before creating a piece.",
    );
  if (cycle.segmentIds.some((id) => pieceForEdge(doc, id)))
    throw new Error("This closed contour is already a pattern piece.");
  return {
    ...doc,
    pieces: {
      ...doc.pieces,
      [pieceId]: { id: pieceId, name: name.trim(), rootSegmentId: edgeId },
    },
  };
}

/** Expand edge hits into entire pieces; loose edges remain individually editable. */
export function expandPieceSelection(
  doc: PatternDocument,
  ids: string[],
): string[] {
  const selected = new Set<string>();
  for (const id of ids) {
    const piece = pieceForEdge(doc, id);
    for (const member of piece ? pieceEdges(doc, piece) : [id])
      selected.add(member);
  }
  return [...selected];
}

/** Shift-click toggles all of a piece, rather than just its clicked edge. */
export function clickPieceSelection(
  doc: PatternDocument,
  selected: string[],
  id: string,
  additive: boolean,
): string[] {
  const members = expandPieceSelection(doc, [id]);
  if (!additive)
    return members.every((member) => selected.includes(member))
      ? selected
      : members;
  const hadAll = members.every((member) => selected.includes(member));
  const next = new Set(selected);
  for (const member of members) {
    if (hadAll) next.delete(member);
    else next.add(member);
  }
  return [...next];
}

/** Remove identities only when an explicit topology operation breaks a cycle. */
export function withoutBrokenPieces(doc: PatternDocument): PatternDocument {
  const cycles = documentCycles(doc);
  const pieces = Object.fromEntries(
    Object.entries(doc.pieces).filter(([, piece]) => {
      const cycle = cycles.find((item) =>
        item.segmentIds.includes(piece.rootSegmentId),
      );
      return (
        !!cycle &&
        validateContourSegments(contourSegmentsFor(doc, cycle.segmentIds)).valid
      );
    }),
  );
  return { ...doc, pieces };
}
